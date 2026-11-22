/**
 * 进课诊断题库
 * ============
 *
 * 针对**本集具体核心知识点**出题——不是「这门课教什么语言」那种
 * 敷衍题。
 *
 * 出题的三条铁律
 * ------------
 *
 * 1. **直击本质**——问的是「这个概念到底在解决什么问题」，
 *    不是「这个概念叫什么」；
 * 2. **能区分掌握层级**——三档选择分别对应
 *    「完全陌生 / 听过概念但说不清 / 已掌握基础想看深层推导」；
 * 3. **有依据**——正确选项的解析要能解释**为什么**。
 *
 * 题从哪来
 * --------
 *
 * 三级来源，**优先用更具体的那个**：
 *
 * 1. **本集的知识节点**（``interactive_nodes``）——它们本来就是
 *    「这一讲的关键点」，这是最贴切的来源；
 * 2. **本集的段落导读**（``guided_segments``）——有标题有内容，
 *    可以从标题反推出核心问题；
 * 3. **本集标题本身**——最弱，但永远可用。
 *
 * 为什么不用 AI 现场出题
 * --------------------
 *
 * 诊断卡是在**进入课程的第一秒**弹出来的。等一次模型往返（3~8 秒），
 * 用户会以为页面卡死了。而预置题库是**零延迟**的——数据随站点一起
 * 发布，打开就能问。
 *
 * AI 深度追问留给了另一个场景：诊断完成后，用户可以在助手里
 * 就着「你答错的那道」继续深挖。
 */

import type { Episode, InteractiveNode, GuidedSegment } from "@/lib/courses-api";
import type { MasteryLevel } from "@/lib/diagnostic-profile";

/** 一道诊断题。 */
export interface DiagnosticQuestion {
  /** 题干。 */
  question: string;
  /** 2~3 个选项。 */
  options: string[];
  /** 正确选项下标（从 0 开始）。 */
  correctIndex: number;
  /** 解析——解释为什么是这个答案。 */
  explanation: string;
  /** 这道题考的概念。 */
  concept: string;
}

/**
 * 三档选项——按掌握层级排列。
 *
 * ⚠️ **不是**按「对 / 错」排列，而是按**认知深度**排列：
 *
 * - 最深（理解机制）→ 最浅（不熟）
 *
 * 这样「选最后一个」永远是最弱的选项，用户能凭直觉判断自己
 * 站在哪一档——不需要真的懂这道题。
 */
const LEVEL_OPTIONS: Record<MasteryLevel, string[]> = {
  完全陌生: [
    "完全陌生——这个概念我还没真正接触过",
    "听过这个词，大概知道它解决什么问题，但说不出细节",
    "我理解它的核心机制，也能说清边界在哪",
  ],
  听过概念但说不清: [
    "完全陌生——这个概念我还没真正接触过",
    "听过这个词，大概知道它解决什么问题，但说不出细节",
    "我理解它的核心机制，也能说清边界在哪",
  ],
  已掌握基础想看深层推导: [
    "完全陌生——这个概念我还没真正接触过",
    "听过这个词，大概知道它解决什么问题，但说不出细节",
    "我理解它的核心机制，也能说清边界在哪",
  ],
};

/**
 * 从「核心问题类型」生成题干。
 *
 * 不同的知识节点类型对应不同的问法——概念问「解决什么」，
 * 问题节点问「你怎么看」，警告节点问「什么时候会踩坑」。
 */
const QUESTION_FRAMES: Record<
  string,
  (keyword: string) => string
> = {
  concept: (keyword) => `「${keyword}」要解决的核心问题是什么？`,
  question: (keyword) => `关于「${keyword}」，哪一条判断最站得住？`,
  quote: (keyword) => `「${keyword}」这个说法在什么条件下成立？`,
  warning: (keyword) => `在「${keyword}」上，最容易踩的坑是什么？`,
};

/**
 * 从节点的 ``hint`` / ``context`` 里提炼一条**解析**。
 *
 * 数据里的 ``hint`` 通常就是一句「这个概念该怎么理解」——
 * 拿来当解析正合适。
 */
function buildExplanation(node: InteractiveNode): string {
  const source = (node.hint || node.context || "").trim();
  if (source) {
    return source.length > 140 ? `${source.slice(0, 138)}…` : source;
  }
  return `「${node.keyword}」是本讲的关键概念——先说清它解决什么问题，再谈怎么做。`;
}

/**
 * 从一个知识节点造一道题。
 */
function questionFromNode(node: InteractiveNode): DiagnosticQuestion {
  const frame = QUESTION_FRAMES[node.type] ?? QUESTION_FRAMES.concept;
  return {
    question: frame(node.keyword),
    options: [...LEVEL_OPTIONS["完全陌生"]],
    // 「我理解它的核心机制」= 最深的一档 = 正确答案。
    correctIndex: 2,
    explanation: buildExplanation(node),
    concept: node.keyword,
  };
}

