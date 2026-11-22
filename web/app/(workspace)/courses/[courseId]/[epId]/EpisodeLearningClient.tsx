"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { loadCourseBundle, type CourseBundle } from "@/lib/course-bundle";
import {
  deriveEpisodeStatus,
  filterNodesForEpisode,
  filterSegmentsForEpisode,
  formatEpisodeDuration,
  resolveEpisodePlayback,
} from "@/lib/episodes";
import {
  markEpisodeCompleted,
  readEpisodeRecords,
  saveEpisodeProgress,
  type EpisodeRecord,
} from "@/lib/episode-records";
import {
  hasDiagnostic,
  MASTERY_LABEL,
  readDiagnostic,
  type DiagnosticRecord,
} from "@/lib/diagnostic-profile";
import { analyzeLessonTitle } from "@/lib/lesson-analyzer";
import { EpisodeDiagnosticModal } from "@/components/learning/EpisodeDiagnosticModal";
import { EpisodeCompletionModal } from "@/components/learning/EpisodeCompletionModal";
import { BottomAuxPanel } from "@/components/learning/BottomAuxPanel";
import { InteractiveVideoCanvas } from "@/components/learning/InteractiveVideoCanvas";
import { MainAiPanel } from "@/components/ai/MainAiPanel";
import { MacroAdvisor } from "@/components/ai/MacroAdvisor";
import { NodePath } from "@/components/learning/AdaptiveStage";
import { ReaderProvider, useReader } from "@/context/ReaderContext";
import { useChat } from "@/context/ChatContext";
import { emitLearningEvent, RESOURCE_ACTIVATED } from "@/lib/learning-events";
import { cn } from "@/lib/cn";

/**
 * 第二层 · 单集沉浸学习页
 * =========================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────────────┐
 *     │ ← 返回课程目录   第 3 讲 · Lecture 2 - Arrays  │
 *     ├──────────────────────────┬─────────────────────┤
 *     │                          │                     │
 *     │      视频播放器           │     AI 助教         │
 *     │                          │  [已适配：基础夯实]  │
 *     │      [学完本集 · 进入检测] │                     │
 *     ├──────────────────────────┴─────────────────────┤
 *     │  ▸ 知识节点 (6)  ▸ 段落导读 (5)  ▸ 完整字幕 (128) │
 *     │  ──────────────────────────────────────────  │
 *     │  （默认全部折叠，点击才展开）                    │
 *     └────────────────────────────────────────────────┘
 *
 * 极致减字
 * --------
 *
 * 这一页**没有**：课程长简介、专题栏、宣传文案、分类说明卡片。
 * 那些属于第一层（``/courses/[id]``）。两层不重复堆砌。
 *
 * 底部辅助区默认 **100% 折叠**——只展示一行干净的标签栏，用户主动
 * 点击才展开。这是「防止分心」的具体落点。
 */
export default function EpisodeLearningClient({
  params,
}: {
  params: Promise<{ courseId: string; epId: string }>;
}) {
  const { courseId, epId } = use(params);
  return (
    <ReaderProvider courseId={courseId}>
      <EpisodeLearning courseId={courseId} epId={epId} />
    </ReaderProvider>
  );
}

