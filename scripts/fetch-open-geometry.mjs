#!/usr/bin/env node
/**
 * 开源几何链内容采集器
 * =====================
 *
 * 为「空间、角度与几何探究」这条标杆链，从**真实的 GitHub 开源仓库**
 * 拉取原始教学内容，生成带来源记录的三语文本数据文件。
 *
 * ⛔ **绝不 AI 编造**
 * ---------------
 *
 * 本脚本只做三件事：**下载 → 解析 → 重组**。它自己**不产生**任何
 * 教学内容。每一个概念定义、每一条定理、每一道例题、每一句启发
 * 提示，都**逐字**来自下列开源仓库：
 *
 * | 仓库 | 内容 | 协议 |
 * |---|---|---|
 * | ``Khan/khan-exercises`` | 练习题模板 + 逐级启发提示 | CC BY-NC-SA 3.0（练习）/ MIT（框架） |
 * | ``openstax/osbooks-prealgebra-bundle`` | 严谨的概念定义、定理、例题 | CC BY-NC-SA 4.0 |
 * | ``haojing8312/cn-k12-math-knowledge-graph`` | 中文教材知识点体系（章节归属） | CC BY-NC-SA 4.0 |
 *
 * 每个课时的每一段文本都带 ``source_provenance``——记录仓库名、
 * 原始文件路径、开源协议。数据文件里能**逐条追溯**到源头。
 *
 * 三语策略
 * --------
 *
 * - ``zh-CN`` —— 来自 cn-k12 中文教材图谱的知识点名 + 中文表述；
 * - ``zh-TW`` —— 简体中文经**字符级** OpenCC ``s2t`` 规则转换
 *   （真实转换表由 ``scripts/build-s2t-table.mjs`` 生成）；
 * - ``en`` —— 来自 OpenStax / Khan 的**英文原文**。
 *
 * ⛔ 三种语言**各自独立成列**，界面渲染时只取当前语言的那一列，
 *    绝不把中英文堆在屏幕上。
 *
 * 用法
 * ----
 *
 * ```bash
 * node scripts/fetch-open-geometry.mjs            # 拉取并生成
 * node scripts/fetch-open-geometry.mjs --check    # 只校验现有文件
 * node scripts/fetch-open-geometry.mjs --offline  # 用本地缓存
 * ```
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "web", "public", "data", "geometry-chain.json");
const CACHE_DIR = path.join(ROOT, ".geometry-cache");

/* ──────────────────────────────────────────────────────────────────
 * 拉取源配置
 * ────────────────────────────────────────────────────────────────── */

/** Khan Academy 开源练习库。 */
const KHAN = {
  repo: "Khan/khan-exercises",
  license: "CC BY-NC-SA 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
  rawBase:
    "https://raw.githubusercontent.com/Khan/khan-exercises/master/exercises",
};

/** OpenStax 开源数学教材。 */
const OPENSTAX = {
  repo: "openstax/osbooks-prealgebra-bundle",
  license: "CC BY-NC-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  rawBase:
    "https://raw.githubusercontent.com/openstax/osbooks-prealgebra-bundle/main/modules",
};

/** 中文 K12 数学知识图谱（中文教材章节体系）。 */
const CNK12 = {
  repo: "haojing8312/cn-k12-math-knowledge-graph",
  license: "CC BY-NC-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  rawBase:
    "https://raw.githubusercontent.com/haojing8312/cn-k12-math-knowledge-graph/main/data",
};

/* ──────────────────────────────────────────────────────────────────
 * 8 节课的源文件映射
 *
 * 每节课的 ``khan`` 列出该主题在 Khan 开源练习库里的真实练习文件；
 * ``openstax`` 列出 OpenStax 里对应的 CNXML 模块与要抽取的章节名。
 *
 * ⛔ **章节必须精确**。OpenStax 的 CNXML 里所有 section 平铺在一层，
 *    概念框（``<note>``）会带上自己所属的 section 名。这里用
 *    section 名做**精确匹配**来挑概念——挑错了就是张冠李戴。
 *
 * ``cnKeywords`` 用于在中文 K12 图谱里定位知识点：短词只允许
 * **完全相等**，长词允许**包含**。
 * ────────────────────────────────────────────────────────────────── */

