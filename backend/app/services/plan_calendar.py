"""
计划时间粒度推断
================

同一件「我要在两周内背完《静夜思》」的事，用户可以把它挂在日历的
**四个粒度**上：

===========  ==============================  ==================
``scope``    含义                            典型措辞
===========  ==============================  ==================
``year``     年度目标                        「2026 年度通读计划」
``month``    月度目标                        「11 月攻克 CS61A」
``day``      某一天                          「11 月 5 日读完第三章」
``slot``     某天的某个时间段                「11月5日 20:00-21:30 精读《论语》」
===========  ==============================  ==================

AI 制定的计划里，``due`` 字段常常是自然语言（「下周五」「本月底」）。
本模块负责把它解析成 ``(scope, start_at, end_at)`` 三元组，让计划能
自动落到日历的对应层级上。

为什么要单独一个模块
--------------------

日历渲染需要**结构化**的时间点，而不是字符串。如果让前端去猜
「下周五」是哪天，就得在前端再写一份中文日期解析——而且 AI 用
户和手动用户走同一套逻辑，改一处漏一处。

这里把「自然语言 → 时间点」的推断集中在后端，前端只负责渲染。
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

#: 四个粒度，从粗到细。
SCOPES = ("year", "month", "day", "slot")

#: 中文数字 → 阿拉伯数字。只覆盖到「九」，够日常用了。
_CN_DIGITS = {
    "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}


def _cn_number(text: str) -> int | None:
    """把「十」「二十三」这类中文数字转成整数。"""
    text = text.strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)

    if "十" not in text:
        total = 0
        for char in text:
            if char not in _CN_DIGITS:
                return None
            total = total * 10 + _CN_DIGITS[char]
        return total

    head, _, tail = text.partition("十")
    tens = _CN_DIGITS.get(head, 1) if head else 1
    ones = _CN_DIGITS.get(tail, 0) if tail else 0
    return tens * 10 + ones


def infer_scope(
    due: str = "",
    *,
    start_at: str = "",
    scope: str = "",
    now: datetime | None = None,
) -> tuple[str, str, str]:
    """推断计划的时间粒度与具体时间点。

    返回 ``(scope, start_at, end_at)``。

    优先级：显式传入的字段 > 从 ``due`` 自然语言推断 > 按当前时间
    兜底到 ``month``。

    >>> infer_scope("2026-11-20")
    ('day', '2026-11-20', '')
    >>> infer_scope("11 月")
    ('month', '2026-11-01', '')
    >>> infer_scope("20:00 - 21:30 精读")
    ('slot', '2026-11-04T20:00', '2026-11-04T21:30')
    """
    reference = now or datetime.now()

    # ── 显式指定优先 ──
    if scope in SCOPES and start_at:
        return scope, start_at, ""

    # ── 从 due 推断 ──
    text = str(due or "").strip()
    if text:
        parsed = _parse_due(text, reference)
        if parsed:
            return parsed

    # ── 兜底：本月 ──
    return "month", reference.strftime("%Y-%m-01"), ""


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    """把 ``(年, 月)`` 整体平移 ``delta`` 个月。

    >>> _shift_month(2026, 11, 1)
    (2026, 12)
    >>> _shift_month(2026, 12, 1)
    (2027, 1)
    >>> _shift_month(2026, 11, -1)
    (2026, 10)
    """
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def _parse_due(text: str, reference: datetime) -> tuple[str, str, str] | None:
    """把一段自然语言时间描述解析成 ``(scope, start_at, end_at)``。

    解析不出来就返回 ``None``——宁可让计划落在默认层级，也不要
    猜错一个错误的时间点。
    """
    # ── 1. 时刻：``20:00`` 或 ``20:00-21:30`` ──
    slot = _parse_slot(text, reference)
    if slot:
        return slot

    # ── 2. 完整日期：``2026-11-20`` / ``2026/11/20`` ──
    full = re.search(r"(20\d{2})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})", text)
    if full:
        year, month, day = (int(g) for g in full.groups())
        try:
            base = datetime(year, month, day)
        except ValueError:
            return None
        if _has_time(text):
            return _build_slot(text, base)
        return "day", base.strftime("%Y-%m-%d"), ""

    # ── 3. 年月：``2026 年 11 月`` / ``11 月`` ──
    year_month = re.search(r"(20\d{2})\s*年\s*(\d{1,2}|[一二三四五六七八九十]+)\s*月", text)
    if year_month:
        year = int(year_month.group(1))
        month = _cn_number(year_month.group(2))
        if month and 1 <= month <= 12:
            return "month", datetime(year, month, 1).strftime("%Y-%m-01"), ""

    # 相对年 + 月份：「明年三月」「去年 12 月」「后年五月」。
    relative_year_month = re.search(
        r"(前年|去年|明年|后年)\s*(\d{1,2}|[一二三四五六七八九十]+)\s*月", text
    )
    if relative_year_month:
        offset = {"前年": -2, "去年": -1, "明年": 1, "后年": 2}[
            relative_year_month.group(1)
        ]
        month = _cn_number(relative_year_month.group(2))
        if month and 1 <= month <= 12:
            year = reference.year + offset
            return "month", datetime(year, month, 1).strftime("%Y-%m-01"), ""

    # 纯月份：「11 月」「三月」——没说年份时按最近的将来算。
    month_only = re.search(
        r"(\d{1,2}|[一二三四五六七八九十]+)\s*月", text
    )
    if month_only:
        month = _cn_number(month_only.group(1))
        if month and 1 <= month <= 12:
            year = reference.year
            # 说「3 月」但现在已是 11 月——多半指明年。
            if month < reference.month:
                year += 1
            return "month", datetime(year, month, 1).strftime("%Y-%m-01"), ""

    # 相对月：「下个月」「上个月」「本月」——整月偏移。
    relative_month = re.search(
        r"(下下个?月|下个?月|上个?月|本月|这个?月|这月)", text
    )
    if relative_month:
        keyword = relative_month.group(1)
        year, month = reference.year, reference.month
        if keyword.startswith("下下"):
            year, month = _shift_month(year, month, 2)
        elif keyword.startswith("下"):
            year, month = _shift_month(year, month, 1)
        elif keyword.startswith("上"):
            year, month = _shift_month(year, month, -1)
        return "month", datetime(year, month, 1).strftime("%Y-%m-01"), ""

    # ── 4. 年：``2026 年`` / ``2026 年度`` ──
    year_only = re.search(r"(20\d{2})\s*年", text)
    if year_only:
        year = int(year_only.group(1))
        return "year", datetime(year, 1, 1).strftime("%Y-01-01"), ""

    # 相对年：「明年」「后年」——没有月份时只能挂到年粒度。
    relative_year_only = re.search(r"(前年|去年|明年|后年)", text)
    if relative_year_only:
        offset = {"前年": -2, "去年": -1, "明年": 1, "后年": 2}[
            relative_year_only.group(1)
        ]
        year = reference.year + offset
        return "year", datetime(year, 1, 1).strftime("%Y-01-01"), ""

    # ── 5. 相对表述：「下周五」「本月底」「今天」 ──
    return _parse_relative(text, reference)


def _has_time(text: str) -> bool:
    """文本里是否含具体时刻。"""
    return bool(re.search(r"\d{1,2}\s*[:：]\s*\d{2}", text))


def _parse_slot(text: str, reference: datetime) -> tuple[str, str, str] | None:
    """解析时刻级的时间描述。

    支持 ``20:00-21:30``、``20:00 到 21:30``、``20:00`` 三种写法。
    """
    times = re.findall(r"(\d{1,2})\s*[:：]\s*(\d{2})", text)
    if not times:
        return None

    start_h, start_m = int(times[0][0]), int(times[0][1])
    if not (0 <= start_h <= 23 and 0 <= start_m <= 59):
        return None

    # 日期部分：有就取，没有就用今天。
    day_match = re.search(r"(20\d{2})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})", text)
    if day_match:
        year, month, day = (int(g) for g in day_match.groups())
        try:
            base = datetime(year, month, day)
        except ValueError:
            base = reference
    else:
        month_only = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]", text)
        if month_only:
            month, day = int(month_only.group(1)), int(month_only.group(2))
            year = reference.year
            try:
                base = datetime(year, month, day)
            except ValueError:
                base = reference
        else:
            base = reference

    start = base.replace(hour=start_h, minute=start_m, second=0, microsecond=0)

    end = ""
    if len(times) > 1:
        end_h, end_m = int(times[1][0]), int(times[1][1])
        candidate = base.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
        # 结束时间早于开始时间 → 认为是跨过午夜。
        if candidate <= start:
            candidate += timedelta(days=1)
        end = candidate.strftime("%Y-%m-%dT%H:%M")

    return "slot", start.strftime("%Y-%m-%dT%H:%M"), end


def _build_slot(text: str, base: datetime) -> tuple[str, str, str]:
    """已知日期、文本里还有时刻时的组合。"""
    times = re.findall(r"(\d{1,2})\s*[:：]\s*(\d{2})", text)
    start = base.replace(hour=int(times[0][0]), minute=int(times[0][1]), second=0, microsecond=0)
    end = ""
    if len(times) > 1:
        end = base.replace(hour=int(times[1][0]), minute=int(times[1][1]), second=0, microsecond=0).strftime(
            "%Y-%m-%dT%H:%M"
        )
    return "slot", start.strftime("%Y-%m-%dT%H:%M"), end


def _parse_relative(text: str, reference: datetime) -> tuple[str, str, str] | None:
    """解析「今天」「明天」「下周五」「本月底」这类相对表述。"""
    base = reference

    # ── 本周 / 下周 的星期几 ──
    weekday = re.search(r"(下|本|这|上)?(?:周|星期|礼拜)([一二三四五六日天])", text)
    if weekday:
        raw = weekday.group(2)
        # 中文星期「一…日」对应的是**周一…周日**。
        #
        # 而 ``datetime.weekday()`` 是「周一=0、周二=1、…、周日=6」。
        # 所以中文的「一」要减 1 才是 weekday。
        #
        # 早先这里直接用了 ``_CN_DIGITS[raw]``（「五」→ 5），于是
        # 「下周五」在周四会被算成 **周六**——差了一整天，计划落错格子。
        # 「日」「天」是周日 = 6。
        target = _CN_DIGITS.get(raw)
        if raw in ("日", "天"):
            target = 6
        elif target is not None:
            target -= 1
        if target is not None:
            offset = weekday.group(1) or ""
            current = base.weekday()
            if offset == "下":
                # 「下周五」= **下个**周五，不是「最近的周五」。
                #
                # 早先这里算的是 ``(target - current + 7) % 7``——那是
                # 「下一个周五」，只差一周。今天周四时，「下周五」和
                # 「本周五」会解析到同一天，用户说的两件事被当成一件。
                #
                # 正确算法：以「下周一」为锚点。今天是周 X，下周一在
                # ``7 - current`` 天后，再往后加 ``target`` 天就是
                # 下周的那个星期几。
                next_monday = base + timedelta(days=7 - current)
                base = next_monday + timedelta(days=target)
            elif offset == "上":
                base = base - timedelta(days=(current - target + 7) % 7 or 7)
            else:
                delta = (target - current) % 7
                base = base + timedelta(days=delta)
            return "day", base.strftime("%Y-%m-%d"), ""

    # ── 今天 / 明天 / 后天 ──
    if "后天" in text:
        return "day", (base + timedelta(days=2)).strftime("%Y-%m-%d"), ""
    if "明天" in text or "明日" in text:
        return "day", (base + timedelta(days=1)).strftime("%Y-%m-%d"), ""
    if "今天" in text or "今日" in text:
        return "day", base.strftime("%Y-%m-%d"), ""

    # ── 月底 / 月末 ──
    if "月底" in text or "月末" in text:
        year, month = base.year, base.month
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1
        # 月底 = 下个月的第 0 天。
        last = datetime(year, month, 1) - timedelta(days=1)
        return "day", last.strftime("%Y-%m-%d"), ""

    # ── 本周 / 下周（整周） ──
    if "下周" in text:
        start = base + timedelta(days=(7 - base.weekday()))
        return "week", start.strftime("%Y-%m-%d"), ""
    if "本周" in text or "这周" in text:
        start = base - timedelta(days=base.weekday())
        return "week", start.strftime("%Y-%m-%d"), ""

    return None


def describe_scope(scope: str) -> str:
    """粒度的中文标签。"""
    return {
        "year": "年度",
        "month": "月度",
        "day": "每日",
        "week": "每周",
        "slot": "时刻",
    }.get(scope, "")


def apply_scope_to_plan(plan: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    """给一条计划补齐日历定位字段。

    已有 ``scope`` + ``start_at`` 的计划原样返回；只有自然语言
    ``due`` 的计划会被推断。
    """
    scope = str(plan.get("scope") or "")
    start_at = str(plan.get("start_at") or "")
    end_at = str(plan.get("end_at") or "")

    if not scope or not start_at:
        scope, start_at, end_at = infer_scope(
            str(plan.get("due") or ""),
            start_at=start_at,
            scope=scope,
            now=now,
        )

    plan["scope"] = scope
    plan["start_at"] = start_at
    plan["end_at"] = end_at
    plan["scope_label"] = describe_scope(scope)
    return plan


__all__ = [
    "SCOPES",
    "apply_scope_to_plan",
    "describe_scope",
    "infer_scope",
]
