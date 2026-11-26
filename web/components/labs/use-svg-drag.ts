"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SVG 拖拽钩子
 * ============
 *
 * 九个实验台里有六个是自绘 SVG 场景。它们都需要同一件事：
 * **按住并拖动某个图元**。
 *
 * 为什么自己写而不用现成库
 * ----------------------
 *
 * - ``react-draggable`` 依赖 DOM 盒子模型，而 SVG 图元靠**坐标**
 *   定位——用它得先把 SVG 坐标换算成像素，换算在缩放时会漂；
 * - ``dnd-kit`` 是为 HTML 拖放设计的，SVG 里的图元拖起来会有
 *   浏览器原生拖影。
 *
 * 这里直接用 **Pointer Events**：一套 API 同时覆盖鼠标、触摸和
 * 触控笔，且在 SVG 里就是天然的「屏幕坐标 → SVG 坐标」换算。
 *
 * 坐标换算
 * --------
 *
 * 用 ``getScreenCTM().inverse()`` 做精确换算——它把屏幕坐标变成
 * SVG 用户坐标，自动处理 ``viewBox`` 缩放与平移。手动除以缩放比
 * 在有 ``preserveAspectRatio`` 时会算错。
 */

/** 拖拽回调。 */
export interface DragHandlers {
  /** 拖拽开始（SVG 用户坐标）。 */
  onStart?: (point: { x: number; y: number }) => void;
  /** 拖拽中。 */
  onMove?: (point: { x: number; y: number }) => void;
  /** 拖拽结束。 */
  onEnd?: (point: { x: number; y: number }) => void;
}

/** 拖拽状态。 */
export interface DragState {
  /** 正在拖拽。 */
  dragging: boolean;
  /** 当前指针位置（SVG 用户坐标）。 */
  point: { x: number; y: number };
}

/**
 * 把屏幕坐标转成 SVG 用户坐标。
 *
 * ⛔ 必须用 ``getScreenCTM()``——它包含了 ``viewBox`` 缩放、
 *    ``preserveAspectRatio`` 的留白偏移、以及外层的 CSS 变换。
 *    手动算会漏掉其中任意一项。
 */
export function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

/**
 * 返回一个「可以挂到图元上的拖拽处理器」。
 *
 * 用法：
 *
 * .. code-block:: tsx
 *
 *    const drag = useSvgDrag({
 *      onMove: (p) => setX(p.x),
 *    });
 *
 *    <circle
 *      onPointerDown={drag.start}
 *      style={{ cursor: "grab" }}
 *    />
 *
 * ⛔ 拖拽期间必须调用 ``preventDefault``——否则浏览器会启动
 *    原生的文本选择 / 图片拖拽，手感立刻变差。
 */
export function useSvgDrag(handlers: DragHandlers) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [state, setState] = useState<DragState>({
    dragging: false,
    point: { x: 0, y: 0 },
  });

  /** 拖拽过程中的最新 handler——用 ref 存，避免每次移动都重建闭包。 */
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  /** 当前正在拖拽的目标（用于捕获指针）。 */
  const activeRef = useRef<{
    target: Element;
    pointerId: number;
  } | null>(null);

  const start = useCallback(
    (event: React.PointerEvent<SVGElement>) => {
      const svg = (event.currentTarget.ownerSVGElement ??
        event.currentTarget) as SVGSVGElement;
      svgRef.current = svg;

      // 捕获指针——指针移出图元后仍然继续收到事件。
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* 某些浏览器在 SVG 上不支持指针捕获——不致命 */
      }
      activeRef.current = {
        target: event.currentTarget,
        pointerId: event.pointerId,
      };

      const point = clientToSvg(svg, event.clientX, event.clientY);
      setState({ dragging: true, point });
      handlersRef.current.onStart?.(point);
      event.preventDefault();
    },
    [],
  );

  const move = useCallback((event: React.PointerEvent<SVGElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = clientToSvg(svg, event.clientX, event.clientY);
    setState({ dragging: true, point });
    handlersRef.current.onMove?.(point);
    event.preventDefault();
  }, []);

  const end = useCallback((event: React.PointerEvent<SVGElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const svg = svgRef.current;
    activeRef.current = null;
    try {
      active.target.releasePointerCapture(event.pointerId);
    } catch {
      /* 同上 */
    }
    if (svg) {
      const point = clientToSvg(svg, event.clientX, event.clientY);
      handlersRef.current.onEnd?.(point);
    }
    setState((s) => ({ ...s, dragging: false }));
    event.preventDefault();
  }, []);

  return {
    ...state,
    start,
    move,
    end,
    /** 绑到图元上的完整一组属性。 */
    bind: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: end,
    },
  };
}

/**
 * 监听窗口级指针事件（用于「按下空白处即结束拖拽」）。
 *
 * 有时候图元被拖到 SVG 外面，指针事件就丢了。挂一个 window 级
 * 监听可以兜住。
 */
export function useGlobalPointerUp(onUp: () => void) {
  const handlerRef = useRef(onUp);
  handlerRef.current = onUp;

  useEffect(() => {
    const handler = () => handlerRef.current();
    window.addEventListener("pointerup", handler);
    window.addEventListener("pointercancel", handler);
    return () => {
      window.removeEventListener("pointerup", handler);
      window.removeEventListener("pointercancel", handler);
    };
  }, []);
}
