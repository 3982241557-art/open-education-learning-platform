# SEEK Learning Platform · 项目状态同步文档

> **更新时间**：2026-11-12
> **当前阶段**：🚨 核心架构革命第一阶段 —— **Resource Aggregator Pivot**（资源枢纽转型）
> **技术栈**：Next.js (App Router) + TypeScript / FastAPI + Python
> **视觉体系**：莫兰迪三色（`#FFFAF4` 暖白 / `#F4F6F8` 冷灰 / `#FDFBF8` 卡片 / `#F3D6D2` 强调），左中右三栏物理排版

---

## 1. 核心定位（本次变更的根因）

平台已从「**本地正文阅读器**」转型为「**全网开放资源连接枢纽**」：

| | 旧定位 | 新定位 |
|---|---|---|
| 内容归属 | 平台托管正文（Book → Chapter → Text Block） | 平台只调度外链（Topic → Node → Resource[]） |
| 中间栏 | 渲染本地文字块 | 渲染外部视频 / 网页 / 文档 |
| AI 角色 | 讲解课程正文的助教 | 陪用户一起看/读外部资源的「**超级陪读**」 |
| AI 的短板 | 能读全文 | **看不见**外部视频/网页，靠预置 `ai_context` 补齐 |

---

## 2. 最新核心目录树

