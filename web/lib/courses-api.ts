import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
  staticFetch,
} from "@/shared/api/client";
import { fetchManifest } from "@/lib/static-data";

/**
 * 课程的前端数据客户端。
 *
 * 课程数据来自后端的本地 JSON 文件（``backend/data/courses/*.json``），
 * 结构与原版 DeepTutor 的 Book Engine 一致：``book`` / ``spine`` / ``pages``
 * / ``progress`` 四段，字段名照抄 ``deeptutor/book/models.py``。
 */

/** 原版 ``BookStatus``。 */
export type BookStatus =
  | "draft"
  | "spine_ready"
  | "compiling"
  | "paused"
  | "ready"
  | "error"
  | "archived";

/** 原版 ``PageStatus``。 */
export type PageStatus =
  | "pending"
  | "planning"
  | "generating"
  | "ready"
  | "partial"
  | "error";

/** 原版 ``BlockStatus``。 */
export type BlockStatus = "pending" | "generating" | "ready" | "error" | "hidden";

/** 原版 ``BlockType``。 */
export type BlockType =
  | "text"
  | "callout"
  | "quiz"
  | "user_note"
  | "figure"
  | "interactive"
  | "animation"
  | "code"
  | "timeline"
  | "flash_cards"
  | "deep_dive"
  | "section"
  | "concept_graph"
  | "diagnostic"
  | "pretest"
  | "retrieval_practice"
  | "error_diagnosis"
  | "module_test"
  | "progress_dashboard"
  /** 互联网教学视频——正文流里原生播放。 */
  | "video"
  /**
   * 外链资源块——资源枢纽型课程的主力。
   *
   * 平台不托管正文，只挂载全网公开资源；前端按 ``payload.resource_type``
   * 决定挂载哪种渲染器（播放器 / iframe / 文档查看器）。
   */
  | "resource";

/**
 * 外链资源的类型。
 *
 * 这是平台从「文本托管方」转向「全网资源连接枢纽」之后的**核心枚举**。
 */
export type ResourceType = "video" | "webpage" | "document";

/** 原版 ``ContentType``。 */
export type ContentType =
  | "theory"
  | "derivation"
  | "history"
  | "practice"
  | "concept"
  | "overview";

/** 原版 ``BookDepth``。 */
export type BookDepth = "brief" | "standard" | "deep";

/** 原版 ``SourceAnchor``。 */
export interface SourceAnchor {
  kind: string;
  kb_name: string;
  ref: string;
  snippet: string;
}

/** 原版 ``Block``。 */
export interface Block {
  id: string;
  type: BlockType;
  status: BlockStatus;
  title: string;
  params: Record<string, unknown>;
  payload: Record<string, unknown>;
  source_anchors: SourceAnchor[];
  metadata: Record<string, unknown>;
  error: string;
  created_at: number;
  updated_at: number;
}

/** 原版 ``PageLink``。 */
export interface PageLink {
  target_page_id: string;
  relation: string;
  label: string;
}

/** 原版 ``Page``。 */
export interface Page {
  id: string;
  book_id: string;
  chapter_id: string;
  title: string;
  learning_objectives: string[];
  content_type: ContentType;
  status: PageStatus;
  order: number;
  blocks: Block[];
  links: PageLink[];
  parent_page_id: string;
  /** 一句话导读。资源枢纽里用来解释「这个节点要解决什么问题」。 */
  summary: string;
  error: string;
  created_at: number;
  updated_at: number;
}

/**
 * 「先猜后看」认知钩子
 * =====================
 *
 * 在视频揭晓某个概念**之前**，先问一个极简直觉问题，让用户 3 秒内
 * 做个判断，再揭示核心结论。
 *
 * 借鉴自两个开源项目的交互模式：
 *
 * - **oppia/oppia** 的 Exploration 交互状态机——「问题 → 用户选择
 *   → 即时反馈 → 后续追问」这条链路被提炼成一个**四态状态机**。
 * - **mathigon/textbooks** 的行内微测验——用「一步作答 + 一步揭示」
 *   的极简重量打断阅读节奏，而不是弹窗打断。
 *
 * ⚠️ **已弃用**
 *
 * 这套「先猜后看」的**前端呈现**（右下角小黑条）已被移除，改由
 * 两级课程架构里的玻璃拟态诊断卡承担（见
 * ``components/learning/EpisodeDiagnosticModal.tsx``）。
 *
 * 数据字段保留——它记录了作者手写的定制题，是有价值的内容资产；
 * 只是不再在播放器右下角渲染。
 */
