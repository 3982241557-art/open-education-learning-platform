"""
环境变量加载
============

从 ``backend/.env`` 读取配置并注入 ``os.environ``。

为什么需要它
------------

模型密钥（``DEEPSEEK_API_KEY``）是**部署配置**，不是代码。把它写死在
代码里等于把密钥提交进版本库；靠 shell 手动 export 又意味着每次起服务
都要记得设置。``backend/.env`` 是这两者之间的平衡点。

优先级（后者覆盖前者）
----------------------

1. 进程已有的环境变量；
2. ``backend/.env``；
3. 代码里的默认值。

**环境变量优先于 .env** ——这样 CI / Docker 里注入的密钥不会被本地的
``.env`` 意外覆盖。

加载时机
--------

在 :mod:`app.main` 的模块导入期调用一次。任何读取环境变量的服务因此
都能拿到配置，不需要各自去碰文件系统。
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

#: ``backend/.env`` 的位置。本文件位于 ``backend/app/services/``，
#: 因此 ``parents[2]`` 是 ``backend/``。
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

#: ``.env`` 里允许出现的键。只有白名单内的键会被注入环境变量——
#: 避免有人往 ``.env`` 里塞 ``LD_PRELOAD`` 之类的东西影响进程。
ALLOWED_KEYS = frozenset(
    {
        "DEEPSEEK_API_KEY",
        "DEEPSEEK_BASE_URL",
        "DEEPSEEK_MODEL",
        "SEEK_LLM_API_KEY",
        "SEEK_LLM_BASE_URL",
        "SEEK_LLM_MODEL",
        "SEEK_LOG_PROMPT",
        # ── 部署相关 ──
        #
        # 云平台注入的这些变量**优先级高于**本文件——
        # ``load_env`` 默认 ``override=False``，所以平台配置不会被
        # 本地 ``.env`` 意外覆盖。
        "PORT",
        "BACKEND_PORT",
        "HOST",
        "BACKEND_HOST",
        "ALLOWED_ORIGINS",
        "CORS_ORIGINS",
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "LOG_LEVEL",
        "NODE_ENV",
        "APP_ENV",
    }
)

#: 没有 Key 时写入的模板内容。
ENV_TEMPLATE = """\
# ─────────────────────────────────────────────────────────────
#  模型接入配置
# ─────────────────────────────────────────────────────────────
# 把下面的 Key 换成你自己的，然后重启后端服务。
# 获取地址：https://platform.deepseek.com/api_keys

DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# 端点与模型。默认值适用于 DeepSeek 官方，兼容任何 OpenAI 协议端点。
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# 是否在终端打印每轮组装好的完整提示词（排查用）。
SEEK_LOG_PROMPT=true
"""


def ensure_env_file() -> Path:
    """确保 ``backend/.env`` 存在；不存在就写入模板。

    已存在时**不覆盖**——用户可能已经填好了 Key。
    """
    if ENV_FILE.exists():
        return ENV_FILE
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    ENV_FILE.write_text(ENV_TEMPLATE, encoding="utf-8")
    logger.info("已创建模型配置模板: %s", ENV_FILE)
    return ENV_FILE


def load_env(*, override: bool = False) -> dict[str, str]:
    """加载 ``backend/.env`` 并注入环境变量。

    ``override=False``（默认）时，已经存在的环境变量**不会**被覆盖——
    CI 与容器里注入的配置优先于本地文件。

    返回实际被注入的键值对，便于调用方确认配置已生效。
    """
    ensure_env_file()

    loaded: dict[str, str] = {}
    try:
        from dotenv import dotenv_values

        raw = dotenv_values(ENV_FILE)
    except Exception as exc:  # pragma: no cover - 依赖缺失时退化为手写解析
        logger.warning("读取 %s 失败（%s），改用内置解析器", ENV_FILE, exc)
        raw = _parse_env_file(ENV_FILE)

    for key, value in raw.items():
        if key not in ALLOWED_KEYS:
            continue
        text = str(value or "").strip()
        if not text:
            continue
        loaded[key] = text
        if override or not os.environ.get(key):
            os.environ[key] = text

    return loaded


def _parse_env_file(path: Path) -> dict[str, str]:
    """极简 ``.env`` 解析器——``python-dotenv`` 不可用时的兜底。

    只支持 ``KEY=VALUE`` 与 ``# 注释``，足够覆盖本项目的配置需求。
    """
    out: dict[str, str] = {}
    if not path.exists():
        return out
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key:
            out[key] = value
    return out


def has_api_key() -> bool:
    """当前是否配置了模型密钥。"""
    return bool(os.environ.get("DEEPSEEK_API_KEY", "").strip()) or bool(
        os.environ.get("SEEK_LLM_API_KEY", "").strip()
    )


__all__ = ["ALLOWED_KEYS", "ENV_FILE", "ENV_TEMPLATE", "ensure_env_file", "has_api_key", "load_env"]
