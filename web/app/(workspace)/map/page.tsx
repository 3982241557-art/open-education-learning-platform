"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  FlaskConical,
  Lock,
  Play,
  Star,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import { cn } from "@/lib/cn";
import { FLAGSHIP_EDITORIALS } from "@/lib/flagship-editorial";
import { FLAGSHIP_TOPIC_IDS } from "@/lib/flagship-topics";
import {
  countCompletedTopics,
  readFlagshipProgress,
} from "@/lib/flagship-progress";
import { useTraditional } from "@/lib/use-bilingual";

/**
 * 专题知识地图（/map）
 * ==================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────────────────────┐
 *     │  [ 数学 · 一切皆数学 ]  [ 语文 · 中国文化通识（筹备中） ] │
 *     ├────────────────────────────────────────────────────────┤
 *     │  ▶ 含声画短片 · 可交互 —— 三个标杆专题（最醒目置顶）   │
 *     │   [ 舒适区的几何学 ] [ 一尺之棰 ] [ 直觉为何总在撒谎 ]  │
 *     ├────────────────────────────────────────────────────────┤
 *     │  大纲板块（干净路线卡片，不画交叉线）                   │
 *     │  函数与变化 · 数列与无穷 · 概率与不确定性 ·            │
 *     │  几何与空间秩序 · 代数与逻辑结构                        │
 *     └────────────────────────────────────────────────────────┘
 *
 * 滚动纪律
 * --------
 *
 * 全站**唯一**可内部滚动的页面。其余页面严格 100vh 一屏。
 *
 * ⛔ **零 GeoGebra**。这条地图上的每一个可点节点都是纯本地
 *    Canvas + Web Audio 的交互，不需要任何外部脚本。
 */

/** 学科分栏。 */
type Subject = "math" | "chinese";

/** 大纲板块——按国内初高中数学核心大纲脉络划分。 */
interface Board {
  id: string;
  zhCN: string;
  zhTW: string;
  en: string;
  points: Array<{ zhCN: string; zhTW: string; en: string }>;
  /** 挂在哪个标杆专题上（可选）。 */
  flagship?: string;
}

const BOARDS: Board[] = [
  {
    id: "functions",
    zhCN: "函数与变化",
    zhTW: "函數與變化",
    en: "Functions and Change",
    flagship: "exp-comfort",
    points: [
      { zhCN: "函数的概念与表示", zhTW: "函數的概念與表示", en: "The concept and representation of a function" },
      { zhCN: "一次函数与二次函数", zhTW: "一次函數與二次函數", en: "Linear and quadratic functions" },
      { zhCN: "指数函数与对数函数", zhTW: "指數函數與對數函數", en: "Exponential and logarithmic functions" },
      { zhCN: "函数单调性与最值", zhTW: "函數單調性與最值", en: "Monotonicity and extrema" },
    ],
  },
  {
    id: "sequences",
    zhCN: "数列与无穷",
    zhTW: "數列與無窮",
    en: "Sequences and Infinity",
    flagship: "seq-zeno",
    points: [
      { zhCN: "数列的概念与递推", zhTW: "數列的概念與遞推", en: "Sequences and recursion" },
      { zhCN: "等差数列与求和", zhTW: "等差數列與求和", en: "Arithmetic sequences and sums" },
      { zhCN: "等比数列与求和", zhTW: "等比數列與求和", en: "Geometric sequences and sums" },
      { zhCN: "极限与无穷的概念", zhTW: "極限與無窮的概念", en: "Limits and the idea of infinity" },
    ],
  },
  {
    id: "probability",
    zhCN: "概率与不确定性",
    zhTW: "機率與不確定性",
    en: "Probability and Uncertainty",
    flagship: "prob-bayes",
    points: [
      { zhCN: "随机事件与样本空间", zhTW: "隨機事件與樣本空間", en: "Random events and sample spaces" },
      { zhCN: "古典概型与概率计算", zhTW: "古典概型與機率計算", en: "Classical probability and counting" },
      { zhCN: "条件概率", zhTW: "條件機率", en: "Conditional probability" },
      { zhCN: "独立性与全概率公式", zhTW: "獨立性與全機率公式", en: "Independence and the law of total probability" },
    ],
  },
  {
    id: "geometry",
    zhCN: "几何与空间秩序",
    zhTW: "幾何與空間秩序",
    en: "Geometry and Spatial Order",
    points: [
      { zhCN: "图形的性质与证明", zhTW: "圖形的性質與證明", en: "Properties and proofs of figures" },
      { zhCN: "全等相似与三角形", zhTW: "全等相似與三角形", en: "Congruence, similarity and triangles" },
      { zhCN: "圆与圆的性质", zhTW: "圓與圓的性質", en: "Circles and their properties" },
      { zhCN: "空间向量与立体几何", zhTW: "空間向量與立體幾何", en: "Spatial vectors and solid geometry" },
    ],
  },
  {
    id: "algebra",
    zhCN: "代数与逻辑结构",
    zhTW: "代數與邏輯結構",
    en: "Algebra and Logical Structure",
    points: [
      { zhCN: "整式与因式分解", zhTW: "整式與因式分解", en: "Polynomials and factorization" },
      { zhCN: "分式与方程", zhTW: "分式與方程", en: "Rational expressions and equations" },
      { zhCN: "不等式与不等式组", zhTW: "不等式與不等式組", en: "Inequalities and systems" },
      { zhCN: "命题与证明方法", zhTW: "命題與證明方法", en: "Propositions and methods of proof" },
    ],
  },
];

