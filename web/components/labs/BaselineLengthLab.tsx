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
 * 实验台 01-3 · 基准线长短实测台
 * ===============================
 *
 * 玩法
 * ----
 *
 * 这是**专门破解视觉错觉**的实验台。
 *
 * 画布上躺着 4 根精密木条，它们**起点故意没对齐**——所以乍一看
 * 好像长的反而短。学生必须把每根木条的左端**拖到左侧那条深蓝
 * 基准起跑线**上，才能看清真实的长短。
 *
 * 对齐的瞬间会有**磁性吸附**：木条被"吸"到基准线上，边缘泛起
 * 一圈金色微光，并且长度读数从「未对齐」切换成精确数值。
 *
 * 谜题模式**隐藏刻度**，要求对齐之后找出恰好等于指定单位长度
 * 的那根神秘木条。
 *
 * ⛔ 与 01-2 的区别：那是**两个集合**的比较，这里是**同一把尺子**
 *    上的长度测量。
 */

/** 画布尺寸。 */
const W = 620;
const H = 340;

/** 基准线 X。 */
const BASELINE_X = 108;

/** 木条高度。 */
const BAR_H = 22;

/** 每根木条的真实长度（单位格）。 */
const TRUE_LENGTHS = [3, 5, 2, 4];

/** 单位格宽度。 */
const UNIT = 44;

/** 一根木条。 */
interface Bar {
  id: number;
  /** 真实长度（单位格数）。 */
  length: number;
  /** 左端 X 坐标。 */
  x: number;
  /** 所在行的 Y。 */
  y: number;
  /** 是否已对齐基准线。 */
  aligned: boolean;
}

/** 各行的 Y。 */
const ROW_Y = [74, 128, 182, 236];

/** 吸附阈值（像素）。 */
const SNAP_RADIUS = 26;

