"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   LikeButton —— 点赞特效按钮

   来源与授权
   ──────────
   弹簧求解器（第 1 节）提取自开源动画库 **framer/motion**（现更名为
   Motion），取自仓库 commit `7415b6cd`，涉及以下文件：

     packages/motion-dom/src/animation/generators/spring.ts
     packages/motion-dom/src/value/spring-value.ts
     packages/motion-dom/src/value/utils/follow.ts
     packages/motion-dom/src/animation/FollowAnimation.ts

   原库采用 MIT License，版权归 Motion B.V. 所有：

     Copyright (c) 2024 Motion (https://motion.dev) B.V.

   本文件在原实现基础上做了「去框架化」重构，**保留物理算法本身**：

     · 三种阻尼分支的解析解（欠阻尼 / 临界阻尼 / 过阻尼）；
     · duration/bounce 到 stiffness/damping 的牛顿法数值求解；
     · 「动画中途改道时继承当前速度」的语义；
     · 共享 requestAnimationFrame 的帧循环设计。

   移除的部分：

     · MotionValue / MotionConfig / VisualElement 渲染层；
     · WAAPI 加速、拖拽、滚动时间线等与本组件无关的能力；
     · 全部外部依赖 —— **本组件不引入任何 npm 包**。

   MIT License 要求保留版权声明，故保留上述说明。
   ═══════════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════════
   1. 弹簧物理（提取自 framer/motion 的 spring 生成器）
   ═══════════════════════════════════════════════════════════════════════ */

/** 物理参数默认值。 */
const defaultStiffness = 100;
const defaultDamping = 10;
const defaultMass = 1.0;

/** 时间参数默认值（duration 以毫秒计）。 */
const defaultDuration = 800;
const defaultBounce = 0.3;
const defaultVisualDuration = 0.3;

/** 静止判定阈值。 */
const restSpeedGranular = 0.01;
const restSpeedDefault = 2;
const restDeltaGranular = 0.005;
const restDeltaDefault = 0.5;

/** 数值边界。 */
const minDuration = 0.01;
const maxDuration = 10.0;
const minDamping = 0.05;

const secondsToMilliseconds = (seconds: number) => seconds * 1000;
const millisecondsToSeconds = (milliseconds: number) => milliseconds / 1000;

const clamp = (min: number, max: number, v: number) =>
  v > max ? max : v < min ? min : v;

/**
 * 把 bounce 映射为阻尼比（与 SwiftUI 的做法一致）：
 * 0 为临界阻尼，越接近 1 越接近无阻尼，越接近 -1 越接近过阻尼。
 * 两端都做了限幅，保证弹簧始终会动并且最终会停下来。
 */
function bounceToDampingRatio(bounce: number): number {
  return bounce < 0
    ? 1 / Math.max(1 + bounce, minDamping)
    : Math.max(1 - bounce, minDamping);
}

/**
 * 缩放过阻尼弹簧的无阻尼固有频率，使它在「定义时刻」的剩余距离，
 * 与临界阻尼弹簧在该时刻的剩余距离一致。
 *
 * 负 bounce 因此只改变曲线形状、不改变到达时间；bounce 为 0 时缩放为 1，
 * 因此临界阻尼处不会产生跳变。
 */
function overdampedFreqScale(
  dampingRatio: number,
  criticalFreqTime: number,
): number {
  if (!(dampingRatio > 1)) return 1;

  const root = Math.sqrt(dampingRatio * dampingRatio - 1);
  const slow = dampingRatio - root;
  const fast = dampingRatio + root;
  const target =
    2 * root * Math.exp(-criticalFreqTime) * (1 + criticalFreqTime);

  return (
    approximateRoot(
      (freqTime) =>
        fast * Math.exp(-slow * freqTime) -
        slow * Math.exp(-fast * freqTime) -
        target,
      (freqTime) => Math.exp(-fast * freqTime) - Math.exp(-slow * freqTime),
      criticalFreqTime,
    ) / criticalFreqTime
  );
}

function calcAngularFreq(undampedFreq: number, dampingRatio: number): number {
  return undampedFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
}

const rootIterations = 12;

/** 牛顿法求根。 */
function approximateRoot(
  envelope: (num: number) => number,
  derivative: (num: number) => number,
  initialGuess: number,
): number {
  let result = initialGuess;
  for (let i = 1; i < rootIterations; i++) {
    result = result - envelope(result) / derivative(result);
  }
  return result;
}

/** 数值下限，防止 exp 溢出导致解发散。 */
const safeMin = 0.001;

/**
 * 由 duration/bounce 反解 stiffness/damping。
 *
 * 移植自 Framer 的「基于时长的弹簧求解」，牛顿法迭代求解包络函数的根。
 */
function findSpring({
  duration = defaultDuration,
  bounce = defaultBounce,
}: SpringOptions): { stiffness: number; damping: number; duration: number } {
  let envelope: (num: number) => number;
  let derivative: (num: number) => number;

  const dampingRatio = bounceToDampingRatio(bounce);
  duration = clamp(minDuration, maxDuration, millisecondsToSeconds(duration));

  if (dampingRatio < 1) {
    /* 欠阻尼：会过冲、有回弹。 */
    envelope = (undampedFreq) => {
      const exponentialDecay = undampedFreq * dampingRatio;
      const delta = exponentialDecay * duration;
      const b = calcAngularFreq(undampedFreq, dampingRatio);
      const c = Math.exp(-delta);
      return safeMin - (exponentialDecay / b) * c;
    };

    derivative = (undampedFreq) => {
      const exponentialDecay = undampedFreq * dampingRatio;
      const delta = exponentialDecay * duration;
      const e =
        dampingRatio *
        dampingRatio *
        undampedFreq *
        undampedFreq *
        duration;
      const f = Math.exp(-delta);
      const g = calcAngularFreq(undampedFreq * undampedFreq, dampingRatio);
      const factor = -envelope(undampedFreq) + safeMin > 0 ? -1 : 1;
      return (factor * -e * f) / g;
    };
  } else {
    /* 临界阻尼；过阻尼复用同一个根，再按 overdampedFreqScale 缩放。 */
    envelope = (undampedFreq) => {
      const a = Math.exp(-undampedFreq * duration);
      const b = undampedFreq * duration + 1;
      return -safeMin + a * b;
    };

    derivative = (undampedFreq) => {
      const a = Math.exp(-undampedFreq * duration);
      const b = -undampedFreq * (duration * duration);
      return a * b;
    };
  }

  const initialGuess = 5 / duration;
  const criticalFreq = approximateRoot(envelope, derivative, initialGuess);
  const undampedFreq =
    criticalFreq * overdampedFreqScale(dampingRatio, criticalFreq * duration);
  const stiffness = undampedFreq * undampedFreq;

  return {
    stiffness,
    damping: dampingRatio * 2 * Math.sqrt(stiffness),
    duration: secondsToMilliseconds(duration),
  };
}

/**
 * 物理参数必须有限；stiffness 与 mass 是除数故必须为正，
 * damping 为 0 是合法的（永久振荡）。
 */
const isValidPhysics = (value: number | undefined, canBeZero?: boolean) =>
  (canBeZero ? value! >= 0 : value! > 0) && value! < Infinity;

/** 非法物理参数回落到默认值，避免解出 NaN 导致动画永不结束。 */
function resolvePhysics(value: number | undefined, canBeZero?: boolean) {
  return isValidPhysics(value, canBeZero) ? value : undefined;
}

/** 归一化弹簧配置，返回实际使用的 stiffness/damping/mass。 */
function getSpringOptions(options: SpringOptions): ResolvedSpringOptions {
  const validStiffness = resolvePhysics(options.stiffness);
  const validDamping = resolvePhysics(options.damping, true);
  const validMass = resolvePhysics(options.mass);

  const springOptions: ResolvedSpringOptions = {
    ...options,
    stiffness: validStiffness ?? defaultStiffness,
    damping: validDamping ?? defaultDamping,
    mass: validMass ?? defaultMass,
    isResolvedFromDuration: false,
    /* stiffness/damping/mass 的显式配置优先于 duration/bounce。 */
    isTimeDefined:
      (validStiffness ?? validDamping ?? validMass) === undefined &&
      (options.duration !== undefined || options.bounce !== undefined),
  };

  if (springOptions.isTimeDefined) {
    if (options.visualDuration) {
      const dampingRatio = bounceToDampingRatio(options.bounce || 0);
      const root =
        ((2 * Math.PI) / (options.visualDuration * 1.2)) *
        overdampedFreqScale(dampingRatio, (2 * Math.PI) / 1.2);
      springOptions.stiffness = root * root;
      springOptions.damping =
        2 * dampingRatio * Math.sqrt(springOptions.stiffness);
    } else {
      Object.assign(springOptions, findSpring(springOptions));
      springOptions.isResolvedFromDuration = true;
    }

    /* 时间参数可能退化：NaN 的 bounce 会得到 NaN 的 damping。
       两个一起替换，避免 duration 求解建立的关系只被覆盖一半。 */
    if (
      !isValidPhysics(springOptions.stiffness) ||
      !isValidPhysics(springOptions.damping, true)
    ) {
      springOptions.stiffness = defaultStiffness;
      springOptions.damping = defaultDamping;
    }
  }

  return springOptions;
}

export interface SpringOptions {
  /** 刚度。越大越快回位。 */
  stiffness?: number;
  /** 阻尼。越小回弹越明显。 */
  damping?: number;
  /** 质量。 */
  mass?: number;
  /** 初始速度（单位/秒）。 */
  velocity?: number;
  /** 判定静止的速度阈值。 */
  restSpeed?: number;
  /** 判定静止的位置阈值。 */
  restDelta?: number;
  /** 动画时长（毫秒）。与 bounce 一起使用时反解物理参数。 */
  duration?: number;
  /** 回弹量。0 为临界阻尼，负值表示过阻尼。 */
  bounce?: number;
  /** 视觉时长（秒）。 */
  visualDuration?: number;
}

interface ResolvedSpringOptions extends SpringOptions {
  stiffness: number;
  damping: number;
  mass: number;
  isResolvedFromDuration: boolean;
  isTimeDefined: boolean;
  duration?: number;
}

/** 弹簧生成器对外接口。 */
interface SpringGenerator {
  /** 推进到时间 t（毫秒），返回当前位置与是否已静止。 */
  next: (t: number) => { done: boolean; value: number };
  /** 时间 t 处的速度（单位/秒）。 */
  velocity: (t: number) => number;
  /** 中途改道：从当前位置与给定速度重新瞄准新目标。 */
  retarget: (keyframes: number[], newVelocity: number) => void;
}

/**
 * 创建弹簧生成器。
 *
 * 原库在这里用 `MotionValue` 承载状态；这里改成闭包内的普通状态对象，
 * 数值语义完全一致。
 */
function springGenerator(
  options: SpringOptions = {},
  origin = 0,
  target = origin,
): SpringGenerator {
  const resolved = getSpringOptions({ ...options });

  const {
    stiffness,
    damping,
    mass,
    duration,
    isResolvedFromDuration,
    isTimeDefined,
  } = resolved;

  /**
   * 按定义时长求解的弹簧不继承外部速度：中途打断带来的速度会让
   * 小幅度动画剧烈振荡。
   */
  const inheritVelocity = (velocity: number) =>
    isTimeDefined ? 0 : -millisecondsToSeconds(velocity);

  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  const undampedAngularFreq = millisecondsToSeconds(
    Math.sqrt(stiffness / mass),
  );
  const decay = dampingRatio * undampedAngularFreq;

  /**
   * 改道时需要更新的全部状态集中在一个对象上，读写都在闭包内完成。
   */
  const s = {
    target,
    delta: target - origin,
    velocity: inheritVelocity(options.velocity || 0) || 0,
    restSpeed: 0,
    restDelta: 0,
  };

  /**
   * 变化幅度很小的动画（< 5）用更严的静止阈值，避免「看起来已经停了
   * 但仍在微动」的拖泥带水感。
   */
  const setRestThresholds = () => {
    const isGranularScale = Math.abs(s.delta) < 5;
    s.restSpeed =
      options.restSpeed ||
      (isGranularScale ? restSpeedGranular : restSpeedDefault);
    s.restDelta =
      options.restDelta ||
      (isGranularScale ? restDeltaGranular : restDeltaDefault);
  };
  setRestThresholds();

  let resolveSpring: (v: number) => number;
  let resolveVelocity: (t: number) => number;

  /** 依据原点、目标与初速度重算系数。 */
  let update: VoidFunction;

  if (dampingRatio < 1) {
    /* ── 欠阻尼：会过冲，带回弹。 ── */
    const angularFreq = calcAngularFreq(undampedAngularFreq, dampingRatio);

    /**
     * A 是位置系数，sinC/cosC 是解析导数（单位/毫秒）的系数。
     * exp/sin/cos 只与 t 有关，因此按 t 记忆化 —— 每帧都改道的弹簧
     * 采样的是同一个 t，可以完全跳过超越函数计算。
     */
    const c = { A: 0, sinC: 0, cosC: 0, t: -1, env: 0, sin: 0, cos: 0 };

    update = () => {
      c.A = (s.velocity + decay * s.delta) / angularFreq;
      c.sinC = decay * c.A + s.delta * angularFreq;
      c.cosC = decay * s.delta - c.A * angularFreq;
    };

    const sample = (t: number) => {
      if (t !== c.t) {
        c.t = t;
        c.env = Math.exp(-decay * t);
        c.sin = Math.sin(angularFreq * t);
        c.cos = Math.cos(angularFreq * t);
      }
    };

    resolveSpring = (t: number) => {
      sample(t);
      return s.target - c.env * (c.A * c.sin + s.delta * c.cos);
    };

    resolveVelocity = (t: number) => {
      sample(t);
      return c.env * (c.sinC * c.sin + c.cosC * c.cos);
    };
  } else if (dampingRatio === 1) {
    /* ── 临界阻尼：最快到达且不过冲。 ── */
    resolveSpring = (t: number) =>
      s.target -
      Math.exp(-undampedAngularFreq * t) *
        (s.delta + (s.velocity + undampedAngularFreq * s.delta) * t);

    const c = { C: 0 };
    update = () => {
      c.C = s.velocity + undampedAngularFreq * s.delta;
    };

    resolveVelocity = (t: number) =>
      Math.exp(-undampedAngularFreq * t) *
      (undampedAngularFreq * c.C * t - s.velocity);
  } else {
    /* ── 过阻尼：慢速指数 + 快速指数之和，任何阻尼下都不会溢出。 ── */
    const dampedAngularFreq =
      undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);
    const slow = decay - dampedAngularFreq;
    const fast = decay + dampedAngularFreq;

    /**
     * 过阻尼弹簧保留一个非物理的极限：一旦 dampedAngularFreq * t 超过 300，
     * 两个指数项都按阻尼速率衰减。这让重阻尼的「拖拽」弹簧几乎立刻停住，
     * 而不是以 stiffness/damping 的速度慢慢爬。只有在 300ms 内能到达该
     * 极限时才会生效（dampedAngularFreq 为 1 rad/ms），读起来就是一根
     * 硬弹簧「咔」地到位 —— 再晚就会截断一个肉眼可见仍在移动的慢弹簧。
     */
    const limit =
      dampedAngularFreq < 1 || isTimeDefined
        ? Infinity
        : 300 / dampedAngularFreq;
    const decayAt = (rate: number, t: number) =>
      Math.exp(t > limit ? (decay - rate) * limit - decay * t : -rate * t);

    const c = { S: 0, F: 0 };
    update = () => {
      const P = (s.velocity + decay * s.delta) / dampedAngularFreq;
      c.S = (s.delta + P) / 2;
      c.F = (s.delta - P) / 2;
    };

    resolveSpring = (t: number) =>
      s.target - c.S * decayAt(slow, t) - c.F * decayAt(fast, t);

    resolveVelocity = (t: number) =>
      slow * c.S * decayAt(slow, t) + fast * c.F * decayAt(fast, t);
  }

  update();

  return {
    retarget: (keyframes: number[], newVelocity: number) => {
      s.target = keyframes[keyframes.length - 1];
      s.delta = s.target - keyframes[0];
      s.velocity = inheritVelocity(newVelocity);
      /* 默认阈值依赖新的变化幅度。 */
      if (!(options.restSpeed && options.restDelta)) setRestThresholds();
      update();
    },
    velocity: (t: number) => secondsToMilliseconds(resolveVelocity(t)),
    next: (t: number) => {
      const current = resolveSpring(t);

      if (!isResolvedFromDuration) {
        const currentVelocity = secondsToMilliseconds(resolveVelocity(t));
        const done =
          Math.abs(currentVelocity) <= s.restSpeed &&
          Math.abs(s.target - current) <= s.restDelta;
        return { done, value: done ? s.target : current };
      }

      const done = t >= duration!;
      return { done, value: done ? s.target : current };
    },
  };
}


