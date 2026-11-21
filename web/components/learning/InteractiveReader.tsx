"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Minus,
  Plus,
  Quote,
  Type,
} from "lucide-react";
import type { Block, Course, Page, Resource } from "@/lib/courses-api";
import { useReader } from "@/context/ReaderContext";
import {
  highlightVars,
  normalizeColor,
  normalizeStyle,
} from "@/components/learning/highlight-style";
import { VideoBlock } from "@/components/learning/VideoBlock";
import { UniversalMediaViewer } from "@/components/learning/UniversalMediaViewer";
import { CollapsibleSummary } from "@/components/learning/CollapsibleSummary";
import { useResourceTelemetry } from "@/components/learning/useResourceTelemetry";
import {
  conceptClassName,
  extractSentence,
  renderConceptText,
  type ConceptToken,
} from "@/components/learning/ConceptNode";
import { activateConcept } from "@/lib/concept-actions";
import {
  PROGRESS_UPDATED,
  RESOURCE_ACTIVATED,
  RESOURCE_SWITCH,
  emitLearningEvent,
  onLearningEvent,
} from "@/lib/learning-events";
import { fetchProgress } from "@/lib/learning-api";
import { cn } from "@/lib/cn";

/**
 * 交互式阅读器。
 *
 * 三件事合在一起：
 *
 * 1. **目录与正文解耦** —— 默认只显示结构化目录；点某一章才平滑展开
 *    那章的正文。避免整本书的内容堆在一页。
 * 2. **排版自定义** —— 顶部一条极简工具栏：字号、行距、宋体/无衬线。
 * 3. **双向划线笔记** —— 正文里被标注的段落自动高亮，旁边挂可编辑的
 *    批注卡；用户也可以自己划词新建。
 */

/** 排版工具栏。 */
function TypographyToolbar() {
  const { typography, setTypography, resetTypography } = useReader();

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-lg bg-[var(--card)] px-2 py-1.5 shadow-[var(--seek-shadow-soft)]"
      aria-label="阅读排版"
    >
      {/* 字号 */}
      <div className="flex items-center gap-0.5">
        <Type size={12} strokeWidth={1.8} className="text-[var(--muted-foreground)]" />
        <button
          type="button"
          onClick={() =>
            setTypography({ fontSize: Math.max(13, typography.fontSize - 1) })
          }
          disabled={typography.fontSize <= 13}
          aria-label="减小字号"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
        >
          <Minus size={11} />
        </button>
        <span className="w-8 text-center font-mono text-[10.5px] text-[var(--muted-foreground)]">
          {typography.fontSize}
        </span>
        <button
          type="button"
          onClick={() =>
            setTypography({ fontSize: Math.min(22, typography.fontSize + 1) })
          }
          disabled={typography.fontSize >= 22}
          aria-label="增大字号"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
        >
          <Plus size={11} />
        </button>
      </div>

      <span className="mx-1 h-3.5 w-px bg-[var(--border)]" />

      {/* 行距 */}
      <div className="flex items-center gap-0.5">
        <AlignJustify size={12} strokeWidth={1.8} className="text-[var(--muted-foreground)]" />
        {[1.6, 1.85, 2.1].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTypography({ lineHeight: value })}
            aria-pressed={Math.abs(typography.lineHeight - value) < 0.01}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
              Math.abs(typography.lineHeight - value) < 0.01
                ? "bg-[var(--seek-bean-soft)] font-normal text-[var(--seek-plum)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/60",
            )}
          >
            {value.toFixed(1)}
          </button>
        ))}
      </div>

      <span className="mx-1 h-3.5 w-px bg-[var(--border)]" />

      {/* 字体 */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setTypography({ fontFamily: "serif" })}
          aria-pressed={typography.fontFamily === "serif"}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] transition-colors",
              typography.fontFamily === "serif"
                ? "bg-[var(--seek-bean-soft)] font-normal text-[var(--seek-plum)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/60",
            )}
        >
          宋体
        </button>
        <button
          type="button"
          onClick={() => setTypography({ fontFamily: "sans" })}
          aria-pressed={typography.fontFamily === "sans"}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] transition-colors",
            typography.fontFamily === "sans"
              ? "bg-[var(--muted)] font-medium text-[var(--foreground)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/60",
          )}
        >
          黑体
        </button>
      </div>

      <button
        type="button"
        onClick={resetTypography}
        className="ml-auto rounded px-1.5 py-0.5 text-[10.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/60 hover:text-[var(--foreground)]"
      >
        复位
      </button>
    </div>
  );
}

