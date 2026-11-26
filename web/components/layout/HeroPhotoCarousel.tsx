"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";
import { staticUrl } from "@/lib/static-data";

/**
 * 首页轮播窗 · HeroPhotoCarousel
 * ===============================
 *
 * 产品级的图片轮播卡片——填满右侧 38% 区域，圆角精致、细边框、
 * 柔和立体阴影。
 *
 * 行为
 * ----
 *
 * - 默认依次读取 ``/images/hero-1.jpg``、``hero-2.jpg``、``hero-3.jpg``；
 * - 自动 **5 秒**平滑交叉淡入淡出；
 * - 点击左右箭头或底部细进度条手动切换（手动切换会重置计时器）；
 * - 每张配一句**克制高级**的场景短注。
 *
 * 优雅容错
 * --------
 *
 * ⛔ **图片不存在时不能裂图、不能报错**。
 *
 * 实���做法是：每张图先挂一个 ``onError`` 探针。第一次加载失败就把
 * 这一张标记为「缺失」，换成一张**深牛津蓝学院风实景摄影预留画框**——
 * 深蓝渐变 + 细腻的网格纹理 + 明确的放置提示。
 *
 * 一旦用户把 ``hero-1.jpg`` 放进 ``web/public/images/``，刷新页面
 * 就会**自动**渲染真实图片，不需要改任何代码。
 */

/** 一张幻灯片。 */
interface Slide {
  /** 图片路径。 */
  src: string;
  /** 场景短注——中文。 */
  captionZh: string;
  /** 场景短注——英文。 */
  captionEn: string;
}

/** 三张幻灯片。 */
const SLIDES: Slide[] = [
  {
    src: staticUrl("/images/hero-1.jpg"),
    captionZh: "独立探索 · 直观理解几何与数理",
    captionEn: "Independent exploration · seeing geometry and number make sense",
  },
  {
    src: staticUrl("/images/hero-2.jpg"),
    captionZh: "家庭共研 · 跨越时差的无边界课堂",
    captionEn: "Family study · a classroom without borders or time zones",
  },
  {
    src: staticUrl("/images/hero-3.jpg"),
    captionZh: "深度思考 · 从公式到推演",
    captionEn: "Deep thinking · from formula to deduction",
  },
];

/** 自动切换间隔（毫秒）。 */
const AUTOPLAY_MS = 5000;

