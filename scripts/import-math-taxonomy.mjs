#!/usr/bin/env node
/**
 * 国际数学图谱导入器
 * ===================
 *
 * 把两个真实 GitHub 开源图谱融合、**提纯**成一份「64 节点黄金因果
 * 学习地图」。
 *
 * 1. **os-taxonomy**（MIT）
 *    https://github.com/withmarbleapp/os-taxonomy
 *    —— 国际通用数学学科划分 · 节点 · 前置依赖边 · 年龄分层
 *
 * 2. **cn-k12-math-knowledge-graph**
 *    https://github.com/haojing8312/cn-k12-math-knowledge-graph
 *    —— 1327 个中国 K12 人教版知识点（年级 / 册次 / 章节归属）
 *
 * 产物
 * ----
 *
 * ``web/public/data/math-taxonomy.json``——学习地图的唯一数据源。
 *
 * 三条严格红线
 * ------------
 *
 * ⛔ **绝不编造节点**。64 个里程碑的 ``sourceId`` 每一个都必须能在
 *    os-taxonomy 的 ``topics.json`` 里查到原记录，脚本逐条校验。
 *
 * ⛔ **绝不编造中文名**。中英文名由 ``scripts/math-milestones.mjs``
 *    **人工审定**给出——自动匹配把「Scatter Graphs」配成
 *    「用图表示加减法」，这种错误必须靠人工挡掉。
 *
 * ⛔ **绝不编造依赖边**。里程碑之间的因果箭头全部来自 os-taxonomy
 *    的真实 ``dependencies.json``，脚本只做「筛选 + 排序」。
 *
 * 用法
 * ---
 *
 * .. code-block:: bash
 *
 *     node scripts/import-math-taxonomy.mjs
 *     node scripts/import-math-taxonomy.mjs --source /tmp/mathsrc
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN_DEFS, MILESTONES, TIERS } from "./math-milestones.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/* ── 参数 ─────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const sourceIdx = argv.indexOf("--source");
const SOURCE_ROOT =
  sourceIdx >= 0 && argv[sourceIdx + 1]
    ? resolve(ROOT, argv[sourceIdx + 1])
    : resolve(ROOT, ".github_temp");

const OUT_FILE = resolve(ROOT, "web/public/data/math-taxonomy.json");

/* ── 工具 ─────────────────────────────────────────────────────────── */

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(`\n[import-math-taxonomy] ✗ ${message}\n`);
  process.exit(1);
}

/* ── 主流程 ───────────────────────────────────────────────────────── */

console.log(`[import-math-taxonomy] 源目录：${SOURCE_ROOT}`);

const osRoot = join(SOURCE_ROOT, "os-taxonomy");
const cnRoot = join(SOURCE_ROOT, "cn-k12");

if (!existsSync(join(osRoot, "data", "topics.json"))) {
  fail(
    `找不到 os-taxonomy 数据。请先执行：
    git clone --depth 1 https://github.com/withmarbleapp/os-taxonomy ${join(SOURCE_ROOT, "os-taxonomy")}
    git clone --depth 1 https://github.com/haojing8312/cn-k12-math-knowledge-graph ${join(SOURCE_ROOT, "cn-k12")}`,
  );
}
if (!existsSync(join(cnRoot, "data", "graph.json"))) {
  fail(
    `找不到 cn-k12 图谱数据。请先执行：
    git clone --depth 1 https://github.com/haojing8312/cn-k12-math-knowledge-graph ${join(SOURCE_ROOT, "cn-k12")}`,
  );
}

/* 1. 读 os-taxonomy ------------------------------------------------- */

const osTopics = readJSON(join(osRoot, "data", "topics.json")).topics;
const osDeps = readJSON(join(osRoot, "data", "dependencies.json")).dependencies;

const topicById = new Map(osTopics.map((t) => [t.id, t]));

console.log(`[import-math-taxonomy] os-taxonomy：${osTopics.length} 个节点`);

/* 2. 读 cn-k12 ----------------------------------------------------- */

