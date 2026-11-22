#!/usr/bin/env python3
"""把「先猜后看」定制钩子挂到中台数据上（原地修改）
====================================================

为什么需要这个脚本
------------------

``tools/build_global_hub.py`` 只负责生成**人工整理**的 24 条资源。
中台里的另外 123 条是 :mod:`app.services.media_ingestor` 从 B 站 /
YouTube **实时采集**来的，合并进同一份 ``global_resource_hub.json``。

所以定制钩子要挂到两个地方：

* ``build_global_hub.py`` —— 新建数据时带上钩子（已经做了）；
* 本脚本 —— 把钩子补挂到**已合并**的那份 JSON 上。

钩子挂在 ``interactive_nodes`` 的**节点内部**，而 ``interactive_nodes``
在采集同步里是**受保护字段**（见 ``media_ingestor._PROTECTED_FIELDS``），
所以钩子不会被后续的采集同步冲掉。

用法::

    python3 tools/apply_predict_hooks.py
"""

from __future__ import annotations

import json
from pathlib import Path

try:
    from .predict_hooks import apply_hooks
except ImportError:  # pragma: no cover - 直接以脚本方式运行
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from predict_hooks import apply_hooks

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "data" / "global_resource_hub.json"


def main() -> int:
    raw = json.loads(TARGET.read_text(encoding="utf-8"))
    hub = raw.get("hub", raw)

    hooked = 0
    touched_courses: list[str] = []

    for category in hub.get("categories", []):
        for resource in category.get("resources", []):
            nodes = resource.get("interactive_nodes")
            if not isinstance(nodes, list):
                continue

            before = sum(1 for node in nodes if node.get("predict_hook"))
            apply_hooks(resource.get("id", ""), nodes)
            after = sum(1 for node in nodes if node.get("predict_hook"))

            if after > before:
                hooked += after - before
                touched_courses.append(
                    f"{resource.get('id', '?')}(+{after - before})"
                )

    # 同步写进 metadata——前端可以据此显示「定制题覆盖率」。
    metadata = hub.setdefault("metadata", {})
    metadata["predict_hooks"] = {
        "authored": hooked,
        "note": (
            "手写定制钩子的数量。其余节点在运行时由前端按节点类型生成兜底题，"
            "保证任意课程都能立即体验「先猜后看」。"
        ),
    }

    TARGET.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"写入 {TARGET}")
    print(f"挂上定制钩子 {hooked} 道 · 涉及 {len(touched_courses)} 门课")
    for course in touched_courses:
        print(f"  {course}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