export interface PredictHook {
  /** 一句话直觉问题（≤28 字）。 */
  question: string;
  /** 2~3 个极简选项。 */
  options: string[];
  /** 引导性参考答案的下标（从 0 开始）。 */
  correct_index: number;
  /** 选完后 1 句话点破认知冲突。 */
  reveal_hint: string;
  /**
   * 这道题是从哪里来的。
   *
   * - ``authored`` —— 数据里手写的定制题（质量最高）；
   * - ``generated`` —— 运行时按节点类型生成的兜底题。
   */
  origin?: "authored" | "generated";
}

/**
 * 一个**交互节点**——视频播放到某个时间戳时弹出的知识点。
 *
 * 这是「流媒体交互式沙盘」的核心：用户在视频画面上看到浮出的气泡，
 * 点它，视频暂停，右侧 AI 被唤醒并就当前语境讲解这个概念。
 */
export interface InteractiveNode {
  /**
   * 本节点所属的**集 id**。
   *
   * K12 分片数据里每条节点都标了它属于哪一集——前端据此精确过滤，
   * 避免用户在第 3 讲看到第 11 讲的知识点。
   */
  ep_id?: string;
  /** 触发时间（秒）。 */
  timestamp: number;
  /** 气泡上显示的关键词。 */
  keyword: string;
  /** 节点类型——`concept` / `question` / `quote` / `warning`。 */
  type: "concept" | "question" | "quote" | "warning";
  /** 触发时刻的视频上下文（字幕原文）。 */
  context?: string;
  /** 给 AI 的额外提示。 */
  hint?: string;
  /** 节点在 UI 上的分组标签。 */
  context_label?: string;
  /** 节点来源——`extracted` / `generated` / `manual`。 */
  origin?: string;
  /**
   * 「先猜后看」认知钩子——可选。
   *
   * 没有它时，运行时按节点类型生成一道兜底题（见
   * :func:`lib/predict-hook`），所以**任何**课程都能立刻体验到。
   */
  predict_hook?: PredictHook;
  /**
   * 深度追问指令——点击这个节点后**直接发给右侧助教**的问题。
   *
   * 与 `hint` 的区别：`hint` 是「这个概念该怎么理解」的引导语，
   * `prompt` 是一条**自足的具体问题**，助教拿到就能作答。
   */
  prompt?: string;
  /**
   * 这个节点对应的**真实时间轴锚点**标题。
   *
   * 由「三级证据链」装配器写入——它来自视频自带的章节、简介时间码
   * 或字幕段落聚合，是这条视频**真实存在**的结构锚点。
   */
  anchor_title?: string;
  /**
   * 锚点来源——`chapter` / `description` / `transcript` / `pacing`。
   *
   * `pacing` 表示这个时间点是按教学法比例**推演**出来的，不是
   * 视频自带的章节——前端可以据此降级显示（不声称「本章标题」）。
   */
  anchor_origin?: string;
  [key: string]: unknown;
}

/**
 * **一集**——系列课程里的最小学习单元。
 *
 * 两级课程结构
 * ------------
 *
 * .. code-block:: text
 *
 *     /courses/[courseId]           第一层 · 课程目录页
 *       └─ 简介 · 总进度条 · 完整分集目录
 *
 *     /courses/[courseId]/[epId]    第二层 · 单集沉浸学习页
 *       └─ ← 返回目录 · 当前集标题 · 播放器 · AI 助教 · 折叠辅助区
 *
 * 「一集」可以是三种形态
 * --------------------
 *
 * 1. **原生分 P**（B 站）—— ``page`` 有值，播放地址是
 *    ``?bvid=...&p=N``。每集是一条独立视频。
 * 2. **官方播放列表**（YouTube）—— ``youtube_id`` 指向独立视频。
 * 3. **时间轴切片**—— ``start_time`` / ``end_time`` 圈定区间，
 *    播放时自动定位到区间内，播到末尾即停。
 */
export interface Episode {
  /** 集的唯一标识——在所属课程内唯一。 */
  ep_id: string;
  /** 集标题——「Lecture 1 - C」这样。 */
  title: string;
  /** 在系列里的序号（从 1 开始）。 */
  index: number;
  /** 系列总集数。 */
  total: number;
  /** 播放地址（原生分 P / 独立视频时用）。 */
  video_url?: string;
  /** B 站 bvid。 */
  bvid?: string;
  /** B 站分 P 页码（1 开始）。 */
  page?: number | null;
  /** YouTube 视频 id。 */
  youtube_id?: string;
  /** 本集时长（秒）。 */
  duration?: number;
  /** 本集在原视频里的起点（秒）——时间轴切片时用。 */
  start_time?: number;
  /** 本集在原视频里的终点（秒）——时间轴切片时用。 */
  end_time?: number | null;
  /** 本集的核心概念——诊断卡据此出题。 */
  key_concepts?: string[];
  /** 拆分方式：`pages` / `playlist` / `chapters` / `single`。 */
  origin?: string;
}

