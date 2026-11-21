"use client";

import { useMemo } from "react";
import { Compass, Landmark, Leaf, Sparkles } from "lucide-react";
import type { GlobalHubResource } from "@/lib/global-hub-api";
import { cn } from "@/lib/cn";

/**
 * 「中华文脉与全球视野交融」专题
 * ================================
 *
 * 一个**温润克制**的专题编排——把东方哲学、华语科技/经济公开课与
 * 常春藤课程编织在同一条时间轴上。
 *
 * 为什么需要它
 * ------------
 *
 * 平台是面向**全球华人**的自学枢纽。四大学科分类是「按学科」组织的
 * （计算机 / 哲学 / 经济学 / 自然科学），它回答的是「这门课属于什么」。
 *
 * 但海外华人真正在找的，往往不是「学科」，而是**一条线索**：
 *
 * * 「我想理解中国传统思想，但最好是用现代人能接受的方式讲」；
 * * 「我想知道华人科技公司在做什么，同时看看硅谷在做什么」；
 * * 「我先学一门哈佛的课打底，再回来看中国的经济数据怎么解释」。
 *
 * 这些需求在四大学科分类里是**断开的**。这个专题把它们接上。
 *
 * 「润物细无声」
 * ------------
 *
 * 它不是第四个分类，而是**横切在分类之上的一个视角**。用户不需要
 * 「切换到另一个目录」——他还在同一个公开课大厅里，只是换了一种
 * 看法。所以它以**标签**的形态出现，而不是一个并列的大分区。
 *
 * 编排逻辑
 * --------
 *
 * 每个专题有三条**线**，按「东方 → 西方 → 交汇」的顺序：
 *
 * * ``chinese``——华语世界的课程（中文讲授，讲中国/华人的问题）；
 * * ``global``——常春藤与西方名校的课程；
 * * ``fusion``——真正**跨文化**的课（讲东西方对比、讲全球性议题）。
 *
 * 三条线交叉的课程会同时出现在多条线里——因为它本来就横跨两边。
 */

/** 一个专题。 */
export interface Topic {
  id: string;
  /** 专题名（中文）。 */
  title: string;
  /** 一句话说明。 */
  blurb: string;
  icon: typeof Compass;
  /** 匹配规则——返回 true 表示这条资源属于该专题。 */
  match: (resource: GlobalHubResource) => boolean;
}

/** 关键词规则——命中任意一个即算相关。 */
function hasAny(
  resource: GlobalHubResource,
  keywords: string[],
  extra?: (resource: GlobalHubResource) => boolean,
): boolean {
  const haystack = [
    resource.title,
    resource.source,
    resource.academic_intro ?? "",
    ...(resource.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
    return true;
  }
  return extra ? extra(resource) : false;
}

/**
 * 华语线索——中文讲授、讲华人的议题。
 *
 * 判据是「**中文字符出现在标题里**」，这是一个很可靠的信号：
 * 纯英文标题的课几乎不会是华语课，反之亦然。
 */
function isChineseLanguage(resource: GlobalHubResource): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u4e00-\u9fff]/.test(resource.title);
}

/** 常春藤 / 顶尖名校。 */
const IVY = [
  "哈佛",
  "耶鲁",
  "斯坦福",
  "普林斯顿",
  "哥伦比亚",
  "剑桥",
  "牛津",
  "麻省理工",
  "mit ",
  "harvard",
  "yale",
  "stanford",
  "princeton",
  "columbia",
  "cambridge",
  "oxford",
];

/** 东方哲学 / 中国思想。 */
const EASTERN_PHILOSOPHY = [
  "哲学",
  "儒",
  "道",
  "佛",
  "禅",
  "宋明理学",
  "先秦",
  "中国哲学",
  "东方哲学",
  "哲学导论",
  "存在主义",
  "伦理学",
  "道德",
  "philosophy",
  "ethics",
];

/** 华语科技 / 经济。 */
const CHINESE_TECH_ECON = [
  "中国",
  "中华",
  "华人",
  "大陆",
  "清华",
  "北大",
  "复旦",
  "上海交通大学",
  "浙江",
  "李宏毅",
  "机器学习",
  "人工智能",
  "经济",
  "金融",
  "经济学",
  "创业",
  "产业",
];

/** 全球性 / 跨文化议题。 */
const CROSS_CULTURAL = [
  "全球",
  "世界",
  "国际",
  "跨",
  "比较",
  "文明",
  "全球化",
  "移民",
  "全球化",
  "global",
  "world",
  "culture",
  "cross",
];

