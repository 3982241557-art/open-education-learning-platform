/**
 * 动作分发中心
 * ============
 *
 * 正文里的每一个「可点击的东西」——知识节点（`[[闭包]]`）、视频下方的
 * 字幕节点——点下去之后要触发**三个动作**：
 *
 * .. code-block:: text
 *
 *     点击节点
 *        │
 *        ├─ A → 词条 + 上下文填进右侧 AI 的输入框
 *        ├─ B → 自动向 AI 发出「请用白话解释一下这个词」
 *        └─ C → 左侧留存文档打上一个时间戳标记
 *
 * 这三个动作落在**三个互不相干的组件树**里（中间正文 / 右侧 AI 面板 /
 * 左侧留存抽屉）。它们没有共同父节点，所以靠 props 透传是不可能的。
 *
 * 为什么不直接在这里调 ``useChat()`` / ``useReader()``
 * ----------------------------------------------------
 *
 * 因为「动作分发中心」不是 React 组件，它没法用 hook。它只负责**发
 * 一条事件**，具体怎么落地由各自的订阅方决定：
 *
 * - ``ChatContext`` 订阅 → 填输入框 + 发消息（它自己知道怎么发）；
 * - ``ArchiveDrawer`` 订阅 → 打时间戳标记（它自己知道怎么写文件）。
 *
 * 这样正文渲染层只依赖「发事件」，不依赖任何具体的状态容器——
 * 以后换 Zustand、换 Context，正文都不用动。
 *
 * 「填入」与「发送」的先后
 * ----------------------
 *
 * 动作 A（填入）和动作 B（发送）必须**成对**发生，且填入在前。
 * 但用户可能不想让 AI 立刻回答——所以这里做成**可配置的**：
 *
 * - ``autoSend: true``（默认）→ 填入后立刻发出，用户看得到全过程；
 * - ``autoSend: false`` → 只填入，用户自己按发送。
 *
 * 无论哪种，动作 C 的时间戳标记都会打上——因为那是"我注意到了这
 * 个词"的事实记录，和 AI 回不回答无关。
 */

import {
  CONCEPT_ACTIVATED,
  type ConceptActivatedDetail,
} from "@/lib/learning-events";

/** 点击知识节点后触发动作的选项。 */
export interface ActivateConceptOptions {
  /** 被点中的词条。 */
  term: string;
  /** 词条所在的那句话——AI 需要它才能解释得准。 */
  context?: string;
  /** 课程 id。 */
  courseId?: string;
  /** 页 id——标记要打到正确的位置。 */
  pageId?: string;
  /** 视频播放位置（秒）。 */
  timestamp?: number;
  /** 时间戳的展示文本——「12:34」。 */
  timestampLabel?: string;
  /** 触发来源。 */
  source?: "concept" | "caption";
  /**
   * 触发来源的媒体标题。
   *
   * 视频气泡触发时带上它——AI 的回答里就能指名道姓地说「在这节课的
   * 02:00 处……」。
   */
  mediaTitle?: string;
  /**
   * 作者为这个知识点写的引导问题。
   *
   * 它比原话更适合喂给模型——作者已经替用户想好了「这里该问什么」。
   */
  hint?: string;
  /** 是否自动发送。默认 ``true``。 */
  autoSend?: boolean;
}

/**
 * 触发一次「知识节点」动作。
 *
 * 只发一条事件——具体三个动作由订阅方各自落地。
 */
export function activateConcept(options: ActivateConceptOptions): void {
  if (typeof window === "undefined") return;

  const term = (options.term || "").trim();
  if (!term) return;

  const detail: ConceptActivatedDetail & { autoSend: boolean } = {
    term,
    context: options.context,
    courseId: options.courseId,
    pageId: options.pageId,
    timestamp: options.timestamp,
    timestampLabel: options.timestampLabel,
    source: options.source ?? "concept",
    mediaTitle: options.mediaTitle,
    hint: options.hint,
    autoSend: options.autoSend ?? true,
  };

  window.dispatchEvent(
    new CustomEvent<ConceptActivatedDetail>(CONCEPT_ACTIVATED, { detail }),
  );
}

