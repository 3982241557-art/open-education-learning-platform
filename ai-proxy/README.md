# DeepSeek API · 三分钟接完

> 让 OE 的 Khanmigo 伴学从「离线引导流」升级成「真正的苏格拉底式实时对话」。
>
> **零域名 · 零购买 · 今晚就能上线。**

---

## 先看结论：一共 3 步

| 步骤 | 在哪里做 | 大概要多久 |
|---|---|---|
| ① 拿 Key | [platform.deepseek.com](https://platform.deepseek.com) | 2 分钟 |
| ② 部署代理 | [Zeabur](https://zeabur.com)（免费额度） | 5 分钟 |
| ③ 填前端地址 | GitHub Secrets → 重新部署 | 3 分钟 |

**总耗时约 10 分钟**，其中等待部署 3–5 分钟。

---

## 步骤 ① 拿到 DeepSeek API Key

1. 打开 <https://platform.deepseek.com> → **注册 / 登录**
2. 右上角头像 → **API Keys**
3. 点 **创建 API key**，随便起个名字（比如 `oe-proxy`）
4. **复制那串以 `sk-` 开头的字符** —— ⚠️ **只显示一次**，关掉就看不到了
5. 顺手在 **充值** 页充 10 块钱（够用几个月，DeepSeek 很便宜）

> 💡 DeepSeek 目前新用户通常有免费额度，不充值也能先用着试。

---

## 步骤 ② 部署转发代理（Zeabur，免费）

代理代码就在本仓库的 `ai-proxy/` 目录里。它只有 3 个职责：
读服务端 Key → 加 CORS 白名单 → 转发到 DeepSeek。

### 2.1 把代码推上去

本仓库已经包含 `ai-proxy/`，你直接用下面这个办法（**最省事**）：

**方式 A · 单独建一个小仓库（推荐）**

```bash
cd /Users/xinyuyang/Desktop/SEEK-Learning-Platform
# 只把 ai-proxy 目录变成一个独立仓库
cp -R ai-proxy /tmp/oe-ai-proxy && cd /tmp/oe-ai-proxy && git init
```

然后在 GitHub 上新建一个**空仓库**（比如 `oe-ai-proxy`），把 `/tmp/oe-ai-proxy` 里的 3 个文件推上去：

```
ai-proxy/
├── Dockerfile      ← 平台靠它启动
├── package.json
└── server.js       ← 全部逻辑在这
```

**方式 B · 用整个仓库，但指定根目录**

直接用本仓库，部署时把 **Root Directory** 填成 `ai-proxy` 即可。

### 2.2 在 Zeabur 上部署

1. 打开 <https://zeabur.com> → 用 GitHub 登录
2. 点 **New Project** → **Deploy New Service** → 选你的仓库
3. **Root Directory** 填 `ai-proxy`（方式 B 才需要；方式 A 留空）
4. Zeabur 会自动读 `Dockerfile` 开始构建 —— **等 2–3 分钟**
5. 构建完成后，Zeabur 会给你一个域名，长这样：

   ```
   https://oe-ai-proxy-xxxxx.zeabur.app
   ```

   **把这串地址复制下来** —— 下一步要用。

6. 点 **Variables / 环境变量**，添加：

   | 变量名 | 值 |
   |---|---|
   | `DEEPSEEK_API_KEY` | 你的 `sk-...` 整串 |
   | `CORS_ORIGINS` | `https://3982241557-art.github.io` |
   | `DEEPSEEK_MODEL` | `deepseek-chat`（可选，默认就是这个） |

7. 保存 → Zeabur 会**自动重新部署**。等它变绿（Running）。

### 2.3 一秒钟验证代理活着

浏览器打开：

```
https://oe-ai-proxy-xxxxx.zeabur.app/health
```

应该看到：

```json
{"ok":true,"hasKey":true}
```

看到 `"hasKey":true` 就说明**代理 + Key 都通了**。

> ❌ 如果是 `"hasKey":false` → 环境变量没加上，或者 Zeabur 还没重新部署完。
>
> ❌ 如果 403「该来源不在允许列表中」→ `CORS_ORIGINS` 少了站点域名。检查是不是漏了 `https://` 前缀。

---

## 步骤 ③ 把代理地址填进前端

站点是**纯静态导出**的，所以前端地址不能在编译时写死在代码里 —— 用
**GitHub Secrets + 构建变量**注入。

### 3.1 加 Secret

1. 打开你的仓库 <https://github.com/3982241557-art/open-education-learning-platform>
2. 顶部 **Settings** → 左侧 **Secrets and variables** → **Actions**
3. 点 **New repository secret**
4. 填：

   | 名称 | 值 |
   |---|---|
   | `NEXT_PUBLIC_AI_PROXY_URL` | `https://oe-ai-proxy-xxxxx.zeabur.app` |

5. 保存。

> ⚠️ 名字**必须**是 `NEXT_PUBLIC_AI_PROXY_URL`。
> Next.js 只会把 `NEXT_PUBLIC_` 开头的变量注入到浏览器端 —— 这个前缀
> 不是可选的。

### 3.2 让它生效

**方式 A · 自动（推荐）**

在 GitHub 仓库首页点 **Actions**，找到最近一次 **Deploy to GitHub Pages**，
点右上角 **Re-run all jobs**。等它跑完，站点就带上新地址了。

**方式 B · 手动**

```bash
cd /Users/xinyuyang/Desktop/SEEK-Learning-Platform/web
NEXT_PUBLIC_AI_PROXY_URL=https://oe-ai-proxy-xxxxx.zeabur.app npm run build:static
```

然后把 `out/` 目录推上去。

### 3.3 验证

打开 <https://3982241557-art.github.io/courses/k12_math_g5/p1/>，
看**右侧伴学面板顶部**那个小徽标：

| 徽标显示 | 含义 |
|---|---|
| `代理已连接` | ✅ 成功，实时对话已开启 |
| `离线引导流` | ⚠️ 代理地址没生效 —— 回步骤 3.2 |

再在对话框里打个字发出去，如果 AI 回话了 —— **整条链路全通**。

---

## 想用 Zeabur 以外的平台？

`ai-proxy/` 就是一个**标准 Node.js 服务**（约 300 行，含大量注释），
任何能跑 Node 18+ 的地方都行：

| 平台 | 怎么部署 | 备注 |
|---|---|---|
| **Railway** | New Project → GitHub 仓库 → 自动识别 Dockerfile | 最省事，同样免费额度 |
| **Render** | New Web Service → 选仓库 → Build Command `npm i` / Start `npm start` | 免费版会休眠，首次唤醒慢几秒 |
| **Zeabur** | 见上面步骤 ② | 推荐，国内访问通常最快 |
| **自建 VPS** | `docker build -t oe-proxy . && docker run -p 8787:8787 -e DEEPSEEK_API_KEY=sk-xxx oe-proxy` | 需要一个域名或裸 IP |

**不管用哪个平台，都必须设 `CORS_ORIGINS`**，否则你的站点会被 403 拦掉。

---

## 安全须知（很重要）

### 密钥只在服务端

`DEEPSEEK_API_KEY` **只存在于代理服务器的环境变量里**。
前端源码里**永远看不到**它。用户打开 DevTools 也看不到。

这是整个方案的关键——如果把 Key 写进前端代码，任何人右键查看源代码
就能拿走你的额度。

### 白名单 + 限流

代理自带两层防护：

- **CORS 白名单** —— 只有 `https://3982241557-art.github.io` 和 localhost
  能调用。别名域名、镜像站一律 403。
- **频率限制** —— 每个 IP 每分钟最多 20 次请求，超了返回 429。

### 额度监控

在 [platform.deepseek.com](https://platform.deepseek.com) 的 **Usage** 页面
能看用量。如果发现某天用量异常，多半是有人在刷你的代理——去 Zeabur 把
`RATE_LIMIT` 调小到 10 就能压住。

---

## 常见问题

<details>
<summary><b>代理显示「离线引导流」，但我明明填了 Secret</b></summary>

三个可能，按顺序查：

1. **Secret 名字写错了？** 必须是 `NEXT_PUBLIC_AI_PROXY_URL`，
   大小写和下划线都不能差。
2. **加完 Secret 忘了重新部署？** Secret 只在**构建时**注入。
   必须去 Actions 里 Re-run，或者本地重新 build。
3. **拼写错误？** `NEXT_PUBLIC_AI_PROXY_URL` 的值**不要带结尾斜杠**。
   代理内部会拼 `/chat/completions`，带了斜杠会变成 `//chat/completions`。
</details>

<details>
<summary><b>403「该来源不在允许列表中」</b></summary>

`CORS_ORIGINS` 里少了站点域名。加上：

```
https://3982241557-art.github.io
```

注意**要有 `https://`**，并且**不要带路径**（不要写 `.../courses`）。
</details>

<details>
<summary><b>503「服务端未配置 DEEPSEEK_API_KEY」</b></summary>

环境变量没加上，或者加完没点保存/重新部署。
去 Zeabur 的 **Variables** 页面确认变量名拼写是 `DEEPSEEK_API_KEY`
（**不是** `DEEPSEEK_KEY`、不是 `OPENAI_API_KEY`）。
</details>

<details>
<summary><b>429 请求太频繁</b></summary>

一分钟内超过 20 次了。等一分钟，或去 Zeabur 把 `RATE_LIMIT` 调大。
</details>

<details>
<summary><b>用户不填自己的 Key 也能用 AI 吗？</b></summary>

能。这就是代理存在的意义——**你充的额度统一服务所有用户，零门槛**。

用户如果想用自己的 Key，个人档案抽屉右侧有一栏 **「AI 助教接入」**，
展开折叠的 **「高级设置」** 就能自己填。两条路并存，代理优先。
</details>

<details>
<summary><b>AI 会直接把答案告诉孩子吗？</b></summary>

不会。苏格拉底系统提示词模板在**服务端**（`ai-proxy/server.js` 的
`buildSocraticSystemPrompt`），前端改不了。提示词里写死了六条硬约束：

1. 绝不直接给出答案
2. 用问题推进
3. 给现象不给结论
4. 一次只推进一步
5. 引用教材保持原文
6. 语言跟随界面

而且代理会**主动替换**前端传来的 system message —— 前端就算想改写
「直接告诉我答案」，也会被服务端覆盖掉。
</details>

<details>
<summary><b>代理挂了会怎样？</b></summary>

**不报错，不白屏。**

前端会无缝降级到内置的**结构化苏格拉底引导流**——伴学照样会给出
启发式追问、思考选项、渐进提示，只是没有自由对话。
右上角徽标会显示「离线引导流」，提示当前状态。
</details>

---

## 一句话总结

```
① platform.deepseek.com 拿 sk-xxx
② Zeabur 部署 ai-proxy/，填 DEEPSEEK_API_KEY + CORS_ORIGINS
③ GitHub Secrets 加 NEXT_PUBLIC_AI_PROXY_URL → Actions 重新运行
④ 打开站点，右侧徽标显示「代理已连接」= 成功
```
