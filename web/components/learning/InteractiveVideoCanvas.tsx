"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactPlayer, { type ReactPlayerProps } from "react-player";
import {
  AlertTriangle,
  ChevronDown,
  GitBranch,
  Pause,
  Play,
  Sparkles,
  Target,
  Video,
  WifiOff,
} from "lucide-react";
import { buildBilibiliEmbedUrl, parseBilibiliStartTime, resolveVideo } from "@/lib/video-source";
import type { InteractiveNode, Resource } from "@/lib/courses-api";
import { formatTimestamp } from "@/lib/concept-actions";
import {
  VIDEO_SEEK,
  emitPredictDeepen,
  type VideoSeekDetail,
} from "@/lib/learning-events";
import { InteractiveTimeline } from "@/components/learning/InteractiveTimeline";
import { MasteryProgressBar, toMasterySegments } from "@/components/progress/MasteryProgressBar";
import { SkillTree } from "@/components/progress/SkillTree";
import { useCompanionTimer } from "@/lib/companion-timer";
import { reportWatch, WATCH_REPORT_INTERVAL } from "@/lib/hub-watch";
import { cn } from "@/lib/cn";

/**
 * 交互式视频画布
 * ==============
 *
 * 这是「流媒体交互式沙盘」的**中间栏**。
 *
 * .. code-block:: text
 *
 *     ┌─ 白色悬浮卡片 ────────────────────────┐
 *     │  标题 · 来源 · 进度                  │
 *     │  ┌─ react-player ────────────────┐   │
 *     │  │                               │   │
 *     │  │        视频画面               │   │
 *     │  │   ┌─────────────────────┐    │   │
 *     │  │   │ 💡 什么是机会成本？  │    │   │  ← 透明交互层上的气泡
 *     │  │   └─────────────────────┘    │   │
 *     │  └───────────────────────────────┘   │
 *     └─────────────────────────────────────┘
 *
 * 三层结构
 * --------
 *
 * 1. **react-player** —— 视频本体。必须走它，因为我们要读
 *    ``currentTime``（触发气泡）也要写 ``currentTime``（左侧导航跳转）。
 * 2. **透明交互层** —— 绝对定位在播放器正上方的一层 DOM。它不拦截
 *    播放器的鼠标事件（``pointer-events: none``），只在特定位置摆出
 *    气泡。
 * 3. **气泡** —— 到达时间戳时浮出的实体 UI。
 *
 * 触发逻辑
 * --------
 *
 * 播放进度到达 ``node.timestamp`` 时，气泡出现。它**只出现一次**——
 * 除非用户往回拖，否则不会反复弹。同时**只展示当前时间点前后最近
 * 的那一个**：如果视频里三个知识点都在 10 秒内，不该三个气泡同时糊
 * 在画面上。
 *
 * 点击气泡 = 行为劫持
 * --------------------
 *
 * 点气泡时发生三件事，顺序很重要：
 *
 * 1. **视频立刻暂停** —— 用户被劫持了，得让他停在原地，别让画面继续
 *    往前走（不然他还没读完 AI 的解释视频就播完了）；
 * 2. **唤起右侧 AI** —— 概念 + 视频名 + 时间戳被填进输入框并**自动
 *    发送**（复用既有的「动作分发中心」，所以左栏还会自动打一条带
 *    时间戳的笔记）；
 * 3. **气泡消失** —— 视频已经停了，气泡留着只会挡画面。
 *
 * 为什么复用 ``activateConcept``
 * ------------------------------
 *
 * 因为它已经把「填输入框 → 自动发送 → 打时间戳笔记」这套三段式
 * 动作分发做完了，而且**左右两栏已经在订阅它**。视频气泡只是另一
 * 个「触发源」——跟正文里的 ``[[概念]]`` 标记、字幕节点是同一类东西。
 * 不另起一套，行为才是一致的。
 */

/**
 * 「当前该显示哪个节点」。
 *
 * 判定用的是**跨越**而不是「消费」：
 *
 * .. code-block:: text
 *
 *     上次位置 0.9s  ──▶  现在 2.4s     跨过了 2.0s 的节点 → 触发
 *     上次位置 2.4s  ──▶  现在 3.1s     没跨过任何节点   → 不触发
 *     上次位置 8.5s  ──▶  现在 1.2s     往回走了         → 不触发
 *
 * 为什么不用「消费过的就不再显示」
 * ------------------------------
 *
 * 那样做的话，用户**回看**某一段时气泡就再也不出现了——而「回看那一段」
 * 恰恰是交互沙盘最常见的动作。用户点左侧的 00:23 锚点跳过去，本来就
 * 是想再看一遍那个知识点，结果气泡不在，等于白跳。
 *
 * 跨越判定天然支持回看：位置从 8.5 退回 1.2 时不触发（那是往回走），
 * 但用户再从 1.2 播到 2.4 时**又跨过了 2.0**，气泡会重新出现。
 */
function pickCrossedNode(
  nodes: InteractiveNode[],
  previousTime: number,
  currentTime: number,
): InteractiveNode | null {
  // 往回 seek（或者首播）不触发——那不是「播放过程中到达」。
  if (currentTime < previousTime) return null;

  // 取**这一段跨越的区间内**、最靠后的那个节点。
  const crossed = nodes.filter(
    (node) =>
      node.timestamp > previousTime - 0.35 && node.timestamp <= currentTime + 0.35,
  );
  if (crossed.length === 0) return null;
  return crossed[crossed.length - 1];
}

