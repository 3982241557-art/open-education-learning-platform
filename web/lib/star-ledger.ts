/**
 * 星星 · 徽章 · 学术成果账本
 * ===========================
 *
 * 三阶实时追踪体系的**持久化层**。
 *
 * .. code-block:: text
 *
 *     ⭐ 第 1 颗星（动手探索）  完成本课交互教具核心操作任务
 *     ⭐⭐ 第 2 颗星（深度思考）  完成 Khanmigo 启发思考引导或提问互动
 *     ⭐⭐⭐ 第 3 颗星（巩固掌握）  通过本课巩固测试（正确率达标）
 *
 * 三阶之后
 * --------
 *
 * - **单元学术徽章**：完成某大单元全部课时，或该单元 ≥80% 的星；
 * - **Result Report**：全站汇总（星星数 / 平均掌握度 / 徽章墙 /
 *   能力雷达 / 逐课明细）。
 *
 * 为什么全在 localStorage
 * ----------------------
 *
 * 纯静态导出（``output: "export"``）没有服务端。���有数据的**唯一**
 * 落点就是浏览器的 ``localStorage``。所以这里刻意做成：
 *
 * 1. **单一数据源**——一份 ``oe:stars`` 账本，所有页面读它；
 * 2. **写入即生效**——``saveStars`` 同步写，并广播一个
 *    ``oe:stars-updated`` 事件，好让别的标签页 / 组件立刻同步；
 * 3. **容错**——读不出来就当空账本，绝不抛错白屏。
 *
 * 数据形状
 * --------
 *
 * .. code-block:: ts
 *
 *     interface StarLedger {
 *       courses: Record<string, CourseStarRecord>;
 *     }
 *
 *     interface CourseStarRecord {
 *       // 课程序号 → 该课的三颗星状态
 *       lessons: Record<string, LessonStarRecord>;
 *       // 大单元（unit）→ 该单元的徽章状态
 *       units: Record<string, UnitBadgeRecord>;
 *       updated_at: number;
 *     }
 *
 *     interface LessonStarRecord {
 *       explore: boolean;   // ⭐ 动手探索
 *       think: boolean;     // ⭐⭐ 深度思考
 *       master: boolean;    // ⭐⭐⭐ 巩固掌握
 *       accuracy: number;   // 巩固题正确率 0–1
 *       tool?: string;      // 本课用过的交互教具
 *       updated_at: number;
 *     }
 */

/** localStorage 键。 */
const STORAGE_KEY = "oe:stars";

/** 跨标签页同步事件名。 */
export const STARS_UPDATED_EVENT = "oe:stars-updated";

/** 一堂小课的三颗星状态。 */
export interface LessonStarRecord {
  /** ⭐ 第 1 颗星：完成教具核心操作任务。 */
  explore: boolean;
  /** ⭐⭐ 第 2 颗星：完成启发思考引导或提问互动。 */
  think: boolean;
  /** ⭐⭐⭐ 第 3 颗星：通过巩固测试。 */
  master: boolean;
  /** 巩固题正确率（0–1）。 */
  accuracy: number;
  /** 本课用过的交互教具标签。 */
  tool?: string;
  /** 最近一次更新时间（Unix 毫秒）。 */
  updated_at: number;
}

/** 一个大单元（Unit）的徽章状态。 */
export interface UnitBadgeRecord {
  /** 是否已解锁。 */
  unlocked: boolean;
  /** 该单元获得的星数。 */
  stars: number;
  /** 该单元的总星数（满分）。 */
  maxStars: number;
  /** 解锁时间。 */
  unlocked_at?: number;
}

/** 一套课程的星与徽章账本。 */
export interface CourseStarRecord {
  /** 课序 → 三颗星状态。 */
  lessons: Record<string, LessonStarRecord>;
  /** 单元 id → 徽章状态。 */
  units: Record<string, UnitBadgeRecord>;
  /** 最近一次更新时间。 */
  updated_at: number;
}

/** 全站账本。 */
export interface StarLedger {
  courses: Record<string, CourseStarRecord>;
}

/** 空账本。 */
function emptyLedger(): StarLedger {
  return { courses: {} };
}

