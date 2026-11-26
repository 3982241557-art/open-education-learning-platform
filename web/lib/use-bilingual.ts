"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import {
  S2T_READY_EVENT,
  currentS2TTable,
  ensureS2TTable,
  toTraditional,
} from "@/lib/zh-tw";

/**
 * 双语文本钩子
 * ============
 *
 * 全站**唯一**正确的双语渲染入口。
 *
 * 三种语言的处理
 * --------------
 *
 * - ``zh-CN`` —— 原文（简体）直接用；
 * - ``en``    —— 原文（英文）直接用；
 * - ``zh-TW`` —— 简体原文经**字符级**转换得到繁体。
 *
 * ⛔ **绝不做「中英拼贴」**。
 *
 * 之前的做法是：组件里写死一段中文，再在底部硬塞一段未翻译的
 * 英文。结果是切换到英文模式后，页面上中英文混排——一句中文里
 * 夹着两个英文单词，读起来像机翻。
 *
 * 现在改成**结构化双语**：每个需要显示的文本都由调用方提供
 * ``{ zh, en }`` 两个版本，钩子负责按当前语言挑一个。繁体模式
 * 再对中文做一次字符转换。
 *
 * 用法
 * ----
 *
 * .. code-block:: tsx
 *
 *    const t = useBilingual();
 *    <p>{t({ zh: "一对一对应点数", en: "One-to-One Counting" })}</p>
 *
 *    // 带变量
 *    t({ zh: "左盘 {n} 块", en: "{n} on the left pan" }, { n: 3 })
 *
 * @example
 * ```tsx
 * const t = useBilingual();
 * return <span>{t(LABELS.count)}</span>;
 * ```
 */
export interface Bilingual {
  /** 简体中文。 */
  zh: string;
  /** 英文。 */
  en: string;
}

/** 变量表。 */
export type Vars = Record<string, string | number>;

/**
 * 插值。
 *
 * ``{name}`` → 变量值。
 */
function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * 取当前语言下的文本。
 *
 * @param pair 双语文本
 * @param vars 变量
 */
export function useBilingual() {
  const { locale } = useLocale();
  const [ready, setReady] = useState(0);

  // 繁体表加载完就刷新一次。
  //
  // ⛔ 不能在渲染期 await——那会让首屏多等一个网络往返。
  useEffect(() => {
    if (locale !== "zh-TW") return;
    ensureS2TTable();
    const onReady = () => setReady((n) => n + 1);
    window.addEventListener(S2T_READY_EVENT, onReady);
    return () => window.removeEventListener(S2T_READY_EVENT, onReady);
  }, [locale]);

  return useCallback(
    (pair: Bilingual, vars?: Vars): string => {
      const source = locale === "en" ? pair.en : pair.zh;
      const filled = interpolate(source, vars);
      if (locale !== "zh-TW") return filled;
      return toTraditional(filled, currentS2TTable());
    },
    [locale, ready],
  );
}

/**
 * 把一段**任意**简体文本转成当前语言下的文本。
 *
 * 用于**动态内容**——节点名、数据标题这类来自数据文件的文本，
 * 它们没有成对的双语版本，只能在繁体模式下做字符转换。
 *
 * @param zh 简体原文
 * @param en 英文对照
 */
export function useDynamicBilingual() {
  const { locale } = useLocale();
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (locale !== "zh-TW") return;
    ensureS2TTable();
    const onReady = () => setReady((n) => n + 1);
    window.addEventListener(S2T_READY_EVENT, onReady);
    return () => window.removeEventListener(S2T_READY_EVENT, onReady);
  }, [locale]);

  return useCallback(
    (zh: string, en: string): string => {
      if (locale === "en") return en;
      if (locale !== "zh-TW") return zh;
      return toTraditional(zh, currentS2TTable());
    },
    [locale, ready],
  );
}

/**
 * 把一段**简体**文本转成当前语言下的文本。
 *
 * ⛔ **只处理中文分支**。
 *
 * 实验台内部大量使用 ``isEn ? "English" : "简体中文"`` 的三元写法。
 * 英文分支天然正确，缺的只是**繁体**。所以这个钩子只在中文分支
 * 上生效——英文照走 ``isEn``，不需要包。
 *
 * .. code-block:: tsx
 *
 *    const tw = useTraditional();
 *    <span>{isEn ? "Curve type" : tw("曲线类型")}</span>
 *
 * @param zh 简体原文
 */
export function useTraditional(): (zh: string) => string {
  const { locale } = useLocale();
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (locale !== "zh-TW") return;
    ensureS2TTable();
    const onReady = () => setReady((n) => n + 1);
    window.addEventListener(S2T_READY_EVENT, onReady);
    return () => window.removeEventListener(S2T_READY_EVENT, onReady);
  }, [locale]);

  return useCallback(
    (zh: string): string => {
      if (locale !== "zh-TW") return zh;
      return toTraditional(zh, currentS2TTable());
    },
    // ⛔ `ready` 必须进依赖——映射表是**异步**加载的。
    //    少了它，映射表到位后回调身份不变，依赖它的 ``useMemo``
    //    不会重算，繁体就会停在半路。
    [locale, ready],
  );
}
