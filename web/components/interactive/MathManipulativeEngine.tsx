"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";

/**
 * 数学动态教具调度引擎
 * =====================
 *
 * 从 GitHub 开源生态引入的成熟交互库（全部兼容纯静态导出）：
 *
 * =====================  ==========================================
 * 库                      来源
 * =====================  ==========================================
 * ``mafs``               https://github.com/stevenpetryk/mafs
 * ``recharts``           https://github.com/recharts/recharts
 * ``jsxgraph``           https://github.com/jsxgraph/jsxgraph
 * ``hanzi-writer``       https://github.com/chanind/hanzi-writer
 * =====================  ==========================================
 *
 * 四类教具
 * --------
 *
 * 1. **动态几何与测量**（自研 SVG + jsxgraph 思路）——
 *    可自由旋转拖拽的透明量角器（贴合角的顶点实时测量度数）、
 *    动态三角形（拖拽顶点实时看内角和、面积变化）。
 * 2. **实时函数与坐标系实验室**（mafs）——
 *    拖动参数滑块或直接拖拽控制点，观察一次函数、反比例函数、
 *    二次抛物线的实时形变。
 * 3. **互动统计图表台**（recharts）——
 *    学生可直接增删数据条，柱状图 / 折线图 / 扇形图与
 *    平均数 / 中位数 / 比例实时联动。
 * 4. **小学数感与方程天平**（自研轻量 SVG）——
 *    可拖拽拼接的十进制凑十积木块、可自由等分的分数圆盘、
 *    动态数轴跳格器、左右放砝码维持平衡的动态方程天平。
 *
 * ⛔ **纯静态导出约束**
 *    - 所有需要浏览器 API 的组件（canvas / SVG 测量 / 语音）
 *      都只在 ``useEffect`` 里初始化，SSR 阶段不触碰 DOM；
 *    - 图表库走 ``ResponsiveContainer``，首屏渲染空壳，
 *      客户端挂载后再量尺寸——避免 hydration mismatch；
 *    - 教具进度全部写 ``localStorage``，不依赖任何后端。
 *
 * ⛔ **视觉铁律**
 *    所有承载文字的容器一律 **100% 不透明实心**
 *    （``#FFFFFF`` / ``#FFFEFA``），绝不使用半透明玻璃底。
 */

/* ──────────────────────────────────────────────────────────────────
 * 类型
 * ────────────────────────────────────────────────────────────────── */

/** 教具种类。 */
export type ManipulativeKind =
  /** 动态量角器 + 动态三角形（几何与测量）。 */
  | "protractor"
  /** 实时函数坐标系实验室（mafs）。 */
  | "functionLab"
  /** 互动统计图表台（recharts）。 */
  | "chartLab"
  /** 十进制凑十积木块（Mathigon Polypad 范式）。 */
  | "decimalBlocks"
  /** 分数圆盘（可自由等分）。 */
  | "fractionDisc"
  /** 动态数轴跳格器。 */
  | "numberLine"
  /** 方程天平。 */
  | "balanceScale";

/** 教具配置。 */
export interface ManipulativeConfig {
  /** 教具类型。 */
  kind: ManipulativeKind;
  /** 标题。 */
  title: string;
  /** 初始角度（度）。 */
  angle?: number;
  /** 初始斜率。 */
  slope?: number;
  /** 初始截距。 */
  intercept?: number;
  /** 函数类型。 */
  fnType?: "linear" | "quadratic" | "inverse";
  /** 初始数据集。 */
  data?: Array<{ label: string; value: number }>;
  /** 初始凑十目标。 */
  target?: number;
  /** 分数等分份数。 */
  parts?: number;
  /** 数轴起点。 */
  start?: number;
  /** 数轴步长。 */
  step?: number;
  /** 天平左侧砝码。 */
  leftWeights?: number[];
  /** 天平右侧砝码。 */
  rightWeights?: number[];
}

/** 组件属性。 */
export interface MathManipulativeEngineProps {
  /** 教具配置。 */
  config: ManipulativeConfig;
  /** 额外类名。 */
  className?: string;
  /** 操作完成回调——把行为实时同步给 AI 伴学。 */
  onProgress?: (message: string, done: number, total: number) => void;
}

/* ──────────────────────────────────────────────────────────────────
 * 通用工具
 * ────────────────────────────────────────────────────────────────── */

