import type { ComponentPropsWithRef, ReactNode, Ref, UIEventHandler } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * 功能页标准（复刻自 DeepTutor 的 ``components/layout/FeaturePage.tsx``）：
 *
 * - 居中 1180px 外框，横向留白 24px，768px 起 36px；
 * - 纵向留白 28px，1024px 起 36px；
 * - 页面标题 27px / 30px，无标题图标；描述 12.5px，分区标题 13.5px；
 * - 每页只有一个 h1；
 * - 网格共享 520 / 800 / 1040px 容器断点与 12px 间距。
 *
 * 每个滚动页面用一次 FeaturePage；已有滚动容器内改用 PageContainer。
 * 子组件不要再加一层页面留白。
 */
export function PageContainer({
  children,
  className = "",
  spacing = "page",
  ...props
}: ComponentPropsWithRef<"div"> & { spacing?: "page" | "toolbar" }) {
  return (
    <div
      {...props}
      data-page-container
      className={`dt-page-container mx-auto w-full min-w-0 max-w-[1180px] px-6 md:px-9 ${
        spacing === "page" ? "py-7 lg:py-9" : "py-3"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function FeaturePage({
  children,
  className = "",
  scrollRef,
  onScroll,
}: {
  children: ReactNode;
  className?: string;
  scrollRef?: Ref<HTMLElement>;
  onScroll?: UIEventHandler<HTMLElement>;
}) {
  return (
    <section
      ref={scrollRef}
      onScroll={onScroll}
      data-feature-page
      className={`h-full min-h-0 w-full min-w-0 overflow-y-auto bg-[var(--background)] text-[var(--foreground)] [scrollbar-gutter:stable] ${className}`}
    >
      <PageContainer>{children}</PageContainer>
    </section>
  );
}

export const PAGE_TITLE_CLASS =
  "dt-page-title min-w-0 break-words font-semibold leading-normal tracking-[-0.02em] text-[var(--foreground)]";

export const PAGE_DESCRIPTION_CLASS =
  "mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--muted-foreground)]";

export const PAGE_SECTION_TITLE_CLASS =
  "text-[13.5px] font-semibold text-[var(--foreground)]";

const PAGE_ACTIONS_CLASS =
  "flex max-w-full shrink-0 flex-wrap items-center gap-2 [&>div]:max-w-full [&>div]:flex-wrap";

/**
 * 页面头部。无分隔线。标题图标只在该布局需要时才画（现代布局会显示）。
 * 次级分区用 h2，所以一个功能页永远只有一个主标题。
 */
export function PageHeader({
  title,
  description,
  action,
  meta,
  level = 1,
  titleId,
  icon: Icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  meta?: ReactNode;
  level?: 1 | 2;
  titleId?: string;
  icon?: LucideIcon;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header
      data-page-header
      data-level={level}
      className="dt-page-header mb-6 flex min-w-0 flex-col gap-4"
    >
      <div className="min-w-0">
        {Icon && level === 1 && (
          <span aria-hidden className="dt-page-icon">
            <Icon size={28} strokeWidth={1.5} />
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <Heading id={titleId} className={level === 1 ? PAGE_TITLE_CLASS : PAGE_SECTION_TITLE_CLASS}>
            {title}
          </Heading>
          {meta && <div data-page-meta>{meta}</div>}
        </div>
        {description && <p className={PAGE_DESCRIPTION_CLASS}>{description}</p>}
      </div>
      {action && <div data-page-actions className={PAGE_ACTIONS_CLASS}>{action}</div>}
    </header>
  );
}

export function pageActionClass(variant: "primary" | "secondary" = "primary") {
  return `dt-page-action inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-medium leading-[18px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 ${
    variant === "primary"
      ? "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"
      : "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
  }`;
}

/**
 * 列数描述内容本身，容器断点则统一控制所有列表的宽度。
 * div 和语义化列表都用得上。
 */
export function pageGridClass(columns: 2 | 3 | 4 | 5 = 2) {
  return `dt-page-grid dt-page-grid-${columns}`;
}
