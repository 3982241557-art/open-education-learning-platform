/* 验证错误提示「人话化」：原始技术错误 → 用户能懂的一句话 */
import { humanizeError } from "@/components/ai/ErrorNotice";

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${detail ? ` —— ${detail}` : ""}`);
  }
}

console.log("=== 各类原始错误 → 人话 ===");

const cases: [string, string, string[]][] = [
  [
    "LLMNotConfiguredError: DEEPSEEK_API_KEY not configured",
    "没配密钥",
    ["密钥", "设置"],
  ],
  [
    "Failed to fetch",
    "连不上后端",
    ["连不上后端"],
  ],
  [
    "Request timeout after 60s",
    "超时",
    ["等太久", "重试"],
  ],
  [
    "429 Too Many Requests / rate limit",
    "限流",
    ["请求太密集"],
  ],
  [
    "401 Unauthorized",
    "鉴权",
    ["身份没通过验证"],
  ],
  [
    "500 Internal Server Error",
    "服务端错误",
    ["服务端"],
  ],
  [
    "502 Bad Gateway",
    "网关错误",
    ["服务端"],
  ],
  [
    "模型请求失败：Connection reset by peer",
    "模型报错",
    ["模型这次没能正常回答"],
  ],
  [
    "TypeError: Cannot read properties of undefined (reading 'foo') at Object.<anonymous>",
    "未知异常",
    ["这次没能得到回答"],
  ],
];

for (const [raw, label, expect] of cases) {
  const out = humanizeError(raw);
  const hit = expect.some((e) => out.includes(e));
  check(
    `${label}：${raw.slice(0, 40).padEnd(42)} → ${out.slice(0, 24)}`,
    hit,
    `期望包含 ${expect.join(" 或 ")}`,
  );
}

console.log("\n=== 不泄露技术细节 ===");
const techy = humanizeError(
  "TypeError: Cannot read properties of undefined (reading 'notes') at ReaderContext.tsx:271:18",
);
check(
  "不出现 TypeError / 文件名 / 行号",
  !techy.includes("TypeError") &&
    !techy.includes(".tsx") &&
    !/\d+:\d+/.test(techy),
  techy,
);

console.log("\n=== 边界 ===");
check("空串给兜底文案", humanizeError("").length > 0);
check("纯空白给兜底文案", humanizeError("   ").length > 0);
check(
  "每种结果都不是空串",
  cases.every(([raw]) => humanizeError(raw).trim().length > 0),
);
check(
  "结果长度都小于原始长度的合理倍数（不甩堆栈）",
  cases.every(([raw]) => humanizeError(raw).length <= Math.max(60, raw.length)),
);

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
