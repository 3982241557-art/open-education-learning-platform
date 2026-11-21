"""
学习状态 API 路由
==================

挂在 ``/api/learning`` 下。它承载「学习状态」的读写——留存文档、学习
计划、测验记录、课程级会话历史。

三端互通
--------

* 课程页的「留存文档」抽屉读 ``/notes``，AI 的 ``upsert_note`` 动作也
  写同一个地方；
* 「学习计划」页面读 ``/plans``，AI 的 ``manage_plan`` 动作写同一个
  地方——**AI 制定的计划自动出现在计划页，用户勾选的状态实时回给
  AI**；
* 测验记录 ``/quizzes`` 供回顾。

所有接口都按 ``course_id`` 隔离。没有课程时用空串（落到 ``_freeform``）。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.learning_state import (
    delete_note,
    delete_plan,
    load_notes,
    load_plans,
    load_quizzes,
    load_session,
    record_quiz_answers,
    save_session,
    set_plan_progress,
    upsert_note,
    upsert_plan,
)
from app.services.plan_calendar import apply_scope_to_plan
from app.services.progress_service import course_progress, progress_overview

router = APIRouter()


class NotePayload(BaseModel):
    """新增 / 更新一条留存文档。

    所有「可选」字段都用 ``None`` 表示**没传**，而不是空串——

    - ``None`` → 这次不改这个字段（保留原值）；
    - ``""``   → 用户显式要清空这个字段。

    两者必须分得开。左栏改旁注时只带 ``id`` 与 ``note``，如果形状
    与配色的默认值是空串，后端就会把这条划线的样式顺手抹掉。
    """

    id: str = ""
    #: 课程 id——前端常把它放在请求体里，优先于查询参数。
    course_id: str = ""
    quote: str | None = None
    note: str | None = None
    page_id: str | None = None
    block_id: str | None = None
    origin: str | None = None
    #: 划线样式——形状（``highlight`` / ``underline`` / ``wavy``）。
    #:
    #: 必须是 ``None`` 而不是空串——空串表示「用户显式要把形状清掉」，
    #: 而**不传**表示「这次不改形状」。如果默认值是空串，左栏改个
    #: 旁注就会顺手把这条划线的形状与配色抹掉。
    style: str | None = None
    #: 莫兰迪配色 id（``amber`` / ``haze`` / ``bean`` / ``rose`` / ``lilac``）。
    color: str | None = None


class PlanPayload(BaseModel):
    """新增 / 更新一条学习计划。"""

    id: str = ""
    title: str = ""
    detail: str = ""
    course_id: str = ""
    due: str = ""
    #: 日历粒度：``year`` / ``month`` / ``day`` / ``slot``。
    scope: str = ""
    #: 日历定位的起点（ISO 字符串）。
    start_at: str = ""
    #: 日历定位的终点（仅 ``slot`` 用）。
    end_at: str = ""
    items: list[str] = Field(default_factory=list)
    done: int | None = None
    completed: bool | None = None
    origin: str = "user"


class ProgressPayload(BaseModel):
    """更新计划进度。"""

    done: int = 0


class QuizAnswerPayload(BaseModel):
    """一次测验的作答。

    键是题号（字符串形式的 0-based 序号），值是选中的选项下标。
    """

    answers: dict[str, Any] = Field(default_factory=dict)


class SessionPayload(BaseModel):
    """覆盖写入课程级会话历史。"""

    messages: list[dict[str, str]] = Field(default_factory=list)


@router.get("/notes")
async def get_notes(course_id: str = "") -> dict[str, Any]:
    """读出某门课的留存文档。"""
    return {"notes": load_notes(course_id)}


@router.post("/notes")
async def post_notes(course_id: str = "", payload: NotePayload = NotePayload()) -> dict[str, Any]:
    """新增或更新一条留存文档。"""
    # 「内容为空」只对**新建**成立。更新一条已有笔记时可以只改样式
    # （换颜色 / 换线型）而不碰原文与旁注——这时 quote 和 note 都是
    # 空的，但请求本身是合法的。
    if not payload.id and not payload.quote and not payload.note:
        raise HTTPException(status_code=400, detail="笔记内容不能为空。")
    saved = upsert_note(course_id, payload.model_dump())
    target = payload.course_id or course_id
    return {"note": saved, "notes": load_notes(target)}


@router.delete("/notes/{note_id}")
async def remove_notes(note_id: str, course_id: str = "") -> dict[str, Any]:
    """删除一条留存文档。"""
    if not delete_note(course_id, note_id):
        raise HTTPException(status_code=404, detail="找不到这条笔记。")
    return {"notes": load_notes(course_id)}


@router.get("/plans")
async def get_plans(course_id: str = "") -> dict[str, Any]:
    """读出学习计划。``course_id`` 为空时返回全部课程的计划。

    每条计划都会补上 ``scope`` / ``start_at`` / ``end_at``——AI 写的
    自然语言截止时间（「下周五」「11 月」）在这里被推断成日历可用的
    结构化时间点。
    """
    plans = [apply_scope_to_plan(plan) for plan in load_plans(course_id)]
    return {"plans": plans}


@router.post("/plans")
async def post_plans(course_id: str = "", payload: PlanPayload = PlanPayload()) -> dict[str, Any]:
    """新增或更新一条学习计划。"""
    if not payload.title and not payload.id:
        raise HTTPException(status_code=400, detail="计划标题不能为空。")
    target = payload.course_id or course_id
    saved = upsert_plan(target, payload.model_dump(exclude_none=True))
    saved = apply_scope_to_plan(saved)
    return {"plan": saved, "plans": [apply_scope_to_plan(p) for p in load_plans(target)]}


@router.post("/plans/{plan_id}/progress")
async def post_progress(
    plan_id: str,
    payload: ProgressPayload,
    course_id: str = "",
) -> dict[str, Any]:
    """更新计划进度（勾选完成条目）。"""
    updated = set_plan_progress(course_id, plan_id, payload.done)
    if updated is None:
        raise HTTPException(status_code=404, detail="找不到这条计划。")
    return {"plan": updated, "plans": load_plans(course_id)}


@router.delete("/plans/{plan_id}")
async def remove_plans(plan_id: str, course_id: str = "") -> dict[str, Any]:
    """删除一条学习计划。"""
    if not delete_plan(course_id, plan_id):
        raise HTTPException(status_code=404, detail="找不到这条计划。")
    return {"plans": load_plans(course_id)}


@router.get("/progress")
async def get_progress(course_id: str = "") -> dict[str, Any]:
    """学情聚合。

    ``course_id`` 为空时返回**全部**课程的学情大盘；给了课程 id 则
    只返回那一门课的详细学情。
    """
    if course_id:
        return {"courses": [course_progress(course_id)], "summary": {}}
    return progress_overview()


@router.get("/quizzes")
async def get_quizzes(course_id: str = "") -> dict[str, Any]:
    """读出测验记录。"""
    return {"quizzes": load_quizzes(course_id)}


@router.post("/quizzes/{quiz_id}/answer")
async def post_quiz_answer(
    quiz_id: str,
    payload: QuizAnswerPayload,
    course_id: str = "",
) -> dict[str, Any]:
    """提交一次测验的作答。

    没有这一步，「测验正确率」只能是「—」——前端在本地批改，从不
    把选了哪个选项告诉后端，学情中心就永远拿不到真实信号。

    请求体形如 ``{"answers": {"0": 2, "1": 0}}``——键是题号（从 0
    开始），值是选中的选项下标。
    """
    updated = record_quiz_answers(course_id, quiz_id, payload.answers)
    if updated is None:
        raise HTTPException(status_code=404, detail="找不到这次测验。")
    return {"quiz": updated}


@router.get("/session")
async def get_session(course_id: str = "") -> dict[str, Any]:
    """读出课程级会话历史。"""
    return {"course_id": course_id, "messages": load_session(course_id)}


@router.post("/session")
async def post_session(course_id: str = "", payload: SessionPayload = SessionPayload()) -> dict[str, Any]:
    """覆盖写入课程级会话历史。"""
    count = save_session(course_id, payload.messages)
    return {"course_id": course_id, "saved": count}


__all__ = ["router"]
