"use client";

import { useEffect, useMemo, useState } from "react";
import ReactPlayer from "react-player";
import {
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { resolveVideo } from "@/lib/video-source";
import type { Resource, ResourceType } from "@/lib/courses-api";
import { InteractiveVideoCanvas } from "@/components/learning/InteractiveVideoCanvas";
import { cn } from "@/lib/cn";

/**
 * 全能媒体渲染器 (Universal Media Viewer)
 * ==========================================
 *
 * 平台从「本地正文阅读器」转型为「全网开放资源连接枢纽」之后，
 * 中间栏不再渲染文字，而是渲染**外部资源**。
 *
 * 一次渲染分两层
 * --------------
 *
 * .. code-block:: text
 *
 *     ┌─ 资源切换器（横向卡片） ────────────────────┐
 *     │ [▶ 视频] [🌐 维基百科] [📄 斯坦福哲学百科]   │
 *     └─────────────────────────────────────────────┘
 *     ┌─ 白色悬浮卡片（莫兰迪冷灰 #F4F6F8 底上）──┐
 *     │   按 resource_type 分发：                 │
 *     │   video   → react-player / iframe        │
 *     │   webpage → 安全 iframe                   │
 *     │   document→ 文档查看器                    │
 *     └─────────────────────────────────────────────┘
 *
 * 外框是**统一的**：无论是播放器还是网页，都躺在一张纯白卡片里，
 * 卡片浮在莫兰迪冷灰底上——「桌面上放着白纸」的悬浮感。
 */

/** 资源类型 → 图标。 */
const KIND_ICON: Record<ResourceType, typeof PlayCircle> = {
  video: PlayCircle,
  webpage: Globe,
  document: FileText,
};

/** 资源类型 → 中文名。 */
export const KIND_LABEL: Record<ResourceType, string> = {
  video: "视频",
  webpage: "网页",
  document: "文档",
};

/**
 * 哪些站点需要 ``allow-same-origin`` 才能渲染。
 *
 * 为什么需要单独开一张表
 * ----------------------
 *
 * 被嵌入的页面如果拿不到 ``allow-same-origin``，它的 origin 就变成
 * 一个**不透明**的（opaque）origin。此时页面里的同源资源——脚本、
 * 样式、图片——都会被浏览器判为跨域并拦截。
 *
 * Wikipedia 恰好如此：它的 CSP 里没有 ``frame-ancestors`` 限制（所以
 * 允许被嵌入），但页面本身重度依赖同源脚本。结果就是——**嵌入的
 * iframe 一片空白**，而直接访问同一个 URL 完全正常。
 *
 * 这是实测出来的，不是猜的：同一页面下，``sandbox="allow-scripts"``
 * 渲染空白，加上 ``allow-same-origin`` 立刻正常。
 *
 * 安全性说明
 * ----------
 *
 * ``allow-scripts`` 与 ``allow-same-origin`` 并存确实是浏览器要防的
 * 组合——它允许被嵌入页面里的脚本移除自身的 sandbox 属性。但这里的
 * 被嵌入页面是**第三方公开站点**（Wikipedia、SEP），不是我们的页面：
 * 就算它想逃逸，也只能操作**它自己**的 origin，拿不到我们的 cookie
 * 与 DOM。
 *
 * 真正要紧的是「我们的站点绝不能出现在这个列表里」。
 */
const NEEDS_SAME_ORIGIN = [
  "wikipedia.org",
  "wikimedia.org",
  "wikisource.org",
  "wikiquote.org",
  "plato.stanford.edu",
  "archive.org",
];

/** 这个 URL 是否需要 ``allow-same-origin``。 */
function needsSameOrigin(url: string): boolean {
  const lower = (url || "").toLowerCase();
  return NEEDS_SAME_ORIGIN.some((host) => lower.includes(host));
}

/**
 * 单个资源的渲染器。
 *
 * 按 ``resource_type`` 做 switch/case 分发——这是「全能」的含义。
 */
export function ResourceRenderer({
  resource,
  courseId,
  pageId,
  className = "",
}: {
  resource: Resource;
  courseId?: string;
  pageId?: string;
  className?: string;
}) {
  const video = useMemo(
    () => (resource.resource_type === "video" ? resolveVideo({ url: resource.url, title: resource.title }) : null),
    [resource.resource_type, resource.url, resource.title],
  );

  /**
   * 外部资源的加载状态。
   *
   * 全网资源是从第三方站点拉过来的——网络慢、对方限流、CSP 拦截，
   * 都有可能。加载期间给一块骨架，而不是一片让人以为「坏了」的白。
   */
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
  }, [resource.id]);

  // ── video ───────────────────────────────────────────────────────────
  if (resource.resource_type === "video") {
    if (!video) {
      return (
        <Unavailable
          reason="这个视频链接无法识别——它可能需要登录，或者链接已经失效了。"
        />
      );
    }

    // 有交互节点 **或** 有字幕 → 走「交互式视频画布」。
    //
    // 画布在播放器之上盖了一层透明交互层，播放到某个时间戳就会浮出
    // 知识点气泡；点气泡 = 暂停 + 唤起右侧 AI。
    //
    // **只有字幕的视频也要走这条路**——气泡是「作者挑的重点」，字幕轨
    // 是「视频说的全部」。只有交互节点才进画布的话，一条没标注但有
    // 官方字幕的视频就只剩一个黑框，用户既读不到内容也问不了 AI。
    if (
      (resource.interactive_nodes ?? []).length > 0 ||
      (resource.captions ?? []).length > 0
    ) {
      return (
        <InteractiveVideoCanvas
          resource={resource}
          courseId={courseId}
          pageId={pageId}
          className={className}
        />
      );
    }

    return (
      <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg bg-black/90", className)}>
        {video.kind === "iframe" ? (
          <iframe
            src={video.embedUrl}
            title={resource.title || "外部视频"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            // 播放器要能自己写 cookie（记住播放进度），所以给
            // ``allow-same-origin``。这是**视频专用**的放宽——网页分支
            // 不给，因为它不需要。
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            referrerPolicy="no-referrer"
            onLoad={() => setLoading(false)}
            className="h-full w-full border-0"
          />
        ) : (
          <ReactPlayer
            url={video.src}
            width="100%"
            height="100%"
            controls
            playsInline
            preload="metadata"
            onReady={() => setLoading(false)}
          />
        )}
        {loading && <LoadingVeil label={resource.provider || "外部视频"} dark />}
      </div>
    );
  }

  // ── webpage ─────────────────────────────────────────────────────────
  if (resource.resource_type === "webpage") {
    if (!resource.url) {
      return <Unavailable reason="这条资源没有链接。" />;
    }
    return (
      <div className={cn("relative h-[min(72vh,720px)] w-full overflow-hidden rounded-lg bg-white", className)}>
        <iframe
          src={resource.url}
          title={resource.title || "外部网页"}
          // 安全配置。
          //
          // 默认走**严格隔离**（只给脚本，不给同源）：被嵌入的页面
          // 拿不到我们的 cookie 与 DOM。
          //
          // 例外是那些「没有同源就渲染不出来」的站点（见
          // ``NEEDS_SAME_ORIGIN``）——Wikipedia 在严格隔离下是一片
          // 空白，这是实测过的。
          sandbox={
            needsSameOrigin(resource.url)
              ? "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              : "allow-scripts allow-popups allow-popups-to-escape-sandbox"
          }
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setLoading(false)}
          className="h-full w-full border-0"
        />
        {loading && <LoadingVeil label={resource.provider || "外部网页"} />}
      </div>
    );
  }

  // ── document ────────────────────────────────────────────────────────
  if (resource.resource_type === "document") {
    if (!resource.url) {
      return <Unavailable reason="这份文档没有链接。" />;
    }
    const isPdf = /\.pdf(?:$|\?)/i.test(resource.url);
    return (
      <div className={cn("space-y-2.5", className)}>
        {isPdf ? (
          <div className="h-[min(72vh,720px)] w-full overflow-hidden rounded-lg bg-white">
            <iframe
              src={resource.url}
              title={resource.title || "外部文档"}
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          <DocumentPlaceholder
            title={resource.title}
            url={resource.url}
            provider={resource.provider}
          />
        )}
      </div>
    );
  }

  return <Unavailable reason="暂不支持的资源类型。" />;
}

