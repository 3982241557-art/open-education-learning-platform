"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  CircleHelp,
  Lightbulb,
  MessageSquareQuote,
  Quote,
  TriangleAlert,
} from "lucide-react";
import type { GuidedSegment, InteractiveNode, VideoCaption } from "@/lib/courses-api";
import { activateConcept, formatTimestamp } from "@/lib/concept-actions";
import { emitTimestampQuote } from "@/lib/learning-events";
import { cn } from "@/lib/cn";

/**
 * 交互式时间轴逐字讲解
 * ==================
 *
 * 这是「双时间轴归一」的产物：把原来分散在两处的信息合并成**一个**
 * 面板，就贴在视频正下方。
 *
 * .. code-block:: text
 *
 *     ┌─ 重点导读（横向滚动） ──────────────────────┐
 *     │ [💡 机会成本] [💡 免费冰淇淋] [💡 相互交易]      │
 *     └─────────────────────────────────────────────────┘
 *     ┌─ 逐句字幕 ───────────────────────────────────────┐
 *     │ 00:14  机会成本是指个人本来可以获得的…           │
 *     │        ┌────────────────────────────────┐      │
 *     │        │ 💡 相互交易与受益  ← 内嵌胶囊     │      │
 *     │        └────────────────────────────────┘      │
 *     │ 00:35  经济学家用机会成本来判断…                │
 *     └─────────────────────────────────────────────────┘
 *
 * 为什么必须合并
 * --------------
 *
 * 之前的布局有**两处**时间信息：
 *
 * 1. 左栏「知识切片」列表——00:09 / 00:23 / 00:35…
 * 2. 视频下方「逐字讲解」——逐句字幕
 *
 * 两者描述的是**同一条视频的时间轴**，却画在屏幕两端。用户想找
 * 「那个讲相互交易的时刻」时，眼睛要在两个地方来回扫——这正是
 * 「双时间轴晕眩」的来源。
 *
 * 合并之后：
 *
 * * **一处**时间轴，字幕是它的骨架；
 * * 知识切片不再是独立列表，而是**内嵌在对应字幕行里**的胶囊——
 *   它就长在它该在的位置（那个时刻），不用另开一栏；
 * * 顶部那排横向胶囊是「速跳条」，给不想滚动的人一条捷径。
 *
 * 两路合一
 * --------
 *
 * * 点**时间戳** → 只跳转，不打扰 AI；
 * * 点**字幕正文** → 跳转 + 暂停 + 唤醒 AI（贴着这一段回答）；
 * * 点**知识胶囊** → 跳转 + 暂停 + 唤醒 AI（针对这个概念）。
 */

/** 气泡类型 → 图标。 */
const NODE_ICON: Record<InteractiveNode["type"], typeof Lightbulb> = {
  concept: Lightbulb,
  question: CircleHelp,
  quote: Quote,
  warning: TriangleAlert,
};

/**
 * 标签页键。
 *
 * 三个标签对应视频下方的三份内容：
 *
 * - ``nodes``——知识节点（作者挑出来的重点时间点）；
 * - ``segments``——段落导读（结构化的分段讲解）；
 * - ``captions``——完整字幕（逐句时间轴）。
 */
type TabKey = "nodes" | "segments" | "captions";

/**
 * 行首的 [💬 引用提问] 按钮
 * =========================
 *
 * 一颗**极小**的按钮——它必须小到「不点也不会注意到」的程度。
 *
 * 为什么做成「悬停才显形」
 * ----------------------
 *
 * 时间戳那一列本来就挤：``01:45`` 加上一个图标按钮，再加一句话的
 * 正文，横向空间立刻不够。所以按钮**默认透明**，鼠标移到那一行时
 * 才淡入。这样：
 *
 * * 静止阅读时——行首只有干净的时间戳，视线不被打断；
 * * 想引用时——把鼠标移过去，引用按钮出现，一键抓取。
 *
 * 触屏没有 hover，所以按钮在触屏设备上**常驻**——用
 * ``max-md:opacity-100`` 兜底。
 */
function QuoteButton({
  onQuote,
  label,
}: {
  onQuote: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        // 别让点击冒泡到外层的「跳转 + 提问」按钮上——否则引用
        // 会被当成「问这个概念」，自动发出去。
        event.stopPropagation();
        onQuote();
      }}
      title={`引用这一段并提问（${label}）`}
      aria-label={`引用${label}并提问`}
      className="seek-key-sm inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--seek-bean-soft)] hover:text-[var(--primary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)] group-hover:opacity-100 max-md:opacity-100"
    >
      <MessageSquareQuote size={11} strokeWidth={2.2} />
    </button>
  );
}

