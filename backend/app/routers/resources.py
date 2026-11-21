"""
资源采集 API 路由
=================

挂在 ``/api/resources`` 下。它把采集引擎暴露成两个端点：

1. ``POST /api/resources/sync`` —— 触发一次全网实时拉取并写入中台；
2. ``GET /api/resources/hub`` —— 按分类 / 来源 / 更新时间查询资源库。

为什么要单独开一个前缀而不是挂在 ``/api/hub`` 下：``/api/hub`` 管的是
**课程作者**往里塞自己写的课程（导入 schema、导入目录），而这里是
**平台自己去全网抓**——两条链路的调用者、节奏、失败语义都不一样，
混在一起会让「导入失败」和「抓取失败」变成同一个错误码。
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.ai_structurer import StructurerError, structure_hub
from app.services.hub_progress_service import hub_progress, record_watch
from app.services.live_discovery_service import (
    DiscoveryError,
    discover_and_structure,
)
from app.services.media_ingestor import GLOBAL_HUB_PATH, IngestorError, sync

router = APIRouter()


class SyncPayload(BaseModel):
    """一次采集的参数。"""

    #: 每个分类最多保留多少条采集结果。
    max_per_category: int = Field(default=14, ge=1, le=60)
    #: 是否把结果写进中台数据文件。关掉的话只跑一遍筛选，返回清单。
    write: bool = True


class StructurePayload(BaseModel):
    """一次「自学框架装配」的参数。"""

    #: 最多装配多少条。``0`` = 不限。
    limit: int = Field(default=0, ge=0, le=500)
    #: 是否重装已经装配过的视频。
    force: bool = False
    #: 并发请求数。
    concurrency: int = Field(default=5, ge=1, le=16)
    #: 每完成多少条落盘一次。
    save_every: int = Field(default=5, ge=1, le=50)
    #: 只装配这些资源 id。留空 = 全部。
    resource_ids: list[str] = Field(default_factory=list)


class DiscoverPayload(BaseModel):
    """一次「全网即时检索 + 现场装配」的参数。"""

    #: 检索词或视频链接。
    query: str = Field(min_length=1, max_length=200)
    #: 最多取几条候选并装配。
    max_results: int = Field(default=3, ge=1, le=5)


class WatchPayload(BaseModel):
    """一次观看进度上报。"""

    #: 中台资源 id。
    resource_id: str = Field(min_length=1)
    #: 资源标题。
    title: str = ""
    #: 当前播放位置（秒）。
    position: float = 0.0
    #: 视频总时长（秒）。
    duration: float = 0.0
    #: 这次又看了多少秒（增量，不是累计值）。
    delta: float = Field(default=0.0, ge=0.0)


@router.post("/sync")
async def post_resources_sync(
    payload: SyncPayload | None = None,
) -> dict[str, Any]:
    """触发一次全网信源实时拉取。

    流程：``watched_channels.json`` 里配置的频道与关键词 → Bilibili 搜索
    接口 + YouTube 频道投稿列表 → 质量筛选漏斗（时长 / 标题黑名单 /
    关键词）→ **增量写入** ``global_resource_hub.json``。

    入库是 **upsert**：主键是 ``platform + video_id``。已经存在且已
    被 AI 结构化装配过的视频，只刷新标题 / 时长 / 封面等基础元数据，
    **绝对保留**已生成的 ``interactive_nodes`` 与学习向导框架。

    人工整理过的课程条目**不会被覆盖**——采集只刷新自己标记为
    ``res_live_*`` 的那部分。
    """
    options = payload or SyncPayload()
    try:
        result = sync(max_per_category=options.max_per_category)
    except IngestorError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    items = result["items"]
    return {
        "stats": result["stats"],
        "count": len(items),
        "resources": [
            {
                "id": item.video_id,
                "platform": item.platform,
                "title": item.title,
                "channel": item.channel,
                "duration": item.duration,
                "category": item.category,
                "url": item.url,
                "embed_url": item.embed_url,
            }
            for item in items
        ],
    }


@router.post("/structure")
async def post_resources_structure(
    payload: StructurePayload | None = None,
) -> dict[str, Any]:
    """给采集视频装配「四位一体」的自学框架。

    对每条缺框架的视频：

    1. **先抓真实时间轴证据**——原生章节 / 简介时间码 / 字幕轨 /
       教学法节奏推演（三级证据链）；
    2. **再交给 DeepSeek** 一次性装配 ``interactive_nodes``（重点提示
       点）、``study_guide``（顶部知识向导）、``guided_segments``（下方
       段落导读）与 ``academic_intro``（中文学术导读）；
    3. **时间戳吸附到真实锚点**——模型只能在锚点之间做选择，杜绝瞎猜。

    参数：

    * ``limit`` —— 最多装配多少条（``0`` = 不限）；
    * ``force`` —— 重装已经装配过的；
    * ``concurrency`` —— 并发请求数；
    * ``resource_ids`` —— 只装配指定 id。

    装配过程**增量落盘**——每完成 5 条就写一次盘，中途中断不会白跑。
    """
    options = payload or StructurePayload()

    try:
        stats = await structure_hub(
            limit=options.limit,
            force=options.force,
            concurrency=options.concurrency,
            save_every=options.save_every,
            only_ids=list(options.resource_ids) or None,
        )
    except StructurerError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"stats": stats.to_dict()}


@router.post("/watch")
async def post_resources_watch(payload: WatchPayload) -> dict[str, Any]:
    """上报一次观看进度。

    前端每隔十几秒上报一次「我又看了 N 秒」——**增量**而不是累计值，
    累加由后端做。这样即使上报请求丢了几条，账目也只是少几十秒，
    不会整体偏掉。

    这份账目就是学情中心里「中台观看进度 / 看过几门」的来源。
    """
    record = record_watch(
        payload.resource_id,
        title=payload.title,
        position=payload.position,
        duration=payload.duration,
        delta=payload.delta,
    )
    return {"ok": record is not None, "record": record}


@router.get("/progress")
async def get_resources_progress() -> dict[str, Any]:
    """中台的学情汇总。

    形状与 ``/api/learning/progress`` 里的课程条目**一致**——
    学情中心可以把它跟课程并排渲染，不用写两套。
    """
    return hub_progress()


@router.post("/discover")
async def post_resources_discover(
    payload: DiscoverPayload,
) -> dict[str, Any]:
    """**全网活水**：实时检索 + 现场装配。

    用户输入一个学习主题（``博弈论 纳什均衡``）或者直接粘一条
    B 站 / YouTube 链接，服务会：

    1. **检索**——B 站搜索接口 + YouTube 搜索，并发跑；
    2. **入库**——按 upsert 语义写进 ``global_resource_hub.json``；
    3. **装配**——调 DeepSeek 现场生成 ``interactive_nodes`` /
       ``study_guide`` / ``guided_segments`` / ``academic_intro``；
    4. **落盘**并返回新资源的 id。

    前端拿到 id 就能直接切到新课程开始学习。

    全程约 8~12 秒（装配那一步是大头）。

    **直接给链接时不走检索**——直接解析 id 抓元数据，比「把链接当
    关键词去搜」快得多，也准得多（搜出来的可能是另一门课）。
    """
    try:
        result = await discover_and_structure(
            payload.query,
            max_results=payload.max_results,
        )
    except DiscoveryError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return result.to_dict()


@router.post("/discover/stream")
async def post_resources_discover_stream(
    payload: DiscoverPayload,
) -> StreamingResponse:
    """**全网活水**（流式版）：边做边报进度。

    同步版要等整条链路跑完才返回——装配那一步要 8~12 秒，用户盯着
    一个空白的请求，等到超时都不知道系统卡在哪一步。

    流式版用 SSE 逐步吐出进度事件：

    .. code-block:: text

        event: search      「正在检索全网公开课…」
        event: ingest      「正在写入课程目录…」
        event: structure   「AI 正在装配重点导读与思考题…」
        event: done        {最终结果 JSON}

    前端只要读 ``text/event-stream``，把每个事件渲染成分步进度条。
    """
    from app.services.live_discovery_service import discover_and_structure_stream

    async def _event_source():
        async for event in discover_and_structure_stream(
            payload.query,
            max_results=payload.max_results,
        ):
            yield f"event: {event['stage']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sync/status")
async def get_resources_sync_status() -> dict[str, Any]:
    """信源池与巡检状态。

    前端的「巡检更新」按钮旁边显示「最后同步：刚刚 · 共 X 门
    精装公开课」——数据来自这里。
    """
    import json
    from pathlib import Path

    path = Path(GLOBAL_HUB_PATH)
    if not path.exists():
        raise HTTPException(status_code=404, detail="资源库数据文件不存在。")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"资源库数据读取失败：{exc}")

    hub = raw.get("hub") or raw
    metadata = hub.get("metadata") or {}
    categories = hub.get("categories") or []

    resources = [
        resource
        for category in categories
        for resource in (category.get("resources") or [])
        if isinstance(resource, dict)
    ]
    structured = sum(1 for item in resources if item.get("is_structured"))
    with_fallback = sum(
        1
        for item in resources
        if item.get("provider") == "YouTube" and item.get("fallback_url")
    )
    youtube_total = sum(
        1 for item in resources if item.get("provider") == "YouTube"
    )

    return {
        "updated_at": str(hub.get("updated_at") or ""),
        "resource_count": len(resources),
        "structured_count": structured,
        "category_count": len(categories),
        "last_ingest": metadata.get("last_ingest") or {},
        "youtube_fallback_coverage": {
            "total": youtube_total,
            "with_fallback": with_fallback,
            "percent": round(with_fallback / youtube_total * 100, 1)
            if youtube_total
            else 0,
        },
    }


@router.get("/hub")
async def get_resources_hub(
    category: str = Query(default="", description="分类 id，留空表示全部"),
    platform: str = Query(default="", description="bilibili / youtube"),
    updated_since: str = Query(default="", description="YYYY-MM-DD"),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict[str, Any]:
    """查询资源库。

    参数：

    * ``category`` —— 学科分类 id；
    * ``platform`` —— 只看某个平台；
    * ``updated_since`` —— 只看这个日期之后入库/更新的；
    * ``limit`` —— 返回条数上限。
    """
    import json
    from pathlib import Path

    path = Path(GLOBAL_HUB_PATH)
    if not path.exists():
        raise HTTPException(status_code=404, detail="资源库数据文件不存在。")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"资源库数据读取失败：{exc}")

    hub = raw.get("hub") or raw
    categories = hub.get("categories") or []

    matched: list[dict[str, Any]] = []
    for item in categories:
        if category and item.get("id") != category:
            continue
        for resource in item.get("resources") or []:
            meta = resource.get("meta") or {}
            if platform:
                source = str(
                    meta.get("ingested_from")
                    or (
                        "bilibili"
                        if "bilibili.com" in str(resource.get("url") or "")
                        else "youtube"
                    )
                ).lower()
                if source != platform.lower():
                    continue
            if updated_since:
                stamp = str(meta.get("published_at") or "")
                if stamp and stamp < updated_since:
                    continue
            matched.append(
                {
                    "id": resource.get("id"),
                    "category_id": item.get("id"),
                    "category_title": item.get("title"),
                    "title": resource.get("title"),
                    "source": resource.get("source"),
                    "provider": resource.get("provider"),
                    "url": resource.get("url"),
                    "tags": resource.get("tags") or [],
                    "duration": meta.get("duration"),
                    "published_at": meta.get("published_at"),
                }
            )

    matched.sort(
        key=lambda item: str(item.get("published_at") or ""), reverse=True
    )
    return {
        "hub": {
            "id": hub.get("id"),
            "title": hub.get("title"),
            "description": hub.get("description"),
            "updated_at": hub.get("updated_at"),
        },
        "count": len(matched),
        "resources": matched[:limit],
    }


__all__ = ["router"]
