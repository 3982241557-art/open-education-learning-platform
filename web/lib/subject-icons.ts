/**
 * 课程 / 资源的矢量图标
 * ========================
 *
 * 之前卡片左上角是一个**汉字**——「文」「理」「术」「世」。
 *
 * 那个做法有三个问题：
 *
 * 1. **信息量太低**。「文」既可能是文学，也可能是文科，读者看不出
 *    这一门课到底是讲诗歌还是讲历史；
 * 2. **不专业**。单字方块是后台系统的标志性视觉——它让整个界面
 *    看起来像一张后台管理表格，而不是一份课程目录；
 * 3. **不可缩放**。文字在小尺寸下会糊成一团，而图标不会。
 *
 * 这里换成 lucide 的**矢量图标**，并按「学科」而不是「支柱」来选：
 * 一个讲哲学的课和一个讲法律的课，同属人文支柱，但应该有不同的图标。
 *
 * 选择规则
 * --------
 *
 * 优先按课程的 ``tags`` 判定学科（标签最贴近内容），其次按
 * ``pillar`` 兜底（支柱是粗粒度的分类），最后回落到书图标。
 *
 * 匹配顺序是**从具体到宽泛**——「微观经济学」先命中图表图标，
 * 不会先被笼统的「社会与文明」截胡。
 */

import {
  Atom,
  Binary,
  BookOpen,
  Brain,
  Calculator,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Library,
  LineChart,
  Music,
  Palette,
  Play,
  Scale,
  ScrollText,
  Telescope,
  type LucideIcon,
} from "lucide-react";

/** 学科 → 图标。 */
const SUBJECT_ICONS: Array<[string[], LucideIcon]> = [
  // ── 具体学科（从窄到宽） ──
  [["经济", "经济学", "机会成本", "比较优势"], LineChart],
  [["数学", "线性代数", "微积分", "统计"], Calculator],
  [["计算机", "编程", "算法", "代码", "CS50", "人工智能", "机器学习", "AI"], Binary],
  [["哲学", "存在主义", "尼采", "加缪", "萨特", "形而上学"], ScrollText],
  [["心理", "认知", "脑科学", "记忆", "情绪"], Brain],
  [["物理", "化学", "生物", "科学", "自然"], FlaskConical],
  [["天文", "宇宙", "量子"], Telescope],
  [["历史", "中国古代", "国史", "考古"], Library],
  [["法律", "伦理", "公正", "政治"], Scale],
  [["文学", "诗词", "散文", "古典文学"], Languages],
  [["语言", "英语", "外语"], Languages],
  [["经济", "金融", "投资"], LineChart],
  [["艺术", "绘画", "音乐", "设计"], Palette],
  [["音乐", "交响乐"], Music],
  [["国际", "全球", "文明"], Globe],
  [["政治", "公共"], Landmark],
];

/** 支柱 → 图标（粗粒度兜底）。 */
const PILLAR_ICONS: Record<string, LucideIcon> = {
  humanities: ScrollText,
  science: Atom,
  technology: Binary,
  society: Landmark,
};

/** 一门课 / 一条资源该用哪个图标。 */
export function subjectIcon(
  tags: string[] | undefined,
  pillar?: string,
): LucideIcon {
  const needle = (tags ?? []).map((tag) => tag.toLowerCase());
  if (needle.length > 0) {
    for (const [keywords, Icon] of SUBJECT_ICONS) {
      for (const keyword of keywords) {
        if (needle.some((tag) => tag.includes(keyword.toLowerCase()))) {
          return Icon;
        }
      }
    }
  }
  if (pillar && PILLAR_ICONS[pillar]) return PILLAR_ICONS[pillar];
  return BookOpen;
}

/** 视频类资源的图标——播放键。 */
export const MEDIA_ICON: LucideIcon = Play;

export {
  Atom,
  Binary,
  BookOpen,
  Brain,
  Calculator,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Library,
  LineChart,
  Music,
  Palette,
  Play,
  Scale,
  ScrollText,
  Telescope,
  type LucideIcon,
};
