"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * [← 返回公开课]
 * ==============
 *
 * 一颗**极其醒目**的返回按钮——它出现在每一个「正在播放视频」的
 * 场景的左上角。
 *
 * 为什么它必须这么醒目
 * --------------------
 *
 * 之前的导航结构里，用户一旦点进某一讲公开课，就**只剩一条窄窄的
 * 深蓝导航栏**可以点——而那条栏上全是路由链接（首页 / 课程 / 公开课 /
 * 计划），没有一条是「回到我刚才在看的那个列表」。
 *
 * 结果是用户被困住了：想回到目录，得先想清楚该点哪个图标；点错了
 * 还要再找回来。**「看视频」和「看目录」是两种心智状态**，中间不该
 * 隔着一道需要推理的关卡。
 *
 * 所以在视频播放场景的左上角放一颗明确的返回按钮——不用推理，
 * 不用找，一眼就看见。
 *
 * 显示条件
 * --------
 *
 * 只在**视频播放上下文**里显示：
 *
 * - 路由是 ``/hub``——公开课大厅当前正在播视频；
 * - 路由是 ``/learning/courses/*``——课程页里嵌着视频块。
 *
 * 在纯列表页（课程库、学情中心）里**不显示**——那里没有「回去」
 * 的必要，硬加一颗只会变成噪声。
 */
export function BackToHubButton({
  className = "",
  label = "返回公开课",
}: {
  className?: string;
  /** 按钮文案。 */
  label?: string;
}) {
  const pathname = usePathname();

  // 只有在「正在播放视频」的路由里才出现。
  const inVideoContext =
    pathname === "/hub" || pathname?.startsWith("/learning/courses/");
  if (!inVideoContext) return null;

  return (
    <Link
      href="/hub"
      aria-label={label}
      title={label}
      className={cn(
        // 深蓝实心 + 白字——这是全站**唯一的**实心深蓝按钮，
        // 存在感必须足够强，才能在「困在详情页」时第一眼看见。
        //
        // 圆角做成全圆（pill）而不是方角：它是个「回到起点」的
        // 动作，不是「切到另一个页面」的导航。
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full",
        "bg-[var(--primary)] px-3 text-[12.5px] font-medium text-white",
        "transition-[transform,opacity] hover:opacity-90 active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2",
        className,
      )}
    >
      <ArrowLeft size={14} strokeWidth={2.4} />
      {label}
    </Link>
  );
}