const LESSON_SOURCES = [
  {
    id: "geo-01",
    khan: ["measuring_angles", "angle_types", "angles_1", "angles_2"],
    openstax: {
      module: "m81326",
      sections: ["Use the Properties of Angles", "Supplementary and Complementary Angles"],
    },
    cnKeywords: ["角", "角的顶点", "角的边", "锐角", "钝角", "直角"],
    stage: 1,
  },
  {
    id: "geo-02",
    khan: [
      "parallel_lines_1",
      "parallel_lines_2",
      "vertical_angles",
      "complementary_and_supplementary_angles",
      "angle_addition_postulate",
    ],
    openstax: {
      module: "m81326",
      sections: ["Use the Properties of Angles"],
    },
    cnKeywords: ["平行线", "相交线", "垂线", "对顶角", "同位角", "内错角"],
    stage: 1,
  },
  {
    id: "geo-03",
    khan: ["triangle_angles_1", "triangle_types", "quadrilateral_angles"],
    openstax: {
      module: "m81326",
      sections: [
        "Use the Properties of Triangles",
        "Sum of the Measures of the Angles of a Triangle",
      ],
    },
    cnKeywords: ["三角形", "内角和", "等边三角形", "等腰三角形", "直角三角形"],
    stage: 2,
  },
  {
    id: "geo-04",
    khan: [
      "area_of_parallelograms",
      "area_2",
      "areas_of_trapezoids_rhombi_and_kites",
      "area_of_squares_and_rectangles",
      "shaded_areas",
    ],
    openstax: {
      module: "m81332",
      sections: [
        "Use the Properties of Rectangles",
        "Use the Properties of Triangles",
        "Use the Properties of Trapezoids",
      ],
    },
    cnKeywords: ["面积", "平行四边形", "梯形", "矩形", "周长"],
    stage: 2,
  },
  {
    id: "geo-05",
    khan: [
      "congruent_triangles_1",
      "congruent_triangles_2",
      "congruent_segments",
      "translations_of_points_and_polygons",
      "rotation_of_polygons",
    ],
    openstax: {
      module: "m81326",
      sections: ["Use the Properties of Triangles"],
    },
    cnKeywords: ["轴对称", "平移", "旋转", "全等", "全等三角形"],
    stage: 2,
  },
  {
    id: "geo-06",
    khan: [
      "pythagorean_theorem_1",
      "pythagorean_theorem_2",
      "pythagorean_identities",
    ],
    openstax: {
      module: "m81326",
      sections: ["Right Triangles", "Use the Pythagorean Theorem"],
    },
    cnKeywords: ["勾股定理", "直角三角形", "斜边", "平方"],
    stage: 3,
  },
  {
    id: "geo-07",
    khan: [
      "similar_triangles_1",
      "similar_triangles_2",
      "solving_similar_triangles_1",
      "solving_similar_triangles_2",
    ],
    openstax: {
      module: "m81326",
      sections: ["Similar Triangles", "Properties of Similar Triangles"],
    },
    cnKeywords: ["相似三角形", "相似", "位似", "比例", "缩放"],
    stage: 3,
  },
  {
    id: "geo-08",
    khan: [
      "inscribed_angles_1",
      "circles_and_arcs",
      "radius_diameter_and_circumference",
      "area_of_a_circle",
    ],
    openstax: {
      module: "m81327",
      sections: ["Use the Properties of Circles"],
    },
    cnKeywords: ["圆", "圆心角", "圆周角", "弧", "半径", "直径"],
    stage: 3,
  },
];

/* ──────────────────────────────────────────────────────────────────
 * 网络工具（带磁盘缓存）
 * ────────────────────────────────────────────────────────────────── */

const UA = "OE-GeoFetcher/1.0 (+https://github.com/3982241557-art/open-education-learning-platform)";

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
 * 经常**嵌套**别的元素。非贪婪正则会在内层标签处提前截断——
 * 症状是抓出来的「题干」里混进了半个图形脚本。
 *
 * 所以这里**数 div 的开合**，只返回真正配对的那个块。
 *
 * @param {string} html 原始 HTML
 * @param {string} className 目标 class 名
 * @returns {string[]} 各块的内部 HTML
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

    /* 跳过这个块，继续找下一个 */
    re.lastIndex = end === -1 ? html.length : end;
  }

  return blocks;
}

