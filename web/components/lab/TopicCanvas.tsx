"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Scissors } from "lucide-react";
import { audioEngine, valueToFreq } from "@/lib/audio-engine";
import type { FlagshipTopicId } from "@/lib/flagship-topics";
import { cn } from "@/lib/cn";

/**
 * 专题交互实验画布
 * ================
 *
 * 三个标杆专题各有一套**纯本地 Canvas 2D** 交互——不依赖任何外部
 * 引擎，不发任何网络请求，60fps。
 *
 * - ``exp-comfort`` —— 舒适区双环实时按 ``A(t)=A₀(1+r)ᵗ`` 缩放，
 *   音高随数值实时变化；
 * - ``seq-zeno`` —— 「再切一刀」按钮 + 切分次数 n 与公比 q 滑块，
 *   q ≥ 1 时光块撑破画框；
 * - ``prob-bayes`` —— 基础概率与检测准确率滑块驱动 100 颗粒子
 *   平滑重排，柱状条与后验数字实时联动。
 *
 * ⛔ **零故障**：所有绘制都在一个 ``requestAnimationFrame`` 循环里，
 *    没有外部脚本、没有 iframe、没有超时窗口。
 */

const STAGE_BG = "#090C12";
const GOLD = "#C59B38";
const EMBER = "#C1553A";
const SHIMMER = "#E8EEF7";

/** 夹紧。 */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 插值。 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 十六进制颜色 + alpha。 */
function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 画布文案。 */
interface CanvasLabels {
  rate: string;
  span: string;
  prior: string;
  sensitivity: string;
  falseRate: string;
  cut: string;
  cuts: string;
  ratio: string;
  left: string;
  right: string;
  years: string;
  sum: string;
  posterior: string;
  tp: string;
  fp: string;
  fn: string;
  tn: string;
  overflow: string;
  converged: string;
  hint: string;
}

const ZH: CanvasLabels = {
  rate: "变化率 r",
  span: "时间跨度 n",
  prior: "基础概率（患病率）",
  sensitivity: "检测灵敏度",
  falseRate: "误报率",
  cut: "再切一刀",
  cuts: "切分次数 n",
  ratio: "公比 q",
  left: "原地不动",
  right: "每年向外一步",
  years: "年",
  sum: "累加和",
  posterior: "阳性者中真正患病",
  tp: "真阳性",
  fp: "假阳性",
  fn: "漏检",
  tn: "真阴性",
  overflow: "光块已撑破画框——发散",
  converged: "光块收敛于有限边界内",
  hint: "拖动滑块或点击按钮，画面与音高实时联动",
};

const EN: CanvasLabels = {
  rate: "Rate r",
  span: "Span n",
  prior: "Base rate (prevalence)",
  sensitivity: "Sensitivity",
  falseRate: "False-positive rate",
  cut: "Cut again",
  cuts: "Cuts n",
  ratio: "Common ratio q",
  left: "Standing still",
  right: "One step out each year",
  years: "years",
  sum: "Running sum",
  posterior: "Positives that are truly sick",
  tp: "True positive",
  fp: "False positive",
  fn: "Missed",
  tn: "True negative",
  overflow: "The pieces burst the frame — divergence",
  converged: "The pieces converge inside the frame",
  hint: "Drag the sliders or hit the button — image and pitch respond live",
};

export interface TopicCanvasProps {
  topicId: FlagshipTopicId;
  isEn: boolean;
  /** 学生真的动过手时回调（用于点亮进度）。 */
  onTouch?: () => void;
}