/** 全部专题。 */
export const TOPICS: Topic[] = [
  {
    id: "east_west",
    title: "中华文脉与全球视野交融",
    blurb: "东方哲思与常春藤课堂并行阅读，在同一条时间轴上互相照见。",
    icon: Compass,
    match: (resource) =>
      isChineseLanguage(resource) &&
      (hasAny(resource, EASTERN_PHILOSOPHY) ||
        hasAny(resource, CHINESE_TECH_ECON) ||
        hasAny(resource, IVY) ||
        hasAny(resource, CROSS_CULTURAL)),
  },
  {
    id: "chinese_thought",
    title: "华语思想原典",
    blurb: "用现代人能接受的方式，重读东方的思想谱系。",
    icon: Leaf,
    match: (resource) =>
      isChineseLanguage(resource) && hasAny(resource, EASTERN_PHILOSOPHY),
  },
  {
    id: "chinese_modern",
    title: "华语科技与经济现场",
    blurb: "华人世界的技术演进与经济实践——第一手的观察。",
    icon: Sparkles,
    match: (resource) =>
      isChineseLanguage(resource) && hasAny(resource, CHINESE_TECH_ECON),
  },
  {
    id: "global_elite",
    title: "常春藤的第一课堂",
    blurb: "世界顶尖学府的通识底座——西方经典的原始形态。",
    icon: Landmark,
    match: (resource) => hasAny(resource, IVY),
  },
  {
    id: "cross_cultural",
    title: "跨文明议题",
    blurb: "全球治理、文明比较与跨文化心理——把两边放在一张桌上。",
    icon: Compass,
    match: (resource) => hasAny(resource, CROSS_CULTURAL),
  },
];

/**
 * 专题标签栏
 * ==========
 *
 * 一排可点的标签——第一个是「全部」，其余是专题。
 *
 * 它渲染在学科分类**上方**，作为「视角」；学科分类是「范围」。
 * 两个维度是**正交**的：选了专题之后仍然可以再选学科。
 */
export function TopicFilter({
  resources,
  activeTopic,
  onChange,
  className = "",
}: {
  /** 当前可见的资源（用于统计每个专题有多少门）。 */
  resources: GlobalHubResource[];
  /** 当前选中的专题 id；``all`` 表示不过滤。 */
  activeTopic: string;
  /** 切换专题。 */
  onChange: (topicId: string) => void;
  className?: string;
}) {
  /** 每个专题命中的数量。 */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const topic of TOPICS) {
      map.set(topic.id, resources.filter((resource) => topic.match(resource)).length);
    }
    return map;
  }, [resources]);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-0.5 text-[11px] text-[var(--muted-foreground)]">
        专题
      </span>
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={activeTopic === "all"}
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
          activeTopic === "all"
            ? "border-[var(--primary)] bg-[var(--primary)] text-white"
            : "border-[var(--border)] bg-white text-[var(--muted-foreground)] hover:border-[var(--primary)]/35 hover:text-[var(--foreground)]",
        )}
      >
        全部
        <span className="ml-1 tabular-nums opacity-60">{resources.length}</span>
      </button>

      {TOPICS.map((topic) => {
        const count = counts.get(topic.id) ?? 0;
        const active = activeTopic === topic.id;
        const Icon = topic.icon;
        return (
          <button
            key={topic.id}
            type="button"
            onClick={() => onChange(active ? "all" : topic.id)}
            aria-pressed={active}
            title={topic.blurb}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] bg-white text-[var(--muted-foreground)] hover:border-[var(--primary)]/35 hover:text-[var(--foreground)]",
              // 没有命中的专题**变灰**——它不是不可点（点了会得到空
              // 列表，那也是一种诚实），但不该跟有货的专题一样醒目。
              !active && count === 0 && "opacity-45",
            )}
          >
            <Icon size={10} strokeWidth={2.2} />
            {topic.title}
            <span className="tabular-nums opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 温润克制的导语
 * ==============
 *
 * 一段**不喧哗**的开场白。
 *
 * 为什么要有它
 * ------------
 *
 * 公开课大厅的第一屏，用户面对的是「136 讲公开课」这样一串数字。
 * 数字是冷的——它不解释**为什么**要在深夜看一节 MIT 线性代数。
 *
 * 一段导语能给出**框架**：这里不只是一堆视频，是一个把东方的东西
 * 和西方的东西放在一起看的地方。
 *
 * 为什么必须克制
 * --------------
 *
 * 写得太满（口号、排比、感叹号）就变成了营销。写得太虚（"欢迎来到"
 * "开启旅程"）就是废话。所以这段话只做一件事：**说清楚这里有什么，
 * 以及它为什么值得来**。两句，不多。
 */
export function TopicIntro({ className = "" }: { className?: string }) {
  return (
    <div className={cn("", className)}>
      <p className="max-w-3xl text-[13px] leading-[1.85] text-[var(--muted-foreground)]">
        这里收着
        <span className="mx-0.5 font-medium text-[var(--foreground)]">
          世界各地上百讲顶尖公开课
        </span>
        ——从耶鲁的哲学导论到李宏毅的机器学习，从哈佛的「公正」到可汗的
        宏观经济学。它们被装配成可逐段导读、可随堂检测、可与助教对谈的
        自学材料。
      </p>
      <p className="mt-1.5 max-w-3xl text-[13px] leading-[1.85] text-[var(--muted-foreground)]">
        若你更想沿着
        <span className="mx-0.5 font-medium text-[var(--foreground)]">
          「中华文脉与全球视野交融」
        </span>
        这条线读——东方哲思与常春藤课堂并置，互为参照——可以直接点上方
        的专题标签。
      </p>
    </div>
  );
}
