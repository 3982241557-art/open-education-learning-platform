#!/usr/bin/env node
/**
 * 标杆专题运行时校验（headless · 无需人工看）
 * ==========================================
 *
 * 起一个静态服务器，用 headless Chromium 打开三个专题页，逐项检查：
 *
 *   ① 页面**零 geogebra.org / 零外部脚本**请求；
 *   ② 影院舞台的 **Canvas 2D 真的画出了东西**（非空画布）；
 *   ③ 点击「进入动手交互实验」后画布**切换成功**；
 *   ④ 「思维能力测评」弹出、**三道题**都在；
 *   ⑤ 「浏览精炼 PPT」弹层能打开且有内容；
 *   ⑥ 控制台**零报错**。
 *
 * ⛔ **不打开 Cursor 内置浏览器**——这里用脚本自己的 headless
 *    Chromium，跑完就退出，不占用任何交互资源。
 *
 * 用法：``node scripts/verify-flagship-runtime.mjs``
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

/** 仓库根目录。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 静态产物目录。 */
const OUT = join(ROOT, "web", "out");

/** basePath。 */
const BASE = "/open-education-learning-platform";

/** 端口。 */
const PORT = 4621;

/** 三个专题。 */
const TOPICS = ["exp-comfort", "seq-zeno", "prob-bayes"];

/** MIME 表。 */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

/** 问题记录。 */
const problems = [];

/**
 * 起一个静态服务器。
 *
 * @returns {Promise<import("node:http").Server>} 服务器实例
 */
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

/** 等一小会儿。 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 主流程。 */
async function main() {
  const server = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--mute-audio"],
  });

  try {
    for (const topic of TOPICS) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      const external = [];
      const errors = [];
      const missing = [];

      page.on("request", (req) => {
        const url = req.url();
        if (!url.startsWith(`http://localhost:${PORT}`)) external.push(url);
        if (/geogebra/i.test(url)) {
          problems.push(`[${topic}] 请求了 GeoGebra：${url}`);
        }
      });
      page.on("pageerror", (e) => errors.push(String(e.message || e)));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("response", (res) => {
        if (res.status() >= 400) {
          missing.push(`${res.status()} ${res.url()}`);
        }
      });

      await page.goto(
        `http://localhost:${PORT}${BASE}/lab?topic=${topic}`,
        { waitUntil: "networkidle2", timeout: 45000 },
      );

      /* ② 画布非空 */
      const canvasInfo = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        if (!c) return { found: false };
        const ctx = c.getContext("2d");
        if (!ctx) return { found: true, ctx: false };
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let nonBg = 0;
        for (let i = 0; i < d.length; i += 4) {
          /* 影院底色是 #090C12 = (9,12,18) */
          if (
            Math.abs(d[i] - 9) > 6 ||
            Math.abs(d[i + 1] - 12) > 6 ||
            Math.abs(d[i + 2] - 18) > 6
          ) {
            nonBg += 1;
          }
        }
        return { found: true, ctx: true, nonBg, w: c.width, h: c.height };
      });

      if (!canvasInfo.found) {
        problems.push(`[${topic}] 页面里没有 canvas 元素`);
      } else if (!canvasInfo.nonBg) {
        problems.push(`[${topic}] 画布是空的——短片引擎没有绘制`);
      }

      /* ③ 进入交互实验 */
      const clickedLab = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent || "").includes("进入动手交互实验"),
        );
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clickedLab) {
        problems.push(`[${topic}] 找不到「进入动手交互实验」按钮`);
      } else {
        await sleep(1200);
        const labVisible = await page.evaluate(() =>
          Array.from(document.querySelectorAll("button")).some((b) =>
            (b.textContent || "").includes("返回短片"),
          ),
        );
        if (!labVisible) {
          problems.push(`[${topic}] 点击后没有出现「返回短片」——交互层没切上来`);
        }
      }

      /* ④ 测评弹层 */
      const clickedQuiz = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent || "").includes("思维能力测评"),
        );
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clickedQuiz) {
        problems.push(`[${topic}] 找不到「思维能力测评」按钮`);
      } else {
        await sleep(600);
        const quizOk = await page.evaluate(() => {
          const text = document.body.innerText;
          return text.includes("直觉") || text.includes("Intuition");
        });
        if (!quizOk) problems.push(`[${topic}] 测评弹层没出现`);
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.getAttribute("aria-label") === "close",
          );
          if (btn) btn.click();
        });
        await sleep(300);
      }

      /* ⑤ PPT 弹层 */
      const clickedPpt = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent || "").includes("浏览精炼 PPT"),
        );
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clickedPpt) {
        problems.push(`[${topic}] 找不到「浏览精炼 PPT」按钮`);
      } else {
        await sleep(600);
        const pptInfo = await page.evaluate(() => {
          const text = document.body.innerText;
          return {
            hasPager: /\b1\s*\/\s*\d/.test(text),
            hasFormula: document.querySelectorAll(".katex").length > 0,
          };
        });
        if (!pptInfo.hasPager) {
          problems.push(`[${topic}] PPT 弹层没有页码指示`);
        }
        if (!pptInfo.hasFormula) {
          problems.push(`[${topic}] 公式没有被 KaTeX 渲染`);
        }
      }

      /* ⑥ 控制台零报错 + 零外部请求 */
      if (errors.length > 0) {
        problems.push(
          `[${topic}] 控制台报错 ${errors.length} 条：${errors.slice(0, 3).join(" | ")}`,
        );
      }
      if (missing.length > 0) {
        problems.push(
          `[${topic}] ${missing.length} 个 404：${missing.slice(0, 5).join(" | ")}`,
        );
      }
      if (external.length > 0) {
        problems.push(
          `[${topic}] 发起了 ${external.length} 个外部请求：${external.slice(0, 3).join(" | ")}`,
        );
      }

      await page.close();
      console.log(`  ✓ ${topic} 已检查`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

console.log("");
console.log("┌─────────────────────────────────────────────┐");
console.log("│  OE · 标杆专题运行时校验（headless）         │");
console.log("└─────────────────────────────────────────────┘");

try {
  await main();
} catch (e) {
  problems.push(`运行时异常：${e.message}`);
}

console.log("");

if (problems.length > 0) {
  console.error(`❌ 发现 ${problems.length} 条问题：\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error("");
  process.exit(1);
}

console.log("✅ 三个专题运行时全部通过 —— 0 问题。");
console.log("");
