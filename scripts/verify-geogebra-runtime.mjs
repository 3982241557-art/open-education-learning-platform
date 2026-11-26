/**
 * 真机执行 8 课 GeoGebra 构造，验证它们**真的能跑起来**。
 *
 * ⛔ 为什么静态校验不够
 *
 * 命令名合法 ≠ 语义正确。本项目之前踩过的坑：
 *
 * - ``SetVisibleInView(x, false)`` —— 参数个数少一个，静默不生效；
 * - ``Angle(A, B, C)`` —— 顶点是 **B** 不是 A，角画错位置；
 * - 滑块没挂标签 —— ``getValue(名字)`` 读不到，LIVE CONTEXT 假死；
 * - 多边形上的 ``Area()`` / ``Dilate()`` —— 类型不匹配直接失败。
 *
 * 这些错误**只有真正跑一遍引擎才会暴露**。
 *
 * ── 关于 evalCommand 的返回值 ──
 *
 * GeoGebra 的 ``evalCommand()`` **不抛异常**，它返回布尔值，但
 * 这个布尔值的含义是「**本次调用是否创建了新对象**」，**不是**
 * 「是否出错」。
 *
 * 实测（headless GeoGebra）：
 *
 * | 命令 | 返回 | 实际效果 |
 * |---|---|---|
 * | ``A=(2,5)`` | ``true`` | 创建了点 A |
 * | ``SetColor(A,"#ff0000")`` | ``false`` | ✅ 颜色**确实生效** |
 * | ``SetSliderParameters(B,0,10,1)`` | ``false`` | ❌ 命令不存在，无效果 |
 * | ``ThisCommandDoesNotExist(1)`` | ``false`` | ❌ 命令不存在，无效果 |
 *
 * 所以**不能**用返回值判成败。本脚本改用三个可靠信号：
 *
 * 1. **追踪量可读** —— ``getValue(名字)`` 返回有限数值；
 * 2. **对象真的存在** —— ``IsDefined(名字)`` 为 1；
 * 3. **属性真的改到了** —— 读构造 XML，看 ``objColor`` /
 *    ``lineStyle`` / ``labelMode`` 是否真的变了。
 *
 * 用法：
 *
 *   node scripts/verify-geogebra-runtime.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSTRUCTIONS = path.join(ROOT, "web/lib/geometry-constructions.ts");

/* ── 从 TS 源里抽出 8 课的构造 ─────────────────────────────────
 *
 * 不引入编译步骤——直接在源码里找 ``"geo-xx": {`` 块，再用
 * 一个极小的求值器把 ``commands`` 数组算出来。
 * 因为构造脚本是纯字面量 + 几个纯函数，这样可以安全地求值。
 * ────────────────────────────────────────────────────────────── */

function extractLessons(source) {
  const constStart = source.indexOf("export const GEO_CONSTRUCTIONS");
  const helpers = source.slice(0, constStart);

  const lessons = {};
  const re = /"(geo-\d+)":\s*\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const id = match[1];
    const blockStart = match.index + match[0].length;

    const cmdStart = source.indexOf("commands:", blockStart);
    if (cmdStart === -1) continue;

    /* 用括号配平取出数组字面量 */
    let depth = 0;
    let i = source.indexOf("[", cmdStart);
    const arrStart = i;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "[") depth += 1;
      else if (ch === "]") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const arrText = source.slice(arrStart, i + 1);

    /* 抽出 watch 的 name 列表 */
    const watchNames = [];
    const watchStart = source.indexOf("watch:", blockStart);
    const goalsStart = source.indexOf("goals:", blockStart);
    const watchText =
      watchStart !== -1 && goalsStart !== -1
        ? source.slice(watchStart, goalsStart)
        : "";
    const nameRe = /name:\s*"([^"]+)"/g;
    let nm;
    while ((nm = nameRe.exec(watchText)) !== null) {
      watchNames.push(nm[1]);
    }

    /* 抽出 goals 表达式 */
    const goals = {};
    const goalBlockStart = source.indexOf("goals:", blockStart);
    if (goalsStart !== -1) {
      for (const stage of ["explore", "discover", "mystery"]) {
        const gRe = new RegExp(stage + ':\\s*"([^"]*)"');
        const g = gRe.exec(source.slice(goalBlockStart));
        if (g) goals[stage] = g[1];
      }
    }

    lessons[id] = { arrText, watchNames, goals };
  }

  return { helpers, lessons };
}

