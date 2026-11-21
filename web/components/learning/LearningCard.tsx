"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressRing } from "@/components/learning/ProgressRing";
import { formatRelativeTime } from "@/lib/relative-time";

interface LearningCardContentProps {
  title: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  updatedAt?: number;
  progress?: number;
}

/**
 * 共享的身份行，也用于带自己菜单或视频缩略图的列表里。
 *
 * 复刻自 DeepTutor 的 ``components/learning/LearningCard.tsx``。
 */
export function LearningCardContent({
  title,
  subtitle,
  icon,
  updatedAt,
  progress,
}: LearningCardContentProps) {
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--muted-foreground)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        {subtitle && (
          <div className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)]">
            {subtitle}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {progress !== undefined && <ProgressRing value={progress} />}
        {updatedAt !== undefined && Number.isFinite(updatedAt) && updatedAt > 0 && (
          <time
            dateTime={new Date(updatedAt * 1000).toISOString()}
            className="text-[11px] text-[var(--muted-foreground)]"
          >
            {formatRelativeTime(updatedAt, "zh-CN")}
          </time>
        )}
      </div>
    </>
  );
}

/** 用户自拟的标题原样渲染；调用方只翻译产品文案。 */
export function LearningCard({
  href,
  onClick,
  ...content
}: LearningCardContentProps & { href: string; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group flex min-w-0 items-center gap-3 rounded-xl bg-muted/45 p-4 transition hover:bg-muted/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <LearningCardContent {...content} />
    </Link>
  );
}
