/**
 * 课程单元划分
 * =============
 *
 * 把一整套 K12 年级系列的**几十上百节课**组织成「星轨学习地图」。
 *
 * 为什么要划分单元
 * ----------------
 *
 * 旧版课程大厅是「一张分集表格」——上百行标题，每行一个链接。
 * 问题是：
 *
 * 1. **看不到结构**。用户不知道「我现在在第几块」，也不知道这一门课
 *    一共分几段；
 * 2. **没有目标感**。进度条只给一个百分比，但「完成第三单元」是
 *    一个**可以努力的具体目标**；
 * 3. **徽章无处安放**。「单元学术徽章」需要一个挂载点。
 *
 * 划分规则
 * --------
 *
 * 优先用课程数据里**已有的单元信号**——课名里带「第 N 单元」的，
 * 或者 ``core_title`` 里带「第 N 单元」的，直接按它分。
 *
 * 剩下的按**固定容量**兜底：每 8 讲一个单元。这保证了：
 *
 * - 任何年级、任何学科都能得到**有意义**的单元划分；
 * - 单元数量可控（不会 5 个也不会 50 个）；
 * - 划分是**纯函数**——同样的数据永远得到同样的结果，徽章不会因为
 *   重新加载而「消失」。
 */

/** 一个大课 / 单元。 */
export interface CourseUnit {
  /** 单元 id——在课程内唯一，用于徽章账本。 */
  id: string;
  /** 单元序号（从 1 开始）。 */
  index: number;
  /** 单元标题。 */
  title: string;
  /** 单元标题（英文）。 */
  titleEn: string;
  /** 本单元包含的课序。 */
  lessonIds: string[];
  /** 本单元的课名（预览用）。 */
  lessonTitles: string[];
}

/** 一堂课的最少信息——划分单元只需要这些。 */
export interface LessonStub {
  ep_id: string;
  title: string;
  core_title?: string | null;
}

/** 每单元的兜底容量。 */
const UNIT_SIZE = 8;

/** 从课名里抽「第 N 单元」。 */
function extractUnitNumber(text: string): number | null {
  const match = /第\s*([0-9一二三四五六七八九十]+)\s*单元/.exec(text ?? "");
  if (!match) return null;
  const raw = match[1];
  const value = Number(raw);
  if (Number.isInteger(value) && value > 0) return value;
  // 中文数字。
  const cnDigits: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  return cnDigits[raw] ?? null;
}

/**
 * 把一整套课划分成单元。
 *
 * @param lessons 该套课的全部课时（按 index 升序）
 * @param subject 学科——用来给兜底单元起名
 */
export function buildUnits(
  lessons: LessonStub[],
  subject: "chinese" | "math",
): CourseUnit[] {
  if (lessons.length === 0) return [];

  /** 先试着用课程自带的单元信号分组。 */
  const groups = new Map<number, LessonStub[]>();
  let hasSignal = false;

  for (const lesson of lessons) {
    const source = lesson.core_title ?? lesson.title;
    const unitNumber = extractUnitNumber(source);
    if (unitNumber === null) continue;
    hasSignal = true;
    const bucket = groups.get(unitNumber) ?? [];
    bucket.push(lesson);
    groups.set(unitNumber, bucket);
  }

  /** 没有单元信号 → 按固定容量兜底。 */
  if (!hasSignal) {
    const units: CourseUnit[] = [];
    for (let i = 0; i < lessons.length; i += UNIT_SIZE) {
      const slice = lessons.slice(i, i + UNIT_SIZE);
      units.push({
        id: `u${Math.floor(i / UNIT_SIZE) + 1}`,
        index: units.length + 1,
        title: fallbackUnitTitle(subject, units.length + 1),
        titleEn: fallbackUnitTitleEn(subject, units.length + 1),
        lessonIds: slice.map((item) => item.ep_id),
        lessonTitles: slice.map((item) => item.title),
      });
    }
    return units;
  }

  /**
   * 有单元信号 → 按单元号排序输出，但保持课序原样。
   *
   * ⚠️ **必须收尾兜底**。
   *
   * 真实课程数据里，**部分课没有「第 N 单元」信号**——比如数学的
   * 「基础篇 / 提升篇」编号课、语文的「第 1 集 / 第 2 集」。旧版
   * 的实现直接 ``return``，这些课就被**整个丢掉了**：它们既不出
   * 现在单元 Tab 里，也点不进去。
   *
   * 实测 26 套课里有 **446 节课**因此消失——占全部 1302 节的
   * **34%**。用户会看到「这门课怎么少了三分之一」。
   *
   * 所以这里加一道收尾：把没被任何单元收走的课，按固定容量补成
   * 兜底单元，**追加在最后**（不打断已有的单元顺序）。
   */
  const numbers = [...groups.keys()].sort((a, b) => a - b);
  const units: CourseUnit[] = numbers.map((number, position) => {
    const bucket = groups.get(number) ?? [];
    return {
      id: `u${number}`,
      index: position + 1,
      title: `第 ${number} 单元`,
      titleEn: `Unit ${number}`,
      lessonIds: bucket.map((item) => item.ep_id),
      lessonTitles: bucket.map((item) => item.title),
    };
  });

  /** 收尾兜底——没被任何单元收走的课。 */
  const covered = new Set(units.flatMap((unit) => unit.lessonIds));
  const leftovers = lessons.filter((item) => !covered.has(item.ep_id));
  if (leftovers.length > 0) {
    for (let i = 0; i < leftovers.length; i += UNIT_SIZE) {
      const slice = leftovers.slice(i, i + UNIT_SIZE);
      units.push({
        id: `u_extra_${Math.floor(i / UNIT_SIZE) + 1}`,
        index: units.length + 1,
        title: fallbackUnitTitle(subject, units.length + 1),
        titleEn: fallbackUnitTitleEn(subject, units.length + 1),
        lessonIds: slice.map((item) => item.ep_id),
        lessonTitles: slice.map((item) => item.title),
      });
    }
  }

  return units;
}

/** 兜底单元标题（中文）。 */
function fallbackUnitTitle(
  subject: "chinese" | "math",
  index: number,
): string {
  return subject === "chinese"
    ? `第 ${index} 阶段 · 基础夯实`
    : `第 ${index} 阶段 · 思维进阶`;
}

/** 兜底单元标题（英文）。 */
function fallbackUnitTitleEn(
  subject: "chinese" | "math",
  index: number,
): string {
  return subject === "chinese"
    ? `Stage ${index} · Foundations`
    : `Stage ${index} · Reasoning`;
}
