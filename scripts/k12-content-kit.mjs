/**
 * K12 真实内容装配 · 核心工具
 * ============================
 *
 * 从课时标题里提取核心课名、按学段与知识点匹配真实题库、
 * 并为每一集装配互动实验室。
 *
 * 单独成文件是为了让「装配逻辑」与「主流程」分开读——
 * 这个文件是**规则**，另一个是**批量执行**。
 */

import { matchPoem } from "./k12-knowledge-poems.mjs";
import { matchClassic } from "./k12-knowledge-classics.mjs";
import { matchMathTopic, MATH_TOPICS as MAIN_MATH_TOPICS } from "./k12-knowledge-math.mjs";
import {
  matchMathTopicExt,
  MATH_TOPICS_EXT2,
  MATH_TOPICS_EXT3,
  MATH_TOPICS_GEOM_MODELS,
} from "./k12-knowledge-math-ext.mjs";
import { matchAliasKey } from "./k12-math-aliases.mjs";
import { matchLessonPoint } from "./k12-knowledge-lessons.mjs";
import { matchStructPoint } from "./k12-knowledge-struct.mjs";
import { SENIOR_POINTS } from "./k12-knowledge-senior.mjs";
import {
  matchPrimaryChinesePoint,
  matchJuniorChinesePoint,
  matchSeniorChinesePoint,
  PRIMARY_FALLBACK_QUESTIONS,
  JUNIOR_FALLBACK_QUESTIONS,
  SENIOR_FALLBACK_QUESTIONS,
} from "./k12-knowledge-chinese.mjs";

/* ──────────────────────────────────────────────────────────────────
 * 一、课时标题解析
 * ────────────────────────────────────────────────────────────────── */

/**
 * 从课时标题里提取**核心课名**。
 *
 * 标题形如：
 *
 * - 「5.秋天的怀念【新初一语文预习视频课】」→ ``秋天的怀念``
 * - 「01. 第 1 集 我是中国人 第 1 集 我是中国人」→ ``我是中国人``
 * - 「七彩预习-人教版-1年级-2.1 十几减9」→ ``十几减9``
 * - 「1.1【课内诗词精讲】高中统编必修上《沁园春·长沙》」→ ``沁园春·长沙``
 */
