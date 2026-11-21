"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Check,
  Copy,
  Download,
  Loader2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import {
  fetchCertificate,
  verifyCertificate,
  type Certificate,
} from "@/lib/progress-api";
import { CertificateSheet } from "@/components/progress/CertificateSheet";
import { HQ_LABEL, PLATFORM_NAME } from "@/lib/branding";

/**
 * 证书独立预览页
 * ==============
 *
 * ``/learning/certificates/<id>``
 *
 * 为什么要独立页
 * --------------
 *
 * 证书是**要被分享出去**的东西。弹窗没法分享——它不是 URL。
 *
 * 独立页有三个好处：
 *
 * 1. **可链接**——把这一页发给任何人，对方看到的就是证书；
 * 2. **可打印**——浏览器直接打印就是一张 A4 横向的证书；
 * 3. **可验证**——页面上有「验证真伪」按钮，当场重算指纹。
 */
export default function CertificateBody({ id }: { id: string }) {
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verify, setVerify] = useState<{ valid: boolean; reason: string } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const record = await fetchCertificate(id);
        if (!alive) return;
        if (!record) {
          setError("证书不存在或已被删除。");
          return;
        }
        setCertificate(record);
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("复制失败——请手动复制地址栏链接。");
    }
  }, []);

  const runVerify = useCallback(async () => {
    try {
      const result = await verifyCertificate(id);
      setVerify({ valid: result.valid, reason: result.reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  return (
    <div className="min-h-full bg-[var(--background)]">
      {/* 顶部条 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-white px-4 py-2.5">
        <Link
          href="/learning/books"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          返回证书墙
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">梦想课堂结业证书</p>
          <p className="text-[10.5px] text-[var(--muted-foreground)]">
            {PLATFORM_NAME} · {HQ_LABEL}
          </p>
        </div>
        {certificate ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runVerify()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[12px] transition-colors hover:bg-[var(--muted)]"
            >
              <ShieldCheck size={12} strokeWidth={2.2} />
              验证真伪
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[12px] transition-colors hover:bg-[var(--muted)]"
            >
              {copied ? (
                <Check size={12} strokeWidth={2.6} className="text-emerald-600" />
              ) : (
                <Copy size={12} strokeWidth={2.2} />
              )}
              复制链接
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Printer size={12} strokeWidth={2.2} />
              打印 / 存为 PDF
            </button>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-[1000px] px-5 py-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
          </div>
        ) : error ? (
          <p className="rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
            {error}
          </p>
        ) : certificate ? (
          <>
            {verify ? (
              <p
                className={`mb-4 rounded-lg px-3 py-2 text-[12px] ${
                  verify.valid
                    ? "bg-emerald-500/8 text-emerald-700"
                    : "bg-[var(--destructive)]/8 text-[var(--destructive)]"
                }`}
              >
                {verify.reason}
              </p>
            ) : null}

            {/* 证书本体 */}
            <div className="overflow-hidden rounded-xl shadow-[0_18px_60px_-24px_rgba(15,23,42,0.55)]">
              <CertificateSheet certificate={certificate} />
            </div>

            {/* 说明 */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <InfoCell
                icon={<Award size={13} strokeWidth={2.2} />}
                label="证书编号"
                value={certificate.number}
                mono
              />
              <InfoCell
                icon={<Download size={13} strokeWidth={2.2} />}
                label="内容指纹"
                value={certificate.fingerprint}
                mono
              />
              <InfoCell
                icon={<ShieldCheck size={13} strokeWidth={2.2} />}
                label="学习覆盖率"
                value={`${Math.round(certificate.coverage * 100)}% · 检测正确率 ${Math.round(certificate.quiz_accuracy * 100)}%`}
              />
            </div>

            <p className="mt-6 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
              本证书由 {PLATFORM_NAME}（{HQ_LABEL}）自动颁发。证书内容由「课程 id +
              学员姓名 + 完成时间 + 学习轨迹」哈希得出，任何一项被改动，指纹都会变化——
              点「验证真伪」即可当场核验。
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

/** 一个小信息格。 */
function InfoCell({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10.5px] text-[var(--muted-foreground)]">
        {icon}
        {label}
      </p>
      <p
        className={`mt-1 truncate text-[12px] ${
          mono ? "font-mono tracking-[0.03em]" : "font-medium"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
