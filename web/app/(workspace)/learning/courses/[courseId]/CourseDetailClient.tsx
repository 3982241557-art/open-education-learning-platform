"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import {
  LearningShell,
  LearningErrorState,
  LearningSkeleton,
} from "@/components/learning/LearningShell";
import { InteractiveReader } from "@/components/learning/InteractiveReader";
import { BackToHubButton } from "@/components/learning/BackToHubButton";
import { useReadingTelemetry } from "@/components/learning/useReadingTelemetry";
import { ArchiveDrawer } from "@/components/learning/ArchiveDrawer";
import { MacroAdvisor } from "@/components/ai/MacroAdvisor";
import { MainAiPanel } from "@/components/ai/MainAiPanel";
import { SelectionToolbar } from "@/components/ai/SelectionToolbar";
import { humanizeError, isConnectivityError } from "@/components/ai/ErrorNotice";
import { SplitPane } from "@/components/layout/SplitPane";
import { ReaderProvider, useReader } from "@/context/ReaderContext";
import { useChat } from "@/context/ChatContext";
import { fetchPlans, type StudyPlan } from "@/lib/learning-api";
import { emitLearningEvent, NOTE_UPDATED, PLAN_UPDATED, PROGRESS_UPDATED } from "@/lib/learning-events";
import {
  getCourse,
  visitPage,
  type Course,
  type Page,
} from "@/lib/courses-api";
import { isStaticRuntime } from "@/shared/api/client";

/**
 * 课程阅读页 —— 三栏协同。
 *
 * .. code-block:: text
 *
 *     ┌───────────────────────┬┬────────────────────────┐
 *     │ 留存文档 │ 目录/正文   ││    双 AI 指导          │
 *     │ (抽屉)   │ 排版工具栏   ││    指导二 / 指导一      │
 *     └───────────────────────┴┴────────────────────────┘
 *                              ↑ 可拖拽
 *
 * 左窗是「我的东西 + 教材」，右窗是「AI」。中间那条分隔条可以拖——
 * 用户能把 AI 窗口拉到占屏幕一半以上，这在看思维导图、宽表格时是刚需。
 *
 * 比例会被记进 localStorage：下次进来还是上次那个布局。
 */
/**
 * 课程详情页的**客户端**实现。
 *
 * 与 ``page.tsx``（服务端壳）的分工：
 *
 * * ``page.tsx`` 负责 ``generateStaticParams``——构建期生成静态页；
 * * 本文件负责真正的交互——读课程、渲染正文、驱动 AI 面板。
 */
