"""
学习状态持久化
==============

一个课程要能真正「记住」用户学过什么，就得有落盘的状态。本模块把四类
状态放在同一个目录下，按 ``course_id`` 隔离：

.. code-block:: text

    backend/data/sessions/<course_id>/
        session.json      对话历史（课程级记忆隔离）
        notes.json        留存文档：划线笔记 + AI 阶段性总结
        plans.json        学习计划库
        quizzes.json      已生成的测验与作答记录

目录名用 ``course_id``。没有课程时（首页自由探索）落到 ``_freeform``，
同样隔离，但不与任何课程混在一起。

为什么不用 SQLite
------------------

数据量极小（一个用户的一门课的笔记与计划），JSON 文件足够；而且它
**可读**——用户可以直接打开 ``notes.json`` 看自己的笔记长什么样。
这也是选它的唯一理由：透明。

写入策略
--------

每次写都是「读 → 改 → 原子写」。原子写用同目录下的临时文件 + ``replace``，
避免进程在写一半时被 kill 导致文件损坏。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
import threading
import time
from typing import Any
from uuid import uuid4

from app.services.text_normalize import normalize_text

#: ``backend/data/sessions/``。
SESSIONS_ROOT = Path(__file__).resolve().parents[2] / "data" / "sessions"

#: 没有课程时的兜底目录名。
FREEFORM_KEY = "_freeform"

#: 同一进程内的写锁——避免两个请求同时改同一个文件。
_LOCK = threading.RLock()

#: 单个会话最多保留的消息条数。超出后丢弃最旧的。
MAX_SESSION_MESSAGES = 200

#: 单条消息的最大字符数。
MAX_MESSAGE_CHARS = 20_000


def _safe_key(course_id: str) -> str:
    """把 ``course_id`` 变成一个安全的目录名。

    课程 id 本身已经是 ``^[A-Za-z0-9_-]{1,64}$``，但自由输入的 id
    不能假设这一点——路径穿越必须在这里被挡住。
    """
    key = str(course_id or "").strip()
    if not key:
        return FREEFORM_KEY
    cleaned = "".join(ch if (ch.isalnum() or ch in "-_") else "-" for ch in key)
    cleaned = cleaned.strip("-")[:64]
    return cleaned or FREEFORM_KEY


def _dir_for(course_id: str) -> Path:
    return SESSIONS_ROOT / _safe_key(course_id)


def _read_json(path: Path, default: Any) -> Any:
    """读一个 JSON 文件；读不到或读坏了就返回默认值。"""
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _write_json(path: Path, payload: Any) -> None:
    """原子写一个 JSON 文件。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".{uuid4().hex[:8]}.tmp")
    try:
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)


# ── 对话会话 ───────────────────────────────────────────────────────────


@dataclass(slots=True)
class StoredMessage:
    """一条被持久化的消息。"""

    role: str
    content: str
    created_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "StoredMessage":
        return cls(
            role=str(raw.get("role") or "user"),
            content=str(raw.get("content") or "")[:MAX_MESSAGE_CHARS],
            created_at=float(raw.get("created_at") or 0.0),
        )


def list_course_ids() -> list[str]:
    """列出所有有学习痕迹的课程 id。

    只看**目录里真正有内容**的课程——空目录不算。

    用于「导出我的学习档案」：把散落在各个子目录里的进度、笔记、
    对话一次性汇总出来。
    """
    if not SESSIONS_ROOT.exists():
        return []
    ids: list[str] = []
    try:
        for entry in SESSIONS_ROOT.iterdir():
            if not entry.is_dir():
                continue
            # 有任何一份学习记录就算有痕迹。
            for filename in ("session.json", "notes.json", "quizzes.json", "plans.json"):
                if (entry / filename).exists():
                    ids.append(entry.name)
                    break
    except OSError:
        return []
    return sorted(ids)


