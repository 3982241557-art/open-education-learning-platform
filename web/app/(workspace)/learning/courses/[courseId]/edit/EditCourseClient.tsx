"use client";

import { use } from "react";
import CourseEditor from "@/components/learning/CourseEditor";

/**
 * 课程编辑页的**客户端**实现。
 *
 * ``page.tsx``（服务端壳）负责 ``generateStaticParams``；本文件负责
 * 把路由参数喂给编辑器。
 */
export default function EditCourseClient({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  return <CourseEditor courseId={courseId} />;
}
