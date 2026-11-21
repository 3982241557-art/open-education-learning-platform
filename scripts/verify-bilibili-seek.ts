/**
 * B 站精确跳转与伴随计时器的回归测试。
 *
 * 跑法：``npx tsx scripts/verify-bilibili-seek.ts``（或在 node 里
 * ``npx tsx`` 直接执行）。
 *
 * 为什么要有这个
 * --------------
 *
 * 「点击时间戳 → B 站播放器精准空降到那一秒」这条链路，跨了三个文件：
 *
 *   ``video-source.ts`` → 构造带 ``t=`` 的嵌入地址
 *   ``companion-timer.ts`` → 维护「进度影子」
 *   ``InteractiveVideoCanvas.tsx`` → 把两者接到 UI 上
 *
 * 中间任何一环写错了，都是「用户点了 03:20，画面没动」这种**只在
 * 真实浏览器里才暴露**的 bug。所以这里把纯逻辑抽出来做静态验证——
 * 它不需要浏览器，但能在 CI 里跑。
 */

import {
  buildBilibiliEmbedUrl,
  parseBilibiliStartTime,
  resolveVideo,
} from "../web/lib/video-source";
import {
  extractTimeAnchor,
} from "../web/lib/companion-timer";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n【一】B 站嵌入地址的构造\n");

const url = buildBilibiliEmbedUrl("BV1xx411c7mD", 200, { autoplay: true });
check(
  "bvid 在参数最前",
  url.startsWith("https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&"),
  url,
);
check("带 t=200", url.includes("&t=200"), url);
check("带 autoplay=1", url.includes("autoplay=1"), url);
check("高清开启", url.includes("high_quality=1"), url);
check("关闭弹幕", url.includes("danmaku=0"), url);
check("宽屏", url.includes("as_wide=1"), url);
check("可解析回起点", parseBilibiliStartTime(url) === 200, url);

const plain = buildBilibiliEmbedUrl("BV1xx411c7mD");
check("默认从 0 开始", plain.includes("&t=0"), plain);
check("默认不自动播放", !plain.includes("autoplay=1"), plain);

console.log("\n【二】秒数边界\n");
check("负数归零", buildBilibiliEmbedUrl("BV1", -5).includes("&t=0"));
check("小数截断", buildBilibiliEmbedUrl("BV1", 200.9).includes("&t=200"));
check("无参数解析为 0", parseBilibiliStartTime("https://x.com/a") === 0);

console.log("\n【三】源解析\n");

const bili = resolveVideo({ url: "https://www.bilibili.com/video/BV1xx411c7mD" });
check("识别为 iframe", bili.kind === "iframe", String(bili.kind));
check("带出 bvid", bili.bvid === "BV1xx411c7mD", String(bili.bvid));
check("带出 embed 地址", bili.embedUrl.includes("player.bilibili.com"), bili.embedUrl);

const yt = resolveVideo({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
check("YouTube 是 player 型", yt.kind === "player", String(yt.kind));
check("YouTube 无 bvid", !yt.bvid, String(yt.bvid));

const fallback = resolveVideo({
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  fallbackUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
});
check("备用源可解析", fallback.fallback?.kind === "iframe", String(fallback.fallback?.kind));

console.log("\n【四】AI 回答里的时间锚点\n");
check("03:20 → 200 秒", extractTimeAnchor("在 03:20 处讲到了") === 200);
check("1:02:03 → 3723 秒", extractTimeAnchor("大约 1:02:03 那里") === 3723);
check("12:34 → 754 秒", extractTimeAnchor("12:34") === 754);
check("无锚点返回 null", extractTimeAnchor("这里没有时间") === null);
check("不是时间的数字被排除", extractTimeAnchor("有 300 个例子") === null);

console.log(
  failures === 0
    ? "\n全部通过。\n"
    : `\n${failures} 项未通过。\n`,
);
process.exit(failures === 0 ? 0 : 1);
