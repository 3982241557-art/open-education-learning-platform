#!/usr/bin/env python3
"""首波大规模入库脚本。

跑一遍采集引擎，把 B 站与 YouTube 的真实公开课拉进
:file:`backend/data/global_resource_hub.json`，并在终端打印完整清单。

用法::

    cd backend
    .venv/bin/python tools/init_resource_sync.py

参数::

    --max-per-category 14   每个学科分类最多保留多少条
    --dry-run              只拉取与筛选，不写文件
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.media_ingestor import (  # noqa: E402
    GLOBAL_HUB_PATH,
    WATCHED_CHANNELS_PATH,
    collect,
    load_watched_channels,
    write_to_hub,
)

SEPARATOR = "─" * 78


def main() -> int:
    parser = argparse.ArgumentParser(description="全网公开课首波入库")
    parser.add_argument("--max-per-category", type=int, default=14)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    config = load_watched_channels(WATCHED_CHANNELS_PATH)

    print(SEPARATOR)
    print("全球优质教育信源池")
    print(SEPARATOR)
    for category in config.get("categories", []):
        print(f"  · {category['title']}  {category['subtitle']}")
    print(f"  B 站关键词组：{len(config['bilibili']['searches'])}")
    print(f"  YouTube 关键词组：{len(config['youtube']['searches'])}")
    print(SEPARATOR)
    print()

    items = collect(config, max_per_category=args.max_per_category)

    print()
    print(SEPARATOR)
    print(f"拉取到的真实视频清单（{len(items)} 条）")
    print(SEPARATOR)

    by_category: dict[str, list] = {}
    for item in items:
        by_category.setdefault(item.category, []).append(item)

    category_titles = {
        category["id"]: category["title"]
        for category in config.get("categories", [])
    }

    for category_id, group in by_category.items():
        title = category_titles.get(category_id, category_id)
        print(f"\n【{title}】{len(group)} 条")
        print("─" * 76)
        for item in group:
            minutes = item.duration // 60
            seconds = item.duration % 60
            platform = "B 站" if item.platform == "bilibili" else "YT"
            print(
                f"  {platform}  {item.video_id:<14} "
                f"{minutes:>3}:{seconds:02d}  {item.title[:46]}"
            )
            print(f"        来源：{item.channel or '—'}  "
                  f"地址：{item.url}")

    if args.dry_run:
        print()
        print("（--dry-run：未写入文件）")
        return 0

    stats = write_to_hub(items, GLOBAL_HUB_PATH)
    print()
    print(SEPARATOR)
    print(
        f"入库完成：新增 {stats['added']} 条，清理旧采集 {stats['removed']} 条，"
        f"中台现有 {stats['total']} 条。"
    )
    print(f"数据文件：{GLOBAL_HUB_PATH}")
    print(SEPARATOR)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
