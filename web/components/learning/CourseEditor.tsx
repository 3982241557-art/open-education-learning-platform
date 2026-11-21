"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { LearningShell, LearningErrorState } from "@/components/learning/LearningShell";
import {
  createCourse,
  getCourse,
  updateCourse,
  type Block,
  type Book,
  type Chapter,
  type ConceptGraph,
  type Course,
  type CoursePayload,
  type Page,
} from "@/lib/courses-api";

interface DraftBlock {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  /** 原版 payload 原文。编辑器只改 ``body``，其余字段原样带回。 */
  payload: Record<string, unknown>;
}

interface DraftPage {
  id: string;
  chapter_id: string;
  title: string;
  content_type: string;
  status: string;
  order: number;
  blocks: DraftBlock[];
  /** 一句话导读。资源枢纽里用于解释「这个节点要解决什么问题」。 */
  summary: string;
}

interface DraftChapter {
  id: string;
  title: string;
  content_type: string;
  summary: string;
  order: number;
  learning_objectives: string[];
}

const BLOCK_TYPE_OPTIONS = [
  "text",
  "callout",
  "code",
  "quiz",
  "flash_cards",
  "section",
] as const;

const CONTENT_TYPE_OPTIONS = [
  "theory",
  "derivation",
  "history",
  "practice",
  "concept",
  "overview",
] as const;

function newBlock(index: number): DraftBlock {
  return {
    id: `blk_${index + 1}`,
    type: "text",
    status: "ready",
    title: "",
    body: "",
    payload: {},
  };
}

function newPage(index: number, chapterId: string): DraftPage {
  return {
    id: `pg_${index + 1}`,
    chapter_id: chapterId,
    title: "",
    content_type: "theory",
    status: "ready",
    order: index,
    blocks: [newBlock(0)],
    summary: "",
  };
}

function newChapter(index: number): DraftChapter {
  return {
    id: `ch_${index + 1}`,
    title: "",
    content_type: "theory",
    summary: "",
    order: index,
    learning_objectives: [],
  };
}

/** 从磁盘上的 block 摊平成可编辑的草稿。 */
function toDraftBlock(block: Block): DraftBlock {
  const payload = block.payload ?? {};
  const body =
    typeof payload.body === "string"
      ? payload.body
      : typeof payload.code === "string"
        ? payload.code
        : typeof payload.text === "string"
          ? payload.text
          : "";
  return {
    id: block.id,
    type: block.type,
    status: block.status,
    title: block.title,
    body,
    payload: { ...payload },
  };
}

/**
 * 把草稿还原成原版 Block。
 *
 * ``text`` / ``code`` / ``callout`` 的正文直接改写 ``payload``；其余类型
 * （``quiz`` / ``flash_cards`` / ``section`` 等）保留原 payload 不动——编辑器
 * 不理解它们的内部结构，改写只会把内容改坏。
 */
function fromDraftBlock(draft: DraftBlock): Block {
  const payload: Record<string, unknown> = { ...draft.payload };
  if (draft.type === "code") {
    payload.language = "python";
    payload.intent = "demonstrate";
    if (!payload.explanation) payload.explanation = "";
    payload.code = draft.body;
  } else if (draft.type === "callout") {
    payload.variant = "key_idea";
    payload.label = draft.title || "核心要点";
    payload.body = draft.body;
  } else if (draft.type === "text") {
    payload.format = "markdown";
    payload.role = "explanation";
    payload.body = draft.body;
  } else if (draft.type === "section") {
    payload.format = "section";
    payload.role = "explanation";
    payload.intro = draft.body;
    if (!payload.key_takeaway) payload.key_takeaway = "";
    if (!Array.isArray(payload.subsections)) payload.subsections = [];
  }
  return {
    id: draft.id,
    type: draft.type as Block["type"],
    status: draft.status as Block["status"],
    title: draft.title,
    params: {},
    payload,
    source_anchors: [],
    metadata: {},
    error: "",
    created_at: 0,
    updated_at: 0,
  };
}

/**
 * 课程编辑器：新建或编辑一门课程。
 *
 * 手工配置课程数据的主要入口——填完保存即写成本地 JSON 文件（格式与原版
 * DeepTutor 的 Book Engine 一致）。同一个组件被 ``/learning/new`` 与
 * ``/learning/courses/<id>/edit`` 复用。
 */
