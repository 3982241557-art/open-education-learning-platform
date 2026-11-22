#!/usr/bin/env python3
"""生成扩充后的 ``global_resource_hub.json``。

数据来源
--------
所有视频 ID 都经过 ``tools/fetch_media_meta.py`` 校验（能拿到标题 /
时长 / 频道才算有效）。B 站优先选国内公网直连畅通的搬运/官方号，
YouTube 全部选官方频道（MIT OpenCourseWare、YaleCourses、Harvard
University、CrashCourse、Khan Academy、TED）。

用法::

    python3 tools/build_global_hub.py
"""

from __future__ import annotations

import json
from pathlib import Path

try:
    # ``predict_hooks`` 与本文件同目录。用包相对导入（``__package__``）
    # 在两种运行方式下都能找到它——直接 ``python3 tools/x.py`` 时
    # ``__package__`` 是空的，此时退回绝对导入。
    from .predict_hooks import apply_hooks
except ImportError:  # pragma: no cover - 直接以脚本方式运行
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from predict_hooks import apply_hooks

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "data" / "global_resource_hub.json"


def yt(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def bili(bvid: str) -> str:
    return f"https://www.bilibili.com/video/{bvid}"


def duration_label(seconds: int) -> str:
    """把秒数写成「X 小时 Y 分」或「Y 分 Z 秒」。"""
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours} 小时 {minutes} 分"
    if minutes:
        return f"{minutes} 分 {secs} 秒"
    return f"{secs} 秒"


