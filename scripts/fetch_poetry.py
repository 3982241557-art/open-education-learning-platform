#!/usr/bin/env python3
"""
古诗词数据拉取与转换脚本
==========================

从开源库 `chinese-poetry/chinese-poetry` 静默下载经典诗词数据集，转换成
本平台的标准课程结构（Book / Spine / Pages / Blocks），落盘到
``backend/data/courses/``。

为什么需要这个脚本
------------------

平台的语料库设计成「**内容重储备**」：往 ``backend/data/courses/`` 里丢
文件就能挂载，不需要改任何后端调度代码。但手工把几百首词写成 JSON 是
不可行的——本脚本把这条路径自动化。

数据来源
--------

``chinese-poetry`` 是 GitHub 上最大的公开中文诗词数据集，采用
CC BY 4.0 许可。使用其内容时保留出处标注。

默认拉取《宋词三百首》（280 首，83 位作者）。``ci.song.*.json`` 系列是
全量宋词（约 21000 首），可用 ``--source ci`` 切换。

用法
----

::

    # 默认：《宋词三百首》
    python scripts/fetch_poetry.py

    # 拉取全量宋词的前 N 个分片
    python scripts/fetch_poetry.py --source ci --shards 2

    # 只验证，不写文件
    python scripts/fetch_poetry.py --dry-run

    # 换一份数据源
    python scripts/fetch_poetry.py --url <raw-url> --book-id my_poetry

写出的文件会**立即被平台自动挂载**——不需要重启后端，也不需要注册。
"""

from __future__ import annotations

import argparse
from collections import Counter, OrderedDict
import json
from pathlib import Path
import sys
import time
from typing import Any

try:
    import requests
except ImportError:  # pragma: no cover - 环境问题，给出可执行的提示
    sys.exit(
        "缺少 requests。请先安装：\n"
        "  backend/.venv/bin/pip install requests jsonschema"
    )

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover - 校验是可选的
    Draft7Validator = None  # type: ignore[assignment]


# ── 常量 ───────────────────────────────────────────────────────────────

#: 数据源根地址（``宋词`` 目录在 GitHub 上是 URL 编码的中文路径）。
RAW_BASE = (
    "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master"
    "/%E5%AE%8B%E8%AF%8D"
)

#: 数据源清单。
#:
#: 每个数据源声明「可用的文件」与「对应的书名 / 副标题」。
SOURCES: dict[str, dict[str, Any]] = {
    "song300": {
        "label": "宋词三百首",
        "files": ["%E5%AE%8B%E8%AF%8D%E4%B8%89%E7%99%BE%E9%A6%96.json"],
        "title": "宋词经典赏析",
        "description": "精选宋词三百首，按作者成章。逐首品读词牌、正文与意境。",
        "tags": ["宋词", "古典文学", "诗词"],
    },
    "ci": {
        "label": "全量宋词",
        #: ``ci.song.<n>.json`` 是全量宋词的分片，每片 1000 首。
        "files": [
            "ci.song.0.json",
            "ci.song.1000.json",
            "ci.song.2000.json",
            "ci.song.3000.json",
            "ci.song.4000.json",
            "ci.song.5000.json",
        ],
        "title": "宋词全览",
        "description": "全量宋词选录，按作者成章。适合系统性地通读两宋词坛。",
        "tags": ["宋词", "古典文学", "诗词"],
    },
}

#: 落盘目录（相对仓库根）。
COURSES_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "courses"

#: 结构模板路径，用于生成后校验。
SCHEMA_PATH = COURSES_DIR / "template-schema.json"

#: 请求超时（秒）。
TIMEOUT = 40

#: 重试次数。
RETRIES = 3

#: 请求间隔（秒）——对开源仓库友好一点。
REQUEST_DELAY = 0.6


# ── 抓取 ───────────────────────────────────────────────────────────────


