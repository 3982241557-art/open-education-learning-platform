/**
 * 教具行为事件
 * ============
 *
 * 「实时行为级学习追踪」的传输层。
 *
 * 为什么要有这一层
 * ----------------
 *
 * 教具（笔顺描红 / 量角器 / 函数坐标系 / 统计图）在组件树里是**孤岛**
 * ——它们不知道自己在一个有 AI 助教、有进度条、有学情中心的页面里。
 *
 * 而「用户完成了 6/8 个生字描红」这条信息，必须同时出现在：
 *
 * 1. 右侧 AI 伴学的**当前学习上下文**里；
 * 2. 巩固检测卡上的「教具探究 6/8」徽标上；
 * 3. 最终的「教具 + 巩固题」双达标判定里。
 *
 * 三个消费方分属不同组件树，靠 props 透传既啰嗦又脆弱。所以用
 * 一个**浏览器自定义事件**做总线——教具只管发，消费方各自订阅。
 *
 * 这与 :mod:`learning-events` 是同一套思路，但**语义不同**：
 * 那一条是「跨路由的持久化数据变更」，这一条是「页面内的即时行为
 * 信号」。混在一起会让两边都变得含糊。
 */

/** 教具行为事件名。 */
export const LAB_CONTEXT_EVENT = "seek:lab-context";

/** 教具上报的上下文。 */
export interface LabContextDetail {
  /** 教具种类。 */
  kind: string;
  /** 教具标题。 */
  title: string;
  /** 已完成的探索任务数。 */
  done: number;
  /** 探索任务总数。 */
  total: number;
  /** 一句话状态描述——直接展示给用户看。 */
  message: string;
  /** 本课的探索任务清单（用于展示「已完成 6/8 个本课生字描红」）。 */
  tasks?: Array<{ label: string; done: boolean }>;
}

/**
 * 上报一次教具行为。
 *
 * 教具组件在每次「用户完成了一个探索任务」时调用它。
 */
export function reportLabContext(detail: LabContextDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LabContextDetail>(LAB_CONTEXT_EVENT, { detail }),
  );
}

/**
 * 生成一句人类可读的进度描述。
 *
 * 例：「已完成 6/8 个本课生字描红」。
 */
export function describeProgress(
  prefix: string,
  done: number,
  total: number,
): string {
  if (total <= 0) return prefix;
  return `已完成 ${done}/${total} 个${prefix}`;
}
