#!/usr/bin/env python3
"""端到端验证「全网活水」链路。

跑一遍完整流程：检索 → 入库 → 装配，并把结果打印出来。

用法::

    python3 tools/verify_live_discovery.py "博弈论 纳什均衡"
    python3 tools/verify_live_discovery.py "https://www.bilibili.com/video/BV1xx411c7mD"

**它会真的改数据文件**——装配好的课程会写进
``global_resource_hub.json``。这是有意为之：验证的就是「新课真的
装进框架了」这件事。
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# 先加载 .env——否则模型密钥读不到，装配那一步会以「尚未配置模型
# 密钥」失败。这跟 ``app.main`` 的做法一致。
from app.services.env_loader import load_env  # noqa: E402

load_env()

from app.services.live_discovery_service import (  # noqa: E402
    DiscoveryError,
    discover_and_structure,
    infer_category,
    parse_direct_link,
)


def test_link_parsing() -> None:
    """链接解析——纯函数，最容易出错，先测它。"""
    cases = [
        ("https://www.youtube.com/watch?v=vo4pMVb0R6M", ("youtube", "vo4pMVb0R6M")),
        ("https://youtu.be/vo4pMVb0R6M", ("youtube", "vo4pMVb0R6M")),
        ("https://www.youtube.com/embed/vo4pMVb0R6M", ("youtube", "vo4pMVb0R6M")),
        (
            "https://www.bilibili.com/video/BV1xx411c7mD",
            ("bilibili", "BV1xx411c7mD"),
        ),
        ("随便一段文字", None),
        ("", None),
    ]
    print("\n【链接解析】")
    for text, expected in cases:
        got = parse_direct_link(text)
        status = "✓" if got == expected else "✗"
        print(f"  {status} {text[:56]!r} → {got}")
        if got != expected:
            print(f"      期望 {expected}")


def test_category_inference() -> None:
    """分类推断。"""
    print("\n【分类推断】")
    cases = [
        ("MIT 6.046J 算法设计与分析", "cat_cs_ai"),
        ("Crash Course 心理学：什么是心理学", "cat_philosophy"),
        ("纳什均衡与博弈论", "cat_econ_society"),
        ("天文导论：我们的宇宙", "cat_science_psych"),
    ]
    for title, expected in cases:
        got = infer_category(title)
        status = "✓" if got == expected else "✗"
        print(f"  {status} {title} → {got}")
        if got != expected:
            print(f"      期望 {expected}")


async def run_live(query: str) -> int:
    """跑一次真实的检索 + 装配。"""
    print(f"\n【全网活水】检索：{query}")
    print("  （这一步会调大模型装配，约 8~12 秒）…\n")

    try:
        result = await discover_and_structure(query, max_results=2)
    except DiscoveryError as exc:
        print(f"  ✗ 检索失败：{exc}")
        return 1
    except Exception as error:  # noqa: BLE001
        print(f"  ✗ 未预期异常：{error}")
        return 1

    print(f"  ✓ 装配成功 {result.structured} 门")
    print(f"  ✓ 新增 {result.added} 门，已存在 {result.updated} 门")
    if result.failed:
        print(f"  ✗ 失败 {result.failed} 门：")
        for failure in result.failures:
            print(f"      {failure}")

    # ── 验证落盘结果 ──────────────────────────────────────────────
    from app.services.media_ingestor import GLOBAL_HUB_PATH

    raw = json.loads(Path(GLOBAL_HUB_PATH).read_text(encoding="utf-8"))
    hub = raw.get("hub") or raw

    print("\n【落盘校验】")
    for resource_id in result.resource_ids:
        found = None
        for category in hub.get("categories") or []:
            for resource in category.get("resources") or []:
                if resource.get("id") == resource_id:
                    found = (category, resource)
                    break
        if not found:
            print(f"  ✗ {resource_id} 不在中台数据里")
            continue
        category, resource = found
        nodes = resource.get("interactive_nodes") or []
        segments = resource.get("guided_segments") or []
        guide = resource.get("study_guide") or {}
        print(f"  ✓ {resource_id}")
        print(f"      标题：{str(resource.get('title'))[:56]}")
        print(f"      分类：{category.get('title')}")
        print(f"      交互节点 {len(nodes)} 个 / 段落导读 {len(segments)} 段")
        print(f"      知识向导：{'有' if guide else '无'}")
        print(f"      已装配：{bool(resource.get('is_structured'))}")

    return 0 if result.structured > 0 else 1


def main() -> int:
    query = " ".join(sys.argv[1:]).strip()
    if not query:
        print(__doc__)
        return 1

    test_link_parsing()
    test_category_inference()
    code = asyncio.run(run_live(query))
    print()
    return code


if __name__ == "__main__":
    sys.exit(main())