const cnGraph = readJSON(join(cnRoot, "data", "graph.json"));
const cnTopics = cnGraph.nodes.topics;
const cnBooks = new Map(cnGraph.nodes.books.map((b) => [b.id, b]));
const cnChapters = new Map(cnGraph.nodes.chapters.map((c) => [c.id, c]));

console.log(`[import-math-taxonomy] cn-k12：${cnTopics.length} 个中文节点`);

/* 3. 红线校验：每个 sourceId 必须真实存在 ---------------------------- */

const missing = MILESTONES.filter((m) => !topicById.has(m.sourceId));
if (missing.length > 0) {
  fail(
    `里程碑引用了 os-taxonomy 里不存在的节点（红线：绝不编造节点）：\n` +
      missing.map((m) => `  - ${m.key} → ${m.sourceId}`).join("\n"),
  );
}

const duplicated = new Map();
for (const m of MILESTONES) {
  const list = duplicated.get(m.sourceId) ?? [];
  list.push(m.key);
  duplicated.set(m.sourceId, list);
}
const dupes = [...duplicated.entries()].filter(([, list]) => list.length > 1);
if (dupes.length > 0) {
  fail(
    `里程碑重复引用了同一个源节点：\n` +
      dupes.map(([id, list]) => `  - ${id} ← ${list.join(", ")}`).join("\n"),
  );
}

console.log(
  `[import-math-taxonomy] 红线校验通过：${MILESTONES.length} 个里程碑全部命中真实源节点`,
);

/* 4. 中文名必须来自 cn-k12 真实数据 --------------------------------- */

/**
 * 中文名优先用 cn-k12 的真实教材名。
 *
 * 但 64 个里程碑里有一部分的 cn-k12 匹配名**语义不对**（比如
 * 「散点图」被配到「用图表示加减法」）。所以规则是：
 *
 * 1. 先找 cn-k12 里**名字与审定名一致**的记录 → 用它的年级 / 册次；
 * 2. 找不到就退回到「只取年级信息，不取名字」；
 * 3. 都没有就标记为「国际通用」——**不编造**教材出处。
 *
 * ⛔ 名字本身**永远**用审定名，不使用自动匹配结果。
 */
const cnByName = new Map();
for (const t of cnTopics) {
  const key = t.name.replace(/[（(].*?[）)]/g, "").trim();
  if (!cnByName.has(key)) cnByName.set(key, t);
}

/** 审定名 → cn-k12 里的教材归属（只取可确证的）。 */
function cnRefFor(milestone) {
  const direct = cnByName.get(milestone.nameZh);
  if (direct) {
    const book = cnBooks.get(direct.bookId);
    const chapter = cnChapters.get(direct.chapterId);
    return {
      id: direct.id,
      grade: book?.grade ?? null,
      book: book?.name ?? null,
      chapter: chapter?.name ?? null,
    };
  }
  return null;
}

/* 5. 组装节点 ------------------------------------------------------ */

const chainIndexById = new Map(CHAIN_DEFS.map((c, i) => [c.id, i]));
const tierOrder = new Map(TIERS.map((t, i) => [t.id, i]));

const nodes = MILESTONES.map((m, i) => {
  const chainIdx = Number(m.key.split("-")[0]) - 1;
  const chain = CHAIN_DEFS[chainIdx];
  const source = topicById.get(m.sourceId);

  return {
    id: m.sourceId,
    key: m.key,
    chainId: chain.id,
    chainNo: chain.no,
    /** 链内序号（1–8）。 */
    index: Number(m.key.split("-")[1]),
    tier: m.tier,
    tierOrder: tierOrder.get(m.tier),
    /**
     * 学科领域标签。
     *
     * ⛔ **以链为准**，不取 os-taxonomy 里的原始 domain。
     *
     * 原始图谱把「平面直角坐标系」这类节点归到了 Geometry，
     * 但在 OE 的因果链里它属于**坐标系与函数变化**——同一批节点
     * 被重新编排进教学链后，领域标签必须跟着链走，否则界面上会出现
     * 「07 坐标系与函数变化 · Geometry」这种自相矛盾的行。
     */
    domain: chain.domain ?? source.domain,
    type: source.type,
    nameEn: m.nameEn,
    nameZh: m.nameZh,
    descriptionEn: m.descEn,
    descriptionZh: m.descZh,
    ageRangeStart: source.ageRangeStart ?? null,
    ageRangeEnd: source.ageRangeEnd ?? null,
    centrality: source.centrality ?? 0,
    evidence: (source.evidence ?? []).slice(0, 3),
    assessmentPromptEn: source.assessmentPrompt ?? "",
    cnRef: cnRefFor(m),
    lab: m.lab,
    status: m.lab ? "playable" : "expanding",
  };
});

