"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  BookOpen,
  Calculator,
  Compass,
  Globe2,
  GraduationCap,
  MessageSquareText,
  Play,
  Sparkles,
} from "lucide-react";
import { BrandBar, LocaleRegionSwitcher } from "@/components/layout/BrandBar";
import { HomeHeroPreview } from "@/components/home/HomeHeroPreview";
import { HomeMicroDemo } from "@/components/home/HomeMicroDemo";
import { LearningPathDiagram } from "@/components/home/LearningPathDiagram";
import { useLocale } from "@/context/LocaleContext";
import { HQ_LABEL, PLATFORM_NAME_EN } from "@/lib/branding";
import { cn } from "@/lib/cn";

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
 *     │  01 Hero（品牌首屏 · 左文右实景）      │
 *     ├──────────────────────────────────────┤
 *     │  02 为什么是 OE（图左 / 文右）        │
 *     ├──────────────────────────────────────┤
 *     │  03 双引擎体验（文左 / 互动卡右）      │
 *     ├──────────────────────────────────────┤
 *     │  04 四步学习闭环（高低错落）          │
 *     ├──────────────────────────────────────┤
 *     │  05 选课标准 + 梦想课堂落款           │
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
  const { locale, tk } = useLocale();

  return (
    <div className="min-h-full bg-[var(--background)]">
      {/* ── 顶部条：品牌 + 语言/地区 ── */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-5 py-2.5 sm:px-8">
          <BrandBar className="min-w-0 flex-1" />
          <LocaleRegionSwitcher />
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════
         第一层 · Hero 品牌首屏（左文右实景叠层）
         ════════════════════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1180px] px-5 pt-14 pb-24 sm:px-8 sm:pt-20 sm:pb-28">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-14">
          {/* 左：文案。 */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={FADE_UP}
          >
            {/* 联合徽标。 */}
            <div className="mb-6 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(184,155,94,0.45)] bg-[#fffefa] px-3 py-1 text-[11px] font-medium tracking-[0.04em] text-[#0b162c]">
                <Sparkles size={11} strokeWidth={2.4} className="text-[#b89b5e]" />
                OE · openeducation
              </span>
              <span className="text-[12px] text-[#55606e]">
                与 梦想课堂（{HQ_LABEL}）联合出品
              </span>
            </div>

            <h1 className="oe-display text-[38px] leading-[1.16] tracking-[-0.02em] text-[#0b162c] sm:text-[52px]">
              让海外的孩子，
              <br />
              跟国内的课堂同步长大。
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-[1.95] text-[#55606e]">
              1–12 年级的语文与数学，按国家统编版与人教版逐课时对齐。
              课前摸底、课中互动、课后达标——一条完整的学龄路径，
              而不是一堆散落的视频。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <Link
                href="/courses"
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0b162c] px-5.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#122344]"
              >
                开始我的年级课程
                <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
              <Link
                href="/learning/books"
                className="inline-flex h-11 items-center rounded-xl border border-[#cbd5e1] bg-white px-5 text-[13.5px] font-medium text-[#0f172a] transition-colors hover:border-[#1d4ed8]"
              >
                看看学情中心
              </Link>
            </div>

            {/* 关键数据标尺。 */}
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[#e5e7eb] pt-7 sm:grid-cols-4">
              {[
                { value: "12", label: "个年级" },
                { value: "2", label: "大核心学科" },
                { value: "同步", label: "权威教材版本" },
                { value: "认证", label: "结业修习证书" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dd className="oe-display text-[24px] leading-none text-[#0b162c]">
                    {stat.value}
                  </dd>
                  <dt className="mt-1.5 text-[11px] text-[#55606e]">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* 右：真实产品实景预览。 */}
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
            className="pt-8 lg:pt-0"
          >
            <HomeHeroPreview />
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
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#b89b5e] uppercase">
              <span className="tabular-nums">01</span>
              <span className="h-px w-7 bg-[#b89b5e]/50" />
              为什么是 OE
            </p>
            <h2 className="oe-display mt-4 max-w-xl text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0b162c] sm:text-[34px]">
              海外孩子缺的从来不是课程，
              <br className="hidden sm:block" />
              是那条通往国内课堂的对齐路径。
            </h2>
            <div className="mt-6 space-y-5">
              {PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div key={pillar.id} className="flex gap-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-[#fffefa] text-[#b89b5e]">
                      <Icon size={15} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14.5px] font-semibold text-[#0f172a]">
                        {pillar.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-[1.85] text-[#55606e]">
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
            <div className="rounded-2xl border border-[var(--border)] bg-[#fffefa] p-6 oe-card-shadow sm:p-8">
              <LearningPathDiagram className="w-full" />
              <p className="mt-4 border-t border-[rgba(184,155,94,0.28)] pt-4 text-[12px] leading-[1.8] text-[#55606e]">
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
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#b89b5e] uppercase">
              <span className="tabular-nums">02</span>
              <span className="h-px w-7 bg-[#b89b5e]/50" />
              双引擎体验
            </p>
            <h2 className="oe-display mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0b162c] sm:text-[34px]">
              语文与数学，
              <br />
              是两台完全不同的引擎。
            </h2>
            <p className="mt-5 max-w-lg text-[14px] leading-[1.9] text-[#55606e]">
              语文要的是积累与品味——一个字怎么写、一句诗怎么读、
              一篇课文为什么这样结尾。数学要的是建模与推理——一个
              参数动了，整个图形会怎么变。
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[#fffefa] p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0b162c] text-white">
                  <BookOpen size={15} strokeWidth={1.8} />
                </span>
                <h3 className="oe-display mt-3 text-[16px] text-[#0b162c]">
                  语文引擎
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.8] text-[#55606e]">
                  小学：真实笔顺动画 + 拼音语音朗读 + 课文生字。
                  <br />
                  初中高中：名篇精读与意象赏析台。
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1d4ed8] text-white">
                  <Calculator size={15} strokeWidth={1.8} />
                </span>
                <h3 className="mt-3 text-[16px] font-semibold text-[#0f172a]">
                  数学引擎
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.8] text-[#55606e]">
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
            <p className="mt-3 text-center text-[11.5px] text-[#55606e]">
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
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#b89b5e] uppercase">
              <span className="tabular-nums">03</span>
              <span className="h-px w-7 bg-[#b89b5e]/50" />
              学习闭环
            </p>
            <h2 className="oe-display mt-4 max-w-2xl text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0b162c] sm:text-[34px]">
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
                <h3 className="mt-3 text-[15.5px] font-semibold leading-snug text-[#0f172a]">
                  {step.title}
                </h3>
                <p className="mt-2 text-[12.5px] leading-[1.85] text-[#55606e]">
                  {step.body}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
         第五层 · 权威选课标准与梦想课堂收尾
         ════════════════════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={FADE_UP}
          className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14"
        >
          {/* 左：权威对标 + 年级直达。 */}
          <div>
            <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[#b89b5e] uppercase">
              <span className="tabular-nums">04</span>
              <span className="h-px w-7 bg-[#b89b5e]/50" />
              选课标准
            </p>
            <h2 className="oe-display mt-4 text-[27px] leading-[1.32] tracking-[-0.015em] text-[#0b162c] sm:text-[32px]">
              只做国内国标教材。
            </h2>
            <p className="mt-4 max-w-lg text-[13.5px] leading-[1.9] text-[#55606e]">
              语文对标国家统编版（部编版），数学对标人教版（高中人教 A
              版）。每一讲都落在真实的教材单元上——不掺奥数、不掺地方
              教辅、不掺超前学。回到国内课堂时，不需要重新补。
            </p>

            {/* 年级直达胶囊。 */}
            <p className="mt-8 mb-2.5 text-[11px] font-medium tracking-[0.1em] text-[#55606e] uppercase">
              1–12 年级快速直达
            </p>
            <div className="flex flex-wrap gap-1.5">
              {GRADE_LINKS.map((number) => (
                <Link
                  key={number}
                  href={`/courses?grade=${number}`}
                  className="flex h-8 min-w-8 items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[12px] font-medium tabular-nums text-[#1e293b] transition-colors hover:border-[#1d4ed8] hover:bg-[#eff6ff] hover:text-[#1d4ed8]"
                >
                  {number}
                </Link>
              ))}
            </div>
          </div>

          {/* 右：梦想课堂落款。 */}
          <div className="rounded-2xl border border-[rgba(184,155,94,0.4)] bg-[#fffefa] p-7 oe-card-shadow">
            <Award size={22} strokeWidth={1.5} className="text-[#b89b5e]" />
            <p className="oe-display mt-4 text-[21px] leading-snug text-[#0b162c]">
              梦想课堂
            </p>
            <p className="mt-1 text-[12.5px] text-[#b89b5e]">
              {HQ_LABEL} · 深圳
            </p>
            <div className="my-5 h-px w-full bg-[rgba(184,155,94,0.3)]" />
            <p className="text-[13px] leading-[1.9] text-[#55606e]">
              我们在做的事很朴素：让每一个在海外长大的中国孩子，
              都能按国内课堂的节奏，把语文和数学一步一步学扎实。
              课程开放，随时开始，学过的每一讲都算数。
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href="/courses"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b162c] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#122344]"
              >
                <GraduationCap size={13} strokeWidth={2.2} />
                进入课程目录
              </Link>
              <Link
                href="/ask"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-4 text-[13px] font-medium text-[#0f172a] transition-colors hover:border-[#1d4ed8]"
              >
                <Play size={12} strokeWidth={2.2} />
                直接提问
              </Link>
            </div>
            <p className="mt-5 text-[11px] text-[#8a93a0]">
              {PLATFORM_NAME_EN} · {locale === "en" ? "Global Chinese K12" : "全球华人 K12"}
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── 底部收尾 ── */}
      <footer className="border-t border-[var(--border)] bg-[#0b162c]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="oe-display text-[15px] text-white">
              OE · openeducation
            </p>
            <p className="mt-1 text-[11.5px] text-white/55">
              开放教育学习平台 · {HQ_LABEL} · {PLATFORM_NAME_EN}
            </p>
          </div>
          <nav className="flex flex-wrap gap-4">
            {[
              { href: "/courses", label: "课程" },
              { href: "/plan", label: "计划" },
              { href: "/learning/books", label: "学情中心" },
              { href: "/ask", label: "提问" },
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
