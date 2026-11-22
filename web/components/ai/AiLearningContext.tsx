"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Check, Target } from "lucide-react";
import {
  LAB_CONTEXT_EVENT,
  type LabContextDetail,
} from "@/lib/lab-context";
import { cn } from "@/lib/cn";

/**
 * AI 伴学 · 实时学习上下文
 * ==========================
 *
 * 右侧栏顶部的一小块面板，显示「**此刻**用户在学习区做了什么」。
 *
 * 为什么必须有它
 * --------------
 *
 * 「AI 伴学」最容易滑向的形态是**一个空壳聊天框**——它在那里，但不
 * 知道用户在干什么。用户问「这个角怎么算」，AI 只能从课程标题猜。
 *
 * 这块面板让 AI 有了**真实的上下文**：
 *
 * - 「已完成 6/8 个本课生字描红」
 * - 「已用量角器完成角度验证」
 * - 「正在探索：二次函数抛物线」
 *
 * 这些是**行为级**信号——比视频计时精细得多，也比「你已观看 80%」
 * 有信息量得多。
 *
 * 视觉
 * ----
 *
 * **100% 实心纯白**（``bg-white``）+ 1px 边框。绝不使用半透明玻璃
 * 底——右栏叠在暖白画布上，半透明会让文字发灰。
 */
export default function AiLearningContext() {
  const [context, setContext] = useState<LabContextDetail | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LabContextDetail>).detail;
      if (detail) setContext(detail);
    };
    window.addEventListener(LAB_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(LAB_CONTEXT_EVENT, handler);
  }, []);

  if (!context) return null;

  const percent =
    context.total > 0
      ? Math.round((context.done / context.total) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="shrink-0 rounded-xl border border-[#CBD5E1] bg-white p-3.5"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0B162C] text-white">
          <Activity size={12} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-semibold text-[#0F172A]">
            当前学习上下文
          </p>
          <p className="truncate text-[10.5px] text-[#55606E]">
            {context.title}
          </p>
        </div>
      </div>

      {/* 进度条。 */}
      {context.total > 0 ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-[#55606E]">{context.message}</span>
            <span className="text-[11px] font-semibold tabular-nums text-[#0B162C]">
              {percent}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            <motion.div
              className="h-full rounded-full bg-[#1D4ED8]"
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      ) : null}

      {/* 任务清单。 */}
      {context.tasks && context.tasks.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {context.tasks.map((task, index) => (
            <li
              key={`${task.label}-${index}`}
              className="flex items-center gap-2 text-[11.5px]"
            >
              <span
                className={cn(
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                  task.done
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-[#CBD5E1]",
                )}
              >
                {task.done ? (
                  <Check size={9} strokeWidth={3.5} className="text-white" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  task.done ? "text-[#0F172A]" : "text-[#55606E]",
                )}
              >
                {task.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  );
}
