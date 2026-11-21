"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Code2,
  FlaskConical,
  Globe,
  GraduationCap,
  Landmark,
  LineChart,
  Loader2,
  Plus,
  ScrollText,
  Search,
  Sparkles,
} from "lucide-react";
import {
  fetchGlobalHub,
  type GlobalHubCategory,
  type GlobalHubResource,
} from "@/lib/global-hub-api";
import {
  StreamingCourseCard,
  StreamingCourseEmpty,
} from "@/components/learning/StreamingCourseCard";
import { cn } from "@/lib/cn";
import { isStaticRuntime } from "@/shared/api/client";

/**
 * 流媒体课程库
 * =============
 *
 * 「课程」入口的**新面孔**——它跟「公开课」同源。
 *
 * 之前的问题
 * ----------
 *
 * ``/courses`` 指向的是旧版的**本地静态课程**：纯 markdown 正文，
 * 没有流媒体、没有时间戳气泡、没有 AI 伴学。用户从侧边栏点「课程」
 * 和点「公开课」，进的是**两个不同的产品**。
 *
 * 现在的做法
 * ----------
 *
 * 这一页**直接消费中台的公开课数据**——同一份资源、同一套装配结果。
 * 卡片上的每个数字都来自真实数据：知识节点数是装配器真的埋进去的
 * 时间点数量，字幕数是真的逐字字幕条数。
 *
 * 旧的本地课程没有丢——它们收在下面的「我导入的课程」里，通过
 * ``/learning/courses/<id>`` 访问，仍然支持完整的正文阅读 + AI 伴读。
 *
 * 学科分类
 * --------
 *
 * 沿用中台的**四大学科**（计算机与人工智能 / 哲学与人文 /
 * 经济学与社会科学 / 自然科学与心理学）——而不是旧版的「四大通识
 * 支柱」。原因是两套分类会指向两批不同的课程，用户会困惑于
 * 「同一个东西为什么有两个分类法」。
 */

/** 分类图标键 → 图标组件。与中台的 ``icon`` 字段对应。 */
const CATEGORY_ICONS: Record<string, typeof GraduationCap> = {
  "graduation-cap": GraduationCap,
  sparkles: Sparkles,
  landmark: Landmark,
  "book-open": BookOpen,
  globe: Globe,
  code: Code2,
  scroll: ScrollText,
  chart: LineChart,
  flask: FlaskConical,
};

/** 一门课 + 它所在的分类。 */
interface FlatCourse {
  resource: GlobalHubResource;
  category: GlobalHubCategory;
}

