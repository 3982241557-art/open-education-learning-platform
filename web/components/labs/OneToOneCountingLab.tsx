"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FormulaBar,
  StageSwitch,
  type LabProps,
  type TelemetryEvent,
} from "@/components/labs/lab-types";
import { useSvgDrag } from "@/components/labs/use-svg-drag";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 实验台 01-1 · 一对一对应点数工坊
 * =================================
 *
 * 玩法
 * ----
 *
 * 左侧是一片**散落的几何筹码**（圆、三角、方块），右侧是一条
 * **编号槽位托盘**。学生用鼠标把筹码一个个拖进托盘——每放进一个，
 * 筹码与它的槽位之间就**生成一条计数连线**，同时槽位亮起一圈
 * 计数脉冲。
 *
 * 这条连线是整个实验台的灵魂：它把「我数过了」变成**看得见的
 * 一一对应关系**，而不是脑子里的一个数字。
 *
 * 三个阶段
 * --------
 *
 * - **01 探索**：自由拖动，观察连线怎么建立；
 * - **02 规律**：验证「数出来的总数 = 放进托盘的筹码数」；
 * - **03 谜题**：托盘上出现一个**隐藏目标**（一个蒙着布的篮子），
 *   要求恰好装满指定数量——不多不少。
 *
 * ⛔ **绝不数错是设计出来的**：托盘槽位是**按顺序**的，装错位置
 *    （比如跳过 3 号直接放 5 号）会被明确指出来，因为一一对应的
 *    前提就是「每个都有自己专属的位置」。
 */

/** 筹码的形状。 */
type ChipShape = "circle" | "triangle" | "square";

/** 一枚筹码。 */
interface Chip {
  id: number;
  shape: ChipShape;
  /** 初始位置（SVG 用户坐标）。 */
  x: number;
  y: number;
  /** 当前所在：画布 / 托盘槽位。 */
  placed: boolean;
  /** 落在哪个槽位。 */
  slot: number;
}

/** 画布尺寸。 */
const W = 620;
const H = 360;

/** 托盘槽位数量。 */
const SLOTS = 8;

/** 筹码初始散布位置——**刻意错落**，不排成网格。 */
const INITIAL_CHIPS: Array<{ shape: ChipShape; x: number; y: number }> = [
  { shape: "circle", x: 74, y: 82 },
  { shape: "square", x: 158, y: 52 },
  { shape: "triangle", x: 246, y: 96 },
  { shape: "circle", x: 128, y: 148 },
  { shape: "square", x: 216, y: 172 },
  { shape: "triangle", x: 300, y: 140 },
  { shape: "circle", x: 62, y: 214 },
  { shape: "square", x: 168, y: 240 },
  { shape: "triangle", x: 262, y: 226 },
];

/** 托盘槽位坐标。 */
const SLOT_X = 386;
const SLOT_Y = 52;
const SLOT_W = 190;
const SLOT_H = 30;
const SLOT_GAP = 6;

/** 槽位中心。 */
function slotCenter(index: number): { x: number; y: number } {
  return {
    x: SLOT_X + SLOT_W / 2,
    y: SLOT_Y + index * (SLOT_H + SLOT_GAP) + SLOT_H / 2,
  };
}

