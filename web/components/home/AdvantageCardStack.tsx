"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * OE 核心优势 · 可点击叠加卡片栈
 * ===============================
 *
 * 四张 100% 实心纯白卡片，前后纵深叠放。
 *
 * 为什么是「卡片栈」而不是「四宫格」
 * ------------------------------
 *
 * 四宫格的问题在于：四个卖点**同时可见 = 同时不重要**。读者的视线
 * 会在四块等权重的信息之间来回弹，最后哪儿都没看进去。
 *
 * 卡片栈给出一个**明确的主次**：
 *
 * - 顶层卡片 = 完整展示当前卖点（标题 + 正文 + 示意图）；
 * - 下层卡片 = 只露出边缘，一眼看出「后面还有」；
 * - 每次点击，**一张退到栈底**，下一张补上来。
 *
 * 于是读者在 4 次点击里，会**逐个**读完 4 个卖点——而不是扫 4 个标题。
 *
 * 交互细节
 * --------
 *
 * - 点击**顶层卡片本身**即可切换（不只是箭头）；
 * - 底部有 ``← / →`` 与 ``01 / 04`` 指示器；
 * - 退到栈底的卡片用 ``AnimatePresence`` 做**弹性位移**，而不是
 *   瞬移——这是「实体卡片组」质感的关键；
 * - 每张卡片配一幅**极简线条 SVG 示意**，不依赖任何图片素材。
 */

/** 一张优势卡的定义。 */
interface AdvantageCard {
  id: string;
  no: string;
  title: string;
  body: string;
  /** 示意图。 */
  art: "manipulative" | "eastwest" | "tracking" | "certificate";
}

/** 四张卡的内容。 */
const CARDS: AdvantageCard[] = [
  {
    id: "manipulative",
    no: "01",
    title: "学科专属动态教具",
    body: "动态量角器、实时函数坐标系、互动统计图、汉字笔顺溯源——随课程内容自动精准装配，让抽象概念触手可及。",
    art: "manipulative",
  },
  {
    id: "eastwest",
    no: "02",
    title: "东方文脉 × 基础数理",
    body: "语文聚焦中国文化通识与经典思辨，数学深耕基础数学思维研究，真正回应全球华裔青少年的成长需求。",
    art: "eastwest",
  },
  {
    id: "tracking",
    no: "03",
    title: "实时行为级学习追踪",
    body: "超越单纯的视频计时，实时追踪每一次教具探索与巩固答题，让 AI 伴学与学情中心精准看见成长轨迹。",
    art: "tracking",
  },
  {
    id: "certificate",
    no: "04",
    title: "系统路径与修习认证",
    body: "从现代精炼短课、动手探究到巩固通关，完整沉淀每阶段收获并颁发梦想课堂 × OE 修习证书。",
    art: "certificate",
  },
];