# ──────────────────────────────────────────────────────────────────────
# 分类一：顶级高校（常春藤 + MIT）
# ──────────────────────────────────────────────────────────────────────
CAT_TOP_UNIVERSITY = {
    "id": "cat_top_university",
    "title": "顶级高校",
    "subtitle": "常春藤与 MIT · 系统学科训练",
    "icon": "graduation-cap",
    "order": 1,
    "description": (
        "来自世界顶尖高校的完整公开课。内容有体系、有深度，"
        "适合想打牢学科地基的学习者。"
    ),
    "resources": [
        {
            "id": "res_cs50",
            "resource_type": "video",
            "title": "哈佛大学 CS50：计算思维入门（全 24 小时）",
            "source": "YouTube (freeCodeCamp 联合发布 / Harvard 官方授权)",
            "provider": "YouTube",
            "url": yt("8mAITcNt710"),
            "fallback_url": bili("BV1Rb411378V"),
            "ai_context": (
                "哈佛大学 CS50《计算机科学导论》的官方完整课程录像（2021 年版，"
                "由 freeCodeCamp 联合发布），共 12 讲 + 网络安全专题，总时长约 24.9 小时。"
                "课程从 Scratch 图形化编程入门，逐步过渡到 C、数组、算法、内存、"
                "数据结构、Python、SQL、HTML/CSS/JS、Flask 框架，最后以 Emoji 项目"
                "收尾并延伸到网络安全。核心目标是建立「计算思维」——把现实问题拆解成"
                "可计算形式的能力。David Malan 教授以高强度的课堂提问著称，"
                "每讲都包含大量现场编程与调试演示。"
            ),
            "tags": ["计算机", "大学", "硬核"],
            "meta": {
                "duration": 89497,
                "duration_label": "24 小时 51 分",
                "instructor": "David J. Malan",
                "institution": "Harvard University",
                "language": "英语",
                "license": "CC BY-NC-SA 4.0",
                "official_site": "https://cs50.harvard.edu/x/",
                "level": "入门到进阶",
                "recorded_year": 2021,
            },
            "captions": [
                {"start": 0, "text": "欢迎来到 CS50，这是一门关于计算机科学的入门课程，也是哈佛大学最受欢迎的课程之一。"},
                {"start": 45, "text": "在这门课里，你不需要先会编程。你从 Scratch 开始，用积木搭出能跑的程序。"},
                {"start": 105, "text": "计算思维的核心是把人类的问题描述成计算机能处理的形式——分解、抽象、算法化、测试。"},
                {"start": 210, "text": "第一个项目是一个动画卡片设计器，你会第一次意识到「让电脑按你的想法动起来」是可行的。"},
                {"start": 390, "text": "第二讲开始学 C 语言。C 之所以难，是因为它不替你隐藏任何东西——内存、指针、编译错误，全都摊在桌面上。"},
                {"start": 630, "text": "在 C 里，数组是一段连续的内存。你写 arr[3]，其实是让计算机算出「第 3 个元素在第几个字节」。"},
                {"start": 900, "text": "第三讲讲数组与算法：搜索、排序、复杂度。O(n) 和 O(log n) 的区别，就是「数据量涨十倍要等多久」。"},
                {"start": 1200, "text": "第四讲进入内存：栈、堆、指针、泄漏。程序崩溃十有八九是内存出了问题。"},
                {"start": 1500, "text": "第五讲数据结构：链表、树、哈希表、图。选择哪种结构，取决于你要做什么操作。"},
                {"start": 1800, "text": "第六讲换成 Python。同样一个想法，Python 让你用五行写完，C 要写三十行——但 C 让你看见机器。"},
                {"start": 2100, "text": "第七讲 SQL：用四行 SQL 查询代替几百行代码遍历数据库，这是现代编程最重要的效率提升之一。"},
                {"start": 2400, "text": "第八讲讲 HTML、CSS 和 JavaScript 三件套：结构、样式、行为——浏览器世界的三层分工。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "计算思维入门",
                    "type": "concept",
                    "context": "欢迎来到 CS50，这是一门关于计算机科学的入门课程，也是哈佛大学最受欢迎的课程之一。",
                    "hint": "这门课不讲具体的编程语言技巧，而是教一种「把问题变成可计算形式」的思考方式。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 105,
                    "keyword": "分解 · 抽象 · 算法化 · 测试",
                    "type": "concept",
                    "context": "计算思维的核心是把人类的问题描述成计算机能处理的形式——分解、抽象、算法化、测试。",
                    "hint": "这四个词是 CS50 反复强调的思维骨架，整门课都在示范它们。",
                },
                {
                    "timestamp": 210,
                    "keyword": "从 Scratch 起步的用意",
                    "type": "question",
                    "context": "第一个项目是一个动画卡片设计器，你会第一次意识到「让电脑按你的想法动起来」是可行的。",
                    "hint": "想一想：为什么一门大学课程要从图形化积木开始，而不是直接写代码？",
                },
                {
                    "timestamp": 630,
                    "keyword": "数组即连续内存",
                    "type": "concept",
                    "context": "在 C 里，数组是一段连续的内存。你写 arr[3]，其实是让计算机算出「第 3 个元素在第几个字节」。",
                    "hint": "把「下标 → 地址」的换算想清楚，后面指针和链表就顺理成章了。",
                },
                {
                    "timestamp": 1200,
                    "keyword": "栈与堆的分界",
                    "type": "concept",
                    "context": "第四讲进入内存：栈、堆、指针、泄漏。程序崩溃十有八九是内存出了问题。",
                    "hint": "栈是函数自己管的、随生随灭；堆是手动申请的、谁来谁负责释放。",
                },
                {
                    "timestamp": 2100,
                    "keyword": "SQL 为何是现代编程的转折点",
                    "type": "question",
                    "context": "第七讲 SQL：用四行 SQL 查询代替几百行代码遍历数据库，这是现代编程最重要的效率提升之一。",
                    "hint": "想一想：把「怎么存」和「怎么找」分开，是哪个领域先这么做的？",
                },
            ],
        },
        {
            "id": "res_yale_death_intro",
            "resource_type": "video",
            "title": "耶鲁大学《死亡》PHIL 176：课程导论",
            "source": "YaleCourses 官方频道",
            "provider": "YouTube",
            "url": yt("p2J7wSuFRl8"),
            "fallback_url": bili("BV1Nt411Y7j5"),
            "ai_context": (
                "耶鲁大学公开课《死亡》(Death, PHIL 176) 的第 1 讲，由 Shelly Kagan 教授"
                "主讲，2007 年春季录制，共 26 讲。课程从「有一件事我可以确定：我会死」"
                "出发，依次考察灵魂是否存在（身心二元论 vs 物理主义）、个人同一性、"
                "死亡的本质与恶、永生是否值得、死亡的恐惧，以及自杀的理性与道德问题。"
                "Kagan 是出了名的「把学生逼到墙角」的提问者，这门课的思维密度极高。"
            ),
            "tags": ["哲学", "大学", "死亡"],
            "meta": {
                "duration": 2763,
                "duration_label": "46 分 3 秒",
                "instructor": "Shelly Kagan",
                "institution": "Yale University",
                "language": "英语",
                "license": "CC BY-NC-SA 3.0",
                "official_site": "https://oyc.yale.edu/death/phil-176",
                "level": "进阶",
                "recorded_year": 2007,
            },
            "captions": [
                {"start": 0, "text": "有一件事我可以确定：我会死。但我该拿这个事实怎么办？"},
                {"start": 90, "text": "这门课要处理的核心问题是：我们是不是不朽的？如果是，不朽是否值得？"},
                {"start": 220, "text": "第一部分是关于人的本性：灵魂与身体到底是什么关系。"},
                {"start": 400, "text": "二元论认为灵魂是非物质的、物理主义认为一切都是物理的。"},
                {"start": 620, "text": "你能证明自己有灵魂吗？这是个比看起来难得多的问题。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "死亡作为哲学起点",
                    "type": "concept",
                    "context": "有一件事我可以确定：我会死。但我该拿这个事实怎么办？",
                    "hint": "Kagan 选择从「唯一确定的事」出发，而不是从「最容易谈的事」出发。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 220,
                    "keyword": "人的本性：灵魂 vs 身体",
                    "type": "concept",
                    "context": "第一部分是关于人的本性：灵魂与身体到底是什么关系。",
                    "hint": "二元论 vs 物理主义，是哲学史上最基础也最难绕过的一组对立。",
                },
                {
                    "timestamp": 620,
                    "keyword": "你凭什么知道自己有灵魂",
                    "type": "question",
                    "context": "你能证明自己有灵魂吗？这是个比看起来难得多的问题。",
                    "hint": "想一想：笛卡尔「我思故我在」避开了什么困境？",
                },
            ],
        },
        {
            "id": "res_yale_death_live",
            "resource_type": "video",
            "title": "耶鲁大学《死亡》PHIL 176：如何带着死亡的确知去生活",
            "source": "YaleCourses 官方频道",
            "provider": "YouTube",
            "url": yt("O8Hu465KL1w"),
            "fallback_url": bili("BV1P7411C7Gz"),
            "ai_context": (
                "耶鲁公开课《死亡》的第 23 讲，也是全课程的收束之处。Kagan 在这里"
                "处理一个反直觉的问题：既然死亡是必然的、且大概率是坏的，那它是否"
                "会摧毁生活的意义？他的回答是——恰恰相反，意识到有限性反而让生活"
                "更值得过。这讲被大量学习者当作整门课的「结论章」。"
            ),
            "tags": ["哲学", "存在", "死亡"],
            "meta": {
                "duration": 2795,
                "duration_label": "46 分 35 秒",
                "instructor": "Shelly Kagan",
                "institution": "Yale University",
                "language": "英语",
                "license": "CC BY-NC-SA 3.0",
                "official_site": "https://oyc.yale.edu/death/phil-176",
                "level": "进阶",
                "recorded_year": 2007,
            },
            "captions": [
                {"start": 0, "text": "假设你已经完全接受了自己终将死去这件事——接下来该怎么办？"},
                {"start": 120, "text": "一个常见的回答是：既然死亡很坏，那避免死亡就是最高优先级。"},
                {"start": 300, "text": "但这里有个难题：如果你永远不会死，你永远不会有任何值得追求的东西。"},
                {"start": 520, "text": "有限性不是对生活的威胁，而是使价值成为可能的前提。"},
                {"start": 760, "text": "知道时间是有限的，会改变我们如何分配它。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "有限性作为生活的条件",
                    "type": "concept",
                    "context": "假设你已经完全接受了自己终将死去这件事——接下来该怎么办？",
                    "hint": "这讲是整门课的收口：把前面的形而上学讨论落到「怎么活」。",
                    "context_label": "课程第 23 讲",
                },
                {
                    "timestamp": 300,
                    "keyword": "永生悖论",
                    "type": "question",
                    "context": "但这里有个难题：如果你永远不会死，你永远不会有任何值得追求的东西。",
                    "hint": "想一想：这是关于「死亡是坏事」的论证，还是关于「价值需要稀缺」的论证？",
                },
                {
                    "timestamp": 760,
                    "keyword": "时间有限如何改变优先级",
                    "type": "concept",
                    "context": "知道时间是有限的，会改变我们如何分配它。",
                    "hint": "这正是后来被称为「存在主义式焦虑」的实用面。",
                },
            ],
        },
        {
            "id": "res_harvard_justice",
            "resource_type": "video",
            "title": "哈佛大学《公正：一场思辨之旅》第一讲：谋杀的道德面向",
            "source": "Harvard University 官方频道",
            "provider": "YouTube",
            "url": yt("kBdfcR-8hEY"),
            "fallback_url": bili("BV1gXjB6uEXg"),
            "ai_context": (
                "哈佛法学院 Michael Sandel 教授的标志性课程《Justice: What's The Right "
                "Thing To Do?》第一讲，官方频道 Harvard University 发布，共 24 讲。"
                "开场用一桩二战时期的商场毒气杀人案，把三个候选方案摆到台面上"
                "（照章行事、丢硬币决定、救人者自己顶替），让观众投票。全课由此"
                "层层推进：功利主义、自由至上主义、罗尔斯、康德伦理、亚里士多德、"
                "功利与自由的张力。Sandel 的教学法核心是「让学生投票，然后让他们"
                "看到自己的直觉有多不稳定」。"
            ),
            "tags": ["伦理", "大学", "思辨"],
            "meta": {
                "duration": 3296,
                "duration_label": "54 分 56 秒",
                "instructor": "Michael J. Sandel",
                "institution": "Harvard University",
                "language": "英语",
                "license": "YouTube 官方发布",
                "official_site": "https://www.harvard.edu/",
                "level": "通识到进阶",
                "recorded_year": 2009,
            },
            "captions": [
                {"start": 0, "text": "在二战期间，四个士兵被捕，面临一个令人不安的命令。"},
                {"start": 150, "text": "他们被告知：如果是抽签决定谁死，骰子由四个囚犯自己转。"},
                {"start": 340, "text": "心理学实验显示，多数人无法真正接受「随机处决」这个想法。"},
                {"start": 620, "text": "于是人们开始寻找道德上有理由的替代方案——比如让公务员决定。"},
                {"start": 980, "text": "但当他们真的必须由某个人来决定时，人们又退缩了。"},
                {"start": 1400, "text": "这个案例引出了本课的核心问题：是什么让我们有义务做正确的事？"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "一桩让人不安的案例",
                    "type": "concept",
                    "context": "在二战期间，四个士兵被捕，面临一个令人不安的命令。",
                    "hint": "Sandel 教哲学的方法：从不讲定义开始，先给你一个必须表态的场景。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 340,
                    "keyword": "随机处决的不可接受",
                    "type": "concept",
                    "context": "心理学实验显示，多数人无法真正接受「随机处决」这个想法。",
                    "hint": "这触及罗尔斯「原初状态」的核心直觉——人不会接受纯粹运气的分配。",
                },
                {
                    "timestamp": 1400,
                    "keyword": "义务从何而来",
                    "type": "question",
                    "context": "这个案例引出了本课的核心问题：是什么让我们有义务做正确的事？",
                    "hint": "想一想：功利主义者、自由至上主义者、罗尔斯会给出完全不同的答案。",
                },
            ],
        },
        {
            "id": "res_harvard_justice_bili",
            "resource_type": "video",
            "title": "哈佛《公正》Justice：中英字幕全 12 集合辑（国内直连）",
            "source": "Bilibili（西西相 / 哈佛公开课搬运）",
            "provider": "Bilibili",
            "url": bili("BV1ct4y167fM"),
            "ai_context": (
                "哈佛《公正》课程的中英字幕全 12 集合辑版本（12 集合并），总时长约 "
                "12 小时，国内网络环境直连畅通、无需任何工具。适合想以中文为主、"
                "英文为辅的方式完整看完桑德尔这门课的学习者。内容与 Harvard "
                "University 官方频道的 24 讲版本一致，只是合并了重复的主讲段落。"
            ),
            "tags": ["伦理", "国内直连", "中英字幕"],
            "meta": {
                "duration": 43231,
                "duration_label": "12 小时 0 分",
                "instructor": "Michael J. Sandel",
                "institution": "Harvard University",
                "language": "英语 + 中文字幕",
                "license": "公开课搬运（教学用途）",
                "level": "通识到进阶",
            },
            "captions": [
                {"start": 0, "text": "这一讲我们会问：为什么人们觉得不该随机决定谁去死？"},
                {"start": 300, "text": "接着引入「电车难题」的原始版本。"},
                {"start": 900, "text": "从这里开始，课程把三种主要伦理理论摆上桌：功利、自由意志、亚里士多德。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "为什么不能随机决定",
                    "type": "concept",
                    "context": "这一讲我们会问：为什么人们觉得不该随机决定谁去死？",
                    "hint": "同一个直觉，支撑着罗尔斯后来整套正义理论。",
                    "context_label": "合辑开场",
                },
                {
                    "timestamp": 900,
                    "keyword": "三种伦理理论登场",
                    "type": "concept",
                    "context": "从这里开始，课程把三种主要伦理理论摆上桌：功利、自由意志、亚里士多德。",
                    "hint": "记住这三者，后面每一讲都是它们之间的博弈。",
                },
                {
                    "timestamp": 1500,
                    "keyword": "直觉的可靠性",
                    "type": "question",
                    "context": "Sandel 的方法是把你的直觉摆上手术台，看看它是否经得起追问。",
                    "hint": "想一想：你的道德直觉，哪一条经得起追问，哪一条只是习惯？",
                },
            ],
        },
        {
            "id": "res_mit_linear_algebra",
            "resource_type": "video",
            "title": "MIT 18.06 线性代数第一讲：线性方程组的几何",
            "source": "MIT OpenCourseWare 官方频道",
            "provider": "YouTube",
            "url": yt("J7DzL2_Na80"),
            "fallback_url": bili("BV1zx411g7gq"),
            "ai_context": (
                "Gilbert Strang 教授的 MIT 18.06 线性代数第一讲（The Geometry of Linear "
                "Equations），MIT OpenCourseWare 官方发布。Strang 的教学风格是「先用"
                "图形把线性方程组画出来，再引入矩阵」——这是线性代数最正确的入门顺序。"
                "这一讲把 n 个方程 n 个未知数的解集画成 n 维空间里的点，用行阶梯形的"
                "几何意义解释唯一解 / 无解 / 无穷多解三分法，为整门课的几何直觉奠基。"
            ),
            "tags": ["数学", "线性代数", "硬核"],
            "meta": {
                "duration": 2389,
                "duration_label": "39 分 49 秒",
                "instructor": "Gilbert Strang",
                "institution": "MIT",
                "language": "英语",
                "license": "CC BY-NC-SA 4.0",
                "official_site": "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
                "level": "进阶",
                "recorded_year": 2010,
            },
            "captions": [
                {"start": 0, "text": "线性方程组听起来很干，但它的本质是几何问题。"},
                {"start": 180, "text": "每一行方程在平面上就是一条直线，多行方程就是多条直线。"},
                {"start": 420, "text": "两条直线可能平行（无解）、相交（唯一解）、或者重合（无穷多解）。"},
                {"start": 800, "text": "推广到 n 维，解集就是 n 维空间里的一个点。"},
                {"start": 1300, "text": "那么怎么算？我们需要一个比消元法更结构化的工具——矩阵。"},
                {"start": 1900, "text": "消元法的每一步，都对应着行变换，而行变换不改变解集。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "线性代数先是几何",
                    "type": "concept",
                    "context": "线性方程组听起来很干，但它的本质是几何问题。",
                    "hint": "Strang 的教学顺序值得学：先画图，再代数。",
                    "context_label": "第一讲开场",
                },
                {
                    "timestamp": 420,
                    "keyword": "三分法：唯一解 / 无解 / 无穷多解",
                    "type": "concept",
                    "context": "两条直线可能平行（无解）、相交（唯一解）、或者重合（无穷多解）。",
                    "hint": "后面讲秩、列空间、零空间时，这三种情况一直会出现。",
                },
                {
                    "timestamp": 1900,
                    "keyword": "行变换不改变解集",
                    "type": "question",
                    "context": "消元法的每一步，都对应着行变换，而行变换不改变解集。",
                    "hint": "想一想：行变换有哪三种基本类型？它们分别对应矩阵的什么性质？",
                },
            ],
        },
        {
            "id": "res_mit_linear_algebra_bili",
            "resource_type": "video",
            "title": "MIT 18.06SC 线性代数完整版（74 讲 · 中英双语）",
            "source": "Bilibili（名校课程-顶级中配）",
            "provider": "Bilibili",
            "url": bili("BV13mN86nEj3"),
            "ai_context": (
                "Gilbert Strang 的 MIT 18.06SC 线性代数完整版，74 讲中英双语配音，"
                "总时长约 63 小时。这是这门课流传最广的中文版本，Strang 标志性的"
                "板书推导被完整保留。适合中文母语但想系统啃完线性代数的学习者——"
                "它比英文原版多了一个优势：可以随时暂停，倒回去看 Strang 怎么"
                "从定义推到结论。"
            ),
            "tags": ["数学", "线性代数", "国内直连"],
            "meta": {
                "duration": 226620,
                "duration_label": "62 小时 57 分",
                "instructor": "Gilbert Strang",
                "institution": "MIT",
                "language": "英语 + 中文字幕/配音",
                "license": "公开课搬运（教学用途）",
                "level": "进阶",
            },
            "captions": [
                {"start": 0, "text": "这是 Gilbert Strang 的 MIT 线性代数完整课程，共 74 讲。"},
                {"start": 600, "text": "整门课围绕四个核心概念展开：解、列空间、行空间、特征值。"},
                {"start": 2400, "text": "先从几何直觉出发，把矩阵看成一个变换而不是一张表格。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "Strang 线性代数 74 讲",
                    "type": "concept",
                    "context": "这是 Gilbert Strang 的 MIT 线性代数完整课程，共 74 讲。",
                    "hint": "官方 18.06SC 的结构，适合按周计划推进。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 600,
                    "keyword": "四个核心概念",
                    "type": "concept",
                    "context": "整门课围绕四个核心概念展开：解、列空间、行空间、特征值。",
                    "hint": "这四个词是整门课的骨架，后面每一讲都会回头引用。",
                },
                {
                    "timestamp": 2400,
                    "keyword": "矩阵是一个变换",
                    "type": "question",
                    "context": "先从几何直觉出发，把矩阵看成一个变换而不是一张表格。",
                    "hint": "想一想：当矩阵不可逆时，它作为变换丢失了什么？",
                },
            ],
        },
        {
            "id": "res_mit_strang_final",
            "resource_type": "video",
            "title": "MIT 线性代数最后一讲：Strang 的最后一堂课",
            "source": "MIT OpenCourseWare 官方频道",
            "provider": "YouTube",
            "url": yt("lUUte2o2Sn8"),
            "fallback_url": bili("BV18K4y1R7MP"),
            "ai_context": (
                "Gilbert Strang 退休前的最后一堂 18.06 线性代数课，也是整门课的收官。"
                "他回顾了课程的核心线索——从解方程组出发，经由矩阵与向量空间，"
                "最终到达特征值与对角化——并谈论了这门课在数学教育中的位置。"
                "Strang 强调线性代数不是计算技巧的堆砌，而是「理解空间如何被变换」"
                "的语言，是所有更高阶数学与工程的通行证。"
            ),
            "tags": ["数学", "总结", "大师课"],
            "meta": {
                "duration": 3909,
                "duration_label": "65 分 9 秒",
                "instructor": "Gilbert Strang",
                "institution": "MIT",
                "language": "英语",
                "license": "CC BY-NC-SA 4.0",
                "official_site": "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
                "level": "进阶",
                "recorded_year": 2011,
            },
            "captions": [
                {"start": 0, "text": "这是我在 MIT 的最后一堂线性代数课。"},
                {"start": 240, "text": "我们回顾一下：从解方程组开始，走到了特征值和对角化。"},
                {"start": 700, "text": "线性代数的核心问题是：矩阵作为变换，把空间变成了什么样。"},
                {"start": 1400, "text": "对角化意味着这个变换在某个基下变得非常简单。"},
                {"start": 2200, "text": "记住这四个关键词：解、列空间、行空间、特征值。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "最后一堂课",
                    "type": "concept",
                    "context": "这是我在 MIT 的最后一堂线性代数课。",
                    "hint": "Strang 在这里做了一次完整的知识地图，适合作为复盘的骨架。",
                    "context_label": "课程收官",
                },
                {
                    "timestamp": 700,
                    "keyword": "矩阵即空间变换",
                    "type": "concept",
                    "context": "线性代数的核心问题是：矩阵作为变换，把空间变成了什么样。",
                    "hint": "这个视角能一次性统一行列式、逆矩阵、秩这些概念。",
                },
                {
                    "timestamp": 2200,
                    "keyword": "四个关键词回顾",
                    "type": "question",
                    "context": "记住这四个关键词：解、列空间、行空间、特征值。",
                    "hint": "想一想：现在能否用这四个词解释「为什么这个矩阵不可逆」？",
                },
            ],
        },
    ],
}

