/**
 * 本地 AI 助教
 * ============
 *
 * 纯静态模式下没有 Python 后端，AI 助教有**三条**路可用：
 *
 * 1. **转发代理**（首选）—— 请求 ``NEXT_PUBLIC_AI_PROXY_URL`` 指向的
 *    轻量转发服务（见仓库根目录的 ``ai-proxy/``）。服务端保管
 *    ``DEEPSEEK_API_KEY``，前端**永远看不到** Key。外部访客打开静态
 *    网址就能直接对话，零配置。
 * 2. **用户自填 Key** —— 浏览器直接调 DeepSeek。适合自用或不想部署
 *    代理的场景。Key 只存在这台设备的 localStorage 里。
 * 3. **离线引导** —— 两条路都不通时，用本课预装内容（知识向导 /
 *    段落导读 / 时间轴节点）组装一段有用的导读，而不是报「网络错误」。
 *
 * 优先级：代理 > 自填 Key > 离线引导。
 *
 * 理由：代理是**零门槛**的——访客不需要做任何配置。自填 Key 是**兜底**
 * ——用户已经填了，就用他自己的（不消耗站点额度）。
 *
 * 安全边界
 * --------
 *
 * 自填的 Key 存在浏览器 ``localStorage`` 里，**不进仓库、不进任何
 * 自己的服务器**。但纯静态站点无法保护它——它在浏览器里，任何能打开
 * 开发者工具的人都能看到。这是「纯静态 + 浏览器直连模型」这个架构的
 * 固有性质。**部署 ``ai-proxy/`` 就彻底解决了这个问题。**
 *
 * CORS
 * ----
 *
 * DeepSeek 的 API **允许浏览器直连**（它有设置 ``Access-Control-
 * Allow-Origin: *``）。代理的端点则由 ``ai-proxy`` 自己放行白名单。
 */

import { readLocal, writeLocal, StorageKeys } from "@/lib/local-store";

/** DeepSeek 的直连端点（仅在用户自填 Key 时使用）。 */
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

/** 默认模型。 */
const DEEPSEEK_MODEL = "deepseek-chat";

/**
 * 转发代理地址。
 *
 * 来自 ``NEXT_PUBLIC_AI_PROXY_URL``——构建期内联进前端 bundle。
 * 没设则为空字符串（前端退到自填 Key / 离线引导）。
 */
export const AI_PROXY_URL: string = (
  process.env.NEXT_PUBLIC_AI_PROXY_URL || ""
).replace(/\/+$/, "");

/** 转发代理是否配置了。 */
export function hasAiProxy(): boolean {
  return AI_PROXY_URL.length > 0;
}

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
  /**
   * **学习者画像**——由课前诊断结果拼装。
   *
   * 形如：
   *
   * .. code-block:: text
   *
   *     [学习者画像] 当前正在学习《XXX》第 3 讲，课前诊断显示其掌握度为
   *     【基础薄弱】，对【概念 A】存在模糊，请优先用生活直觉与循序渐进的
   *     方式讲解，避免直接堆砌高阶公式。
   *
   * 它被静默拼进 system prompt——用户看不到它，但助手知道该怎么讲。
   */
  learnerProfile?: string;
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

  // ── 学习者画像 ──
  //
  // 由课前诊断结果拼装（见 ``lib/diagnostic-profile.ts``）。
  //
  // 它是**有依据**的判断——用户刚做完 2~3 道针对本集知识点的题，
  // 所以「基础薄弱」不是模型猜的，而是根据作答算出来的。
  if (context.learnerProfile?.trim()) {
    details.push("", context.learnerProfile.trim());
  }

  return [...base, ...details].join("\n");
}

/**
 * 组装发给模型的 ``messages`` 数组。
 */
function buildMessages(
  question: string,
  history: LocalChatMessage[],
  context: LocalCourseContext | null,
): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: buildSystemPrompt(context) },
    ...history.slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: question },
  ];
}

/**
 * 直接调 DeepSeek（用户自填 Key 的那条路）。
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
  const messages = buildMessages(question, history, context);

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
 * 通过转发代理问模型（**首选**这条路）。
 *
 * 代理替我们保管 Key——前端**不接触**任何密钥。
 *
 * 代理返回的是**与 DeepSeek 完全相同**的 JSON 结构，所以解析逻辑
 * 可以复用。
 */
export async function callAiProxy(
  question: string,
  history: LocalChatMessage[],
  context: LocalCourseContext | null,
  signal?: AbortSignal,
): Promise<string> {
  const messages = buildMessages(question, history, context);

  const response = await fetch(`${AI_PROXY_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
      `转发服务返回 ${response.status}${text ? `：${text.slice(0, 200)}` : ""}`,
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
 * **永远不抛错**——三条路（代理 / 自填 Key / 离线引导）依次尝试，
 * 任何一条失败都不会让用户看到红色的网络报错。
 *
 * 这是刻意的：静态模式下**不能**让用户看到网络错误。助教永远在，
 * 只是能力有高低——代理可用时是完整讲解，没 Key 时是导读。
 *
 * 路由顺序
 * --------
 *
 * 1. **代理优先**——零门槛，且不消耗访客自己的额度；
 * 2. **代理失败 → 自填 Key**——用户已经填了，就用他自己的；
 * 3. **都不行 → 离线引导**——用本课预装内容组装一段导读。
 */
export async function askLocalAssistant(
  question: string,
  history: LocalChatMessage[],
  context: LocalCourseContext | null,
  signal?: AbortSignal,
): Promise<{ answer: string; live: boolean; note?: string }> {
  const key = getLocalApiKey();
  const proxyReady = hasAiProxy();

  // ── 两条路都没有 ──
  if (!proxyReady && !key) {
    return {
      answer: buildOfflineAnswer(question, context),
      live: false,
      note: "AI 助教服务尚未配置，以下是本课预装内容的导读。",
    };
  }

  // ── ① 代理（首选）──
  if (proxyReady) {
    try {
      const answer = await callAiProxy(question, history, context, signal);
      return { answer, live: true };
    } catch (error) {
      // 代理挂了——如果用户自己也填了 Key，就退到直连。
      if (!key) {
        const reason = error instanceof Error ? error.message : "转发失败";
        return {
          answer: buildOfflineAnswer(question, context),
          live: false,
          note: `AI 服务暂时不可用（${reason.slice(0, 80)}），以下是本课预装内容的导读。`,
        };
      }
    }
  }

  // ── ② 用户自填 Key（兜底）──
  if (key) {
    try {
      const answer = await callDeepSeek(key, question, history, context, signal);
      return { answer, live: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "模型请求失败";
      return {
        answer: buildOfflineAnswer(question, context),
        live: false,
        note: `AI 服务暂时不可用（${reason.slice(0, 80)}），以下是本课预装内容的导读。`,
      };
    }
  }

  // ── ③ 兜底 ──
  return {
    answer: buildOfflineAnswer(question, context),
    live: false,
    note: "AI 服务暂时不可用，以下是本课预装内容的导读。",
  };
}
