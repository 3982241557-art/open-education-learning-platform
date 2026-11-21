#!/usr/bin/env python3
"""
Skill 能力库扩充
================

从 GitHub 上的优质提示词库里挑选**适合教育、分析、反思**的角色 /
技能提示词，转换成平台的 skill 格式，存进 ``backend/data/skills/``，
作为平台的可选能力。

数据源
------

* ``f/awesome-chatgpt-prompts`` —— 英文最全的角色提示词库；
* ``PlexPt/awesome-chatgpt-prompts-zh`` —— 中文本地化版本。

两者都是**纯提示词文本**，没有代码，因此导入它们没有供应链风险。

筛选标准
--------

不是全都要。脚本按四条规则过滤：

1. **长度** —— 太短（< 40 字符）没有信息量，太长（> 2000 字符）
   会挤爆上下文；
2. **领域** —— 只保留教育 / 分析 / 反思 / 写作 / 编程类的角色；
   「扮演一个 Minecraft 皮肤」这类娱乐向的不要；
3. **重复** —— 同一个角色在两个源里都出现时，保留描述更完整的；
4. **垃圾** —— 含 TODO / 调试语句 / 占位符的一律丢弃。

产出
----

每个提示词落成一个 skill 目录::

    backend/data/skills/<name>/SKILL.md

frontmatter 里的 ``persona: true`` 标记它可作为「回答模式」在对话
中途切换。

用法::

    # 看看会拉什么（不写盘）
    python scripts/fetch_awesome_prompts.py --dry-run

    # 实际导入
    python scripts/fetch_awesome_prompts.py

    # 只导入中文源
    python scripts/fetch_awesome_prompts.py --source zh

    # 限制数量
    python scripts/fetch_awesome_prompts.py --limit 12
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import io
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

# 用后端虚拟环境里的 httpx 而不是标准库的 urllib——
#
# 系统自带的 Python 没有 certifi（macOS 的 LibreSSL 不带根证书），
# urllib 会报 ``CERTIFICATE_VERIFY_FAILED``。httpx 自带 certifi 根证书
# 集合，是这个项目里已经验证过能用的 HTTP 客户端。
import httpx  # noqa: E402

SKILLS_DIR = ROOT / "backend" / "data" / "skills"

#: 数据源。
#:
#: ``format`` 决定怎么解析：``csv`` 是「角色,提示词」两列；
#: ``json`` 是 ``{"prompts": [{"act": ..., "prompt": ...}]}``。
SOURCES = {
    "en": {
        "url": "https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv",
        "lang": "en",
        "label": "f/awesome-chatgpt-prompts",
        "format": "csv",
    },
    "zh": {
        "url": "https://raw.githubusercontent.com/PlexPt/awesome-chatgpt-prompts-zh/main/prompts-zh.json",
        "lang": "zh",
        "label": "PlexPt/awesome-chatgpt-prompts-zh",
        "format": "json",
    },
}

#: 提示词的最小长度——太短的角色没有实际指导意义。
MIN_PROMPT_CHARS = 40

#: 提示词的最大长度——太长会挤爆上下文窗口。
MAX_PROMPT_CHARS = 2_000

#: 领域关键词。命中任一即认为与学习/分析相关。
#:
#: 中英文各一组——英文源的描述通常是英文的，中文源是中文的。
#: 关键词按**权重**排列：越靠前越核心。
EDUCATION_KEYWORDS = (
    # ── 核心教学角色（权重高）──
    "socratic", "苏格拉底",
    "feynman", "费曼",
    "debate", "辩论",
    "tutor", "mentor", "coach", "teacher", "professor",
    "导师", "老师", "教师", "教授", "教练",
    "critic", "critique", "直言不讳", "批评",
    "reflexion", "reflect", "反思",
    "explainer", "simplifier", "讲解", "解释",
    # ── 分析 / 研究 ──
    "analyst", "research", "scientist", "学术", "研究", "分析",
    "editor", "writer", "编辑", "撰写", "作文",
    "translator", "翻译",
    "exam", "quiz", "tutor", "考题", "出题", "阅卷",
    "curriculum", "lesson", "study", "learning", "教学", "学习", "课程",
    "psycholog", "counselor", "advisor", "心理", "顾问",
    "historian", "哲学", "philos", "linguist", "语言学",
    "mathematic", "physics", "chemistry", "biolog", "数学", "物理", "化学", "生物",
    "programmer", "code review", "debug", "architect", "编程", "代码", "架构",
    "fact-check", "investigator", "journalist", "考据", "记者", "事实核查",
    "librarian", "图书馆", "总结", "summar",
)

#: 命中这些词的提示词**降权**——它们沾了教育边，但主体不是教学。
#:
#: 例如「安全概念解释员」会命中 explainer，但它其实是安全领域的通用
#: 助手，不是学习导师。
DEMOTE_KEYWORDS = (
    "seo", "keyword", "social media", "copywriting", "marketing",
    "seo 优化", "小红书", "朋友圈", "带货",
    "image prompt", "midjourney", "portrait", "illustration",
    "image generation", "图像生成", "绘画", "摄影",
    "travel", "recipe", "cooking", "旅行", "菜谱", "烹饪",
    "legal", "contract", "法律", "合同",
)

#: 明显与学习无关的娱乐向关键词——命中即丢弃。
IRRELEVANT_KEYWORDS = (
    "minecraft", "doraemon", "anime", "roleplay as a fictional",
    "simulat", "superpower", "dan dan dan", "celebrity", "movie trailer",
    "midjourney", "dall-e", "stable diffusion prompt", "seo keyword",
    "gaming", "roblox", "fortnite", " pokemon", "simpsons",
)

#: 占位符 / 调试残留——命中即丢弃。
JUNK_PATTERNS = re.compile(
    r"(todo|tbd|fixme|lorem ipsum|placeholder|占位|待补|待填|调试|示例文本)",
    re.IGNORECASE,
)

#: 请求超时（秒）。
TIMEOUT = 45


# ── 工具 ───────────────────────────────────────────────────────────────


def http_get(url: str) -> str:
    """带重试的 GET。

    走 httpx（自带根证书），而不是标准库的 urllib——后者在 macOS
    系统 Python 上会因缺少 CA 根证书而失败。
    """
    last: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = httpx.get(
                url,
                timeout=TIMEOUT,
                follow_redirects=True,
                headers={
                    "User-Agent": "SEEK-Learning-Platform/1.0 (skill importer)",
                    "Accept": "text/csv,text/plain,*/*",
                },
            )
            response.raise_for_status()
            return response.text
        except Exception as exc:
            last = exc
            if attempt < 3:
                continue
    raise RuntimeError(f"拉取失败：{url}\n  原因：{last}")


def parse_csv(text: str) -> list[dict[str, str]]:
    """解析提示词库的 CSV。

    不同源的列名不一样（``act`` / ``prompt`` / ``act,prompt``），所以
    这里做**容错**：取第一列当角色名，第二列当提示词。
    """
    rows: list[dict[str, str]] = []
    # 提示词库里有超长字段（某些角色提示词上千字）。默认的 128KB
    # 上限会直接抛 ``_csv.Error``——把上限提到 1MB。
    csv.field_size_limit(min(1024 * 1024, sys.maxsize))

    reader = csv.reader(io.StringIO(text))
    for index, row in enumerate(reader):
        if not row:
            continue
        if index == 0:
            # 表头：跳过。但有些源没有表头——那就要看内容。
            head = row[0].strip().lower()
            if head in {"act", "role", "name", "角色", "人设"}:
                continue

        name = row[0].strip() if row else ""
        body = row[1].strip() if len(row) > 1 else ""
        if not body and len(row) == 1:
            # 单列的源：整行就是提示词，角色名从首行推断。
            body = name
            name = ""
        if name and body:
            rows.append({"name": name, "prompt": body})

    return rows


def parse_json(text: str) -> list[dict[str, str]]:
    """解析 JSON 格式的提示词库。

    形状是 ``{"prompts": [{"act": "角色名", "prompt": "提示词"}, ...]}``。
    """
    import json

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []

    items = data.get("prompts") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []

    rows: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("act") or item.get("name") or "").strip()
        body = str(item.get("prompt") or "").strip()
        if name and body:
            rows.append({"name": name, "prompt": body})
    return rows


def parse_source(text: str, fmt: str) -> list[dict[str, str]]:
    """按格式解析一个数据源。"""
    if fmt == "json":
        return parse_json(text)
    return parse_csv(text)


def slugify(text: str) -> str:
    """把角色名转成合法的 skill 名（``[a-z0-9-]``）。"""
    slug = re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")
    # 截断到 63 字符（skill 名的上限）。
    slug = slug[:63].strip("-")
    return slug or "imported-prompt"


# ── 过滤 ───────────────────────────────────────────────────────────────


#: 角色的提示词理想长度区间。
#:
#: 太短（< 80 字）说明角色没写清楚；太长（> 1200 字）说明它塞了太多
#: 与角色无关的样板话——塞进上下文会挤掉课程正文。
IDEAL_MIN_CHARS = 80
IDEAL_MAX_CHARS = 1_200


def score_prompt(name: str, prompt: str) -> int:
    """给一个提示词打「教学相关度」分。

    返回 0 表示不该导入。

    评分维度：

    1. **核心教学词命中** —— 越靠前的关键词权重越高（苏格拉底 / 费曼
       这类角色最值钱）；
    2. **降权词命中** —— 沾教育边但主体不是教学的（SEO、绘画生成）；
    3. **长度适中** —— 落在理想区间得满分，太短或太长都扣分；
    4. **角色名本身像角色** —— 短小、具体的名字（「Socratic Tutor」）
       比长句（「Design a poster for...」）更像一个可切换的模式。
    """
    if not prompt or len(prompt) < MIN_PROMPT_CHARS:
        return 0
    if len(prompt) > MAX_PROMPT_CHARS:
        return 0
    if JUNK_PATTERNS.search(prompt):
        return 0

    haystack = f"{name} {prompt}".lower()
    if any(word in haystack for word in IRRELEVANT_KEYWORDS):
        return 0

    # ① 核心教学词——取最高命中的权重。
    score = 0
    for index, word in enumerate(EDUCATION_KEYWORDS):
        if word in haystack:
            # 关键词越靠前权重越高：第一个命中就给满分，后续不再叠加。
            score = max(score, 100 - index)
            break

    if score == 0:
        return 0

    # ② 降权词。
    for word in DEMOTE_KEYWORDS:
        if word in haystack:
            score -= 35
            break

    # ③ 长度。
    if IDEAL_MIN_CHARS <= len(prompt) <= IDEAL_MAX_CHARS:
        score += 25
    elif len(prompt) > IDEAL_MAX_CHARS:
        score -= 20

    # ④ 角色名的形态——短而具体更像一个「可切换的模式」。
    words = name.split()
    if len(words) <= 4:
        score += 15
    elif len(words) > 12:
        score -= 15

    return max(score, 1)


def describe(name: str, prompt: str) -> str:
    """从提示词里提炼一行摘要——写进 frontmatter 的 ``description``。

    取提示词的第一句（截到 60 字）。这比原文好，因为原文常常是
    「You are ...」开头的一句话，读起来就是最自然的描述。
    """
    first = re.split(r"[。.\n]", prompt.strip())[0].strip()
    if len(first) < 6:
        first = name
    return first[:60]


def build_skill_md(
    *,
    name: str,
    title: str,
    prompt: str,
    source: str,
    source_url: str,
    lang: str,
) -> str:
    """生成 skill 的 ``SKILL.md``。

    frontmatter 里 ``persona: true`` 是关键——它让这个 skill 出现在
    「回答模式」切换器里，用户可以在对话中途切换。
    """
    description = describe(title, prompt)
    body = f"""---
