"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  Download,
  Globe2,
  Printer,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useProfile } from "@/context/ProfileContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import { BRAND, DREAM_CLASSROOM } from "@/data/site-config";
import {
  countNodeStars,
  readMathLedger,
  summarizeMath,
} from "@/lib/math-star-ledger";
import { FLAGSHIP_EDITORIALS } from "@/lib/flagship-editorial";
import { FLAGSHIP_TOPIC_IDS } from "@/lib/flagship-topics";
import {
  countCompletedTopics,
  readFlagshipProgress,
  summarizeCognitive,
} from "@/lib/flagship-progress";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";

/**
 * 梦想课堂 × Open Education · Result Report（/report）
 * ====================================================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────────────────┐
 *     │  ① 能力评估：三大核心认知维度（雷达 + 条形）        │
 *     │  ② 国际能力对标参考（AMC / AP / IB 思维层级）       │
 *     │  ③ 三个标杆专题的星星与徽章                        │
 *     │  ④ 证书 + 打印 / PDF 导出                          │
 *     └────────────────────────────────────────────────────┘
 *
 * ⛔ **非应试**。这里报的是**能力刻度**，不是刷题分数——
 *    对标 AMC / AP / IB 是为了说明「这个思维层级对应国际体系
 *    的哪一段」，不是为了排名。
 *
 * 零滚动契约
 * ----------
 *
 * 严格 100vh 一屏无垂直滚动。
 */

