/**
 * 站点联系与品牌配置
 * ==================
 *
 * **所有**对外联系方式与品牌落款都集中在这一个文件里。
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
 *
 * ⛔ **这里不放长文案**。首页的品牌叙事（梦想课堂专栏、加入我们等）
 *    在 ``data/home-editorial.ts``——那边是**多语言**的，而这里是
 *    **纯运营配置**。两者职责不同，不要混。
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
