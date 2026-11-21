#!/usr/bin/env python3
"""
内容块 payload 形状审计
========================

平台前端每个 Block 类型都从**固定的 payload 键**里取内容
（``text`` → ``body``，``code`` → ``code``，``callout`` → ``body`` …）。
数据里键名一旦对不上，那个块就渲染成**一片空白**——不报错、不报错，
只是看不见。

这个脚本把所有课程的所有块跑一遍，按「前端会读哪个键」核对：

* 键不存在 → 报「缺键」；
* 键存在但内容为空 → 报「空内容」；
* 键名是历史遗留的别名（``content`` / ``text``）→ 报「别名」并可自动归一。

用法::

    # 只审计
    backend/.venv/bin/python scripts/audit_block_payloads.py

    # 审计并把别名归一成规范键名
    backend/.venv/bin/python scripts/audit_block_payloads.py --fix
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

COURSES_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "courses"

#: block type → (前端读取的 payload 键, 合法别名)。
#:
#: 与 ``web/components/learning/BlockRenderer.tsx`` 一一对应。
EXPECTED_KEYS: dict[str, tuple[str, tuple[str, ...]]] = {
    "text": ("body", ("content", "text")),
    "callout": ("body", ("content", "text")),
    "code": ("code", ()),
    "quiz": ("questions", ()),
    "flash_cards": ("cards", ()),
    "section": ("intro", ("subsections", "key_takeaway")),
}

#: 不做形状检查的类型——它们要么由前端兜底渲染，要么本就是原样透传。
SKIP_TYPES = frozenset(
    {
        "user_note",
        "figure",
        "interactive",
        "animation",
        "timeline",
        "deep_dive",
        "concept_graph",
        "diagnostic",
        "pretest",
        "retrieval_practice",
        "error_diagnosis",
        "module_test",
        "progress_dashboard",
    }
)


def audit_course(path: Path) -> tuple[list[str], list[tuple[str, dict[str, Any]]]]:
    """审计一门课。

    返回 ``(问题列表, 需要修复的块)``。
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    problems: list[str] = []
    fixes: list[tuple[str, dict[str, Any]]] = []

    pages = payload.get("pages")
    if not isinstance(pages, list):
        return [f"{path.name}: 没有 pages 数组"], fixes

    for page in pages:
        page_title = str(page.get("title") or page.get("id") or "?")
        for block in page.get("blocks") or []:
            block_type = str(block.get("type") or "")
            if block_type in SKIP_TYPES:
                continue

            spec = EXPECTED_KEYS.get(block_type)
            if spec is None:
                problems.append(f"{path.name} / {page_title} / {block.get('id')}: 未知类型 {block_type}")
                continue

            key, aliases = spec
            data = block.get("payload")
            if not isinstance(data, dict):
                problems.append(f"{path.name} / {page_title} / {block.get('id')}: payload 不是对象")
                continue

            if key in data:
                value = data[key]
                if isinstance(value, str) and not value.strip():
                    problems.append(
                        f"{path.name} / {page_title} / {block.get('id')}: {block_type} 的 {key} 是空字符串"
                    )
                elif isinstance(value, list) and not value:
                    problems.append(
                        f"{path.name} / {page_title} / {block.get('id')}: {block_type} 的 {key} 是空数组"
                    )
                continue

            # 键不在 → 看是不是别名。
            alias = next((name for name in aliases if name in data), "")
            if alias:
                problems.append(
                    f"{path.name} / {page_title} / {block.get('id')}: "
                    f"{block_type} 用了别名 {alias}，前端只读 {key} → 渲染为空白"
                )
                fixes.append((f"{path.name} / {page_title} / {block.get('id')}", {**block, "__alias__": alias, "__target__": key}))
            else:
                problems.append(
                    f"{path.name} / {page_title} / {block.get('id')}: "
                    f"{block_type} 缺少 {key} → 渲染为空白"
                )

    return problems, fixes


def apply_fixes(path: Path, fixes: list[tuple[str, dict[str, Any]]]) -> int:
    """把别名键名归一成规范键名，并就地写回。"""
    payload = json.loads(path.read_text(encoding="utf-8"))
    index = {
        str(block.get("id")): block
        for page in payload.get("pages") or []
        for block in page.get("blocks") or []
    }

    changed = 0
    for _, block in fixes:
        target = index.get(str(block.get("id")))
        if target is None:
            continue
        alias = block["__alias__"]
        key = block["__target__"]
        data = target.get("payload") or {}
        if alias in data and key not in data:
            data[key] = data.pop(alias)
            target["payload"] = data
            changed += 1

    if changed:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description="审计课程内容块的 payload 形状。")
    parser.add_argument("--fix", action="store_true", help="把别名键名归一成规范键名")
    args = parser.parse_args()

    files = sorted(p for p in COURSES_DIR.glob("*.json") if p.name != "template-schema.json")
    if not files:
        print("没有找到课程文件", file=sys.stderr)
        return 1

    total_problems = 0
    for path in files:
        problems, fixes = audit_course(path)
        if not problems:
            print(f"✅ {path.name}")
            continue

        total_problems += len(problems)
        print(f"⚠ {path.name}：{len(problems)} 处问题")
        for problem in problems[:20]:
            print(f"    - {problem}")
        if len(problems) > 20:
            print(f"    …还有 {len(problems) - 20} 处")

        if args.fix and fixes:
            changed = apply_fixes(path, fixes)
            print(f"    → 已归一 {changed} 个块的键名")

    print()
    if total_problems:
        print(f"合计 {total_problems} 处问题" + ("（已尝试修复）" if args.fix else "，加 --fix 可自动修复别名"))
        return 1
    print("所有课程的块形状都正确。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