/* ═══════════════════════════════════════════════════════════════════════
   2. 帧循环与动画值
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 所有弹簧共用一个 requestAnimationFrame 回调。
 *
 * 这是原库 FollowAnimation 的核心设计：每个动画各自持有 requestAnimationFrame
 * 会在组件多时成倍放大调度开销，共用一个则只有一帧一次回调。
 */
const activeAnimations = new Set<SpringAnimation>();
let frameId: number | null = null;

function tickAll(timestamp: number) {
  // 复制一份：回调里可能停止动画，直接遍历原集合会出问题。
  for (const animation of Array.from(activeAnimations)) {
    animation.tick(timestamp);
  }
  if (activeAnimations.size > 0) {
    frameId = requestAnimationFrame(tickAll);
  } else {
    frameId = null;
  }
}

function scheduleFrame() {
  if (frameId === null) {
    frameId = requestAnimationFrame(tickAll);
  }
}

function unscheduleIfIdle() {
  if (activeAnimations.size === 0 && frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}

/** 单次弹簧动画。 */
class SpringAnimation {
  private generator: SpringGenerator;
  private startTime = 0;
  private currentTime = 0;
  private started = false;

  /** 本帧内设置的新目标，在下一帧统一应用 —— 一帧内多次 set 只改道一次。 */
  private hasNextTarget = false;
  private nextTarget = 0;
  private nextVelocity: number | undefined;

  private finished = false;

  constructor(
    origin: number,
    target: number,
    velocity: number,
    options: SpringOptions,
    private onUpdate: (value: number) => void,
    private onComplete: () => void,
  ) {
    /**
     * 初速度必须放进 options —— 生成器在**构造时**就从 `options.velocity`
     * 读取初速度（并做符号与单位换算），而不是从别处取。
     *
     * 换算关系：外部速度单位是「单位/秒」，生成器内部按「单位/毫秒」工作，
     * 且内部符号与外部相反，所以由 `inheritVelocity` 统一处理。
     */
    this.generator = springGenerator(
      { restDelta: 0.001, restSpeed: 0.01, ...options, velocity },
      origin,
      target,
    );
    this.startTime = performance.now();
    activeAnimations.add(this);
    scheduleFrame();
  }

  /** 动画中途改道：下一帧生效。 */
  setTarget(target: number, velocity?: number) {
    this.nextTarget = target;
    this.nextVelocity = velocity;
    this.hasNextTarget = true;
  }

  /** 当前速度（单位/秒）。 */
  getVelocity(): number {
    return this.generator.velocity(this.currentTime);
  }

  get isFinished() {
    return this.finished;
  }

  tick(timestamp: number) {
    const elapsed = Math.max(0, timestamp - this.startTime);
    this.currentTime = elapsed;

    const state = this.generator.next(elapsed);

    if (this.hasNextTarget) {
      /**
       * 从当前轨迹已经到达的位置改道，并把该位置作为新原点，
       * 这样改道不会产生视觉跳变。
       */
      this.hasNextTarget = false;
      const keyframes = [state.value, this.nextTarget];
      this.generator.retarget(
        keyframes,
        this.nextVelocity ?? this.getVelocity(),
      );
      this.startTime = timestamp;
      this.currentTime = 0;
      this.started = true;
      this.onUpdate(this.generator.next(0).value);
      return;
    }

    if (!this.started) this.started = true;
    this.onUpdate(state.value);

    if (state.done && !this.hasNextTarget) {
      this.finished = true;
      activeAnimations.delete(this);
      unscheduleIfIdle();
      this.onComplete();
    }
  }

  stop() {
    activeAnimations.delete(this);
    unscheduleIfIdle();
    this.finished = true;
  }
}

/**
 * 一个可被弹簧驱动的数值。
 *
 * 对应原库的 `MotionValue` + `springValue` 组合，但只保留数值部分：
 * 读取、订阅、设置目标。不涉及 React 渲染。
 */
class AnimatedValue {
  private current: number;
  private options: SpringOptions;
  private animation: SpringAnimation | null = null;
  private listeners = new Set<(value: number) => void>();

  constructor(initial: number, options: SpringOptions = {}) {
    this.current = initial;
    this.options = options;
  }

  get(): number {
    return this.current;
  }

  /** 订阅数值变化，返回取消订阅函数。 */
  subscribe(listener: (value: number) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) listener(this.current);
  }

  /**
   * 设置目标值。
   *
   * 若已有动画在跑，就地改道并继承当前速度 —— 这样快速连点时动画会
   * 连续地「接力」，而不是每次都从零重启。
   */
  set(target: number, velocity?: number) {
    /* 已经在目标位置就不启动动画。 */
    if (target === this.current && !this.animation) return;

    const resolvedVelocity = velocity ?? this.getVelocity();

    if (this.animation && !this.animation.isFinished) {
      this.animation.setTarget(target, resolvedVelocity);
      return;
    }

    this.animation = new SpringAnimation(
      this.current,
      target,
      resolvedVelocity,
      this.options,
      (value) => {
        this.current = value;
        this.emit();
      },
      () => {
        this.animation = null;
      },
    );
  }

  /**
   * 给一个「静止在原点」的弹簧施加一次冲量。
   *
   * 目标恒为 0，只给一个初速度：弹簧先被推开再被拉回原位，
   * 这正是「戳一下」的手感，比预设关键帧自然得多。
   */
  kick(impulse: number) {
    this.animation?.stop();
    this.animation = new SpringAnimation(
      this.current,
      0,
      impulse,
      this.options,
      (value) => {
        this.current = value;
        this.emit();
      },
      () => {
        this.animation = null;
      },
    );
  }

  /**
   * 直接跳到某个值，不产生动画。
   *
   * 用于「每次点击都从 0 重新开始」的进度型动画。
   */
  jump(value: number) {
    this.animation?.stop();
    this.animation = null;
    this.current = value;
    this.emit();
  }

  getVelocity(): number {
    return this.animation && !this.animation.isFinished
      ? this.animation.getVelocity()
      : 0;
  }

  stop() {
    this.animation?.stop();
    this.animation = null;
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   3. React 绑定
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 创建一个受弹簧驱动的数值。
 *
 * 数值变化**不会**触发 React 重渲染 —— 组件直接把它写进 DOM style。
 * 这是 Motion 的核心性能取舍：逐帧重渲染组件树是动画卡顿的主因。
 */
function useAnimatedValue(
  initial: number,
  options: SpringOptions,
): AnimatedValue {
  const ref = useRef<AnimatedValue | null>(null);
  if (ref.current === null) {
    ref.current = new AnimatedValue(initial, options);
  }
  return ref.current;
}

/** 缓动函数：用于把弹簧进度映射成视觉参数。 */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;


/* ═══════════════════════════════════════════════════════════════════════
   4. 点赞按钮组件
   ═══════════════════════════════════════════════════════════════════════ */

export interface LikeButtonProps {
  /** 点赞数。由外部控制（父组件或服务端数据）。 */
  count?: number;
  /** 受控模式下的点赞状态。不传则组件自行管理。 */
  liked?: boolean;
  /** 点赞状态变化时回调。 */
  onChange?: (liked: boolean) => void;
  /** 按钮尺寸档位。 */
  size?: "sm" | "md" | "lg";
  /** 额外类名。 */
  className?: string;
  /** 禁用。 */
  disabled?: boolean;
}

const SIZE_MAP = {
  sm: { icon: 14, button: "h-7 px-2 gap-1", text: "text-[11.5px]" },
  md: { icon: 17, button: "h-8 px-2.5 gap-1.5", text: "text-[12.5px]" },
  lg: { icon: 22, button: "h-10 px-3.5 gap-2", text: "text-[13.5px]" },
} as const;

/** 迸发粒子的布局：8 颗，沿圆形均匀分布，距离略有差异。 */
const PARTICLE_COUNT = 8;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
  // 奇偶交错距离，避免看起来过于机械。
  const distance = 16 + (index % 2) * 5;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    size: 3 + (index % 3),
    delay: (index % 4) * 0.012,
  };
});

