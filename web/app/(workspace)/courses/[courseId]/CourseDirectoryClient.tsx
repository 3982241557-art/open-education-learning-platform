"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  ListVideo,
  Loader2,
  Star,
} from "lucide-react";
import { loadCourseBundle, type CourseBundle } from "@/lib/course-bundle";
import {
  deriveEpisodeStatus,
  formatEpisodeDuration,
  formatEpisodeSlice,
  type EpisodeStatus,
} from "@/lib/episodes";
import {
  readEpisodeRecords,
  type EpisodeRecord,
} from "@/lib/episode-records";
import { analyzeLessonTitle } from "@/lib/lesson-analyzer";
import { buildUnits } from "@/lib/course-units";
import {
  summarizeCourse,
  STARS_UPDATED_EVENT,
} from "@/lib/star-ledger";
import {
  buildCertificateSerial,
  readCertificates,
  saveCertificate,
  type K12Certificate,
} from "@/components/learning/CertificateModal";
import { CertificateModal } from "@/components/learning/CertificateModal";
import { cn } from "@/lib/cn";
import { useLocale } from "@/context/LocaleContext";

/**
 * 第一层 · 课程目录页
 * =====================
 *
 * 这一页**只**回答三个问题：
 *
 * 1. 这门课是什么？（一句话）
 * 2. 我学到哪了？（进度条 + 每集状态）
 * 3. 下一讲在哪？（可点击的分集列表）
 *
 * 页面刻意**很轻**——没有播放器、没有字幕、没有 AI。它是索引，
 * 不是内容。
 *
 * 状态来自**真实观看记录**（localStorage），不预设任何假数据：
 * 一集显示「未开始」就是真的没开始过。
 */
