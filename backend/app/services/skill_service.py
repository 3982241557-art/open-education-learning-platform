"""
Skill 本地加载与路由机制（DeepTutor 空壳复刻版）
=================================================

Skill 是一个自包含的能力包：一个 ``SKILL.md`` playbook，外加可选的
``references/``。Skill **不会**被整体注入系统提示词——提示词里只带一行一
条的 manifest（见 :func:`render_skills_manifest`），模型在任务匹配时再通过
``read_skill`` 工具按需拉取完整内容。唯一的例外是 frontmatter 里标记
``always: true`` 的 skill，它的正文会被立即注入（用于每轮都必须生效的
"house rules"）。

两层结构，用户层遮蔽内置层：

* builtin — 随产品发布，位于 ``backend/skills/builtin/``，运行时只读；
* user — 通过 API 创建，位于 ``backend/data/workspace/skills/``。

每个 skill 独占一个目录::

    <root>/<name>/SKILL.md
    <root>/<name>/references/...   （可选，通过 read_skill 读取）

frontmatter schema::

    ---
    name: my-skill
    description: manifest 里显示的一行摘要
    tags: [style]            # 可选，仅用于用户侧分组
    always: false            # 可选，为 true 时立即注入
    requires:                 # 可选的可用性门禁
      bins: [git]            # PATH 上必须存在的 CLI
      env: [GITHUB_TOKEN]    # 必须设置的环境变量
    ---

用户层目录旁的 ``.tags.json`` 保存用户可管理的标签词表，标签可以独立于使用
它的 skill 被创建、重命名、删除。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import re
import shutil
from typing import Any
from uuid import uuid4

import yaml

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_TAG_RE = re.compile(r"^[a-z0-9][a-z0-9\- _]{0,31}$")
_DEFAULT_TAGS: tuple[str, ...] = ("style", "tool")
_TAGS_FILE = ".tags.json"

# 随包发布的内置 skill 根目录。
# skill_service.py 位于 backend/app/services/，因此 parents[2] 是 backend/。
BUILTIN_SKILLS_ROOT = Path(__file__).resolve().parents[2] / "skills" / "builtin"

# read_skill 返回内容的硬上限，避免巨大的 reference 文件冲爆上下文窗口。
_MAX_READ_CHARS = 100_000

# 从外部 hub 导入的 skill 的来源记录，与 ``.tags.json`` 并排存放。
_HUB_LOCK_FILE = ".hub-lock.json"

# 导入非可信来源时的边界：skill 只是一个文本 playbook 加少量支撑文件，
# 超出即视为可疑，直接失败关闭而不是塞满工作区。
_IMPORT_MAX_FILE_BYTES = 1_000_000
_IMPORT_MAX_TOTAL_BYTES = 20_000_000
_IMPORT_MAX_FILES = 500

# 导入时允许的支撑文件后缀白名单（小写）。
_IMPORT_ALLOWED_SUFFIXES = frozenset(
    {
        "",
        ".md", ".markdown", ".txt", ".rst",
        ".py", ".js", ".mjs", ".ts", ".sh", ".rb", ".lua", ".r",
        ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini", ".cfg",
        ".csv", ".tsv", ".html", ".htm", ".css", ".xml", ".sql",
        ".jinja", ".j2", ".tmpl", ".template",
    }
)  # fmt: skip


@dataclass(slots=True)
class SkillInfo:
    name: str
    description: str
    tags: list[str] = field(default_factory=list)
    source: str = "user"  # "user" | "builtin" | "admin"

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "tags": list(self.tags),
            "source": self.source,
            "read_only": self.source != "user",
        }


@dataclass(slots=True)
class SkillDetail:
    name: str
    description: str
    content: str
    tags: list[str] = field(default_factory=list)
    source: str = "user"

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "content": self.content,
            "tags": list(self.tags),
            "source": self.source,
            "read_only": self.source != "user",
        }


@dataclass(slots=True)
class SkillSummaryEntry:
    """一行 manifest：模型在 read_skill 之前对某个 skill 的认知。"""

    name: str
    description: str
    available: bool = True
    missing: list[str] = field(default_factory=list)
    always: bool = False
    #: 「引擎级」skill——调度权重高于普通 skill，正文会被立即注入。
    engine: bool = False
    #: 「回答模式」skill——用户可在对话中途切换，模型会立刻换一种
    #: 身份接续同一段对话（苏格拉底导师 / 直言不讳的批评家……）。
    persona: bool = False


@dataclass(slots=True)
class SkillInstallResult:
    """导入 skill 包的结果。

    ``skipped`` 列出被导入门禁丢弃的支撑文件，格式为
    ``(相对路径, 原因)``，让调用方可以展示"什么没能进入工作区"，而不是
    让整个导入失败。
    """

    info: SkillInfo
    skipped: list[tuple[str, str]] = field(default_factory=list)


class SkillNotFoundError(Exception):
    pass


class SkillFileNotFoundError(Exception):
    """skill 存在，但请求的内部文件不存在。"""


class SkillExistsError(Exception):
    pass


class SkillReadOnlyError(Exception):
    """写入目标指向内置（只读）skill。"""


class InvalidSkillNameError(Exception):
    pass


class InvalidSkillPathError(Exception):
    """``read_skill_file`` 被要求读取 skill 目录之外的路径。"""


class SkillImportError(Exception):
    """导入的 skill 包未通过结构/安全门禁。"""


class InvalidTagError(Exception):
    pass


class TagNotFoundError(Exception):
    pass


class TagExistsError(Exception):
    pass


def _sandbox_available(kind: str) -> bool:
    """``requires.sandbox`` 门禁是否满足。

    延迟导入，让 skill 层与 sandbox 层保持解耦；服务缺失或禁用时失败关闭。
    """
    try:
        from app.services.sandbox import exec_capability_available

        return exec_capability_available(kind)
    except Exception:
        return False


class SkillService:
    """SKILL.md 包的 CRUD 与运行时加载（builtin + user 两层）。"""

    def __init__(
        self,
        root: Path | None = None,
        builtin_root: Path | None = BUILTIN_SKILLS_ROOT,
        *,
        source_label: str = "user",
        read_only: bool = False,
    ) -> None:
        self._root = root or (DATA_ROOT / "skills")
        self._builtin_root = builtin_root
        # ``source_label`` 是本层 skill 在 UI 与 API 里的身份标签；
        # ``read_only`` 让整层不可写（内置层用它来防止误删）。
        self._source_label = source_label
        self._read_only = read_only

    @property
    def root(self) -> Path:
        return self._root

    # ── 路径辅助 ────────────────────────────────────────────────────────

    def _validate_name(self, name: str) -> str:
        candidate = (name or "").strip().lower()
        if not _NAME_RE.match(candidate):
            raise InvalidSkillNameError("Skill name must match ^[a-z0-9][a-z0-9-]{0,63}$")
        return candidate

    def _skill_dir(self, name: str) -> Path:
        return self._root / self._validate_name(name)

    def _skill_file(self, name: str) -> Path:
        return self._skill_dir(name) / "SKILL.md"

    def _resolve_skill_dir(self, name: str) -> tuple[Path, str] | None:
        """跨层定位 skill：先本层，再内置层。"""
        slug = self._validate_name(name)
        user_dir = self._root / slug
        if (user_dir / "SKILL.md").exists():
            return user_dir, self._source_label
        if self._builtin_root is not None:
            builtin_dir = self._builtin_root / slug
            if (builtin_dir / "SKILL.md").exists():
                return builtin_dir, "builtin"
        return None

    # ── 标签辅助 ────────────────────────────────────────────────────────

    @staticmethod
    def _normalize_tag(raw: Any) -> str:
        candidate = str(raw or "").strip().lower()
        if not candidate:
            raise InvalidTagError("Tag name must not be empty.")
        if not _TAG_RE.match(candidate):
            raise InvalidTagError(
                "Tag must match ^[a-z0-9][a-z0-9- _]{0,31}$ (letters/digits/dash/space/underscore)."
            )
        return candidate

    @staticmethod
    def _dedupe_tags(values: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for v in values:
            if v in seen:
                continue
            seen.add(v)
            out.append(v)
        return out

    def _tags_path(self) -> Path:
        return self._root / _TAGS_FILE

    def _read_tag_vocab(self) -> list[str]:
        path = self._tags_path()
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        raw = data.get("tags") if isinstance(data, dict) else None
        if not isinstance(raw, list):
            return []
        out: list[str] = []
        for item in raw:
            try:
                out.append(self._normalize_tag(item))
            except InvalidTagError:
                continue
        return self._dedupe_tags(out)

    def _write_tag_vocab(self, tags: list[str]) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        self._tags_path().write_text(
            json.dumps({"tags": self._dedupe_tags(tags)}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _tags_from_meta(self, meta: dict[str, Any]) -> list[str]:
        raw = meta.get("tags")
        if not isinstance(raw, list):
            return []
        out: list[str] = []
        for item in raw:
            try:
                out.append(self._normalize_tag(item))
            except InvalidTagError:
                continue
        return self._dedupe_tags(out)

    def _collect_skill_tags(self) -> list[str]:
        """扫描用户层 skill，收集 frontmatter 里出现过的标签。"""
        found: list[str] = []
        for info in self.list_skills():
            if info.source != "user":
                continue
            for tag in info.tags:
                if tag not in found:
                    found.append(tag)
        return found

    def _ensure_initialized_vocab(self) -> list[str]:
        """首次访问时播种默认标签，并回填 skill 上发现的标签。"""
        vocab = self._read_tag_vocab()
        existed = self._tags_path().exists()
        if not existed:
            vocab = list(_DEFAULT_TAGS)
        union = self._dedupe_tags(vocab + self._collect_skill_tags())
        if not existed or union != vocab:
            self._write_tag_vocab(union)
        return union

    # ── 解析 ────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
        match = _FRONTMATTER_RE.match(content)
        if not match:
            return {}, content
        raw = match.group(1)
        body = content[match.end():]
        try:
            data = yaml.safe_load(raw) or {}
        except yaml.YAMLError:
            data = {}
        if not isinstance(data, dict):
            data = {}
        return data, body

    @staticmethod
    def _requires_from_meta(meta: dict[str, Any]) -> dict[str, Any]:
        raw = meta.get("requires")
        return raw if isinstance(raw, dict) else {}

    @classmethod
    def _availability(cls, meta: dict[str, Any]) -> tuple[bool, list[str]]:
        """检查 ``requires`` 门禁，返回 ``(是否可用, 缺失项标签)``。"""
        requires = cls._requires_from_meta(meta)
        missing: list[str] = []
        for b in requires.get("bins") or []:
            label = str(b).strip()
            if label and not shutil.which(label):
                missing.append(f"CLI: {label}")
        for env_var in requires.get("env") or []:
            label = str(env_var).strip()
            if label and not os.environ.get(label):
                missing.append(f"ENV: {label}")
        sandbox = requires.get("sandbox")
        if sandbox:
            kind = "shell" if sandbox is True else str(sandbox).strip()
            if kind and not _sandbox_available(kind):
                missing.append(f"SANDBOX: {kind}")
        return (not missing), missing

    def _load_info(self, skill_dir: Path, source: str) -> SkillInfo | None:
        file = skill_dir / "SKILL.md"
        try:
            text = file.read_text(encoding="utf-8")
        except OSError:
            return None
        meta, _ = self._parse_frontmatter(text)
        return SkillInfo(
            name=skill_dir.name,
            description=str(meta.get("description") or "").strip(),
            tags=self._tags_from_meta(meta),
            source=source,
        )

    # ── 只读 API ────────────────────────────────────────────────────────

    def list_skills(self) -> list[SkillInfo]:
        """当前 service 可见的全部 skill：本层 + 未被遮蔽的内置层。"""
        out: list[SkillInfo] = []
        seen: set[str] = set()
        if self._root.exists():
            for entry in sorted(self._root.iterdir()):
                if not entry.is_dir() or not (entry / "SKILL.md").exists():
                    continue
                if not _NAME_RE.match(entry.name):
                    continue
                info = self._load_info(entry, self._source_label)
                if info is not None:
                    out.append(info)
                    seen.add(info.name)
        if self._builtin_root is not None and self._builtin_root.exists():
            for entry in sorted(self._builtin_root.iterdir()):
                if not entry.is_dir() or not (entry / "SKILL.md").exists():
                    continue
                if entry.name in seen or not _NAME_RE.match(entry.name):
                    continue
                info = self._load_info(entry, "builtin")
                if info is not None:
                    out.append(info)
        return out

    def get_detail(self, name: str) -> SkillDetail:
        resolved = self._resolve_skill_dir(name)
        if resolved is None:
            raise SkillNotFoundError(name)
        skill_dir, source = resolved
        text = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
        meta, _ = self._parse_frontmatter(text)
        return SkillDetail(
            name=skill_dir.name,
            description=str(meta.get("description") or "").strip(),
            content=text,
            tags=self._tags_from_meta(meta),
            source=source,
        )

    def read_skill_file(self, name: str, rel_path: str = "SKILL.md") -> str:
        """读取 skill 包内的文件（供 ``read_skill`` 工具使用）。

        ``rel_path`` 严格限定在 skill 目录内——绝对路径和 ``..`` 穿越都被
        拒绝。超过读取上限的内容会被截断并附上显式标记。
        """
        resolved = self._resolve_skill_dir(name)
        if resolved is None:
            raise SkillNotFoundError(name)
        skill_dir, _source = resolved

        candidate = (rel_path or "SKILL.md").strip() or "SKILL.md"
        rel = Path(candidate)
        if rel.is_absolute() or ".." in rel.parts:
            raise InvalidSkillPathError(f"Illegal skill file path: {rel_path}")
        target = (skill_dir / rel).resolve()
        if not target.is_relative_to(skill_dir.resolve()):
            raise InvalidSkillPathError(f"Illegal skill file path: {rel_path}")
        if not target.is_file():
            raise SkillFileNotFoundError(f"File not found in skill: {name}/{candidate}")
        text = target.read_text(encoding="utf-8", errors="replace")
        if len(text) > _MAX_READ_CHARS:
            text = text[:_MAX_READ_CHARS] + "\n\n[... truncated ...]"
        return text

    def list_skill_files(self, name: str) -> list[str]:
        """skill 包内可读文件的相对路径。"""
        resolved = self._resolve_skill_dir(name)
        if resolved is None:
            raise SkillNotFoundError(name)
        skill_dir, _source = resolved
        files: list[str] = []
        for path in sorted(skill_dir.rglob("*")):
            if path.is_file() and not path.name.startswith("."):
                files.append(str(path.relative_to(skill_dir)))
        return files

    # ── 运行时加载（manifest + always） ─────────────────────────────────

    def summary_entries(self) -> list[SkillSummaryEntry]:
        """当前 service 可见的每个 skill 的 manifest 行。"""
        entries: list[SkillSummaryEntry] = []
        for info in self.list_skills():
            resolved = self._resolve_skill_dir(info.name)
            if resolved is None:
                continue
            skill_dir, _source = resolved
            meta, _ = self._parse_frontmatter((skill_dir / "SKILL.md").read_text(encoding="utf-8"))
            available, missing = self._availability(meta)
            entries.append(
                SkillSummaryEntry(
                    name=info.name,
                    description=info.description,
                    available=available,
                    missing=missing,
                    always=bool(meta.get("always")),
                    engine=bool(meta.get("engine")),
                    persona=bool(meta.get("persona")),
                )
            )
        return entries

    def load_for_context(self, names: list[str]) -> str:
        """把指定 skill 的完整正文渲染进系统提示词块。

        仅用于 ``always: true`` 的 skill——其余 skill 通过 manifest +
        ``read_skill`` 抵达模型。
        """
        if not names:
            return ""
        parts: list[str] = []
        for name in names:
            try:
                detail = self.get_detail(name)
            except (SkillNotFoundError, InvalidSkillNameError):
                continue
            _, body = self._parse_frontmatter(detail.content)
            body = body.strip()
            if not body:
                continue
            parts.append(f"### Skill: {detail.name}\n\n{body}")
        if not parts:
            return ""
        return (
            "## Active Skills\n"
            "Follow the playbooks below. They override generic defaults.\n\n"
            + "\n\n---\n\n".join(parts)
        )

    def load_always_for_context(self) -> str:
        """立即渲染标记 ``always: true``（且可用）的 skill。"""
        names = [e.name for e in self.summary_entries() if e.always and e.available]
        return self.load_for_context(names)

    def load_bodies(self, names: list[str]) -> list[str]:
        """取出指定 skill 的正文（不含区块标题）。

        与 :meth:`load_for_context` 的区别是**不包一层标题**——调用方要
        自己决定这些正文归到哪个区块（``always`` 与 ``engine`` 性质不同，
        不该混在同一个标题下）。
        """
        bodies: list[str] = []
        for name in names:
            try:
                detail = self.get_detail(name)
            except (SkillNotFoundError, InvalidSkillNameError):
                continue
            _, body = self._parse_frontmatter(detail.content)
            body = body.strip()
            if not body:
                continue
            bodies.append(f"### Skill: {detail.name}\n\n{body}")
        return bodies

    # ── 写入 API（仅用户层） ────────────────────────────────────────────

    def _assert_writable(self, slug: str) -> None:
        """写入只能落在用户层；内置层与整层只读的 service 不可写。"""
        if self._read_only:
            raise SkillReadOnlyError(
                f"Skill layer is read-only: {self._source_label} ({slug})"
            )
        if (self._root / slug / "SKILL.md").exists():
            return
        if self._builtin_root is not None and (self._builtin_root / slug / "SKILL.md").exists():
            raise SkillReadOnlyError(f"Skill is builtin (read-only): {slug}")
        raise SkillNotFoundError(slug)

    def create(
        self,
        name: str,
        description: str,
        content: str,
        tags: list[str] | None = None,
    ) -> SkillInfo:
        if self._read_only:
            raise SkillReadOnlyError(
                f"Skill layer is read-only: {self._source_label} ({name})"
            )
        slug = self._validate_name(name)
        target_dir = self._skill_dir(slug)
        if target_dir.exists():
            raise SkillExistsError(slug)
        clean_tags = self._validate_tag_list(tags)
        body = self._normalize_content(
            slug,
            description,
            content,
            tags=clean_tags,
        )
        target_dir.mkdir(parents=True, exist_ok=False)
        self._skill_file(slug).write_text(body, encoding="utf-8")
        self._merge_tags_into_vocab(clean_tags)
        return SkillInfo(name=slug, description=description.strip(), tags=clean_tags)

    def update(
        self,
        name: str,
        *,
        description: str | None = None,
        content: str | None = None,
        rename_to: str | None = None,
        tags: list[str] | None = None,
    ) -> SkillInfo:
        slug = self._validate_name(name)
        self._assert_writable(slug)
        target_dir = self._skill_dir(slug)

        if content is not None:
            text = content
        else:
            text = self._skill_file(slug).read_text(encoding="utf-8")

        if description is not None:
            text = self._rewrite_frontmatter(text, description=description.strip())

        clean_tags: list[str] | None = None
        if tags is not None:
            clean_tags = self._validate_tag_list(tags)
            text = self._rewrite_frontmatter(text, tags=clean_tags)

        meta, _ = self._parse_frontmatter(text)
        final_description = str(meta.get("description") or "").strip()
        final_tags = self._tags_from_meta(meta)

        if rename_to and rename_to != slug:
            new_slug = self._validate_name(rename_to)
            new_dir = self._skill_dir(new_slug)
            if new_dir.exists():
                raise SkillExistsError(new_slug)
            text = self._rewrite_frontmatter(text, name=new_slug)
            target_dir.rename(new_dir)
            slug = new_slug
            target_dir = new_dir

        self._skill_file(slug).write_text(text, encoding="utf-8")
        if clean_tags is not None:
            self._merge_tags_into_vocab(clean_tags)
        return SkillInfo(name=slug, description=final_description, tags=final_tags)

    def delete(self, name: str) -> None:
        slug = self._validate_name(name)
        self._assert_writable(slug)
        shutil.rmtree(self._skill_dir(slug))
        self._drop_hub_origin(slug)

    # ── hub 来源记录（.hub-lock.json） ──────────────────────────────────

    def _hub_lock_path(self) -> Path:
        return self._root / _HUB_LOCK_FILE

    def _read_hub_lock(self) -> dict[str, dict[str, Any]]:
        path = self._hub_lock_path()
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        if not isinstance(data, dict):
            return {}
        return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, dict)}

    def _write_hub_lock(self, data: dict[str, dict[str, Any]]) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        self._hub_lock_path().write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def record_hub_origin(self, name: str, origin: dict[str, Any]) -> None:
        slug = self._validate_name(name)
        lock = self._read_hub_lock()
        lock[slug] = dict(origin)
        self._write_hub_lock(lock)

    def hub_origin(self, name: str) -> dict[str, Any] | None:
        try:
            slug = self._validate_name(name)
        except InvalidSkillNameError:
            return None
        return self._read_hub_lock().get(slug)

    def _drop_hub_origin(self, slug: str) -> None:
        lock = self._read_hub_lock()
        if slug in lock:
            del lock[slug]
            self._write_hub_lock(lock)

    # ── 标签管理 API ────────────────────────────────────────────────────

    def list_tags(self) -> list[str]:
        return self._ensure_initialized_vocab()

    def create_tag(self, name: str) -> str:
        tag = self._normalize_tag(name)
        vocab = self._ensure_initialized_vocab()
        if tag in vocab:
            raise TagExistsError(tag)
        self._write_tag_vocab(vocab + [tag])
        return tag

    def rename_tag(self, old: str, new: str) -> str:
        old_tag = self._normalize_tag(old)
        new_tag = self._normalize_tag(new)
        vocab = self._ensure_initialized_vocab()
        if old_tag not in vocab:
            raise TagNotFoundError(old_tag)
        if new_tag != old_tag and new_tag in vocab:
            raise TagExistsError(new_tag)
        if new_tag == old_tag:
            return old_tag
        new_vocab = [new_tag if t == old_tag else t for t in vocab]
        self._write_tag_vocab(new_vocab)
        # 级联：改写每个用到旧标签的用户层 skill 的 frontmatter。
        self._replace_tag_in_skills(old_tag, new_tag)
        return new_tag

    def delete_tag(self, name: str) -> None:
        tag = self._normalize_tag(name)
        vocab = self._ensure_initialized_vocab()
        if tag not in vocab:
            raise TagNotFoundError(tag)
        self._write_tag_vocab([t for t in vocab if t != tag])
        self._replace_tag_in_skills(tag, None)

    # ── 内部标签辅助 ────────────────────────────────────────────────────

    def _validate_tag_list(self, tags: list[str] | None) -> list[str]:
        if not tags:
            return []
        cleaned: list[str] = []
        for raw in tags:
            try:
                cleaned.append(self._normalize_tag(raw))
            except InvalidTagError:
                continue
        return self._dedupe_tags(cleaned)

    def _merge_tags_into_vocab(self, new_tags: list[str]) -> None:
        if not new_tags:
            # 仍触发初始化，保证首次写入后词表文件存在。
            self._ensure_initialized_vocab()
            return
        vocab = self._ensure_initialized_vocab()
        merged = self._dedupe_tags(vocab + new_tags)
        if merged != vocab:
            self._write_tag_vocab(merged)

    def _replace_tag_in_skills(self, old_tag: str, new_tag: str | None) -> None:
        if not self._root.exists():
            return
        for entry in sorted(self._root.iterdir()):
            if not entry.is_dir() or not (entry / "SKILL.md").exists():
                continue
            info = self._load_info(entry, "user")
            if info is None or old_tag not in info.tags:
                continue
            updated: list[str] = []
            for t in info.tags:
                if t == old_tag:
                    if new_tag and new_tag not in updated:
                        updated.append(new_tag)
                elif t not in updated:
                    updated.append(t)
            text = (entry / "SKILL.md").read_text(encoding="utf-8")
            (entry / "SKILL.md").write_text(
                self._rewrite_frontmatter(text, tags=updated), encoding="utf-8"
            )

    # ── 内容辅助 ────────────────────────────────────────────────────────

    def _normalize_content(
        self,
        name: str,
        description: str,
        content: str,
        *,
        tags: list[str] | None = None,
    ) -> str:
        """确保落盘文件带有合法的 frontmatter（``name``/``description``）。

        若用户提供的 ``content`` 已有 frontmatter，则改写其中的
        ``name``/``description``/``tags``；否则合成一段头部。
        """
        text = content if content is not None else ""
        if _FRONTMATTER_RE.match(text):
            return self._rewrite_frontmatter(
                text,
                name=name,
                description=description.strip(),
                tags=tags,
            )
        payload: dict[str, Any] = {"name": name, "description": description.strip()}
        if tags:
            payload["tags"] = list(tags)
        header = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True).strip()
        return f"---\n{header}\n---\n\n{text.lstrip()}".rstrip() + "\n"

    def _rewrite_frontmatter(
        self,
        text: str,
        *,
        name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> str:
        meta, body = self._parse_frontmatter(text)
        if name is not None:
            meta["name"] = name
        if description is not None:
            meta["description"] = description
        if tags is not None:
            if tags:
                meta["tags"] = list(tags)
            elif "tags" in meta:
                meta.pop("tags", None)
        if not meta:
            return text
        header = yaml.safe_dump(meta, sort_keys=False, allow_unicode=True).strip()
        return f"---\n{header}\n---\n\n{body.lstrip()}".rstrip() + "\n"


def render_skills_manifest(entries: list[SkillSummaryEntry]) -> str:
    """把 manifest 行渲染进系统提示词的 Skills 块。

    ``always`` 与 ``engine`` 条目被排除——它们的正文已经立即注入，
    再列一次只是浪费 token。同名条目保留首次出现的（调用方按
    user > admin > builtin 排序）。
    """
    seen: set[str] = set()
    lines: list[str] = []
    for entry in entries:
        if entry.always or entry.engine or entry.name in seen:
            continue
        seen.add(entry.name)
        suffix = ""
        if not entry.available:
            suffix = f" (unavailable: {', '.join(entry.missing)})"
        description = entry.description or entry.name
        lines.append(f"- **{entry.name}** — {description}{suffix}")
    if not lines:
        return ""
    return (
        "## Skills\n"
        "Specialised playbooks available on demand. When a task matches a "
        "skill's description, call `read_skill` with its name BEFORE "
        "attempting the task, then follow the returned instructions. Skills "
        "marked unavailable cannot be used until their requirements are met.\n\n"
        + "\n".join(lines)
    )


# ── 数据根目录 ──────────────────────────────────────────────────────────
# skill_service.py 位于 backend/app/services/，因此 parents[2] 是 backend/。
DATA_ROOT = Path(__file__).resolve().parents[2] / "data"

_instances: dict[str, SkillService] = {}


def get_skill_service() -> SkillService:
    """当前用户（此处为本地单用户）的 skill service。

    账号层 skill 对所有工作区可见，落在 ``backend/data/skills/``；工作区私有的
    skill 落在 ``backend/data/workspaces/<id>/skills/``，由
    :func:`app.services.skill_runtime.workspace_skill_service` 解析。
    """
    root = (DATA_ROOT / "skills").resolve()
    key = str(root)
    if key not in _instances:
        _instances[key] = SkillService(root=root)
    return _instances[key]


__all__ = [
    "BUILTIN_SKILLS_ROOT",
    "InvalidSkillNameError",
    "InvalidSkillPathError",
    "InvalidTagError",
    "SkillDetail",
    "SkillExistsError",
    "SkillFileNotFoundError",
    "SkillImportError",
    "SkillInfo",
    "SkillInstallResult",
    "SkillNotFoundError",
    "SkillReadOnlyError",
    "SkillService",
    "SkillSummaryEntry",
    "TagExistsError",
    "TagNotFoundError",
    "get_skill_service",
    "render_skills_manifest",
]
