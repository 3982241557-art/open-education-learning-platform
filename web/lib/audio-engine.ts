/**
 * 实时音效引擎（Web Audio API）
 * =============================
 *
 * ⛔ **零外部资源**——没有一个 ``.mp3``、没有一个 CDN。所有声音都在
 *    浏览器里用 ``AudioContext`` **实时合成**。这保证了：
 *
 * - 全球任何网络下都能 0.1 秒开声，不存在「音频 404 → 白屏」；
 * - 音高可以**连续**跟着数值走（滑块一动，音高就变）；
 * - 短片与交互实验共享同一个音频上下文，不会互相打断。
 *
 * 音色
 * ----
 *
 * - ``marimba`` —— 木琴：正弦基频 + 三次谐波 + 极快指数衰减。
 *   短片的「逐年递增敲击」用它。
 * - ``glass``  —— 玻璃：正弦 + 一点不谐和泛音，衰减更长、更亮。
 *   「一尺之棰」的切分音用它。
 * - ``pulse``  —— 电子脉冲：方波 + 低通，干净短促。
 *   概率专题的粒子分流用它。
 * - ``chord``  —— 共鸣和弦：多个失谐正弦叠加，长衰减。
 *   「第 8 年高潮」用它。
 *
 * 解锁
 * ----
 *
 * 浏览器规定：``AudioContext`` 必须在**用户手势**里创建/恢复。所以
 * 引擎是**懒启动**的——第一次调用任何发声函数时才建上下文，
 * 并且所有公开方法都会先 ``resume()``。
 */

type Tone = "marimba" | "glass" | "pulse" | "chord";

/** 引擎句柄。 */
export interface AudioEngine {
  /** 全局静音开关的当前状态。 */
  readonly muted: boolean;
  /** 切换静音。 */
  toggleMute(): boolean;
  /** 设置静音状态。 */
  setMuted(next: boolean): void;
  /** 敲一下音（递增音阶用）。 */
  tap(index: number, total?: number): void;
  /** 单音（可指定频率与音色）。 */
  blip(freq: number, tone?: Tone, gain?: number, duration?: number): void;
  /** 共鸣和弦。 */
  chord(freqs?: number[], gain?: number, duration?: number): void;
  /** 一声清脆的「切」。 */
  slice(index?: number): void;
  /** 电子脉冲。 */
  pulse(freq?: number, gain?: number): void;
  /**
   * 连续音——音高跟随数值。
   *
   * @param freq 目标频率
   * @param gain 音量
   */
  glide(freq: number, gain?: number): void;
  /** 停止连续音。 */
  stopGlide(): void;
  /** 释放所有资源。 */
  dispose(): void;
}

