"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 底部辅助区
 * ==========
 *
 * 视频下方的三个折叠栏：**知识节点** / **段落导读** / **完整字幕**。
 *
 * 默认 100% 折叠
 * --------------
 *
 * 刚进入单集学习页时，三栏**全部收起**，只显示一行干净的折叠
 * 触发条（带 ``▸`` 箭头）。点击才展开。
 *
 * 为什么这么做
 * ------------
 *
 * 这是「减字防分心」的具体落点。展开后的三个列表加起来可能有
 * 上百行——用户看视频时它们全部**占着屏幕**，注意力被拉走。
 *
 * 折叠之后：
 *
 * * 屏幕上只有一行标签——**视觉噪音降一个数量级**；
 * * 用户想看字幕时主动点开——**意图明确**，不会被干扰；
 * * 移动端尤其重要——展开状态下正文会把播放器顶到屏幕外。
 *
 * 展开时的行为
 * ------------
 *
 * * **同时只展开一栏**——展开新的会收起旧的。这样辅助区的高度
 *   是**可控**的，不会叠成一座山；
 * * 高度有上限（``max-h-[42vh]``）+ 内部滚动——长字幕列表不会
 *   把页面撑到无穷长。
 */

/** 一个折叠栏。 */
export interface AuxSection {
  /** 栏 id。 */
  id: string;
  /** 栏标题。 */
  title: string;
  /** 条目数——显示在标题右侧。 */
  count: number;
  /** 栏内容。 */
  content: ReactNode;
}

/** 组件属性。 */
export interface BottomAuxPanelProps {
  /** 折叠栏列表。 */
  sections: AuxSection[];
  /** 小学部（更圆润、Q 弹）。 */
  playful?: boolean;
  className?: string;
}

export function BottomAuxPanel({
  sections,
  playful = false,
  className,
}: BottomAuxPanelProps) {
  /** 当前展开的栏 id——``null`` 表示全部收起。 */
  const [openId, setOpenId] = useState<string | null>(null);

  const radius = playful ? "rounded-2xl" : "rounded-xl";

  return (
    <div className={cn("space-y-1.5", className)}>
      {sections.map((section) => {
        const open = openId === section.id;

        return (
          <section
            key={section.id}
            className={cn(
              "overflow-hidden border border-[var(--border)] bg-white",
              radius,
            )}
          >
            {/* ── 触发条 ── */}
            <button
              type="button"
              onClick={() => setOpenId(open ? null : section.id)}
              aria-expanded={open}
              className={cn(
                "flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors",
                playful && "seek-press",
                !playful && "transition-colors",
                open ? "bg-[var(--muted)]/60" : "hover:bg-[var(--muted)]/40",
              )}
            >
              {/* 箭头——展开时旋转 90°。 */}
              <ChevronRight
                size={13}
                strokeWidth={2.4}
                className={cn(
                  "shrink-0 text-[var(--primary)] transition-transform duration-200",
                  open && "rotate-90",
                )}
              />
              <span className="text-[12.5px] font-medium text-[var(--foreground)]">
                {section.title}
              </span>
              {section.count > 0 ? (
                <span className="rounded-full bg-[var(--muted)] px-1.5 py-px text-[10.5px] font-medium tabular-nums text-[var(--muted-foreground)]">
                  {section.count}
                </span>
              ) : null}
            </button>

            {/* ── 内容（默认不渲染）──
             *
             * ⚠️ 用条件渲染而不是 CSS 隐藏——折叠时那些节点根本不该
             *    出现在 DOM 里（字幕可能上百条，DOM 里留着会拖慢
             *    首次交互）。
             */}
            {open ? (
              <div className="max-h-[42vh] overflow-y-auto border-t border-[var(--border)] px-3.5 py-3">
                {section.count > 0 ? (
                  section.content
                ) : (
                  <p className="py-3 text-center text-[12px] text-[var(--muted-foreground)]">
                    这一讲还没有{section.title}。
                  </p>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
