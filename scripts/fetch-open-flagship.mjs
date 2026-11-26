#!/usr/bin/env node
/**
 * 「一切皆数学」标杆专题内容采集器
 * ================================
 *
 * 为首批 3 个精工标杆专题，从**真实的 GitHub 开源仓库**拉取原始
 * 教学内容，生成带来源记录的三语文本数据文件。
 *
 * ⛔ **绝不 AI 编造**
 *
 * 本脚本只做三件事：**下载 → 解析 → 重组**。它自己**不产生**任何
 * 教学内容。每一个概念定义、每一条定理、每一条例题、每一条思维
 * 题的数学内核，都**逐字**来自下列开源仓库：
 *
 * | 仓库 | 内容 | 协议 |
 * |---|---|---|
 * | ``openstax/osbooks-college-algebra-bundle`` | 严谨的概念定义、定理、例题、习题 | CC BY-NC-SA 4.0 |
 * | ``Khan/khan-exercises`` | 练习题模板 + 逐级启发提示 | CC BY-NC-SA 3.0（练习）/ MIT（框架） |
 * | ``haojing8312/cn-k12-math-knowledge-graph`` | 中文教材知识点体系（章节归属） | CC BY-NC-SA 4.0 |
 *
 * 三语策略
 * --------
 *
 * - ``zh-CN`` —— 中文教材图谱的知识点名 + 中文表述；
 * - ``zh-TW`` —— 简体中文经**字符级** OpenCC ``s2t`` 规则转换；
 * - ``en``    —— 来自 OpenStax / Khan 的**英文原文**。
 *
 * ⛔ 三种语言**各自独立成列**，界面渲染时只取当前语言的那一列。
 *
 * 用法
 * ----
 *
 * ```bash
 * node scripts/fetch-open-flagship.mjs             # 拉取并生成
 * node scripts/fetch-open-flagship.mjs --check     # 只校验现有文件
 * node scripts/fetch-open-flagship.mjs --offline   # 用本地缓存
 * ```
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(
  ROOT,
  "web",
  "public",
  "data",
  "flagship-topics.json",
);
const CACHE_DIR = path.join(ROOT, ".flagship-cache");

/* ──────────────────────────────────────────────────────────────────
 * 拉取源配置
 * ────────────────────────────────────────────────────────────────── */

/** OpenStax 开源大学代数教材（内容最完整，覆盖指数 / 数列 / 概率）。 */
const OPENSTAX = {
  repo: "openstax/osbooks-college-algebra-bundle",
  license: "CC BY-NC-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  rawBase:
    "https://raw.githubusercontent.com/openstax/osbooks-college-algebra-bundle/main/modules",
};

/**
 * OpenStax 开源《Introductory Statistics》教材。
 *
 * ⛔ 它的 ``modules/`` 目录里**模块 id 是稀疏的**——``m79613``、
 *    ``m79615`` 这些 id 根本不存在。所以这里**必须**按仓库分开的
 *    base 来取，不能混用。
 */
const OPENSTAX_STATS = {
  repo: "openstax/osbooks-statistics",
  license: "CC BY-NC-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  rawBase:
    "https://raw.githubusercontent.com/openstax/osbooks-statistics/main/modules",
};

/** Khan Academy 开源练习库。 */
const KHAN = {
  repo: "Khan/khan-exercises",
  license: "CC BY-NC-SA 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
  rawBase:
    "https://raw.githubusercontent.com/Khan/khan-exercises/master/exercises",
};

/** 中文 K12 数学知识图谱（人教版教材章节体系）。 */
const CNK12 = {
  repo: "haojing8312/cn-k12-math-knowledge-graph",
  license: "CC BY-NC-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  rawBase:
    "https://raw.githubusercontent.com/haojing8312/cn-k12-math-knowledge-graph/main/data",
};

/* ──────────────────────────────────────────────────────────────────
 * 3 个标杆专题的源文件映射
 *
 * 每个专题指定：
 *
 * - ``openstax`` —— CNXML 模块 id + 必须**精确匹配**的 section 名；
 * - ``khan``    —— Khan 开源练习库里的真实练习文件；
 * - ``cnKeywords`` —— 中文图谱里的知识点关键词（短词精确、长词包含）。
 *
 * ⛔ **section 必须精确**。CNXML 里所有 section 平铺在一层，概念框
 *    （``<note>``）带自己所属的 section 名。挑错了就是张冠李戴——
 *    比编造更糟，因为它看起来像是真的。
 * ────────────────────────────────────────────────────────────────── */

