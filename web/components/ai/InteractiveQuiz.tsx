"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleHelp, X } from "lucide-react";
import type { QuizCard, QuizQuestion } from "@/context/ChatContext";
import { submitQuizAnswers } from "@/lib/learning-api";
import { emitLearningEvent, PROGRESS_UPDATED } from "@/lib/learning-events";
import Markdown from "@/components/common/Markdown";
import { cn } from "@/lib/cn";

/**
 * 交互式答题卡。
 *
 * AI 通过 ``trigger_quiz`` 动作生成的测验会渲染成这个卡片：用户点选项、
 * 提交、看到批改与解析。它不是一个静态的题目列表——**能答、能判**。
 *
 * 批改在本地做：正确答案下标随题目一起下发，没有额外的往返。
 *
 * 但**作答要落盘**
 * ----------------
 *
 * 本地批改只是给用户看的。学情中心要显示「测验正确率」，就必须知道
 * 用户真的选了哪个选项——所以提交时会把作答写回后端（``chosen``）。
 * 没有这一步，正确率永远是「—」，而「已掌握 / 薄弱需巩固」的判断
 * 也就永远无从谈起。
 */
export function InteractiveQuiz({
  quiz,
  courseId,
}: {
  quiz: QuizCard;
  courseId?: string;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  /** 本次测验在后端的 id——提交作答时要带上。 */
  const quizIdRef = useRef<string>(quiz.id ?? "");

  // 换一张测验卡就重置作答状态。
  useEffect(() => {
    setAnswers({});
    setSubmitted(false);
    quizIdRef.current = quiz.id ?? "";
  }, [quiz.id, quiz.title]);

  if (!quiz.questions?.length) return null;

  const answeredAll = quiz.questions.every(
    (_, index) => answers[index] !== undefined,
  );

  /** 提交答案 —— 同时把作答写回后端。 */
  const submit = async () => {
    setSubmitted(true);
    if (!courseId || !quizIdRef.current) return;
    const ok = await submitQuizAnswers(courseId, quizIdRef.current, answers);
    if (ok) {
      // 学情中心的正确率变了——通知它刷新。
      emitLearningEvent(PROGRESS_UPDATED, { courseId, source: "quiz" });
    }
  };

  return (
    <section
      aria-label="随堂测验"
      className="mt-2.5 rounded-xl bg-[var(--background)] p-3 ring-1 ring-[var(--border)]"
    >
      <header className="mb-2.5 flex items-center gap-1.5">
        <CircleHelp size={13} strokeWidth={1.8} className="text-[var(--primary)]" />
        <h4 className="text-[12px] font-semibold">
          {quiz.title || "随堂检验"}
        </h4>
        {submitted && (
          <span className="ml-auto text-[10.5px] text-[var(--muted-foreground)]">
            {scoreText(quiz.questions, answers)}
          </span>
        )}
      </header>

      <ol className="space-y-3.5">
        {quiz.questions.map((question, index) => (
          <li key={index}>
            <QuestionItem
              question={question}
              index={index}
              answer={answers[index]}
              submitted={submitted}
              onPick={(optionIndex) => {
                if (submitted) return;
                setAnswers((prev) => ({ ...prev, [index]: optionIndex }));
              }}
            />
          </li>
        ))}
      </ol>

      {!submitted ? (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!answeredAll}
          className="mt-3 w-full rounded-lg bg-[var(--foreground)] px-3 py-2 text-[12px] font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-35"
        >
          {answeredAll ? "提交答案" : "回答全部题目后可提交"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setAnswers({});
          }}
          className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/50 hover:text-[var(--foreground)]"
        >
          重做一遍
        </button>
      )}
    </section>
  );
}

/** 一道题。 */
function QuestionItem({
  question,
  index,
  answer,
  submitted,
  onPick,
}: {
  question: QuizQuestion;
  index: number;
  answer?: number;
  submitted: boolean;
  onPick: (optionIndex: number) => void;
}) {
  const options = question.options ?? [];
  const correct = question.answer;

  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium leading-relaxed">
        {index + 1}. {question.question}
      </p>

      <ul className="space-y-1">
        {options.map((option, optionIndex) => {
          const picked = answer === optionIndex;
          const isCorrect = optionIndex === correct;

          let tone =
            "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]/50";
          if (submitted) {
            if (isCorrect) {
              tone = "border-emerald-500/40 bg-emerald-50";
            } else if (picked) {
              tone = "border-destructive/40 bg-destructive/8";
            } else {
              tone = "border-[var(--border)] bg-[var(--card)] opacity-60";
            }
          } else if (picked) {
            tone = "border-[var(--primary)]/50 bg-[var(--primary)]/8";
          }

          return (
            <li key={optionIndex}>
              <button
                type="button"
                onClick={() => onPick(optionIndex)}
                disabled={submitted}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] leading-relaxed transition-colors",
                  tone,
                  submitted && "cursor-default",
                )}
              >
                <span className="mt-[1px] shrink-0">
                  {submitted && isCorrect ? (
                    <Check size={12} className="text-emerald-600" />
                  ) : submitted && picked ? (
                    <X size={12} className="text-destructive" />
                  ) : (
                    <span className="block h-3 w-3 rounded-full border border-[var(--muted-foreground)]/50" />
                  )}
                </span>
                <span className="min-w-0 flex-1">{option}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
                  {String.fromCharCode(65 + optionIndex)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {submitted && correct === -1 && (
        <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
          这题未给出标准答案，请对照下方解析自行判断。
        </p>
      )}

      {submitted && question.explanation && (
        <div className="mt-1.5 rounded-lg bg-[var(--muted)]/35 px-2.5 py-2 text-[11.5px] leading-relaxed">
          <span className="font-medium">解析：</span>
          <Markdown content={question.explanation} className="inline" />
        </div>
      )}
    </div>
  );
}

/** 得分文案。 */
function scoreText(
  questions: QuizQuestion[],
  answers: Record<number, number>,
): string {
  const gradable = questions.filter((item) => item.answer >= 0);
  if (gradable.length === 0) return "已完成";
  const correct = gradable.filter(
    (item, index) => answers[questions.indexOf(item)] === item.answer,
  ).length;
  return `${correct} / ${gradable.length} 答对`;
}
