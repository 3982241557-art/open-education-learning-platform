#!/usr/bin/env node
/**
 * 标杆专题自定义短片清单
 * ========================
 *
 * 扫描 ``web/public/videos/*.mp4``，生成 ``web/public/videos/manifest.json``。
 *
 * 为什么要有清单
 * --------------
 *
 * 之前是页面加载时直接 ``fetch`` 探测 ``/videos/<id>.mp4``。文件不在时
 * 浏览器会在控制台留下一条 **404 红字**——对一个号称「零故障」的
 * 平台来说很难看，而且每个专题都要多一次无谓请求。
 *
 * 有了清单，运行时只读 ``manifest.json``（**永远 200**）：
 *
 * - 清单里有这个 id → 挂上 ``src``，播你的 MP4；
 * - 清单里没有 → 压根不请求视频，直接跑内置短片引擎。
 *
 * ⛔ **零 404、零多余请求。**
 *
 * 用法：``node scripts/build-video-manifest.mjs``
 */

import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 视频目录。 */
const VIDEOS_DIR = join(ROOT, "web", "public", "videos");

/** 清单路径。 */
const MANIFEST = join(VIDEOS_DIR, "manifest.json");

/** 三个标杆专题的 id——只有这三个会进清单。 */
const TOPIC_IDS = ["exp-comfort", "seq-zeno", "prob-bayes"];

/** 扫描视频目录。 */
function scan() {
  if (!existsSync(VIDEOS_DIR)) return [];
  return readdirSync(VIDEOS_DIR)
    .filter((f) => f.endsWith(".mp4"))
    .filter((f) => {
      try {
        return statSync(join(VIDEOS_DIR, f)).size > 0;
      } catch {
        return false;
      }
    })
    .map((f) => f.replace(/\.mp4$/, ""))
    .filter((id) => TOPIC_IDS.includes(id));
}

const ids = scan();

writeFileSync(
  MANIFEST,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      topics: ids,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  ids.length > 0
    ? `✅ 视频清单已更新：${ids.join("、")}`
    : "✅ 视频清单已更新（当前没有自定义 MP4，运行时走内置短片引擎）。",
);
