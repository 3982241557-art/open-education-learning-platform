"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface AppShellState {
  /** 当前选中的 workspace id。 */
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  /** 工作区列表。 */
  workspaces: { id: string; name: string }[];
  setWorkspaces: (next: { id: string; name: string }[]) => void;
}

const AppShellContext = createContext<AppShellState | null>(null);

/**
 * 应用外壳的全局状态。
 *
 * 复刻自 DeepTutor 的 ``context/AppShellContext``：整个应用共享"当前工作区"
 * 这个概念，skill 与课程的可见范围都由它决定。
 */
export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState("default");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);

  const value = useMemo(
    () => ({ workspaceId, setWorkspaceId, workspaces, setWorkspaces }),
    [workspaceId, workspaces],
  );

  return (
    <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
  );
}

export function useAppShell(): AppShellState {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used inside AppShellProvider");
  }
  return context;
}
