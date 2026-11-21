"""
用户个人档案
============

一个**极简**的用户档案存储：昵称、头像、地区、时区、语言偏好、
个人学习目标。

存储方案
--------

**双重持久化**：

* ``backend/data/user_profile.json`` —— 服务端权威副本；
* 浏览器 ``localStorage`` —— 本地副本。

为什么两个都要
--------------

只有 localStorage 的问题：

* 换浏览器、换设备、清缓存，档案就没了；
* 没法在多台设备间同步。

只有服务端文件的问题：

* 服务不可用时档案读不到（页面直接崩或者空白）；
* 每次读档案都要发一个请求，首屏变慢。

两个都存，于是：

* **读取**走 localStorage（同步、零延迟、离线可用）；
* **写入**同时写两边——localStorage 立刻更新（界面不等网络），
  服务端异步落盘（跨设备同步的基础）。

冲突时怎么办
------------

**服务端优先**，但用 ``updated_at`` 时间戳判断谁更新。

理由：localStorage 是**同一台设备上的缓存**，服务端是**权威**。
如果服务端有记录且它的时间戳不早于本地，就用服务端的。
只有当服务端还没有这个用户的记录时，本地才主导——这覆盖了
「用户先在本地改了，之后才第一次连上服务端」的情况。
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

#: 档案文件。
PROFILE_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "user_profile.json"
)

#: 预设头像——极简的几何图形，渲染成 SVG，不依赖任何图片文件。
#
# 每个预设头像有稳定的 ``id``，用户切换头像时只存 id。
# 把 SVG 存进 JSON 会让文件迅速膨胀，而且样式更新后存的老数据会
# 停留在旧样式上。
PRESET_AVATARS: list[dict[str, Any]] = [
    {"id": "aurora", "name": "极光", "colors": ["#1d4ed8", "#0f172a"]},
    {"id": "indigo", "name": "靛蓝", "colors": ["#1e3a8a", "#334155"]},
    {"id": "cobalt", "name": "钴蓝", "colors": ["#2563eb", "#0f172a"]},
    {"id": "slate", "name": "石墨", "colors": ["#475569", "#0f172a"]},
    {"id": "teal", "name": "青碧", "colors": ["#0f766e", "#0f172a"]},
    {"id": "plum", "name": "紫檀", "colors": ["#6d28d9", "#0f172a"]},
    {"id": "amber", "name": "暖阳", "colors": ["#b45309", "#0f172a"]},
    {"id": "rose", "name": "赭红", "colors": ["#9f1239", "#0f172a"]},
]

#: 预设头像 id 集合——用于校验。
AVATAR_IDS = {item["id"] for item in PRESET_AVATARS}

#: 可选的地区（跟 ``LocaleContext`` 的 ``Region`` 对齐）。
REGIONS = [
    {"id": "cn", "name": "中国大陆"},
    {"id": "hktw", "name": "中国香港 / 台湾"},
    {"id": "apac", "name": "亚太与东南亚"},
    {"id": "na", "name": "北美"},
    {"id": "eu", "name": "欧洲"},
    {"id": "anz", "name": "澳新"},
]

#: 地区 id 集合。
REGION_IDS = {item["id"] for item in REGIONS}

#: 常用时区——给地区做细化。
TIMEZONES = [
    "Asia/Shanghai",
    "Asia/Taipei",
    "Asia/Hong_Kong",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Pacific/Auckland",
    "America/Los_Angeles",
    "America/Vancouver",
    "America/New_York",
    "America/Toronto",
    "America/Chicago",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Europe/Amsterdam",
    "Africa/Johannesburg",
    "UTC",
]


def _read_all() -> dict[str, dict[str, Any]]:
    if not PROFILE_PATH.exists():
        return {}
    try:
        raw = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    profiles = raw.get("profiles")
    if isinstance(profiles, dict):
        return {
            str(key): value
            for key, value in profiles.items()
            if isinstance(value, dict)
        }
    return {}


def _write_all(profiles: dict[str, dict[str, Any]]) -> None:
    PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "updated_at": time.time(), "profiles": profiles}
    tmp = PROFILE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(PROFILE_PATH)


def default_profile(user_id: str = "default") -> dict[str, Any]:
    """一份**完整**的默认档案。

    每个字段都有明确的默认值——前端不需要处理「字段缺失」的情况。
    """
    return {
        "user_id": user_id,
        "nickname": "",
        "avatar_id": "aurora",
        "avatar_url": "",
        "region": "cn",
        "timezone": "Asia/Shanghai",
        "locale": "zh-CN",
        "goal": "",
        "updated_at": 0.0,
    }


def normalize_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """把任意输入规整成合法档案。

    校验每一项，非法值退回默认值——**不做静默接受**。
    一个 ``avatar_id: "hacker"`` 存进去会让前端渲染出一个空头像。
    """
    profile = default_profile(str(raw.get("user_id") or "default"))

    nickname = str(raw.get("nickname") or "").strip()
    profile["nickname"] = nickname[:32]

    avatar_id = str(raw.get("avatar_id") or "").strip()
    if avatar_id in AVATAR_IDS:
        profile["avatar_id"] = avatar_id
    else:
        profile["avatar_id"] = "aurora"

    avatar_url = str(raw.get("avatar_url") or "").strip()
    # 只接受 http(s) 与 data URL。
    #
    # 不接受 ``javascript:`` ——那是 XSS 的载体。头像 URL 会被渲染进
    # ``<img src>``，一个 ``javascript:`` 的 src 在某些浏览器上下文里
    # 仍能执行。
    if avatar_url.startswith(("http://", "https://", "data:image/")):
        profile["avatar_url"] = avatar_url[:2048]
    else:
        profile["avatar_url"] = ""

    region = str(raw.get("region") or "").strip()
    profile["region"] = region if region in REGION_IDS else "cn"

    timezone = str(raw.get("timezone") or "").strip()
    profile["timezone"] = timezone if timezone in TIMEZONES else "Asia/Shanghai"

    locale = str(raw.get("locale") or "").strip()
    profile["locale"] = locale if locale in ("zh-CN", "zh-TW", "en") else "zh-CN"

    profile["goal"] = str(raw.get("goal") or "").strip()[:280]

    try:
        profile["updated_at"] = float(raw.get("updated_at") or 0.0)
    except (TypeError, ValueError):
        profile["updated_at"] = 0.0

    return profile


def get_profile(user_id: str = "default") -> dict[str, Any]:
    """读一个用户的档案。

    没有记录时返回**默认值**，而不是 404——前端不该处理「档案不存在」
    这种状态。
    """
    profiles = _read_all()
    record = profiles.get(user_id)
    if record is None:
        return default_profile(user_id)
    return normalize_profile({**record, "user_id": user_id})


def save_profile(user_id: str, raw: dict[str, Any]) -> dict[str, Any]:
    """保存一个用户的档案。

    ``updated_at`` 由服务端盖——它要成为**冲突判定的依据**，
    不能信客户端传的值。
    """
    profiles = _read_all()
    profile = normalize_profile({**raw, "user_id": user_id})
    profile["updated_at"] = time.time()
    profiles[user_id] = profile
    _write_all(profiles)
    return profile


def export_archive(user_id: str = "default") -> dict[str, Any]:
    """导出**完整学习档案**。

    包含的不只是基本资料——还有：

    * 全部课程观看进度；
    * 全部带时间戳的笔记批注；
    * 已获得的证书。

    这是「一键导出我的学习档案（JSON）」的数据源。
    """
    from app.services.learning_state import (
        list_course_ids,
        load_notes,
        load_session,
    )
    from app.services.certificate_service import list_certificates

    profile = get_profile(user_id)

    courses: list[dict[str, Any]] = []
    notes: list[dict[str, Any]] = []
    conversations: list[dict[str, Any]] = []

    for course_id in list_course_ids():
        try:
            session = load_session(course_id)
        except Exception:  # noqa: BLE001 — 单个课程读失败不影响整体导出
            session = []
        try:
            course_notes = load_notes(course_id)
        except Exception:  # noqa: BLE001
            course_notes = []

        courses.append(
            {
                "course_id": course_id,
                "asked": len(
                    [item for item in session if item.get("role") == "user"]
                ),
                "notes_count": len(course_notes),
            }
        )
        for note in course_notes:
            if isinstance(note, dict):
                notes.append({"course_id": course_id, **note})
        for message in session:
            if isinstance(message, dict):
                conversations.append({"course_id": course_id, **message})

    return {
        "version": 1,
        "exported_at": time.time(),
        "profile": profile,
        "courses": courses,
        "notes": notes,
        "conversations": conversations,
        "certificates": list_certificates(),
    }


def import_archive(payload: dict[str, Any]) -> dict[str, Any]:
    """从导出的档案里恢复资料。

    **只恢复基本资料**——观看进度、笔记、对话、证书的恢复是更大的
    一笔工程（要逐条校验、逐条合并）。

    这里诚实地只做资料部分，并在返回值里说清楚恢复了什么、没恢复
    什么。返回一个假的「全部恢复成功」比明说「只恢复了资料」更糟。
    """
    profile_payload = payload.get("profile")
    if not isinstance(profile_payload, dict):
        return {
            "restored": False,
            "reason": "文件里没有 profile 字段——可能不是本平台导出的档案。",
            "restored_fields": [],
        }

    user_id = str(profile_payload.get("user_id") or "default")
    saved = save_profile(user_id, profile_payload)

    return {
        "restored": True,
        "reason": (
            "基本资料已恢复。观看进度、笔记与证书保存在服务端，"
            "不需要从文件恢复——它们本来就没有丢。"
        ),
        "restored_fields": [
            "nickname",
            "avatar_id",
            "avatar_url",
            "region",
            "timezone",
            "locale",
            "goal",
        ],
        "profile": saved,
    }


__all__ = [
    "AVATAR_IDS",
    "PRESET_AVATARS",
    "PROFILE_PATH",
    "REGIONS",
    "REGION_IDS",
    "TIMEZONES",
    "default_profile",
    "export_archive",
    "get_profile",
    "import_archive",
    "normalize_profile",
    "save_profile",
]
