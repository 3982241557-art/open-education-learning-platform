/**
 * 分集观看记录
 * ============
 *
 * 记录用户「每一集看到哪了」。
 *
 * 存哪
 * ----
 *
 * 沿用中台已有的观看记录键（``dreamclass.progress.global``），
 * 但**按集**记账而不是按资源记账——
 *
 * .. code-block:: text
 *
 *     dreamclass.progress.global
 *     {
 *       "res_cs50": {
 *         "resource_id": "res_cs50",
 *         "title": "哈佛大学 CS50",
 *         "position": 0,          ← 整条资源的播放位置
 *         "duration": 89497,
 *         "delta": 1234,
 *         "updated_at": 1730000000000,
 *         "episodes": {          ← 按集记账
 *           "ch01": { "position": 6308, "duration": 6308, "completed": true },
 *           "ch02": { "position": 1200, "duration": 8895 }
 *         }
 *       }
 *     }
 *
 * 为什么按集记
 * ------------
 *
 * 一门 24 小时的课被切成 12 讲之后，「我看到第几讲了」和「这条视频
 * 我播到第几分钟」是**两个完全不同的问题**。前者才是用户真正
 * 关心���——「我 CS50 学到哪一讲了」。
 *
 * 兼容性
 * --------
 *
 * 老记录没有 ``episodes`` 字段——读的时候按「空集」处理，不报错。
 */

/** 一集的观看记录。 */
export interface EpisodeRecord {
  /** 播放位置（秒）。 */
  position: number;
  /** 本集时长（秒）。 */
  duration: number;
  /** 最近一次观看时间（Unix 毫秒）。 */
  updated_at?: number;
  /** 用户明确点了「学完本集」。 */
  completed?: boolean;
}

/** 一条资源的观看记录（顶层 + 按集）。 */
export interface ResourceWatchRecord {
  resource_id: string;
  title: string;
  /** 整条资源的播放位置（秒）。 */
  position: number;
  /** 整条资源的时长（秒）。 */
  duration: number;
  /** 累计观看时长（秒）。 */
  delta: number;
  updated_at: number;
  /** 按集记账。 */
  episodes?: Record<string, EpisodeRecord>;
}

/** localStorage 的键。 */
const STORAGE_KEY = "dreamclass.progress.global";

/** 安全地拿到 localStorage。 */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__seek_ep_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读出全部观看记录。 */
export function readWatchRecords(): Record<string, ResourceWatchRecord> {
  const s = store();
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 写回全部观看记录。 */
function writeWatchRecords(records: Record<string, ResourceWatchRecord>): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* 配额满或隐私模式——忽略 */
  }
}

/**
 * 读出某一集的观看记录。
 */
export function readEpisodeRecord(
  resourceId: string,
  epId: string,
): EpisodeRecord | undefined {
  const records = readWatchRecords();
  return records[resourceId]?.episodes?.[epId];
}

/**
 * 读出某门课（资源）的**全部**分集记录。
 */
export function readEpisodeRecords(
  resourceId: string,
): Record<string, EpisodeRecord> {
  const records = readWatchRecords();
  return records[resourceId]?.episodes ?? {};
}

/**
 * 更新一集的观看进度。
 *
 * @param position 播放位置（秒）
 * @param duration 本集时长（秒）
 */
export function saveEpisodeProgress(
  resourceId: string,
  epId: string,
  position: number,
  duration: number,
): void {
  const records = readWatchRecords();
  const current = records[resourceId] ?? {
    resource_id: resourceId,
    title: "",
    position: 0,
    duration: 0,
    delta: 0,
    updated_at: 0,
    episodes: {},
  };

  current.episodes = current.episodes ?? {};
  current.episodes[epId] = {
    position: Math.max(0, Number(position) || 0),
    duration: Math.max(0, Number(duration) || 0),
    updated_at: Date.now(),
    // 已有 ``completed`` 标记就**不覆盖**——完成是单向的。
    completed: current.episodes[epId]?.completed,
  };

  current.updated_at = Date.now();
  records[resourceId] = current;
  writeWatchRecords(records);
}

/**
 * 标记一集**已完成**。
 *
 * 用户点了「学完本集 · 进入检测」，或者走完了完整闭环。
 * 这个标记是**单向的**——看过就永远算完成，不因为回看而取消。
 */
export function markEpisodeCompleted(
  resourceId: string,
  epId: string,
  duration = 0,
): void {
  const records = readWatchRecords();
  const current = records[resourceId] ?? {
    resource_id: resourceId,
    title: "",
    position: 0,
    duration: 0,
    delta: 0,
    updated_at: 0,
    episodes: {},
  };

  current.episodes = current.episodes ?? {};
  const existing = current.episodes[epId];
  current.episodes[epId] = {
    position: Math.max(
      existing?.position ?? 0,
      Number(duration) || existing?.duration || 0,
    ),
    duration: Number(duration) || existing?.duration || 0,
    updated_at: Date.now(),
    completed: true,
  };

  current.updated_at = Date.now();
  records[resourceId] = current;
  writeWatchRecords(records);
}

/**
 * 某一集是否已完成。
 */
export function isEpisodeCompleted(
  resourceId: string,
  epId: string,
): boolean {
  return Boolean(readEpisodeRecord(resourceId, epId)?.completed);
}