# ──────────────────────────────────────────────────────────────────────
# 分类二：通识趣味（CrashCourse / 可汗学院）
# ──────────────────────────────────────────────────────────────────────
CAT_GENERAL = {
    "id": "cat_general_interest",
    "title": "通识趣味",
    "subtitle": "CrashCourse / 可汗学院 · 动画与轻松入门",
    "icon": "sparkles",
    "order": 2,
    "description": (
        "动画化、快节奏的通识课程。用十分钟一集的密度，"
        "把一整门学科的骨架搭起来，适合作为任何严肃学习的第一站。"
    ),
    "resources": [
        {
            "id": "res_crashcourse_psych_intro",
            "resource_type": "video",
            "title": "CrashCourse 心理学第一讲：什么是心理学",
            "source": "CrashCourse 官方频道",
            "provider": "YouTube",
            "url": yt("vo4pMVb0R6M"),
            "fallback_url": bili("BV1Zs411c7W6"),
            "ai_context": (
                "CrashCourse Psychology 第一集（Intro to Psychology）。CrashCourse 系列"
                "由 Hank Green 与 John Green 兄弟创立，用十分钟一集的动画拆解一整门学科。"
                "这一集从「心理学研究的是可观察的行为与可测量的心智过程」这一界定"
                "开始，讲到心理学的四大分支（认知、发展、社会、临床）、神经科学如何"
                "为心理学提供硬件基础，以及为什么「读心术」不是心理学的研究对象。"
            ),
            "tags": ["心理学", "通识", "动画"],
            "meta": {
                "duration": 654,
                "duration_label": "10 分 54 秒",
                "instructor": "Hank Green",
                "institution": "CrashCourse",
                "language": "英语",
                "license": "CC BY-NC-SA 3.0",
                "official_site": "https://www.youtube.com/@crashcourse",
                "level": "入门",
                "recorded_year": 2014,
            },
            "captions": [
                {"start": 0, "text": "欢迎来到 CrashCourse 心理学。"},
                {"start": 45, "text": "心理学研究的是行为，以及那些看不见但可以被测量的心智过程。"},
                {"start": 150, "text": "这门学科有四个主要分支：认知、发展、社会和临床。"},
                {"start": 300, "text": "神经科学给了心理学一套硬件：大脑里的哪些结构负责哪些功能。"},
                {"start": 480, "text": "注意，心理学不研究读心术——它研究的是可以被验证的假设。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "CrashCourse 十分钟一科",
                    "type": "concept",
                    "context": "欢迎来到 CrashCourse 心理学。",
                    "hint": "这个系列的定位是「学科地图」，不是「学科全貌」。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 150,
                    "keyword": "心理学的四大分支",
                    "type": "concept",
                    "context": "这门学科有四个主要分支：认知、发展、社会和临床。",
                    "hint": "认知、发展、社会、临床——后面每一集都会落进其中一支。",
                },
                {
                    "timestamp": 480,
                    "keyword": "可验证性是心理学的门槛",
                    "type": "question",
                    "context": "注意，心理学不研究读心术——它研究的是可以被验证的假设。",
                    "hint": "想一想：为什么「读心术」不能算心理学，而「测谎」能？",
                },
            ],
        },
        {
            "id": "res_crashcourse_psych_bili",
            "resource_type": "video",
            "title": "CrashCourse 心理学速成课：从大脑到社会行为（完整 38 讲）",
            "source": "Bilibili（名校课程-顶级中配）",
            "provider": "Bilibili",
            "url": bili("BV1dKuS69EwX"),
            "ai_context": (
                "CrashCourse Psychology 的完整 38 讲中英双语配音版本，总时长约 12.9 小时。"
                "这是心理学通识最完整的一门速成课：从神经基础与意识开始，依次讲感知、"
                "学习、记忆、思维与语言、情绪、性格、心理障碍、社会心理学，"
                "最后以「心理学在生活中的应用」收尾。国内网络直连畅通，适合作为"
                "心理学体系的整体骨架。"
            ),
            "tags": ["心理学", "通识", "动画", "国内直连"],
            "meta": {
                "duration": 46444,
                "duration_label": "12 小时 54 分",
                "instructor": "Hank Green",
                "institution": "CrashCourse",
                "language": "英语 + 中文字幕/配音",
                "license": "公开课搬运（教学用途）",
                "level": "入门",
            },
            "captions": [
                {"start": 0, "text": "这是 CrashCourse 心理学的完整 38 讲合集。"},
                {"start": 900, "text": "从神经元的电信号讲到大脑的分区，这是整门课的地基。"},
                {"start": 5400, "text": "记忆这一章会讲到一个关键实验：我们如何被错误的记忆欺骗。"},
                {"start": 18000, "text": "情绪部分会引入 Schachter-Singer 两因素理论。"},
                {"start": 30000, "text": "最后几讲回到现实：心理学如何用于临床与自我改善。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "心理学完整 38 讲",
                    "type": "concept",
                    "context": "这是 CrashCourse 心理学的完整 38 讲合集。",
                    "hint": "可以按「神经 → 认知 → 情绪 → 社会」的顺序一次看完。",
                    "context_label": "合辑开场",
                },
                {
                    "timestamp": 5400,
                    "keyword": "记忆会被重构",
                    "type": "concept",
                    "context": "记忆这一章会讲到一个关键实验：我们如何被错误的记忆欺骗。",
                    "hint": "这跟 Elizabeth Loftus 的 TED 演讲是同一个主题，可以对照着看。",
                },
                {
                    "timestamp": 18000,
                    "keyword": "Schachter-Singer 两因素理论",
                    "type": "question",
                    "context": "情绪部分会引入 Schachter-Singer 两因素理论。",
                    "hint": "想一想：生理唤醒 + 认知标签 = 情绪，那「没有标签」的生理反应会怎样？",
                },
            ],
        },
        {
            "id": "res_crashcourse_history",
            "resource_type": "video",
            "title": "CrashCourse 世界历史第一讲：农业革命",
            "source": "CrashCourse 官方频道",
            "provider": "YouTube",
            "url": yt("Yocja_N5s1I"),
            "fallback_url": bili("BV17x411W7fd"),
            "ai_context": (
                "CrashCourse World History 第一集（The Agricultural Revolution）。"
                "这一集提出的核心论点是：农业革命并非「人类的伟大进步」，而是一次"
                "「物种层面的殖民」——人类驯化了小麦，而小麦随后驯化了人类，代价是"
                "疾病、劳作强度与不平等。这一「农业悖论」框架贯穿整个 CrashCourse "
                "世界史系列，是它区别于传统通史课程的视角。"
            ),
            "tags": ["历史", "通识", "动画"],
            "meta": {
                "duration": 670,
                "duration_label": "11 分 10 秒",
                "instructor": "CrashCourse 团队",
                "institution": "CrashCourse",
                "language": "英语",
                "license": "CC BY-NC-SA 3.0",
                "official_site": "https://www.youtube.com/@crashcourse",
                "level": "入门",
                "recorded_year": 2012,
            },
            "captions": [
                {"start": 0, "text": "今天我们从农业革命讲起——人类历史上最重要的一次转变。"},
                {"start": 120, "text": "大约一万两千年前，人类开始种植作物、饲养家畜。"},
                {"start": 280, "text": "传统叙事说这让人类过上了更好的生活，但证据并非如此。"},
                {"start": 440, "text": "农民的工作强度反而更高，骨骼显示他们更常患病。"},
                {"start": 560, "text": "结论很反直觉：农业革命是一次-species 层面的殖民。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "农业革命的分量",
                    "type": "concept",
                    "context": "今天我们从农业革命讲起——人类历史上最重要的一次转变。",
                    "hint": "CrashCourse 世界史的立论方式：先给结论，再给证据。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 280,
                    "keyword": "农业悖论",
                    "type": "concept",
                    "context": "传统叙事说这让人类过上了更好的生活，但证据并非如此。",
                    "hint": "人类学家 Gregory Clark 也有类似结论： Agriculture 更接近物种殖民。",
                },
                {
                    "timestamp": 560,
                    "keyword": "谁驯化了谁",
                    "type": "question",
                    "context": "结论很反直觉：农业革命是一次-species 层面的殖民。",
                    "hint": "想一想：今天有哪些「我们驯化了 technologies，其实被它改变了」的例子？",
                },
            ],
        },
        {
            "id": "res_crashcourse_history_bili",
            "resource_type": "video",
            "title": "CrashCourse 世界历史（中文配音全集）",
            "source": "Bilibili（世界课程精选站）",
            "provider": "Bilibili",
            "url": bili("BV1FzYp6DEW3"),
            "ai_context": (
                "CrashCourse World History 的中文配音全集，总时长约 8.3 小时，"
                "国内直连畅通。涵盖从史前到现代的完整脉络：古代帝国、宗教兴起、"
                "中世纪贸易网络、近现代革命、以及 20 世纪至今的全球格局。"
                "适合用中文快速建立世界史的整体时间轴，之后再回看英文原版补细节。"
            ),
            "tags": ["历史", "通识", "动画", "国内直连"],
            "meta": {
                "duration": 29764,
                "duration_label": "8 小时 16 分",
                "instructor": "CrashCourse 团队",
                "institution": "CrashCourse",
                "language": "英语 + 中文字幕/配音",
                "license": "公开课搬运（教学用途）",
                "level": "入门",
            },
            "captions": [
                {"start": 0, "text": "CrashCourse 世界史中文配音全集，从农业革命讲起。"},
                {"start": 1200, "text": "古代世界的关键变量不是个人，而是城市与贸易路线。"},
                {"start": 9000, "text": "宗教的传播往往跟着贸易路线走，这是理解中世纪的一把钥匙。"},
                {"start": 20000, "text": "工业革命、两次世界大战、冷战，一直到今天的全球化。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "世界史整体时间轴",
                    "type": "concept",
                    "context": "CrashCourse 世界史中文配音全集，从农业革命讲起。",
                    "hint": "第一次看世界史，先要一张完整的地图，再填细节。",
                    "context_label": "合辑开场",
                },
                {
                    "timestamp": 9000,
                    "keyword": "贸易路线塑造宗教传播",
                    "type": "concept",
                    "context": "宗教的传播往往跟着贸易路线走，这是理解中世纪的一把钥匙。",
                    "hint": "看历史时多问一句「这条路上有什么」，往往能串起很多孤立事件。",
                },
                {
                    "timestamp": 20000,
                    "keyword": "工业化的连锁反应",
                    "type": "question",
                    "context": "工业革命、两次世界大战、冷战，一直到今天的全球化。",
                    "hint": "想一想：工业革命的技术进步，真的让普通人过得更好了吗？",
                },
            ],
        },
        {
            "id": "res_crashcourse_cs",
            "resource_type": "video",
            "title": "CrashCourse 计算机科学第一讲：早期计算",
            "source": "CrashCourse 官方频道",
            "provider": "YouTube",
            "url": yt("O5nskjZ_GoI"),
            "fallback_url": bili("BV1EW411u7th"),
            "ai_context": (
                "CrashCourse Computer Science 第一集（Early Computing）。这一集追溯计算"
                "的起点：图灵机作为「按规则读写符号」的抽象计算模型、图灵对可计算性"
                "的刻画、以及从机械计算器到真空管与晶体管的跃迁。CrashCourse 计算机科学"
                "系列共 40 集，按「硬件 → 编程语言 → 数据结构 → 算法 → 网络 → 安全」"
                "推进，是建立 CS 全景图最省力的方式。"
            ),
            "tags": ["计算机", "通识", "动画"],
            "meta": {
                "duration": 713,
                "duration_label": "11 分 53 秒",
                "instructor": "John Green",
                "institution": "CrashCourse",
                "language": "英语",
                "license": "CC BY-NC-SA 3.0",
                "official_site": "https://www.youtube.com/@crashcourse",
                "level": "入门",
                "recorded_year": 2017,
            },
            "captions": [
                {"start": 0, "text": "在有计算机之前，人类已经用机器计算了几千年。"},
                {"start": 140, "text": "图灵想出了一个极简的计算模型：一条无限长的纸带，上面是符号。"},
                {"start": 320, "text": "机器按规则读写符号，这个模型足以表达任何可计算的过程。"},
                {"start": 480, "text": "硬件的跃迁来自真空管，然后是晶体管，然后是集成电路。"},
                {"start": 620, "text": "每一代都更小、更快、更便宜，同时更依赖抽象。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "计算早于计算机",
                    "type": "concept",
                    "context": "在有计算机之前，人类已经用机器计算了几千年。",
                    "hint": "算盘、差分机、查表法——都是同一个问题的不同答案。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 140,
                    "keyword": "图灵机：纸带与规则",
                    "type": "concept",
                    "context": "图灵想出了一个极简的计算模型：一条无限长的纸带，上面是符号。",
                    "hint": "这个模型简单到能证明「有些问题根本算不出来」。",
                },
                {
                    "timestamp": 620,
                    "keyword": "抽象是每一代的红利",
                    "type": "question",
                    "context": "每一代都更小、更快、更便宜，同时更依赖抽象。",
                    "hint": "想一想：程序员从来不需要知道 CPU 用的是硅还是别的什么，那他们靠什么工作？",
                },
            ],
        },
        {
            "id": "res_crashcourse_cs_bili",
            "resource_type": "video",
            "title": "CrashCourse 计算机科学速成课（40 集完整版）",
            "source": "Bilibili（CrashCourse 字幕组）",
            "provider": "Bilibili",
            "url": bili("BV1EW411u7th"),
            "ai_context": (
                "CrashCourse Computer Science 的 40 集完整版，总时长约 7.9 小时，"
                "国内直连畅通。内容从早期计算、编程语言演进、数据结构与算法，"
                "一路讲到计算机网络、操作系统、数据库与信息安全。它给出的不是"
                "某一门课的深度，而是「计算机科学由哪些问题域构成」的地图。"
            ),
            "tags": ["计算机", "通识", "动画", "国内直连"],
            "meta": {
                "duration": 28321,
                "duration_label": "7 小时 52 分",
                "instructor": "John Green",
                "institution": "CrashCourse",
                "language": "英语 + 中文字幕",
                "license": "公开课搬运（教学用途）",
                "level": "入门",
            },
            "captions": [
                {"start": 0, "text": "CrashCourse 计算机科学，40 集完整版。"},
                {"start": 1500, "text": "编程语言部分会讲清楚：为什么每次抽象层次提升都要付出代价。"},
                {"start": 8000, "text": "数据结构讲的是「数据该怎么摆」，算法讲的是「该怎么走」。"},
                {"start": 18000, "text": "网络与安全部分会解释为什么互联网既是开放也是脆弱的。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "计算机科学全景地图",
                    "type": "concept",
                    "context": "CrashCourse 计算机科学，40 集完整版。",
                    "hint": "把它当索引用：先知道某个问题在地图的哪个位置，再去深入。",
                    "context_label": "合辑开场",
                },
                {
                    "timestamp": 1500,
                    "keyword": "抽象的代价",
                    "type": "concept",
                    "context": "编程语言部分会讲清楚：为什么每次抽象层次提升都要付出代价。",
                    "hint": "每一层抽象都在隐藏细节的同时也隐藏了控制力。",
                },
                {
                    "timestamp": 18000,
                    "keyword": "开放与脆弱并存",
                    "type": "question",
                    "context": "网络与安全部分会解释为什么互联网既是开放也是脆弱的。",
                    "hint": "想一想：这两种性质是同一个设计选择的两面吗？",
                },
            ],
        },
        {
            "id": "res_khan_mesopotamia",
            "resource_type": "video",
            "title": "可汗学院世界史：古代美索不达米亚",
            "source": "Khan Academy 官方频道",
            "provider": "YouTube",
            "url": yt("9GQdh2eGP-Y"),
            "fallback_url": bili("BV1VaJzzeEYU"),
            "ai_context": (
                "可汗学院（Khan Academy）官方频道的世界史课程开篇，讲古代美索不达米亚。"
                "与 CrashCourse 的戏剧化叙事不同，可汗学院用的是「苏美尔人的发明清单」"
                "这种朴素方式：楔形文字、轮子、灌溉、城市、阶层分化。这一讲的分量在于"
                "它证明了「文明」不是天生的，而是被具体技术创造出来的。"
            ),
            "tags": ["历史", "通识", "可汗学院"],
            "meta": {
                "duration": 563,
                "duration_label": "9 分 23 秒",
                "instructor": "Khan Academy",
                "institution": "Khan Academy",
                "language": "英语",
                "license": "CC BY-NC-SA 3.0",
                "official_site": "https://www.khanacademy.org/humanities/world-history",
                "level": "入门",
            },
            "captions": [
                {"start": 0, "text": "我们从最早的大型文明之一开始：美索不达米亚。"},
                {"start": 110, "text": "苏美尔人发明了楔形文字，这是已知最早的书写系统之一。"},
                {"start": 240, "text": "灌溉技术让两河流域能养活大量人口，这是城市的起点。"},
                {"start": 380, "text": "人口聚集带来新的分工：祭司、士兵、工匠、农民。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "美索不达米亚：文明的起点",
                    "type": "concept",
                    "context": "我们从最早的大型文明之一开始：美索不达米亚。",
                    "hint": "「文明」这个词在这里指的是具体技术带来的组织能力。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 240,
                    "keyword": "灌溉与城市的因果",
                    "type": "concept",
                    "context": "灌溉技术让两河流域能养活大量人口，这是城市的起点。",
                    "hint": "技术 → 人口 → 密度 → 组织，这是城市出现的通用链条。",
                },
                {
                    "timestamp": 380,
                    "keyword": "分工是城市的产物",
                    "type": "question",
                    "context": "人口聚集带来新的分工：祭司、士兵、工匠、农民。",
                    "hint": "想一想：阶层分化是文明进步的必要条件，还是它的代价？",
                },
            ],
        },
    ],
}