/**
 * **知识向导**——右侧顶部那张折叠便签的数据。
 *
 * 由 AI 装配器预先生成（不是每次打开都实时调用模型），
 * 所以打开中台的任何一条视频，策略与提问灵感**立刻就在**。
 */
export interface StudyGuide {
  /** 一句话说明本节视频的最佳观看/思考策略。 */
  strategy: string;
  /** 3 条核心思维检查点。 */
  checkpoints: string[];
  /** 带认知角度标签的「提问灵感」胶囊。 */
  suggested_questions: SuggestedQuestion[];
}

/** 一个「提问灵感」胶囊。 */
export interface SuggestedQuestion {
  /** 8 字内的提问标题。 */
  title: string;
  /** 完整、具体、可直接发给 AI 助教的高质量问题。 */
  prompt: string;
  /** 认知角度标签——「机制追问」「反例检验」等。 */
  angle: string;
}

/**
 * **段落导读**的一段——视频下方那条导读轨。
 *
 * 即使视频没有逐字 CC 字幕，这段导读也必须存在：它让用户在看之前
 * 就知道「这一段在讲什么」，也让导读轨永远不会是一片空白。
 */
export interface GuidedSegment {
  /**
   * 本导读所属的**集 id**——K12 分片数据用它做精确过滤。
   */
  ep_id?: string;
  /** 这段的起始时间（秒）。 */
  timestamp: number;
  /** 这段的小标题。 */
  title: string;
  /** 这一段在讲什么、要注意什么、可以带着什么问题看。 */
  content: string;
  /** 对应的真实时间轴锚点标题。 */
  anchor_title?: string;
  /** 锚点来源——`chapter` / `description` / `transcript` / `pacing`。 */
  anchor_origin?: string;
}

/**
 * 一条**字幕**。
 *
 * 视频的完整文字轨。它跟交互节点是两回事：
 *
 * * 交互节点是**作者挑出来的**知识点（少而精，会弹气泡）；
 * * 字幕是**视频自己说的**全部内容（多而全，逐句滚过）。
 *
 * 有了字幕轨，即便一条视频**没有标注任何交互节点**，用户也能读
 * 到内容、点击任一句提问——所以它不是可有可无的附属品，而是让
 * 「无标注视频」也能进入沙盘的前提。
 */
export interface VideoCaption {
  /** 字幕出现的时刻（秒）。 */
  start: number;
  /** 这一句的文本。 */
  text: string;
}

/**
 * 一条**外链资源**。
 *
 * 挂在知识节点下面，指向全网的公开内容。
 */
export interface Resource {
  id: string;
  resource_type: ResourceType;
  title: string;
  url: string;
  /**
   * **备用源**——主源连不上时的兜底直链。
   *
   * 通常是云盘 / OSS / 对象存储上的同款 ``.mp4``。前端播放器在
   * ``onError`` 或超时之后会自动切到它，用户不需要做任何操作。
   */
  fallback_url?: string;
  /**
   * 预置的 AI 上下文（摘要 / 核心知识点）。
   *
   * AI **看不见**外部视频，也读不了被 `X-Frame-Options` 挡住的网页。
   * 这段摘要是唯一的桥梁——用户看资源，AI 拿着它陪读。
   */
  ai_context: string;
  provider: string;
  meta: Record<string, unknown>;
  captions: VideoCaption[];
  /**
   * **交互节点**——视频播放到某个时间戳时弹出的知识点。
   *
   * 为空数组的纯视频资源不会触发气泡。
   */
  interactive_nodes?: InteractiveNode[];
  /**
   * **知识向导**——右侧顶部折叠便签的数据。
   *
   * 预装好的——不用等模型现场生成，点开就有。
   */
  study_guide?: StudyGuide;
  /**
   * **段落导读**——视频下方的结构化导读轨。
   *
   * 5~8 段，每段带时间戳，可点击跳转、可划词提问。
   */
  guided_segments?: GuidedSegment[];
  /**
   * 纯正中文学术导读——简介是乱码 / 广告 / 纯英文时的兜底。
   */
  academic_intro?: string;
  /**
   * **分集列表**——这条资源被拆成了几集。
   *
   * 只有 1 集（或没有）时，课程目录页显示「一讲」；
   * 多集时显示完整目录，每集可单独进入沉浸学习页。
   */
  episodes?: Episode[];
  /**
   * 这条资源是否已经被 AI 装配过自学框架。
   *
   * 同步时**已装配的资源只刷新基础元数据**，学习框架原样保留。
   */
  is_structured?: boolean;
  is_default: boolean;
  /**
   * 这段摘要是不是**自动合成**的。
   *
   * 自动合成的概要信息量有限。AI 拿到这个标记，就知道该诚实地说
   * 「这条资源我只有概要」——而不是假装自己读完了全文。
   */
  auto_context?: boolean;
}