export function extractCoreTitle(rawTitle) {
  const raw = String(rawTitle ?? "").trim();
  let title = raw;

  // 去掉尾部方括号里的标签：【…】
  title = title.replace(/[【[][^】\]]*[】\]]/g, " ").trim();

  // 优先取《》里的内容——那才是真正的课文名。
  const inBracket = title.match(/[《〈](.+?)[》〉]/);
  if (inBracket) title = inBracket[1].trim();

  // 去掉「XX预习-人教版-N年级-」这类前缀。
  title = title
    .replace(/^.*?[-–—]\s*人教版.*?[-–—]\s*\d*年级\s*[-–—]\s*/g, "")
    .trim();

  // 去掉「L7-1」这类学段编号前缀。
  title = title.replace(/^[Ll]\s*\d+\s*[-–—]\s*\d*\s*/, "").trim();

  // 去掉「四上」「五下」「六上册」这类册次标记。
  title = title.replace(/^[一二三四五六七八九十]+\s*[上下]\s*[册]?\s*/g, "").trim();

  // 去掉「名师讲重点」「四语上背诵指导」这类课型前缀。
  title = title
    .replace(
      /^(名师讲重点|四语[上下]背诵指导|背诵指导|原文朗读|名师讲堂|微课讲堂|单元复习|课内|课外)\s*[:：]?\s*\d*\s*/,
      "",
    )
    .trim();

  // 去掉下划线与「P1-」前缀。
  title = title.replace(/^[_]+/, "").trim();
  title = title.replace(/^P\d+\s*[-–—_]\s*/i, "").trim();

  // 去掉开头的「1.1」「2.」「第3讲」等编号。
  title = title.replace(/^\d+(\.\d+)*\s*[.、．]?\s*/, "").trim();
  title = title.replace(/^第\s*\d+\s*[集讲课时]\s*/g, "").trim();
  title = title.replace(/^\d+\s*[集讲]\s*/g, "").trim();

  // 去掉「课文1」「识字2」这类课序前缀——但保留课文名本身。
  title = title.replace(/^(课文|识字)\s*\d+\s*/g, "").trim();

  // 去掉「七年级上册」这类学期标记。
  title = title.replace(/[一二三四五六七八九十]+年级[上下]册?/g, "").trim();

  // 数学单元标题：截取到「第 X 节」之前，取真正的小节名。
  title = title.replace(/^.*?\s*第[一二三四五六七八九十\d]+节\s*/, "").trim();

  // 去掉重复的「第 N 集 …」。
  title = title.replace(/\s*第\s*\d+\s*[集讲]\s*/g, " ").trim();

  // 去掉「（第N课时）」。
  title = title.replace(/[（(]\s*第?\s*\d*\s*课时?\s*[)）]/g, "").trim();

  // 去掉尾部修饰词。
  title = title
    .replace(
      /(课内诗词精讲|词精讲|精讲|导读|精读|微课|预习视频课|视频课|同步|动画课堂|名师课堂|趣味动画学|看动画学|七彩课预习|七彩预习|七彩课|预习|动画)/g,
      "",
    )
    .trim();

  // ── 折叠**重复标题** ──
  //
  // B 站的分集标题常常是「我是中国人 第 1集 我是中国人」——
  // 去掉「第 N 集」之后会剩下「我是中国人 我是中国人」这种重复。
  //
  // 处理方式：如果一个**完全相同**的片段连续出现两次，就折叠成一个。
  const deduped = title
    .split(/\s+/)
    .filter((word, index, list) => !(index > 0 && word === list[index - 1]));
  if (deduped.length > 0) title = deduped.join(" ");

  // ── 折叠**整段重复**（前后两半完全一样） ──
  //
  // 「第 1集 我是中国人 第 1集 我是中国人」去掉编号后，
  // 可能整体是「我是中国人 我是中国人」——逐词去重已经能处理；
  // 这里再兜一层：若整串能拆成两个相同的半串，就取一半。
  const half = Math.floor(title.length / 2);
  if (title.length % 2 === 0 && half > 1) {
    const left = title.slice(0, half).trim();
    const right = title.slice(half).trim();
    if (left === right && left.length > 0) title = left;
  }

  // 折叠残留标点。
  title = title.replace(/^[\s·、，,。:：\-—–|｜_]+/, "");
  title = title.replace(/[\s·、，,。:：\-—–|｜_]+$/, "");

  // 去掉尾部「-P2」「-P47-48」这类页码标记。
  title = title.replace(/[-–—]\s*[Pp]\s*\d+(-\d+)?\s*$/, "").trim();
  // ⛔ **「-园地4」不是页码**——
  //    「四语上-原文朗读-园地4」里的「4」是**语文园地的序号**
  //    （第四单元的语文园地），剥掉它就再也认不出这一课了。
  if (!/园地\d*$/.test(title)) {
    title = title.replace(/[-–—]\s*\d+(-\d+)?\s*$/, "").trim();
  }
  // 去掉「（人教新课标A）」这类版本标记。
  title = title.replace(/[（(]\s*人教[^）)]*\s*[)）]\s*$/, "").trim();
  title = title.replace(/[\s·、，,。:：\-—–|｜_]+$/, "");

  // ⚠️ 只有**导航性标题**才去掉尾部序号。
  //    「语文园地一1」「汉语拼音13」要去序号；
  //    「十几减9」「100以内数的认识」**不能去**——那是课文名的一部分。
  if (/^(语文园地|识字|汉语拼音|金木水火土|口语交际|习作|快乐读书吧|我的植物朋友|童年|金色的鱼钩|雪地里小画家|狐狸和乌鸦|乌鸦喝水|小蜗牛|植物妈妈有办法)/.test(title)) {
    title = title.replace(/(\d+)$/, "").trim();
  }
  title = title.replace(/[\s·、，,。:：\-—–|｜_]+$/, "");

  return title || raw;
}

/* ──────────────────────────────────────────────────────────────────
 * 二、学段工具
 * ────────────────────────────────────────────────────────────────── */

/** 年级 → 学段。 */
/** 主表知识点的 key 集合。 */
const MAIN_MATH_KEYS = new Set(MAIN_MATH_TOPICS.map((t) => t.key));

/** 主表知识点按 key 索引。 */
const MAIN_MATH_BY_KEY = new Map(
  MAIN_MATH_TOPICS.map((topic) => [topic.key, topic]),
);

/** 全部数学知识点的 key 集合——用于校验别名有效。 */
const ALL_MATH_KEYS = new Set([
  ...MAIN_MATH_TOPICS,
  ...MATH_TOPICS_EXT2,
  ...MATH_TOPICS_EXT3,
  ...MATH_TOPICS_GEOM_MODELS,
].map((t) => t.key));

/** 扩展知识点（第二批）按 key 索引。 */
const EXT2_BY_KEY = new Map(
  [
    ...MATH_TOPICS_EXT2,
    ...MATH_TOPICS_EXT3,
    ...MATH_TOPICS_GEOM_MODELS,
  ].map((topic) => [topic.key, topic]),
);

