/**
 * 课程编辑页 —— 静态导出入口
 * ============================
 *
 * 服务端壳，负责路由声明。真正的编辑器是客户端组件（它要读
 * ``useSearchParams``）。
 *
 * 编辑课程需要**写**后端——静态模式下做不了。所以静态版里这个页面
 * 会提示「需要后端服务」，而不是假装能保存。
 */

import { staticCourseIds } from "@/lib/static-courses";
import EditCourseClient from "./EditCourseClient";

/** 为所有已知课程生成编辑页。 */
export function generateStaticParams(): Array<{ courseId: string }> {
  return staticCourseIds().map((courseId) => ({ courseId }));
}

export default function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  return <EditCourseClient params={params} />;
}
