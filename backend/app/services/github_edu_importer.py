"""
GitHub 开源教育项目装配器
==========================

把**已审核批准**的开源教育项目装配成公开课主库里的资源条目。

安全边界
--------

这个模块**只接受** ``approval == "approved"`` 的条目。调用方
（``app/routers/github_edu.py``）已经做过这层过滤，这里再校验一次——
**双保险**。

理由：这是唯一能往正式课程大盘写东西的路径之一。一次疏忽（忘了过滤
``pending``）就会让未经审核的仓库进入用户视野。所以校验放在**最靠
近写入的地方**，而不是只依赖调用方。

拉取策略
--------

``git clone --depth 1``——只取最新的快照。

为什么不用 GitHub API 拉文件
---------------------------

API 逐个文件拉，一次课程有几百个文件，几十次请求。clone 一次搞定，
而且拿到的是**真实的目录结构**——我们能据此判断它到底是不是一个
「有课程结构的仓库」，而不只是看 README 怎么说。

装配流程
--------

1. 浅克隆到临时目录；
2. 扫描目录结构，判断它有没有课程骨架（``curriculum/``、``courses/``、
   ``docs/``…）；
3. 用**规则**（不是模型）抽取课程条目——从 Markdown 的标题层级里
   找出课程名；
4. 写成主库里的资源条目。

第 3 步为什么不用模型
--------------------

因为抽取标题是**确定性**的任务——Markdown 里有 ``#`` 就是一级标题。
用模型来做这件事只会引入不确定性：同样的仓库两次抽取可能给出不同
的课程名，审核者会看到「我批的是 A，装进来变成 B」。

模型只用在**确实需要理解语义**的地方（比如给整门课写一段导读），
而那一步是可选的——没配密钥时跳过，主库照样能写进去。
"""

from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.services.global_hub_service import GLOBAL_HUB_PATH, load_global_hub

#: 克隆的超时（秒）。
CLONE_TIMEOUT = 180

#: 用于识别「课程骨架」的目录名。
SKELETON_MARKERS = (
    "curriculum",
    "courses",
    "course",
    "syllabus",
    "lessons",
    "chapters",
    "modules",
    "docs",
    "content",
    "curricula",
    "syllabi",
)

#: 会被扫描的文档扩展名。
DOC_SUFFIXES = (".md", ".markdown", ".rst", ".txt")

#: 一级 / 二级标题的正则——Markdown 风格。
_HEADING = re.compile(r"^(#{1,3})\s+(.+?)\s*$", re.MULTILINE)

#: 明显不是课程名的标题（噪声过滤）。
_NOISE_HEADINGS = (
    "readme",
    "contributing",
    "license",
    "changelog",
    "table of contents",
    "目录",
    "目录结构",
    "安装",
    "使用",
    "贡献",
    "许可",
    "致谢",
    "english",
    "中文",
)


def _is_noise(heading: str) -> bool:
    lowered = heading.strip().lower()
    if not lowered:
        return True
    if len(lowered) > 90:
        return True
    return any(lowered.startswith(noise) for noise in _NOISE_HEADINGS)


