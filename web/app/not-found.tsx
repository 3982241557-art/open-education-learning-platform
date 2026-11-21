"use client";

/**
 * 404 页 —— 静态站点的兜底
 * =========================
 *
 * 在纯静态部署（GitHub Pages）上，这个页面会被当作 ``404.html``
 * 交给浏览器。
 *
 * 它自己不做路由跳转
 * ------------------
 *
 * 真正的回退逻辑在两个地方：
 *
 * 1. ``scripts/patch-gh-pages-404.mjs`` 给导出的 ``404.html`` 注入
 *    一段脚本——把用户想访问的路径存进 sessionStorage，跳回根目录；
 * 2. ``components/layout/GhPagesRedirect.tsx`` 在应用启动后读出那个
 *    路径，用客户端路由器导航过去。
 *
 * 为什么绕这一圈
 * --------------
 *
 * 因为客户端路由需要 Next 应用**完整启动**。从 404.html 里直接
 * 渲染课程页，等于要复制一整套 React 树——脆弱且难维护。
 *
 * 本页面只在「回退也没成功」时显示——比如用户输入了一个**真的**
 * 不存在的路径。
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[11px] font-medium tracking-[0.2em] text-[var(--muted-foreground)]">
        404
      </p>
      <h1 className="text-[22px] font-semibold tracking-tight">
        这个页面不存在
      </h1>
      <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
        你要找的内容可能已经被移动或删除了。可以回到首页，从课程大厅重新找。
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-lg bg-[var(--primary)] px-4 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          回到首页
        </Link>
        <Link
          href="/hub/"
          className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-4 text-[12.5px] transition-colors hover:bg-[var(--muted)]"
        >
          去课程大厅
        </Link>
      </div>
    </main>
  );
}
