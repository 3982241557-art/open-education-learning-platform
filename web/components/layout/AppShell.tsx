"use client";

import { Suspense, type ReactNode } from "react";
import BottomFloatingDock from "@/components/layout/BottomFloatingDock";

/**
 * 应用框架
 * ========
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────┐
 *     │                                          │
 *     │            画布（100vh 铺满）            │
 *     │                                          │
 *     │   ╭──────────────────────────────╮       │
 *     │   │ OE 课程 报告 ⭐  ⎘ 简繁EN 档案 │       │
 *     │   ╰──────────────────────────────╯       │
 *     └──────────────────────────────────────────┘
 *
 * 零滚动契约
 * ----------
 *
 * 根容器锁死 ``h-screen w-screen overflow-hidden``。所有页面**不能**
 * 靠整页滚动来容纳内容——超出的部分必须在页面内部自己滚。
 *
 * 底部预留 ``76px``（``pb-[76px]``）给悬浮岛：
 * 岛高 52px + ``bottom-4`` 16px + 8px 余量 = 76px。
 *
 * 取消了顶部栏与左侧栏
 * --------------------
 *
 * 旧版有 64px 顶部栏 + 210px 左侧栏。两条常驻导航把横向空间切碎、
 * 把滚动切成两段、还让视觉重心永远偏上。现在只剩底部一个胶囊。
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
  maxWidth = "wide",
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f6f4ef] text-[#1e242b]">
      {pageBar}

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="h-full w-full bg-[#f6f4ef]"
            />
          }
        >
          <div
            className={
              maxWidth === "wide"
                ? "mx-auto h-full w-full max-w-[1600px] px-4 pb-[76px] sm:px-6"
                : "mx-auto h-full w-full max-w-[1280px] px-4 pb-[76px] sm:px-6"
            }
          >
            {children}
          </div>
        </Suspense>
      </main>

      <BottomFloatingDock />
    </div>
  );
}
