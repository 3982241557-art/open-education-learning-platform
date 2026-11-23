"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Compass,
  Copy,
  Check,
  Globe2,
  GraduationCap,
  Handshake,
  Heart,
  Layers,
  Sparkles,
  Square,
  Waves,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { BRAND, DREAM_CLASSROOM } from "@/data/site-config";
import {
  CONTACT_EMAIL,
  QR_CODE_IMAGE,
  WECHAT_ID,
  hasContactEmail,
  hasQrCode,
  hasWechat,
} from "@/data/site-config";
import { ABOUT, GLOBAL_VIEW, HQ_SPACE, JOIN, PILLARS } from "@/data/home-editorial";
import { cn } from "@/lib/cn";

/**
 * 首页 · 一屏 100vh 品牌页
 * =========================
 *
 * .. code-block:: text
 *
 *     ┌───────────────────────────┬──────────────────────────────┐
 *     │  OE · 梦想课堂（铭牌）     │                              │
 *     │                           │                              │
 *     │  Open Education          │   右侧「创意分块展台」        │
 *     │  开放教育学习平台          │   ┌────────────────────┐    │
 *     │  ──── (金线)              │   │ 01 体验教具         │    │
 *     │                           │   │ 02 梦想课堂         │    │
 *     │  随时随地，让思考自然发生。  │   │ 03 合作与联系       │    │
 *     │  为全球华人家庭构筑…         │   └────────────────────┘    │
 *     │                           │   （内容随左下标签切换）      │
 *     │  [ 进入学习 → ]            │                              │
 *     │                           │                              │
 *     │ [01 体验教具][02 梦想课堂][03 合作与联系]                   │
 *     └───────────────────────────┴──────────────────────────────┘
 *
 * 为什么「一屏、零滚动」
 * ---------------------
 *
 * 旧版首页是六层错落的长页——用户要滚过 6 屏才能看完「这是什么」。
 * 现在把全部信息压进**一屏**，靠左下三个标签切换右侧展台的三个视图。
 *
 * ⛔ **零滚动**。画布铺满 100vh，底部留 76px 给悬浮岛。
 */

/** 右侧展台的三个视图。 */
type View = "lab" | "dream" | "join";

