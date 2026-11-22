import {
  CalendarCheck,
  GraduationCap,
  House,
  TrendingUp,
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
 * 次级导航——**已清空**。
 *
 * 旧版这里有「提问」与「开发者入口（能力库 / 设置）」。现在它们
 * 全部从侧边栏移除：
 *
 * - **开发者入口**（能力库 / 设置）——内部运维与调试项。普通访客
 *   看到只会困惑「我要调什么？」。路由本身保留（``/settings``、
 *   ``/space/skills`` 仍可直接访问），只是不再有可见入口。
 * - **提问**——AI 助教已经在每一集的右侧常驻，不需要再占一个侧边栏
 *   位置。侧边栏只保留「阅读路径」上的四件事。
 *
 * 「开源资源审核」早已迁到 ``/admin/review``，同样不设入口。
 */
export const SECONDARY_NAV: NavEntry[] = [];

/**
 * 开发者 / 运维入口——**已从导航中彻底移除**。
 *
 * 保留这个导出是为了让历史引用不会崩（``ALL_NAV`` 的类型不变），
 * 但**不再**被任何导航组件渲染。
 */
export const DEVELOPER_NAV: NavEntry[] = [];

export const ALL_NAV: NavEntry[] = [...PRIMARY_NAV, ...SECONDARY_NAV];
