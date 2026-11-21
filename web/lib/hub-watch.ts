import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
} from "@/shared/api/client";
import { readLocal, writeLocal, StorageKeys } from "@/lib/local-store";

/**
 * 中台观看进度的上报客户端。
 *
 * 对应后端的 ``POST /api/resources/watch``。
 *
 * 上报的是**增量**（``delta``），不是累计值——累加由后端做。
 *
 * 为什么用增量而不是累计
 * ----------------------
 * 累计值（"我已经看了 300 秒"）有两个问题：
 *
 * 1. 上报请求一旦丢一条，账目就永久少一截；
 * 2. 用户切走再切回时，前端要判断「我这次又看了多久」——
 *    增量天然处理这件事（两个时间戳一减）。
 *
 * 增量是「我这一段又看了 N 秒」，丢一条只少 N 秒，不会累积偏差。
 */

/** 上报的间隔（毫秒）。 */
export const WATCH_REPORT_INTERVAL = 15_000;

/**
 * 上报一次观看进度。
 *
 * 失败时静默——观看进度是**辅助数据**，上报失败不该打扰用户，
 * 更不该阻断播放。
 */
/** 一条观看进度记录（静态模式用）。 */
export interface WatchRecord {
  resource_id: string;
  title: string;
  position: number;
  duration: number;
  delta: number;
  updated_at: number;
}

export async function reportWatch(payload: {
  resourceId: string;
  title?: string;
  position?: number;
  duration?: number;
  delta?: number;
}): Promise<void> {
  // ── 静态模式 ──
  //
  // 观看进度记在 localStorage。刷新后能接着上次的位置继续看。
  if (await isStaticRuntime()) {
    const key = StorageKeys.progress("global");
    const all = readLocal<Record<string, WatchRecord>>(key, {});
    const current = all[payload.resourceId];
    all[payload.resourceId] = {
      resource_id: payload.resourceId,
      title: payload.title ?? current?.title ?? "",
      position: payload.position ?? current?.position ?? 0,
      duration: payload.duration ?? current?.duration ?? 0,
      delta: (current?.delta ?? 0) + (payload.delta ?? 0),
      updated_at: Date.now(),
    };
    writeLocal(key, all);
    return;
  }

  try {
    await apiFetch(apiUrl("/api/resources/watch"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource_id: payload.resourceId,
        title: payload.title ?? "",
        position: payload.position ?? 0,
        duration: payload.duration ?? 0,
        delta: payload.delta ?? 0,
      }),
    });
  } catch {
    /* 观看进度上报失败不影响学习，静默忽略 */
  }
}
