"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, Maximize2 } from "lucide-react";
import { FullscreenModal } from "@/components/common/FullscreenModal";

/**
 * Mermaid 图表渲染器。
 *
 * 聊天回复里出现的 ```mermaid 代码块会被路由到这里——不让用户看到
 * 生硬的语法，而是直接渲染成图。
 *
 * 几个刻意的设计：
 *
 * * **按需动态加载** —— mermaid 有 2MB+ 的运行时（还要带上 d3 系的
 *   依赖），不能进主 bundle。聊天窗口之外的页面根本用不上。
 * * **唯一 id** —— mermaid 要求每个图有全局唯一的 DOM id，否则第二张
 *   图会覆盖第一张。用 React 的 `useId` 保证。
 * * **流式期间不渲染** —— 半截的 mermaid 源码必然解析失败，会闪一屏
 *   错误。宁可等内容稳定再画。
 * * **失败可回退** —— 解析不了就退回等宽代码块，并把原文给用户，
 *   这样信息不会因为一个语法错误而丢失。
 * * **可全屏放大** —— 思维导图在窄栏里看不清结构，右上角的
 *   [⛶] 按钮把它弹到整屏。
 */
export default function MermaidChart({
  chart,
  className = "",
}: {
  /** mermaid 源码（不含 ```mermaid 围栏）。 */
  chart: string;
  className?: string;
}) {
  const reactId = useId();
  const chartId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** 全屏放大状态。 */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setLoading(true);
      setError(null);
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "var(--font-sans)",
          flowchart: { htmlLabels: true, curve: "basis" },
          // 中文标签在 flowchart 里常被截断，给足宽度。
          themeVariables: { fontSize: "13px" },
        });

        const { svg: rendered } = await mermaid.render(chartId, chart);

        if (cancelled) return;
        setSvg(rendered);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [chart, chartId]);

  if (error) {
    // 渲染失败时退回源码——信息不能因为图形引擎的局限而消失。
    return (
      <div className={`my-3 overflow-hidden rounded-xl border border-[var(--border)] ${className}`}>
        <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--muted)]/60 px-3 py-1.5 text-[11px] text-[var(--muted-foreground)]">
          <AlertTriangle size={11} strokeWidth={2} />
          图表无法渲染，已退回源码
        </div>
        <pre className="overflow-x-auto bg-[#1f2937] p-3 text-[12px] leading-relaxed text-[#e5e7eb]">
          <code className="font-mono">{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <>
      <div
        className={`group relative my-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] ${className}`}
      >
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-[var(--muted-foreground)]">
            <Loader2 size={13} className="animate-spin" />
            正在绘制图表…
          </div>
        )}

        {/* 放大按钮——悬停时才浮现，避免干扰阅读。 */}
        {!loading && svg && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="全屏放大"
            aria-label="全屏放大图表"
            className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)]/90 text-[var(--muted-foreground)] opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Maximize2 size={11} strokeWidth={1.9} />
          </button>
        )}

        <div
          ref={containerRef}
          className={`overflow-x-auto p-4 ${loading ? "hidden" : ""}`}
          // mermaid 产出的 SVG 自带样式与内联属性，只能走 dangerouslySetInnerHTML。
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
      </div>

      {/* 全屏放大 */}
      <FullscreenModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title="图表 · 全屏"
      >
        <div
          className="flex min-h-full items-center justify-center"
          // 全屏下复用同一份 SVG——不重新渲染，省一次 mermaid 调用。
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
      </FullscreenModal>
    </>
  );
}