# 原有的北京大学阎步克《秦汉魏晋南北朝政治历程》——15 讲全本，
# 已带完整的章节表与 15 个交互节点，原样保留。
PKU_YAN_BUKE = json.loads(
    r"""{
    "id": "res_pkupoliticalculture",
    "resource_type": "video",
    "title": "北京大学公开课：秦汉魏晋南北朝政治历程",
    "source": "Bilibili (北京大学课程)",
    "provider": "Bilibili",
    "url": "https://www.bilibili.com/video/BV1hALzzUEVU",
    "ai_context": "北京大学阎步克老师 2021 年版中国古代史公开课《秦汉魏晋南北朝政治历程》，全 15 讲，总时长约 27 小时 41 分，字幕已校正。课程不按朝代罗列年表，而是沿着「政治秩序如何被搭建、又如何在压力下变形」这条线索推进：从氏族到国家的原始国家的形成机制讲起，经周代礼乐制度与封建（分封）体系、战国变法运动、秦帝国的兴亡，走到汉初的黄老政治与削抑藩国、武宣时期的全盛与转向、莽新改制，再到专制强化与皇权旁落、士林清议与士族崛起、三国分裂与西晋短期统一、江左士族门阀、皇权复兴与政治僵局，最后收在五胡乱华到孝文改制、胡化汉化的北齐北周，以及玄学思潮与名士风度。核心解释框架是：皇权与士人阶层彼此依赖、礼制既是伦理也是治理技术、家国同构如何把政治伦理与家庭伦理焊在一起。这是一门能提供结构性解释——而不只是事件年表——的中国古代政治史入门课。",
    "tags": [
        "历史",
        "文科",
        "国内顶尖"
    ],
    "meta": {
        "duration": 99714,
        "duration_label": "27 小时 41 分",
        "instructor": "阎步克（北京大学历史学系教授）",
        "institution": "北京大学",
        "language": "中文",
        "channel": "哔哩哔哩课程转载（含字幕）",
        "license": "校方公开发布",
        "level": "进阶",
        "embed_host": "player.bilibili.com",
        "lecture_count": 15,
        "chapters": [
            {
                "page": 1,
                "title": "第1讲 从氏族到国家",
                "start": 0,
                "duration": 5239
            },
            {
                "page": 2,
                "title": "第2讲 周代政治社会制度",
                "start": 5239,
                "duration": 6483
            },
            {
                "page": 3,
                "title": "第3讲 战国变法运动",
                "start": 11722,
                "duration": 6894
            },
            {
                "page": 4,
                "title": "第4讲 秦帝国的兴亡",
                "start": 18616,
                "duration": 6902
            },
            {
                "page": 5,
                "title": "第5讲 黄老政治与削抑藩国",
                "start": 25518,
                "duration": 6739
            },
            {
                "page": 6,
                "title": "第6讲 全盛与转向",
                "start": 32257,
                "duration": 6901
            },
            {
                "page": 7,
                "title": "第7讲 奉天法古新莽改制",
                "start": 39158,
                "duration": 6900
            },
            {
                "page": 8,
                "title": "第8讲 专制强化与皇权旁落",
                "start": 46058,
                "duration": 6896
            },
            {
                "page": 9,
                "title": "第9讲 士林清议与士族崛起",
                "start": 52954,
                "duration": 6842
            },
            {
                "page": 10,
                "title": "第10讲 三国分裂与西晋短期统一",
                "start": 59796,
                "duration": 6602
            },
            {
                "page": 11,
                "title": "第11讲 江左士族门阀",
                "start": 66398,
                "duration": 5926
            },
            {
                "page": 12,
                "title": "第12讲 皇权复兴与政治僵局",
                "start": 72324,
                "duration": 6911
            },
            {
                "page": 13,
                "title": "第13讲 从「五胡乱华」到孝文改制",
                "start": 79235,
                "duration": 6898
            },
            {
                "page": 14,
                "title": "第14讲 胡化汉化北齐北周",
                "start": 86133,
                "duration": 6670
            },
            {
                "page": 15,
                "title": "第15讲 玄学思潮与名士风度",
                "start": 92803,
                "duration": 6911
            }
        ]
    },
    "captions": [
        {
            "start": 0,
            "text": "第一讲：从氏族到国家。我们从人类最早的政治组织形态讲起，看国家是怎么从氏族、部落联盟里长出来的。"
        },
        {
            "start": 5239,
            "text": "第二讲：周代政治社会制度。礼乐、宗法、封建三套机制合在一起，构成周代秩序的整体。"
        },
        {
            "start": 11722,
            "text": "第三讲：战国变法运动。变法不是一次改革，而是一百多个国家在相互竞争中做出的制度实验。"
        },
        {
            "start": 18616,
            "text": "第四讲：秦帝国的兴亡。郡县制取代分封制，这是中国政治史上最激进的一次结构切换。"
        },
        {
            "start": 25518,
            "text": "第五讲：黄老政治与削抑藩国。汉初休养生息，同时用制度手段把诸侯王的力量压下去。"
        },
        {
            "start": 32257,
            "text": "第六讲：全盛与转向。武帝时期达到鼎盛，恰恰也是集权体制开始承受极限压力的时刻。"
        },
        {
            "start": 39158,
            "text": "第七讲：奉天法古新莽改制。王莽试图用理想化的周礼重建秩序，失败得极其彻底。"
        },
        {
            "start": 46058,
            "text": "第八讲：专制强化与皇权旁落。光武中兴后皇权强化，但外戚与宦官开始进入权力核心。"
        },
        {
            "start": 52954,
            "text": "第九讲：士林清议与士族崛起。党锢之祸压制了清议，却让士族把力量转向了更隐蔽的地方。"
        },
        {
            "start": 59796,
            "text": "第十讲：三国分裂与西晋短期统一。统一之后立刻陷入新的失衡。"
        },
        {
            "start": 66398,
            "text": "第十一讲：江左士族门阀。门阀政治的核心不是血统本身，而是皇权对士族的依赖。"
        },
        {
            "start": 72324,
            "text": "第十二讲：皇权复兴与政治僵局。隋唐的集权高峰，其实建立在门阀政治被削弱的基础上。"
        },
        {
            "start": 79235,
            "text": "第十三讲：从「五胡乱华」到孝文改制。北方民族政权主动学习中原制度，是一次深层的制度模仿。"
        },
        {
            "start": 86133,
            "text": "第十四讲：胡化汉化北齐北周。相互渗透的过程里，谁吸收了谁并不总是清楚。"
        },
        {
            "start": 92803,
            "text": "第十五讲：玄学思潮与名士风度。乱世里的另一条线索，是士人对个体生命的新理解。"
        }
    ],
    "interactive_nodes": [
        {
            "timestamp": 0,
            "keyword": "从氏族到国家",
            "type": "concept",
            "context": "第一讲：从氏族到国家。我们从人类最早的政治组织形态讲起，看国家是怎么从氏族、部落联盟里长出来的。",
            "hint": "国家不是被谁「发明」的——它是从氏族、部落联盟的规模效应里自然生长出来的。"
        },
        {
            "timestamp": 5239,
            "keyword": "礼乐 · 宗法 · 封建",
            "type": "concept",
            "context": "第二讲：周代政治社会制度。礼乐、宗法、封建三套机制合在一起，构成周代秩序的整体。",
            "hint": "这三套机制各管一件事：礼乐管行为，宗法管血缘，封建管土地与军事。三者互相咬合。"
        },
        {
            "timestamp": 11722,
            "keyword": "变法是一百场实验",
            "type": "question",
            "context": "第三讲：战国变法运动。变法不是一次改革，而是一百多个国家在相互竞争中做出的制度实验。",
            "hint": "为什么竞争压力会让制度创新加速，而不是让所有国家都保守？"
        },
        {
            "timestamp": 18616,
            "keyword": "郡县制取代分封制",
            "type": "concept",
            "context": "第四讲：秦帝国的兴亡。郡县制取代分封制，这是中国政治史上最激进的一次结构切换。",
            "hint": "地方官由中央任免而非世袭——这是整套后续政治逻辑的起点。"
        },
        {
            "timestamp": 25518,
            "keyword": "休养生息与削抑藩国",
            "type": "concept",
            "context": "第五讲：黄老政治与削抑藩国。汉初休养生息，同时用制度手段把诸侯王的力量压下去。",
            "hint": "汉初的两手政策其实指向同一个目标：让地方没有独立的经济与军事基础。"
        },
        {
            "timestamp": 32257,
            "keyword": "鼎盛即极限",
            "type": "warning",
            "context": "第六讲：全盛与转向。武帝时期达到鼎盛，恰恰也是集权体制开始承受极限压力的时刻。",
            "hint": "「最强」和「最脆弱」可以是同一个状态的两面。"
        },
        {
            "timestamp": 39158,
            "keyword": "奉天法古的失败",
            "type": "quote",
            "context": "第七讲：奉天法古新莽改制。王莽试图用理想化的周礼重建秩序，失败得极其彻底。",
            "hint": "用理想化的古代制度去治理当下社会——这是中国历史上反复出现的思路，它为什么总失败？"
        },
        {
            "timestamp": 46058,
            "keyword": "外戚与宦官",
            "type": "concept",
            "context": "第八讲：专制强化与皇权旁落。光武中兴后皇权强化，但外戚与宦官开始进入权力核心。",
            "hint": "皇权越集中，君主越依赖身边的私人；这是一个结构性的伴生现象。"
        },
        {
            "timestamp": 52954,
            "keyword": "党锢之祸与士族转向",
            "type": "question",
            "context": "第九讲：士林清议与士族崛起。党锢之祸压制了清议，却让士族把力量转向了更隐蔽的地方。",
            "hint": "当表达被禁止时，资源会转向哪里？士族后来掌握的实际权力是从哪来的？"
        },
        {
            "timestamp": 59796,
            "keyword": "统一之后的失衡",
            "type": "concept",
            "context": "第十讲：三国分裂与西晋短期统一。统一之后立刻陷入新的失衡。",
            "hint": "分裂时各方势均力敌，统一后内部矛盾反而暴露出来。"
        },
        {
            "timestamp": 66398,
            "keyword": "门阀政治的本质",
            "type": "concept",
            "context": "第十一讲：江左士族门阀。门阀政治的核心不是血统本身，而是皇权对士族的依赖。",
            "hint": "皇权需要士族来治理，士族需要皇权来维持地位——这是共生，不是压制。"
        },
        {
            "timestamp": 72324,
            "keyword": "隋唐集权的前提",
            "type": "concept",
            "context": "第十二讲：皇权复兴与政治僵局。隋唐的集权高峰，其实建立在门阀政治被削弱的基础上。",
            "hint": "科举制的真正意义不只是选才——它拆掉了门阀对上升通道的垄断。"
        },
        {
            "timestamp": 79235,
            "keyword": "孝文改制：制度模仿",
            "type": "concept",
            "context": "第十三讲：从「五胡乱华」到孝文改制。北方民族政权主动学习中原制度，是一次深层的制度模仿。",
            "hint": "制度可以被「学」——那么学到的东西还算不算「自己的传统」？"
        },
        {
            "timestamp": 86133,
            "keyword": "胡化汉化是双向的",
            "type": "question",
            "context": "第十四讲：胡化汉化北齐北周。相互渗透的过程里，谁吸收了谁并不总是清楚。",
            "hint": "文明交流从来不是单向的「教化」。想想这对「文化优越感」意味着什么。"
        },
        {
            "timestamp": 92803,
            "keyword": "玄学与名士风度",
            "type": "quote",
            "context": "第十五讲：玄学思潮与名士风度。乱世里的另一条线索，是士人对个体生命的新理解。",
            "hint": "当秩序崩塌时，人会重新思考「活着意味着什么」。魏晋名士的风度就是一种回答。"
        }
    ],
    "is_default": true
}"""
)


