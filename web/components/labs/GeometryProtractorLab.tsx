"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FormulaBar,
  StageSwitch,
  type LabProps,
  type TelemetryEvent,
} from "@/components/labs/lab-types";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 王牌实验台 2 · 动态几何与透明量角器工坊
 * ==========================================
 *
 * 引擎：**JSXGraph**（MIT，https://github.com/jsxgraph/jsxgraph）
 *
 * 真工具操作感
 * ------------
 *
 * 蓝白精密坐标网格上，任意三角形顶点可鼠标拖拽；一把**半透明刻度
 * 量角器**可自由拖动中心点、可 360° 平滑旋转。
 *
 * ⛔ 不是「算三个角然后画三角形」——JSXGraph 里每个点、每条线
 *    都是可交互的图元，顶点是真能拖的，拖动时角度约束是真会断的。
 *
 * 实时因果联动
 * ------------
 *
 * 拖动任意顶点时，三条边长、三个内角度数、内角和（恒等于 180.0°）、
 * 高线与动态面积填充区 60fps 实时变化。
 *
 * 三段玩法
 * --------
 *
 * - **探索**：自由拖拽顶点，观察几何不变量（内角和恒为 180°）；
 * - **规律**：验证不同形态三角形的内角和 / 构造指定角；
 * - **谜题**：系统生成一个隐藏度数的神秘角，学生把量角器拖到顶点、
 *   旋转对准始边亲手量出度数并作答，误差 ≤ 2° 即通关。
 *
 * ⛔ **JSXGraph 1.x 的三个 API 陷阱**（全部在浏览器里实测过）：
 *
 * 1. ``arc`` 只接受 **三个点** ``[center, radiusPoint, anglePoint]``。
 *    旧版四参数写法 ``[center, radius, startAngle, endAngle]`` 会
 *    直接抛 ``Can't create Arc``——而且这个异常发生在 effect 中间，
 *    后面的代码全部不执行，量角器、刻度、谜题生成全都没了。
 * 2. 角度元素的 ``Value("radians")`` 返回的是**从第一条边逆时针
 *    量到第三条边**的有向角，可能大于 180°（本例是 319°）。
 *    内角必须取 ``min(r, 2π − r)`` 才是真正的内角。
 * 3. ``point.setPosition(x, y)`` 的第一个参数是**坐标系枚举**
 *    （``JXG.COORDS_BY_USER``），不是 x 坐标。传错会静默失败——
 *    点的坐标变成 ``null``，随后所有读数崩掉。
 */

/** 三个经典场景。 */
type Scenario = "triangle" | "parallel" | "circle";

/** 场景的中英文名。 */
const SCENARIOS: Array<{ id: Scenario; zh: string; en: string }> = [
  { id: "triangle", zh: "三角形内角和探究", en: "Triangle Angle Sum" },
  { id: "parallel", zh: "平行线同位角 / 内错角", en: "Parallel Line Angles" },
  { id: "circle", zh: "圆周角与圆心角", en: "Inscribed & Central Angles" },
];

/** 量角器半径（用户坐标）。 */
const PROTRACTOR_R = 1.9;

/**
 * JSXGraph 元素的最小类型（避免直接引用庞大的类型树）。
 */
type JxgElement = {
  X: () => number;
  Y: () => number;
  setPosition: (coords: number, xy: [number, number]) => void;
  setPositionDirectly?: (coords: number, xy: [number, number]) => void;
  on: (event: string, handler: (e: unknown) => void) => unknown;
  /** JSXGraph 的取值方法——**大写 V**。 */
  Value?: (unit?: string) => number;
  setAttribute?: (attr: object) => void;
  /** 段的两个端点（用于整体平移量角器）。 */
  point1?: JxgElement;
  point2?: JxgElement;
};

