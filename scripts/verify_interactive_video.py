#!/usr/bin/env python3
"""验证「流媒体交互式沙盘」的完整链路。

.. code-block:: text

    ① 数据：interactive_video_demo.json 解析出交互节点
    ② 归一：宽松的作者写法（"02:00" / term / text）被归一成规范形状
    ③ 投影：节点被投影成页，资源变成 block
    ④ AI 上下文：交互节点带着时间戳进入 system prompt
    ⑤ 陪读人格：resource_context 区块要求「贴着这一段」回答
    ⑥ 无害化：坏时间戳被丢弃，好节点不受影响
    ⑦ 幂等：写回不丢 interactive_nodes

跑法：

.. code-block:: bash

    python scripts/verify_interactive_video.py
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.routers.chat import ChatRequest, _build_prompt  # noqa: E402
from app.services.course_service import course_from_dict  # noqa: E402
from app.services.hub_normalize import (  # noqa: E402
    normalize_interactive_nodes,
    parse_timestamp,
)

PASSED = 0
FAILED = 0

DEMO = BACKEND / "data" / "courses" / "interactive_video_demo.json"


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  ✅ {label}")
    else:
        FAILED += 1
        print(f"  ❌ {label}" + (f" —— {detail}" if detail else ""))


def section(title: str) -> None:
    print()
    print("=" * 68)
    print(title)
    print("=" * 68)


def main() -> int:
    # ── ① 数据 ─────────────────────────────────────────────────────
    section("① 数据：演示课能解析出交互节点")

    check("演示课文件存在", DEMO.exists(), str(DEMO))
    raw = json.loads(DEMO.read_text(encoding="utf-8"))
    course = course_from_dict(raw, source="corpus")

    check("是资源枢纽型", course.is_hub)
    check("有主题", len(course.topics) >= 1, f"实际 {len(course.topics)}")
    check("有节点", len(course.nodes) >= 1, f"实际 {len(course.nodes)}")

    videos = [r for r in course.resources if r.resource_type == "video"]
    check("至少一条视频资源", len(videos) >= 1, f"实际 {len(videos)}")

    primary = videos[0]
    check(
        "视频资源带交互节点",
        len(primary.interactive_nodes) > 0,
        f"实际 {len(primary.interactive_nodes)}",
    )
    check(
        "视频链接是真实 YouTube 地址",
        primary.url.startswith("https://www.youtube.com/watch?v="),
        primary.url,
    )
    check(
        "视频带官方中文字幕",
        any(
            isinstance(c.get("text"), str) and "机会成本" in str(c.get("text"))
            for c in primary.captions
        ),
    )
    check("视频带预置 AI 摘要", len(primary.ai_context) > 200, str(len(primary.ai_context)))

    nodes = primary.interactive_nodes
    check(
        "交互节点按时间排序",
        all(nodes[i]["timestamp"] <= nodes[i + 1]["timestamp"] for i in range(len(nodes) - 1)),
    )
    check(
        "每个节点都有关键词",
        all(str(n.get("keyword") or "").strip() for n in nodes),
    )
    check(
        "每个节点都有类型",
        all(n.get("type") in {"concept", "question", "quote", "warning"} for n in nodes),
    )
    check(
        "时间戳都在视频时长内",
        all(0 <= float(n["timestamp"]) <= 165 for n in nodes),
        f"实际 {sorted(float(n['timestamp']) for n in nodes)}",
    )

    # ── ② 归一 ─────────────────────────────────────────────────────
    section("② 归一：宽松的作者写法被归一成规范形状")

    check('"02:00" → 120', parse_timestamp("02:00") == 120)
    check('"1:02:03" → 3723', parse_timestamp("1:02:03") == 3723)
    check("纯数字 → 秒", parse_timestamp(45.5) == 45.5)
    check("乱写 → None", parse_timestamp("随便写的") is None)
    check("负数 → None", parse_timestamp(-5) is None)

    normalized = normalize_interactive_nodes(
        [
            {"timestamp": "00:30", "term": "机会成本"},
            {"time": 90, "text": "比较优势"},
            {"timestamp": 10, "keyword": "自我介绍", "type": "问的"},
            {"timestamp": "坏时间", "keyword": "应当被丢弃"},
            {"timestamp": 20, "keyword": ""},
            "根本不是字典",
        ]
    )
    check("6 条输入 → 3 条合法", len(normalized) == 3, f"实际 {len(normalized)}")
    check(
        "keyword / term / text 都能取到关键词",
        {n["keyword"] for n in normalized} == {"机会成本", "比较优势", "自我介绍"},
        str([n["keyword"] for n in normalized]),
    )
    check(
        "认不出的类型回落到 concept",
        next(n for n in normalized if n["keyword"] == "自我介绍")["type"] == "concept",
    )
    check(
        "坏时间戳被丢弃",
        all(n["keyword"] != "应当被丢弃" for n in normalized),
    )
    check(
        "空关键词被丢弃",
        all(n["keyword"] for n in normalized),
    )
    check(
        "归一后按时间排序",
        [n["timestamp"] for n in normalized] == sorted(n["timestamp"] for n in normalized),
    )

    # ── ③ 投影 ─────────────────────────────────────────────────────
    section("③ 投影：节点 → 页，资源 → block")

    page_ids = {p.id for p in course.pages}
    check(
        "每个知识节点都投影成了页",
        {n.id for n in course.nodes} <= page_ids,
        f"节点 {sorted(n.id for n in course.nodes)} vs 页 {sorted(page_ids)}",
    )

    resource_blocks = [
        b
        for p in course.pages
        for b in p.blocks
        if b.type == "resource"
    ]
    check("资源投影成了 resource block", len(resource_blocks) >= 1, f"实际 {len(resource_blocks)}")

    first_block = resource_blocks[0]
    check(
        "block 载荷带着交互节点",
        isinstance(first_block.payload.get("interactive_nodes"), list)
        and len(first_block.payload["interactive_nodes"]) > 0,
    )

    # ── ④ AI 上下文 ────────────────────────────────────────────────
    section("④ AI 上下文：交互节点带时间戳进入 system prompt")

    prompt = _build_prompt(
        ChatRequest(
            message="什么是机会成本？",
            session_id="interactive_video_demo",
            course_id="interactive_video_demo",
            page_ids=["node_opportunity_cost"],
            language="zh",
            resource={
                "title": primary.title,
                "resource_type": "video",
                "url": primary.url,
                "provider": primary.provider,
                "ai_context": primary.ai_context,
            },
            interactive={
                "keyword": "免费冰淇淋的成本",
                "timestamp": "00:23",
                "context": "如果你排队等候免费冰淇淋，你实际上放弃了用这时间做别的事的机会。",
                "hint": "排队那 10 分钟，你在放弃什么？",
                "media_title": primary.title,
            },
        )
    ).system_prompt

    check("prompt 里有 resource_context 区块", "## resource_context" in prompt)
    check("prompt 里有「当前资源」区块", "## 当前资源" in prompt)
    check("prompt 里有资源标题", primary.title in prompt)
    check("prompt 里有预置摘要", "机会成本是指个人本来可以获得的" in prompt)
    check("prompt 里有交互节点的概念", "免费冰淇淋的成本" in prompt)
    check("prompt 里有时间戳", "00:23" in prompt)
    check("prompt 里有视频原话", "放弃了用这时间做别的事的机会" in prompt)
    check("prompt 里有引导问题", "排队那 10 分钟" in prompt)

    # ── ⑤ 陪读人格 ─────────────────────────────────────────────────
    section("⑤ 陪读人格：要求「贴着这一段」回答")

    check("有人格指令", "超级陪读" in prompt)
    check("要求贴着这一段回答", "贴着这一段" in prompt)
    check("要求不要泛泛而谈", "不要泛泛介绍整个主题" in prompt)
    check("保留了不编造的约束", "不要编造" in prompt)

    # 没有交互节点时，不该出现「贴着这一段」的指令。
    plain_prompt = _build_prompt(
        ChatRequest(
            message="讲讲这个视频",
            session_id="interactive_video_demo",
            course_id="interactive_video_demo",
            language="zh",
            resource={
                "title": primary.title,
                "resource_type": "video",
                "url": primary.url,
                "provider": primary.provider,
                "ai_context": primary.ai_context,
            },
        )
    ).system_prompt
    check(
        "没有交互节点时不加「贴着这一段」",
        "贴着这一段" not in plain_prompt,
    )
    check("没有交互节点时仍有陪读人格", "超级陪读" in plain_prompt)

    # ── ⑥ 无害化 ───────────────────────────────────────────────────
    section("⑥ 无害化：坏数据不拖垮整门课")

    broken = json.loads(json.dumps(raw))
    broken["hub"]["topics"][0]["nodes"][0]["resources"][0]["interactive_nodes"] = [
        {"timestamp": "这不是时间", "keyword": "坏的"},
        {"timestamp": 60, "keyword": "好的"},
    ]
    try:
        broken_course = course_from_dict(broken, source="corpus")
        broken_nodes = broken_course.resources[0].interactive_nodes
        check("坏数据不抛异常", True)
        check(
            "只保留合法的那条",
            len(broken_nodes) == 1 and broken_nodes[0]["keyword"] == "好的",
            str(broken_nodes),
        )
    except Exception as exc:  # noqa: BLE001
        check("坏数据不抛异常", False, str(exc))

    # ── ⑦ 幂等 ─────────────────────────────────────────────────────
    section("⑦ 幂等：写回不丢 interactive_nodes")

    from app.services import course_service as service  # noqa: PLC0415

    tmp = Path(tempfile.mkdtemp())
    try:
        (tmp / "interactive_video_demo.json").write_text(
            json.dumps(raw, ensure_ascii=False), encoding="utf-8"
        )
        # 用一个只挂在这个临时目录上的 service 实例——不去动模块级常量，
        # 免得污染后续的测试。
        scoped = service.CourseService(root=tmp)
        loaded = scoped.get_course("interactive_video_demo")
        check("从磁盘读出就是资源枢纽型", loaded.is_hub)
        check(
            "读出的交互节点数一致",
            len(loaded.resources[0].interactive_nodes)
            == len(primary.interactive_nodes),
            f"{len(loaded.resources[0].interactive_nodes)} vs {len(primary.interactive_nodes)}",
        )

        scoped.update_course(
            "interactive_video_demo",
            {"book": {"title": loaded.title, "description": loaded.description}},
        )
        written = json.loads(
            (tmp / "interactive_video_demo.json").read_text(encoding="utf-8")
        )
        check("写回后 hub 段仍在", "hub" in written)
        written_nodes = (
            written.get("hub", {})
            .get("topics", [{}])[0]
            .get("nodes", [{}])[0]
            .get("resources", [{}])[0]
            .get("interactive_nodes", [])
        )
        check(
            "写回后交互节点没丢",
            len(written_nodes) == len(primary.interactive_nodes),
            f"{len(written_nodes)} vs {len(primary.interactive_nodes)}",
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    print("=" * 68)
    print(f"通过 {PASSED} 项，失败 {FAILED} 项")
    print("=" * 68)
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
