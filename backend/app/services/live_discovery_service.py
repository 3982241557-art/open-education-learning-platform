"""
全网活水：按需检索 + 现场装配
==============================

用户不只是要看中台里已有的 76 门课——他要能**随时**从 YouTube 与
B 站拉一门新内容出来，当场装进自学框架，然后立刻开始学。

这个模块就是那条「活水」管道：

.. code-block:: text

    ┌─ 用户输入 ────────────────────────────────┐
    │  「博弈论 纳什均衡」                        │
    │  「斯坦福 深度学习」                        │
    │  「王德峰 阳明心学」                        │
    │  或直接粘一条 B 站 / YouTube 链接           │
    └───────────────────┬───────────────────────┘
                        ▼
    ┌─ Step 1：全网检索 ────────────────────────┐
    │  B 站搜索接口 + YouTube 搜索（yt-dlp）      │
    │  → 候选打分 → 取前 3~5 条权威公开课          │
    └───────────────────┬───────────────────────┘
                        ▼
    ┌─ Step 2：增量入库 ────────────────────────┐
    │  write_to_hub 的 upsert 语义                │
    │  —— 已有条目不覆盖，新条目追加              │
    └───────────────────┬───────────────────────┘
                        ▼
    ┌─ Step 3：现场装配 ────────────────────────┐
    │  ai_structurer.structure_resource          │
    │  → interactive_nodes / study_guide          │
    │    / guided_segments / academic_intro      │
    │  （约 8~12 秒）                            │
    └───────────────────┬───────────────────────┘
                        ▼
    ┌─ Step 4：落盘 + 返回 ─────────────────────┐
    │  global_resource_hub.json                 │
    │  前端拿到新资源 id，立刻切台                │
    └───────────────────────────────────────────┘

为什么叫「活水」
----------------

中台的数据文件是**静态**的——它不会自己长出新的课。而「活水」意味着
这个池子是**流动**的：用户随时可以往里加新东西，平台自己也会定期
从信源池里补充新的内容（见 :mod:`app.services.patrol_service`）。

与 :mod:`app.services.discovery_service` 的分工
-----------------------------------------------

那个模块做的是「**已有资源**的检索与推荐」——在课程资源表里找东西。
这个模块做的是「**还没有的资源**的获取」——去全网把东西拿回来。

所以两个模块是互补的，**不是重名**：一个是 catalog，一个是
fetcher。

为什么提供两种消费方式
----------------------

装配要调用大模型，耗时 8~12 秒。如果做成同步接口，用户会盯着一个
转圈等十几秒，不知道系统卡在哪一步。

所以这个模块提供两种消费方式：

* :func:`discover_and_structure` —— **同步**：一次调用走完全流程，
  适合脚本与后台巡检；
* :func:`discover_and_structure_stream` —— **流式**：逐条产出
  ``{"stage": "...", "message": "..."}`` 的进度事件，前端拿它渲染
  分步进度条。

两条路共用同一个核心实现，不会出现「同步能跑、流式跑不通」的分裂。

链接直采
--------

用户粘一条链接时，我们**不做检索**——直接解析出平台与 video_id，
抓它的元数据，然后装配。这比「把链接当关键词去搜」快得多，也准得多
（搜出来的可能是另一门课）。

分类归位
--------

新拉来的课要放进哪个分类？靠**关键词推断**——课程标题里出现
「MIT」「哲学」「经济学」等线索时，就归到对应分类；实在看不出来就
放进兜底分类（见 :func:`infer_category`）。

分类推断不追求精确——分类错了用户还能手动切，而**课没拉进来**才是
真正的问题。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Callable

logger = logging.getLogger(__name__)

from app.services.ai_structurer import (
    StructurerError,
    _apply_structure,
    structure_resource,
)
from app.services.media_ingestor import (
    BILIBILI_EMBED_TEMPLATE,
    GLOBAL_HUB_PATH,
    IngestorError,
    VideoItem,
    _bilibili_opener,
    fetch_bilibili_detail,
    fetch_bilibili_search,
    fetch_youtube_detail,
    fetch_youtube_search,
    write_to_hub,
)

__all__ = [
    "DiscoveryError",
    "DiscoveryResult",
    "discover_and_structure",
    "discover_and_structure_stream",
    "infer_category",
    "parse_direct_link",
]


class DiscoveryError(RuntimeError):
    """实时检索失败。"""


# ──────────────────────────────────────────────────────────────────────
# 链接解析
# ──────────────────────────────────────────────────────────────────────

_BILIBILI_LINK = re.compile(r"(BV[A-Za-z0-9]{10})")
_YOUTUBE_LINK = re.compile(
    r"(?:youtube\.com/watch\?(?:.*&)?v=|youtu\.be/|youtube\.com/embed/)"
    r"([A-Za-z0-9_-]{6,})",
    re.IGNORECASE,
)


def parse_direct_link(text: str) -> tuple[str, str] | None:
    """从一段文本里解析出视频链接。

    返回 ``(platform, video_id)``；不是视频链接时返回 ``None``。

    支持 B 站短链（``b23.tv``）吗？不支持——短链需要发一次 HTTP
    请求才能解析出真实地址，那与「直接解析」不是一回事。这里只认
    能在文本里直接读出 id 的链接。
    """
    raw = str(text or "").strip()
    if not raw:
        return None

    match = _YOUTUBE_LINK.search(raw)
    if match:
        return "youtube", match.group(1)

    match = _BILIBILI_LINK.search(raw)
    if match:
        return "bilibili", match.group(1)

    return None


# ──────────────────────────────────────────────────────────────────────
# 分类推断
# ──────────────────────────────────────────────────────────────────────

#: 分类关键词 → 分类 id。
#:
#: 顺序即优先级——先匹配到的先生效。
_CATEGORY_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "cat_cs_ai",
        (
            "算法",
            "编程",
            "程序设计",
            "计算机",
            "数据结构",
            "操作系统",
            "机器学习",
            "深度学习",
            "人工智能",
            "神经网络",
            "线性代数",
            "微积分",
            "概率论",
            "统计",
            "计算机科学",
            "算法设计",
            "python",
            "java",
            "c++",
            "linux",
            "sql",
            "网络安全",
            "编译",
            "图像处理",
            "强化学习",
        ),
    ),
    (
        "cat_philosophy",
        (
            "哲学",
            "思维",
            "逻辑",
            "美学",
            "伦理学",
            "存在",
            "意识",
            "形而上学",
            "认识论",
            "道德",
            "宗教",
            "文学",
            "诗歌",
            "小说",
            "历史",
            "思想史",
            "阳明",
            "心学",
            "道德经",
            "苏格拉底",
            "柏拉图",
            "亚里士多德",
            "尼采",
            "康德",
            "黑格尔",
            # 心理学归到**人文**而不是社科——它的课程内容是
            # 「心理是什么」，不是「社会如何运转」。
            "心理学",
            "心理",
        ),
    ),
    (
        "cat_econ_society",
        (
            "经济",
            "金融",
            "投资",
            "博弈",
            "纳什",
            "市场",
            "宏观",
            "微观",
            "会计",
            "法学",
            "法律",
            "社会学",
            "政治",
            "管理",
            "领导力",
            "公共政策",
            "正义",
            "公正",
            "德鲁克",
            "曼昆",
            "凯恩斯",
            "哈耶克",
            "阿马蒂亚",
            "森",
        ),
    ),
    (
        "cat_science_psych",
        (
            "物理",
            "化学",
            "生物",
            "天文",
            "地理",
            "地质",
            "数学",
            "医学",
            "心理",
            "认知",
            "神经",
            "大脑",
            "进化",
            "基因",
            "量子",
            "相对论",
            "宇宙",
            "星球",
            "精神",
            "冥想",
            "正念",
        ),
    ),
)

#: 兜底分类——实在判断不出来时放这里。
FALLBACK_CATEGORY = "cat_cs_ai"


def infer_category(title: str, description: str = "") -> str:
    """从标题与简介推断分类 id。"""
    haystack = f"{title} {description}".lower()
    for category_id, hints in _CATEGORY_HINTS:
        for hint in hints:
            if hint.lower() in haystack:
                return category_id
    return FALLBACK_CATEGORY


# ──────────────────────────────────────────────────────────────────────
# 候选打分
# ──────────────────────────────────────────────────────────────────────


def _score_video(
    title: str,
    channel: str,
    description: str,
    duration: int,
    query: str,
) -> float:
    """给一条检索结果打分。

    评分维度：

    * **标题命中查询词**——最直接的信号；
    * **频道权威度**——MIT / Harvard / TED 这类频道名加分；
    * **时长**——太短（<10 分钟）或太长（>8 小时）降权；
    * **形态词**——「公开课」「课程」「Lecture」加分，
      「预告」「花絮」降权。
    """
    score = 0.0
    haystack = f"{title} {description}".lower()
    query_lower = query.lower().strip()

    # ① 查询词命中——按词逐个算，命中越多越好。
    query_tokens = [
        token
        for token in re.split(r"[\s,，、/|]+", query_lower)
        if len(token) >= 2
    ]
    for token in query_tokens:
        if token in haystack:
            score += 2.0

    # ② 频道权威度。
    channel_lower = channel.lower()
    for keyword in (
        "mit",
        "harvard",
        "yale",
        "stanford",
        "ted",
        "khan",
        "coursera",
        "edx",
        "3blue1brown",
    ):
        if keyword in channel_lower:
            score += 1.5
            break

    # ③ 时长。
    if 0 < duration < 600:
        score -= 1.0
    elif duration > 28800:
        score -= 1.5
    elif 900 <= duration <= 14400:
        score += 0.8

    # ④ 形态词。
    for word in ("公开课", "课程", "全套", "完整版", "lecture", "course", "lesson"):
        if word in haystack:
            score += 0.6
            break
    for word in ("预告", "花絮", "reaction", "trailer"):
        if word in haystack:
            score -= 2.0

    return score


# ──────────────────────────────────────────────────────────────────────
# 结果
# ──────────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class DiscoveryResult:
    """一次「实时检索 + 装配」的结果。"""

    #: 命中的资源 id（列表）。
    resource_ids: list[str] = field(default_factory=list)
    #: 命中的资源标题。
    titles: list[str] = field(default_factory=list)
    #: 装配成功的条数。
    structured: int = 0
    #: 装配失败的条数。
    failed: int = 0
    #: 新入库的条数。
    added: int = 0
    #: 已是���存在的条数（本次只刷新了元数据）。
    updated: int = 0
    #: 装配失败的详情。
    failures: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "resource_ids": self.resource_ids,
            "titles": self.titles,
            "structured": self.structured,
            "failed": self.failed,
            "added": self.added,
            "updated": self.updated,
            "failures": self.failures,
        }


# ──────────────────────────────────────────────────────────────────────
# 检索
# ──────────────────────────────────────────────────────────────────────


async def _search_candidates(
    query: str,
    *,
    limit_per_platform: int = 12,
) -> list[VideoItem]:
    """在两个平台上检索候选视频。

    两个平台的检索**并发**跑——B 站走搜索接口（1~2 秒），
    YouTube 走 yt-dlp（2~4 秒）。串行要 6 秒，并发只要 4 秒。
    """
    opener = await asyncio.to_thread(_bilibili_opener)

    def _bili() -> list[VideoItem]:
        try:
            raw_items = fetch_bilibili_search(
                opener, query, limit=limit_per_platform
            )
        except Exception:  # noqa: BLE001
            return []
        out: list[VideoItem] = []
        for item in raw_items:
            out.append(
                VideoItem(
                    platform="bilibili",
                    video_id=item["bvid"],
                    title=item["title"],
                    channel=item["author"],
                    duration=item["duration"],
                    description=item["description"],
                    cover=item["cover"],
                    published_at=item["pubdate"],
                    page_url=f"https://www.bilibili.com/video/{item['bvid']}",
                    embed_url=BILIBILI_EMBED_TEMPLATE.format(bvid=item["bvid"]),
                    url=f"https://www.bilibili.com/video/{item['bvid']}",
                )
            )
        return out

    def _youtube() -> list[VideoItem]:
        try:
            raw_items = fetch_youtube_search(query, limit=limit_per_platform)
        except Exception:  # noqa: BLE001
            return []
        out: list[VideoItem] = []
        for item in raw_items:
            video_id = item["video_id"]
            out.append(
                VideoItem(
                    platform="youtube",
                    video_id=video_id,
                    title=item["title"],
                    channel=item.get("channel") or "",
                    duration=item.get("duration") or 0,
                    page_url=f"https://www.youtube.com/watch?v={video_id}",
                    embed_url=f"https://www.youtube.com/embed/{video_id}",
                    url=f"https://www.youtube.com/watch?v={video_id}",
                )
            )
        return out

    bili, youtube = await asyncio.gather(
        asyncio.to_thread(_bili),
        asyncio.to_thread(_youtube),
    )
    return [*bili, *youtube]


async def _resolve_direct(
    platform: str,
    video_id: str,
) -> VideoItem | None:
    """解析一条直接给出的视频链接。

    走平台的详情接口拿准确时长、标题、简介——这些是装配器的输入。
    """
    if platform == "bilibili":
        opener = await asyncio.to_thread(_bilibili_opener)
        detail = await asyncio.to_thread(fetch_bilibili_detail, opener, video_id)
        if not detail:
            return None
        return VideoItem(
            platform="bilibili",
            video_id=video_id,
            title=detail["title"],
            channel=detail["author"],
            duration=detail["duration"],
            description=detail["description"],
            cover=detail["cover"],
            published_at=detail["pubdate"],
            page_url=f"https://www.bilibili.com/video/{video_id}",
            embed_url=BILIBILI_EMBED_TEMPLATE.format(bvid=video_id),
            url=f"https://www.bilibili.com/video/{video_id}",
        )

    detail = await asyncio.to_thread(fetch_youtube_detail, video_id)
    if not detail:
        return None
    return VideoItem(
        platform="youtube",
        video_id=video_id,
        title=detail["title"],
        channel=detail.get("author") or "",
        duration=detail.get("duration") or 0,
        description=detail.get("description") or "",
        cover=detail.get("cover") or "",
        published_at=detail.get("published_at") or 0,
        page_url=f"https://www.youtube.com/watch?v={video_id}",
        embed_url=f"https://www.youtube.com/embed/{video_id}",
        url=f"https://www.youtube.com/watch?v={video_id}",
    )


# ──────────────────────────────────────────────────────────────────────
# 核心流程
# ──────────────────────────────────────────────────────────────────────


async def _core(
    query: str,
    *,
    max_results: int,
    hub_path: Path | None,
    emit: Callable[[str, str], None],
) -> DiscoveryResult:
    """检索 → 入库 → 装配的核心实现。"""

    result = DiscoveryResult()
    raw_query = str(query or "").strip()
    if not raw_query:
        raise DiscoveryError("检索词不能为空。")

    # ── Step 1：检索 ──
    emit("search", f"正在检索全网公开课：{raw_query}")

    direct = parse_direct_link(raw_query)
    candidates: list[VideoItem] = []

    if direct:
        emit("search", "识别到视频链接，直接抓取该视频…")
        item = await _resolve_direct(*direct)
        if item is None:
            raise DiscoveryError(f"无法读取该链接的视频信息：{raw_query}")
        candidates = [item]
    else:
        candidates = await _search_candidates(raw_query)
        if not candidates:
            raise DiscoveryError(f"「{raw_query}」在全网没有搜到可用的公开课。")

        # 打分排序，取前 N 条。
        scored = [
            (
                _score_video(
                    item.title,
                    item.channel,
                    item.description,
                    item.duration,
                    raw_query,
                ),
                item,
            )
            for item in candidates
        ]
        scored.sort(key=lambda pair: -pair[0])
        candidates = [item for _score, item in scored[:max_results]]

        # 补齐详情（简介 / 封面 / 精确时长）——装配器需要它们。
        emit("search", f"命中 {len(candidates)} 条候选，正在提取章节与字幕证据…")

        async def _enrich(item: VideoItem) -> VideoItem:
            if item.platform == "bilibili":
                opener = await asyncio.to_thread(_bilibili_opener)
                detail = await asyncio.to_thread(
                    fetch_bilibili_detail, opener, item.video_id
                )
                if detail:
                    item.title = detail.get("title") or item.title
                    item.channel = detail.get("author") or item.channel
                    item.duration = int(detail.get("duration") or item.duration)
                    item.description = detail.get("description") or item.description
                    item.cover = detail.get("cover") or item.cover
            else:
                detail = await asyncio.to_thread(fetch_youtube_detail, item.video_id)
                if detail:
                    item.title = detail.get("title") or item.title
                    item.channel = detail.get("author") or item.channel
                    item.duration = int(detail.get("duration") or item.duration)
                    item.description = detail.get("description") or item.description
                    item.cover = detail.get("cover") or item.cover
            return item

        candidates = list(
            await asyncio.gather(*(_enrich(item) for item in candidates))
        )

    # ── Step 2：入库 ──
    emit("ingest", "正在写入课程目录…")
    for item in candidates:
        item.category = infer_category(item.title, item.description)

    try:
        stats = await asyncio.to_thread(write_to_hub, candidates, hub_path)
    except IngestorError as exc:
        raise DiscoveryError(str(exc)) from exc

    result.added = int(stats.get("added", 0))
    result.updated = int(stats.get("updated", 0))

    # 找到这次涉及的条目的 id。
    target = hub_path or GLOBAL_HUB_PATH
    try:
        raw = json.loads(Path(target).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise DiscoveryError(f"中台数据读取失败：{exc}") from exc
    hub = raw.get("hub") or raw

    selected: list[dict[str, Any]] = []
    for category in hub.get("categories") or []:
        for resource in category.get("resources") or []:
            if not isinstance(resource, dict):
                continue
            meta = resource.get("meta") or {}
            for item in candidates:
                if (
                    str(meta.get("ingested_from") or "") == item.platform
                    and str(meta.get("video_id") or "") == item.video_id
                ):
                    selected.append(resource)
                    break

    if not selected:
        raise DiscoveryError("检索结果未能写入课程目录。")

    # ── Step 3：装配 ──
    #
    # 这一步是大头——每条视频一次大模型调用，**串行**的话 3 条就是
    # 30 秒往上，直接把前端请求拖到超时。所以必须**并发**跑：
    # 三条视频各调各的模型，墙钟时间等于最慢的那一条。
    emit("structure", "AI 正在装配重点导读与思考题…")

    async def _structure_one(resource: dict[str, Any]) -> tuple[str, str | None]:
        """装配单条视频。返回 ``(标题, 失败原因)``。

        失败原因为 ``None`` 表示成功。
        """
        title = str(resource.get("title") or "")
        if resource.get("is_structured"):
            # 已经装配过——不重复烧 Token。
            return title, None

        try:
            structure = await structure_resource(resource)
        except StructurerError as exc:
            return title, f"{title}：{exc}"
        except Exception as error:  # noqa: BLE001 — 单条失败不该拖垮整轮
            return title, f"{title}：{error}"

        # 把装配结果**写回资源条目**。
        #
        # 这一步不能省——``structure_resource`` 只**返回**结果，并不
        # 修改传入的字典。不显式写回去的话，落盘的还是一个没有
        # ``interactive_nodes`` 的空壳，用户看到的就是「装了但没装」。
        _apply_structure(resource, structure)
        return title, None

    outcomes = await asyncio.gather(
        *(_structure_one(resource) for resource in selected)
    )

    for resource, (title, failure) in zip(selected, outcomes):
        result.resource_ids.append(str(resource.get("id") or ""))
        result.titles.append(str(resource.get("title") or ""))
        if failure is None:
            result.structured += 1
        else:
            result.failed += 1
            result.failures.append(failure)

    # ── Step 4：补齐备用源 ──
    #
    # 新拉进来的 YouTube 视频如果没有 B 站备用源，在国内公网就等于
    # 黑框。所以「搜课」这条链路必须自己负责把备用源补上——
    # 否则每次现搜都在拉低覆盖率。
    #
    # 这一步要调 B 站搜索，耗时 1~3 秒。但它**不阻塞**用户：装配
    # 已经完成、结果已经能用了，备用源只是让降级能力跟上。
    fallback_filled = await _repair_missing_fallbacks(raw, hub, target)
    if fallback_filled:
        # 注意：这里**不**发进度事件。
        #
        # 进度条已经走到「AI 装配」了，再发一个 ``ingest`` 会让进度
        # **倒退**——用户看到进度条回退，比看不到更困惑。备用源补齐
        # 是后台增强，不该占用用户的注意力。
        logger.info("全网活水：为 %s 条课程补上国内备用源。", fallback_filled)

    # 落盘。
    Path(target).write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # 注意：这里**不**发 ``done`` 事件。
    #
    # ``done`` 必须带着最终结果一起发——流式消费方靠它拿
    # ``resource_ids``。由 :func:`discover_and_structure_stream` 的
    # 包装层统一发，这样结果不会在两个地方各发一次。
    return result


async def _repair_missing_fallbacks(
    raw: dict[str, Any],
    hub: dict[str, Any],
    target: Path,
) -> int:
    """给这次新入库的 YouTube 课程补上 B 站备用源。

    返回补上的条数。失败时返回 0——补不上不影响这次检索的结果。
    """
    from app.services.fallback_matcher import fill_missing_fallbacks

    try:
        stats = await asyncio.to_thread(
            fill_missing_fallbacks,
            hub,
            limit=6,
            dry_run=False,
        )
    except Exception:  # noqa: BLE001 — 备用源补齐失败不该毁掉整次检索
        return 0

    filled = int(stats.get("filled", 0))
    if filled:
        # 把补好的结果写回磁盘。注意写的是**完整的 raw**（含
        # ``$schema`` 外壳），不是只有 ``hub`` 那一层。
        try:
            Path(target).write_text(
                json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        except OSError:
            return 0
    return filled


async def discover_and_structure(
    query: str,
    *,
    max_results: int = 3,
    hub_path: Path | None = None,
) -> DiscoveryResult:
    """检索 + 入库 + 装配（同步接口）。

    ``max_results`` —— 最多取几条候选并装配。
    """
    return await _core(
        query,
        max_results=max_results,
        hub_path=hub_path,
        emit=lambda _stage, _message: None,
    )


async def discover_and_structure_stream(
    query: str,
    *,
    max_results: int = 3,
    hub_path: Path | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """检索 + 入库 + 装配（流式接口）。

    逐条产出 ``{"stage": ..., "message": ..., "result": ...}`` 事件。

    ``stage`` 取值：

    * ``search`` —— 检索全网；
    * ``ingest`` —— 写入目录；
    * ``structure`` —— AI 装配；
    * ``done`` —— 完成（带最终结果）；
    * ``error`` —— 失败。
    """
    # 用一个队列把「阶段事件」和「最终结果」串起来。
    #
    # ``_core`` 是一段连续执行的协程，中途只能通过 ``emit`` 回调往外
    # 喊话。所以这里把它跑成一个后台任务，``emit`` 往队列里塞消息，
    # 本协程从队列里取——这样进度就是**真的实时**的，而不是等全部
    # 跑完再一次性倒出来。
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def _emit(stage: str, message: str) -> None:
        queue.put_nowait({"stage": stage, "message": message})

    async def _runner() -> DiscoveryResult:
        try:
            result = await _core(
                query,
                max_results=max_results,
                hub_path=hub_path,
                emit=_emit,
            )
        except DiscoveryError as exc:
            queue.put_nowait({"stage": "error", "message": str(exc)})
            return None  # type: ignore[return-value]
        except Exception as error:  # noqa: BLE001
            queue.put_nowait({"stage": "error", "message": f"检索失败：{error}"})
            return None  # type: ignore[return-value]
        queue.put_nowait(
            {
                "stage": "done",
                "message": (
                    f"完成：{result.structured} 门课已就绪"
                    + (f"，{result.failed} 门装配失败" if result.failed else "")
                ),
                "result": result.to_dict(),
            }
        )
        return result

    task = asyncio.create_task(_runner())

    try:
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event
            if event.get("stage") in {"done", "error"}:
                break
    finally:
        if not task.done():
            task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task
