"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Compass,
  GitBranch,
  Globe2,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import {
  HOME_EDITORIAL,
  HOME_FINAL_CTA,
  type AdvantageConfig,
  type EditorialImage,
  type SectionConfig,
  type StepConfig,
} from "@/data/home-editorial";
import { BrandBar, LocaleRegionSwitcher } from "@/components/layout/BrandBar";
import { cn } from "@/lib/cn";

/**
 * 首页 · 精选专题导览
 * ====================
 *
 * 一个**图文错落**的编辑型版面。
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
 * 这三个问题，一个对话框一个都回答不了。所以首页改成**导览**——
 * 把答案摆出来，然后给一个「开始探索课程」的按钮把人送进去。
 *
 * 版面结构
 * --------
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────┐
 *     │  Hero（文案左 · 图右）                │
 *     ├──────────────────────────────────────┤
 *     │  01 我们是谁（图文左 / 图右 交替）      │
 *     ├──────────────────────────────────────┤
 *     │  02 我们在做什么（图文右 / 图左 交替）  │
 *     ├──────────────────────────────────────┤
 *     │  03 核心优势（四宫格错落）             │
 *     ├──────────────────────────────────────┤
 *     │  04 三步上手（三卡）                  │
 *     ├──────────────────────────────────────┤
 *     │  底部 CTA                            │
 *     └──────────────────────────────────────┘
 *
 * 左右交替
 * -------
 *
 * 每一节的图文左右对调。这不是装饰——**人的眼睛在读图与读文之间会
 * 横向移动**，交替会让这个移动变成一条往复的路径，读起来有节奏。
 *
 * 一直朝右排列，最后一屏就会变成一堵「视线跑到底也没停过」的墙。
 */

/** 优势卡片的图标。 */
const ADVANTAGE_ICONS: Record<AdvantageConfig["icon"], typeof Compass> = {
  timeline: MessageSquareText,
  skill: GitBranch,
  certificate: Award,
  globe: Globe2,
};

/**
 * 一张配图。
 *
 * 图片**没准备好**时渲染一块渐变占位块——版面不能因为缺图而破。
 * 占位块上会叠一层极淡的网格纹，给它一点「技术图纸」的质感，
 * 至少不像是加载失败。
 */
function EditorialFigure({
  image,
  className = "",
  rounded = "rounded-2xl",
}: {
  image: EditorialImage;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(image.src) && !failed;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--muted)]",
        rounded,
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          alt={image.alt}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          <div
            aria-hidden
            className={cn("absolute inset-0 bg-gradient-to-br", image.accent)}
          />
          {/* 极淡网格——给占位块一点质感。 */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 30% 25%, rgba(255,255,255,0.16), transparent 70%)",
            }}
          />
        </>
      )}
    </div>
  );
}

/**
 * 一个错落板块。
 */
