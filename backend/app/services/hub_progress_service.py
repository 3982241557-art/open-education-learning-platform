"""
中台观看进度记账
================

「学情中心」要能如实反映用户在公开课上做了什么。这一模块就是那本账。

它记什么
--------

.. code-block:: text

    ┌─ 每条中台资源 ─────────────────────────────┐
    │  累计观看时长（秒）                          │
    │  最后播放位置（秒）                          │
    │  视频总时长（秒）——用来算「看完了吗」        │
    │  最近一次观看时间                            │
    │  看过 / 没看过                               │
    └─────────────────────────────────────────────┘

它怎么存
--------

存在 ``backend/data/sessions/global_resource_hub/watch.json``——
跟课程笔记、聊天会话**同一个目录**。这是刻意的：

* 学情中心按 ``course_id`` 汇总所有数据，中台的 ``course_id`` 就是
  ``global_resource_hub``；
* 用户在中台记的笔记、提的问题、看的视频，全都在这一个命名空间下，
  不会散落在两处。

为什么单独一个模块
------------------

课程的进度来自**课程文件**里的 ``progress`` 段（正文页的滚动位置、
停留时长）。中台的进度来自**视频播放器**——它没有正文页，粒度是
「视频的哪一秒」。

两套数据结构不一样，硬塞进课程文件会污染那个 schema。所以单独一个
模块，但**接口形状对齐** ``progress_service.course_progress``——
学情中心读的时候不用区分两者。

为什么「看过」的判定要严格
--------------------------

跟课程页一样的原则：**没有证据就是没看**。

一条视频被打开过 3 秒不叫「看过」。判据是「累计观看时长 ≥ 总时长的
40%」或者「播放位置到了总时长的 90%」——后者说明用户至少看到了尾。
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.services.learning_state import SESSIONS_ROOT

#: 中台的「课程 id」——学情中心按这个 id 汇总。
HUB_COURSE_ID = "global_resource_hub"

#: 观看记录的存放目录——跟中台的笔记、聊天会话同属一个命名空间。
HUB_SESSION_DIR = SESSIONS_ROOT / HUB_COURSE_ID

#: 观看记录文件。
WATCH_PATH = HUB_SESSION_DIR / "watch.json"

#: 判定「看过」所需的最小观看比例。
MIN_COVERAGE = 0.4

#: 判定「看到尾」的播放位置比例。
TAIL_RATIO = 0.9


def _read_watch() -> dict[str, Any]:
    if not WATCH_PATH.exists():
        return {}
    try:
        raw = json.loads(WATCH_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _write_watch(data: dict[str, Any]) -> None:
    HUB_SESSION_DIR.mkdir(parents=True, exist_ok=True)
    tmp = WATCH_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(WATCH_PATH)


def record_watch(
    resource_id: str,
    *,
    title: str = "",
    position: float = 0.0,
    duration: float = 0.0,
    delta: float = 0.0,
) -> dict[str, Any] | None:
    """记一次观看。

    参数：

    * ``resource_id`` —— 中台资源 id；
    * ``title`` —— 资源标题（第一次记下时就固定下来）；
    * ``position`` —— 当前播放位置（秒）；
    * ``duration`` —— 视频总时长（秒）；
    * ``delta`` —— 这次又看了多少秒（秒）。

    ``delta`` 是**增量**，不是累计值——前端每隔一段时间上报一次
    「我又看了 N 秒」。累加由这里做。

    返回更新后的这条记录；``resource_id`` 为空时返回 ``None``。
    """
    rid = str(resource_id or "").strip()
    if not rid:
        return None

    data = _read_watch()
    record = data.get(rid) if isinstance(data.get(rid), dict) else {}

    dwell = float(record.get("dwell_seconds") or 0.0) + max(0.0, float(delta or 0.0))
    # 总时长取「已知过的最大值」——避免后续上报的 duration 变小
    # （比如 YouTube 的 metadata 没取到）把比例算歪。
    known_duration = max(
        float(record.get("duration") or 0.0), float(duration or 0.0)
    )
    last_position = max(
        float(record.get("last_position") or 0.0), float(position or 0.0)
    )

    data[rid] = {
        "resource_id": rid,
        "title": str(record.get("title") or title or ""),
        "dwell_seconds": round(dwell, 3),
        "duration": round(known_duration, 3),
        "last_position": round(last_position, 3),
        "last_active_at": time.time(),
        "seen": _is_seen(dwell, known_duration, last_position),
    }
    _write_watch(data)
    return data[rid]


def _is_seen(dwell: float, duration: float, position: float) -> bool:
    """判定「看过」。

    两个判据取或：

    * 累计观看时长 ≥ 总时长的 40%；
    * 播放位置到了总时长的 90%。
    """
    if duration <= 0:
        # 不知道总时长时，用绝对门槛：看了 3 分钟就算看过。
        return dwell >= 180
    return dwell >= duration * MIN_COVERAGE or position >= duration * TAIL_RATIO


def watch_records() -> dict[str, Any]:
    """全部观看记录（``{resource_id: record}``）。"""
    return _read_watch()


def _catalog_index() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """读出中台的真实目录。

    返回 ``(按 id 索引的资源, 全部分类)``。

    为什么必须读目录而不是只看观看记录
    ----------------------------------

    之前的实现把「用户打开过的资源数」当成了「中台的总资源数」。
    结果是：用户只看过 3 门课，进度条就显示 3/3 = 100%。

    这是**假数据**——它统计的是「我碰过的」而不是「存在的」，
    而学情中心的全部意义就是如实反映「还有多少没学」。

    所以这里必须以**目录**为分母：121 门课就是 121，看过 3 门就是
    3/121 = 2.5%。
    """
    try:
        from app.services.global_hub_service import load_global_hub

        hub = load_global_hub()
    except Exception:  # noqa: BLE001 — 目录读不到不该让学情崩掉
        return {}, []

    index: dict[str, dict[str, Any]] = {}
    categories: list[dict[str, Any]] = []
    for category in hub.get("categories", []) or []:
        if not isinstance(category, dict):
            continue
        categories.append(category)
        for resource in category.get("resources", []) or []:
            if not isinstance(resource, dict):
                continue
            rid = str(resource.get("id") or "").strip()
            if not rid:
                continue
            index[rid] = {
                "resource_id": rid,
                "title": str(resource.get("title") or ""),
                "provider": str(resource.get("provider") or ""),
                "source": str(resource.get("source") or ""),
                "category_id": str(category.get("id") or ""),
                "category_title": str(category.get("title") or ""),
                "duration": float(resource.get("meta", {}).get("duration") or 0.0)
                if isinstance(resource.get("meta"), dict)
                else 0.0,
                "node_count": len(resource.get("interactive_nodes") or []),
            }
    return index, categories


def _mastery_status(
    seen_count: int, total_count: int, dwell_seconds: float
) -> str:
    """中台的掌握度状态。

    判据与课程一致，但阈值按「视频」重新校准过——一门视频课只要
    看完就算掌握，不需要像正文那样「读过多遍」。

    * ``待学习`` —— 一门都没碰过；
    * ``学习中`` —— 碰过但没看完（覆盖率不足 40%）；
    * ``薄弱需巩固`` —— 覆盖率够了，但停留时间明显不足
      （可能是拖进度条刷过去的）；
    * ``已掌握`` —— 覆盖率 ≥ 40% 且停留时间达标。
    """
    if seen_count <= 0 or dwell_seconds <= 0:
        return "待学习"
    if total_count <= 0:
        return "学习中"
    ratio = seen_count / total_count
    if ratio < 0.4:
        return "学习中"
    # 平均每门课至少看 3 分钟才算「认真看过」。
    if dwell_seconds / seen_count < 180:
        return "薄弱需巩固"
    return "已掌握"


def _chapter_progress(
    categories: list[dict[str, Any]],
    catalog: dict[str, dict[str, Any]],
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """每个学科分类的掌握度。

    分母是**该分类下的全部资源数**——跟总览一样，绝不用「碰过的」
    当分母。

    「覆盖」是看过数 / 该分类总数；「状态」按同样的阈值判定。
    """
    result: list[dict[str, Any]] = []
    for category in categories:
        cid = str(category.get("id") or "")
        total = len(category.get("resources") or [])
        visited = sum(
            1
            for item in records
            if item.get("seen")
            and catalog.get(str(item.get("resource_id") or ""), {}).get("category_id")
            == cid
        )
        dwell = sum(
            float(item.get("dwell_seconds") or 0.0)
            for item in records
            if catalog.get(str(item.get("resource_id") or ""), {}).get("category_id")
            == cid
        )
        result.append(
            {
                "title": str(category.get("title") or ""),
                "subtitle": str(category.get("subtitle") or ""),
                "total_pages": total,
                "visited_pages": visited,
                "coverage": (visited / total) if total else 0.0,
                "notes": 0,
                "quiz_accuracy": None,
                "quiz_answered": 0,
                "status": _mastery_status(visited, total, dwell),
                "dwell_seconds": round(dwell, 3),
            }
        )
    return result


def hub_progress() -> dict[str, Any]:
    """中台的学情汇总——形状对齐 ``progress_service.course_progress``。

    这样学情中心可以把它跟课程条目**并排**显示，而不用写两套渲染。

    数字全部来自**真实数据**：

    * 总资源数 —— 中台目录里的真实条数；
    * 看过几门 —— 观看记录里 ``seen`` 为真的条数；
    * 覆盖率 —— 看过 / 存在，**不是** 看过 / 碰过；
    * 笔记数 —— 留存文档里的真实条数；
    * 提问数 —— 助教会话里用户消息的条数。
    """
    from app.services.learning_state import load_notes, load_session

    records = _read_watch()
    values = [item for item in records.values() if isinstance(item, dict)]

    catalog, categories = _catalog_index()
    total_resources = len(catalog)
    # 目录读不到时退回「碰过的数量」——宁可保守，也不要造一个
    # 假的分母。
    denominator = total_resources or len(values)

    total_dwell = sum(float(item.get("dwell_seconds") or 0.0) for item in values)
    seen = sum(1 for item in values if item.get("seen"))

    notes = load_notes(HUB_COURSE_ID)
    session = load_session(HUB_COURSE_ID)
    ask_count = sum(1 for message in session if message.get("role") == "user")

    # 最近的观看时间。
    last_active = max(
        (float(item.get("last_active_at") or 0.0) for item in values), default=0.0
    )

    # 「覆盖率」= 看过的资源数 / **目录里的总资源数**。
    #
    # 上一版的分母是「碰过的资源数」——那等于 100%，是假数据。
    coverage = (seen / denominator) if denominator else 0.0

    # 资源级明细：把观看记录跟目录**合并**。
    #
    # 只出现在观看记录里的资源（目录已删除但用户看过）也要保留，
    # 否则用户会发现自己看过的课「消失了」。
    resources: list[dict[str, Any]] = []
    for rid, record in records.items():
        if not isinstance(record, dict):
            continue
        meta = catalog.get(rid, {})
        resources.append(
            {
                "resource_id": rid,
                "title": str(record.get("title") or meta.get("title") or ""),
                "seen": bool(record.get("seen")),
                "marked_done": bool(record.get("seen")),
                "dwell_seconds": float(record.get("dwell_seconds") or 0.0),
                "last_position": float(record.get("last_position") or 0.0),
                "duration": float(record.get("duration") or meta.get("duration") or 0.0),
                "last_active_at": float(record.get("last_active_at") or 0.0),
                "course_id": HUB_COURSE_ID,
                "course_title": "全网公开课中台",
                "provider": str(meta.get("provider") or ""),
                "ai_context": "",
                "opened": True,
                "category_title": str(meta.get("category_title") or ""),
                "node_count": int(meta.get("node_count") or 0),
            }
        )
    # 按最近观看时间倒序——最近学的排最前。
    resources.sort(key=lambda item: item["last_active_at"], reverse=True)

    status = _mastery_status(seen, denominator, total_dwell)

    return {
        "course_id": HUB_COURSE_ID,
        "title": "全网公开课中台",
        "author": "",
        "description": "来自 YouTube 与 B 站的实时装配公开课。",
        "difficulty": "",
        "tags": ["公开课", "全网"],
        # 中台没有「正文页」——它的最小学习单元是「一条视频」。
        "total_pages": denominator,
        "total_chapters": len(categories),
        "visited_pages": seen,
        "coverage": coverage,
        "dwell_seconds": round(total_dwell, 3),
        "opened_pages": len(values),
        "note_count": len(notes),
        "ask_count": ask_count,
        "quiz_count": 0,
        "quiz_answered": 0,
        "quiz_accuracy": None,
        "status": status,
        "last_active_at": last_active,
        "last_page_id": "",
        "last_page_title": "",
        "last_chapter_title": "",
        "chapters": _chapter_progress(categories, catalog, values),
        "plans": [],
        # ── 资源级 ──
        "is_hub": True,
        "total_resources": denominator,
        "seen_resources": seen,
        "resource_coverage": coverage,
        "resources": resources,
    }


__all__ = [
    "HUB_COURSE_ID",
    "HUB_SESSION_DIR",
    "MIN_COVERAGE",
    "TAIL_RATIO",
    "WATCH_PATH",
    "hub_progress",
    "record_watch",
    "watch_records",
]
