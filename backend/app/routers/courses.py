"""
Courses API 路由
=================

课程数据的 CRUD，挂在 ``/api/courses`` 下。

课程数据是纯本地的 JSON 文件，「课程列表渲染」的唯一数据源就是这里返回的
``courses`` 数组。请求体与返回体都用**原版 DeepTutor Book Engine 的四段
结构**（``book`` / ``spine`` / ``pages`` / ``progress``），字段定义见
:mod:`app.services.course_service`。
"""

from __future__ import annotations

import time

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.course_service import CourseError, get_course_service
from app.services.skill_runtime import library_workspace
from app.services import taxonomy

router = APIRouter()


class BookProposalPayload(BaseModel):
    title: str = ""
    description: str = ""
    scope: str = ""
    target_level: str = ""
    estimated_chapters: int = 0
    rationale: str = ""


class BookPayload(BaseModel):
    """原版 ``Book`` manifest。"""

    id: str = Field(..., min_length=1, max_length=64)
    revision: int = 1
    title: str = Field(..., min_length=1)
    description: str = ""
    status: str = "draft"
    proposal: BookProposalPayload | None = None
    knowledge_bases: list[str] = Field(default_factory=list)
    language: str = "en"
    depth: str = "standard"
    page_count: int = 0
    chapter_count: int = 0
    created_at: float = 0.0
    updated_at: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    kb_fingerprints: dict[str, str] = Field(default_factory=dict)
    kb_document_fingerprints: dict[str, dict[str, str]] = Field(default_factory=dict)
    stale_page_ids: list[str] = Field(default_factory=list)
    stale_detected_at: float = 0.0


class SpinePayload(BaseModel):
    """原版 ``Spine``——章节树 + 概念图。"""

    book_id: str = ""
    version: int = 1
    updated_at: float = 0.0
    exploration_summary: str = ""
    concept_graph: dict[str, Any] = Field(default_factory=dict)
    chapters: list[dict[str, Any]] = Field(default_factory=list)


class PagePayload(BaseModel):
    """原版 ``Page``——有序的 Block 序列。"""

    id: str = Field(..., min_length=1)
    book_id: str = ""
    chapter_id: str = ""
    title: str = Field(..., min_length=1)
    learning_objectives: list[str] = Field(default_factory=list)
    content_type: str = "theory"
    status: str = "pending"
    order: int = 0
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    links: list[dict[str, Any]] = Field(default_factory=list)
    parent_page_id: str = ""
    error: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0


class ProgressPayload(BaseModel):
    """原版 ``Progress``。"""

    book_id: str = ""
    current_page_id: str = ""
    visited_page_ids: list[str] = Field(default_factory=list)
    bookmarked_page_ids: list[str] = Field(default_factory=list)
    quiz_attempts: list[dict[str, Any]] = Field(default_factory=list)
    weak_chapters: list[str] = Field(default_factory=list)
    score: int = 0
    updated_at: float = 0.0


class CoursePayload(BaseModel):
    """一份课程文件：原版格式的四段结构。"""

    book: BookPayload
    spine: SpinePayload = Field(default_factory=SpinePayload)
    pages: list[PagePayload] = Field(default_factory=list)
    progress: ProgressPayload = Field(default_factory=ProgressPayload)


def _to_dict(payload: CoursePayload) -> dict[str, Any]:
    # ``exclude_unset`` 很关键：客户端没传的段就不该出现在请求体里。
    # 否则 Pydantic 补出来的空 spine 会把已有章节整个抹掉。
    data = payload.model_dump(exclude_unset=True, exclude_none=False)
    book = data.get("book")
    if isinstance(book, dict):
        book_id = str(book.get("id") or "")
        for section in ("spine", "progress"):
            if isinstance(data.get(section), dict):
                data[section]["book_id"] = book_id
        for page in data.get("pages") or []:
            if isinstance(page, dict) and not page.get("book_id"):
                page["book_id"] = book_id
    return data


