#!/usr/bin/env python3
"""把中台分类重构为「四大主类」，并把已有人工条目重新归位。

背景
----

:file:`backend/data/watched_channels.json` 定义的采集分类是按**学科**
划的四类（计算机与人工智能 / 哲学与人文 / 经济学与社会科学 /
自然科学与心理学），而中台里已有的分类是按**信源层级**划的
（顶级高校 / 通识趣味 / 国内权威 / 前沿与认知）。

两套分类不能共存——采集进来的条目不知道该挂到哪一类下。

这里把中台统一到**学科**轴上：
    * 四个分类改名成学科分类；
    * 已有的 24 条人工条目按内容重新归位；
    * 人工条目**一条不丢**。

「顶级高校 / 国内权威」这种分类其实描述的是**信源**，不是**内容**——
用户想找「量子力学」的时候，按信源分类意味着他要在四个分类里各找
一遍。按学科分类，他直接点「自然科学与心理学」就完事了。
信源信息（MIT / 哈佛 / 复旦）保留在条目的 ``source`` 与 ``tags`` 里。
"""

from __future__ import annotations

import json
import pathlib

HUB_PATH = pathlib.Path(__file__).resolve().parents[1] / "data" / "global_resource_hub.json"

# ── 四大主类（与 watched_channels.json 对齐） ──────────────────────────
CATEGORIES = [
    {
        "id": "cat_cs_ai",
        "title": "计算机与人工智能",
        "subtitle": "程序设计 · 算法 · 系统 · 机器学习",
        "description": (
            "从编程入门到机器学习原理，涵盖计算机科学最核心的课程体系。"
            "MIT 6.046J 算法设计与分析、哈佛 CS50 计算思维入门、"
            "3Blue1Brown 的线性代数可视化，都在这里。"
        ),
        "icon": "code",
    },
    {
        "id": "cat_philosophy",
        "title": "哲学与人文",
        "subtitle": "哲学经典 · 思想史 · 文学导读",
        "description": (
            "中西哲学的核心命题与文本细读。耶鲁死亡哲学、Crash Course 哲学、"
            "复旦哲学导论——理解人类如何思考自身、如何看待世界与他人。"
        ),
        "icon": "scroll",
    },
    {
        "id": "cat_econ_society",
        "title": "经济学与社会科学",
        "subtitle": "经济学原理 · 法学 · 社会学",
        "description": (
            "从机会成本到契约制度，理解市场与社会如何运作。"
            "哈佛《公正》思辨之旅、清华《经济学原理》、可汗学院微观经济学，"
            "以及北大社会学与历史学的公开课。"
        ),
        "icon": "chart",
    },
    {
        "id": "cat_science_psych",
        "title": "自然科学与心理学",
        "subtitle": "物理 · 生物 · 天文 · 认知科学",
        "description": (
            "自然科学的核心概念与心理学的基础框架。MIT 线性代数、"
            "Crash Course 心理学与天文系列、可汗学院物理与生物，"
            "以及 TED 的脑科学演讲——建立理解世界的骨架。"
        ),
        "icon": "flask",
    },
]

# ── 人工条目的新归属 ──────────────────────────────────────────────────
#
# 按条目的**内容主题**归位，而不是按它原来在哪个信源分类里。
# 判定依据是条目的 title + tags。
RESOURCE_TARGET = {
    # ── 计算机与人工智能 ──
    "res_cs50": "cat_cs_ai",
    "res_crashcourse_cs": "cat_cs_ai",
    "res_crashcourse_cs_bili": "cat_cs_ai",
    # ── 哲学与人文 ──
    "res_yale_death_intro": "cat_philosophy",
    "res_yale_death_live": "cat_philosophy",
    "res_fudan_philosophy": "cat_philosophy",
    "res_fudan_philosophy_ma": "cat_philosophy",
    "res_crashcourse_history": "cat_philosophy",
    "res_crashcourse_history_bili": "cat_philosophy",
    "res_khan_mesopotamia": "cat_philosophy",
    "res_pkupoliticalculture": "cat_philosophy",
    # ── 经济学与社会科学 ──
    "res_harvard_justice": "cat_econ_society",
    "res_harvard_justice_bili": "cat_econ_society",
    "res_tsinghua_econ": "cat_econ_society",
    # ── 自然科学与心理学 ──
    "res_mit_linear_algebra": "cat_science_psych",
    "res_mit_linear_algebra_bili": "cat_science_psych",
    "res_mit_strang_final": "cat_science_psych",
    "res_crashcourse_psych_intro": "cat_science_psych",
    "res_crashcourse_psych_bili": "cat_science_psych",
    "res_ted_procrastination": "cat_science_psych",
    "res_ted_procrastination_bili": "cat_science_psych",
    "res_ted_emotions": "cat_science_psych",
    "res_ted_vulnerability": "cat_science_psych",
    "res_ted_memory": "cat_science_psych",
}


def main() -> int:
    raw = json.loads(HUB_PATH.read_text(encoding="utf-8"))
    hub = raw.get("hub") or raw
    old_categories = hub.get("categories") or []

    # ① 收拢所有条目（人工 + 上一轮采集）。
    buckets: dict[str, list[dict]] = {item["id"]: [] for item in CATEGORIES}
    orphans: list[tuple[str, dict]] = []

    for category in old_categories:
        for resource in category.get("resources") or []:
            resource_id = str(resource.get("id") or "")
            target = RESOURCE_TARGET.get(resource_id)
            if target:
                buckets[target].append(resource)
            else:
                orphans.append((resource_id, resource))

    # ② 采集条目（``res_live_*``）按它自己的 category 字段归位。
    for resource_id, resource in orphans:
        if resource_id.startswith("res_live_"):
            meta = resource.get("meta") or {}
            category = str(meta.get("category") or "")
            if category in buckets:
                buckets[category].append(resource)
                continue
        print(f"  ! 孤儿条目未归位：{resource_id}")
        # 兜底：按标题关键词猜一个。
        title = str(resource.get("title") or "")
        if any(k in title for k in ("哲学", "存在", "死亡", "公正", "经济", "心理", "线性代数")):
            buckets["cat_philosophy" if "哲学" in title or "存在" in title or "死亡" in title else "cat_science_psych"].append(resource)
        else:
            buckets["cat_cs_ai"].append(resource)

    # ③ 写回新的分类结构。
    hub["categories"] = [
        {**item, "resources": buckets[item["id"]]}
        for item in CATEGORIES
    ]

    # ④ 落盘——不写的话这一整轮重构都只是内存里的临时状态。
    HUB_PATH.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    total = sum(len(item["resources"]) for item in hub["categories"])
    print(f"分类重构完成：{len(CATEGORIES)} 个主类，共 {total} 条资源。")
    for item in hub["categories"]:
        print(f"  · {item['title']}  {len(item['resources'])} 条")
    print(f"已写入 {HUB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
