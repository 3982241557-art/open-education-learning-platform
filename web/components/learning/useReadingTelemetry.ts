"use client";

import { useCallback, useEffect, useRef } from "react";
import { reportTelemetry } from "@/lib/courses-api";
import { emitLearningEvent, PROGRESS_UPDATED } from "@/lib/learning-events";

/**
 * 阅读遥测
 * =========
 *
 * 把「用户真的在读这一页」这件事，变成**可持久化的数字**。
 *
 * 要解决什么
 * ----------
 *
 * 原来「读过一页」= 「打开过这一页」。于是连点 20 次翻页，进度条就
 * 冲到 40%——**进度是假的**。学情中心看起来很热闹，其实什么都没学。
 *
 * 真实的判据有两条，缺一不可：
 *
 * 1. **停留** —— 用户在这一页上待了多久（真实计时，不是估算）；
 * 2. **滚动** —— 这一页的正文被看过了多大比例。
 *
 * 满足「停留够久 **或** 滚到底」才叫读过。这个阈值放在后端
 * （``progress_service.MIN_READ_DWELL_SECONDS`` / ``MIN_READ_COVERAGE``），
 * 前端只负责**如实上报**。
 *
 * 上报时机
 * --------
 *
 * - **滚动停止**（``scroll`` 事件停 300ms）→ 立刻上报一次覆盖率；
 * - **切页 / 离开课程页** → 上报累计停留时长；
 * - **页面隐藏**（切标签页）→ 上报累计停留时长。
 *
 * 为什么要分「增量」与「累计」
 * --------------------------
 *
 * ``dwell_seconds`` 是**增量**：每次上报的是「自上次上报以来过了多久」，
 * 后端负责累加。``coverage`` 是**累计最大值**：整页滚过 80% 之后，
 * 再往回滚也不会让它变小。
 *
 * 所以中途上报、切页上报、页面关闭上报，累加起来正好等于真实停留
 * 总时长——不会重复计算，也不会丢。
 */

export interface ReadingTelemetry {
  /** 手动上报一次（切页、卸载时调用）。 */
  flush: () => void;
}

/** 滚动停止多久之后上报一次覆盖率（毫秒）。 */
const SCROLL_IDLE_MS = 300;

/**
 * 挂载阅读遥测。
 *
 * @param courseId 课程 id。
 * @param pageId   当前页 id。传 ``null`` 表示「当前没有打开任何页」——
 *                 此时遥测暂停，但**不清零**已累计的停留时长。
 */
