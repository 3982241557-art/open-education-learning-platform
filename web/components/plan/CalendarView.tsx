"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from "lucide-react";
import type { StudyPlan } from "@/lib/learning-api";
import { cn } from "@/lib/cn";
import type { CalendarCursor, CalendarScope } from "@/components/plan/CalendarToolbar";

/**
 * 日历视图
 * ========
 *
 * 四个层级各有一套渲染：
 *
 * - **年视图** —— 12 个月格子，每格列出落在这一年的计划；
 * - **月视图** —— 月历网格，每天一个格；
 * - **日视图** —— 24 小时时间轴，精细到时刻；
 * - **时刻表** —— 把所有有具体时刻的计划拉成一条时间线。
 *
 * 一个统一的约定
 * --------------
 *
 * 每条计划都有一个**日历定位**（``scope`` + ``start_at``）。层级不
 * 同，定位的精度也不同：
 *
 * - ``year``  → 落在 1 月 1 日，展示时用「年」筛；
 * - ``month`` → 落在当月 1 日；
 * - ``day``   → 落在那天 00:00；
 * - ``slot``  → 落在具体时刻。
 *
 * 所以「今天有什么」这个问题，在四个层级下都用同一套筛选逻辑回答
 * ——只是筛的字段不同。
 */

const MONTH_NAMES = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarView({
  scope,
  cursor,
  plans,
  onScopeChange,
  onCursorChange,
  onCreateAt,
  onSelectPlan,
}: {
  scope: CalendarScope;
  cursor: CalendarCursor;
  plans: StudyPlan[];
  onScopeChange: (scope: CalendarScope) => void;
  onCursorChange: (cursor: CalendarCursor) => void;
  onCreateAt: (anchor: { start_at: string; scope: CalendarScope }) => void;
  onSelectPlan: (plan: StudyPlan) => void;
}) {
  if (scope === "year") {
    return (
      <YearView
        cursor={cursor}
        plans={plans}
        onCursorChange={onCursorChange}
        onCreateAt={onCreateAt}
        onSelectPlan={onSelectPlan}
      />
    );
  }
  if (scope === "month") {
    return (
      <MonthView
        cursor={cursor}
        plans={plans}
        onCursorChange={onCursorChange}
        onCreateAt={onCreateAt}
        onSelectPlan={onSelectPlan}
      />
    );
  }
  if (scope === "day") {
    return (
      <DayView
        cursor={cursor}
        plans={plans}
        onCreateAt={onCreateAt}
        onSelectPlan={onSelectPlan}
      />
    );
  }
  return (
    <SlotTimeline
      cursor={cursor}
      plans={plans}
      onSelectPlan={onSelectPlan}
    />
  );
}

// ── 工具函数 ───────────────────────────────────────────────────────────

/** 从计划的日历定位里取出「落在哪一天」。 */
function planDay(plan: StudyPlan): { year: number; month: number; day: number } | null {
  const start = plan.start_at || plan.due || "";
  if (!start) return null;
  const match = start.match(/(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3] ?? 1),
  };
}

