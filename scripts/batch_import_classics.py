#!/usr/bin/env python3
"""
公版通识教材批量拉取与格式化脚本
==================================

批量抓取五门公版经典，转换成平台的标准课程结构（Book / Spine / Pages /
Blocks），落盘到 ``backend/data/courses/``。

覆盖的三类文本
--------------

============  ==========================  ==========================
类别          教材                         数据源
============  ==========================  ==========================
哲学经典      《论语》                     chinese-poetry（GitHub）
哲学经典      《道德经》                   Wikisource API
古典诗文      《唐诗三百首》               chinese-poetry（GitHub）
古典诗文      《声律启蒙》                 Wikisource API
历史散文      《古文观止》                 Wikisource API
============  ==========================  ==========================

为什么用两个源
--------------

``chinese-poetry`` 是 GitHub 上最大的公开中文诗词库，但它只覆盖**诗歌**
与**四书五经**，《道德经》《声律启蒙》《古文观止》都不在里面。

这三部恰好都是**有清晰层级结构的典籍**，维基文库（Wikisource）的
MediaWiki API 正好能按「卷 → 篇 / 章」逐级取到正文。因此：

* ``chinese-poetry`` —— 静态 JSON，一次请求拿一整份；
* ``Wikisource`` —— 动态 API，逐页取正文并本地切分。

Wikisource 有速率限制，因此脚本**带指数退避重试**，并且**每本书只请求
少量页面**（正文在本地切分，而不是一页一次请求）。

元数据强制注入（关键 UI 适配）
--------------------------------

平台的课程卡片靠 ``description`` / ``level`` / ``tags`` 三个字段渲染。
缺任何一个都会在卡片上留出大块空白或渲染出 ``undefined``。本脚本因此
**强制**为每门课注入：

* ``description`` —— 1–2 句精简介绍；
* ``level``（难度）—— 入门 / 进阶 / 高阶；
* ``tags`` —— 恰好 3 个分类标签。

并**过滤掉开发测试性质的占位符文本**（``TODO`` / ``测试`` / ``demo`` /
``lorem ipsum`` / ``占位`` 等），避免它们混进课程卡片。

用法
----

::

    # 拉取全部五门课
    python scripts/batch_import_classics.py

    # 只拉其中几门
    python scripts/batch_import_classics.py --only lunyu,daodejing

    # 只验证不写盘
    python scripts/batch_import_classics.py --dry-run

    # 跳过 Wikisource（只用 GitHub 源的两门）
    python scripts/batch_import_classics.py --skip wikisource

写出的文件会**立即被平台自动挂载**——不需要重启后端，也不需要注册。
"""

from __future__ import annotations

import argparse
from collections import OrderedDict
import json
from pathlib import Path
import re
import sys
import time
from typing import Any, Callable, Iterable

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit(
        "缺少 requests。请先安装：\n"
        "  backend/.venv/bin/pip install requests jsonschema"
    )

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover - 校验是可选的
    Draft7Validator = None  # type: ignore[assignment]


def _load_normalizer():
    """加载后端的文本归一化模块。

    归一化（繁体转简体、零宽字符清除）实现在 ``backend/app/services/
    text_normalize.py``——那里的实现在平台写盘时也会跑一次。这里
    提前跑是为了让**校验看到的**也是干净文本：否则一条全是繁体的
    正文可能因为长度或占位符判断而被误伤。
    """
    root = Path(__file__).resolve().parent.parent / "backend"
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    try:
        from app.services.text_normalize import normalize_payload

        return normalize_payload
    except Exception:  # pragma: no cover - 依赖缺失时不阻断导入
        return None


#: 归一化函数；不可用时为 ``None``（跳过归一化）。
_NORMALIZE = _load_normalizer()


# ── 常量 ───────────────────────────────────────────────────────────────

#: 课程落盘目录（相对仓库根）。
COURSES_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "courses"

#: 结构模板路径，用于生成后校验。
SCHEMA_PATH = COURSES_DIR / "template-schema.json"

#: chinese-poetry 的 raw 根地址。
GH_RAW = "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master"

#: Wikisource MediaWiki API。
WS_API = "https://zh.wikisource.org/w/api.php"

#: 统一的 User-Agent——Wikimedia 要求标明身份，缺省会直接 403/429。
USER_AGENT = (
    "SEEK-Learning-Platform/1.0 (educational course importer; "
    "python-requests; https://github.com/chinese-poetry)"
)

#: 请求超时（秒）。
TIMEOUT = 40

#: 重试次数。
RETRIES = 4

