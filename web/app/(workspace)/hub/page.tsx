"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Github,
  Globe,
  LayoutList,
  Loader2,
  NotebookPen,
  Radio,
} from "lucide-react";
import { ReaderProvider } from "@/context/ReaderContext";
import { useChat } from "@/context/ChatContext";
import { GlobalHubNavigator } from "@/components/learning/GlobalHubNavigator";
import { InteractiveVideoCanvas } from "@/components/learning/InteractiveVideoCanvas";
import { DiscoveryConsole } from "@/components/learning/DiscoveryConsole";
import {
  TopicFilter,
  TopicIntro,
  TOPICS,
} from "@/components/learning/TopicFilter";
import { ArchiveDrawer } from "@/components/learning/ArchiveDrawer";
import {
  GithubReviewConsole,
  type GithubReviewPayload,
} from "@/components/learning/GithubReviewConsole";
import { apiFetch, apiUrl, asJsonOrThrow } from "@/shared/api/client";
import { SideDrawer } from "@/components/learning/SideDrawer";
import { BackToHubButton } from "@/components/learning/BackToHubButton";
import { useRegisterShellActions } from "@/context/ShellActionsContext";
import { BrandBar, LocaleRegionSwitcher } from "@/components/layout/BrandBar";
import { MacroAdvisor } from "@/components/ai/MacroAdvisor";
import { MainAiPanel } from "@/components/ai/MainAiPanel";
import {
  fetchGlobalHub,
  type GlobalHub,
  type GlobalHubCategory,
  type GlobalHubResource,
} from "@/lib/global-hub-api";
import { emitLearningEvent, RESOURCE_ACTIVATED } from "@/lib/learning-events";

/**
 * 全网资源中台
 * ============
 *
 * 平台的调度控制台：左边是**分类目录**，中间是**播放器 + 时间轴**，
 * 右边是**AI 助教**。
 *
 * .. code-block:: text
 *
 *     ┌─ 分类导航 ─┬─ 主舞台 ─────────────┬─ AI 助教 ─┐
 *     │ 顶级高校    │ [视频 16:9]           │ 知识向导   │
 *     │  通识趣味   │ [交互时间轴字幕轨]    │ 助教聊天流 │
 *     │  国内权威   │                      │           │
 *     └────────────┴───────────────────────┴───────────┘
 *
 * 切台不刷新
 * ----------
 *
 * 点左侧任意一个视频，中间舞台换成它，**页面不重载**——播放器的
 * React 组件保持挂载状态，只是 ``url`` 变了。这样：
 *
 * * 右侧助教的聊天记录**不丢**——用户上一条问题还在上下文里；
 * * 左侧的分类展开状态**不丢**；
 * * 切换是瞬时的，没有白屏。
 *
 * 这也是为什么中台页是一个独立的客户端组件，而不是每次切台都走
 * 路由跳转。
 */
export default function GlobalHubPage() {
  return (
    <ReaderProvider courseId="global_resource_hub">
      {/*
        ``useSearchParams`` 需要一个 Suspense 边界——否则 Next.js 在
        静态预渲染这一页时会拒绝构建（``useSearchParams() should be
        wrapped in a suspense boundary``）。

        边界内只放控制台本体；``ReaderProvider`` 在外面，因为它跟
        URL 无关。
      */}
      <Suspense fallback={<HubShellFallback />}>
        <GlobalHubConsole />
      </Suspense>
    </ReaderProvider>
  );
}

/** 骨架——URL 参数解析期间的占位。 */
function HubShellFallback() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--background)]">
      <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
      <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
        正在加载公开课…
      </p>
    </div>
  );
}

