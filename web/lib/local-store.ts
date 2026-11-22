/**
 * 本地持久化
 * =========
 *
 * 纯静态模式下**所有**用户数据都存在浏览器 ``localStorage`` 里。
 *
 * 存什么
 * ------
 *
 * ==========================  ==================================
 * 数据                        键名
 * ==========================  ==================================
 * 个人档案（昵称、头像、地区）   ``dreamclass.profile``
 * 笔记批注（带时间戳）          ``dreamclass.notes.<课程 id>``
 * 观看进度                    ``dreamclass.progress.<课程 id>``
 * 对话记录                    ``dreamclass.session.<会话 id>``
 * 随堂测验结果                ``dreamclass.quiz.<课程 id>``
 * 证书                       ``dreamclass.certificates``
 * 学习计划                    ``dreamclass.plans`
 * DeepSeek API Key           ``dreamclass.deepseek.key``
 * ==========================  ==================================
 *
 * 为什么不用 IndexedDB
 * --------------------
 *
 * localStorage 够用：数据量小（几 MB 以内）、需要**同步**读写
 * （保存后立刻要能读出来）、API 简单。
 *
 * 唯一缺点是容量限制（约 5MB）。而课程数据本身**不在**这里——
 * 它在静态 JSON 里。这里只放用户**自己产生**的东西。
 *
 * 写入策略
 * --------
 *
 * **同步**写入（不是防抖异步）——因为用户可能**立刻**关掉页面。
 * 异步写入的话，最后几毫秒的输入就丢了。
 *
 * 但写入前会先检查**配额**，避免 QuotaExceededError 把整个函数炸掉。
 */

/** 存储键的统一前缀。 */
const PREFIX = "dreamclass";

/** 各类数据的键。 */
export const StorageKeys = {
  profile: `${PREFIX}.profile`,
  certificates: `${PREFIX}.certificates`,
  deepseekKey: `${PREFIX}.deepseek.key`,
  notes: (courseId: string) => `${PREFIX}.notes.${courseId}`,
  progress: (courseId: string) => `${PREFIX}.progress.${courseId}`,
  session: (sessionId: string) => `${PREFIX}.session.${sessionId}`,
  quiz: (courseId: string) => `${PREFIX}.quiz.${courseId}`,
  plans: (courseId: string) => `${PREFIX}.plans.${courseId}`,
  /**
   * 「先猜后看」的作答记录。
   *
   * 为功能 4「顿悟卡片」预留——那时这些记录会汇总成个人知识脉络图。
   * 键名**不带课程 id**：跨课程的直觉记录放在一起，才能画出
   * 跨学科的技能脉络。
   */
  predictHooks: `${PREFIX}.predict-hooks`,
} as const;

/**
 * localStorage 是否可用。
 *
 * 隐私模式、无痕窗口、某些浏览器设置下访问 ``localStorage`` 会
 * **抛异常**（不是返回 null）。所以连访问本身都要包在 try 里。
 */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__seek_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 读一个 JSON 值。
 *
 * 读不出来（不存在 / 解析失败）时返回 ``fallback``——**不抛错**。
 * 损坏的本地数据不该让整个页面白屏。
 */
export function readLocal<T>(key: string, fallback: T): T {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/**
 * 写一个 JSON 值。
 *
 * @returns 是否写成功。配额满了会返回 ``false``——调用方可以据此
 *          给用户一个「空间不足」的提示，而不是静默丢数据。
 */
export function writeLocal(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // 配额满了。试着腾点空间——清掉最旧的会话记录。
    try {
      evictOldestSessions(store);
      store.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 删一个键。
 */
export function removeLocal(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

/**
 * 清掉**最旧的**若干条会话记录。
 *
 * 只在配额满了时调用。会话记录是**最不关键**的数据——笔记、进度、
 * 证书都不能删，会话可以。
 */
function evictOldestSessions(store: Storage): void {
  const sessionKeys: Array<{ key: string; at: number }> = [];

  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key || !key.startsWith(`${PREFIX}.session.`)) continue;
    const raw = store.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const messages = Array.isArray(parsed) ? parsed : [];
      const last = messages[messages.length - 1];
      sessionKeys.push({
        key,
        at: Number(last?.created_at ?? 0) || 0,
      });
    } catch {
      sessionKeys.push({ key, at: 0 });
    }
  }

  // 从最旧开始删，删到只剩一半。
  sessionKeys.sort((a, b) => a.at - b.at);
  const toRemove = Math.max(1, Math.floor(sessionKeys.length / 2));
  for (let index = 0; index < toRemove && index < sessionKeys.length; index += 1) {
    store.removeItem(sessionKeys[index].key);
  }
}

/**
 * 统计本地占用了多少字节。
 *
 * 给「个人中心」显示——让用户知道还剩多少空间。
 */
export function localUsage(): { bytes: number; entries: number } {
  const store = storage();
  if (!store) return { bytes: 0, entries: 0 };
  let bytes = 0;
  let entries = 0;
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key || !key.startsWith(PREFIX)) continue;
      const value = store.getItem(key) ?? "";
      bytes += key.length + value.length;
      entries += 1;
    }
  } catch {
    /* 忽略 */
  }
  return { bytes, entries };
}

/**
 * 导出全部本地数据——「导出我的学习档案」。
 *
 * 静态模式下这是**唯一**的导出途径（没有服务端副本）。
 */
export function exportAllLocal(): Record<string, unknown> {
  const store = storage();
  const out: Record<string, unknown> = {};
  if (!store) return out;
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key || !key.startsWith(PREFIX)) continue;
      const raw = store.getItem(key);
      if (raw === null) continue;
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    }
  } catch {
    /* 忽略 */
  }
  return out;
}

/**
 * 从导出的档案恢复。
 *
 * @returns 恢复了多少个键
 */
export function importAllLocal(payload: Record<string, unknown>): number {
  const store = storage();
  if (!store) return 0;
  let count = 0;
  for (const [key, value] of Object.entries(payload)) {
    // 只接受本平台自己的键——不要让导入文件覆盖别的东西。
    if (!key.startsWith(PREFIX)) continue;
    try {
      store.setItem(key, JSON.stringify(value));
      count += 1;
    } catch {
      /* 配额满——跳过这一条 */
    }
  }
  return count;
}
