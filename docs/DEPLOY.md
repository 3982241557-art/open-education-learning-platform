# 公网部署指南

面向**第一次部署**这个项目的人。照着下面的步骤点，不用理解每一步在做什么。

---

## 一分钟总览

这个项目由**两个服务**组成：

| 服务 | 是什么 | 建议部署到 |
|---|---|---|
| **前端** | Next.js 网页（用户看到的界面） | **Vercel**（Next.js 原生支持，零配置） |
| **后端** | FastAPI（AI 助教、课程数据） | **Render** 或 **Zeabur**（有现成的 Dockerfile） |

它们通过 **HTTPS** 通信。你最后会拿到两个网址：

- 前端：`https://xxx.vercel.app` ← **这个发给用户**
- 后端：`https://xxx.onrender.com`

---

## 第 1 步 · 把代码推上 GitHub

```bash
cd /Users/xinyuyang/Desktop/SEEK-Learning-Platform

# 确认没有密钥混进去（应该什么都不输出）
git status --short | grep -E "\.env$"

# 提交
git add -A
git commit -m "feat: 梦想课堂 v1.0 公网部署准备"

# 建仓库并推送（在 https://github.com/new 页面先建一个空仓库）
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

**要确认的东西**：`backend/data/global_resource_hub.json`（147 门课的数据，2.8MB）**必须**在提交里。

```bash
git ls-files backend/data/global_resource_hub.json   # 应该输出文件名
```

---

## 第 2 步 · 部署后端（Render，最简单）

1. 打开 <https://render.com> → 注册 → 点 **New +** → **Blueprint**
2. 选你刚推的仓库 → Render 会自动读 `render.yaml`
3. Render 会问你填两个变量的值：

   | 变量 | 填什么 | 必填？ |
   |---|---|---|
   | `DEEPSEEK_API_KEY` | 你的 DeepSeek Key（<https://platform.deepseek.com/api_keys>） | ✅ **必填** |
   | `ALLOWED_ORIGINS` | 先留空，等第 3 步拿到前端网址再回来填 | ❌ 可选 |

4. 点 **Apply** → 等它构建（第一次要几分钟，会装 ffmpeg 和 Python 包）
5. 构建成功后，Render 会给你一个网址：`https://dreamclass-backend.onrender.com`
6. **验证后端活了**：浏览器打开那个网址 + `/api/health`

   应该看到 `{"status":"ok", ...}`

> ⚠️ **免费版会休眠**：没人访问 15 分钟后服务会睡下，第一次访问要等 30~60 秒才醒。要 24 小时稳定请升级付费版。

**Zeabur 用户**：打开 <https://zeabur.com> → **New Project** → **Deploy from GitHub** → 选仓库 → 在 **Variables** 里填 `DEEPSEEK_API_KEY` → 部署 → 在 **Networking** 里开公网域名。

---

## 第 3 步 · 部署前端（Vercel）

1. 打开 <https://vercel.com> → 登录（用 GitHub 账号）→ 点 **Add New → Project**
2. 选你的仓库 → Framework 会自动认出 **Next.js** → 点 **Deploy**
3. 等它构建完（1~2 分钟），你会拿到：`https://你的项目名.vercel.app`
4. **告诉前端后端在哪**：
   - 打开项目的 **Settings → Environment Variables**
   - 加一个变量：

     | 变量名 | 值 |
     |---|---|
     | `NEXT_PUBLIC_API_BASE_URL` | `https://dreamclass-backend.onrender.com` |

   - **一定要勾上所有三个环境**（Production / Preview / Development）
   - 点 **Save**，然后 **Redeploy**（Vercel 不会自动重新部署）
5. **告诉后端前端在哪**：
   - 回到 Render → 你的服务 → **Environment** → 把 `ALLOWED_ORIGINS` 改成你的前端网址
     （多个网址用逗号分隔：`https://a.vercel.app,https://b.vercel.app`）
   - 点 **Save** → Render 会自动重启

---

## 第 4 步 · 验收

打开你的前端网址，逐条确认：

