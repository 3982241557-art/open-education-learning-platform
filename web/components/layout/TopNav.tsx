"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  Compass,
  Home,
  Languages,
  Trophy,
} from "lucide-react";
import GradeSelector from "@/components/common/GradeSelector";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ProfileDrawer } from "@/components/profile/ProfileDrawer";
import { useProfile } from "@/context/ProfileContext";
import { LOCALES, useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/cn";

/**
 * 极简吸顶导航栏
 * ==============
 *
 * 64px 高，象牙纸白实心底 + 1px 细底边 + 极轻投影。
 *
 * 为什么彻底废弃「左侧深蓝固定窄栏」
 * ---------------------------------
 *
 * 旧结构（210px 固定栏 + 内容区）的问题不是难看，是**它把「课程 →
 * 教具 → 报告」这条动线切成了三段**。用户每走一步都要重新跨越一次
 * 栏与内容的边界，眼睛要重新定位一次。
 *
 * Apple 教育 / PhET 的做法是把导航压到**顶部一条**，让内容区拿到
 * 完整的横向空间——动线是「往下走」，不是「往左走再往右走」。
 *
 * 三段式布局
 * ----------
 *
 * .. code-block:: text
 *
 *     ┌──────────────────────────────────────────────────────┐
 *     │ [OE] Open Education │ 首页 课程 计划 报告 │ 年级 简 头像 │
 *     └──────────────────────────────────────────────────────┘
 *
 * - **左**：极简徽标 + 英文标识，点击回首页；
 * - **中**：4 项主导航，用 ``grid-cols-[1fr_auto_1fr]`` 让它**真正
 *   居中**（不是「左对齐的居中」）；
 * - **右**：年级·年龄胶囊 + 简/繁/EN 分段按钮 + 头像胶囊。
 *
 * 激活指示
 * --------
 *
 * 用**下划线 + 胶囊底**双信号：胶囊底告诉用户「点击区域在哪」，
 * 下划线告诉用户「你在这儿」。两者都是实心色，不使用半透明。
 */
export default function TopNav() {
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const { displayName } = useProfile();
  const [profileOpen, setProfileOpen] = useState(false);

  /** 4 项主导航。 */
  const nav = [
    { href: "/", label: "首页", icon: Home },
    { href: "/courses", label: "探索课程", icon: Compass },
    { href: "/plan", label: "学习计划", icon: CalendarCheck },
    { href: "/report", label: "成长与报告", icon: Trophy },
  ];

  /** 当前路由是否命中这一项。 */
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header
        className="sticky top-0 z-50 h-16 shrink-0 border-b border-[#E5E7EB] bg-[#F8F7F4]"
        style={{ boxShadow: "0 1px 3px rgba(11,22,44,0.05)" }}
      >
        <div className="mx-auto grid h-full w-full max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
          {/* ── 左：徽标 + 标识 ── */}
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5"
            aria-label="Open Education 首页"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#0B162C] text-[12px] font-semibold tracking-tight text-white"
            >
              OE
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-[#0B162C]">
                Open Education
              </span>
              <span className="block truncate text-[10px] text-[#8A93A0]">
                开放教育学习平台
              </span>
            </span>
          </Link>

          {/* ── 中：4 项主导航 ── */}
          <nav
            className="flex items-center gap-0.5"
            aria-label="主导航"
          >
            {nav.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
                    active
                      ? "bg-white font-medium text-[#0B162C]"
                      : "text-[#55606E] hover:text-[#0B162C]",
                  )}
                  style={
                    active
                      ? { boxShadow: "0 1px 3px rgba(11,22,44,0.08)" }
                      : undefined
                  }
                >
                  <Icon size={14} strokeWidth={2} />
                  <span className="hidden sm:inline">{item.label}</span>
                  {/* 激活下划线——细金线，安静但明确。 */}
                  {active ? (
                    <motion.span
                      layoutId="oe-topnav-underline"
                      className="absolute -bottom-[13px] left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full"
                      style={{ background: "#B89B5E" }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* ── 右：年级 · 语言 · 头像 ── */}
          <div className="flex items-center justify-end gap-2">
            <GradeSelector compact align="right" className="hidden sm:block" />

            {/* 简 / 繁 / EN —— 真实切换，不是装饰。 */}
            <div
              className="flex items-center overflow-hidden rounded-lg border border-[#E5E7EB] bg-white"
              role="group"
              aria-label="语言切换"
            >
              <span className="flex h-7 items-center px-1.5 text-[#8A93A0]">
                <Languages size={12} strokeWidth={2} />
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
                      active
                        ? "bg-[#0B162C] font-medium text-white"
                        : "text-[#55606E] hover:text-[#0B162C]",
                    )}
                  >
                    {item.id === "zh-CN"
                      ? "简"
                      : item.id === "zh-TW"
                        ? "繁"
                        : "EN"}
                  </button>
                );
              })}
            </div>

            {/* 头像胶囊 —— 点击滑出个人档案抽屉。 */}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              title={displayName}
              aria-label="个人档案"
              className="flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white py-0.5 pl-0.5 pr-2 transition-colors hover:border-[#B89B5E]"
            >
              <UserAvatar size={24} />
              <span className="hidden max-w-[84px] truncate text-[12px] font-medium text-[#0F172A] lg:inline">
                {displayName}
              </span>
            </button>
          </div>
        </div>
      </header>

      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  );
}
