"""
GitHub 开源教育项目 · 单条全览
===============================

给定一个仓库的 ``full_name``，实时拉取它的**目录结构**与**核心文档**，
然后由 DeepSeek 翻译成大白话，告诉审核者：

    「这个项目里具体有哪些文件夹 / 课程模块，分别装了什么」

为什么要在「单条全览」时才实时拉取
----------------------------------

批量筛选阶段拉了 50 个仓库，但审核者真正会**逐条打开看**的最多十来个。
如果筛选阶段就把 50 个全 clone 一遍：

* 磁盘和时间都浪费；
* 而且**大部分用不上**——拉下来也是白拉。

所以这里做成**按需拉取**：点开哪一条，才去拉哪一条。

缓存
----

拉过的仓库缓存在 ``backend/data/github_pulled/`` 下。第二次打开同一条
就是**瞬时**的——目录结构早就知道了，只重新翻译一遍。
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from app.services.github_edu_plain import _extract_json
from app.services.llm_factory import (
    LLMCallError,
    LLMNotConfiguredError,
    complete,
)

#: 拉取目录。
PULLED_ROOT = Path(__file__).resolve().parents[2] / "data" / "github_pulled"

#: 目录扫描时忽略的目录。
SKIP_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    "vendor",
    ".idea",
    ".vscode",
    "target",
    "coverage",
    ".github",
}

#: 核心文档扩展名。
DOC_SUFFIXES = {".md", ".rst", ".txt", ".ipynb"}

#: 单条全览的系统提示。
OVERVIEW_PROMPT = """你是一个开源教育项目的**结构讲解员**。

我会给你一个仓库的目录结构和部分核心文档内容。你要用**大白话**告诉
审核者：这个项目里具体有哪些文件夹、哪些课程模块，各自装了什么。

绝对禁止：
1. 复制原文。
2. 堆砌技术术语。必须用中文口语解释每一个术语。
3. 用「强大的」「完善的」这类空话。每句话都要带具体信息。

输出格式（严格 JSON，不要代码块围栏，不要任何解释文字）：

{
  "summary": "一句话概括这个仓库的结构",
  "folders": [
    {"path": "courses/", "plain": "这里面装的是什么，用大白话说"}
  ],
  "modules": [
    {"name": "课程模块的名字", "plain": "这个模块讲什么、有什么配套（视频/练习/作业）"}
  ],
  "ready_to_teach": "作为课程直接用，需要补什么；或者说明它已经齐了"
}