/** 单集学习页本体。 */
function EpisodeLearning({
  courseId,
  epId,
}: {
  courseId: string;
  epId: string;
}) {
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<Record<string, EpisodeRecord>>({});

  /** 诊断卡是否打开。 */
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  /** 学完闭环是否打开。 */
  const [completionOpen, setCompletionOpen] = useState(false);
  /** 诊断是否已做过。 */
  const [diagnosed, setDiagnosed] = useState(false);
  /** 本集诊断记录（来自 localStorage）。 */
  const [diagnosticRecord, setDiagnosticRecord] =
    useState<DiagnosticRecord | null>(null);

  const { setContext, setLearnerProfile } = useChat();
  const { upsertNote } = useReader();
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadCourseBundle(courseId);
      setBundle(result);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 本集。 */
  const episode = useMemo(
    () => bundle?.episodes.find((item) => item.ep_id === epId) ?? null,
    [bundle, epId],
  );

  /** 本集在系列里的位置。 */
  const position = useMemo(() => {
    const episodes = bundle?.episodes ?? [];
    const index = episodes.findIndex((item) => item.ep_id === epId);
    return {
      index,
      previous: index > 0 ? episodes[index - 1] : null,
      next: index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : null,
      isLast: index >= 0 && index === episodes.length - 1,
      total: episodes.length,
    };
  }, [bundle, epId]);

  /**
   * 读取观看记录 + 诊断状态。
   *
   * ⚠️ 诊断记录**必须走 state**，不能在 render 里直接读
   * ``localStorage``——SSR 时读到 ``undefined``，客户端 hydrate 时
   * 可能读到一条记录，两边渲染结果不一致就会触发 hydration mismatch。
   */
  useEffect(() => {
    const refresh = () => {
      setRecords(readEpisodeRecords(courseId));
      const record = readDiagnostic(courseId, epId);
      setDiagnosticRecord(record ?? null);
      setDiagnosed(Boolean(record));
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [courseId, epId, bundle]);

  /**
   * 首次进入本集 → **自动弹出诊断卡**。
   *
   * 条件：① 本集存在；② 本集还没诊断过。
   *
   * 「跳过」也算诊断过——用户明确说了「按默认难度开始」，不该再弹。
   */
  useEffect(() => {
    if (!episode) return;
    if (hasDiagnostic(courseId, epId)) return;
    setDiagnosticOpen(true);
  }, [episode, courseId, epId]);

  /**
   * 诊断完成后，把画像写进全局对话上下文。
   *
   * 之后用户提问时，它会被**静默**拼进 system prompt。
   */
  useEffect(() => {
    if (!episode) return;
    const record = diagnosticRecord;
    if (!record) {
      setLearnerProfile(null);
      return;
    }
    setLearnerProfile({
      resourceId: courseId,
      courseTitle: bundle?.title ?? record.courseTitle,
      epId,
      episodeTitle: episode.title,
      episodeIndex: episode.index,
    });
    return () => setLearnerProfile(null);
  }, [bundle, courseId, epId, episode, diagnosticRecord, setLearnerProfile]);

  /**
   * 设置助教的会话上下文。
   *
   * ``courseId`` 用**课程 id**——这样同一门课的所有集共用一个会话，
   * 用户在第 3 讲问的问题，在第 4 讲还能接上。
   */
  useEffect(() => {
    if (!bundle || !episode) return;
    setContext({
      courseId,
      courseTitle: bundle.title,
      pageId: epId,
      pageTitle: episode.title,
    });
  }, [bundle, episode, courseId, epId, setContext]);

  /**
   * 广播「当前资源已激活」——右侧助教据此拿到预置摘要与导读。
   */
  useEffect(() => {
    if (!bundle || !episode) return;
    const resource = bundle.resource;
    const detail = {
      resourceId: resource.id,
      title: episode.title,
      resourceType: resource.resource_type,
      url: episode.video_url || resource.url,
      provider: resource.provider,
      aiContext: resource.ai_context,
      studyGuide: resource.study_guide ?? null,
      guidedSegments: resource.guided_segments ?? [],
      interactiveNodes: resource.interactive_nodes ?? [],
      courseId,
      pageId: epId,
    };
    window.dispatchEvent(new CustomEvent(RESOURCE_ACTIVATED, { detail }));
  }, [bundle, episode, courseId, epId]);

  /**
   * 助教顶部的「重测」徽标 → 重新打开诊断卡。
   *
   * 徽标在 ``MainAiPanel`` 里（它属于助教的视觉区域），但诊断卡
   * 属于这一页——两边靠一条自定义事件联动。
   */
  useEffect(() => {
    const handler = () => setDiagnosticOpen(true);
    window.addEventListener("seek:retest-diagnostic", handler);
    return () => window.removeEventListener("seek:retest-diagnostic", handler);
  }, []);

  /** 播放参数。 */
  const playback = useMemo(
    () =>
      episode
        ? resolveEpisodePlayback(episode, {
            url: bundle?.resource.url ?? "",
          })
        : null,
    [episode, bundle],
  );

  /**
   * 记录播放进度。
   *
   * 每 5 秒记一次——比 ``reportWatch`` 的 15 秒更密，因为**按集**
   * 记账需要更细的粒度：用户切到别的集再回来时，要能精确接上。
   */
  useEffect(() => {
    if (!episode || !playback) return;
    const timer = window.setInterval(() => {
      const record = readEpisodeRecords(courseId)[epId];
      if (!record) return;
      saveEpisodeProgress(courseId, epId, record.position, record.duration);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [courseId, epId, episode, playback]);

  /** 本集状态。 */
  const status = useMemo(
    () => deriveEpisodeStatus(records[epId]),
    [records, epId],
  );

  /** 总体进度。 */
  const courseProgress = useMemo(() => {
    const episodes = bundle?.episodes ?? [];
    const done = episodes.filter(
      (item) => deriveEpisodeStatus(records[item.ep_id]) === "已完成",
    ).length;
    return {
      done,
      total: episodes.length,
      percent: episodes.length ? Math.round((done / episodes.length) * 100) : 0,
    };
  }, [bundle, records]);

  /**
   * 本集专属的知识节点与段落导读。
   *
   * 一条长视频切成多集之后，资源上的节点是**整条视频**的。直接全量
   * 渲染会让用户在第 3 讲看到第 11 讲的知识点——所以要按本集的时间
   * 区间过滤。
   *
   * ⚠️ 这些 hook **必须**留在所有 early return 之前——SSR 渲染的是
   * 「载入中」分支（hook 少），客户端拿到数据后渲染完整分支（hook 多），
   * 数量对不上 React 就会抛 "Rendered more hooks than during the previous render"。
   */
  const episodeNodes = useMemo(
    () => filterNodesForEpisode(bundle?.interactiveNodes ?? [], episode),
    [bundle, episode],
  );
  const episodeSegments = useMemo(
    () => filterSegmentsForEpisode(bundle?.guidedSegments ?? [], episode),
    [bundle, episode],
  );

  /** 本课的知识要点——从课时标题解析出来的。 */
  const lessonAnalysis = useMemo(
    () => analyzeLessonTitle(episode?.title ?? ""),
    [episode?.title],
  );

  /** 字幕轨。 */
  const captions = bundle?.resource.captions ?? [];

  /** 学段——决定整套页面的动效语言。 */
  const stage = bundle?.stage ?? "junior";
  const playful = stage === "primary";

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          正在载入这一讲…
        </p>
      </div>
    );
  }

  if (!bundle || !episode || !playback) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
        <p className="text-[14px] font-medium text-[var(--foreground)]">
          找不到这一讲
        </p>
        <Link
          href={`/courses/${encodeURIComponent(courseId)}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          返回课程目录
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* ── 顶栏：只有「返回 + 集标题」 ──
       *
       * 刻意不放课程长简介、专题标签、分类说明——那是第一层的事。
       */}
      <header className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/courses/${encodeURIComponent(courseId)}`}
            title="返回课程目录"
            aria-label="返回课程目录"
            className="seek-key inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                第 {episode.index} / {episode.total} 讲
              </span>
              <h1 className="truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--foreground)]">
                {episode.title}
              </h1>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
              {bundle.title}
              {playback.duration > 0
                ? ` · ${formatEpisodeDuration(playback.duration)}`
                : ""}
            </p>
          </div>

          {/* 课程总进度——极简。 */}
          <span className="shrink-0 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[var(--primary)]">
            {courseProgress.done} / {courseProgress.total} 讲
          </span>

          {/* 「重测」——只在本集诊断过之后出现。 */}
          {diagnosed ? (
            <button
              type="button"
              onClick={() => setDiagnosticOpen(true)}
              title="重新诊断本集"
              className="seek-key inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[var(--card)] px-2.5 text-[11.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <RotateCcw size={12} strokeWidth={2.2} />
              重测
            </button>
          ) : null}
        </div>
      </header>

      {/* ── 主体：主舞台 | AI 助教 ── */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,30%)]">
        <main className="min-h-0 overflow-y-auto bg-[var(--seek-cool)] px-4 py-4 lg:px-6">
          <div className="mx-auto max-w-[960px] space-y-3">
            {/* 播放器。 */}
            <div
              className={cn(
                "border border-[var(--border)] bg-white p-3.5",
                playful ? "rounded-2xl" : "rounded-xl",
              )}
            >
              <InteractiveVideoCanvas
                resource={{
                  id: bundle.resource.id,
                  resource_type: bundle.resource.resource_type,
                  title: episode.title,
                  url: episode.video_url || bundle.resource.url,
                  fallback_url: bundle.resource.fallback_url,
                  ai_context: bundle.resource.ai_context,
                  provider: bundle.resource.provider,
                  meta: bundle.resource.meta,
                  captions: bundle.resource.captions,
                  interactive_nodes: episodeNodes,
                  guided_segments: episodeSegments,
                  is_default: bundle.resource.is_default,
                }}
                courseId={courseId}
                pageId={epId}
                episodeStart={playback.startAt}
                episodeEnd={playback.endAt}
                onProgressChange={(position, duration) => {
                  saveEpisodeProgress(courseId, epId, position, duration);
                }}
                onEnded={() => {
                  markEpisodeCompleted(courseId, epId, playback.duration);
                  setCompletionOpen(true);
                }}
              />

              {/* ── 学完入口 ──
               *
               * 视频下方唯一的显式动作。它同时是「本集播到接近尾声」
               * 时的触发点，以及「我想现在就检测」的入口。
               */}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <span className="text-[11.5px] text-[var(--muted-foreground)]">
                  {status === "已完成"
                    ? "本集已完成"
                    : status === "学习中"
                      ? "学习中"
                      : "还没开始"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    markEpisodeCompleted(courseId, epId, playback.duration);
                    setCompletionOpen(true);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90",
                    playful ? "rounded-full" : "rounded-lg",
                    "bg-[var(--primary)]",
                  )}
                >
                  学完本集 · 进入检测
                  <ChevronRight size={12} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            {/* ── 底部辅助区（默认 100% 折叠）──
             *
             * 三栏：知识节点 / 段落导读 / 完整字幕。刚进入页面时**全部
             * 收起**，只留一行触发条。
             */}
            <BottomAuxPanel
              playful={playful}
              sections={[
                {
                  id: "nodes",
                  title: "知识节点",
                  count: episodeNodes.length || lessonAnalysis.keywords.length,
                  content: (
                    <NodeKnowledgeList
                      nodes={episodeNodes}
                      keywords={lessonAnalysis.keywords}
                      playful={playful}
                    />
                  ),
                },
                {
                  id: "segments",
                  title: "段落导读",
                  count: episodeSegments.length,
                  content: (
                    <SegmentList segments={episodeSegments} />
                  ),
                },
                {
                  id: "captions",
                  title: "完整字幕",
                  count: captions.length,
                  content: <CaptionList captions={captions} />,
                },
              ]}
            />

            {/* ── 上下集导航 ──
             *
             * 极简的一行。它不重复目录页的信息（那些在第一层），
             * 只是给「连续学习」一个最短路径。
             */}
            <div className="flex items-center justify-between gap-3">
              {position.previous ? (
                <Link
                  href={`/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(position.previous.ep_id)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  <ArrowLeft size={12} strokeWidth={2.4} />
                  上一讲 · {position.previous.title}
                </Link>
              ) : (
                <span />
              )}
              {position.next ? (
                <Link
                  href={`/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(position.next.ep_id)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  下一讲 · {position.next.title}
                  <ChevronRight size={12} strokeWidth={2.4} />
                </Link>
              ) : (
                <span />
              )}
            </div>
          </div>
        </main>

        {/* ── AI 助教 ── */}
        <aside className="flex min-h-0 flex-col gap-2.5 bg-[var(--seek-warm)] p-2.5">
          <MacroAdvisor
            courseId={courseId}
            pageId={epId}
            guide={bundle.resource.study_guide}
            className="shrink-0"
          />
          <MainAiPanel
            courseId={courseId}
            courseTitle={bundle.title}
            pageId={epId}
            pageTitle={episode.title}
            masteryLabel={
              diagnosticRecord
                ? MASTERY_LABEL[diagnosticRecord.mastery]
                : undefined
            }
            className="min-h-0 flex-1"
          />
        </aside>
      </div>

      {/* ── 进课诊断卡 ── */}
      <EpisodeDiagnosticModal
        open={diagnosticOpen}
        onClose={() => {
          setDiagnosticOpen(false);
          setDiagnosed(true);
        }}
        resourceId={courseId}
        courseTitle={bundle.title}
        episode={episode}
        stage={stage}
        subject={bundle.subject ?? "math"}
        nodes={episodeNodes}
        segments={episodeSegments}
      />

      {/* ── 学完闭环 ── */}
      <EpisodeCompletionModal
        open={completionOpen}
        onClose={() => setCompletionOpen(false)}
        resourceId={courseId}
        courseTitle={bundle.title}
        episode={episode}
        allEpisodes={bundle.episodes}
        nodes={episodeNodes}
        segments={episodeSegments}
        stage={stage}
        subject={bundle.subject ?? "math"}
        onSaveNote={(text) => {
          void upsertNote({
            page_id: epId,
            quote: "",
            note: text,
          });
        }}
        onContinue={() => {
          setCompletionOpen(false);
          if (position.next) {
            router.push(
              `/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(position.next.ep_id)}`,
            );
            return;
          }
          // 最后一讲 → 回课程目录（那里可以领结业证书）。
          router.push(`/courses/${encodeURIComponent(courseId)}`);
        }}
      />
    </div>
  );
}

/** 知识节点列表。 */
function NodeKnowledgeList({
  nodes,
  keywords,
  playful,
}: {
  nodes: Array<{ timestamp: number; keyword: string; hint?: string; context?: string }>;
  keywords: string[];
  playful: boolean;
}) {
  // 有真实节点就用真实的；否则用**从课时标题解析出来的**知识点。
  const items =
    nodes.length > 0
      ? nodes.map((node) => ({
          title: node.keyword,
          body: node.hint || node.context || "",
        }))
      : keywords.map((keyword) => ({
          title: keyword,
          body: "本讲围绕这一核心概念展开——先把它解决什么问题说清楚，再谈具体做法。",
        }));

  if (items.length === 0) {
    return (
      <p className="py-3 text-center text-[12px] text-[var(--muted-foreground)]">
        这一讲还没有知识节点。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item.title}-${index}`}
          className={cn(
            "border border-[var(--border)] bg-[var(--background)] px-3 py-2.5",
            playful ? "rounded-2xl" : "rounded-lg",
          )}
        >
          <p className="text-[12.5px] font-medium text-[var(--foreground)]">
            {item.title}
          </p>
          {item.body ? (
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
              {item.body.length > 180
                ? `${item.body.slice(0, 178)}…`
                : item.body}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** 段落导读列表。 */
function SegmentList({
  segments,
}: {
  segments: Array<{ timestamp: number; title: string; content: string }>;
}) {
  if (segments.length === 0) {
    return (
      <p className="py-3 text-center text-[12px] text-[var(--muted-foreground)]">
        这一讲还没有段落导读。
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {segments.map((segment, index) => (
        <li
          key={`${segment.timestamp}-${index}`}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5"
        >
          <p className="text-[12.5px] font-medium text-[var(--foreground)]">
            {segment.title}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
            {segment.content}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** 字幕列表。 */
function CaptionList({
  captions,
}: {
  captions: Array<{ start: number; text: string }>;
}) {
  if (captions.length === 0) {
    return (
      <p className="py-3 text-center text-[12px] text-[var(--muted-foreground)]">
        这一讲还没有字幕。
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {captions.map((caption, index) => (
        <li key={`${caption.start}-${index}`} className="flex gap-2.5">
          <span className="shrink-0 pt-px text-[11px] tabular-nums text-[var(--muted-foreground)]">
            {formatClock(caption.start)}
          </span>
          <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--foreground)]">
            {caption.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 秒 → ``HH:MM:SS``。 */
function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
