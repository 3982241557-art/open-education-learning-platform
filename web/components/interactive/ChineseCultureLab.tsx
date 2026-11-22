"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Languages, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 语文真实文化互动台
 * ===================
 *
 * 两个学段，**两种完全不同的东西**——
 *
 * ====================  ==================================================
 * 学段                  互动台
 * ====================  ==================================================
 * 小学（1–6 年级）      本课**真实生字**的笔顺动画 + 屏幕跟随描红
 *                       纠错 + 汉字字源演变 + 语音朗读
 * 初高中（7–12 年级）    中国文化通识与经典精读台——真实选段 / 诗词
 *                       原文，点击高亮词句弹出文化背景、修辞意象、
 *                       文言实词解析与中英双语思辨
 * ====================  ==================================================
 *
 * ⛔ **绝对红线**
 *    初高中段**绝不出现**笔顺描红。那是小学的东西——
 *    初中生要学的是「文章为何这样写」，不是「这个字怎么写」。
 *
 * ⛔ **纯静态导出**
 *    - ``hanzi-writer`` 只在 ``useEffect`` 里动态 import；
 *    - 字形数据优先走**本地打包**的 ``/data/hanzi-chars.json``，
 *      本地没有才回落 CDN（并缓存）；
 *    - 语音朗读走浏览器原生 ``speechSynthesis``，无网络依赖。
 */

/* ──────────────────────────────────────────────────────────────────
 * 类型
 * ────────────────────────────────────────────────────────────────── */

/** 一个可点击的文化关键词。 */
export interface CultureKeyword {
  /** 词句原文。 */
  term: string;
  /** 修辞 / 手法。 */
  device: string;
  /** 文化背景与意象解析。 */
  meaning: string;
  /** 白话对照。 */
  plain: string;
  /** 英文思辨提示。 */
  en?: string;
}

/** 汉字字源条目。 */
export interface EtymologyEntry {
  /** 字。 */
  char: string;
  /** 甲骨文 / 金文描述。 */
  glyph: string;
  /** 字义演变说明。 */
  story: string;
}

/** 语文文化互动台配置。 */
export interface ChineseCultureLabConfig {
  /** 学段。 */
  stage: "primary" | "junior" | "senior";
  /** 标题。 */
  title: string;
  /** 本课真实生字（仅小学段）。 */
  chars?: string[];
  /** 生字拼音（与 ``chars`` 一一对应）。 */
  pinyin?: string[];
  /** 经典选段 / 诗词原文（初高中段）。 */
  excerpt?: string;
  /** 篇名。 */
  workTitle?: string;
  /** 作者。 */
  author?: string;
  /** 朝代。 */
  dynasty?: string;
  /** 可点击高亮词句。 */
  keywords?: CultureKeyword[];
  /** 字源演变（小学段）。 */
  etymology?: EtymologyEntry[];
  /** 思考题。 */
  question?: string;
  /** 思考题答案。 */
  answer?: string;
}

/** 组件属性。 */
export interface ChineseCultureLabProps {
  /** 互动台配置。 */
  config: ChineseCultureLabConfig;
  /** 额外类名。 */
  className?: string;
  /** 描红完成回调。 */
  onTrace?: (char: string, index: number, total: number) => void;
}

/* ──────────────────────────────────────────────────────────────────
 * 字形数据加载（本地优先，CDN 兜底）
 * ────────────────────────────────────────────────────────────────── */

/** 本地打包的字形缓存。 */
const localCharCache = new Map<string, unknown>();
/** 远端缓存。 */
const remoteCharCache = new Map<string, unknown>();

/** 本地字形表是否已加载。 */
let localTablePromise: Promise<Record<string, unknown>> | null = null;

/** 加载本地字形表。 */
function loadLocalTable(): Promise<Record<string, unknown>> {
  if (!localTablePromise) {
    localTablePromise = fetch("/data/hanzi-chars.json")
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({} as Record<string, unknown>));
  }
  return localTablePromise;
}

