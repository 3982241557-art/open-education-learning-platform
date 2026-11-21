"""
Skill 的运行时路由：解析顺序与按需读取
=======================================

一个地方决定"这次对话能看到哪些 skill"。解析顺序（先到先得，后面的被遮蔽）：

1. **workspace** — 工作区私有的 skill（``data/workspaces/<id>/skills/``）
2. **account** — 当前用户自己的 skill（``data/skills/``）
3. **admin** — 管理员分配给当前用户的 skill
4. **builtin** — 随产品发布的内置 skill，**永远排在最后**

内置层放最后是有意的：即使某个被授权的 admin skill 与内置 skill 同名，
内置的也应该被遮蔽而不是覆盖授权内容。

Manifest 只带一行一行的摘要；完整正文通过 ``read_skill`` 按需拉取。唯一
例外是 ``always: true`` 的 skill，它的正文会立即注入系统提示词。
"""

from __future__ import annotations

from contextvars import ContextVar
from pathlib import Path
from typing import Any, Sequence

from app.services.skill_service import (
    SkillInfo,
    SkillNotFoundError,
    SkillService,
    get_skill_service,
    render_skills_manifest,
)

# skill_runtime.py 位于 backend/app/services/，因此 parents[2] 是 backend/。
DATA_ROOT = Path(__file__).resolve().parents[2] / "data"

# 空的 workspace id 表示"没有选中的工作区"。
library_workspace: ContextVar[str] = ContextVar("skill_library_workspace", default="")


def workspace_skill_service(workspace_id: str) -> SkillService:
    """某个工作区私有的 skill service。"""
    from app.services.workspace_service import get_content_workspace_service

    binding = get_content_workspace_service().validate_chat_binding(workspace_id, existing=True)
    return SkillService(root=binding.root / "skills", builtin_root=None)


def skill_sources(*, workspace_id: str = ""):
    """按优先级产出 ``(service, granted_names, source)`` 三元组。"""
    if workspace_id:
        yield workspace_skill_service(workspace_id), None, "workspace"

    own = get_skill_service()
    yield SkillService(root=own.root, builtin_root=None), None, "account"

    # 管理员分配给当前用户的 skill。
    granted = assigned_skill_ids()
    if granted:
        yield (
            SkillService(
                root=get_admin_skill_service().root,
                builtin_root=None,
                source_label="admin",
                read_only=True,
            ),
            granted,
            "admin",
        )

    # 内置层永远最后，包括被授权的 admin skill 遮蔽同名内置 skill 的情况。
    if own._builtin_root is not None:
        yield (
            SkillService(
                root=own._builtin_root,
                builtin_root=None,
                source_label="builtin",
                read_only=True,
            ),
            None,
            "builtin",
        )


def assigned_skill_ids() -> list[str]:
    """分配给当前用户的 skill 名列表。

    空壳版本没有多用户体系，因此恒为空——但保留这个钩子，后续接真实权限时
    只需填这里。
    """
    return []


def get_admin_skill_service() -> SkillService:
    """共享的管理员 skill 目录。"""
    return SkillService(root=DATA_ROOT / "admin" / "skills")


def runtime_skills() -> dict[str, SkillService]:
    """当前这次对话可见的 skill 名 → service。"""
    from app.services.workspace_service import current_resources
    from app.services.workspace_service import current_workspace_id

    selected = current_resources().skills
    resolved = resolve_skills(workspace_id=current_workspace_id())
    if selected is None:
        return resolved
    return {name: service for name, service in resolved.items() if name in selected}


def engine_skills() -> list[dict[str, Any]]:
    """列出全部「引擎级」skill（``engine: true``）。

    这是「AI 重引擎」原则的可见面：静态教材再多也只是**被读取的素材**，
    而这些引擎决定**怎么教**。前端用它渲染「AI 智能辅导策略选择面板」。
    """
    resolved = runtime_skills()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for service in dict.fromkeys(resolved.values()):
        for entry in service.summary_entries():
            if not entry.engine or entry.name in seen:
                continue
            if resolved.get(entry.name) is not service:
                continue
            seen.add(entry.name)
            out.append(
                {
                    "name": entry.name,
                    "description": entry.description,
                    "available": entry.available,
                    "missing": list(entry.missing),
                }
            )
    return out


def skill_manifest(
    *,
    active_engines: Sequence[str] | None = None,
) -> str:
    """渲染进系统提示词的 Skills 块。

    分两层：

    * **立即注入** —— ``always: true``（全局约定）与 ``engine: true``
      （引擎级启发逻辑）的 skill，其正文直接进系统提示词；
    * **清单** —— 其余 skill 只给一行摘要，模型按需 ``read_skill``。

    这就是「AI 重引擎」原则的落点：静态教材数量再多也只是**被读取的
    素材**，而引擎 skill 才是决定**怎么教**的部分，因此它们的调度权重
    必须高于普通 skill——不能等模型"恰好匹配上"才生效。

    ``active_engines`` 限定本次对话启用哪几个引擎。传 ``None`` 表示全部
    启用；传空列表表示一个都不启用（只留 ``always`` 约定）。
    """
    entries = []
    eager: list[str] = []
    resolved = runtime_skills()
    for service in dict.fromkeys(resolved.values()):
        for entry in service.summary_entries():
            if resolved.get(entry.name) is not service:
                continue
            entries.append(entry)
            if entry.available and (entry.always or entry.engine):
                eager.append(entry.name)

    # 引擎选择：显式传入时，只有被选中的引擎才立即注入。
    if active_engines is not None:
        allowed = {str(name).strip() for name in active_engines}
        eager = [
            name
            for name in eager
            if _is_always(resolved, name) or name in allowed
        ]

    return "\n\n".join(
        part
        for part in (
            _load_eager(resolved, eager),
            render_skills_manifest(entries),
        )
        if part
    )


