"""
AI 自学框架装配工厂
===================

给一条视频**一次性**装配「四位一体」的自学框架：

.. code-block:: text

    ┌─ interactive_nodes ── 4~6 个重点提示点（时间戳 + 概念 + 追问）
    ├─ study_guide ──────── 顶部知识向导（策略 / 检查点 / 提问灵感）
    ├─ guided_segments ──── 下方段落导读（5~8 段，可点击跳转）
    └─ academic_intro ───── 纯正中文学术导读（简介兜底）

为什么必须有这一层
------------------

平台上有两种「AI 参与的交互」：

* **实时的**——用户点气泡，右侧助教当场回答（:mod:`advisor_service`）；
* **预制的**——视频还没播，导读点、段落导读、知识向导就已经在位。

第二种才是「自学框架」的底座：用户看一条 90 分钟的课，**事先**就知道
哪 5 个时刻值得停、每一段在讲什么、带着哪几个问题看效率最高。没有
它，用户面对的就是一条长长的进度条。

但预制内容有它自己的死穴——**AI 凭标题瞎猜时间戳**。猜出来的时间戳
点进去是另一件事，用户立刻失去信任。

所以本模块的规矩是：

1. **锚点来自外部事实**。:mod:`app.services.evidence` 先把真实章节 /
   简介时间码 / 字幕轨 / 教学法节奏抓成一张「锚点表」。
2. **模型只能选锚点，不能造锚点**。模型返回的每个时间戳都会被**吸附**
   到最近的真实锚点上——最终落库的时间戳**一定是真实锚点之一**。
3. **没有证据就说没有**。Tier 3 推演出来的锚点会明确标成 ``pacing``，
   模型被告知「这些是阶段推断，不是逐字原话」，因此它不会写出
   「讲师原话：……」这种伪造的逐字稿。

并发与落盘
----------

批量装配用 ``asyncio.Semaphore(5)`` 控 5 并发，**每完成 5 条立刻增量
落盘**。原因很实际：52 条视频 × 每条一次模型调用，可能要跑十几分钟；
中途断网 / Ctrl-C 时，已经装配好的那几十条不应该白跑。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from app.services.evidence import (
    Evidence,
    TimeAnchor,
    extract_evidence_async,
)

logger = logging.getLogger(__name__)

#: 中台数据文件。
DATA_ROOT = Path(__file__).resolve().parents[2] / "data"
GLOBAL_HUB_PATH = DATA_ROOT / "global_resource_hub.json"

#: 并发装配的最大请求数。
DEFAULT_CONCURRENCY = 5

#: 每完成多少条落盘一次。
DEFAULT_SAVE_EVERY = 5

#: 提示词里最多展示多少个锚点——再多就超出模型的有效注意力了。
MAX_ANCHORS_IN_PROMPT = 26

#: 段落导读最多几段。
MAX_GUIDED_SEGMENTS = 8

#: 字幕轨最多保存多少条（控制 JSON 体积）。
MAX_CAPTIONS = 500

#: 单条字幕最多保留多少字符。
MAX_CAPTION_CHARS = 220


class StructurerError(RuntimeError):
    """装配失败。"""


# ──────────────────────────────────────────────────────────────────────
# 提示词
# ──────────────────────────────────────────────────────────────────────

_STRUCTURER_SYSTEM = """你是一位为「自主学习平台」设计自学框架的教研专家。

你会收到一条公开教学视频的**真实时间轴证据**（章节锚点 / 简介时间码 /
字幕段落摘要），以及它的标题、时长、简介。你的任务是把这门课装配成一套
「用户还没看就知道该怎么学」的自学框架。

**铁律（违反即为错误输出）**

1. 时间戳**只能从给你的锚点表里选**。锚点表里第 N 个锚点就用数字 N
   引用它。你自己编造的时间戳一律作废。
2. **严禁伪造逐字原话**。字幕摘要是真实内容，可以引用其中出现过的句子；
   如果某一段只有章节标题而没有字幕摘要，你只能依据章节标题与课程整体
   简介做**概括性描述**，绝不能写成「讲师原话：……」「他说：……」。
3. 如果证据等级是「教学法节奏推演」（锚点来自课程结构比例而非真实
   章节），你必须把该阶段写成**教学意图的合理概括**，不能断言具体内容。
4. 全部用**简体中文**。英文原声视频的专有名词保留英文原名并给中文译名。

**输出格式**：严格的 JSON 对象，不要任何额外文字、不要 markdown 围栏。
"""

_STRUCTURER_PROMPT_TEMPLATE = """请为下面这条公开课视频装配自学框架。