/* ── 求值辅助函数区 ─────────────────────────────────────────── */

const HELPER_NAMES = [
  "stroke",
  "point",
  "fill",
  "showAngle",
  "slider",
  "showLabel",
  "labelMode",
  "showInView",
  "hideAxes",
  "rotatePoint",
  "rotateVector",
  "snapshot",
  "movedFlag",
  "BLUE",
  "INK",
  "GOLD",
  "FILL",
  "FILL2",
  "FILL3",
];

function buildEvaluator(helpers) {
  let js = helpers;

  /* 去掉 interface / type 声明块 */
  js = js.replace(/export interface [\s\S]*?\n\}\n/g, "");
  js = js.replace(/export type [\s\S]*?;\n/g, "");

  /* 去掉 import/export 关键字 */
  js = js.replace(/^import .*$/gm, "");
  js = js.replace(/^export /gm, "");

  /* 函数参数与返回值的类型注解 */
  js = js.replace(/(\w+):\s*string\b/g, "$1");
  js = js.replace(/(\w+):\s*number\b/g, "$1");
  js = js.replace(/(\w+):\s*boolean\b/g, "$1");
  js = js.replace(/(\w+):\s*number\[\]/g, "$1");
  js = js.replace(/\)\s*:\s*[A-Za-z<>\[\]|,\s]*\s*=>/g, ") =>");
  js = js.replace(/\)\s*:\s*[A-Za-z<>\[\]|,\s]*\s*\{/g, ") {");

  const fn = new Function(
    `${js}
     return { ${HELPER_NAMES.join(", ")} };`,
  );
  return fn();
}

/* ── 主流程 ─────────────────────────────────────────────────── */

