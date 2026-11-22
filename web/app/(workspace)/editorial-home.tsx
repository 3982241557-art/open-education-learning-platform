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
  GraduationCap,
  MessageSquareText,
  Play,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { BrandBar, LocaleRegionSwitcher } from "@/components/layout/BrandBar";
import { HomeHeroPreview } from "@/components/home/HomeHeroPreview";
import { HomeMicroDemo } from "@/components/home/HomeMicroDemo";
import { LearningPathDiagram } from "@/components/home/LearningPathDiagram";
import AdvantageCardStack from "@/components/home/AdvantageCardStack";
import PaperPlaneIntro from "@/components/home/PaperPlaneIntro";
import GradeSelector from "@/components/common/GradeSelector";
import { useLocale } from "@/context/LocaleContext";
import { HQ_LABEL, PLATFORM_NAME_EN } from "@/lib/branding";
import { cn } from "@/lib/cn";
import {
  BRAND,
  CONTACT_EMAIL,
  DREAM_CLASSROOM,
  JOIN_CHANNELS,
  METHODOLOGY_PILLARS,
  PARTNERSHIP,
  QR_CODE_IMAGE,
  WECHAT_ID,
  hasContactEmail,
  hasQrCode,
  hasWechat,
} from "@/data/site-config";

/**
 * 首页 · 品牌叙事专栏
 * =====================
 *
 * 五层错落递进的编辑型版面。
 *
 * 为什么不是「功能入口页」
 * ----------------------
 *
 * 原来的首页是一个对话框 + 一个教材导入口。它解决的是「我现在就要问
 * 一个问题」——这是**学习开始之后**的需求。
 *
 * 但一个海外用户第一次打开这个站点时，他有三个更前置的问题：
 *
 * 1. 这是什么？（一个中文网站为什么跟我有关）
 * 2. 这里有什么？（有几门课、是什么质量、对我有没有用）
 * 3. 我该怎么开始？（第一步点哪里）
 *
 * 五个板块
 * --------
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
 *     │  05 梦想课堂专栏 + 加入我们           │
 *     └──────────────────────────────────────┘
 *
 * 所有区块配合 framer-motion 的 ``whileInView`` 滚动渐显——
 * 动效只做「渐显 + 轻微上浮」，不抢内容的注意力。
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

/** 三个核心理念。 */
const PILLARS = [
  {
    id: "open",
    icon: Globe2,
    title: "开放 · 不做围墙",
    body: "教材版本对标国内统编与人教，但课程本身来自公开可获取的优质同步课——不设门槛、不做订阅墙。",
  },
  {
    id: "sync",
    icon: Compass,
    title: "同步 · 不脱节",
    body: "每一讲都落在真实教材单元上：先摸底，再精讲，再互动，再检测——回到国内课堂时不用重新补。",
  },
  {
    id: "ai",
    icon: MessageSquareText,
    title: "陪读 · 不打断",
    body: "AI 助教常驻右侧，按你的诊断结果调整深浅，在中英之间给出对照——但不抢走读课文的时间。",
  },
];

/** 四步学习闭环。 */
const STEPS = [
  {
    no: "01",
    title: "课前精准摸底",
    body: "进课先来两道真实考点题——不是「你懂不懂」，而是直接考这一讲的前置基础。助教会据此调整讲解的深浅。",
    accent: "#0b162c",
    tall: false,
  },
  {
    no: "02",
    title: "同步精讲微课",
    body: "按教材单元逐课时推进的名师同步课，每一集都有时间戳知识节点与段落导读，读到哪里、懂到哪里，一目了然。",
    accent: "#1d4ed8",
    tall: true,
  },
  {
    no: "03",
    title: "学科互动实验室",
    body: "语文是笔顺描红与名篇赏析，数学是函数图像与动态几何——把这一课的核心概念亲手玩明白。",
    accent: "#b89b5e",
    tall: false,
  },
  {
    no: "04",
    title: "达标颁证认证",
    body: "完成整册并通过随堂检测，即可领取带编号的 K12 同步修习证书——它记在「学情中心」里，随时可查。",
    accent: "#122344",
    tall: true,
  },
];

/** 1–12 年级快速直达。 */
const GRADE_LINKS = Array.from({ length: 12 }, (_, index) => index + 1);

