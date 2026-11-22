"use client";

import type { Block, BlockType } from "@/lib/courses-api";
import { statusLabel } from "@/lib/course-status";

/**
 * Block 渲染器
 * ============
 *
 * 按原版 DeepTutor 的 Block 语义渲染内容块。每种 ``type`` 的 payload 形状与
 * ``deeptutor/book/blocks/*.py`` 里各 BlockGenerator 的返回值一致：
 *
 * - ``text``      → ``payload.body``（markdown）
 * - ``callout``   → ``payload.label`` + ``payload.body``
 * - ``code``      → ``payload.code`` + ``payload.explanation``
 * - ``quiz``      → ``payload.questions[]``
 * - ``flash_cards``→ ``payload.cards[]``
 * - ``section``   → ``payload.intro`` + ``payload.subsections[]``
 *
 * 形状对不上的块不会渲染成空白，而是落到一个可读的兜底块里，方便手工排查
 * 数据格式问题。
 *
 * 中英对照
 * --------
 *
 * 英文教材的块里带一个 ``payload.translation`` 字段（中文译文，由
 * ``scripts/build_bilingual.py`` 预处理生成）。渲染时排成**英文在上、
 * 中文在下**，并用**不同的字体**区分——英文无衬线、中文宋体。
 *
 * 字体分工不是为了好看，是为了**字形密度**：无衬线的拉丁字母在小字号
 * 下字距更均匀，长段落更耐读；宋体的中文笔画在暖色背景上更清晰。
 * 两种字体混排时，读者能靠字形瞬间分辨哪行是原文、哪行是译文。
 */

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 取出一个块的中文译文。
 *
 * 只有译文**确实存在且与原文不同**时才返回——否则会渲染出两行一模一样的
 * 文字，那比不渲染更糟。
 */
function translationOf(block: Block): string {
  const translated = stringField(block.payload.translation).trim();
  if (!translated) return "";
  const original = stringField(block.payload.body).trim();
  if (translated === original) return "";
  return translated;
}

function BlockShell({
  block,
  children,
}: {
  block: Block;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={block.title || block.type}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      {block.title && (
        <h4 className="mb-2 text-[12.5px] font-semibold">{block.title}</h4>
      )}
      {children}
    </section>
  );
}

