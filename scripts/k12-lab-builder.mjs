/**
 * K12 互动实验室分派
 * ======================
 *
 * 按**学段 + 学科 + 真实知识点**分派互动实验室的类型与参数。
 *
 * 硬红线
 * ------
 *
 * **初高中语文绝不出现「笔顺描红」**——那是小学的东西。
 * 初高中语文只配「名篇精读与意象赏析台」。
 *
 * 小学数学配**真实教具**（数轴、凑十方块、分数披萨、面积方格、
 * 图形平移对称）；初高中数学配**动态函数图像与几何**。
 */

import { matchPoem } from "./k12-knowledge-poems.mjs";
import { matchClassic } from "./k12-knowledge-classics.mjs";
import {
  findMathTopic,
  stripTrailingIndex,
  stripPageSuffix,
} from "./k12-content-kit.mjs";
import { PINYIN_TABLE } from "./k12-hanzi-pinyin-table.mjs";
import {
  matchPrimaryChinesePoint,
  matchJuniorChinesePoint,
  matchSeniorChinesePoint,
} from "./k12-knowledge-chinese.mjs";

/**
 * 按学段与知识点分派互动实验室。
 *
 * @param subject 学科
 * @param stage   学段
 * @param coreTitle 核心课名
 * @param fullTitle 完整课时标题
 */
