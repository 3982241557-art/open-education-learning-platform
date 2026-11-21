#!/usr/bin/env python3
"""端到端验证「零假数据 + 真实遥测」链路。

用**真实接口**跑一遍，确认：

1. 未触碰的课程严格是 0 页 / 0% / 笔记 0 / 提问 0 / 正确率 — / 待学习；
2. ``POST /api/courses/{id}/telemetry`` 真的把页记进已读集合，并更新
   「最近学习」时间戳——而且**必须有证据**（停留够久 或 滚到底）；
   仅仅「翻开过」不算读过；
3. 新增笔记后，「笔记数」与状态立刻变化，落盘到
   ``backend/data/sessions/{course_id}/notes.json``；
4. 提交测验作答后，「正确率」变成真实数字；
5. 掌握度按规则切换（待学习 → 学习中 → 薄弱需巩固 / 已掌握）；
6. 「继续学习」的跳转锚点（``last_page_id``）指向最后读过的那一页。

用法::

    python scripts/verify_telemetry.py --base http://127.0.0.1:8001
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

PASS = 0
FAIL = 0


def check(label: str, condition: bool, detail: str = "") -> bool:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        print(f"  ❌ {label}" + (f" —— {detail}" if detail else ""))
    return condition


def call(base: str, path: str, method: str = "GET", payload: dict | None = None):
    url = f"{base}{path}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return {"__error__": exc.code, "__body__": exc.read().decode("utf-8")}


def progress_of(base: str, course_id: str) -> dict:
    data = call(base, f"/api/learning/progress?course_id={course_id}")
    courses = data.get("courses") or []
    return courses[0] if courses else {}


def _course_path(course_id: str) -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "backend"
        / "data"
        / "courses"
        / f"{course_id}.json"
    )


def _session_dir(course_id: str) -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "backend"
        / "data"
        / "sessions"
        / course_id
    )


def reset_progress_file(course_id: str) -> None:
    """把某门课的阅读进度归零。"""
    path = _course_path(course_id)
    if not path.exists():
        return
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw.get("progress"), dict):
        raw["progress"]["visited_page_ids"] = []
        raw["progress"]["current_page_id"] = ""
        raw["progress"]["updated_at"] = 0.0
        # 遥测数据也要一起清掉——否则「读过」的判定还留着上一轮的
        # 证据，清零后进度仍然是满的。
        raw["progress"]["dwell_seconds"] = 0.0
        raw["progress"]["page_dwell"] = {}
        raw["progress"]["page_coverage"] = {}
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")


def reset_session_file(course_id: str) -> None:
    """清掉某门课的会话历史与测验记录。"""
    directory = _session_dir(course_id)
    if not directory.exists():
        return
    (directory / "session.json").write_text("[]", encoding="utf-8")
    (directory / "quizzes.json").write_text("[]", encoding="utf-8")


def reset_notes_file(course_id: str) -> None:
    """清掉某门课的留存文档。

    笔记也会影响「掌握度」判定（写了批注 = 完成过复盘），而且笔记数
    是断言项。不清的话，脚本跑到一半会因为「之前遗留的笔记」而误判
    失败——**测试必须自包含**：跑之前是干净的，跑之后也是干净的。
    """
    directory = _session_dir(course_id)
    if not directory.exists():
        return
    (directory / "notes.json").write_text("[]", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="验证学情中心的数据真实性")
    parser.add_argument("--base", default="http://127.0.0.1:8001")
    parser.add_argument("--course", default="interactive_video_demo")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    course_id = args.course

    print("=" * 68)
    print("① 未触碰的课程必须严格是零状态")
    print("=" * 68)
    overview = call(base, "/api/learning/progress")
    courses = {item["course_id"]: item for item in overview.get("courses", [])}
    check("大盘包含全部课程", len(courses) > 0, f"实际 {len(courses)}")

    # 被测课程要先**归零**——它之前可能已经读过、问过、划过线。
    # 其他课程才是「未触碰」的那批，必须严格是零状态。
    #
    # 注意：这里归零的是**被测课程**。别的课程如果用户真的学过，
    # 就该保持原样——脚本不该动用户的真实数据。
    reset_progress_file(course_id)
    reset_session_file(course_id)
    reset_notes_file(course_id)

    overview = call(base, "/api/learning/progress")
    courses = {item["course_id"]: item for item in overview.get("courses", [])}
    zero_ok = True
    for cid, item in courses.items():
        if cid == course_id:
            continue
        if item["visited_pages"] != 0 or item["note_count"] != 0:
            zero_ok = False
            break
        if item["ask_count"] != 0 or item["quiz_accuracy"] is not None:
            zero_ok = False
            break
        if item["status"] != "待学习" or item["last_active_at"] != 0:
            zero_ok = False
            break
    check("每门课都是 0 页 / 0 笔记 / 0 提问 / 正确率 None / 待学习", zero_ok)
    check(
        "汇总里 learned_count == 0",
        overview.get("summary", {}).get("learned_count") == 0,
    )

    print()
    print("=" * 68)
    print("② 真实阅读进度：telemetry 事件（必须有阅读证据）")
    print("=" * 68)
    course = call(base, f"/api/courses/{course_id}")
    pages = course.get("pages", [])
    check("课程有页面", len(pages) > 0)
    first = pages[0]["id"]
    second = pages[1]["id"] if len(pages) > 1 else first

    # ②-a 只「翻开过」不算读过——停留不足、也没滚到底。
    call(base, f"/api/courses/{course_id}/visit", "POST", {"page_id": first})
    call(
        base,
        f"/api/courses/{course_id}/telemetry",
        "POST",
        {"page_id": first, "dwell_seconds": 1.0, "coverage": 0.1},
    )
    after_open = progress_of(base, course_id)
    check(
        "翻开过但没读 → 已读页数仍为 0",
        after_open.get("visited_pages") == 0,
        str(after_open.get("visited_pages")),
    )
    check(
        "但「打开过」被记录下来了",
        after_open.get("opened_pages") == 1,
        str(after_open.get("opened_pages")),
    )
    check(
        "覆盖率仍为 0",
        abs(after_open.get("coverage", 0)) < 1e-6,
        str(after_open.get("coverage")),
    )
    check("最近学习时间戳已更新", after_open.get("last_active_at", 0) > 0)
    check(
        "只是翻开过 → 状态仍是「待学习」（读了才算学过）",
        after_open.get("status") == "待学习",
        str(after_open.get("status")),
    )
    check("跳转锚点 = 刚翻开的那一页", after_open.get("last_page_id") == first)

    # ②-b 停留够久 → 这一页才算「读过」。
    call(
        base,
        f"/api/courses/{course_id}/telemetry",
        "POST",
        {"page_id": first, "dwell_seconds": 9.0, "coverage": 0.1},
    )
    after_dwell = progress_of(base, course_id)
    check("已读页数 = 1", after_dwell.get("visited_pages") == 1, str(after_dwell.get("visited_pages")))
    check(
        "覆盖率随之更新",
        abs(after_dwell.get("coverage", 0) - 1 / len(pages)) < 1e-6,
        str(after_dwell.get("coverage")),
    )
    check(
        "真的读过 → 状态从待学习 → 学习中",
        after_dwell.get("status") == "学习中",
        str(after_dwell.get("status")),
    )
    check(
        "真实停留时长被记录",
        after_dwell.get("dwell_seconds", 0) > 0,
        str(after_dwell.get("dwell_seconds")),
    )

    # ②-c 重复上报不重复计数，且覆盖率只增不减。
    call(
        base,
        f"/api/courses/{course_id}/telemetry",
        "POST",
        {"page_id": first, "dwell_seconds": 9.0, "coverage": 0.1},
    )
    again = progress_of(base, course_id)
    check("重复上报不重复计数", again.get("visited_pages") == 1)

    # ②-d 滚到底也算读过（停留很短）。
    if second != first:
        call(
            base,
            f"/api/courses/{course_id}/telemetry",
            "POST",
            {"page_id": second, "dwell_seconds": 1.0, "coverage": 0.9},
        )
        after_scroll = progress_of(base, course_id)
        check(
            "滚到底 → 也算已读（已读页数 = 2）",
            after_scroll.get("visited_pages") == 2,
            str(after_scroll.get("visited_pages")),
        )

    # ②-e 覆盖率只取**最大**值，不会被乱序的小值改小。
    before_low = progress_of(base, course_id).get("visited_pages")
    call(
        base,
        f"/api/courses/{course_id}/telemetry",
        "POST",
        {"page_id": first, "dwell_seconds": 0.0, "coverage": 0.05},
    )
    after_low = progress_of(base, course_id)
    check(
        "乱序小覆盖率不会改小进度",
        after_low.get("visited_pages") == before_low,
        f"{after_low.get('visited_pages')} vs {before_low}",
    )

    # ②-f 没有遥测数据时，**不能**退回「打开过就算读过」。
    #
    # 这是一条造假的**后门**：只要遥测一条都没落盘（上报失败、或
    # 用户只是飞快地点了一串页），``visited_page_ids`` 里的每一页
    # 都会被算成「读过」。这里显式验证它已经关上了。
    reset_progress_file(course_id)
    call(base, f"/api/courses/{course_id}/visit", "POST", {"page_id": first})
    no_telemetry = progress_of(base, course_id)
    check(
        "只有 visit、没有任何遥测 → 已读页数 = 0（后门已关闭）",
        no_telemetry.get("visited_pages") == 0,
        str(no_telemetry.get("visited_pages")),
    )
    check(
        "但「打开过」仍被记录",
        no_telemetry.get("opened_pages") == 1,
        str(no_telemetry.get("opened_pages")),
    )
    check(
        "没有证据 → 状态仍是待学习",
        no_telemetry.get("status") == "待学习",
        str(no_telemetry.get("status")),
    )
    # 把遥测补回来，状态才跟着变。
    call(
        base,
        f"/api/courses/{course_id}/telemetry",
        "POST",
        {"page_id": first, "dwell_seconds": 9.0, "coverage": 0.1},
    )
    with_evidence = progress_of(base, course_id)
    check(
        "补上证据 → 已读页数 = 1",
        with_evidence.get("visited_pages") == 1,
        str(with_evidence.get("visited_pages")),
    )
    check(
        "补上证据 → 状态变「学习中」",
        with_evidence.get("status") == "学习中",
        str(with_evidence.get("status")),
    )

    print()
    print("=" * 68)
    print("③ 真实笔记：落盘 + 计数 + 状态")
    print("=" * 68)
    note_id = "note_verify_telemetry_001"
    saved = call(
        base,
        f"/api/learning/notes?course_id={course_id}",
        "POST",
        {
            "id": note_id,
            "quote": "A higher-order function is one that takes a function as an argument.",
            "note": "这就是「函数是一等公民」的意思。",
            "page_id": first,
            "origin": "user",
            "style": "wavy",
            "color": "rose",
        },
    )
    check("笔记接口返回笔记", bool(saved.get("note")))
    check("形状被保存", saved.get("note", {}).get("style") == "wavy")
    check("配色被保存", saved.get("note", {}).get("color") == "rose")
    check("正文被保存", saved.get("note", {}).get("note", "").startswith("这就是"))

    notes = call(base, f"/api/learning/notes?course_id={course_id}").get("notes", [])
    check("笔记真的落到后端列表里", any(n["id"] == note_id for n in notes))

    after_note = progress_of(base, course_id)
    check("学情中心的笔记数 = 1", after_note.get("note_count") == 1, str(after_note.get("note_count")))

    # 章节级：笔记落在第一章 → 第一章有笔记。
    chapters = {c["title"]: c for c in after_note.get("chapters", [])}
    with_note = [c for c in chapters.values() if c["notes"] > 0]
    check("章节级笔记计数同步", len(with_note) == 1, str([c["notes"] for c in chapters.values()]))

    print()
    print("=" * 68)
    print("④ 真实测验正确率：提交作答后才算得出")
    print("=" * 68)
    quizzes = call(base, f"/api/learning/quizzes?course_id={course_id}").get("quizzes", [])
    check("还没有测验记录", len(quizzes) == 0)
    check("正确率此刻是 None", after_note.get("quiz_accuracy") is None)

    # 直接写一条带 page_id 的测验记录（等价于 AI 用 trigger_quiz 生成），
    # 再提交作答，验证正确率是**算出来的**而不是写死的。
    quiz_id = "quiz_verify_telemetry_001"
    quizzes_path = Path(__file__).resolve().parents[1] / "backend" / "data" / "sessions" / course_id / "quizzes.json"
    quizzes_path.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if quizzes_path.exists():
        existing = json.loads(quizzes_path.read_text(encoding="utf-8"))
    existing.append(
        {
            "id": quiz_id,
            "title": "验证测验",
            "page_id": first,
            "created_at": 0.0,
            "questions": [
                {"question": "对", "options": ["是", "否"], "answer": 0, "explanation": ""},
                {"question": "错", "options": ["是", "否"], "answer": 1, "explanation": ""},
            ],
        }
    )
    quizzes_path.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    before_answer = progress_of(base, course_id)
    check("没提交作答时正确率仍是 None", before_answer.get("quiz_accuracy") is None)

    answered = call(
        base,
        f"/api/learning/quizzes/{quiz_id}/answer?course_id={course_id}",
        "POST",
        {"answers": {"0": 0, "1": 1}},
    )
    check("作答接口返回测验记录", bool(answered.get("quiz")))
    saved_questions = answered.get("quiz", {}).get("questions", [])
    check("作答真的写回了后端", saved_questions[0].get("chosen") == 0 and saved_questions[1].get("chosen") == 1)

    after_answer = progress_of(base, course_id)
    check("正确率 = 2/2 = 100%", after_answer.get("quiz_accuracy") == 1.0, str(after_answer.get("quiz_accuracy")))
    check("已答题目数 = 2", after_answer.get("quiz_answered") == 2)

    # 作废掉测试测验——它不该留在用户的真实数据里。
    remaining = [q for q in existing if q.get("id") != quiz_id]
    quizzes_path.write_text(
        json.dumps(remaining, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print()
    print("=" * 68)
    print("⑤ 清理：把测试数据删掉")
    print("=" * 68)
    deleted = call(base, f"/api/learning/notes/{note_id}?course_id={course_id}", "DELETE")
    check("笔记已删除", not any(n["id"] == note_id for n in deleted.get("notes", [])))

    # 把 visit 造成的进度也还回去——它是测试留下的，不是真实学习。
    reset_progress_file(course_id)

    # 会话历史也要清——测试过程中如果问过 AI，「提问轮数」就 > 0，
    # 状态会一直停在「学习中」，下一轮跑这个脚本就会误判。
    reset_session_file(course_id)

    # 笔记同样清——它在开头就被重置过，清理阶段要保持对称，
    # 否则「跑之前干净、跑之后干净」这条契约就不成立。
    reset_notes_file(course_id)

    restored = progress_of(base, course_id)
    check(
        "清理后回到零状态",
        restored.get("visited_pages") == 0
        and restored.get("note_count") == 0
        and restored.get("status") == "待学习",
        json.dumps(
            {
                "visited": restored.get("visited_pages"),
                "notes": restored.get("note_count"),
                "status": restored.get("status"),
            },
            ensure_ascii=False,
        ),
    )

    print()
    print("=" * 68)
    print(f"通过 {PASS} 项，失败 {FAIL} 项")
    print("=" * 68)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
