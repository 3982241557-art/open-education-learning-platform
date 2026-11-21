"""
外链课程归一化
==============

平台转型为「全网开放资源连接枢纽」之后，作者要写的东西**变简单了**：
不再是 Book → Chapter → Text Block 的四段重结构，而是「主题 → 节点 →
外链资源」三样。

本模块负责把作者的**最小输入**补全成平台内部的完整形态：

.. code-block:: text

    作者写的（最小）              平台补全后
    ─────────────────────────    ──────────────────────────────
    topics[]                     + id（按标题派生）
      title                      + summary / order
      nodes[]                    + id / question / summary / order
        title
        resources[]              + id / resource_type（按 URL 推断）
          url                    + title（按 URL 兜底）
                                 + provider（按域名推断）
                                 + ai_context（按节点摘要合成）

补全原则
--------

**能推断的就推断，作者写了就以作者的为准。** 作者的时间是稀缺的——
让 TA 手工填 7 条资源的 ``provider`` 与 ``ai_context`` 是不现实的，
但让 TA 为「这个资源的重要信息」操心同样不现实。所以：

* **机械字段**（id、provider、resource_type、title）——能自动推断就自动
  推断，作者显式写了则覆盖；
* **语义字段**（``ai_context``）——能自动合成就合成一段概要，但**明确
  标注它是自动生成的**；作者写了就完全用作者的。

自动合成的摘要信息量有限。它能告诉 AI「这条资源大致在讲什么」，但不能
替代作者亲手写的核心知识点——所以资源带 ``auto_context`` 标记，AI 拿到
时可以据此提醒用户「这条资源我只有概要」。

本模块**不依赖** :mod:`app.services.course_service`，以免与它形成循环
导入——归一化是纯函数式的，服务层才是依赖方。
"""

from __future__ import annotations

import re
from typing import Any

#: 平台支持的资源类型——与 ``course_service.RESOURCE_TYPES`` 一致。
RESOURCE_TYPES = frozenset({"video", "webpage", "document"})

#: 资源 id 的全局前缀——避免与页 id 撞车。
_RESOURCE_ID_PREFIX = "res"


# ── 域名 → 来源平台 ────────────────────────────────────────────────────
#
# 作者多半会省略 ``provider``——从域名推断最省事，也最不容易错。
_PROVIDER_BY_HOST: tuple[tuple[str, str], ...] = (
    ("bilibili.com", "Bilibili"),
    ("b23.tv", "Bilibili"),
    ("youtube.com", "YouTube"),
    ("youtu.be", "YouTube"),
    ("vimeo.com", "Vimeo"),
    ("wikipedia.org", "Wikipedia"),
    ("wikimedia.org", "Wikimedia"),
    ("wikisource.org", "Wikisource"),
    ("plato.stanford.edu", "Stanford Encyclopedia of Philosophy"),
    ("iep.utm.edu", "Internet Encyclopedia of Philosophy"),
    ("archive.org", "Internet Archive"),
    ("openstax.org", "OpenStax"),
    ("arxiv.org", "arXiv"),
    ("github.com", "GitHub"),
    ("mit.edu", "MIT OpenCourseWare"),
    ("stanford.edu", "Stanford"),
    ("nasa.gov", "NASA"),
    ("loc.gov", "Library of Congress"),
    ("gutenberg.org", "Project Gutenberg"),
    ("openlibrary.org", "Open Library"),
    ("ted.com", "TED"),
    ("coursera.org", "Coursera"),
    ("edx.org", "edX"),
    ("khanacademy.org", "Khan Academy"),
    ("nature.com", "Nature"),
    ("sciencedirect.com", "ScienceDirect"),
    ("jstor.org", "JSTOR"),
    ("theconversation.com", "The Conversation"),
)

#: 资源类型 → 中文名（用于自动合成摘要时的措辞）。
KIND_LABEL: dict[str, str] = {
    "video": "视频",
    "webpage": "网页",
    "document": "文档",
}

#: 视频平台域名——决定资源类型推断的结果。
_VIDEO_HOSTS = ("bilibili.com", "b23.tv", "youtube.com", "youtu.be", "vimeo.com")

