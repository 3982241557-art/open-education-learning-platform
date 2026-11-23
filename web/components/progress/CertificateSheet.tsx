"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Award,
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  Pencil,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  fetchCertificate,
  updateCertificateName,
  verifyCertificate,
  type Certificate,
} from "@/lib/progress-api";
import {
  HQ_LABEL,
  HQ_LABEL_EN,
  PLATFORM_NAME,
  PLATFORM_NAME_EN,
} from "@/lib/branding";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/static-data";

/**
 * 开放教育学习平台结业证书
 * ==========================
 *
 * 一张**深蓝金边**的学术证书——极简烫金排版。
 *
 * 设计取向
 * --------
 *
 * **深蓝（``#1E242B``）为底，金（``#C9A227``）为线**。
 *
 * 为什么是深蓝而不是白底
 * ----------------------
 *
 * 证书是**要被打印、被贴在简历上、被裱起来**的东西。白底证书在
 * 屏幕上很常见，但打印出来单薄，而且跟本平台的深蓝品牌不呼应。
 *
 * 深蓝底还有一个实际好处：**金色的细线在深底上才立得住**。白底上的
 * 金线会显得灰扑扑的、像褪色了。
 *
 * 排版的三段式
 * ------------
 *
 * .. code-block:: text
 *
 *     ┌─────────────────────────────┐
 *     │  开放教育学习平台 · 深圳后海总部 │  ← 机构
 *     │  ─────────────────────────  │  ← 金线
 *     │      结业证书                │  ← 主体
 *     │  Open Education Learning...  │
 *     │      张三                    │  ← 学员
 *     │   《MIT 线性代数》            │  ← 课程
 *     │  ─────────────────────────  │  ← 金线
 *     │  编号 · 日期       [签章]     │  ← 落款
 *     └─────────────────────────────┘
 *
 * 一切居中——证书是**对称**的，对称才显得庄重。
 *
 * 唯一不居中的元素是落款行：编号和日期靠左，签章靠右。因为落款是
 * 「机构说的话」，它需要跟着机构的视觉重心走，而不是跟证书主体。
 *
 * 烫金效果
 * --------
 *
 * 金色不是纯色 ``#FFD700``——那太亮太廉价。用 ``#C9A227`` 作主色
 * 配 ``#E8CE7A`` 作高光，两者的渐变才有金属的层次感。
 */

/** 证书的固定比例——A4 横向（297 × 210mm）的视觉近似。 */
const CERT_RATIO = "1.414";

/**
 * 证书视觉本体。
 *
 * 拆成一个独立组件是因为它要被用在**三个地方**：
 *
 * * 弹窗预览；
 * * 独立预览页（``/learning/certificates/?id=<id>``）；
 * * 导出 PNG 时的离屏渲染。
 *
 * 三处必须长得**完全一样**——所以不能让它们各写一遍。
 */
