/**
 * 第二层 · 单集沉浸学习页 —— 静态导出入口
 * ==========================================
 *
 * 路由：``/courses/[courseId]/[epId]``
 *
 * 这一层**只**放「属于单集」的内容：
 *
 * * ← 返回课程目录 + 当前集标题；
 * * 视频播放器；
 * * 右侧 AI 助教；
 * * 底部辅助区（知识节点 / 段落导读 / 完整字幕，**默认全折叠**）。
 *
 * 严禁重复渲染课程长简介或顶部专题栏——那些属于第一层。
 * 两层不重复，是这次架构重构的核心。
 */

import {
  readStaticHubResources,
  readStaticK12Series,
} from "@/lib/static-courses";
import EpisodeLearningClient from "./EpisodeLearningClient";

/**
 * 构建期为哪些「课程 / 集」组合生成静态页。
 *
 * 两批来源：
 *
 * 1. **K12 系列**——24 套年级系列的全部课时；
 * 2. **中台资源**——有分集的那些。
 */
export function generateStaticParams(): Array<{
  courseId: string;
  epId: string;
}> {
  const params: Array<{ courseId: string; epId: string }> = [];

  for (const series of readStaticK12Series()) {
    for (const epId of series.episodeIds) {
      params.push({ courseId: series.id, epId });
    }
  }

  for (const resource of readStaticHubResources()) {
    for (const epId of resource.episodeIds) {
      params.push({ courseId: resource.id, epId });
    }
  }

  return params;
}

export default function EpisodeLearningPage({
  params,
}: {
  params: Promise<{ courseId: string; epId: string }>;
}) {
  return <EpisodeLearningClient params={params} />;
}
