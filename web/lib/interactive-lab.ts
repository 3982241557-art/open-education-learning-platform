/**
 * 互动动画实验室 · 数据模型
 * ==========================
 *
 * 每集课程带一个 ``interactive_lab`` 字段——描述这一集**能玩什么**。
 *
 * 为什么是「数据」而不是「组件」
 * ----------------------------
 *
 * 因为**知识点在数据里，玩具是通用的**。
 *
 * 一门课有上千集，但真正需要**不同玩具**的只有十几种：
 *
 * ===============  =============================================
 * 学段 · 学科       玩具
 * ===============  =============================================
 * 小学语文          生字笔顺（hanzi-writer）· 分句图解
 * 初高中语文        名篇精读与意象赏析（literary）
 * 小学数学          数轴 · 凑十方块 · 分数 · 面积 · 平移对称
 * 初高中数学        函数图像 · 动态几何 · 概率 · 代数
 * ===============  =============================================
 *
 * 所以我们做的是：**一个通用的玩具库**（若干种 ``kind``），
 * 加上**一套从课时标题推导参数**的规则。课程数据里只存
 * 「哪一集用哪种玩具 + 参数是什么」，几十字节就够。
 *
 * ⛔ **红线**：初高中语文**绝不出现** ``hanzi``（笔顺描红）。
 *    那是小学的东西。初高中只配 ``literary``。
 */

/** 玩具种类。 */
export type InteractiveLabKind =
  /** 生字笔顺描红（**仅小学语文**）。 */
  | "hanzi"
  /** 古诗 / 课文分句图解（小学语文）。 */
  | "poem"
  /** 名篇精读与意象赏析（**初高中语文**）。 */
  | "literary"
  /** 凑十 · 方块拼接（小学数学）。 */
  | "blocks"
  /** 数轴加减（小学数学）。 */
  | "numberline"
  /** 分数 · 披萨切分（小学数学）。 */
  | "fraction"
  /** 周长面积 · 动态方格（小学数学）。 */
  | "area"
  /** 图形平移对称（小学数学）。 */
  | "transform"
  /** 比 · 比例（小学数学）。 */
  | "ratio"
  /** 函数图像动态（初高中数学）。 */
  | "function"
  /** 动态几何（初高中数学）。 */
  | "geometry"
  /** 代数 · 方程求解（初高中数学）。 */
  | "algebra"
  /** 统计 · 概率模拟（初高中数学）。 */
  | "probability"
  /** 对称与平移（旧 kind，保留兼容）。 */
  | "symmetry"
  /* ── Module 5 · GitHub 开源教具 ── */
  /** 动态量角器 + 动态三角形（几何与测量）。 */
  | "protractor"
  /** 实时函数坐标系实验室（mafs 范式）。 */
  | "functionLab"
  /** 互动统计图表台（recharts）。 */
  | "chartLab"
  /** 十进制凑十积木块（Mathigon Polypad 范式）。 */
  | "decimalBlocks"
  /** 分数圆盘。 */
  | "fractionDisc"
  /** 方程天平。 */
  | "balanceScale"
  /** 语文真实文化互动台（小学 = 笔顺字源；初高中 = 经典精读）。 */
  | "culture";

/** 一个词句的注释。 */
export interface LabNote {
  /** 原文词句。 */
  term: string;
  /** 白话解释。 */
  plain: string;
  /** 英文提示。 */
  en: string;
}

/** 名篇精读台的一个可点击关键词。 */
export interface LabKeyword {
  /** 关键词 / 选段。 */
  term: string;
  /** 修辞手法。 */
  device: string;
  /** 意象解析。 */
  meaning: string;
  /** 白话对照。 */
  plain: string;
}

/** 名篇精读与意象赏析台的数据。 */
export interface LiteraryLabData {
  /** 篇名。 */
  title: string;
  /** 作者。 */
  author: string;
  /** 选段原文。 */
  excerpt: string;
  /** 可点击高亮的关键词。 */
  keywords: LabKeyword[];
  /** 互动思考题。 */
  question: string;
  /** 思考题答案。 */
  answer: string;
}

/** 数学知识点的元信息。 */
export interface MathTopicMeta {
  /** 知识点 key。 */
  key: string;
  /** 主题名。 */
  title: string;
  /** 真实定义。 */
  definition: string;
}

