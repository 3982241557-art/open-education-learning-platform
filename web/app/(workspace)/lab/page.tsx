"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Presentation,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/cn";
import CinemaStage from "@/components/lab/CinemaStage";
import TopicCanvas from "@/components/lab/TopicCanvas";
import { FLAGSHIP_EDITORIALS } from "@/lib/flagship-editorial";
import {
  FLAGSHIP_TOPIC_IDS,
  isFlagshipTopicId,
  loadFlagshipTopics,
  type FlagshipData,
  type FlagshipTopicId,
  type BiText,
} from "@/lib/flagship-topics";
import {
  markTouched,
  markWatched,
  readFlagshipProgress,
  recordQuiz,
} from "@/lib/flagship-progress";
import { useBilingual, useDynamicBilingual } from "@/lib/use-bilingual";
import { useTraditional } from "@/lib/use-bilingual";

/**
 * 专题学习台（/lab?topic=<id>）
 * ============================
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────┬───────────────────┐
 *     │  左 68% · 主舞台                          │  右 32% · 概念卡  │
 *     │  ┌────────────────────────────────────┐  │  大纲锚点          │
 *     │  │ 影院级短片舞台（84%）              │  │  跨学科标签        │
 *     │  │  #090C12 · MP4 或内置短片引擎      │  │  核心金句          │
 *     │  └────────────────────────────────────┘  │  数学本质（公式）  │
 *     │  ┌────────────────────────────────────┐  │  跨学科连接        │
 *     │  │ 行动条（16%）· 纯白               │  │  ─────────────    │
 *     │  │ [进入动手交互实验] [思维能力测评]   │  │  [读博客] [看PPT]  │
 *     │  └────────────────────────────────────┘  │                   │
 *     └──────────────────────────────────────────┴───────────────────┘
 *
 * 零滚动契约
 * ----------
 *
 * 严格 ``100vh`` 一屏无垂直滚动。交互实验层、测评层、博客层、PPT 层
 * 全部是**原地覆盖/弹出**——任何时候都不靠整页滚动容纳内容。
 *
 * ⛔ **零外部脚本**。所有视听与交互都是本地 Canvas 2D + Web Audio
 *    API——没有 GeoGebra、没有 CDN、没有超时窗口。
 */

/** 加载骨架。 */
function LabSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-[#F8FAFC]">
      <span
        aria-busy="true"
        className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#0B162C]"
      />
    </div>
  );
}

export default function LabPage() {
  return (
    <Suspense fallback={<LabSkeleton />}>
      <LabStage />
    </Suspense>
  );
}