/**
 * 组装一条「请解释这个词」的指令。
 *
 * 单独抽出来，是因为它同时被两处使用：动作 B 直接发给 AI，以及
 * 动作 A 填进输入框时作为可编辑的草稿。两者必须是**同一句话**——
 * 否则用户看到输入框里的话和实际发出去的话不一样，会觉得被骗了。
 *
 * 视频气泡触发时（``mediaTitle`` 有值），提示词会指名道姓地说出
 * 视频名与时间戳——用户看得到自己「正在看视频的 02:00 处」，AI 也
 * 知道说的是哪一段。
 */
export function buildConceptPrompt(
  term: string,
  context?: string,
  timestampLabel?: string,
  mediaTitle?: string,
): string {
  const parts: string[] = [`请结合当前视频语境，用白话解释一下「${term}」`];

  if (timestampLabel) {
    parts.push(`（视频 ${timestampLabel} 处）`);
  }

  let body = `${parts.join(" ")}。`;

  if (mediaTitle) {
    body += `我正在看的是《${mediaTitle}》。`;
  }

  if (context && context.trim()) {
    body += `这个词在这句话里出现：「${context.trim()}」。`;
  }

  body += "先说它是什么，再说为什么需要它，最后给一个具体的例子。";
  return body;
}

/**
 * 「引用这一段并提问」
 * =====================
 *
 * 用户在视频下方的某一行（知识节点 / 段落导读 / 完整字幕）点
 * [💬 引用提问] 时，会发生：
 *
 * 1. 抓取当前视频标题 + 当前时间戳 + 该行的原文；
 * 2. 组装成一条**带高亮引用格式**的指令；
 * 3. 填进右侧 AI 的输入框，**光标聚焦等待发送**。
 *
 * 与 :func:`buildConceptPrompt` 的区别
 * ----------------------------------
 *
 * 「知识节点」那条链路是**自动发送**的——用户点气泡就代表「我要问
 * 这个」，不必再按一次发送。
 *
 * 而「引用提问」是**半自动**的：先把组装好的引用放进输入框，让用户
 * 看到、可以改、补一句自己的问题，再按发送。
 *
 * 为什么不自动发送
 * ----------------
 *
 * 因为引用本身已经是一句**完整的话**了。用户点它的时候，多半想
 * 追加自己的疑问（「这里为什么用基尼系数而不是洛伦兹曲线？」）。
 * 自动发送的话那条追加的话就永远打不出来了。
 *
 * 高亮引用格式
 * ------------
 *
 * .. code-block:: text
 *
 *     > 引用自主播视频《MIT 线性代数》第 3 讲 [03:20]：
 *     > 「从 Scratch 起步的用意，是让学习者先建立直觉再引入符号。」
 *
 *     请帮我详细拆解这一段。
 *
 * 用 Markdown 引用块是因为后端会把这段原样送进模型的 prompt，
 * 而**引用块**是模型最熟悉的「这是引文」的信号——它会知道这段
 * 文字是用户提供的原始材料，而不是用户的指令。
 */
export function buildTimestampQuotePrompt(options: {
  /** 视频标题。 */
  mediaTitle: string;
  /** 时间戳展示文本——「03:20」。 */
  timestampLabel: string;
  /** 被引用的那一行原文。 */
  quote: string;
  /** 用户额外想问的——留空时用默认的「请帮我详细拆解这一段」。 */
  question?: string;
}): string {
  const { mediaTitle, timestampLabel, quote, question } = options;
  const trimmedQuote = (quote || "").trim();
  const ask = (question || "").trim() || "请帮我详细拆解这一段。";

  const lines: string[] = [];

  if (mediaTitle) {
    lines.push(`> 引用自主播视频《${mediaTitle}》[${timestampLabel}]：`);
  } else {
    lines.push(`> 引用自主播视频 [${timestampLabel}]：`);
  }
  if (trimmedQuote) {
    lines.push(`> 「${trimmedQuote}」`);
  }
  lines.push("");
  lines.push(ask);

  return lines.join("\n");
}

/**
 * 把秒数格式化成 ``mm:ss``。
 *
 * 超过一小时才加小时段——课程视频很少长到那个份上。
 */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
