"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Star, Zap } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import { LAB_META, type LabId } from "@/lib/math-taxonomy";
import {
  MATH_STAR_META,
  awardMathStar,
  countNodeStars,
  readNodeStars,
  type MathStarKind,
} from "@/lib/math-star-ledger";
import type { LabStage, TelemetryEvent } from "@/components/labs/lab-types";
import { LAB_COMPONENTS } from "@/components/labs/lab-registry";
import { useDynamicBilingual, useTraditional } from "@/lib/use-bilingual";
import { cn } from "@/lib/cn";

/**
 * 实验工坊（/lab）
 * ================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────┬──────────────────────────┐
 *     │  左 70% · 互动主舞台          │  右 30% · 实时伴学与     │
 *     │                                │  任务追踪栏               │
 *     │  [ 01 探索 ] [ 02 规律 ]      │  · LIVE CONTEXT          │
 *     │  [ 03 谜题 ]                   │  · 启发提问               │
 *     │                                │  · 星级进度               │
 *     │  OE 自研实验台（物理 / 几何）  │  · 节点前置链路           │
 *     └────────────────────────────────┴──────────────────────────┘
 *
 * 零滚动契约：严格 100vh 一屏无垂直滚动。
 *
 * ⛔ **杜绝「正在等待左侧动作」的断联**。右侧 LIVE CONTEXT 由
 *    实验台通过 ``onTelemetryChange`` 实时推送。首次进入时伴学栏
 *    给出**当前的初始状态**（而不是占位符），之后每次真实操作
 *    都会覆盖它。
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

/** 右侧伴学栏的启发提问——按阶段与实时状态给不同的引导。 */
function hintFor(
  stage: LabStage,
  telemetry: TelemetryEvent | null,
  isEn: boolean,
): { zh: string; en: string } {
  if (telemetry) {
    return { zh: telemetry.textZh, en: telemetry.textEn };
  }
  const table: Record<LabStage, { zh: string; en: string }> = {
    explore: {
      zh: "先自由动手：把砝码或控制点拖一拖，观察数字与图形怎么变。",
      en: "Start by playing: drag a weight or a control point and watch the numbers or shapes respond.",
    },
    discover: {
      zh: "现在验证一条规律——让两边同时变化，看看什么保持不变。",
      en: "Now verify a rule: change both sides and see what stays invariant.",
    },
    mystery: {
      zh: "最后的挑战：独立解出谜题，把答案写进右边的输入框。",
      en: "Final challenge: solve the mystery on your own and type the answer on the right.",
    },
  };
  return table[stage];
}

