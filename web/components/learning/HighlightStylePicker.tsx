"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  type HighlightColor,
  type HighlightStyle,
  highlightVars,
} from "@/components/learning/highlight-style";
import { cn } from "@/lib/cn";

/**
 * 划线样式选择器
 * ==============
 *
 * 用户在划词工具栏点「划线/写笔记」时弹出的轻巧面板：
 *
 * - 上半部分：**划线形状**（荧光高亮 / 底部直线 / 波浪线）+ **莫兰迪色卡**；
 * - 下半部分：**自动聚焦**的多行笔记输入框；
 * - 角落一行 9.5px 的状态字：「保存中…」→「✓ 已存」；
 * - 底部一条实时预览——所见即所得。
 *
 * 为什么把笔记输入框放进来
 * ----------------------
 *
 * 原来的流程是割裂的三步：正文划线 → 去左栏点卡片 → 输入文字 →
 * 点「完成」。用户要在三个地方来回跳，而**「写笔记不保存」这个 bug
 * 就藏在这条割裂的路径上**——左栏的「完成」按钮当时只关掉了编辑态，
 * 根本没调保存。
 *
 * 现在一气呵成：面板里直接打字，边打字边自动落盘。划线、配色、
 * 批注在**同一个地方**完成。
 *
 * 交互
 * ----
 *
 * 选完即生效：点形状或颜色，正文立刻渲染出对应的划线，左栏同时
 * 出现这条记录；输入框里的字以 500ms 防抖自动保存，按 Enter 或
 * 失焦立即保存，并在角落闪一个「✓ 已存」。
 */
