"""
三级真实时间轴证据链提取器
==========================

给视频装配「自学框架」之前，**必须先拿到真实的时间轴信号**。

问题出在哪
----------

让模型「看标题 + 简介，编 5 个重点提示点」，得到的时间戳几乎必然
是**幻觉**——模型不知道第 12 分 35 秒在讲什么，它只是按「公开课大概
这个节奏」估了个数。用户点那个气泡跳过去，画面上讲的却是另一件事。

这就是「文不对题」的根源：不是模型不聪明，是**输入里根本没有时间轴
证据**。

三级证据链
----------

.. code-block:: text

    Tier 1 ── 原生章节 / 简介时间码（黄金锚点）
       │        YouTube: yt-dlp info dict 的 chapters[]
       │        B 站:    player/v2 的 view_points[]
       │        简介:    正则扫 "00:00 导言 / 12:35 纳什均衡证明"
       │
       ├─ 没有？ ──▶ Tier 2 ── 公开字幕轨切片
       │            YouTube: --write-auto-sub 拉 json3
       │            B 站:    player/v2 的 subtitle.subtitles
       │            按每 3~5 分钟聚合成段落锚点
       │
       └─ 还没有？ ──▶ Tier 3 ── 教学法节奏推演
                     基于**精确总时长** + 标题 + 完整简介
                     按经典学术公开课的黄金叙事比例计算 5 个阶段锚点
                     （2% 破题 / 10% 核心定义 / 35% 机制拆解
                       / 65% 案例对照 / 85% 边界延伸）

三条铁律
--------

1. **锚点必须来自外部事实**。Tier 3 虽然是推演，但它推演的对象是
   **真实总时长**——时长是 API 给的精确数字，不是猜的。
2. **Tier 3 严禁伪造逐字原话**。没有字幕就是没有字幕——推演出来的
   只有「这一段大概在讲什么」，不能写成「讲师原话」。
3. **模型只能选锚点，不能造锚点**。:mod:`app.services.ai_structurer`
   会把模型返回的时间戳**吸附**到最近的真实锚点上，超出容差的直接
   丢弃。这是「杜绝瞎猜」的最后一道闸。

跨平台差异
----------

**YouTube** 用 ``yt-dlp`` 一次 ``--dump-single-json`` 就能同时拿到
``chapters`` 与字幕轨的直链——一次往返解决两级证据。

**B 站** 用 ``player/v2`` 接口拿 ``view_points``（官方章节）与
``subtitle.subtitles``（字幕直链）。但 B 站的字幕**绝大多数视频都没有**
（需要 UP 主投稿时挂载），章节也极少用——所以 B 站视频经常落到
Tier 3，这不是 bug，是数据现实。
"""

from __future__ import annotations

import asyncio
import http.cookiejar
import json
import re
import ssl
import subprocess
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:  # pragma: no cover - certifi 只是让 SSL 链在 macOS 上更稳
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL_CTX = ssl.create_default_context()

#: 与采集器一致的 UA。
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

#: 简介里的时间码格式——``00:00`` / ``12:35`` / ``1:02:03``。
#:
#: 要求**冒号前必须有数字**，且后面可选地跟一个空格 + 标题文字。
#: 这样 ``https://example.com:8080/path`` 里的 ``:8080`` 不会被误判。
_TIME_CODE_PATTERN = re.compile(
    r"(?<![\d:])(\d{1,2}:[0-5]\d:[0-5]\d|\d{1,3}:[0-5]\d)\s*[—\-–|、.·]?\s*([^\n]{0,60})"
)

#: 标题里常见的噪声前缀——``[中英字幕]`` / ``【高清】`` 之类。
_BRACKET_PREFIX = re.compile(r"^\s*[\[【（(][^\]】）)]{0,20}[\]】）)]\s*")

#: 简介里明显的广告/外链行——这些不该被当成章节标题。
_NOISE_LINE = re.compile(
    r"(https?://|www\.|加群|QQ群|微信|公众号|转载|投稿|商务|合作|"
    r"课程资料|付费|领取|扫码|更多资源|关注我)",
    re.IGNORECASE,
)


class EvidenceError(RuntimeError):
    """证据提取失败。"""