export function buildInteractiveLab({ subject, stage, coreTitle, fullTitle, grade = 1 }) {
  if (subject === "chinese") {
    if (stage === "primary") {
      // 「汉语拼音13」「语文园地三1」——尾部序号是分集标记，先去掉。
      const cnTitle = stripTrailingIndex(coreTitle);
      const poem = matchPoem(cnTitle, fullTitle);
      const point = matchPrimaryChinesePoint(cnTitle, fullTitle);
      const chars = pickChars(cnTitle, point, grade ?? 1);
      const pinyin = chars.map((char) => PINYIN_TABLE[char] ?? "");
      return {
        kind: "hanzi",
        title: poem ? `《${poem.title}》核心生字笔顺` : "课文核心生字笔顺",
        chars,
        pinyin,
        poem: poem
          ? {
              title: poem.title,
              author: poem.author,
              dynasty: poem.dynasty,
              lines: poem.lines,
              plain: poem.plain,
              en: poem.en,
            }
          : null,
        // Module 5 · 语文真实文化互动台（小学段 = 笔顺 + 字源）。
        culture: {
          stage: "primary",
          workTitle: poem?.title,
          author: poem?.author,
          dynasty: poem?.dynasty,
          excerpt: poem?.plain?.join("") ?? "",
          etymology: chars.map((char) => ({
            char,
            glyph: `「${char}」的甲骨文字形`,
            story: `「${char}」在甲骨文中多以象形手法描摹其本义；进入金文与小篆后，字形逐渐规整为线条，隶楷之间进一步定型为今天的样子。形在变，而它承载的语义线索被保留了下来。`,
          })),
        },
      };
    }

    // 初高中语文 → 名篇精读与意象赏析台（**不含笔顺描红**）。
    const cnTitle = stripTrailingIndex(coreTitle);
    const classic = matchClassic(cnTitle, fullTitle);
    const point =
      stage === "junior"
        ? matchJuniorChinesePoint(cnTitle, fullTitle)
        : matchSeniorChinesePoint(cnTitle, fullTitle);
    // ⛔ 初高中语文**只用**名篇精读台——**绝不出现笔顺描红**。
    //
    // 名篇有原文时用原文；没有原文时，用**本课考点**生成一个
    // 「关键词赏析 + 思考题」版本——仍然紧扣这一课，
    // 而不是放一个空壳。
    const cnTitle2 = cnTitle;
    const fallbackExcerpt = point
      ? `本讲的核心是「${point.concept}」。\n\n${point.explanation}`
      : `本讲围绕「${cnTitle2}」展开。请结合视频中的原文，精读本课的关键段落与语句，并完成下方的思考题。`;

    const fallbackKeywords = point
      ? [
          {
            term: point.concept,
            device: "考点聚焦",
            meaning: point.explanation,
            plain: point.explanation.length > 60
              ? `${point.explanation.slice(0, 60)}……`
              : point.explanation,
          },
        ]
      : [
          {
            term: cnTitle2,
            device: "本讲主题",
            meaning:
              "这是本讲围绕的核心文本。回到视频中定位它的关键段落，注意作者是怎么写的。",
            plain: "回到原文，读出作者的态度与写法。",
          },
        ];

    return {
      kind: "literary",
      title: classic
        ? `《${classic.title}》名篇精读与意象赏析`
        : `${cnTitle2}·名篇精读与意象赏析`,
      classic: {
        title: classic?.title ?? cnTitle2,
        author: classic?.author ?? "本讲课文",
        excerpt: classic?.excerpt ?? fallbackExcerpt,
        keywords: classic?.keywords?.length
          ? classic.keywords
          : fallbackKeywords,
        question: classic?.question ?? point?.question ?? "",
        answer: classic?.answer ?? point?.explanation ?? "",
      },
      point: point
        ? {
            concept: point.concept,
            question: point.question,
            options: point.options,
            correctIndex: point.correctIndex,
            explanation: point.explanation,
          }
        : null,
      // Module 5 · 语文真实文化互动台（初高中段 = 经典精读，**无描红**）。
      culture: {
        stage,
        workTitle: classic?.title ?? cnTitle2,
        author: classic?.author ?? "本讲课文",
        dynasty: classic?.dynasty,
        excerpt: classic?.excerpt ?? fallbackExcerpt,
        keywords: classic?.keywords?.length
          ? classic.keywords
          : fallbackKeywords,
      },
    };
  }

  // 数学。
  const topic = findMathTopic(stripPageSuffix(coreTitle), fullTitle);
  const kind = pickMathLabKind(topic, coreTitle);
  const params = mathLabParams(kind, topic);

  return {
    kind,
    title: topic ? `${topic.title}·互动教具` : `${coreTitle}·互动教具`,
    mathTopic: topic
      ? { key: topic.key, title: topic.title, definition: topic.definition }
      : null,
    params,
    // Module 5 · GitHub 开源教具的配置。
    ...(MANIPULATIVE_KINDS.has(kind)
      ? {
          manipulative: {
            kind,
            angle: params.angle,
            slope: params.slope,
            intercept: params.intercept,
            fnType: params.fnType,
            data: params.data,
            target: params.target,
            parts: params.parts,
            start: params.start,
            step: params.step,
            leftWeights: params.leftWeights,
            rightWeights: params.rightWeights,
          },
        }
      : {}),
  };
}

/** Module 5 的七类数学教具。 */
const MANIPULATIVE_KINDS = new Set([
  "protractor",
  "functionLab",
  "chartLab",
  "decimalBlocks",
  "fractionDisc",
  "numberLine",
  "balanceScale",
]);

