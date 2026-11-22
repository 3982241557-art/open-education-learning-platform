"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { fetchK12Index } from "@/lib/k12-client";
import {
  STAGE_NAMES,
  isPlayfulStage,
  type K12Index,
  type K12IndexEntry,
  type K12Subject,
} from "@/lib/k12-api";
import { cn } from "@/lib/cn";

/**
 * K12 课程大厅
 * ============
 *
 * 平台的**首页级**选课入口——按「学段 × 年级 × 年龄」组织。
 *
 * 极简顶栏
 * --------
 *
 * 顶部只有三样东西：
 *
 * 1. **学段 / 年级（含年龄）快速切换栏**；
 * 2. **语文 / 数学学科切换**；
 * 3. **搜索框**。
 *
 * ⚠️ 原来的整块介绍文案（「这里收着世界各地上百讲顶尖公开课……」）
 *    已经**整体删除**——那是平台级营销文案，不属于用户此刻的决策。
 *    平台的介绍应该放在「关于」页，而不是压在每一门课的上面。
 *
 * 卡片布局
 * --------
 *
 * 每张卡只展示**决策所需的五项**：课程名、教材版本、册次、年龄、
 * 课时数。其余信息（进度、状态）在点进去之后的第一层看。
 */
export default function K12HallPage() {
  const [index, setIndex] = useState<K12Index | null>(null);
  const [loading, setLoading] = useState(true);

  /** 当前选中的年级（``0`` = 全部年级）。 */
  const [grade, setGrade] = useState<number>(0);
  /** 当前选中的学科（``"all"`` = 全部）。 */
  const [subject, setSubject] = useState<K12Subject | "all">("all");
  /** 搜索词。 */
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchK12Index();
    setIndex(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 过滤后的系列列表。
   *
   * 三道过滤：年级 → 学科 → 搜索。**顺序固定**——用户的心智是
   * 「先定位到年级，再选学科，最后搜关键词」。
   */
  const series = useMemo(() => {
    const all = index?.series ?? [];
    const keyword = query.trim().toLowerCase();

    return all.filter((entry) => {
      if (grade > 0 && entry.grade !== grade) return false;
      if (subject !== "all" && entry.subject !== subject) return false;
      if (!keyword) return true;
      return (
        entry.title.toLowerCase().includes(keyword) ||
        entry.shortTitle.toLowerCase().includes(keyword) ||
        entry.edition.toLowerCase().includes(keyword) ||
        entry.author.toLowerCase().includes(keyword)
      );
    });
  }, [index, grade, subject, query]);

  /** 按年级分组的系列——用于「按单元浏览」的分组标题。 */
  const grouped = useMemo(() => {
    const map = new Map<number, K12IndexEntry[]>();
    for (const entry of series) {
      const list = map.get(entry.grade) ?? [];
      list.push(entry);
      map.set(entry.grade, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [series]);

  /**
   * 年级分组标题——「小学四年级」。
   *
   * ⚠️ 不能用 ``replace(/[语文数学]$/, "")``——那会把「小学一年级语」
   *    的「文」去掉、留下「语」。学科名是两个字，得**整个**去掉。
   */
  const gradeHeading = useCallback((entry: K12IndexEntry | undefined) => {
    if (!entry) return "";
    const subjectName = entry.subject === "chinese" ? "语文" : "数学";
    return entry.shortTitle.endsWith(subjectName)
      ? entry.shortTitle.slice(0, -subjectName.length)
      : entry.shortTitle;
  }, []);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          正在载入 K12 课程…
        </p>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
        <p className="text-[14px] font-medium text-[var(--foreground)]">
          课程目录暂时载入失败
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* ── 极简顶栏 ── */}
      <header className="shrink-0 border-b border-[var(--border)] bg-white px-4 py-2.5">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-2.5">
          {/* 第一行：标题 + 搜索 + 学科切换。 */}
          <div className="flex items-center gap-3">
            <GraduationCap
              size={17}
              strokeWidth={2.2}
              className="shrink-0 text-[var(--primary)]"
            />
            <h1 className="shrink-0 text-[14.5px] font-bold tracking-[-0.01em] text-[var(--foreground)]">
              {index.title}
            </h1>

            <span className="shrink-0 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]">
              {index.summary.seriesCount} 套 · {index.summary.episodeCount} 课时
            </span>

            <div className="flex-1" />

            {/* 搜索框。 */}
            <label className="relative flex h-8 w-[220px] shrink-0 items-center">
              <Search
                size={13}
                strokeWidth={2.2}
                className="pointer-events-none absolute left-2.5 text-[var(--muted-foreground)]"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜课程 / 教材 / 老师"
                className="h-full w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-8 pr-7 text-[12.5px] text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]/40"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="清空搜索"
                  className="absolute right-1.5 rounded p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                  <X size={12} strokeWidth={2.4} />
                </button>
              ) : null}
            </label>

            {/* 学科切换。 */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-[var(--muted)] p-0.5">
              {(
                [
                  { id: "all", label: "全部" },
                  { id: "chinese", label: "语文" },
                  { id: "math", label: "数学" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSubject(item.id)}
                  className={cn(
                    "rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                    subject === item.id
                      ? "bg-white text-[var(--primary)] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 第二行：学段 / 年级（含年龄）快速切换栏。 */}
          <GradeSwitcher
            grades={index.grades}
            active={grade}
            onChange={setGrade}
          />
        </div>
      </header>

      {/* ── 主体 ── */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1120px] px-4 py-5">
          {series.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-[13.5px] font-medium text-[var(--foreground)]">
                没有符合条件的课程
              </p>
              <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                换个年级或学科试试。
              </p>
            </div>
          ) : (
            <div className="space-y-7">
              {grouped.map(([gradeNumber, entries]) => (
                <section key={gradeNumber}>
                  {/* 分组标题——一个年级一栏。 */}
                  <div className="mb-2.5 flex items-baseline gap-2">
                    <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
                      {gradeHeading(entries[0])}
                    </h2>
                    <span className="text-[11.5px] text-[var(--muted-foreground)]">
                      {entries[0]?.ageRange[0]}–{entries[0]?.ageRange[1]} 岁 ·{" "}
                      {entries[0]
                        ? STAGE_NAMES[entries[0].stage as keyof typeof STAGE_NAMES]
                        : ""}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {entries.map((entry) => (
                      <SeriesCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** 学段 / 年级（含年龄）快速切换栏。 */
function GradeSwitcher({
  grades,
  active,
  onChange,
}: {
  grades: K12Index["grades"];
  active: number;
  onChange: (grade: number) => void;
}) {
  /** 按学段分组。 */
  const stages = useMemo(() => {
    const map = new Map<string, K12Index["grades"]>();
    for (const grade of grades) {
      const list = map.get(grade.stage) ?? [];
      list.push(grade);
      map.set(grade.stage, list);
    }
    return [...map.entries()];
  }, [grades]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <button
        type="button"
        onClick={() => onChange(0)}
        className={cn(
          "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
          active === 0
            ? "bg-[var(--primary)] text-white"
            : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
        )}
      >
        全部年级
      </button>

      {stages.map(([stage, list]) => (
        <div key={stage} className="flex items-center gap-1">
          <span className="text-[11px] font-medium tracking-[0.06em] text-[var(--muted-foreground)]">
            {STAGE_NAMES[stage as keyof typeof STAGE_NAMES]}
          </span>
          {list.map((grade) => (
            <button
              key={grade.number}
              type="button"
              onClick={() => onChange(grade.number)}
              title={`${grade.name} · ${grade.ageRange[0]}–${grade.ageRange[1]}岁`}
              className={cn(
                "rounded-full px-2 py-1 text-[11.5px] font-medium tabular-nums transition-colors",
                active === grade.number
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
              )}
            >
              {grade.name}
              <span className="ml-1 opacity-60">
                {grade.ageRange[0]}–{grade.ageRange[1]}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 一套系列的卡片。 */
function SeriesCard({ entry }: { entry: K12IndexEntry }) {
  const playful = isPlayfulStage(entry.stage);

  return (
    <Link
      href={`/courses/${encodeURIComponent(entry.id)}`}
      className={cn(
        "group flex flex-col rounded-xl border border-[var(--border)] bg-white p-4 transition-all",
        "hover:border-[var(--primary)]/35 hover:shadow-[0_4px_16px_-6px_rgba(15,23,42,0.14)]",
        // 小学部的卡片**更圆润**——跟它的动效语言一致。
        playful && "rounded-2xl",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-[var(--foreground)]">
          {entry.title}
        </h3>
        <BookOpen
          size={14}
          strokeWidth={2}
          className={cn(
            "mt-0.5 shrink-0 transition-colors",
            playful
              ? "text-[var(--primary)]/50 group-hover:text-[var(--primary)]"
              : "text-[var(--muted-foreground)]/50 group-hover:text-[var(--primary)]",
          )}
        />
      </div>

      <p className="mt-1.5 text-[11.5px] text-[var(--muted-foreground)]">
        {entry.edition} · {entry.volumes.join(" / ")}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-3">
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--muted-foreground)]">
          {entry.ageRange[0]}–{entry.ageRange[1]} 岁
        </span>
        <span className="rounded-full bg-[var(--seek-bean-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--primary)]">
          {entry.episodeCount} 课时
        </span>
        {entry.author ? (
          <span className="truncate text-[10.5px] text-[var(--muted-foreground)]">
            {entry.author}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
