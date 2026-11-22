# ai-proxy · 部署指南（1 分钟）

Open Education Learning Platform 的 AI 助教需要一个**转发服务**。

**为什么不能把 DeepSeek Key 直接写进前端？**

GitHub Pages 是**纯静态托管**——你推到仓库里的每一个字节都是公开的。
`sk-...` 写进前端代码 = 公开泄露，任何人复制走就能刷你的额度。

有了这个转发服务，前端只请求一个**不含 Key** 的公开 HTTPS 地址，
Key 由服务端保管，访客打开网站**零配置**就能直接聊天。

---

## 第 1 步 · 拿到你的 DeepSeek Key（30 秒）

1. 打开 <https://platform.deepseek.com/api_keys>
2. 登录（手机号 / 邮箱均可）
3. 点 **「创建 API Key」**，复制那串 `sk-...`
4. 充值（DeepSeek 新用户通常有赠额；不够用时最低 ¥1 起充）

> ⚠️ Key **只显示一次**——关掉弹窗就再也看不到了。

---

## 第 2 步 · 部署 ai-proxy（选一个平台）

本目录是一个独立的 Express 服务，可以部署到任何支持 Node.js 的平台。

### 方案 A · Zeabur（推荐，绑定自定义域名最省事）

1. 打开 <https://zeabur.com>，用 GitHub 账号登录
2. 点 **「New Project」→「Deploy New Service」→「GitHub」**
3. 选择仓库 `3982241557-art/open-education-learning-platform`
4. **Root Directory 填 `ai-proxy`** ← 这一步别漏
5. 平台会自动识别 `ai-proxy/Dockerfile` 并构建
6. 部署成功后点 **「Domains」→「Add Domain」**，生成一个形如
   `xxx.zeabur.app` 的 HTTPS 地址
7. 点 **「Variables」**（环境变量），添加：

   | Key | Value |
   | --- | --- |
   | `DEEPSEEK_API_KEY` | 你的 `sk-...` |
   | `CORS_ORIGINS` | `https://3982241557-art.github.io` |

8. 保存 → 平台自动重启 → 完成

### 方案 B · Railway

1. <https://railway.app> → **「New Project」→「Deploy from GitHub Repo」**
2. 选中本仓库
3. 在服务设置里把 **Root Directory** 设为 `ai-proxy`
4. **「Variables」** 标签页添加上面两个变量
5. 点 **「Generate Domain」** 拿到 HTTPS 地址

### 方案 C · 本机自测（30 秒）

```bash
cd ai-proxy
npm install
DEEPSEEK_API_KEY=sk-你的key npm start
# → 监听 :8787
curl http://localhost:8787/health
# → {"ok":true,"hasKey":true}
```

---

## 第 3 步 · 把地址填进 GitHub Secrets（30 秒）

1. 打开仓库的 **Settings → Secrets and variables → Actions → New repository secret**
2. 添加第一个：

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_AI_PROXY_URL` | `https://你的代理地址` |

3. 再添加第二个（告诉前端「代理已就绪」）：

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_AI_PROXY_READY` | `true` |

4. **「Settings → Pages → Build and deployment → Source」** 选
   **「GitHub Actions」**
5. 回到 **Actions** 标签页，点 **「Re-run all jobs」**

> 💡 本仓库已内置 `.github/workflows/deploy.yml`，它会自动读取这两个
> Secret 并注入构建。

---

## 第 4 步 · 验证（30 秒）

打开线上站点 → 点右侧 **AI 助教** → 随便问一句。

- 回答是**实时生成的** → ✅ 代理生效
- 回答是**「本课预装内容的导读」** → ❌ Secret 没生效，检查第 3 步

也可以直接测代理本身：

```bash
curl -X POST https://你的代理地址/chat/completions \
  -H "Content-Type: application/json" \
  -H "Origin: https://3982241557-art.github.io" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

---

## 常见问题

**Q：前端还是显示「当前站点未配置 AI 转发服务」？**
A：`NEXT_PUBLIC_AI_PROXY_URL` 是**构建期**注入的。改完 Secret 必须重新
跑一次 Actions，纯前端刷新不生效。

**Q：代理返回 403？**
A：`CORS_ORIGINS` 里漏了站点地址。注意是**带 https 的完整 origin**，
不带路径。

**Q：返回 429「请求过于频繁」？**
A：限流是 **每 IP 每分钟 20 次**。调整 `RATE_LIMIT` / `RATE_WINDOW_MS`
两个环境变量即可。

**Q：想改模型？**
A：设 `DEEPSEEK_MODEL=deepseek-reasoner`（深度思考版）或其他模型名。

**Q：额度会被刷吗？**
A：有 CORS 白名单 + IP 限流双保险。陌生网站无法调用你的代理。

---

## 参考配置一览

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | — | **必填**。你的 DeepSeek Key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名 |
| `CORS_ORIGINS` | 站点 + 本地开发 | 逗号分隔的允许来源 |
| `RATE_LIMIT` | `20` | 每 IP 每窗口的请求上限 |
| `RATE_WINDOW_MS` | `60000` | 限流窗口（毫秒） |
| `PORT` | `8787` | 监听端口（平台通常自动注入） |