export function HighlightStylePicker({
  style,
  color,
  onChange,
  note = "",
  onNoteChange,
  onNoteCommit,
  saved = false,
  saving = false,
  autoFocusNote = true,
  className = "",
}: {
  style: HighlightStyle;
  color: HighlightColor;
  onChange: (next: { style: HighlightStyle; color: HighlightColor }) => void;
  /** 笔记输入框的当前内容。 */
  note?: string;
  /** 每次输入都会调用——由上层做防抖。 */
  onNoteChange?: (value: string) => void;
  /** 按 Enter 或失焦时调用——立即落盘。 */
  onNoteCommit?: () => void;
  /** 是否显示「✓ 已存」。 */
  saved?: boolean;
  /** 是否正在往磁盘上写（「保存中…」）。 */
  saving?: boolean;
  /** 是否自动聚焦输入框。 */
  autoFocusNote?: boolean;
  className?: string;
}) {
  /**
   * 面板自己持有「当前选中」的形状与颜色。
   *
   * 形状和颜色是两个**正交**决策，用户通常连点两下。如果直接用父
   * 组件传下来的 props 来算下一次的值，第二次点击读到的还是第一次
   * 点击之前的旧 props——于是「先选形状、再选颜色」会把形状改回去。
   * 这里在本地维护一份状态，改完再整体往上抛。
   */
  const [localStyle, setLocalStyle] = useState(style);
  const [localColor, setLocalColor] = useState(color);

  // 父组件重置时（比如重新选一段文字）跟着回到初始值。
  useEffect(() => {
    setLocalStyle(style);
    setLocalColor(color);
  }, [style, color]);

  const noteRef = useRef<HTMLTextAreaElement>(null);

  // 自动聚焦——用户点开面板就能直接打字。
  useEffect(() => {
    if (!autoFocusNote) return;
    const node = noteRef.current;
    if (!node) return;
    // 等一帧，确保面板已经完成布局，否则聚焦会落到错误的滚动位置。
    const timer = window.setTimeout(() => node.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [autoFocusNote]);

  const pick = (next: { style: HighlightStyle; color: HighlightColor }) => {
    setLocalStyle(next.style);
    setLocalColor(next.color);
    onChange(next);
  };

  return (
    <div
      data-selection-ui
      className={cn(
        "w-[248px] rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5",
        "shadow-[var(--shadow-panel)]",
        // 极端小屏下弹窗不会被裁掉——超出就自己滚。
        // 上限取「视口高度减去边距」，保证面板整体始终留在视口内，
        // 哪怕正上下都装不下（见上面的碰撞检测的第三种情况）。
        "max-h-[calc(100vh-20px)] overflow-y-auto",
        className,
      )}
    >
      {/* ── 上半部分：形状 + 配色 ── */}
      <div>
        <p className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          划线形状
        </p>
        <div className="grid grid-cols-3 gap-1">
          {HIGHLIGHT_STYLES.map((item) => {
            const active = item.id === localStyle;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pick({ style: item.id, color: localColor })}
                aria-pressed={active}
                title={item.hint}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition-colors",
                  active
                    ? "border-[var(--primary)]/45 bg-[var(--muted)]"
                    : "border-transparent hover:bg-[var(--muted)]/60",
                )}
              >
                {/* 形状预览——用真实的渲染样式，而不是图标 */}
                <span
                  className="text-[13px] leading-tight"
                  style={highlightVars(item.id, localColor)}
                >
                  字
                </span>
                <span className="text-[9.5px] leading-tight text-[var(--muted-foreground)]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* 莫兰迪配色 */}
        <p className="mb-1.5 mt-2.5 px-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          莫兰迪配色
        </p>
        <div className="flex items-center gap-1.5 px-0.5">
          {HIGHLIGHT_COLORS.map((item) => {
            const active = item.id === localColor;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pick({ style: localStyle, color: item.id })}
                aria-pressed={active}
                aria-label={item.label}
                title={item.label}
                className={cn(
                  "group relative flex h-7 w-7 items-center justify-center rounded-full transition-transform",
                  active ? "scale-100" : "scale-90 hover:scale-100",
                )}
                style={{ background: item.swatch }}
              >
                {active && (
                  <Check
                    size={13}
                    strokeWidth={2.6}
                    className="text-white drop-shadow-sm"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 下半部分：直接写批注 ── */}
      <div className="mt-2.5 border-t border-[var(--border)] pt-2.5">
        <div className="mb-1 flex items-center justify-between px-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            我的批注
          </span>
          {/*
            落盘状态——一行极小的字，不弹窗、不遮挡。

            「保存中…」告诉用户「字已经被收下了，正在写盘」；
            「✓ 已存」告诉用户「写好了，可以放心走了」。
          */}
          <span
            aria-live="polite"
            className={cn(
              "inline-flex items-center gap-0.5 text-[9.5px] transition-opacity duration-300",
              saved
                ? "opacity-100 text-emerald-600 dark:text-emerald-400"
                : saving
                  ? "opacity-100 text-[var(--muted-foreground)]"
                  : "opacity-0",
            )}
          >
            {saved ? (
              <>
                <Check size={9} strokeWidth={2.8} />
                已存
              </>
            ) : (
              <>
                <Loader2 size={9} strokeWidth={2.4} className="animate-spin" />
                保存中…
              </>
            )}
          </span>
        </div>
        <textarea
          ref={noteRef}
          value={note}
          onChange={(event) => onNoteChange?.(event.target.value)}
          onBlur={() => onNoteCommit?.()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onNoteCommit?.();
            }
          }}
          rows={3}
          placeholder="写下你的想法…（自动保存）"
          aria-label="写下你的批注"
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[11.5px] leading-relaxed outline-none transition-colors placeholder:text-[var(--muted-foreground)]/70 focus:border-[var(--foreground)]/25"
        />
      </div>

      {/* 实时预览 */}
      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5">
        <p className="text-[12px] leading-relaxed">
          <span
            style={highlightVars(localStyle, localColor)}
            className="rounded-[3px] px-[2px]"
          >
            钟鼓馔玉不足贵
          </span>
        </p>
      </div>
    </div>
  );
}
