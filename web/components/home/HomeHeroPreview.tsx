"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Award, Check, Play, Sparkles } from "lucide-react";

/**
 * 首页 Hero · 产品实景预览
 * ============================
 *
 * **不是一张占位图**——它是**纯前端画出来的真实产品缩影**。
 *
 * 为什么必须画而不是放图
 * --------------------
 *
 * 旧版右侧是一块「加载失败就显示灰块」的占位图。对第一次打开这个
 * 站的人，那块灰块传达的信息是「这里什么都没有」——而这恰恰是
 * 最需要展示的地方。
 *
 * 现在这一层由三个**真实存在的产品部件**叠成：
 *
 * 1. **底层 · K12 互动学习台**——视频框 + 知识节点条 + 互动画布；
 * 2. **右上 · 修习证书缩略卡**——哑光香槟金边线的真实证书样式；
 * 3. **左下 · 掌握度胶囊**——带微动效的进度指示。
 *
 * 三个部件都是**平台里真实存在**的形态（证书见 ``CertificateModal``，
 * 互动画布见 ``K12InteractiveLab``），所以它们不是装饰，是**承诺**。
 */

/** 掌握度胶囊的动画节奏。 */
const CAPSULE_TICKS = [0, 1, 2, 3, 4];

/**
 * Hero 预览卡片。
 */