/** 中台控制台本体。 */
function GlobalHubConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hub, setHub] = useState<GlobalHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** 当前选中的资源 id。 */
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * 当前选中的专题。
   *
   * 专题是**横切在学科之上的视角**——它跟学科是正交的两个维度：
   * 选了专题之后仍然可以再选学科。
   */
  const [activeTopic, setActiveTopic] = useState<string>("all");
  /** 「GitHub 开源教育项目审核清单」抽屉是否打开。 */
  const [reviewOpen, setReviewOpen] = useState(false);
  /** 待审清单数据。 */
  const [reviewPayload, setReviewPayload] = useState<GithubReviewPayload | null>(null);
  /** 正在拉取已审核项目。 */
  const [fetchingApproved, setFetchingApproved] = useState(false);

  /**
   * 抽屉开合状态。
   *
   * 两栏布局把「分类目录」和「留存文档」都藏进了抽屉——它们是
   * **按需访问**的辅助区，不该常年占着 420px 的横向空间。
   */
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  /**
   * 把两个抽屉触发器注册到根导航栏（深蓝窄栏）。
   *
   * 导航栏是全站共用的骨架，它不认识「选课」「笔记」是什么——
   * 是这一页通过 ``ShellActionsContext`` 告诉它的。所以别的页面
   * 不会莫名其妙长出两个按钮。
   */
  useRegisterShellActions(
    [
      {
        id: "hub-catalog",
        label: "选课",
        icon: LayoutList,
        onClick: () => setCatalogOpen(true),
      },
      {
        id: "hub-notes",
        label: "笔记",
        icon: NotebookPen,
        onClick: () => setNotesOpen(true),
      },
    ],
    [catalogOpen, notesOpen, reviewOpen],
  );

  /**
   * 助教的会话上下文。
   *
   * 这一步决定「向 AI 提问」记在哪个名下。
   *
   * 不设置的话，``ChatContext`` 的会话游标停在空串上——助手的提问
   * 会被存进 ``_freeform``（随手问的临时会话），学情中心里中台条目
   * 的「提问 0 次」就永远是 0。
   *
   * 设置成 ``global_resource_hub`` 之后，中台的提问与笔记、观看进度
   * **共用同一个命名空间**——三者在学情中心里是同一个条目的三个数字。
   */
  const { setContext } = useChat();

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    let data;
    try {
      const result = await fetchGlobalHub();
      data = result.hub;
    } catch (err) {
      // 兜底：任何异常都要把 loading 落下来，
      // 否则页面会永远停在「正在载入…」。
      console.error("[hub] 加载课程目录失败", err);
      setFailed(true);
      setHub(null);
      setLoading(false);
      return;
    }
    if (!data) {
      setFailed(true);
      setHub(null);
      setLoading(false);
      return;
    }
    setHub(data);
    // 默认选中第一条资源。
    const first = data.categories[0]?.resources[0];
    setActiveId((prev) => prev ?? first?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 深链：``/hub?resource=<id>``
   * --------------------------------
   *
   * 「课程」页的卡片、以及学情中心的「继续学习」，都需要能**直接打开
   * 某一讲公开课**——而不是把人丢回目录再让他自己找一遍。
   *
   * 目录加载完之前 ``hub`` 是 null，所以这里等它有数据再应用 URL 上的
   * 资源 id。用一个 ``applied`` 标记防止重复覆盖用户的手动选择。
   */
  const [appliedDeepLink, setAppliedDeepLink] = useState(false);
  useEffect(() => {
    if (!hub || appliedDeepLink) return;
    const wanted = searchParams.get("resource");
    if (!wanted) {
      setAppliedDeepLink(true);
      return;
    }
    for (const category of hub.categories) {
      if (category.resources.some((item) => item.id === wanted)) {
        setActiveId(wanted);
        break;
      }
    }
    setAppliedDeepLink(true);
  }, [hub, appliedDeepLink, searchParams]);

  /** 当前选中的资源 + 它所在的分类。 */
  /**
   * 加载 GitHub 候选清单。
   *
   * **只在抽屉打开时拉**——这是一份几十 KB 的数据，没必要在用户
   * 还没表达兴趣时就占用带宽。
   */
  const loadReview = useCallback(async () => {
    try {
      const response = await apiFetch(
        apiUrl("/api/resources/github/candidates"),
        { cache: "no-store" },
      );
      setReviewPayload(await asJsonOrThrow(response));
    } catch {
      setReviewPayload(null);
    }
  }, []);

  useEffect(() => {
    if (reviewOpen) void loadReview();
  }, [reviewOpen, loadReview]);

  /** 勾选 / 忽略一条。 */
  const setApproval = useCallback(
    async (candidateId: string, approval: string) => {
      try {
        const response = await apiFetch(
          apiUrl("/api/resources/github/approve"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidate_id: candidateId, approval }),
          },
        );
        const updated = await asJsonOrThrow(response);
        // 本地同步——不等重新拉整份清单。
        setReviewPayload((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            candidates: prev.candidates.map((item) =>
              item.id === candidateId ? { ...item, approval } : item,
            ),
            summary: {
              ...prev.summary,
              approved: prev.candidates.filter(
                (item) =>
                  item.id === candidateId
                    ? approval === "approved"
                    : item.approval === "approved",
              ).length,
            },
          };
        });
        void updated;
      } catch {
        // 失败时重新拉整份，保证前端跟后端一致。
        void loadReview();
      }
    },
    [loadReview],
  );

  /** 一键拉取已审核项目并装配入库。 */
  const fetchApproved = useCallback(async () => {
    setFetchingApproved(true);
    try {
      await apiFetch(apiUrl("/api/resources/github/fetch-approved"), {
        method: "POST",
      });
      await loadReview();
    } catch {
      await loadReview();
    } finally {
      setFetchingApproved(false);
    }
  }, [loadReview]);

  /**
   * 专题过滤后的分类。
   *
   * 只改 ``resources`` 数组，不改分类本身——这样分类标题、说明、
   * 计数都还在，只是里面的条目少了。
   */
  const filteredCategories = useMemo(() => {
    if (activeTopic === "all" || !hub) return hub?.categories ?? [];
    const topic = TOPICS.find((item) => item.id === activeTopic);
    if (!topic) return hub?.categories ?? [];
    return hub.categories.map((category) => ({
      ...category,
      resources: category.resources.filter((resource) => topic.match(resource)),
    }));
  }, [hub, activeTopic]);

  /** 专题过滤后剩下的全部资源。 */
  const topicResources = useMemo(
    () => filteredCategories.flatMap((category) => category.resources),
    [filteredCategories],
  );

  const { activeResource, activeCategory } = useMemo(() => {
    if (!hub) return { activeResource: null, activeCategory: null };
    for (const category of hub.categories) {
      const found = category.resources.find((item) => item.id === activeId);
      if (found) {
        return { activeResource: found, activeCategory: category };
      }
    }
    return { activeResource: null, activeCategory: null };
  }, [hub, activeId]);

  /** 切台——只改 state，不重载页面。 */
  const select = useCallback(
    (resource: GlobalHubResource, _category: GlobalHubCategory) => {
      setActiveId(resource.id);
      // 把当前资源写回 URL——这样「分享这一讲」「浏览器后退」
      // 都能对上号。``replace`` 而不是 ``push``：切台不应该在
      // 浏览器历史里堆一长串记录。
      const next = new URLSearchParams(searchParams.toString());
      next.set("resource", resource.id);
      router.replace(`/hub?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  /**
   * 把当前播的这一讲写进助手的会话上下文。
   *
   * 与课程页的 ``setContext`` 是同一件事——它决定助手的提问记在哪个
   * 课程名下。中台的课程 id 恒为 ``global_resource_hub``。
   *
   * ``pageId`` 用**资源 id**——中台的最小学习单元是「一条视频」，
   * 不是「一页正文」。这样助手的回答里能指名道姓地说出当前这节课，
   * 而学情中心也能把提问归到正确的资源上。
   */
  useEffect(() => {
    setContext({
      courseId: "global_resource_hub",
      courseTitle: activeResource?.title ?? hub?.title ?? "全网公开课中台",
      pageId: activeId ?? undefined,
      pageTitle: activeResource?.title,
    });
  }, [activeId, activeResource?.title, hub?.title, setContext]);

  /**
   * 把「当前在看哪一条视频」广播给 AI 助教。
   *
   * 中台页不走 ``InteractiveReader``——它自己渲染播放器，所以这里
   * **手动**发一次资源切换事件。
   *
   * 这条广播在**静态模式**下尤其关键：没有后端可问，AI 助教只能
   * 拿这份预装导读（知识向导 / 段落导读 / 时间轴节点）来组织回答。
   * 不广播的话，助教会两手空空地回答「我也不知道」。
   */
  useEffect(() => {
    if (!activeResource) return;
    emitLearningEvent(RESOURCE_ACTIVATED, {
      resourceId: activeResource.id,
      title: activeResource.title,
      resourceType: activeResource.resource_type,
      url: activeResource.url,
      provider: activeResource.provider,
      aiContext: activeResource.ai_context,
      studyGuide: activeResource.study_guide ?? null,
      guidedSegments: (activeResource.guided_segments ?? []).map((segment) => ({
        timestamp: Number(segment.timestamp) || 0,
        title: segment.title,
        content: segment.content,
      })),
      interactiveNodes: (activeResource.interactive_nodes ?? []).map((node) => ({
        timestamp: Number(node.timestamp) || 0,
        keyword: node.keyword,
        context: node.context,
        hint: node.hint,
      })),
      courseId: "global_resource_hub",
      pageId: activeResource.id,
    });
  }, [activeResource]);

  /**
   * 「全网搜课并生成导学」装配完成。
   *
   * 新课已经写进中台数据文件了，所以要**重新拉一次目录**才能看到
   * 它——然后直接切过去，用户不用自己找。
   */
  const onDiscovered = useCallback(async (resourceIds: string[]) => {
    const { hub: fresh } = await fetchGlobalHub();
    if (!fresh) return;
    setHub(fresh);
    // 切到新装配出来的那门课。
    const firstNew = resourceIds[0];
    if (firstNew) setActiveId(firstNew);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--seek-cool)]">
        <p className="flex items-center gap-2 text-[13px] font-normal text-[var(--muted-foreground)]">
          <Loader2 size={15} className="animate-spin" />
          正在载入课程目录…
        </p>
      </div>
    );
  }

  if (failed || !hub) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--seek-cool)] px-6">
        <div className="max-w-md rounded-xl border border-[var(--seek-divider)] bg-white px-6 py-8 text-center">
          <Globe size={26} strokeWidth={1.8} className="mx-auto text-[var(--seek-plum)]" />
          <h1 className="mt-3 text-[17px] font-medium text-[var(--foreground)]">
            课程目录暂时连不上
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
            请确认服务已经启动，然后重试。课程目录的数据来自
            <code className="mx-1 rounded bg-[var(--seek-cool)] px-1 py-0.5 font-mono text-[11.5px]">
              backend/data/global_resource_hub.json
            </code>
            。
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="seek-key mt-4 rounded-lg bg-[var(--seek-plum)] px-4 py-2 text-[12.5px] font-normal text-white"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const totalResources = hub.categories.reduce(
    (sum, item) => sum + item.resources.length,
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* ── 顶部条：白纸化 ──
       *
       * 这里**只有标题和搜索**，没有统计数字。
       *
       * 上一版顶部还有一整行「最后同步 / 共 76 门 / 备用源覆盖 56/56」
       * 和一条「已看 12/76 · 累计观看 4.2 小时 · 笔记 18 条 · 提问 7 次」
       * 的学情统计条。四组数字挤在标题下面，视觉噪音比标题本身还大，
       * 而这些数据的**正主是学情中心**——用户想看的时候会去那里看，
       * 不该在这里被动接收。
       */}
      <header className="shrink-0 border-b border-[var(--border)] bg-white px-4 py-2.5">
        {/* ── 品牌条 ──
         *
         * 「开放教育学习平台 · 深圳后海总部 | Open Education Learning Platform · Houhai HQ, Shenzhen」
         *
         * 主副标题的形式：中文在前（主要用户是华人），英文在后
         * （给英文用户和搜索引擎看）。
         */}
        <div className="mb-2 flex items-center gap-3">
          <BrandBar className="min-w-0 flex-1" />
        </div>

        <div className="flex items-center gap-3">
          {/* ── 返回公开课 ──
           *
           * 极醒目的一颗深蓝实心按钮，钉在左上角。
           *
           * 它保证「海量课程目录」与「单门课程播放」之间**永远只有一步**——
           * 用户不需要在导航栏里推理「该点哪个图标才能回去」。
           */}
          <BackToHubButton />
          <Globe size={16} strokeWidth={2.2} className="shrink-0 text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14px] font-medium tracking-[-0.01em] text-[var(--foreground)]">
              {hub.title}
            </h1>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]">
            {hub.categories.length} 个学科 · {totalResources} 讲公开课
          </span>

          {/* ── 语言 / 地区切换 ──
           *
           * 放在顶栏右上角——海外用户打开中文站点的**第一件事**就是
           * 找语言开关。它必须在视线第一次落下的地方。
           *
           * 「润物细无声」：它就是一组极简的分段按钮，不抢戏，
           * 但**始终可达**。
           */}
          <LocaleRegionSwitcher />
        </div>

        {/* ── 全网实时引流与同步控制台 ──
         *
         * 搜索框默认收缩成一颗极简胶囊，聚焦时才展开。
         */}
        <DiscoveryConsole onDiscovered={onDiscovered} className="mt-2.5" />
      </header>

      {/* ── 两栏：主舞台 | AI 助教 ──
       *
       * 分类导航与留存文档**不在这里**——它们在两个抽屉里，
       * 由最左侧深蓝导航栏的 [☰ 选课] / [📝 笔记] 触发。
       *
       * 主舞台占 ``1fr``，AI 助教占 28%——助教面板需要足够的宽度
       * 才有「能好好说话」的空间，太窄会让长答案折成一条缝。
       */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,28%)]">
        {/* 主舞台 */}
        <main className="min-h-0 overflow-y-auto bg-[var(--background)] px-5 py-4">
          <div className="mx-auto max-w-[980px] space-y-3.5">
            {/* ── 温润克制的导语 + 专题标签 ──
             *
             * 公开课大厅的第一屏不该只有数字。「136 讲公开课」是冷的，
             * 它不解释为什么值得看。
             *
             * 导语只说两件事：这里有什么、它为什么值得来。
             * 专题标签把「中华文脉与全球视野交融」这条线显性化——
             * 但它是**横切视角**，不是第五个分类：选了它仍然可以
             * 再选学科。
             */}
            <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3.5">
              <TopicIntro />
              <TopicFilter
                className="mt-3"
                resources={hub?.categories.flatMap((c) => c.resources) ?? []}
                activeTopic={activeTopic}
                onChange={setActiveTopic}
              />
            </div>

            {activeResource && activeCategory ? (
              <>
                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  {/* 分类 + 标题 */}
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--seek-bean-soft-border)] bg-[var(--seek-bean-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]">
                      <Radio size={11} strokeWidth={2.4} />
                      {activeCategory.title}
                    </span>
                    <h2 className="mt-2 text-[20px] font-medium leading-tight tracking-[-0.015em] text-[var(--foreground)]">
                      {activeResource.title}
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] font-normal text-[var(--muted-foreground)]">
                      <span>{activeResource.source}</span>
                      {activeResource.provider ? (
                        <span className="rounded-full bg-[var(--muted)] px-1.5 py-px">
                          {activeResource.provider}
                        </span>
                      ) : null}
                      {typeof activeResource.meta?.duration_label === "string" &&
                      activeResource.meta.duration_label ? (
                        <span className="tabular-nums">
                          {activeResource.meta.duration_label}
                        </span>
                      ) : null}
                      {typeof activeResource.meta?.published_at === "string" &&
                      activeResource.meta.published_at ? (
                        <span className="tabular-nums">
                          {activeResource.meta.published_at}
                        </span>
                      ) : null}
                      {activeResource.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[var(--muted)] px-1.5 py-px"
                        >
                          {tag}
                        </span>
                      ))}
                    </p>
                  </div>

                  {/*
                    播放器 + 交互时间轴。

                    时间轴在 ``InteractiveVideoCanvas`` **内部**渲染——
                    因为它依赖播放器的 ``currentTime``（气泡触发与
                    字幕高亮都要跟播放进度同步）。单独抽出来反而要
                    再造一套状态同步机制。
                  */}
                  <InteractiveVideoCanvas
                    resource={{
                      id: activeResource.id,
                      resource_type: activeResource.resource_type,
                      title: activeResource.title,
                      url: activeResource.url,
                      fallback_url: activeResource.fallback_url,
                      ai_context: activeResource.ai_context,
                      provider: activeResource.provider,
                      meta: activeResource.meta,
                      captions: activeResource.captions,
                      interactive_nodes: activeResource.interactive_nodes,
                      // 段落导读——采集视频下方那条轨的数据源。
                      guided_segments: activeResource.guided_segments,
                      is_default: activeResource.is_default,
                    }}
                    courseId="global_resource_hub"
                    pageId={activeResource.id}
                  />
                </div>

                {/* 分类说明 */}
                <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3">
                  <p className="text-[12.5px] font-normal text-[var(--primary)]">
                    {activeCategory.title} · {activeCategory.subtitle}
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.75] font-medium text-[var(--muted-foreground)]">
                    {activeCategory.description}
                  </p>
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-[13px] font-medium text-[var(--muted-foreground)]">
                点左侧的 [选课] 挑一讲开始。
              </p>
            )}
          </div>
        </main>

        {/* AI 助教 */}
        <aside className="flex min-h-0 flex-col gap-2.5 border-l border-[var(--border)] bg-white p-2.5">
          <MacroAdvisor
            courseId="global_resource_hub"
            pageId={activeId ?? undefined}
            // 预装的知识向导——装配器一次性生成好的，打开就立刻有，
            // 不用等模型现场回答。
            guide={activeResource?.study_guide}
            className="shrink-0"
          />
          <MainAiPanel
            courseId="global_resource_hub"
            courseTitle={activeResource?.title ?? hub.title}
            pageId={activeId ?? undefined}
            pageTitle={activeCategory?.title ?? ""}
            className="min-h-0 flex-1"
          />
        </aside>
      </div>

      {/* ── 抽屉 ①：课程分类 ──
       *
       * 点空白处自动收起；选完一讲课也会自动收起（用户已经拿到
       * 他想要的了，抽屉继续挡着画面就是纯粹的阻碍）。
       */}
      <SideDrawer
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title="课程分类"
        width={300}
      >
        <div className="p-2.5">
          <GlobalHubNavigator
            categories={filteredCategories}
            activeResourceId={activeId}
            onSelect={(resource, category) => {
              select(resource, category);
              setCatalogOpen(false);
            }}
          />
        </div>
      </SideDrawer>

      {/* ── 抽屉 ②：留存文档 ──
       *
       * 用户在看公开课时记下的每一条带时间戳的笔记都落在这里。
       * 它跟课程页用的是**同一个** ``ArchiveDrawer`` 组件、同一套
       * ``ReaderContext``——所以「在课程里记的笔记」和「在公开课里
       * 记的笔记」在数据层完全一致，刷新不丢。
       */}
      <SideDrawer
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="我的笔记"
        width={360}
      >
        <ArchiveDrawer
          courseId="global_resource_hub"
          pageId={activeId ?? undefined}
          className="flex h-full flex-col"
        />
      </SideDrawer>

      {/* ── 抽屉 ③：GitHub 开源教育项目审核清单 ──
       *
       * 机器粗筛 → 人工细审 → 才入库。
       *
       * 未经审核的仓库**绝不**直接进入正式课程大盘——所以这个抽屉
       * 里的勾选是唯一的上线闸门。
       */}
      <SideDrawer
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="开源教育资源审核台"
        width={520}
      >
        <GithubReviewConsole
          payload={reviewPayload}
          onApprovalChange={(candidateId, approval) =>
            void setApproval(candidateId, approval)
          }
          onFetchApproved={() => void fetchApproved()}
          fetching={fetchingApproved}
          className="h-full"
        />
      </SideDrawer>
    </div>
  );
}
