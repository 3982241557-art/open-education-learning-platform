# ─────────────────────────────────────────────────────────────
#  AI 转发代理 · 部署说明
# ─────────────────────────────────────────────────────────────
#
#  这个服务只做一件事：保管 ``DEEPSEEK_API_KEY``，把 AI 助教的
#  请求转发给 DeepSeek。
#
#  3 步免域名上线（Zeabur）
#  ========================
#
#  **第 1 步 · 建服务并填 Key**
#
#  1. 打开 https://zeabur.com → 登录 → 「New Project」；
#  2. 「Deploy New Service」→「Git」（或先把这个目录推到一个
#     独立仓库再选它）；
#  3. 平台问你 Root Directory —— 填 ``ai-proxy``；
#  4. 平台问你环境变量 —— 加一条：
#
#     ```
#     DEEPSEEK_API_KEY = sk-xxxxxxxxxxxxxxxx
#     ```
#
#     （可选）再加一条自定义来源：
#
#     ```
#     CORS_ORIGINS = https://3982241557-art.github.io
#     ```
#
#  **第 2 步 · 拿 HTTPS 链接**
#
#  部署完成后，平台会分配一个域名，形如：
#
#  ```
#  https://oe-ai-proxy-xxxx.zeabur.app
#  ```
#
#  复制它。（也可以在 Service → Networking 里绑定自己的域名。）
#
#  **第 3 步 · 填进前端并部署**
#
#  在**站点仓库**的 GitHub Actions 里加一条 Secret：
#
#  ```
#  Settings → Secrets and variables → Actions → New repository secret
#  Name:  NEXT_PUBLIC_AI_PROXY_URL
#  Value: https://oe-ai-proxy-xxxx.zeabur.app
#  ```
#
#  然后推送代码触发部署。构建时这个变量会被内联进前端 bundle。
#
#  验证
#  ----
#
#  浏览器打开：
#
#  ```
#  https://oe-ai-proxy-xxxx.zeabur.app/health
#  ```
#
#  应该看到：
#
#  ```json
#  {"ok":true,"hasKey":true}
#  ```
#
#  然后回到站点，随便问 AI 助教一句话——应该有真实回答。
#
# ─────────────────────────────────────────────────────────────
#
#  本地运行
#  --------
#
#  ```bash
#  cd ai-proxy
#  npm install
#  DEEPSEEK_API_KEY=sk-xxx npm start
#  ```
#
#  然后在站点的前端环境里设：
#
#  ```bash
#  NEXT_PUBLIC_AI_PROXY_URL=http://localhost:8787
#  ```
#
#  注意：CORS 白名单默认允许 ``localhost:3000`` 与 ``localhost:8099``。
#  如果你用别的端口跑前端，记得把它加进 ``CORS_ORIGINS``。
#
# ─────────────────────────────────────────────────────────────
#
#  环境变量清单
#  ------------
#
#  ====================  ==================================  ============
#  变量                  含义                               必填
#  ====================  ==================================  ============
#  DEEPSEEK_API_KEY      DeepSeek 密钥                       ✅
#  PORT                  监听端口（平台自动注入）              ❌
#  DEEPSEEK_MODEL        模型名（默认 deepseek-chat）         ❌
#  CORS_ORIGINS          允许的来源，逗号分隔                 ❌
#  RATE_LIMIT            每窗口请求数（默认 20）               ❌
#  RATE_WINDOW_MS        限流窗口毫秒（默认 60000）           ❌
#  ====================  ==================================  ============
#
# ─────────────────────────────────────────────────────────────
#
#  安全边界
#  --------
#
#  * ``DEEPSEEK_API_KEY`` 只存在于**服务端环境变量**里，
#    永远不会出现在任何前端 bundle 中；
#  * CORS 白名单默认只放行本站与 localhost；
#  * 每个 IP 每分钟最多 20 次请求（可调）；
#  * 请求体限制 1MB。
#
#  ⚠️ 这个服务是**给公开访客用**的，所以它的额度是敞开的。
#     如果平台额度紧张，把 ``RATE_LIMIT`` 调低（例如 5），
#     并留意 Zeabur 的用量面板。