/**
 * 一条资源的**学习痕迹**。
 *
 * 资源级进度与页级进度是两回事：一个节点下面挂着三条外链，用户可能
 * 只看了其中一条。所以每条资源单独记账。
 */
export interface ResourceProgress {
  resource_id: string;
  resource_type: ResourceType;
  title: string;
  url: string;
  provider: string;
  ai_context: string;
  auto_context: boolean;
  course_id: string;
  course_title: string;
  topic_id: string;
  topic_title: string;
  node_id: string;
  node_title: string;
  /** 在这条资源上累计停留的秒数。 */
  dwell_seconds: number;
  /** 有没有打开过。 */
  opened: boolean;
  /** 用户是否**显式**标记了「看完了」。 */
  marked_done: boolean;
  /** 算不算「已看」——停留够久 **或** 显式标记。 */
  seen: boolean;
  last_active_at: number;
  /**
   * 最后播放位置（秒）。
   *
   * 只有资源枢纽型课程（公开课）有——它播放的是视频，位置是秒。
   */
  last_position?: number;
  /** 视频总时长（秒）。 */
  duration?: number;
  /** 所属学科分类的标题（公开课）。 */
  category_title?: string;
  /** 这条视频里埋了几个知识节点（公开课）。 */
  node_count?: number;
}

/** 资源枢纽里的一个知识节点。 */
export interface HubNode {
  id: string;
  topic_id: string;
  title: string;
  question: string;
  summary: string;
  order: number;
  resources: Resource[];
}

/** 资源枢纽里的一个主题模块。 */
export interface HubTopic {
  id: string;
  title: string;
  summary: string;
  order: number;
  node_ids: string[];
}

/** 资源枢纽的顶层结构。 */
export interface Hub {
  is_hub: boolean;
  topics: HubTopic[];
  nodes: HubNode[];
  resources: Resource[];
}

/** 原版 ``Chapter``。 */
export interface Chapter {
  id: string;
  title: string;
  learning_objectives: string[];
  content_type: ContentType;
  source_anchors: SourceAnchor[];
  prerequisites: string[];
  page_ids: string[];
  summary: string;
  order: number;
}

/** 原版 ``ConceptNode``。 */
export interface ConceptNode {
  id: string;
  label: string;
  chapter_id: string;
  description: string;
  weight: number;
}

/** 原版 ``ConceptEdge``。 */
export interface ConceptEdge {
  src: string;
  dst: string;
  relation: string;
  rationale: string;
}

/** 原版 ``ConceptGraph``。 */
export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

/** 原版 ``Spine``。 */
export interface Spine {
  book_id: string;
  version: number;
  updated_at: number;
  exploration_summary: string;
  concept_graph: ConceptGraph;
  chapters: Chapter[];
}

/** 原版 ``BookProposal``。 */
export interface BookProposal {
  title: string;
  description: string;
  scope: string;
  target_level: string;
  estimated_chapters: number;
  rationale: string;
}

/** 原版 ``Book`` manifest。 */
export interface Book {
  id: string;
  revision: number;
  title: string;
  description: string;
  status: BookStatus;
  proposal: BookProposal | null;
  knowledge_bases: string[];
  language: string;
  depth: BookDepth;
  page_count: number;
  chapter_count: number;
  created_at: number;
  updated_at: number;
  metadata: Record<string, unknown>;
  kb_fingerprints: Record<string, string>;
  kb_document_fingerprints: Record<string, Record<string, string>>;
  stale_page_ids: string[];
  stale_detected_at: number;
}

/** 原版 ``Progress``。 */
export interface Progress {
  book_id: string;
  current_page_id: string;
  visited_page_ids: string[];
  bookmarked_page_ids: string[];
  quiz_attempts: Array<Record<string, unknown>>;
  weak_chapters: string[];
  score: number;
  updated_at: number;
}

/**
 * 一门课程 = 一个 ``Book`` + 它的 spine / pages / progress。
 *
 * ``lesson_count`` / ``total_minutes`` / ``category`` / ``level`` / ``tags``
 * 是后端算出的派生字段，供列表页展示用。
 */
