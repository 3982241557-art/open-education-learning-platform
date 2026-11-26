/**
 * 里程碑节点定义
 * ===============
 *
 * 八条数学逻辑链 × 每条八个里程碑节点 = **64 个核心节点**。
 *
 * 为什么要「提纯」
 * --------------
 *
 * os-taxonomy 原始图谱有 583 个数学节点、1289 条依赖边。直接把
 * 它铺在地图上，结果是**一片蜘蛛网**——几百个节点互相连线，
 * 节点标签互相遮挡，谁也看不出「该从哪儿开始学」。
 *
 * 所以这里做一次**人工提纯**：
 *
 * - 每条链只保留 **8 个**真正承重的里程碑；
 * - 每条链切成**三阶**（直觉启蒙 → 结构推导 → 综合建模），
 *   节点按「先直觉、再推导、最后建模」的因果次序排布；
 * - 相邻节点之间用**单向箭头**表达先后，不画任何交叉连线。
 *
 * ⛔ **每个节点的 ``sourceId`` 必须真实存在于 os-taxonomy**——
 *    这是「不编造」红线的物理保证。导入脚本会逐条校验。
 *
 * ⛔ **中文名与英文名由本文件显式给出**，不做自动匹配。
 *    之前的自动匹配把「Scatter Graphs」配成了「用图表示加减法」
 *    ——错得离谱。人工审定 64 组双语名，是这个规模下唯一靠谱的做法。
 */

/** 三阶因果位置。 */
export const TIERS = [
  { id: "intuition", no: "1", nameZh: "直觉启蒙", nameEn: "Intuition" },
  { id: "structure", no: "2", nameZh: "结构推导", nameEn: "Structure" },
  { id: "modeling", no: "3", nameZh: "综合建模", nameEn: "Modeling" },
];

/**
 * 八条逻辑链。
 *
 * 链名与次序是**教学次序**——不是学科分类的字母序。
 */
export const CHAIN_DEFS = [
  {
    id: "number-sense",
    no: "01",
    nameZh: "数感与数量结构",
    nameEn: "Number Sense & Quantity",
    accent: "number",
    domain: "Number Sense & Place Value",
    briefZh:
      "数位、计数、整数的大小结构——一切计算的地基。先把「数是多少」这件事彻底钉死，再谈运算。",
    briefEn:
      "Place value, counting and the structure of integers — the bedrock every calculation rests on.",
  },
  {
    id: "operations",
    no: "02",
    nameZh: "四则运算与算理",
    nameEn: "Four Operations & Reasoning",
    accent: "operation",
    domain: "Addition, Subtraction, Multiplication & Division",
    briefZh:
      "加减乘除的**意义**先于**算法**。竖式是熟练度的终点，不是起点。",
    briefEn:
      "Meaning before algorithm — column methods are the end of fluency, never the start.",
  },
  {
    id: "fractions-ratio",
    no: "03",
    nameZh: "分数、小数与比例",
    nameEn: "Fractions, Decimals & Ratio",
    accent: "fraction",
    domain: "Fractions, Decimals & Ratio",
    briefZh:
      "从「一个整体的几分之几」到比例与百分数——分数是数的语言第一次抽象化的地方。",
    briefEn:
      "From parts of a whole to ratio and percentage — where numbers first become abstract.",
  },
  {
    id: "measurement",
    no: "04",
    nameZh: "测量与图形认知",
    nameEn: "Measurement & Shape Sense",
    accent: "geometry",
    domain: "Measurement & Shape Sense",
    briefZh:
      "长度、面积、体积——所有几何的度量学根基，也是把抽象图形锚定到真实世界的第一根绳。",
    briefEn:
      "Length, area and volume — the metrological root of all geometry.",
  },
  {
    id: "geometry",
    no: "05",
    nameZh: "空间、角度与几何证明",
    nameEn: "Space, Angles & Proof",
    accent: "geometry",
    domain: "Geometry & Spatial Reasoning",
    briefZh:
      "三角形、圆、多边形与变换——从「看形状」走到「证形状」，几何证明是逻辑推理的第一战场。",
    briefEn:
      "Triangles, circles, polygons and transformations — from seeing shapes to proving them.",
  },
  {
    id: "algebra",
    no: "06",
    nameZh: "代数表达与方程平衡",
    nameEn: "Algebraic Expression & Equation Balance",
    accent: "algebra",
    domain: "Algebraic Expression & Equations",
    briefZh:
      "用字母表示未知数，把「平衡」变成可以动手称量的实物——等式是等量代换的语法。",
    briefEn:
      "Letters for unknowns, balance made physical — equations as the syntax of equivalence.",
  },
  {
    id: "functions-data",
    no: "07",
    nameZh: "坐标系与函数变化",
    nameEn: "Coordinates, Functions & Change",
    accent: "function",
    domain: "Coordinates, Functions & Data",
    briefZh:
      "从坐标到函数——把「变化」本身变成可以描点、可以拟合的对象。",
    briefEn:
      "From coordinates to functions — making change itself plottable.",
  },
  {
    id: "statistics-probability",
    no: "08",
    nameZh: "统计、概率与数据推断",
    nameEn: "Statistics, Probability & Inference",
    accent: "data",
    domain: "Statistics & Probability",
    briefZh:
      "收集、整理、读图、判断可能性——从「描述数据」走到「用数据下判断」。",
    briefEn:
      "Collecting, organising, reading charts and judging likelihood — from describing data to deciding with it.",
  },
];

