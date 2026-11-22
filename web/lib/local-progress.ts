/**
 * 本地学情汇总
 * ============
 *
 * 纯静态模式（GitHub Pages）下没有后端——但学情中心**必须**显示
 * 真实数据，而不是报错页。
 *
 * 问题的根源
 * ----------
 *
 * 静态模式下 ``/api/learning/progress`` 这个路径在 GitHub Pages 上
 * 返回的是 **404 HTML 页面**（Pages 对不存在的路径会回一个
 * ``<!DOCTYPE html>...Error code: 404``）。前端拿它当 JSON 解析，
 * 解析失败；更糟的是有些地方直接把响应体塞进了界面——于是用户看到
 * 一整页 HTML 源码。
 *
 * 本模块的职责
 * ------------
 *
 * **只从 localStorage 汇总真实数据**，并且**保证输出是对象**，
 * 永远不会把 HTML 源码漏给界面。
 *
 * 真实数据从哪来
 * --------------
 *
 * 平台在静态模式下的所有用户数据本来就落在 localStorage 里：
 *
 * ============================  ==========================================
 * 键                              内容
 * ============================  ==========================================
 * ``dreamclass.progress.<id>``     观看 / 阅读进度（分集、章节）
 * ``dreamclass.notes.<id>``        笔记
 * ``dreamclass.session.<id>``      对话记录（提问轮数由此而来）
 * ``dreamclass.quiz.<id>``         随堂测验结果
 * ``dreamclass.plans.<id>``        学习计划
 * ``dreamclass.certificates``      结业证书
 * ============================  ==========================================
 *
 * 所以「学情中心在静态模式下没有数据」是个**假命题**——数据一直都在，
 * 只是没人去汇总。
 */

/**
 * 一条学习记录（按资源 / 分集记账）。
 *
 * 与后端 ``hub_progress_service`` 的记账口径保持一致。
 */
export interface LocalResourceProgress {
  /** 资源 id。 */
  resource_id: string;
  /** 资源标题（用于展示）。 */
  title: string;
  /** 是否打开过。 */
  opened: boolean;
  /** 是否看完过（播放过半或点过「学完本集」）。 */
  seen: boolean;
  /** 上次播放位置（秒）。 */
  last_position: number;
  /** 资源总时长（秒）。 */
  duration: number;
  /** 累计观看时长（秒）。 */
  dwell_seconds: number;
  /** 最近一次观看时间（Unix 秒）。 */
  last_active_at: number;
}

/** 一门课的本地进度。 */
export interface LocalCourseProgress {
  course_id: string;
  title: string;
  /** 已完成分集数。 */
  visited_pages: number;
  /** 总分集数。 */
  total_pages: number;
  /** 覆盖率（0–1）。 */
  coverage: number;
  note_count: number;
  ask_count: number;
  quiz_count: number;
  quiz_answered: number;
  quiz_accuracy: number | null;
  /** `待学习` / `学习中` / `薄弱需巩固` / `已掌握`。 */
  status: string;
  last_active_at: number;
  last_page_id: string;
  last_page_title: string;
  /** 章节掌握度。 */
  chapters: Array<{
    title: string;
    total_pages: number;
    visited_pages: number;
    coverage: number;
    notes: number;
    quiz_accuracy: number | null;
    status: string;
  }>;
  /** 资源级明细。 */
  resources: LocalResourceProgress[];
}

/** 汇总结果。 */
export interface LocalProgressResult {
  courses: LocalCourseProgress[];
  summary: {
    course_count: number;
    learned_count: number;
    average_coverage: number;
    total_notes: number;
    total_asks: number;
    total_plans: number;
    mastered_count: number;
    weak_count: number;
    pending_count: number;
  };
}

/** localStorage 的键前缀。 */
const PREFIX = "dreamclass";

/**
 * 会话记录的前缀。
 *
 * ⚠️ 注意：会话记录**不在** ``dreamclass`` 命名空间下——它在
 * ``seek.chat.session.<courseId>``（见 ``ChatContext.sessionKey``）。
 * 之前学情中心统计「提问次数」用的是 ``dreamclass.session.*``，
 * 那个键从来没人写过，所以数字永远是 0。
 */
const SESSION_PREFIX = "seek.chat.session.";

/** 观看进度的键（静态模式下由 ``hub-watch.ts`` 写入）。 */
const HUB_WATCH_KEY = `${PREFIX}.progress.global`;

/** 安全地读 localStorage（隐私模式下访问会抛异常）。 */
function safeStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__seek_local_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读一个 JSON 值，失败返回 `null`。 */
function readJson<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? null : (parsed as T);
  } catch {
    return null;
  }
}

/** 列出所有以 `prefix` 开头的键。 */
function listKeys(store: Storage, prefix: string): string[] {
  const out: string[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && key.startsWith(prefix)) out.push(key);
    }
  } catch {
    /* 忽略 */
  }
  return out;
}

/**
 * 课程标题。
 *
 * localStorage 的键名只有 id，不含标题——所以标题来自两处：
 *
 * 1. **观看记录自带标题**（``hub-watch.ts`` 写的时候存了 ``title``）；
 * 2. **静态课程目录**——中台的数据文件里有全部 147 门课的标题。
 *
 * 两者都拿不到就用 id 兜底，绝不显示空白。
 */
