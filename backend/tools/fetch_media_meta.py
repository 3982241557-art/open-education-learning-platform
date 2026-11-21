#!/usr/bin/env python3
"""批量拉取候选视频的元数据（标题 / 时长 / 频道）。

用法::

    python3 tools/fetch_media_meta.py youtube ids.txt --out meta.json
    python3 tools/fetch_media_meta.py bilibili ids.txt --out meta.json

输出 JSON 列表，每项含 ``id`` / ``title`` / ``duration`` / ``channel``。
拿不到的条目会带 ``ok: false``，方便定位。
"""

from __future__ import annotations

import http.cookiejar
import json
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

try:
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL_CTX = ssl.create_default_context()

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _make_opener(referer: str = ""):
    """构造带 cookie 的 opener。

    B 站的 ``view`` 接口在没有 ``buvid3`` cookie 时会返回 **412**
    （反爬前置条件失败）。所以要先访问一次首页把 cookie 拿到手。
    """
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=_SSL_CTX),
    )
    headers = [("User-Agent", UA)]
    if referer:
        headers.append(("Referer", referer))
    opener.addheaders = headers
    # 先拿 cookie（首页可能会 412，重试即可）。
    for _ in range(3):
        try:
            opener.open("https://www.bilibili.com/", timeout=20).read()
            break
        except Exception:  # noqa: BLE001
            time.sleep(1.2)
    return opener


def _get(url: str, referer: str = "") -> bytes:
    opener = _make_opener(referer)
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    last: Exception | None = None
    for _ in range(3):
        try:
            with opener.open(request, timeout=25) as response:
                return response.read()
        except Exception as error:  # noqa: BLE001 — 412/超时都要重试
            last = error
            time.sleep(1.5)
    raise last if last else RuntimeError("未知错误")


def youtube_meta(video_id: str) -> dict:
    try:
        raw = _get(
            "https://www.youtube.com/oembed?format=json&url="
            + urllib.parse.quote(f"https://www.youtube.com/watch?v={video_id}")
        )
        data = json.loads(raw)
        return {
            "ok": True,
            "id": video_id,
            "title": data.get("title"),
            "channel": data.get("author_name"),
            "duration": None,
        }
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "id": video_id, "error": str(error)}


def bilibili_meta(bvid: str) -> dict:
    try:
        raw = _get(
            f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}",
            referer="https://www.bilibili.com/",
        )
        data = json.loads(raw)
        if data.get("code") != 0:
            return {"ok": False, "id": bvid, "error": data.get("message")}
        info = data.get("data") or {}
        return {
            "ok": True,
            "id": bvid,
            "title": info.get("title"),
            "channel": (info.get("owner") or {}).get("name"),
            "duration": info.get("duration"),
            "cid": info.get("cid"),
            "pages": info.get("videos"),
            "cover": info.get("pic"),
        }
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "id": bvid, "error": str(error)}


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1

    kind = sys.argv[1]
    path = sys.argv[2]
    out = sys.argv[4] if len(sys.argv) > 4 else None

    with open(path, encoding="utf-8") as handle:
        ids = [line.strip() for line in handle if line.strip()]

    checker = youtube_meta if kind == "youtube" else bilibili_meta
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(checker, ids))

    if out:
        with open(out, "w", encoding="utf-8") as handle:
            json.dump(results, handle, ensure_ascii=False, indent=2)

    for item in results:
        if item.get("ok"):
            duration = item.get("duration")
            label = f"{duration}s" if duration else "-"
            print(f"OK   {item['id']:<14} {label:>8}  {item.get('title', '')[:52]}")
        else:
            print(f"FAIL {item['id']:<14} {item.get('error', '')[:50]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
