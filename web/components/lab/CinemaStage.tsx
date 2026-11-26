"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { audioEngine } from "@/lib/audio-engine";
import {
  flagshipVideoUrl,
  loadVideoManifest,
  type FlagshipTopicId,
} from "@/lib/flagship-topics";
import { cn } from "@/lib/cn";

/**
 * 影院级短片舞台
 * ==============
 *
 * 双源无缝承托：
 *
 * 1. **自定义 MP4** —— 优先尝试播放 ``/videos/<topic-id>.mp4``。
 *    之后直接把 NotebookLM / 剪映 生成的视频丢进 ``web/public/videos/``
 *    即可自动接管，**不需要改任何代码**。
 * 2. **内置微光几何声画短片引擎** —— 视频不存在时无缝接管：
 *    纯 Canvas 2D 动画 + Web Audio API 实时合成音效。
 *
 * ⛔ **零外部依赖**。没有 CDN、没有 GeoGebra、没有音频文件。
 *    所以在全球任何网络下都是 0.1 秒开声，不会出现「加载不出来
 *    的白屏」。
 *
 * 视觉基调
 * --------
 *
 * 纯粹的影院暗黑底 ``#090C12``，暖金 ``#C59B38`` 与冷白微光。
 * 短片有播放 / 重播、进度条、逐年高亮数值、一键静音。
 */

/** 影院底色。 */
const STAGE_BG = "#090C12";
/** 暖金。 */
const GOLD = "#C59B38";
/** 暖红（衰减侧）。 */
const EMBER = "#C1553A";
/** 冷白微光。 */
const SHIMMER = "#E8EEF7";

/** 三个短片的时长（秒）。 */
const FILM_DURATION: Record<FlagshipTopicId, number> = {
  "exp-comfort": 18,
  "seq-zeno": 20,
  "prob-bayes": 18,
};

/** 舞台内的文案。 */
interface StageLabels {
  play: string;
  pause: string;
  replay: string;
  mute: string;
  unmute: string;
  year: (n: number) => string;
  standStill: string;
  stepOut: string;
  cutting: string;
  sum: (v: number) => string;
  cut: string;
  sick: string;
  healthy: string;
  positive: string;
  negative: string;
  gate: string;
  posterior: (v: number) => string;
  truePos: string;
  falsePos: string;
  builtIn: string;
  withVideo: string;
}

const ZH: StageLabels = {
  play: "播放",
  pause: "暂停",
  replay: "重播",
  mute: "静音",
  unmute: "取消静音",
  year: (n) => `第 ${n} 年`,
  standStill: "原地不动",
  stepOut: "每年向外一步",
  cutting: "对半切分",
  sum: (v) => `累加和 ${v.toFixed(4)}`,
  cut: "再切一刀",
  sick: "患病",
  healthy: "健康",
  positive: "阳性",
  negative: "阴性",
  gate: "99% 准确检测门",
  posterior: (v) => `阳性者中真正患病 ≈ ${(v * 100).toFixed(0)}%`,
  truePos: "真阳性",
  falsePos: "假阳性",
  builtIn: "内置微光短片引擎",
  withVideo: "自定义短片",
};

const EN: StageLabels = {
  play: "Play",
  pause: "Pause",
  replay: "Replay",
  mute: "Mute",
  unmute: "Unmute",
  year: (n) => `Year ${n}`,
  standStill: "Standing still",
  stepOut: "One step out each year",
  cutting: "Halving",
  sum: (v) => `Running sum ${v.toFixed(4)}`,
  cut: "Cut again",
  sick: "Sick",
  healthy: "Healthy",
  positive: "Positive",
  negative: "Negative",
  gate: "99%-accurate detection gate",
  posterior: (v) => `Positives that are truly sick ≈ ${(v * 100).toFixed(0)}%`,
  truePos: "True positive",
  falsePos: "False positive",
  builtIn: "Built-in light-film engine",
  withVideo: "Custom short film",
};

/** 线性插值。 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 夹紧。 */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 确定性伪随机——短片每次播放的粒子分布必须完全一致。 */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 圆角矩形路径。 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 舞台尺寸。 */
interface Size {
  w: number;
  h: number;
}

export interface CinemaStageProps {
  /** 专题 id——决定内置短片的内容。 */
  topicId: FlagshipTopicId;
  /** 英文界面？ */
  isEn: boolean;
  /** 短片第一次开始播放时回调（用于点亮「看过短片」）。 */
  onWatched?: () => void;
  /** 额外类名。 */
  className?: string;
}

