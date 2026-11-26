#!/usr/bin/env node
/**
 * 标杆专题截图（headless）
 * ========================
 *
 * 用 headless Chromium 给三个专题各截一张图，输出到
 * ``web/.screenshots/``。
 *
 * ⛔ **不打开 Cursor 内置浏览器**——脚本自带 headless Chromium，
 *    跑完就退出，不占用任何交互资源。
 *
 * 用法：``node scripts/screenshot-flagship.mjs``
 */

import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

/** 仓库根目录。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 静态产物目录。 */
const OUT = join(ROOT, "web", "out");

/** 截图输出目录。 */
const SHOTS = join(ROOT, "web", ".screenshots");

/** basePath。 */
const BASE = "/open-education-learning-platform";

/** 端口。 */
const PORT = 4622;

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

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const server = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--mute-audio"],
  });

  try {
    for (const topic of ["exp-comfort", "seq-zeno", "prob-bayes"]) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
      await page.goto(`http://localhost:${PORT}${BASE}/lab?topic=${topic}`, {
        waitUntil: "networkidle2",
        timeout: 45000,
      });
      /* 点播放，让短片跑起来再截。 */
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.getAttribute("aria-label") === "播放",
        );
        if (btn) btn.click();
      });
      await sleep(3500);
      await page.screenshot({ path: join(SHOTS, `${topic}-film.png`) });

      /* 切到交互实验。 */
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent || "").includes("进入动手交互实验"),
        );
        if (btn) btn.click();
      });
      await sleep(1500);
      await page.screenshot({ path: join(SHOTS, `${topic}-lab.png`) });
      await page.close();
      console.log(`  ✓ ${topic} 截图完成`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
console.log(`✅ 截图已输出到 web/.screenshots/`);
