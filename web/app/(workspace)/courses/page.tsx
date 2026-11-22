"use client";

import K12HallPage from "@/components/k12/K12HallPage";

/**
 * 课程大厅。
 *
 * **主导航里唯一的「课程」入口**。
 *
 * 它就是 K12 年级同步系列（语文 / 数学，1–12 年级）——默认聚焦
 * 用户在引导里选定的年级，同时保留「查看全部年级」的下拉项。
 */
export default function CoursesPage() {
  return <K12HallPage />;
}
