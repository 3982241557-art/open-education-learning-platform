"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import LearnStudio from "@/components/learn/LearnStudio";

/**
 * 上课台（查询参数驱动）
 * ======================
 *
 * .. code-block:: text
 *
 *     /learn?course=k12_math_g5&lesson=p1
 *
 * 为什么用查询参数而不是深层动态路由
 * ----------------------------------
 *
 * 旧版是 ``/courses/[courseId]/[epId]``。在 GitHub Pages 的子路径
 * 部署（``/open-education-learning-platform/``）下，这类路径要么
 * 404、要么需要额外的 rewrites 与 404 兜底——用户看到的现象就是
 * 「点哪里都进不去」。
 *
 * 顶层静态路由 + 查询参数把这条风险彻底消掉：
 *
 * 1. ``/learn`` 一定是真实存在的静态文件；
 * 2. 参数在客户端解析，**不参与路由匹配**，所以不存在路径不匹配；
 * 3. 一个页面扛所有课，JS bundle 不随课时数增长。
 *
 * ⚠️ ``useSearchParams`` 在 App Router 里会让子树变成动态渲染，
 *    所以整个页面必须包在 ``<Suspense>`` 里。
 */
function LearnRouter() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const course = searchParams.get("course");
  const lesson = searchParams.get("lesson");

  // 缺参数 → 回课程总台。
  if (!course) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f6f4ef]">
        <Loader2 size={18} className="animate-spin text-[#5c646d]" />
        <p className="text-[12.5px] text-[#5c646d]">
          正在打开课程总台…
        </p>
        <button
          type="button"
          onClick={() => router.replace("/courses")}
          className="rounded-full bg-[#1e242b] px-4 py-2 text-[12.5px] font-medium text-white"
        >
          立即前往
        </button>
      </div>
    );
  }

  return <LearnStudio courseId={course} lessonId={lesson} />;
}

export default function LearnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#f6f4ef]">
          <Loader2 size={18} className="animate-spin text-[#5c646d]" />
        </div>
      }
    >
      <LearnRouter />
    </Suspense>
  );
}
