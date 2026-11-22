import { apiFetch, apiUrl, asJsonOrThrow } from "@/shared/api/client";
import { isStaticRuntime, staticFetch } from "@/shared/api/client";
import type {
  Episode,
  GuidedSegment,
  InteractiveNode,
  PredictHook,
  ResourceType,
  StudyGuide,
  SuggestedQuestion,
  VideoCaption,
} from "@/lib/courses-api";

/**
 * 全网资源中台的前端数据客户端。
 *
 * 数据来自后端的 :file:`backend/data/global_resource_hub.json`，
 * 经 ``GET /api/hub/global`` 暴露。
 *
 * 它与课程资源（``courses-api.ts`` 里的 ``Resource``）是**平行**的
 * 两套类型——中台资源不在任何一门课里，它属于整个平台。
 */

/** 中台里的一条资源。 */
export interface GlobalHubResource {
  id: string;
  resource_type: ResourceType;
  title: string;
  /** 来源标注——「YouTube (Harvard Official)」这样。 */
  source: string;
  /** 来源平台——YouTube / Bilibili。 */
  provider: string;
  url: string;
  /**
   * **备用源**——主源连不上时的兜底直链。
   *
   * 通常指向云盘 / OSS / 国内对象存储上的同款 ``.mp4``。
   * YouTube 在国内经常连不上，播放器会自动切到这里。
   */
  fallback_url?: string;
  /** 预置的 AI 上下文（陪读时喂给模型）。 */
  ai_context: string;
  /** 资源自己的标签——「计算机」「硬核」。 */
  tags: string[];
  meta: Record<string, unknown>;
  /** 字幕轨。 */
  captions: VideoCaption[];
  /** 时间戳交互节点——播到某个时刻弹知识气泡。 */
  interactive_nodes: InteractiveNode[];
  /**
   * **知识向导**——右侧顶部折叠便签的数据。
   *
   * 预装好的：装配器一次性生成，用户点开就有，不用等模型现场回答。
   */
  study_guide?: StudyGuide;
  /**
   * **段落导读**——视频下方的结构化导读轨。
   *
   * 保证「采集视频下方一片空白」这种事不再发生。
   */
  guided_segments?: GuidedSegment[];
  /** 纯正中文学术导读——简介是乱码 / 广告 / 纯英文时的兜底。 */
  academic_intro?: string;
  /** 分集列表——这条资源被拆成了几集。 */
  episodes?: Episode[];
  /** 这条资源是否已被 AI 装配过自学框架。 */
  is_structured?: boolean;
  is_default: boolean;
}

/** 中台里的一个分类。 */
export interface GlobalHubCategory {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  /** 图标键——前端据此挑图标。 */
  icon: string;
  order: number;
  resources: GlobalHubResource[];
}

/** 中台的顶层结构。 */
export interface GlobalHub {
  id: string;
  title: string;
  description: string;
  exploration_summary: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  categories: GlobalHubCategory[];
}

/** 中台的统计摘要。 */
export interface GlobalHubSummary {
  category_count: number;
  resource_count: number;
  providers: Array<{ id: string; label: string; count: number }>;
}

function normalizeNode(raw: any): InteractiveNode {
  return {
    timestamp: Number(raw?.timestamp ?? 0) || 0,
    keyword: String(raw?.keyword ?? ""),
    type: String(raw?.type ?? "concept") as InteractiveNode["type"],
    context: raw?.context ? String(raw.context) : undefined,
    hint: raw?.hint ? String(raw.hint) : undefined,
    prompt: raw?.prompt ? String(raw.prompt) : undefined,
    anchor_title: raw?.anchor_title ? String(raw.anchor_title) : undefined,
    anchor_origin: raw?.anchor_origin ? String(raw.anchor_origin) : undefined,
    predict_hook: normalizePredictHook(raw?.predict_hook),
  };
}

/**
 * 归一化「先猜后看」钩子。
 *
 * 手写的钩子优先——但**必须校验**：数据里写坏了（选项少于两个、
 * 答案下标越界）会让卡片空白。所以这里做一遍完整检查，坏的直接
 * 丢成 ``undefined``，运行时由 :func:`lib/predict-hook` 生成兜底题。
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

/**
 * 归一化**分集**。
 *
 * 数据里的分集可能来自三个来源（B 站分 P / YouTube 播放列表 /
 * 时间轴切片），字段不完全一致。归一化之后前端只面对一种形状。
 */
