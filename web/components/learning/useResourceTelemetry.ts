"use client";

import { useCallback, useEffect, useRef } from "react";
import { reportResourceTelemetry } from "@/lib/courses-api";
import { emitLearningEvent, PROGRESS_UPDATED } from "@/lib/learning-events";

/**
 * 资源级学习遥测
 * ===============
 *
 * 页级遥测（``useReadingTelemetry``）量的是「正文读完了吗」。但资源
 * 枢纽型课程里，中间栏显示的是**外部内容**——一条 B 站视频、一篇
 * 维基词条。它们没有滚动条，也就没有「覆盖率」可量。
 *
 * 那怎么证明用户真的看了
 * ----------------------
 *
 * 只有一条路：**停留时长**。
 *
 * 所以这里对当前激活的资源做真实计时，切换资源 / 离开页面时把增量
 * 上报给后端。后端按自己的阈值（``MIN_RESOURCE_DWELL_SECONDS``）
 * 判定「已看」，前端**只负责如实上报**——判定标准不在前端，避免
 * 两端口径分裂。
 *
 * 显式标记
 * --------
 *
 * 「看完了」按钮是**另一条路**：它是用户明确的意图，比任何启发式都
 * 可靠。所以标记是**单向**的——标了不会被改回去。
 */

/** 上报的最小间隔（毫秒）——避免切资源时刷出一串请求。 */
const FLUSH_INTERVAL_MS = 1000;

export interface ResourceTelemetry {
  /** 手动结清一次（切换资源 / 卸载时调用）。 */
  flush: () => void;
  /** 标记当前资源「看完了」。 */
  markDone: () => void;
}

export function useResourceTelemetry(
  courseId: string,
  resourceId: string | null,
  pageId?: string,
): ResourceTelemetry {
  /** 本次观看开始时刻。 */
  const startedAtRef = useRef<number>(Date.now());
  /** 已上报过的停留秒数——只上报**增量**。 */
  const reportedRef = useRef<number>(0);
  /** 当前资源 id 的 ref 副本。 */
  const resourceRef = useRef<string | null>(resourceId);

  const flush = useCallback(() => {
    const resource = resourceRef.current;
    if (!courseId || !resource) return;

    const elapsed = (Date.now() - startedAtRef.current) / 1000;
    const delta = elapsed - reportedRef.current;
    if (delta < 0.1) return;

    reportedRef.current = elapsed;
    void reportResourceTelemetry(courseId, {
      resourceId: resource,
      dwellSeconds: delta,
      pageId,
    }).then(() => {
      emitLearningEvent(PROGRESS_UPDATED, {
        courseId,
        source: "resource-telemetry",
      });
    });
  }, [courseId, pageId]);

  // 换资源：先把旧资源结清，再重新计时。
  useEffect(() => {
    if (resourceRef.current === resourceId) return;

    const previous = resourceRef.current;
    if (previous && courseId) {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const delta = elapsed - reportedRef.current;
      if (delta >= 0.1) {
        void reportResourceTelemetry(courseId, {
          resourceId: previous,
          dwellSeconds: delta,
          pageId,
        });
      }
    }

    resourceRef.current = resourceId;
    startedAtRef.current = Date.now();
    reportedRef.current = 0;
  }, [courseId, resourceId, pageId]);

  // 定时结清——用户可能长时间停在同一个资源上不动。
  useEffect(() => {
    if (!courseId || !resourceId) return;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      if (elapsed - reportedRef.current >= FLUSH_INTERVAL_MS / 1000) flush();
    }, FLUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [courseId, resourceId, flush]);

  // 页面隐藏 / 关闭时结清。
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  // 卸载时结清。
  useEffect(() => {
    return () => {
      const resource = resourceRef.current;
      if (!courseId || !resource) return;
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const delta = elapsed - reportedRef.current;
      if (delta < 0.1) return;
      void reportResourceTelemetry(courseId, {
        resourceId: resource,
        dwellSeconds: delta,
        pageId,
      });
    };
  }, [courseId, pageId]);

  const markDone = useCallback(() => {
    const resource = resourceRef.current;
    if (!courseId || !resource) return;
    void reportResourceTelemetry(courseId, {
      resourceId: resource,
      dwellSeconds: 0,
      markedDone: true,
      pageId,
    }).then(() => {
      emitLearningEvent(PROGRESS_UPDATED, {
        courseId,
        source: "resource-marked",
      });
    });
  }, [courseId, pageId]);

  return { flush, markDone };
}
