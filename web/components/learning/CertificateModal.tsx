"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * K12 修习证书
 * ============
 *
 * 「梦想课堂（深圳后海总部）· OE 开放教育 K12 同步修习证书」。
 *
 * 证书内容
 * --------
 *
 * * 学员姓名；
 * * 学段与课程全称（例：``小学四年级数学（上册）人教版同步精讲``）；
 * * 完成课时数 / 系列总课时数；
 * * 随堂测验掌握度（平均正确率）；
 * * 唯一防伪编号；
 * * 官方电子签章。
 *
 * 存档
 * ----
 *
 * 颁发后写入 ``dreamclass.certificates``——学情中心的「证书墙」从
 * 同一个键里读。两边数据永远一致。
 */

/** 一张证书。 */
export interface K12Certificate {
  /** 防伪编号。 */
  serial: string;
  /** 学员姓名。 */
  learnerName: string;
  /** 课程全称。 */
  courseTitle: string;
  /** 学段名。 */
  stageName: string;
  /** 完成课时数。 */
  completedLessons: number;
  /** 系列总课时数。 */
  totalLessons: number;
  /** 随堂测验平均掌握度（0–1）。 */
  mastery: number;
  /** 颁发时间（Unix 毫秒）。 */
  issuedAt: number;
  /** 电子签章文案。 */
  issuer: string;
}

/** localStorage 的键。 */
const STORAGE_KEY = "dreamclass.certificates";

/**
 * 生成防伪编号。
 *
 * 格式：``OE-K12-<年级><学科码>-<随机 6 位>-<时间戳 base36>``。
 *
 * 它**不是**安全凭证，只是一个「唯一且可追溯」的标识——
 * 用户能拿它跟证书墙上的记录对上。
 */
export function buildCertificateSerial(
  grade: number,
  subject: "chinese" | "math",
): string {
  const subjectCode = subject === "chinese" ? "YW" : "SX";
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `OE-K12-${String(grade).padStart(2, "0")}${subjectCode}-${random}-${stamp}`;
}

/** 读出全部证书。 */
export function readCertificates(): K12Certificate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 写入证书（**去重**——同一张不重复发）。 */
export function saveCertificate(certificate: K12Certificate): boolean {
  if (typeof window === "undefined") return false;
  try {
    const list = readCertificates();
    if (list.some((item) => item.serial === certificate.serial)) return false;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([certificate, ...list]),
    );
    return true;
  } catch {
    return false;
  }
}

/** 组件属性。 */
export interface CertificateModalProps {
  /** 是否打开。 */
  open: boolean;
  /** 关闭回调。 */
  onClose: () => void;
  /** 证书数据。 */
  certificate: K12Certificate | null;
  /** 小学部（更圆润、活泼）。 */
  playful?: boolean;
}

