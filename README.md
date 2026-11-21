# 开放教育学习平台 · Open Education Learning Platform

一个**可视化的架构蓝图与脚手架**。它的目标不是「一个有假内容的 Demo」，而是：

- 把原版 DeepTutor 的主线流程（系统初始化 → 课程元数据 → 进入模块 → Skill 分发 → 提示词链）
  完整地画出来，让每一段都能在界面上被看见、被点击、被对照源码；
- 在数据位上**只留结构占位，不预置任何假课程**——你想放什么课程，就按结构自己投；
- 底层保留一条**可以随时接上真实模型**的通道，但默认全程 Mock，**没有 API Key 也能跑**。

> 架构依据与原版代码路径的逐条对照，见 [`docs/ARCHITECTURE-BLUEPRINT.md`](docs/ARCHITECTURE-BLUEPRINT.md)。

---

## 快速开始

```bash
# 一键启动（后端 :8001 + 前端 :3000）
./scripts/dev.sh

# 或者分开启动
./scripts/backend.sh     # FastAPI  → http://localhost:8001
./scripts/frontend.sh    # Next.js  → http://localhost:3000
```

首次运行需要装依赖：

```bash
cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cd ../web && npm install
```

打开 <http://localhost:3000> 即可。**不需要登录，不需要配置模型，不需要 API Key。**

---

## 这个平台长什么样

侧边栏每一项都是一个「模块说明书」页，统一用三段式呈现：

| 段落 | 内容 |
| --- | --- |
| **核心用途** | 这个模块在平台上负责什么 |
| **对应 DeepTutor 的底层映射** | 原版的哪个组件路径 / 数据流，附一句它具体做了什么 |
| **未来开发指南** | 接真实平台时，这里需要对接什么数据 |

外加一段**「在主干上的位置」**，用箭头串出它在主干的哪一环。

| 路径 | 模块 | 主干位置 |
| --- | --- | --- |
| `/` | 首页 | 系统初始化 · 提示词链（含提问链路演示） |
| `/learning` | 课程 | 课程元数据（Course 数据结构解剖） |
| `/learning/books` | 课程手册 | 内容块检索 |
| `/space` | 技能空间 | Skill 分层路由 |
| `/space/skills` | Skill 库 | Prompt 包的 CRUD |
| `/settings` | 设置 | 运行状态自检 |

---

## 目录结构

```
SEEK-Learning-Platform/
├── backend/                     FastAPI 后端
│   ├── app/
│   │   ├── main.py              应用入口、CORS、作用域中间件
│   │   ├── routers/
│   │   │   ├── chat.py          POST /api/chat（走 mockResponse）
│   │   │   ├── courses.py       /api/courses/*
│   │   │   └── skills.py        /api/skills/*
│   │   └── services/
│   │       ├── mock_llm.py      ★ mockResponse 所在处
│   │       ├── course_service.py    本地 JSON 课程 CRUD
│   │       ├── skill_service.py     SKILL.md 包 CRUD + frontmatter 解析
│   │       ├── skill_runtime.py     ★ Skill 分层路由与 manifest 注入
│   │       └── workspace_service.py 工作区上下文
│   ├── skills/builtin/          内置 Skill（只读）
│   │   ├── course-explainer/SKILL.md
│   │   ├── house-rules/SKILL.md      (always: true)
│   │   └── socratic-tutor/SKILL.md
│   └── data/                    ★ 你的本地数据都在这里
│       ├── courses/             课程 JSON（投放即生效）
│       │   └── template-schema.json  ★ Course 结构模板（JSON Schema）
│       ├── skills/              用户 Skill（可在 UI 里创建）
│       └── workspaces/<id>/     工作区私有数据
└── web/                         Next.js 15 App Router 前端
    ├── app/(workspace)/         路由组：首页 / 学习 / 技能空间 / 设置
    ├── components/
    │   ├── blueprint/           ★ BlueprintCard（说明书面板与结构占位）
    │   ├── layout/              AppShell、FeaturePage（统一页头与栅格）
    │   ├── sidebar/             侧边导航
    │   ├── learning/            LearningShell / CourseEditor / CourseHandbook
    │   └── space/               SkillsSection（Skill 库 UI）
    ├── lib/
    │   ├── branding.ts          ★ 全局品牌信息（改一处全站生效）
    │   └── blueprints.ts        ★ 模块蓝图登记表（说明书的单一真值）
    └── context/AppShellContext.tsx
```

