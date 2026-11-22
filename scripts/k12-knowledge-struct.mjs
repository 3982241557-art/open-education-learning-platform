/**
 * K12 真实内容知识库 · 结构化单元课
 * ========================================
 *
 * 24 套系列里有大量**结构性课次**：
 *
 * - 「语文园地一」——单元字词句运用；
 * - 「第一单元」——单元整体导引；
 * - 「古诗三首」——一个单元里的三首古诗；
 * - 「口语交际」「习作」「课后题」——特定课型；
 * - 「期末专项卷」「真题讲解」——复习与测评。
 *
 * 这些课**不能**用普通课文的方式处理——它们有自己的教学目标。
 * 这里给每一类配**真实可答**的能力题。
 */

/**
 * @typedef {Object} StructPoint
 * @property {string} concept 考点概念名
 * @property {string} question 题干
 * @property {string[]} options 选项
 * @property {number} correctIndex 正确项下标
 * @property {string} explanation 解析
 */

/** 语文园地（单元字词句运用）。 */
export const YUAN_DI_POINTS = [
  {
    concept: "语文园地·字词运用",
    question:
      "在语文园地的「字词句运用」中，下面哪一项**不属于**字词积累的常用方法？",
    options: [
      "给生字组词、找近义词与反义词",
      "把词语放进句子里，体会用法",
      "给每一个生字编一个故事",
    ],
    correctIndex: 2,
    explanation:
      "语文园地的字词部分通常包含**组词、辨近反义、补充词语、选词填空**等任务；给生字编故事属于习作训练，不是字词运用。",
  },
  {
    concept: "语文园地·句式运用",
    question:
      "语文园地里的「句子」练习，最常见的两种句式转换是（　　）",
    options: [
      "把反问句改成陈述句、把陈述句改成反问句",
      "把长句缩短、把短句加长",
      "把所有句子都改成问句",
    ],
    correctIndex: 0,
    explanation:
      "陈述句与反问句的互换是小学最常考的句式转换，因为它们考的是**语气与意思是否一致**。",
  },
  {
    concept: "语文园地·日积月累",
    question:
      "「日积月累」栏目通常积累的是（　　）",
    options: [
      "成语、名言警句、诗词名句与对联",
      "单词表",
      "阅读理解题",
    ],
    correctIndex: 0,
    explanation:
      "「日积月累」积累的是可直接迁移到写作里的**语言材料**——积累多了，作文才有话说。",
  },
];

/** 单元导引 / 单元总结。 */
export const UNIT_POINTS = [
  {
    concept: "单元导引·单元要素",
    question:
      "在语文单元导引课上，最该先弄清的一件事是（　　）",
    options: [
      "本单元的语文要素与学习任务",
      "本单元有几页",
      "本单元的生字总数",
    ],
    correctIndex: 0,
    explanation:
      "新课标把每个单元的**语文要素**写在最显眼的位置——它规定了这一单元要练成的核心能力。",
  },
  {
    concept: "单元总结·要素盘点",
    question:
      "单元总结课上最有价值的做法是（　　）",
    options: [
      "把本单元的课文按内容重新分类，并说明分类依据",
      "把课文标题抄一遍",
      "把课后题做完",
    ],
    correctIndex: 0,
    explanation:
      "**重新分类并说清依据**——这是单元总结的核心动作，能把零散的课文织成结构。",
  },
];

/** 口语交际。 */
export const ORAL_POINTS = [
  {
    concept: "口语交际·倾听与表达",
    question:
      "口语交际课上，要让别人愿意听你说话，最重要的是（　　）",
    options: [
      "说话有礼貌，把话说完整，能看着对方的眼睛",
      "说得越快越好",
      "只说自己想说的，不回应对方",
    ],
    correctIndex: 0,
    explanation:
      "口语交际的评分点往往就是：**有礼貌、有条理、有回应**。",
  },
  {
    concept: "口语交际·转述",
    question:
      "转述别人说的话时，最容易出错的是（　　）",
    options: [
      "加上自己的看法，把原话改成自己的话",
      "把人物、时间、地点说清楚",
      "区分清楚是谁说的",
    ],
    correctIndex: 0,
    explanation:
      "转述要求**忠实**——加自己的看法就不是转述了。这是口语交际最容易失分的地方。",
  },
];

