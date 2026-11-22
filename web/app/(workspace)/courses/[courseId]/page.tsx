/**
 * 第一层 · 课程目录页 —— 静态导出入口
 * ==========================================
 *
 * 路由：``/courses/[courseId]``
 *
 * 这一层**只**放「属于课程总览」的信息：
 *
 * * 一句话简介；
 * * 教材版本 · 适用年龄 · 册次；
 * * 总体进度条；
 * * 按单元排列的完整分集目录（序号 / 课名 / 时长 / 状态）。
 *
 * 任何属于**单集**的内容（播放器、字幕、导读、AI 助教）都不在这里——
 * 那是第二层的事。两层不重复，是这次重构的核心。
 *
 * 为什么要有这一层
 * ----------------
 *
 * 以前这门课的详情页把「简介 + 播放器 + 时间轴 + 导读 + AI」全塞在
 * 一页里。结果是：想看看「这门课一共几讲、我学到哪了」的人，得先
 * 加载播放器、滚动半屏才能找到目录。
 *
 * 拆成两层之后，目录页是**纯数据**的——加载快、适合收藏与分享
 * （「四年级数学上册共 177 讲」这个链接本身就是有用的信息）。
 */

import {
  staticHubCourseIds,
  staticK12SeriesIds,
} from "@/lib/static-courses";
import CourseDirectoryClient from "./CourseDirectoryClient";

/**
 * 构建期为哪些课程生成目录页。
 *
 * 两批：K12 的 24 套年级系列 + 中台里有分集的资源。
 */
export function generateStaticParams(): Array<{ courseId: string }> {
  const ids = new Set<string>([
    ...staticK12SeriesIds(),
    ...staticHubCourseIds(),
  ]);
  return [...ids].map((courseId) => ({ courseId }));
}

export default function CourseDirectoryPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  return <CourseDirectoryClient params={params} />;
}
