/**
 * K12 骨架
 * ========
 *
 * 「学段 × 年级 × 年龄」三层权威分类。
 *
 * 为什么把骨架写成**代码**而不是数据文件
 * ------------------------------------
 *
 * 因为骨架是**平台的骨架**——分类法、路由、界面筛选器、证书文案、
 * 搜索索引共同依赖的那一份约定。如果它散落在几个 JSON 里，几轮改动
 * 之后它们就会**互相漂移**（比如前端说有 24 套，后端只认 22 套）。
 *
 * 所以这里用**单一数据源**定义，年级、学段、年龄、教材版本、
 * 搜索关键词全部从它派生。
 *
 * 前端不直接 import 这个文件——它读的是采集器产出的
 * ``backend/data/k12/k12_series.json``（``web/lib/k12.ts`` 里的类型
 * 与本文件一一对应）。这样前端不需要跑 Node 脚本也能拿到骨架。
 */

/** 学段。 */
export const STAGES = [
  {
    id: "primary",
    name: "小学部",
    enName: "Primary",
    gradeRange: [1, 6],
    playful: true,
  },
  {
    id: "junior",
    name: "初中部",
    enName: "Junior High",
    gradeRange: [7, 9],
    playful: false,
  },
  {
    id: "senior",
    name: "高中部",
    enName: "Senior High",
    gradeRange: [10, 12],
    playful: false,
  },
];

/**
 * 12 个年级的权威定义。
 *
 * 年龄区间按国内义务教育 / 普通高中通行口径：
 *
 * - 小学 6–12 岁（一年级 6–7 … 六年级 11–12）；
 * - 初中 12–15 岁（初一 12–13 … 初三 14–15）；
 * - 高中 15–18 岁（高一 15–16 … 高三 17–18）。
 */
export const GRADES = [
  { number: 1, name: "一年级", alias: "小学一年级", ageRange: [6, 7], stage: "primary" },
  { number: 2, name: "二年级", alias: "小学二年级", ageRange: [7, 8], stage: "primary" },
  { number: 3, name: "三年级", alias: "小学三年级", ageRange: [8, 9], stage: "primary" },
  { number: 4, name: "四年级", alias: "小学四年级", ageRange: [9, 10], stage: "primary" },
  { number: 5, name: "五年级", alias: "小学五年级", ageRange: [10, 11], stage: "primary" },
  { number: 6, name: "六年级", alias: "小学六年级", ageRange: [11, 12], stage: "primary" },
  { number: 7, name: "七年级", alias: "初一", ageRange: [12, 13], stage: "junior" },
  { number: 8, name: "八年级", alias: "初二", ageRange: [13, 14], stage: "junior" },
  { number: 9, name: "九年级", alias: "初三", ageRange: [14, 15], stage: "junior" },
  { number: 10, name: "高一", alias: "高中一年级", ageRange: [15, 16], stage: "senior" },
  { number: 11, name: "高二", alias: "高中二年级", ageRange: [16, 17], stage: "senior" },
  { number: 12, name: "高三", alias: "高中三年级", ageRange: [17, 18], stage: "senior" },
];

/** 两大核心学科——**全学段统一**。 */
export const SUBJECTS = [
  {
    id: "chinese",
    name: "语文",
    enName: "Chinese Language",
    edition: "国家统编版（部编版）",
    editionEn: "National Unified Edition",
  },
  {
    id: "math",
    name: "数学",
    enName: "Mathematics",
    edition: "人教版（高中人教 A 版）",
    editionEn: "PEP Edition",
  },
];

/** 年级 → 元信息。 */
export function gradeOf(number) {
  const found = GRADES.find((item) => item.number === number);
  if (!found) throw new Error(`未知年级：${number}`);
  return found;
}

/** 学科 → 元信息。 */
export function subjectOf(id) {
  const found = SUBJECTS.find((item) => item.id === id);
  if (!found) throw new Error(`未知学科：${id}`);
  return found;
}

/** 学段 → 元信息。 */
export function stageOf(id) {
  const found = STAGES.find((item) => item.id === id);
  if (!found) throw new Error(`未知学段：${id}`);
  return found;
}

/** 供 UI 用的「年级 + 年龄」标签。 */
export function gradeLabel(number) {
  const grade = gradeOf(number);
  return `${grade.name}（${grade.ageRange[0]}–${grade.ageRange[1]}岁）`;
}

/**
 * 一套系列的**完整中文名**。
 *
 * 例：``小学四年级数学（上册+下册）人教版同步精讲``。
 *
 * 这个名字会同时出现在课程目录页、诊断卡、结业证书上——所以它必须
 * **一眼说清**：学段 / 年级 / 学科 / 册次 / 教材版本。
 */
export function seriesTitle(spec) {
  const grade = gradeOf(spec.grade);
  const subject = subjectOf(spec.subject);
  const stagePrefix =
    grade.stage === "primary"
      ? "小学"
      : grade.stage === "junior"
        ? "初中"
        : "高中";
  const volume = spec.volumes.join("+");
  const editionName = subject.id === "chinese" ? "部编版" : "人教版";
  return `${stagePrefix}${grade.name}${subject.name}（${volume}）${editionName}同步精讲`;
}
