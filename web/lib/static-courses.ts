/**
 * 静态导出用的课程清单
 * =====================
 *
 * ``generateStaticParams`` 需要在**构建期**知道有哪些动态路由要生成。
 * 但课程数据在后端（``backend/data/courses/``）——Next 的构建进程
 * 读不到 Python 那边的状态。
 *
 * 解决办法：构建期**直接读文件**。
 *
 * 为什么用 ``fs`` 而不是 ``fetch``
 * ------------------------------
 *
 * ``generateStaticParams`` 跑在**构建期**，那时候站点还没上线，
 * 后端 URL 也可能根本不存在。读本地文件是唯一可靠的方式。
 *
 * 数据从哪来
 * ----------
 *
 * ``web/public/data/courses/*.json``——由 ``scripts/sync-static-data.mjs``
 * 在 ``prebuild`` 阶段从 ``backend/data/courses/`` 同步过来。
 *
 * 所以构建顺序是：同步数据 → ``next build`` → 读同步后的文件。
 */

/** 课程 JSON 的存放目录（相对 ``web/``）。 */
const COURSES_DIR = "public/data/courses";

/** 一门课的最小信息。 */
export interface StaticCourse {
  /** 课程 id——也是路由参数。 */
  id: string;
  /** 课程标题。 */
  title: string;
  /** 章节数。 */
  chapterCount: number;
  /** 页数。 */
  pageCount: number;
}

/**
 * 读所有可静态导出的课程。
 *
 * 读不出来时返回**空数组**——不抛错。构建期抛错会让整个站点
 * 发不出去，而「没有课程页」只是少几个页面而已。
 */
export function readStaticCourses(): StaticCourse[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");

  const dir = path.join(process.cwd(), COURSES_DIR);
  if (!fs.existsSync(dir)) return [];

  const courses: StaticCourse[] = [];

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    // 跳过 schema 文件——它们不是课程。
    if (file.includes("schema") || file.includes("template")) continue;

    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf8"),
      ) as any;
      const book = raw?.book;
      if (!book?.id) continue;

      courses.push({
        id: String(book.id),
        title: String(book.title ?? book.id),
        chapterCount: Number(book.chapter_count ?? 0) || 0,
        pageCount: Number(book.page_count ?? 0) || 0,
      });
    } catch {
      /* 单个文件解析失败不影响其它 */
    }
  }

  return courses.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 课程 id 列表——``generateStaticParams`` 用的。
 *
 * ⚠️ 必须包含 **K12 的 24 套系列**——不然 ``/learning/courses/[id]/edit``
 *    这类页面的 ``generateStaticParams()`` 会返回**空数组**，
 *    而 Next.js 在 ``output: "export"`` 下会直接报错：
 *
 *    .. code-block:: text
 *
 *        Page "/learning/courses/[courseId]/edit" is missing
 *        "generateStaticParams()" so it cannot be used with
 *        "output: export" config.
 *
 *    空数组不是「没课程」，而是「这个动态路由无法导出」——会**中断
 *    整个构建**。所以这里永远要保证至少有一条。
 */
export function staticCourseIds(): string[] {
  const ids = new Set<string>([
    ...readStaticCourses().map((course) => course.id),
    ...staticK12SeriesIds(),
  ]);
  return [...ids].sort();
}

/**
 * 中台里的一条资源（最小信息）。
 */
export interface StaticHubResource {
  /** 资源 id。 */
  id: string;
  /** 标题。 */
  title: string;
  /** 来源标注。 */
  source: string;
  /** 来源平台。 */
  provider: string;
  /** 所属分类 id。 */
  categoryId: string;
  /** 分类标题。 */
  categoryTitle: string;
  /** 分集数——0 表示这条资源没有拆分。 */
  episodeCount: number;
  /** 分集 id 列表——构建期用来生成第二层路由。 */
  episodeIds: string[];
}

/**
 * 读中台里**有分集**的资源。
 *
 * 两级课程结构的第一层（``/courses/[id]``）只为**有分集**的课生成
 * 页面——单集资源没有「目录页」可言，它直接就是第二层。
 *
 * ⚠️ 必须走 ``require("node:fs")`` 而不是 ``fetch``——这段代码跑在
 *    **构建期**，那时候站点还没上线。
 */
export function readStaticHubResources(): StaticHubResource[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");

  const file = path.join(
    process.cwd(),
    "public",
    "data",
    "global_resource_hub.json",
  );
  if (!fs.existsSync(file)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as any;
    const hub = raw?.hub ?? raw;
    const categories = Array.isArray(hub?.categories) ? hub.categories : [];

    const resources: StaticHubResource[] = [];
    for (const category of categories) {
      const list = Array.isArray(category?.resources) ? category.resources : [];
      for (const resource of list) {
        if (!resource?.id) continue;
        const episodes = Array.isArray(resource.episodes) ? resource.episodes : [];
        resources.push({
          id: String(resource.id),
          title: String(resource.title ?? resource.id),
          source: String(resource.source ?? ""),
          provider: String(resource.provider ?? ""),
          categoryId: String(category?.id ?? ""),
          categoryTitle: String(category?.title ?? ""),
          episodeCount: episodes.length,
          episodeIds: episodes
            .map((episode: any) => String(episode?.ep_id ?? "").trim())
            .filter(Boolean),
        });
      }
    }
    return resources;
  } catch {
    return [];
  }
}

/**
 * 有分集的中台资源 id——第一层目录页的 ``generateStaticParams``。
 */
export function staticHubCourseIds(): string[] {
  return readStaticHubResources()
    .filter((resource) => resource.episodeCount > 0)
    .map((resource) => resource.id);
}

/**
 * 一套 K12 系列（构建期）。
 */
export interface StaticK12Series {
  /** 系列 id。 */
  id: string;
  /** 完整课程名。 */
  title: string;
  /** 课时数。 */
  episodeCount: number;
  /** 课时 id 列表。 */
  episodeIds: string[];
}

/**
 * 读 K12 的 24 套系列。
 *
 * 数据源是 ``public/data/k12-index.json``（索引）与
 * ``public/data/courses/k12_*.json``（详情）——由
 * ``scripts/build-k12-static.mjs`` 产出。
 *
 * ⚠️ 构建期读文件，不走 ``fetch``——理由同 :func:`readStaticHubResources`。
 */
export function readStaticK12Series(): StaticK12Series[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");

  const coursesDir = path.join(process.cwd(), "public", "data", "courses");
  if (!fs.existsSync(coursesDir)) return [];

  const series: StaticK12Series[] = [];

  for (const file of fs.readdirSync(coursesDir)) {
    // 只认 K12 的系列文件。
    if (!file.startsWith("k12_") || !file.endsWith(".json")) continue;

    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(coursesDir, file), "utf8"),
      ) as any;
      if (!raw?.id) continue;

      const episodes = Array.isArray(raw.episodes) ? raw.episodes : [];
      series.push({
        id: String(raw.id),
        title: String(raw.title ?? raw.id),
        episodeCount: episodes.length,
        episodeIds: episodes
          .map((episode: any) => String(episode?.ep_id ?? "").trim())
          .filter(Boolean),
      });
    } catch {
      /* 单个文件解析失败不影响其它 */
    }
  }

  return series.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * K12 系列 id——第一层目录页的 ``generateStaticParams``。
 */
export function staticK12SeriesIds(): string[] {
  return readStaticK12Series().map((series) => series.id);
}
