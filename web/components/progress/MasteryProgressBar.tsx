"use client";

import { cn } from "@/lib/cn";

/**
 * 掌握度分段进度条
 * =================
 *
 * 三档状态——**未开始 / 学习中 / 已达标**——在一根横条上分段显示。
 *
 * 为什么不用一根连续的进度条
 * --------------------------
 *
 * 连续进度条（「62%」）只回答「我完成了多少」。但学习不是匀速推进的：
 * 看完一节课 ≠ 掌握它。
 *
 * 分段条回答的是另一个问题：**这 62% 里，有多少是真懂了？**
 *
 * .. code-block:: text
 *
 *     未开始  │████████░░░░░░░░░░░│ 学习中  │████░░░░│ 已达标
 *              ← 学过但没掌握 →      ← 真会了 →
 *
 * 三段的比例就是三档节点数占比——**一眼看出「学过多少」和「掌握多少」
 * 之间的差距**。那个差距才是用户真正该关注的。
 *
 * 可点击
 * ------
 *
 * 每一段都是按钮——点它跳到对应的节点。这让进度条从「装饰」变成
 * 「导航」：用户看到「学习中」那一段特别长，就知道该去补哪几块。
 */
export interface MasterySegment {
  /** 状态键。 */
  key: "not_started" | "learning" | "mastered";
  /** 状态名。 */
  label: string;
  /** 节点数。 */
  count: number;
  /** 占比（0–1）。 */
  ratio: number;
  /** 对应的节点 id 列表——点击时跳转。 */
  nodeIds: string[];
}

const SEGMENT_STYLES: Record<
  MasterySegment["key"],
  { bar: string; text: string; dot: string }
> = {
  not_started: {
    bar: "bg-[var(--border)]",
    text: "text-[var(--muted-foreground)]",
    dot: "bg-[var(--muted-foreground)]",
  },
  learning: {
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  mastered: {
    bar: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

/**
 * 分段掌握度进度条。
 */
export function MasteryProgressBar({
  segments,
  onSelect,
  className = "",
  size = "md",
}: {
  segments: MasterySegment[];
  /** 点击某一段。 */
  onSelect?: (segment: MasterySegment) => void;
  className?: string;
  /** ``sm`` 用于卡片，``md`` 用于播放页顶部。 */
  size?: "sm" | "md";
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (total === 0) return null;

  return (
    <div className={cn("", className)}>
      {/* 条 */}
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-[var(--muted)]",
          size === "sm" ? "h-1.5" : "h-2",
        )}
        role="img"
        aria-label={segments
          .map((segment) => `${segment.label} ${segment.count} 个`)
          .join("，")}
      >
        {segments.map((segment) => {
          if (segment.count === 0) return null;
          const style = SEGMENT_STYLES[segment.key];
          const width = `${(segment.count / total) * 100}%`;
          const title = `${segment.label}：${segment.count} 个节点`;
          return onSelect ? (
            <button
              key={segment.key}
              type="button"
              onClick={() => onSelect(segment)}
              title={title}
              aria-label={title}
              className={cn(
                "h-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--primary)]",
                style.bar,
              )}
              style={{ width }}
            />
          ) : (
            <span
              key={segment.key}
              className={cn("h-full", style.bar)}
              style={{ width }}
              title={title}
            />
          );
        })}
      </div>

      {/* 图例 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {segments.map((segment) => {
          const style = SEGMENT_STYLES[segment.key];
          return (
            <span
              key={segment.key}
              className={cn(
                "inline-flex items-center gap-1 text-[10.5px] tabular-nums",
                style.text,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
              {segment.label}
              <span className="font-medium">{segment.count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 一行简版掌握度——只有一条窄条 + 一个百分比。
 *
 * 用于课程目录卡片那种**空间极紧**的地方。完整的分段条在卡片里
 * 会把标题挤下去。
 */
export function MasteryMiniBar({
  mastery,
  progress,
  className = "",
}: {
  /** 掌握度（0–1）——达标节点占比。 */
  mastery: number;
  /** 进度（0–1）——已开始节点占比。 */
  progress: number;
  className?: string;
}) {
  const masteredPct = Math.min(100, Math.round(mastery * 100));
  const startedPct = Math.min(100, Math.round(progress * 100));

  return (
    <div className={cn("", className)}>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        {/* 已开始（未达标）——琥珀色 */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber-500/70 transition-[width]"
          style={{ width: `${startedPct}%` }}
        />
        {/* 已达标——翠绿，压在上面 */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width]"
          style={{ width: `${masteredPct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-[var(--muted-foreground)]">
        掌握 {masteredPct}% · 已学 {startedPct}%
      </p>
    </div>
  );
}

/**
 * 把技能节点列表折算成三段。
 *
 * 「未开始」= 没检测过；「学习中」= 检测过但没达标（或者学过视频但
 * 还没检测）；「已达标」= 正确率 ≥ 80%。
 */
export function toMasterySegments(
  nodes: Array<{ status: string }>,
): MasterySegment[] {
  const notStarted = nodes.filter((node) => node.status === "未开始");
  const learning = nodes.filter((node) => node.status === "学习中");
  const mastered = nodes.filter((node) => node.status === "已达标");
  const total = nodes.length || 1;

  const build = (
    key: MasterySegment["key"],
    label: string,
    list: Array<{ status: string }>,
  ): MasterySegment => ({
    key,
    label,
    count: list.length,
    ratio: list.length / total,
    nodeIds: [],
  });

  return [
    build("not_started", "未开始", notStarted),
    build("learning", "学习中", learning),
    build("mastered", "已达标", mastered),
  ];
}
