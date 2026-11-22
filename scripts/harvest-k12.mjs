#!/usr/bin/env node
/**
 * K12 信源采集器
 * ==============
 *
 * 为 **24 套年级系列**（12 年级 × 语文 / 数学）找到权威、成套的
 * 教材同步课，并把每一套拆成**真实的课时分集**。
 *
 * 三级信源（按优先级）
 * --------------------
 *
 * 1. **B 站原生分 P** —— 通过 ``/x/player/pagelist`` 读 ``pages``
 *    数组。这是**最理想**的形态：每一集都是真实课时，播放地址是
 *    ``?bvid=...&p=N``，进度天然按课时记账。
 *
 * 2. **YouTube 官方播放列表** —— 独立视频构成的系列。海外访问
 *    友好，作为 B 站连不上时的**双源互备**。
 *
 * 3. **官方章节切片** —— 原源确实只有一条超长合集时，按简介里的
 *    ``(HH:MM:SS) 标题`` 切分成课时区间。
 *
 * 候选筛选
 * --------
 *
 * 搜索结果里**大部分**不是教材同步课（奥数思维、速算技巧、
 * 作文范文、网课搬运…）。所以每个候选都要过一道**硬校验**：
 *
 * - 标题必须命中**教材版本**（人教版 / 部编 / 统编 / 人教 A 版）；
 * - 必须命中**年级**（一年级 … 高三，或初一 / 初二 / 初三）；
 * - 必须命中**学科**；
 * - 必须是「成套」的——分 P 数 ≥ 2，或时长够长可切片。
 *
 * 用法
 * ----
 *
 * ```bash
 * node scripts/harvest-k12.mjs --dry-run     # 只看会选到谁
 * node scripts/harvest-k12.mjs --apply       # 写回 k12 数据
 * node scripts/harvest-k12.mjs --apply --only k12_math_g4
 * ```
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERIES } from "./k12-series-spec.mjs";
import {
  animationKeywords,
  isAnimationCandidate,
  MAX_DURATION,
} from "./k12-animation-spec.mjs";
import { GRADES, SUBJECTS, gradeOf, subjectOf, stageOf } from "./k12-skeleton.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "backend", "data", "k12");
const OUT_FILE = path.join(OUT_DIR, "k12_series.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const APPLY = args.includes("--apply");
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? args[i + 1] : "";
})();

/** 搜索结果数上限——够用且不慢。 */
const SEARCH_LIMIT = 20;

/**
 * 动画关键词表 —— ``seriesId → 关键词数组``。
 *
 * 方案 C：优先用**动画短课**；找不到再回落长课。
 */
const ANIMATION_KEYWORDS = new Map(
  animationKeywords().map((item) => [item.id, item.keywords]),
);

/**
 * 拿一套系列的**动画关键词**（可能为空）。
 */
function animationKeywordsFor(seriesId) {
  return ANIMATION_KEYWORDS.get(seriesId) ?? [];
}

// ── B 站 ────────────────────────────────────────────────────────────

/**
 * B 站搜索。
 *
 * ⚠️ 用的是 ``wbi/search/type``——它比旧的 ``search/type`` 稳，
 *    且不需要签名就能拿到 JSON。
 */