export default function EditorialHome() {
  const router = useRouter();
  const { locale } = useLocale();
  const [view, setView] = useState<View>("lab");

  /**
   * 「进入学习」——写入 ``oe_entered`` 后跳课程总台。
   *
   * 这个标记让**再次**直接打开根网址的用户被静默送到 ``/courses``，
   * 省掉一次点击。
   */
  const enterLearning = () => {
    try {
      window.localStorage.setItem("oe_entered", "1");
    } catch {
      /* 隐私模式——忽略，站点照常工作 */
    }
    router.push("/courses");
  };

  /** 复制联系方式。 */
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 不支持剪贴板——用户可以手动选中 */
    }
  };

  const isEn = locale === "en";

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,52fr)_minmax(0,48fr)]">
      {/* ══════════════ 左 · 品牌主区（52%） ══════════════ */}
      <section className="flex min-h-0 flex-col justify-between px-6 py-8 sm:px-10 lg:py-10">
        {/* 顶部铭牌 */}
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#a48a5e]" />
          <span className="text-[11px] tracking-[0.16em] text-[#5c646d]">
            OE · {DREAM_CLASSROOM.name}
            {isEn ? ` (${DREAM_CLASSROOM.hqLabel})` : `（${DREAM_CLASSROOM.hqLabel}）`}
          </span>
        </div>

        {/* 中部：视觉主角 + 宣言 */}
        <div className="min-h-0 py-6">
          <h1 className="font-sans text-[clamp(30px,4.4vw,58px)] leading-[1.03] font-semibold tracking-[-0.03em] text-[#1e242b]">
            Open Education
          </h1>
          <p className="mt-2 font-serif text-[clamp(18px,2.1vw,28px)] leading-tight text-[#4e677d]">
            {BRAND.nameZh}
          </p>

          {/* 精炼的哑光浅麦金短分割线 */}
          <div aria-hidden className="mt-5 h-px w-14 bg-[#a48a5e]" />

          <p className="mt-6 max-w-[26rem] font-serif text-[clamp(19px,2.2vw,29px)] leading-[1.42] text-[#1e242b]">
            {BRAND.slogan}
          </p>
          <p className="mt-3 max-w-[26rem] text-[13px] leading-relaxed text-[#5c646d]">
            {BRAND.subtitle}
          </p>

          {/* 主行动按钮 */}
          <button
            type="button"
            onClick={enterLearning}
            className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-[#1e242b] px-7 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {isEn ? "Enter Learning" : "进入学习"}
            <ArrowRight size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* 底部：三个分块切换标签 */}
        <div>
          <p className="mb-2.5 text-[10.5px] font-medium tracking-[0.14em] text-[#5c646d] uppercase">
            {isEn ? "Explore" : "探索"}
          </p>
          <div className="flex flex-wrap gap-2">
            <ViewTab
              no="01"
              label={isEn ? "Live Manipulatives" : "体验教具"}
              active={view === "lab"}
              onClick={() => setView("lab")}
            />
            <ViewTab
              no="02"
              label={isEn ? "Dream Classroom" : "梦想课堂"}
              active={view === "dream"}
              onClick={() => setView("dream")}
            />
            <ViewTab
              no="03"
              label={isEn ? "Join & Contact" : "合作与联系"}
              active={view === "join"}
              onClick={() => setView("join")}
            />
          </div>
        </div>
      </section>

      {/* ══════════════ 右 · 创意分块展台（48%） ══════════════ */}
      <section className="min-h-0 px-4 pb-4 lg:pl-0 lg:pr-8">
        <div className="h-full overflow-hidden rounded-3xl border border-[#e5e2da] bg-white">
          {view === "lab" ? <LabShowcase /> : null}
          {view === "dream" ? <DreamShowcase /> : null}
          {view === "join" ? <JoinShowcase onCopy={copy} copied={copied} /> : null}
        </div>
      </section>
    </div>
  );
}

/** 左下的分块切换标签。 */
function ViewTab({
  no,
  label,
  active,
  onClick,
}: {
  no: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors",
        active
          ? "border-[#1e242b] bg-[#1e242b] text-white"
          : "border-[#e5e2da] bg-white text-[#5c646d] hover:border-[#d5d1c8] hover:text-[#1e242b]",
      )}
    >
      <span
        className={cn(
          "text-[10.5px] tabular-nums",
          active ? "text-[#c0a678]" : "text-[#a8a398]",
        )}
      >
        {no}
      </span>
      {label}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   视图 01 · 活的微教具体验
   ══════════════════════════════════════════════════════════════ */

function LabShowcase() {
  const [mode, setMode] = useState<"math" | "chinese">("math");

  return (
    <div className="flex h-full flex-col">
      {/* 卡片顶部两个极简小切换键 */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e2da] px-5 py-3">
        <button
          type="button"
          onClick={() => setMode("math")}
          aria-pressed={mode === "math"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors",
            mode === "math"
              ? "bg-[#eff3f6] text-[#4e677d]"
              : "text-[#5c646d] hover:bg-[#f6f4ef]",
          )}
        >
          <Waves size={13} strokeWidth={2.2} />
          数学 · 拨动波形
        </button>
        <button
          type="button"
          onClick={() => setMode("chinese")}
          aria-pressed={mode === "chinese"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors",
            mode === "chinese"
              ? "bg-[#f6f1ee] text-[#8a6e63]"
              : "text-[#5c646d] hover:bg-[#f6f4ef]",
          )}
        >
          <Square size={13} strokeWidth={2.2} />
          语文 · 汉字印章溯源
        </button>
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1">
        {mode === "math" ? <MathMicroToy /> : <ChineseMicroToy />}
      </div>
    </div>
  );
}

