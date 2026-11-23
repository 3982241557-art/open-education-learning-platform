"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  BookOpen,
  Calculator,
  Check,
  Compass,
  Copy,
  Globe2,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import HomeMicroDemo from "@/components/home/HomeMicroDemo";
import LearningPathDiagram from "@/components/home/LearningPathDiagram";
import AdvantageCardStack from "@/components/home/AdvantageCardStack";
import PaperPlaneIntro from "@/components/home/PaperPlaneIntro";
import { useLocale } from "@/context/LocaleContext";
import { HQ_LABEL, PLATFORM_NAME_EN } from "@/lib/branding";
import { cn } from "@/lib/cn";
import {
  BRAND,
  CONTACT_EMAIL,
  DREAM_CLASSROOM,
  QR_CODE_IMAGE,
  WECHAT_ID,
  hasContactEmail,
  hasQrCode,
  hasWechat,
} from "@/data/site-config";
import {
  ABOUT,
  DUAL_ENGINE,
  GLOBAL_VIEW,
  HERO_CTA,
  HQ_SPACE,
  JOIN,
  LEARNING_LOOP,
  PILLARS,
  WHY_OE,
  pick,
} from "@/data/home-editorial";

/**
 * 首页 · 品牌叙事
 * ==============
 *
 * 六层错落递进的编辑型版面。
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────┐
 *     │  01 Hero（品牌全称 + 宣言 | 优势卡栈）  │
 *     ├──────────────────────────────────────┤
 *     │  02 为什么是 OE（图左 / 文右）        │
 *     ├──────────────────────────────────────┤
 *     │  03 双引擎体验（文左 / 互动卡右）      │
 *     ├──────────────────────────────────────┤
 *     │  04 学习闭环（四步错落）             │
 *     ├──────────────────────────────────────┤
 *     │  05 梦想课堂专栏（板块 A/B/C）        │
 *     ├──────────────────────────────────────┤
 *     │  06 加入我们（双通道 + 联系槽位）      │
 *     └──────────────────────────────────────┘
 *
 * ⛔ **不裁切、不空壳**
 *
 * 旧版首页下半屏曾经出现大片空白——原因是外层容器带
 * ``h-screen`` + ``overflow-hidden``，内容被裁在一屏之内。
 * 现在整页**自然流式**，向下滚动即可看到全部内容。
 */