function resolveTitle(
  store: Storage,
  courseId: string,
  fallbackTitle?: string,
): string {
  if (courseId === "global_resource_hub") return "全球顶尖公开课精选";

  if (fallbackTitle && fallbackTitle.trim()) return fallbackTitle.trim();

  // 观看记录里通常带标题。
  const watch = readJson<Record<string, any>>(store, HUB_WATCH_KEY);
  if (watch) {
    for (const record of Object.values(watch)) {
      const title = String(record?.title ?? "").trim();
      if (title) return title;
    }
  }

  return courseId;
}

/** 计算状态标签。 */
function deriveStatus(
  coverage: number,
  quizAccuracy: number | null,
  visited: number,
): string {
  if (visited === 0) return "待学习";
  if (coverage >= 0.999) {
    if (quizAccuracy !== null && quizAccuracy < 0.6) return "薄弱需巩固";
    return "已掌握";
  }
  if (coverage < 0.34) return "薄弱需巩固";
  return "学习中";
}

/**
 * 从 localStorage 汇总真实学情。
 *
 * @param courseIds 需要统计的课程 id。传空数组表示**自动发现**——
 *        扫描所有相关的键，把出现过的课程都收进来。
 * @param titleMap 课程 id → 标题。调用方手里有课程目录时传进来，
 *        显示的就是**真实课程名**而不是 id。
 */
export function aggregateLocalProgress(
  courseIds: string[] = [],
  titleMap: Record<string, string> = {},
): LocalProgressResult {
  const store = safeStore();
  const empty: LocalProgressResult = {
    courses: [],
    summary: {
      course_count: 0,
      learned_count: 0,
      average_coverage: 0,
      total_notes: 0,
      total_asks: 0,
      total_plans: 0,
      mastered_count: 0,
      weak_count: 0,
      pending_count: 0,
    },
  };
  if (!store) return empty;

  // ── 1. 决定要统计哪些课程 ──
  const discovered = new Set<string>();
  for (const prefix of [
    `${PREFIX}.notes.`,
    `${PREFIX}.quiz.`,
    `${PREFIX}.plans.`,
  ]) {
    for (const key of listKeys(store, prefix)) {
      discovered.add(key.slice(prefix.length));
    }
  }
  for (const key of listKeys(store, SESSION_PREFIX)) {
    const rest = key.slice(SESSION_PREFIX.length);
    // ``seek.chat.session.<courseId>`` —— 键名后缀就是课程 id。
    if (rest) discovered.add(rest);
  }
  for (const id of courseIds) discovered.add(id);

  const courses: LocalCourseProgress[] = [];
  let totalNotes = 0;
  let totalAsks = 0;
  let totalPlans = 0;

  // ── 2. 中台的观看记录（跨课程共享一份）──
  //
  // 公开课的观看进度全部记在 ``dreamclass.progress.global`` 里——
  // 一份 ``Record<resourceId, WatchRecord>``。它天然属于
  // ``global_resource_hub`` 这门课。
  const hubWatch = readJson<Record<string, any>>(store, HUB_WATCH_KEY) ?? {};

  for (const courseId of discovered) {
    if (!courseId) continue;

    // ── 3. 资源级进度 ──
    const resources: LocalResourceProgress[] = [];

    if (courseId === "global_resource_hub") {
      for (const [resourceId, record] of Object.entries(hubWatch)) {
        const position = Number(record?.position ?? 0) || 0;
        const duration = Number(record?.duration ?? 0) || 0;
        // 看过 = 有观看记录，或已播到 90% 以上。
        const ratio = duration > 0 ? position / duration : 0;
        resources.push({
          resource_id: resourceId,
          title: String(record?.title ?? ""),
          opened: true,
          seen: ratio >= 0.9,
          last_position: position,
          duration,
          dwell_seconds: Number(record?.delta ?? 0) || 0,
          last_active_at: Number(record?.updated_at ?? 0) || 0,
        });
      }
    }

    const visited = resources.filter((item) => item.opened || item.seen).length;
    const total = resources.length;
    const coverage = total > 0 ? visited / total : 0;

    // ── 4. 笔记 ──
    const notes = readJson<any[]>(store, `${PREFIX}.notes.${courseId}`);
    const noteCount = Array.isArray(notes) ? notes.length : 0;
    totalNotes += noteCount;

    // ── 5. 提问轮数 ──
    //
    // 会话记录里 ``role === "user"`` 的消息就是用户提问。
    let askCount = 0;
    const messages = readJson<any[]>(
      store,
      `${SESSION_PREFIX}${courseId}`,
    );
    if (Array.isArray(messages)) {
      askCount = messages.filter((message: any) => message?.role === "user")
        .length;
    }
    totalAsks += askCount;

    // ── 6. 测验 ──
    const quizzes = readJson<any>(store, `${PREFIX}.quiz.${courseId}`);
    const quizList: any[] = Array.isArray(quizzes)
      ? quizzes
      : Array.isArray(quizzes?.results)
        ? quizzes.results
        : [];
    let quizAnswered = 0;
    let quizCorrect = 0;
    for (const quiz of quizList) {
      const answered = Number(quiz?.answered ?? quiz?.question_count ?? 0) || 0;
      const correct = Number(quiz?.correct ?? quiz?.correct_count ?? 0) || 0;
      quizAnswered += answered;
      quizCorrect += correct;
    }
    const quizAccuracy =
      quizAnswered > 0 ? quizCorrect / quizAnswered : null;

    // ── 7. 计划 ──
    const plans = readJson<any[]>(store, `${PREFIX}.plans.${courseId}`);
    const planCount = Array.isArray(plans) ? plans.length : 0;
    totalPlans += planCount;

    // ── 8. 最近学习 ──
    let lastActiveAt = 0;
    for (const resource of resources) {
      if (resource.last_active_at > lastActiveAt) {
        lastActiveAt = resource.last_active_at;
      }
    }
    const lastResource = resources.find((item) => item.opened || item.seen);

    // ── 9. 章节 ──
    //
    // 静态模式下没有「课程大纲」结构（那是后端从课程正文解析出来的）。
    // 公开课中台的资源**自带学科分类**——按学科分组就是最自然的章节
    // 划分，而且这个划分本身就是真实存在于数据里的。
    const chapters = buildChapters(resources, titleMap);

    const status = deriveStatus(coverage, quizAccuracy, visited);

    courses.push({
      course_id: courseId,
      title: resolveTitle(store, courseId, titleMap[courseId]),
      visited_pages: visited,
      total_pages: total,
      coverage,
      note_count: noteCount,
      ask_count: askCount,
      quiz_count: quizList.length,
      quiz_answered: quizAnswered,
      quiz_accuracy: quizAccuracy,
      status,
      last_active_at: lastActiveAt,
      last_page_id: String(lastResource?.resource_id ?? ""),
      last_page_title: String(lastResource?.title ?? ""),
      chapters,
      resources,
    });
  }

  // ── 10. 汇总数字 ──
  const learned = courses.filter((item) => item.visited_pages > 0);
  const averageCoverage =
    courses.length > 0
      ? courses.reduce((sum, item) => sum + item.coverage, 0) / courses.length
      : 0;

  return {
    courses: courses.sort(
      (a, b) =>
        b.last_active_at - a.last_active_at || b.visited_pages - a.visited_pages,
    ),
    summary: {
      course_count: courses.length,
      learned_count: learned.length,
      average_coverage: averageCoverage,
      total_notes: totalNotes,
      total_asks: totalAsks,
      total_plans: totalPlans,
      mastered_count: courses.filter((item) => item.status === "已掌握").length,
      weak_count: courses.filter((item) => item.status === "薄弱需巩固").length,
      pending_count: courses.filter((item) => item.status === "待学习").length,
    },
  };
}

