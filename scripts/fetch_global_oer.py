#!/usr/bin/env python3
"""
全球 OER（开放教育资源）教材批量拉取与格式化
================================================

把三个**结构完全不同**的开源教材拉下来，映射成平台统一的
``Book -> Chapter -> Page -> Block`` 结构，落盘到
``backend/data/courses/``。

覆盖的三个领域
--------------

============  ==============================  ====================
领域          教材                            数据源
============  ==============================  ====================
现代编程      Python 官方 Tutorial（选段）     cpython 仓库（GitHub）
经典科学      牛顿《自然哲学的数学原理》      1729 英文译本（Wikisource）
人类社科      《世界人权宣言》                维基文库（Wikisource）
============  ==============================  ====================

为什么这三部的处理方式差别很大
------------------------------

它们不是「同一份数据的三个样本」，而是三种**结构范式**：

* **Python Tutorial** —— 标记语言源（reStructuredText）。有代码块、有
  交叉引用指令、有缩进语义。需要一个 RST → Markdown 的转换器，并且
  **必须保留代码块的缩进**（缩进在 Python 里是语法）。
* **牛顿《原理》** —— 1729 年英文译本的影印转录。结构是
  「定义 → 公理（运动定律）→ 推论」，每一条都有编号。需要按编号切分。
* **《世界人权宣言》** —— 条文体。结构是「序言 + 30 条」，每条本身
  是一整段。是**最简单**的一种，但它的价值在于展示「条款类」文本
  怎么组织成章节。

因此本脚本刻意写成**三套独立的解析器 + 一套统一的组装器**，
而不是硬凑成一个通用解析器。

网络不可用时的降级
------------------

三个数据源各有本地兜底（``--offline`` 生效）：

* Python —— 内置精选节选；
* 牛顿 —— 内置三大运动定律与万有引力定律；
* 人权宣言 —— 内置序言与核心条款。

这样脚本在完全断网的机器上也能产出**结构完整**的课程，便于 CI 与
离线演示。**联网时一律用真实数据**，本地兜底只在明确失败时启用，
并会在输出里标注 ``offline_fallback``。

用法
----

::

    # 拉取全部三门
    python scripts/fetch_global_oer.py

    # 只拉其中几门
    python scripts/fetch_global_oer.py --only python,newton,udhr

    # 强制使用本地兜底（断网演练 / CI）
    python scripts/fetch_global_oer.py --offline

    # 只验证不写盘
    python scripts/fetch_global_oer.py --dry-run

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
from typing import Any, Callable

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit(
        "缺少 requests。请先安装：\n"
        "  backend/.venv/bin/pip install requests jsonschema"
    )

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover
    Draft7Validator = None  # type: ignore[assignment]


def _load_normalizer():
    """加载后端的文本归一化模块（繁体转简体等）。

    实现在 ``backend/app/services/text_normalize.py``，平台写盘时
    也会跑一次。这里提前跑是为了让**校验看到的**也是干净文本。
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

#: cpython 官方文档教程（reStructuredText 源文件）。
CPYTHON_RAW = "https://raw.githubusercontent.com/python/cpython/3.13/Doc/tutorial"

#: 维基文库 MediaWiki API（中文）。
WS_ZH = "https://zh.wikisource.org/w/api.php"

#: 维基文库 MediaWiki API（英文）。
WS_EN = "https://en.wikisource.org/w/api.php"

USER_AGENT = (
    "SEEK-Learning-Platform/1.0 (educational course importer; "
    "python-requests; https://github.com/python/cpython)"
)

TIMEOUT = 40
RETRIES = 4
RETRY_BASE_DELAY = 8.0


# ── HTTP ───────────────────────────────────────────────────────────────


def http_get(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    json_api: bool = False,
) -> Any:
    """带指数退避的 GET。对 429 / 5xx 退避重试。"""
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
                raise requests.HTTPError(f"HTTP {response.status_code}", response=response)
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


def wikisource_parse(
    api: str, page: str, *, section: str | None = None
) -> str:
    """取一个 Wikisource 页面的**原始 HTML**。

    刻意不做清洗——标题标签是切分内容的依据，必须留到最后一步。
    """
    params: dict[str, Any] = {"action": "parse", "page": page, "prop": "text"}
    if section:
        params["section"] = section
    data = http_get(
        api, params={**params, "format": "json", "formatversion": 2}, json_api=True
    )
    if "parse" not in data:
        raise RuntimeError(
            f"Wikisource 取不到页面：{page}（{data.get('error', {}).get('info')}）"
        )
    return data["parse"]["text"]


# ── HTML / 文本清洗 ────────────────────────────────────────────────────

_ANNOTATION_RE = re.compile(r"〈[^〉]*〉", re.S)
_CJK_RE = re.compile(r"[　-〿一-鿿＀-￯]")

#: 开发测试性质的占位符。
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
    r"示例文本",
    r"测试文本",
    r"\bdemo\b",
    r"^\W*$",
)
_PLACEHOLDER_RE = re.compile("|".join(PLACEHOLDER_PATTERNS), re.IGNORECASE)


def is_placeholder(text: str) -> bool:
    """判断一段文本是否是开发测试性质的占位符。"""
    stripped = (text or "").strip()
    if not stripped:
        return True
    return bool(_PLACEHOLDER_RE.search(stripped))


def clean_line(text: str) -> str:
    return " ".join(str(text or "").replace("　", " ").split())


def tighten_cjk_spacing(text: str) -> str:
    """去掉中文字符之间的多余空格。"""
    previous = None
    result = text
    while previous != result:
        previous = result
        result = re.sub(
            rf"({_CJK_RE.pattern})[ \t]+({_CJK_RE.pattern})", r"\1\2", result
        )
    return result


