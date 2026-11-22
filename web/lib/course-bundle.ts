/**
 * 两级课程结构的数据入口
 * =========================
 *
 * .. code-block:: text
 *
 *     /courses/[courseId]           第一层 · 课程目录页
 *     /courses/[courseId]/[epId]    第二层 · 单集沉浸学习页
 *
 * 统一的数据加载
 * --------------
 *
 * 两个页面都需要「一门课 + 它的分集」。这份数据有两个来源：
 *
 * 1. **K12 系列**（``/data/courses/k12_*.json``）——国内 K12 语文 /
 *    数学年级同步课，**按需拉取**（点进哪套才拉哪套）；
 * 2. **中台**（``global_resource_hub.json``）——中台大盘里的资源。
 *
 * 两边的形状不同，但对外暴露的是**同一套** ``CourseBundle``——
 * 上层组件因此不需要知道这门课是从哪儿来的。
 */

import type {
  Episode,
  GuidedSegment,
  InteractiveNode,
} from "@/lib/courses-api";
import {
  fetchGlobalHub,
  type GlobalHubResource,
} from "@/lib/global-hub-api";
import { resolveEpisodes } from "@/lib/episodes";
import { fetchK12Series } from "@/lib/k12-client";
import type { K12SeriesDetail } from "@/lib/k12-api";

/** 一门课（一个系列）的完整数据包。 */
export interface CourseBundle {
  /** 课程 id。 */
  id: string;
  /** 标题。 */
  title: string;
  /** 来源标注。 */
  source: string;
  /** 来源平台。 */
  provider: string;
  /** 所属分类标题。 */
  categoryTitle: string;
  /** 一句话简介——**不是**宣传长文。 */
  intro: string;
  /** 原始资源（给播放器用）。 */
  resource: GlobalHubResource;
  /** 分集列表。 */
  episodes: Episode[];
  /** 本集的知识节点（来自资源）。 */
  interactiveNodes: InteractiveNode[];
  /** 本集的段落导读（来自资源）。 */
  guidedSegments: GuidedSegment[];
  /** 备用源地址。 */
  fallbackUrl?: string;
  /** ── K12 专属 ── */
  /** 学段。 */
  stage?: "primary" | "junior" | "senior";
  /** 年级。 */
  grade?: number;
  /** 学科。 */
  subject?: "chinese" | "math";
  /** 适用年龄。 */
  ageRange?: [number, number];
  /** 教材版本。 */
  edition?: string;
  /** 册次。 */
  volumes?: string[];
}

/**
 * 中台缓存。
 *
 * 中台的 JSON 有几百 KB——每次进页面都拉一遍太浪费。
 * 所以这里用**模块级缓存**：一次会话只拉一次。
 */
let hubCache: Awaited<ReturnType<typeof fetchGlobalHub>>["hub"] = null;
let hubLoaded = false;

async function loadHub() {
  if (hubLoaded) return hubCache;
  hubLoaded = true;
  const result = await fetchGlobalHub();
  hubCache = result.hub;
  return hubCache;
}

/**
 * 加载一门课。
 *
 * @param courseId 课程 id
 * @returns 找不到时返回 ``null``
 */
export async function loadCourseBundle(
  courseId: string,
): Promise<CourseBundle | null> {
  // ── ① K12 系列优先 ──
  //
  // K12 是平台的**主体**——先查它。查不到再回落到中台。
  if (courseId.startsWith("k12_")) {
    const detail = await fetchK12Series(courseId);
    if (detail) return k12ToBundle(detail);
  }

  // ── ② 中台回落 ──
  const hub = await loadHub();
  if (!hub) return null;

  for (const category of hub.categories) {
    const resource = category.resources.find((item) => item.id === courseId);
    if (!resource) continue;

    return {
      id: resource.id,
      title: resource.title,
      source: resource.source,
      provider: resource.provider,
      categoryTitle: category.title,
      // 简介刻意用**学术导读**的第一句，而不是 `exploration_summary`
      // 那类营销文案——目录页只需要「这门课讲什么」这一句。
      intro: (resource.academic_intro || "").split("\n")[0].trim(),
      resource,
      episodes: resolveEpisodes(resource),
      interactiveNodes: resource.interactive_nodes ?? [],
      guidedSegments: resource.guided_segments ?? [],
      fallbackUrl: resource.fallback_url,
    };
  }

  return null;
}

