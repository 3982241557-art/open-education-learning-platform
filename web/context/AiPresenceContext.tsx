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
  analyzeSelection,
  fetchNextSteps,
  fetchSelectionActions,
  type NextSteps,
  type SelectionAction,
  type SelectionResult,
  type SelectionVariant,
} from "@/lib/insight-api";

/**
 * AI 在整个平台里的存在状态。
 *
 * 与 `ChatContext` 的分工：
 *
 * - `ChatContext` 管**对话**——消息历史、多轮、发送；
 * - `AiPresenceContext` 管**AI 的在场**——它此刻感知到什么、能主动
 *   给出什么建议、用户划选的文字该怎么解读。
 *
 * 为什么要分开？因为「AI 在场」是**跨页面**的：用户在课程页划选一段
 * 文字、在课程里划线写笔记、回到首页继续提问——这些都共享同一份 AI 状态。
 * 把它们塞进 ChatContext 会让聊天状态背上无关的职责。
 */

/** AI 当前的感知状态。 */
export type AiState = "idle" | "reading" | "thinking" | "ready";

interface AiPresenceState {
  /** AI 的当前状态——驱动界面上的呼吸提示。 */
  state: AiState;
  /** AI 对当前学习状态的感知描述。 */
  awareness: string;
  /** 下一步建议。 */
  suggestions: NextSteps["suggestions"];
  /** 建议是否由真实模型生成。 */
  fromModel: boolean;
  /** 建议是否正在刷新。 */
  loading: boolean;
  /** 刷新失败时的提示。 */
  error: string | null;
  /** 选区工具条的动作清单。 */
  actions: SelectionAction[];
  /** 父动作的子选项（如「翻译」下的四种译法）。 */
  variants: SelectionVariant[];
  /** 解读选区中的文字。 */
  analyzeSelection: (
    text: string,
    action: string,
    context?: { courseId?: string; pageId?: string },
  ) => Promise<SelectionResult | null>;
  /** 重新拉取下一步建议。 */
  refresh: (courseId?: string, pageId?: string) => Promise<void>;
  /** 推入一条建议并立即执行（用于「AI 主动发起」）。 */
  adoptSuggestion: (prompt: string) => void;
  /** AI 主动发起提问的回调——由页面注入。 */
  onProactivePrompt: ((prompt: string) => void) | null;
  setOnProactivePrompt: (handler: ((prompt: string) => void) | null) => void;
}

const AiPresenceContext = createContext<AiPresenceState | null>(null);

/**
 * AI 在场状态提供者。
 *
 * 它挂在整个工作区最外层，因此侧边栏、课程页、计划页共享同一份
 * 「AI 现在知道什么」。
 */
export function AiPresenceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AiState>("idle");
  const [awareness, setAwareness] = useState("");
  const [suggestions, setSuggestions] = useState<NextSteps["suggestions"]>([]);
  const [fromModel, setFromModel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<SelectionAction[]>([]);
  const [variants, setVariants] = useState<SelectionVariant[]>([]);
  const [onProactivePrompt, setOnProactivePrompt] = useState<
    ((prompt: string) => void) | null
  >(null);

  // 最近一次请求的令牌——用来丢弃过期响应。
  const requestRef = useRef(0);

  // 选区动作清单：只拉一次。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchSelectionActions();
        if (!cancelled) {
          setActions(result.actions);
          setVariants(result.variants);
        }
      } catch {
        /* 拿不到就用内置默认值，不影响主流程 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(
    async (courseId?: string, pageId?: string) => {
      if (!courseId) return;

      const token = ++requestRef.current;
      setLoading(true);
      setError(null);
      setState("thinking");

      try {
        const result = await fetchNextSteps({
          course_id: courseId,
          page_id: pageId,
        });
        // 过期响应直接丢弃——用户可能已经翻到下一页了。
        if (token !== requestRef.current) return;

        setSuggestions(result.suggestions);
        setAwareness(result.awareness);
        setFromModel(result.from_model);
        setState("ready");
      } catch (err) {
        if (token !== requestRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setState("idle");
      } finally {
        if (token === requestRef.current) setLoading(false);
      }
    },
    [],
  );

  const analyze = useCallback(
    async (
      text: string,
      action: string,
      context?: { courseId?: string; pageId?: string },
    ): Promise<SelectionResult | null> => {
      const body = text.trim();
      if (!body) return null;

      setState("thinking");
      try {
        const result = await analyzeSelection({
          text: body,
          action,
          course_id: context?.courseId,
          page_id: context?.pageId,
        });
        setState("ready");
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setState("idle");
        return null;
      }
    },
    [],
  );

  const adoptSuggestion = useCallback(
    (prompt: string) => {
      onProactivePrompt?.(prompt);
    },
    [onProactivePrompt],
  );

  const value = useMemo(
    () => ({
      state,
      awareness,
      suggestions,
      fromModel,
      loading,
      error,
      actions,
      variants,
      analyzeSelection: analyze,
      refresh,
      adoptSuggestion,
      onProactivePrompt,
      setOnProactivePrompt,
    }),
    [
      actions,
      adoptSuggestion,
      analyze,
      awareness,
      error,
      fromModel,
      loading,
      onProactivePrompt,
      refresh,
      state,
      suggestions,
      variants,
    ],
  );

  return (
    <AiPresenceContext.Provider value={value}>
      {children}
    </AiPresenceContext.Provider>
  );
}

export function useAiPresence(): AiPresenceState {
  const context = useContext(AiPresenceContext);
  if (!context) {
    throw new Error("useAiPresence must be used inside AiPresenceProvider");
  }
  return context;
}

/** 只读取 AI 的在场状态——给不需要全部能力的组件用。 */
export function useAiState(): AiState {
  return useAiPresence().state;
}
