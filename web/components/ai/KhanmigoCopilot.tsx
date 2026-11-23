"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Lightbulb,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { hasAiProxy } from "@/lib/local-ai";
import { askLocalAssistant } from "@/lib/local-ai";
import { cn } from "@/lib/cn";
import type { LabContextDetail } from "@/lib/lab-context";

/**
 * Khanmigo 式苏格拉底启发伴学
 * =============================
 *
 * 右侧 32% 的副驾驶。它做三件事：
 *
 * 1. **实时感应左侧操作**——「正在使用动态量角器 · 已完成 1/2 测量任务」；
 * 2. **启发式追问**——每完成一个教具动作，自动给一句苏格拉底式追问
 *    + 思考选项 + [给我一个小提示]；
 * 3. **自由对话**——接 DeepSeek（代理优先，其次自填 Key，最后离线降级）。
 *
 * ⛔ **绝不直接甩答案**
 *
 * 这是整个组件的设计红线。伴学的每一句都必须让学习者**自己**完成
 * 那一步思考。所以：
 *
 * - 追问永远是问句，不是陈述；
 * - 提示是**渐进**的（第一次给方向，第二次给线索，第三次才给具体
 *   突破口）；
 * - 自由对话的 system prompt 里也写死了「不剧透」。
 *
 * ⛔ **视觉铁律**：面板 100% 实心纯白，文字深炭黑。绝不半透明。
 */

/** 一句启发式追问。 */
interface Prompt {
  /** 追问正文。 */
  question: string;
  /** 思考选项（点击即视为完成深度思考互动）。 */
  options: string[];
  /** 渐进提示——按索引递进。 */
  hints: string[];
  /** 触发这条追问的教具状态关键词。 */
  trigger: string;
}

/**
 * 一条追问的唯一标识。
 *
 * ⚠️ 判重必须用它，而**不能**用 ``pool.indexOf(item)``——
 *    ``indexOf`` 按引用相等比较，永远返回**第一个**匹配项的下标。
 *    用它判重会导致「所有追问都被当成第 0 条」，第二条永远弹不出来。
 */
function promptId(prompt: Prompt): string {
  return prompt.question.slice(0, 24);
}

/**
 * 启发式追问库。
 *
 * 键是教具 ``kind``；值是**按进度**排列的追问序列。
 *
 * 每条追问的措辞都遵循苏格拉底原则：**给现象，不给结论**。
 */