/**
 * 把一套 K12 系列转成 ``CourseBundle``。
 *
 * K12 的分集**自带**播放地址（B 站 ``?p=N``），所以这里不需要
 * ``resolveEpisodes`` 的合成逻辑——直接映射即可。
 */
function k12ToBundle(detail: K12SeriesDetail): CourseBundle {
  const episodes: Episode[] = detail.episodes.map((episode) => ({
    ep_id: episode.ep_id,
    title: episode.title,
    index: episode.index,
    total: episode.total,
    video_url: episode.video_url,
    bvid: episode.bvid,
    page: episode.page,
    youtube_id: episode.youtube_id,
    duration: episode.duration,
    start_time: episode.start_time,
    end_time: episode.end_time,
    key_concepts: episode.key_concepts,
    origin: episode.origin,
  }));

  const subjectName = detail.subject === "chinese" ? "语文" : "数学";

  /** 本套系列的知识节点 / 段落导读——详情文件里带的全量版本。 */
  const interactiveNodes: InteractiveNode[] = (
    detail.interactiveNodes ?? []
  ).map((node) => ({
    timestamp: node.timestamp,
    keyword: node.keyword,
    type: node.type,
    context: node.context,
    hint: node.hint,
    context_label: node.context_label,
    origin: node.origin,
  }));

  const guidedSegments: GuidedSegment[] = (detail.guidedSegments ?? []).map(
    (segment) => ({
      timestamp: segment.timestamp,
      title: segment.title,
      content: segment.content,
    }),
  );

  return {
    id: detail.id,
    title: detail.title,
    source: `${detail.source?.provider ?? ""} · ${detail.source?.author ?? ""}`.trim(),
    provider: detail.source?.provider ?? "",
    categoryTitle: detail.stage === "primary" ? "小学部" : detail.stage === "junior" ? "初中部" : "高中部",
    intro: `本册${subjectName}同步课覆盖${detail.volumes.join("、")}全部教材单元，共 ${episodes.length} 课时，按课时逐节精讲。`,
    resource: {
      id: detail.id,
      resource_type: "video",
      title: detail.title,
      source: detail.source?.provider ?? "",
      provider: detail.source?.provider ?? "",
      url: detail.source?.url ?? "",
      ai_context: "",
      tags: [subjectName, detail.edition],
      meta: {
        grade: detail.grade,
        age_range: detail.ageRange,
        edition: detail.edition,
        volumes: detail.volumes,
        author: detail.source?.author ?? "",
        cover: detail.source?.pic ?? "",
        episode_count: episodes.length,
      },
      captions: [],
      interactive_nodes: interactiveNodes,
      guided_segments: guidedSegments,
      academic_intro: "",
      is_default: false,
    },
    episodes,
    interactiveNodes,
    guidedSegments,
    fallbackUrl: undefined,
    stage: detail.stage,
    grade: detail.grade,
    subject: detail.subject,
    ageRange: detail.ageRange,
    edition: detail.edition,
    volumes: detail.volumes,
  };
}

/**
 * 列出中台里**有分集**的课——给「课程」入口用。
 */
export async function listMultiEpisodeCourses(): Promise<
  Array<{
    id: string;
    title: string;
    source: string;
    provider: string;
    categoryTitle: string;
    episodeCount: number;
  }>
> {
  const hub = await loadHub();
  if (!hub) return [];

  const result: Array<{
    id: string;
    title: string;
    source: string;
    provider: string;
    categoryTitle: string;
    episodeCount: number;
  }> = [];

  for (const category of hub.categories) {
    for (const resource of category.resources) {
      const episodes = resolveEpisodes(resource);
      // 只有一集的课没有「目录页」——它直接就是单集页。
      if (episodes.length <= 1) continue;
      result.push({
        id: resource.id,
        title: resource.title,
        source: resource.source,
        provider: resource.provider,
        categoryTitle: category.title,
        episodeCount: episodes.length,
      });
    }
  }

  return result;
}
