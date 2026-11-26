/**
 * 简体 → 繁体 转换
 * ====================
 *
 * 全站繁体模式（``zh-TW``）的**底层实现**。
 *
 * 为什么需要它
 * ------------
 *
 * 之前繁体是靠**逐词查表**实现的——每个词条在字典里手写一份繁体。
 * 这有三个硬伤：
 *
 * 1. **漏一个就露馅**。新写的文案忘了加繁体条目，繁体模式下就
 *    直接显示简体，一眼穿帮；
 * 2. **维护成本随文案线性增长**。每加一句文案就要改三个地方；
 * 3. **不覆盖动态内容**。节点名、数据标题这些**来自数据文件**的
 *    文本根本没法逐词登记。
 *
 * 现在改成**字符级转换**：简体原文 → 繁体全文。
 *
 * ⛔ 但**只转换中文**。英文、数字、标点、代码标识符原样保留——
 *    把 ``zh-TW`` 模式下的 ``JavaScript`` 转成 ``JavaScript``
 *    是零风险，把 ``i`` 转成 ``ｉ`` 就是灾难。
 *
 * 转换表
 * ------
 *
 * ``/data/s2t-chars.json``——由 OpenCC 的 ``s2t`` 规则生成，
 * 只收录**单字对单字**的真实映射（约 2600 条），由
 * ``scripts/build-s2t-table.mjs`` 生成。
 */

/** 单字映射表（懒加载）。 */
let table: Record<string, string> | null = null;

/** 正在加载的 Promise——避免并发重复 fetch。 */
let loading: Promise<Record<string, string>> | null = null;

/** 加载字符映射表。 */
export async function loadS2TTable(): Promise<Record<string, string>> {
  if (table) return table;
  if (!loading) {
    loading = fetch("/data/s2t-chars.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        table = data as Record<string, string>;
        return table;
      })
      .catch(() => {
        table = {};
        return table;
      });
  }
  return loading;
}

/**
 * 判断一个字符是否需要转换。
 *
 * ⛔ **只处理 CJK 统一表意文字**（U+4E00–U+9FFF）与扩展 A
 *    （U+3400–U+4DBF）。标点、假名、全角符号一律不动——
 *    把「，」转成「，」在视觉上几乎一样，但会让文本 diff 变脏。
 */
function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf)
  );
}

/**
 * 把一段简体文本转成繁体。
 *
 * 表还没加载完时**原样返回**——宁可让繁体模式晚半秒变成繁体，
 * 也不能让首屏闪一下错误的简体。
 */
export function toTraditional(
  text: string,
  map: Record<string, string> | null,
): string {
  if (!map || Object.keys(map).length === 0) return text;
  let out = "";
  for (const ch of text) {
    if (isCjk(ch)) {
      out += map[ch] ?? ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 当前已加载的表（同步读取）。
 *
 * 表加载完成后会广播 ``oe:s2t-ready`` 事件，组件据此刷新。
 */
export function currentS2TTable(): Record<string, string> | null {
  return table;
}

/** 表就绪事件名。 */
export const S2T_READY_EVENT = "oe:s2t-ready";

/**
 * 确保表已加载（幂等）。
 *
 * ⛔ **不要在渲染期直接 await 它**——那会让首屏多等一个网络往返。
 *    正确做法是应用启动时调一次，加载完广播事件，组件订阅刷新。
 */
export function ensureS2TTable(): void {
  if (table) return;
  void loadS2TTable().then(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(S2T_READY_EVENT));
    }
  });
}