/**
 * 统一的数学知识点查找。
 *
 * 顺序：**直接匹配 → 扩展匹配 → 别名匹配**。
 *
 * @returns {{key: string, title: string, definition: string,
 *   prerequisite: Object, transfer: Object}|null}
 */
export function findMathTopic(coreTitle, fullTitle) {
  const direct = matchMathTopic(coreTitle, fullTitle);
  if (direct) return direct;

  const ext = matchMathTopicExt(coreTitle, fullTitle);
  if (ext) return ext;

  // 别名匹配——别名表同时指向主表与扩展表，所以一次查全集即可。
  const haystack = `${coreTitle} ${fullTitle}`;
  const aliasKey = matchAliasKey(haystack, ALL_MATH_KEYS, coreTitle);
  if (aliasKey) {
    const found = EXT2_BY_KEY.get(aliasKey) ?? MAIN_MATH_BY_KEY.get(aliasKey);
    if (found) return found;
  }

  return null;
}

export function stageOf(grade) {
  if (grade <= 6) return "primary";
  if (grade <= 9) return "junior";
  return "senior";
}

/** 学段中文名。 */
export const STAGE_LABEL = {
  primary: "小学部",
  junior: "初中部",
  senior: "高中部",
};

/**
 * 去掉数学课名尾部的**页码后缀**。
 *
 * 「练习九--P54」→「练习九」
 * 「5.1平行与垂直P56」→「平行与垂直」
 * 「6.5笔算方法（4）」→「6.5笔算方法」
 *
 * ⛔ 与 :func:`stripTrailingIndex` 的区别：数学课名**不能**随便去数字——
 * 「十几减9」「100以内数的认识」里的数字是课名本身。
 * 所以这里只去掉明确的页码标记（P54 / 第54页）与括号内的序号。
 */
