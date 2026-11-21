"""
OpenAI 兼容的模型连接器
========================

对 DeepSeek（或任何 OpenAI 兼容端点）的标准 ``POST {base_url}/chat/completions``
调用。刻意不引入 ``openai`` SDK：直接用 HTTP 走兼容协议，换一家厂商只改
``base_url`` 即可，依赖也更轻。

配置优先级（全部读环境变量）：

============================  =========================================
``DEEPSEEK_API_KEY``          密钥。有值即启用真实请求
``DEEPSEEK_BASE_URL``         端点，默认 ``https://api.deepseek.com``
``DEEPSEEK_MODEL``            模型名，默认 ``deepseek-chat``
``SEEK_LLM_API_KEY``          通用密钥（``DEEPSEEK_*`` 未设时的兜底）
``SEEK_LLM_BASE_URL``         通用端点
``SEEK_LLM_MODEL``            通用模型名
============================  =========================================

:func:`has_real_model` 是整套降级机制的开关——上层只问它「现在有没有真
模型可用」，不需要知道密钥从哪来。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from typing import Any, AsyncIterator
from urllib.parse import urlparse

import httpx

#: DeepSeek 的官方端点与默认模型。
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"

#: 单次请求的默认超时（秒）。流式请求需要留足时间，因此单独放宽。
DEFAULT_TIMEOUT = 120.0
DEFAULT_STREAM_TIMEOUT = 300.0

#: 缺省的最大输出 token 数。
DEFAULT_MAX_TOKENS = 2048


class LLMRequestError(RuntimeError):
    """真实请求失败（网络、鉴权、协议或服务端错误）。"""


@dataclass(slots=True)
class LLMConfig:
    """一次模型调用所需的全部配置。"""

    api_key: str = ""
    base_url: str = DEFAULT_DEEPSEEK_BASE_URL
    model: str = DEFAULT_DEEPSEEK_MODEL
    timeout: float = DEFAULT_TIMEOUT
    stream_timeout: float = DEFAULT_STREAM_TIMEOUT
    extra_headers: dict[str, str] = field(default_factory=dict)

    @property
    def endpoint(self) -> str:
        """拼出 ``chat/completions`` 的完整 URL。

        允许 ``base_url`` 已经指向 ``/chat/completions``，也允许它带
        ``/v1`` 后缀——两种写法都归一化到同一个地址。
        """
        base = (self.base_url or DEFAULT_DEEPSEEK_BASE_URL).rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        if base.endswith("/v1"):
            base = base[: -len("/v1")]
        return f"{base}/chat/completions"

    @property
    def provider_label(self) -> str:
        """用于日志与前端展示的服务商标识。"""
        base = (self.base_url or "").rstrip("/")
        if "deepseek" in base:
            return "deepseek"
        host = urlparse(base).hostname or base
        return host or "openai-compatible"


def _env(*names: str) -> str:
    """按顺序取第一个非空的环境变量。"""
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def load_config() -> LLMConfig:
    """从环境变量装配一份模型配置。

    ``DEEPSEEK_*`` 优先于通用的 ``SEEK_LLM_*``——DeepSeek 是本项目的默认
    目标厂商，通用变量留给将来换用别的兼容端点。
    """
    api_key = _env("DEEPSEEK_API_KEY", "SEEK_LLM_API_KEY")
    base_url = _env("DEEPSEEK_BASE_URL", "SEEK_LLM_BASE_URL") or DEFAULT_DEEPSEEK_BASE_URL
    model = _env("DEEPSEEK_MODEL", "SEEK_LLM_MODEL") or DEFAULT_DEEPSEEK_MODEL
    return LLMConfig(api_key=api_key, base_url=base_url, model=model)


def has_real_model() -> bool:
    """当前环境是否配置了可用的真实模型密钥。

    这是整套降级机制的唯一判据：上层只看它，不直接读环境变量。

    **占位符密钥不算**——``.env.example`` 里的示例值一旦被原样复制到
    ``.env``，接口会返回 401。与其让用户以为「配好了却在报错」，
    不如在状态页直接告诉他还没填。
    """
    return is_usable_api_key(load_config().api_key)


def is_usable_api_key(api_key: str) -> bool:
    """这个密钥是不是一个真能用的密钥。

    判为**不可用**的情况：

    - 空字符串；
    - 示例值——``.env.example`` 里带 ``here`` / ``your`` / ``changeme``
      / ``xxx`` / ``example`` 等字样的占位串；
    - 长度明显不对（正常的密钥远长于此）。
    """
    text = str(api_key or "").strip()
    if len(text) < 16:
        return False

    lowered = text.lower()
    placeholders = (
        "your-",
        "your_",
        "changeme",
        "replace",
        "example",
        "placeholder",
        "xxxx",
        "here",
        "todo",
        "fake",
        "test-key",
    )
    if any(token in lowered for token in placeholders):
        return False
    return True


def build_messages(
    prompt: str,
    system_prompt: str = "",
    messages: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """补齐 OpenAI 风格的 ``messages`` 数组。

    调用方给了 ``messages`` 就用它（多轮历史已在其中），但**系统提示词仍要
    单独挂上去**——组装管线的 ``system_prompt`` 承载了 skill 与课程上下文，
    丢掉它等于整条上下文链路失效。

    只有当 ``messages`` 里已经有 system 消息时才跳过，避免重复注入。
    """
    built: list[dict[str, Any]] = []
    has_system = any(item.get("role") == "system" for item in (messages or []))
    if system_prompt and not has_system:
        built.append({"role": "system", "content": system_prompt})
    if messages:
        built.extend(dict(item) for item in messages)
    else:
        built.append({"role": "user", "content": prompt})
    return built


class OpenAICompatibleClient:
    """标准 OpenAI 兼容端点的异步客户端。"""

    def __init__(self, config: LLMConfig | None = None) -> None:
        self.config = config or load_config()

    # ── 内部 ────────────────────────────────────────────────────────────

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.config.api_key}",
        }
        headers.update(self.config.extra_headers)
        return headers

    def _payload(
        self,
        messages: list[dict[str, Any]],
        *,
        stream: bool,
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model or self.config.model,
            "messages": messages,
            "stream": stream,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if temperature is not None:
            payload["temperature"] = temperature
        payload.update({k: v for k, v in extra.items() if v is not None})
        return payload

    # ── 公开 API ────────────────────────────────────────────────────────

    async def complete(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        max_tokens: int | None = DEFAULT_MAX_TOKENS,
        temperature: float | None = None,
        **extra: Any,
    ) -> str:
        """发起一次非流式请求，返回完整文本。"""
        payload = self._payload(
            messages,
            stream=False,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            **extra,
        )
        timeout = httpx.Timeout(self.config.timeout)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.config.endpoint,
                    headers=self._headers(),
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            raise LLMRequestError(
                f"{self.config.provider_label} 返回 {exc.response.status_code}: "
                f"{exc.response.text[:400]}"
            ) from exc
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            raise LLMRequestError(
                f"调用 {self.config.provider_label} 失败: {exc}"
            ) from exc

        try:
            return str(data["choices"][0]["message"]["content"] or "")
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMRequestError(
                f"{self.config.provider_label} 返回了无法解析的响应: {str(data)[:400]}"
            ) from exc

    async def stream(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        max_tokens: int | None = DEFAULT_MAX_TOKENS,
        temperature: float | None = None,
        **extra: Any,
    ) -> AsyncIterator[str]:
        """发起一次流式请求，逐段产出文本增量。"""
        payload = self._payload(
            messages,
            stream=True,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            **extra,
        )
        timeout = httpx.Timeout(self.config.stream_timeout, connect=30.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    self.config.endpoint,
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        chunk = _parse_sse_line(line)
                        if chunk is None:
                            continue
                        if chunk == "[DONE]":
                            return
                        text = _extract_delta(chunk)
                        if text:
                            yield text
        except httpx.HTTPStatusError as exc:
            # 流式响应体没有被读过——``exc.response.text`` 会抛
            # ``ResponseNotRead``。必须先显式读取，否则真正的错误
            # 信息会被这个二次异常盖掉。
            detail = await _safe_read_error(exc.response)
            raise LLMRequestError(
                f"{self.config.provider_label} 返回 {exc.response.status_code}: "
                f"{detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMRequestError(
                f"调用 {self.config.provider_label} 失败: {exc}"
            ) from exc


# ── SSE 解析 ───────────────────────────────────────────────────────────


async def _safe_read_error(response: httpx.Response) -> str:
    """尽力读出错误响应体，读不到就返回一句占位说明。

    非流式响应可以直接 ``.text``；流式响应的body还没被读过，直接
    访问 ``.text`` 会抛 ``ResponseNotRead``——那会把真正的错误信息
    变成一个毫不相关的二次异常。
    """
    try:
        if getattr(response, "is_stream_consumed", False):
            await response.aread()
        text = response.text
    except Exception:  # noqa: BLE001 —— 读不出来不是致命问题
        return "（服务端未返回可读的错误信息）"
    return (text or "（服务端未返回可读的错误信息）")[:400]


def _parse_sse_line(line: str) -> str | None:
    """把一行 SSE 文本解析成 JSON 片段。

    返回 ``None`` 表示这一行不携带内容（空行、注释、事件名等）。
    """
    if not line:
        return None
    stripped = line.strip()
    if not stripped.startswith("data:"):
        return None
    return stripped[len("data:"):].strip()


def _extract_delta(chunk: str) -> str:
    """从一条 SSE JSON 片段里取出增量文本。"""
    try:
        data = json.loads(chunk)
    except json.JSONDecodeError:
        return ""
    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices:
        return ""
    delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
    if not isinstance(delta, dict):
        return ""
    return str(delta.get("content") or "")


__all__ = [
    "DEFAULT_DEEPSEEK_BASE_URL",
    "DEFAULT_DEEPSEEK_MODEL",
    "DEFAULT_MAX_TOKENS",
    "LLMConfig",
    "LLMRequestError",
    "OpenAICompatibleClient",
    "build_messages",
    "has_real_model",
    "load_config",
]
