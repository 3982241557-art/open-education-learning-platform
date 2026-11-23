"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  fetchCertificates,
  type Certificate,
} from "@/lib/progress-api";
import { CertificateDialog } from "@/components/progress/CertificateSheet";
import { cn } from "@/lib/cn";
import { useLocale } from "@/context/LocaleContext";

/**
 * 我的证书墙
 * ==========
 *
 * 学情中心里的一个独立板块——集中展示用户拿到的每一张结业证书。
 *
 * 为什么独立成一块
 * ----------------
 *
 * 证书是**结果**，进度是**过程**。把它们放在同一个页面的同一层级里，
 * 会让「我还没拿到证书」显得像一种缺陷。
 *
 * 分开之后：进度区告诉你「你在哪」，证书墙告诉你「你到了哪」。
 *
 * 空状态
 * ------
 *
 * 没有证书时**不藏**——显示清楚的三条领取条件，让用户知道「差什么」。
 * 空白的证书墙会让人以为功能坏了。
 */
export function CertificateWall({
  className = "",
}: {
  className?: string;
}) {
  const { tk } = useLocale();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCertificates(await fetchCertificates());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={cn("mb-8", className)} data-seek-certificate-wall>
      <div className="mb-3 flex items-center gap-2">
        <Award size={15} strokeWidth={2.2} className="text-[#c9a227]" />
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
          {tk("cert.wall")}
        </h2>
        <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
          {certificates.length}
        </span>
      </div>

      {error ? (
        <p className="rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
          {error}
        </p>
      ) : loading ? (
        <p className="flex items-center gap-1.5 py-6 text-[12px] text-[var(--muted-foreground)]">
          <Loader2 size={13} className="animate-spin" />
          {tk("common.loading")}
        </p>
      ) : certificates.length === 0 ? (
        <EmptyCertificateWall />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {certificates.map((certificate) => (
            <li key={certificate.id}>
              <button
                type="button"
                onClick={() => setPreviewId(certificate.id)}
                className="group flex w-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white text-left transition-[border-color,transform] hover:border-[#c9a227]/50 hover:-translate-y-px"
              >
                {/* 缩略图——用深蓝底 + 金色徽标暗示证书的样子。 */}
                <div className="relative flex h-[112px] items-center justify-center overflow-hidden bg-[#1e242b]">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(ellipse 60% 50% at 50% 25%, rgba(201,162,39,0.20), transparent 70%)",
                    }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-[6%] rounded-[2px] border border-[#c9a227]/40"
                  />
                  <Award
                    size={26}
                    strokeWidth={1.5}
                    className="relative text-[#e8ce7a]"
                  />
                  <span className="absolute bottom-2 text-[8px] tracking-[0.3em] text-white/45 uppercase">
                    Certificate
                  </span>
                </div>

                {/* 信息 */}
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-[12.5px] font-medium leading-snug">
                    {certificate.course_title}
                  </p>
                  <p className="mt-1 font-mono text-[10px] tracking-[0.05em] text-[var(--muted-foreground)]">
                    {certificate.number}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-2 text-[10.5px] text-[var(--muted-foreground)]">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={10} strokeWidth={2} />
                      可验证
                    </span>
                    <span className="tabular-nums">
                      {new Date(certificate.completed_at * 1000).toLocaleDateString(
                        "zh-CN",
                      )}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {previewId ? (
        <CertificateDialog
          certificateId={previewId}
          onClose={() => setPreviewId(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * 空态——把领取条件说清楚。
 */
function EmptyCertificateWall() {
  /** 三条领取条件——与后端 :func:`certificate_service.eligibility` 一致。 */
  const conditions = [
    "学习覆盖率 ≥ 95%",
    "随堂检测正确率 ≥ 80%",
    "至少向助教提问 1 次",
  ];

  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-5 py-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
          <GraduationCap size={20} strokeWidth={1.5} />
        </span>
        <p className="mt-2.5 text-[13px] font-medium">
          还没有拿到结业证书
        </p>
        <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-[var(--muted-foreground)]">
          任意一门公开课学完这三项，就会自动解锁「开放教育学习平台结业证书」——
          可预览、可下载、可分享，编号可验证。
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {conditions.map((condition) => (
            <li
              key={condition}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]"
            >
              <CheckCircle2 size={10} strokeWidth={2.2} />
              {condition}
            </li>
          ))}
        </ul>
        <p className="mt-4 inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]/70">
          <Lock size={10} strokeWidth={2} />
          达成条件后自动颁发，无需申请
        </p>
      </div>
    </div>
  );
}
