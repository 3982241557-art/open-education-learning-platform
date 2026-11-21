"""
资源发现与推荐
==============

「资源枢纽」如果只是个静态目录，就没有价值——用户得自己知道要找什么、
去哪里找。真正的枢纽应该**主动把对的东西递到手边**。

本模块提供三件事：

1. **跨课程资源总表** —— :func:`resource_catalog` 把所有资源枢纽型
   课程里的外链拍平成一张表。每条资源带上它的完整上下文（课程 / 主题
   / 节点），这样一张资源卡就能说清「这是什么、在哪、属于哪个问题」。
2. **过滤与检索** —— 按类型、来源平台、支柱、课程、关键词筛选。
3. **推荐** —— :func:`recommend` 给出一组「下一步值得看」的资源，并
   **说明理由**。

推荐为什么必须带理由
--------------------

一个没有理由的推荐列表等于随机列表。用户在资源枢纽里点开一条陌生
的外部链接，天然会问「我为什么要看这个」。所以每条推荐都带一条
``reason``——让推荐**可解释**。

推荐的排序依据也很朴素，全部来自**真实行为**：

* 这门课我学过，但这个节点下的资源我还没看 → 顺理成章的下一步；
* 我在学的课程里，这条资源是「默认资源」但从没打开过 → 补上；
* 同类资源（同一个来源平台）里我还没碰过的 → 拓展；
* 我完全没碰过的课程 → 探索。

**没有**「因为热���」这种理由——平台没有热度数据，也不该假装有。
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from app.services.course_service import COURSES_ROOT, Course, CourseError, get_course_service
from app.services.progress_service import course_progress, resource_stats
from app.services import taxonomy

#: 资源类型的中文名。
KIND_LABEL: dict[str, str] = {
    "video": "视频",
    "webpage": "网页",
    "document": "文档",
}

#: 一次请求最多返回多少条资源。
MAX_CATALOG_SIZE = 200

#: 一次推荐最多返回多少条。
MAX_RECOMMENDATIONS = 12


def _read_json(path: Path, default: Any) -> Any:
    try:
        if not path.exists():
            return default
        import json

        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _hub_courses() -> list[Course]:
    """列出全部资源枢纽型课程。

    只读磁盘上的课程文件——扫描规则与课程库完全一致（动态扩容）。
    """
    service = get_course_service()
    out: list[Course] = []
    for course in service.list_courses():
        if course.is_hub and course.resources:
            out.append(course)
    return out


def resource_catalog(
    *,
    query: str = "",
    resource_type: str = "",
    provider: str = "",
    pillar: str = "",
    course_id: str = "",
    only_unseen: bool = False,
    limit: int = MAX_CATALOG_SIZE,
) -> dict[str, Any]:
    """跨课程的资源总表（带过滤）。

    返回：

    * ``resources`` —— 资源记录列表；
    * ``facets`` —— 可用的筛选项（来源平台、类型、支柱、课程）及其计数，
      让前端能显示「维基百科 × 12」这样的真实分布，而不是硬编码选项。
    """
    needle = (query or "").strip().lower()

    rows: list[dict[str, Any]] = []
    type_counts: dict[str, int] = {}
    provider_counts: dict[str, int] = {}
    pillar_counts: dict[str, int] = {}
    course_counts: dict[str, int] = {}

    for course in _hub_courses():
        raw = _read_json(COURSES_ROOT / f"{course.id}.json", {})
        placement = taxonomy.describe(raw if isinstance(raw, dict) else course.to_dict())

        for item in resource_stats(raw if isinstance(raw, dict) else {}):
            item = dict(item)
            item["pillar"] = placement.get("pillar", "")
            item["pillar_name"] = placement.get("pillar_name", "")
            item["course_description"] = course.description
            rows.append(item)

    # ── 计数（过滤**之前**算——分面要反映全量分布） ───────────────
    for item in rows:
        kind = item["resource_type"]
        type_counts[kind] = type_counts.get(kind, 0) + 1
        prov = item["provider"] or "其他"
        provider_counts[prov] = provider_counts.get(prov, 0) + 1
        pil = item["pillar"] or "unclassified"
        pillar_counts[pil] = pillar_counts.get(pil, 0) + 1
        cid = item["course_id"]
        course_counts[cid] = course_counts.get(cid, 0) + 1

    # ── 过滤 ──────────────────────────────────────────────────────
    filtered = rows
    if resource_type:
        filtered = [r for r in filtered if r["resource_type"] == resource_type]
    if provider:
        filtered = [r for r in filtered if (r["provider"] or "其他") == provider]
    if pillar:
        filtered = [r for r in filtered if (r["pillar"] or "unclassified") == pillar]
    if course_id:
        filtered = [r for r in filtered if r["course_id"] == course_id]
    if only_unseen:
        filtered = [r for r in filtered if not r["seen"]]
    if needle:
        filtered = [
            r
            for r in filtered
            if needle in r["title"].lower()
            or needle in (r["provider"] or "").lower()
            or needle in r["course_title"].lower()
            or needle in r["topic_title"].lower()
            or needle in r["node_title"].lower()
            or needle in (r["ai_context"] or "").lower()
        ]

    # ── 排序：先按课程与节点顺序，再按标题 ─────────────────────────
    filtered.sort(
        key=lambda r: (r["course_title"], r["topic_title"], r["node_title"], r["title"])
    )

    total = len(filtered)
    capped = filtered[: max(1, min(limit, MAX_CATALOG_SIZE))]

    return {
        "resources": capped,
        "total": total,
        "facets": {
            "types": [
                {"id": kind, "label": KIND_LABEL.get(kind, kind), "count": count}
                for kind, count in sorted(type_counts.items(), key=lambda kv: -kv[1])
            ],
            "providers": [
                {"id": name, "label": name, "count": count}
                for name, count in sorted(provider_counts.items(), key=lambda kv: -kv[1])
            ],
            "pillars": [
                {
                    "id": pid,
                    "label": (
                        taxonomy.PILLAR_BY_ID[pid].name
                        if pid in taxonomy.PILLAR_BY_ID
                        else "未归类"
                    ),
                    "count": count,
                }
                for pid, count in sorted(pillar_counts.items(), key=lambda kv: -kv[1])
            ],
            "courses": [
                {"id": cid, "label": cid, "count": count}
                for cid, count in sorted(course_counts.items(), key=lambda kv: -kv[1])
            ],
        },
    }


def recommend(*, limit: int = MAX_RECOMMENDATIONS) -> dict[str, Any]:
    """给出「下一步值得看」的资源，并说明理由。

    依据全部来自**真实行为**——用户学过什么、看过什么。没有热度数据，
    也不假装有热度数据。
    """
    now = time.time()
    rows: list[dict[str, Any]] = []

    # 每门课的学情——用来判断「我在学哪门」。
    active_courses: set[str] = set()
    for course in _hub_courses():
        progress = course_progress(course.id)
        if float(progress.get("dwell_seconds") or 0) > 0 or progress.get("visited_pages"):
            active_courses.add(course.id)

    for course in _hub_courses():
        raw = _read_json(COURSES_ROOT / f"{course.id}.json", {})
        if not isinstance(raw, dict):
            continue
        placement = taxonomy.describe(raw)
        is_active = course.id in active_courses

        for item in resource_stats(raw):
            item = dict(item)
            item["pillar"] = placement.get("pillar", "")
            item["pillar_name"] = placement.get("pillar_name", "")

            # ── 打分 + 理由 ────────────────────────────────────────
            score = 0.0
            reasons: list[str] = []

            if item["seen"]:
                # 看过的资源不该再推——除非它标记了「待复习」，
                # 但平台没有那个信号，所以直接跳过。
                continue

            if is_active:
                score += 40.0
                reasons.append("你正在学这门课")

            if not item["opened"]:
                score += 8.0
                reasons.append("还没打开过")
            else:
                score += 2.0
                reasons.append("打开过，但没看多久")

            # 节点下第一条（默认资源）通常是「主线」。
            if item["resource_id"] and item["node_id"]:
                score += 4.0

            # 有预置摘要的更适合当陪读素材。
            if item["ai_context"]:
                score += 6.0
                if item.get("auto_context"):
                    score -= 2.0

            if not reasons:
                reasons.append("来自你还没碰过的内容")

            item["_score"] = score
            item["_reason"] = " · ".join(reasons[:2])
            rows.append(item)

    rows.sort(key=lambda r: (-r["_score"], r["course_title"], r["title"]))

    out: list[dict[str, Any]] = []
    for item in rows[: max(1, min(limit, MAX_RECOMMENDATIONS))]:
        record = {k: v for k, v in item.items() if not k.startswith("_")}
        record["reason"] = item["_reason"]
        record["score"] = round(item["_score"], 2)
        out.append(record)

    return {
        "recommendations": out,
        "total": len(rows),
        "generated_at": now,
        # 说明推荐依据的来源——让用户知道这些不是「热门推荐」。
        "basis": "真实学习行为（已学课程、未看资源）",
    }


__all__ = [
    "KIND_LABEL",
    "MAX_CATALOG_SIZE",
    "MAX_RECOMMENDATIONS",
    "recommend",
    "resource_catalog",
]
