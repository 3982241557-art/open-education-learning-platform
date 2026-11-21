/**
 * 本地 AI 助教
 * ============
 *
 * 纯静态模式下没有 Python 后端，AI 助教**直接请求 DeepSeek**——
 * 浏览器直连模型厂商的 API。
 *
 * 两条路
 * ------
 *
 * 1. **用户填了 API Key** —— 浏览器直接调 DeepSeek，拿到真正的回答。
 * 2. **没填 Key** —— 退到**离线引导回答**：结合当前课程的
 *    ``study_guide``（知识向导）与 ``interactive_nodes``（时间轴节点），
 *    组装一段有用的引导，而不是报「网络错误」。
 *
 * 为什么 Key 只存本地
 * ------------------
 *
 * Key 存在浏览器 ``localStorage`` 里，**不进仓库、不进任何服务器**。
 * 它只在这台设备上有效。
 *
 * 代价要说清楚：**纯静态站点无法保护一个用户自己填的 Key**——它在
 * 浏览器里，任何能打开开发者工具的人都能看到。这是「纯静态 + 浏览器
 * 直连模型」这个架构的固有性质，不是实现缺陷。
 *
 * 如果不能接受这一点，唯一的办法是部署一个后端来保管 Key。
 *
 * CORS
 * ----
 *
 * DeepSeek 的 API **允许浏览器直连**（它有设置 ``Access-Control-
 * Allow-Origin: *``）。所以这条路是通的。
 */

import { readLocal, writeLocal, StorageKeys } from "@/lib/local-store";

/** DeepSeek 的端点。 */
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

/** 默认模型。 */
const DEEPSEEK_MODEL = "deepseek-chat";

/** 读本地存的 API Key。 */
export function getLocalApiKey(): string {
  return readLocal<string>(StorageKeys.deepseekKey, "");
}

/** 存 API Key。 */
export function setLocalApiKey(key: string): boolean {
  const cleaned = key.trim();
  if (!cleaned) {
    writeLocal(StorageKeys.deepseekKey, "");
    return true;
  }
  return writeLocal(StorageKeys.deepseekKey, cleaned);
}

/** Key 配好了吗。 */
export function hasLocalApiKey(): boolean {
  return getLocalApiKey().length > 0;
}

/**
 * 一条消息。
 */
export interface LocalChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: number;
}

/**
 * 离线引导所需的**课程上下文**。
 */
export interface LocalCourseContext {
  /** 课程 / 资源标题。 */
  title: string;
  /**
   * 知识向导——预装好的「带着哪几个问题看」。
   *
   * 形状与 ``learning-events`` 里的 ``StudyGuideLike`` 一致（只声明
   * 实际用到的字段），避免事件总线与数据层互相依赖。
   */
  studyGuide?: {
    strategy?: string;
    checkpoints?: string[];
    suggested_questions?: Array<{ title: string }>;
  } | null;
  /** 时间轴上的知识节点。 */
  interactiveNodes?: Array<{
    timestamp: number;
    keyword: string;
    context?: string;
    hint?: string;
  }>;
  /** 段落导读。 */
  guidedSegments?: Array<{
    timestamp: number;
    title: string;
    content: string;
  }>;
}

/**
 * 生成一段**离线引导回答**。
 *
 * 这不是「假装在回答」——它给出的是**真实的课程结构信息**：
 * 这节课的知识向导、检查点、时间轴节点、段落导读。
 *
 * 这些内容本来就是预装好的（随静态 JSON 一起发布），
 * 所以在完全离线的状态下也能给出有实质内容的引导。
 *
 * 措辞上必须诚实地告诉用户「这是引导，不是完整的 AI 回答」——
 * 不能让用户以为这是一个真实的模型回答。
 */
