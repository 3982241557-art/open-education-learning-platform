"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FormulaBar,
  StageSwitch,
  type LabProps,
} from "@/components/labs/lab-types";
import { useSvgDrag } from "@/components/labs/use-svg-drag";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 实验台 01-2 · 移多补少比较台
 * =============================
 *
 * 玩法
 * ----
 *
 * 上下两条**精确对齐**的轨道：上轨是蓝队，下轨是炭黑队，每一轨
 * 最多 8 个方块。学生可以直接**把方块在两行之间拖来拖去**。
 *
 * 屏幕上有三条同时工作的视觉线索：
 *
 * 1. **虚线配对连线**——两轨对应位置自动浮现，证明「这些是一样多的」；
 * 2. **差值高亮**——多出来的那几个用金色描边圈出来；
 * 3. **实时读数**——上面写着「蓝队 6 · 炭黑队 4 · 差 2」。
 *
 * 谜题模式要求**用最少的移动次数**让两行持平。这个约束很重要：
 * 它让学生发现「从多的一行拿走一半给少的一行」**就是**最优解——
 * 因为一次移动同时减少一边的多、另一边地少。
 *
 * ⛔ 与 01-1 的区别：这里是**两条轨道的对齐比较**，不是一一对应。
 */

/** 画布尺寸。 */
const W = 620;
const H = 340;

/** 每行最多几个方块。 */
const PER_ROW = 8;

/** 方块尺寸。 */
const BLOCK = 34;

/** 上轨起点。 */
const TOP_Y = 96;
/** 下轨起点。 */
const BOTTOM_Y = 210;

/** 左轨起点。 */
const LEFT_X = 92;

/** 一个方块。 */
interface Block {
  id: number;
  /** 属于哪一队。 */
  team: "blue" | "charcoal";
  /** 在该队里的序号（0-based）。 */
  slot: number;
}

/** 轨道基线。 */
function trackY(team: "blue" | "charcoal"): number {
  return team === "blue" ? TOP_Y : BOTTOM_Y;
}

/** 方块中心。 */
function blockCenter(block: Block): { x: number; y: number } {
  return {
    x: LEFT_X + block.slot * BLOCK + BLOCK / 2,
    y: trackY(block.team) + BLOCK / 2,
  };
}