如果目录信息太少，就照实说，不要编造模块。"""


def _safe_name(full_name: str) -> str:
    """把 ``owner/repo`` 变成安全的目录名。"""
    return re.sub(r"[^A-Za-z0-9._-]+", "__", full_name).strip("_") or "repo"


def _clone(full_name: str, target: Path) -> tuple[bool, str]:
    """浅克隆一个仓库。"""
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://github.com/{full_name}.git"
    try:
        result = subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "--single-branch",
                url,
                str(target),
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"克隆失败：{exc}"
    if result.returncode != 0:
        return False, (result.stderr or "克隆失败").strip()[:300]
    return True, "已拉取"


def _scan_structure(root: Path, max_entries: int = 60) -> dict[str, Any]:
    """扫描目录结构。

    只保留**有意义**的目录——深度前两层 + 课程相关的关键字目录。
    全部列出来会有一屏 `node_modules`，那不是审核者要的信息。
    """
    folders: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    doc_count = 0

    try:
        entries = sorted(root.iterdir())
    except OSError:
        return {"folders": [], "files": [], "doc_count": 0}

    for entry in entries:
        if entry.name.startswith(".") and entry.name != ".github":
            continue
        if entry.is_dir():
            if entry.name in SKIP_DIRS:
                continue
            # 数一下里面有多少文件、文档。
            child_docs = 0
            child_total = 0
            try:
                for child in entry.rglob("*"):
                    if child.is_file():
                        child_total += 1
                        if child.suffix.lower() in DOC_SUFFIXES:
                            child_docs += 1
            except OSError:
                pass
            folders.append(
                {
                    "path": entry.name + "/",
                    "doc_count": child_docs,
                    "file_count": child_total,
                }
            )
        elif entry.is_file():
            if entry.suffix.lower() in DOC_SUFFIXES:
                doc_count += 1
            files.append({"name": entry.name})

    # 目录太多时，按文档数排序取前 N 个。
    folders.sort(key=lambda item: (-item["doc_count"], item["path"]))
    folders = folders[:max_entries]
    files.sort(key=lambda item: item["name"])

    return {
        "folders": folders,
        "files": files[:40],
        "doc_count": doc_count,
    }


def _read_core_docs(root: Path, limit: int = 3) -> str:
    """读几个核心文档的节选。

    只取 **README + 课程目录下的文档**，并截断——我们要的是「这个文件夹
    装了什么」，不是全文。
    """
    chunks: list[str] = []

    def add(path: Path, label: str) -> None:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")[:2500]
        except OSError:
            return
        if text.strip():
            chunks.append(f"### {label}\n{text}")

    # README。
    for name in ("README.md", "readme.md", "README.rst", "README.MD"):
        candidate = root / name
        if candidate.exists():
            add(candidate, name)
            break

    # 课程目录里的文档。
    for marker in ("curriculum", "courses", "course", "docs", "content", "lessons"):
        directory = root / marker
        if not directory.is_dir():
            continue
        try:
            documents = [
                path
                for path in sorted(directory.rglob("*"))
                if path.is_file() and path.suffix.lower() in DOC_SUFFIXES
            ]
        except OSError:
            continue
        for document in documents[:limit]:
            add(document, str(document.relative_to(root)))

    return "\n\n".join(chunks)[:8000]


def _translate_overview(
    full_name: str, structure: dict[str, Any], docs: str
) -> dict[str, Any] | None:
    """把目录结构翻译成大白话。"""
    if not structure["folders"] and not structure["files"]:
        return None

    payload = {
        "repo": full_name,
        "folders": structure["folders"],
        "top_files": structure["files"],
        "doc_count": structure["doc_count"],
        "core_docs_excerpt": docs[:5000],
    }

    try:
        raw = await_complete(
            prompt="请讲解这个仓库的结构：\n"
            + json.dumps(payload, ensure_ascii=False, indent=2),
            system_prompt=OVERVIEW_PROMPT,
            temperature=0.3,
            max_tokens=2500,
        )
    except (LLMNotConfiguredError, LLMCallError):
        return None

    items = _extract_json(raw)
    # 单条全览返回的是**对象**，不是数组。
    if items:
        return None
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


async def await_complete(**kwargs: Any) -> str:
    """包一层，把模型调用包在同步函数里用。

    ``_translate_overview`` 是同步的（它由线程池调用），所以这里用
    ``asyncio.run`` 跑一次。
    """
    return await complete(**kwargs)


async def inspect_candidate(full_name: str) -> dict[str, Any]:
    """单条全览：拉取 → 扫描 → 翻译。

    翻译失败**不抛错**——退回「机器版目录列表」。审核者仍然能看到
    目录结构，只是没有大白话解说。这比整页报错有用。
    """
    safe = _safe_name(full_name)
    target = PULLED_ROOT / safe

    cloned, message = await asyncio.to_thread(_clone, full_name, target)
    if not cloned:
        return {
            "ok": False,
            "full_name": full_name,
            "message": message,
            "folders": [],
            "files": [],
            "plain": None,
        }

    structure = await asyncio.to_thread(_scan_structure, target)
    docs = await asyncio.to_thread(_read_core_docs, target)
    plain = await asyncio.to_thread(_translate_overview, full_name, structure, docs)

    return {
        "ok": True,
        "full_name": full_name,
        "message": "已拉取并扫描",
        "local_path": str(target),
        "folders": structure["folders"],
        "files": structure["files"],
        "doc_count": structure["doc_count"],
        "plain": plain,
    }


__all__ = [
    "OVERVIEW_PROMPT",
    "PULLED_ROOT",
    "inspect_candidate",
]
