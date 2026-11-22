/**
 * K12 学情汇总
 * ============
 *
 * 学情中心的**真实数据源**——从 localStorage 汇总 K12 学习情况。
 *
 * 与 :mod:`local-progress` 的区别
 * ------------------------------
 *
 * ``local-progress`` 面向**中台资源**（按 ``resource_id`` 记账）。
 * 而 K12 的 24 套系列需要：
 *
 * * 按**年级 × 学科**组织（不是按资源 id）；
 * * 按**课时**显示进度（177 讲里的第 3 讲）；
 * * 显示**诊断掌握度**与**随堂测验正确率**；
 * * 显示已获 **K12 结业证书**。
 *
 * 数据全部来自 localStorage——静态模式下**没有后端**，
 * 所以汇总必须在这里完成。
 */

import { readWatchRecords } from "@/lib/episode-records";
import { readDiagnostic } from "@/lib/diagnostic-profile";
import { fetchK12Index } from "@/lib/k12-client";
import type { K12IndexEntry } from "@/lib/k12-api";

/** 一套系列的学情。 */
export interface K12CourseProgress {
  /** 系列 id。 */
  id: string;
  /** 课程名。 */
  title: string;
  /** 年级。 */
  grade: number;
  /** 学科。 */
  subject: "chinese" | "math";
  /** 学段。 */
  stage: "primary" | "junior" | "senior";
  /** 已完成课时数。 */
  done: number;
  /** 总课时数。 */
  total: number;
  /** 覆盖率（0–1）。 */
  coverage: number;
  /** 最近一次学习时间（Unix 毫秒）。 */
  lastActiveAt: number;
  /** 已诊断的集数。 */
  diagnosed: number;
  /** 诊断平均掌握层级分（0–2，越高越强）。 */
  masteryScore: number;
  /** 随堂测验平均正确率（0–1）；没有测验时为 ``null``。 */
  quizAccuracy: number | null;
  /** 笔记条数。 */
  notes: number;
  /** 提问次数。 */
  asks: number;
  /** 状态。 */
  status: "待学习" | "学习中" | "薄弱需巩固" | "已掌握";
}

/** 汇总结果。 */
export interface K12ProgressSummary {
  courses: K12CourseProgress[];
  totals: {
    /** 学过的年级数。 */
    gradesLearned: number;
    /** 完成课时总数。 */
    lessonsDone: number;
    /** 全部课时总数。 */
    lessonsTotal: number;
    /** 平均掌握度（0–1）。 */
    averageMastery: number;
    /** 笔记总数。 */
    notes: number;
    /** 提问总数。 */
    asks: number;
    /** 已获证书数。 */
    certificates: number;
    /** 测验平均正确率。 */
    quizAccuracy: number | null;
  };
}

/** localStorage 的键。 */
const PREFIX = "dreamclass";

