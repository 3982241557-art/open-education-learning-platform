#!/usr/bin/env python3
"""
中英对照预处理
==============

给英文教材生成中文译文，写进课程 JSON 的 ``payload.translation`` 字段，
前端据此渲染「英文在上、中文在下」的双语排版。

为什么要**预处理**而不是前端实时调
--------------------------------

前端实时翻译意味着每翻一页就发一次模型请求——延迟以秒计，而且
同一份译文会被反复翻译（浪费 token 与费用）。预处理把成本压到
「导入时一次」，之后零延迟。

用法::

    # 扫描哪些课需要翻译（不调模型）
    python scripts/build_bilingual.py --scan

    # 翻译所有需要翻译的课
    python scripts/build_bilingual.py

    # 只翻译某一门
    python scripts/build_bilingual.py --only oer_newton_01

    # 强制重翻（忽略缓存）
    python scripts/build_bilingual.py --force

译文按「正文哈希」缓存——正文没变就不会重复消耗模型调用。
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.services.bilingual_service import (  # noqa: E402
    course_block_texts,
    course_needs_translation,
    translate_course,
)
from app.services.env_loader import load_env  # noqa: E402

# 必须先加载 ``backend/.env``——模型密钥在那个文件里，而加载动作
# 平时只在 ``app.main`` 的导入期发生。脚本绕过了 main，因此这里
# 显式加载一次，否则每次翻译都会报「尚未配置模型密钥」。
load_env()

COURSES_DIR = ROOT / "backend" / "data" / "courses"
SKIP_NAMES = {"template-schema.json"}


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="给英文教材生成中英对照译文。",
    )
    parser.add_argument("--only", default="", help="只处理指定课程 id，逗号分隔")
    parser.add_argument("--scan", action="store_true", help="只扫描，不调用模型")
    parser.add_argument("--force", action="store_true", help="忽略缓存，强制重翻")
    args = parser.parse_args()

    only = {item.strip() for item in args.only.split(",") if item.strip()}
    if not COURSES_DIR.exists():
        print(f"✗ 找不到课程目录：{COURSES_DIR}", file=sys.stderr)
        return 1

    targets: list[tuple[Path, dict]] = []
    for path in sorted(COURSES_DIR.glob("*.json")):
        if path.name in SKIP_NAMES:
            continue
        course_id = path.stem
        if only and course_id not in only:
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        targets.append((path, payload))

    pending = [
        (path, payload)
        for path, payload in targets
        if course_needs_translation(payload)
    ]

    print(f"▶ 扫描 {len(targets)} 门课，{len(pending)} 门需要中英对照\n")
    for path, payload in pending:
        blocks = course_block_texts(payload)
        print(f"── {path.stem}：{len(blocks)} 个英文块")

    if args.scan:
        print("\n(scan) 未调用模型。")
        return 0

    if not pending:
        print("\n✓ 没有需要翻译的课程。")
        return 0

    total_translated = 0
    total_cached = 0
    failures: list[str] = []

    for path, payload in pending:
        course_id = path.stem
        print(f"\n── 翻译 {course_id}")

        def progress(message: str) -> None:
            print(f"   {message}")

        try:
            updated, translated, cached = await translate_course(
                payload,
                course_id=course_id,
                use_cache=not args.force,
                progress=progress,
            )
        except Exception as exc:
            print(f"   ✗ 失败：{exc}", file=sys.stderr)
            failures.append(course_id)
            continue

        print(f"   ✓ 新译 {translated} 块 · 命中缓存 {cached} 块")
        total_translated += translated
        total_cached += cached

        if translated == 0:
            continue

        path.write_text(
            json.dumps(updated, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"   ✓ 已写回 {path.name}")

    print(f"\n✓ 完成：新译 {total_translated} 块 · 缓存命中 {total_cached} 块")
    if failures:
        print(f"⚠ 失败：{'、'.join(failures)}", file=sys.stderr)

    print("提示：平台会自动加载新数据，无需重启后端。")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
