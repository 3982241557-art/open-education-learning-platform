"use client";

import Link from "next/link";
import {
  Clock,
  GraduationCap,
  MessageSquare,
  NotebookPen,
  Play,
} from "lucide-react";
import type { GlobalHubResource } from "@/lib/global-hub-api";
import { cn } from "@/lib/cn";

/**
 * 流媒体公开课卡片
 * =================
 *
 * 「课程」页里的每一门课，都是一门**可以立刻播放**的公开课——不是
 * 一段静态文字，不是需要另外点进详情页才能看到内容的占位卡片。
 *
 * 为什么要重做这一层
 * ------------------
 *
 * 之前 ``/courses`` 指向的是**旧版本地静态课程**——那些课程是
 * 纯文本的 markdown，没有流媒体、没有时间戳气泡、没有 AI 伴学。
 * 用户从任何一个入口点进来，看到的却是两套完全不同的产品：
 *
 * * 从「公开课」进 → 现代流媒体闭环；
 * * 从「课程」进 → 旧版静态文本。
 *
 * 这不是「两个入口」，这是**两个产品**。用户会以为平台坏了。
 *
 * 现在的做法
 * ----------
 *
 * 课程列表**直接消费中台的公开课数据**——同一份资源、同一个
 * ``react-player``、同一套时间戳气泡、同一份 AI 伴学。
 *
 * 点卡片 = 跳到 ``/hub?resource=<id>``——中台会深链到那一讲并
 * 立刻开始播放。用户从任何入口进来，得到的都是同一个闭环。
 *
 * 卡片上展示的三个数字
 * ------------------
 *
 * * **知识节点**——这条视频里埋了几个可交互的时间点。这是「互动密度」
 *   的直接度量，也是用户判断「值不值得看」的最强信号；
 * * **字幕**——有没有逐字字幕。没有字幕的视频，用户只能听，
 *   没法检索、没法引用；
 * * **时长**——投入产出比。
 *
 * 全部来自**真实数据**，没有任何占位或估算。
 */
export function StreamingCourseCard({
  resource,
  categoryTitle,
  categoryIcon,
  className = "",
}: {
  /** 中台里的一条资源。 */
  resource: GlobalHubResource;
  /** 所属学科分类的标题。 */
  categoryTitle: string;
  /** 所属分类的图标。 */
  categoryIcon?: React.ReactNode;
  className?: string;
}) {
  const durationLabel =
    typeof resource.meta?.duration_label === "string"
      ? resource.meta.duration_label
      : "";

  return (
    <Link
      href={`/hub?resource=${encodeURIComponent(resource.id)}`}
      className={cn(
        "group flex h-full flex-col rounded-xl border border-[var(--border)] bg-white p-3.5",
        "transition-[border-color,transform] hover:border-[var(--primary)]/40 hover:-translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
        className,
      )}
      data-seek-streaming-card
    >
      {/* 学科 + 时长 —— 全卡片只留这两个极简标签 */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--seek-bean-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--primary)]">
          {categoryIcon}
          <span className="truncate">{categoryTitle}</span>
        </span>
        {durationLabel ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10.5px] text-[var(--muted-foreground)]">
            <Clock size={9} strokeWidth={2.2} />
            <span className="tabular-nums">{durationLabel}</span>
          </span>
        ) : null}
      </div>

      {/* 标题 */}
      <h3 className="line-clamp-2 text-[13.5px] font-medium leading-snug text-[var(--foreground)]">
        {resource.title}
      </h3>

      {/* 简介 —— 最多两行，句子完整 */}
      {resource.academic_intro ? (
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.7] text-[var(--muted-foreground)]">
          {resource.academic_intro}
        </p>
      ) : null}

      {/* 底部：来源 + 播放提示 */}
      <div className="mt-auto flex items-center gap-1.5 pt-3 text-[10.5px] text-[var(--muted-foreground)]">
        <GraduationCap size={10} strokeWidth={2} className="shrink-0" />
        <span className="truncate">{resource.source}</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">
          <Play size={10} strokeWidth={2.6} className="ml-px" />
          立即播放
        </span>
      </div>
    </Link>
  );
}

/**
 * 一个空态占位——给「这门课还没装配好」的情况用。
 *
 * 之所以要专门做一张「还没装配好」的卡片：装配是异步的（要调大
 * 模型），采集入库和 AI 装配之间有一段时间差。没有这张卡的话，
 * 那些资源会渲染成一张**空白的、什么都没有的**卡片，看起来像坏了。
 */
export function StreamingCourseCardSkeleton() {
  return (
    <div className="h-full rounded-xl border border-dashed border-[var(--border)] p-3.5">
      <div className="mb-2 h-4 w-20 rounded bg-[var(--muted)]" />
      <div className="h-4 w-full rounded bg-[var(--muted)]" />
      <div className="mt-1.5 h-3 w-3/4 rounded bg-[var(--muted)]" />
      <div className="mt-3 flex gap-2">
        <div className="h-3 w-16 rounded bg-[var(--muted)]" />
        <div className="h-3 w-12 rounded bg-[var(--muted)]" />
      </div>
    </div>
  );
}

/**
 * 课程卡片的空态。
 */
export function StreamingCourseEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
      <GraduationCap
        size={24}
        strokeWidth={1.3}
        className="mx-auto mb-2.5 text-[var(--muted-foreground)]/50"
      />
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-[var(--muted-foreground)]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * 一张「我的笔记 / 提问」的小徽标。
 *
 * 单独抽出来是因为它要在两个地方用（卡片与列表行），而它的语义是
 * 「这个资源的互动痕迹」——跟知识节点数不一样。
 */
export function InteractionBadge({
  notes = 0,
  asks = 0,
}: {
  notes?: number;
  asks?: number;
}) {
  if (notes <= 0 && asks <= 0) return null;
  return (
    <span className="inline-flex items-center gap-2 text-[10.5px] text-[var(--muted-foreground)]">
      {notes > 0 ? (
        <span className="inline-flex items-center gap-0.5" title="带时间戳的笔记">
          <NotebookPen size={10} strokeWidth={2} />
          {notes}
        </span>
      ) : null}
      {asks > 0 ? (
        <span className="inline-flex items-center gap-0.5" title="向助教提问次数">
          <MessageSquare size={10} strokeWidth={2} />
          {asks}
        </span>
      ) : null}
    </span>
  );
}
