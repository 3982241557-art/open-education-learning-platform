"""
GitHub 开源教育项目 · 大白话审核卡
=====================================

把一个 GitHub 仓库翻译成**人能看懂**的审核卡。

为什么必须翻译
--------------

GitHub 的 ``description`` 与 ``README`` 是**给开发者**写的。直接端给
用户，等于让一个不懂编程的人先学会编程，才能判断这个项目值不值得用。

而本平台的决策者是**内容运营与学习路径设计者**——他们要判断的是
「这东西能不能变成我平台上的课程」。

所以每张卡固定包含四项：

1. **它到底是什么** —— 一句小学生都能听懂的大白话；
2. **对学习者有什么用** —— 点进去能学到什么，有没有视频 / 练习 / 作业；
3. **我们平台能拿它做什么** —— 明确的落地建议；
4. **分类与推荐星级** —— 「线上教育成品」还是「学历文凭体系」，1~5 星。

翻译原则
--------

* **禁止**堆砌英文术语。出现 ``LMS`` 必须解释成「在线课程管理系统」；
* **禁止**把 README 原文粘过来。要**重写**成中文口语；
* **禁止**用「强大的」「易用的」这类空词——每句话都要带具体信息。

失败怎么办
----------

翻译失败时**不编造**。返回 ``None``，让调用方保留机器摘要，并明确
标注「尚未翻译」。一个编造的大白话比一句英文描述更有害——它看起来
可信，但可能是假的。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from app.services.llm_factory import (
    LLMCallError,
    LLMNotConfiguredError,
    complete,
)

logger = logging.getLogger(__name__)

#: 一次批量翻译多少个仓库。
#:
#: 一次 8 个——再多的话响应太长，模型容易在中途丢掉几个条目，
#: 还得重跑那一批。8 个一次，一个 50 条的清单跑 7 批就完事。
BATCH_SIZE = 8

#: 「人话卡」的系统提示。
PLAIN_PROMPT = """你是一个开源教育项目的**审核翻译员**。

你的读者是**不懂编程**的学习内容运营。他们要判断一个 GitHub 项目
能不能变成一门课。

绝对禁止：
1. 复制英文 README 原文。
2. 堆砌技术术语。必须用中文口语解释每一个术语。
3. 用「强大的」「完善的」「易用的」这类空话。每句话都要带具体信息。

对每个项目，你要输出这四项：

1. **what_it_is**（它到底是什么）
   一句话。像跟小学生解释「这是什么」那样。
   例：「这是一套免费的美国名校计算机本科四年完整自学课表。」

2. **learner_value**（对学习者有什么用）
   点进去能学到什么？有没有配套视频、练习、作业？学完能做什么？
   2 句话以内。

3. **platform_use**（我们平台能拿它做什么）
   明确的落地建议。要具体到「拿来当什么」「抄哪个部分」。
   例：「直接拿来当学位课程目录」「借鉴它的随堂测验页面」「提取里面的开源题库」。

4. **stars**（推荐星级）
   1 到 5 的整数。5 = 直接可用；3 = 需要改造；1 = 基本用不上。

同时输出 **kind**：只能是「线上教育成品」或「学历/文凭体系」之一。

严格输出 JSON 数组，不要任何解释文字或代码块标记。每个元素形如：
{"id": "...", "what_it_is": "...", "learner_value": "...", "platform_use": "...", "kind": "...", "stars": 3}