function normalizeEpisode(raw: any): Episode | null {
  if (!raw || typeof raw !== "object") return null;

  const epId = String(raw?.ep_id ?? "").trim();
  const title = String(raw?.title ?? "").trim();
  if (!epId || !title) return null;

  const index = Number(raw?.index ?? 0) || 0;
  const total = Number(raw?.total ?? 0) || 0;

  return {
    ep_id: epId,
    title,
    index: index > 0 ? index : 1,
    total: total > 0 ? total : 1,
    video_url: raw?.video_url ? String(raw.video_url) : undefined,
    bvid: raw?.bvid ? String(raw.bvid) : undefined,
    page:
      typeof raw?.page === "number" && raw.page > 0 ? raw.page : null,
    youtube_id: raw?.youtube_id ? String(raw.youtube_id) : undefined,
    duration: Number(raw?.duration ?? 0) || 0,
    start_time: Number(raw?.start_time ?? 0) || 0,
    end_time:
      typeof raw?.end_time === "number" && raw.end_time > 0
        ? raw.end_time
        : null,
    key_concepts: Array.isArray(raw?.key_concepts)
      ? raw.key_concepts.map((item: any) => String(item ?? "").trim()).filter(Boolean)
      : [],
    origin: raw?.origin ? String(raw.origin) : "single",
  };
}

/** 归一化一个「提问灵感」胶囊。 */
function normalizeQuestion(raw: any): SuggestedQuestion {
  if (typeof raw === "string") {
    return { title: raw.slice(0, 20), prompt: raw, angle: "" };
  }
  return {
    title: String(raw?.title ?? ""),
    prompt: String(raw?.prompt ?? ""),
    angle: String(raw?.angle ?? ""),
  };
}

/**
 * 归一化「知识向导」。
 *
 * 三件套缺一不可——只有 ``strategy`` 的向导没有价值：用户要的是
 * 「带着哪几个问题看」，不是一句空泛的方法论。
 */
function normalizeStudyGuide(raw: any): StudyGuide | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const strategy = String(raw.strategy ?? "").trim();
  const checkpoints = Array.isArray(raw.checkpoints)
    ? raw.checkpoints.map((item: any) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const suggestedQuestions = Array.isArray(raw.suggested_questions)
    ? raw.suggested_questions.map(normalizeQuestion).filter((item: SuggestedQuestion) => item.prompt)
    : [];

  if (!strategy && checkpoints.length === 0 && suggestedQuestions.length === 0) {
    return undefined;
  }
  return { strategy, checkpoints, suggested_questions: suggestedQuestions };
}

/** 归一化「段落导读」。 */
function normalizeGuidedSegments(raw: any): GuidedSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => ({
      timestamp: Number(item?.timestamp ?? 0) || 0,
      title: String(item?.title ?? ""),
      content: String(item?.content ?? ""),
      anchor_title: item?.anchor_title ? String(item.anchor_title) : undefined,
      anchor_origin: item?.anchor_origin ? String(item.anchor_origin) : undefined,
    }))
    .filter((item: GuidedSegment) => item.content.trim().length > 0)
    .sort((a: GuidedSegment, b: GuidedSegment) => a.timestamp - b.timestamp);
}

function normalizeResource(raw: any): GlobalHubResource {
  return {
    id: String(raw?.id ?? ""),
    resource_type: String(raw?.resource_type ?? "video") as ResourceType,
    title: String(raw?.title ?? ""),
    source: String(raw?.source ?? ""),
    provider: String(raw?.provider ?? ""),
    url: String(raw?.url ?? ""),
    fallback_url: raw?.fallback_url ? String(raw.fallback_url) : undefined,
    ai_context: String(raw?.ai_context ?? ""),
    tags: Array.isArray(raw?.tags) ? raw.tags.map((t: any) => String(t)) : [],
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
      ? raw.interactive_nodes.map(normalizeNode)
      : [],
    study_guide: normalizeStudyGuide(raw?.study_guide),
    guided_segments: normalizeGuidedSegments(raw?.guided_segments),
    academic_intro: raw?.academic_intro ? String(raw.academic_intro) : undefined,
    episodes: Array.isArray(raw?.episodes)
      ? raw.episodes
          .map(normalizeEpisode)
          .filter((item: Episode | null): item is Episode => Boolean(item))
      : [],
    is_structured: Boolean(raw?.is_structured),
    is_default: Boolean(raw?.is_default),
  };
}

