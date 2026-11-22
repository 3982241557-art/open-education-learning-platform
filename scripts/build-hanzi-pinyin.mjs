#!/usr/bin/env node
/**
 * 生字拼音表生成脚本
 * ==================
 *
 * 为 ``web/public/data/hanzi-chars.json`` 里的每个字生成**拼音**，
 * 输出到 ``web/public/data/hanzi-pinyin.json``。
 *
 * 为什么不用现成的 npm 包
 * ----------------------
 *
 * ``hanzi-writer-data`` 只含**笔顺**，不含拼音；
 * ``pinyin-pro`` 要额外装依赖，而本项目的字表是**封闭的 400 字**
 * ——只需要这 400 个字的读音，代价远小于一个依赖。
 *
 * 读音来源
 * --------
 *
 * 从**《现代汉语常用字表》的一级字表**（3500 字）中最常用的一批汉字
 * 整理而来的常用读音。多音字取**课文里最常见的那个读音**。
 *
 * 运行：
 *
 * .. code-block:: bash
 *
 *    node scripts/build-hanzi-pinyin.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXTRA_PINYIN } from "./k12-hanzi-pinyin.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHARS_FILE = path.join(
  ROOT,
  "web",
  "public",
  "data",
  "hanzi-chars.json",
);
const OUT_FILE = path.join(
  ROOT,
  "web",
  "public",
  "data",
  "hanzi-pinyin.json",
);

/**
 * 常用字读音表。
 *
 * 只收录本项目 400 字里用到的字——这是**最小充分集**。
 * 格式：``字: "拼音"``，多音字用逗号分隔（第一个是默认读音）。
 */