/** 安全地拿到 localStorage。 */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__seek_k12_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读一个 JSON 数组。 */
function readArray<T>(key: string): T[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 掌握层级 → 分数（0–2）。 */
function masteryToScore(mastery: string): number {
  if (mastery === "已掌握基础想看深层推导") return 2;
  if (mastery === "听过概念但说不清") return 1;
  return 0;
}

/** 状态判定。 */
function deriveStatus(
  done: number,
  total: number,
  masteryScore: number,
  diagnosed: number,
): K12CourseProgress["status"] {
  if (done === 0) return "待学习";
  if (total > 0 && done >= total) return "已掌握";
  if (diagnosed > 0 && masteryScore < 1) return "薄弱需巩固";
  if (done / Math.max(1, total) < 0.34) return "薄弱需巩固";
  return "学习中";
}

/**
 * 汇总 K12 学情。
 *
 * @param entries  索引里的系列条目（决定「哪些课应该出现」）
 */
export function aggregateK12Progress(
  entries: K12IndexEntry[],
): K12ProgressSummary {
  const watch = readWatchRecords();
  const s = store();

  // ── 测验结果 ──
  const quizzes = readArray<any>(`${PREFIX}.quiz.k12`);
  const quizList: any[] = Array.isArray(quizzes) ? quizzes : [];

  // ── 笔记 ──
  const notes = readArray<any>(`${PREFIX}.notes.k12`);

  // ── 提问 ──
  const messages = readArray<any>("seek.chat.session.k12");
  const asks = messages.filter((message: any) => message?.role === "user").length;

  const courses: K12CourseProgress[] = [];

  for (const entry of entries) {
    const record = watch[entry.id];
    const episodes = record?.episodes ?? {};
    const episodeIds = Object.keys(episodes);

    const done = episodeIds.filter(
      (epId) => episodes[epId]?.completed,
    ).length;

    // 最近学习时间。
    let lastActiveAt = 0;
    for (const epId of episodeIds) {
      const at = episodes[epId]?.updated_at ?? 0;
      if (at > lastActiveAt) lastActiveAt = at;
    }

    // 诊断。
    let diagnosed = 0;
    let masterySum = 0;
    for (const epId of episodeIds) {
      const diag = readDiagnostic(entry.id, epId);
      if (!diag) continue;
      diagnosed += 1;
      masterySum += masteryToScore(diag.mastery);
    }
    const masteryScore =
      diagnosed > 0 ? masterySum / diagnosed : 0;

    // 测验正确率。
    const courseQuizzes = quizList.filter(
      (quiz: any) => quiz?.courseId === entry.id || quiz?.resourceId === entry.id,
    );
    let answered = 0;
    let correct = 0;
    for (const quiz of courseQuizzes) {
      answered += Number(quiz?.answered ?? quiz?.question_count ?? 0) || 0;
      correct += Number(quiz?.correct ?? quiz?.correct_count ?? 0) || 0;
    }
    const quizAccuracy = answered > 0 ? correct / answered : null;

    // 笔记。
    const noteCount = notes.filter(
      (note: any) => note?.courseId === entry.id || note?.resourceId === entry.id,
    ).length;

    courses.push({
      id: entry.id,
      title: entry.title,
      grade: entry.grade,
      subject: entry.subject,
      stage: entry.stage,
      done,
      total: entry.episodeCount,
      coverage: entry.episodeCount > 0 ? done / entry.episodeCount : 0,
      lastActiveAt,
      diagnosed,
      masteryScore,
      quizAccuracy,
      notes: noteCount,
      asks: 0,
      status: deriveStatus(done, entry.episodeCount, masteryScore, diagnosed),
    });
  }

  // ── 汇总 ──
  const learned = courses.filter((item) => item.done > 0);
  const gradesLearned = new Set(learned.map((item) => item.grade)).size;

  const withMastery = courses.filter((item) => item.diagnosed > 0);
  const averageMastery =
    withMastery.length > 0
      ? withMastery.reduce((sum, item) => sum + item.masteryScore, 0) /
        (withMastery.length * 2)
      : 0;

  const quizzesWithAnswers = courses.filter(
    (item) => item.quizAccuracy !== null,
  );
  const quizAccuracy =
    quizzesWithAnswers.length > 0
      ? quizzesWithAnswers.reduce(
          (sum, item) => sum + (item.quizAccuracy ?? 0),
          0,
        ) / quizzesWithAnswers.length
      : null;

  return {
    courses: courses.sort(
      (a, b) => b.lastActiveAt - a.lastActiveAt || a.grade - b.grade,
    ),
    totals: {
      gradesLearned,
      lessonsDone: courses.reduce((sum, item) => sum + item.done, 0),
      lessonsTotal: courses.reduce((sum, item) => sum + item.total, 0),
      averageMastery,
      notes: courses.reduce((sum, item) => sum + item.notes, 0),
      asks,
      certificates: readCertificateCount(),
      quizAccuracy,
    },
  };
}

/** 已获 K12 证书数。 */
export function readCertificateCount(): number {
  const list = readArray<any>(`${PREFIX}.certificates`);
  return list.filter((item: any) => item?.status !== "revoked").length;
}

/**
 * 便捷入口——读索引 + 汇总。
 */
export async function fetchK12Progress(): Promise<K12ProgressSummary> {
  const index = await fetchK12Index();
  return aggregateK12Progress(index?.series ?? []);
}