/**
 * 点赞特效按钮。
 *
 * 三个动画层，全部由第 1 节的真实弹簧求解器驱动，不是 CSS 关键帧：
 *
 *   · 心形缩放 —— 两根弹簧叠加：
 *       `scale` 跟随点赞状态平滑地变大/变小；
 *       `pop` 是一次性冲量弹簧，给点击一个「戳」的弹性手感；
 *   · 扩散光环 —— 从图标中心放大并淡出；
 *   · 迸发粒子 —— 沿八个方向飞出并淡出。
 */
export function LikeButton({
  count = 0,
  liked,
  onChange,
  size = "md",
  className = "",
  disabled = false,
}: LikeButtonProps) {
  const [internalLiked, setInternalLiked] = useState(false);
  const isLiked = liked ?? internalLiked;

  const heartRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const particleRefs = useRef<(HTMLSpanElement | null)[]>([]);

  /**
   * 心形基准缩放：跟随点赞状态。轻微欠阻尼（临界阻尼为 26.8），
   * 所以到位时会有一点点回弹。
   */
  const scale = useAnimatedValue(isLiked ? 1.18 : 1, {
    stiffness: 520,
    damping: 24,
    mass: 1,
  });

  /**
   * 点击冲量：目标恒为 0，只靠初速度推动。
   * 欠阻尼弹簧被推开后会被拉回原位，这就是「戳一下」的弹性。
   */
  const pop = useAnimatedValue(0, { stiffness: 480, damping: 12, mass: 1 });

  /**
   * 光环与粒子的进度：单调递增，方便用缓动函数映射成位移与透明度。
   */
  const burst = useAnimatedValue(0, { stiffness: 220, damping: 26, mass: 1 });

  const reducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = query.matches;
    const onChange = () => {
      reducedMotion.current = query.matches;
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  /**
   * 把弹簧数值直接写进 DOM。
   *
   * 逐帧只改 style，不触发 React 重渲染。
   */
  useEffect(() => {
    const unsubscribeScale = scale.subscribe((value) => {
      const node = heartRef.current;
      if (!node) return;
      node.style.transform = `scale(${value.toFixed(4)})`;
    });

    const unsubscribePop = pop.subscribe((value) => {
      const node = heartRef.current;
      if (!node) return;
      // 冲量弹簧会略微越过 0（弹簧值可正可负），
      // 叠加在基准缩放上就形成「胀大 → 回弹 → 微微内收 → 归位」。
      const multiplier = 1 + value * 0.28;
      node.style.setProperty("--like-scale", multiplier.toFixed(4));
    });

    const unsubscribeBurst = burst.subscribe((value) => {
      const progress = Math.max(0, Math.min(1, value));

      const ring = ringRef.current;
      if (ring) {
        const ringScale = 0.45 + easeOutCubic(progress) * 1.35;
        ring.style.transform = `scale(${ringScale.toFixed(4)})`;
        ring.style.opacity = Math.max(0, 1 - easeInCubic(progress)).toFixed(4);
      }

      for (let index = 0; index < PARTICLE_COUNT; index++) {
        const node = particleRefs.current[index];
        if (!node) continue;
        const particle = PARTICLES[index];
        // 每个粒子略微延迟，形成先后散开的层次。
        const local = Math.max(
          0,
          Math.min(1, (progress - particle.delay) / (1 - particle.delay)),
        );
        const eased = easeOutCubic(local);
        const x = particle.dx * eased;
        const y = particle.dy * eased;
        node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(
          2,
        )}px, 0) scale(${Math.max(0, 1 - local).toFixed(3)})`;
        node.style.opacity = Math.max(0, 1 - easeInCubic(local)).toFixed(4);
      }
    });

    return () => {
      unsubscribeScale();
      unsubscribePop();
      unsubscribeBurst();
    };
  }, [burst, pop, scale]);

  // 卸载时停掉动画，避免对已卸载的 DOM 继续写入。
  useEffect(
    () => () => {
      scale.stop();
      pop.stop();
      burst.stop();
    },
    [burst, pop, scale],
  );

  /**
   * 点赞状态变化 → 基准缩放的目标跟着变。
   *
   * 单独一个 effect 而不是放在 toggle 里，这样受控模式下
   * 外部改 `liked` 也能正确响应。
   */
  useEffect(() => {
    scale.set(isLiked ? 1.18 : 1);
  }, [isLiked, scale]);

  const toggle = useCallback(() => {
    if (disabled) return;

    const next = !isLiked;
    if (liked === undefined) setInternalLiked(next);
    onChange?.(next);

    if (reducedMotion.current) {
      // 尊重系统的「减少动态效果」偏好：只切换状态，不做特效。
      pop.jump(0);
      burst.jump(0);
      return;
    }

    if (next) {
      /**
       * 冲量：给弹簧一个初速度，它自己涨上去再被拉回来。
       *
       * 单位是「缩放倍率/秒」。峰值约 v0 × 0.427（见 spring 的解析解），
       * 乘以 0.28 的映射系数后约合 12% 的额外胀大 —— 明显但不夸张。
       */
      pop.kick(14);
      // 光环与粒子：归零后重新拉满。
      burst.jump(0);
      burst.set(1);
    } else {
      // 取消点赞：冲量立即收起。
      pop.jump(0);
      burst.jump(0);
    }
  }, [burst, disabled, isLiked, liked, onChange, pop]);

  const dimensions = SIZE_MAP[size];

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={isLiked}
      aria-label={isLiked ? "取消点赞" : "点赞"}
      className={[
        "relative inline-flex items-center rounded-lg border border-[var(--border)]",
        "bg-[var(--card)] font-medium text-[var(--foreground)]",
        "transition-colors hover:bg-[var(--muted)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        dimensions.button,
        dimensions.text,
        className,
      ].join(" ")}
    >
      {/* 图标容器：心形、光环、粒子共用中心点。 */}
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        {/* 扩散光环 */}
        <span
          ref={ringRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-rose-400"
          style={{ opacity: 0, transform: "scale(0.45)" }}
        />

        {/* 迸发粒子 */}
        {PARTICLES.map((particle, index) => (
          <span
            key={index}
            ref={(node) => {
              particleRefs.current[index] = node;
            }}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-rose-400"
            style={{
              width: particle.size,
              height: particle.size,
              marginLeft: -particle.size / 2,
              marginTop: -particle.size / 2,
              opacity: 0,
            }}
          />
        ))}

        {/* 心形本体：基准缩放与冲量缩放相乘。 */}
        <span
          ref={heartRef}
          aria-hidden
          className="relative flex items-center justify-center"
          style={
            {
              transform: `scale(${isLiked ? 1.18 : 1})`,
              "--like-scale": 1,
            } as React.CSSProperties
          }
        >
          <span
            className="flex items-center justify-center"
            style={{
              transform: "scale(var(--like-scale))",
            }}
          >
            <Heart
              size={dimensions.icon}
              strokeWidth={2}
              className={
                isLiked
                  ? "fill-rose-500 text-rose-500"
                  : "text-[var(--muted-foreground)]"
              }
            />
          </span>
        </span>
      </span>

      {count > 0 && (
        <span className="tabular-nums text-[var(--muted-foreground)]">
          {count}
        </span>
      )}
    </button>
  );
}

export default LikeButton;
