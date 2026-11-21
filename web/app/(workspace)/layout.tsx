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
      </ShellActionsProvider>
    </ProfileProvider>
  );
}
