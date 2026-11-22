"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  describeProgress,
  reportLabContext,
  type LabContextDetail,
} from "@/lib/lab-context";

/**
 * 教具行为上报 hook
 * ==================
 *
 * 每一个教具都用它把「用户完成了哪一步」告诉页面。
 *
 * 用法
 * ---
 *
 * .. code-block:: tsx
 *
 *    const { done, total, markDone } = useLabProgress({
 *      kind: "hanzi",
 *      title: "本课生字笔顺",
 *      taskLabel: "本课生字描红",
 *      tasks: chars.map((c) => ({ label: c, done: false })),
 *    });
 *
 *    // 完成一个字时：
 *    markDone(index);
 *
 * 效果
 * ----
 *
 * 1. 右侧 AI 伴学的「当前学习上下文」实时更新；
 * 2. 巩固检测卡上出现「教具探究 3/8」徽标；
 * 3. 「教具完成 + 巩固题全对」双达标 → 点亮本课进度。
 *
 * ⚠️ 上报是**节流**的——一个用户连续描完 8 个字，不应该发 8 次
 *    DOM 事件。默认在状态真正变化时才发一次。
 */

/** 上报配置。 */
export interface LabProgressConfig {
  /** 教具种类。 */
  kind: string;
  /** 教具标题。 */
  title: string;
  /** 任务的统称——「本课生字描红」「动态量角器验证」…… */
  taskLabel: string;
  /** 任务清单。 */
  tasks: Array<{ label: string; done: boolean }>;
}

/** 上报 hook 的返回值。 */
export interface LabProgress {
  /** 已完成数。 */
  done: number;
  /** 总数。 */
  total: number;
  /** 标记某个任务完成。 */
  markDone: (index: number) => void;
  /** 重置全部任务。 */
  reset: () => void;
}

export function useLabProgress(
  config: LabProgressConfig,
): LabProgress {
  const tasksRef = useRef(config.tasks);
  const lastSentRef = useRef<string>("");

  /** 计算当前签名——签名不变就不重复上报。 */
  const signature = useCallback(
    (tasks: Array<{ label: string; done: boolean }>) =>
      tasks.map((item) => (item.done ? "1" : "0")).join(""),
    [],
  );

  /**
   * 上报。
   *
   * 签名去重：只有「完成状态」真正变了才发事件。
   */
  const push = useCallback(
    (tasks: Array<{ label: string; done: boolean }>) => {
      const done = tasks.filter((item) => item.done).length;
      const sig = signature(tasks);
      if (sig === lastSentRef.current) return;
      lastSentRef.current = sig;

      const detail: LabContextDetail = {
        kind: config.kind,
        title: config.title,
        done,
        total: tasks.length,
        message:
          done >= tasks.length && tasks.length > 0
            ? `已完成全部 ${tasks.length} 个${config.taskLabel}`
            : describeProgress(config.taskLabel, done, tasks.length),
        tasks: tasks.map((item) => ({ label: item.label, done: item.done })),
      };
      reportLabContext(detail);
    },
    [config.kind, config.title, config.taskLabel, signature],
  );

  /** 首次挂载时上报一次——让 AI 伴学立刻知道「这里有什么可玩的」。 */
  useEffect(() => {
    push(tasksRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 标记完成。 */
  const markDone = useCallback(
    (index: number) => {
      const next = tasksRef.current.map((item, i) =>
        i === index ? { ...item, done: true } : item,
      );
      tasksRef.current = next;
      push(next);
    },
    [push],
  );

  /** 重置。 */
  const reset = useCallback(() => {
    const next = tasksRef.current.map((item) => ({ ...item, done: false }));
    tasksRef.current = next;
    push(next);
  }, [push]);

  const done = tasksRef.current.filter((item) => item.done).length;

  return {
    done,
    total: tasksRef.current.length,
    markDone,
    reset,
  };
}
