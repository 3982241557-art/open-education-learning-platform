"""
FastAPI 应用入口
=================

后端：skill、课程、chat、洞察、学习状态、知识库六组路由。

chat 路由跑完整的「Prompt 组装 → 真实模型 → Action 执行」管线：
模型输出里的 ```` ```action ```` 围栏会被解析成笔记 / 计划 / 测验动作，
落盘后回执给前端执行。

**没有降级到本地规则合成**——模型不可用时明确报错。
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# 必须在导入任何会读环境变量的服务之前加载 .env。
from app.services.env_loader import load_env

load_env()

from app.routers import (  # noqa: E402
    chat,
    courses,
    github_edu,
    hub,
    insight,
    learning,
    profile,
    progress,
    resources,
    skills,
)
from app.services import deploy_config  # noqa: E402
from app.services.llm_factory import NO_KEY_HINT, describe_backend  # noqa: E402
from app.services.patrol_service import (  # noqa: E402
    DEFAULT_INITIAL_DELAY,
    DEFAULT_INTERVAL,
    start_patrol,
)
from app.services.skill_runtime import library_workspace  # noqa: E402
from app.services.workspace_service import get_content_workspace_service  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """应用的启动 / 关停生命周期。

    启动时挂载**后台巡检守护**——每 12 小时自动巡检一次信源池，
    有新视频入库就自动调用 AI 装配自学框架。这是「全网活水」的
    无人值守部分：用户不用做任何事，目录会自己长大。

    关停时取消守护任务——否则会留下悬挂的协程，关掉服务时进程
    不肯退出。
    """
    # 确保默认工作区存在，这样 skill 与课程的本地目录开箱即用。
    get_content_workspace_service().system_binding()

    backend = describe_backend()
    logger.info(
        "自主学习AI智能平台 backend ready · 模型后端: %s (%s)",
        backend["provider"],
        backend["model"],
    )

    # 运行时配置——部署到云平台后看这一行就知道有没有配对。
    runtime = deploy_config.describe()
    logger.info(
        "运行环境: %s · 监听 %s:%s · 跨域来源 %s",
        "生产" if runtime["production"] else "开发",
        runtime["host"],
        runtime["port"],
        (
            "全部放行"
            if not runtime["cors_restricted"]
            else f"{len(runtime['allowed_origins'])} 个白名单域名"
        ),
    )
    if not backend["api_key_configured"]:
        logger.warning(
            "未检测到模型密钥——请在 backend/.env 中填写 DEEPSEEK_API_KEY 后重启服务。"
        )

    # ── 挂载后台巡检守护 ──
    #
    # 没有配模型密钥时不挂——巡检里的「自动装配」那一步必然失败，
    # 只会白跑一轮采集。采集本身还是有价值的，所以**只在没有密钥
    # 时**跳过整轮（宁可不巡检，也不要留下一堆失败的日志）。
    if backend["api_key_configured"]:
        task = start_patrol(
            interval=DEFAULT_INTERVAL,
            initial_delay=DEFAULT_INITIAL_DELAY,
            log=lambda message: logger.info(message),
        )
        logger.info(
            "后台巡检守护已挂载：每 %s 小时巡检一次信源池。",
            DEFAULT_INTERVAL // 3600,
        )
    else:
        task = None
        logger.info("未配置模型密钥——后台巡检守护暂未挂载。")

    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            logger.info("后台巡检守护已关停。")


app = FastAPI(
    title="自主学习AI智能平台",
    description="课程 + 技能空间 + 提示词管线 + 双 AI 协同。模型接入为 OpenAI 兼容接口，支持 DeepSeek。",
    version="0.4.0",
    lifespan=lifespan,
)

# ── 跨域策略 ───────────────────────────────────────────────────
#
# ``ALLOWED_ORIGINS`` 逗号分隔。
#
# 不填 → 放行所有来源（跟本地开发行为一致，部署即能用）。
# 填了 → **严格按它来**，把前端域名加进去即可。
#
# 为什么不默认收紧
# --------------
#
# 这个平台没有登录、没有 Cookie 会话，``allow_credentials=False``。
# 所以「允许任意来源读取公开 API」不会造成越权——那些数据本来就是
# 公开的课程目录。
#
# 而「部署时忘了填导致跨域被拦、页面全白」是**真实发生过**的失败模式。
# 默认放行 + 可选收紧，比默认拦截更不容易让人卡在部署第一步。
#
# 真正要收紧的时候（比如以后加了登录），把 ``ALLOWED_ORIGINS`` 填上
# 就立刻生效。
_CORS_ORIGINS = deploy_config.allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(courses.router, prefix="/api/courses", tags=["courses"])
app.include_router(hub.router, prefix="/api/hub", tags=["hub"])
app.include_router(resources.router, prefix="/api/resources", tags=["resources"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(insight.router, prefix="/api/insight", tags=["insight"])
app.include_router(learning.router, prefix="/api/learning", tags=["learning"])
app.include_router(progress.router, prefix="/api/progress", tags=["progress"])
app.include_router(
    github_edu.router, prefix="/api/resources/github", tags=["github-edu"]
)
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])


@app.middleware("http")
async def bind_skill_workspace(request: Request, call_next):
    """把 ``?skill_workspace=<id>`` 绑到本次请求的 skill 作用域。

    默认走账号层（``backend/data/skills/``）；带上工作区 id 时，
    skill 与课程的读写都切到该工作区私有目录。
    """
    scope = request.query_params.get("skill_workspace") or ""
    token = library_workspace.set(scope)
    try:
        return await call_next(request)
    finally:
        library_workspace.reset(token)


@app.get("/api/health")
async def health() -> dict[str, object]:
    """健康检查。

    云平台的容器健康检查打这个端点。

    它**永远**返回 200——只要进程还活着。因为「模型没配密钥」和
    「服务挂了」是两件完全不同的事：前者还能浏览课程目录，后者是
    整个站点不可用。让前者也返回 503 会导致平台不停重启一个
    其实还能用的容器。

    密钥配没配在 ``api_key_configured`` 字段里明说。
    """
    return {
        "status": "ok",
        "runtime": deploy_config.describe(),
        **describe_backend(),
    }


@app.get("/api/setup/status")
async def setup_status() -> dict[str, object]:
    """模型接入状态。

    没配密钥时 ``needs_setup`` 为 True——前端据此提示用户去填 Key，
    而不是让请求在运行时才失败。

    **占位符密钥算「没配」**：``.env.example`` 里的示例值被原样复制
    过来时，接口会返回 401。与其让用户对着 401 猜，不如在这里就说
    清楚「还没填真正的 Key」。
    """
    backend = describe_backend()
    configured = bool(backend["api_key_configured"])
    return {
        "status": "ready" if configured else "needs_setup",
        "needs_setup": not configured,
        "has_model": configured,
        "model": backend["model"],
        "provider": backend["provider"],
        "mode": backend["mode"],
        "hint": "" if configured else NO_KEY_HINT,
    }


@app.get("/api/workspaces")
async def list_workspaces() -> dict[str, list[dict[str, object]]]:
    service = get_content_workspace_service()
    return {
        "workspaces": [
            {"id": b.id, "name": b.name, "metadata": b.metadata}
            for b in service.list_workspaces()
        ]
    }


__all__ = ["app"]
