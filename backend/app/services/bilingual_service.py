"""
中英对照
========

英文教材在中文平台上的核心问题是：**用户读不懂**。但直接替换成中文
又会丢掉原文——原文才是权威表述，术语的精确含义只在原文里成立。

所以本服务做的是**对照**：原文保持不变（英文在上），下方附一份
中文译文（中文在下），两种字体明确区分。

流程
----

1. :func:`detect_language` 判断一段文本的主体语言；
2. :func:`is_english_corpus` 判断它是否属于「需要对照」的类型；
3. :func:`translate_text` 调真实模型翻译；
4. 译文写回 block 的 ``payload.translation`` 字段，随课程一起落盘。

为什么要**预处理**而不是前端实时调
--------------------------------

前端实时翻译意味着每翻一页就发一次模型请求——延迟以秒计，而且
同一份译文会被反复翻译（浪费 token 与费用）。

预处理把成本压到「导入时一次」，之后**零延迟**。译文随课程 JSON
落盘，跟着课程走，刷新、切课、重启都不需要重新翻译。

缓存键
------

译文按「正文哈希」缓存。正文变了就重新翻译，没变就用缓存——
这样重新导入同一门课不会白白烧掉一批模型调用。

字体分工
--------

英文用**无衬线**（sans），中文用**宋体**（serif）。理由不是审美，
是**字形密度**：无衬线的拉丁字母在小字号下的字距更均匀，长段落更
耐读；而宋体的中文笔画在暖色背景上更清晰。两种字体混排时，
读者能靠字形瞬间分辨哪行是原文、哪行是译文——这是对照排版的关键。
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

#: 判断「纯英文语料」时，至少需要多少个拉丁字母。
#:
#: 低于这个数就没有足够证据判断语言——一段短标题不该触发翻译。
MIN_LATIN_CHARS = 120

#: 中文字符占比低于这个值，视为「以英文为主」。
MIN_CJK_RATIO_FOR_CHINESE = 0.08

#: 单次翻译的最大字符数。超了按段落切分。
MAX_CHUNK_CHARS = 2_400

#: 译文缓存文件（按课程存）。
TRANSLATION_DIR = Path(__file__).resolve().parents[2] / "data" / "translations"

#: 翻译用的系统提示词。
_TRANSLATE_SYSTEM = """你是一位严谨的学术译者，正在为中文读者翻译一门公开课程的外文教材。

要求：
- 忠实准确，不增不减，不要漏译或概括。
- 保留原文的段落结构、标题层级、列表与代码块原样（代码块**不要翻译**，
  只保留原样）。
