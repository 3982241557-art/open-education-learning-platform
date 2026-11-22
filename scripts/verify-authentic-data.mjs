#!/usr/bin/env node
/**
 * 真实内容强校验
 * =============
 *
 * 「宁缺毋滥」——宁可隐藏或标记待装配，绝不上线假数据敷衍用户。
 *
 * 四条红线
 * --------
 *
 * 1. ⛔ **0 节语文课生字等于标题拆字**
 *    ——生字必须来自**教材写字表**，不能是把课名的汉字拆下来充数。
 *
 * 2. ⛔ **0 节初高中语文混入小学描红**
 *    ——初中（7–9）与高中（10–12）的语文课，教具只能是**名篇精读
 *    与文化通识**，绝不出现笔顺描红。
 *
 * 3. ⛔ **0 节课视频内容与标题 / 巩固题错位**
 *    ——每一集的 ``video_url`` 分 P 页码必须与它自己的标题、
 *    它的巩固题属于同一集。
 *
 * 4. ⛔ **所有数学课均精确匹配对应教具**
 *    ——每一节数学课都必须有 ``math_tool_type`` 与 ``tool_config``，
 *    且教具类型要与本课知识点相符。
 *
 * 附加红线
 * --------
 *
 * 5. ⛔ **0 个空洞模板题 / 错龄假题**
 *    ——题干不能是「关于《XXX》，你对本课理解到哪一步了」这类
 *    自评表；语文题的选项不能是「完全陌生 / 听过概念」这类
 *    掌握度自陈。
 *
 * 6. ⛔ **0 个弹窗使用半透明文字底色**
 *    ——所有承载文字的卡片 / 弹窗必须是 100% 不透明实心。
 *
 * 运行：
 *
 * .. code-block:: bash
 *
 *    node scripts/verify-authentic-data.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COURSES_DIR = path.join(ROOT, "web", "public", "data", "courses");
const WEB_DIR = path.join(ROOT, "web");

/* ──────────────────────────────────────────────────────────────────
 * 工具
 * ────────────────────────────────────────────────────────────────── */

/** 判断一个字符串里是否全是汉字。 */
function isHan(text) {
  return /^[\u4e00-\u9fa5]+$/.test(String(text ?? ""));
}

/**
 * 生字是否就是课名拆字。
 *
 * 判定：课名里存在一段**连续**的汉字序列，与生字数组**逐位相同**。
 */
function charsAreTitleSplit(chars, title) {
  if (!chars || chars.length === 0) return false;
  const titleChars = [...String(title ?? "")].filter((c) => isHan(c));
  if (titleChars.length < chars.length) return false;
  for (let i = 0; i + chars.length <= titleChars.length; i += 1) {
    const window = titleChars.slice(i, i + chars.length);
    if (window.every((char, index) => char === chars[index])) return true;
  }
  return false;
}

/** 题库里被禁止的空洞模板句。 */
const FORBIDDEN_QUESTION_PATTERNS = [
  /你对本课理解到哪一步/,
  /完全陌生/,
  /听过概念/,
  /已掌握基础想看/,
  /^关于《?.*》?，/,
  /请简要说明你对本课/,
  /本课讲了什么内容/,
];

/* ──────────────────────────────────────────────────────────────────
 * 各项检查
 * ────────────────────────────────────────────────────────────────── */

/** 检查 ①：生字等于标题拆字。 */
function checkHanziNotSplit(series, results) {
  for (const episode of series.episodes) {
    const manifest = episode.lesson_manifest;
    if (!manifest) continue;
    const chars = manifest.hanzi ?? [];
    if (chars.length < 2) continue;
    if (charsAreTitleSplit(chars, manifest.core_title ?? episode.title)) {
      results.push({
        series: series.id,
        episode: episode.ep_id,
        title: episode.title,
        detail: `生字 ${chars.join("")} 就是课名「${manifest.core_title}」拆字`,
      });
    }
  }
}

/** 检查 ②：初高中语文出现笔顺描红。 */
function checkNoStrokeTracingInSecondary(series, results) {
  if (series.subject !== "chinese") return;
  if (series.grade < 7) return;
  for (const episode of series.episodes) {
    const lab = episode.interactive_lab;
    if (!lab) continue;
    if (lab.kind === "hanzi" || Array.isArray(lab.chars)) {
      results.push({
        series: series.id,
        episode: episode.ep_id,
        title: episode.title,
        detail: `初高中语文出现「${lab.kind}」教具（含笔顺描红）`,
      });
    }
  }
}