/** 数学实验室的教具类型——按真实知识点分派。 */
export function pickMathLabKind(topic, coreTitle) {
  if (topic) {
    const key = topic.key;

    /* ── Module 5 · 精确匹配到 GitHub 开源教具 ── */

    // 角与测量 → **动态量角器**（可旋转、实时读数、校验度数）。
    if (
      key.includes("角的度量") ||
      key.includes("角的分类") ||
      key.includes("线段、直线、射线与角")
    ) {
      return "protractor";
    }

    // 统计与数据 → **互动统计图表台**（recharts，增删数据实时联动）。
    if (
      key.includes("统计") ||
      key.includes("数据的收集与整理") ||
      key.includes("数据的分析") ||
      key.includes("条形统计图") ||
      key.includes("扇形统计图") ||
      key.includes("平均数") ||
      key.includes("中位数") ||
      key.includes("众数")
    ) {
      return "chartLab";
    }

    // 函数与图象 → **实时函数坐标系实验室**（mafs 范式）。
    if (
      key.includes("函数") ||
      key.includes("反比例") ||
      key.includes("指数") ||
      key.includes("对数") ||
      key.includes("图象")
    ) {
      return "functionLab";
    }

    // 三角形 / 平行四边形 / 圆 / 全等 → **动态几何 + 量角器**。
    if (
      key.includes("三角形") ||
      key.includes("平行四边形") ||
      key.includes("圆") ||
      key.includes("几何") ||
      key.includes("全等") ||
      key.includes("梯形") ||
      key.includes("矩形") ||
      key.includes("菱形")
    ) {
      return "protractor";
    }

    // 方程 → **方程天平**（两边同量同数的直观模型）。
    if (
      key.includes("方程") ||
      key.includes("等式") ||
      key.includes("解方程")
    ) {
      return "balanceScale";
    }

    // 分数 → **分数圆盘**（自由等分 + 涂色）。
    if (key.includes("分数") || key.includes("分式")) return "fractionDisc";

    // 数感 / 整十整百 / 乘法口诀 → **十进制凑十积木块**。
    if (
      key.includes("数位") ||
      key.includes("整十数") ||
      key.includes("两位数") ||
      key.includes("三位数") ||
      key.includes("乘法") ||
      key.includes("除法") ||
      key.includes("积的变化") ||
      key.includes("商的变化") ||
      key.includes("因数") ||
      key.includes("倍数") ||
      key.includes("质数") ||
      key.includes("奇数") ||
      key.includes("加法运算律") ||
      key.includes("四则混合") ||
      key.includes("凑十")
    ) {
      return "decimalBlocks";
    }

    // 数轴 / 有理数 / 负数 → **数轴跳格器**。
    if (
      key.includes("数轴") ||
      key.includes("有理数") ||
      key.includes("负数")
    ) {
      return "numberLine";
    }

    /* ── 既有分派（保留兼容性） ── */
    if (key.includes("统计") || key.includes("概率")) return "probability";
    if (key.includes("方程") || key.includes("整式")) return "algebra";
    if (key.includes("分数")) return "fraction";
    if (key.includes("周长") || key.includes("面积")) return "area";
    if (key.includes("对称") || key.includes("平移")) return "transform";
    if (key.includes("比")) return "ratio";
    if (key.includes("除法") || key.includes("乘法")) return "blocks";
  }
  const haystack = coreTitle;
  if (/函数|图象|坐标/.test(haystack)) return "functionLab";
  if (/统计|平均|中位/.test(haystack)) return "chartLab";
  if (/角/.test(haystack)) return "protractor";
  if (/方程|整式|代数/.test(haystack)) return "balanceScale";
  if (/数轴|负数|有理数/.test(haystack)) return "numberLine";
  if (/分数/.test(haystack)) return "fractionDisc";
  if (/面积|周长/.test(haystack)) return "area";
  if (/对称|平移/.test(haystack)) return "transform";
  if (/三角形|四边形|圆|几何/.test(haystack)) return "protractor";
  return "decimalBlocks";
}

