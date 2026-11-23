"use client";

import { Globe2, Languages, MapPin } from "lucide-react";
import {
  LOCALES,
  REGIONS,
  useLocale,
  type Locale,
  type Region,
} from "@/context/LocaleContext";
import {
  BRAND_SUBTITLE,
  HQ_LABEL,
  PLATFORM_NAME,
  PLATFORM_NAME_EN,
} from "@/lib/branding";
import { cn } from "@/lib/cn";

/**
 * 语言 / 地区切换器
 * ==================
 *
 * 两颗极简的按钮——语言（简 / 繁 / EN）与地区线路。
 *
 * 为什么放在顶栏右上角
 * --------------------
 *
 * 海外用户打开一个中文网站，**第一件事**就是找语言开关。它必须在
 * 视线第一次落下的地方，而不是藏在「设置」里——那等于没有。
 *
 * 为什么用「分段按钮」而不是下拉框
 * ------------------------------
 *
 * 下拉框需要**点开**才能看到有哪些选项。而这里三个语言就是全部，
 * 一眼可见 = 一眼可选。地区同理——六个选项铺开成一条紧凑的分段
 * 控件，比下拉框少一次点击。
 *
 * 「润物细无声」
 * --------------
 *
 * 这些控件**不抢戏**：默认折叠成一个按钮，显示当前值（简 / 中港）。
 * 只有用户主动 hover 或点击时才展开成完整选项。
 *
 * 但它必须**始终可达**——海外用户不知道它在哪儿。所以折叠态也是
 * 一个真按钮，不是纯装饰。
 */
export function LocaleRegionSwitcher({
  className = "",
  variant = "bar",
}: {
  className?: string;
  /** ``bar`` 用于顶栏（深色底），``panel`` 用于独立面板。 */
  variant?: "bar" | "panel";
}) {
  const { locale, setLocale, region, setRegion } = useLocale();
  const isBar = variant === "bar";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* ── 语言 ── */}
      <div
        className={cn(
          "flex items-center overflow-hidden rounded-lg border",
          isBar
            ? "border-white/20 bg-white/5"
            : "border-[var(--border)] bg-white",
        )}
        role="group"
        aria-label="语言"
      >
        <span
          className={cn(
            "flex h-7 items-center px-1.5",
            isBar ? "text-white/70" : "text-[var(--muted-foreground)]",
          )}
          title="语言 / Language"
        >
          <Languages size={13} strokeWidth={2} />
        </span>
        {LOCALES.map((item) => {
          const active = item.id === locale;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setLocale(item.id)}
              aria-pressed={active}
              title={item.nativeLabel}
              className={cn(
                "h-7 px-1.5 text-[11px] transition-colors",
                isBar
                  ? active
                    ? "bg-white text-[#1e242b] font-medium"
                    : "text-white/70 hover:text-white"
                  : active
                    ? "bg-[var(--primary)] text-white font-medium"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
              )}
            >
              {item.id === "zh-CN" ? "简" : item.id === "zh-TW" ? "繁" : "EN"}
            </button>
          );
        })}
      </div>

      {/* ── 地区线路 ── */}
      <div
        className={cn(
          "flex items-center overflow-hidden rounded-lg border",
          isBar
            ? "border-white/20 bg-white/5"
            : "border-[var(--border)] bg-white",
        )}
        role="group"
        aria-label="地区"
      >
        <span
          className={cn(
            "flex h-7 items-center px-1.5",
            isBar ? "text-white/70" : "text-[var(--muted-foreground)]",
          )}
          title="地区与线路 / Region"
        >
          <MapPin size={13} strokeWidth={2} />
        </span>
        {REGIONS.map((item) => {
          const active = item.id === region;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRegion(item.id)}
              aria-pressed={active}
              title={`${item.nativeLabel} · 优先 ${item.preferredProvider === "bilibili" ? "B 站" : "YouTube"} 线路`}
              className={cn(
                "h-7 px-1.5 text-[11px] transition-colors",
                isBar
                  ? active
                    ? "bg-white text-[#1e242b] font-medium"
                    : "text-white/70 hover:text-white"
                  : active
                    ? "bg-[var(--primary)] text-white font-medium"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 顶栏品牌条
 * ==========
 *
 * 「开放教育学习平台 · 深圳后海总部 | Open Education Learning Platform · Houhai HQ, Shenzhen」
 *
 * 主副标题的形式
 * --------------
 *
 * **中文在前、英文在后**——因为主要用户是华人，中文是母语；
 * 英文跟在后面，是给海外英文用户和搜索引擎看的。
 *
 * 副标题用 ``|`` 分隔中文与英文段落。这**不是**排版偷懒——
 * 它让两套语言在视觉上分成两组，避免读成
 * 「深圳后海总部 | Open Education Learning Platform · Houhai HQ, Shenzhen」这样的
 * 断裂句子。
 */
export function BrandBar({
  className = "",
  showSwitcher = false,
}: {
  className?: string;
  /** 是否在右侧挂上语言 / 地区切换器。 */
  showSwitcher?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* 徽标 */}
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-[13px] font-bold text-white"
      >
        开
      </span>

      <div className="min-w-0">
        <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em]">
          {PLATFORM_NAME}
          <span className="mx-1.5 text-[var(--muted-foreground)]">·</span>
          <span className="text-[var(--muted-foreground)]">{HQ_LABEL}</span>
        </h1>
        <p className="truncate text-[10.5px] tracking-[0.01em] text-[var(--muted-foreground)]">
          {BRAND_SUBTITLE}
        </p>
      </div>

      {showSwitcher ? (
        <div className="ml-auto">
          <LocaleRegionSwitcher />
        </div>
      ) : null}
    </div>
  );
}

/**
 * 极简底部品牌栏
 * ================
 *
 * 全站统一的页脚。
 *
 * 为什么需要它
 * ------------
 *
 * 对于一个**面向全球华人**的平台，「我们是谁、在哪里」不能只藏在
 * 关于页面里——很多海外用户是第一次访问，靠的是「这看起来像不像
 * 一个值得信任的机构」来判断。
 *
 * 页脚给出**物理锚点**（深圳后海总部）+ **情感定位**（连接全球华人
 * 的终身学习家园）+ **国际可读性**（英文对照）。
 *
 * 极简到极致——一行字，一条顶边线，没有多余的装饰。
 */
export function BrandFooter({ className = "" }: { className?: string }) {
  const { locale } = useLocale();
  const text =
    locale === "en"
      ? "Open Education Learning Platform (Houhai HQ, Shenzhen) · A lifelong learning hub for global Chinese"
      : "开放教育学习平台（深圳后海总部） · 连接全球华人的终身学习家园 | Open Education Learning Platform";

  return (
    <footer
      className={cn(
        "shrink-0 border-t border-[var(--border)] bg-white px-4 py-2.5",
        className,
      )}
      data-seek-brand-footer
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] tracking-[0.01em] text-[var(--muted-foreground)]">
          {text}
        </p>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
          <Globe2 size={11} strokeWidth={2} />
          <span className="tabular-nums">
            {PLATFORM_NAME_EN} · {HQ_LABEL}
          </span>
        </p>
      </div>
    </footer>
  );
}
