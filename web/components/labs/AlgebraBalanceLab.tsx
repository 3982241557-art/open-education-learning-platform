"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Matter from "matter-js";
import {
  FormulaBar,
  StageSwitch,
  Tray,
  TrayItem,
  type LabProps,
  type LabStage,
  type TelemetryEvent,
} from "@/components/labs/lab-types";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";


/**
 * 王牌实验台 1 · 真实重力代数天平
 * =================================
 *
 * 引擎：**Matter.js**（MIT，https://github.com/liabru/matter-js）
 *
 * 真物理
 * ------
 *
 * 横梁是一根**刚体**，用约束铰接在支点上。砝码是刚体，受**真实
 * 重力**（``engine.gravity.y = 1``）作用，落在托盘上时通过碰撞把
 * 力矩传给横梁——于是天平会倾斜、惯性摇晃、回弹。
 *
 * ⛔ 这不是「算一个角度再画出来」的假动画。Matter 每帧积分
 *    位置与速度，砝码真的在托盘里滚、真的从盘上滚落。
 *
 * 实时代数联动
 * ------------
 *
 * 画布顶部同步显示天平对应的不等式或等式，例如 ``2x + 3 > x + 7``。
 * 天平平齐的瞬间，公式变成等式并触发蓝色平衡微光。
 *
 * 三段玩法
 * --------
 *
 * - **探索**：自由摆放，看倾斜与公式；
 * - **规律**：验证「两边同增同减保持平衡」；
 * - **谜题**：左盘放着隐藏真实重量的黑盒 ``?x``，用砝码称出 x。
 */

/* ── 砝码模型 ────────────────────────────────────────────────────── */

type WeightKind = "x" | "unit";

interface WeightDef {
  /** 砝码代表的代数系数（x 的个数）。 */
  xCount: number;
  /** 砝码代表的单位数。 */
  unitCount: number;
}

const WEIGHTS: Record<string, WeightDef> = {
  x: { xCount: 1, unitCount: 0 },
  "1": { xCount: 0, unitCount: 1 },
  "2": { xCount: 0, unitCount: 2 },
  "5": { xCount: 0, unitCount: 5 },
};

/** 砝码的物理质量——x 块代表「未知数」，质量设为 3（可称出整数值）。 */
function weightMass(kind: string): number {
  return kind === "x" ? 3 : WEIGHTS[kind].unitCount;
}

/* ── 组件 ────────────────────────────────────────────────────────── */