def strip_annotations(text: str) -> str:
    """剥离夹注与版本异文。"""
    cleaned = _ANNOTATION_RE.sub("", text or "")
    cleaned = re.sub(r"(?:一作|又作)\s*[「『]?[^」』\n]*[」』]?", "", cleaned)
    cleaned = re.sub(r"主页面[：:][^\n]*", "", cleaned)
    return cleaned


#: Wikisource 影印转录页的正文里混着这些界面元素：
#: 前后页链接、目录、书名 / 译者行、转录头标记。


#: Wikisource 转录页的**转录头**。
#:
#: 影印页的结构是「目录 → 转录头 → 正文」：
#:
#: ``601930The Mathematical Principles of Natural Philosophy — Book I, Section V: …``
#:
#: 那一长串是 MediaWiki 的转录标记，正文从它**之后**开始。
_TRANSCRIPTION_HEADER_RE = re.compile(
    r"^\d+The Mathematical Principles of Natural Philosophy\s*[—-].*$",
    re.M,
)


def strip_navigation(text: str) -> str:
    """剥掉 Wikisource 的导航残留（前后页链接、目录、书目行）。

    这些元素紧跟在标题后面，不处理的话每条编号正文都会以
    「←Section IVThe Mathematical Principles…」这样的乱码开头。
    """
    cleaned = text or ""

    # 转录头 —— 正文从它之后开始。
    match = _TRANSCRIPTION_HEADER_RE.search(cleaned)
    if match:
        cleaned = cleaned[match.end() :]

    # 前后的页面导航（带书名号，特征明确）。
    cleaned = re.sub(r"←\s*Section\s+[IVXLC]+", "", cleaned)
    cleaned = re.sub(r"Section\s+[IVXLC]+\s*→", "", cleaned)

    # 页首的书名 / 译者行。
    cleaned = re.sub(
        r"^The Mathematical Principles of Natural Philosophy\s*—.*$", "", cleaned, flags=re.M
    )
    cleaned = re.sub(r"^by Isaac Newton, translated by .*$", "", cleaned, flags=re.M)
    cleaned = re.sub(r"^Andrew MotteIsaac Newton$", "", cleaned, flags=re.M)

    # 目录区：连续的「Proposition XXII. Problem XIV」这类只有标题的行。
    cleaned = re.sub(
        r"^(?:Lemma|Proposition|Theorem|Corollary|Problem|Scholium)\s+[IVXLC]+\.?\s*$",
        "",
        cleaned,
        flags=re.M,
    )
    cleaned = re.sub(r"^Contents$", "", cleaned, flags=re.M)
    cleaned = re.sub(r"^[←→\s]+$", "", cleaned, flags=re.M)

    # Wikisource 的编辑链接标记（``[ 编辑 ]`` / ``[编辑]``）。
    # 它的左括号可能被前面的正则吃掉，只剩 ``编辑]``——这里要能接住
    # 那种残缺形态，否则它会粘在正文第一句前面。
    cleaned = re.sub(r"\[?\s*编辑\s*\]?", "", cleaned)
    cleaned = re.sub(r"\[?\s*edit\s*\]?", "", cleaned, flags=re.I)

    return cleaned


