"use client";

import { useProfile, type PresetAvatar } from "@/context/ProfileContext";
import { cn } from "@/lib/cn";

/**
 * 头像
 * ====
 *
 * 两种来源：**预设**（纯 CSS/SVG 渲染）与**自定义**（用户上传或填 URL）。
 *
 * 为什么预设头像用 CSS 而不是图片
 * ------------------------------
 *
 * 八个预设头像如果做成 PNG，就要八个文件 + 一套深浅色适配。用 CSS
 * 渐变 + 一个 SVG 图案就能渲染出八个**完全清晰、任意尺寸都不糊**
 * 的头像，而且改配色只是改两个色值。
 *
 * 图案为什么是「同心弧」
 * --------------------
 *
 * 一个同心弧 = 字母 D + 半个圆环，深蓝渐变。极简、抽象、有辨识度，
 * 但**不指向任何特定的人物或文化符号**——对全球用户都中性。
 */
export function UserAvatar({
  size = 32,
  className = "",
}: {
  /** 直径（px）。 */
  size?: number;
  className?: string;
}) {
  const { profile, meta } = useProfile();
  const preset: PresetAvatar | undefined = meta.avatars.find(
    (item) => item.id === profile.avatar_id,
  );

  // 自定义头像优先。
  if (profile.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt={profile.nickname || "个人头像"}
        className={cn(
          "shrink-0 rounded-full object-cover",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  const [from, to] = preset?.colors ?? ["#1d4ed8", "#0f172a"];

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {/* 同心弧图案 */}
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 h-full w-full"
        fill="none"
      >
        <circle
          cx="20"
          cy="20"
          r="13"
          stroke="rgba(255,255,255,0.42)"
          strokeWidth="1.6"
        />
        <path
          d="M20 7 A13 13 0 0 1 20 33"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M20 12 A8 8 0 0 1 20 28"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