export default function HeroPhotoCarousel({ isEn }: { isEn: boolean }) {
  const [index, setIndex] = useState(0);
  const tw = useTraditional();
  /** 哪些图片加载失败了。 */
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  /** 用户手动交互的时间戳——用来重置自动播放计时。 */
  const lastInteraction = useRef(0);

  const go = useCallback((next: number) => {
    lastInteraction.current = Date.now();
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  /* ── 自动播放 ──────────────────────────────────────────────── */

  useEffect(() => {
    const timer = window.setInterval(() => {
      // 手动切换后给 5 秒缓冲再恢复自动播放。
      if (Date.now() - lastInteraction.current < AUTOPLAY_MS) return;
      setIndex((i) => (i + 1) % SLIDES.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="group relative h-full min-h-0 w-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_18px_48px_rgba(11,22,44,0.16)]">
      {/* 幻灯片 */}
      {SLIDES.map((slide, i) => {
        const isActive = i === index;
        const isMissing = missing[slide.src];
        return (
          <div
            key={slide.src}
            className={cn(
              "absolute inset-0 transition-opacity duration-[900ms] ease-out",
              isActive ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={!isActive}
          >
            {isMissing ? (
              <PlaceholderFrame isEn={isEn} index={i} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.src}
                alt={
                  isEn ? slide.captionEn : tw(slide.captionZh)
                }
                onError={() =>
                  setMissing((prev) => ({ ...prev, [slide.src]: true }))
                }
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
              />
            )}

            {/* 底部渐变 + 场景短注 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0B162C]/85 via-[#0B162C]/35 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-5 pb-4">
              <p className="text-[12.5px] leading-snug font-medium text-white/95 drop-shadow">
                {isEn ? slide.captionEn : tw(slide.captionZh)}
              </p>
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-white/55">
                {String(i + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        );
      })}

      {/* 左右箭头 */}
      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label={isEn ? "Previous" : tw("上一张")}
        className="absolute top-1/2 left-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#3B537F] bg-[#0B162C] text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <ChevronLeft size={16} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label={isEn ? "Next" : tw("下一张")}
        className="absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#3B537F] bg-[#0B162C] text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <ChevronRight size={16} strokeWidth={2.2} />
      </button>

      {/* 底部细进度条 */}
      <div className="absolute inset-x-5 bottom-1.5 flex items-center gap-1.5">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => go(i)}
            aria-label={isEn ? `Go to slide ${i + 1}` : tw(`切到第 ${i + 1} 张`)}
            aria-current={i === index}
            className="group/bar h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <span
              className={cn(
                "block h-full rounded-full bg-[#C59B38] transition-all",
                i === index ? "w-full" : "w-0 group-hover/bar:w-1/3",
              )}
              style={
                i === index
                  ? { transitionDuration: `${AUTOPLAY_MS}ms` }
                  : undefined
              }
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 预留画框
 * =========
 *
 * 图片缺失时的**高级深牛津蓝学院风实景摄影占位**。
 *
 * ⛔ 绝不显示浏览器默认的「裂图」图标，也**绝不**抛错。
 */
function PlaceholderFrame({ isEn, index }: { isEn: boolean; index: number }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0B162C]">
      {/* 细腻的摄影棚渐层 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 22% 18%, #1c3563 0%, #0B162C 58%, #060d1c 100%)",
        }}
      />

      {/* 建筑感网格纹理 */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.16]"
        aria-hidden
      >
        {Array.from({ length: 22 }, (_, i) => (
          <line
            key={`v-${i}`}
            x1={`${(i / 21) * 100}%`}
            y1="0"
            x2={`${(i / 21) * 100}%`}
            y2="100%"
            stroke="#93C5FD"
            strokeWidth={0.6}
          />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <line
            key={`h-${i}`}
            x1="0"
            y1={`${(i / 15) * 100}%`}
            x2="100%"
            y2={`${(i / 15) * 100}%`}
            stroke="#93C5FD"
            strokeWidth={0.6}
          />
        ))}
      </svg>

      {/* 几何构图元素——呼应数学图谱的节点与连线 */}
      <svg
        className="absolute inset-0 h-full w-full"
        aria-hidden
        viewBox="0 0 400 500"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M40 400 C 120 300, 180 340, 250 210 S 350 120, 390 90"
          fill="none"
          stroke="#C59B38"
          strokeWidth={1.4}
          opacity={0.5}
        />
        <circle cx="40" cy="400" r="5" fill="#93C5FD" opacity={0.7} />
        <circle cx="250" cy="210" r="4" fill="#C59B38" opacity={0.85} />
        <circle cx="390" cy="90" r="6" fill="none" stroke="#93C5FD" strokeWidth={1.4} />
      </svg>

      {/* 提示 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="font-mono text-[10.5px] tracking-[0.18em] text-white/40 uppercase">
          {String(index + 1).padStart(2, "0")} · RESERVED
        </span>
        <p className="mt-3 max-w-[16rem] text-[13px] leading-relaxed text-white/70">
          {isEn
            ? "Place hero-1~3.jpg in web/public/images/ and this frame renders in full high definition automatically."
            : "请将图片放入 web/public/images/hero-1~3.jpg —— 放入后此处立刻自动高清渲染。"}
        </p>
        <span className="mt-4 rounded-md border border-white/15 px-3 py-1.5 font-mono text-[10.5px] text-white/45">
          web/public/images/hero-{index + 1}.jpg
        </span>
      </div>
    </div>
  );
}
