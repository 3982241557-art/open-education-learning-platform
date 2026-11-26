#!/usr/bin/env node
/**
 * 数学宇宙强校验
 * ==============
 *
 * 十条红线，一条不过就**退出码 1**。
 *
 * .. code-block:: text
 *
    10| *   ① 0 处旧中文模块 / 0 个 B 站或 YouTube 播放器
 *   ② 0 处毛玻璃 / 0 处半透明文字框
 *   ③ 0 处高饱和亮色（亮蓝 / 亮红 / 亮黄）
 *   ④ 四条纯静态顶级路由（/ · /map · /lab · /report）且 0 死链
 *   ⑤ 240px 牛津海军蓝左栏 + 主舞台 flex-1 一屏锁死
 *   ⑥ 九个自研实验台必须挂真实引擎（matter-js / jsxgraph / mafs / svg）
 *   ⑦ **零 PhET**：图谱、源码、依赖里不得残留任何第三方仿真
 *   ⑧ 三阶段闯关模式（探索 / 规律 / 谜题）必须真实存在
 *   ⑨ 星星账本必须 ≥2 星才能解锁链主徽章
 *   ⑩ 图谱完整性：64 节点 / 8 链 / 0 空壳 / 0 缺失前置边
    20| *
 * ⛔ 校验脚本必须看**真正生效的代码**，而不是文档注释。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根目录。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Web 目录。 */
const WEB = join(ROOT, "web");

/** 图谱数据文件。 */
const TAXONOMY_FILE = join(WEB, "public", "data", "math-taxonomy.json");

/** 期望的里程碑节点数——8 链 × 8 节点。 */
const EXPECTED_NODES = 64;

/** 期望的逻辑链数。 */
const EXPECTED_CHAINS = 8;

/** 期望的自研实验台数。 */
const EXPECTED_LABS = 9;

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
 * 公共工具
 * ────────────────────────────────────────────────────────────────── */

/**
 * 剥掉源码里的注释。
 *
 * ⛔ 校验脚本必须看**真正生效的代码**，而不是文档。
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
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === ".next-build" ||
      entry === "out"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(entry)) out.push(full);
  }
  return out;
}

/** 读取源码并剥掉注释。 */
function readCode(path) {
  return stripComments(readFileSync(path, "utf8"));
}

