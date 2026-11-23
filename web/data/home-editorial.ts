/**
 * 首页品牌叙事文案
 * =================
 *
 * 首页的所有**编辑型文案**都抽到这里。
 *
 * 为什么
 * ----
 *
 * 之前这些文字直接写在 JSX 里，导致：
 *
 * 1. **改文案要翻 JSX**——大段中文散落在几百行组件代码中间，
 *    运营想改一句品牌宣言，得先找到那个组件；
 * 2. **没法做多语言**——文案是硬编码的中文常量，英文界面无法
 *    切换；
 * 3. **没法审**——品牌文案是最该被运营逐句审的东西，却藏在
 *    代码深处。
 *
 * 抽出来之后，它就是一份**可审的文档**——运营改这个文件就行，
 *    组件只负责排版。
 *
 * 字段约定
 * --------
 *
 * - 每条文案**同时**提供 ``zh`` 与 ``en``；
 * - ``zh`` 是简体中文，``zhTW`` 缺省时回落 ``zh``；
 * - 组件通过 ``useLocale().locale`` 选择。
 */

/** 一条多语言文案。 */
export interface Bilingual {
  /** 简体中文。 */
  zh: string;
  /** 繁体中文（缺省回落简体）。 */
  zhTW?: string;
  /** 英文。 */
  en: string;
}

/** 板块 A · 关于梦想课堂。 */
export const ABOUT = {
  kicker: { zh: "梦想课堂 · Dream Classroom", en: "Dream Classroom" },
  title: { zh: "关于我们", en: "About Us" },
  paragraphs: [
    {
      zh: "梦想课堂（Dream Classroom）由创始人 Dolphin 创立于深圳，总部位于深圳湾后海，是一家以「无边界创新教育」为核心理念的家庭学习共同体。",
      en: "Dream Classroom was founded by Dolphin in Shenzhen. Headquartered in Houhai, Shenzhen Bay, it is a family learning community built on the idea of “education without boundaries.”",
    },
    {
      zh: "我们摒弃填鸭式和碎片化的知识堆砌，致力于培养孩子跨学科、跨边界、跨文化的学习力。",
      en: "We reject rote drilling and fragmented knowledge stacking, and instead cultivate a child's ability to learn across subjects, across boundaries, and across cultures.",
    },
  ],
  /** 碑文等式。 */
  creedTitle: {
    zh: "无边界创新教育 =",
    en: "Education without boundaries =",
  },
  creedFormula: {
    zh: "把学科融合 + 把思维拉高 + 把世界打开",
    en: "Fuse the disciplines + Raise the thinking + Open the world",
  },
  creedQuote: {
    zh: "我们相信每一个孩子都本自具足，教育者的使命是唤醒，而非填鸭。",
    en: "We believe every child is already complete. The educator's task is to awaken, never to fill.",
  },
};

/**
 * 板块 B · 方法论区的小标题与主标题。
 *
 * ⛔ 这两行曾经是**硬编码中文**——切到英文界面时，整段只剩标题
 *    是中文、卡片却是英文，看起来像没做完。现在全部走多语言。
 */
export const PILLARS_SECTION = {
  /** 眉标。 */
  eyebrow: { zh: "方法论", en: "Methodology" },
  /** 主标题。 */
  heading: {
    zh: "三大支柱，撑起一套完整的教育观。",
    en: "Three pillars, one complete educational philosophy.",
  },
};

/** 板块 B · 三大方法论支柱。 */
export const PILLARS = [  {
    no: "01",
    title: { zh: "打破边界", en: "Unboundary" },
    titleEn: "Unboundary",
    body: {
      zh: "让学习融入生活，打破学科与场景的壁垒。",
      en: "Let learning dissolve into life, breaking the walls between subjects and situations.",
    },
  },
  {
    no: "02",
    title: { zh: "东西方融合", en: "East-meets-West" },
    titleEn: "East-meets-West",
    body: {
      zh: "结合中国哲学智慧与西方教育创造力。",
      en: "Combine the philosophical wisdom of China with the creativity of Western education.",
    },
  },
  {
    no: "03",
    title: { zh: "家庭核心", en: "Family-Anchored" },
    titleEn: "Family-Anchored",
    body: {
      zh: "教育是家庭共同的冒险，而非孩子一个人的战斗。",
      en: "Education is a shared family adventure, not a battle a child fights alone.",
    },
  },
];

