"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Loader2,
  Search,
  Star,
  X,
} from "lucide-react";
import { fetchK12Index, fetchK12Series } from "@/lib/k12-client";
import type {
  K12Index,
  K12IndexEntry,
  K12SeriesDetail,
  K12Subject,
} from "@/lib/k12-api";
import { buildUnits, type CourseUnit } from "@/lib/course-units";
import {
  countLessonStars,
  readUnitBadge,
  STARS_UPDATED_EVENT,
  summarizeCourse,
} from "@/lib/star-ledger";
import { useGrade } from "@/context/GradeContext";
import { cn } from "@/lib/cn";

/**
 * 课程总台（一屏 100vh · 28/72 分块）
 * ==================================
 *
 * .. code-block:: text
 *
 *     ┌───────────────┬──────────────────────────────────────────┐
 *     │  语文 · 文化   │  [第一单元][第二单元][第三单元]…        │
 *     │  ⭐ 3/15 徽章2  │  ┌────────┐ ┌────────┐ ┌────────┐    │
 *     │               │  │ 课名    │ │ 课名    │ │ 课名    │    │
 *     │  数学 · 思维   │  │ 教具标签 │ │ 教具标签 │ │ 教具标签 │    │
 *     │  ⭐ 5/15 徽章1  │  │ ☆☆☆ 探究 │ │ ☆☆☆ 探究 │ │ ☆☆☆ 探究 │    │
 *     │               │  └────────┘ └────────┘ └────────┘    │
 *     │ [生成本学科报告] │                                          │
 *     └───────────────┴──────────────────────────────────────────┘
 *
 * 为什么「一屏、零滚动」
 * ---------------------
 *
 * 选课是一个**决策**动作：选学科 → 选单元 → 选课。三步都在一屏内
 * 完成，用户不需要在长列表里滚来滚去找。
 *
 * ⛔ **点击必须 100% 跳转**。每张课卡都是 ``<Link>``，目标���
 *    ``/learn?course=<id>&lesson=<epId>``——纯静态顶级路由 + 查询
 *    参数，GitHub Pages 子路径部署下也不会 404。
 */

/** 学科主题色——低饱和雾感。 */
const SUBJECT_THEME: Record<
  K12Subject,
  { primary: string; soft: string; line: string; label: string }
> = {
  chinese: {
    primary: "#8a6e63",
    soft: "#f6f1ee",
    line: "#e2d6cf",
    label: "语文 · 中国文化与通识教育",
  },
  math: {
    primary: "#4e677d",
    soft: "#eff3f6",
    line: "#d3dce3",
    label: "数学 · 基础数学与思维研究",
  },
};

/**
 * 教具徽标。
 *
 * 把互动实验室的 ``kind`` 翻成一句人能读懂的话——「动态量角器」比
 * 「geometry」有信息量得多。
 */
function toolBadge(kind?: string | null): string | null {
  switch (kind) {
    case "hanzi":
      return "汉字笔顺描红";
    case "poem":
      return "古诗图解";
    case "literary":
      return "名篇精读台";
    case "blocks":
      return "凑十方块";
    case "numberline":
      return "数轴跳格";
    case "fraction":
      return "分数圆盘";
    case "area":
      return "面积方格";
    case "transform":
      return "平移对称";
    case "ratio":
      return "比例天平";
    case "function":
      return "函数实验室";
    case "geometry":
      return "动态量角器";
    case "algebra":
      return "方程天平";
    case "probability":
      return "概率模拟";
    case "protractor":
      return "动态量角器";
    case "functionLab":
      return "函数坐标系";
    case "chartLab":
      return "统计图表台";
    case "decimalBlocks":
      return "十进制积木";
    case "fractionDisc":
      return "分数圆盘";
    case "balanceScale":
      return "方程天平";
    case "culture":
      return "文化互动台";
    default:
      return null;
  }
}

