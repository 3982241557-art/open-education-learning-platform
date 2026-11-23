"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Beaker,
  Check,
  ChevronRight,
  FlaskConical,
  Loader2,
  Play,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { loadCourseBundle, type CourseBundle } from "@/lib/course-bundle";
import { formatEpisodeDuration } from "@/lib/episodes";
import K12InteractiveLab from "@/components/interactive/K12InteractiveLab";
import KhanmigoCopilot from "@/components/ai/KhanmigoCopilot";
import {
  awardStar,
  readLessonStars,
  readUnitBadge,
  settleUnitBadge,
  STARS_UPDATED_EVENT,
  type LessonStarRecord,
} from "@/lib/star-ledger";
import { buildUnits } from "@/lib/course-units";
import {
  LAB_CONTEXT_EVENT,
  type LabContextDetail,
} from "@/lib/lab-context";
import { cn } from "@/lib/cn";

/**
 * 上课台（100vh 一屏 · 68/32 双栏）
 * ================================
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────────────────────┐
 *     │ ← 课程  第 3/15 讲 · 观察物体      ☆☆☆  单元徽章       │
 *     ├────────────────────────────────┬─────────────────────────┤
 *     │ [🔬 教具][▶ 短片][✍️ 巩固]      │  ⭐ ⭐ ⭐ 进度灯        │
 *     │                                │                         │
 *     │         主舞台（68%）          │   苏格拉底引导（32%）   │
 *     │                                │                         │
 *     ├────────────────────────────────┴─────────────────────────┤
 *     │  [← 上一课]                          [下一课 →]           │
 *     └──────────────────────────────────────────────────────────┘
 *
 * 三个分块标签
 * ------------
 *
 * 旧版要滚动才能看全内容。现在顶部三个标签把「教具 / 短片 / 巩固」
 * 切成**互斥的视图**，任何时候只有一屏内容，**永不整页滚动**。
 *
 * 短片的懒加载
 * ------------
 *
 * ⚠️ ``<iframe>``（B 站 / YouTube）是**点击标签才挂载**的。
 *    页面初始化时 DOM 里**没有**任何 iframe——这是根治首屏卡顿
 *    最关键的一步。B 站的播放器脚本动辄几百 KB，24 个 iframe 同时
 *    挂载会把首屏拖到十几秒。
 *
 * 色彩
 * ----
 *
 * 全站低饱和雾感色板。数学用雾霾蓝灰 ``#4E677D``，语文用暖陶灰褐
 * ``#8A6E63``，星星用哑光浅麦金 ``#A48A5E``。
 */

/**
 * 播放器**动态导入**。
 *
 * ⛔ 播放器（B 站 iframe + 字幕 + 时间轴）是一个 60KB+ 的重组件，
 *    但它**只在用户点开「3 分钟原理短片」时**才需要。静态 import
 *    会把它塞进首屏 bundle——``/learn`` 的 First Load JS 曾经是
 *    388KB，动态导入后降到 200KB 出头。
 */
const InteractiveVideoCanvas = dynamic(
  () =>
    import("@/components/learning/InteractiveVideoCanvas").then(
      (module) => module.InteractiveVideoCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[240px] items-center justify-center rounded-2xl border border-[#e5e2da] bg-white">
        <Loader2 size={18} className="animate-spin text-[#5c646d]" />
      </div>
    ),
  },
);

/**
 * 巩固检测卡**动态导入**。
 *
 * 它只在用户点开「✍️ 本课巩固检测」标签时才需要——默认标签是教具。
 */
const ConsolidationCard = dynamic(
  () =>
    import("@/components/learning/ConsolidationCard").then(
      (module) => module.default,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[180px] items-center justify-center rounded-2xl border border-[#e5e2da] bg-white">
        <Loader2 size={18} className="animate-spin text-[#5c646d]" />
      </div>
    ),
  },
);

/** 三个主舞台标签。 */
type StageTab = "lab" | "film" | "quiz";

