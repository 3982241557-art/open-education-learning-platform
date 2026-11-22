"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, ChevronRight, Lightbulb, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 本课巩固检测
 * =============
 *
 * 2–3 道**紧扣本课内容**的真实精炼题。提交后即时给出简洁解析。
 *
 * 为什么不做成「进课弹窗」
 * ----------------------
 *
 * 旧版在进课时弹一个诊断卡，用户还没看内容就要答两道题。这有两个
 * 问题：
 *
 * 1. **时机错了**——用户不知道这一讲讲什么，凭什么判断「你完全陌生」
 *    还是「已掌握基础」？那个三档选项其实是在**替用户编造**自我认知。
 * 2. **成本前置**——把「评估」放在「学习」之前，用户的第一���作就是
 *    被评估，学习体验从一开始就是被考核的。
 *
 * 现在的顺序是：**看课 → 玩教具 → 测**。测完之后再判断掌握度，
 * 依据是**真实作答**，而不是进课时的自我声明。
 *
 * 视觉
 * ----
 *
 * **100% 实心纯白**（``bg-white``）+ 1px 清晰边框 + 深炭黑文字。
 * 绝不使用半透明玻璃底——文字必须始终落在不透明底上。
 */

/** 一道巩固题。 */
export interface ConsolidationQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  concept: string;
}

/** 组件属性。 */
export interface ConsolidationCardProps {
  /** 题目。 */
  questions: ConsolidationQuestion[];
  /** 本课核心总结——展示在题目上方，作为「读完这些就该会了」的提示。 */
  takeaways?: string[];
  /** 全部答对时的回调。 */
  onPass?: (score: { correct: number; total: number }) => void;
  /** 教具探究完成数——用来判断「教具 + 巩固题」双达标。 */
  labProgress?: { done: number; total: number };
  /** 额外类名。 */
  className?: string;
}

