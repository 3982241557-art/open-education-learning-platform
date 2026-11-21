"""
后端冒烟测试
============

用**假模型**替身验证整条管线——不消耗真实 API 额度，也能稳定复现。

被测的链路：

1. 课程上下文动态拉取；
2. Skill 调度（always / engine 立即注入，其余只给清单）；
3. Prompt 组装 + 控制台打印；
4. Action 围栏解析（笔记 / 计划 / 测验）；
5. 动作落盘（notes / plans / quizzes）；
6. 课程级会话隔离与恢复；
7. 宏观学习向导。

模型不可用时的错误路径也一并验证——**必须明确报错，不许降级**。

运行::

    cd backend && .venv/bin/python -m tests.smoke
"""

from __future__ import annotations

import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path

# 让 `python -m tests.smoke` 能找到 app 包。
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import chat as chat_router  # noqa: E402
from app.services import action_protocol, learning_state  # noqa: E402
from app.services.advisor_service import advise  # noqa: E402
from app.services.llm_factory import LLMNotConfiguredError  # noqa: E402

PASSED = 0
FAILED = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  ✅ {label}")
    else:
        FAILED += 1
        print(f"  ❌ {label}" + (f" — {detail}" if detail else ""))


def section(title: str) -> None:
    print(f"\n{'─' * 60}\n{title}\n{'─' * 60}")


# ── Action 协议 ────────────────────────────────────────────────────────


def test_action_protocol() -> None:
    section("Action 协议解析")

    body, actions = action_protocol.parse_actions(
        "这是一段讲解。\n\n```action\n"
        '{"action": "upsert_note", "quote": "床前明月光", "note": "千古名句的开端"}\n'
        "```\n\n后面还有话。"
    )
    check("正文剥掉了动作围栏", "```action" not in body)
    check("正文保留讲解内容", "这是一段讲解" in body and "后面还有话" in body)
    check("解析出 1 个动作", len(actions) == 1, str(actions))
    check("动作类型正确", actions[0].action == "upsert_note")
    check(
        "quote 被规范化",
        action_protocol.normalize_note_payload(actions[0].payload)["quote"] == "床前明月光",
    )

    # 数组形状
    _, actions = action_protocol.parse_actions(
        '```action\n[{"action": "manage_plan", "title": "背完唐诗三百首"}]\n```'
    )
    check("支持数组形状的动作块", len(actions) == 1)
    check("计划动作可识别", actions[0].action == "manage_plan")

    # {"actions": [...]} 形状
    _, actions = action_protocol.parse_actions(
        '```action\n{"actions": [{"action": "trigger_quiz", "questions": '
        '[{"question": "床前明月光?", "options": ["A", "B"], "answer": 0, '
        '"explanation": "李白《静夜思》首句"}]}]}\n```'
    )
    check("支持 actions 包裹形状", len(actions) == 1)
    quiz = action_protocol.normalize_quiz_payload(actions[0].payload)
    check("测验题目被规范化", len(quiz["questions"]) == 1)
    check("答案下标正确", quiz["questions"][0]["answer"] == 0)

    # 坏 JSON 的兜底
    _, actions = action_protocol.parse_actions(
        '```action\n{"action": "upsert_note", "quote": "片段", "note": "批注"\n```'
    )
    check("坏 JSON 也能抢救出动作", len(actions) >= 1)

    # 普通围栏不受影响
    body, actions = action_protocol.parse_actions("```python\nprint(1)\n```")
    check("普通代码围栏不被误判", len(actions) == 0 and "print(1)" in body)


# ── 学习状态持久化 ─────────────────────────────────────────────────────


def test_learning_state(root: Path) -> None:
    section("学习状态持久化（按 course_id 隔离）")

    learning_state.SESSIONS_ROOT = root / "sessions"

    # 笔记
    note = learning_state.upsert_note(
        "course_a", {"quote": "原文 A", "note": "旁注 A", "origin": "user"}
    )
    check("笔记写入成功", bool(note.get("id")))
    learning_state.upsert_note("course_b", {"quote": "原文 B", "note": "旁注 B"})

    notes_a = learning_state.load_notes("course_a")
    notes_b = learning_state.load_notes("course_b")
    check("课程 A 的笔记只有 1 条", len(notes_a) == 1, str(notes_a))
    check("课程 B 的笔记只有 1 条", len(notes_b) == 1, str(notes_b))
    check("两门课的笔记互不干扰", notes_a[0]["quote"] != notes_b[0]["quote"])

    # 更新
    updated = learning_state.upsert_note(
        "course_a", {"id": note["id"], "note": "改过的旁注"}
    )
    check("笔记可更新", updated["note"] == "改过的旁注")
    check("更新不覆盖未传的字段", updated["quote"] == "原文 A")

    # 删除
    check("笔记可删除", learning_state.delete_note("course_a", note["id"]))
    check("删除后为空", len(learning_state.load_notes("course_a")) == 0)

    # 计划
    plan = learning_state.upsert_plan(
        "course_a",
        {
            "title": "两周背完",
            "due": "2026-11-20",
            "items": ["第 1-10 首", "第 11-20 首"],
            "origin": "ai",
        },
    )
    check("计划写入成功", bool(plan.get("id")))
    check("计划带步骤", plan["total"] == 2)
    check("计划标记来自 AI", plan["origin"] == "ai")

    progressed = learning_state.set_plan_progress("course_a", plan["id"], 2)
    check("计划进度可更新", progressed and progressed["done"] == 2)
    check("全部完成时自动标记完成", progressed and progressed["completed"])

    all_plans = learning_state.load_plans("")
    check("全局计划视图包含各课程", len(all_plans) >= 1)

    # 会话隔离
    learning_state.save_session("course_a", [{"role": "user", "content": "问题 A"}])
    learning_state.save_session("course_b", [{"role": "user", "content": "问题 B"}])
    check(
        "会话按课程隔离",
        learning_state.load_session("course_a")[0]["content"] == "问题 A"
        and learning_state.load_session("course_b")[0]["content"] == "问题 B",
    )