# 视频信息

- 标题：{title}
- 来源 / 讲师：{channel}
- 平台：{platform}
- 时长：{duration_label}（{duration} 秒）
- 课程分类：{category}
- 原始简介：{description}

{intro_notice}
# 真实时间轴锚点表

以下是这条视频的**真实时间轴证据**。请只使用这些锚点。

{anchor_table}

# 输出要求

```json
{{
  "academic_intro": "60~100 字的纯正中文学术导读，概括这门课讲什么、为什么值得学、用什么视角看",
  "interactive_nodes": [
    {{
      "anchor": 1,
      "keyword": "4~8 字的核心概念名",
      "type": "concept | question | quote | warning",
      "summary": "1~2 句话讲透这一处的核心冲突或直觉模型",
      "prompt": "一句发给 AI 助教的深度追问指令，要具体、自足、能直接作答"
    }}
  ],
  "study_guide": {{
    "strategy": "一句话说明看这条视频的最佳观看/思考策略",
    "checkpoints": ["思维检查点 1", "思维检查点 2", "思维检查点 3"],
    "suggested_questions": [
      {{
        "title": "8 字内的提问标题",
        "prompt": "完整、具体、可直接发给 AI 助教的高质量问题",
        "angle": "认知角度标签，如「机制追问」「反例检验」「迁移应用」"
      }}
    ]
  }},
  "guided_segments": [
    {{
      "anchor": 2,
      "title": "这一段的 8~16 字小标题",
      "content": "这一段在讲什么、要注意什么、可以带着什么问题看，60~120 字"
    }}
  ]
}}
```

细则：

- `interactive_nodes`：**4~6 个**。`anchor` 是锚点表里的序号（从 1 开始）。
  `anchor` 相同的节点不要出现两次。`keyword` 必须是**具体概念**，不要写
  「第一部分」「核心内容」这种废话。`prompt` 要像一位助教真正会问的问题。
- `study_guide.checkpoints`：**正好 3 条**，是「观众看完这一段应该能回答的
  问题」，不是课程简介。
- `study_guide.suggested_questions`：**正好 4 个**，每个都要带不同的
  `angle` 标签，并且必须是**分析型**问题（要求比较、机制、迁移、反例），
  不是「这节课讲了什么」。
- `guided_segments`：**5~8 段**。要覆盖整门课的时间跨度——从开场到结尾。
  每段的 `content` 要能让人**不看视频也知道这段在讲什么**。
