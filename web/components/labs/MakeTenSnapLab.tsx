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
 * 实验台 01-4 · 十格凑十拼搭盘
 * ==============================
 *
 * 玩法
 * ----
 *
 * 左边是**高质感的十格磁性拼搭盘**（2×5 网格），右边是不同长度的
 * **实体数字积木条**——1 格到 9 格，每条都是实心木质感。
 *
 * 学生拖两根互补的积木条进十格框，**恰好凑满 10 格**的瞬间：
 *
 * 1. 盘面泛起一圈**清脆的锁定微光**；
 * 2. 右侧自动写出分解式——比如 ``7 + 3 = 10``；
 * 3. 进度条推进一格。
 *
 * 谜题模式给定一个**缺口**（比如「还差 4 格」），要求把所有**不重复的**
 * 凑十组合都拼出来——一共有 4 种：1+9、3+7、4+6、5+5。
 *
 * ⛔ 与 01-5 的区别：这里是**凑十的组合**，那里是**位值捆绑**。
 */

/** 画布尺寸。 */
const W = 620;
const H = 340;

/** 十格盘：2 行 × 5 列。 */
const BOARD_X = 60;
const BOARD_Y = 92;
const CELL = 38;
const COLS = 5;
const ROWS = 2;

/** 可用积木长度。 */
const PIECE_LENGTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 积木托盘初始位置。 */
const TRAY_X = 350;
const TRAY_Y = 78;

/** 一块积木。 */
interface Piece {
  id: number;
  length: number;
  x: number;
  y: number;
  /** 是否已放进十格盘。 */
  placed: boolean;
  /** 放在第几格（0-based）。 */
  cell: number;
}

/** 全部合法的凑十组合。 */
const MAKE_TEN_PAIRS: Array<[number, number]> = [
  [1, 9],
  [2, 8],
  [3, 7],
  [4, 6],
  [5, 5],
];

/** 拼搭盘里的第 n 格中心。 */
function cellCenter(cell: number): { x: number; y: number } {
  const col = cell % COLS;
  const row = Math.floor(cell / COLS);
  return {
    x: BOARD_X + col * CELL + CELL / 2,
    y: BOARD_Y + row * CELL + CELL / 2,
  };
}

