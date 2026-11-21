#!/usr/bin/env python3
"""
存量课程数据的繁简归一化
========================

平台在**写盘那一刻**就会做繁体转简体（见
``backend/app/services/course_service.py`` 的 ``_write``）。但历史上
已经落盘的数据是在这个机制之前导入的——里面还带着繁体字。

这个脚本把已有课程重新归一化一遍：

* 繁体 → 简体（OpenCC，词组级；
* 清掉零宽字符与双向控制符；
* 压缩多余空白。

用法::

    # 先看会改什么（不写盘）
    python scripts/renormalize_courses.py --dry-run

    # 实际执行
    python scripts/renormalize_courses.py

    # 只处理某几门
    python scripts/renormalize_courses.py --only classic_lunyu_01

脚本是**幂等**的：已经干净的数据跑一遍不会有任何变化。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.services.text_normalize import (  # noqa: E402
    is_traditional,
    normalize_payload,
)

COURSES_DIR = ROOT / "backend" / "data" / "courses"

#: 结构模板不是课程，跳过。
SKIP_NAMES = {"template-schema.json"}


def course_texts(payload: dict) -> str:
    """抽出课程里所有正文，拼成一段用于检测。"""
    parts: list[str] = []
    for page in payload.get("pages", []):
        for block in page.get("blocks", []):
            block_payload = block.get("payload") or {}
            for key in ("body", "intro", "content", "code", "explanation"):
                value = block_payload.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(value)
            for key in ("cards", "questions", "subsections"):
                for item in block_payload.get(key) or []:
                    if isinstance(item, dict):
                        for value in item.values():
                            if isinstance(value, str):
                                parts.append(value)
                    elif isinstance(item, str):
                        parts.append(item)
    title = str((payload.get("book") or {}).get("title") or "")
    return " ".join([title, *parts])


def main() -> int:
    parser = argparse.ArgumentParser(
        description="把存量课程的繁体正文转成简体（幂等）。",
    )
    parser.add_argument("--only", default="", help="只处理指定课程 id，逗号分隔")
    parser.add_argument("--dry-run", action="store_true", help="只报告，不写盘")
    args = parser.parse_args()

    only = {item.strip() for item in args.only.split(",") if item.strip()}
    if not COURSES_DIR.exists():
        print(f"✗ 找不到课程目录：{COURSES_DIR}", file=sys.stderr)
        return 1

    changed = 0
    scanned = 0
    failures: list[str] = []

    for path in sorted(COURSES_DIR.glob("*.json")):
        if path.name in SKIP_NAMES:
            continue
        course_id = path.stem
        if only and course_id not in only:
            continue

        scanned += 1
        try:
            original = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"✗ {path.name}：JSON 解析失败（{exc}）", file=sys.stderr)
            failures.append(course_id)
            continue

        sample = course_texts(original)
        had_traditional = is_traditional(sample)

        normalized = normalize_payload(original)
        after = course_texts(normalized)
        still_traditional = is_traditional(after)

        # 归一化会重排键序吗？不会——dict 保序。但它会改变字符串内容。
        actually_changed = json.dumps(
            original, ensure_ascii=False, sort_keys=True
        ) != json.dumps(normalized, ensure_ascii=False, sort_keys=True)

        if not actually_changed:
            print(f"· {course_id:32s} 已是简体，无需改动")
            continue

        changed += 1
        status = "✓ 已转简体" if not still_traditional else "⚠ 仍有繁体"
        print(
            f"{status} {course_id:32s} "
            f"繁体原文={'是' if had_traditional else '否'} "
            f"繁体残留={'是' if still_traditional else '否'}"
        )

        if args.dry_run:
            continue

        path.write_text(
            json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print()
    if args.dry_run:
        print(f"(dry-run) 扫描 {scanned} 门，{changed} 门会有变化，未写盘。")
    else:
        print(f"✓ 扫描 {scanned} 门，改写 {changed} 门。")
        print("提示：平台会自动加载新数据，无需重启后端。")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
