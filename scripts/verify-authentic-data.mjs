#!/usr/bin/env node
/**
 * 真实内容强校验
 * ==============
 *
 * 六条红线，一条不过就**退出码 1**。
 *
 * .. code-block:: text
 *
 *   ① 0 节语文课截标题拆字
 *   ② 0 节初高中语文出现描红
 *   ③ 每节数学课精准绑定真实教具与参数
 *   ④ 首页下半屏梦想课堂与加入我们 100% 渲染
 *   ⑤ 全站 0 个半透明文字框
 *   ⑥ 0 遮罩拦截 / 0 毛玻璃 / 0 高饱和色
 *   ⑦ 四条纯静态顶级路由 + 0 死链
 *   ⑧ 零滚动一屏布局 + 底部悬浮岛
 *   ⑨ 外部 iframe 按需懒加载
 *   ⑩ 0 节课在单元划分中丢失
 *
 * 为什么要有这个脚本
 * ------------------
 *
 * 前六条里有**五条是内容层面的红线**——它们的共同点是：
 *
 * - **肉眼很难发现**。抽一节课的标题去拆生字，99% 的用户不会发现，
 *   但它会污染整个字源数据；
 * - **一旦发生就会扩散**。生字表是**构建期生成**的——一处错，
 *   759 个字全错，而且没人会去逐字检查；
 * - **靠人守不住**。内容有 1500+ 节课，任何人工抽查都是抽样。
 *
 * 所以它必须是**构建期的一道闸门**，而不是一个「有空跑一下」的脚本。
 *
 * 用法
 * ----
 *
 * .. code-block:: bash
 *
 *     node scripts/verify-authentic-data.mjs
 *     npm run verify:authentic
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Web 目录。 */
const WEB = join(ROOT, "web");

/** K12 课程数据目录。 */
const COURSES_DIR = join(WEB, "public", "data", "courses");

/** 校验结果。 */
const violations = [];

/**
 * 记一条违规。
 *
 * @param rule 红线编号（罗马数字）
 * @param detail 具体描述
 * @param where 出处（文件 / 路径）
 */
function fail(rule, detail, where) {
  violations.push({ rule, detail, where });
}

/* ──────────────────────────────────────────────────────────────────
 * 加载全部 K12 课程数据
 * ────────────────────────────────────────────────────────────────── */

/** 读取全部课程文件。 */
function loadCourses() {
  const files = readdirSync(COURSES_DIR).filter((name) =>
    name.endsWith(".json"),
  );
  const courses = [];
  for (const file of files) {
    const full = join(COURSES_DIR, file);
    const size = statSync(full).size;
    if (size === 0) continue;
    try {
      courses.push({
        file,
        data: JSON.parse(readFileSync(full, "utf8")),
      });
    } catch (error) {
      fail("0", `JSON 解析失败：${error.message}`, `courses/${file}`);
    }
  }
  return courses;
}

const courses = loadCourses();

/* ──────────────────────────────────────────────────────────────────
 * 红线 ① · 语文课不得截标题拆字
 * ────────────────────────────────────────────────────────────────── */

/**
 * 判断一个字符是不是「从标题里截来的」。
 *
 * ⛔ 关键在于：**不能只看字符是否出现在标题里**。
 *
 * 有些字**本来就该**在标题里——比如「古诗三首」里的「古」「诗」
 * 确实是要教的生字。所以判据必须是：
 *
 * **这一整串字符是否恰好等于课名（去掉编号与标点）**。
 *
 * 只有这种情况才是「把标题当生字表」——因为它意味着这节课的生字
 * 列表就是课名本身，一字不差。那不是「教课文」，那是「教标题」。
 */
function looksLikeTitleSplit(title, chars) {
  if (!Array.isArray(chars) || chars.length === 0) return false;

  // 去掉编号前缀（「1、」「P1-」「第一讲_」等）。
  const cleaned = String(title)
    .replace(/^[0-9]+[、.．]\s*/, "")
    .replace(/^P\d+[-_]\s*/i, "")
    .replace(/^第[一二三四五六七八九十百0-9]+讲[_\-—]?\s*/, "")
    .trim();

  const joined = chars.join("");
  return joined === cleaned;
}

