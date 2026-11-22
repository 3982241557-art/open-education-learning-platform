"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleHelp,
  Flame,
  Loader2,
  MessageSquare,
  NotebookPen,
  PlayCircle,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  fetchProgress,
  type ChapterProgress,
  type CourseProgress,
  type ProgressSummary,
} from "@/lib/learning-api";
import { onLearningEvent, PROGRESS_UPDATED, TRACE_UPDATED } from "@/lib/learning-events";
import { aggregateLocalProgress } from "@/lib/local-progress";
import { fetchGlobalHub } from "@/lib/global-hub-api";
import { cn } from "@/lib/cn";
import { CertificateWall } from "@/components/progress/CertificateWall";
import { K12Section } from "@/components/learning/K12ProgressSection";

/**
 * 学情与进度中心
 * ==============
 *
 * 这里回答三个问题：
 *
 * 1. **进度** —— 每门课读到哪了？多久没碰了？
 * 2. **掌握度** —— 哪些章节扎实，哪些还得回头补？
 * 3. **计划联动** —— 绑定了计划的计划，目标与进度一并展示。
 *
 * 零状态
 * ------
 *
 * **一个都没碰过的课程也要出现**，显示 0 页 / 0% / 笔记 0 / 提问 0 /
 * 正确率「—」/ 待学习。把没开始的学习藏起来，比显示出来更让人误以为
 * 「一切都在掌控中」。
 *
 * 数据全部来自后端的真实磁盘状态——前端不持有任何预置数字。
 */