---

## 投放你自己的课程

### 结构模板

`backend/data/courses/template-schema.json` 是一份完整的 **JSON Schema**，描述了 Course 的每一个字段、
枚举取值，以及各 `type` 内容块的 `payload` 形状约束。

它**不是**一门课——后端扫描课程目录时会跳过它。

Course 数据分四段，与原版 DeepTutor 的 Book Engine（`deeptutor/book/models.py`）严格对齐：

| 段 | 对应原版模型 | 说明 |
| --- | --- | --- |
| `book` | `Book` | 课程元数据：`id` / `title` / `status` / `language` / `depth` / `metadata` … |
| `spine` | `Spine` + `Chapter` + `ConceptGraph` | 章节树与概念图 |
| `pages` | `Page` + `Block` | 页面与内容块 |
| `progress` | `Progress` | 阅读进度、答题记录、薄弱章节 |

### 方式一：直接写文件（推荐）

在 `backend/data/courses/` 下新建 `<book.id>.json`，按 `template-schema.json` 填。

文件名必须等于 `book.id`。保存后刷新 `/learning`，课程就出现在列表里了。

- `book.id` 只能用字母、数字、下划线和连字符（`^[A-Za-z0-9_-]{1,64}$`）。
- `book.status` 取自原版枚举：`draft` / `spine_ready` / `compiling` / `paused` / `ready` / `error` / `archived`。
- `content_type` 取自 `theory` / `derivation` / `history` / `practice` / `concept` / `overview`。
- `book.depth` 取自 `brief` / `standard` / `deep`。
- `page_count` / `chapter_count` 以实际内容为准，**不用手填**。
- `created_at` / `updated_at` 是 epoch 秒；缺省时按文件 mtime 处理。

### 方式二：走界面

访问 <http://localhost:3000/learning/new>，填表保存即可，落地仍是同一个 JSON 格式。
也可以在课程详情页点「编辑」修改已有课程。

### 内容块（Block）

一个页面由若干内容块组成，`type` 与 `payload` 的形状照抄原版各 BlockGenerator 的返回值：

| `type` | `payload` 字段 |
| --- | --- |
| `text` | `format` `role` `body` |
| `callout` | `variant`（`key_idea` / `common_pitfall` / `summary` / `tip`）`label` `body` |
| `code` | `language` `code` `explanation` `intent` |
| `quiz` | `topic` `questions[]`（每题含 `question_id` `question` `options{}` `correct_answer` `explanation` `difficulty` `concentration`） |
| `flash_cards` | `cards[]`（每张含 `front` `back` `hint`） |
| `section` | `format` `intro` `subsections[]` `key_takeaway` `focus` `role` |

其它类型（`figure` / `interactive` / `animation` / `timeline` / `concept_graph` / `deep_dive` …）
也可以写，前端会原样摊开 `payload` 便于排查。

---

## Skill 的本地加载与路由机制

### 分层解析（先到先得，后面的被遮蔽）

| 层级 | 路径 | 说明 |
| --- | --- | --- |
| workspace | `backend/data/workspaces/<id>/skills/` | 工作区私有 |
| account | `backend/data/skills/` | 当前用户自己的，UI 里创建的落这里 |
| admin | `backend/data/admin/skills/` | 管理员分配（当前为空，保留钩子） |
| builtin | `backend/skills/builtin/` | 随产品发布，**永远排最后**，只读 |

内置层放最后是有意的：即使某个被授权的 admin skill 与内置 skill 同名，被授权的也应该**遮蔽**内置的，
而不是相反。