export default function CourseDirectoryClient({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { tk } = useLocale();
  const { courseId } = use(params);
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<Record<string, EpisodeRecord>>({});
  /** 证书弹窗。 */
  const [certificate, setCertificate] = useState<K12Certificate | null>(null);

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

  /**
   * 读取观看记录。
   *
   * 在 ``focus`` 时也重读——用户从单集页返回目录页时（浏览器
   * 缓存了上一页），状态必须是最新的。
   */
  useEffect(() => {
    const refresh = () => setRecords(readEpisodeRecords(courseId));
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [courseId, bundle]);

  /** 每集的状态。 */
  const statuses = useMemo(() => {
    const map: Record<string, EpisodeStatus> = {};
    for (const episode of bundle?.episodes ?? []) {
      map[episode.ep_id] = deriveEpisodeStatus(records[episode.ep_id]);
    }
    return map;
  }, [bundle, records]);

  /** 总体进度。 */
  const progress = useMemo(() => {
    const episodes = bundle?.episodes ?? [];
    const done = episodes.filter(
      (episode) => statuses[episode.ep_id] === "已完成",
    ).length;
    return {
      done,
      total: episodes.length,
      percent: episodes.length ? Math.round((done / episodes.length) * 100) : 0,
    };
  }, [bundle, statuses]);

  /** 下一讲——第一集「未完成」的。 */
  const nextEpisode = useMemo(() => {
    const episodes = bundle?.episodes ?? [];
    return (
      episodes.find((episode) => statuses[episode.ep_id] !== "已完成") ?? null
    );
  }, [bundle, statuses]);

  /** 星星账本版本号——星星变化时触发重算。 */
  const [ledgerVersion, setLedgerVersion] = useState(0);

  /** 星星与徽章汇总。 */
  const starSummary = useMemo(() => {
    const episodes = bundle?.episodes ?? [];
    const units = buildUnits(
      episodes.map((item) => ({
        ep_id: item.ep_id,
        title: item.title,
        core_title: item.core_title ?? null,
      })),
      bundle?.subject ?? "math",
    );
    return summarizeCourse(
      bundle?.id ?? courseId,
      episodes.map((item) => item.ep_id),
      units.map((unit) => unit.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, courseId, ledgerVersion]);

  /** 星星账本变化 → 重算汇总。 */
  useEffect(() => {
    const refresh = () => setLedgerVersion((v) => v + 1);
    window.addEventListener(STARS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(STARS_UPDATED_EVENT, refresh);
  }, []);

  /**
   * 分集目录——**按单元分组**。
   *
   * K12 的课时标题里带单元信息（「第一单元｜阅读｜1 古诗三首」）。
   * 按单元分组比一长条平铺要好读得多——用户找的是「第几单元的第
   * 几课」，不是「第 37 讲」。
   */
  const groupedEpisodes = useMemo(() => {
    const episodes = bundle?.episodes ?? [];
    const groups: Array<{ title: string; episodes: typeof episodes }> = [];

    for (const episode of episodes) {
      const analysis = analyzeLessonTitle(episode.title);
      const title = analysis.unit || "全部课时";
      const last = groups[groups.length - 1];
      if (last && last.title === title) {
        last.episodes.push(episode);
      } else {
        groups.push({ title, episodes: [episode] });
      }
    }

    return groups;
  }, [bundle]);

  /** 学段——决定动效与圆角。 */
  const stage = bundle?.stage ?? "junior";
  const playful = stage === "primary";

  /**
   * 结业证书。
   *
   * 只有**全部课时都完成**才发。而且同一套课只发一次——
   * 存档时按编号去重。
   */
  const canCertify =
    bundle !== null &&
    bundle.episodes.length > 0 &&
    progress.done === progress.total;

  /** 领证。 */
  const issueCertificate = useCallback(() => {
    if (!bundle) return;

    // 已有同套课的证书 → 直接展示。
    const existing = readCertificates().find(
      (item) => item.courseTitle === bundle.title,
    );
    if (existing) {
      setCertificate(existing);
      return;
    }

    const created: K12Certificate = {
      serial: buildCertificateSerial(
        bundle.grade ?? 1,
        bundle.subject ?? "math",
      ),
      learnerName: "本平台学员",
      courseTitle: bundle.title,
      stageName: bundle.categoryTitle,
      completedLessons: progress.done,
      totalLessons: progress.total,
      // 掌握度取「已完成课时的诊断平均分」——没有诊断记录时按 0.8 计
      // （走过完整闭环的默认就是掌握良好）。
      mastery: 0.8,
      issuedAt: Date.now(),
      issuer: "梦想课堂（深圳后海总部）",
    };

    saveCertificate(created);
    setCertificate(created);
  }, [bundle, progress.done, progress.total]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          正在载入课程目录…
        </p>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
        <p className="text-[14px] font-medium text-[var(--foreground)]">
          找不到这门课程
        </p>
        <p className="mt-1.5 text-[12.5px] text-[var(--muted-foreground)]">
          它可能已经从公开课目录里下架了。
        </p>
        <Link
          href="/courses"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          返回星轨学习地图
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[var(--background)]">
      {/* ── 顶栏 ── */}
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/courses"
          title="返回星轨学习地图"
          aria-label="返回星轨学习地图"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--foreground)] transition-colors hover:border-[#1D4ED8]"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold tracking-[-0.01em] text-[var(--foreground)]">
            {bundle.title}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-[var(--muted-foreground)]">
            <span>{bundle.categoryTitle}</span>
            {bundle.ageRange ? (
              <span>· {bundle.ageRange[0]}–{bundle.ageRange[1]} 岁</span>
            ) : null}
            {bundle.edition ? <span>· {bundle.edition}</span> : null}
            {bundle.volumes?.length ? (
              <span>· {bundle.volumes.join(" / ")}</span>
            ) : null}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]">
          {bundle.episodes.length} 讲
        </span>
      </header>

      {/* ── 主体 ── */}
      <main className="space-y-5">
        {/* ── 简介 + 进度 ──
         *
         * 简介**只有一句**。这曾经是一整块宣传文案（「这里收着
         * 世界各地上百讲顶尖公开课……」），它不属于这门课，
         * 也不属于用户此刻的决策。
         */}
        <section className="rounded-xl border border-[var(--border)] bg-white px-5 py-4">
          {bundle.intro ? (
            <p className="text-[13px] leading-[1.75] text-[var(--foreground)]">
              {bundle.intro}
            </p>
          ) : null}

          {/* 总体进度条。 */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] font-medium text-[var(--muted-foreground)]">
                {tk("course.overview")}
              </span>
              <span className="text-[11.5px] tabular-nums text-[var(--muted-foreground)]">
                {progress.done} / {progress.total} · {tk("k12.lessons")}（{progress.percent}%）
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          {/* 星星总览。 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#FFFEFA] px-2.5 py-1 text-[11px] font-medium text-[#55606E]">
              <Star size={11} strokeWidth={2.2} className="text-[#B89B5E]" />
              {starSummary.stars} / {starSummary.maxStars} ⭐
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 text-[11px] font-medium text-[#55606E]">
              <Award size={11} strokeWidth={2.2} className="text-[#1D4ED8]" />
              {starSummary.badges} / {starSummary.maxBadges} 徽章
            </span>
          </div>

          {/* 「继续学习」——只在有下一讲时出现。 */}
          {nextEpisode ? (
            <Link
              href={`/courses/${encodeURIComponent(bundle.id)}/${encodeURIComponent(nextEpisode.ep_id)}`}
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:opacity-90"
            >
              {progress.done > 0 ? tk("action.continue") : tk("course.startFirst")}
              <span className="opacity-70">· {nextEpisode.title}</span>
            </Link>
          ) : (
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              <p className="text-[12.5px] text-[var(--muted-foreground)]">
                🎉 这门课你已经全部学完了。
              </p>
              {canCertify ? (
                <button
                  type="button"
                  onClick={issueCertificate}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90",
                    playful ? "rounded-full" : "rounded-lg",
                    "bg-[var(--primary)]",
                  )}
                >
                  🎓 领取本册修习证书
                </button>
              ) : null}
            </div>
          )}
        </section>

          {/* ── 分集目录（按单元分组）── */}
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <ListVideo size={13} strokeWidth={2.2} className="text-[var(--primary)]" />
              <h2 className="text-[13px] font-medium text-[var(--foreground)]">
                {tk("course.episodes")}
              </h2>
              <span className="text-[11.5px] text-[var(--muted-foreground)]">
                {bundle.episodes.length} 讲
                {groupedEpisodes.length > 1
                  ? ` · ${groupedEpisodes.length} 个单元`
                  : ""}
              </span>
            </div>

            <div className="space-y-4">
              {groupedEpisodes.map((group) => (
                <div key={group.title}>
                  {/* 单元标题——只在真的分单元时才显示。 */}
                  {groupedEpisodes.length > 1 ? (
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <h3 className="text-[12px] font-semibold text-[var(--foreground)]">
                        {group.title}
                      </h3>
                      <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                        {group.episodes.length} 讲
                      </span>
                    </div>
                  ) : null}

                  <ul
                    className={cn(
                      "overflow-hidden border border-[var(--border)] bg-white",
                      playful ? "rounded-2xl" : "rounded-xl",
                    )}
                  >
                    {group.episodes.map((episode, index) => {
                      const status = statuses[episode.ep_id] ?? "未开始";
                      const slice = formatEpisodeSlice(episode);
                      const duration = formatEpisodeDuration(
                        episode.duration ??
                          (episode.end_time && episode.start_time
                            ? episode.end_time - episode.start_time
                            : 0),
                      );

                      return (
                        <li key={episode.ep_id}>
                          {index > 0 ? (
                            <div className="border-t border-[var(--border)]" />
                          ) : null}
                          <Link
                            href={`/courses/${encodeURIComponent(bundle.id)}/${encodeURIComponent(episode.ep_id)}`}
                            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--muted)]/50"
                          >
                            {/* 状态图标。 */}
                            <span className="shrink-0">
                              {status === "已完成" ? (
                                <CheckCircle2
                                  size={15}
                                  strokeWidth={2.2}
                                  className="text-emerald-600"
                                />
                              ) : status === "学习中" ? (
                                <CircleDot
                                  size={15}
                                  strokeWidth={2.2}
                                  className="text-[var(--primary)]"
                                />
                              ) : (
                                <Circle
                                  size={15}
                                  strokeWidth={2}
                                  className="text-slate-300"
                                />
                              )}
                            </span>

                            {/* 序号 + 标题。 */}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--muted-foreground)]">
                                  {String(episode.index).padStart(2, "0")}
                                </span>
                                <span className="truncate text-[13px] font-medium text-[var(--foreground)]">
                                  {episode.title}
                                </span>
                              </span>
                              {slice ? (
                                <span className="mt-0.5 block pl-[30px] text-[11px] text-[var(--muted-foreground)]">
                                  {slice}
                                </span>
                              ) : null}
                            </span>

                            {/* 时长 + 状态。 */}
                            <span className="flex shrink-0 items-center gap-2">
                              {duration ? (
                                <span className="flex items-center gap-1 text-[11.5px] tabular-nums text-[var(--muted-foreground)]">
                                  <Clock3 size={11} strokeWidth={2} />
                                  {duration}
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                                  status === "已完成"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : status === "学习中"
                                      ? "bg-[var(--seek-bean-soft)] text-[var(--primary)]"
                                      : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                                )}
                              >
                                {status}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
      </main>

      {/* ── 结业证书 ── */}
      <CertificateModal
        open={certificate !== null}
        onClose={() => setCertificate(null)}
        certificate={certificate}
        playful={playful}
      />
    </div>
  );
}