/**
 * 按学科分组的章节掌握度。
 *
 * 中台的 147 门课分在 5 个学科下（计算机 / 哲学 / 经济 / …）。
 * 「我在哪一科学得最多」是学情中心真正想回答的问题——
 * 而这个划分**本来就在数据里**，不需要编。
 */
function buildChapters(
  resources: LocalResourceProgress[],
  titleMap: Record<string, string>,
): LocalCourseProgress["chapters"] {
  if (resources.length === 0) return [];

  // 从标题里拿不到学科时，退回到「全部资源」一个章节。
  const groups = new Map<string, LocalResourceProgress[]>();
  for (const resource of resources) {
    const chapter = chapterOfResource(resource, titleMap);
    const list = groups.get(chapter) ?? [];
    list.push(resource);
    groups.set(chapter, list);
  }

  return Array.from(groups.entries()).map(([title, list]) => {
    const visited = list.filter((item) => item.opened || item.seen).length;
    const coverage = list.length > 0 ? visited / list.length : 0;
    return {
      title,
      total_pages: list.length,
      visited_pages: visited,
      coverage,
      notes: 0,
      quiz_accuracy: null,
      status: deriveStatus(coverage, null, visited),
    };
  });
}

/**
 * 一条资源属于哪个学科。
 *
 * 中台的资源 id 前缀就是分类 id（``res_cs50`` / ``res_yale_death_intro``
 * 之类），但更可靠的是**分类映射表**——调用方从目录里取。
 */
function chapterOfResource(
  resource: LocalResourceProgress,
  titleMap: Record<string, string>,
): string {
  const mapped = titleMap[`chapter:${resource.resource_id}`];
  if (mapped) return mapped;
  return "全部资源";
}

/**
 * 从 localStorage 读出已获证书数。
 *
 * 与 :func:`aggregateLocalProgress` 分开——证书是**结果**，进度是
 * **过程**。分开读，界面才能分别呈现。
 */
export function countLocalCertificates(): number {
  const store = safeStore();
  if (!store) return 0;
  const list = readJson<any[]>(store, `${PREFIX}.certificates`);
  if (!Array.isArray(list)) return 0;
  return list.filter((item: any) => item?.status !== "revoked").length;
}
