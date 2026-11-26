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
 * 实验台 01-5 · 按十成组捆绑台
 * ==============================
 *
 * 玩法
 * ----
 *
 * 画布中散落着**二十余根独立的单位细棒**。学生把细棒一根根拖进
 * 中间的**捆绑圈**——当圈里凑满 10 根时：
 *
 * 1. 十根细棒**平滑聚合**成一根带深蓝箍环的「十位大棒」；
 * 2. 发出「咔哒」绑定反馈（视觉 + 数字读数跳变）；
 * 3. 右侧的「十位 | 个位」动态计数器实时联动。
 *
 * 学生由此真正理解：**为什么 14 是 1 捆十和 4 根一**。
 *
 * 谜题模式给出目标两位数（比如 23），要求用**最少的捆数与散根**
 * 精准拼出——也就是标准的位值分解。
 *
 * ⛔ 与 01-4 的区别：那里凑的是**组合**，这里绑的是**位值**。
 */

/** 画布尺寸。 */
const W = 620;
const H = 350;

/** 捆绑圈中心。 */
const BUNDLE_CX = 250;
const BUNDLE_CY = 178;
const BUNDLE_R = 74;

/** 细棒尺寸。 */
const STICK_W = 46;
const STICK_H = 7;

/** 散落细棒的初始位置——刻意散开。 */
const INITIAL_STICKS = 22;

/** 细棒散布位置（相对中心的偏移）。 */
function scatterOffset(i: number): { dx: number; dy: number } {
  const angle = (i * 2.399963) % (Math.PI * 2);
  const radius = 108 + ((i * 37) % 46);
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius * 0.72,
  };
}

/** 一根细棒。 */
interface Stick {
  id: number;
  x: number;
  y: number;
  /** 已绑成十位大棒。 */
  bundled: boolean;
  /** 属于第几捆。 */
  bundleId: number;
}

/** 捆内第 n 根的位置。 */
function stickInBundle(bundleId: number, index: number): { x: number; y: number } {
  const perRow = 5;
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const bundleOffset = bundleId * 0; // 所有捆叠在同一位置
  return {
    x: BUNDLE_CX - (perRow * (STICK_W + 5)) / 2 + col * (STICK_W + 5) + STICK_W / 2,
    y: BUNDLE_CY - 22 + row * (STICK_H + 5) + bundleOffset,
  };
}

