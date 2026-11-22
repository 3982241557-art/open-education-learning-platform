"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
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
import { useGrade } from "@/context/GradeContext";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/cn";

/**
 * K12 课程大厅
 * ============
 *
 * 平台的**首页级**选课入口——按「学段 × 年级 × 年龄」组织。
 *
 * 顶栏大减负
 * ----------
 *
 * 旧版顶部挤着 **12 个年级**的文字排布，占满两行——用户还没看到
 * 任何课程，视野就被控件填满了。
 *
 * 现在只有**一行**：
 *
 * .. code-block:: text
 *
 *    [当前年级：二年级 (7–8岁) ▾]  [全部|语文|数学]  [搜索框]
 *
 * 年级切换收进**下拉胶囊**里，下拉中保留「查看全部年级」选项。
 * 默认直接聚焦用户所选年级的语文与数学课程。
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
  const { grade, setGrade, option: gradeMeta } = useGrade();
  const { tk } = useLocale();

  /** 当前选中的年级（``0`` = 全部年级）。 */
  const [activeGrade, setActiveGrade] = useState<number>(0);
  /** 当前选中的学科（``"all"`` = 全部）。 */
  const [subject, setSubject] = useState<K12Subject | "all">("all");
  /** 搜索词。 */
  const [query, setQuery] = useState("");
  /** 年级下拉是否展开。 */
  const [gradeOpen, setGradeOpen] = useState(false);

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
   * 用户选了年级之后，课程大厅**直接聚焦**那个年级。
   *
   * ⚠️ 但如果用户**手动**在页面上切过年级，就不再跟着档案走——
   *    否则他在页面上点「三年级」，下次进来又被弹回「二年级」。
   */
  const [manuallySwitched, setManuallySwitched] = useState(false);

  useEffect(() => {
    if (manuallySwitched) return;
    if (grade > 0) setActiveGrade(grade);
  }, [grade, manuallySwitched]);

  /** 切换年级（手动）——标记为「用户自己选的」。 */
  const pickGrade = useCallback((next: number) => {
    setManuallySwitched(true);
    setActiveGrade(next);
    setGradeOpen(false);
  }, []);

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
      if (activeGrade > 0 && entry.grade !== activeGrade) return false;
      if (subject !== "all" && entry.subject !== subject) return false;
      if (!keyword) return true;
      return (
        entry.title.toLowerCase().includes(keyword) ||
        entry.shortTitle.toLowerCase().includes(keyword) ||
        entry.edition.toLowerCase().includes(keyword) ||
        entry.author.toLowerCase().includes(keyword)
      );
    });
  }, [index, activeGrade, subject, query]);

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

  /** 当前年级按钮上的文字。 */
  const gradeLabel = useMemo(() => {
    if (activeGrade === 0) return tk("k12.allGrades");
    const entry = index?.grades?.find((item) => item.number === activeGrade);
    if (!entry) return tk("k12.allGrades");
    return `${entry.name} (${entry.ageRange[0]}–${entry.ageRange[1]}岁)`;
  }, [activeGrade, index, tk]);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          {tk("k12.loading")}
        </p>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
        <p className="text-[14px] font-medium text-[var(--foreground)]">
          {tk("k12.loadFailed")}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          {tk("action.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* ── 极简顶栏：只有一行 ── */}
      <header className="shrink-0 border-b border-[var(--border)] bg-white px-4 py-2.5">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3">
          <GraduationCap
            size={17}
            strokeWidth={2.2}
            className="shrink-0 text-[var(--primary)]"
          />

          {/* ── 年级下拉胶囊 ── */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setGradeOpen((value) => !value)}
              aria-expanded={gradeOpen}
              aria-haspopup="listbox"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] pl-3 pr-2.5 text-[12.5px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/40"
            >
              <span className="text-[var(--muted-foreground)]">
                {tk("k12.currentGrade")}：
              </span>
              <span>{gradeLabel}</span>
              <ChevronDown
                size={13}
                strokeWidth={2.2}
                className={cn(
                  "text-[var(--muted-foreground)] transition-transform",
                  gradeOpen && "rotate-180",
                )}
              />
            </button>

            {gradeOpen ? (
              <>
                {/* 遮罩——点外面关闭。 */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setGradeOpen(false)}
                />
                <div
                  role="listbox"
                  className="absolute left-0 top-full z-20 mt-1.5 max-h-[380px] w-[248px] overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.22)]"
                >
                  {/* 全部年级。 */}
                  <button
                    type="button"
                    role="option"
                    aria-selected={activeGrade === 0}
                    onClick={() => pickGrade(0)}
                    className={cn(
                      "mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                      activeGrade === 0
                        ? "bg-[var(--primary)]/8 font-medium text-[var(--primary)]"
                        : "text-[var(--foreground)] hover:bg-[var(--muted)]",
                    )}
                  >
                    {tk("k12.allGrades")}
                  </button>

                  {STAGES.map((stage) => {
                    const grades = index.grades.filter(
                      (item) => item.stage === stage,
                    );
                    if (grades.length === 0) return null;
                    return (
                      <div key={stage} className="mb-1 last:mb-0">
                        <p className="px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-[var(--muted-foreground)]">
                          {STAGE_NAMES[stage as keyof typeof STAGE_NAMES]}
                        </p>
                        {grades.map((item) => (
                          <button
                            key={item.number}
                            type="button"
                            role="option"
                            aria-selected={activeGrade === item.number}
                            onClick={() => pickGrade(item.number)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                              activeGrade === item.number
                                ? "bg-[var(--primary)]/8 font-medium text-[var(--primary)]"
                                : "text-[var(--foreground)] hover:bg-[var(--muted)]",
                            )}
                          >
                            <span>{item.name}</span>
                            <span className="text-[11px] text-[var(--muted-foreground)]">
                              {item.ageRange[0]}–{item.ageRange[1]} 岁
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          {/* ── 学科切换 ── */}
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-[var(--muted)] p-0.5">
            {(
              [
                { id: "all", label: tk("k12.subjectAll") },
                { id: "chinese", label: tk("k12.subjectChinese") },
                { id: "math", label: tk("k12.subjectMath") },
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

          <div className="flex-1" />

          {/* ── 搜索框 ── */}
          <label className="relative flex h-8 w-[220px] shrink-0 items-center">
            <Search
              size={13}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-2.5 text-[var(--muted-foreground)]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tk("k12.searchPlaceholder")}
              className="h-full w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-8 pr-7 text-[12.5px] text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]/40"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={tk("action.close")}
                className="absolute right-1.5 rounded p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            ) : null}
          </label>
        </div>
      </header>

      {/* ── 主体 ── */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1120px] px-4 py-5">
          {series.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-[13.5px] font-medium text-[var(--foreground)]">
                {tk("k12.noResult")}
              </p>
              <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                {tk("k12.tryOther")}
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

/** 三个学段——下拉里的分组顺序。 */
const STAGES = ["primary", "junior", "senior"] as const;

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