# ──────────────────────────────────────────────────────────────────────
# 数据结构
# ──────────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class TimeAnchor:
    """一个**真实时间轴锚点**。

    锚点是「模型唯一被允许使用的时间戳」。装配器会把模型选中的
    时间戳吸附到某个锚点上——所以模型只能**在锚点之间做选择**，
    不能凭空发明一个时刻。
    """

    #: 锚点时刻（秒）。
    timestamp: float
    #: 锚点标题——章节名 / 段落主题 / 阶段名。
    title: str
    #: 锚点来源——``chapter`` / ``description`` / ``transcript`` / ``pacing``。
    origin: str = "chapter"
    #: 该锚点覆盖的段落文字摘要（Tier 2 有，Tier 1/3 没有）。
    digest: str = ""


@dataclass(slots=True)
class TranscriptCue:
    """一条字幕。"""

    start: float
    text: str


@dataclass(slots=True)
class Evidence:
    """一条视频的全部时间轴证据。"""

    #: 视频总时长（秒）。
    duration: int = 0
    #: 证据等级——1 / 2 / 3。
    tier: int = 3
    #: 等级说明（给日志看）。
    tier_reason: str = ""
    #: 可供模型选择的锚点（按时间升序）。
    anchors: list[TimeAnchor] = field(default_factory=list)
    #: 字幕轨（Tier 2 有）。
    cues: list[TranscriptCue] = field(default_factory=list)
    #: 视频简介。
    description: str = ""

    @property
    def has_transcript(self) -> bool:
        """是否拿到了真实字幕。"""
        return bool(self.cues)

    def to_dict(self) -> dict[str, Any]:
        return {
            "duration": self.duration,
            "tier": self.tier,
            "tier_reason": self.tier_reason,
            "anchors": [
                {
                    "timestamp": item.timestamp,
                    "title": item.title,
                    "origin": item.origin,
                    "digest": item.digest,
                }
                for item in self.anchors
            ],
            "cue_count": len(self.cues),
        }


# ──────────────────────────────────────────────────────────────────────
# Tier 1：简介时间码 & 原生章节
# ──────────────────────────────────────────────────────────────────────


def parse_description_timecodes(description: str) -> list[TimeAnchor]:
    """从简介里扫出时间码目录。

    形如::

        00:00 导言
        12:35 纳什均衡证明
        1:02:03 跨学科延伸

    这是**作者手写的时间轴**——比任何推演都准。

    过滤规则：

    * 时间码后面必须**有内容**（或至少是行首）才算一个锚点；
    * 同一行出现多个时间码时，取**第一个**；
    * 标题里带外链 / 广告词的不算；
    * 时间码必须落在 ``0 < t < duration``（时长未知时只要求 ``t >= 0``）。
    """
    text = str(description or "")
    if not text.strip():
        return []

    anchors: list[TimeAnchor] = []
    seen: set[int] = set()

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        match = _TIME_CODE_PATTERN.search(stripped)
        if not match:
            continue

        seconds = _parse_time_code(match.group(1))
        if seconds is None or seconds < 0:
            continue

        # 标题 = 时间码之后的文字。
        title = (match.group(2) or "").strip()
        title = _BRACKET_PREFIX.sub("", title)
        title = re.sub(r"\s{2,}", " ", title).strip(" -—–|、.·:：")
        # 只取标题的第一个短句——目录项通常很短。
        title = re.split(r"[，,。;；]", title)[0].strip()

        if not title or _NOISE_LINE.search(title):
            continue
        if len(title) > 40:
            title = title[:40]

        bucket = int(seconds)
        if bucket in seen:
            continue
        seen.add(bucket)

        anchors.append(
            TimeAnchor(
                timestamp=float(seconds),
                title=title,
                origin="description",
            )
        )

    anchors.sort(key=lambda item: item.timestamp)
    return anchors


def _parse_time_code(text: str) -> float | None:
    """把 ``12:35`` / ``1:02:03`` 解析成秒。

    按冒号个数数段——两段是 ``mm:ss``，三段是 ``hh:mm:ss``。
    """
    parts = str(text or "").strip().split(":")
    if len(parts) > 3:
        return None
    try:
        numbers = [float(part) for part in parts]
    except ValueError:
        return None
    if any(number < 0 for number in numbers):
        return None
    if len(numbers) == 1:
        return numbers[0]
    if len(numbers) == 2:
        minutes, seconds = numbers
        return minutes * 60 + seconds
    hours, minutes, seconds = numbers
    return hours * 3600 + minutes * 60 + seconds