export interface Course {
  book: Book;
  spine: Spine;
  pages: Page[];
  progress: Progress;
  id: string;
  revision: number;
  title: string;
  description: string;
  status: BookStatus;
  proposal: BookProposal | null;
  knowledge_bases: string[];
  language: string;
  depth: BookDepth;
  page_count: number;
  chapter_count: number;
  created_at: number;
  updated_at: number;
  metadata: Record<string, unknown>;
  kb_fingerprints: Record<string, string>;
  kb_document_fingerprints: Record<string, Record<string, string>>;
  stale_page_ids: string[];
  stale_detected_at: number;
  source?: string;
  lesson_count: number;
  total_minutes: number;
  block_count: number;
  category: string;
  level: string;
  /**
   * 难度级别（入门 / 进阶 / 高阶）。
   *
   * 已废弃——这套标签带年龄与圈层暗示，而且没告诉用户「需要先会什么」。
   * 改用 ``prerequisite``。后端仍然返回这个字段（值为空串），仅为
   * 兼容旧调用方。
   */
  difficulty: string;
  tags: string[];
  /**
   * 通识支柱 id（四大支柱之一）。
   *
   * 由后端 `app/services/taxonomy.py` 判定——分类轴是**学科**，不是难度。
   */
  pillar: string;
  /** 支柱的中文名。 */
  pillar_name: string;
  /** 支柱的一句话说明。 */
  pillar_blurb: string;
  /**
   * 前置知识要求 id。
   *
   * 代替难度分级：告诉用户「你需要先会什么」，让他自己决定要不要挑战。
   */
  prerequisite: string;
  /** 前置知识要求的中文标签。 */
  prerequisite_label: string;
  /**
   * 资源枢纽数据（Topic → Node → Resource）。
   *
   * 只有「资源枢纽型」课程才有内容——旧的文本课程这里是空的。
   */
  hub: Hub;
}

/** 写入用的课程载荷（与磁盘上的四段结构一致）。 */
export interface CoursePayload {
  book: Book;
  spine?: Partial<Spine>;
  pages?: Page[];
  progress?: Partial<Progress>;
}

/** 当前选中的工作区作用域。 */
function courseWorkspace(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("skill_workspace") ?? "";
}

function apiUrlScoped(path: string): string {
  const url = apiUrl(path);
  const scope = courseWorkspace();
  return scope
    ? `${url}${url.includes("?") ? "&" : "?"}skill_workspace=${encodeURIComponent(scope)}`
    : url;
}

function normalizeBlock(raw: any): Block {
  return {
    id: String(raw?.id ?? ""),
    type: String(raw?.type ?? "text") as BlockType,
    status: String(raw?.status ?? "pending") as BlockStatus,
    title: String(raw?.title ?? ""),
    params: (raw?.params ?? {}) as Record<string, unknown>,
    payload: (raw?.payload ?? {}) as Record<string, unknown>,
    source_anchors: Array.isArray(raw?.source_anchors) ? raw.source_anchors : [],
    metadata: (raw?.metadata ?? {}) as Record<string, unknown>,
    error: String(raw?.error ?? ""),
    created_at: Number(raw?.created_at ?? 0) || 0,
    updated_at: Number(raw?.updated_at ?? 0) || 0,
  };
}

function normalizePage(raw: any): Page {
  return {
    id: String(raw?.id ?? ""),
    book_id: String(raw?.book_id ?? ""),
    chapter_id: String(raw?.chapter_id ?? ""),
    title: String(raw?.title ?? ""),
    learning_objectives: Array.isArray(raw?.learning_objectives)
      ? raw.learning_objectives.map((item: any) => String(item))
      : [],
    content_type: String(raw?.content_type ?? "theory") as ContentType,
    status: String(raw?.status ?? "pending") as PageStatus,
    order: Number(raw?.order ?? 0) || 0,
    blocks: Array.isArray(raw?.blocks) ? raw.blocks.map(normalizeBlock) : [],
    links: Array.isArray(raw?.links) ? raw.links : [],
    parent_page_id: String(raw?.parent_page_id ?? ""),
    summary: String(raw?.summary ?? ""),
    error: String(raw?.error ?? ""),
    created_at: Number(raw?.created_at ?? 0) || 0,
    updated_at: Number(raw?.updated_at ?? 0) || 0,
  };
}

function normalizeChapter(raw: any): Chapter {
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? ""),
    learning_objectives: Array.isArray(raw?.learning_objectives)
      ? raw.learning_objectives.map((item: any) => String(item))
      : [],
    content_type: String(raw?.content_type ?? "theory") as ContentType,
    source_anchors: Array.isArray(raw?.source_anchors) ? raw.source_anchors : [],
    prerequisites: Array.isArray(raw?.prerequisites)
      ? raw.prerequisites.map((item: any) => String(item))
      : [],
    page_ids: Array.isArray(raw?.page_ids) ? raw.page_ids.map((item: any) => String(item)) : [],
    summary: String(raw?.summary ?? ""),
    order: Number(raw?.order ?? 0) || 0,
  };
}

