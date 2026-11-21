#!/usr/bin/env python3
"""
生产环境启动入口
================

云平台（Zeabur / Railway / Render）会执行容器里的 ``CMD``。这个脚本
就是那个 ``CMD``。

为什么不用命令行直接写 ``uvicorn app.main:app --port $PORT``
------------------------------------------------------------

两个原因：

1. **``$PORT`` 不是所有平台都注入的**。Render 注 ``PORT``，Railway
   注 ``PORT``，Zeabur 可能注别的。这个脚本按
   ``PORT → BACKEND_PORT → 8001`` 的顺序找，**怎么都能起来**。
2. **监听地址必须是 ``0.0.0.0``**。容器里监听 ``127.0.0.1`` 的话，
   外部根本连不上——这是容器化部署最常见的坑，而且报错很隐蔽
   （本地测试全好，线上就是 502）。

用法
----

    python3 scripts/run_backend.py

或者在容器里：

    CMD ["python3", "scripts/run_backend.py"]
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _resolve_port() -> int:
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


def _resolve_host() -> str:
    """监听地址。

    默认 ``0.0.0.0``——容器里**必须**是它，否则外部连不上。
    """
    return os.environ.get("HOST", "").strip() or "0.0.0.0"


def main() -> int:
    os.chdir(BACKEND_DIR)

    # 先加载 .env（如果存在）——但**不覆盖**已有的环境变量，
    # 这样云平台注入的密钥优先于本地文件。
    try:
        from app.services.env_loader import load_env

        load_env()
    except Exception as exc:  # noqa: BLE001 — 加载失败不该阻止启动
        print(f"[run_backend] 读取 .env 失败（忽略）：{exc}", file=sys.stderr)

    import uvicorn

    host = _resolve_host()
    port = _resolve_port()

    print(f"[run_backend] 启动 uvicorn · 监听 {host}:{port}", file=sys.stderr)

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_level=os.environ.get("LOG_LEVEL", "info"),
        # 容器里要优雅关闭：收到 SIGTERM 时先处理完在途请求。
        timeout_graceful_shutdown=15,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