export default function CinemaStage({
  topicId,
  isEn,
  onWatched,
  className,
}: CinemaStageProps) {
  const L = isEn ? EN : ZH;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);

  /** 视频可用？null = 还在探测。 */
  const [videoOk, setVideoOk] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  /** 短片已播放的秒数——用 ref 避免每帧触发 React 重渲染。 */
  const timeRef = useRef(0);
  /** 已经触发过音效的索引——保证每次切分只响一次。 */
  const firedRef = useRef<Set<number>>(new Set());
  const sizeRef = useRef<Size>({ w: 0, h: 0 });

  const duration = FILM_DURATION[topicId];
  const videoSrc = useMemo(() => flagshipVideoUrl(topicId), [topicId]);

  /* ── 尺寸：ResizeObserver + DPR ───────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const apply = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(240, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [videoOk]);

  /* ── 视频探测：加载失败就无缝切到内置短片引擎 ───────────────── */

  /**
   * ⛔ **先用 HEAD 探测，再决定要不要挂 src**。
   *
   *    之前是直接把 ``src`` 挂到 ``<video>`` 上——文件不存在时浏览器
   *    会在控制台抛一条 404 错误。功能上没坏（我们会回落到内置短片
   *    引擎），但**控制台里躺着一条红字**对一个「零故障」的平台来说
   *    很难看，而且同一个 URL 会请求两次。
   *
   *    现在改成：``fetch(url, { method: "HEAD" })`` 先探一次。成功才
   *    挂 ``src``，失败就压根不挂——控制台干干净净，一个多余的请求
   *    也没有。
   */
  useEffect(() => {
    setVideoOk(null);
    setPlaying(false);
    setProgress(0);
    setEnded(false);
    timeRef.current = 0;
    firedRef.current = new Set();

    let cancelled = false;

    loadVideoManifest()
      .then((ids) => {
        if (cancelled) return;
        /* 清单里没有这个专题 → 压根不请求视频，直接跑内置引擎。 */
        setVideoOk(ids.includes(topicId) ? true : false);
      })
      .catch(() => {
        if (!cancelled) setVideoOk(false);
      });

    return () => {
      cancelled = true;
    };
  }, [topicId]);

  /* ── 内置短片的渲染循环 ────────────────────────────────────── */

  const drawFilm = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) return;

      ctx.fillStyle = STAGE_BG;
      ctx.fillRect(0, 0, w, h);

      if (topicId === "exp-comfort") drawComfortFilm(ctx, w, h, t, L);
      else if (topicId === "seq-zeno") drawZenoFilm(ctx, w, h, t, L);
      else drawBayesFilm(ctx, w, h, t, L);
    },
    [topicId, L],
  );

  const loop = useCallback(() => {
    const dt = 1 / 60;
    timeRef.current += dt;
    if (timeRef.current >= duration) {
      timeRef.current = duration;
      setProgress(1);
      setPlaying(false);
      setEnded(true);
      fireAudioFor(topicId, duration, firedRef.current, L);
      drawFilm(timeRef.current);
      rafRef.current = null;
      return;
    }
    setProgress(timeRef.current / duration);
    fireAudioFor(topicId, timeRef.current, firedRef.current, L);
    drawFilm(timeRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [duration, drawFilm, topicId, L]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (playing && videoOk !== true) {
      stopLoop();
      rafRef.current = requestAnimationFrame(loop);
    }
    if (!playing) stopLoop();
    return stopLoop;
  }, [playing, videoOk, loop, stopLoop]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  /* ── 静帧：还没点播放时也把第一帧画出来 ─────────────────────
   *
   * ⛔ 否则画布是**全透明**的——用户看到的是一块纯黑空板，而不是
   *    「随时可以按下的第一帧」。海报感是从第一眼就要有的。
   */
  useEffect(() => {
    if (videoOk === true) return;
    const timer = window.setTimeout(() => {
      drawFilm(timeRef.current);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [drawFilm, videoOk]);

  /* ── 播放控制 ──────────────────────────────────────────────── */

  const play = useCallback(() => {
    setEnded(false);
    onWatched?.();
    if (videoOk === true) {
      const video = videoRef.current;
      if (video) {
        void video.play().catch(() => {
          setVideoOk(false);
          setPlaying(true);
        });
        setPlaying(true);
        return;
      }
    }
    if (timeRef.current >= duration) timeRef.current = 0;
    firedRef.current = new Set();
    setPlaying(true);
  }, [duration, videoOk, onWatched]);

  const pause = useCallback(() => {
    setPlaying(false);
    const video = videoRef.current;
    if (video && videoOk === true) video.pause();
  }, [videoOk]);

  const replay = useCallback(() => {
    onWatched?.();
    const video = videoRef.current;
    if (video && videoOk === true) {
      video.currentTime = 0;
      void video.play().catch(() => {});
      setEnded(false);
      setPlaying(true);
      return;
    }
    timeRef.current = 0;
    firedRef.current = new Set();
    setProgress(0);
    setEnded(false);
    setPlaying(true);
  }, [videoOk, onWatched]);

  const seek = useCallback(
    (ratio: number) => {
      const r = clamp(ratio, 0, 1);
      const video = videoRef.current;
      if (video && videoOk === true && Number.isFinite(video.duration)) {
        video.currentTime = r * video.duration;
        setProgress(r);
        return;
      }
      timeRef.current = r * duration;
      firedRef.current = new Set();
      setProgress(r);
      drawFilm(timeRef.current);
    },
    [duration, drawFilm, videoOk],
  );

  const toggleMute = useCallback(() => {
    const next = audioEngine.toggleMute();
    setMuted(next);
    const video = videoRef.current;
    if (video) video.muted = next;
  }, []);

  /* ── 视频进度同步 ──────────────────────────────────────────── */

  useEffect(() => {
    if (videoOk !== true) return;
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setProgress(video.currentTime / video.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setEnded(true);
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnd);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnd);
    };
  }, [videoOk]);

  const usingVideo = videoOk === true;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-xl bg-[#090C12]",
        className,
      )}
    >
      {/* 视频层——只有探测到视频真的存在时才挂 src */}
      <video
        ref={videoRef}
        src={videoOk === true ? videoSrc : undefined}
        playsInline
        muted={muted}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
          usingVideo ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => (playing ? pause() : play())}
      />

      {/* 内置短片画布 */}
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-500",
          videoOk === false ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => (playing ? pause() : play())}
      />

      {/* 顶部：来源标签 */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <span className="flex h-1.5 w-1.5 rounded-full bg-[#C59B38]" />
        <span className="text-[10px] font-medium tracking-[0.18em] text-white/45 uppercase">
          {usingVideo ? L.withVideo : L.builtIn}
        </span>
      </div>

      {/* 中央播放按钮 */}
      {!playing ? (
        <button
          type="button"
          onClick={ended ? replay : play}
          aria-label={ended ? L.replay : L.play}
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#C59B38] bg-[#0B162C] transition-colors hover:bg-[#152a4d]"
        >
          {ended ? (
            <RotateCcw size={24} strokeWidth={1.8} className="text-[#E8EEF7]" />
          ) : (
            <Play
              size={24}
              strokeWidth={1.8}
              className="ml-1 text-[#E8EEF7]"
            />
          )}
        </button>
      ) : null}

      {/* 底部控制条 */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-3">
        <button
          type="button"
          onClick={playing ? pause : replay}
          aria-label={playing ? L.pause : L.replay}
          className="shrink-0 text-white/80 transition-colors hover:text-white"
        >
          {playing ? (
            <Pause size={16} strokeWidth={2} />
          ) : (
            <RotateCcw size={16} strokeWidth={2} />
          )}
        </button>

        <div className="relative h-1 flex-1 cursor-pointer rounded-full bg-white/15">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#C59B38]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => seek(Number(e.target.value) / 1000)}
            aria-label={L.replay}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-white/45">
          {String(Math.floor(progress * duration)).padStart(2, "0")}s
        </span>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? L.unmute : L.mute}
          className="shrink-0 text-white/80 transition-colors hover:text-white"
        >
          {muted ? (
            <VolumeX size={16} strokeWidth={2} />
          ) : (
            <Volume2 size={16} strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}

/* ── 音效触发 ─────────────────────────────────────────────────── */

/**
 * 按时间轴触发音效。
 *
 * ⛔ **每个关键帧只响一次**——用 ``fired`` 集合记住已触发过的索引。
 *    否则 60fps 的循环会把同一声响 60 次。
 */
function fireAudioFor(
  topicId: FlagshipTopicId,
  time: number,
  fired: Set<number>,
  _L: StageLabels,
): void {
  if (audioEngine.muted) return;

  if (topicId === "exp-comfort") {
    const year = Math.floor(time / 2); // 每 2 秒一年
    if (year <= 8 && !fired.has(year)) {
      fired.add(year);
      audioEngine.tap(year, 9);
    }
    if (time >= 16 && !fired.has(999)) {
      fired.add(999);
      audioEngine.chord([261.63, 329.63, 392.0, 523.25], 0.18, 3.2);
    }
    return;
  }

  if (topicId === "seq-zeno") {
    const cut = Math.floor(time / 1.15);
    if (cut <= 14 && !fired.has(cut)) {
      fired.add(cut);
      audioEngine.slice(cut);
    }
    return;
  }

  if (topicId === "prob-bayes") {
    const bucket = Math.floor(time / 0.14);
    if (bucket <= 100 && !fired.has(bucket)) {
      fired.add(bucket);
      audioEngine.pulse(420 + bucket * 6, 0.08);
    }
  }
}

/* ── 专题 01 · 舒适区的几何学 ────────────────────────────────── */

/** 左环的年衰减率。 */
const R_LEFT = -0.2;
/** 右环的年增长率——第 8 年正好 1024%。 */
const R_RIGHT = 0.3376;

function drawComfortFilm(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  L: StageLabels,
): void {
  const years = 8;
  const yearF = clamp(t * years, 0, years);
  const leftV = Math.pow(1 + R_LEFT, yearF);
  const rightV = Math.pow(1 + R_RIGHT, yearF);

  const cx1 = w * 0.26;
  const cx2 = w * 0.74;
  const cy = h * 0.52;
  const base = Math.min(w * 0.13, h * 0.16);

  const year = Math.min(years, Math.floor(yearF) + 1);

  /* 年份标题 */
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(232,238,247,0.92)";
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.062)}px "Songti SC", Georgia, serif`;
  ctx.fillText(L.year(year), w / 2, h * 0.16);

  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.022)}px "PingFang SC", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232,238,247,0.4)";
  ctx.fillText(
    `${L.year(1)} → ${L.year(years)}`,
    w / 2,
    h * 0.16 + Math.min(w, h) * 0.04,
  );

  drawComfortRing(ctx, cx1, cy, base, leftV, EMBER, false);
  drawComfortRing(ctx, cx2, cy, base, rightV, GOLD, true);

  /* 两侧标签与数值 */
  ctx.font = `500 ${Math.round(Math.min(w, h) * 0.024)}px "PingFang SC", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232,238,247,0.55)";
  ctx.fillText(L.standStill, cx1, h * 0.84);
  ctx.fillText(L.stepOut, cx2, h * 0.84);

  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.04)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = "rgba(193,85,58,0.95)";
  ctx.fillText(`${(leftV * 100).toFixed(0)}%`, cx1, h * 0.9);
  ctx.fillStyle = "rgba(197,155,56,0.95)";
  ctx.fillText(`${(rightV * 100).toFixed(0)}%`, cx2, h * 0.9);
}