const TOPIC_SOURCES = [
  {
    id: "exp-comfort",
    /**
     * 主模块：``m49361`` = OpenStax《College Algebra》「Exponential
     * Functions」。概念框的 section 名是**子章节名**（如
     * ``Finding Common Ratios``），不是模块名。
     */
    openstax: {
      module: "m49361",
      title: "Exponential Functions",
      sections: [
        "Identifying Exponential Functions",
        "Defining an Exponential Function",
        "Evaluating Exponential Functions",
        "Defining Exponential Growth",
        "Applying the Compound-Interest Formula",
        "Investigating Continuous Growth",
      ],
    },
    openstaxSupport: [
      {
        module: "m49356",
        title: "Introduction to Exponential and Logarithmic Functions",
        sections: ["Introduction to Exponential and Logarithmic Functions"],
      },
      {
        module: "m49362",
        title: "Graphs of Exponential Functions",
        sections: ["Graphs of Exponential Functions"],
      },
      {
        module: "m49367",
        title: "Exponential and Logarithmic Models",
        sections: ["Exponential and Logarithmic Models"],
      },
    ],
    khan: [
      "exponents_1",
      "exponents_2",
      "exponents_3",
      "exponent_rules",
      "simplifying_expressions_with_exponents",
      "simplifying_radicals",
      "powers_of_complex_numbers_1",
    ],
    cnKeywords: ["乘方", "幂的乘方", "积的乘方", "指数", "倒数"],
  },
  {
    id: "seq-zeno",
    openstax: {
      module: "m49446",
      title: "Geometric Sequences",
      sections: [
        "Finding Common Ratios",
        "Writing Terms of Geometric Sequences",
        "Using Recursive Formulas for Geometric Sequences",
        "Using Explicit Formulas for Geometric Sequences",
        "Solving Application Problems with Geometric Sequences",
      ],
    },
    openstaxSupport: [
      {
        module: "m49447",
        title: "Series and Their Notations",
        sections: [
          "Using the Formula for Geometric Series",
          "Determining Whether the Sum of an Infinite Geometric Series is Defined",
          "Finding Sums of Infinite Series",
        ],
      },
      {
        module: "m49444",
        title: "Sequences and Their Notations",
        sections: ["Writing the Terms of a Sequence Defined by an Explicit Formula"],
      },
      {
        module: "m49452",
        title: "Finding Limits: Numerical and Graphical Approaches",
        sections: ["Finding Limits: Numerical and Graphical Approaches"],
      },
    ],
    khan: [
      "geometric_sequences_1",
      "geometric_sequences_2",
      "arithmetic_sequences_1",
    ],
    /**
     * ⛔ cn-k12 图谱只覆盖到**初中**（人教版九年级下册），没有
     *    「数列」「极限」这些高中条目。所以这里选**真实存在**的
     *    初中等价物：分数单位 / 真分数 / 用图形表示分数 —— 它们
     *    正是「一半再一半」这件事在教材里的原始表述。
     */
    cnKeywords: [
      "分数单位",
      "用图形表示分数",
      "真分数",
      "分数与除法的关系",
      "根据分数求具体数量",
    ],
  },
  {
    id: "prob-bayes",
    openstax: {
      module: "m49450",
      title: "Probability",
      sections: [
        "Constructing Probability Models",
        "Computing Probabilities of Equally Likely Outcomes",
        "Computing the Probability of the Union of Two Events",
        "Using the Complement Rule to Compute Probabilities",
      ],
    },
    openstaxSupport: [
      {
        repo: "openstax/osbooks-statistics",
        module: "m79611",
        title: "Terminology",
        sections: ["Terminology"],
      },
      {
        repo: "openstax/osbooks-statistics",
        module: "m79614",
        title: "Two Basic Rules of Probability",
        sections: ["The Addition Rule"],
      },
      {
        repo: "openstax/osbooks-statistics",
        module: "m79616",
        title: "Contingency Tables",
        sections: ["Try it"],
      },
      {
        repo: "openstax/osbooks-statistics",
        module: "m79617",
        title: "Tree and Venn Diagrams",
        sections: ["Tree Diagrams", "Venn Diagram"],
      },
    ],
    khan: [
      "probability_1",
      "independent_probability",
      "dependent_probability",
      "dice_probability",
    ],
    cnKeywords: [
      "概率",
      "事件概率",
      "列举法求概率",
      "等可能情形下的概率计算",
      "小概率事件",
      "随机事件",
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────
 * 网络工具（带磁盘缓存）
 * ────────────────────────────────────────────────────────────────── */

const UA =
  "OE-FlagshipFetcher/1.0 (+https://github.com/3982241557-art/open-education-learning-platform)";

/** 缓存文件名（把 URL 变成安全文件名）。 */
function cacheKey(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 180);
}

/**
 * 取一个远程文件，失败时回退到磁盘缓存。
 *
 * 缓存让脚本可以**离线重跑**——已经拉过的源不必再打网络。
 */
async function fetchText(url, { offline = false } = {}) {
  const cached = path.join(CACHE_DIR, cacheKey(url));

  if (offline && fs.existsSync(cached)) {
    return fs.readFileSync(cached, "utf8");
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cached, text);
    return text;
  } catch (err) {
    if (fs.existsSync(cached)) {
      console.warn(`  ⚠️  ${url} 拉取失败（${err.message}），改用缓存`);
      return fs.readFileSync(cached, "utf8");
    }
    throw new Error(`拉取失败且无缓存：${url}（${err.message}）`);
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 解析：Khan HTML → 题目 + 逐级提示
 * ────────────────────────────────────────────────────────────────── */

/**
 * 按 class 提取**配对**的 div 块内容。
 *
 * Khan 的 HTML 里 ``<div class="problem">`` / ``<div class="hints">``
 * 经常**嵌套**别的元素。非贪婪正则会在内层标签处提前截断——症状
 * 是抓出来的「题干」里混进了半个图形脚本。
 */
function extractBlocksByClass(html, className) {
  const blocks = [];
  const re = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "g");
  let m;

  while ((m = re.exec(html)) !== null) {
    const start = m.index;
    const contentStart = m.index + m[0].length;

    let depth = 1;
    let i = contentStart;
    let end = -1;

    while (i < html.length) {
      const open = html.indexOf("<div", i);
      const close = html.indexOf("</div>", i);

      if (close === -1) {
        end = html.length;
        break;
      }
      if (open !== -1 && open < close) {
        depth += 1;
        i = open + 4;
        continue;
      }
      depth -= 1;
      i = close + 6;
      if (depth === 0) {
        end = i;
        break;
      }
    }

    const inner = html.slice(contentStart, end === -1 ? html.length : end - 6);
    blocks.push(inner);

    re.lastIndex = end === -1 ? html.length : end;
  }

  return blocks;
}

/**
 * 删掉所有 ``<div class="graphie">…</div>`` 块（Khan 的绘图脚本）。
 *
 * ⛔ **不能用非贪婪正则**——Graphie 块里嵌套着别的 ``<div>``，
 *    非贪婪会在第一个 ``</div>`` 处停下，把外层 JavaScript 留下来。
 */
function stripGraphieBlocks(html) {
  let out = html;
  let guard = 0;

  for (;;) {
    if (guard > 200) break;
    guard += 1;

    const start = out.search(/<div[^>]*class="[^"]*graphie[^"]*"[^>]*>/);
    if (start === -1) break;

    let depth = 0;
    let i = start;
    let end = -1;

    while (i < out.length) {
      const open = out.indexOf("<div", i);
      const close = out.indexOf("</div>", i);

      if (close === -1) {
        end = out.length;
        break;
      }
      if (open !== -1 && open < close) {
        depth += 1;
        i = open + 4;
        continue;
      }
      depth -= 1;
      i = close + 6;
      if (depth === 0) {
        end = i;
        break;
      }
    }

    if (end === -1) end = out.length;
    out = `${out.slice(0, start)} ${out.slice(end)}`;
  }

  return out;
}

/**
 * 判断一段 ``<var>`` 内容是不是 Khan 的**模板变量**。
 *
 * Khan 的 ``<var>`` 有两种：
 *
 * - 图形化变量（``MEASURE``、``BASE``）——是**给人看的**占位；
 * - 模板变量（``GIVEN_TEX[0]``、``R_TEX``、``ordinalThrough20(N + 1)``、
 *   ``fractionSimplification(NUMBER, TOTAL)``）——是**给运行时看的**，
 *   只在 Khan 的引擎里才有值。
 *
 * 第二类留着就是天书。判定：含有**下划线**或**函数调用括号**，
 * 或整体是大写标识符形态 → 判定为模板变量。
 */
function isTemplateVar(content) {
  const s = content.trim();
  if (!s) return true;
  /* 含下划线 —— Khan 模板变量的典型特征（GIVEN_TEX / R_TEX / N_TEX） */
  if (s.includes("_")) return true;
  /* 含函数调用形态 —— ordinalThrough20(...) / fractionSimplification(...) */
  if (/^[A-Za-z][A-Za-z0-9]*\s*\(/.test(s)) return true;
  /* 纯大写标识符 —— BASE / EXP / N */
  if (/^[A-Z][A-Z0-9]*$/.test(s)) return true;
  /* 裸的模板槽 —— {?} / {N} */
  if (/^[?N]$/.test(s)) return true;
  return false;
}

/**
 * 去掉 HTML 标签，保留可读文本。
 *
 * ⛔ **必须滤掉 Khan 的模板占位符**。Khan 的题目模板里有一堆
 *    ``{\Large{{negParens( BASE )}^{{EXP}} = {?}}}`` 这种
 *    LaTeX 宏调用占位符——它们只在 Khan 的运行时才有值。留在页面上
 *    的话，学生看到的就是一串天书。
 *
 * 模板变量（``<var>GIVEN_TEX[0]</var>`` 之类）替换成 ``▢``——
 * 一个「待填的槽」。这是诚实的：那个值本来就要学生自己算。
 */
function stripHtml(raw) {
  const html = stripGraphieBlocks(raw);

  /* 先处理 ``<var>``：区分「图形变量」与「模板变量」 */
  let out = html.replace(
    /<var[^>]*>([\s\S]*?)<\/var>/g,
    (_m, content) => {
      const text = content.replace(/<[^>]+>/g, "").trim();
      return isTemplateVar(text) ? "▢" : `{${text}}`;
    },
  );

  /* ``<code>`` 里常常只有模板变量 —— 整块删掉 */
  out = out.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, (_m, content) => {
    const text = content.replace(/<[^>]+>/g, "").trim();
    if (!text) return " ";
    /* 全是槽位 → 整块删 */
    if (/^[\s▢]*$/.test(text)) return " ";
    return text;
  });

  return out
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 判断一段文本里是否含有 Khan 的模板占位符。
 *
 * 占位符的特征：花括号里**只含**大写字母、数字、下划线、括号、
 * 运算符与空格，**且不含小写字母**与中日韩字符。
 */
function hasTemplatePlaceholder(text) {
  return /\{[^}]*[A-Z][^}]*\}/.test(text) && !/[a-z一-鿿]/.test(
    (text.match(/\{[^}]*\}/g) ?? []).join(""),
  );
}

