"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Play,
  Handshake,
  Heart,
  Mail,
  QrCode,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import HeroPhotoCarousel from "@/components/layout/HeroPhotoCarousel";
import { BRAND, DREAM_CLASSROOM } from "@/data/site-config";
import {
  CONTACT_EMAIL,
  QR_CODE_IMAGE,
  WECHAT_ID,
  hasContactEmail,
  hasQrCode,
  hasWechat,
} from "@/data/site-config";
import { GLOBAL_VIEW, JOIN, PILLARS } from "@/data/home-editorial";
import { FLAGSHIP_EDITORIALS } from "@/lib/flagship-editorial";
import { FLAGSHIP_TOPIC_IDS } from "@/lib/flagship-topics";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 首页 · 高级蓝白黑一屏品牌页
 * =============================
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────────────────────┐
 *     │  上 70%                                                  │
 *     │  ┌──────────────────────────┬─────────────────────────┐  │
 *     │  │ 左 62%                  │ 右 38%                  │  │
 *     │  │  · 花样字体品牌字标      │  HeroPhotoCarousel      │  │
 *     │  │  · 宣言 / 副标题         │  （产品级轮播卡片）      │  │
 *     │  │  · [ 进入学习地图 → ]    │                         │  │
 *     │  └──────────────────────────┴─────────────────────────┘  │
 *     ├──────────────────────────────────────────────────────────┤
 *     │  下 30%                                                  │
 *     │  ┌──────────────────────────┬─────────────────────────┐  │
 *     │  │ 梦想课堂 · Dream Classroom│ 加入我们与合作渠道       │  │
 *     │  └──────────────────────────┴─────────────────────────┘  │
 *     └──────────────────────────────────────────────────────────┘
 *
 * ⛔ **严格 100vh 一屏、零垂直滚动**。画布铺满 100vh，
 *    内部用 grid 行分 70% / 30%，绝不让内容溢出。
 *
 * 花样字标
 * --------
 *
 * 借鉴 Aceternity UI / Magic UI / React Bits 的展示级 Title 方案，
 * 落地成四个元素：
 *
 * 1. **精装展示衬线**——Cormorant Garamond（英文）+ Noto Serif SC
 *    （中文），构建期自托管，零外部请求；
 * 2. **深午夜蓝 → 冷银蓝的流光扫光**——一条 200° 的高光带以 6.5 秒
 *    周期扫过字面，用 ``background-clip: text`` 实现；
 * 3. **逐字微浮入场**——每个字母有独立的延迟与位移，像被依次
 *    放置到字标上，而不是整块淡入；
 * 4. **极细建筑装饰标尺线**——字母之间的竖向细线与顶端横线，
 *    营造制图图纸的精确感。
 */

/** 英文主标的逐字拆分。 */
const TITLE_WORDS = ["Open", "Education"] as const;

