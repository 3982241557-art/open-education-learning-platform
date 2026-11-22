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
 * 动效规格
 * --------
 *
 * .. code-block:: text
 *
 *     画布     #F8F7F4（与首页同色——**无缝衔接，不闪白**）
 *     机身     #0B162C 线条（深午夜牛津蓝）
 *     折痕     #B89B5E（哑光香槟金）
 *     航迹     渐隐虚线，从机尾拖出
 *     缓动     cubic-bezier(0.16, 1, 0.3, 1) —— 由快到慢
 *     时长     ~1.6s
 *
 * 关键细节
 * --------
 *
 * 1. **航迹先于机身出现**：拖尾不是机身画完才补的，而是跟着机头
 *    位置实时绘制的一段渐隐虚线——这才是「飞行」而不是「滑行」。
 * 2. **化开而不是淡出**：停稳的瞬间，画面与航迹一起**扩散消隐**
 *    （scale + opacity），首页从纸面下「长」出来。
 * 3. **每次会话只播一次**：用 ``sessionStorage`` 打标记。二次返回
 *    直接进首页——绝不拦路。
 * 4. **右下角 [跳过]**：极轻，不抢戏，但一定要有。动效永远不该
 *    剥夺用户的控制权。
 */

/** sessionStorage 里的一次性标记。 */
const SEEN_KEY = "oe:paper-plane-intro-seen";

/** 动效总时长（毫秒）。 */
const TOTAL_MS = 1600;

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** 结束动效。 */
  const finish = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 隐私模式下写不进去——忽略，不影响本次会话 */
    }
    setPhase("gone");
    onDone?.();
  }, [onDone]);

  /** 计时器：飞完 → 化开 → 消失。 */
  useEffect(() => {
    if (phase !== "flying") return;
    timerRef.current = setTimeout(() => {
      setPhase("dissolving");
      timerRef.current = setTimeout(finish, 520);
    }, TOTAL_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, finish]);

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
        transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
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
          pathLength: { duration: TOTAL_MS / 1000, ease: [0.16, 1, 0.3, 1] },
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
          x: { duration: TOTAL_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          y: { duration: TOTAL_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          rotate: { duration: TOTAL_MS / 1000, ease: [0.16, 1, 0.3, 1] },
          opacity: {
            duration: TOTAL_MS / 1000,
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
