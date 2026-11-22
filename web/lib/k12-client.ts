/**
 * K12 数据客户端
 * ==============
 *
 * 从静态分片里读 K12 课程数据。
 *
 * 两个文件
 * --------
 *
 * ==============================  ==========================================
 * ``/data/k12-index.json``      目录索引——**首屏只拉这个**（~18 KB）
 * ``/data/courses/k12_<id>.json`` 单套系列详情——**点进去才拉**
 * ==============================  ==========================================
 *
 * 为什么详情要单独拉
 * ------------------
 *
 * 1.5 千集的完整数据在一个文件里是**好几 MB**。在弱网下首屏要等
 * 十几秒——这就是用户说的「反应慢」。
 *
 * 分片之后首屏只有几十 KB，而每套课的点开成本也被限制住了。
 */

import { staticFetch } from "@/shared/api/client";
import { editionOf } from "@/lib/k12-api";
import type {
  K12Index,
  K12IndexEntry,
  K12SeriesDetail,
} from "@/lib/k12-api";

/** 索引缓存——一次会话只拉一次。 */
let indexCache: K12Index | null = null;
let indexPromise: Promise<K12Index | null> | null = null;

/** 拉 K12 索引。 */
export async function fetchK12Index(): Promise<K12Index | null> {
  if (indexCache) return indexCache;
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    try {
      const data = await staticFetch<any>("/data/k12-index.json");
      const raw = data?.index ?? data;
      if (!raw || !Array.isArray(raw.series)) return null;

      const index: K12Index = {
        id: String(raw.id ?? "k12_index"),
        title: String(raw.title ?? "K12 课程"),
        updated_at: String(raw.updated_at ?? ""),
        grades: Array.isArray(raw.grades) ? raw.grades : [],
        subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
        series: raw.series.map(normalizeEntry),
        summary: {
          seriesCount: Number(raw.summary?.seriesCount ?? 0) || 0,
          episodeCount: Number(raw.summary?.episodeCount ?? 0) || 0,
          gradeCount: Number(raw.summary?.gradeCount ?? 0) || 0,
        },
      };
      indexCache = index;
      return index;
    } catch {
      return null;
    }
  })();

  return indexPromise;
}

/** 归一化一条索引条目。 */
function normalizeEntry(raw: any): K12IndexEntry {
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? ""),
    shortTitle: String(raw?.shortTitle ?? raw?.title ?? ""),
    grade: Number(raw?.grade ?? 0) || 0,
    subject: (String(raw?.subject ?? "math") === "chinese"
      ? "chinese"
      : "math"),
    stage: (String(raw?.stage ?? "primary") as K12IndexEntry["stage"]),
    ageRange: Array.isArray(raw?.ageRange)
      ? [Number(raw.ageRange[0]) || 0, Number(raw.ageRange[1]) || 0]
      : [0, 0],
    edition: editionOf({
      subject: (String(raw?.subject ?? "math") === "chinese"
        ? "chinese"
        : "math"),
      stage: String(raw?.stage ?? "primary") as K12IndexEntry["stage"],
    }),
    volumes: Array.isArray(raw?.volumes)
      ? raw.volumes.map((item: unknown) => String(item))
      : [],
    episodeCount: Number(raw?.episodeCount ?? 0) || 0,
    provider: String(raw?.provider ?? ""),
    author: String(raw?.author ?? ""),
    pic: String(raw?.pic ?? ""),
    sourceUrl: String(raw?.sourceUrl ?? ""),
    detailPath: String(raw?.detailPath ?? `/data/courses/${raw?.id}.json`),
  };
}

/**
 * 拉一套系列的详情。
 *
 * @param seriesId 系列 id
 */
export async function fetchK12Series(
  seriesId: string,
): Promise<K12SeriesDetail | null> {
  try {
    const data = await staticFetch<any>(
      `/data/courses/${encodeURIComponent(seriesId)}.json`,
    );
    if (!data || !Array.isArray(data.episodes)) return null;

    return {
      id: String(data.id ?? seriesId),
      title: String(data.title ?? ""),
      shortTitle: String(data.shortTitle ?? data.title ?? ""),
      grade: Number(data.grade ?? 0) || 0,
      subject: (String(data.subject ?? "math") === "chinese"
        ? "chinese"
        : "math"),
      stage: String(data.stage ?? "primary") as K12SeriesDetail["stage"],
      ageRange: Array.isArray(data.ageRange)
        ? [Number(data.ageRange[0]) || 0, Number(data.ageRange[1]) || 0]
        : [0, 0],
      edition: editionOf({
        subject: (String(data.subject ?? "math") === "chinese"
          ? "chinese"
          : "math"),
        stage: String(data.stage ?? "primary") as K12SeriesDetail["stage"],
      }),
      volumes: Array.isArray(data.volumes)
        ? data.volumes.map((item: unknown) => String(item))
        : [],
      source: data.source ?? null,
      episodes: data.episodes.map((raw: any) => ({
        ep_id: String(raw?.ep_id ?? ""),
        title: String(raw?.title ?? ""),
        index: Number(raw?.index ?? 0) || 0,
        total: Number(raw?.total ?? 0) || 0,
        video_url: String(raw?.video_url ?? ""),
        bvid: String(raw?.bvid ?? ""),
        page: typeof raw?.page === "number" ? raw.page : null,
        youtube_id: String(raw?.youtube_id ?? ""),
        duration: Number(raw?.duration ?? 0) || 0,
        start_time: Number(raw?.start_time ?? 0) || 0,
        end_time:
          typeof raw?.end_time === "number" && raw.end_time > 0
            ? raw.end_time
            : null,
        key_concepts: Array.isArray(raw?.key_concepts)
          ? raw.key_concepts.map((item: unknown) => String(item))
          : [],
        origin: String(raw?.origin ?? "single"),
      })),
    };
  } catch {
    return null;
  }
}
