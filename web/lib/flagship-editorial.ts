/**
 * 三大标杆专题 · 编辑层内容
 * ==========================
 *
 * 「一切皆数学」首批三个标杆专题的**编辑层**——与
 * ``/data/flagship-topics.json``（开源仓库原始素材）合流，构成
 * 专题学习页的全部内容。
 *
 * 为什么要分「编辑层」和「素材层」
 * ------------------------------
 *
 * - **素材层**（JSON）——来自 OpenStax / Khan / cn-k12 的真实概念
 *   定义、练习与大纲知识点。**零 AI 编造**，逐条可追溯。
 * - **编辑层**（本文件）——把素材组织成「金句 / 数学本质 /
 *   跨学科连接 / 深度博客 / 精炼 PPT / 情境思考题」的学习体验。
 *   这是**观点与结构**，不是事实性知识。
 *
 * 严格单语
 * --------
 *
 * 每段文案都带 ``zhCN`` 与 ``en`` 两列，渲染时只取当前语言那一列。
 * 繁体由 :mod:`lib/zh-tw` 在运行时做字符级转换。
 *
 * ⛔ **不做「中英拼贴」**——任何一句话要么完整中文，要么完整英文。
 */

import type { FlagshipEditorial } from "@/lib/flagship-topics";

/** 专题 01 · 舒适区的几何学。 */
const EXP_COMFORT: FlagshipEditorial = {
  id: "exp-comfort",
  board: {
    zhCN: "函数与变化",
    en: "Functions and Change",
  },
  anchor: {
    zhCN: "高中数学 · 指数函数与指数增长",
    en: "Secondary Mathematics · Exponential Functions and Growth",
  },
  tags: {
    zhCN: ["心理学 · 舒适区", "微习惯 · 复利", "行为经济学"],
    en: [
      "Psychology · Comfort Zone",
      "Micro-habits · Compounding",
      "Behavioral Economics",
    ],
  },
  quote: {
    zhCN:
      "你以为你在原地不动，其实你在缩小；你以为你在慢慢走，其实世界在为你放大。",
    en:
      "You think you are standing still, but you are shrinking; you think you are walking slowly, but the world is growing with you.",
  },
  formula: "A(t) = A_0\\,(1+r)^{t}",
  formulaNote: {
    zhCN:
      "每一步的增量由「当前的大小」决定，而不是由起点决定——所以复利是一条越走越陡的曲线，不是一条直线。",
    en:
      "Each step is sized by what you already have, not by where you started — that is why compounding curves upward instead of running straight.",
  },
  connection: {
    zhCN:
      "庄子说「方生方死，方死方生」，生灭不是转折而是刻度。心理学把舒适区画成一个圈：圈内的确定性与圈外的可能性之间，只隔着一个小小的 r。r 取正负，决定了你是在收缩还是在扩张。",
    en:
      "Zhuangzi writes that life and death are not a turn but a scale. Psychology draws the comfort zone as a ring: certainty inside, possibility outside, separated by one small r. Its sign decides whether you contract or expand.",
  },
  blog: {
    title: {
      zhCN: "为什么「每天进步一点点」常常等于「每天退步一点点」",
      en: "Why “a little better every day” often means a little worse every day",
    },
    paragraphs: {
      zhCN: [
        "线性直觉喜欢加法。每天多走 100 米，一个月就是 3000 米——这句话没有错，但它默认了一件危险的事：默认每一米都等价。复利不这么看。指数增长里，第 1000 步的绝对长度，是第 1 步的 1000 倍；每天多走 100 米的红利，几乎全被后面的复利吃掉，前面那些不起眼的步子才是地基。",
        "同样的算术在舒适区里也成立，而且是反过来的。一个从不主动扩展边界的人，他的「能力总量」会以一个负的 r 缓慢衰减：不是突然崩塌，而是每年掉 5%，掉到某一天你忽然发现，原来会的东西已经不会了。热力学把这叫熵增，心理学把它叫「退行性舒适」。",
        "真正的杠杆不在于每天做多大力气的事，而在于**换一个 r**。把 r 从 -5% 改成 +1%，一年后的差距不是 6%，而是一倍以上。把 r 从 +1% 改成 +5%，差距再翻一倍。复利世界里的选择不是「做多少」，而是「以什么速度做」。",
        "这也解释了为什么很多微习惯方案失败：它们只规定了频率，没有重设斜率。每天写 50 个字、每天读 10 页，如果写的内容与你当前的「舒适区半径」毫无关系，读的也只是同类信息，那么 r 仍然是负的——你只是在用勤奋的方式维持一个正在缩小的世界。",
      ],
      en: [
        "Linear intuition loves addition. Walk 100 meters a day and a month gives you 3000 meters — nothing false there, but it assumes one dangerous thing: that every meter is equivalent. Compounding disagrees. In exponential growth the thousandth step is a thousand times longer than the first; almost all of the visible gain is eaten by the compounding tail, and the unimpressive early steps are the foundation.",
        "The same arithmetic holds inside a comfort zone, only in reverse. Someone who never widens the boundary lets total capacity decay at a negative r: not a collapse, but a quiet 5% a year, until one day you notice that what you used to be able to do, you cannot. Thermodynamics calls it entropy; psychology calls it regressive comfort.",
        "The real lever is not how hard you push each day but **which r you run at**. Moving r from -5% to +1% more than doubles the year-end gap. Moving it from +1% to +5% doubles it again. In a compounding world the question is not “how much” but “at what rate”.",
        "This is why so many micro-habit programs fail: they specify frequency but never reset the slope. Fifty words a day, ten pages a day — if the writing has nothing to do with the radius of your current comfort zone and the reading stays inside the same genre, then r is still negative. You are simply maintaining a shrinking world through diligence.",
      ],
    },
  },
  ppt: {
    title: {
      zhCN: "舒适区的几何学 · 精炼讲义",
      en: "The Geometry of the Comfort Zone · A Refined Deck",
    },
    slides: [
      {
        title: { zhCN: "一个线性直觉", en: "One linear intuition" },
        bullets: {
          zhCN: [
            "每天 +1 分，一个月 +30 分",
            "加法是稳的、可预期的、可规划的",
            "但它假设：每一分都等价",
          ],
          en: [
            "+1 point a day, +30 points a month",
            "Addition is steady, predictable, plannable",
            "But it assumes every point is equivalent",
          ],
        },
      },
      {
        title: { zhCN: "复利的真相", en: "The truth of compounding" },
        bullets: {
          zhCN: [
            "A(t) = A₀(1+r)^t",
            "增量由「当前的大小」决定",
            "所以曲线会自己变陡",
          ],
          en: [
            "A(t) = A₀(1+r)^t",
            "The step is sized by what you already have",
            "So the curve steepens by itself",
          ],
        },
      },
      {
        title: { zhCN: "负的 r 也在复利", en: "A negative r compounds too" },
        bullets: {
          zhCN: [
            "原地不动不是 r = 0，而是 r < 0",
            "舒适区每年收缩 5% 是什么样子",
            "崩塌发生在最后，不在开头",
          ],
          en: [
            "Standing still is not r = 0, it is r < 0",
            "What a comfort zone shrinking 5% a year looks like",
            "The collapse lands at the end, not the start",
          ],
        },
      },
      {
        title: { zhCN: "真正的杠杆是斜率", en: "The real lever is the slope" },
        bullets: {
          zhCN: [
            "-5% → +1%：一年后差一倍以上",
            "+1% → +5%：再翻一倍",
            "选择题是「以什么速度做」，不是「做多少」",
          ],
          en: [
            "-5% → +1%: more than double the year-end gap",
            "+1% → +5%: double it again",
            "The question is “at what rate”, not “how much”",
          ],
        },
      },
      {
        title: { zhCN: "动手验证", en: "Try it yourself" },
        bullets: {
          zhCN: [
            "拖动 r 与 n，看两条环同时变化",
            "找出让两条环在 8 年后交会的 r",
            "然后问：你的 r 现在是多少",
          ],
          en: [
            "Drag r and n, watch both rings move",
            "Find the r where they cross after 8 years",
            "Then ask: what is your r right now",
          ],
        },
      },
    ],
  },
  questions: [
    {
      stem: {
        zhCN:
          "一个能力量为 100 的学习者，连续 3 年按 r = -10% 衰减。若要让他在第 4 年回到 100，最少需要一年的增长率是多少？",
        en:
          "A learner starts at 100 and decays at r = -10% for three years. What single-year growth rate brings them back to 100 in year four?",
      },
      options: {
        zhCN: ["约 11%", "约 33%", "约 40%", "约 100%"],
        en: ["about 11%", "about 33%", "about 40%", "about 100%"],
      },
      answer: 1,
      explain: {
        zhCN:
          "100×0.9³ = 72.9，要回到 100 需 100/72.9 − 1 ≈ 37%。但如果这 37% 之后再衰减，同样的机制会立刻把它吃掉——直觉觉得「33% 够」，是因为把一次性的补偿当成了稳定的增长。",
        en:
          "100×0.9³ = 72.9, so returning to 100 needs 100/72.9 − 1 ≈ 37%. And if that 37% then decays again, the same mechanism eats it immediately. The “33%” instinct treats a one-off compensation as stable growth.",
      },
    },
    {
      stem: {
        zhCN:
          "小李说：「我每天进步 1%，一年后比现在强 37%，所以要按 37% 的力度努力。」这句话错在哪里？",
        en:
          "Xiaoli says: “I improve 1% a day, so after a year I am 37% stronger — so I should work 37% harder.” Where is the mistake?",
      },
      options: {
        zhCN: [
          "37% 算错了，应该是 40%",
          "进步 1% 的基数每天在变，一年后的结果远大于 37%",
          "每天进步 1% 不现实",
          "没有错，努力与回报成正比",
        ],
        en: [
          "37% is miscalculated; it should be 40%",
          "The base changes every day, so a year of 1% gains far exceeds 37%",
          "1% a day is unrealistic",
          "No mistake — effort and return are proportional",
        ],
      },
      answer: 1,
      explain: {
        zhCN:
          "复利下 1.01³⁶⁵ ≈ 37.8，这还只是「每天 1%」这一种口径。若把进步理解为「当前能力的 1%」，第 365 天的增量本身已经比第 1 天大 37 倍。真正该改的不是力度，而是把 r 提上去。",
        en:
          "With compounding, 1.01³⁶⁵ ≈ 37.8 — and that is only for one reading of “1%”. If the gain is 1% of *current* ability, the day-365 increment is already 37 times the day-1 increment. The fix is not effort; it is a higher r.",
      },
    },
    {
      stem: {
        zhCN:
          "为什么「保持现状」在复利世界里等价于「持续退行」，而不是「持平」？",
        en:
          "Why is “staying put” equivalent to continuous regression rather than “flat” in a compounding world?",
      },
      options: {
        zhCN: [
          "因为环境在变，学习者不变就是相对落后",
          "因为复利公式只对正增长有意义",
          "因为人的记忆力会自然衰退",
          "因为复利是线性而非指数的",
        ],
        en: [
          "Because the world moves; standing still is relative decline",
          "Because the formula only works for positive growth",
          "Because memory naturally fades",
          "Because compounding is linear, not exponential",
        ],
      },
      answer: 0,
      explain: {
        zhCN:
          "复利公式里 r = 0 确实是持平，但现实里没有任何一个能力维度会自动守恒：工具会变、对手会变、标准会变。「原地」在坐标系里是移动的——r 事实上是负的。",
        en:
          "In the formula r = 0 really is flat, but no dimension of ability holds still by itself: tools change, rivals change, standards change. “Standing still” is itself motion — in practice r is negative.",
      },
    },
  ],
  labHint: {
    zhCN: "拖动「变化率 r」与「时间跨度 n」，两条光环会同时按 A(t)=A₀(1+r)ᵗ 缩放。",
    en: "Drag the rate r and the span n — both rings rescale by A(t)=A₀(1+r)ᵗ.",
  },
  filmHint: {
    zhCN: "左环收缩至第 8 年 15%，右环绽放至第 8 年 1024%。",
    en: "The left ring shrinks to 15% by year 8; the right blooms to 1024%.",
  },
};

