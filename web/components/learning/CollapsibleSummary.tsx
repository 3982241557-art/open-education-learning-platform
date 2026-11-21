"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 折叠式简介
 * ==========
 *
 * 一段导读文字，默认**只显示一行**，点开才看全文。
 *
 * 为什么
 * ------
 *
 * 资源枢纽型课程的「导读」往往是一大段话——作者把这一节的背景、
 * 讲了什么、为什么值得看都写在里面。摊开在标题下面，它就成了
 * 整个页面的**第一屏噪音**：用户还没看到视频，就先被一段小字墙
 * 挡住了。
 *
 * 折叠成一行摘要 + 一个「展开导读」便签按钮之后：
 *
 * * 默认状态只有一行，用户一眼知道「这节讲什么」，但不被淹没；
 * * 想细看的人点一下便签，全文展开。
 *
 * 摘要取**第一句**——按中文句号 / 英文句号切分。切开的那半句
 * 正好是「这节讲什么」的答案。
 */
export function CollapsibleSummary({
  summary,
  className = "",
}: {
  summary?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const text = (summary ?? "").trim();
  if (!text) return null;

  /**
   * 摘要怎么截。
   *
   * 先按**句号**切——第一句正好是「这节讲什么」的答案。
   *
   * 但如果第一句本身就接近整段（比如一整段只有一个句号），
   * 折叠就没有意义了：用户看到的和展开后的一模一样。
   * 这时改成按**字数**硬截，保证摘要明显短于全文——
   * 「折叠」必须真的省下空间，否则那个按钮就是纯噪音。
   */
  const firstStop = text.search(/[。！？.!?]\s/);
  let headline = "";
  if (firstStop > 8 && firstStop < 120) {
    headline = text.slice(0, firstStop + 1);
  } else {
    headline = text.length > 90 ? `${text.slice(0, 90)}…` : text;
  }

  // 摘要必须比全文短出**一段明显的量**，否则不值得折叠。
  const collapsible = text.length - headline.length > 12;

  return (
    <div className={cn("space-y-1.5", className)} data-seek-summary>
      {open ? (
        <p className="text-[15px] leading-[1.8] font-medium text-[var(--muted-foreground)]">
          {text}
        </p>
      ) : (
        <p className="text-[15px] leading-[1.75] font-medium text-[var(--muted-foreground)]">
          {headline}
        </p>
      )}

      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="seek-sticky inline-flex items-center gap-1 rounded-lg bg-[var(--seek-cool)] px-2.5 py-1 text-[11.5px] text-[var(--seek-plum)] hover:bg-[var(--seek-cool)]/70"
        >
          {open ? (
            <ChevronUp size={12} strokeWidth={2.4} />
          ) : (
            <ChevronDown size={12} strokeWidth={2.4} />
          )}
          {open ? "收起导读" : "展开导读"}
        </button>
      )}
    </div>
  );
}
