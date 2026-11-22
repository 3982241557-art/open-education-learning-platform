"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GraduationCap } from "lucide-react";
import { GRADE_OPTIONS, useGrade } from "@/context/GradeContext";
import { cn } from "@/lib/cn";

/**
 * 年级 / 年龄选择器
 * ==================
 *
 * 一个胶囊形状的下拉选择器。
 *
 * 为什么不再用「进站弹窗」
 * ----------------------
 *
 * 旧版在首次访问时弹出一个模态框，逼用户先做两道选择才能看到内容。
 * 问题在于：
 *
 * 1. **用户在还不知道这里有什么的时候就要做决定**——他不知道选
 *    二年级意味着什么，凭什么选？
 * 2. **模态框是强制的**——不选就没法继续，把「品牌第一印象」变成
 *    「一张问卷」。
 * 3. **语言同理**——一个英文用户第一眼撞上中文弹窗，会直接走人。
 *
 * 所以现在改成：**顶栏、课程页顶栏、个人主页**三处各放一个随时可点的
 * 选择器。用户什么时候想清楚了什么时候改，不催。
 *
 * 下拉面板是 **100% 实心纯白**（``bg-white``）——绝不半透明，
 * 否则叠在浅灰画布上的文字会糊掉。
 */
export interface GradeSelectorProps {
  className?: string;
  /** 紧凑模式——用于顶栏。 */
  compact?: boolean;
  /** 附加类名（面板定位）。 */
  align?: "left" | "right";
  /**
   * 选中变化时的回调。
   *
   * 它**不取代**全局档案——选中的年级照样写进 localStorage，
   * 顶栏 / 课程页 / 个人主页三处共享同一份状态。这个回调只是让
   * 调用方能额外做点事（比如课程页据此切换展示的系列）。
   */
  onChange?: (grade: number) => void;
}

export default function GradeSelector({
  className,
  compact = false,
  align = "left",
  onChange,
}: GradeSelectorProps) {
  const { grade, setGrade, option } = useGrade();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /** 点击外部关闭。 */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** 展示文案。 */
  const label = option
    ? `${option.name}（${option.ageRange[0]}–${option.ageRange[1]}岁）`
    : "选择年级";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-white",
          "text-[var(--foreground)] transition-colors hover:border-[#1D4ED8]",
          compact ? "h-8 px-3 text-[12px]" : "h-10 px-4 text-[13px]",
        )}
      >
        <GraduationCap
          size={compact ? 13 : 14}
          strokeWidth={2}
          className="shrink-0 text-[#0B162C]"
        />
        <span className="font-medium">{label}</span>
        <ChevronDown
          size={13}
          strokeWidth={2.2}
          className={cn(
            "shrink-0 text-[var(--muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 w-[248px] overflow-hidden",
            "rounded-xl border border-[#CBD5E1] bg-white",
            "shadow-[0_20px_50px_-15px_rgba(11,22,44,0.18)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="border-b border-[#E5E7EB] px-3.5 py-2.5">
            <p className="text-[10.5px] font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
              当前年级
            </p>
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {GRADE_OPTIONS.map((item) => {
              const active = item.number === grade;
              return (
                <button
                  key={item.number}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setGrade(item.number);
                    onChange?.(item.number);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    active
                      ? "bg-[#0B162C] text-white"
                      : "text-[var(--foreground)] hover:bg-[#F8F7F4]",
                  )}
                >
                  <span
                    className={cn(
                      "w-6 shrink-0 text-[12px] font-semibold tabular-nums",
                      active ? "text-[#D8C49A]" : "text-[var(--muted-foreground)]",
                    )}
                  >
                    {item.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[10.5px]",
                        active ? "text-white/60" : "text-[var(--muted-foreground)]",
                      )}
                    >
                      {item.alias} · {item.ageRange[0]}–{item.ageRange[1]}岁
                    </span>
                  </span>
                  {active ? (
                    <Check size={13} strokeWidth={2.6} className="shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