export default function GeometryProtractorLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const hostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<unknown>(null);
  /**
   * JSXGraph 模块的引用。
   *
   * ⛔ 清理逻辑需要在 effect 的 cleanup 闭包里访问它——但那里拿不到
   *    动态 import 的局部变量。所以这里存一份 ref。
   */
  const jxgRef = useRef<unknown>(null);

  const [scenario, setScenario] = useState<Scenario>("triangle");
  const [angles, setAngles] = useState({ a: 0, b: 0, c: 0, sum: 0 });
  const [sides, setSides] = useState({ a: 0, b: 0, c: 0 });
  const [area, setArea] = useState(0);
  const [protractorAngle, setProtractorAngle] = useState(0);
  const [mystery, setMystery] = useState({ target: 0, answer: "", solved: false });

  const lastTelemetry = useRef<string>("");

  /**
   * 当前阶段的 ref。
   *
   * ⛔ 用来在不重建 JSXGraph board 的前提下读取**当前**阶段——
   *    effect 依赖里不能有 ``stage``，否则每次换阶段都会销毁
   *    重建画布（卡顿 + 读数闪回 0.0° + 形状被重置）。
   */
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const push = useCallback(
    (kind: TelemetryEvent["kind"], zh: string, en: string, value?: string) => {
      const key = `${kind}:${zh}`;
      if (lastTelemetry.current === key) return;
      lastTelemetry.current = key;
      onTelemetryChange?.({ kind, textZh: zh, textEn: en, value, at: Date.now() });
    },
    [onTelemetryChange],
  );

  /* ── JSXGraph 初始化 ───────────────────────────────────────── */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;

    (async () => {
      const JXG = await import("jsxgraph");
      if (disposed || !hostRef.current) return;
      jxgRef.current = JXG;

      const board = JXG.JSXGraph.initBoard(hostRef.current, {
        boundingbox: [-5, 4.4, 5, -3.2],
        axis: true,
        showCopyright: false,
        showNavigation: false,
        keepaspectratio: true,
        pan: { enabled: false },
        zoom: { wheel: false },
      });
      boardRef.current = board;

      /** 用户坐标系枚举——``setPosition`` 的第一个参数。 */
      const USER = JXG.COORDS_BY_USER;

      /* ── 三角形三顶点 ── */
      const A = board.create("point", [-3, 0], {
        name: "A",
        fixed: false,
        color: "#1D4ED8",
        size: 4,
      }) as unknown as JxgElement;
      const B = board.create("point", [0, 2.6], {
        name: "B",
        fixed: false,
        color: "#1D4ED8",
        size: 4,
      }) as unknown as JxgElement;
      const C = board.create("point", [3, 0], {
        name: "C",
        fixed: false,
        color: "#1D4ED8",
        size: 4,
      }) as unknown as JxgElement;

      const triangle = board.create("polygon", [A, B, C], {
        fillColor: "#1D4ED8",
        fillOpacity: 0.08,
        borders: { strokeColor: "#0B162C", strokeWidth: 2 },
      }) as unknown as JxgElement;

      /* ── 三条边 ── */
      board.create("segment", [B, C], {
        strokeColor: "#0B162C",
        strokeWidth: 2,
        name: "a",
      });
      board.create("segment", [C, A], {
        strokeColor: "#0B162C",
        strokeWidth: 2,
        name: "b",
      });
      board.create("segment", [A, B], {
        strokeColor: "#0B162C",
        strokeWidth: 2,
        name: "c",
      });

      /* ── 三个内角 ──
         *
         * ⛔ JSXGraph 的角度元素返回的是**有向角**（可能 > 180°），
         *    所以读数时必须取 ``min(r, 2π − r)``。
         */
      const angleA = board.create("angle", [B, A, C], {
        name: "∠A",
        radius: 0.85,
        fillColor: "#C59B38",
        fillOpacity: 0.3,
        strokeColor: "#C59B38",
      }) as unknown as JxgElement;
      const angleB = board.create("angle", [A, B, C], {
        name: "∠B",
        radius: 0.85,
        fillColor: "#C59B38",
        fillOpacity: 0.3,
        strokeColor: "#C59B38",
      }) as unknown as JxgElement;
      const angleC = board.create("angle", [A, C, B], {
        name: "∠C",
        radius: 0.85,
        fillColor: "#C59B38",
        fillOpacity: 0.3,
        strokeColor: "#C59B38",
      }) as unknown as JxgElement;

      /* ── 底边所在的直线（用于作垂线 / 平行线） ── */
      const baseLine = board.create("line", [B, C], {
        strokeColor: "#0B162C",
        strokeWidth: 1.2,
        dash: 2,
        visible: false,
      }) as unknown as JxgElement;

      /* ── 高线（从 A 向 BC 作垂线）+ 垂足 ── */
      const altitude = board.create("perpendicular", [baseLine, A], {
        strokeColor: "#0E7490",
        strokeWidth: 1.4,
        dash: 2,
      }) as unknown as JxgElement;
      const foot = board.create("intersection", [altitude, baseLine], {
        name: "H",
        color: "#0E7490",
        size: 3,
      }) as unknown as JxgElement;

      /* ── 平行线场景：过 A 作 BC 的平行线 ── */
      const parallelLine = board.create("parallel", [baseLine, A], {
        strokeColor: "#1D4ED8",
        strokeWidth: 1.4,
        dash: 3,
        visible: false,
      }) as unknown as JxgElement;

      /* ── 圆场景：三角形外接圆 + 圆心角 + 圆周角 ── */
      const circumcircle = board.create("circumcircle", [A, B, C], {
        strokeColor: "#4338CA",
        strokeWidth: 1.6,
        visible: false,
      }) as unknown as JxgElement;
      const circumCenter = board.create("circumcenter", [A, B, C], {
        color: "#4338CA",
        size: 4,
        visible: false,
      }) as unknown as JxgElement;
      const centralAngle = board.create("angle", [B, circumCenter, C], {
        name: "∠O",
        radius: 0.7,
        fillColor: "#4338CA",
        fillOpacity: 0.25,
        strokeColor: "#4338CA",
        visible: false,
      }) as unknown as JxgElement;

      /* ── 透明量角器 ──
         *
         * ⛔ ``arc`` 在 JSXGraph 1.x 只接受**三个点**。
         *    中心的 ``radiusPoint`` 决定半径，``anglePoint`` 决定
         *    扇形的另一条边。中心与两个端点都用可拖动的点实现。
         */
      const center = board.create("point", [0, 0.4], {
        name: "O",
        color: "#0B162C",
        size: 4,
      }) as unknown as JxgElement;

      /** 半径点（决定量角器半径与起始方向）。 */
      const radiusPoint = board.create("point", [
        center.X() + PROTRACTOR_R,
        center.Y(),
      ], {
        color: "#0B162C",
        size: 3,
      }) as unknown as JxgElement;

      /** 角度点（决定量角器的另一条边）。 */
      const anglePoint = board.create("point", [
        center.X() - PROTRACTOR_R,
        center.Y(),
      ], {
        color: "#0B162C",
        size: 3,
      }) as unknown as JxgElement;

      const arc = board.create("arc", [center, radiusPoint, anglePoint], {
        strokeColor: "#1D4ED8",
        strokeWidth: 1.6,
        dash: 3,
        fillColor: "#1D4ED8",
        fillOpacity: 0.06,
      }) as unknown as JxgElement;

      /** 始边（射线）——中心到半径点。 */
      const ray = board.create(
        "segment",
        [center, [center.X() + 2.6, center.Y()]],
        { strokeColor: "#0B162C", strokeWidth: 2, name: "ray" },
      ) as unknown as JxgElement;

      /** 旋转手柄（半径点上的金色点）。 */
      const handle = board.create("point", [
        center.X() + 2.6,
        center.Y(),
      ], {
        name: "⟳",
        color: "#C59B38",
        size: 4,
        fixed: false,
      }) as unknown as JxgElement;

      /** 刻度线（每 10° 一根，每 30° 加长）。 */
      const ticks: JxgElement[] = [];
      for (let deg = 0; deg <= 180; deg += 10) {
        const rad = (deg * Math.PI) / 180;
        const len = deg % 30 === 0 ? 0.22 : 0.12;
        const inner = PROTRACTOR_R;
        const outer = PROTRACTOR_R + len;
        const t = board.create(
          "segment",
          [
            [
              center.X() + inner * Math.cos(rad),
              center.Y() + inner * Math.sin(rad),
            ],
            [
              center.X() + outer * Math.cos(rad),
              center.Y() + outer * Math.sin(rad),
            ],
          ],
          {
            strokeColor: deg % 30 === 0 ? "#0B162C" : "#94A3B8",
            strokeWidth: deg % 30 === 0 ? 1.4 : 0.8,
            fixed: true,
            highlight: false,
          },
        ) as unknown as JxgElement;
        ticks.push(t);
      }

      /* ── 平移量角器 ── */
      function moveProtractor(x: number, y: number) {
        const dx = x - center.X();
        const dy = y - center.Y();
        center.setPosition(USER, [x, y]);
        radiusPoint.setPosition(USER, [radiusPoint.X() + dx, radiusPoint.Y() + dy]);
        anglePoint.setPosition(USER, [anglePoint.X() + dx, anglePoint.Y() + dy]);
        for (const t of ticks) {
          t.setPosition(USER, [t.X() + dx, t.Y() + dy]);
        }
      }

      /* ── 旋转量角器 ──
         *
         * ⛔ 旋转靠**重设两个端点的坐标**实现，而不是 ``setAttribute``。
         *    ``arc`` 的起止角是由 radiusPoint / anglePoint 的位置
         *    推出来的——直接改属性不会生效。
         */
      function rotateProtractor(deg: number) {
        const cx = center.X();
        const cy = center.Y();
        const rad = (deg * Math.PI) / 180;

        radiusPoint.setPosition(USER, [
          cx + PROTRACTOR_R * Math.cos(rad),
          cy + PROTRACTOR_R * Math.sin(rad),
        ]);
        anglePoint.setPosition(USER, [
          cx - PROTRACTOR_R * Math.cos(rad),
          cy - PROTRACTOR_R * Math.sin(rad),
        ]);

        ray.setPosition(USER, [
          cx + 2.6 * Math.cos(rad),
          cy + 2.6 * Math.sin(rad),
        ]);
        handle.setPosition(USER, [
          cx + 2.6 * Math.cos(rad),
          cy + 2.6 * Math.sin(rad),
        ]);

        for (let i = 0; i < ticks.length; i += 1) {
          const rot = rad + (i * 10 * Math.PI) / 180;
          const len = (i * 10) % 30 === 0 ? 0.22 : 0.12;
          ticks[i].setPosition(USER, [
            cx + PROTRACTOR_R * Math.cos(rot),
            cy + PROTRACTOR_R * Math.sin(rot),
          ]);
          ticks[i].setPosition(USER, [
            cx + (PROTRACTOR_R + len) * Math.cos(rot),
            cy + (PROTRACTOR_R + len) * Math.sin(rot),
          ]);
        }
        setProtractorAngle(deg);
      }

      /* ── 拖拽绑定 ──
       *
       * ⛔ **必须从元素自己身上读坐标，不能从事件对象读**。
       *
       *    JSXGraph 的 board 在触发 drag 事件时传的是**原始 DOM
       *    事件**（``drag.triggerEventHandlers([...], [evt])``），
       *    那个对象里只有 ``clientX`` / ``clientY``，**没有** ``X``
       *    与 ``Y``。
       *
       *    所以之前写成 ``ev.X`` / ``ev.Y`` 的代码，条件判断永远
       *    不成立，函数直接 return——量角器**根本拖不动、也转不动**。
       *
       *    正确做法：读元素自身的坐标。JSXGraph 在触发 drag 事件
       *    **之前**已经调用过 ``setPositionDirectly``，所以此时
       *    ``center.X()`` 就是最新的落点。
       */
      center.on("drag", () => {
        moveProtractor(center.X(), center.Y());
      });

      handle.on("drag", () => {
        const cx = center.X();
        const cy = center.Y();
        const rad = Math.atan2(handle.Y() - cy, handle.X() - cx);
        rotateProtractor((rad * 180) / Math.PI);
      });

      /* ── 实时读数 ── */
      /**
       * 读取一个角度元素的度数。
       *
       * ⛔ **必须用大写的 ``Value()``**。JSXGraph 的角度元素
       *    暴露的是 ``Value(unit)``——写成小写 ``value()`` 会拿到
       *    ``undefined``，``undefined ?? 0`` 就变成 0，于是界面上的
       *    ∠A / ∠B / ∠C / 内角和 **全部卡死在 0.0°**。
       *
       * ⛔ 而且必须取**内角**。``Value("radians")`` 返回的是从第一条
       *    边逆时针量到第三条边的**有向角**，可能是 319° 而不是 41°。
       *    内角 = ``min(r, 2π − r)``。
       */
      const readAngle = (el: JxgElement): number => {
        const rad = el.Value?.("radians");
        if (typeof rad !== "number" || !Number.isFinite(rad)) return 0;
        const interior = Math.min(rad, 2 * Math.PI - rad);
        return (interior * 180) / Math.PI;
      };

      const update = () => {
        const va = readAngle(angleA);
        const vb = readAngle(angleB);
        const vc = readAngle(angleC);
        setAngles({ a: va, b: vb, c: vc, sum: va + vb + vc });

        const dist = (p: JxgElement, q: JxgElement) =>
          Math.hypot(p.X() - q.X(), p.Y() - q.Y());
        setSides({ a: dist(B, C), b: dist(C, A), c: dist(A, B) });

        /**
         * 三角形面积。
         *
         * ⛔ JSXGraph 的多边形元素暴露的是 ``Area()``（大写 A），
         *    而且**不接受参数**——之前写成 ``tri.area(A)`` 同样是
         *    取不到值。
         */
        const tri = triangle as unknown as { Area?: () => number };
        if (typeof tri.Area === "function") {
          const value = tri.Area();
          setArea(Number.isFinite(value) ? Math.abs(value) : 0);
        }
      };

      board.on("move", update);
      board.on("drag", update);
      /*
       * ⛔ **必须显式 update 一次**，否则初始读数是 0。
       *
       * JSXGraph 的 sector / angle 元素要等 board.update() 跑完
       * 才会把角度值算出来。在 board 刚创建、还没有任何交互事件的
       * 那一刻直接读 Value()，拿到的仍然是初始的 0。
       *
       * 这一句就是「一打开就显示精确角度」的关键。
       */
      board.update();
      update();

      /* ── 场景切换 ── */
      const applyScenario = (id: Scenario) => {
        const showParallel = id === "parallel";
        const showCircle = id === "circle";
        parallelLine.setAttribute?.({ visible: showParallel });
        circumcircle.setAttribute?.({ visible: showCircle });
        circumCenter.setAttribute?.({ visible: showCircle });
        centralAngle.setAttribute?.({ visible: showCircle });
      };
      applyScenario("triangle");

      /* ── 谜题生成 ── */
      const genMystery = () => {
        const target = 30 + Math.floor(Math.random() * 7) * 15; // 30,45,...,120
        setMystery({ target, answer: "", solved: false });
        push(
          "action",
          "谜题模式已生成一个隐藏度数的几何角（30°–120°）",
          "Mystery mode: a hidden angle has been generated (30°–120°)",
        );
      };

      // 把两个内部函数挂到 board 上，供外部调用。
      (board as unknown as Record<string, unknown>).__oeGenMystery = genMystery;
      (board as unknown as Record<string, unknown>).__oeApplyScenario = applyScenario;
      /*
       * ⛔ 首次进入谜题阶段的处理，挪到这里用 ref 读。
       *
       * 之前在初始化闭包里直接读 ``stage``——但那时 ``stage``
       * 是**首次渲染**的值。而这个 effect 不再依赖 ``stage``，
       * 所以要用 ref 拿**当前**值：组件挂载时如果已经是谜题阶段，
       * 就立刻生成一个谜题；否则等外面的 effect 触发。
       */
      if (stageRef.current === "mystery") genMystery();
    })();

    return () => {
      disposed = true;
      /*
       * ⛔ 必须销毁旧 board。
       *
       * 如果只置 ``disposed`` 而不释放 board，上一块 board 会继续
       * 挂在 DOM 上、继续注册鼠标事件。用户在三个阶段间来回切几次，
       * 同一个宿主 div 里就叠了 N 块 board，拖一个点会 N 个角同时
       * 跳——而且内存一路涨。
       *
       * ⛔ ``freeBoard`` 挂在 ``JXG.JSXGraph`` 上，**不是** board
       *    实例上——``board.freeBoard()`` 会直接抛
       *    ``board.freeBoard is not a function``。
       */
      const old = boardRef.current;
      if (old) {
        try {
          const mod = jxgRef.current as unknown as {
            JSXGraph?: { freeBoard?: (b: unknown) => void };
          };
          const free = mod?.JSXGraph?.freeBoard;
          if (typeof free === "function") {
            free(old);
          } else {
            // 兜底：从全局表里把它摘掉，否则 boards 会越积越多。
            const boards = (
              mod as unknown as { boards?: Record<string, unknown> }
            )?.boards;
            if (boards) {
              for (const [key, value] of Object.entries(boards)) {
                if (value === old) delete boards[key];
              }
            }
          }
        } catch {
          /* 忽略——清理失败不该阻断卸载 */
        }
      }
      boardRef.current = null;
    };    // ⛔ **依赖里不能有 ``stage``**。
    //
    // 之前这个 effect 依赖 ``[push, stage]``——每换一次阶段就
    // 整个销毁重建 JSXGraph board。三件事因此出错：
    //
    // 1. 重建耗时 100ms+，拖动顶点会明显卡顿；
    // 2. 重建瞬间读数归零，界面闪一下 0.0°；
    // 3. 用户在三角形里调好的形状被重置。
    //
    // 阶段切换只影响「谜题生成」，那是通过 ``__oeGenMystery``
    // 单独触发的，不需要重建画布。
  }, [push]);

  /* ── 场景切换 → 通知 JSXGraph ──────────────────────────────── */

  useEffect(() => {
    const board = boardRef.current as
      | { __oeApplyScenario?: (id: Scenario) => void }
      | undefined;
    board?.__oeApplyScenario?.(scenario);
  }, [scenario]);

  /* ── 阶段切换：进入谜题 → 重新生成 ────────────────────────── */

  useEffect(() => {
    if (stage !== "mystery") return;
    const board = boardRef.current as
      | { __oeGenMystery?: () => void }
      | undefined;
    board?.__oeGenMystery?.();
  }, [stage]);

  /* ── 角度变化 → 实时遥测 ───────────────────────────────────── */

  useEffect(() => {
    if (stage !== "explore") return;
    if (Math.round(angles.sum) !== 180) return;
    push(
      "discovery",
      "当前拖动顶点形成三角形，内角和 180°",
      "Dragging the vertices forms a triangle — the angle sum is 180°",
      "180°",
    );
  }, [angles.sum, stage, push]);

  /* ── 提交谜题答案 ───────────────────────────────────────────── */

  const submitMystery = () => {
    const value = Number(mystery.answer);
    if (!Number.isFinite(value)) return;
    if (Math.abs(value - mystery.target) <= 2) {
      setMystery((m) => ({ ...m, solved: true }));
      push(
        "success",
        `谜题模式已成功量出 ${mystery.target}°（误差 ≤ 2°）`,
        `Mystery solved — you measured ${mystery.target}° (within 2°)`,
        `${mystery.target}°`,
      );
      onSolved?.(
        `谜题模式已成功量出 ${mystery.target}°`,
        `Mystery solved — you measured ${mystery.target}°`,
      );
    } else {
      push(
        "hint",
        "答案不对。请把量角器中心拖到角的顶点，让 0° 刻度对准一条边",
        "Not yet. Drag the protractor's centre to the vertex and align 0° with one side",
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 实时读数 */}
      <FormulaBar highlight={Math.abs(angles.sum - 180) < 0.5}>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[15px]">
          <span>
            <span className="text-[11px] text-[#64748B]">∠A </span>
            {angles.a.toFixed(1)}°
          </span>
          <span>
            <span className="text-[11px] text-[#64748B]">∠B </span>
            {angles.b.toFixed(1)}°
          </span>
          <span>
            <span className="text-[11px] text-[#64748B]">∠C </span>
            {angles.c.toFixed(1)}°
          </span>
          <span className="border-l border-[#E2E8F0] pl-5">
            <span className="text-[11px] text-[#64748B]">
              {isEn ? "Sum " : tw("内角和 ")}
            </span>
            <span className="font-semibold text-[#1D4ED8]">
              {angles.sum.toFixed(1)}°
            </span>
          </span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-[#64748B]">
          {isEn
            ? `a=${sides.a.toFixed(2)}  b=${sides.b.toFixed(2)}  c=${sides.c.toFixed(2)}  ·  area=${area.toFixed(2)}`
            : tw(`边长 a=${sides.a.toFixed(2)}  b=${sides.b.toFixed(2)}  c=${sides.c.toFixed(2)}  ·  面积=${area.toFixed(2)}  ·  量角器 ${((protractorAngle % 360 + 360) % 360).toFixed(0)}°`)}
        </div>
      </FormulaBar>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-3 lg:grid-cols-[1fr_210px] lg:grid-rows-1">
        {/* JSXGraph 画布 */}
        <div className="min-h-[240px] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <div ref={hostRef} className="h-full w-full" />
        </div>

        {/* 侧栏 */}
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {/* 场景切换 */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5">
            <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "Scenario" : tw("经典场景")}
            </p>
            <div className="space-y-1">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenario(s.id)}
                  aria-pressed={scenario === s.id}
                  className={cn(
                    "w-full rounded border px-2 py-1.5 text-left text-[11.5px] transition-colors",
                    scenario === s.id
                      ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                      : "border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]",
                  )}
                >
                  {isEn ? s.en : tw(s.zh)}
                </button>
              ))}
            </div>
          </div>

          {/* 操作说明 */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5">
            <p className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
              {isEn ? "How to use" : tw("怎么用")}
            </p>
            <ul className="space-y-1 text-[11px] leading-relaxed text-[#334155]">
              <li>
                • {isEn ? "Drag A / B / C to reshape the triangle" : tw("拖动 A / B / C 改变三角形形状")}
              </li>
              <li>
                •{" "}
                {isEn
                  ? "Drag the black centre to move the protractor"
                  : tw("拖动黑色中心点平移量角器")}
              </li>
              <li>
                •{" "}
                {isEn
                  ? "Drag the gold handle to rotate it 360°"
                  : tw("拖动金色手柄 360° 旋转量角器")}
              </li>
            </ul>
          </div>

          {/* 谜题 */}
          {stage === "mystery" ? (
            <div className="rounded-lg border border-[#C59B38] bg-[#FDF8EC] p-2.5">
              <p className="text-[10px] font-medium tracking-[0.12em] text-[#8A6A20] uppercase">
                {isEn ? "Measure the mystery angle" : tw("量出神秘角")}
              </p>
              <p className="mt-1 text-[11px] text-[#8A6A20]">
                {isEn
                  ? "Target is hidden. Measure it within 2°."
                  : tw("目标度数已隐藏，请量出它（误差 ≤ 2°）。")}
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="number"
                  value={mystery.answer}
                  onChange={(e) => setMystery((m) => ({ ...m, answer: e.target.value }))}
                  placeholder="°"
                  className="h-8 min-w-0 flex-1 rounded border border-[#E8D9AE] bg-white px-2 text-[12px] text-[#0F172A] outline-none focus:border-[#C59B38]"
                />
                <button
                  type="button"
                  onClick={submitMystery}
                  className="h-8 rounded bg-[#C59B38] px-2.5 text-[11.5px] font-medium text-white"
                >
                  {isEn ? "Check" : tw("验证")}
                </button>
              </div>
              {mystery.solved ? (
                <p className="mt-1.5 text-[11px] font-medium text-[#8A6A20]">
                  {isEn ? `Correct! ${mystery.target}°` : tw(`正确！${mystery.target}°`)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />
    </div>
  );
}
