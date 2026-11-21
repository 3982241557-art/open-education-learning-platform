"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 侧边抽屉
 * ========
 *
 * 把「非核心学习区」从常驻栏位里搬出来，改成**按需弹出**。
 *
 * 为什么
 * ------
 *
 * 之前的布局是四栏并排：分类导航 | 留存文档 | 主舞台 | AI 助教。
 * 看起来「信息都在手边」，实际效果相反——
 *
 * * 分类导航是一条**又长又窄**的列，里面 90% 的条目用户根本不会点；
 * * 留存文档在用户**没记笔记的时候**是一整列空白；
 * * 两者加起来占掉 420px，而真正要看的东西（视频 + AI）被挤到右边。
 *
 * 更关键的是：它们占了**注意力**，不只是占了像素。用户每次打开
 * 这一页，视线都要先经过两列与自己无关的内容才到达视频。
 *
 * 所以改成抽屉：
 *
 * .. code-block:: text
 *
 *     ┌──┬──────────────────────────────────────────────┐
 *     │☰ │                                              │
 *     │📝│              视频 + AI（100% 宽度）            │
 *     │  │                                              │
 *     └──┴──────────────────────────────────────────────┘
 *        ↑ 只有两个白色图标，其余全部隐藏
 *
 * 点 [☰] → 分类目录从左侧滑出；点空白处 → 自动收起。
 *
 * 行为细节
 * --------
 *
 * * **点空白处收起**——这是抽屉的默认预期，用户不该再点一次按钮
 *   才能关掉它；
 * * **Esc 收起**——键盘用户的等价路径；
 * * **选完课自动收起**——用户已经拿到他想要的了，抽屉继续挡着
 *   画面就是纯粹的阻碍；
 * * **焦点陷阱**——抽屉打开时，Tab 键不应该跑到背后的内容上，
 *   否则屏幕阅读器会读到看不见的内容。
 */
export function SideDrawer({
  open,
  onClose,
  title,
  side = "left",
  width = 320,
  children,
  className = "",
}: {
  /** 是否展开。 */
  open: boolean;
  /** 关闭回调——点遮罩、按 Esc、选完内容都会调它。 */
  onClose: () => void;
  /** 抽屉标题——左上角的一行小字。 */
  title: string;
  /** 从哪一侧滑出。 */
  side?: "left" | "right";
  /** 抽屉宽度（像素）。 */
  width?: number;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc 收起。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // 打开时把焦点移进抽屉——键盘用户的入口。
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* 遮罩——点它收起。半透明黑，不是模糊：模糊会让背后内容
          看起来「还在」，用户不确定自己有没有切出去。 */}
      <div
        className="absolute inset-0 bg-[rgba(15,23,42,0.28)]"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ width }}
        className={cn(
          "absolute top-0 bottom-0 flex flex-col bg-white shadow-[0_0_40px_rgba(15,23,42,0.18)]",
          "animate-[seek-drawer-in_200ms_cubic-bezier(0.16,1,0.3,1)]",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          "border-[var(--border)]",
          className,
        )}
      >
        {/* 抽屉头 */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          <span className="text-[12px] font-medium tracking-[0.02em] text-[var(--foreground)]">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="收起"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* 抽屉内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
