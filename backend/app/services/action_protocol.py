"""
Action 协议
===========

让大模型能**直接操控前端页面**。

模型不再只能说文字——它可以吐出结构化的动作指令，前端收到后立刻执行：

* ``upsert_note`` —— 在正文里划线并生成可编辑的旁注；
* ``manage_plan`` —— 写入 / 更新学习计划库；
* ``trigger_quiz`` —— 在对话区渲染交互式答题卡。

为什么用「文本里的 JSON 围栏」而不是 function calling
------------------------------------------------------

DeepSeek 的 OpenAI 兼容端点支持 ``tools`` / ``function_call``，但那是
**请求侧**的协议：模型在生成时必须调用工具，工具结果还要再回传一轮，
整个「多步操作」要靠应用层做循环。文本协议把动作和回答放在同一条流里，
一次请求就能同时拿到「讲解 + 动作」，实现成本与延迟都低得多。

代价是模型可能吐出不合法的 JSON——因此解析器必须**极其宽容**：能
抠出多少算多少，绝不因为格式问题让整条回复失败。

协议形态
--------

模型在回复正文里插入一个围栏：

.. code-block:: text

    ```action
    {"action": "upsert_note", "quote": "原文片段", "note": "这句为什么重要"}
    ```

解析器 :func:`parse_actions` 会把它抽出来，正文里则不留痕迹。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import re
from typing import Any

#: 动作围栏的正则。允许 ``action`` / ``actions`` / ``actions`` 三种标签。
_ACTION_FENCE_RE = re.compile(
    r"```(?:action|actions|tool|tools)\s*\n(.*?)```", re.DOTALL | re.IGNORECASE
)

#: 已知动作 id。
ACTION_UPSERT_NOTE = "upsert_note"
ACTION_MANAGE_PLAN = "manage_plan"
ACTION_TRIGGER_QUIZ = "trigger_quiz"

KNOWN_ACTIONS = frozenset(
    {ACTION_UPSERT_NOTE, ACTION_MANAGE_PLAN, ACTION_TRIGGER_QUIZ}
)

#: 单个动作的最大字符数——模型偶尔会写出巨大的 payload。
MAX_ACTION_CHARS = 8_000

#: 单次回复里最多接受几个动作。多了前端会被动作刷屏。
MAX_ACTIONS = 6


@dataclass(slots=True)
class Action:
    """一个可执行的前端动作。"""

    #: 动作 id（``upsert_note`` / ``manage_plan`` / ``trigger_quiz``）。
    action: str
    #: 动作载荷——形状随 ``action`` 而变。
    payload: dict[str, Any] = field(default_factory=dict)
    #: 动作的简短说明，展示在界面上。
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"action": self.action, "payload": dict(self.payload), "summary": self.summary}


def parse_actions(content: str) -> tuple[str, list[Action]]:
    """把模型输出拆成「正文」与「动作列表」。

    返回 ``(正文, 动作)``——正文里已经没有动作围栏了。

    解析策略刻意宽容：

    * 围栏里可能是一个对象，也可能是 ``{"actions": [...]}``，也可能
      是一整个数组；
    * JSON 坏了就退回正则抠字段，尽力而为而不是整体丢弃。
    """
    text = str(content or "")
    if "```" not in text:
        return text, []

    actions: list[Action] = []
    kept: list[str] = []
    last_end = 0

    for match in _ACTION_FENCE_RE.finditer(text):
        kept.append(text[last_end : match.start()])
        last_end = match.end()
        actions.extend(_parse_action_block(match.group(1)))

    kept.append(text[last_end:])
    body = "".join(kept).strip()

    return body, actions[:MAX_ACTIONS]


def _parse_action_block(raw: str) -> list[Action]:
    """解析一个动作围栏的内容。"""
    block = str(raw or "").strip()
    if not block:
        return []

    data = _loads(block)
    if data is None:
        # JSON 坏了——用正则尽力抠出常见字段。
        return _salvage(block)

    # 形状零：整个数组。
    if isinstance(data, list):
        out: list[Action] = []
        for item in data:
            action = _build_action(item)
            if action is not None:
                out.append(action)
        return out

    # 形状一：{"actions": [...]}
    if isinstance(data, dict) and isinstance(data.get("actions"), list):
        out = []
        for item in data["actions"]:
            action = _build_action(item)
            if action is not None:
                out.append(action)
        return out

    # 形状二：单个对象
    action = _build_action(data)
    return [action] if action is not None else []


def _loads(block: str) -> Any:
    """容错 JSON 解析。"""
    try:
        return json.loads(block)
    except json.JSONDecodeError:
        pass
    # 常见问题：模型在 JSON 前后加了说明文字。
    start = block.find("{")
    end = block.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(block[start : end + 1])
        except json.JSONDecodeError:
            pass
    start = block.find("[")
    end = block.rfind("]")
    if start != -1 and end > start:
        try:
            return json.loads(block[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


def _build_action(item: Any) -> Action | None:
    """把一个原始对象转成 :class:`Action`。"""
    if not isinstance(item, dict):
        return None

    name = str(item.get("action") or item.get("type") or item.get("name") or "").strip()
    if not name:
        return None

    # 载荷：优先 ``payload`` 子对象，否则把动作字段本身当载荷。
    payload = item.get("payload")
    if not isinstance(payload, dict):
        payload = {
            key: value
            for key, value in item.items()
            if key not in {"action", "type", "name", "summary"}
        }

    return Action(
        action=name,
        payload=_clip_payload(payload),
        summary=str(item.get("summary") or _summarize(name, payload)),
    )


def _clip_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """裁掉过大的字符串字段。"""
    out: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, str) and len(value) > MAX_ACTION_CHARS:
            out[key] = value[:MAX_ACTION_CHARS]
        else:
            out[key] = value
    return out


def _salvage(block: str) -> list[Action]:
    """JSON 解析失败时的正则兜底。

    只处理最常见的两种动作——笔记与计划。测验的数据结构太复杂，
    猜错了反而会让前端渲染出错误内容，不如丢掉。
    """
    out: list[Action] = []

    quote = _grab(block, "quote")
    note = _grab(block, "note")
    if quote or note:
        out.append(
            Action(
                action=ACTION_UPSERT_NOTE,
                payload={"quote": quote, "note": note},
                summary="标注一段原文",
            )
        )

    title = _grab(block, "title")
    if title:
        out.append(
            Action(
                action=ACTION_MANAGE_PLAN,
                payload={"title": title, "op": _grab(block, "op") or "create"},
                summary="写入学习计划",
            )
        )

    return out


def _grab(block: str, key: str) -> str:
    """用正则抠出 ``"key": "value"`` 里的值。"""
    match = re.search(
        rf'"{re.escape(key)}"\s*:\s*"((?:[^"\\]|\\.)*)"', block, re.IGNORECASE
    )
    if not match:
        return ""
    try:
        return str(json.loads(f'"{match.group(1)}"'))
    except json.JSONDecodeError:
        return match.group(1)


def _summarize(name: str, payload: dict[str, Any]) -> str:
    """给动作生成一句人话摘要。"""
    if name == ACTION_UPSERT_NOTE:
        quote = str(payload.get("quote") or "")[:20]
        return f"标注「{quote}」" if quote else "标注一段原文"
    if name == ACTION_MANAGE_PLAN:
        title = str(payload.get("title") or "")[:20]
        return f"加入计划「{title}」" if title else "更新学习计划"
    if name == ACTION_TRIGGER_QUIZ:
        return "生成一道测验题"
    return name


# ── 动作载荷规范化 ─────────────────────────────────────────────────────


def normalize_note_payload(payload: dict[str, Any]) -> dict[str, str]:
    """把 ``upsert_note`` 的载荷规范化成前端要的形状。

    ``page_id`` 是可选的——模型如果指明了是哪一段，就带着它；没指明
    就留空，交给调用方用「当前打开的页」补上。
    """
    quote = str(payload.get("quote") or payload.get("text") or payload.get("anchor") or "").strip()
    note = str(payload.get("note") or payload.get("content") or payload.get("comment") or "").strip()
    return {
        "quote": quote,
        "note": note,
        "page_id": str(payload.get("page_id") or "").strip(),
    }


def normalize_plan_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """把 ``manage_plan`` 的载荷规范化。

    ``op`` 决定行为：``create``（默认）/ ``update`` / ``complete`` /
    ``delete``。
    """
    op = str(payload.get("op") or payload.get("operation") or "create").strip().lower()
    if op not in {"create", "update", "complete", "delete"}:
        op = "create"
    return {
        "op": op,
        "title": str(payload.get("title") or "").strip(),
        "detail": str(payload.get("detail") or payload.get("description") or "").strip(),
        "course_id": str(payload.get("course_id") or "").strip(),
        "due": str(payload.get("due") or payload.get("deadline") or "").strip(),
        "items": payload.get("items") if isinstance(payload.get("items"), list) else [],
    }


def normalize_quiz_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """把 ``trigger_quiz`` 的载荷规范化成答题卡的结构。"""
    questions: list[dict[str, Any]] = []
    raw_questions = payload.get("questions")
    if not isinstance(raw_questions, list):
        raw_questions = [payload] if payload.get("question") else []

    for item in raw_questions:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or item.get("stem") or "").strip()
        if not question:
            continue
        options = item.get("options")
        if not isinstance(options, list):
            options = []
        cleaned_options = [
            str(option).strip() for option in options if str(option).strip()
        ]
        answer = item.get("answer")
        if isinstance(answer, int):
            answer_index = answer
        else:
            answer_text = str(answer or "").strip()
            answer_index = (
                cleaned_options.index(answer_text)
                if answer_text in cleaned_options
                else -1
            )
        explanation = str(item.get("explanation") or item.get("analysis") or "").strip()
        questions.append(
            {
                "question": question,
                "options": cleaned_options,
                "answer": answer_index,
                "explanation": explanation,
            }
        )

    return {
        "title": str(payload.get("title") or "随堂检验").strip(),
        "questions": questions,
    }


__all__ = [
    "ACTION_MANAGE_PLAN",
    "ACTION_TRIGGER_QUIZ",
    "ACTION_UPSERT_NOTE",
    "Action",
    "KNOWN_ACTIONS",
    "MAX_ACTIONS",
    "normalize_note_payload",
    "normalize_plan_payload",
    "normalize_quiz_payload",
    "parse_actions",
]
