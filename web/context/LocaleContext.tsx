"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 多语言 + 多区适配
 * ==================
 *
 * 面向**全球海外华人**的平台，语言与线路都不是「附加功能」，而是
 * 第一公民。
 *
 * 三种语言
 * --------
 *
 * * ``zh-CN``——简体中文（默认）
 * * ``zh-TW``——繁体中文（台湾 / 香港 / 新加坡华人的常用写法）
 * * ``en``——英文
 *
 * 为什么必须支持繁体
 * ------------------
 *
 * 海外华人里说粤语的、台语的、东南亚华语、马来西亚华语的占比不低，
 * 他们的阅读习惯更接近繁体。而**简体转繁体不是机械替换**——
 * 「软件」在台湾是「軟體」、「信息」是「資訊」、「程序」是「程式」。
 * 所以这里用的是**词表映射**而不是逐字转换。
 *
 * 五个地区
 * --------
 *
 * * ``cn`` 中国大陆
 * * ``hktw`` 中国香港 / 台湾
 * * ``apac`` 亚太与东南亚
 * * ``na`` 北美
 * * ``eu`` 欧洲
 * * ``anz`` 澳新
 *
 * 地区不是「换个皮肤」——它决定：
 *
 * * **线路偏好**：B 站在大陆优先，YouTube 在海外优先；
 * * **书写习惯**：日期格式、数字分隔符、时区显示；
 * * **默认语言**：繁体区默认 ``zh-TW``，北美默认 ``en``。
 *
 * 为什么用 Context 而不是纯 CSS
 * ----------------------------
 *
 * 因为要换的不只是文字，还有**线路选择**（B 站 ↔ YouTube 的源
 * 优先级）和**格式化规则**（日期 / 数字）。CSS 做不到后者。
 *
 * 持久化
 * ------
 *
 * 选择写进 ``localStorage``——用户下次回来时还在同一语言、同一地区。
 * 这是「工具」与「玩具」的区别：没人希望每次打开都重新选一遍。
 */

/** 支持的语言。 */
export type Locale = "zh-CN" | "zh-TW" | "en";

/** 支持的地区（网络节点 / 线路偏好）。 */
export type Region = "cn" | "hktw" | "apac" | "na" | "eu" | "anz";

/** 语言元信息。 */
export const LOCALES: Array<{
  id: Locale;
  label: string;
  nativeLabel: string;
}> = [
  { id: "zh-CN", label: "简体中文", nativeLabel: "简体中文" },
  { id: "zh-TW", label: "繁體中文", nativeLabel: "繁體中文" },
  { id: "en", label: "English", nativeLabel: "English" },
];

/** 地区元信息。 */
export const REGIONS: Array<{
  id: Region;
  label: string;
  nativeLabel: string;
  /** 该区的首选视频源——线路适配。 */
  preferredProvider: "bilibili" | "youtube";
}> = [
  {
    id: "cn",
    label: "中国大陆",
    nativeLabel: "中国大陆",
    preferredProvider: "bilibili",
  },
  {
    id: "hktw",
    label: "中国香港 / 台湾",
    nativeLabel: "中國香港 / 台灣",
    preferredProvider: "bilibili",
  },
  {
    id: "apac",
    label: "亚太与东南亚",
    nativeLabel: "亞太與東南亞",
    preferredProvider: "bilibili",
  },
  { id: "na", label: "北美", nativeLabel: "北美", preferredProvider: "youtube" },
  { id: "eu", label: "欧洲", nativeLabel: "歐洲", preferredProvider: "youtube" },
  { id: "anz", label: "澳新", nativeLabel: "澳新", preferredProvider: "youtube" },
];

const LOCALE_KEY = "dreamclass.locale";
const REGION_KEY = "dreamclass.region";

/**
 * 繁体中文词表。
 *
 * 只收录**真正需要转换**的词——形声字与通用字（学 / 习 / 视 / 频）
 * 简体繁體一致，逐字处理只会引入 bug。
 *
 * 顺序有意义：长词在前，避免「軟件」被先替换成「軟体」再被
 * 「體」规则二次改写。
 */
