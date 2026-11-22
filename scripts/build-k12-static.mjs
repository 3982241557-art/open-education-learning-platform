#!/usr/bin/env node
/**
 * K12 静态分片构建
 * ================
 *
 * 把采集器产出的 ``backend/data/k12/k12_series.json`` 拆成
 * **前端可直接消费的轻量文件**。
 *
 * 产出
 * ----
 *
 * .. code-block:: text
 *
 *     web/public/data/k12-index.json          目录索引（几十 KB）
 *     web/public/data/courses/k12_<id>.json   单套系列详情
 *
 * 为什么分片
 * ----------
 *
 * 1.5 千集的完整数据如果塞进一个 JSON，首屏要下载**好几 MB**。
 * 分片之后首页只拉几十 KB 的索引；点进哪套课才拉那套课的数据。
 *
 * 附带产物
 * --------
 *
 * ``web/public/data/global_resource_hub.json`` —— 中台大盘**同步换成
 * K12 体系**（旧数据整体下线）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GRADES, SUBJECTS, gradeOf, seriesTitle, subjectOf } from "./k12-skeleton.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SOURCE = path.join(ROOT, "backend", "data", "k12", "k12_series.json");
const TARGET_ROOT = path.join(ROOT, "web", "public", "data");
const K12_DIR = TARGET_ROOT;
const COURSE_DIR = path.join(TARGET_ROOT, "courses");
const INDEX_FILE = path.join(TARGET_ROOT, "k12-index.json");
const HUB_FILE = path.join(TARGET_ROOT, "global_resource_hub.json");

/** 短名（「小学四年级数学」）。 */
function shortTitle(gradeNumber, subjectId) {
  const grade = gradeOf(gradeNumber);
  const subject = subjectOf(subjectId);
  const stagePrefix =
    grade.stage === "primary"
      ? "小学"
      : grade.stage === "junior"
        ? "初中"
        : "高中";
  return `${stagePrefix}${grade.name}${subject.name}`;
}