/** 安全拿 localStorage。 */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__oe_stars_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读全站账本。 */
export function readLedger(): StarLedger {
  const s = store();
  if (!s) return emptyLedger();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return emptyLedger();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyLedger();
    const courses = (parsed as StarLedger).courses;
    return {
      courses: courses && typeof courses === "object" ? courses : {},
    };
  } catch {
    return emptyLedger();
  }
}

/** 写全站账本 + 广播事件。 */
function writeLedger(ledger: StarLedger): void {
  const s = store();
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(ledger));
    } catch {
      /* 配额满——忽略 */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STARS_UPDATED_EVENT));
  }
}

/** 取某套课程的账本（不存在则创建空壳，但不写盘）。 */
function courseOf(
  ledger: StarLedger,
  courseId: string,
): CourseStarRecord {
  return (
    ledger.courses[courseId] ?? {
      lessons: {},
      units: {},
      updated_at: 0,
    }
  );
}

/** 三颗星的种类。 */
export type StarKind = "explore" | "think" | "master";

/** 三颗星的顺序与文案。 */
export const STAR_META: Array<{
  kind: StarKind;
  label: string;
  hint: string;
}> = [
  {
    kind: "explore",
    label: "动手探索",
    hint: "完成本课交互教具的核心操作任务",
  },
  {
    kind: "think",
    label: "深度思考",
    hint: "完成启发式引导，或向伴学提问并获得回应",
  },
  {
    kind: "master",
    label: "巩固掌握",
    hint: "通过本课巩固测试",
  },
];

/**
 * 点亮一颗星。
 *
 * ⛔ **星星是单调的**——点亮之后不会被熄灭。这跟「已完成」标记
 *    一样：学习发生过就是发生过，回看不应该把它抹掉。
 *
 * @returns 点亮后的状态（如果这一颗已经是亮的，原样返回）。
 */
export function awardStar(
  courseId: string,
  lessonId: string,
  kind: StarKind,
  extra?: { accuracy?: number; tool?: string },
): LessonStarRecord {
  const ledger = readLedger();
  const course = courseOf(ledger, courseId);
  const prev = course.lessons[lessonId] ?? {
    explore: false,
    think: false,
    master: false,
    accuracy: 0,
    updated_at: 0,
  };

  const next: LessonStarRecord = {
    ...prev,
    [kind]: true,
    accuracy: Math.max(prev.accuracy, extra?.accuracy ?? 0),
    tool: extra?.tool ?? prev.tool,
    updated_at: Date.now(),
  };

  course.lessons[lessonId] = next;
  course.updated_at = Date.now();
  ledger.courses[courseId] = course;
  writeLedger(ledger);
  return next;
}

/** 读某一课的星星状态。 */
export function readLessonStars(
  courseId: string,
  lessonId: string,
): LessonStarRecord {
  const ledger = readLedger();
  return (
    courseOf(ledger, courseId).lessons[lessonId] ?? {
      explore: false,
      think: false,
      master: false,
      accuracy: 0,
      updated_at: 0,
    }
  );
}

/** 某一课已点亮的星数（0–3）。 */
export function countLessonStars(
  courseId: string,
  lessonId: string,
): number {
  const record = readLessonStars(courseId, lessonId);
  return (
    (record.explore ? 1 : 0) +
    (record.think ? 1 : 0) +
    (record.master ? 1 : 0)
  );
}

/**
 * 结算单元徽章。
 *
 * 达成条件（满足其一）：
 *
 * 1. 该单元**所有**课时都拿到 3 颗星（满分）；
 * 2. 该单元**≥80%** 的星被点亮。
 *
 * @param unitId 单元 id
 * @param lessonIds 该单元下的全部课序
 * @param courseId 课程 id
 */
