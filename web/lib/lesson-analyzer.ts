/**
 * 课时标题解析
 * ============
 *
 * 从**真实课时标题**里解析出这一讲讲什么。
 *
 * 为什么解析标题而不是手写教案
 * ----------------------------
 *
 * 采集器拿到的分 P 标题本身就是**教材目录**：
 *
 * .. code-block:: text
 *
 *     第一单元｜阅读｜1 古诗三首｜第一课时
 *     1_【基础篇】集合的概念与表示
 *     3.观察物体（第1课时）
 *     2.济南的冬天
 *
 * 这些标题里**已经包含**了单元号、课时名、课型、篇目名。手写
 * 24 门课的教案既慢又容易和实际视频对不上——标题解析则**永远
 * 跟视频一致**。
 *
 * 解析出五样东西
 * --------------
 *
 * ==============  ====================================================
 * 字段            用途
 * ==============  ====================================================
 * ``unit``        单元名——目录页按单元分组展示
 * ``lesson``      课名——诊断题的题干来源
 * ``lessonType``  课型（基础篇 / 第一课时 / 习题 / 复习）
 * ``keywords``    核心知识点——知识节点
 * ``focus``       这一讲的核心问题——诊断题的正确选项
 * ==============  ====================================================
 */

/** 解析结果。 */
export interface LessonAnalysis {
  /** 单元名（若标题里带单元信息）。 */
  unit: string;
  /** 课名——去掉序号、课时标记后的干净标题。 */
  lesson: string;
  /** 课型。 */
  lessonType: "新授" | "基础" | "进阶" | "复习" | "习题" | "拓展" | "实验";
  /** 核心知识点（1–4 个）。 */
  keywords: string[];
  /** 这一讲要建立的核心认知——诊断题的「正确」选项。 */
  focus: string;
  /** 课文中出现的篇目名（古诗、文言文、课文标题）。 */
  textTitle: string | null;
}

/** 课型标记 —— 按出现顺序匹配。 */
const TYPE_MARKERS: Array<[RegExp, LessonAnalysis["lessonType"]]> = [
  [/基础篇|基础课|基础/, "基础"],
  [/进阶篇|进阶|提高/, "进阶"],
  [/拓展|奥赛|培优/, "拓展"],
  [/复习|总复习|专项/, "复习"],
  [/练习|习题|习题课|测试|测评/, "习题"],
  [/实验|探究/, "实验"],
  [/第一课时|第二课时|第三课时|第\d课时|课时/, "新授"],
];

/**
 * 清理标题里的**结构性噪音**。
 *
 * 例如 ``第一单元｜阅读｜1 古诗三首｜第一课时`` →
 * ``古诗三首``。
 *
 * 保留的只有**真正有教学意义**的部分：单元号、课文/篇目名。
 */
