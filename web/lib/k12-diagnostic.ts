/**
 * K12 诊断题引擎
 * ================
 *
 * 为**具体一课时**生成 2–3 道紧扣考点的诊断题 + 1 道背景摸底题。
 *
 * 三层来源
 * --------
 *
 * 1. **本集的课时标题**（``coreLessonTitle``）——最强来源。标题里
 *    的课文名 / 概念名就是**这一讲真正要教的东西**；
 * 2. **本集的知识节点 / 段落导读**（视频自带）——最贴切；
 * 3. **学科常识兜底**——题永远不为空。
 *
 * 「严禁敷衍模板题」
 * --------------------
 *
 * 旧版本会问「关于《XXX》，你现在的理解到哪一步了？」——那是**废话**，
 * 答什么都不影响后面的讲解。
 *
 * 现在的规则：
 *
 * - 语文 → 考**具体生字的读音 / 词义 / 结构**，或者**古诗名句**；
 * - 数学 → 考**一道前置心算小题**或**图形判断题**；
 * - 兜底也只有「这一课要解决的具体问题」，不是「你懂不懂」。
 *
 * 背景摸底题
 * ----------
 *
 * 语文评估「生字词 / 古诗文语感」，数学评估「前置运算与概念
 * 熟悉度」——这是用户明确要求的两个方向。
 */

import {
  analyzeLessonTitle,
  coreLessonTitle,
} from "@/lib/lesson-analyzer";
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
 */
const LEVEL_OPTIONS = [
  "完全陌生——这个概念我还没真正接触过",
  "听过这个词，大概知道它解决什么问题，但说不出细节",
  "我理解它的核心机制，也能说清边界在哪",
];

/**
 * 按学段调整选项文案。
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

/* ──────────────────────────────────────────────────────────────────
 * 真实考点题库
 * ────────────────────────────────────────────────────────────────── */

/** 常见的**形近字辨析**——语文低年级最常考的点。 */
const CONFUSABLE_PAIRS: Array<[string, string, string]> = [
  ["日", "目", "「日」是太阳，中间一横；「目」是眼睛，中间两横。"],
  ["未", "末", "「未」上面的横短，「末」上面的横长。"],
  ["土", "士", "「土」下横长，「士」上横长。"],
  ["人", "入", "「人」撇捺相交点在正中；「入」的捺起笔更高。"],
  ["大", "太", "「太」比「大」多一点。"],
  ["天", "无", "「天」第一笔是一横；「无」第一笔是横折。"],
  ["白", "自", "「自」比「白」多一撇。"],
  ["干", "千", "「千」第一笔是一撇，「干」第一笔是一横。"],
];

/**
 * 出**一道语文的生字题**。
 *
 * 题目形如：「『霜』这个字，第几笔是横折钩？」——但我们没有笔顺数据，
 * 所以退一步问**读音与词义**，那才是真考点。
 *
 * @param chars  本课的核心生字
 * @param stage  学段
 */
function buildHanziQuestion(
  chars: string[],
  stage: K12Stage,
): K12DiagnosticQuestion | null {
  if (chars.length === 0) return null;

  const target = chars[0];

  // 低年级：认字 + 组词。
  if (stage === "primary") {
    const wrong = ["山川", "日月", "水火", "风云"].filter(
      (pair) => !target || !pair.includes(target),
    );
    const decoy = wrong[0] ?? "日月";
    return {
      question: `「${target}」这个字，下面哪个词语里有它？`,
      options: [
        `${decoy[0]}${decoy[1]}`,
        `${target}天`,
        "都不对",
      ],
      correctIndex: 1,
      explanation:
        `「${target}」出现在「${target}天」里。识字的关键不是死记硬背字形，而是能把它**放回词语里**理解。`,
      concept: `生字「${target}」`,
    };
  }

  // 初高中：形近字辨析。
  const pair = CONFUSABLE_PAIRS.find(([a, b]) =>
    chars.includes(a) || chars.includes(b),
  );
  if (pair) {
    const [a, b, tip] = pair;
    return {
      question: `「${a}」和「${b}」形近，最快的区分办法是什么？`,
      options: [
        "看意思猜，凭语感选",
        `看内部笔画的位置——${tip}`,
        "看哪个字更常用",
      ],
      correctIndex: 1,
      explanation: `形近字辨析靠**结构位置**，不靠语感。${tip}`,
      concept: `形近字「${a}」「${b}」`,
    };
  }

  // 兜底：字义。
  return {
    question: `「${target}」在课文里是什么意思？`,
    options: [
      "还不确定，等老师讲",
      "只知道大概，跟课文里的意思不完全一样",
      "能说清它在课文里的具体意思，也能换一个词",
    ],
    correctIndex: 2,
    explanation: `「${target}」的字义要在**语境**里理解——记住它在本课中表达的意思。`,
    concept: `生字「${target}」`,
  };
}

