#!/usr/bin/env node
/**
 * 数学图谱守卫
 * ============
 *
 * 保证 ``web/public/data/math-taxonomy.json`` **存在且完整**。
 *
 * 为什么需要它
 * ------------
 *
 * 这份 JSON 是 ``/map`` 与 ``/lab`` 的**唯一数据源**。如果它在构建时
 * 缺失，页面**不会报错**——它们会安静地渲染一个空地图，用户看到的是
 * 「这里什么都没有」。这种静默失败比崩溃难查一百倍。
 *
 * 所以这里在构建期直接**炸**。
 *
 * 缺失时怎么办
 * ------------
 *
 * 需要联网重新导入：
 *
 * .. code-block:: bash
 *
 *     git clone --depth 1 https://github.com/withmarbleapp/os-taxonomy .github_temp/os-taxonomy
 *     git clone --depth 1 https://github.com/haojing8312/cn-k12-math-knowledge-graph .github_temp/cn-k12
 *     node scripts/import-math-taxonomy.mjs
 *
 * 那条命令会把两个 GitHub 开源图谱融合成**提纯后的 64 节点黄金因果
 * 学习地图**并写盘。产物**已进版本库**，所以正常构建根本不需要联网。
 *
 * 用法
 * ----
 *
 * .. code-block:: bash
 *
 *     node scripts/ensure-math-taxonomy.mjs
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TAXONOMY_FILE = join(ROOT, "web", "public", "data", "math-taxonomy.json");

/** 低于这个大小就认为是空壳。 */
const MIN_BYTES = 20 * 1024;

/** 期望的里程碑节点数——8 链 × 8 节点。 */
const EXPECTED_NODES = 64;

/** 期望的逻辑链数。 */
const EXPECTED_CHAINS = 8;

/** 期望的自研实验台数。 */
const EXPECTED_LABS = 9;

if (!existsSync(TAXONOMY_FILE)) {
  console.error(
    "\n❌ 缺少数学图谱数据：web/public/data/math-taxonomy.json\n" +
      "\n" +
      "   /map 与 /lab 的唯一数据源不见了。请执行：\n" +
      "\n" +
      "       node scripts/import-math-taxonomy.mjs\n" +
      "\n",
  );
  process.exit(1);
}

const size = statSync(TAXONOMY_FILE).size;
if (size < MIN_BYTES) {
  console.error(
    `\n❌ 数学图谱数据过小（${size} 字节）——疑似空壳。\n` +
      `   请执行：node scripts/import-math-taxonomy.mjs\n`,
  );
  process.exit(1);
}

let taxonomy;
try {
  taxonomy = JSON.parse(readFileSync(TAXONOMY_FILE, "utf8"));
} catch (error) {
  console.error(`\n❌ 数学图谱 JSON 解析失败：${error.message}\n`);
  process.exit(1);
}

const nodeCount = taxonomy.nodes?.length ?? 0;
const chainCount = taxonomy.chains?.length ?? 0;
const labCount = new Set(
  (taxonomy.nodes ?? []).map((n) => n.lab).filter(Boolean),
).size;

const problems = [];

if (nodeCount !== EXPECTED_NODES) {
  problems.push(
    `节点数应为 ${EXPECTED_NODES}（8 链 × 8 节点），实际 ${nodeCount}`,
  );
}
if (chainCount !== EXPECTED_CHAINS) {
  problems.push(`逻辑链应为 ${EXPECTED_CHAINS} 条，实际 ${chainCount}`);
}
if (labCount !== EXPECTED_LABS) {
  problems.push(`自研实验台应为 ${EXPECTED_LABS} 个，实际 ${labCount}`);
}

/** 每条链必须恰好 8 个节点。 */
for (const chain of taxonomy.chains ?? []) {
  const count = (taxonomy.nodes ?? []).filter(
    (n) => n.chainId === chain.id,
  ).length;
  if (count !== 8) {
    problems.push(`链 ${chain.id} 应有 8 个节点，实际 ${count}`);
  }
}

/** 每个节点都必须有中英文名与实验台类型合法。 */
const VALID_LABS = new Set([
  "one-to-one-counting",
  "quantity-compare",
  "baseline-length",
  "make-ten-snap",
  "bundle-of-ten",
  "number-line-jump",
  "geometry-protractor",
  "algebra-balance",
  "function-studio",
]);

for (const node of taxonomy.nodes ?? []) {
  if (!node.nameZh) problems.push(`节点 ${node.id} 缺少中文名`);
  if (!node.nameEn) problems.push(`节点 ${node.id} 缺少英文名`);
  if (!node.descriptionZh) problems.push(`节点 ${node.id} 缺少中文说明`);
  if (!node.descriptionEn) problems.push(`节点 ${node.id} 缺少英文说明`);
  if (node.lab && !VALID_LABS.has(node.lab)) {
    problems.push(`节点 ${node.id} 挂了未知实验台 ${node.lab}`);
  }
  if (!node.tier) problems.push(`节点 ${node.id} 缺少三阶因果位置`);
}

/** ⛔ 零 PhET 红线。 */
if (taxonomy.phetBindings) {
  problems.push("图谱里还有 phetBindings 字段——必须彻底清零 PhET");
}
const serialized = JSON.stringify(taxonomy);
if (serialized.toLowerCase().includes("phet")) {
  problems.push("图谱 JSON 里还有 PhET 残留字样");
}

if (problems.length > 0) {
  console.error("\n❌ 数学图谱验收未通过：\n");
  for (const p of problems) console.error(`   - ${p}`);
  console.error(
    "\n   请执行：node scripts/import-math-taxonomy.mjs\n",
  );
  process.exit(1);
}

console.log(
  `[ensure-math-taxonomy] ✅ ${nodeCount} 里程碑节点 · ${chainCount} 链 · ` +
    `${labCount} 个自研实验台 · ${(size / 1024).toFixed(0)} KB`,
);