function normalizeCourse(raw: any): Course {
  const pages = Array.isArray(raw?.pages) ? raw.pages.map(normalizePage) : [];
  const spineRaw = raw?.spine ?? {};
  const chapters = Array.isArray(spineRaw?.chapters)
    ? spineRaw.chapters.map(normalizeChapter)
    : [];
  const book = (raw?.book ?? {}) as Book;
  const metadata = (raw?.metadata ?? {}) as Record<string, unknown>;

  const tags = Array.isArray(metadata.tags) ? metadata.tags.map((tag: any) => String(tag)) : [];

  return {
    book,
    spine: {
      book_id: String(spineRaw?.book_id ?? book.id ?? ""),
      version: Number(spineRaw?.version ?? 1) || 1,
      updated_at: Number(spineRaw?.updated_at ?? 0) || 0,
      exploration_summary: String(spineRaw?.exploration_summary ?? ""),
      concept_graph: spineRaw?.concept_graph ?? { nodes: [], edges: [] },
      chapters,
    },
    pages,
    progress: (raw?.progress ?? {}) as Progress,
    id: String(raw?.id ?? book.id ?? ""),
    revision: Number(raw?.revision ?? book.revision ?? 1) || 1,
    title: String(raw?.title ?? book.title ?? ""),
    description: String(raw?.description ?? book.description ?? ""),
    status: String(raw?.status ?? book.status ?? "draft") as BookStatus,
    proposal: raw?.proposal ?? book.proposal ?? null,
    knowledge_bases: Array.isArray(raw?.knowledge_bases)
      ? raw.knowledge_bases.map((item: any) => String(item))
      : [],
    language: String(raw?.language ?? book.language ?? "en"),
    depth: String(raw?.depth ?? book.depth ?? "standard") as BookDepth,
    page_count: Number(raw?.page_count ?? pages.length) || pages.length,
    chapter_count: Number(raw?.chapter_count ?? chapters.length) || chapters.length,
    created_at: Number(raw?.created_at ?? book.created_at ?? 0) || 0,
    updated_at: Number(raw?.updated_at ?? book.updated_at ?? 0) || 0,
    metadata,
    kb_fingerprints: (raw?.kb_fingerprints ?? {}) as Record<string, string>,
    kb_document_fingerprints: (raw?.kb_document_fingerprints ?? {}) as Record<
      string,
      Record<string, string>
    >,
    stale_page_ids: Array.isArray(raw?.stale_page_ids) ? raw.stale_page_ids : [],
    stale_detected_at: Number(raw?.stale_detected_at ?? 0) || 0,
    source: String(raw?.source ?? "user"),
    lesson_count: Number(raw?.lesson_count ?? pages.length) || pages.length,
    total_minutes: Number(raw?.total_minutes ?? 0) || 0,
    block_count:
      Number(raw?.block_count ?? 0) ||
      pages.reduce((sum: number, page: Page) => sum + page.blocks.length, 0),
    category: String(raw?.category ?? metadata.category ?? ""),
    level: String(raw?.level ?? metadata.level ?? ""),
    difficulty: String(raw?.difficulty ?? metadata.difficulty ?? raw?.level ?? metadata.level ?? ""),
    tags,
    // ── 通识分类（后端 taxonomy 判定） ──
    pillar: String(raw?.pillar ?? "humanities"),
    pillar_name: String(raw?.pillar_name ?? "人文经典"),
    pillar_blurb: String(raw?.pillar_blurb ?? ""),
    prerequisite: String(raw?.prerequisite ?? "none"),
    prerequisite_label: String(raw?.prerequisite_label ?? "无需前置"),
    hub: normalizeHub(raw?.hub),
  };
}

/**
 * 归一化「先猜后看」钩子。
 *
 * 数据里写坏的钩子（选项太少、答案下标越界）会被丢成
 * ``undefined``。
 *
 * ⚠️ 前端**不再渲染**这个钩子——旧的右下角小黑条已被玻璃拟态
 *    诊断卡取代。但字段仍然保留在数据里：它是作者手写的定制题，
 *    是一份有价值的内容资产。
 */
function normalizePredictHook(raw: any): PredictHook | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const question = String(raw?.question ?? "").trim();
  const options = Array.isArray(raw?.options)
    ? raw.options.map((item: any) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const correctIndex = Number(raw?.correct_index);
  const revealHint = String(raw?.reveal_hint ?? "").trim();

  if (!question || options.length < 2) return undefined;
  if (!Number.isInteger(correctIndex)) return undefined;
  if (correctIndex < 0 || correctIndex >= options.length) return undefined;
  if (!revealHint) return undefined;

  return {
    question,
    options,
    correct_index: correctIndex,
    reveal_hint: revealHint,
    origin: "authored",
  };
}