const PROMPTS: Record<string, Prompt[]> = {
  protractor: [
    {
      trigger: "开始",
      question: "量角器的中心点和哪条边重合了？这样读数才准确——你检查一下。",
      options: ["和第一条边重合", "和第二条边重合", "随便放就行"],
      hints: [
        "量角器的「0 刻度」那一条线，要压在你要量的那条边上。",
        "转动量角器，让 0 刻度线与被测角的一边完全对齐。",
        "答案是：让 0 刻度线与被测角的一边重合，然后读另一条边扫过的刻度。",
      ],
    },
    {
      trigger: "测量",
      question: "如果你把这条边再抬高 10 度，量角器的读数会怎么变？为什么？",
      options: ["变大，因为边离 0 线更远", "不变，因为角度没动", "变小，因为边更靠近 0 线"],
      hints: [
        "想象你把量角器固定住不动，只转动那一条边。",
        "边转得离 0 刻度越远，扫过的刻度就越多。",
        "答案是：读数变大，因为边离 0 刻度线更远，扫过的刻度更多。",
      ],
    },
  ],
  functionLab: [
    {
      trigger: "开始",
      question: "把系数 a 从负数拖到正数，抛物线发生了什么变化？",
      options: ["开口朝上翻转到朝下", "曲线整体平移了", "曲线没变，只是变粗了"],
      hints: [
        "a 是抛物线 y = ax² 里的系数，它决定「开口的方向」。",
        "a 为负时开口朝下，a 为正时开口朝上。",
        "答案是：开口朝上翻转到朝下——a 的符号决定开口方向。",
      ],
    },
    {
      trigger: "参数",
      question: "当 a 变大时，抛物线变「窄」还是变「宽」？想想 y = 2x² 和 y = 0.5x² 的差别。",
      options: ["变窄", "变宽", "一样宽"],
      hints: [
        "取同一个 x（比如 x = 1），比较两个 y 值。",
        "y = 2×1² = 2，而 y = 0.5×1² = 0.5。",
        "答案是：变窄——a 的绝对值越大，抛物线越「陡」。",
      ],
    },
  ],
  chartLab: [
    {
      trigger: "开始",
      question: "你把最高的那一组调低之后，平均数往哪边走？为什么？",
      options: ["往下走，因为大数被拉小了", "往上走，因为总数变多了", "不变，中位数决定平均数"],
      hints: [
        "平均数 = 所有数加起来 ÷ 个数。个数没变。",
        "只把一个大数调小了，总和会变小。",
        "答案是：往下走——总和变小而个数不变，平均数随之变小。",
      ],
    },
    {
      trigger: "数据",
      question: "什么情况下中位数比平均数更「靠谱」？",
      options: ["当有一个特别大的数时", "当所有数都一样时", "当数据个数是偶数时"],
      hints: [
        "想一个极端情况：数据里混进了一个 1000，其余都在 10 左右。",
        "平均数会被那个 1000 拉得很高，但中位数几乎不受影响。",
        "答案是：当有一个特别大的数时——中位数对极端值不敏感。",
      ],
    },
  ],
  decimalBlocks: [
    {
      trigger: "开始",
      question: "你用了几个十格长条？把它们换成单个方块，会多几个？",
      options: ["多 10 个", "多 8 个", "一样多"],
      hints: [
        "一个十格长条 = 10 个方块。",
        "所以每换一条长条，方块数就多 10 个。",
        "答案是：多 10 个——一条长条正好等于 10 个方块。",
      ],
    },
    {
      trigger: "凑十",
      question: "为什么「凑十法」比「一个一个数」快？你能举一个例子吗？",
      options: ["因为 10 个一组可以直接记住", "因为数起来更简单", "因为答案更小"],
      hints: [
        "想一想 9 + 5 用凑十法和逐个数，分别要做几步？",
        "凑十法：9 借 1 凑成 10，10 + 4 = 14。",
        "答案是：因为 10 个一组可以直接记住——9+5 只要两步，而逐个数要 14 步。",
      ],
    },
  ],
  fractionDisc: [
    {
      trigger: "开始",
      question: "如果把等分份数从 4 改成 8，每一份的大小会怎么变？",
      options: ["变成原来的一半", "变成原来的两倍", "不变"],
      hints: [
        "同样一整个圆，被分的份数越多，每份就越小。",
        "4 份时每份是 1/4；8 份时每份是 1/8。",
        "答案是：变成原来的一半——份数翻倍，每份就减半。",
      ],
    },
  ],
  balanceScale: [
    {
      trigger: "开始",
      question: "天平为什么不平衡了？两边各是多少？",
      options: ["左边比右边重", "右边比左边重", "其实平衡了"],
      hints: [
        "把两边的砝码加起来比一比。",
        "天平只认「两边总重量」，不认砝码个数。",
        "答案是：看两边的**总和**——个数多的一边不一定更重。",
      ],
    },
  ],
  hanzi: [
    {
      trigger: "描红",
      question: "这个字的偏旁在左边还是右边？它在提示你什么意思？",
      options: ["左边，和「手」有关", "右边，和「心」有关", "上下结构"],
      hints: [
        "偏旁的位置本身就带着信息。",
        "很多形声字的偏旁表示**义类**，声旁表示读音。",
        "答案是：偏旁表示意义类别——看偏旁就能猜出字的大致意思。",
      ],
    },
  ],
  culture: [
    {
      trigger: "开始",
      question: "这个词在这句话里为什么用得这么重？换成普通说法会失去什么？",
      options: ["会失去画面感", "会失去情感重量", "会变得不通顺"],
      hints: [
        "把那个词换成「大白话」，再读一遍。",
        "古典汉语用词精炼，一个词常常同时承载形象与情感。",
        "答案是：会失去情感重量——古典用词的密度本身就是修辞。",
      ],
    },
  ],
  numberLine: [
    {
      trigger: "开始",
      question: "往左走和往右走，数值是变大还是变小？为什么？",
      options: ["往左变大", "往右变小", "都一样"],
      hints: [
        "看看数轴上 0 的位置在哪边。",
        "数轴是有方向的——负数在左边，正数在右边。",
        "答案是：往左走数值变小，往右走变大——数轴方向就是数值增减方向。",
      ],
    },
  ],
  default: [
    {
      trigger: "开始",
      question: "你刚才的操作改变了什么？如果把这个变化放到 10 倍大，会发生什么？",
      options: ["会变得很明显", "不会变", "会反过来"],
      hints: [
        "把当前的参数或数字乘以 10，再看一次结果。",
        "线性变化的规律会在放大后更清楚。",
        "答案是：会变得很明显——放大参数往往能让隐藏的规律浮现出来。",
      ],
    },
  ],
};

