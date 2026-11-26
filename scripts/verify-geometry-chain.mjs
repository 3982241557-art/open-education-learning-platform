#!/usr/bin/env node
/**
 * 几何标杆链 · 自检脚本
 * ======================
 *
 * 验收「空间、角度与几何探究」这条标杆链是否真的达标。
 *
 * ⛔ **红线检查**。以下任何一条不过，脚本直接退出码 1——
 *    因为这些是「做了才算做了」的标准，不是「尽量做到」的标准：
 *
 * 1. ``geometry-chain.json`` 存在，且 **8 节课**齐全；
 * 2. 每节课都有真实的 ``source_provenance``（仓库名 + 原始文件路径
 *    + 开源协议），且**仓库确实是那三个开源仓库之一**；
 * 3. 三语（zh-CN / zh-TW / en）下**绝无中英混排**——
 *    英文列里不能有中文，简体列里不能有英文单词；
 * 4. 全站 **0 处 PhET 残留**；
 * 5. 全站 **0 处 next/font/google 实际调用**；
 * 6. 全站 **0 处**「把砝码或控制点拖一拖」这类**与当前课无关的
 *    硬编码引导语**；
 * 7. 全站 **0 处重复的模式切换栏**（/lab 页只允许一套
 *    [探索/规律/谜题]）；
 * 8. 8 节课**各自**有 GeoGebra 构造，且构造互不相同；
 * 9. 静态路径全部带 basePath 前缀（GitHub Pages 子路径零 404）。
 *
 * 用法
 * ----
 *
 * ```bash
 * node scripts/verify-geometry-chain.mjs
 * ```
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "web");

/* ──────────────────────────────────────────────────────────────────
 * 断言工具
 * ────────────────────────────────────────────────────────────────── */

let passed = 0;
const failures = [];

/** 断言条件为真。 */
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/* ──────────────────────────────────────────────────────────────────
 * 递归扫描源文件
 * ────────────────────────────────────────────────────────────────── */

/** 收集 web/ 下所有需要检查的源文件。 */
function collectSources(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "out"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, acc);
    } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/* ──────────────────────────────────────────────────────────────────
 * 中英混排检测
 * ────────────────────────────────────────────────────────────────── */

/** CJK 字符。 */
const CJK = /[㐀-鿿豈-﫿]/;

/**
 * 允许出现在中文列里的英文 token（数学术语与专有名词）。
 *
 * ⛔ 检测中英混排**不能**只靠一个简单正则——那样误报一堆。
 *    必须先把**已知允许**的 token 剥掉，再看剩下的。
 */
const ALLOWED_IN_ZH = new Set([
  "Khan", "Academy", "OpenStax", "GeoGebra", "OE",
  "LIVE", "CONTEXT", "START", "PDF", "HTML", "CSS", "MathML", "CNXML",
  "JSXGraph", "MIT", "CC", "BY", "NC", "SA",
]);

/** 中文列里允许出现的英文小写词（数学名词的通用写法）。 */
const ALLOWED_ZH_WORDS = new Set([
  "cos", "sin", "tan", "log", "ln", "arc", "cm", "mm", "km", "kg",
]);

/** 检测英文列里的汉字。 */
function hasChinese(text) {
  return CJK.test(text);
}

/** 检测中文列里的英文单词（剥离数学记号与专有名词后）。 */
function findEnglishInChinese(text) {
  const cleaned = text
    .replace(/\\[a-zA-Z]+/g, " ") // LaTeX 命令
    .replace(/\$[^$]*\$/g, " ") // 行内公式
    .replace(/\{[^}]*\}/g, " ") // 花括号占位符
    .replace(/[∠°△Δπ√≤≥≠≈⊥∥∽∑]/g, " ") // 数学符号
    .replace(/\b[a-z]\d+\b/g, " ") // a2 / b3
    .replace(/\d+°/g, " "); // 180°

  const hits = [];
  for (const m of cleaned.matchAll(/[A-Za-z]{3,}/g)) {
    const word = m[0];
    if (ALLOWED_IN_ZH.has(word)) continue;
    if (ALLOWED_ZH_WORDS.has(word.toLowerCase())) continue;
    hits.push(word);
  }
  return hits;
}

