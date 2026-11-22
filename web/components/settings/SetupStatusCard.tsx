"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Loader2,
  XCircle,
} from "lucide-react";
import { apiFetch, apiUrl, isStaticRuntime } from "@/shared/api/client";
import { hasLocalApiKey, hasAiProxy } from "@/lib/local-ai";
import { localUsage } from "@/lib/local-store";

interface SetupStatus {
  status: string;
  needs_setup: boolean;
  has_model: boolean;
  model: string;
  provider: string;
  mode: string;
  hint: string;
}

/**
 * 运行状态卡片。
 *
 * 关键点：这里**不会**用假状态糊弄用户。没配置密钥时明确显示「需要
 * 配置模型」，并指出配置文件的位置——因为平台不再有降级模式，模型
 * 不可用就是不可用。
 *
 * 静态模式
 * --------
 *
 * 纯静态部署（GitHub Pages）**没有后端**——``/api/setup/status``
 * 这个端点根本不存在。所以这里要走另一条路：
 *
 * * 检查浏览器本地存没存 DeepSeek API Key；
 * * 报告本地存储占用；
 * * 用**中性**的措辞说明「这是一个纯静态版本」，而不是甩一个红色
 *   的「后端未连接」。
 */
export function SetupStatusCard() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 是否处于静态模式。 */
  const [staticMode, setStaticMode] = useState(false);
  /** 本地是否配了 DeepSeek Key。 */
  const [localKeyReady, setLocalKeyReady] = useState(false);
  /**
   * 平台是否配置了 AI 转发代理。
   *
   * 配了的话访客**零配置**就能对话——设置页必须如实反映这一点，
   * 否则会误导用户去填一个根本不需要填的 Key。
   */
  const proxyReady = hasAiProxy();
  /** 本地存储占用。 */
  const [usage, setUsage] = useState({ bytes: 0, entries: 0 });

  useEffect(() => {
    let alive = true;

    void (async () => {
      // 先判静态模式。
      const isStatic = await isStaticRuntime();
      if (!alive) return;
      setStaticMode(isStatic);

      if (isStatic) {
        // 静态模式：查本地 Key 与存储占用。
        setLocalKeyReady(hasLocalApiKey());
        setUsage(localUsage());
        return;
      }

      try {
        const response = await apiFetch(apiUrl("/api/setup/status"), {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (alive) setStatus(data as SetupStatus);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ── 静态模式 ──
  //
  // 没有「后端连不上」这回事——**根本没有后端**。
  // 所以这里不能说「后端未连接」，那是误导。
  if (staticMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <HardDrive size={16} className="mt-0.5 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">纯静态版本</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
              这个站点是**完全静态**的——没有后端进程。课程内容随站点一起
              发布，你的笔记、进度与证书保存在**这台设备的浏览器里**。
            </p>
          </div>
        </div>

        <dl className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {[
            ["站点形态", "纯静态（GitHub Pages）"],
            [
              "AI 助教",
              proxyReady
                ? "已接入平台代理（零配置）"
                : localKeyReady
                  ? "已配置本地 Key"
                  : "未配置（使用预装导读）",
            ],
            [
              "本地存档",
              `${usage.entries} 项 · ${(usage.bytes / 1024).toFixed(1)} KB`,
            ],
            ["登录要求", "无（数据存在本机浏览器）"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 px-4 py-2.5"
            >
              <dt className="text-[12px] text-[var(--muted-foreground)]">
                {label}
              </dt>
              <dd className="min-w-0 truncate text-[12px] text-[var(--foreground)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {!proxyReady && !localKeyReady ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-500"
            />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">AI 助教使用预装导读</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                在右上角「学习者」→ 个人档案里填入 DeepSeek API Key，
                就能获得完整的 AI 讲解。Key 只存在这台设备上。
              </p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 p-4">
        <XCircle size={16} className="mt-0.5 shrink-0 text-[var(--destructive)]" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium">后端未连接</p>
          <p className="mt-0.5 text-[11.5px] text-[var(--muted-foreground)]">
            {error}。请确认服务已启动后重试。
          </p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-4 text-[13px] text-[var(--muted-foreground)]">
        <Loader2 size={15} className="animate-spin" />
        正在检查运行状态…
      </div>
    );
  }

  const ready = status.has_model;

  return (
    <div className="space-y-3">
      <div
        className={
          ready
            ? "flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            : "flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"
        }
      >
        {ready ? (
          <CheckCircle2
            size={16}
            className="mt-0.5 shrink-0 text-emerald-500"
          />
        ) : (
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-medium">
            {ready ? "模型已接入" : "需要配置模型"}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
            {ready
              ? `所有回答由 ${status.model} 实时生成。`
              : status.hint ||
                "请在 backend/.env 中填写 DEEPSEEK_API_KEY，然后重启后端服务。"}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {[
          ["运行状态", ready ? "正常" : "未配置模型"],
          ["模型服务", status.has_model ? status.provider : "—"],
          ["模型名称", status.has_model ? status.model : "—"],
          ["登录要求", "无（本地单用户）"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 px-4 py-2.5"
          >
            <dt className="text-[12px] text-[var(--muted-foreground)]">{label}</dt>
            <dd className="min-w-0 truncate text-[12px] text-[var(--foreground)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
