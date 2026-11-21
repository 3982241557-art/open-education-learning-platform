"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import {
  discoverCoursesStreaming,
  fetchSyncStatus,
  triggerSync,
} from "@/lib/discovery-api";
import { cn } from "@/lib/cn";
import { isStaticRuntime } from "@/shared/api/client";

/**
 * 全网实时引流与同步控制台
 * =========================
 *
 * 中台页面顶部的两个极简莫兰迪动作入口：
 *
 * .. code-block:: text
 *
 *     ┌─ 🔍 [ 博弈论 纳什均衡            ] [🌐 全网搜课并生成导学] [↻ 巡检更新] ┐
 *     └─ 最后同步：刚刚 · 共 76 门精装公开课 ───────────────────────────────────┘
 *
 * 「全网搜课并生成导学」
 * --------------------
 *
 * 用户输入一个**本地目录之外**的新课题，或者直接粘一条 B 站 /
 * YouTube 链接，点这个按钮后走完整链路：
 *
 * .. code-block:: text
 *
 *     正在检索全网公开课…
 *          ↓
 *     正在提取章节与字幕证据…
 *          ↓
 *     AI 正在装配重点导读与思考题…
 *          ↓
 *     完成 → 直接切到新课程开始学
 *
 * 装配那一步要调大模型，全程 8~12 秒。所以进度必须是**可见的**——
 * 用户看到「AI 正在装配」才知道系统没卡死。
 *
 * 「巡检更新」
 * ----------
 *
 * 手动触发一次信源池巡检。平时是后台定时任务（每 12 小时），
 * 这个按钮是给用户一个「我等不及，现在就更新」的口子。
 */

export interface DiscoveryConsoleProps {
  /** 装配完成后回调——前端据此切台到新课程。 */
  onDiscovered?: (resourceIds: string[]) => void;
  className?: string;
}

/** 进度阶段 → 文案与图标。 */
const STAGE_TEXT: Record<string, string> = {
  search: "正在检索全网公开课…",
  ingest: "正在写入课程目录…",
  structure: "AI 正在装配重点导读与思考题…",
  done: "装配完成",
  error: "检索失败",
};

