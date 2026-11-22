import WorkspaceSidebar from "@/components/sidebar/WorkspaceSidebar";
import AppShell from "@/components/layout/AppShell";
import { ShellActionsProvider } from "@/context/ShellActionsContext";
import { ProfileProvider } from "@/context/ProfileContext";

/**
 * 工作区路由组的外壳：侧边栏 + 内容区。
 *
 * 复刻自 DeepTutor 的 ``app/(workspace)/layout.tsx``，但去掉了
 * CapabilityGate / CapabilityAccessProvider —— 空壳版本不做模型能力鉴权，
 * 所以页面永远不会被"请先配置模型"锁住。
 *
 * ``ShellActionsProvider`` 放在这里，是因为根导航栏（深蓝窄栏）需要
 * 渲染**页面自己注册**的动作按钮——比如 hub 页的 [☰ 选课] 和
 * [📝 笔记] 两个抽屉触发器。Provider 必须在导航栏之上、页面之下，
 * 这样两边才在同一棵树里。
 */
export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ProfileProvider>
      <ShellActionsProvider>
        <AppShell sidebar={<WorkspaceSidebar />} homeHref="/">
          {children}
        </AppShell>
        {/*
          ⛔ **不再有进站拦截弹窗**。

          旧版在这里挂了一个「年级 + 语言」的选择弹窗，新用户第一次
          打开就必须先做完两道选择才能看到内容。

          它的三个硬伤：

          1. **时机错了**——用户在还不知道这里有什么的时候就要决定
             「我几年级」，他凭什么选？
          2. **太强硬**——模态框是强制的，等于把品牌第一印象变成一张
             问卷。英文用户第一眼撞上中文弹窗，会直接走人。
          3. **重复**——课程页顶栏、侧边栏个人档案卡里本来就有年级
             选择器，弹窗是第三份。

          现在：年级 / 语言选择器**收纳在顶栏、【课程】页顶栏与个人
          主页**三处，随时自由点选（见 ``components/common/
          GradeSelector.tsx``）。首页开场只有一张纸飞机。
        */}
      </ShellActionsProvider>
    </ProfileProvider>
  );
}
