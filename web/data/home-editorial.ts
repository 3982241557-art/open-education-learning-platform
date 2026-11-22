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
 * 三语
 * ----
 *
 * 首页是**门面**——海外用户第一眼看到的就是它。所以它的文案必须
 * 三语都写得地道，不能靠机器翻译。
 *
 * 做法：每个文案字段都是 ``{ zhCN, zhTW, en }`` 三元组，渲染时
 * 由 :func:`pickText` 按当前语言取值。**结构共用，文字各写**——
 * 三种语言的信息密度不同，强行共用一段字符串必然有一边别扭。
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

import type { Locale } from "@/context/LocaleContext";

/** 一段三语文案。 */
export interface TriText {
  /** 简体中文。 */
  zhCN: string;
  /** 繁体中文。 */
  zhTW: string;
  /** 英文。 */
  en: string;
}

/**
 * 按当前语言取文案。
 *
 * @param text 三语文案
 * @param locale 当前语言
 */
export function pickText(text: TriText | string, locale: Locale): string {
  if (typeof text === "string") return text;
  if (locale === "en") return text.en;
  if (locale === "zh-TW") return text.zhTW;
  return text.zhCN;
}

/** 一张配图。 */
export interface EditorialImage {
  /** 站点根相对路径。留空则渲染占位块。 */
  src: string;
  /** 占位块的渐变色——图片缺失时用它撑住版面。 */
  accent: string;
  /** 图片的替代文字（无障碍用）。 */
  alt: TriText;
}

/** Hero 首屏。 */
export interface HeroConfig {
  /** 主标题。 */
  title: TriText;
  /** 标题下方的定位副标。 */
  subtitle: TriText;
  /** 温润导语——一段话，2~3 句。 */
  lead: TriText;
  /** 主行动按钮。 */
  primaryCta: { label: TriText; href: string };
  /** 次行动按钮。 */
  secondaryCta?: { label: TriText; href: string };
  /** 背景图。 */
  image: EditorialImage;
  /** 首屏右下角的几个数字——用来建立可信度。 */
  stats: Array<{ value: string; label: TriText }>;
}

/** 「我们是谁」板块。 */
export interface SectionConfig {
  id: string;
  /** 板块序号——显示成「01 / 我们是谁」。 */
  index: string;
  /** 小标题。 */
  eyebrow: TriText;
  /** 大标题。 */
  title: TriText;
  /** 正文段落。 */
  body: TriText[];
  /** 图片。 */
  image: EditorialImage;
  /** 配图上的浮动标签——比如「北美」「欧洲」。 */
  imageTags?: TriText[];
  /** 这一节的补充要点——渲染成小卡片。 */
  points?: Array<{ title: TriText; detail: TriText }>;
}

