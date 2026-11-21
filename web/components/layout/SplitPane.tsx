"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * 可拖拽分栏
 * =========
 *
 * 一个**桌面级**的左右分栏：中间有一条可拖动的分隔条，用户可以把它
 * 往左或往右拖，从而改变两侧的宽度比例。
 *
 * 为什么不用 react-split-pane
 * -------------------------
 *
 * 那个库停留在 React 16 时代——它的 ``children`` 强制要求数组元素
 * 带 ``key``，在 React 19 下会告警，而且它把宽度写死在 DOM 属性上，
 * 与本项目的 Tailwind 变量体系脱节。自己实现反而更顺：
 *
 * - 用 **CSS Grid 的 ``fr`` 单位**表达比例——两侧宽度自动平分剩余
 *   空间，容器尺寸变化时不会错位；
 * - 拖拽时用 ``ResizeObserver`` 实时量测，而不是靠鼠标坐标累加
 *   （后者在页面滚动、缩放时都会漂移）。
 *
 * 键盘可达性
 * ----------
 *
 * 分隔条是一个 ``role="separator"`` 的可聚焦元素，支持方向键微调
 * （±2%）、Home/End（到两端）。这不只是无障碍合规——对用键盘的
 * 用户来说，能把 AI 窗口调到 50% 宽是刚需。
 *
 * 双击复位
 * --------
 *
 * 双击分隔条回到初始比例。这是最快的「我搞乱了，帮我还原」的方式。
 */

/** 拖拽时使用的最小/最大比例。 */
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;

/**
 * 键盘微调的步长。
 */
const KEYBOARD_STEP = 0.02;

export function SplitPane({
  left,
  right,
  /** 初始比例：左侧占多少（0–1）。 */
  initialRatio = 0.71,
  /** 双击复位到的比例。默认回到 71/29。 */
  resetRatio = 0.71,
  /** 比例变化的回调——用来把状态存到 localStorage。 */
  onRatioChange,
  className = "",
  leftClassName = "",
  rightClassName = "",
}: {
  left: ReactNode;
  right: ReactNode;
  initialRatio?: number;
  resetRatio?: number;
  onRatioChange?: (ratio: number) => void;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => clamp(initialRatio));
  /** 拖拽中——用于加高亮样式。 */
  const [dragging, setDragging] = useState(false);
  /** 拖拽起点，用于屏蔽点击。 */
  const dragRef = useRef<{ startX: number; startRatio: number } | null>(null);

  const update = useCallback(
    (next: number) => {
      const clamped = clamp(next);
      setRatio(clamped);
      onRatioChange?.(clamped);
    },
    [onRatioChange],
  );

  /** 从鼠标位置算出新的比例。 */
  const ratioFromClientX = useCallback((clientX: number) => {
    const node = containerRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return clamp((clientX - rect.left) / rect.width);
  }, []);

  // ── 指针拖拽 ──────────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // 只响应主键。
      if (event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startRatio: ratio };
      setDragging(true);
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    },
    [ratio],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = ratioFromClientX(event.clientX);
      if (next !== null) update(next);
    },
    [ratioFromClientX, update],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
  }, []);

  // ── 键盘 ──────────────────────────────────────────────────────────

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          update(ratio - KEYBOARD_STEP);
          break;
        case "ArrowRight":
          event.preventDefault();
          update(ratio + KEYBOARD_STEP);
          break;
        case "Home":
          event.preventDefault();
          update(MIN_RATIO);
          break;
        case "End":
          event.preventDefault();
          update(MAX_RATIO);
          break;
        default:
          break;
      }
    },
    [ratio, update],
  );

  // 双击复位。
  //
  // 注意用的是 ``resetRatio`` 而不是 ``initialRatio``——后者是**实时**
  // 跟随用户拖拽变化的（父组件把它存进了 localStorage）。拿它做复位
  // 目标等于「复位到当前位置」，双击就完全没反应了。
  const onDoubleClick = useCallback(() => {
    update(resetRatio);
  }, [resetRatio, update]);

  // 容器尺寸变化时，比例不变但实际像素宽度会变——这里只需要保证
  // 状态与 DOM 同步（fr 单位自动处理），无需额外逻辑。
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      // 触发一次重渲染，让 fr 比例重新生效。
      setRatio((current) => current);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * 窄屏时把分隔条藏起来。
   *
   * 屏幕只有 600px 宽时，两侧各占一半没人读得下去。与其给一个「几乎
   * 拖不动」的分隔条，不如**藏起来**并让左窗占满——用户在小屏上本来
   * 就该先看正文。AI 面板仍可访问（它是右窗，只是被推到屏幕外）。
   *
   * 断点取 768px（Tailwind 的 ``md``）——低于这个宽度，正文一行能放
   * 下的字数已经很少了，再分栏就没有意义。
   */
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (narrow) {
    return (
      <div className={cn("grid min-h-0 min-w-0 grid-cols-1", className)}>
        <div className="min-h-0 min-w-0 overflow-hidden">{left}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid min-h-0 min-w-0",
        "grid-cols-[var(--split-left)_auto_var(--split-right)]",
        dragging && "select-none",
        className,
      )}
      style={
        {
          "--split-left": `${ratio}fr`,
          "--split-right": `${1 - ratio}fr`,
        } as React.CSSProperties
      }
    >
      {/* 左窗 */}
      <div className={cn("min-h-0 min-w-0 overflow-hidden", leftClassName)}>
        {left}
      </div>

      {/* 分隔条 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右窗格宽度"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
        className={cn(
          "group relative z-10 w-[5px] shrink-0 cursor-col-resize",
          // 分隔条不用硬色块——两栏底色已经不同了，再压一条实心
          // 灰条反而像一道墙。改成透明，靠 hover 时的握把提示
          // 告诉用户「这里能拖」。
          "bg-transparent transition-colors",
          "hover:bg-[var(--seek-plum)]/12",
          dragging && "bg-[var(--seek-plum)]/18",
          "focus-visible:bg-[var(--seek-plum)]/18 focus-visible:outline-none",
        )}
      >
        {/* 中间的握把提示——悬停时显现，告诉用户「这里可以拖」。 */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 h-8 w-[3px]",
            "-translate-x-1/2 -translate-y-1/2 rounded-full",
            "bg-[var(--foreground)]/25 opacity-0 transition-opacity",
            "group-hover:opacity-100",
            dragging && "opacity-100",
          )}
        />
      </div>

      {/* 右窗 */}
      <div className={cn("min-h-0 min-w-0 overflow-hidden", rightClassName)}>
        {right}
      </div>
    </div>
  );
}

/** 把比例夹在合法区间内。 */
function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.71;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

export { clamp as clampSplitRatio, MAX_RATIO, MIN_RATIO };