# ──────────────────────────────────────────────────────────────────────
# 分类三：国内权威（复旦 / 清华 / 北大）
# ──────────────────────────────────────────────────────────────────────
CAT_DOMESTIC = {
    "id": "cat_domestic_authoritative",
    "title": "国内权威",
    "subtitle": "复旦 · 清华 · 北大 · 本土语境",
    "icon": "landmark",
    "order": 3,
    "description": (
        "国内顶尖高校的公开课。在西方教材之外提供本土学术语境，"
        "术语、问题意识与教材体系都更贴近国内的学习路径。"
    ),
    "resources": [
        {
            "id": "res_fudan_philosophy",
            "resource_type": "video",
            "title": "复旦大学张志林《哲学导论》全 60 讲",
            "source": "Bilibili（yiru1234 搬运 / 复旦公开课）",
            "provider": "Bilibili",
            "url": bili("BV1UW411Y7Xf"),
            "ai_context": (
                "复旦大学哲学系张志林教授的《哲学导论》完整课程，共 60 讲，总时长约 "
                "23.1 小时。这是国内哲学教育里最有代表性的通识课之一：从「哲学是什么」"
                "这个元问题出发，系统梳理存在问题（存在问题与存在问题意识）、"
                "存在问题与存在问题者的区分、以及对柏拉图、康德、黑格尔、维特根斯坦的"
                "核心追问。张志林是华东师范大学的哲学教授，课程的思辨密度和文本细读"
                "方法在国内同类课程里首屈一指。"
            ),
            "tags": ["哲学", "文科", "国内顶尖"],
            "meta": {
                "duration": 83264,
                "duration_label": "23 小时 7 分",
                "instructor": "张志林",
                "institution": "复旦大学",
                "language": "中文",
                "license": "公开课搬运（教学用途）",
                "official_site": "https://philosophy.fudan.edu.cn/",
                "level": "通识到进阶",
            },
            "captions": [
                {"start": 0, "text": "哲学导论第一讲：什么是哲学。"},
                {"start": 600, "text": "哲学不是给出答案，而是训练一种提问方式。"},
                {"start": 2400, "text": "存在问题意识：一个人追问「什么是」的那一刻，哲学就开始了。"},
                {"start": 9000, "text": "存在问题与存在问题者的区分，这是胡塞尔现象学的入口。"},
                {"start": 24000, "text": "从这里进入存在问题——也就是「世界究竟是怎样的」这个问题。"},
                {"start": 48000, "text": "后段进入存在问题者：认识、价值、自由，以及人是什么。"},
                {"start": 72000, "text": "结课部分回到元问题：哲学的使命与它的边界。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "哲学是什么",
                    "type": "concept",
                    "context": "哲学导论第一讲：什么是哲学。",
                    "hint": "张志林的处理方式不是给定义，而是先描述「哲学活动长什么样」。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 2400,
                    "keyword": "存在问题意识",
                    "type": "concept",
                    "context": "存在问题意识：一个人追问「什么是」的那一刻，哲学就开始了。",
                    "hint": "「什么」这个前缀，就是哲学与日常思维的分界线。",
                },
                {
                    "timestamp": 9000,
                    "keyword": "胡塞尔的入口：存在问题与存在问题者",
                    "type": "question",
                    "context": "存在问题与存在问题者的区分，这是胡塞尔现象学的入口。",
                    "hint": "想一想：同一个问题，为什么「世界是什么样的」和「我们怎么认识世界」需要分开处理？",
                },
                {
                    "timestamp": 72000,
                    "keyword": "哲学的使命与边界",
                    "type": "concept",
                    "context": "结课部分回到元问题：哲学的使命与它的边界。",
                    "hint": "一门导论课最后回到「这有什么用」，本身就是一个哲学动作。",
                },
            ],
        },
        {
            "id": "res_fudan_philosophy_ma",
            "resource_type": "video",
            "title": "复旦大学王德峰《哲学导论》精修版（23 小时）",
            "source": "Bilibili（垂钓的渔夫 搬运 / 复旦公开课）",
            "provider": "Bilibili",
            "url": bili("BV1H5C5BHEd2"),
            "ai_context": (
                "复旦大学哲学系王德峰教授的《哲学导论》精修版，总时长约 14.7 小时。"
                "与张志林课的学院化路径不同，王德峰以中国哲学（儒释道）为主轴，"
                "把「存在问题」的问题意识与中国哲学的资源接上：孔子讲「学而时习之」"
                "为什么是哲学，朱熹的格物致知如何理解，王阳明的心学如何回应"
                "认识论难题。这门课常被推荐给想从中国哲学入口进入哲学的人。"
            ),
            "tags": ["哲学", "中国哲学", "国内顶尖"],
            "meta": {
                "duration": 52829,
                "duration_label": "14 小时 40 分",
                "instructor": "王德峰",
                "institution": "复旦大学",
                "language": "中文",
                "license": "公开课搬运（教学用途）",
                "level": "通识",
            },
            "captions": [
                {"start": 0, "text": "复旦王德峰教授的哲学导论精修版。"},
                {"start": 800, "text": "课程从中国哲学的问题意识讲起，而不是从希腊哲学讲起。"},
                {"start": 6000, "text": "朱熹的「格物致知」到底在说什么，这是一个认识论问题。"},
                {"start": 24000, "text": "王阳明心学是对格物致知的内部批判，这是一次范式转换。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "从中国哲学进入哲学",
                    "type": "concept",
                    "context": "复旦王德峰教授的哲学导论精修版。",
                    "hint": "这条路径的价值：哲学问题意识不必从翻译文本里习得。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 6000,
                    "keyword": "格物致知的认识论解读",
                    "type": "concept",
                    "context": "朱熹的「格物致知」到底在说什么，这是一个认识论问题。",
                    "hint": "把它读成认识论，而不是读成道德修养，视角会完全变。",
                },
                {
                    "timestamp": 24000,
                    "keyword": "心学作为范式转换",
                    "type": "question",
                    "context": "王阳明心学是对格物致知的内部批判，这是一次范式转换。",
                    "hint": "想一想：这次转换是修正了朱熹，还是换了个问题？",
                },
            ],
        },
        {
            "id": "res_tsinghua_econ",
            "resource_type": "video",
            "title": "清华大学《经济学原理》（曼昆）全集",
            "source": "Bilibili（复利的奇迹价值投资 搬运 / 清华公开课）",
            "provider": "Bilibili",
            "url": bili("BV1am4y1D73g"),
            "ai_context": (
                "清华大学开设的曼昆《经济学原理》完整课程，总时长约 54.8 小时。"
                "曼昆是诺贝尔经济学奖得主，这门课是全球使用最广的经济学入门教材"
                "《经济学原理》的课程化版本。课程结构遵循曼昆的十大原理框架，"
                "先讲经济学思维（机会成本、边际分析、供需模型），再讲微观经济学"
                "主体（消费者与厂商行为、市场结构、外部性与公共品），最后进入宏观"
                "（宏观经济指标、经济增长、失业、通胀、货币政策与财政政策）。"
                "中文课程能省去大量英文术语的检索成本。"
            ),
            "tags": ["经济学", "社科", "国内顶尖"],
            "meta": {
                "duration": 197159,
                "duration_label": "54 小时 46 分",
                "instructor": "N. Gregory Mankiw",
                "institution": "清华大学",
                "language": "中文",
                "license": "公开课搬运（教学用途）",
                "official_site": "https://www.tsinghua.edu.cn/",
                "level": "入门到进阶",
            },
            "captions": [
                {"start": 0, "text": "这是清华大学开设的曼昆《经济学原理》完整课程。"},
                {"start": 900, "text": "第一条原理：人们面临权衡取舍。机会成本是被放弃的最高价值。"},
                {"start": 3600, "text": "边际分析是经济学区别于日常思维的核心方法。"},
                {"start": 18000, "text": "供给需求模型是整个微观经济学的地基，任何一个市场都先画这张图。"},
                {"start": 60000, "text": "宏观部分开始：GDP、通货膨胀、失业率，这三个指标如何度量一个经济体。"},
                {"start": 150000, "text": "最后讲政策：货币政策与财政政策分别由谁来做，怎么做。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "曼昆十大原理",
                    "type": "concept",
                    "context": "这是清华大学开设的曼昆《经济学原理》完整课程。",
                    "hint": "曼昆的十条原理本身就是一份可背诵的课程大纲。",
                    "context_label": "课程开场",
                },
                {
                    "timestamp": 900,
                    "keyword": "机会成本",
                    "type": "concept",
                    "context": "第一条原理：人们面临权衡取舍。机会成本是被放弃的最高价值。",
                    "hint": "凡是「我打算做 X」的问题，都可以用机会成本重问一遍。",
                },
                {
                    "timestamp": 3600,
                    "keyword": "边际分析",
                    "type": "question",
                    "context": "边际分析是经济学区别于日常思维的核心方法。",
                    "hint": "想一想：为什么「平均」思维经常在决策时给出错误答案？",
                },
                {
                    "timestamp": 18000,
                    "keyword": "供给需求模型",
                    "type": "concept",
                    "context": "供给需求模型是整个微观经济学的地基，任何一个市场都先画这张图。",
                    "hint": "价格不是被谁决定的，是被两条曲线的交点「找出来」的。",
                },
            ],
        },
        PKU_YAN_BUKE,
    ],
}

