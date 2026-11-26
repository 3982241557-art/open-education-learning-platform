"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * 智能直达动线
 * ============
 *
 * .. code-block:: text
 *
 *     首次访问  /                → 正常展示品牌首页
 *     点击「进入学习」            → 写 oe_entered="1" → 跳 /map
 *     再次访问  /  （无 ?home=1） → 静默跳 /map
 *     点击侧栏 OE 徽标            → 跳 /?home=1  → 正常展示首页
 *
 * 为什么要有这一层
 * ----------------
 *
 * 老用户（已经点过「进入学习」）每次打开站点，其实**只想直接进
 * 课程**。让他先看到一张品牌首页，等于每次都多一次点击。
 *
 * 但品牌首页不能被彻底消灭——新用户必须先理解「这是什么」，
 * 而且老用户随时可以通过 OE 徽标回去。
 *
 * 所以判定条件很克制：
 *
 * 1. ``oe_entered`` 存在（用户点过「进入学习」）；
 * 2. URL **不带** ``?home=1``（用户没有显式要求看首页）。
 *
 * 两个条件同时成立才跳转。任何一条不成立都原地不动。
 *
 * ⚠️ 这个组件**必须**包在 ``<Suspense>`` 里——``useSearchParams``
 *    在 App Router 里会让整棵子树变成动态渲染。
 */
export default function SmartEntryRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/") return;

    // 显式要求看首页 → 不动。
    if (searchParams.get("home") === "1") return;

    // 从没进过站 → 第一次，展示品牌首页。
    let entered: string | null = null;
    try {
      entered = window.localStorage.getItem("oe_entered");
    } catch {
      entered = null;
    }
    if (entered !== "1") return;

    // 已经进过站，且没有显式要首页 → 静默直达数学学习地图。
    router.replace("/map");
  }, [pathname, router, searchParams]);

  return null;
}
