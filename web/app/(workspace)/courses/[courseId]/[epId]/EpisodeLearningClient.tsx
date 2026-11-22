"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Sparkles,
  Target,
} from "lucide-react";
import { loadCourseBundle, type CourseBundle } from "@/lib/course-bundle";
import {
  deriveEpisodeStatus,
  formatEpisodeDuration,
  resolveEpisodePlayback,
} from "@/lib/episodes";
import {
  markEpisodeCompleted,
  readEpisodeRecords,
  saveEpisodeProgress,
  type EpisodeRecord,
} from "@/lib/episode-records";
import { EpisodeCompletionModal } from "@/components/learning/EpisodeCompletionModal";
import { InteractiveVideoCanvas } from "@/components/learning/InteractiveVideoCanvas";
import K12InteractiveLab from "@/components/interactive/K12InteractiveLab";
import ConsolidationCard from "@/components/learning/ConsolidationCard";
import { MainAiPanel } from "@/components/ai/MainAiPanel";
import { MacroAdvisor } from "@/components/ai/MacroAdvisor";
import AiLearningContext from "@/components/ai/AiLearningContext";
import { ReaderProvider } from "@/context/ReaderContext";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/cn";
import { useLocale } from "@/context/LocaleContext";
import {
  LAB_CONTEXT_EVENT,
  type LabContextDetail,
} from "@/lib/lab-context";

