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
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
} from "@/shared/api/client";
import { askLocalAssistant } from "@/lib/local-ai";
import { listSkills } from "@/lib/skills-api";
import type { LocalChatMessage, LocalCourseContext } from "@/lib/local-ai";
import { sanitizeModelText } from "@/lib/ai-sanitize";
import {
  CONCEPT_ACTIVATED,
  PREDICT_DEEPEN,
  RESOURCE_ACTIVATED,
  TIMESTAMP_QUOTE,
  type ConceptActivatedDetail,
  type PredictDeepenDetail,
  type ResourceActivatedDetail,
  type StudyGuideLike,
  type TimestampQuoteDetail,
} from "@/lib/learning-events";
import {
  buildConceptPrompt,
  buildPredictDeepenPrompt,
  buildTimestampQuotePrompt,
} from "@/lib/concept-actions";
import { buildLearnerProfilePrompt } from "@/lib/diagnostic-profile";

/**
 * 全局对话状态 —— 双 AI 架构里的「AI 指导一：课程专属执行官」。
 *
 * 三件事：
 *
 * 1. **课程级记忆隔离** —— 每门课的对话历史单独存、单独加载。切换
 *    课程时自动换到那门课的历史，用户不会看到别的课的对话。
 * 2. **上下文引用** —— 用户划的词、引用的笔记、当前的页，一起发给
 *    后端。
 * 3. **动作回执** —— 后端执行完笔记 / 计划 / 测验动作后回传回执，
 *    前端据此刷新留存文档与计划，并渲染交互式答题卡。
 */

/** 一条消息。 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 正在流式接收中——用于显示光标与禁用操作。 */
  streaming?: boolean;
  /** 这条消息携带的测验题卡。 */
  quiz?: QuizCard;
  /** 这条消息触发了哪些页面动作。 */
  actions?: ActionReceipt[];
}

/** 测验题卡。 */
export interface QuizCard {
  title: string;
  questions: QuizQuestion[];
  /**
   * 这次测验在后端的 id。
   *
   * 用户提交作答时要把 id 带回去——否则学情中心算不出真实正确率。
   */
  id?: string;
}

/** 一道测验题。 */
export interface QuizQuestion {
  question: string;
  options: string[];
  /** 正确选项下标（从 0 开始）。 */
  answer: number;
  explanation: string;
}

/** 一个动作的执行回执。 */
export interface ActionReceipt {
  action: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  op?: string;
}

/** 用户当前所处的学习上下文。 */
export interface LearningContext {
  courseId: string;
  courseTitle: string;
  pageId?: string;
  pageTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
}

/**
 * 用户当前正在中间栏查看的**外链资源**。
 *
 * 资源枢纽型课程里，用户看的是外部视频 / 网页 / 电子书。AI 看不见
 * 这些内容，所以前端把元数据与预置摘要一起传过去——这是「超级陪读」
 * 能成立的前提。
 */
export interface CurrentResource {
  id: string;
  title: string;
  resourceType: string;
  url: string;
  provider: string;
  /** 预置摘要——AI 唯一能拿到的关于这份资源的信息。 */
  aiContext: string;
  /**
   * 知识向导——预装导读。
   *
   * 静态模式下没有后端可问，AI 助教只能拿这份**预装内容**来组织
   * 离线回答。所以它必须随资源一起传过来。
   */
  studyGuide?: StudyGuideLike | null;
  /** 段落导读。 */
  guidedSegments?: Array<{
    timestamp: number;
    title: string;
    content: string;
  }>;
  /** 时间轴知识节点。 */
  interactiveNodes?: Array<{
    timestamp: number;
    keyword: string;
    context?: string;
    hint?: string;
  }>;
}

/**
 * 用户当前所处的**学习者画像**（由课前诊断产生）。
 *
 * 它被**静默**拼进 AI 助教的 system prompt——用户不会看到这段提示词，
 * 但助手会据此调整讲解的深浅。
 *
 * 形如：
 *
 * .. code-block:: text
 *
 *     [学习者画像] 当前正在学习《哈佛大学 CS50》第 3 讲，课前诊断显示其
 *     掌握度为【基础薄弱】，对【数组】存在模糊，请优先用生活直觉与
 *     循序渐进的方式讲解，避免直接堆砌高阶公式。
 */
export interface LearnerProfile {
  /** 资源 id（课程 id）。 */
  resourceId: string;
  /** 课程标题。 */
  courseTitle: string;
  /** 集 id。 */
  epId: string;
  /** 集标题。 */
  episodeTitle: string;
  /** 集序号。 */
  episodeIndex?: number;
}

/**
 * 用户刚刚触发的**交互节点**（视频画面上弹出的知识点）。
 *
 * 跟 :class:`CurrentResource` 配套：前者是「你在看什么」，后者是
 * 「你此刻卡在哪一句话的哪个概念上」。
 */