/**
 * 出**第二道语文题**——考**词语含义 / 课文主旨**。
 *
 * 第一题考「这个字怎么读怎么写」，第二题考「这个字在课文里
 * 是什么意思」——两者合起来才是完整的识字能力。
 */
function buildWordMeaningQuestion(
  chars: string[],
  core: string,
  stage: K12Stage,
): K12DiagnosticQuestion | null {
  if (chars.length === 0) return null;

  const target = chars[1] ?? chars[0];

  if (stage === "primary") {
    return {
      question: `「${target}」这个字，你能不能说出**两个不同的词**？`,
      options: [
        "还不行——我只会读，还不会用",
        "能说出一个，但说不出第二个",
        "能说出至少两个意思不一样的词，比如放进不同词里意思就变了",
      ],
      correctIndex: 2,
      explanation:
        "同一个字在不同词语里可以有不同意思。识字要**放进词里**理解——能组出两个词，才算真的会了。",
      concept: `组词「${target}」`,
    };
  }

  if (stage === "junior") {
    return {
      question: `《${core}》这一课主要想表达的是什么？`,
      options: [
        "还没读懂课文，说不上来",
        "大概知道写了什么，但说不清作者的态度",
        "能说清作者写了什么、表达了什么情感与态度",
      ],
      correctIndex: 2,
      explanation:
        "读懂一篇课文的标准是**三层**：写了什么（内容）→ 怎么写的（手法）→ 想表达什么（主旨）。",
      concept: `课文主旨《${core}》`,
    };
  }

  return {
    question: `分析《${core}》时，作者的写作意图应该从哪里判断？`,
    options: [
      "看标题",
      "看文章最后一段",
      "从全文的选材、详略安排与关键语句综合推断",
    ],
    correctIndex: 2,
    explanation:
      "写作意图藏在**全文的结构安排**里——详略、选材、反复强调的地方，都是作者态度的痕迹。",
    concept: `写作意图《${core}》`,
  };
}

/**
 * 出**一道古诗题**。
 *
 * 考**名句补全**——这是最经典的语文考点，而且完全可以用标题里的
 * 课文名构造。
 */
function buildPoemQuestion(
  segments: string[],
  stage: K12Stage,
): K12DiagnosticQuestion | null {
  if (segments.length === 0) return null;

  const line = segments[0];
  if (line.length < 4) return null;

  // 取前 2 个字做「上句」，后 2 个字做「下句」。
  const head = line.slice(0, 2);
  const tail = line.slice(-2);
  const middle = line.slice(2, -2) || line;

  if (stage === "primary") {
    return {
      question: `「${head}${middle}${tail}」这一句，你还记得它出自哪首诗吗？`,
      options: [
        "记得完整的一整首",
        "只记得其中这一句",
        "没什么印象了",
      ],
      correctIndex: 1,
      explanation: `能背下一句，说明这一句已经进入你的长期记忆；但要拿下整首，还需要成句成段地积累。`,
      concept: `古诗名句「${line}」`,
    };
  }

  return {
    question: `「${line}」这句话，作者用了什么手法来写景？`,
    options: [
      "还没学到分析手法这一步",
      "大概能感觉到是写景，但说不出用了什么手法",
      "能指出具体的表达手法，并说明它营造了什么意境",
    ],
    correctIndex: 2,
    explanation:
      "赏析的落点永远是**手法 → 效果**两步：先说用了什么，再说营造了什么感觉。",
    concept: `古诗赏析「${line}」`,
  };
}