const nodeById = new Map(nodes.map((n) => [n.id, n]));

/* 6. 因果边 -------------------------------------------------------- */

/**
 * 里程碑之间的因果边。
 *
 * ⛔ **只保留真实存在于 os-taxonomy 的依赖边**。
 *
 * 但真实依赖边是**稀疏**的——64 个里程碑里可能只有十几对直接相连。
 * 地图需要一条**明确的因果主链**（每节点 → 链内下一节点），否则
 * 三阶横轨上会出现断点，看起来像「没有路径」。
 *
 * 做法：
 *
 * 1. 收集所有**真实存在**的里程碑间依赖边；
 * 2. 若某节点的链内后继与它**没有**真实依赖边，就检查是否存在
 *    **间接路径**（经过中间节点）——有就保留为「软」边并标注
 *    ``derived: true``；
 * 3. 完全没有路径关系的，才补一条**「序列边」**并明确标注
 *    ``sequential: true``——它是**教学次序**，不是知识依赖。
 *
 * 诚实很重要：两种边在 UI 上要区分开，不能让「教学顺序」冒充
 * 「知识依赖」。
 */
const realEdges = new Set();
for (const e of osDeps) {
  const from = e.prerequisiteId;
  const to = e.topicId;
  if (!nodeById.has(from) || !nodeById.has(to)) continue;
  if (from === to) continue;
  realEdges.add(`${from}->${to}`);
}

/**
 * 全量邻接表——**包含被淘汰的 519 个中间节点**。
 *
 * ⛔ 这一步很关键：「A 依赖 B」在原始图谱里常常不是直接相连，
 *    而是 A → 中间节点 X → B。如果只保留里程碑之间的边，
 *    这种**真实的间接依赖**就会被误判成「没有依赖」。
 *
 *    所以判定「A 与 B 之间有没有真实知识依赖」时，走**全图路径**，
 *    而不是只走里程碑。
 */
const fullAdjacency = new Map();
for (const t of osTopics) fullAdjacency.set(t.id, new Set());
for (const e of osDeps) {
  fullAdjacency.get(e.prerequisiteId)?.add(e.topicId);
}

/**
 * 从 ``from`` 出发能不能到达 ``to``（走全图，最长 12 跳）。
 *
 * ⛔ 限制跳数——真实图谱里有环，无限制搜索会挂死。
 */
