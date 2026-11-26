"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Award,
  Download,
  Globe2,
  Printer,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useProfile } from "@/context/ProfileContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import { BRAND, DREAM_CLASSROOM } from "@/data/site-config";
import {
  MATH_STAR_META,
  readMathLedger,
  settleChainBadge,
  summarizeMath,
} from "@/lib/math-star-ledger";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 成长与结果报告（/report）
 * ========================
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────┐
 *     │  ① 官方结业证书（中英双语 + 防伪编号）      │
 *     ├──────────────────────────────────────────┤
 *     │  ② 数学逻辑宇宙覆盖总览                    │
 *     ├──────────────────────────────────────────┤
 *     │  ③ 八条逻辑链的掌握进度 + 链徽章           │
 *     ├──────────────────────────────────────────┤
 *     │  ④ 已精通节点清单 + 个性化评语             │
 *     └──────────────────────────────────────────┘
 *
 * 为什么这份报告讲的是「逻辑链」而不是「课程单元」
 * ----------------------------------------------
 *
 * 数学学习地图是**图**——节点有几百个，分布在八条链上，链内还有真实
 * 的前置依赖。用「学到第几课」来汇报进度，在图结构上是失真的。
 *
 * 所以这里汇报的是：
 *
 * - **覆盖度**——你走过了图谱的哪些部分；
 * - **链掌握度**——每条链的星数进度与徽章；
 * - **精通节点**——哪些知识点你真的三颗星全满。
 */