export function CertificateModal({
  open,
  onClose,
  certificate,
  playful = false,
}: CertificateModalProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  /** 掌握度百分比。 */
  const masteryPercent = useMemo(
    () =>
      certificate ? Math.round(certificate.mastery * 100) : 0,
    [certificate],
  );

  if (!open || !certificate) return null;

  /** 复制编号。 */
  const copySerial = async () => {
    try {
      await navigator.clipboard.writeText(certificate.serial);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 剪贴板不可用——忽略 */
    }
  };

  /** 下载证书——渲染成 PNG。 */
  const download = () => {
    // 用 canvas 直接绘制，保证「高清下载」是真高清（2x DPR）。
    const scale = 2;
    const width = 1000;
    const height = 707;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    // 背景——深蓝渐变 + 白纸卡。
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(1, "#1e3a8a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const pad = 46;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pad, pad, width - pad * 2, height - pad * 2);

    // 细边。
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + 14, pad + 14, width - (pad + 14) * 2, height - (pad + 14) * 2);

    ctx.textAlign = "center";

    ctx.fillStyle = "#1d4ed8";
    ctx.font = "600 17px 'PingFang SC', sans-serif";
    ctx.fillText("梦想课堂（深圳后海总部）", width / 2, pad + 78);

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 33px 'PingFang SC', sans-serif";
    ctx.fillText("OE 开放教育 K12 同步修习证书", width / 2, pad + 128);

    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(width / 2 - 190, pad + 152);
    ctx.lineTo(width / 2 + 190, pad + 152);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "14px 'PingFang SC', sans-serif";
    ctx.fillText("兹证明", width / 2, pad + 190);

    ctx.fillStyle = "#0f172a";
    ctx.font = "600 27px 'PingFang SC', sans-serif";
    ctx.fillText(certificate.learnerName, width / 2, pad + 232);

    ctx.fillStyle = "#475569";
    ctx.font = "15px 'PingFang SC', sans-serif";
    ctx.fillText(
      `已修习「${certificate.courseTitle}」全部 ${certificate.completedLessons} 课时`,
      width / 2,
      pad + 278,
    );

    ctx.fillStyle = "#1d4ed8";
    ctx.font = "600 15px 'PingFang SC', sans-serif";
    ctx.fillText(
      `随堂测验平均掌握度 ${masteryPercent}%`,
      width / 2,
      pad + 316,
    );

    // 电子签章。
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(width - 178, height - 150, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "600 13px 'PingFang SC', sans-serif";
    ctx.fillText("OE", width - 178, height - 146);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px 'PingFang SC', sans-serif";
    ctx.fillText("开放教育", width - 178, height - 130);

    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'PingFang SC', sans-serif";
    ctx.fillText(
      `防伪编号：${certificate.serial}`,
      pad + 40,
      height - pad - 42,
    );
    ctx.fillText(
      `颁发日期：${new Date(certificate.issuedAt).toLocaleDateString("zh-CN")}`,
      pad + 40,
      height - pad - 24,
    );

    const link = document.createElement("a");
    link.download = `OE-K12-${certificate.serial}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-md motion-safe:animate-[diagnostic-backdrop-in_300ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="K12 修习证书"
    >
      <div
        className={cn(
          "relative w-full max-w-[680px] overflow-hidden",
          playful ? "rounded-2xl" : "rounded-xl",
          "border border-white/60 bg-white/72 shadow-[0_24px_70px_-12px_rgba(15,23,42,0.35)] backdrop-blur-2xl",
          "motion-safe:animate-[diagnostic-in_420ms_cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/70 via-white/15 to-transparent"
        />

        <div className="relative max-h-[88vh] overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-slate-900">
                🎓 K12 同步修习证书
              </h2>
              <p className="mt-1 text-[12px] text-slate-600">
                学完一整套年级系列后颁发——已同步归档至学情中心证书墙。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-700"
            >
              <X size={15} strokeWidth={2.2} />
            </button>
          </div>

          {/* ── 证书本体 ── */}
          <div
            className={cn(
              "relative overflow-hidden border border-slate-900/[0.08] bg-white",
              playful ? "rounded-2xl" : "rounded-lg",
            )}
          >
            {/* 深蓝顶栏。 */}
            <div className="bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] px-5 py-4 text-center">
              <p className="text-[11px] font-medium tracking-[0.08em] text-white/70">
                梦想课堂（深圳后海总部）
              </p>
              <p className="mt-1 text-[15px] font-bold tracking-[-0.01em] text-white">
                OE 开放教育 K12 同步修习证书
              </p>
            </div>

            <div className="px-5 py-5 text-center">
              <p className="text-[12px] text-slate-500">兹证明</p>
              <p className="mt-1.5 text-[21px] font-semibold tracking-[-0.015em] text-slate-900">
                {certificate.learnerName}
              </p>

              <p className="mx-auto mt-3 max-w-[440px] text-[13px] leading-relaxed text-slate-600">
                已修习「{certificate.courseTitle}」全部{" "}
                <span className="font-medium tabular-nums text-slate-900">
                  {certificate.completedLessons}
                </span>{" "}
                课时，随堂测验平均掌握度{" "}
                <span className="font-medium tabular-nums text-blue-700">
                  {masteryPercent}%
                </span>
              </p>

              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="rounded-full bg-blue-600/[0.09] px-2.5 py-1 text-[11px] font-medium text-blue-800">
                  {certificate.stageName}
                </span>
                <span className="rounded-full bg-slate-900/[0.05] px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {certificate.completedLessons} / {certificate.totalLessons} 课时
                </span>
              </div>

              {/* 电子签章。 */}
              <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-900/[0.07] pt-4 text-left">
                <div className="min-w-0">
                  <p className="text-[10.5px] text-slate-400">防伪编号</p>
                  <button
                    type="button"
                    onClick={() => void copySerial()}
                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-slate-700 transition-colors hover:text-blue-700"
                    title="点击复制"
                  >
                    {certificate.serial}
                    {copied ? (
                      <Check size={11} strokeWidth={2.6} className="text-emerald-600" />
                    ) : (
                      <Copy size={11} strokeWidth={2.2} className="text-slate-400" />
                    )}
                  </button>
                  <p className="mt-1.5 text-[10.5px] text-slate-400">
                    颁发日期：{new Date(certificate.issuedAt).toLocaleDateString("zh-CN")}
                  </p>
                </div>

                {/* 签章。 */}
                <div className="shrink-0 text-center">
                  <svg viewBox="0 0 72 72" className="h-14 w-14">
                    <circle
                      cx="36"
                      cy="36"
                      r="30"
                      fill="none"
                      stroke="#1d4ed8"
                      strokeWidth="2.5"
                    />
                    <circle
                      cx="36"
                      cy="36"
                      r="25"
                      fill="none"
                      stroke="#1d4ed8"
                      strokeWidth="0.8"
                      opacity="0.45"
                    />
                    <text
                      x="36"
                      y="33"
                      textAnchor="middle"
                      fontSize="15"
                      fontWeight="700"
                      fill="#1d4ed8"
                    >
                      OE
                    </text>
                    <text
                      x="36"
                      y="47"
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#1d4ed8"
                      opacity="0.85"
                    >
                      开放教育
                    </text>
                  </svg>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {certificate.issuer}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── 操作 ── */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11.5px] text-slate-500">
              {saved ? "已归档至学情中心证书墙" : "下载后可分享给家长或老师"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/[0.12] bg-white/70 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:bg-white"
              >
                <Download size={12} strokeWidth={2.2} />
                高清下载
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    typeof navigator !== "undefined" &&
                    "share" in navigator
                  ) {
                    void (navigator as any).share({
                      title: "OE K12 修习证书",
                      text: `${certificate.learnerName} 完成了《${certificate.courseTitle}》`,
                    });
                    return;
                  }
                  void copySerial();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <Share2 size={12} strokeWidth={2.2} />
                分享
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
