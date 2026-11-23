"use client";

import CoursesHub from "@/components/learn/CoursesHub";

/**
 * K12 课程大厅（历史别名）。
 *
 * 主导航现在只保留「课程」一项，指向 ``/courses``。保留这个路径是
 * 因为已经被收藏 / 分享出去的旧链接不该 404——GitHub Pages 是**纯
 * 静态**的，删掉路由会让旧书签失效。
 */
export default function K12HallAliasPage() {
  return <CoursesHub />;
}