export default function TopicCanvas({
  topicId,
  isEn,
  onTouch,
}: TopicCanvasProps) {
  const L = isEn ? EN : ZH;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  /* ── 参数状态 ─────────────────────────────────────────────── */
  const [r, setR] = useState(0.1);
  const [n, setN] = useState(8);
  const [cuts, setCuts] = useState(6);
  const [q, setQ] = useState(0.5);
  const [prior, setPrior] = useState(0.1);
  const [sens, setSens] = useState(0.9);
  const [fpr, setFpr] = useState(0.05);

  /* 平滑插值用的目标/当前值——让粒子移动是渐进的，不是瞬移的。 */
  const smooth = useRef({ prior: 0.1, sens: 0.9, fpr: 0.05 });

  useEffect(() => {
    smooth.current.prior = prior;
    smooth.current.sens = sens;
    smooth.current.fpr = fpr;
  }, [prior, sens, fpr]);

  /* ── 尺寸 ─────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(260, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  /* ── 音高联动：数值变化时推动连续音 ───────────────────────── */

  const lastSound = useRef(0);
  const pushSound = useCallback((value: number, lo: number, hi: number) => {
    const now = performance.now();
    if (now - lastSound.current < 60) return;
    lastSound.current = now;
    audioEngine.glide(valueToFreq(value, lo, hi), 0.09);
  }, []);

  useEffect(() => {
    if (topicId === "exp-comfort") pushSound(r, -0.3, 0.5);
  }, [r, topicId, pushSound]);

  useEffect(() => {
    if (topicId === "prob-bayes") {
      const tp = prior * sens;
      const fp = (1 - prior) * fpr;
      const post = tp + fp > 0 ? tp / (tp + fp) : 0;
      pushSound(post, 0, 1);
    }
  }, [prior, sens, fpr, topicId, pushSound]);

  useEffect(() => {
    return () => audioEngine.stopGlide();
  }, []);

  /* ── 渲染循环 ─────────────────────────────────────────────── */

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { w, h } = sizeRef.current;
      if (w > 0 && h > 0) {
        ctx.fillStyle = STAGE_BG;
        ctx.fillRect(0, 0, w, h);
        if (topicId === "exp-comfort") {
          drawComfort(ctx, w, h, r, n, L);
        } else if (topicId === "seq-zeno") {
          drawZeno(ctx, w, h, cuts, q, L);
        } else {
          drawBayes(ctx, w, h, smooth.current, L);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [topicId, r, n, cuts, q, L]);

  /* ── 控件 ─────────────────────────────────────────────────── */

  const doCut = useCallback(() => {
    setCuts((c) => Math.min(24, c + 1));
    audioEngine.slice(cuts);
    onTouch?.();
  }, [cuts, onTouch]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#090C12] p-4">
      {/* 画布 */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden rounded-xl">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {/* 控制条 */}
      <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        {topicId === "exp-comfort" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Slider
              label={L.rate}
              value={r}
              min={-0.3}
              max={0.5}
              step={0.01}
              display={`${(r * 100).toFixed(0)}%`}
              onChange={(v) => {
                setR(v);
                onTouch?.();
              }}
            />
            <Slider
              label={`${L.span}（${L.years}）`}
              value={n}
              min={1}
              max={15}
              step={1}
              display={`${n}`}
              onChange={(v) => {
                setN(v);
                onTouch?.();
              }}
            />
          </div>
        ) : null}

        {topicId === "seq-zeno" ? (
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
            <div>
              <button
                type="button"
                onClick={doCut}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#C59B38] px-4 text-[12.5px] font-medium text-[#090C12] transition-colors hover:bg-[#D9AE4C]"
              >
                <Scissors size={14} strokeWidth={2.2} />
                {L.cut}
              </button>
            </div>
            <Slider
              label={L.cuts}
              value={cuts}
              min={0}
              max={24}
              step={1}
              display={`${cuts}`}
              onChange={(v) => {
                setCuts(v);
                onTouch?.();
              }}
            />
            <Slider
              label={L.ratio}
              value={q}
              min={0.2}
              max={1.2}
              step={0.01}
              display={q.toFixed(2)}
              onChange={(v) => {
                setQ(v);
                onTouch?.();
              }}
            />
          </div>
        ) : null}

        {topicId === "prob-bayes" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Slider
              label={L.prior}
              value={prior}
              min={0.005}
              max={0.5}
              step={0.005}
              display={`${(prior * 100).toFixed(1)}%`}
              onChange={(v) => {
                setPrior(v);
                onTouch?.();
              }}
            />
            <Slider
              label={L.sensitivity}
              value={sens}
              min={0.5}
              max={1}
              step={0.005}
              display={`${(sens * 100).toFixed(1)}%`}
              onChange={(v) => {
                setSens(v);
                onTouch?.();
              }}
            />
            <Slider
              label={L.falseRate}
              value={fpr}
              min={0.005}
              max={0.3}
              step={0.005}
              display={`${(fpr * 100).toFixed(1)}%`}
              onChange={(v) => {
                setFpr(v);
                onTouch?.();
              }}
            />
          </div>
        ) : null}

        <p className="mt-2.5 text-[11px] text-white/35">{L.hint}</p>
      </div>
    </div>
  );
}