function EditorialSection({
  section,
  reverse = false,
}: {
  section: SectionConfig;
  /** 图在左、文在右。 */
  reverse?: boolean;
}) {
  return (
    <section
      id={section.id}
      className="mx-auto w-full max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24"
    >
      <div
        className={cn(
          "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
          reverse && "lg:[&>*:first-child]:order-2",
        )}
      >
        {/* 文案 */}
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[var(--primary)] uppercase">
            <span className="tabular-nums">{section.index}</span>
            <span className="h-px w-7 bg-[var(--primary)]/40" />
            {section.eyebrow}
          </p>
          <h2 className="mt-4 text-[26px] font-medium leading-[1.25] tracking-[-0.02em] sm:text-[32px]">
            {section.title}
          </h2>
          <div className="mt-5 space-y-4">
            {section.body.map((paragraph, index) => (
              <p
                key={index}
                className="text-[14px] leading-[1.9] text-[var(--muted-foreground)]"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* 补充要点 */}
          {section.points && section.points.length > 0 ? (
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {section.points.map((point) => (
                <li
                  key={point.title}
                  className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-3"
                >
                  <p className="flex items-start gap-1.5 text-[12.5px] font-medium">
                    <CheckCircle2
                      size={13}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0 text-[var(--primary)]"
                    />
                    {point.title}
                  </p>
                  <p className="mt-1 pl-[19px] text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                    {point.detail}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* 配图 */}
        <div className="relative">
          <EditorialFigure
            image={section.image}
            className="aspect-[4/3] w-full shadow-[0_24px_70px_-34px_rgba(15,23,42,0.45)]"
          />
          {/* 图上的浮动标签 */}
          {section.imageTags && section.imageTags.length > 0 ? (
            <div className="absolute -bottom-3 left-4 flex flex-wrap gap-1.5">
              {section.imageTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[10.5px] font-medium text-[var(--muted-foreground)] shadow-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * 优势卡（四宫格）。
 *
 * 「四宫格」不是平均的四格——**交替上浮下移**，形成错落。
 * 完全等高的四张卡片会显得像一张表格，而表格不传达「四件不同的事」。
 */
function AdvantageGrid({ advantages }: { advantages: AdvantageConfig[] }) {
  return (
    <section className="border-y border-[var(--border)] bg-white">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
        <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[var(--primary)] uppercase">
          <span className="tabular-nums">03</span>
          <span className="h-px w-7 bg-[var(--primary)]/40" />
          核心优势
        </p>
        <h2 className="mt-4 max-w-2xl text-[26px] font-medium leading-[1.25] tracking-[-0.02em] sm:text-[32px]">
          四件我们花了最多力气的事
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {advantages.map((advantage, index) => {
            const Icon = ADVANTAGE_ICONS[advantage.icon];
            // 偶数张向下缩进一点——形成 Z 字形错落。
            const offset = index % 2 === 1 ? "lg:mt-10" : "";
            return (
              <article
                key={advantage.id}
                className={cn(
                  "group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] transition-[border-color,transform] hover:border-[var(--primary)]/30",
                  offset,
                )}
              >
                <div className="relative">
                  <EditorialFigure
                    image={advantage.image ?? {
                      src: "",
                      accent: "from-[#0f172a] to-[#1e3a8a]",
                      alt: advantage.title,
                    }}
                    rounded="rounded-none"
                    className="aspect-[16/9] w-full"
                  />
                  <span className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[var(--primary)] shadow-sm">
                    <Icon size={17} strokeWidth={1.9} />
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-[15px] font-medium leading-snug">
                    {advantage.title}
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-[1.85] text-[var(--muted-foreground)]">
                    {advantage.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * 三步上手。
 */
function StepsSection({ steps }: { steps: StepConfig[] }) {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
      <p className="flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] text-[var(--primary)] uppercase">
        <span className="tabular-nums">04</span>
        <span className="h-px w-7 bg-[var(--primary)]/40" />
        怎么开始
      </p>
      <h2 className="mt-4 max-w-2xl text-[26px] font-medium leading-[1.25] tracking-[-0.02em] sm:text-[32px]">
        三步，从今天开始
      </h2>

      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-5"
          >
            {/* 顶部色条 + 大号序号 */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-[3px]"
              style={{ background: step.accent }}
            />
            <div className="flex items-baseline gap-2">
              <span
                className="text-[26px] font-semibold leading-none tabular-nums"
                style={{ color: step.accent }}
              >
                {step.step}
              </span>
              {index < steps.length - 1 ? (
                <ArrowRight
                  size={14}
                  strokeWidth={2}
                  className="ml-auto text-[var(--muted-foreground)]/40"
                />
              ) : null}
            </div>
            <h3 className="mt-3 text-[15px] font-medium">{step.title}</h3>
            <p className="mt-2 text-[12.5px] leading-[1.85] text-[var(--muted-foreground)]">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * 首页。
 */
export default function EditorialHome() {
  const { hero, who, what, advantages, steps } = HOME_EDITORIAL;

  return (
    <div className="min-h-full bg-[var(--background)]">
      {/* ── 顶部条：品牌 + 语言/地区 ──
       *
       * 品牌标识放在**顶部栏**——首页是「宣传面」，品牌要在这里。
       * 工作区里品牌在侧栏，首页没有侧栏，所以挪上来。
       */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-5 py-2.5 sm:px-8">
          <BrandBar className="min-w-0 flex-1" />
          <LocaleRegionSwitcher />
        </div>
      </header>

      {/* ── Hero 首屏 ── */}
      <section className="mx-auto w-full max-w-[1120px] px-5 pt-14 pb-16 sm:px-8 sm:pt-20 sm:pb-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/20 bg-[var(--primary)]/6 px-3 py-1 text-[11px] font-medium text-[var(--primary)]">
              <Sparkles size={11} strokeWidth={2.2} />
              {hero.subtitle}
            </p>
            <h1 className="mt-5 text-[38px] font-medium leading-[1.08] tracking-[-0.035em] sm:text-[54px]">
              {hero.title}
            </h1>
            <p className="mt-5 max-w-xl text-[14.5px] leading-[1.95] text-[var(--muted-foreground)]">
              {hero.lead}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <Link
                href={hero.primaryCta.href}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                {hero.primaryCta.label}
                <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
              {hero.secondaryCta ? (
                <Link
                  href={hero.secondaryCta.href}
                  className="inline-flex h-10 items-center rounded-xl border border-[var(--border)] bg-white px-5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  {hero.secondaryCta.label}
                </Link>
              ) : null}
            </div>

            {/* 数字条——建立可信度，但克制到只有一行。 */}
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {hero.stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[10.5px] text-[var(--muted-foreground)]">
                    {stat.label}
                  </dt>
                  <dd className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <EditorialFigure
              image={hero.image}
              className="aspect-[4/5] w-full shadow-[0_28px_80px_-36px_rgba(15,23,42,0.55)]"
            />
          </div>
        </div>
      </section>

      {/* ── 板块 1 · 我们是谁 ── */}
      <EditorialSection section={who} />

      {/* ── 板块 2 · 我们在做什么（图文左右对调） ── */}
      <EditorialSection section={what} reverse />

      {/* ── 板块 3 · 核心优势 ── */}
      <AdvantageGrid advantages={advantages} />

      {/* ── 板块 4 · 三步上手 ── */}
      <StepsSection steps={steps} />

      {/* ── 底部 CTA ── */}
      <section className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-start gap-6 px-5 py-16 sm:px-8 sm:py-20">
          <div>
            <h2 className="text-[24px] font-medium leading-[1.3] tracking-[-0.02em] sm:text-[30px]">
              {HOME_FINAL_CTA.title}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted-foreground)]">
              {HOME_FINAL_CTA.body}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={HOME_FINAL_CTA.primaryCta.href}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              {HOME_FINAL_CTA.primaryCta.label}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
            <Link
              href={HOME_FINAL_CTA.secondaryCta.href}
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border)] px-5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              {HOME_FINAL_CTA.secondaryCta.label}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