/** 组件。 */
export default function LearnStudio({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string | null;
}) {
  const router = useRouter();

  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StageTab>("lab");

  /** 教具实时上下文。 */
  const [labContext, setLabContext] = useState<LabContextDetail | null>(null);
  /** 本课三颗星。 */
  const [stars, setStars] = useState<LessonStarRecord>({
    explore: false,
    think: false,
    master: false,
    accuracy: 0,
    updated_at: 0,
  });
  /** 巩固题是否通过。 */
  const [quizPassed, setQuizPassed] = useState(false);
  /** 单元徽章是否刚解锁——用来弹解锁卡。 */
  const [badgeJustUnlocked, setBadgeJustUnlocked] = useState(false);

  /** 加载课程包。 */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBundle(await loadCourseBundle(courseId));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 本课（缺 lesson 时回落到第一讲）。 */
  const episode = useMemo(() => {
    const list = bundle?.episodes ?? [];
    if (list.length === 0) return null;
    return list.find((item) => item.ep_id === lessonId) ?? list[0];
  }, [bundle, lessonId]);

  /** 本课在系列里的位置 + 所在单元。 */
  const position = useMemo(() => {
    const list = bundle?.episodes ?? [];
    const index = list.findIndex((item) => item.ep_id === episode?.ep_id);
    const units = buildUnits(
      list.map((item) => ({
        ep_id: item.ep_id,
        title: item.title,
        core_title: item.core_title ?? null,
      })),
      bundle?.subject === "chinese" ? "chinese" : "math",
    );
    const unit =
      units.find((item) => item.lessonIds.includes(episode?.ep_id ?? "")) ??
      null;
    return {
      index,
      total: list.length,
      previous: index > 0 ? list[index - 1] : null,
      next:
        index >= 0 && index < list.length - 1 ? list[index + 1] : null,
      unit,
      units,
    };
  }, [bundle, episode]);

  /** 实际使用的课 id（可能是回落到的第一讲）。 */
  const activeLessonId = episode?.ep_id ?? "";

  /** 刷新星星。 */
  const refreshStars = useCallback(() => {
    if (!activeLessonId) return;
    setStars(readLessonStars(courseId, activeLessonId));
  }, [courseId, activeLessonId]);

  useEffect(() => {
    refreshStars();
  }, [refreshStars]);

  /** 教具操作 → 点亮「动手探索」星。 */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LabContextDetail>).detail;
      if (!detail) return;
      setLabContext(detail);
      if (detail.total > 0 && detail.done >= detail.total) {
        awardStar(courseId, activeLessonId, "explore", { tool: detail.title });
        refreshStars();
      }
    };
    window.addEventListener(LAB_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(LAB_CONTEXT_EVENT, handler);
  }, [courseId, activeLessonId, refreshStars]);

  /** 巩固题通过 → 点亮「巩固掌握」星 + 结算单元徽章。 */
  useEffect(() => {
    if (!quizPassed || !activeLessonId) return;
    awardStar(courseId, activeLessonId, "master", { accuracy: 1 });
    refreshStars();

    // 单元徽章结算。
    if (position.unit) {
      const badge = settleUnitBadge(
        courseId,
        position.unit.id,
        position.unit.lessonIds,
      );
      if (badge.unlocked) {
        setBadgeJustUnlocked(true);
        window.setTimeout(() => setBadgeJustUnlocked(false), 5200);
      }
    }
  }, [
    quizPassed,
    courseId,
    activeLessonId,
    position.unit,
    refreshStars,
  ]);

  /** 点亮「深度思考」星。 */
  const onThink = useCallback(() => {
    if (!activeLessonId) return;
    awardStar(courseId, activeLessonId, "think");
    refreshStars();
  }, [courseId, activeLessonId, refreshStars]);

  /** 账本变化时重算（跨页签同步）。 */
  useEffect(() => {
    const handler = () => refreshStars();
    window.addEventListener(STARS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(STARS_UPDATED_EVENT, handler);
  }, [refreshStars]);

  /** 已点亮的星数。 */
  const starCount =
    (stars.explore ? 1 : 0) + (stars.think ? 1 : 0) + (stars.master ? 1 : 0);

  /** 学科语义色。 */
  const subject = bundle?.subject === "chinese" ? "chinese" : "math";
  const subjectColor = subject === "chinese" ? "#8a6e63" : "#4e677d";
  const subjectSoft = subject === "chinese" ? "#f6f1ee" : "#eff3f6";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f6f4ef]">
        <Loader2 size={18} className="animate-spin text-[#5c646d]" />
      </div>
    );
  }

  if (!bundle || !episode) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f6f4ef] px-6 text-center">
        <p className="text-[14px] font-medium text-[#1e242b]">
          没有找到这堂课
        </p>
        <p className="text-[12.5px] text-[#5c646d]">
          课程 <code className="text-[#4e677d]">{courseId}</code> 可能已下线。
        </p>
        <button
          type="button"
          onClick={() => router.replace("/courses")}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#1e242b] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          返回课程总台
        </button>
      </div>
    );
  }

  const quizzes = episode.quizzes ?? [];
  const takeaways = episode.summary ?? [];

  /** 三个标签按钮。 */
  const tabButton = (id: StageTab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
        tab === id
          ? "bg-[#1e242b] text-white"
          : "text-[#5c646d] hover:bg-[#f2efe9] hover:text-[#1e242b]",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── 顶部信息条 ── */}
      <header className="mb-3 flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-[#e5e2da] bg-white px-4 py-2.5">
        <Link
          href="/courses"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e2da] bg-white text-[#1e242b] transition-colors hover:bg-[#f2efe9]"
          aria-label="返回课程总台"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 text-[11px] tabular-nums text-[#5c646d]">
              第 {position.index + 1} / {position.total} 讲
            </span>
            {position.unit ? (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                style={{ background: subjectSoft, color: subjectColor }}
              >
                {position.unit.title}
              </span>
            ) : null}
          </div>
          <h1 className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.01em] text-[#1e242b]">
            {episode.title}
          </h1>
        </div>

        {/* 三颗星 */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e5e2da] bg-[#f7f3ea] px-3 py-1.5">
          {[0, 1, 2].map((index) => (
            <Star
              key={index}
              size={13}
              strokeWidth={2}
              className={index < starCount ? "text-[#a48a5e]" : "text-[#ddd8cc]"}
              fill={index < starCount ? "#a48a5e" : "none"}
            />
          ))}
          <span className="ml-0.5 text-[11px] tabular-nums text-[#6e5a38]">
            {starCount} / 3
          </span>
        </div>

        {/* 单元徽章状态 */}
        {position.unit ? <UnitBadgePill courseId={courseId} unitId={position.unit.id} /> : null}
      </header>

      {/* ── 主体：左 68% | 右 32% ── */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,68fr)_minmax(0,32fr)]">
        {/* ══ 左侧主舞台 ══ */}
        <main className="flex min-h-0 min-w-0 flex-col">
          {/* 三个分块标签 */}
          <div className="mb-3 flex shrink-0 items-center gap-1.5">
            {tabButton(
              "lab",
              "互动教具实验室",
              <Beaker size={13} strokeWidth={2.2} />,
            )}
            {tabButton(
              "film",
              "3 分钟原理短片",
              <Play size={12} strokeWidth={2.4} />,
            )}
            {tabButton(
              "quiz",
              "本课巩固检测",
              <Sparkles size={13} strokeWidth={2.2} />,
            )}
          </div>

          {/* 舞台内容——只有当前标签的会挂载。 */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "lab" ? (
              <div className="space-y-3">
                {episode.interactive_lab ? (
                  <K12InteractiveLab
                    lab={episode.interactive_lab}
                    stage={bundle.stage ?? "junior"}
                  />
                ) : (
                  <div className="rounded-2xl border border-[#e5e2da] bg-white px-4 py-10 text-center text-[13px] text-[#5c646d]">
                    本讲的互动实验台正在按教材单元校准。先看「3 分钟原理短片」，
                    再做「本课巩固检测」即可拿满三颗星。
                  </div>
                )}
              </div>
            ) : null}

            {/* ⚠️ 短片：只有切到这一个标签才挂载 iframe。 */}
            {tab === "film" ? (
              <div className="rounded-2xl border border-[#e5e2da] bg-white p-3.5">
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
                  pageId={activeLessonId}
                  episodeStart={episode.start_time ?? 0}
                  episodeEnd={episode.end_time ?? null}
                />
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#e5e2da] pt-3">
                  <span className="text-[11.5px] text-[#5c646d]">
                    原理短片 · 看完随时切回教具，把时间留给动手
                  </span>
                  <button
                    type="button"
                    onClick={() => setTab("lab")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e2da] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1e242b] transition-colors hover:bg-[#f2efe9]"
                  >
                    <Beaker size={12} strokeWidth={2.2} />
                    回到教具
                  </button>
                </div>
              </div>
            ) : null}

            {/* 巩固检测 */}
            {tab === "quiz" ? (
              quizzes.length > 0 ? (
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
              ) : (
                <div className="rounded-2xl border border-[#e5e2da] bg-white px-4 py-10 text-center text-[13px] text-[#5c646d]">
                  本课暂无巩固题。可以先完成教具探究拿第一颗星。
                </div>
              )
            ) : null}
          </div>

          {/* 底部：上下课导航 */}
          <div className="mt-3 flex shrink-0 items-center justify-between gap-3">
            {position.previous ? (
              <Link
                href={`/learn?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(position.previous.ep_id)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e2da] bg-white px-3.5 py-1.5 text-[12px] text-[#1e242b] transition-colors hover:bg-[#f2efe9]"
              >
                <ArrowLeft size={12} strokeWidth={2.4} />
                上一课 · {position.previous.title}
              </Link>
            ) : (
              <span />
            )}
            {position.next ? (
              <Link
                href={`/learn?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(position.next.ep_id)}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1e242b] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              >
                下一课 · {position.next.title}
                <ArrowRight size={12} strokeWidth={2.4} />
              </Link>
            ) : (
              <Link
                href="/report"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1e242b] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              >
                前往 Result Report
                <ArrowRight size={12} strokeWidth={2.4} />
              </Link>
            )}
          </div>
        </main>

        {/* ══ 右侧 · 苏格拉底引导副驾驶 ══ */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e5e2da] bg-white">
          {/* 3 颗星进度灯 */}
          <div className="shrink-0 border-b border-[#e5e2da] px-4 py-3">
            <p className="mb-2 text-[10.5px] font-medium tracking-[0.14em] text-[#5c646d] uppercase">
              本课掌握进度
            </p>
            <div className="space-y-1.5">
              <StarLight
                on={stars.explore}
                label="动手探究"
                hint="完成教具核心操作"
              />
              <StarLight
                on={stars.think}
                label="启发思考"
                hint="完成一轮苏格拉底引导"
              />
              <StarLight
                on={stars.master}
                label="巩固掌握"
                hint="通过本课巩固检测"
              />
            </div>
          </div>

          {/* 引导区 */}
          <div className="min-h-0 flex-1 overflow-hidden">
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
            />
          </div>
        </aside>
      </div>

      {/* ── 单元徽章解锁卡 ── */}
      {badgeJustUnlocked && position.unit ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-50 flex justify-center">
          <div className="flex items-center gap-3 rounded-2xl border border-[#ddd0b4] bg-white px-5 py-3.5 shadow-[0_18px_44px_-14px_rgba(30,36,43,0.22)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f3ea]">
              <Award size={19} strokeWidth={2} className="text-[#a48a5e]" />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-[#1e242b]">
                单元学术徽章已解锁
              </p>
              <p className="mt-0.5 text-[11.5px] text-[#6e5a38]">
                {position.unit.title} · {bundle.title}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 单元徽章状态药丸。
 *
 * 未达成时是**银灰线框**，达成后点亮哑光浅麦金。
 */
function UnitBadgePill({
  courseId,
  unitId,
}: {
  courseId: string;
  unitId: string;
}) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setUnlocked(readUnitBadge(courseId, unitId).unlocked);
    };
    refresh();
    window.addEventListener(STARS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(STARS_UPDATED_EVENT, refresh);
  }, [courseId, unitId]);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        unlocked
          ? "border-[#ddd0b4] bg-[#f7f3ea] text-[#6e5a38]"
          : "border-[#e5e2da] bg-white text-[#5c646d]",
      )}
    >
      <Award
        size={12}
        strokeWidth={2.2}
        className={unlocked ? "text-[#a48a5e]" : "text-[#b9b4a8]"}
      />
      {unlocked ? "单元徽章已解锁" : "单元徽章未解锁"}
    </span>
  );
}

/** 右侧的一颗星进度灯。 */
function StarLight({
  on,
  label,
  hint,
}: {
  on: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
        on ? "bg-[#f7f3ea]" : "bg-[#f6f4ef]",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          on ? "bg-[#a48a5e]" : "bg-[#e5e2da]",
        )}
      >
        {on ? (
          <Check size={12} strokeWidth={3} className="text-white" />
        ) : (
          <Star size={11} strokeWidth={2.4} className="text-[#b9b4a8]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[12px] font-medium",
            on ? "text-[#6e5a38]" : "text-[#5c646d]",
          )}
        >
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-[#8a8578]">
          {hint}
        </span>
      </span>
    </div>
  );
}
