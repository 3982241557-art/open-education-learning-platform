/**
 * DeepSeek 转发代理
 * ==================
 *
 * 一个**独立、极简**的转发服务——只做三件事：
 *
 * 1. 从环境变量读 ``DEEPSEEK_API_KEY``（**绝不**出现在前端代码里）；
 * 2. 把请求转发到 DeepSeek 的 ``/chat/completions``；
 * 3. 加一道 CORS 白名单 + 一道 IP 频率限制。
 *
 * 为什么需要它
 * ------------
 *
 * 纯静态站点（GitHub Pages）上的 AI 助教只有两条路：
 *
 * - **让每个访客自己填 API Key** —— 门槛太高，外部用户根本走不到；
 * - **把 Key 写进前端** —— 等于公开泄露，谁都能拿去刷额度。
 *
 * 有了这个转发服务，静态站点就能**开箱即用**：前端请求一个公开的
 * HTTPS 地址，服务端替访客保管并使用 Key。
 *
 * 部署
 * ----
 *
 * 免域名部署到 Zeabur / Railway / Fly.io：
 *
 * - 推这个目录到 GitHub；
 * - 平台上选「从仓库部署」，Root Directory 选 ``ai-proxy``；
 * - 填环境变量 ``DEEPSEEK_API_KEY``；
 * - 平台会分配一个 HTTPS 域名；
 * - 把域名填进前端的 ``NEXT_PUBLIC_AI_PROXY_URL``。
 *
 * 也可以直接 ``npm start`` 跑在本机。
 */

import express from "express";

/** 端口——平台会注入 ``PORT``，本地默认 8787。 */
const PORT = Number(process.env.PORT ?? 8787);

/** DeepSeek 的官方端点。 */
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

/** 默认模型。 */
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

/**
 * CORS 白名单。
 *
 * 只允许**本站**（GitHub Pages 上的固定仓库）与本地开发。
 *
 * 为什么不用 ``*``
 * --------------
 *
 * 开放给任意源等于把这个代理变成一个**公共的、免费的 DeepSeek 代理**
 * ——任何人的网页都能拿它刷你的额度。有了白名单 + 限流，
 * 滥用面被压到最小。
 *
 * 可以用环境变量 ``CORS_ORIGINS`` 覆盖（逗号分隔）。
 */
const DEFAULT_ORIGINS = [
  "https://3982241557-art.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8099",
  "http://127.0.0.1:8099",
];

const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? DEFAULT_ORIGINS
);

/**
 * 频率限制。
 *
 * 每个 IP 在 ``RATE_WINDOW_MS`` 内最多发 ``RATE_LIMIT`` 次请求。
 * 超出直接 429。
 *
 * 这是**内存**计数——单实例够用。多实例部署时每个实例各算各的，
 * 对本项目（单实例免费部署）完全够。
 */
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 20);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS ?? 60_000);

/** 每个 IP 的请求时间戳队列。 */
const hits = new Map();

/** 定期清理过期记录——防止 Map 无限增长。 */
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, timestamps] of hits) {
    const kept = timestamps.filter((time) => time > cutoff);
    if (kept.length === 0) hits.delete(ip);
    else hits.set(ip, kept);
  }
}, RATE_WINDOW_MS).unref?.();

/** 取客户端 IP（兼容反向代理）。 */
function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

