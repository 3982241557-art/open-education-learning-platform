"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Loader2,
  Lock,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  fetchLearningPath,
  generateQuiz,
  submitQuiz,
  type LearningPath,
  type MasteryLayer,
  type MasteryQuestion,
  type SkillNode,
} from "@/lib/progress-api";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/concept-actions";

/**
 * 技能树 · 学习阶梯
 * ==================
 *
 * 可汗学院模式的「阶梯路径导航」——四层，从入门启蒙到学位进阶。
 *
 * 为什么是**阶梯**而不是清单
 * -------------------------
 *
 * 清单告诉你「有什么」，阶梯告诉你**先做什么**。
 *
 * 具体的差别在锁定逻辑：第二层被第一层锁住。没学完入门就点不开
 * 核心精修——这不是限制，是**保护**。一个连线性代数基本概念都没有
 * 的人，直接跳到「特征值与对角化」只会挫败。
 *
 * 但锁定是**软的**：被锁的层仍然可见、可点——点它会告诉你「先完成
 * 上一阶段」。硬性禁用按钮只会让人以为页面坏了。
 *
 * 随堂检测
 * --------
 *
 * 每个节点挂一组自测题（3~5 道，AI 基于该节点的知识内容生成）。
 * 答对 ≥ 80% → 节点点亮为「已达标」，并**解锁下一层**。
 *
 * 检测题是**按需生成**的——不是预先为 603 个节点各生成 3 道题。
 * 那需要 1800 道题的生成量，而其中绝大部分永远没人会答。
 */
