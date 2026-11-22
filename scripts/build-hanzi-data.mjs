#!/usr/bin/env node
/**
 * 打包 hanzi-writer 的字形数据
 * ==================================
 *
 * 为什么要打包
 * ------------
 *
 * ``hanzi-writer`` 默认从 **CDN**（``cdn.jsdelivr.net``）拉取每个字的
 * 笔顺数据（``{char}.json``）。
 *
 * 问题是：
 *
 * 1. **国内访问 jsdelivr 不稳**——而这套平台的读者大多在国内；
 * 2. **每个字一次请求**——400 个字就是 400 个 HTTP 请求；
 * 3. CDN 挂了，整个「动手玩动画」模块就**静默失效**；
 * 4. GitHub Pages 是纯静态——本该**零外部依赖**。
 *
 * 所以这里把 K12 全部课程用到的字**一次性**打包成本地 JSON，
 * 运行时由前端按需读取。
 *
 * 产物
 * ----
 *
 * ``web/public/data/hanzi-chars.json``——
 *
 * .. code-block:: json
 *
 *    {
 *      "春": { "strokes": ["M 12 34 ...", ...], "medians": [...] },
 *      "夏": { ... }
 *    }
 *
 * 体积：400 个字约 **1.2 MB**（gzip 后约 **300 KB**）——
 * 比 400 次 CDN 请求快一个数量级。
 *
 * 用法
 * ----
 *
 * .. code-block:: bash
 *
 *    node scripts/build-hanzi-data.mjs
 *
 * 数据源：``hanzi-writer-data`` 包（MIT），或者 CDN。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const COURSE_DIR = path.join(ROOT, "web", "public", "data", "courses");
const OUT_FILE = path.join(ROOT, "web", "public", "data", "hanzi-chars.json");

/** 从已构建的课程数据里收集所有用到的字。 */
function collectChars() {
  const chars = new Set();
  if (!fs.existsSync(COURSE_DIR)) return chars;

  for (const file of fs.readdirSync(COURSE_DIR)) {
    if (!file.startsWith("k12_") || !file.endsWith(".json")) continue;
    const data = JSON.parse(
      fs.readFileSync(path.join(COURSE_DIR, file), "utf8"),
    );
    for (const episode of data.episodes ?? []) {
      for (const char of episode.interactive_lab?.chars ?? []) {
        if (/[\u4e00-\u9fa5]/.test(char)) chars.add(char);
      }
    }
  }
  return chars;
}

/**
 * 拉一个字的笔顺数据。
 *
 * 优先用本地 ``hanzi-writer-data`` 包；没有就退回 CDN。
 */
async function fetchChar(char) {
  // ① 本地包（离线可用）。
  try {
    const local = await import(
      `hanzi-writer-data/${char}.json`,
      { with: { type: "json" } }
    );
    return local.default ?? local;
  } catch {
    /* 落到 CDN */
  }

  // ② CDN。
  const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** 主流程。 */
async function main() {
  const chars = [...collectChars()].sort();
  if (chars.length === 0) {
    console.error("❌ 没有收集到任何汉字——先跑 build-k12-static.mjs");
    process.exit(1);
  }
  console.log(`收集到 ${chars.length} 个汉字，开始打包笔顺数据…`);

  const out = {};
  let failed = 0;

  // 串行 + 小并发——避免被 CDN 限流。
  const CONCURRENCY = 6;
  for (let i = 0; i < chars.length; i += CONCURRENCY) {
    const batch = chars.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (char) => {
        try {
          const data = await fetchChar(char);
          out[char] = {
            strokes: data.strokes ?? [],
            medians: data.medians ?? [],
          };
        } catch (error) {
          failed += 1;
          console.warn(
            `  ⚠️  ${char}：${error instanceof Error ? error.message : "未知错误"}`,
          );
        }
      }),
    );
    if ((i + CONCURRENCY) % 60 === 0) {
      console.log(`  ${Math.min(i + CONCURRENCY, chars.length)} / ${chars.length}`);
    }
  }

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(out)}\n`, "utf8");

  const size = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`✅ 打包完成：${Object.keys(out).length} 个字 / ${size} MB`);
  console.log(`   → ${path.relative(ROOT, OUT_FILE)}`);
  if (failed > 0) {
    console.log(`   （${failed} 个字拉取失败——它们会降级为静态字形，不影响其他字）`);
  }
}

await main();