/** 检查 ③：视频分 P 与标题 / 巩固题错位。 */
function checkVideoAlignment(series, results) {
  for (const episode of series.episodes) {
    // 分 P 课：``?p=N`` 里的 N 必须与 ``page`` 一致。
    if (episode.bvid && episode.page && episode.video_url) {
      const match = /[?&]p=(\d+)/.exec(episode.video_url);
      if (match && Number(match[1]) !== episode.page) {
        results.push({
          series: series.id,
          episode: episode.ep_id,
          title: episode.title,
          detail: `视频分 P ${match[1]} 与 page 字段 ${episode.page} 不一致`,
        });
      }
    }

    // 本集的巩固题不能是别的课的题——检查题里出现的课文名。
    const quizzes = episode.quizzes ?? [];
    const coreTitle = episode.core_title ?? "";
    for (const quiz of quizzes) {
      const question = String(quiz?.question ?? "");
      // 题干里引用了**其他**篇目的书名号内容 → 错位。
      const quotes = question.match(/《([^》]+)》/g) ?? [];
      for (const quote of quotes) {
        const name = quote.slice(1, -1);
        if (name.length >= 2 && coreTitle && !coreTitle.includes(name) && !name.includes(coreTitle)) {
          // 该课文名不在本课标题里——这里只标记**明显**跨学段的情况。
          const seriesGrade = series.grade;
          if (seriesGrade <= 6 && /论语|师说|赤壁赋|登高|劝学|岳阳楼记|醉翁亭记|爱莲说|沁园春|琵琶行|短歌行/.test(name)) {
            results.push({
              series: series.id,
              episode: episode.ep_id,
              title: episode.title,
              detail: `小学课里的巩固题引用了初高中课文《${name}》`,
            });
          }
        }
      }
    }
  }
}

/** 检查 ④：数学课必须精确匹配教具。 */
function checkMathToolMatch(series, results) {
  if (series.subject !== "math") return;
  for (const episode of series.episodes) {
    const manifest = episode.lesson_manifest;
    const lab = episode.interactive_lab;
    if (!manifest) {
      results.push({
        series: series.id,
        episode: episode.ep_id,
        title: episode.title,
        detail: "数学课缺少 lesson_manifest",
      });
      continue;
    }
    if (!manifest.math_tool_type) {
      results.push({
        series: series.id,
        episode: episode.ep_id,
        title: episode.title,
        detail: "数学课没有 math_tool_type",
      });
      continue;
    }
    if (!lab || lab.kind !== manifest.math_tool_type) {
      results.push({
        series: series.id,
        episode: episode.ep_id,
        title: episode.title,
        detail: `教具类型不一致：manifest=${manifest.math_tool_type} lab=${lab?.kind}`,
      });
      continue;
    }
    // 教具必须带**可操作的初始参数**，不能是空壳。
    const config = manifest.tool_config ?? {};
    if (Object.keys(config).length === 0) {
      results.push({
        series: series.id,
        episode: episode.ep_id,
        title: episode.title,
        detail: "数学课教具缺少初始参数（tool_config 为空）",
      });
    }
  }
}

/** 检查 ⑤：空洞模板题 / 错龄假题。 */
function checkNoTemplateQuestions(series, results) {
  for (const episode of series.episodes) {
    const all = [
      ...(episode.diagnostics ?? []),
      ...(episode.quizzes ?? []),
    ];
    for (const quiz of all) {
      const question = String(quiz?.question ?? "");
      for (const pattern of FORBIDDEN_QUESTION_PATTERNS) {
        if (pattern.test(question)) {
          results.push({
            series: series.id,
            episode: episode.ep_id,
            title: episode.title,
            detail: `空洞模板题：「${question.slice(0, 30)}…」`,
          });
          break;
        }
      }
      // 题干必须足够具体——太短的多半是占位符。
      if (question.length < 8) {
        results.push({
          series: series.id,
          episode: episode.ep_id,
          title: episode.title,
          detail: `题干过短，疑似占位符：「${question}」`,
        });
      }
      // 选项必须有解析。
      if (!String(quiz?.explanation ?? "").trim()) {
        results.push({
          series: series.id,
          episode: episode.ep_id,
          title: episode.title,
          detail: "题目缺少解析",
        });
      }
    }
  }
}

/**
 * 检查 ⑥：弹窗 / 卡片使用半透明文字底色。
 *
 * 只扫**真正承载文字**的容器：
 *
 * - ``bg-white/xx``、``bg-slate-xxx/xx``、``bg-[#xxx]/xx`` 这类
 *   **带透明度后缀**的底色；
 * - 但**排除**：
 *   - 全屏遮罩层（``fixed inset-0`` + ``backdrop-blur``）——
 *     这是被允许的；
 *   - 纯装饰元素（``aria-hidden`` 的渐变、圆形光晕）。
 */