/** 防伪编号——由学习者姓名与统计哈希派生。 */
function certNumber(name: string, stars: number, nodes: number): string {
  let hash = 0;
  const seed = `${name}|${stars}|${nodes}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `OE-${hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 8)}`;
}

/**
 * 生成 PDF 报告。
 *
 * ⛔ **不引入任何 PDF 库**——浏览器的「打印 → 另存为 PDF」产出
 *    的是**矢量** PDF，文字可选可搜，体积比光栅化截图小一个数量级。
 */
function exportPdf(): void {
  if (typeof window === "undefined") return;
  window.print();
}

/** 三大核心认知维度的元信息。 */
const DIMENSIONS = [
  {
    key: "modeling" as const,
    zhCN: "抽象建模力",
    zhTW: "抽象建模力",
    en: "Abstract Modeling",
    descZh: "把现象翻译成公式，并用它预测下一步。",
    descEn: "Turn a phenomenon into a formula, and use it to predict.",
    color: "#0B162C",
  },
  {
    key: "calibration" as const,
    zhCN: "直觉校准力",
    zhTW: "直覺校準力",
    en: "Intuition Calibration",
    descZh: "发现自己直觉错在哪里，并知道错在第几步。",
    descEn: "Find where your intuition slips, and know at which step.",
    color: "#C59B38",
  },
  {
    key: "transfer" as const,
    zhCN: "跨学科迁移力",
    zhTW: "跨學科遷移力",
    en: "Interdisciplinary Transfer",
    descZh: "把一个数学结构带到另一门学问里继续用。",
    descEn: "Carry one mathematical structure into another discipline.",
    color: "#1D4ED8",
  },
];

/** 国际能力对标参考——作为**能力刻度**，不是刷题分数。 */
const BENCHMARKS = [
  {
    id: "exp-comfort",
    zhCN: "指数增长与复利",
    zhTW: "指數增長與複利",
    en: "Exponential growth and compounding",
    cnZh: "高中数学 · 指数函数",
    cnEn: "Secondary · Exponential functions",
    amc: "AMC 10/12 · 约第 18–22 题难度",
    ap: "AP Precalculus · 单元 2（指数与对数函数）",
    ib: "IB Math AA · HL 主题 7（指数与对数）",
  },
  {
    id: "seq-zeno",
    zhCN: "等比数列与极限",
    zhTW: "等比數列與極限",
    en: "Geometric sequences and limits",
    cnZh: "高中数学 · 等比数列与极限",
    cnEn: "Secondary · Geometric sequences and limits",
    amc: "AMC 12 · 约第 21–25 题难度",
    ap: "AP Calculus AB · 单元 1（极限与连续）",
    ib: "IB Math AA · SL/HL 主题 6（数列与级数）",
  },
  {
    id: "prob-bayes",
    zhCN: "条件概率与贝叶斯",
    zhTW: "條件機率與貝葉斯",
    en: "Conditional probability and Bayes",
    cnZh: "初高中数学 · 概率与条件概率",
    cnEn: "Secondary · Probability and conditional probability",
    amc: "AMC 12 · 约第 22–25 题难度",
    ap: "AP Statistics · 单元 3（概率）与单元 4（抽样分布）",
    ib: "IB Math AA · SL/HL 主题 4（概率）",
  },
];

export default function ReportPage() {
  const { locale } = useLocale();
  const { displayName } = useProfile();
  const { taxonomy, playableNodeIds, chainProgress, summary, refreshStars } =
    useMathTaxonomy();

  const isEn = locale === "en";
  const tw = useTraditional();

  const [tick, setTick] = useState(0);

  /* ── 星星账本变化时刷新 ────────────────────────────────────── */

  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    window.addEventListener("oe:math-stars-updated", onUpdate);
    window.addEventListener("oe:flagship-progress-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("oe:math-stars-updated", onUpdate);
      window.removeEventListener("oe:flagship-progress-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  /* ── 文档标题（打印 → 另存为 PDF 会用它当文件名） ─────────── */

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = isEn
      ? "OE Result Report"
      : locale === "zh-TW"
        ? "OE 學習成果報告"
        : "OE 学习成果报告";
  }, [isEn, locale]);

  /* ── 三大认知维度得分 ──────────────────────────────────────── */

  const scores = useMemo(
    () => summarizeCognitive([...FLAGSHIP_TOPIC_IDS]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const completed = useMemo(
    () => countCompletedTopics([...FLAGSHIP_TOPIC_IDS]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const topicRows = useMemo(
    () =>
      FLAGSHIP_TOPIC_IDS.map((id) => {
        const p = readFlagshipProgress(id);
        return {
          id,
          progress: p,
          stars:
            (p.watched ? 1 : 0) +
            (p.touched ? 1 : 0) +
            (p.correct >= 3 ? 1 : 0),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  /* ── 覆盖度 ────────────────────────────────────────────────── */

  const coverage = useMemo(() => {
    if (!taxonomy) return { total: 0, percent: 0 };
    const total = taxonomy.stats.nodeCount;
    const explored = Object.keys(readMathLedger().nodes).length;
    return {
      total,
      percent: total > 0 ? Math.round((explored / total) * 100) : 0,
    };
  }, [taxonomy, tick]);

  const summaryMemo = useMemo(
    () => summarizeMath(playableNodeIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playableNodeIds, tick],
  );

  if (!taxonomy) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F8FAFC]">
        <span
          aria-busy="true"
          className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#0B162C]"
        />
      </div>
    );
  }

  const certId = certNumber(
    displayName,
    summaryMemo.stars + completed * 3,
    summaryMemo.nodesMastered,
  );
  void summary;
  void chainProgress;
  void refreshStars;
  void countNodeStars;
  void BRAND;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F8FAFC]">
      {/* 顶部条 */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.18em] text-[#94A3B8] uppercase">
            {isEn ? "Dream Classroom × Open Education" : tw("梦想课堂 × 开放教育")}
          </p>
          <h1 className="mt-0.5 truncate font-serif text-[19px] leading-tight text-[#0F172A]">
            {isEn ? "Result Report" : tw("学习成果报告")}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 font-mono text-[11px] text-[#334155]">
            {certId}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2.5 text-[11.5px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
          >
            <Printer size={12} strokeWidth={2.2} />
            {isEn ? "Print" : tw("打印")}
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="no-print inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2.5 text-[11.5px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
          >
            <Download size={12} strokeWidth={2.2} />
            PDF
          </button>
        </div>
      </header>

      {/* 主体：两栏 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:overflow-hidden">
        {/* ── 左栏：三大认知维度 ── */}
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto lg:overflow-hidden">
          {/* 雷达 + 条形 */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A]">
              {isEn ? "Three Core Cognitive Dimensions" : tw("三大核心认知维度")}
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#64748B]">
              {isEn
                ? "Scores come from how far you got in each flagship topic: watching the film, driving the interactive canvas, and how many situational questions you answered correctly."
                : tw(
                    "分数来自你在每个标杆专题里的真实进度：看过短片、动过手、以及三道情境题答对了几道。",
                  )}
            </p>

            <div className="mt-4 grid grid-cols-1 items-center gap-5 sm:grid-cols-[190px_minmax(0,1fr)]">
              <Radar scores={scores} isEn={isEn} />
              <div className="space-y-3.5">
                {DIMENSIONS.map((d) => {
                  const v = scores[d.key];
                  return (
                    <div key={d.key}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12.5px] font-medium text-[#0F172A]">
                          {isEn ? d.en : tw(d.zhCN)}
                        </span>
                        <span className="font-mono text-[13px] font-semibold tabular-nums text-[#0F172A]">
                          {v}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#F1F5F9]">
                        <div
                          className="h-full rounded-full transition-[width] duration-700"
                          style={{ width: `${v}%`, backgroundColor: d.color }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
                        {isEn ? d.descEn : tw(d.descZh)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 三个标杆专题的星星与徽章 */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A]">
              {isEn ? "Flagship Topics" : tw("标杆专题")}
              <span className="ml-1.5 text-[12px] font-normal text-[#64748B]">
                ({completed}/{FLAGSHIP_TOPIC_IDS.length})
              </span>
            </h2>
            <div className="mt-3 space-y-2">
              {topicRows.map(({ id, progress, stars }) => {
                const ed = FLAGSHIP_EDITORIALS[id];
                return (
                  <Link
                    key={id}
                    href={`/lab?topic=${encodeURIComponent(id)}`}
                    className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] px-3 py-2 transition-colors hover:bg-[#F8FAFC]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-[#0F172A]">
                        {isEn ? ed.anchor.en : tw(ed.anchor.zhCN)}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-[#94A3B8]">
                        {isEn
                          ? `film ${progress.watched ? "✓" : "—"} · lab ${progress.touched ? "✓" : "—"} · ${progress.correct}/3 correct`
                          : tw(
                              `短片 ${progress.watched ? "✓" : "—"} · 交互 ${progress.touched ? "✓" : "—"} · 答对 ${progress.correct}/3`,
                            )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      {[0, 1, 2].map((s) => (
                        <Star
                          key={s}
                          size={12}
                          strokeWidth={2.4}
                          className={
                            s < stars
                              ? "fill-[#C59B38] text-[#C59B38]"
                              : "text-[#E2E8F0]"
                          }
                        />
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── 右栏：国际能力对标 + 证书 ── */}
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto lg:overflow-hidden">
          {/* 对标表 */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A]">
              {isEn
                ? "Curriculum & International Benchmarks"
                : tw("大纲与国际能力对标参考")}
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#64748B]">
              {isEn
                ? "This is a thinking-level ruler, not a scoreboard. It shows where each topic's reasoning sits relative to AMC, AP and IB."
                : tw(
                    "这是**思维层级刻度**，不是分数榜——它标出每个专题的推理方式对应 AMC / AP / IB 的哪一段。",
                  )}
            </p>

            <div className="mt-3.5 space-y-2.5">
              {BENCHMARKS.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-[#E2E8F0] p-3"
                >
                  <p className="text-[12.5px] font-semibold text-[#0F172A]">
                    {isEn ? b.en : tw(b.zhCN)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    {isEn ? b.cnEn : tw(b.cnZh)}
                  </p>
                  <dl className="mt-2 space-y-1">
                    <div className="flex gap-2 text-[11px]">
                      <dt className="w-14 shrink-0 font-mono text-[#94A3B8]">AMC</dt>
                      <dd className="min-w-0 text-[#334155]">{b.amc}</dd>
                    </div>
                    <div className="flex gap-2 text-[11px]">
                      <dt className="w-14 shrink-0 font-mono text-[#94A3B8]">AP</dt>
                      <dd className="min-w-0 text-[#334155]">{b.ap}</dd>
                    </div>
                    <div className="flex gap-2 text-[11px]">
                      <dt className="w-14 shrink-0 font-mono text-[#94A3B8]">IB</dt>
                      <dd className="min-w-0 text-[#334155]">{b.ib}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>

          {/* 证书 */}
          <div className="overflow-hidden rounded-2xl border border-[#0B162C] bg-white">
            <div className="bg-[#0B162C] px-6 py-4 text-white">
              <p className="text-[10px] tracking-[0.2em] text-white/55 uppercase">
                {isEn ? "Certificate of Completion" : tw("结业证书")}
              </p>
              <p className="mt-1 font-serif text-[19px] leading-tight">
                {isEn ? "Everything is Math" : tw("一切皆数学")}
              </p>
              <p className="mt-0.5 text-[11px] text-white/55">
                {DREAM_CLASSROOM.name}
                {isEn
                  ? " (Houhai, Shenzhen Bay HQ)"
                  : tw(`（${DREAM_CLASSROOM.hqLabel}）`)}
              </p>
            </div>
            <div className="px-6 py-4">
              <p className="text-[11.5px] text-[#334155]">
                {isEn ? "This certifies that" : tw("兹证明")}
              </p>
              <p className="mt-0.5 font-serif text-[21px] leading-tight text-[#0F172A]">
                {displayName}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[#334155]">
                {isEn
                  ? `has completed ${completed} of ${FLAGSHIP_TOPIC_IDS.length} flagship topics — each with a sound-and-light film, a hands-on canvas and three situational questions — and scored ${scores.modeling} / ${scores.calibration} / ${scores.transfer} on abstract modeling, intuition calibration and interdisciplinary transfer.`
                  : tw(
                      `已完成 ${FLAGSHIP_TOPIC_IDS.length} 个标杆专题中的 ${completed} 个——每个专题都包含一段声画短片、一次动手交互与三道情境思考题——并在抽象建模力、直觉校准力、跨学科迁移力上分别取得 ${scores.modeling} / ${scores.calibration} / ${scores.transfer} 分。`,
                    )}
              </p>

              <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricCard
                  Icon={Globe2}
                  value={String(coverage.total)}
                  label={isEn ? "knowledge nodes" : tw("个知识点")}
                  accent="#0B162C"
                />
                <MetricCard
                  Icon={Star}
                  value={String(summaryMemo.stars + completed * 3)}
                  label={isEn ? "stars" : tw("颗星")}
                  accent="#C59B38"
                />
                <MetricCard
                  Icon={TrendingUp}
                  value={String(summaryMemo.nodesMastered)}
                  label={isEn ? "mastered" : tw("个精通")}
                  accent="#1D4ED8"
                />
                <MetricCard
                  Icon={Award}
                  value={String(summaryMemo.badges)}
                  label={isEn ? "badges" : tw("枚徽章")}
                  accent="#8A6A20"
                />
              </div>
            </div>
          </div>

          {/* 数据来源 */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <h2 className="text-[12.5px] font-semibold text-[#0F172A]">
              {isEn ? "Data Provenance" : tw("数据来源")}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-[#334155]">
              {isEn
                ? "Concept definitions, exercises and hints come from OpenStax College Algebra, OpenStax Statistics, Khan Academy exercises and the cn-k12 knowledge graph — every entry is traceable to a repository path."
                : tw(
                    "概念定义、练习与提示来自 OpenStax College Algebra、OpenStax Statistics、Khan Academy 题库与 cn-k12 知识图谱——每一条都可追溯到仓库路径。",
                  )}
            </p>
            <p className="mt-2 font-mono text-[10px] text-[#94A3B8]">
              openstax/osbooks-college-algebra-bundle · openstax/osbooks-statistics ·
              Khan/khan-exercises · haojing8312/cn-k12-math-knowledge-graph
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── 雷达图 ───────────────────────────────────────────────────── */

function Radar({
  scores,
  isEn,
}: {
  scores: { modeling: number; calibration: number; transfer: number };
  isEn: boolean;
}) {
  const size = 170;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 26;
  const values = [scores.modeling, scores.calibration, scores.transfer];

  const point = (i: number, v: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const r = (Math.max(0, Math.min(100, v)) / 100) * radius;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  };

  const polygon = values
    .map((v, i) => {
      const p = point(i, v);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={isEn ? "cognitive radar" : "认知能力雷达"}
      className="mx-auto shrink-0"
    >
      {/* 网格 */}
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon
          key={k}
          points={values
            .map((_, i) => {
              const p = point(i, k * 100);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="1"
        />
      ))}
      {[0, 1, 2].map((i) => {
        const p = point(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#E2E8F0"
            strokeWidth="1"
          />
        );
      })}

      {/* 数据多边形 */}
      <polygon points={polygon} fill="rgba(197,155,56,0.22)" stroke="#C59B38" strokeWidth="1.8" />
      {values.map((v, i) => {
        const p = point(i, v);
        return <circle key={i} cx={p.x} cy={p.y} r="3.4" fill="#C59B38" />;
      })}

      {/* 轴标签 */}
      {DIMENSIONS.map((d, i) => {
        const p = point(i, 128);
        return (
          <text
            key={d.key}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="9"
            fill="#64748B"
          >
            {isEn
              ? ["Modeling", "Calibration", "Transfer"][i]
              : ["建模", "校准", "迁移"][i]}
          </text>
        );
      })}
    </svg>
  );
}

/* ── 指标卡 ───────────────────────────────────────────────────── */

function MetricCard({
  Icon,
  value,
  label,
  accent,
}: {
  Icon: typeof Globe2;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
      <div className="flex items-center gap-1.5">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}12`, color: accent }}
        >
          <Icon size={12} strokeWidth={2.2} />
        </span>
        <p className="truncate text-[10px] tracking-[0.08em] text-[#64748B] uppercase">
          {label}
        </p>
      </div>
      <p
        className="mt-1.5 text-[20px] leading-none font-semibold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  );
}
