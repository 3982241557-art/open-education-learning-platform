"""
资源枢纽 API 路由
==================

挂在 ``/api/hub`` 下。它承载「外链课程」这条新链路的三件事：

1. **作者格式 schema** —— 作者要写的东西长什么样（``GET /schema``）；
2. **批量导入** —— 把一整个目录的外链课程一次性导入（``POST /import``）；
3. **资源发现** —— 跨课程的资源总表与推荐（``GET /discover`` /
   ``GET /recommend``）。

资源级的学习痕迹走 ``/api/courses/{id}/resource-telemetry``——它属于
课程自身的进度，所以在 courses 路由里。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.course_service import CourseError
from app.services.discovery_service import recommend, resource_catalog
from app.services.global_hub_service import (
    GlobalHubError,
    global_hub_summary,
    load_global_hub,
)
from app.services.hub_service import (
    hub_schema,
    import_hub_directory,
    import_hub_payload,
)

router = APIRouter()


class HubImportPayload(BaseModel):
    """导入一份作者 JSON。"""

    #: 作者写的课程数据（顶层带 ``hub``，或直接带 ``topics``）。
    course: dict[str, Any] = Field(default_factory=dict)
    #: 目标 id 已存在时是否覆盖。
    overwrite: bool = False


class HubDirectoryImportPayload(BaseModel):
    """批量导入一个目录。"""

    #: 目录路径（服务端本地路径）。
    directory: str = Field(..., min_length=1)
    #: 目标 id 已存在时是否覆盖。
    overwrite: bool = False


@router.get("/schema")
async def get_hub_schema() -> dict[str, Any]:
    """作者格式的 JSON Schema。

    这份 schema 描述的是**作者要写的东西**（主题 / 节点 / 资源），
    不是平台内部的四段结构——后者在
    ``/api/courses/template-schema``。
    """
    try:
        return hub_schema()
    except CourseError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/import")
async def post_hub_import(payload: HubImportPayload) -> dict[str, Any]:
    """导入一份作者 JSON。"""
    if not payload.course:
        raise HTTPException(status_code=400, detail="缺少 course 内容。")
    try:
        course = import_hub_payload(payload.course, overwrite=payload.overwrite)
    except CourseError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return course.to_dict()


@router.post("/import-directory")
async def post_hub_import_directory(
    payload: HubDirectoryImportPayload,
) -> dict[str, Any]:
    """批量导入一个目录下的所有外链课程 JSON。

    **单个文件失败不会中断整批**——一份坏数据不该挡住其余上百条
    资源。结果里分开列出成功与失败。
    """
    try:
        return import_hub_directory(payload.directory, overwrite=payload.overwrite)
    except CourseError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/global")
async def get_global_hub() -> dict[str, Any]:
    """全网资源中台——平台所有外部视频的注册中心。

    数据来自 :file:`backend/data/global_resource_hub.json`。

    返回的每条资源都带 ``interactive_nodes``（时间戳交互数组）与
    ``captions``（字幕轨）——所以中台里的每一条视频在中间舞台里都是
    **可交互**的：播到某个时刻弹知识气泡，点气泡即暂停并唤醒 AI 助教。

    返回结构::

        {
          "hub": { "id", "title", "description", "categories": [...] },
          "summary": { "category_count", "resource_count", "providers": [...] }
        }
    """
    try:
        hub = load_global_hub()
    except GlobalHubError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"hub": hub, "summary": global_hub_summary(hub)}


@router.get("/discover")
async def get_discover(
    q: str = "",
    type: str = "",
    provider: str = "",
    pillar: str = "",
    course_id: str = "",
    unseen_only: bool = False,
    limit: int = 200,
) -> dict[str, Any]:
    """跨课程的资源总表。

    参数：

    * ``q`` —— 关键词（在标题、来源、课程、节点、摘要里找）；
    * ``type`` —— ``video`` / ``webpage`` / ``document``；
    * ``provider`` —— 来源平台；
    * ``pillar`` —— 四大支柱之一；
    * ``course_id`` —— 限定在某门课内；
    * ``unseen_only`` —— 只看还没看过的；
    * ``limit`` —— 返回条数上限。
    """
    return resource_catalog(
        query=q,
        resource_type=type,
        provider=provider,
        pillar=pillar,
        course_id=course_id,
        only_unseen=unseen_only,
        limit=limit,
    )


@router.get("/recommend")
async def get_recommend(limit: int = 12) -> dict[str, Any]:
    """「下一步值得看」的资源推荐。

    每条推荐都带 ``reason``——推荐必须**可解释**。依据全部来自真实
    学习行为，没有热度数据也不假装有。
    """
    return recommend(limit=limit)


__all__ = ["router"]
