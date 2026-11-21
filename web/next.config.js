/** @type {import('next').NextConfig} */
const path = require("path");

/**
 * 读一个环境变量，**过滤掉字符串 ``"undefined"``。
 *
 * 为什么
 * ------
 *
 * Next 在加载配置时会把「未定义」的环境变量变成**字符串** ``"undefined"``
 * 而不是真正的 ``undefined``。所以普通的 ``||`` 兜底会失效——
 * ``"undefined" || fallback`` 的结果是 ``"undefined"``（非空字符串是
 * 真值）。
 *
 * 结果就是 basePath 变成 ``"undefinedSEEK-Learning-Platform"``——
 * 构建直接报错。
 *
 * 所以这里显式检查：字符串 ``"undefined"`` / ``"null"`` 都当作没设。
 */
function envString(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";
  return trimmed;
}

/**
 * 部署形态
 * ========
 *
 * 本项目支持**三种**部署形态，靠两个环境变量切换：
 *
 * 1. **纯静态**（GitHub Pages）
 *    ``NEXT_PUBLIC_STATIC_EXPORT=true`` + ``NEXT_PUBLIC_BASE_PATH=/仓库名``
 *    → ``output: "export"``，产物是 ``web/out/``，纯 HTML + JSON。
 * 2. **有后端**（Vercel + Render / Zeabur）
 *    什么都不设 → ``output: "standalone"``，Next 的 rewrite 代理转发
 *    ``/api/*`` 到后端。
 * 3. **纯静态但仍带后端**（本地预览静态产物）
 *    ``NEXT_PUBLIC_STATIC_EXPORT=true`` 但**不**设 ``NEXT_PUBLIC_BASE_PATH``
 *    → 也是 ``output: "export"``。
 *
 * basePath
 * --------
 *
 * GitHub Pages 的**项目站点**在二级路径下：
 *
 *     https://<用户名>.github.io/<仓库名>/
 *
 * 所以 ``basePath`` 必须设成 ``/<仓库名>``，``assetPrefix`` 也要跟着
 * 设——否则 JS、CSS、图标全是 404（页面一片白）。
 *
 * 顺带一提，GitHub Pages 也支持**用户站点**（``<用户名>.github.io``，
 * 根路径），那种情况 ``basePath`` 留空即可。
 */

const STATIC_EXPORT =
  envString("NEXT_PUBLIC_STATIC_EXPORT") === "true" ||
  envString("NEXT_OUTPUT") === "export";

/**
 * basePath——去掉首尾斜杠，只保留中间部分。
 *
 * ``/仓库名/`` → ``/仓库名``；``/`` → ``""``。
 */
/**
 * basePath 的原始值。
 *
 * ⚠️ 这里**必须**先存进变量再调 ``.replace()``。
 *
 * 直接写成 ``envString("X").replace(...)`` 时，链式调用会踩到一个
 * 诡异的行为：结果里会多出一段字面量 ``"undefined"`` 前缀，
 * basePath 变成 ``"undefinedSEEK-Learning-Platform"``，
 * 构建直接报 ``basePath has to start with a /``。
 *
 * 拆成两步（先取值、再替换）就正常。所以这里刻意不写成链式调用。
 */
const RAW_BASE_PATH = envString("NEXT_PUBLIC_BASE_PATH");

/**
 * basePath——**保留前导斜杠**，去掉末尾斜杠。
 *
 * Next 要求 basePath 必须以 ``/`` 开头（``/仓库名``），所以前导
 * 斜杠不能去。只有末尾的斜杠要去掉——``/仓库名/`` 会被 Next 拼成
 * ``/仓库名//hub`` 这种双斜杠。
 *
 * 空值（本地开发、用户站点）→ 空字符串。
 */
const BASE_PATH = RAW_BASE_PATH
  ? `/${RAW_BASE_PATH.replace(/^\/+|\/+$/g, "")}`
  : "";

// eslint-disable-next-line no-console
console.log(
  `[next.config] basePath=${JSON.stringify(BASE_PATH)} · static=${STATIC_EXPORT}`,
);

/** assetPrefix 的原始值。 */
const RAW_ASSET_PREFIX = envString("NEXT_PUBLIC_ASSET_PREFIX");

/**
 * assetPrefix——静态资源的完整前缀。
 *
 * 与 ``basePath`` 的区别：``basePath`` 影响**路由**，
 * ``assetPrefix`` 影响 ``/_next/*`` 这些**资源**。
 *
 * 两者通常相同，但 ``assetPrefix`` 可以指向 CDN。
 */
const ASSET_PREFIX = (
  RAW_ASSET_PREFIX || (BASE_PATH ? `${BASE_PATH}/` : "")
).replace(/\/+$/, "");

/**
 * 后端基址
 * =======
 *
 * 三种来源，优先级从高到低：
 *
 * 1. ``NEXT_PUBLIC_API_BASE_URL``——云平台注入的**后端公网地址**。
 * 2. ``BACKEND_PORT``——只在本机跑后端时用。
 * 3. 默认 ``http://127.0.0.1:8001``——本地开发的兜底。
 *
 * 为什么改用 ``NEXT_PUBLIC_API_BASE_URL``
 * ------------------------------------
 *
 * 原来的变量名是 ``NEXT_PUBLIC_API_BASE``。名字里带 ``PUBLIC_`` 意味着
 * 它会**被内联进浏览器端的 JS 包**——也就是任何人都能在源码里看到后端
 * 地址。这本身不是秘密，但云平台的内部地址（如
 * ``https://my-backend.zeabur.app``）没必要暴露给每个访客。
 *
 * 新名 ``NEXT_PUBLIC_API_BASE_URL`` 同样会被内联，但语义更明确：
 * 「这是**浏览器直连**后端时用的公开基址」。
 *
 * 生产环境的推荐做法
 * ------------------
 *
 * **前端不直连后端**，而是让 Next 的 rewrite 代理转发 ``/api/*``。
 * 这样：
 *
 * * 浏览器只跟**同一个域名**打交道——没有跨域，没有 CORS 预检；
 * * 后端地址不用暴露给前端；
 * * 后端可以随时换域名而不需要重新构建前端。
 *
 * 纯静态模式下没有 rewrite（``output: "export"`` 不支持 rewrites），
 * 所以静态版的数据全部从 ``/data/*.json`` 读。
 */