/* ──────────────────────────────────────────────────────────────────
 * 主流程
 * ────────────────────────────────────────────────────────────────── */

console.log("┌─────────────────────────────────────────────┐");
console.log("│  OE · 几何标杆链自检                          │");
console.log("└─────────────────────────────────────────────┘");

/* ── ① 数据文件 ── */
section("① geometry-chain.json");

const chainFile = path.join(WEB, "public", "data", "geometry-chain.json");
check("数据文件存在", fs.existsSync(chainFile));

if (!fs.existsSync(chainFile)) {
  console.error("\n❌ 数据文件缺失，终止。");
  process.exit(1);
}

const chain = JSON.parse(fs.readFileSync(chainFile, "utf8"));

check("schemaVersion >= 3", (chain.schemaVersion ?? 0) >= 3);
check("恰好 8 节课", chain.lessons?.length === 8, `实际 ${chain.lessons?.length}`);

const EXPECTED_IDS = [
  "geo-01", "geo-02", "geo-03", "geo-04",
  "geo-05", "geo-06", "geo-07", "geo-08",
];
const actualIds = (chain.lessons ?? []).map((l) => l.id);
check(
  "课 id 齐全且有序",
  JSON.stringify(actualIds) === JSON.stringify(EXPECTED_IDS),
  actualIds.join(","),
);

/* ── ② 来源追溯 ── */
section("② 来源追溯（source_provenance）");

const ALLOWED_REPOS = new Set([
  "Khan/khan-exercises",
  "openstax/osbooks-prealgebra-bundle",
  "haojing8312/cn-k12-math-knowledge-graph",
]);

const prov = chain.sourceProvenance ?? [];
check("来源记录条数 >= 24", prov.length >= 24, `实际 ${prov.length}`);

check(
  "全部来源仓库合法且字段完整",
  prov.every((p) => ALLOWED_REPOS.has(p.repo) && p.path && p.license),
  prov
    .filter((p) => !ALLOWED_REPOS.has(p.repo) || !p.path || !p.license)
    .slice(0, 3)
    .map((p) => p.path)
    .join(", "),
);

check(
  "三份开源协议声明齐全",
  (chain.licenses ?? []).length >= 3 &&
    chain.licenses.some((l) => l.repo === "Khan/khan-exercises") &&
    chain.licenses.some((l) => l.repo === "openstax/osbooks-prealgebra-bundle") &&
    chain.licenses.some(
      (l) => l.repo === "haojing8312/cn-k12-math-knowledge-graph",
    ),
);

/* 每节课都必须引用到至少一个 Khan 练习 + 一个 OpenStax 模块 */
for (const lesson of chain.lessons ?? []) {
  const hasKhan = (lesson.sources?.khan?.length ?? 0) > 0;
  const hasOs = Boolean(lesson.sources?.openstax?.path);
  const hasCn = Boolean(lesson.sources?.cn?.path);
  check(
    `${lesson.id} 引用 Khan + OpenStax + cn-k12`,
    hasKhan && hasOs && hasCn,
  );
}

/* ── ③ 三语纯净 ── */
section("③ 三语纯净（无中英混排）");

for (const lesson of chain.lessons ?? []) {
  for (const key of ["concept", "task", "hints", "trials"]) {
    const tr = lesson[key];
    if (!tr) {
      check(`${lesson.id}.${key} 三语字段齐全`, false);
      continue;
    }
    const hasAll =
      Array.isArray(tr.zhCN) &&
      Array.isArray(tr.zhTW) &&
      Array.isArray(tr.en);
    check(`${lesson.id}.${key} 三语字段齐全`, hasAll);
    if (!hasAll) continue;

    /* 英文列不得含汉字 */
    const zhInEn = tr.en.filter((t) => hasChinese(t));
    check(
      `${lesson.id}.${key} 英文列无汉字`,
      zhInEn.length === 0,
      zhInEn.slice(0, 2).join(" | "),
    );

    /* 简体列不得含英文单词 */
    const enInZh = tr.zhCN.flatMap((t) => findEnglishInChinese(t));
    check(
      `${lesson.id}.${key} 简体列无英文`,
      enInZh.length === 0,
      [...new Set(enInZh)].slice(0, 3).join(", "),
    );

    /* 繁体列必须与简体列等长（字符级转换不会改变条数） */
    check(
      `${lesson.id}.${key} 繁体列与简体列等长`,
      tr.zhTW.length === tr.zhCN.length,
    );
  }

  /* 每课都必须有真实内容 */
  check(`${lesson.id} 有英文概念`, (lesson.concept?.en?.length ?? 0) > 0);
  check(`${lesson.id} 有英文提示`, (lesson.hints?.en?.length ?? 0) > 0);
  check(`${lesson.id} 有英文巩固题`, (lesson.trials?.en?.length ?? 0) > 0);
  check(`${lesson.id} 有中文知识点`, (lesson.concept?.zhCN?.length ?? 0) > 0);
}