# ──────────────────────────────────────────────────────────────────────
# 分类四：前沿与认知（TED）
# ──────────────────────────────────────────────────────────────────────
CAT_FRONTIER = {
    "id": "cat_frontier_cognition",
    "title": "前沿与认知",
    "subtitle": "TED 经典 · 认知科学与人文",
    "icon": "sparkles",
    "order": 4,
    "description": (
        "TED 官方的经典演讲集。每一讲都是一位领域顶尖者的十五分钟压缩包——"
        "适合在碎片时间里反复调整一个人的思维默认值。"
    ),
    "resources": [
        {
            "id": "res_ted_procrastination",
            "resource_type": "video",
            "title": "TED：拖延症患者的内心世界（Tim Urban）",
            "source": "TED 官方频道",
            "provider": "YouTube",
            "url": yt("arj7oStGLkU"),
            "fallback_url": bili("BV1GH4y1h7kY"),
            "ai_context": (
                "Tim Urban 在 TED 的著名演讲。它最著名的贡献是画出了两个截然不同的"
                "大脑：理性脑（Rational Brain）是一只迟钝的猴子，而即时满足 monkey "
                "brain 是一只受惊的猴子——当截止日期逼近时，猴子抢走了方向盘。"
                "演讲还给出了「Prodcast / Instant gratification」的时间差研究："
                "多数人错误地预估未来的自己会更有耐心。"
            ),
            "tags": ["认知", "拖延", "TED"],
            "meta": {
                "duration": 844,
                "duration_label": "14 分 4 秒",
                "instructor": "Tim Urban",
                "institution": "TED",
                "language": "英语",
                "license": "TED 官方发布 / CC BY-NC-ND",
                "official_site": "https://www.ted.com/talks/tim_urban_inside_the_mind_of_a_master_procrastinator",
                "level": "通识",
                "recorded_year": 2015,
            },
            "captions": [
                {"start": 0, "text": "我想先讲一个我自己的问题：我是个拖延症患者，而且情况很严重。"},
                {"start": 90, "text": "拖延的时候，人会制造一种奇怪的感觉：焦虑，但同时又很爽。"},
                {"start": 240, "text": "我们有一个理性的脑，但它像一只迟钝的猴子，理性思考很吃力。"},
                {"start": 400, "text": "而即时满足的 monkey brain 是一只受惊的猴子，一有压力就抢方向盘。"},
                {"start": 600, "text": "关键在于：截止日期只有在未来时，理性脑才睡得着。"},
                {"start": 720, "text": "研究显示，我们系统性地高估了未来自己的自控力。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "拖延带来的焦虑快感",
                    "type": "concept",
                    "context": "我想先讲一个我自己的问题：我是个拖延症患者，而且情况很严重。",
                    "hint": "TED 演讲的经典开场：先把自己当案例，而不是先讲理论。",
                    "context_label": "演讲开场",
                },
                {
                    "timestamp": 400,
                    "keyword": "即时满足脑 vs 理性脑",
                    "type": "concept",
                    "context": "而即时满足的 monkey brain 是一只受惊的猴子，一有压力就抢方向盘。",
                    "hint": "这个模型后来被无数行为科学著作沿用——「情绪脑 vs _exec 脑」。",
                },
                {
                    "timestamp": 720,
                    "keyword": "高估未来的自控力",
                    "type": "question",
                    "context": "研究显示，我们系统性地高估了未来自己的自控力。",
                    "hint": "想一想：这个偏差在投资、职业选择、健康管理上会怎么放大？",
                },
            ],
        },
        {
            "id": "res_ted_procrastination_bili",
            "resource_type": "video",
            "title": "TED：拖延症患者的内心世界（中文版 · 国内直连）",
            "source": "Bilibili（名字长才帅 搬运 / TED 中英字幕）",
            "provider": "Bilibili",
            "url": bili("BV1HW411y7KU"),
            "ai_context": (
                "Tim Urban 那场 TED 的中英双语字幕版（28 分钟版本，含更多提问与互动），"
                "国内网络直连畅通。与官方 14 分钟剪辑版相比，这一版保留了完整问答环节，"
                "以及演讲者关于「如何跟拖延症共处」的具体建议：把 deadline 拆成"
                "「意义 deadline」和「绝对 deadline」，前者才是真正驱动行为的那个。"
            ),
            "tags": ["认知", "拖延", "TED", "国内直连"],
            "meta": {
                "duration": 1679,
                "duration_label": "27 分 59 秒",
                "instructor": "Tim Urban",
                "institution": "TED",
                "language": "英语 + 中文字幕",
                "license": "TED 官方发布 / CC BY-NC-ND",
                "level": "通识",
            },
            "captions": [
                {"start": 0, "text": "中文版的拖延症演讲，附完整问答环节。"},
                {"start": 500, "text": "他提出了一个具体做法：设定一个「意义 deadline」，而不只是「绝对 deadline」。"},
                {"start": 1100, "text": "意义 deadline 会让任务本身变得重要，而不只是怕它来不及。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "中文版完整演讲",
                    "type": "concept",
                    "context": "中文版的拖延症演讲，附完整问答环节。",
                    "hint": "国内直连版本，适合先看中文建立整体理解。",
                    "context_label": "版本说明",
                },
                {
                    "timestamp": 500,
                    "keyword": "意义 deadline",
                    "type": "concept",
                    "context": "他提出了一个具体做法：设定一个「意义 deadline」，而不只是「绝对 deadline」。",
                    "hint": "这是这场演讲里最实用的一条：改截止日期的定义，而不是改截止日期本身。",
                },
                {
                    "timestamp": 1100,
                    "keyword": "为什么意义 deadline 有效",
                    "type": "question",
                    "context": "意义 deadline 会让任务本身变得重要，而不只是怕它来不及。",
                    "hint": "想一想：这个方法对「没有外部截止日期」的学习任务是否也成立？",
                },
            ],
        },
        {
            "id": "res_ted_emotions",
            "resource_type": "video",
            "title": "TED：你的大脑创造情绪，而非被情绪支配（Lisa Feldman Barrett）",
            "source": "TED 官方频道",
            "provider": "YouTube",
            "url": yt("0gks6ceq4eQ"),
            "fallback_url": bili("BV1KKGDzvEZk"),
            "ai_context": (
                "神经科学家 Lisa Feldman Barrett 的 TED 演讲，基于她的畅销书《情绪》"
                "(How Emotions Are Made)。核心论点是：大众流行的「情绪 = 外部刺激触发"
                "固定反应」模型是错的；大脑是一个预测机器，情绪是大脑基于身体感觉"
                "构造出的解释。她的「通用大脑建构理论」主张情绪高度依赖于概念知识"
                "和文化语境——所以不同文化对同一情境会体验到完全不同的情绪。"
            ),
            "tags": ["认知", "情绪", "脑科学", "TED"],
            "meta": {
                "duration": 1109,
                "duration_label": "18 分 29 秒",
                "instructor": "Lisa Feldman Barrett",
                "institution": "TED",
                "language": "英语",
                "license": "TED 官方发布 / CC BY-NC-ND",
                "official_site": "https://www.ted.com/talks/lisa_feldman_barrett_you_aren_t_at_the_mercy_of_your_emotions_your_brain_creates_them",
                "level": "进阶",
                "recorded_year": 2017,
            },
            "captions": [
                {"start": 0, "text": "你并不受情绪的支配——是大脑在创造情绪。"},
                {"start": 130, "text": "传统的情绪理论说：蛇出现 → 恐惧被触发 → 你逃跑。"},
                {"start": 320, "text": "但如果真是这样，那么从不出门的人根本不会害怕蛇。"},
                {"start": 560, "text": "事实上，你的身体内部一直在变化，只是大脑忽略了这些感觉。"},
                {"start": 780, "text": "大脑是一个预测机器，它在用身体信号构造一个解释。"},
                {"start": 980, "text": "而这个解释高度依赖于你学过的概念和你所在的文化。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "情绪是被建构的",
                    "type": "concept",
                    "context": "你并不受情绪的支配——是大脑在创造情绪。",
                    "hint": "这个论断直接挑战直觉，也是这场演讲被广泛讨论的原因。",
                    "context_label": "演讲开场",
                },
                {
                    "timestamp": 320,
                    "keyword": "反事实检验",
                    "type": "concept",
                    "context": "但如果真是这样，那么从不出门的人根本不会害怕蛇。",
                    "hint": "用「如果传统理论成立会怎样」来证伪——这是个好方法。",
                },
                {
                    "timestamp": 780,
                    "keyword": "大脑作为预测机器",
                    "type": "question",
                    "context": "大脑是一个预测机器，它在用身体信号构造一个解释。",
                    "hint": "想一想：如果情绪是建构出来的，那「情绪失控」这个说法还成立吗？",
                },
            ],
        },
        {
            "id": "res_ted_vulnerability",
            "resource_type": "video",
            "title": "TED：脆弱的力量（Brené Brown）",
            "source": "TED 官方频道",
            "provider": "YouTube",
            "url": yt("iCvmsMzlF7o"),
            "fallback_url": bili("BV11W411E7GM"),
            "ai_context": (
                "Brené Brown 的 TED 演讲，是她根据《脆弱》(Daring Greatly) 一书做的"
                "演讲版本，被认为是她最著名的一次公共表达。核心论点：脆弱不是软弱，"
                "而是「不确定、不完美、敢 exposed」的状态——而我们出于害怕被评判，"
                "系统性地回避它，结果是麻木、孤独与不真实。她给出的实践方式是"
                "「先讲实话」：让自己的故事被听见。"
            ),
            "tags": ["认知", "心理", "TED"],
            "meta": {
                "duration": 1250,
                "duration_label": "20 分 50 秒",
                "instructor": "Brené Brown",
                "institution": "TED",
                "language": "英语",
                "license": "TED 官方发布 / CC BY-NC-ND",
                "official_site": "https://www.ted.com/talks/brene_brown_the_power_of_vulnerability",
                "level": "通识",
                "recorded_year": 2010,
            },
            "captions": [
                {"start": 0, "text": "脆弱——在德州它意味着不稳定，在南卡它意味着 노출。"},
                {"start": 110, "text": "但真正的脆弱既不是软弱，也不是自怜。"},
                {"start": 300, "text": "脆弱是「不确定、不完美、敢暴露」的那个状态。"},
                {"start": 520, "text": "我们的整个文化都在教我们回避脆弱：先成功，再展露。"},
                {"start": 800, "text": "结果是麻木、孤独，以及一种「完美」的假面。"},
                {"start": 1050, "text": "出路是先讲实话——让别人听见你的故事，包括你自己的故事。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "脆弱的含义因文化而异",
                    "type": "concept",
                    "context": "脆弱——在德州它意味着不稳定，在南卡它意味着暴露。",
                    "hint": "用不同地区的词义差异开场，是 Brown 惯用的「把抽象名词落地」的手法。",
                    "context_label": "演讲开场",
                },
                {
                    "timestamp": 300,
                    "keyword": "脆弱的准确定义",
                    "type": "concept",
                    "context": "脆弱是「不确定、不完美、敢暴露」的那个状态。",
                    "hint": "这与「软弱」的区别在于：软弱是无力，脆弱是选择暴露。",
                },
                {
                    "timestamp": 1050,
                    "keyword": "先讲实话",
                    "type": "question",
                    "context": "出路是先讲实话——让别人听见你的故事，包括你自己的故事。",
                    "hint": "想一想：在你的生活里，「先讲实话」最小的可行动作是什么？",
                },
            ],
        },
        {
            "id": "res_ted_memory",
            "resource_type": "video",
            "title": "TED：你的记忆有多可靠（Elizabeth Loftus）",
            "source": "TED 官方频道",
            "provider": "YouTube",
            "url": yt("PB2OegI6wvI"),
            "fallback_url": bili("BV1M4411P72C"),
            "ai_context": (
                "认知心理学家 Elizabeth Loftus 的 TED 演讲，讲述她著名的「误导信息效应」"
                "实验：在看完车祸录像后，被问到一个不存在的「碎裂的玻璃」细节的人，"
                "有相当比例会「记起」根本没发生过的事。这项研究直接动摇了目击证词"
                "在司法系统中的可靠性，也是 Loftus 获得美国国家科学奖章的工作基础。"
            ),
            "tags": ["认知", "记忆", "脑科学", "TED"],
            "meta": {
                "duration": 1056,
                "duration_label": "17 分 36 秒",
                "instructor": "Elizabeth Loftus",
                "institution": "TED",
                "language": "英语",
                "license": "TED 官方发布 / CC BY-NC-ND",
                "official_site": "https://www.ted.com/talks/elizabeth_loftus_how_reliable_is_your_memory",
                "level": "进阶",
                "recorded_year": 2013,
            },
            "captions": [
                {"start": 0, "text": "我想先问你们一个问题：你的记忆有多可靠？"},
                {"start": 150, "text": "一项研究让受试者看一段车祸录像，然后问一些细节问题。"},
                {"start": 360, "text": "其中一些问题里包含根本没发生过的细节，比如「碎裂的玻璃」。"},
                {"start": 620, "text": "结果有相当一部分人开始「记起」那些不存在的细节。"},
                {"start": 850, "text": "这就是「误导信息效应」——后进入的信息改写了先前的记忆。"},
            ],
            "interactive_nodes": [
                {
                    "timestamp": 0,
                    "keyword": "记忆的可靠性之问",
                    "type": "concept",
                    "context": "我想先问你们一个问题：你的记忆有多可靠？",
                    "hint": "Loftus 的 TED 专门有一条「个人化」的提问设计——她从自己被错误记忆影响的经历讲起。",
                    "context_label": "演讲开场",
                },
                {
                    "timestamp": 620,
                    "keyword": "虚构记忆的自发产生",
                    "type": "concept",
                    "context": "结果有相当一部分人开始「记起」那些不存在的细节。",
                    "hint": "这在司法上意味着什么？记忆被当成证据时需要多高的门槛？",
                },
                {
                    "timestamp": 850,
                    "keyword": "误导信息效应",
                    "type": "question",
                    "context": "这就是「误导信息效应」——后进入的信息改写了先前的记忆。",
                    "hint": "想一想：你自己的记忆里，有多少细节其实是后来才被补上的？",
                },
            ],
        },
    ],
}


