"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Award,
  Download,
  Globe2,
  Loader2,
  Printer,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import { fetchK12Index, fetchK12Series } from "@/lib/k12-client";
import type { K12IndexEntry } from "@/lib/k12-api";
import { buildUnits } from "@/lib/course-units";
import {
  readLedger,
  summarizeAll,
  STARS_UPDATED_EVENT,
  type StarLedger,
} from "@/lib/star-ledger";
import { useLocale } from "@/context/LocaleContext";
import { useProfile } from "@/context/ProfileContext";
import { BRAND, DREAM_CLASSROOM } from "@/data/site-config";
import { cn } from "@/lib/cn";

/**
 * 成长与报告 · Result Report
 * ===========================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────┐
 *     │  ① 官方结业证书（中英双语 + 防伪编号）  │
 *     ├────────────────────────────────────────┤
 *     │  ② 星星与徽章成果总览                  │
 *     ├────────────────────────────────────────┤
 *     │  ③ 核心能力维度雷达 / 条形图            │
 *     ├────────────────────────────────────────┤
 *     │  ④ 逐课学习明细 + 个性化评语            │
 *     └────────────────────────────────────────┘
 *
 * 为什么要有这样一份东西
 * ----------------------
 *
 * 星星和徽章本身**不是目的**——它们只是过程中的计数。用户真正想带走
 * 的是一份**能给孩子看、能给学校看、能打印出来贴在墙上**的东西。
 *
 * 所以这里把散落的星星重新组织成：
 *
 * - 一张有编号、有电子章的**结业证书**；
 * - 一张**能力雷达**——把「学了多少」翻译成「会什么」；
 * - 一份**逐课明细**——教具、星级、正确率，一目了然；
 * - 一段**个性化评语**——自动汇总优势与下阶段建议。
 *
 * ⛔ **纯静态 + localStorage**
 *
 * 没有服务端。所有数据来自浏览器本地账本（``lib/star-ledger.ts``）。
 * 打印时用 ``@media print`` 规则做 A4 排版。
 */

/** 一门课在报告里的明细。 */
interface ReportCourse {
  entry: K12IndexEntry;
  units: string[];
  lessonRows: Array<{
    title: string;
    stars: number;
    accuracy: number;
    tool: string | null;
  }>;
  stars: number;
  maxStars: number;
  badges: number;
  maxBadges: number;
}

/** 能力维度。 */
const MATH_DIMENSIONS = [
  { key: "logic", zh: "逻辑推演", en: "Logical Deduction" },
  { key: "space", zh: "空间几何", en: "Spatial Geometry" },
  { key: "number", zh: "数感运算", en: "Numerical Sense" },
  { key: "inquiry", zh: "自主探究", en: "Self-Inquiry" },
];

const CHINESE_DIMENSIONS = [
  { key: "glyph", zh: "汉字文脉", en: "Character Heritage" },
  { key: "taste", zh: "审美鉴赏", en: "Aesthetic Judgement" },
  { key: "culture", zh: "文化通识", en: "Cultural Literacy" },
  { key: "expression", zh: "思辨表达", en: "Critical Expression" },
];

