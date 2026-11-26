/**
 * 为工作区页面补上 zh-TW（繁体）渲染。
 *
 * 与 :file:`scripts/apply-zhtw-to-labs.mjs` 同源，但目标不同：
 * 这里处理的是 **页面级** 文件——它们的 ``isEn`` 声明方式各不相同，
 * 所以用**打标记**的方式定位插入点：
 *
 * 1. 把 ``isEn ? A : B`` 中的中文分支 B 包上 ``tw(B)``；
 * 2. 在 ``const isEn = locale === "en";`` 之后插入 ``const tw = useTraditional();``；
 * 3. 补上 import。
 *
 * ⛔ 组件式文件（``MapNodeCard.tsx``）的 ``isEn`` 是 **props**，
 *    不是 ``const isEn = locale === "en";``——单独处理。
 */
import { readFileSync, writeFileSync } from "node:fs";

const LITERAL = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)';

const TARGETS = [
  "web/app/(workspace)/map/page.tsx",
  "web/app/(workspace)/editorial-home.tsx",
  "web/app/(workspace)/report/page.tsx",
];

const ROOT = new URL("../", import.meta.url).pathname;

/** 把中文分支包上 tw()。 */
function wrapTernaries(src) {
  const pat = new RegExp(
    "(isEn\\s*\\?\\s*" + LITERAL + "\\s*:\\s*)(" + LITERAL + ")",
    "gs",
  );
  return src.replace(pat, (_m, head, zh) => {
    if (zh.includes("tw(")) return _m;
    return `${head}tw(${zh})`;
  });
}

/** 插入 import + tw() 声明。 */
function addImportAndHook(src) {
  if (!src.includes("useTraditional")) {
    const importLine = `import { useTraditional } from "@/lib/use-bilingual";`;
    const importMatches = [...src.matchAll(/^import .*?;$/gms)];
    if (importMatches.length > 0) {
      const last = importMatches[importMatches.length - 1];
      const end = last.index + last[0].length;
      src = `${src.slice(0, end)}\n${importLine}\n${src.slice(end)}`;
    } else {
      src = `${importLine}\n${src}`;
    }
  }

  if (!/const tw = useTraditional\(\)/.test(src)) {
    const declRe = /(const isEn = locale === "en";)/;
    const m = src.match(declRe);
    if (m) {
      const at = m.index + m[0].length;
      src = `${src.slice(0, at)}\n  const tw = useTraditional();${src.slice(at)}`;
    } else {
      console.warn("  ⚠️  找不到 `const isEn = locale === \"en\";` 声明");
    }
  }
  return src;
}

for (const rel of TARGETS) {
  const path = ROOT + rel;
  let src = readFileSync(path, "utf8");
  const original = src;
  src = wrapTernaries(src);
  src = addImportAndHook(src);
  if (src !== original) {
    writeFileSync(path, src);
    console.log(`✅ ${rel}`);
  } else {
    console.log(`—  ${rel} 无变化`);
  }
}
