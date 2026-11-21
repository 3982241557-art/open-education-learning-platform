"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { fetchAdvisor, type AdvisorResult } from "@/lib/learning-api";
import type { StudyGuide } from "@/lib/courses-api";
import { onLearningEvent, TRACE_UPDATED } from "@/lib/learning-events";
import { ErrorNotice } from "@/components/ai/ErrorNotice";
import { sanitizeModelText } from "@/lib/ai-sanitize";
import { cn } from "@/lib/cn";

/**
 * 知识向导 —— 便签式折叠条
 * =========================
 *
 * 站在**章**的层面看全局，回答两个问题：
 *
 * 1. 「这一章建议怎么学」——方法论层面的建议；
 * 2. 「你可以向主 AI 提什么高质量问题」——几个可点击的提问范例。
 *
 * 为什么默认收起
 * --------------
 *
 * 它**没有页面操控权限**——不下笔记、不改计划。它只负责把用户的
 * 注意力引到值得问的问题上。
 *
 * 但它原来常驻在右栏顶部，展开时要占掉大半个屏幕：
 * 「本章策略」一段、「可以这样问主 AI」又一段。用户真正在用的是下方
 * 那个聊天流——而聊天流才是右栏 85% 垂直高度该给的东西。
 *
 * 所以现在它收成**一条便签**：
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────┐
 *     │ 🧭 知识向导 · 4 个提问灵感          ▾   │  ← 默认状态（一条）
 *     └────────────────────────────────────────┘
 *
 * 点开才向下展开；点任意一个提问胶囊，填进下方输入框后**自动收起**
 * ——让出全部垂直空间给对话。
 */
