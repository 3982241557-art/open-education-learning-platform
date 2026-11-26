"use client";

/**
 * 几何标杆实验台
 * ===============
 *
 * 「空间、角度与几何探究」这条链的**唯一**实验台实现——8 节课
 * 共用这一个组件，靠 ``lessonId`` 切换 GeoGebra 构造。
 *
 * ⛔ **零 AI 编造内容**
 *
 * 右侧面板显示的每一句话——概念、任务、提示、巩固题——都来自
 * ``/data/geometry-chain.json``，那份文件由
 * ``scripts/fetch-open-geometry.mjs`` 从 Khan/khan-exercises 与
 * OpenStax 的真实开源仓库拉取生成。组件**不产生任何教学内容**。
 *
 * ⛔ **零硬编码引导语**
 *
 * 之前右侧写死一句「把砝码或控制点拖一拖」，学生在几何课上看到
 * 的是这句——驴唇不对马嘴。现在引导语**由本课真实数据 + 引擎
 * 实时读数**共同生成。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import GeoGebraStudio, {
  type LiveReading,
} from "@/components/lab/GeoGebraStudio";
import { GEO_CONSTRUCTIONS } from "@/lib/geometry-constructions";
import type { GeometryLesson } from "@/lib/geometry-chain";
import { useLocale } from "@/context/LocaleContext";
import { useTraditional } from "@/lib/use-bilingual";
import { cn } from "@/lib/cn";

/** 三段式阶段。 */
export type GeoStage = "explore" | "discover" | "mystery";

/** 组件属性。 */
export interface GeometryLabProps {
  /** 本课数据。 */
  lesson: GeometryLesson;
  /** 当前阶段。 */
  stage: GeoStage;
  /** 阶段切换回调——顶部那套 [探索 / 规律 / 谜题] 按钮连的是它。 */
  onStageChange?: (stage: GeoStage) => void;
  /** 过关回调——谜题解出时。 */
  onSolved?: (messageZh: string, messageEn: string) => void;
  /** 实时读数回调——推给右侧面板。 */
  onReadings?: (readings: LiveReading[]) => void;
  /** 过关回调——任意阶段达成。 */
  onGoalMet?: (stage: GeoStage) => void;
}

/** 三段式的标题（右侧与顶部共用）。 */
export const GEO_STAGE_LABELS: Record<
  GeoStage,
  { zhCN: string; zhTW: string; en: string }
> = {
  explore: { zhCN: "探索", zhTW: "探索", en: "Explore" },
  discover: { zhCN: "规律", zhTW: "規律", en: "Discover" },
  mystery: { zhCN: "谜题", zhTW: "謎題", en: "Mystery" },
};

