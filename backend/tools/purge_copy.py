#!/usr/bin/env python3
"""清洗面向用户的文案——把工程视角的说明换成学术导读。

这个脚本**只改用户能看到的文字**（title / description / summary /
subtitle / exploration_summary / tags / metadata.author）。代码注释、
schema 描述、字段名一律不动——那些是给开发者看的，本来就不该出现在
界面上。

之所以做成脚本而不是手工改：同一门课的数据在文件里会**存三份**
（``book`` 顶层、``spine``、``hub``），手工改必然漏。
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data" / "courses"

# ──────────────────────────────────────────────────────────────────────
# 逐门的完整改写
# ──────────────────────────────────────────────────────────────────────

COURSE_REWRITE: dict[str, dict] = {
    "interactive_video_demo": {
        "title": "微观经济学导论：稀缺性与机会成本",
        "description": (
            "从生活中的免费冰淇淋与渔夫交易模型出发，理解人类决策背后的"
            "机会成本与比较优势法则。课程用两个日常案例把「取舍」这件事讲透："
            "每一份资源都有代价，而分工正是让所有人越过自己代价线的原因。"
        ),
        "exploration_summary": (
            "一门关于「选择」的基础课。第一讲从免费冰淇淋的悖论入手，界定机会成本；"
            "第二讲把机会成本推到极致，解释为什么比较优势能让分工双方同时受益。"
        ),
        "tags": ["经济学", "机会成本", "比较优势", "公开课"],
        "author": "SEEK 公开课书系",
    },
    "philosophy_hub": {
        "title": "存在主义哲学：从荒谬到自由选择",
        "description": (
            "精读加缪与萨特的核心思想，探讨人在面对无意义的宇宙时，"
            "如何通过行动确立自我的本质。课程围绕「荒谬」「自由」「责任」"
            "三个关键词展开，兼顾存在主义的先驱克尔凯郭尔与尼采的思想背景。"
        ),
        "exploration_summary": (
            "两讲读懂存在主义。第一讲追问「荒谬」：当世界本身没有意义，"
            "人是如何仍然必须继续生活。第二讲处理「自由与责任」：自由不是被赠予的天赋，"
            "而是需要一个人独自承担下来的重负。"
        ),
        "tags": ["哲学", "存在主义", "加缪", "萨特"],
        "author": "SEEK 公开课书系",
    },
}

# ── 全局兜底：这些词在用户界面上必须消失 ──────────────────────────────
#
# 用**正则替换**而不是精确匹配——文案经常是长句，逐条列精确匹配
# 一定会漏。这里只做「去掉工程味」的最小改动，不重写整句。
BANNED_PATTERNS: list[tuple[str, str]] = [
    # 「流媒体交互式沙盘」这类机制名
    (r"流媒体交互式沙盘", "交互式课程"),
    (r"交互式沙盘", "交互式课程"),
    # 「不托管正文，只连接全网公开资源」这类架构说明
    (r"不托管正文，只连接全网公开资源。?", ""),
    (r"平台负责调度与陪读，不负责搬运。?", ""),
    (r"平台负责调度与陪读，不负责搬运", ""),
    # 「每个知识节点下面挂着若干条外链」
    (r"每个知识节点下面挂着若干条外链——?", "本课每一讲都配有"),
    # 「资源枢纽」
    (r"资源枢纽", "课程"),
    (r"全网资源连接枢纽", "全网公开课"),
    # 「知识点气泡」「知识气泡」
    (r"知识点气泡", "知识点提示"),
    (r"知识气泡", "知识点提示"),
    (r"气泡", "提示"),
    # 「右侧 AI」
    (r"右侧 AI", "AI 助教"),
    # 「节点」
    (r"知识节点", "知识点"),
    (r"节点", "知识点"),
    # 「外链」
    (r"外链资源", "参考资源"),
    (r"外链", "参考资源"),
    # 「演示 / 体验 / 测试」
    (r"演示「流媒体 → 知识点提示 → AI 陪读」的完整闭环。?", ""),
    (r"以真实公开课视频为载体，", ""),
    (r"公开课体验", "公开课导论"),
    (r"验证交互提示的触发时机", ""),
    (r"用于验证.*?时机", ""),
    (r"直链回放 · 可精确跳转", ""),
    (r"回放版本", "课程视频"),
]

# 空白与重复标点的收拾
_CLEANUP = [
    (r"\s{2,}", " "),
    (r"（\s*）", ""),
    (r"·\s*·", "·"),
    (r"^[\s·、，,。;；:：-]+", ""),
    (r"[\s·、，,。;；:：-]+$", ""),
]


def scrub(text: str) -> str:
    """把一段文案里的工程黑话洗掉。"""
    if not isinstance(text, str) or not text:
        return text
    out = text
    for pattern, replacement in BANNED_PATTERNS:
        out = re.sub(pattern, replacement, out)
    for pattern, replacement in _CLEANUP:
        out = re.sub(pattern, replacement, out)
    return out.strip()


def rewrite_tags(tags, new_tags) -> list:
    """丢掉「流媒体 / 交互式」这类机制词，保留学科词。"""
    if not new_tags:
        return tags
    return list(new_tags)


def walk(node):
    """深度遍历所有 dict / list。"""
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk(item)


TEXT_FIELDS = (
    "title",
    "description",
    "summary",
    "subtitle",
    "exploration_summary",
    "ai_context",
    "context",
    "hint",
    "question",
)


def scrub_file(path: pathlib.Path, course_id: str) -> int:
    """清洗一个课程文件。"""
    data = json.loads(path.read_text(encoding="utf-8"))
    rewrite = COURSE_REWRITE.get(course_id, {})
    changed = 0

    # 课程**身份**字段只在顶层结构上改写。
    #
    # 为什么不能「凡是 title 就改」：同一门课的章节、页面、知识点也
    # 叫 title——它们有各自的、具体的名字（「什么是机会成本？」），
    # 用课程名去覆盖它们，目录会变得一整页都叫同一个标题。
    #
    # 所以这里按**已知的容器键**定位，而不是按字段名。
    identity = rewrite

    def apply_identity(node: dict) -> None:
        nonlocal changed
        for field, value in identity.items():
            if field in node and isinstance(node[field], str):
                if node[field] != value:
                    node[field] = value
                    changed += 1

    # 顶层 book / spine / hub 三个容器各自是「课程身份」。
    if isinstance(data.get("book"), dict):
        apply_identity(data["book"])
    if isinstance(data.get("spine"), dict):
        apply_identity(data["spine"])
    if isinstance(data.get("hub"), dict):
        apply_identity(data["hub"])

    for node in walk(data):
        # 再做通用清洗（只针对正文性文案，不碰标题）。
        for field in TEXT_FIELDS:
            if field in ("title",):
                continue
            value = node.get(field)
            if isinstance(value, str) and value:
                cleaned = scrub(value)
                if cleaned != value:
                    node[field] = cleaned
                    changed += 1

        # metadata 里的标签与作者名。
        meta = node.get("metadata")
        if isinstance(meta, dict):
            if "tags" in meta and rewrite.get("tags"):
                meta["tags"] = rewrite_tags(meta["tags"], rewrite["tags"])
            if "author" in meta and rewrite.get("author"):
                meta["author"] = rewrite["author"]

        # 顶层 tags 数组。
        if "tags" in node and isinstance(node["tags"], list) and rewrite.get("tags"):
            node["tags"] = rewrite_tags(node["tags"], rewrite["tags"])

    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return changed


def main() -> int:
    total = 0
    for course_id, rewrite in COURSE_REWRITE.items():
        path = DATA_ROOT / f"{course_id}.json"
        if not path.exists():
            print(f"跳过 {course_id}（文件不存在）")
            continue
        count = scrub_file(path, course_id)
        total += count
        print(f"{course_id}: 清洗 {count} 处")
    print(f"合计 {total} 处")
    return 0


if __name__ == "__main__":
    sys.exit(main())
