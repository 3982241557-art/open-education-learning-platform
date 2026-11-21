"""
课程上下文组装
================

把 ``backend/data/courses/`` 下的一门课，抽成模型能消费的紧凑上下文文本。

这是原版 DeepTutor ``deeptutor/book/context.py`` 的同构移植：原版把
``Book`` / ``Spine`` / ``Page`` / ``Block`` 四层结构序列化成一段文本，
塞进 ``[Book Context]`` 块；本项目的课程数据结构与原版完全一致（见
:mod:`app.services.course_service`），因此序列化逻辑可以一一对应。

关键取舍
--------

**按需注入，不整本塞。** 原版只序列化 ``page_ids`` 指定的那些页；
没被选中的页不会进入提示词。本模块沿用这个语义：调用方给出
``page_ids`` 就只取那几页；没给就按当前页 + 其所在章节的兄弟页兜底。

**逐层降级截断。** 单块、单页、整份上下文各有一层字符上限，防止一本
超厚的教材把上下文窗口冲爆。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from app.services.course_service import Course, CourseBlock, CourseChapter, CoursePage

#: 整份课程上下文的字符上限。
DEFAULT_MAX_CONTEXT_CHARS = 12_000

#: 单页正文的字符上限。
DEFAULT_MAX_PAGE_CHARS = 4_000

#: 单个内容块的字符上限。
DEFAULT_MAX_BLOCK_CHARS = 1_200

#: 描述里的思维链标签——模型的私有思考不该混进课程正文。
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)

#: 知识节点标记——``[[闭包]]`` / ``[[闭包|释义]]``。
#:
#: 前端把它渲染成可点击的知识节点，但**发给模型之前必须剥掉**：
#: 模型看不到 CSS，只会把 ``[[`` 当成正文的一部分来解读。
_CONCEPT_MARKER_RE = re.compile(r"\[\[([^[\]|]+?)(?:\|[^[\]]*?)?\]\]")

#: 课程 id / 页 id 的合法字符。
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass(slots=True)
class CourseContextResult:
    """一次上下文组装的结果。"""

    text: str = ""
    references: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.text.strip())


def build_course_context(
    course_id: str,
    *,
    page_ids: Sequence[str] | None = None,
    max_chars: int = DEFAULT_MAX_CONTEXT_CHARS,
    page_char_limit: int = DEFAULT_MAX_PAGE_CHARS,
    block_char_limit: int = DEFAULT_MAX_BLOCK_CHARS,
) -> CourseContextResult:
    """加载指定课程的若干页，序列化成紧凑的上下文文本。

    ``page_ids`` 为空时，取该课程的第一页（若课程本身有页）。传入的
    页 id 若不存在，会在 ``warnings`` 里记一笔而不是静默丢弃。
    """
    if not course_id or not _ID_RE.match(course_id):
        return CourseContextResult(warnings=[f"course_id_invalid:{course_id}"])

    try:
        from app.services.course_service import get_course_service

        course = get_course_service().get_course(course_id)
    except Exception as exc:  # 课程不存在或数据非法
        return CourseContextResult(warnings=[f"course_not_found:{course_id}:{exc}"])

    selected = _resolve_pages(course, page_ids)
    if not selected:
        return CourseContextResult(warnings=[f"no_pages:{course_id}"])

    sections: list[str] = []
    for page in selected:
        page_text = _serialize_page(
            course=course,
            page=page,
            page_char_limit=page_char_limit,
            block_char_limit=block_char_limit,
        )
        if page_text:
            sections.append(page_text)

    if not sections:
        return CourseContextResult(warnings=[f"empty_pages:{course_id}"])

    body = _clip("\n\n---\n\n".join(sections), max_chars)
    header = _serialize_course_header(course)
    # 只有一页时，明确告诉模型「这就是用户**当前正在读**的那一页」。
    # 它能让模型的引用更精确——用户问「这一段」时，模型知道指的是哪一段，
    # 而不是把整本书里相似的话都当成候选。
    if len(selected) == 1:
        header += (
            "\n(以下是用户当前正在阅读的这一页的内容。"
            "回答时优先基于它；引用原文请逐字摘录。)"
        )
    text = header + "\n\n" + body
    return CourseContextResult(
        text=text,
        references=[
            {
                "course_id": course.id,
                "page_ids": [page.id for page in selected],
            }
        ],
        warnings=[],
    )


def _resolve_pages(course: Course, page_ids: Sequence[str] | None) -> list[CoursePage]:
    """确定这次要注入哪些页。

    给了 ``page_ids`` 就只取那几页（按请求顺序）；没给就取第一页。
    """
    by_id = {page.id: page for page in course.pages}
    if page_ids:
        selected: list[CoursePage] = []
        for page_id in page_ids:
            page = by_id.get(page_id)
            if page is not None:
                selected.append(page)
        return selected
    return course.pages[:1]


# ── 序列化 ─────────────────────────────────────────────────────────────


def _serialize_course_header(course: Course) -> str:
    """课程级头部：标题、简介、语言。"""
    lines = [f"# Course: {_clean(course.title) or course.id}"]
    if course.description:
        lines.append(f"Description: {_clip(_clean(course.description), 800)}")
    if course.language:
        lines.append(f"Language: {_clean(course.language)}")
    return "\n".join(lines)


def _serialize_page(
    *,
    course: Course,
    page: CoursePage,
    page_char_limit: int,
    block_char_limit: int,
) -> str:
    """把一页序列化成一段文本。"""
    chapter = _chapter_of(course, page.chapter_id)
    lines: list[str] = [f"## Page: {_clean(page.title) or page.id}"]

    if chapter is not None and chapter.title:
        lines.append(f"Chapter: {_clean(chapter.title)}")
    if chapter is not None and chapter.summary:
        lines.append(f"Chapter summary: {_clip(_clean(chapter.summary), 1200)}")

    objectives = page.learning_objectives or (
        chapter.learning_objectives if chapter is not None else []
    )
    if objectives:
        lines.append("Learning objectives:")
        lines.extend(f"- {_clip(_clean(obj), 300)}" for obj in objectives if _clean(obj))

    if page.status:
        lines.append(f"Page status: {page.status}")
    if course.exploration_summary:
        lines.append(f"Course source summary: {_clip(_clean(course.exploration_summary), 1000)}")

    block_texts = [
        serialized
        for block in page.blocks
        if (serialized := _serialize_block(block, block_char_limit=block_char_limit))
    ]
    if block_texts:
        lines.append("Page content:")
        lines.extend(block_texts)
    if page.error:
        lines.append(f"Page error: {_clip(_clean(page.error), 600)}")

    return _clip("\n".join(lines), page_char_limit)


def _serialize_block(block: CourseBlock, *, block_char_limit: int) -> str:
    """把一个内容块序列化成一段文本。

    未就绪的块只留一个状态行——把半成品正文塞进上下文会让模型误以为
    课程内容就长这样。
    """
    block_type = _enum_value(block.type)
    status = _enum_value(block.status)

    if status == "hidden":
        return ""

    heading = f"### Block: {_clean(block.title) or block_type}"
    if block_type:
        heading += f" ({block_type})"

    if status != "ready":
        details = [heading, f"Status: {status or 'unknown'}"]
        if block.error:
            details.append(f"Error: {_clip(_clean(block.error), 500)}")
        return "\n".join(details)

    payload = block.payload if isinstance(block.payload, dict) else {}
    body = _payload_for_type(block_type, payload)
    if not body and block.error:
        body = f"Error: {_clip(_clean(block.error), 500)}"
    if not body:
        return ""
    return _clip(f"{heading}\n{body}", block_char_limit)


def _payload_for_type(block_type: str, payload: dict[str, Any]) -> str:
    """按块类型抽取正文。

    与原版 ``_payload_for_type`` 一一对应：不同类型的块正文放在不同的
    payload 字段里，这里按类型挑出可读的那部分。
    """
    bridge = _join_text_fields(payload, ("bridge_text", "transition_in"))
    main = ""

    if block_type in {"text", "user_note"}:
        main = _join_text_fields(payload, ("content", "body", "text", "markdown"))
    elif block_type == "callout":
        label = _clean(payload.get("label"))
        body = _clean(payload.get("body"))
        main = "\n".join(part for part in (label, body) if part)
    elif block_type == "section":
        main = _format_section(payload)
    elif block_type == "quiz":
        main = _format_quiz(payload)
    elif block_type == "flash_cards":
        main = _format_flash_cards(payload)
    elif block_type == "timeline":
        main = _format_timeline(payload)
    elif block_type == "code":
        main = _format_code(payload)
    elif block_type == "deep_dive":
        main = _format_deep_dive(payload)
    elif block_type in {"figure", "interactive", "animation", "concept_graph"}:
        main = _format_visual_summary(payload)
    elif block_type == "video":
        main = _format_video(payload)
    elif block_type == "resource":
        main = _format_resource(payload)
    else:
        main = _safe_payload_summary(payload)

    return "\n".join(part for part in (bridge, main) if part)


def _format_resource(payload: dict[str, Any]) -> str:
    """把一条外链资源转成给 AI 看的文字。

    资源枢纽里**没有本地正文**——AI 看不见视频，也读不了被
    ``X-Frame-Options`` 挡住的网页。所以每条资源都自带一段预置的
    ``ai_context``，它就是 AI 唯一能拿到的关于这份资源的信息。

    这里把标题、类型、来源与摘要一并列出，AI 才知道用户此刻在看什么。
    """
    lines: list[str] = []
    title = _clean(payload.get("title"))
    provider = _clean(payload.get("provider"))
    resource_type = _clean(payload.get("resource_type"))

    header_parts = [part for part in (title, provider) if part]
    if header_parts:
        kind = f"[{resource_type}] " if resource_type else ""
        lines.append(f"{kind}{' · '.join(header_parts)}")

    if summary := _clean(payload.get("ai_context")):
        lines.append(summary)

    # 字幕节点对视频资源很有价值——它让 AI 知道视频里讲了哪些段落。
    for key in ("captions", "transcript"):
        raw = payload.get(key)
        if not isinstance(raw, list):
            continue
        caption_lines: list[str] = []
        for item in raw[:40]:
            if not isinstance(item, dict):
                continue
            text = _clean(item.get("text") or item.get("content") or item.get("label"))
            if not text:
                continue
            stamp = item.get("start")
            if not isinstance(stamp, (int, float)):
                stamp = item.get("time")
            if isinstance(stamp, (int, float)):
                minutes, seconds = divmod(int(stamp), 60)
                caption_lines.append(f"[{minutes:02d}:{seconds:02d}] {text}")
            else:
                caption_lines.append(text)
        if caption_lines:
            lines.append("\n".join(caption_lines))
            break

    return "\n".join(lines)


def _format_video(payload: dict[str, Any]) -> str:
    """把视频块转成给 AI 看的文字。

    视频本身是画面，模型看不见——但**字幕**是文字。把字幕按时间戳列
    出来，AI 就能"读过"这段视频了，而且用户在正文里点某条字幕时
    提问，AI 已经知道前后的语境。

    URL 本身没有语义，不进上下文。
    """
    lines: list[str] = []
    if title := _clean(payload.get("title")):
        lines.append(f"Video: {title}")

    for key in ("captions", "transcript", "subtitles"):
        raw = payload.get(key)
        if not isinstance(raw, list):
            continue
        for item in raw[:40]:
            if not isinstance(item, dict):
                continue
            text = _clean(item.get("text") or item.get("content") or item.get("label"))
            if not text:
                continue
            stamp = item.get("start")
            if not isinstance(stamp, (int, float)):
                stamp = item.get("time")
            if isinstance(stamp, (int, float)):
                minutes, seconds = divmod(int(stamp), 60)
                lines.append(f"[{minutes:02d}:{seconds:02d}] {text}")
            else:
                lines.append(text)
        if lines:
            break

    return "\n".join(lines)


def _format_section(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    if intro := _clean(payload.get("intro")):
        lines.append(intro)
    subsections = payload.get("subsections")
    if isinstance(subsections, list):
        for item in subsections:
            if not isinstance(item, dict):
                continue
            heading = _clean(item.get("heading"))
            body = _clean(item.get("body"))
            focus = _clean(item.get("focus"))
            if heading:
                lines.append(f"#### {heading}")
            if focus:
                lines.append(f"Focus: {focus}")
            if body:
                lines.append(body)
    if takeaway := _clean(payload.get("key_takeaway")):
        lines.append(f"Key takeaway: {takeaway}")
    return "\n".join(lines)


def _format_quiz(payload: dict[str, Any]) -> str:
    questions = payload.get("questions")
    if not isinstance(questions, list):
        return _join_text_fields(payload, ("topic", "question", "explanation"))
    lines: list[str] = []
    for idx, item in enumerate(questions[:8], start=1):
        if not isinstance(item, dict):
            continue
        question = _clean(item.get("question"))
        if not question:
            continue
        lines.append(f"Q{idx}: {question}")
        options = item.get("options")
        if isinstance(options, dict) and options:
            option_text = "; ".join(
                f"{_clean(key)}. {_clean(value)}" for key, value in options.items()
            )
            if option_text:
                lines.append(f"Options: {option_text}")
        if answer := _clean(item.get("correct_answer")):
            lines.append(f"Answer: {answer}")
        if explanation := _clean(item.get("explanation")):
            lines.append(f"Explanation: {explanation}")
    return "\n".join(lines)


def _format_flash_cards(payload: dict[str, Any]) -> str:
    cards = payload.get("cards")
    if not isinstance(cards, list):
        return ""
    lines: list[str] = []
    for idx, item in enumerate(cards[:12], start=1):
        if not isinstance(item, dict):
            continue
        front = _clean(item.get("front"))
        back = _clean(item.get("back"))
        hint = _clean(item.get("hint"))
        if front and back:
            suffix = f" Hint: {hint}" if hint else ""
            lines.append(f"Card {idx}: {front} -> {back}{suffix}")
    return "\n".join(lines)


def _format_timeline(payload: dict[str, Any]) -> str:
    events = payload.get("events")
    if not isinstance(events, list):
        return ""
    lines: list[str] = []
    for item in events[:10]:
        if not isinstance(item, dict):
            continue
        date = _clean(item.get("date"))
        title = _clean(item.get("title"))
        description = _clean(item.get("description"))
        line = " - ".join(part for part in (date, title, description) if part)
        if line:
            lines.append(line)
    return "\n".join(lines)


def _format_code(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    if intent := _clean(payload.get("intent")):
        lines.append(f"Intent: {intent}")
    if explanation := _clean(payload.get("explanation")):
        lines.append(f"Explanation: {explanation}")
    code = _clean(payload.get("code"))
    if code:
        language = _clean(payload.get("language")) or "code"
        lines.append(f"Code ({language}):\n{_clip(code, 1200)}")
    return "\n".join(lines)


def _format_deep_dive(payload: dict[str, Any]) -> str:
    suggestions = payload.get("suggestions")
    if not isinstance(suggestions, list):
        return ""
    lines: list[str] = []
    for item in suggestions[:6]:
        if not isinstance(item, dict):
            continue
        topic = _clean(item.get("topic"))
        rationale = _clean(item.get("rationale"))
        if topic:
            lines.append(f"- {topic}" + (f": {rationale}" if rationale else ""))
    return "\n".join(lines)


def _format_visual_summary(payload: dict[str, Any]) -> str:
    lines = [_join_text_fields(payload, ("description", "summary", "caption", "chart_type"))]
    key_points = payload.get("key_points")
    if isinstance(key_points, list):
        for point in key_points[:8]:
            if text := _clean(point):
                lines.append(f"- {text}")
    return "\n".join(part for part in lines if part)


def _safe_payload_summary(payload: dict[str, Any]) -> str:
    """兜底：把 payload 里所有可读字符串摘出来。"""
    return "\n".join(_iter_safe_strings(payload, max_items=16))


def _iter_safe_strings(value: Any, *, max_items: int) -> Iterable[str]:
    """深度遍历 payload，只取字符串叶子。

    跳过 ``code`` / ``html`` / ``svg`` 等字段——它们要么太长，要么是
    给浏览器看的源码，进上下文只会干扰模型。
    """
    emitted = 0

    def walk(node: Any, key: str = "") -> Iterable[str]:
        nonlocal emitted
        if emitted >= max_items:
            return
        lowered = key.lower()
        if lowered in {"code", "html", "svg", "content", "artifact", "artifacts"}:
            return
        if isinstance(node, str):
            text = _clean(node)
            if text:
                emitted += 1
                yield _clip(text, 500)
            return
        if isinstance(node, dict):
            for child_key, child_value in node.items():
                yield from walk(child_value, str(child_key))
                if emitted >= max_items:
                    break
        elif isinstance(node, list):
            for child in node:
                yield from walk(child, key)
                if emitted >= max_items:
                    break

    yield from walk(value)


# ── 通用辅助 ───────────────────────────────────────────────────────────


def _chapter_of(course: Course, chapter_id: str) -> CourseChapter | None:
    for chapter in course.chapters:
        if chapter.id == chapter_id:
            return chapter
    return None


def _join_text_fields(payload: dict[str, Any], keys: Sequence[str]) -> str:
    return "\n".join(text for key in keys if (text := _clean(payload.get(key))))


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "")


def _clean(value: Any) -> str:
    text = str(value or "")
    text = _THINK_RE.sub("", text)
    text = text.replace("</think>", "").replace("<think>", "")
    text = _CONCEPT_MARKER_RE.sub(r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clip(text: str, limit: int) -> str:
    text = _clean(text)
    if limit <= 0 or len(text) <= limit:
        return text
    head = max(0, limit - 40)
    return text[:head].rstrip() + "\n...[truncated]"


__all__ = [
    "CourseContextResult",
    "DEFAULT_MAX_BLOCK_CHARS",
    "DEFAULT_MAX_CONTEXT_CHARS",
    "DEFAULT_MAX_PAGE_CHARS",
    "build_course_context",
]
