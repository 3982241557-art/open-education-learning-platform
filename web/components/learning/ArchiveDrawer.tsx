"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckSquare,
  FileText,
  Loader2,
  Pencil,
  Square,
  Trash2,
} from "lucide-react";
import { useReader } from "@/context/ReaderContext";
import { ArchiveEmptyState } from "@/components/learning/ArchiveEmptyState";
import {
  colorLabel,
  highlightVars,
  normalizeColor,
  normalizeStyle,
  styleLabel,
} from "@/components/learning/highlight-style";
import {
  CONCEPT_ACTIVATED,
  type ConceptActivatedDetail,
} from "@/lib/learning-events";
import { stripConceptMarkers } from "@/components/learning/ConceptNode";
import { cn } from "@/lib/cn";

/** 自动保存的防抖时长（毫秒）——与悬浮输入框一致。 */
const AUTOSAVE_DEBOUNCE = 500;

/**
 * 留存文档 / 课程档案抽屉。
 *
 * 集中排列用户在当前课程下记录的一切：
 *
 * - **划线批注** —— 用户或 AI 标出的段落；
 * - **AI 阶段总结** —— 模型生成的阶段性小结；
 * - **学习计划** —— 当前课程下的计划与进度。
 *
 * 每一条都可以：
 *
 * - 点开查看 / 编辑；
 * - 勾选后引用给右侧主 AI 作为上下文（勾选的 id 会随下一次提问
 *   一起发给后端）。
 *
 * 编辑即存
 * --------
 *
 * 这里的「完成」按钮曾经**只关掉了编辑态**，根本没调保存接口——
 * 于是用户在左栏写下的字一关就没了。现在改成「边打字边自动保存」，
 * 与正文里的悬浮输入框是同一套节奏：500ms 防抖 + 失焦立即落盘。
 */
