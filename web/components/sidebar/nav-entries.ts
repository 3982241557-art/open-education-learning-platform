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

/** 工作区功能，按使用频次排列。 */
export const PRIMARY_NAV: NavEntry[] = [
  {
    href: "/",
    label: "首页",
    icon: House,
    tooltipKey: "精选专题导览",
    primary: true,
  },
  {
    href: "/learning",
    label: "课程",
    icon: GraduationCap,
    tooltipKey: "精选公开课与系统课程",
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