/** 判断某个来源是否被允许。 */
function isOriginAllowed(origin) {
  if (!origin) return true; // 非浏览器请求（curl / 服务端调用）——不拦。
  return ALLOWED_ORIGINS.some(
    (allowed) => origin === allowed || origin.startsWith(`${allowed}/`),
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Khanmigo 苏格拉底系统提示词模板
 * ────────────────────────────────────────────────────────────────── */

/**
 * 语言指令——按界面语言切换。
 *
 * ⚠️ 关键约束：**教材本体不翻译**。国内语文课本的汉字、古诗原文
 *    必须保持**原中文**——翻译了就失真，那不是学习材料了。
 */
const LOCALE_INSTRUCTIONS = {
  "zh-CN":
    "用**简体中文**回答。引用课文、古诗原文、汉字字形时保持原文，不作翻译。",
  "zh-TW":
    "用**繁體中文**回答。引用課文、古詩原文、漢字字形時保持原文，不作翻譯。",
  en:
    "Answer in **English**. When quoting Chinese textbook passages, classical poems or 汉字/生词, keep the **original Chinese characters** and add a brief English explanation afterwards — never replace the original text with a translation.",
};

/**
 * 苏格拉底系统提示词模板。
 *
 * 这段提示词是「**不剧透**」的保证书。
 *
 * 为什么把提示词放在服务端
 * ------------------------
 *
 * 1. **前端可以随便改**——用户能改自己浏览器里的任何东西，但改不了
 *    服务端的提示词。这让「绝不剧透」成为一个**可承诺的性质**，
 *    而不是一句自觉遵守的约定；
 * 2. **省 token**——每次请求都省掉一段长 system prompt；
 * 3. **好维护**——改一次，全站生效。
 *
 * @param context 前端传来的上下文
 */
function buildSocraticSystemPrompt(context) {
  const locale = context?.language ?? "zh-CN";
  const localeInstruction =
    LOCALE_INSTRUCTIONS[locale] ?? LOCALE_INSTRUCTIONS["zh-CN"];

  const lines = [
    "你是一位**苏格拉底式启发伴学助教**，正在陪一位海外华人学习者完成一节交互式课程。",
    "",
    "## 核心原则（不可违背）",
    "",
    "1. **绝不直接给出答案**。不要替学生算出结果、不要直接说出标准定义、不要把练习题的答案写出来。",
    "2. **用问题推进**。你的第一反应应该是**反问**——「你注意到什么？」「如果换一个数会怎样？」「你觉得为什么？」",
    "3. **给现象，不给结论**。可以描述学生刚才的操作结果（因为他已经看到了），但不要说出背后的原理名称和推导。",
    "4. **一次只推进一步**。不要一口气讲完整节课的知识点。",
    "5. **引用教材保持原文**。语文课文、古诗、汉字字形一律用原中文。",
    "6. **语言跟随界面**。用户在英文界面提问就用英文回答；中文界面用中文。",
    "",
    "## 回答形态",
    "",
    "- 简短。**2–4 句**通常就够；教学场景不需要长篇大论。",
    "- 可以用一个小小的 Markdown 列表，但**不要**用大标题堆砌结构。",
    "- 如果学生明确说「直接告诉我答案」，可以给一个**最小提示**（指向方法而非结果），并说明为什么这样更有帮助——但仍不直接给最终答案，除非他再次坚持。",
    "",
    "## 当前学习情境",
    "",
    `- 课程：${context?.course ?? "（未提供）"}`,
    `- 本课：${context?.lesson ?? "（未提供）"}`,
  ];

  // ── 左侧教具的实时状态 ──
  //
  // 这是**最有价值**的一段上下文：它让助教的追问能**贴着学生刚
  // 做的动作**，而不是泛泛而谈。
  const lab = context?.labState;
  if (lab && typeof lab === "object") {
    lines.push(
      "",
      "### 学生在左侧教具中的实时进度",
      "",
      `- 正在使用的教具：${lab.title ?? lab.kind ?? "（未提供）"}`,
      `- 完成的任务：${lab.done ?? 0} / ${lab.total ?? 0}`,
    );
    if (lab.message) lines.push(`- 当前状态：${lab.message}`);
    if (Array.isArray(lab.tasks) && lab.tasks.length > 0) {
      const done = lab.tasks.filter((task) => task.done).map((task) => task.label);
      const pending = lab.tasks
        .filter((task) => !task.done)
        .map((task) => task.label);
      if (done.length > 0) lines.push(`- 已完成：${done.join("、")}`);
      if (pending.length > 0) lines.push(`- 尚未完成：${pending.join("、")}`);
    }
    lines.push(
      "",
      "请结合这个进度提问——学生刚做了什么，就问那件事背后的道理，不要问无关的题。",
    );
  }

  // ── 已获得的星星 ──
  const stars = context?.stars;
  if (stars && typeof stars === "object") {
    const count =
      (stars.explore ? 1 : 0) + (stars.think ? 1 : 0) + (stars.master ? 1 : 0);
    lines.push(
      "",
      "### 当前学习进度",
      "",
      `- 已点亮星星：${count} / 3`,
      "- ⭐ 动手探索　⭐⭐ 深度思考　⭐⭐⭐ 巩固掌握",
    );
    if (count === 0) {
      lines.push(
        "- 学生还没有开始动手。可以先引导他去左侧拖一拖、试一试。",
      );
    } else if (count < 3) {
      lines.push(
        "- 可以用「还差哪一颗星」来推动他继续——但仍然是引导，不是催促。",
      );
    }
  }

  lines.push("", `## 语言要求`, "", localeInstruction);

  return lines.join("\n");
}

const app = express();

/** 只收 JSON 请求体——限制体积，防滥用。 */
app.use(express.json({ limit: "1mb" }));

/**
 * CORS 中间件。
 *
 * 白名单之外的来源：**不给 CORS 头**，并直接回 403。
 *
 * 为什么不用 ``cors`` 包的回调式拒绝
 * ------------------------------
 *
 * 那个包的「拒绝」是靠抛异常实现的——最终会变成 **500**。但
 * 「来源不被允许」是**403 Forbidden**，不是服务器错误。500 会让
 * 监控面板误报成服务故障，也让人分不清是「代码炸了」还是
 * 「你不在白名单里」。
 *
 * 所以这里自己做判定：允许就挂上标准 CORS 头，不允许就 403。
 */
app.use((request, response, next) => {
  const origin = request.headers.origin;

  if (!isOriginAllowed(origin)) {
    response.status(403).json({
      error: "该来源不在允许列表中。",
    });
    return;
  }

  // 允许的来源：回显它（而不是写死 ``*``），这样将来若要带
  // 凭据（``credentials: true``）也不会违反 CORS 规范。
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Max-Age", "86400");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  next();
});

/** 健康检查——平台用它探活。 */
app.get("/health", (_request, response) => {
  response.json({ ok: true, hasKey: Boolean(process.env.DEEPSEEK_API_KEY) });
});

/** 聊天补全——转发到 DeepSeek。 */
app.post("/chat/completions", async (request, response) => {
  // ── 1. 限流 ──
  const ip = clientIp(request);
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((time) => time > cutoff);
  if (recent.length >= RATE_LIMIT) {
    response.status(429).json({
      error: "请求过于频繁，请稍后再试。",
    });
    return;
  }
  recent.push(now);
  hits.set(ip, recent);

  // ── 2. Key ──
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    response.status(503).json({
      error: "服务端未配置 DEEPSEEK_API_KEY。",
    });
    return;
  }

  // ── 3. 请求体 ──
  const body = request.body ?? {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    response.status(400).json({ error: "缺少 messages。" });
    return;
  }

  /**
   * 决定用哪套 system prompt。
   *
   * 前端如果传了 ``context``（课程 / 教具状态 / 星星），就用**服务端的
   * 苏格拉底模板**——它保证「绝不剧透」这条性质不会被前端改掉。
   *
   * 前端没传 context（普通聊天）时，用前端自己带的 system message。
   */
  const context = body.context;
  let outgoing = messages;

  if (context && typeof context === "object") {
    const socratic = buildSocraticSystemPrompt(context);
    // 前端若已经带了 system message，用服务端的**替换**它——
    // 否则前端可以绕过模板，把「直接给答案」写进 system prompt。
    const rest = messages.filter((message) => message.role !== "system");
    outgoing = [{ role: "system", content: socratic }, ...rest];
  }

  // 只转发需要的字段——不让前端决定模型或用别人的 Key。
  const payload = {
    model: typeof body.model === "string" ? body.model : DEEPSEEK_MODEL,
    messages: outgoing,
    stream: Boolean(body.stream),
    temperature:
      typeof body.temperature === "number" ? body.temperature : 0.6,
    max_tokens:
      typeof body.max_tokens === "number" ? body.max_tokens : 2000,
  };

  // ── 4. 转发 ──
  try {
    const upstream = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      response.status(upstream.status).json({
        error: `模型服务返回 ${upstream.status}`,
        detail: detail.slice(0, 400),
      });
      return;
    }

    // 流式：原样透传字节流。
    if (payload.stream) {
      response.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") ?? "text/event-stream",
      );
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "keep-alive");
      const reader = upstream.body?.getReader();
      if (!reader) {
        response.status(502).json({ error: "上游没有响应体。" });
        return;
      }
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(Buffer.from(value));
      }
      response.end();
      return;
    }

    // 非流式：透传 JSON。
    const data = await upstream.json();
    response.json(data);
  } catch (error) {
    response.status(502).json({
      error: "转发失败：无法连接模型服务。",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/** 兜底 404。 */
app.use((_request, response) => {
  response.status(404).json({ error: "not found" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[ai-proxy] 监听 :${PORT} · 模型 ${DEEPSEEK_MODEL} · ` +
      `Key ${process.env.DEEPSEEK_API_KEY ? "已配置" : "未配置"} · ` +
      `白名单 ${ALLOWED_ORIGINS.length} 个来源`,
  );
});
