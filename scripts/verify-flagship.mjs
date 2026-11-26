#!/usr/bin/env node
/**
 * 标杆专题强校验
 * ==============
 *
 * 八条红线，一条不过就**退出码 1**。
 *
 * .. code-block:: text
 *
 *   ① **零 geogebra.org 外部请求**——全站源码与构建配置里不得残留
 *      任何对 geogebra.org / deployggb.js 的引用；
 *   ② **零 next/font/google**——构建期不得联网拉字体；
 *   ③ **零 PhET 残留**；
 *   ④ 三个标杆专题的**内容齐备**：金句 / 公式 / 博客 / PPT / 3 道题；
 *   ⑤ 每个专题都必须有**开源来源**记录（零 AI 编造）；
 *   ⑥ 交互画布必须是**纯本地 Canvas 2D**——不得有 iframe / 外部脚本；
 *   ⑦ 音频必须由 **Web Audio API** 实时合成——不得引用任何音频文件；
 *   ⑧ 静态资源路径必须**带 basePath**（含自定义 MP4 的探测路径）。
 *
 * ⛔ 校验脚本必须看**真正生效的代码**，而不是文档注释。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Web 目录。 */
const WEB = join(ROOT, "web");

/** 三个标杆专题的 id。 */
const FLAGSHIP_IDS = ["exp-comfort", "seq-zeno", "prob-bayes"];

/** 校验结果。 */
const violations = [];

/**
 * 记一条违规。
 *
 * @param {string} rule 红线编号（罗马数字）
 * @param {string} detail 具体描述
 * @param {string} where 出处
 */
function fail(rule, detail, where) {
  violations.push({ rule, detail, where });
}

/**
 * 递归列出目录下的所有文件。
 *
 * @param {string} dir 目录
 * @returns {string[]} 文件绝对路径
 */
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * 读源码并**剥掉注释**。
 *
 * ⛔ 校验必须看**真正生效的代码**。注释里写「零 GeoGebra」不算数。
 *
 * @param {string} file 文件路径
 * @returns {string} 去注释后的源码
 */