def fetch_json(url: str) -> list[dict[str, Any]]:
    """静默下载并解析一个 JSON 文件。

    失败时抛 :class:`RuntimeError`，附带足够定位问题的信息。
    """
    last_error: Exception | None = None

    for attempt in range(1, RETRIES + 1):
        try:
            response = requests.get(
                url,
                timeout=TIMEOUT,
                headers={
                    "User-Agent": "SEEK-Learning-Platform/1.0 (course data fetcher)",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, list):
                raise RuntimeError(f"期望数组，实际是 {type(data).__name__}")
            return data
        except Exception as exc:  # 网络 / 解析 / HTTP 错误
            last_error = exc
            if attempt < RETRIES:
                time.sleep(1.2 * attempt)
                continue
            break

    raise RuntimeError(f"下载失败：{url}\n  原因：{last_error}")


def load_poems(source: str, shard_limit: int | None, url_override: str | None) -> list[dict[str, Any]]:
    """按数据源拉取全部诗词条目。"""
    if url_override:
        return fetch_json(url_override)

    config = SOURCES[source]
    files = list(config["files"])
    if shard_limit is not None:
        files = files[:shard_limit]

    poems: list[dict[str, Any]] = []
    for name in files:
        url = f"{RAW_BASE}/{name}"
        batch = fetch_json(url)
        poems.extend(batch)
        print(f"  ✓ {name}  {len(batch):>5} 首")

    return poems


# ── 清洗 ───────────────────────────────────────────────────────────────


def clean_text(text: str) -> str:
    """规整一行古文：去掉首尾空白与全角空格，压掉内部连续空白。"""
    return " ".join(str(text or "").replace("　", " ").split())


def normalize_poem(raw: dict[str, Any]) -> dict[str, str] | None:
    """把一条原始记录规整成规范结构。

    返回 ``None`` 表示这条数据不可用（作者或正文为空）——静默丢弃，
    但计数会报告，便于发现上游数据变化。
    """
    author = clean_text(raw.get("author"))
    paragraphs = [
        clean_text(line)
        for line in (raw.get("paragraphs") or [])
        if clean_text(line)
    ]
    if not author or not paragraphs:
        return None

    title = clean_text(raw.get("rhythmic")) or "无题"
    return {
        "author": author,
        "title": title,
        "paragraphs": paragraphs,
        "tags": [clean_text(tag) for tag in (raw.get("tags") or []) if clean_text(tag)],
    }


def group_by_author(poems: list[dict[str, str]]) -> "OrderedDict[str, list[dict[str, str]]]":
    """按作者分组。

    作者按**作品数降序**排列——高产作者（苏轼、辛弃疾、周邦彦…）排在
    前面，学习者打开课程先看到最有代表性的那批。

    同名作者按原样保留，不做合并——「无名氏」这类署名本身就是信息。
    """
    counts = Counter(poem["author"] for poem in poems)
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))

    grouped: "OrderedDict[str, list[dict[str, str]]]" = OrderedDict()
    for author, _count in ordered:
        grouped[author] = [poem for poem in poems if poem["author"] == author]
    return grouped


# ── 转换 ───────────────────────────────────────────────────────────────


