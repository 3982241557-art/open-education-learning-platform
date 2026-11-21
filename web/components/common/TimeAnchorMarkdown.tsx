"use client";

import { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import MermaidChart from "@/components/common/MermaidChart";
import { ExpandableTable } from "@/components/common/ExpandableTable";
import { isMermaidSource } from "@/lib/mermaid";
import { extractTimeAnchor } from "@/lib/companion-timer";
import { requestVideoSeek } from "@/lib/learning-events";
import { cn } from "@/lib/cn";

/**
 * 带时间锚点的 Markdown 渲染器
 * =============================
 *
 * AI 助教的回答里经常写着「在 03:20 处讲到了……」——那是一个**坐标**。
 * 用户看到它就该能点过去，而不是自己拿笔记记下来再手动拖进度条。
 *
 * 这个组件做两件事：
 *
 * 1. 在渲染前扫描正文，把 ``03:20`` / ``1:02:03`` 这类时间标记包成
 *    一个特殊链接（``seek-time:200``）；
 * 2. 点击它时广播 ``VIDEO_SEEK`` 事件——中间栏的播放器订阅这条
 *    事件并跳到那一秒。
 *
 * 为什么走事件总线
 * ----------------
 *
 * AI 面板与播放器是两棵互不相干的组件树，没有共同的父节点。跟
 * ``CONCEPT_ACTIVATED`` / ``VIDEO_SEEK`` 的既有做法一致——广播事件，
 * 由订阅方各自落地。
 *
 * 事件上**不带**资源 id
 * ---------------------
 *
 * 播放器会自己校验：只有当事件里的 ``resourceId`` 与自己当前播的
 * 资源一致时才响应。留空表示「不限定」——因为 AI 回答里的时间戳是
 * 相对于**当前正在看的那条视频**说的。
 */

/** 时间锚点链接的协议前缀。 */
const TIME_ANCHOR_SCHEME = "seek-time:";

/**
 * 时间标记的正则。
 *
 * 三个要点：
 *
 * * **必须有前边界**——避免把 ``12:34:56`` 里的 ``34:56`` 也当成
 *   独立的锚点；
 * * **不匹配纯数字**——「有 300 个例子」不是时间；
 * * **不匹配小数**——「3.20 版本」不是时间。
 */
const TIME_PATTERN =
  /(^|[^\d:])((?:(\d{1,2}):)?(\d{1,2}):(\d{2}))(?!\d|:)/g;

/**
 * 把正文里的时间标记包成链接。
 *
 * 已经在代码块 / 行内代码里的不该动——但 Markdown 渲染是分阶段
 * 的，这里做不了上下文判断。所以采取保守策略：**只包裸文本里
 * 独立出现的时间**，并且跳过被反引号包住的部分。
 */
export function injectTimeAnchors(content: string): string {
  const source = String(content ?? "");
  if (!source) return "";

  // 保护代码片段——用占位符换出来，处理完再放回去。
  const stash: string[] = [];
  const guarded = source.replace(/`[^`\n]*`/g, (match) => {
    stash.push(match);
    return `\u0000CODE${stash.length - 1}\u0000`;
  });

  const linked = guarded.replace(
    TIME_PATTERN,
    (_match, boundary: string, whole: string, _h: string, _m: string, _s: string) => {
      const seconds = extractTimeAnchor(whole);
      if (seconds === null) return `${boundary}${whole}`;
      return `${boundary}[${whole}](${TIME_ANCHOR_SCHEME}${seconds})`;
    },
  );

  return linked.replace(/\u0000CODE(\d+)\u0000/g, (_m, index: string) => {
    return stash[Number(index)] ?? "";
  });
}

/**
 * 判断一个 href 是不是时间锚点。
 *
 * 导出给测试与别处复用。
 */
export function parseTimeAnchorHref(href: string): number | null {
  if (!href?.startsWith(TIME_ANCHOR_SCHEME)) return null;
  const value = Number(href.slice(TIME_ANCHOR_SCHEME.length));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function TimeAnchorMarkdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  /** 点时间锚点 → 广播跳转请求。 */
  const onClick = useCallback((event: React.MouseEvent) => {
    const target = (event.target as HTMLElement | null)?.closest("a");
    if (!target) return;
    const href = target.getAttribute("href") ?? "";
    const seconds = parseTimeAnchorHref(href);
    if (seconds === null) return;

    // 拦下默认跳转——这是站内坐标，不是外链。
    event.preventDefault();
    requestVideoSeek({ timestamp: seconds });
  }, []);

  const components = useMemo(
    () => ({
      a({ href, children, ...rest }: any) {
        const seconds = parseTimeAnchorHref(String(href ?? ""));
        if (seconds === null) {
          return (
            <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
              {children}
            </a>
          );
        }
        return (
          <a
            href={href}
            title={`跳到 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`}
            className={cn(
              "seek-key-sm inline-flex items-baseline rounded px-0.5 font-mono text-[0.92em] tabular-nums",
              "text-[var(--seek-plum)] underline decoration-[var(--seek-bean-soft-border)] underline-offset-2",
              "hover:bg-[var(--seek-bean-soft)]",
            )}
            {...rest}
          >
            {children}
          </a>
        );
      },
      table({ children, ...rest }: any) {
        return <ExpandableTable {...rest}>{children}</ExpandableTable>;
      },
      code({ className: classNameProp, children, ...rest }: any) {
        const raw = String(children ?? "");
        const match = /language-(\w+)/.exec(classNameProp ?? "");
        const text = raw.replace(/\n$/, "");
        if (match && isMermaidSource(match[1], text)) {
          return <MermaidChart chart={text} />;
        }
        return (
          <code className={classNameProp} {...rest}>
            {children}
          </code>
        );
      },
    }),
    [],
  );

  return (
    <div
      className={`md-renderer text-[13.5px] leading-relaxed ${className}`}
      onClick={onClick}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {injectTimeAnchors(content)}
      </ReactMarkdown>
    </div>
  );
}

export default TimeAnchorMarkdown;