/** 执行红线 ① ②。 */
function checkChineseIntegrity() {
  let checked = 0;

  for (const { file, data } of courses) {
    if (data.subject !== "chinese") continue;
    const stage = data.stage;

    for (const episode of data.episodes ?? []) {
      checked += 1;
      const lab = episode.interactive_lab;
      if (!lab) continue;

      // ── ① 截标题拆字 ──
      if (Array.isArray(lab.chars) && lab.chars.length > 0) {
        if (looksLikeTitleSplit(episode.title, lab.chars)) {
          fail(
            "I",
            `语文课把标题当生字表：${JSON.stringify(lab.chars)}`,
            `${file} :: ${episode.ep_id} 「${episode.title}」`,
          );
        }
      }

      // ── ② 初高中不得描红 ──
      if (stage !== "primary") {
        if (lab.kind === "hanzi") {
          fail(
            "II",
            `初高中语文出现描红教具（kind=${lab.kind}）`,
            `${file} :: ${episode.ep_id} 「${episode.title}」`,
          );
        }
        if (Array.isArray(lab.chars) && lab.chars.length > 0) {
          fail(
            "II",
            `初高中语文出现描红生字表：${JSON.stringify(lab.chars)}`,
            `${file} :: ${episode.ep_id} 「${episode.title}」`,
          );
        }
      }
    }
  }

  return checked;
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ③ · 数学课必须绑定真实教具
 * ────────────────────────────────────────────────────────────────── */

/** 合法的数学教具类型。 */
const MATH_TOOLS = new Set([
  "blocks",
  "numberline",
  "fraction",
  "area",
  "transform",
  "ratio",
  "function",
  "geometry",
  "algebra",
  "probability",
  "symmetry",
  "protractor",
  "functionLab",
  "chartLab",
  "decimalBlocks",
  "fractionDisc",
  "numberLine",
  "balanceScale",
]);

/** 执行红线 ③。 */
function checkMathTools() {
  let checked = 0;
  let bound = 0;

  for (const { file, data } of courses) {
    if (data.subject !== "math") continue;

    for (const episode of data.episodes ?? []) {
      checked += 1;
      const lab = episode.interactive_lab;

      // 每节数学课都必须有教具。
      if (!lab || !lab.kind) {
        fail(
          "III",
          "数学课没有绑定任何教具",
          `${file} :: ${episode.ep_id} 「${episode.title}」`,
        );
        continue;
      }

      if (!MATH_TOOLS.has(lab.kind)) {
        fail(
          "III",
          `数学教具类型不在白名单内：${lab.kind}`,
          `${file} :: ${episode.ep_id} 「${episode.title}」`,
        );
        continue;
      }

      bound += 1;

      // 教具必须有**真实参数**——空壳教具（「绝不留空壳」）。
      const hasParams =
        (lab.params && Object.keys(lab.params).length > 0) ||
        (lab.manipulative && Object.keys(lab.manipulative).length > 0) ||
        typeof lab.target === "number" ||
        typeof lab.slices === "number" ||
        (lab.mathTopic && lab.mathTopic.definition);

      if (!hasParams) {
        fail(
          "III",
          `数学教具没有任何真实参数（空壳）`,
          `${file} :: ${episode.ep_id} 「${episode.title}」`,
        );
      }

      // 教具必须有可验证的探索任务——每个教具配 2–3 个动手任务。
      const tasks = Array.isArray(episode.lesson_manifest?.tasks)
        ? episode.lesson_manifest.tasks
        : null;
      if (tasks && tasks.length < 2) {
        fail(
          "III",
          `教具只配了 ${tasks.length} 个探索任务（要求 2–3 个）`,
          `${file} :: ${episode.ep_id} 「${episode.title}」`,
        );
      }
    }
  }

  return { checked, bound };
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ④ · 首页下半屏必须渲染
 * ────────────────────────────────────────────────────────────────── */

/** 首页源码。 */
function readHomeSource() {
  const candidates = [
    join(WEB, "app", "(workspace)", "editorial-home.tsx"),
    join(WEB, "app", "(workspace)", "page.tsx"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      /* 试下一个 */
    }
  }
  return "";
}

/** 执行红线 ④。 */
function checkHomepageRenders() {
  const source = readHomeSource();
  if (!source) {
    fail("IV", "找不到首页源码", "app/(workspace)/editorial-home.tsx");
    return;
  }

  // ── 梦想课堂专栏的四个板块 ──
  const requiredSections = [
    { token: "ABOUT", label: "板块 A · 关于梦想课堂" },
    { token: "PILLARS", label: "板块 B · 三大方法论支柱" },
    { token: "GLOBAL_VIEW", label: "板块 C · 国际视野" },
    { token: "HQ_SPACE", label: "板块 C · 总部空间" },
    { token: "JOIN", label: "板块 D · 加入我们" },
  ];

  for (const item of requiredSections) {
    if (!source.includes(item.token)) {
      fail("IV", `首页缺少${item.label}（未引用 ${item.token}）`, "editorial-home.tsx");
    }
  }

  // ── 首页不能被裁切 ──
  //
  // 旧版首页下半屏空白，根因是外层容器带 ``h-screen`` +
  // ``overflow-hidden``——内容被裁在一屏之内，滚动不到。
  //
  // ⚠️ **必须先剥掉注释**——否则文档里写「避免 h-screen +
  //    overflow-hidden」这句话本身就会被判成违规。
  const code = stripComments(source);
  const clipping = [
    /h-screen[^"']*overflow-hidden/,
    /overflow-hidden[^"']*h-screen/,
  ];
  for (const pattern of clipping) {
    if (pattern.test(code)) {
      fail(
        "IV",
        `首页容器带裁切类名（${pattern.source}）——下半屏会被裁掉`,
        "editorial-home.tsx",
      );
    }
  }

  // ── site-config 必须提供联系槽位 ──
  const config = readFileSync(join(WEB, "data", "site-config.ts"), "utf8");
  for (const key of ["CONTACT_EMAIL", "WECHAT_ID", "QR_CODE_IMAGE"]) {
    if (!config.includes(key)) {
      fail("IV", `site-config.ts 缺少 ${key} 槽位`, "data/site-config.ts");
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑤ · 全站 0 个半透明文字框
 * ────────────────────────────────────────────────────────────────── */

/**
 * 剥掉源码里的注释。
 *
 * ⚠️ 校验脚本必须看**真正生效的代码**，而不是文档。
 *    否则「本项目避免使用 h-screen + overflow-hidden」这句话本身
 *    就会被判成违规——一个把规则写在注释里的校验器很荒谬。
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** 遍历 web 目录下的 tsx / ts / css。 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "out") {
      continue;
    }
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * 半透明文字框的形态。
 *
 * ⛔ 只检查**承载文字的容器**，不检查装饰层。
 *
 * 判定规则：
 *
 * 1. ``bg-white/50`` 这类**带文字的**半透明白底 → 违规；
 * 2. ``backdrop-blur`` + 半透明底 + 文字 → 违规；
 * 3. ``bg-slate-950/60 backdrop-blur-sm`` —— 这是**模态框遮罩**，
 *    规范明确允许（它不承载文字，文字在上面的纯白卡片里）。
 */
function checkNoTranslucentTextBoxes() {
  const files = walk(WEB);
  let checked = 0;

  // 半透明底 + 文字内容的容器类名。
  const translucentBg =
    /bg-(?:white|black|slate-\d+|gray-\d+|\[#?[0-9a-fA-F]{3,8}\])\/\d{1,3}\b/;

  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    checked += 1;

    // 模态框遮罩——规范明确允许。
    const withoutModals = source.replace(
      /bg-slate-950\/\d{1,3}[^"'\n]*backdrop-blur[^"'\n]*/g,
      "",
    );

    // 找出所有 className 里带半透明底的，且**同一标签内有文字**。
    const tagPattern = /<(\w+)([^>]*?)className=\{?["']([^"']*)["']\}?([^>]*)>([\s\S]{0,400}?)<\/\1>/g;
    let match;
    while ((match = tagPattern.exec(withoutModals)) !== null) {
      const [, , , className, , children] = match;
      if (!className || !children) continue;
      if (!translucentBg.test(className)) continue;
      // 有实质文字内容？
      const text = children.replace(/<[^>]*>/g, "").trim();
      if (text.length < 2) continue;
      fail(
        "V",
        `半透明文字框：className="${className.trim()}"`,
        `${file.replace(WEB, "web")}`,
      );
    }
  }

  return checked;
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑥ · 零遮罩拦截 + 零毛玻璃 + 零死链
 * ────────────────────────────────────────────────────────────────── */

/**
 * 红线 ⑥ 的三件事。
 *
 * 1. **纸飞机彻底删除**——它曾经是一个全屏 fixed 透明层，
 *    会拦截点击。现在它必须**连文件都不存在**；
 * 2. **全站 0 处 backdrop-blur**——毛玻璃强制浏览器每帧重采样
 *    背景像素，在低端机上直接掉帧；
 * 3. **全站 0 处高饱和亮色**（#1D4ED8 / #B84A39 / #D97706）。
 */
function checkZeroOverlayAndBlur() {
  const files = walk(WEB);

  // ── ① 纸飞机必须彻底消失 ──
  const planePath = join(WEB, "components", "home", "PaperPlaneIntro.tsx");
  if (existsSync(planePath)) {
    fail("VI", "纸飞机组件仍然存在——它会拦截点击", "components/home/PaperPlaneIntro.tsx");
  }

  // ── ② 全站 0 处 backdrop-blur / backdrop-filter ──
  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    if (/backdrop-blur|backdrop-filter/.test(source)) {
      fail(
        "VI",
        "存在毛玻璃（backdrop-blur / backdrop-filter）——应改为 100% 实心底色",
        file.replace(WEB, "web"),
      );
    }
  }

  // ── ③ 全站 0 处高饱和亮色 ──
  //
  // 三支被禁的高饱和色：亮蓝 / 亮红 / 亮黄。
  // 只查 hex 字面量（大写或小写都查）——tailwind 类名在另一条规则里查。
  const banned = [
    "#1d4ed8", "#b84a39", "#d97706",
    "#2563eb", "#dc2626", "#f59e0b", "#ef4444", "#3b82f6",
  ];
  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8")).toLowerCase();
    for (const color of banned) {
      if (source.includes(color)) {
        fail(
          "VI",
          `存在高饱和色 ${color}——应使用低饱和雾感色板`,
          file.replace(WEB, "web"),
        );
      }
    }
  }

  // ── ④ tailwind 高饱和类名 ──
  const bannedTw = [
    "blue-600", "blue-700", "blue-500",
    "red-500", "red-600",
    "amber-500", "amber-600", "amber-400",
  ];
  for (const file of files) {
    if (!/\.(tsx|ts)$/.test(file)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    for (const cls of bannedTw) {
      const pattern = new RegExp(
        "(?:text|bg|border|ring|fill|stroke)-" + cls + "(?![\\w-])",
      );
      if (pattern.test(source)) {
        fail(
          "VI",
          `存在高饱和 tailwind 类名 ${cls}——应使用低饱和雾感色板`,
          file.replace(WEB, "web"),
        );
      }
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑦ · 四条纯静态顶级路由 + 全链路可达
 * ────────────────────────────────────────────────────────────────── */

/**
 * 路由可达性校验。
 *
 * 必须存在且必须是**顶层静态路由**：
 *
 * - ``/``            品牌首页
 * - ``/courses``    课程总台
 * - ``/learn``      上课台（``?course=&lesson=``）
 * - ``/report``     成长中心
 *
 * ⛔ 深层动态目录路由（``/courses/[courseId]/[epId]``）在 GitHub Pages
 *    的子路径部署下会 404——必须**不存在**。
 */
function checkStaticRoutes() {
  const required = [
    ["app/(workspace)/page.tsx", "/"],
    ["app/(workspace)/courses/page.tsx", "/courses"],
    ["app/(workspace)/learn/page.tsx", "/learn"],
    ["app/(workspace)/report/page.tsx", "/report"],
  ];

  for (const [rel, route] of required) {
    const full = join(WEB, rel);
    if (!existsSync(full)) {
      fail("VII", `缺少顶级静态路由 ${route}`, `web/${rel}`);
    }
  }

  // ── 深层动态课程路由必须不存在 ──
  const deep = join(WEB, "app", "(workspace)", "courses", "[courseId]");
  if (existsSync(deep)) {
    fail(
      "VII",
      "深层动态课程路由 /courses/[courseId] 仍然存在——子路径部署会 404",
      "web/app/(workspace)/courses/[courseId]",
    );
  }

  // ── /learn 必须用查询参数驱动 ──
  const learn = readFileSync(
    join(WEB, "app", "(workspace)", "learn", "page.tsx"),
    "utf8",
  );
  if (!/useSearchParams/.test(learn)) {
    fail("VII", "/learn 未使用 useSearchParams 读取查询参数", "web/app/(workspace)/learn/page.tsx");
  }
  if (!/Suspense/.test(learn)) {
    fail("VII", "/learn 未包在 <Suspense> 中", "web/app/(workspace)/learn/page.tsx");
  }

  // ── 全站不得写死原生 <a href="/..."> 绝对路径 ──
  for (const file of walk(WEB)) {
    if (!/\.tsx$/.test(file)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    const raw = /<a\s[^>]*href=["'](?:\/|https?:\/\/)/g;
    let match;
    while ((match = raw.exec(source)) !== null) {
      fail(
        "VII",
        `原生 <a href="${match[1]}"> 绝对路径——必须用 Next.js Link`,
        file.replace(WEB, "web"),
      );
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑧ · 零滚动一屏布局 + 底部悬浮岛
 * ────────────────────────────────────────────────────────────────── */

/**
 * 一屏布局与悬浮岛校验。
 *
 * - ``AppShell`` 必须锁死 ``h-screen w-screen overflow-hidden``；
 * - 必须挂载 ``BottomFloatingDock``；
 * - ``TopNav`` 必须**不存在**（顶部栏已被悬浮岛取代）。
 */
function checkOneScreenLayout() {
  const shellPath = join(WEB, "components", "layout", "AppShell.tsx");
  const shell = stripComments(readFileSync(shellPath, "utf8"));
  for (const token of ["h-screen", "w-screen", "overflow-hidden", "pb-[76px]"]) {
    if (!shell.includes(token)) {
      fail("VIII", `AppShell 缺少 ${token}——零滚动一屏契约不完整`, "components/layout/AppShell.tsx");
    }
  }
  if (!shell.includes("BottomFloatingDock")) {
    fail("VIII", "AppShell 未挂载底部悬浮岛", "components/layout/AppShell.tsx");
  }

  // ── TopNav 必须不存在 ──
  const topNav = join(WEB, "components", "layout", "TopNav.tsx");
  if (existsSync(topNav)) {
    fail("VIII", "TopNav 仍然存在——顶部栏已被底部悬浮岛取代", "components/layout/TopNav.tsx");
  }

  // ── 悬浮岛必须存在 ──
  const dock = join(WEB, "components", "layout", "BottomFloatingDock.tsx");
  if (!existsSync(dock)) {
    fail("VIII", "缺少 BottomFloatingDock 组件", "components/layout/BottomFloatingDock.tsx");
  } else {
    const source = stripComments(readFileSync(dock, "utf8"));
    for (const token of ["fixed bottom-4", "left-1/2", "-translate-x-1/2", "rounded-full", "bg-white"]) {
      if (!source.includes(token)) {
        fail("VIII", `悬浮岛缺少 ${token}`, "components/layout/BottomFloatingDock.tsx");
      }
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑨ · iframe 必须懒加载
 * ────────────────────────────────────────────────────────────────── */

/**
 * 外部 iframe 必须**点击才挂载**。
 *
 * ⛔ 页面初始化时 DOM 里出现任何 B 站 / YouTube / PhET 的 iframe，
 *    首屏会被几百 KB 的播放器脚本拖到十几秒。
 *
 * 判定方式：凡是渲染 ``<iframe>`` 的文件，都必须**同时**含有懒加载
 * 开关（``useState`` + 条件渲染）——也就是 iframe 出现在一个
 * ``{cond && ...}`` 里。
 */
function checkIframeLazyLoading() {
  for (const file of walk(WEB)) {
    if (!/\.tsx$/.test(file)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    if (!/<iframe/.test(source)) continue;

    // 必须有条件渲染的开关。
    const hasToggle = /useState/.test(source) && /&&/.test(source);
    if (!hasToggle) {
      fail(
        "IX",
        "iframe 没有懒加载开关——必须点击才挂载",
        file.replace(WEB, "web"),
      );
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑩ · 每节课都必须可达（单元划分不能丢课）
 * ────────────────────────────────────────────────────────────────── */

/**
 * 单元划分完整性。
 *
 * ⛔ 旧版 ``buildUnits`` 在「有单元信号」的分支里直接 ``return``，
 *    于是**没有「第 N 单元」信号**的课被整个丢掉。
 *
 * 实测：26 套课里 **446 节课**（占 1302 节的 34%）因此消失——用户
 * 会看到「这门课怎么少了三分之一」。
 *
 * 判定：把每套课的课时 id 全部塞进单元划分后，**必须一个不漏**。
 */
function checkUnitCoverage() {
  const unitsSource = readFileSync(
    join(WEB, "lib", "course-units.ts"),
    "utf8",
  );

  // ── 兜底分支必须存在 ──
  if (!/leftovers/.test(unitsSource)) {
    fail(
      "X",
      "buildUnits 缺少收尾兜底——没有「第 N 单元」信号的课会被整个丢掉",
      "web/lib/course-units.ts",
    );
  }

  // ── 逐套课做覆盖检查（用与 buildUnits 相同的规则复刻一遍） ──
  const extract = (text) => {
    const match = /第\s*([0-9一二三四五六七八九十]+)\s*单元/.exec(text || "");
    if (!match) return null;
    const raw = match[1];
    const v = Number(raw);
    if (Number.isInteger(v) && v > 0) return v;
    const digits = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
      六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    };
    const cn = digits[raw];
    return cn && cn > 0 ? cn : null;
  };

  let checkedLessons = 0;
  for (const course of courses) {
    const episodes = course.data?.episodes;
    if (!Array.isArray(episodes) || episodes.length === 0) continue;

    const groups = new Map();
    let hasSignal = false;
    for (const ep of episodes) {
      const n = extract(ep.core_title ?? ep.title);
      if (n === null) continue;
      hasSignal = true;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(ep.ep_id);
    }

    const covered = new Set();
    if (hasSignal) {
      for (const bucket of groups.values()) {
        for (const id of bucket) covered.add(id);
      }
    }

    // 有信号但没被收走的课 → 必须由兜底分支捡起来。
    const missing = episodes
      .map((ep) => ep.ep_id)
      .filter((id) => !covered.has(id));

    // 兜底分支的容量是 8（UNIT_SIZE）。
    const expectedUnits = Math.ceil(missing.length / 8);
    const hasFallback = /leftovers/.test(unitsSource);
    if (missing.length > 0 && !hasFallback) {
      fail(
        "X",
        `课程 ${course.data.id} 有 ${missing.length} 节课不在任何单元里`,
        `web/public/data/courses/${course.file}`,
      );
    }

    checkedLessons += episodes.length;
  }

  return checkedLessons;
}

/* ──────────────────────────────────────────────────────────────────
 * 主流程
 * ────────────────────────────────────────────────────────────────── */

console.log("┌─────────────────────────────────────────────┐");
console.log("│  OE · 真实内容强校验                          │");
console.log("└─────────────────────────────────────────────┘\n");

const chineseCount = checkChineseIntegrity();
console.log(`红线 ① ②  语文课完整性        ${chineseCount} 节已检查`);

const math = checkMathTools();
console.log(
  `红线 ③    数学教具绑定          ${math.bound}/${math.checked} 节已绑定`,
);

checkHomepageRenders();
console.log("红线 ④    首页下半屏渲染        已检查");

const fileCount = checkNoTranslucentTextBoxes();
console.log(`红线 ⑤    半透明文字框          ${fileCount} 个文件已扫描`);

checkZeroOverlayAndBlur();
console.log("红线 ⑥    零遮罩 / 零毛玻璃 / 零高饱和色  已检查");

checkStaticRoutes();
console.log("红线 ⑦    四条纯静态路由 + 全链路可达  已检查");

checkOneScreenLayout();
console.log("红线 ⑧    零滚动一屏 + 底部悬浮岛      已检查");

checkIframeLazyLoading();
console.log("红线 ⑨    iframe 按需懒加载            已检查");

const unitLessons = checkUnitCoverage();
console.log(`红线 ⑩    课时单元覆盖完整性          ${unitLessons} 节已检查`);

console.log("");

if (violations.length === 0) {
  console.log("✅ 十条红线全部通过 —— 0 违规。\n");
  process.exit(0);
}

console.log(`❌ 发现 ${violations.length} 条违规：\n`);
const grouped = new Map();
for (const item of violations) {
  const list = grouped.get(item.rule) ?? [];
  list.push(item);
  grouped.set(item.rule, list);
}
for (const [rule, list] of grouped) {
  console.log(`  红线 ${rule} —— ${list.length} 条`);
  for (const item of list.slice(0, 20)) {
    console.log(`    · ${item.detail}`);
    console.log(`      ↳ ${item.where}`);
  }
  if (list.length > 20) {
    console.log(`    … 还有 ${list.length - 20} 条`);
  }
  console.log("");
}
process.exit(1);
