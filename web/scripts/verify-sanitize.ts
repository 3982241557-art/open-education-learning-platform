/* 验证 AI 回复降噪：围栏 / 思考块 / 自言自语 / 实现层失败说明 */
import { sanitizeModelText, isNoiseOnly } from "@/lib/ai-sanitize";

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

console.log("=== 动作围栏 ===");
check(
  "完整围栏被删掉",
  sanitizeModelText("好的，我来标注。\n```action\n{\"action\":\"upsert_note\"}\n```\n希望有用。").trim() ===
    "好的，我来标注。\n\n希望有用。",
  JSON.stringify(sanitizeModelText("好的，我来标注。\n```action\n{\"action\":\"upsert_note\"}\n```\n希望有用。")),
);
check(
  "未闭合围栏（流式半截）也被删掉",
  !sanitizeModelText("先说一句\n```action\n{\"action\":\"upsert_no").includes("upsert_no"),
);
check(
  "tool 围栏也被删掉",
  !sanitizeModelText("```tool\n{\"name\":\"search\"}\n```").includes("search"),
);

console.log("\n=== 思考块 ===");
check(
  "<think> 块被删掉",
  !sanitizeModelText("<think>让我先看看原文</think>这是答案。").includes("让我先看看"),
);
check(
  "答案保留",
  sanitizeModelText("<think>让我先看看原文</think>这是答案。").includes("这是答案"),
);

console.log("\n=== 自言自语 ===");
check(
  "「正在调用XX工具」被删",
  !sanitizeModelText("正在调用检索工具查询原文。\n高阶函数很重要。").includes("调用检索工具"),
);
check(
  "「让我先……」被删",
  !sanitizeModelText("让我先看看这一页讲了什么。\n它讲的是闭包。").includes("让我先"),
);
check(
  "「正在分析……」被删",
  !sanitizeModelText("正在分析用户意图。\n答案是 42。").includes("正在分析"),
);

console.log("\n=== 实现层失败说明 ===");
check(
  "「我拿不到原文」被删",
  !sanitizeModelText("我拿不到原文。\n不过我可以讲讲一般概念。").includes("拿不到原文"),
);
check(
  "「上下文里没有」被删",
  !sanitizeModelText("上下文里没有这块内容。\n我先讲通用的部分。").includes("上下文里"),
);
check(
  "「course_context 缺少」被删",
  !sanitizeModelText("course_context 缺少对应 block。\n替代答案如下。").includes("course_context"),
);

console.log("\n=== 边界 ===");
check("空串返回空串", sanitizeModelText("") === "");
check(
  "纯噪声被识别为 noise-only",
  isNoiseOnly("```action\n{}\n```"),
);
check(
  "有正文不算 noise-only",
  !isNoiseOnly("这是真正的答案。"),
);
check(
  "正常内容不被误伤",
  sanitizeModelText("闭包是指能捕获词法作用域的函数。").includes("闭包"),
);

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) process.exit(1);