/** 板块 C · 国际视野 & 总部空间。 */
export const GLOBAL_VIEW = {
  title: { zh: "国际视野", en: "A Global Outlook" },
  paragraphs: [
    {
      zh: "梦想课堂已与英国牛津 Sibford School 建立官方战略合作伙伴关系。",
      en: "Dream Classroom has established an official strategic partnership with Sibford School, Oxford, UK.",
    },
    {
      zh: "2026 年 3 月，Sibford 校长 Rebecca 女士亲临深圳梦想课堂总部，与中国家庭展开「无边界·思想汇」深度对话，探讨 AI 时代如何保护孩子的灵性，以及全人教育在中国家庭的落地实践。",
      en: "In March 2026, Sibford's Principal Ms. Rebecca visited our Houhai headquarters for an in-depth “Boundless · Ideas Convergence” dialogue with Chinese families — exploring how to protect a child's inner life in the AI era, and how whole-child education takes root in Chinese homes.",
    },
  ],
  partner: { zh: "英国牛津 Sibford School", en: "Sibford School, Oxford, UK" },
};

export const HQ_SPACE = {
  title: { zh: "总部空间", en: "Our Headquarters" },
  body: {
    zh: "深圳湾后海总部集全球教育咨询、AI 教育实验室、学习力研究院、国际创业孵化、国际化教育联盟于一体，是机构的「思想中枢」与「家族会客厅」。",
    en: "The Houhai headquarters in Shenzhen Bay brings together global education consulting, an AI-education lab, a learning-power institute, international venture incubation and a global education alliance — the intellectual hub and family salon of the institution.",
  },
  items: [
    { zh: "全球教育咨询", en: "Global Education Consulting" },
    { zh: "AI 教育实验室", en: "AI Education Lab" },
    { zh: "学习力研究院", en: "Learning Power Institute" },
    { zh: "国际创业孵化", en: "International Venture Incubation" },
    { zh: "国际化教育联盟", en: "Global Education Alliance" },
  ],
};

/** 板块 D · 加入我们。 */
export const JOIN = {
  title: { zh: "加入我们", en: "Join Us" },
  subtitle: {
    zh: "两种方式，汇入同一个共同体。",
    en: "Two ways into the same community.",
  },
  channels: [
    {
      id: "family",
      kicker: { zh: "通道一", en: "Channel One" },
      title: { zh: "家庭学习共同体", en: "Family Learning Community" },
      body: {
        zh: "梦想课堂是一个以长期陪伴与深度成长为核心的家庭学习共同体。我们期待加入的家庭，愿意为身心成长留出时间，也愿意在共同体中持续参与、彼此滋养。",
        en: "Dream Classroom is a family learning community built around long-term companionship and deep growth. We welcome families who are willing to make room for a child's physical and emotional development, and who want to take part and nurture one another over time.",
      },
    },
    {
      id: "partner",
      kicker: { zh: "通道二", en: "Channel Two" },
      title: { zh: "全球加盟与战略合作", en: "Global Franchise & Strategic Partnerships" },
      body: {
        zh: "面向海外中文学校、国际教育机构、区域加盟伙伴及教研共创团队，开放 OE 开放教育平台体系接入、AI 教具赋能与本地化合作通道。",
        en: "We open the OE platform ecosystem, AI manipulative tooling and localisation channels to overseas Chinese schools, international education institutions, regional partners and curriculum co-creation teams.",
      },
    },
  ],
  contactTitle: { zh: "官方合作邮箱", en: "Official Contact" },
  qrTitle: { zh: "扫码联系", en: "Scan to Reach Us" },
  /**
   * 联系槽位的**未配置占位文案**。
   *
   * 之前这些是硬编码中文——英文界面下会露出中文，破坏沉浸感。
   */
  emailPending: {
    zh: "官方合作邮箱待配置",
    en: "Official contact email not configured yet",
  },
  wechatPending: {
    zh: "官方微信 ID 待配置",
    en: "Official WeChat ID not configured yet",
  },
  copyEmail: { zh: "一键复制", en: "Copy" },
  copied: { zh: "已复制", en: "Copied" },
  wechatLabel: { zh: "微信", en: "WeChat" },
};

/** 首页 Hero 的行动按钮。 */
export const HERO_CTA = {
  primary: { zh: "开始探索课程 →", en: "Start Exploring Courses →" },
  secondary: { zh: "查看成长报告", en: "View Growth Report" },
};