- [ ] 首页（`/`）能看到图文错落的「精选专题导览」
- [ ] 点「课程」→ 列表**不是空的**（应该有 147 门）
- [ ] 点任意一门课 → 能看到课程详情
- [ ] 左上角头像 → 能打开「个人中心」→ 改昵称 → 刷新后昵称还在
- [ ] 右下角「开源资源审核」→ 能看到 50 条**大白话**审核卡

---

## 第 5 步 · 长期维护

### 以后更新代码

```bash
git add -A
git commit -m "你的改动说明"
git push
```

- **Vercel**：自动重新部署（1~2 分钟）
- **Render**：自动重新部署（免费版还会重新休眠）

### 密钥泄露了怎么办

1. 去 <https://platform.deepseek.com/api_keys> 把旧 Key 删掉、生成新的
2. 在 Render 的 Environment 里换成新 Key
3. **立刻**去 GitHub 仓库的 commit 历史里确认 `.env` 没被提交过

### 想在本地跑生产版本

```bash
# 后端
cd backend && PORT=8001 python3 run.py

# 前端（另开一个终端）
cd web
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001 npm run build
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001 npm run start
```

---

## 常见问题

**Q：前端页面打开了，但数据全是空的 / 报「连不上后端」**

后端地址填错了。检查 Vercel 的 `NEXT_PUBLIC_API_BASE_URL`：

- 结尾**不要**带斜杠
- 要带 `https://`
- 改完**必须 Redeploy**，只保存变量没用

**Q：浏览器控制台报 CORS 错误**

Render 的 `ALLOWED_ORIGINS` 没填前端网址。填**完整**的前端网址，包含 `https://`。

**Q：课程列表是空的**

`backend/data/global_resource_hub.json` 没进仓库。检查：

```bash
git ls-files backend/data/global_resource_hub.json
```

没输出就是漏了。`git add -f backend/data/global_resource_hub.json` 再提交。

**Q：AI 助教不回答 / 报「尚未配置模型密钥」**

`DEEPSEEK_API_KEY` 没填或填错。注意：

- Key 前后**不要**有多余空格或引号
- 改完 Render 会自动重启，等 1 分钟

**Q：点开课程，播放器是空的**

B 站 / YouTube 的嵌入页在某些网络下会加载失败。这是**外部平台**的限制，不是部署问题——课程数据本身是好的。

**Q：Zeabur 上构建失败，说找不到 Dockerfile**

Zeabur 里要把 **Root Directory** 设为 `backend`，或者直接用本仓库的 `zeabur.yaml`（它已经写好了 `context: backend`）。

---

## 环境变量速查表

### 后端（Render / Zeabur / Railway）

| 变量 | 必填 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek 密钥 |
| `DEEPSEEK_BASE_URL` | ❌ | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | ❌ | 默认 `deepseek-chat` |
| `ALLOWED_ORIGINS` | ❌ | 前端域名，逗号分隔。**前端直连后端时才需要** |
| `GITHUB_TOKEN` | ❌ | 提升 GitHub 检索配额（10/分 → 5000/时） |
| `PORT` | ❌ | 云平台自动注入 |
| `HOST` | ❌ | 默认 `0.0.0.0`，**别改** |
| `LOG_LEVEL` | ❌ | 默认 `info` |

### 前端（Vercel / Zeabur 前端服务）

| 变量 | 必填 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | ⚠️ | 后端公网地址。**留空也能跑**（走代理），但填了更直接 |
| `NEXT_PUBLIC_SITE_TITLE` | ❌ | 站点标题 |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | ❌ | SEO 描述 |
| `BACKEND_PORT` | ❌ | 仅本地开发用 |

---

## 文件清单速查

| 文件 | 作用 |
|---|---|
| `backend/Dockerfile` | 后端容器镜像 |
| `backend/run.py` | 容器启动入口（读 `PORT`，监听 `0.0.0.0`） |
| `backend/requirements.txt` | Python 依赖 |
| `backend/.env.example` | 后端环境变量模板 |
| `web/.env.example` | 前端环境变量模板 |
| `web/next.config.js` | API 代理、图片策略、安全响应头 |
| `render.yaml` | Render 一键部署蓝图 |
| `zeabur.yaml` | Zeabur 部署配置 |
| `Procfile` | Render / Railway / Heroku 启动声明 |
| `.gitignore` | 密钥与缓存的排除规则 |