/* ── ④ 源码红线 ── */
section("④ 源码红线");

const sources = collectSources(WEB);
console.log(`  （扫描 ${sources.length} 个源文件）`);

/** 在源文件里找匹配。 */
function grepSources(pattern) {
  const hits = [];
  for (const file of sources) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        hits.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          text: line.trim().slice(0, 90),
        });
      }
    });
  }
  return hits;
}

/**
 * 剥掉注释，只留**可执行代码**。
 *
 * ⛔ 为什么必须剥。
 *
 * 这份脚本里有一条红线是「全站 0 处『把砝码或控制点拖一拖』」。
 * 但这句话**恰好出现在**解释「我们把这句话删掉了」的注释里——
 * 如果不剥注释，脚本会把自己修复过程中的说明当成违规，
 * 报一个假失败。
 *
 * 判据应该是：**用户能看到的字符串里有没有它**，而不是
 * **源码里有没有它**。注释是给开发者看的，不渲染到页面上。
 */
function stripComments(text) {
  return (
    text
      /* 块注释 */
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      /* 行注释 */
      .replace(/(^|[^:])\/\/.*$/gm, (m) => m.replace(/[^\n]/g, " "))
  );
}

/** 在源文件的**可执行代码**里找匹配。 */
function grepCode(pattern) {
  const hits = [];
  for (const file of sources) {
    const text = stripComments(fs.readFileSync(file, "utf8"));
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        hits.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          text: line.trim().slice(0, 90),
        });
      }
    });
  }
  return hits;
}

/* PhET */
const phetHits = grepSources(/phet/i);
check(
  "全站 0 处 PhET 残留",
  phetHits.length === 0,
  phetHits.slice(0, 3).map((h) => `${h.file}:${h.line}`).join(", "),
);

/* next/font/google —— 注释里提及「之前用过」不算违规，
   真正的 import / 调用算违规。 */
