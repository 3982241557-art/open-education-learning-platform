"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, AlertCircle, BookOpen, RefreshCw, type LucideIcon } from "lucide-react";
import type { ReactNode, Ref, UIEventHandler } from "react";
import { FeaturePage, PageHeader } from "@/components/layout/FeaturePage";

export const LEARNING_HUB = "/learning";

/**
 * 学习类页面的统一节奏：中心页与每个列表页共用同一套页头、空状态与骨架。
 *
 * 复刻自 DeepTutor 的 ``components/learning/LearningShell.tsx``。
 */
export function LearningShell({
  title,
  subtitle,
  action,
  tabs,
  children,
  back = true,
  className = "",
  scrollRef,
  onScroll,
  icon,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  action?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  back?: boolean;
  className?: string;
  scrollRef?: Ref<HTMLElement>;
  onScroll?: UIEventHandler<HTMLElement>;
  icon?: LucideIcon;
}) {
  const pathname = usePathname();
  const surfaceIcon = pathname?.startsWith(LEARNING_HUB) ? BookOpen : (icon ?? BookOpen);

  return (
    <FeaturePage scrollRef={scrollRef} onScroll={onScroll} className={className}>
      {back && (
        <Link
          href={LEARNING_HUB}
          className="dt-section-back mb-5 inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} />
          课程
        </Link>
      )}
      <PageHeader
        title={title}
        description={subtitle}
        action={action}
        icon={icon ?? surfaceIcon}
      />
      {tabs}
      <div className={tabs ? "mt-6" : ""}>{children}</div>
    </FeaturePage>
  );
}

export function LearningEmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="my-6 rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 flex justify-center text-[var(--muted-foreground)]">{icon}</div>
      )}
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LearningErrorState({
  message,
  onRetry,
}: {
  message: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="my-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 p-4 text-sm"
    >
      <AlertCircle size={16} className="shrink-0 text-[var(--destructive)]" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 font-medium hover:underline"
        >
          <RefreshCw size={14} />
          重试
        </button>
      )}
    </div>
  );
}

export function LearningSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="加载中…"
      className="my-6 grid gap-3"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--muted)]/60 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