/**
 * 第二层 · 单集沉浸学习页
 * =========================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────────────┐
 *     │ ← 返回课程目录   第 3 讲 · 本课标题   [掌握徽标] │
 *     ├──────────────────────────┬─────────────────────┤
 *     │                          │                     │
 *     │      短课视频区           │   AI 伴学           │
 *     │                          │  [实时学习上下文]    │
 *     ├──────────────────────────┴─────────────────────┤
 *     │  核心主舞台 · 专属互动教具（展开即用）         │
 *     │  ──────────────────────────────────────────  │
 *     │  本课巩固检测（2–3 道真实精炼题）              │
 *     └────────────────────────────────────────────────┘
 *
 * 极致做减法
 * ----------
 *
 * 这一版**删掉了**四个模块：
 *
 * 1. ⛔ **课前诊断提问弹窗**——用户还没看内容就要答题，是在替他编造
 *    自我认知。测应该放在学完之后，依据是**真实作答**。
 * 2. ⛔ **视频下方的「知识节点」列表**——它把整条视频的知识点平铺
 *    在一屏里，绝大多数用户永远不会展开它。
 * 3. ⛔ **「段落导读」列表**——同上，而且它的内容与视频高度重复。
 * 4. ⛔ **视频右下角错位的「发现关键点」气泡**——它压在画面上，
 *    抢注意力，还跟右侧助教职责重叠。
 *
 * 保留下来的只有四件事：**看课 → 玩教具 → 测 → 点亮进度**。
 * 其余的都是分心。
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

  /** 学完闭环是否打开。 */
  const [completionOpen, setCompletionOpen] = useState(false);
  /** 教具探究进度——用于「教具 + 巩固题」双达标判定。 */
  const [labProgress, setLabProgress] = useState({ done: 0, total: 0 });
  /** 巩固题是否已通关。 */
  const [quizPassed, setQuizPassed] = useState(false);
  /** AI 伴学的实时学习上下文。 */
  const [labContext, setLabContext] = useState<LabContextDetail | null>(null);

  const { setContext, setLearnerProfile } = useChat();
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
   * 读取观看记录。
   *
   * ⚠️ 诊断记录**必须走 state**，不能在 render 里直接读
   * ``localStorage``——SSR 时读到 ``undefined``，客户端 hydrate 时
   * 可能读到一条记录，两边渲染结果不一致就会触发 hydration mismatch。
   */
  useEffect(() => {
    const refresh = () => {
      setRecords(readEpisodeRecords(courseId));
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [courseId, epId, bundle]);

  /**
   * 教具操作事件——右侧 AI 伴学据此显示「当前学习上下文」。
   *
   * 这就是「**实时行为级学习追踪**」的落点：不再只是视频计时，而是
   * 「已完成 6/8 个本课生字描红」「已用量角器完成角度验证」这种
   * 真正反映学习动作的信号。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LabContextDetail>).detail;
      if (!detail) return;
      setLabContext(detail);
      setLabProgress({ done: detail.done, total: detail.total });
    };
    window.addEventListener(LAB_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(LAB_CONTEXT_EVENT, handler);
  }, []);

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

  /** 巩固题。 */
  const quizzes = episode?.quizzes ?? [];
  /** 本课核心总结。 */
  const takeaways = episode?.summary ?? [];

  /**
   * 教具完成 + 巩固题通过 → 点亮本课进度。
   *
   * 判定用的是**两个真实信号**：教具操作事件 + 答对全部题目。
   */
  const labDone = labProgress.total > 0 && labProgress.done >= labProgress.total;
  const doublePass = quizPassed && (labProgress.total === 0 || labDone);

  useEffect(() => {
    if (!episode || !playback) return;
    if (doublePass) {
      markEpisodeCompleted(courseId, epId, playback.duration);
      setRecords(readEpisodeRecords(courseId));
    }
  }, [courseId, epId, episode, playback, doublePass]);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          {tk("episode.loading")}
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
      {/* ── 顶栏：返回 + 本课标题 + 掌握状态徽标 ── */}
      <header className="shrink-0 border-b border-[var(--border)] bg-white px-3 py-2.5">
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

          {/* 本课掌握状态徽标。 */}
          <span
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              doublePass
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : status === "学习中"
                  ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
            )}
          >
            {doublePass
              ? "已达标"
              : status === "学习中"
                ? "学习中"
                : "未开始"}
          </span>

          {/* 课程总进度——极简。 */}
          <span className="shrink-0 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[var(--primary)]">
            {courseProgress.done} / {courseProgress.total} 讲
          </span>
        </div>
      </header>

      {/* ── 主体：主舞台 | AI 伴学 ── */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,30%)]">
        <main className="min-h-0 overflow-y-auto bg-[var(--seek-cool)] px-4 py-4 lg:px-6">
          <div className="mx-auto max-w-[900px] space-y-3">
            {/* ── 上方 · 现代精炼短课视频区 ──
             *
             * 紧凑，不占满全屏——它只是**概念引入**，真正的学习
             * 发生在下面的教具与巩固题里。
             */}
            <div className="border border-[var(--border)] bg-white p-3.5 rounded-xl">
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
                    setRecords(readEpisodeRecords(courseId));
                    setCompletionOpen(true);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90",
                    "rounded-lg bg-[var(--primary)]",
                  )}
                >
                  {tk("episode.learn")}
                  <ChevronRight size={12} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            {/* ── 核心主舞台 · 专属互动教具（展开即用） ──
             *
             * 紧贴视频下方——这是这一页的**主角**。根据当前课程真实
             * 内容自动插入对应教具。
             */}
            {episode.interactive_lab ? (
              <K12InteractiveLab
                lab={episode.interactive_lab}
                stage={bundle.stage ?? "junior"}
              />
            ) : null}

            {/* ── 底部 · 本课巩固检测（2–3 道真实精炼题） ── */}
            {quizzes.length > 0 ? (
              <ConsolidationCard
                questions={quizzes}
                takeaways={takeaways}
                labProgress={labProgress}
                onPass={() => setQuizPassed(true)}
              />
            ) : null}

            {/* ── 上下集导航 ── */}
            <div className="flex items-center justify-between gap-3">
              {position.previous ? (
                <Link
                  href={`/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(position.previous.ep_id)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  {tk("episode.next")} · {position.next.title}
                  <ChevronRight size={12} strokeWidth={2.4} />
                </Link>
              ) : (
                <span />
              )}
            </div>
          </div>
        </main>

        {/* ── 右侧 · 实时行为追踪 AI 伴学 ── */}
        <aside className="flex min-h-0 flex-col gap-2.5 bg-[var(--seek-warm)] p-2.5">
          {/* 实时学习上下文——AI 知道用户在做什么。 */}
          <AiLearningContext />
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
            className="min-h-0 flex-1"
          />
        </aside>
      </div>

      {/* ── 学完闭环 ── */}
      <EpisodeCompletionModal
        open={completionOpen}
        onClose={() => setCompletionOpen(false)}
        resourceId={courseId}
        courseTitle={bundle.title}
        episode={episode}
        allEpisodes={bundle.episodes}
        nodes={[]}
        segments={[]}
        stage={bundle.stage ?? "junior"}
        subject={bundle.subject ?? "math"}
        onSaveNote={(text) => {
          void upsertNoteSafe(text);
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

/** 占位：笔记写入（ReaderContext 在 ReaderProvider 内，此处由上层处理）。 */
async function upsertNoteSafe(_text: string): Promise<void> {
  /* 保留钩子位——笔记保存由 ReaderProvider 内部接管。 */
}
