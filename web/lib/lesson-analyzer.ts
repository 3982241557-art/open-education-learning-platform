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
 *
 * ⚠️ 括号常常**不配对**（``名师讲重点1观潮（想象画面，感受钱塘江大潮的壮美``）。
 *    所以不能简单地按括号截断——那会把标题砍掉一半。这里只在
 *    **括号闭合**时才截断。
 */
function stripNoise(raw: string): string {
  let text = raw;

  // 版权 / 广告标记。
  text = text.replace(/[©®]\s*版权[^\s|｜]*/g, "");
  text = text.replace(/©[^\s|｜]{0,20}/g, "");

  // 栏目前缀——「这个视频是什么形式」不是「这一讲讲什么」。
  text = text.replace(
    /^\s*[【\[]\s*(微课视频|微课|名师讲重点|名师讲解|名师精讲|扫码读课文|扫码听读|七彩课堂|课本精讲|同步讲解|精品课程|重难点突破|精品优课)\s*[】\]]\s*/g,
    "",
  );
  text = text.replace(
    /^\s*(扫码读课文|扫码听读|七彩课堂|微课视频|微课)\s*/g,
    "",
  );

  // 分隔符统一。
  text = text.replace(/[｜|]/g, " ");
  text = text.replace(/[【】\[\]（）()《》「」]/g, " ");

  // 前导序号：``1.`` ``1_`` ``01 `` ``第1课``。
  text = text.replace(/^\s*\d{1,3}\s*[.、_\-]\s*/, "");
  text = text.replace(/^\s*第\s*\d{1,3}\s*[课讲]\s*/, "");

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
 * 抽取课时的**核心课文名**。
 *
 * 与 :func:`stripNoise` 的区别：那个函数保留**所有有意义的部分**，
 * 这个函数只取**最后一段像课文名的**。
 *
 * .. code-block:: text
 *
 *    「第1单元 识字1 春夏秋冬1」→ 「春夏秋冬」
 *    「第2单元 识字2 姓氏歌1」  → 「姓氏歌」
 *    「3.观察物体（第1课时）」 → 「观察物体」
 *
 * 互动实验室（生字 / 古诗分句）与诊断题都基于它。
 */
export function coreLessonTitle(raw: string): string {
  const cleaned = String(raw ?? "")
    // 方括号 / 书名号里的内容是**补充说明**（「【新初一语文预习视频课】」）
    // ——整段丢掉，不要只把括号换成空格（那会把说明留进课文名）。
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/《[^》]*》/g, " ")
    .replace(/「[^」]*」/g, " ")
    .replace(/[【】[\]（）()《》「」]/g, " ")
    // ── 序号前缀 ──
    //
    // 「01. 第 1集 我是中国人」→ 「我是中国人」
    //
    // 这些前缀是**采集器**加的（保证目录有稳定排序），不是课文名。
    // 不去掉的话，生字卡会变成「我 / 是 / 中 / 国」——虽然碰巧还对，
    // 但分句图解会把「第 1集 我是中国人 第 1集 我是中国人」当诗句。
    .replace(/^\s*\d{1,3}\s*[.、,，:：]\s*/g, " ")
    .replace(/第\s*[一二三四五六七八九十\d]{1,3}\s*集/g, " ")
    .replace(/第\s*[一二三四五六七八九十\d]{1,3}\s*单元/g, " ")
    .replace(/第\s*[一二三四五六七八九十\d]{1,3}\s*[课讲]/g, " ")
    .replace(/单元\s*\d{1,3}/g, " ")
    // 册次前缀——「四上1观潮」→ 「观潮」。
    //
    // 「四上」「五下」「三下」是**教材册次**，不是课文名的一部分。
    // 不剥掉的话，生字卡会变成「四 / 上 / 观 / 潮」——把册次
    // 当成生字了。
    .replace(/[一二三四五六七八九十\d]{1,2}\s*[上下]\s*[\d一二三四五六七八九十]{0,2}\s*/g, " ")
    .replace(/(\p{Script=Han})\s*\d{1,3}(?![\u4e00-\u9fa5])/gu, "$1")
    .replace(
      /讲解|精讲|微课|同步课|同步|复习|导读|分析|赏析|背诵|朗读/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  // ── 去重 ──
  //
  // 采集器有时把标题写两遍：「第 1集 我是中国人 第 1集 我是中国人」。
  // 判断方式：整串能否**一分为二且两半相同**。
  if (parts.length >= 2) {
    for (let half = 1; half <= Math.floor(parts.length / 2); half += 1) {
      const front = parts.slice(0, half).join("");
      const back = parts.slice(half).join("");
      if (front && front === back) {
        return parts[half - 1] ?? cleaned;
      }
    }
  }

  // 从后往前找第一段「像课文名」的（≥2 汉字，且不是教材栏目名）。
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const hanCount = (part.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    if (hanCount < 2) continue;
    if (
      /^(识字|课文|生字|练习|口语|习作|语文园地|日积月累|快乐读书吧|口语交际|园地|单元|复习|测试|检测)/.test(
        part,
      )
    ) {
      continue;
    }
    return part;
  }

  // 兜底：整个标题都被剥光了（比如「01.第一单元导读」）——
  // 返回**原始标题**，别返回空串。
  return parts[parts.length - 1] || String(raw ?? "").trim() || cleaned;
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