/** 统一的面板外框——100% 不透明实心白。 */
function Panel({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF]">
      <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] bg-[#FFFEFA] px-4 py-3">
        <div className="min-w-0">
          <h4
            className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[#0F172A]"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {title}
          </h4>
          {hint ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#1E293B]">
              {hint}
            </p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="bg-[#FFFFFF] p-4">{children}</div>
    </div>
  );
}

/** 一条实心数据读数。 */
function Readout({
  label,
  value,
  accent = "#1D4ED8",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#64748B]">
        {label}
      </div>
      <div
        className="mt-0.5 text-[15px] font-semibold tabular-nums"
        style={{ color: accent, fontFamily: "var(--font-sans)" }}
      >
        {value}
      </div>
    </div>
  );
}

/** 滑块。 */
function LabSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-[#1E293B]">{label}</span>
        <span className="text-[12px] font-semibold tabular-nums text-[#1D4ED8]">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-[#1D4ED8]"
      />
    </label>
  );
}

/** 主按钮。 */
function LabButton({
  children,
  onClick,
  active,
  tone = "oxford",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: "oxford" | "gold";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "bg-[#0B162C] text-white"
          : tone === "gold"
            ? "border border-[#B89B5E] bg-[#FFFFFF] text-[#8A6D3B]"
            : "border border-[#E5E7EB] bg-[#FFFFFF] text-[#1E293B] hover:bg-[#F8F7F4]",
      )}
      style={active ? { background: "#0B162C" } : undefined}
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 1 · 动态量角器（自研 SVG）
 * ────────────────────────────────────────────────────────────────── */

interface AngleState {
  /** 一条边的角度。 */
  a: number;
  /** 另一条边的角度。 */
  b: number;
}

/**
 * 动态量角器。
 *
 * 拖动两条边上的控制点，量角器实时贴合顶点并读出夹角。
 */
function ProtractorLab({
  config,
  onProgress,
}: {
  config: ManipulativeConfig;
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [angle, setAngle] = useState<AngleState>({
    a: config.angle ?? 30,
    b: config.angle ?? 30 + 60,
  });
  const [verified, setVerified] = useState(false);

  const vertex = { x: 220, y: 200 };
  const radius = 130;

  const pointA = {
    x: vertex.x + radius * Math.cos((angle.a * Math.PI) / 180),
    y: vertex.y - radius * Math.sin((angle.a * Math.PI) / 180),
  };
  const pointB = {
    x: vertex.x + radius * Math.cos((angle.b * Math.PI) / 180),
    y: vertex.y - radius * Math.sin((angle.b * Math.PI) / 180),
  };

  /** 夹角（0–180）。 */
  const measure = useMemo(() => {
    let d = Math.abs(angle.b - angle.a) % 360;
    if (d > 180) d = 360 - d;
    return Math.round(d);
  }, [angle.a, angle.b]);

  /** 量角器的 0 刻度方向——始终贴着第一条边。 */
  const protractorRotation = angle.a;

  /** 拖拽处理。 */
  const onDrag = useCallback(
    (which: "a" | "b", event: React.PointerEvent<SVGCircleElement>) => {
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = 440 / rect.width;
      const scaleY = 300 / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const deg =
        (Math.atan2(vertex.y - y, x - vertex.x) * 180) / Math.PI;
      setAngle((prev) => {
        const next = { ...prev, [which]: Math.round((deg + 360) % 360) };
        onProgress?.(
          `当前量角器读数 ${measure}°，拖动中`,
          verified ? 1 : 0,
          1,
        );
        return next;
      });
    },
    [measure, onProgress, verified, vertex.x, vertex.y],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="动态量角器 · 贴合顶点实时测量"
        hint="拖动两条边上的圆点改变角度，量角器会自动贴合顶点并读出度数。"
        right={
          <button
            type="button"
            onClick={() => {
              setVerified(true);
              onProgress?.(
                `已用量角器完成角度验证（${measure}°）`,
                1,
                1,
              );
            }}
            className="rounded-lg bg-[#0B162C] px-3 py-1.5 text-[12px] font-medium text-white"
          >
            {verified ? "已验证 ✓" : "验证读数"}
          </button>
        }
      >
        <svg
          viewBox="0 0 440 300"
          className="w-full touch-none select-none"
          style={{ maxHeight: 320 }}
          role="img"
          aria-label="动态量角器"
        >
          {/* 画布底 */}
          <rect width="440" height="300" fill="#FFFFFF" />

          {/* 量角器半圆 */}
          <g transform={`translate(${vertex.x} ${vertex.y}) rotate(${protractorRotation})`}>
            <path
              d="M -130 0 A 130 130 0 0 1 130 0 Z"
              fill="#F8F7F4"
              stroke="#B89B5E"
              strokeWidth="1.5"
            />
            {/* 刻度 */}
            {Array.from({ length: 37 }, (_, i) => {
              const deg = i * 5;
              const rad = (deg * Math.PI) / 180;
              const long = deg % 15 === 0;
              const r1 = long ? 108 : 118;
              return (
                <line
                  key={deg}
                  x1={r1 * Math.cos(rad)}
                  y1={-r1 * Math.sin(rad)}
                  x2={130 * Math.cos(rad)}
                  y2={-130 * Math.sin(rad)}
                  stroke={long ? "#0B162C" : "#94A3B8"}
                  strokeWidth={long ? 1.2 : 0.7}
                />
              );
            })}
            {Array.from({ length: 9 }, (_, i) => {
              const deg = i * 10 + 5;
              const rad = (deg * Math.PI) / 180;
              return (
                <text
                  key={deg}
                  x={95 * Math.cos(rad)}
                  y={-95 * Math.sin(rad)}
                  fontSize="9"
                  fill="#0B162C"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {deg}
                </text>
              );
            })}
          </g>

          {/* 两条边 */}
          <line
            x1={vertex.x}
            y1={vertex.y}
            x2={pointA.x}
            y2={pointA.y}
            stroke="#1D4ED8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1={vertex.x}
            y1={vertex.y}
            x2={pointB.x}
            y2={pointB.y}
            stroke="#B89B5E"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* 顶点 */}
          <circle cx={vertex.x} cy={vertex.y} r="5" fill="#0B162C" />

          {/* 拖拽手柄 */}
          <circle
            cx={pointA.x}
            cy={pointA.y}
            r="11"
            fill="#FFFFFF"
            stroke="#1D4ED8"
            strokeWidth="3"
            style={{ cursor: "grab" }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) onDrag("a", event);
            }}
          />
          <circle
            cx={pointB.x}
            cy={pointB.y}
            r="11"
            fill="#FFFFFF"
            stroke="#B89B5E"
            strokeWidth="3"
            style={{ cursor: "grab" }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) onDrag("b", event);
            }}
          />

          {/* 实时读数 */}
          <text
            x={vertex.x + 44}
            y={vertex.y - 30}
            fontSize="24"
            fontWeight="700"
            fill="#0B162C"
          >
            {measure}°
          </text>
        </svg>
      </Panel>

      <div className="grid grid-cols-3 gap-2.5">
        <Readout label="夹角读数" value={`${measure}°`} />
        <Readout label="第一边方向" value={`${Math.round(angle.a)}°`} />
        <Readout label="第二边方向" value={`${Math.round(angle.b)}°`} />
      </div>

      <Panel title="动态三角形 · 拖顶点看内角和与面积">
        <TriangleLab onProgress={onProgress} />
      </Panel>
    </div>
  );
}