/**
 * 视频上方的掌握度面板
 * =====================
 *
 * 两部分：**分段掌握度进度条**（永远可见）+ **技能树**（可折叠）。
 *
 * 进度条用当前这节课的节点算——不是整门课的。用户关心的是
 * 「**这节课**我掌握了多少」，而不是「这 136 门课我掌握了多少」。
 */
function VideoMasteryPanel({
  courseId,
  resourceId,
  resourceTitle,
  nodes,
  onSeek,
}: {
  courseId: string;
  resourceId: string;
  resourceTitle: string;
  nodes: InteractiveNode[];
  onSeek: (seconds: number) => void;
}) {
  const [treeOpen, setTreeOpen] = useState(false);

  /**
   * 本节课的技能节点。
   *
   * 用与后端 :func:`mastery_service.skill_nodes` **相同**的规则生成
   * （交互节点优先，没有就用段落导读），这样前端的进度条跟后端
   * 的技能树算出来的数字是**一致的**——不会出现「上面显示 3 个达标、
   * 下面显示 2 个」的分裂。
   */
  const localNodes = useMemo(() => {
    const source = nodes ?? [];
    return source.map((node, index) => ({
      key: `${resourceId}@${Math.floor(node.timestamp ?? 0)}`,
      resource_id: resourceId,
      timestamp: node.timestamp ?? 0,
      title: node.keyword ?? "",
      hint: node.hint ?? node.prompt ?? "",
      context: node.context ?? "",
      accuracy: null as number | null,
      correct_count: 0,
      question_count: 0,
      // 没做过检测 = 未开始。**不预设**成「学习中」——
      // 那是假数据。
      status: "未开始",
      tier: index === 0 ? "tier_1" : "tier_2",
      tier_name: index === 0 ? "入门启蒙" : "核心精修",
      order: index,
    }));
  }, [nodes, resourceId]);

  const segments = useMemo(
    () => toMasterySegments(localNodes),
    [localNodes],
  );

  if (localNodes.length === 0) return null;

  return (
    <div>
      {/* 分段进度条 */}
      <div className="px-3.5 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
            <Target size={12} strokeWidth={2.2} className="text-[var(--primary)]" />
            本节掌握度
          </span>
          <button
            type="button"
            onClick={() => setTreeOpen((prev) => !prev)}
            aria-expanded={treeOpen}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <GitBranch size={10} strokeWidth={2.2} />
            学习阶梯
            <ChevronDown
              size={11}
              strokeWidth={2.4}
              className={cn("transition-transform", treeOpen && "rotate-180")}
            />
          </button>
        </div>
        <MasteryProgressBar segments={segments} size="md" />
        <p className="mt-1.5 text-[10.5px] text-[var(--muted-foreground)]">
          {resourceTitle} · 共 {localNodes.length} 个知识节点
        </p>
      </div>

      {/* 技能树 */}
      {treeOpen ? (
        <div className="border-t border-[var(--border)]">
          <SkillTree
            courseId={courseId}
            onSelectNode={(node) => onSeek(node.timestamp)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function InteractiveVideoCanvas({
  resource,
  courseId,
  pageId,
  episodeStart,
  episodeEnd,
  onProgressChange,
  onEnded,
  className = "",
}: {
  resource: Resource;
  courseId?: string;
  pageId?: string;
  /**
   * 本集在原视频里的**起点**（秒）——时间轴切片时 > 0。
   *
   * 播放器要定位到这里，并且「本集内的进度」= 当前时间 − 起点。
   */
  episodeStart?: number;
  /**
   * 本集在原视频里的**终点**（秒）——时间轴切片时用。
   *
   * 播到这里就**自动停**——一集播完就该进入学完闭环，而不是继续
   * 播下一段（下一段是下一集的内容）。
   */
  episodeEnd?: number | null;
  /** 播放进度变化时的回调（**本集内**的相对秒数）。 */
  onProgressChange?: (position: number, duration: number) => void;
  /** 本集播完时的回调。 */
  onEnded?: () => void;
  className?: string;
}) {
  const playerRef = useRef<ReactPlayer>(null);

  /** 当前播放位置（秒）。 */
  const [currentTime, setCurrentTime] = useState(0);
  /**
   * 播放器的播放状态。
   *
   * 初始是 ``undefined``——**非受控**。这样用户点原生播放键时，
   * 播放器完全由自己控制，不会跟我们抢方向盘。
   *
   * 只有在「气泡点击要劫持」的那一刻才下发一个明确的 ``false``，
   * 让播放器暂停。暂停之后（``onPause``）把它还原成 ``undefined``，
   * 把控制权还给用户。
   *
   * 一开始就固定成 ``false`` 是错的——那会让用户点播放键时播放器
   * 刚起步就被我们的状态回拨掉。
   */
  const [playing, setPlaying] = useState<boolean | undefined>(undefined);
  /** 是否正在播放。 */
  const [isPlaying, setIsPlaying] = useState(false);
  /**
   * 已经**到达过**的节点时间戳。
   *
   * 它只用来显示「知识点 2/3」这样的进度计数，**不参与触发判定**——
   * 触发靠的是「播放位置跨越」，所以用户回看某一段时气泡会重新出现。
   */
  const [reached, setReached] = useState<Set<number>>(new Set());
  /** 上一次 ``onProgress`` 报告的位置——用来判断「跨越」了哪个节点。 */
  const lastTimeRef = useRef(0);
  /** 用户主动跳转到的位置——由左侧导航驱动。 */
  const [seekTarget, setSeekTarget] = useState<number | null>(null);

  /**
   * 视频总时长（秒）——播放器实测出来的。
   *
   * 声明在这里（而不是渲染区附近）是因为 B 站的伴随式计时器也要
   * 用它封顶——而计时器要早于 ``video`` 的定义。
   */
  const [measuredDuration, setMeasuredDuration] = useState(0);

  /* ────────────────────────────────────────────────────────────────────
   * 源降级：主源挂了自动切备用源
   * ──────────────────────────────────────────────────────────────────
   *
   * 主源（YouTube / B 站）加载失败或超时时，自动切到备用源
   * （通常是国内对象存储上的 ``.mp4`` 直链）。
   *
   * 为什么要做降级
   * ------------
   *
   * YouTube 在国内网络环境下**经常连不上**——不是被墙，而是 DNS
   * 污染后的超时，表现为播放器一直转圈或者干脆空白。用户看到的是
   * 一个「黑框」，既不知道发生了什么，也没有任何出路。
   *
   * 所以数据里每条资源可以额外写一个 ``fallback_url``——指向云盘 /
   * OSS / 对象存储上的同款 ``.mp4``。主源一挂，**自动**切过去，
   * 用户不需要点任何按钮。
   *
   * 降级是**一次性**的：切过去之后不再往回切（网络抖动来回切会让
   * 播放器反复重载，比一直用备用源更糟）。
   */
  const [fallbackActive, setFallbackActive] = useState(false);
  /** 已经降级过——防止反复切换。 */
  const downgradedRef = useRef(false);
  /**
   * 播放器是否已经「就绪」。
   *
   * 这是判定主源连不上的**唯一可靠信号**：YouTube 挂了的时候既不
   * ``onError`` 也不 ``onReady``，只是永远卡在转圈。
   */
  const playerReadyRef = useRef(false);

  /**
   * 主源。
   *
   * 依赖项必须全是**标量**。上游传进来的 ``resource`` 每次渲染都是
   * 新对象，``resource.meta`` 更是嵌套对象——直接放进依赖会让这个
   * memo 每次渲染都重算，产出一个新的解析结果，进而重置降级计时器。
   *
   * 这里把 meta 摊平成它真正用到的几个标量字段。
   */
  const metaDuration = resource.meta?.duration;
  const primaryVideo = useMemo(
    () =>
      resolveVideo({
        url: resource.url,
        title: resource.title,
        meta: { duration: metaDuration },
      }),
    [resource.url, resource.title, metaDuration],
  );

  /**
   * 备用源地址。
   *
   * 单独抽成字符串 memo——**很关键**。
   *
   * 上游传进来的 ``resource`` 是个每次渲染都新建的对象字面量，所以
   * 直接把 ``resource`` 当依赖会让 memo 每次都重算，产出一个**新的
   * 对象**。而 ``fallbackVideo`` 又是降级计时器的依赖——于是每次重渲染
   * 都会重置那个 15 秒计时器，计时永远走不到头，降级机制形同虚设。
   *
   * 抽成字符串后，依赖的值在两次渲染之间是**同一个**（字符串按值
   * 比较），memo 不会重算，计时器也不会被重置。
   */
  const fallbackUrl = useMemo(() => {
    const raw =
      (resource as unknown as { fallback_url?: string }).fallback_url ??
      (resource as unknown as { fallbackUrl?: string }).fallbackUrl;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "";
  }, [
    (resource as unknown as { fallback_url?: string }).fallback_url,
    (resource as unknown as { fallbackUrl?: string }).fallbackUrl,
  ]);

  /**
   * 备用源。
   *
   * 解析结果要独立于主源——主源失败时才能顶上来。
   */
  const fallbackVideo = useMemo(() => {
    if (!fallbackUrl) return null;
    return resolveVideo({ url: fallbackUrl, title: resource.title });
  }, [fallbackUrl, resource.title]);

  /**
   * 降级动作。
   *
   * 只有在「存在备用源」且「还没降级过」时才切。
   */
  const degrade = useCallback(() => {
    if (downgradedRef.current) return;
    if (!fallbackVideo) return;
    downgradedRef.current = true;
    setFallbackActive(true);
  }, [fallbackVideo]);

  /**
   * 主源超时探测。
   *
   * YouTube 连不上时**不会**触发 ``onError``——它只是永远不 ``onReady``。
   * 所以要加一个超时兜底：过了 N 秒播放器还没准备好，就判定主源挂了。
   *
   * 判定信号是 ``playerReady``（来自 react-player 的 ``onReady``），
   * 而不是「有没有在播放」——用户没点播放属于正常状态，不能算失败。
   *
   * **只对 ``player`` 型主源生效。**
   *
   * ``iframe`` 型主源（B 站）走的是 ``<iframe>`` 的 ``onLoad``——
   * 它一定会触发（哪怕加载出来的是错误页），所以 iframe 主源不会
   * 被误判成「超时」。如果不做这个区分，B 站主源会被无缘无故地
   * 降级掉——那是纯粹的 bug。
   */
  useEffect(() => {
    if (!fallbackVideo) return;
    if (fallbackActive) return;
    // 只有 react-player 型主源才有「ready / 不 ready」之分。
    if (primaryVideo?.kind !== "player") return;

    // ── 快速探活：2.5 秒内判定 YouTube 通不通 ──
    //
    // 光靠等播放器 ``onReady`` 要 15 秒——用户盯着黑框干等太久。
    // 所以先做一次**独立**的探活：拉 YouTube 的 favicon。
    //
    // 选 favicon 是因为它极小（几百字节）、走 CDN、且**不需要任何
    // CORS 响应头**——``mode: "no-cors"`` 下一个不透明响应也算成功。
    // 只要这个请求在 2.5 秒内**没能完成**，就说明到 YouTube 的
    // 这条链路已经不通（DNS 污染 / 超时），此时立刻降级到备用源。
    //
    // 探活成功 → 说明网络通，继续给播放器 15 秒的 ``onReady`` 宽限。
    // 探活失败 → 2.5 秒就切，用户几乎感觉不到等待。
    let cancelled = false;

    const probe = () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      fetch("https://www.youtube.com/favicon.ico", {
        mode: "no-cors",
        signal: controller.signal,
        cache: "no-store",
      })
        .then(() => {
          window.clearTimeout(timeout);
          // 网络通——但播放器可能仍有问题（比如视频已下架）。
          // 所以**不**在这里降级，交给下面的 ``onReady`` 宽限期。
        })
        .catch(() => {
          window.clearTimeout(timeout);
          if (cancelled || fallbackActive) return;
          // 2.5 秒探活失败 → 立刻切备用源。
          degrade();
        });
    };

    probe();

    // ── 宽限期：网络通但播放器迟迟不 ready ──
    const timer = window.setTimeout(() => {
      if (!playerReadyRef.current) degrade();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fallbackVideo, fallbackActive, degrade, primaryVideo?.kind]);

  /** 实际渲染用的源。 */
  const video = useMemo(
    () =>
      fallbackActive && fallbackVideo ? fallbackVideo : primaryVideo,
    [fallbackActive, fallbackVideo, primaryVideo],
  );

  /* ────────────────────────────────────────────────────────────────────
   * B 站伴随式计时器（跨域 iframe 的时间轴破局）
   * ──────────────────────────────────────────────────────────────────
   *
   * B 站的 ``<iframe>`` 不暴露播放进度——拿不到 ``currentTime``，
   * 也听不到 ``timeupdate``。但重点提示气泡**不能**因此就不出现。
   *
   * 破局的关键是 B 站的一个特殊能力：``<iframe>`` 的 ``src`` 里的
   * ``t=`` 参数。我们用它做两件事：
   *
   * 1. **精确跳转**——用户点 03:20，改写 ``src`` 为 ``t=200``，
   *    播放器从 200 秒起播（``autoplay=1``，自动接续）；
   * 2. **同步走表**——我们自己维护一份「进度影子」，从跳转点开始
   *    走。影子跨过某个节点时间戳时，弹出该节点的重点提示。
   *
   * 详见 :func:`useCompanionTimer` 的说明。
   */

  /**
   * B 站 iframe 的**当前地址**。
   *
   * 单独用 state 存，而不是直接用 ``video.embedUrl``——因为跳转时
   * 要改写 ``t=`` 参数，而 ``video`` 是从 props 推导出来的常量。
   */
  const [biliFrameUrl, setBiliFrameUrl] = useState<string | null>(null);

  /** 当前是不是 B 站 iframe 模式（iframe + 有 bvid）。 */
  const isBilibiliFrame = Boolean(video?.kind === "iframe" && video?.bvid);

  /** 视频总时长——计时器封顶用。 */
  const knownDuration = video?.duration ?? measuredDuration;

  /** 伴随式计时器。 */
  const companion = useCompanionTimer(knownDuration);

  /**
   * 计时器的「上一次位置」——用来做跨越判定。
   *
   * 与 ``lastTimeRef``（播放器真实进度）是两套东西：那个给
   * ``react-player`` 用，这个给 B 站影子进度用。
   */
  const companionLastRef = useRef(0);

  /**
   * 切台 / 换源时重置 B 站 iframe 的地址。
   *
   * 换到另一条视频时，iframe 的 ``t=`` 必须归零——否则会把上一条
   * 的跳转点带过来。
   */
  useEffect(() => {
    setBiliFrameUrl(null);
    companionLastRef.current = 0;
  }, [resource.id, resource.url]);

  /**
   * 换资源时重置一切与「源」有关的状态。
   *
   * 切台之后降级状态必须清掉——上一条视频挂了降级到备用源，不代表
   * 新的一条也需要降级。否则第二条视频会直接显示「已切换到备用源」，
   * 但它其实用的是主源。
   */
  useEffect(() => {
    downgradedRef.current = false;
    setFallbackActive(false);
    // 换源之后重新开始探活——新的一条视频还没就绪。
    playerReadyRef.current = false;
  }, [resource.url]);

  const nodes = useMemo(
    () =>
      (resource.interactive_nodes ?? [])
        .filter((node) => node.keyword)
        .sort((a, b) => a.timestamp - b.timestamp),
    [resource.interactive_nodes],
  );

  /** 字幕轨——视频说的全部内容。 */
  const captions = useMemo(
    () => (resource.captions ?? []).filter((caption) => caption.text),
    [resource.captions],
  );

  /**
   * 段落导读——装配器预先生成的结构化讲解。
   *
   * 视频下方那条导读轨的数据源。没有它，采集来的视频（大多没有 CC
   * 字幕）下方就是一片空白。
   */
  const guidedSegments = useMemo(
    () => (resource.guided_segments ?? []).filter((segment) => segment.content),
    [resource.guided_segments],
  );

  /** 换资源时一切归零。 */
  useEffect(() => {
    setCurrentTime(0);
    setReached(new Set());
    setSeekTarget(null);
    setIsPlaying(false);
    // 位置基线也要归零——否则新资源的第一帧会被算成「从旧位置跨过来」。
    lastTimeRef.current = 0;
  }, [resource.id]);

  /**
   * 播放进度回调。
   *
   * ``react-player`` 的 ``onProgress`` 在播放时持续触发。这里做两件事：
   * 更新时间状态、检测是否撞上了某个交互节点。
   */
  const onProgress = useCallback(
    (state: { played: number; playedSeconds: number; loadedSeconds: number }) => {
      const seconds = state?.playedSeconds ?? 0;
      const previous = lastTimeRef.current;
      lastTimeRef.current = seconds;
      setCurrentTime(seconds);

      // 观看时长累加——只累加「这一帧推进的时长」。
      // 播放器在后台标签页里节流时不会调 onProgress，所以这里
      // 天然不会把「挂着不看」的时间算进去。
      const advanced = seconds - previous;
      if (advanced > 0 && advanced < 2) accumulateWatch(advanced);

      // ── 分集边界：本集播完就停 ──
      //
      // 时间轴切片模式下，「本集」是原视频里的一段。播到终点就必须
      // 停下——否则用户会一路播进下一集的内容，而下一集是**另一集**，
      // 它的知识点、字幕、诊断全都对不上。
      if (episodeEnd && seconds >= episodeEnd) {
        setPlaying(false);
        setIsPlaying(false);
        if (isBilibiliFrame) companion.pause();
        onEnded?.();
        return;
      }

      // ── 分集进度回调（本集内的相对秒数）──
      if (onProgressChange) {
        const start = episodeStart ?? 0;
        const end = episodeEnd ?? 0;
        onProgressChange(
          Math.max(0, seconds - start),
          end > start ? end - start : 0,
        );
      }

      if (nodes.length === 0) return;

      // 「跨越」判定——回看时也会重新计数。
      const node = pickCrossedNode(nodes, previous, seconds);
      if (!node) return;

      // 记一笔「已到达」——只用于进度计数。
      setReached((prev) => {
        if (prev.has(node.timestamp)) return prev;
        const next = new Set(prev);
        next.add(node.timestamp);
        return next;
      });
    },
    [nodes, episodeEnd, episodeStart, isBilibiliFrame, companion, onEnded, onProgressChange],
  );

  /**
   * 订阅左侧导航发来的跳转请求。
   *
   * 载荷带资源 id——一节课可能有多个视频资源，不校验 id 就会跳到
   * 错误的那一个。
   */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<VideoSeekDetail>).detail;
      if (!detail) return;
      // 资源 id 是**可选**的。
      //
      // 带 id 时必须匹配——一节课可能有多个视频资源，不校验就会跳到
      // 错误的那一个。
      //
      // 不带 id 时（AI 回答里的时间锚点）不限定资源：那个时间戳是
      // 相对于「此刻正在看的这条视频」说的，由当前播放器自己处理。
      if (detail.resourceId && detail.resourceId !== resource.id) return;
      if (typeof detail.timestamp !== "number") return;
      setSeekTarget(detail.timestamp);
    };
    window.addEventListener(VIDEO_SEEK, handler);
    return () => window.removeEventListener(VIDEO_SEEK, handler);
  }, [resource.id]);

  /* ────────────────────────────────────────────────────────────────────
   * 观看进度上报
   * ──────────────────────────────────────────────────────────────────
   *
   * 每隔 15 秒上报一次「我又看了 N 秒」——**增量**，不是累计值。
   *
   * 这份数据最终会出现在学情中心的「中台」条目里：看了多久、
   * 看过几门课、覆盖率多少。
   *
   * 三个源都要上报：
   *
   * - YouTube / 直链 → 播放器的真实进度；
   * - B 站 iframe → 影子计时器的位置（我们唯一能拿到的进度）。
   */
  const watchAccumRef = useRef(0);

  useEffect(() => {
    // 换资源时把累计的增量清零——上一条的观看时长不能算到这一条头上。
    watchAccumRef.current = 0;
  }, [resource.id]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      const delta = watchAccumRef.current;
      if (delta < 1) return;
      watchAccumRef.current = 0;

      const position = isBilibiliFrame ? companion.time : currentTime;
      void reportWatch({
        resourceId: resource.id,
        title: resource.title ?? "",
        position,
        duration: knownDuration,
        delta,
      });
    }, WATCH_REPORT_INTERVAL);

    return () => window.clearInterval(handle);
  }, [resource.id, resource.title, isBilibiliFrame, companion.time, currentTime, knownDuration]);

  /**
   * 把「这次又看了多少秒」累加进待上报的增量里。
   *
   * 只在**真的在播**的时候累加——用户暂停了 5 分钟，那 5 分钟
   * 不该算作「看了」。
   */
  const accumulateWatch = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    watchAccumRef.current += seconds;
  }, []);

  /**
   * **统一跳转入口**——B 站与普通播放器走两条路。
   *
   * B 站的 iframe 没有 ``seekTo``，唯一的外部控制通道是 ``src`` 里的
   * ``t=``。所以 B 站的跳转是「改写 iframe 地址 + 重载 iframe」，
   * 而普通播放器是 ``player.seekTo()``。
   *
   * 两条路都会**同步计时器**——B 站的影子进度必须跟真实播放位置
   * 一致，否则气泡会在错误的时刻弹出。
   */
  const seekTo = useCallback(
    (seconds: number) => {
      const target = Math.max(0, Math.floor(seconds));

      if (isBilibiliFrame && video?.bvid) {
        // ── B 站：改写 iframe 的 src，播放器从 target 秒起播 ──
        setBiliFrameUrl(
          buildBilibiliEmbedUrl(video.bvid, target, { autoplay: true }),
        );
        // 影子进度跟着跳——它必须与播放器实际位置一致。
        //
        // 顺带把计时器**启动**：用户主动点了时间戳，说明他要从这一
        // 秒开始看。影子从这一秒走表，气泡才会跟着弹。
        companion.start(target);
        companionLastRef.current = target;
        setCurrentTime(target);
        return;
      }

      // ── 普通播放器：react-player 的 seekTo ──
      setSeekTarget(target);
    },
    [isBilibiliFrame, video?.bvid, companion],
  );

  /**
   * 外部导航请求跳转到某个时间戳。
   *
   * 左侧「视频切片导航」点某个知识锚点时，中间栏的播放器要立刻
   * ``seekTo()`` 过去。两个组件树没有父子关系，所以靠事件总线。
   *
   * B 站的 iframe 没有 ``seekTo``——它走「改写 iframe 地址」的
   * 那条路（见上面的 :func:`seekTo`）。
   */
  useEffect(() => {
    if (seekTarget === null) return;

    // B 站：改写 iframe 的 src，走不到下面的 player.seekTo()。
    if (isBilibiliFrame && video?.bvid) {
      seekTo(seekTarget);
      setSeekTarget(null);
      return;
    }

    const player = playerRef.current;
    if (!player) return;
    try {
      player.seekTo(seekTarget, "seconds");
      setCurrentTime(seekTarget);
    } catch {
      /* 跨域视频可能拒绝 seek——不影响 */
    }
    // 位置基线同步到跳转点——否则跳转后的第一帧会被算成「跨越」，
    // 把刚好在跳转点之后的节点立刻弹出来（用户还没开始看那一段）。
    lastTimeRef.current = seekTarget;
    setSeekTarget(null);
  }, [seekTarget, isBilibiliFrame, video?.bvid, seekTo]);

  /**
   * B 站影子进度的跨越检测。
   *
   * 与 ``onProgress`` 里对真实播放器做的那套逻辑**完全一致**——
   * 同一个 :func:`pickCrossedNode`，只是喂给它的「当前位置」来自
   * 影子计时器而不是播放器。
   */
  useEffect(() => {
    if (!isBilibiliFrame) return;
    if (nodes.length === 0) return;

    const previous = companionLastRef.current;
    const current = companion.time;
    if (Math.abs(current - previous) < 0.01) return;
    companionLastRef.current = current;

    // 观看时长累加——影子计时器推进的秒数就是实际观看的秒数。
    // 它只在「用户开始观看」后才走表，所以暂停期间不会累加。
    const advanced = current - previous;
    if (advanced > 0 && advanced < 2) accumulateWatch(advanced);

    const node = pickCrossedNode(nodes, previous, current);
    if (!node) return;

    setReached((prev) => {
      if (prev.has(node.timestamp)) return prev;
      const next = new Set(prev);
      next.add(node.timestamp);
      return next;
    });
  }, [
    companion.time,
    isBilibiliFrame,
    nodes,
    accumulateWatch,
  ]);

  if (!video) {
    return (
      <div className="rounded-xl bg-[var(--muted)]/50 px-4 py-6 text-center text-[12.5px] text-[var(--muted-foreground)]">
        这段视频暂时无法播放（链接无法识别）。
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-seek-interactive-video>
      {/* ── 降级提示 ──
       *
       * 主源挂掉、切到备用源之后，用户必须知道**为什么画面变了**——
       * 否则他会以为是自己网络出问题，或者以为平台换了内容。
       *
       * 提示要极简：一行小字 + 一个手动切回的按钮（网络恢复后
       * 用户可能想用回主源）。
       */}
      {fallbackActive && (
        <div
          className="flex items-center gap-2 rounded-lg border border-[var(--seek-divider-warm)] bg-[var(--seek-warm)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--seek-muted-foreground)]"
          role="status"
        >
          <WifiOff size={12} strokeWidth={2} className="shrink-0" />
          <span className="flex-1">
            主源连接不畅，已自动切换到备用源播放。
          </span>
          {primaryVideo && (
            <button
              type="button"
              onClick={() => {
                downgradedRef.current = false;
                setFallbackActive(false);
              }}
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-normal text-[var(--seek-plum)] underline underline-offset-2 hover:opacity-70"
            >
              切回原源
            </button>
          )}
        </div>
      )}
      {/* ── 播放器 + 透明交互层 ──
       *
       * 容器锁死 ``aspect-video``（16:9）。这是「自适应黑边处理」的
       * 关键：容器比例固定，视频画面在容器内按比例缩放，
       * **不可能**把排版撑爆，也不可能出现「上下黑边 + 左右留白」
       * 这种又宽又矮的畸形容器。
       *
       * 内部用 ``object-contain``（而不是 ``cover``）：``cover`` 会
       * 裁掉画面边缘——对于教学内容，裁掉就等于丢失信息。
       * ``contain`` 保证整个画面可见，多余部分由容器的黑色背景吸收。
       *
       * B 站的 ``as_wide=1`` 让它的播放器本身就是 16:9，因此嵌进来
       * 不会有两侧黑边。
       */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/90">
        {video.kind === "iframe" ? (
          <iframe
            // B 站精确跳转——``biliFrameUrl`` 带 ``t=<秒>``。
            // 非 B 站的 iframe（比如手工贴的外链）沿用原始地址。
            src={isBilibiliFrame ? biliFrameUrl ?? video.embedUrl : video.embedUrl}
            title={resource.title || "课程视频"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
            style={{ objectFit: "contain" }}
            // iframe 加载完成 = 播放器就绪。
            //
            // 对 B 站来说这是「用户已经点了播放、画面出来了」的信号——
            // 我们据此启动影子计时器，让气泡开始跟着走。
            onLoad={() => {
              if (!isBilibiliFrame) return;
              // 从当前地址的 ``t=`` 参数恢复进度；没有就从头开始。
              const from = biliFrameUrl
                ? parseBilibiliStartTime(biliFrameUrl)
                : 0;
              companion.start(from);
              companionLastRef.current = from;
            }}
          />
        ) : (
          <ReactPlayer
            url={video.src}
            ref={playerRef}
            width="100%"
            height="100%"
            controls
            playsInline
            // 「干净模式」配置——YouTube 关推荐、Vimeo 关标题条。
            // 见 lib/video-source.ts 的说明。
            config={video.playerConfig}
            preload="metadata"
            onProgress={onProgress}
            onDuration={(value: number) => setMeasuredDuration(value || 0)}
            // 主源加载失败 → 自动切备用源。
            onError={() => {
              if (!fallbackActive) degrade();
            }}
            playing={playing}
            onPlay={() => {
              setPlaying(undefined);
              setIsPlaying(true);
            }}
            onPause={() => {
              // 还原成非受控——把播放控制权交还给用户。
              setPlaying(undefined);
              setIsPlaying(false);
            }}
            onReady={() => {
              // 播放器就绪——这是降级探测的成功信号。
              //
              // 注意别在这里设 ``isPlaying``：「就绪」不等于「正在
              // 播放」。用户看到的是一个准备好但没开始播的播放器，
              // 而 ``isPlaying`` 会驱动播放状态显示，两者不是一回事。
              playerReadyRef.current = true;
            }}
          />
        )}

        {/*
          透明交互层。

          ``pointer-events: none`` 让它**不拦截**播放器的鼠标事件
          （否则用户点不到播放按钮），但气泡自己开 ``pointer-events:
          auto``，所以气泡仍然可点。

          这是「透明交互层」的全部意思：一层看不见但能接住交互的
          DOM，覆盖在视频画面之上。
        */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          aria-live="polite"
        >
          {/*
            互动胶囊（不是卡片）
            ====================

            这一版把「知识点气泡」从**460px 宽的白底卡片**缩成了一颗
            **右下角的半透明深蓝胶囊**。

            为什么必须这么改
            --------------

            旧方案的问题不在于「丑」，而在于它**占的是最贵的地方**——
            画面正中。用户在讲课时最需要看的就是画面：讲师的板书、
            图表、演示软件的操作。而一张 460px 的白卡盖在 16:9 的
            画面中央，几乎把整个视频挡掉一半。

            更麻烦的是**语义冲突**：卡片里写满了概念解释、按钮、
            辅助文案。用户看到它的第一反应是「读这张卡」，而不是
            「继续看视频」。学习节奏被打断了。

            胶囊方案
            --------

            * **位置**——右下角。人的视线在听讲时习惯性落在画面
              中心与下方，右下角是「余光区」：能被注意到，但不遮挡。
            * **尺寸**——极小。一行字 + 一个图标，最多两行。
            * **颜色**——``rgba(15,23,42,0.8)`` + 毛玻璃。深色压在
              视频上永远比浅色卡片更不刺眼（视频画面本身是高对比的
              彩色块，浅色卡片跟它抢注意力，深色则「沉」进去）。
            * **点击行为**——视频暂停、胶囊消失、问题自动发给右侧
              AI。**大面积的解读工作交给 AI 助教**，视频区只负责
              「提醒你这里有个值得问的点」。

            这是一个明确的分工：**视频负责发现，AI 负责解答。**
          */}
        {/*
          ⛔ **「发现关键点」气泡已彻底移除**。

          旧版在视频右下角浮出一颗深色胶囊，点它会把视频暂停、把
          问题自动发给右侧 AI。看起来很聪明，实际上有三个问题：

          1. **位置错了**——视频是这一页里最贵的一块视觉资源，右下角
             恰恰是「字幕 / 播放控件 / 进度条」的地盘。气泡压在那里，
             要么挡住字幕，要么挡住控件。
          2. **时机错了**——它按**时间戳**自动弹出，与用户是否真的在
             看这一段毫无关系。用户在拖进度条找某一节，它照样弹。
          3. **职责重了**——「这里有个值得问的点」这件事，右侧 AI 伴学
             的实时学习上下文已经承担了（它知道用户此刻在教具里干了
             什么，比时间戳准得多）。

          所以：**视频只负责讲清楚，不负责插嘴。** 想问随时可以问。
        */}
      </div>

        {/* ── B 站伴随式计时器 HUD ──
         *
         * B 站 iframe 拿不到播放进度。这里的计时器是我们自己维护的
         * 「进度影子」——它从用户最后一次跳转/点击开始走表，并驱动
         * 重点提示气泡。
         *
         * 【⏸ 同步计时 / ▶ 继续】是给用户的**微调钮**：B 站播放器
         * 自己的暂停键我们听不到，用户在这里点一下就能让影子跟上
         * 真实进度。
         */}
        {isBilibiliFrame && (
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg bg-[#1e242b] px-2 py-1 text-white">
            <button
              type="button"
              onClick={() => companion.toggle()}
              title={companion.running ? "暂停同步计时" : "继续同步计时"}
              aria-label={companion.running ? "暂停同步计时" : "继续同步计时"}
              className="inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-white/15"
            >
              {companion.running ? (
                <Pause size={11} strokeWidth={2.4} />
              ) : (
                <Play size={11} strokeWidth={2.4} />
              )}
            </button>
            <span className="font-mono text-[11px] tabular-nums">
              {formatTimestamp(companion.time)}
            </span>
            <span className="text-[10px] text-white/60">
              {companion.running ? "同步计时" : "计时已停"}
            </span>
          </div>
        )}
      </div>

      {/* ── 不可播放的 iframe 的提示 ──
       *
       * ⛔ **100% 实心纯白**——这条提示**不是**压在画面上的半透明
       *    气泡。旧版把它做成 ``bg-black/55`` 的浮层，叠在视频上既
       *    模糊又抢注意力，还违反「全站严禁半透明文字框」的红线。
       *
       * 现在它落在视频**下方**，与进度条同一条信息带里——同样是实心
       * 白底 + 深炭黑文字。
       */}
      {video.kind === "iframe" && !isBilibiliFrame && nodes.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-[#E5E2DA] bg-white px-3 py-2">
          <AlertTriangle
            size={12}
            strokeWidth={2.2}
            className="mt-0.5 shrink-0 text-[#A48A5E]"
          />
          <p className="text-[11.5px] leading-relaxed text-[#1E293B]">
            此来源无法同步播放进度——重点导读需要 YouTube 或 B 站等可精确定位的片源。
          </p>
        </div>
      ) : null}

      {/* ── 进度与状态条 ──
       *
       * 全部图标化——「收起气泡」这种低频操作不该占文字的位置，
       * 悬停提示（``title``）足够说明它是什么。
       */}
      <div className="flex items-center gap-2 text-[12px] font-normal text-[var(--muted-foreground)]">
        <Video size={12} strokeWidth={2} />
        {/* B 站源的进度显示**影子计时器**的位置——那是用户唯一
            能看到的「我在第几秒」。 */}
        <span className="tabular-nums">
          {formatTimestamp(isBilibiliFrame ? companion.time : currentTime)}
        </span>
        <span className="opacity-50">/</span>
        <span className="tabular-nums">{formatTimestamp(knownDuration)}</span>

        {nodes.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="tabular-nums">
              重点 {reached.size}/{nodes.length}
            </span>
          </span>
        ) : null}
      </div>

      {/* ── 掌握度分段进度条 + 技能树 ──
       *
       * 视频下方、时间轴之上。
       *
       * 顺序是刻意的：先看「我掌握了多少」，再看「具体在哪些节点上」，
       * 最后才看「这一节课讲了什么」。这个顺序对应一个真实的学习
       * 心流——**先定位，再深入**。
       *
       * 技能树默认**折叠**：它是导航，不是内容。用户想看阶梯结构时
       * 才展开。
       */}
      {courseId ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <VideoMasteryPanel
            courseId={courseId}
            resourceId={resource.id}
            resourceTitle={resource.title || video.provider}
            nodes={nodes}
            onSeek={(seconds) => {
              seekTo(seconds);
              setPlaying(false);
              setIsPlaying(false);
            }}
          />
        </div>
      ) : null}

      {/* ── 交互式时间轴 + 字幕轨（二合一） ──
       *
       * 气泡是「作者挑的重点」，时间轴是「视频说的全部」。两者现在
       * 住在**同一个面板**里——之前它们一个在左栏、一个在视频下方，
       * 两条时间轴分处屏幕两端，是「双时间轴晕眩」的根源。
       */}
      <InteractiveTimeline
        captions={captions}
        nodes={nodes}
        guidedSegments={guidedSegments}
        currentTime={isBilibiliFrame ? companion.time : currentTime}
        mediaTitle={resource.title || video.provider}
        courseId={courseId}
        pageId={pageId}
        onSeek={(seconds) => {
          // 跳到那句话——走统一入口。
          //
          // B 站走「改写 iframe 的 t= 参数」，普通播放器走
          // ``seekTo()``。两条路都会同步位置基线，避免跳转后第一帧
          // 被误判成「跨越」而误弹气泡。
          seekTo(seconds);
          setPlaying(false);
          setIsPlaying(false);
        }}
      />
    </div>
  );
}