export function MacroAdvisor({
  courseId,
  pageId,
  guide,
  className = "",
}: {
  courseId: string;
  pageId?: string;
  /**
   * **预装的知识向导**——装配器一次性生成好的数据。
   *
   * 给了它就不用再调模型：右侧顶部**立刻**就有策略、检查点与提问
   * 灵感，而不是等几秒才冒出来。中台里每一条视频都带这个。
   */
  guide?: StudyGuide;
  className?: string;
}) {
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 便签是否展开。默认收起。 */
  const [open, setOpen] = useState(false);

  /**
   * 预装向导是否存在。
   *
   * 只要有策略或提问灵感，就算「有」——否则就该退回实时调用模型。
   */
  const hasGuide = Boolean(
    guide && (guide.strategy || guide.suggested_questions.length > 0),
  );

  const load = useCallback(async () => {
    // 已有预装向导——不需要再问模型。
    if (hasGuide) return;
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      setResult(
        await fetchAdvisor({ course_id: courseId, page_id: pageId }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, pageId, hasGuide]);

  // 换页就重新生成建议——建议必须贴着用户当前在看的内容。
  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 学习轨迹变了 → 向导也要变。
   *
   * 用户刚划了一条线、刚写了一句批注，向导的策略与提问就该跟着调
   * 整——它问的问题得是**针对用户刚做的动作**的，而不是十分钟前
   * 的通用建议。
   *
   * 用一个节流：轨迹事件可能连着来好几条（一次划线会触发笔记更新 +
   * 进度更新），但没必要每条都重跑一次模型。
   */
  const refreshTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void load();
      }, 1200);
    };
    const off = onLearningEvent(TRACE_UPDATED, schedule);
    return () => {
      off();
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [load]);

  /**
   * 点击任意一条建议 → 填入下方主 AI 的输入框（不直接发送）。
   *
   * 策略、要点、问题**全部**走这一条路径。用户点「先通读全篇，再
   * 回头精读首节」，填进去的不是一个助记语，而是一条展开好的完整
   * 委托——主 AI 拿到就能干活。
   *
   * 走的是 `seek:prefill-input` 事件——与划词工具条同一条通道，
   * 主 AI 面板不依赖这里怎么实现。
   */
  const adopt = (prompt: string) => {
    if (!prompt.trim()) return;
    window.dispatchEvent(
      new CustomEvent("seek:prefill-input", { detail: { text: prompt } }),
    );
    // 让输入框获得焦点——用户可以立刻补充细节再发。
    requestAnimationFrame(() => {
      const node = document.querySelector<HTMLTextAreaElement>(
        "[data-seek-ai-input]",
      );
      node?.focus();
      // 把光标移到末尾——用户接着写，而不是覆盖。
      if (node) {
        const length = node.value.length;
        node.setSelectionRange(length, length);
      }
    });
    // 收起便签——问题已经填好了，把空间还给聊天流。
    setOpen(false);
  };

  const questionCount = hasGuide
    ? (guide?.suggested_questions.length ?? 0)
    : (result?.questions.length ?? 0);

  return (
    <section
      aria-label="知识向导"
      className={cn("rounded-xl", className)}
      data-seek-advisor
    >
      {/* ── 便签折叠条 ── */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        title={open ? "收起知识向导" : "展开知识向导"}
        className={cn(
          "seek-sticky flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left",
          // 极淡的豆沙粉底 + 1px 淡边——只留一点"这是给你的建议"
          // 的暗示，不抢内容的注意力。hover 时底色略微加深。
          "bg-[var(--seek-bean-soft)] text-[var(--seek-plum)]",
          open ? "" : "hover:bg-[var(--seek-bean-soft-hover)]",
        )}
      >
        <Compass size={14} strokeWidth={2.2} className="shrink-0" />
        <span className="text-[12.5px] font-medium">知识向导</span>
        <span className="text-[11.5px] font-normal opacity-70">
          {loading && !result
            ? "· 分析中"
            : questionCount > 0
              ? `· ${questionCount} 个提问灵感`
              : ""}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {/* 预装向导没有「重新生成」——它是一次性装配好的静态资产，
              放个刷新按钮只会让人点了没反应。 */}
          {!hasGuide && (
            <span
              role="button"
              tabIndex={0}
              aria-label="重新生成建议"
              title="重新生成"
              onClick={(event) => {
                event.stopPropagation();
                void load();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  event.preventDefault();
                  void load();
                }
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--seek-plum)]/12"
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} strokeWidth={2.2} />
              )}
            </span>
          )}
          {open ? (
            <ChevronUp size={14} strokeWidth={2.4} />
          ) : (
            <ChevronDown size={14} strokeWidth={2.4} />
          )}
        </span>
      </button>

      {/* ── 展开内容 ──
       *
       * 有最大高度上限——展开是**临时**的查看动作，不该把聊天流
       * 挤没。内容超出时在面板内部滚动。
       */}
      {open && (
        <div className="mt-1.5 max-h-[300px] space-y-2.5 overflow-y-auto rounded-xl border border-[var(--seek-divider-warm)] bg-white p-3 shadow-[var(--seek-shadow-card)]">
          {error && (
            <ErrorNotice message={error} onRetry={() => void load()} />
          )}

          {loading && !result && (
            <p className="flex items-center gap-1.5 py-2 text-[12px] font-medium text-[var(--muted-foreground)]">
              <Loader2 size={12} className="animate-spin" />
              正在分析这一章的学习策略…
            </p>
          )}

          {/* ── 预装的知识向导 ──
           *
           * 装配器一次性生成好的数据。这里**不调模型**——打开就
           * 立刻有内容，用户不会看到几秒钟的空窗。
           */}
          {hasGuide && guide && (
            <>
              {guide.strategy && (
                <button
                  type="button"
                  onClick={() => adopt(guide.strategy)}
                  title="点击填入下方主 AI"
                  className="group block w-full rounded-lg border border-[var(--seek-key-border)] bg-[var(--seek-cool)]/50 px-3 py-2 text-left transition-colors hover:bg-[var(--seek-cool)]"
                >
                  <span className="text-[12.5px] font-medium leading-relaxed text-[var(--foreground)]">
                    <span className="font-medium">本章策略：</span>
                    {sanitizeModelText(guide.strategy)}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-normal text-[var(--seek-plum)] opacity-0 transition-opacity group-hover:opacity-100">
                    <Sparkles size={10} strokeWidth={2.2} />
                    展开为委托 →
                  </span>
                </button>
              )}

              {guide.checkpoints.length > 0 && (
                <>
                  <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--seek-plum)]">
                    <ListChecks size={11} strokeWidth={2.2} />
                    思维检查点
                  </p>
                  <ul className="space-y-1">
                    {guide.checkpoints.map((checkpoint) => (
                      <li
                        key={checkpoint}
                        className="flex items-start gap-1.5 rounded-md px-1 py-0.5 text-[12px] font-normal leading-relaxed text-[var(--muted-foreground)]"
                      >
                        <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[var(--seek-plum)]/60" />
                        <span className="min-w-0 flex-1">
                          {sanitizeModelText(checkpoint)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {guide.suggested_questions.length > 0 && (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--seek-plum)]">
                    可以这样问主 AI
                  </p>
                  <ul className="space-y-1.5">
                    {guide.suggested_questions.map((question, index) => (
                      <li key={`${question.title}-${index}`}>
                        <button
                          type="button"
                          onClick={() => adopt(question.prompt)}
                          title={question.prompt}
                          className="group w-full rounded-lg border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--seek-bean-soft-hover)]"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles
                              size={11}
                              strokeWidth={2.2}
                              className="shrink-0 text-[var(--seek-plum)]"
                            />
                            <span className="text-[12px] font-medium text-[var(--seek-plum)]">
                              {question.title}
                            </span>
                            {question.angle && (
                              <span className="ml-auto shrink-0 rounded-full bg-[var(--seek-plum)]/8 px-1.5 py-px text-[10.5px] font-normal text-[var(--seek-plum)]/75">
                                {question.angle}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {result && !hasGuide && (
            <>
              {result.strategy && (
                <button
                  type="button"
                  onClick={() => adopt(result.strategy_prompt || result.strategy)}
                  title={
                    result.strategy_prompt
                      ? "点击展开成完整委托，填入下方主 AI"
                      : "点击填入下方主 AI"
                  }
                  className="group block w-full rounded-lg border border-[var(--seek-key-border)] bg-[var(--seek-cool)]/50 px-3 py-2 text-left transition-colors hover:bg-[var(--seek-cool)]"
                >
                  <span className="text-[12.5px] font-medium leading-relaxed text-[var(--foreground)]">
                    <span className="font-medium">本章策略：</span>
                    {sanitizeModelText(result.strategy)}
                  </span>
                  {/* 悬停时露出「可点击」的暗示——否则用户不知道这一行
                      也能点。默认隐藏，不占视觉空间。 */}
                  <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-normal text-[var(--seek-plum)] opacity-0 transition-opacity group-hover:opacity-100">
                    <Sparkles size={10} strokeWidth={2.2} />
                    展开为委托 →
                  </span>
                </button>
              )}

              {result.tactics.length > 0 && (
                <ul className="space-y-1">
                  {result.tactics.map((tactic) => (
                    <li key={tactic.id}>
                      <button
                        type="button"
                        onClick={() => adopt(tactic.prompt || tactic.text)}
                        title={tactic.prompt || tactic.text}
                        className="group flex w-full items-start gap-1.5 rounded-md px-1 py-0.5 text-left text-[12px] font-medium leading-relaxed text-[var(--muted-foreground)] transition-colors hover:bg-[var(--seek-cool)]/60 hover:text-[var(--foreground)]"
                      >
                        <Lightbulb
                          size={12}
                          strokeWidth={2}
                          className="mt-[3px] shrink-0 text-[var(--seek-plum)]/70"
                        />
                        <span className="min-w-0 flex-1">
                          {sanitizeModelText(tactic.text)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {result.questions.length > 0 && (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--seek-plum)]">
                    可以这样问主 AI
                  </p>
                  <ul className="space-y-1.5">
                    {result.questions.map((question) => (
                      <li key={question.id}>
                        <button
                          type="button"
                          onClick={() => adopt(question.prompt)}
                          title={question.prompt}
                          className="group w-full rounded-lg border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--seek-bean-soft-hover)]"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles
                              size={11}
                              strokeWidth={2.2}
                              className="shrink-0 text-[var(--seek-plum)]"
                            />
                            <span className="text-[12px] font-medium text-[var(--seek-plum)]">
                              {question.title}
                            </span>
                            {question.hint && (
                              <span className="ml-auto shrink-0 text-[10.5px] font-normal text-[var(--seek-plum)]/75">
                                {question.hint}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