def load_session(course_id: str) -> list[dict[str, Any]]:
    """读出某门课的对话历史。"""
    data = _read_json(_dir_for(course_id) / "session.json", [])
    if not isinstance(data, list):
        return []
    return [
        StoredMessage.from_dict(item).to_dict()
        for item in data
        if isinstance(item, dict)
    ]


def save_session(course_id: str, messages: list[dict[str, Any]]) -> int:
    """覆盖写入某门课的对话历史，返回实际保存的条数。"""
    cleaned: list[dict[str, Any]] = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        content = str(item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        cleaned.append(
            StoredMessage(
                role=role,
                content=content[:MAX_MESSAGE_CHARS],
                created_at=float(item.get("created_at") or time.time()),
            ).to_dict()
        )
    cleaned = cleaned[-MAX_SESSION_MESSAGES:]

    with _LOCK:
        _write_json(_dir_for(course_id) / "session.json", cleaned)
    return len(cleaned)


# ── 留存文档（笔记） ───────────────────────────────────────────────────


@dataclass(slots=True)
class Note:
    """一条留存笔记。

    ``quote`` 是被划线的原文，``note`` 是旁注。两者都可被用户编辑，
    也可以让 AI 二次修改——所以 ``origin`` 记录它是用户写的还是 AI 写的。
    """

    id: str
    quote: str = ""
    note: str = ""
    #: 定位：属于哪一页、哪个内容块。
    page_id: str = ""
    block_id: str = ""
    #: ``user`` 或 ``ai``。
    origin: str = "user"
    #: 划线形状：``highlight``（荧光背景）/ ``underline``（直线）/
    #: ``wavy``（波浪线）。
    style: str = ""
    #: 莫兰迪配色 id：``amber`` / ``haze`` / ``bean`` / ``rose`` / ``lilac``。
    color: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "quote": self.quote,
            "note": self.note,
            "page_id": self.page_id,
            "block_id": self.block_id,
            "origin": self.origin,
            "style": self.style,
            "color": self.color,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Note":
        return cls(
            id=str(raw.get("id") or f"note_{uuid4().hex[:10]}"),
            quote=str(raw.get("quote") or ""),
            note=str(raw.get("note") or ""),
            page_id=str(raw.get("page_id") or ""),
            block_id=str(raw.get("block_id") or ""),
            origin=str(raw.get("origin") or "user"),
            style=str(raw.get("style") or ""),
            color=str(raw.get("color") or ""),
            created_at=float(raw.get("created_at") or 0.0),
            updated_at=float(raw.get("updated_at") or 0.0),
        )


def load_notes(course_id: str) -> list[dict[str, Any]]:
    """读出某门课的全部留存文档。"""
    data = _read_json(_dir_for(course_id) / "notes.json", [])
    if not isinstance(data, list):
        return []
    return [Note.from_dict(item).to_dict() for item in data if isinstance(item, dict)]


def upsert_note(course_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """新增或更新一条笔记。

    带 ``id`` 就是更新；不带就是新增。更新时只覆盖传入的字段——
    没传的字段保持原样，这样「只改旁注不动原文」是可行的。

    写入前会做**繁简归一化**——用户从正文里划词、原文是繁体时，
    存下来的必须是简体，否则搜索与标签匹配会失效。

    ``payload`` 里带 ``course_id`` 时以它为准——前端调这条接口时
    常常把课程 id 放在请求体里，而不是查询参数上。
    """
    target = str(payload.get("course_id") or course_id or "").strip()
    with _LOCK:
        notes = load_notes(target)
        note_id = str(payload.get("id") or "").strip()

        if note_id:
            for index, existing in enumerate(notes):
                if existing.get("id") == note_id:
                    merged = dict(existing)
                    for key in ("quote", "note", "page_id", "block_id", "origin"):
                        value = payload.get(key)
                        if value is None:
                            continue
                        text = str(value).strip()
                        # 旁注正文允许被**显式清空**——用户把字全删了
                        # 就是要清空，不该被当成「没传这个字段」而保留
                        # 旧内容。其余字段（尤其是 quote）必须非空，
                        # 否则一条空笔记会顶掉原文。
                        if key == "note":
                            merged[key] = normalize_text(text)
                            continue
                        if text:
                            merged[key] = normalize_text(text)
                    # 样式字段允许**显式清空**——用户把波浪线改回普通
                    # 高亮时，前端会传空串过来。
                    for key in ("style", "color"):
                        value = payload.get(key)
                        if value is not None:
                            merged[key] = str(value).strip()
                    merged["updated_at"] = time.time()
                    notes[index] = merged
                    _write_json(_dir_for(target) / "notes.json", notes)
                    return merged

        note = Note(
            id=note_id or f"note_{uuid4().hex[:10]}",
            quote=normalize_text(str(payload.get("quote") or "").strip()),
            note=normalize_text(str(payload.get("note") or "").strip()),
            page_id=str(payload.get("page_id") or "").strip(),
            block_id=str(payload.get("block_id") or "").strip(),
            origin=str(payload.get("origin") or "user").strip() or "user",
            style=str(payload.get("style") or "").strip(),
            color=str(payload.get("color") or "").strip(),
            created_at=time.time(),
            updated_at=time.time(),
        )
        notes.append(note.to_dict())
        _write_json(_dir_for(target) / "notes.json", notes)
        return note.to_dict()


def delete_note(course_id: str, note_id: str) -> bool:
    """删除一条笔记。返回是否真的删掉了。"""
    with _LOCK:
        notes = load_notes(course_id)
        remaining = [item for item in notes if item.get("id") != note_id]
        if len(remaining) == len(notes):
            return False
        _write_json(_dir_for(course_id) / "notes.json", remaining)
        return True


# ── 学习计划 ───────────────────────────────────────────────────────────


@dataclass(slots=True)
class StudyPlan:
    """一条学习计划。"""

    id: str
    title: str
    detail: str = ""
    course_id: str = ""
    #: 目标时间（ISO 字符串或自然语言）。
    due: str = ""
    # ── 日历定位 ──
    #
    # 计划可以在四个粒度上落到日历里：
    # ``year``（年度目标）/ ``month``（月度目标）/ ``day``（某天）/
    # ``slot``（某天的某个时间段）。
    #
    # 粒度由 ``scope`` 决定，具体时间点由 ``start_at`` 决定——它是一个
    # ISO 字符串（``2026-11-05T20:00``），只精确到该粒度需要的程度。
    scope: str = ""
    start_at: str = ""
    #: 结束时间（仅 ``slot`` 粒度有意义）。
    end_at: str = ""
    #: 计划里的条目——AI 拆解出来的具体步骤。
    items: list[str] = field(default_factory=list)
    #: 已完成的条目数量。
    done: int = 0
    #: 整条计划是否已完成。
    completed: bool = False
    #: ``ai`` 或 ``user``。
    origin: str = "user"
    created_at: float = 0.0
    updated_at: float = 0.0

    @property
    def total(self) -> int:
        return len(self.items)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "detail": self.detail,
            "course_id": self.course_id,
            "due": self.due,
            "scope": self.scope,
            "start_at": self.start_at,
            "end_at": self.end_at,
            "items": list(self.items),
            "done": self.done,
            "total": self.total,
            "completed": self.completed,
            "origin": self.origin,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "StudyPlan":
        items = raw.get("items")
        return cls(
            id=str(raw.get("id") or f"plan_{uuid4().hex[:10]}"),
            title=str(raw.get("title") or "未命名计划"),
            detail=str(raw.get("detail") or ""),
            course_id=str(raw.get("course_id") or ""),
            due=str(raw.get("due") or ""),
            scope=str(raw.get("scope") or ""),
            start_at=str(raw.get("start_at") or ""),
            end_at=str(raw.get("end_at") or ""),
            items=[str(item) for item in items] if isinstance(items, list) else [],
            done=int(raw.get("done") or 0),
            completed=bool(raw.get("completed")),
            origin=str(raw.get("origin") or "user"),
            created_at=float(raw.get("created_at") or 0.0),
            updated_at=float(raw.get("updated_at") or 0.0),
        )


def load_plans(course_id: str = "") -> list[dict[str, Any]]:
    """读出计划。

    ``course_id`` 为空时读**全部**课程的计划——「计划」页面是全局视图。
    """
    if course_id:
        data = _read_json(_dir_for(course_id) / "plans.json", [])
    else:
        data = []
        if SESSIONS_ROOT.exists():
            for path in sorted(SESSIONS_ROOT.glob("*/plans.json")):
                items = _read_json(path, [])
                if isinstance(items, list):
                    data.extend(items)
    if not isinstance(data, list):
        return []
    plans = [
        StudyPlan.from_dict(item).to_dict() for item in data if isinstance(item, dict)
    ]
    # 全局视图会把各课程目录拼起来——同一条计划可能被写进多个目录，
    # 这里按 id 去重，保留最后出现的那条（写入方是最新的）。
    if not course_id:
        deduped: dict[str, dict[str, Any]] = {}
        for plan in plans:
            deduped[str(plan.get("id") or "")] = plan
        plans = list(deduped.values())
    return plans


def _plan_owner(course_id: str, plan_id: str) -> str:
    """找出某条计划实际存在哪个课程目录里。

    计划页是全局视图，删除 / 勾选时前端往往不带 ``course_id``。这
    时必须回到它真正落盘的那个目录去改——否则会把聚合结果整个写
    进自由表单目录，反而制造重复。
    """
    if course_id:
        return str(course_id).strip()
    if not SESSIONS_ROOT.exists():
        return ""
    for path in sorted(SESSIONS_ROOT.glob("*/plans.json")):
        items = _read_json(path, [])
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and str(item.get("id") or "") == plan_id:
                return path.parent.name
    return ""


def upsert_plan(course_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """新增或更新一条计划。"""
    target = str(payload.get("course_id") or course_id or "").strip()
    with _LOCK:
        plans = load_plans(target)
        plan_id = str(payload.get("id") or "").strip()

        if plan_id:
            for index, existing in enumerate(plans):
                if existing.get("id") != plan_id:
                    continue
                merged = dict(existing)
                for key in ("title", "detail", "due", "course_id"):
                    value = payload.get(key)
                    if value is not None and str(value).strip():
                        merged[key] = str(value).strip()
                # 日历字段允许显式清空——把计划从月视图挪到日视图时，
                # 旧的 ``scope`` 必须能被覆盖成新的粒度。
                for key in ("scope", "start_at", "end_at"):
                    value = payload.get(key)
                    if value is not None:
                        merged[key] = str(value).strip()
                items = payload.get("items")
                if isinstance(items, list):
                    merged["items"] = [str(item) for item in items if str(item).strip()]
                if payload.get("done") is not None:
                    merged["done"] = int(payload["done"])
                if payload.get("completed") is not None:
                    merged["completed"] = bool(payload["completed"])
                merged["updated_at"] = time.time()
                plans[index] = merged
                _write_json(_dir_for(target) / "plans.json", plans)
                return merged

        plan = StudyPlan(
            id=plan_id or f"plan_{uuid4().hex[:10]}",
            title=normalize_text(str(payload.get("title") or "未命名计划").strip()),
            detail=normalize_text(str(payload.get("detail") or "").strip()),
            course_id=target,
            due=str(payload.get("due") or "").strip(),
            scope=str(payload.get("scope") or "").strip(),
            start_at=str(payload.get("start_at") or "").strip(),
            end_at=str(payload.get("end_at") or "").strip(),
            items=[
                normalize_text(str(item).strip())
                for item in (payload.get("items") or [])
                if str(item).strip()
            ],
            done=int(payload.get("done") or 0),
            completed=bool(payload.get("completed")),
            origin=str(payload.get("origin") or "user").strip() or "user",
            created_at=time.time(),
            updated_at=time.time(),
        )
        plans.append(plan.to_dict())
        _write_json(_dir_for(target) / "plans.json", plans)
        return plan.to_dict()


def delete_plan(course_id: str, plan_id: str) -> bool:
    """删除一条计划。"""
    target = _plan_owner(course_id, plan_id)
    if not target:
        return False
    with _LOCK:
        plans = load_plans(target)
        remaining = [item for item in plans if item.get("id") != plan_id]
        if len(remaining) == len(plans):
            return False
        _write_json(_dir_for(target) / "plans.json", remaining)
        return True


def set_plan_progress(course_id: str, plan_id: str, done: int) -> dict[str, Any] | None:
    """更新计划进度（勾选条目）。

    ``done`` 是已完成条目数。全部完成时自动把整条计划标记为完成。
    """
    target = _plan_owner(course_id, plan_id)
    if not target:
        return None
    with _LOCK:
        plans = load_plans(target)
        for index, existing in enumerate(plans):
            if existing.get("id") != plan_id:
                continue
            total = int(existing.get("total") or 0)
            merged = dict(existing)
            merged["done"] = max(0, min(int(done), total) if total else max(0, int(done)))
            merged["completed"] = bool(total and merged["done"] >= total)
            merged["updated_at"] = time.time()
            plans[index] = merged
            _write_json(_dir_for(target) / "plans.json", plans)
            return merged
    return None


# ── 测验记录 ───────────────────────────────────────────────────────────


def save_quiz(course_id: str, quiz: dict[str, Any]) -> dict[str, Any]:
    """保存一次测验（题目 + 作答）。

    ``page_id`` 会被记下来——章节级的掌握度要靠它把测验落到具体的
    章节上。
    """
    record = dict(quiz)
    record.setdefault("id", f"quiz_{uuid4().hex[:10]}")
    record.setdefault("created_at", time.time())
    with _LOCK:
        data = _read_json(_dir_for(course_id) / "quizzes.json", [])
        if not isinstance(data, list):
            data = []
        data.append(record)
        _write_json(_dir_for(course_id) / "quizzes.json", data)
    return record


def load_quizzes(course_id: str) -> list[dict[str, Any]]:
    """读出某门课的测验记录。"""
    data = _read_json(_dir_for(course_id) / "quizzes.json", [])
    return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []


def record_quiz_answers(
    course_id: str, quiz_id: str, answers: dict[str, Any]
) -> dict[str, Any] | None:
    """把用户**真实作答**写回测验记录。

    没有这一步，「测验正确率」永远算不出来——前端只在本地批改，从不
    把选了哪个选项告诉后端，学情中心就只能说「—」。

    ``answers`` 是 ``{题号: 选项下标}``。只接受**已存在**的题号，且
    下标必须落在选项范围内——否则一条坏数据就能把正确率带偏。
    """
    target = _safe_key(course_id)
    with _LOCK:
        path = _dir_for(target) / "quizzes.json"
        data = _read_json(path, [])
        if not isinstance(data, list):
            return None

        for record in data:
            if not isinstance(record, dict) or str(record.get("id") or "") != quiz_id:
                continue
            questions = record.get("questions")
            if not isinstance(questions, list):
                return None

            for index, question in enumerate(questions):
                if not isinstance(question, dict):
                    continue
                raw = answers.get(str(index), answers.get(index))
                if raw is None or raw == "":
                    continue
                try:
                    chosen = int(raw)
                except (TypeError, ValueError):
                    continue
                options = question.get("options")
                if not isinstance(options, list) or not (0 <= chosen < len(options)):
                    continue
                question["chosen"] = chosen

            record["answered_at"] = time.time()
            _write_json(path, data)
            return record

    return None


__all__ = [
    "FREEFORM_KEY",
    "MAX_SESSION_MESSAGES",
    "Note",
    "SESSIONS_ROOT",
    "StoredMessage",
    "StudyPlan",
    "delete_note",
    "delete_plan",
    "load_notes",
    "load_plans",
    "load_quizzes",
    "load_session",
    "record_quiz_answers",
    "save_quiz",
    "save_session",
    "set_plan_progress",
    "upsert_note",
    "upsert_plan",
]