/**
 * 删掉 Khan 的 LaTeX 模板宏占位符片段。
 *
 * ``{\Large{{negParens( BASE )}^{{EXP}} = {?}}}`` 这种是**嵌套**的，
 * 所以用「配对花括号」的方式删，而不是正则一次。
 *
 * ⛔ **只删已知的 LaTeX 宏**，不删任意花括号块。
 *
 *    因为 OpenStax 的数学正文里**真的**有花括号——集合记号
 *    ``{H, T}``、区间记号 ``{1, 2, 3}``。如果按「看起来像占位符」
 *    就删，赌具的样本空间会被删成空。
 *
 *    真正的判据是**宏命令名**——``\Large``、``\displaystyle``、
 *    ``\frac`` 这些是排版指令，绝不会出现在数学陈述里。
 */
const LATEX_MACROS = new Set([
  "Large",
  "large",
  "displaystyle",
  "textstyle",
  "scriptstyle",
  "frac",
  "dfrac",
  "tfrac",
  "sqrt",
  "text",
  "textbf",
  "textit",
  "mathrm",
  "mathbf",
  "mathbb",
  "mathcal",
  "operatorname",
  "cdot",
  "ldots",
  "dots",
  "infty",
  "partial",
  "qquad",
  "quad",
  "left",
  "right",
  "binom",
  "choose",
  "times",
  "div",
  "pm",
  "mp",
  "leq",
  "geq",
  "neq",
  "approx",
  "equiv",
  "sim",
  "propto",
  "rightarrow",
  "Rightarrow",
  "leftarrow",
  "leftrightarrow",
]);