/** 主流程。 */
function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`❌ 找不到 ${path.relative(ROOT, SOURCE)}`);
    console.error("   先跑 `node scripts/harvest-k12.mjs --apply` 采集信源。");
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const series = raw.series ?? [];

  fs.mkdirSync(K12_DIR, { recursive: true });
  fs.mkdirSync(COURSE_DIR, { recursive: true });

  // ── 1. 写每套系列的详情文件 ──
  const indexEntries = [];
  /** 每套系列的知识节点 / 段落导读——中台用。 */
  const courseNodes = new Map();
  let totalEpisodes = 0;

  for (const item of series) {
    const grade = gradeOf(item.grade);
    const subject = subjectOf(item.subject);
    const fullTitle = seriesTitle(item);
    const short = shortTitle(item.grade, item.subject);

    // ── 本套系列的知识节点 / 段落导读 ──
    //
    // 详细文件是**按需加载**的，所以可以给**全量**（中台那份只给前 12 集，
    // 因为中台是首页级资源，不能膨胀）。
    const { nodes, segments } = buildFullCourseNodes(item.episodes ?? []);

    const detail = {
      id: item.id,
      title: fullTitle,
      shortTitle: short,
      grade: item.grade,
      subject: item.subject,
      stage: grade.stage,
      ageRange: grade.ageRange,
      edition: subject.edition,
      volumes: item.volumes,
      source: item.source ?? null,
      interactiveNodes: nodes,
      guidedSegments: segments,
      episodes: item.episodes ?? [],
    };

    fs.writeFileSync(
      path.join(COURSE_DIR, `${item.id}.json`),
      `${JSON.stringify(detail, null, 2)}\n`,
      "utf8",
    );

    totalEpisodes += detail.episodes.length;

    indexEntries.push({
      id: item.id,
      title: fullTitle,
      shortTitle: short,
      grade: item.grade,
      subject: item.subject,
      stage: grade.stage,
      ageRange: grade.ageRange,
      edition: subject.edition,
      volumes: item.volumes,
      episodeCount: detail.episodes.length,
      provider: item.source?.provider ?? "",
      author: item.source?.author ?? "",
      pic: item.source?.pic ?? "",
      /** 信源主页——中台资源卡片的跳转目标。 */
      sourceUrl: item.source?.url ?? "",
      detailPath: `/data/courses/${item.id}.json`,
    });

    // ── 中台的知识节点 / 段落导读 ──
    //
    // 从**真实课时标题**生成。单独存一份，不进索引——
    // 索引必须保持轻量（首屏只拉它）。
    const { nodes: hubNodes, segments: hubSegments } = buildCourseNodes(
      detail.episodes,
    );
    courseNodes.set(item.id, { nodes: hubNodes, segments: hubSegments });
  }

  // ── 2. 写索引 ──
  const index = {
    id: "k12_index",
    title: "国内 K12 语文 · 数学年级同步系列",
    updated_at: new Date().toISOString(),
    grades: GRADES,
    subjects: SUBJECTS,
    series: indexEntries,
    summary: {
      seriesCount: indexEntries.length,
      episodeCount: totalEpisodes,
      gradeCount: GRADES.length,
    },
  };

  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  // ── 3. 同步中台大盘 ──
  //
  // 旧的中台（大学公开课 / 通识单视频）**整体下线**——平台彻底聚焦
  // 国内 K12 语文与数学。中台的分类骨架换成「学段」，资源换成
  // 24 套年级系列。
  //
  // 这样中台页、课程页、学情中心**读的是同一份数据**，不会出现
  // 「课程页有 24 套、中台页有 147 门」这种割裂。
  //
  // ⚠️ ``revision`` 必须是**整数**——schema 里写的是 ``integer``。
  //    它是缓存版本号：内容变了就 +1，前端据此判断要不要重读。
  const revision = readRevision() + 1;

  const hub = {
    hub: {
      id: "global_resource_hub",
      revision,
      title: "国内 K12 语文 · 数学年级同步体系",
      description:
        "覆盖 1–12 年级的语文与数学教材同步精讲系列，按学段 × 年级 × 年龄组织。",
      language: "zh-CN",
      depth: "k12",
      status: "active",
      updated_at: new Date().toISOString(),
      metadata: {
        pillar: "k12",
        author: "Open Education Learning Platform",
        notes:
          "语文采用国家统编版（部编版），数学采用人教版（高中人教 A 版）。每一套系列均按真实分集（课时）装配。",
        registry: "k12",
        resource_count: indexEntries.length,
        category_count: 3,
        episode_count: totalEpisodes,
      },
      exploration_summary: "",
      categories: buildCategories(indexEntries, GRADES, courseNodes),
    },
  };

  fs.writeFileSync(HUB_FILE, `${JSON.stringify(hub, null, 2)}\n`, "utf8");

  // ── 3b. 回写后端源目录 ──
  //
  // 中台大盘有**两份**——后端的源（``backend/data/``）和前端的产物
  // （``web/public/data/``）。它们必须一致，否则：
  //
  // * 同步脚本会把后端的旧版本拷回前端，覆盖掉刚构建的 K12 版；
  // * 后端 API 读到的还是旧的 147 门公开课。
  //
  // 所以这里**同时**写两份——内容相同，永远不会漂移。
  const backendHub = path.join(ROOT, "backend", "data", "global_resource_hub.json");
  fs.writeFileSync(backendHub, `${JSON.stringify(hub, null, 2)}\n`, "utf8");

  // ── 4. 报告 ──
  const indexBytes = fs.statSync(INDEX_FILE).size;
  const hubBytes = fs.statSync(HUB_FILE).size;

  console.log("✅ K12 静态分片构建完成");
  console.log(`   索引：${indexEntries.length} 套系列 / ${totalEpisodes} 集 / ${(indexBytes / 1024).toFixed(1)} KB`);
  console.log(`   详情：${indexEntries.length} 个文件 → web/public/data/courses/`);
  console.log(`   中台：${(hubBytes / 1024).toFixed(1)} KB → global_resource_hub.json`);
}

/**
 * 读出当前的中台版本号。
 *
 * 版本号是**单调递增**的整数——内容变了就 +1。
 *
 * ⚠️ 读**前端**那份（而不是后端那份）——因为它才是上一次构建的
 *    产物，能反映「线上」的状态。
 */
function readRevision() {
  for (const file of [HUB_FILE, path.join(ROOT, "backend", "data", "global_resource_hub.json")]) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const revision = Number(parsed?.hub?.revision);
      if (Number.isInteger(revision) && revision > 0) return revision;
    } catch {
      /* 解析失败就当没有旧版本 */
    }
  }
  return 0;
}

/**
 * 从课时标题里提取**知识点**。
 *
 * 这是 ``web/lib/lesson-analyzer.ts`` 的构建期版本——两边逻辑必须
 * 一致，所以这里刻意保持同样的清洗规则。
 *
 * 为什么需要它
 * ------------
 *
 * schema 要求每条资源至少有两个 ``interactive_nodes``（知识节点）。
 * 而 K12 系列的**真实**知识节点就在课时标题里——
 *
 * .. code-block:: text
 *
 *     第一单元｜阅读｜1 古诗三首｜第一课时
 *     2_济南的冬天
 *     3.观察物体（第1课时）
 *
 * 这些标题**就是**教材目录。清洗之后就是可用的知识点。
 *
 * @param {string} raw 原始标题
 * @returns {string[]} 清洗后的知识点（0–4 个）
 */