export default function MakeTenSnapLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const [pieces, setPieces] = useState<Piece[]>(() =>
    PIECE_LENGTHS.map((length, i) => ({
      id: i,
      length,
      x: TRAY_X + 24,
      y: TRAY_Y + i * 27,
      placed: false,
      cell: -1,
    })),
  );
  const [dragId, setDragId] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [equation, setEquation] = useState<string | null>(null);
  const [foundPairs, setFoundPairs] = useState<string[]>([]);
  const [gap, setGap] = useState<number | null>(null);

  /** 盘里已占的格子。 */
  const occupied = useMemo(() => {
    const set = new Set<number>();
    for (const p of pieces) {
      if (!p.placed) continue;
      for (let i = 0; i < p.length; i += 1) set.add(p.cell + i);
    }
    return set;
  }, [pieces]);

  /** 盘里已占格数。 */
  const filledCount = occupied.size;

  /* ── 谜题：给定缺口 ────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery") {
      setGap(null);
      setFoundPairs([]);
      return;
    }
    setGap(4);
    setFoundPairs([]);
  }, [stage]);

  /* ── 拖拽 ──────────────────────────────────────────────────── */

  const drag = useSvgDrag({
    onMove: (p) => {
      const id = dragId;
      if (id === null) return;
      setPieces((prev) =>
        prev.map((pc) => (pc.id === id ? { ...pc, x: p.x, y: p.y } : pc)),
      );
    },
    onEnd: (p) => {
      const id = dragId;
      setDragId(null);
      if (id === null) return;

      const inBoard =
        p.x >= BOARD_X - 20 &&
        p.x <= BOARD_X + COLS * CELL + 20 &&
        p.y >= BOARD_Y - 20 &&
        p.y <= BOARD_Y + ROWS * CELL + 20;

      setPieces((prev) => {
        const piece = prev.find((pc) => pc.id === id);
        if (!piece) return prev;

        if (!inBoard) {
          return prev.map((pc) =>
            pc.id === id
              ? {
                  ...pc,
                  placed: false,
                  cell: -1,
                  x: TRAY_X + 24,
                  y: TRAY_Y + PIECE_LENGTHS.indexOf(piece.length) * 27,
                }
              : pc,
          );
        }

        // 找得到一个能放下它的空位吗？
        const taken = new Set<number>();
        for (const other of prev) {
          if (!other.placed || other.id === id) continue;
          for (let i = 0; i < other.length; i += 1) taken.add(other.cell + i);
        }
        let slot = -1;
        for (let start = 0; start <= COLS * ROWS - piece.length; start += 1) {
          // 只允许横排放置。
          if (start % COLS + piece.length > COLS) continue;
          let fits = true;
          for (let i = 0; i < piece.length; i += 1) {
            if (taken.has(start + i)) {
              fits = false;
              break;
            }
          }
          if (fits) {
            slot = start;
            break;
          }
        }

        if (slot < 0) {
          onTelemetryChange?.({
            kind: "action",
            textZh: "这个位置放不下了——先取走一块积木",
            textEn: "It does not fit there — take a piece off the board first",
            at: Date.now(),
          });
          return prev.map((pc) =>
            pc.id === id
              ? {
                  ...pc,
                  placed: false,
                  cell: -1,
                  x: TRAY_X + 24,
                  y: TRAY_Y + PIECE_LENGTHS.indexOf(piece.length) * 27,
                }
              : pc,
          );
        }

        const center = cellCenter(slot);
        return prev.map((pc) =>
          pc.id === id
            ? {
                ...pc,
                placed: true,
                cell: slot,
                x: center.x,
                y: center.y,
              }
            : pc,
        );
      });
    },
  });

  /* ── 凑满 10 格的判定 ─────────────────────────────────────── */

  useEffect(() => {
    if (filledCount !== 10) return;

    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 900);

    // 找出盘里的两根积木。
    const placed = pieces.filter((p) => p.placed);
    if (placed.length === 2) {
      const [a, b] = placed.sort((x, y) => x.length - y.length);
      const expr = `${a.length} + ${b.length} = 10`;
      setEquation(expr);
      onTelemetryChange?.({
        kind: "discovery",
        textZh: `恰好凑满 10 格 —— ${expr}`,
        textEn: `Exactly ten cells filled — ${expr}`,
        value: expr,
        at: Date.now(),
      });
      setFoundPairs((prev) =>
        prev.includes(expr) ? prev : [...prev, expr],
      );
    }

    return () => window.clearTimeout(timer);
  }, [filledCount, pieces, onTelemetryChange]);

  /* ── 谜题判定 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery" || gap === null) return;
    // 需要找出所有互补到 gap 的组合。
    const needed = MAKE_TEN_PAIRS.filter(
      ([a, b]) => a === gap || b === gap,
    ).map(([a, b]) => `${a} + ${b} = 10`);

    if (needed.length === 0) return;
    const allFound = needed.every((expr) => foundPairs.includes(expr));
    if (!allFound) return;

    onSolved?.(
      `全部组合都找到了：${needed.join("、")}`,
      `Every combination found: ${needed.join(", ")}`,
    );
    onTelemetryChange?.({
      kind: "success",
      textZh: `缺口 ${gap} 的所有凑十组合都拼出来了`,
      textEn: `Every way to complete ${gap} has been found`,
      value: needed.join(" | "),
      at: Date.now(),
    });
  }, [stage, gap, foundPairs, onSolved, onTelemetryChange]);

  const stageHint = useMemo(() => {
    if (isEn) {
      if (stage === "explore")
        return "Drag two number bars into the ten-frame. Watch them lock when they fill it exactly.";
      if (stage === "discover")
        return "Every time the frame fills, the matching addition fact writes itself out.";
      return "A gap is given. Find every way to complete ten with that gap — there is more than one.";
    }
    if (stage === "explore")
      return tw("把两根数字积木条拖进十格框。恰好填满时会有清脆的锁定感。");
    if (stage === "discover")
      return tw("每填满一次，右边就自动写出对应的加法算式。");
    return tw("给定一个缺口，找出所有能凑满十的组合——答案不止一个。");
  }, [stage, isEn, tw]);

  /** 谜题需要的组合。 */
  const neededPairs = useMemo(() => {
    if (stage !== "mystery" || gap === null) return [];
    return MAKE_TEN_PAIRS.filter(([a, b]) => a === gap || b === gap).map(
      ([a, b]) => `${a} + ${b} = 10`,
    );
  }, [stage, gap]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label={isEn ? "Make ten board" : tw("十格拼搭盘")}
          >
            <rect x={0} y={0} width={W} height={H} fill="#F8FAFC" />

            {/* 十格盘 */}
            <g>
              <rect
                x={BOARD_X - 8}
                y={BOARD_Y - 8}
                width={COLS * CELL + 16}
                height={ROWS * CELL + 16}
                rx={10}
                fill="#FFFFFF"
                stroke={flash ? "#C59B38" : "#0B162C"}
                strokeWidth={flash ? 3 : 1.6}
              />
              {Array.from({ length: ROWS * COLS }, (_, i) => {
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                return (
                  <rect
                    key={i}
                    x={BOARD_X + col * CELL}
                    y={BOARD_Y + row * CELL}
                    width={CELL}
                    height={CELL}
                    fill={occupied.has(i) ? "#EFF6FF" : "#F8FAFC"}
                    stroke="#CBD5E1"
                    strokeWidth={1}
                  />
                );
              })}
              {flash ? (
                <rect
                  x={BOARD_X - 14}
                  y={BOARD_Y - 14}
                  width={COLS * CELL + 28}
                  height={ROWS * CELL + 28}
                  rx={14}
                  fill="none"
                  stroke="#C59B38"
                  strokeWidth={2}
                  opacity={0.6}
                />
              ) : null}
            </g>

            <text x={BOARD_X} y={BOARD_Y - 18} fontSize={10.5} fill="#64748B">
              {isEn ? "Ten frame" : tw("十格盘")}
            </text>

            {/* 积木托盘 */}
            <text x={TRAY_X - 24} y={TRAY_Y - 16} fontSize={10.5} fill="#64748B">
              {isEn ? "Number bars" : tw("数字积木条")}
            </text>
            {pieces.map((p) => {
              const isDragging = dragId === p.id;
              const width = p.length * 17;
              return (
                <g
                  key={p.id}
                  {...drag.bind}
                  onPointerDown={(e) => {
                    setDragId(p.id);
                    drag.start(e);
                  }}
                  style={{ cursor: "grab" }}
                  opacity={isDragging ? 0.85 : 1}
                >
                  <rect
                    x={p.x - width / 2}
                    y={p.y - 10}
                    width={width}
                    height={20}
                    rx={5}
                    fill={p.placed ? "#1D4ED8" : "#0B162C"}
                    stroke={p.placed ? "#0B162C" : "#334155"}
                    strokeWidth={1}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    fontSize={10.5}
                    fill="#FFFFFF"
                    textAnchor="middle"
                    fontWeight={600}
                  >
                    {p.length}
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

          <FormulaBar highlight={filledCount === 10}>
            {equation ?? (isEn ? "make it exactly 10" : tw("恰好凑满 10"))}
          </FormulaBar>

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Frame" : tw("格子进度")}
            </p>
            <div className="mt-1.5 flex gap-1">
              {Array.from({ length: 10 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3 flex-1 rounded-sm transition-colors",
                    occupied.has(i) ? "bg-[#1D4ED8]" : "bg-[#E2E8F0]",
                  )}
                />
              ))}
            </div>
            <p className="mt-1.5 font-mono text-[13px] text-[#0F172A]">
              {filledCount} / 10
            </p>
          </div>

          {stage === "mystery" && neededPairs.length > 0 ? (
            <div className="rounded-lg border border-[#0B162C] bg-[#0B162C] p-3">
              <p className="text-[10px] font-medium tracking-[0.12em] text-white/60 uppercase">
                {isEn ? "Gap" : tw("缺口")}
              </p>
              <p className="mt-1 font-mono text-[20px] font-semibold text-[#C59B38]">
                {gap}
              </p>
              <ul className="mt-2 space-y-1">
                {neededPairs.map((expr) => {
                  const ok = foundPairs.includes(expr);
                  return (
                    <li
                      key={expr}
                      className="flex items-center gap-2 font-mono text-[11.5px]"
                    >
                      <span className={ok ? "text-[#C59B38]" : "text-white/40"}>
                        {ok ? "✓" : "○"}
                      </span>
                      <span className={ok ? "text-white" : "text-white/50"}>
                        {expr}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {stage === "discover" ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
              <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                {isEn ? "Facts found" : tw("已发现的算式")}
              </p>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11.5px] text-[#334155]">
                {foundPairs.length === 0 ? (
                  <li className="text-[#94A3B8]">
                    {isEn ? "none yet" : tw("还没有")}
                  </li>
                ) : (
                  foundPairs.map((expr) => <li key={expr}>{expr}</li>)
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