export default function ConsolidationCard({
  questions,
  takeaways = [],
  onPass,
  labProgress,
  className,
}: ConsolidationCardProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);

  /** 已作答题数。 */
  const answeredCount = Object.keys(answers).length;
  /** 全部答完才允许提交。 */
  const allAnswered = answeredCount >= questions.length && questions.length > 0;

  /** 答对题数。 */
  const correctCount = useMemo(
    () =>
      questions.reduce(
        (total, item, index) =>
          total + (answers[index] === item.correctIndex ? 1 : 0),
        0,
      ),
    [answers, questions],
  );

  /** 是否通关。 */
  const passed = revealed && correctCount === questions.length;

  /** 提交。 */
  const submit = useCallback(() => {
    if (!allAnswered) return;
    setRevealed(true);
    if (correctCount === questions.length) {
      onPass?.({ correct: correctCount, total: questions.length });
    }
  }, [allAnswered, correctCount, onPass, questions.length]);

  /** 重做。 */
  const reset = useCallback(() => {
    setAnswers({});
    setRevealed(false);
  }, []);

  if (questions.length === 0) return null;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[#CBD5E1] bg-white",
        "shadow-[0_18px_44px_-18px_rgba(11,22,44,0.16)]",
        className,
      )}
    >
      {/* 顶部 3px 装饰线。 */}
      <div
        aria-hidden
        className="h-[3px]"
        style={{
          background: "linear-gradient(90deg, #0B162C 0%, #122344 55%, #B89B5E 100%)",
        }}
      />

      <div className="p-5 sm:p-6">
        {/* ── 头部 ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="text-[16px] text-[#0F172A]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              本课巩固检测
            </h3>
            <p className="mt-1 text-[12px] text-[#55606E]">
              {questions.length} 道题，答对全部即可点亮本课进度
            </p>
          </div>

          {/* 教具进度。 */}
          {labProgress && labProgress.total > 0 ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                labProgress.done >= labProgress.total
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-[#CBD5E1] bg-[#F8F7F4] text-[#55606E]",
              )}
            >
              {labProgress.done >= labProgress.total ? (
                <Check size={11} strokeWidth={3} />
              ) : null}
              教具探究 {labProgress.done}/{labProgress.total}
            </span>
          ) : null}
        </div>

        {/* ── 本课核心总结 ── */}
        {takeaways.length > 0 ? (
          <div className="mt-5 rounded-lg border border-[rgba(184,155,94,0.4)] bg-[#FFFEFA] px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.14em] text-[#B89B5E] uppercase">
              <Lightbulb size={11} strokeWidth={2.4} />
              本课要点
            </p>
            <ul className="mt-2 space-y-1.5">
              {takeaways.map((item, index) => (
                <li
                  key={index}
                  className="flex gap-2 text-[12.5px] leading-[1.8] text-[#1E293B]"
                >
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#B89B5E]" />
                  <span>{stripMarkdown(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ── 题目 ── */}
        <div className="mt-5 space-y-5">
          {questions.map((item, index) => {
            const picked = answers[index];
            const revealedThis = revealed;
            const isCorrect = picked === item.correctIndex;

            return (
              <div key={index}>
                <p className="flex gap-2.5 text-[13.5px] leading-[1.85] text-[#0F172A]">
                  <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B162C] text-[10px] font-semibold text-white tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0">{item.question}</span>
                </p>

                <div className="mt-2.5 space-y-1.5 pl-[30px]">
                  {item.options.map((option, optionIndex) => {
                    const chosen = picked === optionIndex;
                    const isAnswer = optionIndex === item.correctIndex;

                    let tone =
                      "border-[#E5E7EB] bg-white text-[#1E293B] hover:border-[#1D4ED8]";
                    if (revealedThis) {
                      if (isAnswer) {
                        tone = "border-emerald-300 bg-emerald-50 text-[#065F46]";
                      } else if (chosen) {
                        tone = "border-rose-300 bg-rose-50 text-[#9F1239]";
                      } else {
                        tone = "border-[#E5E7EB] bg-white text-[#64748B]";
                      }
                    } else if (chosen) {
                      tone = "border-[#1D4ED8] bg-[#EFF6FF] text-[#1E293B]";
                    }

                    return (
                      <button
                        key={optionIndex}
                        type="button"
                        disabled={revealedThis}
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [index]: optionIndex }))
                        }
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] leading-[1.75] transition-colors",
                          tone,
                          revealedThis && "cursor-default",
                        )}
                      >
                        <span className="mt-[2px] shrink-0">
                          {revealedThis && isAnswer ? (
                            <CheckCircle2
                              size={14}
                              strokeWidth={2.4}
                              className="text-emerald-600"
                            />
                          ) : revealedThis && chosen ? (
                            <X size={14} strokeWidth={2.6} className="text-rose-500" />
                          ) : (
                            <span
                              className={cn(
                                "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                                chosen
                                  ? "border-[#1D4ED8] bg-[#1D4ED8]"
                                  : "border-[#CBD5E1]",
                              )}
                            >
                              {chosen ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              ) : null}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">{option}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 解析——提交后出现。 */}
                <AnimatePresence initial={false}>
                  {revealedThis ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div
                        className={cn(
                          "mt-2.5 ml-[30px] rounded-lg border-l-2 bg-[#F8F7F4] px-3.5 py-2.5",
                          isCorrect ? "border-emerald-500" : "border-[#B89B5E]",
                        )}
                      >
                        <p className="text-[11px] font-medium text-[#0F172A]">
                          {isCorrect ? "答对了" : "再想想"}
                          <span className="ml-1.5 font-normal text-[#55606E]">
                            · {item.concept}
                          </span>
                        </p>
                        <p className="mt-1 text-[12px] leading-[1.8] text-[#1E293B]">
                          {stripMarkdown(item.explanation)}
                        </p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* ── 底部操作 ── */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] pt-5">
          <div className="text-[12px] text-[#55606E]">
            {revealed ? (
              <span>
                答对{" "}
                <span className="font-semibold tabular-nums text-[#0F172A]">
                  {correctCount} / {questions.length}
                </span>
                {passed ? " · 全部通过，本课进度已点亮" : " · 全部答对才算通关"}
              </span>
            ) : (
              <span>
                已作答{" "}
                <span className="font-semibold tabular-nums text-[#0F172A]">
                  {answeredCount} / {questions.length}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {revealed ? (
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 text-[12.5px] font-medium text-[#0F172A] transition-colors hover:border-[#1D4ED8]"
              >
                <RotateCcw size={12} strokeWidth={2.4} />
                再做一次
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!allAnswered}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[12.5px] font-medium text-white transition-opacity",
                  allAnswered
                    ? "bg-[#0B162C] hover:bg-[#122344]"
                    : "cursor-not-allowed bg-[#94A3B8]",
                )}
              >
                提交答案
                <ChevronRight size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 去掉轻量 Markdown 标记。
 *
 * 题库里的解析带着 ``**加粗**`` 这类标记——直接渲染成纯文本会更
 * 干净，也避免在卡片里塞进一整套 Markdown 渲染器。
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-·]\s*/gm, "");
}
