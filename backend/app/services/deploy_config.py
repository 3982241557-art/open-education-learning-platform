"""
生产环境配置
============

云平台部署需要的**运行时配置**——全部来自环境变量。

三个变量
--------

``PORT``
    云平台注入的端口。Zeabur / Railway / Render 都会自动注入，
    **不要**在代码里写死。

``ALLOWED_ORIGINS``
    允许跨域访问的前端域名，逗号分隔。

    不填会怎样
    ----------
    会**放行所有来源**（``*``）——行为跟本地开发时完全一样。

    这不是「忘记配置就坏了」，而是「不填也能跑」。绝大多数部署
    （前端与后端同域、走 Next rewrite 代理）根本不需要它。

    什么时候才需要填
    ----------------
    当**浏览器直连后端**时（比如前端在 Vercel、后端在 Render，
    且前端用 ``NEXT_PUBLIC_API_BASE_URL`` 直连而不是走代理）。
    这时浏览器的 Origin 是前端域名，后端必须放行它。

``GITHUB_TOKEN``
    GitHub API 令牌。**可选**——不填仍能工作，只是走匿名配额
    （每小时 60 次搜索请求），大面积筛选会被限速。
"""

from __future__ import annotations

import os
from typing import Any

#: 后端监听端口。
#:
#: 云平台（Zeabur / Railway / Render / Fly.io）会注入 ``PORT``。
#: 本地开发默认 8001。
DEFAULT_PORT = 8001

#: 本地开发时的回退地址。
DEFAULT_LOCAL_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
)


def _env(*names: str, default: str = "") -> str:
    """按顺序取第一个非空的环境变量。"""
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return default


def port() -> int:
    """要监听的端口。

    优先读 ``PORT``——这是云平台的标准约定。``BACKEND_PORT`` 是
    本地开发的备用名（跟前端保持一致）。
    """
    raw = _env("PORT", "BACKEND_PORT", default=str(DEFAULT_PORT))
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_PORT
    # 端口必须在合法范围内。
    return parsed if 1 <= parsed <= 65535 else DEFAULT_PORT


def host() -> str:
    """要监听的地址。

    默认 ``0.0.0.0``——**必须**是它，否则容器里只能本机访问，
    外部根本连不上。这是容器化部署最常见的坑。
    """
    return _env("HOST", "BACKEND_HOST", default="0.0.0.0")


def allowed_origins() -> list[str]:
    """允许跨域访问的来源列表。

    ``ALLOWED_ORIGINS`` 用逗号分隔。支持 ``*`` 通配——整个子域都放行。
    """
    raw = _env("ALLOWED_ORIGINS", "CORS_ORIGINS")
    if not raw:
        # 没配置 → 放行所有来源 + 本地开发地址。
        #
        # 放行 ``*`` 是**刻意的**：这个平台没有登录、没有 Cookie 会话，
        # ``allow_credentials=False``，所以「允许任意来源读取公开 API」
        # 不会造成越权——它本来就已经是公开数据。
        #
        # 但如果用户填了 ``ALLOWED_ORIGINS``，就**严格按它来**——
        # 填了就是 wanting 收紧。
        return ["*", *DEFAULT_LOCAL_ORIGINS]

    origins: list[str] = []
    for item in raw.split(","):
        cleaned = item.strip().rstrip("/")
        if cleaned and cleaned not in origins:
            origins.append(cleaned)
    return origins or ["*"]


def is_production() -> bool:
    """是否运行在生产环境。"""
    return _env("NODE_ENV", "APP_ENV", default="development").lower() in (
        "production",
        "prod",
    )


def github_token() -> str:
    """GitHub 令牌——可选。没配就走匿名配额。"""
    return _env("GITHUB_TOKEN", "GH_TOKEN")


def describe() -> dict[str, Any]:
    """当前运行时配置——用于启动日志与健康检查。

    **不包含任何密钥**——只报告「配了没有」，不报告「配的是什么」。
    """
    origins = allowed_origins()
    return {
        "port": port(),
        "host": host(),
        "production": is_production(),
        "allowed_origins": origins,
        "cors_restricted": "*" not in origins,
        "github_token_configured": bool(github_token()),
    }


__all__ = [
    "DEFAULT_LOCAL_ORIGINS",
    "DEFAULT_PORT",
    "allowed_origins",
    "describe",
    "github_token",
    "host",
    "is_production",
    "port",
]