const ZH_TW_MAP: Record<string, string> = {
  软件: "軟體",
  程序: "程式",
  网络: "網路",
  数据: "資料",
  信息: "資訊",
  视频: "影片",
  音频: "音訊",
  服务器: "伺服器",
  内存: "記憶體",
  硬盘: "硬碟",
  打印: "列印",
  打印件: "列印件",
  用户: "使用者",
  账户: "帳戶",
  登录: "登入",
  注册: "註冊",
  收藏: "收藏夾",
  分享: "分享",
  摄像头: "攝影機",
  页面: "頁面",
  界面: "介面",
  目录: "目錄",
  文件: "檔案",
  文件夹: "資料夾",
  质量: "品質",
  默认: "預設",
  导入: "匯入",
  导出: "匯出",
  同步: "同步",
  标签: "標籤",
  标题: "標題",
  内容: "內容",
  学习: "學習",
  课程: "課程",
  章节: "章節",
  笔记: "筆記",
  问题: "問題",
  提问: "提問",
  答案: "答案",
  测验: "測驗",
  正确: "正確",
  错误: "錯誤",
  证书: "證書",
  技能: "技能",
  掌握: "掌握",
  进阶: "進階",
  学位: "學位",
  文凭: "文憑",
  经济学: "經濟學",
  哲学: "哲學",
  心理学: "心理學",
  计算机: "電腦",
  人工智能: "人工智慧",
  机器学习: "機器學習",
  线性代数: "線性代數",
  时间戳: "時間戳",
  字幕: "字幕",
  知识节点: "知識節點",
  导读: "導讀",
  公开课: "公開課",
  学情中心: "學情中心",
  进度: "進度",
  全部: "全部",
  搜索: "搜尋",
  收藏夹: "收藏夾",
  订阅: "訂閱",
  频道: "頻道",
  视频课: "視頻課",
  视频源: "影片來源",
  线路: "線路",
  节点: "節點",
  预览: "預覽",
  下载: "下載",
  分享海报: "分享海報",
  复制: "複製",
  验证: "驗證",
  编号: "編號",
  签名: "簽名",
  盖章: "蓋章",
  颁发: "頒發",
  结业: "結業",
  证书墙: "證書牆",
  能力: "能力",
  熟练: "熟練",
  入门: "入門",
  启蒙: "啟蒙",
  精修: "精修",
  实战: "實戰",
  综合: "綜合",
  掌握度: "掌握度",
  未开始: "未開始",
  学习中: "學習中",
  已达标: "已達標",
  检测: "檢測",
  自测: "自測",
  达标: "達標",
  解锁: "解鎖",
  引导: "引導",
  华文: "華文",
  中华: "中華",
  文脉: "文脈",
  视野: "視野",
  交融: "交融",
  润物细无声: "潤物細無聲",
};

/**
 * 英文词表——只覆盖界面上**确实要翻译**的词。
 *
 * 课程标题、字幕、视频里的内容**不翻译**——那是原始素材，翻译了
 * 就失真。翻译的是**界面骨架**：导航、按钮、标签、状态。
 */
const EN_MAP: Record<string, string> = {
  首页: "Home",
  课程: "Courses",
  公开课: "Open Courses",
  计划: "Plan",
  学情中心: "Learning Center",
  能力库: "Skills",
  设置: "Settings",
  选课: "Browse",
  笔记: "Notes",
  搜索: "Search",
  搜全网: "Search the web",
  返回: "Back",
  返回公开课: "Back to Open Courses",
  返回公开课大厅: "Back to the Hall",
  正在加载: "Loading",
  全部: "All",
  待学习: "Not started",
  学习中: "In progress",
  薄弱需巩固: "Needs review",
  已掌握: "Mastered",
  未开始: "Not started",
  已达标: "Achieved",
  知识节点: "Key Concepts",
  段落导读: "Segment Guide",
  完整字幕: "Full Transcript",
  引用提问: "Quote & Ask",
  引用: "Quote",
  掌握度: "Mastery",
  技能树: "Skill Tree",
  学习阶梯: "Learning Path",
  随堂检测: "Quick Check",
  自测: "Self-test",
  达标: "Passed",
  正确率: "Accuracy",
  提问: "Questions",
  证书: "Certificate",
  结业证书: "Certificate of Completion",
  证书墙: "Certificate Wall",
  下载: "Download",
  分享: "Share",
  预览: "Preview",
  复制: "Copy",
  验证链接: "Verify Link",
  编号: "No.",
  颁发: "Issued",
  完成日期: "Completed",
  学员: "Learner",
  课程名称: "Course",
  姓名: "Name",
  修改: "Edit",
  入门启蒙: "Start here",
  核心精修: "Core skills",
  综合实战: "Applied practice",
  学位进阶: "Degree track",
  学情与进度中心: "Learning & Progress Center",
  正在加载公开课: "Loading open courses",
  看过的课: "Watched lectures",
  学科进度: "Subject progress",
  章节掌握度: "Chapter mastery",
  观看进度: "Watch progress",
  阅读进度: "Reading progress",
  继续学习: "Continue",
  调整计划: "Adjust plan",
  我的导入课程: "My imported courses",
  我导入的课程: "My imported courses",
  公开课大厅: "Open Courses Hall",
  导入课程: "Import course",
  新建课程: "New course",
  生成: "Generate",
  巡检更新: "Refresh sources",
  全网搜课并生成导学: "Search & build study guide",
  最后同步: "Last sync",
  审核清单: "Review queue",
  批准接入: "Approve",
  忽略: "Ignore",
  拉取已审核项目: "Fetch approved",
};

/**
 * 做一次语言转换。
 *
 * 采用**最长匹配优先**的贪心替换：先按词长降序排，逐个替换。
 * 这样「人工智能」会先于「智能」被处理，「学习中心」会先于「中心」。
 */
