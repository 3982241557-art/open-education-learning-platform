"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  Quote,
  Send,
  Square,
  X,
} from "lucide-react";
import Markdown from "@/components/common/Markdown";
import TimeAnchorMarkdown from "@/components/common/TimeAnchorMarkdown";
import { InteractiveQuiz } from "@/components/ai/InteractiveQuiz";
import { InsightIndicator } from "@/components/ai/InsightIndicator";
import { ActionChips } from "@/components/ai/ActionChips";
import { ErrorNotice } from "@/components/ai/ErrorNotice";
import { useChat, type ChatMessage } from "@/context/ChatContext";
import { useReader } from "@/context/ReaderContext";
import { sanitizeModelText } from "@/lib/ai-sanitize";
import { cn } from "@/lib/cn";

/**
 * AI 指导一：课程专属执行官（主对话区）。
 *
 * 相比一个普通的聊天框，它多做了三件事：
 *
 * 1. **引用块** —— 用户划的词显示在输入框上方，随提问一起发给模型；
 * 2. **动作反馈** —— 模型执行了划线 / 计划 / 测验动作后，这里给出
 *    可读的确认，让用户知道「AI 真的动了手」；
 * 3. **答题卡** —— 测验渲染成可交互的卡片。
 */
export function MainAiPanel({
  courseId,
  courseTitle,
  pageId,
  pageTitle,
  masteryLabel,
  className = "",
}: {
  courseId: string;
  courseTitle: string;
  pageId?: string;
  pageTitle?: string;
  /**
   * 难度适配标签——来自课前诊断。
   *
   * 有值时，助教顶部显示「已适配：xxx」小徽标。点击可重新诊断。
   */
  masteryLabel?: string;
  className?: string;
}) {
  const {
    messages,
    busy,
    error,
    localNotice,
    quotes,
    removeQuote,
    send,
    stop,
    selectedNoteIds,
    input,
    setInput,
  } = useChat();
  const { notes } = useReader();

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 顶部「学习向导」的建议问题与划词工具条的预填，都通过事件把内容
  // 送到这里——它们不该直接依赖这个组件的实现。
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;
      setInput(detail.text);
      textareaRef.current?.focus();
    };
    window.addEventListener("seek:prefill-input", handler);
    return () => window.removeEventListener("seek:prefill-input", handler);
  }, []);

  // 「让 AI 修改这条笔记」——来自留存文档抽屉。
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ noteId: string }>).detail;
      if (!detail?.noteId) return;
      const note = notes.find((item) => item.id === detail.noteId);
      if (!note) return;
      const original = note.quote || note.note;
      setInput(
        `请帮我把下面这条批注改写得更好——保留原意，但更准确、更简洁：\n${original}`,
      );
      textareaRef.current?.focus();
    };
    window.addEventListener("seek:revise-note", handler);
    return () => window.removeEventListener("seek:revise-note", handler);
  }, [notes]);

  // 新消息出现时把视图滚到底部。
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const ask = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await send(text);
  }, [busy, input, send]);

  const selectedNotes = notes.filter((note) =>
    selectedNoteIds.includes(note.id),
  );

  return (
    <div
      className={cn(
        // 启发区：极淡暖白。AI 说的话是"回应"，用暖白和中间的冷灰
        // 拉开一点温度差，但不刺眼。
        "flex min-h-0 flex-col rounded-xl bg-[var(--seek-warm)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--seek-divider-warm)]/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-medium text-[var(--foreground)]">
            课程专属助教
          </h2>
          <p className="mt-0.5 truncate text-[11.5px] font-medium text-[var(--muted-foreground)]">
            回答会结合《{courseTitle}》的内容
            {pageTitle ? ` · ${pageTitle}` : ""}
          </p>
        </div>
        {/* ── 难度适配徽标 ──
         *
         * 课前诊断之后，助教顶部出现一颗**极简小徽标**：
         *
         *     已适配：基础夯实
         *
         * 它只回答一个问题：「他知道我的水平了吗？」——所以它必须
         * 极小、极轻，不抢内容的戏。
         *
         * 点击可重新诊断（由外层页面监听这个事件）。
         */}
        {masteryLabel ? (
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("seek:retest-diagnostic"),
              )
            }
            title="重新诊断，助手会按新的水平讲解"
            className="shrink-0 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--primary)] transition-opacity hover:opacity-75"
          >
            已适配：{masteryLabel}
          </button>
        ) : null}
        {/* 已划线的段落会自动进入助教的上下文——这里告诉用户
            「它看得见我划过的东西」。 */}
        {notes.length > 0 && (
          <span
            title="你划过的段落与批注会实时进入助教的上下文"
            className="shrink-0 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--seek-plum)]"
          >
            已感知 {notes.length} 条批注
          </span>
        )}
        <InsightIndicator showLabel />
      </header>

      {/* 消息区 */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] font-medium leading-relaxed text-[var(--muted-foreground)]">
            问我一个具体概念，或点上方「知识向导」的提问灵感。
          </p>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                {/* 用户气泡：浓郁豆沙粉底 + 深灰紫字 + 深色描边。

                    原来用的是「深底浅字」（`bg-[var(--foreground)]`），
                    那是很强的视觉重量——用户发一句话，整个右栏像被
                    黑块砸了一下。豆沙粉保留了"这是我说的话"的归属感，
                    但重量轻得多，和 AI 淡色的回答能和平共处。 */}
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-br-sm border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-3 py-2 text-[13px] font-normal leading-relaxed text-[var(--seek-plum)]">
                  {message.content}
                </p>
              </div>
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                courseId={courseId}
                streaming={message.streaming}
              />
            ),
          )
        )}

        {/*
         * 静态模式的降级提示。
         *
         * 用**中性**的样式（不是红色错误）——因为它不是错误，
         * 只是「本次是导读而非完整解答」的说明。
         */}
        {localNotice && !error && (
          <div className="mx-3 mb-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/60 px-3 py-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            {localNotice}
          </div>
        )}

        {error && (
          <ErrorNotice message={error} onRetry={() => void ask()} />
        )}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t border-[var(--border)] p-3">
        {/* 引用块 */}
        {quotes.length > 0 && (
          <ul className="mb-2 space-y-1">
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-2.5 py-1.5"
              >
                <Quote
                  size={11}
                  strokeWidth={1.8}
                  className="mt-[2px] shrink-0 text-[var(--muted-foreground)]"
                />
                <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                  {quote.text.length > 120
                    ? `${quote.text.slice(0, 120)}…`
                    : quote.text}
                </span>
                <button
                  type="button"
                  onClick={() => removeQuote(quote.id)}
                  aria-label="移除引用"
                  className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 勾选的笔记 */}
        {selectedNotes.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
            <BookOpen size={11} strokeWidth={1.8} />
            引用了 {selectedNotes.length} 条留存笔记
          </div>
        )}

        <textarea
          ref={textareaRef}
          data-seek-ai-input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }}
          rows={3}
          placeholder="输入你的问题…（Enter 发送，Shift+Enter 换行）"
          aria-label="向这门课提问"
          className="w-full resize-y rounded-lg border border-[var(--seek-key-border)] bg-white px-3 py-2.5 text-[13.5px] font-medium leading-relaxed text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)]/70 focus:border-[var(--seek-plum)]"
        />

        {/*
          自然语言快捷指令。

          以前这里是一排**僵硬的预设 Prompt**——「请以…的身份回答」
          「请按照以下格式…」，每一条都长得像系统提示词，用户读不懂
          也不敢点。

          现在换成一排**人话**：「苏格拉底追问」「帮我梳理逻辑」
          「用大白话讲一遍」。用户点一下，底层自动组装成一条完整
          的长指令——但界面上永远只显示这六个字。
        */}
        <div className="mt-2">
          <ActionChips />
        </div>

        <div className="mt-2 flex gap-2">
          {/* 发送按钮——纯图标 [➤]，不写「提问」二字。
              图标已经说明了动作，而「提问」两个字占掉的宽度恰恰是
              输入框需要的。 */}
          <button
            type="button"
            onClick={() => void ask()}
            disabled={busy || !input.trim()}
            title="发送（Enter）"
            aria-label="发送"
            className="seek-key inline-flex h-10 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--seek-plum)] text-white transition-colors hover:bg-[var(--seek-plum)]/90 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} strokeWidth={2.2} />
            )}
          </button>
          {busy && (
            <button
              type="button"
              onClick={stop}
              aria-label="停止生成"
              title="停止生成"
              className="seek-key inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--card)] text-[var(--foreground)]"
            >
              <Square size={13} fill="currentColor" strokeWidth={0} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 一条 AI 回复。
 *
 * 界面上呈现的**不是**模型的原始输出，而是**降噪后**的正文：
 * 动作围栏、思考标签、「我拿不到原文」这类自言自语，全部被
 * :func:`sanitizeModelText` 拦在门外。
 *
 * 正文为空但还在流式输出时，显示一个**呼吸动画**的三点骨架——
 * 而不是空白，也不是转圈图标。转圈图标暗示「出错了」，呼吸动画
 * 暗示「还在想」——这两者对用户的意义完全不同。
 */
function AssistantMessage({
  message,
  courseId,
  streaming,
}: {
  message: ChatMessage;
  courseId: string;
  streaming?: boolean;
}) {
  const content = sanitizeModelText(message.content);

  return (
    <div className="group rounded-xl rounded-bl-sm bg-[var(--muted)]/60 px-3 py-2">
      {content ? (
        <TimeAnchorMarkdown content={content} className="text-[12.5px]" />
      ) : streaming ? (
        <ThinkingDots />
      ) : null}

      {message.quiz && <InteractiveQuiz quiz={message.quiz} courseId={courseId} />}

      {message.actions && message.actions.length > 0 && (
        <ActionReceipts receipts={message.actions} />
      )}
    </div>
  );
}

/**
 * 「正在思考」的呼吸动画。
 *
 * 三个点依次亮起又暗下——比转圈图标安静得多，也不会让人以为卡住了。
 */
function ThinkingDots() {
  return (
    <span
      className="inline-flex items-center gap-1 py-0.5"
      aria-label="正在思考"
      role="status"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)]/60"
          style={{
            animation: "seek-breathe 1.4s ease-in-out infinite",
            animationDelay: `${index * 0.18}s`,
          }}
        />
      ))}
    </span>
  );
}

/** 动作回执——AI 做了什么，明确告诉用户。 */
function ActionReceipts({
  receipts,
}: {
  receipts: Array<{ action: string; ok: boolean; error?: string; op?: string }>;
}) {
  const LABEL: Record<string, string> = {
    upsert_note: "已在正文标注",
    manage_plan: "已更新学习计划",
    trigger_quiz: "已生成测验",
  };

  return (
    <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
      {receipts.map((receipt, index) => (
        <li
          key={index}
          className={cn(
            "flex items-center gap-1.5 text-[11px]",
            receipt.ok
              ? "text-emerald-600 dark:text-emerald-500"
              : "text-[var(--destructive)]",
          )}
        >
          <CheckCircle2 size={11} strokeWidth={1.9} className="shrink-0" />
          <span>
            {receipt.ok
              ? (LABEL[receipt.action] ?? receipt.action)
              : `动作执行失败：${receipt.error ?? receipt.action}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
