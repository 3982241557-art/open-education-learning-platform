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
 * 实验台 01-6 · 动态数轴跳跃台
 * ==============================
 *
 * 玩法
 * ----
 *
 * 一条**可平移缩放**的精密动态数轴。学生可以：
 *
 * 1. **拖动锚点**（红色滑块）沿数轴移动，读出当前位置；
 * 2. 从下方**步长按钮**里选一个跳跃量（+1、+2、+5、+10、−1、−5），
 *    然后**在数轴上拖出一条抛物线跳跃弧**——松手时锚点就跳到那里；
 * 3. 用 +/- 按钮**平移缩放**数轴，切换「看整段」与「看局部」。
 *
 * 抛物线弧是**因果可视化**：弧的高度编码跳跃幅度，弧的落点编码
 * 结果。学生能直接**看见**「加 10 比加 1 跳得远」。
 *
 * 谜题模式给出起点与**神秘终点标记**，要求用**规定步数**跳到目标点。
 *
 * ⛔ 与 01-5 的区别：那是**离散的位值**，这里是**连续的位置关系**。
 */

/** 画布尺寸。 */
const W = 620;
const H = 320;

/** 数轴 Y。 */
const AXIS_Y = 178;

/** 数轴左右留白。 */
const AXIS_PAD = 60;

/** 初始可视范围（单位）。 */
const INITIAL_SPAN = 12;

/** 可选跳跃步长。 */
const STEPS = [1, 2, 5, 10, -1, -5];

/** 一个跳跃记录。 */
interface Jump {
  from: number;
  to: number;
  step: number;
}

/** 数轴上某个值对应的 X。 */
function valueToX(value: number, min: number, pxPerUnit: number): number {
  return AXIS_PAD + (value - min) * pxPerUnit;
}

/** X 反推数值。 */
function xToValue(x: number, min: number, pxPerUnit: number): number {
  return min + (x - AXIS_PAD) / pxPerUnit;
}

