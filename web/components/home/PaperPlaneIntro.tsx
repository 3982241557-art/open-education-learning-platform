"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

/**
 * 纸飞机启动动效
 * ===============
 *
 * 为什么是「纸飞机」而不是「加载 spinner」
 * --------------------------------------
 *
 * 用户第一次打开这个站点时，什么都还没做——他只是**推开了门**。
 * 此刻任何弹窗、任何选择框、任何「请先选年级」，都是在他还没想好
 * 要什么的时候替他做决定。
 *
 * 所以这一版把开场做成了一件**只表达一件事**的事：一张纸飞机从纸面
 * 上滑过，然后化开成首页。它不索取任何信息，也不打断任何流程。
 *
 * ⛔ **绝对不可卡死**（这是本组件最重要的属性）
 * -----------------------------------------------
 *
 * 旧版有一个真实发生过的 Bug：动画回调在某些情况下不会触发
 * （比如标签页在后台被节流、``prefers-reduced-motion`` 命中、
 * framer-motion 的动画被中断），于是覆盖层**永远不消失**，用户只能
 * 手动点「跳过」才能进站。
 *
 * 现在用**双保险**根治：
 *
 * 1. **正常路径**——飞完（1.5s）→ 化开（0.35s）→ 卸载；
 * 2. **硬兜底**——一个**独立**的 ``setTimeout(..., 2100)``，它在
 *    挂载时就开始计时，**不依赖任何动画回调**。无论发生什么，2.1 秒
 *    内覆盖层 100% 消失并切入主页。
 *
 * 两条路径都调用同一个 ``finish()``，它是幂等的——重复调用无副作用。
 *
 * 动效规格
 * --------
 *
 * .. code-block:: text
 *
 *     画布     #F8F7F4（与首页同色——**无缝衔接，不闪白**）
 *     机身     #0B162C 线条（深午夜牛津蓝）
 *     折痕     #B89B5E（哑光香槟金）
 *     航迹     渐隐虚线，从机尾拖出
 *     缓动     cubic-bezier(0.16, 1, 0.3, 1) —— 由快到慢缓出
 *     飞行时长 1.5s　化开 0.35s
 */

/** sessionStorage 里的一次性标记。 */
const SEEN_KEY = "oe:paper-plane-intro-seen";

/** 飞行时长（毫秒）。 */
const FLIGHT_MS = 1500;

/** 化开时长（毫秒）。 */
const DISSOLVE_MS = 350;

/**
 * 硬兜底定时器时长（毫秒）。
 *
 * ⚠️ 这是**防卡死的最后一道防线**——它必须**独立于**动画系统。
 *    取 2100ms：略大于 飞行 + 化开（1850ms），留 250ms 余量给
 *    帧调度抖动，但又足够短，用户感知不到「等」。
 */
const HARD_TIMEOUT_MS = 2100;

/** 组件属性。 */
export interface PaperPlaneIntroProps {
  /** 动效结束后调用——通常用来切换「显示主页」。 */
  onDone?: () => void;
  /** 强制播放（忽略 sessionStorage 标记）。 */
  force?: boolean;
}

