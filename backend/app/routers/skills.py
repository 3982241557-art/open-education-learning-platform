"""
Skills API 路由
================

``SKILL.md`` 包的 CRUD 接口，挂在 ``/api/skills`` 下。

``skill_workspace`` 查询参数选择工作区作用域：给了就从该工作区读写，
不给就是账号级目录。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.skill_runtime import library_workspace
from app.services.skill_service import (
    InvalidSkillNameError,
    InvalidTagError,
    SkillExistsError,
    SkillImportError,
    SkillNotFoundError,
    SkillReadOnlyError,
    TagExistsError,
    TagNotFoundError,
    get_skill_service,
)

router = APIRouter()


class CreateSkillRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    description: str = ""
    content: str = ""
    tags: list[str] = Field(default_factory=list)


class UpdateSkillRequest(BaseModel):
    description: str | None = None
    content: str | None = None
    rename_to: str | None = None
    tags: list[str] | None = None


class CreateTagRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=32)


class RenameTagRequest(BaseModel):
    rename_to: str = Field(..., min_length=1, max_length=32)


def get_service():
    """当前作用域的**写入层**。

    带工作区 id 时写进该工作区私有目录，否则写进账号层
    （``backend/data/skills/``）。读取走 :func:`visible_skills` 的合并视图，
    内置 skill 在任何作用域下都可见且只读。
    """
    from app.services.skill_runtime import workspace_skill_service

    workspace_id = library_workspace.get()
    return workspace_skill_service(workspace_id) if workspace_id else get_skill_service()


def list_visible_skills() -> list[dict[str, object]]:
    """合并视图：workspace > account > admin > builtin，后者被前者遮蔽。"""
    from app.services.skill_runtime import visible_skills

    return [info.to_dict() for info, _service in visible_skills(library_workspace.get())]


# ── 标签路由（声明在 `/{name}` 之前，避免被遮蔽） ────────────────────


@router.get("/tags/list")
async def list_tags() -> dict[str, list[str]]:
    service = get_service()
    return {"tags": service.list_tags()}


@router.post("/tags/create")
async def create_tag(payload: CreateTagRequest) -> dict[str, str]:
    service = get_service()
    try:
        name = service.create_tag(payload.name)
    except TagExistsError as exc:
        raise HTTPException(status_code=409, detail=f"Tag already exists: {exc}")
    except InvalidTagError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"name": name}


@router.put("/tags/{tag}")
async def rename_tag(tag: str, payload: RenameTagRequest) -> dict[str, str]:
    service = get_service()
    try:
        new_tag = service.rename_tag(tag, payload.rename_to)
    except TagNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tag not found: {tag}")
    except TagExistsError as exc:
        raise HTTPException(status_code=409, detail=f"Tag already exists: {exc}")
    except InvalidTagError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"name": new_tag}


@router.delete("/tags/{tag}")
async def delete_tag(tag: str) -> dict[str, str]:
    service = get_service()
    try:
        service.delete_tag(tag)
    except TagNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tag not found: {tag}")
    except InvalidTagError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "deleted", "name": tag}


# ── skill 路由 ────────────────────────────────────────────────────────


@router.get("/list")
async def list_skills() -> dict[str, list[dict[str, object]]]:
    return {"skills": list_visible_skills()}


@router.get("/engines")
async def list_engines() -> dict[str, list[dict[str, object]]]:
    """列出全部「引擎级」skill（``engine: true``）。

    引擎 skill 与普通 skill 的区别在于**调度权重**：它们的正文会立即
    注入系统提示词，而不是等模型按需调用。静态教材再多也只是被读取的
    素材，引擎才决定「怎么教」。
    """
    from app.services.skill_runtime import engine_skills

    return {"engines": engine_skills()}


@router.get("/{name}")
async def get_skill(name: str) -> dict[str, object]:
    from app.services.skill_runtime import resolve_skills

    service = resolve_skills(library_workspace.get()).get(name)
    if service is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")
    try:
        return service.get_detail(name).to_dict()
    except SkillNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")
    except InvalidSkillNameError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/create")
async def create_skill(payload: CreateSkillRequest) -> dict[str, object]:
    service = get_service()
    try:
        info = service.create(
            name=payload.name,
            description=payload.description,
            content=payload.content,
            tags=list(payload.tags or []),
        )
    except SkillExistsError:
        raise HTTPException(status_code=409, detail=f"Skill already exists: {payload.name}")
    except InvalidSkillNameError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except InvalidTagError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return info.to_dict()


@router.put("/{name}")
async def update_skill(name: str, payload: UpdateSkillRequest) -> dict[str, object]:
    from app.services.skill_runtime import resolve_skills

    service = resolve_skills(library_workspace.get()).get(name) or get_service()
    try:
        info = service.update(
            name,
            description=payload.description,
            content=payload.content,
            rename_to=payload.rename_to,
            tags=payload.tags,
        )
    except SkillNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")
    except SkillReadOnlyError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except SkillExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except InvalidSkillNameError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except InvalidTagError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return info.to_dict()


@router.delete("/{name}")
async def delete_skill(name: str) -> dict[str, str]:
    from app.services.skill_runtime import resolve_skills

    service = resolve_skills(library_workspace.get()).get(name) or get_service()
    try:
        service.delete(name)
    except SkillNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")
    except SkillReadOnlyError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except InvalidSkillNameError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "deleted", "name": name}


__all__ = ["router"]
