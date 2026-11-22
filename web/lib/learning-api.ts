import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
  staticFetch,
} from "@/shared/api/client";
import { readLocal, writeLocal, StorageKeys } from "@/lib/local-store";
import { aggregateLocalProgress } from "@/lib/local-progress";
import type { ResourceProgress } from "@/lib/courses-api";

/**
 * 学习状态的前端数据客户端。
 *
 * 对应后端 `app/routers/learning.py` 与 `app/routers/insight.py`：
 *
 * - 留存文档（笔记）——AI 与用户共同维护的课程笔记；
 * - 学习计划——AI 制定、用户勾选，双向同步；
 * - 测验记录——题卡与批改解析；
 * - 宏观学习向导（AI 指导二）——章级学习策略与建议问题。
 */

/** 一条留存文档。 */
export interface LearningNote {
  id: string;
  /** 被划线的原文。 */
  quote: string;
  /** 旁注。 */
  note: string;
  /** 定位到哪一页。 */
  page_id: string;
  /** 定位到哪个内容块。 */
  block_id: string;
  /** `user` 或 `ai`——谁写的。 */
  origin: "user" | "ai";
  /** 划线形状：`highlight`（荧光）/ `underline`（直线）/ `wavy`（波浪）。 */
  style?: string;
  /** 莫兰迪配色 id：`amber` / `haze` / `bean` / `rose` / `lilac`。 */
  color?: string;
  created_at: number;
  updated_at: number;
}

/** 一条学习计划。 */
export interface StudyPlan {
  id: string;
  title: string;
  detail: string;
  course_id: string;
  /** 目标时间。 */
  due: string;
  /** 日历粒度：`year` / `month` / `day` / `slot`。 */
  scope?: string;
  /** 日历定位起点（ISO 字符串）。 */
  start_at?: string;
  /** 日历定位终点（仅 `slot` 用）。 */
  end_at?: string;
  /** 拆解出来的具体步骤。 */
  items: string[];
  /** 已完成的步骤数。 */
  done: number;
  /** 步骤总数。 */
  total: number;
  /** 整条计划是否完成。 */
  completed: boolean;
  /** `user` 或 `ai`。 */
  origin: "user" | "ai";
  created_at: number;
  updated_at: number;
}

/** 测验题。 */
export interface QuizQuestion {
  question: string;
  options: string[];
  /** 正确选项下标（从 0 开始）。 */
  answer: number;
  explanation: string;
}

/** 一次测验。 */
export interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  created_at: number;
}

/** 宏观学习向导的一条建议问题。 */
export interface AdvisorQuestion {
  id: string;
  title: string;
  /** 点击后原样填入主 AI 输入框。 */
  prompt: string;
  hint: string;
}

/** 宏观学习向导的一条策略要点。 */
export interface AdvisorTactic {
  id: string;
  /** 给人看的简短要点。 */
  text: string;
  /** 点击后填入主 AI 输入框的完整高阶提示词。 */
  prompt: string;
}

/** 宏观学习向导的完整输出。 */
export interface AdvisorResult {
  /** 一句话的章级学习策略。 */
  strategy: string;
  /** 策略展开成的完整提示词——点击策略时填入主 AI 输入框。 */
  strategy_prompt: string;
  /** 学习方法要点。每条都可点击。 */
  tactics: AdvisorTactic[];
  /** 高质量问题——点击即填入主 AI 输入框。 */
  questions: AdvisorQuestion[];
  from_model: boolean;
  warnings: string[];
}