function LabStage() {
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic") ?? "";
  const { locale } = useLocale();
  const isEn = locale === "en";
  const tw = useTraditional();
  const t = useBilingual();
  const dyn = useDynamicBilingual();

  /**
   * 把编辑层的 ``BiText``（zhCN/en）适配成全站双语钩子的形状。
   *
   * 编辑层用 ``zhCN`` 而不是 ``zh``——因为数据文件里本来就有
   * ``zhCN`` / ``zhTW`` / ``en`` 三列，字段名保持一致才不会在
   * 合流时到处做重命名。
   */
  const T = useCallback(
    (x: BiText) => t({ zh: x.zhCN, en: x.en }),
    [t],
  );

  /* ── 专题 ─────────────────────────────────────────────────── */
  const topicId: FlagshipTopicId | null = isFlagshipTopicId(topicParam)
    ? topicParam
    : null;
  const editorial = topicId ? FLAGSHIP_EDITORIALS[topicId] : null;

  /* ── 开源素材（可选） ─────────────────────────────────────── */
  const [data, setData] = useState<FlagshipData | null>(null);
  useEffect(() => {
    let alive = true;
    loadFlagshipTopics().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const openSource = useMemo(
    () => data?.topics.find((x) => x.id === topicId) ?? null,
    [data, topicId],
  );

  /* ── 视图层 ───────────────────────────────────────────────── */
  /** "film" | "lab" */
  const [view, setView] = useState<"film" | "lab">("film");
  /** "quiz" | "blog" | "ppt" | null */
  const [overlay, setOverlay] = useState<"quiz" | "blog" | "ppt" | null>(null);
  const [stars, setStars] = useState(0);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    setView("film");
    setOverlay(null);
    setSlide(0);
    if (topicId) {
      const p = readFlagshipProgress(topicId);
      setStars(
        (p.watched ? 1 : 0) + (p.touched ? 1 : 0) + (p.correct >= 3 ? 1 : 0),
      );
    }
  }, [topicId]);

  const refreshStars = useCallback(() => {
    if (!topicId) return;
    const p = readFlagshipProgress(topicId);
    setStars(
      (p.watched ? 1 : 0) + (p.touched ? 1 : 0) + (p.correct >= 3 ? 1 : 0),
    );
  }, [topicId]);

  /* ── 无专题 → 引导 ────────────────────────────────────────── */

  if (!topicId || !editorial) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#F8FAFC] p-8 text-center">
        <div>
          <p className="text-[15px] font-semibold text-[#0F172A]">
            {isEn ? "Pick a flagship topic" : tw("先从学习地图里选一个标杆专题")}
          </p>
          <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-[#334155]">
            {isEn
              ? "Three flagship topics ship with a sound-and-light short film, a zero-failure interactive canvas and three situational questions."
              : tw(
                  "三个标杆专题都自带声画短片、零故障交互画布与三道情境思考题。",
                )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {FLAGSHIP_TOPIC_IDS.map((id) => (
            <Link
              key={id}
              href={`/lab?topic=${id}`}
              className="rounded-lg bg-[#0B162C] px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-[#152a4d]"
            >
              {dyn(FLAGSHIP_EDITORIALS[id].anchor.zhCN, FLAGSHIP_EDITORIALS[id].anchor.en)}
            </Link>
          ))}
          <Link
            href="/map"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-[12.5px] font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
          >
            <ArrowLeft size={14} strokeWidth={2.2} />
            {isEn ? "Back to map" : tw("返回学习地图")}
          </Link>
        </div>
      </div>
    );
  }

  /* ── 主渲染 ───────────────────────────────────────────────── */

  const slides = editorial.ppt.slides;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC]">
      {/* ══ 主体：68 / 32 ══ */}
      <div
        data-oe-lab-grid
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,68fr)_minmax(0,32fr)]"
      >
        {/* ── 左 68% · 主舞台 ── */}
        <section
          data-oe-lab-stage
          className="flex min-h-0 flex-col gap-3"
        >
          {/* 影院级短片舞台（84%）/ 交互画布（100% 覆盖） */}
          <div
            data-oe-lab-cinema
            className="relative min-h-0 flex-[5.25] overflow-hidden rounded-xl border border-[#0B162C]"
          >
            {/* 短片层 */}
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-500",
                view === "film" ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <CinemaStage
                topicId={topicId}
                isEn={isEn}
                onWatched={() => {
                  markWatched(topicId);
                  refreshStars();
                }}
              />
            </div>

            {/* 交互画布层 */}
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-500",
                view === "lab" ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <TopicCanvas
                topicId={topicId}
                isEn={isEn}
                onTouch={() => {
                  markTouched(topicId);
                  refreshStars();
                }}
              />
            </div>

            {/* 返回短片 */}
            {view === "lab" ? (
              <button
                type="button"
                onClick={() => setView("film")}
                className="absolute right-4 top-4 z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/20 bg-black/45 px-3 text-[11.5px] font-medium text-white/90 transition-colors hover:border-[#C59B38]/70 hover:text-white"
              >
                <ChevronLeft size={13} strokeWidth={2.4} />
                {isEn ? "Back to film" : tw("返回短片")}
              </button>
            ) : null}
          </div>

          {/* 行动条（16%） */}
          <div
            data-oe-lab-actions
            className="flex min-h-0 flex-[1] items-center justify-center gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3"
          >
            <button
              type="button"
              onClick={() => setView(view === "lab" ? "film" : "lab")}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-lg px-6 text-[13px] font-medium transition-colors",
                view === "lab"
                  ? "bg-white text-[#0B162C] ring-1 ring-[#0B162C]"
                  : "bg-[#0B162C] text-white hover:bg-[#152a4d]",
              )}
            >
              <Sparkles size={15} strokeWidth={2.2} />
              {isEn ? "Enter the interactive lab" : tw("进入动手交互实验")}
            </button>
            <button
              type="button"
              onClick={() => setOverlay("quiz")}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#0B162C] px-6 text-[13px] font-medium text-[#0B162C] transition-colors hover:bg-[#F8FAFC]"
            >
              <Star size={15} strokeWidth={2.2} />
              {isEn ? "Thinking assessment" : tw("思维能力测评")}
            </button>
          </div>
        </section>

        {/* ── 右 32% · 关键概念卡 ── */}
        <aside
          data-oe-lab-concept
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {/* 大纲锚点 */}
            <p className="text-[10px] font-medium tracking-[0.14em] text-[#94A3B8] uppercase">
              {isEn ? "Curriculum anchor" : tw("大纲知识点锚点")}
            </p>
            <p className="mt-1.5 text-[13.5px] font-semibold text-[#0F172A]">
              {T(editorial.anchor)}
            </p>

            {/* 跨学科标签 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {editorial.tags[isEn ? "en" : "zhCN"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[10.5px] text-[#334155]"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="my-4 h-px bg-[#E2E8F0]" />

            {/* 核心金句 */}
            <p className="text-[10px] font-medium tracking-[0.14em] text-[#94A3B8] uppercase">
              {isEn ? "Core line" : tw("核心金句")}
            </p>
            <p className="mt-1.5 font-serif text-[14.5px] leading-relaxed text-[#0F172A]">
              {T(editorial.quote)}
            </p>

            <div className="my-4 h-px bg-[#E2E8F0]" />

            {/* 数学本质 */}
            <p className="text-[10px] font-medium tracking-[0.14em] text-[#94A3B8] uppercase">
              {isEn ? "Mathematical essence" : tw("数学本质")}
            </p>
            <div className="mt-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3">
              <Formula latex={editorial.formula} />
              <p className="mt-2 text-[12px] leading-relaxed text-[#334155]">
                {T(editorial.formulaNote)}
              </p>
            </div>

            <div className="my-4 h-px bg-[#E2E8F0]" />

            {/* 跨学科连接 */}
            <p className="text-[10px] font-medium tracking-[0.14em] text-[#94A3B8] uppercase">
              {isEn ? "Cross-disciplinary link" : tw("跨学科连接")}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#334155]">
              {T(editorial.connection)}
            </p>

            {/* 开源素材标注 */}
            {openSource ? (
              <p className="mt-4 border-t border-[#E2E8F0] pt-3 text-[10.5px] leading-relaxed text-[#94A3B8]">
                {isEn
                  ? `Open-source material: ${openSource.sources.openstax?.title ?? "OpenStax"} · ${openSource.sources.khan?.length ?? 0} exercises`
                  : tw(
                      `开源素材：${openSource.sources.openstax?.title ?? "OpenStax"} · ${openSource.sources.khan?.length ?? 0} 道开源练习`,
                    )}
              </p>
            ) : null}
          </div>

          {/* 延伸入口 */}
          <div className="flex shrink-0 gap-2 border-t border-[#E2E8F0] p-4">
            <button
              type="button"
              onClick={() => setOverlay("blog")}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] text-[12px] font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
            >
              <BookOpen size={14} strokeWidth={2.1} />
              {isEn ? "Read the essay" : tw("阅读深度博客")}
            </button>
            <button
              type="button"
              onClick={() => {
                setSlide(0);
                setOverlay("ppt");
              }}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] text-[12px] font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
            >
              <Presentation size={14} strokeWidth={2.1} />
              {isEn ? "Browse the deck" : tw("浏览精炼 PPT")}
            </button>
          </div>
        </aside>
      </div>

      {/* ══ 测评层 ══ */}
      {overlay === "quiz" ? (
        <QuizOverlay
          topicId={topicId}
          isEn={isEn}
          onClose={() => {
            setOverlay(null);
            refreshStars();
          }}
        />
      ) : null}

      {/* ══ 博客层 ══ */}
      {overlay === "blog" ? (
        <Drawer
          title={T(editorial.blog.title)}
          onClose={() => setOverlay(null)}
          footer={null}
        >
          <div className="space-y-4">
            {editorial.blog.paragraphs[isEn ? "en" : "zhCN"].map((p, i) => (
              <p
                key={i}
                className="text-[13.5px] leading-[1.85] text-[#1E293B]"
              >
                {p}
              </p>
            ))}
          </div>
        </Drawer>
      ) : null}

      {/* ══ PPT 层 ══ */}
      {overlay === "ppt" ? (
        <Drawer
          title={T(editorial.ppt.title)}
          onClose={() => setOverlay(null)}
          footer={
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSlide((s) => Math.max(0, s - 1))}
                disabled={slide === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 text-[12px] font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
              >
                <ChevronLeft size={13} strokeWidth={2.4} />
                {isEn ? "Previous" : tw("上一页")}
              </button>
              <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
                {slide + 1} / {slides.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSlide((s) => Math.min(slides.length - 1, s + 1))
                }
                disabled={slide === slides.length - 1}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 text-[12px] font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
              >
                {isEn ? "Next" : tw("下一页")}
                <ChevronRight size={13} strokeWidth={2.4} />
              </button>
            </div>
          }
        >
          {slides[slide] ? (
            <div>
              <h3 className="text-[17px] font-semibold text-[#0F172A]">
                {T(slides[slide].title)}
              </h3>
              <ul className="mt-4 space-y-3">
                {slides[slide].bullets[isEn ? "en" : "zhCN"].map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-2.5 text-[13.5px] leading-relaxed text-[#1E293B]"
                  >
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C59B38]" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Drawer>
      ) : null}
    </div>
  );
}

/* ── 公式渲染（KaTeX · 本地打包 · 零网络） ─────────────────────── */

function Formula({ latex }: { latex: string }) {
  const html = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const katex = require("katex");
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
        output: "html",
      }) as string;
    } catch {
      return null;
    }
  }, [latex]);

  if (!html) {
    return (
      <p className="font-mono text-[12.5px] text-[#0F172A]">{latex}</p>
    );
  }
  return (
    <div
      className="overflow-x-auto text-[#0F172A] [&_.katex]:text-[15px]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* ── 抽屉 ─────────────────────────────────────────────────────── */

function Drawer({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B162C]/45 p-6">
      <div className="flex h-full max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-[16px] font-semibold text-[#0F172A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="shrink-0 text-[#94A3B8] transition-colors hover:text-[#0F172A]"
          >
            <X size={18} strokeWidth={2.1} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-[#E2E8F0] px-6 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* ── 测评层 ───────────────────────────────────────────────────── */

function QuizOverlay({
  topicId,
  isEn,
  onClose,
}: {
  topicId: FlagshipTopicId;
  isEn: boolean;
  onClose: () => void;
}) {
  const tw = useTraditional();
  const editorial = FLAGSHIP_EDITORIALS[topicId];
  const questions = editorial.questions;

  const [picked, setPicked] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const correct = useMemo(
    () =>
      questions.reduce(
        (acc, q, i) => acc + (picked[i] === q.answer ? 1 : 0),
        0,
      ),
    [picked, questions],
  );

  const submit = useCallback(() => {
    recordQuiz(topicId, correct, questions.length);
    setSubmitted(true);
  }, [correct, questions.length, topicId]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B162C]/45 p-6">
      <div className="flex h-full max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E2E8F0] px-6 py-4">
          <div>
            <p className="text-[10px] font-medium tracking-[0.14em] text-[#94A3B8] uppercase">
              {isEn ? "Intuition vs mathematics" : tw("直觉 vs 数学")}
            </p>
            <h2 className="mt-1 text-[16px] font-semibold text-[#0F172A]">
              {isEn
                ? "Three situational questions"
                : tw("三道情境思考题")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="shrink-0 text-[#94A3B8] transition-colors hover:text-[#0F172A]"
          >
            <X size={18} strokeWidth={2.1} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {questions.map((q, qi) => {
            const opts = q.options[isEn ? "en" : "zhCN"];
            const answered = picked[qi] !== undefined;
            return (
              <section key={qi}>
                <p className="text-[10px] font-medium tracking-[0.14em] text-[#C59B38] uppercase">
                  {String(qi + 1).padStart(2, "0")}
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#0F172A]">
                  {isEn ? q.stem.en : q.stem.zhCN}
                </p>
                <div className="mt-3 space-y-2">
                  {opts.map((opt, oi) => {
                    const selected = picked[qi] === oi;
                    const isRight = oi === q.answer;
                    const show = submitted && (selected || isRight);
                    return (
                      <button
                        key={oi}
                        type="button"
                        disabled={submitted}
                        onClick={() =>
                          setPicked((prev) => ({ ...prev, [qi]: oi }))
                        }
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-[12.5px] transition-colors",
                          show && isRight
                            ? "border-[#C59B38] bg-[#FDF8EC] text-[#0F172A]"
                            : show && selected
                              ? "border-[#C1553A] bg-[#FDF3F1] text-[#0F172A]"
                              : selected
                                ? "border-[#0B162C] bg-[#F8FAFC] text-[#0F172A]"
                                : "border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC]",
                          !submitted && "hover:border-[#0B162C]/40",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
                            selected
                              ? "border-[#0B162C] bg-[#0B162C] text-white"
                              : "border-[#CBD5E1] text-transparent",
                          )}
                        >
                          ●
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {submitted ? (
                  <p className="mt-2.5 border-l-2 border-[#C59B38] pl-3 text-[12px] leading-relaxed text-[#334155]">
                    {isEn ? q.explain.en : q.explain.zhCN}
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#E2E8F0] px-6 py-3">
          <span className="text-[12px] text-[#64748B]">
            {submitted
              ? isEn
                ? `${correct} of ${questions.length} correct`
                : tw(`答对 ${correct} / ${questions.length} 题`)
              : isEn
                ? `${Object.keys(picked).length} of ${questions.length} answered`
                : tw(`已选 ${Object.keys(picked).length} / ${questions.length} 题`)}
          </span>
          {submitted ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg bg-[#0B162C] px-5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#152a4d]"
            >
              {isEn ? "Done" : tw("完成")}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={Object.keys(picked).length < questions.length}
              className="inline-flex h-9 items-center rounded-lg bg-[#0B162C] px-5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#152a4d] disabled:opacity-40"
            >
              {isEn ? "Submit" : tw("提交")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
