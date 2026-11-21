"""验证自然语言时间 → 日历粒度的推断。

「下周五」「11 月」「20:00-21:30」这类措辞，是 AI 写计划时最常用的
说法。后端要把它们解析成 ``(scope, start_at, end_at)``，让计划自动
落到正确的日历格子里。

这个测试盯的是**最容易算错**的地方——中文星期。中文的「一…日」
对应周一…周日，而 ``datetime.weekday()`` 是周一=0，两者差 1。
早先直接拿中文数字当 weekday 用，于是「下周五」会算成**周六**。
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.plan_calendar import infer_scope  # noqa: E402

WEEKDAY_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

PASS = 0
FAIL = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        print(f"  ❌ {label}" + (f" —— {detail}" if detail else ""))


def resolve(text: str, now: datetime) -> tuple[str, str]:
    scope, start_at, _ = infer_scope(text, now=now)
    return scope, start_at


def weekday_of(start_at: str) -> str:
    return WEEKDAY_CN[datetime.fromisoformat(start_at).weekday()]


def main() -> int:
    print("=" * 68)
    print("① 中文星期：中文「一…日」必须对上星期几")
    print("=" * 68)

    # 2026-11-12 是周四。
    now = datetime(2026, 11, 12, 9, 0)
    for text, expected in [
        ("下周五", "周五"),
        ("本周五", "周五"),
        ("这周五", "周五"),
        ("下周一", "周一"),
        ("下周三", "周三"),
        ("下周六", "周六"),
        ("下周日", "周日"),
        ("上周五", "周五"),
    ]:
        _, start_at = resolve(text, now)
        check(
            f"「{text}」→ {start_at} 是{expected}",
            weekday_of(start_at) == expected,
            f"实际是{weekday_of(start_at)}",
        )

    print()
    print("=" * 68)
    print("② 「下周X」必须是**下周**的那个星期几，不是最近的")
    print("=" * 68)

    # 今天周四 → 「本周五」= 明天，「下周五」= 下周的周五。
    _, this_fri = resolve("本周五", now)
    _, next_fri = resolve("下周五", now)
    check(
        "「本周五」与「下周五」解析到不同日期",
        this_fri != next_fri,
        f"都是 {this_fri}",
    )
    check(
        "「本周五」是 1 天后",
        (datetime.fromisoformat(this_fri).date() - now.date()).days == 1,
        this_fri,
    )
    check(
        "「下周五」落在下周（>7 天）",
        (datetime.fromisoformat(next_fri).date() - now.date()).days > 7,
        next_fri,
    )

    # 换个基准日再验一次——算法不能只在周四正确。
    for base_day in (0, 1, 2, 3, 4, 5, 6):
        base = datetime(2026, 11, 16, 9, 0) + timedelta(days=base_day)
        for cn, idx in [
            ("一", 0),
            ("二", 1),
            ("三", 2),
            ("四", 3),
            ("五", 4),
            ("六", 5),
            ("日", 6),
        ]:
            _, start_at = resolve(f"下周{cn}", base)
            got = datetime.fromisoformat(start_at).weekday()
            check(
                f"基准={base.strftime('%m-%d')}({WEEKDAY_CN[base.weekday()]}) 「下周{cn}」→ {start_at}",
                got == idx,
                f"实际是{WEEKDAY_CN[got]}",
            )

    print()
    print("=" * 68)
    print("③ 粒度推断：不同措辞落到不同层级")
    print("=" * 68)
    cases = [
        ("2026-11-20", "day", "2026-11-20"),
        ("11 月", "month", "2026-11-01"),
        ("2026 年", "year", "2026-01-01"),
        ("20:00 - 21:30 精读", "slot", None),
        ("今天", "day", "2026-11-12"),
        ("明天", "day", "2026-11-13"),
        ("下个月", "month", "2026-12-01"),
    ]
    for text, want_scope, want_start in cases:
        scope, start_at = resolve(text, now)
        ok = scope == want_scope and (want_start is None or start_at == want_start)
        check(
            f"「{text}」→ scope={scope}, start_at={start_at}",
            ok,
            f"期望 scope={want_scope}, start_at={want_start}",
        )

    print()
    print("=" * 68)
    print("④ 相对月份：说「3 月」但现在 11 月 → 明年 3 月")
    print("=" * 68)
    _, march = resolve("3 月", now)
    check("「3 月」→ 2027-03-01", march == "2027-03-01", march)
    _, nov = resolve("11 月", now)
    check("「11 月」→ 2026-11-01（当月）", nov == "2026-11-01", nov)
    _, next_m = resolve("下个月", now)
    check("「下个月」→ 2026-12-01", next_m == "2026-12-01", next_m)
    _, prev_m = resolve("上个月", now)
    check("「上个月」→ 2026-10-01", prev_m == "2026-10-01", prev_m)

    print()
    print("=" * 68)
    print(f"通过 {PASS} 项，失败 {FAIL} 项")
    print("=" * 68)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