name: {name}
description: {description}
tags:
- persona
- teaching
persona: true
---

# {title}

> 来源：{source} · {source_url}

{prompt}
"""
    return body


# ── 主流程 ─────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="从 GitHub 优质提示词库导入 skill 能力。",
    )
    parser.add_argument(
        "--source",
        default="all",
        choices=["all", "en", "zh"],
        help="导入哪个源",
    )
    parser.add_argument("--limit", type=int, default=16, help="最多导入多少个")
    parser.add_argument("--dry-run", action="store_true", help="只报告，不写盘")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的 skill")
    args = parser.parse_args()

    sources = (
        ["en", "zh"] if args.source == "all" else [args.source]
    )

    collected: list[dict[str, str]] = []
    for key in sources:
        source = SOURCES[key]
        print(f"▶ 拉取 {source['label']}…")
        try:
            text = http_get(source["url"])
        except RuntimeError as exc:
            print(f"   ✗ {exc}", file=sys.stderr)
            continue

        rows = parse_source(text, source["format"])
        kept = [
            row for row in rows if score_prompt(row["name"], row["prompt"]) > 0
        ]
        print(f"   共 {len(rows)} 条，命中领域筛选 {len(kept)} 条")

        for row in kept:
            row["source"] = source["label"]
            row["source_url"] = source["url"]
            row["lang"] = source["lang"]
        collected.extend(kept)

    if not collected:
        print("\n✗ 没有可导入的提示词。", file=sys.stderr)
        return 1

    # 去重：同名只留一条（先到先得，英文源优先）。
    unique: dict[str, dict[str, str]] = {}
    for row in collected:
        slug = slugify(row["name"])
        if not slug or slug in unique:
            continue
        unique[slug] = row

    print(f"\n▶ 去重后 {len(unique)} 个候选\n")

    # 按教学相关度排序——取分最高的若干个。
    ranked = sorted(
        unique.items(),
        key=lambda item: (
            score_prompt(item[1]["name"], item[1]["prompt"]),
            len(item[1]["prompt"]),
        ),
        reverse=True,
    )[: args.limit]

    written = 0
    skipped = 0

    for slug, row in ranked:
        target = SKILLS_DIR / slug / "SKILL.md"
        score = score_prompt(row["name"], row["prompt"])
        if target.exists() and not args.force:
            print(f"· {slug:36s} 已存在，跳过")
            skipped += 1
            continue

        content = build_skill_md(
            name=slug,
            title=row["name"],
            prompt=row["prompt"],
            source=row["source"],
            source_url=row["source_url"],
            lang=row["lang"],
        )

        if args.dry_run:
            print(
                f"· {slug:36s} 将被写入"
                f"（{len(row['prompt'])} 字 · 分 {score}）"
            )
            written += 1
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        print(
            f"✓ {slug:36s} {len(row['prompt']):>4} 字 · 分 {score:>3} · {row['source']}"
        )
        written += 1

    print()
    if args.dry_run:
        print(f"(dry-run) 将写入 {written} 个 skill，未写盘。")
    else:
        print(f"✓ 写入 {written} 个 skill，跳过 {skipped} 个已存在。")
        print("\n下一步：重启后端（或等待热重载），")
        print("  然后在 AI 输入框上方就能看到「回答模式」切换器。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