const fontImportHits = grepSources(
  /^\s*import\s+.*from\s+["']next\/font\/google["']|next\/font\/google\(/,
);
check(
  "全站 0 处 next/font/google 实际调用",
  fontImportHits.length === 0,
  fontImportHits.slice(0, 3).map((h) => `${h.file}:${h.line}`).join(", "),
);

/* 硬编码的错误引导语——只在**可执行代码**里查 */
const badHintHits = grepCode(/把砝码或控制点拖一拖|把砝码拖一拖/);
check(
  "全站 0 处「把砝码或控制点拖一拖」硬编码",
  badHintHits.length === 0,
  badHintHits.map((h) => `${h.file}:${h.line}`).join(", "),
);

/* ── ⑤ /lab 页面结构 ── */
section("⑤ /lab 页面结构");

const labPage = fs.readFileSync(
  path.join(WEB, "app", "(workspace)", "lab", "page.tsx"),
  "utf8",
);

check(
  "/lab 右侧栏无重复的模式切换栏",
  !labPage.includes('id: "discover", no: "02"') &&
    !labPage.includes('id: "mystery", no: "03"'),
);

check(
  "LIVE CONTEXT 绑定引擎实时读数",
  labPage.includes("readings") && labPage.includes("r.value"),
);

/* ⛔ 阶段切换栏必须是**真按钮**且真的连着状态。
 *
 *    之前的版本渲染的是一排 ``<div>``——既不能点，也没有 onClick。
 *    也就是说学生**根本没法切换阶段**，三段式玩法形同虚设。
 */
const geoLabFile = path.join(WEB, "components", "lab", "GeometryLab.tsx");
check("GeometryLab.tsx 存在", fs.existsSync(geoLabFile));

if (fs.existsSync(geoLabFile)) {
  const geoLabSrc = fs.readFileSync(geoLabFile, "utf8");
  check(
    "阶段切换栏用 <button>（可点）",
    /<button[\s\S]{0,400}onClick=\{\(\) => onStageChange/.test(geoLabSrc),
  );
  check(
    "阶段切换回调已接线（onStageChange）",
    geoLabSrc.includes("onStageChange") &&
      labPage.includes("onStageChange={changeStage}"),
  );
}

/* ⛔ 星星**只能**由引擎判定点亮。
 *
 *    「切阶段就送星」和「点星星图标就送星」都是自欺欺人——
 *    学生一次都不用碰 GeoGebra 就能集齐三颗星。
 */
check(
  "切阶段不再白送星星",
  !/if \(next === "discover"\) lightStar/.test(labPage) &&
    !/if \(next === "mystery"\) lightStar/.test(labPage),
);

check(
  "星星进度是只读指示器（不可点击领星）",
  !/onClick=\{\(\) => lightStar\(/.test(labPage),
);

check(
  "星星由引擎判定点亮（handleGoalMet）",
  labPage.includes("handleGoalMet") && labPage.includes("lightStar("),
);

/* LIVE CONTEXT 段落里不能出现硬编码的拖拽引导 */
const liveStart = labPage.indexOf("Live Context");
const liveChunk =
  liveStart > 0 ? labPage.slice(liveStart, liveStart + 1400) : "";
check(
  "LIVE CONTEXT 不含硬编码拖拽提示",
  !/拖一拖|拖动.*看看/.test(liveChunk),
);

/* ── ⑥ GeoGebra 构造 ── */
section("⑥ GeoGebra 构造（8 课各自不同）");

const constructionsFile = path.join(WEB, "lib", "geometry-constructions.ts");
check("构造文件存在", fs.existsSync(constructionsFile));

if (fs.existsSync(constructionsFile)) {
  const src = fs.readFileSync(constructionsFile, "utf8");

  for (const id of EXPECTED_IDS) {
    check(`${id} 有专属构造`, src.includes(`"${id}":`));
  }

  /* 用指令序列做指纹，确认 8 课互不相同 */
  const fingerprints = new Set();
  for (const id of EXPECTED_IDS) {
    const start = src.indexOf(`"${id}": {`);
    if (start === -1) continue;
    /* 构造块以下一个同级的 "geo-xx": { 或文件末尾结束 */
    const rest = src.slice(start + 1);
    const nextIdx = rest.search(/"\s*geo-\d+"\s*:\s*\{/);
    const chunk =
      nextIdx > 0 ? src.slice(start, start + 1 + nextIdx) : src.slice(start);
    fingerprints.add(chunk);
    check(`${id} 有实时追踪量（watch）`, chunk.includes("watch:"));
    check(`${id} 有三段式过关条件（goals）`, chunk.includes("goals:"));
  }
  check(
    "8 课构造互不相同",
    fingerprints.size === EXPECTED_IDS.length,
    `唯一指纹数 ${fingerprints.size}`,
  );

  /* ── 过关条件的三条设计红线 ──
   *
   * ① 每一段都必须**要求学生真的动手**——「探索」和「规律」两段
   *    不能写成被动的不变量（那样初始状态就成立，星是白送的）。
   *    所以每一段的条件里都必须出现**「动过了吗」标志位**。
   *
   * ② 每一段的条件里必须用**小写** ``abs(...)``——GeoGebra 里
   *    没有 ``Abs(...)``，写大写会静默返回 0，学生永远拿不到星。
   *
   * ③ 条件里不能出现 GeoGebra 的**保留字**（``alt`` / ``sum`` 等）。
   */
  const RESERVED = [
    "alt", "sum", "gap", "alpha", "c1", "k", "min", "max", "angle",
    "distance", "center", "radius", "area", "factor", "ratio", "label",
    "visible", "fill", "color", "size", "text", "copy", "normal",
  ];

  for (const id of EXPECTED_IDS) {
    const start = src.indexOf(`"${id}": {`);
    if (start === -1) continue;
    const rest = src.slice(start + 1);
    const nextIdx = rest.search(/"\s*geo-\d+"\s*:\s*\{/);
    const chunk =
      nextIdx > 0 ? src.slice(start, start + 1 + nextIdx) : src.slice(start);

    /* 抽出三段目标表达式 */
    const goalExprs = [];
    for (const stage of ["explore", "discover", "mystery"]) {
      const m = new RegExp(stage + ':\\s*"([^"]*)"').exec(chunk);
      goalExprs.push({ stage, expr: m ? m[1] : "" });
    }

    /* ① 探索 / 规律 两段必须带「动过了吗」标志位 */
    for (const stage of ["explore", "discover"]) {
      const g = goalExprs.find((x) => x.stage === stage);
      const ok =
        g && g.expr !== "" && /\bmoved[A-Z]/.test(g.expr);
      check(
        `${id}/${stage} 过关条件要求「学生真的动手」`,
        Boolean(ok),
        g ? `表达式无 moved* 标志位：${g.expr}` : "缺少过关条件",
      );
    }

    /* ② 绝对值必须小写 */
    const goalChunk = goalExprs.map((g) => g.expr).join(" ");
    check(
      `${id} 过关条件用小写 abs()（大写 Abs 会静默返回 0）`,
      !/\bAbs\s*\(/.test(goalChunk),
    );

    /* ③ 不碰保留字 */
    const reservedHits = RESERVED.filter((w) =>
      new RegExp(`\\b${w}\\b`).test(goalChunk),
    );
    check(
      `${id} 过关条件未使用 GeoGebra 保留字`,
      reservedHits.length === 0,
      reservedHits.join(", "),
    );
  }

  /* 每一课都必须至少有一个「动过了吗」标志位（快照机制） */
  check(
    "8 课都用了快照机制（snapshot + movedFlag）",
    (src.match(/movedFlag\(/g) || []).length >= 8 &&
      (src.match(/snapshot\(/g) || []).length >= 8,
  );
}

/* ── ⑦ 引擎组件 ── */
section("⑦ GeoGebra 引擎组件");

const studioFile = path.join(WEB, "components", "lab", "GeoGebraStudio.tsx");
check("GeoGebraStudio.tsx 存在", fs.existsSync(studioFile));

if (fs.existsSync(studioFile)) {
  const src = fs.readFileSync(studioFile, "utf8");
  check(
    "动态加载官方 deployggb.js",
    src.includes("https://www.geogebra.org/apps/deployggb.js"),
  );
  check("注册 update 监听（双向追踪）", src.includes("registerUpdateListener"));
  check("读取引擎真实值（getValue）", src.includes("getValue"));
  check(
    "语言参数严格同步站内语言",
    src.includes("zh_CN") && src.includes("zh_TW") && src.includes('"en"'),
  );
  check("隐藏菜单栏", src.includes("showMenuBar: false"));
  check("隐藏代数输入框", src.includes("showAlgebraInput: false"));
  check("保留重置图标", src.includes("showResetIcon: true"));
  check("标签不可拖动", src.includes("enableLabelDrags: false"));
  check("边框色 #E2E8F0", src.includes("#E2E8F0"));
}

/* ── ⑧ basePath 兼容 ── */
section("⑧ GitHub Pages 子路径兼容");

const fetchHits = grepSources(/fetch\(\s*["'`]\/(?!_next)/);
const badFetch = fetchHits.filter(
  (h) => !/staticUrl|BASE_PATH|basePath/.test(h.text),
);
check(
  "无裸 fetch('/...') 路径",
  badFetch.length === 0,
  badFetch.slice(0, 3).map((h) => `${h.file}:${h.line}`).join(", "),
);

/* ── ⑨ GeoGebra 命令合法性（静态） ──
 *
 * 命令名必须真实存在于 GeoGebra 官方 ``Commands`` 枚举里。
 * 写错命令名**不会报错**，只会静默失效——所以必须静态拦下。
 */
section("⑨ GeoGebra 命令名合法性");

const ggbCmdCache = path.join(ROOT, ".geometry-cache/ggb-commands.txt");
if (fs.existsSync(ggbCmdCache)) {
  const official = new Set(
    fs
      .readFileSync(ggbCmdCache, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const builtins = new Set([
    "Abs", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan",
    "exp", "ln", "log", "floor", "ceil", "round", "min", "max",
    "mod", "sign", "sgn", "x", "y", "z", "If", "And", "Or", "Not",
    "Xor", "Element", "First", "Last", "Length", "Sum",
  ]);
  const src = fs.readFileSync(constructionsFile, "utf8");
  const bodyStart = src.indexOf("export const GEO_CONSTRUCTIONS");
  const body = src.slice(bodyStart);
  const used = new Set();
  const cmdRe = /(^|[^A-Za-z0-9_.$])([A-Z][A-Za-z0-9_]*)\s*\(/g;
  let cm;
  while ((cm = cmdRe.exec(body)) !== null) used.add(cm[2]);
  const missing = [...used].filter(
    (n) => !official.has(n) && !builtins.has(n),
  );
  check(
    `构造脚本用到的 ${used.size} 个命令全部存在于 GeoGebra 官方枚举`,
    missing.length === 0,
    missing.join(", "),
  );

  /* 已知会静默失效的错误命令——绝不能出现 */
  for (const bogus of [
    "SetSliderParameters",
    "SetFillColor",
    "SetLabelVisible",
    "ShowSlider",
    "ShowAxesOrGrid",
  ]) {
    check(
      `未使用不存在的命令 ${bogus}`,
      !body.includes(`${bogus}(`),
    );
  }

  /* SetVisibleInView 必须给 3 个参数（源码只有 case 3） */
  const badVisible = body.match(/SetVisibleInView\([^)]*\)/g) || [];
  check(
    "SetVisibleInView 全部是 3 参数形式",
    badVisible.every((c) => c.split(",").length === 3),
    badVisible.filter((c) => c.split(",").length !== 3).join(", "),
  );
} else {
  check(
    "GeoGebra 命令枚举缓存存在",
    false,
    "先运行 node scripts/verify-geogebra-commands.mjs --refresh",
  );
}

/* ── ⑩ GeoGebra 真机执行 ──
 *
 * 这一步把 8 课构造**真的塞进 GeoGebra 引擎跑一遍**：
 * 检查每个追踪量读得到值、每个过关表达式能求值、以及
 * 关键定理在数值上成立。
 *
 * 依赖 ``node-geogebra``（内置 GeoGebra Math Apps + headless
 * Chromium）。没装就跳过——它是可选的增强检查，不该卡住 CI。
 */
section("⑩ GeoGebra 真机执行（8 课构造跑通）");

let hasRuntime = true;
try {
  await import("node-geogebra");
} catch {
  hasRuntime = false;
}

if (!hasRuntime) {
  console.log("  ⏭️  跳过（未安装 node-geogebra）");
  console.log("      安装后运行：npm i node-geogebra");
} else {
  const { execFileSync } = await import("node:child_process");
  let runtimeOut = "";
  let runtimeOk = true;
  try {
    runtimeOut = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "verify-geogebra-runtime.mjs")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    runtimeOk = false;
    runtimeOut = `${err.stdout || ""}${err.stderr || ""}`;
  }
  check(
    "8 课构造在真实 GeoGebra 引擎中全部跑通",
    runtimeOk,
    runtimeOk
      ? ""
      : runtimeOut
          .split("\n")
          .filter((l) => l.includes("⛔"))
          .slice(0, 4)
          .join(" | "),
  );
}

/* ── 结果 ── */
console.log("\n" + "─".repeat(56));
if (failures.length === 0) {
  console.log(`✅ 全部通过：${passed} 项检查`);
  console.log("─".repeat(56));
  process.exit(0);
} else {
  console.log(`❌ ${failures.length} 项未通过（通过 ${passed} 项）：`);
  for (const f of failures) console.log(`   · ${f}`);
  console.log("─".repeat(56));
  process.exit(1);
}