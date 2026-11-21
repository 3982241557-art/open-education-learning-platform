import { redirect } from "next/navigation";

/**
 * 技能空间 —— 已并入首页。
 *
 * 原来这里摆着四张导航卡片（课程 / 学情 / 能力库 / 设置）。但导航是
 * 侧边栏的事，不是首页的事：让用户在入口处再做一次选择，只是在浪费
 * 一次点击。
 *
 * 因此这里不再渲染任何东西——直接把人送到真正要用的地方。
 */
export default function SpacePage() {
  redirect("/");
}
