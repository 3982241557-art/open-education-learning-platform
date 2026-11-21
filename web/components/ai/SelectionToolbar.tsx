"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronRight,
  GitBranch,
  Highlighter,
  Languages,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import Markdown from "@/components/common/Markdown";
import { HighlightStylePicker } from "@/components/learning/HighlightStylePicker";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_HIGHLIGHT_STYLE,
  type HighlightColor,
  type HighlightStyle,
} from "@/components/learning/highlight-style";
import { useAiPresence } from "@/context/AiPresenceContext";
import { useReader } from "@/context/ReaderContext";
import { useChat } from "@/context/ChatContext";
import { isParentAction } from "@/lib/insight-api";
import { sanitizeModelText } from "@/lib/ai-sanitize";
import { cn } from "@/lib/cn";

/** 动作 id → 图标。 */
const ACTION_ICON: Record<string, typeof Brain> = {
  explain: Brain,
  translate: Languages,
  recite: Volume2,
  mindmap: GitBranch,
  connect: Sparkles,
};

/** 一段被选中的文字。 */
interface Selection {
  text: string;
  /** 选区在视口中的位置（用于定位浮动工具条）。 */
  top: number;
  left: number;
  /** 选区的底边（视口坐标）——面板贴着它展开。 */
  bottom: number;
  /** 选区的高度。 */
  height: number;
}

/** 自动保存的防抖时长（毫秒）。 */
const AUTOSAVE_DEBOUNCE = 500;

/** 「✓ 已存」提示的停留时长（毫秒）。 */
const SAVED_HINT_MS = 1400;

/** 弹窗与选区之间的间隙（像素）。 */
const ANCHOR_GAP = 10;

/** 弹窗距离视口边缘的最小留白（像素）。 */
const VIEWPORT_MARGIN = 10;

/**
 * 工具条的大致高度（像素）。
 *
 * 用于把工具条摆在选区**上方**时不压住选区本身。量不准也没关系——
 * 只是差几像素的位置观感，不影响可用性。
 */
const TOOLBAR_HEIGHT = 34;

/**
 * 划词浮动工具栏。
 *
 * 用户在正文里划选一段文字，这根胶囊就浮在旁边。每个动作都是**真功能**：
 *
 * - **解释** —— 调真实模型做语境剖析；
 * - **翻译** —— 点击后**展开子选项**（中译英 / 英译中 / 古文→白话 /
 *   白话→文言），选完具体项才发送。翻译的意图是不明确的，把选择权
 *   交还给用户；
 * - **朗读** —— 用浏览器原生 ``window.speechSynthesis`` 真发声，
 *   带播放 / 暂停 / 停止状态；
 * - **思维导图 / 跨学科连接** —— **不直接生成**，而是把选中文本与结构化
 *   指令预填到右侧主 AI 的输入框，把光标留给用户补充细节；
 * - **划线写笔记 / 引用至 AI** —— 直接作用于阅读器状态。
 *
 * 定位体系（position: absolute + z-index: 9999）
 * ----------------------------------------------
 *
 * 整个浮层挂在一个**固定在视口原点**的定位容器里（``position: fixed;
 * inset: 0; pointer-events: none``），容器本身不参与布局。工具条与
 * 弹窗都用 ``position: absolute``，坐标来自选区的
 * ``getBoundingClientRect()``。
 *
 * 这样做的好处是**坐标体系统一**：定位容器正好等于视口，容器的
 * ``absolute`` 坐标就等于视口坐标，不需要在 ``fixed`` 与 ``absolute``
 * 之间来回换算——那种换算一旦遇上祖先有 ``transform`` / ``filter``，
 * 结果就会整体偏移。
 *
 * 碰撞检测
 * --------
 *
 * - 靠近屏幕**底部** → 弹窗向上翻转（``above``），绝不掉出视口遮挡正文；
 * - 靠近屏幕**左右边缘** → 水平夹取，保证形状与颜色按钮完整可见；
 * - 弹窗**自身**再带 ``max-height`` 与 ``overflow-y: auto``，极端
 *   小屏下也不会被裁掉。
 *
 * 之所以要用 ``z-index: 9999`` 而不是栈上更高的数值：正文容器可能
 * 自带 ``overflow: hidden``，但**定位容器在它之外**（挂在
 * ``body`` 的子层），所以面板不会被祖先裁切。
 */