export default function QuantityCompareLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const [blocks, setBlocks] = useState<Block[]>(() => {
    const list: Block[] = [];
    for (let i = 0; i < 6; i += 1) {
      list.push({ id: i, team: "blue", slot: i });
    }
    for (let i = 0; i < 4; i += 1) {
      list.push({ id: 100 + i, team: "charcoal", slot: i });
    }
    return list;
  });
  const [dragId, setDragId] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [solvedOnce, setSolvedOnce] = useState(false);

  const blueCount = blocks.filter((b) => b.team === "blue").length;
  const charcoalCount = blocks.filter((b) => b.team === "charcoal").length;
  const diff = blueCount - charcoalCount;

  /** 配对数——两轨重叠的部分。 */
  const paired = Math.min(blueCount, charcoalCount);

  /** 谜题目标移动次数 = 差值的一半（最优解）。 */
  const optimalMoves = Math.abs(diff) / 2;

  /* ── 拖拽 ──────────────────────────────────────────────────── */

  const drag = useSvgDrag({
    onMove: (p) => {
      const id = dragId;
      if (id === null) return;
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          // 拖到哪条轨？按纵向位置判断。
          const team: Block["team"] =
            p.y < (TOP_Y + BOTTOM_Y) / 2 ? "blue" : "charcoal";
          return { ...b, team };
        }),
      );
    },
    onEnd: () => {
      const id = dragId;
      setDragId(null);
      if (id === null) return;

      setBlocks((prev) => {
        const block = prev.find((b) => b.id === id);
        if (!block) return prev;

        // 重新排布该队的槽位，保持紧凑。
        const sameTeam = prev
          .filter((b) => b.team === block.team && b.id !== id)
          .sort((a, b) => a.slot - b.slot);
        const rebuilt = sameTeam.map((b, i) => ({ ...b, slot: i }));
        const others = prev.filter(
          (b) => b.team !== block.team && b.id !== id,
        );
        return [...others, ...rebuilt, { ...block, slot: rebuilt.length }].sort(
          (a, b) => a.id - b.id,
        );
      });

      setMoves((m) => m + 1);
      onTelemetryChange?.({
        kind: "action",
        textZh: `移动了一次方块 —— 已移动 ${moves + 1} 次`,
        textEn: `Moved one block — ${moves + 1} move${moves + 1 === 1 ? "" : "s"} so far`,
        value: `moves ${moves + 1}`,
        at: Date.now(),
      });
    },
  });

  /* ── 谜题判定 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery") {
      setSolvedOnce(false);
      return;
    }
    if (diff !== 0) return;
    if (solvedOnce) return;
    setSolvedOnce(true);
    const optimal = optimalMoves > 0 ? optimalMoves : 0;
    const perfect = moves <= optimal;
    onSolved?.(
      perfect
        ? `两行持平了，而且只用了 ${moves} 次移动——这就是最优解`
        : `两行持平了，用了 ${moves} 次移动（最优是 ${optimal} 次）`,
      perfect
        ? `The rows now match, in only ${moves} move${moves === 1 ? "" : "s"} — that is optimal`
        : `The rows now match, in ${moves} moves (optimal is ${optimal})`,
    );
    onTelemetryChange?.({
      kind: "success",
      textZh: perfect
        ? `两行一样多 —— ${moves} 次移动达成最优解`
        : `两行一样多 —— ${moves} 次移动（最优 ${optimal} 次）`,
      textEn: perfect
        ? `Equal rows in ${moves} moves — optimal solution`
        : `Equal rows in ${moves} moves (optimal: ${optimal})`,
      value: `moves ${moves} / optimal ${optimal}`,
      at: Date.now(),
    });
  }, [stage, diff, moves, optimalMoves, solvedOnce, onSolved, onTelemetryChange]);

  /* ── 规律阶段的发现 ────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "discover") return;
    if (diff === 0) return;
    onTelemetryChange?.({
      kind: "discovery",
      textZh: `蓝队多 ${Math.abs(diff)} 个 —— 把它的一半给炭黑队，两边就一样多了`,
      textEn: `Blue has ${Math.abs(diff)} more — give half of that to charcoal and both rows match`,
      value: `diff ${diff > 0 ? "+" : ""}${diff}`,
      at: Date.now(),
    });
  }, [stage, diff, onTelemetryChange]);

  const stageHint = useMemo(() => {
    if (isEn) {
      if (stage === "explore")
        return "Drag blocks between the two rows. Dashed lines show what matches; gold outlines show the surplus.";
      if (stage === "discover")
        return "How many moves make the rows equal? Half the difference, moved in one go.";
      return "Equalise the two rows in as few moves as you can. Moving a block across helps twice.";
    }
    if (stage === "explore")
      return tw("把方块在两行之间拖来拖去。虚线是配对部分，金色是多出来的部分。");
    if (stage === "discover")
      return tw("最少几次移动能让两行持平？答案就藏在差值的一半里。");
    return tw("用尽可能少的移动让两行持平。一次跨界移动，能同时消掉一边多、一边少。");
  }, [stage, isEn, tw]);

  /** 多出来的方块 id 集合。 */
  const surplusIds = useMemo(() => {
    if (diff === 0) return new Set<number>();
    const richer = diff > 0 ? "blue" : "charcoal";
    const list = blocks
      .filter((b) => b.team === richer)
      .sort((a, b) => b.slot - a.slot)
      .slice(0, Math.abs(diff));
    return new Set(list.map((b) => b.id));
  }, [blocks, diff]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label={isEn ? "Comparison bench" : tw("数量比较台")}
          >
            <rect x={0} y={0} width={W} height={H} fill="#F8FAFC" />

            {/* 两条轨道 */}
            {(["blue", "charcoal"] as const).map((team) => {
              const y = trackY(team);
              const isBlue = team === "blue";
              return (
                <g key={team}>
                  <rect
                    x={40}
                    y={y - 12}
                    width={W - 80}
                    height={BLOCK + 24}
                    rx={10}
                    fill="#FFFFFF"
                    stroke="#E2E8F0"
                  />
                  <line
                    x1={LEFT_X}
                    y1={y + BLOCK + 2}
                    x2={LEFT_X + PER_ROW * BLOCK}
                    y2={y + BLOCK + 2}
                    stroke="#CBD5E1"
                    strokeWidth={1}
                  />
                  <text x={44} y={y + 20} fontSize={11} fill="#64748B">
                    {isBlue
                      ? isEn
                        ? "Blue team"
                        : tw("蓝队")
                      : isEn
                        ? "Charcoal team"
                        : tw("炭黑队")}
                  </text>
                </g>
              );
            })}

            {/* 配对虚线 */}
            {Array.from({ length: paired }, (_, i) => {
              const x = LEFT_X + i * BLOCK + BLOCK / 2;
              return (
                <line
                  key={`pair-${i}`}
                  x1={x}
                  y1={TOP_Y + BLOCK}
                  x2={x}
                  y2={BOTTOM_Y}
                  stroke="#1D4ED8"
                  strokeWidth={1.4}
                  strokeDasharray="4 4"
                  opacity={0.45}
                />
              );
            })}

            {/* 方块 */}
            {blocks.map((b) => {
              const center = blockCenter(b);
              const isSurplus = surplusIds.has(b.id);
              const isDragging = dragId === b.id;
              return (
                <g
                  key={b.id}
                  {...drag.bind}
                  onPointerDown={(e) => {
                    setDragId(b.id);
                    drag.start(e);
                  }}
                  style={{ cursor: "grab" }}
                  opacity={isDragging ? 0.8 : 1}
                >
                  <rect
                    x={center.x - BLOCK / 2}
                    y={center.y - BLOCK / 2}
                    width={BLOCK - 3}
                    height={BLOCK - 3}
                    rx={4}
                    fill={b.team === "blue" ? "#1D4ED8" : "#0F162C"}
                    stroke={isSurplus ? "#C59B38" : "#0B162C"}
                    strokeWidth={isSurplus ? 2.6 : 1}
                  />
                  {isSurplus ? (
                    <text
                      x={center.x}
                      y={center.y + 4}
                      fontSize={13}
                      fill="#FDF8EC"
                      textAnchor="middle"
                      fontWeight={700}
                    >
                      +
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>

        {/* 侧栏 */}
        <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "How it works" : tw("怎么玩")}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#334155]">
              {stageHint}
            </p>
          </div>

          <FormulaBar highlight={diff === 0}>
            {isEn
              ? `Blue ${blueCount} · Charcoal ${charcoalCount} · diff ${diff > 0 ? "+" : ""}${diff}`
              : tw(`蓝队 ${blueCount} · 炭黑队 ${charcoalCount} · 差 ${diff > 0 ? "+" : ""}${diff}`)}
          </FormulaBar>

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Moves" : tw("移动次数")}
            </p>
            <p className="mt-1 font-mono text-[22px] font-semibold text-[#0F172A]">
              {moves}
              {stage === "mystery" && optimalMoves > 0 ? (
                <span className="ml-1.5 text-[11px] font-normal text-[#64748B]">
                  {isEn ? `best ${optimalMoves}` : tw(`最优 ${optimalMoves}`)}
                </span>
              ) : null}
            </p>

            {stage === "discover" && Math.abs(diff) > 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-[#334155]">
                {isEn
                  ? `Moving ${Math.abs(diff) / 2} block${Math.abs(diff) / 2 === 1 ? "" : "s"} from the longer row makes both rows ${(blueCount + charcoalCount) / 2}.`
                  : tw(`从多的一行移 ${Math.abs(diff) / 2} 个到少的一行，两行就都是 ${(blueCount + charcoalCount) / 2} 个了。`)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
