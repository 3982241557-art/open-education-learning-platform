"""
宏观学习向导（AI 指导二）
=========================

「双 AI 协同」里的**第二重身份**。它与主 AI（课程专属执行官）的分工是
刻意的：

=========================  ==================================  ==========================
                           宏观学习向导                        课程专属执行官
=========================  ==================================  ==========================
角色                       元认知与方法论导师                   课程内的知识执行官
视角                       站在**章**的层面看全局               站在**页**的层面解决问题
权力                       **无页面操控权限**                   可直接操作页面（笔记/计划/测验）
产出                       学习方法建议 + 高质量提问范例        讲解正文 + 执行动作
=========================  ==================================  ==========================

为什么要分成两个
----------------

一个模型同时承担「怎么学」和「学什么」会互相干扰：它要么满口方法论
却不回答问题，要么埋头答题却不管学习节奏。分开之后，用户在顶部看到
的是「这一章该怎么啃」，在下方得到的是「这个问题怎么解」——两种
关注点不互相挤压。

它的输出必须是**可点击的提问**。用户点一下，问题直接落到下方主 AI
的输入框里——这让「方法论」变成「下一步动作」，而不是一段鸡汤。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

#: 建议的最大数量。
MAX_QUESTIONS = 4

#: 章层面的内容采样上限（字符）。
MAX_CHAPTER_CHARS = 6_000


@dataclass(slots=True)
class AdvisorTactic:
    """一条学习策略要点。

    除了给人看的 ``text``，还带一条**可点击时直接发给主 AI 的完整
    提示词** ``prompt``。

    为什么策略要点也要能点
    ----------------------

    「先通读全篇，再回头精读首节」这句话本身对人有用，但对 AI 没用
    ——它没有主语、没有对象、没有具体任务。用户点它，期望是「照着这
    条策略帮我做点什么」，而不是把一句助记语原样扔给 AI。

    所以每条要点都配一条**高阶提示词**：把它展开成对主 AI 的具体
    委托。
    """

    id: str
    text: str
    prompt: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "prompt": self.prompt,
        }


@dataclass(slots=True)
class AdvisorQuestion:
    """一条建议的高质量问题。"""

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
class AdvisorResult:
    """宏观向导的完整输出。"""

    #: 一句话的章级建议——「这一章该怎么学」。
    strategy: str = ""
    #: 策略展开成的完整提示词——点策略时填入主 AI 输入框。
    strategy_prompt: str = ""
    #: 学习方法要点（2-4 条）。每条都带自己的可点击提示词。
    tactics: list[AdvisorTactic] = field(default_factory=list)
    #: 高质量问题范例——点击即填入主 AI 输入框。
    questions: list[AdvisorQuestion] = field(default_factory=list)
    #: 是否来自真实模型。
    from_model: bool = False
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "strategy_prompt": self.strategy_prompt,
            "tactics": [item.to_dict() for item in self.tactics],
            "questions": [item.to_dict() for item in self.questions],
            "from_model": self.from_model,
            "warnings": list(self.warnings),
        }


# ── 章节素材提取 ───────────────────────────────────────────────────────


def _chapter_material(course_id: str, page_id: str = "") -> dict[str, Any]:
    """取出当前所在章（或页）的标题、目标与正文样本。

    同时取出**用户最近的学习轨迹**——他划了哪些段落、写了什么批注。
    向导的问题必须针对用户**刚做过**的事，否则它就只是一段通用
    方法论。

    取不到就返回空结构——向导不能在课程缺失时崩溃。
    """
    empty: dict[str, Any] = {
        "course_title": "",
        "chapter_title": "",
        "page_title": "",
        "objectives": [],
        "text": "",
        "trace": [],
        "found": False,
    }
    if not course_id:
        return empty

    try:
        from app.services.course_service import get_course_service

        course = get_course_service().get_course(course_id)
    except Exception as exc:
        logger.info("向导：取不到课程 %s（%s）", course_id, exc)
        return empty

    page = None
    if page_id:
        page = next((item for item in course.pages if item.id == page_id), None)
    if page is None and course.pages:
        page = course.pages[0]
    if page is None:
        empty["course_title"] = course.title
        empty["trace"] = _learning_trace(course_id)
        return empty

    chapter = next(
        (item for item in course.chapters if item.id == page.chapter_id), None
    )

    # 章内所有页的正文样本——向导要看的是**全局**，不是当前这一页。
    parts: list[str] = []
    sibling_ids = set(chapter.page_ids) if chapter else {page.id}
    for candidate in course.pages:
        if candidate.id not in sibling_ids and candidate.id != page.id:
            continue
        for block in candidate.blocks:
            payload = block.payload if isinstance(block.payload, dict) else {}
            for key in ("body", "content", "intro", "key_takeaway", "explanation"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(f"【{candidate.title}】{value.strip()}")
                    break

    return {
        "course_title": course.title,
        "chapter_title": chapter.title if chapter else "",
        "page_title": page.title,
        "objectives": list(page.learning_objectives or [])[:5],
        "text": "\n".join(parts)[:MAX_CHAPTER_CHARS],
        "trace": _learning_trace(course_id),
        "found": True,
    }


def _learning_trace(course_id: str, limit: int = 5) -> list[str]:
    """读出用户最近的学习轨迹（划线 + 批注）。

    每条是 ``"原文｜用户批注"`` 这样的紧凑字符串——够模型理解用户在
    关注什么，又不至于把上下文撑爆。
    """
    try:
        from app.services.learning_state import load_notes
    except Exception:  # pragma: no cover - 导入失败时静默降级
        return []

    try:
        notes = load_notes(course_id)
    except Exception:
        return []

    items: list[dict[str, Any]] = [
        item for item in notes if isinstance(item, dict)
    ]

    def _stamp(item: dict[str, Any]) -> float:
        try:
            return float(item.get("updated_at") or item.get("created_at") or 0)
        except (TypeError, ValueError):
            return 0.0

    items.sort(key=_stamp, reverse=True)

    trace: list[str] = []
    for item in items[:limit]:
        quote = str(item.get("quote") or "").strip()
        note = str(item.get("note") or "").strip()
        if not quote and not note:
            continue
        piece = quote or note
        if quote and note:
            piece = f"{quote}｜用户的批注：{note}"
        trace.append(piece[:300])
    return trace


# ── 真实模型路径 ───────────────────────────────────────────────────────

_ADVISOR_SYSTEM = """你是一位资深的自主学习导师（元认知教练）。你正在陪一位学习者精读一门教材。

