"""
自定义教材导入
==============

用户手上有课程库里没有的教材——一段古文、一份讲义、一本书的扫描稿。
本模块把它变成**结构化课程**：切章、切节、写正文，然后落盘。

切分策略
--------

不做语义理解，只做**结构探测**——因为长文本的格式通常是可预测的：

1. **Markdown 标题** —— ``#`` / ``##`` 是最可靠的章节信号；
2. **中文数字标题** —— 「第一章」「一、」「第 1 节」；
3. **空行分段** —— 前面都没有时，按段落均分成若干节。

先用 LLM 会更准，但那会让「粘贴一段文本」变成一次等待十几秒的请求。
导入必须是**即时的**：先按结构切成节落盘，用户进课程页后 AI 再逐节
讲解——那才是需要模型的地方。
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

#: 一节最少多少字。太碎的节没有阅读价值。
MIN_SECTION_CHARS = 120

#: 一节最多多少字。超长的节会被再切一刀。
MAX_SECTION_CHARS = 4_000

#: 目标节数——没有结构信号时按这个数均分。
TARGET_SECTIONS = 8

#: Markdown 标题。
_MD_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$")

#: 中文数字标题：「第一章」「第 3 节」「一、」「（二）」「十二、」
#:
#: 注意 ``第X章`` 后面**必须**是空白或行尾——否则「第三章的内容也很长」
#: 这种普通句子会被误判成标题。
_CN_HEADING_RE = re.compile(
    r"^\s*("
    r"第\s*[一二三四五六七八九十百千0-9]+\s*[章节讲篇回课](?=\s|$)"
    r"|[一二三四五六七八九十百]+\s*[、.．]"
    r"|[（(]\s*[一二三四五六七八九十]+\s*[)）]"
    r")\s*(.{0,60})$"
)

#: 统一标题判定——Markdown 标题与中文数字标题都算。
#:
#: 混合使用两种标题风格是很常见的（``# 一、缘起``），因此必须**逐行**
#: 判定，而不是先按一种风格切一遍再试另一种。
def _is_heading(line: str) -> bool:
    """这一行是不是标题行。"""
    if _MD_HEADING_RE.match(line):
        return True
    return _CN_HEADING_RE.match(line) is not None


def split_into_sections(text: str) -> list[tuple[str, str]]:
    """把长文本切成 ``(标题, 正文)`` 列表。

    返回的列表**至少有一项**——空文本会得到一个空节，交给上层拒绝。
    """
    body = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not body:
        return []

    lines = body.split("\n")

    # ── 探测结构 ──
    # 逐行判定标题——Markdown 与中文数字两种风格混用是常态。
    headed = _split_by_pattern(lines, _is_heading)
    if headed and len(headed) > 1:
        return _normalize(headed, explicit=True)

    # ── 兜底：按空行分段，再合并到目标节数 ──
    return _normalize(_split_by_paragraphs(body), explicit=False)


def _split_by_pattern(
    lines: list[str],
    is_heading,
) -> list[tuple[str, str, bool]]:
    """按「标题行」切分。

    第三项标记这一节是否**自带显式标题**——显式标题的节即使内容短
    也独立保留（它本身就是作者的切分意图）。
    """
    sections: list[tuple[str, str, bool]] = []
    current_title = ""
    current_body: list[str] = []
    has_title = False

    for line in lines:
        if is_heading(line):
            if current_body and "".join(current_body).strip():
                sections.append(
                    (current_title, "\n".join(current_body).strip(), has_title)
                )
            current_title = line.strip()
            current_body = []
            has_title = True
        else:
            current_body.append(line)

    if current_body and "".join(current_body).strip():
        sections.append((current_title, "\n".join(current_body).strip(), has_title))

    return sections


def _split_by_paragraphs(body: str) -> list[tuple[str, str, bool]]:
    """按空行分段，再合并成大致均匀的几节。"""
    paragraphs = [
        chunk.strip() for chunk in re.split(r"\n\s*\n", body) if chunk.strip()
    ]
    if not paragraphs:
        return []

    if len(paragraphs) <= TARGET_SECTIONS:
        return [
            (f"第 {index + 1} 节", paragraph, False)
            for index, paragraph in enumerate(paragraphs)
        ]

    # 段落太多——按目标节数分桶，每桶的标题取该桶第一段的开头。
    buckets: list[list[str]] = [[] for _ in range(TARGET_SECTIONS)]
    size = len(paragraphs) / TARGET_SECTIONS
    for index, paragraph in enumerate(paragraphs):
        bucket = min(TARGET_SECTIONS - 1, int(index / size))
        buckets[bucket].append(paragraph)

    out: list[tuple[str, str, bool]] = []
    for index, bucket in enumerate(buckets):
        if not bucket:
            continue
        merged = "\n\n".join(bucket)
        title = _first_sentence(bucket[0])[:30] or f"第 {index + 1} 节"
        out.append((title, merged, False))
    return out


def _first_sentence(text: str) -> str:
    """取第一句（不超过 40 字）。"""
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    match = re.split(r"[。！？!?\n]", cleaned)
    return (match[0] if match else cleaned)[:40]


def _normalize(
    sections: list[tuple[str, str, bool]],
    *,
    explicit: bool,
) -> list[tuple[str, str]]:
    """清理标题、合并过短的节、切分过长的节。

    ``explicit=True`` 表示这些节来自显式的标题行——**带标题的节一律
    独立保留**，哪怕内容很短。作者已经切过了，我们不该替他再合并。
    """
    cleaned: list[tuple[str, str, bool]] = []

    for raw_title, raw_body, has_title in sections:
        title = _clean_title(raw_title)
        body = raw_body.strip()
        if not body:
            continue
        cleaned.append((title, body, has_title))

    # 合并过短的节到前一段——只合并**没有显式标题**的节。
    merged: list[tuple[str, str, bool]] = []
    for title, body, has_title in cleaned:
        if merged and len(body) < MIN_SECTION_CHARS and not has_title:
            previous_title, previous_body, previous_flag = merged[-1]
            merged[-1] = (
                previous_title,
                f"{previous_body}\n\n{body}",
                previous_flag,
            )
        else:
            merged.append((title, body, has_title))

    # 切分过长的节。
    out: list[tuple[str, str]] = []
    for title, body, _has_title in merged:
        if len(body) <= MAX_SECTION_CHARS:
            out.append((title, body))
            continue
        chunks = _split_long(body)
        for index, chunk in enumerate(chunks):
            suffix = "" if index == 0 else f"（续 {index}）"
            out.append((f"{title}{suffix}", chunk))

    # 补默认标题。
    return [
        (title or f"第 {index + 1} 节", body)
        for index, (title, body) in enumerate(out)
    ]


def _clean_title(raw: str) -> str:
    """把标题行洗成纯标题文本。"""
    text = str(raw or "").strip()
    match = _MD_HEADING_RE.match(text)
    if match:
        return match.group(2).strip()
    match = _CN_HEADING_RE.match(text)
    if match:
        # group(1) 是「第 X 章」这类序号，group(2) 是标题正文。
        # 两者拼起来比只取其一更完整。
        marker = match.group(1).strip()
        title = match.group(2).strip()
        return f"{marker} {title}".strip() if title else marker
    return text[:60]


def _split_long(body: str) -> list[str]:
    """把超长的正文按段落切成几块。"""
    paragraphs = [
        chunk.strip() for chunk in re.split(r"\n\s*\n", body) if chunk.strip()
    ]
    if len(paragraphs) <= 1:
        # 没有段落边界——按句子硬切。
        sentences = re.split(r"(?<=[。！？])", body)
        chunks: list[str] = []
        current = ""
        for sentence in sentences:
            if len(current) + len(sentence) > MAX_SECTION_CHARS and current:
                chunks.append(current)
                current = ""
            current += sentence
        if current.strip():
            chunks.append(current)
        return chunks

    chunks = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) > MAX_SECTION_CHARS and current:
            chunks.append(current)
            current = ""
        current += ("\n\n" if current else "") + paragraph
    if current.strip():
        chunks.append(current)
    return chunks


def build_course_payload(
    *,
    title: str,
    text: str,
    course_id: str = "",
) -> dict[str, Any]:
    """把长文本组装成课程的四段 JSON 结构。

    结构与磁盘上的课程文件完全一致（见
    :mod:`app.services.course_service`），因此导入出来的教材能像任何
    其它教材一样被打开、精读、提问。
    """
    sections = split_into_sections(text)
    if not sections:
        raise ValueError("这段文本没有可解析的内容。")

    resolved_id = course_id or _slugify(f"{title}\n{text}")

    chapter_id = f"ch_{resolved_id}"
    pages: list[dict[str, Any]] = []
    page_ids: list[str] = []

    for index, (section_title, section_body) in enumerate(sections):
        page_id = f"pg_{resolved_id}_{index + 1}"
        page_ids.append(page_id)
        pages.append(
            {
                "id": page_id,
                "book_id": resolved_id,
                "chapter_id": chapter_id,
                "title": section_title or f"第 {index + 1} 节",
                "learning_objectives": [],
                "content_type": "theory",
                "status": "ready",
                "order": index,
                "blocks": [
                    {
                        "id": f"blk_{resolved_id}_{index + 1}",
                        "type": "text",
                        "status": "ready",
                        "title": section_title or f"第 {index + 1} 节",
                        "params": {},
                        "payload": {"body": section_body},
                        "source_anchors": [],
                        "metadata": {},
                        "error": "",
                        "created_at": 0.0,
                        "updated_at": 0.0,
                    }
                ],
                "links": [],
                "parent_page_id": "",
                "error": "",
                "created_at": 0.0,
                "updated_at": 0.0,
            }
        )

    summary = sections[0][1][:200] if sections else ""

    return {
        "book": {
            "id": resolved_id,
            "revision": 1,
            "title": title or "未命名教材",
            "description": summary,
            "status": "ready",
            "proposal": None,
            "knowledge_bases": [],
            "language": "zh",
            "depth": "standard",
            "page_count": len(pages),
            "chapter_count": 1,
            "created_at": 0.0,
            "updated_at": 0.0,
            "metadata": {"tags": ["导入"], "category": "自定义", "level": ""},
        },
        "spine": {
            "book_id": resolved_id,
            "version": 1,
            "updated_at": 0.0,
            "exploration_summary": summary,
            "concept_graph": {"nodes": [], "edges": []},
            "chapters": [
                {
                    "id": chapter_id,
                    "title": title or "全部内容",
                    "learning_objectives": [],
                    "content_type": "theory",
                    "source_anchors": [],
                    "prerequisites": [],
                    "page_ids": page_ids,
                    "summary": summary,
                    "order": 0,
                }
            ],
        },
        "pages": pages,
        "progress": {
            "book_id": resolved_id,
            "current_page_id": page_ids[0] if page_ids else "",
            "visited_page_ids": [],
            "bookmarked_page_ids": [],
            "quiz_attempts": [],
            "weak_chapters": [],
            "score": 0,
            "updated_at": 0.0,
        },
    }


def _slugify(text: str) -> str:
    """把标题派生成合法的课程 id。

    中文标题派不出 ASCII slug——那就用内容的哈希做后缀，保证 id
    唯一且可读。比 ``imported_material`` 这种到处撞车的名字强。
    """
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", str(text or "").strip()).strip("-")
    if slug:
        return slug[:48]

    # 纯中文（或其它非 ASCII）标题——用内容哈希兜底。
    digest = hashlib.sha1(str(text or "").encode("utf-8")).hexdigest()[:8]
    return f"imported-{digest}"


__all__ = [
    "MAX_SECTION_CHARS",
    "MIN_SECTION_CHARS",
    "TARGET_SECTIONS",
    "build_course_payload",
    "split_into_sections",
]
