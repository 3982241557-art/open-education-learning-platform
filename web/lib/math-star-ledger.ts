/**
 * 数学图谱 · 星星与逻辑链徽章账本
 * =================================
 *
 * 与旧版的 ``star-ledger.ts``（按「课程 → 课序」组织）**并行**的一套
 * 账本，按「知识点节点 id」组织。
 *
 * 为什么分开
 * ----------
 *
 * 旧账本假设「课」是一个有课程 id、有课序、有单元的线性结构。
 * 数学学习地图是**图**——节点有 583 个、分布在 8 条链上、每条链
 * 内部有真实的前置依赖边。把图谱硬塞进「课程 / 课序 / 单元」三层
 * 结构里，会逼出一堆假字段。
 *
 * 所以另起一套。它的形状就是图谱本身。
 *
 * 三阶星星
 * --------
 *
 * - ⭐ 第 1 颗：完成**探索 Explore**阶段的真实动手操作；
 * - ⭐⭐ 第 2 颗：完成**规律 Discover**阶段的交互验证；
 * - ⭐⭐⭐ 第 3 颗：独立破解**谜题 Mystery**。
 *
 * 逻辑链大师徽章
 * --------------
 *
 * 一条链下**所有已上线可玩**的实验节点都拿到 ≥2 颗星时点亮。
 * 「已上线可玩」= 该节点挂了自研实验台。
 * 深度实验室研发中的节点不参与——它们本来就没有实验可做。
 *
 * 持久化
 * ------
 *
 * ``localStorage``——纯静态导出没有服务端，这是唯一落点。
 */

/** localStorage 键。 */
const STORAGE_KEY = "oe:math-stars";

/** 跨标签页同步事件名。 */
export const MATH_STARS_UPDATED_EVENT = "oe:math-stars-updated";

/** 三颗星的种类。 */
export type MathStarKind = "explore" | "discover" | "mystery";

/** 星星的顺序与文案。 */
export const MATH_STAR_META: Array<{
  kind: MathStarKind;
  labelZh: string;
  labelEn: string;
}> = [
  { kind: "explore", labelZh: "动手探索", labelEn: "Explore" },
  { kind: "discover", labelZh: "发现规律", labelEn: "Discover" },
  { kind: "mystery", labelZh: "破解谜题", labelEn: "Mystery" },
];

/** 一个节点的星星状态。 */
export interface MathNodeStars {
  explore: boolean;
  discover: boolean;
  mystery: boolean;
  /** 最近一次更新时间。 */
  updated_at: number;
}

/** 全站账本。 */
export interface MathStarLedger {
  /** 节点 id → 星星状态。 */
  nodes: Record<string, MathNodeStars>;
  /** 链 id → 徽章状态。 */
  chains: Record<string, { unlocked: boolean; unlocked_at?: number }>;
  updated_at: number;
}

function emptyLedger(): MathStarLedger {
  return { nodes: {}, chains: {}, updated_at: 0 };
}

/** 安全拿 localStorage。 */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__oe_math_stars_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读全站账本。 */
export function readMathLedger(): MathStarLedger {
  const s = store();
  if (!s) return emptyLedger();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return emptyLedger();
    const parsed = JSON.parse(raw) as MathStarLedger;
    if (!parsed || typeof parsed !== "object") return emptyLedger();
    return {
      nodes:
        parsed.nodes && typeof parsed.nodes === "object" ? parsed.nodes : {},
      chains:
        parsed.chains && typeof parsed.chains === "object" ? parsed.chains : {},
      updated_at: parsed.updated_at ?? 0,
    };
  } catch {
    return emptyLedger();
  }
}

/** 写全站账本 + 广播事件。 */
function writeMathLedger(ledger: MathStarLedger): void {
  const s = store();
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(ledger));
    } catch {
      /* 配额满——忽略 */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MATH_STARS_UPDATED_EVENT));
  }
}