/** 首页三大能力卡（旧版「为什么是 OE」）。 */
export const WHY_OE = {
  kicker: { zh: "为什么是 OE", en: "Why OE" },
  title: {
    zh: "海外孩子缺的从来不是课程，是那条通往国内课堂的对齐路径。",
    en: "What overseas children lack is never the course — it's the alignment path back to the classroom at home.",
  },
  pillars: [
    {
      title: { zh: "开放 · 不做围墙", en: "Open · No Walls" },
      body: {
        zh: "教材版本对标国内统编与人教，但课程本身来自公开可获取的优质同步课——不设门槛、不做订阅墙。",
        en: "Textbook editions align with the national unified edition and PEP, while the lessons themselves come from openly available high-quality sync courses — no gatekeeping, no paywall.",
      },
    },
    {
      title: { zh: "同步 · 不脱节", en: "Synced · Never Behind" },
      body: {
        zh: "每一讲都落在真实教材单元上：先摸底，再精讲，再互动，再检测——回到国内课堂时不用重新补。",
        en: "Every lesson lands on a real textbook unit: diagnose, teach, interact, then check — so no catching up is needed when the child returns to a Chinese classroom.",
      },
    },
    {
      title: { zh: "陪读 · 不打断", en: "Companionship · No Interruption" },
      body: {
        zh: "AI 助教常驻右侧，按你的诊断结果调整深浅，在中英之间给出对照——但不抢走读课文的时间。",
        en: "The AI tutor stays on the side, adjusting depth to the learner's diagnostic, giving a bilingual contrast — without stealing time from reading the text.",
      },
    },
  ],
};

/** 学习闭环四步。 */
export const LEARNING_LOOP = {
  kicker: { zh: "学习闭环", en: "The Learning Loop" },
  title: { zh: "从进课到拿证，四步走完。", en: "Four steps from entering a lesson to earning a certificate." },
  steps: [
    {
      no: "01",
      title: { zh: "课前精准摸底", en: "Precise Pre-Assessment" },
      body: {
        zh: "进课先来两道真实考点题——不是「你懂不懂」，而是直接考这一讲的前置基础。助教会据此调整讲解的深浅。",
        en: "Two real exam-point questions come first — not “do you get it”, but directly testing the prerequisites of this lesson. The tutor adjusts its depth accordingly.",
      },
      accent: "#1e242b",
      tall: false,
    },
    {
      no: "02",
      title: { zh: "同步精讲微课", en: "Synced Micro-Lesson" },
      body: {
        zh: "按教材单元逐课时推进的名师同步课，每一集都有时间戳知识节点与段落导读，读到哪里、懂到哪里，一目了然。",
        en: "Teacher-led sync lessons advance unit by unit; each episode carries timestamped knowledge nodes and reading guidance.",
      },
      accent: "#4e677d",
      tall: true,
    },
    {
      no: "03",
      title: { zh: "学科互动实验室", en: "Subject Lab" },
      body: {
        zh: "语文是笔顺描红与名篇赏析，数学是函数图像与动态几何——把这一课的核心概念亲手玩明白。",
        en: "Chinese: stroke order and classic-text appreciation. Mathematics: function graphs and dynamic geometry — hands-on grasp of this lesson's core idea.",
      },
      accent: "#a48a5e",
      tall: false,
    },
    {
      no: "04",
      title: { zh: "达标颁证认证", en: "Certified on Mastery" },
      body: {
        zh: "完成整册并通过随堂检测，即可领取带编号的 K12 同步修习证书——它记在「学情中心」里，随时可查。",
        en: "Complete the volume and pass the in-lesson check to receive a numbered K12 certificate, permanently recorded in the Growth Center.",
      },
      accent: "#2c333b",
      tall: true,
    },
  ],
};

/** 双引擎体验。 */
export const DUAL_ENGINE = {
  kicker: { zh: "双引擎体验", en: "Two Engines" },
  title: {
    zh: "语文与数学，是两台完全不同的引擎。",
    en: "Chinese and Mathematics are two entirely different engines.",
  },
  body: {
    zh: "语文要的是积累与品味——一个字怎么写、一句诗怎么读、一篇课文为什么这样结尾。数学要的是建模与推理——一个参数动了，整个图形会怎么变。",
    en: "Chinese demands accumulation and taste — how a character is written, how a line of verse is read, why a text ends where it does. Mathematics demands modelling and reasoning — when one parameter moves, how does the whole figure change?",
  },
  chinese: {
    title: { zh: "语文引擎", en: "Chinese Engine" },
    body: {
      zh: "小学：真实笔顺动画 + 拼音语音朗读 + 课文生字。初中高中：名篇精读与意象赏析台。",
      en: "Primary: real stroke-order animation, pinyin read-aloud, textbook characters. Secondary: classic-text close reading and imagery appreciation.",
    },
  },
  math: {
    title: { zh: "数学引擎", en: "Mathematics Engine" },
    body: {
      zh: "小学：数轴、凑十、分数披萨、面积方格。初中高中：函数图像滑块、动态几何、概率模拟。",
      en: "Primary: number line, ten-frame blocks, fraction discs, area grids. Secondary: function-graph sliders, dynamic geometry, probability simulation.",
    },
  },
};

/**
 * 按当前语言挑文案。
 *
 * @param item 多语言文案
 * @param locale 当前语言
 */
export function pick(
  item: Bilingual,
  locale: "zh-CN" | "zh-TW" | "en",
): string {
  if (locale === "en") return item.en;
  if (locale === "zh-TW") return item.zhTW ?? item.zh;
  return item.zh;
}
