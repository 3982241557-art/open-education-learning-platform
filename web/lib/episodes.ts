/**
 * 分集目录
 * ========
 *
 * 两级课程结构的数据层：
 *
 * .. code-block:: text
 *
 *     /courses/[courseId]           第一层 · 课程目录页
 *     /courses/[courseId]/[epId]    第二层 · 单集沉浸学习页
 *
 * 「课程」在这里 = 中台里的一条资源（一条视频 / 一门系列课）。
 *
 * 三种分集形态
 * ------------
 *
 * ==============  ==========================================================
 * 形态            播放方式
 * ==============  ==========================================================
 * ``pages``       B 站原生分 P —— 播放地址带 ``?p=N``
 * ``playlist``    YouTube 官方播放列表 —— 每集是独立视频
 * ``chapters``    时间轴切片 —— 同一条视频，定位到 ``[start, end]``
 * ==============  ==========================================================
 *
 * 三种形态在播放器上的差别只有两个：
 *
 * 1. **播什么 URL**；
 * 2. **播到哪里停**（时间轴切片需要）。
 *
 * 其余（时间轴、字幕、节点、诊断）完全一致——所以统一在这里收口。
 */

import type { Episode } from "@/lib/courses-api";
import type { GlobalHubResource } from "@/lib/global-hub-api";

/** 一集在播放器里的**播放参数**。 */
export interface EpisodePlayback {
  /** 播放地址。 */
  url: string;
  /** 起播位置（秒）——时间轴切片时 > 0。 */
  startAt: number;
  /** 停播位置（秒）——时间轴切片时有值，其余为 ``null``。 */
  endAt: number | null;
  /** 本集时长（秒）。 */
  duration: number;
  /** 是不是「在一条长视频里的一段」。 */
  isSlice: boolean;
}

/**
 * 把一集翻译成播放参数。
 *
 * 三种形态在这里合流——播放器只需要知道「播什么、从哪开始、到哪停」。
 */
export function resolveEpisodePlayback(
  episode: Episode,
  resource: Pick<GlobalHubResource, "url">,
): EpisodePlayback {
  const url = episode.video_url || resource.url || "";
  const startAt = Number(episode.start_time ?? 0) || 0;
  const endAt =
    typeof episode.end_time === "number" && episode.end_time > startAt
      ? episode.end_time
      : null;

  // 时长：优先用本集标注的；切片模式下由 ``end - start`` 推。
  let duration = Number(episode.duration ?? 0) || 0;
  if (endAt !== null && endAt > startAt) {
    duration = endAt - startAt;
  }

  return {
    url,
    startAt,
    endAt,
    duration,
    // 「切片」= 同一条视频里的一个区间（而不是独立视频）。
    isSlice: endAt !== null && episode.origin === "chapters",
  };
}

/**
 * 一门课（一条资源）的**分集列表**。
 *
 * 没有分集数据时，返回**一个合成集**——这样上层代码不用分支：
 * 「这门课只有一讲」和「这门课有 12 讲」走的是同一条渲染路径。
 */
export function resolveEpisodes(
  resource: Pick<GlobalHubResource, "id" | "title" | "url" | "episodes">,
): Episode[] {
  const episodes = (resource.episodes ?? []).filter(
    (item) => item.ep_id && item.title,
  );
  if (episodes.length > 0) return episodes;

  return [
    {
      ep_id: "ep1",
      title: resource.title,
      index: 1,
      total: 1,
      video_url: resource.url,
      duration: 0,
      start_time: 0,
      end_time: null,
      key_concepts: [],
      origin: "single",
    },
  ];
}

/**
 * 一集在系列里的**状态**。
 *
 * 三态：``未开始`` / ``学习中`` / ``已完成``。
 *
 * 判定完全依据**真实观看记录**（localStorage）——不预设任何假数据。
 */
export type EpisodeStatus = "未开始" | "学习中" | "已完成";

