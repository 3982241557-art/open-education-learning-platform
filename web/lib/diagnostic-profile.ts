/**
 * 学习者画像
 * ==========
 *
 * 记录用户**每一集的诊断结果**——他在这集之前掌握到什么程度、
 * 哪些概念答错了。
 *
 * 这些数据有两个用途：
 *
 * 1. **课前诊断卡**——下次进同一集时，知道该不该再弹一次；
 * 2. **AI 助教的提示词**——静默拼进 system prompt，让助教按用户的
 *    真实水平讲解，而不是永远从最基础讲起。
 *
 * 关键设计
 * --------
 *
 * **画像只在本机**。它来自诊断题的真实作答，不是 AI 猜的。
 * 所以注入提示词时用的是「**基础薄弱**」这种**有依据**的判断，
 * 而不是「我认为你可能需要更多例子」这种空话。
 */

/** 掌握层级。 */
export type MasteryLevel =
  | "完全陌生"
  | "听过概念但说不清"
  | "已掌握基础想看深层推导";

/** 掌握层级 → 给助教看的简短标签。 */
export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  完全陌生: "零基础",
  听过概念但说不清: "基础薄弱",
  已掌握基础想看深层推导: "进阶深挖",
};

/** 一次诊断的完整结果。 */
export interface DiagnosticRecord {
  /** 资源 id。 */
  resourceId: string;
  /** 集 id。 */
  epId: string;
  /** 课程标题。 */
  courseTitle: string;
  /** 集标题。 */
  episodeTitle: string;
  /** 本集在系列里的序号（从 1 开始）。 */
  episodeIndex?: number;
  /** 判定出的掌握层级。 */
  mastery: MasteryLevel;
  /** 答错 / 存疑的具体概念。 */
  weakConcepts: string[];
  /** 答对的题数。 */
  correctCount: number;
  /** 总题数。 */
  totalCount: number;
  /** 是否是「跳过」而不是真答了。 */
  skipped: boolean;
  /**
   * 是否需要**中英双语辅助**。
   *
   * 触发条件：① 诊断显示基础薄弱；② 课程属于海外华人场景。
   * 助教据此在关键概念上补充英文对照。
   */
  needsBilingual?: boolean;
  /** 记录时间（Unix 毫秒）。 */
  at: number;
}

/** localStorage 的键。 */
const STORAGE_KEY = "dreamclass.diagnostics";

/** 安全地拿到 localStorage。 */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__seek_diag_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读出全部诊断记录。 */
export function readDiagnostics(): DiagnosticRecord[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 写回全部诊断记录。 */
function writeDiagnostics(records: DiagnosticRecord[]): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(records.slice(-60)));
  } catch {
    /* 配额满——忽略 */
  }
}

/**
 * 存一次诊断结果。
 *
 * 同一集重复诊断会**覆盖**旧的——用户重测了就该用新的。
 */
export function saveDiagnostic(record: DiagnosticRecord): void {
  const all = readDiagnostics().filter(
    (item) =>
      !(item.resourceId === record.resourceId && item.epId === record.epId),
  );
  all.push(record);
  writeDiagnostics(all);
}

/**
 * 读某一集的诊断结果。
 */
export function readDiagnostic(
  resourceId: string,
  epId: string,
): DiagnosticRecord | undefined {
  return readDiagnostics().find(
    (item) => item.resourceId === resourceId && item.epId === epId,
  );
}

/**
 * 某一集是否**已经诊断过**。
 *
 * 「跳过」也算诊断过——用户明确说了「按默认难度开始」，
 * 不该再弹一次烦他。
 */
export function hasDiagnostic(resourceId: string, epId: string): boolean {
  return Boolean(readDiagnostic(resourceId, epId));
}

/**
 * 拼装给 AI 助教的**学习者画像**提示词。
 *
 * 格式刻意模仿已有的「当前课程上下文」段落——
 * 助教看到的是一个**具体的人**，不是一个空白的对话。
 *
 * 例子：
 *
 * .. code-block:: text
 *
 *     [学习者画像] 当前正在学习《哈佛大学 CS50》第 3 讲（Lecture 2 - Arrays），
 *     课前诊断显示其掌握度为【基础薄弱】，对【数组】存在模糊，
 *     请优先用生活直觉与循序渐进的方式讲解，避免直接堆砌高阶公式。
 *
 * @param resourceId 当前资源
 * @param epId       当前集
 * @returns 提示词片段；没有诊断记录时返回空字符串
 */
export function buildLearnerProfilePrompt(
  resourceId: string,
  epId: string,
): string {
  const record = readDiagnostic(resourceId, epId);
  if (!record) return "";

  const lines: string[] = [];
  const lesson = record.episodeTitle
    ? `第 ${record.episodeIndex ?? ""} 讲`.trim()
    : "当前这一讲";

  lines.push(
    `[学习者画像] 当前正在学习《${record.courseTitle}》${lesson}` +
      (record.episodeTitle && !record.episodeTitle.startsWith("第")
        ? `（${record.episodeTitle}）`
        : "") +
      `，课前诊断显示其掌握度为【${MASTERY_LABEL[record.mastery]}】`,
  );

  if (record.weakConcepts.length > 0) {
    lines.push(
      `对【${record.weakConcepts.join("】【")}】存在模糊，` +
        `请优先用生活直觉与循序渐进的方式讲解，避免直接堆砌高阶公式。`,
    );
  } else if (record.mastery === "已掌握基础想看深层推导") {
    lines.push(
      `已掌握基础，请直接切入深层推导与边界条件，不要重复讲入门概念。`,
    );
  } else {
    lines.push(`请从直觉出发建立概念，讲清每一步为什么这么做。`);
  }

  // ── 双语辅助 ──
  //
  // 海外华人学生最常卡住的地方不是「中文难懂」，而是**术语**——
  // 国内教材里的词（"比"、"倍数"、"文言实词"）在英文里没有对应物。
  // 所以这里明确要求助教在关键概念上补充中英对照。
  if (record.needsBilingual) {
    lines.push(
      `学习者可能需要中英双语辅助：在核心概念、术语与关键步骤处，` +
        `补充简短的中文解释 + 英文对照（English equivalent），` +
        `帮助其与海外教材词汇衔接；其余部分保持中文讲解为主。`,
    );
  }

  return lines.join("\n");
}