async function bilibiliSearch(keyword) {
  try {
    const response = await fetch(
      "https://api.bilibili.com/x/web-interface/wbi/search/type" +
        `?search_type=video&page=1&page_size=${SEARCH_LIMIT}` +
        `&keyword=${encodeURIComponent(keyword)}`,
      {
        headers: {
          "User-Agent": UA,
          Referer: "https://search.bilibili.com/",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return [];

    const payload = await response.json();
    if (payload.code !== 0) return [];

    const results = payload?.data?.result;
    if (!Array.isArray(results)) return [];

    return results
      .filter((item) => item?.bvid)
      .map((item) => ({
        bvid: item.bvid,
        title: String(item.title ?? "").replace(/<[^>]+>/g, ""),
        author: String(item.author ?? ""),
        pic: String(item.pic ?? ""),
        duration: parseClock(item.duration),
        durationText: String(item.duration ?? ""),
        play: Number(item.play ?? 0) || 0,
        pubdate: Number(item.pubdate ?? 0) || 0,
        description: String(item.description ?? ""),
      }));
  } catch {
    return [];
  }
}

/**
 * 读一个 B 站视频的**分 P 列表**。
 *
 * ⚠️ 必须用 ``/x/player/pagelist`` 而不是 ``/x/web-interface/view``——
 *    后者在很多网络环境下会被风控拦成 HTML 页面。前者稳定得多，
 *    且返回的分 P 数组含 ``part``（课时名）与 ``duration``。
 */
async function fetchBilibiliPages(bvid) {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`,
      {
        headers: {
          "User-Agent": UA,
          Referer: "https://www.bilibili.com/",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;

    const payload = await response.json();
    if (payload.code !== 0 || !Array.isArray(payload.data)) return null;

    const pages = payload.data
      .map((page) => ({
        page: Number(page.page) || 1,
        title: String(page.part ?? "").trim(),
        duration: Number(page.duration) || 0,
      }))
      .filter((page) => page.page > 0);

    return pages.length > 0 ? pages : null;
  } catch {
    return null;
  }
}

/**
 * 读视频元信息（标题 / 简介 / 总时长）。
 *
 * 简介里往往有官方**章节表**——那是切片时最准的切分点。
 */
async function fetchBilibiliMeta(bvid) {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      {
        headers: {
          "User-Agent": UA,
          Referer: "https://www.bilibili.com/",
          Cookie: "buvid3=probe",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;

    const payload = await response.json();
    if (payload.code !== 0) return null;

    const data = payload.data ?? {};
    return {
      title: String(data.title ?? ""),
      description: String(data.desc ?? ""),
      duration: Number(data.duration) || 0,
      pic: String(data.pic ?? ""),
      owner: String(data.owner?.name ?? ""),
      pages: Number(data.videos) || 0,
    };
  } catch {
    return null;
  }
}

// ── YouTube ────────────────────────────────────────────────────────

/** Innertube 搜索。 */
async function youtubeSearch(query) {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Origin: "https://www.youtube.com",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240101.00.00",
              hl: "zh-CN",
              gl: "CN",
            },
          },
          query,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) return [];

    const payload = await response.json();
    const items = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      if (node.videoRenderer) {
        const v = node.videoRenderer;
        const title = v.title?.simpleText ?? v.title?.runs?.[0]?.text ?? "";
        if (title && v.videoId) {
          items.push({
            youtube_id: v.videoId,
            title,
            duration: parseClock(v.lengthText?.simpleText ?? ""),
            author: v.ownerText?.runs?.[0]?.text ?? "",
          });
        }
      }
      for (const value of Object.values(node)) walk(value);
    };
    walk(payload);
    return items;
  } catch {
    return [];
  }
}

/** 视频详情——取简介（章节表在这里）。 */
async function youtubeMeta(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240101.00.00",
              hl: "zh-CN",
              gl: "CN",
            },
          },
          videoId,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return {
      title: String(payload?.videoDetails?.title ?? ""),
      description: String(payload?.videoDetails?.shortDescription ?? ""),
      duration: Number(payload?.videoDetails?.lengthSeconds) || 0,
      author: String(payload?.videoDetails?.author ?? ""),
    };
  } catch {
    return null;
  }
}

// ── 工具 ────────────────────────────────────────────────────────────

/** ``"12:34"`` / ``"1:02:03"`` → 秒。 */
function parseClock(raw) {
  const parts = String(raw ?? "")
    .trim()
    .split(":")
    .map((item) => Number(item) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

/** 秒 → ``HH:MM:SS``。 */
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/**
 * 年级的**匹配词**。
 *
 * 同一个年级有多种叫法——「一年级 / 1年级 / 小学一年级」，
 * 初中是「七年级 / 初一 / 七年级上」，高中是「高一 / 高一数学」。
 */
function gradeTokens(grade) {
  const tokens = [];
  const chinese = [
    "",
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
  ][grade];
  if (chinese) tokens.push(`${chinese}年级`);
  if (grade <= 9) tokens.push(`${grade}年级`);

  if (grade === 7) tokens.push("初一");
  if (grade === 8) tokens.push("初二");
  if (grade === 9) tokens.push("初三", "中考");
  if (grade === 10) tokens.push("高一");
  if (grade === 11) tokens.push("高二");
  // ⚠️ 高三的课几乎都自称「高考复习」而不是「高三上册」——
  //    「高考数学一轮复习同步全集」才是这类课的真实标题形态。
  if (grade === 12) tokens.push("高三", "高考");
  return tokens;
}

/**
 * 教材版本的匹配词——**只认目标版本**。
 *
 * ⚠️ 这里**不能**把「数学」「语文」当成版本词。否则「青岛版数学」
 *    「湘教版数学」会因为含「数学」而通过校验——它们是**另一个
 *    教材体系**，跟本平台承诺的「人教版 / 部编版」不是一回事。
 */
function editionTokens(subject, grade) {
  if (subject === "chinese") {
    const tokens = ["部编", "统编", "人教版语文", "人教语文"];
    if (grade >= 10) {
      tokens.push("统编版");
      // ⚠️ 高中阶段**全国统一**使用统编版，所以「高中语文」本身就
      //    等价于统编版。高三的课程几乎都是「高考一轮复习」，
      //    标题里不会再写「统编版」——但它们**确实是**统编教材
      //    的复习课。这里必须认。
      tokens.push("高中语文");
    }
    return tokens;
  }
  const tokens = ["人教版", "人教A版", "人教A", "人教"];
  if (grade >= 10) tokens.push("人教A版");
  // ⚠️ 高三数学的复习课标题常是「高考数学一轮复习同步全集 2026
  //    新版 人教A版 新教材」——含「人教A版」，但也有大量「高考数学
  //    系统课」不带版本词。高中阶段**全国统一**人教 A 版，所以
  //    「高中数学」「高考数学」本身就等价于目标版本。
  if (grade >= 10) tokens.push("高中数学", "高考数学");
  return tokens;
}

/**
 * **非目标**教材版本——命中即淘汰。
 *
 * 国内每个地方都有自己的一套教材（青岛版、湘教版、西师版、苏教版、
 * 冀教版、沪教版、北师大版…）。它们**内容不同、章节顺序不同**——
 * 对海外华人学生来说，选错版本意味着学的知识点对不上国内课标。
 *
 * 所以这些词是**硬否决**的。
 */
const WRONG_EDITIONS = [
  "青岛版",
  "湘教版",
  "西师版",
  "苏教版",
  "冀教版",
  "沪教版",
  "北师大版",
  "浙教版",
  "粤教版",
  "沪科版",
  "外研版",
  "仁爱版",
  "鲁教版",
  "教科版",
];

/** 非目标学科 / 非同步课的硬否决词。 */
const NEGATIVE_TOKENS = [
  "奥数",
  "作文",
  "写字",
  "书法",
  "英语",
  "物理",
  "化学",
  "生物",
  "政治",
  "历史",
  "地理",
  "美术",
  "音乐",
  "体育",
  "信息科技",
];

/**
 * 候选**硬校验**。
 *
 * 返回一个 0–1 的分数；``null`` 表示直接淘汰。
 *
 * 为什么不用「纯相关度」排序
 * ------------------------
 *
 * 搜索排序对「奥数」「速算」这类流量词有天然偏好——它们会挤掉
 * 真正的同步课。所以这里**先做硬门槛**（教材版本 + 年级 + 学科
 * 必须命中），再在合格者里按「成套度」排序。
 */
function scoreCandidate(candidate, spec, options = {}) {
  const text = `${candidate.title} ${candidate.description ?? ""}`;
  // ⚠️ ``options`` 会被下面的「冲突年级」标记写回——所以先复制一份，
  //    否则一个候选的判定结果会污染后续所有候选。
  const flags = { ...options };

  // ── 学科 ──
  const subjectWord = spec.subject === "chinese" ? "语文" : "数学";
  const subjectHit = text.includes(subjectWord);
  if (!subjectHit) return null;

  // ── 年级 ──
  const gradeHit = gradeTokens(spec.grade).some((token) =>
    text.includes(token),
  );
  if (!gradeHit) return null;

  // ── 冲突年级：降权而非否决 ──
  //
  // 背景
  // ----
  //
  // 「全120集【八年级上册数学】初二数学 2026最新版 **七年级上册数学课程**」
  // 这类标题里常混进**邻年级**的词——因为 UP 主把多个年级的系列
  // 合并上传了。
  //
  // 早期版本用「出现别的年级就否决」，结果八年级数学**完全选不到**
  // ——因为 B 站上八年级数学的成套课几乎都带「七年级」字样（合集
  // 上传）。
  //
  // 现在的规则
  // ------------
  //
  // **目标年级必须出现在标题里**（硬门槛），其它年级只是**降权**。
  // 排序时目标年级的分数更高，所以纯八年级的课会排在合集课前面；
  // 但如果纯课不存在，合集课仍然能用——**不留空壳年级**比
  // 「绝不混入邻年级」更重要。
  //
  // ⚠️ 唯一例外是**错误教材版本**——那个仍然硬否决，因为教材体系
  //    错了，知识点就全错了。
  if (!flags.relaxed) {
    const conflicting = GRADES.filter(
      (grade) =>
        grade.number !== spec.grade &&
        grade.stage === gradeOf(spec.grade).stage &&
        gradeTokens(grade.number)
          .filter((token) => token !== "高考")
          .some((token) => text.includes(token)),
    );
    if (conflicting.length > 0) flags.conflicting = true;
  }

  // ── 教材版本：必须命中目标版本 ──
  const editionHit = editionTokens(spec.subject, spec.grade).some((token) =>
    text.includes(token),
  );
  if (!editionHit) return null;

  // ── 非目标教材版本：硬否决 ──
  //
  // 「青岛版数学三年级上册同步课程」这类候选**质量很高**（分 P
  // 完整、老师讲得好），但它不是本平台承诺的教材体系。
  // 收录它等于给海外华人学生错的知识点。
  const wrongEdition = WRONG_EDITIONS.find((word) => text.includes(word));
  if (wrongEdition) return null;

  // ── 负向词：这些不是教材同步课 ──
  const negativeHit = NEGATIVE_TOKENS.find((word) => text.includes(word));
  if (negativeHit) return null;

  let score = 0.4;
  if (text.includes("同步")) score += 0.2;
  if (text.includes("精讲") || text.includes("名师")) score += 0.1;
  if (/全\s*\d+\s*[集讲课时]/.test(text)) score += 0.15;
  if (text.includes("全套") || text.includes("全集")) score += 0.1;

  // 「全 N 集」里的 N —— 声明的集数越多，说明这**越像**一套成体系的
  // 教材同步课（而不是「1 讲串讲 3 小时」的碎片）。
  const declared = text.match(/全\s*(\d{1,3})\s*[集讲课时]/);
  if (declared) {
    const count = Number(declared[1]);
    // 集数越多越加分，但到 40 讲左右就饱和——再多是「超前学」
    // 把上下册 + 复习全塞进来，颗粒度反而不对。
    score += Math.min(0.2, count / 200);
  }

  // 播放量——在**合格**候选里作为次要信号。
  score += Math.min(0.1, Math.log10(Math.max(1, candidate.play)) / 100);

  // 标题里混进了**别的年级**——降权。
  //
  // 这样纯本年级的课会排在前面；但当纯课不存在时，合集课仍然
  // 能顶上——不留空壳年级比「绝不混邻年级」更重要。
  if (flags.conflicting) score -= 0.25;

  return score;
}

/**
 * 从简介里解析官方章节表。
 *
 * 官方课程的简介几乎都会列章节：
 *
 * .. code-block:: text
 *
 *     ⌨️ (00:00:00) 1_集合的概念与表示
 *     ⌨️ (01:45:08) 2_集合的关系与运算
 */
function parseChapters(description) {
  const text = String(description ?? "");
  const pattern =
    /[（(]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[)）]\s*([^\n（(]{2,90})/g;
  const chapters = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const parts = match[1].split(":").map((item) => Number(item) || 0);
    const start =
      parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts.length === 2
          ? parts[0] * 60 + parts[1]
          : parts[0];
    const title = match[2].trim().replace(/^[⌨️📖🎥✏️✅\s]+/, "");
    if (Number.isFinite(start) && title) chapters.push({ start, title });
  }
  return chapters.length >= 2 ? chapters : [];
}

/**
 * 把章节表切成分集。
 *
 * 每集的 ``end_time`` 是**下一集的起点**——播放到区间末尾就停，
 * 天然形成「一讲结束」的边界。
 */
function chaptersToEpisodes(chapters, totalDuration, videoUrl) {
  const usable = chapters.filter((chapter) => chapter.start < totalDuration);
  if (usable.length < 2) return [];

  return usable.map((chapter, index) => {
    const next = usable[index + 1];
    const end = next ? next.start : totalDuration;
    return {
      ep_id: `ch${String(index + 1).padStart(2, "0")}`,
      title: cleanTitle(chapter.title).slice(0, 80) || `第 ${index + 1} 讲`,
      index: index + 1,
      total: usable.length,
      video_url: videoUrl,
      duration: Math.max(0, end - chapter.start),
      start_time: chapter.start,
      end_time: end,
      key_concepts: [],
      origin: "chapters",
    };
  });
}

// ── 主流程 ──────────────────────────────────────────────────────────

/**
 * 为一套系列找到信源。
 *
 * 流程：搜索 → 硬校验 → 按分 P 数 / 章节数排序 → 逐个尝试拆分。
 */
async function harvestSeries(spec) {
  const report = { id: spec.id, title: spec.title, found: null, rejected: [] };

  // ── ① 收集候选 ──
  //
  // 两轮：第一轮**严格**（含冲突年级否决），第二轮**放宽**。
  //
  // 为什么要有第二轮
  // ----------------
  //
  // 某些年级的搜索结果本来就不多。严格规则会把「本年级 + 邻年级」
  // 的组合标题也杀掉，导致该年级**完全空着**。
  //
  // 而「空着」是比「多带一个邻年级」严重得多的问题——所以宁可
  // 放宽，也不要留空壳年级。
  const candidates = [];
  const seen = new Set();

  // ── ①a 动画短课优先（方案 C）──
  //
  // 先用**动画关键词**搜一遍，命中「动画 + 时长在短课区间内」的
  // 候选**额外加分**——它们会被排到最前面。
  //
  // ⚠️ 动画源**不是硬性要求**：很多年级 B 站上根本没有成套动画课。
  //    所以这一步只是「加权」，不通过也照样往下走。
  const stage = gradeOf(spec.grade).stage;
  const animationKeywords = animationKeywordsFor(spec.id);

  for (const keyword of animationKeywords) {
    const results = await bilibiliSearch(keyword);
    for (const item of results) {
      if (seen.has(item.bvid)) continue;
      seen.add(item.bvid);

      const score = scoreCandidate(item, spec, { relaxed: true });
      if (score === null) continue;

      const animation = isAnimationCandidate(
        item.title,
        item.duration,
        stage,
      );
      if (animation) {
        // 动画短课：**重加权**，让它排在长课前面。
        candidates.push({ ...item, score: score + 0.5, animation: true });
      } else {
        candidates.push({ ...item, score, animation: false });
      }
    }
  }

  // ── ①b 长课兜底 ──
  for (const keyword of spec.keywords) {
    const results = await bilibiliSearch(keyword);
    for (const item of results) {
      if (seen.has(item.bvid)) continue;
      seen.add(item.bvid);
      const score = scoreCandidate(item, spec);
      if (score === null) {
        report.rejected.push({
          bvid: item.bvid,
          title: item.title.slice(0, 60),
          reason: "未命中教材版本/年级/学科",
        });
        continue;
      }
      candidates.push({ ...item, score, animation: false });
    }
  }

  // 严格模式一个都没留下 → 放宽冲突规则再试一次。
  if (candidates.length === 0) {
    for (const keyword of spec.keywords) {
      const results = await bilibiliSearch(keyword);
      for (const item of results) {
        if (seen.has(item.bvid)) continue;
        seen.add(item.bvid);
        const score = scoreCandidate(item, spec, { relaxed: true });
        if (score === null) continue;
        candidates.push({ ...item, score, relaxed: true });
      }
    }
    if (candidates.length > 0) report.relaxed = true;
  }

  if (candidates.length === 0) {
    report.reason = "没有候选通过校验";
    return report;
  }

  /**
   * 清理课时标题里的**版权 / 广告标记**与**结构性噪音**。
   *
   * B 站的教学视频标题几乎都带 ``©版权xxx`` 的尾巴——
   * 它不是课时信息，但会污染知识节点、诊断题和目录显示。
   *
   * 同时还要清掉 ``【微课视频】`` ``扫码读课文`` ``七彩课堂`` 这类
   * **栏目前缀**——它们描述的是「这个视频是什么形式」，
   * 不是「这一讲讲什么」。
   *
   * ⚠️ 括号常常**不配对**（``名师讲重点1观潮（想象画面，感受钱塘江大潮的壮美``）。
   *    所以不能简单地按括号截断——那样会把标题砍掉一半。
   *    这里只在**括号闭合**时才截断。
   *
   * @param {string} raw 原始标题
   * @returns {string} 清理后的标题
   */
  function cleanTitle(raw) {
    let text = String(raw ?? "");

    // 版权标记。
    text = text.replace(/[©®]\s*版权[^\s|｜]*/g, "");
    text = text.replace(/©[^\s|｜]{0,20}/g, "");

    // 栏目前缀（出现在标题开头）。
    text = text.replace(
      /^\s*[【\[]\s*(微课视频|微课|名师讲重点|名师讲解|名师精讲|扫码读课文|扫码听读|七彩课堂|课本精讲|同步讲解|精品课程|重难点突破|精品优课)\s*[】\]]\s*/g,
      "",
    );
    text = text.replace(
      /^\s*(扫码读课文|扫码听读|七彩课堂|微课视频|微课)\s*/g,
      "",
    );

    // 括号**闭合**时才截断——不闭合就保留（说明它只是标题的一部分）。
    const closed = text.match(/^(.*?[（(][^）)]*[）)])(.*)$/);
    if (closed && closed[1].length >= 6) {
      text = closed[1];
    }

    text = text.replace(/\s+/g, " ").trim();

    // 收尾的孤立符号。
    text = text.replace(/[\s、，,·\-—_]+$/, "");

    return text;
  }

  /**
   * 把课时列表映射成带**干净标题**的分集。
   *
   * @param {Array} pages   分 P 列表
   * @param {string} bvid   视频 id
   * @returns {Array} 分集
   */
  function toEpisodes(pages, bvid) {
    return pages.map((page, index) => ({
      ep_id: `p${page.page}`,
      title: cleanTitle(page.title) || `第 ${page.page} 讲`,
      index: index + 1,
      total: pages.length,
      video_url: `https://www.bilibili.com/video/${bvid}?p=${page.page}`,
      bvid,
      page: page.page,
      duration: page.duration,
      start_time: 0,
      end_time: null,
      key_concepts: [],
      origin: "pages",
    }));
  }

  // ── ② 逐个尝试拆分 ──
  //
  // 顺序很重要：**先试分 P 多的**（播放体验最好），再试章节可切的。
  // 动画源优先，其次按分数。
  candidates.sort((a, b) => {
    if (a.animation !== b.animation) return a.animation ? -1 : 1;
    return b.score - a.score;
  });

  for (const candidate of candidates) {
    const pages = await fetchBilibiliPages(candidate.bvid);

    // ── ②a 原生分 P ──
    if (pages && pages.length >= 2) {
      report.found = {
        provider: "Bilibili",
        origin: "pages",
        bvid: candidate.bvid,
        title: cleanTitle(candidate.title),
        author: candidate.author,
        pic: candidate.pic.startsWith("//")
          ? `https:${candidate.pic}`
          : candidate.pic,
        url: `https://www.bilibili.com/video/${candidate.bvid}`,
        totalDuration: candidate.duration,
        episodes: toEpisodes(pages, candidate.bvid),
      };
      return report;
    }

    // ── ②b 章节切片 ──
    const meta = await fetchBilibiliMeta(candidate.bvid);
    if (meta) {
      const chapters = parseChapters(meta.description);
      const episodes = chaptersToEpisodes(
        chapters,
        meta.duration || candidate.duration,
        `https://www.bilibili.com/video/${candidate.bvid}`,
      );
      if (episodes.length >= 2) {
        report.found = {
          provider: "Bilibili",
          origin: "chapters",
          bvid: candidate.bvid,
          title: meta.title || candidate.title,
          author: meta.owner || candidate.author,
          pic: meta.pic || candidate.pic,
          url: `https://www.bilibili.com/video/${candidate.bvid}`,
          totalDuration: meta.duration,
          episodes,
        };
        return report;
      }
    }
  }

  // ── ②c YouTube 兜底 ──
  for (const keyword of spec.youtubeKeywords ?? []) {
    const results = await youtubeSearch(keyword);
    for (const item of results) {
      const score = scoreCandidate(
        { ...item, play: 0, description: "" },
        spec,
      );
      if (score === null) continue;

      const meta = await youtubeMeta(item.youtube_id);
      const chapters = meta ? parseChapters(meta.description) : [];
      const episodes = meta
        ? chaptersToEpisodes(
            chapters,
            meta.duration,
            `https://www.youtube.com/watch?v=${item.youtube_id}`,
          )
        : [];

      if (episodes.length >= 2) {
        report.found = {
          provider: "YouTube",
          origin: "chapters",
          youtube_id: item.youtube_id,
          title: item.title,
          author: item.author,
          pic: "",
          url: `https://www.youtube.com/watch?v=${item.youtube_id}`,
          totalDuration: meta?.duration ?? item.duration,
          episodes,
        };
        return report;
      }
    }
  }

  report.reason = `候选 ${candidates.length} 个，但都无法拆成多集`;
  return report;
}