```
SEEK-Learning-Platform/
├── .cursorrules                      # GitHub 开源模块自动抓取规范
├── README.md
├── docs/
│   └── ARCHITECTURE-BLUEPRINT.md
│
├── backend/                          # ── FastAPI 后端 ──
│   ├── app/
│   │   ├── main.py                   # 应用入口 / CORS / 路由挂载
│   │   ├── routers/
│   │   │   ├── chat.py               # ★ 聊天路由（新增 resource 注入）
│   │   │   ├── courses.py            # 课程 CRUD
│   │   │   ├── insight.py            # 学情中心
│   │   │   ├── learning.py           # 进度 / 笔记 / 计划
│   │   │   └── skills.py             # 技能管理
│   │   └── services/
│   │       ├── course_service.py     # ★ 核心数据模型（hub 解析与投影）
│   │       ├── course_context.py     # ★ AI 课程上下文（含资源格式化）
│   │       ├── prompt_assembly.py    # ★ System Prompt 组装（超级陪读人格）
│   │       ├── action_protocol.py    # AI 动作协议
│   │       ├── advisor_service.py    # 宏观学习向导
│   │       ├── bilingual_service.py  # 双语
│   │       ├── insight_service.py    # 学情统计
│   │       ├── learning_state.py     # 学习状态机
│   │       ├── llm_connector.py      # LLM 连接
│   │       ├── llm_factory.py        # 多厂商工厂
│   │       ├── material_import.py    # 素材导入
│   │       ├── plan_calendar.py      # 计划日历
│   │       ├── progress_service.py   # 进度计算
│   │       ├── skill_runtime.py      # 技能运行时
│   │       ├── skill_service.py      # 技能服务
│   │       ├── taxonomy.py           # 分类体系
│   │       ├── text_normalize.py     # 文本归一
│   │       └── workspace_service.py  # 工作区隔离
│   ├── data/
│   │   ├── courses/                  # ★ 课程 JSON（新增 philosophy_hub.json）
│   │   │   ├── philosophy_hub.json   # ★ 新范式：资源枢纽型课程
│   │   │   ├── template-schema.json  # 结构模板（非课程）
│   │   │   ├── classic_*.json        # 古典文本课程
│   │   │   ├── oer_*.json            # OER 导入课程
│   │   │   └── demo_python101.json
│   │   ├── sessions/                 # 逐课会话数据（notes/plans/quizzes）
│   │   ├── skills/                   # 用户技能库（SKILL.md × 18）
│   │   ├── translations/             # 双语对照
│   │   └── workspaces/default/skills/
│   ├── skills/builtin/               # 内置引擎（6 个 SKILL.md）
│   ├── tests/                        # context_budget / plan_calendar / smoke
│   └── requirements.txt
│
├── scripts/
│   ├── verify_resource_hub.py        # ★ 本次新增：36 项集成验证
│   ├── verify_telemetry.py
│   ├── audit_block_payloads.py
│   ├── dev.sh / backend.sh / frontend.sh
│   ├── fetch_global_oer.py / fetch_poetry.py / fetch_awesome_prompts.py
│   ├── batch_import_classics.py / import_university_courses.py
│   └── renormalize_courses.py / build_bilingual.py / purge_seed_progress.py
│
└── web/                              # ── Next.js 前端 ──
    ├── app/
    │   ├── layout.tsx / globals.css
    │   └── (workspace)/
    │       ├── layout.tsx
    │       ├── page.tsx               # 首页
    │       ├── learning/
    │       │   ├── page.tsx           # 课程库
    │       │   ├── new/page.tsx
    │       │   ├── books/page.tsx
    │       │   └── courses/[courseId]/
    │       │       ├── page.tsx       # ★ 三栏阅读页（主战场）
    │       │       └── edit/page.tsx  # 课程编辑器
    │       ├── plan/page.tsx          # 学习计划
    │       ├── space/skills/page.tsx  # 技能空间
    │       └── settings/page.tsx
    ├── components/
    │   ├── ai/
    │   │   ├── MainAiPanel.tsx        # 主 AI 对话
    │   │   ├── MacroAdvisor.tsx       # 宏观学习向导
    │   │   ├── ActionChips.tsx / InteractiveQuiz.tsx
    │   │   ├── SelectionToolbar.tsx   # 划词工具栏
    │   │   ├── InsightIndicator.tsx / ErrorNotice.tsx
    │   ├── learning/
    │   │   ├── UniversalMediaViewer.tsx  # ★ 全能媒体渲染器（新增）
    │   │   ├── InteractiveReader.tsx     # ★ 资源分发 + RESOURCE_ACTIVATED
    │   │   ├── LearningShell.tsx / LearningCard.tsx
    │   │   ├── BlockRenderer.tsx / VideoBlock.tsx / ConceptNode.tsx
    │   │   ├── ArchiveDrawer.tsx / CourseEditor.tsx / CourseLibrary.tsx
    │   │   ├── ProgressRing.tsx / HighlightStylePicker.tsx
    │   │   └── useReadingTelemetry.ts
    │   ├── layout/  AppShell / SplitPane / FeaturePage
    │   ├── common/  Markdown / MermaidChart / ExpandableTable / FullscreenModal
    │   ├── plan/    CalendarView / CalendarToolbar
    │   ├── sidebar/ WorkspaceSidebar / nav-entries
    │   ├── settings/SetupStatusCard
    │   ├── space/   SkillsSection
    │   └── ui/      LikeButton
    ├── context/
    │   ├── ChatContext.tsx          # ★ 订阅资源事件 → 注入 AI 请求
    │   ├── ReaderContext.tsx / AiPresenceContext.tsx / AppShellContext.tsx
    ├── lib/
    │   ├── courses-api.ts           # ★ Resource/Hub 类型与归一化
    │   ├── learning-events.ts        # ★ seek:resource-activated 事件
    │   ├── video-source.ts           # 视频源解析（YouTube / B站）
    │   ├── ai-sanitize.ts / concept-actions.ts / taxonomy.ts
    │   ├── course-status.ts / insight-api.ts / learning-api.ts
    │   ├── material-api.ts / skills-api.ts / mermaid.ts / cn.ts / branding.ts
    ├── shared/api/client.ts          # 统一请求封装
    ├── scripts/
    │   ├── verify-media.ts           # 45 项
    │   ├── verify-sanitize.ts        # 15 项
    │   └── verify-error-notice.ts    # 14 项
    └── package.json / tailwind.config.js / next.config.js / tsconfig.json
```

> 标注 ★ 的为本轮迭代新增或重度修改的文件。

---

## 3. 最新迭代的核心代码逻辑

### 3.1 数据层：Topic → Node → Resource[]

**`backend/app/services/course_service.py`**

关键在于**投影而非断裂** —— hub 数据被投影成既有 Chapter/Page/Block（`type: "resource"`），因此遥测、进度、划线批注、AI 课程上下文、学习向导全部零改动复用。

```141:141:backend/app/services/course_service.py
RESOURCE_TYPES = frozenset({"video", "webpage", "document"})
```