export default function MathMapPage() {
  const { locale } = useLocale();
  const { taxonomy, loading, failed } = useMathTaxonomy();

  const [subject, setSubject] = useState<Subject>("math");
  const [starTick, setStarTick] = useState(0);
  /** 画布缩放——全站唯一可缩放区域。 */
  const [zoom, setZoom] = useState(1);

  const tw = useTraditional();
  const isEn = locale === "en";

  const activeSubject: Subject = subject;

  /* ── 星星账本变化时刷新 ────────────────────────────────────── */

  useEffect(() => {
    const onUpdate = () => setStarTick((t) => t + 1);
    window.addEventListener("oe:flagship-progress-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("oe:flagship-progress-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  /* ── 单语挑选 ──────────────────────────────────────────────── */

  const pick = useCallback(
    (tr: { zhCN: string; zhTW: string; en: string }): string => {
      if (isEn) return tr.en;
      if (locale === "zh-TW") return tr.zhTW;
      return tr.zhCN;
    },
    [isEn, locale],
  );

  /* ── 标杆专题进度 ──────────────────────────────────────────── */

  const flagshipProgress = useMemo(
    () =>
      FLAGSHIP_TOPIC_IDS.map((id) => ({
        id,
        progress: readFlagshipProgress(id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [starTick],
  );

  const completedCount = useMemo(
    () => countCompletedTopics([...FLAGSHIP_TOPIC_IDS]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [starTick],
  );

  /* ── 加载态 ────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F8FAFC]">
        <span
          aria-busy="true"
          className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#0B162C]"
        />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F8FAFC] p-8 text-center">
        <p className="text-[14px] font-semibold text-[#0F172A]">
          {isEn ? "Math graph unavailable" : tw("数学图谱加载失败")}
        </p>
        <p className="max-w-md text-[12px] leading-relaxed text-[#334155]">
          {isEn
            ? "The taxonomy JSON could not be loaded. Please refresh the page."
            : tw("未能读取 math-taxonomy.json。请刷新页面重试。")}
        </p>
      </div>
    );
  }

  /* ── 语文预览（筹备中） ───────────────────────────────────── */

  if (subject === "chinese") {
    return <ChinesePreview isEn={isEn} onBack={() => setSubject("math")} />;
  }

  /* ── 主渲染 ────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC]">
      {/* 顶部：学科分栏 + 进度 */}
      <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-5 py-3">
        <div className="flex items-stretch rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
          <SubjectTab
            active={activeSubject === "math"}
            onClick={() => setSubject("math")}
            icon={<FlaskConical size={11} strokeWidth={2.4} />}
            label={isEn ? "Math · Everything is Math" : tw("数学 · 一切皆数学")}
          />
          <SubjectTab
            active={activeSubject === "chinese"}
            onClick={() => setSubject("chinese")}
            icon={<BookOpen size={11} strokeWidth={2.4} />}
            label={isEn ? "Chinese · Culture (in preparation)" : tw("语文 · 中国文化通识（筹备中）")}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* 缩放控件 */}
          <div className="flex items-center overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
              aria-label={isEn ? "Zoom out" : tw("缩小")}
              className="h-8 w-8 text-[15px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
            >
              −
            </button>
            <span className="w-12 text-center text-[11px] tabular-nums text-[#334155]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
              aria-label={isEn ? "Zoom in" : tw("放大")}
              className="h-8 w-8 text-[15px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] text-[#334155]">
            <Star
              size={11}
              strokeWidth={2.4}
              className={
                completedCount > 0
                  ? "fill-[#C59B38] text-[#C59B38]"
                  : "text-[#CBD5E1]"
              }
            />
            {isEn
              ? `${completedCount} / ${FLAGSHIP_TOPIC_IDS.length} complete`
              : tw(`已完成 ${completedCount} / ${FLAGSHIP_TOPIC_IDS.length} 个专题`)}
          </div>
          <Link
            href="/report"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0B162C] px-3 text-[11.5px] font-medium text-white transition-colors hover:bg-[#152a4d]"
          >
            {isEn ? "Capability report" : tw("能力评估报告")}
            <ChevronRight size={12} strokeWidth={2.4} />
          </Link>
        </div>
      </header>

      {/* 画布（全站唯一可滚动 + 可缩放区域） */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          style={{
            width: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
        <div className="mx-auto max-w-[1180px] px-6 py-8">
          {/* ══ 置顶区：三个标杆专题 ══ */}
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-[#0B162C] px-2.5 py-1 text-[10.5px] font-medium text-white">
                <Play size={10} strokeWidth={3} className="text-[#C59B38]" />
                {isEn ? "Sound-and-light film · interactive" : tw("含声画短片 · 可交互")}
              </span>
              <h2 className="text-[17px] font-semibold text-[#0F172A]">
                {isEn ? "Flagship topics" : tw("标杆专题")}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {flagshipProgress.map(({ id, progress }) => {
                const ed = FLAGSHIP_EDITORIALS[id];
                const stars =
                  (progress.watched ? 1 : 0) +
                  (progress.touched ? 1 : 0) +
                  (progress.correct >= 3 ? 1 : 0);
                return (
                  <Link
                    key={id}
                    href={`/lab?topic=${encodeURIComponent(id)}`}
                    className="group flex flex-col gap-3 rounded-xl border border-[#0B162C] bg-white p-4 transition-colors hover:border-[#C59B38]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium tracking-[0.12em] text-[#C59B38] uppercase">
                          {isEn ? ed.board.en : ed.board.zhCN}
                        </p>
                        <p className="mt-1 text-[14px] leading-snug font-semibold text-[#0F172A]">
                          {isEn ? ed.anchor.en : tw(ed.anchor.zhCN)}
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
                    </div>

                    <p className="font-serif text-[12.5px] leading-relaxed text-[#334155]">
                      {isEn ? ed.quote.en : tw(ed.quote.zhCN)}
                    </p>

                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {ed.tags[isEn ? "en" : "zhCN"].slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[10px] text-[#64748B]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ══ 大纲板块 ══ */}
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
              {isEn ? "Curriculum boards" : tw("大纲板块")}
              <span className="rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[10px] font-normal text-[#64748B]">
                {isEn ? "Open-source sourced" : tw("开源教材溯源")}
              </span>
            </h3>

            <div className="space-y-3">
              {BOARDS.map((board) => (
                <div
                  key={board.id}
                  className="rounded-xl border border-[#E2E8F0] bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-[13.5px] font-semibold text-[#0F172A]">
                      {pick(board)}
                    </h4>
                    {board.flagship ? (
                      <Link
                        href={`/lab?topic=${board.flagship}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-[10.5px] font-medium text-[#0B162C] transition-colors hover:bg-[#F8FAFC]"
                      >
                        <Play size={9} strokeWidth={3} className="text-[#C59B38]" />
                        {isEn ? "Open the flagship lab" : tw("进入标杆专题")}
                      </Link>
                    ) : null}
                  </div>

                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {board.points.map((pt) => (
                      <li
                        key={pt.en}
                        className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11.5px] leading-snug text-[#334155]"
                      >
                        {pick(pt)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* ══ 其余逻辑链（占位） ══ */}
          {taxonomy ? (
            <section className="mt-10">
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
                {isEn ? "Other logic chains" : tw("其余逻辑链")}
                <span className="rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[10px] font-normal text-[#64748B]">
                  {isEn ? "Coming soon" : tw("即将上线")}
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {taxonomy.chains.slice(0, 8).map((chain) => (
                  <div
                    key={chain.id}
                    className="rounded-lg border border-[#E2E8F0] bg-white p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[9.5px] font-bold text-[#64748B]">
                        {chain.no}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#334155]">
                        {isEn ? chain.nameEn : tw(chain.nameZh)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[#94A3B8]">
                      <Lock size={10} strokeWidth={2.4} />
                      {isEn
                        ? `${chain.nodeCount} lessons · in preparation`
                        : tw(`${chain.nodeCount} 节课 · 筹备中`)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}

/** 学科分栏按钮。 */
function SubjectTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors",
        active ? "bg-[#0B162C] text-white" : "text-[#334155] hover:bg-white",
      )}
    >
      <span className={active ? "text-[#C59B38]" : "text-[#94A3B8]"}>
        {icon}
      </span>
      {label}
    </button>
  );
}

/** 语文预览——筹备中，清晰的路线占位。 */
function ChinesePreview({
  isEn,
  onBack,
}: {
  isEn: boolean;
  onBack: () => void;
}) {
  const tw = useTraditional();
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-[#F8FAFC] p-6">
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-center gap-2">
          <BookOpen size={16} strokeWidth={2.2} className="text-[#0B162C]" />
          <h2 className="text-[15px] font-semibold text-[#0F172A]">
            {isEn ? "Chinese · Culture" : tw("语文 · 中国文化通识")}
          </h2>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#334155]">
          {isEn
            ? "The Chinese track is in preparation. Its course content is being curated from authentic open-source textbooks, and its interactive labs are still being built — so nothing half-finished is shown here yet."
            : tw(
                "语文线正在筹备中。课程内容正在从真实的开源教材中筛选整理，互动教具也在研发中——所以这里暂时不展示任何半成品。",
              )}
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
          <Lock size={12} strokeWidth={2.4} className="text-[#94A3B8]" />
          <span className="text-[11.5px] text-[#64748B]">
            {isEn ? "Coming soon" : tw("即将上线")}
          </span>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B162C] px-4 text-[12.5px] font-medium text-white"
        >
          <ChevronRight size={14} strokeWidth={2.2} className="rotate-180" />
          {isEn ? "Back to Math" : tw("返回数学")}
        </button>
      </div>
    </div>
  );
}