def normalize_chapters(raw: Any, duration: int = 0) -> list[TimeAnchor]:
    """把 yt-dlp 的 ``chapters`` 数组归一成锚点。

    yt-dlp 的 chapter 形如::

        {"start_time": 46.0, "end_time": 91.0, "title": "Early Thinkers"}
    """
    if not isinstance(raw, list):
        return []

    anchors: list[TimeAnchor] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        start = item.get("start_time")
        if start is None:
            start = item.get("start")
        try:
            seconds = float(start)
        except (TypeError, ValueError):
            continue
        if seconds < 0:
            continue
        if duration and seconds >= duration:
            continue

        title = str(item.get("title") or "").strip()
        title = _BRACKET_PREFIX.sub("", title).strip()
        if not title:
            title = f"第 {len(anchors) + 1} 节"

        anchors.append(
            TimeAnchor(
                timestamp=round(seconds, 3),
                title=title[:60],
                origin="chapter",
            )
        )

    anchors.sort(key=lambda item: item.timestamp)
    return anchors


# ──────────────────────────────────────────────────────────────────────
# Tier 3：教学法节奏推演
# ──────────────────────────────────────────────────────────────────────

#: 经典学术公开课的黄金叙事比例。
#:
#: 这套比例来自通识公开课的通行结构——破题 → 定义 → 机制 → 案例 →
#: 边界。它**不是**对具体视频内容的断言，只是「一门 90 分钟的课大概
#: 在什么阶段做什么事」的经验分布。
PEDAGOGICAL_RATIOS: tuple[tuple[float, str], ...] = (
    (0.02, "破题：为什么这个问题值得问"),
    (0.10, "核心定义与问题边界"),
    (0.35, "核心定理 / 机制拆解"),
    (0.65, "经典案例与实验对照"),
    (0.85, "思想边界与跨学科延伸"),
)


def pedagogical_pacing(duration: int) -> list[TimeAnchor]:
    """按教学法黄金比例推演阶段锚点。

    这是**最后一级**证据——只有在既无章节又无字幕时才用。

    它推演的对象是**精确总时长**：时长是平台 API 给的确定数字，
    所以锚点虽然不是「内容事实」，但也绝不是瞎猜的随机数。

    ``duration`` 拿不到时返回空列表——没有时长就没法推演，硬编一个
    反而违背整个设计的前提。
    """
    total = int(duration or 0)
    if total <= 0:
        return []

    anchors: list[TimeAnchor] = []
    for ratio, title in PEDAGOGICAL_RATIOS:
        seconds = round(total * ratio, 1)
        if seconds >= total:
            continue
        anchors.append(
            TimeAnchor(
                timestamp=seconds,
                title=title,
                origin="pacing",
            )
        )
    return anchors


# ──────────────────────────────────────────────────────────────────────
# Tier 2：字幕轨
# ──────────────────────────────────────────────────────────────────────


def aggregate_cues(
    cues: list[TranscriptCue],
    *,
    window_seconds: int = 240,
    max_segments: int = 12,
) -> list[TimeAnchor]:
    """把字幕按时间窗聚合成段落锚点。

    每 ``window_seconds`` 秒聚成一段，取该段前若干秒的字幕做摘要。

    为什么要聚合而不是逐句当锚点：一条 80 分钟的课有上千句字幕，
    全塞给模型既超上下文又没重点。按 3~5 分钟切段之后，得到的正是
    「这一段在讲什么」这个粒度——和用户真正会 seek 的粒度一致。
    """
    if not cues:
        return []

    ordered = sorted(cues, key=lambda item: item.start)
    anchors: list[TimeAnchor] = []

    bucket_start = ordered[0].start
    bucket: list[TranscriptCue] = []

    def _flush(start: float, items: list[TranscriptCue]) -> None:
        if not items:
            return
        digest = " ".join(item.text.strip() for item in items).strip()
        digest = re.sub(r"\s{2,}", " ", digest)
        anchors.append(
            TimeAnchor(
                timestamp=round(start, 3),
                title=f"第 {len(anchors) + 1} 段（{int(start) // 60:02d}:{int(start) % 60:02d} 起）",
                origin="transcript",
                digest=digest[:600],
            )
        )

    for cue in ordered:
        if cue.start - bucket_start >= window_seconds and bucket:
            _flush(bucket_start, bucket)
            bucket = []
            bucket_start = cue.start
        bucket.append(cue)

    _flush(bucket_start, bucket)

    # 段落太多时均匀抽稀——保留首尾，控制在模型能消化的量级。
    if len(anchors) > max_segments:
        step = len(anchors) / max_segments
        picked = [anchors[int(index * step)] for index in range(max_segments)]
        if anchors[-1] is not picked[-1]:
            picked[-1] = anchors[-1]
        anchors = picked

    return anchors


