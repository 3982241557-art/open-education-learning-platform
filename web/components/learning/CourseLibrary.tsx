"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Globe, GraduationCap, Plus, Search } from "lucide-react";
import {
  LearningShell,
  LearningEmptyState,
  LearningErrorState,
  LearningSkeleton,
} from "@/components/learning/LearningShell";
import { listCourses, type Course } from "@/lib/courses-api";
import { isStaticRuntime } from "@/shared/api/client";
import { useCourseMastery } from "@/lib/use-course-mastery";
import { PILLARS, prerequisiteOf } from "@/lib/taxonomy";
import {
  Atom,
  Binary,
  BookOpen,
  Landmark,
  ScrollText,
  subjectIcon,
} from "@/lib/subject-icons";

/** 支柱 → 矢量图标。 */
const PILLAR_ICONS: Record<string, typeof BookOpen> = {
  humanities: ScrollText,
  science: Atom,
  technology: Binary,
  society: Landmark,
};

/**
 * 课程库。
 *
 * 分类栏是**四大通识支柱**（人文经典 / 科学哲学 / 逻辑与技术 /
 * 社会与文明），而不是从课程 metadata 自动聚合出来的 category——
 * 自动聚合正是分类混乱的根因。
 *
 * 难度分级换成了**前置知识要求**：不说「入门 / 进阶 / 高阶」，而是
 * 告诉用户「你需要先会什么」，让他自己判断要不要挑战。
 */
export function CourseLibrary() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pillar, setPillar] = useState<string>("all");
  const [prerequisite, setPrerequisite] = useState<string>("");
  /**
   * 是否处于**静态模式**。
   *
   * 静态模式下课程库是只读的——「新建课程」要写数据库，做不到。
   * 所以那个入口整个不渲染，而不是留一个点了就报错的按钮。
   */
  const [staticMode, setStaticMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCourses(await listCourses());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void isStaticRuntime().then(setStaticMode);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses.filter((course) => {
      if (pillar !== "all" && course.pillar !== pillar) return false;
      if (prerequisite && course.prerequisite !== prerequisite) return false;
      if (!needle) return true;
      return (
        course.title.toLowerCase().includes(needle) ||
        course.description.toLowerCase().includes(needle) ||
        course.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [courses, pillar, prerequisite, query]);

  /** 每个支柱下有多少门课——让用户知道点进去会不会空。 */
  const pillarCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const course of courses) {
      counts.set(course.pillar, (counts.get(course.pillar) ?? 0) + 1);
    }
    return counts;
  }, [courses]);

  return (
    <LearningShell
      title="课程"
      subtitle="按通识的四大支柱选课。先看自己的知识储备，再决定从哪一本开始。"
      back={false}
      action={
        <div className="flex items-center gap-2">
          {/* 全网公开课目录——平台的视频调度控制台入口。 */}
          <Link
            href="/hub"
            className="seek-key seek-bean-key inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px]"
          >
            <Globe size={13} strokeWidth={2.2} />
            公开课目录
          </Link>
          {!staticMode && (
            <Link
              href="/learning/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              <Plus size={13} strokeWidth={2} />
              新建课程
            </Link>
          )}
        </div>
      }
    >
      {error && <LearningErrorState message={error} onRetry={() => void load()} />}

      {/* 检索 */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索课程…"
            aria-label="搜索课程"
            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-[12.5px] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--foreground)]/25"
          />
        </div>

        {/* 前置知识要求：代替难度分级 */}
        <select
          value={prerequisite}
          onChange={(event) => setPrerequisite(event.target.value)}
          aria-label="按前置知识要求筛选"
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 text-[12px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--foreground)]/25"
        >
          <option value="">全部前置要求</option>
          {["none", "chinese", "math", "code", "science"].map((id) => (
            <option key={id} value={id}>
              {prerequisiteOf(id).label}
            </option>
          ))}
        </select>
      </div>

      {/* 四大支柱 */}
      <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <PillarCard
          id="all"
          name="全部"
          blurb="所有支柱的课程。"
          count={courses.length}
          active={pillar === "all"}
          onClick={() => setPillar("all")}
        />
        {PILLARS.map((item) => (
          <PillarCard
            key={item.id}
            id={item.id}
            name={item.name}
            blurb={item.blurb}
            count={pillarCounts.get(item.id) ?? 0}
            active={pillar === item.id}
            onClick={() => setPillar(pillar === item.id ? "all" : item.id)}
          />
        ))}
      </div>

      {loading ? (
        <LearningSkeleton count={4} />
      ) : courses.length === 0 ? (
        <LearningEmptyState
          title="还没有课程"
          description="新建一门课程来开始，或把符合数据结构的课程文件放进 courses 目录，刷新后即可看到。"
          icon={<GraduationCap size={20} />}
          action={
            <Link
              href="/learning/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              <Plus size={13} strokeWidth={2} />
              新建课程
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <LearningEmptyState
          title="没有匹配的课程"
          description="换个关键词或支柱试试。"
          icon={<Search size={20} />}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <li key={course.id}>
              <CourseTile course={course} />
            </li>
          ))}
        </ul>
      )}
    </LearningShell>
  );
}

