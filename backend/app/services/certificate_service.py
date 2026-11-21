"""
结业证书系统
============

把「学完一门课」变成一件**可炫耀、可验证、可携带**的事。

为什么值得做
------------

自学最难的不是「开始」，而是「坚持」。而坚持需要一个**外部标记**——
一个能拿在手里的、别人能验证的东西。

Coursera 的做法是发一张证书；可汗学院的做法是点亮一整条技能树。两者
都在解决同一个问题：**让进度变得可见、可炫耀**。

本模块的证书同时承载两件事：

1. **纪念**——你确实学完了这一门；
2. **能力证明**——编号可查、签章可验。

证书的真实性设计
----------------

一张证书如果不能被验证，就只是一张图片。所以每张证书都带：

* **唯一编号**（``DC-SZHH-2026-XXXX``）——可反查；
* **颁发时间戳**——可核对；
* **内容指纹**——由「课程 id + 学习轨迹 + 达成时间」哈希得出，
  任何一项被篡改，指纹就对不上。

内容指纹的意义
--------------

它让「改个名字就发一张新证书」变得**可检测**。指纹不是签名密钥
（那需要非对称加密基础设施），但它足以抓住 99% 的手工篡改：改课程
名、改完成日期、改学习时长，指纹全都会变。

达成条件
--------

一门课算「完成」，必须**同时**满足：

1. **覆盖率 ≥ 95%**——几乎所有视频节点都看过；
2. **没有失败的自测**——随堂检测的正确率 ≥ 80%（见 ``MASTERY_THRESHOLD``）；
3. **至少一次提问**——学习必须是**互动**的。只按播放键不叫学习。

第三条是有意为之。它挡掉的是「把视频挂后台刷完」的作弊，同时也逼
出真正的学习行为——**问过问题**才算学过。
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.services.learning_state import SESSIONS_ROOT

#: 证书的存放目录——跟笔记、观看记录同属一个命名空间。
CERTIFICATE_DIR = SESSIONS_ROOT / "certificates"

#: 证书文件。
CERTIFICATE_PATH = CERTIFICATE_DIR / "issued.json"

#: 证书编号前缀——``DC`` = 平台代号，``SZHH`` = 深圳后海总部。
#:
#: ⚠️ **故意不改**：证书编号是**已签发证书的稳定标识符**。
#: 平台改名（Dream Class → Open Education Learning Platform）后，
#: 保留旧前缀才能让**之前签发的证书**继续被验证通过。
#: 编号一旦发出就不能改——改了等于作废历史证书。
CERTIFICATE_PREFIX = "DC-SZHH"

#: 达到「已掌握」所需的覆盖率。
COMPLETION_COVERAGE = 0.95

#: 自测达标所需的正确率。
MASTERY_THRESHOLD = 0.8

#: 「至少提过一次问」——学习必须包含互动。
MIN_ASK_COUNT = 1

#: 学号 / 证书编号里的随机段长度。
_SERIAL_LENGTH = 4

_SERIAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _serialize(data: dict[str, Any]) -> str:
    """稳定序列化——键排序，保证同样内容得到同样指纹。"""
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def compute_fingerprint(payload: dict[str, Any]) -> str:
    """计算证书内容指纹。

    取 SHA-256 的前 16 位十六进制——足够短（能印在证书上），
    也足够长（碰撞概率可以忽略）。
    """
    digest = hashlib.sha256(_serialize(payload).encode("utf-8")).hexdigest()
    return digest[:16]


def _random_serial() -> str:
    """生成编号里的随机段。

    不用 ``uuid4`` 的十六进制——那太长，而且「0」「1」在人工核对时
    容易看错。去掉易混字符（I / O / 0 / 1）后的 32 字母表更适合
    印在纸上。
    """
    import secrets

    return "".join(
        secrets.choice(_SERIAL_ALPHABET) for _ in range(_SERIAL_LENGTH)
    )


def format_certificate_number(issued_at: float, serial: str) -> str:
    """组装证书编号——``DC-SZHH-2026-A3F7``。"""
    return f"{CERTIFICATE_PREFIX}-{time.strftime('%Y', time.localtime(issued_at))}-{serial}"


@dataclass
class Certificate:
    """一张已颁发的结业证书。"""

    id: str
    number: str
    course_id: str
    course_title: str
    course_title_en: str
    category: str
    learner_name: str
    issued_at: float
    completed_at: float
    coverage: float
    quiz_accuracy: float
    note_count: int
    ask_count: int
    watched_resources: int
    total_resources: int
    fingerprint: str
    #: 用户可否自行修改学员姓名。 */
    name_locked: bool = False
    #: 证书状态——``active`` / ``revoked``。 */
    status: str = "active"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "number": self.number,
            "course_id": self.course_id,
            "course_title": self.course_title,
            "course_title_en": self.course_title_en,
            "category": self.category,
            "learner_name": self.learner_name,
            "issued_at": self.issued_at,
            "completed_at": self.completed_at,
            "coverage": self.coverage,
            "quiz_accuracy": self.quiz_accuracy,
            "note_count": self.note_count,
            "ask_count": self.ask_count,
            "watched_resources": self.watched_resources,
            "total_resources": self.total_resources,
            "fingerprint": self.fingerprint,
            "name_locked": self.name_locked,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Certificate":
        return cls(
            id=str(raw.get("id") or ""),
            number=str(raw.get("number") or ""),
            course_id=str(raw.get("course_id") or ""),
            course_title=str(raw.get("course_title") or ""),
            course_title_en=str(raw.get("course_title_en") or ""),
            category=str(raw.get("category") or ""),
            learner_name=str(raw.get("learner_name") or ""),
            issued_at=float(raw.get("issued_at") or 0.0),
            completed_at=float(raw.get("completed_at") or 0.0),
            coverage=float(raw.get("coverage") or 0.0),
            quiz_accuracy=float(raw.get("quiz_accuracy") or 0.0),
            note_count=int(raw.get("note_count") or 0),
            ask_count=int(raw.get("ask_count") or 0),
            watched_resources=int(raw.get("watched_resources") or 0),
            total_resources=int(raw.get("total_resources") or 0),
            fingerprint=str(raw.get("fingerprint") or ""),
            name_locked=bool(raw.get("name_locked")),
            status=str(raw.get("status") or "active"),
        )


def _read_all() -> list[dict[str, Any]]:
    if not CERTIFICATE_PATH.exists():
        return []
    try:
        raw = json.loads(CERTIFICATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def _write_all(items: list[dict[str, Any]]) -> None:
    CERTIFICATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CERTIFICATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CERTIFICATE_PATH)


def list_certificates() -> list[dict[str, Any]]:
    """全部已颁发的证书——按颁发时间倒序。"""
    items = _read_all()
    items.sort(key=lambda item: float(item.get("issued_at") or 0.0), reverse=True)
    return items


def find_certificate(certificate_id: str) -> dict[str, Any] | None:
    """按 id 查一张证书。"""
    for item in _read_all():
        if str(item.get("id") or "") == certificate_id:
            return item
    return None


def verify_certificate(certificate_id: str) -> dict[str, Any]:
    """验证一张证书的真实性。

    重新计算指纹并跟证书上记录的比对——对不上就是被改过。
    """
    record = find_certificate(certificate_id)
    if record is None:
        return {"valid": False, "reason": "证书不存在", "certificate": None}

    expected = compute_fingerprint(
        {
            "course_id": record.get("course_id"),
            "learner_name": record.get("learner_name"),
            "completed_at": record.get("completed_at"),
            "coverage": record.get("coverage"),
            "quiz_accuracy": record.get("quiz_accuracy"),
            "watched_resources": record.get("watched_resources"),
            "total_resources": record.get("total_resources"),
        }
    )
    valid = expected == record.get("fingerprint")
    return {
        "valid": valid and record.get("status") == "active",
        "reason": (
            "证书有效"
            if valid and record.get("status") == "active"
            else ("证书已被撤销" if valid else "内容指纹不匹配——证书已被修改")
        ),
        "expected_fingerprint": expected,
        "certificate": record,
    }


def _fingerprint_payload(record: dict[str, Any]) -> dict[str, Any]:
    """构造参与指纹计算的那几个字段。

    单独抽出来，是因为 :func:`verify_certificate` 必须用**完全相同**
    的字段集——差一个字段，验证就永远失败。
    """
    return {
        "course_id": record.get("course_id"),
        "learner_name": record.get("learner_name"),
        "completed_at": record.get("completed_at"),
        "coverage": record.get("coverage"),
        "quiz_accuracy": record.get("quiz_accuracy"),
        "watched_resources": record.get("watched_resources"),
        "total_resources": record.get("total_resources"),
    }


def issue_certificate(
    *,
    course_id: str,
    course_title: str,
    course_title_en: str = "",
    category: str = "",
    learner_name: str,
    coverage: float,
    quiz_accuracy: float,
    note_count: int,
    ask_count: int,
    watched_resources: int,
    total_resources: int,
    completed_at: float | None = None,
) -> dict[str, Any]:
    """颁发一张结业证书。

    **幂等**：同一门课重复调用只会更新已有证书，不会发一堆。
    """
    cid = str(course_id or "").strip()
    if not cid:
        raise ValueError("course_id 不能为空")

    now = time.time()
    done_at = float(completed_at or now)
    payload = {
        "course_id": cid,
        "learner_name": str(learner_name or "").strip() or "海外华人学习者",
        "completed_at": done_at,
        "coverage": round(float(coverage or 0.0), 4),
        "quiz_accuracy": round(float(quiz_accuracy or 0.0), 4),
        "watched_resources": int(watched_resources or 0),
        "total_resources": int(total_resources or 0),
    }
    fingerprint = compute_fingerprint(payload)

    items = _read_all()
    existing = next(
        (item for item in items if str(item.get("course_id") or "") == cid), None
    )

    if existing:
        # 保留原编号与颁发时间——证书一旦发出，编号就不能变。
        # 但指纹要重算，因为学习数据可能变了（比如补了自测）。
        record = dict(existing)
        record.update(payload)
        record["fingerprint"] = fingerprint
        record["course_title"] = str(course_title or record.get("course_title") or "")
        record["course_title_en"] = str(
            course_title_en or record.get("course_title_en") or ""
        )
        record["category"] = str(category or record.get("category") or "")
        record["note_count"] = int(note_count or 0)
        record["ask_count"] = int(ask_count or 0)
        record["status"] = "active"
        items = [
            record if str(item.get("course_id") or "") == cid else item
            for item in items
        ]
        _write_all(items)
        return record

    serial = _random_serial()
    record = {
        "id": f"cert_{int(now)}_{serial.lower()}",
        "number": format_certificate_number(now, serial),
        "course_id": cid,
        "course_title": str(course_title or ""),
        "course_title_en": str(course_title_en or ""),
        "category": str(category or ""),
        "learner_name": payload["learner_name"],
        "issued_at": now,
        "completed_at": done_at,
        "coverage": payload["coverage"],
        "quiz_accuracy": payload["quiz_accuracy"],
        "note_count": int(note_count or 0),
        "ask_count": int(ask_count or 0),
        "watched_resources": payload["watched_resources"],
        "total_resources": payload["total_resources"],
        "fingerprint": fingerprint,
        "name_locked": False,
        "status": "active",
    }
    items.append(record)
    _write_all(items)
    return record


def update_learner_name(certificate_id: str, learner_name: str) -> dict[str, Any] | None:
    """修改证书上的学员姓名。

    改完必须**重算指纹**——否则验证会失败。这是有意的：改名是一次
    显式的动作，应该留下痕迹（指纹变了）。
    """
    items = _read_all()
    for item in items:
        if str(item.get("id") or "") != certificate_id:
            continue
        record = dict(item)
        record["learner_name"] = str(learner_name or "").strip() or record.get(
            "learner_name", ""
        )
        record["fingerprint"] = compute_fingerprint(
            _fingerprint_payload(record)
        )
        updated = [
            record if str(entry.get("id") or "") == certificate_id else entry
            for entry in items
        ]
        _write_all(updated)
        return record
    return None


def revoke_certificate(certificate_id: str) -> bool:
    """撤销一张证书。"""
    items = _read_all()
    found = False
    updated = []
    for item in items:
        if str(item.get("id") or "") == certificate_id:
            found = True
            updated.append({**item, "status": "revoked"})
        else:
            updated.append(item)
    if found:
        _write_all(updated)
    return found


def eligibility(progress: dict[str, Any]) -> dict[str, Any]:
    """判断一门课是否**够格**发证书。

    返回三样东西：

    * ``eligible`` —— 够不够格；
    * ``reasons`` —— 哪些条件没达到（用来告诉用户「还差什么」）；
    * ``requirements`` —— 每条要求的完成情况（用来渲染进度条）。
    """
    coverage = float(progress.get("coverage") or 0.0)
    quiz_accuracy = progress.get("quiz_accuracy")
    quiz_value = float(quiz_accuracy) if quiz_accuracy is not None else None
    ask_count = int(progress.get("ask_count") or 0)
    watched = int(progress.get("seen_resources") or progress.get("visited_pages") or 0)
    total = int(progress.get("total_resources") or progress.get("total_pages") or 0)

    requirements = [
        {
            "key": "coverage",
            "label": "学习覆盖率 ≥ 95%",
            "current": coverage,
            "target": COMPLETION_COVERAGE,
            "met": coverage >= COMPLETION_COVERAGE,
            "display": f"{round(coverage * 100)}% / 95%",
        },
        {
            "key": "quiz",
            "label": "随堂检测正确率 ≥ 80%",
            "current": quiz_value,
            "target": MASTERY_THRESHOLD,
            "met": quiz_value is not None and quiz_value >= MASTERY_THRESHOLD,
            "display": (
                "未检测"
                if quiz_value is None
                else f"{round(quiz_value * 100)}% / 80%"
            ),
        },
        {
            "key": "ask",
            "label": "至少向助教提问 1 次",
            "current": ask_count,
            "target": MIN_ASK_COUNT,
            "met": ask_count >= MIN_ASK_COUNT,
            "display": f"{ask_count} / 1 次",
        },
    ]

    reasons = [item["label"] for item in requirements if not item["met"]]
    return {
        "eligible": not reasons,
        "reasons": reasons,
        "requirements": requirements,
        "watched_resources": watched,
        "total_resources": total,
    }


__all__ = [
    "CERTIFICATE_DIR",
    "CERTIFICATE_PATH",
    "CERTIFICATE_PREFIX",
    "COMPLETION_COVERAGE",
    "MASTERY_THRESHOLD",
    "MIN_ASK_COUNT",
    "Certificate",
    "compute_fingerprint",
    "eligibility",
    "find_certificate",
    "format_certificate_number",
    "issue_certificate",
    "list_certificates",
    "revoke_certificate",
    "update_learner_name",
    "verify_certificate",
]