function normalizeCategory(raw: any): GlobalHubCategory {
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? ""),
    subtitle: String(raw?.subtitle ?? ""),
    description: String(raw?.description ?? ""),
    icon: String(raw?.icon ?? "globe"),
    order: Number(raw?.order ?? 0) || 0,
    resources: Array.isArray(raw?.resources)
      ? raw.resources.map(normalizeResource)
      : [],
  };
}

/**
 * 拉取全网资源中台。
 *
 * 拉不到时返回 ``null`` 而不是抛错——中台是一个**入口**，不是课程
 * 学习的必需条件。挂掉不该让整个阅读页白屏。
 */
export async function fetchGlobalHub(): Promise<{
  hub: GlobalHub | null;
  summary: GlobalHubSummary | null;
}> {
  // ── 静态模式 ──
  //
  // 从 ``/data/global_resource_hub.json`` 读。那份文件是**构建期**
  // 从后端同步过来的（``scripts/sync-static-data.mjs``），内容完全一致。
  //
  // ⚠️ 这一段**必须**自己包 try/catch——它在整个函数的 try 之外。
  //    一旦抛错，调用方的 ``loading`` 状态永远不会落下来，
  //    页面会永远停在「正在载入…」。这种卡死比报错更难排查。
  if (await isStaticRuntime()) {
    try {
      return await fetchGlobalHubStatic();
    } catch (error) {
      console.error("[global-hub] 静态数据读取失败", error);
      return { hub: null, summary: null };
    }
  }

  try {
    const response = await apiFetch(apiUrl("/api/hub/global"), {
      cache: "no-store",
    });
    const data = await asJsonOrThrow(response);
    const hubRaw = data?.hub;
    if (!hubRaw) return { hub: null, summary: null };

    return {
      hub: {
        id: String(hubRaw.id ?? ""),
        title: String(hubRaw.title ?? ""),
        description: String(hubRaw.description ?? ""),
        exploration_summary: String(hubRaw.exploration_summary ?? ""),
        updated_at: String(hubRaw.updated_at ?? ""),
        metadata: (hubRaw.metadata ?? {}) as Record<string, unknown>,
        categories: Array.isArray(hubRaw.categories)
          ? hubRaw.categories.map(normalizeCategory)
          : [],
      },
      summary: {
        category_count: Number(data?.summary?.category_count ?? 0) || 0,
        resource_count: Number(data?.summary?.resource_count ?? 0) || 0,
        providers: Array.isArray(data?.summary?.providers)
          ? data.summary.providers.map((p: any) => ({
              id: String(p?.id ?? ""),
              label: String(p?.label ?? ""),
              count: Number(p?.count ?? 0) || 0,
            }))
          : [],
      },
    };
  } catch {
    return { hub: null, summary: null };
  }
}

/**
 * 从静态 JSON 读中台。
 *
 * 静态文件里 ``categories`` 在 ``hub`` 段里，且**没有** ``summary`` 段——
 * 摘要得自己算。归一化逻辑与联调模式**完全共用**，所以两边的数据
 * 形状一模一样，上层代码不需要分支。
 */
async function fetchGlobalHubStatic(): Promise<{
  hub: GlobalHub | null;
  summary: GlobalHubSummary | null;
}> {
  const data = await staticFetch<any>("/data/global_resource_hub.json");
  const hubRaw = data?.hub ?? data;
  if (!hubRaw) return { hub: null, summary: null };

  const categories = Array.isArray(hubRaw.categories)
    ? hubRaw.categories.map(normalizeCategory)
    : [];

  // 摘要自己算——静态文件里没有这一段。
  const providerCounts = new Map<string, number>();
  let resourceTotal = 0;
  for (const category of categories) {
    for (const resource of category.resources) {
      resourceTotal += 1;
      const provider = resource.provider || "其他";
      providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
    }
  }

  return {
    hub: {
      id: String(hubRaw.id ?? ""),
      title: String(hubRaw.title ?? ""),
      description: String(hubRaw.description ?? ""),
      exploration_summary: String(hubRaw.exploration_summary ?? ""),
      updated_at: String(hubRaw.updated_at ?? ""),
      metadata: (hubRaw.metadata ?? {}) as Record<string, unknown>,
      categories,
    },
    summary: {
      category_count: categories.length,
      resource_count: resourceTotal,
      providers: Array.from(providerCounts.entries())
        .map(([id, count]) => ({ id, label: id, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}