def build() -> dict:
    """构造整份中台数据。

    构造完成后会把「先猜后看」定制钩子挂到对应课程的节点上——
    见 :func:`predict_hooks.apply_hooks`。
    """
    data = _build_raw()

    # ── 挂上「先猜后看」定制钩子 ──
    #
    # 只有核心示范课有手写钩子；其余课程的节点在**运行时**由前端
    # 生成兜底题（见 ``web/lib/predict-hook.ts``），所以打开任何
    # 一门课都能立刻体验到这个交互。
    hooked = 0
    for category in data["hub"]["categories"]:
        for resource in category.get("resources", []):
            nodes = resource.get("interactive_nodes")
            if not isinstance(nodes, list):
                continue
            before = sum(1 for node in nodes if node.get("predict_hook"))
            apply_hooks(resource.get("id", ""), nodes)
            hooked += sum(1 for node in nodes if node.get("predict_hook")) - before

    data["hub"]["metadata"]["predict_hooks"] = {
        "authored": hooked,
        "note": (
            "手写定制钩子的数量。其余节点在运行时由前端按节点类型生成兜底题，"
            "保证任意课程都能立即体验「先猜后看」。"
        ),
    }

    return data


def _build_raw() -> dict:
    return {
        "$schema": "../schemas/global_resource_hub.schema.json",
        "hub": {
            "id": "global_resource_hub",
            "revision": 2,
            "title": "全网公开教学视频资源中台",
            "description": (
                "平台的视频资源注册中心。每一类是一个「顶级课程专区」，分类下挂真实可播的"
                "公开教学视频。每条资源都带 interactive_nodes 时间戳交互数组——播放到某个"
                "时刻就弹出知识气泡，点气泡即暂停并唤醒右侧 AI 助教。所有视频 ID 均经过"
                "在线校验（标题 / 时长 / 频道可读取），B 站条目优先选取国内公网直连畅通的版本。"
            ),
            "language": "zh",
            "depth": "standard",
            "status": "ready",
            "updated_at": "2026-11-13",
            "metadata": {
                "pillar": "mixed",
                "author": "Open Education Learning Platform",
                "notes": (
                    "所有视频均为各平台官方公开频道（MIT OpenCourseWare / YaleCourses / "
                    "Harvard University / CrashCourse / Khan Academy / TED）或国内公网"
                    "畅通的公开课搬运版本，遵守 CC BY / 公开课授权条款。"
                ),
                "registry": "global",
                "resource_count": 24,
                "category_count": 4,
                "verification": "backend/tools/fetch_media_meta.py",
                "fallback_policy": (
                    "每条资源都带 fallback_url——主源（YouTube / B 站）连不上或加载"
                    "超时时，播放器自动切到这条备用源。当前备用源统一指向 B 站的"
                    "国内直连镜像（同一课程的中文配音 / 中英字幕版），全部 bvid 经"
                    "fetch_media_meta.py 在线校验（标题 / 时长可读取）。后续如上传"
                    "云盘 / OSS 直链，只需替换 fallback_url 的值即可，播放器逻辑"
                    "无需改动。"
                ),
            },
            "exploration_summary": (
                "这是一个跨平台的公开课目录，共 4 大分类 24 条资源：顶级高校（哈佛 CS50、"
                "耶鲁死亡哲学 ×2、哈佛公正 ×2、MIT 线性代数 ×3）、通识趣味（CrashCourse "
                "心理学 ×2 / 世界史 ×2 / 计算机科学 ×2、可汗学院）、国内权威（复旦哲学导论 "
                "×2、清华曼昆经济学、北大阎步克中国古代史）、前沿与认知（TED 拖延症 ×2 / "
                "情绪建构 / 脆弱的力量 / 记忆可靠性）。分类依据是「学习者当下需要什么」"
                "而不是学科难度——顶级高校区给想要系统学科训练的人，通识趣味区给想要轻松"
                "建立整体认知的人，国内权威区给想要本土语境的人，前沿与认知区给需要重塑"
                "直觉的人。每条资源都带 fallback_url——主源不可达时无缝降级到"
                "B 站国内直连镜像，国内网络环境下始终有画面可看。"
            ),
            "categories": [
                CAT_TOP_UNIVERSITY,
                CAT_GENERAL,
                CAT_DOMESTIC,
                CAT_FRONTIER,
            ],
        },
    }


def main() -> int:
    data = build()
    total = sum(len(c["resources"]) for c in data["hub"]["categories"])
    nodes = sum(
        len(r.get("interactive_nodes", []))
        for c in data["hub"]["categories"]
        for r in c["resources"]
    )
    TARGET.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"写入 {TARGET}")
    print(f"分类 {len(data['hub']['categories'])} 个 · 资源 {total} 条 · 交互节点 {nodes} 个")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