/** 实验室的初始参数。 */
export function mathLabParams(kind, topic) {
  const key = topic?.key ?? "";

  switch (kind) {
    /* ── Module 5 · GitHub 开源教具的初始参数 ── */
    case "protractor": {
      // 角度类课：给一个**具体的目标角**作为初始值。
      const angleMap = {
        角的分类: 120,
        角的度量: 35,
        线段: 45,
      };
      let angle = 60;
      if (key.includes("分类")) angle = 120;
      else if (key.includes("度量")) angle = 35;
      else if (key.includes("三角形")) angle = 60;
      else if (key.includes("圆")) angle = 90;
      else if (key.includes("全等") || key.includes("几何")) angle = 50;
      return { angle, sides: 3 };
    }
    case "functionLab": {
      const slopeMap = {
        二次函数: 1,
        反比例: 6,
        一次函数: 2,
        正比例: 3,
        指数: 2,
        对数: 3,
      };
      let slope = 1;
      let fnType = "quadratic";
      if (key.includes("反比例")) {
        slope = 6;
        fnType = "inverse";
      } else if (key.includes("一次函数") || key.includes("正比例")) {
        slope = 2;
        fnType = "linear";
      } else if (key.includes("指数") || key.includes("对数")) {
        slope = 2;
        fnType = "linear";
      }
      return { slope, intercept: 1, fnType, a: slope, b: 1, type: fnType };
    }
    case "chartLab": {
      // 统计类课：给一份**具体的初始数据集**。
      const dataMap = {
        平均数: [
          { label: "第一组", value: 12 },
          { label: "第二组", value: 8 },
          { label: "第三组", value: 5 },
          { label: "第四组", value: 9 },
        ],
        条形统计图: [
          { label: "阅读", value: 12 },
          { label: "运动", value: 8 },
          { label: "音乐", value: 5 },
          { label: "科学", value: 9 },
        ],
        扇形统计图: [
          { label: "足球", value: 30 },
          { label: "篮球", value: 25 },
          { label: "乒乓", value: 20 },
          { label: "其他", value: 25 },
        ],
      };
      let data = dataMap.条形统计图;
      if (key.includes("扇形")) data = dataMap.扇形统计图;
      else if (key.includes("平均") || key.includes("中位")) data = dataMap.平均数;
      return { data, trials: 100, p: 0.5 };
    }
    case "decimalBlocks": {
      // 凑十类课：目标是**具体的凑十数**。
      const targetMap = {
        整十数: 20,
        两位数加: 10,
        三位数乘: 100,
        乘法: 10,
        除法: 10,
        数位: 100,
      };
      let target = 10;
      if (key.includes("数位") || key.includes("三位数")) target = 100;
      else if (key.includes("整十数")) target = 20;
      return { target, count: target, groups: 10 };
    }
    case "fractionDisc": {
      const partsMap = {
        分数的意义: 4,
        分数与除法: 4,
        分数加减: 8,
      };
      let parts = 4;
      if (key.includes("加减")) parts = 8;
      return { parts, numerator: 1, denominator: parts, slices: parts };
    }
    case "numberLine":
      return { start: -5, step: 1, value: -3 };
    case "balanceScale":
      return { leftWeights: [2, 2], rightWeights: [4] };

    /* ── 既有分派（保留兼容性） ── */
    case "function":
      return {
        a: 1,
        b: 0,
        type: topic?.key.includes("反比例") ? "inverse" : "quadratic",
      };
    case "geometry":
      return { angle: 40, sides: 3 };
    case "probability":
      return { trials: 100, p: 0.5 };
    case "algebra":
      return { a: 2, b: -5 };
    case "numberline":
      return { value: -3 };
    case "fraction":
      return { numerator: 1, denominator: 4 };
    case "area":
      return { length: 6, width: 4 };
    case "transform":
      return { offset: 2 };
    case "ratio":
      return { a: 1, b: 9 };
    default:
      return { count: 7, groups: 3 };
  }
}

/**
 * 选出生字。
 *
 * ⚠️ **绝不乱塞无关字**。优先从课文名里取，其次从该课的
 * 语文考点概念里取；都没有时，用该年级**高频生字**里的一个字。
 */