def parse_json3_cues(payload: dict[str, Any]) -> list[TranscriptCue]:
    """解析 YouTube 的 ``json3`` 字幕格式。

    形如::

        {"events": [{"tStartMs": 539, "segs": [{"utf8": "That dream"}]}]}
    """
    cues: list[TranscriptCue] = []
    for event in payload.get("events") or []:
        if not isinstance(event, dict):
            continue
        segs = event.get("segs")
        if not isinstance(segs, list):
            continue
        text = "".join(
            str(seg.get("utf8") or "") for seg in segs if isinstance(seg, dict)
        ).replace("\n", " ").strip()
        if not text:
            continue
        start_ms = event.get("tStartMs")
        try:
            start = float(start_ms or 0) / 1000.0
        except (TypeError, ValueError):
            continue
        cues.append(TranscriptCue(start=round(start, 3), text=text))
    return cues


def parse_bilibili_cues(payload: dict[str, Any]) -> list[TranscriptCue]:
    """解析 B 站字幕接口的 ``body`` 格式。

    形如::

        {"body": [{"from": 0.0, "to": 3.2, "content": "第一句话"}]}
    """
    cues: list[TranscriptCue] = []
    for item in payload.get("body") or []:
        if not isinstance(item, dict):
            continue
        text = str(item.get("content") or "").strip()
        if not text:
            continue
        try:
            start = float(item.get("from") or 0.0)
        except (TypeError, ValueError):
            continue
        cues.append(TranscriptCue(start=round(start, 3), text=text))
    return cues


# ──────────────────────────────────────────────────────────────────────
# HTTP 基础设施
# ──────────────────────────────────────────────────────────────────────


def _bilibili_opener() -> urllib.request.OpenerDirector:
    """构造带 cookie 的 B 站 opener。

    没有 ``buvid3`` cookie 时 B 站接口会返回 412（反爬前置条件失败）。
    """
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=_SSL_CTX),
    )
    opener.addheaders = [
        ("User-Agent", USER_AGENT),
        ("Referer", "https://www.bilibili.com/"),
    ]
    try:
        opener.open("https://www.bilibili.com/", timeout=20).read()
    except Exception:  # noqa: BLE001 — 首页拿不到 cookie 时后续请求再说
        pass
    return opener


def _http_get_json(url: str, *, referer: str = "", timeout: int = 25) -> dict[str, Any]:
    """带 cookie / SSL 上下文的 JSON GET。"""
    opener = _bilibili_opener()
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Referer": referer or "https://www.bilibili.com/",
        },
    )
    raw = opener.open(request, timeout=timeout).read()
    return json.loads(raw.decode("utf-8", "ignore"))


def _http_get_bytes(url: str, *, timeout: int = 30) -> bytes:
    opener = _bilibili_opener()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return opener.open(request, timeout=timeout).read()


# ──────────────────────────────────────────────────────────────────────
# 平台通道
# ──────────────────────────────────────────────────────────────────────


def _ytdlp_executable() -> str:
    """找到 ``yt-dlp`` 可执行文件。"""
    import sys
    from shutil import which

    candidate = Path(sys.executable).parent / "yt-dlp"
    if candidate.exists():
        return str(candidate)
    found = which("yt-dlp")
    if found:
        return found
    raise EvidenceError("找不到 yt-dlp。请在运行环境里执行 `pip install yt-dlp`。")


def _run_ytdlp_json(url: str, *, timeout: int = 180) -> dict[str, Any]:
    """跑一次 ``yt-dlp --dump-single-json``。

    一次往返同时拿到 ``chapters`` 与字幕轨直链——两级证据一次搞定。
    """
    command = [
        _ytdlp_executable(),
        "--no-warnings",
        "--ignore-config",
        "--skip-download",
        "--dump-single-json",
        url,
    ]
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0 or not completed.stdout.strip():
        raise EvidenceError(
            f"yt-dlp 抓取失败（{completed.returncode}）：{completed.stderr[:300]}"
        )
    return json.loads(completed.stdout)


