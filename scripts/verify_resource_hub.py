#!/usr/bin/env python3
"""验证「资源枢纽」架构。

.. code-block:: text

    ① 数据模型：Topic → Node → Resource 能被正确解析
    ② 投影：Node → Page、Resource → resource 块（下游零改动）
    ③ AI 上下文：资源的 ai_context 真的进了课程上下文
    ④ 超级陪读：资源元数据进了 system prompt
    ⑤ 回归：所有旧课程仍然解析正常
"""

from __future__ import annotations

import json
import pathlib
import sys

BACKEND = pathlib.Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.course_context import build_course_context  # noqa: E402
from app.services.course_service import course_from_dict  # noqa: E402
from app.services.prompt_assembly import PromptAssembler  # noqa: E402

PASSED = 0
FAILED = 0


def check(label: str, ok: bool, detail: str = "") -> bool:
    global PASSED, FAILED
    if ok:
        PASSED += 1
        print(f"  ✅ {label}")
    else:
        FAILED += 1
        print(f"  ❌ {label}" + (f" — {detail}" if detail else ""))
    return ok


def section(title: str) -> None:
    print()
    print("=" * 68)
    print(title)
    print("=" * 68)


HUB_PATH = BACKEND / "data" / "courses" / "philosophy_hub.json"


def main() -> int:
    raw = json.loads(HUB_PATH.read_text(encoding="utf-8"))
    course = course_from_dict(raw, source="corpus")

    # ── ① 数据模型 ──────────────────────────────────────────────────
    section("① 数据模型：Topic → Node → Resource")

    check("识别为资源枢纽型课程", course.is_hub)
    check("主题模块非空", len(course.topics) > 0, f"实际 {len(course.topics)}")
    check("知识节点非空", len(course.nodes) > 0, f"实际 {len(course.nodes)}")
    check("外链资源非空", len(course.resources) > 0, f"实际 {len(course.resources)}")

    kinds = {r.resource_type for r in course.resources}
    check("资源类型覆盖 video / webpage", {"video", "webpage"} <= kinds, str(kinds))

    check(
        "每条资源都有链接",
        all(r.url.startswith("http") for r in course.resources),
    )
    check(
        "每条资源都有预置 AI 上下文",
        all(len(r.ai_context) > 30 for r in course.resources),
    )
    check(
        "每个节点都挂了资源",
        all(len(n.resources) > 0 for n in course.nodes),
    )
    check(
        "节点能取到默认资源",
        all(n.default_resource is not None for n in course.nodes),
    )

    # ── ② 投影 ──────────────────────────────────────────────────────
    section("② 投影：下游（进度 / 笔记 / 遥测）零改动就能用")

    check("Node 数 == Page 数", len(course.nodes) == len(course.pages))
    check("Topic 数 == Chapter 数", len(course.topics) == len(course.chapters))

    page = course.pages[0]
    check("Page 归属正确的 Topic", page.chapter_id == course.topics[0].id)
    check(
        "Page 的块全是 resource 类型",
        all(b.type == "resource" for b in page.blocks),
        str([b.type for b in page.blocks]),
    )
    check(
        "resource 块的载荷带 resource_type",
        all("resource_type" in b.payload for b in page.blocks),
    )
    check(
        "resource 块的载荷带 ai_context",
        all(b.payload.get("ai_context") for b in page.blocks),
    )
    check("Page 带节点导读", bool(page.summary))

    # ── ③ AI 上下文 ─────────────────────────────────────────────────
    section("③ AI 上下文：资源的摘要真的进了课程上下文")

    result = build_course_context("philosophy_hub", page_ids=["node_absurd"])
    text = result.text
    check("课程上下文非空", bool(text.strip()))
    check(
        "上下文里出现了资源的标题",
        "你什么都不是，因此可以成为一切" in text,
    )
    check(
        "上下文里出现了资源的类型标记",
        "[video]" in text and "[webpage]" in text,
    )
    check(
        "上下文里出现了 ai_context 的正文",
        "存在先于本质" in text,
    )
    check(
        "上下文里出现了全部三条资源",
        all(
            marker in text
            for marker in (
                "YouTube" if False else "Bilibili",
                "Wikipedia",
                "Stanford Encyclopedia of Philosophy",
            )
        ),
    )

    # ── ④ 超级陪读 ─────────────────────────────────────────────────
    section("④ 超级陪读：资源元数据进了 system prompt")

    assembler = PromptAssembler(language="zh")
    assembled = assembler.assemble(
        user_message="这里的荒诞到底指什么？",
        resource_context=(
            "资源标题：你什么都不是，因此可以成为一切！\n"
            "资源类型：视频 · Bilibili\n"
            "摘要：这期视频用 20 分钟讲清了存在主义的核心脉络。"
        ),
    )
    names = [b.name for b in assembled.blocks]
    check("生成了 resource_context 区块", "resource_context" in names, str(names))
    check("system prompt 含「超级陪读」", "超级陪读" in assembled.system_prompt)
    check(
        "system prompt 含资源标题",
        "你什么都不是，因此可以成为一切" in assembled.system_prompt,
    )
    check(
        "system prompt 含资源摘要",
        "20 分钟讲清了存在主义" in assembled.system_prompt,
    )
    check(
        "陪读准则要求不要编造",
        "不要编造" in assembled.system_prompt,
    )

    # 没有资源时不该有这个区块。
    plain = assembler.assemble(user_message="你好")
    check(
        "没有资源时不加 resource_context 区块",
        "resource_context" not in [b.name for b in plain.blocks],
    )

    # ── ⑥ 写回无损 ───────────────────────────────────────────────────
    section("⑥ 写回无损：hub 结构不能被压扁")

    import shutil
    import tempfile

    tmp = pathlib.Path(tempfile.mkdtemp())
    try:
        shutil.copy(HUB_PATH, tmp / HUB_PATH.name)
        from app.services.course_service import CourseService

        service = CourseService(root=tmp)
        loaded = service.get_course("philosophy_hub")
        check("从磁盘读出就是资源枢纽型", loaded.is_hub)
        check(
            "读出的资源数与文件一致",
            len(loaded.resources) == len(course.resources),
            f"{len(loaded.resources)} vs {len(course.resources)}",
        )

        # 走一次真实的写回路径——这正是把 hub 段抹掉的那个 bug。
        service.update_course(
            "philosophy_hub", {"book": {"title": loaded.title}}
        )

        written = json.loads(
            (tmp / HUB_PATH.name).read_text(encoding="utf-8")
        )
        check("写回后 hub 段仍在", "hub" in written)
        written_topics = written.get("hub", {}).get("topics", [])
        check(
            "写回后主题数不变",
            len(written_topics) == len(course.topics),
            f"{len(written_topics)} vs {len(course.topics)}",
        )
        written_nodes = [
            node
            for topic in written_topics
            for node in topic.get("nodes", [])
        ]
        check("写回后节点数不变", len(written_nodes) == len(course.nodes))
        check(
            "写回后资源数不变",
            sum(len(node.get("resources", [])) for node in written_nodes)
            == len(course.resources),
        )
        check(
            "写回后仍是资源枢纽型",
            service.get_course("philosophy_hub").is_hub,
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ── ⑦ 回归 ─────────────────────────────────────────────────────
    section("⑦ 回归：所有旧课程仍然解析正常")

    directory = BACKEND / "data" / "courses"
    files = sorted(directory.glob("*.json"))
    failures: list[str] = []
    hubs = 0
    for path in files:
        try:
            parsed = course_from_dict(
                json.loads(path.read_text(encoding="utf-8")), source="corpus"
            )
            if parsed.is_hub:
                hubs += 1
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{path.name}: {exc}")

    check(f"{len(files)} 个课程文件全部解析成功", not failures, "; ".join(failures))
    # 平台转型后有**两门**资源枢纽型课程：哲学枢纽（网页/文档为主）
    # 与流媒体交互沙盘（视频 + 交互节点）。
    check("其中恰好 2 个是资源枢纽型", hubs == 2, f"实际 {hubs}")

    print()
    print("=" * 68)
    print(f"通过 {PASSED} 项，失败 {FAILED} 项")
    print("=" * 68)
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
