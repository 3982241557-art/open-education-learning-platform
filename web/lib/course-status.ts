/**
 * 课程底层状态码 → 面向学习者的中文状态。
 *
 * 数据里存的是机器可读的状态码（``ready`` / ``theory`` / ``practice``），
 * 它们是**给程序看的**，不是给学习者看的。直接渲染到界面上会出现
 * 「ready · 1 块 · theory」这种半中半英的排版噪音。
 *
 * 这里集中做一次映射：
 *
 * * ``content_type`` → 「讲解」「演练」「推导」「通史」等**内容形态**；
 * * ``status`` → 「已就绪」等**就绪状态**（或干脆不显示）。
 *
 * 未收录的码原样返回——宁可显示原始值，也不要显示空白或
 * ``undefined``。
 */

/** 内容形态 → 中文名。 */
const CONTENT_TYPE_LABELS: Record<string, string> = {
  theory: "讲解",
  derivation: "推导",
  history: "通史",
  practice: "演练",
  reference: "查阅",
  concept: "概念",
  worked_example: "例题",
};

/** 就绪状态 → 中文名。 */
const STATUS_LABELS: Record<string, string> = {
  ready: "已就绪",
  draft: "草稿",
  pending: "待生成",
  failed: "生成失败",
  stale: "待更新",
};

/**
 * 内容形态的中文名。
 *
 * 未收录时返回原值——界面不应该因此变空。
 */
export function contentTypeLabel(contentType: string | undefined | null): string {
  const key = String(contentType ?? "").trim();
  if (!key) return "";
  return CONTENT_TYPE_LABELS[key] ?? key;
}

/**
 * 就绪状态的中文名。
 *
 * 返回空串表示「这个状态不值得显示」——例如 ``ready`` 是常态，
 * 没必要在每张卡片上重复标注。
 */
export function statusLabel(status: string | undefined | null): string {
  const key = String(status ?? "").trim();
  if (!key) return "";
  if (key === "ready") return "";
  return STATUS_LABELS[key] ?? key;
}