/**
 * 64 个里程碑节点。
 *
 * 字段说明：
 *
 * - ``key``       稳定标识（``chainIndex``），用于程序内部引用；
 * - ``sourceId``  os-taxonomy 里的原始节点 id（红线：必须真实存在）；
 * - ``nameEn``    审定后的英文名；
 * - ``nameZh``    审定后的简体中文名；
 * - ``descZh``    审定后的中文说明（100% 专业中文，绝不夹生英文）；
 * - ``descEn``    对应的英文说明；
 * - ``tier``      所属三阶；
 * - ``lab``       挂载的自研实验台（最多一个）。
 */
export const MILESTONES = [
  /* ── 链 01 · 数感与数量结构 ──────────────────────────────────── */
  {
    key: "01-1",
    sourceId: "mt_WcfaSfVT33",
    tier: "intuition",
    nameEn: "One-to-One Counting",
    nameZh: "一对一对应点数",
    descZh: "每个物品只配一个标记，点一个数一个。数量感的第一块基石。",
    descEn:
      "Each object gets exactly one mark — count one, mark one. The first stone of number sense.",
    lab: "one-to-one-counting",
  },
  {
    key: "01-2",
    sourceId: "mt__h7hvT4tEb",
    tier: "intuition",
    nameEn: "Comparing: More, Fewer, Equal",
    nameZh: "比较数量：多、少、一样多",
    descZh: "两堆东西并排放，用配对的方式判断谁多谁少、多出几个。",
    descEn:
      "Lay two piles side by side and pair them off to see who has more, fewer, or the same.",
    lab: "quantity-compare",
  },
  {
    key: "01-3",
    sourceId: "mt_uhuxX8sg9f",
    tier: "intuition",
    nameEn: "Comparing Lengths & Heights",
    nameZh: "基准线上的长短与高矮",
    descZh: "起点没对齐，长短就看错。先对齐起点，再谈比较。",
    descEn:
      "Misaligned starts give misleading lengths. Align the origins first, then compare.",
    lab: "baseline-length",
  },
  {
    key: "01-4",
    sourceId: "mt_BK5xwkrD5C",
    tier: "structure",
    nameEn: "Seeing the Parts Within Ten",
    nameZh: "看见 10 以内的部分",
    descZh: "把一个整体拆成几份再合回去——分与合是数的两种看法。",
    descEn:
      "Break a whole into parts and put it back together — splitting and combining are two views of one number.",
    lab: "make-ten-snap",
  },
  {
    key: "01-5",
    sourceId: "mt_r0VXbfAmsH",
    tier: "structure",
    nameEn: "A Ten Is Ten Ones",
    nameZh: "十根一捆就是一位",
    descZh: "满十根捆成一束，为什么 14 是「一捆十加四根」。",
    descEn:
      "Ten singles bind into one bundle — this is why 14 is one ten and four ones.",
    lab: "bundle-of-ten",
  },
  {
    key: "01-6",
    sourceId: "mt_kJGCjnuelW",
    tier: "structure",
    nameEn: "Place Value & Number Facts",
    nameZh: "位值与数的结构",
    descZh: "同一个数字站在不同的位上，表示的大小完全不同。",
    descEn:
      "The same digit in a different place stands for a completely different amount.",
    lab: "number-line-jump",
  },
  {
    key: "01-7",
    sourceId: "mt_U0waNfD8PB",
    tier: "modeling",
    nameEn: "Comparing and Ordering Numbers",
    nameZh: "比较数的大小与排序",
    descZh: "用位值而不是「数位个数」来判断 58 与 83 谁大。",
    descEn:
      "Use place value, not the number of digits, to decide whether 58 or 83 is larger.",
    lab: null,
  },
  {
    key: "01-8",
    sourceId: "mt_0u4KLbvBa1",
    tier: "modeling",
    nameEn: "Odd and Even Numbers",
    nameZh: "奇数与偶数",
    descZh: "能不能两个两个正好分完——从摆实物到说规则。",
    descEn:
      "Can they be shared out two by two with nothing left — from laying out objects to stating the rule.",
    lab: null,
  },

  /* ── 链 02 · 四则运算与算理 ──────────────────────────────────── */
  {
    key: "02-1",
    sourceId: "mt_OvyoRo47K-",
    tier: "intuition",
    nameEn: "Addition as Combining",
    nameZh: "加法的含义：合起来",
    descZh: "把两堆东西并到一起，一共有多少。",
    descEn: "Put two piles together — how many altogether?",
    lab: "quantity-compare",
  },
  {
    key: "02-2",
    sourceId: "mt_zuKAX6lcYR",
    tier: "intuition",
    nameEn: "Subtraction as Taking Away",
    nameZh: "减法的含义：拿走或分开",
    descZh: "从一堆里拿走一些，或者把一堆分成两部分。",
    descEn: "Take some away from a pile, or split a pile into two parts.",
    lab: "quantity-compare",
  },
  {
    key: "02-3",
    sourceId: "mt_PZ909yPrEC",
    tier: "structure",
    nameEn: "Multiplication as Repeated Addition",
    nameZh: "乘法是重复加法",
    descZh: "几个相同的数加起来，就是乘。",
    descEn: "Adding the same number several times is what multiplying is.",
    lab: "make-ten-snap",
  },
  {
    key: "02-4",
    sourceId: "mt_LpSuPgL31x",
    tier: "structure",
    nameEn: "Division as Equal Sharing",
    nameZh: "除法的含义：平均分",
    descZh: "把同样的东西分给同样多的人，每人分到几个。",
    descEn: "Share the same amount among the same number of people — how many each?",
    lab: "bundle-of-ten",
  },
  {
    key: "02-5",
    sourceId: "mt_HhuSDxwDNM",
    tier: "structure",
    nameEn: "Times Tables",
    nameZh: "乘法口诀",
    descZh: "九九表不是背出来的，是从乘法的意义里长出来的。",
    descEn: "The times table grows out of the meaning of multiplication, not out of memory.",
    lab: "make-ten-snap",
  },
  {
    key: "02-6",
    sourceId: "mt_oIzycTBeE4",
    tier: "structure",
    nameEn: "What the Equals Sign Means",
    nameZh: "等号意味着什么",
    descZh: "等号是「两边一样重」的跷跷板，不是「答案在这里」。",
    descEn:
      "The equals sign is a balanced see-saw, not a 'the answer is here' arrow.",
    lab: "algebra-balance",
  },
  {
    key: "02-7",
    sourceId: "mt_p-nbe0w_lf",
    tier: "modeling",
    nameEn: "Division with Remainders",
    nameZh: "有余数的除法",
    descZh: "分不完的时候，剩下的那几个怎么算。",
    descEn: "When it does not divide evenly, what do the leftovers mean?",
    lab: null,
  },
  {
    key: "02-8",
    sourceId: "mt_QaYfeVL-0C",
    tier: "modeling",
    nameEn: "Estimating by Rounding",
    nameZh: "用取整来估算",
    descZh: "先估一个大概值，再判断算得对不对。",
    descEn: "Get a rough value first, then use it to check the exact one.",
    lab: "number-line-jump",
  },

  /* ── 链 03 · 分数、小数与比例 ────────────────────────────────── */
  {
    key: "03-1",
    sourceId: "mt_-hTTat0mBR",
    tier: "intuition",
    nameEn: "What Is a Half?",
    nameZh: "什么是二分之一",
    descZh: "把一个整体平均分成两份，取其中一份。",
    descEn: "Split one whole into two equal parts and take one of them.",
    lab: "make-ten-snap",
  },
  {
    key: "03-2",
    sourceId: "mt_ndGqFPWyen",
    tier: "intuition",
    nameEn: "Fractions of a Whole",
    nameZh: "整体的几分之几",
    descZh: "分母决定切几份，分子决定取几份。",
    descEn: "The denominator says how many parts; the numerator says how many you take.",
    lab: "make-ten-snap",
  },
  {
    key: "03-3",
    sourceId: "mt_vKcxX6iNOA",
    tier: "structure",
    nameEn: "Fraction Notation",
    nameZh: "分数的写法与读法",
    descZh: "分数线上下两个数，各有各的含义。",
    descEn: "The two numbers above and below the bar each mean something specific.",
    lab: "make-ten-snap",
  },
  {
    key: "03-4",
    sourceId: "mt_Kr3IyA6m-O",
    tier: "structure",
    nameEn: "Fractions on a Number Line",
    nameZh: "数轴上的分数",
    descZh: "把分数放回数轴，它才有大小。",
    descEn: "Put a fraction back on the number line and it regains its size.",
    lab: "number-line-jump",
  },
  {
    key: "03-5",
    sourceId: "mt_FbDKeLfBCo",
    tier: "structure",
    nameEn: "Equivalent Fractions",
    nameZh: "等值分数",
    descZh: "切法不同，占的份一样多。",
    descEn: "Different cuts, the same amount taken.",
    lab: "number-line-jump",
  },
  {
    key: "03-6",
    sourceId: "mt_CBHwluE6Lp",
    tier: "modeling",
    nameEn: "Adding Fractions (Same Denominator)",
    nameZh: "同分母分数加法",
    descZh: "分母不变，直接加分子。",
    descEn: "The denominator stays put; only the numerators add.",
    lab: "make-ten-snap",
  },
  {
    key: "03-7",
    sourceId: "mt_W17Kbwm0-u",
    tier: "modeling",
    nameEn: "Decimals and Percentages",
    nameZh: "小数与百分数的互化",
    descZh: "同一个数的三种写法：分数、小数、百分数。",
    descEn: "Three notations for one number: fraction, decimal, percentage.",
    lab: "number-line-jump",
  },
  {
    key: "03-8",
    sourceId: "mt_5mIcmKRCgA",
    tier: "modeling",
    nameEn: "Proportion",
    nameZh: "比例",
    descZh: "两个比相等，就构成比例。",
    descEn: "When two ratios are equal, they form a proportion.",
    lab: null,
  },

  /* ── 链 04 · 测量与图形认知 ──────────────────────────────────── */
  {
    key: "04-1",
    sourceId: "mt_DOe893F6gN",
    tier: "intuition",
    nameEn: "Choosing Measurement Units",
    nameZh: "选择合适的度量单位",
    descZh: "量书本用厘米，量操场用米——单位选错，数字就没意义。",
    descEn:
      "Centimetres for a book, metres for a field — the wrong unit makes the number meaningless.",
    lab: "baseline-length",
  },
  {
    key: "04-2",
    sourceId: "mt_e4x3l2JeLI",
    tier: "intuition",
    nameEn: "Measuring Length",
    nameZh: "测量长度",
    descZh: "把尺子的零刻度对准起点，贴着边读数。",
    descEn: "Line up the zero mark with the start, hug the edge, and read.",
    lab: "baseline-length",
  },
  {
    key: "04-3",
    sourceId: "mt_y1n0Zwhoca",
    tier: "intuition",
    nameEn: "Area",
    nameZh: "面积",
    descZh: "铺满一块地面需要多少个单位方块。",
    descEn: "How many unit squares tile the surface?",
    lab: "geometry-protractor",
  },
  {
    key: "04-4",
    sourceId: "mt_wE7-Gs9ENL",
    tier: "structure",
    nameEn: "Measuring Perimeters",
    nameZh: "测量周长",
    descZh: "绕着图形走一圈有多长。",
    descEn: "Walk once around the shape — how far did you go?",
    lab: "geometry-protractor",
  },
  {
    key: "04-5",
    sourceId: "mt_nTL-owFJTF",
    tier: "structure",
    nameEn: "Volume of Cuboids",
    nameZh: "长方体的体积",
    descZh: "一层一层铺满，需要多少个单位小方块。",
    descEn: "Layer by layer, how many unit cubes fill it?",
    lab: null,
  },
  {
    key: "04-6",
    sourceId: "mt_eiB3-6pu6a",
    tier: "structure",
    nameEn: "Area and Perimeter of Rectangles",
    nameZh: "长方形的面积与周长",
    descZh: "同一个长方形，面积和周长是两件不同的事。",
    descEn: "For one rectangle, area and perimeter are two different questions.",
    lab: "geometry-protractor",
  },
  {
    key: "04-7",
    sourceId: "mt_ML5t7n2-U8",
    tier: "modeling",
    nameEn: "Area of Triangles & Parallelograms",
    nameZh: "三角形与平行四边形的面积",
    descZh: "两个一样的三角形拼成一个平行四边形。",
    descEn: "Two identical triangles make one parallelogram.",
    lab: "geometry-protractor",
  },
  {
    key: "04-8",
    sourceId: "mt_d8al9JcajP",
    tier: "modeling",
    nameEn: "Converting Measurement Units",
    nameZh: "单位换算",
    descZh: "米和厘米之间，到底是几倍的关系。",
    descEn: "Between metres and centimetres, what exactly is the factor?",
    lab: null,
  },

  /* ── 链 05 · 空间、角度与几何证明 ────────────────────────────── */
  {
    key: "05-1",
    sourceId: "mt_KJeEeTutJI",
    tier: "intuition",
    nameEn: "Recognising 2-D Shapes",
    nameZh: "认识平面图形",
    descZh: "按边与角的特征，把图形分类。",
    descEn: "Sort shapes by the features of their edges and angles.",
    lab: "geometry-protractor",
  },
  {
    key: "05-2",
    sourceId: "mt_qUGMyMYn9m",
    tier: "intuition",
    nameEn: "Degrees and Turns",
    nameZh: "角度与旋转",
    descZh: "转半圈是 180 度，转一整圈是 360 度。",
    descEn: "Half a turn is 180 degrees; a full turn is 360.",
    lab: "geometry-protractor",
  },
  {
    key: "05-3",
    sourceId: "mt_cdMlC7EpTJ",
    tier: "structure",
    nameEn: "Angles in Triangles",
    nameZh: "三角形里的角",
    descZh: "拖动三个顶点，三个内角实时变化。",
    descEn: "Drag the three vertices and watch the three interior angles move.",
    lab: "geometry-protractor",
  },
  {
    key: "05-4",
    sourceId: "mt_J03RFlVdas",
    tier: "structure",
    nameEn: "Angle Sums in Triangles and Polygons",
    nameZh: "三角形与多边形的内角和",
    descZh: "内角和恒等于 180 度，这是可以证明的。",
    descEn: "The interior angles always sum to 180 — and that can be proved.",
    lab: "geometry-protractor",
  },
  {
    key: "05-5",
    sourceId: "mt_u23IGDxOpk",
    tier: "structure",
    nameEn: "Parallel and Perpendicular Lines",
    nameZh: "平行与垂直",
    descZh: "两条线永不相交，是平行；相交成直角，是垂直。",
    descEn: "Never meeting is parallel; meeting at a right angle is perpendicular.",
    lab: "geometry-protractor",
  },
  {
    key: "05-6",
    sourceId: "mt_hR2Y7NhMSY",
    tier: "modeling",
    nameEn: "Lines of Symmetry",
    nameZh: "对称轴",
    descZh: "沿这条线折过去，两边完全重合。",
    descEn: "Fold along this line and the two halves match exactly.",
    lab: "geometry-protractor",
  },
  {
    key: "05-7",
    sourceId: "mt_svFa6_mjO_",
    tier: "modeling",
    nameEn: "Circles: Circumference & Area",
    nameZh: "圆的周长与面积",
    descZh: "把圆剪开摊平，它几乎就是一个长方形。",
    descEn: "Cut a circle open and flatten it — it is almost a rectangle.",
    lab: "geometry-protractor",
  },
  {
    key: "05-8",
    sourceId: "mt_1VmTUxBrNd",
    tier: "modeling",
    nameEn: "Applying Pythagoras' Theorem",
    nameZh: "勾股定理",
    descZh: "两条直角边平方相加，等于斜边的平方。",
    descEn: "The squares on the two legs add to the square on the hypotenuse.",
    lab: "geometry-protractor",
  },

  /* ── 链 06 · 代数表达与方程平衡 ───────────────────────────────── */
  {
    key: "06-1",
    sourceId: "mt_8RmpkDxT9L",
    tier: "intuition",
    nameEn: "Reading +, − and = Symbols",
    nameZh: "读懂加减与等号",
    descZh: "符号是操作的速记，读懂它才能算得对。",
    descEn: "Symbols are shorthand for actions — read them correctly or compute wrongly.",
    lab: "algebra-balance",
  },
  {
    key: "06-2",
    sourceId: "mt_H4BfdHIdhD",
    tier: "intuition",
    nameEn: "What a Symbol Stands For",
    nameZh: "字母代表什么",
    descZh: "同一个字母在不同的盘子里代表不同的数。",
    descEn: "The same letter stands for a different number on each pan.",
    lab: "algebra-balance",
  },
  {
    key: "06-3",
    sourceId: "mt_i9rJbuFO3p",
    tier: "structure",
    nameEn: "Writing Algebraic Equations",
    nameZh: "列代数方程",
    descZh: "把「平衡」翻译成含字母的等式。",
    descEn: "Translate a balance into an equation with a letter in it.",
    lab: "algebra-balance",
  },
  {
    key: "06-4",
    sourceId: "mt_QhFEDyIwSO",
    tier: "structure",
    nameEn: "Solving Linear Equations",
    nameZh: "解一元一次方程",
    descZh: "天平上两边同时做同一件事，等式依然成立。",
    descEn: "Doing the same thing to both pans keeps the balance true.",
    lab: "algebra-balance",
  },
  {
    key: "06-5",
    sourceId: "mt_nNNVrLqPW3",
    tier: "structure",
    nameEn: "Collecting Like Terms",
    nameZh: "合并同类项",
    descZh: "把相同的项并到一起，数一数有几个。",
    descEn: "Gather the matching terms together and count them.",
    lab: "algebra-balance",
  },
  {
    key: "06-6",
    sourceId: "mt_FX4a2Q8XXN",
    tier: "modeling",
    nameEn: "Expanding Single Brackets",
    nameZh: "去括号",
    descZh: "括号乘进去，每一项都要乘到。",
    descEn: "Multiply the bracket through — every term inside gets multiplied.",
    lab: "algebra-balance",
  },
  {
    key: "06-7",
    sourceId: "mt_uESbzWCZIq",
    tier: "modeling",
    nameEn: "Factorising Expressions",
    nameZh: "因式分解",
    descZh: "把展开的式子重新收拢回括号。",
    descEn: "Gather an expanded expression back into brackets.",
    lab: "algebra-balance",
  },
  {
    key: "06-8",
    sourceId: "mt_mqgu72aCMz",
    tier: "modeling",
    nameEn: "Simultaneous Equations",
    nameZh: "二元一次方程组",
    descZh: "两个未知数，两条平衡关系，联立求解。",
    descEn: "Two unknowns, two balances — solve them together.",
    lab: "algebra-balance",
  },

  /* ── 链 07 · 坐标系与函数变化 ────────────────────────────────── */
  {
    key: "07-1",
    sourceId: "mt_oDlduFnemk",
    tier: "intuition",
    nameEn: "The Coordinate Grid",
    nameZh: "平面直角坐标系",
    descZh: "两条垂直的数轴，把平面分成四个象限。",
    descEn: "Two perpendicular number axes split the plane into four quadrants.",
    lab: "function-studio",
  },
  {
    key: "07-2",
    sourceId: "mt_jBQS-CicNn",
    tier: "intuition",
    nameEn: "First Quadrant Coordinates",
    nameZh: "第一象限里的点",
    descZh: "先横后竖，从原点出发找到那个点。",
    descEn: "Across first, then up — find the point from the origin.",
    lab: "function-studio",
  },
  {
    key: "07-3",
    sourceId: "mt_snlqRCiA1R",
    tier: "structure",
    nameEn: "Plotting Points in the First Quadrant",
    nameZh: "在坐标系上描点",
    descZh: "把每一个有序数对钉在对应的位置。",
    descEn: "Pin each ordered pair to its spot on the grid.",
    lab: "function-studio",
  },
  {
    key: "07-4",
    sourceId: "mt_K0Y15w48SY",
    tier: "structure",
    nameEn: "Coordinate Transformations",
    nameZh: "坐标变换",
    descZh: "平移、翻转、旋转——图形上的点怎么跟着动。",
    descEn: "Slide, flip, turn — how the points of a shape move with it.",
    lab: "function-studio",
  },
  {
    key: "07-5",
    sourceId: "mt_WBdHkc2HTf",
    tier: "structure",
    nameEn: "Linear Function Graphs",
    nameZh: "一次函数的图像",
    descZh: "一条直线，斜率就是变化快慢。",
    descEn: "A straight line — and its slope is the rate of change.",
    lab: "function-studio",
  },
  {
    key: "07-6",
    sourceId: "mt_GZuoYaDdWd",
    tier: "modeling",
    nameEn: "Quadratic Graphs",
    nameZh: "二次函数的图像",
    descZh: "开口方向、顶点位置、变化的两端。",
    descEn: "Which way it opens, where the vertex sits, how it changes.",
    lab: "function-studio",
  },
  {
    key: "07-7",
    sourceId: "mt_BdAeZJUOir",
    tier: "modeling",
    nameEn: "Scatter Graphs",
    nameZh: "散点图",
    descZh: "一团点里藏着的走向。",
    descEn: "The trend hidden inside a cloud of points.",
    lab: "function-studio",
  },
  {
    key: "07-8",
    sourceId: "mt_8atyuvPUZc",
    tier: "modeling",
    nameEn: "Scatter Graphs & Correlation",
    nameZh: "散点图与相关性",
    descZh: "点越贴近一条直线，相关越强。",
    descEn: "The closer the points hug a line, the stronger the correlation.",
    lab: "function-studio",
  },

  /* ── 链 08 · 统计、概率与数据推断 ────────────────────────────── */
  {
    key: "08-1",
    sourceId: "mt_xppl18avyY",
    tier: "intuition",
    nameEn: "Sorting into Categories",
    nameZh: "把数据分类",
    descZh: "杂乱的数据先分堆，才谈得上观察。",
    descEn: "Sort the mess into piles before you can read anything from it.",
    lab: "function-studio",
  },
  {
    key: "08-2",
    sourceId: "mt_c29FaCTNsx",
    tier: "intuition",
    nameEn: "Pictograms and Tally Charts",
    nameZh: "象形图与统计表",
    descZh: "用符号计数，用表格归位。",
    descEn: "Count with symbols, then lay it all out in a table.",
    lab: "function-studio",
  },
  {
    key: "08-3",
    sourceId: "mt_ryyJWULiP5",
    tier: "structure",
    nameEn: "Finding the Mode",
    nameZh: "找众数",
    descZh: "出现次数最多的那个数。",
    descEn: "The value that shows up most often.",
    lab: "function-studio",
  },
  {
    key: "08-4",
    sourceId: "mt_Cg8VPguS_V",
    tier: "structure",
    nameEn: "Calculating the Mean",
    nameZh: "计算平均数",
    descZh: "总数除以份数——但平均数会被极端值拽走。",
    descEn: "Total divided by count — but the mean gets dragged by outliers.",
    lab: "function-studio",
  },
  {
    key: "08-5",
    sourceId: "mt_qwFJvRRucu",
    tier: "structure",
    nameEn: "Finding the Median",
    nameZh: "找中位数",
    descZh: "排在正中间的那个数，不受极端值影响。",
    descEn: "The value in the middle — untouched by outliers.",
    lab: "function-studio",
  },
  {
    key: "08-6",
    sourceId: "mt_vmQJAtAFuy",
    tier: "modeling",
    nameEn: "The Probability Scale",
    nameZh: "概率刻度",
    descZh: "从「绝不可能」到「必然发生」，中间是可能。",
    descEn: "From 'impossible' to 'certain', with the possible in between.",
    lab: null,
  },
  {
    key: "08-7",
    sourceId: "mt_3fwYu7imd4",
    tier: "modeling",
    nameEn: "Probabilities Sum to One",
    nameZh: "所有可能结果的概率之和为一",
    descZh: "每一种结果的可能性加起来，正好是一。",
    descEn: "Add up the likelihood of every outcome and you get exactly one.",
    lab: null,
  },
  {
    key: "08-8",
    sourceId: "mt_SHVyE1CLUa",
    tier: "modeling",
    nameEn: "Planning a Statistical Investigation",
    nameZh: "规划一次统计调查",
    descZh: "先想清楚要回答什么问题，再决定怎么收集数据。",
    descEn:
      "Decide the question first; only then decide how to gather the data.",
    lab: null,
  },
];
