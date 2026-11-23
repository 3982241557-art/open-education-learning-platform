"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronUp,
  Compass,
  GraduationCap,
  Languages,
  Star,
  Trophy,
  User,
  X,
} from "lucide-react";
import { GRADE_OPTIONS, useGrade } from "@/context/GradeContext";
import { LOCALES, useLocale } from "@/context/LocaleContext";
import { useProfile } from "@/context/ProfileContext";
import { summarizeAll } from "@/lib/star-ledger";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { cn } from "@/lib/cn";

/**
 * 底部悬浮岛（Bottom Floating Dock）
 * ================================
 *
 * .. code-block:: text
 *
 *     ┌────────────────────────────────────────────────────────────┐
 *     │  ( 画布铺满 100vh )                                        │
 *     │                                                            │
 *     │              ╭──────────────────────────────────╮          │
 *     │              │ OE │ 课程 │ 报告 │ ⭐3 │ ⎘ │简繁EN│档案│ │
 *     │              ╰──────────────────────────────────╯          │
 *     └────────────────────────────────────────────────────────────┘
 *
 * 为什么取消顶部栏与左侧栏
 * ------------------------
 *
 * 旧版有**两条**常驻导航（64px 顶部栏 + 210px 左侧栏）。它们的
 * 代价不是「不好看」，是三件事：
 *
 * 1. **横向空间被吃掉**——1400px 屏幕只剩 1180px，PhET 级教具
 *    根本铺不开；
 * 2. **滚动被切成两段**——侧栏不动、内容自己滚，鼠标滚到侧栏
 *    就「卡住」；
 * 3. **视觉重心永远在上方**——用户每次都要「抬头找菜单」。
 *
 * 现在只剩**底部一个胶囊**。它贴地、在视线自然落点（阅读时视线
 * 会往下走到 3/4 屏以下），点得到、也不遮内容。
 *
 * 零滚动契约
 * ----------
 *
 * 悬浮岛固定 ``bottom-4``（16px），高 52px，所以画布底部必须预留
 * ``76px``（= 52 + 16 + 8 余量）。全局布局用 ``pb-[76px]`` 实现。
 *
 * 100% 实心
 * --------
 *
 * ⛔ 岛内**没有**毛玻璃。100% 纯白胶囊 + 1px #E5E2DA 边框 +
 *    一层 ``0 8px 30px rgba(30,36,43,.08)`` 极轻投影。
 */

/** localStorage 里记录「用户已经进过站」的键。 */
export const OE_ENTERED_KEY = "oe_entered";

