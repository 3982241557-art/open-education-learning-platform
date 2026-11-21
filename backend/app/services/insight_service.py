"""
AI 洞察服务
============

让 AI 从「等着被问」变成「主动在场」。三条能力：

1. **下一步引擎** —— 看完当前页，AI 主动给出 3 个可点击的建议；
2. **选区解读** —— 用户划一段文字，AI 解释 / 翻译 / 朗读 / 出思维导图；
3. **视觉识别** —— 用户上传图片，AI 看图并结合当前课程解读。

为什么单独一个服务
------------------

这三条能力**不走完整 prompt 组装管线**。完整管线会把 skill 正文、
课程上下文、对话历史全部拼进去，耗时以秒计；而看板的刷新频率是以
「用户翻页」为单位的——每次翻页都等一次完整组装会让界面发僵。

所以这里走**轻量通道**：只取当前页的相关内容，组一个短的提示词。
代价是上下文更少，好处是响应在百毫秒级。

关于降级
--------

**没有降级**。模型不可用时直接报错——一条伪造的建议比没有建议更糟，
用户会以为那真的是 AI 给的方法论。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import base64
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

#: 建议的最大数量。
MAX_SUGGESTIONS = 3

#: 选区解读的最大字符数。
MAX_SELECTION_CHARS = 3_000

#: 单张图片的最大字节数（base64 解码后）。
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@dataclass(slots=True)
class Suggestion:
    """一条下一步建议。"""

    id: str
    title: str
    prompt: str
    hint: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "prompt": self.prompt,
            "hint": self.hint,
        }


@dataclass(slots=True)
class InsightResult:
    """一次洞察的结果。"""

    suggestions: list[Suggestion] = field(default_factory=list)
    #: AI 对当前状态的感知描述（用于看板顶部的呼吸提示）。
    awareness: str = ""
    #: 是否由真实模型生成。
    from_model: bool = False
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "suggestions": [item.to_dict() for item in self.suggestions],
            "awareness": self.awareness,
            "from_model": self.from_model,
            "warnings": list(self.warnings),
        }


# ── 选区动作 ───────────────────────────────────────────────────────────

#: 选区工具条的动作定义。
#:
#: ``prefill`` 标记的动作**不直接调用模型**——它们把选中文本与结构化
#: 指令预填到主 AI 的输入框，把光标留给用户补充细节。这样做有两个
#: 好处：省掉写基础提示词的时间；也让用户能说清「我具体想知道什么」。
#:
#: ``children`` 标记的动作是**父动作**——点击它会展开子选项，而不是
#: 直接执行。翻译就是这种：用户说「翻译」时，意图是不明确的——
#: 中译英？英译中？文言翻白话？把选择权交还给用户。
SELECTION_ACTIONS: tuple[dict[str, str], ...] = (
    {
        "id": "explain",
        "label": "解释",
        "prompt": "请用大白话解释这段文字在说什么，并说明它为什么重要。",
    },
    {
        "id": "translate",
        "label": "翻译",
        "prompt": "",
        "children": "true",
    },
    {
        "id": "recite",
        "label": "朗读",
        "prompt": "",
    },
    {
        "id": "mindmap",
        "label": "思维导图",
        "prompt": (
            "请帮我将这段内容梳理为 Mermaid 思维导图，我想重点关注："
        ),
        "prefill": "true",
    },
    {
        "id": "connect",
        "label": "跨学科连接",
        "prompt": (
            "请指出这段文字与其他学科知识的连接点，并说明每个连接点的具体依据。"
        ),
        "prefill": "true",
    },
)

#: 翻译的子选项——点击父动作「翻译」后展开。
#:
#: 每条子选项带自己的完整指令。前端只负责拼接「引用原文 + 指令」，
#: 指令文本本身放在后端，改文案时只改一处。
#:
#: ``id`` 前缀是 ``translate:``——后端据此把子动作映射回父动作，
#: 前端则用它决定用哪个 ``analyzeSelection`` 的 action 参数。
TRANSLATE_VARIANTS: tuple[dict[str, str], ...] = (
    {
        "id": "translate:zh-en",
        "parent": "translate",
        "label": "中译英",
        "prompt": (
            "请把下面这段中文翻译成地道、简洁的英文，保留原意与语气，"
            "术语用该领域内通行的英文表达。只输出译文。"
        ),
    },
    {
        "id": "translate:en-zh",
        "parent": "translate",
        "label": "英译中",
        "prompt": (
            "请把下面这段英文翻译成信达雅的简体中文，保留原意与语气，"
            "关键术语在首次出现时可在括号内附原文。只输出译文。"
        ),
    },
    {
        "id": "translate:classical-modern",
        "parent": "translate",
        "label": "古文→白话",
        "prompt": (
            "请把下面这段文言文（或古文）翻译成现代白话文，逐句对应，"
            "保留原文的层次与语气，不要过度意译或添加原文没有的内容。"
        ),
    },
    {
        "id": "translate:modern-classical",
        "parent": "translate",
        "label": "白话→文言",
        "prompt": (
            "请把下面这段现代白话文改写成典雅凝练的文言文，保留原意，"
            "措辞雅致，符合古文语感。只输出改写后的文言文。"
        ),
    },
)

#: 需要预填到主 AI 输入框的动作 id。
PREFILL_ACTIONS = frozenset(
    item["id"] for item in SELECTION_ACTIONS if item.get("prefill") == "true"
)

#: 用浏览器原生语音合成的动作 id。
SPEECH_ACTION = "recite"


def _instruction_for(action: str) -> str:
    """取出一个动作对应的指令文本。

    子动作（如 ``translate:en-zh``）优先匹配——它们的指令更具体。
    父动作 ``translate`` 本身没有指令（用户必须先选子项），这里退回
    到通用翻译指令，保证接口被直接调用时也不会崩。
    """
    for item in TRANSLATE_VARIANTS:
        if item["id"] == action:
            return item["prompt"]

    for item in SELECTION_ACTIONS:
        if item["id"] == action and item.get("prompt"):
            return item["prompt"]

    return SELECTION_ACTIONS[0]["prompt"]


# ── 页面内容提取 ───────────────────────────────────────────────────────


def _page_material(course_id: str, page_id: str) -> dict[str, Any]:
    """取出当前页的标题、正文与章节。

    取不到就返回空结构——洞察服务不能在课程缺失时崩溃。
    """
    empty: dict[str, Any] = {
        "course_title": "",
        "page_title": "",
        "chapter_title": "",
        "text": "",
        "objectives": [],
        "found": False,
    }
    if not course_id:
        return empty

    try:
        from app.services.course_service import get_course_service

        course = get_course_service().get_course(course_id)
    except Exception as exc:
        logger.info("洞察：取不到课程 %s（%s）", course_id, exc)
        return empty

    page = None
    if page_id:
        page = next((item for item in course.pages if item.id == page_id), None)
    if page is None and course.pages:
        page = course.pages[0]
    if page is None:
        empty["course_title"] = course.title
        return empty

    chapter = next(
        (item for item in course.chapters if item.id == page.chapter_id), None
    )

    parts: list[str] = []
    for block in page.blocks:
        payload = block.payload if isinstance(block.payload, dict) else {}
        for key in ("body", "content", "intro", "key_takeaway", "explanation"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())
                break

    return {
        "course_title": course.title,
        "page_title": page.title,
        "chapter_title": chapter.title if chapter else "",
        "text": "\n".join(parts)[:2_500],
        "objectives": list(page.learning_objectives or [])[:4],
        "found": True,
    }


# ── 真实模型路径 ───────────────────────────────────────────────────────

_NEXT_STEP_SYSTEM = """你是一个主动的自主学习向导。你会看到用户当前正在读的一页教材正文。

