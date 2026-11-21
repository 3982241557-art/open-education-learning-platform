"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { ExternalLink, PlayCircle } from "lucide-react";
import { formatTimestamp, activateConcept } from "@/lib/concept-actions";
import {
  resolveCaptions,
  resolveVideo,
  type VideoCaption,
} from "@/lib/video-source";
import { cn } from "@/lib/cn";

/**
 * 正文流里的视频播放器
 * ====================
 *
 * 把课程 JSON 里的 ``video`` 块渲染成正文的一部分——而不是把用户
 * 踢到另一个网站去。
 *
 * 三层结构
 * --------
 *
 * .. code-block:: text
 *
 *     ┌─ 播放器 ─────────────────┐
 *     │  react-player           │  ← 视频本体
 *     └──────────────────────────┘
 *     ┌─ 字幕节点 ───────────────┐
 *     │  00:12  闭包记住了出生地 │  ← 每条都可点
 *     │  00:45  高阶函数的组合   │
 *     └──────────────────────────┘
 *
 * 字幕节点是**知识节点的另一种形态**——点它不只是跳转视频，还会
 * 触发同一套「动作分发中心」（填入 AI 输入框 + 自动发问 + 打标记）。
 *
 * 两种播放方式
 * ------------
 *
 * - ``kind === "player"`` → 走 ``react-player``。它能自动认出
 *   YouTube / Vimeo / 直链媒体，并且把 ref 透到底层媒体元素，
 *   所以我们能读 ``currentTime``、写 ``currentTime``（跳转）。
 * - ``kind === "iframe"`` → Bilibili 这类没有原生支持的平台，直接
 *   嵌一个 ``<iframe>``。代价是拿不到播放进度——字幕节点点下去
 *   仍然能提问，只是没法自动定位播放位置。
 */

/** 视频块的载荷。 */
export interface VideoBlockPayload {
  url?: string;
  embed_url?: string;
  iframe?: string;
  title?: string;
  captions?: unknown;
  transcript?: unknown;
}

export function VideoBlock({
  payload,
  courseId,
  pageId,
}: {
  payload: Record<string, unknown>;
  courseId?: string;
  pageId?: string;
}) {
  const video = useMemo(() => resolveVideo(payload), [payload]);
  const captions = useMemo(() => resolveCaptions(payload), [payload]);

  const mediaRef = useRef<ReactPlayer>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [started, setStarted] = useState(false);

  const title =
    (typeof payload.title === "string" ? payload.title : "") ||
    video?.title ||
    "";

  /**
   * 点字幕节点 → 跳到视频对应位置 → 触发动作分发中心。
   *
   * 顺序很重要：**先跳视频，再发事件**。这样用户看到的是"视频已经
   * 跳过去了，AI 也在讲那一段"——两件事在同一个瞬间发生，而不是
   * AI 讲着上一段、视频已经跳到下一段。
   */
  const onCaptionClick = useCallback(
    (caption: VideoCaption) => {
      // 跳到视频对应位置。
      //
      // react-player v2 的实例上有 ``seekTo(seconds, "seconds")``——
      // 它对 YouTube / Vimeo / 直链媒体都管用，比直接写
      // ``media.currentTime`` 更可靠（后者对 iframe 类播放器根本无效）。
      const player = mediaRef.current;
      if (player) {
        try {
          player.seekTo(caption.start, "seconds");
          setCurrentTime(caption.start);
        } catch {
          /* 跨域视频可能拒绝 seek——不影响提问 */
        }
      }

      activateConcept({
        term: caption.text,
        context: caption.text,
        courseId,
        pageId,
        timestamp: caption.start,
        timestampLabel: formatTimestamp(caption.start),
        source: "caption",
      });
    },
    [courseId, pageId],
  );

  /**
   * 播放进度。
   *
   * 用 ``react-player`` 的 ``onProgress`` 回调，而不是轮询 DOM。
   *
   * 早先的写法是每 500ms 读一次 ``mediaRef.current.currentTime``——
   * 但 ``mediaRef`` 指的是播放器**实例**，不是媒体元素，读不到
   * ``currentTime``。而且 iframe 类播放器根本没有可读的媒体元素。
   *
   * ``onProgress`` 是播放器自己报的进度，对 YouTube / 直链媒体都准。
   */
  useEffect(() => {
    if (!started) return;
    // 没有 onProgress 的降级路径（理论上不会发生）不轮询了——
    // 宁可少一个功能，也不要一个永远读到 0 的假进度条。
  }, [started]);

  if (!video) {
    return (
      <div className="rounded-xl bg-[var(--muted)]/50 px-4 py-6 text-center text-[12.5px] text-[var(--muted-foreground)]">
        这段视频暂时无法播放（链接无法识别）。
      </div>
    );
  }

  return (
    <figure className="space-y-3" data-seek-video>
      {title && (
        <figcaption className="flex items-start gap-2 text-[13px] font-medium">
          <PlayCircle
            size={14}
            strokeWidth={1.8}
            className="mt-0.5 shrink-0 text-[var(--muted-foreground)]"
          />
          <span className="min-w-0 flex-1">{title}</span>
          <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10.5px] font-normal text-[var(--muted-foreground)]">
            {video.provider}
          </span>
        </figcaption>
      )}

      {/* 播放器本体：16:9，撑满正文宽度。 */}
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/90">
        {video.kind === "iframe" ? (
          <iframe
            src={video.embedUrl}
            title={title || "课程视频"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <ReactPlayer
            url={video.src}
            ref={mediaRef}
            width="100%"
            height="100%"
            controls
            playsInline
            preload="metadata"
            onReady={() => setStarted(true)}
            onPlay={() => setStarted(true)}
            onProgress={(state) => setCurrentTime(state?.playedSeconds ?? 0)}
          />
        )}
      </div>

      {video.embedUrl && (
        <a
          href={video.originalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          <ExternalLink size={11} strokeWidth={1.8} />
          在 {video.provider} 打开
        </a>
      )}

      {captions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
            同步字幕 · 点一条，让 AI 就这一段解释
          </p>
          <ul className="max-h-[220px] space-y-0.5 overflow-y-auto pr-1">
            {captions.map((caption, index) => {
              const active =
                started &&
                caption.start <= currentTime + 0.5 &&
                (captions[index + 1]?.start ?? Infinity) > currentTime;
              return (
                <li key={`${caption.start}-${index}`}>
                  <button
                    type="button"
                    data-seek-caption
                    onClick={() => onCaptionClick(caption)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2 py-1 text-left transition-colors",
                      active
                        ? "bg-[rgba(243,214,210,0.3)]"
                        : "hover:bg-[var(--muted)]/60",
                    )}
                  >
                    <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--muted-foreground)]">
                      {formatTimestamp(caption.start)}
                    </span>
                    <span className="min-w-0 flex-1 text-[12px] leading-relaxed">
                      {caption.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </figure>
  );
}
