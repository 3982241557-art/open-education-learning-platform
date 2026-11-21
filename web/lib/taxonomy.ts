/**
 * 通识分类的前端定义。
 *
 * 与后端 `app/services/taxonomy.py` 一一对应——后端是权威，这里是
 * 展示层。分类轴是**学科**（四大支柱），不是难度。
 */

/** 四大通识支柱。 */
export interface Pillar {
  id: string;
  name: string;
  blurb: string;
}

/** 前置知识要求。 */
export interface Prerequisite {
  id: string;
  label: string;
}

export const PILLARS: Pillar[] = [
  {
    id: "humanities",
    name: "人文经典",
    blurb: "国史、诗词、散文与哲思文本——语言的根。",
  },
  {
    id: "science",
    name: "科学哲学",
    blurb: "物理、数学与自然——理解世界的骨架。",
  },
  {
    id: "technology",
    name: "逻辑与技术",
    blurb: "编程、算法与方法论——把想法变成现实。",
  },
  {
    id: "society",
    name: "社会与文明",
    blurb: "宪章、法律与公共生活——人如何与他人共处。",
  },
];

export const PREREQUISITES: Prerequisite[] = [
  { id: "none", label: "无需前置" },
  { id: "chinese", label: "需读得懂文言" },
  { id: "math", label: "需基础数理" },
  { id: "code", label: "需接触过编程" },
  { id: "science", label: "需基础科学概念" },
];

export function pillarOf(id: string): Pillar {
  return PILLARS.find((item) => item.id === id) ?? PILLARS[0];
}

export function prerequisiteOf(id: string): Prerequisite {
  return (
    PREREQUISITES.find((item) => item.id === id) ?? PREREQUISITES[0]
  );
}

/**
 * 支柱的视觉标识。
 *
 * 全部用中性灰阶——不用彩色分类标签，因为颜色会暗示「这一类更重要」。
 */
export const PILLAR_GLYPH: Record<string, string> = {
  humanities: "文",
  science: "理",
  technology: "术",
  society: "世",
};