export default function GeometryLab({
  lesson,
  stage,
  onStageChange,
  onSolved,
  onReadings,
  onGoalMet,
}: GeometryLabProps) {
  const { locale } = useLocale();
  const tw = useTraditional();
  const isEn = locale === "en";

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [readings, setReadings] = useState<LiveReading[]>([]);

  /* 本课的 GeoGebra 构造。 */
  const construction = GEO_CONSTRUCTIONS[lesson.id];

  /* ── 语言挑选：只取当前语言那一列，绝不混排 ────────────── */

  /** 从三语文本里挑当前语言的一列。 */
  const pick = useCallback(
    (tr: { zhCN: string[]; zhTW: string[]; en: string[] }): string[] => {
      if (isEn) return tr.en;
      if (locale === "zh-TW") return tr.zhTW;
      return tr.zhCN;
    },
    [isEn, locale],
  );

  const concepts = useMemo(() => pick(lesson.concept), [pick, lesson.concept]);
  const tasks = useMemo(() => pick(lesson.task), [pick, lesson.task]);
  const hints = useMemo(() => pick(lesson.hints), [pick, lesson.hints]);
  const trials = useMemo(() => pick(lesson.trials), [pick, lesson.trials]);

  /* ── 实时读数 ── */

  const handleReadings = useCallback(
    (next: LiveReading[]) => {
      setReadings(next);
      onReadings?.(next);
    },
    [onReadings],
  );

  const handleGoalMet = useCallback(
    (metStage: GeoStage) => {
      onGoalMet?.(metStage);
      if (metStage !== "mystery") return;

      /* 谜题达成 → 用**本课真实内容**报喜。
       *
       * ⛔ 不用写死的「恭喜你！」。那句话对 8 节课全都一样，
       *    而且和当前这节课没关系。这里用本课的最后一个巩固题
       *    或本课的中文概念做收尾。
       */
      const lastTrial = trials[0];
      const zh = lastTrial
        ? `已用真实几何构造验证本课规律。${lastTrial}`
        : "已用真实几何构造验证本课规律。";
      const en = lastTrial
        ? `You have verified this lesson's rule with the real geometric construction. ${lastTrial}`
        : "You have verified this lesson's rule with the real geometric construction.";
      onSolved?.(zh, en);
    },
    [onSolved, onGoalMet, trials],
  );

  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);

  /* 切课时时清空读数——上一课的读数留在这儿就是「假数据」。 */
  useEffect(() => {
    setReadings([]);
    setError(null);
    setStatus("loading");
  }, [lesson.id]);

  /* ── 渲染 ── */

  if (!construction) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-[13px] text-[#334155]">
          {isEn
            ? "This lesson has no GeoGebra construction yet."
            : tw("这一课还没有对应的 GeoGebra 构造。")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* 顶部：唯一一套模式切换栏（画布上方）
       *
       * ⛔ 必须是**可点的按钮**，而且真的连着 ``onStageChange``。
       *
       *    之前的版本渲染的是一排 ``<div>``——既不能点，也没有
       *    任何 ``onClick``。也就是说学生**根本没法切换阶段**，
       *    「01 探索 / 02 规律 / 03 谜题」三段式形同虚设。
       *    现在改成真正的 ``<button>``，并把回调传进来。
       */}
      <div className="flex shrink-0 items-stretch gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1">
        {(["explore", "discover", "mystery"] as const).map((s, i) => {
          const active = stage === s;
          const label = GEO_STAGE_LABELS[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => onStageChange?.(s)}
              aria-pressed={active}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                active
                  ? "bg-[#0B162C] text-white"
                  : "text-[#334155] hover:bg-[#E2E8F0]",
              )}
            >
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  active ? "text-[#C59B38]" : "text-[#94A3B8]",
                )}
              >
                0{i + 1}
              </span>
              {isEn ? label.en : locale === "zh-TW" ? label.zhTW : label.zhCN}
            </button>
          );
        })}
      </div>

      {/* 引擎 */}
      <div className="relative min-h-0 flex-1">
        <GeoGebraStudio
          commands={construction.commands}
          watch={construction.watch}
          goals={construction.goals}
          stage={stage}
          onStatus={setStatus}
          onReadings={handleReadings}
          onGoalMet={handleGoalMet}
          onError={handleError}
        />

        {/* 加载 / 错误遮罩
         *
         * ⛔ 遮罩必须是 **100% 实心白**（``bg-white``），不能是
         *    半透明——半透明文字框是新宇宙明令禁止的形态。这里
         *    引擎还没渲染出来，实心白完全遮得住。
         */}
        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white">
            <div className="flex items-center gap-2 text-[12px] text-[#334155]">
              <span
                aria-busy="true"
                className="block h-4 w-4 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#1D4ED8]"
              />
              {isEn ? "Loading GeoGebra engine…" : tw("正在加载 GeoGebra 引擎…")}
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white p-6 text-center">
            <p className="text-[13px] font-semibold text-[#0F172A]">
              {isEn ? "GeoGebra engine unavailable" : tw("GeoGebra 引擎不可用")}
            </p>
            <p className="max-w-sm text-[11.5px] leading-relaxed text-[#334155]">
              {error ??
                (isEn
                  ? "Please check your network connection and refresh."
                  : tw("请检查网络连接后刷新页面。"))}
            </p>
          </div>
        ) : null}
      </div>

      {/* 底部：本课真实内容摘要 + 实时读数 */}
      <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-2">
        {/* 任务指引 —— 来自开源数据 */}
        {tasks.length > 0 ? (
          <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Task" : tw("任务指引")}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#0F172A]">
              {tasks[0]}
            </p>
          </div>
        ) : null}

        {/* 实时读数 —— 引擎真实值 */}
        <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
          <p className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
            {isEn ? "Live reading" : tw("实时读数")}
          </p>
          {readings.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {readings.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span className="min-w-0 truncate text-[#334155]">
                    {r.label}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] font-medium text-[#1D4ED8]">
                    {r.value}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11.5px] text-[#94A3B8]">
              {isEn ? "Waiting for the engine…" : tw("等待引擎就绪…")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