#: 文档后缀。
_DOCUMENT_SUFFIX = re.compile(r"\.(pdf|epub|mobi|azw3|djvu)(\.zip)?$", re.IGNORECASE)


class HubFormatError(ValueError):
    """作者格式的数据不合法。"""


def as_dict(value: Any) -> dict[str, Any]:
    """安全地把任意值变成字典。"""
    return value if isinstance(value, dict) else {}


def as_str_list(value: Any) -> list[str]:
    """安全地把任意值变成字符串列表。"""
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def host_of(url: str) -> str:
    """取 URL 的主机名（小写，不含 www.）。"""
    match = re.search(r"https?://([^/?#]+)", url or "", re.IGNORECASE)
    if not match:
        return ""
    host = match.group(1).lower()
    if "@" in host:
        host = host.split("@", 1)[1]
    if ":" in host:
        host = host.split(":", 1)[0]
    return host[4:] if host.startswith("www.") else host


def infer_provider(url: str) -> str:
    """按域名猜来源平台。猜不到就用主域名。"""
    host = host_of(url)
    if not host:
        return ""
    for needle, provider in _PROVIDER_BY_HOST:
        if host == needle or host.endswith("." + needle):
            return provider
    # 退而求其次：用主域名当来源（「cnn.com」→「cnn.com」）。
    parts = host.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host


def infer_resource_type(url: str) -> str:
    """按 URL 猜资源类型。

    * 视频平台（B站 / YouTube / Vimeo）→ ``video``；
    * PDF / EPUB 等文档后缀 → ``document``；
    * 其它 → ``webpage``。
    """
    host = host_of(url)
    for needle in _VIDEO_HOSTS:
        if host == needle or host.endswith("." + needle):
            return "video"

    path = (url or "").split("?")[0].split("#")[0].lower()
    if _DOCUMENT_SUFFIX.search(path):
        return "document"
    if "archive.org/download" in path or path.endswith(".pdf"):
        return "document"
    return "webpage"


def title_from_url(url: str) -> str:
    """从 URL 猜一个标题（取末段并把连字符换成空格）。"""
    try:
        from urllib.parse import unquote, urlparse

        parsed = urlparse(url or "")
        segment = parsed.path.rstrip("/").split("/")[-1]
        if not segment:
            segment = parsed.netloc
        text = unquote(segment).replace("_", " ").replace("-", " ").strip()
        return text[:120]
    except Exception:  # pragma: no cover - 极端输入
        return ""


def slugify(text: str, *, fallback: str) -> str:
    """把标题派生成一个 id 片段（非 ASCII 会被替换掉）。"""
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", (text or "").strip()).strip("-")
    return (slug or fallback)[:40]


# ── 交互节点 ────────────────────────────────────────────────────────────

#: 交互节点的类型——决定气泡长什么样、点了之后 AI 怎么回话。
INTERACTIVE_NODE_TYPES = ("concept", "question", "quote", "warning")

#: 时间字符串 → 秒。支持 ``mm:ss`` / ``hh:mm:ss`` / 纯秒数。
_TIME_PATTERN = re.compile(r"^\d+(?:\.\d+)?$")


