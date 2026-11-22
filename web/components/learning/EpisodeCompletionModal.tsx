"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Lightbulb,
  NotebookPen,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import type { Episode } from "@/lib/courses-api";
import { analyzeLessonTitle } from "@/lib/lesson-analyzer";
import {
  NodePath,
  StudyBuddy,
  styleOf,
} from "@/components/learning/AdaptiveStage";
import { cn } from "@/lib/cn";
import { useLocale } from "@/context/LocaleContext";

/**
 * 单集学完闭环
 * ============
 *
 * 四步，**依次**在居中玻璃卡片里承接：
 *
 * .. code-block:: text
 *
 *     步骤 1 · 本课随堂测试   →  提交后即时给出简洁解析
 *     步骤 2 · 本课核心总结   →  3 条结构化要点 + [存入我的笔记]
 *     步骤 3 · 进度达成庆祝   →  本集已完成 · 总进度 X / Y 讲（XX%）
 *     步骤 4 · 顺畅推进       →  [继续下一讲 →] / [🎓 领取结业证书]
 *
 * 为什么分步而不是一次给完
 * ------------------------
 *
 * 一次给完，用户会「读完就走」——他不知道自己**到底学没学会**。
 * 分步走，每一步都有一次**明确的确认动作**：
 *
 * * 答完题 → 看到解析 → 确认「我懂了 / 没懂」；
 * * 看到总结 → 决定要不要存进笔记；
 * * 看到进度 → 知道离下一讲还有多远。
 *
 * 分龄庆祝
 * --------
 *
 * 小学部：**轻盈活泼**的彩星 / 礼花微庆祝 + 跳跃的成就徽章；
 * 初高中部：**克制优雅**的深蓝银白粒子绽放 + 发光进度环。
 *
 * 两者共用同一套骨架——差异只在动效的**表现层**，不会漂移。
 */

/** 闭环的四个阶段。 */
export type CompletionStage = "quiz" | "summary" | "celebrate" | "advance";

/** 一道随堂测试题。 */
export interface CompletionQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/** 一条知识总结。 */
export interface SummaryPoint {
  title: string;
  content: string;
}

/** 组件属性。 */
export interface EpisodeCompletionModalProps {
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
  /** 全部集——用来算总进度与「下一讲」。 */
  allEpisodes: Episode[];
  /** 本集的知识节点——出题来源。 */
  nodes?: Array<{ timestamp: number; keyword: string; hint?: string; context?: string }>;
  /** 本集的段落导读——出题与总结的来源。 */
  segments?: Array<{ timestamp: number; title: string; content: string }>;
  /** 学段——决定庆祝动效风格。 */
  stage?: "primary" | "junior" | "senior";
  /** 学科。 */
  subject?: "chinese" | "math";
  /** 「存入我的笔记」按钮的回调。 */
  onSaveNote?: (text: string) => void;
  /**
   * 「继续下一讲」/「领取结业证书」的回调。
   *
   * 由外层页面负责跳转——这个组件不知道路由长什么样。
   */
  onContinue?: () => void;
}

/**
 * 从本集内容里生成随堂测试题。
 *
 * 与诊断题的区别：诊断题问「你懂不懂」，测试题问「**具体内容**是什么」。
 * 所以这里的选项是**实质内容**（三个说法），不是掌握层级。
 */
