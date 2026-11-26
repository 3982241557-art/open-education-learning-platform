"use client";

import Link from "next/link";
import { Star, Zap, Lock } from "lucide-react";
import { LAB_META, type MathNode } from "@/lib/math-taxonomy";
import { countNodeStars, readNodeStars } from "@/lib/math-star-ledger";
import { useDynamicBilingual, useTraditional } from "@/lib/use-bilingual";
import { cn } from "@/lib/cn";

/** 画布上已摆放好的节点。 */
export interface PlacedNode {
  node: MathNode;
  x: number;
  y: number;
  order: number;
  /** 是否是该链的第一课（挂 START 徽章）。 */
  isStart: boolean;
  /** 该节点的前置节点 id（链内）。 */
  prevId: string | null;
  /** 该节点的后继节点 id（链内）。 */
  nextId: string | null;
  /** 与前置之间那条边的性质。 */
  edgeKind: "direct" | "derived" | "sequential" | null;
}

/**
 * 地图上的一个节点卡片
 * ====================
 *
 * 四种轨迹状态——**视觉上一眼可辨**：
 *
 * - 已精通（3 星）：深牛津蓝实心 + 3 颗哑光金星；
 * - 探索中（1–2 星）：蓝色高亮描边 + 已亮星数；
 * - ⚡ OE 自研实验台（未学）：纯白实心卡片 + ⚡ 徽标 + 「可直接开玩」；
 * - 待解锁实验室（未学）：虚线边框 + 「研发中」标注。
 */
export default function MapNodeCard({
  placed,
  selected,
  isEn,
  tick,
  onSelect,
}: {
  placed: PlacedNode;
  selected: boolean;
  isEn: boolean;
  tick: number;
  onSelect: () => void;
}) {
  const { node, x, y, order, isStart } = placed;
  const t = useDynamicBilingual();
  const tw = useTraditional();
  const stars = countNodeStars(node.id);
  const mastered = stars >= 3;
  const exploring = stars >= 1 && stars < 3;
  const playable = Boolean(node.lab);
  const label = t(node.nameZh, node.nameEn);

  return (
    <button
      type="button"
      onClick={onSelect}
      data-tick={tick}
      data-node-id={node.id}
      className={cn(
        "absolute w-[186px] rounded-lg border px-2.5 py-2 text-left transition-all",
        mastered
          ? "border-[#0B162C] bg-[#0B162C] text-white shadow-[0_4px_14px_rgba(11,22,44,0.24)]"
          : exploring
            ? "border-[#1D4ED8] bg-white text-[#0F172A] shadow-[0_0_0_2px_rgba(29,78,216,0.14)]"
            : playable
              ? "border-[#E2E8F0] bg-white text-[#0F172A] shadow-[0_1px_3px_rgba(11,22,44,0.06)] hover:border-[#CBD5E1]"
              : "border-dashed border-[#CBD5E1] bg-white text-[#334155] hover:border-[#94A3B8]",
        selected && "ring-2 ring-[#C59B38] ring-offset-1",
      )}
      style={{ left: x - 93, top: y - 28 }}
    >
      {/* 顶部：序号 + 徽标 + 星星 */}
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-[9.5px] tabular-nums",
            mastered ? "text-white/50" : "text-[#94A3B8]",
          )}
        >
          {String(order).padStart(2, "0")}
        </span>

        {/* 第一课 · START 徽章 */}
        {isStart ? (
          <span
            className={cn(
              "inline-flex h-4 items-center gap-0.5 rounded px-1 text-[9px] font-semibold",
              mastered ? "bg-white/15 text-white" : "bg-[#0B162C] text-white",
            )}
          >
            START
          </span>
        ) : null}

        {node.lab ? (
          <span
            title={isEn ? LAB_META[node.lab].nameEn : tw(LAB_META[node.lab].nameZh)}
            className={cn(
              "inline-flex h-4 items-center gap-0.5 rounded px-1 text-[9px] font-semibold",
              mastered ? "bg-white/15 text-white" : "bg-[#1D4ED8] text-white",
            )}
          >
            <Zap size={8} strokeWidth={3} />
            {isEn ? "Lab" : tw("实验台")}
          </span>
        ) : null}

        <span className="ml-auto flex items-center gap-0.5">
          {[0, 1, 2].map((i) => (
            <Star
              key={i}
              size={9}
              strokeWidth={2.2}
              className={
                i < stars
                  ? "fill-[#C59B38] text-[#C59B38]"
                  : mastered
                    ? "text-white/30"
                    : "text-[#CBD5E1]"
              }
            />
          ))}
        </span>
      </span>

      {/* 节点名 */}
      <span className="mt-1 block truncate text-[11.5px] leading-tight font-medium">
        {label}
      </span>

      {/* 英文名（中文模式下作为对照小字） */}
      {!isEn ? (
        <span
          className={cn(
            "mt-0.5 block truncate text-[9.5px] leading-tight",
            mastered ? "text-white/55" : "text-[#64748B]",
          )}
        >
          {node.nameEn}
        </span>
      ) : null}

      {/* 状态标注 */}
      {!playable ? (
        <span
          className={cn(
            "mt-1 inline-flex items-center gap-0.5 rounded px-1 text-[9px]",
            mastered ? "bg-white/15 text-white/70" : "bg-[#F1F5F9] text-[#64748B]",
          )}
        >
          <Lock size={8} strokeWidth={2.6} />
          {isEn ? "in development" : tw("实验室待解锁")}
        </span>
      ) : null}
    </button>
  );
}