def build_course(
    poems: list[dict[str, str]],
    *,
    book_id: str,
    title: str,
    description: str,
    tags: list[str],
    timestamp: float,
) -> dict[str, Any]:
    """把规整后的诗词组装成平台的标准课程结构。"""
    grouped = group_by_author(poems)

    chapters: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    page_order = 0

    for chapter_order, (author, author_poems) in enumerate(grouped.items()):
        chapter_id = f"ch_{book_id}_{chapter_order + 1:03d}"
        page_ids: list[str] = []

        for poem_order, poem in enumerate(author_poems):
            page_id = f"pg_{book_id}_{page_order + 1:04d}"
            page_ids.append(page_id)

            body = "\n".join(poem["paragraphs"])

            pages.append(
                {
                    "id": page_id,
                    "book_id": book_id,
                    "chapter_id": chapter_id,
                    "title": f"{poem['title']}·{author}",
                    "learning_objectives": [
                        f"读懂《{poem['title']}》的正文大意",
                        f"体会{author}在《{poem['title']}》中的表达方式",
                    ],
                    "content_type": "theory",
                    "status": "ready",
                    "order": page_order,
                    "blocks": [
                        {
                            "id": f"blk_{page_id}_meta",
                            "type": "text",
                            "status": "ready",
                            "title": "题目与作者",
                            "params": {},
                            "payload": {
                                "format": "markdown",
                                "role": "metadata",
                                "body": (
                                    f"**题目**：{poem['title']}\n\n"
                                    f"**作者**：{author}\n\n"
                                    f"**词牌**：{poem['title']}"
                                ),
                            },
                            "source_anchors": [],
                            "metadata": {"author": author, "rhythmic": poem["title"]},
                            "error": "",
                            "created_at": timestamp,
                            "updated_at": timestamp,
                        },
                        {
                            "id": f"blk_{page_id}_body",
                            "type": "text",
                            "status": "ready",
                            "title": "正文",
                            "params": {},
                            "payload": {
                                "format": "markdown",
                                "role": "body",
                                "body": body,
                            },
                            "source_anchors": [],
                            "metadata": {
                                "author": author,
                                "rhythmic": poem["title"],
                                "line_count": len(poem["paragraphs"]),
                            },
                            "error": "",
                            "created_at": timestamp,
                            "updated_at": timestamp,
                        },
                    ],
                    "links": [],
                    "parent_page_id": "",
                    "error": "",
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
            )
            page_order += 1

        chapters.append(
            {
                "id": chapter_id,
                "title": author,
                "learning_objectives": [
                    f"通读{author}在本课程中的作品",
                    f"感受{author}的题材偏好与语言风格",
                ],
                "content_type": "theory",
                "source_anchors": [],
                "prerequisites": [],
                "page_ids": page_ids,
                "summary": f"{author}——本课程收录 {len(page_ids)} 首。",
                "order": chapter_order,
            }
        )

    return {
        "book": {
            "id": book_id,
            "revision": 1,
            "title": title,
            "description": description,
            "status": "ready",
            "proposal": None,
            "knowledge_bases": ["chinese-poetry"],
            "language": "zh",
            "depth": "standard",
            "page_count": len(pages),
            "chapter_count": len(chapters),
            "created_at": timestamp,
            "updated_at": timestamp,
            "metadata": {
                "tags": tags,
                "category": "古典文学",
                "level": "进阶",
                "difficulty": "进阶",
                "source": "chinese-poetry/chinese-poetry",
                "license": "CC BY 4.0",
                "source_url": RAW_BASE,
            },
            "kb_fingerprints": {},
            "kb_document_fingerprints": {},
            "stale_page_ids": [],
            "stale_detected_at": 0.0,
        },
        "spine": {
            "book_id": book_id,
            "version": 1,
            "updated_at": timestamp,
            "exploration_summary": (
                f"本课程收录 {len(pages)} 首宋词，分为 {len(chapters)} 位作者。"
                "按作者成章，每位作者一章，章内逐首品读。建议先读高产作者的章节，"
                "建立对两宋词风整体格局的把握，再回头读风格独特的小家。"
            ),
            "concept_graph": {"nodes": [], "edges": []},
            "chapters": chapters,
        },
        "pages": pages,
        "progress": {
            "book_id": book_id,
            "current_page_id": pages[0]["id"] if pages else "",
            "visited_page_ids": [],
            "bookmarked_page_ids": [],
            "quiz_attempts": [],
            "weak_chapters": [],
            "score": 0,
            "updated_at": timestamp,
        },
    }


# ── 校验 ───────────────────────────────────────────────────────────────


def validate_against_schema(payload: dict[str, Any]) -> list[str]:
    """用 ``template-schema.json`` 校验生成的数据。

    返回错误列表；空列表表示通过。没有 ``jsonschema`` 时退化为
    结构性检查（必需字段 / 枚举值）。
    """
    if not SCHEMA_PATH.exists():
        return [f"结构模板不存在：{SCHEMA_PATH}"]

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))

    if Draft7Validator is not None:
        validator = Draft7Validator(schema)
        errors = []
        for error in sorted(validator.iter_errors(payload), key=lambda e: list(e.path)):
            location = "/".join(str(part) for part in error.path) or "(root)"
            errors.append(f"{location}: {error.message}")
        return errors

    return _structural_check(payload)


def _structural_check(payload: dict[str, Any]) -> list[str]:
    """没有 jsonschema 时的兜底检查。"""
    errors: list[str] = []
    for section in ("book", "spine", "pages", "progress"):
        if section not in payload:
            errors.append(f"缺少顶层段：{section}")

    book = payload.get("book", {})
    for key in ("id", "title", "status"):
        if not book.get(key):
            errors.append(f"book.{key} 缺失或为空")
    if book.get("status") not in {
        "draft", "spine_ready", "compiling", "paused", "ready", "error", "archived"
    }:
        errors.append(f"book.status 取值非法：{book.get('status')!r}")

    page_ids = {page.get("id") for page in payload.get("pages", [])}
    for chapter in payload.get("spine", {}).get("chapters", []):
        for page_id in chapter.get("page_ids", []):
            if page_id not in page_ids:
                errors.append(f"章节 {chapter.get('id')} 引用了不存在的页 {page_id}")

    return errors


