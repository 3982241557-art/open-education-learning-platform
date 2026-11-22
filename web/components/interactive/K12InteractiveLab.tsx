"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Check,
  Eraser,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { InteractiveLab } from "@/lib/interactive-lab";
import { cn } from "@/lib/cn";
import { useLocale } from "@/context/LocaleContext";
import {
  LiteraryLab,
  PrimaryMathLab,
  SecondaryMathLab,
} from "@/components/interactive/K12StageLabs";
import MathManipulativeEngine from "@/components/interactive/MathManipulativeEngine";
import ChineseCultureLab from "@/components/interactive/ChineseCultureLab";
import { useLabProgress } from "@/components/interactive/useLabProgress";

/**
 * OE 原生互动动画实验室
 * ========================
 *
 * 纯前端 React + framer-motion + SVG——**零后端依赖**。
 *
 * 设计原则
 * --------
 *
 * 1. **零门槛**：打开就能玩，不需要任何配置；
 * 2. **秒开**：全部是代码绘制的 SVG，没有图片素材；
 * 3. **分龄**：小学圆润活泼，初高中利落极客；
 * 4. **有反馈**：每个玩具都要给出「对了 / 再试一次」的即时反馈。
 *
 * 三种分学段实验台
 * -----------------
 *
 * ====================  ==========================================
 * 组件                  适用
 * ====================  ==========================================
 * ``HanziLab``          小学语文 —— 生字笔顺（hanzi-writer）
 * ``PoemLab``           小学语文 —— 分句图解
 * ``LiteraryLab``       初高中语文 —— 名篇精读与意象赏析
 * ``PrimaryMathLab``    小学数学 —— 数轴 / 凑十方块 / 分数 / 面积 / 平移
 * ``SecondaryMathLab``  初高中数学 —— 函数图像 / 动态几何 / 概率 / 代数
 * ====================  ==========================================
 *
 * ⛔ **红线**：初高中语文**绝不**出现笔顺描红；
 *    小学数学**绝不**出现初高中的函数滑块。
 */

/** 组件属性。 */
export interface K12InteractiveLabProps {
  /** 实验室配置。 */
  lab: InteractiveLab;
  /** 学段——决定视觉语言。 */
  stage?: "primary" | "junior" | "senior";
  /** 额外类名。 */
  className?: string;
}

/** 视觉风格。 */
interface LabStyle {
  /** 卡片圆角。 */
  radius: string;
  /** 强调色。 */
  accent: string;
  /** 按钮类名。 */
  button: string;
  /** 标题字号。 */
  titleSize: string;
}

function styleOf(playful: boolean): LabStyle {
  if (playful) {
    return {
      radius: "rounded-2xl",
      accent: "#2563eb",
      button:
        "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-transform active:scale-95",
      titleSize: "text-[14px] font-bold",
    };
  }
  return {
    radius: "rounded-xl",
    accent: "#1d4ed8",
    button:
      "rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-colors",
    titleSize: "text-[13px] font-semibold",
  };
}

export default function K12InteractiveLab({
  lab,
  stage = "junior",
  className,
}: K12InteractiveLabProps) {
  const playful = stage === "primary";
  const style = styleOf(playful);
  const { tk } = useLocale();

  return (
    <section
      className={cn(
        "border border-[var(--border)] bg-white",
        style.radius,
        className,
      )}
    >
      {/* ── 头部 ── */}
      <header
        className={cn(
          "flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3",
          playful ? "bg-[#FFFEFA]" : "bg-white",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white",
            playful ? "rounded-xl" : "rounded-lg",
          )}
          style={{ background: style.accent }}
        >
          <Sparkles size={14} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "truncate tracking-[-0.01em] text-[var(--foreground)]",
              style.titleSize,
            )}
          >
            {tk("episode.playLab")} · {lab.title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
            {tk("lab.hint")}
          </p>
        </div>
      </header>

      {/* ── 主体：按 kind 分发 ── */}
      <div className="p-4">
        {renderLab(lab, playful, style)}
      </div>
    </section>
  );
}

/**
 * 按 ``kind`` 分发到对应的实验台。
 *
 * 分学段的三个实验台（``literary`` / 小学数学 / 初高中数学）
 * 各自成文件，避免主组件无限膨胀。
 */
