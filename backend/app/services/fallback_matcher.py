"""
B 站备用源自动补齐引擎
======================

国内公网环境下 YouTube 常常连不上。播放器有自动降级机制（主源探活
失败 → 切备用源），但**备用源必须存在**降级才有意义——没有备用源的
YouTube 课程，一旦主源不通就只剩一个黑框。

这个模块把「补齐备用源」的匹配算法抽成可复用的服务，好让三处共用
同一套逻辑：

* :func:`app.services.patrol_service` —— 定时巡检时顺带补齐；
* :func:`app.services.live_discovery_service` —— 用户现搜现入库后补齐；
* ``tools/fill_fallbacks.py`` —— 命令行批处理（人工补齐历史缺口）。

匹配策略
--------

B 站搜索是**关键词驱动**的，而且中文标题与英文原标题之间往往没有
字面重合。所以我们不能直接把英文标题丢进搜索框——那样命中率极低。

我们采用三层策略，逐层放宽：

.. code-block:: text

    ┌─ 第 1 层：课程「核心词」组 ──────────────┐
    │  从标题里抽出最具辨识度的词组           │
    │  例：MIT 6.046J 算法设计与分析            │
    │       → ["MIT 6.046J", "算法设计与分析"]  │
    └───────────────────┬──────────────────────┘
                        ▼
    ┌─ 第 2 层：原标题直接搜 ──────────────────┐
    │  B 站的搜索会做模糊匹配，中英混排也能命中 │
    └───────────────────┬──────────────────────┘
                        ▼
    ┌─ 第 3 层：学科兜底词 ────────────────────┐
    │  实在搜不到，就用该课程的学科标签再搜一轮 │
    │  例：「机器学习 公开课」                    │
    └──────────────────────────────────────────┘

命中之后还要过**质量关**：

* 时长与原视频接近（允许 ±40% 或 ±15 分钟，取宽的那个）；
* 标题里不含「剪辑 / 速看 / 打卡 / 合集搬运」这类噪声词；
* 标题里**必须**出现至少一个核心词组。

只有全部满足才写入。宁可留空（不写一个错的），也不写一个错的——
错误的备用源会让用户在降级后看到另一门课，那比黑框更糟。
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

from app.services.media_ingestor import (
    GLOBAL_HUB_PATH,
    _bilibili_opener,
    fetch_bilibili_detail,
    fetch_bilibili_search,
)

__all__ = [
    "extract_identity_tokens",
    "extract_query_terms",
    "fill_missing_fallbacks",
    "iter_youtube_without_fallback",
    "match_fallback",
    "match_lecture_fallback",
    "match_series_fallback",
    "score_candidate",
]


# ──────────────────────────────────────────────────────────────────────
# 核心词组抽取
# ──────────────────────────────────────────────────────────────────────

#: 课程代码 / 编号 —— 最具辨识度，优先保留。
#:
#: 例：``MIT 6.046J``、``CS50``、``18.06``、``PHYS 101``。
#:
#: 注意：**单个裸数字不算课程代码**——「Lec 13」「Lecture 2」里的
#: 序号会被误抓，而「MIT MIT 6」这种组合毫无检索价值。所以这里要求
#: 至少两个字符，且不能是纯一位数。
_COURSE_CODE = re.compile(
    r"\b(?:\d{1,2}\.\d{2,3}[A-Z]?|\d{2}\.\d{2}|[A-Z]{2,6}\s?\d{2,4}[A-Z]?)\b"
)

#: 值得单独作为搜索词的机构名。
_INSTITUTIONS = (
    "MIT",
    "Harvard",
    "Yale",
    "Stanford",
    "Berkeley",
    "Princeton",
    "Caltech",
    "Columbia",
    "Cornell",
    "Oxford",
    "Cambridge",
    "Tsinghua",
    "Peking",
    "Fudan",
    "Columbia",
    "清华",
    "北大",
    "复旦",
    "耶鲁",
    "斯坦福",
    "哈佛",
    "麻省理工",
)

#: 值得单独作为搜索词的系列名 / 品牌名。
_SERIES = (
    "CrashCourse",
    "Crash Course",
    "Khan Academy",
    "TED",
    "3Blue1Brown",
    "Veritasium",
    "Vsauce",
    "Coursera",
    "edX",
    "MIT OCW",
    "Full Course",
)

#: 描述「课程形态」的词——它们在中文标题里几乎必然出现。
_SHAPE_WORDS = (
    "公开课",
    "课程",
    "全套",
    "完整版",
    "系统课",
    "精讲",
    "全集",
    "系列",
    "教程",
)

#: 噪声词——命中即淘汰。
_NOISE_WORDS = (
    "剪辑",
    "速看",
    "打卡",
    "合集搬运",
    "搬运合集",
    "录屏",
    "盗录",
    "预告",
    "花絮",
    "reaction",
    "Reaction",
    "REACTION",
)

#: 系列名的**中文别名**。
#:
#: 这是匹配失败的最大原因。B 站上的搬运几乎从不写英文原名——它们写
#: 「速成课」「可汗学院」「麻省理工公开课」。
#:
#: 所以「Crash Course 心理学」这门课，在 B 站上的标题是
#: 「Crash Course心理学速成课：从大脑到社会行为·完整38讲」——
#: 如果不认识「速成课 = Crash Course」这个别名，就永远匹配不上。
#:
#: 双向都要认：既要把中文别名当成身份标记（候选要能命中它），
#: 也要把它作为搜索词（搜「速成课 心理学」比搜英文更准）。
_SERIES_ALIASES: dict[str, tuple[str, ...]] = {
    "Crash Course": ("速成课", "速成"),
    "CrashCourse": ("速成课", "速成"),
    "Khan Academy": ("可汗",),
    "TED": ("TED演讲",),
    "MIT OCW": ("麻省理工公开课",),
    "Harvard": ("哈佛",),
    "Yale": ("耶鲁",),
    "Stanford": ("斯坦福",),
}

#: **强标记**——命中其一即可确认「是同一门课」。
#:
#: 这些词本身就足以把一门课唯一确定：课程代码（``6.046J``）几乎不会
#: 出现在别的课上；机构名（``MIT``）配上课名也足够。
_STRONG_TOKENS = {
    "mit",
    "harvard",
    "yale",
    "stanford",
    "berkeley",
    "princeton",
    "caltech",
    "columbia",
    "cornell",
    "oxford",
    "cambridge",
    "tsinghua",
    "peking",
    "fudan",
    "清华",
    "北大",
    "复旦",
    "耶鲁",
    "斯坦福",
    "哈佛",
    "麻省理工",
    "crashcourse",
    "crash course",
    "khan academy",
    "ted",
    "3blue1brown",
    "veritasium",
    "vsauce",
    "coursera",
    "edx",
    "mit ocw",
    # ── 中文别名 ──
    "速成课",
    "可汗",
}

#: 「整门课」标记——出现它的候选是**全系列**视频。
#:
#: 这是处理「多讲系列」的关键。用户在 YouTube 上看的是
#: ``Lec 13 | MIT 6.046J``（单讲，79 分钟），而 B 站上对应的搬运是
#: 「麻省理工 | 数据结构与算法设计（完整版）MIT 6.046J」（全系列，
#: 39 小时）。
#:
#: 按「单讲」的标准去比对时长，永远匹配不上——但**系列级**的对应
#: 关系恰恰是用户真正需要的：国内看不了 YouTube 时，能连着看完整
#: 一门课，比看得到单讲更有价值。
_FULL_SERIES_MARKERS = (
    "完整版",
    "全集",
    "全套",
    "全系列",
    "全23讲",
    "全24讲",
    "全12集",
    "完结",
    "合集",
    "系列",
    "完整课程",
    "全套课程",
    "全部",
    "完整版",
    "complete",
    "Complete",
    "COMPLETE",
    "full course",
    "Full Course",
    "entire",
)

#: 「分讲」标记 —— 标题里带这些说明它只是**一讲**。
_LECTURE_PART_MARKERS = (
    "lec ",
    "lecture ",
    "lesson ",
    "episode",
    "ep.",
    "part ",
    "第",
    "集",
    "讲",
)

#: 「全 N 讲 / 全 N 集 / 完整 N 讲」的合集模式。
#:
#: 静态标记表覆盖不全——「完整38讲」「40集全」「全24讲」这些写法
#: 太多样。用正则更可靠。
_FULL_SERIES_PATTERN = re.compile(
    r"(?:完整|全套|全|共)\s*\d{1,3}\s*[讲集课]"
    r"|\d{1,3}\s*[讲集]\s*全"
    r"|完整版"
    r"|全集"
    r"|全系列"
    r"|系列课"
    r"|合集"
)


def extract_identity_tokens(
    title: str,
    channel: str = "",
) -> list[str]:
    """抽出「身份标记」——用于判定候选**确实是同一门课**。

    搜索词和身份标记必须分开：

    * **搜索词**决定「B 站搜什么」——可以很宽松（形态词、学科兜底）；
    * **身份标记**决定「这个候选算不算同门课」——必须严格。

    如果用同一套词干两件事，就会出现「搜 计算机与人工智能 公开课 →
    搜到一门 Python 入门课 → 因为标题里有「公开课」就判定同门课」
    这种荒唐匹配。错误的备用源会让用户在降级后看到另一门课，
    那比黑框更糟。

    身份标记只取**高辨识度**的东西：课程代码、机构名、系列名、
    以及标题里的实词与中文主题词。

    **频道名**也是身份标记
    ----------------------
    ``MIT OpenCourseWare`` 这个频道名本身就锁定了「这是 MIT 的课」。
    很多 YouTube 课程的标题里**不带**机构名（只有「12. Greedy
    Algorithms: Minimum Spanning Tree」），但频道名里有——这时候
    频道名就是唯一的身份线索。
    """
    raw = str(title or "").strip()
    if not raw:
        return []

    tokens: list[str] = []

    def push(token: str) -> None:
        cleaned = token.strip(" -—_|、,，.()（）[]【】")
        if len(cleaned) < 2:
            return
        if cleaned.lower() not in {t.lower() for t in tokens}:
            tokens.append(cleaned)

    lowered = raw.lower()

    # 课程代码 —— 最强的身份标记。
    for code in _COURSE_CODE.findall(raw):
        push(code)
    # 机构名。
    for name in _INSTITUTIONS:
        if name.lower() in lowered:
            push(name)
    # 系列名。
    for series in _SERIES:
        if series.lower() in lowered:
            push(series)
    # 系列名的中文别名 —— 「Crash Course」在 B 站上叫「速成课」。
    #
    # 没有这一条，「Crash Course 心理学」这门课就永远匹配不上：
    # 候选标题写的是「Crash Course心理学速成课」，而原标题里
    # 根本没有「速成课」两个字。
    for series, aliases in _SERIES_ALIASES.items():
        if series.lower() in lowered:
            for alias in aliases:
                push(alias)
    # 频道名 —— 机构常藏在频道名里。
    channel_raw = str(channel or "").strip()
    if channel_raw:
        channel_lower = channel_raw.lower()
        for name in _INSTITUTIONS:
            if name.lower() in channel_lower:
                push(name)
        # 「MIT OpenCourseWare」→ 也把整体频道名当标记（弱）。
        if len(channel_raw) >= 4:
            tokens.append(channel_raw)
    # 中文主题词 —— 长度 ≥2 的连续汉字片段。
    for term in re.findall(r"[\u4e00-\u9fff]{2,}", raw):
        push(term)
        # 长中文术语要**再拆一层**。
        #
        # 例：原标题「《纳什均衡与博弈论》精读」抽出「纳什均衡与博弈论」，
        # 而 B 站上的候选写的是「博弈论入门（Game Theory）【纳什均衡、
        # 囚徒困境…】」——原标题那串字**不是**候选标题的子串，但拆开
        # 之后「纳什均衡」「博弈论」两个词都在。
        #
        # 少了这一层拆分，中文技术类课程会系统性地匹配不上。
        for part in re.split(r"[与和及的了或、，,：:／/]", term):
            part = part.strip()
            if len(part) >= 3:
                push(part)
    # 英文实词。
    stopwords = {
        "introduction",
        "lecture",
        "lectures",
        "part",
        "course",
        "full",
        "with",
        "from",
        "the",
        "and",
        "video",
        "series",
        "complete",
        "episode",
        "chapter",
        "lesson",
        "introduction",
        "overview",
        "problem",
        "problems",
    }
    for word in re.findall(r"[A-Za-z][A-Za-z0-9+\-.]{3,}", raw):
        if word.lower() not in stopwords:
            push(word)

    return tokens


def _normalize(text: str) -> str:
    """把标题压成「小写 + 去符号」的比较用形式。"""
    lowered = str(text or "").lower()
    return re.sub(r"[^\w\u4e00-\u9fff]+", " ", lowered).strip()


def extract_query_terms(
    title: str,
    tags: list[str] | None = None,
    channel: str = "",
) -> list[str]:
    """从课程标题里抽出用于 B 站搜索的关键词组。

    返回按「辨识度」从高到低排列的搜索词。第一个是最可能命中的。

    ``channel`` —— YouTube 频道名。它常常是**唯一的机构线索**
    （标题里只有「12. Greedy Algorithms」，机构藏在
    ``MIT OpenCourseWare`` 里）。
    """
    raw = str(title or "").strip()
    if not raw:
        return []

    terms: list[str] = []

    def push(term: str) -> None:
        cleaned = re.sub(r"\s+", " ", term.strip(" -—_|、,，"))
        if len(cleaned) < 3:
            return
        # 去掉「机构 机构」这种重复——「MIT MIT 6」毫无检索价值。
        parts = cleaned.split(" ")
        deduped: list[str] = []
        for part in parts:
            if part not in deduped:
                deduped.append(part)
        cleaned = " ".join(deduped)
        if cleaned not in terms:
            terms.append(cleaned)

    lowered = raw.lower()
    channel_raw = str(channel or "").strip()
    channel_lower = channel_raw.lower()
    codes = _COURSE_CODE.findall(raw)

    # 机构名 —— 标题里没有就找频道名。
    institutions = [name for name in _INSTITUTIONS if name.lower() in lowered]
    for name in _INSTITUTIONS:
        if name.lower() in channel_lower and name not in institutions:
            institutions.append(name)

    chinese_terms = re.findall(r"[\u4e00-\u9fff]{2,}", raw)

    # 英文实词（长度 ≥4，去掉常见虚词）。
    stopwords = {
        "introduction",
        "lecture",
        "lectures",
        "part",
        "course",
        "full",
        "with",
        "from",
        "the",
        "and",
        "video",
        "series",
        "complete",
        "episode",
        "chapter",
        "lesson",
        "overview",
        "problem",
        "problems",
    }
    english_words = [
        word
        for word in re.findall(r"[A-Za-z][A-Za-z0-9+\-.]{3,}", raw)
        if word.lower() not in stopwords
    ]

    # ① 机构 + 课程编号 —— 比如「MIT 6.046J」。
    for institution in institutions:
        for code in codes:
            push(f"{institution} {code}")
        push(institution)

    # ② 编号 + 英文主题词 —— 比裸编号更有检索价值。
    #
    # 例：「6.046J Introduction to Algorithms」在 B 站上更可能写成
    # 「MIT 6.046J 算法设计与分析」或「算法导论 6.046J」，所以
    # 组合「编号 + 主题词」比单独搜编号命中率高得多。
    for code in codes:
        if english_words:
            push(f"{code} {' '.join(english_words[:2])}")
        for term in chinese_terms:
            if len(term) >= 2:
                push(f"{code} {term}")

    # ② 系列名 —— 「CrashCourse 心理学」「TED 拖延症」。
    for series in _SERIES:
        if series.lower() in lowered:
            push(series)
            # 系列名 + 中文主题 —— 命中率最高的一类组合。
            for term in chinese_terms:
                if len(term) >= 2:
                    push(f"{series} {term}")

    # ②' 系列名的中文别名 —— 「速成课 心理学」。
    #
    # B 站上的搬运几乎都写中文别名。搜「速成课 心理学」比搜
    # 「CrashCourse Psychology」命中率高得多——B 站的搜索对
    # 中文的分词更友好。
    for series, aliases in _SERIES_ALIASES.items():
        if series.lower() not in lowered:
            continue
        for alias in aliases:
            push(alias)
            for term in chinese_terms:
                if len(term) >= 2:
                    push(f"{alias} {term}")
            for institution in institutions[:1]:
                push(f"{institution} {alias}")

    # ②' 频道名 —— 机构 + 形态词。
    #
    # 例：频道名「MIT OpenCourseWare」→ 搜「MIT 公开课」。
    # 这是那些**标题里没有机构名**的课程唯一的检索线索。
    if channel_raw:
        for institution in institutions[:1]:
            for shape in _SHAPE_WORDS[:2]:
                push(f"{institution} {shape}")
        for code in codes:
            push(f"{institution} {code}" if institution else code)
        # 频道名去掉「OpenCourseWare / University」这类后缀。
        short_channel = re.sub(
            r"\b(open\s*courseware|university|courses?|official|channel)\b",
            "",
            channel_raw,
            flags=re.IGNORECASE,
        ).strip()
        if len(short_channel) >= 3:
            push(short_channel)

    # ③ 「中文主题 + 形态词」—— 中文课最容易命中的一类。
    #    例：「MIT - 线性代数 第四讲」→ 「线性代数 公开课」。
    for term in chinese_terms:
        if len(term) < 2:
            continue
        for shape in _SHAPE_WORDS:
            push(f"{term} {shape}")
        # 中文主题 + 机构 —— 「算法设计与分析 MIT」。
        for institution in institutions[:1]:
            push(f"{institution} {term}")

    # ④ 英文标题里的实词（长度 ≥4，去掉常见虚词）——
    #    「Introduction to Algorithms」→ 「Introduction Algorithms」。
    if english_words:
        push(" ".join(english_words[:3]))

    # ⑤ 学科兜底词 —— 配合 tags。
    #
    # 注意：tags 是**平台自己打的分类标签**（如「计算机与人工智能」），
    # 不是课程主题。用它兜底能捞到东西，但命中率低——所以排在最后，
    # 且命中后**必须**再通过核心词校验。
    for tag in tags or []:
        cleaned = str(tag).strip()
        if cleaned:
            push(f"{cleaned} 公开课")

    # ⑥ 原标题本身 —— B 站搜索是模糊匹配，中英混排常常也能命中。
    push(raw)

    # ⑦ 「中文主题 + 讲次」。
    #
    # 「14. What matters」这类标题的中文对应是「第14讲」——B 站上
    # 搬运的合集常常按「第N讲」分P或分集，搜「第14讲 + 主题词」
    # 比搜原标题更容易命中。
    episode = re.search(
        r"(?:^|\s)(\d{1,3})\s*[.、:：]\s*|第\s*(\d{1,3})\s*[讲集]",
        raw,
    )
    if episode:
        number = episode.group(1) or episode.group(2)
        for term in chinese_terms[:1]:
            if len(term) >= 2:
                push(f"{term} 第{number}讲")
        for institution in institutions[:1]:
            push(f"{institution} 第{number}讲")

    return terms


# ──────────────────────────────────────────────────────────────────────
# 候选打分
# ──────────────────────────────────────────────────────────────────────


def _duration_ok(source: int, candidate: int) -> bool:
    """时长是否足够接近。

    允许的偏差是「±40% 或 ±4 分钟，取宽的那个」。

    为什么下限只有 4 分钟
    --------------------
    早先用的是「±15 分钟」，结果把一堆**两分钟的剪辑片段**判成了
    合法的备用源——用户点进去发现只有 2 分钟，跟原来的 12 分钟正片
    根本不是一回事。下限收到 4 分钟能挡掉这类短片，同时仍然容许
    搬运版剪掉片头片尾。
    """
    if not source or not candidate:
        # 拿不到时长就别武断淘汰——交给其他关卡判断。
        return True
    tolerance = max(source * 0.4, 240)
    return abs(candidate - source) <= tolerance


def _is_full_series(title: str) -> bool:
    """候选是不是「整门课」的合集视频。

    两道判据取或：

    * 静态标记表（``完整版`` / ``全集`` / ``完结`` …）；
    * 正则（``完整38讲`` / ``40集全`` / ``全24讲`` …）——静态表覆盖
      不全，合集标题的写法太样化。
    """
    lowered = str(title or "").lower()
    if any(marker.lower() in lowered for marker in _FULL_SERIES_MARKERS):
        return True
    return bool(_FULL_SERIES_PATTERN.search(str(title or "")))


def _is_single_lecture(title: str) -> bool:
    """候选是不是「单讲」。"""
    lowered = str(title or "").lower()
    return any(marker.lower() in lowered for marker in _LECTURE_PART_MARKERS)


def _is_strong_token(token: str) -> bool:
    """判断一个身份标记算不算「强标记」。

    强标记的判据是**辨识度**：

    * 课程代码（``6.046J``）——几乎不会出现在别的课上；
    * 机构名 / 系列名——``MIT`` / ``CrashCourse``；
    * **长中文术语**（``纳什均衡``，4 个字以上）——像「公开课」这种
      2 个字的泛词不行，但「纳什均衡」「最小生成树」这种专业术语
      一命中就基本锁定了主题。
    """
    text = str(token or "").strip()
    if not text:
        return False
    if text.lower() in _STRONG_TOKENS:
        return True
    # 长中文术语 —— 专业性足够强。
    if re.fullmatch(r"[\u4e00-\u9fff]{4,}", text):
        return True
    return False


def _strong_tokens(tokens: list[str]) -> list[str]:
    """筛出强标记。"""
    return [token for token in tokens if _is_strong_token(token)]


def _token_hit(title: str, tokens: list[str]) -> tuple[bool, int]:
    """候选标题命中了几个身份标记。

    返回 ``(是否命中, 命中个数)``。
    """
    haystack = _normalize(title)
    # 归一化后还要去掉空格——中文标题里「线性 代数」和「线性代数」
    # 是同一个词，但 ``_normalize`` 会把中间的符号换成空格。
    compact = haystack.replace(" ", "")
    hits = 0
    for token in tokens:
        needle = _normalize(token).replace(" ", "")
        if not needle:
            continue
        if needle in haystack or needle in compact:
            hits += 1
    return hits > 0, hits


def score_candidate(
    candidate: dict[str, Any],
    source: dict[str, Any],
    tokens: list[str],
) -> tuple[bool, float, str]:
    """给一个 B 站候选打分。

    返回 ``(是否可用, 分数, 原因)``。

    两种匹配模式
    ------------
    1. **单讲对单讲**（``exact``）——原视频与候选都是某一讲。
       要求时长接近。
    2. **单讲对全系列**（``series``）——原视频是某门课的一讲，
       候选是整门课的合集。**时长完全不可比**（79 分钟 vs 39 小时），
       所以时长关卡跳过，改用「系列标识」判定。

    为什么第二种模式重要
    --------------------
    想象用户在国内打开「Lec 13 | MIT 6.046J」（79 分钟）——YouTube
    连不上，降级到 B 站。如果备用源是另一讲的视频，用户还得再找一遍；
    如果备用源是**整门课 39 小时的合集**，用户反而能连着看完。

    所以「合集更长」不是缺陷，是**更好的兜底**。
    """
    title = str(candidate.get("title") or "")
    if not title.strip():
        return False, 0.0, "标题为空"
    if _has_noise(title):
        return False, 0.0, "标题命中噪声词"

    source_duration = int(source.get("meta", {}).get("duration") or 0)
    candidate_duration = int(candidate.get("duration") or 0)

    # ── 身份校验 ──
    hit, hit_count = _token_hit(title, tokens)
    if not hit:
        return False, 0.0, "标题未命中任何身份标记"

    strong = _strong_tokens(tokens)
    strong_hit = bool(strong) and _token_hit(title, strong)[0]
    if not strong_hit and hit_count < 2:
        return False, 0.0, f"仅命中 {hit_count} 个弱标记，身份不够确定"

    # ── 模式判定 ──
    candidate_is_series = _is_full_series(title)
    source_is_lecture = _is_single_lecture(str(source.get("title") or ""))

    mode = "exact"
    if candidate_is_series and source_is_lecture:
        mode = "series"
    else:
        # 非系列模式——时长必须接近。
        if not _duration_ok(source_duration, candidate_duration):
            return (
                False,
                0.0,
                f"时长不匹配（原 {source_duration}s / 候选 {candidate_duration}s）",
            )

    # ── 打分 ──
    score = 0.0
    reasons: list[str] = []

    if mode == "series":
        # 系列级匹配——时长不计分，但合集的**品质**计分。
        score += 1.2
        reasons.append("整门课合集")
    else:
        if source_duration and candidate_duration:
            delta = abs(candidate_duration - source_duration) / source_duration
            score += max(0.0, 1.0 - delta)
            reasons.append(f"时长偏差 {delta * 100:.0f}%")
        else:
            score += 0.3

    # 命中**更多**身份标记 → 更可能是同一门课。
    score += min(hit_count, 4) * 0.6
    reasons.append(f"命中 {hit_count} 个标记")

    if strong_hit:
        score += 1.0
        reasons.append("命中强标记")

    # 标题里有「字幕 / 中英 / 双语」——双语版对口型、看字幕更友好。
    if any(word in title for word in ("字幕", "中英", "双语", "英字")):
        score += 0.8
        reasons.append("带字幕")

    # 播放量——权威搬运通常播放量可观。量纲太大，用对数压一下。
    views = int(candidate.get("view") or 0)
    if views > 0:
        import math

        score += min(math.log10(views) / 6.0, 0.6)
        reasons.append(f"播放 {views}")

    return True, score, "；".join(reasons) or "通过"


# ──────────────────────────────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────────────────────────────


def iter_youtube_without_fallback(
    hub: dict[str, Any],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """列出所有缺备用源的 YouTube 课程。

    返回 ``[(分类, 资源), ...]``。
    """
    out: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for category in hub.get("categories") or []:
        for resource in category.get("resources") or []:
            if not isinstance(resource, dict):
                continue
            provider = str(resource.get("provider") or "").strip().lower()
            url = str(resource.get("url") or "")
            is_youtube = provider == "youtube" or "youtube.com" in url
            if not is_youtube:
                continue
            if str(resource.get("fallback_url") or "").strip():
                continue
            out.append((category, resource))
    return out


def _has_noise(title: str) -> bool:
    """标题里有没有噪声词。"""
    lowered = str(title or "").lower()
    return any(word.lower() in lowered for word in _NOISE_WORDS)


def match_fallback(
    opener: Any,
    resource: dict[str, Any],
    *,
    max_terms: int = 6,
    candidates_per_term: int = 12,
) -> tuple[dict[str, Any] | None, str]:
    """为一条 YouTube 课程找一个 B 站备用源。

    返回 ``(候选, 过程说明)``；找不到时 ``候选`` 为 ``None``。
    """
    title = str(resource.get("title") or "")
    tags = [str(tag) for tag in (resource.get("tags") or [])]
    channel = str((resource.get("meta") or {}).get("channel") or "")
    terms = extract_query_terms(title, tags, channel)
    tokens = extract_identity_tokens(title, channel)
    if not terms or not tokens:
        return None, "无法抽取关键词"

    tried: list[str] = []
    best: dict[str, Any] | None = None
    best_score = 0.0
    best_reason = ""

    for term in terms[:max_terms]:
        tried.append(term)
        try:
            candidates = fetch_bilibili_search(
                opener, term, limit=candidates_per_term
            )
        except Exception:  # noqa: BLE001 — 网络抖动不该中断整轮
            continue
        if not candidates:
            continue

        for candidate in candidates:
            ok, score, reason = score_candidate(candidate, resource, tokens)
            if not ok:
                continue
            if score > best_score:
                best_score = score
                best = candidate
                best_reason = reason

        # 已经有足够好的候选（≥2.5）就不再往下搜了——省时间。
        if best_score >= 2.5:
            break

        time.sleep(0.35)

    if best is None:
        return None, f"试过 {len(tried)} 组关键词均无合格候选：{tried[:3]}"

    # 拉详情确认精确时长与真实标题。
    detail = fetch_bilibili_detail(opener, best["bvid"]) or {}
    merged = {**best, **detail}
    ok, _score, reason = score_candidate(merged, resource, tokens)
    if not ok:
        return None, f"详情复核未通过：{reason}"

    return merged, f"{reason}（关键词「{tried[0]}」）"


def match_series_fallback(
    opener: Any,
    resource: dict[str, Any],
    *,
    max_terms: int = 5,
    candidates_per_term: int = 12,
) -> tuple[dict[str, Any] | None, str]:
    """**第二级**：专门找「整门课」的合集视频。

    当严格模式找不到时走这条路。

    为什么需要它
    ------------
    很多 YouTube 课程是**多讲系列**，而 B 站上的搬运往往是把整门课
    合成一个视频：

    ==========================  ==========================
    YouTube                     B 站
    ==========================  ==========================
    ``Lec 13 | MIT 6.046J``      「麻省理工 | 数据结构与算法设计
    （79 分钟）                  （完整版）MIT 6.046J」（39 小时）
    ==========================  ==========================

    严格模式下时长对不上，找不到。但**合集才是更好的兜底**——用户
    在国内连不上 YouTube 时，能连着看完一整门课，比只看得到某
    一讲强得多。

    所以这里放宽三道关：

    * 只要求命中**强标记**（机构 / 系列名 / 课程代码）；
    * 不要求时长接近；
    * 额外加分项：带字幕、合集标记明确。
    """
    title = str(resource.get("title") or "")
    tags = [str(tag) for tag in (resource.get("tags") or [])]
    channel = str((resource.get("meta") or {}).get("channel") or "")
    terms = extract_query_terms(title, tags, channel)
    tokens = extract_identity_tokens(title, channel)

    strong = _strong_tokens(tokens)
    if not strong:
        return None, "没有可用于系列级匹配的强标记"

    tried: list[str] = []
    best: dict[str, Any] | None = None
    best_score = 0.0
    best_reason = ""

    for term in terms[:max_terms]:
        tried.append(term)
        try:
            candidates = fetch_bilibili_search(
                opener, term, limit=candidates_per_term
            )
        except Exception:  # noqa: BLE001
            continue
        if not candidates:
            continue

        for candidate in candidates:
            candidate_title = str(candidate.get("title") or "")
            if _has_noise(candidate_title):
                continue
            if not _is_full_series(candidate_title):
                continue
            hit, hit_count = _token_hit(candidate_title, strong)
            if not hit:
                continue

            score = 1.5 + min(hit_count, 3) * 0.8
            reasons = [f"整门课合集，命中 {hit_count} 个强标记"]
            if any(word in candidate_title for word in ("字幕", "中英", "双语", "英字")):
                score += 1.0
                reasons.append("带字幕")
            views = int(candidate.get("view") or 0)
            if views > 0:
                import math

                score += min(math.log10(views) / 6.0, 0.6)
                reasons.append(f"播放 {views}")

            if score > best_score:
                best_score = score
                best = candidate
                best_reason = "；".join(reasons)

        if best_score >= 3.0:
            break
        time.sleep(0.35)

    if best is None:
        return None, f"第二级试过 {len(tried)} 组关键词也没有整门课合集：{tried[:3]}"

    detail = fetch_bilibili_detail(opener, best["bvid"]) or {}
    merged = {**best, **detail}
    if not _is_full_series(str(merged.get("title") or "")):
        return None, "详情复核：不是合集视频"
    return merged, f"{best_reason}（关键词「{tried[0]}」）"


def match_lecture_fallback(
    opener: Any,
    resource: dict[str, Any],
    *,
    max_terms: int = 8,
    candidates_per_term: int = 12,
) -> tuple[dict[str, Any] | None, str]:
    """**第三级**：找**同一门课的其它一讲**。

    为什么需要这一级
    ----------------
    「哈佛 公正」在 B 站上是 12 集的分集视频，「Crash Course 心理学」
    是 40 集的分集视频。用户看的是第 11 集，找不到第 11 集的搬运
    完全正常——但只要找到**同一门课的第 1 集**，用户连上之后就能
    自己往后翻。

    所以这一级**不要求讲次对应**，只要求「是同一门课」：
    命中课程名 / 系列名即可，时长要求放宽到「不比原片短太多」。

    为什么时长不能完全放开
    ----------------------
    如果完全放开，搜「Crash Course」会捞到「Crash Course 世界历史」
    之类的**别的课**。所以这里要求：候选时长 ≥ 原片的 40%，
    且 ≤ 原片的 3 倍——这样「12 分钟的正片」不会匹配到「3 秒的
    花絮」，「50 分钟的正片」也不会匹配到「5 小时的合集」
    （合集属于第二级的事）。
    """
    title = str(resource.get("title") or "")
    tags = [str(tag) for tag in (resource.get("tags") or [])]
    channel = str((resource.get("meta") or {}).get("channel") or "")
    terms = extract_query_terms(title, tags, channel)
    tokens = extract_identity_tokens(title, channel)
    source_duration = int((resource.get("meta") or {}).get("duration") or 0)

    # 这一级需要**至少两个**弱标记同时命中——单个词太容易撞车。
    if len(tokens) < 2:
        return None, "身份标记不足，无法判定同门课"

    tried: list[str] = []
    best: dict[str, Any] | None = None
    best_score = 0.0
    best_reason = ""

    for term in terms[:max_terms]:
        tried.append(term)
        try:
            candidates = fetch_bilibili_search(
                opener, term, limit=candidates_per_term
            )
        except Exception:  # noqa: BLE001
            continue
        if not candidates:
            continue

        for candidate in candidates:
            candidate_title = str(candidate.get("title") or "")
            if _has_noise(candidate_title):
                continue

            candidate_duration = int(candidate.get("duration") or 0)

            # ── 合集模式：时长完全不可比 ──────────────────────────
            #
            # 「Crash Course 心理学 #11」（11 分钟）对应的搬运是
            # 「Crash Course心理学速成课·完整38讲」（7 小时）。拿
            # 时长窗口去卡它，一辈子匹配不上。
            if _is_full_series(candidate_title):
                hit, hit_count = _token_hit(candidate_title, tokens)
                if hit_count < 1:
                    continue
                score = 1.4 + min(hit_count, 4) * 0.6
                reasons = [f"整门课合集，命中 {hit_count} 个标记"]
                if any(
                    word in candidate_title
                    for word in ("字幕", "中英", "双语", "英字")
                ):
                    score += 0.8
                    reasons.append("带字幕")
                views = int(candidate.get("view") or 0)
                if views > 0:
                    import math

                    score += min(math.log10(views) / 6.0, 0.6)
                    reasons.append(f"播放 {views}")
                if score > best_score:
                    best_score = score
                    best = candidate
                    best_reason = "；".join(reasons)
                continue

            # ── 单讲模式：时长窗口 = 原片的 40% ~ 3 倍 ─────────────
            #
            # 如果完全放开，搜「Crash Course」会捞到「Crash Course 世界历史」
            # 之类的**别的课**。所以这里要求：候选时长 ≥ 原片的 40%，
            # 且 ≤ 原片的 3 倍——这样「12 分钟的正片」不会匹配到「3 秒的
            # 花絮」，「50 分钟的正片」也不会匹配到「5 小时的合集」
            # （合集属于上面的分支）。
            if source_duration and candidate_duration:
                if candidate_duration < source_duration * 0.4:
                    continue
                if candidate_duration > source_duration * 3:
                    continue

            hit, hit_count = _token_hit(candidate_title, tokens)
            if hit_count < 2:
                continue

            score = min(hit_count, 4) * 0.7
            reasons = [f"同门课，命中 {hit_count} 个标记"]
            if any(
                word in candidate_title
                for word in ("字幕", "中英", "双语", "英字")
            ):
                score += 0.8
                reasons.append("带字幕")
            views = int(candidate.get("view") or 0)
            if views > 0:
                import math

                score += min(math.log10(views) / 6.0, 0.6)
                reasons.append(f"播放 {views}")

            if score > best_score:
                best_score = score
                best = candidate
                best_reason = "；".join(reasons)

        if best_score >= 2.6:
            break
        time.sleep(0.35)

    if best is None:
        return None, f"第三级试过 {len(tried)} 组关键词也没有同门课：{tried[:3]}"

    detail = fetch_bilibili_detail(opener, best["bvid"]) or {}
    merged = {**best, **detail}
    return merged, f"{best_reason}（关键词「{tried[0]}」）"


# ──────────────────────────────────────────────────────────────────────
# 自动补齐
# ──────────────────────────────────────────────────────────────────────


def fill_missing_fallbacks(
    hub: dict[str, Any],
    *,
    limit: int = 0,
    dry_run: bool = False,
    log: Any = None,
) -> dict[str, Any]:
    """给所有缺备用源的 YouTube 课程补上 B 站备用源。

    这是 :func:`iter_youtube_without_fallback` + 三级匹配的组合体。
    巡检与现搜现入库之后都会调它——**覆盖率不该回退**。

    ``limit`` —— 最多补几条（``0`` = 不限）。
    ``dry_run`` —— 只报告不写盘。

    返回统计::

        {"filled": 3, "failed": 1, "total": 4, "changes": [...]}
    """
    emit = log or (lambda message: None)
    opener = _bilibili_opener()

    targets = iter_youtube_without_fallback(hub)
    if limit > 0:
        targets = targets[:limit]

    filled = 0
    failed = 0
    changes: list[tuple[dict[str, Any], str]] = []

    for index, (_category, resource) in enumerate(targets, start=1):
        title = str(resource.get("title") or "")[:52]

        # 三级匹配：严格 → 系列合集 → 同课程其它讲。
        candidate, reason = match_fallback(opener, resource)
        mode = "严格匹配"

        if candidate is None:
            candidate, reason = match_series_fallback(opener, resource)
            mode = "系列合集"

        if candidate is None:
            candidate, reason = match_lecture_fallback(opener, resource)
            mode = "同课程其它讲"

        if candidate is None:
            failed += 1
            emit(f"  ✗ [{index}/{len(targets)}] {title} —— {reason}")
            continue

        bvid = candidate["bvid"]
        fallback_url = f"https://www.bilibili.com/video/{bvid}"
        filled += 1
        changes.append((resource, fallback_url))
        emit(f"  ✓ [{index}/{len(targets)}] {title} → {bvid}（{mode}）")

    if not dry_run:
        for resource, fallback_url in changes:
            resource["fallback_url"] = fallback_url

    return {
        "filled": filled,
        "failed": failed,
        "total": len(targets),
        "changes": changes,
    }


def coverage(hub: dict[str, Any]) -> dict[str, Any]:
    """统计 YouTube 备用源覆盖率。"""
    total = 0
    with_fallback = 0
    for category in hub.get("categories") or []:
        for resource in category.get("resources") or []:
            if not isinstance(resource, dict):
                continue
            provider = str(resource.get("provider") or "").strip().lower()
            url = str(resource.get("url") or "")
            if not (provider == "youtube" or "youtube.com" in url):
                continue
            total += 1
            if str(resource.get("fallback_url") or "").strip():
                with_fallback += 1
    percent = round(with_fallback / total * 100, 1) if total else 0.0
    return {
        "total": total,
        "with_fallback": with_fallback,
        "percent": percent,
    }
