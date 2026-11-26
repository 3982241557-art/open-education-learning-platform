/**
 * 把实验台里 **memo 化的中文文案** 也补上繁体。
 *
 * 背景
 * ----
 *
 * 实验台里的 ``stageHint`` 是一段 ``useMemo``，里面根据阶段返回
 * 一句中文引导语。之前的三元替换脚本只处理了 JSX 里的字面量三元，
 * 漏掉了这些**函数体内的 return**。
 *
 * 漏掉的后果：繁体模式下这一段仍然是简体——页面上「中繁混排」，
 * 看起来像半成品。
 *
 * 做法
 * ----
 *
 * 1. 找到 ``const stageHint = useMemo(() => { ... }, [deps]);``；
 * 2. 把**中文分支**的 ``return "..."`` 包上 ``tw(...)``；
 * 3. 把 ``tw`` 加进依赖数组——不然映射表异步到位后不会重算。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const LAB_DIR = new URL("../web/components/labs/", import.meta.url).pathname;

const files = globSync(`${LAB_DIR}*.tsx`).filter((f) => !/lab-(types|registry)\.tsx$/.test(f));

let totalReturns = 0;

for (const file of files) {
  const base = file.split("/").pop();
  let src = readFileSync(file, "utf8");
  const original = src;

  // 定位 `const stageHint = useMemo(() => { ... }, [deps]);` 的函数体
  const memoRe = /(const stageHint = useMemo\(\(\) => \{)([\s\S]*?)(\n  \}, \[)([^\]]*)(\]\);)/g;

  src = src.replace(memoRe, (full, head, body, tail, deps, end) => {
    // body 里，英文分支之后的 `return "中文"` 要包 tw()
    // 判定依据：该 return 前面最近的 isEn 判断已经结束。
    // 保守做法：只包**含中日韩字符**的 return。
    const newBody = body.replace(
      /return\s+("(?:[^"\\]|\\.)*")/g,
      (m, lit) => {
        // 字符串里必须有中文才处理
        if (!/[\u4e00-\u9fff]/.test(lit)) return m;
        if (lit.includes("tw(")) return m;
        totalReturns += 1;
        return `return tw(${lit})`;
      },
    );

    // 依赖数组里加上 tw
    const newDeps = deps.includes("tw") ? deps : `${deps.trim()}, tw`;
    return `${head}${newBody}${tail}${newDeps}${end}`;
  });

  if (src !== original) {
    writeFileSync(file, src);
    console.log(`✅ ${base}`);
  }
}

console.log(`\n共包装 ${totalReturns} 处 memo 内文案`);
