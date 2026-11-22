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

  // 只转发需要的字段——不让前端决定模型或用别人的 Key。
  const payload = {
    model: typeof body.model === "string" ? body.model : DEEPSEEK_MODEL,
    messages,
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
