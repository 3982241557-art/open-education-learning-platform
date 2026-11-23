"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * OE 核心优势 · 物理弹簧悬停叠卡
 * ==================================
 *
 * 四张 100% 实心纯白卡片，**阶梯扇形**错落叠放。
 *
 * 为什么是「叠卡」而不是「四宫格」
 * ------------------------------
 *
 * 四宫格的问题在于：四个卖点**同时可见 = 同时不重要**。读者的视线
 * 会在四块等权重的信息之间来回弹，最后哪儿都没看进去。
 *
 * 叠卡给出一个**明确的主次**：
 *
 * - 顶层卡片 = 完整展示当前卖点（编号 + 标题 + 正文 + 示意图）；
 * - 下层卡片 = 只露出**顶部边角与编号**，一眼看出「后面还有」；
 * - 每次点击，**一张退到栈底**，下一张补上来。
 *
 * 交互手感（苹果级实体触感）
 * --------------------------
 *
 * .. code-block:: text
 *
 *     Hover 任意一张 → 该卡上跃 y:-16 / scale:1.04 / 阴影加深
 *                     其余卡片**轻微避让**（各自向外偏移一点）
 *     Click 任意一张 → 该卡被抽到最顶层，其余顺次下沉
 *     点击顶层卡 / 底部圆点 / 箭头 → 顺滑轮换
 *
 * 全部用 framer-motion 的**物理弹簧**（``type: "spring"``），
 * 而不是 ``duration`` + ``ease``——弹簧有**过冲与回稳**，这是
 * 「实体卡片」的观感来源。定时缓动永远做不出这种手感。
 *
 * ⛔ **视觉铁律**：卡片底色 100% 实心纯白（``#FFFFFF``），**绝不**
 *    半透明。阴影是唯一允许的「轻」——它不是底色。
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
    title: "PhET 级动态交互教具",
    body: "分数构建、面积模型、等式天平、函数图像与统计分布——每个概念都配一个能上手拖动的实验台，抽象立刻变成手感。",
    art: "manipulative",
  },
  {
    id: "eastwest",
    no: "02",
    title: "东方文脉 × 基础数理",
    body: "语文深挖中国文化通识与经典思辨，数学深耕基础数学思维研究——真正回应全球华裔青少年的成长需求。",
    art: "eastwest",
  },
  {
    id: "tracking",
    no: "03",
    title: "Khanmigo 式启发伴学与星级追踪",
    body: "AI 伴学从不甩答案，只做启发式追问；每一次动手探索与思考都会点亮一颗星，让成长看得见轨迹。",
    art: "tracking",
  },
  {
    id: "certificate",
    no: "04",
    title: "梦想课堂 × OE 修习认证与 Result Report",
    body: "从单元徽章到中英双语结业报告，星星、徽章与能力雷达被完整沉淀成一份可打印的成长档案。",
    art: "certificate",
  },
];

export default function AdvantageCardStack() {
  const [index, setIndex] = useState(0);
  /** 当前被悬停的卡片 id——``null`` 表示没有悬停。 */
  const [hovered, setHovered] = useState<string | null>(null);

  const prev = useCallback(() => {
    setIndex((value) => (value - 1 + CARDS.length) % CARDS.length);
  }, []);

  const next = useCallback(() => {
    setIndex((value) => (value + 1) % CARDS.length);
  }, []);

  /**
   * 点击任意一张卡 → 把它抽到最顶层。
   *
   * 注意：点击**顶层**卡是「轮换到下一张」（老行为），点击**下层**
   * 卡是「抽它上来」——两者意图不同，必须区分。
   */
  const bringToFront = useCallback((cardIndex: number) => {
    const depth = (cardIndex - index + CARDS.length) % CARDS.length;
    if (depth === 0) {
      next();
      return;
    }
    setIndex(cardIndex);
  }, [index, next]);

  return (
    <div className="relative w-full">
      {/* ── 卡片栈 ── */}
      <div
        className="relative h-[440px] w-full sm:h-[460px]"
        role="group"
        aria-roledescription="轮播"
        aria-label="OE 核心优势"
      >
        {CARDS.map((card, cardIndex) => {
          /** 该卡在栈中的层位：0 = 顶层。 */
          const depth = (cardIndex - index + CARDS.length) % CARDS.length;
          const isTop = depth === 0;
          const isHovered = hovered === card.id;

          /**
           * 阶梯扇形错落。
           *
           * 每一层比上一层**往右上退一点**并缩小——像一叠斜放的
           * 卡片，露出的边角刚好能看见编号。
           */
          const restX = depth * 16;
          const restY = depth * -13;
          const restScale = 1 - depth * 0.045;
          const restRotate = depth * -1.6;

          /** 悬停时：这张卡上跃放大，其余卡轻微避让。 */
          const liftY = isHovered && !isTop ? -22 : 0;
          const avoid = isHovered && !isTop ? depth * 4 : 0;

          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={() => bringToFront(cardIndex)}
              onPointerEnter={() => setHovered(card.id)}
              onPointerLeave={() => setHovered((v) => (v === card.id ? null : v))}
              onFocus={() => setHovered(card.id)}
              onBlur={() => setHovered((v) => (v === card.id ? null : v))}
              aria-hidden={!isTop && !isHovered}
              tabIndex={isTop ? 0 : -1}
              className={cn(
                "absolute inset-0 flex w-full flex-col overflow-hidden rounded-2xl p-6 text-left",
                // 100% 不透明实心纯白——**绝不半透明**。
                "border border-[#E5E7EB] bg-white",
              )}
              initial={false}
              animate={{
                x: restX + avoid,
                y: restY + liftY,
                scale: isHovered ? 1.04 : restScale,
                rotate: isHovered ? 0 : restRotate,
                opacity: isTop ? 1 : 1 - depth * 0.14,
                zIndex: CARDS.length - depth + (isHovered ? 20 : 0),
                boxShadow: isHovered
                  ? "0 28px 60px -18px rgba(11,22,44,0.30)"
                  : "0 18px 44px -16px rgba(11,22,44,0.14)",
              }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
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
                  <span className="rounded-full border border-[#E5E7EB] bg-[#F8F7F4] px-2.5 py-1 text-[10.5px] text-[#55606E]">
                    {isHovered ? "点击抽至顶层" : "点击切换"}
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