def _clone(url: str, target: Path) -> tuple[bool, str]:
    """浅克隆一个仓库。

    返回 ``(是否成功, 说明)``。

    用 ``--depth 1`` 而不是完整克隆：我们要的是「它现在长什么样」，
    不是它的提交历史——后者可能有几百 MB，而我们只要一个快照。
    """
    command = [
        "git",
        "clone",
        "--depth",
        "1",
        "--quiet",
        url,
        str(target),
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, f"克隆超时（>{CLONE_TIMEOUT}s）"
    except FileNotFoundError:
        return False, "找不到 git 命令"

    if result.returncode != 0:
        message = (result.stderr or result.stdout or "").strip().splitlines()
        return False, (message[-1] if message else f"git 返回 {result.returncode}")
    return True, "克隆成功"


def _scan_skeleton(root: Path) -> dict[str, Any]:
    """扫描目录，判断它有没有课程骨架。"""
    markers: list[str] = []
    doc_count = 0
    readme = ""

    try:
        for entry in root.iterdir():
            if entry.is_dir() and entry.name.lower() in SKELETON_MARKERS:
                markers.append(entry.name)
    except OSError:
        pass

    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in DOC_SUFFIXES:
            doc_count += 1
            if path.name.lower().startswith("readme") and not readme:
                try:
                    readme = path.read_text(encoding="utf-8", errors="ignore")[:6000]
                except OSError:
                    pass

    return {
        "has_skeleton": bool(markers),
        "markers": markers,
        "doc_count": doc_count,
        "readme": readme,
    }


def _extract_lessons(readme: str, root: Path) -> list[str]:
    """从 README 与课程文档里抽取课程条目。

    只取**一、二级标题**——三级及以下往往是小节而不是课程。
    """
    lessons: list[str] = []
    seen: set[str] = set()

    def add(text: str) -> None:
        cleaned = text.strip().strip("*_`[]() ").strip()
        if not cleaned or _is_noise(cleaned):
            return
        if cleaned in seen:
            return
        seen.add(cleaned)
        lessons.append(cleaned)

    for match in _HEADING.finditer(readme):
        level = len(match.group(1))
        if level > 2:
            continue
        add(match.group(2))

    # README 里的目录不够，再看课程目录下的文档。
    if len(lessons) < 3:
        for marker in ("curriculum", "courses", "course", "docs", "content"):
            directory = root / marker
            if not directory.is_dir():
                continue
            for path in sorted(directory.rglob("*"))[:200]:
                if not path.is_file() or path.suffix.lower() not in DOC_SUFFIXES:
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")[:20000]
                except OSError:
                    continue
                for match in _HEADING.finditer(text):
                    if len(match.group(1)) > 2:
                        continue
                    add(match.group(2))
                if len(lessons) >= 30:
                    break
            if len(lessons) >= 30:
                break

    return lessons[:30]


def _make_resource(
    candidate: dict[str, Any],
    lessons: list[str],
    skeleton: dict[str, Any],
) -> dict[str, Any]:
    """把候选项目变成主库里的一条资源。

    这条资源的形态跟视频课不同——它没有可播放的媒体，是一个**外部
    开源课程项目**。所以 ``provider`` 是 ``github``，``url`` 指向仓库。
    """
    full_name = str(candidate.get("full_name") or "")
    owner = str(candidate.get("owner") or full_name.split("/")[0])
    kind = str(candidate.get("kind") or "")
    lessons_text = "、".join(lessons[:8])

    description = str(candidate.get("description") or "").strip()
    if not description:
        description = f"{full_name} —— {kind}。"

    tags: list[str] = [kind] if kind else []
    for topic in list(candidate.get("topics") or [])[:4]:
        if topic not in tags:
            tags.append(topic)
    if lessons:
        tags.append(f"{len(lessons)} 门课")

    return {
        "id": f"github_{full_name.replace('/', '_')}",
        "title": full_name,
        "source": "GitHub 开源教育项目",
        "provider": "github",
        "url": str(candidate.get("html_url") or ""),
        "academic_intro": (
            f"{description}　"
            + (f"涵盖课程：{lessons_text}。" if lessons else "")
        ),
        "tags": tags,
        "meta": {
            "github_owner": owner,
            "github_full_name": full_name,
            "stars": int(candidate.get("stars") or 0),
            "forks": int(candidate.get("forks") or 0),
            "language": str(candidate.get("language") or ""),
            "license": str(candidate.get("license") or ""),
            "kind": kind,
            "has_skeleton": bool(skeleton.get("has_skeleton")),
            "lesson_count": len(lessons),
            "lessons": lessons,
            "reviewed": True,
        },
        "is_default": False,
    }


async def import_approved_candidates(
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """把已批准的候选项目装配进公开课主库。

    **只处理** ``approval == "approved"`` 的条目——非 approved 的直接
    跳过，连克隆都不做。
    """
    approved = [
        item for item in candidates if str(item.get("approval")) == "approved"
    ]
    results: list[dict[str, Any]] = []
    added = 0

    for candidate in approved:
        candidate_id = str(candidate.get("id") or "")
        url = str(candidate.get("html_url") or "").strip()
        if not url:
            results.append(
                {
                    "candidate_id": candidate_id,
                    "status": "failed",
                    "message": "缺少仓库地址",
                }
            )
            continue

        temp_root = Path(tempfile.mkdtemp(prefix="seek_edu_"))
        target = temp_root / "repo"
        try:
            ok, message = await asyncio.to_thread(_clone, url, target)
            if not ok:
                results.append(
                    {
                        "candidate_id": candidate_id,
                        "status": "failed",
                        "message": message,
                    }
                )
                continue

            skeleton = await asyncio.to_thread(_scan_skeleton, target)
            lessons = await asyncio.to_thread(
                _extract_lessons, skeleton.get("readme", ""), target
            )

            resource = _make_resource(candidate, lessons, skeleton)
            inserted = await asyncio.to_thread(_insert_resource, resource)
            if inserted:
                added += 1
                results.append(
                    {
                        "candidate_id": candidate_id,
                        "status": "success",
                        "message": (
                            f"已入库，识别出 {len(lessons)} 门课程"
                            if lessons
                            else "已入库（未识别出课程清单）"
                        ),
                        "resource_id": resource["id"],
                    }
                )
            else:
                results.append(
                    {
                        "candidate_id": candidate_id,
                        "status": "skipped",
                        "message": "主库中已存在同一条目",
                        "resource_id": resource["id"],
                    }
                )
        except Exception as exc:  # noqa: BLE001 — 局部失败不影响其他
            results.append(
                {
                    "candidate_id": candidate_id,
                    "status": "failed",
                    "message": str(exc),
                }
            )
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)

    succeeded = sum(1 for item in results if item["status"] == "success")
    failed = sum(1 for item in results if item["status"] == "failed")
    skipped = sum(1 for item in results if item["status"] == "skipped")

    return {
        "fetched": len(approved),
        "succeeded": succeeded,
        "failed": failed,
        "skipped": skipped,
        "added": added,
        "results": results,
        "message": (
            f"拉取 {len(approved)} 个已批准项目，成功 {succeeded} 个，"
            f"新增 {added} 条资源。"
        ),
    }


def _insert_resource(resource: dict[str, Any]) -> bool:
    """把一条资源写进公开课主库。

    幂等——同 id 已存在时跳过，不重复插入。

    新条目放进一个独立的分类「开源教育项目」，而不是塞进现有的学科
    分类——它们的形态不同（没有可播放媒体），混在一起会让播放器
    处理不了。
    """
    hub = load_global_hub()
    categories = hub.get("categories") or []

    for category in categories:
        for existing in category.get("resources") or []:
            if isinstance(existing, dict) and existing.get("id") == resource["id"]:
                return False

    category_id = "github_open_edu"
    target = next(
        (item for item in categories if item.get("id") == category_id), None
    )
    if target is None:
        target = {
            "id": category_id,
            "title": "开源教育项目",
            "subtitle": "经人工审核的优质成品",
            "description": (
                "从 GitHub 上筛选并**逐条人工审核**通过的开源教育项目——"
                "线上教育成品系统与学历/文凭课程体系。"
            ),
            "icon": "globe",
            "resources": [],
        }
        categories.append(target)

    target.setdefault("resources", []).append(resource)

    import json

    GLOBAL_HUB_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = GLOBAL_HUB_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(hub, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    tmp.replace(GLOBAL_HUB_PATH)
    return True


__all__ = [
    "CLONE_TIMEOUT",
    "import_approved_candidates",
]
