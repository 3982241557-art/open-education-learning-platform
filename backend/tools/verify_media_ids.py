#!/usr/bin/env python3
"""校验候选视频 ID 是否真实存在且可播放。

- YouTube：走 ``oembed`` 端点，返回 200 且带标题才算有效。
- Bilibili：走 ``x/web-interface/view``，``code == 0`` 且能拿到
  ``title`` / ``owner`` 才算有效。

用法::

    python3 tools/verify_media_ids.py youtube_ids.txt bilibili_ids.txt
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _get(url: str, timeout: int = 20) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def check_youtube(video_id: str) -> dict | None:
    """返回标题 / 作者，或 ``None`` 表示无效。"""
    try:
        raw = _get(
            "https://www.youtube.com/oembed?format=json&url="
            + urllib.parse.quote(f"https://www.youtube.com/watch?v={video_id}")
        )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return {"id": video_id, "title": data.get("title"), "author": data.get("author_name")}


def check_bilibili(bvid: str) -> dict | None:
    """返回标题 / UP 主 / 时长，或 ``None`` 表示无效。"""
    try:
        raw = _get(f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if data.get("code") != 0:
        return None
    info = data.get("data") or {}
    if not info.get("title"):
        return None
    return {
        "id": bvid,
        "title": info.get("title"),
        "author": (info.get("owner") or {}).get("name"),
        "duration": info.get("duration"),
        "cid": info.get("cid"),
        "pages": info.get("videos"),
    }


def _read(path: str) -> list[str]:
    with open(path, encoding="utf-8") as handle:
        return [
            line.strip()
            for line in handle
            if line.strip() and not line.strip().startswith("#")
        ]


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    results: dict[str, list[dict | None]] = {}

    if len(sys.argv) > 1 and sys.argv[1].endswith(".txt"):
        ids = _read(sys.argv[1])
        kind = "youtube" if "youtube" in sys.argv[1] else "bilibili"
        checker = check_youtube if kind == "youtube" else check_bilibili
        with ThreadPoolExecutor(max_workers=6) as pool:
            results[kind] = list(pool.map(checker, ids))

    for kind, items in results.items():
        print(f"\n===== {kind} =====")
        for item in items:
            if item:
                print(f"OK   {item['id']:<14} {item['title'][:60]}")
            else:
                print(f"FAIL {'?':<14}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
