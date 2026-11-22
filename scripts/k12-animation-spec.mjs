/**
 * 动画短课系列规格（方案 C）
 * ========================
 *
 * 现有 24 套系列用的是「成套录播长课」——中位数每集 **19 分钟**。
 * 方案 C 要的是「**先看 3–8 分钟精品动画，再动手玩 2 分钟互动动画**」。
 *
 * 所以这里定义**一套新的搜索策略**：
 *
 * - **小学部**：优先「数学动画课堂」「趣味动画学」「动画微课」——
 *   这些是真正的**动画化**内容，单集 3–6 分钟；
 * - **初高中部**：优先「可视化动画讲解」「洋葱风格」「名师精讲短课」——
 *   节奏紧凑的单集 6–12 分钟；
 * - **语文**：优先「动画微课」「象形字动画」「古诗动画」「课文动画」——
 *   识字 / 写字 / 古诗都有现成的动画系列。
 *
 * 与 :mod:`k12-series-spec.mjs` 的关系
 * ----------------------------------
 *
 * 那一份是**兜底**：保证 24 套系列**永远不为空**。
 * 这一份是**首选**：在有动画源时用动画源。
 *
 * 采集器（``harvest-k12.mjs``）会**先试这一份**，全都不合格才
 * 回落到长课源。
 */

/** 小学部动画关键词——按优先级。 */
const PRIMARY_ANIMATION = {
  chinese: [
    "小学语文 动画微课 同步",
    "部编版 小学语文 课文动画 同步",
    "小学语文 象形字 动画 汉字",
    "小学语文 古诗 动画 讲解",
    "动画 汉字笔顺 同步 课文",
  ],
  math: [
    "小学数学 动画课堂 同步 全套",
    "小学数学 趣味动画学 同步",
    "人教版 小学数学 动画 同步",
    "小学数学 动画微课 1-6年级",
    "小学数学 看动画学 同步课程",
  ],
};

/** 初中部动画 / 精讲关键词。 */
const JUNIOR_ANIMATION = {
  chinese: [
    "初中语文 可视化 动画 导读",
    "部编版 初中语文 名师精讲 短课",
    "初中文言文 动画 讲解",
    "初中语文 动画 微课 同步",
  ],
  math: [
    "初中数学 可视化 动画 讲解",
    "初中数学 洋葱 风格 动画",
    "人教版 初中数学 精讲 短课 同步",
    "初中数学 动画 微课 一数体系",
  ],
};

/** 高中部动画 / 精讲关键词。 */
const SENIOR_ANIMATION = {
  chinese: [
    "高中语文 现代文 动画 导读",
    "高中语文 名师精讲 短课 同步",
    "高中语文 动画 微课 古诗文",
  ],
  math: [
    "高中数学 可视化 动画 讲解",
    "高中数学 洋葱 动画 同步",
    "人教A版 高中数学 精讲 短课",
    "高中数学 函数 动画 图象 讲解",
  ],
};

/**
 * 组装 24 套系列的**动画关键词**矩阵。
 *
 * @returns 与 ``k12-series-spec.mjs`` 同序的数组
 */
export function animationKeywords() {
  const out = [];

  for (let grade = 1; grade <= 6; grade += 1) {
    out.push({
      id: `k12_chinese_g${grade}`,
      grade,
      subject: "chinese",
      keywords: PRIMARY_ANIMATION.chinese.map(
        (base) => `${grade === 1 ? "一年级" : `${["一", "二", "三", "四", "五", "六"][grade - 1]}年级`} ${base}`,
      ),
    });
    out.push({
      id: `k12_math_g${grade}`,
      grade,
      subject: "math",
      keywords: PRIMARY_ANIMATION.math.map(
        (base) => `${grade === 1 ? "一年级" : `${["一", "二", "三", "四", "五", "六"][grade - 1]}年级`} ${base}`,
      ),
    });
  }

  const juniorGrade = ["初一", "初二", "初三"];
  for (let grade = 7; grade <= 9; grade += 1) {
    out.push({
      id: `k12_chinese_g${grade}`,
      grade,
      subject: "chinese",
      keywords: JUNIOR_ANIMATION.chinese.map(
        (base) => `${juniorGrade[grade - 7]} ${base}`,
      ),
    });
    out.push({
      id: `k12_math_g${grade}`,
      grade,
      subject: "math",
      keywords: JUNIOR_ANIMATION.math.map(
        (base) => `${juniorGrade[grade - 7]} ${base}`,
      ),
    });
  }

  const seniorGrade = ["高一", "高二", "高三"];
  for (let grade = 10; grade <= 12; grade += 1) {
    out.push({
      id: `k12_chinese_g${grade}`,
      grade,
      subject: "chinese",
      keywords: SENIOR_ANIMATION.chinese.map(
        (base) => `${seniorGrade[grade - 10]} ${base}`,
      ),
    });
    out.push({
      id: `k12_math_g${grade}`,
      grade,
      subject: "math",
      keywords: SENIOR_ANIMATION.math.map(
        (base) => `${seniorGrade[grade - 10]} ${base}`,
      ),
    });
  }

  return out;
}

/**
 * 动画源的**时长上限**（秒）。
 *
 * 超过这个长度的候选**一律拒绝**——方案 C 的核心是「短」。
 */
export const MAX_DURATION = {
  primary: 8 * 60,
  junior: 12 * 60,
  senior: 15 * 60,
};

/**
 * 动画源的**时长下限**（秒）。
 *
 * 太短说明只是片段或预告，没有教学价值。
 */
export const MIN_DURATION = 60;

/**
 * 判断一个候选是不是**动画源**。
 *
 * @param title    视频标题
 * @param duration 时长（秒）
 * @param stage    学段
 */
export function isAnimationCandidate(
  title,
  duration,
  stage,
) {
  const text = String(title ?? "");

  // 必须有动画 / 动画化的关键词。
  const hasAnimation =
    /动画|动漫|动画课|动画课堂|动画微课|看动画/.test(text) ||
    /趣味|可视化|图解|微课/.test(text);

  if (!hasAnimation) return false;

  // 时长在「短课」区间内。
  if (duration < MIN_DURATION) return false;
  if (duration > MAX_DURATION[stage]) return false;

  return true;
}
