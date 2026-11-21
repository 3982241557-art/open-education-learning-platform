"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

/**
 * 根导航栏的**页面级动作**
 * ========================
 *
 * 根导航栏（深蓝窄栏）是全站共用的骨架。它知道页面有哪些「非核心
 * 学习区」可以折叠成抽屉，但**不知道具体是什么**——那是页面自己的
 * 事情。
 *
 * 所以这里提供一个极小的契约：页面把「我有两个抽屉，图标和标题是
 * 这些」注册进来，导航栏负责把它们渲染成白色图标按钮。
 *
 * 为什么不用 props 层层传
 * ---------------------
 *
 * 导航栏在 ``(workspace)/layout.tsx`` 里，而抽屉按钮属于
 * ``(workspace)/hub/page.tsx``。中间隔了两层 layout——用 props 传
 * 就得把 ``AppShell → WorkspaceLayout → WorkspaceSidebar`` 全部
 * 改造一遍，而且每加一个页面级动作就要再改一次。
 *
 * Context 让页面**自注册**：页面挂载时登记，卸载时注销。导航栏
 * 只负责渲染，不关心是谁登记的。
 *
 * 用法
 * ----
 *
 * .. code-block:: tsx
 *
 *     const { register } = useShellActions();
 *     useEffect(() => register([
 *       { id: "catalog", label: "选课", icon: ListVideo, onClick: openCatalog },
 *       { id: "notes", label: "笔记", icon: NotebookPen, onClick: openNotes },
 *     ]), [openCatalog, openNotes]);
 */

/** 一个注册到根导航栏上的动作按钮。 */
export interface ShellAction {
  /** 唯一标识。 */
  id: string;
  /** 悬停提示与无障碍标签。 */
  label: string;
  /** 图标组件。 */
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** 点击时触发的动作。 */
  onClick: () => void;
}

interface ShellActionsValue {
  /** 当前页面注册的动作列表。 */
  actions: ShellAction[];
  /**
   * 注册一组动作，返回注销函数。
   *
   * 传 ``[]`` 会清空——页面卸载时自然调用它，导航栏就不会留下
   * 上一页的幽灵按钮。
   */
  register: (actions: ShellAction[]) => () => void;
}

const ShellActionsContext = createContext<ShellActionsValue | null>(null);

export function ShellActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ShellAction[]>([]);

  const value = useMemo<ShellActionsValue>(
    () => ({
      actions,
      register: (next) => {
        setActions(next);
        return () => setActions([]);
      },
    }),
    [actions],
  );

  return (
    <ShellActionsContext.Provider value={value}>
      {children}
    </ShellActionsContext.Provider>
  );
}

/**
 * 读取根导航栏的动作注册表。
 *
 * 在 ``ShellActionsProvider`` 之外使用会返回一个**空操作**版本——
 * 这样组件在测试或单独渲染时不会崩。
 */
export function useShellActions(): ShellActionsValue {
  const context = useContext(ShellActionsContext);
  const fallback = useMemo<ShellActionsValue>(
    () => ({ actions: [], register: () => () => {} }),
    [],
  );
  return context ?? fallback;
}

/**
 * 注册一组根导航栏动作（便捷 Hook）。
 *
 * 依赖数组显式传入——动作里通常闭包了页面的 state，必须跟着变，
 * 否则注册进去的是**第一次渲染时的旧闭包**，点按钮会操作到过期的
 * 状态上。
 */
export function useRegisterShellActions(
  actions: ShellAction[],
  deps: React.DependencyList,
): void {
  const { register } = useShellActions();

  useEffect(() => {
    return register(actions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
