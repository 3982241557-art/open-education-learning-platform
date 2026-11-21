/**
 * 视频源解析的单元测试。
 *
 * 跑法（需要先 ``npm i``）：
 *
 * .. code-block:: bash
 *
 *     npx tsx scripts/test-video-source.ts
 *     # 或者用 node --experimental-strip-types
 *
 * 覆盖的重点是**播放器参数**——那是最容易悄悄失效的部分：
 * 平台改了一个参数名、或者 merge 的逻辑写反了，都不会有任何编译
 * 错误，只会在用户面前表现为「视频里全是弹幕」或者「播完跳出
 * 一堆推荐视频」。
 */

import {
  buildBilibiliEmbedUrl,
  buildYoutubePlayerConfig,
  parseBilibiliId,
  parseYouTubeId,
  resolveVideo,
  resolveVideoUrl,
} from "../web/lib/video-source";

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string, detail = "") {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("视频源解析测试\n");

// ── ID 解析 ───────────────────────────────────────────────────────────
check(parseYouTubeId("https://www.youtube.com/watch?v=8mAITcNt710") === "8mAITcNt710", "解析 YouTube watch URL");
check(parseYouTubeId("https://youtu.be/vo4pMVb0R6M") === "vo4pMVb0R6M", "解析 youtu.be 短链");
check(parseYouTubeId("https://www.youtube.com/embed/abc123XYZ") === "abc123XYZ", "解析 embed URL");
check(parseYouTubeId("https://example.com/x") === null, "非 YouTube 返回 null");
check(parseBilibiliId("https://www.bilibili.com/video/BV1hx411G71P") === "BV1hx411G71P", "解析 B 站 video URL");
check(parseBilibiliId("https://player.bilibili.com/player.html?bvid=BV1xx411G71P") === "BV1xx411G71P", "解析 B 站 player URL");
check(parseBilibiliId("https://example.com") === null, "非 B 站返回 null");

// ── YouTube 干净模式 ──────────────────────────────────────────────────
const yt = resolveVideoUrl("https://www.youtube.com/watch?v=8mAITcNt710");
check(yt !== null, "YouTube 解析成功");
check(yt?.kind === "player", "YouTube 走 react-player");
check(yt?.provider === "YouTube", "YouTube provider 正确");
const ytVars = yt?.playerConfig?.youtube?.playerVars ?? {};
check(ytVars.rel === 0, "YouTube 关闭相关视频推荐 (rel=0)");
check(ytVars.controls === 1, "YouTube 保留播放控件 (controls=1)");
check(ytVars.playsinline === 1, "YouTube 内联播放 (playsinline=1)");
check(ytVars.modestbranding === 1, "YouTube modestbranding 已写入（已废弃但保留兼容）");
check(ytVars.showinfo === 1, "YouTube showinfo 已写入（已废弃但保留兼容）");
check(ytVars.autoplay === 0, "YouTube 不自动播放");
check(
  yt?.playerConfig?.youtube?.embedOptions?.width === "100%",
  "YouTube embedOptions 宽度自适应",
);

// ── B 站嵌入参数 ──────────────────────────────────────────────────────
const bili = resolveVideoUrl("https://www.bilibili.com/video/BV1hx411G71P");
check(bili !== null, "B 站解析成功");
check(bili?.kind === "iframe", "B 站走 iframe 嵌入");
check(bili?.provider === "哔哩哔哩", "B 站 provider 正确");
const embed = bili?.embedUrl ?? "";
check(embed.startsWith("https://player.bilibili.com/player.html?"), "B 站用官方 embed 域名");
check(embed.includes("bvid=BV1hx411G71P"), "B 站带 bvid 参数");
check(embed.includes("high_quality=1"), "B 站强制高清 (high_quality=1)");
check(embed.includes("danmaku=0"), "B 站关闭弹幕 (danmaku=0)");
check(embed.includes("as_wide=1"), "B 站宽屏适配 (as_wide=1)");
check(embed.includes("autoplay=0"), "B 站不自动播放");
check(embed.includes("t=0"), "B 站从 0 秒开始");

// 直接测构造函数
const manual = buildBilibiliEmbedUrl("BV1abcdefghij");
check(manual.includes("bvid=BV1abcdefghij"), "buildBilibiliEmbedUrl 带 bvid");
check(manual.includes("danmaku=0"), "buildBilibiliEmbedUrl 关弹幕");

// ── 直链媒体 ──────────────────────────────────────────────────────────
const mp4 = resolveVideoUrl("https://example.com/lecture.mp4");
check(mp4?.kind === "player", "直链 mp4 走 react-player");
check(mp4?.embedUrl === "https://example.com/lecture.mp4", "直链 embedUrl 等于原地址");

// ── 未知来源 ──────────────────────────────────────────────────────────
const unknown = resolveVideoUrl("https://example.com/some/page");
check(unknown?.kind === "iframe", "未知来源退回 iframe");
check(resolveVideoUrl("not-a-url") === null, "非 URL 返回 null");

// ── resolveVideo（从载荷解析） ───────────────────────────────────────
const fromPayload = resolveVideo({
  url: "https://www.youtube.com/watch?v=vo4pMVb0R6M",
  title: "CrashCourse",
  meta: { duration: 654 },
});
check(fromPayload?.duration === 654, "从 meta.duration 取时长");
const fromPayloadStr = resolveVideo({
  url: "https://www.youtube.com/watch?v=vo4pMVb0R6M",
  meta: { duration: "10:54" },
});
check(fromPayloadStr?.duration === 654, "从 mm:ss 字符串解析时长");

// 空载荷
check(resolveVideo({}) === null, "空载荷返回 null");

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
console.log("=".repeat(60));
process.exit(failed === 0 ? 0 : 1);