/** 滚动渐显的通用动效。 */
const FADE_UP = {
  hidden: { opacity: 0, y: 26 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.62, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export default function EditorialHome() {
  const { locale } = useLocale();
  const [introDone, setIntroDone] = useState(false);

  return (
    <div className="-mx-4 -my-6 sm:-mx-6">
      {/* ── 纸飞机启动动效 ──
       *
       * 覆盖在整页之上，画布色与页面同色——**无缝衔接，不闪烁**。
       * ⛔ 内部有 2.1s 硬兜底定时器，**绝不可能卡死**。
       */}
      <PaperPlaneIntro onDone={() => setIntroDone(true)} />

      {/* ════════════════════════════════════════════════════════════
         第一层 · Hero 品牌首屏（左全称宣言 / 右优势卡栈）
         ════════════════════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1280px] px-5 pt-12 pb-20 sm:px-8 sm:pt-16 sm:pb-24">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-16">
          {/* 左：品牌全称 + 宣言。 */}
          <motion.div initial="hidden" animate="visible" variants={FADE_UP}>
            {/* 顶部极细铭牌。 */}
            <div className="mb-7 flex flex-wrap items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-[#B89B5E]"
              />
              <span className="text-xs tracking-[0.16em] text-slate-500">
                OE · {DREAM_CLASSROOM.name}
                （{DREAM_CLASSROOM.hqLabel}）
              </span>
            </div>

            {/* 绝对视觉主角 · 平台中英文全称。 */}
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[17px] font-semibold tracking-tight text-[#0B162C] oe-card-shadow"
              >
                OE
              </span>
              <h1 className="text-5xl font-semibold tracking-tight text-[#0B162C] lg:text-6xl">
                Open Education
              </h1>
            </div>

            <h2
              className="mt-5 text-2xl font-medium tracking-[0.14em] text-[#122344] lg:text-3xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              开放教育学习平台
            </h2>

            {/* 中间香槟金分割细线。 */}
            <span
              aria-hidden
              className="mt-5 block h-[2px] w-12 bg-[#B89B5E]"
            />

            {/* 核心品牌宣言。 */}
            <p
              className="mt-6 text-xl leading-relaxed text-[#0F172A] lg:text-2xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {BRAND.slogan}
            </p>

            {/* 固定副标题。 */}
            <p className="mt-3 text-sm tracking-wide text-slate-500 lg:text-base">
              {BRAND.subtitle}
            </p>

            {/* 行动按钮行。 */}
            <div className="mt-9 flex flex-wrap items-center gap-2.5">
              <Link
                href="/courses"
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#0B162C] px-6 text-[13.5px] font-medium text-white transition-colors hover:bg-[#122344]"
              >
                {pick(HERO_CTA.primary, locale)}
                <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
              <Link
                href="/report"
                className="inline-flex h-11 items-center rounded-full border border-[#CBD5E1] bg-white px-6 text-[13.5px] font-medium text-[#0F172A] transition-colors hover:border-[#1D4ED8]"
              >
                {pick(HERO_CTA.secondary, locale)}
              </Link>
            </div>

            {/* 关键数据标尺。 */}
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[#E5E7EB] pt-7 sm:grid-cols-4">
              {[
                { value: "12", label: "个年级" },
                { value: "2", label: "大核心学科" },
                { value: "同步", label: "权威教材版本" },
                { value: "认证", label: "结业修习证书" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dd
                    className="text-[24px] leading-none font-semibold text-[#0B162C]"
                  >
                    {stat.value}
                  </dd>
                  <dt className="mt-1.5 text-[11px] text-[#55606E]">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* 右：可点击逐张轮换的优势叠加卡栈。 */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 },
              },
            }}
            className="pt-6 lg:pt-0"
          >
            <AdvantageCardStack />
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
         第二层 · 左图右文（为什么是 OE？）
         ════════════════════════════════════════════════════════════ */}
      <section className="border-y border-[var(--border)] bg-white">
        <div className="mx-auto grid w-full max-w-[1280px] items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] lg:gap-16">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={FADE_UP}
            className="order-2 lg:order-1"
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">01</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              {pick(WHY_OE.kicker, locale)}
            </p>
            <h2
              className="mt-4 max-w-xl text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[34px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {pick(WHY_OE.title, locale)}
            </h2>
            <div className="mt-6 space-y-5">
              {WHY_OE.pillars.map((pillar) => (
                <div key={pillar.title.zh} className="flex gap-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#FFFEFA] text-[#B89B5E]">
                    <Sparkles size={14} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[14.5px] font-semibold text-[#0F172A]">
                      {pick(pillar.title, locale)}
                    </h3>
                    <p className="mt-1 text-[13px] leading-[1.85] text-[#55606E]">
                      {pick(pillar.body, locale)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={FADE_UP}
            className="order-1 lg:order-2"
          >
            <div className="rounded-2xl border border-[var(--border)] bg-[#FFFEFA] p-6 oe-card-shadow sm:p-8">
              <LearningPathDiagram className="w-full" />
              <p className="mt-4 border-t border-[rgba(184,155,94,0.28)] pt-4 text-[12px] leading-[1.8] text-[#55606E]">
                {locale === "en"
                  ? "What the platform does is reconnect this broken road: on the left, the child's real grade and learning state; on the right, the real progress of the classroom at home — and every lesson in between maps to a specific textbook unit."
                  : "平台做的事，就是把这条断掉的路接上：左边是孩子的真实年级与学情，右边是国内课堂的真实进度——中间的每一讲，都有明确的教材单元对应。"}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
         第三层 · 右图左文（语文与数学双引擎体验）
         ════════════════════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1280px] px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={FADE_UP}
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">02</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              {pick(DUAL_ENGINE.kicker, locale)}
            </p>
            <h2
              className="mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[34px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {pick(DUAL_ENGINE.title, locale)}
            </h2>
            <p className="mt-5 max-w-lg text-[14px] leading-[1.9] text-[#55606E]">
              {pick(DUAL_ENGINE.body, locale)}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[#FFFEFA] p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B162C] text-white">
                  <BookOpen size={15} strokeWidth={1.8} />
                </span>
                <h3
                  className="mt-3 text-[16px] text-[#0B162C]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {pick(DUAL_ENGINE.chinese.title, locale)}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.8] text-[#55606E]">
                  {pick(DUAL_ENGINE.chinese.body, locale)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1D4ED8] text-white">
                  <Calculator size={15} strokeWidth={1.8} />
                </span>
                <h3 className="mt-3 text-[16px] font-semibold text-[#0F172A]">
                  {pick(DUAL_ENGINE.math.title, locale)}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.8] text-[#55606E]">
                  {pick(DUAL_ENGINE.math.body, locale)}
                </p>
              </div>
            </div>
          </motion.div>

          {/* 右：可直接玩的微型体验卡。 */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={FADE_UP}
          >
            <HomeMicroDemo />
            <p className="mt-3 text-center text-[11.5px] text-[#55606E]">
              ↑ 这就是平台上的真实互动模块。不用注册，直接上手。
            </p>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
         第四层 · 错落四步学习闭环
         ════════════════════════════════════════════════════════════ */}
      <section className="border-y border-[var(--border)] bg-white">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-16 sm:px-8 sm:py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={FADE_UP}
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">03</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              {pick(LEARNING_LOOP.kicker, locale)}
            </p>
            <h2
              className="mt-4 max-w-2xl text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[34px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {pick(LEARNING_LOOP.title, locale)}
            </h2>
          </motion.div>

          {/* 高低错落——不是四张等高的表格。 */}
          <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LEARNING_LOOP.steps.map((step, index) => (
              <motion.article
                key={step.no}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                variants={{
                  hidden: { opacity: 0, y: 22 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.55,
                      ease: [0.16, 1, 0.3, 1],
                      delay: index * 0.09,
                    },
                  },
                }}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-5 oe-card-shadow",
                  step.tall ? "lg:mt-8" : "",
                )}
              >
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: step.accent }}
                />
                <span
                  className="text-[26px] leading-none font-semibold tabular-nums"
                  style={{ color: step.accent }}
                >
                  {step.no}
                </span>
                <h3
                  className="mt-3 text-[15.5px] font-semibold leading-snug text-[#0F172A]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {pick(step.title, locale)}
                </h3>
                <p className="mt-2 text-[12.5px] leading-[1.85] text-[#55606E]">
                  {pick(step.body, locale)}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
         第五层 · 梦想课堂专栏（错落叙事）
         ════════════════════════════════════════════════════════════ */}
      <DreamClassroomSection />

      {/* ════════════════════════════════════════════════════════════
         第六层 · 加入我们（双通道 + 联系槽位）
         ════════════════════════════════════════════════════════════ */}
      <JoinSection />

      {/* ── 底部收尾 ── */}
      <footer className="border-t border-[var(--border)] bg-[#0B162C]">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="text-[15px] font-semibold text-white">
              OE · Open Education
            </p>
            <p className="mt-1 text-[11.5px] text-white/55">
              开放教育学习平台 · {HQ_LABEL} · {PLATFORM_NAME_EN}
            </p>
          </div>
          <nav className="flex flex-wrap gap-4">
            {[
              { href: "/courses", label: "课程" },
              { href: "/plan", label: "计划" },
              { href: "/report", label: "成长与报告" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[12.5px] text-white/70 transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 第五层 · 梦想课堂错落叙事专栏
 * ────────────────────────────────────────────────────────────────── */

function DreamClassroomSection() {
  const { locale } = useLocale();

  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)]">
      {/* ── 板块 A · 关于我们 & 核心理念（左文右碑文） ── */}
      <section className="bg-white">
        <div className="mx-auto grid w-full max-w-[1280px] items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-16">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={FADE_UP}
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">04</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              {pick(ABOUT.kicker, locale)}
            </p>
            <h2
              className="mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[32px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {pick(ABOUT.title, locale)}
            </h2>
            <div className="mt-5 space-y-4">
              {ABOUT.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.zh}
                  className="text-[14px] leading-[1.95] text-[#1E293B]"
                >
                  {pick(paragraph, locale)}
                </p>
              ))}
            </div>
          </motion.div>

          {/* 核心理念 · 深午夜牛津蓝碑文卡。 */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={FADE_UP}
          >
            <div className="relative overflow-hidden rounded-2xl bg-[#0B162C] p-7 oe-card-shadow sm:p-9">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-3 rounded-xl border border-[rgba(184,155,94,0.38)]"
              />
              <Award size={20} strokeWidth={1.5} className="text-[#B89B5E]" />
              <p
                className="mt-5 text-[17px] leading-[1.85] text-white"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {pick(ABOUT.creedTitle, locale)}
              </p>
              <p
                className="mt-3 text-[20px] leading-[1.7] font-semibold text-[#D8C49A] sm:text-[23px]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {pick(ABOUT.creedFormula, locale)}
              </p>
              <div className="mt-6 h-px w-full bg-[rgba(184,155,94,0.3)]" />
              <p
                className="mt-5 text-[13.5px] leading-[1.9] text-white/75 italic"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                「{pick(ABOUT.creedQuote, locale)}」
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 板块 B · 三大方法论支柱（三列精装卡片） ── */}
      <section>
        <div className="mx-auto w-full max-w-[1280px] px-5 py-16 sm:px-8 sm:py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={FADE_UP}
            className="max-w-2xl"
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">05</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              方法论
            </p>
            <h2
              className="mt-4 text-[26px] leading-[1.35] tracking-[-0.015em] text-[#0B162C] sm:text-[31px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              三大支柱，撑起一套完整的教育观。
            </h2>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PILLARS.map((pillar, index) => (
              <motion.article
                key={pillar.no}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                variants={{
                  hidden: { opacity: 0, y: 22 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.55,
                      ease: [0.16, 1, 0.3, 1],
                      delay: index * 0.09,
                    },
                  },
                }}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-6 oe-card-shadow"
              >
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px] bg-[#0B162C]"
                />
                <span className="text-[26px] leading-none font-semibold tabular-nums text-[#B89B5E]">
                  {pillar.no}
                </span>
                <h3
                  className="mt-3 text-[18px] text-[#0B162C]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {pick(pillar.title, locale)}
                </h3>
                <p className="mt-1 text-[11px] tracking-[0.12em] text-[#8A93A0] uppercase">
                  {pillar.titleEn}
                </p>
                <p className="mt-3 text-[13px] leading-[1.9] text-[#55606E]">
                  {pick(pillar.body, locale)}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 板块 C · 国际视野 & 总部空间（左右错落双栏） ── */}
      <section className="bg-white">
        <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-8">
          {/* 国际视野——略高。 */}
          <motion.article
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={FADE_UP}
            className="flex flex-col rounded-2xl border border-[var(--border)] bg-[#FFFEFA] p-7 oe-card-shadow sm:p-8"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0B162C] text-white">
              <Globe2 size={16} strokeWidth={1.8} />
            </span>
            <h3
              className="mt-4 text-[21px] text-[#0B162C]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {pick(GLOBAL_VIEW.title, locale)}
            </h3>
            <div className="mt-3 space-y-3">
              {GLOBAL_VIEW.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.zh}
                  className="text-[13.5px] leading-[1.95] text-[#1E293B]"
                >
                  {pick(paragraph, locale)}
                </p>
              ))}
            </div>
            <div className="mt-auto pt-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(184,155,94,0.45)] bg-white px-3 py-1.5 text-[11.5px] text-[#0B162C]">
                <Sparkles size={11} strokeWidth={2.4} className="text-[#B89B5E]" />
                {pick(GLOBAL_VIEW.partner, locale)}
              </span>
            </div>
          </motion.article>

          {/* 总部空间——略低，形成错落。 */}
          <motion.article
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={FADE_UP}
            className="flex flex-col rounded-2xl border border-[var(--border)] bg-white p-7 oe-card-shadow sm:p-8 lg:mt-10"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1D4ED8] text-white">
              <Compass size={16} strokeWidth={1.8} />
            </span>
            <h3
              className="mt-4 text-[21px] text-[#0B162C]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {pick(HQ_SPACE.title, locale)}
            </h3>
            <p className="mt-3 text-[13.5px] leading-[1.95] text-[#1E293B]">
              {pick(HQ_SPACE.body, locale)}
            </p>
            <ul className="mt-5 space-y-1.5">
              {HQ_SPACE.items.map((item) => (
                <li
                  key={item.zh}
                  className="flex items-center gap-2 text-[12.5px] text-[#55606E]"
                >
                  <Check
                    size={12}
                    strokeWidth={2.6}
                    className="shrink-0 text-[#B89B5E]"
                  />
                  {pick(item, locale)}
                </li>
              ))}
            </ul>
          </motion.article>
        </div>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * 第六层 · 加入我们（双通道 + 联系槽位）
 * ────────────────────────────────────────────────────────────────── */

