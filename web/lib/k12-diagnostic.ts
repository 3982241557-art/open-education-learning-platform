/**
 * K12 诊断题引擎
 * ================
 *
 * 为**具体一课时**生成 2–3 道紧扣考点的诊断题 + 1 道背景摸底题。
 *
 * 三层来源
 * --------
 *
 * 1. **本集的课时标题**（``analyzeLessonTitle``）——最强来源。标题里
 *    的课文名 / 概念名就是**这一讲真正要教的东西**；
 * 2. **本集的知识节点 / 段落导读**（视频自带）——最贴切，但要视频
 *    采集过才有；
 * 3. **学科常识兜底**——题永远不为空。
 *
 * 为什么要按学段分
 * ----------------
 *
 * 同一个知识点，对 7 岁孩子和对 17 岁孩子该问的东西完全不同。
 * 小学问「你见过吗」，高中问「边界在哪」。
 *
 * 背景摸底题
 * ----------
 *
 * 语文评估「生字词 / 古诗文语感」，数学评估「前置运算与概念
 * 熟悉度」——这是用户明确要求的两个方向。
 */

import { analyzeLessonTitle } from "@/lib/lesson-analyzer";
import type { K12Stage, K12Subject } from "@/lib/k12-api";

/** 一道诊断题。 */
export interface K12DiagnosticQuestion {
  /** 题干。 */
  question: string;
  /** 选项。 */
  options: string[];
  /** 正确项下标。 */
  correctIndex: number;
  /** 解析。 */
  explanation: string;
  /** 考的知识点。 */
  concept: string;
  /** 这道题是不是「背景摸底」。 */
  isBackground?: boolean;
}

/**
 * 三档掌握层级的选项文案。
 *
 * ⚠️ 按**认知深度**排列，不按对错排列——最深的一档是正确答案。
 * 这样用户能凭直觉判断自己站在哪一档，不需要真的懂这道题。
 */
const LEVEL_OPTIONS = [
  "完全陌生——这个概念我还没真正接触过",
  "听过这个词，大概知道它解决什么问题，但说不出细节",
  "我理解它的核心机制，也能说清边界在哪",
];

/**
 * 按学段调整选项文案。
 *
 * 小学要**具体**（"还没学过" → "还不太懂"）；高中可以更**抽象**
 * （"边界条件" 这类词对 17 岁学生是有效的）。
 */
function levelOptions(stage: K12Stage): string[] {
  if (stage === "primary") {
    return [
      "这个我还没学过，不太懂",
      "老师讲过，但我还不太能想明白",
      "我能讲明白它是怎么一回事，也能举出例子",
    ];
  }
  if (stage === "junior") {
    return [
      "完全陌生——这个概念我还没真正接触过",
      "听过这个词，大概知道它解决什么问题，但说不出细节",
      "我能说清它的核心机制，也能说出它的适用范围",
    ];
  }
  return [
    "完全陌生——这个概念我还没真正接触过",
    "知道它是什么，但说不清它成立的条件与边界",
    "我能讲清它的推导过程，也能说清边界与反例",
  ];
}

/**
 * 背景摸底题——语文 / 数学各一组。
 *
 * 按学段递进：小学问识字与数数，初中问文言语感与代数，高中问
 * 论证严密性与函数运算。
 */
