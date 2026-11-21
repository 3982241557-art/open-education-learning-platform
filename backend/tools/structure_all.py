"""
批量装配中台视频的「自学框架」

用法::

    # 装配所有缺框架的视频
    python -m tools.structure_all

    # 重装全部 76 条
    python -m tools.structure_all --force

    # 只装配前 10 条
    python -m tools.structure_all --limit 10

装配过程**增量落盘**——每完成 5 条写一次盘，中途中断不会白跑。
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# 允许直接 ``python tools/structure_all.py`` 运行。
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ai_structurer import GLOBAL_HUB_PATH, structure_hub  # noqa: E402
from app.services.env_loader import load_env  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="装配中台视频的自学框架")
    parser.add_argument("--force", action="store_true", help="重装已装配过的视频")
    parser.add_argument("--limit", type=int, default=0, help="最多装配多少条（0=不限）")
    parser.add_argument("--concurrency", type=int, default=5, help="并发请求数")
    parser.add_argument("--save-every", type=int, default=5, help="每完成多少条落盘一次")
    parser.add_argument("--hub", default="", help="中台数据文件路径")
    parser.add_argument(
        "--resource-ids",
        default="",
        help="只装配这些资源 id（逗号分隔）",
    )
    args = parser.parse_args()

    load_env()

    hub_path = Path(args.hub) if args.hub else GLOBAL_HUB_PATH
    only_ids = [
        item.strip()
        for item in args.resource_ids.split(",")
        if item.strip()
    ] or None

    stats = asyncio.run(
        structure_hub(
            hub_path=hub_path,
            limit=args.limit,
            force=args.force,
            concurrency=args.concurrency,
            save_every=args.save_every,
            only_ids=only_ids,
        )
    )

    print("")
    print("=" * 56)
    print(f"成功 {stats.succeeded} · 失败 {stats.failed} · 共 {stats.total}")
    print(f"证据等级分布：{stats.tier_counts}")
    if stats.failures:
        print("失败明细：")
        for item in stats.failures:
            print(f"  - {item}")
    print("=" * 56)
    return 0 if stats.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