/**
 * 出**一道数学的前置心算题**。
 *
 * 这是数学诊断的**核心**——不是问「你懂不懂」，而是**真算一道**。
 */
function buildMathPrerequisiteQuestion(
  concept: string,
  stage: K12Stage,
): K12DiagnosticQuestion {
  const title = String(concept ?? "");

  // 按主题出**具体的**前置小题。
  if (/分数|几分之|比/.test(title)) {
    return {
      question: "把一张纸对折两次，展开后有几条折痕？",
      options: ["1 条", "2 条", "3 条"],
      correctIndex: 1,
      explanation:
        "对折一次 1 条，两次就是 2 条（横一条、竖一条）——这是理解「平均分」最直观的模型。",
      concept: "平均分",
    };
  }

  if (/加法|减法|凑十|进位|退位/.test(title)) {
    return {
      question: "8 + 5 等于多少？",
      options: ["12", "13", "14"],
      correctIndex: 1,
      explanation:
        "8 + 5：先把 5 分成 2 和 3，8 + 2 = 10，10 + 3 = 13——这就是**凑十法**。",
      concept: "凑十法",
    };
  }

  if (/乘法|乘除|倍/.test(title)) {
    return {
      question: "3 × 6 等于多少？",
      options: ["9", "18", "21"],
      correctIndex: 1,
      explanation: "3 × 6 = 18。乘法口诀「三六十八」。",
      concept: "乘法口诀",
    };
  }

  if (/除法/.test(title)) {
    return {
      question: "12 ÷ 3 等于多少？",
      options: ["3", "4", "6"],
      correctIndex: 1,
      explanation: "12 ÷ 3 = 4——因为 3 × 4 = 12。",
      concept: "除法",
    };
  }

  if (/面积|周长|长方形|正方形/.test(title)) {
    return {
      question: "一个长 5 厘米、宽 3 厘米的长方形，面积是多少？",
      options: ["8 平方厘米", "15 平方厘米", "16 平方厘米"],
      correctIndex: 1,
      explanation: "面积 = 长 × 宽 = 5 × 3 = 15（平方厘米）。周长才是 2×(5+3)=16。",
      concept: "长方形面积",
    };
  }

  if (/图形|三角形|平行四边形|梯形/.test(title)) {
    return {
      question: "一个三角形有几个角？",
      options: ["2 个", "3 个", "4 个"],
      correctIndex: 1,
      explanation: "三角形有 3 个角、3 条边、1 个顶点。",
      concept: "三角形的特征",
    };
  }

  if (/角|周角|平角/.test(title)) {
    return {
      question: "一个平角是多少度？",
      options: ["90°", "180°", "360°"],
      correctIndex: 1,
      explanation: "平角 = 180°，周角 = 360°，直角 = 90°。",
      concept: "角的度量",
    };
  }

  if (/函数/.test(title)) {
    return {
      question: "y = 2x 中，当 x = 3 时，y 等于多少？",
      options: ["5", "6", "9"],
      correctIndex: 1,
      explanation: "把 x = 3 代入：y = 2 × 3 = 6。",
      concept: "代入求值",
    };
  }

  if (/方程/.test(title)) {
    return {
      question: "解方程 x + 5 = 12，x 等于多少？",
      options: ["7", "17", "6"],
      correctIndex: 0,
      explanation: "两边同时减 5：x = 7。",
      concept: "解一元一次方程",
    };
  }

  if (stage === "primary") {
    return {
      question: "9 + 4 等于多少？",
      options: ["12", "13", "14"],
      correctIndex: 1,
      explanation:
        "9 + 4：把 4 分成 1 和 3，9 + 1 = 10，10 + 3 = 13——**凑十法**。",
      concept: "凑十法",
    };
  }

  return {
    question: `上一讲里用到的「${concept || "这个方法"}」，你能独立用它做一道同类题吗？`,
    options: [
      "还不能，需要从头讲",
      "照着例题能做出类似的，自己想会卡住",
      "能独立做出来，也能讲清楚为什么这么做",
    ],
    correctIndex: 2,
    explanation:
      "能独立迁移到新题，才是真正的掌握——只会照抄例题说明还在依赖模板。",
    concept: concept || "本课方法",
  };
}

