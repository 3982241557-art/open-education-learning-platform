"""
后台巡检守护
============

「全网活水」的无人值守部分。

.. code-block:: text

    ┌─ lifespan 启动 ───────────────────────────────┐
    │  启动后台任务：每 12 小时巡检一次信源池        │
    └───────────────────┬───────────────────────────┘
                        ▼
    ┌─ 每轮巡检 ───────────────────────────────────┐
    │  ① 拉取 watched_channels.json 配置的频道列表   │
    │  ② 质量筛选漏斗                                │
    │  ③ 增量 upsert 入库（不破坏已装配的学习框架）  │
    │  ④ 对**新进来的**视频自动装配自学框架          │
    └───────────────────────────────────────────────┘

为什么要做成后台任务
--------------------

「活水」的关键不在于用户手动搜，而在于**平台自己会长大**。用户
周二订阅了一个 MIT 频道，周三这门课的新章节就该出现在目录里——
不需要用户做任何事。

所以巡检是后台的、定时的、无人值守的。

为什么装配只针对**新条目**
--------------------------

每 12 小时把所有视频重新装配一遍既慢又烧钱（76 条 × 一次模型调用）。
但**新视频没有学习框架**——它们就是一堆光秃秃的外链，用户打开
之后下方空空如也，跟「未装配」没区别。

所以巡检只装配 ``is_structured != true`` 的条目。已经装配过的
条目**一次都不会**被重新调用模型——它们的 ``interactive_nodes`` /
``study_guide`` 是用户时间换来的资产，不能被后台任务清零。

失败不影响整体
--------------

巡检是「尽力而为」的：拉取失败、某条视频装配失败，都只记一条日志，
下一轮再试。**任何单点失败都不会让守护任务挂掉**——一个卡死的
后台任务比没有任务更糟。

关停
----

服务停止时守护任务会被取消（``lifespan`` 的 ``finally``），不会留下
悬挂的协程。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

#: 巡检间隔（秒）。默认 12 小时。
DEFAULT_INTERVAL = 12 * 60 * 60

#: 启动后**延迟**多久才跑第一轮。
#:
#: 不立即跑——服务刚起来时，用户更可能关心「马上能用」，而不是
#: 等一次要花几分钟的巡检。延迟 60 秒既让服务先进入可用状态，
#: 又不至于让「活水」显得迟钝。
DEFAULT_INITIAL_DELAY = 60


async def _run_one_round(log: Any = None) -> dict[str, Any]:
    """跑一轮巡检。

    返回本轮的统计。
    """
    emit = log or (lambda message: logger.info(message))

    # ① 拉取 + 入库。
    from app.services.media_ingestor import IngestorError, sync

    try:
        result = await asyncio.to_thread(sync)
    except IngestorError as exc:
        emit(f"[巡检] 拉取失败：{exc}")
        return {"ok": False, "error": str(exc)}
    except Exception as error:  # noqa: BLE001 — 巡检不许把守护任务带崩
        emit(f"[巡检] 拉取异常：{error}")
        return {"ok": False, "error": str(error)}

    stats = result.get("stats") or {}
    added = int(stats.get("added", 0))
    emit(
        f"[巡检] 拉取完成：新增 {added} 条，"
        f"更新 {stats.get('updated', 0)} 条，"
        f"中台现有 {stats.get('total', 0)} 条。"
    )

    # ② 补齐备用源。
    #
    # 每拉进来一条 YouTube 视频，它的备用源就该同时被补上——不然
    # 覆盖率会随着「活水」不断流入新内容而**倒退**。
    #
    # 这一步放在装配之前：新补上的备用源可能对应一条**已存在**的
    # B 站资源，装配时能顺带把它也装上。
    fallback_stats = await _repair_fallbacks(emit)
    if fallback_stats.get("filled"):
        emit(
            f"[巡检] 备用源补齐 {fallback_stats['filled']} 条，"
            f"覆盖率 {fallback_stats.get('coverage')}。"
        )

    # ③ 装配新进来的视频。
    #
    # 只装配 ``is_structured`` 为假的——已装配的一次都不碰。
    if added <= 0:
        return {
            "ok": True,
            "added": 0,
            "structured": 0,
            "failed": 0,
            "fallbacks": fallback_stats.get("filled", 0),
        }

    from app.services.ai_structurer import StructurerError, structure_hub

    try:
        structure_stats = await structure_hub(concurrency=3, save_every=2)
    except StructurerError as exc:
        emit(f"[巡检] 装配失败：{exc}")
        return {"ok": False, "added": added, "error": str(exc)}
    except Exception as error:  # noqa: BLE001
        emit(f"[巡检] 装配异常：{error}")
        return {"ok": False, "added": added, "error": str(error)}

    emit(
        f"[巡检] 装配完成：成功 {structure_stats.succeeded} 条，"
        f"失败 {structure_stats.failed} 条。"
    )
    return {
        "ok": True,
        "added": added,
        "structured": structure_stats.succeeded,
        "failed": structure_stats.failed,
        "fallbacks": fallback_stats.get("filled", 0),
    }


async def _repair_fallbacks(emit: Any) -> dict[str, Any]:
    """给缺备用源的 YouTube 课程补上 B 站备用源。

    这是「覆盖率不倒退」的保证——每次巡检都会跑一遍。

    失败不影响巡检整体：补不上就还是补不上，下一轮再试。
    """
    import json
    from pathlib import Path

    from app.services.fallback_matcher import coverage, fill_missing_fallbacks
    from app.services.media_ingestor import GLOBAL_HUB_PATH

    path = Path(GLOBAL_HUB_PATH)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        emit(f"[巡检] 备用源补齐跳过：读取数据文件失败（{error}）")
        return {"filled": 0, "coverage": None}

    hub = raw.get("hub") or raw
    report = coverage(hub)
    if report["total"] == 0 or report["with_fallback"] >= report["total"]:
        return {"filled": 0, "coverage": f"{report['percent']}%"}
    if report["total"] - report["with_fallback"] > 30:
        # 缺口太大说明信源池出问题了——补不完，先只补前 30 条。
        emit("[巡检] 备用源缺口超过 30 条，本轮只补前 30 条。")

    try:
        stats = await asyncio.to_thread(
            fill_missing_fallbacks,
            hub,
            limit=30,
            log=emit,
        )
    except Exception as error:  # noqa: BLE001 — 补备用源失败不影响巡检
        emit(f"[巡检] 备用源补齐异常：{error}")
        return {"filled": 0, "coverage": None}

    if stats.get("filled"):
        path.write_text(
            json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    final = coverage(hub)
    return {
        "filled": int(stats.get("filled", 0)),
        "coverage": f"{final['percent']}%",
    }


async def patrol_loop(
    interval: int = DEFAULT_INTERVAL,
    *,
    initial_delay: int = DEFAULT_INITIAL_DELAY,
    log: Any = None,
) -> None:
    """巡检守护的常驻协程。

    ``interval`` —— 两轮巡检之间的间隔（秒）。
    ``initial_delay`` —— 启动后延迟多久跑第一轮。
    """
    emit = log or (lambda message: logger.info(message))

    if initial_delay > 0:
        emit(f"[巡检] 守护已挂起，{initial_delay} 秒后开始第一轮巡检。")
        await asyncio.sleep(initial_delay)

    while True:
        try:
            await _run_one_round(log=emit)
        except asyncio.CancelledError:
            emit("[巡检] 守护已取消。")
            raise
        except Exception as error:  # noqa: BLE001 — 绝不让守护任务静默死掉
            emit(f"[巡检] 本轮异常（已忽略，等待下一轮）：{error}")

        # 分段 sleep，让取消信号能及时生效。
        # 一口气 sleep 12 小时的话，任务取消要等到睡醒才生效。
        try:
            for _ in range(interval):
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            emit("[巡检] 守护已取消。")
            raise


def start_patrol(
    *,
    interval: int = DEFAULT_INTERVAL,
    initial_delay: int = DEFAULT_INITIAL_DELAY,
    log: Any = None,
) -> asyncio.Task:
    """启动巡检守护，返回后台任务句柄。"""
    return asyncio.create_task(
        patrol_loop(interval, initial_delay=initial_delay, log=log),
        name="seek-patrol",
    )


__all__ = [
    "DEFAULT_INITIAL_DELAY",
    "DEFAULT_INTERVAL",
    "patrol_loop",
    "start_patrol",
]
