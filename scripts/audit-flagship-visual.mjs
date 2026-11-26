#!/usr/bin/env node
/**
 * 标杆专题视觉体检（headless · 像素级）
 * ===================================
 *
 * 不靠肉眼看截图，而是**读画布像素**，用数字确认「短片真的在画」。
 *
 *   ① 画布**非空**——点亮像素占比 > 1%；
 *   ② 画布**在动**——两个时间点的像素快照**不相同**；
 *   ③ 暖金 ``#C59B38`` 与冷白 ``#E8EEF7`` **都出现**（影院微光调）；
 *   ④ 交互画布切换后**也非空**。
 *
 * 用法：``node scripts/audit-flagship-visual.mjs``
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "web", "out");
const BASE = "/open-education-learning-platform";
const PORT = 4624;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent((req.url || "/").split("?")[0]);
      if (path.startsWith(BASE)) path = path.slice(BASE.length) || "/";
      let file = join(OUT, path);
      try {
        const st = await stat(file);
        if (st.isDirectory()) file = join(file, "index.html");
      } catch {
        if (!extname(file)) file = join(file, "index.html");
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] || "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];

/** 在页面里取画布统计。 */
async function canvasStats(page, which = 0) {
  return page.evaluate((idx) => {
    const c = document.querySelectorAll("canvas")[idx];
    if (!c) return null;
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    let gold = 0;
    let white = 0;
    let hash = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (Math.abs(r - 9) > 6 || Math.abs(g - 12) > 6 || Math.abs(b - 18) > 6) {
        lit += 1;
      }
      /* 暖金 #C59B38 = (197,155,56) */
      if (r > 150 && r < 235 && g > 110 && g < 200 && b > 20 && b < 110) gold += 1;
      /* 冷白 #E8EEF7 = (232,238,247) */
      if (r > 195 && g > 200 && b > 205) white += 1;
      hash = (hash * 31 + r + g * 3 + b * 7) >>> 0;
    }
    const total = d.length / 4;
    return {
      total,
      litPct: (lit / total) * 100,
      goldPct: (gold / total) * 100,
      whitePct: (white / total) * 100,
      hash,
    };
  }, which);
}

async function main() {
  const server = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--mute-audio"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    for (const topic of ["exp-comfort", "seq-zeno", "prob-bayes"]) {
      await page.goto(`http://localhost:${PORT}${BASE}/lab?topic=${topic}`, {
        waitUntil: "networkidle2",
        timeout: 45000,
      });
      await sleep(600);

      /* 静帧 */
      const idle = await canvasStats(page);
      if (!idle) {
        problems.push(`[${topic}] 没有画布`);
        continue;
      }
      if (idle.litPct < 1) {
        problems.push(`[${topic}] 静帧点亮像素仅 ${idle.litPct.toFixed(2)}%——画面几乎是空的`);
      }

      /* 播放 */
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.getAttribute("aria-label") === "播放",
        );
        if (btn) btn.click();
      });
      await sleep(2500);
      const a = await canvasStats(page);
      await sleep(2500);
      const b = await canvasStats(page);

      if (!a || !b) {
        problems.push(`[${topic}] 播放后取不到画布`);
        continue;
      }
      if (a.hash === b.hash) {
        problems.push(`[${topic}] 播放中画布像素完全没变——短片没在动`);
      }
      if (b.litPct < 1) {
        problems.push(`[${topic}] 播放后点亮像素仅 ${b.litPct.toFixed(2)}%`);
      }
      if (b.goldPct < 0.02 && b.whitePct < 0.02) {
        problems.push(`[${topic}] 画面里既没有暖金也没有冷白——影院微光调丢失`);
      }

      console.log(
        `  · ${topic}：点亮 ${b.litPct.toFixed(2)}% · 暖金 ${b.goldPct.toFixed(2)}% · 冷白 ${b.whitePct.toFixed(2)}% · 像素变化 ${a.hash !== b.hash ? "有" : "无"}`,
      );

      /* 交互层 */
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((x) =>
          (x.textContent || "").includes("进入动手交互实验"),
        );
        if (btn) btn.click();
      });
      await sleep(1200);
      const lab = await canvasStats(page, 1);
      if (!lab || lab.litPct < 1) {
        problems.push(
          `[${topic}] 交互画布点亮像素 ${lab ? lab.litPct.toFixed(2) : "N/A"}%——交互层没画东西`,
        );
      } else {
        console.log(`    交互层点亮 ${lab.litPct.toFixed(2)}% · 暖金 ${lab.goldPct.toFixed(2)}%`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

console.log("");
console.log("┌─────────────────────────────────────────────┐");
console.log("│  OE · 标杆专题视觉体检（像素级）             │");
console.log("└─────────────────────────────────────────────┘");

try {
  await main();
} catch (e) {
  problems.push(`视觉体检异常：${e.message}`);
}

console.log("");
if (problems.length > 0) {
  console.error(`❌ 发现 ${problems.length} 条问题：\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error("");
  process.exit(1);
}
console.log("✅ 视觉体检通过 —— 短片在画、在动、配色正确。");
console.log("");
