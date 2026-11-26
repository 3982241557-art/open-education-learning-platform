import { Suspense } from "react";
import AppShell from "@/components/layout/AppShell";
import SmartEntryRedirect from "@/components/layout/SmartEntryRedirect";
import { ShellActionsProvider } from "@/context/ShellActionsContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { MathTaxonomyProvider } from "@/context/MathTaxonomyContext";

/**
 * 工作区路由组的外壳
 * ==================
 *
 * .. code-block:: text
 *
 *     ┌──────────────┬──────────────────────────────────────┐
 *     │  左侧主栏     │                                      │
 *     │  240px       │        右侧全高主舞台                │
 *     │  #0B162C     │        flex-1 · h-screen            │
 *     │  · 学习地图   │                                      │
 *     │  · 实验工坊   │   /      品牌首页（一屏）            │
 *     │  · 成长报告   │   /map   海量数学学习地图（可滚动）   │
 *     │              │   /lab   互动实验台（一屏）           │
 *     │  逻辑链筛选   │   /report 成长与报告（一屏）         │
 *     │  三语切换     │                                      │
 *     │  学习者档案   │                                      │
 *     └──────────────┴──────────────────────────────────────┘
 *
 * 零滚动契约
 * ----------
 *
 * 根容器锁死 ``h-screen w-screen overflow-hidden``。
 * 首页、实验工坊、成长报告严格一屏无垂直滚动；仅「海量数学学习地图」
 * 内部开放滚动与缩放。
 *
 * ``ShellActionsProvider`` 放在这里，是因为页面自己可以注册**页面级
 * 动作按钮**。Provider 必须在导航之上、页面之下。
 */
export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ProfileProvider>
      <MathTaxonomyProvider>
        <ShellActionsProvider>
            <AppShell homeHref="/">
              {/*
               * 智能直达动线——已经进过站的用户再次打开根网址时，
               * 静默送到学习地图。必须包在 Suspense 里（useSearchParams）。
               */}
              <Suspense fallback={null}>
                <SmartEntryRedirect />
              </Suspense>
              {children}
            </AppShell>
        </ShellActionsProvider>
      </MathTaxonomyProvider>
    </ProfileProvider>
  );
}
