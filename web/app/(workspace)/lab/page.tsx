"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Star, Zap } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useGeometryChain } from "@/context/GeometryChainContext";
import {
  MATH_STAR_META,
  awardMathStar,
  countNodeStars,
  readNodeStars,
  type MathStarKind,
} from "@/lib/math-star-ledger";
import type { LiveReading } from "@/components/lab/GeoGebraStudio";
import GeometryLab, {
  GEO_STAGE_LABELS,
  type GeoStage,
} from "@/components/lab/GeometryLab";
import { useTraditional } from "@/lib/use-bilingual";
import { cn } from "@/lib/cn";

/**
 * 实验工坊（/lab）
 * ================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────┬──────────────────────────┐
 *     │  左 70% · 互动主舞台          │  右 30% · 伴学与追踪栏    │
 *     │  [ 01 探索 ] [ 02 规律 ]      │  ① LIVE CONTEXT          │
 *     │  [ 03 谜题 ]                   │  ② 本课 3 颗星进度        │
 *     │                                │  ③ 开源教材核心概念卡     │
 *     │  GeoGebra 真实几何引擎          │  ④ 本链 8 课快速切换      │
 *     └────────────────────────────────┴──────────────────────────┘
 *
 * 零滚动契约：严格 100vh 一屏无垂直滚动。
 *
 * ⛔ **模式切换栏只有一套**。之前的版本在画布上方和右侧栏里各放
 *    了一套一模一样的 [探索/规律/谜题] 按钮——两套控制同一个状态，
 *    改一个另一个不跟着变，用户会以为点错了。现在只在画布顶部留
 *    唯一一套。
 *
 * ⛔ **LIVE CONTEXT 里没有硬编码引导语**。它显示的是**引擎此刻
 *    的真实数值**（GeoGebra 的 getValue 读回来的），加上本课
 *    开源数据里的真实提示。原来那句「把砝码或控制点拖一拖」在
 *    几何课上驴唇不对马嘴，已彻底删除。
 */

/** 实验台加载骨架。 */
function LabSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <span
        aria-busy="true"
        className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#1D4ED8]"
      />
    </div>
  );
}

export default function LabPage() {
  return (
    /*
     * ⛔ 必须包在 <Suspense> 里。
     *
     * ``useSearchParams`` 在 App Router 里会让整棵子树退化成
     * 客户端渲染边界——静态导出时如果没有 Suspense 兜底，
     * 构建会直接报错。包裹之后，构建期先吐一个骨架，
     * 客户端再按 ``?node=<lesson_id>`` 换出真实舞台。
     */
    <Suspense fallback={<LabSkeleton />}>
      <LabStage />
    </Suspense>
  );
}

/**
 * 实验工坊的真正实现。
 *
 * 单独拆出来是因为它要用 ``useSearchParams``——必须在 Suspense
 * 边界**之内**渲染。
 */