export default function CourseEditor({ courseId }: { courseId?: string }) {
  const router = useRouter();
  const editing = Boolean(courseId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [tags, setTags] = useState("");
  const [language, setLanguage] = useState("zh");
  const [chapters, setChapters] = useState<DraftChapter[]>([newChapter(0)]);
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph>({
    nodes: [],
    edges: [],
  });
  const [explorationSummary, setExplorationSummary] = useState("");
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback((course: Course) => {
    setTitle(course.title);
    setDescription(course.description);
    setCategory(course.category);
    setLevel(course.level);
    setTags(course.tags.join(", "));
    setLanguage(course.language || "zh");
    setChapters(
      course.spine.chapters.length > 0
        ? course.spine.chapters.map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            content_type: chapter.content_type,
            summary: chapter.summary,
            order: chapter.order,
            learning_objectives: [...chapter.learning_objectives],
          }))
        : [newChapter(0)],
    );
    setPages(
      course.pages.map((page) => ({
        id: page.id,
        chapter_id: page.chapter_id,
        title: page.title,
        content_type: page.content_type,
        status: page.status,
        order: page.order,
        blocks: page.blocks.map(toDraftBlock),
        summary: page.summary ?? "",
      })),
    );
    setConceptGraph(course.spine.concept_graph ?? { nodes: [], edges: [] });
    setExplorationSummary(course.spine.exploration_summary ?? "");
  }, []);

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const course = await getCourse(courseId);
        if (alive) hydrate(course);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId, hydrate]);

  const updateChapter = (index: number, patch: Partial<DraftChapter>) => {
    setChapters((prev) =>
      prev.map((chapter, i) => (i === index ? { ...chapter, ...patch } : chapter)),
    );
  };

  const updatePage = (index: number, patch: Partial<DraftPage>) => {
    setPages((prev) =>
      prev.map((page, i) => (i === index ? { ...page, ...patch } : page)),
    );
  };

  const updateBlock = (
    pageIndex: number,
    blockIndex: number,
    patch: Partial<DraftBlock>,
  ) => {
    setPages((prev) =>
      prev.map((page, i) =>
        i === pageIndex
          ? {
              ...page,
              blocks: page.blocks.map((block, j) =>
                j === blockIndex ? { ...block, ...patch } : block,
              ),
            }
          : page,
      ),
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("课程标题不能为空。");
      return;
    }
    const cleanChapters = chapters.filter((chapter) => chapter.title.trim());
    const cleanPages = pages.filter((page) => page.title.trim());

    const book: Book = {
      id: editing ? (courseId as string) : `bk_${Date.now().toString(36)}`,
      revision: 1,
      title: title.trim(),
      description: description.trim(),
      status: "ready",
      proposal: {
        title: title.trim(),
        description: description.trim(),
        scope: "",
        target_level: level.trim(),
        estimated_chapters: cleanChapters.length,
        rationale: "",
      },
      knowledge_bases: [],
      language,
      depth: "standard",
      page_count: cleanPages.length,
      chapter_count: cleanChapters.length,
      created_at: 0,
      updated_at: 0,
      metadata: {
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        category: category.trim(),
        level: level.trim(),
      },
      kb_fingerprints: {},
      kb_document_fingerprints: {},
      stale_page_ids: [],
      stale_detected_at: 0,
    };

    const payload: CoursePayload = {
      book,
      spine: {
        book_id: book.id,
        version: 1,
        updated_at: 0,
        exploration_summary: explorationSummary,
        concept_graph: conceptGraph,
        chapters: cleanChapters.map(
          (chapter): Chapter => ({
            id: chapter.id,
            title: chapter.title.trim(),
            learning_objectives: chapter.learning_objectives,
            content_type: chapter.content_type as Chapter["content_type"],
            source_anchors: [],
            prerequisites: [],
            page_ids: cleanPages
              .filter((page) => page.chapter_id === chapter.id)
              .map((page) => page.id),
            summary: chapter.summary,
            order: chapter.order,
          }),
        ),
      },
      pages: cleanPages.map(
        (page): Page => ({
          id: page.id,
          book_id: book.id,
          chapter_id: page.chapter_id,
          title: page.title.trim(),
          learning_objectives: [],
          content_type: page.content_type as Page["content_type"],
          status: page.status as Page["status"],
          order: page.order,
          blocks: page.blocks
            .filter((block) => block.title.trim() || block.body.trim())
            .map(fromDraftBlock),
          links: [],
          parent_page_id: "",
          summary: page.summary ?? "",
          error: "",
          created_at: 0,
          updated_at: 0,
        }),
      ),
      progress: {
        book_id: book.id,
        current_page_id: "",
        visited_page_ids: [],
        bookmarked_page_ids: [],
        quiz_attempts: [],
        weak_chapters: [],
        score: 0,
        updated_at: 0,
      },
    };

    setSaving(true);
    setError(null);
    try {
      const saved = editing
        ? await updateCourse(courseId as string, payload)
        : await createCourse(payload);
      router.push(`/learning/courses/${encodeURIComponent(saved.id)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LearningShell title="加载课程…" subtitle="正在读取本地课程数据。">
        <div className="flex items-center justify-center py-16 text-[var(--muted-foreground)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </LearningShell>
    );
  }

  return (
    <LearningShell
      title={editing ? "编辑课程" : "新建课程"}
      subtitle="填写课程信息、章节与内容。保存后会立即出现在课程列表里。"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/learning"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            <ArrowLeft size={13} />
            返回
          </Link>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            保存
          </button>
        </div>
      }
    >
      {error && <LearningErrorState message={error} />}

      <div className="max-w-3xl space-y-6">
        <section className="space-y-4">
          <h2 className="text-[13.5px] font-semibold">基本信息</h2>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              标题
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如 Python 入门"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] outline-none focus:border-[var(--foreground)]/25"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              简介
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="一两句话说明这门课讲什么。"
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[var(--foreground)]/25"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                分类
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="编程"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] outline-none focus:border-[var(--foreground)]/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                难度
              </label>
              <input
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="入门"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] outline-none focus:border-[var(--foreground)]/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                语言
              </label>
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="zh"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] outline-none focus:border-[var(--foreground)]/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                标签（逗号分隔）
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="python, 基础"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] outline-none focus:border-[var(--foreground)]/25"
              />
            </div>
          </div>
        </section>

        {/* 章节（spine） */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13.5px] font-semibold">章节</h2>
            <button
              type="button"
              onClick={() => setChapters((prev) => [...prev, newChapter(prev.length)])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              <Plus size={13} />
              添加章节
            </button>
          </div>

          {chapters.map((chapter, index) => (
            <div
              key={index}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] text-[11px] font-medium text-[var(--muted-foreground)]">
                  {index + 1}
                </span>
                <input
                  value={chapter.title}
                  onChange={(e) => updateChapter(index, { title: e.target.value })}
                  placeholder="章节标题"
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[13px] font-medium outline-none focus:border-[var(--foreground)]/25"
                />
                <select
                  value={chapter.content_type}
                  onChange={(e) =>
                    updateChapter(index, {
                      content_type: e.target.value as DraftChapter["content_type"],
                    })
                  }
                  aria-label="内容类型"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] outline-none"
                >
                  {CONTENT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setChapters((prev) => prev.filter((_, i) => i !== index))
                  }
                  disabled={chapters.length === 1}
                  aria-label="删除章节"
                  className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--destructive)] disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <input
                value={chapter.summary}
                onChange={(e) => updateChapter(index, { summary: e.target.value })}
                placeholder="章节概要"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[12px] outline-none focus:border-[var(--foreground)]/25"
              />
            </div>
          ))}
        </section>

        {/* 页面（pages） */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13.5px] font-semibold">页面</h2>
            <button
              type="button"
              onClick={() =>
                setPages((prev) => [
                  ...prev,
                  newPage(prev.length, chapters[0]?.id ?? ""),
                ])
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              <Plus size={13} />
              添加页面
            </button>
          </div>

          {pages.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-[12.5px] text-[var(--muted-foreground)]">
              还没有页面。页面是内容的容器，一个页面下可以挂多个内容块。
            </p>
          )}

          {pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={page.title}
                  onChange={(e) => updatePage(pageIndex, { title: e.target.value })}
                  placeholder="页面标题"
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[13px] font-medium outline-none focus:border-[var(--foreground)]/25"
                />
                <select
                  value={page.chapter_id}
                  onChange={(e) => updatePage(pageIndex, { chapter_id: e.target.value })}
                  aria-label="所属章节"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] outline-none"
                >
                  <option value="">（未归属）</option>
                  {chapters.map((chapter, index) => (
                    <option key={index} value={chapter.id}>
                      {chapter.title || `章节 ${index + 1}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPages((prev) => prev.filter((_, i) => i !== pageIndex))}
                  aria-label="删除页面"
                  className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* 内容块 */}
              <div className="space-y-2">
                {page.blocks.map((block, blockIndex) => (
                  <div
                    key={blockIndex}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <select
                        value={block.type}
                        onChange={(e) =>
                          updateBlock(pageIndex, blockIndex, {
                            type: e.target.value,
                          })
                        }
                        aria-label="块类型"
                        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[11.5px] outline-none"
                      >
                        {BLOCK_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <input
                        value={block.title}
                        onChange={(e) =>
                          updateBlock(pageIndex, blockIndex, { title: e.target.value })
                        }
                        placeholder="块标题"
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[12px] font-medium outline-none focus:border-[var(--foreground)]/25"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPages((prev) =>
                            prev.map((p, i) =>
                              i === pageIndex
                                ? {
                                    ...p,
                                    blocks: p.blocks.filter((_, j) => j !== blockIndex),
                                  }
                                : p,
                            ),
                          )
                        }
                        aria-label="删除块"
                        className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <textarea
                      value={block.body}
                      onChange={(e) =>
                        updateBlock(pageIndex, blockIndex, { body: e.target.value })
                      }
                      rows={5}
                      spellCheck={false}
                      placeholder="块正文（text / code 支持 Markdown）"
                      className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-[12px] leading-relaxed outline-none focus:border-[var(--foreground)]/25"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setPages((prev) =>
                      prev.map((p, i) =>
                        i === pageIndex
                          ? { ...p, blocks: [...p.blocks, newBlock(p.blocks.length)] }
                          : p,
                      ),
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  <Plus size={13} />
                  添加内容块
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </LearningShell>
  );
}