/* ── 滑块 ─────────────────────────────────────────────────────── */

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] text-white/55">{label}</span>
        <span className="font-mono text-[13px] font-medium text-[#E8EEF7] tabular-nums">
          {display}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[#C59B38]"
      />
    </label>
  );
}

/* ── 专题 01 ──────────────────────────────────────────────────── */

function drawComfort(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: number,
  n: number,
  L: CanvasLabels,
): void {
  const leftV = Math.pow(1 + r, n);
  const rightV = Math.pow(1 + r, n);
  /* 左侧固定用 -10% 作为「原地不动」的对照。 */
  const decayV = Math.pow(0.9, n);

  const cx1 = w * 0.27;
  const cx2 = w * 0.73;
  const cy = h * 0.5;
  const base = Math.min(w * 0.12, h * 0.16);

  ctx.textAlign = "center";
  ctx.font = `500 ${Math.round(Math.min(w, h) * 0.022)}px "PingFang SC", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232,238,247,0.45)";
  ctx.fillText(L.left, cx1, h * 0.85);
  ctx.fillText(L.right, cx2, h * 0.85);

  ring(ctx, cx1, cy, base, decayV, EMBER, false);
  ring(ctx, cx2, cy, base, rightV, GOLD, true);

  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.04)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = "rgba(193,85,58,0.95)";
  ctx.fillText(`${(decayV * 100).toFixed(0)}%`, cx1, h * 0.92);
  ctx.fillStyle = "rgba(197,155,56,0.95)";
  ctx.fillText(`${(rightV * 100).toFixed(rightV > 10 ? 0 : 1)}%`, cx2, h * 0.92);

  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.02)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = "rgba(232,238,247,0.35)";
  ctx.fillText(
    `A(n) = A₀(1+r)ⁿ   r = ${(r * 100).toFixed(0)}%   n = ${n}`,
    w / 2,
    h * 0.08,
  );
}

function ring(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  base: number,
  value: number,
  color: string,
  growing: boolean,
): void {
  const radius = base * Math.pow(Math.max(value, 0.02), 0.34);
  const alpha = growing
    ? clamp(0.16 + Math.log10(Math.max(value, 0.1)) * 0.25 + 0.2, 0.16, 0.95)
    : clamp(0.12 + value * 0.72, 0.12, 0.85);

  const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.5);
  grad.addColorStop(0, hexAlpha(color, alpha * 0.5));
  grad.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hexAlpha(color, alpha);
  ctx.lineWidth = Math.max(1.2, base * 0.055);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = hexAlpha(color, alpha * 0.26);
  ctx.lineWidth = Math.max(0.6, base * 0.014);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  /* 剪影 */
  const s = base * 0.42;
  const stretch = growing
    ? clamp(0.72 + Math.log10(Math.max(value, 0.1)) * 0.42, 0.72, 1.5)
    : clamp(0.68 + value * 0.3, 0.7, 1.0);
  ctx.save();
  ctx.translate(cx, cy + s * 0.42);
  ctx.scale(1, stretch);
  ctx.globalAlpha = 0.55 + alpha * 0.4;
  ctx.fillStyle = hexAlpha(color, 0.85);
  ctx.beginPath();
  ctx.arc(0, -s * 0.78, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  const rr = s * 0.16;
  const bx = -s * 0.17;
  const by = -s * 0.55;
  const bw = s * 0.34;
  const bh = s * 0.86;
  ctx.moveTo(bx + rr, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, rr);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, rr);
  ctx.arcTo(bx, by + bh, bx, by, rr);
  ctx.arcTo(bx, by, bx + bw, by, rr);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexAlpha(color, 0.8);
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (growing) {
    ctx.moveTo(-s * 0.16, -s * 0.4);
    ctx.lineTo(-s * 0.62, -s * 0.58);
    ctx.moveTo(s * 0.16, -s * 0.4);
    ctx.lineTo(s * 0.62, -s * 0.58);
  } else {
    ctx.moveTo(-s * 0.16, -s * 0.4);
    ctx.lineTo(-s * 0.3, -s * 0.05);
    ctx.moveTo(s * 0.16, -s * 0.4);
    ctx.lineTo(s * 0.3, -s * 0.05);
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── 专题 02 ──────────────────────────────────────────────────── */

function drawZeno(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cuts: number,
  q: number,
  L: CanvasLabels,
): void {
  const frameW = w * 0.56;
  const frameH = h * 0.62;
  const x0 = (w - frameW) / 2;
  const y0 = (h - frameH) / 2 - h * 0.03;

  /* 画框 */
  ctx.save();
  ctx.shadowColor = "rgba(197,155,56,0.45)";
  ctx.shadowBlur = 24;
  ctx.strokeStyle = "rgba(214,171,74,0.9)";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x0, y0, frameW, frameH);
  ctx.restore();

  /* 切分：每一刀的重量按 q 缩放。 */
  const total = 100;
  let rest = { x: x0, y: y0, w: frameW, h: frameH };
  const pieces: Array<{ x: number; y: number; w: number; h: number }> = [];

  for (let k = 0; k < cuts; k += 1) {
    const take = rest.w >= rest.h ? rest.w * (1 - 1 / Math.max(q, 0.2)) : rest.h * (1 - 1 / Math.max(q, 0.2));
    if (take <= 0.5) break;
    if (rest.w >= rest.h) {
      pieces.push({ x: rest.x, y: rest.y, w: take, h: rest.h });
      rest = { x: rest.x + take, y: rest.y, w: rest.w - take, h: rest.h };
    } else {
      pieces.push({ x: rest.x, y: rest.y, w: rest.w, h: take });
      rest = { x: rest.x, y: rest.y + take, w: rest.w, h: rest.h - take };
    }
  }

  for (const p of pieces) {
    const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    g.addColorStop(0, "rgba(214,171,74,0.85)");
    g.addColorStop(1, "rgba(197,155,56,0.42)");
    ctx.fillStyle = g;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "rgba(232,238,247,0.4)";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
  }

  /* 余块高亮 */
  ctx.save();
  ctx.shadowColor = "rgba(232,238,247,0.55)";
  ctx.shadowBlur = 16;
  ctx.strokeStyle = "rgba(232,238,247,0.85)";
  ctx.lineWidth = 1.3;
  ctx.strokeRect(rest.x, rest.y, rest.w, rest.h);
  ctx.restore();

  /* 溢出：q ≥ 1 时光块撑破画框 */
  const overflow = q >= 1;
  if (overflow) {
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 220);
    ctx.save();
    ctx.shadowColor = `rgba(193,85,58,${pulse})`;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = `rgba(193,85,58,${0.6 + pulse * 0.3})`;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(x0 - 6, y0 - 6, frameW + 12, frameH + 12);
    ctx.restore();
  }

  /* 数值 */
  const sum = q < 1 ? (q * (1 - Math.pow(q, cuts))) / (1 - q) : cuts;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(232,238,247,0.92)";
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.048)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillText(`${L.sum} ${sum.toFixed(4)}`, w / 2, y0 - h * 0.08);

  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.021)}px "PingFang SC", system-ui, sans-serif`;
  ctx.fillStyle = overflow ? "rgba(193,85,58,0.95)" : "rgba(232,238,247,0.45)";
  ctx.fillText(overflow ? L.overflow : L.converged, w / 2, y0 + frameH + h * 0.09);

  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.02)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = "rgba(232,238,247,0.35)";
  ctx.fillText(
    `n = ${cuts}   q = ${q.toFixed(2)}`,
    w / 2,
    h * 0.06,
  );
  void total;
}