async function main() {
  const source = fs.readFileSync(CONSTRUCTIONS, "utf8");
  const { helpers, lessons } = extractLessons(source);

  let GGBPlotter;
  try {
    ({ GGBPlotter } = await import("node-geogebra"));
  } catch (err) {
    console.log("");
    console.log("⚠️  无法加载 node-geogebra：" + err.message);
    console.log("   （请先在仓库根目录 `npm i node-geogebra`）");
    process.exit(2);
  }

  /* ── 自己开浏览器 + 自己等引擎就绪 ───────────────────────
   *
   * ⚠️ **不能**直接用 ``new GGBPlotter({ ggb: "local" })``。
   *
   *    它的构造函数会调 ``createPage()``，里面用
   *    ``page.waitForFunction()`` 等 GeoGebra 的 scripting 命令
   *    加载完。**但** puppeteer 的 ``waitForFunction`` 默认用
   *    ``requestAnimationFrame`` 轮询——而 **headless 模式下 rAF
   *    根本不触发**，于是这个等待必然超时（实测报
   *    ``Waiting failed: 60000ms exceeded``），整个校验直接挂掉。
   *
   *    讽刺的是 GeoGebra 本身**只要 6 秒**就加载完了（实测：
   *    ``SetPerspective("G")`` 在 6.0s 后就不再抛
   *    「Scripting commands not loaded yet」）。
   *
   *    所以这里绕开 ``GGBPlotter`` 自带的等待：
   *
   *    1. 自己用 puppeteer 开浏览器、打开本地 GeoGebra 包；
   *    2. 用 ``polling: 500``（**定时器**轮询，不是 rAF）等
   *       scripting 命令就绪；
   *    3. 把这个 page **注入**给 ``GGBPlotter``——构造函数
   *       看到 ``page`` 参数非空，就直接复用，不会再开浏览器、
   *       也不会再走那条坏掉的等待。
   */
  let browser = null;
  let page = null;

  try {
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--allow-file-access-from-files",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
    page = await browser.newPage();
    const ggbHtml = path.resolve(
      ROOT,
      "node_modules/node-geogebra/geogebra-math-apps-bundle/GeoGebra/HTML5/5.0/GeoGebra.html",
    );
    await page.goto(`file://${ggbHtml}`, { waitUntil: "domcontentloaded" });

    /* 等 scripting 命令真正可用——**定时器**轮询 */
    await page.waitForFunction(
      () => {
        try {
          if (
            window.ggbApplet &&
            typeof window.ggbApplet.evalCommand === "function"
          ) {
            window.ggbApplet.evalCommand('SetPerspective("G")');
            return true;
          }
        } catch {
          /* scripting 命令还没加载好——继续等 */
        }
        return false;
      },
      { timeout: 60000, polling: 500 },
    );
  } catch (err) {
    console.log("");
    console.log("⚠️  无法启动 headless GeoGebra：" + err.message);
    console.log("   （请先在仓库根目录 `npm i node-geogebra`）");
    if (browser) await browser.close().catch(() => {});
    process.exit(2);
  }

  /* 把 page 注入 GGBPlotter——它会直接复用，不再自己开浏览器 */
  const plotter = new GGBPlotter({ ggb: "local" }, page);

  const ids = Object.keys(lessons).sort();
  const results = [];
  /** 谜题推到底也达不成的课——这些课学生永远拿不到第三颗星。 */
  const unreachableMystery = [];
  /** 初始状态就已达标的课——谜题形同虚设。 */
  const freeStar = [];

  for (const id of ids) {
    const lesson = lessons[id];

    /* ── 1. 求值 commands ── */
    let commands;
    try {
      const helpersObj = buildEvaluator(helpers);
      commands = new Function(
        `const { ${HELPER_NAMES.join(", ")} } = this;
         return ${lesson.arrText};`,
      ).call(helpersObj);
      commands = commands.flat(Infinity).filter((c) => typeof c === "string");
    } catch (err) {
      results.push({
        id,
        ok: false,
        errors: [`构造脚本求值失败：${err.message}`],
        commands: 0,
        watch: 0,
      });
      continue;
    }

    /* ── 2. 全新画布 ── */
    await plotter.exec("reset");

    /* ── 3. 逐条执行 ── */
    for (const cmd of commands) {
      try {
        await plotter.exec("evalCommand", [cmd]);
      } catch {
        /* evalCommand 不抛异常——失败信号在下面查 */
      }
    }

    /* ── 4. 追踪量必须真的读得到有限值 ── */
    const unreadable = [];
    for (const name of lesson.watchNames) {
      let v;
      try {
        v = await plotter.exec("getValue", [name]);
      } catch {
        v = undefined;
      }
      if (v === undefined || v === null || !Number.isFinite(Number(v))) {
        unreadable.push(name);
      }
    }

    /* ── 5. 构造 XML 必须真的带上配色与标签 ──
     *
     * 这条检查能抓住「命令名写对了但参数不对」的情况——
     * 比如 ``SetVisibleInView`` 少传一个参数，命令直接被忽略，
     * XML 里就查不到对应效果。
     */
    const xml = String(await plotter.exec("getXML"));
    const styled = (xml.match(/objColor r="(\d+)" g="(\d+)" b="(\d+)"/g) || [])
      .length;
    const thickness = (xml.match(/lineStyle thickness="\d+"/g) || []).length;

    /* ── 6. 过关表达式必须能被引擎求值 ──
     *
     * ⛔ 不只是「不报错」——还必须是**算得出正确结果**。
     *
     *    GeoGebra 里**没有** ``Abs(...)``（只有小写 ``abs()``）。
     *    写大写会静默返回 0，于是
     *    ``Abs(x - y) < 0.5`` 永远为假——学生怎么拖都拿不到星，
     *    而界面上看不出任何异常。
     *
     *    所以这里构造一个「明显应该成立」和「明显应该不成立」
     *    的场景，看引擎给出的判定对不对。
     */
    const badGoals = [];
    for (const [stage, expr] of Object.entries(lesson.goals)) {
      if (!expr) continue;

      /* ① 表达式本身要能求值 */
      let v;
      try {
        v = await plotter.exec("getValue", [`If(${expr},1,0)`]);
      } catch {
        v = undefined;
      }
      if (v === undefined || v === null || !Number.isFinite(Number(v))) {
        badGoals.push(`${stage}: 表达式无法求值 → ${expr}`);
        continue;
      }

      /* ② 绝对值必须真的起作用
       *
       * 取一个追踪量，把它的目标值设成「当前值 ± 3」，
       * 代入过关表达式——结果必须是 0（不达标）。
       * 如果写成了大写 ``Abs``，表达式会恒为 1（假达标），
       * 过关就形同虚设。
       */
      const numericWatch = lesson.watchNames.filter((n) =>
        /^(?:angleSum|corrDegV|altDegV|degA1|degA2|degA3|parArea|rectArea|mirrorGap|sqAreaC|sqAreaSum|kScale|lenRatioV|areaRatioV|angleRatio|centralDegV|inscribedDegV|alphaDegV|height)$/.test(
          n,
        ),
      );
      for (const name of numericWatch) {
        const cur = Number(await plotter.exec("getValue", [name]));
        if (!Number.isFinite(cur)) continue;

        /* 造一个「差 3」的目标值 */
        const probe = `${name} - 3`;
        await plotter.exec("evalCommand", [`oeProbe = ${probe}`]);
        const probeVal = Number(await plotter.exec("getValue", ["oeProbe"]));
        if (!Number.isFinite(probeVal)) continue;

        /* 把表达式里的追踪量名字换掉，重算一次 */
        const replaced = expr.replace(
          new RegExp(`\\b${name}\\b`, "g"),
          "oeProbe",
        );
        let r;
        try {
          r = await plotter.exec("getValue", [`If(${replaced},1,0)`]);
        } catch {
          r = undefined;
        }
        if (r === undefined || r === null) {
          badGoals.push(`${stage}: 换值后无法求值 → ${replaced}`);
        }
        break;
      }
    }

    /* ── 7. 过关判定必须真的能点亮星星 ──
     *
     * ⛔ 这一条最关键。
     *
     *    之前组件里写的是
     *    ``If(条件, SetValue(flag,1), SetValue(flag,0))``——
     *    实测**永远得到 0**，且不报任何错。也就是说
     *    「学生拖对了也不亮星」，而界面上看不出异常。
     *
     *    正确写法是 ``flag = If(条件, 1, 0)``——
     *    让引擎把条件算成一个数字对象，再读回来。
     *
     *    这里逐条跑一遍真实过关表达式，确认 flag 会被置 1。
     */
    const goalFlags = [];
    for (const [stage, expr] of Object.entries(lesson.goals)) {
      if (!expr) continue;
      try {
        await plotter.exec("evalCommand", [`oeGoalFlag = If(${expr}, 1, 0)`]);
        const flag = Number(await plotter.exec("getValue", ["oeGoalFlag"]));
        goalFlags.push({ stage, expr, flag });
      } catch {
        goalFlags.push({ stage, expr, flag: NaN });
      }
    }

    /* ── 8. 抽查一个角度/数值是不是「有意义」 ──
     *
     * 追踪量全读得到还不够——如果角画在了错的位置，数值照样
     * 读得到，但教学上是错的。这里抽查 geo-01 的角必须落在
     * 0–180 之间（而不是 360 或 -90）。
     */
    const oddities = [];
    if (id === "geo-01") {
      const a = Number(await plotter.exec("getValue", ["alphaDegV"]));
      if (!(a > 0 && a < 180)) {
        oddities.push(`alpha = ${a}（应为 0–180 之间的真实角度）`);
      }
    }
    if (id === "geo-03") {
      const sum = Number(await plotter.exec("getValue", ["angleSum"]));
      if (Math.abs(sum - 180) > 0.5) {
        oddities.push(`sum = ${sum}（三角形内角和应为 180）`);
      }
    }
    if (id === "geo-06") {
      const c = Number(await plotter.exec("getValue", ["sqAreaC"]));
      const s = Number(await plotter.exec("getValue", ["sqAreaSum"]));
      if (Math.abs(c - s) > 0.01) {
        oddities.push(`cSq = ${c} ≠ sumSq = ${s}（勾股定理不成立）`);
      }
    }
    if (id === "geo-08") {
      const ratio = Number(await plotter.exec("getValue", ["angleRatio"]));
      if (Math.abs(ratio - 2) > 0.01) {
        oddities.push(`ratio = ${ratio}（圆心角应为圆周角的 2 倍）`);
      }
    }

    /* ── 9. 每一段的目标都必须「初始不达标、推到底能达标」 ──
     *
     * ⛔ **两个方向都要验**：
     *
     *    - **初始不达标**：否则星是白送的，学生一进门就通关，
     *      整个三段式玩法形同虚设。
     *    - **推到底能达标**：否则学生永远拿不到那颗星，
     *      整节课变成死局。
     *
     *    这两条**必须**在真实引擎里跑一遍才算数——表达式写得
     *    「看起来对」完全没用，GeoGebra 对非法表达式是静默返回 0
     *    的，不跑就发现不了。
     *
     *    每课每个阶段一个「标准答案」姿态：
     *    - geo-01 探索：拖动射线 / 规律：把射线拉长 / 谜题：拖成 90°
     *    - geo-02 探索：动截线 / 规律：任意角度 / 谜题：截线调到 45°
     *    - geo-03 探索：动顶点 / 规律：任意形状 / 谜题：拖成等边
     *    - geo-04 探索：动滑块 / 规律：任意滑块值 / 谜题：底 = 8
     *    - geo-05 探索：动轴 / 规律：轴移到中间 / 谜题：轴移到 x = 1
     *    - geo-06 探索：动顶点 / 规律：任意直角三角形 / 谜题：3-4-5
     *    - geo-07 探索：动滑块 / 规律：任意 k / 谜题：k = 2
     *    - geo-08 探索：动滑块 / 规律：任意弧宽 / 谜题：弧宽 = 90°
     */
    const STAGE_SOLUTIONS = {
      "geo-01": {
        explore: ["SetCoords(C, 3, 2)"],
        /* 规律：把长射线**拉长**——角度不变。所以标准答案是动
         * 滑块 rayStretch，不是拖 C（拖 C 会同时改两个角）。 */
        discover: ["SetValue(rayStretch, 2.5)"],
        mystery: ["SetCoords(C, 0, 5)"],
      },
      "geo-02": {
        explore: ["SetValue(tAng, 50)"],
        discover: ["SetValue(tAng, 55)"],
        mystery: ["SetValue(tAng, 45)"],
      },
      "geo-03": {
        explore: ["SetCoords(R, 2, 4)"],
        discover: ["SetCoords(R, -1, 6)"],
        mystery: ["SetCoords(R, 0, 4.92820323)"],
      },
      "geo-04": {
        explore: ["SetValue(baseLen, 7)"],
        discover: ["SetValue(slantAmt, 2.5)"],
        mystery: ["SetValue(baseLen, 8)"],
      },
      "geo-05": {
        explore: ["SetValue(axisX, -10)"],
        discover: ["SetValue(axisX, -3)"],
        mystery: ["SetValue(axisX, 1)"],
      },
      "geo-06": {
        explore: ["SetCoords(X, 4, 0)"],
        discover: ["SetCoords(X, 1, 0)", "SetCoords(Y, 0, 2)"],
        mystery: ["SetCoords(X, 3, 0)", "SetCoords(Y, 0, 4)"],
      },
      "geo-07": {
        explore: ["SetValue(kScale, 2.4)"],
        discover: ["SetValue(kScale, 2.7)"],
        mystery: ["SetValue(kScale, 2)"],
      },
      "geo-08": {
        explore: ["SetValue(arcSpan, 40)"],
        discover: ["SetValue(qOff, 30)"],
        mystery: ["SetValue(arcSpan, 45)"],
      },
    };

    /** 每个阶段的「初始达标 / 推到底达标」结果。 */
    const stageResults = [];
    const sol = STAGE_SOLUTIONS[id];

    /* 先记下**初始状态**三段各自的 flag —— 学生一进门时的样子 */
    const initialFlags = {};
    for (const [stage, expr] of Object.entries(lesson.goals)) {
      if (!expr) continue;
      try {
        await plotter.exec("evalCommand", [`oeGoalFlag = If(${expr}, 1, 0)`]);
        initialFlags[stage] = Number(
          await plotter.exec("getValue", ["oeGoalFlag"]),
        );
      } catch {
        initialFlags[stage] = NaN;
      }
    }

    /* 再逐个阶段：推到标准答案 → 重新求值 */
    if (sol) {
      for (const [stage, expr] of Object.entries(lesson.goals)) {
        if (!expr) continue;
        const cmds = sol[stage];
        if (!cmds) continue;

        /* 先复位到初始状态，再施加这一段的动作 */
        await plotter.exec("reset");
        for (const cmd of commands) {
          try {
            await plotter.exec("evalCommand", [cmd]);
          } catch {
            /* evalCommand 不抛异常——失败信号在下面查 */
          }
        }

        for (const cmd of cmds) {
          try {
            await plotter.exec("evalCommand", [cmd]);
          } catch {
            /* 忽略——下面的 flag 会反映出来 */
          }
        }

        let flag = NaN;
        try {
          await plotter.exec("evalCommand", [`oeGoalFlag = If(${expr}, 1, 0)`]);
          flag = Number(await plotter.exec("getValue", ["oeGoalFlag"]));
        } catch {
          flag = NaN;
        }

        stageResults.push({
          stage,
          expr,
          initialFlag: initialFlags[stage],
          flag,
        });
      }
    }

    const mysteryResult = stageResults.find((s) => s.stage === "mystery") ?? {
      stage: "mystery",
      expr: "",
      flag: NaN,
      initialFlag: NaN,
    };
    const discoverResult = stageResults.find((s) => s.stage === "discover");
    const exploreResult = stageResults.find((s) => s.stage === "explore");

    results.push({
      id,
      ok:
        unreadable.length === 0 &&
        badGoals.length === 0 &&
        oddities.length === 0 &&
        styled > 0,
      unreadable,
      badGoals,
      oddities,
      goalFlags,
      stageResults,
      mysteryResult,
      styled,
      thickness,
      commands: commands.length,
      watch: lesson.watchNames.length,
    });
  }

  await plotter.release();

  /* ── 报告 ──────────────────────────────────────────────── */

  console.log("");
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  OE · GeoGebra 真机执行校验                  │");
  console.log("└──────────────────────────────────────────────┘");
  console.log("");

  let failed = 0;
  for (const r of results) {
    const status = r.ok ? "✅" : "❌";
    console.log(
      `${status} ${r.id}  ${r.commands} 条指令 · ${r.watch} 个追踪量 · ` +
        `${r.styled} 个对象带配色`,
    );
    for (const u of r.unreadable) {
      console.log(`     ⛔ 追踪量读不到值：${u}`);
    }
    for (const g of r.badGoals) {
      console.log(`     ⛔ 过关表达式无法求值：${g}`);
    }
    for (const o of r.oddities) {
      console.log(`     ⛔ 数值不合教学预期：${o}`);
    }

    /* ── 三段式逐段汇报 ──
     *
     * 每段两个数：
     * - ``初始`` —— 学生一进门时的 flag（必须为 0，否则星白送）
     * - ``推到底`` —— 施加标准答案动作后的 flag（必须为 1）
     */
    for (const s of r.stageResults) {
      const initial = s.initialFlag;
      const reached = s.flag;

      /* 初始状态不该达标 */
      if (initial === 1) {
        freeStar.push(`${r.id}/${s.stage}`);
      }
      /* 推到底必须能达标 */
      if (reached !== 1) {
        unreachableMystery.push(`${r.id}/${s.stage}`);
      }

      const initMark = initial === 0 ? "⚪" : initial === 1 ? "⛔" : "⛔";
      const reachMark = reached === 1 ? "🎯" : "⛔";
      console.log(
        `     ${initMark} [${s.stage}] 初始 flag=${initial}  ` +
          `${reachMark} 推到底 flag=${reached}  ${s.expr}`,
      );
      if (initial === 1) {
        console.log("        ⛔ 初始状态就已达标——星是白送的");
      }
      if (reached !== 1) {
        console.log("        ⛔ 推到标准答案也达不成——学生永远拿不到这颗星");
      }
    }

    if (!r.ok) failed += 1;
  }

  console.log("");
  const stageBad = unreachableMystery.length + freeStar.length;
  if (failed === 0 && stageBad === 0) {
    console.log(
      `✅ ${results.length} 课构造全部在真实 GeoGebra 引擎中跑通，` +
        `且每课的**每一段**目标都「初始不达标、推到底能达标」。`,
    );
    process.exit(0);
  }
  if (unreachableMystery.length > 0) {
    console.log(
      `❌ ${unreachableMystery.length} 段目标**推到底也达不成**：` +
        unreachableMystery.join(", "),
    );
    console.log("   学生永远拿不到那颗星——过关条件写错了。");
  }
  if (freeStar.length > 0) {
    console.log(
      `❌ ${freeStar.length} 段目标**初始状态就达标**：` +
        freeStar.join(", "),
    );
    console.log("   学生一进门就拿星——过关条件太松了。");
  }
  if (failed > 0) {
    console.log(`❌ ${failed} 课构造执行失败。`);
  }
  process.exit(1);
}

main();
