import type { Metadata, Viewport } from "next";
import "./globals.css";
/**
 * KaTeX 样式——本地打包，零网络。
 *
 * ⛔ 公式渲染用本地 ``katex`` 依赖，**不引 CDN**：CDN 会让构建
 *    与运行时都依赖外网，一抖动就整页公式裸奔（LaTeX 源码裸露）。
 */
import "katex/dist/katex.min.css";
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
 * ⛔ **纯系统字体栈，零网络字体下载**
 *
 * 之前用的是 ``next/font/google``（Cormorant Garamond / Playfair
 * Display / Noto Serif SC）。它的失败模式很实际：构建期要联网从
 * ``fonts.gstatic.com`` 拉字体文件——网络一抖，构建就卡死；重试
 * 三次仍失败就直接让整条部署流水线断掉。
 *
 * 现在改成**系统内置字体栈**：
 *
 * - ``--font-display`` —— 英文大标题「Open Education」。
 *   Didot / Bodoni MT 是 macOS 与 Windows 上**自带**的高对比度
 *   衬线体，质感与 Cormorant Garamond 同源（都是 Didone 家族）；
 * - ``--font-playfair`` —— 备用英文衬线，用于英文小标题与数字；
 * - ``--font-serif-sc`` —— 中文宋体骨架。Songti SC（macOS）/ STSong
 *   （Windows）都有明确的横细竖粗对比，比默认黑体更适合展示级标题；
 *
 * 代价是不同系统上的字形**不完全一致**。换来的是：构建零网络依赖、
 * 零外部请求、秒级完成，且字体永远立即可用（没有 FOUT）。
 *
 * 这些变量以**行内 style** 注入到 ``<html>`` 上——与原先
 * ``next/font`` 的 ``variable`` 机制保持一致的用法，调用方不需要改。
 */
const FONT_STACKS = {
  /** 英文展示级衬线——品牌字标。 */
  display: '"Didot", "Bodoni MT", "Palatino Linotype", Georgia, serif',
  /** 备用英文衬线——小标题与数字。 */
  playfair: '"Didot", "Bodoni MT", "Palatino Linotype", Georgia, serif',
  /** 中文宋体骨架——中文全称与宣言。 */
  serifSc: '"Songti SC", "STSong", "SimSun", serif',
} as const;

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
      style={
        {
          "--font-display": FONT_STACKS.display,
          "--font-playfair": FONT_STACKS.playfair,
          "--font-serif-sc": FONT_STACKS.serifSc,
        } as React.CSSProperties
      }
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