export function DiscoveryConsole({
  onDiscovered,
  className = "",
}: DiscoveryConsoleProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  /**
   * 是否处于**静态模式**。
   *
   * 静态模式下「全网搜课」与「巡检更新」**做不了**——它们要后端去
   * 爬网、去写库。所以这两个按钮整个**隐藏**，而不是禁用：
   * 一个永远点不动的按钮只会让人反复试。
   */
  const [staticMode, setStaticMode] = useState(false);

  /** 中台现有资源数——只在巡检完成后的提示里出现一次。 */
  const [resourceCount, setResourceCount] = useState(0);
  void resourceCount;

  /** 进度区是否展开。 */
  const [showProgress, setShowProgress] = useState(false);
  /**
   * 搜索框是否处于展开态。
   *
   * 默认**收缩**——屏幕上只留一颗 ``[🔍 搜全网…]`` 胶囊。
   * 聚焦时展开，失焦且没输入内容时收回。
   */
  const [expanded, setExpanded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  /** 拉一次巡检状态。

   *  这一版顶部**不再显示**「最后同步 / 共 X 门课」那行统计文字——
   *  它属于学情中心的职责，放在搜索旁边是职责错位。

   *  但巡检状态本身还要留着：巡检跑完后要在提示里报「中台现有
   *  N 条」，所以这里仍然拉一次，只是**不常驻显示**。 */
  const loadStatus = useCallback(async () => {
    const data = await fetchSyncStatus();
    if (data) setResourceCount(data.resource_count);
  }, []);

  useEffect(() => {
    void loadStatus();
    void isStaticRuntime().then(setStaticMode);
  }, [loadStatus]);

  /**
   * 「全网搜课并生成导学」。
   *
   * 全程 8~12 秒——所以期间要：
   *
   * * 禁用输入框与按钮（避免重复提交）；
   * * 显示分步进度（让用户知道系统没卡死）。
   */
  const runDiscover = useCallback(async () => {
    const text = query.trim();
    if (!text || busy) return;

    setBusy(true);
    setError("");
    setMessage("");
    setStage("search");
    setShowProgress(true);

    try {
      const result = await discoverCoursesStreaming(text, {
        maxResults: 3,
        onProgress: (event) => {
          // 进度条是**实时的**——每收到一个 SSE 事件就更新一次，
          // 用户能看见「检索 → 提取证据 → AI 装配」逐段推进。
          setStage(event.stage);
          if (event.message) setMessage(event.message);
        },
      });
      if (result.structured === 0 && result.failed > 0) {
        setStage("error");
        setError(result.failures[0] ?? "没有找到可装配的公开课。");
      } else {
        setStage("done");
        setMessage(
          `已装配 ${result.structured} 门课` +
            (result.added ? `（其中 ${result.added} 门是新增的）` : "") +
            "。",
        );
        // 装配完的新课已经在中台里了——刷新目录并切过去。
        await loadStatus();
        if (result.resource_ids.length > 0) {
          onDiscovered?.(result.resource_ids);
        }
      }
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "检索失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }, [query, busy, loadStatus, onDiscovered]);

  /**
   * 「巡检更新」。
   *
   * 手动触发一次信源池巡检。这一步会跑完整条采集管线（几分钟），
   * 所以它跟「搜课」不同——搜课是按需的、快的；巡检是全量的、慢的。
   */
  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setError("");
    try {
      const stats = await triggerSync();
      setMessage(
        `巡检完成：新增 ${stats.added} 条，更新 ${stats.updated} 条，` +
          `中台现有 ${stats.total} 条。`,
      );
      setResourceCount(stats.total);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "巡检失败，请稍后再试。");
    } finally {
      setSyncing(false);
    }
  }, [syncing, loadStatus]);

  return (
    <div className={cn("flex flex-col gap-2", className)} data-seek-discovery>
      {/* ── 极简搜索：收缩态是一个胶囊，聚焦才展开 ──
       *
       * 上一版是一条**铺满整行**的输入框 + 两个按钮 + 一行统计文字。
       * 问题是：那套东西是「管理后台」的语言，不是「工作台」的语言——
       * 它在用户**还没打算搜东西**的时候，就已经占掉了整整两行的
       * 注意力预算。
       *
       * 现在的做法：
       *
       * * **收缩态**——只有一个 ``[🔍 搜全网…]`` 胶囊，宽度跟文字
       *   差不多。屏幕上几乎看不见它。
       * * **展开态**——点击 / 聚焦时，胶囊向右铺开成完整的输入框，
       *   旁边长出两个动作按钮。
       * * **失焦且没有内容时自动收回**——不留一条空荡荡的长条。
       *
       * 这样「搜索」这件事在默认状态下是**不可见的**，只有用户真正
       * 需要它的时候才出现。
       */}
      {/*
       * 静态模式下**整个操作区都不渲染**。
       *
       * 「全网搜课」需要后端爬网，「巡检更新」需要后端写库——这两件事
       * 在纯静态站点里都做不了。留一个点不动的按钮在界面上，只会让人
       * 反复试，然后以为站点坏了。
       *
       * 搜索本身在静态版仍然有用——它过滤的是**已装配好的**课程列表。
       * 所以只隐藏两个「写」操作，搜索框保留。
       */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "relative flex items-center overflow-hidden rounded-full border transition-all duration-200",
            expanded
              ? "flex-1 border-[var(--seek-bean-soft-border)] bg-white"
              : "w-[132px] border-[var(--seek-key-border)] bg-white hover:border-[var(--seek-bean-soft-border)]",
          )}
        >
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              window.setTimeout(() => inputRef.current?.focus(), 30);
            }}
            aria-label="搜索全网公开课"
            aria-expanded={expanded}
            title="搜索全网公开课"
            className="absolute left-0 z-10 flex h-8 w-8 shrink-0 items-center justify-center text-[var(--primary)]"
          >
            <Search size={13} strokeWidth={2.2} />
          </button>

          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setExpanded(true)}
            onBlur={() => {
              // 失焦时只有在**没输入任何东西**的情况下才收回——
              // 用户已经打了字，收走输入框会让人以为东西丢了。
              if (!query.trim()) setExpanded(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !busy) {
                event.preventDefault();
                void runDiscover();
              }
              if (event.key === "Escape") {
                setQuery("");
                setExpanded(false);
                inputRef.current?.blur();
              }
            }}
            disabled={busy}
            placeholder="搜全网…"
            aria-label="全网搜课"
            className={cn(
              "h-8 w-full rounded-full bg-transparent pl-8 pr-3 text-[12.5px] font-normal text-[var(--foreground)]",
              "placeholder:text-[var(--muted-foreground)]/70",
              "focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
        </div>

        {/* 主动作：全网搜课并生成导学 */}
        {/*
         * 静态模式下**不渲染**，而不是用 ``hidden`` 属性。
         *
         * ``hidden`` 属性靠浏览器默认样式 ``display: none`` 生效，
         * 但 Tailwind 的 ``inline-flex`` 工具类**优先级更高**——会把
         * 按钮重新显示出来。所以这里必须条件渲染。
         */}
        {!staticMode && (
          <button
            type="button"
            onClick={() => void runDiscover()}
            disabled={busy || !query.trim()}
            title="从全网检索新公开课，并现场装配重点导读与思考题"
            className={cn(
              "seek-key inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium",
              "bg-[var(--seek-bean-soft)] text-[var(--seek-plum)] transition-colors hover:bg-[var(--seek-bean-soft-hover)]",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
          >
            {busy ? (
              <Loader2 size={12} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <Globe size={12} strokeWidth={2.2} />
            )}
            全网搜课并生成导学
          </button>
        )}

        {/* 次动作：巡检更新 */}
        {!staticMode && (
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing}
            title="手动触发一次信源池巡检（后台每 12 小时自动巡检一次）"
            className={cn(
              "seek-key inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-normal",
              "bg-white text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
          >
            {syncing ? (
              <Loader2 size={12} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <RefreshCw size={12} strokeWidth={2.2} />
            )}
            巡检更新
          </button>
        )}
      </div>

      {/* ── 分步进度 ──
       *
       * 装配要 8~12 秒。用户必须看见「现在到哪一步了」，
       * 否则会以为页面卡死。
       */}
      {showProgress && (stage || error) ? (
        <div
          className="rounded-lg border border-[var(--seek-divider-warm)] bg-[var(--seek-warm)] px-3 py-2"
          role="status"
        >
          <div className="flex items-center gap-2">
            {stage === "done" ? (
              <Check size={13} strokeWidth={2.4} className="text-[var(--seek-plum)]" />
            ) : stage === "error" ? (
              <span className="text-[13px] text-[var(--seek-color-rose)]">✕</span>
            ) : (
              <Loader2 size={13} strokeWidth={2.4} className="animate-spin text-[var(--seek-plum)]" />
            )}
            <span className="text-[12px] font-medium text-[var(--seek-plum)]">
              {STAGE_TEXT[stage] ?? "处理中…"}
            </span>
            {message ? (
              <span className="text-[11.5px] font-normal text-[var(--muted-foreground)]">
                {message}
              </span>
            ) : null}
          </div>

          {/* 分步进度条——三步。 */}
          <div className="mt-2 flex items-center gap-1.5">
            {["search", "ingest", "structure"].map((key, index) => {
              const order = ["search", "ingest", "structure"];
              const currentIndex = order.indexOf(stage);
              const done =
                currentIndex > index ||
                stage === "done" ||
                (currentIndex === index && stage !== "error");
              const active = currentIndex === index && stage !== "done";
              return (
                <div key={key} className="flex flex-1 items-center gap-1.5">
                  <div
                    className={cn(
                      "h-[3px] flex-1 rounded-full transition-colors",
                      done
                        ? "bg-[var(--seek-bean)]"
                        : "bg-[var(--seek-divider-cool)]",
                    )}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-normal text-[var(--muted-foreground)]/70">
            <span>检索全网</span>
            <span>提取证据</span>
            <span>AI 装配</span>
          </div>

          {error ? (
            <p className="mt-1.5 text-[11.5px] font-normal text-[var(--seek-color-rose)]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 成功提示里的一个小图标——用完即弃。 */}
      {stage === "done" && !error ? (
        <span className="sr-only">
          <Sparkles aria-hidden />
        </span>
      ) : null}
    </div>
  );
}
