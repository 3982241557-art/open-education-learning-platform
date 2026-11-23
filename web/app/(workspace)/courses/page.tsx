"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import CoursesHub from "@/components/learn/CoursesHub";

/**
 * 课程总台。
 *
 * **纯静态顶级路由** ``/courses``——可选 ``?subject=math|chinese`` 与
 * ``?grade=xxx``。
 *
 * ⛔ 旧版的 ``/courses/[courseId]`` 深层动态目录路由在 GitHub Pages
 *    子路径部署下会 404。现在全部课时统一走
 *    ``/learn?course=<id>&lesson=<epId>``。
 */
export default function CoursesPage() {
  // ⚠️ CoursesHub 用了 useSearchParams（?subject= / ?grade=），
  //    所以必须包在 <Suspense> 里。
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#f6f4ef]">
          <Loader2 size={18} className="animate-spin text-[#5c646d]" />
        </div>
      }
    >
      <CoursesHub />
    </Suspense>
  );
}
