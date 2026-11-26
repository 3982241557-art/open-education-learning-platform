"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadTaxonomy,
  type MathChain,
  type MathNode,
  type MathTaxonomy,
} from "@/lib/math-taxonomy";
import {
  MATH_STARS_UPDATED_EVENT,
  readMathLedger,
  summarizeMath,
} from "@/lib/math-star-ledger";

/**
 * 数学图谱上下文
 * ===============
 *
 * 把那份 ``/data/math-taxonomy.json`` 变成全站共享的单例。
 *
 * 为什么用 Context 而不是各自 fetch
 * ---------------------------------
 *
 * 左侧栏的逻辑链筛选器要读图谱，``/map`` 画布要读图谱，
 * ``/lab`` 要读节点详情——三处都读同一份 583 节点的大 JSON。
 * 各自 fetch 不会真的发三次请求（浏览器缓存），但会各自维护一份
 * 解析后的副本（几十 MB 堆内存），而且加载时序不同步。
 *
 * Context 把它变成**一次加载，全站共享**。
 */
export interface MathTaxonomyContextValue {
  /** 图谱数据；null = 加载中或加载失败。 */
  taxonomy: MathTaxonomy | null;
  /** 加载中。 */
  loading: boolean;
  /** 加载失败。 */
  failed: boolean;
  /** 重新加载。 */
  reload: () => void;
  /** 全部可玩节点 id（挂了自研实验台）。 */
  playableNodeIds: string[];
  /** 节点 id → 节点。 */
  nodeMap: Map<string, MathNode>;
  /** 链 id → 链。 */
  chainMap: Map<string, MathChain>;
  /** 每条链的星星进度。 */
  chainProgress: Record<string, { stars: number; maxStars: number }>;
  /** 全站星星汇总。 */
  summary: { stars: number; nodesStarted: number; nodesMastered: number; badges: number };
  /** 重新读取账本（星星变化时调用）。 */
  refreshStars: () => void;
  /**
   * 当前聚焦的逻辑链 id；null = 显示全部。
   *
   * ⛔ 之所以放�� Context 而不是各自维护：左侧栏的筛选器与
   *    ``/map`` 画布必须**指向同一个筛选状态**。如果各管各的，
   *    用户点左栏的链，画布却没反应——这正是老版本「点了没反应」
   *    的那类断联 bug。
   */
  activeChainId: string | null;
  /** 设置聚焦的逻辑链。 */
  setActiveChainId: (chainId: string | null) => void;
}

const MathTaxonomyContext = createContext<MathTaxonomyContextValue | null>(null);

export function MathTaxonomyProvider({ children }: { children: ReactNode }) {
  const [taxonomy, setTaxonomy] = useState<MathTaxonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [starTick, setStarTick] = useState(0);
  const [activeChainId, setActiveChainId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    loadTaxonomy().then((data) => {
      if (!alive) return;
      if (data) setTaxonomy(data);
      else setFailed(true);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [nonce]);

  /** 星星账本变化时重算汇总。 */
  useEffect(() => {
    const onUpdate = () => setStarTick((t) => t + 1);
    window.addEventListener(MATH_STARS_UPDATED_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(MATH_STARS_UPDATED_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const value = useMemo<MathTaxonomyContextValue>(() => {
    const nodes = taxonomy?.nodes ?? [];
    const chains = taxonomy?.chains ?? [];

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const chainMap = new Map(chains.map((c) => [c.id, c]));

    const playableNodeIds = nodes
      .filter((n) => n.lab)
      .map((n) => n.id);

    // 链进度：链内可玩节点的星数汇总.
    const chainProgress: Record<string, { stars: number; maxStars: number }> = {};
    const ledger = readMathLedger();
    for (const chain of chains) {
      const ids = nodes
        .filter((n) => n.chainId === chain.id && n.lab)
        .map((n) => n.id);
      let stars = 0;
      for (const id of ids) {
        const r = ledger.nodes[id];
        if (!r) continue;
        stars +=
          (r.explore ? 1 : 0) +
          (r.discover ? 1 : 0) +
          (r.mystery ? 1 : 0);
      }
      chainProgress[chain.id] = { stars, maxStars: ids.length * 3 };
    }

    const summary = summarizeMath(playableNodeIds);

    return {
      taxonomy,
      loading,
      failed,
      reload: () => setNonce((n) => n + 1),
      playableNodeIds,
      nodeMap,
      chainMap,
      chainProgress,
      summary,
      refreshStars: () => setStarTick((t) => t + 1),
      activeChainId,
      setActiveChainId,
    };
  }, [taxonomy, loading, failed, starTick, activeChainId]);

  return (
    <MathTaxonomyContext.Provider value={value}>
      {children}
    </MathTaxonomyContext.Provider>
  );
}

/** 读取数学图谱上下文。 */
export function useMathTaxonomy(): MathTaxonomyContextValue {
  const ctx = useContext(MathTaxonomyContext);
  if (!ctx) {
    throw new Error("useMathTaxonomy 必须在 MathTaxonomyProvider 内使用");
  }
  return ctx;
}
