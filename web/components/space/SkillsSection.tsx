"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { pageGridClass } from "@/components/layout/FeaturePage";
import {
  createSkill,
  createSkillTag,
  deleteSkill,
  deleteSkillTag,
  getSkill,
  listSkillTags,
  listSkills,
  renameSkillTag,
  updateSkill,
  type SkillInfo,
} from "@/lib/skills-api";
import { isStaticRuntime } from "@/shared/api/client";

interface SkillEditorState {
  mode: "create" | "edit";
  originalName: string | null;
  name: string;
  description: string;
  content: string;
  tags: string[];
  saving: boolean;
  error: string | null;
}

interface SkillViewerState {
  name: string;
  source?: string;
  readOnly: boolean;
  description: string;
  content: string;
  loading: boolean;
  error: string | null;
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

/** 去掉 YAML frontmatter，查看器只展示 playbook 正文。 */
function stripFrontmatter(md: string): string {
  const match = md.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  return match ? md.slice(match[0].length) : md;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Skill 库界面。
 *
 * 复刻自 DeepTutor 的 ``components/space/SkillsSection.tsx``：同样的卡片网格、
 * 标签过滤、查看/编辑弹窗与标签管理，删掉了 EduHub 外部导入。
 */
export default function SkillsSection() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [tagVocab, setTagVocab] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editor, setEditor] = useState<SkillEditorState | null>(null);
  const [viewer, setViewer] = useState<SkillViewerState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | "all" | "untagged">("all");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTagDraft, setNewTagDraft] = useState("");
  const [renamingTag, setRenamingTag] = useState<{
    original: string;
    value: string;
  } | null>(null);
  const [editorTagDraft, setEditorTagDraft] = useState("");
  /**
   * 是否处于**静态模式**。
   *
   * 静态模式下技能库是**只读**的——新建 / 修改 / 删除都要写文件系
   * 统，纯静态站点做不到。所以「新建 skill」按钮整个不渲染，而不是留
   * 一个点了就报错的按钮。
   */
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    void isStaticRuntime().then(setStaticMode);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [items, tags] = await Promise.all([listSkills(), listSkillTags()]);
      console.log("[skills] 加载到", items.length, "个技能", items.map(i=>i.name));
      setSkills(items);
      setTagVocab(tags);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSkills = useMemo(() => {
    if (filterTag === "all") return skills;
    if (filterTag === "untagged") {
      return skills.filter((skill) => !skill.tags || skill.tags.length === 0);
    }
    return skills.filter((skill) => skill.tags?.includes(filterTag));
  }, [filterTag, skills]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) {
      for (const tag of skill.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [skills]);

  const untaggedCount = useMemo(
    () => skills.filter((skill) => !skill.tags || skill.tags.length === 0).length,
    [skills],
  );

  // ── 编辑器 ──────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditor({
      mode: "create",
      originalName: null,
      name: "",
      description: "",
      content:
        "# My Skill\n\nDescribe how the assistant should behave when this skill is active.\n",
      tags: [],
      saving: false,
      error: null,
    });
    setEditorTagDraft("");
  }, []);

  const openEdit = useCallback(async (name: string) => {
    setEditor({
      mode: "edit",
      originalName: name,
      name,
      description: "",
      content: "",
      tags: [],
      saving: true,
      error: null,
    });
    setEditorTagDraft("");
    try {
      const detail = await getSkill(name);
      setEditor({
        mode: "edit",
        originalName: name,
        name: detail.name,
        description: detail.description,
        content: detail.content,
        tags: [...(detail.tags ?? [])],
        saving: false,
        error: null,
      });
    } catch (err) {
      setEditor((prev) =>
        prev
          ? { ...prev, saving: false, error: err instanceof Error ? err.message : String(err) }
          : prev,
      );
    }
  }, []);

  const openView = useCallback(async (skill: SkillInfo) => {
    setViewer({
      name: skill.name,
      source: skill.source,
      readOnly: Boolean(skill.read_only),
      description: skill.description,
      content: "",
      loading: true,
      error: null,
    });
    try {
      const detail = await getSkill(skill.name);
      setViewer({
        name: detail.name,
        source: detail.source ?? skill.source,
        readOnly: Boolean(detail.read_only),
        description: detail.description,
        content: detail.content,
        loading: false,
        error: null,
      });
    } catch (err) {
      setViewer((prev) =>
        prev
          ? { ...prev, loading: false, error: err instanceof Error ? err.message : String(err) }
          : prev,
      );
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    const trimmedName = editor.name.trim();
    if (!trimmedName) {
      setEditor({ ...editor, error: "名称不能为空" });
      return;
    }
    if (!NAME_RE.test(trimmedName)) {
      setEditor({
        ...editor,
        error: "名称只能使用小写字母、数字和连字符，且必须以字母或数字开头。",
      });
      return;
    }
    setEditor({ ...editor, saving: true, error: null });
    try {
      if (editor.mode === "create") {
        await createSkill({
          name: trimmedName,
          description: editor.description,
          content: editor.content,
          tags: editor.tags,
        });
      } else if (editor.originalName) {
        await updateSkill(editor.originalName, {
          description: editor.description,
          content: editor.content,
          tags: editor.tags,
          rename_to: trimmedName !== editor.originalName ? trimmedName : undefined,
        });
      }
      setEditor(null);
      await load();
    } catch (err) {
      setEditor((prev) =>
        prev
          ? { ...prev, saving: false, error: err instanceof Error ? err.message : String(err) }
          : prev,
      );
    }
  }, [editor, load]);

  const handleDelete = useCallback(
    async (name: string) => {
      if (!window.confirm(`删除 skill「${name}」？`)) return;
      setDeleting(name);
      try {
        await deleteSkill(name);
        await load();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setDeleting(null);
      }
    },
    [load],
  );

  const toggleEditorTag = useCallback((tag: string) => {
    const clean = normalizeTag(tag);
    if (!clean) return;
    setEditor((prev) => {
      if (!prev) return prev;
      const has = prev.tags.includes(clean);
      return {
        ...prev,
        tags: has ? prev.tags.filter((t) => t !== clean) : [...prev.tags, clean],
      };
    });
  }, []);

  const handleCreateEditorTag = useCallback(async () => {
    const clean = normalizeTag(editorTagDraft);
    if (!clean) return;
    setEditorTagDraft("");
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            tags: prev.tags.includes(clean) ? prev.tags : [...prev.tags, clean],
          }
        : prev,
    );
    if (tagVocab.includes(clean)) return;
    try {
      await createSkillTag(clean);
      setTagVocab(await listSkillTags());
    } catch {
      /* 标签已存在或非法——编辑器仍然保留它 */
    }
  }, [editorTagDraft, tagVocab]);

  // ── 标签词表 ────────────────────────────────────────────────────────

  const handleCreateTag = useCallback(async () => {
    const clean = normalizeTag(newTagDraft);
    if (!clean) return;
    try {
      await createSkillTag(clean);
      setTagVocab(await listSkillTags());
      setNewTagDraft("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [newTagDraft]);

  const handleRenameTag = useCallback(async () => {
    if (!renamingTag) return;
    const next = normalizeTag(renamingTag.value);
    if (!next || next === renamingTag.original) {
      setRenamingTag(null);
      return;
    }
    try {
      await renameSkillTag(renamingTag.original, next);
      if (filterTag === renamingTag.original) setFilterTag(next);
      await load();
      setRenamingTag(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [filterTag, load, renamingTag]);

  const handleDeleteTag = useCallback(
    async (tag: string) => {
      if (!window.confirm(`删除标签「${tag}」？`)) return;
      try {
        await deleteSkillTag(tag);
        if (filterTag === tag) setFilterTag("all");
        await load();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    },
    [filterTag, load],
  );

  const availableTagsForEditor = useMemo(
    () => tagVocab.concat((editor?.tags ?? []).filter((t) => !tagVocab.includes(t))),
    [editor?.tags, tagVocab],
  );
  const editorNameInvalid = Boolean(editor?.name && !NAME_RE.test(editor.name));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">能力库</h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
            为助手添加行为手册。内置能力只读，你可以创建自己的来调整它的教学风格与回答习惯。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--muted-foreground)]">
            {skills.length} 个
          </span>
          {/* 静态模式下技能库只读——「新建 skill」整个不渲染。 */}
          {!staticMode && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--primary-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus size={13} strokeWidth={2} />
              新建 skill
            </button>
          )}
        </div>
      </div>

      {/* 标签管理（可折叠） */}
      <section
        className={`overflow-hidden rounded-xl border transition-colors ${
          tagManagerOpen
            ? "border-[var(--border)] bg-[var(--card)] shadow-sm"
            : "border-[var(--border)]/60 bg-[var(--card)]/40"
        }`}
      >
        <button
          onClick={() => setTagManagerOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--muted)]/30"
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--foreground)]">
            <TagIcon size={14} strokeWidth={1.7} className="text-[var(--muted-foreground)]" />
            管理标签
            <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--muted-foreground)]">
              {tagVocab.length}
            </span>
          </span>
          <ChevronDown
            size={14}
            className={`text-[var(--muted-foreground)] transition-transform duration-200 ${
              tagManagerOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {tagManagerOpen && (
          <div className="border-t border-[var(--border)]/70 px-4 pb-4 pt-3">
            <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
              标签用于给 skill 分组。重命名标签会同步更新所有使用它的 skill。
            </p>
            <div className="space-y-1.5">
              {tagVocab.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--muted)]/40 px-3 py-1.5"
                >
                  {renamingTag?.original === tag ? (
                    <input
                      autoFocus
                      value={renamingTag.value}
                      onChange={(e) => setRenamingTag({ original: tag, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRenameTag();
                        if (e.key === "Escape") setRenamingTag(null);
                      }}
                      onBlur={() => void handleRenameTag()}
                      className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 text-[12px] text-[var(--foreground)] outline-none"
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--foreground)]">
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--foreground)]/40" />
                      {tag}
                      <span className="text-[var(--muted-foreground)]">
                        ({tagCounts.get(tag) ?? 0})
                      </span>
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setRenamingTag({ original: tag, value: tag })}
                      className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                      aria-label="重命名"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => void handleDeleteTag(tag)}
                      className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[#f6f1ee] hover:text-[#8a6e63]"
                      aria-label="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {!tagVocab.length && (
                <p className="py-2 text-center text-[12px] text-[var(--muted-foreground)]">
                  还没有标签。
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <input
                value={newTagDraft}
                onChange={(e) => setNewTagDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleCreateTag()}
                placeholder="新标签名…"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
              />
              <button
                onClick={() => void handleCreateTag()}
                disabled={!newTagDraft.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-[12px] font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                <Plus size={12} strokeWidth={2.2} />
                添加
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 标签过滤条 */}
      <div className="-mt-2 flex flex-wrap items-center gap-1.5">
        <TagFilterChip
          label="全部"
          count={skills.length}
          active={filterTag === "all"}
          onClick={() => setFilterTag("all")}
        />
        {tagVocab.map((tag) => (
          <TagFilterChip
            key={tag}
            label={tag}
            count={tagCounts.get(tag) ?? 0}
            active={filterTag === tag}
            onClick={() => setFilterTag(tag)}
          />
        ))}
        {untaggedCount > 0 && (
          <TagFilterChip
            label="未分类"
            count={untaggedCount}
            active={filterTag === "untagged"}
            onClick={() => setFilterTag("untagged")}
            muted
          />
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-bg-[#e2d6cf] bg-[#f6f1ee] px-3 py-2 text-[12px] text-text-[#8a6e63]">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--muted)]/60 text-[var(--muted-foreground)]">
            <Sparkles size={18} />
          </div>
          <p className="text-[14px] font-medium text-[var(--foreground)]">还没有 skill</p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
            创建一个 skill，定义一份可复用的行为手册（例如耐心的导师、严谨的研究助手）。
          </p>
          {!staticMode && (
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--primary-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus size={13} strokeWidth={2} />
              创建第一个 skill
            </button>
          )}
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 px-6 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
          没有符合该筛选条件的 skill。
        </div>
      ) : (
        <ul className={pageGridClass(2)}>
          {filteredSkills.map((skill) => {
            const readOnly = Boolean(skill.read_only);
            const sourceBadge =
              skill.source === "builtin" ? "内置" : skill.source === "admin" ? "预置" : null;
            return (
              <li key={skill.name}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`查看 skill：${skill.name}`}
                  onClick={() => void openView(skill)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void openView(skill);
                    }
                  }}
                  className="group relative flex h-full cursor-pointer flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:border-[var(--foreground)]/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)]/60 bg-[var(--background)] text-[var(--muted-foreground)]">
                        <Wand2 size={13} strokeWidth={1.6} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] font-semibold tracking-tight text-[var(--foreground)]">
                            {skill.name}
                          </span>
                          {sourceBadge ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                              {readOnly ? <Lock size={9} /> : null}
                              {sourceBadge}
                            </span>
                          ) : null}
                        </div>
                        {skill.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                            {skill.description}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[12px] italic text-[var(--muted-foreground)]/60">
                            （无描述）
                          </p>
                        )}
                      </div>
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void openEdit(skill.name);
                          }}
                          className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                          aria-label="编辑"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(skill.name);
                          }}
                          disabled={deleting === skill.name}
                          className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[#f6f1ee] hover:text-[#8a6e63] disabled:opacity-50"
                          aria-label="删除"
                        >
                          {deleting === skill.name ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {skill.tags && skill.tags.length > 0 ? (
                    <div className="mt-auto flex flex-wrap gap-1 pt-2">
                      {skill.tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilterTag(tag);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--muted)]/40 px-2 py-0.5 text-[10.5px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)]"
                        >
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--foreground)]/40" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-auto pt-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[10.5px] text-[var(--muted-foreground)]/70">
                        <TagIcon size={10} />
                        未分类
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 查看器弹窗 */}
      {viewer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewer(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Wand2 size={14} className="shrink-0 text-[var(--muted-foreground)]" />
                <h3 className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                  {viewer.name}
                </h3>
                {viewer.readOnly ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    <Lock size={9} />
                    {viewer.source === "admin" ? "预置" : "内置"}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!viewer.readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      const name = viewer.name;
                      setViewer(null);
                      void openEdit(name);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    <Pencil size={12} />
                    编辑
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label="关闭"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {viewer.description ? (
                <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                  {viewer.description}
                </p>
              ) : null}
              {viewer.loading ? (
                <div className="flex items-center justify-center py-10 text-[var(--muted-foreground)]">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : viewer.error ? (
                <div className="rounded-lg border border-bg-[#e2d6cf] bg-[#f6f1ee] px-3 py-2 text-[12.5px] text-text-[#8a6e63]">
                  {viewer.error}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-[var(--foreground)]">
                  {stripFrontmatter(viewer.content)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 编辑器弹窗 */}
      {editor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
              <div className="flex items-center gap-2">
                <Wand2 size={14} className="text-[var(--muted-foreground)]" />
                <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                  {editor.mode === "create" ? "新建 skill" : "编辑 skill"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  名称
                </label>
                <input
                  value={editor.name}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                  placeholder="例如 socratic-math-mentor"
                  className={`w-full rounded-lg border bg-[var(--background)] px-3 py-2 text-[13px] outline-none transition-colors focus:border-[var(--foreground)]/25 ${
                    editorNameInvalid
                      ? "border-bg-[#b39085]"
                      : "border-[var(--border)]"
                  }`}
                />
                <p
                  className={`mt-1 text-[11px] transition-colors ${
                    editorNameInvalid
                      ? "text-[#8a6e63]"
                      : "text-[var(--muted-foreground)]/70"
                  }`}
                >
                  只能使用小写字母、数字和连字符。
                </p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  描述
                </label>
                <input
                  value={editor.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                  placeholder="manifest 中显示的一行摘要"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] outline-none transition-colors focus:border-[var(--foreground)]/25"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  标签
                </label>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
                  {availableTagsForEditor.length === 0 && (
                    <span className="px-1 text-[11px] italic text-[var(--muted-foreground)]/70">
                      还没有标签——在下面加一个。
                    </span>
                  )}
                  {availableTagsForEditor.map((tag) => {
                    const active = editor.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleEditorTag(tag)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] transition-colors ${
                          active
                            ? "bg-[var(--foreground)] text-[var(--background)]"
                            : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)]"
                        }`}
                      >
                        {active ? <Check size={10} strokeWidth={2.4} /> : null}
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={editorTagDraft}
                    onChange={(e) => setEditorTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreateEditorTag();
                      }
                    }}
                    placeholder="添加标签…"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateEditorTag()}
                    disabled={!editorTagDraft.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--muted)]/40 px-2.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-40"
                  >
                    <Plus size={12} strokeWidth={2.2} />
                    添加
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Markdown 正文
                </label>
                <textarea
                  value={editor.content}
                  onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                  rows={14}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-[12px] leading-relaxed outline-none transition-colors focus:border-[var(--foreground)]/25"
                />
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]/70">
                  YAML frontmatter 可选，name / description / tags 会自动管理。
                </p>
              </div>

              {editor.error && (
                <div className="rounded-lg border border-bg-[#e2d6cf] bg-[#f6f1ee] px-3 py-2 text-[12px] text-text-[#8a6e63]">
                  {editor.error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-md px-3 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={editor.saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--foreground)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {editor.saving && <Loader2 size={12} className="animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TagFilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  muted?: boolean;
}

function TagFilterChip({
  label,
  count,
  active,
  onClick,
  muted,
}: TagFilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
        active
          ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
          : muted
            ? "border-dashed border-[var(--border)] text-[var(--muted-foreground)]/80 hover:text-[var(--foreground)]"
            : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)]"
      }`}
    >
      {label}
      <span
        className={`tabular-nums ${
          active ? "opacity-80" : "text-[var(--muted-foreground)]/70"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