export default function BundleOfTenLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const [sticks, setSticks] = useState<Stick[]>(() =>
    Array.from({ length: INITIAL_STICKS }, (_, i) => {
      const offset = scatterOffset(i);
      return {
        id: i,
        x: BUNDLE_CX + offset.dx,
        y: BUNDLE_CY + offset.dy,
        bundled: false,
        bundleId: -1,
      };
    }),
  );
  const [dragId, setDragId] = useState<number | null>(null);
  const [bundles, setBundles] = useState<number[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [loose, setLoose] = useState<number[]>([]);
  const [snapPulse, setSnapPulse] = useState(false);

  /** 捆内已有的细棒数。 */
  const inBundle = sticks.filter((s) => s.bundled).length;

  /** 未捆绑的细棒（散根）。 */
  const looseSticks = useMemo(
    () => sticks.filter((s) => !s.bundled),
    [sticks],
  );

  /* ── 谜题目标 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery") {
      setTarget(null);
      return;
    }
    setTarget(23);
  }, [stage]);

  /* ── 拖拽 ──────────────────────────────────────────────────── */

  const drag = useSvgDrag({
    onMove: (p) => {
      const id = dragId;
      if (id === null) return;
      setSticks((prev) =>
        prev.map((s) => (s.id === id ? { ...s, x: p.x, y: p.y } : s)),
      );
    },
    onEnd: (p) => {
      const id = dragId;
      setDragId(null);
      if (id === null) return;

      const inCircle =
        Math.hypot(p.x - BUNDLE_CX, p.y - BUNDLE_CY) <= BUNDLE_R;

      setSticks((prev) => {
        const stick = prev.find((s) => s.id === id);
        if (!stick) return prev;

        if (!inCircle) {
          // 拖出去了——如果它本来已捆绑，就解除捆绑。
          if (stick.bundled) {
            const rest = prev.filter((s) => s.bundled && s.bundleId === stick.bundleId && s.id !== id);
            // 该捆剩下的细棒回到散落状态。
            const freed = rest.map((s) => ({
              ...s,
              bundled: false,
              bundleId: -1,
              x: BUNDLE_CX + scatterOffset(s.id).dx,
              y: BUNDLE_CY + scatterOffset(s.id).dy,
            }));
            setBundles((b) => b.filter((bid) => bid !== stick.bundleId));
            return prev.map((s) =>
              s.id === id
                ? { ...s, bundled: false, bundleId: -1, x: p.x, y: p.y }
                : freed.find((f) => f.id === s.id) ?? s,
            );
          }
          return prev.map((s) => (s.id === id ? { ...s, x: p.x, y: p.y } : s));
        }

        // 放进圈里——落在圈内的空位上。
        const taken = new Set(
          prev
            .filter((s) => s.bundled)
            .map((s) => `${s.bundleId}:${s.id}`),
        );
        void taken;

        const slot = prev.filter((s) => s.bundled).length;
        const position = stickInBundle(0, slot);
        return prev.map((s) =>
          s.id === id
            ? { ...s, bundled: true, bundleId: 0, x: position.x, y: position.y }
            : s,
        );
      });
    },
  });

  /* ── 满 10 → 绑定成一捆 ────────────────────────────────────── */

  useEffect(() => {
    if (inBundle !== 10) return;

    setSnapPulse(true);
    const timer = window.setTimeout(() => setSnapPulse(false), 900);

    setBundles((prev) => {
      if (prev.length > 0) return prev;
      setSticks((cur) =>
        cur.map((s) =>
          s.bundled ? { ...s, bundleId: 1 } : s,
        ),
      );
      return [...prev, 1];
    });

    onTelemetryChange?.({
      kind: "discovery",
      textZh: "咔哒——10 根细棒绑定成了一捆十位大棒",
      textEn: "Click — ten singles bound into one bundle of ten",
      value: "1 bundle",
      at: Date.now(),
    });

    return () => window.clearTimeout(timer);
  }, [inBundle, onTelemetryChange]);

  /* ── 读数 ──────────────────────────────────────────────────── */

  const tens = bundles.length;
  const ones = looseSticks.length;
  const value = tens * 10 + ones;

  /* ── 谜题判定 ──────────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery" || target === null) return;
    if (value !== target) return;
    onSolved?.(
      `拼出来了 —— ${tens} 捆十加 ${ones} 根一，正好是 ${target}`,
      `Done — ${tens} bundle${tens === 1 ? "" : "s"} of ten plus ${ones} one${ones === 1 ? "" : "s"} makes ${target}`,
    );
    onTelemetryChange?.({
      kind: "success",
      textZh: `${tens} 捆十 + ${ones} 根 = ${target}`,
      textEn: `${tens} ten${tens === 1 ? "" : "s"} + ${ones} one${ones === 1 ? "" : "s"} = ${target}`,
      value: `${tens} | ${ones}`,
      at: Date.now(),
    });
  }, [stage, target, value, tens, ones, onSolved, onTelemetryChange]);

  const stageHint = useMemo(() => {
    if (isEn) {
      if (stage === "explore")
        return "Drag ten singles into the circle. When the tenth lands they snap together into one bound bundle.";
      if (stage === "discover")
        return "Watch the counter on the right: every ten becomes one ten-place, and the rest stay as ones.";
      return "Build the target number using as few bundles as possible.";
    }
    if (stage === "explore")
      return tw("把细棒一根根拖进圈里，凑满 10 根就会「咔哒」绑定成一捆。");
    if (stage === "discover")
      return tw("盯住右边的计数器：每满十就进一位十，剩下的都是散根。");
    return tw("用尽可能少的捆数与散根，拼出目标数。");
  }, [stage, isEn, tw]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="relative min-h-[270px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label={isEn ? "Bundling bench" : tw("按十成组捆绑台")}
          >
            <rect x={0} y={0} width={W} height={H} fill="#F8FAFC" />

            {/* 捆绑圈 */}
            <circle
              cx={BUNDLE_CX}
              cy={BUNDLE_CY}
              r={BUNDLE_R}
              fill="#FFFFFF"
              stroke={snapPulse ? "#C59B38" : "#0B162C"}
              strokeWidth={snapPulse ? 3 : 1.8}
              strokeDasharray="6 4"
            />
            {snapPulse ? (
              <circle
                cx={BUNDLE_CX}
                cy={BUNDLE_CY}
                r={BUNDLE_R + 10}
                fill="none"
                stroke="#C59B38"
                strokeWidth={2}
                opacity={0.5}
              />
            ) : null}
            <text
              x={BUNDLE_CX}
              y={BUNDLE_CY + BUNDLE_R + 20}
              fontSize={10.5}
              fill="#64748B"
              textAnchor="middle"
            >
              {isEn ? "Bundling circle" : tw("捆绑圈")}
            </text>

            {/* 已成的捆 */}
            {tens > 0 ? (
              <g>
                {Array.from({ length: tens }, (_, b) => (
                  <g key={`bundle-${b}`}>
                    <rect
                      x={BUNDLE_CX - 70}
                      y={BUNDLE_CY - 30 + b * 14}
                      width={140}
                      height={11}
                      rx={5}
                      fill="#0B162C"
                    />
                    <rect
                      x={BUNDLE_CX - 72}
                      y={BUNDLE_CY - 32 + b * 14}
                      width={6}
                      height={15}
                      rx={2}
                      fill="#1D4ED8"
                    />
                    <rect
                      x={BUNDLE_CX + 66}
                      y={BUNDLE_CY - 32 + b * 14}
                      width={6}
                      height={15}
                      rx={2}
                      fill="#1D4ED8"
                    />
                    <text
                      x={BUNDLE_CX}
                      y={BUNDLE_CY - 21 + b * 14}
                      fontSize={8.5}
                      fill="#FFFFFF"
                      textAnchor="middle"
                      fontWeight={600}
                    >
                      10
                    </text>
                  </g>
                ))}
              </g>
            ) : null}

            {/* 散落细棒 */}
            {sticks.map((s) => {
              const isDragging = dragId === s.id;
              if (s.bundled && bundles.length > 0) return null;
              return (
                <g
                  key={s.id}
                  {...drag.bind}
                  onPointerDown={(e) => {
                    setDragId(s.id);
                    drag.start(e);
                  }}
                  style={{ cursor: "grab" }}
                  opacity={isDragging ? 0.85 : 1}
                >
                  <rect
                    x={s.x - STICK_W / 2}
                    y={s.y - STICK_H / 2}
                    width={STICK_W}
                    height={STICK_H}
                    rx={3}
                    fill={s.bundled ? "#1D4ED8" : "#C59B38"}
                    stroke="#0B162C"
                    strokeWidth={0.9}
                  />
                  <text
                    x={s.x}
                    y={s.y + 3}
                    fontSize={7}
                    fill="#0B162C"
                    textAnchor="middle"
                    fontWeight={700}
                  >
                    1
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 侧栏：位值计数器 */}
        <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "How it works" : tw("怎么玩")}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#334155]">
              {stageHint}
            </p>
          </div>

          {/* 十位 | 个位 计数器 */}
          <div className="rounded-lg border border-[#0B162C] bg-[#0B162C] p-3">
            <p className="text-[10px] font-medium tracking-[0.12em] text-white/60 uppercase">
              {isEn ? "Place value" : tw("位值计数器")}
            </p>
            <div className="mt-2 flex items-end justify-center gap-1.5">
              <div className="flex flex-col items-center">
                <span className="font-mono text-[28px] leading-none font-semibold text-[#C59B38]">
                  {tens}
                </span>
                <span className="mt-1 text-[9.5px] text-white/60">
                  {isEn ? "tens" : tw("十位")}
                </span>
              </div>
              <span className="pb-3 font-mono text-[20px] text-white/40">|</span>
              <div className="flex flex-col items-center">
                <span className="font-mono text-[28px] leading-none font-semibold text-white">
                  {ones}
                </span>
                <span className="mt-1 text-[9.5px] text-white/60">
                  {isEn ? "ones" : tw("个位")}
                </span>
              </div>
            </div>
            <p className="mt-2 border-t border-white/10 pt-2 text-center font-mono text-[15px] text-white">
              = {value}
            </p>
          </div>

          <FormulaBar highlight={stage === "mystery" && target !== null && value === target}>
            {isEn
              ? `${tens} tens + ${ones} ones = ${value}`
              : tw(`${tens} 捆十 + ${ones} 根一 = ${value}`)}
          </FormulaBar>

          {stage === "mystery" && target !== null ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
              <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                {isEn ? "Target" : tw("目标")}
              </p>
              <p className="mt-1 font-mono text-[20px] font-semibold text-[#0F172A]">
                {target}
              </p>
              <p className="mt-1 text-[11px] text-[#334155]">
                {isEn
                  ? `Minimal: ${Math.floor(target / 10)} bundle(s) + ${target % 10} one(s)`
                  : tw(`最少：${Math.floor(target / 10)} 捆十 + ${target % 10} 根一`)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