# ── 聊天路由（假模型） ─────────────────────────────────────────────────


def test_chat_actions(root: Path) -> None:
    section("聊天路由 · 动作执行")

    learning_state.SESSIONS_ROOT = root / "sessions"

    fake_reply = (
        "这段话解释了「春风」的意象。\n\n"
        "```action\n"
        '{"action": "upsert_note", "quote": "春风又绿江南岸", "note": "炼字名句"}\n'
        "```\n\n"
        "```action\n"
        '{"action": "manage_plan", "op": "create", "title": "本周背完十首", '
        '"due": "2026-11-10", "items": ["每天两首"]}\n'
        "```"
    )

    async def fake_complete(**kwargs):
        return fake_reply

    chat_router.complete = fake_complete

    result = asyncio.run(
        chat_router.chat(
            chat_router.ChatRequest(
                message="这句什么意思？",
                course_id="test_course",
                history=[],
                page_ids=["pg_1"],
            )
        )
    )

    check("返回了回复文本", "春风" in result["reply"])
    check("动作围栏不在回复里", "```action" not in result["reply"])
    check("产生了 2 条动作回执", len(result["actions"]) == 2, str(result["actions"]))

    notes = learning_state.load_notes("test_course")
    check("AI 标注的笔记已落盘", len(notes) == 1, str(notes))
    check("笔记内容正确", notes and notes[0]["quote"] == "春风又绿江南岸")
    check("笔记标记为 AI 起源", notes and notes[0]["origin"] == "ai")

    plans = learning_state.load_plans("test_course")
    check("AI 制定的计划已落盘", len(plans) == 1, str(plans))
    check("计划标题正确", plans and plans[0]["title"] == "本周背完十首")
    check("计划标记为 AI 起源", plans and plans[0]["origin"] == "ai")

    check(
        "会话历史已记录",
        len(learning_state.load_session("test_course")) == 2,
        str(learning_state.load_session("test_course")),
    )


# ── 模型不可用时的错误路径 ─────────────────────────────────────────────


def test_no_fallback() -> None:
    section("模型不可用 · 必须明确报错（不许降级）")

    import os

    os.environ.pop("DEEPSEEK_API_KEY", None)
    os.environ.pop("SEEK_LLM_API_KEY", None)

    from app.services import llm_factory

    llm_factory.load_config = lambda: llm_factory.LLMConfig(api_key="")

    try:
        asyncio.run(llm_factory.complete(prompt="测试"))
        check("未配置密钥时抛错", False, "居然返回了内容")
    except LLMNotConfiguredError as exc:
        check("未配置密钥时抛 LLMNotConfiguredError", True)
        check("错误信息指向 .env 配置", ".env" in str(exc))
    except Exception as exc:
        check("未配置密钥时抛 LLMNotConfiguredError", False, repr(exc))


# ── 宏观学习向导 ───────────────────────────────────────────────────────


def test_advisor() -> None:
    section("宏观学习向导")

    fake_payload = json.dumps(
        {
            "strategy": "先建立整体框架，再逐句精读。",
            "tactics": ["先通读全章", "重点关注意象", "合上书复述"],
            "questions": [
                {"title": "意象对比", "prompt": "本月的意象有何异同？", "hint": "横向比较"},
                {"title": "逐句精读", "prompt": "挑一句讲透。", "hint": "深入一层"},
            ],
        },
        ensure_ascii=False,
    )

    import app.services.llm_factory as llm_factory

    async def fake_complete(**kwargs):
        return fake_payload

    llm_factory.complete = fake_complete
    llm_factory.has_real_model = lambda: True

    result = asyncio.run(advise(course_id="", page_id=""))
    check("向导返回了策略", bool(result.strategy))
    check("向导返回了方法要点", len(result.tactics) >= 1)
    check("向导返回了建议问题", len(result.questions) == 2)
    check("问题带可点击标题", all(q.title for q in result.questions))
    check("标记为真实模型生成", result.from_model)

    # 建议问题必须能原样当提问用——它要交给另一位 AI 去作答。
    check(
        "建议问题内容完整",
        all(len(q.prompt) >= 8 for q in result.questions),
        str([len(q.prompt) for q in result.questions]),
    )


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="seek-smoke-"))
    try:
        test_action_protocol()
        test_learning_state(tmp)
        test_chat_actions(tmp)
        test_no_fallback()
        test_advisor()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{'=' * 60}")
    print(f"通过 {PASSED} 项，失败 {FAILED} 项")
    print(f"{'=' * 60}")
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