```819:820:backend/app/services/course_service.py
    if isinstance(raw.get("hub"), dict):
        return course_from_hub_dict(raw, source=source)
```

`course_from_hub_dict()` 负责：
1. 解析 `hub.topics[]` → `CourseTopic`
2. 解析每个 topic 下的 `nodes[]` → `CourseNode`（必须带非空 `resources[]`）
3. 解析 `resources[]` → `CourseResource`（校验 `resource_type` 合法性、`url` 非空）
4. **投影**：Topic → Chapter、Node → Page、Resource → Block（`type: "resource"`），节点摘要写入 `page.summary`
5. 返回带 `is_hub=True` 的 `Course`

写回必须无损，因此 `course_to_dict()` 在 `is_hub` 时额外序列化 `hub` 段：

```1443:1446:backend/app/services/course_service.py
    if course.is_hub:
        payload["hub"] = {
            "id": course.id,
            "title": course.title,
```

`update_course()` 的合并段落列表也包含 `"hub"`，避免一次局部编辑把图谱压扁：

```1618:1618:backend/app/services/course_service.py
        for section in ("book", "spine", "pages", "progress", "hub"):
```

### 3.2 前端类型层

**`web/lib/courses-api.ts`**

```69:69:web/lib/courses-api.ts
export type ResourceType = "video" | "webpage" | "document";
```

新增 `Resource` / `HubNode` / `HubTopic` / `Hub` 接口，`normalizeCourse()` 挂载 `hub: normalizeHub(raw?.hub)`，`normalizeResource()` 做字段兜底（`resource_type` 默认 `webpage`）。

**`web/lib/learning-events.ts`**

```ts
export const RESOURCE_ACTIVATED = "seek:resource-activated";
```

配套 `ResourceActivatedDetail`：`{ resourceId, title, resourceType, url, provider, aiContext }`。

### 3.3 中间栏：全能媒体渲染器

**`web/components/learning/UniversalMediaViewer.tsx`**（新增）

两层结构：

```
┌─ 资源切换器（横向 tab 卡片） ────────────────────┐
│  [▶ 视频]  [🌐 维基百科]  [📄 斯坦福哲学百科]      │
└───────────────────────────────────────────────────┘
┌─ 白色悬浮卡片（bg-[var(--card)] + seek-shadow-paper）─┐
│  按 resource_type 分发：                            │
│  video    → react-player / iframe                  │
│  webpage  → 安全 iframe（域名白名单附加同源）        │
│  document → PDF iframe / 外链降级卡片                │
└───────────────────────────────────────────────────┘
```

核心分发逻辑（`ResourceRenderer`）：

- **video**：`resolveVideo({url, title})` 判定来源
  - YouTube / 直链媒体 → `<ReactPlayer>`（宽屏、`playsInline`、`preload="metadata"`）
  - B 站 → `//player.bilibili.com` iframe，sandbox 含 `allow-same-origin`（播放器需自写 cookie 记住进度）
- **webpage**：`<iframe>` + `referrerPolicy="no-referrer"`
  - 默认严格隔离 `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`
  - 白名单域名附加 `allow-same-origin`
- **document**：`.pdf` 走内嵌 iframe，否则 `DocumentPlaceholder` 降级为外链卡片
- 加载期间用 `LoadingVeil` 呼吸遮罩，避免第三方慢加载被误判为「资源挂了」
- 外壳统一：`rounded-xl bg-[var(--card)] p-3.5 shadow-[var(--seek-shadow-paper)]`

### 3.4 资源 → AI 的上下文通信

**链路：**

```
InteractiveReader 切换资源
  → emitLearningEvent(RESOURCE_ACTIVATED, {title, url, ai_context, ...})
  → ChatContext 订阅捕获 → setCurrentResource + currentResourceRef
  → /api/chat 请求体注入 resource: { title, resource_type, url, provider, ai_context }
  → chat.py 的 _build_resource_context() 渲染成文字
  → PromptAssembler.assemble(resource_context=...) → 追加「超级陪读」区块
```

**`web/context/ChatContext.tsx`**

用 **state + ref 双份**保存当前资源：state 用于渲染，ref 用于 `send()` 读取 —— 避免因资源变化而重建订阅 `CONCEPT_ACTIVATED` 的 effect。

