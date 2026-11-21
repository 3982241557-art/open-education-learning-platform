"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, MessageSquare, NotebookPen, PlayCircle } from "lucide-react";
import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
  staticFetch,
} from "@/shared/api/client";
import { cn } from "@/lib/cn";
import { readLocal, StorageKeys } from "@/lib/local-store";

/**
 * 中台学情统计条
 * ==============
 *
 * 用户在公开课里的一切痕迹，**实时**反映在这一行数字上：
 *
 * .. code-block:: text
 *
 *     [▶ 已看 12/76 门]  [⏱ 累计观看 4.2 小时]  [✎ 笔记 18 条]  [💬 提问 7 次]
 *
 * 为什么要实时
 * ------------
 *
 * 「学情中心」是大盘——用户要专门点进去才能看到。但**在学习的当下**，
 * 用户最需要的反馈是「我刚才那一下到底记下来没有」。
 *
 * 所以这里做一份**即时镜像**：本地 state 立刻更新（零延迟），
 * 同时后台静默拉一次权威数据校正。
 *
 * 数字的来源
 * ----------
 *
 * 全部来自后端 ``GET /api/resources/progress``：
 *
 * * 已看几门 / 覆盖率 → 观看进度记账（``watch.json``）；
 * * 累计观看时长 → 同上；
 * * 笔记条数 → 留存文档（与课程共用同一套笔记存储）；
 * * 提问次数 → 助教会话历史（用户消息条数）。
 */

interface HubProgress {
  total_resources: number;
  seen_resources: number;
  resource_coverage: number;
  dwell_seconds: number;
  note_count: number;
  ask_count: number;
}

/**
 * 从本地存储里**汇总**出中台进度。
 *
 * 静态模式下没有后端算这些数字，得自己数：
 *
 * * 笔记条数 → 读所有课程目录下的笔记；
 * * 提问次数 → 读会话记录里的用户消息数；
 * * 观看时长 → 读观看记录里累计的 ``delta``。
 *
 * 资源总数来自静态的课程大盘。
 */
async function readLocalProgress(): Promise<HubProgress> {
  const hubRaw = await staticFetch<any>("/data/global_resource_hub.json");
  const hub = hubRaw?.hub ?? hubRaw;
  const categories = hub?.categories ?? [];
  const totalResources = categories.reduce(
    (sum: number, category: any) => sum + (category.resources?.length ?? 0),
    0,
  );

  // 笔记——按课程 id 分别存的，要合并。
  let noteCount = 0;
  let askCount = 0;
  let dwellSeconds = 0;

  if (typeof window !== "undefined") {
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key) continue;

        if (key.startsWith("dreamclass.notes.")) {
          const notes = readLocal<unknown[]>(key, []);
          noteCount += notes.length;
        } else if (key.startsWith("dreamclass.session.")) {
          const messages = readLocal<unknown[]>(key, []);
          askCount += messages.filter(
            (item: any) => item?.role === "user",
          ).length;
        } else if (key === StorageKeys.progress("global")) {
          const records = readLocal<Record<string, any>>(key, {});
          for (const record of Object.values(records)) {
            dwellSeconds += Number(record?.delta ?? 0) || 0;
          }
        }
      }
    } catch {
      /* 隐私模式读不了——返回 0 */
    }
  }

  // 看过的资源数——有观看记录就算看过。
  const seen = readLocal<Record<string, any>>(StorageKeys.progress("global"), {});
  const seenResources = Object.keys(seen).length;

  return {
    total_resources: totalResources,
    seen_resources: seenResources,
    resource_coverage:
      totalResources > 0 ? Math.min(1, seenResources / totalResources) : 0,
    dwell_seconds: dwellSeconds,
    note_count: noteCount,
    ask_count: askCount,
  };
}

export function HubProgressStrip({
  /** 切台后触发刷新——换课了，进度面板要跟着变。 */
  refreshKey = "",
  className = "",
}: {
  refreshKey?: string;
  className?: string;
}) {
  const [progress, setProgress] = useState<HubProgress | null>(null);

  const load = useCallback(async () => {
    try {
      // ── 静态模式 ──
      //
      // 进度数字全在 localStorage 里（笔记、观看、提问各自维护一份）。
      // 这里把它们汇总起来。
      if (await isStaticRuntime()) {
        setProgress(await readLocalProgress());
        return;
      }

      const response = await apiFetch(apiUrl("/api/resources/progress"), {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await asJsonOrThrow(response);
      setProgress({
        total_resources: Number(data?.total_resources ?? 0) || 0,
        seen_resources: Number(data?.seen_resources ?? 0) || 0,
        resource_coverage: Number(data?.resource_coverage ?? 0) || 0,
        dwell_seconds: Number(data?.dwell_seconds ?? 0) || 0,
        note_count: Number(data?.note_count ?? 0) || 0,
        ask_count: Number(data?.ask_count ?? 0) || 0,
      });
    } catch {
      /* 学情拉不到不该打断学习——静默忽略 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /**
   * 定时刷新。
   *
   * 这几个数字的来源全在**别的组件**里：
   *
   * * 观看时长 → 播放器每 15 秒上报一次；
   * * 笔记条数 → 留存文档在气泡被点开时落盘；
   * * 提问次数 → 助手的会话在每轮回答结束后持久化。
   *
   * 它们各自触发时没有理由通知这里。所以这里**轮询**——15 秒一次，
   * 与播放器的上报周期对齐，足够「实时」，又不至于打爆后端。
   *
   * 切台时（``refreshKey`` 变化）会立刻刷一次，不用等下一个周期。
   */
  useEffect(() => {
    const handle = window.setInterval(() => {
      void load();
    }, 15_000);
    return () => window.clearInterval(handle);
  }, [load]);

  if (!progress) return null;

  const hours = progress.dwell_seconds / 3600;

  const items = [
    {
      icon: PlayCircle,
      label: `已看 ${progress.seen_resources}/${progress.total_resources} 门`,
      title: `资源覆盖率 ${(progress.resource_coverage * 100).toFixed(0)}%`,
    },
    {
      icon: Clock,
      label:
        hours >= 1
          ? `累计观看 ${hours.toFixed(1)} 小时`
          : `累计观看 ${Math.round(progress.dwell_seconds / 60)} 分钟`,
      title: "累计观看时长",
    },
    {
      icon: NotebookPen,
      label: `笔记 ${progress.note_count} 条`,
      title: "留存文档中的笔记条数",
    },
    {
      icon: MessageSquare,
      label: `提问 ${progress.ask_count} 次`,
      title: "向 AI 助教提问的次数",
    },
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] font-normal text-[var(--muted-foreground)]",
        className,
      )}
      data-seek-hub-progress
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <span key={item.label} title={item.title} className="inline-flex items-center gap-1">
            <Icon size={11} strokeWidth={2} className="text-[var(--seek-plum)]/70" />
            <span className="tabular-nums">{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}
