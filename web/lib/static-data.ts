/**
 * 静态数据层
 * ==========
 *
 * 从 ``/data/*.json`` 读取**构建期就定型**的数据。
 *
 * 什么时候用它
 * ------------
 *
 * * ``NEXT_PUBLIC_STATIC_EXPORT=true`` —— 纯静态模式（GitHub Pages）。
 *   此时**没有后端**，所有数据只能从本地 JSON 读。
 * * 运行期**探测**到后端连不上 —— 自动降级到静态数据。
 *
 * 为什么需要「自动降级」
 * --------------------
 *
 * 静态导出的产物（``web/out/``）是**同一份**代码，也可能在有后端的
 * 环境里跑（比如本地 ``next start``）。而纯静态模式与联调模式的用户
 * 体验应该一致——不该因为「有没有后端」而让某些功能凭空消失。
 *
 * 降级的判定
 * ----------
 *
 * **第一次**读静态数据时顺带探一下后端：探不通就用静态数据并且**记住**
 * 这个判断（不重复探测）。探得通就走后端。
 *
 * basePath 兼容
 * -------------
 *
 * GitHub Pages 的项目站点在**二级路径**下（``/仓库名/``）。所以静态
 * 数据的 URL 必须带上 ``basePath``，否则会 404。
 *
 * 这里用 ``process.env.NEXT_PUBLIC_BASE_PATH``——它在构建期就被内联，
 * 正好符合「静态资源路径必须编译期确定」的要求。
 */

/** 静态模式是否**强制开启**。 */
export const STATIC_FORCED: boolean =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/**
 * basePath——GitHub Pages 项目站点的二级路径前缀。
 *
 * 例：仓库名是 ``dream-class``，站点在
 * ``https://用户名.github.io/dream-class/``，那么 basePath 就是
 * ``/dream-class``。
 */
export const BASE_PATH: string = (
  process.env.NEXT_PUBLIC_BASE_PATH || ""
).replace(/\/+$/, "");

/**
 * 拼一个**静态资源**的完整路径。
 *
 * 与普通的 ``apiUrl`` 不同——这个走的是 ``basePath`` 而不是
 * ``NEXT_PUBLIC_API_BASE_URL``。
 */
export function staticUrl(relativePath: string): string {
  const normalized = relativePath.startsWith("/")
    ? relativePath
    : `/${relativePath}`;
  return `${BASE_PATH}${normalized}`;
}

/**
 * 后端是否**曾经**探测为可用。
 *
 * ``null`` = 还没探测过；``true`` = 后端活着；``false`` = 后端不通。
 */
let backendReachable: boolean | null = null;

/**
 * 探测后端是否可达。
 *
 * 只探**一次**——结果缓存起来。
 *
 * 为什么只探一次
 * --------------
 *
 * 这个探测会发一个网络请求。如果每次读数据都探一次，那么一个页面
 * 上有 5 个组件要读数据 → 5 个探测请求 → 后端挂了的话就是 5 个
 * 失败的请求 + 5 个控制台报错。
 *
 * 探一次就够——后端在一次会话里不太会「从活着变成死了」。
 */
export async function probeBackend(): Promise<boolean> {
  if (backendReachable !== null) return backendReachable;
  if (STATIC_FORCED) {
    backendReachable = false;
    return false;
  }

  try {
    // 用带超时的 fetch——后端连不上时不能无限期挂着。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    // ⚠️ 必须探**后端接口**，不能探静态资源。
    //
    // 探静态资源（如 ``/data/manifest.json``）永远会成功——纯静态站点
    // 里那份文件本来就在。于是「后端在线」被误判，静态分支永远走不到，
    // 前端转而去请求 ``/api/xxx``，拿到 SPA 兜底页（200 + HTML），
    // JSON 解析失败 → 数据为空 → 页面显示「0 个技能」这类静默故障。
    const response = await fetch(staticUrl("/api/health"), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    backendReachable = response.ok;
  } catch {
    backendReachable = false;
  }

  return backendReachable;
}

/**
 * 读一个静态 JSON。
 *
 * @param relativePath 相对于站点根的路径，例 ``/data/global_resource_hub.json``
 */
export async function fetchStaticJson<T = unknown>(
  relativePath: string,
): Promise<T | null> {
  try {
    const response = await fetch(staticUrl(relativePath), {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 读一个**纯文本**静态文件。
 *
 * 与 :func:`fetchStaticJson` 的区别：技能库是 ``SKILL.md``——
 * Markdown 文本，不是 JSON。所以要一个读纯文本的版本。
 */
export async function fetchStaticText(
  relativePath: string,
): Promise<string | null> {
  try {
    const response = await fetch(staticUrl(relativePath), {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * 静态索引——构建期由 ``scripts/sync-static-data.mjs`` 生成。
 */
export interface StaticManifest {
  generated_at: string;
  entries: Array<{
    key: string;
    path: string;
    bytes: number;
    sha256: string;
  }>;
}

let manifestCache: StaticManifest | null = null;

/** 读静态索引（带缓存）。 */
export async function fetchManifest(): Promise<StaticManifest | null> {
  if (manifestCache) return manifestCache;
  manifestCache = await fetchStaticJson<StaticManifest>("/data/manifest.json");
  return manifestCache;
}

/**
 * 整个平台当前是否运行在**纯静态**模式。
 *
 * 两种情况：
 *
 * 1. ``NEXT_PUBLIC_STATIC_EXPORT=true`` —— 编译期就确定了；
 * 2. 运行期探测到后端不通 —— 自动降级。
 *
 * 第 2 种是**异步**的，所以这个函数只能在 ``useEffect`` 之类的
 * 副作用里用。组件第一次渲染时拿到的可能是 ``false``——这没关系，
 * 因为静态数据本来就是异步加载的。
 */
export async function isStaticMode(): Promise<boolean> {
  if (STATIC_FORCED) return true;
  return !(await probeBackend());
}

/** 手动重置探测结果——测试用。 */
export function resetBackendProbe(): void {
  backendReachable = null;
}
