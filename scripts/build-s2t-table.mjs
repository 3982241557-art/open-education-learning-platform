#!/usr/bin/env node
/**
 * 简体 → 繁体 单字映射表生成器
 * =============================
 *
 * 生成 ``web/public/data/s2t-chars.json``——繁体模式（``zh-TW``）
 * 使用的字符级转换表。
 *
 * 为什么是字符级
 * --------------
 *
 * 逐词查表需要**每加一句文案就登记一次**，漏登记就在繁体模式下
 * 直接穿帮。字符级转换是「一次性铺好，之后自动生效」——
 * 新文案不需要任何登记动作。
 *
 * 数据来源
 * --------
 *
 * OpenCC 的 ``s2t`` 规则（Apache-2.0）。只保留**单字对单字**的
 * 映射——多字短语转换（如「内存」→「記憶體」）不在这里做，
 * 那是词语层面的事，不属于字符转换。
 *
 * 用法
 * ----
 *
 * .. code-block:: bash
 *
 *     node scripts/build-s2t-table.mjs
 *
 * 需要 Python + opencc：
 *
 * .. code-block:: bash
 *
 *     backend/.venv/bin/python -c "import opencc"  # 确认可用
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const OUT_FILE = join(ROOT, "web", "public", "data", "s2t-chars.json");

/** 候选 Python 解释器——按顺序试。 */
const PYTHON_CANDIDATES = [
  join(ROOT, "backend", ".venv", "bin", "python"),
  "python3",
];

/** 找得到能 import opencc 的解释器。 */
function findPython() {
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      execFileSync(candidate, ["-c", "import opencc"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error(
    "\n❌ 找不到可用的 Python + opencc。\n" +
      "   请先安装：backend/.venv/bin/pip install opencc-python-reimplemented\n",
  );
  process.exit(1);
}

/**
 * ⛔ **批量转换**，不要一个字符调一次 OpenCC。
 *
 * OpenCC 每次调用都有固定的初始化开销。按码位逐个调用 20000 次，
 * 要跑好几分钟。改成「把全部汉字拼成一个大字符串转换一次」，
 * 只需要 1 次调用。
 */
const SCRIPT = `
import json
from opencc import OpenCC

cc = OpenCC("s2t")

# 收集全部 CJK 统一表意文字 + 扩展 A。
chars = []
for cp in list(range(0x4E00, 0xA000)) + list(range(0x3400, 0x4E00)):
    chars.append(chr(cp))

# 一次转换整串，再按字符对齐拆回映射。
blob = "".join(chars)
converted = cc.convert(blob)

table = {}
if len(converted) == len(chars):
    for src, dst in zip(chars, converted):
        if src != dst and len(dst) == 1:
            table[src] = dst
else:
    # 长度不一致说明 OpenCC 做了整词替换——只能退化为逐字调用。
    for src in chars:
        dst = cc.convert(src)
        if src != dst and len(dst) == 1:
            table[src] = dst

print(json.dumps(table, ensure_ascii=False, separators=(",", ":")))
`;

let json;
try {
  json = execFileSync(python, ["-c", SCRIPT], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (error) {
  console.error(`\n❌ OpenCC 转换失败：${error.message}\n`);
  process.exit(1);
}

const table = JSON.parse(json);
const count = Object.keys(table).length;

if (count < 1000) {
  console.error(
    `\n❌ 转换表只有 ${count} 条——预期 2000 条以上。数据源可能有问题。\n`,
  );
  process.exit(1);
}

writeFileSync(OUT_FILE, `${json}\n`, "utf8");
console.log(
  `[build-s2t-table] ✅ ${count} 条单字映射 · ${(json.length / 1024).toFixed(0)} KB · ${OUT_FILE}`,
);