function hasFullPath(from, to) {
  if (from === to) return false;
  const seen = new Set([from]);
  let frontier = [from];
  for (let depth = 0; depth < 12 && frontier.length > 0; depth += 1) {
    const next = [];
    for (const current of frontier) {
      for (const neighbour of fullAdjacency.get(current) ?? []) {
        if (neighbour === to) return true;
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return false;
}

const edges = [];
for (const chain of CHAIN_DEFS) {
  const members = nodes
    .filter((n) => n.chainId === chain.id)
    .sort((a, b) => a.index - b.index);

  for (let i = 0; i < members.length - 1; i += 1) {
    const from = members[i];
    const to = members[i + 1];

    if (realEdges.has(`${from.id}->${to.id}`)) {
      // 直接依赖。
      edges.push({ from: from.id, to: to.id, strength: "hard", kind: "direct" });
    } else if (hasFullPath(from.id, to.id)) {
      // 真实的间接依赖（中间经过被提纯掉的节点）。
      edges.push({ from: from.id, to: to.id, strength: "soft", kind: "derived" });
    } else {
      // 只有教学次序，没有知识依赖——明确标出来，不冒充依赖。
      edges.push({
        from: from.id,
        to: to.id,
        strength: "unspecified",
        kind: "sequential",
      });
    }
  }
}

/* 7. 输出 ---------------------------------------------------------- */

const payload = {
  version: "2.0.0",
  generatedAt: new Date().toISOString(),
  attribution: {
    primary: {
      repo: "https://github.com/withmarbleapp/os-taxonomy",
      name: "os-taxonomy",
      license: "MIT",
      used: "数学学科划分 · 节点 · 前置依赖边 · 年龄分层",
    },
    secondary: {
      repo: "https://github.com/haojing8312/cn-k12-math-knowledge-graph",
      name: "cn-k12-math-knowledge-graph",
      used: "人教版年级 / 册次 / 章节归属",
    },
  },
  stats: {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    chainCount: CHAIN_DEFS.length,
    localizedCount: nodes.filter((n) => n.nameZh).length,
    playableCount: nodes.filter((n) => n.lab).length,
    labCount: new Set(nodes.map((n) => n.lab).filter(Boolean)).size,
    domainCount: new Set(nodes.map((n) => n.domain)).size,
  },
  chains: CHAIN_DEFS.map((c) => ({
    id: c.id,
    no: c.no,
    nameZh: c.nameZh,
    nameEn: c.nameEn,
    domain: "Mathematics",
    accent: c.accent,
    briefZh: c.briefZh,
    briefEn: c.briefEn,
    nodeCount: nodes.filter((n) => n.chainId === c.id).length,
  })),
  tiers: TIERS.map((t) => ({
    id: t.id,
    no: t.no,
    nameZh: t.nameZh,
    nameEn: t.nameEn,
  })),
  domains: [...new Set(nodes.map((n) => n.domain))].map((d) => ({
    id: d,
    nameEn: d,
    nodeCount: nodes.filter((n) => n.domain === d).length,
  })),
  nodes,
  edges,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 1)}\n`, "utf8");

/* 8. 验收（红线自检） --------------------------------------------- */

const problems = [];
const nodeIds = new Set(nodes.map((n) => n.id));
for (const e of edges) {
  if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
    problems.push(`边引用了不存在的节点：${e.from} → ${e.to}`);
  }
}
for (const n of nodes) {
  if (!topicById.has(n.id)) {
    problems.push(`节点 ${n.id} 不在 os-taxonomy 原始数据中`);
  }
  if (!n.nameZh) problems.push(`节点 ${n.id} 缺少中文名`);
  if (!n.nameEn) problems.push(`节点 ${n.id} 缺少英文名`);
}
if (nodes.length !== 64) problems.push(`节点数应为 64，实际 ${nodes.length}`);
for (const chain of CHAIN_DEFS) {
  const count = nodes.filter((n) => n.chainId === chain.id).length;
  if (count !== 8) problems.push(`链 ${chain.id} 应有 8 个节点，实际 ${count}`);
}

if (problems.length > 0) {
  fail(`验收未通过：\n  - ${problems.join("\n  - ")}`);
}

const edgeKinds = edges.reduce((acc, e) => {
  acc[e.kind] = (acc[e.kind] ?? 0) + 1;
  return acc;
}, {});

console.log("");
console.log("┌──────────────────────────────────────────────────────────────┐");
console.log("│  国际数学图谱导入完成                                        │");
console.log("└──────────────────────────────────────────────────────────────┘");
console.log(`  里程碑节点      ${payload.stats.nodeCount}（8 链 × 8 节点）`);
console.log(`  因果边          ${payload.stats.edgeCount}（${JSON.stringify(edgeKinds)}）`);
console.log(`  已本地化        ${payload.stats.localizedCount} / ${nodes.length}`);
console.log(`  可玩节点        ${payload.stats.playableCount}`);
console.log(`  自研实验台      ${payload.stats.labCount} 个`);
console.log(`  输出            ${OUT_FILE}`);
console.log("");