@router.get("/template-schema")
async def course_template_schema() -> dict[str, Any]:
    """Course 的结构模板（JSON Schema），供前端渲染「结构解剖图」。

    这份 schema 描述字段结构，**不含任何真实课程内容**。
    """
    service = get_course_service()
    try:
        return service.template_schema()
    except CourseError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/list")
async def list_courses() -> dict[str, list[dict[str, Any]]]:
    """课程列表。

    每一门课都带上**通识分类**（四大支柱之一）与**前置知识要求**——
    分类是呈现层的决定，所以在这里叠加，不写回课程磁盘数据。
    """
    service = get_course_service()
    courses = service.list_courses(workspace_id=library_workspace.get())
    return {
        "courses": [
            {**course.to_dict(), **taxonomy.describe(course.to_dict())}
            for course in courses
        ]
    }


class VisitPayload(BaseModel):
    """记录一次阅读。"""

    page_id: str = ""
    course_id: str = ""


class TelemetryPayload(BaseModel):
    """一次**真实阅读遥测**上报。

    三个字段分别对应「用户真的在做什么」：

    * ``page_id`` —— 当前在看哪一节；
    * ``dwell_seconds`` —— 这次停留了多久（秒，前端真实计时）；
    * ``coverage`` —— 这一节的正文被滚动看过了多大比例（0–1）。
    """

    page_id: str = ""
    #: 本次停留的秒数。允许为 0——那表示用户秒退。
    dwell_seconds: float = 0.0
    #: 本页被滚动看过的最大比例（0–1）。
    coverage: float = 0.0


class ResourceTelemetryPayload(BaseModel):
    """一次**资源级**学习痕迹上报。

    资源枢纽型课程里，用户看的是外部资源——一条视频、一篇网页。
    进度挂在节点上会**掩盖**「这个节点下的三条资源我只看过一条」，
    所以这里给每条资源单独记账。

    字段：

    * ``resource_id`` —— 当前在看哪条资源；
    * ``dwell_seconds`` —— 本次停留的秒数（增量）；
    * ``marked_done`` —— 用户是否**显式**标记了「看完了」；
    * ``page_id`` —— 所属节点（页）id，便于反查。
    """

    resource_id: str = ""
    dwell_seconds: float = 0.0
    marked_done: bool = False
    page_id: str = ""


@router.post("/{course_id}/visit")
async def visit_page(course_id: str, payload: VisitPayload) -> dict[str, Any]:
    """记录用户读了哪一页。

    「学情中心」的阅读进度完全依赖这个接口——前端每翻开一节就调
    一次，后端把页 id 追加进 ``progress.visited_page_ids``。

    只**追加**不删除：读过的页永远是读过的，这跟书签的语义不同。
    """
    service = get_course_service()
    try:
        course = service.get_course(course_id, workspace_id=library_workspace.get())
    except CourseError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    page_id = (payload.page_id or "").strip()
    if not page_id:
        raise HTTPException(status_code=400, detail="缺少 page_id。")

    # 页必须真的属于这门课——否则前端一个笔误就能把别的课的页
    # 塞进进度里。
    known = {page.id for page in course.pages}
    if page_id not in known:
        raise HTTPException(status_code=404, detail="这一节不属于当前课程。")

    visited = list(course.progress.visited_page_ids)
    if page_id not in visited:
        visited.append(page_id)

    progress = course.progress.to_dict()
    progress["visited_page_ids"] = visited
    progress["current_page_id"] = page_id
    progress["updated_at"] = time.time()

    updated = service.update_course(
        course_id, {"progress": progress}, workspace_id=library_workspace.get()
    )
    return {"progress": updated.progress.to_dict()}


