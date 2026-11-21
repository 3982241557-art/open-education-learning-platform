#!/usr/bin/env python3
"""GitHub 开源教育资源筛选器
==========================

从 GitHub 上批量筛选 **online education**（线上教育系统 / 课程平台 /
开源公开课体系）与 **diploma education**（学历 / 文凭路径、计算机 /
商科 / 通识学位的开源大纲与课程项目）的优质成品项目。

**关键约束**
------------

这个脚本**只产出候选清单**，绝不把任何仓库写进正式的公开课主库
（``global_resource_hub.json``）。

理由很简单：自动抓来的东西质量参差，而公开课主库是用户直接消费的
学习内容。一个没审过的仓库混进去，用户点开发现是空的、或者是个
三年前的 demo——那比没有更糟。

所以流程被拆成两段：

.. code-block:: text

    本脚本  ->  data/github_candidates_review.json  ->  前端审核台
                                                        |
                                                 用户逐条勾选
                                                        v
                                              一键拉取已审核项目

筛选策略
--------

六组检索式，每组一个主题：

======================  ==========================================
``online-education``    线上教育系统 / 课程平台 / LMS
``open-university``     开源大学 / 学位课程体系
``cs-curriculum``       计算机科学课程大纲
``interactive-learning`` 交互式学习 / 自适应练习
``diploma-path``        学历 / 文凭 / 认证路径
``chinese-education``   中文 / 华语区的开源教育项目
======================  ==========================================

每组再叠加若干**质量信号**：

* ``stars`` —— 社区认可度；
* ``pushed_at`` —— 近期是否还在维护（超过 ``max_stale_days`` 天视为
  死项目）；
* 结构信号 —— 是否有描述、license、topics、homepage；
* 关键词信号 —— 仓库名 / 描述 / topics 里是否命中教育类关键词。

GitHub Token
------------

匿名调 Search API 只有 **10 次/分钟**。设 ``GITHUB_TOKEN`` 环境变量
可以提到 **30 次/分钟**，而且配额更稳。

.. code-block:: bash

    export GITHUB_TOKEN=ghp_xxx
    python3 tools/github_edu_scout.py --limit 50

用法
----

.. code-block:: bash

    # 默认：每组 12 个候选，总量上限 50
    python3 tools/github_edu_scout.py

    # 只跑两组，产出 30 个
    python3 tools/github_edu_scout.py --strategies online-education diploma-path --limit 30

    # 放宽「近期维护」的门槛（找经典项目时用）
    python3 tools/github_edu_scout.py --max-stale-days 730
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

#: 输出文件——**候选清单**，不是主库。
BACKEND_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = BACKEND_ROOT / "data" / "github_candidates_review.json"

#: GitHub 搜索端点。
SEARCH_URL = "https://api.github.com/search/repositories"

#: 检索结果的磁盘缓存目录——让筛选器**可续跑**。
CACHE_DIR = BACKEND_ROOT / "data" / ".github_scout_cache"

#: 缓存有效期（秒）——6 小时。
CACHE_TTL = 6 * 3600

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

try:  # pragma: no cover — certifi 只是让 SSL 链在 macOS 上更稳
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL_CTX = ssl.create_default_context()


# ──────────────────────────────────────────────────────────────────────
# 检索策略
# ──────────────────────────────────────────────────────────────────────


@dataclass
class Strategy:
    """一组检索策略。

    ``kind`` 决定候选被归到「线上教育成品」还是「学历/文凭体系」。

    ``queries`` 是检索式。GitHub 的 search 语法支持 ``in:name``、
    ``in:description``、``in:readme``、``topic:`` 等限定。
    """

    id: str
    title: str
    kind: str
    queries: list[str]
    blurb: str


STRATEGIES: list[Strategy] = [
    Strategy(
        id="online-education",
        title="线上教育成品系统",
        kind="线上教育成品",
        blurb=(
            "可以直接跑起来的课程平台 / LMS / 学习管理系统。"
            "接入方式建议：作为「实验环境」引入——让用户在平台里直接"
            "体验一个真实的在线教室。"
        ),
        queries=[
            "online education platform in:readme stars:>200",
            "learning management system LMS in:readme stars:>200",
            "course platform mooc in:readme stars:>200",
            "open course platform in:readme stars:>150",
            "e-learning platform in:readme stars:>150",
            "self-hosted learning platform in:readme stars:>100",
        ],
    ),
    Strategy(
        id="open-university",
        title="开源大学 / 学位课程体系",
        kind="学历/文凭体系",
        blurb=(
            "完整的学位课程大纲与学习路径（OSSU 那一类）。"
            "接入方式建议：拆成「学习阶梯」——每个节点对应一门课，"
            "正好喂给技能树。"
        ),
        queries=[
            "open source university curriculum in:readme stars:>300",
            "ossu computer science curriculum in:readme stars:>200",
            "degree curriculum computer science in:readme stars:>200",
            "self-directed learning curriculum degree in:readme stars:>100",
            "online degree curriculum in:readme stars:>100",
        ],
    ),
    Strategy(
        id="cs-curriculum",
        title="计算机 / 商科 / 通识课程大纲",
        kind="学历/文凭体系",
        blurb=(
            "分学科的课程大纲仓库——往往含高质量的知识点清单与"
            "学习顺序。接入方式建议：抽取大纲条目，映射成技能节点。"
        ),
        queries=[
            "computer science curriculum roadmap in:readme stars:>1000",
            "computer science course list curriculum in:readme stars:>500",
            "business school curriculum in:readme stars:>100",
            "liberal arts curriculum self-study in:readme stars:>50",
            "data science curriculum roadmap in:readme stars:>500",
        ],
    ),
    Strategy(
        id="interactive-learning",
        title="交互式学习 / 自适应练习",
        kind="线上教育成品",
        blurb=(
            "带即时反馈、练习与闯关机制的学习工具。"
            "接入方式建议：借它的**题目格式**与交互模型，喂给"
            "「随堂检测」模块。"
        ),
        queries=[
            "interactive learning exercises in:readme stars:>500",
            "adaptive learning spaced repetition in:readme stars:>300",
            "flashcard quiz app education in:readme stars:>500",
            "programming exercise judge in:readme stars:>1000",
        ],
    ),
    Strategy(
        id="diploma-path",
        title="学历 / 文凭 / 认证路径",
        kind="学历/文凭体系",
        blurb=(
            "带认证、证书与文凭路径的项目。"
            "接入方式建议：对标本平台的**结业证书**系统——"
            "它们的学分映射逻辑可以直接借鉴。"
        ),
        queries=[
            "diploma program certificate curriculum in:readme stars:>100",
            "certification path study plan in:readme stars:>100",
            "professional certificate curriculum open in:readme stars:>50",
            "vocational training curriculum open source in:readme stars:>50",
        ],
    ),
    Strategy(
        id="chinese-education",
        title="中文 / 华语区开源教育项目",
        kind="线上教育成品",
        blurb=(
            "中文语境的教育项目——对**全球华人**用户最贴身的一批。"
            "接入方式建议：优先引入，它们的内容组织方式最贴近"
            "中文学习者的习惯。"
        ),
        queries=[
            "在线课程 教育 开源 in:readme stars:>50",
            "网课 慕课 开源 in:readme stars:>50",
            "学习 系统 课程 in:readme stars:>50",
            "chinese online education platform in:readme stars:>50",
        ],
    ),
]


# ──────────────────────────────────────────────────────────────────────
# 质量信号
# ──────────────────────────────────────────────────────────────────────

#: 教育类关键词——命中说明这个仓库确实跟教育有关。
EDUCATION_KEYWORDS = (
    "course",
    "curriculum",
    "education",
    "learning",
    "tutorial",
    "lecture",
    "syllabus",
    "textbook",
    "university",
    "school",
    "classroom",
    "student",
    "teacher",
    "mooc",
    "diploma",
    "degree",
    "certification",
    "lesson",
    "exercise",
    "quiz",
    "flashcard",
    "assessment",
    "e-learning",
    "courseware",
    "教学",
    "课程",
    "学习",
    "教育",
    "慕课",
    "网课",
)

#: 命中这些词的仓库**大概率不是**我们要的（清单站、模板站、面试题库）。
NEGATIVE_KEYWORDS = (
    "free-for-dev",
    "interview",
    "cheat-sheet",
    "cheatsheet",
    "landing-page",
    "marketing",
    "boilerplate",
    "awesome-list",
    "roadmaps",
)


@dataclass
class Candidate:
    """一个候选项目。"""

    id: str
    full_name: str
    html_url: str
    description: str
    owner: str
    stars: int
    forks: int
    language: str
    topics: list[str] = field(default_factory=list)
    license: str = ""
    pushed_at: str = ""
    created_at: str = ""
    homepage: str = ""
    archived: bool = False
    open_issues: int = 0
    #: 命中哪几组策略。
    strategies: list[str] = field(default_factory=list)
    #: 分类归属。
    kind: str = ""
    #: 中文摘要——给审核者看的。
    summary: str = ""
    #: 推荐接入方式。
    integration: str = ""
    #: 质量分（0–100）。
    score: float = 0.0
    #: 打分明细——审核者能看懂它为什么拿了这个分。
    score_reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ──────────────────────────────────────────────────────────────────────
# GitHub 通信
# ──────────────────────────────────────────────────────────────────────


def _token() -> str:
    """取 GitHub Token（**已验证有效**的）。

    为什么要验证
    ------------

    机器上可能存在**失效**的 token——比如 ``gh`` CLI 早就登出了，但钥匙串
    里那条记录还在。拿着失效 token 去调 API，每次都返回 401
    ``Bad credentials``，而重试逻辑会把 401 当成「网络问题」反复重试，
    最后整个筛选器卡死。

    所以这里做一次 ``/user`` 校验：401 就当没有 token，退回匿名调用
    （10 次/分，够用，只是慢一点）。
    """
    candidate = _raw_token()
    if not candidate:
        return ""
    if _token_is_valid(candidate):
        return candidate
    return ""


def _token_is_valid(token: str) -> bool:
    """验证 token 是否还有效。"""
    try:
        request = urllib.request.Request(
            "https://api.github.com/user",
            headers={
                "User-Agent": UA,
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
            },
        )
        with _OPENER.open(request, timeout=15) as response:
            return response.status == 200
    except Exception:  # noqa: BLE001 — 校验失败就当没有 token
        return False


def _raw_token() -> str:
    """取 GitHub Token（未验证）。

    优先级：

    1. ``GITHUB_TOKEN`` 环境变量；
    2. ``gh`` CLI 的登录凭证（``~/.config/gh/hosts.yml``）；
    3. macOS 钥匙串里的 ``gh`` CLI 凭证。

    第 2、3 条很重要：很多机器上 ``gh`` 已经登录过，但没把 token 导出到
    环境变量里。这时候匿名调 Search API 只有 10 次/分，跑完六组策略
    要等好几分钟——中途还可能被限流打断。
    """
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        return token

    hosts = Path.home() / ".config" / "gh" / "hosts.yml"
    if hosts.exists():
        try:
            for line in hosts.read_text(encoding="utf-8", errors="ignore").splitlines():
                stripped = line.strip()
                if stripped.startswith("oauth_token:"):
                    value = stripped.split(":", 1)[1].strip().strip('"').strip("'")
                    if value:
                        return value
        except OSError:
            pass

    # 3. macOS 钥匙串——``gh`` CLI 新版把 token 存在钥匙串里，
    #    ``hosts.yml`` 里反而没有 ``oauth_token:`` 那一行。
    return _keychain_token()


def _keychain_token() -> str:
    """从 macOS 钥匙串读 ``gh`` CLI 的 token。

    非 macOS 直接返回空串。
    """
    if sys.platform != "darwin":
        return ""
    hosts = Path.home() / ".config" / "gh" / "hosts.yml"
    if not hosts.exists():
        return ""
    account = ""
    try:
        for line in hosts.read_text(encoding="utf-8", errors="ignore").splitlines():
            stripped = line.strip()
            if stripped.startswith("user:"):
                account = stripped.split(":", 1)[1].strip()
                break
    except OSError:
        return ""
    if not account:
        return ""

    try:
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-s",
                "gh:github.com",
                "-a",
                account,
                "-w",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _headers() -> dict[str, str]:
    headers = {
        "User-Agent": UA,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = _token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


#: 带正确证书链的 opener——macOS 的系统 Python 常常找不到中间证书，
#: 直接 ``urlopen`` 会报 ``CERTIFICATE_VERIFY_FAILED``。
_OPENER = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=_SSL_CTX)
)


def _get_json(url: str, retries: int = 3) -> dict[str, Any] | None:
    """带重试与限流等待的 JSON GET。"""
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers=_headers())
            with _OPENER.open(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8", "ignore"))
        except urllib.error.HTTPError as error:
            # 403 / 429 = 触发限流。带 token 也不该频繁出现，
            # 出现就退避一下。
            if error.code in (403, 429):
                # 401 是「token 无效」——不是限流，重试也没用。
                if error.code == 401:
                    return None
                # 匿名调 Search API 的配额是 10 次/分，被拒后要等
                # 配额窗口重置。带 token 是 30 次/分，等 20s 就够。
                wait = 20 if _token() else 62
                print(
                    f"  ! 触发限流（{error.code}），等待 {wait}s 后重试…",
                    flush=True,
                )
                time.sleep(wait)
                continue
            if error.code == 422:
                # 检索式被拒（通常是语法问题）——换下一个，不重试。
                return None
            if error.code == 401:
                # token 无效——匿名重试一次。
                return None
            return None
        except Exception:  # noqa: BLE001 — 网络抖动重试即可
            if attempt < retries - 1:
                time.sleep(1.5 + attempt)
                continue
            return None
    return None


def search(query: str, per_page: int = 20) -> list[dict[str, Any]]:
    """跑一次 GitHub 仓库检索。

    带**磁盘缓存**。GitHub 的匿名 Search 配额只有 10 次/分，跑完六组
    策略要好几分钟——中途进程被杀掉就得从头再来。

    缓存让这件事变成**可续跑**的：已经查过的检索式直接读本地，
    只剩没查过的才走网络。缓存有效期 6 小时——超过这个时间仓库的
    star 数会明显变化，重新拉一次更准。
    """
    cache_key = hashlib.sha256(f"{query}|{per_page}".encode()).hexdigest()[:16]
    cache_file = CACHE_DIR / f"{cache_key}.json"

    # ── 读缓存 ──
    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            age = time.time() - float(cached.get("fetched_at") or 0)
            if age < CACHE_TTL:
                items = cached.get("items")
                if isinstance(items, list):
                    return [item for item in items if isinstance(item, dict)]
        except (OSError, ValueError, TypeError):
            pass

    url = (
        f"{SEARCH_URL}?q={urllib.parse.quote(query)}"
        f"&sort=stars&order=desc&per_page={per_page}"
    )
    payload = _get_json(url)
    if not payload:
        return []
    items = [item for item in (payload.get("items") or []) if isinstance(item, dict)]

    # ── 写缓存 ──
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(
            json.dumps(
                {"fetched_at": time.time(), "query": query, "items": items},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except OSError:
        pass

    return items


# ──────────────────────────────────────────────────────────────────────
# 打分
# ──────────────────────────────────────────────────────────────────────


def _days_since(timestamp: str) -> float:
    if not timestamp:
        return 9999.0
    try:
        moment = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return 9999.0
    return (datetime.now(timezone.utc) - moment).total_seconds() / 86400


def score_candidate(
    repo: dict[str, Any],
    *,
    max_stale_days: int,
) -> tuple[float, list[str]]:
    """给一个仓库打分（0–100），并返回打分理由。

    打分维度
    --------
    * **社区认可**（40 分）——``log10(stars)`` 缩放，1000 星约 15 分，
      10 万星约 25 分。给的是**对数**而不是线性：星数差距是数量级的，
      线性会让 10 万星的项目碾压一切。
    * **维护活跃**（25 分）——最近推送时间。30 天内高分，2 年以上归零。
    * **结构完整**（20 分）——有描述、有 license、有 topics、有 homepage。
    * **教育相关度**（15 分）——关键词密度。
    """
    reasons: list[str] = []
    score = 0.0

    stars = int(repo.get("stargazers_count") or 0)
    star_points = min(40.0, max(0.0, math.log10(stars + 1) - 1.5) * 12.0)
    score += star_points
    reasons.append(f"{stars} 星（+{star_points:.0f}）")

    days = _days_since(str(repo.get("pushed_at") or ""))
    if days <= 30:
        activity = 25.0
    elif days <= 180:
        activity = 18.0
    elif days <= 365:
        activity = 12.0
    elif days <= max_stale_days:
        activity = 6.0
    else:
        activity = 0.0
    score += activity
    reasons.append(f"最近推送 {int(days)} 天前（+{activity:.0f}）")

    structure = 0.0
    if repo.get("description"):
        structure += 6.0
    if repo.get("license"):
        structure += 6.0
    if repo.get("topics"):
        structure += 4.0
    if repo.get("homepage"):
        structure += 4.0
    score += structure
    if structure > 0:
        reasons.append(f"元信息完整（+{structure:.0f}）")

    haystack = " ".join(
        [
            str(repo.get("name") or ""),
            str(repo.get("description") or ""),
            " ".join(repo.get("topics") or []),
        ]
    ).lower()
    hits = sum(1 for keyword in EDUCATION_KEYWORDS if keyword in haystack)
    relevance = min(15.0, hits * 3.0)
    score += relevance
    if hits:
        reasons.append(f"教育关键词命中 {hits} 个（+{relevance:.0f}）")

    return round(min(100.0, score), 1), reasons


def classify(strategy_ids: set[str]) -> tuple[str, str]:
    """判定分类归属与推荐接入方式。

    归属取决于命中了哪几组策略——学历类策略命中就归「学历/文凭体系」，
    否则归「线上教育成品」。
    """
    if strategy_ids & {"open-university", "cs-curriculum", "diploma-path"}:
        kind = "学历/文凭体系"
        integration = (
            "拆解为**学习阶梯**：把仓库里的课程大纲逐条映射成技能节点，"
            "接入「随堂检测」与掌握度进度条。"
        )
    else:
        kind = "线上教育成品"
        integration = (
            "作为**实验环境**引入：抽取它的课程组织方式与交互模型，"
            "为公开课大厅新增一个可交互的专区。"
        )

    if "chinese-education" in strategy_ids:
        integration += "　中文语境项目，对全球华人用户最贴身，建议优先。"
    return kind, integration


def summarize(repo: dict[str, Any], kind: str) -> str:
    """生成中文摘要。

    不做翻译（那需要模型），而是**结构化地描述它是什么**——
    语言、规模、topics、分类归属。这比一句机器翻译的描述更有用：
    审核者靠这些字段就能判断值不值得点进去看。
    """
    language = str(repo.get("language") or "多语言")
    stars = int(repo.get("stargazers_count") or 0)
    topics = [t for t in (repo.get("topics") or []) if t][:6]
    parts = [
        f"{language} 实现，{stars} 星社区关注",
        f"归类为「{kind}」",
    ]
    if topics:
        parts.append("主题：" + "、".join(topics))
    description = str(repo.get("description") or "").strip()
    if description:
        parts.append(description)
    return "；".join(parts) + "。"


# ──────────────────────────────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────────────────────────────


def collect(
    strategies: list[Strategy],
    *,
    limit: int,
    max_stale_days: int,
    per_strategy: int,
    log: Any = None,
) -> list[Candidate]:
    """跑完所有策略，汇总候选。

    同一个仓库可能命中多组策略——它会被合并成一条候选，并记下
    **全部**命中的策略。这样「既是课程平台、又有学位大纲」的项目
    不会被拆成两条误导审核者。
    """
    emit = log or (lambda message: print(message, flush=True))

    merged: dict[str, Candidate] = {}

    for strategy in strategies:
        emit(f"[{strategy.id}] {strategy.title} — {len(strategy.queries)} 组检索式")
        for query in strategy.queries:
            repos = search(query, per_page=per_strategy)
            emit(f"  · {query[:56]:<56} -> {len(repos)} 条")
            for repo in repos:
                if repo.get("archived"):
                    continue
                full_name = str(repo.get("full_name") or "")
                if not full_name:
                    continue
                lowered = full_name.lower()
                if any(keyword in lowered for keyword in NEGATIVE_KEYWORDS):
                    continue

                existing = merged.get(full_name)
                if existing:
                    if strategy.id not in existing.strategies:
                        existing.strategies.append(strategy.id)
                    continue

                score, reasons = score_candidate(repo, max_stale_days=max_stale_days)
                kind, integration = classify({strategy.id})
                merged[full_name] = Candidate(
                    id=str(repo.get("id") or 0),
                    full_name=full_name,
                    html_url=str(repo.get("html_url") or ""),
                    description=str(repo.get("description") or ""),
                    owner=str(repo.get("owner", {}).get("login") or ""),
                    stars=int(repo.get("stargazers_count") or 0),
                    forks=int(repo.get("forks_count") or 0),
                    language=str(repo.get("language") or ""),
                    topics=[t for t in (repo.get("topics") or []) if t],
                    license=str((repo.get("license") or {}).get("spdx_id") or ""),
                    pushed_at=str(repo.get("pushed_at") or ""),
                    created_at=str(repo.get("created_at") or ""),
                    homepage=str(repo.get("homepage") or ""),
                    archived=bool(repo.get("archived")),
                    open_issues=int(repo.get("open_issues_count") or 0),
                    strategies=[strategy.id],
                    kind=kind,
                    summary=summarize(repo, kind),
                    integration=integration,
                    score=score,
                    score_reasons=reasons,
                )
            time.sleep(0.4)

    candidates = sorted(merged.values(), key=lambda item: item.score, reverse=True)
    return candidates[:limit]


def write_review(
    candidates: list[Candidate],
    *,
    strategies: list[Strategy],
    output_path: Path | None = None,
) -> Path:
    """写出**待审清单**——不是主库。

    写到 ``data/github_candidates_review.json``，结构与主库**完全不同**：
    它有 ``approval`` 字段（``pending`` / ``approved`` / ``ignored``），
    主库没有。主库里的东西都是「已经决定要用的」；这里的东西都还是
    「候选」。
    """
    target = output_path or OUTPUT_PATH
    target.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "$schema": "./github_candidates_review.schema.json",
        "version": 1,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "description": (
            "GitHub 开源教育项目候选清单——**待审核**，尚未接入公开课主库。"
            "只有被人工勾选批准的项目才会进入正式课程大盘。"
        ),
        "notice": (
            "本文件是审核清单，不是课程数据。在人工勾选批准之前，"
            "任何条目都不会被写入 global_resource_hub.json。"
        ),
        "strategies": [
            {
                "id": strategy.id,
                "title": strategy.title,
                "kind": strategy.kind,
                "blurb": strategy.blurb,
                "queries": strategy.queries,
            }
            for strategy in strategies
        ],
        "summary": {
            "total": len(candidates),
            "by_kind": {
                kind: sum(1 for item in candidates if item.kind == kind)
                for kind in sorted({item.kind for item in candidates})
            },
            "by_strategy": {
                strategy.id: sum(
                    1 for item in candidates if strategy.id in item.strategies
                )
                for strategy in strategies
            },
            "approved": 0,
            "pending": len(candidates),
            "ignored": 0,
        },
        "candidates": [
            {
                **item.to_dict(),
                # 审核状态——人工勾选后由前端改写。
                "approval": "pending",
                "approved_at": None,
                "integration_result": None,
            }
            for item in candidates
        ],
    }

    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return target


def main() -> int:
    parser = argparse.ArgumentParser(
        description="筛选 GitHub 开源教育项目候选（不写入主库）"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="候选总数上限（默认 50）",
    )
    parser.add_argument(
        "--strategies",
        nargs="*",
        default=None,
        help=f"只跑指定策略。可选：{[s.id for s in STRATEGIES]}",
    )
    parser.add_argument(
        "--max-stale-days",
        type=int,
        default=540,
        help="超过多少天没推送就算「不活跃」（默认 540，约 18 个月）",
    )
    parser.add_argument(
        "--per-strategy",
        type=int,
        default=12,
        help="每条检索式取回多少个仓库（默认 12）",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=f"输出路径（默认 {OUTPUT_PATH}）",
    )
    args = parser.parse_args()

    strategies = STRATEGIES
    if args.strategies:
        wanted = set(args.strategies)
        strategies = [item for item in STRATEGIES if item.id in wanted]
        if not strategies:
            print(f"没有匹配的策略。可选：{[s.id for s in STRATEGIES]}")
            return 2

    print(
        "GitHub 开源教育资源筛选器\n"
        f"  策略 {len(strategies)} 组 · 上限 {args.limit} 个候选\n"
        f"  Token：{'已配置' if _token() else '未配置（限速 10 次/分）'}\n"
    )

    candidates = collect(
        strategies,
        limit=args.limit,
        max_stale_days=args.max_stale_days,
        per_strategy=args.per_strategy,
    )

    path = write_review(candidates, strategies=strategies, output_path=args.output)

    print(f"\n候选清单已写入：{path}")
    print(f"共 {len(candidates)} 个候选项目。")
    print("\n按分类归属：")
    by_kind: dict[str, int] = {}
    for item in candidates:
        by_kind[item.kind] = by_kind.get(item.kind, 0) + 1
    for kind, count in sorted(by_kind.items()):
        print(f"  {kind}: {count}")

    print("\nTop 12：")
    for index, item in enumerate(candidates[:12], start=1):
        print(
            f"  {index:>2}. [{item.score:>5.1f}] {item.full_name}"
            f"  ({item.stars} 星, {item.language or '—'})"
        )
        print(f"      {item.summary[:100]}")

    print(
        "\n注意：这些都还**没有**进入公开课主库。"
        "\n请到前端的「GitHub 开源教育项目审核清单」逐条勾选批准，"
        "\n再点「一键拉取已审核项目并装配入库」。"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
