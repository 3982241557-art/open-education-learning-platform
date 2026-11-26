#!/usr/bin/env node
/**
 * 标杆专题布局体检（headless）
 * ==========================
 *
 * 检查三件事——用数字说话，而不是靠肉眼看截图：
 *
 *   ① **零垂直滚动**：页面根元素 ``scrollHeight`` 不得超过 ``clientHeight``；
 *   ② **68 / 32 分栏**：左右两栏宽度比接近 68 : 32；
 *   ③ **84 / 16 主舞台**：短片舞台占主视区约 84%，行动条约 16%。
 *
 * 同时把关键区域的像素统计打出来（画布非空比例、亮度分布），
 * 用来确认「短片真的在动」。
 *
 * 用法：``node scripts/audit-flagship-layout.mjs``
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "web", "out");
const BASE = "/open-education-learning-platform";
const PORT = 4623;

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

async function audit(page, path, label) {
  await page.goto(`http://localhost:${PORT}${BASE}${path}`, {
    waitUntil: "networkidle2",
    timeout: 45000,
  });
  await sleep(800);

  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return {
      scrollH: Math.max(de.scrollHeight, body.scrollHeight),
      clientH: de.clientHeight,
      scrollW: Math.max(de.scrollWidth, body.scrollWidth),
      clientW: de.clientWidth,
    };
  });

  const vScroll = info.scrollH - info.clientH;
  console.log(
    `  · ${label}：视口 ${info.clientW}×${info.clientH}，内容高 ${info.scrollH}，垂直溢出 ${vScroll}px`,
  );
  if (vScroll > 2) {
    problems.push(`[${label}] 页面出现 ${vScroll}px 垂直滚动——违反 100vh 零滚动契约`);
  }
  if (info.scrollW - info.clientW > 2) {
    problems.push(`[${label}] 页面出现水平溢出 ${info.scrollW - info.clientW}px`);
  }
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

    /* ① 零垂直滚动 */
    await audit(page, "/lab?topic=exp-comfort", "/lab");
    await audit(page, "/report", "/report");
    await audit(page, "/", "/");

    /* ② 68 / 32 分栏 + ③ 84 / 16 主舞台 */
    await page.goto(`http://localhost:${PORT}${BASE}/lab?topic=exp-comfort`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await sleep(600);

    const split = await page.evaluate(() => {
      const section = document.querySelector("[data-oe-lab-stage]");
      const aside = document.querySelector("[data-oe-lab-concept]");
      const stage = document.querySelector("[data-oe-lab-cinema]");
      const bar = document.querySelector("[data-oe-lab-actions]");
      if (!section || !aside || !stage || !bar) return null;
      const sw = section.getBoundingClientRect().width;
      const aw = aside.getBoundingClientRect().width;
      const st = stage.getBoundingClientRect().height;
      const ba = bar.getBoundingClientRect().height;
      return {
        left: sw,
        right: aw,
        stage: st,
        bar: ba,
        ratio: sw / (sw + aw),
        stageRatio: st / (st + ba),
      };
    });

    if (!split) {
      problems.push("[/lab] 找不到 68/32 分栏结构");
    } else {
      console.log(
        `  · /lab 分栏：左 ${Math.round(split.left)}px / 右 ${Math.round(split.right)}px = ${(split.ratio * 100).toFixed(1)}%`,
      );
      console.log(
        `  · /lab 主舞台：影片 ${Math.round(split.stage)}px / 行动条 ${Math.round(split.bar)}px = ${(split.stageRatio * 100).toFixed(1)}%`,
      );
      if (Math.abs(split.ratio - 0.68) > 0.05) {
        problems.push(`[/lab] 左栏占比 ${(split.ratio * 100).toFixed(1)}%，偏离 68% 超过 5 个百分点`);
      }
      if (Math.abs(split.stageRatio - 0.84) > 0.08) {
        problems.push(
          `[/lab] 影片区占比 ${(split.stageRatio * 100).toFixed(1)}%，偏离 84% 超过 8 个百分点`,
        );
      }
    }

    /* 画布非空比例 */
    const paint = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return null;
      const ctx = c.getContext("2d");
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (
          Math.abs(d[i] - 9) > 6 ||
          Math.abs(d[i + 1] - 12) > 6 ||
          Math.abs(d[i + 2] - 18) > 6
        ) {
          lit += 1;
        }
        if (d[i] + d[i + 1] + d[i + 2] > 330) bright += 1;
      }
      return {
        total: d.length / 4,
        litPct: (lit / (d.length / 4)) * 100,
        brightPct: (bright / (d.length / 4)) * 100,
      };
    });
    if (paint) {
      console.log(
        `  · 画布点亮像素 ${paint.litPct.toFixed(2)}%，高光像素 ${paint.brightPct.toFixed(2)}%`,
      );
      if (paint.litPct < 0.5) {
        problems.push("[/lab] 画布点亮像素不足 0.5%——短片几乎没画东西");
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

console.log("");
console.log("┌─────────────────────────────────────────────┐");
console.log("│  OE · 标杆专题布局体检                     │");
console.log("└─────────────────────────────────────────────┘");

try {
  await main();
} catch (e) {
  problems.push(`体检异常：${e.message}`);
}

console.log("");
if (problems.length > 0) {
  console.error(`❌ 发现 ${problems.length} 条问题：\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error("");
  process.exit(1);
}
console.log("✅ 布局体检通过 —— 0 问题。");
console.log("");
