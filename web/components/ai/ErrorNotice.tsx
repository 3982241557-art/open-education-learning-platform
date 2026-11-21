"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 优雅的错误提示
 * ===============
 *
 * 后端的错误是给**开发者**看的：「401」「LLMNotConfiguredError」
 * 「Request failed: 502」「模型请求失败：Connection refused」。
 *
 * 这些直接甩给用户毫无意义——用户不知道该怎么办，只会以为是自己
 * 操作错了。这个组件把原始错误**翻译成一句话人话** + 一个明确的
 * 下一步动作。
 *
 * 原始错误仍然保留在 ``title`` 里——鼠标悬停能看到，方便反馈 bug
 * 时复制粘贴，但它不再占据视觉中心。
 */

/**
 * 判断一个错误是不是「连不上后端」。
 *
 * 和 {@link humanizeError} 分开，因为两者的**处置方式**不同：
 * 连不上后端要提示用户「去把服务启动起来」，而不是「重试一下
 * 问法」。课程页曾经不管什么原因都写「课程不存在」——服务没起
 * 时课程明明就在那儿，这话会让人以为是数据丢了。
 */
export function isConnectivityError(raw: string | null | undefined): boolean {
  const text = (raw || "").trim().toLowerCase();
  if (!text) return false;
  return (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network error") ||
    text.includes("err_network") ||
    text.includes("econnrefused") ||
    text.includes("load failed") ||
    text.includes("connection refused") ||
    text.includes("connectionreset") ||
    // API 客户端在「rewrite 代理连不上上游」时给出的标记文案。
    text.includes("连不上后端")
  );
}

/** 把后端的原始错误翻译成用户能懂的一句话。 */
export function humanizeError(raw: string): string {
  const text = (raw || "").trim();
  if (!text) return "出了点问题，请再试一次。";

  const lower = text.toLowerCase();

  // 没配密钥
  if (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("not configured") ||
    lower.includes("未配置") ||
    lower.includes("密钥")
  ) {
    return "AI 还没接上。请在「设置」里填好模型密钥，它才能开始回答。";
  }

  // 连不上后端
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("connection refused") ||
    lower.includes("load failed")
  ) {
    return "连不上后端服务。请确认它已经启动，然后重试。";
  }

  // 超时
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("超时")) {
    return "等太久了，模型还没回话。可以再问一次，或把问题拆小一点。";
  }

  // 限流
  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("限流")
  ) {
    return "请求太密集了，歇一下再问。";
  }

  // 鉴权
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("鉴权")) {
    return "身份没通过验证。请检查后端的访问密钥配置。";
  }

  // 服务端错误
  if (lower.includes("500") || lower.includes("502") || lower.includes("503")) {
    return "服务端暂时出了点状况。稍等片刻再试一次。";
  }

  // 模型自己报的错（模型请求失败：xxx）
  const inner = text.match(/模型请求失败[:：]\s*(.+)/);
  if (inner) {
    return `模型这次没能正常回答：${inner[1].slice(0, 80)}`;
  }

  // 兜底：不要把一整串堆栈甩给用户。
  return "这次没能得到回答。请重试，或换个说法再问一次。";
}

export function ErrorNotice({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  /** 重试动作——不传就不显示按钮。 */
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      title={message}
      className={cn(
        "flex items-start gap-2 rounded-lg border border-[var(--destructive)]/20",
        "bg-[var(--destructive)]/5 px-2.5 py-2 text-[11.5px] leading-relaxed",
        "text-[var(--foreground)]",
        className,
      )}
    >
      <TriangleAlert
        size={12}
        strokeWidth={2}
        className="mt-[2px] shrink-0 text-[var(--destructive)]"
      />
      <span className="min-w-0 flex-1">{humanizeError(message)}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <RefreshCw size={10} strokeWidth={2} />
          重试
        </button>
      )}
    </div>
  );
}