@router.post("/{course_id}/telemetry")
async def post_telemetry(
    course_id: str, payload: TelemetryPayload
) -> dict[str, Any]:
    """上报一次**真实阅读遥测**（停留时长 + 滚动覆盖）。

    这是「进度不造假」的落点。

    之前「读过这一页」= 「打开过这一页」——连点 20 次翻页就能把进度
    推到 40%。现在「读过」需要**证据**：

    * 这一节被**打开**了（``visited_page_ids`` 追加），并且
    * 用户在这一节上**停留了至少** ``MIN_READ_DWELL_SECONDS`` 秒
      **或**把它**滚动到了底部**（``coverage`` 达到阈值）。

    只有满足「停留够久 **或** 真的滚到底」这一页才算**已读**，
    才计入覆盖率。没读完的页仍会出现在 ``visited_page_ids`` 里
    （它是「打开过」的记录），但**不**计入进度分母的分子。
    """
    service = get_course_service()
    try:
        course = service.get_course(course_id, workspace_id=library_workspace.get())
    except CourseError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    page_id = (payload.page_id or "").strip()
    if not page_id:
        raise HTTPException(status_code=400, detail="缺少 page_id。")

    known = {page.id for page in course.pages}
    if page_id not in known:
        raise HTTPException(status_code=404, detail="这一节不属于当前课程。")

    # 累计停留时长与滚动覆盖率——都只取**更大**的值，避免乱序上报
    # 把已有的进度改小。
    dwell = max(0.0, float(payload.dwell_seconds or 0.0))
    coverage = min(1.0, max(0.0, float(payload.coverage or 0.0)))

    visited = list(course.progress.visited_page_ids)
    if page_id not in visited:
        visited.append(page_id)

    page_dwell = dict(course.progress.page_dwell)
    page_dwell[page_id] = page_dwell.get(page_id, 0.0) + dwell

    page_coverage = dict(course.progress.page_coverage)
    page_coverage[page_id] = max(page_coverage.get(page_id, 0.0), coverage)

    total_dwell = float(course.progress.dwell_seconds) + dwell

    progress = course.progress.to_dict()
    progress["visited_page_ids"] = visited
    progress["current_page_id"] = page_id
    progress["updated_at"] = time.time()
    progress["dwell_seconds"] = total_dwell
    progress["page_dwell"] = page_dwell
    progress["page_coverage"] = page_coverage

    updated = service.update_course(
        course_id, {"progress": progress}, workspace_id=library_workspace.get()
    )
    return {"progress": updated.progress.to_dict()}


@router.post("/{course_id}/resource-telemetry")
async def post_resource_telemetry(
    course_id: str, payload: ResourceTelemetryPayload
) -> dict[str, Any]:
    """上报一次**资源级**学习痕迹（停留时长 + 完成标记）。

    为什么进度要下沉到资源
    ----------------------

    资源枢纽型课程里，一个节点下面挂着**多条**外链资源——一部讲荒诞
    的视频、一篇维基词条、一份 SEP 长文。进度只挂在节点上的话，
    「这个节点我学过了」是**误导**：用户可能只看了视频，压根没打开
    那篇长文。

    所以这里给每条资源单独记账：

    * ``dwell_seconds`` 累加（只增不减）；
    * ``opened`` 一旦为真就保持为真；
    * ``marked_done`` 是**用户显式**的意图——它比任何启发式都可靠，
      置为真之后就不再被改成假。

    资源是否算「已看」由后端判定（停留够久 **或** 显式标记），前端
    只负责如实上报。
    """
    service = get_course_service()
    try:
        course = service.get_course(course_id, workspace_id=library_workspace.get())
    except CourseError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    resource_id = (payload.resource_id or "").strip()
    if not resource_id:
        raise HTTPException(status_code=400, detail="缺少 resource_id。")

    known = {resource.id for resource in course.resources}
    if known and resource_id not in known:
        raise HTTPException(status_code=404, detail="这条资源不属于当前课程。")

    dwell = max(0.0, float(payload.dwell_seconds or 0.0))

    progress = course.progress.to_dict()
    resource_progress = dict(progress.get("resource_progress") or {})

    record = dict(resource_progress.get(resource_id) or {})
    record["resource_id"] = resource_id
    record["dwell_seconds"] = float(record.get("dwell_seconds") or 0.0) + dwell
    record["opened"] = True
    record["last_active_at"] = time.time()
    if payload.page_id:
        record["page_id"] = payload.page_id
    # 显式标记是**单向**的：用户标了「看完」就不会再被改回未完成。
    if payload.marked_done:
        record["marked_done"] = True
    record.setdefault("marked_done", False)

    resource_progress[resource_id] = record
    progress["resource_progress"] = resource_progress
    progress["updated_at"] = time.time()

    updated = service.update_course(
        course_id, {"progress": progress}, workspace_id=library_workspace.get()
    )
    return {"progress": updated.progress.to_dict()}


