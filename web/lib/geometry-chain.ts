/**
 * 开源几何链 · 类型与数据加载
 * ===========================
 *
 * 「空间、角度与几何探究」这条标杆链的**唯一数据源**。
 *
 * 数据从 ``/data/geometry-chain.json`` 读——那份 JSON 由
 * ``scripts/fetch-open-geometry.mjs`` 从三个真实的 GitHub 开源仓库
 * 拉取生成：
 *
 * - ``Khan/khan-exercises`` —— 练习题与逐级启发提示；
 * - ``openstax/osbooks-prealgebra-bundle`` —— 概念定义、定理、例题；
 * - ``haojing8312/cn-k12-math-knowledge-graph`` —— 中文教材知识点体系。
 *
 * ⛔ **零 AI 编造**。数据文件里每一条都带 ``source_provenance``，
 *    可逐条追溯到开源仓库的原始文件路径与协议。
 *
 * ⛔ **三语分仓**。每段文本都有独立的 ``zhCN`` / ``zhTW`` / ``en``
 *    字段。渲染时**只取当前语言的那一列**——绝不把中英文同时
 *    堆在屏幕上。
 */

import { staticUrl } from "@/lib/static-data";

/** 三语文本列。 */
export interface Trilingual {
  /** 简体中文。 */
  zhCN: string[];
  /** 繁体中文。 */
  zhTW: string[];
  /** 英文。 */
  en: string[];
}

/** 一条来源记录。 */
export interface GeometrySource {
  repo: string;
  path: string;
  url: string;
  license: string;
  licenseUrl?: string;
  title?: string;
  sections?: string[];
  topics?: Array<{ name: string; chapter: string }>;
}

/** 一节课的完整数据。 */
export interface GeometryLesson {
  id: string;
  /** 所处的三阶因果阶段（1 直觉测量 / 2 图形转化 / 3 定理证明）。 */
  stage: 1 | 2 | 3;
  sources: {
    khan: GeometrySource[];
    openstax: GeometrySource;
    cn: GeometrySource;
  };
  /** 核心概念（带来源标注）。 */
  concept: Trilingual;
  /** 任务指引。 */
  task: Trilingual;
  /** 逐级启发提示。 */
  hints: Trilingual;
  /** 巩固题（来自开源题库）。 */
  trials: Trilingual;
  /** 原始素材——GeoGebra 教具与解析面板取用。 */
  raw: {
    khanHints: string[];
    khanQuestions: Array<{ q: string; from: string; title: string }>;
    openstaxExamples: Array<{ question: string; solution: string; section: string }>;
    openstaxConcepts: Array<{ heading: string; body: string; section: string }>;
  };
}

/** 整条链的数据。 */
export interface GeometryChain {
  schemaVersion: number;
  generatedAt: string;
  generator: string;
  chain: {
    id: string;
    title: { zhCN: string; zhTW: string; en: string };
    stageNames: Record<
      string,
      { zhCN: string; zhTW: string; en: string }
    >;
  };
  licenses: Array<{
    repo: string;
    license: string;
    licenseUrl: string;
    note?: string;
  }>;
  sourceProvenance: Array<{
    lessonId: string;
    kind: "exercise" | "textbook";
    repo: string;
    path: string;
    url: string;
    license: string;
    licenseUrl: string;
    title?: string;
    questions?: number;
    hints?: number;
    sections?: string[];
    concepts?: number;
    examples?: number;
  }>;
  lessons: GeometryLesson[];
}

/** 数据文件的静态路径。 */
export const GEOMETRY_CHAIN_URL = staticUrl("/data/geometry-chain.json");

/**
 * 加载整条几何链。
 *
 * ⛔ 失败时**不抛错**，而是返回 ``null``——页面能渲染「加载失败」
 *    的空状态，而不是整页白屏。
 */
export async function loadGeometryChain(): Promise<GeometryChain | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(GEOMETRY_CHAIN_URL, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as GeometryChain;
  } catch {
    return null;
  }
}

/** 三阶因果阶段。 */
export type GeometryStage = 1 | 2 | 3;

/** 阶段的三语名称。 */
export const GEOMETRY_STAGE_META: Record<
  GeometryStage,
  { zhCN: string; zhTW: string; en: string }
> = {
  1: { zhCN: "直觉测量", zhTW: "直覺測量", en: "Intuitive Measurement" },
  2: { zhCN: "图形转化", zhTW: "圖形轉化", en: "Figure Transformation" },
  3: { zhCN: "定理证明", zhTW: "定理證明", en: "Theorem Proof" },
};

/** 8 节课的稳定顺序。 */
export const GEOMETRY_LESSON_IDS = [
  "geo-01",
  "geo-02",
  "geo-03",
  "geo-04",
  "geo-05",
  "geo-06",
  "geo-07",
  "geo-08",
] as const;

export type GeometryLessonId = (typeof GEOMETRY_LESSON_IDS)[number];
