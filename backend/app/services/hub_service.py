"""
外链课程（Resource Hub Course）服务
====================================

平台从「本地正文阅读器」转型为「全网开放资源连接枢纽」之后，作者要写
的东西**变简单了**：不再是 Book → Chapter → Text Block 的四段重结构，
而是「主题 → 节点 → 外链资源」三样。

本模块提供三件事：

1. **批量导入** —— :func:`import_hub_directory` 把一个目录里的作者
   JSON 逐个补全并落盘。这是「整站资源一次性导入」的入口。
2. **结构 schema** —— :func:`hub_schema` 读出作者格式的 JSON Schema。
3. **资源总表** —— :func:`flatten_resources` 把各门课的资源拍平成一张
   跨课程的表，供「资源发现」入口使用。

归一化逻辑在 :mod:`app.services.hub_normalize`（纯函数，不依赖本模块，
以免与 ``course_service`` 形成循环导入）。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services.course_service import (
    COURSES_ROOT,
    Course,
    CourseError,
    get_course_service,
)
from app.services.hub_normalize import (
    HubFormatError,
    normalize_hub_payload,
)

#: 结构 schema 的文件名——它描述格式，不是内容，扫描时会被跳过。
HUB_SCHEMA_FILENAME = "hub_schema.json"


# ── 导入 ────────────────────────────────────────────────────────────────


def import_hub_payload(
    raw: dict[str, Any],
    *,
    workspace_id: str = "",
    overwrite: bool = False,
) -> Course:
    """把一份作者 JSON 导入成课程。

    :param overwrite: 目标 id 已存在时是否覆盖。为 ``False`` 时抛
        :class:`CourseError`。
    """
    try:
        payload = normalize_hub_payload(raw)
    except HubFormatError as exc:
        raise CourseError(str(exc)) from exc

    service = get_course_service()

    course_id = payload["hub"]["id"]
    try:
        existing = service.get_course(course_id, workspace_id=workspace_id)
    except CourseError:
        existing = None

    if existing is not None:
        if not overwrite:
            raise CourseError(f"课程已存在：{course_id}")
        return service.update_course(
            course_id, payload, workspace_id=workspace_id
        )

    return service.create_course(payload, workspace_id=workspace_id)


def import_hub_directory(
    directory: str | Path,
    *,
    workspace_id: str = "",
    overwrite: bool = False,
) -> dict[str, Any]:
    """批量导入一个目录下的所有外链课程 JSON。

    这是「整站资源一次性导入」的入口——作者把一个目录塞进来，平台
    逐个补全并落盘。

    返回导入结果摘要：成功列表 + 失败列表（带原因）。**单个文件失败
    不会中断整批**——一份坏数据不该挡住其余上百条资源。
    """
    root = Path(directory)
    if not root.exists():
        raise CourseError(f"目录不存在：{root}")

    imported: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    for path in sorted(root.rglob("*.json")):
        if not path.is_file():
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            failed.append({"file": path.name, "error": f"读取失败：{exc}"})
            continue

        try:
            course = import_hub_payload(
                raw, workspace_id=workspace_id, overwrite=overwrite
            )
        except CourseError as exc:
            failed.append({"file": path.name, "error": str(exc)})
            continue
        except Exception as exc:  # pragma: no cover - 兜底，不让单文件炸整批
            failed.append({"file": path.name, "error": f"未预期的错误：{exc}"})
            continue

        imported.append(
            {
                "id": course.id,
                "title": course.title,
                "topics": len(course.topics),
                "nodes": len(course.nodes),
                "resources": len(course.resources),
            }
        )

    return {
        "imported": imported,
        "failed": failed,
        "imported_count": len(imported),
        "failed_count": len(failed),
    }


def hub_schema() -> dict[str, Any]:
    """读出作者格式的 JSON Schema。

    与 :meth:`CourseService.template_schema` 并列——那份描述的是**内部**
    结构（Book/spine/pages/progress），这份描述的是**作者**要写的东西
    （topics/nodes/resources）。
    """
    path = COURSES_ROOT / HUB_SCHEMA_FILENAME
    if not path.exists():
        raise CourseError("找不到外链课程 schema 文件。")
    return json.loads(path.read_text(encoding="utf-8"))


# ── 资源总表 ────────────────────────────────────────────────────────────


def flatten_resources(course: Course) -> list[dict[str, Any]]:
    """把一门课程的资源拍平成一条条带上下文的记录。

    「资源发现」入口需要一张**跨课程**的资源总表——这条记录就是总表
    里的一行。
    """
    topic_by_id = {topic.id: topic for topic in course.topics}

    out: list[dict[str, Any]] = []
    for node in course.nodes:
        topic = topic_by_id.get(node.topic_id)
        for resource in node.resources:
            out.append(
                {
                    "course_id": course.id,
                    "course_title": course.title,
                    "topic_id": topic.id if topic else "",
                    "topic_title": topic.title if topic else "",
                    "node_id": node.id,
                    "node_title": node.title,
                    "node_question": node.question,
                    "resource": resource.to_dict(),
                }
            )
    return out


__all__ = [
    "HUB_SCHEMA_FILENAME",
    "flatten_resources",
    "hub_schema",
    "import_hub_directory",
    "import_hub_payload",
]