function query(courseId: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (courseId) params.set("course_id", courseId);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

// ── 留存文档 ───────────────────────────────────────────────────────────

export async function fetchNotes(courseId: string): Promise<LearningNote[]> {
  // ── 静态模式 ──
  //
  // 笔记只存在浏览器 localStorage 里。刷新不丢、关掉浏览器也在
  // （只要没清缓存）。
  if (await isStaticRuntime()) {
    return readLocal<LearningNote[]>(StorageKeys.notes(courseId), []);
  }

  const response = await apiFetch(
    apiUrl(`/api/learning/notes${query(courseId)}`),
    { cache: "no-store" },
  );
  const data = await asJsonOrThrow(response);
  return Array.isArray(data?.notes) ? data.notes : [];
}

export async function saveNote(
  courseId: string,
  payload: Partial<LearningNote>,
): Promise<LearningNote> {
  // ── 静态模式 ──
  //
  // 存进 localStorage。带时间戳——笔记必须知道「什么时候记的」。
  if (await isStaticRuntime()) {
    const now = Date.now();
    const notes = readLocal<LearningNote[]>(StorageKeys.notes(courseId), []);
    const incomingId = payload.id ?? `note-${now}`;
    const existing = notes.find((note) => note.id === incomingId);

    const note: LearningNote = {
      id: incomingId,
      quote: payload.quote ?? existing?.quote ?? "",
      note: payload.note ?? existing?.note ?? "",
      page_id: payload.page_id ?? existing?.page_id ?? "",
      block_id: payload.block_id ?? existing?.block_id ?? "",
      origin: payload.origin ?? existing?.origin ?? "user",
      style: payload.style ?? existing?.style,
      color: payload.color ?? existing?.color,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    const next = existing
      ? notes.map((item) => (item.id === note.id ? note : item))
      : [...notes, note];
    writeLocal(StorageKeys.notes(courseId), next);
    return note;
  }

  const response = await apiFetch(
    apiUrl(`/api/learning/notes${query(courseId)}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await asJsonOrThrow(response);
  return data?.note as LearningNote;
}

export async function deleteNote(
  courseId: string,
  noteId: string,
): Promise<LearningNote[]> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const notes = readLocal<LearningNote[]>(StorageKeys.notes(courseId), []);
    const next = notes.filter((note) => note.id !== noteId);
    writeLocal(StorageKeys.notes(courseId), next);
    return next;
  }

  const response = await apiFetch(
    apiUrl(`/api/learning/notes/${encodeURIComponent(noteId)}${query(courseId)}`),
    { method: "DELETE" },
  );
  const data = await asJsonOrThrow(response);
  return Array.isArray(data?.notes) ? data.notes : [];
}

// ── 学习计划 ───────────────────────────────────────────────────────────

export async function fetchPlans(courseId?: string): Promise<StudyPlan[]> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const key = courseId || "global";
    return readLocal<StudyPlan[]>(StorageKeys.plans(key), []);
  }

  const response = await apiFetch(
    apiUrl(`/api/learning/plans${query(courseId ?? "")}`),
    { cache: "no-store" },
  );
  const data = await asJsonOrThrow(response);
  return Array.isArray(data?.plans) ? data.plans : [];
}

export async function savePlan(
  courseId: string,
  payload: Partial<StudyPlan>,
): Promise<StudyPlan> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const key = courseId || "global";
    const plans = readLocal<StudyPlan[]>(StorageKeys.plans(key), []);
    const now = Date.now();
    const id = payload.id ?? `plan-${now}`;
    const existing = plans.find((plan) => plan.id === id);

    const plan = {
      ...existing,
      ...payload,
      id,
      updated_at: now,
    } as StudyPlan;

    const next = existing
      ? plans.map((item) => (item.id === id ? plan : item))
      : [...plans, plan];
    writeLocal(StorageKeys.plans(key), next);
    return plan;
  }

  const response = await apiFetch(
    apiUrl(`/api/learning/plans${query(courseId)}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await asJsonOrThrow(response);
  return data?.plan as StudyPlan;
}

export async function setPlanProgress(
  courseId: string,
  planId: string,
  done: number,
): Promise<StudyPlan> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const key = courseId || "global";
    const plans = readLocal<StudyPlan[]>(StorageKeys.plans(key), []);
    const plan = plans.find((item) => item.id === planId);
    if (!plan) throw new Error("计划不存在。");
    plan.done = done;
    plan.updated_at = Date.now();
    writeLocal(StorageKeys.plans(key), plans);
    return plan;
  }

  const response = await apiFetch(
    apiUrl(
      `/api/learning/plans/${encodeURIComponent(planId)}/progress${query(courseId)}`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    },
  );
  const data = await asJsonOrThrow(response);
  return data?.plan as StudyPlan;
}

export async function deletePlan(
  courseId: string,
  planId: string,
): Promise<StudyPlan[]> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const key = courseId || "global";
    const plans = readLocal<StudyPlan[]>(StorageKeys.plans(key), []);
    const next = plans.filter((plan) => plan.id !== planId);
    writeLocal(StorageKeys.plans(key), next);
    return next;
  }

  const response = await apiFetch(
    apiUrl(`/api/learning/plans/${encodeURIComponent(planId)}${query(courseId)}`),
    { method: "DELETE" },
  );
  const data = await asJsonOrThrow(response);
  return Array.isArray(data?.plans) ? data.plans : [];
}

