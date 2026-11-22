/**
 * K12 互动实验室 · 分学段实验台
 * =================================
 *
 * 三套**真实可操作**的实验台，按学段与学科严格分离：
 *
 * ================  ================================================
 * 组件              适用
 * ================  ================================================
 * ``LiteraryLab``   初高中语文 —— 名篇精读与意象赏析
 * ``PrimaryMathLab`` 小学数学 —— 数轴 / 凑十方块 / 分数 / 面积 / 平移对称
 * ``SecondaryMathLab`` 初高中数学 —— 函数图像 / 动态几何 / 概率 / 代数
 * ================  ================================================
 *
 * ⛔ **红线**：``PrimaryMathLab`` 与 ``SecondaryMathLab`` **绝不**包含
 *    任何汉字笔顺相关代码；``LiteraryLab`` **绝不**包含描红。
 *
 * 全部为**纯前端**（React + SVG + framer-motion），无后端依赖。
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Play,
  RotateCcw,
  Volume2,
} from "lucide-react";

import type {
  InteractiveLab,
  LabParams,
  LiteraryLabData,
} from "@/lib/interactive-lab";

/* ──────────────────────────────────────────────────────────────────
 * 通用小组件
 * ────────────────────────────────────────────────────────────────── */

/** 面板标题。 */
function PanelTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h4 className="text-[14px] font-bold text-[#0B162C]">{children}</h4>
      {hint ? (
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** 一个滑块。 */
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-[92px] shrink-0 text-[12px] font-medium text-slate-700">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#1D4ED8]"
      />
      <span className="w-[62px] shrink-0 text-right font-mono text-[12px] font-semibold text-[#0B162C]">
        {value}
        {suffix ?? ""}
      </span>
    </label>
  );
}

/** 一个按钮。 */
function ToolButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "border-[#0B162C] bg-[#122344] text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-[#1D4ED8] hover:bg-blue-50",
      )}
    >
      {children}
    </button>
  );
}

/** 极简 className 合并。 */
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ──────────────────────────────────────────────────────────────────
 * 一、初高中语文 · 名篇精读与意象赏析台
 * ────────────────────────────────────────────────────────────────── */

interface LiteraryLabProps {
  lab: InteractiveLab;
}

/**
 * 名篇精读与意象赏析台。
 *
 * 展示本课真实的核心名句 / 选段；
 * 点击关键词 → 弹出修辞手法、意象解析与白话对照；
 * 附带一道**互动思考题**（可直接作答并即时反馈）。
 *
 * ⛔ 这里**没有**任何描红、笔画、拼音相关的东西——
 *    那是小学的玩具。
 */