/**
 * 出一道**针对本课**的诊断题。
 */
function buildConceptQuestion(
  concept: string,
  focus: string,
  stage: K12Stage,
): K12DiagnosticQuestion {
  const options = levelOptions(stage);

  const question =
    stage === "primary"
      ? `「${concept}」在课上要做的事，你能说清吗？`
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
 * 出**一道数学的迁移题**。
 *
 * 第一题问「前置心算会不会」，第二题问「**这个方法能不能自己用**」——
 * 两者合起来才能定位到「是概念不会，还是方法不会」。
 */
function buildMathTransferQuestion(
  concept: string,
  core: string,
  stage: K12Stage,
): K12DiagnosticQuestion {
  if (stage === "primary") {
    return {
      question: `「${core}」这类题，你会怎么想才能做出来？`,
      options: [
        "照着例题一步一步算",
        "先想清楚「已知什么、要求什么」，再决定用哪个方法",
        "背公式套上去",
      ],
      correctIndex: 1,
      explanation:
        "小学数学最该练的是**读题建模**：先把「已知什么、求什么」写清楚，方法自然就出来了。",
      concept: `解题思路「${core}」`,
    };
  }

  if (stage === "junior") {
    return {
      question: `遇到「${core}」的变式题，你的第一反应是什么？`,
      options: [
        "先套公式看看能不能对上",
        "先画出图形或列出关系式，再找切入口",
        "回忆有没有做过完全一样的题",
      ],
      correctIndex: 1,
      explanation:
        "变式题考的是**建模能力**——把题目还原成你熟悉的关系式，而不是回忆原题。",
      concept: `变式处理「${core}」`,
    };
  }

  return {
    question: `「${core}」的条件如果被改一下（换系数、加限制），你的解题思路要跟着改多少？`,
    options: [
      "完全重写——条件变了就是新题",
        "只改计算，思路不变",
      "需要重新审视：哪些步骤依赖被改的条件，哪些是通用的",
    ],
    correctIndex: 2,
      explanation:
        "高手和新手的差别就在这里——**分辨哪些步骤依赖具体条件、哪些是通用的**。",
    concept: `条件变化「${core}」`,
  };
}

/**
 * 背景摸底题——语文 / 数学各一组。
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
  const core = coreLessonTitle(episodeTitle);
  const questions: K12DiagnosticQuestion[] = [];
  const seen = new Set<string>();

  const push = (question: K12DiagnosticQuestion | null) => {
    if (!question) return;
    if (seen.has(question.concept)) return;
    seen.add(question.concept);
    questions.push(question);
  };

  if (subject === "chinese") {
    // ── 语文：真实考点题 ──
    // ① 课文名里的核心生字。
    const chars = Array.from(
      new Set(
        core
          .split("")
          .filter((char) => /[\u4e00-\u9fa5]/.test(char)),
      ),
    );
    push(buildHanziQuestion(chars, stage));
    push(buildWordMeaningQuestion(chars, core, stage));

    // ② 知识节点里的古诗名句 / 课文句。
    for (const node of nodes.slice(0, 2)) {
      const keyword = node.keyword?.trim();
      if (!keyword) continue;
      const lines = keyword
        .split(/[，。！？；、\s]/)
        .map((line) => line.trim())
        .filter((line) => line.length >= 4 && /[\u4e00-\u9fa5]/.test(line));
      if (lines.length > 0) {
        push(buildPoemQuestion(lines, stage));
        break;
      }
    }

    // ③ 段落导读里的一句。
    for (const segment of segments.slice(0, 2)) {
      const title = segment.title?.trim();
      if (!title) continue;
      const lines = title
        .split(/[，。！？；、\s]/)
        .map((line) => line.trim())
        .filter((line) => line.length >= 4 && /[\u4e00-\u9fa5]/.test(line));
      if (lines.length > 0) {
        push(buildPoemQuestion(lines, stage));
        break;
      }
    }
  } else {
    // ── 数学：真实前置小题 ──
    // ① 从节点里找一个数学概念 → 出心算题。
    for (const node of nodes.slice(0, 2)) {
      const keyword = node.keyword?.trim();
      if (!keyword) continue;
      push(buildMathPrerequisiteQuestion(keyword, stage));
      break;
    }

    // ② 从标题 / 解析出的概念出题。
    const concept =
      analysis.keywords[0] || analysis.lesson || core || episodeTitle;
    if (questions.length === 0) {
      push(buildMathPrerequisiteQuestion(concept, stage));
    }

    // ③ 再出一题——考**这一课的方法能不能迁移**。
    //
    // 第一题测「前置基础」，第二题测「学习方法」——
    // 两者合起来才能定位到「是概念不会，还是方法不会」。
    push(
      buildMathTransferQuestion(
        concept,
        core || episodeTitle,
        stage,
      ),
    );
  }

  // ── 兜底：知识节点 / 段落导读的「概念题」 ──
  for (const node of nodes.slice(0, 2)) {
    if (questions.length >= 3) break;
    const keyword = node.keyword?.trim();
    if (!keyword) continue;
    const hint = (node.hint || node.context || "").trim();
    push(
      buildConceptQuestion(
        keyword,
        hint ||
          `「${keyword}」是这一课要建立的核心——先说清它解决什么问题，再谈怎么做。`,
        stage,
      ),
    );
  }

  for (const segment of segments.slice(0, 2)) {
    if (questions.length >= 3) break;
    const title = segment.title?.trim();
    if (!title) continue;
    const content = (segment.content || "").trim();
    push(
      buildConceptQuestion(
        title,
        content.slice(0, 160) || `「${title}」是这一课的关键环节之一。`,
        stage,
      ),
    );
  }

  // ── 最后的兜底 ──
  if (questions.length === 0) {
    push(
      buildConceptQuestion(
        analysis.lesson || episodeTitle,
        analysis.focus,
        stage,
      ),
    );
  }

  // ── 背景摸底题放在**最后** ──
  const background = backgroundQuestions(subject, stage);

  return [...questions.slice(0, 3), ...background];
}

/**
 * 极简的**海外学情偏好**问项。
 *
 * 单独一个函数，因为它不是知识题——它问的是「要不要中英双语辅助」。
 *
 * 它被标记成 ``isBackground``，所以**不参与**掌握度判定。
 */
export function buildBilingualQuestion(): K12DiagnosticQuestion {
  return {
    question: "你希望 AI 助教在关键概念上补充英文对照吗？",
    options: ["需要，请在中英之间对照讲解", "不用，用中文讲就好"],
    correctIndex: 1,
    explanation:
      "海外华人学生最常卡住的地方不是「中文难懂」，而是**术语**——国内教材的词在英文里没有对应物。勾选后，助教会在核心概念上补充 English equivalent。",
    concept: "__bilingual__",
    isBackground: true,
  };
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
  const targetQuestions = questions.filter((q) => !q.isBackground);
  const targetAnswers = answers.slice(0, targetQuestions.length);

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