作用域由 URL 上的 `?skill_workspace=<id>` 决定：

- **不带**（默认）→ 账号层 `backend/data/skills/`；
- **带** → 该工作区私有目录 `backend/data/workspaces/<id>/skills/`。

两种作用域下读取到的都是**合并视图**（含账号层与内置层），只有写入会落到各自的层。
内置层始终只读：改 / 删内置 skill 会返回 403。

### 注入方式

Skill 不是一次性全塞进上下文，而是分两种：

1. **manifest（按需读取）** — 系统提示词里只放一行摘要：
   ```
   - **socratic-tutor** — 苏格拉底式导师——先用问题引导学习者自己推出答案……
   ```
   模型判断任务匹配后，再调 `read_skill(name)` 拉全文。

2. **`always: true`（立即注入）** — 正文直接拼进系统提示词的 `## Active Skills` 段。
   仓库里的 `house-rules` 就是这种，它定义全局行为约定（始终中文回答、引用课时标注来源等）。

### SKILL.md 格式

```markdown
---
name: my-skill
description: manifest 中显示的一行摘要
tags:
  - teaching
always: false
requires: []
---

# My Skill

这里写正文 playbook……模型通过 read_skill 读到的就是这部分。
```

- `name` 只能是小写字母、数字、连字符。
- `tags` 也可以单独存在 `backend/data/skills/.tags.json` 里管理，UI 的「管理标签」就是改这个文件。
- `requires` 目前只是元数据，不做实际校验。

在 <http://localhost:3000/space/skills> 可以直接新建 / 编辑 / 删除用户 Skill（内置的只读）。

### 验证当前注入了什么

```bash
curl -s http://localhost:3000/api/chat/manifest | python3 -m json.tool
```

首页的「提问链路演示」面板也会实时展示这份清单。

---

## API 速查

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，`{"status":"ok","mock_llm":true}` |
| GET | `/api/setup/status` | 恒为 ready，无强制配置打断 |
| GET | `/api/workspaces` | 工作区列表 |
| GET | `/api/courses/list` | 课程列表（跳过 template-schema.json） |
| GET | `/api/courses/template-schema` | ★ Course 结构模板（JSON Schema） |
| GET | `/api/courses/{id}` | 课程详情 |
| POST | `/api/courses/create` | 新建课程 |
| PUT | `/api/courses/{id}` | 更新课程 |
| DELETE | `/api/courses/{id}` | 删除课程 |
| GET | `/api/skills/list` | Skill 合并列表（含 builtin） |
| GET | `/api/skills/{name}` | Skill 详情 |
| POST | `/api/skills/create` | 新建 Skill |
| PUT | `/api/skills/{name}` | 更新 Skill |
| DELETE | `/api/skills/{name}` | 删除 Skill |
| GET/POST/PUT/DELETE | `/api/skills/tags/*` | 标签词表管理 |
| POST | `/api/chat` | 对话，恒返回 `模拟回复内容` |
| GET | `/api/chat/manifest` | 当前注入的 Skill 清单 |

前端通过 Next.js 的 rewrite 把 `/api/*` 代理到 `http://localhost:8001/api/*`，浏览器侧不用管跨域。

---

## 从蓝图走到真实平台：还差什么

三件事，按优先级排：

1. **真实模型调用** — `backend/app/services/mock_llm.py` 目前返回静态文本。替换 `complete()` / `stream()`
   的实现即可，签名已与原版 `factory` 对齐。
2. **PromptBlock 组装器** — 把 `skills_manifest` / `tool_manifest` / `source_manifest` / `persona` /
   `memory` 真正拼成系统提示词。原版参考 `deeptutor/agents/loop/prompt_blocks.py`。
3. **`read_skill` 工具** — 让模型能在对话中主动拉取 Skill 正文。原版参考
   `deeptutor/tools/builtin/__init__.py` 中 `read_skill` 的实现。

每一处的原版对照路径，都写在对应页面的「未来开发指南」面板里。
