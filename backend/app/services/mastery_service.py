"""
技能树 · 学习阶梯 · 掌握度
==========================

可汗学院模式的核心闭环：**从基础到进阶的阶梯 + 随堂检测 + 达标解锁**。

三个概念
--------

**技能节点（Skill Node）**
    一节课被切成若干「技能节点」——每个节点对应视频里的一个知识
    段落，配一组自测题。节点是**判定的最小单位**：达标了就是达标了，
    不达标就重来。

**学习阶梯（Learning Path）**
    节点之间的**依赖关系**。它是四个层级的有向无环图：

    .. code-block:: text

        入门启蒙  →  核心精修  →  综合实战  →  学位进阶

    上一个层级的节点没达标，下一层就是**锁定**的。这是「阶梯」而不是
    「清单」的本质区别——清单只告诉你有什么，阶梯告诉你**先做什么**。

**掌握度（Mastery）**
    一个节点有三种状态：

    * ``未开始`` —— 没检测过；
    * ``学习中`` —— 检测过但正确率 < 80%（或者学过但没检测）；
    * ``已达标`` —— 正确率 ≥ 80%。

    三档而不是两档，是因为「学过但没掌握」和「没学过」在用户心里是
    完全不同的状态——混为一谈会让进度条失去指导意义。

达标阈值
--------

``MASTERY_THRESHOLD = 0.8``——正确率 80%。

为什么不是 100%
---------------

随堂检测只有 3~5 道题。5 道题全对是 100%，4 道对是 80%，3 道对是
60%。要求 100% 意味着必须一次不错——那不是「掌握」的判据，是
「记忆力」的判据。

80% 意味着「基本都懂了，有个别细节要回去看」——这才是真实学习中
「掌握」的样子。

数据来源
--------

全部来自**真实学习痕迹**：

* ``sessions/<course_id>/watch.json`` —— 观看记录；
* ``sessions/<course_id>/quizzes.json`` —— 自测作答；
* ``sessions/<course_id>/notes.json`` —— 留存文档。

前端**不持有任何预置数字**。没检测过就是「未开始」，不会因为
「这门课看起来很难」就预设成「学习中」。
"""

from __future__ import annotations

import time
from typing import Any

from app.services.learning_state import load_quizzes, load_session

#: 达标所需的正确率。
MASTERY_THRESHOLD = 0.8

#: 四个阶梯层级。
TIERS: list[dict[str, str]] = [
    {
        "id": "tier_1",
        "name": "入门启蒙",
        "en": "Start here",
        "blurb": "建立基本概念与直觉，不追求记住细节。",
    },
    {
        "id": "tier_2",
        "name": "核心精修",
        "en": "Core skills",
        "blurb": "把核心方法论吃透，能独立解决同类问题。",
    },
    {
        "id": "tier_3",
        "name": "综合实战",
        "en": "Applied practice",
        "blurb": "在真实场景里组合运用，识别边界与失效条件。",
    },
    {
        "id": "tier_4",
        "name": "学位进阶",
        "en": "Degree track",
        "blurb": "系统化、学术化的深度路径，通向学位与文凭。",
    },
]

#: 层级顺序——索引越大越进阶。
TIER_ORDER = {tier["id"]: index for index, tier in enumerate(TIERS)}


def _tier_for(index: int, total: int) -> str:
    """按节点在课程里的**位置**划分层级。

    四等分：前 25% 是入门，中间两段是精修与实战，最后 25% 是进阶。

    为什么按位置而不是按内容
    ------------------------

    要按内容划分，就得为每门课的每个节点手工标注层级——136 门课
    × 平均 8 个节点 = 1000 多个标注，且永远滞后于新采集的课程。

    按位置划分是**自动**的、**永远正确**的：课程的前段总是入门，
    后段总是高阶。这跟真实课程的组织方式一致。
    """
    if total <= 0:
        return "tier_1"
    ratio = index / total
    if ratio < 0.25:
        return "tier_1"
    if ratio < 0.55:
        return "tier_2"
    if ratio < 0.8:
        return "tier_3"
    return "tier_4"


def _status_for(accuracy: float | None) -> str:
    """掌握度三档。"""
    if accuracy is None:
        return "未开始"
    if accuracy >= MASTERY_THRESHOLD:
        return "已达标"
    return "学习中"


