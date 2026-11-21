"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 全屏模态框
 * =========
 *
 * 用于展示大面积内容——Mermaid 思维导图、宽表格、长代码块。
 *
 * 为什么要它
 * ----------
 *
 * 思维导图在 380px 宽的右栏里只能看到个大概：节点文字被压缩、连线
 * 交叠成一团。用户想看清结构，必须能把它放大到整屏。
 *
 * 交互细节
 * --------
 *
 * - **Esc 关闭** —— 不用鼠标也能退出；
 * - **点击遮罩关闭** —— 但**点击内容不关闭**（否则看图时误触就没了）；
 * - **打开时锁滚动** —— 否则背景页面会跟着一起滚；
 * - **关闭后焦点回到触发元素** —— 键盘用户的焦点不会丢。
 */
export function FullscreenModal({
  open,
  onClose,
  title = "",
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** 打开前的焦点——关闭后还回去。 */
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // 锁住背景滚动。
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // 打开后把焦点移进面板，键盘用户能直接操作。
    requestAnimationFrame(() => {
      panelRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title || "全屏查看"}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* 面板 */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-full w-full max-w-[1400px] flex-col",
          "overflow-hidden rounded-2xl border border-[var(--border)]",
          "bg-[var(--card)] shadow-[var(--shadow-panel)]",
          "outline-none",
          className,
        )}
      >
        {/* 标题栏 */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
          <h2 className="truncate text-[13px] font-semibold">
            {title || "全屏查看"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="shrink-0 rounded-lg p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X size={15} />
          </button>
        </header>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