- 专业术语采用领域内公认的译法；首次出现的关键术语可在括号内附原文。
- 公式、符号、人名地名年份等保持原样，不要改写。
- 只输出译文本身，不要加任何解释、前言或markdown 代码围栏。
- 使用简体中文。"""


# ── 语言检测 ───────────────────────────────────────────────────────────


def _count_cjk(text: str) -> int:
    """统计中日韩统一表意文字的数量。"""
    return sum(1 for ch in text if "一" <= ch <= "鿿")


def _count_latin(text: str) -> int:
    """统计拉丁字母的数量。"""
    return sum(1 for ch in text if ("a" <= ch.lower() <= "z"))


def detect_language(text: str) -> str:
    """判断一段文本的主体语言。

    返回 ``"zh"`` / ``"en"`` / ``"unknown"``。

    判据是**字符占比**而非词数：中文没有词间空格，按词数统计会
    严重失真；字符占比对两种语言都公平。
    """
    sample = str(text or "")[:5_000]
    if not sample.strip():
        return "unknown"

    cjk = _count_cjk(sample)
    latin = _count_latin(sample)
    total = cjk + latin
    if total < 40:
        return "unknown"

    if cjk / total >= MIN_CJK_RATIO_FOR_CHINESE:
        return "zh"
    if latin / total >= 0.85:
        return "en"
    return "unknown"


def is_english_corpus(text: str) -> bool:
    """这段文字是否需要中英对照。

    只有**明确的英文**才需要——中英混排的段落翻译过来只会更乱。
    """
    sample = str(text or "")[:5_000]
    if _count_latin(sample) < MIN_LATIN_CHARS:
        return False
    return detect_language(sample) == "en"


# ── 缓存 ───────────────────────────────────────────────────────────────


def _cache_key(text: str) -> str:
    """正文的哈希——正文变了缓存自然失效。"""
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return digest[:24]


def _cache_path(course_id: str) -> Path:
    return TRANSLATION_DIR / f"{course_id}.json"


def load_cache(course_id: str) -> dict[str, str]:
    """读出某门课的译文缓存。"""
    path = _cache_path(course_id)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def save_cache(course_id: str, cache: dict[str, str]) -> None:
    """写回译文缓存。"""
    TRANSLATION_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(course_id).write_text(
        json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── 翻译 ───────────────────────────────────────────────────────────────


def _split_chunks(text: str) -> list[str]:
    """按段落把长文本切成翻译单元。

    按段落而不是按固定长度硬切——切断一个句子会让译文丢上下文。
    """
    paragraphs = str(text or "").split("\n\n")
    chunks: list[str] = []
    buffer: list[str] = []
    size = 0

    for paragraph in paragraphs:
        # 超长单段（罕见）——单独成块，交给模型自己处理。
        if len(paragraph) > MAX_CHUNK_CHARS:
            if buffer:
                chunks.append("\n\n".join(buffer))
                buffer, size = [], 0
            chunks.append(paragraph)
            continue

        if size + len(paragraph) > MAX_CHUNK_CHARS and buffer:
            chunks.append("\n\n".join(buffer))
            buffer, size = [], 0

        buffer.append(paragraph)
        size += len(paragraph) + 2

    if buffer:
        chunks.append("\n\n".join(buffer))
    return chunks


async def translate_text(text: str) -> str:
    """翻译一段英文文本。

    失败时**不返回假译文**——抛错，让调用方如实报告「翻译失败」。
    """
    from app.services.llm_factory import complete

    source = str(text or "").strip()
    if not source:
        return ""

    chunks = _split_chunks(source)
    translated: list[str] = []

    for chunk in chunks:
        reply = await complete(
            prompt=chunk,
            system_prompt=_TRANSLATE_SYSTEM,
            max_tokens=4_000,
            temperature=0.2,
        )
        translated.append(str(reply or "").strip())

    return "\n\n".join(part for part in translated if part)


# ── 课程级处理 ─────────────────────────────────────────────────────────


def course_needs_translation(payload: dict[str, Any]) -> bool:
    """这门课是否需要中英对照。

    只要有**一个**正文块是纯英文，就需要。
    """
    for page in payload.get("pages", []):
        for block in page.get("blocks", []):
            block_payload = block.get("payload") or {}
            body = block_payload.get("body")
            if isinstance(body, str) and is_english_corpus(body):
                return True
    return False


def course_block_texts(payload: dict[str, Any]) -> list[str]:
    """列出课程里所有需要翻译的正文。"""
    out: list[str] = []
    for page in payload.get("pages", []):
        for block in page.get("blocks", []):
            block_payload = block.get("payload") or {}
            body = block_payload.get("body")
            if isinstance(body, str) and is_english_corpus(body):
                out.append(body)
    return out


async def translate_course(
    payload: dict[str, Any],
    *,
    course_id: str = "",
    use_cache: bool = True,
    progress: Any = None,
) -> tuple[dict[str, Any], int, int]:
    """给整门课生成中英对照。

    返回 ``(新 payload, 翻译块数, 命中缓存块数)``。

    译文写进每个 block 的 ``payload.translation`` 字段——前端据此
    渲染「英文在上、中文在下」的双语排版。
    """
    cache = load_cache(course_id) if use_cache else {}
    dirty = False
    translated_count = 0
    cached_count = 0

    for page_index, page in enumerate(payload.get("pages", [])):
        for block_index, block in enumerate(page.get("blocks", [])):
            block_payload = block.get("payload")
            if not isinstance(block_payload, dict):
                continue

            body = block_payload.get("body")
            if not isinstance(body, str) or not is_english_corpus(body):
                continue

            # 已经翻译过且原文没变——跳过。
            existing = block_payload.get("translation")
            if isinstance(existing, str) and existing.strip():
                key = _cache_key(body)
                if cache.get(key) == existing:
                    cached_count += 1
                    continue

            key = _cache_key(body)
            cached = cache.get(key)
            if cached:
                block_payload["translation"] = cached
                cached_count += 1
                continue

            if progress is not None:
                try:
                    progress(
                        f"翻译 {page_index + 1}/{len(payload.get('pages', []))} "
                        f"页 · 第 {block_index + 1} 块"
                    )
                except Exception:  # pragma: no cover - 回调不该阻断翻译
                    pass

            try:
                translated = await translate_text(body)
            except Exception as exc:
                logger.warning("翻译失败（%s）：%s", course_id, exc)
                # 这一块不写译文——前端会退回纯英文显示，而不是显示假译文。
                continue

            if translated.strip():
                block_payload["translation"] = translated
                cache[key] = translated
                translated_count += 1
                dirty = True

    if dirty and use_cache and course_id:
        save_cache(course_id, cache)

    return payload, translated_count, cached_count


__all__ = [
    "MIN_CJK_RATIO_FOR_CHINESE",
    "MIN_LATIN_CHARS",
    "TRANSLATION_DIR",
    "course_block_texts",
    "course_needs_translation",
    "detect_language",
    "is_english_corpus",
    "load_cache",
    "save_cache",
    "translate_course",
    "translate_text",
]