/* ── 专题 03 ──────────────────────────────────────────────────── */

/** 粒子总数。 */
const P_COUNT = 100;

function drawBayes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: { prior: number; sens: number; fpr: number },
  L: CanvasLabels,
): void {
  const tp = p.prior * p.sens;
  const fp = (1 - p.prior) * p.fpr;
  const fn = p.prior * (1 - p.sens);
  const tn = (1 - p.prior) * (1 - p.fpr);
  const positives = tp + fp;
  const posterior = positives > 0 ? tp / positives : 0;

  const counts = [tp * P_COUNT, fp * P_COUNT, fn * P_COUNT, tn * P_COUNT];
  const colors = [GOLD, "#6B7A90", EMBER, "#3E4A5C"];
  const labels = [L.tp, L.fp, L.fn, L.tn];

  /* 顶部柱状条 */
  const barY = h * 0.1;
  const barH = Math.max(12, h * 0.035);
  const barW = w * 0.6;
  const barX = (w - barW) / 2;
  let acc = 0;
  for (let i = 0; i < 4; i += 1) {
    const seg = counts[i];
    ctx.fillStyle = hexAlpha(colors[i], 0.85);
    ctx.fillRect(barX + (barW * acc) / P_COUNT, barY, (barW * seg) / P_COUNT, barH);
    acc += seg;
  }
  ctx.strokeStyle = "rgba(232,238,247,0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  /* 图例 */
  ctx.textAlign = "left";
  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.019)}px "PingFang SC", system-ui, sans-serif`;
  let lx = barX;
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = hexAlpha(colors[i], 0.95);
    ctx.fillRect(lx, barY + barH + 8, 8, 8);
    ctx.fillStyle = "rgba(232,238,247,0.6)";
    ctx.fillText(
      `${labels[i]} ${counts[i].toFixed(0)}`,
      lx + 12,
      barY + barH + 15,
    );
    lx += ctx.measureText(`${labels[i]} ${counts[i].toFixed(0)}`).width + 34;
  }

  /* 粒子：按分组排布 */
  const areaTop = h * 0.26;
  const areaH = h * 0.5;
  const perRow = 14;
  const dotR = Math.min(w, h) * 0.009;

  let cursor = 0;
  const groupLayout = counts.map((c, i) => {
    const per = Math.max(1, Math.ceil(c / perRow));
    const start = cursor;
    cursor += Math.ceil(c);
    return { count: c, per, start, color: colors[i], label: labels[i] };
  });

  for (let i = 0; i < P_COUNT; i += 1) {
    const gi = groupLayout.findIndex(
      (g) => i >= g.start && i < g.start + Math.ceil(g.count),
    );
    if (gi < 0) continue;
    const g = groupLayout[gi];
    const local = i - g.start;
    const row = Math.floor(local / g.per);
    const col = local % g.per;
    const per = g.per;
    const spanW = w * 0.78;
    const x = w / 2 - spanW / 2 + (col + 0.5) * (spanW / per);
    const y = areaTop + (row + 0.5) * ((areaH / 4) * 0.95);
    const alpha = 0.35 + 0.6 * clamp(g.count / 40, 0, 1);
    ctx.fillStyle = hexAlpha(g.color, alpha);
    ctx.beginPath();
    ctx.arc(x, y, dotR * (gi === 0 ? 1.2 : 1), 0, Math.PI * 2);
    ctx.fill();
  }

  /* 分组分隔线 */
  ctx.strokeStyle = "rgba(232,238,247,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = areaTop + i * (areaH / 4);
    ctx.beginPath();
    ctx.moveTo(w * 0.08, y);
    ctx.lineTo(w * 0.92, y);
    ctx.stroke();
  }

  /* 后验读数 */
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(232,238,247,0.92)";
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.05)}px "Songti SC", Georgia, serif`;
  ctx.fillText(
    `${L.posterior} ${(posterior * 100).toFixed(1)}%`,
    w / 2,
    h * 0.92,
  );
  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.019)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = "rgba(232,238,247,0.4)";
  ctx.fillText(
    `prior ${(p.prior * 100).toFixed(1)}%   sensitivity ${(p.sens * 100).toFixed(1)}%   false-positive ${(p.fpr * 100).toFixed(1)}%`,
    w / 2,
    h * 0.965,
  );
  void lerp;
  void cn;
}
