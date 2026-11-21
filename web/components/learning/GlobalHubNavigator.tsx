"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Code2,
  FlaskConical,
  GraduationCap,
  Landmark,
  LineChart,
  PlayCircle,
  ScrollText,
  Sparkles,
  Globe,
} from "lucide-react";
import type { GlobalHubCategory, GlobalHubResource } from "@/lib/global-hub-api";
import { cn } from "@/lib/cn";

/**
 * 资源中台分类导航（手风琴）
 * =============================
 *
 * 左侧栏把全网资源中台按 ``categories`` 分组渲染成可折叠的目录：
 *
 * .. code-block:: text
 *
 *     ▾ 顶级高校  硬核
 *       ▸ 哈佛大学 CS50：计算思维入门
 *     ▸ 通识趣味  轻松建立整体认知
 *     ▸ 国内权威  本土语境 · 人文经典
 *
 * 点一个视频 → 中间舞台**平滑切换**到它（不刷新页面），
 * 下方的时间轴与知识交互点同步换成这条视频的。
 *
 * 为什么是手风琴而不是平铺
 * -----------------------
 *
 * 分类是**有名字、有定位的**（"顶级高校" vs "通识趣味"）。用户找
 * 视频时脑子里的第一个问题是「我想看哪一类」，不是「我要看第几个
 * 视频」。手风琴把「分类」这层显性化，匹配用户的检索路径。
 *
 * 展开策略
 * --------
 *
 * * 默认展开**当前选中视频所在的分类**——用户不该「点了视频却看不到
 *   它在哪」；
 * * 其它分类默认收起，但可以同时展开多个（不强制互斥）——跨类比较
 *   是常见动作。
 */

/** 分类图标键 → 图标组件。 */
const CATEGORY_ICON: Record<string, typeof GraduationCap> = {
  "graduation-cap": GraduationCap,
  sparkles: Sparkles,
  landmark: Landmark,
  "book-open": BookOpen,
  globe: Globe,
  // 学科分类（四大主类）。
  code: Code2,
  scroll: ScrollText,
  chart: LineChart,
  flask: FlaskConical,
};

export function GlobalHubNavigator({
  categories,
  activeResourceId,
  onSelect,
  className = "",
}: {
  categories: GlobalHubCategory[];
  /** 当前中间舞台正在播的资源。 */
  activeResourceId?: string | null;
  /** 选中一条视频。 */
  onSelect: (resource: GlobalHubResource, category: GlobalHubCategory) => void;
  className?: string;
}) {
  /** 展开的分类 id 集合。 */
  const [openIds, setOpenIds] = useState<string[]>([]);
  /** 用户是否手动动过展开状态——动过之后就不再自动纠正。 */
  const [touched, setTouched] = useState(false);

  /** 当前选中资源所在的分类。 */
  const activeCategoryId = useMemo(() => {
    for (const category of categories) {
      if (category.resources.some((item) => item.id === activeResourceId)) {
        return category.id;
      }
    }
    return null;
  }, [categories, activeResourceId]);

  /**
   * 自动展开当前所在的分类。
   *
   * 只在用户**没手动动过**展开状态时纠正——否则用户刚收起一个分类，
   * 切换视频又把它弹开，会觉得界面在跟他作对。
   */
  useEffect(() => {
    if (touched || !activeCategoryId) return;
    setOpenIds((prev) =>
      prev.includes(activeCategoryId) ? prev : [...prev, activeCategoryId],
    );
  }, [activeCategoryId, touched]);

  const toggle = (categoryId: string) => {
    setTouched(true);
    setOpenIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  if (categories.length === 0) return null;

  return (
    <nav
      aria-label="课程分类导航"
      className={cn("space-y-1.5", className)}
      data-seek-global-nav
    >
      {categories.map((category) => {
        const Icon = CATEGORY_ICON[category.icon] ?? Globe;
        const open = openIds.includes(category.id);
        const isActiveCategory = activeCategoryId === category.id;

        return (
          <section
            key={category.id}
            className={cn(
              "overflow-hidden rounded-lg border transition-colors",
              // 选中的分类用**极微弱的豆沙粉**（透明度 0.3）——
              // 用户要的是「回到右上角的暖奶油 #FCFBF9」，
              // 所以这里只留一点点暖调的暗示，不铺实色。
              isActiveCategory
                ? "border-[var(--seek-bean-soft-border)] bg-[rgba(243,214,210,0.3)]"
                : "border-[var(--seek-divider)] bg-white/60",
            )}
          >
            {/* ── 分类标题（手风琴把手） ── */}
            <button
              type="button"
              onClick={() => toggle(category.id)}
              aria-expanded={open}
              title={category.description || category.title}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors",
                "hover:bg-[var(--seek-cool)]/60",
              )}
            >
              <Icon
                size={14}
                strokeWidth={2.2}
                className={cn(
                  "shrink-0",
                  isActiveCategory
                    ? "text-[var(--seek-plum)]"
                    : "text-[var(--seek-muted-foreground)]",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium leading-tight text-[var(--foreground)]">
                  {category.title}
                </span>
                {category.subtitle && (
                  <span className="mt-0.5 block truncate text-[10.5px] font-normal text-[var(--muted-foreground)]">
                    {category.subtitle}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[10.5px] font-normal tabular-nums text-[var(--muted-foreground)]">
                {category.resources.length}
              </span>
              <ChevronDown
                size={13}
                strokeWidth={2.4}
                className={cn(
                  "shrink-0 text-[var(--seek-plum)] transition-transform",
                  open ? "rotate-0" : "-rotate-90",
                )}
              />
            </button>

            {/* ── 分类下的视频 ── */}
            {open && (
              <ul className="space-y-1 border-t border-[var(--seek-divider)] px-1.5 py-1.5">
                {category.resources.map((resource) => {
                  const active = resource.id === activeResourceId;
                  return (
                    <li key={resource.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(resource, category)}
                        aria-current={active}
                        title={resource.title}
                        className={cn(
                          "seek-key-sm flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
                          active
                            ? "bg-[var(--seek-bean-soft)] text-[var(--seek-plum)]"
                            : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--seek-cool)]/60",
                        )}
                      >
                        <PlayCircle
                          size={13}
                          strokeWidth={2.2}
                          className={cn(
                            "mt-[1px] shrink-0",
                            active
                              ? "text-[var(--seek-plum)]"
                              : "text-[var(--seek-muted-foreground)]",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-normal leading-snug">
                            {resource.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-normal">
                            <span className="opacity-70">{resource.provider}</span>
                            {resource.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-[var(--seek-plum)]/8 px-1.5 py-px"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