/**
 * 数学微玩具——一条可拖动的交互曲线。
 *
 * 纯 SVG + React，60fps。拖动控制点时曲线与数值实时联动。
 */
function MathMicroToy() {
  const [t, setT] = useState(0.45);

  /** 波形采样——y = sin(2πx) 的缩放。 */
  const points = Array.from({ length: 49 }, (_, i) => {
    const x = i / 48;
    const y = 0.5 + 0.34 * Math.sin(x * Math.PI * 2 + t * 2);
    return { x: x * 100, y: y * 100 };
  });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  const knob = points[Math.round(t * 48)];

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="min-h-0 flex-1">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full touch-none select-none"
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            setT(Math.min(1, Math.max(0, x * 48 / 48)));
          }}
          onPointerMove={(event) => {
            if (event.buttons === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            setT(Math.min(1, Math.max(0, x)));
          }}
        >
          {/* 精密刻度网格 */}
          {Array.from({ length: 11 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={i * 10}
              y1={0}
              x2={i * 10}
              y2={100}
              stroke="#e5e2da"
              strokeWidth={0.3}
            />
          ))}
          {Array.from({ length: 11 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={i * 10}
              x2={100}
              y2={i * 10}
              stroke="#e5e2da"
              strokeWidth={0.3}
            />
          ))}
          {/* 坐标轴 */}
          <line x1={0} y1={50} x2={100} y2={50} stroke="#d5d1c8" strokeWidth={0.5} />
          <line x1={50} y1={0} x2={50} y2={100} stroke="#d5d1c8" strokeWidth={0.5} />

          {/* 雾霾蓝灰交互曲线 */}
          <path d={path} fill="none" stroke="#4e677d" strokeWidth={1.2} strokeLinecap="round" />

          {/* 拖拽控制点 */}
          <circle cx={knob.x} cy={knob.y} r={3} fill="#4e677d" />
          <circle cx={knob.x} cy={knob.y} r={6} fill="none" stroke="#4e677d" strokeWidth={0.6} opacity={0.4} />
        </svg>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-[#e5e2da] bg-[#eff3f6] px-4 py-3">
        <div>
          <p className="text-[11px] text-[#5c646d]">相位 t</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#4e677d]">
            {t.toFixed(2)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={t}
            onChange={(event) => setT(Number(event.target.value))}
            aria-label="相位"
            className="w-full accent-[#4e677d]"
          />
        </div>
        <p className="shrink-0 text-[11px] text-[#5c646d]">拖动曲线试试</p>
      </div>
    </div>
  );
}

/**
 * 语文微玩具——一枚朱砂印泥风格的动态汉字结构卡。
 *
 * 点击卡片上的字，播放一次「拆解」动画并切换到下一个字。
 */
function ChineseMicroToy() {
  const glyphs = [
    { char: "思", hint: "心上有田，形思也" },
    { char: "明", hint: "日月同辉，光之义" },
    { char: "学", hint: "子盖上爻，学而时习" },
  ];
  const [index, setIndex] = useState(0);
  const [pulse, setPulse] = useState(false);

  const current = glyphs[index];

  const advance = () => {
    setPulse(true);
    window.setTimeout(() => {
      setPulse(false);
      setIndex((value) => (value + 1) % glyphs.length);
    }, 420);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6">
      <button
        type="button"
        onClick={advance}
        aria-label="拆解下一个汉字"
        className={cn(
          "group relative flex h-[168px] w-[168px] items-center justify-center rounded-2xl border-2 transition-all duration-300",
          pulse
            ? "scale-[0.95] border-[#8a6e63]"
            : "border-[#e2d6cf] hover:border-[#8a6e63]",
        )}
        style={{ background: "#f6f1ee" }}
      >
        <span
          className={cn(
            "font-serif text-[86px] leading-none text-[#8a6e63] transition-transform duration-300",
            pulse && "scale-90 opacity-60",
          )}
        >
          {current.char}
        </span>
      </button>

      <div className="text-center">
        <p className="text-[13px] font-medium text-[#1e242b]">{current.hint}</p>
        <p className="mt-1.5 text-[11.5px] text-[#5c646d]">
          点击字卡，播放笔顺与字源意象拆解
        </p>
      </div>

      <div className="flex gap-1.5">
        {glyphs.map((item, i) => (
          <button
            key={item.char}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={item.char}
            aria-pressed={i === index}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border font-serif text-[15px] transition-colors",
              i === index
                ? "border-[#8a6e63] bg-[#8a6e63] text-white"
                : "border-[#e2d6cf] bg-white text-[#8a6e63] hover:bg-[#f6f1ee]",
            )}
          >
            {item.char}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   视图 02 · 梦想课堂精简格言卡
   ══════════════════════════════════════════════════════════════ */

function DreamShowcase() {
  const { locale } = useLocale();
  const isEn = locale === "en";

  const creedTitle = isEn ? ABOUT.creedTitle.en : ABOUT.creedTitle.zh;
  const creedFormula = isEn
    ? ABOUT.creedFormula.en
    : ABOUT.creedFormula.zh;
  const creedQuote = isEn ? ABOUT.creedQuote.en : ABOUT.creedQuote.zh;

  return (
    <div className="flex h-full flex-col justify-center gap-6 p-7">
      <div>
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-[#a48a5e] uppercase">
          {isEn ? "Dream Classroom" : "梦想课堂"}
        </p>
        <h2 className="mt-3 font-serif text-[clamp(20px,2.3vw,30px)] leading-[1.42] text-[#1e242b]">
          {creedTitle}
          <br />
          <span className="text-[#4e677d]">{creedFormula}</span>
          <span className="text-[#8a6e63]">。</span>
        </h2>
      </div>

      <p className="border-l-2 border-[#ddd0b4] pl-4 font-serif text-[14px] leading-relaxed text-[#5c646d]">
        {creedQuote}
      </p>

      {/* 三个极简关键词徽章 */}
      <div className="flex flex-wrap gap-2">
        {PILLARS.map((pillar) => (
          <span
            key={pillar.no}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e2da] bg-[#f6f4ef] px-3 py-1.5 text-[12px] text-[#1e242b]"
          >
            <span className="text-[10px] tabular-nums text-[#a48a5e]">
              {pillar.no}
            </span>
            {isEn ? pillar.title.en : pillar.title.zh}
          </span>
        ))}
      </div>

      {/* 权威背书一行 */}
      <p className="text-[11.5px] leading-relaxed text-[#5c646d]">
        {DREAM_CLASSROOM.name}
        {isEn ? " (Houhai, Shenzhen Bay HQ)" : `（${DREAM_CLASSROOM.hqLabel}）`}
        {" · "}
        {isEn ? GLOBAL_VIEW.partner.en : GLOBAL_VIEW.partner.zh}
      </p>

      {/* 总部空间——五项能力并列 */}
      <div>
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-[#a48a5e] uppercase">
          {isEn ? HQ_SPACE.title.en : HQ_SPACE.title.zh}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {HQ_SPACE.items.map((item) => (
            <span
              key={item.zh}
              className="rounded-lg border border-[#e5e2da] bg-[#f6f4ef] px-2.5 py-1 text-[11px] text-[#5c646d]"
            >
              {isEn ? item.en : item.zh}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   视图 03 · 加入我们与合作加盟卡
   ══════════════════════════════════════════════════════════════ */

function JoinShowcase({
  onCopy,
  copied,
}: {
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const { locale } = useLocale();
  const isEn = locale === "en";

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <div>
        <h2 className="font-serif text-[20px] text-[#1e242b]">
          {isEn ? JOIN.title.en : JOIN.title.zh}
        </h2>
        <p className="mt-1 text-[12px] text-[#5c646d]">
          {isEn ? JOIN.subtitle.en : JOIN.subtitle.zh}
        </p>
      </div>

      {/* 两个通道 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {JOIN.channels.map((channel) => (
          <div
            key={channel.id}
            className="rounded-2xl border border-[#e5e2da] bg-[#f6f4ef] p-4"
          >
            <div className="flex items-center gap-1.5">
              {channel.id === "family" ? (
                <Heart size={14} strokeWidth={2.2} className="text-[#8a6e63]" />
              ) : (
                <Handshake size={14} strokeWidth={2.2} className="text-[#4e677d]" />
              )}
              <span className="text-[10.5px] font-medium tracking-[0.12em] text-[#5c646d] uppercase">
                {isEn ? channel.kicker.en : channel.kicker.zh}
              </span>
            </div>
            <h3 className="mt-2 text-[13.5px] font-semibold text-[#1e242b]">
              {isEn ? channel.title.en : channel.title.zh}
            </h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#5c646d]">
              {isEn ? channel.body.en : channel.body.zh}
            </p>
          </div>
        ))}
      </div>

      {/* 官方合作邮箱卡片 + 一键复制 */}
      {hasContactEmail() ? (
        <button
          type="button"
          onClick={() => onCopy(CONTACT_EMAIL)}
          className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5e2da] bg-white px-4 py-3 text-left transition-colors hover:bg-[#f6f4ef]"
        >
          <span className="min-w-0">
            <span className="block text-[10.5px] tracking-[0.12em] text-[#5c646d] uppercase">
              {isEn ? "Official Email" : "官方合作邮箱"}
            </span>
            <span className="mt-1 block truncate text-[13px] text-[#1e242b]">
              {CONTACT_EMAIL}
            </span>
          </span>
          {copied ? (
            <Check size={15} strokeWidth={2.4} className="shrink-0 text-[#a48a5e]" />
          ) : (
            <Copy size={15} strokeWidth={2.2} className="shrink-0 text-[#5c646d]" />
          )}
        </button>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#d5d1c8] bg-[#f6f4ef] px-4 py-3">
          <p className="text-[10.5px] tracking-[0.12em] text-[#8a8578] uppercase">
            {isEn ? "Official Email" : "官方合作邮箱"}
          </p>
          <p className="mt-1 text-[12px] text-[#8a8578]">
            {isEn ? "To be configured" : "待填入官方邮箱"}
          </p>
        </div>
      )}

      {/* 微信号 + 二维码预留方框 */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-[#e5e2da] bg-white px-4 py-3">
          <p className="text-[10.5px] tracking-[0.12em] text-[#5c646d] uppercase">
            WeChat
          </p>
          {hasWechat() ? (
            <button
              type="button"
              onClick={() => onCopy(WECHAT_ID)}
              className="mt-1 flex items-center gap-2 text-[13px] text-[#1e242b]"
            >
              {WECHAT_ID}
              {copied ? (
                <Check size={13} strokeWidth={2.4} className="text-[#a48a5e]" />
              ) : (
                <Copy size={13} strokeWidth={2.2} className="text-[#5c646d]" />
              )}
            </button>
          ) : (
            <p className="mt-1 text-[12px] text-[#8a8578]">待填入微信号</p>
          )}
        </div>

        {/* 二维码预留方框 */}
        <div className="flex h-[92px] w-[92px] items-center justify-center rounded-2xl border border-dashed border-[#d5d1c8] bg-[#f6f4ef]">
          {hasQrCode() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={QR_CODE_IMAGE}
              alt="官方联系二维码"
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            <div className="text-center">
              <Layers size={16} strokeWidth={2} className="mx-auto text-[#b9b4a8]" />
              <p className="mt-1 text-[9.5px] text-[#a8a398]">二维码</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