function buildCompletionQuestions(
  episode: Episode,
  nodes: Array<{ keyword: string; hint?: string; context?: string }>,
  segments: Array<{ title: string; content: string }>,
): CompletionQuestion[] {
  const questions: CompletionQuestion[] = [];
  const seen = new Set<string>();

  const push = (
    question: string,
    correct: string,
    wrongs: string[],
    explanation: string,
  ) => {
    if (question.trim().length < 6) return;
    if (seen.has(question)) return;
    seen.add(question);

    // 正确选项的位置**打散**——总是第一个会被猜中。
    const options = [correct, ...wrongs];
    const correctIndex = 0;
    questions.push({
      question: question.trim(),
      options,
      correctIndex,
      explanation,
    });
  };

  // ── 知识节点 → 本集的核心概念是什么 ──
  for (const node of nodes.slice(0, 3)) {
    if (questions.length >= 3) break;
    const keyword = node.keyword?.trim();
    if (!keyword) continue;
    const context = (node.hint || node.context || "").trim();
    push(
      `「${keyword}」在本讲中承担的作用是什么？`,
      context || `它是本讲的关键概念，讲清它就抓住了这一讲的主线。`,
      [
        "它只是课程开头的一个背景介绍，可以略过",
        "它是本讲的关键概念，讲清它就抓住了这一讲的主线",
        "它只出现在片尾的致谢部分，不影响理解",
      ],
      context ||
        `「${keyword}」是本讲埋下的关键点——理解它之后，后面的推导才接得上。`,
    );
  }

  // ── 段落导读 ──
  for (const segment of segments) {
    if (questions.length >= 3) break;
    const title = segment.title?.trim();
    if (!title) continue;
    push(
      `本讲在「${title}」这一段，主要在说明什么？`,
      (segment.content || "").trim() || `这一段围绕「${title}」展开。`,
      [
        "这一段是课程附带的补充阅读，与主线无关",
        `这一段围绕「${title}」展开，是理解本讲的关键环节。`,
        "这一段只是重复前面讲过的内容",
      ],
      (segment.content || "").trim().slice(0, 160) ||
        `「${title}」是本讲的结构性环节之一。`,
    );
  }

  // ── 兜底：用课时标题解析出的知识点 ──
  if (questions.length === 0) {
    const analysis = analyzeLessonTitle(episode.title);
    const concept = analysis.keywords[0] || analysis.lesson || episode.title.trim();
    push(
      `「${concept}」这一讲要建立的核心认知是什么？`,
      analysis.focus,
      [
        "只是介绍了一些背景，没有具体内容",
        analysis.focus,
        "这一讲主要是课程宣传，没有实质内容",
      ],
      analysis.focus,
    );
  }

  return questions.slice(0, 3);
}

/**
 * 从本集内容里提炼 3 条结构化收获。
 */
function buildSummaryPoints(
  episode: Episode,
  nodes: Array<{ keyword: string; hint?: string; context?: string }>,
  segments: Array<{ title: string; content: string }>,
): SummaryPoint[] {
  const points: SummaryPoint[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (points.length >= 3) break;
    const keyword = node.keyword?.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    const content =
      (node.hint || node.context || "").trim() ||
      `本讲的关键点之一——把它和相邻的概念连起来，才算真正掌握。`;
    points.push({
      title: keyword,
      content: content.length > 120 ? `${content.slice(0, 118)}…` : content,
    });
  }

  for (const segment of segments) {
    if (points.length >= 3) break;
    const title = segment.title?.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    points.push({
      title,
      content:
        (segment.content || "").trim().slice(0, 120) ||
        `本讲在「${title}」这一段推进了主线。`,
    });
  }

  if (points.length === 0) {
    // 没有节点 / 导读时，用**课时标题解析**的知识点兜底。
    const analysis = analyzeLessonTitle(episode.title);
    for (const keyword of analysis.keywords) {
      if (points.length >= 3) break;
      if (seen.has(keyword)) continue;
      seen.add(keyword);
      points.push({
        title: keyword,
        content: analysis.focus,
      });
    }
  }

  if (points.length === 0) {
    points.push({
      title: episode.title.trim(),
      content:
        "这一讲建立了主线概念。建议合上视频，用自己的话复述一遍它的核心主张。",
    });
  }

  return points.slice(0, 3);
}