const PINYIN = {
  一: "yī", 二: "èr", 三: "sān", 四: "sì", 五: "wǔ", 六: "liù",
  七: "qī", 八: "bā", 九: "jiǔ", 十: "shí", 百: "bǎi", 千: "qiān",
  万: "wàn", 亿: "yì", 零: "líng", 上: "shàng", 下: "xià",
  左: "zuǒ", 右: "yòu", 前: "qián", 后: "hòu", 里: "lǐ", 外: "wài",
  大: "dà", 小: "xiǎo", 多: "duō", 少: "shǎo", 长: "cháng", 短: "duǎn",
  高: "gāo", 低: "dī", 远: "yuǎn", 近: "jìn", 深: "shēn", 浅: "qiǎn",
  早: "zǎo", 晚: "wǎn", 快: "kuài", 慢: "màn", 新: "xīn", 旧: "jiù",
  天: "tiān", 地: "dì", 日: "rì", 月: "yuè", 年: "nián", 时: "shí",
  分: "fēn", 秒: "miǎo", 钟: "zhōng", 刻: "kè",
  人: "rén", 口: "kǒu", 手: "shǒu", 足: "zú", 目: "mù", 耳: "ěr",
  头: "tóu", 心: "xīn", 身: "shēn", 力: "lì", 声: "shēng", 音: "yīn",
  我: "wǒ", 你: "nǐ", 他: "tā", 她: "tā", 它: "tā", 们: "men",
  家: "jiā", 国: "guó", 学: "xué", 校: "xiào", 生: "shēng", 师: "shī",
  友: "yǒu", 父: "fù", 母: "mǔ", 儿: "ér", 女: "nǚ", 子: "zǐ",
  爸: "bà", 妈: "mā", 哥: "gē", 姐: "jiě", 弟: "dì", 妹: "mèi",
  中: "zhōng", 是: "shì", 不: "bù", 有: "yǒu", 在: "zài", 和: "hé",
  的: "de", 了: "le", 也: "yě", 就: "jiù", 都: "dōu", 还: "hái",
  这: "zhè", 那: "nà", 哪: "nǎ", 什: "shén", 么: "me", 怎: "zěn",
  样: "yàng", 很: "hěn", 太: "tài", 最: "zuì", 更: "gèng",
  春: "chūn", 夏: "xià", 秋: "qiū", 冬: "dōng", 风: "fēng",
  雨: "yǔ", 雪: "xuě", 云: "yún", 电: "diàn", 雷: "léi",
  山: "shān", 水: "shuǐ", 石: "shí", 土: "tǔ", 田: "tián",
  林: "lín", 森: "sēn", 木: "mù", 树: "shù", 花: "huā", 草: "cǎo",
  叶: "yè", 根: "gēn", 果: "guǒ", 竹: "zhú", 禾: "hé", 米: "mǐ",
  禾苗: "hé miáo", 河: "hé", 海: "hǎi", 江: "jiāng", 湖: "hú",
  池: "chí", 泉: "quán", 岛: "dǎo", 岸: "àn", 沙: "shā", 泥: "ní",
  光: "guāng", 明: "míng", 暗: "àn", 亮: "liàng", 黑: "hēi",
  白: "bái", 红: "hóng", 黄: "huáng", 绿: "lǜ", 蓝: "lán",
  紫: "zǐ", 灰: "huī", 棕: "zōng", 粉: "fěn",
  飞: "fēi", 跑: "pǎo", 走: "zǒu", 跳: "tiào", 游: "yóu",
  唱: "chàng", 歌: "gē", 舞: "wǔ", 笑: "xiào", 哭: "kū",
  看: "kàn", 听: "tīng", 说: "shuō", 读: "dú", 写: "xiě",
  画: "huà", 问: "wèn", 答: "dá", 想: "xiǎng", 知: "zhī",
  道: "dào", 来: "lái", 去: "qù", 开: "kāi", 关: "guān",
  出: "chū", 入: "rù", 进: "jìn", 回: "huí", 过: "guò",
  起: "qǐ", 落: "luò", 升: "shēng", 降: "jiàng", 生: "shēng",
  活: "huó", 死: "sǐ", 住: "zhù", 坐: "zuò", 立: "lì",
  站: "zhàn", 躺: "tǎng", 睡: "shuì", 醒: "xǐng",
  吃: "chī", 喝: "hē", 饭: "fàn", 菜: "cài", 肉: "ròu",
  鱼: "yú", 虾: "xiā", 鸡: "jī", 鸭: "yā", 鹅: "é", 鸟: "niǎo",
  猫: "māo", 狗: "gǒu", 牛: "niú", 羊: "yáng", 马: "mǎ",
  猪: "zhū", 兔: "tù", 熊: "xióng", 虎: "hǔ", 狼: "láng",
  虫: "chóng", 蛇: "shé", 蚁: "yǐ", 蜂: "fēng", 蝶: "dié",
  贝: "bèi", 钱: "qián", 书: "shū", 本: "běn", 笔: "bǐ",
  纸: "zhǐ", 字: "zì", 词: "cí", 句: "jù", 文: "wén",
  章: "zhāng", 诗: "shī", 歌: "gē", 画: "huà", 语: "yǔ",
  话: "huà", 名: "míng", 姓: "xìng", 男: "nán", 老: "lǎo",
  师: "shī", 同: "tóng", 学: "xué", 班: "bān", 课: "kè",
  数: "shù", 加: "jiā", 减: "jiǎn", 乘: "chéng", 除: "chú",
  等: "děng", 于: "yú", 比: "bǐ", 半: "bàn", 分: "fēn",
  倍: "bèi", 角: "jiǎo", 边: "biān", 面: "miàn", 点: "diǎn",
  线: "xiàn", 形: "xíng", 圆: "yuán", 方: "fāng", 正: "zhèng",
  三: "sān", 角: "jiǎo", 圆: "yuán", 球: "qiú",
  春: "chūn", 夏: "xià", 秋: "qiū", 冬: "dōng",
  会: "huì", 要: "yào", 能: "néng", 可: "kě", 以: "yǐ",
  用: "yòng", 做: "zuò", 让: "ràng", 给: "gěi", 把: "bǎ",
  被: "bèi", 从: "cóng", 向: "xiàng", 往: "wǎng", 跟: "gēn",
  对: "duì", 像: "xiàng", 比: "bǐ", 像: "xiàng",
  美: "měi", 丽: "lì", 好: "hǎo", 坏: "huài", 新: "xīn",
  净: "jìng", 干: "gān", 湿: "shī", 热: "rè", 冷: "lěng",
  暖: "nuǎn", 凉: "liáng", 甜: "tián", 苦: "kǔ", 酸: "suān",
  辣: "là", 香: "xiāng", 臭: "chòu",
  春雨: "chūn yǔ", 秋雨: "qiū yǔ", 春风: "chūn fēng",
  竹子: "zhú zi", 树叶: "shù yè", 花朵: "huā duǒ",
  太阳: "tài yáng", 月亮: "yuè liàng", 星星: "xīng xing",
  天空: "tiān kōng", 大地: "dà dì", 海洋: "hǎi yáng",
  长江: "cháng jiāng", 黄河: "huáng hé", 西湖: "xī hú",
  中国: "zhōng guó", 北京: "běi jīng", 上海: "shàng hǎi",
  广州: "guǎng zhōu", 深圳: "shēn zhèn", 台湾: "tái wān",
  汉字: "hàn zì", 语文: "yǔ wén", 数学: "shù xué",
  老师: "lǎo shī", 同学: "tóng xué", 朋友: "péng yǒu",
  母亲: "mǔ qīn", 父亲: "fù qīn", 家庭: "jiā tíng",
  春天: "chūn tiān", 夏天: "xià tiān", 秋天: "qiū tiān",
  冬天: "dōng tiān", 早晨: "zǎo chén", 晚上: "wǎn shang",
  中午: "zhōng wǔ", 夜里: "yè lǐ",
  意思: "yì si", 声音: "shēng yīn", 名字: "míng zi",
  时候: "shí hou", 地方: "dì fang", 东西: "dōng xi",
  喜欢: "xǐ huān", 认识: "rèn shi", 知道: "zhī dào",
  看见: "kàn jiàn", 听见: "tīng jiàn", 回来: "huí lái",
  出来: "chū lái", 起来: "qǐ lái", 过去: "guò qù",
  昨天: "zuó tiān", 今天: "jīn tiān", 明天: "míng tiān",
  中国人: "zhōng guó rén", 外国人: "wài guó rén",
  好朋友: "hǎo péng yǒu", 不好看: "bù hǎo kàn",
};

