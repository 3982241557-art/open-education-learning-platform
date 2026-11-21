"use client";

import { useEffect } from "react";

/**
 * GitHub Pages 的 404 回退处理器
 * ==============================
 *
 * GitHub Pages 是纯静态托管——访问构建期没生成的路径时，它返回
 * ``404.html``。那个页面里嵌的脚本会把用户原本想访问的路径存进
 * ``sessionStorage``，然后跳回站点根目录。
 *
 * 本组件在应用启动后读出那个路径，用客户端路由导航过去。
 *
 * 为什么放在根布局里
 * ------------------
 *
 * 它必须在**每一次**应用启动时运行——包括用户直接访问根页面、
 * 或者从站内跳转过来的情况。所以挂在根布局上最稳。
 */

/** sessionStorage 里存路径的键——必须与补丁脚本里的完全一致。 */
const PENDING_PATH_KEY = "seek.ghpages.pendingPath";

/**
 * 从 pathname 里剥掉 basePath。
 *
 * 为什么必须剥
 * ------------
 *
 * Next 的路由器期望的是**不含** basePath 的路径——它自己会加。
 * 传 ``/仓库名/learning/...`` 进去，会被拼成
 * ``/仓库名/仓库名/learning/...``——双前缀，路由匹配不上。
 */
function stripBasePath(pathname: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (!basePath) return pathname;
  const normalized = basePath.replace(/\/+$/, "");
  if (normalized && pathname.startsWith(normalized)) {
    return pathname.slice(normalized.length) || "/";
  }
  return pathname;
}

/**
 * 把**旧式**证书路径改写成**新式**。
 *
 * 旧式：``/learning/certificates/<id>``（路径参数）
 * 新式：``/learning/certificates/?id=<id>``（查询参数）
 *
 * 为什么改
 * --------
 *
 * 静态导出下，``/learning/certificates/<id>`` 的 HTML **永远不存在**
 * ——证书 id 是运行时才有的。新式把 id 放进查询参数，路径本身是
 * 静态的，构建期就存在。
 *
 * 之前分享出去的旧链接在静态站点上会走 404 回退——由这里改写。
 */
function rewriteLegacyCertificatePath(path: string): string {
  const match = /^\/learning\/certificates\/([^/?#]+)\/?$/.exec(path);
  if (!match) return path;
  const id = decodeURIComponent(match[1]);
  return `/learning/certificates/?id=${encodeURIComponent(id)}`;
}

export default function GhPagesRedirect() {
  useEffect(() => {
    let pending: string | null = null;

    try {
      pending = window.sessionStorage.getItem(PENDING_PATH_KEY);
      if (pending) {
        window.sessionStorage.removeItem(PENDING_PATH_KEY);
      }
    } catch {
      // 隐私模式禁用了 sessionStorage——没有要恢复的路径。
      return;
    }

    if (!pending) return;

    // 只处理站内路径。外部 URL 直接忽略——
    // 否则这是个**开放重定向**漏洞。
    if (!pending.startsWith("/") || pending.startsWith("//")) return;

    const [rawPath, search = ""] = pending.split("?");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const stripped = stripBasePath(rawPath);

    // 旧式证书路径 → 新式。
    const rewritten = rewriteLegacyCertificatePath(stripped);

    // 已经在目标页上了就别跳——否则会陷入重定向循环。
    if (window.location.pathname === pending) return;

    // ── 怎么跳回去 ──
    //
    // 这里**不能**用 Next 的 ``router.replace()``。
    //
    // 静态导出下，App Router 的客户端导航会去拉那个路由的 **RSC
    // 载荷**（``<path>/index.txt?_rsc=...``）。对于构建期没生成的
    // 路径，那个文件不存在——导航失败，页面停在原地。
    //
    // 用 ``window.location.replace()`` 做整页跳转也不行——那个路径的
    // HTML 同样不存在，Pages 又会返回 ``404.html``，于是又跳回根
    // 目录……死循环。
    //
    // 所以走**第三条路**：``history.replaceState`` + 派发
    // ``popstate``。
    //
    // Next 的 App Router 在静态导出下，**路由表是构建期写死的**——
    // ``/learning/certificates/`` 确实在里面。改完 URL 再触发
    // ``popstate``，Next 会重新匹配路由并渲染。
    //
    // 对「构建期没生成」的路径，这个方案**仍然不行**（载荷缺失）。
    // 但那种路径现在只有旧式证书链接——已经被改写成查询参数形式，
    // 指向一个**存在**的静态页面了。

    const target = `${rewritten}${search ? `?${search}` : ""}`;
    const full = `${basePath}${target}`;
    window.history.replaceState(null, "", full);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }, []);

  return null;
}
