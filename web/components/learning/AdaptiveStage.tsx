"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";

/**
 * 分龄动效原语
 * ============
 *
 * 小学部与初高中部共用**同一套逻辑**，但**视觉语言完全不同**：
 *
 * ==============  ==================================  ==================
 * 维度            小学部（1–6 年级）                初高中部（7–12）
 * ==============  ==================================  ==================
 * 造型            圆润（大圆角、Q 弹）              利落（小圆角、克制）
 * 按压反馈        弹性缩放 + 轻微旋转               轻微缩放
 * 答对            小星跳跃 + 彩星散落               银白粒子绽放
 * 答错            轻晃鼓励（左右摇摆）             极短的边框变化
 * 节点点亮        逐颗点亮的趣味路径               顺序点亮的进度线
 * ==============  ==================================  ==================
 *
 * 为什么不做成两套组件
 * --------------------
 *
 * 两套组件意味着两倍的维护成本，而且**分龄差异会逐渐漂移**。
 * 这里用**一个组件 + 一个 ``playful`` 开关**——差异集中在少数
 * 几个样式分支里，不可能漂移。
 */

/** 小学部的动效风格。 */
export interface PlayfulStyle {
  /** 大圆角。 */
  radius: string;
  /** 答对时的庆祝色。 */
  successColor: string;
  /** 粒子密度。 */
  particleCount: number;
  /** 是否显示伴学小星。 */
  showMascot: boolean;
}

/** 小学部的风格。 */
export const PLAYFUL_STYLE: PlayfulStyle = {
  radius: "rounded-2xl",
  successColor: "#f59e0b",
  particleCount: 12,
  showMascot: true,
};

/** 初高中的风格。 */
export const ACADEMIC_STYLE: PlayfulStyle = {
  radius: "rounded-lg",
  successColor: "#1d4ed8",
  particleCount: 7,
  showMascot: false,
};

/**
 * 按学段取风格。
 *
 * @param playful 是不是小学部
 */
export function styleOf(playful: boolean): PlayfulStyle {
  return playful ? PLAYFUL_STYLE : ACADEMIC_STYLE;
}

/**
 * 答对时的庆祝动画层。
 *
 * 小学部是**彩星跳跃**——小星星从按钮上蹦起来；初高中是**银白
 * 粒子绽放**——克制的细粒从中心散开。
 */
export function SuccessBurst({
  playful,
  active,
}: {
  playful: boolean;
  active: boolean;
}) {
  const particles = useMemo(() => {
    const count = styleOf(playful).particleCount;
    return Array.from({ length: count }, (_, index) => {
      const angle = (index * 137.508) % 360;
      const radius = playful ? 34 + ((index * 17) % 46) : 26 + ((index * 13) % 34);
      const radians = (angle * Math.PI) / 180;
      return {
        x: `${Math.cos(radians) * radius}px`,
        y: `${Math.sin(radians) * radius}px`,
        delay: `${(index % 5) * 70}ms`,
        duration: `${(playful ? 760 : 620) + (index % 4) * 90}ms`,
        size: playful ? 4 + (index % 3) * 2 : 2 + (index % 2),
        // 小学部是彩星（琥珀 / 天蓝 / 玫红），初高中是深蓝银白。
        color: playful
          ? ["#f59e0b", "#38bdf8", "#fb7185", "#a78bfa"][index % 4]
          : ["#1d4ed8", "#e2e8f0", "#93c5fd"][index % 3],
        star: playful && index % 3 === 0,
      };
    });
  }, [playful]);

  if (!active) return null;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
    >
      {particles.map((particle, index) => (
        <span
          key={index}
          className={cn(
            "absolute left-1/2 top-1/2",
            particle.star ? "text-[#f59e0b]" : "rounded-full",
          )}
          style={
            {
              width: particle.star ? undefined : particle.size,
              height: particle.star ? undefined : particle.size,
              background: particle.star ? undefined : particle.color,
              fontSize: particle.star ? 14 : undefined,
              lineHeight: particle.star ? 1 : undefined,
              marginLeft: particle.star ? -7 : -particle.size / 2,
              marginTop: particle.star ? -7 : -particle.size / 2,
              "--burst-x": particle.x,
              "--burst-y": particle.y,
              animation: `seek-burst ${particle.duration} cubic-bezier(0.16,1,0.3,1) ${particle.delay} forwards`,
            } as React.CSSProperties
          }
        >
          {particle.star ? "★" : null}
        </span>
      ))}
    </span>
  );
}