async function main() {
  if (!fs.existsSync(CHARS_FILE)) {
    console.error("❌ 找不到字表，请先运行 scripts/build-hanzi-data.mjs");
    process.exit(1);
  }

  const chars = Object.keys(JSON.parse(fs.readFileSync(CHARS_FILE, "utf8")));
  const table = {};

  // 补表优先——它覆盖了全部 400 字。
  Object.assign(PINYIN, EXTRA_PINYIN);

  for (const char of chars) {
    // 多字词优先（更准），否则退回单字。
    table[char] = PINYIN[char] ?? "";
  }

  // 补一遍多字词——它们在字表里是单字出现的。
  for (const [word, pinyin] of Object.entries(PINYIN)) {
    if (word.length > 1) {
      for (const char of word) {
        if (chars.includes(char) && !table[char]) {
          table[char] = pinyin;
        }
      }
    }
  }

  /**
   * 用 ``pinyin-pro`` 兜底。
   *
   * 补表是**手工维护**的 400 字常用表——但课程数据里的生字已经
   * 扩到 760 个（真实教材写字表），总有新字不在补表里。
   *
   * 与其让这些字的读音是空字符串（朗读功能静默失效），不如用
   * ``pinyin-pro`` 现算。这是**构建期**的一次性计算，运行时
   * 零依赖。
   */
  const missingBefore = chars.filter((char) => !table[char]);
  if (missingBefore.length > 0) {
    // ``pinyin-pro`` 装在 ``web/`` 下（Next.js 应用的依赖目录），
    // 而脚本跑在仓库根——所以要显式指到那个路径。
    const pinyinModule = await import(
      path.join(ROOT, "web", "node_modules", "pinyin-pro", "dist", "index.js")
    );
    const pinyin = pinyinModule.default?.pinyin ?? pinyinModule.pinyin;
    if (typeof pinyin !== "function") {
      throw new Error("pinyin-pro 导出格式异常——无法取得 pinyin() 函数");
    }
    for (const char of missingBefore) {
      const result = pinyin(char, { toneType: "symbol", type: "array" });
      const value = Array.isArray(result) ? result[0] : result;
      if (value) table[char] = value;
    }
    console.log(
      `   ↻ pinyin-pro 补齐 ${missingBefore.length - chars.filter((c) => !table[c]).length} 个字的读音`,
    );
  }

  const missing = chars.filter((char) => !table[char]);
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(table, null, 0)}\n`, "utf8");

  /**
   * 同步生成**构建期用的静态表**。
   *
   * ``scripts/k12-hanzi-pinyin-table.mjs`` 是构建脚本直接 import 的
   * 那个 ``.mjs`` 字面量表。运行时（前端）读 JSON，构建期（脚本）读
   * 这个 ``.mjs``——两者必须**始终一致**，否则课程数据里的拼音会
   * 和运行时读到的对不上。
   */
  const tableModule = path.join(__dirname, "k12-hanzi-pinyin-table.mjs");
  const entries = Object.entries(table)
    .filter(([, value]) => value)
    .sort(([a], [b]) => a.localeCompare(b, "zh-Hans-CN"))
    .map(([char, value]) => `  "${char}": "${value}",`)
    .join("\n");
  fs.writeFileSync(
    tableModule,
    `/**
 * 生字读音表（构建期使用）
 * ========================
 *
 * 由 scripts/build-hanzi-pinyin.mjs 生成，
 * 与 web/public/data/hanzi-pinyin.json 保持一致。
 *
 * 运行 node scripts/build-hanzi-pinyin.mjs 可重新生成。
 */

/** 字 → 拼音。 */
export const PINYIN_TABLE = {
${entries}
};
`,
    "utf8",
  );

  console.log(`✅ 拼音表已生成：${Object.keys(table).length} 字`);
  console.log(`   → ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`   → ${path.relative(ROOT, tableModule)}`);
  if (missing.length) {
    console.log(`   ⚠️  ${missing.length} 个字暂无读音：${missing.join("")}`);
  }
}

await main();
