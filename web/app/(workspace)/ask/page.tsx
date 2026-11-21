"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookPlus,
  FileText,
  ImagePlus,
  Loader2,
  Square,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Markdown from "@/components/common/Markdown";
import { InsightIndicator } from "@/components/ai/InsightIndicator";
import { useChat } from "@/context/ChatContext";
import { analyzeImage, readFileAsBase64 } from "@/lib/insight-api";
import { cn } from "@/lib/cn";

/**
 * 首页 —— 自由 AI 学习入口。
 *
 * 极简：**一个对话框 + 一个教材导入口**。
 *
 * 没有「浏览课程」「打开学情中心」这类跳转卡片——它们是导航，不是学习。
 * 用户来首页是为了**问**，或者**把没找到的教材贴进来**。
 *
 * 导入的长文本会交给 AI 现场解析：先切成章节，再逐章讲。解析结果存成
 * 一门新课，之后可以像任何教材一样精读。
 */
export default function ChatWorkspace() {
  const { messages, context, busy, error, backend, send, stop, reset } = useChat();
  const [input, setInput] = useState("");
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionReply, setVisionReply] = useState("");

  // 导入区
  const [importerOpen, setImporterOpen] = useState(false);
  const [importTitle, setImportTitle] = useState("");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send(text);
  }, [busy, input, send]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  /** 上传图片 → 让 AI 看图。 */
  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setVisionBusy(true);
      setVisionReply("");
      try {
        const image = await readFileAsBase64(file);
        const result = await analyzeImage({
          image_base64: image,
          mime_type: file.type || "image/png",
          question: input.trim(),
          course_id: context?.courseId,
          page_id: context?.pageId,
        });
        setVisionReply(result.reply);
      } catch (err) {
        setVisionReply(
          `图片处理失败：${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setVisionBusy(false);
      }
    },
    [context, input],
  );

  /** 读取上传的文本文件。 */
  const handleTextFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const text = await file.text();
      setImportText(text);
      if (!importTitle) {
        setImportTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    },
    [importTitle],
  );

  /** 导入长文本 —— 现场解析成教材。 */
  const handleImport = useCallback(async () => {
    const body = importText.trim();
    if (!body) return;

    setImporting(true);
    setImportResult("");
    try {
      const { importMaterial } = await import("@/lib/material-api");
      const course = await importMaterial({
        title: importTitle.trim() || "未命名教材",
        text: body,
      });
      setImportResult(
        `已解析成课程《${course.title}》，共 ${course.page_count} 节。现在可以直接问我关于它的任何问题。`,
      );
      setImportText("");
      setImportTitle("");
    } catch (err) {
      setImportResult(
        `解析失败：${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setImporting(false);
    }
  }, [importText, importTitle]);

  const onInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const node = event.target;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
    setInput(node.value);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* 对话展示区 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[780px] px-5 py-8 md:px-8">
          {messages.length === 0 ? (
            <Welcome
              onPick={() => textareaRef.current?.focus()}
              onImport={() => setImporterOpen(true)}
            />
          ) : (
            <>
              <ol className="space-y-5">
                {messages.map((message) => (
                  <li key={message.id}>
                    <MessageBubble
                      content={message.content}
                      role={message.role}
                      streaming={message.streaming}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>

      {/* 底部输入区 */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto w-full max-w-[780px] px-5 py-4 md:px-8">
          {context && (
            <div className="mb-2 flex items-center gap-2 text-[11.5px] text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1">
                <FileText size={11} />
                {context.courseTitle}
                {context.pageTitle ? ` › ${context.pageTitle}` : ""}
              </span>
              <span>这一轮会带上这门课的内容。</span>
            </div>
          )}

          {error && (
            <p className="mb-2 text-[12px] text-[var(--destructive)]">{error}</p>
          )}

          {/* 教材导入区 */}
          {importerOpen && (
            <section className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5">
              <header className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <BookPlus size={13} strokeWidth={1.9} />
                  导入自定义教材
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setImporterOpen(false);
                    setImportResult("");
                  }}
                  aria-label="关闭导入"
                  className="rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                  <X size={13} />
                </button>
              </header>

              <div className="space-y-2.5">
                <input
                  value={importTitle}
                  onChange={(event) => setImportTitle(event.target.value)}
                  placeholder="教材标题"
                  aria-label="教材标题"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--foreground)]/25"
                />

                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  rows={6}
                  placeholder={
                    "把教材正文粘贴到这里——AI 会现场解析成章节，然后陪你逐节精读。"
                  }
                  aria-label="教材正文"
                  className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--foreground)]/25"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]">
                    <Upload size={12} strokeWidth={1.8} />
                    上传文档
                    <input
                      type="file"
                      accept=".txt,.md,.markdown,text/plain"
                      className="hidden"
                      onChange={handleTextFile}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleImport()}
                    disabled={importing || !importText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {importing ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Sparkles size={12} strokeWidth={1.9} />
                    )}
                    解析并开始学习
                  </button>
                </div>

                {importResult && (
                  <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-2.5 py-2 text-[11.5px] leading-relaxed">
                    {importResult}
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm transition-colors focus-within:border-[var(--foreground)]/25">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={visionBusy}
              aria-label="上传图片"
              title="上传图片让 AI 解读"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40"
            >
              {visionBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ImagePlus size={15} strokeWidth={1.7} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setImporterOpen((open) => !open)}
              aria-label="导入自定义教材"
              title="导入自定义教材 / 长文本"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                importerOpen
                  ? "bg-[var(--muted)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)]",
              )}
            >
              <BookPlus size={15} strokeWidth={1.7} />
            </button>
            <textarea
              ref={textareaRef}
              data-seek-ai-input
              value={input}
              onChange={onInput}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="问点什么…（Enter 发送，Shift+Enter 换行）"
              aria-label="输入你的问题"
              className="max-h-[200px] min-h-[38px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-[var(--muted-foreground)]"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="停止生成"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--foreground)] transition-opacity hover:opacity-90"
              >
                <Square size={13} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!input.trim()}
                aria-label="发送"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--foreground)] text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                <ArrowUp size={16} strokeWidth={2.2} />
              </button>
            )}
          </div>

          {visionReply && (
            <div className="mt-2 rounded-2xl bg-[var(--card)] p-3.5 shadow-[var(--shadow-card)]">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                  <ImagePlus size={11} strokeWidth={1.8} />
                  图片解读
                </span>
                <button
                  type="button"
                  onClick={() => setVisionReply("")}
                  className="rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                  aria-label="关闭"
                >
                  <X size={12} />
                </button>
              </div>
              <Markdown content={visionReply} />
            </div>
          )}

          <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-[var(--muted-foreground)]">
            {backend?.mode === "live" ? (
              <span>模型：{backend.model}</span>
            ) : null}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 transition-colors hover:text-[var(--foreground)]"
              >
                <X size={10} />
                清空对话
              </button>
            )}
            <InsightIndicator showLabel={false} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--foreground)] px-4 py-2.5 text-[13.5px] leading-relaxed text-[var(--background)]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)]">
        <Sparkles size={13} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        {content ? (
          <>
            <Markdown content={content} />
            {streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-[var(--muted-foreground)] align-middle" />
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
            <Loader2 size={13} className="animate-spin" />
            正在思考…
          </span>
        )}
      </div>
    </div>
  );
}

/** 空白状态：一句话 + 教材导入入口。 */
function Welcome({
  onPick,
  onImport,
}: {
  onPick: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col justify-center py-10">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">
        想学点什么，直接说
      </h1>
      <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-[var(--muted-foreground)]">
        我会结合你正在学的课程回答，也会记住你留下的每一处笔记。
        如果课程库里没有你要学的教材，把正文贴进来就行。
      </p>

      <button
        type="button"
        onClick={onImport}
        className="group mt-7 flex max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--muted)]/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          <BookPlus size={18} strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium">
            导入自定义教材
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
            粘贴长文本或上传文档，我现场解析成章节，陪你逐节精读
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onPick}
        className="mt-3 self-start text-[12.5px] text-[var(--muted-foreground)] underline underline-offset-2 transition-colors hover:text-[var(--foreground)]"
      >
        或者，直接开始提问 →
      </button>
    </div>
  );
}
