"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Globe, Sparkles, X } from "lucide-react";
import type { Episode } from "@/lib/courses-api";
import {
  buildBilingualQuestion,
  buildK12DiagnosticQuestions,
  judgeK12Mastery,
  type K12DiagnosticQuestion,
} from "@/lib/k12-diagnostic";
import {
  MASTERY_LABEL,
  saveDiagnostic,
  type MasteryLevel,
} from "@/lib/diagnostic-profile";
import {
  StudyBuddy,
  SuccessBurst,
  styleOf,
} from "@/components/learning/AdaptiveStage";
import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/cn";

/**
 * 进课诊断卡 · 高对比亮磨砂玻璃 + 单题步进
 * ============================================
 *
 * 每次进入一门课的新一集（且本集尚未完成诊断）时**自动弹出**。
 *
 * 视觉：通透明亮的**白磨砂玻璃**
 * --------------------------------
 *
 * 旧版是「暗灰半透明 + 字迹融进背景」——看不清。这版彻底翻转：
 *
 * - 全屏遮罩：``backdrop-blur-md bg-slate-900/45``；
 * - 卡片：``bg-white/92 backdrop-blur-xl border border-white/70 shadow-2xl``；
 * - 正文：``text-lg font-semibold text-slate-900``（题干）
 *   / ``text-base text-slate-800``（选项）。
 *
 * 一次只展示 1 道题
 * ----------------
 *
 * 顶部是清爽的进度点（``1 / 3``）。选中选项后，framer-motion
 * 丝滑地把当前题滑出、下一题滑入。**绝不把 4 道题堆满一屏**。
 *
 * 题目是**真考点**
 * ----------------
 *
 * 不是「关于《XXX》，你现在的理解到哪一步了？」这种废话——
 * 语文考具体生字 / 古诗名句，数学直接出一道前置心算小题。
 * 详见 ``lib/k12-diagnostic.ts``。
 *
 * 最后一个问题：要不要双语辅助
 * --------------------------------
 *
 * 极简的**海外学情偏好**问项——只需回答「是 / 否」。答完后，这个
 * 偏好会跟着诊断结果一起写进 AI 助教的 system prompt。
 */

/** 组件属性。 */
export interface EpisodeDiagnosticModalProps {
  /** 是否打开。 */
  open: boolean;
  /** 关闭回调。 */
  onClose: () => void;
  /** 资源 id。 */
  resourceId: string;
  /** 课程标题。 */
  courseTitle: string;
  /** 本集。 */
  episode: Episode;
  /** 学段——决定视觉语言。 */
  stage?: "primary" | "junior" | "senior";
  /** 学科——决定背景摸底题的方向。 */
  subject?: "chinese" | "math";
  /** 本集的知识节点——出题的**首选**来源。 */
  nodes?: Array<{ keyword: string; hint?: string; context?: string }>;
  /** 本集的段落导读——出题的次选来源。 */
  segments?: Array<{ title: string; content?: string }>;
}

/** 默认难度——「按默认难度开始」时用它。 */
const DEFAULT_MASTERY: MasteryLevel = "完全陌生";

