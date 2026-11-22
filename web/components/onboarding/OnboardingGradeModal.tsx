"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, GraduationCap, Sparkles } from "lucide-react";
import {
  GRADE_OPTIONS,
  STAGE_LABELS,
  useGrade,
} from "@/context/GradeContext";
import { LOCALES, useLocale, type Locale } from "@/context/LocaleContext";
import { cn } from "@/lib/cn";

/**
 * 首次进入 · 年级与年龄选择引导
 * ================================
 *
 * 新用户第一次进站时弹一次，让他**一步**选好：
 *
 * 1. **语言**（简 / 繁 / EN）；
 * 2. **学段与年级**（明确标注年龄，如「二年级 · 7–8岁」）。
 *
 * 选完立刻存进个人档案 + localStorage，之后：
 *
 * - 课程大厅**直接聚焦**这个年级的语文与数学；
 * - 左上角头像卡下方显示「学习者 · 二年级 (7–8岁)」；
 * - 诊断卡的难度、AI 助教的深浅都跟着这个走。
 *
 * 为什么在**弹窗**里选，而不是让用户去「设置」里改
 * -----------------------------------------------
 *
 * 因为第一次访问的人**不知道这个站是干什么的**。让他先逛一圈再
 * 问「你几年级」，很可能他还没逛就走了。
 *
 * 一上来就给一个**清爽的两步选择**，他能立刻看到「这里有我年级
 * 的课」——这才是留人的关键。
 */

/** 入场动效的常量——避免在 JSX 属性里写对象字面量。 */
const ENTER_FROM = { opacity: 0, y: 24, scale: 0.97 };
const ENTER_TO = { opacity: 1, y: 0, scale: 1 };
const ENTER_TRANSITION = {
  duration: 0.42,
  cubicBezier: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** 组件属性。 */
export interface OnboardingGradeModalProps {
  /** 是否强制打开（用于测试 / 手动触发）。 */
  forceOpen?: boolean;
}

export function OnboardingGradeModal({ forceOpen = false }: OnboardingGradeModalProps) {
  const { locale, setLocale } = useLocale();
  const { grade, setGrade, onboarded, markOnboarded } = useGrade();

  /** 当前步——0 = 语言，1 = 年级。 */
  const [step, setStep] = useState(0);
  /** 引导是否打开。 */
  const [open, setOpen] = useState(false);

  /**
   * 首次进入时的判断。
   *
   * ⚠️ 必须等**挂载后**再判——SSR 阶段没有 localStorage，
   *    首帧就弹会跟服务端的渲染打架（hydration mismatch）。
   */
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    if (!onboarded || grade === 0) {
      setOpen(true);
    }
  }, [forceOpen, onboarded, grade]);

  /** 关闭。 */
  const close = useCallback(() => {
    setOpen(false);
    markOnboarded();
  }, [markOnboarded]);

  /** 选语言 → 进入第二步。 */
  const pickLocale = useCallback(
    (next: Locale) => {
      setLocale(next);
      setStep(1);
    },
    [setLocale],
  );

  /** 选年级 → 完成。 */
  const pickGrade = useCallback(
    (next: number) => {
      setGrade(next);
      markOnboarded();
      setOpen(false);
    },
    [setGrade, markOnboarded],
  );

  /** 按学段分组。 */
  const stages = useMemo(() => {
    return (["primary", "junior", "senior"] as const).map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      options: GRADE_OPTIONS.filter((item) => item.stage === stage),
    }));
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="选择年级"
    >
      <motion.div
        initial={ENTER_FROM}
        animate={ENTER_TO}
        transition={ENTER_TRANSITION}
        className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/70 bg-white/92 backdrop-blur-xl shadow-[0_28px_80px_-16px_rgba(15,23,42,0.45)]"
      >
        {/* 顶部高光。 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/85 via-white/20 to-transparent"
        />

        <div className="relative p-6 sm:p-7">
          {/* ── 头部 ── */}
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
              <GraduationCap size={18} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles
                  size={12}
                  strokeWidth={2.2}
                  className="shrink-0 text-blue-700"
                />
                <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-blue-800/70">
                  {step === 0 ? "Step 1 / 2" : "Step 2 / 2"}
                </span>
              </div>
              <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
                {step === 0 ? "欢迎来到 OE 梦想课堂" : "你现在几年级？"}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                {step === 0
                  ? "选好语言与年级，我们立刻为你准备对应的语文与数学同步课。"
                  : "选定后，课程大厅会直接聚焦你年级的课程。"}
              </p>
            </div>
          </div>

          {/* ── 内容 ── */}
          {step === 0 ? (
            <div className="space-y-2">
              {LOCALES.map((item) => {
                const active = locale === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickLocale(item.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 border px-4 py-3 text-left transition-all",
                      "rounded-xl",
                      active
                        ? "border-blue-700/45 bg-blue-600/[0.09]"
                        : "border-slate-200 bg-white hover:border-blue-700 hover:bg-blue-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        active
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-slate-400/60",
                      )}
                    >
                      {active ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-slate-900">
                        {item.nativeLabel}
                      </span>
                      <span className="block text-[11.5px] text-slate-500">
                        {item.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {stages.map((group) => (
                <div key={group.stage}>
                  <p className="mb-1.5 text-[11px] font-medium tracking-[0.06em] text-slate-500">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((item) => {
                      const active = grade === item.number;
                      return (
                        <button
                          key={item.number}
                          type="button"
                          onClick={() => pickGrade(item.number)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-xl border px-3 py-1.5 text-left transition-all",
                            active
                              ? "border-blue-700 bg-blue-700 text-white"
                              : "border-slate-200 bg-white hover:border-blue-700 hover:bg-blue-50",
                          )}
                        >
                          <span className="block text-[13px] font-medium">
                            {item.name}
                          </span>
                          <span
                            className={cn(
                              "block text-[10.5px]",
                              active ? "text-white/75" : "text-slate-500",
                            )}
                          >
                            {item.ageRange[0]}–{item.ageRange[1]} 岁
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 底部 ── */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-900/[0.08] pt-4">
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(0)}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-500 transition-colors hover:text-slate-800"
              >
                返回
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-3 py-1.5 text-[12.5px] text-slate-500 transition-colors hover:text-slate-800"
            >
              稍后再说
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
