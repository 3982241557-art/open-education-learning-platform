"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import CertificateBody from "./CertificateBody";

/**
 * 证书独立预览页（客户端壳）
 * ==========================
 *
 * 真正的证书 id 在**查询参数**里（``?id=...``）——见
 * ``CERTIFICATE_ROUTE.md`` 里为什么不用路径参数。
 *
 * ``useSearchParams`` 需要 ``Suspense`` 包裹——在静态导出下，
 * Next 会把用了它的组件推迟到客户端渲染，否则整页都无法预渲染。
 */
function CertificatePageClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  return <CertificateBody id={id} />;
}

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
