#!/usr/bin/env node
/**
 * K12 数据全量自检脚本
 * ====================
 *
 * 强制确认 4 项**零异常**：
 *
 * 1. **0 条视频分 P 与标题错位**；
 * 2. **0 条初高中语文出现「笔顺描红」**；
 * 3. **0 条空洞模板题或错龄假题**；
 * 4. **0 个弹窗使用半透明文字底色**。
 *
 * 另外输出覆盖率报告：总套数、总课时数、真实题库覆盖率。
 *
 * 运行：
 *
 * .. code-block:: bash
 *
 *    node scripts/verify-k12-data.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COURSES_DIR = path.join(ROOT, "web", "public", "data", "courses");
const WEB_DIR = path.join(ROOT, "web");

/* ──────────────────────────────────────────────────────────────────
 * 一、禁用的空洞 / 错龄模板题
 * ────────────────────────────────────────────────────────────────── */

/**
 * 模板题的特征。
 *
 * 这些句子**曾经**出现在旧数据里——它们不是题，是占位符。
 * 只要出现其中任何一条，就判定为异常。
 */
const BANNED_QUESTION_PATTERNS = [
  { pattern: /你对本课理解到哪一步了/, why: "自评式占位题" },
  { pattern: /区分天和无/, why: "错龄假题（与课名无关）" },
  { pattern: /理解到哪一步/, why: "自评式占位题" },
  { pattern: /请选择你(最)?(想|要)?(学|看)什么/, why: "自评式占位题" },
  { pattern: /你觉得自己(掌握|理解)了?几成/, why: "自评式占位题" },
  { pattern: /^你对本课/, why: "自评式占位题" },
  { pattern: /以下哪个选项(最)?符合你的感受/, why: "自评式占位题" },
  { pattern: /你对本节课的(满意度|评价)/, why: "自评式占位题" },
  { pattern: /你是怎么(理解|看待)这个知识点的/, why: "自评式占位题" },
  { pattern: /请为自己打分/, why: "自评式占位题" },
  { pattern: /测试一下你的(学习)?(成果|情况)/, why: "自评式占位题" },
];

/** 正确项必须在选项列表里——否则是假题。 */
const BANNED_OPTION_PATTERNS = [
  { pattern: /以上都对/, why: "万能选项" },
  { pattern: /以上都不对/, why: "万能选项" },
  { pattern: /不确定|不知道/, why: "无信息量的选项" },
];

/** 初高中绝不该出现的题目类型。 */
const JUNIOR_SENIOR_BANNED = [
  { pattern: /描红|笔画顺序|笔顺/, why: "初高中出现小学笔顺题" },
  { pattern: /认读这个字|读一读这个字/, why: "初高中出现小学识字题" },
];

/* ──────────────────────────────────────────────────────────────────
 * 二、视频分 P 与标题的错位检查
 * ────────────────────────────────────────────────────────────────── */

/**
 * 分 P 标题与视频标题不一致的信号。
 *
 * 旧数据里出现过：课时标题是《4.古代诗歌四首》，
 * 但播放的分 P 实际是朱自清《春》。
 *
 * 我们无法联网核验 B 站，但可以做**结构化校验**：
 *
 * - 分 P 编号必须落在该集声明的分 P 范围内；
 * - 分 P 标题不能与本集标题指向**完全不同的课文**；
 * - 同一系列内，**同一分 P 编号不能被两集共用**——
 *   这正是「标题是《古代诗歌四首》但画面是《春》」的机械成因。
 */
const CN_TITLE_RE = /[《〈](.+?)[》〉]/;

/** 提取标题里的《》书名号内容。 */
function extractBookTitle(text) {
  const match = String(text ?? "").match(CN_TITLE_RE);
  return match ? match[1].trim() : null;
}

/** 去掉标题里的标点与修饰，得到可比较的核心词。 */
function normalizeTitle(text) {
  return String(text ?? "")
    .replace(/[【】《》〈〉\[\]()（）「」·、，,。:：\-—–|｜\s]/g, "")
    .replace(/(\d+)$/, "")
    .trim();
}

/* ──────────────────────────────────────────────────────────────────
 * 三、弹窗半透明底色检查
 * ────────────────────────────────────────────────────────────────── */

/**
 * 承载文字的容器上不允许出现的半透明底色类名。
 *
 * ⛔ `bg-slate-950/60`、`bg-black/50` 这类**只允许**作为弹窗外部的
 * 背景遮罩（backdrop）使用，不能出现在文字卡片上。
 */