function JoinSection() {
  const { locale } = useLocale();

  return (
    <section className="border-t border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto w-full max-w-[1280px] px-5 py-16 sm:px-8 sm:py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={FADE_UP}
          className="max-w-2xl"
        >
          <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
            <span className="tabular-nums">06</span>
            <span className="h-px w-7 bg-[#B89B5E]/50" />
            {pick(JOIN.title, locale)}
          </p>
          <h2
            className="mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[33px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {pick(JOIN.subtitle, locale)}
          </h2>
        </motion.div>

        {/* 双通道。 */}
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {JOIN.channels.map((channel, index) => (
            <motion.article
              key={channel.id}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={{
                hidden: { opacity: 0, y: 22 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: 0.55,
                    ease: [0.16, 1, 0.3, 1],
                    delay: index * 0.09,
                  },
                },
              }}
              className="flex flex-col rounded-2xl border border-[var(--border)] bg-white p-7 oe-card-shadow"
            >
              <span className="text-[11px] font-medium tracking-[0.18em] text-[#B89B5E] uppercase">
                {pick(channel.kicker, locale)}
              </span>
              <h3
                className="mt-2 text-[20px] text-[#0B162C]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {pick(channel.title, locale)}
              </h3>
              <p className="mt-3 text-[13.5px] leading-[1.95] text-[#1E293B]">
                {pick(channel.body, locale)}
              </p>
            </motion.article>
          ))}
        </div>

        {/* 联系槽位。 */}
        <ContactSlot />
      </div>
    </section>
  );
}