/** 文档（非 PDF）的降级展示——给出直达链接，而不是塞一个空框。 */
function DocumentPlaceholder({
  title,
  url,
  provider,
}: {
  title: string;
  url: string;
  provider?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-[var(--muted)]/40 px-6 py-12 text-center">
      <BookOpen size={22} strokeWidth={1.6} className="text-[var(--muted-foreground)]" />
      <div>
        <p className="text-[13px] font-medium">{title || "外部文档"}</p>
        {provider && (
          <p className="mt-0.5 text-[11.5px] text-[var(--muted-foreground)]">
            {provider}
          </p>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--muted)]"
      >
        <ExternalLink size={12} strokeWidth={1.8} />
        在新标签页打开
      </a>
    </div>
  );
}

/**
 * 加载遮罩。
 *
 * 外部资源从第三方站点拉过来，可能慢。加载期间给一块带呼吸感的
 * 提示，而不是一片空白——空白会让用户以为资源挂了。
 */
function LoadingVeil({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-2",
        dark ? "bg-black/85" : "bg-[var(--card)]",
      )}
    >
      <Loader2
        size={16}
        strokeWidth={1.8}
        className={cn(
          "animate-spin",
          dark ? "text-white/70" : "text-[var(--muted-foreground)]",
        )}
      />
      <p
        className={cn(
          "text-[11.5px]",
          dark ? "text-white/55" : "text-[var(--muted-foreground)]",
        )}
      >
        正在载入 {label}…
      </p>
    </div>
  );
}

