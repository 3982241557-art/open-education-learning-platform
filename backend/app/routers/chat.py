"""
聊天 API 路由
==============

一次提问的完整链路：

::

    前端 POST /api/chat
      ↓
    ① 动态拉取课程上下文（course_id / page_ids → backend/data/courses/）
      ↓
    ② Skill 调度（always: true 的正文 + 其余 skill 的 manifest）
      ↓
    ③ 组装 System Prompt + 多轮 messages
      ↓
    ④ 在控制台打印组装好的完整提示词
      ↓
    ⑤ 调用真实模型 → 解析 Action → 落盘笔记/计划/测验
      ↓
    前端渲染回复 + 执行动作

模型不可用时**明确报错**，绝不返回占位内容——见
:mod:`app.services.llm_factory`。
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.action_protocol import (
    Action,
    normalize_note_payload,
    normalize_plan_payload,
    normalize_quiz_payload,
    parse_actions,
)
from app.services.course_context import build_course_context
from app.services.learning_state import (
    load_notes,
    load_plans,
    load_session,
    save_quiz,
    save_session,
    upsert_note,
    upsert_plan,
)
from app.services.llm_factory import (
    LLMCallError,
    LLMNotConfiguredError,
    complete,
    describe_backend,
    has_real_model,
    stream,
)
from app.services.prompt_assembly import (
    PromptAssembler,
    log_assembled_prompt,
)
from app.services.skill_runtime import persona_instruction

logger = logging.getLogger(__name__)

router = APIRouter()

#: 当前页的笔记最多注入几条。
#:
#: 当前页的笔记最相关，但也得有上限——一页里划了 40 处，
#: 全塞进去就成了噪声。
PAGE_NOTE_LIMIT = 12

#: 跨页的「最近划线批注」最多注入几条。
RECENT_NOTE_LIMIT = 5

#: 学习计划最多注入几条。
PLAN_LIMIT = 10


class ChatRequest(BaseModel):
    """一次提问的入参。"""

    message: str = ""
    session_id: str | None = None
    #: 之前的轮次，用于维持对话连贯性。
    history: list[dict[str, str]] = Field(default_factory=list)
    #: 用户当前打开的课程。
    course_id: str | None = None
    #: 用户当前打开的页（可多选）。空表示由后端按课程默认取。
    page_ids: list[str] = Field(default_factory=list)
    #: 用户当前正在中间栏查看的**外链资源**。
    #:
    #: 资源枢纽型课程里，用户看的是外部视频 / 网页 / 电子书。AI 看不见
    #: 这些内容，只能靠前端把「当前资源」的元数据与预置摘要传过来。
    resource: dict[str, str] | None = None
    #: 用户点击视频画面上弹出的**交互节点**时，被唤醒的知识点。
    #:
    #: 形如 ``{"keyword": "机会成本", "timestamp": "02:00",
    #: "context": "……", "media_title": "……"}``。
    #:
    #: 它让 AI 精确知道「用户卡在视频的哪一秒、问的是哪个概念」——
    #: 这正是「流媒体交互式沙盘」里 AI 回答质量的来源。
    interactive: dict[str, str] | None = None
    #: 本次对话启用的「引擎级」skill。空列表表示不启用任何引擎。
    engines: list[str] | None = None
    #: 语言，影响基础块的措辞。
    language: str = "zh"
    #: 引用块——用户从正文划词后带入的原文。
    quotes: list[dict[str, str]] = Field(default_factory=list)
    #: 用户手动勾选引用给 AI 的笔记 id。
    note_ids: list[str] = Field(default_factory=list)
    #: 用户当轮选定的「回答模式」（persona skill）的名字。
    #:
    #: 选中后，该 skill 的正文会**即时替换** system 角色里的角色指令，
    #: 而之前的 user/assistant 历史保持不变——模型会立刻换一种语气
    #: 接续同一段对话。
    persona: str = ""


def _build_prompt(payload: ChatRequest):
    """跑一遍组装管线，返回 ``(assembled, course_context, warnings)``。"""
    warnings: list[str] = []

    # ① 课程上下文：按提问动态拉取，不预置、不整本塞。
    course_context = ""
    if payload.course_id:
        result = build_course_context(payload.course_id, page_ids=payload.page_ids or None)
        course_context = result.text
        warnings.extend(result.warnings)
        if not course_context:
            logger.info("课程上下文为空: course_id=%s", payload.course_id)

    # ② Skill 调度：always 约定 + 选中的引擎立即注入，其余以 manifest 给出。
    from app.services.skill_runtime import skill_manifest

    skills = skill_manifest(active_engines=payload.engines)

    # ③ 留存文档与计划：作为「用户自己的思考」进入上下文。
    state_context = _build_state_context(payload)

    # ③′ 当前外链资源：用户在中间栏正在看的那份外部资源。
    #
    # 资源枢纽型课程里没有本地正文，AI 唯一能拿到的关于「用户在看什
    # 么」的信息就是这里。所以它单独走一个区块，优先级高于课程正文。
    resource_context = _build_resource_context(payload)

    # ④ 用户当轮选定的「回答模式」：取它的正文，注入到 system prompt。
    persona_body = ""
    persona_name = ""
    if payload.persona:
        persona_body = persona_instruction(payload.persona)
        persona_name = payload.persona
        if not persona_body:
            warnings.append(f"未找到回答模式 skill：{payload.persona}")

    # ⑤ 组装。
    assembler = PromptAssembler(language=payload.language)
    assembled = assembler.assemble(
        user_message=payload.message,
        history=payload.history,
        course_context=course_context,
        skills_manifest=skills,
        workspace_instructions=state_context,
        skill_override=persona_body,
        skill_override_name=persona_name,
        resource_context=resource_context,
    )
    assembled.warnings = warnings
    return assembled


def _build_resource_context(payload: ChatRequest) -> str:
    """把「当前外链资源」渲染成一段给模型看的文字。

    字段来自前端：标题、类型、来源、链接、预置摘要。

    只有摘要与标题是**真正有信息量**的——链接对模型没有意义（它不能
    访问），但保留它有助于模型在回答里准确指出「你正在看的这份」。

    如果用户刚点了视频画面上的知识点气泡，还会附上**交互节点**区块：
    概念名、时间戳、以及那一刻的原文。模型据此能精确地「贴着这一段」
    讲，而不是泛泛而谈。
    """
    resource = payload.resource
    if not isinstance(resource, dict):
        return ""

    title = str(resource.get("title") or "").strip()
    summary = str(resource.get("ai_context") or resource.get("summary") or "").strip()
    interactive = payload.interactive if isinstance(payload.interactive, dict) else {}
    interactive_keyword = str(interactive.get("keyword") or "").strip()

    if not title and not summary and not interactive_keyword:
        return ""

    kind = str(resource.get("resource_type") or "").strip()
    provider = str(resource.get("provider") or "").strip()

    kind_label = {
        "video": "视频",
        "webpage": "网页",
        "document": "文档",
    }.get(kind, kind or "外部资源")

    lines = [f"资源标题：{title or '（未命名）'}"]
    if kind or provider:
        detail = " · ".join(part for part in (kind_label, provider) if part)
        lines.append(f"资源类型：{detail}")
    if summary:
        lines.append(f"摘要：{summary}")
    else:
        lines.append("摘要：（这份资源没有预置摘要）")

    # ── 交互节点：用户此刻真正卡住的那个知识点 ──
    if interactive_keyword:
        stamp = str(interactive.get("timestamp") or "").strip()
        media_title = str(interactive.get("media_title") or "").strip()
        context = str(interactive.get("context") or "").strip()
        hint = str(interactive.get("hint") or "").strip()

        lines.append("")
        lines.append("用户此刻正在视频里触发的一个知识点：")
        if stamp:
            lines.append(f"- 时间点：{stamp}")
        if media_title and media_title != title:
            lines.append(f"- 所在视频：{media_title}")
        lines.append(f"- 知识点：{interactive_keyword}")
        if context:
            lines.append(f"- 视频原话：「{context}」")
        if hint:
            lines.append(f"- 引导问题：{hint}")
        lines.append(
            "- 请**贴着这一段**回答：先解释这个概念在这句话里的具体含义，"
            "再用一个生活化的例子落地。不要泛泛介绍整个主题。"
        )

    return "\n".join(lines)


def _recent_notes(
    notes: list[dict[str, Any]], *, exclude: set[str], limit: int = 5
) -> list[dict[str, Any]]:
    """取出最近写入的若干条划线批注。

    按 ``updated_at`` 倒序——「最近」指的是用户**刚刚动过**的那条，
    而不是文件里排在前面的那条。
    """
    candidates = [
        item
        for item in notes
        if isinstance(item, dict)
        and str(item.get("id") or "") not in exclude
        and str(item.get("quote") or "").strip()
    ]

    def _stamp(item: dict[str, Any]) -> float:
        try:
            return float(item.get("updated_at") or item.get("created_at") or 0)
        except (TypeError, ValueError):
            return 0.0

    candidates.sort(key=_stamp, reverse=True)
    return candidates[:limit]


def _build_state_context(payload: ChatRequest) -> str:
    """把用户的留存文档与学习计划拼成一段上下文。

    分三层，**每层都有明确的上限**——上下文不是越多越好：

    1. **当前页的笔记**——用户正在读的这一页上的划线与批注。**优先**，
       因为它们和当前页的正文是同一段内容，模型的引用能直接对上；
    2. **用户勾选的笔记**——用户明确指名的，全量进入提示词；
    3. **最近的划线批注**——最近若干条（默认 5 条）兜底。

    为什么第 1 层排最前
    ------------------
    用户在第 3 页读到的内容，问的却是第 1 页的批注——如果把**所有**
    页的笔记一股脑塞进去，模型会同时看到几十条互不相干的划线，
    哪个才是当前的语境？先给当前页的、且**只给当前页的**，其余的
    再作为「学习轨迹」补充，模型才不会串台。

    第 3 层是「自主学习有迹可循」的关键：如果只有勾选才注入，
    用户刚划的那条线、下笔写的那句话根本到不了模型眼前，AI 就
    无从「基于用户的最新划线主动发问」。只带最近的、带上限，
    既让 AI 看得见用户在做什么，又不至于把上下文撑爆。
    """
    if not payload.course_id:
        return ""

    lines: list[str] = []
    notes = load_notes(payload.course_id)
    current_page_id = payload.page_ids[0] if payload.page_ids else ""

    # ① 当前页的笔记——与当前正文同页，优先呈现。
    if current_page_id:
        page_notes = [
            item
            for item in notes
            if isinstance(item, dict)
            and str(item.get("page_id") or "") == current_page_id
        ]
        if page_notes:
            lines.append("## 当前这一页的划线与批注")
            lines.append(
                "用户正在读的这一页上已经划了线、写了自己的想法。"
                "回答时优先结合它们，并在引用时用它们指代具体段落。"
            )
            for item in page_notes[:PAGE_NOTE_LIMIT]:
                quote = str(item.get("quote") or "").strip()
                note = str(item.get("note") or "").strip()
                piece = f"- 原文：{quote}" if quote else ""
                if note:
                    piece += f"；用户批注：{note}"
                if piece:
                    lines.append(piece)
            lines.append("")

    # ② 用户勾选的笔记——用户明确指名的，全量进入提示词。
    if payload.note_ids:
        wanted = set(payload.note_ids)
        selected = [
            item
            for item in notes
            if isinstance(item, dict) and item.get("id") in wanted
        ]
        if selected:
            lines.append("## 用户引用的留存笔记")
            for item in selected:
                quote = str(item.get("quote") or "").strip()
                note = str(item.get("note") or "").strip()
                piece = f"- 原文：{quote}" if quote else ""
                if note:
                    piece += f"；旁注：{note}"
                lines.append(piece)
            lines.append("")

    # ③ 最近的划线批注——跨页的学习轨迹，兜底。
    recent = _recent_notes(
        notes,
        exclude=set(payload.note_ids or []),
        limit=RECENT_NOTE_LIMIT,
    )
    if recent:
        lines.append("## 用户最近的划线批注（学习轨迹）")
        lines.append(
            "这些是用户刚刚在正文里划下并写下想法的段落。"
            "回答时请结合它们；可以主动就其中一处发问或补充解释。"
        )
        for item in recent:
            quote = str(item.get("quote") or "").strip()
            note = str(item.get("note") or "").strip()
            piece = f"- 原文：{quote}" if quote else ""
            if note:
                piece += f"；用户批注：{note}"
            lines.append(piece)
        lines.append("")

    plans = load_plans(payload.course_id)
    active = [item for item in plans if not item.get("completed")]
    if active:
        lines.append("## 当前学习计划")
        for item in active[:PLAN_LIMIT]:
            total = int(item.get("total") or 0)
            done = int(item.get("done") or 0)
            progress = f"（{done}/{total}）" if total else ""
            due = f"，目标时间：{item['due']}" if item.get("due") else ""
            lines.append(f"- {item.get('title', '')}{progress}{due}")
        lines.append("")

    if payload.quotes:
        lines.append("## 用户划选的原文")
        for quote in payload.quotes:
            text = str(quote.get("text") or "").strip()
            if text:
                lines.append(f"> {text}")
        lines.append("")

    return "\n".join(lines).strip()


def _apply_actions(
    actions: list[Action],
    *,
    course_id: str | None,
    page_ids: list[str],
) -> list[dict[str, object]]:
    """执行动作并落盘，返回给前端回执。"""
    receipts: list[dict[str, object]] = []
    page_id = page_ids[0] if page_ids else ""

    for action in actions:
        try:
            if action.action == "upsert_note":
                payload = normalize_note_payload(action.payload)
                if not payload["quote"] and not payload["note"]:
                    continue
                # 页 id 的优先级：**模型指定的 > 请求里带的**。
                # 模型如果自己指明了是哪一段，就该尊重它的判断——
                # 否则笔记会挂到当前页，而不是模型引用的那一段。
                payload.update(
                    {
                        "page_id": payload.get("page_id") or page_id,
                        "origin": "ai",
                        "course_id": course_id or "",
                    }
                )
                saved = upsert_note(course_id or "", payload)
                receipts.append({"action": "upsert_note", "ok": True, "result": saved})

            elif action.action == "manage_plan":
                payload = normalize_plan_payload(action.payload)
                if not payload["title"]:
                    continue
                payload["course_id"] = course_id or ""
                payload["origin"] = "ai"
                op = payload.pop("op", "create")

                if op == "delete":
                    from app.services.learning_state import delete_plan

                    delete_plan(course_id or "", str(payload.get("id") or ""))
                    receipts.append({"action": "manage_plan", "ok": True, "op": "delete"})
                    continue

                saved = upsert_plan(course_id or "", payload)
                receipts.append({"action": "manage_plan", "ok": True, "result": saved})

            elif action.action == "trigger_quiz":
                payload = normalize_quiz_payload(action.payload)
                if not payload["questions"]:
                    continue
                # 记下这次测验发生在哪一页——章节级的掌握度要靠它
                # 把测验落到具体的章节上。
                payload["page_id"] = page_id
                record = save_quiz(course_id or "", payload)
                receipts.append({"action": "trigger_quiz", "ok": True, "result": record})
        except Exception as exc:
            logger.warning("执行动作 %s 失败: %s", action.action, exc)
            receipts.append(
                {"action": action.action, "ok": False, "error": str(exc)}
            )

    return receipts


def _persist_session(
    course_id: str | None,
    history: list[dict[str, str]],
    question: str,
    reply: str,
) -> None:
    """把这一轮对话追加到课程级历史。

    前端传来的 ``history`` 是**本轮提问之前**的旧对话，因此这里要补上
    本轮的「提问 + 回答」，否则历史里会缺掉最近一轮。
    """
    if not course_id:
        return

    stored = load_session(course_id)
    for item in history:
        role = str(item.get("role") or "").strip()
        content = str(item.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            stored.append({"role": role, "content": content, "created_at": 0.0})

    if question.strip():
        stored.append({"role": "user", "content": question.strip(), "created_at": 0.0})
    if reply.strip():
        stored.append({"role": "assistant", "content": reply.strip(), "created_at": 0.0})

    save_session(course_id, stored)


@router.post("")
async def chat(payload: ChatRequest) -> dict[str, object]:
    """处理一次提问，返回完整回复与动作回执。"""
    assembled = _build_prompt(payload)

    log_assembled_prompt(
        assembled,
        label=f"session={payload.session_id or '-'} course={payload.course_id or '-'}",
    )

    try:
        raw = await complete(
            prompt=payload.message,
            system_prompt=assembled.system_prompt,
            messages=assembled.messages,
            course_id=payload.course_id,
            engines=payload.engines,
        )
    except LLMNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    reply, actions = parse_actions(raw)
    receipts = _apply_actions(
        actions, course_id=payload.course_id, page_ids=payload.page_ids
    )
    _persist_session(payload.course_id, payload.history, payload.message, reply)

    return {
        "reply": reply,
        "actions": receipts,
        "session_id": payload.session_id or "default",
        "backend": describe_backend(),
        "skills_manifest": assembled.skills_manifest,
        "course_context_chars": len(assembled.course_context),
        "system_prompt_chars": len(assembled.system_prompt),
    }


@router.post("/stream")
async def chat_stream(payload: ChatRequest) -> StreamingResponse:
    """流式版本：逐段吐出文本增量。

    输出 ``text/event-stream``，事件形如 ``data: {"delta": "..."}``，
    最后是 ``data: {"done": true}``。

    **动作在流式下被延后**：动作围栏往往横跨多段增量，边流边解析会
    反复解析半截 JSON。因此流式阶段只送文本，流结束后统一解析并
    执行动作，再补一条 ``action`` 事件。
    """
    assembled = _build_prompt(payload)
    log_assembled_prompt(
        assembled,
        label=f"stream session={payload.session_id or '-'} course={payload.course_id or '-'}",
    )

    async def event_source():
        # 第一条事件带上后端信息，前端据此显示真实模型状态。
        yield f"data: {json.dumps({'backend': describe_backend()}, ensure_ascii=False)}\n\n"

        raw_parts: list[str] = []
        try:
            async for chunk in stream(
                prompt=payload.message,
                system_prompt=assembled.system_prompt,
                messages=assembled.messages,
                course_id=payload.course_id,
                engines=payload.engines,
            ):
                if not chunk:
                    continue
                raw_parts.append(chunk)
                yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"
        except LLMNotConfiguredError as exc:
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
            return
        except LLMCallError as exc:
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
            return
        except Exception as exc:  # noqa: BLE001
            # 流已开始就不能改状态码了——只能把错误作为事件送出去。
            # 不兜住的话，用户看到的是「回答到一半卡住了」，而不是
            # 「模型请求失败：xxx」。
            logger.exception("流式对话异常")
            yield f"data: {json.dumps({'error': f'模型请求失败：{exc}'}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
            return

        # 流结束后统一解析动作并执行。
        reply, actions = parse_actions("".join(raw_parts))
        receipts = _apply_actions(
            actions, course_id=payload.course_id, page_ids=payload.page_ids
        )

        # 测验单独发一个事件——前端要把它渲染成**可交互的答题卡**，
        # 而不是塞进动作回执里让人自己去挖。
        for receipt in receipts:
            if receipt.get("action") == "trigger_quiz" and receipt.get("ok"):
                result = receipt.get("result")
                if isinstance(result, dict) and result.get("questions"):
                    yield f"data: {json.dumps({'quiz': result}, ensure_ascii=False)}\n\n"

        if receipts:
            yield f"data: {json.dumps({'actions': receipts}, ensure_ascii=False)}\n\n"

        _persist_session(payload.course_id, payload.history, payload.message, reply)
        yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/manifest")
async def manifest() -> dict[str, str]:
    """当前这次对话会注入的 skill manifest。"""
    from app.services.skill_runtime import skill_manifest

    return {"manifest": skill_manifest()}


@router.get("/engines")
async def engines() -> dict[str, list[dict[str, object]]]:
    """列出全部「引擎级」skill，供前端的策略选择面板渲染。"""
    from app.services.skill_runtime import engine_skills

    return {"engines": engine_skills()}


@router.get("/personas")
async def personas() -> dict[str, list[dict[str, object]]]:
    """列出全部可切换的「回答模式」skill。

    与 ``/engines`` 的区别：引擎是**默认生效、可叠加**的启发逻辑；
    回答模式是**互斥**的——用户当下选了哪一个，就只用那一个。
    """
    from app.services.skill_runtime import persona_skills

    return {"personas": persona_skills()}


@router.get("/session")
async def session(course_id: str = "") -> dict[str, object]:
    """读出某门课的对话历史——切回课程时恢复现场。"""
    return {
        "course_id": course_id,
        "messages": load_session(course_id),
    }


__all__ = ["router"]