/** 读某个节点的星星状态。 */
export function readNodeStars(nodeId: string): MathNodeStars {
  return (
    readMathLedger().nodes[nodeId] ?? {
      explore: false,
      discover: false,
      mystery: false,
      updated_at: 0,
    }
  );
}

/** 某个节点已点亮的星数（0–3）。 */
export function countNodeStars(nodeId: string): number {
  const r = readNodeStars(nodeId);
  return (
    (r.explore ? 1 : 0) +
    (r.discover ? 1 : 0) +
    (r.mystery ? 1 : 0)
  );
}

/**
 * 点亮一颗星。
 *
 * ⛔ **星星是单调的**——点亮之后不会被熄灭。学习发生过就是发生过。
 *
 * @returns 点亮后的状态。
 */
export function awardMathStar(
  nodeId: string,
  kind: MathStarKind,
): MathNodeStars {
  const ledger = readMathLedger();
  const prev = ledger.nodes[nodeId] ?? {
    explore: false,
    discover: false,
    mystery: false,
    updated_at: 0,
  };
  const next: MathNodeStars = {
    ...prev,
    [kind]: true,
    updated_at: Date.now(),
  };
  ledger.nodes[nodeId] = next;
  ledger.updated_at = Date.now();
  writeMathLedger(ledger);
  return next;
}

/** 某条链的徽章是否已解锁。 */
export function isChainBadgeUnlocked(chainId: string): boolean {
  return Boolean(readMathLedger().chains[chainId]?.unlocked);
}

/**
 * 结算逻辑链大师徽章。
 *
 * 达成条件：链内**所有已上线可玩**的节点都拿到 ≥2 颗星。
 * 研发中的节点不参与判定。
 *
 * @param chainId 链 id
 * @param playableNodeIds 链内已上线可玩的节点 id 列表
 * @returns 徽章状态（是否解锁、解锁时间）
 */
export function settleChainBadge(
  chainId: string,
  playableNodeIds: string[],
): { unlocked: boolean; unlocked_at?: number } {
  const ledger = readMathLedger();
  const prev = ledger.chains[chainId];

  const unlocked =
    playableNodeIds.length > 0 &&
    playableNodeIds.every((id) => countNodeStars(id) >= 2);

  const next = {
    unlocked: unlocked || Boolean(prev?.unlocked),
    unlocked_at: unlocked ? (prev?.unlocked_at ?? Date.now()) : prev?.unlocked_at,
  };

  ledger.chains[chainId] = next;
  ledger.updated_at = Date.now();
  writeMathLedger(ledger);
  return next;
}

/** 全站汇总。 */
export interface MathSummary {
  /** 已获星数。 */
  stars: number;
  /** 已点亮的节点数（≥1 颗星）。 */
  nodesStarted: number;
  /** 已满星的节点数（3 颗星）。 */
  nodesMastered: number;
  /** 已解锁徽章数。 */
  badges: number;
  /** 全站星数上限（按已探索到的节点算）。 */
  maxStars: number;
}

/** 汇总全站星星与徽章。 */
export function summarizeMath(playableNodeIds: string[]): MathSummary {
  const ledger = readMathLedger();
  let stars = 0;
  let nodesStarted = 0;
  let nodesMastered = 0;

  for (const id of playableNodeIds) {
    const r = ledger.nodes[id];
    if (!r) continue;
    const count =
      (r.explore ? 1 : 0) +
      (r.discover ? 1 : 0) +
      (r.mystery ? 1 : 0);
    stars += count;
    if (count > 0) nodesStarted += 1;
    if (count >= 3) nodesMastered += 1;
  }

  let badges = 0;
  for (const c of Object.values(ledger.chains)) {
    if (c.unlocked) badges += 1;
  }

  return {
    stars,
    nodesStarted,
    nodesMastered,
    badges,
    maxStars: playableNodeIds.length * 3,
  };
}

/** 清空全站账本。 */
export function resetMathStars(): void {
  writeMathLedger(emptyLedger());
}
