#!/usr/bin/env node
/**
 * 规范化题库文件的键名。
 *
 * 中文知识点名里含有 `、` `（）` `/` 等字符，直接写成对象字面量的键
 * 会踩到 JavaScript 的标识符规则。这里统一把它们加引号。
 *
 * 用法：node scripts/normalize-bank-keys.mjs <file...>
 */

import fs from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("用法：node scripts/normalize-bank-keys.mjs <file...>");
  process.exit(1);
}

const BARE_KEY = /^(\s{2})([^\s"'`][^:]*?): \{$/;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split("\n");
  let changed = 0;

  const output = lines.map((line) => {
    const match = BARE_KEY.exec(line);
    if (!match) return line;
    const [, indent, key] = match;
    // 已经带引号或本身就是合法标识符的键，保持原样。
    if (/^["'`]/.test(key)) return line;
    changed += 1;
    return `${indent}"${key}": {`;
  });

  if (changed > 0) {
    fs.writeFileSync(file, output.join("\n"));
  }
  console.log(`${file}：规范化 ${changed} 个键`);
}
