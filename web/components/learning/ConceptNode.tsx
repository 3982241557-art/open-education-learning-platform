"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 知识节点
 * ========
 *
 * 正文里的核心概念、专有名词，可以被标记成**可点击的知识节点**：
 *
 * .. code-block:: text
 *
 *     在 Scheme 里，[[闭包]] 是一种函数记住了它的出生地。
 *
 * 渲染出来是带虚线下划线的暖色短语——点它不是跳转，而是就地提问：
 * 词条被填进右侧 AI 的输入框、一条解释指令被发出、左侧留存文档
 * 同时被打上一个标记。
 *
 * 为什么用 ``[[双括号]]`` 而不是别的标记
 * ------------------------------------
 *
 * - **不会误伤**：正文里的方括号本来就少，双括号几乎不会自然出现；
 * - **AI 写得出来**：模型在生成课程正文时，只要被提示「核心概念用
 *   双括号包起来」，就能稳定产出；
 * - **可读**：即使不渲染，原始文本里也读得通。
 *
 * 还可以带一个**释义**，供 AI 参考：
 *
 * .. code-block:: text
 *
 *     [[闭包|一种记住了出生地的函数]]
 *
 * 渲染时只显示 ``闭包``，释义进提示词。
 */

/** 一个被解析出来的知识节点。 */
export interface ConceptToken {
  /** 词条本身——显示给用户、发给 AI。 */
  term: string;
  /** 可选的释义。 */
  hint?: string;
}

/**
 * 匹配 ``[[词条]]`` 或 ``[[词条|释义]]``。
 *
 * 注意 ``|`` 必须**转义**——在字符类里它是"或"，不转义的话
 * ``[[闭包|释义]]`` 会被拆成两个候选，最后只匹配到 ``闭包``。
 */
const CONCEPT_RE = /\[\[([^[\]|]+?)(?:\|([^[\]]*?))?\]\]/g;

/**
 * 从一段文本里把知识节点切出来。
 *
 * 返回的每一项要么是普通字符串，要么是一个 {@link ConceptToken}。
 */
export function parseConcepts(text: string): Array<string | ConceptToken> {
  if (!text || !text.includes("[[")) return [text];

  const out: Array<string | ConceptToken> = [];
  let lastIndex = 0;

  // 用一个**全新**的正则实例——``CONCEPT_RE`` 带 ``g`` 标志，复用时
  // ``lastIndex`` 会残留，导致第二次解析结果为空。
  const re = new RegExp(CONCEPT_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const term = match[1].trim();
    const hint = (match[2] ?? "").trim();
    if (term) {
      out.push(hint ? { term, hint } : { term });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out.length > 0 ? out : [text];
}

/** 知识节点的渲染回调。 */
export type ConceptRenderer = (token: ConceptToken) => ReactNode;

/**
 * 把一段文本渲染成「文字 + 知识节点」混排。
 *
 * ``renderConcept`` 由调用方提供——它决定点了之后发生什么。正文
 * 渲染层给出的是**上下文句子**，具体的动作分发在
 * ``lib/concept-actions.ts`` 里。
 */
export function renderConceptText(
  text: string,
  renderConcept: ConceptRenderer,
): ReactNode {
  const parts = parseConcepts(text);

  return parts.map((part, index) => {
    if (typeof part === "string") {
      return <Fragment key={index}>{part}</Fragment>;
    }
    return <Fragment key={index}>{renderConcept(part)}</Fragment>;
  });
}

/**
 * 取词条所在的那句话——AI 需要它才能解释得准。
 *
 * 句子以中英文句号、问号、感叹号、分号或换行结尾。找不到就退回到
 * 整段文字（截断一下，避免把整页塞进提示词）。
 *
 * **标记会被剥离**
 * ----------------
 *
 * 原文里词条是写成 ``[[闭包]]`` 的。如果原样送给 AI，模型会看到
 * 一串莫名其妙的方括号——它可能真的把 ``[[`` 当成正文的一部分来
 * 解读。所以这里先把标记去掉，只留下「闭包」两个字。
 */
export function extractSentence(text: string, term: string): string {
  if (!text || !term) return "";

  const index = text.indexOf(term);
  if (index === -1) return "";

  // 从词条往前找句首。
  let start = index;
  while (start > 0 && !/[。！？；\n.!?;]/.test(text[start - 1])) {
    start -= 1;
  }

  // 从词条往后找句尾。
  //
  // 句末标点要**包含**进来——「闭包是一种函数。」比「闭包是一种函数」
  // 更像一个完整的句子，AI 读起来也更自然。
  let end = index + term.length;
  while (end < text.length && !/[。！？；\n.!?;]/.test(text[end])) {
    end += 1;
  }
  // 把结尾那个标点带上（换行不要）。
  if (end < text.length && /[。！？；.!?;]/.test(text[end])) {
    end += 1;
  }

  const sentence = stripConceptMarkers(text.slice(start, end)).trim();
  if (sentence.length > 0 && sentence.length <= 300) return sentence;

  // 太长就截断——提示词里不需要整段原文。
  return sentence.slice(0, 300);
}

/**
 * 去掉正文里的知识节点标记，保留词条本身。
 *
 * ``[[闭包|一种记住了出生地的函数]]`` → ``闭包``
 */
export function stripConceptMarkers(text: string): string {
  if (!text || !text.includes("[[")) return text;
  return text.replace(CONCEPT_RE, (_match, term: string) => term.trim());
}

/** 知识节点按钮的样式。 */
export function conceptClassName(active?: boolean): string {
  return cn(
    "rounded-[3px] px-[2px] transition-colors",
    // 划线里的概念高亮——用**很淡**的豆沙粉透出，而不是实色。
    // 42% 的实色在正文里太扎眼，30% 只够给出「这里是个可点的概念」
    // 的暗示。
    "[data-seek-concept]:bg-[color-mix(in_srgb,var(--seek-bean)_30%,transparent)]",
    "[data-seek-concept]:text-[var(--seek-plum)]",
    "[data-seek-concept]:border-b border-dashed",
    "[data-seek-concept]:border-[color-mix(in_srgb,var(--seek-plum)_35%,transparent)]",
    "[data-seek-concept]:cursor-pointer",
    "[data-seek-concept]:hover:bg-[color-mix(in_srgb,var(--seek-bean)_52%,transparent)]",
    active && "bg-[color-mix(in_srgb,var(--seek-bean)_45%,transparent)]",
  );
}