export function StreamingCourseLibrary() {
  const [categories, setCategories] = useState<GlobalHubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  /**
   * 是否处于**静态模式**。
   *
   * 静态模式下课程库是只读的——「导入课程」要写数据库，做不到。
   * 所以那个入口整个不渲染。
   */
  const [staticMode, setStaticMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { hub } = await fetchGlobalHub();
      setCategories(hub?.categories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void isStaticRuntime().then(setStaticMode);
  }, [load]);

  /** 把分类摊平成一条课程列表——分类只是分组，不该重复渲染标题。 */
  const allCourses = useMemo<FlatCourse[]>(
    () =>
      categories.flatMap((category) =>
        category.resources.map((resource) => ({ resource, category })),
      ),
    [categories],
  );

  /** 每个分类下有多少门课。 */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const category of categories) {
      map.set(category.id, category.resources.length);
    }
    return map;
  }, [categories]);

  /** 检索 + 分类筛选。 */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allCourses.filter(({ resource, category }) => {
      if (categoryId !== "all" && category.id !== categoryId) return false;
      if (!needle) return true;
      return (
        resource.title.toLowerCase().includes(needle) ||
        resource.source.toLowerCase().includes(needle) ||
        (resource.academic_intro ?? "").toLowerCase().includes(needle) ||
        resource.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [allCourses, categoryId, query]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] px-6 py-7 lg:px-9">
        {/* ── 头部 ── */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
              课程
            </h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
              精选公开课与系统课程都在这里，每门都能直接播放。点开就看。
            </p>
          </div>
          {!staticMode && (
            <Link
              href="/learning/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              <Plus size={13} strokeWidth={2} />
              导入课程
            </Link>
          )}
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
            {error}
          </p>
        )}

        {/* ── 检索 ── */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索课程标题、来源或标签…"
              aria-label="搜索课程"
              className="h-8 w-full rounded-lg border border-[var(--border)] bg-white pl-8 pr-3 text-[12.5px] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]/50"
            />
          </div>
        </div>

        {/* ── 学科分类 ── */}
        <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CategoryCard
            id="all"
            name="全部学科"
            blurb="所有学科的公开课。"
            count={allCourses.length}
            active={categoryId === "all"}
            onClick={() => setCategoryId("all")}
          />
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              id={category.id}
              name={category.title}
              blurb={category.subtitle}
              count={counts.get(category.id) ?? 0}
              active={categoryId === category.id}
              onClick={() =>
                setCategoryId(categoryId === category.id ? "all" : category.id)
              }
            />
          ))}
        </div>

        {/* ── 课程网格 ── */}
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[12.5px] text-[var(--muted-foreground)]">
            <Loader2 size={13} className="animate-spin" />
            正在加载课程…
          </div>
        ) : allCourses.length === 0 ? (
          <StreamingCourseEmpty
            title="还没有课程"
            description="去公开课大厅搜一搜全网资源，找到的课会立刻出现在这里。"
            action={
              <Link
                href="/hub"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
              >
                <Globe size={13} strokeWidth={2.2} />
                去公开课大厅
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <StreamingCourseEmpty
            title="没有匹配的课程"
            description="换个关键词或学科试试。"
          />
        ) : (
          <>
            <p className="mb-3 text-[11.5px] tabular-nums text-[var(--muted-foreground)]">
              共 {filtered.length} 门
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map(({ resource, category }) => {
                const Icon = CATEGORY_ICONS[category.icon] ?? BookOpen;
                return (
                  <li key={resource.id}>
                    <StreamingCourseCard
                      resource={resource}
                      categoryTitle={category.title}
                      categoryIcon={<Icon size={10} strokeWidth={2.2} />}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* ── 旧版本地课程 ──
         *
         * 用户自己导入的静态课程没有丢——它们仍然支持完整的正文阅读
         * 与 AI 伴读，只是换了个位置，不再跟流媒体课程抢同一批卡片。
         */}
        <section className="mt-10 border-t border-[var(--border)] pt-6">
          <h2 className="mb-1 text-[15px] font-semibold tracking-[-0.01em]">
            我导入的课程
          </h2>
          <p className="mb-3 text-[12px] text-[var(--muted-foreground)]">
            你自己导入的文本课程——支持逐节阅读、划线与 AI 伴读。
          </p>
          <LegacyCourseShelf />
        </section>
      </div>
    </div>
  );
}

/**
 * 旧版本地课程的入口条。
 *
 * 刻意**不重复实现**旧版课程库的渲染逻辑——那一套（四大支柱筛选、
 * 前置知识分级）只在课程库内部有意义，而现在课程库的主体已经是
 * 流媒体公开课了。这里只保留一个简洁的列表 + 直达链接。
 */
function LegacyCourseShelf() {
  const [courses, setCourses] = useState<
    Array<{ id: string; title: string; description?: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { listCourses } = await import("@/lib/courses-api");
        const data = await listCourses();
        if (!alive) return;
        setCourses(
          data.map((course) => ({
            id: course.id,
            title: course.title,
            description: course.description,
          })),
        );
      } catch {
        /* 拉不到本地课程不该让整页失败 */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 py-4 text-[12px] text-[var(--muted-foreground)]">
        <Loader2 size={12} className="animate-spin" />
        正在加载…
      </p>
    );
  }

  if (courses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-[12px] text-[var(--muted-foreground)]">
        还没有导入过课程。
      </p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <li key={course.id}>
          <Link
            href={`/learning/courses/${encodeURIComponent(course.id)}`}
            className="flex h-full items-start gap-2 rounded-lg border border-[var(--border)] bg-white p-3 transition-colors hover:border-[var(--primary)]/40"
          >
            <BookOpen size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">
                {course.title}
              </span>
              {course.description ? (
                <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                  {course.description}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 一个学科分类卡片。 */
function CategoryCard({
  id,
  name,
  blurb,
  count,
  active,
  onClick,
}: {
  id: string;
  name: string;
  blurb: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[id] ?? BookOpen;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--seek-bean-soft)]"
          : "border-[var(--border)] bg-white hover:border-[var(--primary)]/30",
      )}
    >
      <div className="flex items-center gap-2">
        {id !== "all" ? (
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
              active
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--muted)] text-[var(--muted-foreground)]",
            )}
          >
            <Icon size={13} strokeWidth={1.9} />
          </span>
        ) : null}
        <span className="text-[13px] font-medium">{name}</span>
        <span
          className={cn(
            "ml-auto text-[11px] tabular-nums",
            active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]",
          )}
        >
          {count}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        {blurb}
      </p>
    </button>
  );
}