/**
 * 伴学小星 / 小芽——小学部的答对反馈角色。
 *
 * 纯代码绘制的 SVG——不引入任何图片素材，保证秒开。
 */
export function StudyBuddy({
  mood,
  playful,
}: {
  /** 表情。 */
  mood: "happy" | "thinking" | "cheer";
  playful: boolean;
}) {
  if (!playful) return null;

  return (
    <svg
      viewBox="0 0 48 48"
      className="h-9 w-9 shrink-0"
      role="img"
      aria-label={
        mood === "cheer" ? "小星在欢呼" : mood === "happy" ? "小星在微笑" : "小星在思考"
      }
    >
      {/* 身体——一颗圆润的星星。 */}
      <path
        d="M24 4l5.2 10.6 11.7 1.7-8.5 8.2 2 11.6L24 30.8 13.6 36.1l2-11.6-8.5-8.2 11.7-1.7L24 4z"
        fill="#fef3c7"
        stroke="#f59e0b"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* 眼睛。 */}
      {mood === "thinking" ? (
        <>
          <circle cx="19.5" cy="22" r="1.6" fill="#92400e" />
          <circle cx="28.5" cy="22" r="1.6" fill="#92400e" />
          <path
            d="M21 28.5q3 1.6 6 0"
            stroke="#92400e"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="19.5" cy="22" r="1.7" fill="#92400e" />
          <circle cx="28.5" cy="22" r="1.7" fill="#92400e" />
          <path
            d="M19.5 26.5q4.5 4.5 9 0"
            stroke="#92400e"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
      {/* 腮红——小学部的可爱标记。 */}
      <ellipse cx="15.5" cy="25.5" rx="2.4" ry="1.6" fill="#fda4af" opacity="0.75" />
      <ellipse cx="32.5" cy="25.5" rx="2.4" ry="1.6" fill="#fda4af" opacity="0.75" />
      {/* 欢呼时的举起的小手。 */}
      {mood === "cheer" ? (
        <>
          <path
            d="M9 20l-4-5"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M39 20l4-5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

/**
 * 节点逐颗点亮的趣味路径。
 *
 * 小学部：一条**弯曲的**虚线路径 + 每颗节点依次弹起。
 * 初高中：一条**直线**进度线 + 顺序填充。
 */
export function NodePath({
  total,
  lit,
  playful,
}: {
  /** 总节点数。 */
  total: number;
  /** 已点亮的数量。 */
  lit: number;
  playful: boolean;
}) {
  if (total <= 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => {
        const on = index < lit;
        return (
          <span
            key={index}
            className={cn(
              "inline-block shrink-0 transition-all duration-300",
              playful
                ? "h-2.5 w-2.5 rounded-full"
                : "h-1.5 w-5 rounded-sm",
              on
                ? playful
                  ? "scale-110 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.55)]"
                  : "bg-[var(--primary)]"
                : playful
                  ? "bg-slate-200"
                  : "bg-slate-200",
            )}
            style={
              on && playful
                ? { animation: `seek-node-pop 420ms cubic-bezier(0.34,1.56,0.64,1) ${index * 60}ms both` }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

/**
 * 答错时的「轻晃鼓励」。
 *
 * 小学部：左右轻晃 + 一点上弹——「没关系，再想想」。
 * 初高中：只有一次极短的边框变色——不幼稚。
 */
export function WrongShake({ playful }: { playful: boolean }) {
  if (!playful) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 animate-[seek-shake_460ms_ease-in-out]"
    />
  );
}
