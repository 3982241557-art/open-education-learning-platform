#!/usr/bin/env python3
"""把模型密钥写进 backend/.env。

用法（推荐：管道输入，密钥不会出现在命令历史里）::

    read -s KEY && printf '%s' "$KEY" | python3 scripts/set_api_key.py

或者直接给参数::

    python3 scripts/set_api_key.py sk-xxxxxxxx

脚本会：

1. 找到 ``backend/.env``（不存在就按模板创建）；
2. 替换（或追加）``DEEPSEEK_API_KEY`` 一行，**保留其余注释与配置**；
3. 校验格式，挡掉模板占位符 ``sk-your-deepseek-key-here``；
4. 把文件权限收紧到 ``600``；
5. **不回显完整密钥**，只打印脱敏后的首尾片段。

设计要点
--------

- **幂等**：重复运行只会更新密钥那一行，不会重复追加。
- **不破坏注释**：用正则就地替换 ``KEY=...`` 那一行，行内的换行与
  其它注释原样保留——这是直接 ``read > .env`` 做不到的。
- **拒绝占位符**：模板值会让接口返回 401，与其事后排查，不如当场报错。
"""

from __future__ import annotations

import argparse
import os
import re
import stat
import sys
from pathlib import Path

#: 仓库根目录（本脚本位于 ``scripts/`` 下）。
ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "backend" / ".env"

#: 模板占位符——这些值不是真密钥。
PLACEHOLDERS = {
    "sk-your-deepseek-key-here",
    "your-deepseek-key-here",
    "changeme",
    "placeholder",
}

#: ``DEEPSEEK_API_KEY=...`` 那一行。
KEY_LINE_RE = re.compile(r"^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=.*$", re.MULTILINE)

#: 写入前的环境模板（``.env`` 不存在时用）。
TEMPLATE = """\
# ─────────────────────────────────────────────────────────────
#  模型接入配置
# ─────────────────────────────────────────────────────────────
# 把下面的 Key 换成你自己的，然后重启后端服务。
# 获取地址：https://platform.deepseek.com/api_keys

DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# 端点与模型。默认值适用于 DeepSeek 官方，兼容任何 OpenAI 协议端点。
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# 是否在终端打印每轮组装好的完整提示词（排查用）。
SEEK_LOG_PROMPT=true
"""


def mask(key: str) -> str:
    """脱敏展示：只保留首 4 位与末 4 位。"""
    text = str(key or "")
    if len(text) <= 10:
        return "…" * len(text)
    return f"{text[:4]}…{text[-4:]}"


def validate(key: str) -> str:
    """校验密钥格式，返回清洗后的值。

    抛 ``ValueError`` 表示这个值不能用作密钥。
    """
    text = str(key or "").strip().strip('"').strip("'")
    if not text:
        raise ValueError("密钥为空。")
    if text.lower() in PLACEHOLDERS:
        raise ValueError(
            "这仍然是模板占位符，不是真实密钥。"
            "请到 https://platform.deepseek.com/api_keys 获取真实 Key。"
        )
    if len(text) < 16:
        raise ValueError(
            f"密钥长度只有 {len(text)} 位，明显短于正常的 DeepSeek 密钥，请检查是否复制完整。"
        )
    return text


def write_key(env_file: Path, key: str) -> None:
    """把密钥写进 ``env_file``，保留其余内容。"""
    env_file.parent.mkdir(parents=True, exist_ok=True)

    if env_file.exists():
        original = env_file.read_text(encoding="utf-8")
    else:
        original = TEMPLATE

    if KEY_LINE_RE.search(original):
        updated = KEY_LINE_RE.sub(f"DEEPSEEK_API_KEY={key}", original, count=1)
    else:
        # 文件里没有这一行——追加到末尾。
        separator = "" if original.endswith("\n") else "\n"
        updated = f"{original}{separator}\nDEEPSEEK_API_KEY={key}\n"

    env_file.write_text(updated, encoding="utf-8")

    # 密钥文件收紧权限——只有当前用户可读写。
    try:
        os.chmod(env_file, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="把 DeepSeek 密钥写入 backend/.env（不回显完整密钥）",
    )
    parser.add_argument("key", nargs="?", help="模型密钥；省略则从标准输入读取")
    args = parser.parse_args(argv)

    # ① 取密钥：参数优先，其次标准输入。
    raw = args.key
    if raw is None:
        if sys.stdin.isatty():
            print("请把密钥作为参数传入，或用管道输入。", file=sys.stderr)
            return 2
        raw = sys.stdin.read()

    # ② 校验。
    try:
        key = validate(raw)
    except ValueError as exc:
        print(f"✗ 校验失败：{exc}", file=sys.stderr)
        return 1

    # ③ 写入。
    write_key(ENV_FILE, key)

    print(f"✓ 已写入 {ENV_FILE}")
    print(f"  密钥：{mask(key)}（长度 {len(key)}）")
    print(f"  权限：{stat.filemode(ENV_FILE.stat().st_mode)}")
    print("\n下一步：重启后端服务，然后查看启动横幅是否显示 deepseek。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