/** 习作。 */
export const WRITING_POINTS = [
  {
    concept: "习作·审题",
    question:
      "习作的第一步应该是（　　）",
    options: [
      "读懂题目，明确写什么、怎么写、写成什么样",
      "先写开头",
      "先想一个特别的新颖的点子",
    ],
    correctIndex: 0,
    explanation:
      "**审题在前，动笔在后**。很多学生的习作问题不是没想法，而是想法没对准题目。",
  },
  {
    concept: "习作·选材",
    question:
      "选材时最该优先考虑的是（　　）",
    options: [
      "材料能不能把题目写具体、写透",
      "材料够不够惊悚",
      "材料是不是别人都写过",
    ],
    correctIndex: 0,
    explanation:
      "选材的标准是**合题 + 具体**。切题的具体小事，永远胜过一次性的空洞大事。",
  },
  {
    concept: "习作·修改",
    question:
      "一篇习作写完后，最有效的修改方法是（　　）",
    options: [
      "出声朗读一遍，读着别扭的地方就是要改的地方",
      "只改错别字",
      "把字数凑够",
    ],
    correctIndex: 0,
    explanation:
      "「读出声」能暴露出**句子长、逻辑断、重复啰嗦**的问题——这是最省力也最有效的修改法。",
  },
];

/** 古诗三首（一个单元里的三首）。 */
export const GU_SHI_POINTS = [
  {
    concept: "古诗三首·单元比较",
    question:
      "把三首古诗放在一起学，最好的比较角度是（　　）",
    options: [
      "同一主题在不同诗人笔下有什么不同的写法",
      "三首诗各有多少字",
      "三首诗的作者分别是谁",
    ],
    correctIndex: 0,
    explanation:
      "**同主题异写**是「古诗三首」的核心训练点：同样写春天、同样写送别，诗人的笔法为何不同。",
  },
  {
    concept: "古诗三首·意象积累",
    question:
      "学习古诗时，「意象」指的是（　　）",
    options: [
      "诗中承载情感的具体物象，如明月、孤舟、落叶",
      "诗的题目",
      "诗的作者",
    ],
    correctIndex: 0,
    explanation:
      "意象 = 物 + 情。记住「月」「舟」「柳」这些意象各自承载的传统情感，读古诗会快很多。",
  },
];

/** 复习与测评课。 */
export const REVIEW_POINTS = [
  {
    concept: "复习卷·错题归因",
    question:
      "做完一张复习卷，最有价值的动作是（　　）",
    options: [
      "把错题按「概念不清 / 审题失误 / 计算失误」分类归因",
      "只看分数",
      "把卷子收起来",
    ],
    correctIndex: 0,
    explanation:
      "**归因**才是提分的关键。分数只告诉你结果，归因才告诉你下一步该练什么。",
  },
  {
    concept: "复习卷·题型识别",
    question:
      "遇到没见过的题型，最稳妥的策略是（　　）",
    options: [
      "先回忆这一类题的通法，再把题目条件往通法上套",
      "立刻猜一个答案",
      "放弃这题",
    ],
    correctIndex: 0,
    explanation:
      "题目千变万化，**通法**不变。识别题型 = 认出老朋友。",
  },
];

/** 课后题讲解。 */
export const EXERCISE_POINTS = [
  {
    concept: "课后题·读题",
    question:
      "做课后题时，最容易丢分的一步是（　　）",
    options: [
      "没看清题目问的是「是什么」还是「为什么」",
      "字写得不好看",
      "题目太多",
    ],
    correctIndex: 0,
    explanation:
      "**审题问什么，答案就答什么**。很多「错」其实是答非所问。",
  },
];

/** 按课名结构匹配到合适的题组。 */
export function matchStructPoint(coreTitle, fullTitle) {
  const haystack = `${coreTitle} ${fullTitle}`;

  if (/语文园地/.test(haystack)) return pick(YUAN_DI_POINTS, haystack);
  if (/口语交际/.test(haystack)) return pick(ORAL_POINTS, haystack);
  if (/习作/.test(haystack)) return pick(WRITING_POINTS, haystack);
  if (/古诗三首/.test(haystack)) return pick(GU_SHI_POINTS, haystack);
  if (/专项卷|期末|冲刺|真题|单元测试|测评/.test(haystack)) {
    return pick(REVIEW_POINTS, haystack);
  }
  if (/课后题|讲解/.test(haystack)) return pick(EXERCISE_POINTS, haystack);
  if (/单元|导引|总结|复习/.test(haystack)) return pick(UNIT_POINTS, haystack);

  return null;
}

/** 稳定地挑一道题。 */
function pick(pool, seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}