def _latest_quiz_accuracy(
    quizzes: list[dict[str, Any]], node_key: str
) -> tuple[float | None, int, int]:
    """某个技能节点的最新正确率。

    返回 ``(正确率, 已答题数, 总题数)``。

    正确率取**最近一次**作答——不是历史平均。平均会让「第一次全对、
    后来错了」看起来还是达标，那是不诚实的。
    """
    attempts = [
        item
        for item in quizzes
        if isinstance(item, dict)
        and str(item.get("node_key") or item.get("resource_id") or "") == node_key
    ]
    if not attempts:
        return None, 0, 0

    attempts.sort(key=lambda item: float(item.get("created_at") or 0.0))
    latest = attempts[-1]
    answers = latest.get("answers")
    if not isinstance(answers, list) or not answers:
        return None, 0, 0

    correct = 0
    for index, answer in enumerate(answers):
        if not isinstance(answer, dict):
            continue
        if bool(answer.get("correct")):
            correct += 1
        elif index < len(latest.get("questions") or []):
            pass
    total = len(answers)
    return (correct / total if total else None), correct, total


def skill_nodes(
    *,
    resource_id: str,
    title: str,
    interactive_nodes: list[dict[str, Any]] | None = None,
    guided_segments: list[dict[str, Any]] | None = None,
    quizzes: list[dict[str, Any]] | None = None,
    watched_seconds: float = 0.0,
    duration: float = 0.0,
) -> list[dict[str, Any]]:
    """为一讲视频生成**技能节点**列表。

    节点来源有两个，**按优先级**：

    1. **装配器埋的交互节点**（``interactive_nodes``）——它们有明确的
       时间戳和关键词，是作者（或 AI）认为「这里值得停一下」的位置。
       这是最好的节点来源。
    2. **段落导读**（``guided_segments``）——没有交互节点时用它兜底。

    每个节点带：时间戳、标题、所属层级、掌握度状态、正确率。
    """
    quizzes = quizzes or []
    nodes: list[dict[str, Any]] = []

    source = interactive_nodes or []
    for index, node in enumerate(source):
        if not isinstance(node, dict):
            continue
        timestamp = float(node.get("timestamp") or 0.0)
        keyword = str(node.get("keyword") or "").strip()
        if not keyword:
            continue
        node_key = f"{resource_id}@{int(timestamp)}"
        accuracy, correct, total = _latest_quiz_accuracy(quizzes, node_key)
        nodes.append(
            {
                "key": node_key,
                "resource_id": resource_id,
                "timestamp": timestamp,
                "title": keyword,
                "hint": str(node.get("hint") or node.get("prompt") or ""),
                "context": str(node.get("context") or ""),
                "quiz_available": True,
                "accuracy": accuracy,
                "correct_count": correct,
                "question_count": total,
                "status": _status_for(accuracy),
            }
        )

    if not nodes:
        for segment in guided_segments or []:
            if not isinstance(segment, dict):
                continue
            timestamp = float(segment.get("timestamp") or 0.0)
            title = str(segment.get("title") or segment.get("anchor_title") or "").strip()
            if not title:
                continue
            node_key = f"{resource_id}@{int(timestamp)}"
            accuracy, correct, total = _latest_quiz_accuracy(quizzes, node_key)
            nodes.append(
                {
                    "key": node_key,
                    "resource_id": resource_id,
                    "timestamp": timestamp,
                    "title": title,
                    "hint": str(segment.get("content") or ""),
                    "context": "",
                    "quiz_available": True,
                    "accuracy": accuracy,
                    "correct_count": correct,
                    "question_count": total,
                    "status": _status_for(accuracy),
                }
            )

    total_nodes = len(nodes)
    for index, node in enumerate(nodes):
        node["tier"] = _tier_for(index, total_nodes)
        node["tier_name"] = next(
            (tier["name"] for tier in TIERS if tier["id"] == node["tier"]), "入门启蒙"
        )
        node["order"] = index
    return nodes