/** markdown 的极简渲染：代码块单独处理，其余按段落切开。 */
function Markdown({ source }: { source: string }) {
  const segments = source.split(/```/);
  return (
    <>
      {segments.map((segment, index) => {
        if (index % 2 === 1) {
          const lines = segment.replace(/^[a-zA-Z0-9+#-]*\n/, "").split("\n");
          return (
            <pre
              key={index}
              className="my-2 overflow-x-auto rounded-lg bg-[var(--muted)]/60 p-3 font-mono text-[11.5px] leading-relaxed text-[var(--foreground)]"
            >
              <code>{lines.join("\n")}</code>
            </pre>
          );
        }
        return (
          <p
            key={index}
            className="my-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--foreground)] first:mt-0 last:mb-0"
          >
            {segment.trim()}
          </p>
        );
      })}
    </>
  );
}

/**
 * 中英对照正文。
 *
 * 英文在上（无衬线），中文在下（宋体），中间用一条细线分隔。
 */
function BilingualBody({
  original,
  translation,
}: {
  original: string;
  translation: string;
}) {
  return (
    <div className="space-y-3">
      {/* 英文原文 */}
      <div className="font-sans">
        <Markdown source={original} />
      </div>

      {/* 分隔线 */}
      <div
        aria-hidden
        className="flex items-center gap-2 border-t border-dashed border-[var(--border)] pt-2.5"
      >
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          中文对照
        </span>
      </div>

      {/* 中文译文 */}
      <div className="font-serif">
        <Markdown source={translation} />
      </div>
    </div>
  );
}

function TextBlock({ block }: { block: Block }) {
  const body = stringField(block.payload.body);
  if (!body) return null;
  const translation = translationOf(block);

  return (
    <BlockShell block={block}>
      {translation ? (
        <BilingualBody original={body} translation={translation} />
      ) : (
        <Markdown source={body} />
      )}
    </BlockShell>
  );
}

function CalloutBlock({ block }: { block: Block }) {
  const label = stringField(block.payload.label);
  const body = stringField(block.payload.body);
  if (!body) return null;
  return (
    <BlockShell block={block}>
      <div
        className={
          block.payload.variant === "common_pitfall"
            ? "rounded-lg border border-amber-500/25 bg-amber-50 p-3"
            : "rounded-lg border border-[var(--border)] bg-[var(--muted)]/45 p-3"
        }
      >
        {label && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {label}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
          {body}
        </p>
      </div>
    </BlockShell>
  );
}

function CodeBlock({ block }: { block: Block }) {
  const code = stringField(block.payload.code);
  const language = stringField(block.payload.language);
  const explanation = stringField(block.payload.explanation);
  if (!code) return null;
  return (
    <BlockShell block={block}>
      <pre className="overflow-x-auto rounded-lg bg-[var(--muted)]/60 p-3 font-mono text-[11.5px] leading-relaxed text-[var(--foreground)]">
        <code>{code}</code>
      </pre>
      {explanation && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
          {explanation}
        </p>
      )}
      {language && (
        <p className="mt-1 font-mono text-[10.5px] text-[var(--muted-foreground)]">
          {language}
        </p>
      )}
    </BlockShell>
  );
}

function QuizBlock({ block }: { block: Block }) {
  const topic = stringField(block.payload.topic);
  const questions = arrayField(block.payload.questions);
  if (!questions.length) return null;
  return (
    <BlockShell block={block}>
      {topic && (
        <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">主题：{topic}</p>
      )}
      <ol className="space-y-3">
        {questions.map((raw, index) => {
          const question = objectField(raw);
          const options = objectField(question.options);
          return (
            <li key={String(question.question_id ?? index)}>
              <p className="mb-1.5 text-[12.5px] font-medium">
                {index + 1}. {stringField(question.question)}
              </p>
              {Object.keys(options).length > 0 && (
                <ul className="mb-1 space-y-1 pl-4">
                  {Object.entries(options).map(([key, value]) => (
                    <li
                      key={key}
                      className="list-disc text-[12px] text-[var(--muted-foreground)]"
                    >
                      {key}. {String(value)}
                    </li>
                  ))}
                </ul>
              )}
              {stringField(question.explanation) && (
                <p className="pl-4 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                  解析：{stringField(question.explanation)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </BlockShell>
  );
}

function FlashCardsBlock({ block }: { block: Block }) {
  const cards = arrayField(block.payload.cards);
  if (!cards.length) return null;
  return (
    <BlockShell block={block}>
      <ul className="space-y-2">
        {cards.map((raw, index) => {
          const card = objectField(raw);
          return (
            <li
              key={String(card.front ?? index)}
              className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/35 p-3"
            >
              <p className="text-[12.5px] font-medium">{stringField(card.front)}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                {stringField(card.back)}
              </p>
              {stringField(card.hint) && (
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                  提示：{stringField(card.hint)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </BlockShell>
  );
}

function SectionBlock({ block }: { block: Block }) {
  const intro = stringField(block.payload.intro);
  const takeaway = stringField(block.payload.key_takeaway);
  const subsections = arrayField(block.payload.subsections);
  if (!intro && !takeaway && !subsections.length) return null;
  return (
    <BlockShell block={block}>
      {intro && (
        <p className="mb-2 whitespace-pre-wrap text-[13px] leading-relaxed">
          {intro}
        </p>
      )}
      {subsections.length > 0 && (
        <div className="space-y-3">
          {subsections.map((raw, index) => {
            const subsection = objectField(raw);
            return (
              <div key={index}>
                {stringField(subsection.heading) && (
                  <h5 className="mb-1 text-[12.5px] font-semibold">
                    {stringField(subsection.heading)}
                  </h5>
                )}
                {stringField(subsection.body) && (
                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--foreground)]">
                    {stringField(subsection.body)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {takeaway && (
        <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/45 p-2.5 text-[12px] leading-relaxed">
          <span className="font-medium">要点：</span>
          {takeaway}
        </p>
      )}
    </BlockShell>
  );
}

/** 兜底：payload 形状与已知类型不匹配时，把原样内容摊开，方便排查。 */
function FallbackBlock({ block }: { block: Block }) {
  return (
    <BlockShell block={block}>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--muted)]/50 p-3 font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
        {JSON.stringify(block.payload, null, 2)}
      </pre>
    </BlockShell>
  );
}

export function BlockRenderer({ block }: { block: Block }) {
  if (block.status !== "ready") {
    return (
      <BlockShell block={block}>
        <p className="text-[12px] text-[var(--muted-foreground)]">
          （该块尚未就绪{statusLabel(block.status) ? `：${statusLabel(block.status)}` : ""}）
        </p>
      </BlockShell>
    );
  }

  const renderers: Partial<Record<BlockType, (props: { block: Block }) => React.ReactNode>> = {
    text: TextBlock,
    callout: CalloutBlock,
    code: CodeBlock,
    quiz: QuizBlock,
    flash_cards: FlashCardsBlock,
    section: SectionBlock,
  };

  const Renderer = renderers[block.type];
  return Renderer ? <Renderer block={block} /> : <FallbackBlock block={block} />;
}
