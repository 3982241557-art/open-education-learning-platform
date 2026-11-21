"use client";

import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { FullscreenModal } from "@/components/common/FullscreenModal";

/**
 * 可放大的表格
 * ===========
 *
 * AI 生成的表格（对比表、数据表、术语表）在窄栏里只能横向滚动，
 * 很容易被忽略掉——尤其是列多的时候，每列都被压成几个字。
 *
 * 这个组件把表格包起来，右上角给一个 [⛶] 按钮，点击后整屏展示，
 * 细节绝对清晰。
 *
 * 判断「该不该给放大按钮」
 * ----------------------
 *
 * 不是所有表格都需要。宽度小于一屏的表格放大后反而更难看（周围全是
 * 空白）。这里用**列数**作为判据：3 列以内不显示按钮，4 列及以上
 * 才给——这是经验值，也避免了给用户塞一堆没用的按钮。
 */
export function ExpandableTable({
  children,
  columnCount = 0,
  title = "表格",
}: {
  children: ReactNode;
  /** 列数——用来决定要不要显示放大按钮。 */
  columnCount?: number;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = columnCount === 0 || columnCount >= 4;

  return (
    <>
      <div className="group relative my-3 overflow-hidden rounded-lg border border-[var(--border)]">
        {/* 放大按钮 */}
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="全屏放大"
            aria-label="全屏放大表格"
            className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)]/90 text-[var(--muted-foreground)] opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Maximize2 size={11} strokeWidth={1.9} />
          </button>
        )}

        <div className="overflow-x-auto">{children}</div>
      </div>

      <FullscreenModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title={title}
      >
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          {children}
        </div>
      </FullscreenModal>
    </>
  );
}