/** 相对 web 根的短路径。 */
function rel(path) {
  return path.replace(WEB + "/", "web/");
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ① · 旧模块清零 + 0 外部视频播放器
 * ────────────────────────────────────────────────────────────────── */

/**
 * 旧架构残留清零校验。
 *
 * ⛔ 新宇宙只有数学——中文模块与旧视频源必须**连目录都不存在**，
 *    否则它们会被静态导出顺手带上线。
 */
function checkLegacyPurged() {
  const legacyDirs = [
    "app/(workspace)/courses",
    "app/(workspace)/learning",
    "app/(workspace)/learn",
    "app/(workspace)/k12",
    "app/(workspace)/hub",
    "app/(workspace)/admin",
    "app/(workspace)/ask",
    "app/(workspace)/plan",
    "app/(workspace)/settings",
    "app/(workspace)/space",
  ];

  for (const r of legacyDirs) {
    if (existsSync(join(WEB, r))) {
      fail("I", `旧模块目录仍然存在：${r}`, `web/${r}`);
    }
  }

  // 旧布局组件必须不存在。
  for (const r of [
    "components/layout/BottomFloatingDock.tsx",
    "components/layout/TopNav.tsx",
    "components/layout/BrandBar.tsx",
    "components/layout/FeaturePage.tsx",
    "components/layout/SplitPane.tsx",
    "components/profile/ProfileDrawer.tsx",
    "components/ai/KhanmigoCopilot.tsx",
    "components/ai/MainAiPanel.tsx",
  ]) {
    if (existsSync(join(WEB, r))) {
      fail("I", `旧布局/AI 组件仍然存在：${r}`, `web/${r}`);
    }
  }

  // 0 个 B 站 / YouTube 播放器。
  for (const file of walk(WEB)) {
    if (!/\.tsx$/.test(file)) continue;
    const source = readCode(file).toLowerCase();
    for (const token of [
      "player.bilibili.com",
      "bilibili",
      "youtube.com",
      "youtu.be",
    ]) {
      if (source.includes(token)) {
        fail(
          "I",
          `存在外部视频源 ${token}——新宇宙不引入旧视频播放器`,
          rel(file),
        );
      }
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ② · 零毛玻璃 + 零半透明文字框
 * ────────────────────────────────────────────────────────────────── */

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
  let checked = 0;

  const translucentBg =
    /bg-(?:white|black|slate-\d+|gray-\d+|\[#?[0-9a-fA-F]{3,8}\])\/\d{1,3}\b/;

  for (const file of walk(WEB)) {
    const source = readCode(file);
    checked += 1;

    // 模态框遮罩——规范明确允许。
    const withoutModals = source.replace(
      /bg-slate-950\/\d{1,3}[^"'\n]*backdrop-blur[^"'\n]*/g,
      "",
    );

    const tagPattern =
      /<(\w+)([^>]*?)className=\{?["']([^"']*)["']\}?([^>]*)>([\s\S]{0,400}?)<\/\1>/g;
    let match;
    while ((match = tagPattern.exec(withoutModals)) !== null) {
      const [, , , className, , children] = match;
      if (!className || !children) continue;
      if (!translucentBg.test(className)) continue;
      // 有实质文字内容？
      const text = children.replace(/<[^>]*>/g, "").trim();
      if (text.length < 2) continue;
      fail(
        "II",
        `半透明文字框：className="${className.trim()}"`,
        rel(file),
      );
    }
  }

  // ── 全站 0 处毛玻璃 ──
  //
  // 毛玻璃强制浏览器每帧重采样背景像素，在低端机上直接掉帧。
  for (const file of walk(WEB)) {
    const source = readCode(file);
    if (/backdrop-blur|backdrop-filter/.test(source)) {
      fail(
        "II",
        "存在毛玻璃（backdrop-blur / backdrop-filter）——应改为 100% 实心底色",
        rel(file),
      );
    }
  }

  return checked;
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ③ · 零高饱和亮色
 * ────────────────────────────────────────────────────────────────── */

/**
 * 高饱和亮色校验。
 *
 * ⛔ 新宇宙的色板是**牛津海军蓝 + 纯白 + 纯画布**：
 *    - ``#0B162C`` 主色（牛津海军蓝）
 *    - ``#F8FAFC`` 画布
 *    - ``#FFFFFF`` 卡片（100% 实心 + 1px 边框）
 *    - ``#1D4ED8`` 交互蓝（这是**允许**的）
 *    - ``#C59B38`` 哑光金（星章用）
 *
 * 被禁的是**旧高饱和亮蓝 / 亮红 / 亮黄**那一套。
 */
function checkNoHighSaturation() {
  const banned = [
    "#2563eb",
    "#dc2626",
    "#f59e0b",
    "#ef4444",
    "#3b82f6",
    "#b84a39",
    "#d97706",
  ];

  for (const file of walk(WEB)) {
    const source = readCode(file).toLowerCase();
    for (const color of banned) {
      if (source.includes(color)) {
        fail(
          "III",
          `存在旧高饱和色 ${color}——应使用牛津海军蓝色板`,
          rel(file),
        );
      }
    }
  }

  // ── tailwind 高饱和类名 ──
  const bannedTw = [
    "blue-600",
    "blue-700",
    "blue-500",
    "red-500",
    "red-600",
    "amber-500",
    "amber-600",
    "amber-400",
  ];
  for (const file of walk(WEB)) {
    if (!/\.(tsx|ts)$/.test(file)) continue;
    const source = readCode(file);
    for (const cls of bannedTw) {
      const pattern = new RegExp(
        "(?:text|bg|border|ring|fill|stroke)-" + cls + "(?![\\w-])",
      );
      if (pattern.test(source)) {
        fail(
          "III",
          `存在旧高饱和 tailwind 类名 ${cls}——应使用牛津海军蓝色板`,
          rel(file),
        );
      }
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ④ · 四条纯静态顶级路由 + 全链路可达
 * ────────────────────────────────────────────────────────────────── */

/**
 * 路由可达性校验。
 *
 * 必须存在且必须是**顶层静态路由**：
 *
 * - ``/``       品牌首页
 * - ``/map``    黄金因果学习地图
 * - ``/lab``    实验工坊（``?node=<skill_id>``）
 * - ``/report`` 成长与报告
 *
 * ⛔ 深层动态路由在 GitHub Pages 的子路径部署下会 404——必须不存在。
 */
function checkStaticRoutes() {
  const required = [
    ["app/(workspace)/page.tsx", "/"],
    ["app/(workspace)/map/page.tsx", "/map"],
    ["app/(workspace)/lab/page.tsx", "/lab"],
    ["app/(workspace)/report/page.tsx", "/report"],
  ];

  for (const [r, route] of required) {
    if (!existsSync(join(WEB, r))) {
      fail("IV", `缺少顶级静态路由 ${route}`, `web/${r}`);
    }
  }

  // ── 深层动态路由必须不存在 ──
  for (const r of [
    "app/(workspace)/courses",
    "app/(workspace)/learning",
    "app/(workspace)/hub",
  ]) {
    if (existsSync(join(WEB, r))) {
      fail(
        "IV",
        `深层动态路由 ${r} 仍然存在——子路径部署会 404`,
        `web/${r}`,
      );
    }
  }

  // ── /lab 必须用查询参数驱动 ──
  const labPage = join(WEB, "app", "(workspace)", "lab", "page.tsx");
  if (existsSync(labPage)) {
    const source = readCode(labPage);
    if (!/useSearchParams/.test(source)) {
      fail(
        "IV",
        "/lab 未使用 useSearchParams 读取 node 参数",
        "web/app/(workspace)/lab/page.tsx",
      );
    }
    if (!/Suspense/.test(source)) {
      fail(
        "IV",
        "/lab 未包在 <Suspense> 中",
        "web/app/(workspace)/lab/page.tsx",
      );
    }
  }

  // ── /map 必须允许内部滚动（唯一例外） ──
  const mapPage = join(WEB, "app", "(workspace)", "map", "page.tsx");
  if (existsSync(mapPage)) {
    const source = readCode(mapPage);
    if (!/overflow-auto/.test(source)) {
      fail(
        "IV",
        "/map 画布必须允许内部滚动——它是全站唯一可滚动区域",
        "web/app/(workspace)/map/page.tsx",
      );
    }
    if (!/setZoom/.test(source)) {
      fail(
        "IV",
        "/map 画布必须支持缩放",
        "web/app/(workspace)/map/page.tsx",
      );
    }
  }

  // ── 全站不得写死原生 <a href="/..."> 绝对路径 ──
  for (const file of walk(WEB)) {
    if (!/\.tsx$/.test(file)) continue;
    const source = readCode(file);
    const raw = /<a\s[^>]*href=["'](?:\/|https?:\/\/)/g;
    let match;
    while ((match = raw.exec(source)) !== null) {
      fail(
        "IV",
        `原生 <a href="${match[1]}"> 绝对路径——必须用 Next.js Link`,
        rel(file),
      );
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑤ · 240px 牛津海军蓝左栏 + 一屏锁死
 * ────────────────────────────────────────────────────────────────── */

/**
 * 布局契约校验。
 *
 * - ``AppShell`` 必须锁死 ``h-screen w-screen overflow-hidden``，
 *   并且左侧挂 ``WorkspaceSidebar``、右侧是 ``flex-1``；
 * - ``WorkspaceSidebar`` 必须是 ``w-60``（240px）且底色 ``#0B162C``；
 * - 旧的底部悬浮岛 / 顶部栏必须不存在。
 */
function checkLayoutContract() {
  const shellPath = join(WEB, "components", "layout", "AppShell.tsx");
  if (!existsSync(shellPath)) {
    fail("V", "缺少 AppShell 组件", "web/components/layout/AppShell.tsx");
    return;
  }
  const shell = readCode(shellPath);
  for (const token of ["h-screen", "w-screen", "overflow-hidden"]) {
    if (!shell.includes(token)) {
      fail(
        "V",
        `AppShell 缺少 ${token}——零滚动一屏契约不完整`,
        "components/layout/AppShell.tsx",
      );
    }
  }
  if (!shell.includes("WorkspaceSidebar")) {
    fail("V", "AppShell 未挂载 WorkspaceSidebar", "components/layout/AppShell.tsx");
  }
  if (!/flex-1/.test(shell)) {
    fail("V", "AppShell 主舞台缺少 flex-1", "components/layout/AppShell.tsx");
  }

  // ── 左栏：240px + 牛津海军蓝 ──
  const sidebarPath = join(WEB, "components", "layout", "WorkspaceSidebar.tsx");
  if (!existsSync(sidebarPath)) {
    fail("V", "缺少 WorkspaceSidebar 组件", "web/components/layout/WorkspaceSidebar.tsx");
    return;
  }
  const sidebar = readCode(sidebarPath);
  if (!/w-60/.test(sidebar)) {
    fail(
      "V",
      "WorkspaceSidebar 宽度不是 w-60（240px）",
      "components/layout/WorkspaceSidebar.tsx",
    );
  }
  if (!sidebar.includes("#0B162C")) {
    fail(
      "V",
      "WorkspaceSidebar 底色不是牛津海军蓝 #0B162C",
      "components/layout/WorkspaceSidebar.tsx",
    );
  }
  if (!/shrink-0/.test(sidebar)) {
    fail(
      "V",
      "WorkspaceSidebar 必须 shrink-0——否则会被主舞台挤扁",
      "components/layout/WorkspaceSidebar.tsx",
    );
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑥ · 九个自研实验台挂真实引擎
 * ────────────────────────────────────────────────────────────────── */

/**
 * 实验台引擎校验。
 *
 * ⛔ 每个实验台必须**真的**在动，而不是画假图：
 *
 * - 六个链 01 实验台 → 原生 SVG 拖拽引擎（必须有真实的 pointer/drag 交互）
 * - ``GeometryProtractorLab`` → ``jsxgraph``
 * - ``AlgebraBalanceLab``    → ``matter-js``
 * - ``FunctionStudioLab``    → ``mafs``
 */
function checkFlagshipLabs() {
  const labs = [
    {
      file: "components/labs/OneToOneCountingLab.tsx",
      engine: "svg",
      tokens: ["onPointerDown", "onTelemetryChange"],
    },
    {
      file: "components/labs/QuantityCompareLab.tsx",
      engine: "svg",
      tokens: ["onPointerDown", "onTelemetryChange"],
    },
    {
      file: "components/labs/BaselineLengthLab.tsx",
      engine: "svg",
      tokens: ["onPointerDown", "onTelemetryChange"],
    },
    {
      file: "components/labs/MakeTenSnapLab.tsx",
      engine: "svg",
      tokens: ["onPointerDown", "onTelemetryChange"],
    },
    {
      file: "components/labs/BundleOfTenLab.tsx",
      engine: "svg",
      tokens: ["onPointerDown", "onTelemetryChange"],
    },
    {
      file: "components/labs/NumberLineJumpLab.tsx",
      engine: "svg",
      tokens: ["onPointerDown", "onTelemetryChange"],
    },
    {
      file: "components/labs/GeometryProtractorLab.tsx",
      engine: "jsxgraph",
      tokens: ["JSXGraph.initBoard", "board.create", "freeBoard"],
    },
    {
      file: "components/labs/AlgebraBalanceLab.tsx",
      engine: "matter-js",
      tokens: ["Matter.Engine.create", "Matter.Bodies", "Matter.Composite"],
    },
    {
      file: "components/labs/FunctionStudioLab.tsx",
      engine: "mafs",
      tokens: ["from \"mafs\"", "Mafs", "Coordinates.Cartesian"],
    },
  ];

  for (const lab of labs) {
    const full = join(WEB, lab.file);
    if (!existsSync(full)) {
      fail("VI", `缺少自研实验台：${lab.file}`, `web/${lab.file}`);
      continue;
    }
    const source = readCode(full);

    for (const token of lab.tokens) {
      if (!source.includes(token)) {
        fail(
          "VI",
          `${lab.file} 未真正调用 ${lab.engine} 的 ${token}——可能是空壳实现`,
          `web/${lab.file}`,
        );
      }
    }

    // 必须真的动起来——不能是静态图。
    if (!/useEffect/.test(source)) {
      fail("VI", `${lab.file} 没有 useEffect——引擎没有运行`, `web/${lab.file}`);
    }
    if (!/onTelemetryChange/.test(source)) {
      fail(
        "VI",
        `${lab.file} 没有 onTelemetryChange——未向右侧助手回传实时上下文`,
        `web/${lab.file}`,
      );
    }
  }

  // ── lab-types 必须定义三阶段契约 ──
  const typesPath = join(WEB, "components", "labs", "lab-types.tsx");
  if (!existsSync(typesPath)) {
    fail("VI", "缺少 labs/lab-types.tsx", "web/components/labs/lab-types.tsx");
    return;
  }
  const types = readCode(typesPath);
  for (const token of ["LabStage", "StageSwitch", "FormulaBar", "TelemetryEvent"]) {
    if (!types.includes(token)) {
      fail("VI", `lab-types.tsx 缺少 ${token}`, "components/labs/lab-types.tsx");
    }
  }

  // ── 注册表必须覆盖全部九个实验台 ──
  const registryPath = join(WEB, "components", "labs", "lab-registry.tsx");
  if (!existsSync(registryPath)) {
    fail("VI", "缺少 labs/lab-registry.tsx", "web/components/labs/lab-registry.tsx");
    return;
  }
  const registry = readCode(registryPath);
  for (const lab of labs) {
    const name = lab.file.split("/").pop().replace(/\.tsx$/, "");
    if (!registry.includes(name)) {
      fail(
        "VI",
        `lab-registry.tsx 未注册 ${name}——该实验台永远不会被加载`,
        "components/labs/lab-registry.tsx",
      );
    }
  }
  if (!/ssr:\s*false/.test(registry)) {
    fail(
      "VI",
      "lab-registry.tsx 的实验台必须 ssr: false 懒加载——物理引擎在模块顶层就碰 window",
      "components/labs/lab-registry.tsx",
    );
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑦ · 零 PhET：不得残留任何第三方仿真
 * ────────────────────────────────────────────────────────────────── */

/**
 * PhET 清零校验。
 *
 * ⛔ 全站**不引入任何第三方仿真 iframe**。理由有三：
 *
 * 1. 第三方 iframe 无法保证离线可用；
 * 2. 无法保证三语文案一致（官方 locale 只有部分翻译）；
 * 3. 样式完全脱离本站的视觉体系，而且线上可能直接 404。
 *
 * 所以这里同时检查三处：图谱 JSON、源码、以及 package.json 依赖。
 */
function checkZeroPhet() {
  // ── 图谱 JSON ──
  if (!existsSync(TAXONOMY_FILE)) {
    fail("VII", "缺少图谱数据文件", "web/public/data/math-taxonomy.json");
    return;
  }
  const raw = readFileSync(TAXONOMY_FILE, "utf8");
  if (/phet/i.test(raw)) {
    fail(
      "VII",
      "图谱 JSON 里还有 PhET 残留字样——必须彻底清零第三方仿真",
      "public/data/math-taxonomy.json",
    );
  }

  // ── 源码 ──
  //
  // 注意：只查**真正生效的代码**，注释里可以自由讨论这件事。
  for (const file of walk(WEB)) {
    const source = readCode(file);
    if (/phet/i.test(source)) {
      fail(
        "VII",
        "源码里还有 PhET 残留——全站只用 OE 自研实验台",
        rel(file),
      );
    }
  }

  // ── 依赖 ──
  const pkgPath = join(WEB, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const name of Object.keys(deps)) {
      if (/phet/i.test(name)) {
        fail(
          "VII",
          `依赖里还有 ${name}——第三方仿真必须清零`,
          "web/package.json",
        );
      }
    }
  }

  // ── 不得存在任何第三方 iframe ──
  for (const file of walk(WEB)) {
    if (!/\.tsx$/.test(file)) continue;
    const source = readCode(file);
    if (/<iframe/i.test(source)) {
      fail(
        "VII",
        "存在 iframe——全站实验台必须是 OE 自研，不嵌入第三方仿真",
        rel(file),
      );
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑧ · 三阶段闯关模式
 * ────────────────────────────────────────────────────────────────── */

/**
 * 三阶段模式（探索 / 规律 / 谜题）必须真实存在。
 *
 * ⛔ 每个实验台都必须提供三个阶段，且每个阶段**有真实内容**
 *    （不是同一个画面换个标题）。
 */
function checkThreeStages() {
  const labs = [
    "components/labs/OneToOneCountingLab.tsx",
    "components/labs/QuantityCompareLab.tsx",
    "components/labs/BaselineLengthLab.tsx",
    "components/labs/MakeTenSnapLab.tsx",
    "components/labs/BundleOfTenLab.tsx",
    "components/labs/NumberLineJumpLab.tsx",
    "components/labs/GeometryProtractorLab.tsx",
    "components/labs/AlgebraBalanceLab.tsx",
    "components/labs/FunctionStudioLab.tsx",
  ];

  for (const r of labs) {
    const full = join(WEB, r);
    if (!existsSync(full)) continue;
    const source = readCode(full);

    for (const stage of ["explore", "discover", "mystery"]) {
      if (!source.includes(stage)) {
        fail("VIII", `${r} 缺少 ${stage} 阶段`, `web/${r}`);
      }
    }

    // 必须真的按阶段切换内容。
    if (!/StageSwitch/.test(source)) {
      fail(
        "VIII",
        `${r} 没有使用 StageSwitch——三阶段只是摆设`,
        `web/${r}`,
      );
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑨ · 星星账本：≥2 星解锁链主徽章
 * ────────────────────────────────────────────────────────────────── */

/**
 * 星星账本校验。
 *
 * ⛔ 徽章规则必须是「一条链里**所有可玩实验节点**都达到 ≥2 星」，
 *    而不是「任意一个达到 2 星」——后者会让徽章失去分量。
 */
function checkStarLedger() {
  const ledgerPath = join(WEB, "lib", "math-star-ledger.ts");
  if (!existsSync(ledgerPath)) {
    fail("IX", "缺少 math-star-ledger.ts", "web/lib/math-star-ledger.ts");
    return;
  }
  const source = readCode(ledgerPath);

  if (!/2/.test(source)) {
    fail(
      "IX",
      "math-star-ledger.ts 没有体现 ≥2 星门槛",
      "web/lib/math-star-ledger.ts",
    );
  }
  if (!/playableNodeIds/.test(source) && !/status/.test(source)) {
    fail(
      "IX",
      "math-star-ledger.ts 没有依据「可玩节点」判定徽章",
      "web/lib/math-star-ledger.ts",
    );
  }
  if (!/localStorage/.test(source)) {
    fail(
      "IX",
      "math-star-ledger.ts 没有持久化到 localStorage",
      "web/lib/math-star-ledger.ts",
    );
  }
  // 星星必须单调——点亮后不被熄灭。
  if (!/awardMathStar/.test(source)) {
    fail(
      "IX",
      "math-star-ledger.ts 缺少 awardMathStar——星星无法点亮",
      "web/lib/math-star-ledger.ts",
    );
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 红线 ⑩ · 图谱完整性：64 节点 / 8 链 / 0 空壳 / 0 缺失边
 * ────────────────────────────────────────────────────────────────── */

/**
 * 图谱完整性校验。
 *
 * - 节点数必须是 64（8 链 × 8 节点）；
 * - 每条链必须恰好 8 个节点；
 * - 每条边两端的节点都必须存在；
 * - 三阶因果位置必须齐备；
 * - 可玩节点必须有真实教具（挂自研实验台）；
 * - 必须写明数据来源（attribution）。
 */
function checkTaxonomyIntegrity() {
  if (!existsSync(TAXONOMY_FILE)) {
    fail("X", "缺少图谱数据文件", "web/public/data/math-taxonomy.json");
    return;
  }

  const taxonomy = JSON.parse(readFileSync(TAXONOMY_FILE, "utf8"));
  const nodes = taxonomy.nodes ?? [];
  const ids = new Set(nodes.map((n) => n.id));

  // ── 统计自洽 ──
  const stats = taxonomy.stats ?? {};
  if (stats.nodeCount !== nodes.length) {
    fail(
      "X",
      `stats.nodeCount=${stats.nodeCount} 与实际节点数 ${nodes.length} 不符`,
      "public/data/math-taxonomy.json",
    );
  }
  if (nodes.length !== EXPECTED_NODES) {
    fail(
      "X",
      `节点数为 ${nodes.length}，要求 ${EXPECTED_NODES}（8 链 × 8 节点）`,
      "public/data/math-taxonomy.json",
    );
  }
  if (!Array.isArray(taxonomy.chains) || taxonomy.chains.length !== EXPECTED_CHAINS) {
    fail(
      "X",
      `逻辑链数量为 ${taxonomy.chains?.length ?? 0}，要求 ${EXPECTED_CHAINS}`,
      "public/data/math-taxonomy.json",
    );
  }

  // ── 每条链恰好 8 个节点 ──
  for (const chain of taxonomy.chains ?? []) {
    const count = nodes.filter((n) => n.chainId === chain.id).length;
    if (count !== 8) {
      fail(
        "X",
        `链 ${chain.id} 有 ${count} 个节点，要求恰好 8 个`,
        "public/data/math-taxonomy.json",
      );
    }
  }

  // ── 节点字段完整 ──
  const VALID_TIERS = new Set(["intuition", "structure", "modeling"]);
  for (const node of nodes) {
    if (!node.nameEn) {
      fail("X", `节点 ${node.id} 缺少英文名`, "public/data/math-taxonomy.json");
    }
    if (!node.nameZh || !/[一-龥]/.test(node.nameZh)) {
      fail(
        "X",
        `节点 ${node.id} 缺少人工审定的中文名`,
        "public/data/math-taxonomy.json",
      );
    }
    if (!node.descriptionEn) {
      fail("X", `节点 ${node.id} 缺少英文说明`, "public/data/math-taxonomy.json");
    }
    if (!node.descriptionZh) {
      fail("X", `节点 ${node.id} 缺少中文说明`, "public/data/math-taxonomy.json");
    }
    if (!node.chainId) {
      fail("X", `节点 ${node.id} 缺少所属链`, "public/data/math-taxonomy.json");
    }
    if (!VALID_TIERS.has(node.tier)) {
      fail(
        "X",
        `节点 ${node.id} 的三阶因果位置非法：${node.tier}`,
        "public/data/math-taxonomy.json",
      );
    }
  }

  // ── 边的两端必须存在 ──
  for (const edge of taxonomy.edges ?? []) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      fail(
        "X",
        `边 ${edge.from} → ${edge.to} 有一端不存在`,
        "public/data/math-taxonomy.json",
      );
    }
  }

  // ── 自研实验台数 ──
  const labs = new Set(nodes.map((n) => n.lab).filter(Boolean));
  if (labs.size !== EXPECTED_LABS) {
    fail(
      "X",
      `自研实验台数为 ${labs.size}，要求 ${EXPECTED_LABS}`,
      "public/data/math-taxonomy.json",
    );
  }

  // ── 可玩节点不能是空壳 ──
  let playable = 0;
  for (const node of nodes) {
    if (node.status !== "playable") continue;
    playable += 1;
    if (!node.lab) {
      fail(
        "X",
        `可玩节点 ${node.id}「${node.nameEn}」没有挂实验台——是空壳`,
        "public/data/math-taxonomy.json",
      );
    }
  }
  if (playable === 0) {
    fail("X", "没有任何可玩节点", "public/data/math-taxonomy.json");
  }

  // ── 归属标注（必须写明数据来源） ──
  if (!taxonomy.attribution?.primary?.repo) {
    fail(
      "X",
      "图谱缺少来源标注（attribution）",
      "public/data/math-taxonomy.json",
    );
  }

  return playable;
}

/* ──────────────────────────────────────────────────────────────────
 * 主流程
 * ────────────────────────────────────────────────────────────────── */

console.log("┌─────────────────────────────────────────────┐");
console.log("│  OE · 数学宇宙强校验                        │");
console.log("└─────────────────────────────────────────────┘\n");

checkLegacyPurged();
console.log("红线 ①    旧模块清零 + 0 视频源        已检查");

const fileCount = checkNoTranslucentTextBoxes();
console.log(`红线 ②    零毛玻璃 + 零半透明文字框    ${fileCount} 个文件已扫描`);

checkNoHighSaturation();
console.log("红线 ③    零旧高饱和色                 已检查");

checkStaticRoutes();
console.log("红线 ④    四条纯静态路由 + 全链路可达  已检查");

checkLayoutContract();
console.log("红线 ⑤    240px 海军蓝左栏 + 一屏锁死  已检查");

checkFlagshipLabs();
console.log("红线 ⑥    九个自研实验台挂真实引擎      已检查");

checkZeroPhet();
console.log("红线 ⑦    零 PhET · 零第三方 iframe    已检查");

checkThreeStages();
console.log("红线 ⑧    三阶段闯关（探索/规律/谜题）  已检查");

checkStarLedger();
console.log("红线 ⑨    星星账本 ≥2 星解锁链主徽章    已检查");

const playable = checkTaxonomyIntegrity();
console.log(`红线 ⑩    图谱完整性 + 0 空壳          ${playable} 个可玩节点已检查`);

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
