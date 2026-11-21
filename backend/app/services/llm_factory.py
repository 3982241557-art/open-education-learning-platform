"""
模型调用入口
============

整个平台**唯一**发起模型调用的地方。调用方只调 :func:`complete` 或
:func:`stream`，不关心背后是同步还是流式。

关于「降级」
------------

本平台**不做**降级到本地规则合成。

原因很直接：降级出来的回复是**假的**——它把课程原文复述一遍，看起来
像回答，其实没有任何推理。用户学到的知识是错的，而界面不会告诉他
「这是假的」。

因此这里的策略是：

* 有密钥 → 走真实请求，失败重试，重试耗尽就**把错误抛给调用方**，
  让前端明确显示「模型调用失败：<原因>」；
* 没密钥 → 同样抛错，但错误信息直指配置方式。

前端据此展示真实的失败状态，而不是用假内容糊住界面。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.services.llm_connector import (
    LLMConfig,
    LLMRequestError,
    OpenAICompatibleClient,
    build_messages,
    has_real_model,
    is_usable_api_key,
    load_config,
)

logger = logging.getLogger(__name__)

#: 真实请求的重试次数与退避间隔（秒）。
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0

#: 重试之间的退避倍率。
RETRY_BACKOFF = 2.0

#: 未配置密钥时抛出的错误里包含的指引。
NO_KEY_HINT = (
    "尚未配置模型密钥。请在 backend/.env 中填写 DEEPSEEK_API_KEY 后重启后端服务。"
)


class LLMNotConfiguredError(RuntimeError):
    """未配置模型密钥。"""


class LLMCallError(RuntimeError):
    """真实请求在重试耗尽后仍然失败。"""


def describe_backend() -> dict[str, Any]:
    """当前模型后端的状态，供 ``/api/health`` 与前端展示。"""
    config = load_config()
    usable = is_usable_api_key(config.api_key)
    return {
        "mode": "live" if usable else "unconfigured",
        "provider": config.provider_label if usable else "not-configured",
        "model": config.model if usable else "not-configured",
        "base_url": config.base_url if usable else "",
        "api_key_configured": usable,
    }


def _messages(
    prompt: str,
    system_prompt: str | None,
    messages: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    return build_messages(prompt, system_prompt or "", messages)


def _require_model() -> None:
    """没有密钥就直接抛错——不假装自己能回答。"""
    if not has_real_model():
        raise LLMNotConfiguredError(NO_KEY_HINT)


async def complete(
    prompt: str = "",
    system_prompt: str | None = None,
    model: str | None = None,
    api_key: str | list[str] | None = None,
    base_url: str | None = None,
    api_version: str | None = None,
    binding: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
    exponential_backoff: bool = True,
    allow_image_fallback: bool | None = None,
    **kwargs: Any,
) -> str:
    """调用模型并返回完整文本。

    没有密钥时抛 :class:`LLMNotConfiguredError`；请求失败且重试耗尽时抛
    :class:`LLMCallError`。**绝不返回占位内容。**
    """
    _require_model()

    config = _resolve_config(model, api_key, base_url)
    client = OpenAICompatibleClient(config)
    resolved_messages = _messages(prompt, system_prompt, messages)

    last_error: Exception | None = None
    for attempt in range(1, max(1, max_retries) + 1):
        try:
            return await client.complete(
                resolved_messages,
                model=model,
                max_tokens=kwargs.get("max_tokens"),
                temperature=kwargs.get("temperature"),
                # ``response_format={"type": "json_object"}`` 等 OpenAI
                # 兼容扩展参数必须原样透传——装配器要用它逼模型输出
                # 严谨 JSON，而不是「带 ```json 围栏的自由文本」。
                **{
                    key: value
                    for key, value in kwargs.items()
                    if key not in ("max_tokens", "temperature")
                },
            )
        except LLMRequestError as exc:
            last_error = exc
            logger.warning(
                "模型请求失败（第 %s/%s 次）: %s", attempt, max_retries, exc
            )
            if attempt >= max(1, max_retries):
                break
            delay = (
                retry_delay * (RETRY_BACKOFF ** (attempt - 1))
                if exponential_backoff
                else retry_delay
            )
            await asyncio.sleep(delay)

    raise LLMCallError(f"模型请求最终失败：{last_error}") from last_error


async def stream(
    prompt: str = "",
    system_prompt: str | None = None,
    model: str | None = None,
    api_key: str | list[str] | None = None,
    base_url: str | None = None,
    api_version: str | None = None,
    binding: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
    exponential_backoff: bool = True,
    allow_image_fallback: bool | None = None,
    **kwargs: Any,
):
    """调用模型并逐段产出文本增量。

    降级策略与 :func:`complete` 一致：没有密钥抛错，请求失败重试，
    重试耗尽抛错。
    """
    _require_model()

    config = _resolve_config(model, api_key, base_url)
    client = OpenAICompatibleClient(config)
    resolved_messages = _messages(prompt, system_prompt, messages)

    last_error: Exception | None = None
    for attempt in range(1, max(1, max_retries) + 1):
        try:
            async for chunk in client.stream(
                resolved_messages,
                model=model,
                max_tokens=kwargs.get("max_tokens"),
                temperature=kwargs.get("temperature"),
            ):
                yield chunk
            return
        except LLMRequestError as exc:
            last_error = exc
            logger.warning(
                "模型流式请求失败（第 %s/%s 次）: %s", attempt, max_retries, exc
            )
            if attempt >= max(1, max_retries):
                break
            delay = (
                retry_delay * (RETRY_BACKOFF ** (attempt - 1))
                if exponential_backoff
                else retry_delay
            )
            await asyncio.sleep(delay)

    raise LLMCallError(f"模型流式请求最终失败：{last_error}") from last_error


def _resolve_config(
    model: str | None,
    api_key: str | list[str] | None,
    base_url: str | None,
) -> LLMConfig:
    """把调用点的显式参数与环境变量合并成一份最终配置。"""
    config = load_config()
    if isinstance(api_key, str) and api_key:
        config.api_key = api_key
    if base_url:
        config.base_url = base_url
    if model:
        config.model = model
    return config


__all__ = [
    "LLMCallError",
    "LLMNotConfiguredError",
    "NO_KEY_HINT",
    "complete",
    "describe_backend",
    "has_real_model",
    "stream",
]