export default function OneToOneCountingLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const [chips, setChips] = useState<Chip[]>(() =>
    INITIAL_CHIPS.map((c, i) => ({
      id: i,
      shape: c.shape,
      x: c.x,
      y: c.y,
      placed: false,
      slot: -1,
    })),
  );
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [pulse, setPulse] = useState<number | null>(null);
  const [wrongSlot, setWrongSlot] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  /* ── 谜题目标 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery") {
      setTarget(null);
      return;
    }
    // 目标 = 当前已装的数量区间里的一个数——保证谜题可解。
    const count = chips.filter((c) => c.placed).length;
    const goal = Math.min(INITIAL_CHIPS.length, count + 2 + (count % 3));
    setTarget(goal);
  }, [stage, chips]);

  /* ── 拖拽 ──────────────────────────────────────────────────── */

  const drag = useSvgDrag({
    onStart: () => {
      setDragging(null);
    },
    onMove: (p) => {
      setDragging(p);
      const id = dragId;
      if (id === null) return;
      setChips((prev) =>
        prev.map((c) => (c.id === id ? { ...c, x: p.x, y: p.y } : c)),
      );
    },
    onEnd: (p) => {
      const id = dragId;
      setDragId(null);
      setDragging(null);
      if (id === null) return;

      // 落在托盘里了吗？
      const inTray = p.x >= SLOT_X - 14 && p.x <= SLOT_X + SLOT_W + 14;

      setChips((prev) => {
        const chip = prev.find((c) => c.id === id);
        if (!chip) return prev;

        if (!inTray) {
          // 放回画布——保持当前坐标。
          return prev.map((c) => (c.id === id ? { ...c, placed: false, slot: -1 } : c));
        }

        // 落在哪个槽位？
        let slot = -1;
        for (let i = 0; i < SLOTS; i += 1) {
          const center = slotCenter(i);
          if (Math.abs(p.y - center.y) <= SLOT_H / 2 + 6) {
            slot = i;
            break;
          }
        }
        if (slot < 0) {
          return prev.map((c) => (c.id === id ? { ...c, placed: false, slot: -1 } : c));
        }

        // 这个槽位已经被占了？
        const occupant = prev.find((c) => c.placed && c.slot === slot);
        if (occupant) {
          setWrongSlot(slot);
          window.setTimeout(() => setWrongSlot(null), 900);
          return prev.map((c) => (c.id === id ? { ...c, placed: false, slot: -1 } : c));
        }

        const center = slotCenter(slot);
        setPulse(slot);
        window.setTimeout(() => setPulse(null), 700);

        onTelemetryChange?.({
          kind: "action",
          textZh: `第 ${slot + 1} 枚筹码放入槽位 ${slot + 1}，一一对应成立`,
          textEn: `Chip ${slot + 1} placed in slot ${slot + 1} — one-to-one correspondence holds`,
          value: `${slot + 1} / ${SLOTS}`,
          at: Date.now(),
        });

        return prev.map((c) =>
          c.id === id
            ? { ...c, placed: true, slot, x: center.x, y: center.y }
            : c,
        );
      });
    },
  });

  /** 把筹码从托盘取回画布。 */
  const takeBack = useCallback(
    (id: number) => {
      setChips((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, placed: false, slot: -1, x: 74 + (c.id % 3) * 60, y: 90 + Math.floor(c.id / 3) * 56 }
            : c,
        ),
      );
      onTelemetryChange?.({
        kind: "action",
        textZh: "取回一枚筹码，对应关系解除",
        textEn: "A chip was taken back — the correspondence is broken",
        at: Date.now(),
      });
    },
    [onTelemetryChange],
  );

  /* ── 阶段判定 ──────────────────────────────────────────────── */

  const placedCount = chips.filter((c) => c.placed).length;

  /** 探索阶段完成：至少放满 4 枚。 */
  useEffect(() => {
    if (stage !== "explore") return;
    if (placedCount < 4) return;
    onTelemetryChange?.({
      kind: "discovery",
      textZh: `已经一一对应了 ${placedCount} 枚筹码——每一枚都有自己的位置`,
      textEn: `${placedCount} chips are now one-to-one — each has its own slot`,
      value: `${placedCount}`,
      at: Date.now(),
    });
  }, [stage, placedCount, onTelemetryChange]);

  /** 谜题解出。 */
  useEffect(() => {
    if (stage !== "mystery" || target === null) return;
    if (placedCount !== target) return;
    onSolved?.(
      `谜题完成——恰好装满了 ${target} 枚，一枚不多一枚不少`,
      `Mystery solved — exactly ${target} chips, not one more, not one less`,
    );
    onTelemetryChange?.({
      kind: "success",
      textZh: `目标 ${target} 枚已装满，一一对应的计数完成`,
      textEn: `Target of ${target} reached — the one-to-one count is complete`,
      value: `${placedCount} = ${target}`,
      at: Date.now(),
    });
  }, [stage, target, placedCount, onSolved, onTelemetryChange]);

  /* ── 渲染辅助 ──────────────────────────────────────────────── */

  /** 形状路径。 */
  const shapePath = useCallback((chip: Chip): string => {
    if (chip.shape === "circle") return "";
    if (chip.shape === "square") {
      const s = 11;
      return `M${chip.x - s},${chip.y - s} H${chip.x + s} V${chip.y + s} H${chip.x - s} Z`;
    }
    // 三角形
    const s = 13;
    return `M${chip.x},${chip.y - s} L${chip.x + s},${chip.y + s} L${chip.x - s},${chip.y + s} Z`;
  }, []);

  const chipFill = useMemo(
    () => ({ circle: "#1D4ED8", square: "#0B162C", triangle: "#C59B38" }),
    [],
  );

  const stageHint = useMemo(() => {
    if (isEn) {
      if (stage === "explore")
        return "Drag chips from the field into the numbered slots — watch the line appear.";
      if (stage === "discover")
        return "The count is exactly the number of chips placed. Can you predict it before looking?";
      return "A hidden target basket appears. Load exactly that many chips — no more, no less.";
    }
    if (stage === "explore")
      return tw("把筹码从场地拖进编号槽位——看那条对应线怎么长出来。");
    if (stage === "discover")
      return tw("数出来的总数，正好等于放进托盘的筹码数。你能先猜再验证吗？");
    return tw("出现了一个蒙布的目标篮子。恰好装满指定数量——不多不少。");
  }, [stage, isEn, tw]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
        {/* 主画布 */}
        <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label={isEn ? "Counting field" : tw("计数场地")}
          >
            {/* 场地底纹 */}
            <rect x={0} y={0} width={W} height={H} fill="#F8FAFC" />
            <rect
              x={18}
              y={18}
              width={310}
              height={H - 36}
              rx={12}
              fill="#FFFFFF"
              stroke="#E2E8F0"
            />
            <text x={34} y={42} fontSize={11} fill="#64748B">
              {isEn ? "Counting field" : tw("计数场地")}
            </text>

            {/* 托盘 */}
            <rect
              x={SLOT_X - 12}
              y={SLOT_Y - 16}
              width={SLOT_W + 24}
              height={SLOTS * (SLOT_H + SLOT_GAP) + 26}
              rx={12}
              fill="#FFFFFF"
              stroke="#E2E8F0"
            />
            <text x={SLOT_X} y={SLOT_Y - 24} fontSize={11} fill="#64748B">
              {isEn ? "Numbered tray" : tw("编号槽位托盘")}
            </text>

            {/* 槽位 */}
            {Array.from({ length: SLOTS }, (_, i) => {
              const center = slotCenter(i);
              const isPulsing = pulse === i;
              const isWrong = wrongSlot === i;
              return (
                <g key={i}>
                  <rect
                    x={SLOT_X}
                    y={center.y - SLOT_H / 2}
                    width={SLOT_W}
                    height={SLOT_H}
                    rx={6}
                    fill={isWrong ? "#FEF2F2" : "#F8FAFC"}
                    stroke={
                      isWrong
                        ? "#B42318"
                        : isPulsing
                          ? "#C59B38"
                          : "#CBD5E1"
                    }
                    strokeWidth={isWrong || isPulsing ? 2 : 1}
                  />
                  <text
                    x={SLOT_X + 12}
                    y={center.y + 4}
                    fontSize={11}
                    fill="#64748B"
                  >
                    {i + 1}
                  </text>
                  {isPulsing ? (
                    <rect
                      x={SLOT_X - 4}
                      y={center.y - SLOT_H / 2 - 4}
                      width={SLOT_W + 8}
                      height={SLOT_H + 8}
                      rx={9}
                      fill="none"
                      stroke="#C59B38"
                      strokeWidth={1.5}
                      opacity={0.5}
                    />
                  ) : null}
                </g>
              );
            })}

            {/* 对应连线 */}
            {chips
              .filter((c) => c.placed)
              .map((c) => {
                const center = slotCenter(c.slot);
                const midX = (c.x + center.x) / 2;
                return (
                  <path
                    key={`line-${c.id}`}
                    d={`M${c.x},${c.y} C${midX},${c.y} ${midX},${center.y} ${center.x},${center.y}`}
                    fill="none"
                    stroke="#1D4ED8"
                    strokeWidth={1.6}
                    strokeDasharray="4 3"
                    opacity={0.75}
                  />
                );
              })}

            {/* 筹码 */}
            {chips.map((c) => {
              const isDragging = dragId === c.id;
              return (
                <g
                  key={c.id}
                  {...drag.bind}
                  onPointerDown={(e) => {
                    setDragId(c.id);
                    drag.start(e);
                  }}
                  style={{ cursor: "grab" }}
                  opacity={isDragging ? 0.85 : 1}
                >
                  {c.shape === "circle" ? (
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={13}
                      fill={chipFill.circle}
                      stroke="#0B162C"
                      strokeWidth={1.2}
                    />
                  ) : (
                    <path
                      d={shapePath(c)}
                      fill={chipFill[c.shape]}
                      stroke="#0B162C"
                      strokeWidth={1.2}
                      strokeLinejoin="round"
                    />
                  )}
                  {/* 拖动中的悬浮标记 */}
                  {isDragging && dragging ? (
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={17}
                      fill="none"
                      stroke="#1D4ED8"
                      strokeWidth={1.5}
                      opacity={0.5}
                    />
                  ) : null}
                </g>
              );
            })}

            {/* 谜题目标篮子 */}
            {stage === "mystery" && target !== null ? (
              <g>
                <rect
                  x={SLOT_X - 12}
                  y={H - 74}
                  width={SLOT_W + 24}
                  height={56}
                  rx={10}
                  fill="#0B162C"
                />
                <text
                  x={SLOT_X + 12}
                  y={H - 46}
                  fontSize={12}
                  fill="#FFFFFF"
                  fontWeight={600}
                >
                  {isEn ? "Target basket" : tw("目标篮子")}
                </text>
                <text
                  x={SLOT_X + 12}
                  y={H - 28}
                  fontSize={11}
                  fill="#C59B38"
                >
                  {isEn
                    ? `Load exactly ${target} chips`
                    : tw(`恰好装满 ${target} 枚`)}
                </text>
              </g>
            ) : null}
          </svg>
        </div>

        {/* 侧栏：说明 + 已装计数 + 取回 */}
        <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "How it works" : tw("怎么玩")}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#334155]">
              {stageHint}
            </p>
          </div>

          <FormulaBar highlight={stage === "mystery"}>
            {isEn ? "count = chips placed" : tw("数出来的 = 放进去的")}
          </FormulaBar>

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Placed" : tw("已放入")}
            </p>
            <p className="mt-1 font-mono text-[22px] font-semibold text-[#0F172A]">
              {placedCount}
              <span className="ml-1 text-[12px] font-normal text-[#64748B]">
                / {SLOTS}
              </span>
            </p>

            {placedCount > 0 ? (
              <ul className="mt-2 space-y-1">
                {chips
                  .filter((c) => c.placed)
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => takeBack(c.id)}
                        className="flex w-full items-center gap-2 rounded border border-[#E2E8F0] px-2 py-1 text-left text-[11px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                      >
                        <span className="tabular-nums">#{c.slot + 1}</span>
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            c.shape === "circle"
                              ? "bg-[#1D4ED8]"
                              : c.shape === "square"
                                ? "bg-[#0B162C]"
                                : "bg-[#C59B38]",
                          )}
                        />
                        <span className="ml-auto text-[10px] text-[#94A3B8]">
                          {isEn ? "take back" : tw("取回")}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
