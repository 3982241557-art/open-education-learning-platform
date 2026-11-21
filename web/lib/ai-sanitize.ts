/**
 * AI 回复的「降噪」处理
 * ====================
 *
 * 大模型的原始输出里混着三类**不该给用户看**的东西：
 *
 * 1. **工具围栏** —— ```` ```action {...} ``` ````。后端会把它解析成
 *    结构化动作，但流式传输时它会**先**作为文本到达前端。用户不该
 *    看到一坨 JSON。
 * 2. **思考过程** —— ``<think>…</think>``，或者「我先调用XX工具」
 *    「让我查一下原文」这类**自言自语**。
 * 3. **实现层的失败说明** —— 「我拿不到原文」「上下文里没有这块
 *    内容」「course_context 缺少对应 block」。这些是**模型在解释
 *    自己的实现**，对用户毫无意义——用户只关心「你能不能帮我」。
 *
 * 这个模块把上面三类统统拦掉，只留下**面向用户的正文**。
 *
 * 为什么在前端做而不是后端
 * ----------------------
 *
 * 后端确实也在解析动作围栏（``action_protocol.parse_actions``），
 * 但**流式**路径不一样：增量是一段段来的，一个围栏可能横跨好几段
 * 增量，在前端看到完整围栏之前，中间那几段已经显示出来了。所以前端
 * 必须**自己**做一次流式安全的清洗。
 */

/** 动作围栏：```` ```action ```` / ```` ```actions ```` / ```` ```tool ````。 */
const ACTION_FENCE_RE =
  /```\s*(?:action|actions|tool|tools)\b[\s\S]*?(?:```|$)/gi;

/** 思考标签：``<think>…</think>`` 与未闭合的 ``<think>…``。 */
const THINK_BLOCK_RE = /<think>[\s\S]*?(?:<\/think>|$)/gi;

/**
 * 常见的「自言自语」句式。
 *
 * 这些是模型在暴露自己的思考过程。它们通常出现在回答的**开头**，
 * 后面跟着真正的答案。
 */
const SELF_TALK_PATTERNS: RegExp[] = [
  // 「让我先看看…」「我需要先调用…」
  /^\s*(?:让我|我先|我需要先|我这就|稍等|稍候)[^\n。！？.!?]{0,60}[。！.!?]\s*/gm,
  // 「正在调用XX工具」「调用工具：xxx」
  /^\s*(?:正在|开始|正在准备)?\s*(?:调用|使用|执行|运行)\s*[^\n。！？.!?]{0,40}(?:工具|函数|接口|API|工具调用)[^\n。！？.!?]{0,20}[。！.!?]?\s*/gm,
  // 「正在分析…」「正在思考…」「正在生成…」
  /^\s*(?:正在|正在为你)?\s*(?:分析|思考|处理|检索|查询|查找|生成|整理|总结)[^\n。！？.!?]{0,40}[。！.!?]?\s*/gm,
  // 「根据我拿到的上下文…」「从 course_context 中…」
  /(?:根据|基于|从)\s*(?:我(?:拿到|获得|读取)的)?\s*(?:上下文|context|course_context|提示词|prompt|系统提示)[^\n。！？.!?]{0,60}[，,。.!?]/gi,
];

/**
 * 实现层的失败说明——整句删掉。
 *
 * 这些句子的**问题**不是它们提到了什么，而是它们在跟用户**解释
 * 自己的实现**。用户看到「我拿不到原文」只会更困惑。
 */
const IMPL_FAILURE_PATTERNS: RegExp[] = [
  /[^\n。！？.!?]*?(?:我拿不到|我无法拿到|我没能拿到|拿不到(?:原文|正文|内容)|无法访问(?:原文|正文|内容))[^\n。！？.!?]*[。！.!?]?/g,
  /[^\n。！？.!?]*?(?:上下文里(?:没有|缺少|不存在)|context\s*(?:中)?(?:没有|缺少))[^\n。！？.!?]*[。！.!?]?/gi,
  /[^\n。！？.!?]*?(?:course_context|system\s*prompt|提示词区块|prompt\s*block)[^\n。！？.!?]*[。！.!?]?/gi,
  /[^\n。！？.!?]*?(?:按原样输出|我无法调用工具|工具调用失败|参数缺失|参数缺失)[^\n。！？.!?]*[。！.!?]?/g,
  /[^\n。！？.!?]*?(?:I (?:can(?:'|no)t|am unable to) access the source|outputting as-is|the tool call failed|the parameter is missing)[^\n。！？.!?]*[.!?]?/gi,
];

/**
 * 清洗一段 AI 回复。
 *
 * @param text 原始文本。
 * @returns 只剩下面向用户的正文。
 */
export function sanitizeModelText(text: string): string {
  if (!text) return "";

  let out = text;

  // ① 动作围栏——整块删掉。流式下围栏可能还没闭合，所以正则的
  //    末尾分支（``(?:```|$)``）能吃掉「已经流出半截围栏」的情况。
  out = out.replace(ACTION_FENCE_RE, "");

  // ② 思考标签。
  out = out.replace(THINK_BLOCK_RE, "");

  // ③ 自言自语。
  for (const pattern of SELF_TALK_PATTERNS) {
    out = out.replace(pattern, "");
  }

  // ④ 实现层失败说明。
  for (const pattern of IMPL_FAILURE_PATTERNS) {
    out = out.replace(pattern, "");
  }

  // 收尾：清掉清洗留下的多余空行与行首空白。
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return out;
}

/**
 * 判断一段文本是否**只有噪声**。
 *
 * 流式过程中，用户会先看到一堆被清掉的围栏内容，然后才是真正的
 * 答案。如果正文被清空了，界面就会闪一下空白——这时应该显示一个
 * 「正在思考」的呼吸动画，而不是空白。
 */
export function isNoiseOnly(text: string): boolean {
  return sanitizeModelText(text).trim().length === 0;
}