export function EpisodeDiagnosticModal({
  open,
  onClose,
  resourceId,
  courseTitle,
  episode,
  stage = "junior",
  subject = "math",
  nodes = [],
  segments = [],
}: EpisodeDiagnosticModalProps) {
  const playful = stage === "primary";
  const style = styleOf(playful);
  const { tk } = useLocale();

  /**
   * 当前题的作答。
   *
   * ``null`` = 还没答。值是选项下标。
   */
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  /** 当前题的下标——**单题步进**的核心状态。 */
  const [cursor, setCursor] = useState(0);
  /** 是否已经进入「提交」状态。 */
  const [submitted, setSubmitted] = useState(false);
  /** 刚刚答对的那一题——触发彩星迸射。 */
  const [burstIndex, setBurstIndex] = useState<number | null>(null);
  /** 是否需要双语辅助解释。 */
  const [bilingual, setBilingual] = useState<boolean | null>(null);

  /**
   * 诊断题。
   *
   * 用 ``useMemo`` 而不是 ``useState``——题目是**纯函数**的产物，
   * 每次渲染重算会丢掉用户的作答状态。
   */
  const questions: K12DiagnosticQuestion[] = useMemo(
    () => [
      ...buildK12DiagnosticQuestions(
        episode.title,
        subject,
        stage,
        nodes,
        segments,
      ),
      buildBilingualQuestion(),
    ],
    [episode.title, subject, stage, nodes, segments],
  );

  /**
   * 最后一题是**双语偏好**问项——不算知识题。
   *
   * 所以「知识题」是 ``questions.slice(0, -1)``。
   */
  const knowledgeQuestions = useMemo(
    () => questions.filter((question) => !question.isBackground),
    [questions],
  );

  /** 当前展示的题。 */
  const current = questions[cursor];

  /** 打开时重置状态。 */
  useEffect(() => {
    if (!open) return;
    setAnswers(new Array(questions.length).fill(null));
    setCursor(0);
    setSubmitted(false);
    setBurstIndex(null);
    setBilingual(null);
  }, [open, questions.length]);

  /**
   * Esc 关闭。
   *
   * ⚠️ 只在**提交之前**生效——提交之后如果按 Esc 就把结果丢了。
   */
  useEffect(() => {
    if (!open || submitted) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitted, onClose]);

  /**
   * 写盘并关闭。
   *
   * @param skipped 是否是「跳过」——跳过时用默认难度。
   */
  const finish = useCallback(
    (skipped: boolean) => {
      const judged = skipped
        ? { mastery: DEFAULT_MASTERY, weakConcepts: [] as string[] }
        : judgeK12Mastery(answers, questions);

      saveDiagnostic({
        resourceId,
        epId: episode.ep_id,
        courseTitle,
        episodeTitle: episode.title,
        episodeIndex: episode.index,
        mastery: judged.mastery as MasteryLevel,
        weakConcepts: judged.weakConcepts,
        correctCount: skipped
          ? 0
          : answers.filter(
              (answer, index) =>
                answer !== null && answer === questions[index]?.correctIndex,
            ).length,
        totalCount: questions.length,
        skipped,
        needsBilingual: bilingual === true,
        at: Date.now(),
      });

      onClose();
    },
    [answers, questions, resourceId, episode, courseTitle, onClose, bilingual],
  );

  /** 选一个选项。 */
  const pick = useCallback(
    (optionIndex: number) => {
      const question = questions[cursor];
      if (!question) return;

      setAnswers((prev) => {
        const next = [...prev];
        next[cursor] = optionIndex;
        return next;
      });
      setBurstIndex(optionIndex === question.correctIndex ? cursor : null);
      setSubmitted(false);

      // 双语偏好题单独记录——它不参与掌握度判定。
      if (question.concept === "__bilingual__") {
        setBilingual(optionIndex === 0);
      }
    },
    [questions, cursor],
  );

  /**
   * 选完一项后**丝滑滑入下一题**。
   *
   * 答对 → 短暂停留让彩星迸射完，再滑走。
   */
  const advance = useCallback(() => {
    if (cursor < questions.length - 1) {
      setCursor((value) => value + 1);
    } else {
      setSubmitted(true);
    }
  }, [cursor, questions.length]);

  /** 上一题。 */
  const back = useCallback(() => {
    if (cursor > 0) setCursor((value) => value - 1);
  }, [cursor]);

  /** 是否已到最后一题。 */
  const isLast = cursor >= questions.length - 1;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={tk("diag.title")}
    >
      <div
        className={cn(
          "relative w-full max-w-[560px] overflow-hidden",
          style.radius,
          // 高对比白磨砂玻璃——文字一律深色，背景一律亮。
          "border border-white/70 bg-white/92 backdrop-blur-xl",
          "shadow-[0_28px_80px_-16px_rgba(15,23,42,0.45),0_4px_12px_rgba(15,23,42,0.10)]",
        )}
      >
        {/* 顶部高光——模拟光源从上方来。 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/85 via-white/25 to-transparent"
        />

        <div className="relative p-6 sm:p-7">
          {/* ── 头部 ── */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {playful ? (
                <span className="mt-0.5 shrink-0">
                  <StudyBuddy mood="happy" playful={playful} />
                </span>
              ) : null}

              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Sparkles
                    size={12}
                    strokeWidth={2.2}
                    className="shrink-0 text-blue-700"
                  />
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-blue-800/70">
                    {tk("diag.title")}
                  </span>
                </div>
                <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
                  {tk("diag.subtitle")}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                  {tk("diag.subtitleHint")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => finish(true)}
              aria-label={tk("diag.close")}
              title={tk("diag.close")}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-700"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>

          {/* ── 本集信息 + 进度点 ── */}
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-900/[0.08] bg-blue-50/55 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-slate-500">
                {courseTitle}
                {episode.total > 1
                  ? ` · ${tk("course.lessonOf", {
                      index: episode.index,
                      total: episode.total,
                    })}`
                  : ""}
              </p>
              <p className="mt-0.5 truncate text-[13.5px] font-medium text-slate-900">
                {episode.title}
              </p>
            </div>

            {/* 进度点。 */}
            <div className="flex shrink-0 items-center gap-1.5">
              {questions.map((question, index) => {
                const answered = answers[index] !== null;
                const active = index === cursor;
                return (
                  <span
                    key={`${question.concept}-${index}`}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      active
                        ? "w-6 bg-blue-700"
                        : answered
                          ? "w-2 bg-blue-400"
                          : "w-2 bg-slate-300",
                    )}
                  />
                );
              })}
              <span className="ml-1 text-[11.5px] font-medium tabular-nums text-slate-500">
                {tk("diag.progress", {
                  index: cursor + 1,
                  total: questions.length,
                })}
              </span>
            </div>
          </div>

          {/* ── 题目（单题步进）── */}
          <div className="min-h-[220px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={cursor}
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                {current ? (
                  <QuestionBlock
                    question={current}
                    index={cursor}
                    value={answers[cursor] ?? null}
                    playful={playful}
                    burst={burstIndex === cursor}
                    onPick={pick}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── 底部动作 ── */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-900/[0.08] pt-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => finish(true)}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-500 transition-colors hover:text-slate-800"
              >
                {tk("diag.skip")}
              </button>
              {cursor > 0 ? (
                <button
                  type="button"
                  onClick={back}
                  className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-400 transition-colors hover:text-slate-700"
                >
                  {tk("action.back")}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={advance}
              disabled={answers[cursor] === null}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium transition-all",
                style.radius,
                answers[cursor] === null
                  ? "cursor-not-allowed bg-slate-200 text-slate-400"
                  : "bg-blue-700 text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] hover:bg-blue-800",
              )}
            >
              {isLast ? tk("diag.defaultStart") : tk("action.continue")}
              <ChevronRight size={14} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 一道题。 */
function QuestionBlock({
  question,
  index,
  value,
  playful,
  burst,
  onPick,
}: {
  question: K12DiagnosticQuestion;
  index: number;
  value: number | null;
  playful: boolean;
  burst: boolean;
  onPick: (optionIndex: number) => void;
}) {
  const { tk } = useLocale();
  const style = styleOf(playful);
  /** 双语偏好题——单独用一套 UI 渲染。 */
  const isBilingual = question.concept === "__bilingual__";

  return (
    <div>
      <p className="mb-3 flex items-start gap-2 text-[17px] font-semibold leading-snug text-slate-900">
        <span className="mt-1 shrink-0 tabular-nums text-[13px] font-normal text-slate-400">
          {index + 1}.
        </span>
        <span>
          {question.question}
          {question.isBackground ? (
            <span className="ml-2 rounded-full bg-slate-900/[0.06] px-2 py-0.5 align-middle text-[11px] font-normal text-slate-500">
              {tk("diag.background")}
            </span>
          ) : null}
        </span>
      </p>

      <div className={cn("space-y-2", isBilingual ? "pl-0" : "pl-7")}>
        {isBilingual ? null : (
          question.options.map((option, optionIndex) => {
            const selected = value === optionIndex;
            const correct = optionIndex === question.correctIndex;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onPick(optionIndex)}
                className={cn(
                  "relative flex w-full items-center gap-3 border px-3.5 py-2.5 text-left text-[15px] leading-snug",
                  style.radius,
                  // 小学部：Q 弹按压。初高中：克制的颜色过渡。
                  playful && "seek-press",
                  !playful && "transition-all",
                  selected
                    ? "border-blue-700/50 bg-blue-600/[0.10] font-medium text-slate-900"
                    : "border-slate-900/[0.10] bg-white/70 text-slate-800 hover:border-slate-900/[0.20] hover:bg-white",
                )}
              >
                {/* 答对时的彩星迸射（仅小学部）。 */}
                {playful && burst && selected && correct ? (
                  <SuccessBurst playful active />
                ) : null}

                {/* 选择圈。 */}
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
                    selected
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-400/60",
                  )}
                >
                  {selected ? <Check size={11} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">{option}</span>
              </button>
            );
          })
        )}
      </div>

      {/* 最后一个问题：双语偏好。 */}
      {isBilingual ? (
        <BilingualChoice value={value} onPick={onPick} />
      ) : null}
    </div>
  );
}

/**
 * 双语辅助偏好。
 *
 * 极简——只有两个按钮。这是**海外学情偏好**，不是知识题。
 */
function BilingualChoice({
  value,
  onPick,
}: {
  value: number | null;
  onPick: (optionIndex: number) => void;
}) {
  const { tk } = useLocale();

  return (
    <div className="mt-4 rounded-xl border border-slate-900/[0.08] bg-slate-50/80 px-3.5 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-slate-700">
        <Globe size={13} strokeWidth={2.2} className="text-slate-500" />
        {tk("diag.bilingual")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onPick(0)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
            value === 0
              ? "border-blue-700/45 bg-blue-600/10 font-medium text-slate-900"
              : "border-slate-900/[0.10] bg-white text-slate-700 hover:border-slate-900/[0.20]",
          )}
        >
          {tk("diag.bilingualYes")}
        </button>
        <button
          type="button"
          onClick={() => onPick(1)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
            value === 1
              ? "border-blue-700/45 bg-blue-600/10 font-medium text-slate-900"
              : "border-slate-900/[0.10] bg-white text-slate-700 hover:border-slate-900/[0.20]",
          )}
        >
          {tk("diag.bilingualNo")}
        </button>
      </div>
    </div>
  );
}
