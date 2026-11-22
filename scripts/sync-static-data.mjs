#!/usr/bin/env node
/**
 * 静态数据同步
 * =============
 *
 * 把 ``backend/data/`` 里**已经装配好**的数据复制到 ``web/public/data/``，
 * 让前端能在**没有 Python 后端**的情况下纯静态运行。
 *
 * 为什么需要它
 * ------------
 *
 * GitHub Pages 只能托管**静态文件**——没有 FastAPI，没有进程，没有
 * 运行时。所有数据必须**提前烘焙成 JSON**，跟着构建产物一起发出去。
 *
 * 本平台的数据恰好满足这个条件：课程大盘、GitHub 候选清单、技能库这些
 * 都是**构建期就定型**的产物，不需要实时计算。
 *
 * 什么时候跑
 * ----------
 *
 * * ``npm run build`` 之前（挂在 ``prebuild`` 上，**自动**执行）；
 * * 手动跑：``node scripts/sync-static-data.mjs``。
 *
 * 复制什么
 * --------
 *
 * ================================  ====================================
 * 源文件                             用途
 * ================================  ====================================
 * ``global_resource_hub.json``       147 门课的大盘（列表 + 详情）
 * ``github_candidates_review.json``  GitHub 开源项目审核清单
 * ``watched_channels.json``          信源池（学情中心展示）
 * ``user_profile.json``              个人档案模板（会被前端 localStorage 覆盖）
 * ``courses/``                     门类课程（含时间轴节点、导读）
 * ``skills/``                       技能库（教学风格）
 * ``translations/``                 术语翻译表
 * ================================  ====================================
 *
 * **不复制**的：
 *
 * * ``sessions/`` —— 用户对话记录，属于个人数据；
 * * ``workspaces/`` —— 本地工作区状态；
 * * ``.github_scout_cache/`` —— 检索缓存；
 * * ``github_pulled/`` —— 拉下来的仓库快照。
 *
 * 这些要么是隐私数据，要么是纯缓存——放进静态站点既没意义又不安全。
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录。 */
const ROOT = path.resolve(__dirname, "..");

/** 后端数据目录。 */
const SOURCE_DIR = path.join(ROOT, "backend", "data");

/** 前端静态数据目录。 */
const TARGET_DIR = path.join(ROOT, "web", "public", "data");

/**
 * 要复制的**单文件**。
 *
 * 格式：``[源文件名, 目标文件名]``。同名时目标可以省略。
 *
 * ⚠️ ``global_resource_hub.json`` 现在是 **K12 体系**的中台大盘——
 *    由 ``scripts/build-k12-static.mjs`` 产出（它读采集器结果，
 *    并同时写出索引 + 每套课的详情分片）。
 */
const FILES = [
  ["global_resource_hub.json", "global_resource_hub.json"],
  ["k12/k12_series.json", "k12-series-source.json"],
  ["github_candidates_review.json", "github_candidates_review.json"],
  ["watched_channels.json", "watched_channels.json"],
  ["user_profile.json", "user_profile.json"],
];

/**
 * 要复制的**目录**（整个目录树）。
 *
 * ⚠️ ``courses/`` 现在**只**装 K12 的 24 套系列详情——
 *    旧的大学公开课课程库已经整体下线。
 */
const DIRECTORIES = ["courses", "skills", "translations"];

/**
 * **已经在** ``web/public/data/`` 里、**不需要**同步的文件。
 *
 * 这些由 ``scripts/build-k12-static.mjs`` **直接**写进前端目录
 * （因为它们是**分片**的——索引 + 每套课一个文件，必须由同一个
 * 脚本一起产出，否则会有一半新一半旧）。
 */
const PREBUILT = ["k12-index.json"];

/**
 * 复制单个文件。
 *
 * @returns {boolean} 是否真的写了（内容没变则跳过）
 */
function copyFile(source, target) {
  if (!fs.existsSync(source)) {
    console.warn(`  ⚠️  源文件不存在，跳过：${path.relative(ROOT, source)}`);
    return false;
  }

  const content = fs.readFileSync(source);
  const previous = fs.existsSync(target) ? fs.readFileSync(target) : null;

  // 内容完全一样就不写——避免无谓地让构建缓存失效。
  if (previous && previous.equals(content)) {
    return false;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return true;
}

/**
 * 递归复制目录。
 *
 * @returns {{written: number, skipped: number}} 统计
 */
function copyDirectory(source, target) {
  const stats = { written: 0, skipped: 0 };
  if (!fs.existsSync(source)) {
    console.warn(`  ⚠️  源目录不存在，跳过：${path.relative(ROOT, source)}`);
    return stats;
  }

  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);

    if (entry.isDirectory()) {
      const sub = copyDirectory(from, to);
      stats.written += sub.written;
      stats.skipped += sub.skipped;
    } else if (entry.isFile()) {
      if (copyFile(from, to)) stats.written += 1;
      else stats.skipped += 1;
    }
  }

  return stats;
}

