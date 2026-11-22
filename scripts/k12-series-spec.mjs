/**
 * K12 系列规格
 * ============
 *
 * 24 套年级系列（12 年级 × 语文 / 数学）的**唯一权威清单**。
 *
 * 每套系列定义了：
 *
 * - ``keywords`` —— B 站搜索关键词（按优先级）。首选是**成套的
 *   同步课**（「全 56 集」「全套」这类），因为它们原生带分 P，
 *   拆出来的每一集都是真实的课时；
 * - ``youtubeKeywords`` —— YouTube 搜索关键词，作为海外 / 双源互备。
 *
 * 为什么把搜索关键词写死在这里
 * ----------------------------
 *
 * 自动搜索会返回一堆「奥数思维」「速算技巧」「网课搬运」——它们
 * **不是**教材同步课。所以「哪套是权威同步课」必须由人指定，
 * 机器只负责**找到并拆分**。
 */

/**
 * 小学语文（部编版）。
 *
 * 关键词里的「课文朗读 / 同步」优先命中**分 P 成套课**——
 * 那种课一集一个单元/一课，读起来也最连贯。
 */
const PRIMARY_CHINESE = [
  { grade: 1, keywords: ["部编版 小学语文 一年级上册 同步 课文朗读 全集", "人教版 小学语文 一年级下册 同步精讲 全集"], youtubeKeywords: ["小学语文 一年级 课文朗读 同步"] },
  { grade: 2, keywords: ["部编版 小学语文 二年级上册 同步 课文朗读 全集", "小学语文 二年级下册 同步精讲 全集"], youtubeKeywords: ["小学语文 二年级 同步"] },
  { grade: 3, keywords: ["部编版 小学语文 三年级上册 同步 课文朗读 全集", "小学语文 三年级下册 同步精讲 全集"], youtubeKeywords: ["小学语文 三年级 同步"] },
  { grade: 4, keywords: ["部编版 小学语文 四年级上册 同步 课文朗读 全集", "小学语文 四年级下册 同步精讲 全集"], youtubeKeywords: ["小学语文 四年级 同步"] },
  { grade: 5, keywords: ["部编版 小学语文 五年级上册 同步 课文朗读 全集", "小学语文 五年级下册 同步精讲 全集"], youtubeKeywords: ["小学语文 五年级 同步"] },
  { grade: 6, keywords: ["部编版 小学语文 六年级上册 同步 课文朗读 全集", "小学语文 六年级下册 同步精讲 全集"], youtubeKeywords: ["小学语文 六年级 同步"] },
];