export function useReadingTelemetry(
  courseId: string,
  pageId: string | null,
  onProgress?: () => void,
): ReadingTelemetry {
  /** 本次页面访问的开始时刻（毫秒时间戳）。 */
  const startedAtRef = useRef<number>(Date.now());
  /** 已经上报过的停留秒数——只上报**增量**。 */
  const reportedRef = useRef<number>(0);
  /** 当前的滚动覆盖率（0–1）。 */
  const coverageRef = useRef<number>(0);
  /** 滚动停止计时器。 */
  const scrollTimerRef = useRef<number | null>(null);
  /** 本次挂载期间上报过的页 id——切页时要先把旧页结清。 */
  const pageRef = useRef<string | null>(pageId);

  /** 把当前这一段的停留时长与覆盖率上报出去。 */
  const flush = useCallback(() => {
    const page = pageRef.current;
    if (!courseId || !page) return;

    const elapsed = (Date.now() - startedAtRef.current) / 1000;
    // 只报**增量**——已经报过的不重复。
    const delta = elapsed - reportedRef.current;
    if (delta < 0.1 && coverageRef.current <= 0) return;

    reportedRef.current = elapsed;
    void reportTelemetry(courseId, {
      pageId: page,
      dwellSeconds: delta,
      coverage: coverageRef.current,
    }).then(() => {
      emitLearningEvent(PROGRESS_UPDATED, {
        courseId,
        source: "telemetry",
      });
      onProgress?.();
    });
  }, [courseId, onProgress]);

  // 换页：先把旧页的停留结清，再重置计时。
  useEffect(() => {
    if (pageRef.current === pageId) return;

    // 旧页结清——用旧页 id 上报。
    const previous = pageRef.current;
    if (previous && courseId) {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const delta = elapsed - reportedRef.current;
      if (delta >= 0.1 || coverageRef.current > 0) {
        void reportTelemetry(courseId, {
          pageId: previous,
          dwellSeconds: delta,
          coverage: coverageRef.current,
        });
      }
    }

    pageRef.current = pageId;
    startedAtRef.current = Date.now();
    reportedRef.current = 0;
    coverageRef.current = 0;
  }, [courseId, pageId]);

  /**
   * 滚动监听——算**这一页**正文被看过的比例。
   *
   * 「正文区域」用 ``[data-seek-reader-body]`` 标记（阅读器正文容器）。
   *
   * 关键：算的是**这一页**被滚过多少，不是**整个滚动容器**被滚过
   * 多少。
   *
   * 早先这里量的是外层滚动容器的 ``scrollHeight``，于是有两个大错：
   *
   * 1. 容器里还有页眉、目录、下一节的边角——滚过的是**容器**，
   *    不是**这一页**。同一章里滚一次，每一页的覆盖率都被算成 1。
   * 2. 容器**一屏装得下**时（``total <= viewport``）直接返回 1——
   *    于是「翻开」这一瞬间覆盖率就是 100%，后端判定「读过」，
   *    整个「停留够久或滚到底」的门槛被彻底绕过。进度条又变成了
   *    假的：连点 12 次翻页，进度直接冲到 40%。
   *
   * 现在改成：量**这一页正文**在滚动容器里的位置，算「已经滚过
   * 这一页的多少」。如果这一页**一屏就装得下**，它压根不需要滚动，
   * 覆盖率保持 0——此时只有「停留够久」才能算读过。这才是诚实的。
   */
  useEffect(() => {
    if (!pageId) return;

    const computeCoverage = () => {
      const body = document.querySelector<HTMLElement>("[data-seek-reader-body]");
      if (!body) return 0;
      const scroller =
        body.closest<HTMLElement>("[data-seek-reader-scroll]") ??
        document.scrollingElement;
      if (!scroller) return 0;

      const bodyRect = body.getBoundingClientRect();
      const pageHeight = bodyRect.height;
      if (pageHeight <= 0) return 0;

      const viewport = scroller.clientHeight || window.innerHeight;

      // 这一页一屏装得下 → 它不需要滚动，也就无从「滚过」。
      // 覆盖率保持 0，由后端的「停留够久」来判定。
      if (pageHeight <= viewport) return 0;

      // 这一页在滚动内容里的起始位置。
      const pageTop =
        bodyRect.top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;

      // 读者已经看到的最低点（视口下沿）在这一页里的位置。
      const seenBottom = scroller.scrollTop + viewport;
      const readThrough = Math.min(
        Math.max(seenBottom - pageTop, 0),
        pageHeight,
      );
      return Math.min(1, Math.max(0, readThrough / pageHeight));
    };

    const onScroll = () => {
      coverageRef.current = Math.max(coverageRef.current, computeCoverage());
      // 滚动停止 300ms 后上报一次——不必每一像素都打一次接口。
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        scrollTimerRef.current = null;
        flush();
      }, SCROLL_IDLE_MS);
    };

    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    };
  }, [flush, pageId]);

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

  // 卸载时结清——离开课程页别把停留时长丢了。
  useEffect(() => {
    return () => {
      const page = pageRef.current;
      if (!courseId || !page) return;
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const delta = elapsed - reportedRef.current;
      if (delta < 0.1 && coverageRef.current <= 0) return;
      void reportTelemetry(courseId, {
        pageId: page,
        dwellSeconds: delta,
        coverage: coverageRef.current,
      });
    };
  }, [courseId]);

  return { flush };
}