export default function AdvantageCardStack() {
  const [index, setIndex] = useState(0);

  const prev = useCallback(() => {
    setIndex((value) => (value - 1 + CARDS.length) % CARDS.length);
  }, []);

  const next = useCallback(() => {
    setIndex((value) => (value + 1) % CARDS.length);
  }, []);

  return (
    <div className="relative w-full">
      {/* ── 卡片栈 ── */}
      <div
        className="relative h-[420px] w-full sm:h-[440px]"
        role="group"
        aria-roledescription="轮播"
        aria-label="OE 核心优势"
      >
        {CARDS.map((card, cardIndex) => {
          /** 该卡在栈中的层位：0 = 顶层。 */
          const depth = (cardIndex - index + CARDS.length) % CARDS.length;
          const isTop = depth === 0;

          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={isTop ? next : undefined}
              aria-hidden={!isTop}
              tabIndex={isTop ? 0 : -1}
              className={cn(
                "absolute inset-0 flex w-full flex-col overflow-hidden rounded-2xl p-6 text-left",
                // 100% 不透明实心纯白——**绝不半透明**。
                "border border-[#E5E7EB] bg-white",
                "shadow-[0_20px_50px_-15px_rgba(11,22,44,0.12)]",
                !isTop && "pointer-events-none",
              )}
              initial={false}
              animate={{
                // 层位越深：缩得越小、往下沉、微微歪斜。
                x: isTop ? 0 : depth * -14,
                y: isTop ? 0 : depth * 16,
                scale: isTop ? 1 : 1 - depth * 0.045,
                rotate: isTop ? 0 : depth * -1.8,
                opacity: isTop ? 1 : 1 - depth * 0.16,
                zIndex: CARDS.length - depth,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
            >
              {/* 顶部香槟金细线。 */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(184,155,94,0) 0%, #B89B5E 35%, #B89B5E 65%, rgba(184,155,94,0) 100%)",
                }}
              />

              {/* 序号 + 标题。 */}
              <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-semibold tracking-[0.18em] text-[#B89B5E] tabular-nums">
                  {card.no}
                </span>
                {isTop ? (
                  <span className="rounded-full bg-[#F8F7F4] px-2.5 py-1 text-[10.5px] text-[#55606E]">
                    点击卡片切换
                  </span>
                ) : null}
              </div>

              <h3 className="oe-display mt-3 text-[21px] leading-snug text-[#0B162C]">
                {card.title}
              </h3>
              <p className="mt-3 text-[13px] leading-[1.9] text-[#1E293B]">
                {card.body}
              </p>

              {/* 示意图——撑住卡片下半部分的高度，避免大片留白。 */}
              <div className="mt-auto flex flex-1 items-end justify-center pt-5">
                <CardArt kind={card.art} />
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* ── 指示器 ── */}
      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          {CARDS.map((card, cardIndex) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setIndex(cardIndex)}
              aria-label={`第 ${card.no} 张：${card.title}`}
              aria-current={cardIndex === index}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                cardIndex === index
                  ? "w-6 bg-[#0B162C]"
                  : "w-1.5 bg-[#D8DEE7] hover:bg-[#B89B5E]",
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[11.5px] tabular-nums text-[#8A93A0]">
            {String(index + 1).padStart(2, "0")} / {String(CARDS.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={prev}
            aria-label="上一张"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#0F172A] transition-colors hover:border-[#B89B5E]"
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="下一张"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#0F172A] transition-colors hover:border-[#B89B5E]"
          >
            <ChevronRight size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 卡片内的极简线条示意图。 */
function CardArt({ kind }: { kind: AdvantageCard["art"] }) {
  if (kind === "manipulative") {
    return (
      <svg viewBox="0 0 240 116" className="h-[116px] w-full" aria-hidden="true">
        {/* 坐标系 + 抛物线 + 滑块。 */}
        <line x1="18" y1="98" x2="222" y2="98" stroke="#D8DEE7" strokeWidth="1" />
        <line x1="60" y1="14" x2="60" y2="98" stroke="#D8DEE7" strokeWidth="1" />
        <path
          d="M 66 92 Q 120 6 176 92"
          fill="none"
          stroke="#1D4ED8"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="120" cy="49" r="4" fill="#1D4ED8" />
        <line x1="120" y1="49" x2="120" y2="98" stroke="#1D4ED8" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        {/* 量角器。 */}
        <path d="M 186 92 A 26 26 0 0 1 210 68" fill="none" stroke="#B89B5E" strokeWidth="1.8" />
        <line x1="186" y1="92" x2="210" y2="68" stroke="#0B162C" strokeWidth="1.4" />
      </svg>
    );
  }

  if (kind === "eastwest") {
    return (
      <svg viewBox="0 0 240 116" className="h-[116px] w-full" aria-hidden="true">
        {/* 竖轴（东方）+ 横轴（西方）。 */}
        <line x1="120" y1="12" x2="120" y2="104" stroke="#0B162C" strokeWidth="1.6" />
        <line x1="36" y1="58" x2="204" y2="58" stroke="#1D4ED8" strokeWidth="1.6" />
        <circle cx="120" cy="58" r="20" fill="none" stroke="#B89B5E" strokeWidth="1.8" />
        {/* 书卷。 */}
        <path d="M 40 44 L 40 72 Q 52 66 64 72 L 64 44 Q 52 38 40 44 Z" fill="none" stroke="#0B162C" strokeWidth="1.4" />
        {/* 数字曲线。 */}
        <path d="M 178 76 L 186 52 L 194 62 L 202 40" fill="none" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === "tracking") {
    return (
      <svg viewBox="0 0 240 116" className="h-[116px] w-full" aria-hidden="true">
        {/* 折线轨迹 + 节点。 */}
        <path
          d="M 20 88 L 62 66 L 104 74 L 146 40 L 188 52 L 220 22"
          fill="none"
          stroke="#1D4ED8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[
          [20, 88],
          [62, 66],
          [104, 74],
          [146, 40],
          [188, 52],
        ].map(([cx, cy], index) => (
          <circle key={index} cx={cx} cy={cy} r="3.6" fill="#fff" stroke="#1D4ED8" strokeWidth="2" />
        ))}
        <circle cx="220" cy="22" r="5" fill="#B89B5E" />
        {/* 里程碑。 */}
        <line x1="20" y1="102" x2="220" y2="102" stroke="#E5E7EB" strokeWidth="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 240 116" className="h-[116px] w-full" aria-hidden="true">
      {/* 证书 + 蜡封。 */}
      <rect x="46" y="14" width="132" height="88" rx="4" fill="none" stroke="#0B162C" strokeWidth="1.6" />
      <rect x="54" y="22" width="116" height="72" rx="2" fill="none" stroke="#B89B5E" strokeWidth="1" />
      <line x1="72" y1="42" x2="152" y2="42" stroke="#0B162C" strokeWidth="1.4" />
      <line x1="72" y1="54" x2="152" y2="54" stroke="#C7CEDA" strokeWidth="1.2" />
      <line x1="84" y1="66" x2="140" y2="66" stroke="#C7CEDA" strokeWidth="1.2" />
      {/* 蜡封。 */}
      <circle cx="178" cy="88" r="17" fill="#0B162C" />
      <circle cx="178" cy="88" r="11" fill="none" stroke="#B89B5E" strokeWidth="1.6" />
      <path d="M 172 88 L 177 93 L 185 83" fill="none" stroke="#B89B5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
