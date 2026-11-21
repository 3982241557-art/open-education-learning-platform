"""
工作区（workspace）服务
=======================

一个 workspace 是一份隔离的内容根目录：一个 skill 集合、一组课程、一份
会话历史。原框架里这条链路要穿过 ``services/workspace``、``multi_user``、
``content_workspace`` 等好几层；空壳版本只保留"选中的 workspace 决定
skill 与课程的来源"这一条语义。

当前是本地单用户模式：workspace 列表来自 ``data/workspaces/`` 下的子目录，
没有工作区时自动落到默认工作区 ``default``。
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Any

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
WORKSPACES_ROOT = DATA_ROOT / "workspaces"
DEFAULT_WORKSPACE_ID = "default"

# 当前选中的 workspace id。
_workspace_id: ContextVar[str] = ContextVar("workspace_id", default=DEFAULT_WORKSPACE_ID)

# 当前选中的资源白名单（skill 名列表）。None 表示不限制。
_selected_resources: ContextVar[set[str] | None] = ContextVar(
    "selected_resources", default=None
)


@dataclass(slots=True)
class WorkspaceResources:
    """工作区中选中的资源。``skills`` 为 None 表示"全部可见"。"""

    skills: set[str] | None = None
    courses: set[str] | None = None


@dataclass(slots=True)
class WorkspaceBinding:
    """一个 workspace 的落盘根目录。"""

    id: str
    name: str
    root: Path
    metadata: dict[str, Any] = field(default_factory=dict)


def _safe_id(raw: str) -> str:
    candidate = (raw or "").strip()
    if not candidate or "/" in candidate or "\\" in candidate or candidate.startswith("."):
        return ""
    return candidate


class ContentWorkspaceService:
    """工作区的读写入口。"""

    @property
    def root(self) -> Path:
        return WORKSPACES_ROOT

    def list_workspaces(self) -> list[WorkspaceBinding]:
        out: list[WorkspaceBinding] = []
        if not WORKSPACES_ROOT.exists():
            return out
        for entry in sorted(WORKSPACES_ROOT.iterdir()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            meta = self._read_meta(entry)
            out.append(
                WorkspaceBinding(
                    id=entry.name,
                    name=str(meta.get("name") or entry.name),
                    root=entry,
                    metadata=meta,
                )
            )
        return out

    def get_workspace(self, workspace_id: str) -> WorkspaceBinding:
        safe = _safe_id(workspace_id) or DEFAULT_WORKSPACE_ID
        for binding in self.list_workspaces():
            if binding.id == safe:
                return binding
        # 未知工作区：按需创建，让本地流程不必先手工建目录。
        root = WORKSPACES_ROOT / safe
        root.mkdir(parents=True, exist_ok=True)
        (root / "skills").mkdir(exist_ok=True)
        return WorkspaceBinding(id=safe, name=safe, root=root)

    def system_binding(self) -> WorkspaceBinding:
        """系统级工作区：全局共享的 skill 与课程都落在这里。"""
        return self.get_workspace(DEFAULT_WORKSPACE_ID)

    def validate_chat_binding(self, workspace_id: str, existing: bool = False) -> WorkspaceBinding:
        if existing:
            for binding in self.list_workspaces():
                if binding.id == workspace_id:
                    return binding
            raise KeyError(f"Unknown workspace: {workspace_id}")
        return self.get_workspace(workspace_id)

    @staticmethod
    def _read_meta(root: Path) -> dict[str, Any]:
        meta_path = root / "workspace.json"
        if not meta_path.exists():
            return {}
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    @staticmethod
    def write_meta(workspace_id: str, payload: dict[str, Any]) -> None:
        root = WORKSPACES_ROOT / _safe_id(workspace_id) or DEFAULT_WORKSPACE_ID
        root.mkdir(parents=True, exist_ok=True)
        (root / "workspace.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )


_service: ContentWorkspaceService | None = None


def get_content_workspace_service() -> ContentWorkspaceService:
    global _service
    if _service is None:
        _service = ContentWorkspaceService()
    return _service


def current_workspace_id() -> str:
    return _workspace_id.get()


def set_current_workspace_id(workspace_id: str) -> None:
    _workspace_id.set(_safe_id(workspace_id) or DEFAULT_WORKSPACE_ID)


def current_resources() -> WorkspaceResources:
    return WorkspaceResources(
        skills=_selected_resources.get(),
        courses=_selected_resources.get(),
    )


__all__ = [
    "ContentWorkspaceService",
    "DEFAULT_WORKSPACE_ID",
    "WorkspaceBinding",
    "WorkspaceResources",
    "current_resources",
    "current_workspace_id",
    "get_content_workspace_service",
    "set_current_workspace_id",
]