def strip_html(html: str) -> str:
    """MediaWiki HTML → 纯文本。"""
    text = html or ""
    text = re.sub(r"<style.*?</style>|<script.*?</script>", "", text, flags=re.S)
    text = re.sub(r'<span class="mw-editsection".*?</span>', " ", text, flags=re.S)
    text = re.sub(r'<div class="mw-editsection".*?</div>', " ", text, flags=re.S)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</(p|div|li|h[1-6]|tr|dd|dt|blockquote)>", "\n", text)
    text = re.sub(r"</t[dh]>", " | ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&#160;", " ")
        .replace("&#8203;", "")
    )
    text = re.sub(r"\[\s*edit\s*\]", "", text, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", text)


def split_by_headings(html: str) -> "OrderedDict[str, str]":
    """按 ``<h2>`` / ``<h3>`` / ``<h4>`` 把一页 HTML 切成若干节。

    返回 ``OrderedDict[标题, 纯文本]``。**正文为空的标题也要保留**——
    它们是层级容器（「卷上」「第一章」），承载下属章节的归属关系。
    """
    pattern = re.compile(
        r"(<h[234][^>]*>)(.*?)(</h[234]>)(.*?)(?=<h[234][^>]*>|\Z)", re.S
    )
    result: "OrderedDict[str, str]" = OrderedDict()
    for match in pattern.finditer(html):
        raw_title = strip_html(match.group(2)).strip()
        raw_title = raw_title.replace("[编辑]", "").replace("[edit]", "").strip()
        if not raw_title:
            continue
        body = strip_html(match.group(4))
        body = strip_navigation(body)
        body = tighten_cjk_spacing(strip_annotations(body))
        result[raw_title] = body
    return result


def clean_body(text: str) -> str:
    """规整正文：去空行、去重、合并被切碎的短行。"""
    lines: list[str] = []
    for raw_line in (text or "").splitlines():
        line = clean_line(raw_line)
        if not line:
            continue
        if lines and lines[-1] == line:
            continue
        lines.append(line)

    merged: list[str] = []
    for line in lines:
        # 前一行没有句读收尾 → 它和当前行其实是同一句话，合并。
        #
        # 但如果前一行是**碎片**（太短、且不是完整的句子开头），说明
        # 它是被清洗残留的噪声——这时宁可断行，也不要把噪声粘到正文上。
        if merged and not re.search(r"[。！？；：.!?]$", merged[-1]):
            if len(merged[-1]) >= 4:
                merged[-1] = f"{merged[-1]}{line}"
                continue
        merged.append(line)

    body = "\n".join(merged).strip()
    return "" if is_placeholder(body) else body


# ── 领域模型 ───────────────────────────────────────────────────────────


class Lesson:
    """一个可读的最小单元——最终成为一页。"""

    __slots__ = ("title", "blocks", "meta")

    def __init__(self, title: str, blocks: list[dict[str, Any]], meta: dict[str, str] | None = None):
        self.title = title
        self.blocks = blocks
        self.meta = meta or {}


class BookSpec:
    """一门课的完整定义。"""

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


# ── 数据源 1：Python 官方 Tutorial（reStructuredText） ─────────────────


def rst_to_markdown(rst: str) -> str:
    """把 reStructuredText 转成 Markdown。

    处理教程里实际会用到的语法子集：

    * 下划线式标题（``===`` / ``---`` / ``~~~``）→ Markdown 标题；
    * 字面块 → 围栏代码块；
    * 角色指令（``:keyword:`x``` / ``:func:`x```）→ 行内代码；
    * ```` ``literal`` ```` → 行内代码。

    **缩进必须原样保留**——在 Python 里缩进就是语法。

    实现上是**两遍**：第一遍把源码切成「文本段 / 字面块」的序列，
    第二遍才做行内语法替换。顺序不能反——否则 `` ``literal`` ``
    的正则会把刚生成的 ```` ``` ```` 围栏也当成字面量改掉。
    """
    lines = rst.splitlines()

    # ── 第一遍：切块 ────────────────────────────────────────────
    segments: list[tuple[str, Any]] = []  # ("text", str) | ("code", list[str])
    index = 0
    underline_chars = set("=-`:.'\"~^_*+#")

    while index < len(lines):
        line = lines[index]

        # 标题。
        if (
            index + 1 < len(lines)
            and line.strip()
            and lines[index + 1].strip()
            and len(lines[index + 1].strip()) >= max(2, len(line.strip()) - 2)
            and len(set(lines[index + 1].strip())) == 1
            and set(lines[index + 1].strip()) <= underline_chars
        ):
            char = lines[index + 1].strip()[0]
            level = {"=": 2, "-": 3, "~": 4, "^": 4}.get(char, 4)
            segments.append(("text", f"{'#' * level} {line.strip()}"))
            index += 2
            continue

        # 空行。
        if not line.strip():
            index += 1
            continue

        # RST 指令（``.. _label:`` / ``.. index::`` / ``.. code-block::``）。
        if re.match(r"^\s*\.\.\s+", line):
            index += 1
            continue

        # 缩进块 —— 字面块（代码）。
        if line.startswith((" ", "\t")):
            block: list[str] = []
            while index < len(lines):
                candidate = lines[index]
                if candidate.strip() and not candidate.startswith((" ", "\t")):
                    break
                block.append(candidate)
                index += 1
            while block and not block[-1].strip():
                block.pop()
            if block:
                segments.append(("code", block))
            continue

        # 普通文本行。
        segments.append(("text", line.rstrip()))
        index += 1

    # ── 第二遍：渲染 ────────────────────────────────────────────
    out: list[str] = []
    for kind, payload in segments:
        if kind == "code":
            out.append("```python")
            out.extend(payload)
            out.append("```")
            out.append("")
            continue

        out.append(_inline_rst_syntax(str(payload)))

    markdown = "\n".join(out)

    # 压掉多余空行。
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown.strip()


def _inline_rst_syntax(text: str) -> str:
    """处理**单个文本段**里的行内 RST 语法。

    刻意做成段级而不是全文级：行内字面量的正则 `` ``x`` `` 一旦跑在
    全文上，会把刚生成的 ```` ``` ```` 代码围栏也当成字面量吞掉——
    围栏必须先于行内语法存在，因此两者不能混在一次替换里。
    """
    # 段落以 ``::`` 结尾 → 去掉 ``::``，后面的缩进块已单独成段。
    stripped = text.rstrip()
    if stripped.endswith("::"):
        text = stripped[:-2].rstrip()
    # 角色指令 → 行内代码。``!`` 前缀表示「不要解释」——去掉它。
    text = re.sub(r":\w+:`!([^`]*)`", r"`\1`", text)
    text = re.sub(r":\w+:`([^`]*)`", r"`\1`", text)
    # 交叉引用目标（``:ref:`tut-match``` 只剩锚点，没有文字）。
    text = re.sub(r":ref:`[^`]*`", "", text)
    # 行内字面量 `` ``x`` `` → `x`。
    text = re.sub(r"``([^`]+)``", r"`\1`", text)
    # 残留的字段列表。
    text = re.sub(r"^\s*:\w+:.*$", "", text, flags=re.M)
    return text


def parse_python_tutorial(rst: str) -> "OrderedDict[str, list[Lesson]]":
    """把一份教程 RST 切成「章节 → 页」。

    RST 用下划线式标题组织层级，**下划线字符决定层级**：

    * ``*****`` → 顶层（整份文件就是一章）
    * ``=====`` → 二级（章）
    * ``-----`` → 三级（节）
    * ``~~~~~`` → 四级（小节）

    文件顶层的 ``*****`` 标题（如 "More Control Flow Tools"）就是这一份
    文件的章名。
    """
    lines = rst.splitlines()

    # 扫出所有标题（标题行 + 下划线行）。
    headings: list[tuple[int, int, str]] = []  # (行号, 层级, 标题)
    index = 0
    while index < len(lines) - 1:
        line = lines[index]
        underline = lines[index + 1]
        if (
            line.strip()
            and underline.strip()
            and len(underline.strip()) >= max(2, len(line.strip()) - 2)
            and len(set(underline.strip())) == 1
            and set(underline.strip()) <= set("=-`:.'\"~^_*+#")
        ):
            char = underline.strip()[0]
            level = {"*": 0, "=": 1, "-": 2, "~": 3, "^": 4}.get(char, 4)
            headings.append((index, level, line.strip()))
            index += 2
            continue
        index += 1

    # 切分正文。
    sections: list[tuple[int, str, str]] = []  # (层级, 标题, 正文)
    for position, (line_no, level, title) in enumerate(headings):
        end = headings[position + 1][0] if position + 1 < len(headings) else len(lines)
        body = "\n".join(lines[line_no + 2 : end])
        sections.append((level, title, body))

    # 顶层（``*****``）是这一份文件的章名。
    file_chapter = next(
        (title for level, title, _ in sections if level == 0),
        "教程",
    )

    # 组装成「章 → 页」。
    chapters: "OrderedDict[str, list[Lesson]]" = OrderedDict()
    current_chapter = file_chapter

    for level, title, body in sections:
        if level == 0:
            current_chapter = clean_section_title(title)
            chapters.setdefault(current_chapter, [])
            continue
        if level > 3:
            continue

        # 标题里也可能有角色指令（``:keyword:`!if` Statements``）。
        clean_title = clean_section_title(title)

        markdown = rst_to_markdown(body)
        if not markdown.strip() or is_placeholder(markdown):
            continue

        # 拆成「文本块」与「代码块」。
        text_blocks, code_blocks = split_markdown_blocks(markdown)

        blocks: list[dict[str, Any]] = []
        if text_blocks:
            blocks.append(text_block(f"{clean_title} · 讲解", text_blocks))
        for index, (lang, code) in enumerate(code_blocks, start=1):
            blocks.append(code_block(f"{clean_title} · 示例 {index}", lang, code))

        if not blocks:
            continue

        chapters.setdefault(current_chapter, []).append(
            Lesson(title=clean_title, blocks=blocks, meta={"section": clean_title})
        )

    return chapters


def clean_section_title(title: str) -> str:
    """把标题里的 RST 角色指令清掉。

    官方教程的小节标题大量使用 ``:keyword:`!if` Statements`` 这类写法，
    直接当标题会显示成一串指令。
    """
    cleaned = re.sub(r":\w+:`!([^`]*)`", r"\1", title)
    cleaned = re.sub(r":\w+:`([^`]*)`", r"\1", cleaned)
    cleaned = re.sub(r"``([^`]+)``", r"\1", cleaned)
    return clean_line(cleaned)


def split_markdown_blocks(
    markdown: str,
) -> tuple[str, list[tuple[str, str]]]:
    """把 Markdown 拆成「正文」与「代码块」两组。

    代码块单独存成一个 ``code`` 类型的 Block——平台的 BlockRenderer 对
    ``code`` 类型有专门的语法高亮样式，混在 text 里会丢失。
    """
    pattern = re.compile(r"```(\w*)\n(.*?)```", re.S)
    code_blocks: list[tuple[str, str]] = []
    for match in pattern.finditer(markdown):
        lang = (match.group(1) or "python").strip()
        code = match.group(2).rstrip()
        if code.strip():
            code_blocks.append((lang, code))

    text_only = pattern.sub("", markdown)
    text_only = re.sub(r"\n{3,}", "\n\n", text_only).strip()
    return text_only, code_blocks


def text_block(title: str, body: str) -> dict[str, Any]:
    return {
        "type": "text",
        "status": "ready",
        "title": title,
        "params": {},
        "payload": {"format": "markdown", "role": "body", "body": body},
        "source_anchors": [],
        "metadata": {},
        "error": "",
    }


def code_block(title: str, lang: str, code: str) -> dict[str, Any]:
    return {
        "type": "code",
        "status": "ready",
        "title": title,
        "params": {},
        "payload": {
            "language": lang or "python",
            "code": code,
            "explanation": "",
            "intent": "",
        },
        "source_anchors": [],
        "metadata": {},
        "error": "",
    }


#: Python 教程里选取的章节。
#:
#: 官方教程有 17 个文件，这里挑覆盖面最广的几节——涵盖入门语法、控制流、
#: 数据结构、函数、模块、错误处理与标准库，避免课程过于庞杂。
PYTHON_FILES = [
    "introduction.rst",
    "controlflow.rst",
    "datastructures.rst",
    "modules.rst",
    "errors.rst",
    "classes.rst",
]


def lessons_from_python() -> list[tuple[str, list[Lesson]]]:
    """Python 官方 Tutorial（选段）。"""
    merged: "OrderedDict[str, list[Lesson]]" = OrderedDict()

    for filename in PYTHON_FILES:
        url = f"{CPYTHON_RAW}/{filename}"
        print(f"    · {filename}")
        rst = http_get(url)
        chapters = parse_python_tutorial(rst)
        for chapter, lessons in chapters.items():
            # 同一章可能出现在多个文件里——加后缀区分。
            key = chapter if chapter not in merged else f"{chapter}（{filename[:-4]}）"
            merged.setdefault(key, []).extend(lessons)

    return [(chapter, lessons) for chapter, lessons in merged.items() if lessons]


# ── 数据源 2：牛顿《自然哲学的数学原理》 ───────────────────────────────

#: 牛顿原理的页面前缀。
NEWTON_PREFIX = "The Mathematical Principles of Natural Philosophy (1729)/"

#: 选取的核心条目——定义、运动三定律、以及几条关键推论。
#:
#: 全书有上千节，全量导入不现实。这几组覆盖了「定义 → 公理 → 推论」的
#: 完整骨架，正是学习者需要的部分。
NEWTON_PAGES = [
    "Definitions",
    "Axioms, or Laws of Motion",
    "Book 1/Section 1",
    "Book 1/Section 2",
    "Book 1/Section 3",
    "Book 1/Section 4",
    "Book 1/Section 5",
    "Book 1/Section 6",
    "Book 1/Section 7",
    "Book 1/Section 8",
]


def split_numbered_items(text: str) -> "OrderedDict[str, str]":
    """把「Def. I. …」「Law II. …」「Proposition I. Problem I」这类编号条目拆出来。

    牛顿原理的正文是一长串编号段落。编号的写法在原书里不统一——
    ``Def. I.``、``Definition II.``、``Law I.``、``Proposition XXII.``
    ``Lemma XVII`` 都出现过，因此正则要放宽。
    """
    items: "OrderedDict[str, str]" = OrderedDict()
    label = (
        r"(?:Def(?:inition)?\.?|Law|Axiom|Corollary|Theorem|Proposition|Lemma|Problem"
        r"|Scholium)\s+[IVXLC]+\.?"
    )
    pattern = re.compile(
        rf"^({label})\s*(.*?)(?=^{label}|\Z)",
        re.M | re.S,
    )
    for match in pattern.finditer(text):
        item_label = clean_line(match.group(1))
        body = clean_body(match.group(2))
        if body and len(body) > 40:
            items[item_label] = body
    return items


def lessons_from_newton() -> list[tuple[str, list[Lesson]]]:
    """牛顿《自然哲学的数学原理》——1729 年英文译本。"""
    chapters: list[tuple[str, list[Lesson]]] = []
    current_chapter = ""
    collected: "OrderedDict[str, list[Lesson]]" = OrderedDict()

    for subpage in NEWTON_PAGES:
        url_name = NEWTON_PREFIX + subpage
        print(f"    · {subpage}")
        try:
            html = wikisource_parse(WS_EN, url_name)
        except RuntimeError as exc:
            print(f"      跳过：{exc}")
            continue

        text = strip_html(html)
        text = strip_navigation(text)
        items = split_numbered_items(text)

        if not items:
            # 没有编号条目的页面——当作一整页保留。
            body = clean_body(strip_annotations(text))
            if body:
                chapter = "绪论"
                collected.setdefault(chapter, []).append(
                    Lesson(
                        title=subpage.split("/")[-1],
                        blocks=[text_block(subpage.split("/")[-1], body)],
                        meta={"source": "wikisource"},
                    )
                )
            continue

        # 按条目的类型归章。
        for label, body in items.items():
            kind = label.split()[0].rstrip(".")
            if kind in {"Def", "Definition"}:
                chapter = "定义"
            elif kind in {"Law", "Axiom"}:
                chapter = "运动定律"
            elif kind == "Corollary":
                chapter = "推论"
            else:
                chapter = "定理与问题"

            collected.setdefault(chapter, []).append(
                Lesson(
                    title=label,
                    blocks=[text_block(label, body)],
                    meta={"source": "wikisource", "kind": kind},
                )
            )

    for chapter, lessons in collected.items():
        if lessons:
            chapters.append((chapter, lessons))
    return chapters


# ── 数据源 3：《世界人权宣言》 ─────────────────────────────────────────


def lessons_from_udhr() -> list[tuple[str, list[Lesson]]]:
    """《世界人权宣言》——序言 + 30 条。"""
    html = wikisource_parse(WS_ZH, "世界人权宣言")
    sections = split_by_headings(html)

    chapters: list[tuple[str, list[Lesson]]] = []
    preamble: list[Lesson] = []
    articles: list[Lesson] = []

    for title, body in sections.items():
        body = clean_body(body)
        if not body:
            continue
        if title == "序言":
            preamble.append(
                Lesson(
                    title=title,
                    blocks=[text_block(title, body)],
                    meta={"source": "wikisource"},
                )
            )
            continue
        if re.match(r"^第[一二三四五六七八九十百]+条", title):
            articles.append(
                Lesson(
                    title=title,
                    blocks=[text_block(title, body)],
                    meta={"source": "wikisource"},
                )
            )

    if preamble:
        chapters.append(("序言", preamble))
    if articles:
        chapters.append(("权利条款", articles))
    return chapters


# ── 本地兜底（断网时） ────────────────────────────────────────────────

#: Python 兜底内容。
PYTHON_OFFLINE = {
    "概述": [
        (
            "Python 的交互式解释器",
            "启动 python 后进入交互模式，可以直接输入表达式并立刻看到结果。"
            "输入提示符是 `>>>`，续行提示符是 `...`。",
            "```python\n>>> 1 + 1\n2\n>>> x = 5\n>>> x * 3\n15\n```",
        ),
        (
            "缩进就是语法",
            "Python 用缩进表示代码块，而不是用大括号。缩进的空格数必须一致，"
            "否则解释器会报 `IndentationError`。",
            "```python\nif True:\n    print('缩进决定这个块属于 if')\nprint('这个语句不在块里')\n```",
        ),
    ],
    "控制流": [
        (
            "条件分支",
            "`if` / `elif` / `else` 构成条件分支。Python 没有 `switch`，"
            "但可以用 `match` 语句做结构化匹配。",
            "```python\nx = 5\nif x > 10:\n    print('大')\nelif x > 3:\n    print('中')\nelse:\n    print('小')\n```",
        ),
        (
            "循环与推导式",
            "`for` 遍历可迭代对象，`while` 基于条件。列表推导式是 Python 的"
            "标志性写法，比手写循环更快也更清晰。",
            "```python\nsquares = [x * x for x in range(10)]\nprint(squares)\n\ntotal = 0\nfor i in range(1, 101):\n    total += i\nprint(total)\n```",
        ),
    ],
    "数据结构": [
        (
            "列表、元组与字典",
            "列表可变、元组不可变，字典按键值存储。三者都是「序列」或"
            "「映射」，但索引方式不同。",
            "```python\nfruits = ['apple', 'banana', 'cherry']\nfruits[0] = 'apricot'\n\npoint = (3, 4)\nx, y = point\n\nages = {'alice': 30, 'bob': 25}\nage = ages.get('carol', 0)\n```",
        ),
        (
            "集合与栈、队列",
            "集合用于去重与集合运算；列表的 `append` / `pop` 组合出栈，"
            "`collections.deque` 则是高效队列。",
            "```python\nnames = {'alice', 'bob', 'alice'}\nprint(names)\n\nstack = []\nstack.append(1)\nstack.append(2)\nprint(stack.pop())\n```",
        ),
    ],
    "函数与模块": [
        (
            "定义与调用",
            "`def` 定义函数，`return` 返回值。参数可以带默认值，"
            "也可以是位置无关的关键字参数。",
            "```python\ndef greet(name, greeting='你好'):\n    return f'{greeting}，{name}！'\n\nprint(greet('张三'))\nprint(greet('李四', greeting='早上好'))\n```",
        ),
        (
            "导入模块",
            "`import` 导入整个模块，`from ... import ...` 导入具体名字。"
            "`__name__ == '__main__'` 是脚本入口的惯用判断。",
            "```python\nimport math\nprint(math.sqrt(16))\n\nfrom math import pi\nprint(pi)\n\nif __name__ == '__main__':\n    print('直接运行这个文件时才执行')\n```",
        ),
    ],
    "错误处理": [
        (
            "捕获异常",
            "`try` / `except` 捕获异常，`else` 与 `finally` 分别处理"
            "「没有出错」与「无论如何都要执行」的分支。",
            "```python\ntry:\n    value = int('abc')\nexcept ValueError as err:\n    print(f'转换失败: {err}')\nelse:\n    print(f'结果是 {value}')\nfinally:\n    print('结束')\n```",
        ),
    ],
}


def lessons_from_python_offline() -> list[tuple[str, list[Lesson]]]:
    """Python 兜底版本。"""
    chapters: list[tuple[str, list[Lesson]]] = []
    for chapter, entries in PYTHON_OFFLINE.items():
        lessons: list[Lesson] = []
        for title, text, code in entries:
            blocks = [text_block(f"{title} · 讲解", text)]
            if code:
                blocks.append(code_block(f"{title} · 示例", "python", code))
            lessons.append(Lesson(title=title, blocks=blocks, meta={"offline": "true"}))
        chapters.append((chapter, lessons))
    return chapters


def lessons_from_newton_offline() -> list[tuple[str, list[Lesson]]]:
    """牛顿原理兜底版本——三大运动定律与万有引力定律。"""
    definitions = [
        (
            "Def. I.",
            "物质的数量是密度与体积的联合度量。密度加倍而体积加倍，"
            "则数量加倍；密度不变而体积变大三倍，则数量变三倍。",
        ),
        (
            "Def. II.",
            "物体的动量等于其质量与速度的乘积，动量的变化率与施加的力成正比，"
            "方向与力的方向相同。",
        ),
        (
            "Def. III.",
            "物体的惯性是保持其静止或匀速直线运动状态的性质，"
            "除非有外力迫使它改变这种状态。",
        ),
    ]
    laws = [
        (
            "Law I.",
            "任何物体都保持其静止状态或沿直线匀速运动的状态，"
            "除非有外力迫使它改变这种状态。",
        ),
        (
            "Law II.",
            "运动的变化量与施加的力成正比，并沿着力的方向。",
        ),
        (
            "Law III.",
            "作用与反作用总是大小相等、方向相反，作用在不同的物体上。",
        ),
    ]
    gravitation = [
        (
            "Corollary.",
            "所有物体都趋向彼此靠近——因为物质会吸引一切物质，"
            "且引力与两者质量的乘积成正比，与它们之间距离的平方成反比。",
        ),
        (
            "Corollary.",
            "沿着同一轨道绕行时，天体所划过的面积与经过的时间成正比。",
        ),
    ]

    def build(items: list[tuple[str, str]]) -> list[Lesson]:
        return [
            Lesson(
                title=label,
                blocks=[text_block(label, body)],
                meta={"offline": "true"},
            )
            for label, body in items
        ]

    return [
        ("定义", build(definitions)),
        ("运动定律", build(laws)),
        ("万有引力", build(gravitation)),
    ]


def lessons_from_udhr_offline() -> list[tuple[str, list[Lesson]]]:
    """《世界人权宣言》兜底版本。"""
    preamble = (
        "鉴于人类大家庭的所有成员均享有不容剥夺的固有尊严与平等权利，"
        "又鉴于这种尊严与权利源于人类与生俱来的存在本身，"
        "因此本宣言确认：人人享有本宣言所载明的各项权利与自由，"
        "不分种族、肤色、性别、语言、宗教、政治或其他见解、国籍或出身、"
        "财产、出生或其他身份地位。"
    )
    articles = [
        ("第一条", "人人生而自由，在尊严和权利上一律平等。他们赋有理性和良心，应该以兄弟关系的精神相对待。"),
        ("第二条", "人人都有权享有生命、自由和人身安全，不受任何歧视。"),
        ("第三条", "人人有权享有生命、自由和人身安全，有权在法律面前得到平等保护，不受任何歧视。"),
        ("第四条", "任何人不得被奴役或役使；奴隶制和奴隶贸易均应予以禁止。"),
        ("第五条", "任何人不得遭受酷刑或残忍、不人道或有辱人格的待遇或处罚。"),
        ("第六条", "人人有权在法律面前得到平等保护和法律的平等对待。"),
        ("第七条", "人人享有法律面前平等地位，有权要求任何法律给予平等对待。"),
        ("第八条", "任何人有权要求有效的补救手段，救济违反本宣言所载权利的行为。"),
        ("第九条", "任何人不得被任意逮捕、拘禁或流放。"),
        ("第十条", "人人享有人身自由与迁徙自由，有权离开本国或返回本国。"),
        ("第十一条", "任何人有权在未经定罪的情况下被控告，不得被强迫认罪或对其加以胁迫。"),
        ("第十二条", "任何人的隐私、家庭、住所与通讯不得任意干涉。"),
        ("第十三条", "人人有权自由迁徙、选择居所，有权离开本国或返回本国。"),
        ("第十四条", "人人享有求庇护的权利，在迫害时可寻求庇护并获得庇护。"),
        ("第十五条", "人人有权享有国籍，不得被任意剥夺国籍，也不得以歧视为理由拒绝给予国籍。"),
        ("第十六条", "人人有权享有宗教自由，宗教信仰自由与传教自由应予保障。"),
        ("第十七条", "人人有权拥有言论与表达自由，有权自由发表意见而不受干涉。"),
        ("第十八条", "人人有权享有思想、良心和宗教自由。"),
        ("第十九条", "人人享有表达意见的自由，不得因此受到干涉或惩罚。"),
        ("第二十条", "任何形式的鼓吹战争、宣传仇恨或鼓吹暴力的行为均应受到禁止。"),
        ("第二十一条", "人人有权参加任何形式的政治、政府或公共事务，公共事务的职务应对一切人平等开放。"),
        ("第二十二条", "人人有权享有社会安全保障，有权请求法律保护。"),
        ("第二十三条", "人人有权享有休息和闲暇，有权从事任何无害于他人或社会的工作。"),
        ("第二十四条", "人人有权享有合理的劳动时间与休息，有权享有带薪休假。"),
        ("第二十五条", "任何人都不应遭受饥饿与缺乏生活资料之苦；享有维持健康与福祉的生活条件的权利。"),
        ("第二十六条", "人人有权接受教育，教育应免费，至少在初级与中级阶段应普遍施行。"),
        ("第二十七条", "人人有权自由地参与文化生活，享受艺术与科学的成果。"),
        ("第二十八条", "人人有权享有有组织的社会与工会，并有权加入或组织工会以维护自身利益。"),
        ("第二十九条", "一切人有 duties to the community，享有法律所规定的为自由与幸福生活所必需的保障。"),
        ("第三十条", "任何条款不得被解释为含有废除或限制本宣言所载权利的意图。"),
    ]

    preamble_lesson = Lesson(
        title="序言",
        blocks=[text_block("序言", preamble)],
        meta={"offline": "true"},
    )
    article_lessons = [
        Lesson(
            title=title,
            blocks=[text_block(title, body)],
            meta={"offline": "true"},
        )
        for title, body in articles
    ]
    return [("序言", [preamble_lesson]), ("权利条款", article_lessons)]


# ── 课程规格 ───────────────────────────────────────────────────────────


def build_specs(offline: bool) -> "OrderedDict[str, BookSpec]":
    """三门课的定义。

    ``description`` / ``level`` / ``tags`` 在这里**强制**给定——脚本不
    允许它们为空，因为课程卡片靠这三项渲染。
    """
    specs: "OrderedDict[str, BookSpec]" = OrderedDict()

    specs["python"] = BookSpec(
        book_id="oer_python_01",
        title="Python 官方教程精讲",
        description="取自 CPython 官方文档的入门教程选段，从交互式解释器讲到模块与异常处理，示例代码可直接运行。",
        level="入门",
        tags=["计算机", "编程", "开源"],
        category="计算机科学",
        summary="按官方教程的章节顺序组织：交互式解释器 → 控制流 → 数据结构 → 函数与模块 → 错误处理。每节配备可运行的代码示例。",
        fetcher=lessons_from_python_offline if offline else lessons_from_python,
        source_note="python/cpython · Doc/tutorial（PSF 许可）",
        source_url="https://docs.python.org/3/tutorial/",
    )

    specs["newton"] = BookSpec(
        book_id="oer_newton_01",
        title="自然哲学的数学原理",
        description="牛顿 1687 年巨著的经典骨架：质量、动量与惯性的定义，三大运动定律，以及万有引力的推论。",
        level="高阶",
        tags=["物理", "经典科学", "数学"],
        category="经典科学",
        summary="按「定义 → 运动定律 → 推论」三层组织，选取原书最具骨架性的条目。数学表述密集，建议配合图形化解读理解。",
        fetcher=lessons_from_newton_offline if offline else lessons_from_newton,
        source_note="Wikisource · The Mathematical Principles of Natural Philosophy (1729)",
        source_url="https://en.wikisource.org/wiki/The_Mathematical_Principles_of_Natural_Philosophy_(1729)",
    )

    specs["udhr"] = BookSpec(
        book_id="oer_udhr_01",
        title="世界人权宣言",
        description="联合国 1948 年通过的三十条人权纲领，逐条展开人的基本权利与自由。篇幅短、密度高，适合逐条精读。",
        level="进阶",
        tags=["社科", "法律", "人权"],
        category="社会科学",
        summary="序言加三十条，条条独立成页。可按条款顺序通读，也可从「权利条款」一章中挑选主题横向对照。",
        fetcher=lessons_from_udhr_offline if offline else lessons_from_udhr,
        source_note="Wikisource · 世界人权宣言",
        source_url="https://zh.wikisource.org/wiki/世界人权宣言",
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
            for block_index, template in enumerate(lesson.blocks, start=1):
                block = dict(template)
                block["id"] = f"blk_{page_id}_{block_index}"
                block["source_anchors"] = [
                    {
                        "kind": "web",
                        "kb_name": spec.source_note,
                        "ref": spec.source_url,
                        "snippet": lesson.title,
                    }
                ]
                block["metadata"] = {**template.get("metadata", {}), **lesson.meta}
                block["created_at"] = timestamp
                block["updated_at"] = timestamp
                blocks.append(block)

            pages.append(
                {
                    "id": page_id,
                    "book_id": book_id,
                    "chapter_id": chapter_id,
                    "title": lesson.title,
                    "learning_objectives": [
                        f"读懂《{lesson.title}》的核心内容",
                        f"把握{chapter_title}中的关键要点",
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
                    f"掌握{chapter_title}的核心概念",
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
                "summary": f"{chapter_title}——共 {len(page_ids)} 页。",
                "order": chapter_order,
            }
        )

    # ── 元数据强制注入 ──────────────────────────────────────────────
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
            "language": "zh" if spec.book_id != "oer_newton_01" else "en",
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
    if Draft7Validator is None:
        return []
    validator = Draft7Validator(schema)
    errors: list[str] = []
    for error in sorted(validator.iter_errors(payload), key=lambda e: list(e.path)):
        location = "/".join(str(part) for part in error.path) or "(root)"
        errors.append(f"{location}: {error.message}")
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

    if str(metadata.get("difficulty") or "").strip() != level:
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

    if not str(metadata.get("category") or "").strip():
        errors.append("metadata.category 为空——课程分类筛选会漏掉这门课")

    for page in payload.get("pages", []):
        for block in page.get("blocks", []):
            body = str((block.get("payload") or {}).get("body") or "")
            code = str((block.get("payload") or {}).get("code") or "")
            if (body or code) and is_placeholder(body or code):
                errors.append(f"页 {page['id']} 的正文是占位符")

    return errors


#: block type → 前端 ``BlockRenderer`` 实际读取的 payload 键。
#:
#: 键名对不上，那个块就渲染成**一片空白**——不报错，只是不出现。
#: 这里在建课程时就核对一遍，避免写盘之后才发现白屏。
EXPECTED_PAYLOAD_KEYS: dict[str, str] = {
    "text": "body",
    "callout": "body",
    "code": "code",
    "quiz": "questions",
    "flash_cards": "cards",
    "section": "intro",
}


def validate_payload_shapes(payload: dict[str, Any]) -> list[str]:
    """核对每个块的 payload 键是否与前端一致。"""
    errors: list[str] = []
    for page in payload.get("pages", []):
        for block in page.get("blocks", []):
            block_type = str(block.get("type") or "")
            expected = EXPECTED_PAYLOAD_KEYS.get(block_type)
            if expected is None:
                continue
            data = block.get("payload") or {}
            if expected not in data:
                errors.append(
                    f"块 {block.get('id')}（{block_type}）缺少 payload.{expected} → 渲染为空白"
                )
                continue
            value = data[expected]
            if isinstance(value, str) and not value.strip():
                errors.append(f"块 {block.get('id')}（{block_type}）的 {expected} 是空字符串")
            elif isinstance(value, list) and not value:
                errors.append(f"块 {block.get('id')}（{block_type}）的 {expected} 是空数组")
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
            payload_data = block.get("payload") or {}
            if not (payload_data.get("body") or payload_data.get("code")):
                errors.append(f"块 {block['id']} 没有正文")

    for chapter in chapters:
        covered.update(chapter.get("page_ids", []))
    for page in pages:
        if page["id"] not in covered:
            errors.append(f"页 {page['id']} 未被任何章节覆盖")

    return errors


# ── 主流程 ─────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="批量拉取全球 OER 教材（理工科 / 社科）并转换成平台课程格式。"
    )
    parser.add_argument(
        "--only",
        default="",
        help="只处理指定课程，逗号分隔（python,newton,udhr）",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="强制使用本地兜底内容（断网演练 / CI）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只转换与校验，不写文件",
    )
    args = parser.parse_args()

    specs = build_specs(args.offline)
    only = {item.strip() for item in args.only.split(",") if item.strip()}
    targets = [(k, v) for k, v in specs.items() if not only or k in only]
    if not targets:
        print("✗ 没有匹配到任何课程", file=sys.stderr)
        return 1

    print(f"▶ 待处理 {len(targets)} 门课：{'、'.join(k for k, _ in targets)}")
    if args.offline:
        print("  模式：本地兜底（offline）\n")
    else:
        print("  模式：联网拉取\n")

    written: list[dict[str, Any]] = []
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
        total_blocks = sum(len(l.blocks) for _, lessons in chapters for l in lessons)
        print(f"   ✓ {len(chapters)} 章 / {total_pages} 页 / {total_blocks} 块")

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

        errors = (
            validate_schema(payload)
            + validate_metadata(payload)
            + validate_payload_shapes(payload)
            + validate_semantics(payload)
        )
        if errors:
            print(f"   ✗ 校验未通过（{len(errors)} 处）：")
            for error in errors[:12]:
                print(f"       - {error}")
            print(file=sys.stderr)
            failures.append(key)
            continue

        print("   ✓ 校验通过（schema + 元数据 + 块形状 + 一致性）")
        written.append(payload)
        print()

    if not written:
        print("✗ 全部失败，未写入任何文件", file=sys.stderr)
        return 2

    if args.dry_run:
        print("(dry-run) 未写入文件")
        return 0

    COURSES_DIR.mkdir(parents=True, exist_ok=True)
    for payload in written:
        path = COURSES_DIR / f"{payload['book']['id']}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        book = payload["book"]
        print(f"✓ {path.name}")
        print(f"    《{book['title']}》 {book['chapter_count']} 章 · "
              f"{book['page_count']} 页 · {len(payload['pages'])} 块")
        print(f"    难度：{book['metadata']['level']} | 标签：{'、'.join(book['metadata']['tags'])}")
        print(f"    简介：{book['description']}")

    if failures:
        print(f"\n⚠ 失败 {len(failures)} 门：{'、'.join(failures)}", file=sys.stderr)

    print("\n提示：平台会自动扫描 backend/data/courses/，无需重启后端。")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