// ── 测验 ───────────────────────────────────────────────────────────────

export async function fetchQuizzes(courseId: string): Promise<Quiz[]> {
  // ── 静态模式 ──
  //
  // 测验题**随课程 JSON 一起发布**——它们本来就是装配好的静态内容。
  // 作答记录另存 localStorage。
  if (await isStaticRuntime()) {
    const course = await staticFetch<any>(
      `/data/courses/${encodeURIComponent(courseId)}.json`,
    );
    const quizzes = course?.quizzes ?? course?.pages?.[0]?.quizzes ?? [];
    const answers = readLocal<Record<string, unknown>>(
      StorageKeys.quiz(courseId),
      {},
    );
    // 把已答的记录贴回题目上。
    return (Array.isArray(quizzes) ? quizzes : []).map((quiz: any) => ({
      ...quiz,
      answers: answers[quiz.id] ?? quiz.answers,
    }));
  }

  const response = await apiFetch(
    apiUrl(`/api/learning/quizzes${query(courseId)}`),
    { cache: "no-store" },
  );
  const data = await asJsonOrThrow(response);
  return Array.isArray(data?.quizzes) ? data.quizzes : [];
}

/**
 * 提交一次测验的作答。
 *
 * 后端把选了哪个选项写回 ``quizzes.json``，学情中心才能算出**真实**
 * 的测验正确率——否则它永远是「—」。
 */
export async function submitQuizAnswers(
  courseId: string,
  quizId: string,
  answers: Record<number, number>,
): Promise<boolean> {
  if (!quizId) return false;
  const payload: Record<string, number> = {};
  for (const [index, choice] of Object.entries(answers)) {
    payload[index] = choice;
  }

  // ── 静态模式 ──
  //
  // 作答记录写 localStorage，学情中心据此算正确率。
  if (await isStaticRuntime()) {
    const all = readLocal<Record<string, unknown>>(
      StorageKeys.quiz(courseId),
      {},
    );
    all[quizId] = payload;
    return writeLocal(StorageKeys.quiz(courseId), all);
  }

  try {
    const response = await apiFetch(
      apiUrl(
        `/api/learning/quizzes/${encodeURIComponent(quizId)}/answer${query(courseId)}`,
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      },
    );
    return response.ok;
  } catch {
    // 提交失败不该打断答题体验——用户已经看到批改了。
    return false;
  }
}

// ── 宏观学习向导 ───────────────────────────────────────────────────────

