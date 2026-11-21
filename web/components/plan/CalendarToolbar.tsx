"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 日历工具条
 * ==========
 *
 * 计划页的四个缩放层级共用一根工具条：左边是**时间游标**（当前
 * 聚焦的年 / 月 / 日），右边是**层级切换**。
 *
 * 为什么切换器在右边
 * -----------------
 *
 * 层级是「视图偏好」，游标是「我在看哪儿」。把偏好放右边、位置放
 * 左边，符合从左往右的阅读顺序——先看内容，再调显示方式。
 */

export type CalendarScope = "year" | "month" | "day" | "slot";

export interface CalendarCursor {
  year: number;
  /** 1–12。 */
  month: number;
  /** 1–31。 */
  day: number;
}

export function CalendarToolbar({
  scope,
  cursor,
  onScopeChange,
  onCursorChange,
  onToday,
  className = "",
}: {
  scope: CalendarScope;
  cursor: CalendarCursor;
  onScopeChange: (scope: CalendarScope) => void;
  onCursorChange: (cursor: CalendarCursor) => void;
  onToday: () => void;
  className?: string;
}) {
  const scopes: Array<{ id: CalendarScope; label: string }> = [
    { id: "year", label: "年视图" },
    { id: "month", label: "月视图" },
    { id: "day", label: "日视图" },
    { id: "slot", label: "时刻表" },
  ];

  /** 层级切换时，粒度会变——游标要跟着收窄或展开。 */
  const step = (direction: -1 | 1) => {
    const next = { ...cursor };
    if (scope === "year") {
      next.year += direction;
    } else if (scope === "month") {
      next.month += direction;
      if (next.month > 12) {
        next.month = 1;
        next.year += 1;
      } else if (next.month < 1) {
        next.month = 12;
        next.year -= 1;
      }
    } else {
      // 日的进退交给 Date 处理——跨月跨年它自己会算。
      const date = new Date(next.year, next.month - 1, next.day + direction);
      next.year = date.getFullYear();
      next.month = date.getMonth() + 1;
      next.day = date.getDate();
    }
    onCursorChange(next);
  };

  const label =
    scope === "year"
      ? `${cursor.year} 年`
      : scope === "month"
        ? `${cursor.year} 年 ${cursor.month} 月`
        : `${cursor.year} 年 ${cursor.month} 月 ${cursor.day} 日`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3",
        className,
      )}
    >
      {/* 左：时间游标 */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="上一个"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft size={15} strokeWidth={1.9} />
        </button>
        <span className="min-w-[128px] text-center text-[14px] font-semibold tabular-nums">
          {label}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="下一个"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ChevronRight size={15} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="ml-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          今天
        </button>
      </div>

      {/* 右：层级切换 */}
      <div
        role="tablist"
        aria-label="日历层级"
        className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-0.5"
      >
        {scopes.map((item) => {
          const active = item.id === scope;
          const Icon =
            item.id === "slot"
              ? Clock
              : item.id === "day"
                ? CalendarDays
                : ListOrdered;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onScopeChange(item.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] transition-colors",
                active
                  ? "bg-[var(--card)] font-medium text-[var(--foreground)] shadow-[var(--shadow-card)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
            >
              <Icon size={11} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
