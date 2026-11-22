"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import {
  deletePlan,
  fetchPlans,
  savePlan,
  setPlanProgress,
  type StudyPlan,
} from "@/lib/learning-api";
import { emitLearningEvent, onLearningEvent, PLAN_UPDATED } from "@/lib/learning-events";
import { listCourses } from "@/lib/courses-api";
import { CalendarToolbar, type CalendarCursor, type CalendarScope } from "@/components/plan/CalendarToolbar";
import { CalendarView } from "@/components/plan/CalendarView";
import { cn } from "@/lib/cn";
import { useLocale } from "@/context/LocaleContext";

/**
 * 学习计划页面 —— 四级可缩放日历
 * ================================
 *
 * 原来这里是一张扁平的列表。现在改成**日历**，因为学习计划天然有
 * 时间维度：年度目标、月度战役、某天的任务、某个时刻的时段——
 * 它们需要落在不同的时间粒度上，列表塞不下这种层级。
 *
 * 四个层级
 * --------
 *
 * =========  ==================================  ==================
 * 层级        适合挂什么                            精度
 * =========  ==================================  ==================
 * 年视图      「2026 年度通读计划」                一年
 * 月视图      「11 月攻克 CS61A」                   一月
 * 日视图      「11 月 5 日读完第三章」               一天
 * 时刻表      「11月5日 20:00-21:30 精读《论语》」   一小时
 * =========  ==================================  ==================
 *
 * 双向联动
 * --------
 *
 * - **日历 → AI**：计划存在同一份后端存储里，AI 下次对话时能看到
 *   它们的进度；
 * - **AI → 日历**：AI 通过 ``manage_plan`` 制定的计划自动出现。
 *   AI 写「下周五」这种自然语言时，后端会推断出对应粒度并落到
 *   正确的格子里——用户不用手动挪。
 */