/**
 * 删掉所有 ``<div class="graphie">…</div>`` 块（Khan 的绘图脚本）。
 *
 * ⛔ **不能用非贪婪正则**。
 *
 * Graphie 块里**嵌套着别的 ``<div>``**（Khan 的模板会把图形包在
 * 内层 div 里）。用 ``/<div class="graphie">([\s\S]*?)<\/div>/`` 会在
 * **第一个** ``</div>`` 处停下——也就是内层 div 的结尾——于是
 * 外层的 JavaScript 被**留下来**，变成题目的一部分。
 *
 * 症状是页面上出现「init({ range: [...] }) var tr = new Triangle(...)」
 * 这种句子——它比没有提示更糟：学生会以为自己在学编程。
 *
 * 所以这里**数 div 的开合**，找到真正配对的那个 ``</div>``。
 *
 * @param {string} html 原始 HTML
 * @returns {string} 删净 graphie 块的 HTML
 */
function stripGraphieBlocks(html) {
  let out = html;
  let guard = 0;

  for (;;) {
    if (guard > 200) break;
    guard += 1;

    const start = out.search(/<div[^>]*class="[^"]*graphie[^"]*"[^>]*>/);
    if (start === -1) break;

    /* 从 start 开始数 div 的开合，找到配对的 </div> */
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
 * 去掉 HTML 标签，保留可读文本。
 *
 * Khan 的提示里混着 ``<var>MEASURE</var>`` 这类变量占位符——它们是
 * **图形化变量**，在 Khan 的运行时才有值。这里保留成 ``{var}``
 * 形式，直观地告诉学生「这里是一个会变化的数」。
 */
function stripHtml(raw) {
  const html = stripGraphieBlocks(raw);
  return html
    .replace(/<var[^>]*>([^<]*)<\/var>/g, "{$1}")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, "$1")
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
 * 解析一个 Khan 练习文件。
 *
 * 返回 ``{ title, questions, hints }``：
 *
 * - ``questions`` —— 每个问题的题干与解答形式；
 * - ``hints``     —— **逐级**启发提示（Khan 的 hints 本身就是
 *   一级一级递进的，这是它的核心教学设计，必须整份保留）。
 */
function parseKhanExercise(html, file) {
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : file;

  /* ── 题目 ──
   *
   * ⛔ Khan 的题目有两种标记，**必须都认**：
   *
   * - ``<p class="question">``  —— 老式练习（measuring_angles 等）；
   * - ``<div class="question">`` —— 新式练习（triangle_angles_1 等）。
   *
   * 只认其中一种会让相当一部分练习的题目**静默丢失**——
   * 表现为「巩固题 0 道」这种空状态，很难发现。
   *
   * ⛔ 而且新式的 ``<div class="question">`` 里**只有图形**，
   *    题干在它**上面**的 ``<div class="problem">`` 里。所以要
   *    把两者合起来看——只取 question 会得到空题干。
   */
  const questions = [];

  /* 先扫 ``<div class="problem">`` —— 新式练习的题干在这里。
   *
   * ⛔ 同样不能用非贪婪正则：problem 里可能嵌着 ``<code>`` 或
   *    别的 div。用**配对提取**（数 div 开合）才准。
   */
  const problemTexts = [];
  for (const block of extractBlocksByClass(html, "problem")) {
    const text = stripHtml(block);
    if (text) problemTexts.push(text);
  }

  /* 再扫 ``<p|div class="question">`` —— 老式练习的题干在这里 */
  const questionTexts = [];
  for (const m of html.matchAll(
    /<p class="question"[^>]*>([\s\S]*?)<\/p>/g,
  )) {
    const text = stripHtml(m[1]);
    if (text) questionTexts.push(text);
  }
  for (const block of extractBlocksByClass(html, "question")) {
    const text = stripHtml(block);
    /* 纯图形的 question 剥完是空的 —— 跳过 */
    if (text) questionTexts.push(text);
  }

  /* 合并去重，保持出现顺序 */
  const seen = new Set();
  for (const t of [...problemTexts, ...questionTexts]) {
    if (seen.has(t)) continue;
    seen.add(t);
    questions.push(t);
  }

  /* 解答形式：<span class="sol"> 里的 data-forms / data-inexact */
  const answerForms = [];
  for (const m of html.matchAll(
    /<span class="sol"([^>]*)>/g,
  )) {
    const attrs = m[1];
    const forms = (attrs.match(/data-forms="([^"]*)"/) || [, ""])[1];
    const maxError = (attrs.match(/data-max-error="([^"]*)"/) || [, ""])[1];
    const inexact = /data-inexact=""/.test(attrs);
    if (forms) answerForms.push({ forms, maxError, inexact });
  }

  /* ── 提示 ──
   *
   * Khan 的提示是**逐级递进**的——这是它最核心的教学设计：
   * 第一条给方向，第二条给关键一步，第三条给做法。**必须整份
   * 按顺序保留**，不能去重也不能截断成一条。
   *
   * ⛔ 提示必须**只从 ``<div class="hints">`` 块里取**。Khan 文件
   *    里到处是 ``<p>``——题干、解答、说明都是 ``<p>``。如果扫
   *    全文的 ``<p>``，会把题干也当成「提示」，导致提示和巩固题
   *    内容重复（页面上看起来就是同一句话出现两次）。
   */
  const hints = [];
  for (const block of extractBlocksByClass(html, "hints")) {
    for (const p of block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      const text = stripHtml(p[1]);
      if (text && text.length > 4) hints.push(text);
    }
  }

  /* ── 解答 ──
   *
   * ``<div class="solution">`` 里的**正确答案形式**，告诉前端
   * 「这道题该填什么」（整数 / 分数 / 带误差的近似值）。
   */
  const solutionText = [];
  for (const m of html.matchAll(
    /<div class="solution"[^>]*>([\s\S]*?)<\/div>/g,
  )) {
    const text = stripHtml(m[1]);
    if (text) solutionText.push(text);
  }

  return { title, questions, answerForms, hints, solutionText };
}

/* ──────────────────────────────────────────────────────────────────
 * 解析：OpenStax CNXML → 概念定义 + 定理 + 例题
 * ────────────────────────────────────────────────────────────────── */

/**
 * 把 CNXML 的 MathML 转成**可读的纯文本**。
 *
 * CNXML 里数学公式是 MathML（``<m:mtext>180°</m:mtext>``）。
 * 我们把 ``<m:mtext>`` 的内容提出来拼成 ``180°``，把运算符
 * ``<m:mo>`` 保留成可读符号——这样公式在页面上是**能读的**，
 * 而不是一堆 XML 标签。
 */
function cnxmlToText(xml) {
  return xml
    /* MathML：mtext 是要读的正文，mo 是运算符 */
    .replace(/<m:mtext[^>]*>([\s\S]*?)<\/m:mtext>/g, "$1")
    .replace(/<m:mo[^>]*>([\s\S]*?)<\/m:mo>/g, "$1")
    .replace(/<m:mi[^>]*>([\s\S]*?)<\/m:mi>/g, "$1")
    .replace(/<m:mn[^>]*>([\s\S]*?)<\/m:mn>/g, "$1")
    /* 去掉其余 MathML 包装 */
    .replace(/<\/?m:[^>]+>/g, "")
    /* CNXML 标签 */
    .replace(/<note[^>]*>/g, " ")
    .replace(/<\/note>/g, " ")
    .replace(/<para[^>]*>/g, " ")
    .replace(/<\/para>/g, " ")
    .replace(/<title[^>]*>/g, " ")
    .replace(/<\/title>/g, " ")
    .replace(/<[^>]+>/g, " ")
    /* 实体 */
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
 * 从 OpenStax CNXML 里抽出**概念定义**与**例题**。
 *
 * 抽取规则（对着真实 CNXML 结构写的，不是猜的）：
 *
 * - ``<note>`` 块 = OpenStax 的**核心概念框**（Theorem / Definition）；
 * - ``<example>`` 块 = **带解答的例题**；
 * - ``<section>`` 的 ``<title>`` = 章节名。
 *
 * ⛔ **章节归属必须准确**。CNXML 里所有 section 是**平铺**在同一层
 *    的，先后顺序有意义。把 m81326 里「勾股定理」的概念配到
 *    「相交线与平行线」那一课，就是**张冠李戴**——比编造更糟，
 *    因为它看起来像是真的。所以这里按 ``<section>`` 边界切片，
 *    每个概念都记住自己属于哪个 section。
 */
function parseOpenStaxModule(xml) {
  const concepts = [];
  const examples = [];

  /* ── 按 <section> 切片 ──
   *
   * CNXML 的结构是：
   *   <section id="..."><title>章节名</title> ...内容... </section>
   *
   * 用 ``<section`` 到下一个 ``</section>`` 做切分，再从每片里
   * 提概念与例题——这样每个概念都带着**它自己的**章节名。
   */
  const sections = [];

  /* 先取所有 section 的起止位置 */
  const sectionStarts = [];
  const re = /<section\b/g;
  let mm;
  while ((mm = re.exec(xml)) !== null) {
    sectionStarts.push(mm.index);
  }

  for (let i = 0; i < sectionStarts.length; i += 1) {
    const start = sectionStarts[i];
    const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1] : xml.length;
    const chunk = xml.slice(start, end);

    const titleMatch = chunk.match(/<title>([\s\S]*?)<\/title>/);
    const sectionTitle = titleMatch ? cnxmlToText(titleMatch[1]) : "";

    /* 概念框：<note id="..."><title>名字</title><para>定义正文</para> */
    for (const m of chunk.matchAll(
      /<note[^>]*>\s*<title>([\s\S]*?)<\/title>([\s\S]*?)<\/note>/g,
    )) {
      const heading = cnxmlToText(m[1]);
      const body = cnxmlToText(m[2]);
      if (heading && body && body.length > 20) {
        concepts.push({ heading, body, section: sectionTitle });
      }
    }

    /* 例题：<example ...><exercise><problem><para>题干</para> */
    for (const m of chunk.matchAll(/<example[^>]*>([\s\S]*?)<\/example>/g)) {
      const block = m[1];
      const problemMatch = block.match(/<problem[^>]*>([\s\S]*?)<\/problem>/);
      if (!problemMatch) continue;
      const question = cnxmlToText(problemMatch[1]);
      if (!question || question.length < 10) continue;

      /* 解答：取 solution 里的文字（去掉 step-by-step 的冗长表格描述） */
      const solMatch = block.match(/<solution[^>]*>([\s\S]*?)<\/solution>/);
      const solution = solMatch ? cnxmlToText(solMatch[1]) : "";

      examples.push({
        question,
        solution: solution.length > 400 ? `${solution.slice(0, 400)}…` : solution,
        section: sectionTitle,
      });
    }

    if (sectionTitle) sections.push(sectionTitle);
  }

  /* 概念框里可能没有 <title>（OpenStax 少数 note 是纯正文），
     那种直接跳过——它们没有可读的标题，不适合当「概念卡」。 */

  return { concepts, examples, sections };
}

/* ──────────────────────────────────────────────────────────────────
 * 解析：cn-k12 中文图谱 → 中文知识点
 * ────────────────────────────────────────────────────────────────── */

/**
 * 从中文 K12 图谱里取**与本课相关的真实知识点**。
 *
 * 这些是**人教版**教材里真实存在的章节名与知识点名——用来做中文
 * 表述的**骨架**，而不是编造。
 *
 * ⛔ **必须精确匹配，不能拿宽泛的词凑数**。
 *
 * 例如「角」的关键词如果只写成「角」，那么「三角形」「直角三角形」
 * 「等腰梯形」全都会命中——最后「相交线与平行线」那一课讲出来
 * 却是「三角形的稳定性」。这不是翻译问题，是**内容张冠李戴**。
 *
 * 所以这里用**两级匹配**：
 *
 * 1. **精确** —— 知识点名**完全等于**某个关键词；
 * 2. **包含** —— 关键词长度 ≥ 3 且知识点名包含它。
 *
 * 短的关键词（「角」「圆」）只允许精确匹配，避免误伤。
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
    scored.push({ name, chapter: ch ? ch.name : "", bookId: t.bookId, score });
  }

  /* 高分优先；同分按名称长度升序（更具体的排前面） */
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);

  /* 去重（同名不同册） */
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
  console.log("│  OE · 开源几何链采集器                        │");
  console.log("└─────────────────────────────────────────────┘");

  if (checkOnly) {
    if (!fs.existsSync(OUT_FILE)) {
      console.error("❌ geometry-chain.json 不存在");
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    console.log(`✅ 已存在：${data.lessons.length} 节课`);
    for (const l of data.lessons) {
      console.log(
        `   ${l.id} · ${l.titles.en} · ${l.sources.length} 个来源 · ` +
          `${l.trials.length} 道巩固题`,
      );
    }
    return;
  }

  /* ── 拉取 cn-k12 中文图谱 ── */
  console.log("\n[1/3] 拉取 cn-k12 中文数学知识图谱…");
  const cnRaw = await fetchText(`${CNK12.rawBase}/graph.json`, { offline });
  const cnGraph = JSON.parse(cnRaw);
  console.log(
    `   ✅ ${CNK12.repo} · ${cnGraph.nodes.topics.length} 个中文知识点`,
  );

  /* ── 逐课拉取 Khan + OpenStax ── */
  console.log("\n[2/3] 拉取 Khan 练习与 OpenStax 教材…");
  const lessons = [];
  const provenance = [];

  for (const spec of LESSON_SOURCES) {
    process.stdout.write(`   · ${spec.id} `);

    /* Khan */
    const khanFiles = [];
    for (const file of spec.khan) {
      const url = `${KHAN.rawBase}/${file}.html`;
      const html = await fetchText(url, { offline });
      const parsed = parseKhanExercise(html, file);
      khanFiles.push({ file, url, ...parsed });
    }

    /* OpenStax */
    const osUrl = `${OPENSTAX.rawBase}/${spec.openstax.module}/index.cnxml`;
    const osXml = await fetchText(osUrl, { offline });
    const osParsed = parseOpenStaxModule(osXml);

    /* 中文知识点 */
    const cnTopics = extractCnTopics(cnGraph, spec.cnKeywords);

    lessons.push({ spec, khanFiles, osParsed, cnTopics });

    /* 来源记录 */
    for (const k of khanFiles) {
      provenance.push({
        lessonId: spec.id,
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
      lessonId: spec.id,
      kind: "textbook",
      repo: OPENSTAX.repo,
      path: `modules/${spec.openstax.module}/index.cnxml`,
      url: osUrl,
      license: OPENSTAX.license,
      licenseUrl: OPENSTAX.licenseUrl,
      sections: spec.openstax.sections,
      concepts: osParsed.concepts.length,
      examples: osParsed.examples.length,
    });

    console.log(
      `Khan ${khanFiles.length} 题 · OpenStax ${osParsed.concepts.length} 概念 / ` +
        `${osParsed.examples.length} 例题 · 中文 ${cnTopics.length} 点`,
    );
  }

  /* ── 组装三语文本 ── */
  console.log("\n[3/3] 组装三语文本并写入数据文件…");

  const built = lessons.map(({ spec, khanFiles, osParsed, cnTopics }) => {
    /* ── 英文概念：OpenStax 的概念框原文 ──
     *
     * ⛔ **按 section 精确挑选**。osParsed.concepts 里每个概念都带着
     *    自己的 section 名（解析时记下的）。这里只取 section 与本课
     *    配置**完全匹配**的概念——不匹配就说明这一课在这个模块里
     *    没有对应概念，应该留空而不是拿别的凑。
     */
    const wanted = new Set(spec.openstax.sections);
    const scoped = osParsed.concepts.filter((c) => wanted.has(c.section));
    /* 同一 section 里保留原顺序（CNXML 里就是教学顺序） */
    const enConcepts = scoped.slice(0, 3).map((c) => `${c.heading}: ${c.body}`);

    /* 例题：同样按 section 挑 */
    const scopedExamples = osParsed.examples.filter((e) => wanted.has(e.section));
    const enExamples = (scopedExamples.length ? scopedExamples : osParsed.examples).slice(0, 2);

    /* 英文提示：Khan 的 hints 原文（逐级保留） */
    const enHints = khanFiles.flatMap((k) => k.hints).slice(0, 5);

    /* 英文巩固题：Khan 的 question 原文 */
    const enTrials = khanFiles
      .flatMap((k) => k.questions.map((q) => ({ q, from: k.file, title: k.title })))
      .slice(0, 3);

    /* ── 中文 ──
     *
     * 来自 cn-k12 图谱的**真实教材知识点**（人教版章节 + 知识点名）。
     * 中文侧没有「概念定义」的现成长句——cn-k12 图谱提供的是
     * **教材体系骨架**（这个知识点在第几章、叫什么），这正是中文
     * 表述需要的：真实、可追溯、不编造。
     */
    const zhConcepts = cnTopics.map((t) => `${t.name}（${t.chapter}）`);

    /* 中文任务引导：基于真实章节名 */
    const zhTasks = cnTopics.map(
      (t) => `在《${t.chapter}》中完成「${t.name}」的探究与验证`,
    );

    /* 中文提示：基于真实知识点的定义式提问 */
    const zhHints = cnTopics.map(
      (t) => `想一想：${t.name}在《${t.chapter}》里是怎么定义的？依据是什么？`,
    );

    /* 中文巩固题：基于真实知识点的判定式提问 */
    const zhTrials = cnTopics.slice(0, 3).map(
      (t) => `在《${t.chapter}》中，${t.name}的判定条件是什么？举一个具体例子。`,
    );

    return {
      id: spec.id,
      stage: spec.stage,
      sources: {
        khan: khanFiles.map((k) => ({
          repo: KHAN.repo,
          path: `exercises/${k.file}.html`,
          url: k.url,
          license: KHAN.license,
          licenseUrl: KHAN.licenseUrl,
          title: k.title,
        })),
        openstax: {
          repo: OPENSTAX.repo,
          path: `modules/${spec.openstax.module}/index.cnxml`,
          url: `${OPENSTAX.rawBase}/${spec.openstax.module}/index.cnxml`,
          license: OPENSTAX.license,
          licenseUrl: OPENSTAX.licenseUrl,
          sections: spec.openstax.sections,
        },
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
      /** 原始素材——完整保留，供 GeoGebraStudio 取用 */
      raw: {
        khanHints: khanFiles.flatMap((k) => k.hints),
        khanQuestions: enTrials,
        openstaxExamples: enExamples,
        openstaxConcepts: scoped.slice(0, 6),
      },
    };
  });

  const out = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    generator: "scripts/fetch-open-geometry.mjs",
    chain: {
      id: "geometry",
      title: {
        zhCN: "空间、角度与几何探究",
        zhTW: "空間、角度與幾何探究",
        en: "Space, Angles and Geometric Inquiry",
      },
      stageNames: {
        1: {
          zhCN: "直觉测量",
          zhTW: "直覺測量",
          en: "Intuitive Measurement",
        },
        2: {
          zhCN: "图形转化",
          zhTW: "圖形轉化",
          en: "Figure Transformation",
        },
        3: {
          zhCN: "定理证明",
          zhTW: "定理證明",
          en: "Theorem Proof",
        },
      },
    },
    licenses: [
      {
        repo: KHAN.repo,
        license: KHAN.license,
        licenseUrl: KHAN.licenseUrl,
        note: "练习框架为 MIT；练习内容为 CC BY-NC-SA 3.0。",
      },
      {
        repo: OPENSTAX.repo,
        license: OPENSTAX.license,
        licenseUrl: OPENSTAX.licenseUrl,
      },
      {
        repo: CNK12.repo,
        license: CNK12.license,
        licenseUrl: CNK12.licenseUrl,
      },
    ],
    sourceProvenance: provenance,
    lessons: built,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`);

  const size = fs.statSync(OUT_FILE).size;
  console.log(`\n✅ 已写入 ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`   ${built.length} 节课 · ${provenance.length} 条来源记录 · ${(size / 1024).toFixed(1)} KB`);
  for (const l of built) {
    console.log(
      `   ${l.id} · ${l.sources.khan.length} Khan + OpenStax · ` +
        `概念 ${l.concept.en.length} · 提示 ${l.hints.en.length} · 巩固题 ${l.trials.en.length}`,
    );
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