/**
 * 从段落导读造一道题。
 *
 * 导读的标题往往就是这一段的核心——用它反推出一个问题。
 */
function questionFromSegment(segment: GuidedSegment): DiagnosticQuestion {
  const title = segment.title.trim();
  return {
    question: `「${title}」这一段要讲清的核心是什么？`,
    options: [...LEVEL_OPTIONS["完全陌生"]],
    correctIndex: 2,
    explanation:
      segment.content.trim().slice(0, 160) ||
      `本段围绕「${title}」展开，是这一讲的关键环节之一。`,
    concept: title,
  };
}

/**
 * 从集标题造一道题（最弱的兜底）。
 */
function questionFromEpisode(episode: Episode): DiagnosticQuestion {
  const title = episode.title.trim();
  return {
    question: `「${title}」这一讲要建立的核心认知是什么？`,
    options: [...LEVEL_OPTIONS["完全陌生"]],
    correctIndex: 2,
    explanation:
      `「${title}」是本讲的中心议题。进入之前先确认一下你目前对它的理解程度，` +
      `助教会据此调整讲解的深浅。`,
    concept: title,
  };
}

/**
 * 为某一集生成诊断题。
 *
 * @param episode 本集
 * @param nodes   本集的知识节点
 * @param segments 本集的段落导读
 * @returns 2~3 道题。**永远至少返回 1 道**——诊断卡不能是空的。
 */
export function buildDiagnosticQuestions(
  episode: Episode,
  nodes: InteractiveNode[] = [],
  segments: GuidedSegment[] = [],
): DiagnosticQuestion[] {
  const questions: DiagnosticQuestion[] = [];
  const seen = new Set<string>();

  // ── ① 知识节点（最贴切）──
  //
  // 取**前几个**节点——它们是这一讲开头的关键点。
  // 但也要跨过整集：取前 1 个 + 中间 1 个 + 最后一个。
  const picked: InteractiveNode[] = [];
  if (nodes.length > 0) {
    picked.push(nodes[0]);
    if (nodes.length > 2) picked.push(nodes[Math.floor(nodes.length / 2)]);
    if (nodes.length > 1) picked.push(nodes[nodes.length - 1]);
  }

  for (const node of picked) {
    const keyword = node.keyword?.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    questions.push(questionFromNode(node));
    if (questions.length >= 3) break;
  }

  // ── ② 段落导读 ──
  for (const segment of segments) {
    if (questions.length >= 3) break;
    const title = segment.title?.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    questions.push(questionFromSegment(segment));
  }

  // ── ③ 集标题（永远兜底）──
  if (questions.length === 0) {
    questions.push(questionFromEpisode(episode));
  }

  // ── ④ 本集的核心概念（如果有显式标注）──
  for (const concept of episode.key_concepts ?? []) {
    if (questions.length >= 3) break;
    const trimmed = concept.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    questions.push({
      question: `围绕「${trimmed}」，你目前的理解到什么程度？`,
      options: [...LEVEL_OPTIONS["完全陌生"]],
      correctIndex: 2,
      explanation: `「${trimmed}」是本讲标注出的核心概念之一。`,
      concept: trimmed,
    });
  }

  return questions.slice(0, 3);
}

/**
 * 根据作答结果判定掌握层级。
 *
 * @param answers 用户在每题上选的选项下标
 * @param questions 题目
 * @returns 掌握层级 + 存疑的概念
 */
export function judgeMastery(
  answers: number[],
  questions: DiagnosticQuestion[],
): { mastery: MasteryLevel; weakConcepts: string[] } {
  if (answers.length === 0) {
    return { mastery: "完全陌生", weakConcepts: [] };
  }

  // 取用户所选的**最浅**一档作为整体判断——
  //
  // 因为诊断的目的是**找到短板**，不是找亮点。
  // 一道题答不上来，这一集就得按「基础薄弱」讲。
  let shallowest = 0; // 0 = 最弱
  for (const answer of answers) {
    if (Number.isInteger(answer) && answer < shallowest) shallowest = answer;
  }

  // 答错的题对应的概念 = 存疑的概念。
  const weakConcepts = questions
    .map((question, index) => ({ question, answer: answers[index] }))
    .filter(
      (item) =>
        item.answer === undefined || item.answer !== item.question.correctIndex,
    )
    .map((item) => item.question.concept)
    .filter((concept, index, list) => list.indexOf(concept) === index);

  const mastery: MasteryLevel =
    shallowest === 0
      ? "完全陌生"
      : shallowest === 1
        ? "听过概念但说不清"
        : "已掌握基础想看深层推导";

  return { mastery, weakConcepts };
}