```537:547:web/context/ChatContext.tsx
        resource: (() => {
          const resource = currentResourceRef.current;
          if (!resource) return null;
          return {
            title: resource.title,
            resource_type: resource.resourceType,
            url: resource.url,
            provider: resource.provider,
            ai_context: resource.aiContext,
          };
        })(),
```

**`backend/app/routers/chat.py`**

```96:99:backend/app/routers/chat.py
    #: 资源枢纽型课程里，用户看的是外部视频 / 网页 / 电子书。AI 看不见
    #: 这些内容，只能靠前端把「当前资源」的元数据与预置摘要传过来。
    resource: dict[str, str] | None = None
```

`_build_resource_context()` 只保留**真正有信息量**的字段（标题 + 摘要），链接对模型无意义但保留以便准确指代。

**`backend/app/services/prompt_assembly.py`**

`_resource_context_block()` 追加到 system prompt，切换人格为「超级陪读」：

```350:353:backend/app/services/prompt_assembly.py
                "你现在是用户的**超级陪读**。\n\n"
                "用户当前正在中间屏幕观看/阅读一份外部资源（详见下方"
                "「当前资源」区块）。请基于这些信息，引导用户深度思考，"
```

并写入**诚实的知识边界**：模型没真的看过视频，摘要没覆盖的部分应明说「这段我这边没有材料」，**不要编造**。

### 3.5 中间栏分发入口

**`web/components/learning/InteractiveReader.tsx`**

在 `PageSection` 中检测 hub 资源：

```611:615:web/components/learning/InteractiveReader.tsx
          <UniversalMediaViewer
            resources={hubResources}
            activeResourceId={activeResource?.id ?? null}
            onResourceChange={(resource) => setActiveResourceId(resource.id)}
          />
```

资源切换后静默广播（不弹窗、不打扰）：

```482:487:web/components/learning/InteractiveReader.tsx
  useEffect(() => {
    if (!activeResource) return;
    emitLearningEvent(RESOURCE_ACTIVATED, {
      resourceId: activeResource.id,
      title: activeResource.title,
```

### 3.6 三栏物理排版（保持不变）

**`web/app/(workspace)/learning/courses/[courseId]/page.tsx`**

- `SplitPane` 可拖拽分隔条，左右比例记入 `localStorage`（键 `seek.reader.splitRatio`，默认 0.66）
- 左栏：`ArchiveDrawer`（留存文档 240px）+ 中栏正文
- 中栏底色 `bg-[var(--seek-cool)]`（莫兰迪冷灰 `#F4F6F8`），正文卡片纯白 → 「桌面上放着白纸」的悬浮感
- 右栏 `bg-[var(--seek-warm)]`（暖白），上 `MacroAdvisor`、下 `MainAiPanel`

---

## 4. 本轮完成的功能与修复的 Bug

### ✅ 4.1 新功能

| # | 功能 | 落地位置 |
|---|---|---|
| 1 | **资源枢纽数据模型**：新增 `RESOURCE_TYPES` 枚举、`CourseResource/CourseNode/CourseTopic` 数据类、`hub` 段序列化与无损写回 | `backend/app/services/course_service.py` |
| 2 | **测试课程**：`philosophy_hub.json`，2 个 Topic / 3 个 Node / 7 条真实外链资源（B站 ×3、Wikipedia ×3、SEP ×1），每条带详尽 `ai_context` | `backend/data/courses/philosophy_hub.json` |
| 3 | **全能媒体渲染器**：按 `resource_type` 动态分发 `react-player` / 安全 iframe / 文档查看器，统一白色悬浮卡外壳 | `web/components/learning/UniversalMediaViewer.tsx`（新增） |
| 4 | **资源切换器**：横向 tab 卡片 + 资源元信息头 + 「打开」外链按钮 | 同上 |
| 5 | **资源感知 AI 上下文总线**：`seek:resource-activated` 事件 → ChatContext → `/api/chat` → System Prompt | `web/lib/learning-events.ts`、`web/context/ChatContext.tsx`、`backend/app/routers/chat.py` |
| 6 | **「超级陪读」人格**：中英双语 System Prompt 区块，含知识边界纪律 | `backend/app/services/prompt_assembly.py` |
| 7 | **AI 课程上下文支持资源条目**：`_format_resource()` 输出 `[类型] 标题 · 来源` + 摘要 + 字幕 | `backend/app/services/course_context.py` |
| 8 | **前端类型层**：`ResourceType` / `Resource` / `HubNode` / `HubTopic` / `Hub` + 归一化函数 | `web/lib/courses-api.ts` |
| 9 | **自动化集成测试**：36 项覆盖数据模型、投影、AI 上下文、Prompt 注入、幂等性、回归 | `scripts/verify_resource_hub.py`（新增） |