/** 章与页的分组。 */
interface Group {
  chapterId: string;
  chapterTitle: string;
  summary: string;
  objectives: string[];
  pages: Page[];
}

/**
 * 阅读器主体。
 *
 * ``openChapterId`` 为空时显示目录；点某一章后展开那章的正文。
 */
export function InteractiveReader({
  course,
  openPageId,
  onOpenPage,
  className = "",
}: {
  course: Course;
  openPageId: string | null;
  onOpenPage: (pageId: string) => void;
  className?: string;
}) {
  const { typography, notes, activeNoteId, setActiveNoteId } = useReader();
  const [openChapterId, setOpenChapterId] = useState<string | null>(null);

  /**
   * 资源级学情。
   *
   * 资源枢纽型课程里，一个节点下面挂着多条外链——用户可能只看了其中
   * 一条。所以每条资源要单独显示「看没看过」，而不是让节点级进度
   * 掩盖掉这个事实。
   */
  const [resourceProgress, setResourceProgress] = useState<
    Array<{
      resource_id: string;
      seen: boolean;
      marked_done: boolean;
      dwell_seconds: number;
    }>
  >([]);

  const loadResourceProgress = useCallback(async () => {
    try {
      const { courses } = await fetchProgress(course.id);
      const entry = courses[0];
      if (!entry) return;
      setResourceProgress(
        (entry.resources ?? []).map((item) => ({
          resource_id: item.resource_id,
          seen: item.seen,
          marked_done: item.marked_done,
          dwell_seconds: item.dwell_seconds,
        })),
      );
    } catch {
      // 学情拉不到不该打断阅读——静默忽略，界面只是少了完成标记。
    }
  }, [course.id]);

  useEffect(() => {
    if (!course.hub?.is_hub) return;
    void loadResourceProgress();
  }, [course.hub?.is_hub, loadResourceProgress]);

  // 资源遥测上报后刷新一次完成状态。
  useEffect(() => {
    if (!course.hub?.is_hub) return;
    return onLearningEvent(PROGRESS_UPDATED, (detail) => {
      if (detail.source === "resource-telemetry" || detail.source === "resource-marked") {
        void loadResourceProgress();
      }
    });
  }, [course.hub?.is_hub, loadResourceProgress]);

  const groups = useMemo<Group[]>(() => {
    const byChapter = new Map<string, Page[]>();
    for (const page of course.pages) {
      const list = byChapter.get(page.chapter_id) ?? [];
      list.push(page);
      byChapter.set(page.chapter_id, list);
    }
    for (const list of byChapter.values()) {
      list.sort((a, b) => a.order - b.order);
    }

    if (course.spine.chapters.length > 0) {
      return course.spine.chapters.map((chapter) => ({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        summary: chapter.summary,
        objectives: chapter.learning_objectives,
        pages: byChapter.get(chapter.id) ?? [],
      }));
    }

    return Array.from(byChapter.entries()).map(([chapterId, pages]) => ({
      chapterId,
      chapterTitle: chapterId || "全部内容",
      summary: "",
      objectives: [],
      pages,
    }));
  }, [course]);

  // 打开某页时自动展开它所在的章。
  useEffect(() => {
    if (!openPageId) return;
    const owner = groups.find((group) =>
      group.pages.some((page) => page.id === openPageId),
    );
    if (owner) setOpenChapterId(owner.chapterId);
  }, [openPageId, groups]);

  const openGroup = groups.find((group) => group.chapterId === openChapterId);
  const openIndex = openGroup
    ? openGroup.pages.findIndex((page) => page.id === openPageId)
    : -1;

  const goSibling = (delta: number) => {
    if (!openGroup || openIndex < 0) return;
    const next = openGroup.pages[openIndex + delta];
    if (next) onOpenPage(next.id);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <TypographyToolbar />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
          这门课程还没有内容。
        </p>
      ) : openGroup ? (
        /* ── 阅读视图：展开的那一章 ── */
        <article className="min-h-0 flex-1">
          <button
            type="button"
            onClick={() => setOpenChapterId(null)}
            className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <ListTree size={13} strokeWidth={1.8} />
            返回目录
          </button>

          <header className="mb-4">
            <h2 className="text-[17px] font-normal tracking-[-0.01em]">
              {openGroup.chapterTitle}
            </h2>
            {openGroup.summary && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
                {openGroup.summary}
              </p>
            )}
            {openGroup.objectives.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {openGroup.objectives.map((objective) => (
                  <li
                    key={objective}
                    className="text-[11.5px] text-[var(--muted-foreground)]"
                  >
                    · {objective}
                  </li>
                ))}
              </ul>
            )}
          </header>

          {/* 章内页切换 */}
          {openGroup.pages.length > 1 && (
            <nav className="mb-3 flex items-center gap-1.5 text-[11.5px]">
              <button
                type="button"
                onClick={() => goSibling(-1)}
                disabled={openIndex <= 0}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-30"
                aria-label="上一页"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="text-[var(--muted-foreground)]">
                第 {openIndex + 1} / {openGroup.pages.length} 节
              </span>
              <button
                type="button"
                onClick={() => goSibling(1)}
                disabled={openIndex < 0 || openIndex >= openGroup.pages.length - 1}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-30"
                aria-label="下一页"
              >
                <ChevronRight size={12} />
              </button>
            </nav>
          )}

      {/*
        只渲染**当前这一节**的正文。

        早先把整章的所有页都铺开，结果一章 51 首唐诗一次性灌进
        页面——用户看到的是一面字墙，而不是一本可以读的书。
        章节内的其余各节通过上面的页码导航与下面的目录列表访问。

        ``data-seek-reader-body`` 标记正文容器——遥测靠它算「这一页
        被滚动看过了多少」。
      */}
      <div className="space-y-5">
        {openIndex >= 0 && (
          <PageSection
            key={openGroup.pages[openIndex].id}
            page={openGroup.pages[openIndex]}
            courseId={course.id}
            active
            fontSize={typography.fontSize}
            lineHeight={typography.lineHeight}
            fontFamily={typography.fontFamily}
            notes={notes}
            activeNoteId={activeNoteId}
            onActivateNote={setActiveNoteId}
            onFocus={onOpenPage}
            resourceProgress={resourceProgress}
          />
        )}
      </div>

          {/* 本章各节一览——快速跳转，不必回到目录 */}
          {openGroup.pages.length > 1 && (
            <div className="mt-6 border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-[11px] font-medium text-[var(--muted-foreground)]">
                本章共 {openGroup.pages.length} 节
              </p>
              <ul className="max-h-[240px] space-y-0.5 overflow-y-auto pr-1">
                {openGroup.pages.map((page, index) => (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => onOpenPage(page.id)}
                      className={cn(
                        "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors hover:bg-[var(--muted)]/50",
                        page.id === openPageId
                          ? "bg-[var(--muted)] font-medium text-[var(--foreground)]"
                          : "text-[var(--muted-foreground)]",
                      )}
                    >
                      <span className="font-mono text-[10px] tabular-nums opacity-60">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{page.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      ) : (
        /* ── 目录视图：清爽的结构化目录 ── */
        <nav aria-label="课程目录" className="min-h-0 flex-1">
          <p className="mb-3 text-[12px] text-[var(--muted-foreground)]">
            共 {course.spine.chapters.length || groups.length} 章 ·{" "}
            {course.page_count} 节
          </p>
          <ul className="space-y-1.5">
            {groups.map((group, index) => (
              <li key={group.chapterId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenChapterId(group.chapterId);
                    const first = group.pages[0];
                    if (first) onOpenPage(first.id);
                  }}
                  className="group w-full rounded-xl bg-[var(--card)] px-3.5 py-3 text-left shadow-[var(--seek-shadow-soft)] transition-shadow hover:shadow-[var(--seek-shadow-paper)]"
                >
                  <span className="flex items-baseline gap-2.5">
                    <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium">
                      {group.chapterTitle}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                      {group.pages.length} 节
                    </span>
                  </span>
                  {group.summary && (
                    <p className="mt-1.5 line-clamp-2 pl-8 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                      {group.summary}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** 一页的正文 + 旁边的批注。 */
function PageSection({
  page,
  courseId,
  active,
  fontSize,
  lineHeight,
  fontFamily,
  notes,
  activeNoteId,
  onActivateNote,
  onFocus,
  resourceProgress = [],
}: {
  page: Page;
  courseId: string;
  active: boolean;
  fontSize: number;
  lineHeight: number;
  fontFamily: "serif" | "sans";
  notes: ReturnType<typeof useReader>["notes"];
  activeNoteId: string | null;
  onActivateNote: (id: string | null) => void;
  onFocus: (pageId: string) => void;
  /** 每条资源的学习状态（来自后端资源级学情）。 */
  resourceProgress?: Array<{
    resource_id: string;
    seen: boolean;
    marked_done: boolean;
    dwell_seconds: number;
  }>;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const fontClass = fontFamily === "serif" ? "font-serif" : "font-sans";
  const { removeNote } = useReader();

  /* ── 资源枢纽 ────────────────────────────────────────────────────────
   *
   * 资源枢纽型的节点里，页面装的是若干条**外链资源**（视频 / 网页 /
   * 文档），而不是本地正文。它们要渲染成「全能媒体渲染器」，而不是
   * 一堆正文块。
   *
   * 切换状态放在这一层：每个节点独立记住「我现在在看哪一条」。
   */
  const hubResources = useMemo<Resource[]>(
    () =>
      page.blocks
        .filter((block) => block.type === "resource")
        .map((block) => ({
          id: String(block.payload?.id ?? block.id),
          resource_type: (block.payload?.resource_type ?? "webpage") as Resource["resource_type"],
          title: String(block.payload?.title ?? block.title ?? ""),
          url: String(block.payload?.url ?? ""),
          ai_context: String(block.payload?.ai_context ?? ""),
          provider: String(block.payload?.provider ?? ""),
          meta: (block.payload?.meta ?? {}) as Record<string, unknown>,
          captions: Array.isArray(block.payload?.captions)
            ? (block.payload?.captions as Array<{ start: number; text: string }>)
            : [],
          interactive_nodes: Array.isArray(block.payload?.interactive_nodes)
            ? (block.payload?.interactive_nodes as Resource["interactive_nodes"])
            : [],
          study_guide: (block.payload?.study_guide ?? null) as Resource["study_guide"],
          guided_segments: Array.isArray(block.payload?.guided_segments)
            ? (block.payload?.guided_segments as Resource["guided_segments"])
            : [],
          is_default: Boolean(block.payload?.is_default),
          auto_context: Boolean(block.payload?.auto_context),
        })),
    [page.blocks],
  );

  const [activeResourceId, setActiveResourceId] = useState<string | null>(null);

  /**
   * 订阅左侧「视频切片导航」发来的资源切换请求。
   *
   * 左栏列着这门课下所有带交互节点的视频。点其中一条时，中间栏的
   * 播放器要换成它——否则用户点了却什么都没发生。
   *
   * 载荷带课程 id 与页 id：只有「当前这节课、当前这一节」的资源才切，
   * 免得用户在别的节里点左栏，把这一节的播放器也换了。
   */
  useEffect(() => {
    const off = onLearningEvent(RESOURCE_SWITCH, (detail) => {
      const resourceId = String(detail.resourceId || "");
      if (!resourceId) return;
      if (detail.courseId && detail.courseId !== courseId) return;
      if (detail.pageId && detail.pageId !== page.id) return;

      setActiveResourceId(resourceId);
    });
    return off;
  }, [courseId, page.id]);

  const activeResource = useMemo(() => {
    if (hubResources.length === 0) return null;
    return (
      hubResources.find((item) => item.id === activeResourceId) ??
      hubResources.find((item) => item.is_default) ??
      hubResources[0]
    );
  }, [hubResources, activeResourceId]);

  /**
   * 资源级学习遥测。
   *
   * 外部资源没有滚动条——没法量「覆盖率」。唯一能证明用户真的看了
   * 的信号是**停留时长**。所以这里对当前激活的资源真实计时，切换 /
   * 离开时把增量上报。
   */
  const { markDone } = useResourceTelemetry(
    courseId,
    activeResource?.id ?? null,
    page.id,
  );

  /**
   * 把「用户当前在看哪条资源」广播出去。
   *
   * 右侧的 AI 订阅了这件事——它拿到资源的标题、链接与预置摘要，才能
   * 从「通用助教」切换成「超级陪读」。
   *
   * 这条广播**静默**发生：用户点了资源，不该看到任何弹窗或提示。
   */
  useEffect(() => {
    if (!activeResource) return;
    emitLearningEvent(RESOURCE_ACTIVATED, {
      resourceId: activeResource.id,
      title: activeResource.title,
      resourceType: activeResource.resource_type,
      url: activeResource.url,
      provider: activeResource.provider,
      aiContext: activeResource.ai_context,
      studyGuide: activeResource.study_guide ?? null,
      guidedSegments: (activeResource.guided_segments ?? []).map((segment) => ({
        timestamp: Number(segment.timestamp) || 0,
        title: segment.title,
        content: segment.content,
      })),
      interactiveNodes: (activeResource.interactive_nodes ?? []).map((node) => ({
        timestamp: Number(node.timestamp) || 0,
        keyword: node.keyword,
        context: node.context,
        hint: node.hint,
      })),
      courseId,
      pageId: page.id,
    });
  }, [activeResource, courseId, page.id]);

  /**
   * 点正文里已划线的文字 → 取消这条划线。
   *
   * 「取消划线」应该是**零摩擦**的：用户看到一处划错了，最自然的
   * 动作就是点它一下。所以这里不弹确认框——真删错了还能在左栏的
   * 删除按钮里找回。
   *
   * 事件用**委托**挂在正文容器上：高亮是运行时动态插入的 ``<mark>``，
   * 直接绑在元素上会在重新渲染后失效。
   */
  const onBodyClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const mark = target.closest<HTMLElement>("[data-seek-note-id]");
      const noteId = mark?.dataset.seekNoteId;
      if (!noteId) return;
      // 别让这次点击触发外层的「翻到这一页」。
      event.stopPropagation();
      void removeNote(noteId);
    },
    [removeNote],
  );

  /**
   * 把高亮应用到正文里被标注的段落。
   *
   * 每条笔记带自己的**形状**与**配色**——所以渲染时不是「一律黄色
   * 高亮」，而是按笔记的 ``style`` / ``color`` 上不同的样式。
   *
   * 划线是**可点击**的：点一下就取消这条划线（父组件监听
   * ``seek:remove-note`` 事件并删除记录）。这里给 ``<mark>`` 挂上
   * 笔记 id，事件由上层统一处理。
   */
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;

    // 先清掉上一轮渲染留下的高亮——否则重复渲染会套娃。
    for (const stale of Array.from(root.querySelectorAll("[data-seek-style]"))) {
      const parent = stale.parentNode;
      if (!parent) continue;
      while (stale.firstChild) parent.insertBefore(stale.firstChild, stale);
      parent.removeChild(stale);
      parent.normalize();
    }

    const marks = notes
      .filter((note) => note.quote.trim())
      .map((note) => ({
        id: note.id,
        quote: note.quote.trim(),
        style: normalizeStyle(note.style),
        color: normalizeColor(note.color),
      }));

    if (marks.length === 0) return;

    // 用 TreeWalker 找出包含标注文本的文本节点，逐字高亮。
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    let node = walker.nextNode() as Text | null;
    while (node) {
      targets.push(node);
      node = walker.nextNode() as Text | null;
    }

    for (const textNode of targets) {
      const text = textNode.textContent ?? "";
      for (const mark of marks) {
        const index = text.indexOf(mark.quote);
        if (index === -1) continue;
        try {
          const range = document.createRange();
          range.setStart(textNode, index);
          range.setEnd(textNode, index + mark.quote.length);
          const wrapper = document.createElement("mark");
          wrapper.dataset.seekStyle = mark.style;
          wrapper.dataset.seekColor = mark.color;
          wrapper.dataset.seekNoteId = mark.id;
          wrapper.dataset.seekHighlight = "true";
          const vars = highlightVars(mark.style, mark.color);
          for (const [key, value] of Object.entries(vars)) {
            wrapper.style.setProperty(key, value);
          }
          range.surroundContents(wrapper);
        } catch {
          /* 跨节点的标注无法直接包裹——跳过 */
        }
      }
    }
  }, [notes, page.id]);

  return (
    <section
      className={cn(
        // 白纸：纯白卡片浮在冷灰底上。
        //
        // 边框换成了弥散阴影——实线边框会让每张卡片看起来像一块
        // 被切割下来的板块，白纸的感觉就没了。
        "rounded-xl bg-[var(--card)] p-5",
        "shadow-[var(--seek-shadow-paper)]",
        active && "ring-1 ring-[var(--foreground)]/8",
      )}
      onClick={() => onFocus(page.id)}
    >
      {/* 主标题放大到 21px——它是这一节的主张，必须一眼能读到。 */}
      <h3 className="mb-2.5 text-[21px] font-medium leading-tight tracking-[-0.015em] text-[var(--foreground)]">
        {page.title}
      </h3>

      {/* ── 资源枢纽：这节挂的是外链，不是正文 ── */}
      {hubResources.length > 0 ? (
        <div className="space-y-3.5">
          {/* 顶部简介默认折叠成一行摘要。 */}
          <CollapsibleSummary summary={page.summary} />
          <UniversalMediaViewer
            resources={hubResources}
            activeResourceId={activeResource?.id ?? null}
            onResourceChange={(resource) => setActiveResourceId(resource.id)}
            resourceProgress={resourceProgress}
            onMarkDone={() => markDone()}
            courseId={courseId}
            pageId={page.id}
          />
        </div>
      ) : (
        <div
          ref={bodyRef}
          onClick={onBodyClick}
          data-seek-reader-body
          className={cn(
            "space-y-3 text-[var(--foreground)]",
            fontClass,
          )}
          style={{ fontSize: `${fontSize}px`, lineHeight }}
        >
          {page.blocks.length === 0 ? (
            <p className="text-[13px] text-[var(--muted-foreground)]">
              （这一节还没有内容）
            </p>
          ) : (
            page.blocks.map((block) => (
              <BlockBody
                key={block.id}
                block={block}
                courseId={courseId}
                pageId={page.id}
              />
            ))
          )}
        </div>
      )}

      {/*
        「我的笔记」区块已移除。

        笔记统一只在**左侧留存文档栏**展示与编辑——之前正文下方
        还挂着一份同样的批注卡，两处内容完全重复。用户改了一句，
        不知道该看哪一处；两处都改，又会写两遍。

        左边 16–18% 的窄栏才是笔记的正确位置：它是「我的东西」，
        跟中央主舞台（读内容）和右侧助教（问 AI）是三种不同的
        认知任务，不该在主舞台里再插一份。
      */}
    </section>
  );
}

/**
 * 一个内容块的正文。
 *
 * 只渲染可读正文——`status` 与 `type` 这些底层结构术语不暴露给用户。
 */
function BlockBody({
  block,
  courseId,
  pageId,
}: {
  block: Block;
  courseId?: string;
  pageId?: string;
}) {
  if (block.status !== "ready") {
    return (
      <p className="text-[13px] text-[var(--muted-foreground)]">（内容正在整理中）</p>
    );
  }

  const payload = block.payload as Record<string, unknown>;
  const text = (key: string) =>
    typeof payload[key] === "string" ? (payload[key] as string) : "";

  // ── 视频 ────────────────────────────────────────────────────────────
  //
  // 正文流里的原生播放器。课程 JSON 里带 YouTube / Bilibili / 直链
  // 的块会走到这里，而不是把用户踢到外部网站。
  if (block.type === "video") {
    return <VideoBlock payload={payload} courseId={courseId} pageId={pageId} />;
  }

  if (block.type === "text" || block.type === "user_note") {
    const body = text("body") || text("content") || text("markdown");
    if (!body) return null;

    // 英文教材的中文译文（由 scripts/build_bilingual.py 预处理生成）。
    // 排成**英文在上、中文在下**，字体分开——读者靠字形就能分辨
    // 哪行是原文、哪行是译文。
    const translated = text("translation").trim();
    if (translated && translated !== body.trim()) {
      return (
        <div className="space-y-3">
          <div className="font-sans">
            <BodyMarkdown source={body} pageId={pageId} courseId={courseId} />
          </div>
          <div
            aria-hidden
            className="flex items-center gap-2 border-t border-dashed border-[var(--border)] pt-2.5"
          >
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              中文对照
            </span>
          </div>
          <div className="font-serif">
            <BodyMarkdown source={translated} pageId={pageId} courseId={courseId} />
          </div>
        </div>
      );
    }

    return <BodyMarkdown source={body} pageId={pageId} courseId={courseId} />;
  }

  if (block.type === "callout") {
    const label = text("label");
    const body = text("body");
    if (!body) return null;
    return (
      <aside className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
        {label && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {label}
          </p>
        )}
        <BodyMarkdown source={body} pageId={pageId} courseId={courseId} />
      </aside>
    );
  }

  if (block.type === "section") {
    const intro = text("intro");
    const takeaway = text("key_takeaway");
    const subsections = Array.isArray(payload.subsections)
      ? (payload.subsections as Array<Record<string, unknown>>)
      : [];
    return (
      <div className="space-y-2.5">
        {intro && <BodyMarkdown source={intro} pageId={pageId} courseId={courseId} />}
        {subsections.map((sub, index) => {
          const heading =
            typeof sub.heading === "string" ? sub.heading : "";
          const body = typeof sub.body === "string" ? sub.body : "";
          return (
            <div key={index}>
              {heading && (
                <h4 className="mb-1 text-[13.5px] font-normal">{heading}</h4>
              )}
              {body && <BodyMarkdown source={body} pageId={pageId} courseId={courseId} />}
            </div>
          );
        })}
        {takeaway && (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/45 px-3 py-2 text-[12.5px] leading-relaxed">
            <span className="font-medium">要点：</span>
            {takeaway}
          </p>
        )}
      </div>
    );
  }

  if (block.type === "code") {
    const code = text("code");
    if (!code) return null;
    return (
      <div>
        <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/60 p-3 font-mono text-[12px] leading-relaxed">
          <code>{code}</code>
        </pre>
        {text("explanation") && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
            {text("explanation")}
          </p>
        )}
      </div>
    );
  }

  // 其余类型（测验、卡片、时间线等）交给通用渲染。
  return (
    <BodyMarkdown
      source={text("body") || text("content") || ""}
      pageId={pageId}
      courseId={courseId}
    />
  );
}

/**
 * 极简 Markdown 渲染——保留段落与代码块。
 *
 * 正文里的 ``[[术语]]`` 会被渲染成**可点击的知识节点**：点一下就把
 * 词条连同它所在的那句话交给动作分发中心（填入 AI 输入框 + 自动
 * 发问 + 在留存文档上打标记）。
 *
 * 语法细节见 ``components/learning/ConceptNode.tsx``。
 */
function BodyMarkdown({
  source,
  pageId,
  courseId,
}: {
  source: string;
  pageId?: string;
  courseId?: string;
}) {
  if (!source) return null;
  const segments = source.split(/```/);
  return (
    <>
      {segments.map((segment, index) => {
        if (index % 2 === 1) {
          const lines = segment.replace(/^[a-zA-Z0-9+#-]*\n/, "").split("\n");
          return (
            <pre
              key={index}
              className="my-2 overflow-x-auto rounded-lg bg-[var(--muted)]/60 p-3 font-mono text-[0.82em] leading-relaxed"
            >
              <code>{lines.join("\n")}</code>
            </pre>
          );
        }
        return segment.trim() ? (
          <p
            key={index}
            className="whitespace-pre-wrap break-words first:mt-0 last:mb-0"
          >
            {renderConceptText(segment, (token) => (
              <ConceptButton
                token={token}
                source={segment}
                pageId={pageId}
                courseId={courseId}
              />
            ))}
          </p>
        ) : null;
      })}
    </>
  );
}

/**
 * 一个可点击的知识节点。
 *
 * 用 ``<button>`` 而不是 ``<span onClick>``——它能进 Tab 序列、能被
 * 读屏软件识别为可点元素。键盘用户按 Enter 就能触发同样的动作。
 */
function ConceptButton({
  token,
  source,
  pageId,
  courseId,
}: {
  token: ConceptToken;
  source: string;
  pageId?: string;
  courseId?: string;
}) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // 别让这次点击冒泡到外层的「翻到这一页」。
      event.stopPropagation();
      event.preventDefault();

      const context = extractSentence(source, token.term);
      activateConcept({
        term: token.term,
        context,
        courseId,
        pageId,
        source: "concept",
      });
    },
    [source, token.term, courseId, pageId],
  );

  return (
    <button
      type="button"
      data-seek-concept
      title={token.hint ? `${token.term} —— ${token.hint}` : `问 AI：${token.term}`}
      onClick={handleClick}
      className={conceptClassName()}
    >
      {token.term}
    </button>
  );
}
