"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  FlaskConical,
  Lock,
  Star,
  Zap,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import { useGeometryChain } from "@/context/GeometryChainContext";
import {
  GEOMETRY_LESSON_IDS,
  GEOMETRY_STAGE_META,
  type GeometryStage,
} from "@/lib/geometry-chain";
import { countNodeStars, isChainBadgeUnlocked } from "@/lib/math-star-ledger";
import { useTraditional } from "@/lib/use-bilingual";
import { cn } from "@/lib/cn";

/**
 * 黄金因果学习地图（/map）
 * ==========================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────────────────────┐
 *     │  [ 数学 ]  [ 语文（筹备中）]        标杆链进度 / 徽章   │
 *     ├────────────────────────────────────────────────────────┤
 *     │  空间、角度与几何探究（8 课全通标杆链）               │
 *     │   第 1 阶 直觉测量 → 第 2 阶 图形转化 → 第 3 阶 定理证明│
 *     │   ● START ──▶ ● ──▶ ● ──▶ ● ──▶ ● ──▶ ● ──▶ ●       │
 *     │                                                        │
 *     │  其余 7 条逻辑链：清晰的路线占位（即将上线）             │
 *     └────────────────────────────────────────────────────────┘
 *
 * 三阶因果阶梯
 * ------------
 *
 * ⛔ **其它 7 条链只做路线占位，绝不放半成品假课**。
 *
 *    之前 583 个节点平铺在画布上，标签互相遮挡，谁也看不出该从
 *    哪儿开始。现在把 100% 的力气砸在**一条**标杆链上——「空间、
 *    角度与几何探究」的 8 节课，全部可玩、全部可追踪、全部能拿
 *    徽章。其余的链保留清晰的路线占位，标明「即将上线」。
 *
 * 严格单语
 * --------
 *
 * ⛔ 标题下方**不出现**「01 · Number Sense & Place Value」这种
 *    中英双行夹杂。切换到简 = 100% 纯简体中文；繁 = 100% 纯繁体；
 *    EN = 100% 纯英文。三种语言**各自独立成列**，渲染时只取
 *    当前那一列。
 */

/** 学科分栏。 */
type Subject = "math" | "chinese";

/** 标杆链在图谱里的链 id。 */
const FLAGSHIP_CHAIN_ID = "geometry";

/** 三阶因果阶梯的横向间距。 */
const STEP_X = 176;

/** 三阶因果阶梯的纵向偏移。 */
const STAGE_Y = [0, 1, 2].map((i) => i * 108);

