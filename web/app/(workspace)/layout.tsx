import AppShell from "@/components/layout/AppShell";
import { ShellActionsProvider } from "@/context/ShellActionsContext";
import { ProfileProvider } from "@/context/ProfileContext";

/**
 * 工作区路由组的外壳
 * ==================
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────┐
 *     │  TopNav（64px 吸顶 · 4 项主导航）        │
 *     ├──────────────────────────────────────────┤
 *     │  内容区（全宽流式 · 最大 1280px）        │
 *     └──────────────────────────────────────────┘
 *
 * 变更记录
 * --------
 *
 * ⛔ **不再有左侧深蓝固定导航栏**。它把动线切成了三段，而且吃掉了
 *    220px 横向空间——实验台型的页面根本铺不开。
 *
 * ⛔ **不再有进站拦截弹窗**。旧版在这里挂了一个「年级 + 语言」的
 *    选择弹窗，新用户第一次打开就必须先做完两道选择才能看到内容。
 *    它的三个硬伤：
 *
 *    1. **时机错了**——用户还不知道这里有什么的时候就要决定「我几年
 *       级」，他凭什么选？
 *    2. **太强硬**——模态框是强制的，等于把品牌第一印象变成一张问卷。
 *       英文用户第一眼撞上中文弹窗，会直接走人。
 *    3. **重复**——顶栏、课程页顶栏、个人档案卡里本来就有年级选择器，
 *       弹窗是第三份。
 *
 *    现在：年级 / 语言选择器收纳在**顶栏、课程页顶栏与个人档案**
 *    三处，随时自由点选（见 ``components/common/GradeSelector.tsx``）。
 *    首页开场只有一张纸飞机。
 *
 * ``ShellActionsProvider`` 放在这里，是因为页面自己可以注册**页面级
 * 动作按钮**（比如 hub 页的 [☰ 选课] 与 [📝 笔记]）。Provider 必须在
 * 导航栏之上、页面之下，这样两边才在同一棵树里。
 */
export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ProfileProvider>
      <ShellActionsProvider>
        <AppShell homeHref="/">{children}</AppShell>
      </ShellActionsProvider>
    </ProfileProvider>
  );
}
