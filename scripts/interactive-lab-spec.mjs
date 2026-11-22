/**
 * 互动实验室参数推导（构建期版本）
 * =================================
 *
 * 这是 ``web/lib/interactive-lab.ts`` 的**构建期镜像**——两边逻辑
 * 必须一致，否则线上跑出来的玩具跟构建期写进数据的不一样。
 *
 * 为什么要有两份
 * --------------
 *
 * 前端那份带 TypeScript 类型、可以直接在组件里用；构建期这份是
 * 纯 ESM JavaScript，跑在 Node 里给 1555 集批量装配参数。
 *
 * 保持一致的方式：**逻辑逐行对应**，改动时两边一起改。
 */

/** 常见字——做不成「生字卡」的字。 */
const NON_CHARACTERS = new Set([
  "讲", "解", "课", "笔", "记", "同", "步", "精", "第", "一", "二", "三",
  "四", "五", "六", "上", "下", "册", "全", "集", "微", "视", "频", "教",
  "学", "堂", "育", "分", "析", "练", "习", "题", "库", "预", "复", "轮",
  "专", "选", "修", "必", "阅", "读", "写", "作", "叙", "文", "诗", "词",
  "古", "言", "现", "代", "小", "说", "赏", "背", "朗", "识", "单", "元",
  "园", "地", "积", "累", "快", "乐", "书", "吧", "语", "交", "流", "口",
]);

/** 教材里的**栏目名**——不是课文标题。 */
const SECTION_PREFIX =
  /^(识字|课文|生字|练习|口语|习作|语文园地|日积月累|快乐读书吧|口语交际|园地|单元|复习|测试|检测)/;

/**
 * 「X 首」型的**合辑栏目名**——「古代诗歌四首」是四首诗的合集，
 * 不是一篇课文。切分句会产出「古代诗歌四 / 首」这种垃圾。
 */
const ANTHOLOGY_SUFFIX = /[诗词]?[一二三四五六七八九十\d]{1,3}首$/;

/**
 * 抽取课时的**核心课文名**。
 */
export function coreLessonTitle(title) {
  const cleaned = String(title ?? "")
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/《[^》]*》/g, " ")
    .replace(/「[^」]*」/g, " ")
    .replace(/[【】[\]（）()《》「」]/g, " ")
    .replace(/^\s*\d{1,3}\s*[.、,，:：]\s*/g, " ")
    .replace(/第\s*[一二三四五六七八九十\d]{1,3}\s*集/g, " ")
    .replace(/第\s*[一二三四五六七八九十\d]{1,3}\s*单元/g, " ")
    .replace(/第\s*[一二三四五六七八九十\d]{1,3}\s*[课讲]/g, " ")
    .replace(/单元\s*\d{1,3}/g, " ")
    .replace(/[一二三四五六七八九十\d]{1,2}\s*[上下]\s*[\d一二三四五六七八九十]{0,2}\s*/g, " ")
    .replace(/(\p{Script=Han})\s*\d{1,3}(?![\u4e00-\u9fa5])/gu, "$1")
    .replace(/讲解|精讲|微课|同步课|同步|复习|导读|分析|赏析|背诵|朗读/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  // 标题被写了两遍（「第 1集 我是中国人 第 1集 我是中国人」）→ 只留一份。
  if (parts.length >= 2) {
    for (let half = 1; half <= Math.floor(parts.length / 2); half += 1) {
      const front = parts.slice(0, half).join("");
      const back = parts.slice(half).join("");
      if (front && front === back) {
        return parts[half - 1] ?? cleaned;
      }
    }
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const hanCount = (part.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    if (hanCount < 2) continue;
    if (SECTION_PREFIX.test(part)) continue;
    return part;
  }

  // 兜底：整个标题都被剥光了（比如「01.第一单元导读」）——
  // 返回**原始标题**，别返回空串。
  return parts[parts.length - 1] || String(title ?? "").trim() || cleaned;
}

/** 从课时标题里抽生字候选（2–4 个）。 */
export function extractHanziCandidates(title) {
  const core = coreLessonTitle(title);
  const runs = core.match(/[\u4e00-\u9fa5]+/g) ?? [];
  const out = [];
  const seen = new Set();

  for (const run of runs) {
    for (const char of run) {
      if (NON_CHARACTERS.has(char)) continue;
      if (seen.has(char)) continue;
      seen.add(char);
      out.push(char);
      if (out.length >= 4) return out;
    }
  }
  return out;
}

/** 标题像不像古诗 / 课文。 */
export function looksLikePoem(title) {
  const text = String(title ?? "");
  if (/古诗|唐诗|宋词|诗歌|诗词/.test(text)) return true;

  const core = coreLessonTitle(text);
  if (!core) return false;
  if (SECTION_PREFIX.test(core)) return false;
  if (ANTHOLOGY_SUFFIX.test(core)) return false;
  return /^[\u4e00-\u9fa5]{4,10}$/.test(core);
}

/** 把一段古诗拆成分句。 */
export function splitPoemSegments(text) {
  const core = coreLessonTitle(String(text ?? ""));

  if (ANTHOLOGY_SUFFIX.test(core)) return [];

  const cleaned = core
    .replace(/[，。！？；、,.!?;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const byPunctuation = cleaned
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (byPunctuation.length >= 2) return byPunctuation;

  const segments = [];
  let buffer = "";
  for (const char of cleaned) {
    buffer += char;
    const shouldBreak =
      (buffer.length === 5 && /[\u4e00-\u9fa5]/.test(char)) ||
      (buffer.length === 7 && /[\u4e00-\u9fa5]/.test(char));
    if (shouldBreak) {
      segments.push(buffer);
      buffer = "";
    }
  }
  if (buffer) segments.push(buffer);
  return segments;
}

/**
 * 根据课时标题 + 学科 + 学段，自动匹配一个互动玩具。
 */
export function autoPickLab(title, subject, stage) {
  const text = String(title ?? "");
  const core = coreLessonTitle(text);

  if (subject === "chinese") {
    const chars = extractHanziCandidates(text);
    const segments = looksLikePoem(text) ? splitPoemSegments(text) : [];

    if (segments.length >= 2) {
      return {
        kind: "poem",
        title: "分句图解",
        segments,
        notes: segments.slice(0, 4).map((term) => ({
          term,
          plain: "这一句是本段的核心意象——先读懂它在说什么，再看整段的意思。",
          en: "Read this line for the key image, then read the whole passage.",
        })),
      };
    }

    return {
      kind: "hanzi",
      title: "笔顺描红",
      chars: chars.length >= 1 ? chars : ["学", "习"],
      pinyin: chars.length >= 1 ? chars.map(() => "") : ["xué", "xí"],
    };
  }

  if (stage === "primary") {
    if (/分数|几分之|除法|平均分/.test(core)) {
      return { kind: "fraction", title: "分数 · 披萨切分", slices: 8, target: 8 };
    }
    if (/对称|平移|旋转|轴对称/.test(core)) {
      return { kind: "symmetry", title: "对称 · 平移互动板", shape: "triangle" };
    }
    return { kind: "blocks", title: "凑十 · 方块拼接", target: 10 };
  }

  if (/二次函数|抛物线|顶点/.test(core)) {
    return { kind: "function", title: "函数图像动态", fn: "quadratic" };
  }
  if (/一次函数|正比例|反比例|斜率/.test(core)) {
    return { kind: "function", title: "函数图像动态", fn: "linear" };
  }
  if (/三角函数|正弦|余弦|正切/.test(core)) {
    return { kind: "function", title: "函数图像动态", fn: "trig" };
  }
  return { kind: "geometry", title: "动态几何" };
}
