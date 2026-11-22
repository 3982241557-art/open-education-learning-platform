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
 * 一门课有 1555 集，但真正需要**不同玩具**的只有几种：
 *
 * - 语文 → 生字描红 + 分句图解；
 * - 小学数学 → 凑十方块 / 分数切分 / 对称平移；
 * - 初高中数学 → 函数图像 / 动态几何。
 *
 * 所以我们做的是：**一个通用的玩具库**（若干种 ``kind``），
 * 加上**一套从课时标题推导参数**的规则。课程数据里只存
 * 「哪一集用哪种玩具 + 参数是什么」，几十字节就够。
 *
 * 标题解析
 * --------
 *
 * 教材目录里的课时标题长这样：
 *
 * - 「第1单元 识字1 春夏秋冬1」→ 核心课文名是「春夏秋冬」
 * - 「第3单元 课文3 秋天的雨」→ 核心课文名是「秋天的雨」
 *
 * 所以第一步永远是 :func:`coreLessonTitle`——把**单元标记、课号、
 * 讲解后缀**剥掉，只留下课文名。之后的生字抽取、古诗分句、
 * 数学玩具匹配，全部基于它。
 */

import { coreLessonTitle } from "@/lib/lesson-analyzer";

/** 玩具种类。 */
export type InteractiveLabKind =
  /** 生字笔顺描红。 */
  | "hanzi"
  /** 古诗 / 课文分句图解。 */
  | "poem"
  /** 凑十 · 方块拼接（小学数学）。 */
  | "blocks"
  /** 分数 · 披萨切分（小学数学）。 */
  | "fraction"
  /** 对称 · 平移互动板（小学数学）。 */
  | "symmetry"
  /** 函数图像动态（初高中数学）。 */
  | "function"
  /** 动态几何（初高中数学）。 */
  | "geometry";

/** 一个词句的注释。 */
export interface LabNote {
  /** 原文词句。 */
  term: string;
  /** 白话解释。 */
  plain: string;
  /** 英文提示。 */
  en: string;
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
  /** 偏旁 / 结构提示（与 ``chars`` 一一对应）。 */
  radicals?: string[];
  /** 分句（``kind === "poem"``）。 */
  segments?: string[];
  /** 词句注释（``kind === "poem"``）。 */
  notes?: LabNote[];
  /** 凑十的目标数（``kind === "blocks"``）。 */
  target?: number;
  /** 切分份数（``kind === "fraction"``）。 */
  slices?: number;
  /** 图形（``kind === "symmetry"``）。 */
  shape?: "triangle" | "square" | "arrow";
  /** 函数类型（``kind === "function"``）。 */
  fn?: "linear" | "quadratic" | "trig";
}

/**
 * 常见字集合——做不成「生字卡」的字。
 *
 * 语文课本的生字是**要教、要认、要写**的字；「讲解」「同步」
 * 「第一」这类是**元信息**，做笔顺卡毫无意义。
 */
const NON_CHARACTERS = new Set([
  "讲", "解", "课", "笔", "记", "同", "步", "精", "第", "一", "二", "三",
  "四", "五", "六", "上", "下", "册", "全", "集", "微", "视", "频", "教",
  "学", "堂", "育", "分", "析", "练", "习", "题", "库", "预", "复", "轮",
  "专", "选", "修", "必", "阅", "读", "写", "作", "叙", "文", "诗", "词",
  "古", "言", "现", "代", "小", "说", "赏", "背", "朗", "识", "单", "元",
  "园", "地", "积", "累", "快", "乐", "书", "吧", "语", "交", "流", "口",
]);

/**
 * 教材里的**栏目名**——不是课文标题。
 */
const SECTION_PREFIX =
  /^(识字|课文|生字|练习|口语|习作|语文园地|日积月累|快乐读书吧|口语交际|园地|单元|复习|测试|检测)/;

/**
 * 「X 首」型的**合辑栏目名**。
 *
 * 「古代诗歌四首」不是一个课文——它是**四首诗的合集**。把它当课文名
 * 去切分句，会产出「古代诗歌四 / 首」这种毫无意义的分句。
 */
const ANTHOLOGY_SUFFIX = /[诗词]?[一二三四五六七八九十\d]{1,3}首$/;

/**
 * 抽取课时的**核心课文名**。
 *
 * 与 :func:`analyzeLessonTitle` 里的实现是**同一个函数**——从
 * ``lesson-analyzer`` 导入，避免两份逻辑漂移。
 */
export { coreLessonTitle } from "@/lib/lesson-analyzer";

/**
 * 从课时标题里抽生字候选。
 *
 * @param title 课时标题
 * @returns 2–4 个候选单字
 */
export function extractHanziCandidates(title: string): string[] {
  // 只看**核心课文名**里的中文连续段——单元标记、课号都排除。
  const core = coreLessonTitle(title);
  // ⚠️ 单字标题（「春」）也要算——那是完整的课文名。
  const runs = core.match(/[\u4e00-\u9fa5]+/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const run of runs) {
    for (const char of run) {
      if (NON_CHARACTERS.has(char)) continue;
      if (seen.has(char)) continue;
      seen.add(char);
      out.push(char);
      if (out.length >= 4) return out;
    }
  }

  return out;
}