/** 资源不可用时的提示。 */
function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg bg-[var(--muted)]/50 px-4 py-8 text-center text-[12.5px] text-[var(--muted-foreground)]">
      {reason}
    </div>
  );
}

/**
 * 资源切换器 + 当前资源渲染器。
 *
 * 这是中间栏在「资源枢纽型」课程里挂载的东西。
 *
 * ``onResourceChange`` 在用户切换资源时触发——上层用它把资源元数据
 * 同步给右侧的 AI（见 ``Resource-Aware AI Context``）。
 *
 * 资源级完成状态
 * --------------
 *
 * ``resourceProgress`` 来自后端的资源级学情。每条资源单独记账——
 * 一个节点下面挂着三条外链，用户可能只看了其中一条，所以「这个节点
 * 学过了」是误导。
 *
 * 切换器上的小圆点就是这条资源的状态：实心 = 已看，空心 = 还没看。
 */
export function UniversalMediaViewer({
  resources,
  activeResourceId,
  onResourceChange,
  resourceProgress = [],
  onMarkDone,
  courseId,
  pageId,
  className = "",
}: {
  resources: Resource[];
  activeResourceId?: string | null;
  onResourceChange?: (resource: Resource) => void;
  /** 每条资源的学习状态（来自后端资源级学情）。 */
  resourceProgress?: Array<{
    resource_id: string;
    seen: boolean;
    marked_done: boolean;
    dwell_seconds: number;
  }>;
  /** 用户显式标记「看完了」的回调。 */
  onMarkDone?: (resource: Resource) => void;
  courseId?: string;
  pageId?: string;
  className?: string;
}) {
  if (resources.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--card)] px-4 py-10 text-center text-[13px] text-[var(--muted-foreground)] shadow-[var(--seek-shadow-paper)]">
        这一讲还没有配套的参考资源。
      </div>
    );
  }

  const active =
    resources.find((item) => item.id === activeResourceId) ??
    resources.find((item) => item.is_default) ??
    resources[0];

  /** 资源 id → 学习状态。 */
  const progressById = useMemo(() => {
    const map = new Map<string, { seen: boolean; marked: boolean }>();
    for (const item of resourceProgress) {
      map.set(item.resource_id, {
        seen: Boolean(item.seen),
        marked: Boolean(item.marked_done),
      });
    }
    return map;
  }, [resourceProgress]);

  const activeProgress = progressById.get(active.id);
  const activeSeen = activeProgress?.seen ?? false;
  const activeMarked = activeProgress?.marked ?? false;

  /** 这门课里有几条资源已经看过——给用户一个整体感。 */
  const seenCount = resources.filter(
    (item) => progressById.get(item.id)?.seen,
  ).length;

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── 源切换胶囊 ──
       *
       * 之前是一排「卡片式」按钮，每个都带图标 + 标题 + 类型标签
       * （"What Is Opportunity Cost?（什么是机会成本？）" + "视频"），
       * 一条就占掉大半行。而视频卡片上方又重复了一遍同样的标题——
       * **同一个标题在屏幕上出现了两次**。
       *
       * 现在：源切换收成一行紧凑胶囊，标题只在这里出现一次，
       * 视频卡片上方不再重复。
       */}
      {resources.length > 1 && (
        <div
          role="tablist"
          aria-label="外部资源"
          className="flex flex-wrap items-center gap-1.5"
        >
          {resources.map((resource) => {
            const Icon = KIND_ICON[resource.resource_type] ?? Globe;
            const isActive = resource.id === active.id;
            const state = progressById.get(resource.id);
            return (
              <button
                key={resource.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onResourceChange?.(resource)}
                title={resource.title || KIND_LABEL[resource.resource_type]}
                className={cn(
                  "seek-key-sm inline-flex max-w-[280px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]",
                  isActive
                    ? "bg-[var(--seek-bean-soft)] text-[var(--seek-plum)]"
                    : "bg-[var(--seek-cool)] text-[var(--seek-muted-foreground)] hover:bg-[var(--seek-cool)]/70",
                )}
              >
                <Icon
                  size={12}
                  strokeWidth={2.1}
                  className="shrink-0"
                />
                {/* 完成状态点：实心 = 已看，空心 = 还没看。 */}
                <span
                  aria-hidden
                  title={state?.seen ? "已看" : "还没看"}
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    state?.seen
                      ? "bg-[var(--seek-plum)]"
                      : "bg-[var(--seek-plum)]/25",
                  )}
                />
                <span className="truncate">{resource.title || KIND_LABEL[resource.resource_type]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── 白色悬浮卡片 ── */}
      <div className="rounded-xl border border-[var(--seek-divider-cool)] bg-[var(--card)] p-3.5 shadow-[var(--seek-shadow-paper)]">
        <div className="mb-2.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* 类型与来源——只有它们在这里，视频标题已经在上面的
                胶囊栏出现过了，不再重复。 */}
            <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-normal text-[var(--muted-foreground)]">
              <span className="rounded-full bg-[var(--seek-cool)] px-1.5 py-px font-medium text-[var(--seek-plum)]">
                {KIND_LABEL[active.resource_type]}
              </span>
              {active.provider && <span>{active.provider}</span>}
              {resources.length > 1 && (
                <span className="tabular-nums">
                  已看 {seenCount}/{resources.length}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* 「看完了」——纯图标 [✓]，悬停提示说明。 */}
            {onMarkDone && (
              <button
                type="button"
                onClick={() => onMarkDone(active)}
                disabled={activeMarked}
                title={activeMarked ? "已标记完成" : "标记为已看完"}
                aria-label={activeMarked ? "已标记完成" : "标记为已看完"}
                className={cn(
                  "seek-key-sm inline-flex h-7 w-7 items-center justify-center rounded-md",
                  activeMarked
                    ? "bg-[var(--seek-bean-soft)] text-[var(--seek-plum)]"
                    : "bg-[var(--seek-cool)] text-[var(--seek-plum)] hover:bg-[var(--seek-cool)]/70",
                )}
              >
                <Check size={13} strokeWidth={2.8} />
              </button>
            )}
            {/* 「打开」——纯图标 [↗]，在新标签页打开原视频。 */}
            <a
              href={active.url}
              target="_blank"
              rel="noreferrer noopener"
              title="在新标签页打开"
              aria-label="在新标签页打开"
              className="seek-key-sm inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--seek-cool)] text-[var(--seek-plum)] hover:bg-[var(--seek-cool)]/70"
            >
              <ExternalLink size={13} strokeWidth={2.2} />
            </a>
          </div>
        </div>

        <ResourceRenderer
          resource={active}
          courseId={courseId}
          pageId={pageId}
        />
      </div>
    </div>
  );
}