#: 基础重试间隔（秒）——Wikimedia 限流时按指数退避。
RETRY_BASE_DELAY = 8.0


# ── 文本清洗 ───────────────────────────────────────────────────────────

#: 开发测试性质的占位符。
#:
#: 这些内容出现在正文里就是噪声——放上课程卡片会让学习者以为教材没做完。
#: 命中任一即**整段丢弃**。
PLACEHOLDER_PATTERNS = (
    r"todo",
    r"tbd",
    r"fixme",
    r"xxx+",
    r"lorem\s+ipsum",
    r"placeholder",
    r"占位",
    r"待补",
    r"待填",
    r"待完善",
    r"未完成",
    r"示例文本",
    r"测试文本",
    r"测试数据",
    r"调试",
    r"\bdemo\b",
    r"\bsample\s+text\b",
    r"\bfoo\s+bar\b",
    r"^n/a$",
    r"^\W*$",
)

#: 编译好的占位符匹配器。
_PLACEHOLDER_RE = re.compile("|".join(PLACEHOLDER_PATTERNS), re.IGNORECASE)


def is_placeholder(text: str) -> bool:
    """判断一段文本是否是开发测试性质的占位符。"""
    stripped = (text or "").strip()
    if not stripped:
        return True
    return bool(_PLACEHOLDER_RE.search(stripped))


def clean_line(text: str) -> str:
    """规整一行：去首尾空白、全角空格转半角、压掉连续空白。"""
    return " ".join(str(text or "").replace("　", " ").split())


def clean_body(text: str) -> str:
    """规整一段正文：剥注释、去空行、去重。

    古籍正文常被夹注切碎成很多短行（「道，可道也」「，非恆道也」各占
    一行）。这里把**没有句读收尾**的连续短行合并回一句，只在句末
    （。！？；）处断行——这样正文读起来才是正常的句子。
    """
    text = strip_annotations(text or "")

    lines: list[str] = []
    for raw_line in text.splitlines():
        line = clean_line(raw_line)
        if not line:
            continue
        lines.append(line)

    # 去掉连续重复的行（Wikisource 的版本对照块常出现）。
    deduped: list[str] = []
    for line in lines:
        if deduped and deduped[-1] == line:
            continue
        deduped.append(line)

    # 合并被夹注切碎的短行。
    merged: list[str] = []
    for line in deduped:
        if merged and not re.search(r"[。！？；：]$", merged[-1]):
            merged[-1] = f"{merged[-1]}{line}"
        else:
            merged.append(line)

    # 剥注释留下的空洞要用空格补上——中文里连续标点与汉字之间的空格
    # 本身是合法的，但两个汉字之间的空格要去掉。
    body = tighten_cjk_spacing("\n".join(merged).strip())
    return "" if is_placeholder(body) else body


