"use client";

import { Brain, Loader2 } from "lucide-react";
import { useAiPresence } from "@/context/AiPresenceContext";
import { cn } from "@/lib/cn";

/**
 * AI 状态呼吸灯。
 *
 * 一个极小的存在指示：AI 在读、在想、还是已经就绪。它不吸引注意力，
 * 但让用户知道 AI 一直在线——这是「隐形且随时在」的视觉锚点。
 */
export function InsightIndicator({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { state, awareness } = useAiPresence();

  const label =
    state === "thinking" ? "思考中" : state === "reading" ? "阅读中" : "在线";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={awareness || "AI 在线"}
    >
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            state === "thinking"
              ? "animate-ping bg-[var(--foreground)]/20"
              : "bg-[var(--foreground)]/8",
          )}
        />
        {state === "thinking" ? (
          <Loader2
            size={9}
            className="relative animate-spin text-[var(--muted-foreground)]"
          />
        ) : (
          <Brain
            size={9}
            strokeWidth={1.8}
            className="relative text-[var(--muted-foreground)]"
          />
        )}
      </span>
      {showLabel ? (
        <span className="text-[10.5px] text-[var(--muted-foreground)]">{label}</span>
      ) : null}
    </span>
  );
}
