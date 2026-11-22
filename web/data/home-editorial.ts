/**
 * 首页「精选专题导览」文案与配图
 * ==================================
 *
 * **所有**首页文案与图片路径都抽离到这里。
 *
 * 为什么单独抽
 * ------------
 *
 * 首页是全站最常被改的地方——换一句导语、换一张配图、调一下卖点顺序，
 * 都是日常操作。如果这些内容散落在 JSX 里，每次改动都要在组件树里
 * 翻找，而且改文案时会误伤布局。
 *
 * 抽出来之后：
 *
 * * 改文案 = 改这一个文件，**不碰任何组件**；
 * * 换图片 = 换 ``image`` 字段的路径，布局跟着图片比例自适应；
 * * 加板块 = 加一个对象，渲染是 ``map`` 出来的，不需要写新组件。
 *
 * 图片路径约定
 * ------------
 *
 * 图片放在 ``public/images/home/`` 下，这里只写**相对于站点根**的
 * 路径（例如 ``/images/home/hero.jpg``）。
 *
 * 如果图片**还没准备好**，把 ``image`` 留成空字符串——组件会渲染一块
 * 带渐变的**占位块**（用 ``accent`` 指定的颜色）。这样骨架是完整的，
 * 不会因为缺图而破版，图片到位后填上路径即可。
 */

/** 一张配图。 */
export interface EditorialImage {
  /** 站点根相对路径。留空则渲染占位块。 */
  src: string;
  /** 占位块的渐变色——图片缺失时用它撑住版面。 */
  accent: string;
  /** 图片的替代文字（无障碍用）。 */
  alt: string;
}

/** Hero 首屏。 */
export interface HeroConfig {
  /** 主标题。 */
  title: string;
  /** 标题下方的定位副标。 */
  subtitle: string;
  /** 温润导语——一段话，2~3 句。 */
  lead: string;
  /** 主行动按钮。 */
  primaryCta: { label: string; href: string };
  /** 次行动按钮。 */
  secondaryCta?: { label: string; href: string };
  /** 背景图。 */
  image: EditorialImage;
  /** 首屏右下角的几个数字——用来建立可信度。 */
  stats: Array<{ value: string; label: string }>;
}

/** 「我们是谁」板块。 */
export interface SectionConfig {
  id: string;
  /** 板块序号——显示成「01 / 我们是谁」。 */
  index: string;
  /** 小标题。 */
  eyebrow: string;
  /** 大标题。 */
  title: string;
  /** 正文段落。 */
  body: string[];
  /** 图片。 */
  image: EditorialImage;
  /** 配图上的浮动标签——比如「北美」「欧洲」。 */
  imageTags?: string[];
  /** 这一节的补充要点——渲染成小卡片。 */
  points?: Array<{ title: string; detail: string }>;
}

/** 核心优势四宫格。 */
export interface AdvantageConfig {
  id: string;
  title: string;
  body: string;
  /** 图标键。 */
  icon: "timeline" | "skill" | "certificate" | "globe";
  /** 卡片配图（可选）。 */
  image?: EditorialImage;
}

/** 快速上手三步。 */
export interface StepConfig {
  id: string;
  /** 第几步。 */
  step: string;
  title: string;
  body: string;
  /** 极简示意图的配色。 */
  accent: string;
}