function extractKeywords(raw) {
  let text = String(raw ?? "");

  // 版权 / 广告。
  text = text.replace(/[©®]\s*版权[^\s|｜]*/g, "");
  text = text.replace(/©[^\s|｜]{0,20}/g, "");

  // 栏目前缀。
  text = text.replace(
    /^\s*[【\[]\s*(微课视频|微课|名师讲重点|名师讲解|名师精讲|扫码读课文|扫码听读|七彩课堂|课本精讲|同步讲解|精品课程|重难点突破|精品优课)\s*[】\]]\s*/g,
    "",
  );
  text = text.replace(
    /^\s*(扫码读课文|扫码听读|七彩课堂|微课视频|微课)\s*/g,
    "",
  );

  // 分隔符 → 空格。
  text = text.replace(/[｜|]/g, " ");
  // 括号内容单独处理（见下），这里先清掉结构符号。
  text = text.replace(/[【】\[\]（）()《》「」]/g, " ");
  // 前导序号。
  text = text.replace(/^\s*\d{1,3}\s*[.、_\-]\s*/, "");
  text = text.replace(/^\s*第\s*\d{1,3}\s*[课讲]\s*/, "");
  // 课时标记。
  text = text.replace(/第[一二三四五六七八九十\d]{1,3}课时/g, " ");
  text = text.replace(/课时\s*\d{1,3}/g, " ");
  // 课型标记。
  text = text.replace(/基础篇|进阶篇|提高篇|拓展篇|强化篇|基础课|复习课|习题课/g, " ");

  const lesson = text.replace(/\s+/g, " ").trim();

  const keywords = [];
  const seen = new Set();

  const push = (value) => {
    const cleaned = String(value ?? "")
      .replace(/^\s*[.、_\-]\s*/, "")
      .replace(/\s+/g, "")
      .trim();
    if (!cleaned || cleaned.length < 2 || cleaned.length > 20) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    keywords.push(cleaned);
  };

  push(lesson);

  // 「X 的 Y」→ 拆成两个概念。
  const conjunction = lesson.match(/^(.{2,10})的(.{2,10})$/);
  if (conjunction) {
    push(conjunction[1]);
    push(conjunction[2]);
  }

  return keywords.slice(0, 4);
}

/**
 * 为一套系列生成**知识节点**与**段落导读**。
 *
 * 取前若干集的标题来生成——因为一门课几百集，全量塞进中台资源会
 * 让中台 JSON 膨胀（而中台是**首页级**要加载的）。
 *
 * 每一集**自己**的完整知识点在 ``/data/courses/<id>.json`` 里——
 * 那是按需加载的，可以给全。
 *
 * @param {Array} episodes 分集列表
 */
function buildCourseNodes(episodes) {
  const nodes = [];
  const segments = [];

  for (const episode of episodes.slice(0, 12)) {
    const keywords = extractKeywords(episode.title);
    if (keywords.length === 0) continue;

    nodes.push({
      timestamp: Math.max(0, Number(episode.start_time) || 0),
      keyword: keywords[0],
      type: "concept",
      context: `本讲的核心概念——${keywords.slice(1).join("、") || keywords[0]}。`,
      hint: `第 ${episode.index} 讲「${episode.title}」的关键点。`,
      context_label: "知识节点",
      origin: "generated",
    });

    if (keywords.length > 1) {
      segments.push({
        timestamp: Math.max(0, Number(episode.start_time) || 0),
        title: keywords[1],
        content: `围绕「${keywords[0]}」展开的讲解要点。`,
        origin: "generated",
      });
    }
  }

  return { nodes, segments };
}

/**
 * 为**单套系列的详情文件**生成全量知识节点 / 段落导读。
 *
 * 与 :func:`buildCourseNodes`（中台版）的区别：
 *
 * - 中台版只取**前 12 集**——中台 JSON 是首页级资源，不能膨胀；
 * - 详情版给**全集**——它是点进这套课才按需拉取的。
 *
 * 每集的节点带上 ``ep_id``，前端才能把它过滤到「本集专属」。
 *
 * @param {Array} episodes 分集列表
 */
function buildFullCourseNodes(episodes) {
  const nodes = [];
  const segments = [];

  for (const episode of episodes) {
    const keywords = extractKeywords(episode.title);
    if (keywords.length === 0) continue;

    const timestamp = Math.max(0, Number(episode.start_time) || 0);

    nodes.push({
      ep_id: episode.ep_id,
      timestamp,
      keyword: keywords[0],
      type: "concept",
      context: `本讲的核心概念——${keywords.slice(1).join("、") || keywords[0]}。`,
      hint: `第 ${episode.index} 讲「${episode.title}」的关键点。`,
      context_label: "知识节点",
      origin: "generated",
    });

    if (keywords.length > 1) {
      segments.push({
        ep_id: episode.ep_id,
        timestamp,
        title: keywords[1],
        content: `围绕「${keywords[0]}」展开的讲解要点。`,
        origin: "generated",
      });
    }
  }

  return { nodes, segments };
}

