"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import MermaidChart from "@/components/common/MermaidChart";
import { ExpandableTable } from "@/components/common/ExpandableTable";
import { isMermaidSource } from "@/lib/mermaid";

/**
 * 聊天回复的 Markdown 渲染器。
 *
 * 移植自 DeepTutor 的 ``SimpleMarkdownRenderer``，剥掉了它依赖平台的
 * 部分（引用锚点、内联文件卡片、富文本渲染分派），只留下聊天真正需要的
 * 能力：
 *
 * * GFM 语法（表格、删除线、任务列表、自动链接）；
 * * LaTeX 数学（行内 ``$...$`` 与行间 ``$$...$$``）；
 * * 代码块与行内代码；
 * * 标题、列表、引用块；
 * * **Mermaid 图表**——`` ```mermaid `` 代码块会被拦截并渲染成图。
 *
 * 刻意不用动态 import 做「简单 → 富文本」的双渲染：那是原版为了大文档
 * 首屏性能做的分派，在这里反而让流式输出时出现闪烁。
 */
export default function Markdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const components = useMemo(() => buildComponents(), []);

  return (
    <div className={`md-renderer text-[13.5px] leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** 判断一个代码块是不是 mermaid 图表。 */
function isMermaid(className: string | undefined, raw: string): boolean {
  return isMermaidSource(className, raw);
}

/**
 * 数出表格有几列。
 *
 * react-markdown 给的 ``node`` 是 hast 树——``thead > tr > th`` 的结构。
 * 数表头的 ``th`` 个数即可；没有表头就数第一行的 ``td``。
 */
function countColumns(node: any): number {
  const rows: any[] = node?.children ?? [];
  for (const row of rows) {
    if (row?.type !== "element" || row?.tagName !== "thead") continue;
    for (const line of row?.children ?? []) {
      if (line?.type !== "element" || line?.tagName !== "tr") continue;
      const cells = (line?.children ?? []).filter(
        (cell: any) => cell?.type === "element" && cell?.tagName === "th",
      );
      if (cells.length) return cells.length;
    }
  }

  // 没有表头就退而数第一行的单元格。
  for (const row of rows) {
    if (row?.type !== "element" || row?.tagName !== "tbody") continue;
    for (const line of row?.children ?? []) {
      if (line?.type !== "element" || line?.tagName !== "tr") continue;
      const cells = (line?.children ?? []).filter(
        (cell: any) => cell?.type === "element" && cell?.tagName === "td",
      );
      if (cells.length) return cells.length;
    }
  }

  return 0;
}

function buildComponents(): Record<string, React.ComponentType<any>> {
  const code = ({ node, className: cls, children, ...props }: any) => {
    const raw = String(children ?? "").replace(/\n$/, "");
    const isBlock = raw.includes("\n");

    // ── Mermaid 拦截 ──────────────────────────────────────────────
    // 图表代码不该以枯燥的代码块呈现——直接渲染成图。
    if (isBlock && isMermaid(cls, raw)) {
      return <MermaidChart chart={raw} />;
    }

    if (!isBlock) {
      return (
        <code
          className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-[0.875em]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <pre className="my-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[#1f2937] p-4 text-[12.5px] leading-relaxed text-[#e5e7eb]">
        <code className="font-mono" {...props}>
          {raw}
        </code>
      </pre>
    );
  };

  return {
    h1: ({ children }: any) => (
      <h1 className="mb-3 mt-6 text-[19px] font-semibold tracking-tight first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="mb-2.5 mt-5 text-[16.5px] font-semibold tracking-tight first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="mb-2 mt-4 text-[14.5px] font-semibold first:mt-0">{children}</h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="mb-1.5 mt-3 text-[13.5px] font-semibold first:mt-0">{children}</h4>
    ),
    p: ({ children }: any) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }: any) => <em className="italic">{children}</em>,
    del: ({ children }: any) => <del className="opacity-70">{children}</del>,
    ul: ({ children }: any) => (
      <ul className="my-2.5 ml-4 list-disc space-y-1 marker:text-[var(--muted-foreground)]">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="my-2.5 ml-4 list-decimal space-y-1 marker:text-[var(--muted-foreground)]">
        {children}
      </ol>
    ),
    li: ({ children }: any) => <li className="pl-0.5 leading-relaxed">{children}</li>,
    blockquote: ({ children }: any) => (
      <blockquote className="my-3 border-s-[3px] border-[var(--muted-foreground)] ps-4 italic text-[var(--muted-foreground)]">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-4 h-px border-none bg-[var(--border)]" />,
    a: ({ node, href, children, ...props }: any) => {
      const external = href?.startsWith("http://") || href?.startsWith("https://");
      return (
        <a
          href={href}
          className="text-[var(--primary)] underline decoration-[var(--primary)]/40 underline-offset-2 transition-colors hover:decoration-[var(--primary)]"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          {...props}
        >
          {children}
        </a>
      );
    },
    img: ({ node, src, alt, ...props }: any) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt || ""}
        loading="lazy"
        className="my-3 max-w-full rounded-lg border border-[var(--border)]"
        {...props}
      />
    ),
    code,
    pre: ({ children }: any) => <>{children}</>,
    table: ({ node, children }: any) => {
      // 数一下表头有几列——决定要不要给「全屏放大」按钮。
      const columnCount = countColumns(node);
      return (
        <ExpandableTable columnCount={columnCount}>
          <table className="min-w-full divide-y divide-[var(--border)] text-[12.5px]">
            {children}
          </table>
        </ExpandableTable>
      );
    },
    thead: ({ children }: any) => (
      <thead className="bg-[var(--muted)]">{children}</thead>
    ),
    th: ({ children }: any) => (
      <th className="border-b border-[var(--border)] px-3 py-2 text-start font-semibold">
        {children}
      </th>
    ),
    tbody: ({ children }: any) => <tbody>{children}</tbody>,
    tr: ({ children }: any) => (
      <tr className="transition-colors hover:bg-[var(--muted)]/60">{children}</tr>
    ),
    td: ({ children }: any) => (
      <td className="border-b border-[var(--border)]/30 px-3 py-2 text-[var(--muted-foreground)]">
        {children}
      </td>
    ),
    input: ({ node, type, checked, ...props }: any) =>
      type === "checkbox" ? (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-2 h-4 w-4 rounded border-[var(--border)] align-middle accent-[var(--primary)]"
          {...props}
        />
      ) : null,
  };
}