function stripNoise(raw: string): string {
  let text = raw;

  // 版权 / 广告标记。
  text = text.replace(/[©®]版权|版权声明|未经授权.*$/g, "");

  // 分隔符统一。
  text = text.replace(/[｜|｜]/g, " ");
  text = text.replace(/[【】\[\]（）()《》「」]/g, " ");

  // 前导序号：``1.`` ``1_`` ``01 `` ``第1课``。
  text = text.replace(/^\s*\d{1,3}\s*[.、_\-]\s*/, "");
  text = text.replace(/^\s*第\s*\d{1,3}\s*[课讲]\s*/, "");

  // 单元标记：``第一单元`` → 保留（它就是单元信息）。
  // 课时标记。
  text = text.replace(/第[一二三四五六七八九十\d]{1,3}课时/g, " ");
  text = text.replace(/课时\s*\d{1,3}/g, " ");

  // 课型标记。
  text = text.replace(/基础篇|进阶篇|提高篇|拓展篇|强化篇|基础课|复习课|习题课/g, " ");

  // 多余空白。
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/** 判断课型。 */
function detectType(raw: string): LessonAnalysis["lessonType"] {
  for (const [pattern, type] of TYPE_MARKERS) {
    if (pattern.test(raw)) return type;
  }
  return "新授";
}

/** 从标题里抠出**课文 / 篇目名**。 */
function extractTextTitle(raw: string): string | null {
  // 「《济南的冬天》」——书名号里的通常就是课文名。
  const book = raw.match(/《([^》]{1,24})》/);
  if (book) return book[1];

  // 「古诗三首」「记承天寺夜游」这类以「首」「游」「说」结尾的词。
  const poem = raw.match(/([一-龥]{2,8}(?:诗|首|篇|说|记|传|序|赋|行|吟|曲))(?![词曲])/);
  if (poem) return poem[1];

  // 「3.观察物体（第1课时）」——序号后的名词短语。
  const simple = raw.match(/^\s*\d{1,3}\s*[.、_]\s*([一-龥]{2,12})/);
  if (simple) return simple[1];

  return null;
}

/**
 * 从标题里提取**核心知识点**。
 *
 * 策略：优先用括号里的补充说明（「集合的概念与表示」→「集合」），
 * 其次用顿号 / 逗号分段的并列结构（「数与形」「几何初步」）。
 */
function extractKeywords(raw: string, lesson: string): string[] {
  const keywords: string[] = [];

  // 括号里的补充：``（基础篇）`` ``（第1课时）`` 之外的内容。
  const bracket = raw.match(/[（(]([^）)]{2,24})[）)]/);
  if (bracket) {
    const inner = bracket[1].trim();
    // 排除纯课时 / 纯课型标记。
    if (!/课时$|篇$|课$/.test(inner)) {
      keywords.push(...inner.split(/[、，,和与及\/]/).map((s) => s.trim()));
    }
  }

  // 主标题本身。
  if (lesson) keywords.push(lesson);

  // 并列结构：「函数的概念与性质」→「函数」「性质」。
  const conjunction = lesson.match(/^(.{2,10})的(.{2,10})$/);
  if (conjunction) {
    keywords.push(conjunction[1], conjunction[2]);
  }

  // 去重 + 清理 + 限长。
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of keywords) {
    const value = item
      .replace(/^\s*[.、_\-]\s*/, "")
      .replace(/\s+/g, "")
      .trim();
    if (!value || value.length < 2 || value.length > 20) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
  }

  return cleaned.slice(0, 4);
}

/**
 * 解析一个课时标题。
 *
 * @param raw 原始标题（可能含单元号、课时标记、课型标记）
 */
export function analyzeLessonTitle(raw: string): LessonAnalysis {
  const source = String(raw ?? "").trim();

  // 单元名。
  const unitMatch = source.match(
    /第\s*([一二三四五六七八九十\d]{1,3})\s*单元\s*[｜|]?\s*([^｜|]*)/,
  );
  const unit = unitMatch
    ? `第 ${unitMatch[1]} 单元${unitMatch[2]?.trim() ? ` · ${unitMatch[2].trim()}` : ""}`
    : "";

  const lesson = stripNoise(source);
  const lessonType = detectType(source);
  const textTitle = extractTextTitle(source);
  const keywords = extractKeywords(source, lesson);

  // 核心认知——诊断题「正确」选项的文案。
  const focus = buildFocus(lesson, lessonType, textTitle);

  return { unit, lesson, lessonType, keywords, focus, textTitle };
}

/** 拼出「这一讲要建立的核心认知」。 */
function buildFocus(
  lesson: string,
  type: LessonAnalysis["lessonType"],
  textTitle: string | null,
): string {
  const subject = textTitle ? `《${textTitle}》` : `「${lesson}」`;

  switch (type) {
    case "基础":
      return `能说清${subject}的基本定义与最核心的性质，知道它解决什么问题`;
    case "进阶":
      return `能在${subject}的基础上做多步推导，并说明每一步为什么成立`;
    case "复习":
      return `把${subject}相关的方法串成一条主线，能识别各类题型的切入点`;
    case "习题":
      return `能独立完成${subject}这一类题，并说清每一步的依据`;
    case "拓展":
      return `能处理${subject}的变化题型，掌握更一般的方法`;
    case "实验":
      return `能自己动手完成${subject}的探究过程，并从现象归纳出结论`;
    default:
      return `建立${subject}的直觉，能用自己的话讲清它到底在解决什么问题`;
  }
}
