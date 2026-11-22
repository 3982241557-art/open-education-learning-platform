"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  BookOpenCheck,
  GraduationCap,
  Loader2,
} from "lucide-react";
import {
  fetchK12Progress,
  type K12CourseProgress,
  type K12ProgressSummary,
} from "@/lib/k12-progress";
import { STAGE_NAMES } from "@/lib/k12-api";
import { cn } from "@/lib/cn";

/**
 * 学情中心 · K12 区块
 * ====================
 *
 * 按**年级 × 学科**展示 24 套年级同步系列的学习情况。
 *
 * 为什么单独一个区块
 * ------------------
 *
 * 中台资源与 K12 系列的**记账口径不同**：
 *
 * * 中台是「按资源」——一整个公开课算一个条目；
 * * K12 是「按课时」——177 讲里的第 3 讲。
 *
 * 混在一个列表里会让用户看不懂「41 门课，96%」是什么意思。
 * 分开之后，K12 区块说的是人话：**「四年级数学，42 / 177 讲」**。
 *
 * 数据
 * ----
 *
 * 全部来自 localStorage 的真实记录——静态模式下没有后端，
 * 汇总在 :mod:`lib/k12-progress` 里完成。
 */

/** 组件属性。 */
export interface K12SectionProps {
  className?: string;
}

export function K12Section({ className }: K12SectionProps) {
  const [summary, setSummary] = useState<K12ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await fetchK12Progress();
      if (!alive) return;
      setSummary(result);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 按年级分组。
   *
   * 用户的心智是「我四年级学得怎么样」——不是「我学的 24 门课里
   * 第 7 门叫什么」。
   */
  const byGrade = useMemo(() => {
    const map = new Map<number, K12CourseProgress[]>();
    for (const course of summary?.courses ?? []) {
      const list = map.get(course.grade) ?? [];
      list.push(course);
      map.set(course.grade, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [summary]);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 py-6 text-[12.5px] text-[var(--muted-foreground)]">
        <Loader2 size={13} className="animate-spin" />
        正在汇总 K12 学习情况…
      </p>
    );
  }

  const totals = summary?.totals;

  return (
    <section className={className}>
      {/* ── 区块头 ── */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <BookOpenCheck size={14} strokeWidth={2.1} className="text-[var(--primary)]" />
        <h2 className="text-[13.5px] font-semibold">K12 年级同步系列</h2>
        <span className="text-[11.5px] text-[var(--muted-foreground)]">
          {summary?.courses.length ?? 0} 套
        </span>
      </div>

      {/* ── 汇总数字 ──
       *
       * 六个数字回答用户最常问的六个问题：
       * 学了几个年级 / 上了多少讲 / 掌握度 / 测验正确率 / 笔记 / 证书。
       */}
      {totals ? (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <K12Stat
            icon={GraduationCap}
            label="在学年级"
            value={String(totals.gradesLearned)}
            suffix="/ 12"
          />
          <K12Stat
            icon={BookOpenCheck}
            label="完成课时"
            value={String(totals.lessonsDone)}
            suffix={`/ ${totals.lessonsTotal}`}
          />
          <K12Stat
            icon={Award}
            label="平均掌握度"
            value={`${Math.round(totals.averageMastery * 100)}`}
            suffix="%"
          />
          <K12Stat
            icon={Award}
            label="测验正确率"
            value={
              totals.quizAccuracy === null
                ? "—"
                : `${Math.round(totals.quizAccuracy * 100)}`
            }
            suffix={totals.quizAccuracy === null ? "" : "%"}
          />
          <K12Stat
            icon={BookOpenCheck}
            label="笔记条数"
            value={String(totals.notes)}
          />
          <K12Stat
            icon={Award}
            label="K12 证书"
            value={String(totals.certificates)}
            suffix=" 张"
          />
        </div>
      ) : null}

      {/* ── 按年级分组 ── */}
      <div className="space-y-3">
        {byGrade.map(([grade, courses]) => {
          const learned = courses.filter((item) => item.done > 0);
          const stage = courses[0]?.stage ?? "primary";
          const playable = stage === "primary";

          return (
            <div
              key={grade}
              className={cn(
                "border border-[var(--border)] bg-[var(--card)] p-3.5",
                playable ? "rounded-2xl" : "rounded-xl",
              )}
            >
              {/* 年级行。 */}
              <div className="mb-2.5 flex items-baseline gap-2">
                <h3 className="text-[12.5px] font-semibold text-[var(--foreground)]">
                  {grade} 年级
                </h3>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {STAGE_NAMES[stage]}
                </span>
                <span className="ml-auto text-[11px] tabular-nums text-[var(--muted-foreground)]">
                  {learned.length > 0
                    ? `${learned.length} / ${courses.length} 套在学`
                    : "尚未开始"}
                </span>
              </div>

              {/* 学科行。 */}
              <div className="grid gap-2 sm:grid-cols-2">
                {courses.map((course) => (
                  <K12CourseRow key={course.id} course={course} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 一个统计数字。 */
function K12Stat({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: typeof Award;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon size={11} strokeWidth={2} className="text-[var(--muted-foreground)]" />
        <span className="text-[10.5px] text-[var(--muted-foreground)]">
          {label}
        </span>
      </div>
      <p className="mt-1 text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--foreground)]">
        {value}
        {suffix ? (
          <span className="ml-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** 一套系列的进度行。 */
function K12CourseRow({ course }: { course: K12CourseProgress }) {
  const percent = Math.round(course.coverage * 100);

  return (
    <Link
      href={`/courses/${encodeURIComponent(course.id)}`}
      className="group block rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 transition-colors hover:border-[var(--primary)]/35"
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-[var(--foreground)]">
          {course.subject === "chinese" ? "语文" : "数学"}
        </span>
        <span
          className={cn(
            "rounded-full px-1.5 py-px text-[10px] font-medium",
            course.status === "已掌握"
              ? "bg-emerald-50 text-emerald-700"
              : course.status === "学习中"
                ? "bg-[var(--seek-bean-soft)] text-[var(--primary)]"
                : course.status === "薄弱需巩固"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]",
          )}
        >
          {course.status}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-[var(--muted-foreground)]">
          {course.done} / {course.total} 讲
        </span>
      </div>

      {/* 进度条。 */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 附加指标。 */}
      <div className="mt-1.5 flex items-center gap-2.5 text-[10.5px] tabular-nums text-[var(--muted-foreground)]">
        <span>{percent}%</span>
        {course.diagnosed > 0 ? (
          <span>· 已诊断 {course.diagnosed} 讲</span>
        ) : null}
        {course.quizAccuracy !== null ? (
          <span>· 测验 {Math.round(course.quizAccuracy * 100)}%</span>
        ) : null}
        {course.notes > 0 ? <span>· 笔记 {course.notes}</span> : null}
      </div>
    </Link>
  );
}