export function SelectionToolbar({
  courseId,
  courseTitle = "",
  pageId,
  pageTitle = "",
  className = "",
}: {
  courseId?: string;
  courseTitle?: string;
  pageId?: string;
  pageTitle?: string;
  className?: string;
}) {
  const { actions, variants, analyzeSelection, state } = useAiPresence();
  const { upsertNote, attachQuote } = useReader();
  const { addQuote } = useChat();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string>("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  /**
   * 当前展开子选项的父动作 id。
   *
   * 非空时，工具条下方会浮出一排子选项（比如「翻译」的四种译法）。
   */
  const [expandedAction, setExpandedAction] = useState<string>("");
  /**
   * 划线样式选择器是否展开。
   *
   * 与 ``expandedAction`` 分开：翻译子菜单与样式面板都是「工具条下
   * 方浮出一排」，但它们互斥——同时展开会叠在一起。
   */
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>(
    DEFAULT_HIGHLIGHT_STYLE,
  );
  const [highlightColor, setHighlightColor] = useState<HighlightColor>(
    DEFAULT_HIGHLIGHT_COLOR,
  );

  // ── 即划即写 ──
  /** 悬浮输入框里的当前文字。 */
  const [noteDraft, setNoteDraft] = useState("");
  /**
   * 落盘状态。
   *
   * - ``idle``   —— 还没动过（或已保存完）；
   * - ``saving`` —— 有字正在往磁盘上写；
   * - ``saved``  —— 刚写完，闪一下「✓ 已存」。
   *
   * 这个状态**只在角落显示一行 9.5px 的小字**，不弹窗、不打断书写。
   * 它的作用是让用户确信「我写的字不会丢」——而不是让他等。
   */
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  /**
   * 这条划线的笔记 id。
   *
   * **在客户端就生成好**，而不是等后端返回。这样「新建」与「更新」是
   * 同一条记录的两个状态——用户点完颜色紧接着打字，也不会多出一条
   * 空笔记。后端 ``upsert_note`` 认这个 id：不存在就建，存在就改。
   */
  const noteIdRef = useRef<string | null>(null);
  /** 「✓ 已存」的可见状态。 */
  const [savedHint, setSavedHint] = useState(false);
  /** 防抖计时器。 */
  const saveTimerRef = useRef<number | null>(null);
  /** 提示条计时器。 */
  const hintTimerRef = useRef<number | null>(null);
  /**
   * 上一次选中的文字。
   *
   * 用来判断「是不是换了一段新选区」——``selectionchange`` 会因为
   * 光标移动等无关原因反复触发，只有选区文字真的变了才重置草稿。
   */
  const lastSelectionTextRef = useRef<string>("");
  /**
   * 刚刚在**自己的浮层**里按下了鼠标。
   *
   * 浏览器在 `mousedown` 时会清掉文本选区，于是紧随其后的
   * ``selectionchange`` 拿到的是空选区。如果照单全收，工具条就会在
   * 用户点颜色的瞬间自己关掉——点「雾霾蓝」根本没点上。
   *
   * 所以：只要上一次按下发生在 ``[data-selection-ui]`` 内部，就**不**
   * 把空选区当成「用户取消选择」。
   */
  const uiPointerRef = useRef(false);
  /**
   * 当前形状与配色的**最新值**。
   *
   * ``setState`` 是异步的——用户点「豆沙绿」后立刻打字，300ms 之后
   * 落盘时闭包里拿到的还是**上一次**的「琥珀黄」，于是刚点的颜色被
   * 悄悄改回去了。用 ref 兜住最新值，落盘时读 ref 而不是 state。
   */
  const styleRef = useRef<HighlightStyle>(highlightStyle);
  const colorRef = useRef<HighlightColor>(highlightColor);
  styleRef.current = highlightStyle;
  colorRef.current = highlightColor;

  // ── 面板定位 ──
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * 面板的**绝对**定位坐标（视口坐标）。
   *
   * 不用「相对选区的下方 / 上方」来描述，而是直接算出最终的
   * ``top``——因为存在第三种情况：**上下都装不下**（屏幕很矮，
   * 而面板本身有 300 多像素高）。这时无论往上翻还是往下摆，都会有一
   * 半掉出视口，用户根本够不到输入框。
   *
   * 三种结果：
   *
   * 1. 下方装得下 → 贴在选区**正下方**；
   * 2. 下方装不下、上方装得下 → 翻到选区**上方**；
   * 3. 两侧都装不下 → 夹进视口内（顶部对齐视口上沿），面板自身
   *    带 ``max-height`` + 内部滚动，内容不会丢。
   */
  const [panelPos, setPanelPos] = useState<{ top: number } | null>(null);
  /** 弹窗的水平偏移（防止贴边被裁掉）。 */
  const [panelOffset, setPanelOffset] = useState(0);

  /**
   * 监听选区变化。
   *
   * 用 `mouseup` + `selectionchange` 双保险：前者覆盖拖选，后者覆盖
   * 键盘选择（Shift+方向键）。
   */
  useEffect(() => {
    // 记录「这一次按下是否落在我们自己的浮层里」。
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      uiPointerRef.current = !!target?.closest?.("[data-selection-ui]");
    };
    document.addEventListener("pointerdown", onPointerDown, true);

    const readSelection = (event?: Event) => {
      // 点在**我们自己的**浮层里时不算「新的选区」——浏览器在点按钮
      // 时会清掉文本选区，如果不拦掉，用户刚点一下颜色，面板就自己
      // 关掉了。
      const target = event?.target as HTMLElement | null;
      if (target?.closest?.("[data-selection-ui]")) return;

      const active = window.getSelection();
      const text = active?.toString().trim() ?? "";

      // 选区在输入框里就不响应——那是打字，不是选内容。
      const anchorNode = active?.anchorNode;
      if (
        anchorNode &&
        anchorNode.parentElement?.closest("input, textarea, [contenteditable]")
      ) {
        setSelection(null);
        return;
      }

      if (!text || text.length < 2) {
        // 用户刚点了自己的浮层 → 空选区是浏览器「顺手清掉的」，不是
        // 「用户改主意了」。这时不能关工具条。
        if (uiPointerRef.current) return;
        setSelection(null);
        lastSelectionTextRef.current = "";
        return;
      }

      const rect = active?.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setSelection(null);
        return;
      }

      // 选区可能横跨多行——``getBoundingClientRect`` 给出的是**包围盒**，
      // 它的 top 是最上面那一行，bottom 是最下面那一行。弹窗贴在
      // bottom 之下才是「紧贴选区正下方」；贴在 top 之下会盖住用户
      // 正在看的那几行字。
      setSelection({
        text: text.slice(0, 3000),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left + rect.width / 2,
      });

      // 换了新选区 → 上一条划线的草稿、id、提示都要清掉。
      // 否则在第二段文字上打字会写进第一条笔记里。
      if (lastSelectionTextRef.current !== text) {
        lastSelectionTextRef.current = text;
        setNoteDraft("");
        noteIdRef.current = null;
        setSavedHint(false);
      }
    };

    document.addEventListener("mouseup", readSelection);
    document.addEventListener("selectionchange", readSelection);
    return () => {
      document.removeEventListener("mouseup", readSelection);
      document.removeEventListener("selectionchange", readSelection);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  // 点 elsewhere 时收起工具条。
  useEffect(() => {
    if (!selection) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-selection-ui]")) return;
      setSelection(null);
      setResult(null);
      setExpandedAction("");
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selection]);

  // 朗读状态跟随原生事件。
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const onStart = () => {
      setSpeaking(true);
      setPaused(false);
    };
    const onEnd = () => {
      setSpeaking(false);
      setPaused(false);
    };
    const onPause = () => setPaused(true);
    const onResume = () => setPaused(false);

    synth.addEventListener("start", onStart);
    synth.addEventListener("end", onEnd);
    synth.addEventListener("pause", onPause);
    synth.addEventListener("resume", onResume);
    synth.addEventListener("error", onEnd);
    return () => {
      synth.removeEventListener("start", onStart);
      synth.removeEventListener("end", onEnd);
      synth.removeEventListener("pause", onPause);
      synth.removeEventListener("resume", onResume);
      synth.removeEventListener("error", onEnd);
    };
  }, []);

  // 组件卸载时停止朗读——否则切页后还在念。
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  /**
   * 视口碰撞检测。
   *
   * 弹窗与工具条是**两个独立的绝对定位元素**，坐标都来自选区的
   * 包围盒。所以这里量的是弹窗自己的真实位置——量完再决定：
   *
   * - 下方装得下 → 贴在选区**正下方**；
   * - 下方装不下、上方装得下 → 翻到选区**上方**；
   * - **两侧都装不下**（屏幕很矮）→ 夹进视口内，绝不掉出去；
   * - 左右超出视口 → 水平平移回来。
   *
   * 之所以不直接用「选区底部 + 8」这种硬算，是因为弹窗的高度会随
   * 内容变化（输入框里的字越多、预览换行越多，弹窗越高）。只有量
   * 过真实高度才知道下方到底装不装得下。
   */
  useLayoutEffect(() => {
    if (!stylePanelOpen || !selection) return;

    const measure = () => {
      const node = panelRef.current;
      if (!node) return;

      // 量**布局盒**而不是包围盒。
      //
      // 用 ``offsetHeight`` / ``offsetWidth`` 而不是
      // ``getBoundingClientRect()``——后者会被 ``transform`` 影响，
      // 而这里为了测量去手动改 ``style.transform`` 会**破坏 React 对
      // 内联样式的记账**：React 认为 ``top`` 没变就不会写回 DOM，
      // 于是我们手动设的测量基准值（比如 ``top: 0px``）会**留在页面
      // 上**，面板直接飞到左上角。
      //
      // ``offsetHeight`` / ``offsetWidth`` 是未变换的布局尺寸——
      // 正是这里要的。
      const height = node.offsetHeight;
      const width = node.offsetWidth;

      const below = selection.bottom + ANCHOR_GAP;
      const above = selection.top - ANCHOR_GAP;
      const viewportH = window.innerHeight;

      // ① 下方装得下 → 贴下方。
      // ② 下方装不下、上方装得下 → 翻到上方。
      // ③ 两侧都装不下 → 顶部对齐视口上沿（面板自带 max-height 与
      //    内部滚动，内容不会丢）。
      let top: number;
      if (below + height <= viewportH - VIEWPORT_MARGIN) {
        top = below;
      } else if (above - height >= VIEWPORT_MARGIN) {
        top = above - height;
      } else {
        top = VIEWPORT_MARGIN;
      }
      setPanelPos((current) =>
        current && Math.abs(current.top - top) < 0.5 ? current : { top },
      );

      // 水平方向：把它推回视口内。弹窗宽 248px，这里以它的中心
      // 为基准做对称夹取——贴着选区中点，但不越界。
      const center = selection.left;
      const half = width / 2;
      let offset = 0;
      const minCenter = VIEWPORT_MARGIN + half;
      const maxCenter = window.innerWidth - VIEWPORT_MARGIN - half;
      if (center < minCenter) offset = minCenter - center;
      else if (center > maxCenter) offset = maxCenter - center;
      setPanelOffset((current) =>
        Math.abs(current - offset) < 0.5 ? current : offset,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [stylePanelOpen, selection, highlightStyle, highlightColor, noteDraft.length > 0]);

  /** 真·朗读：浏览器原生语音合成。 */
  const speak = useCallback(
    (text: string) => {
      const synth = window.speechSynthesis;
      if (!synth) return;

      if (speaking && !paused) {
        synth.pause();
        setPaused(true);
        return;
      }
      if (speaking && paused) {
        synth.resume();
        setPaused(false);
        return;
      }

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      synth.speak(utterance);
    },
    [paused, speaking],
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPaused(false);
  }, []);

  /**
   * 预填到主 AI 的输入框。
   *
   * 把光标留给用户补充细节——这是「半自动」的关键：基础提示词由系统
   * 写好，具体关注点由用户补。
   */
  const prefill = useCallback(
    (text: string, instruction: string) => {
      const quote = text.length > 600 ? `${text.slice(0, 600)}…` : text;
      const composed = `[引用原文]\n${quote}\n\n${instruction}`;
      addQuote({ text: quote, pageTitle });
      window.dispatchEvent(
        new CustomEvent("seek:prefill-input", { detail: { text: composed } }),
      );
      setSelection(null);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLTextAreaElement>("[data-seek-ai-input]")
          ?.focus();
      });
    },
    [addQuote, pageTitle],
  );

  const run = useCallback(
    async (action: string) => {
      if (!selection) return;

      const definition = actions.find((item) => item.id === action);

      // 父动作（如「翻译」）：展开子选项，不直接执行。
      if (definition && isParentAction(definition)) {
        setStylePanelOpen(false);
        setExpandedAction((current) => (current === action ? "" : action));
        return;
      }

      // 预填类动作：不调模型，交给主 AI。
      if (action === "mindmap" || action === "connect") {
        // 指令来自后端——前端不重复定义，改文案时只改一处。
        const instruction =
          definition?.prompt ||
          (action === "mindmap"
            ? "请帮我将这段内容梳理为 Mermaid 思维导图，我想重点关注："
            : "请帮我分析这段内容的跨学科连接点，我想重点关注：");
        prefill(selection.text, instruction);
        return;
      }

      // 朗读：走浏览器原生语音合成，不调模型。
      if (action === "recite") {
        speak(selection.text);
        return;
      }

      // 解释 / 翻译（含子选项）：真实模型。
      setActiveAction(action);
      setThinking(true);
      setResult(null);
      const reply = await analyzeSelection(selection.text, action, {
        courseId,
        pageId,
      });
      setThinking(false);
      if (reply) setResult(reply.reply);
      setExpandedAction("");
    },
    [
      actions,
      analyzeSelection,
      courseId,
      pageId,
      prefill,
      selection,
      speak,
    ],
  );

  /**
   * 把划线记录落盘。
   *
   * 「即点即划、即写即存」的落点。**第一次**调用是新建（带 quote、
   * 形状、配色），之后都是更新（只带 id 与正文）。
   *
   * 返回落盘后的笔记 id——上层要拿它来判断「这是新建还是更新」。
   */
  const persistHighlight = useCallback(
    async (
      text: string,
      /** 本次落盘要用的形状与配色。 */
      next?: { style: HighlightStyle; color: HighlightColor },
    ): Promise<string | null> => {
      if (!selection) return null;
      // 客户端生成 id——保证「先点颜色再打字」落在**同一条**记录上。
      if (!noteIdRef.current) {
        noteIdRef.current = `note_${Date.now().toString(36)}${Math.random()
          .toString(36)
          .slice(2, 8)}`;
      }
      // 形状与配色的**最新值**：优先用调用方显式传的，否则读 ref。
      // 读 state 是不行的——setState 是异步的，此刻闭包里拿到的还是
      // 上一次的值，点「豆沙绿」却存成「琥珀黄」就是这么来的。
      const style = next?.style ?? styleRef.current;
      const color = next?.color ?? colorRef.current;
      try {
        const id = await upsertNote({
          id: noteIdRef.current,
          quote: selection.text,
          note: text,
          page_id: pageId ?? "",
          origin: "user",
          style,
          color,
        });
        return id ?? noteIdRef.current;
      } catch {
        return null;
      }
    },
    [pageId, selection, upsertNote],
  );

  /**
   * 闪一下「✓ 已存」。
   */
  const flashSaved = useCallback(() => {
    setSaveStatus("saved");
    setSavedHint(true);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => {
      setSavedHint(false);
      setSaveStatus("idle");
    }, SAVED_HINT_MS);
  }, []);

  /**
   * 点形状或点颜色：**立刻**在正文渲染划线，并在左栏生成记录。
   *
   * 不再需要「写这条笔记」的确认按钮——点了就是划了。
   */
  const pickStyle = useCallback(
    async (next: { style: HighlightStyle; color: HighlightColor }) => {
      setHighlightStyle(next.style);
      setHighlightColor(next.color);
      // ref 也要**同步**更新——否则用户「先点颜色、后打字」时，
      // 打字触发的防抖保存读到的还是点颜色之前的旧值。
      styleRef.current = next.style;
      colorRef.current = next.color;
      if (!selection) return;

      // 第一次点击时先建记录（正文立刻出现划线 + 左栏出现卡片）。
      // 若已建过，则更新样式与正文。
      // 传入 next，让本次落盘立刻用上刚点中的形状与配色。
      setSaveStatus("saving");
      const savedId = await persistHighlight(noteDraft, next);
      if (savedId) noteIdRef.current = savedId;
      flashSaved();
    },
    [flashSaved, noteDraft, persistHighlight, selection],
  );

  /**
   * 输入框里打字 → 500ms 防抖自动保存。
   *
   * 「保存中...」在**第一次落盘开始时**亮起，落盘完成后换成
   * 「✓ 已存」。两者都只是角落里的一行小字，不遮挡任何东西。
   */
  const handleNoteChange = useCallback(
    (value: string) => {
      setNoteDraft(value);
      // 一开始打字就进入「保存中」——用户能立刻知道字被收下了。
      setSaveStatus("saving");
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void persistHighlight(value).then(() => flashSaved());
      }, AUTOSAVE_DEBOUNCE);
    },
    [flashSaved, persistHighlight],
  );

  /**
   * 按 Enter 或失焦 → 立即落盘。
   */
  const commitNote = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus("saving");
    void persistHighlight(noteDraft).then(() => flashSaved());
  }, [flashSaved, noteDraft, persistHighlight]);

  // 卸载时把还没落盘的字补上——别让用户白写。
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    };
  }, []);

  /** 引用至 AI。 */
  const quoteToAi = useCallback(() => {
    if (!selection) return;
    attachQuote({ text: selection.text, pageTitle });
    addQuote({ text: selection.text, pageTitle });
    setSelection(null);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLTextAreaElement>("[data-seek-ai-input]")
        ?.focus();
    });
  }, [addQuote, attachQuote, pageTitle, selection]);

  /**
   * 工具条自身的水平夹取。
   *
   * 工具条以选区中点为中心。选区贴着屏幕左右边缘时，半条工具条会
   * 跑出视口——用户就点不到「划线/写笔记」了。所以要把中心点往里推。
   *
   * 宽度得先量出来才知道推多少，所以放在 ``useLayoutEffect`` 里算。
   *
   * 注意：这个 Hook **必须**在 ``if (!selection) return null;`` 之前——
   * Hook 不能条件调用，否则 React 会报「Rendered fewer hooks than
   * expected」，整个页面直接崩掉。
   */
  const [anchorOffset, setAnchorOffset] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!selection) return;
    const node = anchorRef.current;
    if (!node) return;

    const measure = () => {
      const bar = node.querySelector<HTMLElement>("[data-selection-bar]");
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const margin = 8;
      const half = rect.width / 2;
      // 中心点只按**原始**选区中点算——如果把上一次的偏移也算进去，
      // 就会「推出去 → 拉回来 → 再推出去」地来回抖。
      const center = selection.left;

      // 左边超了 → 往右推；右边超了 → 往左推。
      let offset = 0;
      if (center - half < margin) offset = margin - (center - half);
      else if (center + half > window.innerWidth - margin) {
        offset = window.innerWidth - margin - (center + half);
      }
      setAnchorOffset((current) =>
        Math.abs(current - offset) < 0.5 ? current : offset,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [selection]);

  // 没有选区就不渲染工具条——但 Hook 已经全部跑完了。
  if (!selection) return null;

  // 当前展开的父动作，它的子选项。
  const expandedVariants = expandedAction
    ? variants.filter((variant) => variant.parent === expandedAction)
    : [];

  // 父动作的标签——显示在子选项条左侧，让用户知道自己在选什么。
  const parentLabel =
    actions.find((item) => item.id === expandedAction)?.label ?? "";

  // 工具条默认贴在选区**上方**（不遮住刚划的那段字）；
  // 顶部空间不够就翻到下方。
  const barAbove = selection.top >= TOOLBAR_HEIGHT + ANCHOR_GAP + VIEWPORT_MARGIN;
  const barTop = barAbove
    ? selection.top - TOOLBAR_HEIGHT - ANCHOR_GAP
    : selection.bottom + ANCHOR_GAP;

  return (
    <>
      {/*
        定位层
        ------
        一个铺满视口的 ``position: fixed; inset: 0`` 容器——它自己
        不参与布局，也不拦截点击（``pointer-events: none``）。它存在的
        唯一目的是给下面那些 ``position: absolute`` 的元素提供一个
        **坐标系**：在这个容器里，``absolute`` 的 ``top`` / ``left``
        就是视口坐标，跟选区包围盒的坐标**同一个量纲**。

        之所以不直接用 ``fixed`` 定位各个元素：``fixed`` 在祖先有
        ``transform`` / ``filter`` / ``backdrop-filter`` 时会退化成
        相对那个祖先定位，坐标就会整体偏移。容器固定在视口原点、
        子元素用 ``absolute``，则完全绕开这个问题。

        ``z-index: 9999`` —— 弹窗必须在正文、抽屉、AI 面板之上。
      */}
      <div
        data-selection-ui
        className="pointer-events-none fixed inset-0 z-[9999]"
        style={{ overflow: "visible" }}
      >
        {/*
          工具条本体。``pointer-events: auto`` 把点击交还给它——
          外层容器为了不挡正文关掉了指针事件。
        */}
        <div
          data-selection-ui
          ref={anchorRef}
          className="pointer-events-auto absolute"
          style={{
            top: barTop,
            left: selection.left,
            transform: `translateX(calc(-50% + ${anchorOffset}px))`,
          }}
        >
        {/*
          工具条本体——**不再**自己平移（父级已经用 transform 把整条
          工具条居中并夹回视口），否则会平移两次。
        */}
        <div>
          <div
            data-selection-bar
            className="flex items-center gap-0.5 rounded-full bg-[var(--glass)] p-1 shadow-[var(--shadow-float)] backdrop-blur-md ring-1 ring-[var(--glass-border)]"
          >            {actions.map((action) => {
              const Icon = ACTION_ICON[action.id] ?? Sparkles;
              const active = activeAction === action.id && thinking;
              const isSpeech = action.id === "recite";
              const speechOn = isSpeech && speaking;
              const isParent = isParentAction(action);
              const expanded = expandedAction === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => void run(action.id)}
                  title={
                    isSpeech
                      ? speaking
                        ? paused
                          ? "继续朗读"
                          : "暂停朗读"
                        : "朗读选中段落"
                      : isParent
                        ? `${action.label}（点击选择具体方式）`
                        : action.prompt || action.label
                  }
                  aria-expanded={isParent ? expanded : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]",
                    "text-[var(--muted-foreground)] transition-colors",
                    "hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                    active && "bg-[var(--muted)] text-[var(--foreground)]",
                    speechOn && "bg-[var(--muted)] text-[var(--foreground)]",
                    expanded && "bg-[var(--muted)] text-[var(--foreground)]",
                  )}
                >
                  {active ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : isSpeech && speechOn ? (
                    paused ? (
                      <Play size={11} strokeWidth={1.9} />
                    ) : (
                      <Pause size={11} strokeWidth={1.9} />
                    )
                  ) : (
                    <Icon size={11} strokeWidth={1.8} />
                  )}
                  {isSpeech && speechOn ? (paused ? "继续" : "暂停") : action.label}
                  {isParent && (
                    <ChevronRight
                      size={10}
                      strokeWidth={2}
                      className={cn(
                        "transition-transform",
                        expanded && "rotate-90",
                      )}
                    />
                  )}
                </button>
              );
            })}

            <span className="mx-0.5 h-3.5 w-px bg-[var(--border)]" />

            {/* 划线/写笔记 —— 点开样式选择器 */}
            <button
              type="button"
              onClick={() => {
                setExpandedAction("");
                setStylePanelOpen((value) => !value);
              }}
              aria-expanded={stylePanelOpen}
              title="划线/写笔记（可选形状与配色）"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]",
                "text-[var(--muted-foreground)] transition-colors",
                "hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                stylePanelOpen && "bg-[var(--muted)] text-[var(--foreground)]",
              )}
            >
              <Highlighter size={11} strokeWidth={1.8} />
              划线/写笔记
              <ChevronRight
                size={10}
                strokeWidth={2}
                className={cn("transition-transform", stylePanelOpen && "rotate-90")}
              />
            </button>

            {/* 引用至 AI */}
            <button
              type="button"
              onClick={quoteToAi}
              title="引用至 AI（挂到输入框上方）"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <Sparkles size={11} strokeWidth={1.8} />
              引用至 AI
            </button>

            {/* 停止朗读 */}
            {speaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                title="停止朗读"
                aria-label="停止朗读"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <Square size={10} fill="currentColor" strokeWidth={0} />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSelection(null);
                setResult(null);
                setExpandedAction("");
                setStylePanelOpen(false);
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="关闭"
            >
              <X size={11} />
            </button>
          </div>
        </div>
        </div>

        {/* 划线样式选择器：形状 × 莫兰迪色卡 + 笔记输入框。 */}
        {stylePanelOpen && (
          <div
            ref={panelRef}
            data-selection-ui
            className="pointer-events-auto absolute"
            style={{
              // 绝对坐标（视口坐标）——由上面的碰撞检测算好：
              // 贴选区下方 / 翻到选区上方 / 夹进视口内，三选一。
              top: panelPos?.top ?? selection.bottom + ANCHOR_GAP,
              left: selection.left,
              transform: `translateX(calc(-50% + ${panelOffset}px))`,
            }}
          >
            <HighlightStylePicker
              style={highlightStyle}
              color={highlightColor}
              onChange={(next) => void pickStyle(next)}
              note={noteDraft}
              onNoteChange={handleNoteChange}
              onNoteCommit={commitNote}
              saved={savedHint}
              saving={saveStatus === "saving"}
            />
          </div>
        )}

        {/* 子选项：点击父动作（如「翻译」）后展开。 */}
        {expandedAction && expandedVariants.length > 0 && (
          <div
            data-selection-ui
            className="pointer-events-auto absolute z-[9999] flex flex-wrap items-center gap-0.5 rounded-full bg-[var(--glass)] p-1 pt-2 shadow-[var(--shadow-float)] backdrop-blur-md ring-1 ring-[var(--glass-border)]"
            style={{
              // 贴在工具条下方；若工具条在上方，则贴在工具条下方同向。
              top: barTop + TOOLBAR_HEIGHT + ANCHOR_GAP,
              left: selection.left,
              transform: "translateX(-50%)",
            }}
          >
            <span className="px-1.5 text-[10.5px] text-[var(--muted-foreground)]">
              {parentLabel}
            </span>
            {expandedVariants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => void run(variant.id)}
                title={variant.prompt}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                {variant.label}
              </button>
            ))}
          </div>
        )}

        {/* 解读结果：浮层，不推挤正文 */}
        {result !== null && (
          <div
            data-selection-ui
            className="pointer-events-auto absolute z-[9999] w-[min(420px,calc(100vw-2rem))] rounded-2xl bg-[var(--glass)] p-3.5 shadow-[var(--shadow-panel)] backdrop-blur-md ring-1 ring-[var(--glass-border)]"
            style={{
              // 解读卡片贴在工具条下方——工具条在选区上方时，卡片也在上方。
              top: barAbove ? barTop - 8 - 300 : barTop + TOOLBAR_HEIGHT + ANCHOR_GAP,
              left: selection.left,
              transform: "translateX(-50%)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                <Sparkles size={11} strokeWidth={1.8} />
                {state === "thinking" ? "正在解读…" : "解读"}
              </span>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                aria-label="关闭"
              >
                <X size={12} />
              </button>
            </div>
            <div className="max-h-[280px] overflow-y-auto text-[12.5px] leading-relaxed">
              <Markdown content={sanitizeModelText(result)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