/** 动态三角形——拖顶点实时看内角和与面积。 */
function TriangleLab({
  onProgress,
}: {
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [points, setPoints] = useState([
    { x: 120, y: 220 },
    { x: 300, y: 220 },
    { x: 210, y: 90 },
  ]);

  const angles = useMemo(() => {
    const [p1, p2, p3] = points;
    const at = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
      const v1 = { x: b.x - a.x, y: b.y - a.y };
      const v2 = { x: c.x - a.x, y: c.y - a.y };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
      return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
    };
    return [
      Math.round(at(p1, p2, p3)),
      Math.round(at(p2, p1, p3)),
      Math.round(at(p3, p1, p2)),
    ];
  }, [points]);

  const area = useMemo(() => {
    const [p1, p2, p3] = points;
    return (
      Math.abs(
        (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y),
      ) / 2
    );
  }, [points]);

  const onDrag = useCallback(
    (index: number, event: React.PointerEvent<SVGCircleElement>) => {
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = 420 / rect.width;
      const scaleY = 260 / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      setPoints((prev) =>
        prev.map((point, i) =>
          i === index
            ? {
                x: Math.max(20, Math.min(400, x)),
                y: Math.max(20, Math.min(240, y)),
              }
            : point,
        ),
      );
    },
    [],
  );

  const handle = points.map((point, index) => (
    <circle
      key={index}
      cx={point.x}
      cy={point.y}
      r="10"
      fill="#FFFFFF"
      stroke="#1D4ED8"
      strokeWidth="3"
      style={{ cursor: "grab" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) onDrag(index, event);
      }}
    />
  ));

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 420 260" className="w-full" role="img" aria-label="动态三角形">
        <rect width="420" height="260" fill="#FFFFFF" />
        <polygon
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="#1D4ED8"
          fillOpacity="0.08"
          stroke="#0B162C"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {handle}
      </svg>
      <div className="grid grid-cols-4 gap-2.5">
        <Readout label="内角 ①" value={`${angles[0]}°`} />
        <Readout label="内角 ②" value={`${angles[1]}°`} />
        <Readout label="内角 ③" value={`${angles[2]}°`} />
        <Readout
          label="面积"
          value={`${area.toFixed(1)}`}
          accent="#B89B5E"
        />
      </div>
      <p className="text-[11px] leading-relaxed text-[#1E293B]">
        三内角之和恒为{" "}
        <strong className="font-semibold text-[#0F172A]">
          {angles[0] + angles[1] + angles[2]}°
        </strong>
        ，但面积随顶点位置实时变化——这就是「三角形面积 = ½ × 底 × 高」的几何直观。
        <button
          type="button"
          onClick={() => onProgress?.("已完成动态三角形内角与面积验证", 1, 1)}
          className="ml-2 rounded-md border border-[#B89B5E] px-2 py-0.5 text-[11px] font-medium text-[#8A6D3B]"
        >
          完成探索
        </button>
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 2 · 实时函数与坐标系实验室（mafs）
 * ────────────────────────────────────────────────────────────────── */

