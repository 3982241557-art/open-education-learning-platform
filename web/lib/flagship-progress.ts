/**
 * 标杆专题进度账本
 * =================
 *
 * 记录每个标杆专题的三件事：
 *
 * - 是否**看过短片**（``watched``）；
 * - 是否**动过手**（``touched``）——在交互画布里真的拖过滑块/点过按钮；
 * - 三道情境题**答对了几道**（``correct``）。
 *
 * ⛔ **单调**——学习发生过就是发生过，点亮不会被熄灭。
 *
 * 为什么不用 :mod:`lib/math-star-ledger`
 * ------------------------------------
 *
 * 数学图谱那套账本是按「知识点节点 id」组织的，三颗星对应
 * 探索 / 规律 / 谜题三个**实验阶段**。标杆专题的进度结构完全不同：
 * 它是「短片 + 交互 + 3 道情境题」三件事，答对题数是**连续量**
 * 而不是三颗布尔星。硬塞进旧结构会逼出一堆假字段，所以另起一套。
 *
 * 持久化在 ``localStorage``——纯静态导出没有服务端。
 */

const STORAGE_KEY = "oe:flagship-progress";
const UPDATED_EVENT = "oe:flagship-progress-updated";

/** 一个专题的进度。 */
export interface FlagshipProgress {
  /** 看过短片。 */
  watched: boolean;
  /** 动过手。 */
  touched: boolean;
  /** 答对的题数（0–3）。 */
  correct: number;
  /** 已提交的题数（0–3）。 */
  submitted: number;
  updated_at: number;
}

export interface FlagshipLedger {
  topics: Record<string, FlagshipProgress>;
  updated_at: number;
}

function empty(): FlagshipLedger {
  return { topics: {}, updated_at: 0 };
}

/** 安全拿 localStorage。 */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__oe_flagship_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读账本。 */
export function readFlagshipLedger(): FlagshipLedger {
  const s = store();
  if (!s) return empty();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as FlagshipLedger;
    if (!parsed || typeof parsed !== "object") return empty();
    return {
      topics:
        parsed.topics && typeof parsed.topics === "object" ? parsed.topics : {},
      updated_at: parsed.updated_at ?? 0,
    };
  } catch {
    return empty();
  }
}

/** 写账本 + 广播。 */
function write(ledger: FlagshipLedger): void {
  const s = store();
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(ledger));
    } catch {
      /* 配额满——忽略 */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
  }
}

/** 读某个专题的进度。 */
export function readFlagshipProgress(topicId: string): FlagshipProgress {
  return (
    readFlagshipLedger().topics[topicId] ?? {
      watched: false,
      touched: false,
      correct: 0,
      submitted: 0,
      updated_at: 0,
    }
  );
}

/** 标记「看过短片」。 */
export function markWatched(topicId: string): void {
  const ledger = readFlagshipLedger();
  const prev = readFlagshipProgress(topicId);
  ledger.topics[topicId] = {
    ...prev,
    watched: true,
    updated_at: Date.now(),
  };
  ledger.updated_at = Date.now();
  write(ledger);
}

/** 标记「动过手」。 */
export function markTouched(topicId: string): void {
  const ledger = readFlagshipLedger();
  const prev = readFlagshipProgress(topicId);
  ledger.topics[topicId] = {
    ...prev,
    touched: true,
    updated_at: Date.now(),
  };
  ledger.updated_at = Date.now();
  write(ledger);
}

/**
 * 记录答题结果。
 *
 * ⛔ **答对数单调不减**——重做不会掉分。
 */
export function recordQuiz(
  topicId: string,
  correct: number,
  submitted: number,
): void {
  const ledger = readFlagshipLedger();
  const prev = readFlagshipProgress(topicId);
  ledger.topics[topicId] = {
    ...prev,
    correct: Math.max(prev.correct, correct),
    submitted: Math.max(prev.submitted, submitted),
    updated_at: Date.now(),
  };
  ledger.updated_at = Date.now();
  write(ledger);
}

/** 一个专题是否「完整完成」（短片 + 交互 + 三题全答）。 */
export function isFlagshipComplete(p: FlagshipProgress): boolean {
  return p.watched && p.touched && p.submitted >= 3;
}

/** 三大核心认知维度的得分（0–100）。 */
export interface CognitiveScores {
  /** 抽象建模力。 */
  modeling: number;
  /** 直觉校准力。 */
  calibration: number;
  /** 跨学科迁移力。 */
  transfer: number;
}

/**
 * 汇总三大认知维度。
 *
 * 每个维度都由三个专题的完成度加权合成：
 *
 * - **抽象建模力** —— 把现象翻译成公式（互动实验 + 情境题）；
 * - **直觉校准力** —— 发现自己直觉错在哪（答对题数）；
 * - **跨学科迁移力** —— 跨出数学本身（看短片 + 读概念卡）。
 *
 * ⛔ 未完成的专题**不计入分母**——所以「还没学」不会被当成
 *    「学了但不行」。
 */
export function summarizeCognitive(
  topicIds: string[],
): CognitiveScores {
  let modeling = 0;
  let calibration = 0;
  let transfer = 0;
  let active = 0;

  for (const id of topicIds) {
    const p = readFlagshipProgress(id);
    if (!p.watched && !p.touched && p.submitted === 0) continue;
    active += 1;
    modeling += (p.touched ? 40 : 0) + (p.correct / 3) * 60;
    calibration += (p.correct / 3) * 100;
    transfer += (p.watched ? 40 : 0) + (p.touched ? 30 : 0) + (p.correct / 3) * 30;
  }

  if (active === 0) {
    return { modeling: 0, calibration: 0, transfer: 0 };
  }

  const round = (v: number) => Math.round(v / active);
  return {
    modeling: round(modeling),
    calibration: round(calibration),
    transfer: round(transfer),
  };
}

/** 已完整完成的专题数量。 */
export function countCompletedTopics(topicIds: string[]): number {
  return topicIds.filter((id) => isFlagshipComplete(readFlagshipProgress(id)))
    .length;
}
