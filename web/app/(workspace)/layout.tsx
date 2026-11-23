import { Suspense } from "react";
import AppShell from "@/components/layout/AppShell";
import SmartEntryRedirect from "@/components/layout/SmartEntryRedirect";
import { ShellActionsProvider } from "@/context/ShellActionsContext";
import { ProfileProvider } from "@/context/ProfileContext";

/**
 * 工作区路由组的外壳
 * ==================
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
 * 变更记录
 * --------
 *
 * ⛔ **不再有顶部通栏导航**。旧版有 64px 顶部栏 + 210px 左侧栏，
 *    两条常驻导航把横向空间切碎、把滚动切成两段、还让视觉重心
 *    永远偏上。现在只剩**底部一个悬浮岛**。
 *
 * ⛔ **不再有进站拦截弹窗**。用户第一次打开时不必先做完两道选择
 *    才能看到内容——年级 / 语言选择器收纳在悬浮岛与个人档案里，
 *    随时自由点选。
 *
 * ⛔ **零垂直滚动**。根容器锁死 ``h-screen w-screen overflow-hidden``，
 *    底部预留 76px 给悬浮岛。
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
      <ShellActionsProvider>
        <AppShell homeHref="/">
          {/*
           * 智能直达动线——已经进过站的用户再次打开根网址时，
           * 静默送到课程总台。必须包在 Suspense 里（useSearchParams）。
           */}
          <Suspense fallback={null}>
            <SmartEntryRedirect />
          </Suspense>
          {children}
        </AppShell>
      </ShellActionsProvider>
    </ProfileProvider>
  );
}