export default function AlgebraBalanceLab({
  onTelemetryChange,
  stage,
  isEn,
  onSolved,
}: LabProps) {
  const tw = useTraditional();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const sceneRef = useRef<{
    beam: Matter.Body;
    leftPan: Matter.Body;
    rightPan: Matter.Body;
    weights: Matter.Body[];
    ground: Matter.Body;
  } | null>(null);

  /** 托盘内容（纯数据，与物理体同步）。 */
  const [leftItems, setLeftItems] = useState<string[]>([]);
  const [rightItems, setRightItems] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [beamAngle, setBeamAngle] = useState(0);
  const [balanced, setBalanced] = useState(false);
  const [mysteryX, setMysteryX] = useState(4);
  const [mysteryAnswer, setMysteryAnswer] = useState("");
  const [mysterySolved, setMysterySolved] = useState(false);
  const [discoverDone, setDiscoverDone] = useState(false);
  const [exploreDone, setExploreDone] = useState(false);
  const [eliminateFlash, setEliminateFlash] = useState<string | null>(null);

  /** 上一次推送的遥测文本——避免重复推送同一句话。 */
  const lastTelemetry = useRef<string>("");
  /** 消除动画的挂起操作。 */
  const pendingOp = useRef<null | (() => void)>(null);

  /* ── 物理引擎初始化 ─────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.0011 },
      enableSleeping: false,
    });
    engineRef.current = engine;

    /**
     * 画布的 CSS 尺寸。
     *
     * ⛔ 必须在 effect 里读，**不能**在模块层或 render 里读——
     *    首次挂载时布局还没算完，读出来是 0。
     *
     *    如果这里拿到 0，支点会落在画布外头，砝码直接掉出屏幕——
     *    看起来就像「引擎没跑起来」。所以兜底给一个合理尺寸，
     *    之后由 ResizeObserver 校正。
     */
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || canvas.clientWidth || 800;
    const H = rect.height || canvas.clientHeight || 480;
    const pivotX = W / 2;
    const pivotY = H * 0.3;

    // 横梁——一根长条刚体，绕中心转动（用约束模拟铰链）。
    const beam = Matter.Bodies.rectangle(pivotX, pivotY, 420, 14, {
      frictionAir: 0.02,
      friction: 0.9,
      restitution: 0.1,
      density: 0.02,
      chamfer: { radius: 6 },
    });

    // 支点约束：横梁中心被固定在支点上，但**允许旋转**。
    const pin = Matter.Constraint.create({
      pointA: { x: pivotX, y: pivotY },
      bodyB: beam,
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      length: 0,
    });

    // 托盘——横梁两端挂着的两个浅盘。
    const panW = 150;
    const panH = 12;
    const leftPan = Matter.Bodies.rectangle(pivotX - 210, pivotY + 62, panW, panH, {
      isStatic: false,
      friction: 0.95,
      frictionStatic: 1.2,
      restitution: 0.02,
      density: 0.004,
      label: "pan",
    });
    const rightPan = Matter.Bodies.rectangle(pivotX + 210, pivotY + 62, panW, panH, {
      isStatic: false,
      friction: 0.95,
      frictionStatic: 1.2,
      restitution: 0.02,
      density: 0.004,
      label: "pan",
    });

    // 吊绳——把托盘连到横梁两端。
    const leftRope = Matter.Constraint.create({
      pointA: { x: pivotX - 210, y: pivotY },
      bodyB: leftPan,
      pointB: { x: 0, y: 0 },
      stiffness: 0.9,
      damping: 0.1,
    });
    const rightRope = Matter.Constraint.create({
      pointA: { x: pivotX + 210, y: pivotY },
      bodyB: rightPan,
      pointB: { x: 0, y: 0 },
      stiffness: 0.9,
      damping: 0.1,
    });

    // 地面——防止砝码无限下坠。
    const ground = Matter.Bodies.rectangle(pivotX, H + 40, W * 2, 80, {
      isStatic: true,
      label: "ground",
    });

    Matter.Composite.add(engine.world, [
      beam,
      pin,
      leftPan,
      rightPan,
      leftRope,
      rightRope,
      ground,
    ]);

    sceneRef.current = { beam, leftPan, rightPan, weights: [], ground };

    // ── 渲染循环 ──
    let raf = 0;

    /**
     * 同步画布的**后备存储**尺寸与 CSS 尺寸。
     *
     * ⛔ 这一步必须独立于 ``requestAnimationFrame``。
     *
     * 浏览器的 rAF 在**标签页不可见**或**窗口失焦**时会被节流到
     * 几乎不执行。如果尺寸同步只写在 rAF 回调里，那么在低功耗
     * 模式 / 后台标签页里打开实验台，画布会永远停在默认的
     * 300×150，呈现为一块空白——这正是「假壳」最容易藏身的
     * 地方。
     *
     * 所以用 ``ResizeObserver`` 独立驱动尺寸同步，并立刻重绘一帧。
     */
    const syncCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const bw = Math.max(1, Math.round(rect.width * dpr));
      const bh = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        return true;
      }
      return false;
    };

    const render = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // 背景网格
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= w; gx += 30) {
        ctx.beginPath();
        ctx.moveTo(gx + 0.5, 0);
        ctx.lineTo(gx + 0.5, h);
        ctx.stroke();
      }
      for (let gy = 0; gy <= h; gy += 30) {
        ctx.beginPath();
        ctx.moveTo(0, gy + 0.5);
        ctx.lineTo(w, gy + 0.5);
        ctx.stroke();
      }

      const scene = sceneRef.current;
      if (!scene) return;

      // 支点三角
      ctx.fillStyle = "#0B162C";
      ctx.beginPath();
      ctx.moveTo(scene.beam.position.x, scene.beam.position.y + 12);
      ctx.lineTo(scene.beam.position.x - 20, scene.beam.position.y + 66);
      ctx.lineTo(scene.beam.position.x + 20, scene.beam.position.y + 66);
      ctx.closePath();
      ctx.fill();

      // 横梁
      ctx.save();
      ctx.translate(scene.beam.position.x, scene.beam.position.y);
      ctx.rotate(scene.beam.angle);
      ctx.fillStyle = "#0B162C";
      ctx.fillRect(-210, -7, 420, 14);
      ctx.fillStyle = "#C59B38";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 托盘
      for (const pan of [scene.leftPan, scene.rightPan]) {
        ctx.save();
        ctx.translate(pan.position.x, pan.position.y);
        ctx.rotate(pan.angle);
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#0B162C";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-panW / 2, 0);
        ctx.lineTo(panW / 2, 0);
        ctx.lineTo(panW / 2 - 10, 16);
        ctx.lineTo(-panW / 2 + 10, 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 砝码
      for (const wgt of scene.weights) {
        ctx.save();
        ctx.translate(wgt.position.x, wgt.position.y);
        ctx.rotate(wgt.angle);
        const kind = (wgt as unknown as { plugin?: { kind?: string } }).plugin?.kind ?? "1";
        const isX = kind === "x";
        const size = isX ? 34 : 24 + WEIGHTS[kind].unitCount * 1.2;
        ctx.fillStyle = isX ? "#1D4ED8" : "#C59B38";
        ctx.strokeStyle = "#0B162C";
        ctx.lineWidth = 1.5;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "600 15px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isX ? "x" : kind, 0, 1);
        ctx.restore();
      }

      raf = requestAnimationFrame(render);
    };

    /**
     * 独立于 rAF 的尺寸同步 + 重绘。
     *
     * 浏览器在标签页不可见 / 窗口失焦时会把 rAF 节流到几乎不执行。
     * 如果画布尺寸只在 rAF 里同步，那么这些场景下实验台会永远
     * 停在 300×150 的空白默认画布——看起来就像「假壳」。
     *
     * 用 ``ResizeObserver`` 让尺寸变化立刻生效并补画一帧，
     * 保证**任何时候**打开实验台都能看到真实内容。
     */
    const ro = new ResizeObserver(() => {
      if (syncCanvasSize()) {
        // 尺寸变了 → 立刻重画一帧，不等下一帧 rAF。
        render();
      }
    });
    ro.observe(canvas);

    // 首次同步（在 rAF 之外，保证首帧就有正确尺寸）。
    syncCanvasSize();
    render();

    raf = requestAnimationFrame(render);

    // ── 物理步进 ──
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    const onAfterUpdate = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      const angle = scene.beam.angle;
      setBeamAngle(angle);

      // 平衡判定：倾角极小（< 0.6°）视为平齐。
      const isBalanced = Math.abs(angle) < 0.011;
      setBalanced((prev) => (prev === isBalanced ? prev : isBalanced));
    };
    Matter.Events.on(engine, "afterUpdate", onAfterUpdate);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      Matter.Runner.stop(runner);
      Matter.Events.off(engine, "afterUpdate", onAfterUpdate);
      Matter.Engine.clear(engine);
      engineRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  /* ── 砝码增删 ───────────────────────────────────────────────── */

  /**
   * 往某个盘里放一个砝码。
   *
   * 砝码是真的刚体——从盘的上方落下，被盘接住，把重量传给横梁。
   */
  const addWeight = useCallback(
    (side: "left" | "right", kind: string) => {
      const scene = sceneRef.current;
      const engine = engineRef.current;
      if (!scene || !engine) return;

      const pan = side === "left" ? scene.leftPan : scene.rightPan;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const offset = (Math.random() - 0.5) * 40;
      const body = Matter.Bodies.rectangle(
        pan.position.x + offset,
        pan.position.y - 60,
        30,
        30,
        {
          friction: 0.7,
          frictionStatic: 0.9,
          restitution: 0.05,
          density: 0.0016 * weightMass(kind),
          label: "weight",
        },
      );
      (body as unknown as { plugin: { kind: string } }).plugin = { kind };
      Matter.Composite.add(engine.world, body);
      scene.weights.push(body);

      if (side === "left") setLeftItems((v) => [...v, kind]);
      else setRightItems((v) => [...v, kind]);
    },
    [],
  );

  /** 移除某个盘上的最后一个砝码。 */
  const removeWeight = useCallback((side: "left" | "right") => {
    const scene = sceneRef.current;
    const engine = engineRef.current;
    if (!scene || !engine) return;

    // 找到属于该盘的砝码（记录在 ref 里）。
    const list = side === "left" ? leftItems : rightItems;
    if (list.length === 0) return;

    const target = scene.weights[scene.weights.length - 1];
    if (!target) return;

    Matter.Composite.remove(engine.world, target);
    scene.weights = scene.weights.filter((b) => b !== target);

    if (side === "left") setLeftItems((v) => v.slice(0, -1));
    else setRightItems((v) => v.slice(0, -1));
  }, [leftItems, rightItems]);

  /* ── 遥测推送 ───────────────────────────────────────────────── */

  const push = useCallback(
    (kind: TelemetryEvent["kind"], zh: string, en: string, value?: string) => {
      const key = `${kind}:${zh}`;
      if (lastTelemetry.current === key) return;
      lastTelemetry.current = key;
      onTelemetryChange?.({
        kind,
        textZh: zh,
        textEn: en,
        value,
        at: Date.now(),
      });
    },
    [onTelemetryChange],
  );

  // 天平状态变化 → 实时遥测
  useEffect(() => {
    const lx = leftItems.filter((k) => k === "x").length;
    const rx = rightItems.filter((k) => k === "x").length;
    const lu = leftItems.filter((k) => k !== "x").length;
    const ru = rightItems.filter((k) => k !== "x").length;

    if (leftItems.length === 0 && rightItems.length === 0) return;

    if (balanced) {
      push(
        "discovery",
        `天平恰好平齐：${fmtExpr(lx, lu, isEn)} = ${fmtExpr(rx, ru, isEn)}`,
        `The beam balances exactly: ${fmtExpr(lx, lu, true)} = ${fmtExpr(rx, ru, true)}`,
      );
    } else {
      const tilt = beamAngle < 0 ? "向左倾斜" : "向右倾斜";
      const tiltEn = beamAngle < 0 ? "tilts left" : "tilts right";
      push(
        "action",
        `已放上 ${leftItems.length} 个左盘砝码与 ${rightItems.length} 个右盘砝码，天平${tilt}`,
        `${leftItems.length} weight(s) on the left, ${rightItems.length} on the right — the beam ${tiltEn}`,
        `${lx}x+${lu} | ${rx}x+${ru}`,
      );
    }
  }, [leftItems, rightItems, balanced, beamAngle, push, isEn]);

  /* ── 公式计算 ───────────────────────────────────────────────── */

  const lx = leftItems.filter((k) => k === "x").length;
  const rx = rightItems.filter((k) => k === "x").length;
  const lu = leftItems.filter((k) => k !== "x").length;
  const ru = rightItems.filter((k) => k !== "x").length;

  /** 左盘总质量（x 块算 3 质量）。 */
  const leftMass = lx * 3 + lu;
  const rightMass = rx * 3 + ru;

  /** 公式文本。 */
  const formula = useMemo(() => {
    if (stage === "mystery") {
      // 谜题模式：左盘显示黑盒 ?x，右盘显示已放砝码。
      const right = fmtExpr(0, ru, isEn);
      return `?x  ${compareSign()}  ${right}`;
    }
    const left = fmtExpr(lx, lu, isEn);
    const right = fmtExpr(rx, ru, isEn);
    return `${left}  ${compareSign()}  ${right}`;
  }, [stage, lx, lu, rx, ru, isEn, leftMass, rightMass]);

  /** 比较符号——平衡时是等号，否则是不等号。 */
  function compareSign(): string {
    if (leftMass === rightMass) return "=";
    return leftMass < rightMass ? "<" : ">";
  }

  /* ── 谜题模式 ───────────────────────────────────────────────── */

  /** 生成新的谜题（黑盒重量随机）。 */
  const newMystery = useCallback(() => {
    const v = 2 + Math.floor(Math.random() * 5);
    setMysteryX(v);
    setMysterySolved(false);
    setMysteryAnswer("");
    // 清空两盘
    const scene = sceneRef.current;
    const engine = engineRef.current;
    if (scene && engine) {
      for (const b of scene.weights) Matter.Composite.remove(engine.world, b);
      scene.weights = [];
    }
    setLeftItems([]);
    setRightItems([]);
    push(
      "action",
      `新的谜题：黑盒 ?x 的真实重量被隐藏了，请用砝码称出它`,
      "New mystery: the black box ?x hides its true weight — weigh it with the weights",
    );
  }, [push]);

  // 进入谜题阶段 → 生成谜题
  useEffect(() => {
    if (stage === "mystery") newMystery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  /** 提交谜题答案。 */
  const submitMystery = () => {
    const value = Number(mysteryAnswer);
    if (!Number.isFinite(value)) return;
    if (value === mysteryX) {
      setMysterySolved(true);
      push(
        "success",
        `谜题模式已成功称出 x = ${mysteryX}`,
        `Mystery solved — you weighed out x = ${mysteryX}`,
        `x=${mysteryX}`,
      );
      onSolved?.(
        `谜题模式已成功称出 x = ${mysteryX}`,
        `Mystery solved — you weighed out x = ${mysteryX}`,
      );
    } else {
      push(
        "hint",
        `答案不对。天平还需要平衡：黑盒重量应等于右盘砝码之和`,
        "Not yet. The beam still needs to balance: the box must equal the sum on the right pan",
      );
    }
  };

  /* ── 「两边同增同减」实体消除动画 ────────────────────────────── */

  /**
   * 两边同时减 1 —— 从两个盘各拿走一个单位砝码。
   *
   * 这是「移项」的物理化：等式两边减同一个数，天平不动。
   */
  const subtractBoth = useCallback(() => {
    const leftHasUnit = leftItems.some((k) => k !== "x");
    const rightHasUnit = rightItems.some((k) => k !== "x");
    if (!leftHasUnit || !rightHasUnit) {
      push(
        "hint",
        "要「两边同时减 1」，两个盘上都必须至少有一个单位砝码",
        "To subtract 1 from both sides, both pans need at least one unit weight",
      );
      return;
    }
    setEliminateFlash("both");
    window.setTimeout(() => setEliminateFlash(null), 700);
    removeWeight("left");
    window.setTimeout(() => removeWeight("right"), 180);
    push(
      "discovery",
      "两边同时减 1：天平没有动——等式两边减同一个数，平衡不变",
      "Subtracting 1 from both sides: the beam didn't move — subtracting the same number preserves balance",
    );
    setDiscoverDone(true);
  }, [leftItems, rightItems, removeWeight, push]);

  /** 两边同时减 x —— 从两个盘各拿走一个 x 块。 */
  const subtractBothX = useCallback(() => {
    const leftHasX = leftItems.includes("x");
    const rightHasX = rightItems.includes("x");
    if (!leftHasX || !rightHasX) {
      push(
        "hint",
        "要「两边同时减 x」，两个盘上都必须至少有一个 x 块",
        "To subtract x from both sides, both pans need at least one x block",
      );
      return;
    }
    setEliminateFlash("bothx");
    window.setTimeout(() => setEliminateFlash(null), 700);
    removeWeight("left");
    window.setTimeout(() => removeWeight("right"), 180);
    push(
      "discovery",
      "两边同时减 x：天平纹丝不动——这就是「移项」的物理依据",
      "Subtracting x from both sides: the beam holds steady — this is the physical basis of moving terms",
    );
    setDiscoverDone(true);
  }, [leftItems, rightItems, removeWeight, push]);

  /* ── 探索阶段完成判定 ───────────────────────────────────────── */

  useEffect(() => {
    if (stage !== "explore") return;
    if (leftItems.length >= 2 && rightItems.length >= 2) {
      setExploreDone(true);
      push(
        "discovery",
        "已放上 2 个 x 块与 3 个单位块，天平向左倾斜",
        "Placed 2 x-blocks and 3 unit weights — the beam tilts left",
      );
    }
  }, [stage, leftItems.length, rightItems.length, push]);

  /* ── 渲染 ───────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 公式条 */}      <FormulaBar highlight={balanced}>
        <span className="font-sans text-[11px] tracking-[0.14em] text-[#64748B] uppercase">
          {isEn ? "Live Equation" : tw("实时等式")}
        </span>
        <div className="mt-1 text-[19px] leading-tight">{formula}</div>
        <div className="mt-1 text-[11px] text-[#64748B]">
          {balanced
            ? isEn
              ? "Balanced — the two sides are equal"
              : tw("已平齐 —— 两边完全相等")
            : isEn
              ? "Tilting — the sides are not yet equal"
              : tw("正在倾斜 —— 两边尚不相等")}
        </div>
      </FormulaBar>

      {/* 主舞台 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-3 lg:grid-cols-[1fr_200px] lg:grid-rows-1">
        <div
          className={cn(
            "relative min-h-[240px] overflow-hidden rounded-lg border bg-white transition-shadow",
            balanced ? "border-[#1D4ED8] shadow-[0_0_0_3px_rgba(29,78,216,0.16)]" : "border-[#E2E8F0]",
          )}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
          {eliminateFlash ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-lg bg-[#0B162C]/90 px-4 py-2 text-[13px] font-medium text-white">
                {eliminateFlash === "both"
                  ? isEn
                    ? "−1  −1"
                    : tw("两边同时减 1")
                  : isEn
                    ? "−x  −x"
                    : tw("两边同时减 x")}
              </span>
            </div>
          ) : null}
        </div>

        {/* 右侧道具栏 */}
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <Tray title={isEn ? "Weights" : tw("砝码")}>
            <TrayItem
              label="x"
              sublabel={isEn ? "unknown" : tw("未知")}
              color="blue"
              onClick={() => {
                addWeight("left", "x");
                addWeight("right", "x");
              }}
            />
            {(["1", "2", "5"] as const).map((k) => (
              <TrayItem
                key={k}
                label={`+${k}`}
                color="gold"
                onClick={() => {
                  addWeight("left", k);
                  addWeight("right", k);
                }}
              />
            ))}
          </Tray>

          <Tray title={isEn ? "Left pan" : tw("左盘")}>
            <div className="flex flex-wrap gap-1.5">
              {leftItems.length === 0 ? (
                <span className="text-[10.5px] text-[#94A3B8]">
                  {isEn ? "empty" : tw("空")}
                </span>
              ) : (
                leftItems.map((k, i) => (
                  <span
                    key={`${k}-${i}`}
                    className="flex h-7 min-w-[26px] items-center justify-center rounded border border-[#1D4ED8] bg-[#EFF6FF] px-1 text-[11px] font-semibold text-[#1D4ED8]"
                  >
                    {k === "x" ? "x" : k}
                  </span>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => removeWeight("left")}
              disabled={leftItems.length === 0}
              className="mt-1.5 w-full rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[11px] text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
            >
              {isEn ? "− remove one" : tw("− 拿掉一个")}
            </button>
          </Tray>

          <Tray title={isEn ? "Right pan" : tw("右盘")}>
            <div className="flex flex-wrap gap-1.5">
              {rightItems.length === 0 ? (
                <span className="text-[10.5px] text-[#94A3B8]">
                  {isEn ? "empty" : tw("空")}
                </span>
              ) : (
                rightItems.map((k, i) => (
                  <span
                    key={`${k}-${i}`}
                    className="flex h-7 min-w-[26px] items-center justify-center rounded border border-[#B08730] bg-[#FDF8EC] px-1 text-[11px] font-semibold text-[#8A6A20]"
                  >
                    {k === "x" ? "x" : k}
                  </span>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => removeWeight("right")}
              disabled={rightItems.length === 0}
              className="mt-1.5 w-full rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[11px] text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:opacity-40"
            >
              {isEn ? "− remove one" : tw("− 拿掉一个")}
            </button>
          </Tray>

          <button
            type="button"
            onClick={subtractBoth}
            className="rounded-lg border border-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-2 text-[11.5px] font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
          >
            {isEn ? "Subtract 1 from both" : tw("两边同时减 1")}
          </button>
          <button
            type="button"
            onClick={subtractBothX}
            className="rounded-lg border border-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-2 text-[11.5px] font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
          >
            {isEn ? "Subtract x from both" : tw("两边同时减 x")}
          </button>

          {stage === "mystery" ? (
            <div className="rounded-lg border border-[#C59B38] bg-[#FDF8EC] p-2.5">
              <p className="text-[10.5px] font-medium tracking-[0.12em] text-[#8A6A20] uppercase">
                {isEn ? "Weigh the box" : tw("称出黑盒")}
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="number"
                  value={mysteryAnswer}
                  onChange={(e) => setMysteryAnswer(e.target.value)}
                  placeholder="x ="
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
              {mysterySolved ? (
                <p className="mt-1.5 text-[11px] font-medium text-[#8A6A20]">
                  {isEn ? `Correct! x = ${mysteryX}` : tw(`正确！x = ${mysteryX}`)}
                </p>
              ) : null}
              <button
                type="button"
                onClick={newMystery}
                className="mt-1.5 w-full rounded border border-[#E8D9AE] bg-white px-2 py-1 text-[11px] text-[#8A6A20]"
              >
                {isEn ? "New box" : tw("换一个新黑盒")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 阶段切换 */}
      <StageSwitch stage={stage} onChange={() => {}} isEn={isEn} />
    </div>
  );
}

/** 格式化代数表达式，例如 ``2x + 3``。 */
function fmtExpr(xCount: number, unitCount: number, isEn: boolean): string {
  const parts: string[] = [];
  if (xCount > 0) parts.push(xCount === 1 ? "x" : `${xCount}x`);
  if (unitCount > 0) parts.push(String(unitCount));
  if (parts.length === 0) return "0";
  return parts.join(" + ");
}
