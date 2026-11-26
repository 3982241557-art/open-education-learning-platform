"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";
import type { MathChain } from "@/lib/math-taxonomy";

export interface ChainFilterProps {
  chains: MathChain[];
  /** 每条链的进度：已点亮星数 / 总星数。 */
  progress: Record<string, { stars: number; maxStars: number }>;
  activeChainId: string | null;
  onSelect: (chainId: string | null) => void;
  isEn: boolean;
}

/**
 * 数学逻辑链快速筛选器
 * =====================
 *
 * 左侧筛选逻辑：按学习链一键聚焦，实时显示每条链的
 * 「已点亮 / 总节点」进度条。
 *
 * 进度条读的是**真实账本**——localStorage 里每个节点的三颗星。
 * 不是装饰性动画。
 */
export default function ChainFilter({
  chains,
  progress,
  activeChainId,
  onSelect,
  isEn,
}: ChainFilterProps) {
  const tw = useTraditional();
  const rows = useMemo(
    () =>
      chains.map((chain) => {
        const p = progress[chain.id] ?? { stars: 0, maxStars: chain.nodeCount * 3 };
        const ratio = p.maxStars > 0 ? p.stars / p.maxStars : 0;
        return { chain, p, ratio };
      }),
    [chains, progress],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
        {isEn ? "Logic Chains" : tw("数学逻辑链")}
      </p>

      {/* 全部 */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeChainId === null}
        className={cn(
          "mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
          activeChainId === null
            ? "bg-[#1D4ED8] text-white"
            : "text-white/72 hover:bg-white/8",
        )}
      >
        <span className="font-medium">{isEn ? "All Chains" : tw("全部逻辑链")}</span>
        <span className="text-[10.5px] tabular-nums opacity-70">
          {chains.length}
        </span>
      </button>

      {/* 各链 */}
      <div className="space-y-0.5">
        {rows.map(({ chain, p, ratio }) => {
          const active = activeChainId === chain.id;
          return (
            <button
              key={chain.id}
              type="button"
              onClick={() => onSelect(active ? null : chain.id)}
              aria-pressed={active}
              className={cn(
                "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                active
                  ? "bg-white/12 text-white"
                  : "text-white/72 hover:bg-white/8",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    active ? "text-white" : "text-white/40",
                  )}
                >
                  {chain.no}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                  {isEn ? chain.nameEn : tw(chain.nameZh)}
                </span>
              </span>

              {/* 进度条 */}
              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/12">
                  <span
                    className="block h-full rounded-full bg-[#C59B38] transition-[width] duration-300"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-white/50">
                  {p.stars}/{p.maxStars}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