/** 画一侧的舒适区光环 + 剪影。 */
function drawComfortRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  base: number,
  value: number,
  color: string,
  growing: boolean,
): void {
  const radius = base * Math.pow(Math.max(value, 0.02), 0.34);
  const alpha = growing
    ? clamp(0.16 + value * 0.18, 0.16, 0.95)
    : clamp(0.14 + value * 0.7, 0.12, 0.85);

  /* 外发光 */
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius * 1.5);
  grad.addColorStop(0, hexAlpha(color, alpha * 0.55));
  grad.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  /* 主环 */
  ctx.strokeStyle = hexAlpha(color, alpha);
  ctx.lineWidth = Math.max(1.2, base * 0.055);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  /* 内侧微光圆 */
  ctx.strokeStyle = hexAlpha(color, alpha * 0.28);
  ctx.lineWidth = Math.max(0.6, base * 0.014);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  /* 剪影人物 */
  const s = base * 0.42;
  const stretch = growing
    ? clamp(0.72 + value * 0.26, 0.72, 1.45)
    : clamp(0.68 + value * 0.3, 0.7, 1.0);
  const curl = growing ? 0 : clamp((1 - value) * 0.42, 0, 0.42);

  ctx.save();
  ctx.translate(cx, cy + s * 0.42);
  ctx.scale(1, stretch);
  ctx.globalAlpha = 0.5 + alpha * 0.4;

  /* 头 */
  ctx.fillStyle = hexAlpha(color, 0.85);
  ctx.beginPath();
  ctx.arc(0, -s * 0.78, s * 0.2, 0, Math.PI * 2);
  ctx.fill();

  /* 身体 */
  ctx.beginPath();
  roundRect(ctx, -s * 0.17, -s * 0.55, s * 0.34, s * 0.86, s * 0.16);
  ctx.fill();

  /* 手臂——舒展时向外张开 */
  ctx.strokeStyle = hexAlpha(color, 0.8);
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (growing) {
    ctx.moveTo(-s * 0.16, -s * 0.4);
    ctx.lineTo(-s * 0.62, -s * 0.58);
    ctx.moveTo(s * 0.16, -s * 0.4);
    ctx.lineTo(s * 0.62, -s * 0.58);
  } else {
    ctx.moveTo(-s * 0.16, -s * 0.4);
    ctx.lineTo(-s * 0.3, -s * 0.12 + s * curl);
    ctx.moveTo(s * 0.16, -s * 0.4);
    ctx.lineTo(s * 0.3, -s * 0.12 + s * curl);
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ── 专题 02 · 一尺之棰 ──────────────────────────────────────── */

function drawZenoFilm(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  L: StageLabels,
): void {
  const maxCuts = 14;
  const side = Math.min(w * 0.42, h * 0.56);
  const x0 = (w - side) / 2;
  const y0 = (h - side) / 2 - h * 0.04;

  /* 外框光晕 */
  ctx.save();
  ctx.shadowColor = "rgba(197,155,56,0.45)";
  ctx.shadowBlur = 26;
  ctx.strokeStyle = "rgba(214,171,74,0.9)";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x0 - 10, y0 - 10, side + 20, side + 20);
  ctx.restore();

  /* 当前余块：被不断对半切分的那一块 */
  let rx = x0;
  let ry = y0;
  let rw = side;
  let rh = side;
  const cuts = Math.min(maxCuts, Math.floor(t * (maxCuts + 1)));
  const settled: Array<[number, number, number, number]> = [];

  for (let k = 0; k < cuts; k += 1) {
    if (rw >= rh) {
      const half = rw / 2;
      settled.push([rx, ry, half, rh]);
      rx += half;
      rw = half;
    } else {
      const half = rh / 2;
      settled.push([rx, ry, rw, half]);
      ry += half;
      rh = half;
    }
  }

  /* 已归位的碎片 */
  for (const [sx, sy, sw, sh] of settled) {
    const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    g.addColorStop(0, "rgba(197,155,56,0.30)");
    g.addColorStop(1, "rgba(197,155,56,0.10)");
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = "rgba(232,238,247,0.4)";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(sx, sy, sw, sh);
  }

  /* 当前余块——高亮描边 + 微光 */
  ctx.save();
  ctx.shadowColor = "rgba(232,238,247,0.6)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "rgba(232,238,247,0.85)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.restore();

  const q = 0.5;
  const sum = 1 - Math.pow(q, cuts + 1);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(232,238,247,0.9)";
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.05)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillText(L.sum(sum), w / 2, y0 - h * 0.1);

  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.024)}px "PingFang SC", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232,238,247,0.45)";
  ctx.fillText(L.cutting, w / 2, y0 + side + h * 0.1);
}

