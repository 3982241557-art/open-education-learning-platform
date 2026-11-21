/**
 * 环境配置
 * ========
 *
 * 前端**唯一**读取环境变量的地方。
 *
 * 为什么单独一个文件
 * ------------------
 *
 * Next.js 的 ``process.env.NEXT_PUBLIC_*`` 是**编译期内联**的——它在
 * ``next build`` 时被字面替换进浏览器包里。所以：
 *
 * * 它**必须**写成 ``process.env.NEXT_PUBLIC_XXX`` 这种**字面量**形式，
 *   不能写成 ``process.env[name]``——后者在浏览器里是 ``undefined``；
 * * 每次改动都要**重新构建**才生效，改环境变量但不重新部署不会生效。
 *
 * 把它抽到这个文件里，好处是：
 *
 * * 只有**一处**需要小心处理「字面量」这个坑；
 * * 别处直接 ``import { API_BASE_URL } from "@/lib/env"``，
 *   读起来像普通常量，不用每次都想起那个坑。
 */

/**
 * 后端公网基址。
 *
 * **空字符串**是有意义的——它意味着「不直连后端，一切走 Next 的
 * rewrite 代理」。这是生产环境**推荐**的形态：浏览器只跟同源打交道，
 * 没有跨域问题，后端换域名也不用重新构建前端。
 *
 * 什么时候才需要填？
 *
 * 只有当**你确实要让浏览器直接请求后端**时（比如后端有自己的域名、
 * 且需要在浏览器侧直连某些 WebSocket 或流式接口）。绝大多数情况下
 * 留空即可——rewrite 已经处理好了。
 */
export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * 是否处于**生产环境**。
 *
 * 用它来决定一些「只在本地做的事」——比如关掉详细错误提示。
 */
export const IS_PRODUCTION: boolean =
  process.env.NODE_ENV === "production";

/**
 * 站点标题——给 ``<title>`` 与分享卡片用。
 */
export const SITE_TITLE: string =
  process.env.NEXT_PUBLIC_SITE_TITLE || "开放教育学习平台 · 深圳后海总部";

/**
 * 站点描述——SEO 用。
 */
export const SITE_DESCRIPTION: string =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
  "连接全球华人的终身学习家园。聚合全球顶尖名校公开课、开源学历路径与 AI 伴学工作台。";

/**
 * 拼一个后端 API 的绝对地址。
 *
 * **只有**在「浏览器要直连后端」时才需要它——也就是
 * ``API_BASE_URL`` 非空的时候。留空时返回**相对路径**，交给 rewrite
 * 代理转发。
 */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) return normalized;
  return `${API_BASE_URL}${normalized}`;
}