### 🐛 4.2 修复的 Bug

| # | Bug | 现象 | 根因 | 修复 |
|---|---|---|---|---|
| 1 | **Wikipedia iframe 渲染空白** | iframe 一片白，直接访问同一 URL 却完全正常 | 被嵌入页面拿不到 `allow-same-origin` → origin 变成 opaque，同源脚本/样式被浏览器判跨域拦截（维基 CSP 无 `frame-ancestors` 限制但重度依赖同源脚本） | 新增 `NEEDS_SAME_ORIGIN` 域名白名单（`wikipedia.org` / `wikimedia.org` / `plato.stanford.edu` / `archive.org` 等），按需选择性放宽 |
| 2 | **hub 结构写回后丢失** | 编辑一次课程后，Topic→Node→Resource 图谱被拍平成纯文本课程 | `course_to_dict()` 原本只还原 `book/spine/pages/progress` 四段，`hub` 被丢弃 | `course_to_dict()` 在 `is_hub` 时额外序列化 `hub` 段；`update_course()` 合并列表加入 `"hub"` |
| 3 | **`prompt_assembly.py` 缩进错误** | Python 导入直接报 IndentationError | `_active_skill_block` docstring 缩进错位 | 修正缩进 |
| 4 | **`CourseEditor` TypeScript 编译失败** | `tsc --noEmit` 报错 | `DraftPage` 类型缺 `summary` 字段 | 补齐 `summary` 字段与默认映射 |

### ✅ 4.3 验证结果

| 项目 | 结果 |
|---|---|
| `scripts/verify_resource_hub.py` | **36 / 36 通过** |
| `web/scripts/verify-media.ts` | 45 / 45 通过 |
| `web/scripts/verify-sanitize.ts` | 15 / 15 通过 |
| `web/scripts/verify-error-notice.ts` | 14 / 14 通过 |
| `tsc --noEmit` | 0 错误 |
| 浏览器端到端 | B站播放器 / Wikipedia iframe / SEP iframe 渲染正常；资源切换后 AI 立即引用当前资源摘要作答 |

### 🧪 4.4 端到端行为验证实录

在 hub 课程页实测对话：

- **「这里的荒诞到底指什么？」** → AI 引用**当前视频**中的说法作答，并横向对照另两条资源（维基把「荒诞」列为存在主义共同主题、SEP 第 5 节点出加缪拒绝「存在主义者」标签）
- **「这篇 SEP 文章的第 5 节是怎么定位加缪的？」** → AI 明确说明「我手上只有摘要层的信息，没有第 5 节正文」，列出可确认部分、说明缺什么材料、反问用户把段落贴过来

这正是「超级陪读」应有的**诚实边界感** —— AI 不能「看」视频，靠预置摘要因而不吹牛。

---

## 5. 待办 / 下一步建议

1. **通用化外链课程 schema**：把 `philosophy_hub.json` 的格式抽成可批量导入的通用「外链课程」schema
2. **资源级学习埋点**：目前进度挂在 Node 上，可下沉到 Resource（看了哪条视频、读完了哪篇网页）
3. **资源发现 / 推荐入口**：让枢纽不只是静态目录（按 Topic 聚合外链、按用户薄弱点推荐）
4. **「超级陪读」覆盖非 hub 课程**：当前 `resource_context` 仅在 hub 场景生效，可推广为通用「当前上下文」通道

---

## 6. 已知限制

- 项目**尚未初始化 git 仓库**（`git status` 报 `not a git repository`），无法做版本回溯与分支管理
- 第三方外链的可用性依赖对方站点（链接失效、限流、CSP 变更均可能导致渲染失败），目前仅有静态白名单应对
- `ai_context` 为人工预置摘要，尚未接入自动摘要生成管道