/** 一条观看记录。 */
export interface EpisodeWatchRecord {
  position: number;
  duration: number;
  updated_at?: number;
  /** 用户明确点了「学完本集」——这时直接算已完成。 */
  completed?: boolean;
}

/**
 * 判断一集的状态。
 *
 * 规则：
 *
 * - 播到 **90%** 或以上 → ``已完成``；
 * - 播放位置 > 30 秒 → ``学习中``；
 * - 其余 → ``未开始``。
 *
 * 90% 这个阈值不是随便定的：片尾通常有 5%~10% 是致谢与广告，
 * 卡在 90% 意味着「实质内容看完了」。
 */
export function deriveEpisodeStatus(
  record: EpisodeWatchRecord | undefined,
): EpisodeStatus {
  if (!record) return "未开始";
  if (record.completed) return "已完成";

  const duration = Number(record.duration ?? 0) || 0;
  const position = Number(record.position ?? 0) || 0;

  if (duration > 0 && position / duration >= 0.9) return "已完成";
  if (position > 30) return "学习中";
  return "未开始";
}

/**
 * 一门课的整体进度。
 *
 * @returns 已完成集数、总集数、覆盖率（0–1）
 */
export function deriveCourseProgress(
  episodes: Episode[],
  records: Record<string, EpisodeWatchRecord>,
): { done: number; total: number; coverage: number } {
  const total = episodes.length;
  if (total === 0) return { done: 0, total: 0, coverage: 0 };

  const done = episodes.filter(
    (episode) =>
      deriveEpisodeStatus(records[episode.ep_id]) === "已完成",
  ).length;

  return { done, total, coverage: done / total };
}

/**
 * 一集的**人类可读时长**。
 *
 * 「45 分钟」比 ``2700`` 好读；超过一小时用「1 小时 12 分」。
 */
export function formatEpisodeDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total === 0) return "";
  if (total < 60) return `${total} 秒`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} 分钟`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0
    ? `${hours} 小时 ${restMinutes} 分`
    : `${hours} 小时`;
}

/**
 * 一集在原视频里的**时间区间标签**。
 *
 * 只对时间轴切片有意义——「原视频 01:45:08 起」。
 */
export function formatEpisodeSlice(
  episode: Episode,
): string | null {
  if (episode.origin !== "chapters") return null;
  const start = Number(episode.start_time ?? 0) || 0;
  if (start <= 0) return null;
  return `原视频 ${formatClock(start)} 起`;
}

/**
 * 挑出**属于本集**的知识节点。
 *
 * 一条长视频被切成多集之后，资源上的节点是**整条视频**的——
 * 直接全量渲染会让用户在第 3 讲看到第 11 讲的知识点。
 *
 * 规则：
 *
 * - 时间轴切片（``chapters``）→ 只取落在 ``[start, end]`` 区间内的；
 * - 独立分集（``playlist`` / ``pages``）→ 全部节点都算这一集的；
 * - 拿不到区间时 → 全量（宁可多给，不要给空）。
 */
export function filterNodesForEpisode<T extends { timestamp: number }>(
  nodes: T[],
  episode: Episode,
): T[] {
  const start = Number(episode.start_time ?? 0) || 0;
  const end = Number(episode.end_time ?? 0) || 0;

  // 独立分集——每集有自己的内容，节点全给。
  if (episode.origin !== "chapters") return nodes;
  if (end <= start) return nodes;

  return nodes.filter(
    (node) => node.timestamp >= start && node.timestamp < end,
  );
}

/**
 * 挑出**属于本集**的段落导读。
 *
 * 规则与 :func:`filterNodesForEpisode` 相同。
 */
export function filterSegmentsForEpisode<
  T extends { timestamp: number },
>(segments: T[], episode: Episode): T[] {
  return filterNodesForEpisode(segments, episode);
}

/** 秒 → ``HH:MM:SS``。 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
