#!/usr/bin/env node
/**
 * 分集拆解器
 * ==========
 *
 * 把「一条超长视频」升级成「一个可逐集学习的系列」。
 *
 * 三级策略（按优先级）
 * -------------------
 *
 * 1. **原生分 P**（B 站）—— 调用官方 ``view`` 接口读 ``pages`` 数组，
 *    拆成真实独立分集，播放地址是 ``?bvid=...&p=N``。
 * 2. **官方播放列表**（YouTube）—— 匹配该视频所属的官方 Playlist，
 *    按列表顺序拆成独立分集。
 * 3. **时间轴切片兜底** —— 原源确实只有一条超长合集（比如 CS50 的
 *    24 小时整条），则按官方章节时间点切分成独立分集，播放时自动
 *    定位到 ``[start_time, end_time]`` 区间。
 *
 * 为什么需要它
 * ------------
 *
 * 「先猜后看」诊断卡、「学完本集」闭环，全都建立在**集**这个粒度上。
 * 一条 24 小时的视频没法诊断、没法检测、没法庆祝——用户学到 30% 时
 * 你根本不知道他「学完了哪一讲」。
 *
 * 用法
 * ----
 *
 * ```bash
 * # 只看会拆成什么，不写文件
 * node scripts/split-episodes.mjs --dry-run
 *
 * # 全量拆分并写回 hub 数据
 * node scripts/split-episodes.mjs --apply
 *
 * # 只处理某门课
 * node scripts/split-episodes.mjs --apply --only res_cs50
 * ```
 *
 * 网络说明
 * --------
 *
 * * B 站 ``view`` 接口在部分网络环境下会被风控拦截——脚本会**跳过**
 *   该资源并保留原状，不会写坏数据；
 * * YouTube 走 Innertube（匿名可用），章节从视频简介里的
 *   ``(HH:MM:SS) 标题`` 列表解析。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HUB_PATH = path.join(ROOT, "backend", "data", "global_resource_hub.json");

/** Innertube 公钥（匿名可用）。 */
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 命令行参数。 */
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const APPLY = args.includes("--apply");
const ONLY = (() => {
  const index = args.indexOf("--only");
  return index >= 0 ? args[index + 1] : "";
})();

/**
 * 一集。
 *
 * 这个形状会写进 ``global_resource_hub.json``，所以字段名要**稳定**
 * ——前端与后端都按它读。
 */
function makeEpisode(source) {
  return {
    ep_id: source.ep_id,
    title: source.title,
    /** 分集在系列里的序号（从 1 开始）。 */
    index: source.index,
    /** 总集数。 */
    total: source.total,
    /** 独立视频地址（B 站分 P 时是 ``?bvid=...&p=N``）。 */
    video_url: source.video_url ?? "",
    /** B 站 bvid。 */
    bvid: source.bvid ?? "",
    /** B 站分 P 页码（1 开始）。 */
    page: source.page ?? null,
    /** YouTube video id。 */
    youtube_id: source.youtube_id ?? "",
    /** 本集时长（秒）。 */
    duration: source.duration ?? 0,
    /** 本集在原视频里的起点（秒）——时间轴切片时用。 */
    start_time: source.start_time ?? 0,
    /** 本集在原视频里的终点（秒）——时间轴切片时用。 */
    end_time: source.end_time ?? null,
    /** 本集的核心概念（用于诊断题）。 */
    key_concepts: source.key_concepts ?? [],
    /** 拆分方式：`pages` / `playlist` / `chapters` / `single`。 */
    origin: source.origin ?? "single",
  };
}

// ── B 站 ────────────────────────────────────────────────────────────

/** 从 B 站 URL 里取 bvid。 */
function parseBvid(url) {
  const match = String(url ?? "").match(/\/video\/(BV[a-zA-Z0-9]+)/);
  return match ? match[1] : "";
}

/**
 * 调 B 站 ``view`` 接口，读分 P 列表。
 *
 * ⚠️ 这个接口在很多网络环境下会返回风控页（HTML）。所以这里**先看
 *    Content-Type**——不是 JSON 就直接放弃，不做任何解析。
 */
async function fetchBilibiliPages(bvid) {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Referer: "https://www.bilibili.com/",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;

    const payload = await response.json();
    if (payload.code !== 0) return null;

    const pages = payload?.data?.pages;
    if (!Array.isArray(pages) || pages.length < 2) return null;

    return pages.map((page) => ({
      page: Number(page.page) || 1,
      title: String(page.part ?? "").trim(),
      duration: Number(page.duration) || 0,
    }));
  } catch {
    return null;
  }
}

