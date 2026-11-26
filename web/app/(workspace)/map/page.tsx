"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FlaskConical, Lock, Star, Zap } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import MapNodeCard, {
  NodeDetail,
  type PlacedNode,
} from "@/app/(workspace)/map/MapNodeCard";
import { TIER_META, type MathChain, type MathNode } from "@/lib/math-taxonomy";
import { countNodeStars } from "@/lib/math-star-ledger";
import { useDynamicBilingual } from "@/lib/use-bilingual";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 黄金因果学习地图（/map）
 * ==========================
 *
 * .. code-block:: text
 *
    20| *  ┌──────────────┬──────────────────────────────────────────┐
 *     │  240px 侧栏   │  学科分栏胶囊（零滚动）                    │
 *     │              ├──────────────────────────────────────────┤
 *     │  逻辑链筛选   │  画布（可滚动 + 可缩放）                   │
 *     │  进度条      │                                          │
 *     │              │  链 01 数感与数量结构                     │
 *     │              │   ① 直觉启蒙  ② 结构推导  ③ 综合建模     │
 *     │              │    ●──▶●──▶●──▶●──▶●──▶●──▶●            │
 *     └──────────────┴──────────────────────────────────────────┘
 *
 * 三阶因果横轨
 * ------------
 *
 * ⛔ **彻底废弃 6 列蜘蛛网**。之前 583 个节点平铺，节点标签互相
 *    遮挡，谁也看不出「该从哪儿开始学」。
 *
 * 现在每条链切成三阶**横轨**，每阶 2–3 个节点，节点之间用**单向
 * 箭头**明确标出先后。第一课挂 **START · 从这里开始** 徽章。
 */

/** 学科分栏。 */
type Subject = "math" | "chinese";

/** 画布布局常量。 */
const LAYOUT = {
  /** 每条链的垂直间距。 */
  chainGap: 208,
  /** 链内节点之间的水平间距。 */
  nodeGap: 214,
  /** 链标题的垂直偏移。 */
  titleOffset: -62,
  /** 节点起始 X。 */
  startX: 132,
  /** 节点起始 Y。 */
  startY: 118,
  /** 三阶轨道标签的 Y 偏移。 */
  tierLabelOffset: -78,
};

/** 三阶轨道的横向偏移（每个阶占一段）。 */
const TIER_X = [0, 1, 2].map((i) => i * 3 * LAYOUT.nodeGap);

