"""
用户个人档案 API
=================

挂在 ``/api/profile`` 下：

* ``GET  /``              —— 读档案；
* ``PUT  /``              —— 保存档案；
* ``GET  /meta``          —— 预设头像、地区、时区等选项；
* ``GET  /archive``       —— 导出完整学习档案（JSON）；
* ``POST /archive/import`` —— 从导出的档案恢复基本资料。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import user_profile_service as profile_service

router = APIRouter()


class ProfilePayload(BaseModel):
    """保存档案。"""

    nickname: str = ""
    avatar_id: str = "aurora"
    avatar_url: str = ""
    region: str = "cn"
    timezone: str = "Asia/Shanghai"
    locale: str = "zh-CN"
    goal: str = ""


@router.get("/")
async def read_profile(user_id: str = "default") -> dict[str, Any]:
    """读档案。"""
    return profile_service.get_profile(user_id)


@router.put("/")
async def write_profile(
    payload: ProfilePayload, user_id: str = "default"
) -> dict[str, Any]:
    """保存档案。

    返回**规整后**的档案——服务端会做校验，客户端传进来的东西
    未必都被接受（比如非法的头像 id 会被换回默认值）。
    """
    return profile_service.save_profile(
        user_id, payload.model_dump()
    )


@router.get("/meta")
async def read_meta() -> dict[str, Any]:
    """前端渲染档案表单需要的**静态选项**。"""
    return {
        "avatars": profile_service.PRESET_AVATARS,
        "regions": profile_service.REGIONS,
        "timezones": profile_service.TIMEZONES,
    }


@router.get("/archive")
async def export_archive(user_id: str = "default") -> dict[str, Any]:
    """导出完整学习档案。"""
    return profile_service.export_archive(user_id)


@router.post("/archive/import")
async def import_archive(payload: dict[str, Any]) -> dict[str, Any]:
    """从导出的档案恢复基本资料。"""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="档案格式不正确")
    return profile_service.import_archive(payload)


__all__ = ["router"]