function backgroundQuestions(
  subject: K12Subject,
  stage: K12Stage,
): K12DiagnosticQuestion[] {
  if (subject === "chinese") {
    if (stage === "primary") {
      return [
        {
          question: "遇到一个没学过的生字，你通常怎么办？",
          options: [
            "直接跳过，等老师讲",
            "读音猜一猜，然后查字典或问人",
            "根据偏旁和上下文猜出意思，再核对",
          ],
          correctIndex: 2,
          explanation:
            "「根据偏旁和上下文猜」是部编版低年级最核心的识字方法——它同时训练了字形、词义与阅读理解三种能力。",
          concept: "识字方法",
          isBackground: true,
        },
      ];
    }
    if (stage === "junior") {
      return [
        {
          question: "读一段文言文时，你更接近下面哪种状态？",
          options: [
            "基本读不懂，需要逐字翻译才能懂",
            "能读出大意，但关键句子的确切含义常拿不准",
            "能借助注释与语境，直接读出句子的意思与语气",
          ],
          correctIndex: 2,
          explanation:
            "初中文言文的核心能力就是「借注释 + 借语境」读懂——不逐字翻译，靠上下文推断。",
          concept: "文言文语感",
          isBackground: true,
        },
      ];
    }
    return [
      {
        question: "面对一段论述类文本，你通常怎么判断作者的观点？",
        options: [
          "看哪句话读起来最像「结论」",
          "看哪段话最长、论据最多",
          "梳理论证结构：结论、依据、以及依据与结论之间的推理是否成立",
          ],
        correctIndex: 2,
        explanation:
          "高考论述类阅读考的就是**论证结构**——找到「作者用什么支撑这个结论」，而不是凭语气感觉。",
        concept: "论证结构",
        isBackground: true,
      },
    ];
  }

  // 数学。
  if (stage === "primary") {
    return [
      {
        question: "两位数加减法，你算得怎么样？",
        options: [
          "有点慢，容易出错",
          "基本熟练，十几以内没问题",
          "很熟练，还能说出每一步为什么这么算",
        ],
        correctIndex: 2,
        explanation:
          "小学数学的核心不是「算得快」，而是「算得明白」——能解释竖式每一步的依据，才是真正的掌握。",
        concept: "运算与算理",
        isBackground: true,
      },
    ];
  }
  if (stage === "junior") {
    return [
      {
        question: "遇到一道没见过的几何题，你的第一反应是什么？",
        options: [
          "先套公式看看能不能对上",
          "画图，把已知条件标在图上再想",
          "画图 + 标条件，并回想这个图形和哪些已学过的图形有相似之处",
        ],
        correctIndex: 2,
        explanation:
          "初中几何的关键能力是**转化**——把新图形还原成熟悉的模型。只会套公式的，遇到变式就束手无策。",
        concept: "几何转化",
        isBackground: true,
      },
    ];
  }
  return [
    {
      question: "一道函数题有多个解法时，你通常怎么选？",
      options: [
        "用自己最先想到的那个",
        "选步骤最少的那个",
        "看题目问的是什么——求值用代数法、讨论范围用图像法、证结论用构造法",
      ],
      correctIndex: 2,
      explanation:
        "高中数学不只是会解，还要**会选解法**——因为高考的「多解法」选择题考的就是这个判断力。",
      concept: "方法选择",
      isBackground: true,
    },
  ];
}

/**
 * 出一道**针对本课**的诊断题。
 *
 * 题干问的是「这个概念到底在解决什么问题」，而不是「它叫什么」——
 * 后者只需要记忆，前者才需要理解。
 */
function buildConceptQuestion(
  concept: string,
  focus: string,
  stage: K12Stage,
  subject: K12Subject,
): K12DiagnosticQuestion {
  const options = levelOptions(stage);

  const question =
    stage === "primary"
      ? `关于「${concept}」，你现在的理解到哪一步了？`
      : `「${concept}」要解决的核心问题是什么？`;

  return {
    question,
    options,
    correctIndex: 2,
    explanation: focus,
    concept,
  };
}

/**
 * 为一课时生成诊断题。
 *
 * @param episodeTitle 本集标题（真实课时名）
 * @param subject      学科
 * @param stage        学段
 * @param nodes        本集知识节点（若有，来自视频采集）
 * @param segments     本集段落导读（若有）
 * @returns 2–3 道针对本课的题 + 1 道背景摸底题
 */
