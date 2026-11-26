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
  loadGeometryChain,
  type GeometryChain,
  type GeometryLesson,
} from "@/lib/geometry-chain";

/**
 * 几何链上下文
 * ============
 *
 * 把那份 ``/data/geometry-chain.json`` 变成全站共享的单例。
 *
 * 为什么单独一个 Context 而不是塞进 :mod:`MathTaxonomyContext`
 * ----------------------------------------------------------
 *
 * 两个数据源的**性质完全不同**：
 *
 * - ``math-taxonomy.json`` —— 583 节点的大图谱，覆盖全站数学；
 * - ``geometry-chain.json`` —— 只有 8 节课的标杆链，内容来自
 *   开源仓库、带完整来源记录。
 *
 * 混在一起会让「图谱」这个概念变得不纯：一份是「自研整理的知识
 * 图谱」，另一份是「从 GitHub 开源仓库拉来的原始课程」。分开
 * 之后，来源追溯链条始终清晰——``geometry-chain.json`` 里的每
 * 一条都能追到 Khan / OpenStax / cn-k12。
 */
export interface GeometryChainContextValue {
  /** 几何链数据；null = 加载中或加载失败。 */
  chain: GeometryChain | null;
  /** 加载中。 */
  loading: boolean;
  /** 加载失败。 */
  failed: boolean;
  /** 重新加载。 */
  reload: () => void;
  /** 课 id → 课。 */
  lessonMap: Map<string, GeometryLesson>;
  /** 按固定顺序排好的 8 节课。 */
  lessons: GeometryLesson[];
}

const GeometryChainContext = createContext<GeometryChainContextValue | null>(
  null,
);

export function GeometryChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChain] = useState<GeometryChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    loadGeometryChain().then((data) => {
      if (!alive) return;
      if (data) setChain(data);
      else setFailed(true);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const value = useMemo<GeometryChainContextValue>(() => {
    const lessons = chain?.lessons ?? [];
    return {
      chain,
      loading,
      failed,
      reload: () => setNonce((n) => n + 1),
      lessonMap: new Map(lessons.map((l) => [l.id, l])),
      lessons,
    };
  }, [chain, loading, failed]);

  return (
    <GeometryChainContext.Provider value={value}>
      {children}
    </GeometryChainContext.Provider>
  );
}

/** 读取几何链上下文。 */
export function useGeometryChain(): GeometryChainContextValue {
  const ctx = useContext(GeometryChainContext);
  if (!ctx) {
    throw new Error("useGeometryChain 必须在 GeometryChainProvider 内使用");
  }
  return ctx;
}
