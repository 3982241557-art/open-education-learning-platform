"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  Download,
  ExternalLink,
  FolderOpen,
  Github,
  Loader2,
  Square,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { apiFetch, apiUrl, asJsonOrThrow } from "@/shared/api/client";

/**
 * GitHub 开源教育资源审核台
 * ==========================
 *
 * 一张**待审**的清单——不是课程数据。
 *
 * 为什么要「先筛后审」
 * ------------------
 *
 * GitHub 上「教育相关」的仓库有几万个。自动筛选能把候选压到几十个，
 * 但**压不掉质量**——自动筛选只看得见 star 数、目录结构和关键词，
 * 它看不见「这个项目实际能不能跑」「课程内容是不是还在维护」。
 *
 * 所以流程必须是：**机器粗筛 → 大白话解读 → 人工细审 → 才入库**。
 *
 * 每条都带四个判断依据
 * --------------------
 *
 * 1. **它到底是什么**——一句小学生都能听懂的大白话；
 * 2. **对学习者有什么用**——点进去能学到什么，有无视频 / 练习 / 作业；
 * 3. **我们平台能拿它做什么**——明确的落地建议；
 * 4. **分类与推荐星级**——「线上教育成品」还是「学历文凭体系」，1~5 星。
 *
 * 有了这四样，审核者**不点进仓库**也能做初筛。
 *
 * 大白话从哪来
 * ------------
 *
 * 由 DeepSeek 批量翻译生成，原始英文 README **不会**直接出现在这里。
 * 翻译失败的项目会明确标注「尚未翻译」，而不是拿机器摘要冒充——
 * 一句看起来可信但其实是编的大白话，比一句英文描述更有害。
 */

/** 一条大白话审核卡。 */
export interface GithubPlainCard {
  /** 它到底是什么。 */
  what_it_is: string;
  /** 对学习者有什么用。 */
  learner_value: string;
  /** 我们平台能拿它做什么。 */
  platform_use: string;
  /** 「线上教育成品」/「学历/文凭体系」。 */
  kind: string;
  /** 1~5 星。 */
  stars: number;
}

export interface GithubCandidate {
  id: string;
  full_name: string;
  html_url: string;
  description: string;
  owner: string;
  stars: number;
  forks: number;
  language: string;
  topics: string[];
  license: string;
  pushed_at: string;
  homepage: string;
  /** ``线上教育成品`` / ``学历/文凭体系``。 */
  kind: string;
  /** 中文摘要。 */
  summary: string;
  /** 推荐接入方式。 */
  integration: string;
  score: number;
  score_reasons: string[];
  /** ``pending`` / ``approved`` / ``ignored``。 */
  approval: string;
  strategies: string[];
  /** DeepSeek 生成的大白话审核卡（可能缺失）。 */
  plain?: GithubPlainCard | null;
}

export interface GithubReviewPayload {
  updated_at: string;
  description: string;
  notice: string;
  strategies: Array<{
    id: string;
    title: string;
    kind: string;
    blurb: string;
  }>;
  summary: {
    total: number;
    by_kind: Record<string, number>;
    by_strategy: Record<string, number>;
    approved: number;
    pending: number;
    ignored: number;
  };
  /** 大白话翻译覆盖率统计。 */
  plain_summary?: {
    total: number;
    translated: number;
    by_stars: Record<string, number>;
    by_kind: Record<string, number>;
  };
  candidates: GithubCandidate[];
}

/** 单条全览的返回。 */
interface InspectResult {
  ok: boolean;
  full_name: string;
  message: string;
  local_path?: string;
  folders: Array<{ path: string; doc_count: number; file_count: number }>;
  files: Array<{ name: string }>;
  doc_count?: number;
  plain: {
    summary?: string;
    folders?: Array<{ path: string; plain: string }>;
    modules?: Array<{ name: string; plain: string }>;
    ready_to_teach?: string;
  } | null;
}

/**
 * 一张**星级**过滤器。
 *
 * 星级来自 DeepSeek 的判断，不是星数。筛选按钮上显示「4★ 及以上」
 * 这种说法——比数字本身更明确。
 */
