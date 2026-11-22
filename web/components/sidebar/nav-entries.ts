import {
  CalendarCheck,
  GraduationCap,
  House,
  MessageSquareText,
  Settings,
  TrendingUp,
  Wand2,
  type LucideIcon,
} from "lucide-react";

/**
 * 一条侧边栏导航项。
 *
 * 同一个文件同时描述图标、路由与工具提示文案，添加一项即让它出现在
 * 所有人的侧边栏。
 */
export interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  tooltipKey?: string;
  /** 主要导航区（灰底分隔线之前）。 */
  primary?: boolean;
  /**
   * 这是一项**开发者 / 运维入口**。
   *
   * 它们在阅读时是干扰：用户正在读一本书，视野里却杵着「设置」
   * 「能力库」两个跟内容毫无关系的按钮。所以它们默认**折叠**起来，
   * 只有用户主动展开才看得到。
   */
  developer?: boolean;
}

/**
 * 主导航 —— **只有 4 项**。
 *
 * 旧版有 5 项，而且「K12 选课」与「课程」**指向同一件事**：
 * 用户要按年级找课，先进「K12 选课」；用户要按主题找课，进「课程」。
 * 两个入口分流了同一种心智，用户每次都得先判断「我该点哪个」。
 *
 * 现在合并成唯一的「课程」——它默认聚焦用户所选年级（那里就是
 * K12 年级同步系列），同时保留「查看全部年级」的下拉项。
 * 主题型 / 通识型课程仍然能从这里进。
 */
export const PRIMARY_NAV: NavEntry[] = [
  {
    href: "/",
    label: "首页",
    icon: House,
    tooltipKey: "精选专题导览",
    primary: true,
  },
  {
    href: "/courses",
    label: "课程",
    icon: GraduationCap,
    tooltipKey: "1–12 年级语文 · 数学同步系列",
    primary: true,
  },
  {
    href: "/plan",
    label: "计划",
    icon: CalendarCheck,
    tooltipKey: "学习计划与进度",
    primary: true,
  },
  {
    href: "/learning/books",
    label: "学情中心",
    icon: TrendingUp,
    tooltipKey: "课程进度与掌握度追踪",
    primary: true,
  },
];

/**
 * 次级导航——用户可能会用到，但不是「阅读」的一部分。
 */
export const SECONDARY_NAV: NavEntry[] = [
  {
    href: "/ask",
    label: "提问",
    icon: MessageSquareText,
    tooltipKey: "自由提问与导入教材",
  },
];

/**
 * 开发者 / 运维入口。
 *
 * 「设置」（模型密钥、运行状态）与「能力库」（skill 的增删改查）
 * 在测试阶段是刚需，在**阅读**时纯属噪声。所以它们被收进一个
 * 折叠区，默认关闭。
 */
export const DEVELOPER_NAV: NavEntry[] = [
  {
    href: "/space/skills",
    label: "能力库",
    icon: Wand2,
    tooltipKey: "调整 AI 的教学风格与回答习惯",
    developer: true,
  },
  {
    href: "/settings",
    label: "设置",
    icon: Settings,
    tooltipKey: "运行状态与配置",
    developer: true,
  },
];

export const ALL_NAV: NavEntry[] = [
  ...PRIMARY_NAV,
  ...SECONDARY_NAV,
  ...DEVELOPER_NAV,
];
