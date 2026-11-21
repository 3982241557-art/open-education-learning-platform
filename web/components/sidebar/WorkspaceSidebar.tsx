"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Github,
  MoreHorizontal,
} from "lucide-react";
import { PRIMARY_NAV, SECONDARY_NAV, DEVELOPER_NAV, type NavEntry } from "./nav-entries";
import { useShellActions } from "@/context/ShellActionsContext";
import { cn } from "@/lib/cn";
import { PLATFORM_SHORT_NAME, HQ_LABEL } from "@/lib/branding";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useProfile } from "@/context/ProfileContext";
import { ProfileDrawer } from "@/components/profile/ProfileDrawer";

/**
 * 侧边栏在**阅读状态**下自动收缩成窄图标栏。
 *
 * 判断依据是路径：进入某门教材（``/learning/courses/<id>``）时，
 * 横向空间要留给正文与双 AI，根导航收成图标条。用户随时可以手动
 * 展开——记住用户的选择，不强行覆盖。
 */
function isReadingRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/learning\/courses\/[^/]+/.test(pathname);
}

function NavLink({
  entry,
  collapsed,
  onNavigate,
}: {
  entry: NavEntry;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active =
    entry.href === "/"
      ? pathname === "/"
      : pathname === entry.href || pathname.startsWith(`${entry.href}/`);

  const Icon = entry.icon;

  if (collapsed) {
    return (
      <Link
        href={entry.href}
        onClick={onNavigate}
        title={entry.tooltipKey ?? entry.label}
        aria-label={entry.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "seek-rail-item flex h-9 w-9 items-center justify-center rounded-lg",
          active && "data-[active=true]",
        )}
        data-active={active ? "true" : "false"}
      >
        <Icon size={16} strokeWidth={1.8} />
      </Link>
    );
  }

  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      title={entry.tooltipKey}
      aria-current={active ? "page" : undefined}
      className={cn(
        "seek-rail-item flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
        active && "font-medium",
      )}
      data-active={active ? "true" : "false"}
    >
      <Icon size={16} strokeWidth={1.8} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
    </Link>
  );
}

/**
 * 工作区侧边栏。
 *
 * 两种形态：
 *
 * - **展开**（默认）—— 品牌 + 导航 + 设置；
 * - **收起**（窄图标栏）—— 只留图标与展开按钮，在阅读教材时自动进入。
 */
