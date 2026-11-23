"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Star,
} from "lucide-react";
import { loadCourseBundle, type CourseBundle } from "@/lib/course-bundle";
import { formatEpisodeDuration } from "@/lib/episodes";
import {
  markEpisodeCompleted,
  readEpisodeRecords,
  saveEpisodeProgress,
  type EpisodeRecord,
} from "@/lib/episode-records";
import { InteractiveVideoCanvas } from "@/components/learning/InteractiveVideoCanvas";
import K12InteractiveLab from "@/components/interactive/K12InteractiveLab";
import ConsolidationCard from "@/components/learning/ConsolidationCard";
import KhanmigoCopilot from "@/components/ai/KhanmigoCopilot";
import { StarRow } from "@/components/k12/K12HallPage";
import { ReaderProvider } from "@/context/ReaderContext";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/cn";
import { useLocale } from "@/context/LocaleContext";
import {
  LAB_CONTEXT_EVENT,
  type LabContextDetail,
} from "@/lib/lab-context";
import {
  awardStar,
  readLessonStars,
  type LessonStarRecord,
} from "@/lib/star-ledger";

/**
 * 单集沉浸学习页
 * ===============
 *
 * .. code-block:: text
 *
 *     ┌───────────────────────────────────────────────────────┐
 *     │ ← 返回星轨地图  本课标题   ★☆☆   [▶ 观看 3 分钟短片] │
 *     ├──────────────────────────────────┬────────────────────┤
 *     │                                  │                    │
 *     │   左侧 68% · PhET 级交互实验台     │  右侧 32% ·        │
 *     │   （折叠短片 → 教具主舞台）        │  Khanmigo 启发伴学  │
 *     │                                  │                    │
 *     ├──────────────────────────────────┴────────────────────┤
 *     │  [完成探究 · 进入本课巩固]  2–3 道实心高对比巩固题     │
 *     └───────────────────────────────────────────────────────┘
 *
 * 与旧架构的三个根本区别
 * ----------------------
 *
 * 1. **教具是主角，视频是配角**。短片默认**收起**——学生一进来就
 *    直��互动教具，而不是先看一段冗长录播。
 * 2. **三颗星实时可见**。顶栏永远显示本课的三颗掌握度星星，随时知道
 *    「我还差哪一步」。
 * 3. **伴学是副驾驶，不是聊天框**。它**实时感应**左侧教具动作，
 *    自动给出苏格拉底式追问——但**绝不直接给答案**。
 *
 * ⛔ **彻底删除**
 *
 * - 课前诊断弹窗（``EpisodeDiagnosticModal``）——测应该在学完之后，
 *   依据是**真实作答**，不是进课时替用户编造的自我认知；
 * - 知识节点列表 + 段落导读列表（``BottomAuxPanel``）——它们与视频
 *   高度重复，绝大多数用户永远不会展开；
 * - 视频右下角的「发现关键点」气泡——压在画面上抢注意力，且与伴学
 *   职责重叠。
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
  const { tk } = useLocale();
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<Record<string, EpisodeRecord>>({});

  /** 巩固题是否已通关。 */
  const [quizPassed, setQuizPassed] = useState(false);
  /** AI 伴学的实时学习上下文。 */
  const [labContext, setLabContext] = useState<LabContextDetail | null>(null);
  /** 原理短片是否展开。 */
  const [showFilm, setShowFilm] = useState(false);
  /** 本课三颗星。 */
  const [stars, setStars] = useState<LessonStarRecord>({
    explore: false,
    think: false,
    master: false,
    accuracy: 0,
    updated_at: 0,
  });

  const { setContext } = useChat();
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
      total: episodes.length,
    };
  }, [bundle, epId]);

  /**
   * 读取观看记录。
   *
   * ⚠️ 诊断记录**必须走 state**，不能在 render 里直接读
   *    ``localStorage``——SSR 时读到 ``undefined``，客户端 hydrate 时
   *    可能读到一条记录，两边渲染结果不一致就会触发 hydration mismatch。
   */
  useEffect(() => {
    const refresh = () => {
      setRecords(readEpisodeRecords(courseId));
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [courseId, epId, bundle]);

  /** 读本课三颗星。 */
  const refreshStars = useCallback(() => {
    setStars(readLessonStars(courseId, epId));
  }, [courseId, epId]);

  useEffect(() => {
    refreshStars();
  }, [refreshStars]);

  /**
   * 教具操作事件——伴学据此显示「当前学习上下文」，
   * 同时**点亮第 1 颗星**（动手探索）。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LabContextDetail>).detail;
      if (!detail) return;
      setLabContext(detail);
      // 完成全部教具任务 → 点亮「动手探索」星。
      if (detail.total > 0 && detail.done >= detail.total) {
        awardStar(courseId, epId, "explore", {
          tool: detail.title,
        });
        refreshStars();
      }
    };
    window.addEventListener(LAB_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(LAB_CONTEXT_EVENT, handler);
  }, [courseId, epId, refreshStars]);

  /**
   * 设置助教的会话上下文。
   *
   * ``courseId`` 用**课程 id**——这样同一门课的所有集共用一个会话。
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

  /** 播放参数。 */
  const playback = useMemo(
    () =>
      episode
        ? {
            startAt: episode.start_time ?? 0,
            endAt: episode.end_time ?? null,
            duration: episode.duration ?? 0,
          }
        : null,
    [episode],
  );

  /** 记录播放进度。 */
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
    () => deriveStatus(records[epId]),
    [records, epId],
  );

  /** 巩固题。 */
  const quizzes = episode?.quizzes ?? [];
  /** 本课核心总结。 */
  const takeaways = episode?.summary ?? [];

  /**
   * 教具完成 + 巩固题通过 → 点亮第 3 颗星。
   */
  useEffect(() => {
    if (!episode || !playback) return;
    if (quizPassed) {
      markEpisodeCompleted(courseId, epId, playback.duration);
      setRecords(readEpisodeRecords(courseId));
      const accuracy = quizzes.length > 0 ? 1 : 0;
      awardStar(courseId, epId, "master", { accuracy });
      refreshStars();
    }
  }, [courseId, epId, episode, playback, quizPassed, quizzes.length, refreshStars]);

  /** 点亮第 2 颗星（深度思考）。 */
  const onThink = useCallback(() => {
    awardStar(courseId, epId, "think");
    refreshStars();
  }, [courseId, epId, refreshStars]);

  /** 已点亮的星数。 */
  const starCount =
    (stars.explore ? 1 : 0) + (stars.think ? 1 : 0) + (stars.master ? 1 : 0);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          {tk("episode.loading")}
        </p>
      </div>
    );
  }

  if (!bundle || !episode || !playback) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
        <p className="text-[14px] font-medium text-[var(--foreground)]">
          {tk("episode.notFound")}
        </p>
        <Link
          href={`/courses/${encodeURIComponent(courseId)}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          返回星轨地图
        </Link>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-6 sm:-mx-6">
      {/* ── 顶栏：返回 + 标题 + 三颗星 + 折叠短片开关 ── */}
      <header className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3">
        <Link
          href={`/courses/${encodeURIComponent(courseId)}`}
          title="返回星轨地图"
          aria-label="返回星轨地图"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#0F172A] transition-colors hover:border-[#1D4ED8]"
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

        {/* 三颗星——实时点亮。 */}
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#FFFEFA] px-3 py-1.5">
          <StarRow stars={starCount} />
          <span className="text-[11px] tabular-nums text-[#55606E]">
            {starCount} / 3
          </span>
        </div>

        <span
          className={cn(
            "hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-block",
            starCount >= 3
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : status === "学习中"
                ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
          )}
        >
          {starCount >= 3 ? "已达标" : status}
        </span>

        {/* 折叠短片开关。 */}
        <button
          type="button"
          onClick={() => setShowFilm((value) => !value)}
          aria-expanded={showFilm}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors",
            showFilm
              ? "border-[#0B162C] bg-[#0B162C] text-white"
              : "border-[#CBD5E1] bg-white text-[#0F172A] hover:border-[#1D4ED8]",
          )}
        >
          <Play size={11} strokeWidth={2.4} />
          观看 3 分钟原理短片
          <ChevronDown
            size={12}
            strokeWidth={2.4}
            className={cn("transition-transform", showFilm && "rotate-180")}
          />
        </button>
      </header>

      {/* ── 主体：左 68% 实验台 | 右 32% 伴学 ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,68fr)_minmax(0,32fr)]">
        {/* ══ 左侧 · 主舞台 ══ */}
        <main className="min-w-0 space-y-4">
          {/* 折叠式原理短片——默认收起。 */}
          <AnimatePresence initial={false}>
            {showFilm ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-[#E5E7EB] bg-white p-3.5">
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
                      interactive_nodes: [],
                      guided_segments: [],
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
                      setRecords(readEpisodeRecords(courseId));
                    }}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E5E7EB] pt-3">
                    <span className="text-[11.5px] text-[var(--muted-foreground)]">
                      原理短片 · 看完随时收起，把时间留给下方教具
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFilm(false)}
                      className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0F172A] transition-colors hover:border-[#1D4ED8]"
                    >
                      收起短片
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* 核心主舞台 · 专属互动教具。 */}
          {episode.interactive_lab ? (
            <K12InteractiveLab
              lab={episode.interactive_lab}
              stage={bundle.stage ?? "junior"}
            />
          ) : (
            <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-8 text-center text-[13px] text-[#1E293B]">
              本讲的互动实验台正在装配中。原理短片里已经讲清了全部要点。
            </div>
          )}

          {/* 底部 · 本课巩固检测。 */}
          {quizzes.length > 0 ? (
            <ConsolidationCard
              questions={quizzes}
              takeaways={takeaways}
              labProgress={
                labContext
                  ? { done: labContext.done, total: labContext.total }
                  : undefined
              }
              onPass={() => setQuizPassed(true)}
            />
          ) : null}

          {/* 上下集导航。 */}
          <div className="flex items-center justify-between gap-3">
            {position.previous ? (
              <Link
                href={`/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(position.previous.ep_id)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:border-[var(--muted)]"
              >
                <ArrowLeft size={12} strokeWidth={2.4} />
                {tk("episode.prev")} · {position.previous.title}
              </Link>
            ) : (
              <span />
            )}
            {position.next ? (
              <Link
                href={`/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(position.next.ep_id)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:border-[var(--muted)]"
              >
                {tk("episode.next")} · {position.next.title}
                <ChevronRight size={12} strokeWidth={2.4} />
              </Link>
            ) : (
              <span />
            )}
          </div>
        </main>

        {/* ══ 右侧 · Khanmigo 启发伴学 ══ */}
        <aside className="min-w-0">
          <KhanmigoCopilot
            courseTitle={bundle.title}
            lessonTitle={episode.title}
            labContext={labContext}
            onThink={onThink}
            stars={{
              explore: stars.explore,
              think: stars.think,
              master: stars.master,
            }}
            className="lg:sticky lg:top-20"
          />
        </aside>
      </div>
    </div>
  );
}

/** 从记录里推导本集状态。 */
function deriveStatus(record: EpisodeRecord | undefined): string {
  if (!record) return "未开始";
  if (record.completed) return "已完成";
  if (record.position > 0) return "学习中";
  return "未开始";
}