export default function PlanPage() {
  const { tk } = useLocale();
  const searchParams = useSearchParams();
  /** 从学情中心「调整计划」跳过来时带的课程 id。 */
  const boundCourseId = searchParams.get("course") ?? "";
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDetail, setDraftDetail] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftItems, setDraftItems] = useState("");
  /** 新建时预定的日历位置（由日历格子点击带入）。 */
  const [draftAnchor, setDraftAnchor] = useState<{ start_at: string; scope: CalendarScope } | null>(null);
  /** 编辑中的计划 id——空表示新建。 */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 新建 / 编辑时绑定的课程。 */
  const [draftCourseId, setDraftCourseId] = useState("");
  /** 课程 id → 标题——下拉框要显示人话，不是 id。 */
  const [courseTitles, setCourseTitles] = useState<Record<string, string>>({});

  // ── 日历状态 ──
  const [scope, setScope] = useState<CalendarScope>("month");
  const [cursor, setCursor] = useState<CalendarCursor>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await fetchPlans());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 别的模块改了计划（AI 制定了计划、课程页勾选了步骤），
   * 这里的日历格立刻跟着变——不用手动刷新。
   */
  useEffect(() => {
    const refresh = () => void load();
    const off = onLearningEvent(PLAN_UPDATED, refresh);
    return off;
  }, [load]);

  /**
   * 拉一次课程清单——给「绑定课程」下拉框显示标题。
   */
  useEffect(() => {
    let cancelled = false;
    void listCourses()
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const course of list) map[course.id] = course.title;
        setCourseTitles(map);
      })
      .catch(() => {
        /* 拉不到就退回显示 id */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 从学情中心「调整计划」跳过来 → 直接打开绑定该课程的计划编辑。
   *
   * 如果这门课已经有计划，就把第一条填进表单；否则开一个空表单，
   * 但课程已经预选好了。
   */
  useEffect(() => {
    // 必须等计划**加载完**再判断——加载中时 plans 还是空数组，
    // 如果那时就判定「没有计划」，会先弹一个空表单，随后被加载
    // 到的既有计划覆盖，用户看到的是表单闪一下又换内容。
    if (!boundCourseId || loading) return;
    const existing = plans.find((plan) => plan.course_id === boundCourseId);
    if (!existing) {
      // 没有既有计划 → 开一个绑定好的空表单。
      setEditingId(null);
      setDraftTitle("");
      setDraftDetail("");
      setDraftDue("");
      setDraftItems("");
      setDraftCourseId(boundCourseId);
      setDraftAnchor(null);
      setCreating(true);
      return;
    }
    setEditingId(existing.id);
    setDraftTitle(existing.title);
    setDraftDetail(existing.detail);
    setDraftDue(existing.due);
    setDraftItems(existing.items.join("\n"));
    setDraftCourseId(boundCourseId);
    setDraftAnchor(
      existing.start_at
        ? {
            start_at: existing.start_at,
            scope: (existing.scope as CalendarScope) || "day",
          }
        : null,
    );
    setCreating(true);
  }, [boundCourseId, loading, plans]);

  /** 新建计划。 */
  const create = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) return;
    const items = draftItems
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      await savePlan(draftCourseId, {
        id: editingId ?? undefined,
        title,
        detail: draftDetail.trim(),
        due: draftDue.trim(),
        items,
        origin: "user",
        // 有锚点就按锚点的粒度与时间点落位。
        scope: draftAnchor?.scope,
        start_at: draftAnchor?.start_at,
      });
      setDraftTitle("");
      setDraftDetail("");
      setDraftDue("");
      setDraftItems("");
      setDraftAnchor(null);
      setEditingId(null);
      setDraftCourseId("");
      setCreating(false);
      await load();
      emitLearningEvent(PLAN_UPDATED, { planId: editingId ?? undefined, source: "plan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [draftAnchor, draftCourseId, draftDetail, draftDue, draftItems, draftTitle, editingId, load]);

  /** 勾选一个步骤。 */
  const toggleStep = useCallback(
    async (plan: StudyPlan, index: number) => {
      const done = plan.done === index + 1 ? index : index + 1;
      try {
        await setPlanProgress(plan.course_id || "", plan.id, done);
        await load();
        emitLearningEvent(PLAN_UPDATED, { planId: plan.id, source: "plan" });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [load],
  );

  /** 删除计划。 */
  const remove = useCallback(
    async (plan: StudyPlan) => {
      try {
        await deletePlan(plan.course_id || "", plan.id);
        await load();
        emitLearningEvent(PLAN_UPDATED, { planId: plan.id, source: "plan" });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [load],
  );

  /** 从日历某个格子点「新建」。 */
  const createAt = useCallback((anchor: { start_at: string; scope: CalendarScope }) => {
    setDraftAnchor(anchor);
    // 顺带把目标时间填上——用户不用再敲一遍。
    setDraftDue(anchor.scope === "slot" ? anchor.start_at.replace("T", " ") : anchor.start_at);
    setCreating(true);
  }, []);

  /** 回到今天。 */
  const today = useCallback(() => {
    const now = new Date();
    setCursor({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
  }, []);

  /**
   * 课程下拉里的候选。
   *
   * 计划要绑定到课程上，学情中心才能把计划与进度放在一起看。
   */
  const courseOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const plan of plans) {
      if (plan.course_id) ids.add(plan.course_id);
    }
    if (boundCourseId) ids.add(boundCourseId);
    return Array.from(ids).map((id) => ({
      id,
      title: courseTitles[id] ?? id,
    }));
  }, [plans, boundCourseId, courseTitles]);

  // 当前层级里正在进行的计划——侧栏列表用。
  const visiblePlans = useMemo(() => {
    const key = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
    if (scope === "year") {
      return plans.filter((plan) => (plan.start_at || "").startsWith(String(cursor.year)));
    }
    if (scope === "month") {
      return plans.filter((plan) => (plan.start_at || "").startsWith(key));
    }
    if (scope === "day") {
      const dayKey = `${key}-${String(cursor.day).padStart(2, "0")}`;
      return plans.filter((plan) => (plan.start_at || "").startsWith(dayKey));
    }
    return plans;
  }, [cursor, plans, scope]);

  const active = visiblePlans.filter((plan) => !plan.completed);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 min-h-0 flex-col px-6 py-6 lg:px-9">
        <header className="mb-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{tk("nav.plan")}</h1>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
            {tk("nav.plan")} · {tk("action.save")} · {tk("action.continue")}
          </p>
        </header>

        {error && (
          <p className="mb-3 rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
            {error}
          </p>
        )}

        {/* 新建表单 */}
        {creating && (
          <section className="mb-4 rounded-xl bg-[var(--card)] p-4 ring-1 ring-[var(--border)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">
                {editingId ? tk("action.edit") : tk("action.save")}
              </h2>
              {draftAnchor && (
                <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10.5px] text-[var(--primary)]">
                  落在 {draftAnchor.start_at.replace("T", " ")}
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="计划标题，例如：两周内背完《静夜思》全篇"
                aria-label="计划标题"
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--foreground)]/25"
              />
              <input
                value={draftDetail}
                onChange={(event) => setDraftDetail(event.target.value)}
                placeholder="说明（可选），例如：配合《将进酒》一起读"
                aria-label="计划说明"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--foreground)]/25"
              />
              <div className="flex items-center gap-2">
                <input
                  value={draftDue}
                  onChange={(event) => setDraftDue(event.target.value)}
                  placeholder="目标时间，例如：2026-11-20 / 下周五 / 11月5日 20:00"
                  aria-label="目标时间"
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--foreground)]/25"
                />
              </div>
              <textarea
                value={draftItems}
                onChange={(event) => setDraftItems(event.target.value)}
                rows={3}
                placeholder={"具体步骤，每行一条：\n第 1-10 首\n第 11-20 首"}
                aria-label="具体步骤"
                className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--foreground)]/25"
              />
              {/* 绑定课程——计划要落到某门课上，学情中心才能把它
                  和这门课的进度放在一起看。 */}
              <label className="flex items-center gap-2 text-[11.5px] text-[var(--muted-foreground)]">
                绑定课程
                <select
                  value={draftCourseId}
                  onChange={(event) => setDraftCourseId(event.target.value)}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--foreground)]/25"
                >
                  <option value="">—</option>
                  {courseOptions.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void create()}
                disabled={!draftTitle.trim()}
                className="rounded-lg bg-[var(--foreground)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {editingId ? "保存修改" : "创建"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setDraftAnchor(null);
                  setEditingId(null);
                  setDraftCourseId("");
                }}
                className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[12.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
              >
                取消
              </button>
            </div>
          </section>
        )}

        {/* 日历主体 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <CalendarToolbar
            scope={scope}
            cursor={cursor}
            onScopeChange={setScope}
            onCursorChange={setCursor}
            onToday={today}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* 日历区 */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              {loading ? (
                <p className="flex items-center gap-1.5 p-8 text-[12.5px] text-[var(--muted-foreground)]">
                  <Loader2 size={13} className="animate-spin" />
                  正在载入计划…
                </p>
              ) : (
                <CalendarView
                  scope={scope}
                  cursor={cursor}
                  plans={plans}
                  onScopeChange={setScope}
                  onCursorChange={setCursor}
                  onCreateAt={createAt}
                  onSelectPlan={(plan) => {
                    setEditingId(plan.id);
                    setDraftTitle(plan.title);
                    setDraftDetail(plan.detail);
                    setDraftDue(plan.due);
                    setDraftItems(plan.items.join("\n"));
                    setDraftCourseId(plan.course_id || "");
                    setDraftAnchor(
                      plan.start_at
                        ? {
                            start_at: plan.start_at,
                            scope: (plan.scope as CalendarScope) || "day",
                          }
                        : null,
                    );
                    setCreating(true);
                  }}
                />
              )}
            </div>

            {/* 侧栏：这一层的计划清单 */}
            <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--muted)]/20 p-3 lg:block">
              <p className="mb-2 px-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                本层计划
                <span className="ml-1.5 font-normal">{visiblePlans.length}</span>
              </p>

              {visiblePlans.length === 0 ? (
                <div className="px-1 py-6 text-center">
                  <Target
                    size={18}
                    strokeWidth={1.3}
                    className="mx-auto mb-1.5 text-[var(--muted-foreground)]/50"
                  />
                  <p className="text-[11.5px] text-[var(--muted-foreground)]">
                    这一层还没有计划
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--muted-foreground)]/70">
                    点日历上的格子新建，或让 AI 帮你排一份
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {active.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onToggle={(index) => void toggleStep(plan, index)}
                      onRemove={() => void remove(plan)}
                    />
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => {
                  setDraftAnchor(null);
                  setCreating(true);
                }}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-[11.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
              >
                <Plus size={12} />
                新建计划
              </button>
            </aside>
          </div>
        </div>

        {plans.length === 0 && !loading && (
          <p className="mt-3 text-center text-[11.5px] text-[var(--muted-foreground)]">
            还没有任何计划。你可以在日历上新建，也可以在课程页让 AI 帮你制定——
            AI 写的「下周五」「11月」这类宽泛时间会自动落到对应格子里。
            {" "}
            <Link href="/learning" className="underline underline-offset-2">
              去课程页
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/** 一条计划。 */
function PlanCard({
  plan,
  onToggle,
  onRemove,
}: {
  plan: StudyPlan;
  onToggle: (index: number) => void;
  onRemove: () => void;
}) {
  const percent = plan.total > 0 ? (plan.done / plan.total) * 100 : 0;

  return (
    <li
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5 transition-opacity",
        plan.completed && "opacity-65",
      )}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "text-[12px] font-medium leading-snug",
              plan.completed && "line-through",
            )}
          >
            {plan.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            {plan.start_at && (
              <span className="tabular-nums">{plan.start_at.replace("T", " ")}</span>
            )}
            <span>{plan.origin === "ai" ? "AI 制定" : "我创建"}</span>
            {plan.total > 0 && (
              <span>
                {plan.done}/{plan.total} 步
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="删除计划"
          className="shrink-0 rounded p-1 text-[var(--muted-foreground)] transition-colors hover:text-destructive"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {plan.total > 0 && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              plan.completed ? "bg-emerald-500" : "bg-[var(--primary)]",
            )}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      )}

      {plan.items.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {plan.items.map((item, index) => {
            const checked = index < plan.done;
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => onToggle(index)}
                  className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--muted)]/40"
                >
                  {checked ? (
                    <CheckCircle2
                      size={10}
                      strokeWidth={1.9}
                      className="mt-[3px] shrink-0 text-emerald-600 dark:text-emerald-500"
                    />
                  ) : (
                    <Circle
                      size={10}
                      strokeWidth={1.9}
                      className="mt-[3px] shrink-0 text-[var(--muted-foreground)]/45"
                    />
                  )}
                  <span
                    className={cn(
                      "text-[10.5px] leading-relaxed",
                      checked && "text-[var(--muted-foreground)] line-through",
                    )}
                  >
                    {item}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