export function LiteraryLab({ lab }: LiteraryLabProps) {
  const classic = lab.classic ?? null;
  const point = lab.point ?? null;

  const [activeKeyword, setActiveKeyword] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [speakState, setSpeakState] = useState(false);

  const keywords = classic?.keywords ?? [];
  const keyword = keywords[activeKeyword] ?? null;

  /** 朗读选段。 */
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.78;
    synth.speak(utterance);
    setSpeakState(true);
    window.setTimeout(() => setSpeakState(false), 900);
  }, []);

  if (!classic) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
        <p className="text-[13px] text-slate-700">
          本讲未匹配到名篇原文——请回到视频完成精读，课后测验会覆盖本讲要点。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 篇名铭牌。 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 pb-3">
        <h3
          className="text-[20px] font-bold text-[#0B162C]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          《{classic.title}》
        </h3>
        <span className="text-[12px] font-medium text-slate-600">
          {classic.author}
        </span>
        <button
          type="button"
          onClick={() => speak(classic.excerpt)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-[#1D4ED8] hover:bg-blue-50"
        >
          <Volume2 size={13} />
          {speakState ? "朗读中…" : "朗读选段"}
        </button>
      </div>

      {/* 选段原文——关键词可点击高亮。 */}
      <div className="rounded-xl border border-slate-200 bg-[#FFFEFA] px-4 py-4">
        <p
          className="text-[15px] leading-[2.1] text-slate-800"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {classic.excerpt}
        </p>
      </div>

      {/* 关键词条。 */}
      {keywords.length > 0 ? (
        <div>
          <PanelTitle hint="点击关键词，看它的修辞手法、意象解析与白话对照。">
            关键词赏析
          </PanelTitle>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((item, index) => (
              <button
                key={item.term}
                type="button"
                onClick={() => setActiveKeyword(index)}
                aria-pressed={index === activeKeyword}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  index === activeKeyword
                    ? "border-[#B89B5E] bg-[#F5EFE2] text-[#0B162C]"
                    : "border-slate-300 bg-white text-slate-700 hover:border-[#B89B5E] hover:bg-[#FBF7EE]",
                )}
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {item.term}
              </button>
            ))}
          </div>

          {keyword ? (
            <motion.div
              key={keyword.term}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="mt-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <dl className="space-y-2.5 text-[13px]">
                <div className="flex gap-3">
                  <dt className="w-[68px] shrink-0 font-semibold text-[#0B162C]">
                    修辞手法
                  </dt>
                  <dd className="flex-1 text-slate-700">
                    <span className="rounded-md bg-[#F5EFE2] px-1.5 py-0.5 text-[12px] font-semibold text-[#7A6236]">
                      {keyword.device}
                    </span>
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-[68px] shrink-0 font-semibold text-[#0B162C]">
                    意象解析
                  </dt>
                  <dd className="flex-1 leading-relaxed text-slate-700">
                    {keyword.meaning}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-[68px] shrink-0 font-semibold text-[#0B162C]">
                    白话对照
                  </dt>
                  <dd className="flex-1 leading-relaxed text-slate-700">
                    {keyword.plain}
                  </dd>
                </div>
              </dl>
            </motion.div>
          ) : null}
        </div>
      ) : null}

      {/* 互动思考题。 */}
      {point ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-start gap-2">
            <Lightbulb size={15} className="mt-0.5 shrink-0 text-[#B89B5E]" />
            <div>
              <h4 className="text-[13px] font-bold text-[#0B162C]">
                互动思考题
              </h4>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-800">
                {point.question}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            {point.options.map((option, index) => {
              const isCorrect = index === point.correctIndex;
              const isChosen = chosen === index;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setChosen(index)}
                  className={cn(
                    "block w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                    chosen === null
                      ? "border-slate-300 bg-white text-slate-700 hover:border-[#1D4ED8] hover:bg-blue-50"
                      : isChosen && isCorrect
                        ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900"
                        : isChosen
                          ? "border-rose-400 bg-rose-50 font-medium text-rose-900"
                          : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  <span className="mr-1.5 font-semibold">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
          {chosen !== null ? (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed",
                chosen === point.correctIndex
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900",
              )}
            >
              {chosen === point.correctIndex
                ? "✅ 答对了。"
                : "再想想——"}
              {point.explanation}
            </motion.p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 二、小学数学 · 真实教具实验台
 * ────────────────────────────────────────────────────────────────── */

interface PrimaryMathLabProps {
  lab: InteractiveLab;
}

/**
 * 小学数学实验台。
 *
 * 按本课**真实知识点**自动切换教具：
 *
 * - ``numberline`` —— 数轴加减；
 * - ``blocks`` —— 凑十方块（十进制原理的可视化）；
 * - ``fraction`` —— 分数披萨 / 方格实时切分；
 * - ``area`` —— 周长面积动态方格；
 * - ``transform`` —— 图形平移与对称；
 * - ``ratio`` —— 比与比例。
 */
export function PrimaryMathLab({ lab }: PrimaryMathLabProps) {
  switch (lab.kind) {
    case "numberline":
      return <NumberLineLab lab={lab} />;
    case "blocks":
      return <BlocksLab lab={lab} />;
    case "fraction":
      return <FractionLab lab={lab} />;
    case "area":
      return <AreaLab lab={lab} />;
    case "transform":
      return <TransformLab lab={lab} />;
    case "ratio":
      return <RatioLab lab={lab} />;
    default:
      return <GenericMathFrame lab={lab} />;
  }
}

/** 数轴加减。 */
function NumberLineLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [value, setValue] = useState(params.value ?? -3);
  const [delta, setDelta] = useState(2);

  const min = -10;
  const max = 10;
  const toX = useCallback(
    (v: number) => 20 + ((v - min) / (max - min)) * 460,
    [],
  );

  return (
    <div className="space-y-4">
      <PanelTitle hint="拖动滑块看数轴上点的移动——负数在 0 的左边，越往左越小。">
        数轴加减
      </PanelTitle>

      <svg
        viewBox="0 0 500 120"
        className="w-full rounded-xl border border-slate-200 bg-white"
        role="img"
        aria-label="数轴"
      >
        <line x1="20" y1="60" x2="480" y2="60" stroke="#334155" strokeWidth="2" />
        <polygon points="480,60 470,55 470,65" fill="#334155" />
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <g key={n}>
            <line
              x1={toX(n)}
              y1="54"
              x2={toX(n)}
              y2="66"
              stroke="#94A3B8"
              strokeWidth="1.5"
            />
            <text
              x={toX(n)}
              y="84"
              fontSize="11"
              textAnchor="middle"
              fill={n === 0 ? "#0B162C" : "#64748B"}
              fontWeight={n === 0 ? 700 : 400}
            >
              {n}
            </text>
          </g>
        ))}
        <motion.circle
          animate={{ cx: toX(value), cy: 60 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          r="8"
          fill="#1D4ED8"
        />
      </svg>

      <div className="space-y-2.5">
        <Slider
          label="起点"
          value={value}
          min={min}
          max={max}
          onChange={setValue}
        />
        <Slider
          label="移动"
          value={delta}
          min={-10}
          max={10}
          onChange={setDelta}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <ToolButton onClick={() => setValue(value + delta)}>
          加上 {delta}
        </ToolButton>
        <ToolButton onClick={() => setValue(value - delta)}>
          减去 {delta}
        </ToolButton>
        <ToolButton onClick={() => setValue(0)}>回到 0</ToolButton>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-800">
        {value} {delta >= 0 ? "+" : "−"} {Math.abs(delta)} ={" "}
        <strong className="text-[#0B162C]">{value + delta}</strong>
      </p>
    </div>
  );
}

/** 凑十方块。 */
function BlocksLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const target = lab.target ?? params.count ?? 10;
  const [tens, setTens] = useState(0);
  const [ones, setOnes] = useState(0);

  const total = tens * 10 + ones;
  const need = Math.max(0, target - total);

  return (
    <div className="space-y-4">
      <PanelTitle hint="十根小棒捆成一捆就是「1 个十」。拖够小棒，看数字怎么长出来。">
        凑十 · 十进制方块
      </PanelTitle>

      <div className="flex flex-wrap gap-4">
        {/* 十捆。 */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-slate-700">
            十捆（1 捆 = 10 根）
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.max(tens, 0) }, (_, i) => (
              <motion.div
                key={`t${i}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex h-9 w-9 flex-col justify-center rounded-md border border-[#1E3A8A] bg-[#DBEAFE] text-center"
              >
                <span className="text-[10px] font-bold leading-none text-[#122344]">
                  10
                </span>
              </motion.div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <ToolButton onClick={() => setTens(Math.max(0, tens - 1))}>
              −1 捆
            </ToolButton>
            <ToolButton onClick={() => setTens(Math.min(12, tens + 1))}>
              +1 捆
            </ToolButton>
          </div>
        </div>

        {/* 单根。 */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-slate-700">
            单根（1 根 = 1 个一）
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: Math.max(ones, 0) }, (_, i) => (
              <motion.div
                key={`o${i}`}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="h-9 w-[7px] rounded-sm bg-[#1D4ED8]"
              />
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <ToolButton onClick={() => setOnes(Math.max(0, ones - 1))}>
              −1 根
            </ToolButton>
            <ToolButton onClick={() => setOnes(Math.min(20, ones + 1))}>
              +1 根
            </ToolButton>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
        <p className="font-mono text-[15px] text-slate-800">
          {tens} 个十 + {ones} 个一 ={" "}
          <strong className="text-[#0B162C]">{total}</strong>
        </p>
        {need > 0 ? (
          <p className="mt-1 text-[12px] text-slate-600">
            还需要 <strong className="text-[#0B162C]">{need}</strong> 才能凑成{" "}
            {target}——先补满一捆（十），剩下的才是零头，这就是「凑十法」。
          </p>
        ) : (
          <p className="mt-1 text-[12px] font-medium text-emerald-800">
            ✓ 正好凑成 {target}！这就是「凑十法」的全部秘密。
          </p>
        )}
      </div>
    </div>
  );
}

/** 分数披萨。 */
function FractionLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [denominator, setDenominator] = useState(
    lab.slices ?? params.denominator ?? 4,
  );
  const [numerator, setNumerator] = useState(
    Math.min(params.numerator ?? 1, denominator),
  );

  const slices = Array.from({ length: denominator }, (_, i) => i);

  return (
    <div className="space-y-4">
      <PanelTitle hint="把披萨平均切成同样多的份，涂出其中几份——这就是分数。">
        分数 · 实时切分
      </PanelTitle>

      <div className="flex flex-wrap items-center gap-5">
        <svg
          viewBox="0 0 120 120"
          className="h-[150px] w-[150px] shrink-0 rounded-full border border-slate-200 bg-white"
          role="img"
          aria-label="分数披萨"
        >
          {slices.map((i) => {
            const angle = (i / denominator) * Math.PI * 2 - Math.PI / 2;
            const next = ((i + 1) / denominator) * Math.PI * 2 - Math.PI / 2;
            const r = 56;
            const cx = 60;
            const cy = 60;
            const x1 = cx + r * Math.cos(angle);
            const y1 = cy + r * Math.sin(angle);
            const x2 = cx + r * Math.cos(next);
            const y2 = cy + r * Math.sin(next);
            const large = denominator > 2 ? 1 : 0;
            const filled = i < numerator;
            return (
              <motion.path
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
                fill={filled ? "#1D4ED8" : "#F1F5F9"}
                stroke="#FFFFFF"
                strokeWidth="2"
                onClick={() => setNumerator(i + 1)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>

        <div className="min-w-[180px] flex-1 space-y-3">
          <Slider
            label="涂几份"
            value={numerator}
            min={0}
            max={denominator}
            onChange={setNumerator}
          />
          <Slider
            label="切成几份"
            value={denominator}
            min={2}
            max={12}
            onChange={(next) => {
              setDenominator(next);
              setNumerator((current) => Math.min(current, next));
            }}
          />
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[15px] text-slate-800">
            {numerator}/{denominator}
            {denominator === 2 ? " = 1/2" : ""}
          </p>
          <p className="text-[12px] leading-relaxed text-slate-600">
            分数表示**平均分**里的一部分——「平均」两个字是关键。份数越多，每份越小。
          </p>
        </div>
      </div>
    </div>
  );
}

/** 面积与周长。 */
function AreaLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [length, setLength] = useState(params.length ?? 6);
  const [width, setWidth] = useState(params.width ?? 4);

  const cell = 26;
  const maxLen = 10;
  const maxWid = 8;

  return (
    <div className="space-y-4">
      <PanelTitle hint="拖动长与宽，看方格怎样铺满——面积是「里面有多少格」，周长是「外面有多长」。">
        周长与面积 · 动态方格
      </PanelTitle>

      <svg
        viewBox={`0 0 ${maxLen * cell + 16} ${maxWid * cell + 16}`}
        className="w-full max-w-[420px] rounded-xl border border-slate-200 bg-white"
        role="img"
        aria-label="面积方格"
      >
        {Array.from({ length: maxLen * maxWid }, (_, i) => {
          const row = Math.floor(i / maxLen);
          const col = i % maxLen;
          const inside = col < length && row < width;
          return (
            <motion.rect
              key={i}
              initial={false}
              animate={{
                fill: inside ? "#DBEAFE" : "#FFFFFF",
                stroke: inside ? "#1D4ED8" : "#E2E8F0",
              }}
              transition={{ duration: 0.18 }}
              x={8 + col * cell}
              y={8 + row * cell}
              width={cell}
              height={cell}
              strokeWidth="1"
            />
          );
        })}
        <text
          x={8 + (length * cell) / 2}
          y={8 + width * cell + 18}
          fontSize="12"
          textAnchor="middle"
          fill="#0B162C"
          fontWeight={700}
        >
          {length}
        </text>
        <text
          x={8 + length * cell + 14}
          y={8 + (width * cell) / 2}
          fontSize="12"
          textAnchor="middle"
          fill="#0B162C"
          fontWeight={700}
        >
          {width}
        </text>
      </svg>

      <div className="space-y-2.5">
        <Slider
          label="长"
          value={length}
          min={1}
          max={maxLen}
          onChange={setLength}
        />
        <Slider
          label="宽"
          value={width}
          min={1}
          max={maxWid}
          onChange={setWidth}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-600">周长</p>
          <p className="font-mono text-[16px] font-bold text-[#0B162C]">
            {(length + width) * 2}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-600">面积</p>
          <p className="font-mono text-[16px] font-bold text-[#0B162C]">
            {length * width}
          </p>
        </div>
      </div>
    </div>
  );
}

/** 平移与对称。 */
function TransformLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [offset, setOffset] = useState(params.offset ?? 2);
  const [mirror, setMirror] = useState(false);

  return (
    <div className="space-y-4">
      <PanelTitle hint="拖动滑块让图形平移；打开镜像看轴对称——平移不改变形状，对称把图形翻过来。">
        平移与对称
      </PanelTitle>

      <svg
        viewBox="0 0 460 160"
        className="w-full rounded-xl border border-slate-200 bg-white"
        role="img"
        aria-label="平移与对称"
      >
        <line
          x1="230"
          y1="12"
          x2="230"
          y2="148"
          stroke="#B89B5E"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        <text x="236" y="24" fontSize="11" fill="#7A6236">
          对称轴
        </text>

        {/* 原图。 */}
        <polygon
          points="60,130 130,130 95,45"
          fill="#DBEAFE"
          stroke="#1D4ED8"
          strokeWidth="2"
        />
        <text x="78" y="150" fontSize="11" fill="#64748B">
          原图
        </text>

        {/* 平移 + 镜像后的图。 */}
        <motion.g
          animate={{ x: mirror ? -offset * 26 : offset * 26 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <polygon
            points={
              mirror
                ? "370,130 300,130 335,45"
                : "300,130 370,130 335,45"
            }
            fill="#F5EFE2"
            stroke="#B89B5E"
            strokeWidth="2"
          />
        </motion.g>
        <text x="310" y="150" fontSize="11" fill="#64748B">
          变换后
        </text>
      </svg>

      <div className="space-y-2.5">
        <Slider
          label="平移格数"
          value={offset}
          min={-6}
          max={6}
          onChange={setOffset}
        />
      </div>

      <div className="flex gap-2">
        <ToolButton active={!mirror} onClick={() => setMirror(false)}>
          平移
        </ToolButton>
        <ToolButton active={mirror} onClick={() => setMirror(true)}>
          轴对称
        </ToolButton>
        <ToolButton onClick={() => setOffset(0)}>
          <RotateCcw size={12} className="mr-1 inline" />
          复位
        </ToolButton>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-700">
        {mirror
          ? "轴对称：沿对称轴翻折，两边完全重合——形状大小都不变，方向变了。"
          : "平移：整个图形沿一个方向滑动，**形状和大小完全不变**，只有位置变了。"}
      </p>
    </div>
  );
}

/** 比与比例。 */
function RatioLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [a, setA] = useState(params.a2 ?? 1);
  const [b, setB] = useState(params.b2 ?? 9);

  const total = a + b;
  const aPct = total > 0 ? (a / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <PanelTitle hint="两个量一起放大缩小，比不变——这就是「比的基本性质」。">
        比与比例
      </PanelTitle>

      <div className="flex h-14 w-full overflow-hidden rounded-lg border border-slate-200">
        <motion.div
          animate={{ width: `${aPct}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="flex items-center justify-center bg-[#1D4ED8] text-[12px] font-bold text-white"
        >
          {a}
        </motion.div>
        <div
          className="flex items-center justify-center bg-[#F5EFE2] text-[12px] font-bold text-[#7A6236]"
          style={{ width: `${100 - aPct}%` }}
        >
          {b}
        </div>
      </div>

      <div className="space-y-2.5">
        <Slider label="前项" value={a} min={1} max={12} onChange={setA} />
        <Slider label="后项" value={b} min={1} max={12} onChange={setB} />
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[14px] text-slate-800">
        {a} : {b} = {(b === 0 ? 0 : a / b).toFixed(2)} · 前项占{" "}
        <strong className="text-[#0B162C]">{aPct.toFixed(1)}%</strong>
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 三、初高中数学 · 动态实验台
 * ────────────────────────────────────────────────────────────────── */

interface SecondaryMathLabProps {
  lab: InteractiveLab;
}

/**
 * 初高中数学实验台。
 *
 * - ``function`` —— 函数图像绘制器（一次 / 二次 / 反比例 / 三角）；
 * - ``geometry`` —— 动态几何（角度、面积、三角形、圆）；
 * - ``algebra`` —— 代数求解（一元一次 / 一元二次 / 分式）；
 * - ``probability`` —— 概率模拟（抛硬币、掷骰子、抽样）。
 */
export function SecondaryMathLab({ lab }: SecondaryMathLabProps) {
  switch (lab.kind) {
    case "function":
      return <FunctionGraphLab lab={lab} />;
    case "geometry":
      return <DynamicGeometryLab lab={lab} />;
    case "algebra":
      return <AlgebraLab lab={lab} />;
    case "probability":
      return <ProbabilityLab lab={lab} />;
    default:
      return <GenericMathFrame lab={lab} />;
  }
}

/** 通用数学框架——有知识点信息时的兜底展示。 */
function GenericMathFrame({ lab }: { lab: InteractiveLab }) {
  const topic = lab.mathTopic ?? null;
  return (
    <div className="space-y-3">
      <PanelTitle hint="本讲的核心定义。">
        {topic?.title ?? lab.title}
      </PanelTitle>
      {topic?.definition ? (
        <p className="rounded-xl border border-slate-200 bg-[#FFFEFA] px-4 py-3 text-[13px] leading-relaxed text-slate-800">
          {topic.definition}
        </p>
      ) : null}
      <p className="text-[12px] leading-relaxed text-slate-600">
        本讲的互动参数正在按教材单元校准。回到视频完成精讲，课后测验会覆盖本讲要点。
      </p>
    </div>
  );
}

/** 函数图像绘制器。 */
function FunctionGraphLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [a, setA] = useState(params.a ?? 1);
  const [b, setB] = useState(params.b ?? 0);
  const [kind, setKind] = useState<"linear" | "quadratic" | "inverse" | "trig">(
    params.type === "inverse" ? "inverse" : "quadratic",
  );

  const W = 420;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2;
  const scale = 22;

  const path = useMemo(() => {
    const pts: string[] = [];
    for (let px = -10; px <= 10; px += 0.1) {
      let y: number;
      switch (kind) {
        case "linear":
          y = a * px + b;
          break;
        case "quadratic":
          y = a * px * px + b;
          break;
        case "inverse":
          y = a / px;
          break;
        default:
          y = a * Math.sin(px) + b;
          break;
      }
      if (!Number.isFinite(y)) continue;
      const x = cx + px * scale;
      const yy = cy - y * scale;
      if (x < -20 || x > W + 20) continue;
      pts.push(`${x.toFixed(1)},${yy.toFixed(1)}`);
    }
    return `M ${pts.join(" L ")}`;
  }, [a, b, kind, cx, cy, scale]);

  const axes = useMemo(() => {
    const lines: string[] = [];
    for (let i = -10; i <= 10; i += 1) {
      lines.push(`M ${cx + i * scale},0 L ${cx + i * scale},${H}`);
      lines.push(`M 0,${cy + i * scale} L ${W},${cy + i * scale}`);
    }
    return lines.join(" ");
  }, [cx, cy, scale]);

  const labels = useMemo(() => {
    const out: Array<{ x: number; y: number; text: string }> = [];
    for (let i = -10; i <= 10; i += 2) {
      out.push({ x: cx + i * scale, y: cy + 15, text: String(i) });
      out.push({ x: cx - 10, y: cy - i * scale + 4, text: String(i) });
    }
    return out;
  }, [cx, cy, scale]);

  const formula =
    kind === "linear"
      ? `y = ${a}x + ${b}`
      : kind === "quadratic"
        ? `y = ${a}x² + ${b}`
        : kind === "inverse"
          ? `y = ${a}/x`
          : `y = ${a}sin x + ${b}`;

  return (
    <div className="space-y-4">
      <PanelTitle hint="拖动参数看图象怎么变——这就是「参数决定形状」。">
        函数图象绘制器
      </PanelTitle>

      <div className="flex flex-wrap gap-2">
        <ToolButton active={kind === "linear"} onClick={() => setKind("linear")}>
          一次函数
        </ToolButton>
        <ToolButton
          active={kind === "quadratic"}
          onClick={() => setKind("quadratic")}
        >
          二次函数
        </ToolButton>
        <ToolButton
          active={kind === "inverse"}
          onClick={() => setKind("inverse")}
        >
          反比例函数
        </ToolButton>
        <ToolButton active={kind === "trig"} onClick={() => setKind("trig")}>
          三角函数
        </ToolButton>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl border border-slate-200 bg-white"
        role="img"
        aria-label="函数图象"
      >
        <path d={axes} stroke="#E2E8F0" strokeWidth="1" fill="none" />
        <line
          x1={cx}
          y1="0"
          x2={cx}
          y2={H}
          stroke="#334155"
          strokeWidth="1.5"
        />
        <line
          x1="0"
          y1={cy}
          x2={W}
          y2={cy}
          stroke="#334155"
          strokeWidth="1.5"
        />
        {labels.map((item, index) => (
          <text
            key={index}
            x={item.x}
            y={item.y}
            fontSize="9"
            fill="#94A3B8"
            textAnchor="middle"
          >
            {item.text}
          </text>
        ))}
        <motion.path
          key={formula}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5 }}
          d={path}
          stroke="#1D4ED8"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>

      <div className="space-y-2.5">
        {kind === "inverse" ? (
          <Slider label="k" value={a} min={-6} max={6} step={0.5} onChange={setA} />
        ) : kind === "trig" ? (
          <Slider label="A" value={a} min={0.5} max={4} step={0.5} onChange={setA} />
        ) : (
          <Slider
            label="a"
            value={a}
            min={-4}
            max={4}
            step={0.5}
            onChange={setA}
          />
        )}
        {kind !== "inverse" ? (
          <Slider label="b" value={b} min={-6} max={6} step={0.5} onChange={setB} />
        ) : null}
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[15px] font-semibold text-[#0B162C]">
        {formula}
      </p>
    </div>
  );
}

/** 动态几何。 */
function DynamicGeometryLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [angle, setAngle] = useState(params.angle ?? 40);
  const [sides, setSides] = useState(params.sides ?? 3);

  const radius = 72;
  const cx = 150;
  const cy = 110;

  const points = useMemo(() => {
    return Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
    });
  }, [sides, cx, cy]);

  const area = useMemo(() => {
    if (sides < 3) return 0;
    return (
      (sides * radius * radius * Math.sin((2 * Math.PI) / sides)) / 2
    );
  }, [sides, radius]);

  const perimeter = 2 * sides * radius * Math.sin(Math.PI / sides);

  return (
    <div className="space-y-4">
      <PanelTitle hint="拖动边数与角度，看形状与数据怎么一起变。">
        动态几何
      </PanelTitle>

      <div className="flex flex-wrap items-center gap-5">
        <svg
          viewBox="0 0 300 200"
          className="h-[200px] w-[300px] shrink-0 rounded-xl border border-slate-200 bg-white"
          role="img"
          aria-label="几何图形"
        >
          <motion.polygon
            animate={{ points: points.map((p) => `${p.x},${p.y}`).join(" ") }}
            transition={{ type: "spring", stiffness: 180, damping: 20 }}
            fill="#DBEAFE"
            stroke="#1D4ED8"
            strokeWidth="2"
          />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#0B162C" />
          ))}
          {/* 一个角。 */}
          {points.length >= 2 ? (
            <path
              d={`M ${points[0].x},${points[0].y} L ${cx + 42},${cy} L ${cx + 42 * Math.cos(angle * (Math.PI / 180))},${cy + 42 * Math.sin(angle * (Math.PI / 180))}`}
              stroke="#B89B5E"
              strokeWidth="1.5"
              fill="none"
            />
          ) : null}
        </svg>

        <div className="min-w-[200px] flex-1 space-y-2.5">
          <Slider
            label="边数"
            value={sides}
            min={3}
            max={8}
            onChange={setSides}
          />
          <Slider
            label="角度"
            value={angle}
            min={0}
            max={180}
            suffix="°"
            onChange={setAngle}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-medium text-slate-600">面积</p>
              <p className="font-mono text-[14px] font-bold text-[#0B162C]">
                {area.toFixed(1)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-medium text-slate-600">周长</p>
              <p className="font-mono text-[14px] font-bold text-[#0B162C]">
                {perimeter.toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 代数求解。 */
function AlgebraLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [a, setA] = useState(params.a ?? 2);
  const [b, setB] = useState(params.b ?? -5);

  // 解 ax + b = 0
  const hasSolution = a !== 0;
  const x = hasSolution ? -b / a : null;

  return (
    <div className="space-y-4">
      <PanelTitle hint="拖动系数，看方程的解怎么移动——系数决定方向。">
        一元一次方程求解
      </PanelTitle>

      <svg
        viewBox="0 0 420 200"
        className="w-full rounded-xl border border-slate-200 bg-white"
        role="img"
        aria-label="方程图像"
      >
        <line
          x1="20"
          y1="100"
          x2="400"
          y2="100"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <line
          x1="210"
          y1="12"
          x2="210"
          y2="188"
          stroke="#334155"
          strokeWidth="1.5"
        />
        {[-10, -5, 5, 10].map((n) => (
          <g key={n}>
            <line
              x1={210 + n * 18}
              y1="96"
              x2={210 + n * 18}
              y2="104"
              stroke="#94A3B8"
              strokeWidth="1.5"
            />
            <text
              x={210 + n * 18}
              y="118"
              fontSize="10"
              textAnchor="middle"
              fill="#94A3B8"
            >
              {n}
            </text>
          </g>
        ))}
        <motion.line
          animate={{
            x1: 20,
            y1: 100 - (a * -10 + b) * 6,
            x2: 400,
            y2: 100 - (a * 10 + b) * 6,
          }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}
          stroke="#1D4ED8"
          strokeWidth="2.5"
        />
        {x !== null && x >= -10 && x <= 10 ? (
          <motion.circle
            animate={{ cx: 210 + x * 18, cy: 100 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            r="6"
            fill="#B89B5E"
          />
        ) : null}
      </svg>

      <div className="space-y-2.5">
        <Slider label="a" value={a} min={-5} max={5} onChange={setA} />
        <Slider label="b" value={b} min={-10} max={10} onChange={setB} />
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[14px] text-slate-800">
        {a}x {b >= 0 ? "+" : "−"} {Math.abs(b)} = 0 ⟹{" "}
        <strong className="text-[#0B162C]">
          {hasSolution ? `x = ${x!.toFixed(2)}` : "无解（a = 0）"}
        </strong>
      </p>
    </div>
  );
}

/** 概率模拟。 */
function ProbabilityLab({ lab }: { lab: InteractiveLab }) {
  const params = lab.params ?? {};
  const [p, setP] = useState(params.p ?? 0.5);
  const [trials, setTrials] = useState(params.trials ?? 100);
  const [heads, setHeads] = useState(0);
  const [running, setRunning] = useState(false);

  const run = useCallback(() => {
    setRunning(true);
    let count = 0;
    let done = 0;
    const timer = window.setInterval(() => {
      if (Math.random() < p) count += 1;
      done += 1;
      if (done >= trials) {
        window.clearInterval(timer);
        setHeads(count);
        setRunning(false);
      }
    }, 12);
  }, [p, trials]);

  const observed = trials > 0 ? heads / trials : 0;

  return (
    <div className="space-y-4">
      <PanelTitle hint="模拟次数越多，实测频率越接近理论概率——这就是大数定律。">
        概率模拟
      </PanelTitle>

      <div className="flex h-32 w-full items-end gap-0.5 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
        {Array.from({ length: 40 }, (_, i) => {
          const ratio = (i + 1) / 40;
          const bar = ratio <= observed ? ratio : 0;
          const theory = ratio <= p ? ratio : 0;
          return (
            <div key={i} className="flex-1">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${bar * 100}%` }}
                transition={{ duration: 0.2 }}
                className="w-full rounded-t-sm bg-[#1D4ED8]"
                style={{ minHeight: bar > 0 ? 2 : 0 }}
              />
              <div
                className="w-full rounded-t-sm bg-[#B89B5E]/40"
                style={{ height: `${theory * 100}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="space-y-2.5">
        <Slider
          label="理论概率 p"
          value={p}
          min={0.1}
          max={0.9}
          step={0.1}
          onChange={setP}
        />
        <Slider
          label="模拟次数"
          value={trials}
          min={20}
          max={500}
          step={20}
          onChange={setTrials}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <ToolButton onClick={run}>
          <Play size={12} className="mr-1 inline" />
          {running ? "模拟中…" : "运行模拟"}
        </ToolButton>
        <ToolButton onClick={() => setHeads(0)}>
          <RotateCcw size={12} className="mr-1 inline" />
          清空
        </ToolButton>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-600">次数</p>
          <p className="font-mono text-[15px] font-bold text-[#0B162C]">
            {trials}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-600">成功</p>
          <p className="font-mono text-[15px] font-bold text-[#0B162C]">
            {heads}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-600">实测频率</p>
          <p className="font-mono text-[15px] font-bold text-[#0B162C]">
            {observed.toFixed(3)}
          </p>
        </div>
      </div>
    </div>
  );
}
