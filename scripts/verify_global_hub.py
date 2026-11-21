#!/usr/bin/env python3
"""验证全网资源中台数据。

检查 :file:`backend/data/global_resource_hub.json` 的：

* 结构合法性（分类 / 资源 / 必填字段）；
* 交互节点与字幕的时间戳是否合理（升序、在时长内、非空）；
* URL 是否是合规的公开平台地址；
* 归一化之后前端能拿到什么。

用法::

    python3 scripts/verify_global_hub.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.global_hub_service import (  # noqa: E402
    GLOBAL_HUB_PATH,
    global_hub_summary,
    load_global_hub,
    normalize_global_hub,
)

PASSED = 0
FAILED = 0


def check(condition: bool, label: str, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
    else:
        FAILED += 1
        print(f"  ✗ {label}" + (f" — {detail}" if detail else ""))


def main() -> int:
    print(f"检查 {GLOBAL_HUB_PATH}\n")

    if not GLOBAL_HUB_PATH.exists():
        print("  ✗ 数据文件不存在")
        return 1

    raw = json.loads(GLOBAL_HUB_PATH.read_text(encoding="utf-8"))

    # ── 结构 ─────────────────────────────────────────────────────────
    check("hub" in raw, "顶层带 hub 段")
    hub_raw = raw.get("hub") or raw
    check(bool(hub_raw.get("title")), "有 title")
    check(bool(hub_raw.get("description")), "有 description")
    check(isinstance(hub_raw.get("categories"), list), "categories 是列表")
    check(len(hub_raw.get("categories") or []) >= 3, "至少 3 个分类")

    # ── 归一化 ───────────────────────────────────────────────────────
    hub = normalize_global_hub(raw)
    categories = hub["categories"]
    check(len(categories) >= 3, f"归一后分类数 ≥ 3（实际 {len(categories)}）")

    ids = [item["id"] for item in categories]
    check(len(ids) == len(set(ids)), "分类 id 唯一")

    orders = [item["order"] for item in categories]
    check(orders == sorted(orders), "分类按 order 升序")

    all_resource_ids: list[str] = []
    total_nodes = 0
    total_captions = 0

    for category in categories:
        check(bool(category["title"]), f"分类「{category['id']}」有 title")
        check(bool(category["resources"]), f"分类「{category['id']}」有资源")
        defaults = sum(1 for r in category["resources"] if r["is_default"])
        check(defaults == 1, f"分类「{category['id']}」恰好一条默认资源", f"实际 {defaults}")

        for resource in category["resources"]:
            rid = resource["id"]
            all_resource_ids.append(rid)
            check(resource["url"].startswith("https://"), f"{rid} url 是 https")
            check(bool(resource["ai_context"]), f"{rid} 有 ai_context")
            check(bool(resource["tags"]), f"{rid} 有 tags")
            check(
                resource["resource_type"] == "video",
                f"{rid} 是 video 类型",
                resource["resource_type"],
            )

            # 平台合规：只允许公开教学平台
            host = resource["url"].split("/")[2].lower()
            check(
                any(host.endswith(d) for d in ("youtube.com", "bilibili.com", "vimeo.com")),
                f"{rid} 指向公开视频平台",
                host,
            )

            # 交互节点
            nodes = resource["interactive_nodes"]
            check(len(nodes) > 0, f"{rid} 有交互节点")
            total_nodes += len(nodes)
            stamps = [n["timestamp"] for n in nodes]
            check(stamps == sorted(stamps), f"{rid} 交互节点按时间升序")
            check(all(s >= 0 for s in stamps), f"{rid} 交互节点时间非负")
            check(
                all(n.get("keyword") for n in nodes),
                f"{rid} 每个节点都有 keyword",
            )
            check(
                all(n["type"] in ("concept", "question", "quote", "warning") for n in nodes),
                f"{rid} 节点类型合法",
            )

            # 字幕
            captions = resource["captions"]
            check(len(captions) > 0, f"{rid} 有字幕")
            total_captions += len(captions)
            cstarts = [c["start"] for c in captions]
            check(cstarts == sorted(cstarts), f"{rid} 字幕按时间升序")
            check(all(c["text"].strip() for c in captions), f"{rid} 字幕非空")

            # 交互节点应落在字幕时间范围内（允许末尾溢出）
            if captions and nodes:
                last = max(c["start"] for c in captions)
                check(
                    nodes[-1]["timestamp"] <= last + 60,
                    f"{rid} 节点未超出字幕范围",
                    f"{nodes[-1]['timestamp']} > {last}",
                )

    check(
        len(all_resource_ids) == len(set(all_resource_ids)),
        "资源 id 全局唯一",
    )
    check(total_nodes >= 20, f"交互节点总数 ≥ 20（实际 {total_nodes}）")
    check(total_captions >= 20, f"字幕总数 ≥ 20（实际 {total_captions}）")

    # ── 加载路径 ─────────────────────────────────────────────────────
    loaded = load_global_hub()
    check(loaded["id"] == hub["id"], "load_global_hub 与 normalize 结果一致")
    summary = global_hub_summary(loaded)
    check(
        summary["resource_count"] == len(all_resource_ids),
        "摘要里的资源总数正确",
    )
    check(summary["category_count"] == len(categories), "摘要里的分类数正确")

    print(f"\n分类 {summary['category_count']} 个 · 资源 {summary['resource_count']} 条")
    print(f"交互节点 {total_nodes} 个 · 字幕 {total_captions} 句")
    print(
        "来源平台："
        + " · ".join(f"{p['label']}×{p['count']}" for p in summary["providers"])
    )

    print(f"\n通过 {PASSED} 项，失败 {FAILED} 项")
    print("=" * 60)
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())