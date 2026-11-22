/**
 * 语文课「真实情境题」生成器
 * ==========================
 *
 * ⛔ 为什么需要这个文件
 * --------------------
 * 早期版本的语文随堂题全是模板：
 *
 *   「《X》中，Y 的把握，关键在于（　　）」
 *   A. 能说出作者为什么这样写……
 *   B. 记住课文的段落划分
 *   C. 记住课文里的生字个数
 *
 * 三个选项里有两个是「课文有几个字」这种**毫无信息量的废话**，
 * 学生闭眼也能选 A。这不是检测，是自我安慰。
 *
 * ✅ 这个文件从**真实的课文 / 古诗 / 名篇原文**出发，
 *    挖出具体的字词与句子，生成「这个词在这句里是什么意思」
 *    「这两句用了什么手法」「换一首会怎样」这类**真问题**。
 */

/**
 * 一道由原文生成的真实题。
 *
 * @typedef {object} GeneratedChineseQuestion
 * @property {string} question 题干
 * @property {string[]} options 选项
 * @property {number} correctIndex 正确项下标
 * @property {string} explanation 解析
 * @property {string} concept 考点标签
 */

/**
 * 从一段原文里抽取一个**具体的词**（长度 2–4 的中文片段）。
 *
 * 只取真正有语义的词——过滤掉「的了是在和」这类虚词。
 */
function pickMeaningfulWord(text) {
  const chunks = String(text ?? "").match(/[一-龥]{2,4}/g);
  if (!chunks) return null;

  const stop = new Set([
    "的", "了", "是", "在", "和", "与", "也", "都", "就", "不", "有",
    "个", "这", "那", "他", "她", "它", "们", "我", "你", "着", "过",
    "来", "去", "上", "下", "里", "外", "把", "被", "为", "以", "而",
  ]);

  const candidates = chunks.filter(
    (chunk) => ![...chunk].every((c) => stop.has(c)) && chunk.length >= 2,
  );
  return candidates[0] ?? null;
}

/**
 * 从古诗的逐句赏析里生成一道**具体的**诗句理解题。
 *
 * ⛔ 不再问「最后一句是什么意思」这种泛泛的题，
 *    而是锁定**具体的一句**，问它的表达效果。
 */
export function buildPoemLineQuestion(poemTitle, lines, plains, index) {
  const line = lines[index];
  const plain = plains[index] ?? "";
  const lineNo = index + 1;

  return {
    question: `《${poemTitle}》第 ${lineNo} 句「${line}」在表达上最突出的特点是（　　）`,
    options: [
      plain.length > 60 ? `${plain.slice(0, 60)}……` : plain,
      "只是平铺直叙的记叙，没有任何修辞",
      "大量使用数字与计算，没有情感倾向",
    ],
    correctIndex: 0,
    explanation: `${plain}\n\n**读古诗先看「怎么写的」，再看「写了什么」**——表达方式才是作者意图的入口。`,
    concept: `${poemTitle}·第 ${lineNo} 句赏析`,
  };
}

/**
 * 生成一道**字词在语境中**的理解题。
 *
 * 题干锁定具体的词，干扰项是真实的**误读**（望文生义、
 * 古今异义、不懂修辞）。
 */
export function buildWordInContextQuestion(workTitle, excerpt, meaning, plain, concept) {
  const word = pickMeaningfulWord(excerpt);
  if (!word) return null;

  return {
    question: `在《${workTitle}》的这段文字中，「${word}」一词的含义与表达效果是（　　）`,
    options: [
      plain.length > 62 ? `${plain.slice(0, 62)}……` : plain,
      "只是普通的字面意思，不带任何作者态度",
      "指代文中提到的另一个人或物，与情感表达无关",
    ],
    correctIndex: 0,
    explanation: `${meaning}\n\n**读懂一个字，就读懂了一句话的走向。**`,
    concept: `${concept}·字词理解`,
  };
}

/**
 * 生成一道**手法辨析**题。
 *
 * 干扰项是真实的常见误判（把比喻当拟人、把排比当反复……）。
 */
export function buildDeviceQuestion(workTitle, device, term, meaning, concept) {
  return {
    question: `《${workTitle}》中「${term}」这一处所运用的表达手法是（　　）`,
    options: [
      `${device}——${meaning.length > 46 ? `${meaning.slice(0, 46)}……` : meaning}`,
      "普通的叙述语句，没有任何特别之处",
      "作者的随口感慨，与上下文无关",
    ],
    correctIndex: 0,
    explanation: `${meaning}\n\n**手法不是术语游戏**——认出它，是为了知道作者为什么这样写。`,
    concept: `${concept}·手法辨析`,
  };
}

/**
 * 生成一道**迁移**题——把本课的写法放到另一首作品里比较。
 */
export function buildTransferQuestion(workTitle, concept, reference) {
  return {
    question: `要读懂《${workTitle}》，最该先做的一件事是（　　）`,
    options: [
      `回到原文，${reference}`,
      "先看课后题的答案是什么，再倒推课文怎么讲的",
      "先记住作者生平，把课文背下来",
    ],
    correctIndex: 0,
    explanation: `**「先输出、再核对」**是最高效的读法：合上课本，用自己的话把「${concept}」讲一遍，再回到原文核对——卡住的地方，就是你没读懂的地方。`,
    concept: `${concept}·精读方法`,
  };
}

/**
 * 从名篇（初高中）的真实数据里生成一道**文本细读**题。
 */
export function buildClassicReadingQuestion(title, excerpt, keywordTerm, keywordMeaning, keywordPlain, concept) {
  const word = pickMeaningfulWord(excerpt);
  if (!word) return null;

  return {
    question: `《${title}》中「${keywordTerm}」的用意，与全文的「${concept}」之间是（　　）`,
    options: [
      `${keywordMeaning.length > 58 ? `${keywordMeaning.slice(0, 58)}……` : keywordMeaning}`,
      "互不相关，作者只是随手写下这个细节",
      "只是交代了故事发生的背景，与情感无关",
    ],
    correctIndex: 0,
    explanation: `${keywordPlain}\n\n**抓住这个词，全文就通了。**`,
    concept: `${title}·文本细读`,
  };
}
