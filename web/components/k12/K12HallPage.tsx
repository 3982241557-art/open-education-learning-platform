"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  Compass,
  Loader2,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { fetchK12Index, fetchK12Series } from "@/lib/k12-client";
import {
  isPlayfulStage,
  type K12Index,
  type K12IndexEntry,
  type K12Subject,
} from "@/lib/k12-api";
import { buildUnits, type CourseUnit } from "@/lib/course-units";
import {
  countLessonStars,
  readUnitBadge,
  settleUnitBadge,
  STARS_UPDATED_EVENT,
  summarizeCourse,
} from "@/lib/star-ledger";
import { useGrade } from "@/context/GradeContext";
import GradeSelector from "@/components/common/GradeSelector";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/cn";

/**
 * 课程大厅 ·「星轨学习地图」
 * ===========================
 *
 * 语文与数学两大学科入口 + **Unit → Lesson 的可视化星轨路径**。
 *
 * 为什么不���「分集表格」
 * ---------------------
 *
 * 表格的问题不是排版，是**它不表达结构**。上百行标题，用户看不出
 * 「我现在在第几块」「这门课一共分几段」「下一块是什么」。
 *
 * 星轨地图给出三个东西：
 *
 * 1. **单元（Unit）**——大课，每���单元顶上有自己的学术徽章；
 * 2. **小课（Lesson）**——单元内串联的精致卡片，带教具标签与 3 颗星；
 * 3. **轨道线**——把「路径」画出来，让「进度」变成可见的轨迹。
 *
 * 星星规则
 * --------
 *
 * .. code-block:: text
 *
 *     ⭐  动手探索 —— 完成本课交互教具核心操作任务
 *     ⭐⭐  深度思考 —— 完成启发引导或向伴学提问
 *     ⭐⭐⭐  巩固掌握 —— 通过本课巩固测试
 *
 * 单元徽章
 * --------
 *
 * 完成该单元**全部**课时，或拿到该单元 **≥80%** 的星 → 点亮
 * 香槟金 × 深牛津蓝的金属质感徽章。
 */

/** 语文核心培养目标——按年级。 */
const CHINESE_GOALS: Record<number, string> = {
  1: "识字、拼音与朗读起步，建立对汉字字形的敏感。",
  2: "识字量积累与词语运用，学会把话说完整。",
  3: "段落理解与中心句意识，开始写完整的段落。",
  4: "从段到篇的过渡，把握文章的主要意思。",
  5: "说明文与习作初步，学会搜集与整理材料。",
  6: "文言入门与毕业习作，学会审题与布局。",
  7: "记叙文三要素与修辞入门，读懂作者的情感基调。",
  8: "文言实词虚词与说明文说明方法，辨析论证与结论。",
  9: "中考议论文与记叙文得分点，学会复盘与补漏。",
  10: "现代文阅读与写实抒情的分寸感，建立文学鉴赏框架。",
  11: "古代诗歌鉴赏与思辨性文本，学会读懂言外之意。",
  12: "高考作文立意与素材运用，学会结构化表达。",
};

/** 数学核心思维目标——按年级。 */
const MATH_GOALS: Record<number, string> = {
  1: "数感建立与加减法启蒙，从生活情境里认数。",
  2: "100 以内加减与乘法意义，建立运算直觉。",
  3: "分数初步与周长面积，建立图形与度量的观念。",
  4: "大数运算与三位数乘法，体会运算律的简洁。",
  5: "小数乘除与简易方程，学会用字母表示数。",
  6: "分数乘除与比，体会数量关系的形式化。",
  7: "有理数与整式运算，建立代数思维的第一层。",
  8: "一次函数与四边形，学会用变量看关系。",
  9: "二次函数与圆，学会用图象找关键点。",
  10: "集合与函数概念，学会用定义域讨论问题。",
  11: "数列与导数雏形，学会看变化率。",
  12: "导数与圆锥曲线，学会用参数与最优化建模。",
};

