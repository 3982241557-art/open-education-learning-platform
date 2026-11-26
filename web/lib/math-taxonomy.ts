/**
 * 数学图谱 · 类型与数据加载
 * =========================
 *
 * 学习地图（``/map``）与实验工坊（``/lab``）的唯一数据源。
 *
 * 数据从 ``/data/math-taxonomy.json`` 读——那份 JSON 由
 * ``scripts/import-math-taxonomy.mjs`` 从两个真实的 GitHub 开源图谱
 * 融合**并提纯**生成（os-taxonomy + cn-k12-math-knowledge-graph）。
 *
 * ⛔ **纯静态安全**。没有任何 API 调用、没有服务端、没有环境变量
 *    依赖。静态导出（``output: "export"``）下直接 fetch 静态文件，
 *    线上零 404。
 *
 * ⛔ **零第三方仿真**。全站不引入任何外部仿真——所有实验台都是
 *    OE 自主研发。这不是洁癖，是**可用性**：第三方 iframe 无法
 *    保证离线可用、无法保证三语一致、无法保证零 404。
 */

/** 一条逻辑链。 */
import { staticUrl } from "@/lib/static-data";

export interface MathChain {
  id: string;
  no: string;
  nameZh: string;
  nameEn: string;
  domain: string;
  accent: string;
  briefZh: string;
  briefEn: string;
  nodeCount: number;
}

/**
 * 真实前置依赖边。
 *
 * ⛔ ``kind`` 如实标注这条边的来源，三种值语义完全不同：
 *
 * - ``direct``     —— os-taxonomy 里有**直接**依赖边；
 * - ``derived``    —— 有真实的**间接**依赖（中间经过被提纯掉的节点）；
 * - ``sequential`` —— **没有**知识依赖，只是教学先后次序。
 *
 * 最后这一种必须显式标出来——把「教学顺序」画成「知识依赖」是
 * 骗人。UI 上三者用不同线型区分。
 */
export interface MathEdge {
  from: string;
  to: string;
  strength: "hard" | "soft" | "unspecified";
  kind: "direct" | "derived" | "sequential";
  reason?: string;
}

/**
 * 自研实验台 id。
 *
 * ⛔ 九个实验台**互不重样**——每一个都有独立的视觉场景、
 *    独立的鼠标交互模型、独立的因果反馈。
 */
export type LabId =
  /* 链 01 · 数感与数量结构 */
  | "one-to-one-counting"
  | "quantity-compare"
  | "baseline-length"
  | "make-ten-snap"
  | "bundle-of-ten"
  | "number-line-jump"
  /* 链 05 / 06 / 07 · 高阶王牌 */
  | "geometry-protractor"
  | "algebra-balance"
  | "function-studio";

/** 三种实验台的中英文名。 */
export const LAB_META: Record<
  LabId,
  { nameZh: string; nameEn: string; engine: string; engineZh: string }
> = {
  "one-to-one-counting": {
    nameZh: "一对一对应点数工坊",
    nameEn: "One-to-One Counting Studio",
    engine: "svg",
    engineZh: "原生 SVG 拖拽引擎",
  },
  "quantity-compare": {
    nameZh: "移多补少比较台",
    nameEn: "Compare & Equalise Bench",
    engine: "svg",
    engineZh: "原生 SVG 拖拽引擎",
  },
  "baseline-length": {
    nameZh: "基准线长短实测台",
    nameEn: "Baseline Length Bench",
    engine: "svg",
    engineZh: "原生 SVG 拖拽引擎",
  },
  "make-ten-snap": {
    nameZh: "十格凑十拼搭盘",
    nameEn: "Make Ten Snap Board",
    engine: "svg",
    engineZh: "原生 SVG 拖拽引擎",
  },
  "bundle-of-ten": {
    nameZh: "按十成组捆绑台",
    nameEn: "Bundle of Ten Bench",
    engine: "svg",
    engineZh: "原生 SVG 拖拽引擎",
  },
  "number-line-jump": {
    nameZh: "动态数轴跳跃台",
    nameEn: "Number Line Leap Lab",
    engine: "svg",
    engineZh: "原生 SVG 拖拽引擎",
  },
  "geometry-protractor": {
    nameZh: "动态几何与透明量角器工坊",
    nameEn: "Dynamic Geometry & Protractor",
    engine: "jsxgraph",
    engineZh: "JSXGraph 动态几何引擎",
  },
  "algebra-balance": {
    nameZh: "真实重力代数天平",
    nameEn: "Gravity Algebra Balance",
    engine: "matter-js",
    engineZh: "Matter.js 2D 物理引擎",
  },
  "function-studio": {
    nameZh: "实时曲线与斜率函数实验室",
    nameEn: "Curve & Slope Studio",
    engine: "mafs",
    engineZh: "Mafs 函数画板引擎",
  },
};

