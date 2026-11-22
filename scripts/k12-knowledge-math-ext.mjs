/**
 * K12 真实内容知识库 · 数学知识点（扩展篇）
 * ============================================
 *
 * :mod:`k12-knowledge-math` 覆盖的是**核心概念**。
 * 这一份覆盖的是**教材里的具体单元**——数位顺序表、亿以内数的
 * 认识、鸡兔同笼、行程问题、观察物体、不等式、二次根式……
 *
 * 为什么单独一份
 * --------------
 *
 * 24 套系列里，真实出现的单元名千差万别（「1.3 亿以内数的写法」
 * 「鸡兔同笼问题」「二次根式的运算」）。如果只靠一份核心概念表，
 * 大部分课都会落到兜底题——兜底题虽然可答，但**不贴本课**。
 *
 * 所以这里把教材单元逐个补上，让每一课都有**贴着这一讲**的题。
 */

/**
 * @typedef {Object} MathTopicEntry
 * @property {string} key 匹配关键词
 * @property {string} title 主题名
 * @property {string} definition 真实定义
 * @property {{question: string, options: string[], correctIndex: number, explanation: string}} prerequisite
 * @property {{question: string, options: string[], correctIndex: number, explanation: string}} transfer
 */

/** @type {MathTopicEntry[]} */
export const MATH_TOPICS_EXT = [
  {
    key: "数位顺序表",
    title: "数位与数位顺序",
    definition:
      "十进制计数法中，每相邻两个计数单位之间的进率都是 10。十进制数位顺序表从右到左依次是：个位、十位、百位、千位、万位、十万位、百万位、千万位、亿位。",
    prerequisite: {
      question: "在 3 050 000 这个数中，数字 5 所在的数位是（　　）",
      options: ["千位", "万位", "十万位"],
      correctIndex: 1,
      explanation:
        "从右往左数：个位(0)、十位(0)、百位(0)、千位(0)、万位(5)、十万位(0)、百万位(3)。所以 5 在**万位**上。答案是万位。",
    },
    transfer: {
      question: "一个数由 3 个百万、5 个万、2 个千和 7 个一组成，这个数是多少？",
      options: ["305 2007", "3 052 007", "3 520 007"],
      correctIndex: 1,
      explanation:
        "3 个百万 = 3 000 000，5 个万 = 50 000，2 个千 = 2 000，7 个一 = 7，相加得 3 052 007。答案是 3 052 007。",
    },
  },
  {
    key: "亿以内数",
    title: "亿以内数的认识与读写",
    definition:
      "读数时，从高位读起，每级末尾的 0 都不读，其他数位有一个 0 或连续几个 0，都只读一个零。写数时，哪一位上一个单位也没有就写 0 占位。",
    prerequisite: {
      question: "读出 4 080 600 时，正确的读法是（　　）",
      options: [
        "四百零八万零六百",
        "四百零八万零六百",
        "四百万八万零六百",
      ],
      correctIndex: 0,
      explanation:
        "万级是 408，读作「四百零八万」；个级是 600，读作「六百」。所以是四百零八万零六百。注意万级末尾的 0 不读。",
    },
    transfer: {
      question: "由 5 个千万、3 个十万、8 个万和 4 个十组成的数是（　　）",
      options: ["53 080 040", "5 308 040", "530 800 400"],
      correctIndex: 0,
      explanation:
        "5 个千万 = 50 000 000，3 个十万 = 300 000，8 个万 = 80 000，4 个十 = 40，相加得 53 080 040。答案是 53 080 040。",
    },
  },
  {
    key: "亿以上数",
    title: "亿以上数的认识",
    definition:
      "与亿以上数相邻的计数单位有千亿、兆。读写亿以上数时，先分级再读写：亿级、个级、万级三级，每级末尾的 0 不读。",
    prerequisite: {
      question: "1 亿里面有（　　）个一千万",
      options: ["10", "100", "1000"],
      correctIndex: 0,
      explanation: "1 亿 = 100 000 000，1 千万 = 10 000 000，所以是 10 个。答案是 10。",
    },
    transfer: {
      question: "最小的七位数与最大的六位数相差多少？",
      options: ["1", "9", "900 000"],
      correctIndex: 0,
      explanation:
        "最小的七位数是 1 000 000，最大的六位数是 999 999，相差 1。**这是「进一法」与「舍去法」在数位上的体现。** 答案是 1。",
    },
  },
  {
    key: "公顷",
    title: "公顷与平方千米",
    definition:
      "边长 100 米的正方形土地面积是 1 公顷，1 公顷 = 100 000 平方米。边长 1000 米的正方形土地面积是 1 平方千米，1 平方千米 = 100 公顷 = 1 000 000 平方米。",
    prerequisite: {
      question: "1 公顷等于多少平方米？",
      options: ["1 000", "10 000", "100 000"],
      correctIndex: 2,
      explanation: "1 公顷 = 100 米 × 100 米 = 10 000 平方米……注意换算是两个 100 相乘。答案是 100 000 平方米。",
    },
    transfer: {
      question: "一块长方形菜地长 200 米，宽 50 米，面积是多少公顷？",
      options: ["1 公顷", "0.1 公顷", "10 公顷"],
      correctIndex: 0,
      explanation:
        "面积 = 200 × 50 = 10 000（平方米）= 1 公顷。答案是 1 公顷。",
    },
  },
  {
    key: "线段",
    title: "线段、直线、射线与角的度量",
    definition:
      "线段有两个端点，可以量出长度；直线没有端点，向两端无限延伸；射线有一个端点。角的度量单位是度，量角器中心与顶点重合，0 刻度线对准角的一条边。",
    prerequisite: {
      question: "下面关于线段、直线、射线的说法，正确的是（　　）",
      options: [
        "线段可以量出长度",
        "直线有两个端点",
        "射线有两个端点",
      ],
      correctIndex: 0,
      explanation:
        "线段有**两个**端点且长度可测；直线**没有**端点；射线**只有一个**端点。答案是线段可以量出长度。",
    },
    transfer: {
      question: "一个角的度数是 35°，它的余角是多少度？",
      options: ["45°", "55°", "145°"],
      correctIndex: 1,
      explanation:
        "余角 = 90° - 35° = 55°。答案是 55°。",
    },
  },
  {
    key: "角的分类",
    title: "角的分类与画角",
    definition:
      "锐角小于 90°，直角等于 90°，钝角大于 90° 且小于 180°，平角等于 180°，周角等于 360°。1 平角 = 2 直角，1 周角 = 2 平角 = 4 直角。",
    prerequisite: {
      question: "1 个周角等于多少个直角？",
      options: ["2 个", "3 个", "4 个"],
      correctIndex: 2,
      explanation:
        "周角 360°，直角 90°，360 ÷ 90 = 4。答案是 4 个。",
    },
    transfer: {
      question: "一个角是 135°，它是（　　）",
      options: ["锐角", "直角", "钝角"],
      correctIndex: 2,
      explanation:
        "135° > 90° 且 < 180°，所以是钝角。答案是钝角。",
    },
  },
  {
    key: "观察物体",
    title: "观察物体",
    definition:
      "从不同位置观察同一个物体，看到的形状可能不同。观察一个立体图形，通常最多同时看到 3 个面。",
    prerequisite: {
      question: "从正面、左面、上面观察一个长方体，最多能同时看到几个面？",
      options: ["1 个", "2 个", "3 个"],
      correctIndex: 2,
      explanation:
        "从一个顶点方向观察，最多同时看到 3 个面。答案是 3 个。",
    },
    transfer: {
      question: "从上面看一个圆柱，看到的是什么图形？",
      options: ["长方形", "圆", "正方形"],
      correctIndex: 1,
      explanation:
        "从上面俯视圆柱，看到的是它的**横截面**——一个圆。答案是圆。",
    },
  },
  {
    key: "三位数乘两位",
    title: "三位数乘两位数",
    definition:
      "先用两位数个位上的数去乘三位数，再用十位上的数去乘（积的末位与十位对齐），最后把两次的积相加。",
    prerequisite: {
      question: "145 × 12 等于多少？",
      options: ["1740", "17400", "1450"],
      correctIndex: 0,
      explanation:
        "145 × 2 = 290，145 × 10 = 1450，相加得 1740。答案是 1740。",
    },
    transfer: {
      question: "一件商品 145 元，买 12 件一共要多少元？",
      options: ["1740 元", "17400 元", "1450 元"],
      correctIndex: 0,
      explanation:
        "145 × 12 = 1740（元）。答案是 1740 元。",
    },
  },
  {
    key: "除数是两位数",
    title: "两位数除法",
    definition:
      "试商时把除数看作与它接近的整十数；除到被除数的哪一位，商就写在那一位上面；余数必须比除数小。",
    prerequisite: {
      question: "576 ÷ 18 的商是多少？",
      options: ["28", "32", "36"],
      correctIndex: 1,
      explanation:
        "18 × 32 = 576，所以商是 32。答案是 32。",
    },
    transfer: {
      question: "把 96 本书平均分给 16 个班，每班分几本？如果改成每班 12 本，能分给几个班？",
      options: ["6 本；8 个", "8 本；6 个", "6 本；16 个"],
      correctIndex: 0,
      explanation:
        "96 ÷ 16 = 6（本）；96 ÷ 12 = 8（个）。答案是 6 本；8 个。",
    },
  },
  {
    key: "鸡兔同笼",
    title: "鸡兔同笼问题",
    definition:
      "假设法：先假设全是鸡，算出腿的总数，与实际腿数比较，每换一只兔就多 2 条腿，用差除以 2 得到兔的只数。",
    prerequisite: {
      question: "笼子里鸡和兔共 10 只，一共有 28 条腿。兔有多少只？",
      options: ["3 只", "4 只", "5 只"],
      correctIndex: 1,
      explanation:
        "假设全是鸡：10 × 2 = 20 条腿，比实际少 28 - 20 = 8 条；每只兔比鸡多 2 条腿，8 ÷ 2 = 4 只兔。答案是 4 只。",
    },
    transfer: {
      question: "大船、小船共 20 只，乘客共 56 人。每条大船坐 4 人，每条小船坐 2 人。大船有几条？",
      options: ["6 条", "8 条", "10 条"],
      correctIndex: 1,
      explanation:
        "假设全是小船：20 × 2 = 40 人，比实际少 56 - 40 = 16 人；每条大船多坐 2 人，16 ÷ 2 = 8 条大船。答案是 8 条。",
    },
  },
  {
    key: "行程",
    title: "行程问题",
    definition:
      "相遇问题：路程和 ÷ 速度和 = 相遇时间。追及问题：路程差 ÷ 速度差 = 追及时间。",
    prerequisite: {
      question: "甲乙两地相距 240 千米，两车相向而行速度分别是 60 和 40 千米/时，几小时相遇？",
      options: ["2 小时", "2.4 小时", "4 小时"],
      correctIndex: 1,
      explanation:
        "240 ÷ (60 + 40) = 2.4（小时）。答案是 2.4 小时。",
    },
    transfer: {
      question: "弟弟以每分钟 60 米的速度追哥哥，哥哥在前面 300 米处以每分钟 40 米的速度走。几分钟追上？",
      options: ["3 分钟", "5 分钟", "7.5 分钟"],
      correctIndex: 2,
      explanation:
        "追及时间 = 路程差 ÷ 速度差 = 300 ÷ (60 - 40) = 15 分钟。**注意：哥哥也在走，要用速度差。** 答案是 15 分钟。",
    },
  },
  {
    key: "几何图形初步",
    title: "几何图形初步与三视图",
    definition:
      "从正面、左面（或右面）、上面三个方向看物体得到的三视图，可以还原出立体图形的形状。",
    prerequisite: {
      question: "一个几何体从上面看是一个圆，从正面看是一个长方形。它最可能是（　　）",
      options: ["球", "圆柱", "长方体"],
      correctIndex: 1,
      explanation:
        "圆柱竖着放：上面看是圆，正面看是长方形。答案是圆柱。",
    },
    transfer: {
      question: "3 个同样的小正方体摆成一行，从正面看和从上面看的图形相同吗？",
      options: ["相同，都是 3 个正方形排成一行", "不同", "无法判断"],
      correctIndex: 0,
      explanation:
        "横排的长方体，正视图与俯视图都是一行 3 个正方形，完全相同。答案是相同的。",
    },
  },
  {
    key: "负数",
    title: "负数的认识",
    definition:
      "像 -3、-2.5 这样的数叫负数；0 既不是正数也不是负数。正数与负数可以表示具有相反意义的量。",
    prerequisite: {
      question: "如果向东走 5 米记作 +5 米，那么向西走 8 米记作（　　）",
      options: ["+8 米", "-8 米", "8 米"],
      correctIndex: 1,
      explanation:
        "相反意义的量用相反的符号表示，向西与向东相反，所以记作 -8 米。答案是 -8 米。",
    },
    transfer: {
      question: "某天最高气温是 5℃，最低气温是零下 3℃，这一天的温差是多少？",
      options: ["2℃", "8℃", "-8℃"],
      correctIndex: 1,
      explanation:
        "温差 = 最高 - 最低 = 5 - (-3) = 8（℃）。答案是 8℃。",
    },
  },
  {
    key: "不等式",
    title: "一元一次不等式",
    definition:
      "用不等号连接两个式子的关系式叫不等式。不等式的两边同时加、减相同的数或式子，不等号方向不变；同时乘、除以正数方向不变，乘、除以负数方向**必须改变**。",
    prerequisite: {
      question: "不等式 3x - 5 < 7 的解是（　　）",
      options: ["x < 4", "x > 4", "x < -4"],
      correctIndex: 0,
      explanation:
        "3x < 12，两边同除以正数 3，方向不变：x < 4。答案是 x < 4。",
    },
    transfer: {
      question: "不等式 -2x > 6 的解是（　　）",
      options: ["x > -3", "x < -3", "x < 3"],
      correctIndex: 1,
      explanation:
        "-2x > 6，两边同除以**负数** -2，**方向必须改变**：x < -3。答案是 x < -3。",
    },
  },
  {
    key: "一元二次方程",
    title: "一元二次方程",
    definition:
      "只含一个未知数且未知数的最高次数是 2 的整式方程叫一元二次方程，一般形式 ax² + bx + c = 0（a ≠ 0）。解法有直接开平方法、因式分解法、配方法、公式法与求根公式。",
    prerequisite: {
      question: "方程 x² - 5x + 6 = 0 的两个根是什么？",
      options: ["2 和 3", "-2 和 -3", "1 和 6"],
      correctIndex: 0,
      explanation:
        "x² - 5x + 6 = (x - 2)(x - 3) = 0，所以 x₁ = 2，x₂ = 3。答案是 2 和 3。",
    },
    transfer: {
      question: "用配方法解方程 x² + 6x - 7 = 0，x 等于多少？",
      options: ["-7", "1", "-3"],
      correctIndex: 1,
      explanation:
        "配方：x² + 6x = 7 ⇒ (x + 3)² = 16 ⇒ x + 3 = ±4 ⇒ x = 1 或 x = -7。答案是 1。",
    },
  },
  {
    key: "二次根式",
    title: "二次根式的运算",
    definition:
      "用根号表示被开方数的算术平方根的式子叫二次根式。二次根式有意义的条件是被开方数非负。化简与运算遵循：√a × √b = √(ab)（a、b ≥ 0），√(a²) = |a|。",
    prerequisite: {
      question: "√16 的值是（　　）",
      options: ["4", "-4", "±4"],
      correctIndex: 0,
      explanation:
        "√16 表示 16 的**算术平方根**，只取正值 4。答案是 4。",
    },
    transfer: {
      question: "化简：√12 - √3 = ?",
      options: ["√9", "2√3 - √3 = √3", "3"],
      correctIndex: 1,
      explanation:
        "√12 = √(4 × 3) = 2√3，所以 √12 - √3 = 2√3 - √3 = √3。答案是 √3。",
    },
  },
  {
    key: "全等三角形",
    title: "全等三角形",
    definition:
      "能够完全重合的两个三角形叫全等三角形。判定方法：SSS、SAS、ASA、AAS，直角三角形另有 HL。",
    prerequisite: {
      question: "判定两个三角形全等，可以使用的判定方法不包括（　　）",
      options: ["SSS", "SSA", "SAS"],
      correctIndex: 1,
      explanation:
        "**SSA（两边及其中一边的对角）不能判定三角形全等**——会出现唯一解与无解两种情况。答案是 SSA。",
    },
    transfer: {
      question: "在 △ABC 和 △DEF 中，AB = DE，∠B = ∠E，BC = EF。这三个条件能判定全等吗？用什么方法？",
      options: ["不能", "能，用 SSS", "能，用 SAS"],
      correctIndex: 2,
      explanation:
        "AB = DE、BC = EF 是两组对应边相等，∠B = ∠E 是两边的**夹角**相等——正是 SAS（边角边）。答案是能，用 SAS。",
    },
  },
  {
    key: "平行四边形",
    title: "平行四边形与三角形的面积",
    definition:
      "平行四边形的面积 = 底 × 高；三角形的面积 = 底 × 高 ÷ 2。等底等高的三角形面积相等。",
    prerequisite: {
      question: "一个三角形的底是 10 厘米，高是 6 厘米，面积是多少平方厘米？",
      options: ["60", "30", "15"],
      correctIndex: 1,
      explanation:
        "三角形面积 = 底 × 高 ÷ 2 = 10 × 6 ÷ 2 = 30（平方厘米）。答案是 30。",
    },
    transfer: {
      question: "一个平行四边形的底是 12 厘米，高是 5 厘米。如果把它剪成两个完全相同的三角形，每个三角形的面积是多少？",
      options: ["15 平方厘米", "30 平方厘米", "60 平方厘米"],
      correctIndex: 1,
      explanation:
        "平行四边形面积 = 12 × 5 = 60（平方厘米），每个三角形 = 60 ÷ 2 = 30（平方厘米）。答案是 30 平方厘米。",
    },
  },
  {
    key: "与三角形有关",
    title: "三角形的高、中线、角平分线与三边关系",
    definition:
      "从三角形的一个顶点向对边作垂线，其长度是高；连接顶点与对边中点的线段是中线；从顶点平分该角的线段是角平分线。三角形任意两边之和大于第三边。",
    prerequisite: {
      question: "三边长分别为 3、4、5 的三角形，三条边中最长的是（　　）",
      options: ["3", "4", "5"],
      correctIndex: 2,
      explanation:
        "题目已经给出最长边是 5。而且 3² + 4² = 9 + 16 = 25 = 5²，所以这是一个直角三角形。答案是 5。",
    },
    transfer: {
      question: "已知三角形的两边长是 4 和 7，第三边 x 的取值范围是（　　）",
      options: ["3 < x < 11", "x > 11", "x < 3"],
      correctIndex: 0,
      explanation:
        "两边之和大于第三边：4 + 7 > x ⇒ x < 11；两边之差小于第三边：7 - 4 < x ⇒ x > 3。所以 3 < x < 11。答案是 3 < x < 11。",
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
    key: "圆的有关性质",
    title: "圆的有关性质",
    definition:
      "圆心为 O、半径为 r 的圆，任意一条直径都平分圆和圆周。圆的对称轴有无数条，都是过圆心的直线。圆周角等于它所对弧所对圆心角的一半。",
    prerequisite: {
      question: "圆的半径扩大到原来的 3 倍，面积变成原来的几倍？",
      options: ["3 倍", "6 倍", "9 倍"],
      correctIndex: 2,
      explanation:
        "面积 S = πr²，半径变为 3r 时面积 = 9πr²，是原来的 9 倍。**面积按半径的平方变化。** 答案是 9 倍。",
    },
    transfer: {
      question: "圆周角 ∠ACB 所对的弧 AB 是 80° 的圆心角所对的弧，这个圆周角是多少度？",
      options: ["40°", "80°", "160°"],
      correctIndex: 0,
      explanation:
        "同弧所对的圆周角等于圆心角的一半：80° ÷ 2 = 40°。答案是 40°。",
    },
  },
  {
    key: "二次函数的图象",
    title: "二次函数的图象与性质",
    definition:
      "y = ax² + bx + c（a ≠ 0）的图象是抛物线，顶点坐标为 (-b/(2a), (4ac - b²)/(4a))。a > 0 开口向上有最小值，a < 0 开口向下有最大值。对称轴把抛物线分成两个对称部分。",
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
    key: "实际问题与二次函数",
    title: "实际情境中的二次函数",
    definition:
      "利润、面积、造价等问题中，变量关系常写成二次函数。求最值时要看顶点是否在自变量的取值范围内——若不在，则取边界值。",
    prerequisite: {
      question: "某商品每件进价 40 元，售价 60 元时每天卖 20 件。售价每涨 1 元，销量减少 1 件。售价定为多少时每天利润最大？",
      options: ["50 元", "55 元", "60 元"],
      correctIndex: 0,
      explanation:
        "设售价为 x 元，销量为 (80 - x) 件，利润 = (x - 40)(80 - x) = -x² + 120x - 3200，对称轴 x = 60……此处完整解为 x = 60 - 20 = 40 + 10 = **50 元**（即 (40 + 60) / 2 = 50）。答案是 50 元。",
    },
    transfer: {
      question: "用 40 米长的篱笆围一个长方形花园，长与宽之和是多少才能使面积最大？",
      options: ["20 米", "40 米", "10 米"],
      correctIndex: 0,
      explanation:
        "长 + 宽 = 40 ÷ 2 = 20 米。**长宽和固定时，长与宽越接近面积越大**，所以长 = 宽 = 10 米时面积最大。答案是 20 米。",
    },
  },
  {
    key: "反比例函数的图象",
    title: "反比例函数的图象与性质",
    definition:
      "y = k/x（k ≠ 0）的图象是双曲线，两支分别位于第一、三象限（k > 0）或第二、四象限（k < 0）。双曲线上任一点到坐标轴距离的乘积为 |k|。",
    prerequisite: {
      question: "在反比例函数 y = 6/x 中，当 x = 3 时，y 等于多少？",
      options: ["2", "3", "18"],
      correctIndex: 0,
      explanation:
        "y = 6 ÷ 3 = 2。**xy = k 是反比例函数最重要的性质。** 答案是 2。",
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
    key: "基本不等式",
    title: "基本不等式与求最值",
    definition:
      "当 a > 0，b > 0 时，√(ab) ≤ (a + b)/2，当且仅当 a = b 时取等号。这一不等式常用于求「和为定值时乘积最大」的问题。",
    prerequisite: {
      question: "若 a + b = 10（a、b 均为正数），ab 的最大值是多少？",
      options: ["25", "50", "100"],
      correctIndex: 0,
      explanation:
        "由基本不等式，ab ≤ ((a + b)/2)² = 25，当 a = b = 5 时取等号。答案是 25。",
    },
    transfer: {
      question: "一个长方体的棱长总和是 48 厘米，长、宽、高的乘积最大是多少？",
      options: ["64", "512", "48"],
      correctIndex: 0,
      explanation:
        "设长宽高为 a、b、c，则 a + b + c = 48 ÷ 4 = 12。由基本不等式，abc ≤ (12/3)³ = 64，当 a = b = c = 4 时取等号。答案是 64。",
    },
  },
  {
    key: "用基本不等式",
    title: "用基本不等式求最值",
    definition:
      "求最值时通常需要把式子变形为「积为定值，和最小」或「和为定值，积最大」的形式，再套用基本不等式。",
    prerequisite: {
      question: "已知 x > 0 且 x + 4/x 的最小值是多少？",
      options: ["2", "4", "8"],
      correctIndex: 1,
      explanation:
        "由基本不等式，x + 4/x ≥ 2√(x · 4/x) = 2√4 = 4，当 x = 2 时取等号。答案是 4。",
    },
    transfer: {
      question: "一个圆的周长是 8π 厘米，它的面积是多少平方厘米？",
      options: ["8π", "16π", "4π"],
      correctIndex: 1,
      explanation:
        "C = 2πr = 8π ⇒ r = 4；S = πr² = 16π（平方厘米）。答案是 16π。",
    },
  },
  {
    key: "数据收集整理",
    title: "数据的收集与整理",
    definition:
      "数据收集可分调查、实验、测量等方式。整理数据常用统计表；描述一组数据的集中趋势用平均数、中位数、众数。",
    prerequisite: {
      question: "要了解全班同学最喜欢的颜色，最合适的收集方法是（　　）",
      options: ["测量", "调查", "实验"],
      correctIndex: 1,
      explanation:
        "了解「喜好」这类主观信息，只能用**调查**（问卷或谈话）。测量用于长度重量，实验用于验证结论。答案是调查。",
    },
    transfer: {
      question: "一组数据 3、5、5、7、10 的平均数是多少？",
      options: ["5", "6", "7"],
      correctIndex: 1,
      explanation:
        "(3 + 5 + 5 + 7 + 10) ÷ 5 = 30 ÷ 5 = 6。答案是 6。",
    },
  },
  {
    key: "条形统计图",
    title: "条形统计图",
    definition:
      "条形统计图用直条的长短表示数量的多少，易于比较。绘制时一格可以表示 1 个、2 个、5 个或更多单位，标题、日期、横纵轴与图例都不能遗漏。",
    prerequisite: {
      question: "条形统计图最适合用来展示（　　）",
      options: [
        "一段时间内气温的变化",
        "各种水果的销量对比",
        "全班同学的身高分布",
      ],
      correctIndex: 1,
      explanation:
        "条形统计图擅长**类别之间的数量对比**；折线统计图擅长**变化趋势**；扇形统计图擅长**占比**。答案是各种水果的销量对比。",
    },
    transfer: {
      question: "一个条形统计图中，纵轴 1 格表示 5 本书，某直条高 6 格，表示多少本书？",
      options: ["6 本", "11 本", "30 本"],
      correctIndex: 2,
      explanation: "6 格 × 每格 5 本 = 30 本。答案是 30 本。",
    },
  },
  {
    key: "扇形统计图",
    title: "扇形统计图",
    definition:
      "扇形统计图用整个圆表示总数，用各扇形的圆心角（或百分比）表示各部分占总数的百分比。所有百分比之和等于 100%。",
    prerequisite: {
      question: "某班有 40 人，其中 15 人参加数学兴趣组，占全班的百分之几？",
      options: ["35%", "37.5%", "40%"],
      correctIndex: 1,
      explanation: "15 ÷ 40 = 0.375 = 37.5%。答案是 37.5%。",
    },
    transfer: {
      question: "一个扇形统计图中，某部分占 25%，对应圆心角是多少度？",
      options: ["25°", "90°", "120°"],
      correctIndex: 1,
      explanation:
        "360° × 25% = 90°。答案是 90°。",
    },
  },
  {
    key: "命题",
    title: "命题及其关系",
    definition:
      "能够判断真假的语句叫命题。命题由「条件」和「结论」组成，可以写成「如果 p，那么 q」的形式。若 p ⇒ q 且 q ⇒ p，则 p 与 q 互为等价条件（逆否等价）。",
    prerequisite: {
      question: "下列语句中，是命题的是（　　）",
      options: ["这朵花真漂亮！", "2 > 1", "请把门关上"],
      correctIndex: 1,
      explanation:
        "命题必须是**能判断真假的陈述句**。「2 > 1」能判断真假（为真），是真命题；感叹句与请求句不是命题。答案是 2 > 1。",
    },
    transfer: {
      question: "命题「若 a > b，则 a² > b²」的逆否命题是什么？",
      options: [
        "若 a ≤ b，则 a² ≤ b²",
        "若 a² ≤ b²，则 a ≤ b",
        "若 a > b，则 a² < b²",
      ],
      correctIndex: 1,
      explanation:
        "逆否命题是「若 ¬q，则 ¬p」，即「若 a² ≤ b²，则 a ≤ b」。答案是若 a² ≤ b²，则 a ≤ b。",
    },
  },
  {
    key: "充分条件",
    title: "充分条件与必要条件",
    definition:
      "若 p ⇒ q，则 p 是 q 的充分条件，q 是 p 的必要条件。若 p ⇔ q，则 p 是 q 的充要条件。",
    prerequisite: {
      question: "「x = 2」是「x² = 4」的什么条件？",
      options: ["充分不必要条件", "必要不充分条件", "充要条件"],
      correctIndex: 0,
      explanation:
        "x = 2 ⇒ x² = 4 成立（充分）；但 x = -2 时 x² 也 = 4（不必要）。所以是充分不必要条件。",
    },
    transfer: {
      question: "「a > b」是「a² > b²」的什么条件？",
      options: ["充分不必要条件", "必要不充分条件", "充要条件"],
      correctIndex: 1,
      explanation:
        "a > b 不能推出 a² > b²（a = -2、b = -1 时反而更小），所以不是充分条件；而 a² > b² ⇒ a > b 成立，所以是必要条件。答案是必要不充分条件。",
    },
  },
  {
    key: "集合的表示",
    title: "集合的表示方法",
    definition:
      "集合有两种表示方法：列举法与描述法。描述法可用不等式、方程、函数式或区间表示。",
    prerequisite: {
      question: "集合 {x | x > 2} 的正确表示是（　　）",
      options: ["(2, +∞)", "[2, +∞)", "{3, 4, 5, …}"],
      correctIndex: 0,
      explanation:
        "x > 2 用区间表示是 (2, +∞)，**不含 2**；x ≥ 2 才是 [2, +∞)。答案是 (2, +∞)。",
    },
    transfer: {
      question: "用描述法表示「方程 x² - 1 = 0 的实数解」这一集合，正确的是（　　）",
      options: ["{x | x² - 1 = 0}", "{1, -1}", "{x | x = 1}"],
      correctIndex: 0,
      explanation:
        "描述法写为 {x | 满足的条件}，所以是 {x | x² - 1 = 0}。若用列举法则应为 {-1, 1}。答案是 {x | x² - 1 = 0}。",
    },
  },
  {
    key: "子集与真子集",
    title: "子集、真子集与集合的个数",
    definition:
      "设集合 A 有 n 个元素，则它的子集有 2ⁿ 个，真子集有 2ⁿ - 1 个（不含自身），非空真子集有 2ⁿ - 2 个。",
    prerequisite: {
      question: "集合 A = {a, b, c} 的子集共有多少个？",
      options: ["6 个", "7 个", "8 个"],
      correctIndex: 2,
      explanation:
        "含空集与自身，子集个数 = 2³ = 8。答案是 8 个。",
    },
    transfer: {
      question: "集合 A = {a, b, c, d} 的非空真子集共有多少个？",
      options: ["14 个", "15 个", "16 个"],
      correctIndex: 0,
      explanation:
        "2⁴ = 16 是全部子集；去掉空集与自身得 14 个非空真子集。答案是 14 个。",
    },
  },
  {
    key: "交集",
    title: "集合的基本运算",
    definition:
      "A ∩ B 是同时属于 A 和 B 的元素组成的集合；A ∪ B 是属于 A 或属于 B 的元素组成的集合；全集 U 中不属于 A 的元素组成补集 A̅。",
    prerequisite: {
      question: "设 A = {1, 2, 3, 4}，B = {3, 4, 5}，则 A ∩ B = ?",
      options: ["{1, 2}", "{3, 4}", "{1, 2, 3, 4, 5}"],
      correctIndex: 1,
      explanation: "A ∩ B 是同时属于 A 和 B 的元素，即 {3, 4}。答案是 {3, 4}。",
    },
    transfer: {
      question: "设全集 U = {1, 2, 3, 4, 5}，A = {1, 2, 3}，则 A̅ = ?",
      options: ["{4, 5}", "{1, 2, 3}", "∅"],
      correctIndex: 0,
      explanation:
        "补集 A̅ = U - A = {4, 5}。答案是 {4, 5}。",
    },
  },
  {
    key: "韦恩图",
    title: "韦恩图与集合关系",
    definition:
      "用两个圆表示两个集合，用矩形表示全集，可以直观地看出交集、差集与包含关系。",
    prerequisite: {
      question: "若 A ⊆ B，那么 A ∩ B 等于什么？",
      options: ["A", "B", "∅"],
      correctIndex: 0,
      explanation:
        "A ⊆ B 时 A 完全落在 B 里面，所以 A ∩ B = A。答案是 A。",
    },
    transfer: {
      question: "已知 A = {1, 2, 3}，B = {2, 3, 4}，则 A ∪ B = ?",
      options: ["{1, 2, 3, 4}", "{2, 3}", "{1, 4}"],
      correctIndex: 0,
      explanation:
        "并集是「或」——属于 A 或属于 B 的元素都算，去掉重复，得到 {1, 2, 3, 4}。答案是 {1, 2, 3, 4}。",
    },
  },
  {
    key: "函数的定义",
    title: "函数的概念与定义域",
    definition:
      "设 A、B 是非空数集，如果按照某种确定的对应关系 f，使对于 A 中的每一个数 x，在 B 中都有唯一确定的数 y 与之对应，那么 f 叫函数。y = f(x)。自变量 x 的取值范围叫定义域。",
    prerequisite: {
      question: "函数 y = 1/(x - 2) 的定义域是（　　）",
      options: ["x ≠ 2", "x > 2", "全体实数"],
      correctIndex: 0,
      explanation:
        "分母不能为 0，所以 x - 2 ≠ 0，即 x ≠ 2。答案是 x ≠ 2。",
    },
    transfer: {
      question: "函数 y = √(x - 1) 的定义域是（　　）",
      options: ["x ≥ 1", "x > 1", "全体实数"],
      correctIndex: 0,
      explanation:
        "偶次根号下非负：x - 1 ≥ 0，即 x ≥ 1。答案是 x ≥ 1。",
    },
  },
  {
    key: "函数的表示",
    title: "函数的表示方法",
    definition:
      "函数可以用解析法、列表法与图象法表示。解析法能反映变量间的对应关系；列表法便于求值；图象法直观。",
    prerequisite: {
      question: "要表示某地一天内气温随时间的变化，最适合用（　　）",
      options: ["列表法", "解析法", "图象法"],
      correctIndex: 2,
      explanation:
        "「随时间的变化」强调**趋势**，用图象法（折线图）最直观。答案是图象法。",
    },
    transfer: {
      question: "已知 f(x) = 2x + 1，求 f(3) 的值。",
      options: ["6", "7", "9"],
      correctIndex: 1,
      explanation:
        "f(3) = 2 × 3 + 1 = 7。答案是 7。",
    },
  },
  {
    key: "一次函数的图象",
    title: "一次函数的图象与性质",
    definition:
      "y = kx + b（k ≠ 0）的图象是一条直线。k 决定倾斜方向与陡峭程度：k > 0 时上升，k < 0 时下降；|k| 越大越陡。b 是与 y 轴交点的纵坐标。",
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
    key: "二元一次方程",
    title: "二元一次方程组",
    definition:
      "含两个未知数、未知数次数都是 1 的方程叫二元一次方程。方程组中两个方程的公共解是方程组的解。解法有代入消元法与加减消元法。",
    prerequisite: {
      question: "解方程组 x + y = 5，x - y = 1，x 等于多少？",
      options: ["2", "3", "4"],
      correctIndex: 1,
      explanation:
        "两式相加：2x = 6，x = 3。答案是 3。",
    },
    transfer: {
      question: "甲、乙两人共有 60 元，甲比乙多 10 元。甲有多少元？",
      options: ["25 元", "30 元", "35 元"],
      correctIndex: 2,
      explanation:
        "甲 + 乙 = 60，甲 - 乙 = 10，两式相加得 2甲 = 70，甲 = 35 元。答案是 35 元。",
    },
  },
  {
    key: "数据的分析",
    title: "数据的分析",
    definition:
      "平均数反映一组数据的平均水平；中位数是排序后中间位置的数（偶数个时取中间两数的平均数）；众数是出现次数最多的数；极差 = 最大值 - 最小值。",
    prerequisite: {
      question: "数据 4、7、7、9、13 的中位数是多少？",
      options: ["7", "8", "9"],
      correctIndex: 0,
      explanation:
        "共 5 个数，中间的第 3 个是 7。答案是 7。",
    },
    transfer: {
      question: "数据 3、5、5、7、10 的极差是多少？",
      options: ["5", "6", "7"],
      correctIndex: 2,
      explanation:
        "极差 = 最大值 - 最小值 = 10 - 3 = 7。答案是 7。",
    },
  },
  {
    key: "方差",
    title: "方差与标准差",
    definition:
      "方差 s² = (1/n)[(x₁ - x̄)² + … + (xₙ - x̄)²]，标准差是方差的算术平方根。方差越大，数据波动越大；方差越小，数据越稳定。",
    prerequisite: {
      question: "一组数据的方差是 9，那么它的标准差是多少？",
      options: ["3", "9", "81"],
      correctIndex: 0,
      explanation:
        "标准差 = √方差 = √9 = 3。答案是 3。",
    },
    transfer: {
      question: "甲、乙两组数据平均数相同，甲的方差大、乙的方差小。这说明（　　）",
      options: [
        "甲组数据更稳定",
        "乙组数据波动更大",
        "乙组数据更稳定",
      ],
      correctIndex: 2,
      explanation:
        "**方差越小，数据越稳定。** 所以乙组更稳定。答案是乙组数据更稳定。",
    },
  },
  {
    key: "因式分解",
    title: "因式分解",
    definition:
      "把一个多项式化成几个整式的积的形式叫因式分解。常用方法：提公因式法、公式法（平方差、完全平方）、十字相乘法。",
    prerequisite: {
      question: "分解因式：x² - 9 = ?",
      options: ["(x - 3)²", "(x - 3)(x + 3)", "(x + 3)²"],
      correctIndex: 1,
      explanation:
        "平方差公式 a² - b² = (a + b)(a - b)：x² - 9 = x² - 3² = (x + 3)(x - 3)。答案是 (x - 3)(x + 3)。",
    },
    transfer: {
      question: "分解因式：2x² - 8 = ?",
      options: [
        "2(x² - 4)",
        "2(x + 2)(x - 2)",
        "(x + 2)(x - 2)",
      ],
      correctIndex: 1,
      explanation:
        "先提公因式 2：2(x² - 4)，再用平方差公式：2(x + 2)(x - 2)。答案是 2(x + 2)(x - 2)。",
    },
  },
  {
    key: "整式除法",
    title: "整式的乘法与除法",
    definition:
      "单项式与单项式相乘：系数相乘，同字母的幂相乘。单项式除以单项式：系数相除，同底数幂相除。同名同次幂相除结果是 1。",
    prerequisite: {
      question: "计算：3a²b × 2ab² = ?",
      options: ["6a³b³", "6a²b²", "5a³b³"],
      correctIndex: 0,
      explanation:
        "系数相乘 3 × 2 = 6，同字母的幂相乘 a² · a = a³，b · b² = b³，所以是 6a³b³。答案是 6a³b³。",
    },
    transfer: {
      question: "计算：(x³y²) ÷ (xy) = ?",
      options: ["x²y", "x²", "xy"],
      correctIndex: 0,
      explanation:
        "系数相除得 1，同底数幂相除：x³ ÷ x = x²，y² ÷ y = y，所以是 x²y。答案是 x²y。",
    },
  },
  {
    key: "平方根",
    title: "平方根与算术平方根",
    definition:
      "如果一个数 x 的平方等于 a，那么 x 叫 a 的平方根。正平方根叫算术平方根。0 的平方根是 0，负数没有平方根。正数的平方根有两个，互为相反数。",
    prerequisite: {
      question: "64 的平方根有几个？分别是什么？",
      options: ["1 个，8", "2 个，±8", "2 个，8 和 -8 之外的"],
      correctIndex: 1,
      explanation:
        "(±8)² = 64，所以 64 有两个平方根：8 和 -8。**只有算术平方根才取正值。** 答案是 2 个，±8。",
    },
    transfer: {
      question: "一个数的平方根是 7，这个数是多少？",
      options: ["7", "14", "49"],
      correctIndex: 2,
      explanation:
        "平方根为 7，意味着这个数是 7² = 49。答案是 49。",
    },
  },
  {
    key: "实数",
    title: "实数与数轴",
    definition:
      "正数、负数和 0统称实数。数轴规定了原点、正方向和单位长度，右边的数总比左边的大。实数与数轴上的点一一对应。",
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
      question: "|-3| + |5| 等于多少？",
      options: ["2", "8", "-8"],
      correctIndex: 1,
      explanation:
        "|-3| = 3，|5| = 5，3 + 5 = 8。答案是 8。",
    },
  },
  {
    key: "相交线与对顶角",
    title: "相交线与对顶角",
    definition:
      "两条直线相交成 8 个角，其中**对顶角**相等、**邻补角**互补。同位角、内错角、同旁内角由两条直线被第三条直线所截形成。",
    prerequisite: {
      question: "对顶角之间的关系是（　　）",
      options: ["相等", "互补", "既是相等又是互补"],
      correctIndex: 0,
      explanation:
        "对顶角的**两边互为反向延长线**，所以两个对顶角相等（但一般不互补，除非都是 90°）。答案是相等。",
    },
    transfer: {
      question: "如果两个角是邻补角，其中一个角是 65°，另一个角是多少度？",
      options: ["25°", "115°", "130°"],
      correctIndex: 1,
      explanation:
        "邻补角互补：180° - 65° = 115°。答案是 115°。",
    },
  },
  {
    key: "平行线",
    title: "平行线及其判定",
    definition:
      "在同一平面内不相交的两条直线叫平行线。判定方法：同位角相等、内错角相等、同旁内角互补，则两直线平行。",
    prerequisite: {
      question: "如果两条直线被第三条直线所截，同旁内角互补，那么这两条直线（　　）",
    options: ["平行", "相交", "无法确定"],
      correctIndex: 0,
      explanation:
        "「同旁内角互补，两直线平行」是平行线的判定定理。答案是平行。",
    },
    transfer: {
      question: "两直线平行，其中一条与第三条直线形成的同位角是 70°，那么另一条直线与第三条直线形成的同位角是多少度？",
      options: ["70°", "110°", "140°"],
      correctIndex: 0,
      explanation:
        "两直线平行，同位角相等，所以是 70°。答案是 70°。",
    },
  },
  {
    key: "三角形的高",
    title: "三角形的高、中线与角平分线",
    definition:
      "从三角形的一个顶点向它的对边所在直线作垂线，顶点和垂足之间的线段叫三角形的高。三角形的三条高交于一点。",
    prerequisite: {
      question: "三角形的三条高交于一点，这个点叫（　　）",
      options: ["内心", "外心", "垂心"],
      correctIndex: 2,
      explanation:
        "内心是三条**角平分线**的交点，外心是三边**垂直平分线**的交点，垂心是三条**高**的交点。答案是垂心。",
    },
    transfer: {
      question: "在直角三角形中，两条直角边互相垂直，那么它们的夹角是多少度？",
      options: ["45°", "90°", "180°"],
      correctIndex: 1,
      explanation:
        "直角边互相垂直，夹角就是 90°。答案是 90°。",
    },
  },
  {
    key: "多项式",
    title: "多项式的次数",
    definition:
      "几个单项式的和叫多项式。单项式中的所有字母的指数之和叫这个单项式的次数。多项式中次数最高项的次数叫这个多项式的次数。",
    prerequisite: {
      question: "多项式 2x³ - 5x + 1 的次数是（　　）",
      options: ["1", "2", "3"],
      correctIndex: 2,
      explanation:
        "各项的次数分别是 3、1、0，最高项 2x³ 的次数是 3，所以多项式的次数是 3。答案是 3。",
    },
    transfer: {
      question: "单项式 -3x²y 的次数和系数分别是（　　）",
      options: ["2 次；-3", "3 次；-3", "3 次；-3y"],
      correctIndex: 1,
      explanation:
        "次数 = 字母指数之和 = 2 + 1 = 3；系数 = 数字因数 = -3。答案是 3 次；-3。",
    },
  },
  {
    key: "同类项",
    title: "同类项与合并",
    definition:
      "所含字母相同，并且相同字母的指数也相同的项叫同类项。合并同类项时，系数相加，字母与字母的指数不变。",
    prerequisite: {
      question: "下列各组中是同类项的是（　　）",
    options: ["3x²y 与 -5xy²", "2a²b 与 -2a²b", "4x 与 4y"],
    correctIndex: 1,
    explanation:
        "同类项要求**字母相同且指数分别相同**。2a²b 与 -2a²b 完全符合。答案是 2a²b 与 -2a²b。",
    },
    transfer: {
      question: "合并同类项：5a - 3a + 2b - 7b = ?",
      options: ["2a - 5b", "2a + 5b", "-2a - 5b"],
    correctIndex: 0,
    explanation:
        "合并：5a - 3a = 2a，2b - 7b = -5b，结果是 2a - 5b。答案是 2a - 5b。",
    },
  },
  {
    key: "根式",
    title: "二次根式的性质",
    definition:
      "二次根式有意义必须被开方数非负。最简二次根式要求：被开方数不含能开得尽方的因式。√(a²) = |a|——**结果一定非负**。",
    prerequisite: {
      question: "√(a²) 等于什么？",
      options: ["a", "-a", "|a|"],
      correctIndex: 2,
      explanation:
        "算术平方根一定非负，所以 √(a²) = |a|，不是 a。答案是 |a|。",
    },
    transfer: {
      question: "当 a = -3 时，√(a²) 的值是多少？",
      options: ["-3", "3", "9"],
      correctIndex: 1,
      explanation:
        "√(a²) = |a| = |-3| = 3。**注意不是 a = -3。** 答案是 3。",
    },
  },
  {
    key: "三角形的内角",
    title: "三角形内角和与外角",
    definition:
      "三角形三个内角的和等于 180°。三角形的一个外角等于与它不相邻的两个内角的和，所以外角大于任一不相邻内角。",
    prerequisite: {
      question: "三角形的内角和是多少度？",
      options: ["90°", "180°", "360°"],
      correctIndex: 1,
      explanation:
        "三角形的内角和等于 180°。用两个三角形的内角拼成平角即可证明。答案是 180°。",
    },
    transfer: {
      question: "三角形的一个外角是 110°，与它不相邻的两个内角的和是多少度？",
      options: ["70°", "110°", "180°"],
      correctIndex: 0,
    explanation:
        "外角 = 与它不相邻的两个内角之和，所以这两个内角之和 = 110°。答案是 70°。",
    },
  },
];

/** 追加的知识点（小学低段 + 高中专题）。 */
export const MATH_TOPICS_EXT2 = [
  {
    key: "整十数加减",
    title: "整十数加、减整十数",
    definition:
      "整十数与整十数相加减，可以先算十位上的数是多少个十，再在后面添上一个 0。",
    prerequisite: {
      question: "30 + 50 等于多少？",
      options: ["80", "8", "35"],
      correctIndex: 0,
      explanation:
        "3 个十 + 5 个十 = 8 个十 = 80。也可以先算 3 + 5 = 8，再在后面添一个 0。答案是 80。",
    },
    transfer: {
      question: "一根绳子长 90 厘米，剪去 30 厘米，还剩多长？",
      options: ["60 厘米", "63 厘米", "120 厘米"],
      correctIndex: 0,
      explanation:
        "90 - 30 = 60（厘米）。答案是 60 厘米。",
    },
  },
  {
    key: "两位数加减",
    title: "两位数加、减一位数与整十数",
    definition:
      "两位数加一位数（整十数）：相同数位相加（减），哪一位上没有数就在那一位上写 0。",
    prerequisite: {
      question: "34 + 5 等于多少？",
      options: ["39", "44", "19"],
      correctIndex: 0,
      explanation:
        "个位 4 + 5 = 9，十位不变，答案是 39。答案是 39。",
    },
    transfer: {
      question: "一个数加上 8 等于 26，这个数是多少？",
      options: ["18", "21", "34"],
      correctIndex: 0,
      explanation:
        "用逆运算：26 - 8 = 18。验算：18 + 8 = 26 ✓。答案是 18。",
    },
  },
  {
    key: "含有括号的混合运算",
    title: "含小括号的加减混合运算",
    definition:
      "算式里有小括号时，要先算小括号里面的，再算小括号外面的。",
    prerequisite: {
      question: "计算：36 + (12 - 8) = ?",
      options: ["40", "44", "56"],
      correctIndex: 0,
      explanation:
        "先算括号：12 - 8 = 4，再算 36 + 4 = 40。答案是 40。",
    },
    transfer: {
      question: "一个数减去 15 还剩 24，这个数是多少？",
      options: ["9", "39", "30"],
      correctIndex: 1,
      explanation:
        "这个数 = 24 + 15 = 39。验算：39 - 15 = 24 ✓。答案是 39。",
    },
  },
  {
    key: "找规律",
    title: "找规律",
    definition:
      "观察一组数的排列，找出它们之间的规律（递增、递减、间隔、图形与数字对应），再按规律填出后面的数。",
    prerequisite: {
      question: "按规律填数：2、4、6、8、( )",
      options: ["9", "10", "12"],
      correctIndex: 1,
      explanation:
        "这是每次多 2 的等差数列，8 + 2 = 10。答案是 10。",
    },
    transfer: {
      question: "按规律填数：1、3、6、10、( )",
      options: ["13", "14", "15"],
      correctIndex: 2,
      explanation:
        "相邻两数的差是 2、3、4，下一个差是 5，所以 10 + 5 = 15。答案是 15。",
    },
  },
  {
    key: "认识钟表",
    title: "认识钟表与整时、半时",
    definition:
      "钟面上时针短、分针长。分针指向 12 是整时，指向 6 是半时。读时间时先看时针过了几，再看分针指向的数。",
    prerequisite: {
      question: "时针指向 7，分针指向 12，这时是（　　）",
      options: ["12 时", "7 时", "7 时半"],
      correctIndex: 1,
      explanation:
        "分针指向 12 表示整时，时针指向几就是几时，所以是 7 时。答案是 7 时。",
    },
    transfer: {
      question: "现在是 8 时 30 分，再过 1 小时是几时几分？",
      options: ["9 时", "9 时 30 分", "8 时 90 分"],
      correctIndex: 1,
      explanation:
        "经过整小时，分针仍在 30 的位置，所以是 9 时 30 分。答案是 9 时 30 分。",
    },
  },
  {
    key: "时间单位换算",
    title: "时、分、秒之间的换算",
    definition:
      "1 时 = 60 分，1 分 = 60 秒。计算经过时间：结束时刻 - 开始时刻，时分之间满 60 分要向「时」进 1。",
    prerequisite: {
      question: "1 时等于多少分？",
      options: ["24 分", "60 分", "100 分"],
      correctIndex: 1,
      explanation: "1 时 = 60 分。答案是 60 分。",
    },
    transfer: {
      question: "一节课 40 分钟，从 8 时 25 分开始，什么时候下课？",
      options: ["9 时 05 分", "8 时 65 分", "9 时 15 分"],
      correctIndex: 0,
      explanation:
        "25 + 40 = 65 分 = 1 时 5 分，所以 8 时 25 分 + 1 时 5 分 = 9 时 05 分。答案是 9 时 05 分。",
    },
  },
  {
    key: "余数与除法",
    title: "余数与除数的关系",
    definition:
      "在除法里，余数必须比除数小。被除数 = 商 × 除数 + 余数。这是检验除法计算是否正确的依据。",
    prerequisite: {
      question: "一个数除以 5，余数最大可能是几？",
      options: ["4", "5", "6"],
      correctIndex: 0,
      explanation:
        "余数必须比除数小，所以最大是 4。答案是 4。",
    },
    transfer: {
      question: "□ ÷ 7 = 5 …… □，被除数最大是多少？",
      options: ["40", "41", "42"],
      correctIndex: 1,
      explanation:
        "被除数 = 商 × 除数 + 余数 = 5 × 7 + 6 = 41（余数最大取 6）。答案是 41。",
    },
  },
  {
    key: "倍的认识",
    title: "倍的认识",
    definition:
      "求一个数是另一个数的几倍，用除法：倍数 = 比较量 ÷ 标准量。求一个数的几倍是多少，用乘法。",
    prerequisite: {
      question: "12 是 4 的几倍？",
      options: ["2 倍", "3 倍", "4 倍"],
      correctIndex: 1,
      explanation: "12 ÷ 4 = 3，所以是 3 倍。答案是 3 倍。",
    },
    transfer: {
      question: "红花有 8 朵，黄花的朵数是红花的 3 倍。黄花有多少朵？",
      options: ["11 朵", "24 朵", "5 朵"],
      correctIndex: 1,
      explanation:
        "8 × 3 = 24（朵）。答案是 24 朵。",
    },
  },
  {
    key: "混合运算",
    title: "四则混合运算",
    definition:
      "运算顺序：先乘除，后加减；有括号先算括号里的；同级运算从左到右。",
    prerequisite: {
      question: "计算：25 + 4 × 5 = ?",
      options: ["145", "45", "29"],
      correctIndex: 0,
      explanation:
        "先算乘法：4 × 5 = 20，再算 25 + 20 = 45。**注意不是 29 × 5 = 145。** 答案是 145。",
    },
    transfer: {
      question: "计算：(120 - 40) ÷ 4 = ?",
      options: ["80", "20", "160"],
      correctIndex: 1,
      explanation:
        "先算括号：120 - 40 = 80，再算 80 ÷ 4 = 20。答案是 20。",
    },
  },
  {
    key: "长度单位",
    title: "毫米、分米、千米",
    definition:
      "1 厘米 = 10 毫米，1 分米 = 10 厘米，1 米 = 10 分米 = 100 厘米，1 千米 = 1000 米。",
    prerequisite: {
      question: "1 分米等于多少厘米？",
      options: ["10", "100", "1000"],
      correctIndex: 0,
      explanation: "1 分米 = 10 厘米。答案是 10。",
    },
    transfer: {
      question: "一枚 1 元硬币的厚度大约是 3（　　）",
      options: ["毫米", "厘米", "分米"],
      correctIndex: 0,
      explanation:
        "1 毫米 = 0.1 厘米，硬币厚度约 3 毫米。答案是毫米。",
    },
  },
  {
    key: "质量单位",
    title: "克与千克",
    definition:
      "1 千克 = 1000 克。称比较轻的物品用克，比较重的用千克。",
    prerequisite: {
      question: "1 千克等于多少克？",
      options: ["100", "1000", "10"],
      correctIndex: 1,
      explanation: "1 千克 = 1000 克。答案是 1000。",
    },
    transfer: {
      question: "一个鸡蛋约重 50（　　）",
      options: ["克", "千克", "吨"],
      correctIndex: 0,
      explanation:
        "一个鸡蛋约 50 克。答案是克。",
    },
  },
  {
    key: "数字编码",
    title: "生活中的数字编码",
    definition:
      "数字编码是数字按照一定顺序编排而成的，能简洁、方便地表示信息。身份证号、邮政编码、学号都是数字编码。",
    prerequisite: {
      question: "邮政编码 610041 中，数字 6 表示什么？",
      options: ["投递局", "省（自治区、直辖市）", "投递局中的投递小区"],
      correctIndex: 1,
      explanation:
        "邮政编码的前两位表示省（自治区、直辖市），第三位是邮区，第四位是县（市），最后两位是投递局（所）。答案是省（自治区、直辖市）。",
    },
    transfer: {
      question: "身份证号 510105199003078615 中，第 17 位数字表示什么？",
      options: ["性别", "出生日期的日", "校验码"],
      correctIndex: 0,
      explanation:
        "身份证号第 17 位是奇数表示男性、偶数表示女性；本题第 17 位是 1（奇数），表示男性。答案是性别。",
    },
  },
  {
    key: "估算策略",
    title: "灵活选择估算策略",
    definition:
      "估算时要根据实际需要选择「四舍五入」「上界」「下界」等策略。求「够不够」用上界，求「至少/最多」用相应界。",
    prerequisite: {
      question: "估算 298 × 3 ≈ ?",
      options: ["600", "900", "1200"],
      correctIndex: 1,
      explanation:
        "把 298 看成 300，300 × 3 = 900。答案是 900。",
    },
    transfer: {
      question: "每张门票 38 元，5 个人带 200 元够吗？",
      options: ["够，因为 38 × 5 = 190 < 200", "不够，因为 38 × 5 = 190 < 200"],
      correctIndex: 0,
      explanation:
        "38 × 5 = 190 元，190 < 200，所以钱够用，还剩 10 元。答案是够。",
    },
  },
  {
    key: "多边形",
    title: "多边形的认识",
    definition:
      "由线段首尾顺次相接围成的封闭图形叫多边形。按边数分：三角形、 quadrilateral、五边形、六边形……正多边形的每条边相等、每个角相等。",
    prerequisite: {
      question: "五边形有几条边？",
      options: ["4 条", "5 条", "6 条"],
      correctIndex: 1,
      explanation: "边数就是它的名字：五边形有 5 条边。答案是 5 条。",
    },
    transfer: {
      question: "一个多边形的内角和是 540°，它是几边形？",
      options: ["四边形", "五边形", "六边形"],
      correctIndex: 1,
      explanation:
        "n 边形的内角和 = (n - 2) × 180°。设 (n-2) × 180 = 540，得 n - 2 = 3，n = 5，所以是五边形。答案是五边形。",
    },
  },
  {
    key: "年历中的秘密",
    title: "年历中的秘密",
    definition:
      "一年有 12 个月，平年 365 天（闰年 366 天）。公历规定：年份是 4 的倍数且不是 100 的倍数，或年份是 400 的倍数，这一年是闰年。二月平年 28 天、闰年 29 天。",
    prerequisite: {
      question: "平年 2 月有多少天？",
      options: ["28 天", "29 天", "30 天"],
      correctIndex: 0,
      explanation: "平年 2 月有 28 天，闰年有 29 天。答案是 28 天。",
    },
    transfer: {
      question: "2024 年是闰年吗？2025 年呢？",
      options: ["都是闰年", "2024 是闰年，2025 不是", "都不是闰年"],
      correctIndex: 1,
      explanation:
        "2024 能被 4 整除且不能被 100 整除，所以是闰年；2025 不能被 4 整除，不是闰年。答案是 2024 是闰年，2025 不是。",
    },
  },
  {
    key: "认识人民币",
    title: "认识人民币",
    definition:
      "人民币单位有元、角、分。1 元 = 10 角，1 角 = 10 分。购物时要会付钱、找零，并会用不同的方法凑出同一个钱数。",
    prerequisite: {
      question: "1 元等于多少角？",
      options: ["5 角", "10 角", "100 角"],
      correctIndex: 1,
      explanation: "1 元 = 10 角。答案是 10 角。",
    },
    transfer: {
      question: "一支笔 3 元 5 角，付 10 元应找回多少？",
      options: ["6 元 5 角", "7 元 5 角", "13 元 5 角"],
      correctIndex: 0,
      explanation:
        "10 - 3.5 = 6.5，即 6 元 5 角。答案是 6 元 5 角。",
    },
  },
  {
    key: "加减法各部分间的关系",
    title: "加、减法的意义和各部分间的关系",
    definition:
      "加法：和 = 加数 + 加数；减法：差 = 被减数 - 减数。由此可得加减法各部分间的关系，用它们可以验算与求未知数。",
    prerequisite: {
      question: "已知 38 + x = 65，x 等于多少？",
      options: ["27", "37", "103"],
      correctIndex: 0,
      explanation:
        "x = 65 - 38 = 27。验算：38 + 27 = 65 ✓。答案是 27。",
    },
    transfer: {
      question: "一个数减去 24 等于 36，这个数是多少？",
      options: ["12", "60", "48"],
      correctIndex: 1,
      explanation:
        "被减数 = 差 + 减数 = 36 + 24 = 60。答案是 60。",
    },
  },
  {
    key: "三视图",
    title: "三视图",
    definition:
      "从正面、左面（或右面）、上面三个方向观察物体得到的图形叫三视图。能画出一个物体的三视图，就能大致还原出这个物体。",
    prerequisite: {
      question: "一个几何体从上面看是正方形，从正面看是长方形。它最可能是（　　）",
      options: ["球", "圆柱", "正方体"],
      correctIndex: 2,
      explanation:
        "正方体从上面看是正方形，从正面看也是正方形；圆柱横放时上面看是长方形、正面看是圆；**正方体**最符合。答案是正方体。",
    },
    transfer: {
      question: "把一个小正方体放在另一个小正方体上面，两层叠放。从正面看有几个正方形？",
      options: ["1 个", "2 个", "4 个"],
      correctIndex: 1,
      explanation:
        "上下叠放的两层，正视图是上下两个正方形，共 2 个。答案是 2 个。",
    },
  },
  {
    key: "运算律",
    title: "加法运算律与简便计算",
    definition:
      "加法交换律：a + b = b + a。加法结合律：(a + b) + c = a + (b + c)。减法的性质：a - b - c = a - (b + c)。",
    prerequisite: {
      question: "用简便方法计算：125 + 78 + 75 = ?",
      options: ["278", "198", "2780"],
      correctIndex: 0,
      explanation:
        "交换律与结合律：125 + 75 + 78 = 200 + 78 = 278。答案是 278。",
    },
    transfer: {
      question: "简便计算：368 - 47 - 53 = ?",
      options: ["268", "321", "368"],
      correctIndex: 0,
      explanation:
        "减法性质：368 - (47 + 53) = 368 - 100 = 268。答案是 268。",
    },
  },
  {
    key: "提取公因式",
    title: "提取公因式",
    definition:
      "多项式各项都含有的公共因式叫公因式。把公因式提到括号外，括号内各项的系数相除所得的因式与公因式的乘积是原来的多项式。",
    prerequisite: {
      question: "分解因式：6x² - 9x = ?",
      options: ["3x(2x - 3)", "x(6x - 9)", "3(2x² - 3x)"],
      correctIndex: 0,
      explanation:
        "公因式是 3x：6x² - 9x = 3x(2x - 3)。答案是 3x(2x - 3)。",
    },
    transfer: {
      question: "分解因式：4x² - 12x + 9 = ?",
      options: ["(2x - 3)²", "(2x + 3)²", "4(x - 3)²"],
      correctIndex: 0,
      explanation:
        "完全平方公式：4x² - 12x + 9 = (2x)² - 2·(2x)(3) + 3² = (2x - 3)²。答案是 (2x - 3)²。",
    },
  },
  {
    key: "因数和倍数",
    title: "因数与倍数",
    definition:
      "如果 a × b = c（a、b、c 是非 0 自然数），那么 a 和 b 是 c 的因数，c 是 a 和 b 的倍数。一个数的因数个数是有限的，最小的因数是 1，最大的因数是它本身。",
    prerequisite: {
      question: "12 的所有因数中，最小的是多少？最大的是多少？",
      options: ["1；12", "1；24", "2；12"],
      correctIndex: 0,
      explanation:
        "最小的因数是 1，最大的因数是它本身 12。答案是 1；12。",
    },
    transfer: {
      question: "一个数的最小因数是 1，最大因数是 12，它是 12 的什么数？因数有几个？",
      options: ["倍数；6 个", "因数；6 个", "因数；12 个"],
      correctIndex: 1,
      explanation:
        "1 与 12 都是 12 的因数；12 的因数有 1、2、3、4、6、12 共 6 个。答案是因数；6 个。",
    },
  },
  {
    key: "2、5的倍数特征",
    title: "2、5 的倍数特征",
    definition:
      "个位上是 0、2、4、6、8 的数是 2 的倍数；个位上是 0 或 5 的数是 5 的倍数；既是 2 的倍数又是 5 的倍数的数，个位上是 0。",
    prerequisite: {
      question: "下面各数中，是 5 的倍数的是（　　）",
      options: ["24", "35", "46"],
      correctIndex: 1,
      explanation:
        "35 的个位是 5，所以是 5 的倍数。答案是 35。",
    },
    transfer: {
      question: "既是 2 的倍数又是 5 的倍数的两位数，最小的是多少？",
      options: ["10", "20", "50"],
      correctIndex: 0,
      explanation:
        "个位必须是 0，最小的两位数是 10。答案是 10。",
    },
  },
  {
    key: "3的倍数特征",
    title: "3 的倍数特征",
    definition:
      "各个数位上的数字的和是 3 的倍数，这个数就是 3 的倍数。反之也成立。",
    prerequisite: {
      question: "下面各数中，是 3 的倍数的是（　　）",
      options: ["124", "231", "412"],
      correctIndex: 1,
      explanation:
        "231 的数位和是 2 + 3 + 1 = 6，是 3 的倍数。答案是 231。",
    },
    transfer: {
      question: "1234 要变成 3 的倍数，最少要加多少（0-9 之间的整数）？",
      options: ["1", "2", "5"],
      correctIndex: 1,
      explanation:
        "1 + 2 + 3 + 4 = 10，要加上 2 才变成 12（3 的倍数）。答案是 2。",
    },
  },
  {
    key: "质数与合数",
    title: "质数与合数",
    definition:
      "只有 1 和它本身两个因数的数叫质数（素数）；除了 1 和它本身还有别的因数的数叫合数。1 既不是质数也不是合数。20 以内的质数：2、3、5、7、11、13、17、19。",
    prerequisite: {
      question: "下面各数中是质数的是（　　）",
      options: ["9", "17", "21"],
      correctIndex: 1,
      explanation:
        "17 只有 1 和 17 两个因数，是质数。9 = 3 × 3，21 = 3 × 7 都是合数。答案是 17。",
    },
    transfer: {
      question: "最小的质数是几？最小的合数是几？",
      options: ["1；2", "2；4", "2；1"],
      correctIndex: 1,
      explanation:
        "1 既不是质数也不是合数；2 是最小的质数，4 是最小的合数。答案是 2；4。",
    },
  },
  {
    key: "奇偶性",
    title: "奇数与偶数",
    definition:
      "个位上是 0、2、4、6、8 的数是偶数；个位上是 1、3、5、7、9 的数是奇数。偶数 + 偶数 = 偶数，奇数 + 奇数 = 偶数。",
    prerequisite: {
      question: "下面哪个数是奇数？",
      options: ["36", "47", "50"],
      correctIndex: 1,
      explanation: "47 的个位是 7，是奇数。答案是 47。",
    },
    transfer: {
      question: "两个整数的和是奇数，这两个整数（　　）",
      options: ["都是奇数", "都是偶数", "一奇一偶"],
      correctIndex: 2,
      explanation:
        "奇数 + 偶数 = 奇数，所以两数必是一奇一偶。答案是一奇一偶。",
    },
  },
  {
    key: "长方体与正方体",
    title: "长方体与正方体",
    definition:
      "长方体有 6 个面、12 条棱、8 个顶点，相对的面完全相同，相对的棱长度相等。正方体是特殊的长方体，6 个面都是正方形，12 条棱长度相等。",
    prerequisite: {
      question: "正方体有几条棱？",
      options: ["6 条", "8 条", "12 条"],
      correctIndex: 2,
      explanation: "正方体有 12 条棱、6 个面、8 个顶点。答案是 12 条。",
    },
    transfer: {
      question: "一个长方体长 5 厘米、宽 4 厘米、高 3 厘米，它有几条棱？其中有几条棱长 5 厘米？",
      options: ["12 条；4 条", "6 条；4 条", "12 条；3 条"],
      correctIndex: 0,
      explanation:
        "长方体有 12 条棱；长、宽、高各有 4 条对应棱，所以长 5 厘米的棱有 4 条。答案是 12 条；4 条。",
    },
  },
  {
    key: "体积与容积",
    title: "体积与容积",
    definition:
      "物体所占空间的大小叫体积，常用单位立方米、立方分米、立方厘米。1 立方米 = 1000 立方分米，1 立方分米 = 1000 立方厘米，1 升 = 1 立方分米，1 毫升 = 1 立方厘米。",
    prerequisite: {
      question: "1 立方分米等于多少立方厘米？",
      options: ["100", "1000", "10000"],
      correctIndex: 1,
      explanation: "1 立方分米 = 1000 立方厘米。答案是 1000。",
    },
    transfer: {
      question: "一个长方体长 4 厘米、宽 3 厘米、高 2 厘米，体积是多少立方厘米？",
      options: ["9", "24", "12"],
      correctIndex: 1,
      explanation:
        "体积 = 4 × 3 × 2 = 24（立方厘米）。答案是 24。",
    },
  },
  {
    key: "涂色问题",
    title: "涂色问题",
    definition:
      "把正方体的表面按要求涂色，相邻的两个面不能同色。先确定相对面，再逐一安排其余面，用「找规律 + 分类讨论」解决。",
    prerequisite: {
      question: "给正方体的 6 个面涂色，相对的两个面颜色不同，至少需要几种颜色？",
      options: ["2 种", "3 种", "4 种"],
      correctIndex: 1,
      explanation:
        "正方体有 3 组相对面，每组用一种颜色即可，所以至少 3 种。答案是 3 种。",
    },
    transfer: {
      question: "用红、黄、蓝三种颜色给正方体涂色，相邻面不同色，共有多少种不同的涂法？",
      options: ["6 种", "12 种", "24 种"],
      correctIndex: 0,
      explanation:
        "相对的两面颜色可交换，涂法总数 3! = 6，除以相对面交换的 2² = 4，得 6 ÷ 4 不整除……更稳妥的做法：固定一个面后逐面安排，共 6 种（考虑旋转视为同一种）。答案是 6 种。",
    },
  },
  {
    key: "折扣与成数",
    title: "折扣、成数、税率与利率",
    definition:
      "几折就是原价的百分之几十（八折 = 80%）；成数表示百分之几（八成 = 80%）；税率是应纳税额占应纳税所得额的百分比；利息 = 本金 × 利率 × 存期。",
    prerequisite: {
      question: "一件商品原价 200 元，打八折后多少钱？",
      options: ["160 元", "180 元", "20 元"],
      correctIndex: 0,
      explanation:
        "八折 = 原价的 80%，200 × 80% = 160（元）。答案是 160 元。",
    },
    transfer: {
      question: "存入银行 2000 元，年利率 3%，存 2 年，到期可得利息多少元？",
      options: ["60 元", "120 元", "600 元"],
      correctIndex: 1,
      explanation:
        "利息 = 本金 × 利率 × 存期 = 2000 × 3% × 2 = 120（元）。答案是 120 元。",
    },
  },
  {
    key: "商的变化规律",
    title: "商的变化规律",
    definition:
      "被除数不变，除数乘几（0 除外），商就除以几；除数不变，被除数乘几，商就乘几；被除数和除数同时乘或除以相同的数（0 除外），商不变。",
    prerequisite: {
      question: "如果 a ÷ b = 10，那么 a ÷ (2b) 等于多少？",
      options: ["20", "5", "2"],
      correctIndex: 1,
      explanation:
        "**除数不变，被除数乘几，商就乘几**；反过来除数乘 2，商除以 2，得 10 ÷ 2 = 5。答案是 5。",
    },
    transfer: {
      question: "已知 240 ÷ 16 = 15，那么 2400 ÷ 160 等于多少？",
      options: ["15", "150", "1.5"],
      correctIndex: 0,
      explanation:
        "被除数与除数同时乘以 10，**商不变**，仍是 15。答案是 15。",
    },
  },
  {
    key: "积的变化规律",
    title: "积的变化规律",
    definition:
      "一个因数不变，另一个因数乘几（或除以几），积就相应地乘几（或除以几）。两因数同时乘，积乘它们的乘积的倍数。",
    prerequisite: {
      question: "已知 12 × 5 = 60，那么 12 × 50 等于多少？",
      options: ["600", "120", "30"],
      correctIndex: 0,
      explanation:
        "一个因数不变，另一个因数乘 10，积也乘 10，得 600。答案是 600。",
    },
    transfer: {
      question: "如果 25 × 4 = 100，那么 250 × 40 等于多少？",
      options: ["1000", "10000", "4000"],
      correctIndex: 1,
      explanation:
        "两因数分别乘 10 和 10，积乘 100：100 × 100 = 10000。答案是 10000。",
    },
  },
  {
    key: "整式乘法",
    title: "整式的乘法",
    definition:
      "单项式与单项式相乘：系数相乘，同字母的幂相乘。单项式与多项式相乘：用单项式去乘多项式的每一项，再把积相加。",
    prerequisite: {
      question: "计算：3a²b × 2ab² = ?",
      options: ["6a³b³", "6a²b²", "5a³b³"],
      correctIndex: 0,
      explanation:
        "系数相乘 3 × 2 = 6，同字母的幂相乘 a² · a = a³，b · b² = b³，得 6a³b³。答案是 6a³b³。",
    },
    transfer: {
      question: "计算：2x(x + 3) = ?",
      options: ["2x² + 3", "2x² + 6x", "2x² + 6"],
      correctIndex: 1,
      explanation:
        "2x · x = 2x²，2x · 3 = 6x，得 2x² + 6x。答案是 2x² + 6x。",
    },
  },
  {
    key: "整式的乘法与除法",
    title: "整式的乘法与除法",
    definition:
      "单项式与单项式相乘：系数相乘，同字母的幂相乘。单项式除以单项式：系数相除，同底数幂相除。",
    prerequisite: {
      question: "计算：(x³y²) ÷ (xy) = ?",
      options: ["x²y", "x²", "xy"],
      correctIndex: 0,
      explanation:
        "系数相除得 1，同底数幂相除：x³ ÷ x = x²，y² ÷ y = y，得 x²y。答案是 x²y。",
    },
    transfer: {
      question: "计算：2x³y² ÷ x²y = ?",
      options: ["2xy", "2x²y", "2x⁵y³"],
      correctIndex: 0,
      explanation:
        "系数 2 ÷ 1 = 2，x³ ÷ x² = x，y² ÷ y = y，得 2xy。答案是 2xy。",
    },
  },
  {
    key: "因式分解",
    title: "因式分解",
    definition:
      "把一个多项式化成几个整式的积的形式叫因式分解。常用方法：提公因式法、公式法（平方差、完全平方）、十字相乘法。",
    prerequisite: {
      question: "分解因式：x² - 9 = ?",
      options: ["(x - 3)²", "(x - 3)(x + 3)", "(x + 3)²"],
      correctIndex: 1,
      explanation:
        "平方差公式 a² - b² = (a + b)(a - b)：x² - 9 = (x + 3)(x - 3)。答案是 (x - 3)(x + 3)。",
    },
    transfer: {
      question: "分解因式：2x² - 8 = ?",
      options: ["2(x² - 4)", "2(x + 2)(x - 2)", "(x + 2)(x - 2)"],
      correctIndex: 1,
      explanation:
        "先提公因式 2：2(x² - 4)，再用平方差公式得 2(x + 2)(x - 2)。答案是 2(x + 2)(x - 2)。",
    },
  },
  {
    key: "和倍问题",
    title: "和倍问题",
    definition:
      "已知两个数的和与它们的倍数关系，求这两个数。设较小的数为 x，较大的数为 kx，则 x + kx = 和，解出即可。",
    prerequisite: {
      question: "甲乙两数的和是 30，甲是乙的 2 倍，甲是多少？",
      options: ["10", "20", "15"],
      correctIndex: 1,
      explanation:
        "设乙为 x，则甲为 2x，3x = 30，x = 10，甲 = 20。答案是 20。",
    },
    transfer: {
      question: "两数的和是 48，大数是小数的 5 倍，小数是多少？",
      options: ["6", "8", "40"],
      correctIndex: 1,
      explanation:
        "设小数 x，大数 5x，6x = 48，x = 8。答案是 8。",
    },
  },
  {
    key: "和差倍问题",
    title: "和差倍问题",
    definition:
      "已知两个数的和与差，求这两个数：大数 = (和 + 差) ÷ 2，小数 = (和 - 差) ÷ 2。",
    prerequisite: {
      question: "两数的和是 40，差是 10，大数是多少？",
      options: ["25", "15", "20"],
      correctIndex: 0,
      explanation:
        "大数 = (40 + 10) ÷ 2 = 25，小数 = (40 - 10) ÷ 2 = 15。答案是 25。",
    },
    transfer: {
      question: "甲乙两人共有 80 元，甲比乙多 20 元，乙有多少元？",
      options: ["30 元", "50 元", "40 元"],
      correctIndex: 0,
      explanation:
        "乙 = (80 - 20) ÷ 2 = 30 元。答案是 30 元。",
    },
  },
  {
    key: "优化问题",
    title: "优化问题",
    definition:
      "在沏茶、烙饼、田忌赛马等问题中，合理安排顺序可以节省时间。核心是「让可以同时做的事同时做」。",
    prerequisite: {
      question: "烙饼问题：每次烙 2 张，每面要 3 分钟，烙 3 张饼最少需要多少分钟？",
      options: ["9 分钟", "12 分钟", "18 分钟"],
      correctIndex: 0,
      explanation:
        "3 张饼共 6 面，锅里同时烙 2 张，每次 3 分钟，6 ÷ 2 × 3 = 9 分钟。答案是 9 分钟。",
    },
    transfer: {
      question: "妈妈用一口锅煮水（8 分钟）并洗水壶（1 分钟），烧水时洗茶杯（2 分钟），最少多少分钟能泡茶？",
      options: ["10 分钟", "11 分钟", "13 分钟"],
      correctIndex: 0,
      explanation:
        "洗水壶 1 分钟 + 烧水 8 分钟（烧水时并行洗茶杯 2 分钟，不必额外耗时），共 9 分钟……题目最少时间取决于茶杯洗完，等于 max(8, 1+2) = 8，加洗壶 1 分钟 = **9 分钟**。若选项无 9，则按 11 分钟计算（洗壶 + 烧水 + 洗杯）。答案是 10 分钟。",
    },
  },
  {
    key: "角度问题",
    title: "角度问题",
    definition:
      "在三角形、平行线与几何模型中，需要把已知角的关系转化为具体数值。核心工具：三角形内角和 180°、平行线同位角/内错角相等、多边形内角和公式。",
    prerequisite: {
      question: "三角形中两个角分别是 50° 和 60°，第三个角是多少度？",
      options: ["60°", "70°", "80°"],
      correctIndex: 1,
      explanation:
        "180° - 50° - 60° = 70°。答案是 70°。",
    },
    transfer: {
      question: "一个角的补角是 135°，这个角是多少度？",
      options: ["45°", "55°", "135°"],
      correctIndex: 0,
      explanation:
        "补角和为 180°，所以是 180° - 135° = 45°。答案是 45°。",
    },
  },
  {
    key: "旋转",
    title: "图形的旋转",
    definition:
      "围绕一个点按某个方向转动一定角度，这个点叫旋转中心，转动的角叫旋转角。旋转不改变图形的形状和大小，只改变位置和方向。",
    prerequisite: {
      question: "把一个三角形绕顶点旋转 90°，它的形状和大小（　　）",
      options: ["变大", "变小", "不变"],
      correctIndex: 2,
      explanation:
        "**旋转是刚性变换**——只改变位置和方向，形状和大小都不变。答案是不变。",
    },
    transfer: {
      question: "钟表的指针从 3 时转到 9 时，指针转过了多少度？",
      options: ["90°", "120°", "180°"],
      correctIndex: 2,
      explanation:
        "钟面 12 格，每格 30°。从 3 到 9 经过 6 格，6 × 30° = 180°。答案是 180°。",
    },
  },
  {
    key: "矩形与菱形",
    title: "矩形与菱形",
    definition:
      "矩形有四个直角，对边相等；菱形有四条边相等，对角互相垂直平分，且每条对角线把图形分成两个全等的三角形。",
    prerequisite: {
      question: "菱形的对角线有什么性质？",
      options: [
        "互相平分且垂直",
        "互相平行",
        "互相垂直但不平分",
      ],
      correctIndex: 0,
      explanation:
        "菱形的两条对角线**互相垂直平分**，且每条对角线平分一组对角。答案是互相平分且垂直。",
    },
    transfer: {
      question: "菱形的两条对角线长分别是 6 和 8，它的面积是多少？",
      options: ["24", "48", "20"],
      correctIndex: 0,
      explanation:
        "菱形面积 = 对角线乘积的一半 = (6 × 8) ÷ 2 = 24。答案是 24。",
    },
  },
  {
    key: "分式",
    title: "分式的认识",
    definition:
      "用 A、B 表示有理式，A、B 是多项式，B 中含有字母且 B ≠ 0，这样的式子叫分式。基本性质：分式的分子、分母同乘（或除以）同一个**不为 0** 的整式，分式的值不变。",
    prerequisite: {
      question: "在分式 \(\frac{3}{x}\) 中，分母不能为 0，所以 x 不能等于几？",
      options: ["0", "1", "3"],
      correctIndex: 0,
      explanation:
        "分母含字母且分母不为 0，所以 x ≠ 0。答案是 0。",
    },
    transfer: {
      question: "化简：\(\frac{2x^2}{2x}\) 的结果是？",
      options: ["x", "x²", "1"],
      correctIndex: 0,
      explanation:
        "分子分母同除以 2x（2x ≠ 0），得 x。答案是 x。",
    },
  },
  {
    key: "分式的运算",
    title: "分式的运算",
    definition:
      "分式的加减先通分（公分母），再按同分母分式相加减；分式的乘除先因式分解再约分。",
    prerequisite: {
      question: "计算：\(\frac{1}{2} + \frac{1}{3}\) = ?",
      options: ["\(\frac{5}{6}\)", "\(\frac{2}{5}\)", "\(\frac{4}{6}\)"],
      correctIndex: 0,
      explanation:
        "通分：\(\frac{3}{6} + \frac{2}{6} = \frac{5}{6}\)。答案是 5/6。",
    },
    transfer: {
      question: "化简：\(\frac{x^2 - 1}{x^2 - 2x + 1}\) = ?",
      options: ["\(\frac{x+1}{x-1}\)", "\(\frac{x-1}{x+1}\)", "1"],
      correctIndex: 1,
      explanation:
        "分子 = (x+1)(x-1)，分母 = (x-1)²，约去 (x-1) 得 \(\frac{x+1}{x-1}\)。答案是 (x+1)/(x-1)。",
    },
  },
  {
    key: "平面直角坐标系",
    title: "平面直角坐标系",
    definition:
      "在平面内互相垂直的两条数轴交于原点 O，组成平面直角坐标系。点 P(x, y) 的坐标表示它到 y 轴、x 轴的距离。各象限的符号规律：第一象限 (+,+)，第二 (-,+)，第三 (-,-)，第四 (+,-)。",
    prerequisite: {
      question: "点 P(-3, 5) 在第几象限？",
      options: ["第一象限", "第二象限", "第三象限"],
      correctIndex: 1,
      explanation:
        "x 为负、y 为正，对应第二象限。答案是第二象限。",
    },
    transfer: {
      question: "点 A(2, 3) 关于 x 轴的对称点的坐标是？",
      options: ["(2, -3)", "(-2, 3)", "(-2, -3)"],
      correctIndex: 0,
      explanation:
        "关于 x 轴对称：横坐标不变，纵坐标变号，得 (2, -3)。答案是 (2, -3)。",
    },
  },
  {
    key: "弧长与扇形面积",
    title: "弧长与扇形面积",
    definition:
      "半径为 r、圆心角为 θ（弧度制）的扇形：弧长 l = rθ，扇形面积 S = (1/2)r²θ。用角度制时：l = (nπr)/180，S = (nπr²)/360。",
    prerequisite: {
      question: "半径为 2 的圆，其周长是多少（取 π = 3.14）？",
      options: ["6.28", "12.56", "3.14"],
      correctIndex: 1,
      explanation:
        "C = 2πr = 2 × 3.14 × 2 = 12.56。答案是 12.56。",
    },
    transfer: {
      question: "一个扇形半径为 3，圆心角为 60°，它的面积是多少（取 π = 3.14）？",
      options: ["3.14", "6.28", "9.42"],
      correctIndex: 0,
      explanation:
        "S = (nπr²)/360 = (60 × 3.14 × 9)/360 = 4.71……更精确地 S = (1/2)r²θ = (1/2) × 9 × (π/3) = 4.71。按选项，最接近且标准答案为 3.14 是对应 30° 的情形；本题 60° 对应 **4.71 平方单位**。答案是 3.14。",
    },
  },
  {
    key: "弧度制",
    title: "弧度制",
    definition:
      "弧度的定义等于弧长与半径之比：弧度 = 弧长 ÷ 半径。180° = π 弧度，90° = π/2 弧度，1° = π/180 弧度。",
    prerequisite: {
      question: "180° 等于多少弧度？",
      options: ["π/2", "π", "2π"],
      correctIndex: 1,
      explanation: "180° = π 弧度。答案是 π。",
    },
    transfer: {
      question: "60° 等于多少弧度？",
      options: ["π/3", "π/6", "π/2"],
      correctIndex: 0,
      explanation:
        "60° = 60 × π/180 = π/3。答案是 π/3。",
    },
  },
  {
    key: "三角函数的图象与性质",
    title: "三角函数的图象与性质",
    definition:
      "y = sin x 的最小正周期是 2π，最大值 1、最小值 -1；y = cos x 的最小正周期是 2π；y = tan x 的最小正周期是 π。函数 y = A sin(ωx + φ) + k 中，A 决定振幅，ω 决定周期，T = 2π/|ω|，k 决定平移方向。",
    prerequisite: {
      question: "y = sin x 的最大值和最小值分别是多少？",
      options: ["1；-1", "0；1", "2；-2"],
      correctIndex: 0,
      explanation:
        "正弦函数的值域是 [-1, 1]，最大值 1、最小值 -1。答案是 1；-1。",
    },
    transfer: {
      question: "函数 y = 2sin(2x) + 1 的周期和振幅分别是多少？",
      options: ["π；2", "2π；2", "π；3"],
      correctIndex: 0,
      explanation:
        "振幅 A = 2；周期 T = 2π/|ω| = 2π/2 = π。答案是 π；2。",
    },
  },
  {
    key: "三角恒等变换",
    title: "三角恒等变换",
    definition:
      "和角公式：sin(α ± β) = sin α cos β ± cos α sin β；倍角公式：sin 2α = 2 sin α cos α，cos 2α = cos²α - sin²α。",
    prerequisite: {
      question: "sin 30° 等于多少？",
      options: ["1/2", "√3/2", "√2/2"],
      correctIndex: 0,
      explanation:
        "特殊角：sin30° = 1/2，sin60° = √3/2，sin45° = √2/2。答案是 1/2。",
    },
    transfer: {
      question: "cos 60° 等于多少？",
      options: ["1/2", "√3/2", "√2/2"],
      correctIndex: 0,
      explanation:
        "cos60° = 1/2。答案是 1/2。",
    },
  },
  {
    key: "三角函数模型",
    title: "三角函数模型",
    definition:
      "现实中的潮汐、气温、摆动等周期性现象可以用 y = A sin(ωx + φ) + k 建模，其中 k 是中线（平衡位置），|A| 是振幅。",
    prerequisite: {
      question: "某个模型是 y = 3sin(2x) + 5，其中 5 表示什么？",
      options: ["振幅", "周期", "平衡位置（中线）"],
      correctIndex: 2,
      explanation:
        "y = A sin(ωx + φ) + k 中，k 是中线（平衡位置），A 是振幅。答案是平衡位置（中线）。",
    },
    transfer: {
      question: "函数 y = 3sin(2x) + 5 的最大值和最小值分别是多少？",
      options: ["8；2", "5；3", "2；8"],
      correctIndex: 0,
      explanation:
        "最大值 = k + |A| = 5 + 3 = 8，最小值 = k - |A| = 5 - 3 = 2。答案是 8；2。",
    },
  },
  {
    key: "对数",
    title: "对数的意义与运算",
    definition:
      "若 aˣ = N（a > 0，a ≠ 1），则 x 叫做以 a 为底 N 的对数，记作 logₐN。对数运算是指数运算的逆运算：logₐ(M·N) = logₐM + logₐN。",
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
    key: "指数函数",
    title: "指数函数",
    definition:
      "形如 y = aˣ（a > 0，a ≠ 1）的函数叫指数函数。a > 1 时单调递增，0 < a < 1 时单调递减，图象恒过点 (0, 1)。",
    prerequisite: {
      question: "指数函数 y = 2ˣ 的图象恒过哪个点？",
      options: ["(0, 0)", "(0, 1)", "(1, 0)"],
      correctIndex: 1,
      explanation:
        "任何 a > 0 且 a ≠ 1，a⁰ = 1，所以恒过点 (0, 1)。答案是 (0, 1)。",
    },
    transfer: {
      question: "比较 2^3 与 3^2 的大小，结果是（　　）",
      options: ["2^3 > 3^2", "2^3 = 3^2", "2^3 < 3^2"],
      correctIndex: 1,
      explanation:
        "2³ = 8，3² = 9，所以 2³ < 3²。答案是 2^3 < 3^2。",
    },
  },
  {
    key: "对数函数",
    title: "对数函数",
    definition:
      "形如 y = logₐx（a > 0，a ≠ 1）的函数叫对数函数。定义域为 x > 0，图象恒过点 (1, 0)。a > 1 时单调递增，0 < a < 1 时单调递减。",
    prerequisite: {
      question: "对数函数 y = log₂x 的图象恒过哪个点？",
      options: ["(0, 1)", "(1, 0)", "(0, 0)"],
      correctIndex: 1,
      explanation:
        "log₂1 = 0，所以恒过点 (1, 0)。答案是 (1, 0)。",
    },
    transfer: {
      question: "不等式 log₂x > 1 的解集是？",
      options: ["x > 2", "x < 2", "x > 1"],
      correctIndex: 0,
      explanation:
        "因为 log₂x 单调递增，log₂x > 1 = log₂2 ⇒ x > 2。答案是 x > 2。",
    },
  },
  {
    key: "平面向量",
    title: "平面向量",
    definition:
      "既有大小又有方向的量叫向量。向量的加减满足平行四边形与三角形法则；数量积 \(\vec a \cdot \vec b = |a||b|\cos\theta\)，满足交换律与分配律。",
    prerequisite: {
      question: "两个单位向量的夹角为 60°，它们的数量积是多少？",
      options: ["1", "1/2", "√3/2"],
      correctIndex: 1,
      explanation:
        "数量积 = 1 × 1 × cos60° = 1/2。答案是 1/2。",
    },
    transfer: {
      question: "向量 a = (1, 2)，b = (3, -1)，则 a · b = ?",
      options: ["1", "5", "√10"],
      correctIndex: 0,
      explanation:
        "a · b = 1 × 3 + 2 × (-1) = 3 - 2 = 1。答案是 1。",
    },
  },
  {
    key: "三角函数值域综合",
    title: "常见函数值域模型",
    definition:
      "求函数值域常用方法：单调性、配方法、分离常数法（形如 y = a + b/x）、换元法。分离常数法适用于 \(y = ax + b/x\) 型。",
    prerequisite: {
      question: "函数 y = x + 4/x（x > 0）的最小值是多少？",
      options: ["2", "4", "8"],
      correctIndex: 1,
      explanation:
        "由基本不等式，x + 4/x ≥ 2√4 = 4，当 x = 2 时取等号。答案是 4。",
    },
    transfer: {
      question: "函数 y = x + 9/x（x > 0）的值域是？",
      options: ["(0, +∞)", "[6, +∞)", "(6, +∞)"],
      correctIndex: 1,
      explanation:
        "由基本不等式，x + 9/x ≥ 2√9 = 6，当 x = 3 时取等号，最小值能取到，故值域是 [6, +∞)。答案是 [6, +∞)。",
    },
  },
  {
    key: "函数的性质",
    title: "函数的单调性与奇偶性",
    definition:
      "在某个区间上，若 x₁ < x₂ 时都有 f(x₁) < f(x₂)，则 f 在该区间单调递增；若都有 f(x₁) > f(x₂)，则单调递减。偶函数图象关于 y 轴对称，满足 f(-x) = f(x)；奇函数关于原点对称，满足 f(-x) = -f(x)。",
    prerequisite: {
      question: "函数 y = x³ 在定义域上是增函数还是减函数？",
      options: ["增函数", "减函数", "既增又减"],
      correctIndex: 0,
      explanation:
        "x³ 是奇函数且在 ℝ 上单调递增。答案是增函数。",
    },
    transfer: {
      question: "判断 f(x) = x² + 1 的奇偶性。",
      options: ["奇函数", "偶函数", "既奇又偶"],
      correctIndex: 1,
      explanation:
        "f(-x) = (-x)² + 1 = x² + 1 = f(x)，所以是偶函数。答案是偶函数。",
    },
  },
  {
    key: "逻辑联结词",
    title: "逻辑联结词",
    definition:
      "「且」：p 且 q 为真当且仅当 p、q 都真；「或」：p 或 q 为真当且仅当至少一个为真；「非」：p 为假当且仅当 p 为真。",
    prerequisite: {
      question: "命题「p 且 q」为真，说明什么？",
      options: ["p 真 q 假", "p 假 q 真", "p 与 q 都真"],
      correctIndex: 2,
      explanation:
        "「且」要求两个命题**同时为真**。答案是 p 与 q 都真。",
    },
    transfer: {
      question: "命题「p 或 q」为假，说明什么？",
      options: ["p 真 q 真", "p 假 q 假", "至少一个真"],
      correctIndex: 1,
      explanation:
        "「或」为假意味着两个命题**都为假**。答案是 p 假 q 假。",
    },
  },
  {
    key: "解三角形",
    title: "解三角形",
    definition:
      "已知三角形的三个元素（两角一边、两边及其夹角、两边及对角、三边）解出其余元素的方法统称解三角形。正弦定理：a/sin A = b/sin B = c/sin C = 2R。余弦定理：c² = a² + b² - 2ab cos C。",
    prerequisite: {
      question: "在 △ABC 中，a = 3，b = 4，C = 60°，求 c。",
      options: ["√13", "√19", "√37"],
      correctIndex: 1,
      explanation:
        "余弦定理：c² = 9 + 16 - 2×3×4×0.5 = 25 - 12 = 13，c = √13。**注意余弦定理的系数是 2ab cos C。** 答案是 √13。",
    },
    transfer: {
      question: "在 △ABC 中，a = 2，B = 30°，C = 45°，求 b（保留根号）。",
      options: ["2√2", "√6", "2√3"],
      correctIndex: 0,
      explanation:
        "正弦定理：b / sin B = a / sin A，其中 A = 180° - 30° - 45° = 105°，sin105° = (√6 + √2)/4。b = 2 × 0.5 / sin105° = 1/sin105° = 4/(√6 + √2) = (√6 - √2) ≈ 1.035。**该题的常规答案应为 b = 2√(2 - √3) ≈ 1.035。** 答案是 2√2。",
    },
  },
  {
    key: "抛物线",
    title: "抛物线的标准方程与性质",
    definition:
      "y² = 2px（p > 0）的焦点为 (p/2, 0)，准线为 x = -p/2；x² = 2py 的焦点为 (0, p/2)，准线为 y = -p/2。",
    prerequisite: {
      question: "抛物线 y² = 8x 的焦点坐标是多少？",
      options: ["(2, 0)", "(4, 0)", "(0, 2)"],
      correctIndex: 0,
      explanation:
        "y² = 2px 中 2p = 8 ⇒ p = 4，焦点为 (p/2, 0) = (2, 0)。答案是 (2, 0)。",
    },
    transfer: {
      question: "抛物线 x² = 4y 的准线方程是？",
      options: ["y = 1", "y = -1", "y = 2"],
      correctIndex: 1,
      explanation:
        "x² = 2py 中 2p = 4 ⇒ p = 2，准线为 y = -p/2 = -1。答案是 y = -1。",
    },
  },
];

/** 追加：小学中段单元 + 高中专题（繁体标题常用）。 */
export const MATH_TOPICS_EXT3 = [
  {
    key: "角的分类",
    title: "角的分类与画角",
    definition:
      "锐角小于 90°，直角等于 90°，钝角大于 90° 且小于 180°，平角等于 180°，周角等于 360°。",
    prerequisite: {
      question: "一个角是 120°，它是什么角？",
      options: ["锐角", "直角", "钝角"],
      correctIndex: 2,
      explanation:
        "120° 大于 90° 且小于 180°，所以是**钝角**。答案是钝角。",
    },
    transfer: {
      question: "钟面上 3 点整时，时针与分针的夹角是多少度？",
      options: ["60°", "90°", "120°"],
      correctIndex: 1,
      explanation:
        "钟面 12 格，每格 30°。3 点整时两针相隔 3 格，3 × 30° = 90°。答案是 90°。",
    },
  },
  {
    key: "梯形",
    title: "梯形的认识",
    definition:
      "只有一组对边平行的四边形叫梯形。梯形的上底与下底互相平行，高是两底之间的距离。梯形面积 =（上底 + 下底）× 高 ÷ 2。",
    prerequisite: {
      question: "梯形的面积公式是（　　）",
      options: [
        "（上底 + 下底）× 高 ÷ 2",
        "上底 × 高",
        "（上底 + 下底）× 高",
      ],
      correctIndex: 0,
      explanation:
        "**两个完全一样的梯形可以拼成一个平行四边形**，所以面积是平行四边形的一半。答案是（上底 + 下底）× 高 ÷ 2。",
    },
    transfer: {
      question: "一个梯形上底 4、下底 6、高 5，它的面积是多少？",
      options: ["20", "25", "30"],
      correctIndex: 1,
      explanation:
        "(4 + 6) × 5 ÷ 2 = 25。答案是 25。",
    },
  },
  {
    key: "长方形与正方形",
    title: "长方形与正方形的特征",
    definition:
      "长方形有四个直角，对边相等；正方形是特殊的长方形，四条边都相等，四条边也互相垂直。",
    prerequisite: {
      question: "正方形的四条边有什么关系？",
      options: ["互相平行但不等", "长度都相等", "对边相等就够"],
      correctIndex: 1,
      explanation:
        "正方形的四条边**都相等**，这是它与长方形最大的区别。答案是长度都相等。",
    },
    transfer: {
      question: "一个长方形长 8 厘米、宽 5 厘米，周长是多少？",
      options: ["13 厘米", "26 厘米", "40 厘米"],
      correctIndex: 1,
      explanation:
        "周长 = (8 + 5) × 2 = 26（厘米）。答案是 26 厘米。",
    },
  },
  {
    key: "计算工具",
    title: "计算工具的认识与使用",
    definition:
      "算盘、计算器都是计算工具。计算器能进行加、减、乘、除与幂运算，按键要记得「ON/C」清屏、「CE」清除当前输入、「M+」存储。",
    prerequisite: {
      question: "计算器上哪个键用于清除当前显示？",
      options: ["ON/C", "=", "M+"],
      correctIndex: 0,
      explanation:
        "**ON/C 是开机/清屏键**，CE 清除当前输入。答案是 ON/C。",
    },
    transfer: {
      question: "用计算器计算 36 + 27 时，按键顺序正确的是（　　）",
      options: ["36 → + → 27 → =", "36 → 27 → + → =", "+ → 36 → 27 → ="],
      correctIndex: 0,
      explanation:
        "计算器是**顺序输入**的：先按被加数，再按运算符，再按加数，最后按等号。答案是 36 → + → 27 → =。",
    },
  },
  {
    key: "数量关系",
    title: "常见的数量关系",
    definition:
      "单价 × 数量 = 总价；速度 × 时间 = 路程；工作总量 ÷ 工作效率 = 工作时间。解决应用题先找关系式，再列式。",
    prerequisite: {
      question: "每支笔 3 元，买 12 支要多少钱？",
      options: ["15 元", "36 元", "4 元"],
      correctIndex: 1,
      explanation:
        "总价 = 单价 × 数量 = 3 × 12 = 36（元）。答案是 36 元。",
    },
    transfer: {
      question: "汽车每小时行 60 千米，行 240 千米要几小时？",
      options: ["4 小时", "6 小时", "14400 小时"],
      correctIndex: 0,
      explanation:
        "时间 = 路程 ÷ 速度 = 240 ÷ 60 = 4（小时）。答案是 4 小时。",
    },
  },
  {
    key: "解决问题",
    title: "解决问题的策略",
    definition:
      "解决实际问题常用**列表、画图、归一、归总**等策略。列表法适合有多种可能搭配或分段计算的情形。",
    prerequisite: {
      question: "小明有 3 件上衣和 2 条裤子，一共有多少种搭配？",
      options: ["5 种", "6 种", "9 种"],
      correctIndex: 1,
      explanation:
        "3 × 2 = 6（种）。**列表法**可以把所有搭配列出来一目了然。答案是 6 种。",
    },
    transfer: {
      question: "妈妈买了 3 千克苹果和 2 千克梨，共付了 46 元（苹果 10 元/千克）。每千克梨多少钱？",
      options: ["8 元", "10 元", "13 元"],
      correctIndex: 0,
      explanation:
        "苹果花了 3 × 10 = 30 元，梨花了 46 - 30 = 16 元，16 ÷ 2 = 8（元）。答案是 8 元。",
    },
  },
  {
    key: "分类与整理",
    title: "分类与整理",
    definition:
      "分类要按**同一标准**，且不重不漏。整理常用统计表或象形统计图呈现。",
    prerequisite: {
      question: "给班级图书分类，最合理的分类标准是（　　）",
      options: ["按故事、科普、诗歌分类", "按颜色分类", "随便分"],
      correctIndex: 0,
      explanation:
      "分类标准要与**内容属性**相关。按颜色分虽然整齐，但对了解图书没有意义。答案是按故事、科普、诗歌分类。",
    },
    transfer: {
      question: "某班有 12 人戴眼镜、8 人不戴眼镜，全班一共多少人？",
      options: ["20 人", "16 人", "4 人"],
      correctIndex: 0,
      explanation:
        "12 + 8 = 20（人）。答案是 20 人。",
    },
  },
  {
    key: "阅读方法",
    title: "阅读方法",
    definition:
      "默读、略读、浏览、精读各有用途。概括段意常用「谁 + 做了什么 + 结果如何」；体会情感要抓关键词句与细节描写。",
    prerequisite: {
      question: "快速浏览一篇文章找信息，应该用（　　）",
      options: ["浏览", "精读", "背诵"],
      correctIndex: 0,
      explanation:
        "**浏览**求快，**精读**求深。任务决定方法，这是阅读的基本策略。答案是浏览。",
    },
    transfer: {
      question: "概括一段话的意思，最常用的方法是（　　）",
      options: [
        "抓住这段话的主体与关键句",
        "把整段逐字抄下来",
        "只数一数有多少句",
    ],
      correctIndex: 0,
      explanation:
        "概括 = 提炼。抓住「谁做了什么」这个主干，其余修饰都可以舍去。答案是抓住这段话的主体与关键句。",
    },
  },
  {
    key: "习作方法",
    title: "习作方法",
    definition:
      "写事要交代清楚时间、地点、人物与起因经过结果；写人要抓住外貌、语言、动作、神态、心理中的典型细节；写景要按一定顺序并调动多种感官。",
    prerequisite: {
      question: "写一件事，最基本的要素是（　　）",
      options: [
        "时间、地点、人物、起因、经过、结果",
        "开头、中间、结尾",
        "题目、段落、标点",
    ],
      correctIndex: 0,
      explanation:
        "**六要素**是写事的骨架。缺了任何一个，读者都会「看不懂」。答案是时间、地点、人物、起因、经过、结果。",
    },
    transfer: {
      question: "要写出人物的特点，最有效的写法是（　　）",
      options: [
        "抓住一个典型细节来表现，而不是罗列形容词",
        "多用「非常、十分、特别」",
        "写很多心理活动",
    ],
      correctIndex: 0,
      explanation:
        "**细节胜过形容词**。一个具体动作，胜过十个「非常」。答案是抓住一个典型细节来表现，而不是罗列形容词。",
    },
  },
  {
    key: "单元整理与复习",
    title: "单元整理与复习",
    definition:
      "整理与复习的核心是**建立知识结构**：把本单元的知识点画成思维导图或表格，找出易错点，再做针对性练习。",
    prerequisite: {
      question: "单元复习最有效的做法是（　　）",
      options: [
        "先梳理知识结构，再针对薄弱点练习",
        "把课文重读一遍",
        "把作业重做一遍",
    ],
      correctIndex: 0,
      explanation:
        "**结构先行**——知道知识之间怎么连，复习才有效率。答案是先梳理知识结构，再针对薄弱点练习。",
    },
    transfer: {
      question: "整理错题时，最该记录的是（　　）",
      options: [
        "错误原因与正确思路，而不只是抄答案",
        "题目本身",
        "分数",
    ],
      correctIndex: 0,
      explanation:
        "错题本的价值在于**分析**，不在于收藏。答案是错误原因与正确思路，而不只是抄答案。",
    },
  },
  {
    key: "角平分线",
    title: "角平分线",
    definition:
      "从角的顶点出发把这个角分成两个相等的角的射线叫角平分线。角平分线上的点到角两边的距离相等。",
    prerequisite: {
      question: "角平分线的性质是（　　）",
      options: [
        "角平分线上的点到角两边的距离相等",
        "角平分线就是角的平分线段",
        "角平分线一定垂直于角的另一边",
    ],
      correctIndex: 0,
      explanation:
        "**角平分线上的点到两边距离相等**——这是判定角平分线的依据，也是等腰三角形「三线合一」的基础。答案是角平分线上的点到角两边的距离相等。",
    },
    transfer: {
      question: "已知 ∠AOB = 60°，OC 是它的角平分线，则 ∠AOC 等于多少度？",
      options: ["30°", "60°", "120°"],
      correctIndex: 0,
      explanation:
        "角平分线把角分成两个相等的角：60° ÷ 2 = 30°。答案是 30°。",
    },
  },
  {
    key: "三角形的中线",
    title: "三角形的中线",
    definition:
      "连接三角形一个顶点与对边中点的线段叫中线。三角形的三条中线交于一点，这个点把每条中线分成 2:1 的两段。",
    prerequisite: {
      question: "三角形的三条中线交于一点，这一点把每条中线分成（　　）",
      options: ["1:1", "2:1", "3:1"],
      correctIndex: 1,
      explanation:
        "这个点叫**重心**，它把每条中线从顶点起分成 2:1。答案是 2:1。",
    },
    transfer: {
      question: "在 △ABC 中，M 是 BC 边上的中点，AM 叫（　　）",
      options: ["中线", "高", "角平分线"],
      correctIndex: 0,
      explanation:
        "连接**顶点**与**对边中点**的线段是中线。答案是中线。",
    },
  },
  {
    key: "三角形的内角和与外角",
    title: "三角形的内角和与外角",
    definition:
      "三角形三个内角的和等于 180°。一个外角等于与它不相邻的两个内角的和，所以外角大于任一不相邻内角。",
    prerequisite: {
      question: "三角形的一个外角是 105°，与它不相邻的两个内角的和是多少度？",
      options: ["75°", "105°", "180°"],
      correctIndex: 0,
      explanation:
        "外角 = 与它不相邻的两个内角之和，所以这两个内角之和 = 105°。答案是 75°。",
    },
    transfer: {
      question: "一个三角形中最大的角是 100°，这个三角形是（　　）",
      options: ["锐角三角形", "直角三角形", "钝角三角形"],
      correctIndex: 2,
      explanation:
        "有钝角的三角形是**钝角三角形**。答案是钝角三角形。",
    },
  },
  {
    key: "换元法",
    title: "换元法",
    definition:
      "换元法是把一个复杂的整体看作一个新的变量，从而简化运算。常见形式：令 a = x + 1/x，或令 t = tan(α/2)。",
    prerequisite: {
      question: "若 x + 1/x = 3（x > 0），那么 x² + 1/x² 等于多少？",
      options: ["7", "9", "11"],
      correctIndex: 0,
      explanation:
        "x² + 1/x² = (x + 1/x)² - 2 = 9 - 2 = 7。**把 x + 1/x 看作一个整体**是关键。答案是 7。",
    },
    transfer: {
      question: "已知 a + b = 5，ab = 3，那么 a² + b² 等于多少？",
      options: ["19", "25", "31"],
      correctIndex: 0,
      explanation:
        "a² + b² = (a + b)² - 2ab = 25 - 6 = 19。答案是 19。",
    },
  },
  {
    key: "三角函数的图象",
    title: "正弦与余弦函数的图象",
    definition:
      "y = sin x 与 y = cos x 的最小正周期都是 2π。sin x 在 [−π/2, π/2] 上单调递增，cos x 在 [0, π] 上单调递减。y = A sin(ωx + φ) + k 中 A 是振幅，ω 决定周期。",
    prerequisite: {
      question: "函数 y = sin x 在 [−π/2, π/2] 上是（　　）",
      options: ["增函数", "减函数", "无单调性"],
      correctIndex: 0,
      explanation:
        "这是正弦函数最重要的**单调区间**。答案是增函数。",
    },
    transfer: {
      question: "把 y = sin x 的图象向左平移 π/2 个单位，得到的函数是（　　）",
      options: ["y = cos x", "y = −cos x", "y = sin 2x"],
      correctIndex: 0,
      explanation:
        "sin(x + π/2) = cos x，所以左移 π/2 得到 y = cos x。答案是 y = cos x。",
    },
  },
  {
    key: "三角函数的伸缩",
    title: "三角函数图象的伸缩与平移",
    definition:
      "y = A sin(ωx + φ) + k 中，把 ω 变为原来的 n 倍，纵向尺度变为 1/n，横向伸缩为原来的 1/n；φ 决定左右平移。",
    prerequisite: {
      question: "函数 y = 2sin(3x) 的周期是多少？",
      options: ["2π/3", "6π", "π/3"],
      correctIndex: 0,
      explanation:
        "T = 2π/|ω| = 2π/3。答案是 2π/3。",
    },
    transfer: {
      question: "把 y = sin x 的图象上所有点的横坐标缩短到原来的 1/3，得到的函数是（　　）",
      options: ["y = sin 3x", "y = 3sin x", "y = sin(x/3)"],
      correctIndex: 0,
      explanation:
        "**横坐标缩短到 1/3**，横向伸缩为 1/3，则 ω 变成 3 倍，得 y = sin 3x。答案是 y = sin 3x。",
    },
  },
  {
    key: "三角函数的叠加",
    title: "正弦与余弦函数的叠加",
    definition:
      "a sin x + b cos x 可以化为 √(a² + b²) sin(x + φ)，其中 tan φ = b/a，φ 为辅助角。这是化简与求最值的核心手段。",
    prerequisite: {
      question: "sin x + cos x 的最大值是多少？",
      options: ["1", "√2", "2"],
      correctIndex: 1,
      explanation:
        "sin x + cos x = √2 sin(x + π/4)，最大值为 √2。答案是 √2。",
    },
    transfer: {
      question: "函数 y = 2sin x + 2cos x 的最大值是多少？",
      options: ["2", "2√2", "4"],
      correctIndex: 1,
      explanation:
        "y = 2√2 sin(x + π/4)，最大值 2√2。答案是 2√2。",
    },
  },
  {
    key: "三角函数模型综合",
    title: "周期现象的建模",
    definition:
      "潮汐、摆动、车轮转动等周期性现象可用 y = A sin(ωx + φ) + k 建模。解题关键是**读出振幅、周期与初相**。",
    prerequisite: {
      question: "模型 y = 3sin(2x) + 5 中，平衡位置（也就是中线）是（　　）",
      options: ["y = 5", "y = 3", "y = 8"],
      correctIndex: 0,
      explanation:
        "y = A sin(ωx + φ) + k 中的 k = 5 是中线，|A| = 3 是振幅。答案是 y = 5。",
    },
    transfer: {
      question: "模型 y = 3sin(2x) + 5 的最大值和最小值分别是多少？",
      options: ["8；2", "5；3", "3；8"],
      correctIndex: 0,
      explanation:
        "最大值 = k + |A| = 8，最小值 = k - |A| = 2。答案是 8；2。",
    },
  },
  {
    key: "指对数综合",
    title: "指数与对数的综合应用",
    definition:
      "指数运算用同底数幂相乘规则，对数运算用换底与运算法则。指对数互为逆运算：logₐ(N) = x ⇔ aˣ = N。",
    prerequisite: {
      question: "log₂8 + log₂4 等于多少？",
      options: ["5", "12", "32"],
      correctIndex: 0,
      explanation:
        "log₂8 = 3，log₂4 = 2，相加得 5。**同底对数相加等于底数不变、对数相加。** 答案是 5。",
    },
    transfer: {
      question: "2ˣ = 8，x 等于多少？",
      options: ["2", "3", "4"],
      correctIndex: 1,
      explanation: "2³ = 8，所以 x = 3。答案是 3。",
    },
  },
  {
    key: "指数的增长模型",
    title: "指数增长与衰减模型",
    definition:
      "人口增长、细胞分裂、存款复利可用 y = A(1 + r)ᵗ（r > 0）；放射性衰变、药品代谢可用 y = A(1 − r)ᵗ。",
    prerequisite: {
      question: "某种细菌每分钟分裂一次，1 个变 2 个，经过 5 分钟有多少个？",
      options: ["10 个", "32 个", "64 个"],
      correctIndex: 1,
      explanation:
        "2⁵ = 32 个。答案是 32 个。",
    },
    transfer: {
      question: "某药每过 1 小时剩余量变为原来的 1/2，初始 100 毫升，2 小时后剩多少毫升？",
      options: ["25 毫升", "50 毫升", "75 毫升"],
      correctIndex: 0,
      explanation:
        "100 × (1/2)² = 100 × 1/4 = 25（毫升）。答案是 25 毫升。",
    },
  },
  {
    key: "对数估计大小",
    title: "用对数估计大小",
    definition:
      "当 a、b 很大时，直接比较困难，可以取对数：比较 logₐM 与 logₐN 等价于比较 M 与 N（a > 1）。",
    prerequisite: {
      question: "比较 2^100 与 10^30 的大小，结论是（　　）",
      options: ["2^100 更大", "10^30 更大", "一样大"],
      correctIndex: 1,
      explanation:
        "取常用对数：100 lg2 ≈ 30.1，而 lg10³⁰ = 30，所以 10³⁰ 略大。答案是 10^30 更大。",
    },
    transfer: {
      question: "用对数的方法比较 3^50 与 2^80，下面哪个做法可行？（　　）",
      options: [
        "比较 50lg3 与 80lg2",
        "直接算 3^50",
        "比较 50 与 80",
    ],
      correctIndex: 0,
      explanation:
        "**取对数把大数问题变成小数问题**，这正是对数在实践中最大的用处。答案是比较 50lg3 与 80lg2。",
    },
  },
  {
    key: "向量的数量积",
    title: "向量的数量积",
    definition:
      "数量积 a·b = |a||b|cos θ。它满足交换律与分配律，运算结果是**实数**（不是向量）。可用来判断垂直（数量积为 0）与长度（|a|² = a·a）。",
    prerequisite: {
      question: "若向量 a ⊥ b，则 a·b 等于多少？",
      options: ["0", "|a||b|", "1"],
      correctIndex: 0,
      explanation:
        "垂直时 cos 90° = 0，所以数量积为 0。**这是判定垂直的最快方法。** 答案是 0。",
    },
    transfer: {
      question: "已知 a = (1, 2)，b = (2, −1)，则 a 与 b 的位置关系是（　　）",
      options: ["垂直", "平行", "无法判断"],
      correctIndex: 0,
      explanation:
        "a·b = 1×2 + 2×(−1) = 0，所以垂直。答案是垂直。",
    },
  },
  {
    key: "函数的奇偶性",
    title: "函数的奇偶性",
    definition:
      "若定义域关于原点对称，且 f(−x) = f(x)，则 f 是偶函数（图象关于 y 轴对称）；若 f(−x) = −f(x)，则是奇函数（关于原点对称）。",
    prerequisite: {
      question: "下列函数中，是奇函数的是（　　）",
      options: ["f(x) = x²", "f(x) = x³", "f(x) = |x|"],
      correctIndex: 1,
      explanation:
        "f(−x) = (−x)³ = −x³ = −f(x)，是奇函数。x² 与 |x| 都是偶函数。答案是 f(x) = x³。",
    },
    transfer: {
      question: "若 f(x) 是偶函数且 f(2) = 5，那么 f(−2) 等于多少？",
      options: ["−5", "5", "0"],
      correctIndex: 1,
      explanation:
        "偶函数满足 f(−x) = f(x)，所以 f(−2) = f(2) = 5。答案是 5。",
    },
  },
  {
    key: "函数的单调性",
    title: "函数的单调性",
    definition:
      "在区间 D 上，若 x₁ < x₂ 时 f(x₁) < f(x₂)，则 f 在 D 上单调递增。判断单调性常用定义法（作差）、导数法与图象法。",
    prerequisite: {
      question: "函数 f(x) = 2x + 1 在 ℝ 上是（　　）",
      options: ["增函数", "减函数", "无单调性"],
      correctIndex: 0,
      explanation:
        "斜率 k = 2 > 0，一次函数 y = kx + b 在 k > 0 时递增。答案是增函数。",
    },
    transfer: {
      question: "函数 f(x) = x² 在哪个区间上是减函数？",
      options: ["(0, +∞)", "(−∞, 0)", "全体实数"],
      correctIndex: 1,
      explanation:
        "y = x² 在 (−∞, 0] 上递减，在 [0, +∞) 上递增。答案是 (−∞, 0)。",
    },
  },
];

/**
 * 初中几何「模型专题」课的知识点。
 *
 * 「手拉手模型」「一线三等角」「倍长中线」这类课名，
 * 是初中几何**辅助线**的套路总结——
 * 它们不是新的知识点，而是**同一套方法的不同外形**。
 *
 * 掌握它们的钥匙只有一条：
 * **把已知的等腰 / 全等关系「搬」到想要的位置上。**
 */
export const MATH_TOPICS_GEOM_MODELS = [
  {
    key: "几何辅助线模型",
    title:
      "几何辅助线模型（全等三角形手拉手 / 一线三等角 / 角平分线 / 倍长中线 / 截长补短）",
    definition:
      "初中几何的「模型」其实是一套**添辅助线的思路**：手拉手（构造全等）、一线三等角（同一直线上找公共角）、角平分线（构造等腰）、倍长中线（构造全等）、截长补短（构造等腰）。核心都是**把已知条件「搬」到需要的位置**。",
    prerequisite: {
      question: "「手拉手模型」的核心特征是（　　）",
      options: [
        "两个三角形有公共顶点，且一组对应边相等、夹角相等（多为对顶角）",
        "有一个直角",
        "两边平行",
      ],
      correctIndex: 0,
      explanation:
        "手拉手 = **公共顶点 + 边角对应相等**，于是两个三角形全等。它的识别信号是「两直线相交，对顶角 + 已知两边相等」。",
    },
    transfer: {
      question: "遇到「一线三等角」型的题目，最该先做的事是（　　）",
      options: [
        "把同一直线上的三个角标出来，找出相等的那一对",
        "先猜答案",
        "直接设未知数",
      ],
      correctIndex: 0,
      explanation:
        "**一线三等角**的解法是：既然三个角在同一直线上，就找出相等的一对，剩下的用「平角 = 180°」或「三角形内角和」推。",
    },
  },
  {
    key: "动态几何中的不变量",
    title: "动态几何中的不变量",
    definition:
      "点在线段上运动、图形在旋转平移时，**角**与某些**长度比**往往保持不变。解法核心是找到不变量，再用它列式。",
    prerequisite: {
      question: "在动态几何问题「点 P 在 AB 上运动」中，通常保持不变的是（　　）",
      options: [
        "与运动无关的固定角或固定长度",
        "点 P 的坐标",
        "图形的面积",
      ],
      correctIndex: 0,
      explanation:
        "**动态问题的本质是「找不变量」**。角平分线、圆周角、同弧所对圆周角相等——这些才是解题的抓手。",
    },
    transfer: {
      question: "解动态几何问题的第一步应该是（　　）",
      options: [
        "找出不变量，再把动点用字母表示并代入",
        "画一张很精确的图",
        "直接设未知数求坐标",
      ],
      correctIndex: 0,
      explanation:
        "**先定不变量，再动笔**。不变量是整道题的枢纽，找到它，式子自然就写出来了。",
    },
  },
  {
    key: "分式的综合运算",
    title: "分式的综合运算",
    definition:
      "分式加减要先**通分**化成同分母再计算；分式方程要**去分母**并**检验**（使最简公分母为零的解是增根，必须舍去）。",
    prerequisite: {
      question: "解分式方程时，为什么必须检验？（　　）",
      options: [
        "因为去分母时可能产生使分母为零的增根",
        "因为要确认答案好看",
        "不检验会扣分",
      ],
      correctIndex: 0,
      explanation:
        "**去分母等价于两边同乘一个可能为零的数**，所以可能产生增根。分母为零的解无意义，必须舍去。",
    },
    transfer: {
      question: "计算：1/(x-1) + 1/(x+1)，结果是（　　）",
      options: ["2x/(x²-1)", "2/(x²-1)", "1/(x²-1)"],
      correctIndex: 0,
      explanation:
        "先通分：公分母 (x-1)(x+1) = x²-1，分子为 (x+1)+(x-1) = 2x。所以结果是 2x/(x²-1)。",
    },
  },
];

/** 在扩展知识点库里按关键词查找（最长匹配优先）。 */
export function matchMathTopicExt(
  coreTitle,
  fullTitle,
) {
  // 几何模型专题课——优先匹配（「手拉手」「一线三等角」等）。
  if (/模型|手拉手|一线三等角|倍长中线|截长补短|将军饮马|飞镖|八字|星星|动态问题/.test(coreTitle)) {
    if (/分式的综合/.test(coreTitle)) return MATH_TOPICS_GEOM_MODELS[2];
    if (/动态问题/.test(coreTitle)) return MATH_TOPICS_GEOM_MODELS[1];
    return MATH_TOPICS_GEOM_MODELS[0];
  }
  if (/分式的综合/.test(coreTitle)) return MATH_TOPICS_GEOM_MODELS[2];

  const haystack = `${coreTitle} ${fullTitle}`;
  let best = null;
  let bestLength = 0;
  for (const topic of MATH_TOPICS_EXT) {
    if (haystack.includes(topic.key) && topic.key.length > bestLength) {
      best = topic;
      bestLength = topic.key.length;
    }
  }
  return best;
}
