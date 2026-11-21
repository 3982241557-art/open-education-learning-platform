# 原版 DeepTutor 主线流程（架构蓝图依据）

> 本文件是「自主学习AI智能平台」脚手架的**架构依据**。
> 每一条都标注了原版 DeepTutor 的真实代码路径，便于日后把壳子接回真实实现。
> 阶段一「跨目录深度拉取」的结论记录于此。

---

## 主线：系统初始化 → 课程元数据 → 进入模块 → Skill 分发 → 提示词链

```
┌─ ① 系统初始化 ────────────────────────────────────────────────────────┐
│ deeptutor/api/main.py                 FastAPI 装配入口                  │
│ deeptutor/api/router_loader.py        按 router_index.json 动态挂载路由  │
│ deeptutor/api/router_index.json       路由清单（带 fingerprint）         │
│ deeptutor/api/module_routes.py        模块级路由聚合                     │
│ deeptutor/app/container.py            依赖容器（服务单例解析）            │
│ deeptutor/app/engine.py               应用引擎（生命周期）                │
│ deeptutor/app/facade.py               对外门面（业务侧只调 facade）       │
│ deeptutor/app/contracts.py            契约层（接口定义）                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ ② 读取课程元数据 ────────────────────────────────────────────────────┐
│ deeptutor/book/models.py              ★ Course/Book 权威数据模型          │
│   Book · Spine · Chapter · Page · Block · Progress · ConceptGraph      │
│ deeptutor/book/storage.py             BookStorage：manifest/spine/pages   │
│ deeptutor/services/path_service.py    路径解析（book_{id}/ 目录约定）      │
│ deeptutor/api/routers/book.py         GET /api/books、/api/books/{id}     │
│ deeptutor/multi_user/book_access.py   权限感知（own / shared）            │
│ deeptutor/services/learning/…         阅读进度与统计                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ ③ 用户点击课程进入模块 ──────────────────────────────────────────────┐
│ web/app/(workspace)/learning/books/…  前端书籍阅读器                    │
│ deeptutor/book/context.py             build_book_context()               │
│   ← 把选中的 page_ids 抽成聊天上下文文本（纯存储，不调 LLM）             │
│ deeptutor/api/routers/sessions.py     会话创建 + 首轮消息                │
│ payload.book_references = [{book_id, page_ids}]                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ ④ 技能空间（Skill Space）路由分发 ───────────────────────────────────┐
│ deeptutor/services/skill/runtime.py   ★ 分层解析核心                     │
│   skill_sources()   优先级：workspace > account > admin > builtin      │
│   runtime_skills()  同名 Skill 时「先到先得」(setdefault 影子化)        │
│   skill_manifest()  渲染系统提示词里的 Skills 段落                     │
│ deeptutor/services/skill/service.py   SkillService（CRUD + frontmatter）  │
│ deeptutor/services/skill/taxonomy.py  Skill 分类法                       │
│ deeptutor/services/skill/hub.py       外部 Hub 导入（eduhub / clawhub）   │
│ deeptutor/skills/builtin/*/SKILL.md   内置 Skill 包                       │
│ deeptutor/multi_user/skill_access.py  管理员授权的 Skill 白名单           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ ⑤ 触发底层 AI 提示词链 ──────────────────────────────────────────────┐
│ deeptutor/services/session/turns/executor.py                            │
│   ├─ build_book_context()      ← 课程内容进上下文                      │
│   ├─ skill_manifest()          ← Skill 清单进上下文                    │
│   ├─ build_inventory()         ← 素材清单（按需读取的索引）             │
│   └─ UnifiedContext(...)       ← 统一上下文对象                        │
│ deeptutor/core/context.py       UnifiedContext 定义（skills_manifest）  │
│ deeptutor/agents/loop/prompt_blocks.py                                   │
│   └─ blocks()  →  PromptBlock("skills", context.skills_manifest)        │
│                   PromptBlock("tools", tool_manifest)                   │
│                   PromptBlock("sources", context.source_manifest)        │
│ deeptutor/agents/loop/native_seed.py  原生工具种子（含 read_skill）     │
│ deeptutor/tools/builtin/__init__.py   read_skill 工具实现               │
│ deeptutor/agents/chat/prompts/{en,zh}/agentic_chat.yaml  最终提示词模板  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 关键机制要点（决定脚手架形态的结论）

### A. Skill 是「清单 + 按需拉取」，不是全量注入

系统提示词里 **每个 Skill 只有一行**：`- **name** — description`。
模型判断任务匹配某个 Skill 后，调 `read_skill(name)` 才拿到完整 `SKILL.md` 正文。

> `deeptutor/services/skill/service.py::render_skills_manifest()`

这决定了 Skill 库 UI 的核心职责是**管理「触发描述」**，而不是管理长文本。

### B. 分层路由 + 影子化

`skill_sources()` 的优先级是 **workspace > account > admin > builtin**，
同名时 `runtime_skills()` 用 `setdefault` —— **先到先得**，
所以用户自建的 Skill 会「影子化」内置的那个。

> `deeptutor/services/skill/runtime.py`

这决定了 Skill 库 UI 必须显示 **来源分层**，并且区分 **只读层**。

### C. `always: true` 的 Skill 是急切注入

带 `always: true` 的 Skill **正文全文**直接进系统提示词，
且从 manifest 列表里排除（避免重复）。

> `deeptutor/services/skill/runtime.py::skill_manifest()`

### D. 课程内容进上下文的方式是「引用 + 按需读取」

课程页面不是把全文塞给模型，而是：
1. `book_references` 携带 `book_id + page_ids`；
2. `build_book_context()` 抽出相关文本作为**新鲜上下文**；
3. `build_inventory()` + `render_manifest()` 生成**素材清单**；
4. 模型用 `read_source` 工具按需拉取具体素材全文。

> `deeptutor/book/context.py`、`deeptutor/services/session/source_inventory.py`

### E. 提示词是「块」的组合

最终系统提示词 = `PromptBlock` 列表拼接，块有稳定/易变之分：

| 块名 | 来源 | 性质 |
| --- | --- | --- |
| `skills` | `skill_manifest()` | 稳定 |
| `tools` | tool manifest | 稳定 |
| `sources` | `render_manifest(inventory)` | 稳定（清单，非全文） |
| `workspace_instructions` | 工作区指令 | 稳定 |
| `persona_style` | persona | 稳定 |
| `memory` / `learning_journal` | 记忆与学习日志 | 稳定 |
| `runtime_snapshot_*` | 易变快照 | 每轮刷新 |

> `deeptutor/agents/loop/prompt_blocks.py`

---

## 本脚手架的对应实现（当前状态）

| 原版 | 本项目 | 状态 |
| --- | --- | --- |
| `deeptutor/book/models.py` | `backend/app/services/course_service.py` 的 dataclass | ✅ 字段对齐（仅作结构参考，不预置数据） |
| `deeptutor/book/storage.py` | `backend/data/courses/*.json` | ✅ 结构占位（template-schema.json） |
| `deeptutor/api/routers/book.py` | `backend/app/routers/courses.py` | ✅ 路由骨架 |
| `deeptutor/services/skill/runtime.py` | `backend/app/services/skill_runtime.py` | ✅ 分层 + 影子化 |
| `deeptutor/services/skill/service.py` | `backend/app/services/skill_service.py` | ✅ frontmatter 解析 + CRUD |
| `deeptutor/tools/builtin` 的 `read_skill` | `backend/app/routers/chat.py` | ⚠️ 仅 mock，未实现按需拉取 |
| `deeptutor/agents/loop/prompt_blocks.py` | `backend/app/services/mock_llm.py` | ⚠️ 仅 mock，未组装 PromptBlock |
| `deeptutor/api/main.py` | `backend/app/main.py` | ✅ 装配入口（去掉鉴权打断） |

### 未接上的三环（壳子边界）

1. **LLM 调用**：`mock_llm.py` 返回静态文本，没有真实的模型请求与流式。
2. **PromptBlock 组装**：没有把 skills / tools / sources 真正拼成系统提示词。
3. **`read_skill` 工具**：模型还不能在运行时主动拉取 Skill 正文。

这三点正是「把壳子变成真实平台」时最先要补的。