export default function CourseDetailClient({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  return (
    <ReaderProvider courseId={courseId}>
      <CourseReader courseId={courseId} />
    </ReaderProvider>
  );
}

/**
 * 分栏比例的本地存储键。
 *
 * 带版本号 ``v2``——这一版重新分配了空间权重（主舞台必须是最大的
 * 那一块），旧版本存下来的比例是基于**上一套**权重算的，直接沿用
 * 会让布局停留在重构前的状态。版本号让旧值自然失效。
 */
const SPLIT_KEY = "seek.reader.splitRatio.v2";

/**
 * 默认的左右比例。
 *
 * 71% / 29%：主舞台（视频 + 交互时间轴）必须是最宽的一块。
 *
 * 之前的 66/34 把右边 AI 面板放得几乎跟中间一样宽，而中间真正的
 * 主舞台还要再分掉一块给笔记栏——结果是「看视频的地方」被挤成
 * 窄缝，而 AI 面板空着一大截。
 */
const DEFAULT_SPLIT_RATIO = 0.71;

function CourseReader({ courseId }: { courseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reloadNotes } = useReader();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  /**
   * 左窗占多少（0–1）。
   *
   * 存进 localStorage——布局是用户的偏好，不该每次进来都重置。
   */
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO);
  /**
   * 是否处于**静态模式**。
   *
   * 静态模式下课程库是只读的——「编辑课程」入口整个不渲染。
   */
  const [staticMode, setStaticMode] = useState(false);

  // 挂载时读回上次的比例。
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SPLIT_KEY);
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0.2 && value <= 0.8) {
        setSplitRatio(value);
      }
    } catch {
      /* 隐私模式下读不到——用默认值 */
    }
  }, []);

  /** 拖动分隔条时记下新比例。 */
  const handleRatioChange = useCallback((ratio: number) => {
    setSplitRatio(ratio);
    try {
      window.localStorage.setItem(SPLIT_KEY, String(ratio));
    } catch {
      /* 配额满或隐私模式——忽略 */
    }
  }, []);

  useEffect(() => {
    void isStaticRuntime().then(setStaticMode);
  }, []);

  const { setContext } = useChat();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCourse(await getCourse(courseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 课程级计划。
   *
   * AI 制定计划后，这个列表要跟着更新——所以在动作回执到达时重拉。
   */
  const loadPlans = useCallback(async () => {
    try {
      setPlans(await fetchPlans(courseId));
    } catch {
      setPlans([]);
    }
  }, [courseId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  // AI 执行动作后刷新左栏的计划列表。
  const { lastReceipts, setOnActions } = useChat();

  /**
   * 把 AI 的动作回执翻译成**具体**的领域事件。
   *
   * 之前只在回调里统一刷一遍计划 + 笔记，但**没有告诉别的组件
   * 「到底是计划变了还是笔记变了」**——学习计划页（日历）只监听
   * ``PLAN_UPDATED``，留存文档只监听 ``NOTE_UPDATED``。缺了这两个
   * 事件，AI 在聊天里建的计划在日历里不会立刻出现。
   *
   * 所以这里按动作类型分别广播：
   *
   * * ``upsert_note``  → ``NOTE_UPDATED``
   * * ``manage_plan`` → ``PLAN_UPDATED``
   * * ``trigger_quiz`` → ``PROGRESS_UPDATED``
   */
  const broadcastActions = useCallback(
    (receipts: { action?: string; ok?: boolean }[]) => {
      for (const receipt of receipts ?? []) {
        if (receipt?.ok === false) continue;
        const action = String(receipt?.action ?? "");
        if (action === "upsert_note") {
          emitLearningEvent(NOTE_UPDATED, { courseId, source: "ai" });
        } else if (action === "manage_plan") {
          emitLearningEvent(PLAN_UPDATED, { courseId, source: "ai" });
        } else if (action === "trigger_quiz") {
          emitLearningEvent(PROGRESS_UPDATED, { courseId, source: "ai" });
        }
      }
    },
    [courseId],
  );

  useEffect(() => {
    setOnActions((receipts) => {
      // AI 记了笔记 → 左栏立刻出现；
      // AI 制定了计划 → 左栏的计划立刻出现；
      // 两者都 → 学情中心的数字也跟着变。
      void loadPlans();
      void reloadNotes();
      broadcastActions(receipts ?? []);
      emitLearningEvent(PROGRESS_UPDATED, { courseId, source: "ai" });
    });
    return () => setOnActions(null);
  }, [courseId, loadPlans, reloadNotes, setOnActions, broadcastActions]);
  useEffect(() => {
    if (lastReceipts.length > 0) {
      void loadPlans();
      void reloadNotes();
      broadcastActions(lastReceipts);
    }
  }, [lastReceipts, loadPlans, reloadNotes, broadcastActions]);

  /**
   * 默认打开哪一节。
   *
   * 优先级：
   *
   * 1. URL 上带的 ``?page=``——「继续学习」从学情中心跳过来时用；
   * 2. 课程自己记录的 ``progress.current_page_id``——**上次读到的那
   *    一页**，这正是「继续学习」应该落点的地方；
   * 3. 第一章第一节——实在没有记录时的兜底。
   */
  useEffect(() => {
    if (!course || openPageId) return;

    const wanted = searchParams.get("page");
    if (wanted && course.pages.some((item) => item.id === wanted)) {
      setOpenPageId(wanted);
      return;
    }

    const lastPageId = course.progress?.current_page_id;
    if (lastPageId && course.pages.some((item) => item.id === lastPageId)) {
      setOpenPageId(lastPageId);
      return;
    }

    const firstPage = course.pages[0];
    if (firstPage) setOpenPageId(firstPage.id);
  }, [course, openPageId, searchParams]);

  /**
   * 记录「读过这一节」。
   *
   * 这是「学情中心」的进度来源。每翻开一节就上报一次，后端把页 id
   * 追加进 ``progress.visited_page_ids``——只追加，所以反复翻同一节
   * 不会重复计数。
   *
   * 注意：``visited`` 只是「**打开过**」。真正的「已读」还要看
   * 遥测（停留时长 / 滚动覆盖率）——那是下面那个 hook 的事。
   *
   * 上报成功后广播一次进度变化——学情中心（若同时开着）立刻刷新。
   */
  useEffect(() => {
    if (!course || !openPageId) return;
    void visitPage(course.id, openPageId).then(() => {
      emitLearningEvent(PROGRESS_UPDATED, { courseId: course.id, source: "reader" });
    });
  }, [course, openPageId]);

  /**
   * 真实阅读遥测：停留时长 + 滚动覆盖率。
   *
   * 有了它，「已读」不再是「点过」，而是「真的停留够久 / 滚到底」。
   */
  useReadingTelemetry(courseId, openPageId);

  /** 把当前打开的页 / 章节写进全局学习上下文。 */
  useEffect(() => {
    if (!course) return;
    const page = course.pages.find((item) => item.id === openPageId);
    const chapter = course.spine.chapters.find(
      (item) => item.id === page?.chapter_id,
    );
    setContext({
      courseId: course.id,
      courseTitle: course.title,
      pageId: page?.id,
      pageTitle: page?.title,
      chapterId: chapter?.id,
      chapterTitle: chapter?.title,
    });
  }, [course, openPageId, setContext]);

  const currentPage = useMemo(
    () => course?.pages.find((item) => item.id === openPageId),
    [course, openPageId],
  );

  /**
   * 左栏「视频切片导航」要用的媒体资源。
   *
   * ~~只取当前这一节挂的、带交互节点的视频~~
   *
   * 现在左栏**不再**放时间轴——它收敛成纯粹的「留存文档」栏。
   * 时间信息已经全部归一到视频正下方的「交互式时间轴字幕轨」里
   * （见 ``InteractiveTimeline``）：一处时间轴，字幕是骨架、知识
   * 切片内嵌其中。
   *
   * 之前两处时间轴分处屏幕两端，用户找一个时刻得来回扫——那是
   * 「双时间轴晕眩」的根源，也是左栏被撑到 240px 的原因。
   */

  if (loading) {
    return (
      <LearningShell title="加载中…" subtitle="">
        <LearningSkeleton count={3} />
      </LearningShell>
    );
  }

  if (!course) {
    // 标题不能一律写「课程不存在」——后端没起来时课程明明就在那儿，
    // 说「不存在」会让人以为是数据丢了。按错误性质分开说。
    const isNetwork = isConnectivityError(error);
    return (
      <LearningShell
        title={isNetwork ? "连不上服务" : "课程不存在"}
        subtitle=""
      >
        <LearningErrorState
          message={
            isNetwork
              ? "后端服务没连上。请确认它已经启动，然后重试。"
              : humanizeError(error ?? "找不到这门课程。")
          }
          onRetry={() => void load()}
        />
      </LearningShell>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* 顶部条——全部图标化。
          「← 课程」和「✎ 编辑」都有公认的标准符号，文字是冗余的：
          悬停提示（title）足够说明它们是什么。 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-3 py-2.5">
        <Link
          href="/learning"
          title="返回课程列表"
          aria-label="返回课程列表"
          className="seek-key inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
        </Link>
        {/* ── 返回公开课 ──
         *
         * 课程页里也常常嵌着流媒体视频。放同一颗深蓝实心返回按钮，
         * 让「看视频」与「看目录」之间永远只有一步。
         */}
        <BackToHubButton />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--foreground)]">
            {course.title}
          </h1>
        </div>
        {/*
         * 静态模式下课程库是只读的——「编辑课程」要写数据库，做不到。
         * 所以这个按钮整个不渲染。
         */}
        {!staticMode && (
          <button
            type="button"
            onClick={() =>
              router.push(`/learning/courses/${encodeURIComponent(course.id)}/edit`)
            }
            title="编辑课程"
            aria-label="编辑课程"
            className="seek-key inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            <Pencil size={15} strokeWidth={2.2} />
          </button>
        )}
      </header>

      {error && (
        <div className="shrink-0 px-4 pt-3">
          <LearningErrorState message={error} />
        </div>
      )}

      {/* ── 四级空间权重 ──────────────────────────────────────────────
       *
       * 四块区域按认知重要性分配宽度，从左到右递减：
       *
       *   ① 根导航（48px）  —— 次要信息，最窄
       *   ② 留存笔记（约 17%）—— 我的东西
       *   ③ 主舞台（约 54%）  —— 流媒体 + 交互时间轴，最大
       *   ④ AI 助教（约 29%）  —— 回应区
       *
       * 之前的问题是**权重倒挂**：主舞台只占 66% 里的一部分，
       * 右边的 AI 面板和左边的笔记栏各占一大块，中间真正看视频的
       * 地方反而被挤成一条缝。
       *
       * 现在把「左栏 + 中栏」合成一个 Grid 的两列，比例写死为
       * ``17fr / 54fr``（合计 71fr），右栏 29fr——三者相加正好
       * 100%，中间天然是最大的一块。
       *
       * 为什么不用 SplitPane 的拖拽比例
       * ------------------------------
       * 拖拽比例是**用户偏好**，可以调；但**默认权重**必须由设计
       * 决定。所以这里保留 SplitPane（用户仍可拖），只是把默认值
       * 从 66/34 调成 71/29。
       */}
      <div className="min-h-0 flex-1">
        <SplitPane
          initialRatio={splitRatio}
          resetRatio={DEFAULT_SPLIT_RATIO}
          onRatioChange={handleRatioChange}
          className="h-full"
          left={
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[17fr_minmax(0,54fr)]">
              {/* ② 留存文档栏——只放笔记与计划。
                  窄屏时收起：正文优先。 */}
              <ArchiveDrawer
                plans={plans}
                courseId={course.id}
                pageId={openPageId ?? undefined}
                className="hidden lg:flex"
              />

              {/* ③ 主舞台——流媒体视频 + 合并后的交互时间轴。
                  冷灰蓝底上浮着纯白卡片。 */}
              <main
                data-seek-reader-scroll
                className="min-h-0 overflow-y-auto bg-[var(--seek-cool)] px-5 py-4 lg:px-7"
              >
                <InteractiveReader
                  course={course}
                  openPageId={openPageId}
                  onOpenPage={setOpenPageId}
                />
              </main>
            </div>
          }
          right={
            // ④ AI 助教区——加深后的暖调玫瑰灰底。
            //
            // 面板内部 85% 以上的垂直高度归聊天流：知识向导折叠成
            // 顶部一条便签条，剩下的大头全给对话。
            <aside className="flex h-full min-h-0 flex-col gap-2.5 bg-[var(--seek-warm)] p-2.5">
              {/* ④-a 知识向导——折叠便签条 */}
              <MacroAdvisor
                courseId={course.id}
                pageId={openPageId ?? undefined}
                className="shrink-0"
              />

              {/* ④-b 课程专属助教——占绝大部分高度 */}
              <MainAiPanel
                courseId={course.id}
                courseTitle={course.title}
                pageId={openPageId ?? undefined}
                pageTitle={currentPage?.title ?? ""}
                className="min-h-0 flex-1"
              />
            </aside>
          }
        />
      </div>

      {/* 划词浮动工具栏 */}
      <SelectionToolbar
        courseId={course.id}
        courseTitle={course.title}
        pageId={openPageId ?? undefined}
        pageTitle={currentPage?.title ?? ""}
      />
    </div>
  );
}
