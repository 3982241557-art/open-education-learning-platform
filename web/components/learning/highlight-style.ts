"use client";

/**
 * 划线样式定义
 * ============
 *
 * 用户给一段划线挑「什么形状」和「什么颜色」。
 *
 * 形状
 * ----
 *
 * - ``highlight`` —— 荧光笔背景。整段铺一层半透明色，最醒目。
 * - ``underline`` —— 底部一条实线。安静，不遮挡正文。
 * - ``wavy`` —— 底部波浪线。介于两者之间，带点情绪。
 *
 * 配色
 * ----
 *
 * 五种**莫兰迪色**——低饱和、灰调，不刺眼，长时间阅读不累。
 * 这是刻意选的：正文字号本来就小，高饱和色会打架。
 *
 * 每种颜色给三档值：
 *
 * - ``bg`` —— 高亮形状用的背景色；
 * - ``line`` —— 直线 / 波浪线用的前景色；
 * - ``soft`` —— 左栏标记用的浅色底。
 *
 * CSS 自定义属性
 * -------------
 *
 * 颜色不写死成十六进制，而是以 CSS 变量的形式挂到元素上：
 *
 * ``data-seek-style="underline" data-seek-color="haze"``
 *
 * CSS 侧只需要一条规则就能覆盖三种形状 × 五种颜色——加新颜色时
 * 只改这一个文件，不必回到 JS 里改一堆 if/else。
 */

/** 三种划线形状。 */
export type HighlightStyle = "highlight" | "underline" | "wavy";

/** 五种莫兰迪配色。 */
export type HighlightColor = "amber" | "haze" | "bean" | "rose" | "lilac";

export interface HighlightStyleDef {
  id: HighlightStyle;
  label: string;
  /** 形状的中文说明——用作无障碍标签与 tooltip。 */
  hint: string;
}

export interface HighlightColorDef {
  id: HighlightColor;
  label: string;
  /** 这个颜色的 CSS 变量名后缀。 */
  token: string;
  /** 色块预览用的实色（比正文里的更饱和一点，好让色板看得清）。 */
  swatch: string;
}

export const HIGHLIGHT_STYLES: HighlightStyleDef[] = [
  {
    id: "highlight",
    label: "荧光高亮",
    hint: "整段铺一层背景色，最醒目",
  },
  {
    id: "underline",
    label: "底部直线",
    hint: "文字下方一条实线，不遮挡正文",
  },
  {
    id: "wavy",
    label: "波浪下划线",
    hint: "文字下方一道波浪线，带点情绪",
  },
];

export const HIGHLIGHT_COLORS: HighlightColorDef[] = [
  {
    id: "amber",
    label: "琥珀黄",
    token: "amber",
    swatch: "#D9B26A",
  },
  {
    id: "haze",
    label: "雾霾蓝",
    token: "haze",
    swatch: "#8FA6BF",
  },
  {
    id: "bean",
    label: "豆沙绿",
    token: "bean",
    swatch: "#93B39A",
  },
  {
    id: "rose",
    label: "干燥玫瑰粉",
    token: "rose",
    swatch: "#C89A9E",
  },
  {
    id: "lilac",
    label: "丁香紫",
    token: "lilac",
    swatch: "#A99BC4",
  },
];

/** 默认形状与配色。 */
export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = "highlight";
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "amber";

/** 把任意输入夹回合法值。 */
export function normalizeStyle(value: string | undefined): HighlightStyle {
  return HIGHLIGHT_STYLES.some((item) => item.id === value)
    ? (value as HighlightStyle)
    : DEFAULT_HIGHLIGHT_STYLE;
}

export function normalizeColor(value: string | undefined): HighlightColor {
  return HIGHLIGHT_COLORS.some((item) => item.id === value)
    ? (value as HighlightColor)
    : DEFAULT_HIGHLIGHT_COLOR;
}

/** 形状的中文名。 */
export function styleLabel(style: string): string {
  return HIGHLIGHT_STYLES.find((item) => item.id === style)?.label ?? "荧光高亮";
}

/** 颜色的中文名。 */
export function colorLabel(color: string): string {
  return HIGHLIGHT_COLORS.find((item) => item.id === color)?.label ?? "琥珀黄";
}

/**
 * 生成 CSS 变量声明。
 *
 * 用于给 DOM 元素（正文里的 ``<mark>``、左栏的色块）上色——把颜色
 * 值集中在 JS 侧一份，CSS 只负责「形状」。
 */
export function highlightVars(
  style: string,
  color: string,
): Record<string, string> {
  const s = normalizeStyle(style);
  const c = normalizeColor(color);
  const token = HIGHLIGHT_COLORS.find((item) => item.id === c)?.token ?? "amber";

  if (s === "underline") {
    return {
      "--seek-hl-color": `var(--seek-color-${token})`,
      "--seek-hl-bg": "transparent",
      "--seek-hl-decoration": "underline",
    };
  }
  if (s === "wavy") {
    return {
      "--seek-hl-color": `var(--seek-color-${token})`,
      "--seek-hl-bg": "transparent",
      "--seek-hl-decoration": "underline wavy",
    };
  }
  return {
    "--seek-hl-color": "inherit",
    "--seek-hl-bg": `var(--seek-bg-${token})`,
    "--seek-hl-decoration": "none",
  };
}