请基于这一页的实际内容，给出恰好 3 个「下一步」建议——学习者读完这一页后最可能想做的事。

要求：
- 每个建议有一个 10 字以内的小标题，以及一句完整的提问（用户点击后会原样发给你）。
- 3 个建议必须彼此不同，覆盖不同的学习动作：例如「理解」「检验」「迁移」。
- 不要泛泛而谈，问题必须针对这一页的具体内容。
- 全部用简体中文。

严格按下面的 JSON 输出，不要有额外文字：
{"awareness": "一句话说明你现在掌握了什么",
 "suggestions": [{"title": "小标题", "prompt": "完整提问", "hint": "8 字以内的提示"}]}"""


async def _model_suggestions(material: dict[str, Any]) -> InsightResult:
    """走真实模型生成建议。失败直接抛错。"""
    from app.services.llm_factory import complete

    title = material.get("page_title") or ""
    course = material.get("course_title") or ""
    body = material.get("text") or "（这一页暂时没有可提取的文字内容）"

    prompt = (
        f"课程：{course}\n"
        f"当前页：{title}\n"
        f"章节：{material.get('chapter_title') or '—'}\n\n"
        f"这一页的正文：\n{body}"
    )

    raw = await complete(
        prompt=prompt,
        system_prompt=_NEXT_STEP_SYSTEM,
        max_tokens=900,
        temperature=0.6,
    )

    parsed = _parse_suggestions(raw)
    if parsed is None:
        raise RuntimeError("模型返回的建议格式无法解析。")

    awareness, suggestions = parsed
    return InsightResult(
        suggestions=suggestions[:MAX_SUGGESTIONS],
        awareness=awareness,
        from_model=True,
    )


def _parse_suggestions(raw: str) -> tuple[str, list[Suggestion]] | None:
    """从模型输出里解析出建议列表。

    模型不总是严格输出 JSON——这里容忍 ```json 包裹、前后杂音。
    """
    text = str(raw or "").strip()
    if not text:
        return None

    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    candidate = text[start : end + 1]

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    raw_items = data.get("suggestions")
    if not isinstance(raw_items, list):
        return None

    suggestions: list[Suggestion] = []
    for index, item in enumerate(raw_items[: MAX_SUGGESTIONS * 2]):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        prompt = str(item.get("prompt") or "").strip()
        if not title or not prompt:
            continue
        suggestions.append(
            Suggestion(
                id=f"ai_{index}",
                title=title[:20],
                prompt=prompt,
                hint=str(item.get("hint") or "").strip()[:16],
            )
        )

    if not suggestions:
        return None
    return str(data.get("awareness") or "").strip(), suggestions


# ── 对外 API ───────────────────────────────────────────────────────────


async def next_steps(
    *,
    course_id: str = "",
    page_id: str = "",
) -> InsightResult:
    """下一步引擎：看完当前页给出 3 个建议。"""
    material = _page_material(course_id, page_id)
    return await _model_suggestions(material)


_SELECTION_SYSTEM = """你是一位耐心的私塾先生，正在陪一位学习者精读一段中文材料。

请依据用户选中的片段作答。回答要具体、贴着这段文字本身，不要泛泛而谈。
全部用简体中文。若片段来自文言或古文，请先给出现代白话的意思，再展开。
数学公式用 LaTeX（行内 $...$，行间 $$...$$）。"""


async def analyze_selection(
    *,
    text: str,
    action: str = "explain",
    course_id: str = "",
    page_id: str = "",
) -> dict[str, Any]:
    """解读一段选中的文字。

    ``action`` 取 :data:`SELECTION_ACTIONS` 里的 id，也可以取
    :data:`TRANSLATE_VARIANTS` 里的子 id（如 ``translate:en-zh``）。
    """
    body = str(text or "").strip()
    if not body:
        return {"reply": "", "action": action, "from_model": False}
    if len(body) > MAX_SELECTION_CHARS:
        body = body[:MAX_SELECTION_CHARS]

    instruction = _instruction_for(action)

    material = _page_material(course_id, page_id)
    where = ""
    if material.get("found"):
        where = (
            f"\n\n（这段话出自《{material.get('course_title')}》"
            f"的「{material.get('page_title')}」）"
        )

    prompt = f"选中的原文：\n{body}{where}\n\n{instruction}"

    from app.services.llm_factory import complete

    reply = await complete(
        prompt=prompt,
        system_prompt=_SELECTION_SYSTEM,
        max_tokens=1400,
        temperature=0.5,
    )

    return {"reply": reply, "action": action, "from_model": True}


_VISION_SYSTEM = """你是一位看得懂图的学习助手。用户在学习平台上给你看一张图片。

请结合图片内容说明：
1. 图片里是什么（文字、图形、公式、界面截图、实物等）；
2. 它的要点与结构；
3. 如果有公式或代码，逐行说明它在做什么。

全部用简体中文。看不到图片内容时直接说明，不要编造。"""


async def analyze_image(
    *,
    image_base64: str,
    mime_type: str = "image/png",
    question: str = "",
    course_id: str = "",
    page_id: str = "",
) -> dict[str, Any]:
    """识别一张图片并结合当前学习上下文解读。

    支持 OpenAI 兼容端点的多模态消息格式（``image_url``）。
    """
    raw = str(image_base64 or "").strip()
    if not raw:
        return {"reply": "", "from_model": False, "warnings": ["empty_image"]}

    # 允许直接传 data URL，也允许传裸 base64。
    if raw.startswith("data:"):
        payload = raw
    else:
        payload = f"data:{mime_type};base64,{raw}"

    try:
        size = len(base64.b64decode(raw.split(",", 1)[-1]))
    except Exception:
        size = 0
    if size > MAX_IMAGE_BYTES:
        return {
            "reply": "这张图片太大了，请压缩后再试（上限 5MB）。",
            "from_model": False,
            "warnings": ["image_too_large"],
        }

    from app.services.llm_factory import complete

    material = _page_material(course_id, page_id)
    context = ""
    if material.get("found"):
        context = (
            f"\n\n（用户当前正在学《{material.get('course_title')}》"
            f"的「{material.get('page_title')}」）"
        )
    ask = question.strip() or "请解读这张图片。"

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": f"{ask}{context}"},
                {"type": "image_url", "image_url": {"url": payload}},
            ],
        }
    ]

    reply = await complete(
        prompt=ask,
        system_prompt=_VISION_SYSTEM,
        messages=messages,
        max_tokens=1400,
        temperature=0.4,
    )

    return {"reply": reply, "from_model": True, "warnings": []}


__all__ = [
    "MAX_IMAGE_BYTES",
    "MAX_SELECTION_CHARS",
    "MAX_SUGGESTIONS",
    "PREFILL_ACTIONS",
    "SELECTION_ACTIONS",
    "SPEECH_ACTION",
    "TRANSLATE_VARIANTS",
    "InsightResult",
    "Suggestion",
    "analyze_image",
    "analyze_selection",
    "next_steps",
]
