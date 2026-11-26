"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coordinates,
  Line,
  MovablePoint,
  Plot,
  Point,
  Polyline,
  Mafs,
} from "mafs";
import {
  FormulaBar,
  StageSwitch,
  type LabProps,
  type TelemetryEvent,
} from "@/components/labs/lab-types";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 王牌实验台 3 · 实时曲线与斜率函数实验室
 * ==========================================
 *
 * 引擎：**Mafs**（MIT，https://github.com/betodealmeida/mafs）
 *
 * 真实丝滑拖拽感
 * --------------
 *
 * 高颜值蓝白黑交互式笛卡尔坐标系。支持鼠标**直接抓住直线上的两个
 * 控制点**（或抛物线的顶点与开口控制点）来回拖拽。
 *
 * ⛔ 不是「拖一个滑块改改 k」——``MovablePoint`` 就是直线上的
 *    真实点，抓住它拖，曲线跟着动，斜率与截距实时重算。
 *
 * 实时联动
 * --------
 *
 * 解析式 ``y = kx + b``、``y = a(x-h)^2 + k``、斜率三角形
 * （``Δy / Δx`` 动态虚线阶梯）与零点坐标 60fps 实时联动。
 *
 * 三段玩法
 * --------
 *
 * - **探索**：手拖曲线感知 k, b, a, h 如何控制平移、翻转与陡缓；
 * - **规律**：完成「让直线穿过指定两点」的互动验证；
 * - **谜题**：画布上出现一条虚线「神秘目标轨迹」，隐藏公式，学生
 *   必须调节出完全重合的实线函数才能通关。
 */

/** 曲线类型。 */
type CurveKind = "line" | "quadratic";