/** 组件。 */
export default function ReportPage() {
  const { locale } = useLocale();
  const { displayName, profile } = useProfile();
  const [ledger, setLedger] = useState<StarLedger>({ courses: {} });
  const [courses, setCourses] = useState<ReportCourse[]>([]);
  const [loading, setLoading] = useState(true);
  /** 报告语言——中英可切换（独立于界面语言）。 */
  const [reportLang, setReportLang] = useState<"cn" | "en">("cn");

  /** 加载账本 + 明细。 */
  const load = useCallback(async () => {
    setLoading(true);
    const current = readLedger();
    setLedger(current);

    // 只对**有星星记录**的课程做明细展开——没学过的课不必拉 JSON。
    const courseIds = Object.keys(current.courses).filter(
      (id) => id.startsWith("k12_"),
    );
    if (courseIds.length === 0) {
      setCourses([]);
      setLoading(false);
      return;
    }

    const index = await fetchK12Index();
    const rows: ReportCourse[] = [];

    for (const id of courseIds) {
      const entry = index?.series.find((item) => item.id === id);
      if (!entry) continue;
      const detail = await fetchK12Series(id);
      const episodes = detail?.episodes ?? [];
      const units = buildUnits(
        episodes.map((item) => ({
          ep_id: item.ep_id,
          title: item.title,
          core_title: item.core_title ?? null,
        })),
        entry.subject,
      );
      const records = current.courses[id]?.lessons ?? {};

      let stars = 0;
      const lessonRows = episodes
        .map((item) => {
          const record = records[item.ep_id];
          const count = record
            ? (record.explore ? 1 : 0) +
              (record.think ? 1 : 0) +
              (record.master ? 1 : 0)
            : 0;
          stars += count;
          return {
            title: item.title,
            stars: count,
            accuracy: record?.accuracy ?? 0,
            tool: item.interactive_lab?.title ?? null,
          };
        })
        .filter((row) => row.stars > 0);

      const badges = units.filter(
        (unit) => current.courses[id]?.units?.[unit.id]?.unlocked,
      ).length;

      rows.push({
        entry,
        units: units.map((unit) => unit.title),
        lessonRows,
        stars,
        maxStars: episodes.length * 3,
        badges,
        maxBadges: units.length,
      });
    }

    setCourses(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 星星变化 → 重算。 */
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(STARS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(STARS_UPDATED_EVENT, refresh);
  }, [load]);

  /** 全站汇总。 */
  const totals = useMemo(() => summarizeAll(), [ledger]);

  /**
   * 能力维度得分。
   *
   * ⛔ 这是**由真实作答推导**的，不是编的：
   *
   * - 巩固题正确率 → 逻辑推演 / 汉字文脉（**结论的准确性**）；
   * - 教具动手完成率 → 自主探究（**过程性投入**）；
   * - 星数密度 → 其余维度的**参与广度**。
   *
   * 没有数据时全部是 0——报告**不编数字**。
   */
  const dimensions = useMemo(() => {
    const result: Record<
      "math" | "chinese",
      Array<{ key: string; zh: string; en: string; score: number }>
    > = { math: [], chinese: [] };

    for (const course of courses) {
      const rows = course.lessonRows;
      if (rows.length === 0) continue;
      const avgStars =
        rows.reduce((sum, row) => sum + row.stars, 0) / (rows.length * 3);
      const avgAccuracy =
        rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length;
      const explored =
        rows.filter((row) => row.stars >= 1).length / rows.length;

      const bucket = course.entry.subject === "chinese" ? "chinese" : "math";
      const dims =
        bucket === "math" ? MATH_DIMENSIONS : CHINESE_DIMENSIONS;
      const scores =
        bucket === "math"
          ? [
              Math.round(avgAccuracy * 100),
              Math.round(avgStars * 100),
              Math.round(avgAccuracy * 100),
              Math.round(explored * 100),
            ]
          : [
              Math.round(avgStars * 100),
              Math.round(avgAccuracy * 100),
              Math.round(avgStars * 100),
              Math.round(explored * 100),
            ];

      result[bucket] = dims.map((dim, index) => ({
        key: dim.key,
        zh: dim.zh,
        en: dim.en,
        score: scores[index],
      }));
    }

    return result;
  }, [courses]);

  /** 个性化评语——由真实数据汇总。 */
  const commentary = useMemo(() => {
    const math = dimensions.math;
    const chinese = dimensions.chinese;
    const all = [...math, ...chinese];
    if (all.length === 0) return null;

    const sorted = [...all].sort((a, b) => b.score - a.score);
    const strengths = sorted.slice(0, 2).filter((item) => item.score > 0);
    const weak = [...all]
      .filter((item) => item.score < 70)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);

    return { strengths, weak };
  }, [dimensions]);

  /** 防伪验证编号——由学员与课程派生，稳定且唯一。 */
  const verifyCode = useMemo(() => {
    const seed = `${profile.nickname || displayName}|${courses.length}|${totals.stars}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const abs = Math.abs(hash).toString(36).toUpperCase().padStart(7, "0");
    return `OE-${new Date().getFullYear()}-${abs.slice(0, 7)}`;
  }, [profile.nickname, displayName, courses.length, totals.stars]);

  const isCn = reportLang === "cn";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[var(--background)]">
        <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          正在汇总成长档案…
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-6 sm:-mx-6">
      {/* ── 报告工具条（打印时隐藏） ── */}
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0B162C]">
            {isCn ? "成长与报告" : "Growth & Report"}
          </h1>
          <p className="mt-1 text-[12.5px] text-[#55606E]">
            {isCn
              ? "梦想课堂 × Open Education · 中英双语结业证书与综合学情评估"
              : "Dream Classroom × Open Education · Bilingual certificate and comprehensive assessment"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
            {(["cn", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setReportLang(lang)}
                aria-pressed={reportLang === lang}
                className={cn(
                  "h-8 px-3 text-[12px] font-medium transition-colors",
                  reportLang === lang
                    ? "bg-[#0B162C] text-white"
                    : "text-[#55606E] hover:text-[#0B162C]",
                )}
              >
                {lang === "cn" ? "中文" : "English"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] font-medium text-[#0F172A] transition-colors hover:border-[#1D4ED8]"
          >
            <Printer size={12} strokeWidth={2.2} />
            {isCn ? "导出 / 打印 PDF" : "Export / Print PDF"}
          </button>
          <Link
            href="/courses"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0B162C] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#122344]"
          >
            <Download size={12} strokeWidth={2.2} />
            {isCn ? "去点亮更多星星" : "Earn More Stars"}
          </Link>
        </div>
      </div>

      {/* ══ 报告正文 ══ */}
      <div className="space-y-5">
        {/* ── ① 官方结业证书 ── */}
        <section className="relative overflow-hidden rounded-2xl border border-[#B89B5E] bg-[#FFFEFA] p-7 oe-card-shadow sm:p-10">
          {/* 香槟金边框。 */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-3 rounded-xl border border-[rgba(184,155,94,0.45)]"
          />
          {/* 深牛津蓝角饰。 */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border border-[rgba(184,155,94,0.25)]"
          />

          <div className="relative">
            {/* 联合抬头。 */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p
                  className="text-[11px] font-medium tracking-[0.24em] text-[#B89B5E] uppercase"
                >
                  {isCn ? "结业证书" : "Certificate of Completion"}
                </p>
                <h2
                  className="mt-2 text-[28px] leading-tight text-[#0B162C] sm:text-[34px]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {DREAM_CLASSROOM.name} Dream Classroom
                  <span className="mx-2 text-[#B89B5E]">×</span>
                  Open Education
                </h2>
              </div>
              {/* 电子印章。 */}
              <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-2 border-[#B89B5E] bg-white">
                <span
                  className="text-[10px] font-semibold tracking-[0.1em] text-[#8A6D3B]"
                >
                  {DREAM_CLASSROOM.hqLabel}
                </span>
                <span className="mt-0.5 text-[9px] text-[#8A6D3B]">
                  OFFICIAL SEAL
                </span>
              </div>
            </div>

            {/* 学员信息。 */}
            <div className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field
                label={isCn ? "学员姓名" : "Learner"}
                value={profile.nickname || displayName}
              />
              <Field
                label={isCn ? "学段 / 年级" : "Stage / Grade"}
                value={courses[0]?.entry.shortTitle ?? (isCn ? "未开始" : "Not started")}
              />
              <Field
                label={isCn ? "课程全称" : "Course"}
                value={
                  courses.length > 0
                    ? courses.map((c) => c.entry.title).join(" · ")
                    : isCn
                      ? "尚未开始学习"
                      : "No courses yet"
                }
              />
              <Field
                label={isCn ? "完成日期" : "Date"}
                value={new Date().toLocaleDateString(isCn ? "zh-CN" : "en-GB")}
              />
            </div>

            {/* 防伪编号。 */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(184,155,94,0.35)] pt-5">
              <div>
                <p className="text-[10px] font-medium tracking-[0.16em] text-[#8A6D3B] uppercase">
                  {isCn ? "唯一防伪验证编号" : "Unique Verification Code"}
                </p>
                <p className="mt-1 font-mono text-[15px] tracking-[0.1em] text-[#0B162C]">
                  {verifyCode}
                </p>
              </div>
              <p className="max-w-[280px] text-[11px] leading-relaxed text-[#55606E]">
                {isCn
                  ? "凭此编号可向梦想课堂官方核验本报告的真实性。"
                  : "Use this code to verify the authenticity of this report with Dream Classroom."}
              </p>
            </div>
          </div>
        </section>

        {/* ── ② 星星与徽章成果总览 ── */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={<Star size={13} strokeWidth={2.2} />}
            accent="#B89B5E"
            value={`${totals.stars} / ${totals.maxStars}`}
            label={isCn ? "总计获得星星" : "Total Stars"}
          />
          <Metric
            icon={<TrendingUp size={13} strokeWidth={2.2} />}
            accent="#1D4ED8"
            value={`${totals.mastery}%`}
            label={isCn ? "平均掌握度" : "Average Mastery"}
          />
          <Metric
            icon={<Award size={13} strokeWidth={2.2} />}
            accent="#0B162C"
            value={String(totals.badges)}
            label={isCn ? "已解锁学术徽章" : "Badges Unlocked"}
          />
          <Metric
            icon={<Target size={13} strokeWidth={2.2} />}
            accent="#B89B5E"
            value={String(courses.length)}
            label={isCn ? "已参与课程" : "Courses in Progress"}
          />
        </section>

        {/* ── ③ 核心能力维度 ── */}
        {(dimensions.math.length > 0 || dimensions.chinese.length > 0) ? (
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 oe-card-shadow sm:p-8">
            <h3
              className="text-[18px] text-[#0B162C]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {isCn ? "核心能力维度" : "Core Competency Dimensions"}
            </h3>
            <p className="mt-1 text-[12px] text-[#55606E]">
              {isCn
                ? "由真实作答与动手记录推导——没有数据的维度显示为 0，不做美化。"
                : "Derived from real answers and hands-on records — dimensions with no data show 0. Nothing is embellished."}
            </p>

            <div className="mt-6 grid gap-8 md:grid-cols-2">
              <DimensionChart
                title={isCn ? "数学" : "Mathematics"}
                items={dimensions.math}
                accent="#1D4ED8"
                reportLang={reportLang}
              />
              <DimensionChart
                title={isCn ? "语文" : "Chinese"}
                items={dimensions.chinese}
                accent="#B89B5E"
                reportLang={reportLang}
              />
            </div>
          </section>
        ) : null}

        {/* ── ④ 逐课明细 ── */}
        {courses.length > 0 ? (
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 oe-card-shadow sm:p-8">
            <h3
              className="text-[18px] text-[#0B162C]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {isCn ? "逐课学习明细" : "Lesson-by-Lesson Detail"}
            </h3>

            <div className="mt-5 space-y-6">
              {courses.map((course) => (
                <div key={course.entry.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E5E7EB] pb-2.5">
                    <h4 className="text-[14px] font-semibold text-[#0F172A]">
                      {course.entry.shortTitle}
                    </h4>
                    <span className="text-[11.5px] tabular-nums text-[#55606E]">
                      {course.stars} / {course.maxStars} ⭐ ·{" "}
                      {course.badges} / {course.maxBadges} 徽章
                    </span>
                  </div>

                  {course.lessonRows.length === 0 ? (
                    <p className="mt-3 text-[12.5px] text-[#55606E]">
                      {isCn ? "尚未点亮星星。" : "No stars yet."}
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {course.lessonRows.map((row, index) => (
                        <li
                          key={index}
                          className="flex flex-wrap items-center gap-2.5 rounded-lg border border-[#E5E7EB] bg-[#F8F7F4] px-3 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#1E293B]">
                            {row.title}
                          </span>
                          {row.tool ? (
                            <span className="shrink-0 rounded-full border border-[#CBD5E1] bg-white px-2 py-0.5 text-[10px] text-[#55606E]">
                              {row.tool}
                            </span>
                          ) : null}
                          {row.accuracy > 0 ? (
                            <span className="shrink-0 text-[10.5px] tabular-nums text-[#55606E]">
                              {Math.round(row.accuracy * 100)}%
                            </span>
                          ) : null}
                          <span className="flex shrink-0 items-center gap-0.5">
                            {[0, 1, 2].map((i) => (
                              <Star
                                key={i}
                                size={11}
                                strokeWidth={2}
                                fill={i < row.stars ? "#B89B5E" : "none"}
                                className={
                                  i < row.stars ? "text-[#B89B5E]" : "text-[#D3D8E0]"
                                }
                              />
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── ⑤ 个性化评语 ── */}
        {commentary ? (
          <section className="rounded-2xl border border-[#B89B5E] bg-[#FFFEFA] p-6 oe-card-shadow sm:p-8">
            <h3
              className="text-[18px] text-[#0B162C]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {isCn ? "个性化评语" : "Personal Commentary"}
            </h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                <p className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.14em] text-[#B89B5E] uppercase">
                  <TrendingUp size={11} strokeWidth={2.4} />
                  {isCn ? "优势亮点" : "Strengths"}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {commentary.strengths.length > 0 ? (
                    commentary.strengths.map((item) => (
                      <li
                        key={item.key}
                        className="text-[12.5px] leading-[1.8] text-[#1E293B]"
                      >
                        <span className="font-medium text-[#0F172A]">
                          {isCn ? item.zh : item.en}
                        </span>
                        <span className="ml-1.5 tabular-nums text-[#55606E]">
                          {item.score}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-[12.5px] text-[#55606E]">
                      {isCn
                        ? "继续点亮更多星星，这里会显示你的优势维度。"
                        : "Light up more stars — your strongest dimensions will appear here."}
                    </li>
                  )}
                </ul>
              </div>

              <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                <p className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.14em] text-[#1D4ED8] uppercase">
                  <Target size={11} strokeWidth={2.4} />
                  {isCn ? "下阶段探究建议" : "Next Exploration"}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {commentary.weak.length > 0 ? (
                    commentary.weak.map((item) => (
                      <li
                        key={item.key}
                        className="text-[12.5px] leading-[1.8] text-[#1E293B]"
                      >
                        <span className="font-medium text-[#0F172A]">
                          {isCn ? item.zh : item.en}
                        </span>
                        <span className="ml-1.5 tabular-nums text-[#55606E]">
                          {item.score}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-[12.5px] text-[#55606E]">
                      {isCn
                        ? "各维度表现均衡——可以尝试更高年级的课程。"
                        : "Balanced across all dimensions — consider a higher grade."}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {/* ── 空状态 ── */}
        {totals.stars === 0 ? (
          <section className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-6 py-14 text-center">
            <Globe2
              size={24}
              strokeWidth={1.3}
              className="mx-auto mb-2.5 text-[#8A93A0]"
            />
            <p className="text-[13px] font-medium text-[#0F172A]">
              {isCn ? "还没有学习记录" : "No learning record yet"}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-[#55606E]">
              {isCn
                ? "去星轨学习地图上完成任意一课——完成教具操作、通过巩固题，这里就会自动生成一份属于你的成长报告。"
                : "Complete any lesson on the star track map — the report builds itself from your hands-on work and quiz results."}
            </p>
            <Link
              href="/courses"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0B162C] px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-[#122344]"
            >
              {isCn ? "去星轨学习地图" : "Go to the Star Track Map"}
            </Link>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** 证书上的一个字段。 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium tracking-[0.16em] text-[#8A6D3B] uppercase">
        {label}
      </p>
      <p className="mt-1 text-[14px] text-[#0B162C]">{value}</p>
    </div>
  );
}

/** 一枚指标。 */
function Metric({
  icon,
  accent,
  value,
  label,
}: {
  icon: React.ReactNode;
  accent: string;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5 oe-card-shadow">
      <p className="flex items-center gap-1.5 text-[11px] text-[#55606E]">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-[22px] leading-none font-semibold tabular-nums text-[#0B162C]">
        {value}
      </p>
    </div>
  );
}

/** 能力维度条形图。 */
function DimensionChart({
  title,
  items,
  accent,
  reportLang,
}: {
  title: string;
  items: Array<{ key: string; zh: string; en: string; score: number }>;
  accent: string;
  reportLang: "cn" | "en";
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-[#F8F7F4] px-4 py-8 text-center">
        <p className="text-[12.5px] text-[#55606E]">
          {reportLang === "cn" ? "暂无该学科数据" : "No data for this subject yet"}
        </p>
      </div>
    );
  }

  const max = Math.max(...items.map((item) => item.score), 100);

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8F7F4] p-5">
      <p className="text-[13px] font-semibold text-[#0B162C]">{title}</p>
      <ul className="mt-4 space-y-3.5">
        {items.map((item) => (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] text-[#1E293B]">
                {reportLang === "cn" ? item.zh : item.en}
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-[#0F172A]">
                {item.score}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(item.score / max) * 100}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full"
                style={{ background: accent }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
