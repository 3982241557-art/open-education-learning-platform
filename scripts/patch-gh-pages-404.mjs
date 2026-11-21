#!/usr/bin/env node
/**
 * GitHub Pages 的 404 回退补丁
 * =============================
 *
 * 问题
 * ----
 *
 * GitHub Pages 是**纯静态托管**。用户访问一个构建期没生成的路径时
 * （比如 ``/learning/certificates/cert-1234``——证书 id 是运行时
 * 才有的），Pages 找不到对应文件，直接返回 ``404.html``。
 *
 * 而 Next 导出的 ``404.html`` 是一个**静态快照**——它不知道用户
 * 当时想访问哪个路径，只会显示「页面不存在」。
 *
 * 解决
 * ----
 *
 * 在导出的 ``404.html`` 里插一段脚本：
 *
 * 1. 把用户原本想访问的路径**存进 sessionStorage**；
 * 2. 跳回站点根目录；
 * 3. 根目录的客户端组件读到 sessionStorage 里的路径，
 *    用客户端路由器导航过去。
 *
 * 结果：访问 ``/learning/certificates/cert-1234`` 看到的
 * **仍然是证书页**，而不是「404 页面不存在」。
 *
 * 为什么用 sessionStorage 而不是直接渲染
 * --------------------------------------
 *
 * 因为客户端路由需要 Next 应用**完整启动**。从 404.html 里直接
 * 渲染课程页，等于要复制一整套 React 树——脆弱且难维护。
 *
 * 什么时候**不该**走这条路
 * ------------------------
 *
 * 真的 404（用户输入了一个不存在的路径）。这时客户端导航找不到
 * 匹配路由，Next 会渲染自己的 404 页——行为正确。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录。 */
const ROOT = path.resolve(__dirname, "..");

/** 导出产物目录。 */
const OUT_DIR = path.join(ROOT, "web", "out");

/** sessionStorage 里存路径的键。 */
export const PENDING_PATH_KEY = "seek.ghpages.pendingPath";

function main() {
  const notFoundPath = path.join(OUT_DIR, "404.html");

  if (!fs.existsSync(notFoundPath)) {
    console.warn("⚠️  没有找到 out/404.html——跳过 404 回退补丁。");
    return;
  }

  let html = fs.readFileSync(notFoundPath, "utf8");

  // 已经打过补丁就别重复打。
  if (html.includes(PENDING_PATH_KEY)) {
    console.log("✅ 404 回退补丁已存在，跳过。");
    return;
  }

  /**
   * 回退脚本。
   *
   * 它必须：
   *
   * * 在**任何** Next 脚本之前运行（否则页面已经启动了）；
   * * 立刻跳转（用户不该看到一闪而过的 404 页）。
   */
  const patch = `
<script>
/**
 * GitHub Pages 404 回退。
 *
 * 把用户原本想访问的路径存起来，然后跳回站点根目录——
 * 根目录的客户端组件会读它并用客户端路由导航过去。
 */
(function () {
  try {
    var path = window.location.pathname + window.location.search;
    var base = ${JSON.stringify(process.env.NEXT_PUBLIC_BASE_PATH || "")};
    var normalized = path.replace(/\\?.*$/, "");
    if (normalized && normalized !== base && normalized !== base + "/") {
      // 存**带** basePath 的完整路径——
      // 客户端组件会自己剥掉前缀再交给路由器。
      sessionStorage.setItem(${JSON.stringify(PENDING_PATH_KEY)}, path);
      // 跳回站点根目录（**带** basePath）。
      window.location.replace(base || "/");
    }
  } catch (e) {
    /* 隐私模式禁用了 sessionStorage——放弃回退，留在 404 页 */
  }
})();
</script>
`;

  // 插到 ``</head>`` 之前——这样它在 Next 的脚本之前执行。
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${patch}</head>`);
  } else {
    // 没有 ``</head>``（极少见）——插到最前面。
    html = patch + html;
  }

  fs.writeFileSync(notFoundPath, html, "utf8");
  console.log("✅ 已给 out/404.html 打上 GitHub Pages 回退补丁。");
}

/**
 * 生成 ``.nojekyll``。
 *
 * GitHub Pages 默认用 Jekyll 处理内容——它会**忽略**以 ``_`` 开头的
 * 目录。而 Next 的静态产物里有 ``/_next/`` 目录——Jekyll 会把它删掉，
 * 结果是「HTML 能打开，但 JS 和 CSS 全 404」，页面一片空白。
 *
 * 一个空的 ``.nojekyll`` 文件就能关掉 Jekyll。
 */
function writeNoJekyll() {
  const noJekyllPath = path.join(OUT_DIR, ".nojekyll");
  if (fs.existsSync(noJekyllPath)) {
    console.log("✅ out/.nojekyll 已存在，跳过。");
    return;
  }
  fs.writeFileSync(noJekyllPath, "", "utf8");
  console.log("✅ 已生成 out/.nojekyll（关掉 Jekyll，保护 _next/ 目录）。");
}

main();
writeNoJekyll();