/** 核心优势四宫格。 */
export interface AdvantageConfig {
  id: string;
  title: TriText;
  body: TriText;
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
  title: TriText;
  body: TriText;
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
    title: {
      zhCN: "开放教育学习平台",
      zhTW: "開放教育學習平台",
      en: "Open Education Learning Platform",
    },
    subtitle: {
      zhCN: "深圳后海总部 · Open Education Learning Platform · Houhai HQ, Shenzhen",
      zhTW: "深圳後海總部 · Open Education Learning Platform · Houhai HQ, Shenzhen",
      en: "Houhai HQ, Shenzhen · Open Education Learning Platform",
    },
    lead: {
      zhCN:
        "我们把国内 K12 语文与数学的教材同步课，装进了一套可以边看边问、课前诊断、随堂检测、达标拿证的自学系统里。" +
        "无论你身在北美、欧洲、东南亚还是澳新——按孩子的年级和年龄直接对号入座，剩下的就是学本身。",
      zhTW:
        "我們把國內 K12 語文與數學的教材同步課，裝進了一套可以邊看邊問、課前診斷、隨堂檢測、達標拿證的自學系統裡。" +
        "無論你身在北美、歐洲、東南亞還是澳新——按孩子的年級和年齡直接對號入座，剩下的就是學本身。",
      en:
        "We turn China's K12 Chinese-language and Math syllabus into a self-paced system: watch, " +
        "ask, take an entry diagnostic, and earn a certificate. Pick your child's grade and age — " +
        "the rest is simply learning.",
    },
    primaryCta: {
      label: { zhCN: "按年级选课", zhTW: "按年級選課", en: "Browse by grade" },
      href: "/courses",
    },
    secondaryCta: {
      label: {
        zhCN: "看看公开课大厅",
        zhTW: "看看公開課大廳",
        en: "Explore open courses",
      },
      href: "/hub",
    },
    image: {
      src: "/images/home/hero.jpg",
      accent: "from-[#1e3a8a] via-[#0f172a] to-[#1d4ed8]",
      alt: {
        zhCN: "深圳后海总部与全球学习者",
        zhTW: "深圳後海總部與全球學習者",
        en: "Houhai HQ, Shenzhen and learners worldwide",
      },
    },
    stats: [
      {
        value: "24",
        label: {
          zhCN: "套年级同步系列",
          zhTW: "套年級同步系列",
          en: "grade-synced series",
        },
      },
      {
        value: "1519",
        label: { zhCN: "个真实课时", zhTW: "個真實課時", en: "real lessons" },
      },
      {
        value: "12",
        label: { zhCN: "个年级全覆盖", zhTW: "個年級全覆蓋", en: "grades covered" },
      },
      {
        value: "2",
        label: { zhCN: "大核心学科", zhTW: "大核心學科", en: "core subjects" },
      },
    ],
  },

  /* ── 板块 1 · 我们是谁 ─────────────────────────────────────────── */
  who: {
    id: "who",
    index: "01",
    eyebrow: {
      zhCN: "我们是谁",
      zhTW: "我們是誰",
      en: "Who we are",
    },
    title: {
      zhCN: "从深圳后海出发，连接每一个想读书的中国人",
      zhTW: "從深圳後海出發，連接每一個想讀書的中國人",
      en: "From Houhai, Shenzhen — connecting every Chinese reader who wants to keep learning",
    },
    body: [
      {
        zhCN:
          "后海是深圳的科技与创意聚集地——一批做硬件、做软件、做投资的人在这里长大，也在这里学会了「把一件难事做成」的做事方式。开放教育学习平台总部设在这里，是因为它符合我们对自己的要求：把复杂的东西做简单，把承诺兑现。",
        zhTW:
          "後海是深圳的科技與創意聚集地——一批做硬體、做軟體、做投資的人在這裡長大，也在這裡學會了「把一件難事做成」的做事方式。開放教育學習平台總部設在這裡，是因為它符合我們對自己的要求：把複雜的東西做簡單，把承諾兌現。",
        en:
          "Houhai is Shenzhen's hub for hardware, software and venture craft. It is where our team grew up and learned to turn hard problems into shipped work. We based Open Education here because it matches how we want to operate: make the complex simple, and keep every promise.",
      },
      {
        zhCN:
          "而我们服务的对象，是散布在全球的华人。在多伦多、在悉尼、在新加坡、在巴黎——他们当中有人想读名校的公开课，有人想补一门没修完的课，有人只是想保持一种「还在学习」的状态。距离是真实存在的，语言也是。",
        zhTW:
          "而我們服務的對象，是散布在全球的華人。在多倫多、在雪梨、在新加坡、在巴黎——他們當中有人想讀名校的公開課，有人想補一門沒修完的課，有人只是想保持一種「還在學習」的狀態。距離是真實存在的，語言也是。",
        en:
          "The people we serve are Chinese-speaking families spread across the globe — in Toronto, Sydney, Singapore, Paris. Some want a world-class lecture series, some want to finish a course they dropped, some simply want to stay in the habit of learning. Distance is real. So is language.",
      },
      {
        zhCN:
          "所以我们做了一件事：把门槛拆掉。简中、繁中、英文三种界面按需切换，按所在大区自动适配线路与习惯；课程被切分成可逐段消化、可随时提问、可量化掌握的节点。学习的阻力应该来自内容本身，而不是来自工具。",
        zhTW:
          "所以我們做了一件事：把門檻拆掉。簡中、繁中、英文三種介面按需切換，按所在大區自動適配線路與習慣；課程被切分成可逐段消化、可隨時提問、可量化掌握的節點。學習的阻力應該來自內容本身，而不是來自工具。",
        en:
          "So we removed the barriers. Simplified Chinese, Traditional Chinese and English interfaces switch on demand; region adapts routes and conventions automatically; every lesson is broken into segments you can absorb, question and measure. The friction should come from the material — not from the tooling.",
      },
    ],
    image: {
      src: "/images/home/who.jpg",
      accent: "from-[#0f172a] via-[#1e3a8a] to-[#334155]",
      alt: {
        zhCN: "连接全球华人的学习网络",
        zhTW: "連接全球華人的學習網絡",
        en: "A learning network connecting Chinese readers worldwide",
      },
    },
    imageTags: [
      { zhCN: "北美", zhTW: "北美", en: "North America" },
      { zhCN: "欧洲", zhTW: "歐洲", en: "Europe" },
      { zhCN: "亚太", zhTW: "亞太", en: "Asia-Pacific" },
      { zhCN: "澳新", zhTW: "澳新", en: "ANZ" },
      { zhCN: "港澳台", zhTW: "港澳台", en: "HK / TW" },
    ],
    points: [
      {
        title: {
          zhCN: "终身学习的栖息地",
          zhTW: "終身學習的棲息地",
          en: "A place to land",
        },
        detail: {
          zhCN: "不是一门课的播放器，是一个可以停下来的地方。",
          zhTW: "不是一門課的播放器，是一個可以停下來的地方。",
          en: "Not a video player — somewhere you can actually stop.",
        },
      },
      {
        title: {
          zhCN: "不牺牲严肃性",
          zhTW: "不犧牲嚴肅性",
          en: "No dumbing down",
        },
        detail: {
          zhCN: "只收录名校与高质量开源体系，内容经得起核对。",
          zhTW: "只收錄名校與高品質開源體系，內容經得起核對。",
          en: "Only top institutions and rigorous open programmes — every claim checkable.",
        },
      },
      {
        title: {
          zhCN: "为中文读者而造",
          zhTW: "為中文讀者而造",
          en: "Built for Chinese readers",
        },
        detail: {
          zhCN: "界面、导读、讲解提示，都按中文学习习惯打磨。",
          zhTW: "介面、導讀、講解提示，都按中文學習習慣打磨。",
          en: "Interface, guides and explanations shaped for how Chinese learners read.",
        },
      },
    ],
  },

  /* ── 板块 2 · 我们在做什么 ─────────────────────────────────────── */
  what: {
    id: "what",
    index: "02",
    eyebrow: {
      zhCN: "我们在做什么",
      zhTW: "我們在做什麼",
      en: "What we do",
    },
    title: {
      zhCN: "把散落世界的优质公开课，收拢成一条可完成的路",
      zhTW: "把散落世界的優質公開課，收攏成一條可完成的路",
      en: "Turning scattered open courses into a path you can actually finish",
    },
    body: [
      {
        zhCN:
          "全球名校的公开课从来不缺——缺的是一条能走完的路。视频在 YouTube 上，字幕是英文的，讲义是一堆 PDF，进度只存在于播放器的进度条里。你能看，但很难说自己在「学」。",
        zhTW:
          "全球名校的公開課從來不缺——缺的是一條能走完的路。影片在 YouTube 上，字幕是英文的，講義是一堆 PDF，進度只存在於播放器的進度條裡。你能看，但很難說自己在「學」。",
        en:
          "Top universities have never been short of open courses. What is missing is a path you can walk to the end. The video sits on YouTube, the captions are English, the handouts are PDFs, and progress lives in a progress bar. You can watch — but it is hard to say you are learning.",
      },
      {
        zhCN:
          "开放教育学习平台做的是中间那一层：把公开课、开源学位路径与教材，装进同一个工作台里，配上时间轴上的知识节点、可暂停提问的 AI 助教、随堂自测与可验证的结业证书。",
        zhTW:
          "開放教育學習平台做的是中間那一層：把公開課、開源學位路徑與教材，裝進同一個工作台裡，配上時間軸上的知識節點、可暫停提問的 AI 助教、隨堂自測與可驗證的結業證書。",
        en:
          "We build the layer in between: open courses, open degree pathways and textbooks on one workbench — with timeline knowledge nodes, an AI tutor you can pause and question, in-lesson checks, and a verifiable certificate.",
      },
      {
        zhCN:
          "于是「看视频」变成了「完成一门课」——你走过的每一步都留下痕迹，最后得到一张能拿出去的证书。",
        zhTW:
          "於是「看影片」變成了「完成一門課」——你走過的每一步都留下痕跡，最後得到一張能拿出去的證書。",
        en:
          "So 'watching a video' becomes 'finishing a course'. Every step leaves a trace, and at the end there is a certificate you can actually show.",
      },
    ],
    image: {
      src: "/images/home/what.jpg",
      accent: "from-[#1d4ed8] via-[#0f172a] to-[#1e293b]",
      alt: {
        zhCN: "公开课与 AI 伴学工作台",
        zhTW: "公開課與 AI 伴學工作台",
        en: "Open courses on an AI-assisted workbench",
      },
    },
    imageTags: [
      {
        zhCN: "全球名校公开课",
        zhTW: "全球名校公開課",
        en: "World-class open courses",
      },
      {
        zhCN: "开源学位路径",
        zhTW: "開源學位路徑",
        en: "Open degree pathways",
      },
      {
        zhCN: "AI 伴学工作台",
        zhTW: "AI 伴學工作台",
        en: "AI study workbench",
      },
    ],
    points: [
      {
        title: {
          zhCN: "聚合 · 全球顶尖名校公开课",
          zhTW: "聚合 · 全球頂尖名校公開課",
          en: "Aggregate · elite open courses",
        },
        detail: {
          zhCN: "哈佛、耶鲁、MIT、斯坦福……按学科与难度编排。",
          zhTW: "哈佛、耶魯、MIT、史丹佛……按學科與難度編排。",
          en: "Harvard, Yale, MIT, Stanford — arranged by subject and difficulty.",
        },
      },
      {
        title: {
          zhCN: "接入 · 开源学历与文凭路径",
          zhTW: "接入 · 開源學歷與文憑路徑",
          en: "Integrate · open degree pathways",
        },
        detail: {
          zhCN: "OSSU 一类的完整学位课程体系，逐条映射成学习阶梯。",
          zhTW: "OSSU 一類的完整學位課程體系，逐條映射成學習階梯。",
          en: "Complete programmes like OSSU, mapped step by step into a learning ladder.",
        },
      },
      {
        title: {
          zhCN: "伴学 · 可随时打断的 AI 助教",
          zhTW: "伴學 · 可隨時打斷的 AI 助教",
          en: "Support · an AI tutor you can interrupt",
        },
        detail: {
          zhCN: "看到关键点就能问，答案贴着当前视频知识点给。",
          zhTW: "看到關鍵點就能問，答案貼著當前影片知識點給。",
          en: "Ask at the exact moment something clicks — answers anchored to the current timestamp.",
        },
      },
      {
        title: {
          zhCN: "沉淀 · 可验证的结业证书",
          zhTW: "沉澱 · 可驗證的結業證書",
          en: "Prove · a verifiable certificate",
        },
        detail: {
          zhCN: "编号、内容指纹、签章——成长可回溯，也可分享。",
          zhTW: "編號、內容指紋、簽章——成長可回溯，也可分享。",
          en: "Serial number, content fingerprint, seal — traceable progress you can share.",
        },
      },
    ],
  },

  /* ── 板块 3 · 核心优势（四宫格） ───────────────────────────────── */
  advantages: [
    {
      id: "timeline",
      title: {
        zhCN: "边看边问的时间轴交互",
        zhTW: "邊看邊問的時間軸互動",
        en: "Ask inline on a timeline",
      },
      body: {
        zhCN:
          "视频下方不是一串标题，而是一条被标注过的时间轴。关键点会浮成提示，点它——视频自动暂停，问题直接送到右侧助教那里。不用来回拖进度条找位置。",
        zhTW:
          "影片下方不是一串標題，而是一條被標註過的時間軸。關鍵點會浮成提示，點它——影片自動暫停，問題直接送到右側助教那裡。不用來回拖進度條找位置。",
        en:
          "Below the video is an annotated timeline, not a list of titles. Key moments surface as prompts; tap one and the video pauses while your question goes straight to the tutor. No scrubbing for the right minute.",
      },
      icon: "timeline",
      image: {
        src: "/images/home/adv-timeline.jpg",
        accent: "from-[#1d4ed8] to-[#0f172a]",
        alt: {
          zhCN: "时间轴上的知识节点与提问气泡",
          zhTW: "時間軸上的知識節點與提問氣泡",
          en: "Knowledge nodes and question bubbles on a timeline",
        },
      },
    },
    {
      id: "skill",
      title: {
        zhCN: "可汗式技能阶梯与随堂掌握度",
        zhTW: "可汗式技能階梯與隨堂掌握度",
        en: "Khan-style skill ladder with mastery tracking",
      },
      body: {
        zhCN:
          "每节课被切成若干技能节点，组成「入门启蒙 → 核心精修 → 综合实战 → 学位进阶」四级阶梯。每个节点挂一组自测题，正确率过 80% 就点亮为「已掌握」，并解锁下一阶。",
        zhTW:
          "每節課被切成若干技能節點，組成「入門啟蒙 → 核心精修 → 綜合實戰 → 學位進階」四級階梯。每個節點掛一組自測題，正確率過 80% 就點亮為「已掌握」，並解鎖下一階。",
        en:
          "Each lesson splits into skill nodes forming a four-rung ladder: onboarding → core → applied → degree-level. Every node carries a short self-test; above 80% it lights up as mastered and unlocks the next rung.",
      },
      icon: "skill",
      image: {
        src: "/images/home/adv-skill.jpg",
        accent: "from-[#0f172a] via-[#1e3a8a] to-[#1d4ed8]",
        alt: {
          zhCN: "技能树与掌握度进度条",
          zhTW: "技能樹與掌握度進度條",
          en: "A skill tree with mastery bars",
        },
      },
    },
    {
      id: "certificate",
      title: {
        zhCN: "Coursera 式结业证书与成长档案",
        zhTW: "Coursera 式結業證書與成長檔案",
        en: "Coursera-style certificates and a growth record",
      },
      body: {
        zhCN:
          "覆盖率、检测正确率、提问次数都达标，就自动解锁「开放教育学习平台结业证书」。深蓝金边排版、唯一编号、内容指纹——可预览、可下载、可分享，也能验证真伪。",
        zhTW:
          "覆蓋率、檢測正確率、提問次數都達標，就自動解鎖「開放教育學習平台結業證書」。深藍金邊排版、唯一編號、內容指紋——可預覽、可下載、可分享，也能驗證真偽。",
        en:
          "Meet the coverage, accuracy and engagement thresholds and the certificate unlocks automatically — navy-and-gold layout, unique serial, content fingerprint. Preview, download, share, and verify.",
      },
      icon: "certificate",
      image: {
        src: "/images/home/adv-cert.jpg",
        accent: "from-[#0f172a] to-[#1e3a8a]",
        alt: {
          zhCN: "深蓝金边的结业证书",
          zhTW: "深藍金邊的結業證書",
          en: "A navy-and-gold completion certificate",
        },
      },
    },
    {
      id: "globe",
      title: {
        zhCN: "简繁英三语与多区网络无感适配",
        zhTW: "簡繁英三語與多區網路無感適配",
        en: "Three languages, seamless multi-region routing",
      },
      body: {
        zhCN:
          "顶栏右上角一键切换简中 / 繁中 / EN，地区选择器按北美、欧洲、亚太、澳新、港澳台自动适配线路与书写习惯。切换之后，界面、日期格式、默认源全都跟着变。",
        zhTW:
          "頂欄右上角一鍵切換簡中 / 繁中 / EN，地區選擇器按北美、歐洲、亞太、澳新、港澳台自動適配線路與書寫習慣。切換之後，介面、日期格式、預設源全都跟著變。",
        en:
          "One click in the top bar switches Simplified Chinese, Traditional Chinese or English; the region picker adapts routing and conventions for North America, Europe, Asia-Pacific, ANZ and Greater China. Interface, date format and default source follow.",
      },
      icon: "globe",
      image: {
        src: "/images/home/adv-globe.jpg",
        accent: "from-[#1e3a8a] via-[#0f172a] to-[#475569]",
        alt: {
          zhCN: "多语言与多地区适配",
          zhTW: "多語言與多地區適配",
          en: "Multilingual and multi-region adaptation",
        },
      },
    },
  ],

  /* ── 板块 4 · 三步上手 ─────────────────────────────────────────── */
  steps: [
    {
      id: "pick",
      step: "01",
      title: { zhCN: "选课", zhTW: "選課", en: "Pick a course" },
      body: {
        zhCN:
          "在公开课大厅按学科或专题挑一门。点开就能直接播放，不需要注册，也不需要等下载。",
        zhTW:
          "在公開課大廳按學科或專題挑一門。點開就能直接播放，不需要註冊，也不需要等下載。",
        en:
          "Browse the hall by subject or topic. Click and it plays — no registration, no downloads.",
      },
      accent: "#1d4ed8",
    },
    {
      id: "learn",
      step: "02",
      title: { zhCN: "互动伴学", zhTW: "互動伴學", en: "Learn interactively" },
      body: {
        zhCN:
          "跟着时间轴走，关键点停下来提问，做随堂自测。掌握度进度条会告诉你哪些是真会了，哪些只是看过。",
        zhTW:
          "跟著時間軸走，關鍵點停下來提問，做隨堂自測。掌握度進度條會告訴你哪些是真會了，哪些只是看過。",
        en:
          "Follow the timeline, stop at key moments to ask, and take the in-lesson check. The mastery bar tells you what you truly know versus what you merely watched.",
      },
      accent: "#1e3a8a",
    },
    {
      id: "certify",
      step: "03",
      title: { zhCN: "达标拿证", zhTW: "達標拿證", en: "Earn the certificate" },
      body: {
        zhCN:
          "覆盖率、检测正确率、提问次数都够了，证书自动解锁。存进你的证书墙，随时预览、下载、分享。",
        zhTW:
          "覆蓋率、檢測正確率、提問次數都夠了，證書自動解鎖。存進你的證書牆，隨時預覽、下載、分享。",
        en:
          "Once coverage, accuracy and engagement are met, the certificate unlocks. It lands in your certificate wall — preview, download and share any time.",
      },
      accent: "#0f172a",
    },
  ],
};

/** 底部 CTA——首页末尾的最后一次推动。 */
export const HOME_FINAL_CTA: {
  title: TriText;
  body: TriText;
  primaryCta: { label: TriText; href: string };
  secondaryCta: { label: TriText; href: string };
} = {
  title: {
    zhCN: "从今天的一节课开始",
    zhTW: "從今天的一節課開始",
    en: "Start with one lesson today",
  },
  body: {
    zhCN: "不用准备什么。挑一个年级、选一门学科，剩下的交给节奏。",
    zhTW: "不用準備什麼。挑一個年級、選一門學科，剩下的交給節奏。",
    en: "Nothing to prepare. Pick a grade, pick a subject, and let the rhythm do the rest.",
  },
  primaryCta: {
    label: { zhCN: "按年级选课", zhTW: "按年級選課", en: "Browse by grade" },
    href: "/courses",
  },
  secondaryCta: {
    label: {
      zhCN: "查看学情中心",
      zhTW: "查看學情中心",
      en: "Open learning center",
    },
    href: "/learning/books",
  },
};
