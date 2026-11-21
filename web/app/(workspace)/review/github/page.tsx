"use client";

import { useCallback, useEffect, useState } from "react";
import { Github, Loader2 } from "lucide-react";
import {
  GithubReviewConsole,
  type GithubReviewPayload,
} from "@/components/learning/GithubReviewConsole";
import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
  staticFetch,
} from "@/shared/api/client";

/**
 * 开源教育资源审核台
 * ====================
 *
 * 一个**独立页面**，而不是某个抽屉。
 *
 * 为什么这次不放在抽屉里
 * ----------------------
 *
 * 审核是一个**有始有终的工作流**：打开候选 → 逐条看 → 勾选 → 批量
 * 拉取。这个流程可能要持续十几分钟，还会在中途去 GitHub 上对比一下
 * 原始 README。
 *
 * 抽屉天生不适合长流程——它窄、它被页面框住、关掉就丢上下文。
 *
 * 而它又是**低频**操作——不是每个用户都要审核开源项目。所以它不占
 * 侧栏主导航（那里只有首页 / 课程 / 计划 / 学情中心 4 项），只从
 * 底部的小图标进入。
 */
export default function GithubReviewPage() {
  const [payload, setPayload] = useState<GithubReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(null);
    try {
      // ── 静态模式 ──
      //
      // 候选清单在构建期已同步到 ``/data/github_candidates_review.json``，
      // 内容与后端返回的完全一致。
      if (await isStaticRuntime()) {
        const data = await staticFetch<GithubReviewPayload>(
          "/data/github_candidates_review.json",
        );
        if (!data) {
          setFailed("静态候选清单读取失败。");
          return;
        }
        setPayload(data);
        return;
      }

      const response = await apiFetch(
        apiUrl("/api/resources/github/candidates"),
        { cache: "no-store" },
      );
      setPayload((await asJsonOrThrow(response)) as GithubReviewPayload);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "读取候选清单失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 是否处于**静态模式**。
   *
   * 静态模式下「批准」与「拉取入库」这两件事**做不了**——它们需要
   * 后端去 clone 仓库、装配课程。所以界面要把它们**说清楚**，
   * 而不是让用户点了之后看到一个红色报错。
   */
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    void isStaticRuntime().then(setStaticMode);
  }, []);

  /** 勾选 / 忽略。 */
  const setApproval = useCallback(
    async (candidateId: string, approval: string) => {
      // 静态模式下没有后端可写。勾选只保留在**界面状态**里，
      // 不会持久化——因为「批准」的定义就是「让后端去拉取它」。
      if (await isStaticRuntime()) {
        setPayload((current) => {
          if (!current) return current;
          return {
            ...current,
            candidates: current.candidates.map((item) =>
              item.id === candidateId ? { ...item, approval } : item,
            ),
          };
        });
        return;
      }

      // 先本地更新——界面立刻响应，不等网络。
      setPayload((current) => {
        if (!current) return current;
        return {
          ...current,
          candidates: current.candidates.map((item) =>
            item.id === candidateId ? { ...item, approval } : item,
          ),
        };
      });

      try {
        const response = await apiFetch(
          apiUrl("/api/resources/github/approve"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidate_id: candidateId, approval }),
          },
        );
        await asJsonOrThrow(response);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "保存失败。");
        void load();
      }
    },
    [load],
  );

  /** 批量拉取已批准的项目。 */
  const fetchApproved = useCallback(async () => {
    // 静态模式：「拉取入库」需要后端 clone 仓库——静态站点做不到。
    // 明确告诉用户，不装作成功。
    if (await isStaticRuntime()) {
      setNotice(
        "当前是纯静态版本，无法拉取入库——这一步需要后端服务。" +
          "部署带后端的版本后即可使用。",
      );
      return;
    }

    setFetching(true);
    setNotice(null);
    try {
      const response = await apiFetch(
        apiUrl("/api/resources/github/fetch-approved"),
        { method: "POST" },
      );
      const result = (await asJsonOrThrow(response)) as {
        fetched?: number;
        succeeded?: number;
        failed?: number;
        added?: number;
        message?: string;
      };
      setNotice(
        result.message ??
          `已拉取 ${result.succeeded ?? 0} 个，成功入库 ${result.added ?? 0} 个。`,
      );
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "拉取失败。");
    } finally {
      setFetching(false);
    }
  }, [load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[880px] px-6 py-7">
        <header className="mb-5">
          <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.02em]">
            <Github size={18} strokeWidth={2} />
            开源教育资源审核台
          </h1>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
            机器大面积筛选 → DeepSeek 翻译成大白话 → 逐条过审 → 勾选批准 →
            拉取入库。未批准的仓库不会进入课程大盘。
          </p>
        </header>

        {notice ? (
          <p className="mb-4 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2 text-[12px]">
            {notice}
          </p>
        ) : null}

        {failed ? (
          <p className="mb-4 rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
            {failed}
            <button
              type="button"
              onClick={() => void load()}
              className="ml-2 underline underline-offset-2"
            >
              重试
            </button>
          </p>
        ) : null}

        {loading && !payload ? (
          <div className="flex items-center gap-2 py-12 text-[12.5px] text-[var(--muted-foreground)]">
            <Loader2 size={13} className="animate-spin" />
            正在加载候选清单…
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
            <GithubReviewConsole
              payload={payload}
              onApprovalChange={(id, approval) => void setApproval(id, approval)}
              onFetchApproved={() => void fetchApproved()}
              fetching={fetching}
              className="max-h-[calc(100vh-260px)]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
