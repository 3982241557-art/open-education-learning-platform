"""
全网资源中台
============

平台的核心定位是「全网公开教学视频的智能调度控制台」。这个模块
负责加载 :file:`backend/data/global_resource_hub.json`——平台所有外部
视频的**注册中心**——并把它整理成前端能直接消费的形状。

为什么单独一个文件
------------------

课程数据在 :file:`backend/data/courses/` 下，一门一份；资源中台是
**跨课程**的目录——它不属于任何一门课，单独放在 :file:`data/` 根
目录。

它与课程数据的分工：

======================  ==========================================
课程 (``courses/*.json``)  资源中台 (``global_resource_hub.json``)
======================  ==========================================
有完整的「主题 → 节点」   只有「分类 → 资源」两层
描述的是**一门课**       描述的是**整个平台的公共资源池**
可以任意增删课程          一份注册表，跨课程共享
======================  ==========================================

分类即分���
----------

前端按 ``categories`` 分组渲染手风琴。所以分类是这份数据的**第一
公民**，不是给资源打的散标签——``tags`` 是资源自己的属性（"计算机"、
"硬核"），``categories`` 是目录结构（"顶级高校"、"通识趣味"）。

交互节点
--------

每条资源都带 ``interactive_nodes``——与课程资源同一套规范（时间戳 +
关键词 + 类型）。前端播放器读到它就会在对应时刻弹知识气泡，点气泡
即暂停并唤醒右侧 AI 助教。这样中台的每一条资源都是**可交互**的，
而不只是一个外链列表。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services.hub_normalize import (
    HubFormatError,
    host_of,
    normalize_interactive_nodes,
    parse_timestamp,
)

#: 数据根目录——``backend/data``。
DATA_ROOT = Path(__file__).resolve().parents[2] / "data"

#: 资源中台的数据文件。
GLOBAL_HUB_PATH = DATA_ROOT / "global_resource_hub.json"

#: 分类图标的取值范围。前端据此挑图标。
CATEGORY_ICONS = ("graduation-cap", "sparkles", "landmark", "book-open", "globe")


class GlobalHubError(ValueError):
    """资源中台数据不合法。"""


def _as_str_list(value: Any) -> list[str]:
    """安全地把任意值变成字符串列表。"""
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _normalize_study_guide(raw: Any) -> dict[str, Any]:
    """归一化 ``study_guide``——顶部知识向导的数据。

    结构::

        {"strategy": "...", "checkpoints": [...], "suggested_questions": [...]}
    """
    if not isinstance(raw, dict):
        return {}

    guide: dict[str, Any] = {}

    strategy = str(raw.get("strategy") or "").strip()
    if strategy:
        guide["strategy"] = strategy

    checkpoints = [
        str(item).strip()
        for item in (raw.get("checkpoints") or [])
        if str(item).strip()
    ]
    if checkpoints:
        guide["checkpoints"] = checkpoints[:6]

    questions: list[dict[str, str]] = []
    for item in raw.get("suggested_questions") or []:
        if isinstance(item, dict):
            title = str(item.get("title") or "").strip()
            prompt = str(item.get("prompt") or "").strip()
            angle = str(item.get("angle") or "").strip()
        else:
            title = str(item).strip()
            prompt = title
            angle = ""
        if not title and not prompt:
            continue
        questions.append(
            {"title": title or prompt[:16], "prompt": prompt or title, "angle": angle}
        )
    if questions:
        guide["suggested_questions"] = questions[:8]

    return guide


def _normalize_guided_segments(raw: Any) -> list[dict[str, Any]]:
    """归一化 ``guided_segments``——下方段落导读的数据。"""
    if not isinstance(raw, list):
        return []

    segments: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        timestamp = parse_timestamp(
            item.get("timestamp")
            if item.get("timestamp") is not None
            else item.get("time")
        )
        content = str(item.get("content") or item.get("summary") or "").strip()
        if timestamp is None or not content:
            continue
        segments.append(
            {
                "timestamp": float(timestamp),
                "title": str(item.get("title") or "").strip(),
                "content": content,
                "anchor_title": str(item.get("anchor_title") or "").strip(),
                "anchor_origin": str(item.get("anchor_origin") or "").strip(),
            }
        )

    segments.sort(key=lambda item: item["timestamp"])
    return segments


def _normalize_resource(raw: Any, *, category_id: str, index: int) -> dict[str, Any]:
    """把一条资源补全成规范形状。

    与 :func:`app.services.hub_normalize.normalize_resource` 的区别：
    那个函数补的是**课程内**的资源（需要节点标题来合成摘要），这里的
    资源直接来自公共注册表，作者已经把 ``ai_context`` 写清楚了。
    """
    if not isinstance(raw, dict):
        raise GlobalHubError(f"分类「{category_id}」的第 {index + 1} 条资源不是对象。")

    url = str(raw.get("url") or "").strip()
    if not url:
        raise GlobalHubError(f"分类「{category_id}」的第 {index + 1} 条资源缺少 url。")
    if not url.lower().startswith(("http://", "https://")):
        raise GlobalHubError(
            f"分类「{category_id}」的第 {index + 1} 条资源 url 必须以 http(s) 开头：{url!r}"
        )

    title = str(raw.get("title") or "").strip()
    if not title:
        raise GlobalHubError(f"分类「{category_id}」的第 {index + 1} 条资源缺少 title。")

    resource_id = str(raw.get("id") or "").strip()
    if not resource_id:
        raise GlobalHubError(f"分类「{category_id}」的第 {index + 1} 条资源缺少 id。")

    # 字幕：统一成 {start, text}，按时间排序。
    captions_raw = raw.get("captions")
    captions: list[dict[str, Any]] = []
    if isinstance(captions_raw, list):
        for item in captions_raw:
            if not isinstance(item, dict):
                continue
            start = parse_timestamp(
                item.get("start") if item.get("start") is not None else item.get("time")
            )
            text = str(item.get("text") or "").strip()
            if start is None or not text:
                continue
            captions.append({"start": float(start), "text": text})
    captions.sort(key=lambda item: item["start"])

    # 交互节点——与课程资源同一套归一化逻辑。
    interactive_nodes = normalize_interactive_nodes(raw.get("interactive_nodes"))

    meta_raw = raw.get("meta")
    meta = dict(meta_raw) if isinstance(meta_raw, dict) else {}

    # 时长：作者写了就用；写的是字符串时间就解析。
    duration = meta.get("duration")
    if isinstance(duration, str):
        parsed = parse_timestamp(duration)
        meta["duration"] = parsed
    elif duration is not None and not isinstance(duration, (int, float)):
        meta.pop("duration", None)

    provider = str(raw.get("provider") or "").strip()
    if not provider:
        host = host_of(url)
        provider = {"youtube.com": "YouTube", "bilibili.com": "Bilibili"}.get(
            host, host or "外链"
        )

    # 备用源——主源连不上时的兜底直链（云盘 / OSS / 对象存储上的 mp4）。
    fallback_url = str(raw.get("fallback_url") or raw.get("fallbackUrl") or "").strip()
    if fallback_url and not fallback_url.lower().startswith(("http://", "https://")):
        raise GlobalHubError(
            f"分类「{category_id}」的资源「{title}」的 fallback_url 必须以 http(s) 开头："
            f"{fallback_url!r}"
        )

    return {
        "id": resource_id,
        "resource_type": str(raw.get("resource_type") or "video").strip(),
        "title": title,
        "source": str(raw.get("source") or provider).strip(),
        "provider": provider,
        "url": url,
        "fallback_url": fallback_url,
        "ai_context": str(raw.get("ai_context") or "").strip(),
        "tags": _as_str_list(raw.get("tags")),
        "meta": meta,
        "captions": captions,
        "interactive_nodes": interactive_nodes,
        # ── 自学框架的另外三件套 ──
        #
        # ``study_guide``——右侧顶部的【知识向导】；
        # ``guided_segments``——视频下方的【段落导读】轨；
        # ``academic_intro``——纯中文学术导读（简介兜底）。
        "study_guide": _normalize_study_guide(raw.get("study_guide")),
        "guided_segments": _normalize_guided_segments(raw.get("guided_segments")),
        "academic_intro": str(raw.get("academic_intro") or "").strip(),
        "is_structured": bool(raw.get("is_structured", False)),
        "is_default": bool(raw.get("is_default", False)),
    }


def _normalize_category(raw: Any, *, index: int) -> dict[str, Any]:
    """把一个分类补全成规范形状。"""
    if not isinstance(raw, dict):
        raise GlobalHubError(f"第 {index + 1} 个分类不是对象。")

    title = str(raw.get("title") or "").strip()
    if not title:
        raise GlobalHubError(f"第 {index + 1} 个分类缺少 title。")

    category_id = str(raw.get("id") or "").strip()
    if not category_id:
        raise GlobalHubError(f"分类「{title}」缺少 id。")

    resources_raw = raw.get("resources")
    if not isinstance(resources_raw, list) or not resources_raw:
        raise GlobalHubError(f"分类「{title}」缺少非空的 resources 列表。")

    resources = [
        _normalize_resource(item, category_id=category_id, index=resource_index)
        for resource_index, item in enumerate(resources_raw)
    ]

    # 分类内至多一条默认资源——多条会让前端不知道选谁。
    if sum(1 for item in resources if item["is_default"]) > 1:
        for item in resources[1:]:
            item["is_default"] = False
        resources[0]["is_default"] = True

    icon = str(raw.get("icon") or "").strip()
    if icon not in CATEGORY_ICONS:
        icon = "globe"

    return {
        "id": category_id,
        "title": title,
        "subtitle": str(raw.get("subtitle") or "").strip(),
        "description": str(raw.get("description") or "").strip(),
        "icon": icon,
        "order": int(raw.get("order") or index),
        "resources": resources,
    }


def normalize_global_hub(raw: dict[str, Any]) -> dict[str, Any]:
    """把 ``global_resource_hub.json`` 归一成前端可消费的形状。

    接受两种顶层形状：带 ``hub`` 段的（与内部格式一致），或直接把
    ``categories`` 放在顶层的。
    """
    if not isinstance(raw, dict):
        raise GlobalHubError("资源中台数据必须是一个对象。")

    hub = raw.get("hub") if isinstance(raw.get("hub"), dict) else raw

    title = str(hub.get("title") or "").strip()
    if not title:
        raise GlobalHubError("资源中台缺少 title。")

    categories_raw = hub.get("categories")
    if not isinstance(categories_raw, list) or not categories_raw:
        raise GlobalHubError("资源中台缺少非空的 categories 列表。")

    categories = [
        _normalize_category(item, index=index)
        for index, item in enumerate(categories_raw)
    ]
    categories.sort(key=lambda item: item["order"])

    metadata = hub.get("metadata")
    metadata = dict(metadata) if isinstance(metadata, dict) else {}

    return {
        "id": str(hub.get("id") or "global_resource_hub").strip(),
        "title": title,
        "description": str(hub.get("description") or "").strip(),
        "exploration_summary": str(hub.get("exploration_summary") or "").strip(),
        "updated_at": str(hub.get("updated_at") or "").strip(),
        "metadata": metadata,
        "categories": categories,
    }


def load_global_hub(path: Path | None = None) -> dict[str, Any]:
    """读取并归一资源中台数据。

    读不到或格式不对时抛 :class:`GlobalHubError`——中台是**核心数据**，
    静默返回空列表会让前端显示一个空目录，用户完全不知道发生了什么。
    """
    target = path or GLOBAL_HUB_PATH
    if not target.exists():
        raise GlobalHubError(f"资源中台数据文件不存在：{target}")

    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise GlobalHubError(f"资源中台数据文件读取失败：{exc}") from exc

    return normalize_global_hub(raw)


def global_hub_summary(hub: dict[str, Any]) -> dict[str, Any]:
    """中台的统计摘要——给前端显示「共 N 个分类 / M 条资源」。"""
    categories = hub.get("categories") or []
    resource_total = sum(len(item.get("resources") or []) for item in categories)
    provider_counts: dict[str, int] = {}
    for category in categories:
        for resource in category.get("resources") or []:
            provider = resource.get("provider") or "其他"
            provider_counts[provider] = provider_counts.get(provider, 0) + 1
    return {
        "category_count": len(categories),
        "resource_count": resource_total,
        "providers": [
            {"id": name, "label": name, "count": count}
            for name, count in sorted(provider_counts.items(), key=lambda kv: -kv[1])
        ],
    }


__all__ = [
    "CATEGORY_ICONS",
    "DATA_ROOT",
    "GLOBAL_HUB_PATH",
    "GlobalHubError",
    "global_hub_summary",
    "load_global_hub",
    "normalize_global_hub",
]
