/**
 * 为所有实验台补上 zh-TW（繁体）渲染。
 *
 * 现状：实验台内部用 `isEn ? "English" : "简体"` 的三元表达式区分语言。
 * 这对 zh-CN / en 是对的，但 zh-TW 会直接显示简体——繁体模式形同虚设。
 *
 * 做法：
 * 1. 引入 `useTraditional()` 拿到 `tw()`——它在 zh-TW 下做字符级转换，
 *    其余语言原样返回；
 * 2. 把所有 `isEn ? A : B` 三元中的**中文分支 B** 包一层 `tw(B)`。
 *
 * 因为 `isEn` 为真时三元走英文分支 A，所以 `tw()` 只会在中文分支被调用，
 * 语义完全安全。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const LAB_DIR = new URL("../web/components/labs/", import.meta.url).pathname;

const LITERAL = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)';

const files = globSync(`${LAB_DIR}*.tsx`);

let totalTernaries = 0;
let totalFiles = 0;

for (const file of files) {
  const base = file.split("/").pop();
  if (base === "lab-types.tsx" || base === "lab-registry.tsx") continue;

  let src = readFileSync(file, "utf8");
  const original = src;

  // 1) 把 `isEn ? A : B` 中的 B（中文分支）包上 tw(...)
  //    B 必须是字符串字面量；非字面量的留给人工确认。
  const ternaryRe = new RegExp(
    String.raw`(isEn\s*\?\s*${LITERAL}\s*:\s*)(${LITERAL})`,
    "gs",
  );
  let count = 0;
  src = src.replace(ternaryRe, (_m, head, elseBranch) => {
    if (elseBranch.includes("tw(")) return _m;
    count += 1;
    return `${head}tw(${elseBranch})`;
  });

  if (count === 0) continue;

  totalTernaries += count;
  totalFiles += 1;

  // 2) 插入 import
  const importLine = `import { useTraditional } from "@/lib/use-bilingual";\n`;
  const importMatches = [...src.matchAll(/^import .*?;$/gms)];
  if (importMatches.length > 0) {
    const last = importMatches[importMatches.length - 1];
    const end = last.index + last[0].length;
    src = `${src.slice(0, end)}\n${importLine.trim()}\n${src.slice(end)}`;
  } else {
    src = `${importLine}\n${src}`;
  }

  // 3) 在组件函数体开头插入 const tw = useTraditional();
  const compRe =
    /export default function (\w+)\(\{[\s\S]*?\}\s*:\s*LabProps\)\s*\{/;
  const compMatch = src.match(compRe);
  if (compMatch) {
    const insertAt = compMatch.index + compMatch[0].length;
    src = `${src.slice(0, insertAt)}\n  const tw = useTraditional();${src.slice(insertAt)}`;
  } else {
    console.warn(`  ⚠️  ${base}：找不到组件函数入口，需人工插入 tw()`);
  }

  writeFileSync(file, src);
  console.log(`✅ ${base} 已处理 ${count} 处`);
}

console.log(`\n共 ${totalFiles} 个文件、${totalTernaries} 处三元表达式`);