/**
 * 生成一份**索引**——告诉前端静态站点里有哪些数据可用。
 *
 * 没有索引的话，前端只能「挨个试着 fetch」，猜文件名。有了索引，
 * 前端一次就知道该读什么。
 */
function writeManifest() {
  const entries = [];

  for (const [sourceName, targetName] of FILES) {
    const target = path.join(TARGET_DIR, targetName);
    if (!fs.existsSync(target)) continue;
    const raw = fs.readFileSync(target);
    entries.push({
      key: targetName.replace(/\.json$/, ""),
      path: `/data/${targetName}`,
      bytes: raw.length,
      sha256: createHash("sha256").update(raw).digest("hex").slice(0, 16),
    });
  }

  for (const dir of DIRECTORIES) {
    const target = path.join(TARGET_DIR, dir);
    if (!fs.existsSync(target)) continue;

    const walk = (current, prefix) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(full, relative);
          continue;
        }
        if (!entry.isFile()) continue;

        // 索引里收录两类文件：
        //
        // * ``*.json`` —— 课程、技能标签等结构化数据；
        // * ``SKILL.md`` —— 技能正文（frontmatter + Markdown）。
        //
        // ⚠️ 技能正文**必须**进索引——静态模式的前端靠它列出
        // 技能清单。漏了的话，前端会以为「一个技能都没有」。
        const isJson = entry.name.endsWith(".json");
        const isSkillBody = entry.name === "SKILL.md";
        if (!isJson && !isSkillBody) continue;

        const raw = fs.readFileSync(full);
        entries.push({
          // key 是**去掉扩展名**的相对路径——
          // ``skills/socrat/SKILL.md`` → ``skills/socrat/SKILL``。
          //
          // ⚠️ 保留 ``SKILL`` 这一段是有意的：前端要靠它区分
          // 「技能正文」和「技能目录里的其它文件」。
          key: `${dir}/${relative.replace(/\.json$/, "")}`,
          path: `/data/${dir}/${relative}`,
          bytes: raw.length,
          sha256: createHash("sha256").update(raw).digest("hex").slice(0, 16),
        });
      }
    };
    walk(target, "");
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
  };

  fs.writeFileSync(
    path.join(TARGET_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

/**
 * 统计课程数量——写进日志，方便确认「站点上真的有内容」。
 */
function countCourses() {
  const hubPath = path.join(TARGET_DIR, "global_resource_hub.json");
  if (!fs.existsSync(hubPath)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(hubPath, "utf8"));
    const hub = raw.hub ?? raw;
    const categories = hub.categories ?? [];
    return categories.reduce(
      (sum, category) => sum + (category.resources?.length ?? 0),
      0,
    );
  } catch {
    return 0;
  }
}

function main() {
  console.log("静态数据同步：backend/data → web/public/data");

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(
      `❌ 找不到源目录：${SOURCE_DIR}\n` +
        "   这个脚本需要完整仓库才能运行（数据在后端目录里）。",
    );
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;

  // 单文件。
  for (const [sourceName, targetName] of FILES) {
    const changed = copyFile(
      path.join(SOURCE_DIR, sourceName),
      path.join(TARGET_DIR, targetName),
    );
    if (changed) written += 1;
    else skipped += 1;
  }

  // 目录。
  for (const dir of DIRECTORIES) {
    const stats = copyDirectory(
      path.join(SOURCE_DIR, dir),
      path.join(TARGET_DIR, dir),
    );
    written += stats.written;
    skipped += stats.skipped;
  }

  const manifest = writeManifest();
  const courses = countCourses();

  console.log(
    `✅ 完成：写入 ${written} 个，跳过 ${skipped} 个未变文件，` +
      `索引 ${manifest.entries.length} 条，课程 ${courses} 门`,
  );

  if (courses === 0) {
    console.warn(
      "⚠️  课程数为 0——静态站点会是一个空站。" +
        "请确认 backend/data/global_resource_hub.json 里有内容。",
    );
  }

  // ── K12 分片（可选）──
  //
  // ⚠️ ``web/public/data/k12-index.json`` 与 ``courses/k12_*.json``
  //    是由 ``scripts/build-k12-static.mjs`` 写的——它必须**跑在
  //    同步之后**，否则这里的 ``copyDirectory("courses")`` 会把
  //    K12 的详情文件用后端目录里的旧版本覆盖掉。
  //
  //    所以这里只做**提示**——真正的构建在 npm 的 ``prebuild`` 里。
  if (!fs.existsSync(path.join(TARGET_DIR, "k12-index.json"))) {
    console.log(
      "ℹ️  还没生成 K12 分片——运行 `npm run build:k12` " +
        "（它需要 backend/data/k12/k12_series.json）。",
    );
  }
}

main();