def _pick_subtitle_url(store: Any, languages: tuple[str, ...]) -> str:
    """从字幕字典里挑一条可用直链。

    优先级：人工字幕 > 自动字幕；语言按 ``languages`` 顺序；格式优先
    ``json3``（结构最规整），其次 ``vtt``。
    """
    if not isinstance(store, dict):
        return ""

    for language in languages:
        entries = store.get(language)
        if not isinstance(entries, list):
            continue
        by_ext = {
            str(item.get("ext") or ""): str(item.get("url") or "")
            for item in entries
            if isinstance(item, dict) and item.get("url")
        }
        for ext in ("json3", "vtt", "srv3", "srv1", "ttml"):
            url = by_ext.get(ext)
            if url:
                return url
    return ""


def _fetch_youtube_evidence(
    video_id: str,
    duration: int,
    description: str,
) -> Evidence:
    """YouTube 证据提取。"""
    url = f"https://www.youtube.com/watch?v={video_id}"
    info = _run_ytdlp_json(url)

    real_duration = int(info.get("duration") or duration or 0)
    full_description = str(info.get("description") or description or "")

    # ── Tier 1a：原生章节 ──
    chapters = normalize_chapters(info.get("chapters"), real_duration)
    description_anchors = parse_description_timecodes(full_description)

    anchors: list[TimeAnchor] = []
    origin = ""
    if chapters:
        anchors = chapters
        origin = "原生章节"
    elif description_anchors:
        anchors = description_anchors
        origin = "简介时间码"

    # 简介时间码与章节**合并**——两者的锚点通常不重叠，合起来更密。
    if chapters and description_anchors:
        known = {int(item.timestamp) for item in chapters}
        extra = [
            item
            for item in description_anchors
            if int(item.timestamp) not in known
        ]
        anchors = chapters + extra
        anchors.sort(key=lambda item: item.timestamp)
        origin = "原生章节 + 简介时间码"

    # ── Tier 2：字幕轨 ──
    cues: list[TranscriptCue] = []
    subtitle_url = _pick_subtitle_url(
        info.get("subtitles"), ("en", "zh-Hans", "zh-CN", "zh", "zh-Hant", "zh-TW")
    ) or _pick_subtitle_url(
        info.get("automatic_captions"),
        ("zh-Hans", "zh-CN", "zh", "en", "zh-Hant", "zh-TW"),
    )
    if subtitle_url:
        try:
            payload = json.loads(_http_get_bytes(subtitle_url).decode("utf-8", "ignore"))
            cues = parse_json3_cues(payload)
        except Exception:  # noqa: BLE001 — 字幕拉不到就降级
            cues = []

    if anchors:
        return Evidence(
            duration=real_duration,
            tier=1,
            tier_reason=f"Tier 1（{origin}）：{len(anchors)} 个精确锚点",
            anchors=anchors,
            cues=cues,
            description=full_description,
        )

    if cues:
        transcript_anchors = aggregate_cues(cues)
        return Evidence(
            duration=real_duration,
            tier=2,
            tier_reason=f"Tier 2（公开字幕轨）：{len(cues)} 条字幕 → {len(transcript_anchors)} 个段落锚点",
            anchors=transcript_anchors,
            cues=cues,
            description=full_description,
        )

    pacing = pedagogical_pacing(real_duration)
    return Evidence(
        duration=real_duration,
        tier=3,
        tier_reason="Tier 3（教学法节奏推演）：无章节、无字幕，按总时长推演",
        anchors=pacing,
        cues=[],
        description=full_description,
    )


