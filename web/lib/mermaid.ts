/**
 * Mermaid 图的提取与识别
 * ========================
 *
 * 聊天回复里的 mermaid 图由 ``Markdown`` 组件拦截 ```` ```mermaid ````
 * 围栏，直接在气泡里画出来（见 ``components/common/Markdown.tsx``）。
 *
 * 判定规则集中在这里，避免多处实现漂移。
 */

/** 围栏代码块里 mermaid 图类型的起始关键字。 */
const DIAGRAM_KEYWORDS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "mindmap",
  "timeline",
  "quadrantChart",
  "gitGraph",
  "requirementDiagram",
  "C4Context",
  "zenuml",
  "sankey-beta",
  "xychart-beta",
] as const;

/** 图类型 → 中文标签。看板上用来告诉用户「这是一张什么图」。 */
const DIAGRAM_LABELS: Record<string, string> = {
  timeline: "时间线",
  mindmap: "思维导图",
  quadrantChart: "象限图",
  sequenceDiagram: "时序图",
  classDiagram: "类图",
  stateDiagram: "状态图",
  "stateDiagram-v2": "状态图",
  erDiagram: "实体关系图",
  pie: "占比图",
  gantt: "甘特图",
  journey: "用户旅程",
  gitGraph: "提交图",
  "sankey-beta": "流向图",
  "xychart-beta": "数据图",
};

/**
 * 判断一段代码块是不是 mermaid 图。
 *
 * 两种命中方式：
 *
 * * 带语言标记（`` ```mermaid ``）——直接命中；
 * * 不带语言标记，但首行是 mermaid 的图类型关键字——也命中。
 *   模型经常忘记写语言标记，只靠标记会漏掉一大半图。
 */
export function isMermaidSource(className: string | undefined, raw: string): boolean {
  if (className?.includes("language-mermaid")) return true;
  const head = raw.trimStart().split("\n", 1)[0]?.trim() ?? "";
  return DIAGRAM_KEYWORDS.some(
    (keyword) => head === keyword || head.startsWith(`${keyword} `),
  );
}

/** 一张从对话里提取出来的图。 */
export interface ExtractedDiagram {
  /** 稳定的唯一标识——用作 React key 与看板里的选中态。 */
  id: string;
  /** mermaid 源码（不含围栏）。 */
  chart: string;
  /** 图类型的中文标签。 */
  label: string;
  /** 图里 `title` 声明的标题；没有就是空串。 */
  title: string;
}

const FENCE_RE = /```mermaid[ \t]*\n([\s\S]*?)```/g;
const TITLE_RE = /^[ \t]*title[ \t]+(.+?)[ \t]*$/m;

/**
 * 从一段文本里提取所有 mermaid 图。
 *
 * 只认带 `````mermaid`` 标记的围栏——这是模型约定的输出格式。无标记的
 * 裸 mermaid 源码不拦：它可能是用户自己想看的一段代码，不该被劫持。
 */
export function extractMermaidDiagrams(content: string): ExtractedDiagram[] {
  if (!content.includes("```mermaid")) return [];

  const out: ExtractedDiagram[] = [];
  const text = content;
  FENCE_RE.lastIndex = 0;

  let match = FENCE_RE.exec(text);
  let index = 0;
  while (match !== null) {
    const chart = (match[1] ?? "").trim();
    if (chart) {
      const titleMatch = chart.match(TITLE_RE);
      out.push({
        id: `diagram-${index}-${chart.length}-${chart.slice(0, 12)}`,
        chart,
        label: diagramLabel(chart),
        title: titleMatch ? titleMatch[1].trim() : "",
      });
      index += 1;
    }
    match = FENCE_RE.exec(text);
  }

  return out;
}

/** 从 mermaid 源码里判断图类型，返回中文标签。 */
export function diagramLabel(chart: string): string {
  const head = chart.trimStart().split("\n", 1)[0]?.trim() ?? "";
  const keyword = Object.keys(DIAGRAM_LABELS).find(
    (candidate) => head === candidate || head.startsWith(`${candidate} `),
  );
  if (keyword) return DIAGRAM_LABELS[keyword];

  // graph/flowchart 的方向决定它更像「关系图」还是「流程图」。
  if (head.startsWith("graph LR") || head.startsWith("flowchart LR")) return "关系图";
  if (head.startsWith("graph") || head.startsWith("flowchart")) return "流程图";
  return "结构图";
}