def _load_eager(resolved: dict[str, SkillService], names: list[str]) -> str:
    """把需要立即注入的 skill 正文渲染成一个区块。

    ``always`` 与 ``engine`` 分开成两个区块，让模型能分辨「必须遵守的
    约定」与「可以调用的启发逻辑」——它们的性质不同，不该混在一起。
    """
    always_names = [n for n in names if _is_always(resolved, n)]
    engine_names = [n for n in names if _is_engine(resolved, n)]

    parts: list[str] = []
    if always_names:
        parts.append(_render_group(resolved, always_names, "Active Skills"))
    if engine_names:
        parts.append(_render_group(resolved, engine_names, "AI Teaching Engines"))
    return "\n\n".join(part for part in parts if part)


def _is_always(resolved: dict[str, SkillService], name: str) -> bool:
    service = resolved.get(name)
    if service is None:
        return False
    return any(
        entry.name == name and entry.always for entry in service.summary_entries()
    )


def _is_engine(resolved: dict[str, SkillService], name: str) -> bool:
    service = resolved.get(name)
    if service is None:
        return False
    return any(
        entry.name == name and entry.engine for entry in service.summary_entries()
    )


def _render_group(
    resolved: dict[str, SkillService], names: list[str], title: str
) -> str:
    """把一组 skill 的正文渲染进一个区块。"""
    bodies: list[str] = []
    for name in names:
        service = resolved.get(name)
        if service is None:
            continue
        bodies.extend(service.load_bodies([name]))
    if not bodies:
        return ""
    return (
        f"## {title}\n"
        "Follow the playbooks below. They override generic defaults.\n\n"
        + "\n\n---\n\n".join(bodies)
    )


def resolve_runtime_skill(name: str) -> SkillService:
    """按名字解析出 skill 所属的 service。"""
    service = runtime_skills().get(name)
    if service is None:
        raise SkillNotFoundError(name)
    return service


# ── 用户当轮选定的技能 ─────────────────────────────────────────────────


def persona_skills() -> list[dict[str, Any]]:
    """列出可作为「回答模式」切换的 skill。

    「回答模式」和「引擎」的区别：

    * **引擎**（``engine: true``）是**默认生效**的启发逻辑，多个可以
      同时叠加——它们决定「怎么教」；
    * **回答模式**是**互斥**的：用户当下选了哪一个，就只用那一个——
      它们决定「用什么身份说话」（苏格拉底导师 / 直言不讳的批评家 /
      费曼技巧导师……）。

    因此这里把 ``persona: true`` 的 skill 单独列出来：用户在对话中途
    切换它们，模型会立刻换一种语气接续同一段对话。
    """
    resolved = runtime_skills()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    for service in dict.fromkeys(resolved.values()):
        for entry in service.summary_entries():
            if not entry.persona or entry.name in seen:
                continue
            if resolved.get(entry.name) is not service:
                continue
            seen.add(entry.name)
            out.append(
                {
                    "name": entry.name,
                    "description": entry.description,
                    "available": entry.available,
                }
            )

    return out


def persona_instruction(name: str) -> str:
    """取出某个「回答模式」skill 的正文。

    这是**当轮替换 system prompt** 的内容来源。找不到时返回空串——
    调用方据此跳过替换，不影响正常对话。
    """
    service = runtime_skills().get(name)
    if service is None:
        return ""

    try:
        detail = service.get_detail(name)
    except (SkillNotFoundError, InvalidSkillNameError):
        return ""

    bodies = service.load_bodies([name])
    if bodies:
        return "\n\n".join(bodies)

    # frontmatter 解析失败等极端情况——退回原始正文。
    return (detail.content or "").strip()


__all__ = [
    "assigned_skill_ids",
    "engine_skills",
    "get_admin_skill_service",
    "library_workspace",
    "persona_instruction",
    "persona_skills",
    "resolve_runtime_skill",
    "resolve_skills",
    "runtime_skills",
    "skill_manifest",
    "skill_sources",
    "visible_skills",
    "workspace_skill_service",
]


def visible_skills(workspace_id: str = "") -> list[tuple[SkillInfo, SkillService]]:
    """某个作用域下可见的 skill 列表（已按遮蔽规则去重）。

    返回 ``(info, 所属 service)``，这样调用方既能拿到元数据，也能知道该
    skill 落在哪一层——写入时必须写到它自己那一层。
    """
    resolved = resolve_skills(workspace_id=workspace_id)
    out: list[tuple[SkillInfo, SkillService]] = []
    for service in dict.fromkeys(resolved.values()):
        for info in service.list_skills():
            if resolved.get(info.name) is not service:
                continue
            out.append((info, service))
    return out


def resolve_skills(workspace_id: str = "") -> dict[str, SkillService]:
    """按优先级解析出可见的 skill 名 → 所属 service。"""
    resolved: dict[str, SkillService] = {}
    for service, granted, _source in skill_sources(workspace_id=workspace_id):
        for info in service.list_skills():
            name = info.name
            if granted is not None and name not in granted:
                continue
            # setdefault：先到先得，后面的层被遮蔽。
            resolved.setdefault(name, service)
    return resolved


__all__ = [
    "assigned_skill_ids",
    "engine_skills",
    "get_admin_skill_service",
    "library_workspace",
    "persona_instruction",
    "persona_skills",
    "resolve_runtime_skill",
    "resolve_skills",
    "runtime_skills",
    "skill_manifest",
    "skill_sources",
    "visible_skills",
    "workspace_skill_service",
]
