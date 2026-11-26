"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Compass, FlaskConical, Trophy } from "lucide-react";
import { LOCALES, useLocale } from "@/context/LocaleContext";
import { useProfile } from "@/context/ProfileContext";
import { useMathTaxonomy } from "@/context/MathTaxonomyContext";
import ChainFilter from "@/components/layout/ChainFilter";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";

export interface WorkspaceSidebarProps {
  children?: ReactNode;
}

export default function WorkspaceSidebar({ children }: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const { displayName } = useProfile();
  const { summary, taxonomy, chainProgress, activeChainId, setActiveChainId } =
    useMathTaxonomy();
  const [profileOpen, setProfileOpen] = useState(false);
  const tw = useTraditional();
  // 默认昵称是简体中文的「学习者」——繁体模式下需要转换。
  const displayLabel =
    displayName === "学习者" ? tw(displayName) : displayName;

  const stars = summary.stars;
  const badges = summary.badges;

  return (
    <aside className="relative flex h-screen w-60 shrink-0 flex-col bg-[#0B162C] text-white">
      <Link
        href="/?home=1"
        className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1D4ED8] text-[13px] font-bold">
          OE
        </span>
        <span className="text-[13px] leading-tight">
          <span className="block font-semibold tracking-tight">Open Education</span>
          <span className="block text-[10.5px] text-white/55">
            {locale === "en" ? "Learning Platform" : tw("开放教育学习平台")}
          </span>
        </span>
      </Link>
      <nav className="shrink-0 px-3 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors",
                active
                  ? "bg-[#1D4ED8] text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <item.Icon size={15} strokeWidth={2.2} />
              {locale === "en" ? item.labelEn : tw(item.labelZh)}
            </Link>
          );
        })}
      </nav>

      {children}

      {/* 逻辑链筛选器 —— 只在「学习地图」页显示 */}
      {pathname.startsWith("/map") && taxonomy ? (
        <ChainFilter
          chains={taxonomy.chains}
          progress={chainProgress}
          activeChainId={activeChainId}
          onSelect={setActiveChainId}
          isEn={locale === "en"}
        />
      ) : null}

      {/* ── 底部：极简三语切换 + 学习者档案 ── */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div
          className="flex items-center overflow-hidden rounded-lg border border-white/12"
          role="group"
          aria-label={locale === "en" ? "Language" : tw("语言切换")}
        >
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
                  "h-8 flex-1 text-[11.5px] transition-colors",
                  active
                    ? "bg-[#1D4ED8] font-medium text-white"
                    : "text-white/60 hover:bg-white/8 hover:text-white",
                )}
              >
                {item.id === "zh-CN" ? "简" : item.id === "zh-TW" ? "繁" : "EN"}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          aria-expanded={profileOpen}
          className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/8"
        >
          <UserAvatar size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-white">
              {displayLabel}
            </span>
            <span className="block truncate text-[10px] text-white/50">
              {locale === "en"
                ? `${stars} stars · ${badges} badges`
                : `${stars} ${tw("颗星")} · ${badges} ${tw("枚徽章")}`}
            </span>
          </span>
        </button>
      </div>

      {profileOpen ? (
        <div className="absolute bottom-16 left-3 z-50 w-[216px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] shadow-[0_18px_44px_-14px_rgba(11,22,44,0.35)]">
          <div className="border-b border-[#E2E8F0] px-3.5 py-3">
            <p className="truncate text-[13px] font-semibold">{displayLabel}</p>
            <p className="mt-0.5 text-[11px] text-[#334155]">
              {locale === "en"
                ? `${stars} stars · ${badges} chain badges`
                : `累计 ${stars} 颗星 · ${badges} 枚逻辑链徽章`}
            </p>
          </div>
          <div className="p-1.5">
            <Link
              href="/report"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] transition-colors hover:bg-[#F1F5F9]"
            >
              <Trophy size={13} strokeWidth={2.2} className="text-[#C59B38]" />
              {locale === "en" ? "Growth & Report" : "成长与报告"}
            </Link>
            <Link
              href="/map"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] transition-colors hover:bg-[#F1F5F9]"
            >
              <Compass size={13} strokeWidth={2.2} className="text-[#1D4ED8]" />
              {locale === "en" ? "Math Map" : "数学学习地图"}
            </Link>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

/** 主导航三项。 */
const NAV_ITEMS = [
  { href: "/map", labelZh: "学习地图", labelEn: "Math Map", Icon: Compass },
  { href: "/lab", labelZh: "实验工坊", labelEn: "Lab", Icon: FlaskConical },
  { href: "/report", labelZh: "成长与报告", labelEn: "Report", Icon: Trophy },
];