/** 小学数学（人教版）。 */
const PRIMARY_MATH = [
  { grade: 1, keywords: ["人教版 小学数学 一年级上册 同步 全套", "小学数学 一年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["小学数学 一年级 人教版 同步"] },
  { grade: 2, keywords: ["人教版 小学数学 二年级上册 同步 全套", "小学数学 二年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["小学数学 二年级 人教版 同步"] },
  { grade: 3, keywords: ["人教版 小学数学 三年级上册 同步 全套", "小学数学 三年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["小学数学 三年级 人教版 同步"] },
  { grade: 4, keywords: ["人教版 小学数学 四年级上册 同步 全套", "小学数学 四年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["小学数学 四年级 人教版 同步"] },
  { grade: 5, keywords: ["人教版 小学数学 五年级上册 同步 全套", "小学数学 五年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["小学数学 五年级 人教版 同步"] },
  { grade: 6, keywords: ["人教版 小学数学 六年级上册 同步 全套", "小学数学 六年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["小学数学 六年级 人教版 同步"] },
];

/** 初中语文（部编版）。 */
const JUNIOR_CHINESE = [
  { grade: 7, keywords: ["部编版 初一 语文 上册 同步 全套", "初中语文 七年级下册 部编版 同步精讲 全集"], youtubeKeywords: ["初一语文 同步 讲解"] },
  { grade: 8, keywords: ["部编版 初二 语文 上册 同步 全套", "初中语文 八年级下册 部编版 同步精讲 全集"], youtubeKeywords: ["初二语文 同步 讲解"] },
  { grade: 9, keywords: ["部编版 初三 语文 上册 同步 全套", "初中语文 九年级中考 复习 精讲 全集"], youtubeKeywords: ["初三语文 中考 复习 讲解"] },
];

/** 初中数学（人教版）。 */
const JUNIOR_MATH = [
  { grade: 7, keywords: ["人教版 初一 数学 上册 同步 全套", "初中数学 七年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["初一数学 人教版 同步"] },
  { grade: 8, keywords: ["人教版 初二 数学 上册 同步 全套", "初中数学 八年级下册 人教版 同步精讲 全集"], youtubeKeywords: ["初二数学 人教版 同步"] },
  { grade: 9, keywords: ["人教版 初三 数学 上册 同步 全套", "初中数学 九年级中考 复习 精讲 全集"], youtubeKeywords: ["初三数学 中考 复习"] },
];

/** 高中语文（统编版）。 */
const SENIOR_CHINESE = [
  { grade: 10, keywords: ["统编版 高一 语文 必修上册 同步 全套", "高中语文 高一 同步 精讲 全集"], youtubeKeywords: ["高一语文 同步"] },
  { grade: 11, keywords: ["统编版 高二 语文 选择性必修 同步 全套", "高中语文 高二 同步 精讲 全集"], youtubeKeywords: ["高二语文 同步"] },
  { grade: 12, keywords: ["统编版 高三 语文 高考 一轮复习 精讲 全套", "高中语文 高三 复习 专题 讲解 全集"], youtubeKeywords: ["高三语文 高考 复习"] },
];

/** 高中数学（人教 A 版）。 */
const SENIOR_MATH = [
  { grade: 10, keywords: ["人教A版 高一数学 必修一 同步 全集", "高中数学 高一 必修 同步精讲 全集"], youtubeKeywords: ["高一数学 人教A版 同步"] },
  { grade: 11, keywords: ["人教A版 高二数学 选择性必修 同步 全集", "高中数学 高二 同步精讲 全集"], youtubeKeywords: ["高二数学 人教A版 同步"] },
  { grade: 12, keywords: ["人教A版 高三数学 一轮复习 精讲 全集", "高中数学 高三 复习专题 全套"], youtubeKeywords: ["高三数学 高考 复习"] },
];

/** 册次——小学 / 初中分上下册，高中按必修册。 */
function volumesFor(grade) {
  if (grade <= 9) return ["上册", "下册"];
  if (grade === 10) return ["必修一", "必修二"];
  if (grade === 11) return ["选择性必修一", "选择性必修二"];
  return ["一轮复习", "二轮专题"];
}

/**
 * 组装全部 24 套系列。
 *
 * @param {Array} rows    ``{grade, keywords, youtubeKeywords}`` 列表
 * @param {string} subject 学科
 */
function build(rows, subject) {
  return rows.map((row) => {
    const stagePrefix =
      row.grade <= 6 ? "小学" : row.grade <= 9 ? "初中" : "高中";
    const gradeName =
      row.grade <= 6
        ? ["", "一", "二", "三", "四", "五", "六"][row.grade]
        : row.grade <= 9
          ? ["", "", "", "", "", "", "", "七", "八", "九"][row.grade]
          : ["", "", "", "", "", "", "", "", "", "", "高一", "高二", "高三"][row.grade];

    return {
      id: `k12_${subject}_g${row.grade}`,
      grade: row.grade,
      subject,
      title: `${stagePrefix}${gradeName}年级${
        subject === "chinese" ? "语文" : "数学"
      }`,
      volumes: volumesFor(row.grade),
      keywords: row.keywords,
      youtubeKeywords: row.youtubeKeywords,
    };
  });
}

/** 全部 24 套系列。 */
export const SERIES = [
  ...build(PRIMARY_CHINESE, "chinese"),
  ...build(PRIMARY_MATH, "math"),
  ...build(JUNIOR_CHINESE, "chinese"),
  ...build(JUNIOR_MATH, "math"),
  ...build(SENIOR_CHINESE, "chinese"),
  ...build(SENIOR_MATH, "math"),
];