export function EpisodeCompletionModal({
  open,
  onClose,
  resourceId,
  courseTitle,
  episode,
  allEpisodes,
  nodes = [],
  segments = [],
  stage = "junior",
  subject = "math",
  onSaveNote,
  onContinue,
}: EpisodeCompletionModalProps) {
  /**
   * 当前阶段。
   *
   * ⚠️ 状态变量叫 ``phase`` 而不是 ``stage``——``stage`` 在这个文件里
   *    已经被「学段」占用了。两个概念不能共用一个名字。
   */
  const [phase, setPhase] = useState<CompletionStage>("quiz");
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [submitted, setSubmitted] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const { tk } = useLocale();
  const playful = stage === "primary";
  const style = styleOf(playful);

  const questions = useMemo(
    () => buildCompletionQuestions(episode, nodes, segments),
    [episode, nodes, segments],
  );
  const summaryPoints = useMemo(
    () => buildSummaryPoints(episode, nodes, segments),
    [episode, nodes, segments],
  );

  /** 打开时重置到第一步。 */
  useEffect(() => {
    if (!open) return;
    setPhase("quiz");
    setAnswers(new Array(questions.length).fill(null));
    setSubmitted(false);
    setNoteSaved(false);
  }, [open, questions.length]);

  /**
   * 总进度。
   *
   * 进度是**真实**的——由上层组件根据观看记录算好后传进来。
   * 这里不自己数，因为「已完成」的判定口径必须在**一处**统一。
   */
  const progress = useMemo(() => {
    const index = allEpisodes.findIndex(
      (item) => item.ep_id === episode.ep_id,
    );
    const next = index >= 0 ? allEpisodes[index + 1] : null;
    return {
      index,
      next,
      isLast: index >= 0 && index === allEpisodes.length - 1,
      done: Math.max(0, index + 1),
      total: allEpisodes.length,
    };
  }, [allEpisodes, episode.ep_id]);

  /** 选一个选项。 */
  const pick = useCallback((questionIndex: number, optionIndex: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
    setSubmitted(false);
  }, []);

  /** 提交答案 → 显示解析。 */
  const submit = useCallback(() => {
    setSubmitted(true);
  }, []);

  /** 进入下一步。 */
  const nextStage = useCallback(() => {
    if (phase === "quiz") {
      setPhase("summary");
      return;
    }
    if (phase === "summary") {
      setPhase("celebrate");
      return;
    }
    setPhase("advance");
  }, [phase]);

  /**
   * 「存入我的笔记」。
   *
   * 把 3 条收获拼成一段 Markdown——存进去之后是一条**完整的笔记**，
   * 而不是三个碎片。
   */
  const saveNote = useCallback(() => {
    const text = [
      `## 《${courseTitle}》${episode.index > 1 ? ` 第 ${episode.index} 讲` : ""} · ${episode.title}`,
      "",
      ...summaryPoints.flatMap((point) => [
        `### ${point.title}`,
        point.content,
        "",
      ]),
    ].join("\n");
    onSaveNote?.(text);
    setNoteSaved(true);
  }, [courseTitle, episode, summaryPoints, onSaveNote]);

  if (!open) return null;

  const STEPS = [
    { id: "quiz", label: tk("done.stepQuiz") },
    { id: "summary", label: tk("done.stepSummary") },
    { id: "celebrate", label: tk("done.stepCelebrate") },
    { id: "advance", label: "下一步" },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-md motion-safe:animate-[diagnostic-backdrop-in_300ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="本集检测"
    >
      <div
        className={cn(
          "relative w-full max-w-[560px] overflow-hidden",
          style.radius,
          "border border-slate-200 bg-white",
          "shadow-[0_24px_70px_-12px_rgba(15,23,42,0.35),0_2px_8px_rgba(15,23,42,0.10)]",
          "backdrop-blur-2xl",
          "motion-safe:animate-[diagnostic-in_420ms_cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/70 via-white/15 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-600/[0.07] blur-2xl"
        />

        {/* ── 步骤指示 ── */}
        <div className="relative flex items-center gap-1.5 border-b border-slate-900/[0.07] px-6 pt-5 pb-3.5">
          {STEPS.map((step, index) => {
            const current = STEPS.findIndex((item) => item.id === phase);
            const done = index < current;
            const active = index === current;
            return (
              <div key={step.id} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full text-[9.5px] font-medium tabular-nums transition-colors",
                    done
                      ? "bg-blue-700 text-white"
                      : active
                        ? "bg-blue-50 text-blue-800 ring-1 ring-blue-700/35"
                        : "bg-slate-900/[0.06] text-slate-400",
                  )}
                  style={{ height: 18, width: 18 }}
                >
                  {done ? <Check size={10} strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-[11px] transition-colors",
                    active || done ? "text-slate-700" : "text-slate-400",
                  )}
                >
                  {step.label}
                </span>
                {index < STEPS.length - 1 ? (
                  <ChevronRight
                    size={11}
                    strokeWidth={2.2}
                    className="mx-0.5 text-slate-300"
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="relative max-h-[72vh] overflow-y-auto p-6 sm:p-7">
          {phase === "quiz" ? (
            <QuizStage
              questions={questions}
              answers={answers}
              submitted={submitted}
              playful={playful}
              onPick={pick}
              onSubmit={submit}
              onNext={nextStage}
            />
          ) : null}

          {phase === "summary" ? (
            <SummaryStage
              points={summaryPoints}
              noteSaved={noteSaved}
              playful={playful}
              onSaveNote={saveNote}
              onNext={nextStage}
            />
          ) : null}

          {phase === "celebrate" ? (
            <CelebrateStage
              courseTitle={courseTitle}
              episode={episode}
              done={progress.done}
              total={progress.total}
              playful={playful}
            />
          ) : null}

          {phase === "advance" ? (
            <AdvanceStage
              courseTitle={courseTitle}
              episode={episode}
              done={progress.done}
              total={progress.total}
              isLast={progress.isLast}
              next={progress.next}
              playful={playful}
              onContinue={onContinue}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 步骤 1 · 随堂测试。 */
function QuizStage({
  questions,
  answers,
  submitted,
  playful,
  onPick,
  onSubmit,
  onNext,
}: {
  questions: CompletionQuestion[];
  answers: Array<number | null>;
  submitted: boolean;
  playful: boolean;
  onPick: (questionIndex: number, optionIndex: number) => void;
  onSubmit: () => void;
  onNext: () => void;
}) {
  const { tk } = useLocale();
  const allAnswered = answers.every(
    (answer, index) => answer !== null && index < questions.length,
  );
  const style = styleOf(playful);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
          {tk("done.stepQuiz")}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
          {questions.length} 道题，检验这一讲的关键点有没有真的接住。
        </p>
      </div>

      <div className="space-y-4">
        {questions.map((question, questionIndex) => {
          const answer = answers[questionIndex] ?? null;
          const correct = answer === question.correctIndex;
          return (
            <div key={`${question.question}-${questionIndex}`}>
              <p className="mb-2 flex items-start gap-2 text-[13px] font-medium leading-snug text-slate-900">
                <span className="mt-px shrink-0 tabular-nums text-slate-400">
                  {questionIndex + 1}/{questions.length}
                </span>
                <span>{question.question}</span>
              </p>
              <div className="space-y-1.5 pl-6">
                {question.options.map((option, optionIndex) => {
                  const selected = answer === optionIndex;
                  const isCorrect = optionIndex === question.correctIndex;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => !submitted && onPick(questionIndex, optionIndex)}
                      disabled={submitted}
                      className={cn(
                        "flex w-full items-center gap-2.5 border px-3 py-2 text-left text-[12.5px] leading-snug",
                        style.radius,
                        playful && !submitted && "seek-press",
                        !playful && "transition-all",
                        submitted && isCorrect
                          ? "border-emerald-600/40 bg-emerald-50 text-slate-900"
                          : submitted && selected
                            ? "border-rose-500/40 bg-rose-50 text-slate-900"
                            : selected
                              ? "border-blue-700/45 bg-blue-600/[0.09] text-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-700 hover:bg-blue-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                          submitted && isCorrect
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : submitted && selected
                              ? "border-rose-500 bg-rose-500 text-white"
                              : selected
                                ? "border-blue-700 bg-blue-700 text-white"
                                : "border-slate-400/60",
                        )}
                      >
                        {submitted && isCorrect ? (
                          <Check size={10} strokeWidth={3} />
                        ) : submitted && selected ? (
                          <X size={9} strokeWidth={3} />
                        ) : selected ? (
                          <Check size={10} strokeWidth={3} />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">{option}</span>
                    </button>
                  );
                })}
              </div>

              {/* 提交后即时给出解析。 */}
              {submitted ? (
                <div
                  className={cn(
                    "ml-6 mt-2 border px-3 py-2 text-[11.5px] leading-relaxed",
                    style.radius,
                    correct
                      ? "border-emerald-600/25 bg-emerald-50 text-slate-700"
                      : "border-amber-500/30 bg-amber-50 text-slate-700",
                  )}
                >
                  <span className="font-medium">
                    {correct ? "答对了。" : "再看一眼。"}
                  </span>{" "}
                  {question.explanation}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-900/[0.07] pt-4">
        <span className="text-[11.5px] text-slate-500">
          {submitted
            ? `答对 ${questions.filter((question, index) => answers[index] === question.correctIndex).length} / ${questions.length}`
            : "答完所有题目后提交"}
        </span>
        {submitted ? (
          <button
            type="button"
            onClick={onNext}
            className={cn(
              "inline-flex items-center gap-1.5 bg-blue-700 px-4 py-2 text-[12.5px] font-medium text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-opacity hover:opacity-90",
              style.radius,
            )}
          >
            看本课总结
            <ChevronRight size={13} strokeWidth={2.4} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!allAnswered}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium transition-all",
              style.radius,
              allAnswered
                ? "bg-blue-700 text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] hover:bg-blue-800"
                : "cursor-not-allowed bg-slate-200 text-slate-400",
            )}
          >
            提交答案
            <ChevronRight size={13} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}

/** 步骤 2 · 核心总结。 */
function SummaryStage({
  points,
  noteSaved,
  playful,
  onSaveNote,
  onNext,
}: {
  points: SummaryPoint[];
  noteSaved: boolean;
  playful: boolean;
  onSaveNote: () => void;
  onNext: () => void;
}) {
  const { tk } = useLocale();
  const style = styleOf(playful);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
          {tk("done.stepSummary")}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
          三条结构化的收获——存进笔记，之后随时回看。
        </p>
      </div>

      <ul className="space-y-2.5">
        {points.map((point, index) => (
          <li
            key={`${point.title}-${index}`}
            className={cn(
              "border border-slate-200 bg-slate-50 px-3.5 py-3",
              style.radius,
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-blue-100 text-[9.5px] font-medium tabular-nums text-blue-900 ring-1 ring-blue-200"
                style={{ height: 18, width: 18 }}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-slate-900">
                  {point.title}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                  {point.content}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-900/[0.07] pt-4">
        <span className="text-[11.5px] text-slate-500">
          {noteSaved ? tk("done.saved") : tk("done.saveNote")}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSaveNote}
            disabled={noteSaved}
            className={cn(
              "inline-flex items-center gap-1.5 border px-3 py-2 text-[12px] font-medium transition-all",
              style.radius,
              noteSaved
                ? "cursor-default border-emerald-600/30 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-700 hover:bg-blue-50",
            )}
          >
            {noteSaved ? (
              <CircleCheck size={13} strokeWidth={2.2} />
            ) : (
              <NotebookPen size={13} strokeWidth={2.2} />
            )}
            {noteSaved ? tk("done.saved") : tk("done.saveNote")}
          </button>
          <button
            type="button"
            onClick={onNext}
            className={cn(
              "inline-flex items-center gap-1.5 bg-blue-700 px-4 py-2 text-[12.5px] font-medium text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-opacity hover:opacity-90",
              style.radius,
            )}
          >
            查看达成
            <ChevronRight size={13} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 步骤 3 · 进度达成小庆祝。 */
function CelebrateStage({
  courseTitle,
  episode,
  done,
  total,
  playful,
}: {
  courseTitle: string;
  episode: Episode;
  done: number;
  total: number;
  playful: boolean;
}) {
  const { tk } = useLocale();
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  /** 环形进度条的周长（半径 34）。 */
  const circumference = 2 * Math.PI * 34;

  return (
    <div className="relative">
      {/* ── 粒子 ──
       *
       * 小学部是彩星 / 礼花式的活泼绽放；初高中是深蓝银白的细粒子，
       * 克制而优雅。
       */}
      <ParticleField playful={playful} />

      <div className="relative text-center">
        <div className="mb-1.5 flex items-center justify-center gap-1.5">
          {playful ? (
            <span className="seek-buddy inline-block">
              <StudyBuddy mood="cheer" playful={playful} />
            </span>
          ) : (
            <Sparkles
              size={12}
              strokeWidth={2.2}
              className="shrink-0 text-blue-700"
            />
          )}
          <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-blue-800/70">
            本课已完成
          </span>
        </div>

        {/* 环形进度条。 */}
        <div className="relative mx-auto mb-4 h-[92px] w-[92px]">
          <svg
            viewBox="0 0 80 80"
            className="h-full w-full -rotate-90"
            aria-hidden
          >
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="rgba(15,23,42,0.08)"
              strokeWidth="5"
            />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={playful ? "#f59e0b" : "#1d4ed8"}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              style={
                {
                  "--celebrate-circumference": `${circumference}`,
                  "--celebrate-target": `${circumference * (1 - percent / 100)}`,
                  animation: "celebrate-ring-in 900ms cubic-bezier(0.16,1,0.3,1) forwards",
                } as React.CSSProperties
              }
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-slate-900">
              {percent}%
            </span>
            <span className="mt-0.5 text-[10px] text-slate-500">
              {done} / {total} 讲
            </span>
          </div>
        </div>

        <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
          {episode.title}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
          《{courseTitle}》当前总进度 {done} / {total} 讲（{percent}%）
        </p>

        {/* 节点路径——小学部是逐颗点亮的趣味路径。 */}
        <div className="mt-4 flex justify-center">
          <NodePath
            total={Math.min(total, 12)}
            lit={Math.min(done, 12)}
            playful={playful}
          />
        </div>
      </div>
    </div>
  );
}

/** 步骤 4 · 顺畅推进。 */
function AdvanceStage({
  courseTitle,
  episode,
  done,
  total,
  isLast,
  next,
  playful,
  onContinue,
}: {
  courseTitle: string;
  episode: Episode;
  done: number;
  total: number;
  isLast: boolean;
  next: Episode | null;
  playful: boolean;
  onContinue?: () => void;
}) {
  const { tk } = useLocale();
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const style = styleOf(playful);

  return (
    <div>
      <div className="text-center">
        <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
          本课已完成 · 当前系列进度 {done} / {total} 课（{percent}%）
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
          《{courseTitle}》
        </p>
      </div>

      {/* ── 下一步 ── */}
      <div className="mt-6 flex justify-center border-t border-slate-900/[0.07] pt-4">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
            <Lightbulb size={12} strokeWidth={2} />
            {isLast
              ? "这是最后一讲"
              : next
                ? `下一讲 · ${next.title}`
                : "已到最后一讲"}
          </span>
          <button
            type="button"
            onClick={onContinue}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-opacity hover:opacity-90",
              style.radius,
              "bg-blue-700",
            )}
          >
            {isLast ? (
              <>
                <Trophy size={13} strokeWidth={2.2} />
                🎓 领取本册修习证书
              </>
            ) : (
              <>
                继续下一课 →
                <ArrowRight size={13} strokeWidth={2.4} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 粒子层。
 *
 * 用 CSS 变量做伪随机位移——粒子的位置由索引决定，
 * 不需要 JS 参与。
 */
function ParticleField({ playful }: { playful: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: playful ? 22 : 18 }, (_, index) => {
        // 伪随机——用索引乘黄金比散开。
        const angle = (index * 137.508) % 360;
        const radius = 40 + ((index * 29) % 70);
        const radians = (angle * Math.PI) / 180;
        return {
          x: `${Math.cos(radians) * radius}px`,
          y: `${Math.sin(radians) * radius * 0.8 - 40}px`,
          delay: `${(index % 6) * 90}ms`,
          duration: `${1100 + (index % 5) * 160}ms`,
          // 小学部是彩星色，初高中是深蓝银白。
          color: playful
            ? ["#f59e0b", "#38bdf8", "#fb7185", "#a78bfa"][index % 4]
            : index % 3 === 0
              ? "#1d4ed8"
              : index % 3 === 1
                ? "#e2e8f0"
                : "#93c5fd",
          size: playful ? 3 + (index % 4) : 2 + (index % 3),
          star: playful && index % 4 === 0,
        };
      }),
    [playful],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[240px] overflow-hidden"
    >
      {particles.map((particle, index) => (
        <span
          key={index}
          className={cn(
            "absolute left-1/2 top-1/2",
            particle.star ? "text-[#f59e0b]" : "rounded-full",
          )}
          style={
            {
              width: particle.star ? undefined : particle.size,
              height: particle.star ? undefined : particle.size,
              background: particle.star ? undefined : particle.color,
              fontSize: particle.star ? 16 : undefined,
              lineHeight: particle.star ? 1 : undefined,
              marginLeft: particle.star ? -8 : -particle.size / 2,
              marginTop: particle.star ? -8 : -particle.size / 2,
              "--celebrate-x": particle.x,
              "--celebrate-y": particle.y,
              animation: `celebrate-particle ${particle.duration} cubic-bezier(0.16,1,0.3,1) ${particle.delay} forwards`,
            } as React.CSSProperties
          }
        >
          {particle.star ? "★" : null}
        </span>
      ))}
    </div>
  );
}