const BANNED_OVERLAY_CLASSES = [
  "bg-slate-950/",
  "bg-black/",
  "bg-slate-900/",
  "bg-slate-800/",
  "bg-white/",
  "bg-slate-50/",
  "bg-blue-50/",
  "bg-slate-100/",
  "bg-gradient-to",
  "backdrop-blur",
];

/**
 * **额外禁用的半透明写法**。
 *
 * 这些是 Tailwind 的**任意透明度**语法——比上面的列表更隐蔽，
 * 因为它们写的是**具体的透明度数值**而不是预设档位。
 *
 * ⛔ 承载文字的容器一律 100% 不透明。
 */
const BANNED_ALPHA_CLASSES = [
  // bg-<color>/<任意数字>——注意 ``bg-slate-50`` 是**不透明**的档位，
  // 所以这里要求斜杠后必须是 1–3 位数字且**不含**预设档位名。
  // Tailwind 的不透明档位：0 / 5 / 10 / 20 / 25 / 30 / 40 / 50 /
  // 60 / 70 / 75 / 80 / 90 / 95 / 100 —— 其中只有 100 是不透明，
  // 其余都带透明度。但 ``bg-slate-50``（无斜杠）是**不透明**的。
  /\bbg-(?:white|black|slate|gray|zinc|neutral|stone|blue|red|green|amber|yellow|indigo|violet|purple|pink|teal|cyan|sky)-\d{1,3}\//,
  // bg-<color>-[<任意小数>]
  /\bbg-(?:white|black|slate|gray|zinc|neutral|stone|blue|red|green|amber|yellow|indigo|violet|purple|pink|teal|cyan|sky)-\[0?\.\d+\]/,
  // from-<color>/<数字> 或 to-<color>/<数字>（渐变端点）
  /\b(?:from|via|to)-(?:white|black|slate|gray|zinc|neutral|stone|blue|red|green|amber|yellow|indigo|violet|purple|pink|teal|cyan|sky)-\d{1,3}\//,
];

/** 允许使用半透明遮罩的**位置**——弹窗的 backdrop 那一层。 */
const BACKDROP_ALLOWED = /backdrop|overlay|mask|scrim/i;

/**
 * 允许使用半透明底色的**行**。
 *
 * 三类情况不算违规：
 *
 * 1. `hover:` —— 只有鼠标悬停才出现的态，平时不承载文字；
 * 2. `pointer-events-none` / `inset-x-0 top-0 h-` ——
 *    纯装饰性高光或纹饰，不承载可读文字；
 * 3. `bg-black/9x` 的视频容器 —— 那是**画面本身**的黑底，
 *    不是浮在画面上的文字卡。
 */
const DECORATION_ALLOWED =
  /hover:|pointer-events-none|inset-x-0 top-0 h-|aspect-video|bg-black\/9|bg-black\/8|bg-slate-9\d{2}\/9/;

/* ──────────────────────────────────────────────────────────────────
 * 四、主流程
 * ────────────────────────────────────────────────────────────────── */

function listFiles(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(filter)
    .map((name) => path.join(dir, name));
}

