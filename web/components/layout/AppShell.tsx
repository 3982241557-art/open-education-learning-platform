"use client";

import { Suspense, type ReactNode } from "react";
import TopNav from "@/components/layout/TopNav";

/**
 * 应用框架
 * ========
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────┐
 *     │  TopNav（64px 吸顶）                    │
 *     ├──────────────────────────────────────────┤
 *     │                                          │
 *     │  内容区（整页滚动）                     │
 *     │                                          │
 *     └──────────────────────────────────────────┘
 *
 * 从「左侧固定窄栏」到「顶部吸顶栏」的意义
 * ---------------------------------------
 *
 * 旧结构是 ``220px 固定栏 + 右侧独立滚动容器``。它有两个副作用：
 *
 * 1. **横向空间被吃掉**——1400px 的屏幕上，内容只剩 1180px；
 * 2. **滚动被切成两段**——侧栏不动、内容区自己滚，鼠标滚轮在某些
 *    浏览器里滚到侧栏就「卡住」。
 *
 * 现在整页只有**一个滚动条**。内容区拿到完整宽度，实验台可以放到
 * 1440px——这是 PhET 级交互教具能铺开的前提。
 *
 * 内容最大宽度
 * ------------
 *
 * 默认 ``1280px``；学习实验台这类页面自己可以突破到 ``1440px``
 * （通过 ``wide`` prop）。居中容器 + 上下 padding，让内容「浮」在
 * 象牙纸白画布上。
 */
export interface AppShellProps {
  /** 内容区上方的条（由 layout 决定显示什么）。 */
  pageBar?: ReactNode;
  /** 首页链接。 */
  homeHref?: string;
  /** 内容最大宽度。 */
  maxWidth?: "default" | "wide";
  children: ReactNode;
}

export default function AppShell({
  pageBar,
  children,
  maxWidth = "default",
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)]">
      <TopNav />

      {pageBar}

      <main className="min-h-0 flex-1">
        <Suspense
          fallback={<div aria-busy="true" className="min-h-[60vh] bg-[var(--background)]" />}
        >
          <div
            className={
              maxWidth === "wide"
                ? "mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6"
                : "mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6"
            }
          >
            {children}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
