/**
 * 生字读音表（浏览器端）
 * ========================
 *
 * 数据来自 `public/data/hanzi-pinyin.json`——
 * 由 `scripts/build-hanzi-pinyin.mjs` 在构建期生成。
 *
 * 用法：
 *
 * ```ts
 * const pinyin = await loadPinyin("我");   // "wǒ"
 * ```
 */

let cache: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

/** 加载整张读音表（带缓存，只请求一次）。 */
export async function loadPinyinTable(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (!pending) {
    pending = fetch("/data/hanzi-pinyin.json")
      .then((response) => response.json())
      .then((data: Record<string, string>) => {
        cache = data;
        return data;
      })
      .catch(() => {
        cache = {};
        return cache;
      });
  }
  return pending;
}

/**
 * 取单个字的读音。
 *
 * 读音表还没加载完时返回空字符串——调用方应把它当作「暂无读音」处理，
 * 而不是阻塞渲染。
 */
export async function loadPinyin(char: string): Promise<string> {
  const table = await loadPinyinTable();
  return table[char] ?? "";
}

/** 同步读取（仅在表已加载时有效）。 */
export function peekPinyin(char: string): string {
  return cache?.[char] ?? "";
}