/** 互动实验室的初始参数。 */
export interface LabParams {
  /** 一次函数的斜率。 */
  a?: number;
  /** 一次函数的截距。 */
  b?: number;
  /** 函数类型。 */
  type?: "linear" | "quadratic" | "inverse";
  /** 几何角度。 */
  angle?: number;
  /** 几何边数。 */
  sides?: number;
  /** 模拟次数。 */
  trials?: number;
  /** 概率参数 p。 */
  p?: number;
  /** 数轴上的数值。 */
  value?: number;
  /** 分数分子。 */
  numerator?: number;
  /** 分数分母。 */
  denominator?: number;
  /** 长。 */
  length?: number;
  /** 宽。 */
  width?: number;
  /** 平移量。 */
  offset?: number;
  /** 比的前项。 */
  a2?: number;
  /** 比的后项。 */
  b2?: number;
  /** 方块总数。 */
  count?: number;
  /** 分组数。 */
  groups?: number;
}

/** 一集的互动实验室配置。 */
export interface InteractiveLab {
  /** 玩具种类。 */
  kind: InteractiveLabKind;
  /** 标题。 */
  title: string;
  /** 生字（``kind === "hanzi"``）。 */
  chars?: string[];
  /** 拼音（与 ``chars`` 一一对应）。 */
  pinyin?: string[];
  /** 分句（``kind === "poem"``）。 */
  segments?: string[];
  /** 词句注释（``kind === "poem"``）。 */
  notes?: LabNote[];
  /** 古诗元信息（``kind === "poem"``）。 */
  poem?: {
    title: string;
    author: string;
    dynasty: string;
    lines: string[];
    plain: string[];
    en: string[];
  } | null;
  /** 名篇精读数据（``kind === "literary"``）。 */
  classic?: LiteraryLabData | null;
  /** 名篇配套的互动思考题（``kind === "literary"``）。 */
  point?: {
    concept: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null;
  /** 数学知识点元信息。 */
  mathTopic?: MathTopicMeta | null;
  /** 玩具参数。 */
  params?: LabParams;
  /** 凑十的目标数（``kind === "blocks"``）。 */
  target?: number;
  /** 切分份数（``kind === "fraction"``）。 */
  slices?: number;
  /** 图形（``kind === "transform"``）。 */
  shape?: "triangle" | "square" | "arrow";
  /** 函数类型（旧字段，保留兼容）。 */
  fn?: "linear" | "quadratic" | "trig";
  /** 被开方数（旧字段，保留兼容）。 */
  radicals?: number[];
  /** 对称轴（旧字段，保留兼容）。 */
  axis?: number;
  /* ── Module 5 · GitHub 开源教具配置 ── */
  /** 数学动态教具配置。 */
  manipulative?: {
    /** 教具类型。 */
    kind:
      | "protractor"
      | "functionLab"
      | "chartLab"
      | "decimalBlocks"
      | "fractionDisc"
      | "numberLine"
      | "balanceScale";
    /** 初始角度。 */
    angle?: number;
    /** 初始斜率。 */
    slope?: number;
    /** 初始截距。 */
    intercept?: number;
    /** 函数类型。 */
    fnType?: "linear" | "quadratic" | "inverse";
    /** 初始数据集。 */
    data?: Array<{ label: string; value: number }>;
    /** 凑十目标。 */
    target?: number;
    /** 等分份数。 */
    parts?: number;
    /** 数轴起点。 */
    start?: number;
    /** 数轴步长。 */
    step?: number;
    /** 天平左侧砝码。 */
    leftWeights?: number[];
    /** 天平右侧砝码。 */
    rightWeights?: number[];
  };
  /** 语文文化互动台配置。 */
  culture?: {
    /** 学段。 */
    stage: "primary" | "junior" | "senior";
    /** 篇名。 */
    workTitle?: string;
    /** 作者。 */
    author?: string;
    /** 朝代。 */
    dynasty?: string;
    /** 经典选段 / 诗词原文。 */
    excerpt?: string;
    /** 可点击高亮词句。 */
    keywords?: Array<{
      term: string;
      device: string;
      meaning: string;
      plain: string;
      en?: string;
    }>;
    /** 字源演变。 */
    etymology?: Array<{ char: string; glyph: string; story: string }>;
  };
}

/**
 * 判断一个实验室是否属于**初高中语文的合规配置**。
 *
 * 初高中语文**只允许** ``literary``——不允许 ``hanzi``（笔顺描红）。
 */
export function isLiteraryOnly(kind: InteractiveLabKind): boolean {
  return kind === "literary";
}
