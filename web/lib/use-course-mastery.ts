"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchLearningPath,
  type LearningPath,
} from "@/lib/progress-api";

/**
 * 课程掌握度的前端读取
 * =====================
 *
 * 课程目录卡片上那根「掌握 X% · 已学 Y%」的细条，数据来自后端的
 * ``/api/progress/mastery``——它是**真实学习痕迹**算出来的，不是
 * 前端猜的。
 *
 * 为什么不在卡片上直接算
 * --------------------
 *
 * 前端有 ``visited_page_ids`` 和 ``quiz_attempts``，理论上能算出
 * 一个「覆盖率」。但它算不出**掌握度**——掌握度要求知道每个技能
 * 节点的**最新一次**检测正确率，而那些记录存在后端的
 * ``quizzes.json`` 里，列表接口不返回。
 *
 * 前端自己猜一套、后端算一套，会出现「卡片上写 40%、技能树里写
 * 30%」的分裂。两套算法必然漂移。
 *
 * 缓存
 * ----
 *
 * 一次会话里同一门课只拉一次。目录页可能有十几张卡片，逐个请求会
 * 打出十几个并发请求——那既慢又对后端不友好。
 */
export function useCourseMastery(
  courseId: string | null | undefined,
): {
  mastery: number;
  progress: number;
  status: string;
  nodeCount: number;
  metCount: number;
  loading: boolean;
} {
  const [path, setPath] = useState<LearningPath | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!courseId) {
      setPath(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchLearningPath(courseId);
        if (alive) setPath(result);
      } catch {
        if (alive) setPath(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  return useMemo(
    () => ({
      mastery: path?.mastery ?? 0,
      progress: path?.progress ?? 0,
      status: path?.status ?? "未开始",
      nodeCount: path?.node_count ?? 0,
      metCount: path?.met_count ?? 0,
      loading,
    }),
    [path, loading],
  );
}
