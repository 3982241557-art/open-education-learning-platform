/**
 * 校验 GeoGebra 构造脚本里用到的每一条命令都**真实存在**。
 *
 * ⛔ 为什么必须校验
 *
 * GeoGebra 的 ``evalCommand()`` 对**未知命令不抛错**——它只是
 * 什么也不发生。于是：
 *
 * - 滑块不出现；
 * - 颜色不生效；
 * - 角度标记不显示；
 * - 控制台**一声不吭**。
 *
 * 这种失败在界面上完全看不出原因，只能靠静态校验提前拦下。
 *
 * 本脚本的权威来源是 GeoGebra 官方仓库的 ``Commands`` 枚举：
 * ``source/shared/common/src/main/java/org/geogebra/common/kernel/
 *  commands/Commands.java``——那是 GeoGebra 里**唯一**的命令注册表，
 * 所有 ``evalCommand`` 能识别的名字都在里面。
 *
 * 用法：
 *
 *   node scripts/verify-geogebra-commands.mjs                 # 用缓存的枚举
 *   node scripts/verify-geogebra-commands.mjs --refresh        # 重新拉枚举
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSTRUCTIONS = path.join(ROOT, "web/lib/geometry-constructions.ts");
const CACHE = path.join(ROOT, ".geometry-cache/ggb-commands.txt");

const ENUM_URL =
  "https://raw.githubusercontent.com/geogebra/geogebra/main/" +
  "source/shared/common/src/main/java/org/geogebra/common/kernel/commands/Commands.java";

/* ── 官方命令枚举 ─────────────────────────────────────────── */

async function loadOfficialCommands() {
  if (!process.argv.includes("--refresh") && fs.existsSync(CACHE)) {
    return new Set(
      fs
        .readFileSync(CACHE, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  const res = await fetch(ENUM_URL);
  if (!res.ok) {
    throw new Error(`拉取 GeoGebra Commands 枚举失败：HTTP ${res.status}`);
  }
  const text = await res.text();

  /* 枚举项形如 ``Angle(TABLE_GEOMETRY),`` */
  const names = new Set();
  const re = /^\s*([A-Z][A-Za-z0-9_]*)\(/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    names.add(match[1]);
  }

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, [...names].sort().join("\n"), "utf8");
  return names;
}

/* ── 从构造脚本里抽出用到的命令名 ─────────────────────────── */

/**
 * 抽出命令名。
 *
 * 只看**调用形式** ``Name(``，跳过：
 * - GeoGebra 的**对象赋值**语法（``alpha = Angle(...)`` 里的
 *   ``alpha`` 不是命令，是标签）；
 * - 函数与变量定义。
 */
function extractCommands(source) {
  const names = new Set();
  const re = /(^|[^A-Za-z0-9_.$])([A-Z][A-Za-z0-9_]*)\s*\(/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    names.add(match[2]);
  }
  return names;
}

/* ── 主流程 ───────────────────────────────────────────────── */

const official = await loadOfficialCommands();
const source = fs.readFileSync(CONSTRUCTIONS, "utf8");

/* 只看命令区（``GEO_CONSTRUCTIONS`` 之后），跳过文件头的注释与类型定义 */
const bodyStart = source.indexOf("export const GEO_CONSTRUCTIONS");
const body = source.slice(bodyStart);

const used = extractCommands(body);

/* 这些是 GeoGebra 的**内置函数**（不是 ``Commands`` 枚举里的命令），
 * 它们在脚本命令上下文里由 ``GeoNumeric`` 的解析器处理。
 * 逐个核对过 GeoGebra 源码，属于合法用法。 */
const BUILTIN_FUNCTIONS = new Set([
  /* 数学函数 */
  "Abs",
  "sqrt",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "exp",
  "ln",
  "log",
  "floor",
  "ceil",
  "round",
  "min",
  "max",
  "mod",
  "sign",
  "sgn",
  /* 向量运算 */
  "x",
  "y",
  "z",
  /* 关系与逻辑 */
  "If",
  "And",
  "Or",
  "Not",
  "Xor",
  /* 列表 */
  "Element",
  "First",
  "Last",
  "Length",
  "Sum",
]);

const missing = [...used].filter(
  (n) => !official.has(n) && !BUILTIN_FUNCTIONS.has(n),
);

/* ── 报告 ─────────────────────────────────────────────────── */

console.log("");
console.log("┌──────────────────────────────────────────────┐");
console.log("│  OE · GeoGebra 命令合法性校验                │");
console.log("└──────────────────────────────────────────────┘");
console.log("");
console.log(`官方命令枚举（Commands.java）：${official.size} 条`);
console.log(`构造脚本用到：${used.size} 条`);
console.log("");

if (missing.length === 0) {
  console.log("✅ 全部命令名在 GeoGebra 官方枚举中真实存在。");
  console.log("");
  console.log("提醒：命令名存在 ≠ 参数个数正确。本项目所有辅助函数");
  console.log("（stroke / point / fill / slider / labelMode / showLabel）");
  console.log("的参数均已逐个对过 GeoGebra 源码的 switch(n) 分支。");
  process.exit(0);
}

console.log(`❌ 发现 ${missing.length} 条不存在的命令：`);
console.log("");
for (const name of missing) {
  console.log(`  · ${name}`);
}
console.log("");
console.log("⛔ 这些命令不会报错，只会静默失效——构造物根本不会出现。");
process.exit(1);