export function HomeHeroPreview() {
  /** 证书上的「落笔」动画——挂载后逐字盖章。 */
  const [sealed, setSealed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSealed(true), 520);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      {/* ── 底层 · K12 互动学习台 ──
       *
       * 深午夜牛津蓝的「机器外壳」——内容区是象牙白，这块深色板
       * 在视觉上先把产品界面**框住**，让整个 Hero 有了重量。
       */}
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b162c] p-3 shadow-[0_36px_90px_-32px_rgba(11,22,44,0.55)]"
      >
        {/* 顶栏——课程标题 + 学段铭牌。 */}
        <div className="mb-2.5 flex items-center gap-2 px-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#1d4ed8] text-white">
            <Sparkles size={10} strokeWidth={2.4} />
          </span>
          <span className="truncate text-[11px] font-medium text-white/90">
            七年级 · 语文 · 第 5 讲
          </span>
          <span className="ml-auto shrink-0 rounded-full border border-[rgba(184,155,94,0.45)] px-2 py-0.5 text-[9.5px] font-medium text-[#d8c49a]">
            部编版 · 同步
          </span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[1.15fr_1fr]">
          {/* 视频框。 */}
          <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-[#122344]">
            {/* 极淡网格——给深色块一点「技术图纸」的质感。 */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.16]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/12 text-white backdrop-blur-sm"
              >
                <Play size={15} strokeWidth={2.2} className="ml-0.5" />
              </motion.span>
            </div>
            {/* 底部字幕条。 */}
            <div className="absolute inset-x-0 bottom-0 bg-[#0B162C] px-2 py-1.5">
              <p className="truncate text-[9.5px] text-white/80">
                秋天的怀念——作者在字里行间藏了什么？
              </p>
            </div>
          </div>

          {/* 互动画布 + 知识节点。 */}
          <div className="space-y-2">
            <div className="rounded-lg border border-white/10 bg-[#122344] p-2">
              <p className="mb-1.5 text-[9.5px] font-medium tracking-[0.1em] text-[#d8c49a] uppercase">
                学科互动实验室
              </p>
              {/* 意象高亮条——语文的名篇精读台。 */}
              <div className="space-y-1">
                {["菊花", "母亲", "北海"].map((word, index) => (
                  <motion.div
                    key={word}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.5 + index * 0.12,
                      duration: 0.45,
                    }}
                    className="flex items-center gap-1.5 rounded border border-white/10 bg-[#0B162C] px-1.5 py-1"
                  >
                    <span className="text-[10.5px] font-medium text-white/90">
                      {word}
                    </span>
                    <span className="ml-auto h-1 flex-1 overflow-hidden rounded-full bg-[#1E3A8A]">
                      <motion.span
                        initial={{ width: 0 }}
                        animate={{ width: `${[88, 72, 54][index]}%` }}
                        transition={{
                          delay: 0.75 + index * 0.12,
                          duration: 0.7,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="block h-full rounded-full bg-[#1d4ed8]"
                      />
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#122344] p-2">
              <p className="mb-1.5 text-[9.5px] font-medium tracking-[0.1em] text-white/50 uppercase">
                知识节点
              </p>
              <div className="flex flex-wrap gap-1">
                {["双关", "对比", "欲扬先抑"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-[rgba(184,155,94,0.28)] px-1.5 py-0.5 text-[9.5px] text-[#d8c49a]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── 右上 · 修习证书缩略卡 ──
       *
       * 哑光香槟金边线 + 纸质底。它是**平台真实产物**的缩影——
       * 用户在这里第一次看到「学完会得到什么」。
       */}
      <motion.div
        initial={{ opacity: 0, y: -16, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: -2.4 }}
        transition={{ delay: 0.28, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -right-2 -top-7 w-[172px] rounded-lg border border-[rgba(184,155,94,0.55)] bg-[#fffefa] p-2.5 shadow-[0_18px_40px_-16px_rgba(11,22,44,0.42)] sm:-right-5 sm:w-[196px]"
      >
        {/* 内框——证书的双线边。 */}
        <div className="rounded border border-[rgba(184,155,94,0.35)] px-2.5 py-2.5 text-center">
          <Award
            size={15}
            strokeWidth={1.6}
            className="mx-auto text-[#b89b5e]"
          />
          <p className="oe-display mt-1 text-[10.5px] leading-tight text-[#0b162c]">
            OE × 梦想课堂
            <br />
            K12 修习证书
          </p>
          <div className="my-1.5 h-px w-full bg-[rgba(184,155,94,0.35)]" />
          <p className="text-[8.5px] text-[#55606e]">七年级 · 语文</p>
          <p className="text-[8.5px] text-[#55606e]">统编版 · 24 课时达标</p>
          {/* 落款——盖章动画。 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={
              sealed
                ? { opacity: 1, scale: 1, rotate: -12 }
                : { opacity: 0, scale: 0.6 }
            }
            transition={{ delay: 0.9, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-1.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#b89b5e] text-[#b89b5e]"
          >
            <span className="text-[7.5px] leading-[1.1] font-semibold tracking-tight">
              梦想
              <br />
              课堂
            </span>
          </motion.div>
        </div>
      </motion.div>

      {/* ── 左下 · 掌握度胶囊 ──
       *
       * 悬浮在预览卡的左下角。它有**真实的微动效**：数字从 0
       * 跳到 92，底条跟着长满。
       */}
      <motion.div
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.62, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -bottom-6 -left-2 flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-white px-3 py-2 shadow-[0_14px_34px_-14px_rgba(11,22,44,0.35)] sm:-left-5"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#eff6ff] text-[#1d4ed8]">
          <Check size={12} strokeWidth={3} />
        </span>
        <span className="min-w-0">
          <span className="block text-[9.5px] leading-tight text-[#55606e]">
            本节掌握度
          </span>
          <span className="flex items-baseline gap-1">
            <motion.strong
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
              className="text-[15px] leading-none font-semibold tabular-nums text-[#0f172a]"
            >
              92
            </motion.strong>
            <span className="text-[10px] text-[#55606e]">%</span>
          </span>
        </span>
        {/* 进度点——逐颗点亮。 */}
        <span className="ml-0.5 flex items-center gap-1">
          {CAPSULE_TICKS.map((index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0.25 }}
              animate={{ opacity: index < 4 ? 1 : 0.25 }}
              transition={{ delay: 1 + index * 0.09, duration: 0.3 }}
              className="h-1.5 w-1.5 rounded-full bg-[#1d4ed8]"
            />
          ))}
        </span>
      </motion.div>
    </div>
  );
}
