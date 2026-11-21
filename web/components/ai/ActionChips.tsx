"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/cn";

/**
 * 自然语言快捷指令
 * ===============
 *
 * 输入框上方的一排小按钮。每个按钮只有**几个字**，但底层会组装出
 * 一条**完整的长指令**交给 AI。
 *
 * 为什么不再显示长预设 Prompt
 * --------------------------
 *
 * 早先这里放的是一排完整的预设提示词——「你是一位耐心的导师，请用
 * 苏格拉底式提问引导我思考…」。它们有两个问题：
 *
 * 1. **用户读不懂**——那些词是给模型看的，不是给人看的；
 * 2. **用户不敢点**——一看到一整段英文/中文长句，就担心点了会
 *    触发什么奇怪的行为。
 *
 * 所以界面上只留**动词短语**：「苏格拉底追问」「帮我梳理逻辑」。
 * 用户点一下，下方的输入框里就出现了一条**展开好的**完整委托——
 * 用户能读、能改、能补充，然后自己按发送。
 *
 * 「点一下就填入，不直接发送」
 * --------------------------------
 *
 * 这是刻意的。快捷指令解决的是「**我该问什么**」的困惑，不是
 * 「替我决定什么时候问」。直接发送会剥夺用户最后的确认权——
 * 万一他只是想先看看这条指令长什么样呢。
 *
 * 与「回答模式」的关系
 * --------------------
 *
 * 「苏格拉底追问」这一条**同时**是一个 persona（回答模式）。点它会
 * 把角色切过去；其余几条（梳理逻辑 / 举个例子 / 大白话 / 挑刺 /
 * 复述）只是**指令**，不改变 AI 的身份。
 */

/** 一个快捷指令。 */
interface Chip {
  /** 按钮上显示的字——短、像人话。 */
  label: string;
  /** 底层组装出的完整指令。 */
  instruction: string;
  /** 提示——鼠标悬停时显示，让用户知道点下去会发生什么。 */
  hint: string;
  /**
   * 这一条是否会**切换回答模式**（persona）。
   *
   * 会的话，点它之前先看看当前模式是不是已经对了——不对才切。
   */
  persona?: string;
}

/** 快捷指令清单。 */
const CHIPS: Chip[] = [
  {
    label: "苏格拉底追问",
    hint: "让 AI 用提问引导你自己想明白，而不是直接给答案",
    persona: "socratic-method",
    instruction:
      "请用苏格拉底式的方法来引导我：不要直接给答案，而是一次只问一个问题，" +
      "顺着我的回答往下追问，帮我自己把这个概念想透。如果我答错了，" +
      "先指出我漏掉了什么，再问下一个问题。",
  },
  {
    label: "帮我梳理逻辑",
    hint: "把这一页的论证结构拆开来看",
    instruction:
      "请帮我梳理这一页的逻辑结构：先说它想证明什么（或讲清什么），" +
      "再说它分几步论证、每一步依赖什么，最后指出哪一步是最关键的前提。" +
      "请用列表回答，不要复述原文。",
  },
  {
    label: "用大白话讲一遍",
    hint: "用不带术语的方式解释当前内容",
    instruction:
      "请把当前这一页的核心内容用**大白话**讲一遍：假设我完全没读过这一页，" +
      "也不了解这个领域的术语。避免使用任何专业术语和缩写，" +
      "用具体的、日常的例子来说明。",
  },
  {
    label: "举个例子",
    hint: "要几个具体例子把概念钉住",
    instruction:
      "请给我 3 个**具体**例子来解释当前这一页的核心概念，" +
      "每个例子都要能自解释——不要只写「比如某某」，要真的把例子讲出来。" +
      "如果有反直觉的地方，请特别指出。",
  },
  {
    label: "挑刺",
    hint: "让 AI 指出这段内容的薄弱之处",
    instruction:
      "请以严格的批判视角审视当前这一页：它的论证有哪些薄弱环节？" +
      "有哪些说法是**未经证明**就当成前提的？有哪些反例它没有处理？" +
      "如果有值得称赞的地方也请指出，但请把重点放在可改进之处。",
  },
  {
    label: "复述一遍",
    hint: "检查你自己有没有真的读懂",
    instruction:
      "请用自己的话把当前这一页复述一遍——不要引用原文，" +
      "只写你自己的理解。复述之后，请指出你觉得这一页**最难懂的一点**在哪里。",
  },
];

export function ActionChips({ className = "" }: { className?: string }) {
  const { persona, setPersona, setInput } = useChat();
  /** 刚刚点过的芯片——闪一下「已填入」的反馈。 */
  const [flash, setFlash] = useState<string>("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  /**
   * 点一个芯片。
   *
   * 芯片本身**不发送**——它把组装好的完整委托填进输入框，
   * 让用户读完、补充、必要时改写，然后自己按发送。
   */
  const apply = useCallback(
    (chip: Chip) => {
      // 回答模式类的芯片：先把角色切过去。
      if (chip.persona && chip.persona !== persona) {
        setPersona(chip.persona);
      }

      setInput(chip.instruction);
      setFlash(chip.label);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setFlash(""), 1600);

      // 让输入框获得焦点，并把光标放到末尾——用户接着写。
      requestAnimationFrame(() => {
        const node = document.querySelector<HTMLTextAreaElement>(
          "[data-seek-ai-input]",
        );
        node?.focus();
        if (node) {
          const length = node.value.length;
          node.setSelectionRange(length, length);
        }
      });
    },
    [persona, setInput, setPersona],
  );

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label="快捷指令"
    >
      {CHIPS.map((chip) => {
        const active = chip.persona ? persona === chip.persona : false;
        const flashing = flash === chip.label;
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => apply(chip)}
            title={chip.hint}
            aria-pressed={active}
            className={cn(
              "seek-bean-key inline-flex items-center gap-1 rounded-full px-2.5 py-1",
              "text-[11.5px] transition-all duration-200",
              // 豆沙粉底 + 1px 淡描边 + 深灰紫字——和用户气泡同一套
              // 语言，提示「这也是你这边的东西」。
              //
              // 底色、描边、悬停态都由 ``.seek-bean-key`` 这一个类
              // 统一提供。之前这里写的是 ``bg-[var(--seek-bean-soft)]/70``
              // 加 ``seek-key-sm``——前者在 Tailwind 3 里根本编译不出来
              // （任意值不支持透明度修饰符），后者又用通用描边把
              // 豆沙粉的 ``#EEDCDA`` 覆盖掉了，结果按钮只剩一圈灰边、
              // 底色全透明，看起来像没做样式的原生按钮。
              active
                ? "bg-[var(--seek-bean-soft)] text-[var(--seek-plum)]"
                : "bg-[var(--seek-bean-soft)] text-[var(--seek-plum)]",
              "hover:bg-[var(--seek-bean-soft-hover)]",
              flashing && "scale-[1.03]",
            )}
          >
            {flashing ? (
              <Check size={10} strokeWidth={2.5} className="text-emerald-700" />
            ) : (
              <Sparkles
                size={10}
                strokeWidth={2}
                className="shrink-0 opacity-70"
              />
            )}
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
