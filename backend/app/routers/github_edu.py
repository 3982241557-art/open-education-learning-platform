"""
GitHub 开源教育项目审核台 API
=============================

挂在 ``/api/resources/github`` 下：

* ``GET  /candidates``   —— 读取待审清单；
* ``POST /approve``      —— 勾选 / 忽略某一条；
* ``POST /fetch-approved`` —— **只拉取已批准的项目**并装配入库。

安全边界
--------

``fetch-approved`` 是这个模块唯一有**写主库**权限的接口，而它**只处理
``approval == "approved"`` 的条目**。

这是整个模块的关键约束：未经人工审核的仓库，**绝不可能**通过任何
路径进入正式课程大盘。筛选器只写候选清单，只有审核台的勾选能把
``approval`` 从 ``pending`` 改成 ``approved``。
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.llm_factory import LLMCallError, LLMNotConfiguredError

router = APIRouter()

#: 待审清单的路径——与 ``tools/github_edu_scout.py`` 的输出对齐。
REVIEW_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "github_candidates_review.json"
)


def _read_review() -> dict[str, Any]:
    if not REVIEW_PATH.exists():
        return {
            "updated_at": "",
            "description": "",
            "notice": "尚未运行 github_edu_scout.py，暂无候选清单。",
            "strategies": [],
            "summary": {
                "total": 0,
                "by_kind": {},
                "by_strategy": {},
                "approved": 0,
                "pending": 0,
                "ignored": 0,
            },
            "candidates": [],
        }
    try:
        raw = json.loads(REVIEW_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"读取候选清单失败：{exc}") from exc
    return raw if isinstance(raw, dict) else {}


def _write_review(payload: dict[str, Any]) -> None:
    REVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = REVIEW_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(REVIEW_PATH)


def _recount(payload: dict[str, Any]) -> dict[str, Any]:
    """重算统计数字。"""
    candidates = payload.get("candidates") or []
    summary = payload.get("summary") or {}
    summary["total"] = len(candidates)
    summary["approved"] = sum(
        1 for item in candidates if item.get("approval") == "approved"
    )
    summary["ignored"] = sum(
        1 for item in candidates if item.get("approval") == "ignored"
    )
    summary["pending"] = len(candidates) - summary["approved"] - summary["ignored"]
    payload["summary"] = summary
    return payload


class ApprovalPayload(BaseModel):
    """勾选 / 忽略一条。"""

    candidate_id: str = Field(..., min_length=1)
    #: ``approved`` / ``ignored`` / ``pending``。
    approval: str = Field(..., pattern="^(approved|ignored|pending)$")


@router.get("/candidates")
async def list_candidates() -> dict[str, Any]:
    """读取待审清单。"""
    return _read_review()


@router.post("/approve")
async def set_approval(payload: ApprovalPayload) -> dict[str, Any]:
    """勾选 / 忽略某一条候选。

    这是**唯一**能把 ``approval`` 改成 ``approved`` 的路径——筛选器
    写出来的一律是 ``pending``。
    """
    review = _read_review()
    candidates = review.get("candidates") or []
    target = None
    for item in candidates:
        if str(item.get("id") or "") == payload.candidate_id:
            target = item
            break
    if target is None:
        raise HTTPException(status_code=404, detail="候选项目不存在")

    target["approval"] = payload.approval
    target["approved_at"] = time.time() if payload.approval == "approved" else None

    _write_review(_recount(review))
    return target


@router.get("/inspect/{owner}/{repo}")
async def inspect_candidate(owner: str, repo: str) -> dict[str, Any]:
    """单条全览——拉取目录结构 + 核心文档，翻译成大白话。

    只在审核者**点开某一条**时才拉。这是按需加载，不是批量克隆。
    """
    from app.services.github_edu_inspect import inspect_candidate as _inspect

    full_name = f"{owner}/{repo}"
    return await _inspect(full_name)


@router.post("/fetch-approved")
async def fetch_approved() -> dict[str, Any]:
    """拉取**已批准**的项目并装配入库。

    只处理 ``approval == "approved"`` 的条目。

    装配方式
    --------
    每个被批准的项目变成公开课主库里的一条资源：

    * ``provider`` = ``github``；
    * ``url`` 指向仓库主页；
    * ``tags`` 带上它的分类归属与主题；
    * ``meta`` 记录星数、语言、license 等审核信息。

    拉取本身走 ``git clone --depth 1``——**只取最新的快照**，不拉
    整个历史。审核台已经确认过它是什么了，我们要的只是「把它变成一
    条可点击的课程条目」。

    失败是**局部**的：一个仓库拉不下来，不该让其他已批准的也失败。
    """
    review = _read_review()
    candidates = review.get("candidates") or []
    approved = [item for item in candidates if item.get("approval") == "approved"]

    if not approved:
        return {
            "fetched": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped": 0,
            "added": 0,
            "failures": [],
            "message": "还没有勾选批准任何项目。",
        }

    from app.services.github_edu_importer import import_approved_candidates

    try:
        result = await import_approved_candidates(approved)
    except (LLMNotConfiguredError, LLMCallError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # 把装配结果写回清单——审核者能看到「这条装进去了没有」。
    by_id = {str(item.get("id")): item for item in candidates}
    for entry in result.get("results", []):
        record = by_id.get(str(entry.get("candidate_id")))
        if record is not None:
            record["integration_result"] = {
                "status": entry.get("status"),
                "message": entry.get("message", ""),
                "resource_id": entry.get("resource_id"),
            }
    _write_review(_recount(review))

    return result


__all__ = ["router"]
