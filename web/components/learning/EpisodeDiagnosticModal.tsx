"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import type { Episode } from "@/lib/courses-api";
import {
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
  WrongShake,
  styleOf,
} from "@/components/learning/AdaptiveStage";
import { cn } from "@/lib/cn";

/**
 * 居中磨砂玻璃 3D 进课诊断卡
 * ============================
 *
 * 每次进入一门课的新一集（且本集尚未完成诊断）时**自动弹出**。
 *
 * 视觉
 * ----
 *
 * 全屏毛玻璃遮罩（``backdrop-blur-md bg-slate-950/30``）+
 * 正中一张通透立体的磨砂玻璃卡片：
 *
 * * 半透明浅白玻璃底 + 深蓝微光；
 * * 细腻高光描边（顶部更亮，模拟光源）；
 * * 柔和的立体投影；
 * * 弹性入场动效。
 *
 * 为什么用玻璃拟态
 * ----------------
 *
 * 它在视觉上**不属于页面**——所以用户不会误以为它是课程内容的一部分，
 * 而是「系统正在跟你对话」。深蓝 / 黑 / 白三色的极简基调没有被破坏：
 * 玻璃底是半透明白，文字是深蓝，唯一的强调色是深蓝。
 *
 * 分龄适配
 * --------
 *
 * 小学部的卡片**更圆润**，选项有 Q 弹按压与彩星迸射；初高中部
 * 保持利落 academically——同样的结构，不同的视觉语言。
 *
 * 交互
 * ----
 *
 * 2–3 道**直击本课核心知识点**的短题 + 1 道背景摸底题，
 * 每题三档选项对应三个掌握层级。底部两个动作：
 *
 * * **跳过** —— 按默认难度开始；
 * * **按默认难度开始** —— 显式提交作答。
 *
 * 诊断完成后，结果静默写入 localStorage，并被拼进 AI 助教的
 * system prompt（见 ``lib/diagnostic-profile.ts``）。
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

  /**
   * 当前题的作答。
   *
   * ``null`` = 还没答。值是选项下标。
   */
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  /** 是否已经进入「提交」状态。 */
  const [submitted, setSubmitted] = useState(false);
  /** 刚刚答对的那一题——触发彩星迸射。 */
  const [burstIndex, setBurstIndex] = useState<number | null>(null);

  /**
   * 诊断题。
   *
   * 用 ``useMemo`` 而不是 ``useState``——题目是**纯函数**的产物，
   * 每次渲染重算会丢掉用户的作答状态。
   */
  const questions: K12DiagnosticQuestion[] = useMemo(
    () =>
      buildK12DiagnosticQuestions(
        episode.title,
        subject,
        stage,
        nodes,
        segments,
      ),
    [episode.title, subject, stage, nodes, segments],
  );

  /** 打开时重置状态。 */
  useEffect(() => {
    if (!open) return;
    setAnswers(new Array(questions.length).fill(null));
    setSubmitted(false);
    setBurstIndex(null);
  }, [open, questions.length]);

  /**
   * Esc 关闭。
   *
   * ⚠️ 只在**提交之前**生效——提交之后如果按 Esc 就把结果丢了，
   *    那不对。
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
        at: Date.now(),
      });

      onClose();
    },
    [answers, questions, resourceId, episode, courseTitle, onClose],
  );

  /** 选一个选项。 */
  const pick = useCallback((questionIndex: number, optionIndex: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
    setSubmitted(false);
  }, []);

  /** 是否全部答完。 */
  const allAnswered = answers.every(
    (answer, index) => answer !== null && index < questions.length,
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-md motion-safe:animate-[diagnostic-backdrop-in_300ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="进课诊断"
    >
      {/*
        卡片本体
        -------
        立体感来自四层叠加：
        ① 半透明玻璃底；② 顶部高光渐变；③ 细描边；④ 双层投影。
      */}
      <div
        className={cn(
          "relative w-full max-w-[540px] overflow-hidden",
          style.radius,
          // 玻璃底：半透明白 + 深蓝微光渐变。
          "border border-white/60 bg-white/72",
          "shadow-[0_24px_70px_-12px_rgba(15,23,42,0.35),0_2px_8px_rgba(15,23,42,0.10)]",
          "backdrop-blur-2xl",
          // 弹性入场。
          "animate-[diagnostic-in_420ms_cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        {/* 顶部高光——模拟光源从上方来。 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/70 via-white/15 to-transparent"
        />
        {/* 深蓝微光——从右上角渗入，给玻璃一点颜色。 */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-600/[0.07] blur-2xl"
        />

        <div className="relative p-6 sm:p-7">
          {/* ── 头部 ── */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {/* 伴学小星——只给小学部。 */}
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
                    进课诊断
                  </span>
                </div>
                <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
                  先确认一下你现在的水平
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
                  助教会按你的起点讲解这一讲——不会从你已经会的地方讲起。
                </p>
              </div>
            </div>

            {/* 关闭按钮——与「跳过」等价。 */}
            <button
              type="button"
              onClick={() => finish(true)}
              aria-label="跳过诊断"
              title="跳过诊断"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-700"
            >
              <X size={15} strokeWidth={2.2} />
            </button>
          </div>

          {/* ── 本集信息 ── */}
          <div
            className={cn(
              "mb-4 border border-blue-900/[0.08] bg-blue-50/45 px-3.5 py-2.5",
              style.radius,
            )}
          >
            <p className="text-[11px] text-slate-500">
              {courseTitle}
              {episode.total > 1
                ? ` · 第 ${episode.index} / ${episode.total} 讲`
                : ""}
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-slate-900">
              {episode.title}
            </p>
          </div>

          {/* ── 题目 ── */}
          <div className="space-y-4">
            {questions.map((question, questionIndex) => (
              <QuestionBlock
                key={`${question.concept}-${questionIndex}`}
                question={question}
                index={questionIndex}
                total={questions.length}
                value={answers[questionIndex] ?? null}
                playful={playful}
                burst={burstIndex === questionIndex}
                onPick={(optionIndex) => {
                  pick(questionIndex, optionIndex);
                  // 选中「最深」那档 → 答对 → 触发庆祝。
                  if (optionIndex === question.correctIndex) {
                    setBurstIndex(questionIndex);
                  } else {
                    setBurstIndex(null);
                  }
                }}
              />
            ))}
          </div>

          {/* ── 底部动作 ── */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-900/[0.07] pt-4">
            <button
              type="button"
              onClick={() => finish(true)}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:text-slate-800"
            >
              跳过，按默认难度开始
            </button>
            <button
              type="button"
              onClick={() => finish(false)}
              disabled={!allAnswered}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium transition-all",
                style.radius,
                allAnswered
                  ? "bg-blue-700 text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] hover:bg-blue-800"
                  : "cursor-not-allowed bg-slate-200 text-slate-400",
              )}
            >
              按默认难度开始
              <ChevronRight size={13} strokeWidth={2.4} />
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
  total,
  value,
  playful,
  burst,
  onPick,
}: {
  question: K12DiagnosticQuestion;
  index: number;
  total: number;
  value: number | null;
  playful: boolean;
  burst: boolean;
  onPick: (optionIndex: number) => void;
}) {
  const style = styleOf(playful);

  return (
    <div>
      <p className="mb-2 flex items-start gap-2 text-[13px] font-medium leading-snug text-slate-900">
        <span className="mt-px shrink-0 tabular-nums text-slate-400">
          {index + 1}/{total}
        </span>
        <span>
          {question.question}
          {question.isBackground ? (
            <span className="ml-1.5 rounded-full bg-slate-900/[0.06] px-1.5 py-px align-middle text-[10px] font-normal text-slate-500">
              背景摸底
            </span>
          ) : null}
        </span>
      </p>

      <div className="space-y-1.5 pl-6">
        {question.options.map((option, optionIndex) => {
          const selected = value === optionIndex;
          const correct = optionIndex === question.correctIndex;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onPick(optionIndex)}
              className={cn(
                "relative flex w-full items-center gap-2.5 border px-3 py-2 text-left text-[12.5px] leading-snug",
                style.radius,
                // 小学部：Q 弹按压。初高中：克制的颜色过渡。
                playful && "seek-press",
                !playful && "transition-all",
                selected
                  ? "border-blue-700/45 bg-blue-600/[0.09] text-slate-900"
                  : "border-slate-900/[0.08] bg-white/55 text-slate-700 hover:border-slate-900/[0.16] hover:bg-white/85",
              )}
            >
              {/* 答对时的彩星迸射（仅小学部）。 */}
              {playful && burst && selected && correct ? (
                <SuccessBurst playful active />
              ) : null}

              {/* 选择圈。 */}
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  selected
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-400/60",
                )}
              >
                {selected ? <Check size={10} strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