/**
 * 删掉 ``\macro{...}`` 形态的 LaTeX 排版指令（连同它的参数）。
 */
function stripLatexMacros(text) {
  let out = text;
  let guard = 0;

  for (;;) {
    if (guard > 80) break;
    guard += 1;

    /* 找下一个**已知**的排版宏 */
    let found = -1;
    let foundLen = 0;
    const re = /\\([A-Za-z]+)\{/g;
    let m;
    while ((m = re.exec(out)) !== null) {
      if (LATEX_MACROS.has(m[1])) {
        found = m.index;
        foundLen = m[0].length;
        break;
      }
    }
    if (found === -1) break;

    /* 找配对的右花括号 */
    const braceStart = found + foundLen - 1;
    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < out.length; i += 1) {
      if (out[i] === "{") depth += 1;
      else if (out[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;

    out = `${out.slice(0, found)} ${out.slice(end + 1)}`;
  }

  return out.replace(/\s+/g, " ").trim();
}

/**
 * 删掉 Khan 的 LaTeX 模板宏占位符片段。
 *
 * ``{\Large{{negParens( BASE )}^{{EXP}} = {?}}}`` 这种是**嵌套**的，
 * 所以用「配对花括号」的方式删，而不是正则一次。
 */
function stripTemplatePlaceholders(text) {
  let out = stripLatexMacros(text);
  let guard = 0;

  for (;;) {
    if (guard > 60) break;
    guard += 1;

    const start = out.search(/\{[A-Za-z\\?]/);
    if (start === -1) break;

    /* 找配对的右花括号 */
    let depth = 0;
    let end = -1;
    for (let i = start; i < out.length; i += 1) {
      if (out[i] === "{") depth += 1;
      else if (out[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;

    const chunk = out.slice(start, end + 1);
    const inner = chunk.slice(1, -1);
    /* 只有「不含小写字母与中文」的花括号块才判定为模板占位符 */
    if (!/[a-z一-鿿]/.test(inner)) {
      out = `${out.slice(0, start)} ${out.slice(end + 1)}`;
    } else {
      break;
    }
  }

  return out.replace(/\s+/g, " ").trim();
}

/** 解析一个 Khan 练习文件。 */
function parseKhanExercise(html, file) {
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : file;

  const questions = [];

  /* 新式练习：题干在 ``<div class="problem">`` 里 */
  const problemTexts = [];
  for (const block of extractBlocksByClass(html, "problem")) {
    const text = stripTemplatePlaceholders(stripHtml(block));
    if (text && !hasTemplatePlaceholder(text)) problemTexts.push(text);
  }

  /* 老式练习：题干在 ``<p class="question">`` 里 */
  const questionTexts = [];
  for (const m of html.matchAll(/<p class="question"[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = stripTemplatePlaceholders(stripHtml(m[1]));
    if (text && !hasTemplatePlaceholder(text)) questionTexts.push(text);
  }
  for (const block of extractBlocksByClass(html, "question")) {
    const text = stripTemplatePlaceholders(stripHtml(block));
    if (text && !hasTemplatePlaceholder(text)) questionTexts.push(text);
  }

  const seen = new Set();
  for (const t of [...problemTexts, ...questionTexts]) {
    if (seen.has(t)) continue;
    seen.add(t);
    questions.push(t);
  }

  /* 提示：**只从** ``<div class="hints">`` **块里取**。
   *
   * Khan 的 hints 本身就是一级一级递进的——这是它最核心的教学设计，
   * 必须整份按顺序保留，不能去重也不能截断成一条。
   */
  const hints = [];
  for (const block of extractBlocksByClass(html, "hints")) {
    for (const p of block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      const text = stripTemplatePlaceholders(stripHtml(p[1]));
      if (text && text.length > 4 && !hasTemplatePlaceholder(text)) {
        hints.push(text);
      }
    }
  }

  return { title, questions, hints };
}

/* ──────────────────────────────────────────────────────────────────
 * 解析：OpenStax CNXML → 概念定义 + 例题
 * ────────────────────────────────────────────────────────────────── */

/**
 * 把 CNXML 的 MathML 转成**可读的纯文本**。
 *
 * CNXML 里数学公式是 MathML（``<m:mtext>180°</m:mtext>``）。把
 * ``<m:mtext>`` / ``<m:mo>`` / ``<m:mi>`` / ``<m:mn>`` 的内容提出来
 * 拼起来——这样公式在页面上是**能读的**，而不是一堆 XML 标签。
 */
function cnxmlToText(xml) {
  return xml
    .replace(/<m:mtext[^>]*>([\s\S]*?)<\/m:mtext>/g, "$1")
    .replace(/<m:mo[^>]*>([\s\S]*?)<\/m:mo>/g, "$1")
    .replace(/<m:mi[^>]*>([\s\S]*?)<\/m:mi>/g, "$1")
    .replace(/<m:mn[^>]*>([\s\S]*?)<\/m:mn>/g, "$1")
    .replace(/<\/?m:[^>]+>/g, "")
    .replace(/<note[^>]*>/g, " ")
    .replace(/<\/note>/g, " ")
    .replace(/<para[^>]*>/g, " ")
    .replace(/<\/para>/g, " ")
    .replace(/<title[^>]*>/g, " ")
    .replace(/<\/title>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2013;/g, "–")
    .replace(/&#x2014;/g, "—")
    .replace(/&#x00B0;/g, "°")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 提取**配对**的 XML 块。
 *
 * ⛔ **不能用非贪婪正则**。CNXML 里 ``<note>`` 块**嵌套**着
 *    ``<exercise>`` / ``<problem>`` / ``<para>``，而 ``<note>`` 本身
 *    还可能嵌套 ``<note>``（「Try It」框里又有概念框）。
 *
 *    非贪婪正则会在**第一个** ``</note>`` 处停下——而那往往只是内层
 *    某个子块的结尾。症状是抓出来的「概念」正文里混进了半个
 *    ``<problem>`` 标签，甚至被截成半句话。
 *
 * 所以这里**数标签的开合**，只返回真正配对的那个块。
 *
 * @param {string} tag 标签名
 * @param {string} src 源 XML
 * @returns {string[]} 各块的内部 XML
 */
function extractPairedBlocks(tag, src) {
  const blocks = [];
  const openRe = new RegExp(`<${tag}\\b`, "g");
  const closeTag = `</${tag}>`;

  let m;
  while ((m = openRe.exec(src)) !== null) {
    const contentStart = m.index + m[0].length;

    let depth = 1;
    let i = contentStart;
    let end = -1;

    while (i < src.length) {
      const openIdx = src.indexOf(`<${tag}`, i);
      const closeIdx = src.indexOf(closeTag, i);

      if (closeIdx === -1) {
        end = src.length;
        break;
      }
      if (openIdx !== -1 && openIdx < closeIdx) {
        depth += 1;
        i = openIdx + tag.length + 1;
        continue;
      }
      depth -= 1;
      i = closeIdx + closeTag.length;
      if (depth === 0) {
        end = i;
        break;
      }
    }

    const inner = src.slice(contentStart, end === -1 ? src.length : end - closeTag.length);
    blocks.push(inner);

    openRe.lastIndex = end === -1 ? src.length : end;
  }

  return blocks;
}

/**
 * 从 OpenStax CNXML 里抽出**概念定义**与**例题**。
 *
 * - ``<note>`` 块 = OpenStax 的**核心概念框**（Theorem / Definition）；
 * - ``<example>`` 块 = **带解答的例题**；
 * - ``<section>`` 的 ``<title>`` = 章节名。
 *
 * ⛔ **章节归属必须准确**。CNXML 里所有 section 是**平铺**在同一层的，
 *    先后顺序有意义。把「几何级数」的概念配到「概率」那一课，就是
 *    **张冠李戴**——比编造更糟，因为它看起来像是真的。所以这里按
 *    ``<section>`` 边界切片，每个概念都记住自己属于哪个 section。
 *
 * ⛔ **概念框必须去掉教学脚手架**。OpenStax 的 ``<note>`` 里塞满了
 *    「Try It」「Q&A」「Media」「How To」这类教学装置——它们不是
 *    概念定义。把它们当概念卡展示，等于给用户看教材的排版噪音。
 *    所以只保留**真正的定义型**概念框：有标题的，且标题不是
 *    教学装置名。
 */
function parseOpenStaxModule(xml) {
  const concepts = [];
  const examples = [];

  /** 教学装置的标题——这些不是概念定义，要排除。 */
  const SCAFFOLD_TITLES = new Set([
    "try it",
    "try",
    "q&a",
    "q & a",
    "media",
    "how to",
    "how-to",
    "reading",
    "check your understanding",
    "solution",
    "homework",
    "practice",
    "objective",
    "learning objectives",
    "key equations",
    "key concepts",
    "vocabulary",
    "section exercises",
    "teaching tip",
    "answer",
    "notes",
  ]);

  const sections = extractPairedBlocks("section", xml);

  for (const sectionInner of sections) {
    const titleMatch = sectionInner.match(/<title>([\s\S]*?)<\/title>/);
    const sectionTitle = titleMatch ? cnxmlToText(titleMatch[1]) : "";

    /* 概念框：``<note id="..."><title>名字</title><para>定义正文</para>`` */
    for (const noteInner of extractPairedBlocks("note", sectionInner)) {
      const noteTitleMatch = noteInner.match(/<title>([\s\S]*?)<\/title>/);
      const heading = noteTitleMatch ? cnxmlToText(noteTitleMatch[1]) : "";

      /* 去掉标题后的正文 */
      const bodyRaw = noteTitleMatch
        ? noteInner.slice(
            (noteTitleMatch.index ?? 0) + noteTitleMatch[0].length,
          )
        : noteInner;
      const body = cnxmlToText(bodyRaw);

      if (!heading || heading.length < 6) continue;
      if (SCAFFOLD_TITLES.has(heading.trim().toLowerCase())) continue;
      if (!body || body.length < 25) continue;

      concepts.push({ heading, body, section: sectionTitle });
    }

    /* 例题：``<example ...><exercise><problem><para>题干</para>`` */
    for (const exampleInner of extractPairedBlocks("example", sectionInner)) {
      const problemMatch = exampleInner.match(
        /<problem[^>]*>([\s\S]*?)<\/problem>/,
      );
      if (!problemMatch) continue;
      const question = cnxmlToText(problemMatch[1]);
      if (!question || question.length < 10) continue;

      /* 模板占位符过滤——OpenStax 的 MathML 里也有 ``{\Large ...}``。 */
      const cleanQuestion = stripTemplatePlaceholders(question);
      if (!cleanQuestion || cleanQuestion.length < 10) continue;

      const solMatch = exampleInner.match(
        /<solution[^>]*>([\s\S]*?)<\/solution>/,
      );
      const solution = solMatch ? cnxmlToText(solMatch[1]) : "";

      examples.push({
        question: cleanQuestion,
        solution:
          solution.length > 400 ? `${solution.slice(0, 400)}…` : solution,
        section: sectionTitle,
      });
    }
  }

  return { concepts, examples };
}

/* ──────────────────────────────────────────────────────────────────
 * 解析：cn-k12 中文图谱 → 中文知识点
 * ────────────────────────────────────────────────────────────────── */

/**
 * 从中文 K12 图谱里取**与本专题相关的真实知识点**。
 *
 * 这些是**人教版**教材里真实存在的章节名与知识点名——用来做中文
 * 表述的**骨架**，而不是编造。
 *
 * ⛔ **必须精确匹配，不能拿宽泛的词凑数**。
 *
 * 例如关键词只写「概率」，那么「几何概率」「小概率事件」全都会
 * 命中——最后「条件概率」那一课讲出来却是「几何概率」。这不是
 * 翻译问题，是**内容张冠李戴**。
 *
 * 所以这里用**两级匹配**：
 *
 * 1. **精确** —— 知识点名**完全等于**某个关键词；
 * 2. **包含** —— 关键词长度 ≥ 3 且知识点名包含它。
 *
 * 短的关键词（「指数」「概率」）只允许精确匹配，避免误伤。
 */
function extractCnTopics(graph, keywords, limit = 4) {
  const topics = graph?.nodes?.topics ?? [];
  const chapters = graph?.nodes?.chapters ?? [];

  const scored = [];
  for (const t of topics) {
    const name = t.name || "";
    let score = -1;

    for (const k of keywords) {
      if (name === k) {
        score = Math.max(score, 100);
      } else if (k.length >= 3 && name.includes(k)) {
        score = Math.max(score, 60);
      }
    }
    if (score < 0) continue;

    const ch = chapters.find((c) => c.id === t.chapterId);
    scored.push({ name, chapter: ch ? ch.name : "", score });
  }

  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);

  const seen = new Set();
  const out = [];
  for (const item of scored) {
    const key = `${item.name}|${item.chapter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * 繁简转换（复用站点已有的 OpenCC 转换表）
 * ────────────────────────────────────────────────────────────────── */

let s2tTable = null;

/** 载入 ``web/public/data/s2t-chars.json``（由 build-s2t-table.mjs 生成）。 */
function loadS2tTable() {
  if (s2tTable) return s2tTable;
  const file = path.join(ROOT, "web", "public", "data", "s2t-chars.json");
  if (!fs.existsSync(file)) return null;
  s2tTable = JSON.parse(fs.readFileSync(file, "utf8"));
  return s2tTable;
}

/** 简体 → 繁体（字符级，真实 OpenCC 规则）。 */
function toTraditional(text) {
  const table = loadS2tTable();
  if (!table) return text;
  let out = "";
  for (const ch of text) out += table[ch] ?? ch;
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * 主流程
 * ────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const offline = args.includes("--offline");

  console.log("┌─────────────────────────────────────────────┐");
  console.log("│  OE · 标杆专题内容采集器                    │");
  console.log("└─────────────────────────────────────────────┘");

  if (checkOnly) {
    if (!fs.existsSync(OUT_FILE)) {
      console.error("❌ flagship-topics.json 不存在");
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    console.log(`✅ 已存在：${data.topics.length} 个专题`);
    for (const t of data.topics) {
      console.log(
        `   ${t.id} · ${t.title.en} · ${t.sources.length} 个来源 · ` +
          `${t.quiz.length} 道思维题`,
      );
    }
    return;
  }

  /* ── 拉取 cn-k12 中文数学知识图谱 ── */
  console.log("\n[1/3] 拉取 cn-k12 中文数学知识图谱…");
  const cnRaw = await fetchText(`${CNK12.rawBase}/graph.json`, { offline });
  const cnGraph = JSON.parse(cnRaw);
  console.log(
    `   ✅ ${CNK12.repo} · ${cnGraph.nodes.topics.length} 个中文知识点`,
  );

  /* ── 逐专题拉取 OpenStax + Khan ── */
  console.log("\n[2/3] 拉取 OpenStax 教材与 Khan 练习…");
  const built = [];
  const provenance = [];

  for (const spec of TOPIC_SOURCES) {
    process.stdout.write(`   · ${spec.id} `);

    /* ── OpenStax 主模块 ── */
    const mainRepo = spec.openstax.repo ? OPENSTAX_STATS : OPENSTAX;
    const mainRepoName = spec.openstax.repo ?? OPENSTAX.repo;
    const osUrl = `${mainRepo.rawBase}/${spec.openstax.module}/index.cnxml`;
    const osXml = await fetchText(osUrl, { offline });
    const osParsed = parseOpenStaxModule(osXml);

    /* ── OpenStax 支撑模块（同一专题的相邻章节） ── */
    const supportSources = [];
    const supportConcepts = [];
    for (const sup of spec.openstaxSupport ?? []) {
      const supRepo = sup.repo ? OPENSTAX_STATS : OPENSTAX;
      const supRepoName = sup.repo ?? OPENSTAX.repo;
      const supUrl = `${supRepo.rawBase}/${sup.module}/index.cnxml`;
      const supXml = await fetchText(supUrl, { offline });
      const supParsed = parseOpenStaxModule(supXml);
      const wanted = new Set(sup.sections ?? []);
      const scoped = supParsed.concepts.filter((c) => wanted.has(c.section));
      supportConcepts.push(...scoped);
      if (scoped.length > 0) {
        supportSources.push({
          repo: supRepoName,
          path: `modules/${sup.module}/index.cnxml`,
          url: supUrl,
          license: supRepo.license,
          licenseUrl: supRepo.licenseUrl,
          title: sup.title,
          sections: sup.sections ?? [],
          concepts: scoped.length,
        });
      }
    }

    /* ── Khan 练习 ── */
    const khanFiles = [];
    for (const file of spec.khan) {
      const url = `${KHAN.rawBase}/${file}.html`;
      const html = await fetchText(url, { offline });
      const parsed = parseKhanExercise(html, file);
      khanFiles.push({ file, url, ...parsed });
    }

    /* ── 中文知识点 ── */
    const cnTopics = extractCnTopics(cnGraph, spec.cnKeywords);

    /* ── 组装三语文本 ── */

    /* 英文概念：OpenStax 的概念框原文 —— **按 section 精确挑选** */
    const wantedMain = new Set(spec.openstax.sections);
    const scopedMain = osParsed.concepts.filter((c) => wantedMain.has(c.section));

    const allConcepts = [...scopedMain, ...supportConcepts];
    const enConcepts = allConcepts
      .slice(0, 3)
      .map((c) => `${c.heading}: ${c.body}`);

    /* 英文例题：主模块里**全部**的例题（它们都带 section 标注） */
    const scopedExamples = osParsed.examples.filter((e) =>
      wantedMain.has(e.section),
    );
    const enExamples = (
      scopedExamples.length ? scopedExamples : osParsed.examples
    ).slice(0, 4);

    /* 英文提示：Khan 的 hints 原文（逐级保留） */
    const enHints = khanFiles.flatMap((k) => k.hints).slice(0, 5);

    /* 英文巩固题：Khan 的 question 原文 —— 过滤掉「纯模板槽」的题 */
    const enTrials = khanFiles
      .flatMap((k) =>
        k.questions.map((q) => ({ q, from: k.file, title: k.title })),
      )
      .filter((t) => t.q.length >= 40)
      .slice(0, 3);

    /* 中文概念：基于真实教材知识点 */
    const zhConcepts = cnTopics.map((t) => `${t.name}（${t.chapter}）`);

    const zhTasks = cnTopics.map(
      (t) => `在《${t.chapter}》中完成「${t.name}」的探究与验证`,
    );

    const zhHints = cnTopics.map(
      (t) => `想一想：${t.name}在《${t.chapter}》里是怎么定义的？依据是什么？`,
    );

    const zhTrials = cnTopics.slice(0, 3).map(
      (t) => `在《${t.chapter}》中，${t.name}的判定条件是什么？举一个具体例子。`,
    );

    /* ── 思维测评题：3 道「直觉 vs 数学」情境思考题 ──
     *
     * ⛔ **题目文本直接取自 OpenStax 的例题题干与 Khan 的题干**——
     *    不做改写、不做编造。
     *
     * ⛔ **必须过滤掉「纯模板槽」的题目**。Khan 的某些练习
     *    （``exponents_1`` 等）题干就是一句 ``\Large{negParens( BASE )^{EXP} = {?}}``，
     *    剥掉模板后只剩「Rewrite in the form .」——**没有数学内容**。
     *
     *    判定标准：剥完之后必须还剩下**足够长**的自然语言或数学
     *    记号（≥ 40 字符），否则这道题不配出现在测评里。
     */
    const isRealQuestion = (t) => t.length >= 40 && !/^Rewrite in the form\s*\.?$/i.test(t);

    const quizEn = [];
    const used = new Set();
    for (const e of enExamples) {
      if (quizEn.length >= 3) break;
      if (used.has(e.question)) continue;
      if (!isRealQuestion(e.question)) continue;
      used.add(e.question);
      quizEn.push({
        stem: e.question,
        source: "openstax",
        answer: e.solution,
      });
    }
    for (const t of enTrials) {
      if (quizEn.length >= 3) break;
      if (used.has(t.q)) continue;
      if (!isRealQuestion(t.q)) continue;
      used.add(t.q);
      quizEn.push({ stem: t.q, source: "khan", answer: "" });
    }

    /* 中文侧：cn-k12 的真实知识点（每个专题至少有 3 个） */
    const quizZh = cnTopics.slice(0, 3).map((t) => ({
      stem: `在《${t.chapter}》的真实情境中，「${t.name}」是如何被定义与判定的？请给出你的推理依据。`,
      source: "cn-k12",
      answer: `教材章节：${t.chapter}；知识点：${t.name}。`,
    }));

    built.push({
      id: spec.id,
      sources: {
        openstax: {
          repo: mainRepoName,
          path: `modules/${spec.openstax.module}/index.cnxml`,
          url: osUrl,
          license: mainRepo.license,
          licenseUrl: mainRepo.licenseUrl,
          title: spec.openstax.title,
          sections: spec.openstax.sections,
        },
        openstaxSupport: supportSources,
        khan: khanFiles.map((k) => ({
          repo: KHAN.repo,
          path: `exercises/${k.file}.html`,
          url: k.url,
          license: KHAN.license,
          licenseUrl: KHAN.licenseUrl,
          title: k.title,
        })),
        cn: {
          repo: CNK12.repo,
          path: "data/graph.json",
          url: `${CNK12.rawBase}/graph.json`,
          license: CNK12.license,
          licenseUrl: CNK12.licenseUrl,
          topics: cnTopics.map((t) => ({ name: t.name, chapter: t.chapter })),
        },
      },
      concept: {
        zhCN: zhConcepts,
        zhTW: zhConcepts.map(toTraditional),
        en: enConcepts,
      },
      task: {
        zhCN: zhTasks,
        zhTW: zhTasks.map(toTraditional),
        en: enExamples.map((e) => e.question),
      },
      hints: {
        zhCN: zhHints,
        zhTW: zhHints.map(toTraditional),
        en: enHints,
      },
      trials: {
        zhCN: zhTrials,
        zhTW: zhTrials.map(toTraditional),
        en: enTrials.map((t) => t.q),
      },
      quiz: {
        zhCN: quizZh,
        zhTW: quizZh.map((q) => ({
          ...q,
          stem: toTraditional(q.stem),
          answer: toTraditional(q.answer),
        })),
        en: quizEn,
      },
      raw: {
        khanHints: khanFiles.flatMap((k) => k.hints),
        openstaxConcepts: allConcepts.slice(0, 8),
        openstaxExamples: enExamples,
      },
    });

    /* ── 来源记录 ── */
    provenance.push({
      topicId: spec.id,
      kind: "textbook",
      repo: mainRepoName,
      path: `modules/${spec.openstax.module}/index.cnxml`,
      url: osUrl,
      license: mainRepo.license,
      licenseUrl: mainRepo.licenseUrl,
      sections: spec.openstax.sections,
      concepts: scopedMain.length,
      examples: osParsed.examples.length,
    });
    for (const sup of supportSources) {
      provenance.push({
        topicId: spec.id,
        kind: "textbook",
        repo: sup.repo,
        path: sup.path,
        url: sup.url,
        license: sup.license,
        licenseUrl: sup.licenseUrl,
        sections: sup.sections,
        concepts: sup.concepts,
      });
    }
    for (const k of khanFiles) {
      provenance.push({
        topicId: spec.id,
        kind: "exercise",
        repo: KHAN.repo,
        path: `exercises/${k.file}.html`,
        url: k.url,
        license: KHAN.license,
        licenseUrl: KHAN.licenseUrl,
        title: k.title,
        questions: k.questions.length,
        hints: k.hints.length,
      });
    }
    provenance.push({
      topicId: spec.id,
      kind: "knowledge-graph",
      repo: CNK12.repo,
      path: "data/graph.json",
      url: `${CNK12.rawBase}/graph.json`,
      license: CNK12.license,
      licenseUrl: CNK12.licenseUrl,
      topics: cnTopics.length,
    });

    console.log(
      `OpenStax ${allConcepts.length} 概念 / ${enExamples.length} 例题 · ` +
        `Khan ${khanFiles.length} 题 · 中文 ${cnTopics.length} 点`,
    );
  }

  /* ── 写入数据文件 ── */
  console.log("\n[3/3] 写入数据文件…");

  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generator: "scripts/fetch-open-flagship.mjs",
    licenses: [
      {
        repo: OPENSTAX.repo,
        license: OPENSTAX.license,
        licenseUrl: OPENSTAX.licenseUrl,
      },
      {
        repo: OPENSTAX_STATS.repo,
        license: OPENSTAX_STATS.license,
        licenseUrl: OPENSTAX_STATS.licenseUrl,
      },
      {
        repo: KHAN.repo,
        license: KHAN.license,
        licenseUrl: KHAN.licenseUrl,
        note: "练习框架为 MIT；练习内容为 CC BY-NC-SA 3.0。",
      },
      {
        repo: CNK12.repo,
        license: CNK12.license,
        licenseUrl: CNK12.licenseUrl,
      },
    ],
    sourceProvenance: provenance,
    topics: built,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`);

  const size = fs.statSync(OUT_FILE).size;
  console.log(`\n✅ 已写入 ${path.relative(ROOT, OUT_FILE)}`);
  console.log(
    `   ${built.length} 个专题 · ${provenance.length} 条来源记录 · ${(size / 1024).toFixed(1)} KB`,
  );
  for (const t of built) {
    console.log(
      `   ${t.id} · 概念 ${t.concept.en.length} · 提示 ${t.hints.en.length} · ` +
        `巩固题 ${t.trials.en.length} · 思维题 ${t.quiz.en.length}`,
    );
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