def strip_html(html: str) -> str:
    """把 MediaWiki 的 HTML 转成纯文本（保留换行结构）。"""
    text = html or ""
    text = re.sub(r"<style.*?</style>|<script.*?</script>", "", text, flags=re.S)

    # 编辑链接与工具栏——它们是 MediaWiki 的界面元素，不是正文。
    # 典型形态：``<span class="mw-editsection">…</span>``、``[编辑]``。
    text = re.sub(r'<span class="mw-editsection".*?</span>', " ", text, flags=re.S)
    text = re.sub(r'<div class="mw-editsection".*?</div>', " ", text, flags=re.S)

    # 块级元素换行。``<span>`` 是行内的——不能让它断行，否则一句话会被
    # 切成碎片（「道，可道也」和「非恆道也」会被拆到两行）。
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</(p|div|li|h[1-6]|tr|dd|dt|blockquote)>", "\n", text)
    # 表格分隔成竖线，方便阅读。
    text = re.sub(r"</t[dh]>", " | ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    # 残留的编辑标记（清洗 span 后可能留下裸文本）。
    text = re.sub(r"\[?\s*编辑\s*\]?", "", text)
    return re.sub(r"\n{3,}", "\n\n", text)


#: 夹注——古籍排版里用尖括号括起来的注释（如《左传》笺注）。
#:
#: 这些是编者的注解，不是课文本身。留在正文里会让句子支离破碎，
#: 因此整段剥离。
_ANNOTATION_RE = re.compile(r"〈[^〉]*〉", re.S)

#: CJK 字符。用于判断两段文字之间该不该留空格。
_CJK_RE = re.compile(r"[　-〿一-鿿＀-￯]")


def strip_annotations(text: str) -> str:
    """剥离夹注与版本异文，只保留正文。

    * ``〈…〉`` —— 编者的夹注。
    * ``一作「…」`` / ``又作「…」`` —— 不同版本的异文。
    * ``或句读为：…`` —— 断句说明。
    """
    cleaned = _ANNOTATION_RE.sub("", text or "")
    cleaned = re.sub(r"(?:一作|又作|一作「[^」]*」或作)[「『][^」』]*[」』]", "", cleaned)
    cleaned = re.sub(r"(?:一作|又作)\s*[「『]?[^」』\n]*[」』]?", "", cleaned)
    cleaned = re.sub(r"或句读为[：:][^，。；\n]*", "", cleaned)
    # Wikisource 的「主页面：XXX」导航标记。
    cleaned = re.sub(r"主页面[：:][^\n]*", "", cleaned)
    return cleaned


def tighten_cjk_spacing(text: str) -> str:
    """去掉中文字符之间的多余空格。

    剥离夹注后会在正文里留下空洞（「生莊公及共叔段。 莊公寤生，」）。
    中文不需要这些空格，去掉后句子才连贯。
    """
    # 反复处理，直到没有「汉字 + 空格 + 汉字」的组合。
    previous = None
    result = text
    while previous != result:
        previous = result
        result = re.sub(
            rf"({_CJK_RE.pattern})[ \t]+({_CJK_RE.pattern})",
            r"\1\2",
            result,
        )
    return result


# ── HTTP ───────────────────────────────────────────────────────────────


def http_get(url: str, *, params: dict[str, Any] | None = None, json_api: bool = False) -> Any:
    """带重试的 GET。

    对 429 / 5xx 做指数退避——Wikimedia 的限流是硬性的，不退避会被
    连续拒绝。
    """
    last_error: Exception | None = None

    for attempt in range(1, RETRIES + 1):
        try:
            response = requests.get(
                url,
                params=params,
                timeout=TIMEOUT,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json" if json_api else "*/*",
                },
            )
            if response.status_code == 429 or response.status_code >= 500:
                raise requests.HTTPError(
                    f"HTTP {response.status_code}", response=response
                )
            response.raise_for_status()
            return response.json() if json_api else response.text
        except Exception as exc:
            last_error = exc
            if attempt < RETRIES:
                wait = RETRY_BASE_DELAY * attempt
                print(f"    重试 {attempt}/{RETRIES - 1}（{wait:.0f}s 后）…")
                time.sleep(wait)
                continue
            break

    raise RuntimeError(f"请求失败：{url}\n  原因：{last_error}")


# ── 领域模型 ───────────────────────────────────────────────────────────


class Lesson:
    """一个可读的最小单元——最终成为一页。"""

    __slots__ = ("title", "paragraphs", "meta")

    def __init__(self, title: str, paragraphs: list[str], meta: dict[str, str] | None = None):
        self.title = title
        self.paragraphs = paragraphs
        self.meta = meta or {}

    @property
    def body(self) -> str:
        return "\n".join(self.paragraphs)


class BookSpec:
    """一门课的完整定义——数据源 + 内容组织 + 元数据。"""

    def __init__(
        self,
        *,
        book_id: str,
        title: str,
        description: str,
        level: str,
        tags: list[str],
        category: str,
        summary: str,
        fetcher: Callable[[], list[tuple[str, list[Lesson]]]],
        source_note: str,
        source_url: str,
    ):
        self.book_id = book_id
        self.title = title
        self.description = description
        self.level = level
        self.tags = tags
        self.category = category
        self.summary = summary
        self.fetcher = fetcher
        self.source_note = source_note
        self.source_url = source_url


# ── 数据源：chinese-poetry（GitHub Raw） ───────────────────────────────


def fetch_github_json(path: str) -> list[dict[str, Any]]:
    """下载并解析 chinese-poetry 的一份 JSON。"""
    url = f"{GH_RAW}/{path}"
    data = http_get(url, json_api=True)
    if not isinstance(data, list):
        raise RuntimeError(f"期望数组，实际是 {type(data).__name__}：{url}")
    return data


def lessons_from_lunyu() -> list[tuple[str, list[Lesson]]]:
    """《论语》——按篇（章）分组，每章内若干章句。"""
    raw = fetch_github_json("%E8%AE%BA%E8%AF%AD/lunyu.json")

    grouped: "OrderedDict[str, list[Lesson]]" = OrderedDict()
    for item in raw:
        chapter = clean_line(item.get("chapter") or "")
        paragraphs = [
            clean_line(line)
            for line in (item.get("paragraphs") or [])
            if clean_line(line)
        ]
        if not chapter or not paragraphs:
            continue
        grouped.setdefault(chapter, []).append(
            Lesson(title=chapter, paragraphs=paragraphs, meta={"source": "chinese-poetry"})
        )

    # 每章是一个页面组；组内按 4–6 句切分成页，保证单页不过长。
    result: list[tuple[str, list[Lesson]]] = []
    for chapter, lessons in grouped.items():
        merged = [p for lesson in lessons for p in lesson.paragraphs]
        chunks = [
            merged[i : i + 5] for i in range(0, len(merged), 5)
        ]
        pages = [
            Lesson(
                title=f"{chapter}·第 {index + 1} 节",
                paragraphs=chunk,
                meta={"chapter": chapter},
            )
            for index, chunk in enumerate(chunks)
            if chunk
        ]
        if pages:
            result.append((chapter, pages))
    return result


def lessons_from_tangshi300() -> list[tuple[str, list[Lesson]]]:
    """《唐诗三百首》——按作者分组，每首一首。"""
    raw = fetch_github_json("%E5%85%A8%E5%94%90%E8%AF%97/%E5%94%90%E8%AF%97%E4%B8%89%E7%99%BE%E9%A6%96.json")

    by_author: "OrderedDict[str, list[dict[str, Any]]]" = OrderedDict()
    for item in raw:
        author = clean_line(item.get("author") or "")
        title = clean_line(item.get("title") or "")
        paragraphs = [
            clean_line(line)
            for line in (item.get("paragraphs") or [])
            if clean_line(line)
        ]
        if not author or not title or not paragraphs:
            continue
        by_author.setdefault(author, []).append(
            {"title": title, "paragraphs": paragraphs, "tags": item.get("tags") or []}
        )

    # 作者按作品数降序——高产作者在前，与《宋词经典赏析》的排序一致。
    ordered = sorted(by_author.items(), key=lambda kv: (-len(kv[1]), kv[0]))

    result: list[tuple[str, list[Lesson]]] = []
    for author, works in ordered:
        pages = [
            Lesson(
                title=f"{work['title']}·{author}",
                paragraphs=work["paragraphs"],
                meta={"author": author, "tags": "、".join(clean_line(t) for t in work["tags"])},
            )
            for work in works
        ]
        if pages:
            result.append((author, pages))
    return result


# ── 数据源：Wikisource API ─────────────────────────────────────────────


def wikisource_parse(page: str, *, section: str | None = None) -> str:
    """取一个 Wikisource 页面（或其某个小节）的**原始 HTML**。

    这里刻意**不做** HTML 清洗——标题标签（``<h2>`` / ``<h3>``）是切分
    内容的依据，必须留到最后一步才处理。
    """
    params: dict[str, Any] = {"action": "parse", "page": page, "prop": "text"}
    if section:
        params["section"] = section
    data = http_get(WS_API, params={**params, "format": "json", "formatversion": 2}, json_api=True)
    if "parse" not in data:
        raise RuntimeError(f"Wikisource 取不到页面：{page}（{data.get('error', {}).get('info')}）")
    return data["parse"]["text"]


def split_by_headings(html: str) -> "OrderedDict[str, str]":
    """把一页 HTML 按 ``<h2>`` / ``<h3>`` / ``<h4>`` 切成若干节。

    返回 ``OrderedDict[标题, 纯文本]``。标题自身不计入正文——它会成为
    页面的标题。

    切分必须在**原始 HTML** 上做：一旦先转成纯文本，标题标签就丢了，
    内容会糊成一整块。
    """
    # 匹配带标题的整块，标题在前、内容在后。
    pattern = re.compile(
        r"(<h[234][^>]*>)(.*?)(</h[234]>)(.*?)(?=<h[234][^>]*>|\Z)",
        re.S,
    )

    result: "OrderedDict[str, str]" = OrderedDict()
    for match in pattern.finditer(html):
        raw_title = strip_html(match.group(2)).strip()
        # 去掉标题里残留的编辑链接锚点文本。
        raw_title = raw_title.replace("[编辑]", "").replace("编辑", "").strip()
        if not raw_title:
            continue
        # 正文为空的标题**要保留**——它们是层级容器（「道經」「卷上」），
        # 承载着下属章节的归属关系。
        result[raw_title] = clean_body(strip_html(match.group(4)))
    return result


def lessons_from_daodejing() -> list[tuple[str, list[Lesson]]]:
    """《道德经》——道经 / 德经 两章，每章 81 章句为页。

    页面「老子 (匯校版)」的正文结构是 ``<h2>道經</h2>`` 然后 81 个
    ``<h3>一章</h3>``。一次请求拿到整页，本地切分。
    """
    html = wikisource_parse("老子 (匯校版)")
    sections = split_by_headings(html)

    # 顶层大章（道經 / 德經）之下挂着小章；按层级重建。
    chapters: "OrderedDict[str, list[Lesson]]" = OrderedDict()
    current = "道经"
    for title, body in sections.items():
        if title in {"道經", "德經"}:
            current = "道经" if title == "道經" else "德经"
            chapters.setdefault(current, [])
            continue
        if not re.fullmatch(r"[一二三四五六七八九十百]+章", title):
            # 其它层级标题（如「版本信息」）跳过。
            continue
        if not body:
            continue
        chapters.setdefault(current, []).append(
            Lesson(title=title, paragraphs=body.splitlines(), meta={"source": "wikisource"})
        )

    return [
        (chapter, lessons)
        for chapter, lessons in chapters.items()
        if lessons
    ]


def lessons_from_shenglv() -> list[tuple[str, list[Lesson]]]:
    """《声律启蒙》——卷上 / 卷下两章，每个韵目一节。"""
    html = wikisource_parse("聲律啓蒙")
    sections = split_by_headings(html)

    chapters: "OrderedDict[str, list[Lesson]]" = OrderedDict()
    current = "卷上"
    for title, body in sections.items():
        if title in {"卷上", "卷下"}:
            current = "卷上" if title == "卷上" else "卷下"
            chapters.setdefault(current, [])
            continue
        # 韵目标题形如「一、東」「二、冬」。
        if not re.match(r"^[一二三四五六七八九十百]+、", title):
            continue
        if not body:
            continue
        paragraphs = [line for line in body.splitlines() if line]
        if not paragraphs:
            continue
        chapters.setdefault(current, []).append(
            Lesson(title=title, paragraphs=paragraphs, meta={"source": "wikisource"})
        )

    return [(chapter, lessons) for chapter, lessons in chapters.items() if lessons]


def lessons_from_guwenguanzhi() -> list[tuple[str, list[Lesson]]]:
    """《古文观止》——12 卷，每卷一篇为一页。

    卷标题形如「卷五　漢文」，篇标题在卷内。逐卷请求（12 次），
    卷内本地切分。
    """
    result: list[tuple[str, list[Lesson]]] = []

    for number in range(1, 13):
        page = f"古文觀止/卷{number}"
        try:
            html = wikisource_parse(page)
        except RuntimeError as exc:
            print(f"    跳过 {page}：{exc}")
            continue

        sections = split_by_headings(html)
        if not sections:
            continue

        # 卷标题（含朝代信息）——取第一个形如「卷X　Y」的标题。
        volume = next(
            (
                title
                for title in sections
                if re.match(r"^卷[一二三四五六七八九十\d]+", title)
            ),
            f"卷{number}",
        )

        pages: list[Lesson] = []
        for title, body in sections.items():
            if title == volume:
                continue
            if not body:
                continue
            paragraphs = [line for line in body.splitlines() if line]
            if not paragraphs:
                continue
            pages.append(
                Lesson(title=title, paragraphs=paragraphs, meta={"volume": volume})
            )

        if pages:
            result.append((volume, pages))
        time.sleep(1.5)  # 对 Wikimedia 友好一点

    return result


# ── 课程规格 ───────────────────────────────────────────────────────────


def build_specs() -> "OrderedDict[str, BookSpec]":
    """五门课的定义。

    ``description`` / ``level`` / ``tags`` 在这里**强制**给定——脚本不
    允许它们为空，因为课程卡片靠这三项渲染。
    """
    specs: "OrderedDict[str, BookSpec]" = OrderedDict()

    specs["lunyu"] = BookSpec(
        book_id="classic_lunyu_01",
        title="论语通读",
        description="孔子与弟子的对话录，廿篇涵盖仁、礼、君子与为政之道。国学入门第一书。",
        level="入门",
        tags=["国学", "哲学", "文言文"],
        category="国学经典",
        summary="《论语》二十篇，按篇分章，逐章研读。先通读文句，再体会孔门的对话逻辑与处世原则。",
        fetcher=lessons_from_lunyu,
        source_note="chinese-poetry/chinese-poetry · 论语/lunyu.json",
        source_url=f"{GH_RAW}/%E8%AE%BA%E8%AF%AD/lunyu.json",
    )

    specs["daodejing"] = BookSpec(
        book_id="classic_daodejing_01",
        title="道德经研读",
        description="老子五千言，讲道生万物、无为而治与知止不殆。八十余章层层递进。",
        level="进阶",
        tags=["国学", "哲学", "道家"],
        category="国学经典",
        summary="《道德经》分道经、德经两篇，八十一章逐章展开。宜反复诵读，对照不同注本理解其层次。",
        fetcher=lessons_from_daodejing,
        source_note="维基文库 · 老子 (匯校版)",
        source_url="https://zh.wikisource.org/wiki/老子_(匯校版)",
    )

    specs["tangshi300"] = BookSpec(
        book_id="classic_tangshi300_01",
        title="唐诗三百首",
        description="唐代诗歌选本，三百余首名作。按作者成章，读诗亦见唐一代诗风流变。",
        level="进阶",
        tags=["国学", "诗词", "唐诗"],
        category="古典文学",
        summary="精选唐诗三百余首，按作者分章。每首独立成页，可逐首体会格律、意象与情韵。",
        fetcher=lessons_from_tangshi300,
        source_note="chinese-poetry/chinese-poetry · 全唐诗/唐诗三百首.json",
        source_url=f"{GH_RAW}/%E5%85%A8%E5%94%90%E8%AF%97/%E5%94%90%E8%AF%97%E4%B8%89%E7%99%BE%E9%A6%96.json",
    )

    specs["shenglv"] = BookSpec(
        book_id="classic_shenglv_01",
        title="声律启蒙",
        description="清代车万育所编对韵蒙读本，上下卷三十韵。学对仗、明平仄的入门经典。",
        level="入门",
        tags=["国学", "诗词", "蒙学"],
        category="古典文学",
        summary="《声律启蒙》分上下卷，每韵目一节。对偶天成，是学习对仗与声律的经典蒙本。",
        fetcher=lessons_from_shenglv,
        source_note="维基文库 · 聲律啓蒙",
        source_url="https://zh.wikisource.org/wiki/聲律啓蒙",
    )

    specs["guwenguanzhi"] = BookSpec(
        book_id="classic_guwenguanzhi_01",
        title="古文观止",
        description="吴楚材选编的古代散文名篇十二卷，二百二十余篇。自先秦诸子至明代小品。",
        level="高阶",
        tags=["国学", "散文", "文言文"],
        category="古典文学",
        summary="《古文观止》分十二卷，按时代编排。上起先秦，下迄明季，每篇皆为传诵名篇。",
        fetcher=lessons_from_guwenguanzhi,
        source_note="维基文库 · 古文觀止",
        source_url="https://zh.wikisource.org/wiki/古文觀止",
    )

    return specs


# ── 组装 ───────────────────────────────────────────────────────────────


def build_course(
    spec: BookSpec,
    chapters: list[tuple[str, list[Lesson]]],
    *,
    timestamp: float,
) -> dict[str, Any]:
    """把章节 + 页组装成标准课程结构。"""
    book_id = spec.book_id

    spine_chapters: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    page_order = 0

    for chapter_order, (chapter_title, lessons) in enumerate(chapters):
        chapter_id = f"ch_{book_id}_{chapter_order + 1:03d}"
        page_ids: list[str] = []

        for lesson in lessons:
            page_id = f"pg_{book_id}_{page_order + 1:04d}"
            page_ids.append(page_id)

            blocks: list[dict[str, Any]] = []

            # 块一：原文。
            blocks.append(
                {
                    "id": f"blk_{page_id}_body",
                    "type": "text",
                    "status": "ready",
                    "title": "原文",
                    "params": {},
                    "payload": {
                        "format": "markdown",
                        "role": "body",
                        "body": lesson.body,
                    },
                    "source_anchors": [
                        {
                            "kind": "web",
                            "kb_name": spec.source_note,
                            "ref": spec.source_url,
                            "snippet": lesson.title,
                        }
                    ],
                    "metadata": dict(lesson.meta),
                    "error": "",
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
            )

            pages.append(
                {
                    "id": page_id,
                    "book_id": book_id,
                    "chapter_id": chapter_id,
                    "title": lesson.title,
                    "learning_objectives": [
                        f"读懂《{lesson.title}》的文句大意",
                        f"体会{chapter_title}在《{lesson.title}》中的表达方式",
                    ],
                    "content_type": "theory",
                    "status": "ready",
                    "order": page_order,
                    "blocks": blocks,
                    "links": [],
                    "parent_page_id": "",
                    "error": "",
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
            )
            page_order += 1

        spine_chapters.append(
            {
                "id": chapter_id,
                "title": chapter_title,
                "learning_objectives": [
                    f"通读{chapter_title}一节",
                    f"把握{chapter_title}的整体脉络",
                ],
                "content_type": "theory",
                "source_anchors": [
                    {
                        "kind": "web",
                        "kb_name": spec.source_note,
                        "ref": spec.source_url,
                        "snippet": chapter_title,
                    }
                ],
                "prerequisites": [],
                "page_ids": page_ids,
                "summary": f"{chapter_title}——共 {len(page_ids)} 篇。",
                "order": chapter_order,
            }
        )

    # ── 元数据强制注入 ──────────────────────────────────────────────
    # 课程卡片靠 description / level / tags 渲染；缺一项就留白。
    description = spec.description.strip()
    if is_placeholder(description) or len(description) < 8:
        raise RuntimeError(f"{spec.title} 的 description 无效：{description!r}")

    level = spec.level.strip()
    if level not in {"入门", "进阶", "高阶"}:
        raise RuntimeError(f"{spec.title} 的 level 必须是入门/进阶/高阶：{level!r}")

    tags = [tag.strip() for tag in spec.tags if tag.strip()]
    if len(tags) != 3:
        raise RuntimeError(f"{spec.title} 必须恰好 3 个 tags，当前 {len(tags)} 个")
    if any(is_placeholder(tag) for tag in tags):
        raise RuntimeError(f"{spec.title} 的 tags 含占位符：{tags!r}")

    return {
        "book": {
            "id": book_id,
            "revision": 1,
            "title": spec.title,
            "description": description,
            "status": "ready",
            "proposal": None,
            "knowledge_bases": [spec.source_note],
            "language": "zh",
            "depth": "standard",
            "page_count": len(pages),
            "chapter_count": len(spine_chapters),
            "created_at": timestamp,
            "updated_at": timestamp,
            "metadata": {
                "tags": tags,
                "category": spec.category,
                "level": level,
                "difficulty": level,
                "source": spec.source_note,
                "license": "public domain",
                "source_url": spec.source_url,
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
            "exploration_summary": spec.summary,
            "concept_graph": {"nodes": [], "edges": []},
            "chapters": spine_chapters,
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


def validate_schema(payload: dict[str, Any]) -> list[str]:
    """按 ``template-schema.json`` 校验。"""
    if not SCHEMA_PATH.exists():
        return [f"结构模板不存在：{SCHEMA_PATH}"]

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))

    if Draft7Validator is not None:
        validator = Draft7Validator(schema)
        errors: list[str] = []
        for error in sorted(validator.iter_errors(payload), key=lambda e: list(e.path)):
            location = "/".join(str(part) for part in error.path) or "(root)"
            errors.append(f"{location}: {error.message}")
        return errors

    return _structural_check(payload)


def _structural_check(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for section in ("book", "spine", "pages", "progress"):
        if section not in payload:
            errors.append(f"缺少顶层段：{section}")
    return errors


def validate_metadata(payload: dict[str, Any]) -> list[str]:
    """校验 UI 所需的元数据齐全且无占位符。"""
    errors: list[str] = []
    book = payload.get("book", {})
    metadata = book.get("metadata", {})

    description = str(book.get("description") or "").strip()
    if not description:
        errors.append("book.description 为空——课程卡片会留白")
    elif is_placeholder(description):
        errors.append(f"book.description 是占位符：{description!r}")
    elif len(description) > 120:
        errors.append(f"book.description 过长（{len(description)} 字），卡片会换行失衡")

    level = str(metadata.get("level") or "").strip()
    if not level:
        errors.append("metadata.level 为空——课程卡片会留白")
    elif level not in {"入门", "进阶", "高阶"}:
        errors.append(f"metadata.level 取值非法：{level!r}")

    difficulty = str(metadata.get("difficulty") or "").strip()
    if difficulty != level:
        errors.append("metadata.difficulty 与 metadata.level 不一致")

    tags = metadata.get("tags")
    if not isinstance(tags, list) or len(tags) != 3:
        errors.append(f"metadata.tags 必须是恰好 3 个，当前：{tags!r}")
    else:
        for tag in tags:
            if not str(tag).strip():
                errors.append("metadata.tags 含空标签")
            elif is_placeholder(str(tag)):
                errors.append(f"metadata.tags 含占位符：{tag!r}")

    category = str(metadata.get("category") or "").strip()
    if not category:
        errors.append("metadata.category 为空——课程分类筛选会漏掉这门课")

    # 正文里不应残留占位符。
    for page in payload.get("pages", []):
        for block in page.get("blocks", []):
            body = str((block.get("payload") or {}).get("body") or "")
            if is_placeholder(body):
                errors.append(f"页 {page['id']} 的正文是占位符")
                break

    return errors


def validate_semantics(payload: dict[str, Any]) -> list[str]:
    """一致性检查。"""
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
    if not pages:
        errors.append("没有任何页面")

    chapter_ids = {c["id"] for c in chapters}
    covered: set[str] = set()
    for page in pages:
        if page["book_id"] != book_id:
            errors.append(f"页 {page['id']} 的 book_id 不一致")
        if page["chapter_id"] not in chapter_ids:
            errors.append(f"页 {page['id']} 指向了不存在的章节")
        if not page.get("blocks"):
            errors.append(f"页 {page['id']} 没有内容块")
        for block in page.get("blocks", []):
            if block.get("status") != "ready":
                errors.append(f"块 {block['id']} 状态不是 ready")
            if not (block.get("payload") or {}).get("body"):
                errors.append(f"块 {block['id']} 没有正文")

    for chapter in chapters:
        for page_id in chapter.get("page_ids", []):
            covered.add(page_id)

    for page in pages:
        if page["id"] not in covered:
            errors.append(f"页 {page['id']} 未被任何章节覆盖")

    return errors


# ── 主流程 ─────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="批量拉取公版通识教材并转换成平台课程格式。"
    )
    parser.add_argument(
        "--only",
        default="",
        help="只处理指定课程，逗号分隔（lunyu,daodejing,tangshi300,shenglv,guwenguanzhi）",
    )
    parser.add_argument(
        "--skip",
        default="",
        help="跳过指定课程，逗号分隔",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只转换与校验，不写文件",
    )
    args = parser.parse_args()

    specs = build_specs()
    only = {item.strip() for item in args.only.split(",") if item.strip()}
    skip = {item.strip() for item in args.skip.split(",") if item.strip()}

    targets = [
        (key, spec)
        for key, spec in specs.items()
        if (not only or key in only) and key not in skip
    ]
    if not targets:
        print("✗ 没有匹配到任何课程", file=sys.stderr)
        return 1

    print(f"▶ 待处理 {len(targets)} 门课：{'、'.join(key for key, _ in targets)}\n")

    written: list[tuple[str, dict[str, Any]]] = []
    failures: list[str] = []

    for key, spec in targets:
        print(f"── {spec.title} ({key})")
        print(f"   来源：{spec.source_note}")

        try:
            chapters = spec.fetcher()
        except Exception as exc:
            print(f"   ✗ 拉取失败：{exc}\n", file=sys.stderr)
            failures.append(key)
            continue

        if not chapters:
            print(f"   ✗ 没有取到任何内容\n", file=sys.stderr)
            failures.append(key)
            continue

        total_pages = sum(len(lessons) for _, lessons in chapters)
        print(f"   ✓ {len(chapters)} 章 / {total_pages} 页")

        try:
            payload = build_course(spec, chapters, timestamp=time.time())
        except RuntimeError as exc:
            print(f"   ✗ 组装失败：{exc}\n", file=sys.stderr)
            failures.append(key)
            continue

        # 强制清洗：繁体转简体、零宽字符清除、空白压缩。
        # 平台写盘时还会再跑一次——这里是让校验看到的也是干净文本。
        if _NORMALIZE is not None:
            payload = _NORMALIZE(payload)

        errors = validate_schema(payload) + validate_metadata(payload) + validate_semantics(payload)
        if errors:
            print(f"   ✗ 校验未通过（{len(errors)} 处）：")
            for error in errors[:12]:
                print(f"       - {error}")
            print(file=sys.stderr)
            failures.append(key)
            continue

        print("   ✓ 校验通过（schema + 元数据 + 一致性）")
        written.append((key, payload))
        print()

    if not written:
        print("✗ 全部失败，未写入任何文件", file=sys.stderr)
        return 2

    if args.dry_run:
        print("(dry-run) 未写入文件")
        return 0

    COURSES_DIR.mkdir(parents=True, exist_ok=True)
    for key, payload in written:
        path = COURSES_DIR / f"{payload['book']['id']}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        book = payload["book"]
        print(f"✓ {path.name}")
        print(f"    《{book['title']}》 {book['chapter_count']} 章 · "
              f"{book['page_count']} 页 · {book['block_count'] if 'block_count' in book else len(payload['pages'])} 块")
        print(f"    难度：{book['metadata']['level']} | 标签：{'、'.join(book['metadata']['tags'])}")
        print(f"    简介：{book['description']}")

    if failures:
        print(f"\n⚠ 失败 {len(failures)} 门：{'、'.join(failures)}", file=sys.stderr)

    print("\n提示：平台会自动扫描 backend/data/courses/，无需重启后端。")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
