#!/usr/bin/env python3
"""
容器启动入口
============

云平台（Zeabur / Railway / Render / Fly.io）执行这个脚本启动后端。

三件事
------

1. **读端口**——``PORT → BACKEND_PORT → 8001``。云平台注入哪个就用哪个，
   都不注入就用 8001。**不会**因为端口猜错而起不来。
2. **监听 0.0.0.0**——容器里必须监听所有网卡。监听 ``127.0.0.1`` 的
   容器在外部**完全连不上**，而且报错很隐蔽（本地全好，线上一直 502）。
3. **不吞异常**——启动失败要**大声**报错，而不是静默退出。云平台会
   看到非零退出码并把容器标记为失败，这比「容器假活」好排查得多。

用法
----

    python3 run.py

容器里：

    CMD ["python3", "run.py"]
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

#: ``backend/`` 目录。
BACKEND_DIR = Path(__file__).resolve().parent

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def resolve_port() -> int:
    """按 ``PORT → BACKEND_PORT → 8001`` 找端口。"""
    for name in ("PORT", "BACKEND_PORT"):
        raw = os.environ.get(name, "").strip()
        if not raw:
            continue
        try:
            parsed = int(raw)
        except (TypeError, ValueError):
            continue
        if 1 <= parsed <= 65535:
            return parsed
    return 8001


def resolve_host() -> str:
    """监听地址——默认 ``0.0.0.0``（容器里必须如此）。"""
    return os.environ.get("HOST", "").strip() or "0.0.0.0"


def main() -> int:
    os.chdir(BACKEND_DIR)

    # 加载 ``.env``（如果存在），但不覆盖已有的环境变量——
    # 云平台注入的配置优先级更高。
    try:
        from app.services.env_loader import load_env

        loaded = load_env()
        if loaded:
            print(f"[run] 从 .env 加载 {len(loaded)} 项配置", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 — 加载失败不该阻止启动
        print(f"[run] 读取 .env 失败（忽略）：{exc}", file=sys.stderr)

    host = resolve_host()
    port = resolve_port()

    print(f"[run] 启动 uvicorn · 监听 {host}:{port}", file=sys.stderr)

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_level=os.environ.get("LOG_LEVEL", "info"),
        # 收到 SIGTERM 时给在途请求 15 秒收尾。
        timeout_graceful_shutdown=15,
        # 容器重启时 workers 会重建，不需要优雅的多 worker。
        workers=1,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