export function buildOfflineAnswer(
  question: string,
  context: LocalCourseContext | null,
): string {
  if (!context || (!context.studyGuide && !context.interactiveNodes?.length)) {
    return [
      "目前没有连接 AI 模型服务，所以无法生成完整回答。",
      "",
      "**你可以这样用：**",
      "",
      "1. 在「个人设置」里填入 DeepSeek API Key，就能获得完整的 AI 讲解；",
      "2. 先看看这节课的知识节点与段落导读——它们已经预装好了，",
      "   覆盖了这节课的主要概念与脉络。",
      "",
      "你问的是：",
      `> ${question}`,
    ].join("\n");
  }

  const lines: string[] = [];
  const guide = context.studyGuide;
  const nodes = context.interactiveNodes ?? [];
  const segments = context.guidedSegments ?? [];

  lines.push(
    "当前未连接 AI 模型服务，下面是**基于本课预装内容**生成的导读。",
    "",
  );

  if (context.title) {
    lines.push(`**本节内容：**${context.title}`, "");
  }

  if (guide?.strategy) {
    lines.push("**看课策略**", guide.strategy, "");
  }

  if (guide?.checkpoints?.length) {
    lines.push("**建议抓住这几个检查点：**");
    guide.checkpoints.forEach((point, index) => {
      lines.push(`${index + 1}. ${point}`);
    });
    lines.push("");
  }

  if (nodes.length) {
    lines.push("**这节课埋了这些关键点：**");
    nodes.slice(0, 6).forEach((node) => {
      const minutes = Math.floor(node.timestamp / 60);
      const seconds = node.timestamp % 60;
      const time = `${minutes}:${String(seconds).padStart(2, "0")}`;
      lines.push(`- \`${time}\` ${node.keyword}`);
    });
    lines.push("");
  }

  if (segments.length) {
    lines.push("**段落导读：**");
    segments.slice(0, 5).forEach((segment) => {
      const minutes = Math.floor(segment.timestamp / 60);
      const seconds = segment.timestamp % 60;
      const time = `${minutes}:${String(seconds).padStart(2, "0")}`;
      lines.push(`- \`${time}\` ${segment.title}`);
    });
    lines.push("");
  }

  if (guide?.suggested_questions?.length) {
    lines.push("**你可以顺着问：**");
    guide.suggested_questions.slice(0, 3).forEach((item) => {
      lines.push(`- ${item.title}`);
    });
    lines.push("");
  }

  lines.push(
    "想要针对你的问题的完整解答？在「个人设置」里填入 DeepSeek API Key 即可。",
  );

  return lines.join("\n");
}

/**
 * 系统提示——给 DeepSeek 用的。
 */
function buildSystemPrompt(context: LocalCourseContext | null): string {
  const base = [
    "你是一位中文学习助教，正在陪一位海外华人学习者看公开课。",
    "回答要求：",
    "- 用**简体中文**回答，通俗、具体、有条理；",
    "- 优先用 Markdown 的小标题和列表，别写长段落；",
    "- 如果问题跟当前课程无关，就诚实地说明这一点，并给出你的建议；",
    "- 不要编造课程里没有的内容。",
  ];

  if (!context) return base.join("\n");

  const details: string[] = ["", "当前课程上下文："];

  if (context.title) {
    details.push(`- 标题：${context.title}`);
  }

  const guide = context.studyGuide;
  if (guide?.strategy) {
    details.push(`- 看课策略：${guide.strategy}`);
  }
  if (guide?.checkpoints?.length) {
    details.push(`- 检查点：${guide.checkpoints.join("；")}`);
  }
  if (context.interactiveNodes?.length) {
    const nodes = context.interactiveNodes
      .slice(0, 12)
      .map(
        (node) =>
          `${Math.floor(node.timestamp / 60)}:${String(node.timestamp % 60).padStart(2, "0")} ${node.keyword}`,
      )
      .join("；");
    details.push(`- 时间轴知识节点：${nodes}`);
  }
  if (context.guidedSegments?.length) {
    const segments = context.guidedSegments
      .slice(0, 10)
      .map((segment) => `${segment.title}（${segment.content}）`)
      .join("；");
    details.push(`- 段落导读：${segments}`);
  }

  return [...base, ...details].join("\n");
}

/**
 * 直接调 DeepSeek。
 *
 * @returns 模型的完整回答。失败时抛错——调用方负责降级。
 */
export async function callDeepSeek(
  apiKey: string,
  question: string,
  history: LocalChatMessage[],
  context: LocalCourseContext | null,
  signal?: AbortSignal,
): Promise<string> {
  const messages = [
    { role: "system", content: buildSystemPrompt(context) },
    ...history.slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: question },
  ];

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      stream: false,
      temperature: 0.6,
      max_tokens: 2000,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `模型请求失败（${response.status}）${text ? `：${text.slice(0, 200)}` : ""}`,
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("模型返回了空内容。");
  }
  return content;
}

/**
 * 问一句。
 *
 * **永远不抛错**——没配 Key 或者调用失败，都返回一段可用的引导回答。
 *
 * 这是刻意的：静态模式下**不能**让用户看到红色的网络报错。助教
 * 永远在，只是能力有高低——有 Key 时是完整讲解，没 Key 时是导读。
 */
export async function askLocalAssistant(
  question: string,
  history: LocalChatMessage[],
  context: LocalCourseContext | null,
  signal?: AbortSignal,
): Promise<{ answer: string; live: boolean; note?: string }> {
  const key = getLocalApiKey();

  if (!key) {
    return {
      answer: buildOfflineAnswer(question, context),
      live: false,
      note: "未配置 DeepSeek API Key，以下是本课预装内容的导读。",
    };
  }

  try {
    const answer = await callDeepSeek(key, question, history, context, signal);
    return { answer, live: true };
  } catch (error) {
    // 网络失败 / Key 无效 / 额度耗尽——全部降级到离线引导。
    const reason = error instanceof Error ? error.message : "模型请求失败";
    return {
      answer: buildOfflineAnswer(question, context),
      live: false,
      note: `AI 服务暂时不可用（${reason.slice(0, 80)}），以下是本课预装内容的导读。`,
    };
  }
}