/** 静默实现——浏览器不支持 Web Audio 时兜底，保证功能不崩。 */
const SILENT: AudioEngine = {
  muted: false,
  toggleMute: () => false,
  setMuted: () => {},
  tap: () => {},
  blip: () => {},
  chord: () => {},
  slice: () => {},
  pulse: () => {},
  glide: () => {},
  stopGlide: () => {},
  dispose: () => {},
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let glideOsc: OscillatorNode | null = null;
let glideGain: GainNode | null = null;

/** 懒建 AudioContext。 */
function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

/** 五声音阶——递增音阶听感更「高级」，不刺耳。 */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** 把半音数转成频率。 */
function semi(base: number, n: number): number {
  return base * Math.pow(2, n / 12);
}

/** 造一个带包络的振荡器。 */
function voice(
  frequency: number,
  type: OscillatorType,
  gain: number,
  duration: number,
  delay = 0,
  detune = 0,
): void {
  const ac = ensureContext();
  if (!ac || !master) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** 木琴音色：基频 + 三次谐波。 */
function marimba(frequency: number, gain = 0.22, duration = 0.5): void {
  voice(frequency, "sine", gain, duration);
  voice(frequency * 3, "sine", gain * 0.22, duration * 0.45);
  voice(frequency * 6.01, "sine", gain * 0.08, duration * 0.22);
}

/** 玻璃音色。 */
function glass(frequency: number, gain = 0.16, duration = 0.9): void {
  voice(frequency, "sine", gain, duration);
  voice(frequency * 2.76, "sine", gain * 0.18, duration * 0.6);
  voice(frequency * 5.4, "sine", gain * 0.06, duration * 0.3);
}

/** 电子脉冲。 */
function pulseTone(frequency: number, gain = 0.12, duration = 0.16): void {
  voice(frequency, "square", gain * 0.4, duration);
  voice(frequency * 2, "sine", gain * 0.6, duration * 0.8);
}

/** 造引擎。 */
function createEngine(): AudioEngine {
  return {
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) {
        master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
      }
      if (muted) this.stopGlide();
      return muted;
    },
    setMuted(next: boolean) {
      muted = next;
      if (master && ctx) {
        master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
      }
      if (muted) this.stopGlide();
    },
    tap(index: number, total = 8) {
      if (muted) return;
      /* 主旋律：随进度整体上行一个八度再多一点。 */
      const progress = total > 1 ? index / (total - 1) : 0;
      const base = 261.63 * Math.pow(2, progress * 1.15);
      /* 叠一个五声音阶级进，听感更「清脆」而不是滑音。 */
      const step = PENTATONIC[Math.min(index, PENTATONIC.length - 1)];
      marimba(semi(base, step), 0.18, 0.55);
      marimba(base * 2, 0.05, 0.28);
    },
    blip(freq, tone = "marimba", gain = 0.2, duration = 0.5) {
      if (muted) return;
      if (tone === "glass") glass(freq, gain, duration);
      else if (tone === "pulse") pulseTone(freq, gain, duration);
      else marimba(freq, gain, duration);
    },
    chord(freqs = [261.63, 329.63, 392.0, 523.25], gain = 0.16, duration = 2.4) {
      if (muted) return;
      freqs.forEach((f, i) => {
        voice(f, "sine", gain, duration, i * 0.045);
        voice(f * 2, "sine", gain * 0.25, duration * 0.7, i * 0.045, 4);
      });
    },
    slice(index = 0) {
      if (muted) return;
      const f = 880 * Math.pow(2, Math.min(index, 14) / 24);
      glass(f, 0.16, 1.0);
      glass(f * 1.5, 0.05, 0.6);
    },
    pulse(freq = 520, gain = 0.12) {
      if (muted) return;
      pulseTone(freq, gain, 0.15);
    },
    glide(freq, gain = 0.1) {
      if (muted) return;
      const ac = ensureContext();
      if (!ac || !master) return;
      if (!glideOsc || !glideGain) {
        glideOsc = ac.createOscillator();
        glideGain = ac.createGain();
        glideOsc.type = "triangle";
        glideGain.gain.value = 0.0001;
        glideOsc.connect(glideGain);
        glideGain.connect(master);
        glideOsc.start();
      }
      glideOsc.frequency.setTargetAtTime(
        Math.max(40, Math.min(2400, freq)),
        ac.currentTime,
        0.05,
      );
      glideGain.gain.setTargetAtTime(Math.max(0.0002, gain), ac.currentTime, 0.06);
    },
    stopGlide() {
      const ac = ctx;
      if (!ac || !glideOsc || !glideGain) return;
      glideGain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05);
      const osc = glideOsc;
      const g = glideGain;
      glideOsc = null;
      glideGain = null;
      window.setTimeout(() => {
        try {
          osc.stop();
        } catch {
          /* 已停止 */
        }
        try {
          g.disconnect();
        } catch {
          /* 忽略 */
        }
      }, 400);
    },
    dispose() {
      this.stopGlide();
      if (ctx) {
        void ctx.close().catch(() => {});
        ctx = null;
        master = null;
      }
    },
  };
}

/** 全站共享的引擎单例。 */
export const audioEngine: AudioEngine =
  typeof window !== "undefined" && window.AudioContext
    ? createEngine()
    : SILENT;

/** 便捷导出：直接取引擎（供 SSR 安全调用）。 */
export function getAudioEngine(): AudioEngine {
  return audioEngine;
}

/** 把一个数值映射到音高（对数刻度）。 */
export function valueToFreq(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 220;
  const span = max - min;
  const t = span === 0 ? 0.5 : (value - min) / span;
  const clamped = Math.max(0, Math.min(1, t));
  return 110 * Math.pow(2, clamped * 2.6);
}
