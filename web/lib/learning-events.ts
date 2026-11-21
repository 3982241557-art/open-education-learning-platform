/**
 * 全局学习事件总线
 * ================
 *
 * 「阅读器 ↔ 留存文档 ↔ 双 AI ↔ 学习计划 ↔ 学情中心」这五个模块
 * 分处不同路由、不同组件树，彼此没有父子关系。要让「用户在正文里
 * 划一条线」这件事**立刻**反映到左栏抽屉、日历格与学情中心的数字
 * 上，靠 props 层层透传是不现实的——路由一变，父子关系就断了。
 *
 * 所以用一组**浏览器自定义事件**做总线：
 *
 * ====================  ==========================================
 * 事件                  何时触发
 * ====================  ==========================================
 * ``seek:note-updated``  笔记被新增 / 修改 / 删除
 * ``seek:plan-updated``  计划被新增 / 修改 / 勾选 / 删除
 * ``seek:progress-updated``  阅读进度或测验结果变化
 * ``seek:trace-updated`` 学习轨迹整体变化（上面三者的并集）
 * ====================  ==========================================
 *
 * 为什么不放进 React Context
 * -------------------------
 *
 * Context 的作用域是**组件树**。计划页与课程页是两个不同的路由，
 * 不共享任何 Provider——但它们都要在对方改动时刷新。用事件把这条
 * 链路接起来，比为了跨路由而把状态提到根部要干净得多。
 */

/**
 * 知识向导的最小形状。
 *
 * 事件总线不能依赖 ``courses-api``——那会形成循环引用（课程数据层
 * 自己也要发事件）。所以这里只声明 AI 助教实际用到的字段。
 */
export interface StudyGuideLike {
  strategy?: string;
  checkpoints?: string[];
  suggested_questions?: Array<{ title: string }>;
}

/** 段落导读的最小形状。 */
export interface GuidedSegmentLike {
  timestamp: number;
  title: string;
  content: string;
}

/** 时间轴知识节点的最小形状。 */
export interface InteractiveNodeLike {
  timestamp: number;
  keyword: string;
  context?: string;
  hint?: string;
}

/** 笔记变化。 */
export const NOTE_UPDATED = "seek:note-updated";
/** 计划变化。 */
export const PLAN_UPDATED = "seek:plan-updated";
/** 进度 / 测验结果变化。 */
export const PROGRESS_UPDATED = "seek:progress-updated";
/** 学习轨迹整体变化。 */
export const TRACE_UPDATED = "seek:trace-updated";

/* ── 动作分发中心 ──────────────────────────────────────────────────────
 *
 * 正文里的「知识节点」（`[[闭包]]`）和视频下方的「字幕节点」都是
 * **可点击**的。点一下会发生三件事：
 *
 * 1. 词条 + 上下文被填进右侧 AI 的输入框；
 * 2. 一条「请用白话解释一下这个词」的指令被自动发出；
 * 3. 左侧留存文档被打上一个时间戳标记。
 *
 * 这三件事分属三个组件树（中间正文 / 右侧 AI / 左侧抽屉），彼此
 * 没有父子关系——所以走**同一条事件总线**，而不是层层透传 props。
 *
 * 事件只发一次，由订阅方各自认领：
 * - ``ChatContext`` 订阅它 → 填输入框 + 发消息；
 * - ``ArchiveDrawer`` 订阅它 → 打时间戳标记。
 */
export const CONCEPT_ACTIVATED = "seek:concept-activated";

/* ── 资源切换 ──────────────────────────────────────────────────────────
 *
 * 平台转型为「全网资源连接枢纽」之后，中间栏显示的**不是本地正文**，
 * 而是用户正在看的外部资源（视频 / 网页 / 电子书）。
 *
 * AI 看不见这些内容——它既读不了视频，也读不了被 ``X-Frame-Options``
 * 挡住的网页。用户每切换一条资源，右侧的 AI 就得知道「他现在在看
 * 什么」，否则陪读就无从谈起。
 *
 * 所以资源切换会广播一次 ``seek:resource-activated``，携带当前资源
 * 的元数据与预置摘要。``ChatContext`` 订阅它，更新自己的「当前资源」。
 */
export const RESOURCE_ACTIVATED = "seek:resource-activated";

/* ── 时间戳引用 ────────────────────────────────────────────────────────
 *
 * 视频下方的每一行（知识节点 / 段落导读 / 完整字幕）前面都有一颗
 * 微小的 [💬 引用提问] 按钮。点它，用户想引用的那一段会被**原样**
 * 组装成一条带高亮引用块的消息，填进右侧 AI 的输入框。
 *
 * 与 ``CONCEPT_ACTIVATED`` 的分工：
 *
 * - ``CONCEPT_ACTIVATED`` = 「我要问这个概念」→ **自动发送**；
 * - ``TIMESTAMP_QUOTE``   = 「我要引用这一段」→ **只填入，等用户
 *   补一句自己的问题再发**。
 *
 * 后者之所以不自动发送，原因见 ``buildTimestampQuotePrompt`` 的
 * 文档——引用本身已经是完整的一句话了，用户多半要往上追加。
 */
