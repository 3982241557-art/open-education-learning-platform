"""
证书与掌握度 API
=================

挂在 ``/api/progress`` 下：

* ``GET  /certificates``      —— 证书墙（全部已颁发的证书）；
* ``GET  /certificates/:id``  —— 单张证书；
* ``POST /certificates/:id/name`` —— 修改学员姓名；
* ``GET  /certificates/:id/verify`` —— 验证证书真伪；
* ``POST /certificates/issue`` —— 手动颁发（自动颁发的补充）；
* ``GET  /eligibility``       —— 某门课是否够格发证书；
* ``GET  /mastery``           —— 学习阶梯（技能树）；
* ``POST /quiz``              —— 提交随堂检测作答。

模型不可用时返回 5xx 并带上可读原因，**不返回假内容**。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import certificate_service, mastery_service
from app.services.llm_factory import LLMCallError, LLMNotConfiguredError

router = APIRouter()


class NamePayload(BaseModel):
    """修改学员姓名。"""

    learner_name: str = Field(..., min_length=1, max_length=64)


class IssuePayload(BaseModel):
    """手动颁发证书。"""

    course_id: str = Field(..., min_length=1)
    course_title: str = ""
    course_title_en: str = ""
    category: str = ""
    learner_name: str = "海外华人学习者"
    coverage: float = 0.0
    quiz_accuracy: float = 0.0
    note_count: int = 0
    ask_count: int = 0
    watched_resources: int = 0
    total_resources: int = 0


class QuizPayload(BaseModel):
    """提交一次随堂检测。"""

    course_id: str = Field(..., min_length=1)
    node_key: str = Field(..., min_length=1)
    resource_id: str = ""
    title: str = ""
    questions: list[dict[str, Any]] = Field(default_factory=list)
    answers: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/certificates")
async def list_certificates() -> dict[str, Any]:
    """证书墙——全部已颁发的证书，按颁发时间倒序。"""
    items = certificate_service.list_certificates()
    return {"certificates": items, "count": len(items)}


@router.get("/certificates/{certificate_id}")
async def get_certificate(certificate_id: str) -> dict[str, Any]:
    """单张证书。"""
    record = certificate_service.find_certificate(certificate_id)
    if record is None:
        raise HTTPException(status_code=404, detail="证书不存在")
    return record


@router.get("/certificates/{certificate_id}/verify")
async def verify_certificate(certificate_id: str) -> dict[str, Any]:
    """验证证书真伪——重算指纹并比对。"""
    return certificate_service.verify_certificate(certificate_id)


@router.post("/certificates/{certificate_id}/name")
async def update_name(
    certificate_id: str, payload: NamePayload
) -> dict[str, Any]:
    """修改证书上的学员姓名。

    改完会重算指纹——这是有意的：改名是一次显式动作，应当留痕。
    """
    record = certificate_service.update_learner_name(
        certificate_id, payload.learner_name
    )
    if record is None:
        raise HTTPException(status_code=404, detail="证书不存在")
    return record


@router.post("/certificates/issue")
async def issue_certificate(payload: IssuePayload) -> dict[str, Any]:
    """颁发一张证书（幂等——同一门课只会有一张）。"""
    try:
        return certificate_service.issue_certificate(
            course_id=payload.course_id,
            course_title=payload.course_title,
            course_title_en=payload.course_title_en,
            category=payload.category,
            learner_name=payload.learner_name,
            coverage=payload.coverage,
            quiz_accuracy=payload.quiz_accuracy,
            note_count=payload.note_count,
            ask_count=payload.ask_count,
            watched_resources=payload.watched_resources,
            total_resources=payload.total_resources,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/eligibility")
async def get_eligibility(course_id: str) -> dict[str, Any]:
    """某门课是否够格发证书——以及**还差什么**。"""
    from app.services.progress_service import course_progress

    try:
        progress = course_progress(course_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"读取进度失败：{exc}") from exc

    return certificate_service.eligibility(progress)


@router.get("/mastery")
async def get_mastery(course_id: str) -> dict[str, Any]:
    """学习阶梯（技能树）。

    对资源枢纽型课程（中台），阶梯由中台的每一条视频的技能节点
    汇总而成；对普通课程，由课程自身的节点而成。
    """
    from app.services.global_hub_service import load_global_hub
    from app.services.hub_progress_service import HUB_COURSE_ID

    quizzes = mastery_service.hub_quizzes(course_id)

    if course_id == HUB_COURSE_ID:
        hub = load_global_hub()
        resources: list[dict[str, Any]] = []
        for category in hub.get("categories", []) or []:
            for resource in category.get("resources", []) or []:
                if isinstance(resource, dict):
                    resources.append(resource)
        return mastery_service.course_mastery(
            course_id=course_id, resources=resources, quizzes=quizzes
        )

    from app.services.course_service import get_course_service

    service = get_course_service()
    course = service.get_course(course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="课程不存在")

    resources = []
    for page in getattr(course, "pages", []) or []:
        resources.append(
            {
                "id": page.id,
                "title": getattr(page, "title", ""),
                "interactive_nodes": getattr(page, "interactive_nodes", []) or [],
                "guided_segments": getattr(page, "guided_segments", []) or [],
            }
        )
    return mastery_service.course_mastery(
        course_id=course_id, resources=resources, quizzes=quizzes
    )


@router.post("/quiz")
async def submit_quiz(payload: QuizPayload) -> dict[str, Any]:
    """提交一次随堂检测的作答。

    返回本次的准确率与是否达标——前端据此点亮技能节点。
    """
    if not payload.answers:
        raise HTTPException(status_code=400, detail="没有作答")

    return mastery_service.record_quiz_result(
        course_id=payload.course_id,
        node_key=payload.node_key,
        resource_id=payload.resource_id,
        questions=payload.questions,
        answers=payload.answers,
        title=payload.title,
    )


@router.post("/quiz/generate")
async def generate_quiz(payload: dict[str, Any]) -> dict[str, Any]:
    """为某个视频节点生成 3~5 道概念自测题。

    没有模型密钥时返回 5xx——**不返回假题**。假题比没有题更糟：
    用户会认真作答，然后发现自己被评估在一个不存在的东西上。
    """
    from app.services.ai_structurer import _extract_json
    from app.services.llm_factory import complete

    course_id = str(payload.get("course_id") or "")
    resource_id = str(payload.get("resource_id") or "")
    node_key = str(payload.get("node_key") or "")
    title = str(payload.get("title") or "")
    context = str(payload.get("context") or "")
    hint = str(payload.get("hint") or "")
    count = int(payload.get("count") or 3)

    if not resource_id:
        raise HTTPException(status_code=400, detail="缺少 resource_id")

    prompt = (
        "你是一位耐心的大学助教。请基于下面这段视频知识点的内容，"
        f"出 {count} 道**单项选择题**，用来检验学习者是否真的理解了它。\n\n"
        f"知识点标题：{title}\n"
        f"知识点讲解：{context or hint}\n\n"
        "要求：\n"
        "1. 每题 4 个选项，其中只有 1 个正确；\n"
        "2. 题目考**理解**而不是记忆细节；\n"
        "3. 每题配一句解释，说明为什么这个答案对、别的为什么错；\n"
        "4. 全部用简体中文。\n\n"
        '严格返回 JSON：{"questions": [{"question": "...", "options": ["a","b","c","d"], '
        '"answer": 0, "explanation": "..."}]}'
    )

    try:
        raw = await complete(
            prompt,
            system_prompt="你是一位大学助教，只输出 JSON，不要任何解释性文字。",
        )
    except (LLMNotConfiguredError, LLMCallError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"生成题目失败：{exc}") from exc

    data = _extract_json(raw)
    questions = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(questions, list) or not questions:
        raise HTTPException(status_code=502, detail="模型没有返回可用的题目")

    # 归一化——模型偶尔会漏字段或多给选项。
    cleaned: list[dict[str, Any]] = []
    for item in questions:
        if not isinstance(item, dict):
            continue
        options = [str(option) for option in (item.get("options") or []) if option]
        if len(options) < 2:
            continue
        try:
            answer = int(item.get("answer", 0))
        except (TypeError, ValueError):
            answer = 0
        if not 0 <= answer < len(options):
            answer = 0
        cleaned.append(
            {
                "question": str(item.get("question") or "").strip(),
                "options": options,
                "answer": answer,
                "explanation": str(item.get("explanation") or "").strip(),
            }
        )

    if not cleaned:
        raise HTTPException(status_code=502, detail="模型没有返回可用的题目")

    return {
        "course_id": course_id,
        "resource_id": resource_id,
        "node_key": node_key,
        "questions": cleaned,
    }


__all__ = ["router"]
