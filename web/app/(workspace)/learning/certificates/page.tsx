/**
 * 证书独立预览页
 * ==============
 *
 * ``/learning/certificates/?id=<证书 id>``
 *
 * 为什么 id 在**查询参数**里
 * -----------------------
 *
 * 静态导出（GitHub Pages）的硬约束：构建期没生成的路径不存在。
 * 证书 id 是运行时才有的，所以路径参数形式在纯静态站点上**永远 404**。
 * 查询参数绕开了这个问题——路径本身是静态的。
 *
 * 详见同目录的 ``CERTIFICATE_ROUTE.md``。
 */

/**
 * 这个页面**没有**服务端逻辑——证书内容全部在浏览器里读
 * （localStorage 或后端 API）。
 *
 * 保留这个服务端壳是为了：
 *
 * 1. 让 Next 在静态导出时**知道**这个路由存在（否则构建期报错）；
 * 2. 给未来的 SEO 元数据留位置（标题、分享卡片）。
 */

import { Suspense } from "react";
import CertificatePageClient from "./CertificatePageClient";

/** 页面标题——静态导出时写进 HTML 的 ``<title>``。 */
export const metadata = {
  title: "结业证书 · 梦想课堂",
  description: "查看与验证梦想课堂的结业证书。",
};

export default function CertificatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-[13px] text-[var(--muted-foreground)]">
            正在载入证书…
          </p>
        </div>
      }
    >
      <CertificatePageClient />
    </Suspense>
  );
}