@router.get("/taxonomy")
async def get_taxonomy() -> dict[str, Any]:
    """通识分类目录：四大支柱与前置知识要求。"""
    return taxonomy.catalog()


@router.get("/{course_id}")
async def get_course(course_id: str) -> dict[str, Any]:
    service = get_course_service()
    try:
        course = service.get_course(course_id, workspace_id=library_workspace.get())
    except CourseError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    payload = course.to_dict()
    return {**payload, **taxonomy.describe(payload)}


@router.post("/create")
async def create_course(payload: CoursePayload) -> dict[str, Any]:
    service = get_course_service()
    try:
        course = service.create_course(
            _to_dict(payload), workspace_id=library_workspace.get()
        )
    except CourseError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return course.to_dict()


class MaterialPayload(BaseModel):
    """导入一段长文本作为教材。"""

    title: str = ""
    text: str = Field(..., min_length=1)


@router.post("/import")
async def import_material(payload: MaterialPayload) -> dict[str, Any]:
    """把一段长文本解析成课程。

    切分是**结构探测**而非模型理解——导入必须即时；逐节讲解是进入
    课程页之后 AI 的事。
    """
    from app.services.material_import import build_course_payload

    try:
        course_payload = build_course_payload(
            title=payload.title.strip() or "未命名教材",
            text=payload.text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    service = get_course_service()
    try:
        course = service.create_course(
            course_payload, workspace_id=library_workspace.get()
        )
    except CourseError as exc:
        # id 撞车时换个 id 再来一次——用户不该为重名操心。
        detail = str(exc)
        if "already exists" in detail.lower():
            suffix = course_payload["book"]["id"][:48]
            course_payload["book"]["id"] = f"{suffix}-{course_payload['pages'][0]['id'][-4:]}"
            for page in course_payload["pages"]:
                page["book_id"] = course_payload["book"]["id"]
            course_payload["spine"]["book_id"] = course_payload["book"]["id"]
            course_payload["progress"]["book_id"] = course_payload["book"]["id"]
            try:
                course = service.create_course(
                    course_payload, workspace_id=library_workspace.get()
                )
            except CourseError as exc2:
                raise HTTPException(status_code=400, detail=str(exc2)) from exc2
        else:
            raise HTTPException(status_code=400, detail=detail) from exc

    return course.to_dict()


@router.put("/{course_id}")
async def update_course(course_id: str, payload: CoursePayload) -> dict[str, Any]:
    service = get_course_service()
    try:
        course = service.update_course(
            course_id,
            _to_dict(payload),
            workspace_id=library_workspace.get(),
        )
    except CourseError as exc:
        detail = str(exc)
        status = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status, detail=detail)
    return course.to_dict()


@router.delete("/{course_id}")
async def delete_course(course_id: str) -> dict[str, str]:
    service = get_course_service()
    try:
        service.delete_course(course_id, workspace_id=library_workspace.get())
    except CourseError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "deleted", "id": course_id}


__all__ = ["router"]