def parse_timestamp(value: Any) -> float | None:
    """把时间戳解析成秒。认不出来返回 ``None``。

    接受数字（秒）与 ``"02:00"`` / ``"1:02:03"`` 这类时间串。

    为什么要按冒号个数分段，而不是用一条正则
    ----------------------------------------
    一条 ``^(?:(\\d+):)?(?:(\\d+):)?(\\d+)$`` 之类的正则会**贪婪**地
    把 ``"02:00"`` 拆成「2 小时 0 分 0 秒」——也就是 7200 秒。这跟
    人写的 ``mm:ss`` 完全不是一回事。

    所以这里按冒号个数数段：两段是 ``mm:ss``，三段是 ``hh:mm:ss``，
    一段就是纯秒数。朴素但不会错。
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value >= 0 else None
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None

    # 纯数字（含小数）→ 秒。
    if _TIME_PATTERN.match(text):
        return float(text)

    parts = text.split(":")
    if len(parts) > 3:
        return None

    try:
        numbers = [float(part) for part in parts]
    except ValueError:
        return None

    if any(number < 0 for number in numbers):
        return None

    if len(numbers) == 1:
        return numbers[0]
    if len(numbers) == 2:
        minutes, seconds = numbers
        return minutes * 60 + seconds
    hours, minutes, seconds = numbers
    return hours * 3600 + minutes * 60 + seconds


def normalize_interactive_nodes(raw: Any) -> list[dict[str, Any]]:
    """把作者写的交互节点归一成规范形状。

    规范形状::

        {"timestamp": 120.0, "keyword": "机会成本", "type": "concept"}

    归一化做的事：

    * 时间戳统一成秒（接受 ``"02:00"``）；
    * 关键词统一从 ``keyword`` / ``term`` / ``title`` / ``text`` 里取；
    * 类型统一到 :data:`INTERACTIVE_NODE_TYPES`（认不出就当 ``concept``）；
    * 保留作者额外写的字段（``context`` / ``hint`` 等）原样带上。

    非法的一条直接丢掉——一个坏时间戳不该让整份课程读不出来。
    """
    if not isinstance(raw, list):
        return []

    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue

        timestamp = parse_timestamp(
            item.get("timestamp")
            if item.get("timestamp") is not None
            else item.get("time", item.get("at", item.get("offset")))
        )
        if timestamp is None:
            continue

        keyword = str(
            item.get("keyword")
            or item.get("term")
            or item.get("title")
            or item.get("text")
            or ""
        ).strip()
        if not keyword:
            continue

        node_type = str(item.get("type") or "").strip().lower()
        if node_type not in INTERACTIVE_NODE_TYPES:
            node_type = "concept"

        node: dict[str, Any] = {
            "timestamp": float(timestamp),
            "keyword": keyword,
            "type": node_type,
        }
        # 作者额外写的字段原样带上（context / hint / question …）。
        for key, value in item.items():
            if key in ("timestamp", "time", "at", "offset", "keyword", "term", "title", "text", "type"):
                continue
            node[key] = value

        out.append(node)

    # 按时间排序——前端要按顺序触发。
    out.sort(key=lambda node: float(node["timestamp"]))
    return out


# ── 自动合成摘要 ────────────────────────────────────────────────────────


def synthesize_context(
    *,
    resource_type: str,
    provider: str,
    node_title: str,
    node_question: str,
    node_summary: str,
    topic_title: str,
    topic_summary: str,
) -> str:
    """在没有 ``ai_context`` 时合成一段概要。

    合成结果**一定带着「自动生成」的标记**——它的信息量远不如作者亲手
    写的核心知识点，AI 必须知道这一点，才能在陪读时诚实地说明「这条
    我只有概要」。
    """
    kind = KIND_LABEL.get(resource_type, "资源")
    bits: list[str] = []

    if node_question:
        bits.append(f"本节点要回答的问题是「{node_question}」。")
    if node_summary:
        bits.append(node_summary)
    elif topic_summary:
        bits.append(f"它属于「{topic_title}」主题：{topic_summary}")
    else:
        bits.append(f"它属于「{topic_title}」主题。")

    source = f"（来源：{provider}）" if provider else ""
    head = (
        f"【自动生成的概要】这是一条{kind}资源{source}，"
        f"挂在知识节点「{node_title}」下。"
    )
    tail = (
        "这段概要由系统根据节点与主题信息自动合成，信息量有限——"
        "若需要更精确的陪读，请补充该资源的人工摘要。"
    )
    return head + "".join(bits) + tail


# ── 补全 ────────────────────────────────────────────────────────────────


def normalize_resource(
    raw: Any,
    *,
    node_id: str,
    node_title: str,
    node_question: str,
    node_summary: str,
    topic_title: str,
    topic_summary: str,
    defaults: dict[str, Any],
    index: int,
) -> dict[str, Any]:
    """把一条作者写的资源补全成完整形态。"""
    data = as_dict(raw)

    url = str(data.get("url") or data.get("link") or data.get("href") or "").strip()
    if not url:
        raise HubFormatError(f"资源 #{index + 1}（节点「{node_title}」）缺少 url。")
    if not url.lower().startswith(("http://", "https://")):
        raise HubFormatError(
            f"资源 #{index + 1}（节点「{node_title}」）的 url 必须以 http(s) 开头：{url!r}"
        )

    # resource_type：作者写了的用作者的，否则按 defaults，最后按 URL 推断。
    resource_type = str(data.get("resource_type") or data.get("type") or "").strip()
    if not resource_type:
        resource_type = str(defaults.get("resource_type") or "").strip()
    if not resource_type:
        resource_type = infer_resource_type(url)
    if resource_type not in RESOURCE_TYPES:
        raise HubFormatError(
            f"资源 #{index + 1}（节点「{node_title}」）的 resource_type 非法："
            f"{resource_type!r}；可选 {sorted(RESOURCE_TYPES)}。"
        )

    provider = str(data.get("provider") or "").strip()
    if not provider:
        provider = str(defaults.get("provider") or "").strip()
    if not provider:
        provider = infer_provider(url)

    title = str(data.get("title") or "").strip()
    if not title:
        title = title_from_url(url) or provider or url

    ai_context = str(data.get("ai_context") or data.get("summary") or "").strip()
    auto_context = False
    if not ai_context:
        ai_context = str(defaults.get("ai_context") or "").strip()
    if not ai_context:
        ai_context = synthesize_context(
            resource_type=resource_type,
            provider=provider,
            node_title=node_title,
            node_question=node_question,
            node_summary=node_summary,
            topic_title=topic_title,
            topic_summary=topic_summary,
        )
        auto_context = True

    resource_id = str(data.get("id") or "").strip()
    if not resource_id:
        resource_id = (
            f"{_RESOURCE_ID_PREFIX}_{slugify(node_title, fallback='node')}_{index + 1}"
        )

    captions_raw = data.get("captions")
    captions = (
        [dict(item) for item in captions_raw if isinstance(item, dict)]
        if isinstance(captions_raw, list)
        else []
    )

    # 交互节点——视频播放到某个时间戳时弹出的知识点。
    #
    # 作者可能写成 ``timestamp`` / ``time`` / ``at``，也可能把时间写成
    # ``"02:00"``。这里统一成「秒 + 关键词」的规范形状，非法的一条
    # 直接丢掉——一个坏时间戳不该让整份课程读不出来。
    interactive_nodes = normalize_interactive_nodes(
        data.get("interactive_nodes")
    )

    return {
        "id": resource_id,
        "resource_type": resource_type,
        "title": title,
        "url": url,
        "ai_context": ai_context,
        "provider": provider,
        "meta": as_dict(data.get("meta")),
        "captions": captions,
        "interactive_nodes": interactive_nodes,
        "is_default": bool(data.get("is_default", defaults.get("is_default", False))),
        # 标记：这段摘要是不是自动合成的。
        "auto_context": auto_context,
    }


def normalize_node(
    raw: Any,
    *,
    topic_id: str,
    topic_title: str,
    topic_summary: str,
    defaults: dict[str, Any],
    index: int,
) -> dict[str, Any]:
    """把一个作者写的节点补全。"""
    data = as_dict(raw)

    title = str(data.get("title") or data.get("question") or "").strip()
    if not title:
        raise HubFormatError(f"节点 #{index + 1} 缺少 title。")

    node_id = str(data.get("id") or "").strip()
    if not node_id:
        node_id = f"node_{slugify(topic_title, fallback='topic')}_{index + 1}"

    question = str(data.get("question") or "").strip()
    summary = str(data.get("summary") or "").strip()

    resources_raw = data.get("resources")
    if not isinstance(resources_raw, list) or not resources_raw:
        raise HubFormatError(f"节点「{title}」缺少非空的 resources 列表。")

    resources = [
        normalize_resource(
            item,
            node_id=node_id,
            node_title=title,
            node_question=question,
            node_summary=summary,
            topic_title=topic_title,
            topic_summary=topic_summary,
            defaults=defaults,
            index=resource_index,
        )
        for resource_index, item in enumerate(resources_raw)
    ]

    # 同一个节点里至多一条资源是默认资源——多条会让前端不知道选谁。
    if sum(1 for item in resources if item["is_default"]) > 1:
        for item in resources[1:]:
            item["is_default"] = False
        resources[0]["is_default"] = True

    return {
        "id": node_id,
        "topic_id": topic_id,
        "title": title,
        "question": question,
        "summary": summary,
        "order": int(data.get("order") or index),
        "resources": resources,
    }


def normalize_topic(
    raw: Any,
    *,
    defaults: dict[str, Any],
    index: int,
) -> dict[str, Any]:
    """把一个作者写的主题补全。"""
    data = as_dict(raw)

    title = str(data.get("title") or "").strip()
    if not title:
        raise HubFormatError(f"主题 #{index + 1} 缺少 title。")

    topic_id = str(data.get("id") or "").strip()
    if not topic_id:
        topic_id = f"topic_{slugify(title, fallback='t')}_{index + 1}"

    summary = str(data.get("summary") or "").strip()

    nodes_raw = data.get("nodes")
    if not isinstance(nodes_raw, list) or not nodes_raw:
        raise HubFormatError(f"主题「{title}」缺少非空的 nodes 列表。")

    nodes = [
        normalize_node(
            item,
            topic_id=topic_id,
            topic_title=title,
            topic_summary=summary,
            defaults=defaults,
            index=node_index,
        )
        for node_index, item in enumerate(nodes_raw)
    ]

    return {
        "id": topic_id,
        "title": title,
        "summary": summary,
        "order": int(data.get("order") or index),
        "nodes": nodes,
    }


def normalize_hub_payload(raw: dict[str, Any]) -> dict[str, Any]:
    """把一份作者 JSON 补全成平台内部的 hub 结构。

    接受两种顶层形状：

    * ``{"hub": {...}}`` —— 与内部格式一致；
    * ``{"title": ..., "topics": [...]}`` —— 作者更可能这么写（少一层
      嵌套），直接当成 hub 处理。
    """
    if not isinstance(raw, dict):
        raise HubFormatError("外链课程数据必须是一个对象。")

    hub = as_dict(raw.get("hub"))
    if not hub:
        # 顶层没有 hub 段——如果它自带 topics，就当作作者格式。
        if isinstance(raw.get("topics"), list):
            hub = dict(raw)
        else:
            raise HubFormatError("外链课程缺少 hub 段（或顶层的 topics）。")

    title = str(hub.get("title") or "").strip()
    if not title:
        raise HubFormatError("外链课程缺少 title。")

    defaults = as_dict(hub.get("defaults"))

    topics_raw = hub.get("topics")
    if not isinstance(topics_raw, list) or not topics_raw:
        raise HubFormatError("外链课程缺少非空的 topics 列表。")

    topics = [
        normalize_topic(item, defaults=defaults, index=index)
        for index, item in enumerate(topics_raw)
    ]

    course_id = str(hub.get("id") or "").strip()
    if not course_id:
        course_id = f"hub_{slugify(title, fallback='course')}"

    tags = as_str_list(hub.get("tags"))

    metadata = as_dict(hub.get("metadata"))
    if tags:
        metadata.setdefault("tags", tags)
    for key in ("pillar", "prerequisite", "author", "difficulty"):
        value = hub.get(key)
        if value:
            metadata.setdefault(key, value)

    return {
        "hub": {
            "id": course_id,
            "revision": int(hub.get("revision") or 1),
            "title": title,
            "description": str(hub.get("description") or "").strip(),
            "language": str(hub.get("language") or "zh").strip(),
            "depth": str(hub.get("depth") or "standard").strip(),
            "status": str(hub.get("status") or "ready").strip(),
            "metadata": metadata,
            "exploration_summary": str(hub.get("exploration_summary") or "").strip(),
            "topics": topics,
        }
    }


__all__ = [
    "HubFormatError",
    "INTERACTIVE_NODE_TYPES",
    "KIND_LABEL",
    "RESOURCE_TYPES",
    "as_dict",
    "as_str_list",
    "host_of",
    "infer_provider",
    "infer_resource_type",
    "normalize_hub_payload",
    "normalize_interactive_nodes",
    "normalize_node",
    "normalize_resource",
    "normalize_topic",
    "parse_timestamp",
    "slugify",
    "synthesize_context",
    "title_from_url",
]