export default function EditorialHome() {
  const router = useRouter();
  const { locale } = useLocale();
  const { taxonomy } = useMathTaxonomy();
  const [copied, setCopied] = useState(false);

  const isEn = locale === "en";
  const tw = useTraditional();

  /**
   * 「进入学习地图」——写入 ``oe_entered`` 后跳转。
   *
   * 这个标记让**再次**直接打开根网址的用户被静默送到 ``/map``，
   * 省掉一次点击。
   */
  const enterLearning = () => {
    try {
      window.localStorage.setItem("oe_entered", "1");
    } catch {
      /* 隐私模式——忽略，站点照常工作 */
    }
    router.push("/map");
  };

  /** 复制联系方式。 */
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 不支持剪贴板——用户可以手动选中 */
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,7fr)_minmax(0,3fr)]">
      {/* ══════════════ 上 70% ══════════════ */}
      <section className="grid min-h-0 grid-cols-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-4 p-4 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)] lg:grid-rows-1 lg:gap-5 lg:p-5">
        {/* 左 62% · 品牌字标与宣言 */}
        <div className="flex min-h-0 flex-col justify-center px-1 py-3 lg:px-6 lg:py-4">
          {/* 顶部铭牌 */}
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#C59B38]" />
            <span className="text-[11px] tracking-[0.16em] text-[#334155]">
              OE · {DREAM_CLASSROOM.name}
              {isEn ? ` (${DREAM_CLASSROOM.hqLabel})` : tw(`（${DREAM_CLASSROOM.hqLabel}）`)}
            </span>
          </div>

          {/* 花样字标 */}
          <BrandTitle isEn={isEn} />

          {/* 细蓝金分割线 */}
          <div aria-hidden className="mt-5 flex h-px w-14 items-center">
            <span className="h-px flex-1 bg-[#1D4ED8]" />
            <span className="ml-1 h-px w-4 bg-[#C59B38]" />
          </div>

          {/* 宣言（宋体） */}
          <p className="mt-5 max-w-[26rem] font-[family-name:var(--font-serif-sc)] text-[clamp(19px,2.2vw,29px)] leading-[1.42] text-[#0F172A]">
            {BRAND.slogan}
          </p>
          <p className="mt-3 max-w-[26rem] text-[13px] leading-relaxed text-[#334155]">
            {BRAND.subtitle}
          </p>

          {/* 主行动按钮 */}
          <button
            type="button"
            onClick={enterLearning}
            className="mt-7 inline-flex h-12 w-fit items-center gap-2 rounded-lg bg-[#0B162C] px-7 text-[14px] font-medium text-white transition-all hover:bg-[#152a4d] hover:shadow-[0_8px_22px_rgba(11,22,44,0.28)]"
          >
            {isEn ? "Enter the Learning Map" : tw("进入学习地图")}
            <ArrowRight size={16} strokeWidth={2.2} />
          </button>

          {/* 三个标杆专题——直达入口 */}
          <div className="mt-6 grid max-w-[30rem] grid-cols-1 gap-2 sm:grid-cols-3">
            {FLAGSHIP_TOPIC_IDS.map((id) => {
              const ed = FLAGSHIP_EDITORIALS[id];
              return (
                <Link
                  key={id}
                  href={`/lab?topic=${encodeURIComponent(id)}`}
                  className="group rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 transition-colors hover:border-[#C59B38]"
                >
                  <span className="flex items-center gap-1.5 text-[9.5px] font-medium tracking-[0.1em] text-[#C59B38] uppercase">
                    <Play size={8} strokeWidth={3} />
                    {isEn ? "Film + Lab" : tw("短片 + 交互")}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-snug font-medium text-[#0F172A]">
                    {isEn ? ed.anchor.en : tw(ed.anchor.zhCN)}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* 实时统计 */}
          {taxonomy ? (
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2">
              <StatCell
                value={String(taxonomy.stats.nodeCount)}
                label={isEn ? "milestones" : tw("个里程碑")}
              />
              <StatCell
                value={String(taxonomy.stats.chainCount)}
                label={isEn ? "logic chains" : tw("条逻辑链")}
              />
              <StatCell
                value={String(taxonomy.stats.labCount)}
                label={isEn ? "own labs" : tw("个自研实验台")}
              />
            </div>
          ) : null}
        </div>

        {/* 右 38% · 海外学生实景大片轮播窗 */}
        <div className="min-h-[180px] lg:min-h-0">
          <HeroPhotoCarousel isEn={isEn} />
        </div>
      </section>

      {/* ══════════════ 下 30% · 品牌与合作带 ══════════════ */}
      <section className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto border-t border-[#E2E8F0] bg-white p-4 lg:grid-cols-2 lg:gap-8 lg:overflow-hidden lg:p-5">
        {/* 左栏 · 梦想课堂精炼专栏 */}
        <div className="flex min-h-0 flex-col justify-center overflow-hidden">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[#C59B38] uppercase">
            {isEn ? "Dream Classroom" : tw("梦想课堂 · Dream Classroom")}
          </p>

          <p className="mt-2 max-w-[30rem] font-[family-name:var(--font-serif-sc)] text-[clamp(14px,1.5vw,19px)] leading-[1.5] text-[#0F172A]">
            {isEn ? (
              <>
                Borderless innovation in education = {" "}
                <span className="text-[#1D4ED8]">fusing subjects</span> +{" "}
                <span className="text-[#1D4ED8]">raising the thinking</span> +{" "}
                <span className="text-[#1D4ED8]">opening the world</span>.
                Awaken, never fill.
              </>
            ) : (
              <>
                {tw("无边界创新教育 = 把学科融合 + 把思维拉高 + 把世界打开。")}{" "}
                <span className="text-[#1D4ED8]">{tw("唤醒，而非填鸭。")}</span>
              </>
            )}
          </p>

          {/* 关键词胶囊 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {PILLARS.map((pillar) => (
              <span
                key={pillar.no}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 text-[11.5px] text-[#0F172A]"
              >
                <span className="text-[9.5px] tabular-nums text-[#C59B38]">
                  {pillar.no}
                </span>
                {isEn ? pillar.title.en : tw(pillar.title.zh)}
              </span>
            ))}
          </div>

          {/* 背书与关键词一行 */}
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#334155]">
            {isEn
              ? "Houhai, Shenzhen Bay HQ · Official strategic partner of Sibford School, Oxford, UK  |  Breaking boundaries · East meets West · Family at the core"
              : tw(`${DREAM_CLASSROOM.hqLabel} · 英国牛津 Sibford School 官方战略合作伙伴 ｜ 打破边界 · 东西方融合 · 家庭核心`)}
          </p>
        </div>

        {/* 右栏 · 加入我们与合作渠道 */}
        <div className="flex min-h-0 flex-col justify-center gap-3 overflow-hidden">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {JOIN.channels.map((channel) => (
              <div
                key={channel.id}
                className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"
              >
                <div className="flex items-center gap-1.5">
                  {channel.id === "family" ? (
                    <Heart size={13} strokeWidth={2.2} className="text-[#1D4ED8]" />
                  ) : (
                    <Handshake size={13} strokeWidth={2.2} className="text-[#0E7490]" />
                  )}
                  <span className="text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
                    {isEn ? channel.kicker.en : tw(channel.kicker.zh)}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] font-semibold text-[#0F172A]">
                  {isEn ? channel.title.en : tw(channel.title.zh)}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#334155]">
                  {isEn ? channel.body.en : tw(channel.body.zh)}
                </p>
              </div>
            ))}
          </div>

          {/* 官方合作邮箱 + 二维码 */}
          <div className="grid items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            {hasContactEmail() ? (
              <button
                type="button"
                onClick={() => copy(CONTACT_EMAIL)}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Mail size={13} strokeWidth={2.2} className="shrink-0 text-[#334155]" />
                  <span className="min-w-0">
                    <span className="block text-[9.5px] tracking-[0.12em] text-[#64748B] uppercase">
                      {isEn ? "Official Email" : tw("官方合作邮箱")}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-[#0F172A]">
                      {CONTACT_EMAIL}
                    </span>
                  </span>
                </span>
                {copied ? (
                  <Check size={14} strokeWidth={2.4} className="shrink-0 text-[#C59B38]" />
                ) : (
                  <Copy size={14} strokeWidth={2.2} className="shrink-0 text-[#334155]" />
                )}
              </button>
            ) : (
              <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3.5 py-2.5">
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B] uppercase">
                  {isEn ? "Official Email" : tw("官方合作邮箱")}
                </p>
                <p className="mt-1 text-[12px] text-[#64748B]">
                  {isEn ? "To be configured" : tw("待填入官方邮箱")}
                </p>
              </div>
            )}

            {/* 微信 + 二维码预留框 */}
            <div className="flex items-center gap-2.5">
              {hasWechat() ? (
                <button
                  type="button"
                  onClick={() => copy(WECHAT_ID)}
                  className="flex h-[76px] items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
                >
                  {copied ? (
                    <Check size={12} strokeWidth={2.4} className="text-[#C59B38]" />
                  ) : (
                    <Copy size={12} strokeWidth={2.2} className="text-[#334155]" />
                  )}
                  {WECHAT_ID}
                </button>
              ) : (
                <div className="flex h-[76px] items-center rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 text-[11px] text-[#64748B]">
                  WeChat
                </div>
              )}

              <div className="flex h-[76px] w-[76px] items-center justify-center rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC]">
                {hasQrCode() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={QR_CODE_IMAGE}
                    alt={isEn ? "Contact QR code" : tw("官方联系二维码")}
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <QrCode size={18} strokeWidth={1.8} className="text-[#94A3B8]" />
                    <span className="text-[8.5px] text-[#94A3B8]">
                      {isEn ? "QR" : tw("二维码")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * 花样品牌字标
 * ============
 *
 * 四个动效层叠在一起：
 *
 * 1. **逐字微浮入场**——每个字母独立延迟 + 独立 Y 位移；
 * 2. **流光扫光**——一条 200° 高光带以 6.5 秒周期扫过字面；
 * 3. **极细建筑标尺线**——字母之间的竖线 + 顶端横线；
 * 4. **克制的金属质感**——银蓝高光压在深午夜蓝底上。
 *
 * ⛔ 全部动效都尊重 ``prefers-reduced-motion``——关掉动效时
 *    直接显示最终状态，不留残影。
 */
function BrandTitle({ isEn }: { isEn: boolean }) {
  const [mounted, setMounted] = useState(false);
  const reduceMotion = useRef(false);
  const tw = useTraditional();

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion.current = query.matches;
    setMounted(true);
  }, []);

  // 逐字延迟表。
  let letterIndex = 0;
  const letters = TITLE_WORDS.flatMap((word, wi) => {
    const chars = word.split("").map((ch) => {
      const delay = 0.06 * letterIndex + wi * 0.16;
      letterIndex += 1;
      return { ch, delay, wi };
    });
    return chars;
  });

  return (
    <div className="mt-4">
      {/* 英文主标 */}
      <h1 className="relative font-[family-name:var(--font-display)] text-[clamp(38px,5.4vw,74px)] leading-[0.98] font-semibold tracking-[-0.025em]">
        {/*
         * ⛔ **渐变必须挂在每一个字母自己身上**。
         *
         * 之前的写法是「外层 span 持有渐变 + background-clip:text，
         * 内层字母 span 负责动效」。这是**行不通**的：
         *
         * ``background-clip: text`` 只把**该元素自己的背景**裁到
         * 自己的文字上。子元素继承了父级的 ``color: transparent``，
         * 却**没有自己的背景**——一裁，底下什么都没有，文字整个
         * 消失（标题位置一片空白）。
         *
         * 改成每个字母自带渐变 + 自带裁切后，每个字母都是一块
         * 独立的「金属字」。所有字母用**同一套**扫光动画，锁步移动，
         * 视觉上就是一道光同时掠过整行字。
         *
         * 每个字母跑两条动画：``oe-shimmer``（背景位置扫光）与
         * ``oe-rise``（微浮入场）。它们动的是不同属性，互不干扰。
         */}
        {letters.map((item, i) => (
          <span
            key={`${item.ch}-${i}`}
            className="inline-block bg-[linear-gradient(100deg,#0B162C_0%,#0B162C_30%,#33507F_44%,#C7D6EA_52%,#33507F_60%,#0B162C_72%,#0B162C_100%)] bg-[length:280%_100%] bg-[position:0%_0%] text-transparent [background-clip:text] [-webkit-background-clip:text] will-change-transform"
            style={
              mounted && !reduceMotion.current
                ? {
                    animation: `oe-shimmer 6.5s linear infinite, oe-rise 0.78s cubic-bezier(0.16,1,0.3,1) ${item.delay}s both`,
                  }
                : undefined
            }
          >
            {item.ch}
          </span>
        ))}

        {/* 底层：极细建筑装饰标尺线 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
        >
          {letters.map((item, i) => (
            <span
              key={`rule-${i}`}
              className="absolute bottom-0 w-px origin-bottom bg-[#1D4ED8]/22"
              style={{
                left: `${((i + 1) / (letters.length + 1)) * 100}%`,
                height: "0.42em",
              }}
            />
          ))}
        </span>
      </h1>

      {/* 顶端横线 + 英文小字 */}
      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden className="h-px w-10 bg-[#C59B38]/70" />
        <span className="font-[family-name:var(--font-playfair)] text-[10.5px] tracking-[0.3em] text-[#64748B] uppercase">
          Open Education Learning Platform
        </span>
      </div>

      {/* 中文全称 */}
      <p className="mt-2.5 font-[family-name:var(--font-serif-sc)] text-[clamp(19px,2.4vw,32px)] leading-tight font-medium tracking-[0.06em] text-[#1D4ED8]">
        {isEn ? "Open Education Learning Platform" : tw(BRAND.nameZh)}
      </p>
    </div>
  );
}

/** 一个统计数字格。 */
function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[19px] leading-none font-semibold tabular-nums text-[#0F172A]">
        {value}
      </p>
      <p className="mt-1 text-[10.5px] text-[#334155]">{label}</p>
    </div>
  );
}
