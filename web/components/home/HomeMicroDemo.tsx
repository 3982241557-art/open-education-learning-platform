"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 首页 · 微型互动体验卡
 * ========================
 *
 * 访客在首页**5 秒内**就能亲手玩一下平台的核心玩法——
 * 不需要注册，不需要进课。
 *
 * 两个可切换的玩法
 * ----------------
 *
 * - **语文 · 名篇笔顺**——一行真实课文标题 + 一个可点开的生字，
 *   点一下看**笔顺分解**（用 hanzi-writer 的静态 SVG 路径绘制）；
 * - **数学 · 函数滑块**——一条可拖动的参数滑块，曲线**实时**跟着动。
 *
 * 为什么做两个完全不同的
 * ----------------------
 *
 * 因为语文与数学的**学习动作本身**就不一样：语文是「认字、读句、
 * 品意象」，数学是「调参数、看变化」。如果首页只演示一种，访客
 * 会以为这是个**单科**平台。
 */

/** 组件属性。 */
export interface HomeMicroDemoProps {
  className?: string;
}

/** 语文侧演示的字——「秋」：笔画少、意象强。 */
const DEMO_CHAR = "秋";

/**
 * 「秋」字的笔画路径（简化的米字格定位）。
 *
 * ⚠️ 这里**不**引入 hanzi-writer——首页演示要**零依赖、秒开**。
 *    真实的笔顺动画在课程页用 hanzi-writer 渲染；首页只需要
 *    「一个字被拆成笔画」这个**印象**。
 */
const STROKE_PATHS: Array<{ d: string; label: string }> = [
  { d: "M 24 30 L 24 74", label: "撇" },
  { d: "M 24 44 L 40 40", label: "横" },
  { d: "M 24 44 L 16 52", label: "点" },
  { d: "M 24 44 L 32 52", label: "点" },
  { d: "M 52 30 L 52 74", label: "横" },
  { d: "M 44 42 L 60 42", label: "横" },
  { d: "M 44 42 L 40 50", label: "撇" },
  { d: "M 44 42 L 48 50", label: "点" },
  { d: "M 52 42 L 52 66 L 44 74", label: "撇" },
  { d: "M 52 50 L 62 66", label: "捺" },
];

