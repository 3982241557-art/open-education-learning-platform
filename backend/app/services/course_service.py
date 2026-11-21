"""
课程（course）服务
==================

空壳版本里「课程」就是一份手工配置的本地数据：每个课程一个 JSON 文件，
落在 ``data/courses/`` 下（工作区私有课程落在 ``data/workspaces/<id>/courses/``）。

文件格式与原版 DeepTutor 的 **Book Engine** 完全一致——同一套 ``book`` /
``spine`` / ``pages`` / ``progress`` 四段结构，字段名、枚举值与嵌套层级都
照抄 ``deeptutor/book/models.py``：

.. code-block:: json

    {
      "book": {
        "id": "bk_python101",
        "revision": 1,
        "title": "Python 入门",
        "description": "…",
        "status": "ready",
        "proposal": { "title": "…", "scope": "…", "target_level": "入门",
                      "estimated_chapters": 4, "rationale": "…" },
        "knowledge_bases": [],
        "language": "zh",
        "depth": "standard",
        "page_count": 4,
        "chapter_count": 4,
        "created_at": 1735689600.0,
        "updated_at": 1735689600.0,
        "metadata": { "tags": ["python"], "category": "编程", "level": "入门" },
        "kb_fingerprints": {},
        "kb_document_fingerprints": {},
        "stale_page_ids": [],
        "stale_detected_at": 0.0
      },
      "spine": {
        "book_id": "bk_python101",
        "version": 1,
        "updated_at": 1735689600.0,
        "exploration_summary": "…",
        "concept_graph": { "nodes": [], "edges": [] },
        "chapters": [
          { "id": "ch_…", "title": "…", "learning_objectives": [],
            "content_type": "theory", "source_anchors": [],
            "prerequisites": [], "page_ids": ["pg_…"],
            "summary": "…", "order": 0 }
        ]
      },
      "pages": [
        { "id": "pg_…", "book_id": "bk_…", "chapter_id": "ch_…",
          "title": "…", "learning_objectives": [],
          "content_type": "theory", "status": "ready", "order": 0,
          "links": [], "parent_page_id": "", "error": "",
          "created_at": 0.0, "updated_at": 0.0,
          "blocks": [ { "id": "blk_…", "type": "text", "status": "ready",
                       "title": "…", "params": {}, "payload": {},
                       "source_anchors": [], "metadata": {},
                       "error": "", "created_at": 0.0, "updated_at": 0.0 } ] }
      ],
      "progress": {
        "book_id": "bk_…", "current_page_id": "",
        "visited_page_ids": [], "bookmarked_page_ids": [],
        "quiz_attempts": [], "weak_chapters": [], "score": 0,
        "updated_at": 0.0
      }
    }

每一层都做了校验，任何缺字段的条目都会被拒绝并给出可读的错误信息。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
import re
from typing import Any, Sequence
from uuid import uuid4

from app.services.text_normalize import normalize_payload
from app.services.hub_normalize import (
    HubFormatError,
    normalize_hub_payload,
)
from app.services.workspace_service import (
    DATA_ROOT,
    WORKSPACES_ROOT,
    get_content_workspace_service,
)

COURSES_ROOT = DATA_ROOT / "courses"

#: 结构模板文件名。它描述 Course 的字段结构，**不是**一门课，
#: 因此不会被 ``list_courses()`` 收进来。
TEMPLATE_FILENAME = "template-schema.json"

# ── 原版 DeepTutor 的枚举（deeptutor/book/models.py） ──────────────────
#: ``BookStatus``
BOOK_STATUSES = frozenset(
    {"draft", "spine_ready", "compiling", "paused", "ready", "error", "archived"}
)
#: ``PageStatus``
PAGE_STATUSES = frozenset(
    {"pending", "planning", "generating", "ready", "partial", "error"}
)
#: ``BlockStatus``
BLOCK_STATUSES = frozenset({"pending", "generating", "ready", "error", "hidden"})
#: ``BlockType``
BLOCK_TYPES = frozenset(
    {
        "text",
        "callout",
        "quiz",
        "user_note",
        "figure",
        "interactive",
        "animation",
        "code",
        "timeline",
        "flash_cards",
        "deep_dive",
        "section",
        "concept_graph",
        "diagnostic",
        "pretest",
        "retrieval_practice",
        "error_diagnosis",
        "module_test",
        "progress_dashboard",
        # 互联网教学视频——正文流里原生播放（YouTube / Bilibili /
        # 直链媒体）。载荷形如：
        #   {"url": "...", "title": "...", "captions": [{"start": 12, "text": "..."}]}
        "video",
        # 外链资源节点——平台不再托管正文，而是挂载全网公开资源。
        # 载荷形如：
        #   {"resource_type": "video", "url": "...", "title": "...",
        #    "ai_context": "预置摘要", "provider": "Bilibili"}
        "resource",
    }
)
#: ``ResourceType`` —— 资源枢纽支持的资源类型。
#:
#: 这是平台转向「连接全网」之后的**核心枚举**：一个节点下面挂的不再
#: 是本地正文，而是若干条外部资源。前端按它决定挂载哪种渲染器。
RESOURCE_TYPES = frozenset({"video", "webpage", "document"})
#: ``ContentType``
CONTENT_TYPES = frozenset(
    {"theory", "derivation", "history", "practice", "concept", "overview"}
)
#: ``BookDepth``
BOOK_DEPTHS = frozenset({"brief", "standard", "deep"})
#: ``PageLink.relation``
LINK_RELATIONS = frozenset({"deepens", "prereq", "references"})

#: 文件名 → 课程 id 的回退规则（原版目录名是 ``book_<id>``）。
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

#: 目录名以这些前缀开头时，整棵子树都不参与扫描。
SKIP_DIR_PREFIXES = ("_", ".")

#: 文件名匹配这些模式时跳过（结构模板、schema、说明文件）。
#:
#: 判定是按**文件名模式**做的，因此将来新增一个结构模板不需要改代码——
#: 只要命名符合这些约定，它就不会被误当成一份课程内容挂载上去。
_SKIP_FILE_PATTERNS = (
    "template-schema.json",
    "*_schema.json",
    "_schema.json",
    "schema.json",
    "*.schema.json",
    "README.md",
)


class CourseError(Exception):
    """课程数据非法。"""


@dataclass(slots=True)
class CourseSourceAnchor:
    """指向原始素材的锚点（原版 ``SourceAnchor``）。"""

    kind: str = ""
    kb_name: str = ""
    ref: str = ""
    snippet: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "kb_name": self.kb_name,
            "ref": self.ref,
            "snippet": self.snippet,
        }


@dataclass(slots=True)
class CourseBlock:
    """页面上的一个原子内容单元（原版 ``Block``）。

    ``payload`` 的形状随 ``type`` 而变，与原版各 BlockGenerator 的返回值
    保持一致（``text`` 用 ``format``/``body``/``role``，``callout`` 用
    ``variant``/``label``/``body``，``code`` 用 ``language``/``code``/
    ``explanation``/``intent``，``quiz`` 用 ``questions``/``topic``，
    ``flash_cards`` 用 ``cards``，``section`` 用 ``format``/``intro``/
    ``subsections``/``key_takeaway``）。
    """

    id: str
    type: str
    status: str = "pending"
    title: str = ""
    params: dict[str, Any] = field(default_factory=dict)
    payload: dict[str, Any] = field(default_factory=dict)
    source_anchors: list[CourseSourceAnchor] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "title": self.title,
            "params": dict(self.params),
            "payload": dict(self.payload),
            "source_anchors": [anchor.to_dict() for anchor in self.source_anchors],
            "metadata": dict(self.metadata),
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass(slots=True)
class CoursePage:
    """一个页面 = 一串有序的 Block（原版 ``Page``）。"""

    id: str
    book_id: str = ""
    chapter_id: str = ""
    title: str = ""
    learning_objectives: list[str] = field(default_factory=list)
    content_type: str = "theory"
    status: str = "pending"
    order: int = 0
    blocks: list[CourseBlock] = field(default_factory=list)
    links: list[dict[str, str]] = field(default_factory=list)
    parent_page_id: str = ""
    #: 一句话导读。
    #:
    #: 资源枢纽里，这一页是个**知识节点**——它没有正文，只有一组外链
    #: 资源。这段导读解释「这个节点要解决什么问题」，是节点标题与
    #: 外链之间的那座桥。
    summary: str = ""
    error: str = ""
    created_at: float = 0.0
    updated_at: float = 0.0

    @property
    def block_count(self) -> int:
        return len(self.blocks)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "book_id": self.book_id,
            "chapter_id": self.chapter_id,
            "title": self.title,
            "learning_objectives": list(self.learning_objectives),
            "content_type": self.content_type,
            "status": self.status,
            "order": self.order,
            "blocks": [block.to_dict() for block in self.blocks],
            "links": [dict(link) for link in self.links],
            "parent_page_id": self.parent_page_id,
            "summary": self.summary,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass(slots=True)
class CourseChapter:
    """spine 里的一章（原版 ``Chapter``）。"""

    id: str
    title: str = ""
    learning_objectives: list[str] = field(default_factory=list)
    content_type: str = "theory"
    source_anchors: list[CourseSourceAnchor] = field(default_factory=list)
    prerequisites: list[str] = field(default_factory=list)
    page_ids: list[str] = field(default_factory=list)
    summary: str = ""
    order: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "learning_objectives": list(self.learning_objectives),
            "content_type": self.content_type,
            "source_anchors": [anchor.to_dict() for anchor in self.source_anchors],
            "prerequisites": list(self.prerequisites),
            "page_ids": list(self.page_ids),
            "summary": self.summary,
            "order": self.order,
        }


@dataclass(slots=True)
class CourseResource:
    """挂在某个知识节点下的**外部资源**。

    这是平台从「文本托管方」转向「全网资源连接枢纽」之后的核心对象。

    一个节点下面不再是本地正文，而是一组资源——每条资源指向全网的
    公开内容（视频、网页、电子书），并附带一段**预置的 AI 上下文**。

    为什么必须有 ``ai_context``
    ----------------------------

    AI **看不见**视频，也读不了被 ``X-Frame-Options`` 挡住的网页。
    用户在看 YouTube 上的某堂课时，右侧的 AI 并不知道他在看什么。

    所以每条资源都带一段人工/AI 预置的摘要。它是这座桥梁：用户在
    左边看资源，AI 拿着这段摘要在右边陪读。
    """

    id: str
    #: 资源类型——``video`` / ``webpage`` / ``document``。
    resource_type: str = "webpage"
    #: 资源标题。
    title: str = ""
    #: 外链地址。
    url: str = ""
    #: 预置的 AI 上下文（摘要 / 核心知识点）。
    ai_context: str = ""
    #: 来源平台——``Bilibili`` / ``YouTube`` / ``Wikipedia`` …
    provider: str = ""
    #: 补充说明（作者、时长、语言等）。
    meta: dict[str, Any] = field(default_factory=dict)
    #: 字幕节点（视频资源用）。
    captions: list[dict[str, Any]] = field(default_factory=list)
    #: **交互节点**——视频播放到某个时间戳时弹出的知识点。
    #:
    #: 这是「流媒体交互式沙盘」的核心数据。每条记录形如::
    #:
    #:     {"timestamp": 120, "keyword": "机会成本", "type": "concept"}
    #:
    #: 前端在播放进度到达 ``timestamp`` 时，在画面上弹出一个可点击的
    #: 实体气泡；用户点了它，视频暂停，右侧 AI 被唤醒。
    #:
    #: 为什么把它放进**资源**而不是单独一层
    #: ------------------------------------
    #:
    #: 因为它天然是**这条视频**的属性——同一套知识点换个视频讲，
    #: 时间戳就全变了。挂在资源上，随资源一起被复制、导入、投影。
    interactive_nodes: list[dict[str, Any]] = field(default_factory=list)
    #: 是否为该节点的默认资源。
    is_default: bool = False
    #: 这段 ``ai_context`` 是不是**自动合成**的。
    #:
    #: 作者手写的摘要信息量远高于系统合成的概要。AI 拿到这个标记就
    #: 知道「这条资源我只有概要，得诚实说明」——而不是假装自己读全了。
    auto_context: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "resource_type": self.resource_type,
            "title": self.title,
            "url": self.url,
            "ai_context": self.ai_context,
            "provider": self.provider,
            "meta": dict(self.meta),
            "captions": [dict(item) for item in self.captions],
            "interactive_nodes": [dict(item) for item in self.interactive_nodes],
            "is_default": self.is_default,
            "auto_context": self.auto_context,
        }


@dataclass(slots=True)
class CourseNode:
    """资源枢纽里的一个**知识节点**。

    节点是「问题」级别的单位——「什么是荒谬？」。它本身没有正文，
    只有一组外部资源；前端在这里渲染资源切换器与资源查看器。
    """

    id: str
    topic_id: str = ""
    title: str = ""
    question: str = ""
    summary: str = ""
    order: int = 0
    resources: list[CourseResource] = field(default_factory=list)

    @property
    def default_resource(self) -> CourseResource | None:
        """默认资源——标记过的优先，否则取第一个。"""
        for resource in self.resources:
            if resource.is_default:
                return resource
        return self.resources[0] if self.resources else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "topic_id": self.topic_id,
            "title": self.title,
            "question": self.question,
            "summary": self.summary,
            "order": self.order,
            "resources": [resource.to_dict() for resource in self.resources],
        }


@dataclass(slots=True)
class CourseTopic:
    """资源枢纽里的一个**主题模块**——「存在主义哲学」。"""

    id: str
    title: str = ""
    summary: str = ""
    order: int = 0
    node_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "summary": self.summary,
            "order": self.order,
            "node_ids": list(self.node_ids),
        }


@dataclass(slots=True)
class CourseProgress:
    """阅读进度（原版 ``Progress``）。
    在原版四段结构之外，这里多记了两个**真实遥测**字段：

    * ``dwell_seconds`` —— 用户在这门课里**真正停留**的累计秒数；
    * ``page_coverage`` —— 每一页被**滚动看过**的比例（0–1）。

    为什么要有这两个
    --------------
    ``visited_page_ids`` 只说「这一页被打开过」。但「打开过」和
    「读过」是两件事：连点 20 次翻页，20 页都会进列表，进度条直接
    冲到 40%——这就是造假的来源。

    所以「已读」的判定改用**遥测**：一页只有在用户停留够久、或者
    真的滚动到底之后才算读过。进度条因此反映的是**注意力**，而
    不是点击次数。
    """

    book_id: str = ""
    current_page_id: str = ""
    visited_page_ids: list[str] = field(default_factory=list)
    bookmarked_page_ids: list[str] = field(default_factory=list)
    quiz_attempts: list[dict[str, Any]] = field(default_factory=list)
    weak_chapters: list[str] = field(default_factory=list)
    score: int = 0
    updated_at: float = 0.0
    #: 累计停留秒数（真实计时，不是估算）。
    dwell_seconds: float = 0.0
    #: 页 id → 被滚动看过的比例（0–1）。只保留最长的那次。
    page_coverage: dict[str, float] = field(default_factory=dict)
    #: 页 id → 在这一页上累计停留的秒数。
    page_dwell: dict[str, float] = field(default_factory=dict)
    #: 资源 id → 资源级学习痕迹。
    #:
    #: 为什么进度要下沉到资源
    #: ----------------------
    #: 资源枢纽型课程里，一个节点下面挂着**多条**外链资源——一部讲
    #: 荒诞的视频、一篇维基词条、一份 SEP 长文。进度只挂在节点上的话，
    #: 「这个节点我学过了」是**误导**：用户可能只看了视频，压根没打开
    #: 那篇长文。
    #:
    #: 所以这里给每条资源单独记账：看了多久、算不算完成。完成判定
    #: 与页级遥测同源——**必须有停留时长做证据**，用户手动标记完成
    #: 也会被记下来（那是明确的意图，同样算数）。
    resource_progress: dict[str, dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "book_id": self.book_id,
            "current_page_id": self.current_page_id,
            "visited_page_ids": list(self.visited_page_ids),
            "bookmarked_page_ids": list(self.bookmarked_page_ids),
            "quiz_attempts": list(self.quiz_attempts),
            "weak_chapters": list(self.weak_chapters),
            "score": self.score,
            "updated_at": self.updated_at,
            "dwell_seconds": round(float(self.dwell_seconds), 3),
            "page_coverage": {
                str(key): round(float(value), 4)
                for key, value in self.page_coverage.items()
            },
            "page_dwell": {
                str(key): round(float(value), 3)
                for key, value in self.page_dwell.items()
            },
            "resource_progress": {
                str(key): dict(value) for key, value in self.resource_progress.items()
            },
        }


@dataclass(slots=True)
class Course:
    """一门课程 = 原版的一个 ``Book``（连同它的 spine / pages / progress）。"""

    id: str
    revision: int = 1
    title: str = ""
    description: str = ""
    status: str = "draft"
    proposal: dict[str, Any] | None = None
    knowledge_bases: list[str] = field(default_factory=list)
    language: str = "en"
    depth: str = "standard"
    page_count: int = 0
    chapter_count: int = 0
    created_at: float = 0.0
    updated_at: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
    kb_fingerprints: dict[str, str] = field(default_factory=dict)
    kb_document_fingerprints: dict[str, dict[str, str]] = field(default_factory=dict)
    stale_page_ids: list[str] = field(default_factory=list)
    stale_detected_at: float = 0.0

    chapters: list[CourseChapter] = field(default_factory=list)
    pages: list[CoursePage] = field(default_factory=list)
    progress: CourseProgress = field(default_factory=CourseProgress)
    concept_graph: dict[str, Any] = field(default_factory=dict)
    exploration_summary: str = ""
    spine_version: int = 1
    spine_updated_at: float = 0.0

    # ── 资源枢纽（Topic → Node → Resource） ──────────────────────────
    #
    # 这三个字段是**可选的**：只有「资源枢纽型」课程才有。旧的课程
    # 仍然是 chapters + pages 的文本结构，两种形态并存。
    topics: list[CourseTopic] = field(default_factory=list)
    nodes: list[CourseNode] = field(default_factory=list)
    resources: list[CourseResource] = field(default_factory=list)
    #: 这门课是不是「资源枢纽型」——决定前端挂载哪个渲染器。
    is_hub: bool = False

    source: str = "user"  # "user" | "workspace"

    # ── 派生字段（不落盘，从 pages 算出来） ───────────────────────────

    @property
    def lesson_count(self) -> int:
        """课时数 = 页数（原版 page_count）。"""
        return len(self.pages)

    @property
    def total_minutes(self) -> int:
        """总时长：按每页 block 数折算，每页约 8 分钟。"""
        return sum(8 for _ in self.pages)

    @property
    def block_count(self) -> int:
        return sum(len(page.blocks) for page in self.pages)

    @property
    def tags(self) -> list[str]:
        raw = self.metadata.get("tags")
        return [str(tag) for tag in raw] if isinstance(raw, list) else []

    @property
    def category(self) -> str:
        return str(self.metadata.get("category") or "")

    @property
    def level(self) -> str:
        return str(self.metadata.get("level") or "")

    @property
    def difficulty(self) -> str:
        """难度级别。

        与 :attr:`level` 同义但更明确——课程卡片用的是「难度」这个
        概念。缺失时回落到 ``level``，两者都缺则为空串（前端会因此
        隐藏难度标识，而不是渲染出 ``undefined``）。
        """
        return str(self.metadata.get("difficulty") or self.metadata.get("level") or "")

    def pages_of_chapter(self, chapter_id: str) -> list[CoursePage]:
        return [page for page in self.pages if page.chapter_id == chapter_id]

    def to_dict(self) -> dict[str, Any]:
        return {
            # ── book（原版 Book manifest） ──
            "id": self.id,
            "revision": self.revision,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "proposal": self.proposal,
            "knowledge_bases": list(self.knowledge_bases),
            "language": self.language,
            "depth": self.depth,
            "page_count": self.page_count,
            "chapter_count": self.chapter_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "metadata": dict(self.metadata),
            "kb_fingerprints": dict(self.kb_fingerprints),
            "kb_document_fingerprints": {
                key: dict(value) for key, value in self.kb_document_fingerprints.items()
            },
            "stale_page_ids": list(self.stale_page_ids),
            "stale_detected_at": self.stale_detected_at,
            # ── spine ──
            "spine": {
                "book_id": self.id,
                "version": self.spine_version,
                "updated_at": self.spine_updated_at,
                "exploration_summary": self.exploration_summary,
                "concept_graph": dict(self.concept_graph),
                "chapters": [chapter.to_dict() for chapter in self.chapters],
            },
            # ── pages ──
            "pages": [page.to_dict() for page in self.pages],
            # ── 资源枢纽（Topic → Node → Resource） ──
            "hub": {
                "is_hub": self.is_hub,
                "topics": [topic.to_dict() for topic in self.topics],
                "nodes": [node.to_dict() for node in self.nodes],
                "resources": [resource.to_dict() for resource in self.resources],
            },
            # ── progress ──
            "progress": self.progress.to_dict(),
            # ── 派生 / 兼容字段 ──
            "source": self.source,
            "lesson_count": self.lesson_count,
            "total_minutes": self.total_minutes,
            "block_count": self.block_count,
            "category": self.category,
            "level": self.level,
            "difficulty": self.difficulty,
            "tags": self.tags,
        }


# ── 解析 ──────────────────────────────────────────────────────────────


def _as_float(raw: Any, default: float = 0.0) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _as_int(raw: Any, default: int = 0) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _as_str_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if str(item).strip()]


def _as_dict(raw: Any) -> dict[str, Any]:
    return dict(raw) if isinstance(raw, dict) else {}


def _parse_source_anchors(raw: Any) -> list[CourseSourceAnchor]:
    if not isinstance(raw, list):
        return []
    out: list[CourseSourceAnchor] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        out.append(
            CourseSourceAnchor(
                kind=str(item.get("kind") or ""),
                kb_name=str(item.get("kb_name") or ""),
                ref=str(item.get("ref") or ""),
                snippet=str(item.get("snippet") or ""),
            )
        )
    return out


def _parse_block(raw: Any, *, index: int) -> CourseBlock:
    if not isinstance(raw, dict):
        raise CourseError(f"Block #{index + 1} must be an object.")
    block_type = str(raw.get("type") or "").strip()
    if not block_type:
        raise CourseError(f"Block #{index + 1} requires a 'type'.")
    if block_type not in BLOCK_TYPES:
        raise CourseError(
            f"Block #{index + 1} has unknown type {block_type!r}; "
            f"expected one of {sorted(BLOCK_TYPES)}."
        )
    status = str(raw.get("status") or "pending").strip()
    if status not in BLOCK_STATUSES:
        raise CourseError(
            f"Block #{index + 1} has unknown status {status!r}; "
            f"expected one of {sorted(BLOCK_STATUSES)}."
        )
    return CourseBlock(
        id=str(raw.get("id") or f"blk_{index + 1}"),
        type=block_type,
        status=status,
        title=str(raw.get("title") or ""),
        params=_as_dict(raw.get("params")),
        payload=_as_dict(raw.get("payload")),
        source_anchors=_parse_source_anchors(raw.get("source_anchors")),
        metadata=_as_dict(raw.get("metadata")),
        error=str(raw.get("error") or ""),
        created_at=_as_float(raw.get("created_at")),
        updated_at=_as_float(raw.get("updated_at")),
    )


def _parse_page(raw: Any, *, index: int) -> CoursePage:
    if not isinstance(raw, dict):
        raise CourseError(f"Page #{index + 1} must be an object.")
    title = str(raw.get("title") or "").strip()
    if not title:
        raise CourseError(f"Page #{index + 1} requires a non-empty 'title'.")
    content_type = str(raw.get("content_type") or "theory").strip()
    if content_type not in CONTENT_TYPES:
        raise CourseError(
            f"Page #{index + 1} has unknown content_type {content_type!r}; "
            f"expected one of {sorted(CONTENT_TYPES)}."
        )
    status = str(raw.get("status") or "pending").strip()
    if status not in PAGE_STATUSES:
        raise CourseError(
            f"Page #{index + 1} has unknown status {status!r}; "
            f"expected one of {sorted(PAGE_STATUSES)}."
        )
    raw_blocks = raw.get("blocks")
    if raw_blocks is not None and not isinstance(raw_blocks, list):
        raise CourseError(f"Page #{index + 1} 'blocks' must be a list.")
    blocks = [
        _parse_block(item, index=block_index)
        for block_index, item in enumerate(raw_blocks or [])
    ]
    links: list[dict[str, str]] = []
    for item in raw.get("links") or []:
        if not isinstance(item, dict):
            continue
        links.append(
            {
                "target_page_id": str(item.get("target_page_id") or ""),
                "relation": str(item.get("relation") or "references"),
                "label": str(item.get("label") or ""),
            }
        )
    return CoursePage(
        id=str(raw.get("id") or f"pg_{index + 1}"),
        book_id=str(raw.get("book_id") or ""),
        chapter_id=str(raw.get("chapter_id") or ""),
        title=title,
        learning_objectives=_as_str_list(raw.get("learning_objectives")),
        content_type=content_type,
        status=status,
        order=_as_int(raw.get("order"), index),
        blocks=blocks,
        links=links,
        parent_page_id=str(raw.get("parent_page_id") or ""),
        error=str(raw.get("error") or ""),
        created_at=_as_float(raw.get("created_at")),
        updated_at=_as_float(raw.get("updated_at")),
    )


def _parse_chapter(raw: Any, *, index: int) -> CourseChapter:
    if not isinstance(raw, dict):
        raise CourseError(f"Chapter #{index + 1} must be an object.")
    title = str(raw.get("title") or "").strip()
    if not title:
        raise CourseError(f"Chapter #{index + 1} requires a non-empty 'title'.")
    content_type = str(raw.get("content_type") or "theory").strip()
    if content_type not in CONTENT_TYPES:
        raise CourseError(
            f"Chapter #{index + 1} has unknown content_type {content_type!r}; "
            f"expected one of {sorted(CONTENT_TYPES)}."
        )
    return CourseChapter(
        id=str(raw.get("id") or f"ch_{index + 1}"),
        title=title,
        learning_objectives=_as_str_list(raw.get("learning_objectives")),
        content_type=content_type,
        source_anchors=_parse_source_anchors(raw.get("source_anchors")),
        prerequisites=_as_str_list(raw.get("prerequisites")),
        page_ids=_as_str_list(raw.get("page_ids")),
        summary=str(raw.get("summary") or ""),
        order=_as_int(raw.get("order"), index),
    )


def _parse_progress(raw: Any, book_id: str) -> CourseProgress:
    data = _as_dict(raw)
    return CourseProgress(
        book_id=str(data.get("book_id") or book_id),
        current_page_id=str(data.get("current_page_id") or ""),
        visited_page_ids=_as_str_list(data.get("visited_page_ids")),
        bookmarked_page_ids=_as_str_list(data.get("bookmarked_page_ids")),
        quiz_attempts=[
            dict(item) for item in (data.get("quiz_attempts") or []) if isinstance(item, dict)
        ],
        weak_chapters=_as_str_list(data.get("weak_chapters")),
        score=_as_int(data.get("score")),
        updated_at=_as_float(data.get("updated_at")),
        dwell_seconds=_as_float(data.get("dwell_seconds")),
        page_coverage={
            str(key): _as_float(value)
            for key, value in (data.get("page_coverage") or {}).items()
        }
        if isinstance(data.get("page_coverage"), dict)
        else {},
        page_dwell={
            str(key): _as_float(value)
            for key, value in (data.get("page_dwell") or {}).items()
        }
        if isinstance(data.get("page_dwell"), dict)
        else {},
        resource_progress={
            str(key): dict(value)
            for key, value in (data.get("resource_progress") or {}).items()
            if isinstance(value, dict)
        }
        if isinstance(data.get("resource_progress"), dict)
        else {},
    )


def course_from_dict(raw: dict[str, Any], *, source: str = "user") -> Course:
    """把一份课程 JSON 解析成 :class:`Course`。

    三条路径，按特异性从高到低：

    1. **资源枢纽**（顶层有 ``hub`` 段）→ :func:`course_from_hub_dict`；
    2. **原版严格结构**（顶层有 ``book`` 段）→ 本函数的原有逻辑；
    3. **宽松格式** → :func:`course_from_loose_dict`，把任意「带文本的
       JSON」适配成课程结构。

    第 3 条让语料库可以接受任意形态的教材，而不必事先手工改写成四段
    格式。
    """
    if not isinstance(raw, dict):
        raise CourseError("Course payload must be an object.")

    # ── ① 资源枢纽 ────────────────────────────────────────────────────
    #
    # 平台从「文本托管方」转向「全网资源连接枢纽」之后，顶层多了一个
    # ``hub`` 段：Topic → Node → Resource。这条路径**优先**于其它两种
    # ——它带 ``book`` 段也不冲突，但语义上以 hub 为准。
    if isinstance(raw.get("hub"), dict):
        return course_from_hub_dict(raw, source=source)

    book = _as_dict(raw.get("book"))
    if not book:
        # 没有 book 段——尝试宽松适配。
        return course_from_loose_dict(raw, source=source)

    title = str(book.get("title") or "").strip()
    if not title:
        raise CourseError("Course requires a non-empty 'title'.")

    course_id = str(book.get("id") or "").strip()
    if not course_id:
        raise CourseError("Course requires a non-empty 'id'.")
    if not _ID_RE.match(course_id):
        raise CourseError(
            f"Course id must match ^[A-Za-z0-9_-]{{1,64}}$: {course_id!r}"
        )

    status = str(book.get("status") or "draft").strip()
    if status not in BOOK_STATUSES:
        raise CourseError(
            f"Course has unknown status {status!r}; "
            f"expected one of {sorted(BOOK_STATUSES)}."
        )

    depth = str(book.get("depth") or "standard").strip()
    if depth not in BOOK_DEPTHS:
        raise CourseError(
            f"Course has unknown depth {depth!r}; expected one of {sorted(BOOK_DEPTHS)}."
        )

    proposal_raw = book.get("proposal")
    proposal = dict(proposal_raw) if isinstance(proposal_raw, dict) else None

    metadata = _as_dict(book.get("metadata"))

    spine = _as_dict(raw.get("spine"))
    raw_chapters = spine.get("chapters")
    if raw_chapters is not None and not isinstance(raw_chapters, list):
        raise CourseError("'spine.chapters' must be a list.")
    chapters = [
        _parse_chapter(item, index=index)
        for index, item in enumerate(raw_chapters or [])
    ]

    raw_pages = raw.get("pages")
    if raw_pages is not None and not isinstance(raw_pages, list):
        raise CourseError("'pages' must be a list.")
    pages = [_parse_page(item, index=index) for index, item in enumerate(raw_pages or [])]

    # page_count / chapter_count 以实际内容为准；文件里写的值只在内容为空时兜底。
    page_count = len(pages) or _as_int(book.get("page_count"))
    chapter_count = len(chapters) or _as_int(book.get("chapter_count"))

    return Course(
        id=course_id,
        revision=_as_int(book.get("revision"), 1),
        title=title,
        description=str(book.get("description") or ""),
        status=status,
        proposal=proposal,
        knowledge_bases=_as_str_list(book.get("knowledge_bases")),
        language=str(book.get("language") or "en"),
        depth=depth,
        page_count=page_count,
        chapter_count=chapter_count,
        created_at=_as_float(book.get("created_at")),
        updated_at=_as_float(book.get("updated_at")),
        metadata=metadata,
        kb_fingerprints={
            str(key): str(value)
            for key, value in _as_dict(book.get("kb_fingerprints")).items()
        },
        kb_document_fingerprints={
            str(key): {str(k): str(v) for k, v in _as_dict(value).items()}
            for key, value in _as_dict(book.get("kb_document_fingerprints")).items()
        },
        stale_page_ids=_as_str_list(book.get("stale_page_ids")),
        stale_detected_at=_as_float(book.get("stale_detected_at")),
        chapters=chapters,
        pages=pages,
        progress=_parse_progress(raw.get("progress"), course_id),
        concept_graph=_as_dict(spine.get("concept_graph")),
        exploration_summary=str(spine.get("exploration_summary") or ""),
        spine_version=_as_int(spine.get("version"), 1),
        spine_updated_at=_as_float(spine.get("updated_at")),
        source=source,
    )


# ── 资源枢纽适配 ────────────────────────────────────────────────────────
#
# 平台从「本地文本托管方」转向「全网资源连接枢纽」之后的第二条主路径。
#
# 一门枢纽课的结构是：
#
# .. code-block:: text
#
#     Topic（主题模块）──例：存在主义哲学
#       └── Node（知识节点）──例：什么是荒谬？
#             └── Resource（外链资源）──例：B 站视频 / 维基百科网页
#                   └── ai_context（预置摘要，喂给右侧 AI）
#
# 为什么还要投影成 Page / Block
# ------------------------------
#
# 因为**下游全都已经在用 Page / Block 了**：阅读进度、遥测、划线笔记、
# AI 的课程上下文、编辑器……把它们全部推倒重写，代价巨大且没有任何
# 好处。
#
# 所以这里做一次**投影**：一个 Node 投影成一个 Page，Node 下的每条
# Resource 投影成一个 ``resource`` 类型的 Block。
#
# .. code-block:: text
#
#     Node「什么是荒谬？」
#       ├─ resource block (video)    → 中栏挂载 react-player
#       └─ resource block (webpage)  → 中栏挂载 iframe
#
# 于是「资源枢纽」只是一门**长得不一样**的课程，而不是一条新的平行
# 世界。已有的能力（进度、笔记、AI 上下文、遥测）全部白拿。
#
# 前端则在 PageSection 里按 block 类型分发：``resource`` 块交给
# 「全能媒体渲染器」。


def _parse_hub_resource(raw: Any, *, node_id: str, index: int) -> CourseResource:
    """解析一条外链资源。"""
    data = _as_dict(raw)
    resource_type = str(data.get("resource_type") or data.get("type") or "").strip()
    if not resource_type:
        raise CourseError(
            f"Resource #{index + 1} of node {node_id!r} requires a 'resource_type'."
        )
    if resource_type not in RESOURCE_TYPES:
        raise CourseError(
            f"Resource #{index + 1} of node {node_id!r} has unknown resource_type "
            f"{resource_type!r}; expected one of {sorted(RESOURCE_TYPES)}."
        )

    url = str(data.get("url") or data.get("link") or data.get("href") or "").strip()
    if not url:
        raise CourseError(
            f"Resource #{index + 1} of node {node_id!r} requires a 'url'."
        )

    captions_raw = data.get("captions")
    captions = (
        [dict(item) for item in captions_raw if isinstance(item, dict)]
        if isinstance(captions_raw, list)
        else []
    )

    interactive_raw = data.get("interactive_nodes")
    interactive_nodes = (
        [dict(item) for item in interactive_raw if isinstance(item, dict)]
        if isinstance(interactive_raw, list)
        else []
    )

    return CourseResource(
        id=str(data.get("id") or f"res_{node_id}_{index + 1}"),
        resource_type=resource_type,
        title=str(data.get("title") or "").strip(),
        url=url,
        ai_context=str(data.get("ai_context") or data.get("summary") or "").strip(),
        provider=str(data.get("provider") or "").strip(),
        meta=_as_dict(data.get("meta")),
        captions=captions,
        interactive_nodes=interactive_nodes,
        is_default=bool(data.get("is_default", False)),
        auto_context=bool(data.get("auto_context", False)),
    )


def _parse_hub_node(raw: Any, *, topic_id: str, index: int) -> CourseNode:
    """解析一个知识节点。"""
    data = _as_dict(raw)
    title = str(data.get("title") or data.get("question") or "").strip()
    if not title:
        raise CourseError(f"Node #{index + 1} requires a non-empty 'title'.")

    node_id = str(data.get("id") or f"node_{topic_id}_{index + 1}")

    resources_raw = data.get("resources")
    if not isinstance(resources_raw, list) or not resources_raw:
        raise CourseError(f"Node {node_id!r} requires a non-empty 'resources' list.")

    resources = [
        _parse_hub_resource(item, node_id=node_id, index=resource_index)
        for resource_index, item in enumerate(resources_raw)
    ]

    return CourseNode(
        id=node_id,
        topic_id=topic_id,
        title=title,
        question=str(data.get("question") or "").strip(),
        summary=str(data.get("summary") or "").strip(),
        order=_as_int(data.get("order"), index),
        resources=resources,
    )


def _parse_hub_topic(raw: Any, *, index: int) -> CourseTopic:
    """解析一个主题模块。"""
    data = _as_dict(raw)
    title = str(data.get("title") or "").strip()
    if not title:
        raise CourseError(f"Topic #{index + 1} requires a non-empty 'title'.")

    topic_id = str(data.get("id") or f"topic_{index + 1}")
    nodes_raw = data.get("nodes")
    if not isinstance(nodes_raw, list) or not nodes_raw:
        raise CourseError(f"Topic {topic_id!r} requires a non-empty 'nodes' list.")

    return CourseTopic(
        id=topic_id,
        title=title,
        summary=str(data.get("summary") or "").strip(),
        order=_as_int(data.get("order"), index),
        node_ids=[
            str(_as_dict(item).get("id") or f"node_{topic_id}_{node_index + 1}")
            for node_index, item in enumerate(nodes_raw)
        ],
    )


def course_from_hub_dict(raw: dict[str, Any], *, source: str = "user") -> Course:
    """把一份「资源枢纽」课程 JSON 解析成 :class:`Course`。

    数据形状::

        {
          "hub": {
            "title": "存在主义哲学资源枢纽",
            "description": "...",
            "topics": [
              {
                "id": "topic_absurd",
                "title": "存在主义哲学",
                "summary": "...",
                "nodes": [
                  {
                    "id": "node_absurd",
                    "title": "什么是荒谬？",
                    "question": "...",
                    "summary": "...",
                    "resources": [
                      {
                        "id": "res_absurd_bili",
                        "resource_type": "video",
                        "title": "...",
                        "url": "https://www.bilibili.com/video/BV...",
                        "provider": "Bilibili",
                        "ai_context": "预置摘要……",
                        "is_default": true
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }

    作者格式（省略 id / provider / ai_context 等机械字段）也能直接读——
    补全逻辑见 :mod:`app.services.hub_normalize`。
    """
    # 先做一次**归一化**：把作者可能省略的字段补全（id、provider、
    # resource_type、ai_context …），让这里的解析只面对完整数据。
    try:
        normalized = normalize_hub_payload(raw)
    except HubFormatError as exc:
        raise CourseError(str(exc)) from exc

    hub = _as_dict(normalized.get("hub"))

    title = str(hub.get("title") or raw.get("title") or "").strip()
    if not title:
        raise CourseError("Hub course requires a non-empty 'title'.")

    course_id = str(hub.get("id") or raw.get("id") or "").strip()
    if not course_id:
        course_id = _slugify(title)
    if not _ID_RE.match(course_id):
        raise CourseError(
            f"Course id must match ^[A-Za-z0-9_-]{{1,64}}$: {course_id!r}"
        )

    topics_raw = hub.get("topics")
    if not isinstance(topics_raw, list) or not topics_raw:
        raise CourseError("Hub course requires a non-empty 'topics' list.")

    topics: list[CourseTopic] = []
    nodes: list[CourseNode] = []
    resources: list[CourseResource] = []

    for topic_index, topic_raw in enumerate(topics_raw):
        topic = _parse_hub_topic(topic_raw, index=topic_index)
        topics.append(topic)

        nodes_raw = _as_dict(topic_raw).get("nodes")
        for node_index, node_raw in enumerate(nodes_raw or []):
            node = _parse_hub_node(
                node_raw, topic_id=topic.id, index=node_index
            )
            nodes.append(node)
            resources.extend(node.resources)

    if not nodes:
        raise CourseError(f"Hub course {course_id!r} contains no nodes.")

    # ── 投影成 Page / Block ──────────────────────────────────────────
    #
    # 一个 Node → 一个 Page；Node 下的每条 Resource → 一个 ``resource``
    # 块。这样下游（进度 / 笔记 / 遥测 / AI 上下文）完全不用改。
    chapters: list[CourseChapter] = []
    pages: list[CoursePage] = []

    for topic in topics:
        topic_nodes = [node for node in nodes if node.topic_id == topic.id]
        chapter = CourseChapter(
            id=topic.id,
            title=topic.title,
            learning_objectives=[],
            content_type="concept",
            source_anchors=[],
            prerequisites=[],
            page_ids=[],
            summary=topic.summary,
            order=topic.order,
        )
        chapters.append(chapter)

        for node in topic_nodes:
            blocks = [
                CourseBlock(
                    id=f"blk_{resource.id}",
                    type="resource",
                    status="ready",
                    title=resource.title,
                    params={},
                    payload=resource.to_dict(),
                    source_anchors=[],
                    metadata={},
                    error="",
                    created_at=0.0,
                    updated_at=0.0,
                )
                for resource in node.resources
            ]
            pages.append(
                CoursePage(
                    id=node.id,
                    book_id=course_id,
                    chapter_id=topic.id,
                    title=node.title,
                    learning_objectives=[],
                    content_type="concept",
                    status="ready",
                    order=node.order,
                    blocks=blocks,
                    links=[],
                    parent_page_id="",
                    summary=node.summary,
                    error="",
                    created_at=0.0,
                    updated_at=0.0,
                )
            )
            chapter.page_ids.append(node.id)

    metadata = _as_dict(raw.get("metadata")) or _as_dict(hub.get("metadata"))

    return Course(
        id=course_id,
        revision=_as_int(hub.get("revision"), 1),
        title=title,
        description=str(hub.get("description") or raw.get("description") or ""),
        status=str(hub.get("status") or "ready"),
        proposal=None,
        knowledge_bases=[],
        language=str(hub.get("language") or "zh"),
        depth=str(hub.get("depth") or "standard"),
        page_count=len(pages),
        chapter_count=len(chapters),
        created_at=_as_float(hub.get("created_at")),
        updated_at=_as_float(hub.get("updated_at")),
        metadata=metadata,
        kb_fingerprints={},
        kb_document_fingerprints={},
        stale_page_ids=[],
        stale_detected_at=0.0,
        chapters=chapters,
        pages=pages,
        progress=_parse_progress(raw.get("progress"), course_id),
        concept_graph={},
        exploration_summary=str(hub.get("exploration_summary") or ""),
        spine_version=1,
        spine_updated_at=_as_float(hub.get("updated_at")),
        topics=topics,
        nodes=nodes,
        resources=resources,
        is_hub=True,
        source=source,
    )


# ── 宽松格式适配 ────────────────────────────────────────────────────────
#
# 语料库的目的是「内容无限扩容」。如果每加一本教材都得先手工改写成
# Book Engine 的四段结构，那道坎就足以让人放弃。
#
# 下面的适配器把任意「带文本的 JSON」映射成课程结构：常见键名都认，
# 找不到就退化到「整份文件是一段正文」。适配只发生在**读取**侧——
# 写回时仍产出标准四段结构，因此不会污染语料库。

#: 常见的「正文」键名，按优先级排列。
_TEXT_KEYS = ("content", "text", "body", "markdown", "description", "summary")

#: 常见的「标题」键名。
_TITLE_KEYS = ("title", "name", "heading", "topic", "chapter")

#: 常见的「分节」键名——值是对象数组时按节拆成页。
_SECTION_KEYS = ("pages", "sections", "chapters", "lessons", "units", "items")


def _first_text(data: dict[str, Any], keys: Sequence[str]) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def course_from_loose_dict(raw: dict[str, Any], *, source: str = "user") -> Course:
    """把任意带文本的 JSON 适配成 :class:`Course`。

    支持三种形态，从具体到笼统：

    1. **分节列表** —— ``{"title": ..., "pages": [{"title":..., "content":...}]}``；
    2. **单段正文** —— ``{"title": ..., "content": "一整段话"}``；
    3. **纯文本兜底** —— 只认得出字符串值的，整份文件当成一页正文。

    认不出来的（既无标题也无任何文本）才报错——那种文件不构成内容。
    """
    title = _first_text(raw, _TITLE_KEYS)
    course_id = str(raw.get("id") or raw.get("slug") or "").strip()
    if not course_id:
        # id 缺省时用标题派生，保证文件仍可被寻址。
        course_id = _slugify(title)
    if not course_id or not _ID_RE.match(course_id):
        raise CourseError(
            "Loose course needs an 'id' (or a title to derive one from): "
            f"{course_id!r}"
        )

    pages = _loose_pages(raw, course_id)
    if not pages:
        raise CourseError(f"Course {course_id!r} contains no readable text.")

    chapters = _loose_chapters(raw, pages)
    metadata = _as_dict(raw.get("metadata"))
    if not title:
        title = pages[0].title or course_id

    return Course(
        id=course_id,
        revision=_as_int(raw.get("revision"), 1),
        title=title,
        description=str(raw.get("description") or raw.get("summary") or ""),
        status="ready",
        proposal=None,
        knowledge_bases=[],
        language=str(raw.get("language") or "zh"),
        depth="brief",
        page_count=len(pages),
        chapter_count=len(chapters),
        created_at=_as_float(raw.get("created_at")),
        updated_at=_as_float(raw.get("updated_at")),
        metadata=metadata,
        kb_fingerprints={},
        kb_document_fingerprints={},
        stale_page_ids=[],
        stale_detected_at=0.0,
        chapters=chapters,
        pages=pages,
        progress=CourseProgress(book_id=course_id),
        exploration_summary=str(raw.get("exploration_summary") or ""),
        spine_version=1,
        spine_updated_at=_as_float(raw.get("updated_at")),
        source=source,
    )


def _slugify(text: str) -> str:
    """把标题派生成一个合法的课程 id。

    非 ASCII 字符会被替换成 ``-``；如果结果为空就退回一个占位 id，
    后续 :func:`_ID_RE` 的校验会决定它能不能用。
    """
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", (text or "").strip()).strip("-")
    return slug[:64]


def _loose_pages(raw: dict[str, Any], course_id: str) -> list[CoursePage]:
    """把宽松格式里的内容拆成页。"""
    pages: list[CoursePage] = []

    # 形态 1：有分节列表。
    for key in _SECTION_KEYS:
        sections = raw.get(key)
        if not isinstance(sections, list) or not sections:
            continue
        for index, item in enumerate(sections):
            if isinstance(item, str):
                body = item.strip()
                title = f"第 {index + 1} 节"
            elif isinstance(item, dict):
                body = _first_text(item, _TEXT_KEYS)
                title = _first_text(item, _TITLE_KEYS) or f"第 {index + 1} 节"
            else:
                continue
            if not body:
                continue
            pages.append(
                _loose_page(course_id, title, body, index, len(pages))
            )
        if pages:
            return pages

    # 形态 2：单段正文。
    body = _first_text(raw, _TEXT_KEYS)
    if body:
        pages.append(
            _loose_page(course_id, _first_text(raw, _TITLE_KEYS) or "正文", body, 0, 0)
        )

    return pages


def _loose_page(
    course_id: str,
    title: str,
    body: str,
    index: int,
    block_index: int,
) -> CoursePage:
    """构造一个只有一段正文的页。"""
    block = CourseBlock(
        id=f"blk_{course_id}_{block_index + 1}",
        type="text",
        status="ready",
        title=title,
        payload={"content": body},
    )
    return CoursePage(
        id=f"pg_{course_id}_{index + 1}",
        book_id=course_id,
        chapter_id="",
        title=title,
        learning_objectives=[],
        content_type="theory",
        status="ready",
        order=index,
        blocks=[block],
    )


def _loose_chapters(
    raw: dict[str, Any], pages: list[CoursePage]
) -> list[CourseChapter]:
    """把页归到一个章节下。

    宽松格式没有真正的 spine，因此所有页归入一个章节——列表页按章节
    分组渲染时不会因此丢失内容。
    """
    if not pages:
        return []
    return [
        CourseChapter(
            id=f"ch_{pages[0].book_id}",
            title="全部内容",
            page_ids=[page.id for page in pages],
            order=0,
        )
    ]


def course_to_dict(course: Course) -> dict[str, Any]:
    """还原成原版的四段 JSON 结构。

    资源枢纽型课程会**额外**带一个 ``hub`` 段。

    为什么必须保留
    --------------

    这门课一旦被改写成纯四段结构，``Topic → Node → Resource`` 的
    原始形态就丢了——它会被压扁成一堆 ``resource`` 块的 ``pages``。
    资源本身还在（它们在块载荷里），但**结构**没了：无法再回答
    「这个节点属于哪个主题」「这个资源是不是默认的」。

    所以这里把 ``hub`` 段原样带回去，让写回是**无损**的。
    """
    payload: dict[str, Any] = {
        "book": {
            "id": course.id,
            "revision": course.revision,
            "title": course.title,
            "description": course.description,
            "status": course.status,
            "proposal": course.proposal,
            "knowledge_bases": list(course.knowledge_bases),
            "language": course.language,
            "depth": course.depth,
            "page_count": course.page_count,
            "chapter_count": course.chapter_count,
            "created_at": course.created_at,
            "updated_at": course.updated_at,
            "metadata": dict(course.metadata),
            "kb_fingerprints": dict(course.kb_fingerprints),
            "kb_document_fingerprints": {
                key: dict(value)
                for key, value in course.kb_document_fingerprints.items()
            },
            "stale_page_ids": list(course.stale_page_ids),
            "stale_detected_at": course.stale_detected_at,
        },
        "spine": {
            "book_id": course.id,
            "version": course.spine_version,
            "updated_at": course.spine_updated_at,
            "exploration_summary": course.exploration_summary,
            "concept_graph": dict(course.concept_graph),
            "chapters": [chapter.to_dict() for chapter in course.chapters],
        },
        "pages": [page.to_dict() for page in course.pages],
        "progress": course.progress.to_dict(),
    }

    if course.is_hub:
        payload["hub"] = {
            "id": course.id,
            "title": course.title,
            "description": course.description,
            "language": course.language,
            "depth": course.depth,
            "status": course.status,
            "revision": course.revision,
            "created_at": course.created_at,
            "updated_at": course.updated_at,
            "metadata": dict(course.metadata),
            "exploration_summary": course.exploration_summary,
            "topics": [
                {
                    "id": topic.id,
                    "title": topic.title,
                    "summary": topic.summary,
                    "order": topic.order,
                    # 主题下面内联它的节点——这才是「原始」的嵌套形态，
                    # 读回来时不需要再组装。
                    "nodes": [
                        node.to_dict() for node in course.nodes if node.topic_id == topic.id
                    ],
                }
                for topic in course.topics
            ],
        }

    return payload


class CourseService:
    """本地课程 JSON 的读写。"""

    def __init__(self, root: Path | None = None) -> None:
        self._root = root or COURSES_ROOT

    @property
    def root(self) -> Path:
        return self._root

    # ── 读取 ────────────────────────────────────────────────────────────

    def template_schema(self) -> dict[str, Any]:
        """返回 Course 的结构模板（JSON Schema）。

        这份文件描述「一门课长什么样」，供前端渲染结构解剖图用，
        **不含任何真实课程内容**。
        """
        path = self._root / TEMPLATE_FILENAME
        if not path.exists():
            raise CourseError(f"Course template schema not found: {TEMPLATE_FILENAME}")
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CourseError(f"Course template schema is unreadable: {exc}") from exc

    def list_courses(self, *, workspace_id: str = "") -> list[Course]:
        """列出全部课程：先全局，后工作区私有（同名者工作区优先）。"""
        courses: dict[str, Course] = {}
        for course in self._scan(self._root, source="user"):
            courses[course.id] = course
        if workspace_id:
            workspace_root = WORKSPACES_ROOT / workspace_id / "courses"
            for course in self._scan(workspace_root, source="workspace"):
                courses[course.id] = course
        return sorted(courses.values(), key=lambda c: (c.updated_at, c.id), reverse=True)

    def get_course(self, course_id: str, *, workspace_id: str = "") -> Course:
        for course in self.list_courses(workspace_id=workspace_id):
            if course.id == course_id:
                return course
        raise CourseError(f"Course not found: {course_id}")

    def _root_for(self, workspace_id: str) -> Path:
        return (
            (WORKSPACES_ROOT / workspace_id / "courses")
            if workspace_id
            else self._root
        )

    def _path_of(self, course_id: str, root: Path) -> Path | None:
        """找到存放某个课程 id 的文件。

        文件名按原版约定就是 ``book.id``（原版是 ``book_{id}/`` 目录），
        但也容许历史遗留的其它文件名——这时返回实际存在的那一个。
        查找范围覆盖整个语料库子树，因此课程放在子目录里也能被找到。
        """
        canonical = root / f"{course_id}.json"
        if canonical.exists():
            return canonical
        for path in self._iter_corpus_files(root):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if _as_dict(_as_dict(raw).get("book")).get("id") == course_id:
                return path
        return None

    def _scan(self, root: Path, *, source: str) -> list[Course]:
        """递归扫描语料库目录，挂载其中所有可解析的课程文件。

        **动态扩容**：扫描是纯目录遍历，没有任何硬编码的文件名清单。
        往 ``backend/data/courses/`` 里丢一个新的 JSON（或一个新的子目录），
        它就会自动出现在课程列表里——不需要改动任何后端调度代码。

        扫描规则：

        * 递归遍历子目录，以 ``_`` / ``.`` 开头的目录整棵跳过（放草稿用）；
        * 文件名匹配 :data:`_SKIP_FILE_PATTERNS` 的跳过（结构模板不是内容）；
        * 内容解析失败的文件跳过而不是让整个列表挂掉——一份坏教材不该
          让平台上所有课都打不开。
        """
        if not root.exists():
            return []
        out: list[Course] = []
        for path in self._iter_corpus_files(root):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            try:
                course = course_from_dict(raw, source=source)
            except CourseError:
                continue
            # 手写的课程文件通常不带时间戳，用文件 mtime 兜底，
            # 这样「最近改过的排在最前」对它们同样成立。
            if not course.updated_at:
                course.updated_at = path.stat().st_mtime
            out.append(course)
        return out

    @staticmethod
    def _iter_corpus_files(root: Path):
        """产出语料库目录下所有候选 JSON 文件（递归，按路径排序）。"""
        for path in sorted(root.rglob("*.json")):
            if not path.is_file():
                continue
            # 跳过约定不参与挂载的目录（草稿、隐藏目录）。
            relative_parts = path.relative_to(root).parts[:-1]
            if any(part.startswith(SKIP_DIR_PREFIXES) for part in relative_parts):
                continue
            # 跳过结构模板 / schema / 说明文件。
            if any(path.match(pattern) for pattern in _SKIP_FILE_PATTERNS):
                continue
            yield path

    # ── 写入 ────────────────────────────────────────────────────────────

    def create_course(self, payload: dict[str, Any], *, workspace_id: str = "") -> Course:
        course = course_from_dict(payload, source="workspace" if workspace_id else "user")
        root = self._root_for(workspace_id)
        target = root / f"{course.id}.json"
        if target.exists():
            raise CourseError(f"Course already exists: {course.id}")
        course.created_at = course.updated_at = _now()
        self._write(course, root)
        return course

    def update_course(
        self, course_id: str, payload: dict[str, Any], *, workspace_id: str = ""
    ) -> Course:
        existing = self.get_course(course_id, workspace_id=workspace_id)
        merged = course_to_dict(existing)
        incoming = _as_dict(payload)

        # 允许按顶层段合并：book / spine / pages / progress 各自整体替换。
        # 只替换真正传了的段——没传的段沿用旧值，否则一次局部编辑会抹掉
        # 整个 spine 或所有页面。
        #
        # ``hub`` 段同样参与合并：资源枢纽型课程的结构（Topic → Node →
        # Resource）也要能被整体替换，否则编辑一次就会把它压扁成
        # 纯文本课程。
        for section in ("book", "spine", "pages", "progress", "hub"):
            if section not in incoming:
                continue
            if section == "pages":
                merged["pages"] = list(incoming["pages"] or [])
            else:
                merged[section] = dict(incoming[section])

        if isinstance(merged.get("book"), dict):
            merged["book"]["id"] = existing.id
            merged["book"]["created_at"] = existing.created_at
            merged["book"]["updated_at"] = existing.updated_at

        course = course_from_dict(merged, source=existing.source)
        course.updated_at = _now()
        root = self._root_for(workspace_id)
        # 沿用旧文件的位置；若旧文件名与 id 不一致，顺手改名归位。
        previous = self._path_of(course.id, root)
        canonical = root / f"{course.id}.json"
        if previous is not None and previous != canonical and not canonical.exists():
            previous.rename(canonical)
        self._write(course, root)
        return course

    def delete_course(self, course_id: str, *, workspace_id: str = "") -> None:
        self.get_course(course_id, workspace_id=workspace_id)
        root = self._root_for(workspace_id)
        target = self._path_of(course_id, root)
        if target is not None:
            target.unlink()

    @staticmethod
    def _write(course: Course, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        payload = course_to_dict(course)
        # 这些字段是从内容推导出来的，不落盘。
        for derived in ("lesson_count", "total_minutes", "block_count"):
            payload.pop(derived, None)
        # 入库前的强制清洗：繁体转简体、零宽字符清除、空白压缩。
        #
        # 放在**写盘这一刻**而不是各个导入脚本里，是因为写盘是所有
        # 语料进入平台的**唯一出口**——脚本导入、API 上传、素材导入
        # 最终都走这里。在出口统一把关，才不会出现「某个脚本忘了转」
        # 的漏网之鱼。
        payload = normalize_payload(payload)
        (root / f"{course.id}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )


def _now() -> float:
    import time

    return time.time()


_service: CourseService | None = None


def get_course_service() -> CourseService:
    global _service
    if _service is None:
        _service = CourseService(root=COURSES_ROOT)
    return _service


__all__ = [
    "BLOCK_STATUSES",
    "BLOCK_TYPES",
    "BOOK_DEPTHS",
    "BOOK_STATUSES",
    "CONTENT_TYPES",
    "COURSES_ROOT",
    "Course",
    "CourseBlock",
    "CourseChapter",
    "CourseError",
    "CoursePage",
    "CourseProgress",
    "CourseService",
    "CourseSourceAnchor",
    "LINK_RELATIONS",
    "course_from_dict",
    "course_from_loose_dict",
    "course_to_dict",
    "get_course_service",
]