export function ArchiveDrawer({
  plans = [],
  courseId,
  pageId,
  className = "",
}: {
  plans?: Array<{
    id: string;
    title: string;
    detail: string;
    due: string;
    items: string[];
    done: number;
    total: number;
    completed: boolean;
  }>;
  courseId?: string;
  pageId?: string;
  className?: string;
}) {
  const {
    notes,
    notesLoading,
    upsertNote,
    removeNote,
    selectedNoteIds,
    toggleNoteSelection,
    clearNoteSelection,
  } = useReader();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const activePlans = useMemo(
    () => plans.filter((plan) => !plan.completed),
    [plans],
  );

  /* ── 动作 C：知识节点被点开 → 打一个时间戳标记 ────────────────────
   *
   * 用户在正文里点了一个「闭包」，右边的 AI 开始解释它——左边的留存
   * 文档同时记一笔：**我在 12:34 处注意到了这个词**。
   *
   * 这条记录的价值在于**可回溯**：过一阵子回头看，能知道当时是在
   * 视频的哪一刻对哪个概念产生了疑问。所以标记里带时间戳（视频
   * 场景）或页码（纯文本场景）。
   *
   * 为什么用 ``upsertNote`` 而不是另开一套存储
   * -----------------------------------------
   *
   * 留存的本质就是「我在这门课里留下的东西」。这个标记和用户手写的
   * 划线批注是**同一类东西**——同一种存储、同一个抽屉、同一个
   * 上下文注入机制（勾选它就能让 AI 知道我在关心这个词）。
   *
   * 标记的 id 由词条 + 时间戳派生，所以**同一点击两次不会重复**。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ConceptActivatedDetail>).detail;
      if (!detail?.term) return;

      const stamp = detail.timestampLabel
        ? `视频 ${detail.timestampLabel}`
        : "正文";

      // 上下文里可能还带着 ``[[闭包]]`` 这样的标记——发给用户看的
      // 文字不该有方括号。
      const context = detail.context
        ? stripConceptMarkers(detail.context)
        : "";

      const noteText = `【关注】${detail.term}（${stamp}）${
        context ? `\n${context}` : ""
      }`;

      // 同一点击 → 同一条标记。
      const id = `concept_${detail.term}_${
        detail.timestamp ?? detail.pageId ?? "page"
      }`.replace(/[^\w一-龥-]/g, "_");

      void upsertNote({
        id,
        quote: detail.term,
        note: noteText,
        origin: "user",
        page_id: detail.pageId ?? "",
        block_id: "",
      });
    };

    window.addEventListener(CONCEPT_ACTIVATED, handler);
    return () => window.removeEventListener(CONCEPT_ACTIVATED, handler);
  }, [upsertNote]);

  /**
   * 编辑中的自动保存。
   *
   * 每次改动起一个 300ms 的计时器，到点落盘；切走 / 失焦则立刻落盘。
   */
  const saveTimerRef = useRef<number | null>(null);
  const draftRef = useRef("");
  const editingIdRef = useRef<string | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = editingIdRef.current;
    if (!id) return;
    void upsertNote({ id, note: draftRef.current });
  }, [upsertNote]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  /** 开始编辑某条笔记。 */
  const startEditing = (id: string, current: string) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setEditingId(id);
    setDraft(current);
  };

  /** 输入 → 防抖自动保存。 */
  const handleDraftChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const id = editingIdRef.current;
      if (!id) return;
      void upsertNote({ id, note: value });
    }, AUTOSAVE_DEBOUNCE);
  };

  return (
    <aside
      aria-label="留存文档"
      className={cn(
        // 沉淀区：加深后的暖杏奶油底 + 1.5px 实线右分割。
        //
        // 之前用弥散阴影划边界，整栏读起来"飘"。现在换成硬边实线，
        // 三大功能区的边界一眼可辨。
        "flex min-h-0 flex-col bg-[var(--seek-cream)]",
        "border-r-[1.5px] border-[var(--seek-divider)]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--seek-divider)] px-3 py-2.5">
        <FileText size={13} strokeWidth={2} className="text-[var(--seek-plum)]" />
        <h2 className="text-[12.5px] font-medium text-[var(--foreground)]">
          留存文档
        </h2>
        {notes.length > 0 && (
          <span className="text-[10.5px] font-normal tabular-nums text-[var(--muted-foreground)]">
            {notes.length}
          </span>
        )}
        {selectedNoteIds.length > 0 && (
          <button
            type="button"
            onClick={clearNoteSelection}
            className="seek-key-sm seek-bean-key ml-auto rounded-full px-2 py-0.5 text-[10.5px]"
          >
            取消勾选
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {notesLoading ? (
          <p className="flex items-center gap-1.5 px-1 py-4 text-[11.5px] text-[var(--muted-foreground)]">
            <Loader2 size={12} className="animate-spin" />
            正在载入…
          </p>
        ) : notes.length === 0 && activePlans.length === 0 ? (
          <ArchiveEmptyState variant="full" />
        ) : (
          <div className="space-y-3">
            {/* 学习计划 */}
            {activePlans.length > 0 && (
              <section>
                <h3 className="mb-1.5 px-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  学习计划
                </h3>
                <ul className="space-y-1.5">
                  {activePlans.map((plan) => (
                    <li
                      key={plan.id}
                      className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2"
                    >
                      <p className="text-[11.5px] font-medium leading-snug">
                        {plan.title}
                      </p>
                      {plan.due && (
                        <p className="mt-0.5 text-[10.5px] text-[var(--muted-foreground)]">
                          目标时间：{plan.due}
                        </p>
                      )}
                      {plan.total > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-[10.5px] text-[var(--muted-foreground)]">
                          {plan.done >= plan.total ? (
                            <CheckSquare size={10} strokeWidth={1.8} />
                          ) : (
                            <Square size={10} strokeWidth={1.8} />
                          )}
                          {plan.done} / {plan.total} 步
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 划线批注 */}
            {notes.length > 0 ? (
              <section>
                <h3 className="mb-1.5 px-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  划线批注
                </h3>
                <ul className="space-y-1.5">
                  {notes.map((note) => {
                    const checked = selectedNoteIds.includes(note.id);
                    return (
                      <li
                        key={note.id}
                        className={cn(
                          "group rounded-lg border px-2.5 py-2 transition-colors",
                          checked
                            ? "border-[var(--primary)]/45 bg-[var(--primary)]/6"
                            : "border-[var(--border)] bg-[var(--background)]",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleNoteSelection(note.id)}
                            aria-pressed={checked}
                            aria-label={checked ? "取消引用这条笔记" : "引用这条笔记给 AI"}
                            title={
                              checked ? "取消引用给 AI" : "引用给 AI 作为上下文"
                            }
                            className={cn(
                              "mt-[1px] shrink-0 transition-colors",
                              checked
                                ? "text-[var(--primary)]"
                                : "text-[var(--muted-foreground)]/50 hover:text-[var(--foreground)]",
                            )}
                          >
                            {checked ? (
                              <CheckSquare size={12} strokeWidth={1.9} />
                            ) : (
                              <Square size={12} strokeWidth={1.9} />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            {note.quote && (() => {
                              // 归一化一次，后面三处都要用。
                              const hlStyle = normalizeStyle(note.style);
                              const hlColor = normalizeColor(note.color);
                              const vars = highlightVars(hlStyle, hlColor);
                              return (
                                <div className="mb-1 flex items-start gap-1.5">
                                  {/* 样式标记——左边一道竖条，颜色与线型
                                      跟正文里的高亮一致。用户扫一眼就
                                      知道「这条是波浪线豆沙绿」。 */}
                                  <span
                                    aria-hidden
                                    title={`${styleLabel(hlStyle)} · ${colorLabel(hlColor)}`}
                                    className="mt-[3px] w-[3px] shrink-0 self-stretch rounded-full"
                                    style={{
                                      background:
                                        hlStyle === "highlight"
                                          ? vars["--seek-hl-bg"]
                                          : vars["--seek-hl-color"],
                                    }}
                                  />
                                  <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                                    {note.quote}
                                  </p>
                                </div>
                              );
                            })()}

                            {editingId === note.id ? (
                              <textarea
                                value={draft}
                                onChange={(event) =>
                                  handleDraftChange(event.target.value)
                                }
                                onBlur={flushSave}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    flushSave();
                                    setEditingId(null);
                                  }
                                }}
                                rows={3}
                                autoFocus
                                aria-label="编辑笔记"
                                className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11.5px] leading-relaxed outline-none focus:border-[var(--foreground)]/25"
                              />
                            ) : (
                              <p
                                onClick={() => startEditing(note.id, note.note)}
                                className="cursor-text whitespace-pre-wrap break-words text-[11.5px] leading-relaxed"
                              >
                                {note.note || "（点击写笔记）"}
                              </p>
                            )}

                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="text-[10px] font-normal text-[var(--muted-foreground)]">
                                {note.origin === "ai" ? "AI 标注" : "我"}
                              </span>
                              {/* 全部图标化——悬停提示说明是什么。
                                  左边和底部的文字按钮会把笔记卡撑成
                                  一堆小字，扫视时全是噪声。 */}
                              <div className="ml-auto flex items-center gap-1">
                                {editingId === note.id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      flushSave();
                                      setEditingId(null);
                                    }}
                                    title="完成编辑"
                                    aria-label="完成编辑"
                                    className="seek-key-sm seek-bean-key inline-flex h-5 w-5 items-center justify-center rounded"
                                  >
                                    <Check size={11} strokeWidth={2.6} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startEditing(note.id, note.note)}
                                    title="编辑这条笔记"
                                    aria-label="编辑这条笔记"
                                    className="seek-key-sm inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--seek-cool)] text-[var(--seek-plum)] hover:bg-[var(--seek-cool)]/70"
                                  >
                                    <Pencil size={11} strokeWidth={2.2} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void removeNote(note.id)}
                                  aria-label="删除这条笔记"
                                  title="删除这条笔记"
                                  className="seek-key-sm inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--seek-cool)] text-[var(--seek-plum)] hover:bg-[var(--destructive)]/15"
                                >
                                  <Trash2 size={11} strokeWidth={2.2} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : (
              <section>
                <h3 className="mb-1.5 px-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  划线批注
                </h3>
                <ArchiveEmptyState variant="notes" />
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
