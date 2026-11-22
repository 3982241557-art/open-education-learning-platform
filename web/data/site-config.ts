/**
 * 站点联系与品牌配置
 * ==================
 *
 * **所有**对外联系方式都集中在这一个文件里。
 *
 * 为什么单独抽
 * ------------
 *
 * 邮箱、微信号、二维码图片路径这三样东西，是运营侧最常改的——
 * 换一个人接手，就要改三处散落在 JSX 里的硬编码字符串。
 * 抽出来之后，改配置**永远只改这一个文件**，而且改动一眼可审。
 *
 * 槽位约定
 * --------
 *
 * 每个字段都有两种状态：
 *
 * - **已配置**（有值）——页面上正常展示，并提供一键复制 / 直接显示；
 * - **未配置**（空字符串）——页面上呈现**优雅的虚线预留框**，
 *   配上一句清楚的占位提示，而不是空白、也不是「null」。
 *
 * 这样即使配置还没填好，页面也不会出现半成品的样子。
 */

/** 官方合作邮箱——留空则首页显示虚线预留框。 */
export const CONTACT_EMAIL = "";

/** 官方微信 ID——留空则首页显示虚线预留框。 */
export const WECHAT_ID = "";

/**
 * 官方联系二维码图片路径（相对于站点根）。
 *
 * 例：``/images/home/wechat-qr.png``。留空则显示虚线预留框。
 */
export const QR_CODE_IMAGE = "";

/** 品牌落款。 */
export const BRAND = {
  /** 英文平台名。 */
  nameEn: "Open Education",
  /** 英文平台全称。 */
  fullNameEn: "Open Education Learning Platform",
  /** 中文平台全称。 */
  nameZh: "开放教育学习平台",
  /** 极简徽标字母。 */
  monogram: "OE",
  /** 品牌宣言（衬线体呈现）。 */
  slogan: "随时随地，让思考自然发生。",
  /** 固定副标题。 */
  subtitle: "为全球华人家庭构筑无边界学习空间。",
} as const;

/** 梦想课堂（Dream Classroom）信息。 */
export const DREAM_CLASSROOM = {
  /** 中文名。 */
  name: "梦想课堂",
  /** 英文名。 */
  nameEn: "Dream Classroom",
  /** 创始人。 */
  founder: "Dolphin",
  /** 创立地。 */
  origin: "深圳",
  /** 总部地点。 */
  headquarters: "深圳湾后海总部",
  /** 总部短标（用于铭牌）。 */
  hqLabel: "深圳湾后海总部",
  /** 核心理念。 */
  creed: "无边界创新教育",
  /** 碑文等式。 */
  formula: "把学科融合 + 把思维拉高 + 把世界打开",
  /** 创始人金句。 */
  quote: "我们相信每一个孩子都本自具足，教育者的使命是唤醒，而非填鸭。",
} as const;

/** 三大方法论支柱。 */
export const METHODOLOGY_PILLARS = [
  {
    no: "01",
    title: "打破边界",
    titleEn: "Unboundary",
    body: "让学习融入生活，打破学科与场景的壁垒。",
  },
  {
    no: "02",
    title: "东西方融合",
    titleEn: "East-meets-West",
    body: "结合中国哲学智慧与西方教育创造力。",
  },
  {
    no: "03",
    title: "家庭核心",
    titleEn: "Family-Anchored",
    body: "教育是家庭共同的冒险，而非孩子一个人的战斗。",
  },
] as const;

/** 合作通道。 */
export const JOIN_CHANNELS = [
  {
    id: "family",
    kicker: "通道一",
    title: "家庭学习共同体",
    body: "梦想课堂是一个以长期陪伴与深度成长为核心的家庭学习共同体。我们期待加入的家庭，愿意为身心成长留出时间，也愿意在共同体中持续参与、彼此滋养。",
  },
  {
    id: "partner",
    kicker: "通道二",
    title: "全球加盟与战略合作",
    body: "面向海外中文学校、国际教育机构、区域加盟伙伴及教研共创团队，开放 OE 开放教育平台体系接入、AI 教具赋能与本地化合作通道。",
  },
] as const;

/** 国际合作信息。 */
export const PARTNERSHIP = {
  /** 合作伙伴。 */
  partner: "英国牛津 Sibford School",
  /** 事件时间。 */
  eventDate: "2026 年 3 月",
  /** 事件描述。 */
  event:
    "Sibford 校长 Rebecca 女士亲临深圳梦想课堂总部，与中国家庭展开「无边界·思想汇」深度对话，探讨 AI 时代如何保护孩子的灵性，以及全人教育在中国家庭的落地实践。",
  /** 总部空间描述。 */
  hqBody:
    "梦想课堂深圳湾后海总部集全球教育咨询、AI 教育实验室、学习力研究院、国际创业孵化、国际化教育联盟于一体，是机构的「思想中枢」与「家族会客厅」。",
} as const;

/** 联系信息是否已配置。 */
export function hasContactEmail(): boolean {
  return CONTACT_EMAIL.trim().length > 0;
}

/** 微信号是否已配置。 */
export function hasWechat(): boolean {
  return WECHAT_ID.trim().length > 0;
}

/** 二维码图片是否已配置。 */
export function hasQrCode(): boolean {
  return QR_CODE_IMAGE.trim().length > 0;
}