export default function BottomFloatingDock() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const { grade, setGrade, option } = useGrade();
  const { displayName } = useProfile();

  const [gradeOpen, setGradeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [stars, setStars] = useState(0);

  const dockRef = useRef<HTMLDivElement>(null);

  /** 是否在上课台（/learn）。 */
  const inLesson = pathname.startsWith("/learn");

  /** 点外部关闭所有弹层。 */
  useEffect(() => {
    if (!gradeOpen && !profileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) {
        setGradeOpen(false);
        setProfileOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGradeOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [gradeOpen, profileOpen]);

  /** 星星总数——随账本变化实时刷新。 */
  useEffect(() => {
    const refresh = () => setStars(summarizeAll().stars);
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [pathname]);

  /** 课程按钮——在上课台内显示「← 课程」。 */
  const courseHref = "/courses";
  const courseLabel = inLesson ? "← 课程" : "课程";

  /** 当前路由是否命中。 */
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  /** 岛内统一的胶囊按钮样式。 */
  const pill = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors",
      active
        ? "bg-[#1e242b] text-white"
        : "text-[#5c646d] hover:bg-[#f2efe9] hover:text-[#1e242b]",
    );

  return (
    <>
      {/* ── 向上弹出的年级选择面板 ── */}
      {gradeOpen ? (
        <div
          role="listbox"
          className="fixed bottom-[84px] left-1/2 z-50 w-[300px] -translate-x-1/2 overflow-hidden rounded-2xl border border-[#e5e2da] bg-white shadow-[0_18px_44px_-14px_rgba(30,36,43,0.22)]"
        >
          <div className="flex items-center justify-between border-b border-[#e5e2da] px-4 py-2.5">
            <p className="text-[10.5px] font-medium tracking-[0.14em] text-[#5c646d] uppercase">
              当前年级
            </p>
            <button
              type="button"
              onClick={() => setGradeOpen(false)}
              aria-label="关闭"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#5c646d] hover:bg-[#f2efe9]"
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1.5">
            {GRADE_OPTIONS.map((item) => {
              const active = item.number === grade;
              return (
                <button
                  key={item.number}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setGrade(item.number);
                    setGradeOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                    active
                      ? "bg-[#1e242b] text-white"
                      : "text-[#1e242b] hover:bg-[#f6f4ef]",
                  )}
                >
                  <span
                    className={cn(
                      "w-6 shrink-0 text-[12px] font-semibold tabular-nums",
                      active ? "text-[#c0a678]" : "text-[#5c646d]",
                    )}
                  >
                    {item.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[10.5px]",
                        active ? "text-white/60" : "text-[#5c646d]",
                      )}
                    >
                      {item.alias} · {item.ageRange[0]}–{item.ageRange[1]}岁
                    </span>
                  </span>
                  {active ? (
                    <Check size={13} strokeWidth={2.6} className="shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── 向上弹出的个人档案卡 ── */}
      {profileOpen ? (
        <div className="fixed bottom-[84px] right-4 z-50 w-[300px] overflow-hidden rounded-2xl border border-[#e5e2da] bg-white shadow-[0_18px_44px_-14px_rgba(30,36,43,0.22)] sm:right-1/2 sm:-translate-x-1/2 lg:right-6 lg:translate-x-0">
          <div className="flex items-center gap-3 border-b border-[#e5e2da] px-4 py-3.5">
            <UserAvatar size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-[#1e242b]">
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-[#5c646d]">
                {option ? option.name : "未设置年级"} · 已获 {stars} 颗星
              </p>
            </div>
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              aria-label="关闭"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#5c646d] hover:bg-[#f2efe9]"
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
          <div className="p-3">
            <p className="mb-2 text-[10.5px] font-medium tracking-[0.14em] text-[#5c646d] uppercase">
              快速操作
            </p>
            <div className="space-y-1.5">
              <Link
                href="/report"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 rounded-xl border border-[#e5e2da] bg-[#f6f4ef] px-3 py-2 text-[12.5px] text-[#1e242b] transition-colors hover:bg-[#f2efe9]"
              >
                <Trophy size={13} strokeWidth={2.2} className="text-[#a48a5e]" />
                成长中心与 Result Report
              </Link>
              <Link
                href={`/courses?grade=${grade}`}
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 rounded-xl border border-[#e5e2da] bg-[#f6f4ef] px-3 py-2 text-[12.5px] text-[#1e242b] transition-colors hover:bg-[#f2efe9]"
              >
                <Compass size={13} strokeWidth={2.2} className="text-[#4e677d]" />
                浏览 {option ? option.name : "课程"}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  router.push("/report");
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-[#e5e2da] bg-white px-3 py-2 text-[12.5px] text-[#1e242b] transition-colors hover:bg-[#f6f4ef]"
              >
                <User size={13} strokeWidth={2.2} className="text-[#8a6e63]" />
                完整档案与设置
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 悬浮岛本体 ── */}
      <div
        ref={dockRef}
        data-oe-dock
        className="fixed bottom-4 left-1/2 z-40 flex h-13 -translate-x-1/2 items-center gap-1 rounded-full border border-[#e5e2da] bg-white px-3 shadow-[0_8px_30px_rgba(30,36,43,0.08)]"
      >
        {/* 导航组 */}
        <Link
          href="/?home=1"
          aria-label="Open Education 首页"
          className={cn(
            "inline-flex h-9 items-center rounded-full px-3 text-[12px] font-semibold tracking-tight transition-colors",
            isActive("/")
              ? "bg-[#1e242b] text-white"
              : "text-[#1e242b] hover:bg-[#f2efe9]",
          )}
        >
          OE
        </Link>

        <Link href={courseHref} className={pill(isActive("/courses"))}>
          {inLesson ? (
            <ArrowLeft size={13} strokeWidth={2.4} />
          ) : (
            <Compass size={13} strokeWidth={2.2} />
          )}
          <span>{courseLabel}</span>
        </Link>

        <Link href="/report" className={pill(isActive("/report"))}>
          <Trophy size={13} strokeWidth={2.2} />
          <span>报告</span>
        </Link>

        <Link
          href="/report"
          aria-label={`已获得 ${stars} 颗星`}
          className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-[#6e5a38] transition-colors hover:bg-[#f7f3ea]"
        >
          <Star size={13} strokeWidth={2.2} className="fill-[#a48a5e] text-[#a48a5e]" />
          <span className="tabular-nums">{stars}</span>
        </Link>

        {/* 导航与工具之间的极细竖线 */}
        <span
          aria-hidden
          className="mx-1 h-5 w-px shrink-0 bg-[#e5e2da]"
        />

        {/* 工具组 */}
        <button
          type="button"
          onClick={() => {
            setGradeOpen((value) => !value);
            setProfileOpen(false);
          }}
          aria-expanded={gradeOpen}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-[#1e242b] transition-colors hover:bg-[#f2efe9]"
        >
          <GraduationCap size={13} strokeWidth={2.2} className="text-[#5c646d]" />
          <span className="hidden sm:inline">
            {option ? `${option.name} · ${option.ageRange[0]}岁` : "年级"}
          </span>
          <ChevronUp
            size={12}
            strokeWidth={2.4}
            className={cn(
              "shrink-0 text-[#5c646d] transition-transform",
              gradeOpen && "rotate-180",
            )}
          />
        </button>

        {/* 简 / 繁 / EN */}
        <div
          className="flex items-center overflow-hidden rounded-full border border-[#e5e2da] bg-white"
          role="group"
          aria-label="语言切换"
        >
          <span className="flex h-7 items-center pl-2 text-[#5c646d]">
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
                    ? "bg-[#1e242b] font-medium text-white"
                    : "text-[#5c646d] hover:bg-[#f2efe9]",
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

        {/* 档案 */}
        <button
          type="button"
          onClick={() => {
            setProfileOpen((value) => !value);
            setGradeOpen(false);
          }}
          aria-expanded={profileOpen}
          aria-label="个人档案"
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-1.5 pr-2.5 transition-colors hover:bg-[#f2efe9]"
        >
          <UserAvatar size={22} />
          <span className="hidden max-w-[72px] truncate text-[12px] font-medium text-[#1e242b] lg:inline">
            {displayName}
          </span>
        </button>
      </div>
    </>
  );
}
