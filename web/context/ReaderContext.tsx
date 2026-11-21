"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deleteNote as deleteNoteById,
  fetchNotes,
  saveNote,
  type LearningNote,
} from "@/lib/learning-api";
import { emitLearningEvent, NOTE_UPDATED } from "@/lib/learning-events";

/**
 * 交互式阅读器的状态。
 *
 * 一个课程页里有四件事需要共享状态：
 *
 * 1. **正文排版** —— 字号、行距、字体。存在 localStorage，跨会话保留。
 * 2. **划线与旁注** —— 用户或 AI 标出的笔记，落在正文旁边。
 * 3. **引用块** —— 用户划词后挂到主 AI 输入框上方的原文。
 * 4. **留存文档** —— 勾选要引用给 AI 的笔记。
 *
 * 为什么单独一个 Context 而不是塞进 ChatContext
 * ------------------------------------------------
 *
 * ChatContext 管的是**对话**；这里管的是**文档**。它们的生命周期不同：
 * 用户可能打开一篇文章但一句 AI 都没问，也可能问了一堆问题但没标任何
 * 笔记。混在一起会让任何一个都变重。
 */

/** 排版设置。 */
export interface TypographySettings {
  /** 正文字号（px）。 */
  fontSize: number;
  /** 行高倍数。 */
  lineHeight: number;
  /** 正文字体族。 */
  fontFamily: "serif" | "sans";
}

/** 排版设置的默认值。 */
export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontSize: 16,
  lineHeight: 1.85,
  fontFamily: "serif",
};

/** localStorage 键。 */
const TYPOGRAPHY_KEY = "seek.reader.typography";

/**
 * 留存文档的本地镜像键。
 *
 * 后端 JSON 是**最终权威**，但界面不应该在网络往返期间是空的——
 * 尤其在「悬浮框里打字 → 300ms 防抖落盘」这条路上，第一笔输入到
 * 后端返回之间有一小段空窗。本地镜像让界面**立刻**显示刚写下的字，
 * 后端返回后再以权威版本覆盖。
 */
const NOTES_KEY = "seek.reader.notes";

/** 读出某门课的本地镜像。 */
function readLocalNotes(courseId: string): LearningNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${NOTES_KEY}.${courseId || "_freeform"}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LearningNote =>
        !!item && typeof item === "object" && typeof item.id === "string",
    );
  } catch {
    return [];
  }
}