function normalizeResource(raw: any): Resource {
  return {
    id: String(raw?.id ?? ""),
    resource_type: (String(raw?.resource_type ?? "webpage") as ResourceType),
    title: String(raw?.title ?? ""),
    url: String(raw?.url ?? ""),
    fallback_url: raw?.fallback_url ? String(raw.fallback_url) : undefined,
    ai_context: String(raw?.ai_context ?? ""),
    provider: String(raw?.provider ?? ""),
    meta: (raw?.meta ?? {}) as Record<string, unknown>,
    captions: Array.isArray(raw?.captions)
      ? raw.captions
          .map((caption: any) => ({
            start: Number(caption?.start ?? 0) || 0,
            text: String(caption?.text ?? "").trim(),
          }))
          .filter((caption: VideoCaption) => caption.text.length > 0)
          .sort((a: VideoCaption, b: VideoCaption) => a.start - b.start)
      : [],
    interactive_nodes: Array.isArray(raw?.interactive_nodes)
      ? raw.interactive_nodes.map((node: any) => ({
          timestamp: Number(node?.timestamp ?? 0) || 0,
          keyword: String(node?.keyword ?? ""),
          type: (String(node?.type ?? "concept") as InteractiveNode["type"]),
          context: node?.context ? String(node.context) : undefined,
          hint: node?.hint ? String(node.hint) : undefined,
          predict_hook: node?.predict_hook
            ? normalizePredictHook(node.predict_hook)
            : undefined,
        }))
      : [],
    is_default: Boolean(raw?.is_default),
    auto_context: Boolean(raw?.auto_context),
  };
}

function normalizeHub(raw: any): Hub {
  const topics = Array.isArray(raw?.topics)
    ? raw.topics.map((topic: any) => ({
        id: String(topic?.id ?? ""),
        title: String(topic?.title ?? ""),
        summary: String(topic?.summary ?? ""),
        order: Number(topic?.order ?? 0) || 0,
        node_ids: Array.isArray(topic?.node_ids) ? topic.node_ids.map((id: any) => String(id)) : [],
      }))
    : [];
  const nodes = Array.isArray(raw?.nodes)
    ? raw.nodes.map((node: any) => ({
        id: String(node?.id ?? ""),
        topic_id: String(node?.topic_id ?? ""),
        title: String(node?.title ?? ""),
        question: String(node?.question ?? ""),
        summary: String(node?.summary ?? ""),
        order: Number(node?.order ?? 0) || 0,
        resources: Array.isArray(node?.resources) ? node.resources.map(normalizeResource) : [],
      }))
    : [];
  const resources = Array.isArray(raw?.resources) ? raw.resources.map(normalizeResource) : [];
  return {
    is_hub: Boolean(raw?.is_hub),
    topics,
    nodes,
    resources,
  };
}

export async function listCourses(): Promise<Course[]> {
  // ── 静态模式 ──
  //
  // 课程列表从**静态索引**里读——构建期已经把所有课程 JSON 同步到
  // ``/data/courses/`` 了。
  if (await isStaticRuntime()) {
    const manifest = await fetchManifest();
    if (!manifest) return [];
    const entries = manifest.entries.filter((entry) =>
      entry.key.startsWith("courses/"),
    );
    const courses: Course[] = [];
    for (const entry of entries) {
      const raw = await staticFetch<any>(entry.path);
      if (!raw) continue;
      try {
        courses.push(normalizeCourse(raw));
      } catch {
        /* 单个课程解析失败不影响其它 */
      }
    }
    return courses;
  }

  const response = await apiFetch(apiUrlScoped("/api/courses/list"), {
    cache: "no-store",
  });
  const data = await asJsonOrThrow(response);
  const items = Array.isArray(data?.courses) ? data.courses : [];
  return items.map(normalizeCourse);
}

export async function getCourse(courseId: string): Promise<Course> {
  // ── 静态模式 ──
  //
  // 从 ``/data/courses/<id>.json`` 读。构建期已同步过来。
  if (await isStaticRuntime()) {
    const raw = await staticFetch<any>(
      `/data/courses/${encodeURIComponent(courseId)}.json`,
    );
    if (!raw) {
      throw new Error(`课程「${courseId}」不存在。`);
    }
    return normalizeCourse(raw);
  }

  const response = await apiFetch(
    apiUrlScoped(`/api/courses/${encodeURIComponent(courseId)}`),
    { cache: "no-store" },
  );
  const data = await asJsonOrThrow(response);
  return normalizeCourse(data);
}

