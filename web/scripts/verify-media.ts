/**
 * 模块二验证：视频源解析 + 知识节点解析 + 动作分发。
 *
 * 跑法：``npx tsx scripts/verify-media.ts``（或在 ``npm run verify`` 里）。
 *
 * 这些是**纯函数**，不需要浏览器——所以能塞进 CI 里跑。
 */

import assert from "node:assert/strict";

import {
  resolveVideo,
  resolveVideoUrl,
  resolveCaptions,
  parseYouTubeId,
  parseBilibiliId,
  parseTimeString,
  extractIframeSrc,
  extractIframeTitle,
} from "@/lib/video-source";

import {
  parseConcepts,
  extractSentence,
  stripConceptMarkers,
} from "@/components/learning/ConceptNode";

import {
  buildConceptPrompt,
  formatTimestamp,
} from "@/lib/concept-actions";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(
      `    ${(error as Error).message.split("\n").slice(0, 6).join("\n    ")}`,
    );
  }
}

console.log("\n① 视频 URL 解析");

check("YouTube watch URL", () => {
  assert.equal(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

check("YouTube youtu.be 短链", () => {
  assert.equal(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

check("YouTube embed URL", () => {
  assert.equal(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

check("YouTube 带额外参数的 watch URL", () => {
  assert.equal(
    parseYouTubeId("https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=30"),
    "dQw4w9WgXcQ",
  );
});

check("Bilibili 视频页 URL", () => {
  assert.equal(
    parseBilibiliId("https://www.bilibili.com/video/BV1xx411c7mD"),
    "BV1xx411c7mD",
  );
});

check("Bilibili 播放器 URL", () => {
  assert.equal(
    parseBilibiliId("https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&aid=1"),
    "BV1xx411c7mD",
  );
});

check("非视频 URL 不误判为 YouTube", () => {
  assert.equal(parseYouTubeId("https://example.com/lecture.mp4"), null);
});

check("直链 mp4 走 player 通道", () => {
  const video = resolveVideoUrl("https://example.com/lecture.mp4");
  assert.ok(video);
  assert.equal(video.kind, "player");
  assert.equal(video.provider, "直链");
});

check("YouTube 走 player 通道", () => {
  const video = resolveVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.ok(video);
  assert.equal(video.kind, "player");
  assert.equal(video.provider, "YouTube");
});

check("Bilibili 走 iframe 通道（react-player 不支持）", () => {
  const video = resolveVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD");
  assert.ok(video);
  assert.equal(video.kind, "iframe");
  assert.ok(video.embedUrl?.includes("player.bilibili.com"));
  assert.ok(video.embedUrl?.includes("BV1xx411c7mD"));
});

check("未知外链退化为 iframe", () => {
  const video = resolveVideoUrl("https://some-unknown-site.com/watch/abc");
  assert.ok(video);
  assert.equal(video.kind, "iframe");
});

check("非 URL 字符串解析失败", () => {
  assert.equal(resolveVideoUrl("这不是一个链接"), null);
});

check("协议相对地址补全为 https", () => {
  const video = resolveVideoUrl("//www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.ok(video);
  assert.equal(video.kind, "player");
});

console.log("\n② iframe 字符串抽取");

check("抽出 iframe 的 src", () => {
  const html =
    '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560"></iframe>';
  assert.equal(
    extractIframeSrc(html),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
});

check("抽出 iframe 的 title", () => {
  const html =
    '<iframe src="https://x.com/a" title="第 3 讲 · 闭包"></iframe>';
  assert.equal(extractIframeTitle(html), "第 3 讲 · 闭包");
});

check("从 iframe 载荷里解析出视频", () => {
  const video = resolveVideo({
    iframe: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
  });
  assert.ok(video);
  assert.equal(video.kind, "player");
});

check("embed_url 字段也能解析", () => {
  const video = resolveVideo({
    embed_url: "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD",
  });
  assert.ok(video);
  assert.equal(video.kind, "iframe");
});

check("没有任何视频字段时返回 null", () => {
  assert.equal(resolveVideo({ body: "只是一段文字" }), null);
});

console.log("\n③ 字幕节点解析");

check("秒数格式的字幕", () => {
  const captions = resolveCaptions({
    captions: [
      { start: 12.5, text: "闭包记住了它的出生地" },
      { start: 45, text: "高阶函数的组合" },
    ],
  });
  assert.equal(captions.length, 2);
  assert.equal(captions[0].text, "闭包记住了它的出生地");
  assert.equal(captions[0].start, 12.5);
});

check("字符串时间戳的字幕", () => {
  const captions = resolveCaptions({
    transcript: [{ time: "00:12", text: "第一条" }],
  });
  assert.equal(captions.length, 1);
  assert.equal(captions[0].start, 12);
});

check("字幕按时间排序", () => {
  const captions = resolveCaptions({
    captions: [
      { start: 30, text: "后" },
      { start: 10, text: "前" },
    ],
  });
  assert.equal(captions[0].text, "前");
});

check("缺时间的字幕被跳过", () => {
  const captions = resolveCaptions({
    captions: [{ text: "没有时间" }, { start: 5, text: "有时间" }],
  });
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, "有时间");
});

check("空文本的字幕被跳过", () => {
  const captions = resolveCaptions({
    captions: [{ start: 5, text: "   " }],
  });
  assert.equal(captions.length, 0);
});

check("没有字幕字段时返回空数组", () => {
  assert.deepEqual(resolveCaptions({}), []);
});

check("时间字符串解析", () => {
  assert.equal(parseTimeString("01:30"), 90);
  assert.equal(parseTimeString("00:00:45"), 45);
  assert.equal(parseTimeString("12"), 12);
  assert.equal(parseTimeString("12.5"), 12.5);
  assert.equal(parseTimeString("乱码"), null);
});

console.log("\n④ 知识节点解析");

check("解析 [[词条]]", () => {
  const parts = parseConcepts("在 Scheme 里，[[闭包]] 是一种函数。");
  assert.equal(parts.length, 3);
  assert.equal(typeof parts[0], "string");
  assert.deepEqual(parts[1], { term: "闭包" });
});

check("解析 [[词条|释义]]", () => {
  const parts = parseConcepts("[[闭包|一种记住了出生地的函数]] 很关键。");
  // 节点在句首 → 前面没有空文本，所以是「节点 + 尾巴」两段。
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0], {
    term: "闭包",
    hint: "一种记住了出生地的函数",
  });
  assert.equal(parts[1], " 很关键。");
});

check("一段文字里多个节点", () => {
  const parts = parseConcepts("[[闭包]] 和 [[高阶函数]] 都是概念。");
  const nodes = parts.filter((p) => typeof p !== "string");
  assert.equal(nodes.length, 2);
});

check("没有双括号时原样返回", () => {
  const parts = parseConcepts("普通的一段文字");
  assert.equal(parts.length, 1);
  assert.equal(parts[0], "普通的一段文字");
});

check("空括号不算节点", () => {
  const parts = parseConcepts("这里有 [[]] 和文字");
  const nodes = parts.filter((p) => typeof p !== "string");
  assert.equal(nodes.length, 0);
});

check("重复解析结果一致（正则 lastIndex 不残留）", () => {
  const source = "[[闭包]] 很重要。";
  const first = parseConcepts(source);
  const second = parseConcepts(source);
  assert.deepEqual(first, second);
  // 节点在句首 → 「节点 + 尾巴」两段。
  assert.equal(first.length, 2);
  assert.deepEqual(first[0], { term: "闭包" });
});

check("含双括号时才走解析分支", () => {
  // 没有 ``[[`` 时原样返回——早退路径也要稳定。
  const plain = "普通的一段文字";
  assert.deepEqual(parseConcepts(plain), [plain]);
});

check("同一段文本里连续解析多次都得到同一结果", () => {
  // 这条专门防 ``lastIndex`` 残留——带 ``g`` 标志的正则复用时，
  // ``lastIndex`` 不会自动归零，第二次解析就会返回空数组。
  const source = "第一个 [[闭包]] 和第二个 [[高阶函数]]。";
  const a = parseConcepts(source);
  const b = parseConcepts(source);
  const c = parseConcepts(source);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  const nodes = a.filter((p) => typeof p !== "string");
  assert.equal(nodes.length, 2);
});

console.log("\n⑤ 上下文句子抽取");

check("抽取词条所在的中文句子", () => {
  const text = "在 Scheme 里，闭包是一种函数。map 是高阶函数。";
  const sentence = extractSentence(text, "闭包");
  assert.equal(sentence, "在 Scheme 里，闭包是一种函数。");
});

check("抽取词条所在的英文句子", () => {
  const text = "A closure remembers its birthplace. Map is higher-order.";
  const sentence = extractSentence(text, "closure");
  assert.equal(sentence, "A closure remembers its birthplace.");
});

check("超长句子被截断", () => {
  const long = `${"字".repeat(500)}。`;
  const sentence = extractSentence(long, "字");
  assert.ok(sentence.length <= 300);
});

check("找不到词条时返回空串", () => {
  assert.equal(extractSentence("完全无关的文本", "闭包"), "");
});

check("上下文句子里的标记被剥离", () => {
  // 这条防的是：模型收到「一个随身携带其定义环境的过程就是一个[[闭包]]。」
  // 这种带方括号的原文，只会把 [[ 当成正文的一部分来解读。
  const text = "一个随身携带其定义环境的过程就是一个[[闭包]]。";
  const sentence = extractSentence(text, "闭包");
  assert.ok(!sentence.includes("[["));
  assert.ok(!sentence.includes("]]"));
  assert.ok(sentence.includes("闭包"));
  assert.equal(sentence, "一个随身携带其定义环境的过程就是一个闭包。");
});

console.log("\n⑤ 标记剥离");

check("剥离普通标记", () => {
  assert.equal(
    stripConceptMarkers("一个[[闭包]]。"),
    "一个闭包。",
  );
});

check("剥离带释义的标记", () => {
  assert.equal(
    stripConceptMarkers("[[闭包|一种记住了出生地的函数]] 很重要"),
    "闭包 很重要",
  );
});

check("没有标记时原样返回", () => {
  assert.equal(stripConceptMarkers("普通文字"), "普通文字");
});

console.log("\n⑥ 动作分发：提示词组装");

check("基础提示词包含词条", () => {
  const prompt = buildConceptPrompt("闭包");
  assert.ok(prompt.includes("闭包"));
  assert.ok(prompt.includes("白话"));
});

check("带上下文时提示词包含原句", () => {
  const prompt = buildConceptPrompt("闭包", "闭包是一种函数。");
  assert.ok(prompt.includes("闭包是一种函数。"));
});

check("带时间戳时提示词包含时间", () => {
  const prompt = buildConceptPrompt("闭包", undefined, "12:34");
  assert.ok(prompt.includes("12:34"));
});

check("时间戳格式化", () => {
  assert.equal(formatTimestamp(12), "00:12");
  assert.equal(formatTimestamp(90), "01:30");
  assert.equal(formatTimestamp(3661), "1:01:01");
  assert.equal(formatTimestamp(-5), "00:00");
});

console.log(`\n${passed} 通过 / ${failed} 失败\n`);
if (failed > 0) process.exit(1);