你的定位是**宏观学习向导**，不是知识讲解员。你要做的是：

1. 看懂用户当前所在的这一**章**讲了什么、有什么学习难点；
2. 给出这一章**该怎么学**的方法论建议——先读什么、重点在哪、怎么检验自己学到了；
3. 提出 3-4 个**高质量问题**——这些问题要能真正检验理解（要求分析、比较、联系实际），而不是"这一页讲了什么"这种复述题。

用户点击你的问题后，问题会原样发给另一位「课程专属执行官」AI 去做。所以问题要写得完整、自足，让对方拿到就能作答。

要求：
- 全部用简体中文。
- `strategy` 一句话（40 字内）说清这一章的学习策略。
- `strategy_prompt` 把这句策略**展开成一条完整的委托指令**——
  用户点它时，这一整段会直接发给「课程专属执行官」AI。所以它必须
  是一句自足的具体委托：说清楚要对方做什么、基于什么、输出什么。
- `tactics` 2-4 条。每条给 `text`（20 字内，给人看的助记语）和
  `prompt`（展开成的高阶指令，同样自足）。
- 每个问题给一个 10 字内的 `title` 和一句完整具体的 `prompt`。
- 不要重复教材原文，你的价值在方法与提问设计上。
- **优先针对用户最近划过的段落提问**。他刚划了一条线，说明那里是他
  当前最在意的地方——问题就该落在他划的地方，而不是泛泛而谈。

**关键**：所有 `prompt` 都要能被另一位 AI **直接执行**。不要写
「讲透这一节」这种省略主语的句子，要写成
「请结合《唐诗三百首》「将进酒」一节，用递进的三层结构讲解
『天生我材必有用』一句的转折手法，并给出一个现代职场的类比」。