export function CertificateSheet({
  certificate,
  className = "",
}: {
  certificate: Certificate;
  className?: string;
}) {
  const completedDate = new Date(certificate.completed_at * 1000);
  const dateText = completedDate.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[#1e242b] text-white",
        className,
      )}
      style={{ aspectRatio: CERT_RATIO }}
      data-seek-certificate-sheet
    >
      {/* ── 底纹：极淡的放射光 ──
       *
       * 一枚偏上的巨大柔光圆。它让大面积的深蓝**不是死板的平涂**，
       * 而是有一点「被照亮」的层次——像证书上覆了一层哑光玻璃。
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 22%, rgba(201,162,39,0.16), transparent 68%), radial-gradient(ellipse 90% 70% at 50% 110%, rgba(30,58,138,0.32), transparent 70%)",
        }}
      />

      {/* ── 双层金框 ──
       *
       * 外框粗一点、内框细一点，中间留一道深色的「沟」。
       * 这正是实体证书的做法——烫金线压出来的凹槽。
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[3.2%] rounded-[3px] border-[1.5px] border-[#c9a227]/70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[5.6%] rounded-[2px] border border-[#c9a227]/35"
      />

      {/* 四角装饰——极简的直角短线，不做花哨的卷草纹。 */}
      {(
        [
          "left-[3.2%] top-[3.2%] border-l-2 border-t-2",
          "right-[3.2%] top-[3.2%] border-r-2 border-t-2",
          "left-[3.2%] bottom-[3.2%] border-b-2 border-l-2",
          "right-[3.2%] bottom-[3.2%] border-b-2 border-r-2",
        ] as const
      ).map((position) => (
        <span
          key={position}
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-5 w-5 border-[#c9a227]",
            position,
          )}
        />
      ))}

      {/* ── 内容 ── */}
      <div className="relative flex h-full flex-col items-center justify-center px-[9%] text-center">
        {/* 机构 */}
        <p className="text-[clamp(9px,1.15vw,15px)] font-medium tracking-[0.3em] text-[#e8ce7a]">
          {PLATFORM_NAME} · {HQ_LABEL}
        </p>
        <p className="mt-[0.5em] text-[clamp(6px,0.72vw,10px)] tracking-[0.24em] text-white/40 uppercase">
          {PLATFORM_NAME_EN} · {HQ_LABEL_EN}
        </p>

        {/* 金线 */}
        <span
          aria-hidden
          className="mt-[2.4%] block h-px w-[46%]"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(201,162,39,0.75), transparent)",
          }}
        />

        {/* 主体 */}
        <h2 className="mt-[2.6%] text-[clamp(14px,2.5vw,34px)] font-semibold tracking-[0.22em] text-white">
          结业证书
        </h2>
        <p className="mt-[0.4em] text-[clamp(6px,0.8vw,11px)] tracking-[0.42em] text-white/45 uppercase">
          Certificate of Completion
        </p>

        {/* 学员 */}
        <p className="mt-[3.2%] text-[clamp(8px,0.95vw,13px)] text-white/55">
          兹证明
        </p>
        <p className="mt-[0.7em] text-[clamp(16px,2.9vw,40px)] font-medium tracking-[0.12em] text-[#e8ce7a]">
          {certificate.learner_name}
        </p>
        <span
          aria-hidden
          className="mt-[0.6em] block h-px w-[34%]"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(232,206,122,0.55), transparent)",
          }}
        />

        {/* 课程 */}
        <p className="mt-[2.4%] text-[clamp(8px,0.95vw,13px)] text-white/55">
          已完成课程
        </p>
        <p className="mt-[0.6em] max-w-[78%] text-[clamp(11px,1.55vw,21px)] font-medium leading-snug">
          《{certificate.course_title}》
        </p>
        {certificate.course_title_en ? (
          <p className="mt-[0.5em] text-[clamp(6px,0.78vw,11px)] text-white/40">
            {certificate.course_title_en}
          </p>
        ) : null}

        {/* 落款行 */}
        <div className="mt-auto flex w-full items-end justify-between pt-[3%] text-left">
          <div>
            <p className="text-[clamp(6px,0.72vw,10px)] tracking-[0.16em] text-white/40 uppercase">
              Certificate No.
            </p>
            <p className="mt-[0.4em] font-mono text-[clamp(8px,1vw,13px)] tracking-[0.08em] text-[#e8ce7a]">
              {certificate.number}
            </p>
            <p className="mt-[1.1em] text-[clamp(6px,0.72vw,10px)] tracking-[0.16em] text-white/40 uppercase">
              Date of Completion
            </p>
            <p className="mt-[0.4em] text-[clamp(8px,0.95vw,13px)] text-white/75">
              {dateText}
            </p>
          </div>

          {/* 官方电子签章 */}
          <div className="flex flex-col items-center">
            <span
              aria-hidden
              className="flex h-[clamp(38px,6vw,76px)] w-[clamp(38px,6vw,76px)] items-center justify-center rounded-full border-[1.5px] border-[#c9a227]/60 text-[#e8ce7a]"
            >
              <Award size="clamp(18px,2.8vw,36px)" strokeWidth={1.6} />
            </span>
            <p className="mt-[0.7em] text-[clamp(6px,0.72vw,10px)] tracking-[0.16em] text-white/45 uppercase">
              Official Seal
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 证书弹窗
 * ==========
 *
 * 预览 + 改名 + 下载 + 分享，一个弹窗全搞定。
 *
 * 弹窗而不是直接跳转
 * ------------------
 *
 * 用户点「我的证书」时**想先看一眼**，而不是被扔到一个新页面。
 * 弹窗给出即时反馈；确认了再进独立预览页（可分享、可打印）。
 */
