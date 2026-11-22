#!/usr/bin/env node
/**
 * K12 真实内容构建脚本
 * ======================
 *
 * 为 24 套系列、1300+ 集装配**真实的**：
 *
 * - **2 道课前摸底诊断题**——直击本课前置基础或核心概念；
 * - **2–3 道课后随堂测试题**（附清晰解析）；
 * - **3 条干货本课核心总结**；
 * - **互动实验室配置**——按学段与真实知识点分派。
 *
 * 与旧版的区别
 * ------------
 *
 * 旧版所有课共用同一批模板题（「你对本课理解到哪一步了」、
 * 「区分天和无」）。那不是题库，是**占位符**。
 *
 * 这一版从四个知识库里按**课文名 / 知识点**精确匹配。匹配不到时，
 * 退到**分学段的能力题**——仍然是具体可答的，而不是自评表。
 *
 * 运行：
 *
 * .. code-block:: bash
 *
 *    node scripts/build-k12-content.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractCoreTitle,
  stageOf,
  buildChineseContent,
  buildMathContent,
} from "./k12-content-kit.mjs";
import { buildInteractiveLab } from "./k12-lab-builder.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COURSES_DIR = path.join(ROOT, "web", "public", "data", "courses");

/** 处理一个系列文件。 */
function processSeries(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  const grade = Number(data.grade) || 1;
  const subject = data.subject === "chinese" ? "chinese" : "math";
  const stage = stageOf(grade);

  const stats = {
    episodes: data.episodes.length,
    diagnostics: 0,
    quizzes: 0,
    summaries: 0,
    labs: {},
    textbook: 0,
    poem: 0,
    classic: 0,
    mathTopic: 0,
    fallback: 0,
  };

  for (const episode of data.episodes) {
    const fullTitle = episode.title ?? "";
    const coreTitle = extractCoreTitle(fullTitle);

    const built =
      subject === "chinese"
        ? buildChineseContent({ coreTitle, fullTitle, stage })
        : buildMathContent({ coreTitle, fullTitle, stage });

    episode.core_title = coreTitle;
    episode.diagnostics = built.diagnostics;
    episode.quizzes = built.quizzes;
    episode.summary = built.summary;
    episode.content_source = built.notes?.[0] ?? null;

    stats.diagnostics += built.diagnostics.length;
    stats.quizzes += built.quizzes.length;
    stats.summaries += built.summary.length;

    // 来源统计——用于验收报告。
    for (const item of built.diagnostics) {
      if (item.source === "textbook") stats.textbook += 1;
      else if (item.source === "poem") stats.poem += 1;
      else if (item.source === "classic") stats.classic += 1;
      else if (item.source === "math") stats.mathTopic += 1;
      else stats.fallback += 1;
    }

    // 互动实验室。
    const lab = buildInteractiveLab({
      subject,
      stage,
      coreTitle,
      fullTitle,
      grade,
    });
    episode.interactive_lab = lab;
    stats.labs[lab.kind] = (stats.labs[lab.kind] ?? 0) + 1;

    // 知识节点——用真实内容。
    const nodeLabel = built.diagnostics[0]?.concept ?? "核心考点";
    const nodePayload = {
      ep_id: episode.ep_id,
      timestamp: 0,
      keyword: coreTitle,
      type: "concept",
      context: built.diagnostics[0]?.explanation ?? nodeLabel,
      hint: built.diagnostics[0]?.question ?? nodeLabel,
      context_label: nodeLabel,
      origin: "knowledge-base",
    };
    if (!Array.isArray(data.interactiveNodes)) data.interactiveNodes = [];
    const existing = data.interactiveNodes.find(
      (item) => item.ep_id === episode.ep_id,
    );
    if (existing) Object.assign(existing, nodePayload);
    else data.interactiveNodes.push(nodePayload);

    // 段落导读——用真实总结的第一条。
    if (!Array.isArray(data.guidedSegments)) data.guidedSegments = [];
    const segPayload = {
      ep_id: episode.ep_id,
      timestamp: 0,
      title: coreTitle,
      content: built.summary[0] ?? `本讲主题：${coreTitle}`,
      origin: "knowledge-base",
    };
    const seg = data.guidedSegments.find(
      (item) => item.ep_id === episode.ep_id,
    );
    if (seg) Object.assign(seg, segPayload);
    else data.guidedSegments.push(segPayload);
  }

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { file: path.basename(filePath), grade, subject, stats };
}

/** 主流程。 */
function main() {
  const files = fs
    .readdirSync(COURSES_DIR)
    .filter((name) => name.startsWith("k12_") && name.endsWith(".json"))
    .sort();

  const totals = {
    series: 0,
    episodes: 0,
    diagnostics: 0,
    quizzes: 0,
    summaries: 0,
    textbook: 0,
    poem: 0,
    classic: 0,
    mathTopic: 0,
    fallback: 0,
  };
  const rows = [];

  for (const name of files) {
    const result = processSeries(path.join(COURSES_DIR, name));
    rows.push(result);
    totals.series += 1;
    totals.episodes += result.stats.episodes;
    totals.diagnostics += result.stats.diagnostics;
    totals.quizzes += result.stats.quizzes;
    totals.summaries += result.stats.summaries;
    totals.textbook += result.stats.textbook;
    totals.poem += result.stats.poem;
    totals.classic += result.stats.classic;
    totals.mathTopic += result.stats.mathTopic;
    totals.fallback += result.stats.fallback;
  }

  console.log("═".repeat(70));
  console.log("K12 真实内容构建报告");
  console.log("═".repeat(70));
  for (const row of rows) {
    const { stats } = row;
    console.log(
      `${row.file.padEnd(24)} G${String(row.grade).padStart(2)} ` +
        `集 ${String(stats.episodes).padStart(3)}  ` +
        `诊断 ${String(stats.diagnostics).padStart(4)}  ` +
        `随堂 ${String(stats.quizzes).padStart(4)}  ` +
        `总结 ${String(stats.summaries).padStart(4)}  ` +
        `实验室 ${JSON.stringify(stats.labs)}`,
    );
  }
  console.log("─".repeat(70));
  console.log(
    `合计：${totals.series} 套系列 · ${totals.episodes} 集 · ` +
      `${totals.diagnostics} 道诊断题 · ${totals.quizzes} 道随堂题 · ` +
      `${totals.summaries} 条总结`,
  );
  console.log(
    `题源分布：教材课文 ${totals.textbook} · 古诗 ${totals.poem} · ` +
      `名篇 ${totals.classic} · 数学知识点 ${totals.mathTopic} · ` +
      `学段兜底 ${totals.fallback}`,
  );
  console.log("═".repeat(70));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