export const TIMESTAMP_QUOTE = "seek:timestamp-quote";

/** 时间戳引用事件的载荷。 */
export interface TimestampQuoteDetail {
  /** 被引用的原文——那一行 / 那一段的正文。 */
  quote: string;
  /** 时间戳展示文本——「03:20」。 */
  timestampLabel: string;
  /** 视频标题。 */
  mediaTitle?: string;
  /** 用户自己补的问题——留空则用默认的拆解请求。 */
  question?: string;
  /** 所属课程 id。 */
  courseId?: string;
  /** 所属页 / 资源 id。 */
  pageId?: string;
}

/* ── 视频跳转 ──────────────────────────────────────────────────────────
 *
 * 左侧的「视频切片导航」与中间的播放器是**两棵互不相干的组件树**
 * ——左栏在 ``ArchiveDrawer`` 的兄弟节点里，播放器在中间栏。它们没有
 * 共同的父节点，所以没法靠 props 透传。
 *
 * 所以点左侧的某个知识锚点时，左栏广播一条 ``seek:video-seek``，
 * 中间的 ``InteractiveVideoCanvas`` 订阅它并调用 ``seekTo()``。
 *
 * 载荷要带**资源 id**：一节课可能有多个视频资源，不带 id 就会跳到
 * 错误的那一个。
 */
export const VIDEO_SEEK = "seek:video-seek";

/**
 * 「切到另一条视频资源」的请求。
 *
 * 左侧的切片导航里列着多条视频，点其中一条时，中间栏的播放器要换成
 * 它。两个组件树没有父子关系，所以靠这条事件联动。
 */
export const RESOURCE_SWITCH = "seek:resource-switch";

/** 切换资源事件的载荷。 */
export interface ResourceSwitchDetail {
  /** 要切到的资源 id。 */
  resourceId: string;
  /** 所属课程 id。 */
  courseId?: string;
  /** 所属节点（页）id。 */
  pageId?: string;
}

/** 视频跳转事件的载荷。 */
export interface VideoSeekDetail {
  /** 要跳转的资源 id。 */
  resourceId?: string;
  /** 目标时间（秒）。 */
  timestamp?: number;
  /** 所属课程 id。 */
  courseId?: string;
  /** 所属节点（页）id。 */
  pageId?: string;
}

/** 资源被切换时的载荷。 */
export interface ResourceActivatedDetail {
  /** 资源 id。 */
  resourceId?: string;
  /** 资源标题。 */
  title?: string;
  /** 资源类型——``video`` / ``webpage`` / ``document``。 */
  resourceType?: string;
  /** 外链地址。 */
  url?: string;
  /** 来源平台。 */
  provider?: string;
  /**
   * 预置的 AI 上下文（摘要 / 核心知识点）。
   *
   * 这是 AI 唯一能拿到的、关于这份资源的信息。
   */
  aiContext?: string;
  /**
   * 知识向导——预装好的「带着哪几个问题看」。
   *
   * 静态模式下 AI 助教没有后端可问，只能拿这份**预装导读**来组织
   * 离线回答。所以它必须随资源一起广播出去。
   */
  studyGuide?: StudyGuideLike | null;
  /** 段落导读——视频下方的结构化导读轨。 */
  guidedSegments?: GuidedSegmentLike[];
  /** 时间轴上的知识节点。 */
  interactiveNodes?: InteractiveNodeLike[];
  /** 所属课程 id。 */
  courseId?: string;
  /** 所属节点（页）id。 */
  pageId?: string;
}

/** 知识节点被点开时的载荷。 */
export interface ConceptActivatedDetail {
  /** 被点中的词条本身——「闭包」。 */
  term: string;
  /** 词条所在的上下文句子——AI 需要它才能解释得准。 */
  context?: string;
  /** 所属课程 id。 */
  courseId?: string;
  /** 所属页 id——用于把标记打到正确的位置。 */
  pageId?: string;
  /** 视频播放位置（秒）。字幕节点会带上。 */
  timestamp?: number;
  /** 展示用的时间戳文本——「12:34」。 */
  timestampLabel?: string;
  /** 触发来源——``concept`` 或 ``caption``。 */
  source?: "concept" | "caption";
  /**
   * 触发来源的媒体标题——「斯坦福/哈佛公开课体验 · 什么是机会成本？」。
   *
   * 视频气泡触发时带上它，AI 就能在回答里指名道姓地说「你正在看的
   * 这节课里……」——而不是含糊地说「这个视频」。
   */
  mediaTitle?: string;
  /**
   * 作者为这个知识点写的**引导问题**。
   *
   * 它比原话更适合喂给模型——作者已经替用户想好了「这里该问什么」。
   */
  hint?: string;
  /**
   * 是否自动发送。
   *
   * 默认 ``true``——填入输入框后立刻发出去。置为 ``false`` 时只填
   * 不发，让用户自己按下发送。
   */
  autoSend?: boolean;
}