export default function MathMapPage() {
  const { locale } = useLocale();
  const { taxonomy, loading, failed } = useMathTaxonomy();
  const { lessons, lessonMap, loading: geoLoading } = useGeometryChain();

  const [subject, setSubject] = useState<Subject>("math");
  const [starTick, setStarTick] = useState(0);
  /** 画布缩放——全站唯一可缩放区域。 */
  const [zoom, setZoom] = useState(1);

  const tw = useTraditional();
  const isEn = locale === "en";

  /**
   * 当前学科的**宽类型**别名。
   *
   * ⛔ 不能直接用 ``subject``——TypeScript 在 ``if (subject ===
   *    "chinese") return`` 之后会把它窄化成 ``"math"``，导致后面
   *    渲染学科分栏时 ``subject === "chinese"`` 恒为假（那一栏
   *    永远不会高亮）。
   */
  const activeSubject: Subject = subject;

  /* ── 星星账本变化时刷新 ────────────────────────────────────── */

  useEffect(() => {
    const onUpdate = () => setStarTick((t) => t + 1);
    window.addEventListener("oe:math-stars-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("oe:math-stars-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  /* ── 单语挑选：只取当前语言那一列 ────────────────────────── */

  const pick = useCallback(
    (tr: { zhCN: string; zhTW: string; en: string }): string => {
      if (isEn) return tr.en;
      if (locale === "zh-TW") return tr.zhTW;
      return tr.zhCN;
    },
    [isEn, locale],
  );

  /* ── 标杆链的 8 节课（按固定顺序） ────────────────────────── */

  const flagship = useMemo(
    () =>
      GEOMETRY_LESSON_IDS.map((id) => lessonMap.get(id)).filter(
        (l): l is NonNullable<typeof l> => Boolean(l),
      ),
    [lessonMap],
  );

  /** 本链总星数。 */
  const chainStars = useMemo(
    () =>
      flagship.reduce((sum, l) => sum + countNodeStars(l.id), 0),
    [flagship, starTick],
  );

  /** 链徽章是否已解锁。 */
  const badgeUnlocked = useMemo(
    () => isChainBadgeUnlocked(FLAGSHIP_CHAIN_ID),
    [starTick],
  );

  /* ── 其余 7 条链（占位） ──────────────────────────────────── */

  const otherChains = useMemo(() => {
    if (!taxonomy) return [];
    return taxonomy.chains.filter((c) => c.id !== FLAGSHIP_CHAIN_ID);
  }, [taxonomy]);

  /* ── 加载态 ────────────────────────────────────────────────── */

  if (loading || geoLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span
          aria-busy="true"
          className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#1D4ED8]"
        />
      </div>
    );
  }

  if (failed) {
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

  /* ── 语文预览（筹备中） ───────────────────────────────────── */

  if (subject === "chinese") {
    return (
      <ChinesePreview isEn={isEn} onBack={() => setSubject("math")} />
    );
  }

  /* ── 主渲染 ────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC]">
      {/* 顶部：学科分栏 + 标杆链进度 */}
      <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {/* 极简点击切换分栏 */}
          <div className="flex shrink-0 items-stretch rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
            <SubjectTab
              active={subject === "math"}
              onClick={() => setSubject("math")}
              icon={<FlaskConical size={11} strokeWidth={2.4} />}
              label={isEn ? "Math" : tw("数学")}
            />
            <SubjectTab
              active={activeSubject === "chinese"}
              onClick={() => setSubject("chinese")}
              icon={<BookOpen size={11} strokeWidth={2.4} />}
              label={isEn ? "Chinese (in preparation)" : tw("语文（筹备中）")}
            />
          </div>
        </div>

        {/* 标杆链进度 */}
        <div className="flex shrink-0 items-center gap-3">
          {/* 缩放控件 */}
          <div className="flex items-center overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
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
              onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
              aria-label={isEn ? "Zoom in" : tw("放大")}
              className="h-8 w-8 text-[15px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
            >
              +
            </button>
          </div>

          <div className="hidden items-center gap-1.5 lg:flex">
            <Star
              size={12}
              strokeWidth={2.4}
              className={cn(
                chainStars > 0 ? "fill-[#C59B38] text-[#C59B38]" : "text-[#CBD5E1]",
              )}
            />
            <span className="text-[11.5px] tabular-nums text-[#334155]">
              {chainStars}/24
            </span>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              badgeUnlocked
                ? "border-[#C59B38] bg-[#FDF8EC] text-[#8A6A20]"
                : "border-[#E2E8F0] bg-white text-[#94A3B8]",
            )}
          >
            {badgeUnlocked ? (
              <Star size={11} strokeWidth={2.4} className="fill-[#C59B38] text-[#C59B38]" />
            ) : (
              <Lock size={10} strokeWidth={2.4} />
            )}
            {isEn ? "Geometry Master Badge" : tw("几何探索大师徽章")}
          </div>
        </div>
      </header>

      {/* 画布（可滚动 · 全站唯一可滚动 + 可缩放区域） */}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* 缩放容器——transform 缩放，原点固定在左上角 */}
        <div
          style={{
            width: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
        <div className="mx-auto max-w-[1180px] px-6 py-8">
          {/* ── 标杆链 ── */}
          <section className="mb-10">
            {/* 链标题 */}
            <div className="mb-6 flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#0B162C] text-[11px] font-bold text-white">
                05
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold text-[#0F172A]">
                  {pick({
                    zhCN: "空间、角度与几何探究",
                    zhTW: "空間、角度與幾何探究",
                    en: "Space, Angles and Geometric Inquiry",
                  })}
                  <span className="ml-2 align-middle text-[11px] font-normal text-[#64748B]">
                    {isEn ? "8-lesson flagship track" : tw("8 课全通标杆链")}
                  </span>
                </h2>
                <p className="mt-0.5 text-[11.5px] text-[#64748B]">
                  {isEn
                    ? "Every lesson runs on a real GeoGebra engine, with content pulled from Khan Academy and OpenStax open-source repositories."
                    : tw(
                        "每节课都跑在真实的 GeoGebra 引擎上，内容取自 Khan Academy 与 OpenStax 开源仓库。",
                      )}
                </p>
              </div>
            </div>

            {/* 三阶因果阶梯 */}
            <div className="relative rounded-xl border border-[#E2E8F0] bg-white p-5">
              {/* 阶标签 */}
              <div className="mb-4 flex items-center gap-1">
                {([1, 2, 3] as GeometryStage[]).map((stage) => {
                  const meta = GEOMETRY_STAGE_META[stage];
                  const count = flagship.filter(
                    (l) => l.stage === stage,
                  ).length;
                  return (
                    <div
                      key={stage}
                      className="flex items-center gap-1.5"
                      style={{ width: STEP_X }}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded bg-[#1D4ED8] text-[9px] font-bold text-white">
                        {stage}
                      </span>
                      <span className="text-[11px] font-medium text-[#334155]">
                        {pick(meta)}
                      </span>
                      <span className="text-[10px] text-[#94A3B8]">
                        ×{count}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 阶梯轨道 */}
              <div className="relative">
                {/* 连线：8 个点连成一条单向因果链 */}
                <svg
                  className="pointer-events-none absolute inset-0"
                  width="100%"
                  height="100%"
                  aria-hidden
                >
                  <defs>
                    <marker
                      id="oe-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="4"
                      orient="auto"
                    >
                      <polygon points="0,0 8,4 0,8" fill="#94A3B8" />
                    </marker>
                  </defs>
                  {flagship.slice(0, -1).map((l, i) => {
                    const next = flagship[i + 1];
                    const x1 = i * STEP_X + STEP_X - 14;
                    const y1 =
                      (l.stage - 1) * 108 + 26 + (l.stage === next.stage ? 0 : 22);
                    const x2 = (i + 1) * STEP_X + 2;
                    const y2 = (next.stage - 1) * 108 + 26;
                    return (
                      <path
                        key={`${l.id}-${next.id}`}
                        d={`M ${x1} ${y1} L ${x2} ${y2}`}
                        stroke="#CBD5E1"
                        strokeWidth="1.8"
                        fill="none"
                        markerEnd="url(#oe-arrow)"
                      />
                    );
                  })}
                </svg>

                {/* 8 个课节点 */}
                <div className="relative">
                  {flagship.map((lesson, i) => {
                    const stars = countNodeStars(lesson.id);
                    const isStart = i === 0;
                    const mastered = stars >= 3;
                    const chapter =
                      lesson.sources.cn.topics?.[0]?.chapter ??
                      lesson.sources.openstax.sections?.[0] ??
                      lesson.id;

                    return (
                      <div
                        key={lesson.id}
                        className="absolute"
                        style={{
                          left: i * STEP_X,
                          top: (lesson.stage - 1) * 108,
                        }}
                      >
                        <Link
                          href={`/lab?node=${encodeURIComponent(lesson.id)}`}
                          className={cn(
                            "group flex w-[160px] flex-col gap-1 rounded-lg border p-2.5 transition-all",
                            mastered
                              ? "border-[#C59B38] bg-[#FDF8EC]"
                              : "border-[#E2E8F0] bg-white hover:border-[#1D4ED8] hover:shadow-sm",
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9.5px] font-medium tracking-[0.1em] text-[#94A3B8] uppercase">
                              {lesson.id}
                            </span>
                            {isStart ? (
                              <span className="rounded bg-[#1D4ED8] px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.08em] text-white uppercase">
                                {isEn ? "Start" : tw("起点")}
                              </span>
                            ) : null}
                          </div>
                          <p className="line-clamp-2 min-h-[30px] text-[11.5px] leading-snug font-medium text-[#0F172A]">
                            {chapter}
                          </p>
                          <div className="flex items-center gap-1">
                            {[0, 1, 2].map((s) => (
                              <Star
                                key={s}
                                size={10}
                                strokeWidth={2.4}
                                className={
                                  s < stars
                                    ? "fill-[#C59B38] text-[#C59B38]"
                                    : "text-[#E2E8F0]"
                                }
                              />
                            ))}
                            <span className="ml-auto text-[9.5px] tabular-nums text-[#94A3B8]">
                              {stars}/3
                            </span>
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ── 其余逻辑链（路线占位） ── */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
              {isEn ? "Other logic chains" : tw("其余逻辑链")}
              <span className="rounded-full border border-[#E2E8F0] bg-white px-2 py-0.5 text-[10px] font-normal text-[#64748B]">
                {isEn ? "Coming soon" : tw("即将上线")}
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {otherChains.map((chain) => (
                <div
                  key={chain.id}
                  className="rounded-lg border border-[#E2E8F0] bg-white p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[9.5px] font-bold text-[#64748B]">
                      {chain.no}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#334155]">
                      {isEn ? chain.nameEn : tw(chain.nameZh)}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[#94A3B8]">
                    <Lock size={10} strokeWidth={2.4} />
                    {isEn
                      ? `${chain.nodeCount} lessons · in preparation`
                      : tw(`${chain.nodeCount} 节课 · 筹备中`)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        </div>
      </div>
    </div>
  );
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
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
        active
          ? "bg-[#0B162C] text-white"
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

/** 语文预览——筹备中，清晰的路线占位。 */
function ChinesePreview({
  isEn,
  onBack,
}: {
  isEn: boolean;
  onBack: () => void;
}) {
  const tw = useTraditional();
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-[#F8FAFC] p-6">
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-center gap-2">
          <BookOpen size={16} strokeWidth={2.2} className="text-[#1D4ED8]" />
          <h2 className="text-[15px] font-semibold text-[#0F172A]">
            {isEn ? "Chinese · Culture" : tw("语文 · 中国文化通识")}
          </h2>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#334155]">
          {isEn
            ? "The Chinese track is in preparation. Its course content is being curated from authentic open-source textbooks, and its interactive labs are still being built — so nothing half-finished is shown here yet."
            : tw(
                "语文线正在筹备中。课程内容正在从真实的开源教材中筛选整理，互动教具也在研发中——所以这里暂时不展示任何半成品。",
              )}
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
          <Lock size={12} strokeWidth={2.4} className="text-[#94A3B8]" />
          <span className="text-[11.5px] text-[#64748B]">
            {isEn ? "Coming soon" : tw("即将上线")}
          </span>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B162C] px-4 text-[12.5px] font-medium text-white"
        >
          <ChevronRight size={14} strokeWidth={2.2} className="rotate-180" />
          {isEn ? "Back to Math" : tw("返回数学")}
        </button>
      </div>
    </div>
  );
}