export default function WorkspaceSidebar() {
  const pathname = usePathname();
  const reading = isReadingRoute(pathname);
  const { actions: shellActions } = useShellActions();
  const { displayName, profile } = useProfile();

  /** 个人档案抽屉是否打开。 */
  const [profileOpen, setProfileOpen] = useState(false);

  /** 地区名——档案卡上的小标签。 */
  const regionName = useMemo(() => {
    const map: Record<string, string> = {
      cn: "中国大陆",
      hktw: "中国香港 / 台湾",
      apac: "亚太与东南亚",
      na: "北美",
      eu: "欧洲",
      anz: "澳新",
    };
    return map[profile.region] ?? "未设置地区";
  }, [profile.region]);

  // 用户的手动选择。三态：未选择（跟随路由自动）/ 强制展开 / 强制收起。
  const [manual, setManual] = useState<"auto" | "expanded" | "collapsed">("auto");
  const [mobileOpen, setMobileOpen] = useState(false);
  /**
   * 开发者入口是否展开。
   *
   * 默认**折叠**——「设置」「能力库」在阅读时是噪声。用户主动点开
   * 才看得到，但**永远**看得见（不藏掉，只是收起）。
   */
  const [devOpen, setDevOpen] = useState(false);

  const collapsed =
    manual === "auto" ? reading : manual === "collapsed";

  // 离开阅读区后恢复自动模式。
  useEffect(() => {
    setManual("auto");
  }, [pathname]);

  // 移动端抽屉开合。
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggle = () => {
    setManual(collapsed ? "expanded" : "collapsed");
  };

  return (
    <aside
      className={cn(
        // 深蓝导航栏——整个界面的「骨架」。
        //
        // 用深海蓝把它跟内容区彻底分开：内容区是浅灰白 + 纯白卡片，
        // 导航栏是深蓝 + 纯白图标。两种明度并置，视线自然知道
        // 「这一条是导航，不是在讲内容」。
        "seek-rail flex h-full shrink-0 flex-col border-r transition-[width] duration-200",
        // 收起态 48px——模块二要求的「最左侧窄图标栏」宽度。
        // 之前是 52px，多出的 4px 在这个布局下毫无意义。
        collapsed ? "w-[48px]" : "w-[210px]",
        "max-md:w-[260px] max-md:shadow-xl",
      )}
    >
      {/* ── 左上角：用户个人档案 ──
       *
       * 品牌块被**个人档案卡**取代了。
       *
       * 原因：左上角那个位置是用户视线最先落下的地方。放一个静态
       * logo 太浪费——放「这是谁」的入口才有用。而品牌标识挪到了
       * 顶部栏与底部栏（首页顶栏、工作区底部品牌栏），不会丢。
       *
       * 收起态（48px）只剩一个圆形头像——依然可点。
       */}
      <div className="shrink-0 border-b border-white/10">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          title={displayName}
          className={cn(
            "flex w-full items-center transition-colors hover:bg-white/8",
            collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2.5",
          )}
        >
          <UserAvatar size={collapsed ? 24 : 30} />
          {!collapsed ? (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[12.5px] font-medium text-white">
                {displayName}
              </span>
              {/* 所在地区小标签——一眼知道自己「在哪」。 */}
              <span className="mt-0.5 block truncate text-[9.5px] leading-tight text-white/50">
                {regionName}
              </span>
            </span>
          ) : null}
        </button>
      </div>

      {/* 导航 */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto",
          collapsed ? "flex flex-col items-center gap-1 p-2" : "p-2",
        )}
      >
        {/* ── 页面级动作（[☰ 选课] / [📝 笔记]） ──────────────────────
         *
         * 这些按钮由**当前页面自己注册**（见 ``ShellActionsContext``）。
         *
         * 它们排在导航之上，是因为它们属于「**当前这一步**」的快捷
         * 入口——用户想打开选课目录时，视线正好落在这里。放在导航
         * 底下会让它们淹没在一堆路由链接里。
         */}
        {shellActions.length > 0 && (
          <>
            <div
              className={cn(
                "flex gap-1",
                collapsed ? "flex-col items-center" : "flex-row",
              )}
            >
              {shellActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                    aria-label={action.label}
                    title={action.label}
                    className={cn(
                      "seek-rail-item flex h-9 w-9 items-center justify-center rounded-lg",
                      collapsed ? "w-9" : "flex-1",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
            <div className="my-2 h-px w-full bg-white/10" />
          </>
        )}

        <div className={cn(collapsed ? "contents" : "space-y-0.5")}>
          {PRIMARY_NAV.map((entry) => (
            <NavLink
              key={entry.href}
              entry={entry}
              collapsed={collapsed}
            />
          ))}
        </div>

        {collapsed ? (
          <>
            <div className="my-2 h-px w-6 bg-white/12" />
            <div className="flex flex-col items-center gap-1">
              {SECONDARY_NAV.map((entry) => (
                <NavLink
                  key={entry.href}
                  entry={entry}
                  collapsed
                />
              ))}
              {/* 收起态下开发者入口用一个「更多」按钮带出来。 */}
              <button
                type="button"
                onClick={() => setDevOpen((value) => !value)}
                aria-expanded={devOpen}
                aria-label="开发者入口"
                title="开发者入口"
                className={cn(
                  "seek-rail-item flex h-9 w-9 items-center justify-center rounded-lg",
                  devOpen && "bg-white/12 text-white",
                )}
              >
                <MoreHorizontal size={16} strokeWidth={1.8} />
              </button>
              {devOpen &&
                DEVELOPER_NAV.map((entry) => (
                  <NavLink key={entry.href} entry={entry} collapsed />
                ))}
            </div>
          </>
        ) : (
          <>
            <div className="my-3 border-t border-white/10" />
            <div className="space-y-0.5">
              {SECONDARY_NAV.map((entry) => (
                <NavLink key={entry.href} entry={entry} collapsed={false} />
              ))}
            </div>

            {/*
              开发者入口——默认折叠。

              「设置」「能力库」是配置项，不是学习内容。放在阅读路径上
              会抢走注意力，所以默认收起；但绝不隐藏——用户需要时
              点一下就出来。
            */}
            <div className="mt-2 border-t border-white/10 pt-2">
              <button
                type="button"
                onClick={() => setDevOpen((value) => !value)}
                aria-expanded={devOpen}
                className="seek-rail-item flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
              >
                <MoreHorizontal size={14} strokeWidth={1.8} />
                开发者入口
                <ChevronDown
                  size={12}
                  strokeWidth={2}
                  className={cn(
                    "ml-auto transition-transform",
                    devOpen && "rotate-180",
                  )}
                />
              </button>
              {devOpen && (
                <div className="mt-1 space-y-0.5">
                  {DEVELOPER_NAV.map((entry) => (
                    <NavLink key={entry.href} entry={entry} collapsed={false} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </nav>

      {/* ── 底部极简入口 ──
       *
       * 「开源资源审核」是**低频但重要**的运营入口——它不该挤进主
       * 导航（那里只有 4 项），但也绝不能藏到看不见的地方。
       *
       * 所以放在底部：一个 24px 的小图标 + 悬停说明。
       */}
      <div className="shrink-0 border-t border-white/10 px-2 pt-1.5">
        <Link
          href="/review/github"
          title="开源资源审核台"
          aria-label="开源资源审核台"
          className="seek-rail-item flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[11.5px] text-white/60 transition-colors hover:text-white"
        >
          <Github size={14} strokeWidth={1.8} />
          {!collapsed ? <span>开源资源审核</span> : null}
        </Link>
      </div>

      {/* 展开 / 收起切换 */}
      <div
        className={cn(
          "shrink-0 border-t border-white/10 p-2",
          collapsed ? "flex justify-center" : "",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "展开导航" : "收起导航"}
          title={collapsed ? "展开导航" : "收起导航"}
          className={cn(
            "seek-rail-item inline-flex items-center gap-1.5 rounded-lg text-[11.5px]",
            collapsed
              ? "h-8 w-8 justify-center"
              : "w-full px-2.5 py-1.5",
          )}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={1.8} />
          ) : (
            <>
              <ChevronLeft size={14} strokeWidth={1.8} />
              收起导航
            </>
          )}
        </button>
      </div>
      {/* 个人中心抽屉 */}
      <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
    </aside>
  );
}
