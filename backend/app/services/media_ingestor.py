"""
全网教育视频采集引擎
====================

从 **Bilibili** 与 **YouTube** 实时拉取公开教学视频，筛掉噪声后写入
:file:`backend/data/global_resource_hub.json`。

为什么要做这个
--------------

平台上原来只有 24 条**手工挑好**的视频。那是死数据——新的公开课出了
没人知道，用户想看「这学期刚开的那门课」也找不到。

这个模块把「挑视频」这件事变成**可重复的流水线**：

.. code-block:: text

    ┌─ 信源池（watched_channels.json） ─┐
    │  四大类 × 关键词矩阵 × 频道白名单 │
    └──────────────┬───────────────────┘
                   ↓
    ┌─ 拉取通道 ───────────────────────┐
    │  B 站：公开搜索接口                │
    │  YouTube：yt-dlp 频道投稿列表      │
    └──────────────┬───────────────────┘
                   ↓
    ┌─ 质量筛选漏斗 ───────────────────┐
    │  时长 → 标题黑名单 → 关键词白名单  │
    │  → 去重 → 数量配额                 │
    └──────────────┬───────────────────┘
                   ↓
    ┌─ 入库 ───────────────────────────┐
    │  global_resource_hub.json         │
    │  （保留人工条目，追加采集条目）      │
    └──────────────────────────────────┘

两个平台的差异
--------------

**Bilibili** 用公开搜索接口。它给的是**关键词驱动**的——搜「MIT 线性代数」
能拿到国内外搬运的、带中文字幕的版本。这是国内网络环境下唯一能直连的
来源。

**YouTube** 用 ``yt-dlp`` 的 ``--flat-playlist`` 模式拉频道投稿列表。
为什么不用官方 RSS？RSS 端点 ``/feeds/videos.xml`` 现在对本环境返回
404（YouTube 收紧了匿名访问），而 ``yt-dlp`` 走的是 Innertube 内部接口，
带完整 UA 与签名，能稳定拿到标题、时长、发布时间、简介与频道名。

**时长**是关键字段——筛选漏斗的第一道关就是它，而 RSS 不提供时长。

不引入的依赖
------------

刻意**不用** ``httpx`` / ``BeautifulSoup`` / ``feedparser``：

* 网络请求用标准库 ``urllib``——B 站的两个接口都不需要 JS 渲染，
  也不需要 cookie 之外的任何东西；
* B 站搜索接口返回 JSON，yt-dlp 返回文本行——都不需要解析 HTML。

这样部署时不用多装三个包，依赖树保持干净。
"""

from __future__ import annotations

import http.cookiejar
import json
import re
import ssl
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Iterable

try:  # pragma: no cover - certifi 只是让 SSL 链在 macOS 上更稳
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL_CTX = ssl.create_default_context()

ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = ROOT / "data"
WATCHED_CHANNELS_PATH = DATA_ROOT / "watched_channels.json"
GLOBAL_HUB_PATH = DATA_ROOT / "global_resource_hub.json"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

#: B 站搜索接口——公开可用，带 cookie 才不会被 412 拦下。
BILIBILI_SEARCH_URL = "https://api.bilibili.com/x/web-interface/search/type"

#: B 站视频详情接口——拿准确时长、标题、UP 主、封面、简介、发布时间。
BILIBILI_VIEW_URL = "https://api.bilibili.com/x/web-interface/view"

#: B 站官方嵌入播放器地址模板。
#:
#: ``bvid`` 放在最前是 B 站官方分享代码的习惯——某些老版本播放器内核
#: 会按位置解析参数。
BILIBILI_EMBED_TEMPLATE = (
    "https://player.bilibili.com/player.html?bvid={bvid}"
    "&high_quality=1&danmaku=0&as_wide=1&autoplay=0&t=0"
)

#: YouTube Innertube 播放器端点的公开 key。
#:
#: 这是 Web 端内嵌在网页里的那个 key，YouTube 自己也在用——不需要用户
#: 去申请 API 配额。它只能读**公开**视频的元数据。
YOUTUBE_INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"


class IngestorError(RuntimeError):
    """采集失败。"""


# ──────────────────────────────────────────────────────────────────────
# 数据结构
# ──────────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class VideoItem:
    """一条采集到的视频。"""

    #: 平台——``bilibili`` / ``youtube``。
    platform: str
    #: 平台内唯一 id（B 站 bvid / YouTube video_id）。
    video_id: str
    #: 真实标题。
    title: str
    #: UP 主 / 频道名。
    channel: str
    #: 时长（秒）。
    duration: int
    #: 简介。
    description: str = ""
    #: 封面图。
    cover: str = ""
    #: 发布时间（Unix 秒）。
    published_at: int = 0
    #: 学科分类 id。
    category: str = ""
    #: 学科关键词（用于前端打标签）。
    tags: list[str] = field(default_factory=list)
    #: 来源页地址。
    page_url: str = ""
    #: 可直接嵌入的播放器地址。
    embed_url: str = ""
    #: 可直接播放的地址。
    url: str = ""