export function InteractiveTimeline({
  captions,
  nodes,
  guidedSegments,
  currentTime,
  mediaTitle,
  courseId,
  pageId,
  onSeek,
  className = "",
}: {
  captions: VideoCaption[];
  /** 知识切片——作者挑出来的重点时间点。 */
  nodes: InteractiveNode[];
  /**
   * **段落导读**——结构化的分段讲解。
   *
   * 这是「采集视频下方一片空白」的解药：即便视频没有逐字 CC 字幕，
   * 这里也有 5~8 段带时间戳的导读，可以点击跳转、可以划词提问。
   */
  guidedSegments?: GuidedSegment[];
  /** 当前播放位置（秒）。 */
  currentTime: number;
  mediaTitle?: string;
  courseId?: string;
  pageId?: string;
  /** 请求跳到某个时刻。 */
  onSeek?: (seconds: number) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  /**
   * 当前激活的标签页。
   *
   * 默认是「知识节点」——它是**密度最高、单位信息量最大**的一栏，
   * 也是「作者认为你该记住什么」的入口。段落导读和完整字幕是辅助
   * 查阅，需要时才翻。
   */
  const [tab, setTab] = useState<TabKey>("nodes");
  /**
   * 当前标签页的面板是否折叠。
   *
   * **手风琴**：点已激活的标签页 = 收起它的面板。再点一次 = 展开。
   *
   * 为什么要这个
   * ------------
   *
   * 上一版（以及更早的版本）视频下方是三座大山首尾相连：重点导读 +
   * 段落导读 + 逐字字幕。页面被拉到几千像素高，用户滚不到底，
   * 视频本身也就被顶到了屏幕外——**看视频这件事变成了滚动网页**。
   *
   * 现在收进 Tabs 并且**再套一层手风琴**：用户看完视频、想不起某句
   * 字幕是什么，一键就能把整个面板收起来，视频重新回到视口正中。
   */
  const [collapsed, setCollapsed] = useState(false);

  const sortedNodes = useMemo(
    () =>
      [...(nodes ?? [])]
        .filter((node) => node.keyword)
        .sort((a, b) => a.timestamp - b.timestamp),
    [nodes],
  );

  /**
   * 字幕行 ↔ 知识切片的挂载关系。
   *
   * 一个知识切片挂到**离它时间戳最近的那句字幕**上——这样胶囊就
   * 出现在"那一刻"的文字旁边，而不是悬空在别处。
   *
   * 容差取 6 秒：字幕的切分粒度通常在 2–8 秒，容差太小会让很多
   * 切片挂不上（变成孤儿），太大则会让切片挂到错误的句子上。
   */
  const nodeByCaptionIndex = useMemo(() => {
    const map = new Map<number, InteractiveNode[]>();
    for (const node of sortedNodes) {
      let best = -1;
      let bestGap = Number.POSITIVE_INFINITY;
      for (let i = 0; i < captions.length; i += 1) {
        const gap = Math.abs(captions[i].start - node.timestamp);
        if (gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      }
      if (best < 0 || bestGap > 6) continue;
      const list = map.get(best) ?? [];
      list.push(node);
      map.set(best, list);
    }
    return map;
  }, [captions, sortedNodes]);

  /** 当前播放到第几句。 */
  const activeIndex = useMemo(() => {
    if (captions.length === 0) return -1;
    let index = -1;
    for (let i = 0; i < captions.length; i += 1) {
      if (captions[i].start <= currentTime + 0.15) index = i;
      else break;
    }
    return index;
  }, [captions, currentTime]);

  /**
   * 当前句滚进视野。
   *
   * 只在**字幕面板激活时**滚——用户在看别的标签页时强制滚动会打断他。
   */
  useEffect(() => {
    if (tab !== "captions" || activeIndex < 0) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(
      `[data-timeline-index="${activeIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, tab]);

  /** 跳到某个时刻——只跳转，不打扰 AI。 */
  const seek = (seconds: number) => {
    onSeek?.(seconds);
  };

  /** 跳转 + 暂停 + 唤醒 AI。 */
  const askAbout = (
    term: string,
    context: string,
    seconds: number,
    hint = "",
  ) => {
    onSeek?.(seconds);
    activateConcept({
      term,
      context,
      courseId,
      pageId,
      timestamp: seconds,
      timestampLabel: formatTimestamp(seconds),
      mediaTitle: mediaTitle ?? "",
      // 引导问题——装配器写的深度追问指令。用户点「重点导读」胶囊
      // 时，助教拿到的是**一条自足的具体问题**，而不是
      // 「请解释一下这个概念」这种泛泛的委托。
      hint,
      source: "concept",
      autoSend: true,
    });
  };

  /**
   * 「引用这一行并提问」。
   *
   * 与 :func:`askAbout` 的分工：
   *
   * - ``askAbout`` ——「我要问这个概念」→ **自动发送**；
   * - ``quoteLine`` ——「我要引用这一段」→ **只填入**，让用户补一句
   *   自己的问题再发。
   *
   * 引用捕获三样东西：视频标题、时间戳、这一行的原文。三样合起来
   * 才能让 AI 知道「你在说哪一段的哪句话」。
   */
  const quoteLine = useCallback(
    (quote: string, seconds: number) => {
      emitTimestampQuote({
        quote,
        timestampLabel: formatTimestamp(seconds),
        mediaTitle: mediaTitle ?? "",
        courseId,
        pageId,
      });
    },
    [mediaTitle, courseId, pageId],
  );

  /** 段落导读——按时间排序。 */
  const segments = useMemo(
    () =>
      [...(guidedSegments ?? [])]
        .filter((segment) => segment.content)
        .sort((a, b) => a.timestamp - b.timestamp),
    [guidedSegments],
  );

  /** 当前播放到第几段导读。 */
  const activeSegmentIndex = useMemo(() => {
    if (segments.length === 0) return -1;
    let index = -1;
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i].timestamp <= currentTime + 0.5) index = i;
      else break;
    }
    return index;
  }, [segments, currentTime]);

  const hasContent =
    captions.length > 0 || sortedNodes.length > 0 || segments.length > 0;
  if (!hasContent) return null;

  /**
   * 标签页元数据。
   *
   * 只渲染**存在内容**的标签——三个标签全摆出来但有两个是空的，
   * 比少一个标签更让人困惑（用户点进去发现是空白）。
   */
  const tabs: Array<{ key: TabKey; label: string; icon: typeof Lightbulb; count: string }> = [];
  if (sortedNodes.length > 0) {
    tabs.push({ key: "nodes", label: "知识节点", icon: Lightbulb, count: String(sortedNodes.length) });
  }
  if (segments.length > 0) {
    tabs.push({ key: "segments", label: "段落导读", icon: BookOpen, count: `${segments.length} 段` });
  }
  if (captions.length > 0) {
    tabs.push({ key: "captions", label: "完整字幕", icon: Quote, count: `${captions.length} 段` });
  }

  // 当前标签页没有内容时（比如只有字幕，但用户之前停在「知识节点」），
  // 回落到第一个可用标签。
  const activeTab = tabs.find((item) => item.key === tab) ?? tabs[0];

  return (
    <section
      className={cn(
        // 纯白卡片 + 1px 实线外框——中间的"主舞台"里，视频与字幕
        // 容器共用同一张纸，视觉上是一个整体。
        "overflow-hidden rounded-xl border border-[var(--border)] bg-white",
        className,
      )}
      data-seek-timeline
    >
      {/* ── 标签头 ──
       *
       * 上一版这里是**三段垂直堆叠的长列表**：重点导读（胶囊条）+
       * 段落导读（5~8 段讲解）+ 逐字字幕（几十行）。三座大山首尾
       * 相连，页面被拉到几千像素高，用户滚不到底，也找不到重点。
       *
       * 现在收进 Tabs——**一次只渲染一栏**。面板高度被钉死在
       * ``max-h-60``（240px）以内，超出部分内部滚动。
       *
       * 手风琴
       * ------
       *
       * 点**已激活**的标签页 = 收起 / 展开它的面板。点**未激活**的
       * 标签页 = 切换过去（并自动展开）。
       *
       * 这是「视频优先」的必然要求：用户看完视频想记点什么，
       * 一键把导读收起来，视频立刻回到视口正中——不需要往上滚。
       */}
      <div
        role="tablist"
        aria-label="视频导读"
        className="flex items-center gap-1 border-b border-[var(--border)] px-2"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeTab.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`seek-tab-${item.key}`}
              aria-selected={isActive}
              aria-controls={`seek-panel-${item.key}`}
              aria-expanded={isActive && !collapsed}
              onClick={() => {
                if (isActive) {
                  // 点已激活的标签 = 折叠 / 展开手风琴。
                  setCollapsed((prev) => !prev);
                  return;
                }
                setTab(item.key);
                // 切到别的标签时自动展开——否则用户会以为那个
                // 标签也是空的。
                setCollapsed(false);
              }}
              className="seek-tab inline-flex items-center gap-1.5 px-2.5 py-2.5 text-[12.5px]"
              data-active={isActive ? "true" : "false"}
              title={isActive ? (collapsed ? "展开面板" : "收起面板") : undefined}
            >
              <Icon size={13} strokeWidth={2} />
              <span>{item.label}</span>
              <span className="text-[10.5px] tabular-nums opacity-60">
                {item.count}
              </span>
              {/* 折叠指示器——只有当前激活的标签有。 */}
              {isActive ? (
                <ChevronDown
                  size={12}
                  strokeWidth={2.2}
                  className={cn(
                    "ml-0.5 opacity-50 transition-transform duration-200",
                    collapsed && "-rotate-90",
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ── 面板：知识节点 ── */}
      {activeTab.key === "nodes" && (
        <div
          role="tabpanel"
          id="seek-panel-nodes"
          aria-labelledby="seek-tab-nodes"
          className={cn(
            "overflow-y-auto px-2.5 py-2 transition-[max-height] duration-200",
            collapsed ? "max-h-0 py-0" : "max-h-60",
          )}
        >
          {sortedNodes.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-[var(--muted-foreground)]">
              这段视频没有标注知识节点。
            </p>
          ) : (
            <ul className="space-y-1">
              {sortedNodes.map((node) => {
                const Icon = NODE_ICON[node.type] ?? Lightbulb;
                return (
                  <li key={`${node.timestamp}-${node.keyword}`}>
                    <button
                      type="button"
                      onClick={() =>
                        askAbout(
                          node.keyword,
                          node.context ?? node.hint ?? "",
                          node.timestamp,
                          node.prompt ?? node.hint ?? "",
                        )
                      }
                      title={`${formatTimestamp(node.timestamp)} · ${
                        node.prompt || node.context || node.hint || node.keyword
                      }`}
                      className="seek-key-sm group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)]"
                    >
                      {/* 引用按钮——悬停才显形。 */}
                      <QuoteButton
                        onQuote={() =>
                          quoteLine(
                            node.context || node.hint || node.keyword,
                            node.timestamp,
                          )
                        }
                        label={node.keyword}
                      />
                      {/* 时间戳：只跳转。 */}
                      <span className="mt-px shrink-0 rounded bg-[var(--seek-bean-soft)] px-1.5 py-px font-mono text-[10.5px] tabular-nums text-[var(--primary)]">
                        {formatTimestamp(node.timestamp)}
                      </span>
                      <Icon size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-snug text-[var(--foreground)]">
                          {node.keyword}
                        </span>
                        {(node.context || node.hint) && (
                          <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-[1.7] text-[var(--muted-foreground)]">
                            {node.context || node.hint}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── 面板：段落导读 ──
       *
       * 段落导读是**装配器预先生成**的结构化讲解：5~8 段，每段带
       * 真实时间锚点，用户点时间戳能跳、点正文能提问。
       *
       * 它的粒度比字幕粗（几分钟一段），但信息密度反而更高——字幕给
       * 的是「讲师说了什么」，导读给的是「这一段在讲什么」。
       */}
      {activeTab.key === "segments" && (
        <div
          role="tabpanel"
          id="seek-panel-segments"
          aria-labelledby="seek-tab-segments"
          className={cn(
            "overflow-y-auto px-1.5 py-1 transition-[max-height] duration-200",
            collapsed ? "max-h-0 py-0" : "max-h-60",
          )}
        >
          {segments.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-[var(--muted-foreground)]">
              这段视频没有段落导读。
            </p>
          ) : (
            <ol>
              {segments.map((segment, index) => {
                const isActive = index === activeSegmentIndex;
                return (
                  <li
                    key={`${segment.timestamp}-${index}`}
                    className={cn(
                      "rounded-md px-1.5 py-1 transition-colors",
                      isActive
                        ? "bg-[var(--seek-bean-soft)]"
                        : "hover:bg-[var(--muted)]",
                    )}
                  >
                    <div className="group flex items-start gap-2">
                      {/* 引用按钮——悬停才显形。 */}
                      <QuoteButton
                        onQuote={() =>
                          quoteLine(
                            segment.content ||
                              segment.title ||
                              segment.anchor_title ||
                              "",
                            segment.timestamp,
                          )
                        }
                        label={segment.title || segment.anchor_title || "这一段"}
                      />
                      {/* 时间戳：只跳转。 */}
                      <button
                        type="button"
                        onClick={() => seek(segment.timestamp)}
                        title="跳到这一段"
                        className={cn(
                          "seek-key-sm mt-[1px] shrink-0 rounded px-1 py-px font-mono text-[11px] tabular-nums",
                          isActive
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--muted)] text-[var(--primary)] hover:bg-[var(--seek-bean-soft-hover)]",
                        )}
                      >
                        {formatTimestamp(segment.timestamp)}
                      </button>
                      {/* 段落正文：跳转 + 提问。 */}
                      <button
                        type="button"
                        onClick={() =>
                          askAbout(
                            segment.title || segment.anchor_title || "这一段",
                            segment.content,
                            segment.timestamp,
                            `请结合《${mediaTitle ?? "这段视频"}》${formatTimestamp(
                              segment.timestamp,
                            )} 处的「${segment.title || segment.anchor_title || "这一段"}」，讲透这一段的核心逻辑，并指出我理解它时最容易出错的地方。`,
                          )
                        }
                        title="跳到这一段并让 AI 讲讲"
                        className="min-w-0 flex-1 text-left"
                      >
                        <span
                          className={cn(
                            "block text-[13px] font-medium leading-snug",
                            isActive
                              ? "text-[var(--foreground)]"
                              : "text-[var(--foreground)]",
                          )}
                        >
                          {segment.title || segment.anchor_title || "这一段"}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-[1.7] font-normal text-[var(--muted-foreground)]">
                          {segment.content}
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {/* ── 面板：完整字幕 ── */}
      {activeTab.key === "captions" && (
        <div
          role="tabpanel"
          id="seek-panel-captions"
          aria-labelledby="seek-tab-captions"
          className={cn(
            "overflow-y-auto px-1.5 py-1 transition-[max-height] duration-200",
            collapsed ? "max-h-0 py-0" : "max-h-60",
          )}
        >
          <ol ref={listRef}>
            {captions.map((caption, index) => {
              const isActive = index === activeIndex;
              const attached = nodeByCaptionIndex.get(index) ?? [];
              return (
                <li
                  key={`${caption.start}-${index}`}
                  data-timeline-index={index}
                  className={cn(
                    "rounded-md px-1.5 py-1 transition-colors",
                    isActive ? "bg-[var(--seek-bean-soft)]" : "hover:bg-[var(--muted)]",
                  )}
                >
                  <div className="group flex items-start gap-2">
                    {/* 引用按钮——悬停才显形。 */}
                    <QuoteButton
                      onQuote={() => quoteLine(caption.text, caption.start)}
                      label={formatTimestamp(caption.start)}
                    />
                    {/* 时间戳：只跳转。 */}
                    <button
                      type="button"
                      onClick={() => seek(caption.start)}
                      title="跳到这一句"
                      className={cn(
                        "seek-key-sm mt-[1px] shrink-0 rounded px-1 py-px font-mono text-[11px] tabular-nums",
                        isActive
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--muted)] text-[var(--primary)] hover:bg-[var(--seek-bean-soft-hover)]",
                      )}
                    >
                      {formatTimestamp(caption.start)}
                    </button>

                    {/* 字幕正文：跳转 + 提问。 */}
                    <button
                      type="button"
                      onClick={() =>
                        askAbout(caption.text.slice(0, 40), caption.text, caption.start)
                      }
                      title="跳到这一句并让 AI 讲讲"
                      className={cn(
                        "min-w-0 flex-1 text-left text-[15px] leading-[1.75]",
                        isActive
                          ? "font-normal text-[var(--foreground)]"
                          : "font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                      )}
                    >
                      {caption.text}
                    </button>
                  </div>

                  {/* 内嵌的知识胶囊——长在它该在的那句话旁边。 */}
                  {attached.length > 0 && (
                    <div className="mb-1 ml-[68px] mt-1 flex flex-wrap gap-1.5">
                      {attached.map((node) => {
                        const Icon = NODE_ICON[node.type] ?? Lightbulb;
                        return (
                          <button
                            key={`${node.timestamp}-${node.keyword}`}
                            type="button"
                            onClick={() =>
                              askAbout(
                                node.keyword,
                                node.context ?? node.hint ?? "",
                                node.timestamp,
                                node.prompt ?? node.hint ?? "",
                              )
                            }
                            title={node.prompt || node.context || node.hint || node.keyword}
                            className="seek-key-sm inline-flex items-center gap-1 rounded-full bg-[var(--seek-bean-soft)] px-2 py-0.5 text-[12px] text-[var(--primary)]"
                          >
                            <Icon size={11} strokeWidth={2.1} className="shrink-0" />
                            <span className="font-mono text-[10.5px] tabular-nums opacity-75">
                              {formatTimestamp(node.timestamp)}
                            </span>
                            <span>{node.keyword}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
