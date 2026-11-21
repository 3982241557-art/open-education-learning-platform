#!/usr/bin/env python3
"""清除课程文件里预置的假学习进度与演示残留。

学情中心必须是**真实的**——一个都没碰过的课程就该显示 0 页 / 0% /
笔记 0 / 提问 0 / 正确率 — / 待学习。导入脚本有时会在课程 JSON 里
留下 ``visited_page_ids`` 之类的种子值（用于让示例页面看起来有内容），
那些值会变成「假进度」，必须清掉。

同时清理 ``backend/data/sessions/`` 下开发期留下的演示数据——空笔记、
测试对话、样例测验与随手写的计划。它们会让「没碰过的课程」显示出
虚假的笔记数与提问数。

用法::

    python scripts/purge_seed_progress.py            # 只报告，不改
    python scripts/purge_seed_progress.py --apply    # 真的清
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COURSES_ROOT = ROOT / "backend" / "data" / "courses"
SESSIONS_ROOT = ROOT / "backend" / "data" / "sessions"

#: 会被清空的进度字段。
SEED_FIELDS = ("visited_page_ids", "bookmarked_page_ids", "quiz_attempts", "weak_chapters", "score")


def main() -> int:
    parser = argparse.ArgumentParser(description="清除课程文件里的预置学习进度")
    parser.add_argument("--apply", action="store_true", help="真的写入磁盘（默认只报告）")
    args = parser.parse_args()

    changed = 0
    for path in sorted(COURSES_ROOT.glob("*.json")):
        if path.name == "template-schema.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"跳过 {path.name}: {exc}")
            continue
        if not isinstance(data, dict):
            continue

        progress = data.get("progress")
        if not isinstance(progress, dict):
            continue

        dirty = False
        for field in SEED_FIELDS:
            value = progress.get(field)
            if field == "visited_page_ids":
                if isinstance(value, list) and value:
                    progress[field] = []
                    dirty = True
            elif field in {"bookmarked_page_ids", "quiz_attempts", "weak_chapters"}:
                if isinstance(value, list) and value:
                    progress[field] = []
                    dirty = True
            elif field == "score":
                if value:
                    progress[field] = 0
                    dirty = True

        # 时间戳与当前页也算种子——「最近学习 8 小时前」就是这么来的。
        if progress.get("current_page_id"):
            progress["current_page_id"] = ""
            dirty = True
        if progress.get("updated_at"):
            progress["updated_at"] = 0.0
            dirty = True

        if not dirty:
            continue

        changed += 1
        if args.apply:
            path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"已清理 {path.name}")
        else:
            print(f"待清理 {path.name}")

    print(f"\n共 {changed} 门课程{'已清理' if args.apply else '需要清理'}（未加 --apply 时不写盘）")

    # ── 会话目录：清掉开发期留下的演示数据 ──
    session_changed = _purge_sessions(apply=args.apply)
    if session_changed:
        print(f"会话目录：{'已清理' if args.apply else '需要清理'} {session_changed} 个文件")
    return 0


def _purge_sessions(*, apply: bool) -> int:
    """清掉 ``backend/data/sessions/`` 下的演示数据。

    判定规则：

    * ``notes.json`` —— 删掉**没有正文**的笔记（只划线没写字的多半是
      演示残留；真正写了字的那条要留）；
    * ``session.json`` —— 整体清空（开发期测试对话）；
    * ``quizzes.json`` —— 整体清空（样例测验，且从未作答过）；
    * ``plans.json`` —— 删掉**没有绑定课程**的计划（随手写的孤儿计划）。
    """
    if not SESSIONS_ROOT.exists():
        return 0

    changed = 0
    for directory in sorted(SESSIONS_ROOT.iterdir()):
        if not directory.is_dir():
            continue

        notes_path = directory / "notes.json"
        if notes_path.exists():
            notes = _load(notes_path, [])
            if isinstance(notes, list):
                kept = [
                    item
                    for item in notes
                    if isinstance(item, dict) and str(item.get("note") or "").strip()
                ]
                if len(kept) != len(notes):
                    changed += 1
                    _write(notes_path, kept, apply=apply)

        session_path = directory / "session.json"
        if session_path.exists():
            session = _load(session_path, [])
            if isinstance(session, list) and session:
                changed += 1
                _write(session_path, [], apply=apply)

        quizzes_path = directory / "quizzes.json"
        if quizzes_path.exists():
            quizzes = _load(quizzes_path, [])
            if isinstance(quizzes, list) and quizzes:
                changed += 1
                _write(quizzes_path, [], apply=apply)

        plans_path = directory / "plans.json"
        if plans_path.exists():
            plans = _load(plans_path, [])
            if isinstance(plans, list):
                kept = [
                    item
                    for item in plans
                    if isinstance(item, dict) and str(item.get("course_id") or "").strip()
                ]
                if len(kept) != len(plans):
                    changed += 1
                    _write(plans_path, kept, apply=apply)

    return changed


def _load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _write(path: Path, payload, *, apply: bool) -> None:
    if apply:
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )


if __name__ == "__main__":
    raise SystemExit(main())
