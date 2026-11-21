"""
通识教育分类体系
================

课程列表此前用的是「从课程 metadata 里自动聚合 category」的做法——那正是
分类混乱的根源：同一门课换个措辞就成了新分类，而「国学经典 / 古典文学」
这两个分类边界重叠，用户根本分不清。

这里把分类**固定为四大支柱**，并把「难度」从年龄暗示的等级制换成
**前置知识要求**。

为什么是四大支柱
----------------

通识教育的目的是让不同专业的学习者能互相看到对方的知识。因此分类轴
必须是**学科维度**，不能是难度维度——难度维度上「入门」和「高阶」
之间隔着一道隐形的门槛，而学科维度上没有门槛。

四支柱
------

======================  ====================================================
支柱                    覆盖范围
======================  ====================================================
``humanities``         人文经典 —— 国学、诗词、散文、史观、哲学文本
``science``            科学哲学 —— 物理、数学、宇宙观、自然科学史
``technology``         逻辑与技术 —— 编程、算法、方法论、形式系统
``society``            社会与文明 —— 宪章、法律、人权、制度与公共生活
======================  ====================================================

每门课可能同时属于多个支柱（比如《道德经》既是人文经典也是哲学文本）。
但**主归属只有一个**——列表页按主归属展示，避免一门课在三处重复出现。

前置知识
--------

不用「入门 / 进阶 / 高阶」——这三个词暗含年龄与圈层暗示，而且没有告诉
用户「我需要先会什么」。改用**前置知识要求**：

======================  ====================================================
要求                    含义
======================  ====================================================
``none``               无需前置，读得懂中文即可
``chinese``            需要能顺畅阅读文言文
``math``               需要基础的代数与几何
``code``               需要接触过任何一门编程语言
``science``            需要基础的物理与数学概念
======================  ====================================================
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True, slots=True)
class Pillar:
    """一个通识支柱。"""

    id: str
    name: str
    blurb: str


@dataclass(frozen=True, slots=True)
class Prerequisite:
    """一门课的前置知识要求。"""

    id: str
    label: str


#: 四大支柱。顺序即列表页的展示顺序。
PILLARS: tuple[Pillar, ...] = (
    Pillar("humanities", "人文经典", "国史、诗词、散文与哲思文本——语言的根。"),
    Pillar("science", "科学哲学", "物理、数学与自然——理解世界的骨架。"),
    Pillar("technology", "逻辑与技术", "编程、算法与方法论——把想法变成现实。"),
    Pillar("society", "社会与文明", "宪章、法律与公共生活——人如何与他人共处。"),
)

#: 前置知识要求。
PREREQUISITES: tuple[Prerequisite, ...] = (
    Prerequisite("none", "无需前置"),
    Prerequisite("chinese", "需读得懂文言"),
    Prerequisite("math", "需基础数理"),
    Prerequisite("code", "需接触过编程"),
    Prerequisite("science", "需基础科学概念"),
)

#: 支柱 id → 支柱对象。
PILLAR_BY_ID: dict[str, Pillar] = {pillar.id: pillar for pillar in PILLARS}

#: 前置要求 id → 前置对象。
PREREQUISITE_BY_ID: dict[str, Prerequisite] = {
    item.id: item for item in PREREQUISITES
}


#: 课程 id → (主支柱, 前置要求)。
#:
#: 显式列出而不是从 category 猜测——分类轴一旦靠猜，就会漂移。
COURSE_PLACEMENT: dict[str, tuple[str, str]] = {
    # 人文经典
    "classic_daodejing_01": ("humanities", "chinese"),
    "classic_lunyu_01": ("humanities", "chinese"),
    "classic_guwenguanzhi_01": ("humanities", "chinese"),
    "classic_poetry_01": ("humanities", "chinese"),
    "classic_tangshi300_01": ("humanities", "chinese"),
    "classic_shenglv_01": ("humanities", "chinese"),
    # 科学哲学
    "oer_newton_01": ("science", "science"),
    # 逻辑与技术
    "oer_python_01": ("technology", "none"),
    "demo_python101": ("technology", "none"),
    # 社会与文明
    "oer_udhr_01": ("society", "none"),
    # 公开课书系——按内容归位，而不是按文件来源归位。
    # 微观经济学讲的是稀缺性与取舍，属于「社会与文明」；
    # 存在主义哲学属于「人文经典」。
    "interactive_video_demo": ("society", "none"),
    "philosophy_hub": ("humanities", "none"),
}


def pillar_of(course_id: str, tags: Iterable[str] = ()) -> Pillar:
    """给一门课定位它的主支柱。

    优先用显式映射；没有映射时按标签推断，最后兜底到「人文经典」——
    宁可放错到一个人文支柱，也不要让课程从列表里消失。
    """
    placement = COURSE_PLACEMENT.get(course_id)
    if placement:
        pillar = PILLAR_BY_ID.get(placement[0])
        if pillar:
            return pillar

    tag_set = {str(tag) for tag in tags}
    if tag_set & {"编程", "计算机", "开源", "python"}:
        return PILLAR_BY_ID["technology"]
    if tag_set & {"物理", "数学", "经典科学", "宇宙"}:
        return PILLAR_BY_ID["science"]
    if tag_set & {"社科", "法律", "人权", "历史"}:
        return PILLAR_BY_ID["society"]
    return PILLAR_BY_ID["humanities"]


def prerequisite_of(course_id: str, tags: Iterable[str] = ()) -> Prerequisite:
    """给一门课定位它的前置知识要求。"""
    placement = COURSE_PLACEMENT.get(course_id)
    if placement:
        item = PREREQUISITE_BY_ID.get(placement[1])
        if item:
            return item

    tag_set = {str(tag) for tag in tags}
    if tag_set & {"编程", "计算机", "python"}:
        return PREREQUISITE_BY_ID["none"]
    if tag_set & {"物理", "数学", "经典科学"}:
        return PREREQUISITE_BY_ID["science"]
    if tag_set & {"文言文", "国学", "诗词"}:
        return PREREQUISITE_BY_ID["chinese"]
    return PREREQUISITE_BY_ID["none"]


def describe(course: dict[str, Any]) -> dict[str, Any]:
    """给一门课补上通识分类字段。

    返回新增的字段，调用方把它并进课程字典即可——不改动课程磁盘数据，
    因为分类是**呈现层**的决定，不该污染教材本身。
    """
    course_id = str(course.get("id") or "")
    metadata = course.get("metadata") or {}
    tags = course.get("tags")
    if not isinstance(tags, list):
        tags = metadata.get("tags") if isinstance(metadata, dict) else []
    if not isinstance(tags, list):
        tags = []

    pillar = pillar_of(course_id, tags)
    prerequisite = prerequisite_of(course_id, tags)

    return {
        "pillar": pillar.id,
        "pillar_name": pillar.name,
        "pillar_blurb": pillar.blurb,
        "prerequisite": prerequisite.id,
        "prerequisite_label": prerequisite.label,
        # 旧字段保留但置空——前端不再使用「入门/进阶/高阶」这套标签。
        "difficulty": "",
        "level": "",
    }


def catalog() -> dict[str, Any]:
    """给前端的分类目录。"""
    return {
        "pillars": [
            {
                "id": pillar.id,
                "name": pillar.name,
                "blurb": pillar.blurb,
            }
            for pillar in PILLARS
        ],
        "prerequisites": [
            {"id": item.id, "label": item.label} for item in PREREQUISITES
        ],
    }


__all__ = [
    "COURSE_PLACEMENT",
    "PILLARS",
    "PILLAR_BY_ID",
    "PREREQUISITES",
    "PREREQUISITE_BY_ID",
    "Pillar",
    "Prerequisite",
    "catalog",
    "describe",
    "pillar_of",
    "prerequisite_of",
]