/** 把某门课的留存文档写回本地镜像。 */
function writeLocalNotes(courseId: string, notes: LearningNote[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${NOTES_KEY}.${courseId || "_freeform"}`,
      JSON.stringify(notes),
    );
  } catch {
    /* 配额满或隐私模式——忽略 */
  }
}

/** 一条挂到 AI 输入框上方的引用。 */
export interface QuoteAttachment {
  id: string;
  text: string;
  /** 来源页标题。 */
  pageTitle?: string;
}

/** 一条高亮——把正文的某段文字标起来。 */
export interface Highlight {
  id: string;
  /** 被标注的原文。 */
  quote: string;
  /** 命中的正文块 id。 */
  blockId: string;
  pageId: string;
}

interface ReaderState {
  // ── 排版 ──
  typography: TypographySettings;
  setTypography: (next: Partial<TypographySettings>) => void;
  resetTypography: () => void;

  // ── 留存文档 ──
  notes: LearningNote[];
  notesLoading: boolean;
  /**
   * 新增或更新一条笔记。
   *
   * 返回落盘后的笔记 id——悬浮输入框靠它把「新建」变成「更新」，
   * 否则每敲一个字都会多出一条笔记。
   */
  upsertNote: (payload: Partial<LearningNote>) => Promise<string | null>;
  /** 删除一条笔记。 */
  removeNote: (id: string) => Promise<void>;
  /** 从后端重新拉一次留存文档。 */
  reloadNotes: () => Promise<void>;
  /** 让 AI 二次修改某条笔记。 */
  askAiToRevise: (id: string) => void;

  // ── 高亮 ──
  highlights: Highlight[];
  /** 当前正在编辑的笔记 id。 */
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;

  // ── 引用 ──
  quotes: QuoteAttachment[];
  /** 挂上一个引用块。 */
  attachQuote: (quote: Omit<QuoteAttachment, "id">) => void;
  /** 移除一个引用块。 */
  detachQuote: (id: string) => void;
  clearQuotes: () => void;

  // ── 勾选引用给 AI 的笔记 ──
  selectedNoteIds: string[];
  toggleNoteSelection: (id: string) => void;
  clearNoteSelection: () => void;
}

const ReaderContext = createContext<ReaderState | null>(null);

/** 读取排版偏好。 */
function readTypography(): TypographySettings {
  if (typeof window === "undefined") return DEFAULT_TYPOGRAPHY;
  try {
    const raw = window.localStorage.getItem(TYPOGRAPHY_KEY);
    if (!raw) return DEFAULT_TYPOGRAPHY;
    const parsed = JSON.parse(raw);
    return {
      fontSize: Number(parsed?.fontSize) || DEFAULT_TYPOGRAPHY.fontSize,
      lineHeight: Number(parsed?.lineHeight) || DEFAULT_TYPOGRAPHY.lineHeight,
      fontFamily:
        parsed?.fontFamily === "sans" ? "sans" : DEFAULT_TYPOGRAPHY.fontFamily,
    };
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

export function ReaderProvider({
  courseId,
  children,
}: {
  courseId: string;
  children: React.ReactNode;
}) {
  const [typography, setTypographyState] = useState<TypographySettings>(
    DEFAULT_TYPOGRAPHY,
  );
  const [notes, setNotes] = useState<LearningNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteAttachment[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  // 高亮从笔记派生——笔记本身就是高亮 + 旁注的统一体。
  const highlights = useMemo<Highlight[]>(
    () =>
      notes
        .filter((note) => note.quote.trim())
        .map((note) => ({
          id: note.id,
          quote: note.quote,
          blockId: note.block_id,
          pageId: note.page_id,
        })),
    [notes],
  );

  // 排版偏好只在挂载时读一次——之后由用户操作驱动。
  useEffect(() => {
    setTypographyState(readTypography());
  }, []);

  const setTypography = useCallback((next: Partial<TypographySettings>) => {
    setTypographyState((prev) => {
      const merged = { ...prev, ...next };
      try {
        window.localStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify(merged));
      } catch {
        /* 隐私模式下 localStorage 可能不可用——忽略即可 */
      }
      return merged;
    });
  }, []);

  const resetTypography = useCallback(() => {
    setTypographyState(DEFAULT_TYPOGRAPHY);
    try {
      window.localStorage.removeItem(TYPOGRAPHY_KEY);
    } catch {
      /* 同上 */
    }
  }, []);

  // 切换课程时重新加载该课程的留存文档。
  const courseRef = useRef(courseId);
  useEffect(() => {
    courseRef.current = courseId;
    setSelectedNoteIds([]);
    setQuotes([]);
    setActiveNoteId(null);

    let cancelled = false;
    setNotesLoading(true);
    // 先用本地镜像顶上，界面不等网络。
    const cached = readLocalNotes(courseId);
    if (cached.length > 0) setNotes(cached);
    fetchNotes(courseId)
      .then((list) => {
        if (cancelled) return;
        setNotes(list);
        writeLocalNotes(courseId, list);
      })
      .catch(() => {
        if (!cancelled) setNotes(cached);
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  /**
   * 重新拉取留存文档。
   *
   * AI 在对话里执行了 ``upsert_note`` 之后，左栏必须**立刻**出现那条
   * 笔记——不等用户刷新页面。
   */
  const reloadNotes = useCallback(async () => {
    try {
      const list = await fetchNotes(courseRef.current);
      setNotes(list);
      writeLocalNotes(courseRef.current, list);
    } catch {
      /* 拉不到就保留旧数据，别把界面清空 */
    }
  }, []);

  const upsertNote = useCallback(
    async (payload: Partial<LearningNote>): Promise<string | null> => {
      const saved = await saveNote(courseId, payload);
      if (!saved?.id) return null;
      setNotes((prev) => {
        const index = prev.findIndex((item) => item.id === saved.id);
        const next =
          index === -1
            ? [...prev, saved]
            : prev.map((item, i) => (i === index ? saved : item));
        writeLocalNotes(courseId, next);
        return next;
      });
      // 通知全局：轨迹变了。双 AI 与学情中心据此刷新。
      emitLearningEvent(NOTE_UPDATED, {
        courseId,
        noteId: saved.id,
        source: "reader",
      });
      return saved.id;
    },
    [courseId],
  );

  const removeNote = useCallback(
    async (id: string) => {
      const list = await deleteNoteById(courseId, id);
      setNotes(list);
      writeLocalNotes(courseId, list);
      setSelectedNoteIds((prev) => prev.filter((item) => item !== id));
      emitLearningEvent(NOTE_UPDATED, { courseId, noteId: id, source: "reader" });
    },
    [courseId],
  );

  const attachQuote = useCallback((quote: Omit<QuoteAttachment, "id">) => {
    setQuotes((prev) => [
      ...prev,
      { ...quote, id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` },
    ]);
  }, []);

  const detachQuote = useCallback((id: string) => {
    setQuotes((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQuotes = useCallback(() => setQuotes([]), []);

  const toggleNoteSelection = useCallback((id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const clearNoteSelection = useCallback(() => setSelectedNoteIds([]), []);

  const askAiToRevise = useCallback((id: string) => {
    // 通过自定义事件交给主 AI 面板处理——ReaderContext 不该直接依赖 Chat。
    window.dispatchEvent(
      new CustomEvent("seek:revise-note", { detail: { noteId: id } }),
    );
  }, []);

  const value = useMemo<ReaderState>(
    () => ({
      typography,
      setTypography,
      resetTypography,
      notes,
      notesLoading,
      upsertNote,
      removeNote,
      reloadNotes,
      askAiToRevise,
      highlights,
      activeNoteId,
      setActiveNoteId,
      quotes,
      attachQuote,
      detachQuote,
      clearQuotes,
      selectedNoteIds,
      toggleNoteSelection,
      clearNoteSelection,
    }),
    [
      activeNoteId,
      askAiToRevise,
      attachQuote,
      clearNoteSelection,
      clearQuotes,
      detachQuote,
      highlights,
      notes,
      notesLoading,
      quotes,
      removeNote,
      reloadNotes,
      resetTypography,
      selectedNoteIds,
      setTypography,
      toggleNoteSelection,
      typography,
      upsertNote,
    ],
  );

  return (
    <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>
  );
}

export function useReader(): ReaderState {
  const context = useContext(ReaderContext);
  if (!context) {
    throw new Error("useReader must be used inside ReaderProvider");
  }
  return context;
}

/** 排版设置对应的 CSS 类。 */
export function typographyClass(settings: TypographySettings): string {
  const font = settings.fontFamily === "serif" ? "font-serif" : "font-sans";
  return `${font} text-[${settings.fontSize}px] leading-[${settings.lineHeight}]`;
}