/* ── 专题 02 ─────────────────────────────────────────────────── */

const SEQ_ZENO: FlagshipEditorial = {
  id: "seq-zeno",
  board: {
    zhCN: "数列与无穷",
    en: "Sequences and Infinity",
  },
  anchor: {
    zhCN: "高中数学 · 等比数列与极限",
    en: "Secondary Mathematics · Geometric Sequences and Limits",
  },
  tags: {
    zhCN: ["中国哲学 · 庄子「一尺之棰」", "古希腊 · 芝诺悖论", "微积分直觉"],
    en: [
      "Chinese Philosophy · Zhuangzi's One-Choot Rod",
      "Ancient Greece · Zeno's Paradoxes",
      "Intuition for Calculus",
    ],
  },
  quote: {
    zhCN: "有限的边界里，装得下无限的可能。",
    en: "Inside a finite boundary, infinite possibility fits.",
  },
  formula: "S_n=\\sum_{k=1}^{n}q^{k}=\\frac{q\\,(1-q^{n})}{1-q}\\;\\xrightarrow[n\\to\\infty]{}\\;\\frac{q}{1-q}\\quad(q<1)",
  formulaNote: {
    zhCN:
      "切得越碎，总和越贴近一个有限的数；但当公比 q ≥ 1 时，公式的分母失真，碎片会撑破画框——极限只属于会收敛的那一侧。",
    en:
      "The finer the cuts, the closer the sum to one finite number; once q ≥ 1 the formula breaks down and the pieces burst the frame — limits belong only to the convergent side.",
  },
  connection: {
    zhCN:
      "庄子说「一尺之棰，日取其半，万世不竭」——无穷不是「越来越小」，而是「永远切得完」。芝诺的阿基里斯追龟用同样的方式把距离切成无穷段。东西方在同一个悖论里相遇：一个问「有限能否容纳无限」，一个问「无限逼近有限」。",
    en:
      "Zhuangzi's one-choot rod, halved daily forever, does not say infinity gets smaller — it says the cutting never ends. Zeno's Achilles does the same to a distance. East and West meet in one paradox: one asks whether the finite can hold the infinite, the other whether the infinite can close on the finite.",
  },
  blog: {
    title: {
      zhCN: "一尺之棰：无穷不是「越来越小」",
      en: "The One-Choot Rod: Infinity Is Not “Smaller and Smaller”",
    },
    paragraphs: {
      zhCN: [
        "我们通常把无穷想象成一个越来越小的点：1/2、1/4、1/8……趋近于 0。但庄子的说法是另一层意思：一尺之棰，日取其半，万世不竭。棰并没有变小到某个地方去消失，它只是被切得越来越细。无穷不是「终于到达的某个状态」，而是「可以永远继续下去的过程」。",
        "这个区别在数学上是实质的。前者是极限：数列收敛到一个数 q/(1−q)，1/2 的和是 1。后者是发散：q ≥ 1 时，无论切多少刀，总和都越过任何给定的边界。庄子那句话之所以动人，恰恰因为它描述的是后者——一个永远不会「用完」的切分过程。",
        "芝诺的阿基里斯悖论是同一个结构的另一种提问：阿基里斯要跑到的距离被切成无穷段，每段都有限，但他就是永远到不了。这里有一个容易被忽略的细节——到不了并不等于无穷远，而等于无穷多个有限步骤。有限步骤之和可以是无穷的，这就是无穷的真实样貌。",
        "所以「1/2 + 1/4 + 1/8 + … = 1」这件事的美妙之处不在于它等于 1，而在于**任何一个有限步骤都到不了 1**。无穷不是一个被抵达的地点，而是一串永远不到达某处的有限点的总和。这就是「有限包容无限」的全部内容。",
      ],
      en: [
        "We habitually picture infinity as a shrinking point: 1/2, 1/4, 1/8… approaching zero. Zhuangzi means something else: a one-choot rod halved each day, never exhausted. The rod does not shrink away to somewhere; it is merely cut finer and finer. Infinity is not a state finally reached — it is a process that can always continue.",
        "The distinction is mathematically substantive. The first is a limit: the sequence converges to q/(1−q), and for q = 1/2 the sum is 1. The second is divergence: once q ≥ 1, no number of cuts keeps the sum under any given bound. What moves us in Zhuangzi's line is precisely the second — a cutting that never runs out.",
        "Zeno's Achilles is the same structure asked another way: the distance is cut into infinitely many finite segments, and yet the runner never arrives. One detail is easily missed — never arriving is not the same as being infinitely far away; it is the same as infinitely many finite steps. A sum of finite steps can be infinite. That is what infinity actually looks like.",
        "So the beauty of “1/2 + 1/4 + 1/8 + … = 1” is not the equality. It is that **no finite stage ever reaches 1**. Infinity is not a place you arrive; it is the sum of finitely many points that never quite arrive. That is the whole content of “the finite holds the infinite”.",
      ],
    },
  },
  ppt: {
    title: {
      zhCN: "一尺之棰与无穷边界 · 精炼讲义",
      en: "The One-Choot Rod and the Infinite Boundary · A Refined Deck",
    },
    slides: [
      {
        title: { zhCN: "切分的协议", en: "The protocol of cutting" },
        bullets: {
          zhCN: [
            "起点：一段长度 1 的光尺",
            "每一刀：精准对半",
            "碎片拼回原框，缝隙趋近于零",
          ],
          en: [
            "Start: a luminous rod of length 1",
            "Each cut: exactly in half",
            "Fragments tile the frame, gaps vanishing",
          ],
        },
      },
      {
        title: { zhCN: "和的逼近", en: "The approach of the sum" },
        bullets: {
          zhCN: [
            "Sₙ = q(1−qⁿ)/(1−q)",
            "q = 1/2 时极限是 1",
            "但任何有限 n 都到不了 1",
          ],
          en: [
            "Sₙ = q(1−qⁿ)/(1−q)",
            "For q = 1/2 the limit is 1",
            "Yet no finite n ever reaches 1",
          ],
        },
      },
      {
        title: { zhCN: "公比的分水岭", en: "The watershed of q" },
        bullets: {
          zhCN: [
            "q < 1：收敛于有限边界内",
            "q = 1：等和，撑破画框",
            "q > 1：每刀更胖，立刻发散",
          ],
          en: [
            "q < 1: converges inside a finite frame",
            "q = 1: equal sums, the frame bursts",
            "q > 1: each cut is fatter, immediate divergence",
          ],
        },
      },
      {
        title: { zhCN: "庄子的版本", en: "Zhuangzi's version" },
        bullets: {
          zhCN: [
            "「一尺之棰，日取其半，万世不竭」",
            "无穷是「永远切得完」，不是「越来越小」",
            "过程，而不是被抵达的状态",
          ],
          en: [
            "“A one-choot rod, halved daily, never exhausted”",
            "Infinity is “always cuttable”, not “ever smaller”",
            "A process, not a state you arrive at",
          ],
        },
      },
      {
        title: { zhCN: "动手验证", en: "Try it yourself" },
        bullets: {
          zhCN: [
            "点「再切一刀」，听音高逐次变亮",
            "把 q 拖过 1，看光块撑破边框",
            "找一个 q，让前 20 刀已经越过 1",
          ],
          en: [
            "Hit “cut again”, hear the chime climb",
            "Drag q past 1 and watch the frame burst",
            "Find a q where 20 cuts already pass 1",
          ],
        },
      },
    ],
  },
  questions: [
    {
      stem: {
        zhCN:
          "一根 1 米长的绳子，每次剪去一半。剪到第 10 次时，剪掉的累计长度与剩下的长度各是多少？",
        en:
          "A 1-meter rope loses half its length at every cut. After the 10th cut, what are the total removed and the remainder?",
      },
      options: {
        zhCN: [
          "累计 0.9990 米，剩 0.0010 米",
          "累计 0.5000 米，剩 0.5000 米",
          "累计 0.9990 米，剩 0.0010 米，且永远剪不完",
          "累计 1.0000 米，剩 0 米",
        ],
        en: [
          "removed 0.9990 m, remainder 0.0010 m",
          "removed 0.5000 m, remainder 0.5000 m",
          "removed 0.9990 m, remainder 0.0010 m — and it never ends",
          "removed 1.0000 m, remainder 0",
        ],
      },
      answer: 2,
      explain: {
        zhCN:
          "剩下的是 2⁻¹⁰ ≈ 0.000977 米，累计剪掉 ≈ 0.999023 米。关键在第三项：任何有限次都留着一段残余，但「永远剪不完」并不等于「永远在接近某个终点」——残余趋于 0，却从不等于 0。",
        en:
          "The remainder is 2⁻¹⁰ ≈ 0.000977 m, so about 0.999023 m is gone. The key is the third option: every finite stage leaves a scrap, yet “it never ends” does not mean “it approaches an end” — the scrap tends to 0 without ever being 0.",
      },
    },
    {
      stem: {
        zhCN:
          "为什么「1/2 + 1/4 + 1/8 + … = 1」并不与「无穷多个正数相加不可能得到有限值」矛盾？",
        en:
          "Why does “1/2 + 1/4 + 1/8 + … = 1” not contradict “infinitely many positive numbers cannot sum to a finite value”?",
      },
      options: {
        zhCN: [
          "因为它其实不等于 1，只是接近 1",
          "因为这些数是几何级数，收敛；一般正数级数会发散",
          "因为无穷个数不能按顺序相加",
          "因为 1 是无穷大",
        ],
        en: [
          "Because it does not equal 1; it only approaches 1",
          "Because it is a geometric series and converges; general positive series diverge",
          "Because infinitely many terms cannot be ordered",
          "Because 1 is itself infinite",
        ],
      },
      answer: 1,
      explain: {
        zhCN:
          "关键在于「任意正数」与「以固定公比递减的正数」的差别。几何级数的部分和有上界 q/(1−q)，所以收敛；换成每项都是 0.6 的级数，和会无界。无穷并不可怕，可怕的是**不衰减**。",
        en:
          "The difference is between “arbitrary positive terms” and “positive terms shrinking at a fixed ratio”. A geometric series has bounded partial sums q/(1−q) and converges; replace it with 0.6 every term and the sum is unbounded. Infinity is not the problem — non-decay is.",
      },
    },
    {
      stem: {
        zhCN:
          "若公比 q = 1.1，切分 30 次之后，累计长度约为多少？画框还能装下吗？",
        en:
          "With q = 1.1, what is the total length after 30 cuts — and does it still fit the frame?",
      },
      options: {
        zhCN: [
          "约 17.4 米，装不下",
          "约 1.0 米，装得下",
          "约 3.0 米，装得下",
          "约 0.0 米，装得下",
        ],
        en: [
          "about 17.4 m — it does not fit",
          "about 1.0 m — it fits",
          "about 3.0 m — it fits",
          "about 0.0 m — it fits",
        ],
      },
      answer: 0,
      explain: {
        zhCN:
          "S₃₀ = 1.1(1.1³⁰−1)/0.1 ≈ 17.4。因为 q ≥ 1 时公式分母变号、发散，碎片会直接撑破边框——极限只属于会收敛的那一侧。",
        en:
          "S₃₀ = 1.1(1.1³⁰−1)/0.1 ≈ 17.4. Once q ≥ 1 the geometric formula flips sign and diverges, so the pieces burst the frame outright — limits belong only to the convergent side.",
      },
    },
  ],
  labHint: {
    zhCN: "点「再切一刀」，或拖动切分次数 n 与公比 q，看光块何时撑破边框。",
    en: "Hit “cut again”, or drag n and q — watch when the pieces burst the frame.",
  },
  filmHint: {
    zhCN: "光尺被不断对半切分，碎片拼回光框，累加和逼近 1.0000。",
    en: "A luminous rod is halved again and again; the fragments tile the frame as the sum nears 1.0000.",
  },
};