function renderLab(
  lab: InteractiveLab,
  playful: boolean,
  style: LabStyle,
) {
  switch (lab.kind) {
    /* ── 小学语文 ── */
    case "hanzi":
      return <HanziLab lab={lab} playful={playful} style={style} />;
    case "poem":
      return <PoemLab lab={lab} playful={playful} style={style} />;

    /* ── 初高中语文 ── */
    case "literary":
      return <LiteraryLab lab={lab} />;

    /* ── 小学数学 ── */
    case "numberline":
    case "ratio":
    case "area":
      return <PrimaryMathLab lab={lab} />;
    case "blocks":
    case "fraction":
    case "transform":
      return <PrimaryMathLab lab={lab} />;

    /* ── 初高中数学 ── */
    case "function":
    case "geometry":
    case "algebra":
    case "probability":
      return <SecondaryMathLab lab={lab} />;

    /* ── Module 5 · GitHub 开源数学教具 ── */
    case "protractor":
    case "functionLab":
    case "chartLab":
    case "decimalBlocks":
    case "fractionDisc":
    case "balanceScale":
      return <MathManipulativePanel lab={lab} />;

    /* ── Module 5 · 语文真实文化互动台 ── */
    case "culture":
      return <ChineseCulturePanel lab={lab} />;

    /* ── 兼容旧 kind ── */
    case "symmetry":
      return <SymmetryLab lab={lab} playful={playful} style={style} />;

    default:
      return (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-700">
          本讲的互动实验室正在按教材单元校准。回到视频完成精讲，课后测验会覆盖本讲要点。
        </p>
      );
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Module 5 · GitHub 开源教具的桥接层
 * ────────────────────────────────────────────────────────────────── */

/**
 * 数学动态教具的桥接层。
 *
 * 把课程数据里的 ``lab.manipulative`` 转成引擎需要的配置，
 * 并把教具的操作进度实时上报给 AI 伴学。
 */
function MathManipulativePanel({ lab }: { lab: InteractiveLab }) {
  const { markDone } = useLabProgress({
    kind: lab.kind,
    title: lab.title,
    taskLabel: "教具探究",
    tasks: [{ label: lab.title, done: false }],
  });

  const config = useMemo(
    () => ({
      kind: lab.manipulative?.kind ?? ("protractor" as const),
      title: lab.title,
      angle: lab.manipulative?.angle ?? lab.params?.angle ?? 40,
      slope: lab.manipulative?.slope ?? lab.params?.a ?? 2,
      intercept: lab.manipulative?.intercept ?? lab.params?.b ?? 1,
      fnType:
        lab.manipulative?.fnType ??
        (lab.params?.type === "inverse"
          ? ("inverse" as const)
          : lab.params?.type === "linear"
            ? ("linear" as const)
            : ("quadratic" as const)),
      data: lab.manipulative?.data,
      target: lab.manipulative?.target ?? lab.params?.count ?? 10,
      parts: lab.manipulative?.parts ?? lab.params?.denominator ?? 4,
      start: lab.manipulative?.start ?? -5,
      step: lab.manipulative?.step ?? 1,
      leftWeights: lab.manipulative?.leftWeights,
      rightWeights: lab.manipulative?.rightWeights,
    }),
    [lab],
  );

  return (
    <MathManipulativeEngine
      config={config}
      onProgress={(message, done) => {
        if (done > 0) markDone(0);
      }}
    />
  );
}

/**
 * 语文文化互动台的桥接层。
 */
function ChineseCulturePanel({ lab }: { lab: InteractiveLab }) {
  const { markDone } = useLabProgress({
    kind: "culture",
    title: lab.title,
    taskLabel: "本课生字描红",
    tasks: (lab.chars ?? []).map((char) => ({ label: char, done: false })),
  });

  const [traced, setTraced] = useState<Set<number>>(new Set());

  return (
    <ChineseCultureLab
      config={{
        stage: lab.culture?.stage ?? "primary",
        title: lab.title,
        chars: lab.chars,
        pinyin: lab.pinyin,
        excerpt: lab.culture?.excerpt,
        workTitle: lab.culture?.workTitle,
        author: lab.culture?.author,
        dynasty: lab.culture?.dynasty,
        keywords: lab.culture?.keywords,
        etymology: lab.culture?.etymology,
      }}
      onTrace={(_char, index) => {
        setTraced((prev) => {
          if (prev.has(index)) return prev;
          const next = new Set(prev).add(index);
          next.forEach((item) => markDone(item));
          return next;
        });
      }}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 语文 · 生字笔顺描红
 * ────────────────────────────────────────────────────────────────── */

function HanziLab({
  lab,
  playful,
  style,
}: {
  lab: InteractiveLab;
  playful: boolean;
  style: LabStyle;
}) {
  const { tk } = useLocale();
  const chars = lab.chars ?? [];
  const [active, setActive] = useState(0);
  const [quizMode, setQuizMode] = useState(false);
  const [strokeDone, setStrokeDone] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<unknown>(null);

  const char = chars[active] ?? "";
  const pinyin = lab.pinyin?.[active] ?? "";
  const radical = lab.radicals?.[active] ?? "";

  /**
   * 行为追踪——「本课生字描红」的完成情况。
   *
   * 每个字描完算一个任务。AI 伴学会实时显示「已完成 3/8 个本课
   * 生字描红」。
   */
  const [traced, setTraced] = useState<Set<number>>(new Set());
  const { markDone } = useLabProgress({
    kind: "hanzi",
    title: lab.title,
    taskLabel: "本课生字描红",
    tasks: chars.map((char, index) => ({
      label: char,
      done: traced.has(index),
    })),
  });

  /** 标记某个字已描完。 */
  const completeChar = useCallback(
    (index: number) => {
      setTraced((prev) => {
        if (prev.has(index)) return prev;
        const next = new Set(prev);
        next.add(index);
        return next;
      });
      markDone(index);
    },
    [markDone],
  );

  /**
   * 挂载 hanzi-writer。
   *
   * ⚠️ 它是**浏览器 API**（需要 SVG 容器 + 字体数据），
   *    所以只能在客户端、且容器挂载之后初始化。
   *
   * 字形数据来源
   * ------------
   *
   * 默认走**本地打包**的 ``/data/hanzi-chars.json``——
   * 那 400 个常用字在构建期一次性打包好了（见
   * ``scripts/build-hanzi-data.mjs``）。
   *
   * 为什么不用 hanzi-writer 的默认 CDN：
   *
   * - 国内访问 jsdelivr **不稳**，而读者大多在国内；
   * - 每个字一次请求 → 400 个字 400 个 HTTP 请求；
   * - CDN 挂了，整个互动模块**静默失效**。
   *
   * 本地数据里没有的字，才回落到 CDN（并顺手缓存）。
   */
  useEffect(() => {
    if (!char || typeof window === "undefined") return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    void (async () => {
      try {
        const HanziWriter = (await import("hanzi-writer")).default;
        if (cancelled || !containerRef.current) return;

        const charData = await loadCharData(char);
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = "";
        const writer = HanziWriter.create(containerRef.current, char, {
          width: 160,
          height: 160,
          padding: 8,
          strokeColor: "#1e3a8a",
          radicalColor: "#dc2626",
          outlineColor: "#cbd5e1",
          drawingColor: "#1d4ed8",
          showOutline: true,
          strokeAnimationSpeed: 0.9,
          delayBetweenStrokes: 260,
          // 本地数据——不走 CDN。
          ...(charData ? { charData } : {}),
        });
        writerRef.current = writer;

        if (quizMode) {
          writer.quiz({
            onComplete: () => {
              setStrokeDone((count) => count + 1);
              // 一个字描完 → 标记该字完成。
              completeChar(active);
            },
            onMistake: () => setStrokeDone((count) => count),
          });
        } else {
          writer.animateCharacter();
        }
      } catch {
        /* 字体数据加载失败——降级为静态展示 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [char, quizMode, active, completeChar]);

  /** 朗读这个字。 */
  const speak = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(char);
    utterance.lang = "zh-CN";
    utterance.rate = 0.75;
    synth.speak(utterance);
  }, [char]);

  const playStroke = useCallback(() => {
    const writer = writerRef.current as {
      animateCharacter?: () => void;
    } | null;
    writer?.animateCharacter?.();
  }, []);

  return (
    <div className="space-y-4">
      {/* 字卡选择。 */}
      {chars.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {chars.map((item, index) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setActive(index);
                setStrokeDone(0);
              }}
              aria-pressed={active === index}
              className={cn(
                style.button,
                "border",
                active === index
                  ? "border-transparent text-white"
                  : "border-[var(--border)] bg-white text-[var(--foreground)]",
              )}
              style={active === index ? { background: style.accent } : undefined}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        {/* 笔顺画布。 */}
        <div
          className={cn(
            "shrink-0 border border-[var(--border)] bg-[var(--background)] p-2",
            style.radius,
          )}
        >
          <div ref={containerRef} className="h-[160px] w-[160px]" />
        </div>

        {/* 详情 + 操作。 */}
        <div className="min-w-[200px] flex-1 space-y-2.5">
          <div className="flex items-baseline gap-3">
            <span
              className="text-[34px] font-bold leading-none text-[var(--foreground)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {char}
            </span>
            {pinyin ? (
              <span className="text-[14px] text-[var(--muted-foreground)]">
                {pinyin}
              </span>
            ) : null}
          </div>

          <dl className="space-y-1 text-[12px]">
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-[var(--muted-foreground)]">
                {tk("lab.pinyin")}
              </dt>
              <dd className="text-[var(--foreground)]">
                {pinyin || "—"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-[var(--muted-foreground)]">
                {tk("lab.radical")}
              </dt>
              <dd className="text-[var(--foreground)]">{radical || "—"}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={playStroke}
              className={cn(
                style.button,
                "inline-flex items-center gap-1.5 border border-[var(--border)] bg-white text-[var(--foreground)]",
              )}
            >
              <Play size={11} strokeWidth={2.4} />
              {tk("lab.playStroke")}
            </button>
            <button
              type="button"
              onClick={() => {
                setQuizMode((value) => !value);
                setStrokeDone(0);
              }}
              className={cn(
                style.button,
                "inline-flex items-center gap-1.5 border border-[var(--border)] bg-white text-[var(--foreground)]",
              )}
            >
              <Eraser size={11} strokeWidth={2.4} />
              {quizMode ? tk("lab.playStroke") : tk("lab.quizStroke")}
            </button>
            <button
              type="button"
              onClick={speak}
              className={cn(
                style.button,
                "inline-flex items-center gap-1.5 border border-[var(--border)] bg-white text-[var(--foreground)]",
              )}
            >
              <Volume2 size={11} strokeWidth={2.4} />
              {tk("lab.readAloud")}
            </button>
          </div>

          <p className="text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
            {tk("lab.hanziHint")}
            {quizMode && strokeDone > 0 ? (
              <span className="ml-1 font-medium text-emerald-600">
                ✓ {tk("lab.correct")}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 语文 · 分句图解
 * ────────────────────────────────────────────────────────────────── */

function PoemLab({
  lab,
  playful,
  style,
}: {
  lab: InteractiveLab;
  playful: boolean;
  style: LabStyle;
}) {
  const { tk } = useLocale();
  const segments = lab.segments ?? [];
  const notes = lab.notes ?? [];
  const [open, setOpen] = useState<number | null>(null);

  /** 找一个词句的注释。 */
  const noteFor = useCallback(
    (segment: string) =>
      notes.find((note) => note.term === segment) ?? null,
    [notes],
  );

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-[var(--muted-foreground)]">
        {tk("lab.poemHint")}
      </p>

      <div className="space-y-2">
        {segments.map((segment, index) => {
          const note = noteFor(segment);
          const expanded = open === index;
          return (
            <div key={`${segment}-${index}`}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-2 border px-3 py-2 text-left transition-colors",
                  style.radius,
                  expanded
                    ? "border-transparent text-white"
                    : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-[var(--primary)]/35",
                )}
                style={expanded ? { background: style.accent } : undefined}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    expanded
                      ? "bg-white/25 text-white"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className="min-w-0 flex-1 text-[13.5px] font-medium"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {segment}
                </span>
                <BookOpen
                  size={13}
                  strokeWidth={2}
                  className={cn(
                    "shrink-0",
                    expanded ? "text-white/80" : "text-[var(--muted-foreground)]",
                  )}
                />
              </button>

              {expanded ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      "mt-1.5 space-y-1.5 border-l-2 bg-[var(--muted)]/40 px-3 py-2.5",
                      style.radius,
                    )}
                    style={{ borderLeftColor: style.accent }}
                  >
                    <p className="text-[12.5px] leading-relaxed text-[var(--foreground)]">
                      {note?.plain ?? "先读懂这一句在说什么，再连起来读整段。"}
                    </p>
                    <p className="text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                      {note?.en ?? "Read this line for the key image, then read the whole passage."}
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 小学数学 · 凑十方块
 * ────────────────────────────────────────────────────────────────── */

function BlocksLab({
  lab,
  playful,
  style,
}: {
  lab: InteractiveLab;
  playful: boolean;
  style: LabStyle;
}) {
  const { tk } = useLocale();
  const target = lab.target ?? 10;
  const [placed, setPlaced] = useState<number[]>([]);
  const [pool, setPool] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);

  const sum = placed.reduce((total, value) => total + value, 0);
  const solved = sum === target;

  /** 放入一块。 */
  const addBlock = useCallback(
    (value: number) => {
      setPlaced((prev) => (prev.length >= 10 ? prev : [...prev, value]));
      setPool((prev) => prev.filter((item) => item !== value));
    },
    [],
  );

  /** 撤回最后一块。 */
  const undo = useCallback(() => {
    setPlaced((prev) => {
      const last = prev[prev.length - 1];
      if (last === undefined) return prev;
      setPool((current) => [...current, last].sort((a, b) => a - b));
      return prev.slice(0, -1);
    });
  }, []);

  const reset = useCallback(() => {
    setPlaced([]);
    setPool([1, 2, 3, 4, 5, 6, 7]);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-[var(--muted-foreground)]">
        {tk("lab.blocksHint")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 备选方块。 */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
            点击方块放进框里
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pool.map((value) => (
              <motion.button
                key={`${value}-${pool.filter((v) => v === value).length}`}
                type="button"
                whileHover={playful ? { scale: 1.08, y: -2 } : undefined}
                whileTap={playful ? { scale: 0.92 } : undefined}
                onClick={() => addBlock(value)}
                className={cn(
                  "flex items-center justify-center border border-[var(--border)] bg-white font-semibold text-[var(--primary)]",
                  playful ? "rounded-xl" : "rounded-lg",
                )}
                style={{ width: 34, height: 34 }}
              >
                {value}
              </motion.button>
            ))}
            {pool.length === 0 ? (
              <span className="text-[11.5px] text-[var(--muted-foreground)]">
                方块用完了
              </span>
            ) : null}
          </div>
        </div>

        {/* 十格框。 */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
            凑成一个 {target}
          </p>
          <div
            className={cn(
              "grid grid-cols-5 gap-1 border-2 p-1.5",
              style.radius,
              solved
                ? "border-emerald-500 bg-emerald-500/[0.07]"
                : "border-[var(--border)] bg-[var(--background)]",
            )}
          >
            {Array.from({ length: 10 }).map((_, index) => {
              const value = placed[index];
              return (
                <motion.div
                  key={index}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: index * 0.02,
                    type: "spring",
                    stiffness: 420,
                    damping: 22,
                  }}
                  className={cn(
                    "flex aspect-square items-center justify-center border border-dashed text-[13px] font-bold",
                    playful ? "rounded-lg" : "rounded-md",
                    value === undefined
                      ? "border-[var(--border)] text-transparent"
                      : "border-transparent text-white",
                  )}
                  style={
                    value === undefined
                      ? undefined
                      : { background: style.accent }
                  }
                >
                  {value ?? ""}
                </motion.div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[12px] text-[var(--muted-foreground)]">
              {sum} / {target}
            </span>
            {solved ? (
              <motion.span
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600"
              >
                <Check size={12} strokeWidth={3} />
                {tk("lab.correct")}
              </motion.span>
            ) : null}
            <div className="flex-1" />
            <button
              type="button"
              onClick={undo}
              disabled={placed.length === 0}
              className={cn(
                style.button,
                "inline-flex items-center gap-1 border border-[var(--border)] bg-white text-[var(--foreground)] disabled:opacity-40",
              )}
            >
              <RotateCcw size={11} strokeWidth={2.4} />
              撤回
            </button>
            <button
              type="button"
              onClick={reset}
              className={cn(
                style.button,
                "inline-flex items-center gap-1 border border-[var(--border)] bg-white text-[var(--foreground)]",
              )}
            >
              {tk("lab.reset")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 小学数学 · 分数切分
 * ────────────────────────────────────────────────────────────────── */

function FractionLab({
  lab,
  playful,
  style,
}: {
  lab: InteractiveLab;
  playful: boolean;
  style: LabStyle;
}) {
  const { tk } = useLocale();
  const [slices, setSlices] = useState(lab.slices ?? 8);
  const [taken, setTaken] = useState(0);

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-[var(--muted-foreground)]">
        {tk("lab.fractionHint")}
      </p>

      <div className="flex flex-wrap items-center gap-5">
        {/* 披萨。 */}
        <svg viewBox="0 0 120 120" className="h-[150px] w-[150px] shrink-0">
          <circle cx="60" cy="60" r="54" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
          {Array.from({ length: slices }).map((_, index) => {
            const angle = (index / slices) * Math.PI * 2 - Math.PI / 2;
            const x = 60 + 54 * Math.cos(angle);
            const y = 60 + 54 * Math.sin(angle);
            const filled = index < taken;
            return (
              <motion.path
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 }}
                d={`M 60 60 L ${x.toFixed(2)} ${y.toFixed(2)} A 54 54 0 0 1 ${(
                  60 + 54 * Math.cos(angle + (Math.PI * 2) / slices)
                ).toFixed(2)} ${(
                  60 + 54 * Math.sin(angle + (Math.PI * 2) / slices)
                ).toFixed(2)} Z`}
                fill={filled ? "#f59e0b" : "transparent"}
                stroke="#d97706"
                strokeWidth="1.2"
              />
            );
          })}
        </svg>

        <div className="min-w-[180px] flex-1 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[var(--muted-foreground)]">
              切成几份：<span className="tabular-nums text-[var(--foreground)]">{slices}</span>
            </span>
            <input
              type="range"
              min={2}
              max={16}
              value={slices}
              onChange={(event) => {
                setSlices(Number(event.target.value));
                setTaken(0);
              }}
              className="w-full accent-[var(--primary)]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[var(--muted-foreground)]">
              吃掉几份：<span className="tabular-nums text-[var(--foreground)]">{taken}</span>
            </span>
            <input
              type="range"
              min={0}
              max={slices}
              value={Math.min(taken, slices)}
              onChange={(event) => setTaken(Number(event.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </label>

          <motion.p
            key={`${taken}-${slices}`}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[20px] font-bold text-[var(--foreground)]"
          >
            <span style={{ color: style.accent }}>{taken}</span>
            <span className="text-[var(--muted-foreground)]"> / {slices}</span>
          </motion.p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 小学数学 · 对称平移
 * ────────────────────────────────────────────────────────────────── */

function SymmetryLab({
  lab,
  playful,
  style,
}: {
  lab: InteractiveLab;
  playful: boolean;
  style: LabStyle;
}) {
  const { tk } = useLocale();
  const [offset, setOffset] = useState(0);
  const size = 160;

  /** 三角形的镜像顶点。 */
  const mirrored = size / 2 - offset;
  const aligned = Math.abs(offset) < 1.5;

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-[var(--muted-foreground)]">
        {tk("lab.symmetryHint")}
      </p>

      <div className="flex flex-wrap items-center gap-5">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-[170px] w-[170px] shrink-0">
          {/* 对称轴。 */}
          <line
            x1={size / 2}
            y1={8}
            x2={size / 2}
            y2={size - 8}
            stroke="#1d4ed8"
            strokeWidth="1.4"
            strokeDasharray="5 4"
          />
          {/* 原始图形。 */}
          <polygon
            points={`${offset - 18},${size - 30} ${offset},${30} ${offset + 18},${size - 30}`}
            fill="#1d4ed8"
            fillOpacity="0.85"
          />
          {/* 镜像。 */}
          <motion.polygon
            animate={{ points: `${mirrored - 18},${size - 30} ${mirrored},${30} ${mirrored + 18},${size - 30}` }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            fill="#93c5fd"
            fillOpacity="0.8"
          />
        </svg>

        <div className="min-w-[200px] flex-1 space-y-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[var(--muted-foreground)]">
              拖动图形找对称位置
            </span>
            <input
              type="range"
              min={-70}
              max={70}
              value={offset}
              onChange={(event) => setOffset(Number(event.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </label>
          <motion.p
            animate={{ color: aligned ? "#059669" : "var(--muted-foreground)" }}
            className="text-[12.5px] font-medium"
          >
            {aligned ? `✓ ${tk("lab.correct")}` : tk("lab.tryAgain")}
          </motion.p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 初高中数学 · 函数图像
 * ────────────────────────────────────────────────────────────────── */

function FunctionLab({
  lab,
  playful,
  style,
}: {
  lab: InteractiveLab;
  playful: boolean;
  style: LabStyle;
}) {
  const { tk } = useLocale();
  const [a, setA] = useState(1);
  const type = lab.fn ?? "linear";
  const size = 200;

  /** 函数值。 */
  const fn = useCallback(
    (x: number) => {
      if (type === "linear") return a * x;
      if (type === "quadratic") return a * x * x;
      return a * Math.sin(x);
    },
    [a, type],
  );

  /** 把函数值映射到 SVG 坐标。 */
  const path = useMemo(() => {
    const points: string[] = [];
    for (let i = 0; i <= 60; i += 1) {
      const x = -5 + (i / 60) * 10;
      const y = fn(x);
      const px = size / 2 + (x / 10) * (size / 2 - 12);
      const py = size / 2 - (y / 6) * (size / 2 - 12);
      points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
    }
    return `M ${points.join(" L ")}`;
  }, [fn, size]);

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-[var(--muted-foreground)]">
        {tk("lab.functionHint")}
      </p>

      <div className="flex flex-wrap items-center gap-5">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-[210px] w-[210px] shrink-0">
          <rect width={size} height={size} fill="#f8fafc" />
          {/* 坐标轴。 */}
          <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke="#94a3b8" strokeWidth="1" />
          <line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke="#94a3b8" strokeWidth="1" />
          {/* 网格。 */}
          {Array.from({ length: 9 }).map((_, index) => (
            <g key={index} stroke="#e2e8f0" strokeWidth="0.6">
              <line
                x1={(index + 1) * (size / 10)}
                y1={0}
                x2={(index + 1) * (size / 10)}
                y2={size}
              />
              <line x1={0} y1={(index + 1) * (size / 10)} x2={size} y2={(index + 1) * (size / 10)} />
            </g>
          ))}
          {/* 曲线。 */}
          <motion.path
            animate={{ d: path }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            fill="none"
            stroke={style.accent}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>

        <div className="min-w-[190px] flex-1 space-y-3">
          <div>
            <p className="mb-1 text-[12px] font-medium text-[var(--foreground)]">
              {type === "quadratic" ? "y = ax²" : type === "trig" ? "y = a·sin(x)" : "y = ax"}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              a = <span className="tabular-nums text-[var(--foreground)]">{a.toFixed(1)}</span>
            </p>
          </div>
          <input
            type="range"
            min={-3}
            max={3}
            step={0.1}
            value={a}
            onChange={(event) => setA(Number(event.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => setA(1)}
            className={cn(
              style.button,
              "inline-flex items-center gap-1 border border-[var(--border)] bg-white text-[var(--foreground)]",
            )}
          >
            <RotateCcw size={11} strokeWidth={2.4} />
            {tk("lab.reset")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 初高中数学 · 动态几何
 * ────────────────────────────────────────────────────────────────── */

function GeometryLab({
  lab,
  playful,
  style,
}: {
  lab: InteractiveLab;
  playful: boolean;
  style: LabStyle;
}) {
  const { tk } = useLocale();
  const [angle, setAngle] = useState(60);
  const size = 190;
  const radius = 62;

  /** 三角形顶点。 */
  const points = useMemo(() => {
    const a1 = (angle * Math.PI) / 180;
    const a2 = ((180 - angle) * Math.PI) / 180;
    const p1 = { x: size / 2, y: size / 2 + 45 };
    const p2 = {
      x: size / 2 - radius * Math.cos(a1) * 1.6,
      y: size / 2 + 45 - radius * Math.sin(a1) * 1.6,
    };
    const p3 = {
      x: size / 2 + radius * Math.cos(a2) * 1.6,
      y: size / 2 + 45 - radius * Math.sin(a2) * 1.6,
    };
    return [p1, p2, p3];
  }, [angle]);

  /** 面积（海伦公式的简化版：底 × 高 / 2）。 */
  const area = useMemo(() => {
    const base = Math.hypot(
      points[2].x - points[1].x,
      points[2].y - points[1].y,
    );
    const height = points[1].y - points[0].y;
    return Math.abs((base * height) / 2);
  }, [points]);

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-[var(--muted-foreground)]">
        {tk("lab.geometryHint")}
      </p>

      <div className="flex flex-wrap items-center gap-5">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-[200px] w-[200px] shrink-0">
          <motion.polygon
            animate={{ points: points.map((p) => `${p.x},${p.y}`).join(" ") }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
            fill="#1d4ed8"
            fillOpacity="0.16"
            stroke={style.accent}
            strokeWidth="2"
          />
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#fff"
              stroke={style.accent}
              strokeWidth="2"
            />
          ))}
          {/* 角度弧。 */}
          <path
            d={`M ${points[0].x + 18},${points[0].y} A 18 18 0 0 1 ${(
              points[0].x +
              18 * Math.cos((angle * Math.PI) / 180)
            ).toFixed(2)},${(
              points[0].y - 18 * Math.sin((angle * Math.PI) / 180)
            ).toFixed(2)}`}
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.6"
          />
          <text
            x={points[0].x + 24}
            y={points[0].y - 8}
            fill="#dc2626"
            fontSize="11"
            fontWeight="600"
          >
            {angle}°
          </text>
        </svg>

        <div className="min-w-[190px] flex-1 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[var(--muted-foreground)]">
              顶角
            </span>
            <input
              type="range"
              min={20}
              max={140}
              value={angle}
              onChange={(event) => setAngle(Number(event.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </label>
          <div className="flex gap-4 text-[12px]">
            <span className="text-[var(--muted-foreground)]">
              面积{" "}
              <span className="tabular-nums font-semibold text-[var(--foreground)]">
                {Math.round(area)}
              </span>
            </span>
            <span className="text-[var(--muted-foreground)]">
              底角{" "}
              <span className="tabular-nums font-semibold text-[var(--foreground)]">
                {Math.round((180 - angle) / 2)}°
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 字形数据加载
 * ────────────────────────────────────────────────────────────────── */

/** 一个字的笔顺数据。 */
interface CharData {
  strokes: string[];
  medians: number[][];
}

/** 本地打包的字库——一次拉取，全站复用。 */
let localCharCache: Record<string, CharData> | null = null;
/** 本地字库拉取失败时，退回 CDN。 */
let localCharCacheFailed = false;

/**
 * 加载一个字的笔顺数据。
 *
 * 顺序：
 *
 * 1. 本地打包的 ``/data/hanzi-chars.json``（覆盖 K12 全部用字）；
 * 2. hanzi-writer 官方 CDN（兜底）；
 * 3. 都失败 → 返回 ``null``，组件降级为静态字形。
 */
async function loadCharData(char: string): Promise<CharData | null> {
  // ── ① 本地打包 ──
  if (!localCharCacheFailed) {
    try {
      if (!localCharCache) {
        const response = await fetch("/data/hanzi-chars.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        localCharCache = (await response.json()) as Record<string, CharData>;
      }
      const found = localCharCache[char];
      if (found) return found;
    } catch {
      // 本地字库不可用——标记一次，别再重试。
      localCharCacheFailed = true;
    }
  }

  // ── ② CDN 兜底 ──
  try {
    const response = await fetch(
      `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as CharData;
    return { strokes: data.strokes ?? [], medians: data.medians ?? [] };
  } catch {
    return null;
  }
}