export function translate(text: string, locale: Locale): string {
  if (locale === "zh-CN") return text;
  const map = locale === "zh-TW" ? ZH_TW_MAP : EN_MAP;
  if (!map) return text;

  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let result = text;
  for (const key of keys) {
    if (!result.includes(key)) continue;
    result = result.split(key).join(map[key]);
  }
  return result;
}

/** 地区对应的默认语言。 */
export function defaultLocaleFor(region: Region): Locale {
  if (region === "hktw") return "zh-TW";
  if (region === "na" || region === "eu" || region === "anz") return "en";
  return "zh-CN";
}

/** 地区对应的时区（仅用于日期显示的提示）。 */
export function timezoneFor(region: Region): string {
  switch (region) {
    case "cn":
      return "Asia/Shanghai";
    case "hktw":
      return "Asia/Taipei";
    case "apac":
      return "Asia/Singapore";
    case "na":
      return "America/Los_Angeles";
    case "eu":
      return "Europe/Berlin";
    case "anz":
      return "Australia/Sydney";
    default:
      return "UTC";
  }
}

interface LocaleValue {
  /** 当前语言。 */
  locale: Locale;
  /** 切换语言。 */
  setLocale: (locale: Locale) => void;
  /** 当前地区。 */
  region: Region;
  /** 切换地区。 */
  setRegion: (region: Region) => void;
  /** 翻译一段文本。 */
  t: (text: string) => string;
  /** 当前地区偏好的视频源。 */
  preferredProvider: "bilibili" | "youtube";
  /** 当前语言的 BCP-47 标签。 */
  htmlLang: string;
}

const LocaleContext = createContext<LocaleValue | null>(null);

function readStored<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return (raw as T) || fallback;
  } catch {
    return fallback;
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh-CN");
  const [region, setRegionState] = useState<Region>("cn");
  const [hydrated, setHydrated] = useState(false);
  /**
   * 用户是否**显式**选过语言。
   *
   * 有了它，切换地区时的行为才有分寸：
   *
   * - 没选过（``false``）→ 语言**跟随地区**。从北美切到台港，
   *   界面自动变繁体——这正是「多区适配」该有的样子；
   * - 选过（``true``）→ 语言**不动**。用户特意选了繁体，切个
   *   地区就被改回简体，会让人以为设置没生效。
   */
  const [localeExplicit, setLocaleExplicit] = useState(false);

  // 挂载后读取用户的选择。
  //
  // 在 effect 里读而不是在 useState 初始化时读——SSR 阶段没有
  // localStorage，强行读会导致 hydration 不匹配（服务端渲染成
  // 简体，客户端立刻变成繁体，React 会报警告并把 DOM 重渲染一次）。
  useEffect(() => {
    const storedRegion = readStored<Region>(REGION_KEY, "cn");
    const storedLocale = readStored<Locale>(LOCALE_KEY, defaultLocaleFor(storedRegion));
    setRegionState(storedRegion);
    setLocaleState(storedLocale);
    // 存过语言 = 用户选过；否则视为「跟随地区」。
    setLocaleExplicit(Boolean(readStored(LOCALE_KEY, "")));
    setHydrated(true);
  }, []);

  // 同步 ``<html lang>``——屏幕阅读器与浏览器的翻译提示都靠它。
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = locale;
  }, [locale, hydrated]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setLocaleExplicit(true);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      /* 隐私模式下 localStorage 可能不可写——忽略即可 */
    }
  }, []);

  const setRegion = useCallback((next: Region) => {
    setRegionState(next);
    try {
      window.localStorage.setItem(REGION_KEY, next);
    } catch {
      /* 同上 */
    }
    // 语言跟随地区——但**只在用户没显式选过**的时候。
    //
    // 见 :attr:`localeExplicit` 的说明：显式选过的语言不被地区切换
    // 覆盖；没选过的（比如首次访问就落在「北美」默认英文），
    // 切到「中国香港 / 台湾」时自动变繁体。
    if (!localeExplicit) {
      setLocaleState(defaultLocaleFor(next));
    }
  }, [localeExplicit]);

  const value = useMemo<LocaleValue>(() => {
    const regionMeta = REGIONS.find((item) => item.id === region);
    return {
      locale,
      setLocale,
      region,
      setRegion,
      t: (text: string) => translate(text, locale),
      preferredProvider: regionMeta?.preferredProvider ?? "bilibili",
      htmlLang: locale,
    };
  }, [locale, region, setLocale, setRegion]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * 读取语言 / 地区上下文。
 *
 * 在 Provider 之外使用会返回一个**安全的默认值**——这样任何组件
 * 都可以直接调用，不需要到处做存在性判断。
 */
export function useLocale(): LocaleValue {
  const context = useContext(LocaleContext);
  const fallback = useMemo<LocaleValue>(
    () => ({
      locale: "zh-CN",
      setLocale: () => {},
      region: "cn",
      setRegion: () => {},
      t: (text) => text,
      preferredProvider: "bilibili",
      htmlLang: "zh-CN",
    }),
    [],
  );
  return context ?? fallback;
}
