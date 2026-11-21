#!/usr/bin/env python3
"""
生成繁体 → 简体对照表
======================

标签词表是简体的（「云对雨」），而教材原文大多是繁体的（「雲對雨」）。
不归一的话词表永远命中不了，标签会退化成一堆没意义的原文片段。

本脚本从 OpenCC 的 ``TSCharacters.txt`` 取权威对照表，再用**课程语料里
真实出现过的字**裁剪——5000 多字的完整表对本项目是浪费。

用法::

    curl -sL https://raw.githubusercontent.com/BYVoid/OpenCC/master/\\
        data/dictionary/TSCharacters.txt -o /tmp/ts.txt

    backend/.venv/bin/python scripts/build_t2s_table.py
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

#: OpenCC 的字符级对照表。
OPENCC_URL = (
    "https://raw.githubusercontent.com/BYVoid/OpenCC/master/"
    "data/dictionary/TSCharacters.txt"
)

#: 下载到的原始表。
SOURCE_FILE = Path("/tmp/ts.txt")

#: 生成的模块。
OUTPUT = (
    Path(__file__).resolve().parent.parent
    / "backend"
    / "app"
    / "services"
    / "_t2s_table.py"
)

#: 课程语料目录。
COURSES_DIR = (
    Path(__file__).resolve().parent.parent / "backend" / "data" / "courses"
)

HEADER = '''"""
繁体 → 简体字符对照
========================

只覆盖**语料里真实出现过的繁体字**——教材原文（国学经典、
Wikisource 抓取）大多是繁体，而标签词表是简体。不归一的话，
词表永远命中不了，标签会退化成一堆没意义的原文片段。

对照表来自 OpenCC 的 ``TSCharacters.txt``（Apache-2.0），
经语料裁剪后只保留实际用到的字，避免背一个 5000 字的大表。

重新生成：

.. code-block:: bash

    curl -sL https://raw.githubusercontent.com/BYVoid/OpenCC/master/\\
        data/dictionary/TSCharacters.txt -o /tmp/ts.txt

    backend/.venv/bin/python scripts/build_t2s_table.py
"""

from __future__ import annotations

#: 繁体字 → 简体字。只含语料中实际出现的字。
T2S: dict[str, str] = {
'''


def load_source() -> dict[str, str]:
    """读 OpenCC 对照表。"""
    if not SOURCE_FILE.exists():
        print(
            f"找不到 {SOURCE_FILE}。请先下载：\n  curl -sL {OPENCC_URL} -o {SOURCE_FILE}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    pairs: dict[str, str] = {}
    for line in SOURCE_FILE.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        traditional, simplified = parts[0], parts[1].split(" ")[0]
        if len(traditional) == 1 and len(simplified) == 1 and traditional != simplified:
            pairs[traditional] = simplified
    return pairs


def corpus_chars() -> set[str]:
    """语料里出现过的所有字符。"""
    chars: set[str] = set()
    for path in COURSES_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for page in data.get("pages") or []:
            for block in page.get("blocks") or []:
                payload = block.get("payload") or {}
                for key in ("body", "content", "intro", "code", "explanation"):
                    value = payload.get(key)
                    if isinstance(value, str):
                        chars.update(value)
    return chars


def main() -> int:
    pairs = load_source()
    chars = corpus_chars()
    needed = {t: s for t, s in pairs.items() if t in chars}

    lines = [HEADER]
    for traditional, simplified in sorted(needed.items()):
        lines.append(f'    "{traditional}": "{simplified}",')
    lines.append("}")
    lines.append("")
    lines.append('__all__ = ["T2S", "to_simplified"]')
    lines.append("")

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"总表 {len(pairs)} 字 → 语料相关 {len(needed)} 字")
    print(f"已写入 {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
