"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  Suspense,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { PLATFORM_SHORT_NAME, HQ_LABEL } from "@/lib/branding";
import { BrandFooter } from "@/components/layout/BrandBar";

/**
 * 侧边栏抽屉的关闭句柄。
 *
 * 让侧边栏在点击导航后收起抽屉，而不必让每个 layout 层层传回调。
 * 桌面端与 AppShell 之外时它是 null，调用 ``drawer?.close()`` 是安全的空操作。
 */
const SidebarDrawerContext = createContext<{ close: () => void } | null>(null);

export function useSidebarDrawer() {
  return useContext(SidebarDrawerContext);
}

interface AppShellProps {
  /** 该路由组的侧边栏。 */
  sidebar: ReactNode;
  /** 内容区上方的条（由 layout 决定显示什么）。 */
  pageBar?: ReactNode;
  homeHref?: string;
  children: ReactNode;
}

/**
 * 应用框架，``(workspace)`` 与 ``(utility)`` 两个路由组共用。
 *
 * 两种布局，按宽度切换：
 *
 *   >= 768px  侧边栏与内容是 flex 行的兄弟节点；
 *   <  768px  侧边栏离开文档流，变成带遮罩的抽屉，由顶部紧凑条负责开关。
 *              220px 的固定列在 390px 视口里只剩 170px 内容，溢出会被裁掉
 *              而不是可滚动。
 *
 * 切分写在 CSS（``max-md:`` / ``md:``）里而非 ``useDevice()``，这样第一帧
 * 服务端渲染在手机上就已经正确。JS 只负责真正有状态的部分：抽屉开合。
 */
export default function AppShell({
  sidebar,
  pageBar,
  homeHref = "/",
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const close = useCallback(() => setDrawerOpen(false), []);

  // 路由变化后把屏幕交还给内容区。在渲染期比较而不是放在 effect 里
  // （与 DeepTutor 的 SessionViewerPanel 同款模式），这样抽屉不会在新路由
  // 上闪一帧。
  const [trackedPathname, setTrackedPathname] = useState(pathname);
  if (trackedPathname !== pathname) {
    setTrackedPathname(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <SidebarDrawerContext.Provider value={{ close }}>
      {/* dvh 而非 vh：iOS Safari 的 100vh 含收起后的地址栏，
          vh 高的外壳会把输入框顶到地址栏下面。 */}
      <div className="flex h-dvh overflow-hidden">
        {drawerOpen ? (
          <div
            onClick={close}
            aria-hidden
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
          />
        ) : null}

        <div
          className={`max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-xl max-md:transition-transform max-md:duration-200 max-md:ease-out ${
            drawerOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
          }`}
        >
          {sidebar}
        </div>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="打开导航"
              aria-expanded={drawerOpen}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/55 hover:text-[var(--foreground)]"
            >
              <Menu size={18} strokeWidth={1.7} />
            </button>
            <Link href={homeHref} className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
              {PLATFORM_SHORT_NAME}
              <span className="truncate text-[11px] font-normal text-[var(--muted-foreground)]">
                · {HQ_LABEL}
              </span>
            </Link>
          </div>

          {pageBar}
          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense
              fallback={<div aria-busy="true" className="h-full bg-[var(--background)]" />}
            >
              {children}
            </Suspense>
          </div>

          {/* ── 全站底部品牌栏 ──
           *
           * 「开放教育学习平台（深圳后海总部） · 连接全球华人的终身学习家园」
           *
           * 放在**内容区之外**、紧贴视口底边——这样无论用户在
           * 哪个路由、滚动到哪里，品牌的物理锚点都在。
           */}
          <BrandFooter />
        </main>
      </div>
    </SidebarDrawerContext.Provider>
  );
}
