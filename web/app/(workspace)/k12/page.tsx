"use client";

import K12HallPage from "@/components/k12/K12HallPage";

/**
 * K12 课程大厅。
 *
 * 这个路径是**历史别名**——主导航现在只保留「课程」一项，指向
 * ``/courses``。保留它是因为：
 *
 * - 已经被收藏 / 分享出去的旧链接不会 404；
 * - GitHub Pages 是**纯静态**的，删掉路由会让旧书签失效。
 */
export default function K12HallAliasPage() {
  return <K12HallPage />;
}