export async function fetchAdvisor(params: {
  course_id?: string;
  page_id?: string;
}): Promise<AdvisorResult> {
  const response = await apiFetch(apiUrl("/api/insight/advisor"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await asJsonOrThrow(response);
  return {
    strategy: String(data?.strategy ?? ""),
    strategy_prompt: String(data?.strategy_prompt ?? ""),
    tactics: Array.isArray(data?.tactics)
      ? data.tactics
          .map((item: unknown, index: number) => {
            // 兼容两种形状：对象数组，或（老数据）字符串数组。
            if (item && typeof item === "object") {
              const record = item as Record<string, unknown>;
              const text = String(record.text ?? "");
              return {
                id: String(record.id ?? `tac_${index}`),
                text,
                prompt: String(record.prompt ?? text),
              };
            }
            const text = String(item ?? "");
            return { id: `tac_${index}`, text, prompt: text };
          })
          .filter((item: AdvisorTactic) => item.text.trim())
      : [],
    questions: Array.isArray(data?.questions) ? data.questions : [],
    from_model: Boolean(data?.from_model),
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
  };
}

// ── 学情聚合 ───────────────────────────────────────────────────────────

/** 一门课里的某个章节的掌握情况。 */
export interface ChapterProgress {
  title: string;
  total_pages: number;
  visited_pages: number;
  /** 阅读覆盖率（0–1）。 */
  coverage: number;
  notes: number;
  /** 这一章的测验正确率（0–1）；没做过为 `null`。 */
  quiz_accuracy: number | null;
  quiz_answered: number;
  /** `待学习` / `学习中` / `薄弱需巩固` / `已掌握`。 */
  status: string;
}

/** 课程进度卡片下挂着的学习计划。 */
export interface LinkedPlan {
  id: string;
  title: string;
  due: string;
  scope: string;
  start_at: string;
  done: number;
  total: number;
  completed: boolean;
}

/** 一门课程的完整学情。 */
export interface CourseProgress {
  course_id: string;
  title: string;
  author: string;
  description: string;
  difficulty: string;
  tags: string[];
  total_pages: number;
  total_chapters: number;
  visited_pages: number;
  /** 阅读覆盖率（0–1）。 */
  coverage: number;
  note_count: number;
  /** 向 AI 提问的轮数。 */
  ask_count: number;
  quiz_count: number;
  quiz_answered: number;
  /** 测验正确率（0–1）；没做过测验时为 `null`。 */
  quiz_accuracy: number | null;
  /** `待学习` / `学习中` / `薄弱需巩固` / `已掌握`。 */
  status: string;
  /** 最近一次学习的 Unix 时间戳；没学过则为 0。 */
  last_active_at: number;
  /** 上次读到的那一页——「继续学习」的跳转锚点。 */
  last_page_id: string;
  last_page_title: string;
  last_chapter_title: string;
  chapters: ChapterProgress[];
  plans: LinkedPlan[];
  /** 这门课是不是资源枢纽型。 */
  is_hub?: boolean;
  /** 资源总数（仅资源枢纽型课程）。 */
  total_resources?: number;
  /** 已看过的资源数（仅资源枢纽型课程）。 */
  seen_resources?: number;
  /** 资源级完成度（0–1，仅资源枢纽型课程）。 */
  resource_coverage?: number;
  /**
   * 每条资源的学习状态。
   *
   * 资源枢纽型课程里，一个节点下面挂着多条外链——「节点学过了」
   * 是误导，用户可能只看了其中一条。所以每条资源单独记账。
   */
  resources?: ResourceProgress[];
}

/** 全部学情的汇总数字。 */
export interface ProgressSummary {
  course_count: number;
  learned_count: number;
  average_coverage: number;
  total_notes: number;
  total_asks: number;
  total_plans: number;
  mastered_count: number;
  weak_count: number;
  pending_count: number;
}

/**
 * 拉取学情大盘。
 *
 * 三条路，**永远不返回 HTML**：
 *
 * 1. **后端在线** —— 请求 ``/api/learning/progress``；
 * 2. **后端返回了 HTML**（静态站点上的 404 兜底页）—— 降级到
 *    :func:`aggregateLocalProgress` 从 localStorage 汇总；
 * 3. **后端连不上** —— 同样降级到 localStorage。
 *
 * 关键点：**静态模式下永远有数据可显示**。用户的学习记录一直存在
 * localStorage 里，只是以前没人去汇总它。
 */
export async function fetchProgress(
  courseId = "",
  titleMap: Record<string, string> = {},
): Promise<{ courses: CourseProgress[]; summary: ProgressSummary }> {
  // ── 静态模式：直接走 localStorage ──
  if (await isStaticRuntime()) {
    const local = aggregateLocalProgress(courseId ? [courseId] : [], titleMap);
    return {
      courses: local.courses as unknown as CourseProgress[],
      summary: local.summary as unknown as ProgressSummary,
    };
  }

  try {
    const response = await apiFetch(
      apiUrl(`/api/learning/progress${query(courseId)}`),
      { cache: "no-store" },
    );
    const data = await asJsonOrThrow(response);
    const courses = Array.isArray(data?.courses) ? data.courses : [];
    return {
      courses: courses as CourseProgress[],
      summary: (data?.summary ?? {}) as ProgressSummary,
    };
  } catch {
    // ── 降级：后端挂了 / 返回了 HTML ──
    //
    // 宁可显示本地汇总，也不要显示一整页 404 源码。
    const local = aggregateLocalProgress(courseId ? [courseId] : [], titleMap);
    return {
      courses: local.courses as unknown as CourseProgress[],
      summary: local.summary as unknown as ProgressSummary,
    };
  }
}

// ── 选区动作 ───────────────────────────────────────────────────────────

/** 选区工具条的动作。 */
export interface SelectionAction {
  id: string;
  label: string;
  prompt: string;
  /**
   * `true` 表示这个动作**不直接调用模型**——它把选中文本与结构化指令
   * 预填到主 AI 的输入框。
   */
  prefill?: boolean;
}

/** 需要预填到主 AI 输入框的动作 id。 */
export const PREFILL_ACTION_IDS = new Set(["mindmap", "connect"]);

/** 用浏览器原生语音合成的动作 id。 */
export const SPEECH_ACTION_ID = "recite";