/**
 * 加载某个字的笔顺数据。
 *
 * 优先本地打包表（400 个常用字），没有再走 CDN。
 */
export async function loadCharData(char: string): Promise<unknown | null> {
  if (localCharCache.has(char)) return localCharCache.get(char);
  if (remoteCharCache.has(char)) return remoteCharCache.get(char);

  const table = await loadLocalTable();
  const local = (table as Record<string, unknown>)[char];
  if (local) {
    localCharCache.set(char, local);
    return local;
  }

  try {
    const response = await fetch(
      `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    remoteCharCache.set(char, data);
    return data;
  } catch {
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 通用 UI
 * ────────────────────────────────────────────────────────────────── */

/** 实心面板。 */
function Panel({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF]">
      <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] bg-[#FFFEFA] px-4 py-3">
        <div className="min-w-0">
          <h4 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[#0F172A]">
            {title}
          </h4>
          {hint ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#1E293B]">
              {hint}
            </p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="bg-[#FFFFFF] p-4">{children}</div>
    </div>
  );
}

/** 按钮。 */
function SmallButton({
  children,
  onClick,
  active,
  tone = "oxford",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: "oxford" | "gold";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "bg-[#0B162C] text-white"
          : tone === "gold"
            ? "border border-[#B89B5E] bg-[#FFFFFF] text-[#8A6D3B]"
            : "border border-[#E5E7EB] bg-[#FFFFFF] text-[#1E293B] hover:bg-[#F8F7F4]",
      )}
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 小学段 · 笔顺 + 描红 + 字源
 * ────────────────────────────────────────────────────────────────── */

/** 小学段生字互动台。 */
function PrimaryCulturePanel({
  config,
  onTrace,
}: {
  config: ChineseCultureLabConfig;
  onTrace?: (char: string, index: number, total: number) => void;
}) {
  const chars = config.chars ?? [];
  const [active, setActive] = useState(0);
  const [quizMode, setQuizMode] = useState(false);
  const [traced, setTraced] = useState<Set<number>>(new Set());
  const [showEtymology, setShowEtymology] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<unknown>(null);

  const char = chars[active] ?? "";
  const pinyin = config.pinyin?.[active] ?? "";
  const etymology = config.etymology?.find((item) => item.char === char) ?? null;

  /** 挂载 hanzi-writer。 */
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
          width: 170,
          height: 170,
          padding: 8,
          strokeColor: "#1e3a8a",
          radicalColor: "#dc2626",
          outlineColor: "#cbd5e1",
          drawingColor: "#1D4ED8",
          showOutline: true,
          strokeAnimationSpeed: 0.9,
          delayBetweenStrokes: 280,
          ...(charData ? { charData } : {}),
        });
        writerRef.current = writer;

        if (quizMode) {
          writer.quiz({
            onComplete: () => {
              setTraced((prev) => {
                const next = new Set(prev).add(active);
                onTrace?.(char, active, chars.length);
                return next;
              });
            },
            onMistake: () => undefined,
          });
        } else {
          writer.animateCharacter();
        }
      } catch {
        /* 字形数据加载失败——降级为静态展示 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [char, quizMode, active, onTrace, chars.length]);

  /** 朗读。 */
  const speak = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(char);
    utterance.lang = "zh-CN";
    utterance.rate = 0.72;
    synth.speak(utterance);
  }, [char]);

  const replay = useCallback(() => {
    const writer = writerRef.current as { animateCharacter?: () => void } | null;
    writer?.animateCharacter?.();
  }, []);

  if (chars.length === 0) {
    return (
      <Panel title="本课文化互动台">
        <p className="text-[13px] leading-relaxed text-[#1E293B]">
          本课以文化通识与经典精读为主，没有需要书写掌握的生字。
          请回到视频完成精讲，课后测验会覆盖本讲要点。
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* 字卡选择 */}
      {chars.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {chars.map((item, index) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setActive(index);
                setQuizMode(false);
              }}
              aria-pressed={active === index}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border text-[19px] transition-colors",
                active === index
                  ? "border-[#0B162C] bg-[#0B162C] text-white"
                  : "border-[#E5E7EB] bg-[#FFFFFF] text-[#0F172A] hover:bg-[#F8F7F4]",
              )}
              style={traced.has(index) && active !== index ? { borderColor: "#B89B5E" } : undefined}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <Panel
        title={`本课生字 · ${char}`}
        hint="先看笔顺动画，再切到「开始描红」——系统会实时纠正你的笔顺。"
        right={
          <div className="flex items-center gap-1.5">
            <SmallButton onClick={replay}>重播笔顺</SmallButton>
            <SmallButton onClick={speak}>朗读</SmallButton>
            <SmallButton
              tone="gold"
              active={quizMode}
              onClick={() => setQuizMode((v) => !v)}
            >
              {quizMode ? "描红中" : "开始描红"}
            </SmallButton>
          </div>
        }
      >
        <div className="flex flex-wrap items-start gap-6">
          {/* 笔顺画布 */}
          <div className="shrink-0 rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-2">
            <div ref={containerRef} className="h-[170px] w-[170px]" />
          </div>

          {/* 详情 */}
          <div className="min-w-[220px] flex-1 space-y-3">
            <div className="flex items-baseline gap-3">
              <span
                className="text-[40px] font-bold leading-none text-[#0B162C]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {char}
              </span>
              {pinyin ? (
                <span className="text-[14px] text-[#64748B]">{pinyin}</span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-md border border-[#E5E7EB] bg-[#F8F7F4] px-2 py-1 text-[11px] font-medium text-[#1E293B]">
                已描红 {traced.size} / {chars.length}
              </span>
            </div>

            {/* 字源 */}
            <button
              type="button"
              onClick={() => setShowEtymology((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-[#B89B5E] bg-[#FFFEFA] px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2 text-[12px] font-medium text-[#8A6D3B]">
                <BookOpen size={14} />
                汉字字源演变
              </span>
              <span className="text-[11px] text-[#8A6D3B]">
                {showEtymology ? "收起" : "展开"}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {showEtymology ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-3">
                    {etymology ? (
                      <>
                        <div className="text-[13px] font-semibold text-[#0F172A]">
                          {etymology.glyph}
                        </div>
                        <p className="text-[12px] leading-relaxed text-[#1E293B]">
                          {etymology.story}
                        </p>
                      </>
                    ) : (
                      <p className="text-[12px] leading-relaxed text-[#1E293B]">
                        「{char}」的字源演变：汉字从甲骨文的象形逐步走向隶书、
                        楷书。书写形态在变，但承载的意义线索被保留了下来——
                        这正是汉字「形、音、义」三层结构的由来。
                      </p>
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 初高中段 · 经典精读与文化通识
 * ────────────────────────────────────────────────────────────────── */

/** 初高中段文化互动台。 */
function SecondaryCulturePanel({ config }: { config: ChineseCultureLabConfig }) {
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const keywords = config.keywords ?? [];

  /** 把原文按关键词切分成可点击片段。 */
  const segments = useMemo(() => {
    const excerpt = config.excerpt ?? "";
    if (!excerpt || keywords.length === 0) {
      return [{ text: excerpt, term: null as string | null }];
    }
    // 按关键词在原文中的首次出现位置排序，保证切分不重叠。
    const hits = keywords
      .map((keyword) => ({
        keyword,
        index: excerpt.indexOf(keyword.term),
      }))
      .filter((hit) => hit.index >= 0)
      .sort((a, b) => a.index - b.index);

    if (hits.length === 0) {
      return [{ text: excerpt, term: null as string | null }];
    }

    const result: Array<{ text: string; term: string | null }> = [];
    let cursor = 0;
    for (const hit of hits) {
      if (hit.index < cursor) continue;
      if (hit.index > cursor) {
        result.push({ text: excerpt.slice(cursor, hit.index), term: null });
      }
      result.push({ text: hit.keyword.term, term: hit.keyword.term });
      cursor = hit.index + hit.keyword.term.length;
    }
    if (cursor < excerpt.length) {
      result.push({ text: excerpt.slice(cursor), term: null });
    }
    return result;
  }, [config.excerpt, keywords]);

  const activeKeyword = keywords.find((k) => k.term === openTerm) ?? null;

  return (
    <div className="space-y-4">
      <Panel
        title={
          config.workTitle
            ? `《${config.workTitle}》· 经典精读与文化通识`
            : "经典精读与文化通识"
        }
        hint={
          config.dynasty || config.author
            ? `${config.dynasty ?? ""}　${config.author ?? ""}`.trim()
            : "点击高亮的词句，展开文化背景、修辞意象与双语思辨。"
        }
        right={
          <span className="flex items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] px-2 py-1 text-[11px] text-[#1E293B]">
            <Languages size={12} />
            初高中段 · 无描红
          </span>
        }
      >
        <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFEFA] px-5 py-5">
          <p
            className="text-[15px] leading-[2.1] text-[#0F172A]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {segments.map((segment, index) =>
              segment.term ? (
                <button
                  key={index}
                  type="button"
                  onClick={() =>
                    setOpenTerm((prev) => (prev === segment.term ? null : segment.term))
                  }
                  className={cn(
                    "mx-0.5 rounded px-0.5 transition-colors",
                    openTerm === segment.term
                      ? "bg-[#0B162C] text-white"
                      : "text-[#1D4ED8] underline decoration-[#B89B5E] decoration-2 underline-offset-4 hover:bg-[#F8F7F4]",
                  )}
                >
                  {segment.text}
                </button>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>
        </div>
      </Panel>

      {/* 弹出的文化解析 */}
      <AnimatePresence>
        {activeKeyword ? (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-[#B89B5E] bg-[#FFFFFF] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[20px] font-semibold text-[#0B162C]"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {activeKeyword.term}
                    </span>
                    <span className="rounded-md border border-[#B89B5E] bg-[#FFFEFA] px-2 py-0.5 text-[11px] font-medium text-[#8A6D3B]">
                      {activeKeyword.device}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenTerm(null)}
                  className="rounded-md border border-[#E5E7EB] bg-[#FFFFFF] px-2 py-1 text-[11px] text-[#1E293B]"
                >
                  关闭
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFEFA] p-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#64748B]">
                    文化背景与意象
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1E293B]">
                    {activeKeyword.meaning}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFEFA] p-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#64748B]">
                    白话对照
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1E293B]">
                    {activeKeyword.plain}
                  </p>
                </div>
              </div>

              {activeKeyword.en ? (
                <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#64748B]">
                    <Languages size={12} />
                    Bilingual Reflection
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1E293B]">
                    {activeKeyword.en}
                  </p>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 思考题 */}
      {config.question ? (
        <Panel title="本讲思辨题">
          <p className="text-[13px] leading-relaxed text-[#0F172A]">
            {config.question}
          </p>
          {config.answer ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-medium text-[#8A6D3B]">
                展开参考解答
              </summary>
              <p className="mt-2 whitespace-pre-line rounded-xl border border-[#E5E7EB] bg-[#FFFEFA] px-3 py-3 text-[12px] leading-relaxed text-[#1E293B]">
                {config.answer}
              </p>
            </details>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 主组件
 * ────────────────────────────────────────────────────────────────── */

/**
 * 语文真实文化互动台。
 *
 * 小学段 → 笔顺 + 描红 + 字源；
 * 初高中段 → 经典精读 + 文化通识（**绝不出现描红**）。
 */
export default function ChineseCultureLab({
  config,
  className,
  onTrace,
}: ChineseCultureLabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn("space-y-4", className)}
    >
      {config.stage === "primary" ? (
        <PrimaryCulturePanel config={config} onTrace={onTrace} />
      ) : (
        <SecondaryCulturePanel config={config} />
      )}
    </motion.div>
  );
}