export function pickChars(coreTitle, point, grade = 1) {
  const candidates = [];
  // ① 课文名里的真实汉字——这是**本课**的字，最优先。
  for (const char of String(coreTitle)) {
    if (/[\u4e00-\u9fa5]/.test(char) && !candidates.includes(char)) {
      candidates.push(char);
    }
  }
  if (candidates.length >= 2) return candidates.slice(0, 4);

  // ② 本课考点概念里的汉字。
  if (point) {
    for (const char of String(point.concept ?? "")) {
      if (/[\u4e00-\u9fa5]/.test(char) && !candidates.includes(char)) {
        candidates.push(char);
      }
    }
  }
  if (candidates.length >= 2) return candidates.slice(0, 4);

  // ③ 最后兜底：本年级的高频生字。
  return GRADE_CHARS[grade] ?? GRADE_CHARS[1] ?? ["学", "习", "字"];
}

/** 各年级的高频生字——只用于没有别的可选时的最后一档。 */
export const GRADE_CHARS = {
  1: ["天", "人", "大", "小"],
  2: ["学", "习", "字", "词"],
  3: ["春", "花", "雨", "风"],
  4: ["观", "察", "算", "数"],
  5: ["诗", "词", "意", "境"],
  6: ["故", "乡", "情", "深"],
  7: ["秋", "天", "怀", "念"],
  8: ["山", "水", "城", "楼"],
  9: ["春", "风", "花", "月"],
  10: ["沁", "园", "长", "沙"],
  11: ["赤", "壁", "月", "江"],
  12: ["登", "高", "风", "急"],
};

/** 常见生字的拼音——用于语音朗读。 */
export const PINYIN_MAP = {
  天: "tiān", 人: "rén", 大: "dà", 小: "xiǎo",
  学: "xué", 习: "xí", 字: "zì", 词: "cí",
  春: "chūn", 花: "huā", 雨: "yǔ", 风: "fēng",
  观: "guān", 察: "chá", 算: "suàn", 数: "shù",
  诗: "shī", 意: "yì", 境: "jìng",
  故: "gù", 乡: "xiāng", 情: "qíng", 深: "shēn",
  秋: "qiū", 怀: "huái", 念: "niàn",
  山: "shān", 水: "shuǐ", 城: "chéng", 楼: "lóu",
  月: "yuè", 江: "jiāng",
  登: "dēng", 高: "gāo", 急: "jí",
  静: "jìng", 夜: "yè", 思: "sī",
  咏: "yǒng", 鹅: "é", 池: "chí",
  村: "cūn", 居: "jū", 悯: "mǐn", 农: "nóng",
  望: "wàng", 庐: "lú", 瀑: "pù",
  泉: "quán", 眼: "yǎn", 遥: "yáo",
  燕: "yàn", 猫: "māo", 狼: "láng",
  菊: "jú", 送: "sòng", 别: "bié",
  洞: "dòng", 庭: "tíng", 依: "yī",
  论: "lùn", 语: "yǔ", 师: "shī", 说: "shuō",
  醉: "zuì", 翁: "wēng", 亭: "tíng",
  爱: "ài", 莲: "lián",
  沁: "qìn", 园: "yuán", 长: "cháng", 沙: "shā",
  劝: "quàn",
  赤: "chì", 壁: "bì",
  声: "shēng", 慢: "màn", 寻: "xún",
  荷: "hé", 塘: "táng",
  踪: "zōng", 印: "yìn", 背: "bèi",
  亲: "qīn", 膝: "xī",
  州: "zhōu", 怡: "yí", 悦: "yuè",
  陶: "táo",
  稻: "dào", 香: "xiāng", 排: "pái",
  舟: "zhōu", 采: "cǎi",
  慈: "cí", 母: "mǔ", 针: "zhēn", 线: "xiàn",
  枫: "fēng", 桥: "qiáo", 泊: "bó",
  黄: "huáng", 鹤: "hè", 广: "guǎng",
  帝: "dì", 白: "bái", 千: "qiān",
  泰: "tài", 岳: "yuè",
  远: "yuǎng", 上: "shàng", 寒: "hán",
  停: "tíng", 云: "yún", 惊: "jīng",
};