"""


# ──────────────────────────────────────────────────────────────────────
# 数据结构
# ──────────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class StructureResult:
    """一条视频装配出来的自学框架。"""

    interactive_nodes: list[dict[str, Any]] = field(default_factory=list)
    study_guide: dict[str, Any] = field(default_factory=dict)
    guided_segments: list[dict[str, Any]] = field(default_factory=list)
    academic_intro: str = ""
    captions: list[dict[str, Any]] = field(default_factory=list)
    evidence_tier: int = 3
    evidence_reason: str = ""
    #: 时间戳被吸附到锚点的节点数——非 0 说明模型给的时间戳不准。
    adjusted: int = 0
    from_model: bool = False
    warnings: list[str] = field(default_factory=list)

    def is_usable(self) -> bool:
        """这份结果能不能用。"""
        return bool(self.interactive_nodes) and bool(self.study_guide)

    def to_dict(self) -> dict[str, Any]:
        return {
            "interactive_nodes": self.interactive_nodes,
            "study_guide": self.study_guide,
            "guided_segments": self.guided_segments,
            "academic_intro": self.academic_intro,
            "captions": self.captions,
            "is_structured": True,
            "structure_meta": {
                "evidence_tier": self.evidence_tier,
                "evidence_reason": self.evidence_reason,
                "adjusted_timestamps": self.adjusted,
                "from_model": self.from_model,
                "structured_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
                "warnings": list(self.warnings),
            },
        }


@dataclass(slots=True)
class StructureStats:
    """批量装配的统计。"""

    total: int = 0
    processed: int = 0
    succeeded: int = 0
    failed: int = 0
    skipped: int = 0
    tier_counts: dict[str, int] = field(default_factory=dict)
    failures: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "processed": self.processed,
            "succeeded": self.succeeded,
            "failed": self.failed,
            "skipped": self.skipped,
            "tier_counts": dict(self.tier_counts),
            "failures": list(self.failures)[:20],
        }


# ──────────────────────────────────────────────────────────────────────
# 资源识别
# ──────────────────────────────────────────────────────────────────────


def infer_platform_and_id(resource: dict[str, Any]) -> tuple[str, str]:
    """从资源条目推断 ``(platform, video_id)``。

    优先用 ``meta.ingested_from``（采集器写好的），其次按 URL 猜。
    """
    meta = resource.get("meta")
    meta = meta if isinstance(meta, dict) else {}

    platform = str(meta.get("ingested_from") or "").strip().lower()
    if platform in ("bilibili", "youtube"):
        pass
    else:
        provider = str(resource.get("provider") or "").strip().lower()
        if provider in ("bilibili", "youtube"):
            platform = provider
        else:
            url = str(resource.get("url") or "").lower()
            if "bilibili.com" in url or "b23.tv" in url:
                platform = "bilibili"
            elif "youtube.com" in url or "youtu.be" in url:
                platform = "youtube"

    url = str(resource.get("url") or "")
    video_id = ""
    if platform == "bilibili":
        match = re.search(r"/video/(BV[0-9A-Za-z]+)", url)
        if match:
            video_id = match.group(1)
    elif platform == "youtube":
        match = re.search(r"[?&]v=([0-9A-Za-z_-]{6,})", url)
        if match:
            video_id = match.group(1)
        else:
            match = re.search(r"youtu\.be/([0-9A-Za-z_-]{6,})", url)
            if match:
                video_id = match.group(1)
            else:
                match = re.search(r"/embed/([0-9A-Za-z_-]{6,})", url)
                if match:
                    video_id = match.group(1)

    if not video_id:
        # 兜底：从 id 里剥出来——``res_live_youtube_XXXXXXXX``。
        match = re.search(r"res_live_(bilibili|youtube)_(.+)$", str(resource.get("id") or ""))
        if match:
            platform = platform or match.group(1)
            video_id = match.group(2)

    return platform, video_id


def resource_duration(resource: dict[str, Any]) -> int:
    """取资源的总时长（秒）。"""
    meta = resource.get("meta")
    meta = meta if isinstance(meta, dict) else {}
    try:
        return int(float(meta.get("duration") or 0))
    except (TypeError, ValueError):
        return 0


def resource_description(resource: dict[str, Any]) -> str:
    """取资源的简介文本。

    对手工整理的条目，``ai_context`` 就是它的简介；对采集条目，
    ``ai_context`` 装的是原始描述。
    """
    for key in ("description", "desc", "summary"):
        value = resource.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    context = resource.get("ai_context")
    return context.strip() if isinstance(context, str) else ""


# ──────────────────────────────────────────────────────────────────────
# 提示词组装
# ──────────────────────────────────────────────────────────────────────


def _format_duration(seconds: int) -> str:
    total = max(0, int(seconds or 0))
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours} 小时 {minutes} 分 {secs} 秒"
    if minutes:
        return f"{minutes} 分 {secs} 秒"
    return f"{secs} 秒"


def _sample_anchors(anchors: list[TimeAnchor], limit: int) -> list[TimeAnchor]:
    """锚点太多时均匀抽稀——保留首尾。"""
    if len(anchors) <= limit:
        return list(anchors)
    step = len(anchors) / limit
    picked = [anchors[int(index * step)] for index in range(limit)]
    if anchors[-1] is not picked[-1]:
        picked[-1] = anchors[-1]
    return picked


def build_anchor_table(anchors: list[TimeAnchor]) -> str:
    """把锚点表渲染成提示词里的文本。"""
    lines: list[str] = []
    for index, anchor in enumerate(anchors, start=1):
        stamp = _format_duration(int(anchor.timestamp))
        lines.append(f"[{index}] {stamp} — {anchor.title}")
        if anchor.digest:
            lines.append(f"    字幕摘录：{anchor.digest}")
    return "\n".join(lines)


def build_prompt(
    resource: dict[str, Any],
    evidence: Evidence,
    anchors: list[TimeAnchor],
) -> str:
    """组装一条视频的装配提示词。"""
    meta = resource.get("meta")
    meta = meta if isinstance(meta, dict) else {}
    channel = str(resource.get("source") or meta.get("channel") or "").strip()
    category = str(meta.get("category") or "").strip()
    platform, _ = infer_platform_and_id(resource)

    description = (evidence.description or resource_description(resource)).strip()
    if len(description) > 2500:
        description = description[:2500] + "…"

    # 证据等级不同，给模型的**措辞约束**也不同。
    if evidence.tier == 3:
        intro_notice = (
            "⚠️ 注意：这条视频**没有真实章节，也没有字幕轨**。下面的锚点是按"
            "「经典学术公开课的黄金叙事比例」推演出来的**教学阶段**，只是时间"
            "位置是真实的，**具体内容并非已知的**。因此：你的描述要写成"
            "「这一阶段大致承担……职能」这类**教学意图概括**，绝不能断言"
            "讲师在这里讲了某个具体例子。\n\n"
        )
    elif evidence.tier == 2:
        intro_notice = (
            "ℹ️ 注意：这条视频**没有官方章节**，锚点来自**真实字幕轨**的"
            "分段聚合（每 4 分钟一段）。字幕摘录是真实内容，可以引用其中"
            "出现过的句子；但不要把它当成逐字稿全文。\n\n"
        )
    else:
        intro_notice = (
            "ℹ️ 注意：下面的锚点来自**视频自带的真实章节 / 简介时间码**，"
            "是精确时间锚点。锚点带字幕摘录时可以引用其中的原话。\n\n"
        )

    return _STRUCTURER_PROMPT_TEMPLATE.format(
        title=str(resource.get("title") or "（无标题）").strip(),
        channel=channel or "（未知）",
        platform=platform or "（未知）",
        duration_label=_format_duration(evidence.duration),
        duration=int(evidence.duration or 0),
        category=category or "（未分类）",
        description=description or "（这条视频没有可用简介）",
        intro_notice=intro_notice,
        anchor_table=build_anchor_table(anchors) or "（无锚点）",
    )


# ──────────────────────────────────────────────────────────────────────
# 解析与校验
# ──────────────────────────────────────────────────────────────────────


def _extract_json(raw: str) -> dict[str, Any] | None:
    """从模型输出里抠出 JSON 对象。

    模型即使被 ``response_format`` 约束，也偶尔会裹上 ```json 围栏或
    前后杂音——容忍这些，但绝不接受「不是 JSON」的输出。
    """
    text = str(raw or "").strip()
    if not text:
        return None

    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _resolve_anchor(
    index_hint: Any,
    timestamp_hint: Any,
    anchors: list[TimeAnchor],
) -> tuple[TimeAnchor | None, bool]:
    """把模型给的时间戳解析成**真实锚点**。

    返回 ``(锚点, 是否被吸附)``。

    优先级：

    1. 模型给了有效的锚点序号 → 直接用；
    2. 模型给了时间戳 → 找最近的锚点；
    3. 都没有 → ``None``。

    **最终落库的时间戳永远是锚点的真实时间戳**——模型没有任何机会
    写出一个不存在于视频结构里的时刻。
    """
    if not anchors:
        return None, False

    if isinstance(index_hint, (int, float)) and not isinstance(index_hint, bool):
        index = int(index_hint) - 1
        if 0 <= index < len(anchors):
            return anchors[index], False

    try:
        seconds = float(timestamp_hint)
    except (TypeError, ValueError):
        return None, False
    if seconds < 0:
        return None, False

    nearest = min(anchors, key=lambda item: abs(item.timestamp - seconds))
    return nearest, True


def _clean_text(value: Any, limit: int = 400) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s{2,}", " ", text)
    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


def _parse_nodes(
    raw_nodes: Any,
    anchors: list[TimeAnchor],
) -> tuple[list[dict[str, Any]], int]:
    """解析并校验 ``interactive_nodes``。

    每个节点最终携带：

    * ``timestamp`` —— **真实锚点**的时间戳（秒）；
    * ``keyword`` —— 概念名；
    * ``type`` —— 气泡类型；
    * ``context`` —— 该处的讲解（前端显示在气泡里）；
    * ``hint`` —— 深度追问指令（点击后发给助教）；
    * ``anchor_title`` —— 对应的锚点标题（前端可显示「章节」）。

    返回 ``(节点列表, 被吸附的节点数)``。
    """
    if not isinstance(raw_nodes, list):
        return [], 0

    out: list[dict[str, Any]] = []
    used: set[float] = set()
    adjusted = 0

    for item in raw_nodes[:8]:
        if not isinstance(item, dict):
            continue

        anchor, was_adjusted = _resolve_anchor(
            item.get("anchor") or item.get("anchor_index"),
            item.get("timestamp"),
            anchors,
        )
        if anchor is None:
            continue

        keyword = _clean_text(item.get("keyword") or item.get("term"), 40)
        if not keyword:
            continue

        # 同一个锚点只留一个节点——两个气泡挤在同一秒没有任何意义。
        if anchor.timestamp in used:
            continue
        used.add(anchor.timestamp)

        summary = _clean_text(item.get("summary") or item.get("context"), 300)
        prompt = _clean_text(item.get("prompt") or item.get("hint"), 300)

        node_type = str(item.get("type") or "concept").strip().lower()
        if node_type not in ("concept", "question", "quote", "warning"):
            node_type = "concept"

        out.append(
            {
                "timestamp": float(anchor.timestamp),
                "keyword": keyword,
                "type": node_type,
                "context": summary or anchor.title,
                "hint": prompt,
                "anchor_title": anchor.title,
                "anchor_origin": anchor.origin,
            }
        )
        if was_adjusted:
            adjusted += 1

    out.sort(key=lambda node: node["timestamp"])
    return out, adjusted


def _parse_study_guide(raw: Any) -> dict[str, Any]:
    """解析 ``study_guide``。"""
    if not isinstance(raw, dict):
        return {}

    strategy = _clean_text(raw.get("strategy"), 200)

    checkpoints: list[str] = []
    for item in raw.get("checkpoints") or []:
        text = _clean_text(item, 160)
        if text:
            checkpoints.append(text)

    questions: list[dict[str, Any]] = []
    for item in raw.get("suggested_questions") or []:
        if not isinstance(item, dict):
            text = _clean_text(item, 160)
            if text:
                questions.append({"title": text[:20], "prompt": text, "angle": ""})
            continue
        title = _clean_text(item.get("title"), 24)
        prompt = _clean_text(item.get("prompt"), 300)
        angle = _clean_text(item.get("angle") or item.get("hint"), 16)
        if not title and not prompt:
            continue
        questions.append(
            {
                "title": title or prompt[:16],
                "prompt": prompt or title,
                "angle": angle,
            }
        )

    guide: dict[str, Any] = {"strategy": strategy}
    if checkpoints:
        guide["checkpoints"] = checkpoints[:5]
    if questions:
        guide["suggested_questions"] = questions[:6]
    return guide


def _parse_guided_segments(
    raw: Any,
    anchors: list[TimeAnchor],
) -> list[dict[str, Any]]:
    """解析 ``guided_segments``——段落导读。

    时间戳同样**吸附到真实锚点**。段落要覆盖整门课的时间跨度，所以
    这里按锚点时间排序后保留。
    """
    if not isinstance(raw, list):
        return []

    out: list[dict[str, Any]] = []
    used: set[float] = set()

    for item in raw[:MAX_GUIDED_SEGMENTS + 4]:
        if not isinstance(item, dict):
            continue
        anchor, _ = _resolve_anchor(
            item.get("anchor") or item.get("anchor_index"),
            item.get("timestamp"),
            anchors,
        )
        if anchor is None:
            continue
        if anchor.timestamp in used:
            continue
        used.add(anchor.timestamp)

        title = _clean_text(item.get("title"), 40)
        content = _clean_text(item.get("content") or item.get("summary"), 400)
        if not content:
            continue

        out.append(
            {
                "timestamp": float(anchor.timestamp),
                "title": title or anchor.title,
                "content": content,
                "anchor_title": anchor.title,
                "anchor_origin": anchor.origin,
            }
        )

    out.sort(key=lambda item: item["timestamp"])
    return out


def parse_structure(
    raw: str,
    evidence: Evidence,
    anchors: list[TimeAnchor],
) -> StructureResult:
    """把模型输出解析成规范结构。"""
    data = _extract_json(raw)
    if data is None:
        return StructureResult(
            evidence_tier=evidence.tier,
            evidence_reason=evidence.tier_reason,
            warnings=["模型输出不是合法 JSON"],
        )

    nodes, adjusted = _parse_nodes(data.get("interactive_nodes"), anchors)
    guide = _parse_study_guide(data.get("study_guide"))
    segments = _parse_guided_segments(data.get("guided_segments"), anchors)

    # 段落导读不足 5 段时，用剩余锚点补齐——导读轨不允许有空洞。
    if len(segments) < 5:
        taken = {item["timestamp"] for item in segments}
        for anchor in anchors:
            if len(segments) >= 5:
                break
            if anchor.timestamp in taken:
                continue
            segments.append(
                {
                    "timestamp": float(anchor.timestamp),
                    "title": anchor.title[:40],
                    "content": (
                        f"本节对应视频中的「{anchor.title}」阶段。"
                        + (f"字幕摘录：{anchor.digest[:200]}" if anchor.digest else "")
                    ),
                    "anchor_title": anchor.title,
                    "anchor_origin": anchor.origin,
                }
            )
        segments.sort(key=lambda item: item["timestamp"])

    # 还是不够 5 段——**拆分最长的时间空档**。
    #
    # 一门 10 分钟的课可能只有 3 个章节，但导读轨必须让用户能跳到
    # 各个阶段。拆分点取自「锚点之间最长的一段」的中点——它落在
    # 两个真实章节的边界附近，不会凭空发明一个与内容无关的时刻。
    if len(segments) < 5:
        segments = _split_longest_gaps(segments, anchors, evidence.duration, 5)

    segments.sort(key=lambda item: item["timestamp"])

    captions = _build_captions(evidence)

    return StructureResult(
        interactive_nodes=nodes,
        study_guide=guide,
        guided_segments=segments,
        academic_intro=_clean_text(data.get("academic_intro"), 400),
        captions=captions,
        evidence_tier=evidence.tier,
        evidence_reason=evidence.tier_reason,
        adjusted=adjusted,
        from_model=True,
    )


def _split_longest_gaps(
    segments: list[dict[str, Any]],
    anchors: list[TimeAnchor],
    duration: int,
    target: int,
) -> list[dict[str, Any]]:
    """拆分最长的时间空档，把段落导读补到 ``target`` 段。

    拆分点取「相邻两段之间最长空档」的中点。它落在两个真实章节的
    边界附近——不是凭空发明的时刻。

    每一段还需要一段内容描述——**没有原文可摘时**，就写清楚它是
    「上一段之后、下��段之前」的过渡区间，并标明这是过渡区（诚实，
    而不是假装那里讲了具体内容）。
    """
    if not segments or target <= len(segments):
        return segments

    duration = int(duration or 0)
    working = [dict(item) for item in segments]

    while len(working) < target:
        # 找出最长空档。
        points = [0.0] + [item["timestamp"] for item in working]
        if duration:
            points.append(float(duration))

        best_gap = 0.0
        best_index = -1
        for index in range(len(points) - 1):
            gap = points[index + 1] - points[index]
            if gap > best_gap:
                best_gap = gap
                best_index = index

        if best_index < 0 or best_gap <= 0:
            break

        midpoint = points[best_index] + best_gap / 2

        # 找到它落在哪两个锚点之间——用来给这一段起个像样的标题。
        before = ""
        after = ""
        for anchor in anchors:
            if anchor.timestamp <= midpoint:
                before = anchor.title
            else:
                after = anchor.title
                break

        title = f"{before or '开场'} → {after or '结尾'}（过渡）"
        content = (
            f"这一段位于「{before or '开场'}」与「{after or '结尾'}」之间，"
            f"是承上启下的过渡区间（约 {int(best_gap // 60)} 分 {int(best_gap % 60)} 秒）。"
            "这一段没有独立的章节标题，观看时注意讲师是如何把上一部分的结论"
            "引向下一部分的问题。"
        )

        working.append(
            {
                "timestamp": round(midpoint, 3),
                "title": title[:40],
                "content": content,
                "anchor_title": title[:40],
                "anchor_origin": "derived",
            }
        )
        working.sort(key=lambda item: item["timestamp"])

    return working


def _build_captions(evidence: Evidence) -> list[dict[str, Any]]:
    """把真实字幕轨整理成 ``captions``。

    没有字幕就是没有——不生成假的。
    """
    if not evidence.cues:
        return []

    captions: list[dict[str, Any]] = []
    for cue in evidence.cues[:MAX_CAPTIONS]:
        text = re.sub(r"\s{2,}", " ", cue.text).strip()
        if not text:
            continue
        captions.append(
            {
                "start": round(cue.start, 2),
                "text": text[:MAX_CAPTION_CHARS],
            }
        )
    return captions


# ──────────────────────────────────────────────────────────────────────
# 单条装配
# ──────────────────────────────────────────────────────────────────────


async def structure_resource(
    resource: dict[str, Any],
    *,
    evidence: Evidence | None = None,
    overwrite_nodes: bool = False,
) -> StructureResult:
    """给一条视频装配自学框架。

    ``overwrite_nodes=False`` 时，**已经有人工整理的交互节点就不动**——
    手工挑出来的重点提示点比模型生成的值钱。
    """
    from app.services.llm_factory import (
        LLMCallError,
        LLMNotConfiguredError,
        complete,
        has_real_model,
    )

    if not has_real_model():
        raise StructurerError("尚未配置模型密钥，无法装配自学框架。")

    platform, video_id = infer_platform_and_id(resource)
    duration = resource_duration(resource)
    description = resource_description(resource)

    if evidence is None:
        evidence = await extract_evidence_async(
            platform,
            video_id,
            duration=duration,
            description=description,
        )

    anchors = _sample_anchors(evidence.anchors, MAX_ANCHORS_IN_PROMPT)
    if not anchors:
        raise StructurerError(
            f"没有可用锚点（duration={duration}s），无法装配：{resource.get('title')}"
        )

    prompt = build_prompt(resource, evidence, anchors)

    try:
        raw = await complete(
            prompt=prompt,
            system_prompt=_STRUCTURER_SYSTEM,
            max_tokens=4000,
            temperature=0.35,
            # 强制 JSON 输出——装配器的下游全是严格解析。
            response_format={"type": "json_object"},
        )
    except (LLMNotConfiguredError, LLMCallError) as exc:
        raise StructurerError(f"模型调用失败：{exc}") from exc

    result = parse_structure(raw, evidence, anchors)

    # 保留人工整理的节点——模型产出的替代不了作者挑的重点。
    if not overwrite_nodes:
        existing = resource.get("interactive_nodes")
        if isinstance(existing, list) and existing:
            result.interactive_nodes = [dict(item) for item in existing]
            result.adjusted = 0

    if not result.is_usable():
        raise StructurerError(
            f"装配结果不完整（nodes={len(result.interactive_nodes)}，"
            f"guide={bool(result.study_guide)}）：{resource.get('title')}"
        )

    return result


# ──────────────────────────────────────────────────────────────────────
# 批量装配
# ──────────────────────────────────────────────────────────────────────


def load_hub_raw(path: Path | None = None) -> dict[str, Any]:
    """读中台原始数据（不做归一化——要保留 ``is_structured`` 等标记）。"""
    target = path or GLOBAL_HUB_PATH
    if not target.exists():
        raise StructurerError(f"中台数据文件不存在：{target}")
    return json.loads(target.read_text(encoding="utf-8"))


def save_hub_raw(path: Path | None, raw: dict[str, Any]) -> None:
    """把中台原始数据落盘。"""
    target = path or GLOBAL_HUB_PATH
    target.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _iter_resources(raw: dict[str, Any]) -> Iterable[tuple[dict[str, Any], dict[str, Any]]]:
    """遍历 ``(分类, 资源)``。"""
    hub = raw.get("hub") if isinstance(raw.get("hub"), dict) else raw
    for category in hub.get("categories") or []:
        if not isinstance(category, dict):
            continue
        for resource in category.get("resources") or []:
            if isinstance(resource, dict):
                yield category, resource


def _apply_structure(
    resource: dict[str, Any],
    result: StructureResult,
) -> None:
    """把装配结果写回资源条目。"""
    payload = result.to_dict()

    resource["interactive_nodes"] = payload["interactive_nodes"]
    resource["study_guide"] = payload["study_guide"]
    resource["guided_segments"] = payload["guided_segments"]
    resource["is_structured"] = True
    resource["structure_meta"] = payload["structure_meta"]

    if result.academic_intro:
        resource["academic_intro"] = result.academic_intro
        # 原始简介是乱码 / 广告 / 纯英文时，用学术导读顶上。
        if _description_unusable(resource):
            resource["ai_context"] = result.academic_intro

    if result.captions:
        resource["captions"] = result.captions

    meta = resource.get("meta")
    if not isinstance(meta, dict):
        meta = {}
        resource["meta"] = meta
    meta["evidence_tier"] = result.evidence_tier
    meta["evidence_reason"] = result.evidence_reason


def _description_unusable(resource: dict[str, Any]) -> bool:
    """判断原始简介是不是「不可用」。

    乱码、纯广告链接、太短、纯英文——这些时候用学术导读替换。
    """
    text = str(resource.get("ai_context") or "").strip()
    if len(text) < 30:
        return True
    if re.search(r"(https?://|加群|QQ群|扫码|关注|公众号|转载)", text, re.IGNORECASE):
        return True
    # 中文字符占比低于 20% → 大概率是纯英文。
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
    return chinese / max(1, len(text)) < 0.2


async def structure_hub(
    *,
    hub_path: Path | None = None,
    limit: int = 0,
    force: bool = False,
    concurrency: int = DEFAULT_CONCURRENCY,
    save_every: int = DEFAULT_SAVE_EVERY,
    only_ids: list[str] | None = None,
    log: Any = None,
) -> StructureStats:
    """给中台里的视频批量装配自学框架。

    参数：

    * ``limit`` —— 最多处理多少条（``0`` = 不限）；
    * ``force`` —— 已经装配过（``is_structured: true``）的**重装**；
    * ``concurrency`` —— 并发请求数；
    * ``save_every`` —— 每完成多少条落盘一次；
    * ``only_ids`` —— 只处理这些资源 id。

    返回统计。
    """
    emit = log or (lambda message: print(message))

    target = hub_path or GLOBAL_HUB_PATH
    raw = load_hub_raw(target)

    # ── 选出待处理的资源 ──
    pending: list[dict[str, Any]] = []
    for _category, resource in _iter_resources(raw):
        if only_ids and resource.get("id") not in only_ids:
            continue
        if resource.get("resource_type") != "video":
            continue
        if not force and resource.get("is_structured"):
            continue
        if resource_duration(resource) <= 0:
            continue
        pending.append(resource)

    if limit and limit > 0:
        pending = pending[:limit]

    stats = StructureStats(total=len(pending))
    if not pending:
        emit("没有待装配的资源。")
        return stats

    emit(f"待装配 {len(pending)} 条（并发 {concurrency}）…")

    # ── 证据提取（并发，但比模型调用便宜得多，可以放开一点）──
    evidence_by_id: dict[str, Evidence] = {}

    async def _resolve_evidence(resource: dict[str, Any]) -> Evidence:
        platform, video_id = infer_platform_and_id(resource)
        return await extract_evidence_async(
            platform,
            video_id,
            duration=resource_duration(resource),
            description=resource_description(resource),
        )

    evidence_semaphore = asyncio.Semaphore(max(2, concurrency * 2))

    async def _with_evidence(resource: dict[str, Any]) -> Evidence:
        async with evidence_semaphore:
            return await _resolve_evidence(resource)

    evidence_list = await asyncio.gather(
        *(_with_evidence(resource) for resource in pending),
        return_exceptions=True,
    )
    for resource, evidence in zip(pending, evidence_list):
        if isinstance(evidence, Exception):
            evidence_by_id[resource["id"]] = Evidence(
                duration=resource_duration(resource),
                tier=3,
                tier_reason="Tier 3（证据提取异常），按总时长推演",
                anchors=[],
            )
        else:
            evidence_by_id[resource["id"]] = evidence

    tier_counts: dict[str, int] = {}
    for evidence in evidence_by_id.values():
        key = f"tier_{evidence.tier}"
        tier_counts[key] = tier_counts.get(key, 0) + 1
    stats.tier_counts = tier_counts
    emit(f"证据等级分布：{tier_counts}")

    # ── 模型装配（限流并发 + 增量落盘）──
    semaphore = asyncio.Semaphore(max(1, concurrency))
    save_lock = asyncio.Lock()
    completed_since_save = 0

    async def _one(resource: dict[str, Any]) -> tuple[dict[str, Any], StructureResult | None, str]:
        async with semaphore:
            evidence = evidence_by_id[resource["id"]]
            try:
                result = await structure_resource(resource, evidence=evidence)
                return resource, result, ""
            except Exception as exc:  # noqa: BLE001 — 单条失败不中断整批
                return resource, None, str(exc)

    tasks = [asyncio.create_task(_one(resource)) for resource in pending]

    for future in asyncio.as_completed(tasks):
        resource, result, error = await future
        stats.processed += 1

        if result is None:
            stats.failed += 1
            stats.failures.append(f"{resource.get('id')}：{error}")
            emit(f"  ✗ {resource.get('title')} —— {error}")
        else:
            _apply_structure(resource, result)
            stats.succeeded += 1
            emit(
                f"  ✓ {resource.get('title')} "
                f"[T{result.evidence_tier}] "
                f"{len(result.interactive_nodes)} 节点 / "
                f"{len(result.guided_segments)} 段导读"
            )

        completed_since_save += 1
        if completed_since_save >= save_every:
            completed_since_save = 0
            async with save_lock:
                save_hub_raw(target, raw)
                emit(f"  · 已增量落盘（{stats.processed}/{stats.total}）")

    save_hub_raw(target, raw)
    emit(
        f"装配完成：成功 {stats.succeeded}，失败 {stats.failed}，共 {stats.total}。"
    )
    return stats


__all__ = [
    "DEFAULT_CONCURRENCY",
    "DEFAULT_SAVE_EVERY",
    "GLOBAL_HUB_PATH",
    "StructureResult",
    "StructureStats",
    "StructurerError",
    "build_anchor_table",
    "build_prompt",
    "infer_platform_and_id",
    "load_hub_raw",
    "parse_structure",
    "resource_description",
    "resource_duration",
    "save_hub_raw",
    "structure_hub",
    "structure_resource",
]