export default function EditorialHome() {
  const { locale } = useLocale();
  const [introDone, setIntroDone] = useState(false);

  return (
    <div className="min-h-full bg-[var(--background)]">
      {/* ── 纸飞机启动动效 ──
       *
       * 覆盖在整页之上，画布色与页面同色——**无缝衔接，不闪烁**。
       * 每次会话只播一次（sessionStorage 控制）。
       */}
      <PaperPlaneIntro onDone={() => setIntroDone(true)} />

      {/* ── 顶部条：品牌 + 语言/地区 ── */}
      <header
        className={cn(
          "sticky top-0 z-20 border-b border-[var(--border)] bg-white",
          !introDone && "opacity-0",
        )}
      >
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-5 py-2.5 sm:px-8">
          <BrandBar className="min-w-0 flex-1" />
          {/* 年级 / 年龄选择器——收纳在顶栏，随时自由点选。 */}
          <GradeSelector compact align="right" className="shrink-0" />
          <LocaleRegionSwitcher />
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════
         第一层 · Hero 品牌首屏（左全称宣言 / 右优势卡栈）
         ════════════════════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1180px] px-5 pt-14 pb-24 sm:px-8 sm:pt-20 sm:pb-28">
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
                {BRAND.monogram} · {DREAM_CLASSROOM.name}
                （{DREAM_CLASSROOM.hqLabel}）
              </span>
            </div>

            {/* 绝对视觉主角 · 平台中英文全称。 */}
            <div className="flex items-center gap-4">
              {/* 极简徽标。 */}
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[17px] font-semibold tracking-tight text-[#0B162C] oe-card-shadow"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {BRAND.monogram}
              </span>
              <h1 className="text-5xl font-semibold tracking-tight text-[#0B162C] lg:text-6xl" style={{ fontFamily: "var(--font-sans)" }}>
                {BRAND.nameEn}
              </h1>
            </div>

            <h2
              className="mt-5 text-2xl font-medium tracking-[0.14em] text-[#122344] lg:text-3xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {BRAND.nameZh}
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
                探索学科与教具
                <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
              <Link
                href="/learning/books"
                className="inline-flex h-11 items-center rounded-full border border-[#CBD5E1] bg-white px-6 text-[13.5px] font-medium text-[#0F172A] transition-colors hover:border-[#1D4ED8]"
              >
                学情中心
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
                    style={{ fontFamily: "var(--font-sans)" }}
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
        <div className="mx-auto grid w-full max-w-[1180px] items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] lg:gap-16">
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
              为什么是 OE
            </p>
            <h2
              className="mt-4 max-w-xl text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[34px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              海外孩子缺的从来不是课程，
              <br className="hidden sm:block" />
              是那条通往国内课堂的对齐路径。
            </h2>
            <div className="mt-6 space-y-5">
              {PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div key={pillar.id} className="flex gap-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#FFFEFA] text-[#B89B5E]">
                      <Icon size={15} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14.5px] font-semibold text-[#0F172A]">
                        {pillar.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-[1.85] text-[#55606E]">
                        {pillar.body}
                      </p>
                    </div>
                  </div>
                );
              })}
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
                平台做的事，就是把这条断掉的路接上：左边是孩子的真实
                年级与学情，右边是国内课堂的真实进度——中间的每一讲，
                都有明确的教材单元对应。
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
         第三层 · 右图左文（语文与数学双引擎体验）
         ════════════════════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          {/* 左：双引擎说明。 */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={FADE_UP}
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">02</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              双引擎体验
            </p>
            <h2
              className="mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[34px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              语文与数学，
              <br />
              是两台完全不同的引擎。
            </h2>
            <p className="mt-5 max-w-lg text-[14px] leading-[1.9] text-[#55606E]">
              语文要的是积累与品味——一个字怎么写、一句诗怎么读、
              一篇课文为什么这样结尾。数学要的是建模与推理——一个
              参数动了，整个图形会怎么变。
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
                  语文引擎
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.8] text-[#55606E]">
                  小学：真实笔顺动画 + 拼音语音朗读 + 课文生字。
                  <br />
                  初中高中：名篇精读与意象赏析台。
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1D4ED8] text-white">
                  <Calculator size={15} strokeWidth={1.8} />
                </span>
                <h3
                  className="mt-3 text-[16px] font-semibold text-[#0F172A]"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  数学引擎
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.8] text-[#55606E]">
                  小学：数轴、凑十、分数披萨、面积方格。
                  <br />
                  初中高中：函数图像滑块、动态几何、概率模拟。
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
        <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={FADE_UP}
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">03</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              学习闭环
            </p>
            <h2
              className="mt-4 max-w-2xl text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[34px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              从进课到拿证，四步走完。
            </h2>
          </motion.div>

          {/* 高低错落——不是四张等高的表格。 */}
          <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
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
                  // 偶数张向下缩进——形成错落的 Z 字。
                  step.tall ? "lg:mt-8" : "",
                )}
              >
                {/* 顶部色条。 */}
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
                  {step.title}
                </h3>
                <p className="mt-2 text-[12.5px] leading-[1.85] text-[#55606E]">
                  {step.body}
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
        <div className="mx-auto flex w-full max-w-[1180px] flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p
              className="text-[15px] font-semibold text-white"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {BRAND.monogram} · {BRAND.nameEn}
            </p>
            <p className="mt-1 text-[11.5px] text-white/55">
              {BRAND.nameZh} · {HQ_LABEL} · {PLATFORM_NAME_EN}
            </p>
          </div>
          <nav className="flex flex-wrap gap-4">
            {[
              { href: "/courses", label: "课程" },
              { href: "/plan", label: "计划" },
              { href: "/learning/books", label: "学情中心" },
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

/**
 * 「梦想课堂（Dream Classroom）」专栏。
 *
 * 三块内容用 **#F8F7F4 与 #FFFFFF 交替分带**串起来——
 * 交替底色本身就是杂志的「翻页」感，比任何装饰都有效。
 */
function DreamClassroomSection() {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)]">
      {/* ── 板块 A · 关于我们 & 核心理念（左文右碑文） ── */}
      <section className="bg-white">
        <div className="mx-auto grid w-full max-w-[1180px] items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-16">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={FADE_UP}
          >
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#B89B5E] uppercase">
              <span className="tabular-nums">04</span>
              <span className="h-px w-7 bg-[#B89B5E]/50" />
              梦想课堂 · Dream Classroom
            </p>
            <h2
              className="mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[32px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              关于我们
            </h2>
            <div className="mt-5 space-y-4">
              <p className="text-[14px] leading-[1.95] text-[#1E293B]">
                梦想课堂（Dream Classroom）由创始人 {DREAM_CLASSROOM.founder}{" "}
                创立于{DREAM_CLASSROOM.origin}，总部位于
                {DREAM_CLASSROOM.headquarters}，是一家以「
                {DREAM_CLASSROOM.creed}」为核心理念的家庭学习共同体。
              </p>
              <p className="text-[14px] leading-[1.95] text-[#55606E]">
                我们摒弃填鸭式和碎片化的知识堆砌，致力于培养孩子跨学科、跨边界、
                跨文化的学习力。
              </p>
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
              {/* 香槟金边线。 */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-3 rounded-xl border border-[rgba(184,155,94,0.38)]"
              />
              <Award size={20} strokeWidth={1.5} className="text-[#B89B5E]" />
              <p
                className="mt-5 text-[17px] leading-[1.85] text-white"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {DREAM_CLASSROOM.creed} =
              </p>
              <p
                className="mt-3 text-[20px] leading-[1.7] font-semibold text-[#D8C49A] sm:text-[23px]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {DREAM_CLASSROOM.formula}
              </p>
              <div className="mt-6 h-px w-full bg-[rgba(184,155,94,0.3)]" />
              <p
                className="mt-5 text-[13.5px] leading-[1.9] text-white/75 italic"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                「{DREAM_CLASSROOM.quote}」
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 板块 B · 三大方法论支柱（三列精装卡片） ── */}
      <section>
        <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
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
            {METHODOLOGY_PILLARS.map((pillar, index) => (
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
                  {pillar.title}
                </h3>
                <p className="mt-1 text-[11px] tracking-[0.12em] text-[#8A93A0] uppercase">
                  {pillar.titleEn}
                </p>
                <p className="mt-3 text-[13px] leading-[1.9] text-[#55606E]">
                  {pillar.body}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 板块 C · 国际视野 & 总部空间（左右错落双栏） ── */}
      <section className="bg-white">
        <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-8">
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
              国际视野
            </h3>
            <p className="mt-3 text-[13.5px] leading-[1.95] text-[#1E293B]">
              梦想课堂已与{PARTNERSHIP.partner}建立官方战略合作伙伴关系。
              {PARTNERSHIP.eventDate}，{PARTNERSHIP.event}
            </p>
            <div className="mt-auto pt-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(184,155,94,0.45)] bg-white px-3 py-1.5 text-[11.5px] text-[#0B162C]">
                <Sparkles size={11} strokeWidth={2.4} className="text-[#B89B5E]" />
                {PARTNERSHIP.partner}
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
              总部空间
            </h3>
            <p className="mt-3 text-[13.5px] leading-[1.95] text-[#1E293B]">
              {PARTNERSHIP.hqBody}
            </p>
            <ul className="mt-5 space-y-1.5">
              {[
                "全球教育咨询",
                "AI 教育实验室",
                "学习力研究院",
                "国际创业孵化",
                "国际化教育联盟",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-[12.5px] text-[#55606E]">
                  <Check size={12} strokeWidth={2.6} className="shrink-0 text-[#B89B5E]" />
                  {item}
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
  return (
    <section className="border-t border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
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
            加入我们
          </p>
          <h2
            className="mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0B162C] sm:text-[33px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            两种方式，汇入同一个共同体。
          </h2>
        </motion.div>

        {/* 双通道。 */}
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {JOIN_CHANNELS.map((channel, index) => (
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
                {channel.kicker}
              </span>
              <h3
                className="mt-2 text-[20px] text-[#0B162C]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {channel.title}
              </h3>
              <p className="mt-3 text-[13.5px] leading-[1.95] text-[#1E293B]">
                {channel.body}
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
          官方合作邮箱
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
          {hasQrCode() ? "扫码联系" : "QR_CODE_IMAGE"}
        </p>
      </div>
    </div>
  );
}