export async function createCourse(payload: CoursePayload): Promise<Course> {
  // ── 静态模式 ──
  //
  // 新建课程要**写数据库**——纯静态站点做不到。
  // 明确报错，别让用户点完才看到一个莫名其妙的 404。
  if (await isStaticRuntime()) {
    throw new Error(
      "纯静态版本无法新建课程——课程库是随站点一起发布的，只读。" +
        "部署带后端的版本后即可创建。",
    );
  }
  const response = await apiFetch(apiUrlScoped("/api/courses/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await asJsonOrThrow(response);
  return normalizeCourse(data);
}

export async function updateCourse(
  courseId: string,
  payload: CoursePayload,
): Promise<Course> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    throw new Error(
      "纯静态版本无法编辑课程——课程库是随站点一起发布的，只读。" +
        "部署带后端的版本后即可修改。",
    );
  }
  const response = await apiFetch(
    apiUrlScoped(`/api/courses/${encodeURIComponent(courseId)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await asJsonOrThrow(response);
  return normalizeCourse(data);
}

/**
 * 记录一次阅读。
 *
 * 「学情中心」的阅读进度依赖它——前端每翻开一节就调一次，后端把
 * 页 id 追加进 ``progress.visited_page_ids``。
 */
export async function visitPage(
  courseId: string,
  pageId: string,
): Promise<void> {
  if (!courseId || !pageId) return;
  try {
    await apiFetch(
      apiUrlScoped(
        `/api/courses/${encodeURIComponent(courseId)}/visit`,
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId }),
      },
    );
  } catch {
    // 记录进度失败不该打断阅读——静默忽略。
  }
}

/**
 * 上报一次**真实阅读遥测**（停留时长 + 滚动覆盖率）。
 *
 * 这是「进度不造假」的关键：翻开一页不等于读过它。只有用户在这一页
 * 上**停留够久**、或者**滚动到了底**，后端才把它计入「已读」。
 *
 * 上报是**幂等增量**的：``dwell_seconds`` 累加，``coverage`` 取最大值。
 * 所以可以在切页、滚动停止、关闭页面时各报一次。
 */
export async function reportTelemetry(
  courseId: string,
  payload: {
    pageId: string;
    dwellSeconds: number;
    coverage: number;
  },
): Promise<void> {
  if (!courseId || !payload.pageId) return;
  // 停留不足 0.1 秒的「秒退」不上报——那是误触，不是阅读。
  if (payload.dwellSeconds < 0.1 && payload.coverage <= 0) return;
  try {
    await apiFetch(
      apiUrlScoped(`/api/courses/${encodeURIComponent(courseId)}/telemetry`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: payload.pageId,
          dwell_seconds: Math.max(0, payload.dwellSeconds),
          coverage: Math.min(1, Math.max(0, payload.coverage)),
        }),
        keepalive: true,
      },
    );
  } catch {
    // 遥测失败不该打断阅读——静默忽略。
  }
}

export async function deleteCourse(courseId: string): Promise<void> {
  const response = await apiFetch(
    apiUrlScoped(`/api/courses/${encodeURIComponent(courseId)}`),
    { method: "DELETE" },
  );
  await asJsonOrThrow(response);
}

// ── 资源级学习痕迹 ─────────────────────────────────────────────────────

/**
 * 上报一次**资源级**学习痕迹。
 *
 * 资源枢纽型课程里，用户看的是外部资源。进度挂在节点上会**掩盖**
 * 「这个节点下的三条资源我只看过一条」——所以每条资源单独记账。
 *
 * ``dwellSeconds`` 是**增量**（后端累加），``markedDone`` 是**单向**的
 * （用户标了「看完」就不会被改回去）。
 */
export async function reportResourceTelemetry(
  courseId: string,
  payload: {
    resourceId: string;
    dwellSeconds: number;
    markedDone?: boolean;
    pageId?: string;
  },
): Promise<void> {
  if (!courseId || !payload.resourceId) return;
  if (payload.dwellSeconds < 0.1 && !payload.markedDone) return;
  try {
    await apiFetch(
      apiUrlScoped(
        `/api/courses/${encodeURIComponent(courseId)}/resource-telemetry`,
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_id: payload.resourceId,
          dwell_seconds: Math.max(0, payload.dwellSeconds),
          marked_done: Boolean(payload.markedDone),
          page_id: payload.pageId ?? "",
        }),
        keepalive: true,
      },
    );
  } catch {
    // 资源遥测失败不该打断阅读——静默忽略。
  }
}
