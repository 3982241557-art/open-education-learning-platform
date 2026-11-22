#!/usr/bin/env node
/**
 * 真实内容构建脚本 · Authentic Curriculum Builder
 * =============================================
 *
 * 依据**真实统编语文课文生字表 / 人教数学章节知识点**与视频真实
 * 分 P 内容，为每一节上线的课精准生成独立的 ``lesson_manifest``。
 *
 * 它要根治的三件事
 * ----------------
 *
 * 1. ⛔ **截标题拆字**——绝不再把《古诗二首》拆成「古、诗、二、首」。
 *    二年级《古诗二首》的真实生字是**诗、村、童、碧、妆、绿、丝、
 *    剪**（《村居》与《咏柳》里的字），这才是学生要写的字。
 *
 * 2. ⛔ **跨课混塞**——绝不再把整册数据堆进单节课。每一课只挂
 *    **它自己的**生字、原文、考点与题目。
 *
 * 3. ⛔ **无真实内容的课硬上线**——口语交际、习作例文、单元总结、
 *    期末冲刺这类课**本来就没有生字表**。它们走「习作 / 口语」
 *    教具路径，而不是硬凑几个字去描红。
 *
 * 数学课
 * ------
 *
 * 每一节数学课都精确绑定：``math_tool_type``（教具类型）+
 * ``tool_config``（初始参数，如具体目标角度、具体函数式、具体统计
 * 数据集）+ 2–3 道紧扣本课的巩固题。
 *
 * 运行：
 *
 * .. code-block:: bash
 *
 *    node scripts/build-authentic-curriculum.mjs
 *
 * 输出：
 *
 * - 24 套 ``web/public/data/courses/k12_*.json`` 的 ``lesson_manifest``
 *   字段（逐课精确绑定）；
 * - ``web/public/data/k12-authentic-report.json``（构建自检报告）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isNonTextbookLesson,
  matchLessonHanzi,
} from "./k12-knowledge-hanzi.mjs";
import {
  extractCoreTitle,
  stageOf,
} from "./k12-content-kit.mjs";
import { buildInteractiveLab } from "./k12-lab-builder.mjs";
import {
  findMathTopic,
  stripPageSuffix,
  stripTrailingIndex,
} from "./k12-content-kit.mjs";
import {
  matchPrimaryChinesePoint,
  matchJuniorChinesePoint,
  matchSeniorChinesePoint,
} from "./k12-knowledge-chinese.mjs";
import { matchLessonPoint } from "./k12-knowledge-lessons.mjs";
import { PINYIN_TABLE } from "./k12-hanzi-pinyin-table.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COURSES_DIR = path.join(ROOT, "web", "public", "data", "courses");
const REPORT_PATH = path.join(
  ROOT,
  "web",
  "public",
  "data",
  "k12-authentic-report.json",
);

/* ──────────────────────────────────────────────────────────────────
 * 工具
 * ────────────────────────────────────────────────────────────────── */

/** 从课名里剥掉分集序号。 */
function stripIndex(title) {
  return stripTrailingIndex(String(title ?? ""));
}