/** 主流程。 */
async function main() {
  const targets = ONLY ? SERIES.filter((s) => s.id === ONLY) : SERIES;

  console.log(
    `K12 采集：${targets.length} 套系列 · ` +
      `模式 ${DRY_RUN ? "dry-run" : APPLY ? "apply" : "无"}`,
  );
  console.log("");

  const results = [];
  for (const spec of targets) {
    const grade = gradeOf(spec.grade);
    const subject = subjectOf(spec.subject);
    const stage = stageOf(grade.stage);
    process.stdout.write(
      `  · ${spec.id.padEnd(18)} ${stage.name}·${grade.name}·${subject.name} … `,
    );

    const report = await harvestSeries(spec);
    results.push({ spec, report });

    if (report.found) {
      const found = report.found;
      console.log(
        `✓ ${found.origin} · ${found.episodes.length} 集 · ` +
          `${found.provider} · ${found.title.slice(0, 34)}`,
      );
    } else {
      console.log(`✗ ${report.reason ?? "未找到"}`);
    }
  }

  // ── 汇总 ──
  const ok = results.filter((item) => item.report.found);
  const totalEpisodes = ok.reduce(
    (sum, item) => sum + item.report.found.episodes.length,
    0,
  );
  console.log("");
  console.log(
    `统计：成功 ${ok.length}/${results.length} 套 · 共 ${totalEpisodes} 集`,
  );

  const missing = results.filter((item) => !item.report.found);
  if (missing.length > 0) {
    console.log("");
    console.log("未找到的系列：");
    for (const item of missing) {
      console.log(`  ✗ ${item.spec.id} — ${item.report.reason ?? ""}`);
    }
  }

  if (!APPLY) {
    console.log("");
    console.log(DRY_RUN ? "dry-run —— 未写入文件。" : "未指定 --apply —— 未写入文件。");
    return;
  }

  // ── 写盘 ──
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const payload = {
    id: "k12_series",
    title: "国内 K12 语文·数学年级同步系列",
    updated_at: new Date().toISOString(),
    grades: GRADES,
    subjects: SUBJECTS,
    series: results.map(({ spec, report }) => ({
      id: spec.id,
      title: spec.title,
      grade: spec.grade,
      subject: spec.subject,
      volumes: spec.volumes,
      source: report.found
        ? {
            provider: report.found.provider,
            origin: report.found.origin,
            url: report.found.url,
            bvid: report.found.bvid ?? "",
            youtube_id: report.found.youtube_id ?? "",
            author: report.found.author,
            pic: report.found.pic,
            total_duration: report.found.totalDuration,
          }
        : null,
      episode_count: report.found?.episodes.length ?? 0,
      episodes: report.found?.episodes ?? [],
    })),
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`✅ 已写入 ${path.relative(ROOT, OUT_FILE)}`);
}

await main();