export default function NumberLineJumpLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const [anchor, setAnchor] = useState(0);
  const [min, setMin] = useState(-2);
  const [span, setSpan] = useState(INITIAL_SPAN);
  const [step, setStep] = useState(1);
  const [jumps, setJumps] = useState<Jump[]>([]);
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [movesLeft, setMovesLeft] = useState<number | null>(null);

  const pxPerUnit = (W - AXIS_PAD * 2) / span;

  /* ── 谜题目标 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery") {
      setTarget(null);
      setMovesLeft(null);
      return;
    }
    setTarget(7);
    setMovesLeft(3);
  }, [stage]);

  /* ── 拖锚点 ────────────────────────────────────────────────── */

  const anchorDrag = useSvgDrag({
    onMove: (p) => {
      const raw = xToValue(p.x, min, pxPerUnit);
      setAnchor(Math.round(raw * 10) / 10);
    },
    onEnd: () => {
      onTelemetryChange?.({
        kind: "action",
        textZh: `锚点移动到 ${anchor}`,
        textEn: `Anchor moved to ${anchor}`,
        value: `${anchor}`,
        at: Date.now(),
      });
    },
  });

  /* ── 拖出跳跃弧 ────────────────────────────────────────────── */

  const arcDrag = useSvgDrag({
    onStart: () => {
      setAim(null);
    },
    onMove: (p) => {
      setAim(p);
    },
    onEnd: (p) => {
      setAim(null);
      const targetValue = Math.round(xToValue(p.x, min, pxPerUnit));
      const from = anchor;
      const to = targetValue;
      const delta = to - from;

      if (delta === 0) return;

      // 必须用当前选定的步长整除——这才是「按步长跳」的意义。
      if (delta % step !== 0) {
        onTelemetryChange?.({
          kind: "hint",
          textZh: `这一步长 ${step} 跳不到 ${to}——换成 ${Math.abs(delta)} 的因数试试`,
          textEn: `A step of ${step} cannot reach ${to} — try a factor of ${Math.abs(delta)}`,
          value: `${from} → ${to}`,
          at: Date.now(),
        });
        return;
      }

      const jumpsNeeded = Math.abs(delta / step);
      if (movesLeft !== null && jumpsNeeded > movesLeft) {
        onTelemetryChange?.({
          kind: "hint",
          textZh: `这需要 ${jumpsNeeded} 跳，但你只剩 ${movesLeft} 跳`,
          textEn: `That needs ${jumpsNeeded} jumps but only ${movesLeft} remain`,
          value: `${from} → ${to}`,
          at: Date.now(),
        });
        return;
      }

      setJumps((prev) => [...prev, { from, to, step }]);
      setAnchor(to);
      if (movesLeft !== null) setMovesLeft(movesLeft - jumpsNeeded);

      onTelemetryChange?.({
        kind: "action",
        textZh: `从 ${from} 跳到 ${to}（${delta > 0 ? "+" : ""}${delta}，用了 ${jumpsNeeded} 跳）`,
        textEn: `Jumped from ${from} to ${to} (${delta > 0 ? "+" : ""}${delta}, ${jumpsNeeded} jump${jumpsNeeded === 1 ? "" : "s"})`,
        value: `${from} → ${to}`,
        at: Date.now(),
      });
    },
  });

  /* ── 缩放 / 平移 ───────────────────────────────────────────── */

  const zoom = useCallback(
    (factor: number) => {
      setSpan((prev) => {
        const next = Math.max(4, Math.min(40, prev * factor));
        // 以锚点为中心缩放。
        const ratio = next / prev;
        setMin((m) => anchor - (anchor - m) / ratio);
        return next;
      });
    },
    [anchor],
  );

  /* ── 谜题判定 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery" || target === null) return;
    if (anchor !== target) return;
    onSolved?.(
      `到达终点 ${target} —— 用了 ${jumps.length} 次跳跃`,
      `Reached ${target} in ${jumps.length} jump${jumps.length === 1 ? "" : "s"}`,
    );
    onTelemetryChange?.({
      kind: "success",
      textZh: `到达神秘终点 ${target}`,
      textEn: `Reached the mystery marker at ${target}`,
      value: `${anchor}`,
      at: Date.now(),
    });
  }, [stage, target, anchor, jumps.length, onSolved, onTelemetryChange]);

  /* ── 刻度 ──────────────────────────────────────────────────── */

  const ticks = useMemo(() => {
    const stepSize = span <= 6 ? 1 : span <= 14 ? 2 : span <= 26 ? 5 : 10;
    const list: number[] = [];
    const start = Math.ceil(min / stepSize) * stepSize;
    for (let v = start; v <= min + span + 0.001; v += stepSize) {
      list.push(Math.round(v * 100) / 100);
    }
    return list;
  }, [min, span]);

  const stageHint = useMemo(() => {
    if (isEn) {
      if (stage === "explore")
        return "Drag the anchor to read its value. Pick a step, then drag an arc on the number line to jump.";
      if (stage === "discover")
        return "The arc height shows the size of the jump. Which step travels the farthest?";
      return "A hidden marker shows the destination. Reach it in exactly the number of jumps allowed.";
    }
    if (stage === "explore")
      return tw("拖动红色锚点读出它的值。选好步长后，在数轴上拖出一条跳跃弧。");
    if (stage === "discover")
      return tw("弧的高度编码跳跃幅度——哪种步长跳得最远？");
    return tw("神秘终点已标记。用规定次数的跳跃到达它。");
  }, [stage, isEn, tw]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative min-h-[250px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label={isEn ? "Dynamic number line" : tw("动态数轴")}
          >
            <rect x={0} y={0} width={W} height={H} fill="#F8FAFC" />

            {/* 跳跃弧 */}
            {jumps.map((j, i) => {
              const x1 = valueToX(j.from, min, pxPerUnit);
              const x2 = valueToX(j.to, min, pxPerUnit);
              const height = 34 + Math.min(70, Math.abs(j.to - j.from) * 5);
              return (
                <path
                  key={`jump-${i}`}
                  d={`M${x1},${AXIS_Y - 6} Q${(x1 + x2) / 2},${AXIS_Y - 6 - height * 2} ${x2},${AXIS_Y - 6}`}
                  fill="none"
                  stroke={j.step > 0 ? "#1D4ED8" : "#B42318"}
                  strokeWidth={2}
                  opacity={0.75}
                />
              );
            })}

            {/* 正在拖的弧 */}
            {aim ? (
              <path
                d={`M${valueToX(anchor, min, pxPerUnit)},${AXIS_Y - 6} Q${(valueToX(anchor, min, pxPerUnit) + aim.x) / 2},${AXIS_Y - 100} ${aim.x},${AXIS_Y - 6}`}
                fill="none"
                stroke="#C59B38"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            ) : null}

            {/* 数轴主线 */}
            <line
              x1={AXIS_PAD - 20}
              y1={AXIS_Y}
              x2={W - AXIS_PAD + 20}
              y2={AXIS_Y}
              stroke="#0B162C"
              strokeWidth={2}
            />
            <polygon
              points={`${W - AXIS_PAD + 20},${AXIS_Y} ${W - AXIS_PAD + 12},${AXIS_Y - 5} ${W - AXIS_PAD + 12},${AXIS_Y + 5}`}
              fill="#0B162C"
            />

            {/* 刻度 */}
            {ticks.map((t) => {
              const x = valueToX(t, min, pxPerUnit);
              return (
                <g key={`t-${t}`}>
                  <line
                    x1={x}
                    y1={AXIS_Y - 7}
                    x2={x}
                    y2={AXIS_Y + 7}
                    stroke="#0B162C"
                    strokeWidth={1.4}
                  />
                  <text
                    x={x}
                    y={AXIS_Y + 24}
                    fontSize={11}
                    fill="#334155"
                    textAnchor="middle"
                  >
                    {t}
                  </text>
                </g>
              );
            })}

            {/* 神秘终点 */}
            {stage === "mystery" && target !== null ? (
              <g>
                <line
                  x1={valueToX(target, min, pxPerUnit)}
                  y1={AXIS_Y - 96}
                  x2={valueToX(target, min, pxPerUnit)}
                  y2={AXIS_Y + 12}
                  stroke="#C59B38"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <text
                  x={valueToX(target, min, pxPerUnit)}
                  y={AXIS_Y - 104}
                  fontSize={11}
                  fill="#C59B38"
                  textAnchor="middle"
                  fontWeight={600}
                >
                  {isEn ? "target" : tw("终点")}
                </text>
              </g>
            ) : null}

            {/* 锚点 */}
            <g
              {...anchorDrag.bind}
              style={{ cursor: "ew-resize" }}
              onPointerDown={(e) => anchorDrag.start(e)}
            >
              <line
                x1={valueToX(anchor, min, pxPerUnit)}
                y1={AXIS_Y - 30}
                x2={valueToX(anchor, min, pxPerUnit)}
                y2={AXIS_Y + 12}
                stroke="#B42318"
                strokeWidth={2}
              />
              <circle
                cx={valueToX(anchor, min, pxPerUnit)}
                cy={AXIS_Y - 30}
                r={9}
                fill="#B42318"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              <text
                x={valueToX(anchor, min, pxPerUnit)}
                y={AXIS_Y - 38}
                fontSize={12}
                fill="#B42318"
                textAnchor="middle"
                fontWeight={700}
              >
                {anchor}
              </text>
            </g>

            {/* 跳跃弧的拖拽区 */}
            <rect
              x={AXIS_PAD - 20}
              y={AXIS_Y - 120}
              width={W - AXIS_PAD * 2 + 40}
              height={140}
              fill="transparent"
              {...arcDrag.bind}
              onPointerDown={(e) => arcDrag.start(e)}
              style={{ cursor: "crosshair" }}
            />
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

          {/* 步长选择 */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Step size" : tw("步长")}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(s)}
                  aria-pressed={step === s}
                  className={cn(
                    "rounded border px-2 py-1.5 font-mono text-[12px] transition-colors",
                    step === s
                      ? "border-[#0B162C] bg-[#0B162C] text-white"
                      : "border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]",
                  )}
                >
                  {s > 0 ? `+${s}` : s}
                </button>
              ))}
            </div>
          </div>

          <FormulaBar highlight={stage === "mystery"}>
            {isEn ? `anchor = ${anchor}` : tw(`锚点 = ${anchor}`)}
          </FormulaBar>

          {/* 缩放 / 平移 */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "View" : tw("视图")}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => zoom(0.7)}
                className="h-7 flex-1 rounded border border-[#E2E8F0] text-[12px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
              >
                −
              </button>
              <span className="w-14 text-center text-[10.5px] tabular-nums text-[#64748B]">
                {span.toFixed(0)}
              </span>
              <button
                type="button"
                onClick={() => zoom(1.4)}
                className="h-7 flex-1 rounded border border-[#E2E8F0] text-[12px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
              >
                +
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMin((m) => m - span / 4)}
                className="h-7 flex-1 rounded border border-[#E2E8F0] text-[11px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
              >
                {isEn ? "◀ pan" : tw("◀ 平移")}
              </button>
              <button
                type="button"
                onClick={() => setMin((m) => m + span / 4)}
                className="h-7 flex-1 rounded border border-[#E2E8F0] text-[11px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
              >
                {isEn ? "pan ▶" : tw("平移 ▶")}
              </button>
            </div>
          </div>

          {stage === "mystery" && target !== null ? (
            <div className="rounded-lg border border-[#0B162C] bg-[#0B162C] p-3">
              <p className="text-[10px] font-medium tracking-[0.12em] text-white/60 uppercase">
                {isEn ? "Challenge" : tw("谜题")}
              </p>
              <p className="mt-1 font-mono text-[16px] text-white">
                {isEn ? `reach ${target}` : tw(`到达 ${target}`)}
              </p>
              <p className="mt-0.5 font-mono text-[12px] text-[#C59B38]">
                {isEn
                  ? `jumps left: ${movesLeft ?? 0}`
                  : tw(`剩余跳跃次数：${movesLeft ?? 0}`)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