export function SkillTree({
  courseId,
  onSelectNode,
  className = "",
}: {
  courseId: string;
  /** 点一个节点——通常是跳到视频的对应时间点。 */
  onSelectNode?: (node: SkillNode) => void;
  className?: string;
}) {
  const [path, setPath] = useState<LearningPath | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>(["tier_1"]);
  const [quizNode, setQuizNode] = useState<SkillNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPath(await fetchLearningPath(courseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (layerId: string) => {
    setExpanded((prev) =>
      prev.includes(layerId)
        ? prev.filter((id) => id !== layerId)
        : [...prev, layerId],
    );
  };

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 px-4 py-6 text-[12px] text-[var(--muted-foreground)]">
        <Loader2 size={13} className="animate-spin" />
        正在装配学习阶梯…
      </p>
    );
  }

  if (error) {
    return (
      <p className="m-3 rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
        {error}
      </p>
    );
  }

  if (!path || path.node_count === 0) {
    return (
      <p className="px-4 py-6 text-[12px] text-[var(--muted-foreground)]">
        这门课还没有可用的技能节点。
      </p>
    );
  }

  return (
    <div className={cn("", className)} data-seek-skill-tree>
      {/* 阶梯总览 */}
      <div className="mb-3 flex flex-wrap items-center gap-3 px-4 pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-[var(--muted-foreground)]">
            学习阶梯
          </span>
          <span className="text-[13px] font-semibold tabular-nums">
            {path.met_count}
            <span className="text-[var(--muted-foreground)]"> / {path.node_count}</span>
          </span>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            节点达标
          </span>
        </div>
        <div className="h-3 w-px bg-[var(--border)]" />
        <div className="flex items-center gap-1.5">
          <Target size={11} strokeWidth={2.2} className="text-[var(--primary)]" />
          <span className="text-[11.5px] text-[var(--muted-foreground)]">
            掌握度
          </span>
          <span className="text-[13px] font-semibold tabular-nums">
            {Math.round(path.mastery * 100)}%
          </span>
        </div>
      </div>

      {/* 四层 */}
      <ol className="space-y-1.5 px-2 pb-3">
        {path.layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            expanded={expanded.includes(layer.id)}
            onToggle={() => toggle(layer.id)}
            onSelectNode={onSelectNode}
            onQuiz={setQuizNode}
          />
        ))}
      </ol>

      {quizNode ? (
        <QuizPanel
          courseId={courseId}
          node={quizNode}
          onClose={() => setQuizNode(null)}
          onDone={() => {
            setQuizNode(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

/** 一层阶梯。 */
function LayerRow({
  layer,
  expanded,
  onToggle,
  onSelectNode,
  onQuiz,
}: {
  layer: MasteryLayer;
  expanded: boolean;
  onToggle: () => void;
  onSelectNode?: (node: SkillNode) => void;
  onQuiz: (node: SkillNode) => void;
}) {
  const percent = Math.round(layer.coverage * 100);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-lg border",
        layer.locked
          ? "border-[var(--border)] bg-[var(--muted)]/25"
          : "border-[var(--border)] bg-white",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--muted)]/40"
      >
        {/* 层级序号 */}
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            layer.all_met
              ? "bg-emerald-500 text-white"
              : layer.locked
                ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
                : "bg-[var(--primary)] text-white",
          )}
        >
          {layer.all_met ? (
            <Check size={12} strokeWidth={3} />
          ) : layer.locked ? (
            <Lock size={11} strokeWidth={2.4} />
          ) : (
            layer.order + 1
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-[12.5px] font-medium">{layer.name}</span>
            <span className="text-[10px] tracking-[0.06em] text-[var(--muted-foreground)] uppercase">
              {layer.en}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] text-[var(--muted-foreground)]">
            {layer.locked ? layer.unlock_reason : layer.blurb}
          </span>
        </span>

        {/* 本层进度 */}
        <span className="shrink-0 text-right">
          <span className="block text-[11px] font-medium tabular-nums">
            {layer.met_count}/{layer.node_count}
          </span>
          <span className="mt-0.5 block h-1 w-14 overflow-hidden rounded-full bg-[var(--muted)]">
            <span
              className={cn(
                "block h-full rounded-full",
                layer.all_met ? "bg-emerald-500" : "bg-[var(--primary)]",
              )}
              style={{ width: `${percent}%` }}
            />
          </span>
        </span>

        <ChevronDown
          size={13}
          strokeWidth={2.4}
          className={cn(
            "shrink-0 text-[var(--muted-foreground)] transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {expanded && (
        <ul className="space-y-0.5 border-t border-[var(--border)] px-1.5 py-1.5">
          {layer.nodes.length === 0 ? (
            <li className="px-2 py-1.5 text-[11px] text-[var(--muted-foreground)]">
              这一层暂时没有节点。
            </li>
          ) : (
            layer.nodes.map((node) => (
              <li key={node.key} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectNode?.(node)}
                  disabled={layer.locked}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    layer.locked
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-[var(--muted)]/50",
                  )}
                  title={node.hint || node.title}
                >
                  <StatusIcon status={node.status} />
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                    {formatTimestamp(node.timestamp)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px]">
                    {node.title}
                  </span>
                  {node.accuracy !== null ? (
                    <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)]">
                      {Math.round(node.accuracy * 100)}%
                    </span>
                  ) : null}
                </button>

                {/* 随堂检测 */}
                <button
                  type="button"
                  onClick={() => onQuiz(node)}
                  disabled={layer.locked}
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10.5px] transition-colors",
                    "border border-[var(--border)] text-[var(--muted-foreground)]",
                    "hover:border-[var(--primary)]/40 hover:text-[var(--primary)]",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                  title="随堂检测——3 道概念自测题"
                >
                  <Sparkles size={9} strokeWidth={2.4} />
                  检测
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

/** 掌握度三档图标。 */
function StatusIcon({ status }: { status: string }) {
  if (status === "已达标") {
    return (
      <CheckCircle2 size={12} strokeWidth={2.2} className="shrink-0 text-emerald-500" />
    );
  }
  if (status === "学习中") {
    return (
      <CircleDashed size={12} strokeWidth={2.2} className="shrink-0 text-amber-500" />
    );
  }
  return (
    <span className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]" />
  );
}

/**
 * 随堂检测面板
 * =============
 *
 * 生成题目 → 作答 → 批改 → 达标解锁。
 *
 * 三步都在这一个面板里完成——用户不需要跳页。
 */
function QuizPanel({
  courseId,
  node,
  onClose,
  onDone,
}: {
  courseId: string;
  node: SkillNode;
  onClose: () => void;
  onDone: () => void;
}) {
  const [questions, setQuestions] = useState<MasteryQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 每题选中的选项下标；``null`` 表示未选。 */
  const [picked, setPicked] = useState<(number | null)[]>([]);
  const [graded, setGraded] = useState(false);
  const [result, setResult] = useState<{
    accuracy: number;
    passed: boolean;
    correct_count: number;
    question_count: number;
  } | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGraded(false);
    setResult(null);
    try {
      const data = await generateQuiz({
        course_id: courseId,
        resource_id: node.resource_id,
        node_key: node.key,
        title: node.title,
        context: node.context,
        hint: node.hint,
        count: 3,
      });
      setQuestions(data.questions);
      setPicked(data.questions.map(() => null));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [courseId, node]);

  useEffect(() => {
    void generate();
  }, [generate]);

  const grade = useCallback(async () => {
    const answers = questions.map((question, index) => ({
      index,
      correct: picked[index] === question.answer,
    }));
    setGraded(true);
    try {
      const data = await submitQuiz({
        course_id: courseId,
        node_key: node.key,
        resource_id: node.resource_id,
        title: node.title,
        questions,
        answers,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [questions, picked, courseId, node]);

  const answeredCount = picked.filter((value) => value !== null).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="随堂检测"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Sparkles size={15} strokeWidth={2.2} className="text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">随堂检测</p>
            <p className="truncate text-[11px] text-[var(--muted-foreground)]">
              {node.title} · {formatTimestamp(node.timestamp)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        {/* 题目 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          {loading ? (
            <div className="flex flex-col items-center py-10">
              <Loader2 size={18} className="animate-spin text-[var(--muted-foreground)]" />
              <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
                AI 正在出题…（约 5~15 秒）
              </p>
            </div>
          ) : error ? (
            <p className="rounded-lg border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 px-3 py-2 text-[12px] text-[var(--destructive)]">
              {error}
            </p>
          ) : (
            <ol className="space-y-4">
              {questions.map((question, index) => (
                <li key={index}>
                  <p className="mb-2 text-[12.5px] leading-relaxed">
                    <span className="mr-1.5 text-[var(--muted-foreground)] tabular-nums">
                      {index + 1}.
                    </span>
                    {question.question}
                  </p>
                  <div className="space-y-1.5 pl-5">
                    {question.options.map((option, optionIndex) => {
                      const selected = picked[index] === optionIndex;
                      const isCorrect = optionIndex === question.answer;
                      const showCorrect = graded && isCorrect;
                      const showWrong = graded && selected && !isCorrect;
                      return (
                        <button
                          key={optionIndex}
                          type="button"
                          disabled={graded}
                          onClick={() =>
                            setPicked((prev) => {
                              const next = [...prev];
                              next[index] = optionIndex;
                              return next;
                            })
                          }
                          className={cn(
                            "flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors",
                            showCorrect
                              ? "border-emerald-500/50 bg-emerald-50"
                              : showWrong
                                ? "border-[var(--destructive)]/40 bg-[var(--destructive)]/5"
                                : selected
                                  ? "border-[var(--primary)]/50 bg-[var(--seek-bean-soft)]"
                                  : "border-[var(--border)] hover:border-[var(--primary)]/30",
                            graded && "cursor-default",
                          )}
                        >
                          <span className="mt-px shrink-0 font-mono text-[10.5px] text-[var(--muted-foreground)]">
                            {String.fromCharCode(65 + optionIndex)}
                          </span>
                          <span className="min-w-0 flex-1">{option}</span>
                          {showCorrect ? (
                            <Check size={12} strokeWidth={2.6} className="mt-px shrink-0 text-emerald-600" />
                          ) : showWrong ? (
                            <X size={12} strokeWidth={2.6} className="mt-px shrink-0 text-[var(--destructive)]" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {graded ? (
                    <p className="mt-1.5 pl-5 text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                      {question.explanation}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* 底部 */}
        <div className="shrink-0 border-t border-[var(--border)] bg-white px-4 py-3">
          {result ? (
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                  result.passed
                    ? "bg-emerald-500 text-white"
                    : "bg-amber-500 text-white",
                )}
              >
                {Math.round(result.accuracy * 100)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium">
                  {result.passed
                    ? "已达标——这一节点点亮，下一阶解锁。"
                    : "未达标——正确率需达 80%。再看看讲解，然后重来一次。"}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                  答对 {result.correct_count} / {result.question_count} 题
                </p>
              </div>
              <button
                type="button"
                onClick={result.passed ? onDone : () => void generate()}
                className="inline-flex h-8 shrink-0 items-center rounded-lg bg-[var(--primary)] px-3.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
              >
                {result.passed ? "继续" : "重做"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-[11.5px] text-[var(--muted-foreground)]">
                已答 {answeredCount} / {questions.length} 题
                {answeredCount < questions.length ? " · 全部作答后批改" : ""}
              </p>
              <button
                type="button"
                onClick={() => void grade()}
                disabled={answeredCount < questions.length}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                批改
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