export default function PaperPlaneIntro({ onDone, force = false }: PaperPlaneIntroProps) {
  const [phase, setPhase] = useState<"flying" | "dissolving" | "gone">("flying");
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<number | null>(null);  const finishedRef = useRef(false);

  /**
   * 是否应该播放。
   *
   * ⚠️ 必须在**挂载后**再判——SSR 阶段没有 sessionStorage，
   *    首帧就隐藏会导致 hydration mismatch。
   */
  useEffect(() => {
    setMounted(true);
    if (force) {
      setPhase("flying");
      return;
    }
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) {
      setPhase("gone");
    }
  }, [force]);

  /**
   * 结束动效。
   *
   * **幂等**——两条兜底路径（正常回调 + 硬超时）都会调它，重复调用
   * 不产生副作用。
   */
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 隐私模式下写不进去——忽略，不影响本次会话 */
    }
    setPhase("gone");
    onDone?.();
  }, [onDone]);

  /**
   * 计时器：飞完 → 化开 → 消失。
   */
  useEffect(() => {
    if (phase !== "flying") return;
    const timer = window.setTimeout(() => {
      setPhase("dissolving");
    }, FLIGHT_MS);
    timerRef.current = timer;
    return () => window.clearTimeout(timer);
  }, [phase]);
  /** 化开后卸载。 */
  useEffect(() => {
    if (phase !== "dissolving") return;
    const timer = window.setTimeout(finish, DISSOLVE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finish]);

  /**
   * ⛔ **硬兜底定时器**——防卡死的核心。
   *
   * 它在挂载时**立即**启动，**完全不依赖** framer-motion 的任何
   * 回调、也不依赖上面的两个 effect 链。只要页面活着，2.1 秒后
   * 覆盖层一定消失。
   *
   * 它是**唯一**一个不依赖 ``phase`` 的 effect——所以即使 phase
   * 因为任何原因卡在 ``"flying"``，它依然会触发。
   */
  useEffect(() => {
    if (!mounted) return;
    const timer = window.setTimeout(finish, HARD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [mounted, finish]);

  /** 挂载前与已播放 → 什么都不渲染。 */
  if (!mounted || phase === "gone") return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#F8F7F4]"
      aria-hidden="true"
    >
      {/* 化开：整层放大 + 消隐，首页从纸面下长出来。 */}
      <motion.div
        className="absolute inset-0"
        animate={
          phase === "dissolving"
            ? { opacity: 0, scale: 1.06 }
            : { opacity: 1, scale: 1 }
        }
        transition={{ duration: DISSOLVE_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
      >
        <PlaneScene phase={phase} />
      </motion.div>

      {/* 跳过——极轻，不抢戏。 */}
      <button
        type="button"
        onClick={finish}
        className={cn(
          "absolute bottom-6 right-6 z-10 rounded-full px-3 py-1.5",
          "text-[12px] tracking-[0.08em] text-[#8a93a0]",
          "transition-colors hover:text-[#0f172a]",
        )}
      >
        跳过
      </button>
    </div>
  );
}

/**
 * 纸飞机场景。
 *
 * 单独拆出来，是因为它要在 ``flying`` 与 ``dissolving`` 两个阶段
 * 之间切换动效参数——外层负责整体化开，内层负责飞行。
 */
function PlaneScene({ phase }: { phase: "flying" | "dissolving" }) {
  return (
    <svg
      viewBox="0 0 1200 800"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* 航迹——渐隐虚线，从机尾拖出。 */}
      <motion.path
        d="M -60 700 C 220 690 520 640 760 520"
        fill="none"
        stroke="#B89B5E"
        strokeWidth="1.6"
        strokeDasharray="7 9"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={
          phase === "flying"
            ? { pathLength: 1, opacity: 0.55 }
            : { pathLength: 1, opacity: 0 }
        }
        transition={{
          pathLength: { duration: FLIGHT_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0.4 },
        }}
      />

      {/* 纸飞机本体。 */}
      <motion.g
        initial={{ x: -120, y: 660, rotate: -6, opacity: 0 }}
        animate={
          phase === "flying"
            ? { x: 0, y: 0, rotate: -12, opacity: 1 }
            : { x: 0, y: 0, rotate: -12, opacity: 0 }
        }
        transition={{
          x: { duration: FLIGHT_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          y: { duration: FLIGHT_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          rotate: { duration: FLIGHT_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          opacity: {
            duration: FLIGHT_MS / 1000,
            times: [0, 0.12, 0.86],
            ease: "easeOut",
          },
        }}
      >
        {/* 机翼主体——深午夜牛津蓝线条。 */}
        <path
          d="M 0 0 L 128 -30 L 62 4 L 128 34 Z"
          fill="none"
          stroke="#0B162C"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 中缝折痕——哑光香槟金。 */}
        <path
          d="M 0 0 L 62 4"
          fill="none"
          stroke="#B89B5E"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* 尾翼折线——同样用金，呼应折痕。 */}
        <path
          d="M 46 -12 L 62 4 L 46 18"
          fill="none"
          stroke="#B89B5E"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
      </motion.g>
    </svg>
  );
}