严格按下面的 JSON 输出，不要有额外文字：
{"strategy": "一句话学习策略",
 "strategy_prompt": "展开后的完整委托指令",
 "tactics": [{"text": "简短要点", "prompt": "展开后的完整委托指令"}],
 "questions": [{"title": "小标题", "prompt": "完整的高质量问题", "hint": "8字内提示"}]}"""


async def _model_advice(material: dict[str, Any]) -> AdvisorResult | None:
    """走真实模型生成向导建议。失败返回 None。"""
    from app.services.llm_factory import LLMCallError, LLMNotConfiguredError, complete

    title = material.get("page_title") or ""
    course = material.get("course_title") or ""
    chapter = material.get("chapter_title") or "—"
    body = material.get("text") or "（这一章暂时没有可提取的文字内容）"
    objectives = material.get("objectives") or []

    objective_text = "\n".join(f"- {item}" for item in objectives)
    trace = material.get("trace") or []
    trace_text = (
        "\n".join(f"- {item}" for item in trace)
        if trace
        else "（用户还没有留下划线或批注）"
    )

    prompt = (
        f"教材：{course}\n"
        f"当前章：{chapter}\n"
        f"用户正读到：{title}\n"
        f"学习目标：\n{objective_text or '（未标注）'}\n\n"
        f"这一章的内容：\n{body}\n\n"
        f"用户最近的学习轨迹（他划下并写下想法的段落）：\n{trace_text}"
    )

    try:
        raw = await complete(
            prompt=prompt,
            system_prompt=_ADVISOR_SYSTEM,
            max_tokens=1200,
            temperature=0.7,
        )
    except (LLMNotConfiguredError, LLMCallError) as exc:
        logger.warning("宏观向导生成失败: %s", exc)
        return None
    except Exception as exc:
        logger.warning("宏观向导异常: %s", exc)
        return None

    return _parse_advice(raw, material)


def _parse_advice(raw: str, material: dict[str, Any] | None = None) -> AdvisorResult | None:
    """从模型输出里解析向导建议。

    模型不总是严格输出 JSON——容忍 ```` ```json ```` 包裹与前后杂音。
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

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    questions: list[AdvisorQuestion] = []
    raw_questions = data.get("questions")
    if isinstance(raw_questions, list):
        for index, item in enumerate(raw_questions[: MAX_QUESTIONS * 2]):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            prompt = str(item.get("prompt") or "").strip()
            if not title or not prompt:
                continue
            questions.append(
                AdvisorQuestion(
                    id=f"adv_{index}",
                    title=title[:20],
                    prompt=_make_self_contained(prompt, material),
                    hint=str(item.get("hint") or "").strip()[:16],
                )
            )

    if not questions:
        return None

    tactics = _parse_tactics(data.get("tactics"), material)

    strategy = str(data.get("strategy") or "").strip()
    strategy_prompt = str(data.get("strategy_prompt") or "").strip()
    if strategy and not strategy_prompt:
        # 模型没给展开版——用策略本身兜底，至少不让点击失效。
        strategy_prompt = _make_self_contained(strategy, material)

    return AdvisorResult(
        strategy=strategy,
        strategy_prompt=_make_self_contained(strategy_prompt, material)
        if strategy_prompt
        else "",
        tactics=tactics,
        questions=questions[:MAX_QUESTIONS],
        from_model=True,
    )


def _parse_tactics(raw: Any, material: dict[str, Any] | None) -> list[AdvisorTactic]:
    """解析策略要点。

    兼容两种形状：模型可能给字符串数组（老格式），也可能给带
    ``text`` / ``prompt`` 的对象数组（新格式）。
    """
    out: list[AdvisorTactic] = []

    if not isinstance(raw, list):
        return out

    for index, item in enumerate(raw[:4]):
        if isinstance(item, dict):
            text = str(item.get("text") or "").strip()
            prompt = str(item.get("prompt") or "").strip()
        elif isinstance(item, (str, int)):
            text = str(item).strip()
            prompt = ""
        else:
            continue

        if not text:
            continue

        # 没给展开版时，用要点本身兜底——同样要做上下文补全。
        if not prompt:
            prompt = _make_self_contained(text, material)

        out.append(
            AdvisorTactic(
                id=f"tac_{index}",
                text=text[:60],
                prompt=prompt,
            )
        )

    return out


def _make_self_contained(prompt: str, material: dict[str, Any] | None) -> str:
    """让问题脱离上下文也能被回答。

    用户点一下建议，问题会**原样**发给另一位「课程专属执行官」AI。
    模型给出的问题常常是「挑一句讲透。」这种省略了主语的写法——直接
    发过去，对方不知道讲的是哪门课、哪一章。

    所以这里给缺少上下文指代的问题补上限定语。已经有明确指代的
    （提到了教材名或章节名）就不动——重复限定反而啰嗦。
    """
    text = str(prompt or "").strip()
    if not material:
        return text

    course = str(material.get("course_title") or "").strip()
    chapter = str(material.get("chapter_title") or "").strip()
    page = str(material.get("page_title") or "").strip()

    # 已经指明了教材或章节——保持原样。
    for anchor in (course, chapter, page):
        if anchor and len(anchor) >= 2 and anchor in text:
            return text

    scope = "".join(
        part for part in (f"《{course}》" if course else "", f"「{chapter}」" if chapter else "") if part
    )
    if not scope:
        # 没有课程上下文（比如在自由提问区调用向导）——仍然要让问题
        # 自足：告诉对方「结合当前内容」，而不是丢一句「挑一句讲透。」
        # 过去。
        if text.startswith(("请", "结合", "在", "根据", "围绕", "对比")):
            return text
        return f"请结合当前课程内容，{text}"

    separator = "" if text.startswith(("《", "在", "请", "结合")) else "在"
    return f"{separator}{scope}这一节里，{text}"


# ── 对外 API ───────────────────────────────────────────────────────────


async def advise(
    *,
    course_id: str = "",
    page_id: str = "",
) -> AdvisorResult:
    """宏观学习向导。

    有真实模型就用模型；没有则明确报错——**不返回假的方法论**。
    """
    from app.services.llm_factory import LLMNotConfiguredError, has_real_model

    if not has_real_model():
        raise LLMNotConfiguredError(
            "尚未配置模型密钥，无法生成学习建议。"
        )

    material = _chapter_material(course_id, page_id)
    result = await _model_advice(material)
    if result is not None:
        return result

    return AdvisorResult(
        strategy="",
        tactics=[],
        questions=[],
        from_model=False,
        warnings=[] if material["found"] else ["course_not_found"],
    )


__all__ = ["AdvisorQuestion", "AdvisorResult", "MAX_QUESTIONS", "advise"]