export interface CurrentInteractive {
  /** 知识点名称。 */
  keyword: string;
  /** 时间戳的展示文本——「02:00」。 */
  timestamp: string;
  /** 那一刻的视频原话。 */
  context: string;
  /** 引导问题（作者写的）。 */
  hint: string;
  /** 所在视频的标题。 */
  mediaTitle: string;
}

/** 挂到输入框上方的引用块。 */
export interface ChatQuote {
  id: string;
  text: string;
  pageTitle?: string;
}

/** 一个可切换的「回答模式」。 */
export interface PersonaSkill {
  name: string;
  description: string;
  available: boolean;
}

interface ChatState {
  /** 历史消息列表。 */
  messages: ChatMessage[];
  /** 当前的学习上下文（课程 / 章节 / 页）。 */
  context: LearningContext | null;
  /** 是否正在等待模型回复。 */
  busy: boolean;
  /** 最近一次请求的错误。 */
  error: string | null;
  /**
   * 静态模式下的**降级提示**。
   *
   * 不是错误——是「本次回答是导读而非完整解答」的友好说明。
   */
  localNotice: string | null;
  /** 当前模型后端信息。 */
  backend: { mode: string; provider: string; model: string } | null;
  /** 本轮启用的「引擎级」skill 名。 */
  engines: string[];
  /** 切换引擎启用状态。 */
  setEngines: (next: string[]) => void;
  /**
   * 可切换的「回答模式」（persona）。
   *
   * 与 ``engines`` 的区别：引擎是**默认生效、可叠加**的启发逻辑；
   * 回答模式是**互斥**的——用户当下选了哪一个，就只用那一个。
   */
  personas: PersonaSkill[];
  /**
   * 当前选中的「回答模式」名。空串表示用默认模式。
   *
   * 切换后，**下一条**发给模型的请求会把该 skill 的正文即时注入
   * system 角色——模型立刻换一种身份接续同一段对话，而之前的
   * user/assistant 历史保持不变。
   */
  persona: string;
  setPersona: (name: string) => void;

  /** 设置学习上下文（进入课程/页时调用）。 */
  setContext: (next: LearningContext | null) => void;
  /** 清空对话。 */
  reset: () => void;
  /** 发送一条提问。 */
  send: (text: string) => Promise<void>;
  /** 输入框的当前内容。 */
  input: string;
  /**
   * 直接设置输入框的内容。
   *
   * 快捷指令芯片用它把组装好的完整委托**填进**输入框——用户读完、
   * 补充、修改，然后自己按发送。快捷指令不替用户决定何时提问。
   */
  setInput: (text: string) => void;
  /** 停止当前生成。 */
  stop: () => void;
  /** 当前挂着的引用块。 */
  quotes: ChatQuote[];
  addQuote: (quote: Omit<ChatQuote, "id">) => void;
  removeQuote: (id: string) => void;
  /** 勾选引用给 AI 的笔记 id。 */
  selectedNoteIds: string[];
  setSelectedNoteIds: (ids: string[]) => void;
  /**
   * 最近一次动作回执。
   *
   * 页面据此刷新留存文档 / 计划面板，并提示用户「AI 做了什么」。
   */
  lastReceipts: ActionReceipt[];
  /**
   * 注册动作回执监听器。
   *
   * 传 ``null`` 注销。
   *
   * **注意**：这不是 React 的 state setter——直接传函数进去不会被
   * 当成「更新函数」执行（那会把 handler 当成 ``prev => new``）。
   */
  setOnActions: (handler: ((receipts: ActionReceipt[]) => void) | null) => void;
  /**
   * 用户当前正在看的外链资源。
   *
   * 由中间栏广播的 ``seek:resource-activated`` 驱动——用户切换资源
   * 时自动更新，下一次提问时随请求一起发给后端。
   */
  currentResource: CurrentResource | null;
  /**
   * 当前的学习者画像。
   *
   * 由单集沉浸学习页在诊断完成后设置。设置后，它会被静默拼进
   * 下一次提问的 system prompt——用户看不到它，但助手知道该怎么讲。
   */
  learnerProfile: LearnerProfile | null;
  /** 设置（或清空）学习者画像。 */
  setLearnerProfile: (profile: LearnerProfile | null) => void;
}

const ChatContext = createContext<ChatState | null>(null);

/**
 * 课程级会话的客户端存储键。
 *
 * 用 ``localStorage`` 而非内存：切到别的课程再切回来，历史还在。
 * 后端也存了一份（``/api/learning/session``）——前端这份是为了**零延迟**
 * 地恢复现场，后端那份是最终权威。
 */
function sessionKey(courseId: string): string {
  return `seek.chat.session.${courseId || "_freeform"}`;
}

/** 读出某门课的本地会话。 */
function readLocalSession(courseId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(sessionKey(courseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && typeof item.content === "string")
      .map((item: any) => ({
        id: String(item.id ?? `m_${Math.random().toString(36).slice(2, 9)}`),
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content ?? ""),
        quiz: item.quiz,
        actions: item.actions,
      }));
  } catch {
    return [];
  }
}