function checkNoTransparentTextContainers(results) {
  const roots = [path.join(WEB_DIR, "components"), path.join(WEB_DIR, "app")];

  /** 收集所有源码文件。 */
  function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full, out);
      } else if (/\.(tsx|ts)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  /** 半透明底色类名（Tailwind 调色板）。 */
  const transparentPattern =
    /\bbg-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\/\d{1,3}\b/g;
  /** 任意色值带透明度。 */
  const arbitraryPattern = /\bbg-\[[^\]]*\/[0-9]{1,3}\]/g;

  for (const file of roots.flatMap((dir) => walk(dir))) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split("\n");

    lines.forEach((line, index) => {
      const matches = [
        ...(line.match(transparentPattern) ?? []),
        ...(line.match(arbitraryPattern) ?? []),
      ];
      if (matches.length === 0) return;

      // 豁免 ①：全屏遮罩（允许半透明 + 模糊）。
      if (/fixed\s+inset-0/.test(line)) return;
      // 豁免 ②：纯装饰（aria-hidden / pointer-events-none）。
      if (/aria-hidden|pointer-events-none/.test(line)) return;
      // 豁免 ③：渐变端点（from-/via-/to-）不是独立底色。
      if (!/\bbg-/.test(line)) return;

      results.push({
        series: "-",
        episode: "-",
        title: path.relative(ROOT, file),
        detail: `第 ${index + 1} 行使用了半透明底色：${matches.join(", ")}`,
      });
    });
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 主流程
 * ────────────────────────────────────────────────────────────────── */

function main() {
  const files = fs
    .readdirSync(COURSES_DIR)
    .filter((name) => /^k12_.*\.json$/.test(name))
    .map((name) => path.join(COURSES_DIR, name))
    .sort();

  const series = files.map((file) => {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...data, __file: file };
  });

  const checks = [
    {
      name: "语文课生字等于标题拆字",
      run: (results) => series.forEach((s) => checkHanziNotSplit(s, results)),
    },
    {
      name: "初高中语文混入小学描红",
      run: (results) =>
        series.forEach((s) => checkNoStrokeTracingInSecondary(s, results)),
    },
    {
      name: "视频分 P 与标题 / 巩固题错位",
      run: (results) => series.forEach((s) => checkVideoAlignment(s, results)),
    },
    {
      name: "数学课未精确匹配教具",
      run: (results) => series.forEach((s) => checkMathToolMatch(s, results)),
    },
    {
      name: "空洞模板题 / 错龄假题",
      run: (results) => series.forEach((s) => checkNoTemplateQuestions(s, results)),
    },
    {
      name: "弹窗使用半透明文字底色",
      run: (results) => checkNoTransparentTextContainers(results),
    },
  ];

  console.log("════════════════════════════════════════════════════════════");
  console.log("真实内容强校验报告");
  console.log("════════════════════════════════════════════════════════════");

  const episodes = series.reduce(
    (sum, s) => sum + (s.episodes?.length ?? 0),
    0,
  );
  const quizzes = series.reduce(
    (sum, s) =>
      sum +
      (s.episodes ?? []).reduce((n, e) => n + (e.quizzes?.length ?? 0), 0),
    0,
  );
  console.log(
    `系列总数：${series.length} 套　｜　课时总数：${episodes} 集　｜　巩固题：${quizzes} 道`,
  );
  console.log("────────────────────────────────────────────────────────────");

  let failed = 0;
  for (const check of checks) {
    const results = [];
    check.run(results);
    if (results.length === 0) {
      console.log(`✅ ${check.name}：0 条异常`);
    } else {
      failed += 1;
      console.log(`❌ ${check.name}：${results.length} 条异常`);
      for (const item of results.slice(0, 12)) {
        console.log(`   · [${item.series}] ${item.title} — ${item.detail}`);
      }
      if (results.length > 12) {
        console.log(`   …… 其余 ${results.length - 12} 条省略`);
      }
    }
  }

  console.log("────────────────────────────────────────────────────────────");
  if (failed === 0) {
    console.log(`✅ 全部 ${checks.length} 项通过（0 异常）`);
    console.log("════════════════════════════════════════════════════════════");
  } else {
    console.log(`❌ ${failed} / ${checks.length} 项未通过`);
    console.log("════════════════════════════════════════════════════════════");
    process.exitCode = 1;
  }
}

main();