/* ── 专题 03 ─────────────────────────────────────────────────── */

const PROB_BAYES: FlagshipEditorial = {
  id: "prob-bayes",
  board: {
    zhCN: "概率与不确定性",
    en: "Probability and Uncertainty",
  },
  anchor: {
    zhCN: "初高中数学 · 概率与条件概率",
    en: "Secondary Mathematics · Probability and Conditional Probability",
  },
  tags: {
    zhCN: ["认知心理学 · 基础率谬误", "《易经》· 变易权衡", "医学筛查"],
    en: [
      "Cognitive Psychology · Base-Rate Neglect",
      "I Ching · Weighing Change",
      "Medical Screening",
    ],
  },
  quote: {
    zhCN: "99% 的准确率，描述的是检测器，不是被检测的人。",
    en: "A 99% accuracy describes the detector, not the person being tested.",
  },
  formula:
    "P(A\\mid B)=\\frac{P(B\\mid A)\\,P(A)}{P(B\\mid A)\\,P(A)+P(B\\mid \\neg A)\\,P(\\neg A)}",
  formulaNote: {
    zhCN:
      "后验同时被「检测有多准」和「这类人本来有多少」决定。只盯着前者，就会把基础率整条丢掉——这就是直觉撒谎的地方。",
    en:
      "The posterior depends on both how good the test is and how common the condition is. Focusing on only the first throws away the base rate — exactly where intuition goes wrong.",
  },
  connection: {
    zhCN:
      "《易经》讲「变」，讲的是同一处境在不同证据下的权衡；贝叶斯讲的是同一件事的另一半——证据每来一次，判断就必须更新一次。孔子的「穷则变，变则通，通则久」放在这里读，就是一句关于后验概率的提醒。",
    en:
      "The I Ching teaches change: weighing the same situation under different evidence. Bayes teaches the other half — every piece of evidence requires the judgement to update. Confucius's “when stuck, change; change brings passage; passage brings duration” reads here as a reminder about posteriors.",
  },
  blog: {
    title: {
      zhCN: "阳性不等于患病：一条数学如何拆掉一个直觉",
      en: "Positive Does Not Mean Sick: How One Formula Undoes an Instinct",
    },
    paragraphs: {
      zhCN: [
        "假设有一种病的患病率是 1%，有一种检测对患病者的检出率是 99%，对健康者的误报率也是 1%。现在一个人检出阳性——他真的患病的概率是多少？多数人的第一反应是 99%。真实答案是约 50%。",
        "算一遍就明白了：一万人里，100 人患病，其中 99 人检出阳性；同时 9900 人健康，其中 99 人被误报。阳性共 198 人，其中真患病 99 人。99/198 = 50%。检测器几乎没有出错，错的是我们对「阳性」这个词的解读——我们把 P(阳性|患病) 当成了 P(患病|阳性)。",
        "这就是基础率谬误。它的危险在于：基础率恰恰是**最难被察觉的那一项**，因为它来自背景知识，而现场的情绪只关心那个检测器有多准。疫情期间的筛查、招聘中的简历初筛、社交媒体上的算法推荐，全都是同一个结构。",
        "贝叶斯定理提供了一种持续的自我修正：每来一条新证据，就把先验更新一次。这与《易经》讲「变」是同一件事——判断不是一次性的结论，而是一个随证据移动的位置。真正理性的表现，不是不被直觉误导，而是**知道自己在哪一步会被误导**。",
      ],
      en: [
        "Suppose a disease affects 1% of people, and a test detects 99% of cases while falsely flagging 1% of healthy people. A person tests positive. What is the probability they are actually sick? Most people's first reflex says 99%. The correct answer is about 50%.",
        "Run the count: among 10,000 people, 100 are sick and 99 of them test positive; 9,900 are healthy and 99 of them are false positives. There are 198 positives, of whom 99 are truly sick: 99/198 = 50%. The detector is almost never wrong — what is wrong is our reading of “positive”. We mistake P(positive|sick) for P(sick|positive).",
        "This is base-rate neglect, and it is dangerous precisely because the base rate is the hardest thing to notice: it lives in background knowledge, while the emotion of the moment only cares how good the detector is. Pandemic screening, résumé filtering, algorithm feeds — one structure, endlessly.",
        "Bayes offers continuous self-correction: every new piece of evidence updates the prior. That is the same thing the I Ching means by change — judgement is not a conclusion but a position that moves with evidence. Rationality is not never being misled; it is knowing at which step you will be.",
      ],
    },
  },
  ppt: {
    title: {
      zhCN: "直觉为何总在撒谎 · 精炼讲义",
      en: "Why Intuition Keeps Lying · A Refined Deck",
    },
    slides: [
      {
        title: { zhCN: "一个万人实验", en: "A ten-thousand-person experiment" },
        bullets: {
          zhCN: [
            "患病率 1%，检测灵敏度 99%，误报率 1%",
            "一万人 → 100 患病，9,900 健康",
            "阳性 198 人，其中真患病 99 人",
          ],
          en: [
            "Prevalence 1%, sensitivity 99%, false-positive rate 1%",
            "10,000 people → 100 sick, 9,900 healthy",
            "198 positives, of whom 99 are truly sick",
          ],
        },
      },
      {
        title: { zhCN: "被调换的条件", en: "The swapped condition" },
        bullets: {
          zhCN: [
            "直觉算的是 P(阳性|患病) = 99%",
            "问题问的是 P(患病|阳性) ≈ 50%",
            "两个数都不是 100%，但差了一倍",
          ],
          en: [
            "Intuition computes P(positive|sick) = 99%",
            "The question asks P(sick|positive) ≈ 50%",
            "Neither is 100%, but one is double the other",
          ],
        },
      },
      {
        title: { zhCN: "基础率为什么最难察觉", en: "Why the base rate hides" },
        bullets: {
          zhCN: [
            "它来自背景知识，不在现场",
            "现场情绪只关心检测器的准度",
            "筛查、简历、推荐，全是同一个结构",
          ],
          en: [
            "It lives in background knowledge, not on the scene",
            "The emotion of the moment only measures the detector",
            "Screening, résumés, feeds — one structure",
          ],
        },
      },
      {
        title: { zhCN: "贝叶斯就是更新", en: "Bayes is updating" },
        bullets: {
          zhCN: [
            "先验 → 证据 → 后验 → 新先验",
            "判断不是结论，是随证据移动的位置",
            "《易经》讲「变」，讲的是同一件事",
          ],
          en: [
            "Prior → evidence → posterior → new prior",
            "Judgement is a position that moves with evidence",
            "The I Ching's “change” means the same",
          ],
        },
      },
      {
        title: { zhCN: "动手验证", en: "Try it yourself" },
        bullets: {
          zhCN: [
            "拖动基础概率，看粒子如何重新分组",
            "把误报率拉高，后验如何塌陷",
            "找到让后验跌破 50% 的误报率",
          ],
          en: [
            "Drag the prior and watch the particles re-sort",
            "Raise the false-positive rate, watch the posterior fall",
            "Find the false-positive rate that pushes it below 50%",
          ],
        },
      },
    ],
  },
  questions: [
    {
      stem: {
        zhCN:
          "一种病的患病率是 0.5%，检测灵敏度 99%，误报率 5%。阳性之后真正患病的概率最接近多少？",
        en:
          "A disease has prevalence 0.5%. A test is 99% sensitive with a 5% false-positive rate. After a positive result, the probability of actually being sick is closest to:",
      },
      options: {
        zhCN: ["约 99%", "约 90%", "约 9%", "约 50%"],
        en: ["about 99%", "about 90%", "about 9%", "about 50%"],
      },
      answer: 2,
      explain: {
        zhCN:
          "一万人中 50 人患病 → 约 50 人阳性；9950 人健康 → 约 498 人误报。阳性共 548 人，真患病 50 人，50/548 ≈ 9%。患病率越低、误报率越高，阳性就越不可信。",
        en:
          "Among 10,000, 50 are sick → about 50 positives; 9,950 healthy → about 498 false positives. Out of 548 positives, 50 are truly sick: 50/548 ≈ 9%. The lower the prevalence and the higher the false-positive rate, the less a positive means.",
      },
    },
    {
      stem: {
        zhCN:
          "在同一个总体里做两次独立检测，两次都是阳性。此时仍坚持「99% 准确」的人，最可能忽略了什么？",
        en:
          "Two independent tests in the same population both come back positive. The person who still says “99% accurate” is most likely ignoring:",
      },
      options: {
        zhCN: [
          "检测本身的硬件误差",
          "两次阳性的联合证据把后验推得更低（因为误报率是 5% 量级）",
          "样本量太小",
          "两次检测的时间间隔",
        ],
        en: [
          "Hardware error in the device",
          "The joint evidence of two positives pushes the posterior lower (the false-positive rate is 5%)",
          "The sample size being too small",
          "The interval between the two tests",
        ],
      },
      answer: 1,
      explain: {
        zhCN:
          "两次阳性后，仍是健康者的概率约为 0.05×0.05 = 0.25%。此时再谈「检测 99% 准」就是拿错了对偶事件。证据越多，误报的联合概率越小，后验反而更稳——但前提是你真的更新了。",
        en:
          "After two positives, the chance of still being healthy is about 0.05×0.05 = 0.25%. Quoting “99% accurate” now is using the wrong conditional. More evidence shrinks the joint false-positive probability — but only if you actually update.",
      },
    },
    {
      stem: {
        zhCN: "为什么「把基础率补回来」就能拆掉基础率谬误？",
        en:
          "Why does putting the base rate back dismantle base-rate neglect?",
      },
      options: {
        zhCN: [
          "因为基础率是可以测量的精确数字",
          "因为后验是「检测特征」与「人群构成」两条证据的联合，后者不能省略",
          "因为基础率与灵敏度无关",
          "因为基础率总是比灵敏度小",
        ],
        en: [
          "Because the base rate is a precisely measurable number",
          "Because the posterior joins two pieces of evidence — the test signature and the composition of the population — and the second cannot be dropped",
          "Because the base rate is unrelated to sensitivity",
          "Because the base rate is always smaller than sensitivity",
        ],
      },
      answer: 1,
      explain: {
        zhCN:
          "后验 = （在患病者中检测为阳性的比例 × 患病人数）÷ 阳性总人数。分母里同时包含「真阳性」和「假阳性」，而假阳性的人数直接由基础率决定。省略基础率，等于把分母算错。",
        en:
          "Posterior = (signals among the sick × how many are sick) ÷ total positives. The denominator holds both true and false positives, and the number of false positives is set by the base rate. Drop the base rate and the denominator is simply wrong.",
      },
    },
    {
      stem: {
        zhCN: "《易经》讲「变易」，用贝叶斯的语言重述，哪一句最贴近？",
        en:
          "The I Ching teaches change. Which statement restates it most closely in Bayesian language?",
      },
      options: {
        zhCN: [
          "先验一旦确定就不该改变",
          "判断必须随证据更新，固守先验就是拒绝学习",
          "变易指的是随机事件的不可预测性",
          "只要收集足够多的证据，就不再需要先验",
        ],
        en: [
          "Once a prior is set, it should never move",
          "Judgement must update with evidence; clinging to the prior is refusing to learn",
          "Change means random events are unpredictable",
          "With enough evidence, the prior stops mattering",
        ],
      },
      answer: 1,
      explain: {
        zhCN:
          "贝叶斯更新就是「先验 → 证据 → 后验 → 新先验」的循环：每一次经历都应当修正下一次出发时的判断。固守初始先验，等于宣称过去学到的经验不该影响未来——这正是「变则通」的反面。",
        en:
          "Bayesian updating is the loop prior → evidence → posterior → new prior: every experience should correct where you start next time. Clinging to the initial prior says past experience should not shape the future — the exact inverse of “change brings passage”.",
      },
    },
  ],
  labHint: {
    zhCN: "拖动基础概率与检测准确率，100 颗粒子实时重排，上方柱状条与后验数字同步联动。",
    en: "Drag the prior and the test accuracy — 100 particles re-sort live, with bars and the posterior updating.",
  },
  filmHint: {
    zhCN: "100 颗微光粒子按极低基础概率分色，穿过 99% 准确检测门后重排揭晓。",
    en: "100 faint particles split by a very low prior, pass a 99%-accurate gate, and re-sort to reveal the truth.",
  },
};

/** 三个专题的编辑层内容表。 */
export const FLAGSHIP_EDITORIALS: Record<string, FlagshipEditorial> = {
  "exp-comfort": EXP_COMFORT,
  "seq-zeno": SEQ_ZENO,
  "prob-bayes": PROB_BAYES,
};
