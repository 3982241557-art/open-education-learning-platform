/**
 * 统一的 API 客户端。
 *
 * 三种模式
 * --------
 *
 * 1. **静态模式**（``NEXT_PUBLIC_STATIC_EXPORT=true``）
 *    没有后端。课程数据从 ``/data/*.json`` 读，用户数据从
 *    ``localStorage`` 读，AI 直接调 DeepSeek。
 * 2. **降级模式**（运行期探测到后端不通）
 *    自动切到静态模式——用户体验保持一致。
 * 3. **联调模式**（有后端）
 *    请求走相对路径 ``/api/xxx``，由 ``next.config.js`` 的 rewrite
 *    代理转发。浏览器只跟同源打交道，没有跨域问题。
 *
 * 为什么默认走代理而不是直连
 * ------------------------
 *
 * 浏览器直连后端要处理 CORS 预检、要暴露后端域名、还要在换域名时重新
 * 构建前端。走 rewrite 之后，浏览器看到的永远是**同源**请求——
 * 没有预检、没有跨域错误，换后端域名也不用动前端。
 *
 * 复刻自 DeepTutor 的 ``shared/api/client.ts``，但**没有**鉴权重定向：
 * 空壳版本不启用登录，401 不会把用户踢去登录页。
 */

import {
  STATIC_FORCED,
  fetchStaticJson,
  fetchStaticText,
  probeBackend,
  staticUrl,
} from "@/lib/static-data";

export interface RequestOptions extends RequestInit {
  skipAuthRedirect?: boolean;
}

/**
 * 拼一个 API 路径。
 *
 * 静态模式下**不能**用 API 路径——那些端点在纯静态站点里根本不存在。
 * 所以静态模式的调用方必须改用专门的数据函数，不能走这里。
 *
 * 这里仍然返回相对路径，是为了让联调模式的代码保持原样。
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

/**
 * 当前是否处于**静态模式**。
 *
 * 同步版本只能反映「编译期强制开启」这一种情况。运行期探测出来的
 * 降级是异步的——需要用 :func:`isStaticRuntime`。
 */
export function isStaticBuild(): boolean {
  return STATIC_FORCED;
}

/**
 * 运行期的静态模式判定（异步）。
 *
 * 会**缓存**探测结果——同一个页面里问多少次都只探一次。
 */
export async function isStaticRuntime(): Promise<boolean> {
  if (STATIC_FORCED) return true;
  return !(await probeBackend());
}

/**
 * 读静态 JSON 的便捷封装。
 *
 * 静态模式下用它替代 ``apiFetch``。
 */
export async function staticFetch<T = unknown>(
  path: string,
): Promise<T | null> {
  return fetchStaticJson<T>(path);
}

/**
 * 读一个**纯文本**静态文件。
 *
 * 技能库是 ``SKILL.md``——Markdown 文本，不是 JSON。
 */
export async function staticFetchText(
  path: string,
): Promise<string | null> {
  return fetchStaticText(path);
}

/** 静态资源的完整 URL（带 basePath）。 */
export { staticUrl };

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestOptions,
): Promise<Response> {
  const { skipAuthRedirect: _skip, ...fetchInit } = init ?? {};
  const scopedInput =
    typeof input === "string"
      ? apiUrl(input)
      : input instanceof URL
        ? new URL(apiUrl(input.toString()))
        : new Request(apiUrl(input.url), input);
  return fetch(scopedInput, { credentials: "include", ...fetchInit });
}

export class ApiError extends Error {
  readonly status: number;
  /** 是不是「后端根本没连上」——与「后端说不行」区别对待。 */
  readonly connectivity: boolean;

  constructor(
    message: string,
    status: number,
    options?: { connectivity?: boolean },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.connectivity = options?.connectivity ?? false;
  }
}

/** 解析 JSON 响应体；失败时抛出带后端 detail 的 ApiError。 */
export async function asJsonOrThrow(response: Response): Promise<any> {
  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    // ── 上游没连上 ──────────────────────────────────────────────
    //
    // 真正的后端报错一律是 JSON（``{"detail": "..."}``）。而 Next 的
    // rewrite 代理在上游挂掉时，回的是**纯文本** ``Internal Server
    // Error``——没有 detail、没有结构。
    //
    // 这个差别很关键：前者是「后端说不行」，后者是「后端根本没接
    // 到」。两者给用户的处置完全不同（重试 vs 先把服务启动起来），
    // 所以要在这里就标出来，别让它混进同一个 500 里。
    const isProxyError =
      typeof payload === "string" &&
      /^\s*Internal Server Error\s*$/i.test(payload);
    if (isProxyError) {
      throw new ApiError("连不上后端服务", response.status, {
        connectivity: true,
      });
    }

    const detail =
      payload && typeof payload === "object" && typeof payload.detail === "string"
        ? payload.detail
        : typeof payload === "string" && payload
          ? payload
          : `Request failed: ${response.status}`;
    throw new ApiError(detail, response.status);
  }
  return payload;
}
