/**
 * 三大标杆专题 · 类型与数据加载
 * =============================
 *
 * 「一切皆数学」首批三个标杆专题的**唯一数据源**。
 *
 * 两个来源合流
 * ------------
 *
 * 1. ``/data/flagship-topics.json`` —— 由
 *    ``scripts/fetch-open-flagship.mjs`` 从真实的 GitHub 开源仓库拉取：
 *
 *    - ``openstax/osbooks-college-algebra-bundle`` —— 概念定义与例题；
 *    - ``openstax/osbooks-statistics`` —— 条件概率与贝叶斯；
 *    - ``Khan/khan-exercises`` —— 练习题与逐级启发；
 *    - ``haojing8312/cn-k12-math-knowledge-graph`` —— 中文大纲知识点。
 *
 *    ⛔ **零 AI 编造**：文件里每一条都带来源，可逐条追溯到仓库路径。
 *
 * 2. 本文件里的**编辑层**（``FLAGS editorial``）—— 三个专题的
 *    大纲锚点、核心金句、数学本质、跨学科连接、深度博客、精炼 PPT
 *    与「直觉 vs 数学」情境题。
 *
 * 严格单语
 * --------
 *
 * 编辑层每段文本都带 ``zhCN`` 与 ``en`` 两列，渲染时**只取当前
 * 语言那一列**。繁体中文由 :mod:`lib/zh-tw` 在运行时做字符级转换
 * （与全站其余部分一致），绝不在页面上出现「中英拼贴」。
 *
 * basePath 兼容
 * -------------
 *
 * 数据文件与自定义 MP4 都用 ``staticUrl()`` 拼接 ``basePath``——
 * GitHub Pages 项目站点在二级路径下，不拼会 404。
 */

import { staticUrl } from "@/lib/static-data";

/** 双语文本。 */
export interface BiText {
  /** 简体中文。 */
  zhCN: string;
  /** 英文。 */
  en: string;
}

/** 双语列表。 */
export interface BiList {
  /** 简体中文。 */
  zhCN: string[];
  /** 英文。 */
  en: string[];
}

/** 一条开源来源记录。 */
export interface FlagshipSource {
  repo: string;
  path: string;
  url: string;
  license: string;
  licenseUrl?: string;
  title?: string;
  sections?: string[];
  topics?: Array<{ name: string; chapter: string }>;
}

/** 一道「直觉 vs 数学」情境思考题。 */
export interface FlagshipQuestion {
  /** 题干。 */
  stem: BiText;
  /** 选项（≥2）。 */
  options: BiList;
  /** 正确项下标。 */
  answer: number;
  /** 解析。 */
  explain: BiText;
}

/** 一张 PPT 幻灯片。 */
export interface FlagshipSlide {
  title: BiText;
  bullets: BiList;
}

/** 一个专题的编辑层内容。 */
export interface FlagshipEditorial {
  /** 专题 id。 */
  id: string;
  /** 所属大纲板块（学习地图用）。 */
  board: BiText;
  /** 大纲知识点锚点。 */
  anchor: BiText;
  /** 跨学科连接标签。 */
  tags: BiList;
  /** 核心金句。 */
  quote: BiText;
  /** 数学本质公式（LaTeX，语言无关）。 */
  formula: string;
  /** 公式的一句话直观解释。 */
  formulaNote: BiText;
  /** 跨学科连接（2–3 行）。 */
  connection: BiText;
  /** 深度博客。 */
  blog: { title: BiText; paragraphs: BiList };
  /** 精炼 PPT。 */
  ppt: { title: BiText; slides: FlagshipSlide[] };
  /** 三道情境思考题。 */
  questions: FlagshipQuestion[];
  /** 交互实验台的一句话操作提示。 */
  labHint: BiText;
  /** 短片的一句话预告。 */
  filmHint: BiText;
}

/** 从开源仓库拉来的一个专题。 */
export interface FlagshipTopic {
  id: string;
  sources: {
    openstax?: FlagshipSource;
    openstaxSupport?: FlagshipSource[];
    khan?: FlagshipSource[];
    cn?: FlagshipSource;
  };
  concept: { zhCN: string[]; zhTW: string[]; en: string[] };
  task: { zhCN: string[]; zhTW: string[]; en: string[] };
  hints: { zhCN: string[]; zhTW: string[]; en: string[] };
  trials: { zhCN: string[]; zhTW: string[]; en: string[] };
  quiz: {
    zhCN: Array<{ stem: string; source: string; answer: string }>;
    zhTW: Array<{ stem: string; source: string; answer: string }>;
    en: Array<{ stem: string; source: string; answer: string }>;
  };
  raw: Record<string, unknown>;
}

/** 整个数据文件。 */
export interface FlagshipData {
  schemaVersion: number;
  generatedAt: string;
  generator: string;
  licenses: Array<{ repo: string; license: string; licenseUrl: string; note?: string }>;
  sourceProvenance: Array<{
    topicId: string;
    kind: string;
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
  topics: FlagshipTopic[];
}

/** 数据文件的静态路径（已拼 basePath）。 */
export const FLAGSHIP_TOPICS_URL = staticUrl("/data/flagship-topics.json");

/** 自定义短片视频的静态路径（已拼 basePath）。 */
export function flagshipVideoUrl(topicId: string): string {
  return staticUrl(`/videos/${topicId}.mp4`);
}

/** 视频清单的静态路径（已拼 basePath）。 */
export const VIDEO_MANIFEST_URL = staticUrl("/videos/manifest.json");

/**
 * 读取自定义短片清单。
 *
 * ⛔ **清单永远存在**（构建期由 ``scripts/build-video-manifest.mjs``
 *    生成），所以这里**不会 404**。清单里没有的专题，运行时压根
 *    不会去请求视频——控制台零红字。
 */
export async function loadVideoManifest(): Promise<string[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch(VIDEO_MANIFEST_URL, { cache: "force-cache" });
    if (!res.ok) return [];
    const data = (await res.json()) as { topics?: string[] };
    return Array.isArray(data.topics) ? data.topics : [];
  } catch {
    return [];
  }
}

/**
 * 加载三个专题的开源数据。
 *
 * ⛔ 失败时返回 ``null``——页面渲染「加载失败」空状态，不白屏。
 */
export async function loadFlagshipTopics(): Promise<FlagshipData | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(FLAGSHIP_TOPICS_URL, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as FlagshipData;
  } catch {
    return null;
  }
}

/** 三个标杆专题的固定 id 顺序。 */
export const FLAGSHIP_TOPIC_IDS = ["exp-comfort", "seq-zeno", "prob-bayes"] as const;

/** 标杆专题 id。 */
export type FlagshipTopicId = (typeof FLAGSHIP_TOPIC_IDS)[number];

/** 判断一个 id 是不是标杆专题。 */
export function isFlagshipTopicId(id: string): id is FlagshipTopicId {
  return (FLAGSHIP_TOPIC_IDS as readonly string[]).includes(id);
}
