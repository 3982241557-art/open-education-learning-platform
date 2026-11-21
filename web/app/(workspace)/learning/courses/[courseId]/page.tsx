/**
 * 课程详情页 —— 静态导出入口
 * ============================
 *
 * 这个文件是**服务端组件**，只做两件事：
 *
 * 1. 声明 ``generateStaticParams``——告诉 Next 构建期「有哪些课程页
 *    要生成」；
 * 2. 把真正的界面交给客户端组件。
 *
 * 为什么要有这个壳
 * ----------------
 *
 * 原来的页面文件是 ``"use client"`` 的。客户端组件**不能**导出
 * ``generateStaticParams``（那是构建期 API，只在服务端组件里有效）。
 *
 * 所以拆成两个文件：
 *
 * * ``page.tsx``（本文件）——服务端，负责路由参数声明；
 * * ``CourseDetailClient.tsx``——客户端，负责真正的交互。
 *
 * 静态导出时，Next 会为每个课程 id 生成一个 HTML 文件。
 */

import { staticCourseIds } from "@/lib/static-courses";
import CourseDetailClient from "./CourseDetailClient";

/**
 * 构建期为哪些课程生成静态页。
 *
 * 课程清单在构建期从 ``public/data/courses/*.json`` 读——那是由
 * ``scripts/sync-static-data.mjs`` 在 ``prebuild`` 阶段同步过来的。
 */
export function generateStaticParams(): Array<{ courseId: string }> {
  return staticCourseIds().map((courseId) => ({ courseId }));
}

/**
 * 静态导出下**不允许** ``dynamicParams: true``。
 *
 * 课程页全部由 ``generateStaticParams`` 预先生成——
 * 构建期就知道有哪些课程 id（从同步过来的 JSON 里读）。
 * 没在清单里的 id 会走 ``not-found``——但那种 id 本来也不存在。
 */

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  return <CourseDetailClient params={params} />;
}