export default function ProgressCenterPage() {
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProgress("", titleMapRef.current);
      setCourses(data.courses);
      setSummary(data.summary);
    } catch (err) {
      // ── 兜底：直接读 localStorage ──
      //
      // ``fetchProgress`` 内部已经有降级分支（后端返回 HTML 或连不上时
      // 自动汇总本地数据）。这里再兜一层，是为了让**任何**异常都不
      // 变成一片空白页。
      //
      // ⚠️ 绝不能把错误信息里的 HTML 源码直接显示给用户——
      //    这里只显示一句人话，细节留在 console 里。
      console.error("[progress-center] 加载失败，改用本地汇总", err);
      const local = aggregateLocalProgress([], titleMapRef.current);
      setCourses(local.courses as unknown as CourseProgress[]);
      setSummary(local.summary as unknown as ProgressSummary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 课程标题映射。
   *
   * localStorage 的键名只有 id——显示时需要真实的课程名。
   * 从静态课程目录里取。
   */
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});

  /** 目录异步到达，用 ref 让 ``load`` 随时能拿到最新的一份。 */
  const titleMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    titleMapRef.current = titleMap;
  }, [titleMap]);

  useEffect(() => {
    void (async () => {
      try {
        const { hub } = await fetchGlobalHub();
        if (!hub) return;
        const map: Record<string, string> = {
          global_resource_hub: hub.title,
        };
        for (const category of hub.categories) {
          for (const resource of category.resources) {
            // 资源 → 所属学科（章节划分用）。
            map[`chapter:${resource.id}`] = category.title;
          }
        }
        setTitleMap(map);
      } catch {
        /* 目录读不到——用 id 兜底 */
      }
    })();
  }, []);

  /** 目录到达后重算一次——章节划分需要资源→学科的映射。 */
  useEffect(() => {
    if (Object.keys(titleMap).length === 0) return;
    void load();
  }, [titleMap, load]);

  /**
   * 别的模块改了进度（阅读器翻页、AI 记了笔记、测验提交了答案），
   * 这里立刻跟着变——不用手动刷新。
   */
  useEffect(() => {
    const refresh = () => void load();
    const offProgress = onLearningEvent(PROGRESS_UPDATED, refresh);
    const offTrace = onLearningEvent(TRACE_UPDATED, refresh);
    return () => {
      offProgress();
      offTrace();
    };
  }, [load]);

  // 按「最近学习」分组——正在学的排前面，冷落的排后面。
  const groups = useMemo(() => {
    const active = courses.filter(
      (item) => !item.status.includes("已掌握") && item.status !== "待学习",
    );
    const mastered = courses.filter((item) => item.status === "已掌握");
    const untouched = courses.filter((item) => item.status === "待学习");
    return { active, mastered, untouched };
  }, [courses]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1080px] px-6 py-7 lg:px-9">
        <header className="mb-6">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
            学情与进度中心
          </h1>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
            这里汇总你在每门课上的阅读进度、笔记与提问、测验正确率，
            并给出章节级的掌握度判断。带学习计划的课程会一并显示计划目标与进度。
          </p>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
            {error}
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-1.5 py-8 text-[12.5px] text-[var(--muted-foreground)]">
            <Loader2 size={13} className="animate-spin" />
            正在汇总学情…
          </p>
        ) : courses.length === 0 ? (
          <EmptyDashboard />
        ) : (
          <>
            {/* 汇总条 */}
            {summary && <SummaryStrip summary={summary} />}

            {/* ── 我的证书墙 ──
             *
             * 证书是**结果**，进度是**过程**。分开放，用户才不会把
             * 「还没拿到证书」误读成一种缺陷。
             */}
            <CertificateWall className="mb-7" />

            {/* ── K12 年级同步系列 ──
             *
             * 平台的主体是 K12 的 24 套年级系列——所以它们排在
             * 中台资源**前面**。而且这里显示的是**按年级 × 学科**
             * 组织的真实进度：完成了哪几讲、诊断掌握度、测验正确率。
             */}
            <K12Section className="mb-7" />

            {/* 在学 */}
            {groups.active.length > 0 && (
              <Section title="在学" count={groups.active.length}>
                <div className="grid gap-3 md:grid-cols-2">
                  {groups.active.map((course) => (
                    <CourseProgressCard key={course.course_id} course={course} />
                  ))}
                </div>
              </Section>
            )}

            {/* 已掌握 */}
            {groups.mastered.length > 0 && (
              <Section title="已掌握" count={groups.mastered.length}>
                <div className="grid gap-3 md:grid-cols-2">
                  {groups.mastered.map((course) => (
                    <CourseProgressCard key={course.course_id} course={course} />
                  ))}
                </div>
              </Section>
            )}

            {/* 待学习 */}
            {groups.untouched.length > 0 && (
              <Section title="待学习" count={groups.untouched.length}>
                <div className="grid gap-3 md:grid-cols-2">
                  {groups.untouched.map((course) => (
                    <CourseProgressCard key={course.course_id} course={course} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 顶部汇总数字。 */
function SummaryStrip({ summary }: { summary: ProgressSummary }) {
  const items = [
    {
      icon: BookOpen,
      label: "在学课程",
      value: String(summary.learned_count ?? 0),
      suffix: `/ ${summary.course_count ?? 0}`,
    },
    {
      icon: TrendingUp,
      label: "平均进度",
      value: `${Math.round((summary.average_coverage ?? 0) * 100)}`,
      suffix: "%",
    },
    {
      icon: NotebookPen,
      label: "累计笔记",
      value: String(summary.total_notes ?? 0),
      suffix: "条",
    },
    {
      icon: MessageSquare,
      label: "累计提问",
      value: String(summary.total_asks ?? 0),
      suffix: "轮",
    },
    {
      icon: Target,
      label: "绑定计划",
      value: String(summary.total_plans ?? 0),
      suffix: "个",
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-[10.5px] text-[var(--muted-foreground)]">
              <Icon size={11} strokeWidth={1.8} />
              {item.label}
            </p>
            <p className="mt-1 text-[19px] font-semibold leading-none tracking-[-0.02em]">
              {item.value}
              <span className="ml-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">
                {item.suffix}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** 一个分组。 */
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 text-[13.5px] font-semibold">
        {title}
        <span className="ml-2 font-normal text-[var(--muted-foreground)]">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

/** 掌握度状态标签。 */
const STATUS_STYLES: Record<string, string> = {
  已掌握: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  学习中: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  薄弱需巩固: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  待学习: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

function StatusTag({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium",
        STATUS_STYLES[status] ?? STATUS_STYLES["待学习"],
      )}
    >
      {status}
    </span>
  );
}

/** 一门课的进度卡片。 */
function CourseProgressCard({ course }: { course: CourseProgress }) {
  const percent = Math.round((course.coverage ?? 0) * 100);
  const lastActive = course.last_active_at
    ? new Date(course.last_active_at * 1000)
    : null;

  /**
   * 「继续学习」的落点。
   *
   * 带上 ``last_page_id``——课程页会用它精准跳到**上次读到的那一节**，
   * 而不是每次都回到第一章第一节。
   */
  /**
   * 「继续学习」的落点。
   *
   * 中台（公开课）**深链到最近看过的那一讲**——而不是把用户丢回
   * 目录让他自己找。用户上次看到第 3 讲的中途，回来就该接着看
   * 第 3 讲。
   *
   * 一门都没看过时才回到目录。
   */
  const lastWatchedId = (course.resources ?? []).find(
    (item) => item.opened || item.seen,
  )?.resource_id;

  const resumeHref = course.course_id === "global_resource_hub"
    ? lastWatchedId
      ? `/hub?resource=${encodeURIComponent(lastWatchedId)}`
      : "/hub"
    : course.last_page_id
      ? `/learning/courses/${encodeURIComponent(course.course_id)}?page=${encodeURIComponent(course.last_page_id)}`
      : `/learning/courses/${encodeURIComponent(course.course_id)}`;

  /** 「调整计划」——直接打开绑定该课程的计划编辑弹窗。 */
  const planHref = `/plan?course=${encodeURIComponent(course.course_id)}`;

  /**
   * 实际看过的公开课列表。
   *
   * 后端已经按「最近观看时间」倒序排好了——这里只取前几条显示，
   * 免得卡片被几十行撑爆。
   */
  const watchedResources = (course.resources ?? []).filter(
    (item) => item.opened || item.seen,
  );

  return (
    <article className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--foreground]/20">
      {/* 标题行 */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={resumeHref}
            className="text-[14px] font-semibold leading-snug transition-colors hover:text-[var(--primary)]"
          >
            {course.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusTag status={course.status} />
            {course.difficulty && (
              <span className="text-[10.5px] text-[var(--muted-foreground)]">
                {course.difficulty}
              </span>
            )}
            {course.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--muted)] px-1.5 py-px text-[10px] text-[var(--muted-foreground)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 进度条 */}
      <div className="mb-3">
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="text-[var(--muted-foreground)]">
            {course.is_hub ? "观看进度" : "阅读进度"}
          </span>
          <span className="font-medium tabular-nums">
            {course.visited_pages} / {course.total_pages}{" "}
            {course.is_hub ? "讲" : "页"}
            <span className="ml-1 text-[var(--muted-foreground)]">
              ({percent}%)
            </span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              course.status === "已掌握"
                ? "bg-emerald-500"
                : course.status === "薄弱需巩固"
                  ? "bg-amber-500"
                  : "bg-[var(--primary)]",
            )}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      </div>

      {/* 统计 */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <Metric
          icon={<NotebookPen size={10} strokeWidth={1.8} />}
          label="笔记"
          value={course.note_count}
        />
        <Metric
          icon={<MessageSquare size={10} strokeWidth={1.8} />}
          label="提问"
          value={course.ask_count}
        />
        <Metric
          icon={<CircleHelp size={10} strokeWidth={1.8} />}
          label="正确率"
          value={
            course.quiz_accuracy === null
              ? "—"
              : `${Math.round(course.quiz_accuracy * 100)}%`
          }
        />
      </div>

      {/* 学科分布（公开课）──
       *
       * 中台有 121 门课——一个总数看不出「哪一科学得最多」。
       * 这里按学科拆开，让用户知道自己在 CS / 哲学 / 经济 / 理科
       * 上分别推进了多少。
       */}
      {course.is_hub && course.chapters.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            学科进度
          </p>
          <ul className="space-y-1">
            {course.chapters.map((chapter) => {
              const chapterPercent = Math.round(chapter.coverage * 100);
              return (
                <li key={chapter.title} className="flex items-center gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-[var(--muted-foreground)]">
                    {chapter.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted-foreground)]">
                    {chapter.visited_pages}/{chapter.total_pages}
                  </span>
                  <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--muted)]">
                    <span
                      className="block h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${Math.min(100, chapterPercent)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 已看过的具体课程（公开课）──
       *
       * 学情中心的价值不只是「你学了多少」，还有「**你学过什么**」。
       *
       * 这一块列出用户**实际打开过**的每一讲公开课——带观看时长、
       * 进度和直达链接。点一下就回到那一讲的播放位置。
       *
       * 没有它的话，121 门课的目录对用户来说只是一个抽象的数字；
       * 有了它，用户能想起来「哦，那门 MIT 线性代数我看到第 3 讲
       * 就去吃饭了」。
       */}
      {course.is_hub && watchedResources.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            看过的课
          </p>
          <ul className="space-y-1">
            {watchedResources.slice(0, 6).map((item) => {
              const duration = item.duration ?? 0;
              const position = item.last_position ?? 0;
              const itemPercent =
                duration > 0
                  ? Math.min(100, Math.round((position / duration) * 100))
                  : 0;
              return (
                <li key={item.resource_id}>
                  <Link
                    href={`/hub?resource=${encodeURIComponent(item.resource_id)}`}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-[var(--muted)]"
                    title={`继续观看：${item.title}`}
                  >
                    <PlayCircle
                      size={11}
                      strokeWidth={2}
                      className="shrink-0 text-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.dwell_seconds > 0 ? (
                      <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted-foreground)]">
                        {formatDwell(item.dwell_seconds)}
                      </span>
                    ) : null}
                    <span className="w-8 shrink-0 text-right tabular-nums text-[10px] text-[var(--muted-foreground)]">
                      {itemPercent}%
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {watchedResources.length > 6 ? (
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              还有 {watchedResources.length - 6} 讲…
            </p>
          ) : null}
        </div>
      )}

      {/* 章节掌握度 */}
      {!course.is_hub && course.chapters.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            章节掌握度
          </p>
          <ul className="space-y-1">
            {course.chapters.slice(0, 3).map((chapter) => (
              <ChapterRow key={chapter.title} chapter={chapter} />
            ))}
            {course.chapters.length > 3 && (
              <li className="text-[10.5px] text-[var(--muted-foreground)]">
                还有 {course.chapters.length - 3} 个章节…
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 关联计划 */}
      {course.plans.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {course.plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/35 px-2.5 py-2"
            >
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium leading-snug">
                <CalendarClock
                  size={10}
                  strokeWidth={1.8}
                  className="shrink-0 text-[var(--muted-foreground)]"
                />
                <span className="min-w-0 flex-1 truncate">{plan.title}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--muted-foreground)]">
                {plan.due && <span>目标：{plan.due}</span>}
                {plan.total > 0 && (
                  <span>
                    {plan.done} / {plan.total} 步
                  </span>
                )}
                {plan.completed && <span className="text-emerald-600">已完成</span>}
              </div>
              {plan.total > 0 && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)]"
                    style={{
                      width: `${Math.min(100, (plan.done / plan.total) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 底部：最近学习 + 跳转 */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
        <span className="flex min-w-0 items-center gap-1 text-[10.5px] text-[var(--muted-foreground)]">
          <Flame size={10} strokeWidth={1.8} className="shrink-0" />
          {lastActive ? `最近学习：${formatRelative(lastActive)}` : "尚未开始"}
          {course.last_page_title && (
            <span className="truncate">· {course.last_page_title}</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={planHref}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-[10.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            调整计划
          </Link>
          <Link
            href={resumeHref}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-2 py-1 text-[10.5px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            继续学习
            <ArrowRight size={9} strokeWidth={2.4} />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** 一个统计数字。 */
function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-[var(--muted)]/45 px-1.5 py-1.5">
      <p className="flex items-center justify-center gap-1 text-[9.5px] text-[var(--muted-foreground)]">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-center text-[12.5px] font-medium tabular-nums">
        {value}
      </p>
    </div>
  );
}

/** 一行章节掌握度。 */
function ChapterRow({ chapter }: { chapter: ChapterProgress }) {
  const percent = Math.round(chapter.coverage * 100);
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span className="min-w-0 flex-1 truncate text-[var(--muted-foreground)]">
        {chapter.title}
      </span>
      <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted-foreground)]">
        {chapter.visited_pages}/{chapter.total_pages}
      </span>
      <StatusTag status={chapter.status} />
      <span className="w-8 shrink-0 text-right tabular-nums text-[10px] text-[var(--muted-foreground)]">
        {percent}%
      </span>
    </li>
  );
}

/** 空状态。 */
function EmptyDashboard() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
      <TrendingUp
        size={24}
        strokeWidth={1.3}
        className="mx-auto mb-2.5 text-[var(--muted-foreground)]/50"
      />
      <p className="text-[13px] font-medium">还没有可统计的学习数据</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-[var(--muted-foreground)]">
        去一门课里读几页、划几条线或向 AI 提问，这里就会开始汇总你的进度与掌握度。
      </p>
      <Link
        href="/learning"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
      >
        去课程列表
        <ArrowRight size={11} strokeWidth={2.2} />
      </Link>
    </div>
  );
}

/**
 * 观看时长——「12 分钟」比「720 秒」好读。
 *
 * 超过一小时用「x 小时 y 分」，再长就只显示小时——学情卡片上不
 * 需要分钟级的精度。
 */
function formatDwell(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0
    ? `${hours} 小时 ${restMinutes} 分`
    : `${hours} 小时`;
}

/** 相对时间——「3 天前」比「2026-11-01 14:22」更好读。 */
function formatRelative(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}
