import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
} from "@/shared/api/client";

/**
 * AI 洞察的前端数据客户端。
 *
 * 对应后端 `app/routers/insight.py`。三条能力：下一步建议、选区解读、
 * 图片识别。
 */

/** 一条下一步建议。 */
export interface Suggestion {
  id: string;
  title: string;
  /** 点击后会原样发给 AI 的完整提问。 */
  prompt: string;
  hint: string;
}

/** 下一步建议的结果。 */
export interface NextSteps {
  suggestions: Suggestion[];
  /** AI 对当前学习状态的感知描述。 */
  awareness: string;
  /** 是否由真实模型生成。 */
  from_model: boolean;
  warnings: string[];
}

/** 选区工具条的一个动作。 */
export interface SelectionAction {
  id: string;
  label: string;
  /** 这个动作的指令模板。 */
  prompt: string;
  /**
   * `true` 表示这个动作**不直接调用模型**——它把选中文本与结构化指令
   * 预填到主 AI 的输入框。
   *
   * 后端把布尔值编码成了字符串 `"true"`，这里两种都认。
   */
  prefill?: boolean | string;
  /**
   * `true` 表示这个动作是**父动作**——点击它会展开子选项，而不是
   * 直接执行。翻译就是这种：中译英？英译中？古文翻白话？
   */
  children?: boolean | string;
}

/** 父动作的子选项（如「翻译」下的「中译英」「英译中」）。 */
export interface SelectionVariant {
  id: string;
  /** 父动作的 id。 */
  parent: string;
  label: string;
  /** 这个子选项的完整指令。 */
  prompt: string;
}

/** 这个动作是不是「预填型」。 */
export function isPrefillAction(action: SelectionAction): boolean {
  return action.prefill === true || action.prefill === "true";
}

/** 这个动作是不是「父动作」（点击后展开子选项）。 */
export function isParentAction(action: SelectionAction): boolean {
  return action.children === true || action.children === "true";
}

/** 选区解读的结果。 */
export interface SelectionResult {
  reply: string;
  action: string;
  from_model: boolean;
}

/** 图片识别的结果。 */
export interface VisionResult {
  reply: string;
  from_model: boolean;
  warnings: string[];
}

export async function fetchNextSteps(params: {
  course_id?: string;
  page_id?: string;
}): Promise<NextSteps> {
  // ── 静态模式 ──
  //
  // 「下一步建议」是后端跑模型算出来的。静态模式下没有后端，
  // 所以给一组**固定的、通用的**建议——不假装是模型生成的。
  if (await isStaticRuntime()) {
    return {
      suggestions: [
        {
          id: "static-1",
          title: "先看一遍知识节点",
          prompt: "这门课有哪些关键节点？帮我排出一个观看顺序。",
          hint: "按时间轴的顺序过一遍，比零散地看效率高。",
        },
        {
          id: "static-2",
          title: "复述一遍核心概念",
          prompt: "用大白话给我讲一遍这门课最重要的三个概念。",
          hint: "复述比重看更能检验是否真的懂了。",
        },
        {
          id: "static-3",
          title: "挑一个点深入",
          prompt: "帮我挑一个最值得深挖的知识点，讲讲它背后的逻辑。",
          hint: "一个点挖透，胜过十个点扫过。",
        },
      ],
      awareness: "当前是纯静态版本，下面的建议是预置的通用建议，不是模型实时生成的。",
      from_model: false,
      warnings: [],
    };
  }

  const response = await apiFetch(apiUrl("/api/insight/next-steps"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await asJsonOrThrow(response);
  return {
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
    awareness: String(data?.awareness ?? ""),
    from_model: Boolean(data?.from_model),
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
  };
}

export async function fetchSelectionActions(): Promise<{
  actions: SelectionAction[];
  variants: SelectionVariant[];
}> {
  // ── 静态模式 ──
  //
  // 选区动作是**预定义**的（后端也只是从一份配置里读出来），
  // 所以静态模式下直接给一份等价的内置列表。
  if (await isStaticRuntime()) {
    return {
      actions: [
        {
          id: "explain",
          label: "解释这段",
          prompt: "请解释这段内容的意思，用通俗的中文。",
          prefill: true,
        },
        {
          id: "example",
          label: "举个例子",
          prompt: "请用一个具体的例子说明这段内容。",
          prefill: true,
        },
        {
          id: "question",
          label: "针对这段提问",
          prompt: "针对这段内容，提一个能检验理解的问题。",
          prefill: true,
        },
      ],
      variants: [],
    };
  }

  const response = await apiFetch(apiUrl("/api/insight/actions"), {
    cache: "no-store",
  });
  const data = await asJsonOrThrow(response);
  return {
    actions: Array.isArray(data?.actions) ? data.actions : [],
    variants: Array.isArray(data?.variants) ? data.variants : [],
  };
}

export async function analyzeSelection(params: {
  text: string;
  action: string;
  course_id?: string;
  page_id?: string;
}): Promise<SelectionResult> {
  // ── 静态模式 ──
  //
  // 选区解读要跑模型。静态模式下没有后端通道，
  // 所以退到主 AI 助手的离线引导——由它来回答。
  if (await isStaticRuntime()) {
    const { askLocalAssistant } = await import("@/lib/local-ai");
    const result = await askLocalAssistant(
      `${params.action === "example" ? "请举例说明" : "请解释"}：${params.text}`,
      [],
      null,
    );
    return {
      reply: result.answer,
      action: params.action,
      from_model: result.live,
    };
  }

  const response = await apiFetch(apiUrl("/api/insight/selection"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await asJsonOrThrow(response);
  return {
    reply: String(data?.reply ?? ""),
    action: String(data?.action ?? params.action),
    from_model: Boolean(data?.from_model),
  };
}

export async function analyzeImage(params: {
  image_base64: string;
  mime_type?: string;
  question?: string;
  course_id?: string;
  page_id?: string;
}): Promise<VisionResult> {
  // ── 静态模式 ──
  //
  // 图片识别需要后端把图片转成模型能吃的格式。静态模式下没有后端，
  // 所以明确说清「这个功能需要后端」，而不是假装识别了。
  if (await isStaticRuntime()) {
    return {
      reply:
        "图片识别需要后端服务（图片要先转码再交给模型）。" +
        "当前是纯静态版本，这个功能不可用——其余功能都正常。",
      from_model: false,
      warnings: ["图片识别在纯静态版本下不可用。"],
    };
  }

  const response = await apiFetch(apiUrl("/api/insight/vision"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await asJsonOrThrow(response);
  return {
    reply: String(data?.reply ?? ""),
    from_model: Boolean(data?.from_model),
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
  };
}

/** 把一个 File 读成 base64（去掉 data URL 前缀）。 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