function LabStage() {
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node");
  const { locale } = useLocale();
  const { lessons, lessonMap, loading, failed } = useGeometryChain();

  const [stage, setStage] = useState<GeoStage>("explore");
  const [readings, setReadings] = useState<LiveReading[]>([]);
  const [stars, setStars] = useState(0);
  const [conceptOpen, setConceptOpen] = useState(false);
  const tw = useTraditional();

  const isEn = locale === "en";

  const node = nodeParam ? lessonMap.get(nodeParam) : undefined;

  /* ── 星星状态 ───────────────────────────────────────────────── */

  useEffect(() => {
    if (!nodeParam) return;
    setStars(countNodeStars(nodeParam));
  }, [nodeParam]);

  /**
   * 点亮一颗星。
   *
   * ⛔ 星星**单调**——点亮后不会被熄灭。
   */
  const lightStar = useCallback(
    (kind: MathStarKind) => {
      if (!nodeParam) return;
      awardMathStar(nodeParam, kind);
      setStars(countNodeStars(nodeParam));
    },
    [nodeParam],
  );

  /* ── 阶段切换 ──────────────────────────────────────────────────
   *
   * ⛔ **切换阶段本身不点星星**。
   *
   *    之前的版本是「切到规律就点亮第 1 颗星，切到谜题就点亮
   *    第 2 颗星」。这是**自欺欺人**——学生只要连点几下标签栏，
   *    三颗星就全亮了，GeoGebra 引擎一次都没用上。
   *
   *    现在星星**只**由引擎判定点亮（见 ``handleGoalMet``）——
   *    也就是学生必须真的在画布上做出了对应的操作。
   */
  const changeStage = useCallback((next: GeoStage) => {
    setStage(next);
  }, []);

  /** 谜题解出 → 点亮第 3 颗星。 */
  const handleSolved = useCallback(() => {
    lightStar("mystery");
  }, [lightStar]);

  /** 引擎判定某个阶段达标 → 点亮对应的星。
   *
   * ⛔ 这才是点星的**唯一**入口——GeoGebra 引擎在真实判定里
   *    返回达标时才会走到这里。
   */
  const handleGoalMet = useCallback(
    (metStage: GeoStage) => {
      if (metStage === "explore") lightStar("explore");
      else if (metStage === "discover") lightStar("discover");
      else if (metStage === "mystery") lightStar("mystery");
    },
    [lightStar],
  );

  /* 节点切换时重置实验阶段与读数。 */
  useEffect(() => {
    setStage("explore");
    setReadings([]);
  }, [node?.id]);

  /* ── 本课的真实三语内容 ────────────────────────────────────── */

  /** 从三语文本里挑当前语言那一列——绝不混排。 */
  const pick = useCallback(
    (tr: { zhCN: string[]; zhTW: string[]; en: string[] }): string[] => {
      if (isEn) return tr.en;
      if (locale === "zh-TW") return tr.zhTW;
      return tr.zhCN;
    },
    [isEn, locale],
  );

  const concepts = useMemo(
    () => (node ? pick(node.concept) : []),
    [node, pick],
  );
  const hints = useMemo(() => (node ? pick(node.hints) : []), [node, pick]);
  const trials = useMemo(() => (node ? pick(node.trials) : []), [node, pick]);

  /* ── 加载中 / 失败 ──────────────────────────────────────────── */

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

  if (failed || lessons.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[14px] font-semibold text-[#0F172A]">
          {isEn ? "Geometry chain unavailable" : tw("几何链数据加载失败")}
        </p>
        <p className="max-w-md text-[12px] leading-relaxed text-[#334155]">
          {isEn
            ? "The geometry-chain JSON could not be loaded. Please refresh the page."
            : tw("未能读取 geometry-chain.json。请刷新页面重试。")}
        </p>
        <Link
          href="/map"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B162C] px-4 text-[12.5px] font-medium text-white"
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          {isEn ? "Back to map" : tw("返回学习地图")}
        </Link>
      </div>
    );
  }

  /* ── 无节点 → 引导去地图 ────────────────────────────────────── */

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div>
          <p className="text-[15px] font-semibold text-[#0F172A]">
            {isEn ? "Pick a lesson to start" : tw("先从学习地图里选一节课")}
          </p>
          <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-[#334155]">
            {isEn
              ? "Every lesson on the map opens a real GeoGebra lab. The geometry chain is our flagship track — eight lessons, all playable."
              : tw(
                  "地图上的每一节课都会打开一个真实的 GeoGebra 实验台。几何链是我们的标杆路线——8 节课，全部可玩。",
                )}
          </p>
        </div>
        <Link
          href="/map"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B162C] px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#152a4d]"
        >
          {isEn ? "Open the Math Map" : tw("打开数学学习地图")}
          <ArrowLeft size={14} strokeWidth={2.2} className="rotate-180" />
        </Link>
      </div>
    );
  }

  /* ── 主渲染 ─────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {/* 顶部：节点信息 */}
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/map"
            aria-label={isEn ? "Back to map" : tw("返回学习地图")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:bg-[#F8FAFC]"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-[#0F172A]">
              {node.id} ·{" "}
              {isEn
                ? (node.sources.openstax.sections?.[0] ?? "Geometry")
                : tw(node.sources.cn.topics?.[0]?.chapter ?? "几何探究")}
            </h1>
            <p className="mt-0.5 truncate text-[11px] text-[#334155]">
              {isEn
                ? `${node.sources.khan.length} open-source exercises · GeoGebra engine`
                : tw(
                    `${node.sources.khan.length} 道开源题库练习 · GeoGebra 真引擎`,
                  )}
            </p>
          </div>
        </div>

        {/* 星星 */}
        <div className="flex shrink-0 items-center gap-1.5">
          {[0, 1, 2].map((i) => {
            const kind = MATH_STAR_META[i].kind;
            const lit = readNodeStars(node.id)[kind];
            return (
              <span
                key={kind}
                title={
                  isEn
                    ? MATH_STAR_META[i].labelEn
                    : tw(MATH_STAR_META[i].labelZh)
                }
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
                  lit
                    ? "border-[#C59B38] bg-[#FDF8EC]"
                    : "border-[#E2E8F0] bg-white",
                )}
              >
                <Star
                  size={13}
                  strokeWidth={2.2}
                  className={
                    lit ? "fill-[#C59B38] text-[#C59B38]" : "text-[#CBD5E1]"
                  }
                />
              </span>
            );
          })}
        </div>
      </header>

      {/* 主体：70/30 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:grid-rows-1">
        {/* 左 70% · 互动主舞台 */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-3">
          <GeometryLab
            lesson={node}
            stage={stage}
            onStageChange={changeStage}
            onSolved={handleSolved}
            onReadings={setReadings}
            onGoalMet={handleGoalMet}
          />
        </div>

        {/* 右 30% · 伴学与追踪栏——自上而下只有 4 块 */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {/* ① LIVE CONTEXT —— 引擎真实读数 */}
          <section className="rounded-xl border border-[#0B162C] bg-[#0B162C] p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-[#C59B38]" />
              <p className="text-[10px] font-medium tracking-[0.16em] text-white/60 uppercase">
                Live Context
              </p>
            </div>
            {readings.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {readings.map((r) => (
                  <li
                    key={r.name}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate text-[12px] text-white/80">
                      {r.label}
                    </span>
                    <span className="shrink-0 font-mono text-[13px] font-medium text-[#93C5FD]">
                      {r.value}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12.5px] leading-relaxed text-white/70">
                {isEn
                  ? "Waiting for the GeoGebra engine to report the current state…"
                  : tw("等待 GeoGebra 引擎回报当前状态…")}
              </p>
            )}
            {/* 本阶段的真实提示（来自开源题库） */}
            {hints.length > 0 ? (
              <p className="mt-2.5 border-t border-white/10 pt-2 text-[12px] leading-relaxed text-white/60">
                {hints[0]}
              </p>
            ) : null}
          </section>

          {/* ② 本课 3 颗星进度 */}
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
            <p className="mb-2 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Star progress" : tw("星级进度")}
            </p>
            <div className="space-y-1.5">
              {MATH_STAR_META.map((meta, i) => {
                const lit = readNodeStars(node.id)[meta.kind];
                return (
                  /* ⛔ 星星进度是**只读指示器**，不是按钮。
                   *
                   *    之前这里是可点的 ``<button onClick={lightStar}``——
                   *    学生点一下就直接拿星，GeoGebra 引擎一次都没用上。
                   *    现在星星**只**由引擎判定点亮（handleGoalMet），
                   *    这里只负责如实显示。
                   */
                  <div
                    key={meta.kind}
                    className="flex w-full items-center gap-2 rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-left"
                  >
                    <Star
                      size={13}
                      strokeWidth={2.2}
                      className={
                        lit ? "fill-[#C59B38] text-[#C59B38]" : "text-[#CBD5E1]"
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#0F172A]">
                      {isEn ? meta.labelEn : tw(meta.labelZh)}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-[#94A3B8]">
                      {lit ? "✓" : `0${i + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 巩固题 —— 来自开源题库 */}
            {trials.length > 0 ? (
              <div className="mt-2.5 border-t border-[#E2E8F0] pt-2">
                <p className="mb-1 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                  {isEn ? "From the open-source bank" : tw("来自开源题库")}
                </p>
                <ul className="space-y-1">
                  {trials.slice(0, 2).map((t, i) => (
                    <li
                      key={i}
                      className="text-[11.5px] leading-relaxed text-[#334155]"
                    >
                      · {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* ③ 开源教材核心概念卡（带折叠的来源标注） */}
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
            <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Open-source concept" : tw("开源教材核心概念")}
            </p>
            {concepts.length > 0 ? (
              <ul className="space-y-1.5">
                {concepts.slice(0, 2).map((c, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] leading-relaxed text-[#334155]"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-[#94A3B8]">
                {isEn ? "No concept extracted." : tw("未抽取到概念。")}
              </p>
            )}

            {/* 来源标注（可折叠） */}
            <button
              type="button"
              onClick={() => setConceptOpen((v) => !v)}
              className="mt-2 flex w-full items-center gap-1 text-[10.5px] font-medium text-[#1D4ED8] transition-colors"
            >
              <ChevronDown
                size={12}
                strokeWidth={2.4}
                className={cn(
                  "transition-transform",
                  conceptOpen && "rotate-180",
                )}
              />
              {isEn ? "Source" : tw("来源")}
            </button>
            {conceptOpen ? (
              <ul className="mt-1.5 space-y-1">
                {node.sources.khan.map((s, i) => (
                  <li key={`k${i}`} className="text-[10.5px] leading-relaxed text-[#64748B]">
                    <span className="font-mono">{s.repo}</span>
                    <br />
                    {s.path}
                  </li>
                ))}
                <li className="text-[10.5px] leading-relaxed text-[#64748B]">
                  <span className="font-mono">{node.sources.openstax.repo}</span>
                  <br />
                  {node.sources.openstax.path}
                </li>
                <li className="text-[10.5px] leading-relaxed text-[#64748B]">
                  <span className="font-mono">{node.sources.cn.repo}</span>
                  <br />
                  {node.sources.cn.path}
                </li>
                <li className="pt-1 text-[10px] text-[#94A3B8]">
                  {isEn ? "License" : tw("协议")}:{" "}
                  {node.sources.khan[0]?.license ??
                    node.sources.openstax.license}
                </li>
              </ul>
            ) : null}
          </section>

          {/* ④ 本链 8 课快速切换 */}
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
            <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "This chain" : tw("本链路径")}
            </p>
            <ul className="space-y-0.5">
              {lessons.map((s, i) => {
                const isCurrent = s.id === node.id;
                const lit = countNodeStars(s.id);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/lab?node=${encodeURIComponent(s.id)}`}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-1.5 py-1 text-[11.5px] transition-colors",
                        isCurrent
                          ? "bg-[#0B162C] font-medium text-white"
                          : "text-[#1D4ED8] hover:bg-[#EFF6FF]",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 text-[9.5px] tabular-nums",
                          isCurrent ? "text-white/60" : "text-[#94A3B8]",
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 truncate">
                        {s.sources.cn.topics?.[0]?.chapter ??
                          s.sources.openstax.sections?.[0] ??
                          s.id}
                      </span>
                      {lit > 0 ? (
                        <Zap
                          size={9}
                          strokeWidth={2.8}
                          className={cn(
                            "ml-auto shrink-0",
                            isCurrent ? "text-[#C59B38]" : "text-[#1D4ED8]",
                          )}
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