/** 从课名里剥掉「（生字）」这类后缀。 */
function stripParens(title) {
  return String(title ?? "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .trim();
}

/** 判断一个字符串里是否全是汉字。 */
function isHan(text) {
  return /^[\u4e00-\u9fa5]+$/.test(String(text ?? ""));
}

/**
 * 「生字是否就是标题拆字」。
 *
 * 这是**红线检查**——如果一课的生字恰好等于它标题里的汉字序列
 * （按顺序、连续取前 N 个），那它就是拆字凑数，不是真实生字表。
 */
function charsAreTitleSplit(chars, title) {
  if (!chars || chars.length === 0) return false;
  const titleChars = [...String(title)].filter((c) => isHan(c));
  if (titleChars.length === 0) return false;
  // 取标题里连续的、长度与生字数相同的一段。
  for (let i = 0; i + chars.length <= titleChars.length; i += 1) {
    const window = titleChars.slice(i, i + chars.length);
    if (window.every((c, index) => c === chars[index])) return true;
  }
  return false;
}

/* ──────────────────────────────────────────────────────────────────
 * 语文 · lesson_manifest
 * ────────────────────────────────────────────────────────────────── */

/**
 * 为一节语文课生成真实内容清单。
 *
 * @returns {Object} lesson_manifest
 */
function buildChineseManifest({ grade, stage, coreTitle, fullTitle }) {
  const cleanTitle = stripParens(stripIndex(coreTitle));
  const isNonTextbook = isNonTextbookLesson(coreTitle);

  // ── ① 真实生字 ──
  //
  // 优先用**课文级生字表**（真实教材写字表）；
  // 找不到时，才退到「课文名里的字」——但那必须**不是**整段标题拆字。
  const hanziEntry = matchLessonHanzi(coreTitle);
  const point =
    stage === "primary"
      ? matchPrimaryChinesePoint(cleanTitle, fullTitle)
      : stage === "junior"
        ? matchJuniorChinesePoint(cleanTitle, fullTitle)
        : matchSeniorChinesePoint(cleanTitle, fullTitle);
  const lessonPoint = matchLessonPoint(cleanTitle, fullTitle);

  let chars = [];
  let charsSource = "none";
  let charsNote = "";

  if (hanziEntry) {
    chars = hanziEntry.chars.slice(0, 8);
    charsSource = "textbook";
    charsNote = hanziEntry.note ?? "";
  } else if (!isNonTextbook) {
    // 没有权威生字表——退到**课文名里的单字**，但要检查它不是拆字。
    const titleChars = [...cleanTitle].filter((c) => isHan(c));
    const candidate = titleChars.filter((c) => !/[的了与和是在有]/.test(c));
    if (candidate.length >= 2 && !charsAreTitleSplit(candidate.slice(0, 4), cleanTitle)) {
      chars = candidate.slice(0, 4);
      charsSource = "derived";
      charsNote = "取自课文名中的实词汉字";
    }
  }

  // ⛔ 红线：生字**绝不等于**标题拆字。
  if (chars.length >= 2 && charsAreTitleSplit(chars, cleanTitle)) {
    // 拆字 → 弃用（宁缺毋滥）。
    chars = [];
    charsSource = "rejected-title-split";
  }

  const pinyin = chars.map((char) => PINYIN_TABLE[char] ?? "");

  // ── ② 真实文化 / 考点 ──
  const concept =
    hanziEntry?.note ??
    point?.concept ??
    lessonPoint?.concept ??
    (isNonTextbook ? "本课属于专项练习课型" : `${cleanTitle} 的课文理解`);

  // ── ③ 教具 ──
  const lab = buildInteractiveLab({
    subject: "chinese",
    stage,
    coreTitle,
    fullTitle,
    grade,
  });

  // ⛔ 红线：初高中语文**绝不**出现笔顺描红。
  if (stage !== "primary" && lab.kind === "hanzi") {
    lab.kind = "literary";
    lab.chars = undefined;
    lab.pinyin = undefined;
  }

  // 小学语文：把**真实生字**灌进教具（而不是标题拆字）。
  //
  // ⛔ 若 ``chars`` 为空（这课没有权威生字表，且无法安全派生），
  //    就**撤掉描红教具**——挂一个教「我爱学语文」描红的教具，
  //    比不挂更糟。它会退到「字词句与表达」教具。
  if (stage === "primary" && lab.kind === "hanzi" && chars.length > 0) {
    lab.chars = chars;
    lab.pinyin = pinyin;
    lab.title = `${cleanTitle}·核心生字笔顺`;
  } else if (stage === "primary" && lab.kind === "hanzi") {
    // 无真实生字 → 换成「表达结构」教具，绝不描红假字。
    lab.kind = "poem";
    lab.title = `${cleanTitle}·字词句与表达`;
    lab.chars = undefined;
    lab.pinyin = undefined;
    lab.segments = buildWritingSegments(cleanTitle);
    lab.notes = [];
    lab.poem = null;
  }

  // 非课文课型（口语交际 / 习作 / 单元总结）→ **不挂描红**，
  // 改挂「习作与表达」教具。
  if (stage === "primary" && isNonTextbook) {
    lab.kind = "poem";
    lab.title = `${cleanTitle}·字词句与表达`;
    lab.chars = undefined;
    lab.pinyin = undefined;
    lab.segments = buildWritingSegments(cleanTitle);
    lab.notes = [];
    lab.poem = null;
  }

  return {
    kind: "chinese",
    grade,
    stage,
    core_title: cleanTitle,
    /** 本课真实生字——**严格来自教材写字表**。 */
    hanzi: chars,
    pinyin,
    /** 生字来源：``textbook`` = 教材写字表；``derived`` = 课文名实词。 */
    hanzi_source: charsSource,
    hanzi_note: charsNote,
    /** 本课的文化 / 考点。 */
    concept,
    /** 教具类型。 */
    math_tool_type: null,
    tool_config: null,
    /** 是否为「非课文课型」。 */
    non_textbook: isNonTextbook,
    interactive_lab: lab,
  };
}

/**
 * 为「习作 / 口语交际 / 单元总结」这类课生成**字词句结构**教具。
 *
 * 它不假装有生字表——它教的是**表达结构**：
 * 「一句话说得清」→「一段话说得全」→「一篇文说得亮」。
 */
function buildWritingSegments(title) {
  if (/口语交际/.test(title)) {
    return [
      "说清楚：谁 + 在什么情况下 + 做了什么 + 结果怎样",
      "有礼貌：先说明来意，再提出请求，最后致谢",
      "听明白：抓住关键词，不打断，不抢话",
      "会商量：先讲立场，再讲理由，最后给方案",
    ];
  }
  if (/习作|作文/.test(title)) {
    return [
      "第一步 · 审题：题目里的限制词，决定了写什么、怎么写",
      "第二步 · 选材：只挑一个最能说明问题的细节",
      "第三步 · 顺序：起因 → 经过 → 结果 → 感受",
      "第四步 · 修改：读一遍，问自己「读者看得懂吗」",
    ];
  }
  if (/单元总结|语文园地/.test(title)) {
    return [
      "本单元的生字：读准 → 写对 → 组词 → 用进句子",
      "本单元的词语：理解意思 → 辨清用法 → 积累搭配",
      "本单元的句式：把长句拆短，把短句连成段",
      "本单元的表达要求：这一组课文共同教会了什么写法",
    ];
  }
  if (/期末|冲刺|真题/.test(title)) {
    return [
      "字音：易错音集中过一遍（前后鼻音、平翘舌）",
      "字形：形近字辨析（偏旁、结构、意义）",
      "词语：近义词反义词与搭配",
      "阅读：提取信息 → 概括段意 → 抓住中心句",
    ];
  }
  // 通用：讲解类课。
  return [
    "这一课的生字词：读准、写对、组词",
    "这一课的句子：找出主干，看清修饰",
    "这一课的段落：中心句在哪，层次怎么分",
    "这一课的表达：作者为什么这样写",
  ];
}

/* ──────────────────────────────────────────────────────────────────
 * 数学 · lesson_manifest
 * ────────────────────────────────────────────────────────────────── */

/**
 * 为一节数学课生成真实内容清单。
 *
 * 数学课的「真实内容」= **精确匹配的教具 + 真实初始参数**。
 * 比如「三角形的内角和」必须挂**动态量角器**（可旋转、实时读数、
 * 校验 180°），而不是一个泛泛的「几何」标签。
 */
function buildMathManifest({ grade, stage, coreTitle, fullTitle }) {
  const cleanTitle = stripPageSuffix(stripIndex(coreTitle));
  const topic = findMathTopic(cleanTitle, fullTitle);

  const lab = buildInteractiveLab({
    subject: "math",
    stage,
    coreTitle,
    fullTitle,
    grade,
  });

  return {
    kind: "math",
    grade,
    stage,
    core_title: cleanTitle,
    hanzi: [],
    pinyin: [],
    hanzi_source: "none",
    hanzi_note: "",
    /** 本课的核心数学概念。 */
    concept:
      topic?.title ??
      topic?.definition ??
      `${cleanTitle} 的数学知识点`,
    /** 教具类型——**精确匹配**到本课知识点。 */
    math_tool_type: lab.kind,
    /** 教具初始参数——具体目标角度 / 函数式 / 统计数据集。 */
    tool_config: {
      ...(lab.params ?? {}),
      ...(lab.target !== undefined ? { target: lab.target } : {}),
      ...(lab.slices !== undefined ? { slices: lab.slices } : {}),
      ...(lab.shape !== undefined ? { shape: lab.shape } : {}),
      ...(lab.fn !== undefined ? { fn: lab.fn } : {}),
    },
    non_textbook: false,
    interactive_lab: lab,
  };
}

/* ──────────────────────────────────────────────────────────────────
 * 主流程
 * ────────────────────────────────────────────────────────────────── */

/** 处理一套系列。 */
function processSeries(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  const grade = Number(data.grade) || 1;
  const subject = data.subject === "chinese" ? "chinese" : "math";
  const stage = stageOf(grade);

  const stats = {
    file: path.basename(filePath),
    grade,
    subject,
    episodes: data.episodes.length,
    textbook: 0,
    derived: 0,
    rejected: 0,
    nonTextbook: 0,
    titleSplit: 0,
    literaryInJunior: 0,
    mathToolMissing: 0,
  };

  for (const episode of data.episodes) {
    const coreTitle =
      episode.core_title || extractCoreTitle(episode.title) || episode.title;
    const fullTitle = episode.title;

    const manifest =
      subject === "chinese"
        ? buildChineseManifest({ grade, stage, coreTitle, fullTitle })
        : buildMathManifest({ grade, stage, coreTitle, fullTitle });

    // 写回这一集。
    episode.core_title = manifest.core_title;
    episode.lesson_manifest = manifest;
    episode.interactive_lab = manifest.interactive_lab;

    // ── 自检 ──
    if (manifest.hanzi_source === "textbook") stats.textbook += 1;
    else if (manifest.hanzi_source === "derived") stats.derived += 1;
    else if (manifest.hanzi_source === "rejected-title-split") {
      stats.rejected += 1;
      stats.titleSplit += 1;
    }
    if (manifest.non_textbook) stats.nonTextbook += 1;

    if (
      subject === "chinese" &&
      stage !== "primary" &&
      manifest.interactive_lab.kind === "hanzi"
    ) {
      stats.literaryInJunior += 1;
    }

    if (subject === "math" && !manifest.math_tool_type) {
      stats.mathToolMissing += 1;
    }
  }

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return stats;
}

/** 主入口。 */
function main() {
  if (!fs.existsSync(COURSES_DIR)) {
    console.error(`找不到课程目录：${COURSES_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(COURSES_DIR)
    .filter((name) => /^k12_.*\.json$/.test(name))
    .map((name) => path.join(COURSES_DIR, name))
    .sort();

  const all = [];
  for (const file of files) {
    all.push(processSeries(file));
  }

  /* ── 汇总 ── */
  const total = (key) => all.reduce((sum, item) => sum + item[key], 0);

  const report = {
    generated_at: new Date().toISOString(),
    seriesCount: all.length,
    episodeCount: total("episodes"),
    hanzi: {
      textbook: total("textbook"),
      derived: total("derived"),
      rejectedTitleSplit: total("rejected"),
    },
    nonTextbookLessons: total("nonTextbook"),
    redLines: {
      secondaryChineseWithStrokeTracing: total("literaryInJunior"),
      hanziEqualToTitleSplit: total("titleSplit"),
      mathLessonsWithoutTool: total("mathToolMissing"),
    },
    series: all,
  };

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  /* ── 打印 ── */
  console.log("════════════════════════════════════════════════════════════");
  console.log("真实内容构建报告");
  console.log("════════════════════════════════════════════════════════════");
  console.log(
    `系列：${report.seriesCount} 套　｜　课时：${report.episodeCount} 集`,
  );
  console.log(
    `生字来源：教材写字表 ${report.hanzi.textbook} 集　｜　课文名实词 ${report.hanzi.derived} 集　｜　拒绝拆字 ${report.hanzi.rejectedTitleSplit} 集`,
  );
  console.log(`非课文课型（习作 / 口语 / 单元总结）：${report.nonTextbookLessons} 集`);
  console.log("────────────────────────────────────────────────────────────");
  const red = report.redLines;
  const ok = (v) => (v === 0 ? "✅" : "❌");
  console.log(`${ok(red.secondaryChineseWithStrokeTracing)} 初高中语文出现笔顺描红：${red.secondaryChineseWithStrokeTracing} 集`);
  console.log(`${ok(red.hanziEqualToTitleSplit)} 生字等于标题拆字：${red.hanziEqualToTitleSplit} 集`);
  console.log(`${ok(red.mathLessonsWithoutTool)} 数学课无精确教具：${red.mathLessonsWithoutTool} 集`);
  console.log("════════════════════════════════════════════════════════════");
}

main();
