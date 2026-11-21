"""
学情聚合
========

把散落在各处的学习痕迹汇成**一份学情大盘**。

数据来源（全部来自磁盘，**没有任何预置/mock 值**）
--------------------------------------------------

===========================  ==========================  ==================
来源                          位置                        含义
===========================  ==========================  ==================
阅读进度                      课程 JSON 的 ``progress``   读过哪些页
笔记                          ``notes.json``              划线与批注数
提问                          ``session.json``            跟 AI 聊了多少轮
测验                          ``quizzes.json``            答题与正确率
计划                          ``plans.json``              绑定的学习计划
===========================  ==========================  ==================

零状态契约
----------

**没碰过的课程就是零**，不是「看起来像零」：

* 已读页 = 0，覆盖率 = 0%；
* 笔记 = 0，提问 = 0；
* 正确率 = ``None``（前端渲染成「—」，不是 0%）；
* 掌握度 = ``待学习``；
* 最近学习 = 0（前端渲染成「尚未开始」）。

掌握度判定
----------

完全由**真实行为**推出，不用加权分数——加权分数会造出「读了 1 页
就算 45 分」这种看起来有依据、其实没依据的数字。改成**离散档位**：

=========================  ===============================================
档位                        条件
=========================  ===============================================
``待学习``                  没读过、没笔记、没提问
``薄弱需巩固``              测验真实正确率 < 60%
``已掌握``                  读完该范围 + （正确率 ≥ 80% 或 完成复盘）
``学习中``                  其余一切（读过 / 有笔记 / 有提问）
=========================  ===============================================

顺序很重要：先判「什么都没做」，再判「做得不好」，最后才判「做得好」。
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

#: 课程数据根目录。
COURSES_ROOT = Path(__file__).resolve().parents[2] / "data" / "courses"

#: 学习状态根目录（与 ``learning_state`` 一致）。
SESSIONS_ROOT = Path(__file__).resolve().parents[2] / "data" / "sessions"

#: 掌握度档位——从低到高。
MASTERY_LEVELS = ("待学习", "学习中", "薄弱需巩固", "已掌握")

#: 正确率低于此值 → 薄弱需巩固。
WEAK_ACCURACY = 0.6

#: 正确率达到此值（且读完）→ 已掌握。
MASTERY_ACCURACY = 0.8

#: 一页要算「已读」，至少要满足下面**至少一个**条件。
#:
#: * 在这一页上停留了至少这么久（秒）——说明用户真的在读；
#: * 把这一页滚动到了底（``coverage`` 达到阈值）——说明用户读完了。
#:
#: 没有这两个条件，「翻开过」就等于「读过」，进度条就成了假的。
MIN_READ_DWELL_SECONDS = 8.0

#: 滚动覆盖率阈值——滚过这一段就算读完（不要求 100%，正文常有
#: 空白尾部，用户滚到 85% 就已经到底了）。
MIN_READ_COVERAGE = 0.6

#: 一条**外部资源**要算「已看」，至少要在它上面停留这么久（秒）。
#:
#: 为什么资源级阈值比页级低
#: ----------------------
#: 页级正文是「读完需要时间」的——8 秒是最低门槛，读者还要滚动。
#: 资源不一样：一条 20 分钟的 B 站视频、一篇 SEP 长文，用户点开后
#: 可能只读 5 分钟就切走，也可能挂着 40 分钟。
#:
#: 所以资源级的判定分两条路：
#:
#: 1. **停留够久** → 算「已看」；
#: 2. **用户显式标记完成** → 算「已看」（那是明确的意图，比任何
#:    启发式都可靠）。
#:
#: 资源级的「完成度」因此是**两段式**的：既看时长，也看标记。
MIN_RESOURCE_DWELL_SECONDS = 15.0


def is_page_read(
    *,
    dwell_seconds: float,
    coverage: float,
) -> bool:
    """判断一页是否算「**已读**」。

    :param dwell_seconds: 用户在这一页上累计停留的秒数。
    :param coverage: 这一页被滚动看过的最大比例（0–1）。
    """
    return (
        float(dwell_seconds or 0.0) >= MIN_READ_DWELL_SECONDS
        or float(coverage or 0.0) >= MIN_READ_COVERAGE
    )


def _read_json(path: Path, default: Any) -> Any:
    """读一个 JSON 文件，坏了就返回默认值。"""
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def is_resource_seen(
    *,
    dwell_seconds: float,
    marked_done: bool = False,
) -> bool:
    """判断一条外部资源是否算「**已看**」。

    :param dwell_seconds: 用户在这条资源上累计停留的秒数。
    :param marked_done: 用户是否**显式**标记了完成。

    显式标记是明确意图——它比任何启发式都可靠，所以直接算「已看」。
    """
    if marked_done:
        return True
    return float(dwell_seconds or 0.0) >= MIN_RESOURCE_DWELL_SECONDS


def resource_stats(
    course: dict[str, Any],
) -> list[dict[str, Any]]:
    """算出一门课里**每条资源**的学习情况。

    资源级进度为什么必须存在
    ------------------------

    资源枢纽型课程里，一个节点下面挂着**多条**外链——一部讲荒诞的
    视频、一篇维基词条、一份 SEP 长文。如果进度只挂在节点上，
    「这个节点我学过了」是**误导**：用户可能只看了视频，压根没打开
    那篇长文。

    所以这里下沉到资源粒度，每条资源单独回答三个问题：

    * 看了多久（``dwell_seconds``）；
    * 算不算已看（``seen``）；
    * 是不是用户亲口标记完成的（``marked_done``）。

    返回的每条记录都带上完整上下文（课程 / 主题 / 节点），这样
    「资源发现」入口可以直接把它渲染成一张跨课程的资源卡。
    """
    hub = course.get("hub") if isinstance(course.get("hub"), dict) else {}
    topics = hub.get("topics") if isinstance(hub.get("topics"), list) else []

    progress = course.get("progress") if isinstance(course.get("progress"), dict) else {}
    raw_progress = progress.get("resource_progress")
    resource_progress: dict[str, Any] = (
        {str(k): v for k, v in raw_progress.items() if isinstance(v, dict)}
        if isinstance(raw_progress, dict)
        else {}
    )

    course_title = str(course.get("title") or "")
    out: list[dict[str, Any]] = []

    for topic in topics:
        if not isinstance(topic, dict):
            continue
        topic_id = str(topic.get("id") or "")
        topic_title = str(topic.get("title") or "")
        nodes = topic.get("nodes") if isinstance(topic.get("nodes"), list) else []

        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_id = str(node.get("id") or "")
            node_title = str(node.get("title") or "")
            resources = node.get("resources") if isinstance(node.get("resources"), list) else []

            for resource in resources:
                if not isinstance(resource, dict):
                    continue
                resource_id = str(resource.get("id") or "")
                if not resource_id:
                    continue

                record = resource_progress.get(resource_id) or {}
                dwell = float(record.get("dwell_seconds") or 0.0)
                marked_done = bool(record.get("marked_done"))
                opened = bool(record.get("opened"))
                last_active = float(record.get("last_active_at") or 0.0)

                out.append(
                    {
                        "resource_id": resource_id,
                        "resource_type": str(resource.get("resource_type") or "webpage"),
                        "title": str(resource.get("title") or ""),
                        "url": str(resource.get("url") or ""),
                        "provider": str(resource.get("provider") or ""),
                        "ai_context": str(resource.get("ai_context") or ""),
                        "auto_context": bool(resource.get("auto_context")),
                        "course_id": str(course.get("id") or ""),
                        "course_title": course_title,
                        "topic_id": topic_id,
                        "topic_title": topic_title,
                        "node_id": node_id,
                        "node_title": node_title,
                        "dwell_seconds": round(dwell, 3),
                        "opened": opened,
                        "marked_done": marked_done,
                        "seen": is_resource_seen(
                            dwell_seconds=dwell, marked_done=marked_done
                        ),
                        "last_active_at": last_active,
                    }
                )

    return out


def _session_dir(course_id: str) -> Path:
    """某门课的状态目录。"""
    safe = "".join(ch for ch in str(course_id) if ch.isalnum() or ch in "-_")
    return SESSIONS_ROOT / (safe or "_freeform")


def mastery_status(
    *,
    coverage: float,
    note_count: int,
    ask_count: int,
    total_pages: int,
    quiz_accuracy: float | None,
    reviewed: bool = False,
) -> str:
    """判定掌握度档位。

    :param coverage: 阅读覆盖率（0–1）。
    :param note_count: 笔记条数。
    :param ask_count: 向 AI 提问的轮数。
    :param total_pages: 总页数。
    :param quiz_accuracy: 测验真实正确率（0–1）；没作答过为 ``None``。
    :param reviewed: 是否完成过一次**复盘**（写过非空的批注正文）。
    """
    # ① 什么都没做 —— 待学习。
    if (
        total_pages <= 0
        or (coverage <= 0.001 and note_count == 0 and ask_count == 0)
    ):
        return "待学习"

    # ② 测验真实正确率低于 60% —— 薄弱需巩固。
    #    「没做过测验」是 ``None``，不等于 0%，不能算薄弱。
    if quiz_accuracy is not None and quiz_accuracy < WEAK_ACCURACY:
        return "薄弱需巩固"

    # ③ 读完了，并且（正确率 ≥ 80% 或 完成复盘）—— 已掌握。
    if coverage >= 0.999 and (
        (quiz_accuracy is not None and quiz_accuracy >= MASTERY_ACCURACY)
        or reviewed
    ):
        return "已掌握"

    # ④ 其余 —— 学习中。
    return "学习中"


def _quiz_accuracy(quizzes: list[Any]) -> tuple[float | None, int]:
    """从测验记录里算正确率。

    返回 ``(accuracy, answered_count)``。没有作答记录时 accuracy 为
    ``None``——「没做过」和「做错」是两件事，不能混为一谈。

    作答记录来自 ``questions[i]["chosen"]``——它由前端答题卡在用户
    **真正提交**时写回后端。
    """
    correct = 0
    answered = 0

    for quiz in quizzes:
        if not isinstance(quiz, dict):
            continue
        questions = quiz.get("questions")
        if not isinstance(questions, list):
            continue
        for question in questions:
            if not isinstance(question, dict):
                continue
            chosen = question.get("chosen")
            if chosen is None or chosen == "":
                continue
            answer = question.get("answer")
            if answer is None or int(answer) < 0:
                continue
            answered += 1
            try:
                if int(chosen) == int(answer):
                    correct += 1
            except (TypeError, ValueError):
                continue

    if answered == 0:
        return None, 0
    return correct / answered, answered


def _quizzes_by_page(quizzes: list[Any]) -> dict[str, list[dict[str, Any]]]:
    """把测验按它关联的页 id 分组。

    测验在生成时记录了当时的 ``page_id``，所以能把「这一章测得准不准」
    落到章节粒度上。没有 ``page_id`` 的旧记录归到空串（课程级）。
    """
    grouped: dict[str, list[dict[str, Any]]] = {}
    for quiz in quizzes:
        if not isinstance(quiz, dict):
            continue
        page_id = str(quiz.get("page_id") or "")
        grouped.setdefault(page_id, []).append(quiz)
    return grouped


def course_progress(course_id: str) -> dict[str, Any]:
    """汇总单门课程的学情。

    课程文件读不到时返回一个「空壳」记录，而不是抛异常——大盘要能
    容忍一门课程的数据损坏。
    """
    raw = _read_json(COURSES_ROOT / f"{course_id}.json", {})
    if not isinstance(raw, dict):
        raw = {}

    book = raw.get("book") if isinstance(raw.get("book"), dict) else {}
    # 难度与标签写在 ``book.metadata`` 里——导入脚本也往那儿放。
    metadata = book.get("metadata") if isinstance(book.get("metadata"), dict) else {}
    pages = raw.get("pages") if isinstance(raw.get("pages"), list) else []
    spine = raw.get("spine") if isinstance(raw.get("spine"), dict) else {}
    chapters = spine.get("chapters") if isinstance(spine.get("chapters"), list) else []

    page_to_chapter: dict[str, str] = {}
    chapter_id_to_title: dict[str, str] = {}
    for chapter in chapters:
        if not isinstance(chapter, dict):
            continue
        chapter_id = str(chapter.get("id") or "")
        title = str(chapter.get("title") or "")
        chapter_id_to_title[chapter_id] = title
        for page_id in chapter.get("page_ids") or []:
            page_to_chapter[str(page_id)] = title

    progress = raw.get("progress") if isinstance(raw.get("progress"), dict) else {}
    visited = {str(pid) for pid in (progress.get("visited_page_ids") or [])}

    # ── 真实遥测：把「打开过」升级成「读过」 ──────────────────────
    # 没有遥测数据（旧课程文件）时，退回「打开过就算读过」——
    # 但那只是**兼容**，新流程下前端一定会上报遥测。
    page_dwell = (
        {str(k): float(v or 0) for k, v in (progress.get("page_dwell") or {}).items()}
        if isinstance(progress.get("page_dwell"), dict)
        else {}
    )
    page_coverage = (
        {str(k): float(v or 0) for k, v in (progress.get("page_coverage") or {}).items()}
        if isinstance(progress.get("page_coverage"), dict)
        else {}
    )

    total_pages = len(pages)
    # 「已读」**永远**需要证据——停留够久，或真的滚到底。
    #
    # 早先这里有个「没有遥测数据就退回『打开过就算读过』」的兼容分支。
    # 那是造假的**后门**：只要遥测一条都没落盘（比如上报请求失败、
    # 或者用户只是飞快地点了一串页），``visited_page_ids`` 里的每一页
    # 都会被算成「读过」——进度条又变成了假的。
    #
    # 现在这个后门关掉了：没有证据就是没读。旧课程文件因此会显示
    # 0 进度——但那本来就是**诚实**的显示（旧数据没有证据）。
    read_pages = sum(
        1
        for page in pages
        if str(page.get("id") or "") in visited
        and is_page_read(
            dwell_seconds=page_dwell.get(str(page.get("id") or ""), 0.0),
            coverage=page_coverage.get(str(page.get("id") or ""), 0.0),
        )
    )
    visited_pages = read_pages
    coverage = (visited_pages / total_pages) if total_pages else 0.0

    # ── 学习状态目录 ──
    directory = _session_dir(course_id)
    notes = _read_json(directory / "notes.json", [])
    notes = [n for n in notes if isinstance(n, dict)] if isinstance(notes, list) else []
    session = _read_json(directory / "session.json", [])
    session = [m for m in session if isinstance(m, dict)] if isinstance(session, list) else []
    quizzes = _read_json(directory / "quizzes.json", [])
    quizzes = [q for q in quizzes if isinstance(q, dict)] if isinstance(quizzes, list) else []
    plans = _read_json(directory / "plans.json", [])
    plans = [p for p in plans if isinstance(p, dict)] if isinstance(plans, list) else []

    ask_count = sum(1 for m in session if m.get("role") == "user")
    accuracy, answered = _quiz_accuracy(quizzes)

    # 「复盘」= 写过非空的批注正文。只划线没写字不算。
    reviewed = any(str(n.get("note") or "").strip() for n in notes)

    status = mastery_status(
        coverage=coverage,
        note_count=len(notes),
        ask_count=ask_count,
        total_pages=total_pages,
        quiz_accuracy=accuracy,
        reviewed=reviewed,
    )

    # ── 最近学习时间 ──
    timestamps: list[float] = []
    for note in notes:
        timestamps.append(float(note.get("updated_at") or note.get("created_at") or 0))
    for plan in plans:
        timestamps.append(float(plan.get("updated_at") or plan.get("created_at") or 0))
    for quiz in quizzes:
        timestamps.append(float(quiz.get("created_at") or 0))
    timestamps.append(float(progress.get("updated_at") or 0))
    recent = max((t for t in timestamps if t > 0), default=0.0)

    # ── 章节掌握度 ──
    quizzes_by_page = _quizzes_by_page(quizzes)
    course_level_quizzes = quizzes_by_page.get("", [])

    chapter_stats: dict[str, dict[str, Any]] = {}
    page_to_chapter_id: dict[str, str] = {}
    for chapter in chapters:
        if not isinstance(chapter, dict):
            continue
        chapter_id = str(chapter.get("id") or "")
        title = str(chapter.get("title") or "")
        bucket = chapter_stats.setdefault(
            title,
            {
                "total": 0,
                "visited": 0,
                "notes": 0,
                "reviewed": False,
                "quizzes": [],
            },
        )
        for page_id in chapter.get("page_ids") or []:
            page_to_chapter_id[str(page_id)] = chapter_id

    for page in pages:
        page_id = str(page.get("id") or "")
        chapter_title = page_to_chapter.get(page_id) or "未分章"
        bucket = chapter_stats.setdefault(
            chapter_title,
            {"total": 0, "visited": 0, "notes": 0, "reviewed": False, "quizzes": []},
        )
        bucket["total"] += 1
        # 章节级用**同一套**「读过」的判定——与课程级完全一致，
        # 不存在「课程级算读过、章节级算没读」的口径分裂。
        if page_id in visited and is_page_read(
            dwell_seconds=page_dwell.get(page_id, 0.0),
            coverage=page_coverage.get(page_id, 0.0),
        ):
            bucket["visited"] += 1
        # 关联到本页的测验计入本章。
        bucket["quizzes"].extend(quizzes_by_page.get(page_id, []))

    for note in notes:
        page_id = str(note.get("page_id") or "")
        chapter_title = page_to_chapter.get(page_id)
        if not chapter_title:
            continue
        bucket = chapter_stats.get(chapter_title)
        if bucket is None:
            continue
        bucket["notes"] += 1
        if str(note.get("note") or "").strip():
            bucket["reviewed"] = True

    chapters_out = []
    for title, bucket in chapter_stats.items():
        total = bucket.get("total", 0)
        seen = bucket.get("visited", 0)
        ratio = (seen / total) if total else 0.0
        chapter_quizzes = list(bucket.get("quizzes") or []) + course_level_quizzes
        chapter_accuracy, chapter_answered = _quiz_accuracy(chapter_quizzes)
        chapter_status = mastery_status(
            coverage=ratio,
            note_count=int(bucket.get("notes", 0)),
            ask_count=0,
            total_pages=total,
            quiz_accuracy=chapter_accuracy,
            reviewed=bool(bucket.get("reviewed")),
        )
        chapters_out.append(
            {
                "title": title,
                "total_pages": total,
                "visited_pages": seen,
                "coverage": ratio,
                "notes": bucket.get("notes", 0),
                "quiz_accuracy": chapter_accuracy,
                "quiz_answered": chapter_answered,
                "status": chapter_status,
            }
        )
    chapters_out.sort(key=lambda item: (-item["coverage"], item["title"]))

    # ── 关联计划 ──
    linked_plans = []
    for plan in plans:
        linked_plans.append(
            {
                "id": str(plan.get("id") or ""),
                "title": str(plan.get("title") or ""),
                "due": str(plan.get("due") or ""),
                "scope": str(plan.get("scope") or ""),
                "start_at": str(plan.get("start_at") or ""),
                "done": int(plan.get("done") or 0),
                "total": int(plan.get("total") or 0),
                "completed": bool(plan.get("completed")),
            }
        )

    # ── 跳转锚点：上次读到的那一页 ──
    current_page_id = str(progress.get("current_page_id") or "")
    if current_page_id not in visited:
        current_page_id = ""
    if not current_page_id and visited:
        # 没有 current_page_id（老数据）时，退回到最后一个已读的页。
        for page in reversed(pages):
            if str(page.get("id") or "") in visited:
                current_page_id = str(page.get("id") or "")
                break

    last_page_title = ""
    last_chapter_title = ""
    for page in pages:
        if str(page.get("id") or "") == current_page_id:
            last_page_title = str(page.get("title") or "")
            last_chapter_title = page_to_chapter.get(current_page_id, "")
            break

    # ── 资源级进度（资源枢纽型课程才有） ──────────────────────────
    resources = resource_stats(raw)
    seen_resources = sum(1 for item in resources if item["seen"])
    resource_coverage = (seen_resources / len(resources)) if resources else 0.0

    return {
        "course_id": course_id,
        "title": str(book.get("title") or course_id),
        "author": str(book.get("author") or metadata.get("author") or ""),
        "description": str(book.get("description") or ""),
        "difficulty": str(
            metadata.get("difficulty") or metadata.get("level") or book.get("difficulty") or ""
        ),
        "tags": [
            str(t)
            for t in (metadata.get("tags") or book.get("tags") or [])
        ],
        "total_pages": total_pages,
        "total_chapters": len(chapter_stats),
        "visited_pages": visited_pages,
        "coverage": coverage,
        # 真实阅读时长（秒）——「最近学习时间」的另一条证据链。
        "dwell_seconds": round(float(progress.get("dwell_seconds") or 0.0), 3),
        # 打开过但**没读**的页数——用来让用户看清「点过 ≠ 读过」。
        "opened_pages": len(visited),
        "note_count": len(notes),
        "ask_count": ask_count,
        "quiz_count": len(quizzes),
        "quiz_answered": answered,
        "quiz_accuracy": accuracy,
        "status": status,
        "last_active_at": recent,
        "last_page_id": current_page_id,
        "last_page_title": last_page_title,
        "last_chapter_title": last_chapter_title,
        "chapters": chapters_out,
        "plans": linked_plans,
        # ── 资源级 ──────────────────────────────────────────────────
        # 资源枢纽型课程里，「节点学完了」不等于「资源看完了」——
        # 一个节点下面可能挂着三条外链，用户只看了其中一条。
        "is_hub": bool(resources),
        "total_resources": len(resources),
        "seen_resources": seen_resources,
        "resource_coverage": resource_coverage,
        "resources": resources,
    }


def progress_overview() -> dict[str, Any]:
    """汇总**全部**课程的学情。

    课程清单以磁盘上的 JSON 为准。**所有**课程都会出现在大盘里——
    包括一个都没碰过的：它们必须如实显示「0 页 / 0% / 笔记 0 / 提问 0 /
    正确率 — / 待学习」，而不是从列表里消失。隐藏未开始的学习恰恰
    最容易制造「一切都在掌控中」的错觉。

    中台（全网公开课）也作为一个**虚拟条目**并入大盘。
    它没有课程文件——它的进度来自视频播放器的上报（见
    :mod:`app.services.hub_progress_service`）。但它的笔记、提问
    与课程**共用**同一个 ``course_id`` 命名空间，所以三者的数字是
    一致的、可以相加的。
    """
    if not COURSES_ROOT.exists():
        return {"courses": [], "summary": {}}

    # 这些文件是**作者输入格式的样板**，不是真正的课程——
    # 不该在学情大盘里冒充一门课。
    schema_templates = {"template-schema.json", "hub_schema.json"}
    course_ids = sorted(
        path.stem for path in COURSES_ROOT.glob("*.json") if path.name not in schema_templates
    )

    entries = [course_progress(course_id) for course_id in course_ids]

    # ── 中台条目 ──────────────────────────────────────────────────
    #
    # 即使用户一节课都没上，中台也应该出现在大盘里——它同样是平台的
    # 一份学习资产，不该在「课程列表」里隐身。
    try:
        from app.services.hub_progress_service import hub_progress

        entries.append(hub_progress())
    except Exception:  # noqa: BLE001 — 大盘不能因为一个条目挂掉
        logger.warning("学情大盘：读取中台进度失败，已跳过。", exc_info=True)

    # 正在学的排前面，最近有动作的排最前；完全没碰过的沉到末尾。
    entries.sort(
        key=lambda item: (item["last_active_at"], item["coverage"]),
        reverse=True,
    )
    entries.sort(key=lambda item: item["last_active_at"] > 0, reverse=True)

    learned = [e for e in entries if e["coverage"] > 0]
    average = sum(e["coverage"] for e in learned) / len(learned) if learned else 0.0

    # ── 自动颁发证书 ────────────────────────────────────────────────
    #
    # 达成条件的那一门课，**立即**拿到证书。不需要用户去点「申领」——
    # 领取动作本身就是一次流失点。
    #
    # 这一步放在汇总的最后：它是整个学情链路里唯一一个**有写操作**
    # 的环节，所以必须确认前面的读取都成功了，才不会因为一个读取错误
    # 就发一堆证书出去。
    try:
        from app.services.certificate_service import eligibility, issue_certificate

        for entry in entries:
            check = eligibility(entry)
            if not check["eligible"]:
                continue
            issue_certificate(
                course_id=entry["course_id"],
                course_title=entry.get("title") or "",
                category=(entry.get("tags") or [""])[0],
                learner_name="海外华人学习者",
                coverage=entry.get("coverage") or 0.0,
                quiz_accuracy=entry.get("quiz_accuracy") or 0.0,
                note_count=entry.get("note_count") or 0,
                ask_count=entry.get("ask_count") or 0,
                watched_resources=check["watched_resources"],
                total_resources=check["total_resources"],
            )
    except Exception:  # noqa: BLE001 — 发证书失败不该让大盘挂掉
        logger.warning("学情大盘：自动颁发证书失败，已跳过。", exc_info=True)

    summary = {
        "course_count": len(entries),
        "learned_count": len(learned),
        "average_coverage": average,
        "total_notes": sum(e["note_count"] for e in entries),
        "total_asks": sum(e["ask_count"] for e in entries),
        "total_plans": sum(len(e["plans"]) for e in entries),
        "mastered_count": sum(1 for e in entries if e["status"] == "已掌握"),
        "weak_count": sum(1 for e in entries if e["status"] == "薄弱需巩固"),
        "pending_count": sum(1 for e in entries if e["status"] == "待学习"),
    }
    return {"courses": entries, "summary": summary}


__all__ = [
    "MASTERY_ACCURACY",
    "MASTERY_LEVELS",
    "MIN_READ_COVERAGE",
    "MIN_READ_DWELL_SECONDS",
    "MIN_RESOURCE_DWELL_SECONDS",
    "WEAK_ACCURACY",
    "course_progress",
    "is_page_read",
    "is_resource_seen",
    "mastery_status",
    "progress_overview",
    "resource_stats",
]