export default function MathMapPage() {
  const { locale } = useLocale();
  const {
    taxonomy,
    loading,
    failed,
    chainProgress,
    activeChainId,
    setActiveChainId,
  } = useMathTaxonomy();
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [starTick, setStarTick] = useState(0);
  const [subject, setSubject] = useState<Subject>("math");
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * 当前学科的**宽类型**别名。
   *
   * ⛔ 不能直接用 ``subject``——TypeScript 在 ``if (subject ===
   *    "chinese") return`` 之后会把它窄化成 ``"math"``，导致后面
   *    渲染学科分栏时 ``subject === "chinese"`` 恒为假。
   */
  const activeSubject: Subject = subject;

  const isEn = locale === "en";
  const tw = useTraditional();
  const t = useDynamicBilingual();

  /* ── 星星账本变化时刷新 ────────────────────────────────────── */

  useEffect(() => {
    const onUpdate = () => setStarTick((tick) => tick + 1);
    window.addEventListener("oe:math-stars-updated", onUpdate);
    return () => window.removeEventListener("oe:math-stars-updated", onUpdate);
  }, []);

  /* ── 布局：把节点摆到画布上 ────────────────────────────────── */

  const { placed, canvasW, canvasH } = useMemo(() => {
    if (!taxonomy) {
      return { placed: [] as PlacedNode[], canvasW: 0, canvasH: 0 };
    }

    const placedList: PlacedNode[] = [];
    const posById = new Map<string, PlacedNode>();
    const edgeKindByPair = new Map<string, "direct" | "derived" | "sequential">();

    for (const edge of taxonomy.edges) {
      edgeKindByPair.set(`${edge.from}->${edge.to}`, edge.kind);
    }

    let y = LAYOUT.startY;
    let maxX = 0;

    for (const chain of taxonomy.chains) {
      const chainNodes = taxonomy.nodes
        .filter((n) => n.chainId === chain.id)
        .sort((a, b) => a.index - b.index);

      // 每阶的横向起点与链内偏移。
      const tierStart = new Map<number, number>();

      chainNodes.forEach((node, i) => {
        const tierIdx = node.tierOrder ?? 0;
        const withinTier = chainNodes
          .slice(0, i)
          .filter((n) => (n.tierOrder ?? 0) === tierIdx).length;

        const px = LAYOUT.startX + TIER_X[tierIdx] + withinTier * LAYOUT.nodeGap;
        const py = y;
        const p: PlacedNode = {
          node,
          x: px,
          y: py,
          order: i + 1,
          isStart: i === 0,
          prevId: i > 0 ? chainNodes[i - 1].id : null,
          nextId: i < chainNodes.length - 1 ? chainNodes[i + 1].id : null,
          edgeKind:
            i > 0
              ? (edgeKindByPair.get(`${chainNodes[i - 1].id}->${node.id}`) ??
                "sequential")
              : null,
        };
        placedList.push(p);
        posById.set(node.id, p);
        if (px > maxX) maxX = px;
      });

      // 每阶的起始 X——用于画阶标签。
      for (const tierIdx of [0, 1, 2]) {
        const first = chainNodes.find((n) => (n.tierOrder ?? 0) === tierIdx);
        tierStart.set(tierIdx, first ? LAYOUT.startX + TIER_X[tierIdx] : 0);
      }
      // 记到链对象上（供渲染使用）。
      (chain as ChainLayout).__tierStart = tierStart;

      y += LAYOUT.chainGap;
    }

    return {
      placed: placedList,
      canvasW: Math.max(maxX + 340, 1500),
      canvasH: y + 40,
    };
  }, [taxonomy]);

  /* ── 可见节点 ──────────────────────────────────────────────── */

  const visible = useMemo(() => {
    if (!activeChainId) return placed;
    return placed.filter((p) => p.node.chainId === activeChainId);
  }, [placed, activeChainId]);

  /** 可见的边——只在可见节点之间画。 */
  const visibleEdges = useMemo(() => {
    const ids = new Set(visible.map((p) => p.node.id));
    const list: Array<{
      from: PlacedNode;
      to: PlacedNode;
      kind: "direct" | "derived" | "sequential";
    }> = [];
    for (const p of visible) {
      if (!p.nextId) continue;
      const next = visible.find((v) => v.node.id === p.nextId);
      if (!next) continue;
      list.push({ from: p, to: next, kind: p.edgeKind ?? "sequential" });
    }
    void ids;
    return list;
  }, [visible]);

  /* ── 选中节点 ──────────────────────────────────────────────── */

  const selectedNode = selected
    ? placed.find((p) => p.node.id === selected)
    : undefined;

  /* ── 切换逻辑链：滚动回顶部并精准渲染 ──────────────────────── */

  const handleChainFocus = useCallback(
    (chainId: string | null) => {
      setActiveChainId(chainId);
      setSelected(null);
      // ⛔ 关键：切换链条时**必须滚回顶部**，否则画布停在上一条链的
      //    位置，看起来就是「点击后一片空白」。
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    },
    [setActiveChainId],
  );

  /* ── 加载态 ────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span
          aria-busy="true"
          className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#1D4ED8]"
        />
      </div>
    );
  }

  if (failed || !taxonomy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[14px] font-semibold text-[#0F172A]">
          {isEn ? "Math graph unavailable" : tw("数学图谱加载失败")}
        </p>
        <p className="max-w-md text-[12px] leading-relaxed text-[#334155]">
          {isEn
            ? "The taxonomy JSON could not be loaded. Please refresh the page."
            : tw("未能读取 math-taxonomy.json。请刷新页面重试。")}
        </p>
      </div>
    );
  }

  /* ── 语文预览 ──────────────────────────────────────────────── */

  if (subject === "chinese") {
    return (
      <ChinesePreview isEn={isEn} onBack={() => setSubject("math")} />
    );
  }

  /* ── 主渲染 ────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0">
      {/* 画布 */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#F8FAFC]">
        {/* 顶部工具条 + 学科分栏 */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {/* 学科分栏胶囊 */}
            <div className="flex shrink-0 items-stretch rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
              <SubjectTab
                active={subject === "math"}
                onClick={() => setSubject("math")}
                icon={<FlaskConical size={11} strokeWidth={2.4} />}
                label={isEn ? "Math · Logic Map" : tw("数学 · 逻辑实验图谱")}
              />
              <SubjectTab
                active={activeSubject === "chinese"}
                onClick={() => setSubject("chinese")}
                icon={<BookOpen size={11} strokeWidth={2.4} />}
                label={isEn ? "Chinese · Culture" : tw("语文 · 中国文化通识")}
              />
            </div>

            <div className="hidden min-w-0 lg:block">
              <h1 className="truncate text-[13px] font-semibold text-[#0F172A]">
                {isEn ? "Causal Math Map" : tw("黄金因果学习地图")}
              </h1>
              <p className="truncate text-[10.5px] text-[#334155]">
                {taxonomy.stats.nodeCount} {isEn ? "milestones" : tw("个里程碑")} ·{" "}
                {taxonomy.stats.chainCount} {isEn ? "chains" : tw("条逻辑链")} ·{" "}
                {taxonomy.stats.labCount} {isEn ? "own labs" : tw("个自研实验台")}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {activeChainId ? (
              <button
                type="button"
                onClick={() => handleChainFocus(null)}
                className="h-8 rounded-lg border border-[#E2E8F0] px-2.5 text-[11.5px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
              >
                {isEn ? "All chains" : tw("显示全部逻辑链")}
              </button>
            ) : null}
            <div className="flex items-center overflow-hidden rounded-lg border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                aria-label={isEn ? "Zoom out" : tw("缩小")}
                className="h-8 w-8 text-[15px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
              >
                −
              </button>
              <span className="w-12 text-center text-[11px] tabular-nums text-[#334155]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
                aria-label={isEn ? "Zoom in" : tw("放大")}
                className="h-8 w-8 text-[15px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* 可滚动画布 —— 全站唯一允许内部滚动与缩放的区域 */}
        <div
          ref={scrollRef}
          className="h-full overflow-auto pt-14"
          style={{ contain: "strict" }}
        >
          <div
            style={{
              width: canvasW * zoom,
              height: canvasH * zoom,
              position: "relative",
            }}
          >
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                position: "absolute",
                top: 0,
                left: 0,
                width: canvasW,
                height: canvasH,
              }}
            >
              {/* SVG 因果箭头 */}
              <svg
                width={canvasW}
                height={canvasH}
                className="pointer-events-none absolute inset-0"
                aria-hidden
              >
                {visibleEdges.map((e) => {
                  const x1 = e.from.x + 93;
                  const y1 = e.from.y;
                  const x2 = e.to.x - 93;
                  const y2 = e.to.y;
                  const mastered =
                    countNodeStars(e.to.node.id) >= 3 &&
                    countNodeStars(e.from.node.id) >= 3;
                  const stroke = mastered
                    ? "#C59B38"
                    : e.kind === "direct"
                      ? "#1D4ED8"
                      : e.kind === "derived"
                        ? "#94A3B8"
                        : "#CBD5E1";
                  return (
                    <g key={`${e.from.node.id}-${e.to.node.id}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2 - 8}
                        y2={y2}
                        stroke={stroke}
                        strokeWidth={mastered ? 2.2 : 1.6}
                        strokeDasharray={
                          e.kind === "sequential" ? "4 4" : undefined
                        }
                        opacity={mastered ? 0.95 : 0.75}
                      />
                      {/* 箭头 */}
                      <polygon
                        points={`${x2},${y2} ${x2 - 9},${y2 - 5} ${x2 - 9},${y2 + 5}`}
                        fill={stroke}
                        opacity={mastered ? 0.95 : 0.75}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* 链标题 + 三阶轨道标签 */}
              {taxonomy.chains.map((chain) => {
                const chainNodes = placed.filter(
                  (p) => p.node.chainId === chain.id,
                );
                if (chainNodes.length === 0) return null;
                if (activeChainId && activeChainId !== chain.id) return null;
                const first = chainNodes[0];
                const prog = chainProgress[chain.id] ?? { stars: 0, maxStars: 0 };
                const layout = chain as ChainLayout;

                return (
                  <div key={chain.id}>
                    {/* 链标题 */}
                    <div
                      className="absolute"
                      style={{
                        left: first.x,
                        top: first.y + LAYOUT.titleOffset,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0B162C] text-[10px] font-bold text-white">
                          {chain.no}
                        </span>
                        <span className="text-[13px] font-semibold text-[#0F172A]">
                          {t(chain.nameZh, chain.nameEn)}
                        </span>
                        <span className="rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[10px] tabular-nums text-[#334155]">
                          ⭐ {prog.stars}/{prog.maxStars}
                        </span>
                      </div>
                    </div>

                    {/* 三阶轨道标签 */}
                    {(["intuition", "structure", "modeling"] as const).map(
                      (tierId, tierIdx) => {
                        const tierStart = layout.__tierStart?.get(tierIdx);
                        if (tierStart === undefined) return null;
                        const meta = TIER_META[tierId];
                        const count = chainNodes.filter(
                          (p) => p.node.tier === tierId,
                        ).length;
                        if (count === 0) return null;
                        return (
                          <div
                            key={tierId}
                            className="absolute"
                            style={{
                              left: tierStart,
                              top: first.y + LAYOUT.tierLabelOffset,
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="flex h-4 w-4 items-center justify-center rounded bg-[#1D4ED8] text-[9px] font-bold text-white">
                                {meta.no}
                              </span>
                              <span className="text-[10.5px] font-medium text-[#334155]">
                                {isEn ? meta.nameEn : tw(meta.nameZh)}
                              </span>
                              <span className="text-[9.5px] text-[#94A3B8]">
                                ×{count}
                              </span>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                );
              })}

              {/* 节点 */}
              {visible.map((p) => (
                <MapNodeCard
                  key={p.node.id}
                  placed={p}
                  selected={selected === p.node.id}
                  isEn={isEn}
                  tick={starTick}
                  onSelect={() => setSelected(p.node.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 图例 */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
          <p className="text-[9.5px] font-medium tracking-[0.12em] text-[#334155] uppercase">
            {isEn ? "Legend" : tw("图例")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#334155]">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#0B162C]" />
              {isEn ? "mastered" : tw("已精通")}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-[#1D4ED8] bg-white" />
              {isEn ? "exploring" : tw("探索中")}
            </span>
            <span className="flex items-center gap-1">
              <Zap size={10} className="text-[#1D4ED8]" />
              {isEn ? "OE lab" : tw("OE 自研实验台")}
            </span>
            <span className="flex items-center gap-1">
              <Lock size={10} className="text-[#94A3B8]" />
              {isEn ? "in development" : tw("待解锁实验室")}
            </span>
          </div>
        </div>
      </div>

      {/* 右侧详情面板 */}
      {selectedNode ? (
        <NodeDetail
          placed={selectedNode}
          isEn={isEn}
          tick={starTick}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

/** 链的额外布局信息。 */
interface ChainLayout extends MathChain {
  __tierStart?: Map<number, number>;
}

/** 学科分栏按钮。 */
function SubjectTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors",
        active
          ? "bg-[#0B162C] text-white shadow-[0_1px_4px_rgba(11,22,44,0.22)]"
          : "text-[#334155] hover:bg-white",
      )}
    >
      <span className={active ? "text-[#C59B38]" : "text-[#94A3B8]"}>
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * 语文 · 中国文化与通识实验图谱（规划筹备中）
 * ===================================================
 *
 * ⛔ **绝不留丑陋空屏**。
 *
 * 点击「语文」分栏时，右侧一屏零滚动地展示一张**典雅克制**的
 * 预览卡，说明未来的三个方向，并提供一键切回数学。
 */
function ChinesePreview({
  isEn,
  onBack,
}: {
  isEn: boolean;
  onBack: () => void;
}) {
  const tw = useTraditional();
  const directions = isEn
    ? [
        {
          no: "01",
          title: "Character Origins",
          desc: "Tracing how each character was built from pictographs and radicals.",
        },
        {
          no: "02",
          title: "Classic Imagery",
          desc: "Reading the recurring images of nature, season and longing in classical poetry.",
        },
        {
          no: "03",
          title: "Cross-cultural Reasoning",
          desc: "Comparing ideas across Chinese and world literature to sharpen argument.",
        },
      ]
    : [
        {
          no: "01",
          title: "汉字溯源",
          desc: "从甲骨文到楷书，看每一个字是怎样被一笔一笔造出来的。",
        },
        {
          no: "02",
          title: "经典意象",
          desc: "读懂古典文学里反复出现的自然、时序与乡愁意象。",
        },
        {
          no: "03",
          title: "跨文化思辨",
          desc: "把中国文本与世界文本并置比较，让论证变得更锋利。",
        },
      ];

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-[#F8FAFC] p-6">
      <div className="w-full max-w-2xl rounded-xl border border-[#E2E8F0] bg-white p-8">
        <p className="text-[10px] font-medium tracking-[0.16em] text-[#64748B] uppercase">
          {isEn ? "Planned · in preparation" : tw("规划筹备中")}
        </p>
        <h2 className="mt-2 text-[22px] leading-snug font-semibold text-[#0F172A]">
          {isEn
            ? "Chinese · Culture & General Knowledge Map"
            : tw("语文 · 中国文化与通识实验图谱")}
        </h2>
        <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-[#334155]">
          {isEn
            ? "This map is being designed. It will follow the same three-stage causal structure as the math map, with its own hands-on labs built by OE — no third-party simulations. The mathematics map is fully live right now."
            : tw("这张图谱正在设计中。它将沿用数学图谱同样的三阶因果结构，并配套 OE 自主研发的动手实验台——同样不引入任何第三方仿真。数学图谱目前已全部上线。")}
        </p>

        <ul className="mt-6 space-y-3">
          {directions.map((d) => (
            <li
              key={d.no}
              className="flex gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#0B162C] text-[11px] font-bold text-white">
                {d.no}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#0F172A]">
                  {d.title}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#334155]">
                  {d.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onBack}
          className="mt-7 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B162C] px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#152a4d]"
        >
          {isEn ? "Back to the Math Map" : tw("切回数学逻辑实验图谱")}
          <Star size={13} strokeWidth={2.4} className="rotate-90" />
        </button>
      </div>
    </div>
  );
}