/** 把某门课的会话写回本地。 */
function writeLocalSession(courseId: string, messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      sessionKey(courseId),
      JSON.stringify(
        messages
          .filter((item) => !item.streaming)
          .slice(-100)
          .map((item) => ({
            id: item.id,
            role: item.role,
            content: item.content,
            quiz: item.quiz,
            actions: item.actions,
          })),
      ),
    );
  } catch {
    /* 配额满或隐私模式——忽略 */
  }
}

/**
 * 把某门课的会话写回**后端**。
 *
 * 为什么本地那份不够
 * ------------------
 *
 * ``localStorage`` 只在这台机器上。换台设备、或者清一次缓存，用户的
 * 提问历史就没了。
 *
 * 更要命的是**学情中心**：那里的「提问 N 次」是数后端存下来的会话
 * 消息条数——前端从不往回写，那个数字就永远是 0。用户看到自己明明
 * 问了一堆问题，学情中心却写着「提问 0 次」，这不是显示问题，是
 * 数据在说谎。
 *
 * 失败静默
 * --------
 *
 * 会话持久化是**辅助**行为——它失败了，用户这一轮对话仍然正常进行。
 * 所以这里的失败不弹错误、不打断流程。
 */
async function persistSession(
  courseId: string,
  messages: ChatMessage[],
): Promise<void> {
  if (!courseId) return;
  try {
    await apiFetch(
      apiUrl(`/api/learning/session?course_id=${encodeURIComponent(courseId)}`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages
            .filter((item) => !item.streaming)
            .slice(-100)
            .map((item) => ({
              role: item.role,
              content: item.content,
            })),
        }),
      },
    );
  } catch {
    /* 会话持久化失败不影响本轮对话——静默忽略 */
  }
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [context, setContext] = useState<LearningContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 静态模式下的**降级提示**。
   *
   * 与 ``error`` 分开——它不是错误，是「本次回答是导读而非完整解答」
   * 的**友好说明**。静态模式下绝不能弹红色报错。
   */
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [backend, setBackend] = useState<ChatState["backend"]>(null);
  /** 启用的引擎。默认全开——引擎本来就该主导回答方式。 */
  const [engines, setEngines] = useState<string[]>([]);
  /** 可切换的「回答模式」清单。 */
  const [personas, setPersonas] = useState<PersonaSkill[]>([]);
  /** 当前选中的「回答模式」。空串 = 默认模式。 */
  const [persona, setPersona] = useState("");
  const [quotes, setQuotes] = useState<ChatQuote[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [lastReceipts, setLastReceipts] = useState<ActionReceipt[]>([]);
  /**
   * 输入框的内容。
   *
   * 提到 Context 里，是因为**快捷指令芯片**也要写它——芯片不在
   * ``MainAiPanel`` 的子树里，没法直接调组件内部的 ``setState``。
   */
  const [inputValue, setInputValue] = useState("");
  /**
   * 用户当前正在看的外链资源。
   *
   * 由中间栏广播 ``seek:resource-activated`` 驱动。资源枢纽型课程里
   * 用户看的是外部内容，AI 看不见——所以这段元数据与预置摘要必须
   * 跟着请求一起发给后端，AI 才能当得上「超级陪读」。
   */
  const [currentResource, setCurrentResource] = useState<CurrentResource | null>(null);
  /**
   * 当前资源的 ref 副本。
   *
   * ``send`` 需要读它，但**不应该**因为资源变了就重建——那会让
   * 订阅 ``CONCEPT_ACTIVATED`` 的 effect 反复重挂。ref 给了我们
   * 「读到最新值」而「身份不变」两件事。
   */
  const currentResourceRef = useRef<CurrentResource | null>(null);
  /**
   * 当前的学习者画像。
   *
   * 由单集页在诊断完成后写入。它会被静默拼进 system prompt。
   */
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfile | null>(
    null,
  );
  /**
   * 学习者画像的 ref 副本。
   *
   * 理由跟 :attr:`currentResourceRef` 一样——``send`` 要读最新值，
   * 但不该因为它变了就重建订阅 effect。
   */
  const learnerProfileRef = useRef<LearnerProfile | null>(null);
  /**
   * 用户刚刚在视频里触发的**交互节点**。
   *
   * 点画面上的气泡时，除了唤醒 AI 之外，还要把这个节点记下来——
   * 这样 AI 才知道用户卡在视频的哪一秒、问的是哪个概念，能「贴着
   * 这一段」回答，而不是泛泛而谈整个主题。
   */
  const [currentInteractive, setCurrentInteractive] = useState<CurrentInteractive | null>(null);
  /**
   * 交互节点的 ref 副本。
   *
   * 理由跟 :attr:`currentResourceRef` 一样——``send`` 要读它，但不该
   * 因为它变了就重建订阅 effect。
   */
  const currentInteractiveRef = useRef<CurrentInteractive | null>(null);
  /**
   * 动作回执的监听器。
   *
   * 用 **ref** 而不是 state——它只是一个「谁在听」的回调句柄：
   * 存在 state 里会让每次注册 / 注销都触发一轮渲染，而它的变化
   * 从来不需要驱动任何 UI。
   */
  const onActionsRef = useRef<
    ((receipts: ActionReceipt[]) => void) | null
  >(null);

  /** 注册（或注销）动作回执监听器。 */
  const setOnActions = useCallback(
    (handler: ((receipts: ActionReceipt[]) => void) | null) => {
      onActionsRef.current = handler;
    },
    [],
  );

  const abortRef = useRef<AbortController | null>(null);
  /** 当前会话属于哪门课——切换课程时据此换历史。 */
  const sessionCourseRef = useRef<string>("");
  /** 引用块与勾选笔记的当前值——发送时读取。 */
  const quotesRef = useRef<ChatQuote[]>([]);
  const selectedNoteIdsRef = useRef<string[]>([]);
  /** 当前选中的「回答模式」——发送时读取。 */
  const personaRef = useRef<string>("");

  useEffect(() => {
    quotesRef.current = quotes;
  }, [quotes]);

  useEffect(() => {
    selectedNoteIdsRef.current = selectedNoteIds;
  }, [selectedNoteIds]);

  useEffect(() => {
    personaRef.current = persona;
  }, [persona]);

  // 首次挂载时拉取引擎清单，并默认全部启用。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ── 静态模式 ──
      //
      // 技能库随站点一起发布（``/data/skills/``），每个技能一个
      // ``SKILL.md``。带 ``persona: true`` 的是「回答模式」，
      // 其余是「引擎」。
      if (await isStaticRuntime()) {
        const all = await listSkills();
        if (cancelled) return;
        setEngines(
          all
            .filter((item) => item.name && !item.tags.includes("persona"))
            .map((item) => item.name),
        );
        setPersonas(
          all
            .filter((item) => item.name && item.tags.includes("persona"))
            .map((item) => ({
              name: item.name,
              description: item.description,
              available: true,
            })),
        );
        return;
      }

      try {
        const response = await apiFetch(apiUrl("/api/chat/engines"), {
          cache: "no-store",
        });
        const data = await response.json();
        if (cancelled) return;
        const list = Array.isArray(data?.engines) ? data.engines : [];
        setEngines(
          list
            .filter((item: any) => item?.available)
            .map((item: any) => String(item?.name ?? ""))
            .filter(Boolean),
        );
      } catch {
        if (!cancelled) setEngines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 拉取可切换的「回答模式」清单。
   *
   * 拉不到不影响主流程——切换器会退回到「仅默认模式」。
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 静态模式下 personas 已经在上面从技能库读到了。
      if (await isStaticRuntime()) return;

      try {
        const response = await apiFetch(apiUrl("/api/chat/personas"), {
          cache: "no-store",
        });
        const data = await response.json();
        if (cancelled) return;
        const list = Array.isArray(data?.personas) ? data.personas : [];
        setPersonas(
          list
            .filter((item: any) => item?.available)
            .map((item: any) => ({
              name: String(item?.name ?? ""),
              description: String(item?.description ?? ""),
              available: Boolean(item?.available),
            }))
            .filter((item: PersonaSkill) => item.name),
        );
      } catch {
        if (!cancelled) setPersonas([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 切换课程 → 换历史。
   *
   * 先从本地缓存秒开（无闪烁），再向后端拉权威版本覆盖——后端那份
   * 可能包含别的设备上写的记录。
   */
  const loadSession = useCallback(async (courseId: string) => {
    if (sessionCourseRef.current === courseId) return;
    sessionCourseRef.current = courseId;

    // 立即用本地缓存顶上，界面不等网络。
    setMessages(readLocalSession(courseId));

    try {
      const response = await apiFetch(
        apiUrl(
          `/api/learning/session?course_id=${encodeURIComponent(courseId)}`,
        ),
        { cache: "no-store" },
      );
      const data = await asJsonOrThrow(response);
      const list = Array.isArray(data?.messages) ? data.messages : [];
      if (list.length === 0) return;

      const restored: ChatMessage[] = list.map((item: any, index: number) => ({
        id: `r_${index}_${Math.random().toString(36).slice(2, 7)}`,
        role: item?.role === "assistant" ? "assistant" : "user",
        content: String(item?.content ?? ""),
      }));
      setMessages(restored);
      writeLocalSession(courseId, restored);
    } catch {
      /* 拉不到就用本地缓存 */
    }
  }, []);

  /**
   * 设置学习上下文。
   *
   * 课程变了就换会话——这是「课程级记忆隔离」的落点。
   */
  const setContextAndSwitch = useCallback(
    (next: LearningContext | null) => {
      setContext(next);
      const courseId = next?.courseId ?? "";
      if (courseId !== sessionCourseRef.current) {
        void loadSession(courseId);
      }
    },
    [loadSession],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setError(null);
    setBusy(false);
    const courseId = sessionCourseRef.current;
    if (courseId) writeLocalSession(courseId, []);
  }, []);

  /**
   * 设置输入框的内容。
   *
   * 快捷指令芯片用它把展开好的完整委托填进输入框。
   */
  const setInput = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  /**
   * 设置学习者画像。
   *
   * 同时更新 ref 副本——``send`` 读的是 ref（它不该重建），而界面
   * 读的是 state（它要触发重渲染）。
   */
  const setLearnerProfileAndRef = useCallback(
    (profile: LearnerProfile | null) => {
      learnerProfileRef.current = profile;
      setLearnerProfile(profile);
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setMessages((prev) =>
      prev.map((message) =>
        message.streaming ? { ...message, streaming: false } : message,
      ),
    );
  }, []);

  const addQuote = useCallback((quote: Omit<ChatQuote, "id">) => {
    setQuotes((prev) => [
      ...prev,
      { ...quote, id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` },
    ]);
  }, []);

  const removeQuote = useCallback((id: string) => {
    setQuotes((prev) => prev.filter((item) => item.id !== id));
  }, []);

  /**
   * 组装静态模式下的**课程上下文**。
   *
   * 只用前端**已经拿到**的东西：正在看的资源、刚触发的知识节点。
   * 这些数据在静态模式下本来就随 JSON 一起加载了，所以这里不需要
   * 额外请求。
   */
  const buildLocalContext = useCallback(() => {
    const resource = currentResourceRef.current;
    const node = currentInteractiveRef.current;

    /**
     * 知识节点：优先用**整门课**的节点列表。
     *
     * 只有资源级的节点（``currentInteractive``）时只能给出一个节点——
     * 那样的离线导读很单薄。资源本身携带了完整的 ``interactive_nodes``，
     * 直接用它。
     */
    const nodes =
      resource?.interactiveNodes?.length
        ? resource.interactiveNodes
        : node
          ? [
              {
                timestamp: Number(node.timestamp) || 0,
                keyword: node.keyword,
                context: node.context,
                hint: node.hint,
              },
            ]
          : [];

    return {
      title: resource?.title ?? context?.courseId ?? "",
      studyGuide: resource?.studyGuide ?? null,
      interactiveNodes: nodes as LocalCourseContext["interactiveNodes"],
      guidedSegments: resource?.guidedSegments ?? [],
      // ── 学习者画像 ──
      //
      // 从 localStorage 里读**当前这一集**的诊断结果，拼成一段提示词。
      // 没诊断过就是空串——助手按默认方式讲。
      learnerProfile: learnerProfile
        ? buildLearnerProfilePrompt(
            learnerProfile.resourceId,
            learnerProfile.epId,
          )
        : "",
    };
  }, [context?.courseId, learnerProfile]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const userMessage: ChatMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content,
      };
      const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // 历史快照要在插入本轮用户消息**之前**取——后端会把 `history`
      // 当作「之前的对话」，如果把本轮也算进去，模型会看到重复的问题。
      const history = messages
        .filter((item) => !item.streaming)
        .map(({ role, content: c }) => ({ role, content: c }));

      // 本轮要带上的引用块与勾选笔记。
      const sentQuotes = quotesRef.current;
      const sentNoteIds = selectedNoteIdsRef.current;

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      setError(null);
      setBusy(true);

      // 用户的问题**立刻**落盘。
      //
      // 不能等到 AI 答完——如果这轮回答失败、被中断，或者用户直接
      // 切走，学情中心里的「提问 N 次」就不该少算一次。问了就是
      // 问了，跟答没答出来无关。
      {
        const courseId = sessionCourseRef.current;
        if (courseId) {
          void persistSession(courseId, [
            ...messages,
            userMessage,
          ]);
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;

      // ── 静态模式 ──
      //
      // 没有后端的 SSE 通道。直接调 DeepSeek（浏览器直连），
      // 没配 Key 时退到离线引导。
      //
      // 关键是**永远不抛错**——静态模式下助教必须永远能回话。
      if (await isStaticRuntime()) {
        try {
          const localHistory: LocalChatMessage[] = messages
            .filter((item) => !item.streaming)
            .map((item) => ({
              role: item.role === "user" ? "user" : "assistant",
              content: item.content,
              created_at: Date.now(),
            }));

          const result = await askLocalAssistant(
            content,
            localHistory,
            buildLocalContext(),
            controller.signal,
          );

          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: result.answer, streaming: false }
                : message,
            ),
          );

          // 降级提示——告诉用户「这不是完整 AI 回答」。
          if (result.note) {
            setError(null);
            setLocalNotice(result.note);
          }
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            /* 用户主动停止 */
          } else {
            setError("AI 助教暂时不可用，请稍后再试。");
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId && !message.content
                  ? {
                      ...message,
                      content:
                        "**暂时无法生成回答。**你仍可以查看这节课的知识节点与段落导读——它们已经预装好了。",
                      streaming: false,
                    }
                  : message,
              ),
            );
          }
        } finally {
          abortRef.current = null;
          setBusy(false);
          setMessages((prev) => {
            const settled = prev.map((message) =>
              message.streaming ? { ...message, streaming: false } : message,
            );
            const courseId = sessionCourseRef.current;
            if (courseId) writeLocalSession(courseId, settled);
            return settled;
          });
        }
        return;
      }

      const body = JSON.stringify({
        message: content,
        session_id: context?.courseId ?? "workspace",
        history,
        course_id: context?.courseId ?? null,
        page_ids: context?.pageId ? [context.pageId] : [],
        engines,
        // 当前选中的「回答模式」——后端据此即时替换 system 角色里的
        // 角色指令，同时保留这里传来的历史消息。
        persona: personaRef.current,
        language: "zh",
        quotes: sentQuotes.map((item) => ({ text: item.text })),
        note_ids: sentNoteIds,
        // 当前正在看的外链资源——后端据此把 AI 切换成「超级陪读」。
        // 没有资源时是 null，后端就不加这个区块。
        resource: (() => {
          const resource = currentResourceRef.current;
          if (!resource) return null;
          return {
            title: resource.title,
            resource_type: resource.resourceType,
            url: resource.url,
            provider: resource.provider,
            ai_context: resource.aiContext,
          };
        })(),
        // 用户刚刚在视频里触发的知识点——后端据此让 AI「贴着这一秒」
        // 回答，而不是泛泛介绍整个主题。
        interactive: (() => {
          const node = currentInteractiveRef.current;
          if (!node) return null;
          return {
            keyword: node.keyword,
            timestamp: node.timestamp,
            context: node.context,
            hint: node.hint,
            media_title: node.mediaTitle,
          };
        })(),
        // ── 学习者画像 ──
        //
        // 由课前诊断产生。它被静默拼进 system prompt——用户看不到，
        // 但助手知道该按什么难度讲。
        learner_profile: (() => {
          const profile = learnerProfileRef.current;
          if (!profile) return null;
          const prompt = buildLearnerProfilePrompt(
            profile.resourceId,
            profile.epId,
          );
          if (!prompt) return null;
          return {
            course_title: profile.courseTitle,
            episode_title: profile.episodeTitle,
            episode_index: profile.episodeIndex ?? null,
            prompt,
          };
        })(),
      });

      try {
        await streamReply(body, controller.signal, {
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },          onActions: (receipts) => {
            setLastReceipts(receipts);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, actions: receipts }
                  : message,
              ),
            );
            onActionsRef.current?.(receipts);
          },
          onQuiz: (quiz) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId ? { ...message, quiz } : message,
              ),
            );
          },          onDone: (info) => {
            if (info?.backend) setBackend(info.backend);
          },
        });

        // 引用块用完即清——它是一次性的上下文，不该反复发送。
        setQuotes([]);
        setSelectedNoteIds([]);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          // 用户主动停止：保留已收到的部分内容，不报错。
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId && !message.content
                ? {
                    ...message,
                    content: "**请求失败**，请检查后端是否已配置模型密钥。",
                    streaming: false,
                  }
                : message,
            ),
          );
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        setMessages((prev) => {
          const settled = prev.map((message) =>
            message.streaming ? { ...message, streaming: false } : message,
          );
          const courseId = sessionCourseRef.current;
          if (courseId) {
            writeLocalSession(courseId, settled);
            // 同步一份到后端——学情中心的「提问 N 次」数的就是它。
            void persistSession(courseId, settled);
          }
          return settled;
        });
      }
    },
    [busy, context, engines, messages, buildLocalContext],
  );

  /* ── 动作分发中心：知识节点 / 字幕节点被点开 ──────────────────────
   *
   * 正文里点一个知识节点，会广播 ``seek:concept-activated``。这里
   * 是它的**第一个订阅方**，负责动作 A 与动作 B：
   *
   * - **A**：把词条 + 上下文组装成一条完整指令，填进输入框；
   * - **B**：自动把它发出去。
   *
   * 动作 C（左侧留存文档打标记）由 ``ArchiveDrawer`` 订阅同一条
   * 事件完成——三个动作互不依赖，各自落地。
   *
   * 为什么填入和发送要**成对**
   * ----------------------
   *
   * 用户点了「闭包」，屏幕右侧就该立刻出现一句「我在问闭包」的话。
   * 如果只填入不发送，用户会以为点击没生效（输入框里多了一行字，
   * 但没有 AI 在回答）；如果只发送不填入，用户就失去了在发送前
   * 修改措辞的机会。
   *
   * 所以默认两者都做。想只要草稿的话，把事件里的 ``autoSend``
   * 置为 ``false``。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ConceptActivatedDetail>).detail;
      if (!detail?.term) return;

      // 记下「用户此刻触发的知识点」——它会随下一次请求发给后端，
      // 让 AI 能贴着视频的这一秒回答。
      const interactive: CurrentInteractive = {
        keyword: detail.term,
        timestamp: detail.timestampLabel ?? "",
        context: detail.context ?? "",
        hint: detail.hint ?? "",
        mediaTitle: detail.mediaTitle ?? "",
      };
      setCurrentInteractive(interactive);
      currentInteractiveRef.current = interactive;

      const prompt = buildConceptPrompt(
        detail.term,
        detail.context,
        detail.timestampLabel,
        detail.mediaTitle,
      );

      // 动作 A：填进输入框。
      setInputValue(prompt);

      // 动作 B：自动发送。
      if (detail.autoSend === false) {
        // 只填入——让用户自己按下发送。
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLTextAreaElement>("[data-seek-ai-input]")
            ?.focus();
        });
        return;
      }

      void send(prompt);
    };

    window.addEventListener(CONCEPT_ACTIVATED, handler);
    return () => window.removeEventListener(CONCEPT_ACTIVATED, handler);
  }, [send]);

  /**
   * 订阅「引用视频里的某一段」。
   *
   * 与上面的 ``CONCEPT_ACTIVATED`` 是**两条不同的链路**：
   *
   * - 知识节点 → 自动发送（用户点气泡就是「问这个」）；
   * - 时间戳引用 → **只填入，不发送**。
   *
   * 为什么引用不自动发送：引用本身已经是一句完整的话了。用户点
   * [💬 引用提问] 的时候，多半是想**追加**自己的疑问——
   * 「这里为什么用基尼系数而不是洛伦兹曲线？」。自动发出去的话，
   * 那句追加的话就永远打不出来了。
   *
   * 所以这里只做两件事：组装 + 填入 + 聚焦。让用户看到自己引用了
   * 什么，在上面补一句话，然后按发送。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TimestampQuoteDetail>).detail;
      if (!detail?.quote) return;

      const prompt = buildTimestampQuotePrompt({
        mediaTitle: detail.mediaTitle ?? "",
        timestampLabel: detail.timestampLabel ?? "",
        quote: detail.quote,
        question: detail.question,
      });

      // 让后端知道用户此刻卡在视频的哪一秒——AI 的回答里就能
      // 指着这一段说话。
      const interactive: CurrentInteractive = {
        keyword: detail.timestampLabel ?? "",
        timestamp: detail.timestampLabel ?? "",
        context: detail.quote,
        hint: "",
        mediaTitle: detail.mediaTitle ?? "",
      };
      setCurrentInteractive(interactive);
      currentInteractiveRef.current = interactive;

      // 填入输入框，并把光标放到**末尾**——
      // 用户要在这条引用后面接自己的问题，光标在开头会让人得先
      // 手动移到末尾。
      setInputValue(prompt);
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>(
          "[data-seek-ai-input]",
        );
        if (!input) return;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      });
    };

    window.addEventListener(TIMESTAMP_QUOTE, handler);
    return () => window.removeEventListener(TIMESTAMP_QUOTE, handler);
  }, []);

  /**
   * 订阅「用户切换了外链资源」。
   *
   * 平台转型成「全网资源连接枢纽」之后，中间栏显示的是外部视频 /
   * 网页 / 文档。AI **看不见**这些内容——它读不了视频，也读不了被
   * ``X-Frame-Options`` 挡住的网页。
   *
   * 所以每条资源都自带一段预置摘要（``ai_context``）。用户切换资源
   * 时，中间栏把这段摘要连同标题、链接一起广播出来，这里存下来，
   * 下一次提问时随请求发给后端——后端据此把 AI 切换成「超级陪读」。
   *
   * 这个过程**完全静默**：用户不该看到任何提示，他只是换了条视频，
   * 右侧的 AI 就自动跟上了。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ResourceActivatedDetail>).detail;
      if (!detail?.resourceId) return;

      setCurrentResource({
        id: detail.resourceId,
        title: detail.title ?? "",
        resourceType: detail.resourceType ?? "",
        url: detail.url ?? "",
        provider: detail.provider ?? "",
        aiContext: detail.aiContext ?? "",
        studyGuide: detail.studyGuide ?? null,
        guidedSegments: detail.guidedSegments ?? [],
        interactiveNodes: detail.interactiveNodes ?? [],
      });
      currentResourceRef.current = {
        id: detail.resourceId,
        title: detail.title ?? "",
        resourceType: detail.resourceType ?? "",
        url: detail.url ?? "",
        provider: detail.provider ?? "",
        aiContext: detail.aiContext ?? "",
        studyGuide: detail.studyGuide ?? null,
        guidedSegments: detail.guidedSegments ?? [],
        interactiveNodes: detail.interactiveNodes ?? [],
      };
    };

    window.addEventListener(RESOURCE_ACTIVATED, handler);
    return () => window.removeEventListener(RESOURCE_ACTIVATED, handler);
  }, []);

  /**
   * 订阅「把我的直觉发给助教深挖」。
   *
   * 用户在视频画面上做完一道直觉题，点「发给助教深挖」时，视频区
   * 把「当前时间戳 + 题目 + 用户的直觉选项」广播出来，这里把它组装
   * 成一条**自足的**指令填进输入框。
   *
   * 为什么只填入、不自动发送
   * ----------------------
   *
   * 用户的直觉本身只是「半句话」——他可能还想补一句「我为什么会
   * 这么想」，而那恰恰是助教最该听到的。
   *
   * 所以这里**只填入 + 聚焦光标**，等用户补完再按发送。这与
   * 「引用提问」是同一条设计线。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PredictDeepenDetail>).detail;
      if (!detail?.question) return;

      const prompt = buildPredictDeepenPrompt({
        mediaTitle: detail.mediaTitle,
        timestampLabel: detail.timestampLabel,
        question: detail.question,
        chosen: detail.chosen,
        options: detail.options,
        correct: detail.correct,
        keyword: detail.keyword,
      });

      // 让后端知道用户此刻卡在视频的哪一秒——助教的回答里就能指着
      // 这一段说话。
      const interactive: CurrentInteractive = {
        keyword: detail.keyword ?? detail.timestampLabel ?? "",
        timestamp: detail.timestampLabel ?? "",
        context: `我的直觉题作答：${detail.chosen}`,
        hint: "",
        mediaTitle: detail.mediaTitle ?? "",
      };
      setCurrentInteractive(interactive);
      currentInteractiveRef.current = interactive;

      setInputValue(prompt);
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>(
          "[data-seek-ai-input]",
        );
        if (!input) return;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      });
    };

    window.addEventListener(PREDICT_DEEPEN, handler);
    return () => window.removeEventListener(PREDICT_DEEPEN, handler);
  }, []);

  const value = useMemo(
    () => ({
      messages,
      context,
      busy,
      error,
      localNotice,
      backend,
      engines,
      setEngines,
      personas,
      persona,
      setPersona,
      setContext: setContextAndSwitch,
      reset,
      send,
      stop,
      input: inputValue,
      setInput,
      quotes,
      addQuote,
      removeQuote,
      selectedNoteIds,
      setSelectedNoteIds,
      lastReceipts,
      setOnActions,
      currentResource,
      learnerProfile,
      setLearnerProfile: setLearnerProfileAndRef,
    }),
    [
      addQuote,
      backend,
      busy,
      context,
      engines,
      error,
      localNotice,
      inputValue,
      lastReceipts,
      messages,
      persona,
      personas,
      quotes,
      removeQuote,
      reset,
      selectedNoteIds,
      send,
      setContextAndSwitch,
      setInput,
      setOnActions,
      stop,
      currentResource,
      learnerProfile,
      setLearnerProfileAndRef,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used inside ChatProvider");
  }
  return context;
}

/**
 * 读取 SSE 增量。
 *
 * 优先用 ``/api/chat/stream``；若服务器没开流式（或响应不是 SSE），
 * 自动回落到一次性请求，两条路径的对外接口一致。
 */
async function streamReply(
  body: string,
  signal: AbortSignal,
  handlers: {
    onDelta: (delta: string) => void;
    onDone?: (info: { backend?: ChatState["backend"] } | null) => void;
    onActions?: (receipts: ActionReceipt[]) => void;
    onQuiz?: (quiz: QuizCard) => void;
  },
): Promise<void> {
  const response = await apiFetch(apiUrl("/api/chat/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let detail = text || `Request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") detail = parsed.detail;
    } catch {
      /* 不是 JSON 就用原文 */
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    // 非流式响应：一次性拿到完整回复。
    const data = await response.json();
    if (typeof data?.reply === "string") handlers.onDelta(data.reply);
    if (Array.isArray(data?.actions)) {
      handlers.onActions?.(data.actions as ActionReceipt[]);
    }
    handlers.onDone?.({ backend: data?.backend ?? null });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let info: { backend?: ChatState["backend"] } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 以空行分隔事件。
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        if (raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if (typeof event.delta === "string") {
            handlers.onDelta(event.delta);
          }
          if (event.backend) info = { backend: event.backend };
          if (event.error) throw new Error(String(event.error));
          if (Array.isArray(event.actions)) {
            handlers.onActions?.(event.actions as ActionReceipt[]);
          }
          if (event.quiz) {
            handlers.onQuiz?.(event.quiz as QuizCard);
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
  }

  handlers.onDone?.(info);
}

export { ChatContext };