/** 伴学组件属性。 */
export interface KhanmigoCopilotProps {
  /** 课程名。 */
  courseTitle: string;
  /** 本课标题。 */
  lessonTitle: string;
  /** 左侧教具的实时状态。 */
  labContext: LabContextDetail | null;
  /** 额外类名。 */
  className?: string;
  /** 深度思考互动完成时回调——用于点亮第 2 颗星。 */
  onThink?: () => void;
  /** 本课已点亮的星星——传给代理，让它知道该推哪一颗。 */
  stars?: { explore: boolean; think: boolean; master: boolean };
}

/** 一条对话消息。 */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** 组件。 */
export default function KhanmigoCopilot({
  courseTitle,
  lessonTitle,
  labContext,
  className,
  onThink,
  stars,
}: KhanmigoCopilotProps) {
  const { locale } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  /** 已点过的追问——避免重复弹同一条。 */
  const [askedPrompts, setAskedPrompts] = useState<Set<string>>(new Set());
  /** 当前追问。 */
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  /** 提示已揭示到第几级。 */
  const [hintLevel, setHintLevel] = useState(0);

  /** 教具类型。 */
  const kind = labContext?.kind ?? "default";

  /**
   * 是否已经拿到「动手探索」星。
   *
   * ⛔ 这一条很重要——它让**回访**一节课时右栏不是空的。
   *    学生上次已经把这节课的教具玩明白了，这次进来应该直接被
   *    追问，而不是从零开始看一个空面板。
   */
  const alreadyExplored = Boolean(stars?.explore);

  /**
   * 教具进度变化 → 弹下一句追问。
   *
   * ⚠️ 只在**进度真正前进**时弹——否则每拖动一次量角器就打断一次，
   *    学习节奏会被切碎。
   *
   * ⛔ 但如果学生**已经拿到「动手探索」星**（说明这节课之前做过），
   *    回到这一课时就该**立刻**有一句追问等着他——不然右栏空着，
   *    他会以为伴学坏了。
   */
  useEffect(() => {
    if (!labContext) return;
    const pool = PROMPTS[kind] ?? PROMPTS.default;
    const key = `${kind}:${labContext.done}`;
    if (askedPrompts.has(key)) return;
    // 至少完成一个任务才追问——刚进来就问等于什么都没做。
    const eligible = labContext.done >= 1 || alreadyExplored;
    if (!eligible) return;

    // 找**还没被问过**的那一条。
    //
    // ⚠️ 不能用 ``pool.indexOf(item)`` 来判重——``indexOf`` 永远
    //    返回**第一个**匹配项的下标，于是所有追问都会被误判成
    //    「已问过第 0 条」。必须用条目自身的身份来判重。
    const next = pool.find(
      (item) => !askedPrompts.has(`${kind}:${promptId(item)}`),
    );
    if (!next) return;

    setAskedPrompts((prev) => new Set(prev).add(key));
    setPrompt(next);
    setHintLevel(0);
  }, [labContext, kind, askedPrompts, alreadyExplored]);

  /** 选一个思考选项 → 记为「深度思考」互动完成。 */
  const answer = useCallback(() => {
    setPrompt(null);
    setHintLevel(0);
    onThink?.();
  }, [onThink]);

  /** 发送自由对话。 */
  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);

    try {
      const result = await askLocalAssistant(
        question,
        messages.map((item) => ({
          role: item.role,
          content: item.content,
          created_at: Date.now(),
        })),
        {
          title: `${courseTitle} · ${lessonTitle}`,
          locale,
          learnerProfile:
            labContext
              ? `[学习者画像] 当前正在学习《${lessonTitle}》。左侧正在使用「${labContext.title}」，进度 ${labContext.done}/${labContext.total}。`
              : undefined,
        },
        undefined,
        {
          // ── 传给代理的苏格拉底上下文 ──
          //
          // 代理会用它生成**服务端的**系统提示词，从而保证
          // 「绝不剧透」这条性质不会被前端改掉。
          course: courseTitle,
          lesson: lessonTitle,
          labState: labContext
            ? {
                kind: labContext.kind,
                title: labContext.title,
                done: labContext.done,
                total: labContext.total,
                message: labContext.message,
                tasks: labContext.tasks,
              }
            : null,
          stars,
        },
      );
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "暂时无法连接模型服务。回到上面的启发式追问，继续用左侧教具验证你的想法。",
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, courseTitle, lessonTitle, locale, labContext, stars]);

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col gap-3",
        className,
      )}
    >
      {/* ── 状态条：实时感应左侧操作 ── */}
      <div className="rounded-xl border border-[#E5E2DA] bg-white px-3.5 py-3">
        <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.16em] text-[#A48A5E] uppercase">
          <Sparkles size={10} strokeWidth={2.4} />
          Live Context
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#1E242B]">
          {labContext
            ? `正在使用「${labContext.title}」${
                labContext.total > 0
                  ? ` · 已完成 ${labContext.done}/${labContext.total} 个任务`
                  : ""
              }`
            : "正在等待左侧教具的动作…"}
        </p>
        {labContext?.message ? (
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#5C646D]">
            {labContext.message}
          </p>
        ) : null}
      </div>

      {/* ── 苏格拉底追问 ── */}
      <AnimatePresence mode="wait">
        {prompt ? (
          <motion.div
            key={prompt.question}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-[#A48A5E] bg-[#FFFFFF] px-3.5 py-3.5"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.16em] text-[#8A6D3B] uppercase">
              <Lightbulb size={10} strokeWidth={2.4} />
              Socratic Prompt
            </p>
            <p className="mt-2 text-[13px] leading-[1.85] text-[#1E242B]">
              {prompt.question}
            </p>

            {/* 思考选项。 */}
            <div className="mt-3 space-y-1.5">
              {prompt.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={answer}
                  className="flex w-full items-start gap-2 rounded-lg border border-[#E5E2DA] bg-white px-3 py-2 text-left text-[12px] leading-relaxed text-[#1E293B] transition-colors hover:border-[#4E677D]"
                >
                  <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border border-[#D5D1C8]" />
                  {option}
                </button>
              ))}
            </div>

            {/* 渐进提示。 */}
            <div className="mt-3 border-t border-[rgba(184,155,94,0.3)] pt-3">
              {hintLevel > 0 ? (
                <p className="rounded-lg border border-[#E5E2DA] bg-white px-3 py-2 text-[11.5px] leading-relaxed text-[#1E293B]">
                  {prompt.hints[Math.min(hintLevel - 1, prompt.hints.length - 1)]}
                </p>
              ) : null}
              {hintLevel < prompt.hints.length ? (
                <button
                  type="button"
                  onClick={() => setHintLevel((v) => v + 1)}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[#D5D1C8] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-[#1E242B] transition-colors hover:border-[#4E677D]"
                >
                  <ChevronDown size={11} strokeWidth={2.4} />
                  {hintLevel === 0 ? "给我一个小提示" : "再给一点线索"}
                </button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── 自由对话 ── */}
      <div className="flex min-h-[220px] flex-1 flex-col rounded-xl border border-[#E5E2DA] bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-[#E5E2DA] px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1E242B]">
            <MessageCircle size={12} strokeWidth={2.2} />
            与伴学对话
          </p>
          <span className="rounded-full border border-[#E5E2DA] bg-[#F6F4EF] px-2 py-0.5 text-[10px] text-[#5C646D]">
            {hasAiProxy() ? "代理已连接" : "离线引导流"}
          </span>
        </div>

        {/* 消息列表。 */}
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
          {messages.length === 0 ? (
            <p className="py-4 text-[12px] leading-relaxed text-[#5C646D]">
              我不会直接告诉你答案。我会用问题带你自己发现——
              先试试上面的启发式追问，或者直接问我一个你卡住的地方。
            </p>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "rounded-lg px-3 py-2 text-[12.5px] leading-relaxed",
                  message.role === "user"
                    ? "ml-6 bg-[#1E242B] text-white"
                    : "mr-6 border border-[#E5E2DA] bg-[#F6F4EF] text-[#1E293B]",
                )}
              >
                {message.content}
              </div>
            ))
          )}
          {sending ? (
            <p className="text-[11.5px] text-[#8A8578]">伴学正在思考…</p>
          ) : null}
        </div>

        {/* 输入框。 */}
        <div className="border-t border-[#E5E2DA] p-2.5">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="我卡在这一步了，你能给我一个方向吗？"
              className="min-h-[52px] flex-1 resize-none rounded-lg border border-[#D5D1C8] bg-white px-3 py-2 text-[12.5px] leading-relaxed text-[#1E242B] outline-none transition-colors placeholder:text-[#8A8578] focus:border-[#4E677D]"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || input.trim().length === 0}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                sending || input.trim().length === 0
                  ? "bg-[#F2EFE9] text-[#8A8578]"
                  : "bg-[#1E242B] text-white hover:bg-[#2c333b]",
              )}
              aria-label="发送"
            >
              <Send size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
