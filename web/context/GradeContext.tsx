"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 学习者年级
 * =============
 *
 * 「这个孩子现在几年级」是整个平台**最关键**的一个参数——
 * 它决定课程大厅聚焦哪套课、诊断卡出哪种题、AI 助教讲多深。
 *
 * 为什么独立成一个 Context
 * -----------------------
 *
 * 它既不属于「地区 / 语言」（``LocaleContext``），也不属于「个人
 * 资料文本」（``ProfileContext``）：
 *
 * - 语言是**界面偏好**；
 * - 昵称头像是**身份**；
 * - 年级是**学习位置**——它跟着课程走，跟着进度走。
 *
 * 而且它需要在**课程大厅**与**个人中心**之间同步：在大厅选了
 * 二年级，个人中心也要显示二年级。所以它必须独立。
 *
 * 持久化
 * ------
 *
 * 写进 ``localStorage``——静态站点没有服务端，档案同步是「尽力而为」，
 * 而年级是**必须立刻生效**的。
 */

const STORAGE_KEY = "dreamclass.grade";

/** 年级选项——12 个年级 + 「未选」。 */
export interface GradeOption {
  /** 年级数字（1–12）。 */
  number: number;
  /** 中文名。 */
  name: string;
  /** 别名（初一 / 高一……）。 */
  alias: string;
  /** 适用年龄区间。 */
  ageRange: [number, number];
  /** 学段。 */
  stage: "primary" | "junior" | "senior";
}

/** 全部 12 个年级。 */
export const GRADE_OPTIONS: GradeOption[] = [
  { number: 1, name: "一年级", alias: "小一", ageRange: [6, 7], stage: "primary" },
  { number: 2, name: "二年级", alias: "小二", ageRange: [7, 8], stage: "primary" },
  { number: 3, name: "三年级", alias: "小三", ageRange: [8, 9], stage: "primary" },
  { number: 4, name: "四年级", alias: "小四", ageRange: [9, 10], stage: "primary" },
  { number: 5, name: "五年级", alias: "小五", ageRange: [10, 11], stage: "primary" },
  { number: 6, name: "六年级", alias: "小六", ageRange: [11, 12], stage: "primary" },
  { number: 7, name: "七年级", alias: "初一", ageRange: [12, 13], stage: "junior" },
  { number: 8, name: "八年级", alias: "初二", ageRange: [13, 14], stage: "junior" },
  { number: 9, name: "九年级", alias: "初三", ageRange: [14, 15], stage: "junior" },
  { number: 10, name: "高一", alias: "高一年级", ageRange: [15, 16], stage: "senior" },
  { number: 11, name: "高二", alias: "高二年级", ageRange: [16, 17], stage: "senior" },
  { number: 12, name: "高三", alias: "高三年级", ageRange: [17, 18], stage: "senior" },
];

/** 找到某年级的选项。 */
export function gradeOption(number: number): GradeOption | undefined {
  return GRADE_OPTIONS.find((item) => item.number === number);
}

/** 学段的中文名。 */
export const STAGE_LABELS: Record<GradeOption["stage"], string> = {
  primary: "小学部",
  junior: "初中部",
  senior: "高中部",
};

interface GradeValue {
  /** 当前年级（``0`` = 还没选过）。 */
  grade: number;
  /** 选一个年级。 */
  setGrade: (grade: number) => void;
  /** 是否已经选过（决定要不要弹引导卡）。 */
  onboarded: boolean;
  /** 标记引导已完成（用户点了「稍后再说」也算）。 */
  markOnboarded: () => void;
  /** 当前年级的元信息。 */
  option: GradeOption | null;
  /** 「二年级 (7–8岁)」这样的展示串。 */
  label: string;
}

const GradeContext = createContext<GradeValue | null>(null);

/** 读本地存的年级。 */
function readStoredGrade(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = Number(raw);
    return Number.isInteger(value) && value >= 1 && value <= 12 ? value : 0;
  } catch {
    return 0;
  }
}

export function GradeProvider({ children }: { children: ReactNode }) {
  const [grade, setGradeState] = useState(0);
  const [onboarded, setOnboarded] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // 挂载后读取——SSR 阶段没有 localStorage。
  useEffect(() => {
    const stored = readStoredGrade();
    setGradeState(stored);
    // 选过年级 = 已经完成过引导（哪怕是手动选的）。
    setOnboarded(stored > 0);
    setHydrated(true);
  }, []);

  const setGrade = useCallback((next: number) => {
    const value =
      Number.isInteger(next) && next >= 1 && next <= 12 ? next : 0;
    setGradeState(value);
    if (typeof window === "undefined") return;
    try {
      if (value > 0) {
        window.localStorage.setItem(STORAGE_KEY, String(value));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* 隐私模式下可能不可写——忽略 */
    }
  }, []);

  const markOnboarded = useCallback(() => {
    setOnboarded(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`${STORAGE_KEY}.onboarded`, "1");
    } catch {
      /* 忽略 */
    }
  }, []);

  const value = useMemo<GradeValue>(() => {
    const option = grade > 0 ? (gradeOption(grade) ?? null) : null;
    return {
      grade,
      setGrade,
      onboarded: onboarded || hydrated === false ? onboarded : onboarded,
      markOnboarded,
      option,
      label: option
        ? `${option.name} (${option.ageRange[0]}–${option.ageRange[1]}岁)`
        : "",
    };
  }, [grade, setGrade, onboarded, hydrated, markOnboarded]);

  return <GradeContext.Provider value={value}>{children}</GradeContext.Provider>;
}

/** 读年级上下文。 */
export function useGrade(): GradeValue {
  const context = useContext(GradeContext);
  const fallback = useMemo<GradeValue>(
    () => ({
      grade: 0,
      setGrade: () => {},
      onboarded: true,
      markOnboarded: () => {},
      option: null,
      label: "",
    }),
    [],
  );
  return context ?? fallback;
}