@dataclass(slots=True)
class FilterConfig:
    """筛选漏斗的配置。"""

    min_duration: int = 180
    max_duration: int = 43200
    blocked_titles: list[str] = field(default_factory=list)
    require_description: bool = False
    #: 标题里必须出现的「课程形态词」。一个不带任何这类词的标题，
    #: 多半是杂音（新闻、探访、书单）而不是一堂课。
    course_shape_words: list[str] = field(default_factory=list)


#: 标题里出现这些词，说明它至少**像一门课**。
#:
#: 「课」「讲」「教程」「课程」「合集」「全集」「系列」——公开课的标题
#: 几乎一定带其中之一。反过来，「实地探访」「大揭秘」「纪念」「举报」
#: 这些一出现，就是噪声。
DEFAULT_COURSE_SHAPE_WORDS = [
    "课",
    "讲",
    "教程",
    "课程",
    "合集",
    "全集",
    "系列",
    "公开课",
    "lecture",
    "course",
    "lesson",
]


# ──────────────────────────────────────────────────────────────────────
# HTTP 基础设施
# ──────────────────────────────────────────────────────────────────────


def _bilibili_opener() -> urllib.request.OpenerDirector:
    """构造带 cookie 的 B 站 opener。

    B 站的 ``view`` / ``search`` 接口在没有 ``buvid3`` cookie 时会返回
    **412**（反爬前置条件失败）。所以要先访问一次首页把 cookie 拿到手。
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
    for _ in range(3):
        try:
            opener.open("https://www.bilibili.com/", timeout=20).read()
            break
        except Exception:  # noqa: BLE001 — 首页 412 时重试即可
            time.sleep(1.2)
    return opener


def _get_json(
    opener: urllib.request.OpenerDirector, url: str, timeout: int = 25
) -> dict[str, Any]:
    """带重试的 JSON GET。"""
    last: Exception | None = None
    for attempt in range(3):
        try:
            raw = opener.open(url, timeout=timeout).read()
            return json.loads(raw.decode("utf-8", "ignore"))
        except Exception as error:  # noqa: BLE001 — 网络抖动一律重试
            last = error
            time.sleep(1.0 + attempt * 0.6)
    raise IngestorError(f"请求失败 {url}：{last}")


# ──────────────────────────────────────────────────────────────────────
# B 站通道
# ──────────────────────────────────────────────────────────────────────


def _strip_highlight(text: str) -> str:
    """去掉搜索接口标题里的 ``<em class="keyword">`` 高亮标签。"""
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _parse_bilibili_duration(raw: str) -> int:
    """把 ``"12:34"`` / ``"1:02:03"`` 解析成秒。"""
    parts = [int(p) for p in (raw or "").split(":") if p.isdigit()]
    if not parts:
        return 0
    total = 0
    for part in parts:
        total = total * 60 + part
    return total


def fetch_bilibili_search(
    opener: urllib.request.OpenerDirector,
    keyword: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """按关键词搜索 B 站视频。"""
    encoded = urllib.parse.quote(keyword)
    url = f"{BILIBILI_SEARCH_URL}?search_type=video&keyword={encoded}&page=1"
    payload = _get_json(opener, url)
    if payload.get("code") != 0:
        raise IngestorError(
            f"B 站搜索失败（code={payload.get('code')}）：{keyword}"
        )
    results = (payload.get("data") or {}).get("result") or []
    cleaned: list[dict[str, Any]] = []
    for item in results:
        bvid = str(item.get("bvid") or "").strip()
        if not bvid:
            # 搜索接口偶尔会返回「专辑」条目，没有 bvid。
            continue
        cleaned.append(
            {
                "bvid": bvid,
                "title": _strip_highlight(str(item.get("title") or "")),
                "author": str(item.get("author") or "").strip(),
                "duration": _parse_bilibili_duration(
                    str(item.get("duration") or "")
                ),
                "pubdate": int(item.get("pubdate") or 0),
                "description": _strip_highlight(str(item.get("description") or "")),
                "cover": str(item.get("pic") or ""),
            }
        )
        if len(cleaned) >= limit:
            break
    return cleaned


def fetch_bilibili_detail(
    opener: urllib.request.OpenerDirector,
    bvid: str,
) -> dict[str, Any] | None:
    """取一条 B 站视频的完整元数据。

    搜索接口给的是**粗粒度**数据——标题有高亮标签、时长可能缺失、简介
    被截断。详情接口才拿得到真正的标题、精确时长、完整简介、发布时间
    与 UP 主。
    """
    try:
        payload = _get_json(
            opener, f"{BILIBILI_VIEW_URL}?bvid={bvid}", timeout=20
        )
    except IngestorError:
        return None
    if payload.get("code") != 0:
        return None
    data = payload.get("data") or {}
    stat = data.get("stat") or {}
    owner = data.get("owner") or {}
    return {
        "bvid": str(data.get("bvid") or bvid),
        "title": str(data.get("title") or "").strip(),
        "author": str(owner.get("name") or "").strip(),
        "duration": int(data.get("duration") or 0),
        "pubdate": int(data.get("pubdate") or 0),
        "description": str(data.get("desc") or "").strip(),
        "cover": str(data.get("pic") or ""),
        "view": int(stat.get("view") or 0),
    }


# ──────────────────────────────────────────────────────────────────────
# YouTube 通道
# ──────────────────────────────────────────────────────────────────────


def _find_ytdlp() -> str:
    """找到可用的 ``yt-dlp`` 可执行文件。

    优先用当前 Python 环境里的那个——这样和后端跑在同一个虚拟环境里，
    部署时只需要 ``pip install yt-dlp`` 一步。
    """
    candidate = Path(sys.executable).parent / "yt-dlp"
    if candidate.exists():
        return str(candidate)
    from shutil import which

    found = which("yt-dlp")
    if found:
        return found
    raise IngestorError(
        "找不到 yt-dlp。请在运行环境里执行 `pip install yt-dlp`。"
    )


def fetch_youtube_search(
    query: str,
    limit: int = 15,
) -> list[dict[str, Any]]:
    """按关键词搜索 YouTube 视频。

    用 ``yt-dlp ytsearch<N>:`` —— 它走的是 Innertube 搜索接口，返回
    video_id、标题、时长**和频道名**。

    为什么用搜索而不是直接列频道投稿：

    * 频道 ``/videos`` 列表只给**最新**的投稿。MIT OCW 那种归档型频道
      最新的是几天前的一门材料课，「MIT 线性代数」根本不在列表里；
    * 搜索是**关键词驱动**的——和 B 站通道对称，同一套「学科关键词
      矩阵」在两个平台上跑，配置结构也就能统一；
    * 搜索结果自带 ``channel`` 字段，所以「这条视频来自哪个权威频道」
      信息不会丢。

    为什么不走官方 RSS（``/feeds/videos.xml?channel_id=...``）：
    该端点现在对本环境返回 **404**，而且它**不提供时长**——而时长正是
    筛选漏斗的第一道关。``yt-dlp`` 走 Innertube 内部接口，两者都能拿到。
    """
    keyword = str(query or "").strip()
    if not keyword:
        return []
    url = f"ytsearch{max(1, int(limit))}:{keyword}"
    cmd = [
        _find_ytdlp(),
        "--flat-playlist",
        "--no-warnings",
        "--print",
        "%(id)s\t%(title)s\t%(duration)s\t%(channel)s",
        url,
    ]
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=150,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return []
    if completed.returncode != 0 and not completed.stdout.strip():
        return []

    items: list[dict[str, Any]] = []
    for line in completed.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        video_id = parts[0].strip()
        title = parts[1].strip()
        if not video_id or not title:
            continue
        duration_raw = parts[2].strip()
        try:
            duration = int(float(duration_raw))
        except (TypeError, ValueError):
            duration = 0
        items.append(
            {
                "video_id": video_id,
                "title": title,
                "duration": duration,
                "channel": parts[3].strip() if len(parts) > 3 else "",
            }
        )
    return items


def fetch_youtube_detail(video_id: str) -> dict[str, Any] | None:
    """取一条 YouTube 视频的简介、发布时间与封面。

    走 Innertube 的 ``player`` 接口——匿名可用，返回 JSON 里带
    ``videoDetails``（简介 / 长度 / 作者 / 频道 id）与
    ``microformat``（发布时间 / 缩略图）。
    """
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240101.00.00",
            }
        },
        "videoId": video_id,
    }
    request = urllib.request.Request(
        f"https://www.youtube.com/youtubei/v1/player?key={YOUTUBE_INNERTUBE_KEY}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
        },
    )
    try:
        raw = urllib.request.urlopen(request, timeout=25, context=_SSL_CTX).read()
        data = json.loads(raw.decode("utf-8", "ignore"))
    except Exception:  # noqa: BLE001 — 详情拉不到不影响入库
        return None

    details = data.get("videoDetails") or {}
    micro = (data.get("microformat") or {}).get("playerMicroformatRenderer") or {}
    thumbnails = (micro.get("thumbnail") or {}).get("thumbnails") or []
    cover = thumbnails[-1].get("url", "") if thumbnails else ""
    published = micro.get("publishDate") or micro.get("uploadDate") or ""
    published_at = 0
    if published:
        try:
            import datetime as _dt

            published_at = int(
                _dt.datetime.strptime(published, "%Y-%m-%d")
                .replace(tzinfo=_dt.timezone.utc)
                .timestamp()
            )
        except ValueError:
            published_at = 0
    return {
        "video_id": str(details.get("videoId") or video_id),
        "title": str(details.get("title") or "").strip(),
        "author": str(details.get("author") or "").strip(),
        "duration": int(details.get("lengthSeconds") or 0),
        "description": str(details.get("shortDescription") or "").strip(),
        "cover": cover,
        "published_at": published_at,
        "channel_id": str(details.get("channelId") or ""),
    }


# ──────────────────────────────────────────────────────────────────────
# 筛选漏斗
# ──────────────────────────────────────────────────────────────────────


def passes_filter(item: VideoItem, config: FilterConfig) -> tuple[bool, str]:
    """判断一条视频能不能入库。

    返回 ``(是否通过, 原因)``——原因会写进日志，调试时一眼看出
    是哪一道关把它拦下来了。
    """
    if not item.title.strip():
        return False, "标题为空"

    # ① 时长——碎片短视频与超长录像都要挡掉。
    if item.duration and item.duration < config.min_duration:
        return False, f"时长过短（{item.duration}s < {config.min_duration}s）"
    if item.duration and item.duration > config.max_duration:
        return False, f"时长过长（{item.duration}s > {config.max_duration}s）"

    # ② 标题黑名单——宣传片 / 花絮 / 二次剪辑这类杂音。
    lowered = item.title.lower()
    for keyword in config.blocked_titles:
        if keyword.lower() in lowered:
            return False, f"标题命中黑名单（{keyword}）"

    # ③ 标题得**像一门课**。
    #
    # 「实地探访北京大学」「1000 本私人藏书大揭秘」「向巡视组公开举报」
    # 这些都是搜索关键词凑出来的噪声——它们可能命中「哲学」「经济」，
    # 但不是课。
    #
    # 只对 **Bilibili** 生效：中文标题里「课 / 讲 / 教程 / 合集」几乎
    # 是公开课的必备特征；而 YouTube 的标题大量是「Introduction to
    # Physics」这种**没有**形态词的正规课程名，硬套同一把尺子会误杀。
    if (
        config.course_shape_words
        and item.platform == "bilibili"
        and not any(
            word.lower() in lowered for word in config.course_shape_words
        )
    ):
        return False, "标题不含任何课程形态词"

    # ④ 简介必须有内容——空简介常常意味着这是个搬运壳。
    if config.require_description and not item.description.strip():
        return False, "简介为空"

    return True, "通过"


def apply_keyword_rules(
    title: str,
    description: str,
    require: Iterable[str],
    exclude: Iterable[str],
    *,
    require_all: bool = False,
) -> tuple[bool, str]:
    """关键词白名单 / 黑名单。

    ``require_all=True`` 时要求**全部**要求词都命中；否则命中任意一个
    即可。

    为什么需要两种语义：B 站的检索组通常要求「MIT」+「线性代数」两个
    词**同时**出现才算命中（「线性代数」单独出现会匹配到一堆竞赛题
    讲解）；而 YouTube 的检索组只需要命中一个（「linear algebra」或
    「18.06」任一即可）。
    """
    haystack = f"{title} {description}".lower()
    for keyword in exclude:
        if keyword.lower() in haystack:
            return False, f"命中排除词（{keyword}）"
    required = [k for k in require if k]
    if not required:
        return True, "无关键词要求"
    if require_all:
        missing = [k for k in required if k.lower() not in haystack]
        if missing:
            return False, f"缺少要求词（{'、'.join(missing)}）"
        return True, f"全部命中要求词（{'、'.join(required)}）"
    for keyword in required:
        if keyword.lower() in haystack:
            return True, f"命中要求词（{keyword}）"
    return False, "未命中任何要求词"


# ──────────────────────────────────────────────────────────────────────
# 采集主流程
# ──────────────────────────────────────────────────────────────────────


def load_watched_channels(path: Path | None = None) -> dict[str, Any]:
    """读取信源池配置。"""
    target = path or WATCHED_CHANNELS_PATH
    if not target.exists():
        raise IngestorError(f"信源池配置不存在：{target}")
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise IngestorError(f"信源池配置读取失败：{exc}") from exc


def _category_index(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in config.get("categories") or []}


def collect(
    config: dict[str, Any] | None = None,
    *,
    per_search: int = 20,
    per_channel: int = 15,
    max_per_category: int = 14,
    max_per_query: int = 6,
    log: Any = None,
) -> list[VideoItem]:
    """跑一遍完整采集，返回通过筛选的视频。

    ``log`` 是一个可调用对象，用来打印进度（默认 ``print``）。
    """
    config = config or load_watched_channels()
    emit = log or (lambda message: print(message))

    filters_cfg = config.get("filters") or {}
    filter_config = FilterConfig(
        min_duration=int(filters_cfg.get("min_duration_seconds") or 180),
        max_duration=int(filters_cfg.get("max_duration_seconds") or 43200),
        blocked_titles=list(filters_cfg.get("blocked_title_keywords") or []),
        require_description=bool(filters_cfg.get("require_description")),
        course_shape_words=list(
            filters_cfg.get("course_shape_keywords")
            or DEFAULT_COURSE_SHAPE_WORDS
        ),
    )
    categories = _category_index(config)

    collected: list[VideoItem] = []
    seen_ids: set[str] = set()

    # ── Bilibili 通道 ────────────────────────────────────────────────
    bili_cfg = config.get("bilibili") or {}
    if bili_cfg.get("enabled", True):
        searches = bili_cfg.get("searches") or []
        emit(f"[B 站] 开始检索 {len(searches)} 组关键词…")
        opener = _bilibili_opener()

        # ── 并发检索关键词组 ──
        def _search(entry: dict[str, Any]) -> list[dict[str, Any]]:
            keyword = str(entry.get("keyword") or "").strip()
            if not keyword:
                return []
            try:
                return fetch_bilibili_search(opener, keyword, limit=per_search)
            except IngestorError:
                return []

        with ThreadPoolExecutor(max_workers=8) as pool:
            search_results = list(pool.map(_search, searches))

        for entry, candidates in zip(searches, search_results):
            keyword = str(entry.get("keyword") or "").strip()
            if not keyword:
                continue
            category = str(entry.get("category") or "")
            require = entry.get("require_keywords") or []
            exclude = entry.get("exclude_keywords") or []
            if not candidates:
                emit(f"  ! 检索「{keyword}」没有结果")
                continue

            kept = 0
            # ── 预筛：先用搜索接口给的粗数据过一遍漏斗 ──
            #
            # 详情接口比搜索接口**慢一个数量级**（多一次 HTTP 往返）。
            # 先用粗数据把明显不合格的（太短 / 标题带「剪辑」）挡掉，
            # 只对活下来的候选去拉详情——这一步能省掉 80% 的请求。
            survivors: list[dict[str, Any]] = []
            for candidate in candidates:
                bvid = candidate["bvid"]
                if bvid in seen_ids:
                    continue
                probe = VideoItem(
                    platform="bilibili",
                    video_id=bvid,
                    title=candidate["title"],
                    channel=candidate["author"],
                    duration=candidate["duration"],
                    description=candidate["description"],
                    category=category,
                )
                ok, reason = passes_filter(probe, filter_config)
                if not ok:
                    emit(f"  - {bvid} 淘汰：{reason}")
                    continue
                ok, reason = apply_keyword_rules(
                    probe.title,
                    probe.description,
                    require,
                    exclude,
                    require_all=True,
                )
                if not ok:
                    emit(f"  - {bvid} 淘汰：{reason}")
                    continue
                survivors.append(candidate)
                if len(survivors) >= max_per_query * 2:
                    break

            # ── 拉详情，确认精确时长与完整简介 ──
            #
            # 详情请求用线程池并发——每条是一次独立的 HTTP 往返，
            # 串行跑 12 条要十几秒，并发只要两秒。
            details: dict[str, dict[str, Any] | None] = {}
            if survivors:
                with ThreadPoolExecutor(max_workers=8) as pool:
                    fetched = pool.map(
                        lambda c: fetch_bilibili_detail(opener, c["bvid"]),
                        survivors,
                    )
                    details = {
                        c["bvid"]: d for c, d in zip(survivors, fetched)
                    }

            for candidate in survivors:
                bvid = candidate["bvid"]
                if bvid in seen_ids:
                    continue
                detail = details.get(bvid) or candidate
                item = VideoItem(
                    platform="bilibili",
                    video_id=bvid,
                    title=detail.get("title") or candidate["title"],
                    channel=detail.get("author") or candidate["author"],
                    duration=int(
                        detail.get("duration") or candidate["duration"] or 0
                    ),
                    description=detail.get("description")
                    or candidate["description"],
                    cover=detail.get("cover") or candidate["cover"],
                    published_at=int(
                        detail.get("pubdate") or candidate["pubdate"] or 0
                    ),
                    category=category,
                    tags=_tags_for(category, categories),
                    page_url=f"https://www.bilibili.com/video/{bvid}",
                    embed_url=BILIBILI_EMBED_TEMPLATE.format(bvid=bvid),
                    url=f"https://www.bilibili.com/video/{bvid}",
                )
                ok, reason = passes_filter(item, filter_config)
                if not ok:
                    emit(f"  - {bvid} 淘汰：{reason}")
                    continue
                ok, reason = apply_keyword_rules(
                    item.title,
                    item.description,
                    require,
                    exclude,
                    require_all=True,
                )
                if not ok:
                    emit(f"  - {bvid} 淘汰：{reason}")
                    continue
                seen_ids.add(bvid)
                collected.append(item)
                kept += 1
                emit(
                    f"  + {bvid} [{item.duration // 60:>3}分] "
                    f"{item.title[:44]}"
                )
                if kept >= max_per_query:
                    break
        emit(f"[B 站] 累计通过 {len(collected)} 条")

    # ── YouTube 通道 ────────────────────────────────────────────────
    yt_cfg = config.get("youtube") or {}
    if yt_cfg.get("enabled", True):
        searches = yt_cfg.get("searches") or []
        emit(f"[YouTube] 开始检索 {len(searches)} 组关键词…")

        # ── 并发检索关键词组 ──
        #
        # 每次检索是一次 yt-dlp 子进程调用（2~4 秒）。串行跑 15 组要将近
        # 一分钟，并发只要十几秒。
        def _search(entry: dict[str, Any]) -> list[dict[str, Any]]:
            query = str(entry.get("query") or "").strip()
            if not query:
                return []
            try:
                return fetch_youtube_search(query, limit=per_channel)
            except IngestorError:
                return []

        with ThreadPoolExecutor(max_workers=6) as pool:
            search_results = list(pool.map(_search, searches))

        for entry, candidates in zip(searches, search_results):
            query = str(entry.get("query") or "").strip()
            if not query:
                continue
            category = str(entry.get("category") or "")
            require = entry.get("include_keywords") or []
            exclude = entry.get("exclude_keywords") or []
            if not candidates:
                emit(f"  ! 检索「{query}」没有结果")
                continue

            kept = 0
            # ── 预筛：先用频道列表给的粗数据过漏斗 ──
            #
            # yt-dlp 的频道列表已经带标题与时长了，所以大部分淘汰可以在
            # **不请求 Innertube** 的前提下完成。详情接口（简介 / 封面 /
            # 发布时间）只对活下来的候选拉——省掉大量往返。
            survivors: list[dict[str, Any]] = []
            for candidate in candidates:
                video_id = candidate["video_id"]
                if video_id in seen_ids:
                    continue
                probe = VideoItem(
                    platform="youtube",
                    video_id=video_id,
                    title=candidate["title"],
                    channel=candidate.get("channel") or "",
                    duration=candidate.get("duration") or 0,
                    category=category,
                )
                ok, reason = passes_filter(probe, filter_config)
                if not ok:
                    emit(f"  - {video_id} 淘汰：{reason}")
                    continue
                ok, reason = apply_keyword_rules(
                    probe.title, "", require, exclude
                )
                if not ok:
                    emit(f"  - {video_id} 淘汰：{reason}")
                    continue
                survivors.append(candidate)
                if len(survivors) >= max_per_query * 2:
                    break

            # ── 拉详情：补齐简介 / 封面 / 发布时间 ──
            details: dict[str, dict[str, Any] | None] = {}
            if survivors:
                with ThreadPoolExecutor(max_workers=8) as pool:
                    fetched = pool.map(
                        fetch_youtube_detail,
                        [c["video_id"] for c in survivors],
                    )
                    details = {
                        c["video_id"]: d
                        for c, d in zip(survivors, fetched)
                    }

            for candidate in survivors:
                video_id = candidate["video_id"]
                if video_id in seen_ids:
                    continue
                detail = details.get(video_id)
                item = VideoItem(
                    platform="youtube",
                    video_id=video_id,
                    title=(detail or {}).get("title") or candidate["title"],
                    channel=(detail or {}).get("author")
                    or candidate.get("channel")
                    or "",
                    duration=int(
                        (detail or {}).get("duration")
                        or candidate.get("duration")
                        or 0
                    ),
                    description=(detail or {}).get("description") or "",
                    cover=(detail or {}).get("cover") or "",
                    published_at=int((detail or {}).get("published_at") or 0),
                    category=category,
                    tags=_tags_for(category, categories),
                    page_url=f"https://www.youtube.com/watch?v={video_id}",
                    embed_url=f"https://www.youtube.com/embed/{video_id}",
                    url=f"https://www.youtube.com/watch?v={video_id}",
                )
                ok, reason = passes_filter(item, filter_config)
                if not ok:
                    emit(f"  - {video_id} 淘汰：{reason}")
                    continue
                ok, reason = apply_keyword_rules(
                    item.title, item.description, require, exclude
                )
                if not ok:
                    emit(f"  - {video_id} 淘汰：{reason}")
                    continue
                seen_ids.add(video_id)
                collected.append(item)
                kept += 1
                emit(
                    f"  + {video_id} [{item.duration // 60:>3}分] "
                    f"{item.title[:44]}"
                )
                if kept >= max_per_query:
                    break
        emit(f"[YouTube] 累计通过 {len(collected)} 条")

    # ── 分类 × 平台 配额 ─────────────────────────────────────────────
    #
    # 为什么要按平台再切一刀：B 站的搜索结果**极其**丰富——一个
    # 「清华大学 经济学」关键词就能返回几十条，而 YouTube 的
    # 「Harvard Justice」可能只有 5 条。如果只按分类限额，B 站会把
    # 配额吃光，YouTube 一条都进不来。
    #
    # 所以每个分类内按平台配额切，B 站占大头（国内直连、体验更好），
    # 但保证 YouTube 至少有一半的位置。
    per_category: dict[str, int] = {}
    per_platform: dict[tuple[str, str], int] = {}
    capped: list[VideoItem] = []
    # 先让稀缺的平台（数量少的那一方）先进配额。
    for item in sorted(
        collected,
        key=lambda item: (item.platform == "bilibili", item.category),
    ):
        count = per_category.get(item.category, 0)
        if count >= max_per_category:
            continue
        key = (item.category, item.platform)
        platform_count = per_platform.get(key, 0)
        platform_limit = (
            max_per_category - max_per_category // 2
            if item.platform == "bilibili"
            else max_per_category // 2
        )
        if platform_count >= platform_limit:
            continue
        per_category[item.category] = count + 1
        per_platform[key] = platform_count + 1
        capped.append(item)

    # 恢复成原始顺序（按分类分组更好读）。
    order = {id(item): index for index, item in enumerate(collected)}
    capped.sort(key=lambda item: order[id(item)])

    emit(
        f"采集完成：原始 {len(collected)} 条，配额裁剪后 {len(capped)} 条"
    )
    for (category_id, platform), count in sorted(per_platform.items()):
        emit(f"  · {category_id} / {platform}: {count} 条")
    return capped


def _tags_for(
    category_id: str, categories: dict[str, dict[str, Any]]
) -> list[str]:
    """从分类配置里取出适合当标签的词。"""
    category = categories.get(category_id) or {}
    tags: list[str] = []
    subtitle = str(category.get("subtitle") or "")
    for part in re.split(r"[·、,/]| ", subtitle):
        part = part.strip()
        if part and part not in tags:
            tags.append(part)
    title = str(category.get("title") or "")
    if title and title not in tags:
        tags.insert(0, title)
    return tags[:4]


# ──────────────────────────────────────────────────────────────────────
# 入库
# ──────────────────────────────────────────────────────────────────────


def _duration_label(seconds: int) -> str:
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours} 小时 {minutes} 分"
    if minutes:
        return f"{minutes} 分 {secs} 秒"
    return f"{secs} 秒"


def _format_published(timestamp: int) -> str:
    if not timestamp:
        return ""
    import datetime as _dt

    return (
        _dt.datetime.fromtimestamp(timestamp, _dt.timezone.utc).strftime("%Y-%m-%d")
    )


def build_resource(item: VideoItem) -> dict[str, Any]:
    """把一条采集结果转成中台里的资源条目。"""
    provider = "Bilibili" if item.platform == "bilibili" else "YouTube"
    return {
        "id": f"res_live_{item.platform}_{item.video_id}",
        "resource_type": "video",
        "title": item.title,
        "source": item.channel or provider,
        "provider": provider,
        "url": item.url,
        "ai_context": (item.description or item.title)[:600],
        "tags": item.tags,
        "meta": {
            "duration": item.duration,
            "duration_label": _duration_label(item.duration),
            "channel": item.channel,
            "published_at": _format_published(item.published_at),
            "cover": item.cover,
            "page_url": item.page_url,
            "embed_url": item.embed_url,
            "ingested_from": item.platform,
            "category": item.category,
            # 采集器自己维护的字段——同步时用来判断「这条是不是已经
            # 被结构化装配过了」。
            "video_id": item.video_id,
        },
        "captions": [],
        "interactive_nodes": [],
        "is_default": False,
        # 新采集进来的条目一律标成「未装配」——装配器看到它就会
        # 给它补上完整的学习框架。
        "is_structured": False,
    }


#: 同步时**可以**被采集器覆盖的基础元数据字段。
#:
#: 只有这些字段跟着采集结果更新。学习框架相关的字段
#: （``interactive_nodes`` / ``study_guide`` / ``guided_segments`` /
#: ``captions`` / ``academic_intro``）**绝不在此列**——它们是 AI
#: 花了 Token 生成、用户花了时间标注的资产，重跑一次同步不该清零。
_REFRESHABLE_META_FIELDS = (
    "duration",
    "duration_label",
    "channel",
    "published_at",
    "cover",
    "page_url",
    "embed_url",
    "category",
    "ingested_from",
    "video_id",
)

#: 同步时**永不**覆盖的资源字段。
_PROTECTED_FIELDS = (
    "interactive_nodes",
    "study_guide",
    "guided_segments",
    "captions",
    "academic_intro",
    "structure_meta",
    "is_structured",
)


def _upsert_resource(
    existing: dict[str, Any],
    incoming: dict[str, Any],
) -> tuple[str, list[str]]:
    """把一条采集结果**增量合并**进已有条目。

    返回 ``(动作, 被保留的字段)``。动作取值：

    * ``"updated"`` —— 合并了基础元数据；
    * ``"skipped"`` —— 条目已结构化装配，基础元数据也没变。

    为什么不是「删掉重建」
    ------------------

    旧实现会把上一轮的采集条目**全删掉**再追加一遍。于是每次重跑
    同步，AI 刚生成好的 ``interactive_nodes``、用户绑定的笔记、
    收藏状态**全部清零**——added=52 / removed=52。在生产环境这是
    数据灾难。

    现在的语义是 **upsert**：主键是 ``platform + video_id``，
    已存在的条目原地更新，已结构化装配的条目只刷新基础元数据。
    """
    preserved: list[str] = []

    # ① 基础元数据刷新。
    incoming_meta = incoming.get("meta")
    incoming_meta = incoming_meta if isinstance(incoming_meta, dict) else {}
    existing_meta = existing.get("meta")
    existing_meta = existing_meta if isinstance(existing_meta, dict) else {}

    for key in _REFRESHABLE_META_FIELDS:
        if key in incoming_meta:
            existing_meta[key] = incoming_meta[key]
    existing["meta"] = existing_meta

    # ② 标题 / 来源 / 标签 / 链接——都算基础元数据。
    for key in ("title", "source", "provider", "url", "tags"):
        value = incoming.get(key)
        if value:
            existing[key] = value

    # ③ **保护**学习框架相关的字段。
    #
    # 如果旧条目还没有（没装配过），就把新条目的空值搬过去——这样
    # 「刚采集进来」和「已存在但未装配」两种情况都能被装配器识别。
    for key in _PROTECTED_FIELDS:
        if key in incoming and incoming.get(key) and not existing.get(key):
            existing[key] = incoming[key]
            preserved.append(key)
        elif existing.get(key):
            preserved.append(key)

    # ④ 简介：只在旧简介不可用时用新简介顶上。
    if not str(existing.get("ai_context") or "").strip():
        context = incoming.get("ai_context")
        if context:
            existing["ai_context"] = context

    return "updated", preserved


def write_to_hub(
    items: list[VideoItem],
    hub_path: Path | None = None,
    *,
    replace_live: bool = False,
) -> dict[str, Any]:
    """把采集结果写进 ``global_resource_hub.json``（**增量 Upsert**）。

    主键是 ``platform + video_id``。

    三条规矩：

    1. **人工条目永远保留**——采集只负责追加和刷新自己那部分；
    2. **已存在的条目原地更新**，绝不删掉重建——AI 生成的
       ``interactive_nodes`` 与用户绑定的笔记必须活下来；
    3. **已结构化装配的条目**（``is_structured: true``）只刷新基础
       元数据（标题 / 时长 / 播放量 / 封面），学习框架原封不动。

    ``replace_live=True`` 时会退回旧的「删掉重建」语义——仅供
    需要彻底重建的场景（如修复损坏的采集条目），生产默认关闭。
    """
    target = hub_path or GLOBAL_HUB_PATH
    if not target.exists():
        raise IngestorError(f"中台数据文件不存在：{target}")

    raw = json.loads(target.read_text(encoding="utf-8"))
    hub = raw.get("hub") or raw
    categories = hub.get("categories") or []
    if not categories:
        raise IngestorError("中台数据里没有 categories。")

    category_index = {item["id"]: item for item in categories}

    # ── 建索引：platform + video_id → (分类, 资源) ──
    existing_index: dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]] = {}
    for category in categories:
        for resource in category.get("resources") or []:
            if not isinstance(resource, dict):
                continue
            key = _resource_key(resource)
            if key:
                existing_index[key] = (category, resource)

    # ── 旧语义：删掉重建（仅显式开启时）──
    removed = 0
    if replace_live:
        for category in categories:
            kept = []
            for resource in category.get("resources") or []:
                if str(resource.get("id") or "").startswith("res_live_"):
                    removed += 1
                    continue
                kept.append(resource)
            category["resources"] = kept
        existing_index = {}

    # ── 增量 Upsert ──
    added = 0
    updated = 0
    preserved_count = 0

    for item in items:
        category = category_index.get(item.category)
        if not category:
            continue

        key = (item.platform, item.video_id)
        incoming = build_resource(item)
        existing_entry = existing_index.get(key)

        if existing_entry is not None:
            _existing_category, existing_resource = existing_entry
            _action, preserved = _upsert_resource(existing_resource, incoming)
            updated += 1
            preserved_count += len(preserved)
            continue

        # 新条目——追加。
        category.setdefault("resources", []).append(incoming)
        existing_index[key] = (category, incoming)
        added += 1

    hub["updated_at"] = _format_published(int(time.time()))
    metadata = hub.setdefault("metadata", {})
    metadata["resource_count"] = sum(
        len(category.get("resources") or []) for category in categories
    )
    metadata["last_ingest"] = {
        "at": hub["updated_at"],
        "added": added,
        "updated": updated,
        "removed": removed,
        "preserved_fields": preserved_count,
        "source": "media_ingestor",
    }

    target.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "added": added,
        "updated": updated,
        "removed": removed,
        "preserved_fields": preserved_count,
        "total": metadata["resource_count"],
    }


def _resource_key(resource: dict[str, Any]) -> tuple[str, str] | None:
    """取资源的 ``(platform, video_id)`` 主键。

    取不到就返回 ``None``——人工整理的条目没有这个主键，它们不参与
    增量合并。
    """
    meta = resource.get("meta")
    meta = meta if isinstance(meta, dict) else {}

    platform = str(meta.get("ingested_from") or "").strip().lower()
    video_id = str(meta.get("video_id") or "").strip()

    if not platform or not video_id:
        # 从 id 里剥——``res_live_youtube_XXXXXXXX``。
        match = re.search(
            r"res_live_(bilibili|youtube)_(.+)$", str(resource.get("id") or "")
        )
        if match:
            platform = platform or match.group(1)
            video_id = video_id or match.group(2)

    if not platform or not video_id:
        return None
    return platform, video_id


def sync(
    config_path: Path | None = None,
    hub_path: Path | None = None,
    *,
    max_per_category: int = 14,
    log: Any = None,
) -> dict[str, Any]:
    """完整跑一遍：拉取 → 筛选 → **增量入库**。

    入库是 upsert——重跑同步不会清空任何一条已经装配好学习框架的
    视频。
    """
    emit = log or (lambda message: print(message))
    config = load_watched_channels(config_path)
    items = collect(config, max_per_category=max_per_category, log=emit)
    stats = write_to_hub(items, hub_path)
    emit(
        f"入库完成：新增 {stats['added']} 条，增量更新 {stats['updated']} 条，"
        f"清理旧采集 {stats['removed']} 条，中台现有 {stats['total']} 条。"
    )
    return {"items": items, "stats": stats}


__all__ = [
    "BILIBILI_EMBED_TEMPLATE",
    "FilterConfig",
    "IngestorError",
    "VideoItem",
    "apply_keyword_rules",
    "build_resource",
    "collect",
    "fetch_bilibili_detail",
    "fetch_bilibili_search",
    "fetch_youtube_detail",
    "fetch_youtube_search",
    "load_watched_channels",
    "passes_filter",
    "sync",
    "write_to_hub",
]