/** 首页全量配置。 */
export const HOME_EDITORIAL: {
  hero: HeroConfig;
  who: SectionConfig;
  what: SectionConfig;
  advantages: AdvantageConfig[];
  steps: StepConfig[];
} = {
  /* ── Hero 首屏 ─────────────────────────────────────────────────── */
  hero: {
    title: "开放教育学习平台",
    subtitle: "深圳后海总部 · Open Education Learning Platform · Houhai HQ, Shenzhen",
    lead:
      "我们把国内 K12 语文与数学的教材同步课，装进了一套可以边看边问、课前诊断、随堂检测、达标拿证的自学系统里。" +
      "无论你身在北美、欧洲、东南亚还是澳新——按孩子的年级和年龄直接对号入座，剩下的就是学本身。",
    primaryCta: { label: "按年级选课", href: "/k12" },
    secondaryCta: { label: "看看公开课大厅", href: "/hub" },
    image: {
      src: "/images/home/hero.jpg",
      accent: "from-[#1e3a8a] via-[#0f172a] to-[#1d4ed8]",
      alt: "深圳后海总部与全球学习者",
    },
    stats: [
      { value: "24", label: "套年级同步系列" },
      { value: "1519", label: "个真实课时" },
      { value: "12", label: "个年级全覆盖" },
      { value: "2", label: "大核心学科" },
    ],
  },

  /* ── 板块 1 · 我们是谁 ─────────────────────────────────────────── */
  who: {
    id: "who",
    index: "01",
    eyebrow: "我们是谁",
    title: "从深圳后海出发，连接每一个想读书的中国人",
    body: [
      "后海是深圳的科技与创意聚集地——一批做硬件、做软件、做投资的人在这里长大，也在这里学会了「把一件难事做成」的做事方式。开放教育学习平台总部设在这里，是因为它符合我们对自己的要求：把复杂的东西做简单，把承诺兑现。",
      "而我们服务的对象，是散布在全球的华人。在多伦多、在悉尼、在新加坡、在巴黎——他们当中有人想读名校的公开课，有人想补一门没修完的课，有人只是想保持一种「还在学习」的状态。距离是真实存在的，语言也是。",
      "所以我们做了一件事：把门槛拆掉。简中、繁中、英文三种界面按需切换，按所在大区自动适配线路与习惯；课程被切分成可逐段消化、可随时提问、可量化掌握的节点。学习的阻力应该来自内容本身，而不是来自工具。",
    ],
    image: {
      src: "/images/home/who.jpg",
      accent: "from-[#0f172a] via-[#1e3a8a] to-[#334155]",
      alt: "连接全球华人的学习网络",
    },
    imageTags: ["北美", "欧洲", "亚太", "澳新", "港澳台"],
    points: [
      {
        title: "终身学习的栖息地",
        detail: "不是一门课的播放器，是一个可以停下来的地方。",
      },
      {
        title: "不牺牲严肃性",
        detail: "只收录名校与高质量开源体系，内容经得起核对。",
      },
      {
        title: "为中文读者而造",
        detail: "界面、导读、讲解提示，都按中文学习习惯打磨。",
      },
    ],
  },

  /* ── 板块 2 · 我们在做什么 ─────────────────────────────────────── */
  what: {
    id: "what",
    index: "02",
    eyebrow: "我们在做什么",
    title: "把散落世界的优质公开课，收拢成一条可完成的路",
    body: [
      "全球名校的公开课从来不缺——缺的是一条**能走完的路**。视频在 YouTube 上，字幕是英文的，讲义是一堆 PDF，进度只存在于播放器的进度条里。你能看，但很难说自己在「学」。",
      "开放教育学习平台做的是中间那一层：把公开课、开源学位路径与教材，装进同一个工作台里，配上时间轴上的知识节点、可暂停提问的 AI 助教、随堂自测与可验证的结业证书。",
      "于是「看视频」变成了「完成一门课」——你走过的每一步都留下痕迹，最后得到一张能拿出去的证书。",
    ],
    image: {
      src: "/images/home/what.jpg",
      accent: "from-[#1d4ed8] via-[#0f172a] to-[#1e293b]",
      alt: "公开课与 AI 伴学工作台",
    },
    imageTags: ["全球名校公开课", "开源学位路径", "AI 伴学工作台"],
    points: [
      {
        title: "聚合 · 全球顶尖名校公开课",
        detail: "哈佛、耶鲁、MIT、斯坦福……按学科与难度编排。",
      },
      {
        title: "接入 · 开源学历与文凭路径",
        detail: "OSSU 一类的完整学位课程体系，逐条映射成学习阶梯。",
      },
      {
        title: "伴学 · 可随时打断的 AI 助教",
        detail: "看到关键点就能问，答案贴着当前视频知识点给。",
      },
      {
        title: "沉淀 · 可验证的结业证书",
        detail: "编号、内容指纹、签章——成长可回溯，也可分享。",
      },
    ],
  },

  /* ── 板块 3 · 核心优势（四宫格） ───────────────────────────────── */
  advantages: [
    {
      id: "timeline",
      title: "边看边问的时间轴交互",
      body:
        "视频下方不是一串标题，而是一条被标注过的时间轴。关键点会浮成提示，点它——视频自动暂停，问题直接送到右侧助教那里。不用来回拖进度条找位置。",
      icon: "timeline",
      image: {
        src: "/images/home/adv-timeline.jpg",
        accent: "from-[#1d4ed8] to-[#0f172a]",
        alt: "时间轴上的知识节点与提问气泡",
      },
    },
    {
      id: "skill",
      title: "可汗式技能阶梯与随堂掌握度",
      body:
        "每节课被切成若干技能节点，组成「入门启蒙 → 核心精修 → 综合实战 → 学位进阶」四级阶梯。每个节点挂一组自测题，正确率过 80% 就点亮为「已掌握」，并解锁下一阶。",
      icon: "skill",
      image: {
        src: "/images/home/adv-skill.jpg",
        accent: "from-[#0f172a] via-[#1e3a8a] to-[#1d4ed8]",
        alt: "技能树与掌握度进度条",
      },
    },
    {
      id: "certificate",
      title: "Coursera 式结业证书与成长档案",
      body:
        "覆盖率、检测正确率、提问次数都达标，就自动解锁「开放教育学习平台结业证书」。深蓝金边排版、唯一编号、内容指纹——可预览、可下载、可分享，也能验证真伪。",
      icon: "certificate",
      image: {
        src: "/images/home/adv-cert.jpg",
        accent: "from-[#0f172a] to-[#1e3a8a]",
        alt: "深蓝金边的结业证书",
      },
    },
    {
      id: "globe",
      title: "简繁英三语与多区网络无感适配",
      body:
        "顶栏右上角一键切换简中 / 繁中 / EN，地区选择器按北美、欧洲、亚太、澳新、港澳台自动适配线路与书写习惯。切换之后，界面、日期格式、默认源全都跟着变。",
      icon: "globe",
      image: {
        src: "/images/home/adv-globe.jpg",
        accent: "from-[#1e3a8a] via-[#0f172a] to-[#475569]",
        alt: "多语言与多地区适配",
      },
    },
  ],

  /* ── 板块 4 · 三步上手 ─────────────────────────────────────────── */
  steps: [
    {
      id: "pick",
      step: "01",
      title: "选课",
      body:
        "在公开课大厅按学科或专题挑一门。点开就能直接播放，不需要注册，也不需要等下载。",
      accent: "#1d4ed8",
    },
    {
      id: "learn",
      step: "02",
      title: "互动伴学",
      body:
        "跟着时间轴走，关键点停下来提问，做随堂自测。掌握度进度条会告诉你哪些是真会了，哪些只是看过。",
      accent: "#1e3a8a",
    },
    {
      id: "certify",
      step: "03",
      title: "达标拿证",
      body:
        "覆盖率、检测正确率、提问次数都够了，证书自动解锁。存进你的证书墙，随时预览、下载、分享。",
      accent: "#0f172a",
    },
  ],
};

/** 底部 CTA——首页末尾的最后一次推动。 */
export const HOME_FINAL_CTA = {
  title: "从今天的一节课开始",
  body: "不用准备什么。挑一个年级、选一门学科，剩下的交给节奏。",
  primaryCta: { label: "按年级选课", href: "/k12" },
  secondaryCta: { label: "查看学情中心", href: "/learning/books" },
};