/**
 * 节点详情面板
 * =============
 *
 * 展示真实的中英文名、前置依赖关系、核心概念定义。
 */
export function NodeDetail({
  placed,
  isEn,
  tick,
  onClose,
}: {
  placed: PlacedNode;
  isEn: boolean;
  tick: number;
  onClose: () => void;
}) {
  const { node } = placed;
  const t = useDynamicBilingual();
  const tw = useTraditional();
  const stars = countNodeStars(node.id);
  const state = readNodeStars(node.id);
  const label = t(node.nameZh, node.nameEn);

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-[#E2E8F0] bg-white">
      {/* 头部 */}
      <div className="border-b border-[#E2E8F0] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#64748B] uppercase">
              {node.chainNo} · {node.domain}
            </p>
            <h2 className="mt-1 text-[15px] leading-tight font-semibold text-[#0F172A]">
              {label}
            </h2>
            {!isEn ? (
              <p className="mt-0.5 text-[11.5px] text-[#334155]">{node.nameEn}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? "Close" : tw("关闭")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#334155] transition-colors hover:bg-[#F8FAFC]"
          >
            ×
          </button>
        </div>

        {/* 星星 */}
        <div className="mt-2.5 flex items-center gap-1.5" data-tick={tick}>
          {(["explore", "discover", "mystery"] as const).map((kind, i) => (
            <span
              key={kind}
              className="flex h-5 items-center gap-1 rounded border border-[#E2E8F0] px-1.5"
            >
              <Star
                size={11}
                strokeWidth={2.2}
                className={
                  state[kind] ? "fill-[#C59B38] text-[#C59B38]" : "text-[#CBD5E1]"
                }
              />
              <span className="text-[9.5px] text-[#64748B]">
                {String(i + 1).padStart(2, "0")}
              </span>
            </span>
          ))}
          <span className="ml-1 text-[11px] tabular-nums text-[#334155]">
            {stars}/3
          </span>
        </div>
      </div>

      {/* 概念定义 */}
      <div className="border-b border-[#E2E8F0] p-4">
        <p className="text-[10px] font-medium tracking-[0.12em] text-[#64748B] uppercase">
          {isEn ? "Core concept" : tw("核心概念")}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#334155]">
          {t(node.descriptionZh, node.descriptionEn)}
        </p>
      </div>

      {/* 人教版归属 */}
      {node.cnRef ? (
        <div className="border-b border-[#E2E8F0] p-4">
          <p className="text-[10px] font-medium tracking-[0.12em] text-[#64748B] uppercase">
            {isEn ? "Curriculum" : tw("人教版归属")}
          </p>
          <p className="mt-1.5 text-[12px] text-[#0F172A]">
            {node.cnRef.book}
            {node.cnRef.chapter ? ` · ${node.cnRef.chapter}` : ""}
          </p>
          {node.cnRef.grade ? (
            <p className="mt-0.5 text-[11px] text-[#334155]">
              {isEn ? "Grade " : tw("年级 ")}
              {node.cnRef.grade}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 因果位置 */}
      <div className="border-b border-[#E2E8F0] p-4">
        <p className="text-[10px] font-medium tracking-[0.12em] text-[#64748B] uppercase">
          {isEn ? "Causal stage" : tw("因果位置")}
        </p>
        <p className="mt-1.5 text-[12px] text-[#0F172A]">
          {placed.order === 1
            ? isEn
              ? "First lesson — start here"
              : tw("第一课 · 从这里开始")
            : isEn
              ? `Step ${placed.order} in this chain`
              : tw(`本链第 ${placed.order} 步`)}
        </p>
      </div>

      {/* 证据 */}
      {node.evidence.length > 0 ? (
        <div className="border-b border-[#E2E8F0] p-4">
          <p className="text-[10px] font-medium tracking-[0.12em] text-[#64748B] uppercase">
            {isEn ? "Evidence of mastery" : tw("掌握证据")}
          </p>
          <ul className="mt-1.5 space-y-1">
            {node.evidence.map((e, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[#334155]"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#C59B38]" />
                <span className="min-w-0 break-words">{e}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 行动按钮 */}
      <div className="mt-auto p-4">
        {node.lab ? (
          <Link
            href={`/lab?node=${encodeURIComponent(node.id)}`}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0B162C] text-[13px] font-medium text-white transition-colors hover:bg-[#152a4d]"
          >
            <Zap size={14} strokeWidth={2.6} />
            {isEn ? "Enter the lab" : tw("进入实验台")}
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5 text-center">
            <p className="text-[11.5px] font-medium text-[#334155]">
              {isEn ? "Depth lab in development" : tw("深度实验室研发中")}
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[#64748B]">
              {isEn
                ? "Start from the first step of this chain — this node's hands-on lab is being built."
                : tw("先从本链第一步开始——这个节点的实验台正在研发中。")}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