function StarFilter({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="推荐星级">
      {[0, 5, 4, 3].map((threshold) => (
        <button
          key={threshold}
          type="button"
          onClick={() => onChange(threshold)}
          aria-pressed={value === threshold}
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] transition-colors",
            value === threshold
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
          )}
        >
          {threshold === 0
            ? "全部"
            : threshold === 5
              ? "★★★★★"
              : `${threshold}★+`}
        </button>
      ))}
    </div>
  );
}

/**
 * 单条全览抽屉。
 */
function InspectDrawer({
  candidate,
  onClose,
}: {
  candidate: GithubCandidate | null;
  onClose: () => void;
}) {
  const [result, setResult] = useState<InspectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 换一条就重置。
  useEffect(() => {
    setResult(null);
    setError(null);
    if (!candidate) return;

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await apiFetch(
          apiUrl(
            `/api/resources/github/inspect/${encodeURIComponent(
              candidate.owner,
            )}/${encodeURIComponent(candidate.full_name.split("/")[1] ?? "")}`,
          ),
          { cache: "no-store" },
        );
        const data = (await asJsonOrThrow(response)) as InspectResult;
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "拉取仓库失败。",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [candidate]);

  if (!candidate) return null;

  /** 把「机器目录」和「大白话目录」对齐——按路径匹配。 */
  const plainFolderMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of result?.plain?.folders ?? []) {
      map.set(item.path, item.plain);
    }
    return map;
  }, [result]);

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-[rgba(30,36,43,0.45)]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="单条全览"
    >
      <aside
        className="flex h-full w-full max-w-[560px] flex-col overflow-hidden bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10.5px] tracking-[0.16em] text-[var(--primary)] uppercase">
              <FolderOpen size={11} strokeWidth={2.2} />
              单条全览
            </p>
            <a
              href={candidate.html_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex min-w-0 items-center gap-1 text-[14px] font-medium hover:text-[var(--primary)]"
            >
              <span className="truncate">{candidate.full_name}</span>
              <ExternalLink size={11} strokeWidth={2.2} className="shrink-0 opacity-50" />
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-[12px] text-[var(--muted-foreground)]">
              <Loader2 size={13} className="animate-spin" />
              正在拉取仓库目录并翻译成大白话…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
              {error}
            </p>
          ) : result ? (
            <div className="space-y-4">
              {!result.ok ? (
                <p className="rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
                  {result.message}
                </p>
              ) : null}

              {/* 一句话概括 */}
              {result.plain?.summary ? (
                <p className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5 text-[12.5px] leading-relaxed">
                  {result.plain.summary}
                </p>
              ) : null}

              {/* 课程模块 */}
              {result.plain?.modules && result.plain.modules.length > 0 ? (
                <section>
                  <h3 className="mb-1.5 text-[12px] font-medium">
                    课程模块
                  </h3>
                  <ul className="space-y-1.5">
                    {result.plain.modules.map((module, index) => (
                      <li
                        key={index}
                        className="rounded-lg border border-[var(--border)] px-2.5 py-2"
                      >
                        <p className="text-[12px] font-medium">{module.name}</p>
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                          {module.plain}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* 目录结构 */}
              <section>
                <h3 className="mb-1.5 text-[12px] font-medium">
                  目录结构
                  <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">
                    {result.folders.length} 个目录 ·{" "}
                    {result.doc_count ?? 0} 份文档
                  </span>
                </h3>
                <ul className="space-y-1">
                  {result.folders.map((folder) => (
                    <li
                      key={folder.path}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11.5px] text-[var(--foreground)]">
                          {folder.path}
                        </span>
                        <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-[var(--muted-foreground)]">
                          {folder.file_count} 文件 / {folder.doc_count} 文档
                        </span>
                      </div>
                      {plainFolderMap.get(folder.path) ? (
                        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                          {plainFolderMap.get(folder.path)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              {/* 能不能直接开课 */}
              {result.plain?.ready_to_teach ? (
                <section className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2.5">
                  <h3 className="text-[12px] font-medium text-[var(--primary)]">
                    能不能直接开课？
                  </h3>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                    {result.plain.ready_to_teach}
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/**
 * 审核台。
 *
 * 它是一个**抽屉里的标签页**——不是独立页面。理由：审核是公开课大厅
 * 管理流程的一部分，用户在浏览课程的同时切换过去看一眼，比专门开一个
 * 页面更顺手。
 */
export function GithubReviewConsole({
  payload,
  onApprovalChange,
  onFetchApproved,
  fetching = false,
  className = "",
}: {
  /** 后端返回的清单。 */
  payload: GithubReviewPayload | null;
  /** 勾选状态变化。 */
  onApprovalChange?: (candidateId: string, approval: string) => void;
  /** 一键拉取已审核项目。 */
  onFetchApproved?: () => void;
  /** 拉取中。 */
  fetching?: boolean;
  className?: string;
}) {
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [starFilter, setStarFilter] = useState<number>(0);
  const [inspecting, setInspecting] = useState<GithubCandidate | null>(null);

  const candidates = useMemo(
    () => payload?.candidates ?? [],
    [payload],
  );

  const approvedCount = candidates.filter(
    (item) => item.approval === "approved",
  ).length;

  const kinds = useMemo(() => {
    const set = new Set(candidates.map((item) => item.kind));
    return Array.from(set);
  }, [candidates]);

  /** 分类 + 星级双重筛选。 */
  const filtered = useMemo(() => {
    return candidates.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (starFilter > 0) {
        const stars = item.plain?.stars ?? 0;
        if (stars < starFilter) return false;
      }
      return true;
    });
  }, [candidates, kindFilter, starFilter]);

  /** 翻译覆盖率。 */
  const translatedCount = useMemo(
    () => candidates.filter((item) => item.plain?.what_it_is).length,
    [candidates],
  );

  const toggle = useCallback(
    (candidate: GithubCandidate) => {
      if (!onApprovalChange) return;
      onApprovalChange(
        candidate.id,
        candidate.approval === "approved" ? "ignored" : "approved",
      );
    },
    [onApprovalChange],
  );

  if (!payload) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-[var(--muted-foreground)]">
        <Loader2 size={13} className="animate-spin" />
        正在加载候选清单…
      </div>
    );
  }

  return (
    <div
      className={cn("flex min-h-0 flex-col", className)}
      data-seek-github-review
    >
      {/* ── 说明条 ── */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--seek-warm)] px-3 py-2.5">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--seek-muted-foreground)]">
          <AlertTriangle size={12} strokeWidth={2.2} className="mt-px shrink-0" />
          <span>
            {payload.notice}
            {translatedCount > 0 ? (
              <>
                {" "}
                <span className="font-medium">
                  {translatedCount}/{candidates.length}
                </span>{" "}
                条已由 DeepSeek 翻译成大白话。
              </>
            ) : null}
          </span>
        </p>
      </div>

      {/* ── 工具条 ── */}
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--muted-foreground)]">
            <Github size={12} strokeWidth={2.2} />
            共 {candidates.length} 个候选
          </span>
          <div className="h-3 w-px bg-[var(--border)]" />
          <span className="text-[11.5px] tabular-nums text-[var(--muted-foreground)]">
            已批准{" "}
            <span className="font-medium text-emerald-600">{approvedCount}</span>
          </span>

          {/* 分类筛选 */}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setKindFilter("all")}
              aria-pressed={kindFilter === "all"}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                kindFilter === "all"
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
              )}
            >
              全部
            </button>
            {kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(kind)}
                aria-pressed={kindFilter === kind}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                  kindFilter === kind
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                )}
              >
                {kind}
              </button>
            ))}
          </div>
        </div>

        {/* 星级筛选 */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
            <Star size={10} strokeWidth={2.2} />
            推荐星级
          </span>
          <StarFilter value={starFilter} onChange={setStarFilter} />
        </div>

        {/* 一键拉取 */}
        {onFetchApproved ? (
          <button
            type="button"
            onClick={onFetchApproved}
            disabled={approvedCount === 0 || fetching}
            className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {fetching ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Download size={13} strokeWidth={2.2} />
            )}
            {fetching
              ? "正在拉取并装配…"
              : `开始拉取已选项目（${approvedCount}）`}
          </button>
        ) : null}
      </div>

      {/* ── 清单 ── */}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-4 py-10 text-center text-[12px] text-[var(--muted-foreground)]">
            没有匹配的候选。
          </li>
        ) : (
          filtered.map((candidate) => {
            const plain = candidate.plain;
            return (
              <li
                key={candidate.id}
                className={cn(
                  "border-b border-[var(--border)] px-3 py-2.5 transition-colors",
                  candidate.approval === "approved"
                    ? "bg-emerald-50"
                    : candidate.approval === "ignored"
                      ? "opacity-45"
                      : "",
                )}
              >
                <div className="flex items-start gap-2.5">
                  {/* 勾选框 */}
                  <button
                    type="button"
                    onClick={() => toggle(candidate)}
                    aria-pressed={candidate.approval === "approved"}
                    title={
                      candidate.approval === "approved" ? "取消批准" : "批准接入"
                    }
                    className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                  >
                    {candidate.approval === "approved" ? (
                      <CheckSquare
                        size={16}
                        strokeWidth={2.2}
                        className="text-emerald-600"
                      />
                    ) : (
                      <Square size={16} strokeWidth={2.2} />
                    )}
                  </button>

                  {/* 内容 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={candidate.html_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex min-w-0 items-center gap-1 text-[12.5px] font-medium hover:text-[var(--primary)]"
                      >
                        <span className="truncate">{candidate.full_name}</span>
                        <ExternalLink
                          size={10}
                          strokeWidth={2.2}
                          className="shrink-0 opacity-50"
                        />
                      </a>
                      <span className="shrink-0 text-[11px] tracking-tight text-[#a48a5e]">
                        {"★".repeat(plain?.stars ?? 0)}
                        <span className="text-[var(--muted-foreground)]/40">
                          {"★".repeat(5 - (plain?.stars ?? 0))}
                        </span>
                      </span>
                    </div>

                    {/* 元信息行 */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-[var(--muted-foreground)]">
                      <span className="inline-flex items-center gap-0.5">
                        <Star size={10} strokeWidth={2} />
                        <span className="tabular-nums">{candidate.stars}</span>
                      </span>
                      {candidate.language ? (
                        <span>{candidate.language}</span>
                      ) : null}
                      <span className="rounded-full bg-[var(--seek-bean-soft)] px-1.5 py-px text-[var(--primary)]">
                        {plain?.kind ?? candidate.kind}
                      </span>
                    </div>

                    {plain ? (
                      /* ── 大白话三段 ── */
                      <div className="mt-1.5 space-y-1">
                        <PlainRow label="它到底是什么" text={plain.what_it_is} />
                        <PlainRow
                          label="对学习者有什么用"
                          text={plain.learner_value}
                        />
                        <PlainRow
                          label="我们平台能拿它做什么"
                          text={plain.platform_use}
                        />
                      </div>
                    ) : (
                      /* ── 尚未翻译：明说，不拿机器摘要冒充 ── */
                      <div className="mt-1.5 space-y-1">
                        <p className="text-[10.5px] text-[var(--muted-foreground)]/70">
                          尚未翻译成大白话——下面是机器摘要，供参考。
                        </p>
                        <p className="text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                          {candidate.summary}
                        </p>
                      </div>
                    )}

                    {/* 单条全览 */}
                    <button
                      type="button"
                      onClick={() => setInspecting(candidate)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-[var(--primary)] transition-opacity hover:opacity-70"
                    >
                      <FolderOpen size={10} strokeWidth={2.2} />
                      看目录里到底装了什么
                    </button>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* 单条全览抽屉 */}
      <InspectDrawer
        candidate={inspecting}
        onClose={() => setInspecting(null)}
      />
    </div>
  );
}

/** 大白话三段的一行。 */
function PlainRow({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[11.5px] leading-[1.75] text-[var(--foreground)]/85">
      <span className="mr-1 font-medium text-[var(--primary)]">
        {label}：
      </span>
      {text}
    </p>
  );
}
