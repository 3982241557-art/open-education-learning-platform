/**
 * K12 真实内容知识库 · 数学知识点
 * ================================
 *
 * 按**真实教材顺序**覆盖小学到高中。
 *
 * 每一条提供：
 *
 * - ``definition`` —— 真实定义（用于知识节点与总结）；
 * - ``prerequisite`` —— 前置诊断题（**能真正做出来**）；
 * - ``transfer`` —— 迁移题（**能真正想出来**）。
 *
 * ⚠️ 两道题都不是自评表。旧版的「你理解到哪一步了」在这里被
 *    彻底废除——那种题不测任何东西。
 */


/** 数学知识点库。 */
export const MATH_TOPICS = [
  {
    key: "认识平面图形",
    title: "认识平面图形",
    definition:
      "认识长方形、正方形、三角形、圆等平面图形，能用立体图形（长方体、正方体、圆柱、球）搭出简单物体。",
    prerequisite: {
      question: "下面哪个图形**不能**用 4 根同样长的小棒拼成？",
      options: ["正方形", "长方形（非正方形）", "三角形"],
      correctIndex: 2,
      explanation:
        "三角形有三条边，需要 3 根棒；四边形的四个角是直角，用 4 根**同样长**的棒只能拼成正方形，拼不出非正方形的长方形。答案是三角形。",
    },
    transfer: {
      question: "用 6 根同样长的小棒，最多能拼出几个**不同的**平面图形？",
      options: ["1 个", "2 个", "3 个"],
      correctIndex: 1,
      explanation:
        "6 根等长小棒可以拼出长方形（3+3）、等边三角形（3+3）、正六边形（6 根）等多种平面图形，不同类别至少 2 种。答案是 2 个。",
    },
  },
  {
    key: "十几减",
    title: "十几减几（凑十法）",
    definition:
      "十几减几用「破十法」或「凑十法」计算：把十几拆成 10 和几，先用 10 减去个位上的数，再加上十位上的数。",
    prerequisite: {
      question: "13 - 8 等于多少？",
      options: ["4", "5", "6"],
      correctIndex: 1,
      explanation:
        "凑十法：8 分成 3 和 5，13 - 3 = 10，10 - 5 = 5。答案是 5。",
    },
    transfer: {
      question: "小刚有 15 颗糖，给了弟弟 7 颗，他还剩几颗？",
      options: ["7 颗", "8 颗", "9 颗"],
      correctIndex: 1,
      explanation:
        "15 - 7：把 7 分成 5 和 2，15 - 5 = 10，10 - 2 = 8。答案是 8 颗。",
    },
  },
  {
    key: "加法和减法",
    title: "两位数加减法",
    definition:
      "两位数加两位数（进位）与两位数减两位数（退位），列竖式时相同数位对齐，从个位算起。",
    prerequisite: {
      question: "一个数加上 27 等于 45，这个数是多少？",
      options: ["18", "22", "72"],
      correctIndex: 0,
      explanation:
        "用逆运算：45 - 27 = 18。验算：18 + 27 = 45。答案是 18。",
    },
    transfer: {
      question: "图书角有 38 本书，借出 15 本，又还回 6 本。现在有多少本？",
      options: ["23 本", "29 本", "31 本"],
      correctIndex: 1,
      explanation:
        "38 - 15 + 6 = 23 + 6 = 29。答案是 29 本。",
    },
  },
  {
    key: "乘法",
    title: "乘法与乘法口诀",
    definition:
      "乘法是几个相同加数相加的简便运算。乘法口诀表按「几几得几」排列，是整数乘除法的基础。",
    prerequisite: {
      question: "7 × 8 等于多少？",
      options: ["54", "56", "63"],
      correctIndex: 1,
      explanation: "口诀「七八五十六」，所以 7 × 8 = 56。",
    },
    transfer: {
      question: "一个长方形的长是 9 厘米，宽是 4 厘米。它的周长是多少厘米？",
      options: ["13 厘米", "26 厘米", "36 厘米"],
      correctIndex: 1,
      explanation:
        "周长 = (长 + 宽) × 2 = (9 + 4) × 2 = 26 厘米。面积才是 9 × 4 = 36 平方厘米。答案是 26 厘米。",
    },
  },
  {
    key: "除法",
    title: "除法与平均分",
    definition:
      "把一个整体平均分成若干份，每份是多少，用除法计算。除法的意义是「已知总数和份数，求每份」。",
    prerequisite: {
      question: "42 个苹果平均装进 6 个箱子，每箱装几个？",
      options: ["6 个", "7 个", "8 个"],
      correctIndex: 1,
      explanation: "42 ÷ 6 = 7，因为 6 × 7 = 42。答案是 7 个。",
    },
    transfer: {
      question:
        "有 24 本书，要平均分给 8 个同学，每人分几本？如果改成 6 个同学呢？",
      options: ["3 本；4 本", "4 本；3 本", "每人都是 3 本"],
      correctIndex: 1,
      explanation:
        "24 ÷ 8 = 3（本）；24 ÷ 6 = 4（本）。总数不变，份数越多每份越少。答案是 4 本；3 本。",
    },
  },
  {
    key: "分数",
    title: "分数的意义与计算",
    definition:
      "把单位「1」平均分成若干份，表示这样一份或几份的数叫分数。分母是平均分的份数，分子是取的份数。",
    prerequisite: {
      question: "把一张纸对折三次，展开后一共分成几份？",
      options: ["3 份", "6 份", "8 份"],
      correctIndex: 2,
      explanation:
        "对折 1 次 2 份，2 次 4 份，3 次 8 份。这是理解「平均分」最直观的模型。答案是 8 份。",
    },
    transfer: {
      question: "一根绳子长 12 米，剪去它的 1/4，剪去多少米？",
      options: ["2 米", "3 米", "4 米"],
      correctIndex: 1,
      explanation: "12 × 1/4 = 3 米。求一个数的几分之一，用乘法。答案是 3 米。",
    },
  },
  {
    key: "比",
    title: "比与比例",
    definition:
      "两个数相除又叫做两个数的比。a : b = a ÷ b = a/b（b ≠ 0）。表示两个比相等的式子叫比例。",
    prerequisite: {
      question: "化简 12 : 18 的最简整数比是多少？",
      options: ["2 : 3", "3 : 2", "4 : 6"],
      correctIndex: 0,
      explanation:
        "12 和 18 的最大公因数是 6，同除以 6 得 2 : 3。答案是 2 : 3。",
    },
    transfer: {
      question: "一种糖水，糖与水的比是 1 : 9。如果有 20 克糖，水有多少克？",
      options: ["100 克", "180 克", "200 克"],
      correctIndex: 1,
      explanation:
        "糖 : 水 = 1 : 9，20 克糖对应 9 份水，水 = 20 × 9 = 180 克。答案是 180 克。",
    },
  },
  {
    key: "小数",
    title: "小数的意义与运算",
    definition:
      "把整体平均分成 10、100、1000……份，可以用一位、两位、三位小数表示。计算小数乘法要先按整数乘，再看因数中一共有几位小数，就从积的右边数出几位点上小数点。",
    prerequisite: {
      question: "0.7 × 0.3 等于多少？",
      options: ["0.21", "0.021", "2.1"],
      correctIndex: 0,
      explanation:
        "先按整数算 7 × 3 = 21，两个因数一共 2 位小数，从 21 右边数出 2 位点上小数点，得 0.21。答案是 0.21。",
    },
    transfer: {
      question: "每千克苹果 6.5 元，买 4 千克要多少元？",
      options: ["26 元", "24.5 元", "260 元"],
      correctIndex: 0,
      explanation: "6.5 × 4 = 26（元）。验算：26 ÷ 4 = 6.5。答案是 26 元。",
    },
  },
  {
    key: "周长",
    title: "周长与面积",
    definition:
      "周长是封闭图形一周的长度；面积是物体所占平面的大小。周长单位是长度单位，面积单位是平方单位。",
    prerequisite: {
      question: "一个长 8 厘米、宽 5 厘米的长方形，面积是多少平方厘米？",
      options: ["13 平方厘米", "26 平方厘米", "40 平方厘米"],
      correctIndex: 2,
      explanation:
        "面积 = 长 × 宽 = 8 × 5 = 40（平方厘米）。13 是半周长，26 才是周长。答案是 40 平方厘米。",
    },
    transfer: {
      question: "一个正方形的周长是 24 厘米，它的面积是多少平方厘米？",
      options: ["6 平方厘米", "24 平方厘米", "36 平方厘米"],
      correctIndex: 2,
      explanation:
        "边长 = 周长 ÷ 4 = 24 ÷ 4 = 6 厘米，面积 = 6 × 6 = 36（平方厘米）。答案是 36 平方厘米。",
    },
  },
  {
    key: "面积",
    title: "组合图形的面积",
    definition:
      "组合图形的面积可以分割成几个基本图形（长方形、正方形、三角形、圆）分别求面积再相加。",
    prerequisite: {
      question:
        "一个边长 6 厘米的正方形，剪去一个边长 2 厘米的小正方形，剩下部分的面积是多少平方厘米？",
      options: ["32 平方厘米", "36 平方厘米", "40 平方厘米"],
      correctIndex: 0,
      explanation:
        "大正方形面积 6 × 6 = 36，小正方形 2 × 2 = 4，剩下 36 - 4 = 32（平方厘米）。答案是 32 平方厘米。",
    },
    transfer: {
      question:
        "一个长方形长 10 米、宽 6 米。在它内部画一条直线分成两个完全相同的小长方形，每个小长方形的面积是多少平方米？",
      options: ["30 平方米", "60 平方米", "16 平方米"],
      correctIndex: 0,
      explanation:
        "总面积 = 10 × 6 = 60（平方米），平分后每个 = 60 ÷ 2 = 30（平方米）。答案是 30 平方米。",
    },
  },
  {
    key: "三角形",
    title: "三角形的特性",
    definition:
      "三角形有 3 条边、3 个角、3 个顶点。任意两边之和大于第三边；内角和是 180°。三角形按角分为锐角、直角、钝角三角形。",
    prerequisite: {
      question: "三角形的内角和是多少度？",
      options: ["90°", "180°", "360°"],
      correctIndex: 1,
      explanation:
        "三角形的内角和等于 180°。用两个三角形的内角拼成平角即可证明。答案是 180°。",
    },
    transfer: {
      question:
        "一个三角形中，最大的角是 100°。这个三角形是什么三角形？另外两个角的和是多少度？",
      options: [
        "锐角三角形；80°",
        "钝角三角形；80°",
        "钝角三角形；180°",
      ],
      correctIndex: 1,
      explanation:
        "有一个角大于 90° 就是钝角三角形；其余两角和 = 180° - 100° = 80°。答案是钝角三角形；80°。",
    },
  },
  {
    key: "平行四边形",
    title: "平行四边形与梯形",
    definition:
      "两组对边分别平行的四边形叫平行四边形；只有一组对边平行的四边形叫梯形。平行四边形的对边相等、对角相等，邻角互补。",
    prerequisite: {
      question: "平行四边形的对角有什么关系？",
      options: [
        "对角相等，邻角也相等",
        "对角相等，邻角互补",
        "对角互补，邻角也相等",
      ],
      correctIndex: 1,
      explanation:
        "平行四边形中，对角相等，邻角互补（和为 180°）。这是它与长方形（四个角全相等）的主要区别。",
    },
    transfer: {
      question: "平行四边形的一个内角是 70°，它的相邻内角是多少度？",
      options: ["70°", "110°", "140°"],
      correctIndex: 1,
      explanation: "邻角互补：180° - 70° = 110°。答案是 110°。",
    },
  },
  {
    key: "圆",
    title: "圆与扇形",
    definition:
      "圆是平面上到定点的距离等于定长的所有点组成的图形。圆的周长 C = πd = 2πr；面积 S = πr²。扇形是圆的一部分，由圆心角和两条半径围成。",
    prerequisite: {
      question: "一个圆的半径是 4 厘米，它的直径是多少厘米？",
      options: ["2 厘米", "4 厘米", "8 厘米"],
      correctIndex: 2,
      explanation: "直径 = 半径 × 2 = 4 × 2 = 8 厘米。答案是 8 厘米。",
    },
    transfer: {
      question: "一个圆的半径扩大到原来的 2 倍，它的面积变成原来的几倍？",
      options: ["2 倍", "4 倍", "8 倍"],
      correctIndex: 1,
      explanation:
        "面积 S = πr²，半径变为 2r 时面积 = π(2r)² = 4πr²，是原来的 4 倍。面积按半径的平方变化。答案是 4 倍。",
    },
  },
  {
    key: "对称",
    title: "轴对称与平移",
    definition:
      "如果一个图形沿一条直线折叠，直线两旁的部分能够互相重合，这条直线叫对称轴。沿某一方向移动一定距离，图形本身形状大小不变，叫平移。",
    prerequisite: {
      question: "正方形有几条对称轴？",
      options: ["1 条", "2 条", "4 条"],
      correctIndex: 2,
      explanation:
        "正方形有 4 条对称轴（两条对角线 + 两条中位线）。答案是 4 条。",
    },
    transfer: {
      question: "把一个三角形向右平移 5 厘米，再向上平移 3 厘米。它的形状和大小会怎样？",
      options: [
        "形状、大小都不变",
        "形状变大，大小不变",
        "形状、大小都变",
      ],
      correctIndex: 0,
      explanation: "平移只改变位置，不改变形状和大小。答案是形状、大小都不变。",
    },
  },
  {
    key: "方程",
    title: "方程与解方程",
    definition:
      "含有未知数的等式叫方程。解方程的依据是等式的性质：等式两边同加（减）相同的数，等式仍成立。",
    prerequisite: {
      question: "解方程 x + 5 = 12，x 等于多少？",
      options: ["7", "17", "6"],
      correctIndex: 0,
      explanation:
        "两边同时减 5：x = 12 - 5 = 7。验算：7 + 5 = 12 ✓。答案是 7。",
    },
    transfer: {
      question: "解方程 3x - 7 = 14，x 等于多少？",
      options: ["5", "7", "9"],
      correctIndex: 1,
      explanation:
        "两边同时加 7：3x = 21，两边同时除以 3：x = 7。验算：3×7 - 7 = 14 ✓。答案是 7。",
    },
  },
  {
    key: "数轴",
    title: "数轴与有理数",
    definition:
      "规定了原点、正方向和单位长度的直线叫数轴。数轴上右边的数总比左边的大。整数和分数统称有理数，有理数可分为正数、0、负数三类。",
    prerequisite: {
      question: "在数轴上，右边的数与左边的数相比怎样？",
      options: [
        "右边的数总比左边的大",
        "右边的数总比左边的小",
        "没有规律",
      ],
      correctIndex: 0,
      explanation:
        "数轴规定的正方向决定了右大左小。答案是右边的数总比左边的大。",
    },
    transfer: {
      question: "比较大小：-3/4 与 -2/3 谁大？",
      options: ["-3/4 大", "-2/3 大", "相等"],
      correctIndex: 1,
      explanation:
        "两个负数，绝对值大的反而小。|-3/4| = 0.75 > |-2/3| ≈ 0.67，所以 -2/3 > -3/4。答案是 -2/3 大。",
    },
  },
  {
    key: "有理数",
    title: "有理数的加减法",
    definition:
      "有理数加法：同号相加取相同符号并把绝对值相加；异号相加取绝对值大的符号并用大绝对值减小绝对值。加法交换律、结合律在有理数中仍成立。",
    prerequisite: {
      question: "(-3) + 5 等于多少？",
      options: ["-8", "2", "8"],
      correctIndex: 1,
      explanation:
        "异号相加，取绝对值大的（5）的符号，绝对值相减：5 - 3 = 2。答案是 2。",
    },
    transfer: {
      question: "计算：(-2) + 5 + (-8) + 7。最简便的方法是什么？",
      options: [
        "从左到右依次计算",
        "先把正数与负数分别相加，再合并",
        "先算绝对值最大的",
      ],
      correctIndex: 1,
      explanation:
        "利用加法交换律与结合律分组：(5 + 7) + [(-2) + (-8)] = 12 - 10 = 2。答案是先把正数与负数分别相加再合并。",
    },
  },
  {
    key: "整式",
    title: "整式的加减",
    definition:
      "用字母表示数的式子叫整式。单项式中的数字因数叫系数；几个单项式的和叫多项式。同类项必须字母和字母的指数都相同。",
    prerequisite: {
      question: "在 3x²y - 2xy + 5 中，-2xy 的系数是多少？",
      options: ["-2", "2", "-2y"],
      correctIndex: 0,
      explanation:
        "单项式中的数字因数是系数，所以 −2xy 的系数是 −2。答案是 -2。",
    },
    transfer: {
      question: "化简：5a - (3a - 2b) + a。结果是什么？",
      options: ["3a + 2b", "9a - 2b", "3a - 2b"],
      correctIndex: 0,
      explanation:
        "先去括号（括号前是负号，去括号后各项变号）：5a - 3a + 2b + a = 3a + 2b。答案是 3a + 2b。",
    },
  },
  {
    key: "一元一次方程",
    title: "解一元一次方程",
    definition:
      "只含一个未知数且未知数次数为 1 的方程叫一元一次方程。解法步骤：去分母 → 去括号 → 移项 → 合并同类项 → 系数化为 1。",
    prerequisite: {
      question: "解方程 2x + 5 = 15，x 等于多少？",
      options: ["5", "10", "7.5"],
      correctIndex: 0,
      explanation: "2x = 15 - 5 = 10，x = 5。验算：2×5 + 5 = 15 ✓。答案是 5。",
    },
    transfer: {
      question:
        "甲、乙两地相距 240 千米，两车同时从两地相对开出，速度分别是 60 千米/时和 40 千米/时。几小时后相遇？",
      options: ["2 小时", "2.4 小时", "4 小时"],
      correctIndex: 1,
      explanation:
        "相遇时间 = 总路程 ÷ 速度和 = 240 ÷ (60 + 40) = 2.4 小时。答案是 2.4 小时。",
    },
  },
  {
    key: "一次函数",
    title: "一次函数与正比例函数",
    definition:
      "y = kx + b（k ≠ 0）叫一次函数；b = 0 时叫正比例函数 y = kx。k 决定增减性：k > 0 时 y 随 x 增大而增大；k < 0 时 y 随 x 增大而减小。b 是与 y 轴交点的纵坐标。",
    prerequisite: {
      question: "在 y = 2x - 3 中，当 x = 3 时，y 等于多少？",
      options: ["3", "6", "9"],
      correctIndex: 0,
      explanation: "代入求值：y = 2 × 3 - 3 = 3。答案是 3。",
    },
    transfer: {
      question: "一次函数 y = kx + 3 的图象经过点 (1, 5)，则 k 等于多少？",
      options: ["2", "3", "8"],
      correctIndex: 0,
      explanation: "代入：5 = k × 1 + 3，k = 2。答案是 2。",
    },
  },
  {
    key: "反比例函数",
    title: "反比例函数",
    definition:
      "y = k/x（k ≠ 0）叫反比例函数，图象是双曲线。当 k > 0 时，x、y 同号，分布在第一、三象限；当 k < 0 时分布在第二、四象限。",
    prerequisite: {
      question: "在反比例函数 y = 6/x 中，当 x = 3 时，y 等于多少？",
      options: ["2", "3", "18"],
      correctIndex: 0,
      explanation:
        "y = 6 ÷ 3 = 2。xy = k 是反比例函数最重要的性质。答案是 2。",
    },
    transfer: {
      question: "点 P(2, 3) 在反比例函数 y = k/x 的图象上，则 k 等于多少？图象在哪些象限？",
      options: [
        "k = 6；第一、三象限",
        "k = 5；第一、三象限",
        "k = 6；第二、四象限",
      ],
      correctIndex: 0,
      explanation:
        "k = xy = 2 × 3 = 6。k > 0 时双曲线分布在第一、三象限。答案是 k = 6；第一、三象限。",
    },
  },
  {
    key: "二次函数",
    title: "二次函数",
    definition:
      "y = ax² + bx + c（a ≠ 0）叫二次函数，图象是抛物线。对称轴 x = -b/(2a)；当 a > 0 开口向上有最小值，a < 0 开口向下有最大值；顶点式 y = a(x - h)² + k 中 (h, k) 即顶点。",
    prerequisite: {
      question: "抛物线 y = x² 的顶点在哪里？",
      options: ["(0, 1)", "(0, 0)", "(1, 0)"],
      correctIndex: 1,
      explanation:
        "y = x² = (x - 0)² + 0，顶点为 (0, 0)。答案是 (0, 0)。",
    },
    transfer: {
      question: "二次函数 y = x² - 4x + 3 的对称轴和最小值分别是多少？",
      options: [
        "x = 2，最小值 -1",
        "x = 2，最小值 -3",
        "x = -2，最小值 -1",
      ],
      correctIndex: 0,
      explanation:
        "配方：y = (x - 2)² - 1。对称轴 x = 2，最小值 -1。答案是 x = 2，最小值 -1。",
    },
  },
  {
    key: "反比例",
    title: "反比例与一次函数的交点",
    definition:
      "直线 y = kx + b 与双曲线 y = m/x 的交点满足 kx + b = m/x，即 kx² + bx - m = 0。交点个数由判别式 Δ = b² + 4km 决定。",
    prerequisite: {
      question: "直线 y = x + 1 与双曲线 y = 2/x 有几个交点？",
      options: ["0 个", "1 个", "2 个"],
      correctIndex: 2,
      explanation:
        "令 x + 1 = 2/x，得 x² + x - 2 = 0，Δ = 1 + 8 = 9 > 0，有两个不相等的实根，所以有 2 个交点。",
    },
    transfer: {
      question:
        "在反比例函数 y = k/x 中，若点 (2, -3) 在图象上，则 k 等于多少？图象不经过第几象限？",
      options: [
        "k = -6；第一象限",
        "k = 6；第二、四象限",
        "k = -6；第二、四象限",
      ],
      correctIndex: 2,
      explanation:
        "k = xy = 2 × (-3) = -6。k < 0 时双曲线分布在第二、四象限，不经过第一、三象限。答案是 k = -6；第二、四象限。",
    },
  },
  {
    key: "几何",
    title: "几何图形与全等",
    definition:
      "能够完全重合的两个图形叫全等图形。全等三角形的对应边相等、对应角相等，常用判定方法有 SSS、SAS、ASA、AAS、HL。",
    prerequisite: {
      question: "全等三角形的对应边之间有什么关系？",
      options: [
        "对应边相等，对应角也相等",
        "对应边相等，对应角互补",
        "只有对应边相等",
      ],
      correctIndex: 0,
      explanation:
        "全等图形能完全重合，所以对应边相等、对应角相等。答案是对应边相等，对应角也相等。",
    },
    transfer: {
      question:
        "在 △ABC 和 △DEF 中，AB = DE，∠A = ∠D，BC = EF。这三个条件能不能判定两三角形全等？",
      options: [
        "不能，三边中有两边非对应",
        "能，判定为 SSS",
        "能，判定为 AAS",
      ],
      correctIndex: 1,
      explanation:
        "AB = DE、BC = EF 是两组对应边相等，∠A = ∠D 是夹角相等——这正是 SAS（边角边）的判定。答案是能，判定为 SAS。",
    },
  },
  {
    key: "勾股定理",
    title: "勾股定理",
    definition:
      "直角三角形两直角边的平方和等于斜边的平方：a² + b² = c²。c 是斜边，也是最长边。",
    prerequisite: {
      question: "直角三角形两直角边是 3 和 4，斜边是多少？",
      options: ["5", "7", "12"],
      correctIndex: 0,
      explanation:
        "c = √(3² + 4²) = √25 = 5。这是经典的 3-4-5 勾股数组。答案是 5。",
    },
    transfer: {
      question: "直角三角形斜边是 13，一条直角边是 5，另一条直角边是多少？",
      options: ["8", "12", "18"],
      correctIndex: 1,
      explanation:
        "b = √(13² - 5²) = √(169 - 25) = √144 = 12。这是 5-12-13 勾股数组。答案是 12。",
    },
  },
  {
    key: "统计",
    title: "统计与概率",
    definition:
      "一组数据的平均数反映集中趋势，中位数反映中间水平，众数反映最常出现的情况。概率描述随机事件发生的可能性大小，取值在 0 到 1 之间。",
    prerequisite: {
      question: "一组数据 3、5、5、7、10 的中位数是多少？",
      options: ["3", "5", "7"],
      correctIndex: 1,
      explanation: "数据已排序，共 5 个，中间的第 3 个数是 5。答案是 5。",
    },
    transfer: {
      question: "掷一枚均匀硬币，正面朝上的概率是多少？",
      options: ["1", "1/2", "0"],
      correctIndex: 1,
      explanation:
        "等可能结果有 2 种（正、反），其中 1 种是正面朝上，概率 = 1/2 = 0.5。答案是 1/2。",
    },
  },
  {
    key: "整除",
    title: "整除的性质",
    definition:
      "若 a 能被 b 整除（b ≠ 0），记作 a ÷ b = c（c 为整数）。整除的性质：若 a、b、c 都是整数，且 b、c 均不为 0，则 a|b 且 c|b ⇒ a|bc。",
    prerequisite: {
      question: "36 能被 4 整除吗？",
      options: ["能，36 ÷ 4 = 9", "不能", "能，36 ÷ 4 = 8.5"],
      correctIndex: 0,
      explanation:
        "36 ÷ 4 = 9 是整数，所以 4 能整除 36。答案是能，36 ÷ 4 = 9。",
    },
    transfer: {
      question: "若 a 能被 3 整除，b 能被 5 整除，那么 ab 一定能被下列哪个数整除？",
      options: ["8", "15", "30"],
      correctIndex: 1,
      explanation:
        "由整除性质，a = 3m，b = 5n，则 ab = 15mn，一定被 15 整除。答案是 15。",
    },
  },
  {
    key: "指数",
    title: "指数运算",
    definition:
      "aⁿ 表示 n 个 a 相乘（a ≠ 0，n 为正整数）。同底数幂相乘，底数不变指数相加：aᵐ · aⁿ = aᵐ⁺ⁿ。",
    prerequisite: {
      question: "2³ × 2⁴ 等于多少？",
      options: ["2⁷", "2¹²", "6⁷"],
      correctIndex: 0,
      explanation:
        "同底数幂相乘，底数不变指数相加：2³ × 2⁴ = 2⁷ = 128。答案是 2⁷。",
    },
    transfer: {
      question: "若 2ˣ = 32，x 等于多少？",
      options: ["4", "5", "16"],
      correctIndex: 1,
      explanation: "32 = 2⁵，所以 x = 5。答案是 5。",
    },
  },
  {
    key: "对数",
    title: "对数",
    definition:
      "若 aˣ = N（a > 0，a ≠ 1），则 x 叫做以 a 为底 N 的对数，记作 logₐN。对数运算是指数运算的逆运算。",
    prerequisite: {
      question: "log₂8 等于多少？",
      options: ["2", "3", "4"],
      correctIndex: 1,
      explanation: "因为 2³ = 8，所以 log₂8 = 3。答案是 3。",
    },
    transfer: {
      question: "已知 log₂(x - 1) = 3，求 x。",
      options: ["7", "8", "9"],
      correctIndex: 2,
      explanation:
        "log₂(x-1) = 3 ⇒ x - 1 = 2³ = 8 ⇒ x = 9。答案是 9。",
    },
  },
  {
    key: "三角函数",
    title: "锐角三角函数",
    definition:
      "在直角三角形中，锐角 θ 的正弦 sinθ = 对边/斜边，余弦 cosθ = 邻边/斜边，正切 tanθ = 对边/邻边。特殊角：sin30° = 1/2，cos60° = 1/2，tan45° = 1。",
    prerequisite: {
      question: "sin30° 等于多少？",
      options: ["1/2", "√3/2", "1"],
      correctIndex: 0,
      explanation: "sin30° = 1/2，cos30° = √3/2。答案是 1/2。",
    },
    transfer: {
      question: "直角三角形中，斜边为 10，某锐角的对边为 6。这个锐角的正弦值是多少？",
      options: ["0.6", "0.8", "1.5"],
      correctIndex: 0,
      explanation: "sinθ = 对边/斜边 = 6/10 = 0.6。答案是 0.6。",
    },
  },
  {
    key: "概率",
    title: "概率与频率",
    definition:
      "在相同条件下，做大量重复试验，事件发生的频率会在某个常数附近摆动，这个常数就是事件发生的概率。频率是试验结果，概率是本质。",
    prerequisite: {
      question: "必然事件的概率是多少？不可能事件的概率是多少？",
      options: ["1 和 0", "0 和 1", "都等于 0.5"],
      correctIndex: 0,
      explanation:
        "必然事件 P = 1，不可能事件 P = 0，任意事件 0 ≤ P ≤ 1。答案是 1 和 0。",
    },
    transfer: {
      question:
        "抛一枚硬币，重复抛 100 次，正面出现的频率是 0.52。这说明正面朝上的概率是多少？",
      options: [
        "就是 0.52",
        "大于 0.52",
        "接近 0.5 但频率不等于概率",
      ],
      correctIndex: 2,
      explanation:
        "频率会随试验次数波动并趋近于概率。0.52 只是一次试验的结果，正面朝上的概率是 1/2。答案是接近 0.5 但频率不等于概率。",
    },
  },
  {
    key: "集合",
    title: "集合的概念",
    definition:
      "具有某种特定性质的对象的总体叫集合。每个对象叫元素。元素具有互异性、无序性、确定性。",
    prerequisite: {
      question: "下列集合中，元素具有互异性的是哪一个？",
      options: [
        "全体正整数",
        "方程 x² = 1 的所有实数根",
        "高一年级全体学生",
      ],
      correctIndex: 1,
      explanation:
        "互异性指集合中的元素不能重复。方程 x² = 1 的根是 ±1，两个元素互不相同；而「全体正整数」的元素个数无限，谈不上重复。答案是方程 x² = 1 的所有实数根。",
    },
    transfer: {
      question: "设 A = {1, 2, 3, 4}，B = {3, 4, 5}，则 A ∩ B = ?",
      options: ["{1, 2}", "{3, 4}", "{1, 2, 3, 4, 5}"],
      correctIndex: 1,
      explanation: "A ∩ B 是同时属于 A 和 B 的元素，即 {3, 4}。答案是 {3, 4}。",
    },
  },
  {
    key: "导数",
    title: "导数与变化率",
    definition:
      "函数的导数刻画函数在某一点的瞬时变化率（切线斜率）。y′ = 0 的点是驻点，可能为极值点。",
    prerequisite: {
      question: "函数 f(x) = x² 的导数 f′(x) 是多少？",
      options: ["x", "2x", "x²"],
      correctIndex: 1,
      explanation:
        "由幂函数求导法则 (xⁿ)′ = n·xⁿ⁻¹，得 (x²)′ = 2x。答案是 2x。",
    },
    transfer: {
      question: "若 f(x) = x³ - 3x，则 f′(x) = ? 它的极值点横坐标是多少？",
      options: [
        "f′(x) = 3x² - 3；x = ±1",
        "f′(x) = 3x² + 3；x = 0",
        "f′(x) = 3x² - 3；x = 0",
      ],
      correctIndex: 0,
      explanation:
        "f′(x) = 3x² - 3。令 f′(x) = 0：3(x² - 1) = 0，得 x = ±1。答案是 f′(x) = 3x² - 3；x = ±1。",
    },
  },
  {
    key: "数列",
    title: "等差数列与等比数列",
    definition:
      "从第 2 项起，每一项与它的前一项的差都等于同一个常数，叫等差数列，公差为 d，通项 aₙ = a₁ + (n-1)d；相邻两项的比等于同一常数的叫等比数列，公比为 q。",
    prerequisite: {
      question: "数列 3, 6, 9, 12, … 的通项公式是什么？",
      options: ["aₙ = 3n", "aₙ = n + 2", "aₙ = 2n + 1"],
      correctIndex: 0,
      explanation:
        "首项 a₁ = 3，公差 d = 3，所以 aₙ = 3 + (n-1)×3 = 3n。答案是 aₙ = 3n。",
    },
    transfer: {
      question: "等差数列 1, 4, 7, 10, … 的第 10 项是多少？",
      options: ["28", "30", "31"],
      correctIndex: 0,
      explanation:
        "a₁ = 1，d = 3，a₁₀ = 1 + (10-1)×3 = 1 + 27 = 28。答案是 28。",
    },
  },
  {
    key: "直线与圆",
    title: "直线与圆的位置关系",
    definition:
      "设圆心到直线的距离为 d，半径为 r：d > r 相离，d = r 相切，d < r 相交。切点处半径垂直于切线。",
    prerequisite: {
      question: "圆心到直线的距离等于半径时，直线与圆的位置关系是？",
      options: ["相离", "相切", "相交"],
      correctIndex: 1,
      explanation:
        "d = r 时相切，且切点处半径垂直于直线。答案是相切。",
    },
    transfer: {
      question:
        "圆 x² + y² = 25 的半径是多少？圆心到直线 y = 3 的距离是多少？两者什么关系？",
      options: [
        "半径 5，距离 3，相交",
        "半径 5，距离 3，相切",
        "半径 25，距离 3，相离",
      ],
      correctIndex: 0,
      explanation:
        "半径 r = 5。圆心 (0,0) 到直线 y = 3 的距离 d = 3 < 5，所以是相交。答案是半径 5，距离 3，相交。",
    },
  },
  {
    key: "圆锥曲线",
    title: "椭圆的性质",
    definition:
      "椭圆 x²/a² + y²/b² = 1（a > b > 0）中，2a 是长轴长，2b 是短轴长，c² = a² - b² 为半焦距，e = c/a 为离心率（0 < e < 1）。焦点在长轴上。",
    prerequisite: {
      question: "椭圆 x²/25 + y²/9 = 1 的长轴长是多少？",
      options: ["5", "10", "18"],
      correctIndex: 1,
      explanation: "a = 5，b = 3，长轴长 = 2a = 10。答案是 10。",
    },
    transfer: {
      question: "椭圆 x²/25 + y²/16 = 1 的离心率是多少？",
      options: ["3/5", "4/5", "5/4"],
      correctIndex: 0,
      explanation: "a = 5，b = 4，c = √(25-16) = 3，e = c/a = 3/5。答案是 3/5。",
    },
  },
];

/** 在知识点库里按关键词查找（最长匹配优先）。 */
export function matchMathTopic(
  coreTitle,
  fullTitle,
) {
  const haystack = `${coreTitle} ${fullTitle}`;
  let best = null;
  let bestLength = 0;
  for (const topic of MATH_TOPICS) {
    if (haystack.includes(topic.key) && topic.key.length > bestLength) {
      best = topic;
      bestLength = topic.key.length;
    }
  }
  return best;
}