const BACKEND_PORT = process.env.BACKEND_PORT || "8001";

/** 后端基址的原始值。 */
const RAW_API_BASE =
  envString("NEXT_PUBLIC_API_BASE_URL") ||
  envString("NEXT_PUBLIC_API_BASE") ||
  `http://127.0.0.1:${BACKEND_PORT}`;

/** 后端基址——去掉末尾斜杠。 */
const API_BASE = RAW_API_BASE.replace(/\/+$/, "");

const nextConfig = {
  reactStrictMode: true,
  // 固定 workspace root，否则 Next 会因为上层存在别的 lockfile 而猜错。
  outputFileTracingRoot: __dirname,

  /**
   * 构建产物目录。
   *
   * 默认是 ``.next``——但开发服务器也用它。跑一次 ``npm run build``
   * 就会把生产产物写进 dev 正在用的目录，两套构建互相踩，
   * 结果是 dev 报 ``Cannot find module './xxxx.js'``（本项目踩过）。
   *
   * 所以生产构建单独放到 ``.next-build``，两者彻底隔离。
   *
   * ⚠️ **静态导出例外**
   *
   *   Next 有一个不直观的规则：当 ``output: "export"`` 且
   *   ``distDir !== ".next"`` 时，它会把导出产物写进 ``distDir``
   *   而不是 ``out/``。
   *
   *   这会打乱 GitHub Actions 的路径假设（它上传 ``web/out/``）。
   *   所以静态导出时**强制**用 ``.next``，让产物落在 ``out/``。
   *   CI 每次都是全新环境，不存在与 dev 抢目录的问题。
   */
  distDir: STATIC_EXPORT ? ".next" : process.env.NEXT_DIST_DIR || ".next",

  /**
   * 静态导出
   * ========
   *
   * ``output: "export"`` 让 Next 把整个站点导出成**纯静态文件**
   * （``web/out/``）——没有 Node 运行时，可以托管在 GitHub Pages
   * 这种纯静态托管上。
   */
  ...(STATIC_EXPORT ? { output: "export" } : {}),

  /**
   * 路由前缀
   * =========
   *
   * 两者都必须设，否则 GitHub Pages 上会**全站 404**——
   * HTML 能打开，但 ``/_next/static/...`` 加载不到，页面一片空白。
   */
  ...(BASE_PATH
    ? {
        basePath: BASE_PATH,
        assetPrefix: ASSET_PREFIX || BASE_PATH,
      }
    : {}),

  /**
   * 尾部斜杠
   * =========
   *
   * GitHub Pages **不认** ``/hub`` 这种无斜杠形式——它会 404。
   * 开启 ``trailingSlash`` 后 Next 生成的是 ``/hub/index.html``，
   * 匹配 Pages 的 ``/hub/`` 规则。
   *
   * 代价：URL 末尾多个斜杠。对静态站点来说这是**必须**的。
   */
  trailingSlash: true,

  env: {
    NEXT_PUBLIC_API_BASE: API_BASE,
    NEXT_PUBLIC_API_BASE_URL: API_BASE,
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
    NEXT_PUBLIC_STATIC_EXPORT: STATIC_EXPORT ? "true" : "false",
  },

  /**
   * 跨域图片 / iframe 策略
   * ======================
   *
   * Next 的 ``images.remotePatterns`` 默认**只允许同源图片**。课程封面
   * 来自 B 站、YouTube 等外部站点，如果走 ``next/image`` 优化，线上会
   * 全部报 ``400 Invalid src prop``。
   *
   * ``unoptimized: true`` 让 ``next/image`` 直接输出原始 URL，
   * 完全绕开优化器的域名白名单。静态导出**必须**开这个——
   * 优化器在静态模式下根本不存在。
   */
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },

  /**
   * 安全响应头
   * ============
   *
   * ``X-Frame-Options: SAMEORIGIN``——防止本站被嵌进第三方恶意页面
   * （点击劫持）。
   *
   * ⚠️ 静态导出（``output: "export"``）**不支持**自定义 headers——
   *    产物里没有服务端可以加这些头。所以静态模式整个跳过。
   *    GitHub Pages 那边由平台自己处理基础安全头。
   */
  ...(STATIC_EXPORT
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                {
                  key: "X-Content-Type-Options",
                  value: "nosniff",
                },
                {
                  key: "Referrer-Policy",
                  value: "strict-origin-when-cross-origin",
                },
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
              ],
            },
          ];
        },
      }),

  /**
   * 把 ``/api/*`` 代理到后端。
   *
   * 前端代码里一律用相对路径 ``/api/xxx``，由服务端转发——浏览器
   * 看到的永远是**同源**请求，不需要 CORS 预检，也不需要知道后端
   * 在哪。
   *
   * ⚠️ 静态导出**不支持** rewrites——所以 ``output: "export"`` 时
   *    这里不配置。静态版的数据全部从 ``/data/*.json`` 读。
   */
  ...(STATIC_EXPORT
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${API_BASE}/api/:path*`,
            },
          ];
        },
      }),

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname),
    };
    return config;
  },
};

module.exports = nextConfig;
