"""
AI 洞察 API 路由
=================

挂在 ``/api/insight`` 下：

* ``GET  /actions``       —— 选区工具条的动作清单（含「预填」与「朗读」标记）；
* ``POST /next-steps``    —— 看完当前页，给出 3 个可点击的下一步建议；
* ``POST /selection``     —— 解读用户划选的文字；
* ``POST /vision``        —— 识别用户上传的图片；
* ``POST /advisor``       —— 宏观学习向导（AI 指导二）。

模型不可用时返回 5xx 并带上可读原因，**不返回假内容**。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.advisor_service import advise
from app.services.insight_service import (
    SELECTION_ACTIONS,
    TRANSLATE_VARIANTS,
    analyze_image,
    analyze_selection,
    next_steps,
)
from app.services.llm_factory import LLMCallError, LLMNotConfiguredError

router = APIRouter()


class NextStepsPayload(BaseModel):
    """请求下一步建议。"""

    course_id: str = ""
    page_id: str = ""


class SelectionPayload(BaseModel):
    """请求解读一段选中的文字。"""

    text: str = Field(..., min_length=1)
    action: str = "explain"
    course_id: str = ""
    page_id: str = ""


class VisionPayload(BaseModel):
    """请求识别一张图片。"""

    image_base64: str = Field(..., min_length=1)
    mime_type: str = "image/png"
    question: str = ""
    course_id: str = ""
    page_id: str = ""


class AdvisorPayload(BaseModel):
    """请求宏观学习向导的建议。"""

    course_id: str = ""
    page_id: str = ""


def _model_error(exc: Exception) -> HTTPException:
    """把模型异常翻译成可读的 HTTP 错误。"""
    if isinstance(exc, LLMNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    return HTTPException(status_code=502, detail=str(exc))


@router.get("/actions")
async def list_actions() -> dict[str, Any]:
    """选区工具条的动作清单（含「预填」与「朗读」标记，以及翻译子选项）。"""
    return {
        "actions": [dict(item) for item in SELECTION_ACTIONS],
        "variants": [dict(item) for item in TRANSLATE_VARIANTS],
    }


@router.post("/next-steps")
async def get_next_steps(payload: NextStepsPayload) -> dict[str, Any]:
    """下一步引擎：主动给出 3 个建议。"""
    try:
        result = await next_steps(course_id=payload.course_id, page_id=payload.page_id)
    except (LLMNotConfiguredError, LLMCallError) as exc:
        raise _model_error(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"生成建议失败：{exc}") from exc
    return result.to_dict()


@router.post("/selection")
async def post_selection(payload: SelectionPayload) -> dict[str, Any]:
    """解读选中的文字。"""
    try:
        return await analyze_selection(
            text=payload.text,
            action=payload.action,
            course_id=payload.course_id,
            page_id=payload.page_id,
        )
    except (LLMNotConfiguredError, LLMCallError) as exc:
        raise _model_error(exc) from exc


@router.post("/vision")
async def post_vision(payload: VisionPayload) -> dict[str, Any]:
    """识别图片并结合当前上下文解读。"""
    try:
        return await analyze_image(
            image_base64=payload.image_base64,
            mime_type=payload.mime_type,
            question=payload.question,
            course_id=payload.course_id,
            page_id=payload.page_id,
        )
    except (LLMNotConfiguredError, LLMCallError) as exc:
        raise _model_error(exc) from exc


@router.post("/advisor")
async def post_advisor(payload: AdvisorPayload) -> dict[str, Any]:
    """宏观学习向导（AI 指导二）：章级学习策略与高质量提问。"""
    try:
        result = await advise(course_id=payload.course_id, page_id=payload.page_id)
    except (LLMNotConfiguredError, LLMCallError) as exc:
        raise _model_error(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"生成学习建议失败：{exc}") from exc
    return result.to_dict()


__all__ = ["router"]