/** 防伪编号——由学习者姓名与统计哈希派生。 */
function certNumber(name: string, stars: number, nodes: number): string {
  let hash = 0;
  const seed = `${name}|${stars}|${nodes}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `OE-${hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 8)}`;
}

export default function ReportPage() {
  const { locale } = useLocale();
  const { displayName } = useProfile();
  const { taxonomy, playableNodeIds, chainProgress, summary, refreshStars } =
    useMathTaxonomy();

  const isEn = locale === "en";
  const tw = useTraditional();

  /* ── 链徽章结算 ─────────────────────────────────────────────── */

  const chainBadges = useMemo(() => {
    if (!taxonomy) return [];
    return taxonomy.chains.map((chain) => {
      const ids = taxonomy.nodes
        .filter((n) => n.chainId === chain.id && n.lab)
        .map((n) => n.id);
      const settled = settleChainBadge(chain.id, ids);
      const prog = chainProgress[chain.id] ?? { stars: 0, maxStars: ids.length * 3 };
      return {
        chain,
        unlocked: settled.unlocked,
        stars: prog.stars,
        maxStars: prog.maxStars,
        nodeCount: ids.length,
      };
    });
    // chainProgress 变化时重算（星星点亮后徽章要即时结算）。
  }, [taxonomy, chainProgress]);

  /* ── 已精通节点清单 ─────────────────────────────────────────── */

  const masteredNodes = useMemo(() => {
    if (!taxonomy) return [];
    const ledger = readMathLedger();
    return taxonomy.nodes
      .filter((n) => {
        const r = ledger.nodes[n.id];
        return (
          r && r.explore && r.discover && r.mystery
        );
      })
      .slice(0, 40);
  }, [taxonomy, summary.stars]);

  /* ── 覆盖度统计 ─────────────────────────────────────────────── */

  const coverage = useMemo(() => {
    if (!taxonomy) {
      return { total: 0, explored: 0, percent: 0, labCount: 0, labTypeCount: 0 };
    }
    const total = taxonomy.stats.nodeCount;
    const explored = Object.keys(readMathLedger().nodes).length;
    return {
      total,
      explored,
      percent: total > 0 ? Math.round((explored / total) * 100) : 0,
      labCount: taxonomy.nodes.filter((n) => n.lab).length,
      labTypeCount: taxonomy.stats.labCount,
    };
  }, [taxonomy, summary.stars]);

  /* ── 个性化评语 ─────────────────────────────────────────────── */

  const comment = useMemo(() => {
    if (summary.nodesMastered === 0 && summary.nodesStarted === 0) {
      return isEn
        ? "The map is still untouched. Start from any chain on the left, drag the weights or control points, and the stars will follow your hands."
        : tw("图谱还没有被点亮。从左侧任意一条逻辑链开始——拖动砝码或控制点，星星会跟着你的手亮起来。");
    }
    if (summary.nodesMastered === 0) {
      return isEn
        ? `You have started ${summary.nodesStarted} node(s). Keep going — the third star only comes when you solve a Mystery on your own.`
        : tw(`你已经开始了 ${summary.nodesStarted} 个节点。第三颗星只在你独立破解一个谜题时才会亮起——继续。`);
    }
    const badges = chainBadges.filter((c) => c.unlocked).length;
    if (badges > 0) {
      return isEn
        ? `${summary.nodesMastered} node(s) fully mastered, and ${badges} logic chain badge(s) unlocked. A chain badge means every playable node in that chain reached two stars — that is real, not decorative.`
        : tw(`已有 ${summary.nodesMastered} 个节点三颗星满格，并解锁了 ${badges} 枚逻辑链徽章。徽章意味着那条链上**所有**可玩节点都达到了两星——这不是装饰，是真实覆盖。`);
    }
    return isEn
      ? `${summary.nodesMastered} node(s) fully mastered. Unlock a chain badge by reaching two stars on every playable node in one chain.`
      : tw(`已有 ${summary.nodesMastered} 个节点三颗星满格。把同一条链上所有可玩节点都推到两星，就能点亮那枚逻辑链大师徽章。`);
  }, [summary, chainBadges, isEn, tw]);

  if (!taxonomy) {
    return (
      <div className="flex h-full items-center justify-center">
        <span
          aria-busy="true"
          className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#1D4ED8]"
        />
      </div>
    );
  }

  const certId = certNumber(displayName, summary.stars, summary.nodesMastered);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] px-6 py-7">
        {/* ══════════════ ① 官方结业证书 ══════════════ */}
        <section className="overflow-hidden rounded-2xl border border-[#0B162C] bg-white">
          <div className="relative bg-[#0B162C] px-7 py-6 text-white">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 11px)",
              }}
            />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-[10.5px] tracking-[0.2em] text-white/55 uppercase">
                  {isEn ? "Certificate of Completion" : tw("结业证书")}
                </p>
                <h1 className="mt-1.5 font-serif text-[24px] leading-tight">
                  {isEn ? "Math Logic Universe" : tw("数学逻辑宇宙")}
                </h1>
                <p className="mt-1 text-[11.5px] text-white/60">
                  {DREAM_CLASSROOM.name}
                  {isEn ? " (Houhai, Shenzhen Bay HQ)" : tw(`（${DREAM_CLASSROOM.hqLabel}）`)}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-white/20 px-2.5 py-1 font-mono text-[11px] text-white/75">
                {certId}
              </span>
            </div>
          </div>

          <div className="grid gap-6 px-7 py-6 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="text-[12px] text-[#334155]">
                {isEn ? "This certifies that" : tw("兹证明")}
              </p>
              <p className="mt-1 font-serif text-[26px] leading-tight text-[#0F172A]">
                {displayName}
              </p>
              <p className="mt-2 max-w-lg text-[12.5px] leading-relaxed text-[#334155]">
                {isEn
                  ? `has completed ${summary.nodesMastered} fully mastered node(s) and unlocked ${summary.badges} logic chain badge(s) across ${coverage.total} real knowledge nodes, earning ${summary.stars} star(s) in total.`
                  : tw(`在 ${coverage.total} 个真实知识点构成的国际数学图谱中，完成了 ${summary.nodesMastered} 个节点的三星精通，解锁 ${summary.badges} 枚逻辑链大师徽章，累计获得 ${summary.stars} 颗星。`)}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[11.5px] text-[#0F172A]">
                  <Star size={12} strokeWidth={2.2} className="fill-[#C59B38] text-[#C59B38]" />
                  {summary.stars} {isEn ? "stars" : tw("颗星")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[11.5px] text-[#0F172A]">
                  <Award size={12} strokeWidth={2.2} className="text-[#C59B38]" />
                  {summary.badges} {isEn ? "chain badges" : tw("枚链徽章")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[11.5px] text-[#0F172A]">
                  <Target size={12} strokeWidth={2.2} className="text-[#1D4ED8]" />
                  {coverage.percent}% {isEn ? "coverage" : tw("覆盖")}
                </span>
              </div>
            </div>

            {/* 证书印章 */}
            <div className="flex flex-col items-center justify-center gap-2 sm:w-36">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#C59B38] bg-[#FDF8EC]">
                <div className="text-center">
                  <p className="text-[10px] text-[#8A6A20]">OE</p>
                  <p className="font-serif text-[13px] leading-tight text-[#8A6A20]">
                    {isEn ? "Certified" : tw("认证")}
                  </p>
                  <p className="text-[9px] text-[#8A6A20]">
                    {new Date().getFullYear()}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2.5 text-[11.5px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                >
                  <Printer size={12} strokeWidth={2.2} />
                  {isEn ? "Print" : tw("打印")}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2.5 text-[11.5px] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                >
                  <Download size={12} strokeWidth={2.2} />
                  PDF
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════ ② 覆盖总览 ══════════════ */}
        <section className="mt-4 grid gap-3 sm:grid-cols-4">
          <MetricCard
            Icon={Globe2}
            value={String(coverage.total)}
            label={isEn ? "knowledge nodes" : tw("个知识点")}
            accent="#0B162C"
          />
          <MetricCard
            Icon={Star}
            value={String(summary.stars)}
            label={isEn ? "stars earned" : tw("颗星")}
            accent="#C59B38"
          />
          <MetricCard
            Icon={TrendingUp}
            value={String(summary.nodesMastered)}
            label={isEn ? "nodes mastered" : tw("个精通节点")}
            accent="#1D4ED8"
          />
          <MetricCard
            Icon={Award}
            value={String(summary.badges)}
            label={isEn ? "chain badges" : tw("枚链徽章")}
            accent="#8A6A20"
          />
        </section>

        {/* ══════════════ ③ 逻辑链掌握进度 ══════════════ */}
        <section className="mt-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-[#0F172A]">
              {isEn ? "Logic Chain Mastery" : tw("八条逻辑链掌握进度")}
            </h2>
            <button
              type="button"
              onClick={refreshStars}
              className="text-[11.5px] text-[#1D4ED8] transition-colors hover:text-[#152a4d]"
            >
              {isEn ? "Refresh" : tw("刷新进度")}
            </button>
          </div>

          <div className="mt-3.5 space-y-2.5">
            {chainBadges.map(({ chain, unlocked, stars, maxStars, nodeCount }) => {
              const ratio = maxStars > 0 ? stars / maxStars : 0;
              return (
                <div key={chain.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0B162C] text-[10px] font-bold text-white">
                    {chain.no}
                  </span>
                  <span className="w-40 shrink-0 truncate text-[12px] text-[#0F172A]">
                    {isEn ? chain.nameEn : tw(chain.nameZh)}
                  </span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                    <span
                      className="block h-full rounded-full bg-[#1D4ED8] transition-[width] duration-500"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-[#334155]">
                    {stars}/{maxStars}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                      unlocked
                        ? "border-[#C59B38] bg-[#FDF8EC]"
                        : "border-[#E2E8F0] bg-white",
                    )}
                    title={
                      unlocked
                        ? isEn
                          ? "Chain badge unlocked"
                          : tw("已解锁链徽章")
                        : isEn
                          ? `${nodeCount} playable nodes — reach 2 stars on each`
                          : tw(`${nodeCount} 个可玩节点——每个都达到两星即可解锁`)
                    }
                  >
                    <Award
                      size={12}
                      strokeWidth={2.2}
                      className={
                        unlocked ? "text-[#C59B38]" : "text-[#CBD5E1]"
                      }
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════ ④ 个性化评语 + 精通清单 ══════════════ */}
        <section className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A]">
              {isEn ? "Your Commentary" : tw("个性化评语")}
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#334155]">
              {comment}
            </p>

            <div className="mt-4 border-t border-[#E2E8F0] pt-3">
              <p className="text-[10px] font-medium tracking-[0.14em] text-[#64748B] uppercase">
                {isEn ? "Star meanings" : tw("三星含义")}
              </p>
              <ul className="mt-2 space-y-1.5">
                {MATH_STAR_META.map((meta, i) => (
                  <li key={meta.kind} className="flex items-center gap-2 text-[12px] text-[#334155]">
                    <Star
                      size={12}
                      strokeWidth={2.2}
                      className="fill-[#C59B38] text-[#C59B38]"
                    />
                    <span className="tabular-nums text-[#94A3B8]">0{i + 1}</span>
                    {isEn ? meta.labelEn : tw(meta.labelZh)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="text-[14px] font-semibold text-[#0F172A]">
              {isEn ? "Fully Mastered Nodes" : tw("三颗星满格节点")}
              <span className="ml-1.5 text-[12px] font-normal text-[#64748B]">
                ({masteredNodes.length})
              </span>
            </h2>

            {masteredNodes.length === 0 ? (
              <p className="mt-3 text-[12px] leading-relaxed text-[#64748B]">
                {isEn
                  ? "No node has reached three stars yet. Open a lab from the map and complete all three stages."
                  : tw("还没有节点达到三颗星。从学习地图打开一个实验台，把三个阶段都走完。")}
              </p>
            ) : (
              <ul className="mt-3 space-y-1">
                {masteredNodes.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/lab?node=${encodeURIComponent(n.id)}`}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF]"
                    >
                      <Star
                        size={11}
                        strokeWidth={2.2}
                        className="shrink-0 fill-[#C59B38] text-[#C59B38]"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {isEn ? n.nameEn : tw(n.nameZh ?? n.nameEn)}
                      </span>
                      <span className="shrink-0 text-[10px] text-[#94A3B8]">
                        {n.chainNo}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ══════════════ 数据来源声明 ══════════════ */}
        <section className="mt-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
          <h2 className="text-[13px] font-semibold text-[#0F172A]">
            {isEn ? "Data Provenance" : tw("数据来源")}
          </h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#334155]">
            {isEn
              ? `All ${taxonomy.stats.nodeCount} knowledge nodes and ${taxonomy.stats.edgeCount} prerequisite edges are derived from two real open-source graph datasets. Nothing here is hand-written filler.`
              : tw(`全部 ${taxonomy.stats.nodeCount} 个知识点与 ${taxonomy.stats.edgeCount} 条前置依赖边，均由两个真实开源图谱数据集融合生成。这里的每一个节点都可追溯到开源原始数据，没有一处手写填充。`)}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href={`https://github.com/${taxonomy.attribution.primary.repo}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 transition-colors hover:bg-[#F8FAFC]"
            >
              <p className="text-[11.5px] font-medium text-[#0F172A]">
                {taxonomy.attribution.primary.name}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-[#64748B]">
                {taxonomy.attribution.primary.repo} · {taxonomy.attribution.primary.license}
              </p>
            </a>
            <a
              href={`https://github.com/${taxonomy.attribution.secondary.repo}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 transition-colors hover:bg-[#F8FAFC]"
            >
              <p className="text-[11.5px] font-medium text-[#0F172A]">
                {taxonomy.attribution.secondary.name}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-[#64748B]">
                {taxonomy.attribution.secondary.repo}
              </p>
            </a>
          </div>
          <p className="mt-3 font-mono text-[10.5px] text-[#94A3B8]">
            {taxonomy.generatedAt} · v{taxonomy.version}
          </p>
        </section>
      </div>
    </div>
  );
}

/** 一个指标卡。 */
function MetricCard({
  Icon,
  value,
  label,
  accent,
}: {
  Icon: typeof Globe2;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}12`, color: accent }}
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <p className="text-[10.5px] tracking-[0.1em] text-[#64748B] uppercase">
          {label}
        </p>
      </div>
      <p
        className="mt-2 text-[26px] leading-none font-semibold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  );
}
