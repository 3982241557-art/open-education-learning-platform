"""验证 AI 上下文的**注入预算**。

模块 4 承诺的上下文注入规则：

- 当前页的笔记 **≤ 12** 条；
- 跨页的「最近划线批注」**≤ 5** 条；
- 历史对话 **≤ 5 轮**（不是 5 条消息）；
- 用户**勾选**的笔记全量进入，且不会被「最近」重复注入。

这些上限存在的意义是**控制噪声**：一页里划了 40 处，全塞进提示词
就成了噪声，模型反而抓不住重点。所以上限必须真的生效，不能只是
写在注释里。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import ChatRequest, _build_prompt  # noqa: E402
from app.services.prompt_assembly import MAX_HISTORY_TURNS  # noqa: E402

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


PAGE_NOTE_LIMIT = 12
RECENT_NOTE_LIMIT = 5

COURSE_ID = "interactive_video_demo"
PAGE_ID = "node_opportunity_cost"
OTHER_PAGE_ID = "node_trade"


def _seed_notes() -> None:
    """造一批笔记：15 条在当前页 + 5 条在别的页。

    数量刻意超过两个上限（12 / 5），这样才能验证**截断**确实发生。
    """
    import json

    notes = []
    for i in range(15):
        notes.append(
            {
                "id": f"note_p{i:02d}",
                "quote": f"当前页原文 {i}",
                "note": f"本页批注 {i}",
                "page_id": PAGE_ID,
                "block_id": "",
                "origin": "user",
                "style": "highlight",
                "color": "amber",
                "created_at": 0.0,
                "updated_at": 0.0,
            }
        )
    for i in range(5):
        notes.append(
            {
                "id": f"note_r{i:02d}",
                "quote": f"其他页原文 {i}",
                "note": f"别页批注 {i}",
                "page_id": OTHER_PAGE_ID,
                "block_id": "",
                "origin": "user",
                "style": "highlight",
                "color": "amber",
                "created_at": float(i),
                "updated_at": float(i),
            }
        )
    directory = Path(__file__).resolve().parents[1] / "data" / "sessions" / COURSE_ID
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "notes.json").write_text(
        json.dumps(notes, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _clean_notes() -> None:
    directory = Path(__file__).resolve().parents[1] / "data" / "sessions" / COURSE_ID
    if directory.exists():
        (directory / "notes.json").write_text("[]", encoding="utf-8")


def _split_sections(system_prompt: str) -> tuple[str, str, str]:
    """把 system prompt 切成三段：当页 / 勾选 / 最近。"""
    page_part = system_prompt.split("## 用户引用的留存笔记")[0]
    rest = system_prompt.split("## 用户引用的留存笔记")[-1]
    selected_part = rest.split("## 用户最近的划线批注")[0]
    recent_part = rest.split("## 用户最近的划线批注")[-1]
    return page_part, selected_part, recent_part


def main() -> int:
    print("=" * 68)
    print("① 当前页笔记 ≤ 12")
    print("=" * 68)

    _seed_notes()
    try:
        payload = ChatRequest(
            message="请结合我的划线讲讲这一节",
            session_id=COURSE_ID,
            course_id=COURSE_ID,
            page_ids=[PAGE_ID],
            note_ids=["note_p00", "note_p01"],
            language="zh",
        )
        prompt = _build_prompt(payload).system_prompt
        page_part, selected_part, recent_part = _split_sections(prompt)

        page_notes = re.findall(r"本页批注 (\d+)", page_part)
        check(
            f"当页只注入了 {len(page_notes)} 条（≤ {PAGE_NOTE_LIMIT}）",
            len(page_notes) <= PAGE_NOTE_LIMIT,
            f"实际 {len(page_notes)}",
        )
        check(
            "当页笔记确实来自当前页",
            len(page_notes) > 0,
            "一条都没注入",
        )

        print()
        print("=" * 68)
        print("② 跨页「最近批注」≤ 5")
        print("=" * 68)
        recent_total = len(re.findall(r"本页批注 (\d+)", recent_part)) + len(
            re.findall(r"别页批注 (\d+)", recent_part)
        )
        check(
            f"最近批注共 {recent_total} 条（≤ {RECENT_NOTE_LIMIT}）",
            recent_total <= RECENT_NOTE_LIMIT,
            f"实际 {recent_total}",
        )

        print()
        print("=" * 68)
        print("③ 用户勾选的笔记：全量进入，且不被「最近」重复")
        print("=" * 68)
        selected = re.findall(r"本页批注 (\d+)", selected_part)
        check(
            "勾选的 2 条笔记都进入了提示词",
            len(selected) == 2,
            f"实际 {len(selected)}",
        )
        recent_page = set(re.findall(r"本页批注 (\d+)", recent_part))
        check(
            "勾选的笔记没有在「最近」区里重复出现",
            not ({"0", "1"} & recent_page),
            f"最近区含本页 {sorted(recent_page)}",
        )

        print()
        print("=" * 68)
        print("④ 历史对话 ≤ 5 轮（不是 5 条消息）")
        print("=" * 68)
        history = []
        for i in range(12):
            history.append({"role": "user", "content": f"问题{i}"})
            history.append({"role": "assistant", "content": f"回答{i}"})
        messages = _build_prompt(
            ChatRequest(message="本轮问题", history=history, language="zh")
        ).messages
        # 最后一条是本轮提问，不算历史。
        history_users = [
            m["content"] for m in messages[:-1] if m["role"] == "user"
        ]
        check(
            f"传入 12 轮 → 保留 {len(history_users)} 轮（≤ {MAX_HISTORY_TURNS}）",
            len(history_users) <= MAX_HISTORY_TURNS,
            f"实际 {len(history_users)}",
        )
        check(
            "保留的是**最近**的几轮",
            history_users[-1] == "问题11",
            f"最后是 {history_users[-1] if history_users else None}",
        )

        # 少于上限时应全量保留。
        short_history = []
        for i in range(3):
            short_history.append({"role": "user", "content": f"问题{i}"})
            short_history.append({"role": "assistant", "content": f"回答{i}"})
        short_messages = _build_prompt(
            ChatRequest(message="x", history=short_history, language="zh")
        ).messages
        short_users = [m["content"] for m in short_messages[:-1] if m["role"] == "user"]
        check(
            "不足 5 轮时全部保留",
            len(short_users) == 3,
            f"实际 {len(short_users)}",
        )

        print()
        print("=" * 68)
        print("⑤ 空上下文不炸")
        print("=" * 68)
        empty = _build_prompt(
            ChatRequest(message="随便问问", language="zh")
        ).system_prompt
        check("无课程无笔记也能组装出提示词", len(empty) > 0)

    finally:
        _clean_notes()

    print()
    print("=" * 68)
    print(f"通过 {PASS} 项，失败 {FAIL} 项")
    print("=" * 68)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
