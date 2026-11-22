import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShellProvider } from "@/context/AppShellContext";
import { ChatProvider } from "@/context/ChatContext";
import { AiPresenceProvider } from "@/context/AiPresenceContext";
import WorkspaceNavigation from "@/components/workspaces/WorkspaceNavigation";
import { PLATFORM_METADATA } from "@/lib/branding";
import { LocaleProvider } from "@/context/LocaleContext";
import { GradeProvider } from "@/context/GradeContext";
import GhPagesRedirect from "@/components/layout/GhPagesRedirect";

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
    <html lang="zh-CN" suppressHydrationWarning>
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