/**
 * 地图节点的三阶因果位置。
 *
 * ⛔ 三阶不是装饰——它决定了节点的**横向轨位**与**因果箭头方向**。
 */
export type MilestoneTier = "intuition" | "structure" | "modeling";

/** 三阶的中英文名。 */
export const TIER_META: Record<
  MilestoneTier,
  { no: string; nameZh: string; nameEn: string }
> = {
  intuition: { no: "1", nameZh: "直觉启蒙", nameEn: "Intuition" },
  structure: { no: "2", nameZh: "结构推导", nameEn: "Structure" },
  modeling: { no: "3", nameZh: "综合建模", nameEn: "Modeling" },
};

/** 一个数学知识点节点。 */
export interface MathNode {
  id: string;
  /** 稳定标识（``chainIndex``，如 ``01-3``）。 */
  key: string;
  chainId: string;
  chainNo: string;
  /** 在链内的序号（1–8）。 */
  index: number;
  /** 三阶因果位置。 */
  tier: MilestoneTier;
  /** 三阶的全局次序（0/1/2）。 */
  tierOrder: number;
  domain: string;
  type: string;
  nameEn: string;
  /** 人工审定的简体中文名。 */
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
  ageRangeStart: number | null;
  ageRangeEnd: number | null;
  centrality: number;
  evidence: string[];
  assessmentPromptEn: string;
  /** cn-k12 教材归属（只取**可确证**的年级 / 册次 / 章节）。 */
  cnRef: {
    id: string;
    grade: number | null;
    book: string | null;
    chapter: string | null;
  } | null;
  /** 自研实验台（每个节点至多挂一个）。 */
  lab: LabId | null;
  status: "playable" | "expanding";
}

/** 整份图谱。 */
export interface MathTaxonomy {
  version: string;
  generatedAt: string;
  attribution: {
    primary: { repo: string; name: string; license: string; used: string };
    secondary: { repo: string; name: string; used: string };
  };
  stats: {
    nodeCount: number;
    edgeCount: number;
    chainCount: number;
    localizedCount: number;
    playableCount: number;
    labCount: number;
    domainCount: number;
  };
  chains: MathChain[];
  tiers: Array<{ id: MilestoneTier; no: string; nameZh: string; nameEn: string }>;
  domains: Array<{ id: string; nameEn: string; nodeCount: number }>;
  nodes: MathNode[];
  edges: MathEdge[];
}

/** 数据文件的静态路径。 */
export const TAXONOMY_URL = staticUrl("/data/math-taxonomy.json");

/**
 * 加载图谱。
 *
 * ⛔ 失败时**不抛错**，而是返回 ``null``——让页面能渲染一个
 *    「图谱加载中 / 加载失败」的空状态，而不是整页白屏。
 */
export async function loadTaxonomy(): Promise<MathTaxonomy | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(TAXONOMY_URL, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as MathTaxonomy;
  } catch {
    return null;
  }
}

/** 节点 id → 节点。 */
export function indexNodes(nodes: MathNode[]): Map<string, MathNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** 某个节点的显示名（按当前语言）。 */
export function nodeLabel(
  node: MathNode,
  locale: string,
): string {
  if (locale === "en") return node.nameEn;
  return node.nameZh;
}

/** 某个节点的描述（按当前语言）。 */
export function nodeDescription(
  node: MathNode,
  locale: string,
): string {
  if (locale === "en") return node.descriptionEn;
  return node.descriptionZh;
}