def _fetch_bilibili_evidence(
    bvid: str,
    duration: int,
    description: str,
) -> Evidence:
    """B 站证据提取。"""
    view = _http_get_json(
        f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    )
    if view.get("code") != 0:
        raise EvidenceError(f"B 站 view 接口返回 code={view.get('code')}")

    data = view.get("data") or {}
    real_duration = int(data.get("duration") or duration or 0)
    full_description = str(data.get("desc") or description or "")
    aid = data.get("aid")
    cid = data.get("cid")

    chapters: list[TimeAnchor] = []
    cues: list[TranscriptCue] = []

    if aid and cid:
        try:
            player = _http_get_json(
                f"https://api.bilibili.com/x/player/v2?aid={aid}&cid={cid}",
                referer=f"https://www.bilibili.com/video/{bvid}",
            )
            player_data = player.get("data") or {}

            # 官方章节——``view_points``。
            for point in player_data.get("view_points") or []:
                if not isinstance(point, dict):
                    continue
                try:
                    seconds = float(point.get("from") or 0)
                except (TypeError, ValueError):
                    continue
                if real_duration and seconds >= real_duration:
                    continue
                label = str(point.get("content") or "").strip()
                if not label:
                    continue
                chapters.append(
                    TimeAnchor(
                        timestamp=round(seconds, 3),
                        title=label[:60],
                        origin="chapter",
                    )
                )
            chapters.sort(key=lambda item: item.timestamp)

            # 字幕轨——``subtitle.subtitles``。
            subtitle_block = (player_data.get("subtitle") or {}).get("subtitles") or []
            for entry in subtitle_block:
                if not isinstance(entry, dict):
                    continue
                subtitle_url = str(entry.get("subtitle_url") or "").strip()
                if not subtitle_url:
                    continue
                if subtitle_url.startswith("//"):
                    subtitle_url = "https:" + subtitle_url
                try:
                    payload = json.loads(
                        _http_get_bytes(subtitle_url).decode("utf-8", "ignore")
                    )
                except Exception:  # noqa: BLE001 — 字幕拉不到就降级
                    continue
                parsed = parse_bilibili_cues(payload)
                if parsed:
                    cues = parsed
                    break
        except Exception:  # noqa: BLE001 — player/v2 拿不到不影响主流程
            chapters = []
            cues = []

    description_anchors = parse_description_timecodes(full_description)

    anchors: list[TimeAnchor] = []
    origin = ""
    if chapters:
        anchors = chapters
        origin = "官方章节"
    elif description_anchors:
        anchors = description_anchors
        origin = "简介时间码"

    if anchors:
        return Evidence(
            duration=real_duration,
            tier=1,
            tier_reason=f"Tier 1（{origin}）：{len(anchors)} 个精确锚点",
            anchors=anchors,
            cues=cues,
            description=full_description,
        )

    if cues:
        transcript_anchors = aggregate_cues(cues)
        return Evidence(
            duration=real_duration,
            tier=2,
            tier_reason=f"Tier 2（B 站字幕轨）：{len(cues)} 条字幕 → {len(transcript_anchors)} 个段落锚点",
            anchors=transcript_anchors,
            cues=cues,
            description=full_description,
        )

    pacing = pedagogical_pacing(real_duration)
    return Evidence(
        duration=real_duration,
        tier=3,
        tier_reason="Tier 3（教学法节奏推演）：无章节、无字幕，按总时长推演",
        anchors=pacing,
        cues=[],
        description=full_description,
    )


# ──────────────────────────────────────────────────────────────────────
# 对外 API
# ──────────────────────────────────────────────────────────────────────


def extract_evidence(
    platform: str,
    video_id: str,
    *,
    duration: int = 0,
    description: str = "",
) -> Evidence:
    """按平台提取一条视频的时间轴证据。

    失败时不抛错——退回到 Tier 3。证据提取是**锦上添花**，
    不该让整条装配流水线因为一次网络抖动而失败。
    """
    kind = str(platform or "").strip().lower()

    try:
        if kind == "youtube":
            return _fetch_youtube_evidence(video_id, duration, description)
        if kind == "bilibili":
            return _fetch_bilibili_evidence(video_id, duration, description)
    except Exception as exc:  # noqa: BLE001 — 提取失败就降级，不中断流水线
        fallback = pedagogical_pacing(duration)
        return Evidence(
            duration=int(duration or 0),
            tier=3,
            tier_reason=f"Tier 3（证据提取失败：{exc}），按总时长推演",
            anchors=fallback,
            cues=[],
            description=description,
        )

    fallback = pedagogical_pacing(duration)
    return Evidence(
        duration=int(duration or 0),
        tier=3,
        tier_reason="Tier 3（未知平台），按总时长推演",
        anchors=fallback,
        cues=[],
        description=description,
    )


async def extract_evidence_async(
    platform: str,
    video_id: str,
    *,
    duration: int = 0,
    description: str = "",
) -> Evidence:
    """证据提取的异步包装。

    证据提取是**纯网络 IO**——放线程池里跑，不占住事件循环。
    """
    return await asyncio.to_thread(
        extract_evidence,
        platform,
        video_id,
        duration=duration,
        description=description,
    )


__all__ = [
    "Evidence",
    "EvidenceError",
    "PEDAGOGICAL_RATIOS",
    "TimeAnchor",
    "TranscriptCue",
    "aggregate_cues",
    "extract_evidence",
    "extract_evidence_async",
    "normalize_chapters",
    "parse_bilibili_cues",
    "parse_description_timecodes",
    "parse_json3_cues",
    "pedagogical_pacing",
]