export function CertificateDialog({
  certificateId,
  onClose,
}: {
  certificateId: string;
  onClose: () => void;
}) {
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    reason: string;
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const record = await fetchCertificate(certificateId);
      if (!record) {
        setError("证书不存在");
        return;
      }
      setCertificate(record);
      setNameDraft(record.learner_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [certificateId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Esc 关闭。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const saveName = async () => {
    if (!certificate) return;
    setSavingName(true);
    try {
      const updated = await updateCertificateName(certificate.id, nameDraft);
      setCertificate(updated);
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  };

  /**
   * 下载 PNG。
   *
   * 用 ``html2canvas`` 把证书 DOM 画成图片。没有这个依赖时退回到
   * 「打印 / 另存为 PDF」——这仍然能拿到高清版本，因为浏览器打印是
   * 矢量输出。
   */
  const download = useCallback(async () => {
    const node = sheetRef.current;
    if (!node) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(node, {
        backgroundColor: "#1e242b",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `${certificate?.number ?? "certificate"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // 没有 html2canvas 也能拿到高清图——打印路径。
      window.print();
    }
  }, [certificate]);

  /** 复制验证链接。 */
  const copyLink = useCallback(async () => {
    if (!certificate) return;
    // 证书链接用**查询参数**——静态站点上路径参数形式的链接会 404。
    // 详见 ``app/(workspace)/learning/certificates/CERTIFICATE_ROUTE.md``。
    const url = `${window.location.origin}${BASE_PATH}/learning/certificates/?id=${encodeURIComponent(certificate.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("复制失败——请手动复制地址栏链接。");
    }
  }, [certificate]);

  /** 生成验证结果。 */
  const runVerify = useCallback(async () => {
    if (!certificate) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyCertificate(certificate.id);
      setVerifyResult({ valid: result.valid, reason: result.reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }, [certificate]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,36,43,0.55)] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="结业证书"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Award size={16} strokeWidth={2.2} className="text-[#c9a227]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold">开放教育学习平台结业证书</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Certificate of Completion
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        {/* 主体 */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--muted)]/35 p-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : error ? (
            <p className="rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
              {error}
            </p>
          ) : certificate ? (
            <div ref={sheetRef}>
              <CertificateSheet certificate={certificate} />
            </div>
          ) : null}
        </div>

        {/* 操作栏 */}
        {certificate ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-white px-4 py-3">
            {/* 学员姓名 */}
            <div className="mb-3 flex items-center gap-2">
              {editingName ? (
                <>
                  <input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    aria-label="学员姓名"
                    className="h-8 flex-1 rounded-lg border border-[var(--border)] px-2.5 text-[12.5px] outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => void saveName()}
                    disabled={savingName || !nameDraft.trim()}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--primary)] px-3 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {savingName ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} strokeWidth={2.6} />
                    )}
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(certificate.learner_name);
                    }}
                    className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] px-3 text-[12px] text-[var(--muted-foreground)]"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[11.5px] text-[var(--muted-foreground)]">
                    学员姓名
                  </span>
                  <span className="text-[12.5px] font-medium">
                    {certificate.learner_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    <Pencil size={10} strokeWidth={2.2} />
                    修改
                  </button>
                </>
              )}
            </div>

            {/* 验证结果 */}
            {verifyResult ? (
              <p
                className={cn(
                  "mb-3 rounded-lg px-3 py-2 text-[11.5px]",
                  verifyResult.valid
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-[var(--destructive)]/8 text-[var(--destructive)]",
                )}
              >
                {verifyResult.reason}
              </p>
            ) : null}

            {/* 按钮组 */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void download()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <Download size={12} strokeWidth={2.2} />
                下载高清证书（PNG）
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
              >
                {copied ? (
                  <Check size={12} strokeWidth={2.6} className="text-emerald-600" />
                ) : (
                  <Copy size={12} strokeWidth={2.2} />
                )}
                {copied ? "已复制验证链接" : "复制验证链接"}
              </button>
              <button
                type="button"
                onClick={() => void runVerify()}
                disabled={verifying}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
              >
                {verifying ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ShieldCheck size={12} strokeWidth={2.2} />
                )}
                验证真伪
              </button>
              <a
                href={`/learning/certificates/?id=${encodeURIComponent(certificate.id)}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
              >
                <Link2 size={12} strokeWidth={2.2} />
                独立预览页
              </a>
              <button
                type="button"
                onClick={() => void download()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] md:hidden"
              >
                <Share2 size={12} strokeWidth={2.2} />
                分享海报
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