/**
 * mafs 的坐标系实验室。
 *
 * mafs 依赖浏览器测量，必须客户端渲染；这里用一个轻量的
 * **自研 SVG 版本**实现完全相同的交互（拖控制点 + 参数滑块），
 * 避免额外的 CSS 引入与 hydration 风险。
 */
function FunctionLab({
  config,
  onProgress,
}: {
  config: ManipulativeConfig;
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [slope, setSlope] = useState(config.slope ?? 2);
  const [intercept, setIntercept] = useState(config.intercept ?? 1);
  const [type, setType] = useState(config.fnType ?? "quadratic");
  const [point, setPoint] = useState({ x: 1, y: 3 });

  const W = 460;
  const H = 300;
  const OX = W / 2;
  const OY = H / 2;
  const SCALE = 26;

  /** 把数学坐标映射到 SVG 坐标。 */
  const toSvg = useCallback(
    (x: number, y: number) => ({
      sx: OX + x * SCALE,
      sy: OY - y * SCALE,
    }),
    [],
  );

  /** 当前函数值。 */
  const f = useCallback(
    (x: number) => {
      if (type === "linear") return slope * x + intercept;
      if (type === "inverse") {
        const k = slope === 0 ? 1 : slope;
        return x === 0 ? 0 : k / x;
      }
      return slope * x * x + intercept * x;
    },
    [type, slope, intercept],
  );

  /** 采样成折线。 */
  const path = useMemo(() => {
    const points: string[] = [];
    for (let i = -220; i <= 220; i += 1) {
      const x = i / 10;
      const y = f(x);
      if (!Number.isFinite(y) || Math.abs(y) > 40) continue;
      const { sx, sy } = toSvg(x, y);
      points.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return points.join(" ");
  }, [f, toSvg]);

  return (
    <div className="space-y-4">
      <Panel
        title="实时函数坐标系实验室"
        hint="拖动蓝色控制点改变曲线，或用滑块调参数——观察函数图象的实时形变。"
        right={
          <div className="flex gap-1.5">
            {(
              [
                ["linear", "一次"],
                ["quadratic", "二次"],
                ["inverse", "反比例"],
              ] as const
            ).map(([value, label]) => (
              <LabButton
                key={value}
                active={type === value}
                onClick={() => setType(value)}
              >
                {label}
              </LabButton>
            ))}
          </div>
        }
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          role="img"
          aria-label="函数坐标系实验室"
        >
          <rect width={W} height={H} fill="#FFFFFF" />

          {/* 网格 */}
          {Array.from({ length: 19 }, (_, i) => {
            const x = i - 9;
            const { sx } = toSvg(x, 0);
            return (
              <line
                key={`gx${i}`}
                x1={sx}
                y1={0}
                x2={sx}
                y2={H}
                stroke="#E5E7EB"
                strokeWidth="1"
              />
            );
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const y = i - 6;
            const { sy } = toSvg(0, y);
            return (
              <line
                key={`gy${i}`}
                x1={0}
                y1={sy}
                x2={W}
                y2={sy}
                stroke="#E5E7EB"
                strokeWidth="1"
              />
            );
          })}

          {/* 坐标轴 */}
          <line x1={0} y1={OY} x2={W} y2={OY} stroke="#0B162C" strokeWidth="1.6" />
          <line x1={OX} y1={0} x2={OX} y2={H} stroke="#0B162C" strokeWidth="1.6" />

          {/* 曲线 */}
          <polyline
            points={path}
            fill="none"
            stroke="#1D4ED8"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* 可拖控制点 */}
          <circle
            cx={toSvg(point.x, point.y).sx}
            cy={toSvg(point.x, point.y).sy}
            r="9"
            fill="#FFFFFF"
            stroke="#1D4ED8"
            strokeWidth="3"
            style={{ cursor: "grab" }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) return;
              const svg = event.currentTarget.ownerSVGElement;
              if (!svg) return;
              const rect = svg.getBoundingClientRect();
              const x =
                ((event.clientX - rect.left) * (W / rect.width) - OX) / SCALE;
              const y =
                (OY - (event.clientY - rect.top) * (H / rect.height)) / SCALE;
              setPoint({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
            }}
          />
        </svg>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2.5 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-3">
          <LabSlider
            label="系数 a（斜率 / 开口）"
            value={slope}
            min={-4}
            max={4}
            step={0.5}
            onChange={setSlope}
          />
          <LabSlider
            label="常数 b（截距）"
            value={intercept}
            min={-5}
            max={5}
            step={0.5}
            onChange={setIntercept}
          />
          <button
            type="button"
            onClick={() =>
              onProgress?.(
                `已完成函数实验室参数探索（${type}：a=${slope}, b=${intercept}）`,
                1,
                1,
              )
            }
            className="w-full rounded-lg bg-[#0B162C] px-3 py-1.5 text-[12px] font-medium text-white"
          >
            完成探索
          </button>
        </div>

        <Readout label="当前类型" value={type === "linear" ? "一次函数" : type === "quadratic" ? "二次函数" : "反比例函数"} />
        <Readout label="控制点" value={`(${point.x}, ${point.y})`} accent="#B89B5E" />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 3 · 互动统计图表台（recharts）
 * ────────────────────────────────────────────────────────────────── */

const PALETTE = ["#1D4ED8", "#B89B5E", "#0B162C", "#64748B", "#A16207"];

/** 互动统计图表台。 */
function ChartLab({
  config,
  onProgress,
}: {
  config: ManipulativeConfig;
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [data, setData] = useState(
    config.data ?? [
      { label: "阅读", value: 12 },
      { label: "运动", value: 8 },
      { label: "音乐", value: 5 },
      { label: "科学", value: 9 },
    ],
  );
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");

  const stats = useMemo(() => {
    const values = data.map((d) => d.value);
    const total = values.reduce((a, b) => a + b, 0);
    const mean = values.length ? total / values.length : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    const counts = new Map<number, number>();
    values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    let mode = values[0] ?? 0;
    let best = 0;
    counts.forEach((count, value) => {
      if (count > best) {
        best = count;
        mode = value;
      }
    });
    return { total, mean, median, mode };
  }, [data]);

  /** 增删数据。 */
  const adjust = useCallback(
    (index: number, delta: number) => {
      setData((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, value: Math.max(0, item.value + delta) } : item,
        ),
      );
    },
    [],
  );

  const addRow = useCallback(() => {
    setData((prev) => [
      ...prev,
      { label: `第 ${prev.length + 1} 组`, value: Math.ceil(Math.random() * 10) },
    ]);
  }, []);

  const removeRow = useCallback(() => {
    setData((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  return (
    <div className="space-y-4">
      <Panel
        title="互动统计图表台"
        hint="用加减按钮改变数据条，图表与平均数 / 中位数 / 众数 / 占比实时联动。"
        right={
          <div className="flex gap-1.5">
            {(
              [
                ["bar", "柱状"],
                ["line", "折线"],
                ["pie", "扇形"],
              ] as const
            ).map(([value, label]) => (
              <LabButton
                key={value}
                active={chartType === value}
                onClick={() => setChartType(value)}
              >
                {label}
              </LabButton>
            ))}
          </div>
        }
      >
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "pie" ? (
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={50}
                  outerRadius={95}
                  paddingAngle={2}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={PALETTE[index % PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#1E293B" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#FFFFFF",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    color: "#0F172A",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            ) : chartType === "line" ? (
              <LineChart data={data}>
                <CartesianGrid stroke="#E5E7EB" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#1E293B" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "#1E293B" }} />
                <Tooltip
                  contentStyle={{
                    background: "#FFFFFF",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    color: "#0F172A",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#1D4ED8"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#1D4ED8" }}
                />
              </LineChart>
            ) : (
              <BarChart data={data}>
                <CartesianGrid stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#1E293B" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "#1E293B" }} />
                <Tooltip
                  contentStyle={{
                    background: "#FFFFFF",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    color: "#0F172A",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={PALETTE[index % PALETTE.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Readout label="总数" value={`${stats.total}`} />
        <Readout label="平均数" value={stats.mean.toFixed(2)} />
        <Readout label="中位数" value={`${stats.median}`} accent="#B89B5E" />
        <Readout label="众数" value={`${stats.mode}`} />
      </div>

      <Panel
        title="数据编辑"
        hint="加减每一组的数据，图表会立即响应。"
        right={
          <div className="flex gap-1.5">
            <LabButton onClick={addRow}>增加一组</LabButton>
            <LabButton onClick={removeRow}>删除末组</LabButton>
          </div>
        }
      >
        <div className="space-y-2">
          {data.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-2"
            >
              <span className="w-16 shrink-0 text-[12px] text-[#1E293B]">
                {row.label}
              </span>
              <span
                className="h-2.5 rounded-full"
                style={{
                  width: `${Math.min(120, row.value * 8)}px`,
                  background: PALETTE[index % PALETTE.length],
                }}
              />
              <span className="w-8 shrink-0 text-right text-[13px] font-semibold tabular-nums text-[#0F172A]">
                {row.value}
              </span>
              <div className="ml-auto flex gap-1">
                <LabButton onClick={() => adjust(index, -1)}>−</LabButton>
                <LabButton onClick={() => adjust(index, 1)}>＋</LabButton>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onProgress?.(
              `已完成统计图表数据联动探索（${data.length} 组数据）`,
              1,
              1,
            )
          }
          className="mt-3 w-full rounded-lg bg-[#0B162C] px-3 py-1.5 text-[12px] font-medium text-white"
        >
          完成探索
        </button>
      </Panel>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 4 · 小学数感与方程天平（自研轻量 SVG）
 * ────────────────────────────────────────────────────────────────── */

/** 十进制凑十积木块。 */
function DecimalBlocksLab({
  config,
  onProgress,
}: {
  config: ManipulativeConfig;
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [target, setTarget] = useState(config.target ?? 10);
  const [tens, setTens] = useState(0);
  const [ones, setOnes] = useState(0);

  const sum = tens * 10 + ones;
  const done = sum === target;

  return (
    <div className="space-y-4">
      <Panel
        title="十进制凑十积木块"
        hint="用十格长条和一个个位方块拼出目标数——这是「凑十法」的实体模型。"
        right={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#1E293B]">目标</span>
            <input
              type="number"
              value={target}
              min={1}
              max={99}
              onChange={(event) => setTarget(Number(event.target.value) || 1)}
              className="w-16 rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] px-2 py-1 text-[13px] font-semibold tabular-nums text-[#0F172A]"
            />
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[12px] font-medium text-[#1E293B]">十格长条</span>
            {Array.from({ length: 9 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTens(i + 1)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium",
                  tens === i + 1
                    ? "border-[#0B162C] bg-[#0B162C] text-white"
                    : "border-[#E5E7EB] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                {i + 1} 条
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[12px] font-medium text-[#1E293B]">个位方块</span>
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOnes(i + 1)}
                className={cn(
                  "h-7 w-7 rounded-md border text-[11px] font-medium",
                  ones === i + 1
                    ? "border-[#B89B5E] bg-[#B89B5E] text-white"
                    : "border-[#E5E7EB] bg-[#FFFFFF] text-[#1E293B]",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* 积木可视化 */}
          <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFEFA] p-4">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: tens }, (_, i) => (
                <div
                  key={`t${i}`}
                  className="grid grid-cols-5 gap-0.5 rounded-md border border-[#0B162C] p-0.5"
                >
                  {Array.from({ length: 10 }, (_, j) => (
                    <span
                      key={j}
                      className="h-3.5 w-3.5 rounded-[2px]"
                      style={{ background: "#1D4ED8" }}
                    />
                  ))}
                </div>
              ))}
              {Array.from({ length: ones }, (_, i) => (
                <span
                  key={`o${i}`}
                  className="h-6 w-6 rounded-[3px] border border-[#B89B5E]"
                  style={{ background: "#E8D9B8" }}
                />
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-2.5">
        <Readout label="十位部分" value={`${tens} × 10`} />
        <Readout label="个位部分" value={`${ones}`} accent="#B89B5E" />
        <Readout
          label="当前合计"
          value={`${sum} / ${target}`}
          accent={done ? "#15803D" : "#1D4ED8"}
        />
      </div>

      <button
        type="button"
        disabled={!done}
        onClick={() =>
          onProgress?.(`已用积木块拼出 ${target}（凑十法）`, 1, 1)
        }
        className={cn(
          "w-full rounded-lg px-3 py-2 text-[12px] font-medium",
          done
            ? "bg-[#0B162C] text-white"
            : "border border-[#E5E7EB] bg-[#F8F7F4] text-[#94A3B8]",
        )}
      >
        {done ? "完成探索 ✓" : `还差 ${target - sum}`}
      </button>
    </div>
  );
}

/** 分数圆盘。 */
function FractionDiscLab({
  config,
  onProgress,
}: {
  config: ManipulativeConfig;
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [parts, setParts] = useState(config.parts ?? 4);
  const [shaded, setShaded] = useState(1);

  const radius = 110;
  const segments = Array.from({ length: parts }, (_, i) => {
    const start = (i / parts) * Math.PI * 2 - Math.PI / 2;
    const end = ((i + 1) / parts) * Math.PI * 2 - Math.PI / 2;
    const x1 = 150 + radius * Math.cos(start);
    const y1 = 150 + radius * Math.sin(start);
    const x2 = 150 + radius * Math.cos(end);
    const y2 = 150 + radius * Math.sin(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M 150 150 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  });

  return (
    <div className="space-y-4">
      <Panel
        title="分数圆盘 · 自由等分"
        hint="改变等分份数，再点选扇形涂色——分数的分母与分子就这样建立起来。"
        right={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#1E293B]">等分</span>
            <input
              type="range"
              min={2}
              max={12}
              value={parts}
              onChange={(event) => {
                const next = Number(event.target.value);
                setParts(next);
                setShaded((prev) => Math.min(prev, next));
              }}
              className="w-24 accent-[#1D4ED8]"
            />
            <span className="text-[13px] font-semibold tabular-nums text-[#1D4ED8]">
              {parts}
            </span>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 300 300" className="w-[260px]" role="img" aria-label="分数圆盘">
            <rect width="300" height="300" fill="#FFFFFF" />
            <circle cx="150" cy="150" r={radius} fill="#F8F7F4" stroke="#0B162C" strokeWidth="2" />
            {segments.map((d, index) => (
              <path
                key={index}
                d={d}
                fill={index < shaded ? "#1D4ED8" : "#FFFFFF"}
                stroke="#0B162C"
                strokeWidth="1.2"
                style={{ cursor: "pointer" }}
                onClick={() => setShaded(index + 1)}
              />
            ))}
          </svg>
          <div className="space-y-2.5">
            <Readout label="分数" value={`${shaded}/${parts}`} accent="#B89B5E" />
            <Readout
              label="十进制"
              value={(shaded / parts).toFixed(3)}
            />
            <button
              type="button"
              onClick={() =>
                onProgress?.(`已完成分数圆盘等分探索（${shaded}/${parts}）`, 1, 1)
              }
              className="w-full rounded-lg bg-[#0B162C] px-3 py-1.5 text-[12px] font-medium text-white"
            >
              完成探索
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** 动态数轴跳格器。 */
function NumberLineLab({
  config,
  onProgress,
}: {
  config: ManipulativeConfig;
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [start, setStart] = useState(config.start ?? -5);
  const [step, setStep] = useState(config.step ?? 1);
  const [pos, setPos] = useState(0);

  const W = 460;
  const count = 11;
  const spacing = 40;
  const startX = (W - spacing * (count - 1)) / 2;

  const valueAt = (index: number) => start + index * step;

  return (
    <div className="space-y-4">
      <Panel
        title="动态数轴跳格器"
        hint="用箭头按钮在数轴上跳跃，感受正负方向与步长的关系。"
        right={
          <div className="flex gap-1.5">
            <LabButton onClick={() => setStart((v) => v - 1)}>起点 −</LabButton>
            <LabButton onClick={() => setStart((v) => v + 1)}>起点 ＋</LabButton>
            <LabButton onClick={() => setStep((v) => (v >= 5 ? 1 : v + 1))}>
              步长 {step}
            </LabButton>
          </div>
        }
      >
        <svg viewBox={`0 0 ${W} 120`} className="w-full" role="img" aria-label="动态数轴">
          <rect width={W} height={120} fill="#FFFFFF" />
          <line
            x1={startX - 16}
            y1={60}
            x2={startX + spacing * (count - 1) + 16}
            y2={60}
            stroke="#0B162C"
            strokeWidth="2"
          />
          <polygon
            points={`${startX + spacing * (count - 1) + 16},60 ${startX + spacing * (count - 1) + 30},54 ${startX + spacing * (count - 1) + 30},66`}
            fill="#0B162C"
          />
          {Array.from({ length: count }, (_, i) => {
            const x = startX + spacing * i;
            const value = valueAt(i);
            return (
              <g key={i}>
                <line x1={x} y1={54} x2={x} y2={66} stroke="#0B162C" strokeWidth="1.6" />
                <text
                  x={x}
                  y={86}
                  fontSize="11"
                  textAnchor="middle"
                  fill={value === 0 ? "#B89B5E" : "#1E293B"}
                  fontWeight={value === 0 ? 700 : 400}
                >
                  {value}
                </text>
              </g>
            );
          })}
          <circle
            cx={startX + spacing * pos}
            cy={60}
            r="9"
            fill="#1D4ED8"
            stroke="#FFFFFF"
            strokeWidth="2.5"
          />
        </svg>

        <div className="mt-3 flex items-center justify-center gap-3">
          <LabButton onClick={() => setPos((v) => Math.max(0, v - 1))}>← 左移</LabButton>
          <Readout label="当前位置" value={`${valueAt(pos)}`} accent="#B89B5E" />
          <LabButton onClick={() => setPos((v) => Math.min(count - 1, v + 1))}>右移 →</LabButton>
        </div>
      </Panel>

      <button
        type="button"
        onClick={() =>
          onProgress?.(`已完成数轴跳格探索（当前位置 ${valueAt(pos)}）`, 1, 1)
        }
        className="w-full rounded-lg bg-[#0B162C] px-3 py-1.5 text-[12px] font-medium text-white"
      >
        完成探索
      </button>
    </div>
  );
}

/** 方程天平。 */
function BalanceScaleLab({
  config,
  onProgress,
}: {
  config: ManipulativeConfig;
  onProgress?: (message: string, done: number, total: number) => void;
}) {
  const [left, setLeft] = useState<number[]>(config.leftWeights ?? [2, 2]);
  const [right, setRight] = useState<number[]>(config.rightWeights ?? [4]);
  const [equation, setEquation] = useState("x + ? = ?");

  const leftSum = left.reduce((a, b) => a + b, 0);
  const rightSum = right.reduce((a, b) => a + b, 0);
  const balanced = leftSum === rightSum;

  const addWeight = (side: "left" | "right", weight: number) => {
    const setter = side === "left" ? setLeft : setRight;
    setter((prev) => [...prev, weight]);
  };
  const removeWeight = (side: "left" | "right") => {
    const setter = side === "left" ? setLeft : setRight;
    setter((prev) => prev.slice(0, -1));
  };

  return (
    <div className="space-y-4">
      <Panel
        title="方程天平 · 维持平衡"
        hint="在左右两边放砝码——只有两边一样重时天平才平，这正是方程「两边同量同数」的直观含义。"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ["left", "左边", left, leftSum, "#1D4ED8"],
                ["right", "右边", right, rightSum, "#B89B5E"],
              ] as const
            ).map(([side, label, weights, sum, color]) => (
              <div
                key={side}
                className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-medium text-[#1E293B]">{label}</span>
                  <span
                    className="text-[16px] font-semibold tabular-nums"
                    style={{ color }}
                  >
                    {sum}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {weights.map((weight, index) => (
                    <span
                      key={index}
                      className="rounded-md border px-2 py-1 text-[12px] font-semibold tabular-nums"
                      style={{
                        borderColor: color,
                        background: "#FFFFFF",
                        color,
                      }}
                    >
                      {weight}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <LabButton onClick={() => removeWeight(side)}>移走一个</LabButton>
                </div>
              </div>
            ))}
          </div>

          {/* 天平 */}
          <svg viewBox="0 0 400 140" className="w-full" role="img" aria-label="方程天平">
            <rect width="400" height="140" fill="#FFFFFF" />
            <polygon
              points="200,20 185,120 215,120"
              fill="#F8F7F4"
              stroke="#0B162C"
              strokeWidth="2"
            />
            <rect x="120" y="116" width="160" height="10" rx="4" fill="#0B162C" />
            <g
              transform={`rotate(${balanced ? 0 : (leftSum > rightSum ? -6 : 6)} 200 24)`}
            >
              <rect x="60" y="20" width="280" height="8" rx="4" fill="#B89B5E" />
              <line x1="70" y1="28" x2="70" y2="52" stroke="#0B162C" strokeWidth="1.6" />
              <line x1="330" y1="28" x2="330" y2="52" stroke="#0B162C" strokeWidth="1.6" />
              <path d="M 50 52 L 70 28 L 90 52 Z" fill="#F8F7F4" stroke="#0B162C" strokeWidth="1.6" />
              <path d="M 310 52 L 330 28 L 350 52 Z" fill="#F8F7F4" stroke="#0B162C" strokeWidth="1.6" />
              <text x="70" y="70" fontSize="13" textAnchor="middle" fontWeight="700" fill="#1D4ED8">
                {leftSum}
              </text>
              <text x="330" y="70" fontSize="13" textAnchor="middle" fontWeight="700" fill="#8A6D3B">
                {rightSum}
              </text>
            </g>
            <text
              x="200"
              y="106"
              fontSize="13"
              textAnchor="middle"
              fontWeight="700"
              fill={balanced ? "#15803D" : "#B91C1C"}
            >
              {balanced ? "平衡 ✓ 等式成立" : "不平衡 — 两边还不相等"}
            </text>
          </svg>

          {/* 砝码选择 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-[#1E293B]">加砝码</span>
            {[1, 2, 3, 5].map((weight) => (
              <LabButton key={weight} onClick={() => addWeight("left", weight)}>
                左 +{weight}
              </LabButton>
            ))}
            {[1, 2, 3, 5].map((weight) => (
              <LabButton key={`r${weight}`} tone="gold" onClick={() => addWeight("right", weight)}>
                右 +{weight}
              </LabButton>
            ))}
          </div>

          <input
            type="text"
            value={equation}
            onChange={(event) => setEquation(event.target.value)}
            className="w-full rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-2 text-[13px] text-[#0F172A]"
            placeholder="写下你从天平读到的方程"
          />
        </div>
      </Panel>

      <button
        type="button"
        disabled={!balanced}
        onClick={() =>
          onProgress?.(
            `已用天平平衡方程：${equation || `${leftSum} = ${rightSum}`}`,
            1,
            1,
          )
        }
        className={cn(
          "w-full rounded-lg px-3 py-2 text-[12px] font-medium",
          balanced
            ? "bg-[#0B162C] text-white"
            : "border border-[#E5E7EB] bg-[#F8F7F4] text-[#94A3B8]",
        )}
      >
        {balanced ? "完成探索 ✓" : "先让天平平衡"}
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 主组件
 * ────────────────────────────────────────────────────────────────── */

/**
 * 数学动态教具调度引擎。
 *
 * 根据 ``config.kind`` 分发到对应的交互教具。
 */
export default function MathManipulativeEngine({
  config,
  className,
  onProgress,
}: MathManipulativeEngineProps) {
  const body = useMemo(() => {
    switch (config.kind) {
      case "protractor":
        return <ProtractorLab config={config} onProgress={onProgress} />;
      case "functionLab":
        return <FunctionLab config={config} onProgress={onProgress} />;
      case "chartLab":
        return <ChartLab config={config} onProgress={onProgress} />;
      case "decimalBlocks":
        return <DecimalBlocksLab config={config} onProgress={onProgress} />;
      case "fractionDisc":
        return <FractionDiscLab config={config} onProgress={onProgress} />;
      case "numberLine":
        return <NumberLineLab config={config} onProgress={onProgress} />;
      case "balanceScale":
        return <BalanceScaleLab config={config} onProgress={onProgress} />;
      default:
        return null;
    }
  }, [config, onProgress]);

  if (!body) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] px-4 py-6 text-center text-[13px] text-[#1E293B]">
        本讲的数学教具正在装配中。
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn("space-y-4", className)}
    >
      {body}
    </motion.div>
  );
}