/** 通知的详细载荷。 */
export interface LearningEventDetail {
  /** 课程 id。 */
  courseId?: string;
  /** 笔记 id（笔记事件才有）。 */
  noteId?: string;
  /** 计划 id（计划事件才有）。 */
  planId?: string;
  /** 来源——用于让组件判断「是不是我自己触发的」。 */
  source?: string;
  /**
   * 资源切换事件的载荷。
   *
   * 资源枢纽型课程里，用户每换一条外链资源，中间栏就广播一次
   * ``seek:resource-activated``——右侧 AI 靠它知道「用户此刻在看
   * 什么」。
   */
  resourceId?: string;
  /** 资源标题。 */
  title?: string;
  /** 资源类型——``video`` / ``webpage`` / ``document``。 */
  resourceType?: string;
  /** 外链地址。 */
  url?: string;
  /** 来源平台。 */
  provider?: string;
  /** 预置的 AI 上下文（摘要）。 */
  aiContext?: string;
  /**
   * 知识向导——预装导读。
   *
   * 静态模式下 AI 助教没有后端可问，只能拿这份**预装导读**来组织
   * 离线回答。所以它必须随资源一起广播出去。
   */
  studyGuide?: StudyGuideLike | null;
  /** 段落导读——视频下方的结构化导读轨。 */
  guidedSegments?: GuidedSegmentLike[];
  /** 时间轴上的知识节点。 */
  interactiveNodes?: InteractiveNodeLike[];
  /** 所属节点（页）id。 */
  pageId?: string;
  /** 触发来源的媒体标题——视频气泡触发时带上。 */
  mediaTitle?: string;
  /**
   * 作者为这个知识点写的**引导问题**。
   *
   * 它比原话更适合喂给模型——作者已经替用户想好了「这里该问什么」。
   */
  hint?: string;
}

/** 广播一个学习事件。 */
export function emitLearningEvent(
  type: string,
  detail: LearningEventDetail = {},
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
  // 追踪事件是「上面几件事」的并集——只想关心「轨迹变了」的组件
  // 监听这一个就够了。
  if (type !== TRACE_UPDATED) {
    window.dispatchEvent(new CustomEvent(TRACE_UPDATED, { detail }));
  }
}

/**
 * 订阅学习事件。
 *
 * 返回取消订阅函数——React 的 `useEffect` 需要它来清理。
 */
export function onLearningEvent(
  type: string,
  handler: (detail: LearningEventDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<LearningEventDetail>).detail ?? {};
    handler(detail);
  };
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}

/**
 * 广播一次「视频跳转」请求。
 *
 * 左侧的切片导航调用它，中间的播放器订阅它并 ``seekTo()``。
 */
export function emitVideoSeek(detail: VideoSeekDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<VideoSeekDetail>(VIDEO_SEEK, { detail }));
}

/**
 * 广播一次「跳到当前视频的某个时刻」的请求。
 *
 * 与 :func:`emitVideoSeek` 的区别是**不限定资源 id**——AI 回答里的
 * 时间锚点（``03:20``）是相对于**用户此刻正在看的这条视频**说的，
 * 所以没有资源 id 可言。
 *
 * 播放器收到后会自行校验：如果自己当前播的资源不匹配，就忽略。
 */
export function requestVideoSeek(detail: {
  timestamp: number;
  resourceId?: string;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<VideoSeekDetail>(VIDEO_SEEK, {
      detail: {
        timestamp: detail.timestamp,
        resourceId: detail.resourceId,
      },
    }),
  );
}

/**
 * 广播一次「引用视频里的某一段并提问」。
 *
 * 订阅方是 ``ChatContext``——它会把引用组装成带高亮引用块的消息填进
 * 输入框，并把光标聚焦过去，等待用户补一句自己的问题再按发送。
 */
export function emitTimestampQuote(detail: TimestampQuoteDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TimestampQuoteDetail>(TIMESTAMP_QUOTE, { detail }),
  );
}

/**
 * 广播一次「切到另一条视频资源」的请求。
 *
 * 左侧的切片导航调用它，中间栏的播放器订阅它并换成那条资源。
 */
export function emitResourceSwitch(detail: ResourceSwitchDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ResourceSwitchDetail>(RESOURCE_SWITCH, { detail }),
  );
}
