"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Bilibili 伴随式计时器
 * =====================
 *
 * B 站的跨域 ``<iframe>`` 不暴露播放进度——宿主页面拿不到
 * ``currentTime``，也听不到 ``timeupdate``。但「重点导读气泡必须
 * 在正确的时刻弹出」这件事不能因此放弃。
 *
 * 破局思路
 * --------
 *
 * B 站有一个别的平台没有的**外部可控**通道：``<iframe>`` 的 ``src``
 * 里的 ``t=`` 参数。我们已经用它实现了「点击时间戳精准跳转」
 * （见 :func:`buildBilibiliEmbedUrl`）。
 *
 * 那么反过来推：
 *
 * 1. 用户点某个时间戳 → 我们把 ``t=200`` 写进 iframe 的 ``src``；
 * 2. **我们自己**记下「现在应该播到 200 秒了」；
 * 3. 启动一个本地计时器，从 200 秒开始走表；
 * 4. 计时器跨过某个 ``interactive_nodes`` 的时间戳 → 弹出该节点的
 *    重点提示卡片。
 *
 * 也就是说：**我们不读播放器的进度，我们维护一份自己的进度影子**。
 *
 * 这个影子准确吗
 * --------------
 *
 * 基本上准确，有三个前提：
 *
 * - **计时器只在用户「开始观看」后才走**。用户还没点播放，影子停在
 *   原处；
 * - **用户每次跳转都会重置影子**。跳到 200 秒，影子就跳到 200 秒——
 *   这与播放器实际行为一致（``t=200`` 就是从 200 秒起播）；
 * - **暂停时影子也停**。用户点 B 站自己的暂停键，宿主页面听不到，
 *   所以这里提供【⏸ 同步计时 / ▶ 继续】微调钮让用户手动同步——
 *   这正是需求里说的「极简微调钮」。
 *
 * 漂移
 * ----
 *
 * 计时器是 ``setInterval`` 驱动的，浏览器标签页在后台时会被节流，
 * 走时会慢一点点。所以我们**不用累加**，而是用「上次时间戳 + 经过的
 * 真实时长」计算——标签页切回来时会自动校正。
 */
export interface CompanionTimerState {
  /** 影子进度（秒）。 */
  time: number;
  /** 是否在走表。 */
  running: boolean;
  /** 从某个秒数开始走表（跳转 / 开始观看）。 */
  start: (seconds?: number) => void;
  /** 暂停走表。 */
  pause: () => void;
  /** 继续走表。 */
  resume: () => void;
  /** 走表 / 停表切换。 */
  toggle: () => void;
  /** 校正到指定秒数（用户手动微调）。 */
  seek: (seconds: number) => void;
  /** 走表到头了没有。 */
  finished: boolean;
}

/**
 * 创建伴随式计时器。
 *
 * @param duration 视频总时长（秒）。``0`` 或未��� = 未知，不封顶。
 */
export function useCompanionTimer(duration: number): CompanionTimerState {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);

  /**
   * 计时器的「基准点」。
   *
   * - ``baseTime`` —— 基准时刻对应的影子进度（秒）；
   * - ``baseStamp`` —— 基准时刻（``performance.now()``）。
   *
   * 每次走表都从这两个值**重新算**出当前进度，而不是 ``+1`` 累加。
   * 这样标签页被浏览器节流后切回来，进度会自动校正回来。
   */
  const baseTimeRef = useRef(0);
  const baseStampRef = useRef(0);

  /** 写入新的基准点。 */
  const rebase = useCallback((seconds: number) => {
    baseTimeRef.current = seconds;
    baseStampRef.current = performance.now();
    setTime(seconds);
  }, []);

  /** 从某个秒数开始走表。 */
  const start = useCallback(
    (seconds?: number) => {
      const from = typeof seconds === "number" ? seconds : baseTimeRef.current;
      rebase(from);
      setRunning(true);
    },
    [rebase],
  );

  /** 暂停。 */
  const pause = useCallback(() => {
    // 暂停时先把当前进度固化下来——否则恢复时会跳一段。
    const current =
      baseTimeRef.current +
      (performance.now() - baseStampRef.current) / 1000;
    baseTimeRef.current = current;
    setTime(current);
    setRunning(false);
  }, []);

  /** 继续。 */
  const resume = useCallback(() => {
    baseStampRef.current = performance.now();
    setRunning(true);
  }, []);

  /** 走表 / 停表切换。 */
  const toggle = useCallback(() => {
    setRunning((prev) => {
      if (prev) {
        const current =
          baseTimeRef.current +
          (performance.now() - baseStampRef.current) / 1000;
        baseTimeRef.current = current;
        setTime(current);
      } else {
        baseStampRef.current = performance.now();
      }
      return !prev;
    });
  }, []);

  /** 手动校正到指定秒数。 */
  const seek = useCallback(
    (seconds: number) => {
      rebase(Math.max(0, seconds));
    },
    [rebase],
  );

  /** 走表的心跳。 */
  useEffect(() => {
    if (!running) return;
    const handle = window.setInterval(() => {
      const current =
        baseTimeRef.current +
        (performance.now() - baseStampRef.current) / 1000;
      setTime(current);
    }, 250);
    return () => window.clearInterval(handle);
  }, [running]);

  /** 到达片尾就自动停。 */
  useEffect(() => {
    if (!running) return;
    if (!duration || duration <= 0) return;
    if (time >= duration) {
      baseTimeRef.current = duration;
      setTime(duration);
      setRunning(false);
    }
  }, [time, duration, running]);

  return {
    time,
    running,
    start,
    pause,
    resume,
    toggle,
    seek,
    finished: duration > 0 && time >= duration,
  };
}

/**
 * 从一段文本里抠出时间锚点（``03:20`` / ``1:02:03``）。
 *
 * AI 助教的回答里经常写着「在 03:20 处……」——用户点它就该跳到
 * 那一秒。
 *
 * 返回 ``null`` 表示这段文本里没有时间锚点。
 */
export function extractTimeAnchor(text: string): number | null {
  const match = text.match(/(?:^|[^\d])(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?![\d:])/);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (!Number.isFinite(seconds) || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}