export default function FunctionStudioLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  // 直线：两点
  const [p1, setP1] = useState<[number, number]>([-3, -1]);
  const [p2, setP2] = useState<[number, number]>([2, 3]);

  // 抛物线：顶点 + 开口
  const [vertex, setVertex] = useState<[number, number]>([0, 0]);
  const [aValue, setAValue] = useState(1);

  const [kind, setKind] = useState<CurveKind>("line");

  const [mystery, setMystery] = useState<{
    k: number;
    b: number;
    answer: string;
    solved: boolean;
  }>({ k: 0, b: 0, answer: "", solved: false });

  const [challenge, setChallenge] = useState<{
    points: Array<[number, number]>;
    done: boolean;
  }>({ points: [], done: false });

  const lastTelemetry = useRef<string>("");
  const push = useCallback(
    (kind_: TelemetryEvent["kind"], zh: string, en: string, value?: string) => {
      const key = `${kind_}:${zh}`;
      if (lastTelemetry.current === key) return;
      lastTelemetry.current = key;
      onTelemetryChange?.({ kind: kind_, textZh: zh, textEn: en, value, at: Date.now() });
    },
    [onTelemetryChange],
  );

  /* ── 画布高度测量 ──────────────────────────────────────────────
     Mafs 的 ``height`` 只接受数字（不支持 "auto"）。所以这里用
     ResizeObserver 量出容器高度，再喂给它。 */
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [canvasHeight, setCanvasHeight] = useState(420);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const measure = () => {
      const h = host.clientHeight;
      if (h > 0) setCanvasHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  /* ── 派生量 ─────────────────────────────────────────────────── */

  const slope = useMemo(() => {
    if (p2[0] === p1[0]) return 0;
    return (p2[1] - p1[1]) / (p2[0] - p1[0]);
  }, [p1, p2]);

  const intercept = useMemo(() => p1[1] - slope * p1[0], [p1, slope]);

  /** 直线的零点。 */
  const root = useMemo(() => {
    if (Math.abs(slope) < 1e-6) return null;
    return -intercept / slope;
  }, [slope, intercept]);

  /** 抛物线的实根。 */
  const quadRoots = useMemo(() => {
    const disc = aValue * aValue - 4 * aValue * vertex[1];
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    const denom = 2 * aValue;
    return [(sq - vertex[0] * aValue * 2) / denom, (-sq - vertex[0] * aValue * 2) / denom];
  }, [aValue, vertex]);

  /* ── 遥测：拖动 → 实时推送 ─────────────────────────────────── */

  useEffect(() => {
    if (stage !== "explore") return;
    if (kind === "line") {
      push(
        "action",
        `当前直线斜率 k=${slope.toFixed(2)}，截距 b=${intercept.toFixed(2)}`,
        `Current line: slope k=${slope.toFixed(2)}, intercept b=${intercept.toFixed(2)}`,
        `k=${slope.toFixed(2)}`,
      );
    } else {
      push(
        "action",
        `当前抛物线 a=${aValue.toFixed(2)}，顶点 (${vertex[0].toFixed(1)}, ${vertex[1].toFixed(1)})`,
        `Current parabola: a=${aValue.toFixed(2)}, vertex (${vertex[0].toFixed(1)}, ${vertex[1].toFixed(1)})`,
        `a=${aValue.toFixed(2)}`,
      );
    }
  }, [kind, slope, intercept, aValue, vertex, stage, push]);

  /* ── 阶段切换 ───────────────────────────────────────────────── */

  useEffect(() => {
    if (stage === "mystery") {
      const k = Math.round((Math.random() * 8 - 4) * 10) / 10;
      const b = Math.round((Math.random() * 8 - 4) * 10) / 10;
      setMystery({ k, b, answer: "", solved: false });
      setKind("line");
      push(
        "action",
        "谜题模式：画布上出现一条虚线「神秘目标轨迹」，公式已隐藏",
        "Mystery mode: a dashed target trajectory has appeared — its formula is hidden",
      );
    }
    if (stage === "discover") {
      setChallenge({ points: [[-2, 1], [3, -2]], done: false });
      setKind("line");
      push(
        "action",
        "规律任务：调节直线，使它穿过指定的两个点",
        "Discover task: adjust the line so it passes through the two given points",
      );
    }
  }, [stage, push]);

  /* ── 规律任务验证 ───────────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "discover" || challenge.done || challenge.points.length === 0) return;
    const onLine = (p: [number, number]) =>
      Math.abs(slope * p[0] + intercept - p[1]) < 0.12;
    if (challenge.points.every(onLine)) {
      setChallenge((c) => ({ ...c, done: true }));
      push(
        "success",
        "规律验证成功：直线已穿过指定的两个点",
        "Discover verified — your line now passes through both given points",
      );
    }
  }, [stage, challenge, slope, intercept, push]);

  /* ── 提交谜题答案 ───────────────────────────────────────────── */

  const submitMystery = () => {
    const value = Number(mystery.answer);
    if (!Number.isFinite(value)) return;
    // 容差：斜率 ±0.15，截距 ±0.4
    if (
      Math.abs(slope - mystery.k) <= 0.15 &&
      Math.abs(intercept - mystery.b) <= 0.4
    ) {
      setMystery((m) => ({ ...m, solved: true }));
      push(
        "success",
        `谜题模式已成功重合目标轨迹：y = ${mystery.k.toFixed(1)}x + ${mystery.b.toFixed(1)}`,
        `Mystery solved — your line matches y = ${mystery.k.toFixed(1)}x + ${mystery.b.toFixed(1)}`,
        `k=${mystery.k}`,
      );
      onSolved?.(
        `谜题模式已成功重合目标轨迹`,
        `Mystery solved — your line matches the target`,
      );
    } else {
      push(
        "hint",
        "还没有重合。请观察虚线的走向与高低，调整斜率 k 与截距 b",
        "Not aligned yet. Study the dashed line's direction and height, then adjust k and b",
      );
    }
  };

  /* ── 斜率三角形（Δy / Δx 虚线阶梯） ────────────────────────── */

  const slopeTriangle = useMemo(() => {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const width = Math.min(Math.abs(dx), 3);
    const height = (dy / (dx || 1)) * width;
    const xDir = dx >= 0 ? 1 : -1;
    const cornerX = p1[0] + width * xDir;
    const cornerY = p1[1];
    const topY = p1[1] + height;
    return {
      points: [
        p1,
        [cornerX, cornerY] as [number, number],
        [cornerX, topY] as [number, number],
      ] as Array<[number, number]>,
    };
  }, [p1, p2]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 解析式 */}
      <FormulaBar highlight={kind === "line" && Math.abs(slope) > 0.01}>
        {kind === "line" ? (
          <div className="text-[19px] leading-tight">
            y = {slope.toFixed(2)}x + {intercept.toFixed(2)}
            <span className="ml-4 font-mono text-[12px] text-[#64748B]">
              Δy/Δx = {(p2[1] - p1[1]).toFixed(2)} / {(p2[0] - p1[0]).toFixed(2)}
            </span>
            <span className="ml-3 text-[12px] text-[#64748B]">
              {root !== null
                ? `${isEn ? "root" : tw("零点")} x = ${root.toFixed(2)}`
                : isEn
                  ? "no root"
                  : tw("无零点")}
            </span>
          </div>
        ) : (
          <div className="text-[19px] leading-tight">
            y = {aValue.toFixed(2)}(x − {vertex[0].toFixed(2)})² + {vertex[1].toFixed(2)}
            <span className="ml-4 text-[12px] text-[#64748B]">
              {quadRoots.length > 0
                ? `${isEn ? "roots" : tw("零点")} x = ${quadRoots.map((r) => r.toFixed(2)).join(", ")}`
                : isEn
                  ? "no real root"
                  : tw("无实根")}
            </span>
          </div>
        )}
      </FormulaBar>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-3 lg:grid-cols-[1fr_210px] lg:grid-rows-1">
        {/* Mafs 画布 */}
        <div
          ref={canvasHostRef}
          className="relative min-h-[240px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white"
        >
          <Mafs
            width="auto"
            height={canvasHeight}
            pan
            zoom={{ min: 0.4, max: 4 }}
            viewBox={{ x: [-6, 6] as [number, number], y: [-4, 4] as [number, number] }}
          >
            <Coordinates.Cartesian />

            {kind === "line" ? (
              <>
                {/* 神秘目标轨迹（谜题模式） */}
                {stage === "mystery" ? (
                  <Line.ThroughPoints
                    point1={[0, mystery.b]}
                    point2={[1, mystery.k + mystery.b]}
                    color="#C59B38"
                    style="dashed"
                    weight={2.5}
                  />
                ) : null}

                {/* 斜率三角形（Δy / Δx 动态虚线阶梯） */}
                <Polyline
                  points={slopeTriangle.points}
                  color="#1D4ED8"
                  weight={1.2}
                  fillOpacity={0}
                />

                {/* 直线 */}
                <Line.ThroughPoints
                  point1={p1}
                  point2={p2}
                  color="#1D4ED8"
                  weight={2.5}
                />

                {/* 两个可拖控制点 */}
                <MovablePoint
                  point={p1}
                  color="#1D4ED8"
                  onMove={([x, y]) => setP1([x, y])}
                />
                <MovablePoint
                  point={p2}
                  color="#1D4ED8"
                  onMove={([x, y]) => setP2([x, y])}
                />
              </>
            ) : (
              <>
                {/* 抛物线 */}
                <Plot.OfX
                  y={(x: number) => aValue * (x - vertex[0]) ** 2 + vertex[1]}
                  domain={[-6, 6]}
                  color="#1D4ED8"
                  weight={2.5}
                />

                {/* 顶点 */}
                <MovablePoint
                  point={vertex}
                  color="#1D4ED8"
                  onMove={([x, y]) => setVertex([x, y])}
                />

                {/* 开口控制点 —— 拖它改变 a */}
                <MovablePoint
                  point={[vertex[0] + 1, aValue + vertex[1]]}
                  color="#C59B38"
                  onMove={([x, y]) => {
                    const na = y - vertex[1];
                    if (Math.abs(na) > 0.01) setAValue(na);
                  }}
                />
                <Point
                  x={vertex[0] + 1}
                  y={aValue + vertex[1]}
                  color="#C59B38"
                />
              </>
            )}
          </Mafs>
        </div>

        {/* 侧栏 */}
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5">
            <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Curve type" : tw("曲线类型")}
            </p>
            <div className="space-y-1">
              {(["line", "quadratic"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    "w-full rounded border px-2 py-1.5 text-left text-[11.5px] transition-colors",
                    kind === k
                      ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                      : "border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]",
                  )}
                >
                  {k === "line"
                    ? isEn
                      ? "Straight line"
                      : tw("直线 y = kx + b")
                    : isEn
                      ? "Parabola"
                      : tw("抛物线 y = a(x−h)² + k")}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5">
            <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "How to use" : tw("怎么用")}
            </p>
            <ul className="space-y-1 text-[11px] leading-relaxed text-[#334155]">
              <li>
                •{" "}
                {kind === "line"
                  ? isEn
                    ? "Drag the two blue points — the line follows"
                    : tw("拖动两个蓝色控制点——直线跟着动")
                  : isEn
                    ? "Drag the blue vertex and the gold opening point"
                    : tw("拖动蓝色顶点与金色开口点")}
              </li>
              <li>• {isEn ? "Watch k, b, root update live" : tw("观察 k、b、零点实时联动")}</li>
              <li>• {isEn ? "Scroll to zoom, drag to pan" : tw("滚轮缩放，拖动平移")}</li>
            </ul>
          </div>

          {stage === "discover" && challenge.points.length > 0 ? (
            <div
              className={cn(
                "rounded-lg border p-2.5",
                challenge.done
                  ? "border-[#1D4ED8] bg-[#EFF6FF]"
                  : "border-[#E2E8F0] bg-white",
              )}
            >
              <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                {isEn ? "Task" : tw("任务")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#334155]">
                {isEn
                  ? `Make the line pass through (${challenge.points[0][0]}, ${challenge.points[0][1]}) and (${challenge.points[1][0]}, ${challenge.points[1][1]}).`
                  : tw(`调节直线，使它穿过 (${challenge.points[0][0]}, ${challenge.points[0][1]}) 与 (${challenge.points[1][0]}, ${challenge.points[1][1]})。`)}
              </p>
              {challenge.done ? (
                <p className="mt-1.5 text-[11px] font-medium text-[#1D4ED8]">
                  {isEn ? "Verified!" : tw("验证通过！")}
                </p>
              ) : null}
            </div>
          ) : null}

          {stage === "mystery" ? (
            <div className="rounded-lg border border-[#C59B38] bg-[#FDF8EC] p-2.5">
              <p className="text-[10px] font-medium tracking-[0.12em] text-[#8A6A20] uppercase">
                {isEn ? "Match the target" : tw("重合目标轨迹")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#8A6A20]">
                {isEn
                  ? "The dashed line is the target. Its formula is hidden — match it exactly."
                  : tw("金色虚线是目标轨迹，公式已隐藏——请调出完全重合的实线。")}
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  value={mystery.answer}
                  onChange={(e) => setMystery((m) => ({ ...m, answer: e.target.value }))}
                  placeholder="k"
                  className="h-8 min-w-0 flex-1 rounded border border-[#E8D9AE] bg-white px-2 text-[12px] text-[#0F172A] outline-none focus:border-[#C59B38]"
                />
                <button
                  type="button"
                  onClick={submitMystery}
                  className="h-8 rounded bg-[#C59B38] px-2.5 text-[11.5px] font-medium text-white"
                >
                  {isEn ? "Check" : tw("验证")}
                </button>
              </div>
              {mystery.solved ? (
                <p className="mt-1.5 text-[11px] font-medium text-[#8A6A20]">
                  {isEn ? "Perfect match!" : tw("完全重合！")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />
    </div>
  );
}
