/**
 * 全局品牌信息
 * =============
 *
 * 所有页面标题、侧边栏标识、页脚文案都从这里取值——改一处即可全局生效。
 *
 * 品牌定位
 * --------
 *
 * **梦想课堂 · 深圳后海总部**
 * （Dream Class · Houhai HQ, Shenzhen）
 *
 * 服务对象是**全球海外华人**——覆盖东亚、东南亚、北美、欧洲、澳新
 * 等大区。所以品牌名必须同时给到**中文归属感**与**国际可读性**：
 *
 * * 「梦想课堂」——中文世界的情感连接，四个字就能唤起「一起把事
 *   做成」的感觉；
 * * 「Dream Class」——英文世界直接可读，不需要解释；
 * * 「深圳后海总部」——把**物理锚点**说清楚。海外用户搜「后海」
 *   能定位到我们，而「后海」本身就是一个具体的、真实的、科技聚集
 *   的地方——它让品牌有根。
 *
 * 英文名用 ``Houhai`` 而不是 ``Hou Hai``——深圳的官方英文地名写法
 * 是连写的，跟 Shenzhen 一样。写成 ``Hou Hai`` 会显得像音译。
 */

/** 产品全名（中文）。 */
export const PLATFORM_NAME = "梦想课堂";

/** 侧边栏与紧凑位置使用的短名。 */
export const PLATFORM_SHORT_NAME = "梦想课堂";

/** 英文全名。 */
export const PLATFORM_NAME_EN = "Dream Class";

/** 总部标识——中文。 */
export const HQ_LABEL = "深圳后海总部";

/** 总部标识——英文。 */
export const HQ_LABEL_EN = "Houhai HQ, Shenzhen";

/** 一句话定位。 */
export const PLATFORM_TAGLINE = "连接全球华人的终身学习家园";

/** 一句话定位（英文）。 */
export const PLATFORM_TAGLINE_EN = "A lifelong learning hub for global Chinese";

/**
 * 顶栏品牌条——主副标题。
 *
 * 用 ``·`` 分隔而不是 ``|``：竖线在深蓝底上会切出一道视觉上的
 * 硬边，而间隔号只留一个呼吸的间隙——它读起来是「一句话」而不是
 * 「两个标签」。
 */
export const BRAND_SUBTITLE = `${HQ_LABEL} | ${PLATFORM_NAME_EN} · ${HQ_LABEL_EN}`;

/** 页脚品牌栏文案。 */
export const FOOTER_BRAND =
  "梦想课堂（深圳后海总部） · 连接全球华人的终身学习家园 | Dream Class Global Chinese Learning Hub";

/** 页脚品牌栏文案（英文）。 */
export const FOOTER_BRAND_EN =
  "Dream Class (Houhai HQ, Shenzhen) · A lifelong learning hub for global Chinese";

/** 页脚 / 关于面板的一句话描述。 */
export const PLATFORM_DESCRIPTION =
  "汇聚全球顶尖高校的公开课，为海外华人提供流媒体式的自学闭环：视频、时间戳知识节点与 AI 助教伴读。";

/** 站点元信息（供 layout.tsx 使用）。 */
export const PLATFORM_METADATA = {
  title: `${PLATFORM_NAME} · ${HQ_LABEL}`,
  description: PLATFORM_DESCRIPTION,
} as const;