export function buildK12DiagnosticQuestions(
  episodeTitle: string,
  subject: K12Subject,
  stage: K12Stage,
  nodes: Array<{ keyword: string; hint?: string; context?: string }> = [],
  segments: Array<{ title: string; content?: string }> = [],
): K12DiagnosticQuestion[] {
  const analysis = analyzeLessonTitle(episodeTitle);
  const questions: K12DiagnosticQuestion[] = [];
  const seen = new Set<string>();

  // ── ① 知识节点（视频自带，最贴切）──
  for (const node of nodes.slice(0, 2)) {
    const keyword = node.keyword?.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    const hint = (node.hint || node.context || "").trim();
    questions.push(
      buildConceptQuestion(
        keyword,
        hint ||
          `「${keyword}」是这一课要建立的核心——先说清它解决什么问题，再谈怎么做。`,
        stage,
        subject,
      ),
    );
    if (questions.length >= 3) break;
  }

  // ── ② 课时标题解析出的知识点 ──
  for (const keyword of analysis.keywords) {
    if (questions.length >= 3) break;
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    questions.push(
      buildConceptQuestion(
        keyword,
        analysis.focus,
        stage,
        subject,
      ),
    );
  }

  // ── ③ 段落导读 ──
  for (const segment of segments) {
    if (questions.length >= 3) break;
    const title = segment.title?.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const content = (segment.content || "").trim();
    questions.push(
      buildConceptQuestion(
        title,
        content.slice(0, 160) || `「${title}」是这一课的关键环节之一。`,
        stage,
        subject,
      ),
    );
  }

  // ── ④ 兜底：课时标题本身 ──
  if (questions.length === 0) {
    questions.push(
      buildConceptQuestion(
        analysis.lesson || episodeTitle,
        analysis.focus,
        stage,
        subject,
      ),
    );
  }

  // ── ⑤ 背景摸底题放在**最后** ──
  //
  // 它测的是「进入这个年级之前的基础」，与本课考点无关——
  // 所以不能混在本课题里，否则用户会以为答错就等于没学会本课。
  const background = backgroundQuestions(subject, stage);

  return [...questions.slice(0, 3), ...background];
}

/**
 * 判定掌握层级。
 *
 * 取用户所选的**最浅**一档——诊断的目的是**找到短板**。
 */
export function judgeK12Mastery(
  answers: Array<number | null>,
  questions: K12DiagnosticQuestion[],
): { mastery: K12Mastery; weakConcepts: string[] } {
  // 只看**针对本课**的题——背景摸底题不参与掌握度判定
  // （它测的是前置基础，不是这一课会不会）。
  const targetQuestions = questions.filter((q) => !q.isBackground);
  const targetAnswers = answers.slice(0, targetQuestions.length);

  // 取用户所选的**最浅**一档——诊断的目的是**找到短板**。
  //
  // ⚠️ 一道都没答 → 视为「完全陌生」（最保守的假设）。
  let shallowest = 2;
  let answeredCount = 0;
  for (const answer of targetAnswers) {
    if (typeof answer !== "number") continue;
    answeredCount += 1;
    if (answer < shallowest) shallowest = answer;
  }
  if (answeredCount === 0) shallowest = 0;

  const weakConcepts = targetQuestions
    .map((question, index) => ({
      question,
      answer: targetAnswers[index] ?? null,
    }))
    .filter(
      (item) =>
        item.answer === null || item.answer !== item.question.correctIndex,
    )
    .map((item) => item.question.concept)
    .filter((concept, index, list) => list.indexOf(concept) === index);

  const mastery: K12Mastery =
    shallowest === 0
      ? "完全陌生"
      : shallowest === 1
        ? "听过概念但说不清"
        : "已掌握基础想看深层推导";

  return { mastery, weakConcepts };
}

/** 掌握层级。 */
export type K12Mastery =
  | "完全陌生"
  | "听过概念但说不清"
  | "已掌握基础想看深层推导";

/** 掌握层级 → 助教的简短标签。 */
export const K12_MASTERY_LABEL: Record<K12Mastery, string> = {
  完全陌生: "零基础",
  听过概念但说不清: "基础薄弱",
  已掌握基础想看深层推导: "进阶深挖",
};
