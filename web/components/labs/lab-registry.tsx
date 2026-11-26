/**
 * 自研实验台注册表
 * =================
 *
 * 九个实验台**互不重样**——每一个都有独立的视觉场景、独立的鼠标
 * 交互模型、独立的因果反馈。
 *
 * ⛔ **零第三方仿真**。全站不挂任何外部仿真 iframe：那类东西无法保证
 *    离线可用、无法保证三语一致、无法保证线上零 404，而且样式完全
 *    脱离本站的视觉体系。
 *
 * 这个文件是「哪个 lab id 对应哪个组件」的唯一真相。页面只管按 id
 * 找组件，剩下的交给各自的实现。
 */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { LabId } from "@/lib/math-taxonomy";
import type { LabProps } from "@/components/labs/lab-types";

/** 实验台骨架（懒加载时的占位）。 */
function LabSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <span
        aria-busy="true"
        className="block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#1D4ED8]"
      />
    </div>
  );
}

/**
 * 每个实验台都是 ``ssr: false`` 懒加载。
 *
 * ⛔ 物理引擎（matter-js）与几何引擎（jsxgraph）在模块顶层就碰
 *    ``window``，静态导出时服务端渲染会直接抛错。
 */
function lazyLab(loader: () => Promise<{ default: ComponentType<LabProps> }>) {
  return dynamic(loader, { ssr: false, loading: () => <LabSkeleton /> });
}

/* ── 链 01 · 数感与数量结构（六个全新实验台）───────────────────── */

const OneToOneCountingLab = lazyLab(
  () => import("@/components/labs/OneToOneCountingLab"),
);
const QuantityCompareLab = lazyLab(
  () => import("@/components/labs/QuantityCompareLab"),
);
const BaselineLengthLab = lazyLab(
  () => import("@/components/labs/BaselineLengthLab"),
);
const MakeTenSnapLab = lazyLab(
  () => import("@/components/labs/MakeTenSnapLab"),
);
const BundleOfTenLab = lazyLab(
  () => import("@/components/labs/BundleOfTenLab"),
);
const NumberLineJumpLab = lazyLab(
  () => import("@/components/labs/NumberLineJumpLab"),
);

/* ── 高阶王牌（三个已有实验台）─────────────────────────────────── */

const GeometryProtractorLab = lazyLab(
  () => import("@/components/labs/GeometryProtractorLab"),
);
const AlgebraBalanceLab = lazyLab(
  () => import("@/components/labs/AlgebraBalanceLab"),
);
const FunctionStudioLab = lazyLab(
  () => import("@/components/labs/FunctionStudioLab"),
);

/** lab id → 组件。 */
export const LAB_COMPONENTS: Record<LabId, ComponentType<LabProps>> = {
  "one-to-one-counting": OneToOneCountingLab,
  "quantity-compare": QuantityCompareLab,
  "baseline-length": BaselineLengthLab,
  "make-ten-snap": MakeTenSnapLab,
  "bundle-of-ten": BundleOfTenLab,
  "number-line-jump": NumberLineJumpLab,
  "geometry-protractor": GeometryProtractorLab,
  "algebra-balance": AlgebraBalanceLab,
  "function-studio": FunctionStudioLab,
};

/** 全部实验台 id——用于「零重复套壳」自检。 */
export const ALL_LAB_IDS = Object.keys(LAB_COMPONENTS) as LabId[];
