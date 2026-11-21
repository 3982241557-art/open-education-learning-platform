"""
文本归一化
==========

入库前的**强制清洗**：繁体转简体、多余空白压缩、零宽字符清除。

为什么必须做
------------

平台的语料有三类来源，繁简混杂：

* **公版古籍**（chinese-poetry / Wikisource）—— 原文就是繁体；
* **维基百科与 OER 教材** —— 简体为主，但夹着繁体专名；
* **用户导入的任意文本** —— 完全不可控。

不归一的后果不是「不好看」，而是**功能失效**：

* 标签词表是简体的（「古文」「诗词」），繁体原文永远命中不了，
  标签会退化成一堆无意义的原文片段；
* 搜索「之乎者也」找不到「之乎者也」（繁体）的内容；
* 用户在阅读器里搜自己记得的那句话，搜不到。

转换策略
--------

优先用 **OpenCC**（``opencc-python-reimplemented``）——它做的是
词组级转换，能正确处理「乾淨」这类一简对多繁的字。

OpenCC 不可用时，退回到 :mod:`app.services._t2s_table` 里的
**字符级对照表**。那张表由 OpenCC 的 ``TSCharacters.txt`` 裁剪而来，
覆盖语料里真实出现过的繁体字。它处理不了一简对多繁的歧义
（「乾」既可能是「干」也可能是「乾」），但在这种极端情况下，
错字率远低于「完全不转」。

为什么不用 OpenCC 的完整词组词典
------------------------------

完整词典有几 MB，每次导入都要加载并遍历。语料里的繁体字其实集中在
两三千个常用字上，一张裁剪过的字符表已经覆盖 99% 的实际用字，
而且是**纯 Python dict**——没有额外依赖，没有加载开销。
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

#: OpenCC 转换器（惰性初始化）。
_CONVERTER: Any = None
_CONVERTER_READY = False

#: 零宽字符与方向控制符——从 PDF / 网页复制时会带进来。
#:
#: 用**显式码点**而不是字面量：这些字符大多不可见，直接写进源码
#: 既容易在编辑器里被误删，也会让正则里的 ``-`` 变成范围符号。
_INVISIBLE_CODEPOINTS = (
    0x00AD,  # 软连字
    0x200B,  # 零宽空格
    0x200C,  # 零宽非连接符
    0x200D,  # 零宽连接符
    0x2060,  # 单词连接符
    0x2061,  # 函数应用
    0x2062,  # 不可见乘法
    0x2063,  # 不可见加法
    0x2064,  # 不可见减法
    0xFEFF,  # BOM / ZWNBSP
    0x202A,  # 方向嵌入起
    0x202B,  # 方向嵌入起
    0x202C,  # 方向嵌入止
    0x202D,  # 方向覆盖起
    0x202E,  # 方向覆盖止
    0x2066,  # 方向隔离起
    0x2067,  # 方向隔离起
    0x2068,  # 方向隔离首
    0x2069,  # 方向隔离止
)

_INVISIBLE_RE = re.compile(
    "[" + "".join(chr(code) for code in _INVISIBLE_CODEPOINTS) + "]"
)

#: 连续三个以上空行压成两个。
_MULTI_BLANK_RE = re.compile(r"\n{3,}")

#: 行尾空白。
_TRAILING_WS_RE = re.compile(r"[ \t]+\n")


def _get_converter() -> Any:
    """惰性获取 OpenCC 转换器。

    失败时返回 ``None``，调用方自动降级到字符表。
    """
    global _CONVERTER, _CONVERTER_READY

    if _CONVERTER_READY:
        return _CONVERTER

    _CONVERTER_READY = True
    try:
        import opencc

        _CONVERTER = opencc.OpenCC("t2s")
    except Exception as exc:  # pragma: no cover - 依赖缺失时降级
        logger.info("OpenCC 不可用（%s），繁体转换降级为字符表对照", exc)
        _CONVERTER = None

    return _CONVERTER


def to_simplified(text: str) -> str:
    """把繁体文本转换成简体。

    这是**幂等**的——已经是简体的文本原样返回。
    """
    if not text:
        return text

    converter = _get_converter()
    if converter is not None:
        try:
            return converter.convert(text)
        except Exception as exc:  # pragma: no cover
            logger.warning("OpenCC 转换失败，降级为字符表：%s", exc)

    return _to_simplified_by_table(text)


def _to_simplified_by_table(text: str) -> str:
    """用字符对照表转换（OpenCC 不可用时的降级路径）。"""
    from app.services._t2s_table import T2S

    if not T2S:
        return text
    return "".join(T2S.get(char, char) for char in text)


def is_traditional(text: str) -> bool:
    """判断文本里是否还有繁体字。

    用于「入库前自检」——转换之后跑一次，确认真的干净了。
    """
    sample = str(text or "")[:5000]
    if not sample:
        return False

    converter = _get_converter()
    if converter is not None:
        try:
            return converter.convert(sample) != sample
        except Exception:  # pragma: no cover
            pass

    from app.services._t2s_table import T2S

    return any(char in T2S for char in sample)


def strip_invisible(text: str) -> str:
    """清掉零宽字符与双向控制符。"""
    return _INVISIBLE_RE.sub("", text or "")


def normalize_whitespace(text: str) -> str:
    """压缩多余空白：行尾空白清掉，连续空行压到最多两个。"""
    cleaned = _TRAILING_WS_RE.sub("\n", text or "")
    cleaned = _MULTI_BLANK_RE.sub("\n\n", cleaned)
    return cleaned.strip()


def normalize_text(text: str) -> str:
    """入库前的完整归一化。

    顺序很重要：

    1. 先清零宽字符——它们会干扰 OpenCC 的字符识别；
    2. 再转繁为简；
    3. 最后压空白——转换可能留下新的空行。
    """
    if not text:
        return ""

    cleaned = strip_invisible(text)
    cleaned = to_simplified(cleaned)
    cleaned = normalize_whitespace(cleaned)
    return cleaned


def normalize_payload(payload: Any) -> Any:
    """递归归一化一个 JSON 结构里的所有字符串。

    课程数据的正文散落在 ``payload.body`` / ``payload.cards[].front`` /
    ``payload.questions[].options`` 等各处。与其在每个字段上记得调用
    :func:`normalize_text`，不如整体递归一遍——**漏一处**就意味着
    界面上有一处繁体漏网。
    """
    if isinstance(payload, str):
        return normalize_text(payload)
    if isinstance(payload, list):
        return [normalize_payload(item) for item in payload]
    if isinstance(payload, dict):
        return {key: normalize_payload(value) for key, value in payload.items()}
    return payload


__all__ = [
    "is_traditional",
    "normalize_payload",
    "normalize_text",
    "normalize_whitespace",
    "strip_invisible",
    "to_simplified",
]