export function settleUnitBadge(
  courseId: string,
  unitId: string,
  lessonIds: string[],
): UnitBadgeRecord {
  const ledger = readLedger();
  const course = courseOf(ledger, courseId);

  let stars = 0;
  let maxStars = 0;
  for (const lessonId of lessonIds) {
    const record = course.lessons[lessonId];
    maxStars += 3;
    if (!record) continue;
    stars +=
      (record.explore ? 1 : 0) +
      (record.think ? 1 : 0) +
      (record.master ? 1 : 0);
  }

  const allMastered =
    lessonIds.length > 0 &&
    lessonIds.every((id) => countLessonStars(courseId, id) >= 3);
  const ratio = maxStars > 0 ? stars / maxStars : 0;
  const unlocked = allMastered || ratio >= 0.8;

  const prev = course.units[unitId];
  const next: UnitBadgeRecord = {
    unlocked: unlocked || Boolean(prev?.unlocked),
    stars,
    maxStars,
    unlocked_at: unlocked
      ? (prev?.unlocked_at ?? Date.now())
      : prev?.unlocked_at,
  };

  course.units[unitId] = next;
  course.updated_at = Date.now();
  ledger.courses[courseId] = course;
  writeLedger(ledger);
  return next;
}

/** 读某单元的徽章状态。 */
export function readUnitBadge(
  courseId: string,
  unitId: string,
): UnitBadgeRecord {
  const ledger = readLedger();
  return (
    courseOf(ledger, courseId).units[unitId] ?? {
      unlocked: false,
      stars: 0,
      maxStars: 0,
    }
  );
}

/** 课程级汇总。 */
export interface CourseStarSummary {
  /** 已获得的星数。 */
  stars: number;
  /** 满分星数。 */
  maxStars: number;
  /** 平均掌握度百分比。 */
  mastery: number;
  /** 已解锁徽章数。 */
  badges: number;
  /** 徽章总数。 */
  maxBadges: number;
  /** 已点亮的课数（≥1 颗星）。 */
  lessonsStarted: number;
  /** 已满星的课数（3 颗星）。 */
  lessonsMastered: number;
  /** 课程总数。 */
  lessonsTotal: number;
}

/** 汇总一套课程的星星与徽章。 */
export function summarizeCourse(
  courseId: string,
  lessonIds: string[],
  unitIds: string[] = [],
): CourseStarSummary {
  const ledger = readLedger();
  const course = courseOf(ledger, courseId);

  let stars = 0;
  let started = 0;
  let mastered = 0;

  for (const lessonId of lessonIds) {
    const record = course.lessons[lessonId];
    if (!record) continue;
    const count =
      (record.explore ? 1 : 0) +
      (record.think ? 1 : 0) +
      (record.master ? 1 : 0);
    stars += count;
    if (count > 0) started += 1;
    if (count >= 3) mastered += 1;
  }

  const maxStars = lessonIds.length * 3;
  let badges = 0;
  for (const unitId of unitIds) {
    if (course.units[unitId]?.unlocked) badges += 1;
  }

  return {
    stars,
    maxStars,
    mastery: maxStars > 0 ? Math.round((stars / maxStars) * 100) : 0,
    badges,
    maxBadges: unitIds.length,
    lessonsStarted: started,
    lessonsMastered: mastered,
    lessonsTotal: lessonIds.length,
  };
}

/** 全站汇总——所有课程加总。 */
export function summarizeAll(): {
  stars: number;
  maxStars: number;
  mastery: number;
  badges: number;
  courses: number;
} {
  const ledger = readLedger();
  let stars = 0;
  let maxStars = 0;
  let badges = 0;
  let courses = 0;

  for (const course of Object.values(ledger.courses)) {
    courses += 1;
    for (const record of Object.values(course.lessons)) {
      stars +=
        (record.explore ? 1 : 0) +
        (record.think ? 1 : 0) +
        (record.master ? 1 : 0);
      maxStars += 3;
    }
    for (const unit of Object.values(course.units)) {
      if (unit.unlocked) badges += 1;
    }
  }

  return {
    stars,
    maxStars,
    mastery: maxStars > 0 ? Math.round((stars / maxStars) * 100) : 0,
    badges,
    courses,
  };
}

/** 重置某一套课程的账本——「重新开始这一门课」。 */
export function resetCourseStars(courseId: string): void {
  const ledger = readLedger();
  delete ledger.courses[courseId];
  writeLedger(ledger);
}
