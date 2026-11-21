"use client";

import { FileText, Lightbulb, NotebookPen, Target } from "lucide-react";

/**
 * 留存文档的空状态
 * ================
 *
 * 「留存文档」是用户自己的东西——笔记、批注、计划。当它空着时，
 * 用户面对的是一片灰白色的沉默，完全不知道**能做什么**。
 *
 * 空状态的任务不是「占位」，是**教用户下一步怎么用**。所以这里：
 *
 * - 说清楚「在正文里划词」这个具体动作，而不是「暂无数据」；
 * - 给出真实的操作路径（划词 → 工具栏 → 划线写笔记）；
 * - 用图标与层次把三件事（划词、提问、计划）分开讲，不混成一段话。
 */
export function ArchiveEmptyState({
  variant = "full",
}: {
  /**
   * - `full` —— 笔记与计划都为空，展示完整的三条指引；
   * - `notes` —— 只有笔记为空（计划已有），只提示如何写笔记；
   * - `plans` —— 只有计划为空（笔记已有），只提示如何让 AI 排计划。
   */
  variant?: "full" | "notes" | "plans";
}) {
  const showNotesGuide = variant !== "plans";
  const showPlansGuide = variant !== "notes";

  return (
    <div className="px-1.5 py-5">
      {/* 主图标 */}
      <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center">
        {/* 外圈光环 */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full border border-dashed border-[var(--border)]"
        />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--muted)]/60">
          <NotebookPen
            size={16}
            strokeWidth={1.5}
            className="text-[var(--muted-foreground)]"
          />
        </div>
      </div>

      {/* 主文案 */}
      <p className="text-center text-[12.5px] font-medium leading-relaxed">
        {variant === "plans" ? "暂无学习计划" : "暂无留存笔记"}
      </p>
      <p className="mt-1 text-center text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        {variant === "plans"
          ? "让 AI 帮你排一份可执行的学习计划"
          : "在右侧正文划词即可自动收录"}
      </p>

      {/* 操作指引 */}
      <ul className="mt-4 space-y-2.5">
        {showNotesGuide && (
          <Guide
            icon={<NotebookPen size={12} strokeWidth={1.7} />}
            title="划线写笔记"
            desc="在正文里选中一段话，工具栏点「划线写笔记」，批注会出现在这里。"
          />
        )}
        {showNotesGuide && (
          <Guide
            icon={<Lightbulb size={12} strokeWidth={1.7} />}
            title="让 AI 标注"
            desc="对 AI 说「把这段标注一下」，它会替你标出关键段落。"
          />
        )}
        {showPlansGuide && (
          <Guide
            icon={<Target size={12} strokeWidth={1.7} />}
            title="制定学习计划"
            desc="对 AI 说「帮我安排两周的学习计划」，计划会自动同步过来。"
          />
        )}
      </ul>

      {/* 底部说明 */}
      <div className="mt-4 flex items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/35 px-2.5 py-2">
        <FileText
          size={11}
          strokeWidth={1.7}
          className="mt-[2px] shrink-0 text-[var(--muted-foreground)]"
        />
        <p className="text-[10.5px] leading-relaxed text-[var(--muted-foreground)]">
          勾选一条笔记，它就会作为上下文一起发给 AI——你的划线就是你的提问背景。
        </p>
      </div>
    </div>
  );
}

/** 一条操作指引。 */
function Guide({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex gap-2">
      <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--muted)]/70 text-[var(--muted-foreground)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium leading-snug">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-[var(--muted-foreground)]">
          {desc}
        </span>
      </span>
    </li>
  );
}