export default function LabPage() {
  return (
    /*
     * ⛔ 必须包在 <Suspense> 里。
     *
     * ``useSearchParams`` 在 App Router 里会让整棵子树退化成
     * 客户端渲染边界——静态导出时如果没有 Suspense 兜底，
     * 构建会直接报错。包裹之后，构建期先吐一个骨架，
     * 客户端再按 ``?node=<skill_id>`` 换出真实舞台。
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
  const { nodeMap, taxonomy, loading, failed, refreshStars } = useMathTaxonomy();

  const [stage, setStage] = useState<LabStage>("explore");
  const [telemetry, setTelemetry] = useState<TelemetryEvent | null>(null);
  const [stars, setStars] = useState(0);
  const t = useDynamicBilingual();
  const tw = useTraditional();

  const isEn = locale === "en";
  const node = nodeParam ? nodeMap.get(nodeParam) : undefined;

  /* ── 遥测回调 ───────────────────────────────────────────────── */

  const handleTelemetry = useCallback((event: TelemetryEvent) => {
    setTelemetry(event);
  }, []);

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
      refreshStars();
    },
    [nodeParam, refreshStars],
  );

  /* ── 阶段切换 → 自动点亮对应阶段的星 ────────────────────────── */

  const changeStage = useCallback(
    (next: LabStage) => {
      setStage(next);
      // 走到「规律」说明探索已完成 → 点亮第 1 颗星。
      if (next === "discover") lightStar("explore");
      // 走到「谜题」说明规律验证已完成 → 点亮第 2 颗星。
      if (next === "mystery") lightStar("discover");
    },
    [lightStar],
  );

  /** 谜题解出 → 点亮第 3 颗星。 */
  const handleSolved = useCallback(
    (zh: string, en: string) => {
      lightStar("mystery");
      setTelemetry({ kind: "success", textZh: zh, textEn: en, at: Date.now() });
    },
    [lightStar],
  );

  /* ── 无节点时的默认实验台 ───────────────────────────────────── */

  const labId: LabId | null = node?.lab ?? null;
  const LabComponent = labId ? LAB_COMPONENTS[labId] : null;

  /**
   * 节点切换时重置实验阶段。
   */
  useEffect(() => {
    setStage("explore");
    setTelemetry(null);
  }, [node?.id, labId]);

  /** 提示语。 */
  const hint = useMemo(
    () => {
      const raw = hintFor(stage, telemetry, isEn);
      // 繁体模式下，遥测推送的中文也要做字符级转换。
      if (isEn) return raw.en;
      return tw(raw.zh);
    },
    [stage, telemetry, isEn, tw],
  );

  /** 本链的全部节点（右侧「本链路径」）。 */
  const siblings = useMemo(() => {
    if (!node || !taxonomy) return [];
    return taxonomy.nodes
      .filter((n) => n.chainId === node.chainId)
      .sort((a, b) => a.index - b.index);
  }, [node, taxonomy]);

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
            {isEn ? "Pick a node to start" : tw("先从学习地图里选一个知识点")}
          </p>
          <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-[#334155]">
            {isEn
              ? "Every node on the map opens its own lab. Nodes with a ⚡ badge run our own physics and geometry engines — nothing is outsourced."
              : tw("地图上的每个节点都会打开自己的实验台。带 ⚡ 徽标的是 OE 自研的物理 / 几何引擎，全部自主研发，不接入任何第三方仿真。")}
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
              {t(node.nameZh, node.nameEn)}
            </h1>
            <p className="mt-0.5 truncate text-[11px] text-[#334155]">
              {node.chainNo} · {node.domain}
              {node.cnRef?.book ? ` · ${node.cnRef.book}` : ""}
              {node.ageRangeStart
                ? ` · ${node.ageRangeStart}–${node.ageRangeEnd ?? node.ageRangeStart}${tw("岁")}`
                : ""}
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
                title={isEn ? MATH_STAR_META[i].labelEn : tw(MATH_STAR_META[i].labelZh)}
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
                  className={lit ? "fill-[#C59B38] text-[#C59B38]" : "text-[#CBD5E1]"}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {LabComponent ? (
            <LabComponent
              onTelemetryChange={handleTelemetry}
              stage={stage}
              isEn={isEn}
              onSolved={handleSolved}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-[14px] font-semibold text-[#0F172A]">
                {isEn ? "Depth lab in development" : tw("深度实验室研发中")}
              </p>
              <p className="max-w-md text-[12px] leading-relaxed text-[#334155]">
                {isEn
                  ? "This node has no hands-on lab yet — start from the first step of its chain and come back."
                  : tw("这个知识点还没有可动手的实验室——先从本链第一步开始，实验做好后回来继续。")}
              </p>
            </div>
          )}
          </div>
        </div>

        {/* 右 30% · 实时伴学与任务追踪栏 */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {/* LIVE CONTEXT */}
          <section className="rounded-xl border border-[#0B162C] bg-[#0B162C] p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-[#C59B38]" />
              <p className="text-[10px] font-medium tracking-[0.16em] text-white/60 uppercase">
                Live Context
              </p>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white">
              {hint}
            </p>
            {telemetry?.value ? (
              <p className="mt-1.5 font-mono text-[11.5px] text-[#93C5FD]">
                {telemetry.value}
              </p>
            ) : null}
          </section>

          {/* 阶段切换 */}
          {labId ? (
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
              <p className="mb-2 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                {isEn ? "Lab mode" : tw("实验台模式")}
              </p>
              <div className="flex items-stretch gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                {(
                  [
                    { id: "explore", no: "01", zh: "探索", en: "Explore" },
                    { id: "discover", no: "02", zh: "规律", en: "Discover" },
                    { id: "mystery", no: "03", zh: "谜题", en: "Mystery" },
                  ] as const
                ).map((item) => {
                  const active = stage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => changeStage(item.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors",
                        active
                          ? "bg-[#0B162C] text-white"
                          : "text-[#334155] hover:bg-white",
                      )}
                    >
                      <span
                        className={cn(
                          "mr-1 text-[9.5px] tabular-nums",
                          active ? "text-[#C59B38]" : "text-[#94A3B8]",
                        )}
                      >
                        {item.no}
                      </span>
                      {isEn ? item.en : tw(item.zh)}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* 星级进度 */}
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
            <p className="mb-2 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Star progress" : tw("星级进度")}
            </p>
            <div className="space-y-1.5">
              {MATH_STAR_META.map((meta, i) => {
                const lit = readNodeStars(node.id)[meta.kind];
                return (
                  <button
                    key={meta.kind}
                    type="button"
                    onClick={() => lightStar(meta.kind)}
                    className="flex w-full items-center gap-2 rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-left transition-colors hover:bg-[#F8FAFC]"
                  >
                    <Star
                      size={13}
                      strokeWidth={2.2}
                      className={lit ? "fill-[#C59B38] text-[#C59B38]" : "text-[#CBD5E1]"}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#0F172A]">
                      {isEn ? meta.labelEn : tw(meta.labelZh)}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-[#94A3B8]">
                      {lit ? "✓" : `0${i + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 实验台信息 */}
          {labId ? (
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
              <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                {isEn ? "Engine" : tw("底层引擎")}
              </p>
              <p className="text-[12px] font-medium text-[#0F172A]">
                {isEn ? LAB_META[labId].nameEn : tw(LAB_META[labId].nameZh)}
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] text-[#64748B]">
                {LAB_META[labId].engine}
              </p>
            </section>
          ) : null}

          {/* 节点概念卡 */}
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
            <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Concept" : tw("核心概念")}
            </p>
            <p className="text-[12px] leading-relaxed text-[#334155]">
              {t(node.descriptionZh, node.descriptionEn)}
            </p>
            {!isEn ? (
              <p className="mt-1.5 text-[11.5px] text-[#64748B]">
                {node.nameEn}
              </p>
            ) : null}
          </section>

          {/* 本链路径 */}
          {siblings.length > 0 ? (
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-3">
              <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                {isEn ? "This chain" : tw("本链路径")}
              </p>
              <ul className="space-y-0.5">
                {siblings.map((s) => {
                  const isCurrent = s.id === node.id;
                  const label = t(s.nameZh, s.nameEn);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/lab?node=${encodeURIComponent(s.id)}`}
                        className={cn(
                          "flex items-center gap-1.5 truncate rounded px-1.5 py-1 text-[11.5px] transition-colors",
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
                          {String(s.index).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 truncate">{label}</span>
                        {s.lab ? (
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
          ) : null}
        </aside>
      </div>
    </div>
  );
}