/**
 * 判断一个课时标题是不是**古诗 / 课文**（适合做分句图解）。
 *
 * 判据（必须**全部**满足）：
 *
 * - 标题里含「古诗 / 唐诗 / 宋词 / 诗词」这类词；**或**
 * - 抽出的核心课文名是 4–10 个汉字的**完整短句**。
 *
 * ⚠️ 「第1单元 识字1 春夏秋冬1」这种**教材目录行**必须被排除——
 *    它的核心课文名是「春夏秋冬」，4 个字，是真课文名；但
 *    「第2单元 识字2」的核心是「识字」——栏目名，要排除。
 */
export function looksLikePoem(title: string): boolean {
  const text = String(title ?? "");
  if (/古诗|唐诗|宋词|诗歌|诗词/.test(text)) return true;

  const core = coreLessonTitle(text);
  if (!core) return false;
  if (SECTION_PREFIX.test(core)) return false;
  // 「古代诗歌四首」是合辑栏目名，不是课文。
  if (ANTHOLOGY_SUFFIX.test(core)) return false;

  // 必须是**纯中文**的 4–10 字短句。
  return /^[\u4e00-\u9fa5]{4,10}$/.test(core);
}

/**
 * 把一段古诗拆成**分句**。
 *
 * 优先按标点切；没有标点时按 5 字 / 7 字节奏切。
 */
export function splitPoemSegments(text: string): string[] {
  const core = coreLessonTitle(String(text ?? ""));

  // 合辑栏目名（「古代诗歌四首」）——整段丢掉，不切。
  if (ANTHOLOGY_SUFFIX.test(core)) return [];

  const cleaned = core
    .replace(/[，。！？；、,.!?;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  // 按标点切。
  const byPunctuation = cleaned
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (byPunctuation.length >= 2) return byPunctuation;

  // 没有标点 → 按 5 字 / 7 字节奏切。
  const segments: string[] = [];
  let buffer = "";
  for (const char of cleaned) {
    buffer += char;
    const shouldBreak =
      (buffer.length === 5 && /[\u4e00-\u9fa5]/.test(char)) ||
      (buffer.length === 7 && /[\u4e00-\u9fa5]/.test(char));
    if (shouldBreak) {
      segments.push(buffer);
      buffer = "";
    }
  }
  if (buffer) segments.push(buffer);
  return segments;
}

/**
 * 根据课时标题 + 学科 + 学段，**自动匹配**一个互动玩具。
 *
 * 这是「点开任意一门课都有动画可玩」的关键——不需要人工标注
 * 1555 集，靠标题 + 学段就能推导出一个**合理**的玩具。
 *
 * @param title    课时标题
 * @param subject  学科
 * @param stage    学段
 */
export function autoPickLab(
  title: string,
  subject: "chinese" | "math",
  stage: "primary" | "junior" | "senior",
): InteractiveLab {
  const text = String(title ?? "");
  const core = coreLessonTitle(text);

  if (subject === "chinese") {
    // ── 语文 ──
    const chars = extractHanziCandidates(text);
    const segments = looksLikePoem(text) ? splitPoemSegments(text) : [];

    // 有分句 → 优先做「分句图解」；否则做「生字描红」。
    if (segments.length >= 2) {
      return {
        kind: "poem",
        title: "分句图解",
        segments,
        notes: segments.slice(0, 4).map((term) => ({
          term,
          plain: "这一句是本段的核心意象——先读懂它在说什么，再看整段的意思。",
          en: "Read this line for the key image, then read the whole passage.",
        })),
      };
    }

    return {
      kind: "hanzi",
      title: "笔顺描红",
      chars: chars.length >= 1 ? chars : ["学", "习"],
      pinyin: chars.length >= 1 ? chars.map(() => "") : ["xué", "xí"],
    };
  }

  // ── 数学 ──
  if (stage === "primary") {
    // 分数 → 切分动画。
    if (/分数|几分之|除法|平均分/.test(core)) {
      return { kind: "fraction", title: "分数 · 披萨切分", slices: 8, target: 8 };
    }
    // 对称 / 平移 → 互动板。
    if (/对称|平移|旋转|轴对称/.test(core)) {
      return { kind: "symmetry", title: "对称 · 平移互动板", shape: "triangle" };
    }
    // 加减 / 凑十 → 方块拼接。
    return { kind: "blocks", title: "凑十 · 方块拼接", target: 10 };
  }

  // ── 初高中数学 ──
  if (/二次函数|抛物线|顶点/.test(core)) {
    return { kind: "function", title: "函数图像动态", fn: "quadratic" };
  }
  if (/一次函数|正比例|反比例|斜率/.test(core)) {
    return { kind: "function", title: "函数图像动态", fn: "linear" };
  }
  if (/三角函数|正弦|余弦|正切/.test(core)) {
    return { kind: "function", title: "函数图像动态", fn: "trig" };
  }
  // 几何 → 动态几何。
  return { kind: "geometry", title: "动态几何" };
}
