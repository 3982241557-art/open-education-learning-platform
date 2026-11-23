"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * 首页微型体验卡
 * ==============
 *
 * 首页第三层「双引擎体验」的**可玩**版本。
 *
 * 为什么首页要放一个能玩的东西
 * --------------------------
 *
 * 首页的说服力不来自文案，来自「**我刚才能玩**」。
 *
 * 一个用户如果只在页面上读到了「我们的教具很好」，他不会相信；
 * 但如果他在首页就**亲手拖了一下抛物线**，他立刻知道这不是 PPT。
 *
 * 所以这个卡片刻意做得很小（一个控件、一个即时反馈），但**必须是真的
 * 交互**——不是视频，不是截图。
 *
 * ⛔ 视觉铁律：卡片 100% 实心纯白，控件实心，文字深炭黑。
 */

/** 组件。 */
export default function HomeMicroDemo() {
  /** 抛物线系数。 */
  const [a, setA] = useState(1);

  /** 曲线路径。 */
  const path = useMemo(() => {
    const points: string[] = [];
    const size = 180;
    for (let i = 0; i <= 48; i += 1) {
      const x = -4 + (i / 48) * 8;
      const y = a * x * x;
      const px = size / 2 + (x / 8) * (size / 2 - 14);
      const py = size / 2 - (y / 6) * (size / 2 - 14);
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return `M ${points.join(" L ")}`;
  }, [a]);

  /** 顶点位置。 */
  const vertex = useMemo(() => {
    const size = 180;
    return {
      x: size / 2,
      y: size / 2 - (a * 4 / 6) * (size / 2 - 14) * 0 + (0 / 6) * 0 + (size / 2),
    };
  }, [a]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5 oe-card-shadow">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-medium tracking-[0.16em] text-[#1D4ED8] uppercase">
            Micro Lab
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[#0F172A]">
            拖一下系数 a，看抛物线怎么变
          </p>
        </div>
        <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[#1D4ED8]">
          y = {a.toFixed(1)}x²
        </span>
      </div>

      <div className="mt-4 flex items-center gap-5">
        {/* 坐标系。 */}
        <svg
          viewBox="0 0 180 180"
          className="h-[180px] w-[180px] shrink-0 rounded-xl border border-[#E5E7EB] bg-[#F8F7F4]"
          aria-hidden="true"
        >
          <line x1="0" y1="90" x2="180" y2="90" stroke="#C7CEDA" strokeWidth="1" />
          <line x1="90" y1="0" x2="90" y2="180" stroke="#C7CEDA" strokeWidth="1" />
          {Array.from({ length: 7 }).map((_unused, index: number) => (
            <g key={index} stroke="#E5E7EB" strokeWidth="0.7">
              <line
                x1={(index + 1) * 22.5}
                y1="0"
                x2={(index + 1) * 22.5}
                y2="180"
              />
              <line x1="0" y1={(index + 1) * 22.5} x2="180" y2={(index + 1) * 22.5} />
            </g>
          ))}
          <motion.path
            animate={{ d: path }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            fill="none"
            stroke="#1D4ED8"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>

        {/* 滑块。 */}
        <div className="min-w-[130px] flex-1 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium text-[#0F172A]">
              系数 a
            </span>
            <input
              type="range"
              min={-2}
              max={2}
              step={0.1}
              value={a}
              onChange={(event) => setA(Number(event.target.value))}
              className="w-full accent-[#1D4ED8]"
              aria-label="抛物线系数 a"
            />
          </label>
          <p className="text-[11.5px] leading-relaxed text-[#55606E]">
            {a > 0
              ? "开口朝上——a 为正。"
              : a < 0
                ? "开口朝下——a 为负。"
                : "a = 0，退化成一条直线。"}
          </p>
          <div className="flex gap-1.5">
            {[-1, 0.5, 1, 2].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setA(value)}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[11px] tabular-nums transition-colors",
                  Math.abs(a - value) < 0.01
                    ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                    : "border-[#CBD5E1] bg-white text-[#0F172A] hover:border-[#1D4ED8]",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