/** 支柱卡片的矢量图标。 */
function PillarIcon({ id, active }: { id: string; active: boolean }) {
  const Icon = PILLAR_ICONS[id] ?? BookOpen;
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
        active
          ? "bg-[var(--background)]/15 text-[var(--background)]"
          : "bg-[var(--muted)] text-[var(--muted-foreground)]"
      }`}
    >
      <Icon size={13} strokeWidth={1.9} />
    </span>
  );
}

/** 一张支柱卡片。 */
function PillarCard({
  id,
  name,
  blurb,
  count,
  active,
  onClick,
}: {
  id: string;
  name: string;
  blurb: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl p-3 text-left transition-all ${
        active
          ? "bg-[var(--foreground)] text-[var(--background)] shadow-sm"
          : "bg-[var(--card)] hover:bg-[var(--muted)]/70"
      }`}
    >
      <div className="flex items-center gap-2">
        {id !== "all" ? (
          <PillarIcon id={id} active={active} />
        ) : null}
        <span className="text-[13px] font-normal">{name}</span>
        <span
          className={`ml-auto text-[11px] tabular-nums ${
            active ? "opacity-70" : "text-[var(--muted-foreground)]"
          }`}
        >
          {count}
        </span>
      </div>
      <p
        className={`mt-1 text-[11px] leading-relaxed ${
          active ? "opacity-75" : "text-[var(--muted-foreground)]"
        }`}
      >
        {blurb}
      </p>
    </button>
  );
}

/**
 * 课程卡片上的掌握度细条。
 */
function CourseMasteryStrip({ courseId }: { courseId: string }) {
  const { mastery, progress, nodeCount } = useCourseMastery(courseId);

  // 这门课还没有技能节点——不显示任何东西。
  //
  // 显示一条 0% 的灰条会让用户以为「我一点没学」，但真相是
  // 「这门课没有可测量的节点」。空 ≠ 零。
  if (nodeCount === 0) return null;

  const masteredPct = Math.min(100, Math.round(mastery * 100));
  const startedPct = Math.min(100, Math.round(progress * 100));

  return (
    <div className="mt-2.5">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        {/* 已开始但未达标——琥珀色 */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
          style={{ width: `${startedPct}%` }}
        />
        {/* 已达标——翠绿，压在上面 */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
          style={{ width: `${masteredPct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-[var(--muted-foreground)]">
        掌握 {masteredPct}% · 已学 {startedPct}%
      </p>
    </div>
  );
}

/** 一张课程卡片。 */
function CourseTile({ course }: { course: Course }) {
  const prerequisite = prerequisiteOf(course.prerequisite);

  return (
    <Link
      href={`/learning/courses/${encodeURIComponent(course.id)}`}
      className="group flex h-full flex-col rounded-xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
    >
      <div className="mb-2.5 flex items-start gap-2.5">
        {/*
          学科图标——按课程的标签判定学科（经济学 / 哲学 / 计算机…），
          标签判不出来时回落到支柱图标。

          之前这里放的是一个汉字方块（「文」「理」「术」「世」），
          看起来像后台表格，而且完全传达不了这门课讲的是什么。
        */}
        {(() => {
          const Icon = subjectIcon(course.tags, course.pillar);
          return (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)]">
              <Icon size={17} strokeWidth={1.7} />
            </span>
          );
        })()}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-normal">{course.title}</h3>
          {course.description && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
              {course.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11.5px] text-[var(--muted-foreground)]">
        <span>{course.chapter_count} 章</span>
        <span>{course.page_count} 节</span>
        <span className="tabular-nums">{course.total_minutes} 分钟</span>
      </div>

      {/* ── 掌握度分段条 ──
       *
       * 卡片空间紧，所以用**简版**（两段细条 + 一行数字），不是
       * 完整的三段图例。完整版在播放页用。
       *
       * 数据来自后端的真实学习痕迹——没学过就是 0%，不美化。
       */}
      <CourseMasteryStrip courseId={course.id} />

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {/* 支柱 */}
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10.5px] text-[var(--muted-foreground)]">
          {course.pillar_name}
        </span>
        {/* 前置知识要求——替代难度分级 */}
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10.5px] text-[var(--muted-foreground)]">
          {prerequisite.label}
        </span>
        {course.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="rounded-full px-2 py-0.5 text-[10.5px] text-[var(--muted-foreground)]/70"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