/** 计划落在哪一年。 */
function planYear(plan: StudyPlan): number | null {
  const day = planDay(plan);
  if (day) return day.year;
  const match = (plan.start_at || plan.due || "").match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

/** 计划有没有精确到时刻。 */
function planHour(plan: StudyPlan): number | null {
  const match = (plan.start_at || "").match(/T(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) : null;
}

/** 这个月的天数。 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 这个月 1 号是周几（0 = 周一）。 */
function firstWeekday(year: number, month: number): number {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

// ── 年视图 ─────────────────────────────────────────────────────────────

function YearView({
  cursor,
  plans,
  onCursorChange,
  onCreateAt,
  onSelectPlan,
}: {
  cursor: CalendarCursor;
  plans: StudyPlan[];
  onCursorChange: (cursor: CalendarCursor) => void;
  onCreateAt: (anchor: { start_at: string; scope: CalendarScope }) => void;
  onSelectPlan: (plan: StudyPlan) => void;
}) {
  const yearPlans = plans.filter((plan) => planYear(plan) === cursor.year);

  return (
    <div className="p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {MONTH_NAMES.map((name, index) => {
          const month = index + 1;
          const monthPlans = yearPlans.filter((plan) => {
            const day = planDay(plan);
            if (day) return day.month === month;
            // 没有更细定位的年度计划，在 1 月格子里统一展示。
            return plan.scope === "year";
          });
          const isCurrent =
            cursor.year === new Date().getFullYear() &&
            month === new Date().getMonth() + 1;

          return (
            <div
              key={month}
              className={cn(
                "flex min-h-[124px] flex-col rounded-xl border p-3 transition-colors",
                isCurrent
                  ? "border-[var(--primary)]/25 bg-[var(--muted)]/40"
                  : "border-[var(--border)]",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    onCursorChange({ ...cursor, month, day: 1 })
                  }
                  className={cn(
                    "text-[12.5px] font-medium transition-colors hover:text-[var(--primary)]",
                    isCurrent && "text-[var(--primary)]",
                  )}
                >
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onCreateAt({
                      start_at: `${cursor.year}-${String(month).padStart(2, "0")}-01`,
                      scope: "month",
                    })
                  }
                  aria-label={`在${name}新建计划`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--muted)] hover:text-[var(--foreground)] group-hover:opacity-100"
                >
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>

              <ul className="space-y-1">
                {monthPlans.length === 0 ? (
                  <li className="text-[10.5px] text-[var(--muted-foreground)]/60">
                    —
                  </li>
                ) : (
                  monthPlans.slice(0, 3).map((plan) => (
                    <li key={plan.id}>
                      <PlanChip plan={plan} onClick={() => onSelectPlan(plan)} />
                    </li>
                  ))
                )}
                {monthPlans.length > 3 && (
                  <li className="text-[10.5px] text-[var(--muted-foreground)]">
                    还有 {monthPlans.length - 3} 条…
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 月视图 ─────────────────────────────────────────────────────────────

/**
 * 月视图
 * ======
 *
 * 星期表头与 42 格日期矩阵共用**同一个** grid 容器——不是两个长得
 * 差不多的 grid，而是同一个。表头是这 49 个格子里的前 7 个。
 *
 * 为什么要这样
 * ------------
 *
 * 两个独立 grid 各自算列宽：容器的 padding、滚动条、gap 的舍入误差
 * 都会让两边的列宽**差那么一两个像素**。差一个像素，看起来就是
 * 「星期三下面不是 15 号」——这种错位在日历里格外刺眼，因为用户
 * 正是靠竖线对齐来判断「这一天是哪一天」的。
 *
 * 放进同一个 grid 后，列宽由浏览器一次算完，表头与日期格**不可能**
 * 不对齐。
 *
 * 补位日期
 * --------
 *
 * 上月末尾与下月开头的补位日期，必须与当月日期**同尺寸、同内边距**
 * 地待在圆角方框里——只是文字与边框的透明度低一些。它们不是「装饰
 * 文字」，而是日历结构的一部分；渲染成纯文字会让那几行的高度塌掉，
 * 于是整列都往上挪，所有星期都对不齐。
 */
function MonthView({
  cursor,
  plans,
  onCursorChange,
  onCreateAt,
  onSelectPlan,
}: {
  cursor: CalendarCursor;
  plans: StudyPlan[];
  onCursorChange: (cursor: CalendarCursor) => void;
  onCreateAt: (anchor: { start_at: string; scope: CalendarScope }) => void;
  onSelectPlan: (plan: StudyPlan) => void;
}) {
  const total = daysInMonth(cursor.year, cursor.month);
  const lead = firstWeekday(cursor.year, cursor.month);

  // 上月的尾巴 + 本月 + 下月的头，凑满 **42 格**（6 行 × 7 列）。
  //
  // 每一格都**自带**它的年 / 月 / 日——补位日期的年月必须写进格子里，
  // 不能靠「不是当月就往前推一个月」倒推：那样会把下月的补位格也算成
  // 上个月，点一下「下月 3 号」会跳到上个月去。
  interface Cell {
    year: number;
    month: number;
    day: number;
    inMonth: boolean;
  }

  const cells: Cell[] = [];
  const prevMonth = cursor.month === 1 ? 12 : cursor.month - 1;
  const prevYear = cursor.month === 1 ? cursor.year - 1 : cursor.year;
  const prevDays = daysInMonth(prevYear, prevMonth);

  // 上月末尾：从该月最后一天往前数 ``lead`` 天，**按时间正序**排。
  for (let i = lead - 1; i >= 0; i -= 1) {
    cells.push({
      year: prevYear,
      month: prevMonth,
      day: prevDays - i,
      inMonth: false,
    });
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ year: cursor.year, month: cursor.month, day, inMonth: true });
  }
  const nextMonth = cursor.month === 12 ? 1 : cursor.month + 1;
  const nextYear = cursor.month === 12 ? cursor.year + 1 : cursor.year;
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({
      year: nextYear,
      month: nextMonth,
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }
  // 极端情况下（上月尾巴 + 本月 31 天 = 43）裁掉最后几格。
  cells.length = Math.min(cells.length, 42);

  const today = new Date();

  return (
    <div className="p-5">
      {/*
        一个 grid，49 个孩子：7 个表头 + 42 个日期格。
        ``gridTemplateColumns`` 写死成 ``repeat(7, minmax(0, 1fr))``，
        gap 8px —— 表头与日期格共用同一套列宽定义。

        之所以不是「两个长得差不多的 grid」：两个独立 grid 各自算列宽，
        容器的 padding、滚动条、gap 的舍入误差会让两边**差一两个像素**。
        差一个像素，在日历里格外刺眼——用户正是靠竖线对齐来判断
        「这一天是哪一天」的。放进同一个 grid 后，列宽由浏览器一次算完，
        表头与日期格**不可能**不对齐。

        ``auto-rows`` 与 ``minmax(0, 1fr)`` 一起用，保证 7 列等宽、
        且补位格与当月格走同一套行高。
      */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridAutoRows: "minmax(72px, auto)",
          gap: "8px",
        }}
      >
        {WEEKDAY_NAMES.map((name) => (
          <div
            key={`head-${name}`}
            className="flex h-6 items-center justify-center text-[10.5px] font-medium text-[var(--muted-foreground)]"
          >
            {name}
          </div>
        ))}

        {cells.map((cell, index) => {
          const { year: cellYear, month: cellMonth, day: cellDay } = cell;
          const key = `${cellYear}-${String(cellMonth).padStart(2, "0")}-${String(cellDay).padStart(2, "0")}`;

          const dayPlans = plans.filter((plan) => {
            const day = planDay(plan);
            if (!day) return false;
            if (day.year !== cellYear || day.month !== cellMonth || day.day !== cellDay) {
              return false;
            }
            return true;
          });

          const isToday =
            cell.inMonth &&
            today.getFullYear() === cursor.year &&
            today.getMonth() + 1 === cursor.month &&
            today.getDate() === cellDay;

          return (
            <button
              key={`${key}-${index}`}
              type="button"
              onClick={() =>
                onCursorChange({
                  year: cellYear,
                  month: cellMonth,
                  day: cellDay,
                })
              }
              onDoubleClick={() =>
                onCreateAt({ start_at: key, scope: "day" })
              }
              title={`${key} · 双击新建当日计划`}
              className={cn(
                // 与补位日期**完全相同**的尺寸与内边距——
                // 差别只在透明度与文字颜色上，绝不改边框或 padding。
                "flex min-h-[72px] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                cell.inMonth
                  ? "border-[var(--border)] hover:border-[var(--foreground)]/25"
                  : // 补位日期：边框与文字只降透明度，**不改边框样式**，
                    // 否则这一格的宽度与当月格不同，列就歪了。
                    "border-[var(--border)]/35 opacity-55 hover:border-[var(--foreground)]/15 hover:opacity-80",
                isToday && "border-[var(--primary)]/40 bg-[var(--muted)]/50 opacity-100",
              )}
            >
              <span
                className={cn(
                  "text-[10.5px] tabular-nums",
                  isToday
                    ? "inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] font-medium text-[var(--primary-foreground)]"
                    : cell.inMonth
                      ? "text-[var(--muted-foreground)]"
                      : "text-[var(--muted-foreground)]/60",
                )}
              >
                {cellDay}
              </span>
              <ul className="space-y-0.5">
                {dayPlans.slice(0, 2).map((plan) => (
                  <li key={plan.id}>
                    <PlanChip
                      plan={plan}
                      compact
                      onClick={() => onSelectPlan(plan)}
                    />
                  </li>
                ))}
                {dayPlans.length > 2 && (
                  <li className="text-[9px] text-[var(--muted-foreground)]">
                    +{dayPlans.length - 2}
                  </li>
                )}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 日视图（24 小时时间轴）──────────────────────────────────────────────

function DayView({
  cursor,
  plans,
  onCreateAt,
  onSelectPlan,
}: {
  cursor: CalendarCursor;
  plans: StudyPlan[];
  onCreateAt: (anchor: { start_at: string; scope: CalendarScope }) => void;
  onSelectPlan: (plan: StudyPlan) => void;
}) {
  const dateKey = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(cursor.day).padStart(2, "0")}`;

  const dayPlans = plans.filter((plan) => {
    const day = planDay(plan);
    if (!day) return false;
    return (
      day.year === cursor.year &&
      day.month === cursor.month &&
      day.day === cursor.day
    );
  });

  // 没有时刻的计划（当天整体目标）单独挂在时间轴顶部。
  const dayLevel = dayPlans.filter((plan) => planHour(plan) === null);
  const timed = dayPlans.filter((plan) => planHour(plan) !== null);

  const currentHour = new Date().getHours();
  const isToday = new Date().toDateString() === new Date(cursor.year, cursor.month - 1, cursor.day).toDateString();

  return (
    <div className="p-5">
      {/* 当天的整体目标 */}
      {dayLevel.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            当日目标
          </p>
          <ul className="space-y-1">
            {dayLevel.map((plan) => (
              <li key={plan.id}>
                <PlanChip plan={plan} onClick={() => onSelectPlan(plan)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 24 小时时间轴 */}
      <div className="relative">
        {Array.from({ length: 24 }, (_, hour) => {
          const slotPlans = timed.filter((plan) => planHour(plan) === hour);
          const isNow = isToday && hour === currentHour;
          return (
            <div
              key={hour}
              className="group flex items-start gap-3 border-t border-[var(--border)] py-1.5"
            >
              <span
                className={cn(
                  "w-11 shrink-0 text-right text-[10.5px] tabular-nums",
                  isNow
                    ? "font-medium text-[var(--primary)]"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
              <div className="min-w-0 flex-1">
                {slotPlans.length > 0 ? (
                  <ul className="space-y-1">
                    {slotPlans.map((plan) => (
                      <li key={plan.id}>
                        <PlanChip plan={plan} onClick={() => onSelectPlan(plan)} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[10.5px] text-transparent transition-colors group-hover:text-[var(--muted-foreground)]/50">
                    双击新增
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  onCreateAt({
                    start_at: `${dateKey}T${String(hour).padStart(2, "0")}:00`,
                    scope: "slot",
                  })
                }
                aria-label={`在 ${hour}:00 新建计划`}
                className="invisible mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] group-hover:visible"
              >
                <Plus size={11} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 时刻表 ─────────────────────────────────────────────────────────────

function SlotTimeline({
  cursor,
  plans,
  onSelectPlan,
}: {
  cursor: CalendarCursor;
  plans: StudyPlan[];
  onSelectPlan: (plan: StudyPlan) => void;
}) {
  const timed = plans
    .filter((plan) => planHour(plan) !== null)
    .sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""));

  return (
    <div className="p-5">
      {timed.length === 0 ? (
        <div className="py-16 text-center">
          <Clock
            size={22}
            strokeWidth={1.3}
            className="mx-auto mb-2 text-[var(--muted-foreground)]/50"
          />
          <p className="text-[12.5px] text-[var(--muted-foreground)]">
            还没有精确到时刻的计划
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]/70">
            在「日视图」里把计划挂到某个时刻，它会出现在这里
          </p>
        </div>
      ) : (
        <ol className="relative space-y-2 border-l border-[var(--border)] pl-4">
          {timed.map((plan) => {
            const hour = planHour(plan);
            const start = (plan.start_at || "").slice(11, 16);
            const end = (plan.end_at || "").slice(11, 16);
            return (
              <li key={plan.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[21px] top-2 h-2 w-2 rounded-full bg-[var(--primary)]"
                />
                <button
                  type="button"
                  onClick={() => onSelectPlan(plan)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left transition-colors hover:border-[var(--foreground)]/25"
                >
                  <p className="flex items-center gap-1.5 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                    <Clock size={10} strokeWidth={1.8} />
                    {start}
                    {end ? ` – ${end}` : ""}
                    {plan.start_at?.slice(0, 10) !==
                    `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(cursor.day).padStart(2, "0")}` && (
                      <span className="ml-auto">
                        {plan.start_at?.slice(0, 10)}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12.5px] font-medium leading-snug">
                    {plan.title}
                  </p>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ── 计划小标签 ─────────────────────────────────────────────────────────

function PlanChip({
  plan,
  compact = false,
  onClick,
}: {
  plan: StudyPlan;
  compact?: boolean;
  onClick: () => void;
}) {
  const done = plan.total > 0 && plan.done >= plan.total;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={plan.title}
      className={cn(
        "block w-full truncate rounded px-1.5 py-0.5 text-left transition-colors",
        compact ? "text-[9.5px]" : "text-[11px]",
        done
          ? "bg-emerald-50 text-emerald-700 line-through dark:text-emerald-400"
          : "bg-[var(--primary)]/10 text-[var(--foreground)] hover:bg-[var(--primary)]/16",
      )}
    >
      {plan.title}
    </button>
  );
}
