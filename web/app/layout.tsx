import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Noto_Serif_SC,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import { AppShellProvider } from "@/context/AppShellContext";
import { ChatProvider } from "@/context/ChatContext";
import { AiPresenceProvider } from "@/context/AiPresenceContext";
import WorkspaceNavigation from "@/components/workspaces/WorkspaceNavigation";
import { PLATFORM_METADATA } from "@/lib/branding";
import { LocaleProvider } from "@/context/LocaleContext";
import { GradeProvider } from "@/context/GradeContext";
import GhPagesRedirect from "@/components/layout/GhPagesRedirect";

/**
 * 品牌展示字体
 * ===========
 *
 * 首页的品牌字标需要**精装展示衬线**的质感——这是整站唯一的
 * 「收藏级」排版位置，正文绝不用它。
 *
 * 三款字体各有分工：
 *
 * - ``Cormorant Garamond`` —— 英文主标「Open Education」。它的
 *   高对比度粗细笔画（thin/thick contrast）在大字号下有一种
 *   银版印刷般的精致感，是奢侈品牌字标的常见选择；
 * - ``Playfair Display`` —— 备用英文衬线，用于英文小标题与数字；
 * - ``Noto Serif SC`` —— 中文全称「开放教育学习平台」。它有完整
 *   的宋体骨架（大字面、明确的横细竖粗对比），比默认黑体更适合
 *   做展示级标题。
 *
 * ⛔ ``display: "swap"``——字体没加载完时先用回退字体渲染，
 *    不阻塞首屏。字体文件由 Next 在构建期自托管，**零外部请求**，
 *    静态导出后也不会有 CDN 依赖。
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-playfair",
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-serif-sc",
});

export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export const metadata: Metadata = {
  ...PLATFORM_METADATA,
  /**
   * Referrer 策略：完全剥离来源。
   * ==================================
   *
   * 为什么需要它
   * ------------
   *
   * 哔哩哔哩的嵌入播放器（``player.bilibili.com``）有**防盗链**：
   * 它会检查请求的 ``Referer`` 头。如果来源不是 bilibili.com，
   * 播放器就可能触发风控并显示空白/提示框。这在「第三方站点
   * 内嵌 B 站视频」的场景里非常常见。
   *
   * ``no-referrer`` 让浏览器**不带任何来源信息**发请求，
   * 从而绕开这类基于 ``Referer`` 的防盗链判断。
   *
   * 代价
   * ----
   *
   * 部分站点靠 ``Referer`` 做防盗链，剥掉后反而可能拿不到内容。
   * 实测：YouTube 的 ``/embed/`` 端点与 B 站的 ``player.html``
   * 在 ``no-referrer`` 下都返回 200，功能完整——所以这里的取舍
   * 是划算的。
   *
   * ``same-origin`` 是个折中，但跨域到 B 站/YouTube 时仍会带
   * 来源（只隐藏路径），对防盗链没用，所以用 ``no-referrer``。
   */
  referrer: "no-referrer",
  other: {
    // 兼容不支持 ``referrer`` 元字段的旧内核。
    "referrer": "no-referrer",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${cormorant.variable} ${playfair.variable} ${notoSerifSC.variable}`}
    >
      <body className="font-sans bg-[var(--background)] text-[var(--foreground)]">
        {/* 语言 / 地区在最外层——品牌栏、页脚、导航都要读它 */}
        <LocaleProvider>
          {/*
           * 年级上下文——课程大厅聚焦、诊断卡难度、AI 助教深浅
           * 都读它。放在 LocaleProvider 里面（它需要语言来决定
           * 引导卡里的文案）。
           */}
          <GradeProvider>
            {/*
             * GitHub Pages 的 404 回退。
             *
             * 静态托管没法在服务端处理「构建期没生成的路径」——
             * 这个组件在应用启动后把那个路径捡回来，用客户端路由
             * 导航过去。放在 LocaleProvider 里是因为它必须在**任何**
             * 页面渲染之前生效。
             */}
            <GhPagesRedirect />
            <AppShellProvider>
              {/* 全局只加载一次工作区列表 */}
              <WorkspaceNavigation />
              {/* AI 的在场状态跨页面共享：它知道你在读什么、随时能给建议 */}
              <AiPresenceProvider>
                {/* 对话状态跨页面共享：课程页问过的问题，回到首页仍在 */}
                <ChatProvider>{children}</ChatProvider>
              </AiPresenceProvider>
            </AppShellProvider>
          </GradeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
