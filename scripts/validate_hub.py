#!/usr/bin/env python3
"""校验「外链课程」作者文件是否符合 schema。

.. code-block:: text

    ① JSON 能不能解析
    ② 结构对不对（顶层、主题、节点、资源）
    ③ 交互节点合不合法（时间戳、关键词、类型）
    ④ 后端能不能真的把它读成课程

跑法：

.. code-block:: bash

    python scripts/validate_hub.py backend/data/courses/interactive_video_demo.json
    python scripts/validate_hub.py backend/data/courses/*.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.course_service import course_from_dict  # noqa: E402
from app.services.hub_normalize import (  # noqa: E402
    INTERACTIVE_NODE_TYPES,
    normalize_interactive_nodes,
    parse_timestamp,
)

PASSED = 0
FAILED = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  ✅ {label}")
    else:
        FAILED += 1
        print(f"  ❌ {label}" + (f" —— {detail}" if detail else ""))


def collect_resources(raw: dict) -> list[dict]:
    """把文件里所有资源收拢到一处。

    同一门课的资源出现在两个地方——``hub`` 段（作者写的原始形态）与
    ``pages`` 段（后端投影出来的快照）。两处都要校验，但**同一条资源
    不能算两次**：pages 段的每个 resource block 就是 hub 段那条资源的
    投影，重复计数会让「文件里有 N 个节点」虚高一倍。

    所以按资源 id 去重——``hub`` 段的先来，``pages`` 段的同名者跳过。
    """
    seen: set[str] = set()
    out: list[dict] = []

    def push(resource: dict) -> None:
        key = str(resource.get("id") or "")
        if key and key in seen:
            return
        if key:
            seen.add(key)
        out.append(resource)

    for topic in raw.get("hub", {}).get("topics", []) or []:
        for node in topic.get("nodes", []) or []:
            for resource in node.get("resources", []) or []:
                if isinstance(resource, dict):
                    push(resource)

    for page in raw.get("pages", []) or []:
        for block in page.get("blocks", []) or []:
            if block.get("type") == "resource":
                payload = block.get("payload")
                if isinstance(payload, dict):
                    push(payload)

    return out


def validate(path: Path) -> None:
    print()
    print("=" * 68)
    print(f"校验：{path.name}")
    print("=" * 68)

    # ── ① JSON ──────────────────────────────────────────────────────
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        check("JSON 能解析", True)
    except Exception as exc:  # noqa: BLE001
        check("JSON 能解析", False, str(exc))
        return

    check("是对象", isinstance(raw, dict))

    # ── ② 结构 ──────────────────────────────────────────────────────
    hub = raw.get("hub")
    check("有 hub 段", isinstance(hub, dict))
    if not isinstance(hub, dict):
        return

    check("有标题", bool(str(hub.get("title") or "").strip()))
    topics = hub.get("topics")
    check("有主题列表", isinstance(topics, list) and len(topics) > 0)

    if not isinstance(topics, list):
        return

    node_count = 0
    resource_count = 0
    for topic in topics:
        if not isinstance(topic, dict):
            continue
        for node in topic.get("nodes", []) or []:
            if not isinstance(node, dict):
                continue
            node_count += 1
            if not str(node.get("title") or "").strip():
                check("每个节点都有标题", False, str(node.get("id") or "无 id"))
            resources = node.get("resources")
            if not isinstance(resources, list) or not resources:
                check("每个节点都有非空的 resources", False, str(node.get("title")))
                continue
            for resource in resources:
                if not isinstance(resource, dict):
                    continue
                resource_count += 1
                url = str(resource.get("url") or "")
                if not url.startswith(("http://", "https://")):
                    check(
                        "每条资源的 url 都是 http(s)",
                        False,
                        f"{resource.get('id') or '无 id'} → {url[:60]}",
                    )
                rtype = resource.get("resource_type")
                if rtype and rtype not in {"video", "webpage", "document"}:
                    check(
                        "资源类型合法",
                        False,
                        f"{resource.get('id')} → {rtype}",
                    )

    check(f"共 {node_count} 个知识节点", node_count > 0)
    check(f"共 {resource_count} 条资源", resource_count > 0)

    # ── ③ 交互节点 ──────────────────────────────────────────────────
    resources = collect_resources(raw)
    total_nodes = 0
    for resource in resources:
        nodes = resource.get("interactive_nodes")
        if nodes is None:
            continue
        rid = resource.get("id") or "无 id"

        if not isinstance(nodes, list):
            check(f"{rid} 的 interactive_nodes 是数组", False)
            continue

        for node in nodes:
            if not isinstance(node, dict):
                check(f"{rid} 的交互节点都是对象", False)
                continue
            total_nodes += 1

            keyword = str(node.get("keyword") or "").strip()
            if not keyword:
                check(f"{rid} 的交互节点都有关键词", False, json.dumps(node, ensure_ascii=False)[:80])

            stamp = node.get("timestamp")
            if stamp is None:
                check(f"{rid} 的交互节点都有时间戳", False, keyword)
            elif parse_timestamp(stamp) is None:
                check(f"{rid} 的交互节点时间戳可解析", False, f"{keyword} → {stamp!r}")

            ntype = node.get("type")
            if ntype is not None and ntype not in INTERACTIVE_NODE_TYPES:
                check(
                    f"{rid} 的交互节点类型合法",
                    False,
                    f"{keyword} → {ntype}",
                )

        # 归一化之后不能丢东西（除非本来就是坏的）。
        normalized = normalize_interactive_nodes(nodes)
        if len(normalized) != len(nodes):
            check(
                f"{rid} 的交互节点归一化后数量不变",
                False,
                f"{len(nodes)} → {len(normalized)}",
            )

    print(f"  ℹ️  共 {total_nodes} 个交互节点")

    # ── ④ 后端能读 ──────────────────────────────────────────────────
    try:
        course = course_from_dict(raw, source="corpus")
        check("后端能解析成课程", True)
        check("是资源枢纽型", course.is_hub)
        check(
            f"解析出 {len(course.nodes)} 个节点 / {len(course.resources)} 条资源",
            len(course.nodes) == node_count and len(course.resources) == resource_count,
            f"实际 {len(course.nodes)} / {len(course.resources)}",
        )

        # 交互节点必须一路带到 CourseResource 上——那才是前端拿到的形状。
        carried = sum(len(r.interactive_nodes) for r in course.resources)
        check(
            f"交互节点被带进课程对象（{carried} 个）",
            carried == total_nodes,
            f"实际 {carried} vs 文件里 {total_nodes}",
        )
    except Exception as exc:  # noqa: BLE001
        check("后端能解析成课程", False, f"{type(exc).__name__}: {exc}")


def main(argv: list[str]) -> int:
    paths: list[Path] = []
    for arg in argv[1:] or []:
        candidate = Path(arg)
        if candidate.is_dir():
            paths.extend(sorted(candidate.glob("*.json")))
        else:
            paths.append(candidate)

    if not paths:
        print("用法：python scripts/validate_hub.py <文件或目录…>")
        return 1

    for path in paths:
        # 结构模板不是课程内容，跳过。
        if path.name.endswith("schema.json"):
            continue
        validate(path)

    print()
    print("=" * 68)
    print(f"通过 {PASSED} 项，失败 {FAILED} 项")
    print("=" * 68)
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