/**
 * 中台的分类——按**学段**分。
 */
function buildCategories(entries, grades, courseNodes = new Map()) {
  const stageOrder = ["primary", "junior", "senior"];
  const stageMeta = {
    primary: {
      title: "小学部",
      subtitle: "1–6 年级 · 6–12 岁",
      description:
        "部编版语文与人教版数学的同步精讲，按教材单元逐课时推进，覆盖识字、计算、阅读与表达的基础。",
      icon: "backpack",
    },
    junior: {
      title: "初中部",
      subtitle: "7–9 年级 · 12–15 岁",
      description:
        "部编版语文与人教版数学的同步精讲，兼顾新课标核心能力与中考衔接。",
      icon: "compass",
    },
    senior: {
      title: "高中部",
      subtitle: "10–12 年级 · 15–18 岁",
      description:
        "统编版语文与人教 A 版数学的同步精讲，覆盖必修、选择性必修与高考一轮复习。",
      icon: "mountain",
    },
  };

  return stageOrder.map((stage, order) => {
    const meta = stageMeta[stage];
    const stageGrades = grades.filter((grade) => grade.stage === stage);
    const resources = entries
      .filter((entry) => entry.stage === stage)
      .map((entry) => {
        const grade = stageGrades.find((item) => item.number === entry.grade);
        const { nodes, segments } = courseNodes.get(entry.id) ?? {
          nodes: [],
          segments: [],
        };

        return {
          id: entry.id,
          resource_type: "video",
          title: entry.title,
          source: `${entry.provider} · ${entry.author || "公开课"}`,
          provider: entry.provider,
          // ⚠️ ``url`` 在 schema 里要求是**合法的 http(s) 地址**——
          //    所以这里填信源主页（课程目录页），不是空串。
          //    真正每一讲的播放地址在 ``/data/courses/<id>.json`` 里。
          url: entry.sourceUrl || "https://www.bilibili.com/",
          // ⚠️ schema 要求 ``fallback_url`` 也是合法 http(s) 地址。
          //    这里指向同一信源——播放器在主源失败时会用它再试一次，
          //    而不是直接抛错。
          fallback_url: entry.sourceUrl || "https://www.bilibili.com/",
          ai_context: buildAiContext(entry, grade),
          tags: [
            STAGE_LABEL[stage],
            `第 ${entry.grade} 年级`,
            entry.subject === "chinese" ? "语文" : "数学",
          ],
          meta: {
            grade: entry.grade,
            grade_name: grade?.name ?? "",
            age_range: entry.ageRange,
            edition: entry.edition,
            volumes: entry.volumes,
            episode_count: entry.episodeCount,
            author: entry.author,
            cover: entry.pic,
            detail_path: entry.detailPath,
          },
          captions: [],
          interactive_nodes: nodes,
          guided_segments: segments,
          academic_intro: buildIntro(entry, grade),
          is_structured: true,
          is_default: false,
        };
      });

    return {
      id: `cat_k12_${stage}`,
      title: meta.title,
      subtitle: meta.subtitle,
      description: meta.description,
      icon: meta.icon,
      order,
      resources,
    };
  });
}

const STAGE_LABEL = {
  primary: "小学部",
  junior: "初中部",
  senior: "高中部",
};

/** 一句话简介。 */
function buildIntro(entry, grade) {
  const subjectName = entry.subject === "chinese" ? "语文" : "数学";
  return `本册${subjectName}同步课覆盖${entry.volumes.join("、")}全部教材单元，共 ${entry.episodeCount} 课时，按课时逐节精讲，配套课前诊断与随堂检测。`;
}

/** 助教的预置上下文。 */
function buildAiContext(entry, grade) {
  const subjectName = entry.subject === "chinese" ? "语文" : "数学";
  const age = grade ? `${grade.ageRange[0]}–${grade.ageRange[1]} 岁` : "";
  return [
    `这是《${entry.title}》——${subjectName}同步精讲。`,
    `教材版本：${entry.edition}；册次：${entry.volumes.join("、")}；适用年龄：${age}。`,
    `全系列共 ${entry.episodeCount} 课时，当前正在学习其中一课时。`,
    `讲解时请贴合该年级学生的认知水平：小学重直觉与形象，初中重推理与建模，高中重严谨推导与抽象表达。`,
    `如果学习者诊断结果显示基础薄弱，请从生活直觉与具体例子切入，避免直接堆砌高阶公式。`,
  ].join("\n");
}

main();