如果某个项目的 README 信息太少导致你无法判断，就照实写「信息不足，无法判断」，不要编造。"""


def _extract_json(raw: str) -> list[dict[str, Any]] | None:
    """从模型输出里抠出 JSON 数组。

    模型很爱在 JSON 外面裹一层 `` ```json ``，或者在前后加一句
    「好的，以下是结果：」。所以不能直接 ``json.loads``。
    """
    text = raw.strip()

    # 去掉代码块围栏。
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()

    # 找第一个 [ 到最后一个 ]。
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        parsed = json.loads(text[start : end + 1])
    except ValueError:
        return None
    if not isinstance(parsed, list):
        return None
    return [item for item in parsed if isinstance(item, dict)]


def _normalize_card(
    item: dict[str, Any], fallback_id: str
) -> dict[str, Any] | None:
    """把模型返回的一条整理成合法卡片。

    字段缺失就**放弃这一条**——宁可少一条，也不要一条半残的。
    """
    card_id = str(item.get("id") or fallback_id).strip()
    what = str(item.get("what_it_is") or "").strip()
    value = str(item.get("learner_value") or "").strip()
    use = str(item.get("platform_use") or "").strip()
    kind = str(item.get("kind") or "").strip()

    if not what or not value or not use:
        return None

    if kind not in ("线上教育成品", "学历/文凭体系"):
        kind = "线上教育成品"

    try:
        stars = int(item.get("stars") or 3)
    except (TypeError, ValueError):
        stars = 3
    stars = max(1, min(5, stars))

    return {
        "id": card_id,
        "what_it_is": what[:300],
        "learner_value": value[:400],
        "platform_use": use[:400],
        "kind": kind,
        "stars": stars,
    }


async def translate_batch(
    repos: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """把一批仓库翻译成大白话审核卡。

    输入是「精简过的仓库信息」——只给模型它需要知道的字段，全量
    README 塞进去会让上下文爆炸且模型容易照抄。
    """
    if not repos:
        return []

    payload = []
    for repo in repos:
        description = str(repo.get("description") or "").strip()
        topics = [t for t in (repo.get("topics") or [])][:8]
        payload.append(
            {
                "id": str(repo.get("id") or repo.get("full_name") or ""),
                "name": str(repo.get("full_name") or ""),
                "description": description[:600],
                "topics": topics,
                "language": str(repo.get("language") or ""),
                "stars": int(repo.get("stars") or 0),
                "homepage": str(repo.get("homepage") or "")[:200],
                "readme_excerpt": str(repo.get("readme_excerpt") or "")[:1500],
            }
        )

    # 用 ``prompt`` + ``system_prompt`` 两个参数，而不是直接塞
    # ``messages``——``complete`` 的第一个位置参数是 ``prompt``，
    # 把消息列表传进去会被当成 prompt 内容，模型端会报
    # 「missing field type」。
    user_prompt = (
        "请翻译以下 "
        + str(len(payload))
        + " 个项目：\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )

    try:
        raw = await complete(
            prompt=user_prompt,
            system_prompt=PLAIN_PROMPT,
            temperature=0.3,
            max_tokens=4000,
        )
    except (LLMNotConfiguredError, LLMCallError) as exc:
        logger.warning("人话翻译失败：%s", exc)
        return []

    items = _extract_json(raw)
    if items is None:
        logger.warning("人话翻译返回的不是合法 JSON：%s", raw[:300])
        return []

    cards: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        fallback = str(payload[index]["id"]) if index < len(payload) else ""
        card = _normalize_card(item, fallback)
        if card is not None:
            cards.append(card)
    return cards


async def translate_all(
    repos: list[dict[str, Any]],
    *,
    concurrency: int = 3,
    progress: Any = None,
) -> dict[str, dict[str, Any]]:
    """翻译**全部**仓库，返回 ``{仓库 id: 卡片}``。

    并发跑几批——串行的话 50 个仓库要跑很久，而每批之间并没有
    数据依赖。
    """
    batches = [
        repos[index : index + BATCH_SIZE]
        for index in range(0, len(repos), BATCH_SIZE)
    ]
    semaphore = asyncio.Semaphore(concurrency)

    async def run(batch: list[dict[str, Any]]) -> list[dict[str, Any]]:
        async with semaphore:
            try:
                return await translate_batch(batch)
            except Exception as exc:  # noqa: BLE001 — 单批失败不影响整体
                logger.warning("某一批翻译失败：%s", exc)
                return []

    results = await asyncio.gather(*(run(batch) for batch in batches))

    cards: dict[str, dict[str, Any]] = {}
    for group in results:
        for card in group:
            cards[str(card["id"])] = card

    if progress is not None:
        progress(len(cards), len(repos))
    return cards


__all__ = [
    "BATCH_SIZE",
    "PLAIN_PROMPT",
    "translate_all",
    "translate_batch",
]