/**
 * 官方合作邮箱 + 二维码展示框。
 *
 * ⚠️ 两个槽位都支持「未配置」状态——此时显示**优雅的虚线预留框**，
 *    而不是空白或 null。配置好后（见 ``data/site-config.ts``），
 *    页面自动切换成可复制邮箱 + 真实二维码。
 */
function ContactSlot() {
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);

  /** 复制邮箱到剪贴板。 */
  const copyEmail = async () => {
    if (!hasContactEmail()) return;
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 剪贴板不可用——忽略 */
    }
  };

  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      {/* 邮箱卡。 */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-7 oe-card-shadow">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0B162C] text-white">
          <MessageSquareText size={16} strokeWidth={1.8} />
        </span>
        <h3
          className="mt-4 text-[19px] text-[#0B162C]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {pick(JOIN.contactTitle, locale)}
        </h3>

        {hasContactEmail() ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${CONTACT_EMAIL.trim()}`}
              className="text-[14px] font-medium text-[#1D4ED8] underline decoration-[rgba(29,78,216,0.35)] underline-offset-4"
            >
              {CONTACT_EMAIL.trim()}
            </a>
            <button
              type="button"
              onClick={copyEmail}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#CBD5E1] bg-white px-3 text-[12px] text-[#0F172A] transition-colors hover:border-[#1D4ED8]"
            >
              {copied ? (
                <>
                  <Check size={12} strokeWidth={2.6} className="text-emerald-600" />
                  已复制
                </>
              ) : (
                <>
                  <Copy size={12} strokeWidth={2.2} />
                  一键复制
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8F7F4] px-4 py-4">
            <span className="text-[12.5px] text-[#55606E]">
              官方合作邮箱待配置
            </span>
            <code className="text-[12px] text-[#8A93A0]">
              web/data/site-config.ts → CONTACT_EMAIL
            </code>
          </div>
        )}

        {/* 微信号。 */}
        <div className="mt-5 border-t border-[#E5E7EB] pt-5">
          {hasWechat() ? (
            <p className="text-[13px] text-[#1E293B]">
              微信：<span className="font-medium">{WECHAT_ID.trim()}</span>
            </p>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8F7F4] px-4 py-4">
              <span className="text-[12.5px] text-[#55606E]">
                官方微信 ID 待配置
              </span>
              <code className="text-[12px] text-[#8A93A0]">
                web/data/site-config.ts → WECHAT_ID
              </code>
            </div>
          )}
        </div>
      </div>

      {/* 二维码展示框。 */}
      <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-white p-7 oe-card-shadow lg:w-[240px]">
        {hasQrCode() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={QR_CODE_IMAGE.trim()}
            alt="官方联系二维码"
            className="h-[150px] w-[150px] rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-[150px] w-[150px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8F7F4] px-3 text-center">
            <span className="text-[11.5px] leading-relaxed text-[#8A93A0]">
              二维码位
              <br />
              待上传
            </span>
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-[#8A93A0]">
          {hasQrCode() ? pick(JOIN.qrTitle, locale) : "QR_CODE_IMAGE"}
        </p>
      </div>
    </div>
  );
}