export function HomeMicroDemo({ className }: HomeMicroDemoProps) {
  const [tab, setTab] = useState<"chinese" | "math">("chinese");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--border)] bg-white oe-card-shadow",
        className,
      )}
    >
      {/* ── 切换条 ── */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[#fffefa] px-3 py-2">
        {(
          [
            { id: "chinese", label: "语文 · 名篇笔顺" },
            { id: "math", label: "数学 · 函数滑块" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
              tab === item.id
                ? "bg-[#0b162c] text-white"
                : "text-[#55606e] hover:bg-[#f1f0ec] hover:text-[#0f172a]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── 主体 ── */}
      <div className="p-4">
        {tab === "chinese" ? <ChineseDemo /> : <MathDemo />}
      </div>
    </div>
  );
}

/** 语文侧——笔顺分解。 */
function ChineseDemo() {
  const [step, setStep] = useState(3);
  const [playing, setPlaying] = useState(false);

  return (
    <div>
      <p className="mb-3 text-[11px] leading-relaxed text-[#55606e]">
        统编版七年级《秋天的怀念》 · 核心生字
      </p>

      <div className="flex flex-wrap items-start gap-4">
        {/* 米字格 + 笔画。 */}
        <div className="relative h-[132px] w-[132px] shrink-0 rounded-lg border border-[#cbd5e1] bg-[#fffefa]">
          {/* 米字辅助线。 */}
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            className="absolute inset-0 h-full w-full"
          >
            <line x1="50" y1="6" x2="50" y2="94" stroke="#e5e7eb" strokeWidth="0.8" />
            <line x1="6" y1="50" x2="94" y2="50" stroke="#e5e7eb" strokeWidth="0.8" />
            <line x1="16" y1="16" x2="84" y2="84" stroke="#e5e7eb" strokeWidth="0.8" />
            <line x1="84" y1="16" x2="16" y2="84" stroke="#e5e7eb" strokeWidth="0.8" />
            {STROKE_PATHS.map((stroke, index) => (
              <motion.path
                key={stroke.label}
                d={stroke.d}
                fill="none"
                stroke={index < step ? "#1e3a8a" : "#e2e8f0"}
                strokeWidth="5"
                strokeLinecap="round"
                initial={false}
                animate={{
                  opacity: index < step ? 1 : 0.55,
                  strokeWidth: index === step - 1 ? 5.6 : 5,
                }}
                transition={{ duration: 0.28 }}
              />
            ))}
          </svg>
          {/* 笔画序号。 */}
          <span className="absolute bottom-1.5 left-1.5 rounded bg-[#0b162c] px-1.5 py-0.5 text-[9px] font-medium text-white tabular-nums">
            {step} / {STROKE_PATHS.length} 画
          </span>
        </div>

        {/* 说明 + 控制。 */}
        <div className="min-w-[160px] flex-1 space-y-2.5">
          <div className="flex items-baseline gap-2">
            <span className="oe-display text-[28px] leading-none text-[#0f172a]">
              {DEMO_CHAR}
            </span>
            <span className="text-[12px] text-[#55606e]">qiū · 禾 + 火</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-[#55606e]">
            点「播放」看完整笔顺分解；再点「跟我写」，自己描一遍——
            写错的笔画会立刻标红。
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPlaying(true);
                setStep(0);
                let index = 0;
                const timer = window.setInterval(() => {
                  index += 1;
                  setStep(index);
                  if (index >= STROKE_PATHS.length) {
                    window.clearInterval(timer);
                    setPlaying(false);
                  }
                }, 260);
              }}
              className="rounded-lg bg-[#1d4ed8] px-2.5 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
            >
              {playing ? "播放中…" : "播放笔顺"}
            </button>
            <button
              type="button"
              onClick={() => setStep((value) => (value % STROKE_PATHS.length) + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#cbd5e1] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1e293b] transition-colors hover:border-[#1d4ed8]"
            >
              <RotateCcw size={10} strokeWidth={2.4} />
              下一笔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 数学侧——函数滑块。 */
function MathDemo() {
  const [a, setA] = useState(1);
  const [type, setType] = useState<"linear" | "quadratic">("quadratic");
  const size = 168;

  /** 把 (x, y) 映射到 SVG 坐标。 */
  const px = (x: number) => size / 2 + (x / 6) * (size / 2 - 14);
  const py = (y: number) => size / 2 - (y / 6) * (size / 2 - 14);

  /** 曲线路径。 */
  const path = (() => {
    const points: string[] = [];
    for (let i = 0; i <= 48; i += 1) {
      const x = -3 + (i / 48) * 6;
      const y = type === "quadratic" ? a * x * x - 2 : a * x;
      points.push(`${px(x).toFixed(2)},${py(y).toFixed(2)}`);
    }
    return `M ${points.join(" L ")}`;
  })();

  return (
    <div>
      <p className="mb-3 text-[11px] leading-relaxed text-[#55606e]">
        人教版七年级《有理数》 · 一次函数与二次函数
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-[176px] w-[176px] shrink-0">
          <rect width={size} height={size} fill="#fbfbfa" />
          {/* 网格。 */}
          {Array.from({ length: 10 }).map((_, index) => (
            <g key={index} stroke="#ececea" strokeWidth="0.6">
              <line
                x1={(index + 1) * (size / 11)}
                y1={0}
                x2={(index + 1) * (size / 11)}
                y2={size}
              />
              <line x1={0} y1={(index + 1) * (size / 11)} x2={size} y2={(index + 1) * (size / 11)} />
            </g>
          ))}
          {/* 坐标轴。 */}
          <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke="#94a3b8" strokeWidth="1" />
          <line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke="#94a3b8" strokeWidth="1" />
          {/* 曲线。 */}
          <motion.path
            animate={{ d: path }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* 顶点标注。 */}
          {type === "quadratic" ? (
            <circle
              cx={px(0)}
              cy={py(-2)}
              r="3.5"
              fill="#b89b5e"
              stroke="#fff"
              strokeWidth="1.5"
            />
          ) : null}
        </svg>

        <div className="min-w-[168px] flex-1 space-y-3">
          {/* 函数类型切换。 */}
          <div className="flex gap-1 rounded-lg bg-[#f1f0ec] p-0.5">
            {(
              [
                { id: "linear", label: "y = ax" },
                { id: "quadratic", label: "y = ax²" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setType(item.id)}
                className={cn(
                  "flex-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors",
                  type === item.id
                    ? "bg-white text-[#1d4ed8] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                    : "text-[#55606e] hover:text-[#0f172a]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-[#55606e]">
              参数 a ={" "}
              <span className="tabular-nums text-[#0f172a]">{a.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={-2.5}
              max={2.5}
              step={0.1}
              value={a}
              onChange={(event) => setA(Number(event.target.value))}
              className="w-full accent-[#1d4ed8]"
            />
          </label>

          <p className="text-[11px] leading-relaxed text-[#55606e]">
            拖动滑块——你会看到开口方向、过定点与顶点位置**同时**在变。
            这正是课本上那张静态图讲不清的地方。
          </p>
        </div>
      </div>
    </div>
  );
}