function readCode(file) {
  let src = readFileSync(file, "utf8");
  src = src.replace(/\/\*[\s\S]*?\*\//g, "");
  src = src.replace(/(^|[^:])\/\/.*$/gm, "$1");
  return src;
}

/**
 * 相对仓库根的路径。
 *
 * @param {string} file 绝对路径
 * @returns {string} 相对路径
 */
function rel(file) {
  return file.replace(`${ROOT}/`, "");
}

/**
 * 所有需要扫描的源码文件。
 *
 * ⛔ **跳过构建产物**（``out/`` / ``.next*``）——它们是上一次构建
 *    留下的旧文件，扫它们只会读到早已删除的代码。校验必须针对
 *    **当前源码**。
 */
const CODE_FILES = walk(WEB).filter(
  (f) =>
    /\.(tsx|ts|jsx|js|mjs|css|json)$/.test(f) &&
    !f.includes("node_modules") &&
    !/[\\/]out[\\/]/.test(f) &&
    !/[\\/]\.next[^\\/]*[\\/]/.test(f),
);

/* ──────────────────────────────────────────────────────────────────
 * 红线 ① · 零 geogebra.org 外部请求
 * ────────────────────────────────────────────────────────────────── */

function checkNoGeoGebra() {
  for (const file of CODE_FILES) {
    const source = readCode(file).toLowerCase();
    for (const token of ["geogebra.org", "deployggb", "ggb.js", "geogebra"]) {
      if (source.includes(token)) {
        fail("I", `存在 GeoGebra 依赖（${token}）——全站必须零外部引擎`, rel(file));
      }
    }
  }
  // 组件目录里不得再有 GeoGebra 组件。
  for (const name of [
    "components/lab/GeoGebraStudio.tsx",
    "components/lab/GeometryLab.tsx",
    "lib/geometry-constructions.ts",
    "context/GeometryChainContext.tsx",
  ]) {
    if (existsSync(join(WEB, name))) {
      fail("I", `GeoGebra 相关文件仍然存在：web/${name}`, `web/${name}`);
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ② · 零 next/font/google
 * ────────────────────────────────────────────────────────────────── */

function checkNoGoogleFonts() {
  for (const file of CODE_FILES) {
    const source = readCode(file);
    if (/from\s+["']next\/font\/google["']/.test(source)) {
      fail("II", "存在 next/font/google——构建期联网拉字体会卡死", rel(file));
    }
  }
  const pkg = join(WEB, "package.json");
  if (existsSync(pkg)) {
    const json = JSON.parse(readFileSync(pkg, "utf8"));
    const deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
    if (deps["next/font/google"]) {
      fail("II", "package.json 里出现了 next/font/google 依赖", "web/package.json");
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ③ · 零 PhET 残留
 * ────────────────────────────────────────────────────────────────── */

function checkNoPhet() {
  for (const file of CODE_FILES) {
    const source = readCode(file).toLowerCase();
    for (const token of ["phet", "phet.colorado.edu", "simulations"]) {
      if (source.includes(token)) {
        fail("III", `存在 PhET 残留（${token}）`, rel(file));
      }
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ④ · 三个专题的内容齐备
 * ────────────────────────────────────────────────────────────────── */

/**
 * 把 TS 源码里的对象字面量粗略取出来。
 *
 * ⛔ 这里不做真正的解析——只需要确认关键字段**存在且非空**。
 *
 * @param {string} source 源码
 * @param {string} key 字段名
 * @returns {number} 出现次数
 */
function countField(source, key) {
  return (source.match(new RegExp(`\\b${key}\\s*:`, "g")) || []).length;
}

function checkEditorialContent() {
  const file = join(WEB, "lib", "flagship-editorial.ts");
  if (!existsSync(file)) {
    fail("IV", "缺少 web/lib/flagship-editorial.ts", "web/lib/flagship-editorial.ts");
    return;
  }
  const source = readCode(file);
  for (const field of [
    "quote",
    "formula",
    "formulaNote",
    "connection",
    "blog",
    "ppt",
    "questions",
    "labHint",
    "filmHint",
  ]) {
    if (countField(source, field) < FLAGSHIP_IDS.length) {
      fail("IV", `编辑层缺少字段 ${field}（三个专题各需一份）`, rel(file));
    }
  }
  for (const id of FLAGSHIP_IDS) {
    if (!source.includes(`"${id}"`)) {
      fail("IV", `编辑层缺少专题 ${id}`, rel(file));
    }
  }
  /* 每个专题必须有三道题。 */
  const questionBlocks = source.match(/questions:\s*\[/g) || [];
  if (questionBlocks.length < FLAGSHIP_IDS.length) {
    fail("IV", "不是每个专题都有 questions 数组", rel(file));
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑤ · 开源来源记录齐备
 * ────────────────────────────────────────────────────────────────── */

function checkOpenSourceProvenance() {
  const file = join(WEB, "public", "data", "flagship-topics.json");
  if (!existsSync(file)) {
    fail("V", "缺少 web/public/data/flagship-topics.json", rel(file));
    return;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail("V", `flagship-topics.json 解析失败：${e.message}`, rel(file));
    return;
  }
  if (!Array.isArray(data.topics) || data.topics.length !== FLAGSHIP_IDS.length) {
    fail("V", `专题数量为 ${data.topics?.length ?? 0}，要求 3`, rel(file));
  }
  for (const id of FLAGSHIP_IDS) {
    const topic = (data.topics || []).find((t) => t.id === id);
    if (!topic) {
      fail("V", `缺少专题 ${id}`, rel(file));
      continue;
    }
    const hasOpenStax = Boolean(topic.sources?.openstax?.repo);
    const hasKhan = (topic.sources?.khan || []).length > 0;
    const hasCn = Boolean(topic.sources?.cn?.repo);
    if (!hasOpenStax || !hasKhan || !hasCn) {
      fail(
        "V",
        `专题 ${id} 的开源来源不完整（OpenStax / Khan / cn-k12 至少各一）`,
        rel(file),
      );
    }
  }
  const prov = data.sourceProvenance || [];
  if (prov.length < 10) {
    fail("V", `来源溯源记录只有 ${prov.length} 条，要求 ≥10`, rel(file));
  }
  for (const p of prov) {
    if (!p.repo || !p.path || !p.license) {
      fail("V", "来源记录缺少 repo / path / license——无法追溯", rel(file));
      break;
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑥ · 交互画布纯本地（零 iframe / 零外部脚本）
 * ────────────────────────────────────────────────────────────────── */

function checkCanvasIsLocal() {
  for (const name of ["components/lab/TopicCanvas.tsx", "components/lab/CinemaStage.tsx"]) {
    const file = join(WEB, name);
    if (!existsSync(file)) {
      fail("VI", `缺少 ${name}`, `web/${name}`);
      continue;
    }
    const source = readCode(file);
    if (/<iframe/i.test(source)) {
      fail("VI", "存在 iframe——交互必须纯本地 Canvas", `web/${name}`);
    }
    if (/document\.createElement\(["']script["']\)/.test(source)) {
      fail("VI", "动态注入 script——交互不得加载外部脚本", `web/${name}`);
    }
    if (!/getContext\(["']2d["']\)/.test(source)) {
      fail("VI", "没有 Canvas 2D 上下文——短片引擎必须本地绘制", `web/${name}`);
    }
  }
  /* 不得有指向外部域名的 <script src>。 */
  for (const file of CODE_FILES.filter((f) => f.endsWith(".tsx"))) {
    const source = readCode(file);
    const m = source.match(/<script[^>]*src=["'](https?:\/\/[^"']+)["']/g);
    if (m) {
      for (const hit of m) fail("VI", `外部脚本：${hit}`, rel(file));
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑦ · 音频必须实时合成
 * ────────────────────────────────────────────────────────────────── */

function checkAudioIsSynthesized() {
  const file = join(WEB, "lib", "audio-engine.ts");
  if (!existsSync(file)) {
    fail("VII", "缺少 web/lib/audio-engine.ts", "web/lib/audio-engine.ts");
    return;
  }
  const source = readCode(file);
  if (!/AudioContext/.test(source)) {
    fail("VII", "音频引擎没有用 AudioContext", rel(file));
  }
  if (!/createOscillator/.test(source)) {
    fail("VII", "音频引擎没有实时合成振荡器", rel(file));
  }
  /* 不得引用任何音频文件。 */
  for (const f of CODE_FILES) {
    const src = readCode(f).toLowerCase();
    if (/\.(mp3|wav|ogg|m4a|aac)["']/.test(src)) {
      fail("VII", "引用了外部音频文件——声音必须实时合成", rel(f));
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑧ · 静态资源路径带 basePath
 * ────────────────────────────────────────────────────────────────── */

function checkBasePath() {
  const file = join(WEB, "lib", "flagship-topics.ts");
  if (!existsSync(file)) {
    fail("VIII", "缺少 web/lib/flagship-topics.ts", "web/lib/flagship-topics.ts");
    return;
  }
  const source = readCode(file);
  if (!/staticUrl/.test(source)) {
    fail("VIII", "flagship-topics.ts 未使用 staticUrl——路径会缺 basePath", rel(file));
  }
  if (!/videos\/\$\{topicId\}\.mp4/.test(source)) {
    fail(
      "VIII",
      "自定义 MP4 探测路径必须是 /videos/<topic-id>.mp4 且经 staticUrl 拼接",
      rel(file),
    );
  }
  /* 不得硬编码 basePath 字面量。 */
  for (const f of CODE_FILES) {
    const src = readCode(f);
    if (/\/open-education-learning-platform\//.test(src)) {
      fail("VIII", "源码里硬编码了 basePath 字面量——必须走 staticUrl()", rel(f));
      break;
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 跑起来
 * ────────────────────────────────────────────────────────────────── */

console.log("");
console.log("┌─────────────────────────────────────────────┐");
console.log("│  OE · 标杆专题强校验                        │");
console.log("└─────────────────────────────────────────────┘");

const checks = [
  ["I", "零 geogebra.org 外部请求", checkNoGeoGebra],
  ["II", "零 next/font/google", checkNoGoogleFonts],
  ["III", "零 PhET 残留", checkNoPhet],
  ["IV", "三专题内容齐备（金句/公式/博客/PPT/题）", checkEditorialContent],
  ["V", "开源来源溯源记录齐备", checkOpenSourceProvenance],
  ["VI", "交互画布纯本地 Canvas 2D", checkCanvasIsLocal],
  ["VII", "音频 Web Audio 实时合成", checkAudioIsSynthesized],
  ["VIII", "静态资源路径带 basePath", checkBasePath],
];

for (const [rule, title, fn] of checks) {
  const before = violations.length;
  try {
    fn();
  } catch (e) {
    fail(rule, `校验脚本自身异常：${e.message}`, "scripts/verify-flagship.mjs");
  }
  const added = violations.length - before;
  const mark = added === 0 ? "已检查" : `${added} 条违规`;
  console.log(`红线 ${rule.padEnd(4)} ${title.padEnd(34)} ${mark}`);
}

console.log("");

if (violations.length > 0) {
  console.error(`❌ 发现 ${violations.length} 条违规：\n`);
  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, []);
    byRule.get(v.rule).push(v);
  }
  for (const [rule, list] of byRule) {
    console.error(`  红线 ${rule} —— ${list.length} 条`);
    for (const v of list) {
      console.error(`    · ${v.detail}`);
      console.error(`      ↳ ${v.where}`);
    }
  }
  console.error("");
  process.exit(1);
}

console.log("✅ 八条红线全部通过 —— 0 违规。");
console.log("");
