#!/usr/bin/env python3
"""在 B 站搜索公开课，输出候选 ``bvid``。

用法::

    python3 tools/bilibili_search.py "复旦 哲学导论" 8

会打印 ``bvid | 时长 | UP主 | 标题``。
"""

from __future__ import annotations

import http.cookiejar
import json
import ssl
import sys
import time
import urllib.parse
import urllib.request

try:
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL_CTX = ssl.create_default_context()

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

SEARCH_URL = "https://api.bilibili.com/x/web-interface/search/type"


def _fetch(opener, url: str, tries: int = 3) -> bytes:
    """带重试的 GET——B 站的 chunked 响应偶尔会中途断掉。"""
    last: Exception | None = None
    for _ in range(tries):
        try:
            return opener.open(url, timeout=25).read()
        except Exception as error:  # noqa: BLE001 — 网络抖动一律重试
            last = error
            time.sleep(1.2)
    raise last if last else RuntimeError("未知错误")


def _jar() -> http.cookiejar.CookieJar:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=_SSL_CTX),
    )
    opener.addheaders = [("User-Agent", UA)]
    # 先访问首页拿 buvid3，否则搜索接口会拒绝。
    _fetch(opener, "https://www.bilibili.com/")
    return jar


def search(keyword: str, limit: int = 10) -> list[dict]:
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(_jar()),
        urllib.request.HTTPSHandler(context=_SSL_CTX),
    )
    opener.addheaders = [
        ("User-Agent", UA),
        ("Referer", "https://search.bilibili.com/"),
    ]
    query = urllib.parse.urlencode(
        {"search_type": "video", "keyword": keyword, "page": 1}
    )
    raw = _fetch(opener, f"{SEARCH_URL}?{query}")
    data = json.loads(raw)
    if data.get("code") != 0:
        raise RuntimeError(f"搜索失败：{data.get('message')}")
    return (data.get("data") or {}).get("result", [])[:limit]


def _strip(html: str) -> str:
    return html.replace('<em class="keyword">', "").replace("</em>", "")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    keyword = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    for item in search(keyword, limit):
        duration = item.get("duration") or "?"
        print(
            f"{item.get('bvid')}\t{duration}\t{item.get('author')}\t"
            f"{_strip(item.get('title') or '')}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