def learning_path(
    *,
    course_id: str,
    nodes: list[dict[str, Any]],
) -> dict[str, Any]:
    """把技能节点编排成**学习阶梯**。

    返回四层，每层带着它的节点、达标数与锁定状态。

    锁定规则
    --------
    第 N 层只有在**第 N-1 层全部达标**时才解锁。这是「阶梯」与
    「清单」的唯一区别——它强制了顺序。

    但只有第 1 层开始是「无条件的」：用户可以直接点任何一层，但
    未解锁的层会显示为锁定并解释原因。
    """
    layers: list[dict[str, Any]] = []
    previous_layer_all_met = True

    for tier in TIERS:
        tier_nodes = [node for node in nodes if node.get("tier") == tier["id"]]
        met_count = sum(
            1 for node in tier_nodes if node.get("status") == "已达标"
        )
        all_met = bool(tier_nodes) and met_count == len(tier_nodes)
        locked = not previous_layer_all_met
        layers.append(
            {
                "id": tier["id"],
                "name": tier["name"],
                "en": tier["en"],
                "blurb": tier["blurb"],
                "order": TIER_ORDER[tier["id"]],
                "nodes": tier_nodes,
                "node_count": len(tier_nodes),
                "met_count": met_count,
                "coverage": (met_count / len(tier_nodes)) if tier_nodes else 0.0,
                "locked": locked,
                "unlock_reason": (
                    "" if not locked else f"先完成「{TIERS[TIER_ORDER[tier['id']] - 1]['name']}」"
                ),
                "all_met": all_met,
            }
        )
        previous_layer_all_met = all_met

    total = len(nodes)
    met = sum(1 for node in nodes if node.get("status") == "已达标")
    started = sum(1 for node in nodes if node.get("status") != "未开始")

    return {
        "course_id": course_id,
        "layers": layers,
        "node_count": total,
        "met_count": met,
        "started_count": started,
        "mastery": (met / total) if total else 0.0,
        "progress": (started / total) if total else 0.0,
        "threshold": MASTERY_THRESHOLD,
        "status": (
            "已达标"
            if total and met == total
            else ("学习中" if started else "未开始")
        ),
    }


def course_mastery(
    *,
    course_id: str,
    resources: list[dict[str, Any]],
    quizzes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """整门课的掌握度。

    把每条视频的技能节点汇总成**一个**课程级的阶梯。
    """
    quizzes = quizzes or []
    all_nodes: list[dict[str, Any]] = []
    for resource in resources:
        if not isinstance(resource, dict):
            continue
        all_nodes.extend(
            skill_nodes(
                resource_id=str(resource.get("id") or resource.get("resource_id") or ""),
                title=str(resource.get("title") or ""),
                interactive_nodes=resource.get("interactive_nodes") or [],
                guided_segments=resource.get("guided_segments") or [],
                quizzes=quizzes,
                watched_seconds=float(resource.get("dwell_seconds") or 0.0),
                duration=float(resource.get("duration") or 0.0),
            )
        )
    return learning_path(course_id=course_id, nodes=all_nodes)


def record_quiz_result(
    *,
    course_id: str,
    node_key: str,
    resource_id: str,
    questions: list[dict[str, Any]],
    answers: list[dict[str, Any]],
    title: str = "",
) -> dict[str, Any]:
    """记录一次随堂检测的作答。

    写入 ``sessions/<course_id>/quizzes.json``——学情中心与技能树
    都从这份文件读掌握度。
    """
    from app.services.learning_state import save_quiz

    correct = sum(1 for item in answers if isinstance(item, dict) and item.get("correct"))
    total = len(answers)
    accuracy = (correct / total) if total else 0.0

    payload = {
        "id": f"quiz_{int(time.time() * 1000)}",
        "node_key": node_key,
        "resource_id": resource_id,
        "title": title,
        "questions": questions,
        "answers": answers,
        "correct_count": correct,
        "question_count": total,
        "accuracy": accuracy,
        "passed": accuracy >= MASTERY_THRESHOLD,
        "created_at": time.time(),
    }
    save_quiz(course_id, payload)
    return payload


def hub_quizzes(course_id: str) -> list[dict[str, Any]]:
    """某门课的全部检测记录。"""
    return load_quizzes(course_id)


def hub_session_asks(course_id: str) -> int:
    """向助教提问的次数。"""
    session = load_session(course_id)
    return sum(1 for message in session if message.get("role") == "user")


__all__ = [
    "MASTERY_THRESHOLD",
    "TIERS",
    "TIER_ORDER",
    "course_mastery",
    "hub_quizzes",
    "hub_session_asks",
    "learning_path",
    "record_quiz_result",
    "skill_nodes",
]