/**
 * 教具徽标。
 *
 * 把互动实验室的 ``kind`` 翻成一句人能读懂的话——「含动态量角器」比
 * 「geometry」有信息量得多。用户看到徽标就知道点进去能玩什么。
 */
function toolBadge(kind?: string | null): string | null {
  switch (kind) {
    case "hanzi":
      return "汉字笔顺";
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
export default function K12HallPage() {
  const [index, setIndex] = useState<K12Index | null>(null);
  const [loading, setLoading] = useState(true);
  const { grade } = useGrade();
  const { tk } = useLocale();

  /** 当前选中的年级（``0`` = 全部年级）。 */
  const [activeGrade, setActiveGrade] = useState<number>(0);
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

  /** 当前年级系列的索引条目。 */
  const currentEntries = useMemo(() => {
    const all = index?.series ?? [];
    if (activeGrade > 0) {
      return all.filter((entry) => entry.grade === activeGrade);
    }
    return all;
  }, [index, activeGrade]);

  /** 语文 / 数学两个入口。 */
  const chineseEntry = currentEntries.find((e) => e.subject === "chinese");
  const mathEntry = currentEntries.find((e) => e.subject === "math");

  /** 搜索结果——只有搜到别的年级时才需要列出来。 */
  const searchResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return (index?.series ?? []).filter(
      (entry) =>
        entry.title.toLowerCase().includes(keyword) ||
        entry.shortTitle.toLowerCase().includes(keyword) ||
        entry.edition.toLowerCase().includes(keyword) ||
        entry.author.toLowerCase().includes(keyword),
    );
  }, [index, query]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          {tk("k12.loading")}
        </p>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
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
    <div className="flex flex-col bg-[var(--background)]">
      {/* ── 极简控制栏：只有一行 ── */}
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <GradeSelector
          compact
          className="shrink-0"
          onChange={(next) => {
            setManuallySwitched(true);
            setActiveGrade(next);
          }}
        />

        <button
          type="button"
          onClick={() => {
            setManuallySwitched(true);
            setActiveGrade(0);
          }}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
            activeGrade === 0
              ? "border-[#0B162C] bg-[#0B162C] text-white"
              : "border-[#CBD5E1] bg-white text-[#0F172A] hover:border-[#1D4ED8]",
          )}
        >
          {tk("k12.allGrades")}
        </button>

        <div className="flex-1" />

        {/* 搜索框。 */}
        <label className="relative flex h-9 w-[240px] shrink-0 items-center">
          <Search
            size={13}
            strokeWidth={2.2}
            className="pointer-events-none absolute left-2.5 text-[#55606e]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tk("k12.searchPlaceholder")}
            className="h-full w-full rounded-lg border border-[#cbd5e1] bg-white pl-8 pr-7 text-[12.5px] text-[#0f172a] outline-none transition-colors placeholder:text-[#8a93a0] focus:border-[#1d4ed8]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={tk("action.close")}
              className="absolute right-1.5 rounded p-1 text-[#55606e] transition-colors hover:text-[#0f172a]"
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          ) : null}
        </label>
      </header>

      {/* ── 主体 ── */}
      <main>
        {query.trim() ? (
          /* ══ 搜索结果 ══ */
          <section>
            <h2 className="mb-3 text-[13px] font-semibold text-[#0f172a]">
              搜索「{query.trim()}」· {searchResults.length} 个系列
            </h2>
            {searchResults.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-white py-14 text-center">
                <p className="text-[13.5px] font-medium text-[#0f172a]">
                  {tk("k12.noResult")}
                </p>
                <p className="mt-1.5 text-[12px] text-[#55606e]">{tk("k12.tryOther")}</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((entry) => (
                  <SeriesCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </section>
        ) : (
          /* ══ 双学科巨幕 + 星轨地图 ══ */
          <div className="space-y-8">
            <div className="grid gap-5 lg:grid-cols-2">
              <SubjectBanner
                entry={chineseEntry}
                subject="chinese"
                grade={activeGrade}
                goal={
                  activeGrade > 0
                    ? CHINESE_GOALS[activeGrade]
                    : "按年级推进的字词积累、阅读理解与表达能力训练。"
                }
              />
              <SubjectBanner
                entry={mathEntry}
                subject="math"
                grade={activeGrade}
                goal={
                  activeGrade > 0
                    ? MATH_GOALS[activeGrade]
                    : "从数感启蒙到函数与几何，建立完整的数学建模能力。"
                }
              />
            </div>

            {/* 星轨学习地图。 */}
            {chineseEntry ? (
              <StarTrackMap entry={chineseEntry} subject="chinese" />
            ) : null}
            {mathEntry ? (
              <StarTrackMap entry={mathEntry} subject="math" />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * 学科巨幕。
 *
 * 左右两块**对称而有分量**。语文是纸白 + 宋体 + 香槟金；数学是冷白 +
 * 无衬线 + 牛津蓝。
 */
function SubjectBanner({
  entry,
  subject,
  grade,
  goal,
}: {
  entry?: K12IndexEntry;
  subject: K12Subject;
  grade: number;
  goal: string;
}) {
  const isChinese = subject === "chinese";

  /** 前 3 讲真实课名——点开直接进课。 */
  const [preview, setPreview] = useState<
    Array<{
      ep_id: string;
      title: string;
      index: number;
      tool: string | null;
    }>
  >([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  /** 整册已完成讲数——进度条要用。 */
  const [doneTotal, setDoneTotal] = useState(0);

  useEffect(() => {
    if (!entry) {
      setPreview([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const detail = await fetchK12Series(entry.id);
      if (cancelled) return;
      const episodes = (detail?.episodes ?? []).slice(0, 3);
      setPreview(
        episodes.map((item) => ({
          ep_id: item.ep_id,
          title: item.title,
          index: item.index,
          tool: toolBadge(item.interactive_lab?.kind),
        })),
      );
      const records = readEpisodeRecordsSafe(entry.id);
      const done = new Set<string>();
      for (const item of episodes) {
        if (records[item.ep_id]?.completed) done.add(item.ep_id);
      }
      setDoneIds(done);
      let total = 0;
      for (const item of detail?.episodes ?? []) {
        if (records[item.ep_id]?.completed) total += 1;
      }
      setDoneTotal(total);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (!entry) {
    return (
      <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-6 py-16 text-center">
        <p className="text-[13.5px] font-medium text-[#0f172a]">
          这个年级暂时没有{isChinese ? "语文" : "数学"}同步课
        </p>
        <p className="mt-1.5 text-[12px] text-[#55606e]">
          换一个年级试试，或在上方搜索框里查找。
        </p>
      </div>
    );
  }

  const gradeName = grade > 0 ? entry.shortTitle.replace(/语文|数学$/, "") : "全部年级";

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border p-6 oe-card-shadow sm:p-8",
        isChinese
          ? "border-[rgba(184,155,94,0.42)] bg-[#fffefa]"
          : "border-[#e5e7eb] bg-white",
      )}
    >
      {isChinese ? <PatternBorder /> : <PatternGrid />}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <p
          className={cn(
            "text-[10.5px] font-medium tracking-[0.2em] uppercase",
            isChinese ? "text-[#b89b5e]" : "text-[#1d4ed8]",
          )}
        >
          {isChinese ? "国家统编版 / 部编版" : "人教版 / 高中人教 A 版"}
        </p>

        <h2
          className={cn(
            "mt-3 text-[30px] leading-[1.15] tracking-[-0.02em] sm:text-[36px]",
            isChinese
              ? "oe-display text-[#0b162c]"
              : "font-semibold text-[#0b162c]",
          )}
        >
          {gradeName} · {isChinese ? "语文" : "数学"}
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10.5px] font-medium",
              isChinese
                ? "border border-[rgba(184,155,94,0.4)] bg-white text-[#8a7340]"
                : "border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
            )}
          >
            {entry.ageRange[0]}–{entry.ageRange[1]} 岁
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10.5px] font-medium",
              isChinese
                ? "border border-[rgba(184,155,94,0.4)] bg-white text-[#8a7340]"
                : "border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
            )}
          >
            {entry.volumes.join(" / ")}
          </span>
          <span className="text-[11.5px] text-[#55606e]">共 {entry.episodeCount} 讲</span>
        </div>

        <p
          className={cn(
            "mt-5 text-[13.5px] leading-[1.9]",
            isChinese ? "text-[#3f4a59]" : "text-[#55606e]",
          )}
        >
          {goal}
        </p>

        {/* ── 前 3 讲真实课名直达 ── */}
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.14em] text-[#8a93a0] uppercase">
            <BookOpen size={11} strokeWidth={2.2} />
            前 3 讲 · 点击直达
          </p>
          {preview.length === 0 ? (
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-[#f1f0ec]" />
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {preview.map((item) => {
                const done = doneIds.has(item.ep_id);
                return (
                  <li key={item.ep_id}>
                    <Link
                      href={`/courses/${encodeURIComponent(entry.id)}/${encodeURIComponent(item.ep_id)}`}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                        isChinese
                          ? "border-[rgba(184,155,94,0.28)] bg-white hover:border-[#b89b5e]"
                          : "border-[#e5e7eb] bg-[#fbfbfa] hover:border-[#1d4ed8]",
                      )}
                    >
                      {done ? (
                        <CheckCircle2
                          size={13}
                          strokeWidth={2.2}
                          className="shrink-0 text-emerald-600"
                        />
                      ) : (
                        <Circle
                          size={13}
                          strokeWidth={2}
                          className="shrink-0 text-slate-300"
                        />
                      )}
                      <span className="shrink-0 text-[11px] tabular-nums text-[#8a93a0]">
                        {String(item.index).padStart(2, "0")}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px] font-medium",
                          isChinese ? "text-[#0b162c]" : "text-[#0f172a]",
                        )}
                      >
                        {item.title}
                      </span>
                      {item.tool ? (
                        <span
                          className={cn(
                            "hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline-block",
                            isChinese
                              ? "border-[rgba(184,155,94,0.4)] bg-[#FFFEFA] text-[#8a7340]"
                              : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
                          )}
                        >
                          {item.tool}
                        </span>
                      ) : null}
                      <ArrowRight
                        size={12}
                        strokeWidth={2.2}
                        className="shrink-0 text-slate-300 transition-colors group-hover:text-[#1d4ed8]"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── 进度条 + 主按钮 ── */}
        <div className="mt-auto pt-6">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-[#55606e]">本学科学习进度</span>
            <span className="text-[11px] tabular-nums text-[#55606e]">
              {doneTotal} / {entry.episodeCount} 讲
            </span>
          </div>
          <div
            className={cn(
              "h-1.5 w-full overflow-hidden rounded-full",
              isChinese ? "bg-[rgba(184,155,94,0.16)]" : "bg-[#e5e7eb]",
            )}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                isChinese ? "bg-[#b89b5e]" : "bg-[#1d4ed8]",
              )}
              style={{
                width: `${Math.min(
                  100,
                  (doneTotal / Math.max(1, entry.episodeCount)) * 100,
                )}%`,
              }}
            />
          </div>

          <Link
            href={`/courses/${encodeURIComponent(entry.id)}`}
            className={cn(
              "mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-medium transition-colors sm:w-auto sm:px-6",
              isChinese
                ? "bg-[#0b162c] text-white hover:bg-[#122344]"
                : "bg-[#1d4ed8] text-white hover:bg-[#1e40af]",
            )}
          >
            {doneTotal > 0
              ? `继续第 ${doneTotal + 1} 讲 →`
              : `进入${isChinese ? "语文" : "数学"}课程目录 →`}
          </Link>
        </div>
      </div>
    </motion.section>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 星轨学习地图
 * ────────────────────────────────────────────────────────────────── */

interface TrackLesson {
  ep_id: string;
  title: string;
  index: number;
  tool: string | null;
}

/**
 * 星轨学习地图。
 *
 * .. code-block:: text
 *
 *     ○ 单元徽章（第 3 单元 · 8 讲 · 12⭐/24）
 *     │   ┌──── 课名 · 教具标签 · ★★☆ ────┐
 *     │   ├──── 课名 · 教具标签 · ★★★ ────┤
 *     │   └──── 课名 · 教具标签 · ☆☆☆ ────┘
 *     ○ 下一个单元徽章
 *
 * 单元之间用一条**竖向轨道线**连起来——这就是「星轨」的来源。
 */
function StarTrackMap({
  entry,
  subject,
}: {
  entry: K12IndexEntry;
  subject: K12Subject;
}) {
  const isChinese = subject === "chinese";
  const [units, setUnits] = useState<CourseUnit[]>([]);
  const [lessons, setLessons] = useState<Record<string, TrackLesson>>({});
  const [loading, setLoading] = useState(true);
  /** 账本版本号——星星变化时触发重算。 */
  const [ledgerVersion, setLedgerVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detail = await fetchK12Series(entry.id);
      if (cancelled) return;
      const episodes = detail?.episodes ?? [];
      setUnits(
        buildUnits(
          episodes.map((item) => ({
            ep_id: item.ep_id,
            title: item.title,
            core_title: item.core_title ?? null,
          })),
          subject,
        ),
      );
      const map: Record<string, TrackLesson> = {};
      for (const item of episodes) {
        map[item.ep_id] = {
          ep_id: item.ep_id,
          title: item.title,
          index: item.index,
          tool: toolBadge(item.interactive_lab?.kind),
        };
      }
      setLessons(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id, subject]);

  /** 星星变化 → 重算徽章与汇总。 */
  useEffect(() => {
    const refresh = () => setLedgerVersion((v) => v + 1);
    window.addEventListener(STARS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(STARS_UPDATED_EVENT, refresh);
  }, []);

  /** 汇总。 */
  const summary = useMemo(() => {
    const lessonIds = units.flatMap((unit) => unit.lessonIds);
    return summarizeCourse(
      entry.id,
      lessonIds,
      units.map((unit) => unit.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, units, ledgerVersion]);

  /** 每次账本变化都重新结算单元徽章。 */
  useEffect(() => {
    if (units.length === 0) return;
    for (const unit of units) {
      settleUnitBadge(entry.id, unit.id, unit.lessonIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, units, ledgerVersion]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-8">
        <div className="mx-auto h-40 max-w-md animate-pulse rounded-xl bg-[#f1f0ec]" />
      </section>
    );
  }

  if (units.length === 0) return null;

  return (
    <section
      className={cn(
        "rounded-2xl border p-5 oe-card-shadow sm:p-7",
        isChinese
          ? "border-[rgba(184,155,94,0.32)] bg-[#FFFEFA]"
          : "border-[#e5e7eb] bg-white",
      )}
    >
      {/* ── 头部：星轨总览 ── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className={cn(
              "flex items-center gap-2 text-[10.5px] font-medium tracking-[0.18em] uppercase",
              isChinese ? "text-[#b89b5e]" : "text-[#1d4ed8]",
            )}
          >
            <Compass size={12} strokeWidth={2.2} />
            星轨学习地图 · Star Track Map
          </p>
          <h3
            className={cn(
              "mt-2 text-[24px] leading-tight tracking-[-0.02em] sm:text-[28px]",
              isChinese ? "oe-display text-[#0b162c]" : "font-semibold text-[#0b162c]",
            )}
          >
            {entry.shortTitle}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SummaryChip
            icon={<Star size={12} strokeWidth={2.2} />}
            value={`${summary.stars} / ${summary.maxStars}`}
            label="已获星星"
            accent="#B89B5E"
          />
          <SummaryChip
            icon={<Award size={12} strokeWidth={2.2} />}
            value={`${summary.badges} / ${summary.maxBadges}`}
            label="已点亮徽章"
            accent="#1D4ED8"
          />
          <Link
            href="/report"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium text-white transition-colors",
              isChinese
                ? "bg-[#0b162c] hover:bg-[#122344]"
                : "bg-[#1d4ed8] hover:bg-[#1e40af]",
            )}
          >
            <Sparkles size={12} strokeWidth={2.2} />
            生成 Result Report
          </Link>
        </div>
      </header>

      {/* ── 轨道 ── */}
      <div className="mt-7 space-y-6">
        {units.map((unit, unitIndex) => {
          const badge = readUnitBadge(entry.id, unit.id);
          const unitLessons = unit.lessonIds
            .map((id) => lessons[id])
            .filter((item): item is TrackLesson => Boolean(item));

          return (
            <div key={unit.id} className="relative pl-11">
              {/* 轨道竖线。 */}
              {unitIndex < units.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[18px] top-10 bottom-[-24px] w-px",
                    isChinese ? "bg-[rgba(184,155,94,0.45)]" : "bg-[#dbe3f0]",
                  )}
                />
              ) : null}

              {/* 单元徽章。 */}
              <div className="absolute left-0 top-0">
                <UnitBadge
                  unlocked={badge.unlocked}
                  index={unit.index}
                  stars={badge.stars}
                  maxStars={badge.maxStars}
                  chinese={isChinese}
                />
              </div>

              {/* 单元标题 + 徽章状态。 */}
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h4
                  className={cn(
                    "text-[15px] tracking-[-0.01em]",
                    isChinese
                      ? "oe-display text-[#0b162c]"
                      : "font-semibold text-[#0b162c]",
                  )}
                >
                  {unit.title}
                </h4>
                <span className="text-[11px] tabular-nums text-[#8a93a0]">
                  {unit.lessonIds.length} 讲 · {badge.stars}/{badge.maxStars} ⭐
                </span>
                {badge.unlocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#B89B5E] bg-[#FFFEFA] px-2 py-0.5 text-[10px] font-medium text-[#8A6D3B]">
                    <Award size={10} strokeWidth={2.4} />
                    徽章已点亮
                  </span>
                ) : null}
              </div>

              {/* 小课卡片。 */}
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {unitLessons.map((lesson) => (
                  <LessonNode
                    key={lesson.ep_id}
                    courseId={entry.id}
                    lesson={lesson}
                    chinese={isChinese}
                    version={ledgerVersion}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 头部的一枚汇总数据。 */
function SummaryChip({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5">
      <span style={{ color: accent }}>{icon}</span>
      <span className="text-[12.5px] font-semibold tabular-nums text-[#0F172A]">
        {value}
      </span>
      <span className="text-[11px] text-[#8A93A0]">{label}</span>
    </div>
  );
}

/**
 * 单元学术徽章。
 *
 * 未达成 → **优雅线框银灰**；达成 → **香槟金 × 深牛津蓝**的金属质感。
 */
function UnitBadge({
  unlocked,
  index,
  stars,
  maxStars,
  chinese,
}: {
  unlocked: boolean;
  index: number;
  stars: number;
  maxStars: number;
  chinese: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border-2 text-[11px] font-semibold tabular-nums",
        unlocked
          ? "border-[#B89B5E] bg-[#0B162C] text-[#D8C49A]"
          : "border-[#D3D8E0] bg-white text-[#B7BEC9]",
      )}
      title={
        unlocked
          ? `第 ${index} 单元徽章已点亮（${stars}/${maxStars} ⭐）`
          : `第 ${index} 单元徽章未点亮（${stars}/${maxStars} ⭐，需 ≥80%）`
      }
    >
      {unlocked ? <Award size={15} strokeWidth={2} /> : index}
    </div>
  );
}

/** 一堂小课的星轨节点。 */
function LessonNode({
  courseId,
  lesson,
  chinese,
  version,
}: {
  courseId: string;
  lesson: TrackLesson;
  chinese: boolean;
  version: number;
}) {
  const stars = useMemo(
    () => countLessonStars(courseId, lesson.ep_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, lesson.ep_id, version],
  );

  return (
    <Link
      href={`/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(lesson.ep_id)}`}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border px-3.5 py-3 transition-colors",
        chinese
          ? "border-[rgba(184,155,94,0.28)] bg-white hover:border-[#b89b5e]"
          : "border-[#e5e7eb] bg-white hover:border-[#1d4ed8]",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-[10.5px] tabular-nums text-[#8a93a0]">
          {String(lesson.index).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-[#0F172A]">
          {lesson.title}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 pl-[26px]">
        {lesson.tool ? (
          <span
            className={cn(
              "truncate rounded-full border px-2 py-0.5 text-[10px] font-medium",
              chinese
                ? "border-[rgba(184,155,94,0.4)] bg-[#FFFEFA] text-[#8a7340]"
                : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
            )}
          >
            {lesson.tool}
          </span>
        ) : (
          <span />
        )}
        <StarRow stars={stars} />
      </div>
    </Link>
  );
}

/** 3 颗掌握度星星。 */
export function StarRow({ stars }: { stars: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-label={`${stars} / 3 颗星`}>
      {[0, 1, 2].map((index) => (
        <Star
          key={index}
          size={12}
          strokeWidth={2}
          className={index < stars ? "text-[#B89B5E]" : "text-[#D3D8E0]"}
          fill={index < stars ? "#B89B5E" : "none"}
        />
      ))}
    </span>
  );
}

/** 语文巨幕的古典回纹底纹——极淡，只提供质感。 */
function PatternBorder() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.055]"
    >
      <defs>
        <pattern
          id="oe-chinese-pattern"
          width="34"
          height="34"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M4 4 h26 v26 h-26 z M10 10 h14 v14 h-14 z"
            fill="none"
            stroke="#b89b5e"
            strokeWidth="1"
          />
          <path d="M17 4 v26 M4 17 h26" stroke="#b89b5e" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#oe-chinese-pattern)" />
    </svg>
  );
}

/** 数学巨幕的几何坐标系底纹——极淡。 */
function PatternGrid() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.5]"
    >
      <defs>
        <pattern
          id="oe-math-pattern"
          width="26"
          height="26"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M26 0 L0 0 0 26"
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="0.5"
            strokeOpacity="0.16"
          />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#oe-math-pattern)" />
    </svg>
  );
}

/** 一套系列的卡片——搜索结果用。 */
function SeriesCard({ entry }: { entry: K12IndexEntry }) {
  const playful = isPlayfulStage(entry.stage);

  return (
    <Link
      href={`/courses/${encodeURIComponent(entry.id)}`}
      className={cn(
        "group flex flex-col rounded-xl border border-[var(--border)] bg-white p-4 transition-all",
        "hover:border-[#1d4ed8]/35 hover:shadow-[0_4px_16px_-6px_rgba(11,22,44,0.16)]",
        playful && "rounded-2xl",
      )}
    >
      <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-[#0f172a]">
        {entry.title}
      </h3>
      <p className="mt-1.5 text-[11.5px] text-[#55606e]">
        {entry.edition} · {entry.volumes.join(" / ")}
      </p>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <span className="rounded-full bg-[#f1f0ec] px-2 py-0.5 text-[10.5px] font-medium text-[#55606e]">
          {entry.ageRange[0]}–{entry.ageRange[1]} 岁
        </span>
        <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10.5px] font-medium text-[#1d4ed8]">
          {entry.episodeCount} 课时
        </span>
      </div>
    </Link>
  );
}

/**
 * 安全地读观看记录。
 *
 * ⚠️ 不能在 render 期间直接读 ``localStorage``——SSR 阶段会拿到
 *    ``undefined``，客户端 hydrate 时不一致就会触发 hydration mismatch。
 */
function readEpisodeRecordsSafe(resourceId: string): Record<string, { completed?: boolean }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("dreamclass.progress.global");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const episodes = parsed?.[resourceId]?.episodes;
    return episodes && typeof episodes === "object" ? episodes : {};
  } catch {
    return {};
  }
}
