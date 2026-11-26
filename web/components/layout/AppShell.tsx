"use client";

import { Suspense, type ReactNode } from "react";
import WorkspaceSidebar from "@/components/layout/WorkspaceSidebar";

/**
 * 应用框架
 * ========
 *
 * .. code-block:: text
 *
 *     ┌──────────────┬──────────────────────────────────────┐
 *     │              │                                      │
 *     │  左侧主栏     │        右侧全高主舞台                │
 *     │  240px       │        flex-1 · h-screen            │
 *     │  #0B162C     │        overflow-hidden               │
 *     │              │                                      │
 *     └──────────────┴──────────────────────────────────────┘
 *
 * 零滚动契约
 * ----------
 *
 * 根容器锁死 ``h-screen w-screen overflow-hidden``。所有页面**不能**
 * 靠整页滚动来容纳内容——超出的部分必须在页面内部自己滚。
 *
 * 唯一例外
 * --------
 *
 * 「海量数学学习地图」（``/map``）**允许内部滚动与缩放**——它是全站
 * 唯一一处需要展现浩瀚知识版图的地方。其余页面（首页 / 实验工坊 /
 * 成长报告）一律一屏放下。
 */
export interface AppShellProps {
  /** 首页链接。 */
  homeHref?: string;
  /** 内容最大宽度。 */
  maxWidth?: "default" | "wide";
  children: ReactNode;
}

export default function AppShell({
  children,
  maxWidth = "wide",
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <WorkspaceSidebar />

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="h-full w-full bg-[#F8FAFC]"
            />
          }
        >
          <div
            className={
              maxWidth === "wide"
                ? "mx-auto h-full w-full max-w-[1600px]"
                : "mx-auto h-full w-full max-w-[1280px]"
            }
          >
            {children}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