/* ── 专题 03 · 基础率谬误 ────────────────────────────────────── */

/** 短片里用的先验（10%）。 */
const FILM_PRIOR = 0.1;
/** 短片里用的灵敏度。 */
const FILM_SENS = 0.9;
/** 短片里用的误报率。 */
const FILM_FPR = 0.2;

function drawBayesFilm(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  L: StageLabels,
): void {
  const rand = makeRandom(20260118);
  const count = 100;
  const sick = Math.round(count * FILM_PRIOR);

  const leftX = w * 0.1;
  const gateX = w * 0.4;
  const rightX = w * 0.88;

  const tp = sick * FILM_SENS;
  const fp = (count - sick) * FILM_FPR;
  const fn = sick - tp;
  const tn = count - sick - fp;
  const positives = tp + fp;
  const posterior = positives > 0 ? tp / positives : 0;

  /* 四个分组的目标布局。 */
  const groups = [
    { n: tp, label: L.truePos, color: GOLD, y: h * 0.28 },
    { n: fp, label: L.falsePos, color: "#6B7A90", y: h * 0.48 },
    { n: fn, label: L.sick, color: EMBER, y: h * 0.68 },
    { n: tn, label: L.healthy, color: "#3E4A5C", y: h * 0.83 },
  ];

  /* 每个粒子：是否患病 + 检测结果 + 在分组内的固定槽位。 */
  const counters = [0, 0, 0, 0];
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const isSick = i < sick;
    const positive = isSick ? rand() < FILM_SENS : rand() < FILM_FPR;
    const groupIdx = positive ? (isSick ? 0 : 1) : isSick ? 2 : 3;
    const slotIdx = counters[groupIdx];
    counters[groupIdx] += 1;
    particles.push({
      isSick,
      positive,
      groupIdx,
      slotIdx,
      r1: rand(),
      r2: rand(),
    });
  }

  /* 目标槽位坐标。 */
  const perRow = groups.map((g) => Math.max(1, Math.ceil(g.n / 6)));
  const slotPos = particles.map((p) => {
    const g = groups[p.groupIdx];
    const row = Math.floor(p.slotIdx / perRow[p.groupIdx]);
    const col = p.slotIdx % perRow[p.groupIdx];
    const spanW = w * 0.2;
    return {
      x: rightX - (col + 0.5) * (spanW / perRow[p.groupIdx]),
      y: g.y + row * 13,
    };
  });

  /* 门 */
  const gateAlpha = clamp((t - 0.2) / 0.12, 0, 1) * clamp((1 - t) / 0.1, 0, 1);
  ctx.save();
  ctx.globalAlpha = gateAlpha;
  const gg = ctx.createLinearGradient(gateX - 24, 0, gateX + 24, 0);
  gg.addColorStop(0, "rgba(232,238,247,0)");
  gg.addColorStop(0.5, "rgba(232,238,247,0.22)");
  gg.addColorStop(1, "rgba(232,238,247,0)");
  ctx.fillStyle = gg;
  ctx.fillRect(gateX - 24, h * 0.14, 48, h * 0.72);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = `500 ${Math.round(Math.min(w, h) * 0.02)}px "PingFang SC", system-ui, sans-serif`;
  ctx.fillStyle = `rgba(232,238,247,${0.25 + gateAlpha * 0.4})`;
  ctx.fillText(L.gate, gateX, h * 0.11);

  /* 阶段进度 */
  const moveT = clamp((t - 0.24) / 0.44, 0, 1);
  const sortT = clamp((t - 0.66) / 0.3, 0, 1);
  const p1 = clamp(moveT * 2, 0, 1);
  const p2 = clamp(moveT * 2 - 1, 0, 1);

  particles.forEach((p, i) => {
    const startX = leftX + p.r2 * w * 0.14;
    const startY = h * 0.18 + p.r1 * h * 0.62;

    let x = startX;
    let y = startY;
    let color = p.isSick ? EMBER : "#3E4A5C";
    let radius = Math.min(w, h) * (p.isSick ? 0.011 : 0.008);

    if (moveT > 0) {
      const throughX = startX + (gateX - startX) * p1;
      if (p1 < 1) {
        x = throughX;
        y = startY;
      } else {
        const target = slotPos[i];
        x = lerp(throughX, target.x, p2);
        y = lerp(startY, target.y, p2);
        color = groups[p.groupIdx].color;
        radius =
          Math.min(w, h) * (p.groupIdx === 0 ? 0.012 : 0.008);
      }
    }

    if (sortT > 0 && moveT >= 1) {
      const target = slotPos[i];
      x = lerp(x, target.x, sortT);
      y = lerp(y, target.y, sortT);
    }

    ctx.globalAlpha = 0.72 + 0.28 * clamp(t * 3, 0, 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  /* 右侧分组标签 */
  ctx.textAlign = "left";
  ctx.font = `500 ${Math.round(Math.min(w, h) * 0.019)}px "PingFang SC", system-ui, sans-serif`;
  for (const g of groups) {
    ctx.fillStyle = hexAlpha(g.color, 0.9);
    ctx.fillText(`${g.label} ${Math.round(g.n)}`, rightX - w * 0.23, g.y - 8);
  }

  /* 结论 */
  const reveal = clamp((t - 0.76) / 0.18, 0, 1);
  if (reveal > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(232,238,247,${reveal * 0.95})`;
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.036)}px "Songti SC", Georgia, serif`;
    ctx.fillText(L.posterior(posterior), w / 2, h * 0.95);
    ctx.font = `400 ${Math.round(Math.min(w, h) * 0.02)}px "PingFang SC", system-ui, sans-serif`;
    ctx.fillStyle = `rgba(232,238,247,${reveal * 0.45})`;
    ctx.fillText(
      `${Math.round(positives)} ${L.positive} · ${sick} ${L.sick}`,
      w / 2,
      h * 0.99,
    );
  }
}

/* ── 颜色工具 ─────────────────────────────────────────────────── */

/** 把十六进制颜色转成带透明度的 rgba。 */
function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
