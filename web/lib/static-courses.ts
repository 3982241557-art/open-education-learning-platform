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
 */
export function staticCourseIds(): string[] {
  return readStaticCourses().map((course) => course.id);
}