/** 组件。 */
export default function CoursesHub() {
  /**
   * 查询参数——``/courses?subject=math&grade=5``。
   *
   * 这让课程总台可以被**直接链接**（「五年级数学」就是一个可分享
   * 的 URL），也让「生成本学科 Result Report →」能带着学科回跳。
   */
  const searchParams = useSearchParams();
  const urlSubject = searchParams.get("subject");
  const urlGrade = Number(searchParams.get("grade") ?? 0) || 0;

  const [index, setIndex] = useState<K12Index | null>(null);
  const [loading, setLoading] = useState(true);
  const { grade } = useGrade();

  /** 当前学科。 */
  const [subject, setSubject] = useState<K12Subject>(
    urlSubject === "chinese" ? "chinese" : "math",
  );
  /** 当前年级（``0`` = 全部）。 */
  const [activeGrade, setActiveGrade] = useState<number>(urlGrade);
  /** 当前单元 id。 */
  const [activeUnitId, setActiveUnitId] = useState<string>("");
  /** 搜索词。 */
  const [query, setQuery] = useState("");
  /** 账本版本——变化时重算星星。 */
  const [ledgerVersion, setLedgerVersion] = useState(0);

  /** 加载索引。 */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setIndex(await fetchK12Index());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 跟随档案里的年级（除非用户手动切过）。 */
  const [manuallySwitched, setManuallySwitched] = useState(false);
  useEffect(() => {
    if (manuallySwitched) return;
    // URL 里的 grade 优先——它是**显式**的用户意图。
    if (urlGrade > 0) {
      setActiveGrade(urlGrade);
      return;
    }
    if (grade > 0) setActiveGrade(grade);
  }, [grade, manuallySwitched, urlGrade]);

  /** 账本变化 → 重算。 */
  useEffect(() => {
    const handler = () => setLedgerVersion((value) => value + 1);
    window.addEventListener(STARS_UPDATED_EVENT, handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener(STARS_UPDATED_EVENT, handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  /** 当前学科 + 年级的系列条目。 */
  const entries = useMemo(() => {
    const all = index?.series ?? [];
    return all.filter((entry) => {
      if (entry.subject !== subject) return false;
      if (activeGrade > 0 && entry.grade !== activeGrade) return false;
      return true;
    });
  }, [index, subject, activeGrade]);

  /** 搜索结果。 */
  const searchResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return (index?.series ?? []).filter(
      (entry) =>
        entry.title.toLowerCase().includes(keyword) ||
        entry.shortTitle.toLowerCase().includes(keyword) ||
        entry.edition.toLowerCase().includes(keyword),
    );
  }, [index, query]);

  /** 当前选中的系列（优先当前年级，否则第一个）。 */
  const activeEntry = useMemo(() => {
    if (entries.length === 0) return null;
    return (
      entries.find((entry) => entry.grade === activeGrade) ?? entries[0]
    );
  }, [entries, activeGrade]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f6f4ef]">
        <Loader2 size={18} className="animate-spin text-[#5c646d]" />
      </div>
    );
  }

  if (!index) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f6f4ef]">
        <p className="text-[14px] font-medium text-[#1e242b]">
          课程索引加载失败
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full bg-[#1e242b] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,28fr)_minmax(0,72fr)]">
      {/* ══════════ 左 · 学科指挥舱（28%） ══════════ */}
      <aside className="flex min-h-0 flex-col gap-3">
        {/* 学科切换卡 */}
        {(["chinese", "math"] as K12Subject[]).map((item) => {
          const theme = SUBJECT_THEME[item];
          const active = subject === item;
          const matching = (index.series ?? []).filter(
            (entry) =>
              entry.subject === item &&
              (activeGrade > 0 ? entry.grade === activeGrade : true),
          );

          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setSubject(item);
                setActiveUnitId("");
              }}
              aria-pressed={active}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all",
                active
                  ? "border-transparent shadow-[0_6px_20px_-8px_rgba(30,36,43,0.16)]"
                  : "border-[#e5e2da] bg-white hover:border-[#d5d1c8]",
              )}
              style={active ? { background: theme.soft } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: active ? theme.primary : "#5c646d" }}
                >
                  {item === "chinese" ? "语文" : "数学"}
                </span>
                {active ? (
                  <span
                    className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: theme.primary }}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-[#5c646d]">
                {theme.label}
              </p>
              <p className="mt-2 text-[10.5px] text-[#8a8578]">
                {matching.length} 套课程 ·{" "}
                {matching.reduce((sum, e) => sum + e.episodeCount, 0)} 课时
              </p>
            </button>
          );
        })}

        {/* 年级切换 */}
        <div className="rounded-2xl border border-[#e5e2da] bg-white p-3">
          <p className="mb-2 text-[10.5px] font-medium tracking-[0.14em] text-[#5c646d] uppercase">
            年级
          </p>
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setManuallySwitched(true);
                  setActiveGrade(value);
                  setActiveUnitId("");
                }}
                aria-pressed={activeGrade === value}
                className={cn(
                  "h-7 rounded-lg text-[11.5px] tabular-nums transition-colors",
                  activeGrade === value
                    ? "bg-[#1e242b] font-medium text-white"
                    : "text-[#5c646d] hover:bg-[#f2efe9]",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {/* 生成本学科 Result Report */}
        <Link
          href={`/report?subject=${subject}`}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-[#1e242b] px-4 py-2.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          生成本学科 Result Report
          <ArrowRight size={13} strokeWidth={2.4} />
        </Link>
      </aside>

      {/* ══════════ 右 · 单元分块面板（72%） ══════════ */}
      <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-[#e5e2da] bg-white">
        {query.trim() ? (
          /* ── 搜索结果 ── */
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <h2 className="mb-3 text-[13px] font-semibold text-[#1e242b]">
              搜索「{query.trim()}」· {searchResults.length} 个系列
            </h2>
            {searchResults.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[#5c646d]">
                没有匹配的课程，换个关键词试试。
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {searchResults.map((entry) => (
                  <SeriesTile key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <ActiveSeriesPanel
            entry={activeEntry}
            activeUnitId={activeUnitId}
            onUnitChange={setActiveUnitId}
            ledgerVersion={ledgerVersion}
          />
        )}

        {/* 搜索框——浮在右上面板顶部 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[#e5e2da] px-4 py-2.5">
          <label className="relative flex h-8 flex-1 items-center">
            <Search
              size={13}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-2.5 text-[#8a8578]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索课程…"
              className="h-full w-full rounded-lg border border-[#e5e2da] bg-[#f6f4ef] pl-8 pr-7 text-[12px] text-[#1e242b] outline-none placeholder:text-[#a8a398] focus:border-[#4e677d]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清除"
                className="absolute right-2 text-[#8a8578] hover:text-[#1e242b]"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            ) : null}
          </label>
        </div>
      </section>
    </div>
  );
}

/**
 * 当前系列的面板——单元 Tab + 小课卡片网格。
 */
function ActiveSeriesPanel({
  entry,
  activeUnitId,
  onUnitChange,
  ledgerVersion,
}: {
  entry: K12IndexEntry | null;
  activeUnitId: string;
  onUnitChange: (id: string) => void;
  ledgerVersion: number;
}) {
  const [detail, setDetail] = useState<K12SeriesDetail | null>(null);
  const [loading, setLoading] = useState(false);

  /** 拉取当前系列的详情（点进去才拉）。 */
  useEffect(() => {
    if (!entry) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchK12Series(entry.id).then((result) => {
      if (cancelled) return;
      setDetail(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  /** 单元划分。 */
  const units = useMemo(() => {
    const list = detail?.episodes ?? [];
    return buildUnits(
      list.map((item) => ({
        ep_id: item.ep_id,
        title: item.title,
        core_title: item.core_title ?? null,
      })),
      detail?.subject === "chinese" ? "chinese" : "math",
    );
  }, [detail]);

  /** 当前单元（默认第一个）。 */
  const activeUnit: CourseUnit | null = useMemo(() => {
    if (units.length === 0) return null;
    return units.find((item) => item.id === activeUnitId) ?? units[0];
  }, [units, activeUnitId]);

  /** 课程级汇总。 */
  const summary = useMemo(() => {
    if (!entry || units.length === 0) return null;
    return summarizeCourse(
      entry.id,
      units.flatMap((unit) => unit.lessonIds),
      units.map((unit) => unit.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, units, ledgerVersion]);

  if (!entry) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <p className="text-[13px] text-[#5c646d]">
          这个年级还没有对应学科的课程。
        </p>
      </div>
    );
  }

  const theme = SUBJECT_THEME[entry.subject];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 系列标题条 */}
      <div className="shrink-0 border-b border-[#e5e2da] px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: theme.soft }}
          >
            <BookOpen size={14} strokeWidth={2.2} style={{ color: theme.primary }} />
          </span>
          <h2 className="min-w-0 truncate text-[15px] font-semibold text-[#1e242b]">
            {entry.shortTitle || entry.title}
          </h2>
          {summary ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ddd0b4] bg-[#f7f3ea] px-2.5 py-1 text-[11px] font-medium text-[#6e5a38]">
              <Star
                size={11}
                strokeWidth={2.4}
                className="fill-[#a48a5e] text-[#a48a5e]"
              />
              {summary.stars} / {summary.maxStars}
              <span className="text-[#a8a398]">·</span>
              <Award size={11} strokeWidth={2.4} className="text-[#a48a5e]" />
              {summary.badges} 徽章
            </span>
          ) : null}
        </div>
      </div>

      {/* 单元 Tab */}
      {units.length > 0 ? (
        <div className="shrink-0 overflow-x-auto border-b border-[#e5e2da] px-5 py-2.5">
          <div className="flex gap-1.5">
            {units.map((unit) => {
              const active = activeUnit?.id === unit.id;
              const badge = readUnitBadge(entry.id, unit.id);
              return (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => onUnitChange(unit.id)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                    active
                      ? "border-transparent bg-[#1e242b] text-white"
                      : "border-[#e5e2da] bg-white text-[#5c646d] hover:border-[#d5d1c8]",
                  )}
                >
                  {unit.title}
                  <Award
                    size={12}
                    strokeWidth={2.2}
                    className={badge.unlocked ? "text-[#a48a5e]" : "text-[#c9c4b8]"}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 小课卡片网格 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={18} className="animate-spin text-[#5c646d]" />
          </div>
        ) : !activeUnit ? (
          <p className="py-10 text-center text-[13px] text-[#5c646d]">
            这一课还没有分节内容。
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeUnit.lessonIds.map((epId) => {
              const ep = detail?.episodes.find((item) => item.ep_id === epId);
              if (!ep) return null;
              const stars = countLessonStars(entry.id, epId);
              const badge = toolBadge(ep.interactive_lab?.kind);

              return (
                <Link
                  key={epId}
                  href={`/learn?course=${encodeURIComponent(entry.id)}&lesson=${encodeURIComponent(epId)}`}
                  className="group flex flex-col rounded-2xl border border-[#e5e2da] bg-white p-4 transition-all hover:border-[#d5d1c8] hover:shadow-[0_6px_20px_-10px_rgba(30,36,43,0.16)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="text-[10.5px] tabular-nums"
                      style={{ color: theme.primary }}
                    >
                      第 {ep.index} 讲
                    </span>
                    <span className="flex shrink-0 gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <Star
                          key={i}
                          size={11}
                          strokeWidth={2}
                          className={i < stars ? "text-[#a48a5e]" : "text-[#ddd8cc]"}
                          fill={i < stars ? "#a48a5e" : "none"}
                        />
                      ))}
                    </span>
                  </div>

                  <h3 className="mt-1.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-[#1e242b]">
                    {ep.core_title || ep.title}
                  </h3>

                  {badge ? (
                    <span
                      className="mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]"
                      style={{ background: theme.soft, color: theme.primary }}
                    >
                      {badge}
                    </span>
                  ) : null}

                  <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-[#5c646d] group-hover:text-[#1e242b]">
                    开始探究
                    <ArrowRight size={12} strokeWidth={2.4} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 搜索结果里的系列小卡。 */
function SeriesTile({ entry }: { entry: K12IndexEntry }) {
  const theme = SUBJECT_THEME[entry.subject];
  return (
    <Link
      href={`/courses?grade=${entry.grade}&subject=${entry.subject}`}
      className="flex flex-col rounded-2xl border border-[#e5e2da] bg-white p-4 transition-colors hover:border-[#d5d1c8]"
    >
      <span
        className="inline-flex w-fit rounded-full px-2 py-0.5 text-[10.5px]"
        style={{ background: theme.soft, color: theme.primary }}
      >
        {entry.subject === "chinese" ? "语文" : "数学"} · {entry.grade} 年级
      </span>
      <h3 className="mt-2 text-[13.5px] font-medium leading-snug text-[#1e242b]">
        {entry.shortTitle || entry.title}
      </h3>
      <p className="mt-1 text-[11px] text-[#8a8578]">
        {entry.episodeCount} 课时 · {entry.edition}
      </p>
    </Link>
  );
}