def validate_semantics(payload: dict[str, Any]) -> list[str]:
    """额外的一致性检查（schema 管不到的语义层）。"""
    errors: list[str] = []
    book_id = payload["book"]["id"]
    pages = payload["pages"]
    chapters = payload["spine"]["chapters"]

    if payload["spine"]["book_id"] != book_id:
        errors.append("spine.book_id 与 book.id 不一致")
    if payload["progress"]["book_id"] != book_id:
        errors.append("progress.book_id 与 book.id 不一致")
    if payload["book"]["page_count"] != len(pages):
        errors.append("book.page_count 与实际页数不符")
    if payload["book"]["chapter_count"] != len(chapters):
        errors.append("book.chapter_count 与实际章节数不符")

    covered = {pid for chapter in chapters for pid in chapter.get("page_ids", [])}
    for page in pages:
        if page["book_id"] != book_id:
            errors.append(f"页 {page['id']} 的 book_id 不一致")
        if page["chapter_id"] not in {c["id"] for c in chapters}:
            errors.append(f"页 {page['id']} 指向了不存在的章节 {page['chapter_id']}")
        if not page.get("blocks"):
            errors.append(f"页 {page['id']} 没有内容块")
        for block in page.get("blocks", []):
            if block.get("status") != "ready":
                errors.append(f"块 {block['id']} 状态不是 ready")
            body = (block.get("payload") or {}).get("body")
            if not body:
                errors.append(f"块 {block['id']} 没有正文")

    for chapter in chapters:
        for page_id in chapter.get("page_ids", []):
            if page_id not in covered:
                errors.append(f"页 {page_id} 未被任何章节覆盖")

    return errors


# ── 主流程 ─────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="拉取开源古诗词数据并转换成平台课程格式。"
    )
    parser.add_argument(
        "--source",
        default="song300",
        choices=sorted(SOURCES),
        help="数据源：song300=宋词三百首（默认），ci=全量宋词分片",
    )
    parser.add_argument(
        "--shards",
        type=int,
        default=None,
        help="ci 模式下拉取的分片数量（每片 1000 首）",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="直接指定一个 Raw JSON 地址（覆盖 --source）",
    )
    parser.add_argument(
        "--book-id",
        default="classic_poetry_01",
        help="课程 id（同时决定文件名）",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="课程标题（缺省按数据源取）",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="输出路径（缺省写入 backend/data/courses/<book-id>.json）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只转换与校验，不写文件",
    )
    args = parser.parse_args()

    config = SOURCES.get(args.source, SOURCES["song300"])

    print(f"▶ 数据源：{config['label']}")
    if args.url:
        print(f"  地址：{args.url}")
    else:
        print(f"  地址：{RAW_BASE}/{config['files'][0]}")

    try:
        raw_poems = load_poems(args.source, args.shards, args.url)
    except RuntimeError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1

    print(f"  共下载 {len(raw_poems)} 条原始记录")

    cleaned: list[dict[str, str]] = []
    skipped = 0
    for raw in raw_poems:
        poem = normalize_poem(raw)
        if poem is None:
            skipped += 1
            continue
        cleaned.append(poem)

    if skipped:
        print(f"  清洗时跳过 {skipped} 条（作者或正文为空）")

    if not cleaned:
        print("✗ 没有可用数据，已中止", file=sys.stderr)
        return 1

    authors = Counter(poem["author"] for poem in cleaned)
    print(f"  清洗后 {len(cleaned)} 首 / {len(authors)} 位作者")

    payload = build_course(
        cleaned,
        book_id=args.book_id,
        title=args.title or config["title"],
        description=config["description"],
        tags=list(config["tags"]),
        timestamp=time.time(),
    )

    print("\n▶ 校验")
    schema_errors = validate_against_schema(payload)
    semantic_errors = validate_semantics(payload)

    if schema_errors:
        print(f"  ✗ schema 校验未通过（{len(schema_errors)} 处）：")
        for error in schema_errors[:15]:
            print(f"      - {error}")
        if len(schema_errors) > 15:
            print(f"      … 另有 {len(schema_errors) - 15} 处")
    else:
        print("  ✓ 符合 template-schema.json 规范")

    if semantic_errors:
        print(f"  ✗ 一致性检查未通过（{len(semantic_errors)} 处）：")
        for error in semantic_errors[:15]:
            print(f"      - {error}")
    else:
        print("  ✓ 章节 / 页 / 内容块引用一致")

    if schema_errors or semantic_errors:
        print("\n✗ 校验未通过，不写入文件", file=sys.stderr)
        return 2

    if args.dry_run:
        print("\n(dry-run) 未写入文件")
        return 0

    out_path = (
        Path(args.out)
        if args.out
        else COURSES_DIR / f"{args.book_id}.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    size_kb = out_path.stat().st_size / 1024
    print(f"\n✓ 已写入 {out_path}")
    print(f"  {len(payload['spine']['chapters'])} 章 · "
          f"{len(payload['pages'])} 页 · "
          f"{sum(len(p['blocks']) for p in payload['pages'])} 块 · "
          f"{size_kb:.0f} KB")
    print("\n提示：平台会自动扫描 backend/data/courses/，无需重启后端。")
    print("     前端刷新「课程」页即可看到《%s》。" % payload["book"]["title"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