// ── YouTube ────────────────────────────────────────────────────────

/** 从 YouTube URL 里取 video id。 */
function parseYoutubeId(url) {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = String(url ?? "").match(pattern);
    if (match) return match[1];
  }
  return "";
}

/** 调 Innertube 的 ``player`` 接口，取视频详情。 */
async function fetchYoutubePlayer(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          context: {
            client: { clientName: "WEB", clientVersion: "2.20240101.00.00" },
          },
          videoId,
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** 把 ``(01:45:08)`` 或 ``(12:34)`` 解析成秒。 */
function parseTimestamp(raw) {
  const parts = String(raw ?? "")
    .trim()
    .replace(/^\(|\)$/g, "")
    .split(":")
    .map((item) => Number(item) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

/**
 * 从视频页面里挖出**官方播放列表**的 id。
 *
 * YouTube 的 ``player`` 接口不返回 playlist——但 watch 页面里嵌了
 * 一个 ``PL...`` 开头的 id（通常就是该视频所属的官方系列）。
 *
 * 这里用正则从页面 HTML 里捞，是最省事也最稳的做法（Innertube 的
 * ``next`` 接口需要额外的 visitorData 上下文，脆得多）。
 */
function findPlaylistIds(html) {
  const ids = new Set();
  // 只认**真正的** playlist id——``PL`` + 32 位字母数字 + ``_`` 收尾。
  for (const match of html.matchAll(/PL[a-zA-Z0-9_-]{30,44}/g)) {
    const id = match[0];
    // 排除明显的常量前缀（``PLAYER_CONTEXT_CONFIG_ID_...``）。
    if (id.startsWith("PLAYER_")) continue;
    ids.add(id);
  }
  return [...ids];
}

/** 调 Innertube 的 ``browse`` 接口，取播放列表内容。 */
async function fetchYoutubePlaylist(playlistId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          // ⚠️ 这一行**不能省**。少了它，YouTube 会按地区返回
          //    不同的响应（有时是空的 consent 页），条目就抓不到了。
          "Accept-Language": "en-US,en;q=0.9",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240101.00.00",
              hl: "en",
              gl: "US",
            },
          },
          browseId: `VL${playlistId}`,
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 从播放列表响应里抽出视频条目。
 *
 * 形状在不同版本的响应里略有差别，所以这里做**宽松**匹配——
 * 找到任何带 ``videoId`` 的渲染器都算。
 *
 * ⚠️ 标题的提取顺序很重要：``title`` 字段在两种形状里含义不同——
 *    一是「视频标题」，二是「播放列表标题」。所以优先取
 *    ``playlistVideoRenderer`` 里的 ``title``，再退回
 *    ``videoRenderer``，最后才用缩略图旁的文本。
 */
function extractPlaylistItems(payload) {
  const items = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const videoId = node.videoId;
    if (typeof videoId === "string" && /^[\w-]{11}$/.test(videoId)) {
      // 各种可能的标题位置。
      const title =
        firstText(node.title) ??
        firstText(node.headline) ??
        firstText(node.longBylineText) ??
        firstText(node.shortBylineText) ??
        firstText(node.videoTitle) ??
        "";

      // ⚠️ 没有标题 → 不是条目节点。
      //
      // YouTube 响应里有大量命令对象内嵌 ``videoId``（比如
      // ``addToPlaylistCommand.videoId``），它们的标题是空的。
      // 不挡掉的话，这些空条目会占住位置，把真正的条目挤掉。
      if (!title) {
        for (const value of Object.values(node)) walk(value);
        return;
      }

      const duration =
        Number(node.lengthSeconds ?? 0) ||
        parseClock(node.lengthText?.simpleText ?? "") ||
        0;

      if (!items.some((item) => item.youtube_id === videoId)) {
        items.push({
          youtube_id: videoId,
          title: String(title).trim(),
          duration,
        });
      }
    }

    // ── 新版 lockupViewModel ──
    //
    // YouTube 现在把播放列表条目换成了 ``lockupViewModel``：
    // videoId 藏在 ``contentId`` 里，标题藏在
    // ``metadata.lockupMetadataViewModel.title.content``。
    //
    // ⚠️ 这里检查的是**节点自身**的 ``contentId``——不是父节点的
    //    ``lockupViewModel`` 键。遍历时我们已经**走进了**那个对象
    //    内部，所以要读它自己的字段。
    //
    // 两套形状都要支持——YouTube 会按实验分组灰度给不同用户。
    if (
      typeof node.contentId === "string" &&
      /^[\w-]{11}$/.test(node.contentId)
    ) {
      const meta = node.metadata?.lockupMetadataViewModel;
      const title = meta?.title?.content ?? meta?.title?.simpleText ?? "";
      const badge =
        node.contentImage?.thumbnailViewModel?.overlays?.[0]
          ?.thumbnailBottomOverlayViewModel?.badges?.[0]
          ?.thumbnailBadgeViewModel?.text ?? "";
      if (!items.some((item) => item.youtube_id === node.contentId)) {
        items.push({
          youtube_id: node.contentId,
          title: String(title).trim(),
          duration: parseClock(badge),
        });
      }
    }

    for (const value of Object.values(node)) walk(value);
  };
  walk(payload);
  return items;
}

/** 从「runs」或「simpleText」形态的文本节点里取字符串。 */
function firstText(node) {
  if (!node) return undefined;
  if (typeof node.simpleText === "string") return node.simpleText;
  if (Array.isArray(node.runs)) {
    const joined = node.runs
      .map((run) => run?.text ?? "")
      .join("")
      .trim();
    if (joined) return joined;
  }
  return undefined;
}

/** ``"12:34"`` / ``"1:02:03"`` → 秒。 */
function parseClock(raw) {
  const parts = String(raw ?? "")
    .trim()
    .split(":")
    .map((item) => Number(item) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

/**
 * 从视频简介里解析章节表。
 *
 * 官方课程的简介几乎都会列章节：
 *
 * .. code-block:: text
 *
 *     ⌨️ (00:00:00) Lecture 0 - Scratch
 *     ⌨️ (01:45:08) Lecture 1 - C
 *
 * 这是**官方自己给的**切分点——比任何自动算法都准。
 */
function parseChapters(description) {
  const text = String(description ?? "");
  const pattern = /[（(]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[)）]\s*([^\n（(]{2,80})/g;
  const chapters = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const start = parseTimestamp(match[1]);
    const title = match[2].trim().replace(/^[⌨️📖🎥✏️\s]+/, "");
    if (Number.isFinite(start) && title) chapters.push({ start, title });
  }
  // 至少要有 2 个切分点才算「有章节」——只有一个说明是误匹配。
  return chapters.length >= 2 ? chapters : [];
}

/**
 * 从章节时间点切分成独立分集。
 *
 * 每集的 ``end_time`` 是**下一集的起点**——这样播放到区间末尾就
 * 停，天然形成「一讲结束」的边界。
 */
function chaptersToEpisodes(chapters, totalDuration, videoUrl, youtubeId) {
  const usable = chapters.filter((chapter) => chapter.start < totalDuration);
  if (usable.length < 2) return [];

  return usable.map((chapter, index) => {
    const next = usable[index + 1];
    const end = next ? next.start : totalDuration;
    return makeEpisode({
      ep_id: `ch${String(index + 1).padStart(2, "0")}`,
      title: chapter.title,
      index: index + 1,
      total: usable.length,
      video_url: videoUrl,
      youtube_id: youtubeId,
      duration: Math.max(0, end - chapter.start),
      start_time: chapter.start,
      end_time: end,
      origin: "chapters",
    });
  });
}

// ── 主流程 ──────────────────────────────────────────────────────────

/**
 * 给一条资源生成分集列表。
 *
 * 返回 ``null`` 表示「维持原状」——不拆分。
 */
async function buildEpisodes(resource) {
  const url = resource.url ?? "";
  const bvid = parseBvid(url);
  const youtubeId = parseYoutubeId(url);

  // ── ① B 站原生分 P ──
  if (bvid) {
    const pages = await fetchBilibiliPages(bvid);
    if (pages && pages.length >= 2) {
      return {
        origin: "pages",
        episodes: pages.map((page, index) =>
          makeEpisode({
            ep_id: `p${page.page}`,
            title: page.title || `第 ${page.page} P`,
            index: index + 1,
            total: pages.length,
            video_url: `https://www.bilibili.com/video/${bvid}?p=${page.page}`,
            bvid,
            page: page.page,
            duration: page.duration,
            origin: "pages",
          }),
        ),
      };
    }
  }

  // ── ② YouTube 官方播放列表 ──
  //
  // 优先找**官方系列播放列表**——它的每一集都是一条独立视频，
  // 播放体验最好（不用在一条 24 小时视频里跳来跳去）。
  if (youtubeId) {
    const playlist = await fetchYoutubePlaylistFor(youtubeId);
    if (playlist && playlist.length >= 2) {
      return {
        origin: "playlist",
        episodes: playlist.map((item, index) =>
          makeEpisode({
            ep_id: `v${item.youtube_id}`,
            title: item.title || `第 ${index + 1} 讲`,
            index: index + 1,
            total: playlist.length,
            video_url: `https://www.youtube.com/watch?v=${item.youtube_id}`,
            youtube_id: item.youtube_id,
            duration: item.duration,
            origin: "playlist",
          }),
        ),
      };
    }
  }

  // ── ③ YouTube 官方章节（时间轴切片兜底）──
  if (youtubeId) {
    const player = await fetchYoutubePlayer(youtubeId);
    const description = player?.videoDetails?.shortDescription ?? "";
    const totalDuration = Number(player?.videoDetails?.lengthSeconds) || 0;
    const chapters = parseChapters(description);
    const episodes = chaptersToEpisodes(
      chapters,
      totalDuration,
      url,
      youtubeId,
    );
    if (episodes.length >= 2) {
      return { origin: "chapters", episodes };
    }
  }

  // ── ④ 维持原状 ──
  return null;
}

/**
 * 找到这条视频所属的官方播放列表。
 *
 * 流程：抓 watch 页面 → 挖出候选 playlistId → 逐个调 ``browse``
 * → 取第一个**包含当前视频**的列表。
 *
 * 「包含当前视频」这个校验很重要——页面上可能有推荐列表、
 * 自动混搭列表，那些不是「这门课的官方分集」。
 */
async function fetchYoutubePlaylistFor(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!response.ok) return null;
    const html = await response.text();

    for (const playlistId of findPlaylistIds(html).slice(0, 6)) {
      const payload = await fetchYoutubePlaylist(playlistId);
      if (!payload) continue;
      const items = extractPlaylistItems(payload);
      // 必须包含当前视频——否则不是这门课的官方分集。
      if (items.length < 2) continue;
      if (!items.some((item) => item.youtube_id === videoId)) continue;
      return items;
    }
    return null;
  } catch {
    return null;
  }
}

/** 主流程。 */
async function main() {
  if (!fs.existsSync(HUB_PATH)) {
    console.error(`❌ 找不到 ${HUB_PATH}`);
    process.exitCode = 1;
    return;
  }

  const raw = fs.readFileSync(HUB_PATH, "utf8");
  const payload = JSON.parse(raw);
  const hub = payload.hub ?? payload;

  const resources = [];
  for (const category of hub.categories ?? []) {
    for (const resource of category.resources ?? []) resources.push(resource);
  }

  const targets = ONLY
    ? resources.filter((item) => item.id === ONLY)
    : resources;

  console.log(
    `分集拆解：共 ${targets.length} 条资源` +
      (ONLY ? `（仅 ${ONLY}）` : "") +
      `· 模式 ${DRY_RUN ? "dry-run" : APPLY ? "apply" : "无（加 --dry-run 或 --apply）"}`,
  );
  console.log("");

  const stats = { pages: 0, playlist: 0, chapters: 0, single: 0, failed: 0 };
  const changes = [];

  for (const resource of targets) {
    // 已经拆过的跳过——除非强制。
    if (Array.isArray(resource.episodes) && resource.episodes.length > 1) {
      stats.single += 1;
      continue;
    }

    const result = await buildEpisodes(resource);
    if (!result) {
      stats.single += 1;
      continue;
    }

    stats[result.origin] += 1;
    changes.push({ resource, result });

    const first = result.episodes[0];
    console.log(
      `  ✓ ${resource.id} · ${result.origin} · ${result.episodes.length} 集` +
        ` · 首集「${first.title}」` +
        (result.origin === "chapters"
          ? ` @ ${formatTime(first.start_time)}–${formatTime(first.end_time ?? 0)}`
          : ""),
    );
  }

  console.log("");
  console.log(
    `统计：原生分 P ${stats.pages} · 官方播放列表 ${stats.playlist} · ` +
      `章节切片 ${stats.chapters} · 维持单集 ${stats.single}`,
  );

  if (!APPLY) {
    console.log("");
    console.log(
      DRY_RUN
        ? "dry-run 模式——没有写入任何文件。确认无误后加 --apply。"
        : "未指定 --apply——没有写入任何文件。",
    );
    return;
  }

  // ── 写回 ──
  for (const { resource, result } of changes) {
    resource.episodes = result.episodes;
    resource.episode_count = result.episodes.length;
    resource.episode_origin = result.origin;
  }

  fs.writeFileSync(HUB_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log("");
  console.log(
    `✅ 已写入 ${changes.length} 门课的分集数据 → ` +
      path.relative(ROOT, HUB_PATH),
  );
}

/** 秒 → ``HH:MM:SS``。 */
function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

await main();
