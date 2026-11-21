"use client";

import { useEffect } from "react";
import { useAppShell } from "@/context/AppShellContext";
import { apiFetch, apiUrl, isStaticRuntime } from "@/shared/api/client";

/**
 * 拉取工作区列表并写入 AppShellContext。
 *
 * 复刻自 DeepTutor 的 ``components/workspaces/WorkspaceNavigation`` 的职责：
 * 全局只加载一次工作区列表，侧边栏从 context 读。
 */
export default function WorkspaceNavigation() {
  const { setWorkspaces, setWorkspaceId, workspaceId } = useAppShell();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // ── 静态模式 ──
        //
        // 工作区是后端的概念。静态站点只有一个隐式工作区，
        // 所以直接给它一个默认的、不做任何请求。
        if (await isStaticRuntime()) {
          if (!alive) return;
          setWorkspaces([{ id: "default", name: "我的学习空间" }]);
          setWorkspaceId("default");
          return;
        }

        const response = await apiFetch(apiUrl("/api/workspaces"), {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        const list = Array.isArray(data?.workspaces) ? data.workspaces : [];
        if (!alive) return;
        setWorkspaces(
          list.map((item: any) => ({
            id: String(item?.id ?? ""),
            name: String(item?.name ?? item?.id ?? ""),
          })),
        );
        if (list.length > 0) {
          const ids = list.map((item: any) => String(item?.id ?? ""));
          if (!ids.includes(workspaceId)) {
            setWorkspaceId(ids.includes("default") ? "default" : ids[0]);
          }
        }
      } catch {
        /* 后端未启动时静默降级——页面其余部分照常工作 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [setWorkspaces, setWorkspaceId, workspaceId]);

  return null;
}
