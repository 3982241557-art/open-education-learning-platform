/**
 * 相对时间格式化。
 *
 * 复刻自 DeepTutor 的 ``lib/relative-time.ts``：接收 Unix 秒级时间戳，
 * 返回"刚刚 / N 分钟前 / N 小时前 / N 天前 / YYYY-MM-DD"。
 */
export function formatRelativeTime(
  timestampSeconds: number,
  locale = "zh-CN",
): string {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return "";

  const now = Date.now() / 1000;
  const diff = now - timestampSeconds;

  if (diff < 0) return formatDate(timestampSeconds, locale);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(timestampSeconds, locale);
}

function formatDate(timestampSeconds: number, locale: string): string {
  try {
    return new Date(timestampSeconds * 1000).toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
  }
}