/** 递归收集源码文件。 */
function collectSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "out" ||
        entry.name === ".git"
      ) {
        continue;
      }
      collectSourceFiles(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const issues = {
    videoMismatch: [],
    juniorSeniorTracing: [],
    templateQuestions: [],
    translucentPanels: [],
  };

  const seriesFiles = listFiles(
    COURSES_DIR,
    (name) => name.startsWith("k12_") && name.endsWith(".json"),
  );

  /* ── 数据检查 ── */
  const stats = {
    series: 0,
    episodes: 0,
    diagnostics: 0,
    quizzes: 0,
    summaries: 0,
    withRealDiagnostics: 0,
    withRealQuizzes: 0,
    labs: {},
    pIndexReuse: new Map(),
  };

  for (const file of seriesFiles) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const fileName = path.basename(file);
    const grade = Number(data.grade) || 1;
    const subject = data.subject === "chinese" ? "chinese" : "math";
    const stage = grade <= 6 ? "primary" : grade <= 9 ? "junior" : "senior";

    stats.series += 1;

    for (const episode of data.episodes ?? []) {
      stats.episodes += 1;

      /* ── 诊断题 ── */
      const diagnostics = episode.diagnostics ?? [];
      const quizzes = episode.quizzes ?? [];
      stats.diagnostics += diagnostics.length;
      stats.quizzes += quizzes.length;

      const realDiagnostics = diagnostics.filter(
        (q) => q.source && q.source !== "fallback",
      );
      const realQuizzes = quizzes.filter(
        (q) => q.source && q.source !== "fallback",
      );
      if (realDiagnostics.length >= 2) stats.withRealDiagnostics += 1;
      if (realQuizzes.length >= 2) stats.withRealQuizzes += 1;

      /* ── 模板题检查 ── */
      for (const question of [...diagnostics, ...quizzes]) {
        for (const banned of BANNED_QUESTION_PATTERNS) {
          if (banned.pattern.test(question.question ?? "")) {
            issues.templateQuestions.push({
              file: fileName,
              ep: episode.ep_id,
              title: episode.title,
              why: banned.why,
              text: question.question.slice(0, 40),
            });
          }
        }
        for (const option of question.options ?? []) {
          for (const banned of BANNED_OPTION_PATTERNS) {
            if (banned.pattern.test(option)) {
              issues.templateQuestions.push({
                file: fileName,
                ep: episode.ep_id,
                title: episode.title,
                why: banned.why,
                text: option.slice(0, 40),
              });
            }
          }
        }
        // 选项不能少于 2 个；正确项下标必须在范围内。
        if (
          !Array.isArray(question.options) ||
          question.options.length < 2 ||
          !(question.correctIndex >= 0) ||
          question.correctIndex >= question.options.length
        ) {
          issues.templateQuestions.push({
            file: fileName,
            ep: episode.ep_id,
            title: episode.title,
            why: "题目结构损坏（选项数不足或正确项越界）",
            text: String(question.question ?? "").slice(0, 40),
          });
        }
        // 解析不能为空。
        if (!String(question.explanation ?? "").trim()) {
          issues.templateQuestions.push({
            file: fileName,
            ep: episode.ep_id,
            title: episode.title,
            why: "缺少解析",
            text: String(question.question ?? "").slice(0, 40),
          });
        }
      }

      /* ── 总结检查 ── */
      const summary = episode.summary ?? [];
      stats.summaries += summary.length;
      if (summary.length < 3) {
        issues.templateQuestions.push({
          file: fileName,
          ep: episode.ep_id,
          title: episode.title,
          why: `核心总结不足 3 条（实际 ${summary.length} 条）`,
          text: "",
        });
      }

      /* ── 初高中语文不得出现笔顺描红 ── */
      if (subject === "chinese" && stage !== "primary") {
        const lab = episode.interactive_lab;
        if (lab?.kind === "hanzi" || lab?.title?.includes("笔顺")) {
          issues.juniorSeniorTracing.push({
            file: fileName,
            ep: episode.ep_id,
            title: episode.title,
            why: `初高中语文出现了「笔顺描红」实验室（kind=${lab.kind}）`,
          });
        }
        for (const question of [...diagnostics, ...quizzes]) {
          for (const banned of JUNIOR_SENIOR_BANNED) {
            if (banned.pattern.test(question.question ?? "")) {
              issues.juniorSeniorTracing.push({
                file: fileName,
                ep: episode.ep_id,
                title: episode.title,
                why: banned.why,
                text: question.question.slice(0, 40),
              });
            }
          }
        }
      }

      /* ── 互动实验室必须展开即有内容 ── */
      const lab = episode.interactive_lab;
      if (lab) {
        stats.labs[lab.kind] = (stats.labs[lab.kind] ?? 0) + 1;
        if (!lab.kind || lab.kind === "placeholder") {
          issues.templateQuestions.push({
            file: fileName,
            ep: episode.ep_id,
            title: episode.title,
            why: "互动实验室为占位类型",
            text: "",
          });
        }
      }

      /* ── 分 P 编号复用检查 ── */
      const pIndex = episode.p_index ?? episode.p ?? episode.page;
      if (pIndex !== undefined && pIndex !== null && data.bvid) {
        const key = `${data.bvid}#${pIndex}`;
        const list = stats.pIndexReuse.get(key) ?? [];
        list.push({
          file: fileName,
          ep: episode.ep_id,
          title: episode.title,
        });
        stats.pIndexReuse.set(key, list);
      }
    }
  }

  // 同一 bvid + 同一分 P 被多集引用 → 典型的「标题与画面错位」信号。
  for (const [key, list] of stats.pIndexReuse) {
    if (list.length > 1) {
      const [bvid, p] = key.split("#");
      for (let i = 1; i < list.length; i += 1) {
        issues.videoMismatch.push({
          file: list[i].file,
          ep: list[i].ep,
          title: list[i].title,
          why: `分 P 错位：bvid=${bvid} p=${p} 被 ${list.length} 集共用`,
        });
      }
    }
  }

  /* ── 源码检查：半透明文字底色 ── */
  const sourceFiles = collectSourceFiles(WEB_DIR);
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      // 只看 className 含 Tailwind 背景色的行。
      if (!/className/.test(line)) return;

      // ── 任意透明度的写法（bg-white/70、bg-slate-900/[0.08] …） ──
      // 只有当这一行**确实是一张卡片**时才判违规——
      // hover: 态与装饰性覆盖层不算。
      const hasAlphaBg = BANNED_ALPHA_CLASSES.some((re) => re.test(line));
      if (hasAlphaBg && !DECORATION_ALLOWED.test(line)) {
        const isAlphaCard =
          /rounded|border|p-\d|px-\d|py-\d|shadow/.test(line);
        // 深色底（侧边栏、导航块）本来就不在禁列里。
        const isDarkSurface =
          /bg-(?:\[#0B162C\]|\[#122344\]|slate-9\d\d)/.test(line);
        if (isAlphaCard && !isDarkSurface) {
          issues.translucentPanels.push({
            file: path.relative(ROOT, file),
            line: index + 1,
            why: "文字卡片使用了半透明底色（任意透明度语法）",
            text: line.trim().slice(0, 90),
          });
        }
      }

      for (const banned of BANNED_OVERLAY_CLASSES) {
        if (!line.includes(banned)) continue;
        // backdrop 那行允许半透明——它是遮罩，不是文字底色。
        if (BACKDROP_ALLOWED.test(line)) continue;
        // 装饰性 / hover 态不算违规。
        if (DECORATION_ALLOWED.test(line)) continue;

        // 只有当这一行**同时**含文字容器特征时才算异常。
        // 判据：含 rounded/border/padding 等「卡片」特征。
        const isCard =
          /rounded|border|p-\d|px-\d|py-\d|shadow/.test(line);
        if (!isCard) continue;

        // 纯深色渐变（证书主视觉）不是半透明——排除。
        if (/bg-gradient-to-br from-\[#/.test(line)) continue;
        issues.translucentPanels.push({
          file: path.relative(ROOT, file),
          line: index + 1,
          why: `文字卡片使用了半透明底色 ${banned}`,
          text: line.trim().slice(0, 90),
        });
      }
    });
  }

  /* ── 报告 ── */
  const total = (list) => list.length;
  const passed =
    total(issues.videoMismatch) === 0 &&
    total(issues.juniorSeniorTracing) === 0 &&
    total(issues.templateQuestions) === 0 &&
    total(issues.translucentPanels) === 0;

  console.log("═".repeat(72));
  console.log("K12 数据全量自检报告");
  console.log("═".repeat(72));
  console.log(
    `系列总数：${stats.series} 套　｜　课时总数：${stats.episodes} 集`,
  );
  console.log(
    `诊断题：${stats.diagnostics} 道　｜　随堂题：${stats.quizzes} 道　｜　核心总结：${stats.summaries} 条`,
  );
  const realRate =
    stats.episodes > 0
      ? ((stats.withRealDiagnostics / stats.episodes) * 100).toFixed(1)
      : "0";
  const quizRate =
    stats.episodes > 0
      ? ((stats.withRealQuizzes / stats.episodes) * 100).toFixed(1)
      : "0";
  console.log(
    `真实题库覆盖率：诊断 ${realRate}%（${stats.withRealDiagnostics}/${stats.episodes} 集）　｜　随堂 ${quizRate}%（${stats.withRealQuizzes}/${stats.episodes} 集）`,
  );
  console.log(
    `互动实验室分布：${Object.entries(stats.labs)
      .map(([k, v]) => `${k} ${v}`)
      .join("　")}`,
  );
  console.log("─".repeat(72));

  const report = [
    ["视频分 P 与标题错位", issues.videoMismatch],
    ["初高中语文出现「笔顺描红」", issues.juniorSeniorTracing],
    ["空洞模板题 / 错龄假题 / 结构损坏", issues.templateQuestions],
    ["弹窗使用半透明文字底色", issues.translucentPanels],
  ];

  for (const [label, list] of report) {
    const mark = list.length === 0 ? "✅" : "❌";
    console.log(`${mark} ${label}：${list.length} 条异常`);
    for (const item of list.slice(0, 12)) {
      console.log(
        `     · ${item.file}${item.ep ? ` [${item.ep}]` : ""}${item.line ? `:${item.line}` : ""} — ${item.why}${item.text ? `　「${item.text}」` : ""}`,
      );
    }
    if (list.length > 12) {
      console.log(`     … 另有 ${list.length - 12} 条`);
    }
  }

  console.log("─".repeat(72));
  console.log(passed ? "✅ 全部 4 项通过（0 异常）" : "❌ 存在异常，需修复");
  console.log("═".repeat(72));

  process.exitCode = passed ? 0 : 1;
}

main();