export function stripPageSuffix(title) {
  const text = String(title ?? "").trim();
  let stripped = text;

  // 「--P54」「-P61」「P56」——页码标记。
  stripped = stripped.replace(/[-–—]*\s*P\s*\d+\s*$/i, "").trim();
  // 「第54页」
  stripped = stripped.replace(/第\s*\d+\s*页\s*$/, "").trim();
  // 「（4）」「(5)」——括号内的分集序号。
  stripped = stripped.replace(/[（(]\s*\d+\s*[）)]\s*$/, "").trim();

  const hanCount = (stripped.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return hanCount >= 2 ? stripped : text;
}

/**
 * 去掉语文课名尾部的分集序号。
 *
 * 「汉语拼音13」→「汉语拼音」
 * 「语文园地三1」→「语文园地三」
 * 「金木水火土2」→「金木水火土」
 *
 * 但「十几减9」「100以内数的认识」这类**数学**课名不能动——
 * 所以这个函数只用在语文分支。
 */
export function stripTrailingIndex(title) {
  const text = String(title ?? "").trim();
  // 必须有中文才处理，避免把纯数字课名改坏。
  if (!/[\u4e00-\u9fa5]/.test(text)) return text;

  let stripped = text;

  // 「练习九--P54」「练习二十一-P112」「5.1平行与垂直P56」
  // ——去掉页码后缀（-P54 / P56 / --P54）。
  stripped = stripped.replace(/[-–—]*\s*P\d+\s*$/i, "").trim();
  stripped = stripped.replace(/[-–—]+\s*\d+\s*$/, "").trim();

  // ⛔ **「园地N」不能被剥掉**——
  //    「四语上-原文朗读-园地4」里的「4」是**语文园地的序号**
  //    （第四单元的语文园地），不是分集编号。
  //    剥掉它会变成「…园地」，反而找不到对应的课。
  if (/园地\d*$/.test(stripped)) {
    return stripped;
  }

  // 「汉语拼音13」「语文园地三1」
  stripped = stripped.replace(/\s*\d+\s*$/, "").trim();
  // 「语文园地四-3」
  stripped = stripped.replace(/[-–—]\s*\d+\s*$/, "").trim();

  // 至少要留下 2 个汉字，否则视为纯数字课名。
  const hanCount = (stripped.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return hanCount >= 2 ? stripped : text;
}

/**
 * 在高中专题知识点库里查找（精确 → 包含）。
 *
 * 「沁园春·长沙」「芣苢」「离骚」「短歌行」这些篇目在
 * :mod:`k12-knowledge-senior` 里。
 */
export function matchSeniorPoint(coreTitle) {
  const direct = SENIOR_POINTS[coreTitle];
  if (direct) return direct;
  for (const [title, point] of Object.entries(SENIOR_POINTS)) {
    if (coreTitle.includes(title)) return point;
  }
  return null;
}

/** 稳定的字符串散列——保证同一课每次构建结果一致。 */
export function hashIndex(text, modulo) {
  let hash = 0;
  const str = String(text ?? "");
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % Math.max(1, modulo);
}

/* ──────────────────────────────────────────────────────────────────
 * 三、题库装配
 * ────────────────────────────────────────────────────────────────── */

/**
 * 一道题的统一形状。
 *
 * ⚠️ **绝不再有** ``type: "self"``（自评）这类空壳题。
 */
function makeQuestion({
  question,
  options,
  correctIndex,
  explanation,
  concept,
  source,
}) {
  return {
    question: String(question),
    options: options.map((item) => String(item)),
    correctIndex,
    explanation: String(explanation),
    concept,
    source,
  };
}

/**
 * 为一集语文课装配诊断题、随堂题与总结。
 */
export function buildChineseContent({ coreTitle, fullTitle, stage }) {
  // 语文课名里的尾部序号（「汉语拼音13」「语文园地三1」）是**分集标记**，
  // 不是课文名的一部分——去掉后才能匹配到真实的知识点。
  // 数学不能这么做：「十几减9」「100以内数的认识」里的数字是课文名本身。
  const cnTitle = stripTrailingIndex(coreTitle);
  const diagnostics = [];
  const quizzes = [];
  const summary = [];
  const notes = [];

  const poem = matchPoem(cnTitle, fullTitle);
  const classic = matchClassic(cnTitle, fullTitle);
  // 匹配优先级：**课文级知识点 → 结构化单元课 → 分学段兜底**。
  // 匹配优先级：**课文级知识点 → 高中专题 → 结构化单元课 → 分学段兜底**。
  // ⛔ **纯数字课名**（「21」「195」）——采集器拿不到主题。
  //    对这类课只能给一个**方法性**的兜底题；
  //    对**有名字**的课，绝不能用这个兜底——那是敷衍的假题。
  const isNumericTitle = /^\d{1,4}$/.test(cnTitle.trim());

  const point = isNumericTitle
    ? null
    : (matchLessonPoint(cnTitle, fullTitle) ??
      matchSeniorPoint(cnTitle) ??
      matchStructPoint(cnTitle, fullTitle) ??
      (stage === "primary"
        ? matchPrimaryChinesePoint(cnTitle, fullTitle)
        : stage === "junior"
          ? matchJuniorChinesePoint(cnTitle, fullTitle)
          : matchSeniorChinesePoint(cnTitle, fullTitle)));

  // 数字课名兜底——**仅用于**确实没有主题的课次。
  const numericPoint = isNumericTitle
    ? {
        concept: "分集编号课次的学习方法",
        question:
          "遇到只标了数字、没有主题的课次，最该做的是（　　）",
        options: [
          "先看视频前 3 分钟的目录，确认本讲主题，再回到本单元的知识主线",
          "随便选一个答案",
          "跳过这一课",
        ],
        correctIndex: 0,
        explanation:
          "**先定主题，再做题**。哪怕只看一眼目录，也比盲答有效得多。",
      }
    : null;

  /* ── 诊断题 1：课文考点 ── */
  const activePoint = point ?? numericPoint;
  if (activePoint) {
    diagnostics.push(
      makeQuestion({
        question: activePoint.question,
        options: activePoint.options,
        correctIndex: activePoint.correctIndex,
        explanation: activePoint.explanation,
        concept: activePoint.concept,
        source: "textbook",
      }),
    );
    notes.push(activePoint.concept);
  }

  /* ── 诊断题 2：古诗首句 / 名篇关键词 ── */
  if (poem) {
    diagnostics.push(
      makeQuestion({
        question: `《${poem.title}》（${poem.dynasty}·${poem.author}）中「${poem.lines[0]}」这一句，主要的写法或表达效果是（　　）`,
        options: [
          poem.plain[0],
          "只是平铺直叙的写景，没有任何特别之处",
          "全诗的中心句，其余各句均为重复",
        ],
        correctIndex: 0,
        explanation: `${poem.plain[0]}\n\n全诗共 ${poem.lines.length} 句，逐句的赏析见下面的「分句图解」。`,
        concept: `${poem.title}·首句赏析`,
        source: "poem",
      }),
    );
    notes.push(`${poem.title}（${poem.author}）`);
  } else if (classic) {
    diagnostics.push(
      makeQuestion({
        question: `《${classic.title}》（${classic.author}）中「${classic.keywords[0].term}」这一处的表达效果是（　　）`,
        options: [
          classic.keywords[0].plain,
          "作者用词随意，没有特别的用意",
          "只是为了凑足字数",
        ],
        correctIndex: 0,
        explanation: `${classic.keywords[0].meaning}\n\n${classic.keywords[0].plain}`,
        concept: `${classic.title}·${classic.keywords[0].device}`,
        source: "classic",
      }),
    );
    notes.push(`${classic.title}（${classic.author}）`);
  }

  if (diagnostics.length < 2 && activePoint) {
    // 第二道诊断题：同一课文的**另一个角度**——从「记住了什么」转到
    // 「能不能迁移」。仍然紧扣这一课，不落到通用模板。
    diagnostics.push(
      makeQuestion({
        question: `读《${cnTitle}》时，下面哪一句**最准确**地概括了「${activePoint.concept}」？（　　）`,
        options: [
          activePoint.explanation.length > 70
            ? `${activePoint.explanation.slice(0, 70)}……`
            : activePoint.explanation,
          "课文一共分几段",
          "作者写于哪一年",
          "课文有几个生字",
        ],
        correctIndex: 0,
        explanation: `${activePoint.explanation}\n\n**讲得清楚，才算真懂了。** 这一题考的不是记忆，是理解。`,
        concept: `${activePoint.concept}·讲清楚`,
        source: "textbook",
      }),
    );
    notes.push(`${cnTitle}·${activePoint.concept}`);
  }

  if (diagnostics.length < 2) {
    // 分学段兜底题——具体可答的能力题，不是自评表。
    const fallback =
      stage === "primary"
        ? PRIMARY_FALLBACK_QUESTIONS
        : stage === "junior"
          ? JUNIOR_FALLBACK_QUESTIONS
          : SENIOR_FALLBACK_QUESTIONS;
    const a = fallback[hashIndex(cnTitle, fallback.length)];
    const b = fallback[(hashIndex(cnTitle, fallback.length) + 1) % fallback.length];
    diagnostics.push(
      makeQuestion({
        question: a.question,
        options: a.options,
        correctIndex: a.correctIndex,
        explanation: a.explanation,
        concept: a.concept,
        source: "fallback",
      }),
    );
    diagnostics.push(
      makeQuestion({
        question: b.question,
        options: b.options,
        correctIndex: b.correctIndex,
        explanation: b.explanation,
        concept: b.concept,
        source: "fallback",
      }),
    );
    if (!notes.length) notes.push(`${cnTitle}·学段能力`);
  }

  /* ── 随堂测试题 ── */
  if (point) {
    quizzes.push(
      makeQuestion({
        question: `再练一练：《${cnTitle}》中，${activePoint.concept}的把握，关键在于（　　）`,
        options: [
          "能说出作者为什么这样写，而不只是记住了课文内容",
          "记住课文的段落划分",
          "记住课文里的生字个数",
          "记住课文一共多少字",
        ],
        correctIndex: 0,
        explanation: `${activePoint.explanation}\n\n迁移检验：能说清「为什么这样写」，才算真的读懂了这一篇。`,
        concept: `${activePoint.concept}·迁移`,
        source: "textbook",
      }),
    );
  }

  if (poem) {
    const last = poem.lines.length - 1;
    quizzes.push(
      makeQuestion({
        question: `《${poem.title}》的最后一句「${poem.lines[last]}」，理解最恰当的一项是（　　）`,
        options: [
          poem.plain[last],
          "与首句意思完全相同，重复了一遍",
          "只是写景，没有言外之意",
        ],
        correctIndex: 0,
        explanation: `${poem.plain[last]}\n\n英文对照：${poem.en[last]}`,
        concept: `${poem.title}·结句赏析`,
        source: "poem",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: `把《${poem.title}》翻译成英文时，最容易出问题的地方是（　　）`,
        options: [
          `「${poem.lines[0]}」里的意象与情感——直译会丢掉原文的味道`,
          "作者姓名的拼写",
          "朝代的英文名称",
          "诗有几个字",
        ],
        correctIndex: 0,
        explanation:
          "古诗的难处从来不是字面，是意象背后的情感。例如「" +
          poem.lines[0] +
          "」译成英文后，中文读者感到的那层惆怅就消失了——这正是需要「意译加注」的地方。",
        concept: `${poem.title}·英译要点`,
        source: "poem",
      }),
    );
  }

  if (classic) {
    quizzes.push(
      makeQuestion({
        question: classic.question,
        options: [
          "与文本无关的个人经历",
          classic.answer.length > 60
            ? `${classic.answer.slice(0, 60)}……`
            : classic.answer,
          "作者的家庭背景",
        ],
        correctIndex: 1,
        explanation: classic.answer,
        concept: `${classic.title}·文本细读`,
        source: "classic",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: `要读懂《${classic.title}》，最应该抓住的是（　　）`,
        options: [
          "作者写作的时代背景",
          "作者反复强调或着力描写的那个「点」——它就是文本的核心",
          "课文的长度",
        ],
        correctIndex: 1,
        explanation: `任何一篇文本都有它的「着力点」。《${classic.title}》里，${classic.keywords[0].term}正是作者用力最多的地方——抓住它，全文就通了。`,
        concept: `${classic.title}·核心抓手`,
        source: "classic",
      }),
    );
  }

  if (quizzes.length < 3 && activePoint) {
    // 随堂测试要有**梯度**：
    //   第 1 题 —— 记住「是什么」（识记）；
    //   第 2 题 —— 理解「为什么」（分析）；
    //   第 3 题 —— 迁移「怎么办」（方法）。
    // 三题都锁死在这一课，不落通用模板。
    quizzes.push(
      makeQuestion({
        question: `《${cnTitle}》中，${activePoint.concept}——下面哪一句**准确**地复述了这一点？`,
        options: [
          activePoint.explanation.length > 76
            ? `${activePoint.explanation.slice(0, 76)}……`
            : activePoint.explanation,
          "课文一共分几段",
          "作者写于哪一年",
          "课文有几个生字",
        ],
        correctIndex: 0,
        explanation: `${activePoint.explanation}\n\n**能准确复述，就是真的会了。**`,
        concept: `${activePoint.concept}·识记`,
        source: "textbook",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: `如果要把《${cnTitle}》里的「${activePoint.concept}」讲给别人听，最容易讲错的地方是（　　）`,
        options: [
          "只背结论，不理解作者为什么这样写",
          "讲得太长，超过了五分钟",
          "用了太多成语",
        ],
        correctIndex: 0,
        explanation: `「${activePoint.concept}」的关键在于**为什么**。${activePoint.explanation}\n\n讲清楚「为什么」，才算读懂；只背结论，遇到变式就会懵。`,
        concept: `${activePoint.concept}·理解`,
        source: "textbook",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: `读《${cnTitle}》时，哪一个做法最能帮你真正掌握「${activePoint.concept}」？（　　）`,
        options: [
          "合上课本，用自己的话复述一遍，再回到课文核对",
          "把课文抄三遍",
          "只背课后题的答案",
        ],
        correctIndex: 0,
        explanation: `**「先输出、再核对」**是最高效的读法。复述时卡住的地方，就是你没读懂的地方——回去精读那一段，比通读十遍都管用。`,
        concept: `${activePoint.concept}·方法`,
        source: "textbook",
      }),
    );
  }

  if (quizzes.length < 2) {
    const fallback =
      stage === "primary"
        ? PRIMARY_FALLBACK_QUESTIONS
        : stage === "junior"
          ? JUNIOR_FALLBACK_QUESTIONS
          : SENIOR_FALLBACK_QUESTIONS;
    const a = fallback[hashIndex(`${cnTitle}q`, fallback.length)];
    const b = fallback[hashIndex(`${cnTitle}q2`, fallback.length)];
    quizzes.push(
      makeQuestion({
        question: a.question,
        options: a.options,
        correctIndex: a.correctIndex,
        explanation: a.explanation,
        concept: a.concept,
        source: "fallback",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: b.question,
        options: b.options,
        correctIndex: b.correctIndex,
        explanation: b.explanation,
        concept: b.concept,
        source: "fallback",
      }),
    );
  }

  /* ── 3 条核心总结 ── */
  if (poem) {
    summary.push(
      `《${poem.title}》共 ${poem.lines.length} 句，作者${poem.author}（${poem.dynasty}）。逐句白话与英文对照见「分句图解」模块。`,
    );
    summary.push(`首句「${poem.lines[0]}」——${poem.plain[0]}`);
    summary.push(
      `全诗的核心在结句：「${poem.lines[poem.lines.length - 1]}」——${poem.plain[poem.lines.length - 1]}`,
    );
  } else if (classic) {
    summary.push(
      `《${classic.title}》（${classic.author}）的核心概念：${classic.keywords[0].device}——${classic.keywords[0].meaning}`,
    );
    summary.push(`关键句「${classic.keywords[0].term}」的白话：${classic.keywords[0].plain}`);
    summary.push(`思考题要点：${classic.answer}`);
  } else if (point) {
    summary.push(`本课考点：${activePoint.concept}。`);
    summary.push(activePoint.explanation);
    summary.push(
      `复习建议：合上课文，用自己的话把「${cnTitle}」的这一点讲一遍——能讲清楚，就是真懂了。`,
    );
  } else {
    summary.push(
      `本讲围绕「${cnTitle}」展开。${STAGE_LABEL[stage]}的核心要求是：能复述内容、能说出写法、能联系课内例句。`,
    );
    summary.push(
      "建议的复习路径：① 回看视频里老师圈出的重点；② 把课文的生字词与关键句抄一遍；③ 用一句话概括这一讲。",
    );
    summary.push(
      "如果这一讲有拿不准的地方，可以在右侧直接向 AI 助教提问——它会按你刚才的诊断结果调整深浅。",
    );
  }

  return { diagnostics, quizzes, summary, notes };
}

/**
 * 为一集数学课装配诊断题、随堂题与总结。
 */
export function buildMathContent({ coreTitle, fullTitle }) {
  // 数学课名里的页码后缀要先去掉（「练习九--P54」→「练习九」）。
  const maTitle = stripPageSuffix(coreTitle);
  const diagnostics = [];
  const quizzes = [];
  const summary = [];

  const topic = findMathTopic(maTitle, fullTitle);

  if (topic) {
    const d = makeQuestion({
      question: topic.prerequisite.question,
      options: topic.prerequisite.options,
      correctIndex: topic.prerequisite.correctIndex,
      explanation: topic.prerequisite.explanation,
      concept: `${topic.title}·前置基础`,
      source: "math",
    });
    const q = makeQuestion({
      question: topic.transfer.question,
      options: topic.transfer.options,
      correctIndex: topic.transfer.correctIndex,
      explanation: topic.transfer.explanation,
      concept: `${topic.title}·迁移应用`,
      source: "math",
    });
    diagnostics.push(d);
    quizzes.push(q);
    // 第 2 道诊断题——**概念辨析**，不是第 1 题的复读。
    //
    // ⛔ 复读同一道题是敷衍：学生答对一次不代表会了。
    //    这里改问「这个概念**是什么**」——
    //    逼学生把定义说清楚，而不是碰巧算对。
    diagnostics.push(
      makeQuestion({
        question: `关于「${topic.title}」，下面哪一句**准确**地复述了它的规则？（　　）`,
        options: [
          topic.definition.length > 78
            ? `${topic.definition.slice(0, 78)}……`
            : topic.definition,
          "记住几道例题的答案就够了",
          "考试只考计算，不考概念",
        ],
        correctIndex: 0,
        explanation:
          `${topic.definition}\n\n**概念清楚了，题目自然简单。**`,
        concept: `${topic.title}·概念辨析`,
        source: "math",
      }),
    );
    // 随堂题 2——**换个角度再考一次**迁移应用。
    //
    // ⛔ 不复读同一道 transfer 题：那只是抄答案，不是检测。
    //    这里改成「换个说法问同一个知识点」——
    //    学生必须真的理解，才能答对。
    quizzes.push(
      makeQuestion({
        question: `换一种问法：关于「${topic.title}」，下列做法**正确**的是（　　）`,
        options: [
          topic.transfer.explanation.length > 78
            ? `${topic.transfer.explanation.slice(0, 78)}……`
            : topic.transfer.explanation,
          "先套公式，套不进去再想别的",
          "记住答案步骤，不管题目怎么变",
        ],
        correctIndex: 0,
        explanation:
          `${topic.transfer.explanation}\n\n**换个问法还能做对，才说明是真的会了。**`,
        concept: `${topic.title}·迁移应用（换问法）`,
        source: "math",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: `本讲「${topic.title}」的核心是什么？（　　）`,
        options: [
          topic.definition.length > 76
            ? `${topic.definition.slice(0, 76)}……`
            : topic.definition,
          "记住几道例题的答案就够了",
          "考试只考计算，不考概念",
        ],
        correctIndex: 0,
        explanation: `${topic.definition}\n\n**概念清楚了，题目自然简单。**`,
        concept: `${topic.title}·概念`,
        source: "math",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: `做「${topic.title}」的题时，最该先想清楚的是（　　）`,
        options: [
          "这一步用的是什么依据（定义 / 公式 / 运算律）",
          "先看答案是哪个选项",
          "先写完所有步骤再说",
        ],
        correctIndex: 0,
        explanation: `**依据先行**：先说清「凭什么」，再动笔算。${topic.definition}\n\n这样做的好处是——换一道数字不同的题，你依然会。`,
        concept: `${topic.title}·解题思路`,
        source: "math",
      }),
    );
    summary.push(`本讲核心：${topic.title}。${topic.definition}`);
    summary.push(
      `前置检验：${topic.prerequisite.question}（答案：${topic.prerequisite.options[topic.prerequisite.correctIndex]}）`,
    );
    summary.push(
      `迁移应用：${topic.transfer.question}（答案：${topic.transfer.options[topic.transfer.correctIndex]}）`,
    );
  } else {
    const fallback = FALLBACK_MATH;
    const a = fallback[hashIndex(maTitle, fallback.length)];
    const b = fallback[hashIndex(`${maTitle}2`, fallback.length)];
    diagnostics.push(
      makeQuestion({
        question: a.question,
        options: a.options,
        correctIndex: a.correctIndex,
        explanation: a.explanation,
        concept: a.concept,
        source: "fallback",
      }),
    );
    diagnostics.push(
      makeQuestion({
        question: b.question,
        options: b.options,
        correctIndex: b.correctIndex,
        explanation: b.explanation,
        concept: b.concept,
        source: "fallback",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: a.question,
        options: a.options,
        correctIndex: a.correctIndex,
        explanation: a.explanation,
        concept: `${a.concept}·应用`,
        source: "fallback",
      }),
    );
    quizzes.push(
      makeQuestion({
        question: b.question,
        options: b.options,
        correctIndex: b.correctIndex,
        explanation: b.explanation,
        concept: `${b.concept}·应用`,
        source: "fallback",
      }),
    );
    summary.push(`本讲围绕「${maTitle}」展开，属于数学的核心内容。`);
    summary.push(
      "掌握标准：能独立完成本讲的例题，并说清楚每一步用了什么依据（定义、公式还是运算律）。",
    );
    summary.push(
      "推荐做法：先在「互动实验室」里把参数拖一遍、看一遍图象或图形的动态变化，再回到题目——理解会深得多。",
    );
  }

  return { diagnostics, quizzes, summary, notes: [] };
}

/* ──────────────────────────────────────────────────────────────────
 * 四、分学段的数学兜底题（全部是真实可答的计算题）
 * ────────────────────────────────────────────────────────────────── */

export const FALLBACK_MATH = [
  {
    concept: "整数运算",
    question: "计算：25 + 38 = ?",
    options: ["53", "63", "83"],
    correctIndex: 1,
    explanation:
      "个位 5 + 8 = 13，写 3 进 1；十位 2 + 3 + 1 = 6。所以 25 + 38 = 63。答案是 63。",
  },
  {
    concept: "乘除法与运算律",
    question: "简便计算：25 × 4 × 3 = ?",
    options: ["300", "280", "100"],
    correctIndex: 0,
    explanation:
      "用乘法交换律与结合律：25 × 4 = 100，100 × 3 = 300。答案是 300。",
  },
  {
    concept: "长度单位与测量",
    question: "1 米 = ? 厘米",
    options: ["10", "100", "1000"],
    correctIndex: 1,
    explanation: "1 米 = 100 厘米。答案是 100。",
  },
  {
    concept: "有理数运算",
    question: "计算：(-12) + 8 = ?",
    options: ["-4", "4", "-20"],
    correctIndex: 0,
    explanation:
      "异号相加，取绝对值大的（12）的符号，绝对值相减：12 - 8 = 4，所以结果是 -4。答案是 -4。",
  },
  {
    concept: "整式化简",
    question: "化简：3(x - 2) - 2(x + 1) = ?",
    options: ["x - 8", "x + 2", "5x"],
    correctIndex: 0,
    explanation: "去括号：3x - 6 - 2x - 2 = x - 8。答案是 x - 8。",
  },
  {
    concept: "几何图形",
    question: "一个三角形的两个内角分别是 50°、60°，第三个角是多少度？",
    options: ["60°", "70°", "80°"],
    correctIndex: 1,
    explanation:
      "三角形内角和是 180°，第三角 = 180° - 50° - 60° = 70°。答案是 70°。",
  },
  {
    concept: "函数与方程",
    question: "函数 f(x) = 2x - 5，当 f(x) = 3 时，x 等于多少？",
    options: ["1", "4", "-1"],
    correctIndex: 1,
    explanation: "解方程：2x - 5 = 3 ⇒ 2x = 8 ⇒ x = 4。答案是 4。",
  },
  {
    concept: "三角函数",
    question: "sin60° 等于多少？",
    options: ["1/2", "√3/2", "√2/2"],
    correctIndex: 1,
    explanation:
      "特殊角：sin30° = 1/2，sin60° = √3/2，sin45° = √2/2。答案是 √3/2。",
  },
  {
    concept: "数列",
    question: "等差数列 2, 5, 8, 11, … 的第 8 项是多少？",
    options: ["23", "26", "24"],
    correctIndex: 0,
    explanation:
      "a₁ = 2，d = 3，a₈ = 2 + 7 × 3 = 2 + 21 = 23。答案是 23。",
  },
];
