"""
GitHub 开源教育项目 · 大白话翻译批处理
========================================

读取 ``backend/data/github_candidates_review.json``，调用 DeepSeek 把每
个候选项目翻译成**大白话审核卡**，然后写回同一个文件。

用法::

    python3 -m tools.github_edu_plain_run --limit 50

它跟 ``github_edu_scout.py`` 是**两段**，而不是一个。

原因：筛选（纯网络 IO，可断点续跑）与翻译（要调模型，慢且贵）应该
分开。筛选结果可以复用，翻译失败只影响翻译这一步——重新跑翻译不用
重新检索一遍 GitHub。

翻译结果**增量合并**：已经翻过的项目不重复翻。所以中断了直接再跑
一次就行。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.env_loader import load_env  # noqa: E402
from app.services.github_edu_plain import translate_all  # noqa: E402

# 先把 ``backend/.env`` 读进环境变量——否则脚本读不到密钥。
load_env()

REVIEW_PATH = BACKEND_ROOT / "data" / "github_candidates_review.json"


def _read() -> dict[str, Any]:
    if not REVIEW_PATH.exists():
        raise SystemExit(
            f"找不到候选清单：{REVIEW_PATH}\n"
            "请先运行 tools/github_edu_scout.py。"
        )
    return json.loads(REVIEW_PATH.read_text(encoding="utf-8"))


def _write(payload: dict[str, Any]) -> None:
    payload["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    REVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = REVIEW_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    tmp.replace(REVIEW_PATH)


def _to_repo(candidate: dict[str, Any]) -> dict[str, Any]:
    """把候选条目转成翻译服务要吃的格式。"""
    return {
        "id": str(candidate.get("id") or ""),
        "full_name": str(candidate.get("full_name") or ""),
        "description": str(candidate.get("description") or ""),
        "topics": list(candidate.get("topics") or []),
        "language": str(candidate.get("language") or ""),
        "stars": int(candidate.get("stars") or 0),
        "homepage": str(candidate.get("homepage") or ""),
        "readme_excerpt": str(candidate.get("readme_excerpt") or ""),
    }


async def main_async(limit: int, force: bool) -> int:
    review = _read()
    candidates = review.get("candidates") or []

    if not candidates:
        print("候选清单是空的。")
        return 0

    # 只翻前 limit 个，按质量分从高到低——高分的最值得先看。
    ordered = sorted(
        candidates, key=lambda item: float(item.get("score") or 0), reverse=True
    )[:limit]

    # 增量：已经翻好的跳过。
    todo = [
        item
        for item in ordered
        if force or not (item.get("plain") or {}).get("what_it_is")
    ]
    skipped = len(ordered) - len(todo)

    print(f"候选 {len(candidates)} 条，本次处理 {len(todo)} 条（跳过已翻译 {skipped} 条）")
    if not todo:
        print("全部已翻译。")
        return 0

    repos = [_to_repo(item) for item in todo]

    print("调用 DeepSeek 翻译中…（每批 8 个，3 批并发）")
    cards = await translate_all(repos)

    by_id = {str(item.get("id")): item for item in candidates}
    written = 0
    for card in cards.values():
        target = by_id.get(str(card.get("id")))
        if target is None:
            continue
        target["plain"] = card
        written += 1

    # 汇总统计——审核台要按分类和星级筛选。
    review["plain_summary"] = _summarize(candidates)

    _write(review)
    print(f"已翻译 {written} 条，写回 {REVIEW_PATH}")
    return 0


def _summarize(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """统计翻译覆盖率与星级分布。"""
    translated = [item for item in candidates if (item.get("plain") or {}).get("what_it_is")]
    by_stars: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for item in translated:
        plain = item["plain"]
        stars = str(plain.get("stars") or 3)
        by_stars[stars] = by_stars.get(stars, 0) + 1
        kind = str(plain.get("kind") or "未分类")
        by_kind[kind] = by_kind.get(kind, 0) + 1
    return {
        "total": len(candidates),
        "translated": len(translated),
        "by_stars": by_stars,
        "by_kind": by_kind,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="GitHub 教育项目大白话翻译器")
    parser.add_argument("--limit", type=int, default=50, help="最多翻译多少条")
    parser.add_argument(
        "--force", action="store_true", help="已翻译的也重新翻一遍"
    )
    args = parser.parse_args()
    return asyncio.run(main_async(args.limit, args.force))


if __name__ == "__main__":
    raise SystemExit(main())