export default function BaselineLengthLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const [bars, setBars] = useState<Bar[]>(() =>
    TRUE_LENGTHS.map((length, i) => ({
      id: i,
      length,
      // 故意错位：起点分散在各处。
      x: BASELINE_X + 26 + ((i * 37) % 90),
      y: ROW_Y[i],
      aligned: false,
    })),
  );
  const [dragId, setDragId] = useState<number | null>(null);
  const [snapped, setSnapped] = useState<number | null>(null);
  const [targetLength, setTargetLength] = useState<number | null>(null);
  const [found, setFound] = useState<number | null>(null);
  const [showTicks, setShowTicks] = useState(true);

  /* ── 谜题：隐藏刻度 ────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery") {
      setTargetLength(null);
      setFound(null);
      setShowTicks(true);
      return;
    }
    setShowTicks(false);
    // 目标取一个真实存在的长度。
    setTargetLength(TRUE_LENGTHS[2]);
  }, [stage]);

  /* ── 拖拽 + 磁性吸附 ───────────────────────────────────────── */

  const drag = useSvgDrag({
    onMove: (p) => {
      const id = dragId;
      if (id === null) return;
      setBars((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const near = Math.abs(p.x - BASELINE_X) <= SNAP_RADIUS;
          return {
            ...b,
            x: near ? BASELINE_X : p.x,
            y: b.y,
            aligned: near ? true : false,
          };
        }),
      );
    },
    onEnd: (p) => {
      const id = dragId;
      setDragId(null);
      if (id === null) return;

      const bar = bars.find((b) => b.id === id);
      if (!bar) return;

      const near = Math.abs(p.x - BASELINE_X) <= SNAP_RADIUS;
      if (near) {
        setSnapped(id);
        window.setTimeout(() => setSnapped(null), 800);
        onTelemetryChange?.({
          kind: "action",
          textZh: `木条已吸附到基准线，真实长度 ${bar.length} 个单位`,
          textEn: `Bar snapped to the baseline — its true length is ${bar.length} units`,
          value: `${bar.length}`,
          at: Date.now(),
        });
      } else {
        onTelemetryChange?.({
          kind: "action",
          textZh: "木条还未对齐基准线——起点不齐，长短会看错",
          textEn: "The bar is not on the baseline — misaligned starts mislead the eye",
          at: Date.now(),
        });
      }
    },
  });

  /* ── 谜题判定 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery" || targetLength === null || found !== null) return;
    const candidate = bars.find(
      (b) => b.length === targetLength && b.aligned,
    );
    if (!candidate) return;
    setFound(candidate.id);
    onSolved?.(
      `找到了——第 ${candidate.id + 1} 根木条对齐基准线后正好是 ${targetLength} 个单位长`,
      `Found it — bar ${candidate.id + 1} is exactly ${targetLength} units once aligned`,
    );
    onTelemetryChange?.({
      kind: "success",
      textZh: `神秘木条揭晓：第 ${candidate.id + 1} 根，长度 ${targetLength}`,
      textEn: `The mystery bar is revealed: number ${candidate.id + 1}, length ${targetLength}`,
      value: `${targetLength}`,
      at: Date.now(),
    });
  }, [stage, targetLength, bars, found, onSolved, onTelemetryChange]);

  /* ── 规律阶段 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "discover") return;
    const aligned = bars.filter((b) => b.aligned).length;
    if (aligned < 2) return;
    const lengths = bars
      .filter((b) => b.aligned)
      .map((b) => b.length)
      .sort((a, b) => a - b);
    onTelemetryChange?.({
      kind: "discovery",
      textZh: `对齐后按长短排序：${lengths.join(" < ")} —— 只有起点对齐，比较才有意义`,
      textEn: `Once aligned, the order is ${lengths.join(" < ")} — comparison needs a common start`,
      value: lengths.join(" < "),
      at: Date.now(),
    });
  }, [stage, bars, onTelemetryChange]);

  const stageHint = useMemo(() => {
    if (isEn) {
      if (stage === "explore")
        return "The bars start at different points. Drag each one onto the dark baseline to see its true length.";
      if (stage === "discover")
        return "Only after every bar shares the same starting line can you rank them honestly.";
      return "The scale is hidden. Align the bars, then find the one that is exactly the target length.";
    }
    if (stage === "explore")
      return tw("木条的起点各不相同。把每一根拖到深蓝基准线上，才看得出真实长短。");
    if (stage === "discover")
      return tw("只有当所有木条共用同一条起点线，比较才诚实。");
    return tw("刻度已隐藏。对齐木条，找出恰好等于目标长度的那一根。");
  }, [stage, isEn, tw]);

  /** 已对齐的木条按长度排序。 */
  const ranking = useMemo(() => {
    return bars
      .filter((b) => b.aligned)
      .slice()
      .sort((a, b) => a.length - b.length);
  }, [bars]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label={isEn ? "Baseline length bench" : tw("基准线长短实测台")}
          >
            <rect x={0} y={0} width={W} height={H} fill="#F8FAFC" />

            {/* 基准起跑线 */}
            <line
              x1={BASELINE_X}
              y1={40}
              x2={BASELINE_X}
              y2={H - 30}
              stroke="#0B162C"
              strokeWidth={2.5}
            />
            <text
              x={BASELINE_X - 8}
              y={32}
              fontSize={10.5}
              fill="#0B162C"
              textAnchor="middle"
              fontWeight={600}
            >
              {isEn ? "BASELINE" : tw("基准线")}
            </text>

            {/* 刻度 */}
            {showTicks
              ? Array.from({ length: 7 }, (_, i) => (
                  <g key={`tick-${i}`}>
                    <line
                      x1={BASELINE_X + i * UNIT}
                      y1={H - 30}
                      x2={BASELINE_X + i * UNIT}
                      y2={H - 22}
                      stroke="#94A3B8"
                      strokeWidth={1}
                    />
                    <text
                      x={BASELINE_X + i * UNIT}
                      y={H - 10}
                      fontSize={9.5}
                      fill="#94A3B8"
                      textAnchor="middle"
                    >
                      {i}
                    </text>
                  </g>
                ))
              : null}

            {/* 木条 */}
            {bars.map((b, i) => {
              const isDragging = dragId === b.id;
              const isSnapping = snapped === b.id;
              const width = b.length * UNIT;
              const isAnswer = found === b.id;
              return (
                <g
                  key={b.id}
                  {...drag.bind}
                  onPointerDown={(e) => {
                    setDragId(b.id);
                    drag.start(e);
                  }}
                  style={{ cursor: "grab" }}
                  opacity={isDragging ? 0.85 : 1}
                >
                  <rect
                    x={b.x}
                    y={b.y}
                    width={width}
                    height={BAR_H}
                    rx={4}
                    fill={isAnswer ? "#FDF8EC" : "#FFFFFF"}
                    stroke={isAnswer ? "#C59B38" : "#94A3B8"}
                    strokeWidth={isAnswer ? 2.4 : 1.4}
                  />
                  {/* 木纹 */}
                  {Array.from({ length: b.length }, (_, k) => (
                    <line
                      key={`grain-${k}`}
                      x1={b.x + k * UNIT + UNIT / 2}
                      y1={b.y + 5}
                      x2={b.x + k * UNIT + UNIT / 2}
                      y2={b.y + BAR_H - 5}
                      stroke="#E2E8F0"
                      strokeWidth={1}
                    />
                  ))}
                  {/* 磁性吸附微光 */}
                  {isSnapping ? (
                    <rect
                      x={b.x - 3}
                      y={b.y - 3}
                      width={width + 6}
                      height={BAR_H + 6}
                      rx={6}
                      fill="none"
                      stroke="#C59B38"
                      strokeWidth={2}
                      opacity={0.7}
                    />
                  ) : null}
                  {/* 未对齐的提示标记 */}
                  {!b.aligned && !isDragging ? (
                    <circle
                      cx={b.x}
                      cy={b.y + BAR_H / 2}
                      r={3.5}
                      fill="#B42318"
                      opacity={0.75}
                    />
                  ) : null}
                  {/* 读数 */}
                  <text
                    x={b.x + 8}
                    y={b.y + BAR_H / 2 + 4}
                    fontSize={10}
                    fill={b.aligned ? "#0F172A" : "#94A3B8"}
                    fontWeight={b.aligned ? 600 : 400}
                  >
                    {b.aligned
                      ? `${b.length}`
                      : isEn
                        ? "?"
                        : tw("?")}
                  </text>
                  <text
                    x={b.x + width - 6}
                    y={b.y + BAR_H / 2 + 4}
                    fontSize={9.5}
                    fill="#94A3B8"
                    textAnchor="end"
                  >
                    #{i + 1}
                  </text>
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

          <FormulaBar highlight={ranking.length > 0}>
            {ranking.length > 0
              ? isEn
                ? `aligned: ${ranking.map((b) => b.length).join(" < ")}`
                : tw(`已对齐：${ranking.map((b) => b.length).join(" < ")}`)
              : isEn
                ? "no bar aligned yet"
                : tw("还没有木条对齐基准线")}
          </FormulaBar>

          {stage === "mystery" && targetLength !== null ? (
            <div className="rounded-lg border border-[#0B162C] bg-[#0B162C] p-3">
              <p className="text-[10px] font-medium tracking-[0.12em] text-white/60 uppercase">
                {isEn ? "Target" : tw("目标")}
              </p>
              <p className="mt-1 font-mono text-[20px] font-semibold text-[#C59B38]">
                {targetLength}
                <span className="ml-1 text-[11px] font-normal text-white/70">
                  {isEn ? "units" : tw("个单位")}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-white/70">
                {found !== null
                  ? isEn
                    ? "Found it."
                    : tw("已经找到了。")
                  : isEn
                    ? "Align the bars first."
                    : tw("先把木条对齐基准线。")}
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Alignment" : tw("对齐进度")}
            </p>
            <p className="mt-1 font-mono text-[20px] font-semibold text-[#0F172A]">
              {bars.filter((b) => b.aligned).length}
              <span className="ml-1 text-[11px] font-normal text-[#64748B]">
                / {bars.length}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
