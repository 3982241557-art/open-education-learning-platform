/**
 * 全站 i18n 引擎
 * ==============
 *
 * 三语字典 + 一个 ``t()`` 函数 + 一个 Context。
 *
 * 为什么不用原来的词表替换
 * -----------------------
 *
 * 旧的 ``LocaleContext.translate()`` 是**逐词替换**——它把界面上
 * 出现的每个中文字符串拿去查一张映射表。这套做法有三个硬伤：
 *
 * 1. **只覆盖已知词**。任何一个没进表的新文案，切换语言后**纹丝不动**
 *    ——这正是用户说的「切换语言后页面纹丝不动」。
 * 2. **依赖调用方手动包 ``t()``**。漏包一处，那一处就不翻译。
 * 3. **无法处理带变量的句子**（「第 {n} 讲 · {title}」）。
 *
 * 新的做法
 * --------
 *
 * - 字典用**结构化 key**（``nav.courses``），不是中文原文；
 * - 组件里显式调用 ``t("nav.courses")``，漏了就 fallback 到 key
 *   本身（不会静默显示错语言）；
 * - 支持 ``{{name}}`` 变量插值；
 * - 保留原来的词表替换作为**兜底**——课程标题、课文名这类**素材**
 *    不进字典，但界面骨架里漏配的词仍能通过词表替换。
 *
 * 教材本体不翻译
 * --------------
 *
 * 国内语文课本的汉字、古诗原文**保持原中文**——翻译了就失真了。
 * 字典只管**界面骨架**：导航、按钮、标签、状态、提示。
 */

import type { Locale } from "@/context/LocaleContext";

/** 三语文案字典。 */
export type Dictionary = Record<string, string>;

/** 简体中文——**基准**。所有 key 必须在这里存在。 */
export const zhCN: Dictionary = {
  // ── 导航 ──
  "nav.home": "首页",
  "nav.courses": "课程",
  "nav.plan": "计划",
  "nav.progress": "学情中心",
  "nav.ask": "提问",
  "nav.skills": "能力库",
  "nav.settings": "设置",

  // ── 通用动作 ──
  "action.back": "返回",
  "action.search": "搜索",
  "action.all": "全部",
  "action.cancel": "取消",
  "action.confirm": "确定",
  "action.skip": "跳过",
  "action.save": "保存",
  "action.reset": "重置",
  "action.retry": "重试",
  "action.close": "关闭",
  "action.export": "导出",
  "action.import": "导入",
  "action.download": "下载",
  "action.share": "分享",
  "action.copy": "复制",
  "action.edit": "修改",
  "action.viewAll": "查看全部",
  "action.continue": "继续",

  // ── K12 大厅 ──
  "k12.title": "国内 K12 语文 · 数学年级同步系列",
  "k12.currentGrade": "当前年级",
  "k12.allGrades": "查看全部年级",
  "k12.subjectAll": "全部",
  "k12.subjectChinese": "语文",
  "k12.subjectMath": "数学",
  "k12.searchPlaceholder": "搜课程 / 教材 / 老师",
  "k12.stagePrimary": "小学部",
  "k12.stageJunior": "初中部",
  "k12.stageSenior": "高中部",
  "k12.loading": "正在载入 K12 课程…",
  "k12.loadFailed": "课程目录暂时载入失败",
  "k12.noResult": "没有符合条件的课程",
  "k12.tryOther": "换个年级或学科试试。",
  "k12.lessons": "课时",
  "k12.series": "套",
  "k12.ageSuffix": "岁",
  "k12.pickGrade": "先选你的年级",
  "k12.pickGradeHint": "我们会按年级推荐对应的语文与数学同步课。",

  // ── 引导 ──
  "onboard.title": "欢迎来到 OE 梦想课堂",
  "onboard.subtitle": "一步选好语言与年级，我们立刻为你准备对应的同步课。",
  "onboard.stepLanguage": "选择语言",
  "onboard.stepGrade": "选择年级与年龄",
  "onboard.start": "开始学习",
  "onboard.skip": "稍后再说",
  "onboard.gradeLabel": "当前学段与年级",

  // ── 课程目录（第一层） ──
  "course.directory": "课程目录",
  "course.overview": "总体进度",
  "course.episodes": "分集目录",
  "course.startFirst": "开始第 1 讲",
  "course.notStarted": "未开始",
  "course.inProgress": "学习中",
  "course.done": "已完成",
  "course.lessonOf": "第 {index} / {total} 讲",
  "course.backToDirectory": "返回课程目录",

  // ── 单集学习（第二层） ──
  "episode.learn": "学完本集 · 进入检测",
  "episode.nodes": "知识节点",
  "episode.segments": "段落导读",
  "episode.captions": "完整字幕",
  "episode.prev": "上一讲",
  "episode.next": "下一讲",
  "episode.loading": "正在载入这一讲…",
  "episode.notFound": "找不到这一讲",
  "episode.playLab": "✨ 动手玩动画",

  // ── 互动实验室 ──
  "lab.title": "互动动画实验室",
  "lab.hint": "拖一拖、点一点——把这一课的核心概念玩明白。",
  "lab.hanziTitle": "笔顺描红",
  "lab.hanziHint": "看笔顺动画，然后跟着在屏幕上写一遍。",
  "lab.playStroke": "播放笔顺",
  "lab.quizStroke": "跟我写",
  "lab.readAloud": "朗读",
  "lab.poemTitle": "分句图解",
  "lab.poemHint": "点高亮的词句，看它的白话意思与双语提示。",
  "lab.mathTitle": "数学动画",
  "lab.mathHint": "拖动滑块或方块，看看这个概念怎么动起来。",
  "lab.blocksTitle": "凑十 · 方块拼接",
  "lab.blocksHint": "把方块拖到十格框里，看看怎么凑成一个整十。",
  "lab.fractionTitle": "分数 · 披萨切分",
  "lab.fractionHint": "改变切割份数，看看分数怎么变。",
  "lab.symmetryTitle": "对称 · 平移互动板",
  "lab.symmetryHint": "拖动图形，找出它和镜像完全重合的位置。",
  "lab.functionTitle": "函数图像动态",
  "lab.functionHint": "拖动滑块，看一次函数和二次函数的图像怎么变。",
  "lab.geometryTitle": "动态几何",
  "lab.geometryHint": "拖动顶点，看角度和面积怎么变。",
  "lab.play": "开始玩",
  "lab.reset": "重置",
  "lab.correct": "对啦！",
  "lab.tryAgain": "再试一次",
  "lab.pinyin": "拼音",
  "lab.radical": "偏旁",

  // ── 诊断卡 ──
  "diag.title": "进课诊断",
  "diag.subtitle": "先确认一下你现在的水平",
  "diag.subtitleHint": "助教会按你的起点讲解这一讲——不会从你已经会的地方讲起。",
  "diag.progress": "{index} / {total}",
  "diag.background": "背景摸底",
  "diag.skip": "跳过，按默认难度开始",
  "diag.defaultStart": "按默认难度开始",
  "diag.bilingual": "需要中英双语辅助解释",
  "diag.bilingualYes": "是，请在中英之间对照讲解",
  "diag.bilingualNo": "不用，用中文讲就好",
  "diag.close": "关闭",
  "diag.retest": "重新诊断本集",
  "diag.adapted": "已适配：{label}",

  // ── 学完闭环 ──
  "done.stepQuiz": "本课随堂测试",
  "done.stepSummary": "本课核心总结",
  "done.stepCelebrate": "达成庆祝",
  "done.stepAdvance": "继续推进",
  "done.submit": "提交并查看解析",
  "done.saveNote": "存入我的笔记",
  "done.saved": "已存入笔记",
  "done.continue": "继续下一课 →",
  "done.certificate": "🎓 领取本册修习证书",
  "done.completed": "本课已完成",
  "done.progressLine": "当前系列进度 {done} / {total} 课（{percent}%）",
  "done.explanation": "解析",

  // ── 证书 ──
  "cert.title": "K12 同步修习证书",
  "cert.serial": "证书编号",
  "cert.issued": "颁发日期",
  "cert.lessons": "完成课时",
  "cert.mastery": "掌握度",
  "cert.learner": "学员",
  "cert.course": "课程",
  "cert.download": "下载证书",
  "cert.copySerial": "复制编号",
  "cert.copied": "已复制",
  "cert.wall": "我的证书墙",
  "cert.empty": "还没有拿到结业证书",

  // ── 学情中心 ──
  "progress.title": "学情与进度中心",
  "progress.k12Section": "K12 年级同步系列",
  "progress.gradesLearned": "在学年级",
  "progress.lessonsDone": "完成课时",
  "progress.avgMastery": "平均掌握度",
  "progress.quizAccuracy": "测验正确率",
  "progress.notes": "笔记条数",
  "progress.certificates": "K12 证书",
  "progress.empty": "还没有可统计的学习数据",
  "progress.goCourses": "去课程列表",

  // ── AI 助教 ──
  "ai.online": "在线",
  "ai.placeholder": "问我一个具体概念，或点上方「知识向导」的提问灵感。",
  "ai.socratic": "苏格拉底追问",
  "ai.logic": "帮我梳理逻辑",
  "ai.plain": "用大白话讲一遍",
  "ai.example": "举个例子",
  "ai.challenge": "挑刺",
  "ai.retell": "复述一遍",
  "ai.guide": "知识向导",
  "ai.diagnostic": "进课诊断",
  "ai.diagnosticHint": "先确认一下你现在的水平",
  "ai.send": "发送",
  "ai.thinking": "正在思考…",

  // ── 个人中心 ──
  "profile.title": "个人中心",
  "profile.nickname": "昵称",
  "profile.avatar": "头像",
  "profile.region": "所在地区",
  "profile.timezone": "时区",
  "profile.locale": "语言偏好",
  "profile.goal": "个人学习目标",
  "profile.grade": "当前年级 / 年龄",
  "profile.gradeHint": "选定年级后，课程页会直接聚焦你的年级。",
  "profile.aiTitle": "AI 助教",
  "profile.aiProxyReady": "平台代理已就绪",
  "profile.aiProxyReadyHint": "直接提问即可，无需配置任何 Key。",
  "profile.aiProxyMissing": "当前站点未配置 AI 转发服务。",
  "profile.advanced": "高级设置：使用我自己的 API Key（可选）",
  "profile.saveKey": "保存 Key",
  "profile.clearKey": "清除",
  "profile.keySaved": "已保存到本机浏览器",
  "profile.keyCleared": "已清除",
  "profile.archive": "我的学习档案",
  "profile.archiveHint": "一键导出全部学习痕迹——资料、笔记、观看进度与已获证书。",
  "profile.exportArchive": "导出我的学习档案",
  "profile.importArchive": "导入学习档案",
  "profile.autoSave": "资料自动保存",
  "profile.saving": "保存中…",
  "profile.localImage": "本地",
  "profile.avatarLink": "或粘贴图片链接",

  // ── 通用 ──
  "common.learner": "学习者",
  "common.loading": "正在加载…",
  "common.notFound": "页面不存在",
  "common.close": "关闭",
};

/** 繁体中文。 */
export const zhTW: Dictionary = {
  "nav.home": "首頁",
  "nav.courses": "課程",
  "nav.plan": "計畫",
  "nav.progress": "學情中心",
  "nav.ask": "提問",
  "nav.skills": "能力庫",
  "nav.settings": "設定",

  "action.back": "返回",
  "action.search": "搜尋",
  "action.all": "全部",
  "action.cancel": "取消",
  "action.confirm": "確定",
  "action.skip": "跳過",
  "action.save": "儲存",
  "action.reset": "重設",
  "action.retry": "重試",
  "action.close": "關閉",
  "action.export": "匯出",
  "action.import": "匯入",
  "action.download": "下載",
  "action.share": "分享",
  "action.copy": "複製",
  "action.edit": "修改",
  "action.viewAll": "查看全部",
  "action.continue": "繼續",

  "k12.title": "國內 K12 語文 · 數學年級同步系列",
  "k12.currentGrade": "目前年級",
  "k12.allGrades": "查看全部年級",
  "k12.subjectAll": "全部",
  "k12.subjectChinese": "語文",
  "k12.subjectMath": "數學",
  "k12.searchPlaceholder": "搜課程 / 教材 / 老師",
  "k12.stagePrimary": "小學部",
  "k12.stageJunior": "國中部",
  "k12.stageSenior": "高中部",
  "k12.loading": "正在載入 K12 課程…",
  "k12.loadFailed": "課程目錄暫時載入失敗",
  "k12.noResult": "沒有符合條件的課程",
  "k12.tryOther": "換個年級或學科試試。",
  "k12.lessons": "課時",
  "k12.series": "套",
  "k12.ageSuffix": "歲",
  "k12.pickGrade": "先選你的年級",
  "k12.pickGradeHint": "我們會按年級推薦對應的語文與數學同步課。",

  "onboard.title": "歡迎來到 OE 夢想課堂",
  "onboard.subtitle": "一步選好語言與年級，我們立刻為你準備對應的同步課。",
  "onboard.stepLanguage": "選擇語言",
  "onboard.stepGrade": "選擇年級與年齡",
  "onboard.start": "開始學習",
  "onboard.skip": "稍後再說",
  "onboard.gradeLabel": "目前學段與年級",

  "course.directory": "課程目錄",
  "course.overview": "總體進度",
  "course.episodes": "分集目錄",
  "course.startFirst": "開始第 1 講",
  "course.notStarted": "未開始",
  "course.inProgress": "學習中",
  "course.done": "已完成",
  "course.lessonOf": "第 {index} / {total} 講",
  "course.backToDirectory": "返回課程目錄",

  "episode.learn": "學完本集 · 進入檢測",
  "episode.nodes": "知識節點",
  "episode.segments": "段落導讀",
  "episode.captions": "完整字幕",
  "episode.prev": "上一講",
  "episode.next": "下一講",
  "episode.loading": "正在載入這一講…",
  "episode.notFound": "找不到這一講",
  "episode.playLab": "✨ 動手玩動畫",

  "lab.title": "互動動畫實驗室",
  "lab.hint": "拖一拖、點一點——把這一課的核心概念玩明白。",
  "lab.hanziTitle": "筆順描紅",
  "lab.hanziHint": "看筆順動畫，然後跟著在螢幕上寫一遍。",
  "lab.playStroke": "播放筆順",
  "lab.quizStroke": "跟我寫",
  "lab.readAloud": "朗讀",
  "lab.poemTitle": "分句圖解",
  "lab.poemHint": "點高亮的詞句，看它的白話意思與雙語提示。",
  "lab.mathTitle": "數學動畫",
  "lab.mathHint": "拖動滑桿或方塊，看看這個概念怎麼動起來。",
  "lab.blocksTitle": "湊十 · 方塊拼接",
  "lab.blocksHint": "把方塊拖到十格框裡，看看怎麼湊成一個整十。",
  "lab.fractionTitle": "分數 · 披薩切分",
  "lab.fractionHint": "改變切割份數，看看分數怎麼變。",
  "lab.symmetryTitle": "對稱 · 平移互動板",
  "lab.symmetryHint": "拖動圖形，找出它和鏡像完全重合的位置。",
  "lab.functionTitle": "函數圖像動態",
  "lab.functionHint": "拖動滑桿，看一次函數和二次函數的圖像怎麼變。",
  "lab.geometryTitle": "動態幾何",
  "lab.geometryHint": "拖動頂點，看角度和面積怎麼變。",
  "lab.play": "開始玩",
  "lab.reset": "重設",
  "lab.correct": "對啦！",
  "lab.tryAgain": "再試一次",
  "lab.pinyin": "拼音",
  "lab.radical": "偏旁",

  "diag.title": "進課診斷",
  "diag.subtitle": "先確認一下你現在的水平",
  "diag.subtitleHint": "助教會按你的起點講解這一講——不會從你已經會的地方講起。",
  "diag.progress": "{index} / {total}",
  "diag.background": "背景摸底",
  "diag.skip": "跳過，按預設難度開始",
  "diag.defaultStart": "按預設難度開始",
  "diag.bilingual": "需要中英雙語輔助解釋",
  "diag.bilingualYes": "是，請在中英之間對照講解",
  "diag.bilingualNo": "不用，用中文講就好",
  "diag.close": "關閉",
  "diag.retest": "重新診斷本集",
  "diag.adapted": "已適配：{label}",

  "done.stepQuiz": "本課隨堂測試",
  "done.stepSummary": "本課核心總結",
  "done.stepCelebrate": "達成慶祝",
  "done.stepAdvance": "繼續推進",
  "done.submit": "提交並查看解析",
  "done.saveNote": "存入我的筆記",
  "done.saved": "已存入筆記",
  "done.continue": "繼續下一課 →",
  "done.certificate": "🎓 領取本冊修習證書",
  "done.completed": "本課已完成",
  "done.progressLine": "目前系列進度 {done} / {total} 課（{percent}%）",
  "done.explanation": "解析",

  "cert.title": "K12 同步修習證書",
  "cert.serial": "證書編號",
  "cert.issued": "頒發日期",
  "cert.lessons": "完成課時",
  "cert.mastery": "掌握度",
  "cert.learner": "學員",
  "cert.course": "課程",
  "cert.download": "下載證書",
  "cert.copySerial": "複製編號",
  "cert.copied": "已複製",
  "cert.wall": "我的證書牆",
  "cert.empty": "還沒有拿到結業證書",

  "progress.title": "學情與進度中心",
  "progress.k12Section": "K12 年級同步系列",
  "progress.gradesLearned": "在學年級",
  "progress.lessonsDone": "完成課時",
  "progress.avgMastery": "平均掌握度",
  "progress.quizAccuracy": "測驗正確率",
  "progress.notes": "筆記條數",
  "progress.certificates": "K12 證書",
  "progress.empty": "還沒有可統計的學習數據",
  "progress.goCourses": "去課程列表",

  "ai.online": "線上",
  "ai.placeholder": "問我一個具體概念，或點上方「知識向導」的提問靈感。",
  "ai.socratic": "蘇格拉底追問",
  "ai.logic": "幫我梳理邏輯",
  "ai.plain": "用大白話講一遍",
  "ai.example": "舉個例子",
  "ai.challenge": "挑刺",
  "ai.retell": "複述一遍",
  "ai.guide": "知識向導",
  "ai.diagnostic": "進課診斷",
  "ai.diagnosticHint": "先確認一下你現在的水平",
  "ai.send": "發送",
  "ai.thinking": "正在思考…",

  "profile.title": "個人中心",
  "profile.nickname": "暱稱",
  "profile.avatar": "頭像",
  "profile.region": "所在地區",
  "profile.timezone": "時區",
  "profile.locale": "語言偏好",
  "profile.goal": "個人學習目標",
  "profile.grade": "目前年級 / 年齡",
  "profile.gradeHint": "選定年級後，課程頁會直接聚焦你的年級。",
  "profile.aiTitle": "AI 助教",
  "profile.aiProxyReady": "平台代理已就緒",
  "profile.aiProxyReadyHint": "直接提問即可，無需設定任何 Key。",
  "profile.aiProxyMissing": "目前站點未設定 AI 轉發服務。",
  "profile.advanced": "進階設定：使用我自己的 API Key（可選）",
  "profile.saveKey": "儲存 Key",
  "profile.clearKey": "清除",
  "profile.keySaved": "已儲存到本機瀏覽器",
  "profile.keyCleared": "已清除",
  "profile.archive": "我的學習檔案",
  "profile.archiveHint": "一鍵匯出全部學習痕跡——資料、筆記、觀看進度與已獲證書。",
  "profile.exportArchive": "匯出我的學習檔案",
  "profile.importArchive": "匯入學習檔案",
  "profile.autoSave": "資料自動儲存",
  "profile.saving": "儲存中…",
  "profile.localImage": "本地",
  "profile.avatarLink": "或貼上圖片連結",

  "common.learner": "學習者",
  "common.loading": "正在載入…",
  "common.notFound": "頁面不存在",
  "common.close": "關閉",
};

/** 英文。 */
export const en: Dictionary = {
  "nav.home": "Home",
  "nav.courses": "Courses",
  "nav.plan": "Plan",
  "nav.progress": "Learning Center",
  "nav.ask": "Ask",
  "nav.skills": "Skills",
  "nav.settings": "Settings",

  "action.back": "Back",
  "action.search": "Search",
  "action.all": "All",
  "action.cancel": "Cancel",
  "action.confirm": "Confirm",
  "action.skip": "Skip",
  "action.save": "Save",
  "action.reset": "Reset",
  "action.retry": "Retry",
  "action.close": "Close",
  "action.export": "Export",
  "action.import": "Import",
  "action.download": "Download",
  "action.share": "Share",
  "action.copy": "Copy",
  "action.edit": "Edit",
  "action.viewAll": "View All",
  "action.continue": "Continue",

  "k12.title": "Chinese & Math Grade-Synced Series (K12)",
  "k12.currentGrade": "Current grade",
  "k12.allGrades": "View all grades",
  "k12.subjectAll": "All",
  "k12.subjectChinese": "Chinese",
  "k12.subjectMath": "Math",
  "k12.searchPlaceholder": "Search courses / textbooks / teachers",
  "k12.stagePrimary": "Primary",
  "k12.stageJunior": "Junior High",
  "k12.stageSenior": "Senior High",
  "k12.loading": "Loading K12 courses…",
  "k12.loadFailed": "Could not load the course catalog",
  "k12.noResult": "No matching courses",
  "k12.tryOther": "Try a different grade or subject.",
  "k12.lessons": "lessons",
  "k12.series": "series",
  "k12.ageSuffix": "yrs",
  "k12.pickGrade": "Pick your grade first",
  "k12.pickGradeHint": "We'll recommend the matching Chinese and Math series.",

  "onboard.title": "Welcome to OE Dream Classroom",
  "onboard.subtitle": "Choose your language and grade — we'll prepare the right courses instantly.",
  "onboard.stepLanguage": "Choose language",
  "onboard.stepGrade": "Choose grade & age",
  "onboard.start": "Start learning",
  "onboard.skip": "Maybe later",
  "onboard.gradeLabel": "Stage & grade",

  "course.directory": "Course Directory",
  "course.overview": "Overall progress",
  "course.episodes": "Episode list",
  "course.startFirst": "Start Episode 1",
  "course.notStarted": "Not started",
  "course.inProgress": "In progress",
  "course.done": "Completed",
  "course.lessonOf": "Episode {index} / {total}",
  "course.backToDirectory": "Back to directory",

  "episode.learn": "Finish this episode · Start check",
  "episode.nodes": "Key Concepts",
  "episode.segments": "Segment Guide",
  "episode.captions": "Full Transcript",
  "episode.prev": "Previous",
  "episode.next": "Next",
  "episode.loading": "Loading this episode…",
  "episode.notFound": "Episode not found",
  "episode.playLab": "✨ Play the animation",

  "lab.title": "Interactive Animation Lab",
  "lab.hint": "Drag, tap, play — grasp the core concept by doing it.",
  "lab.hanziTitle": "Stroke Order",
  "lab.hanziHint": "Watch the stroke animation, then trace it on screen.",
  "lab.playStroke": "Play strokes",
  "lab.quizStroke": "Trace with me",
  "lab.readAloud": "Read aloud",
  "lab.poemTitle": "Line-by-Line Illustration",
  "lab.poemHint": "Tap a highlighted phrase for plain-language and bilingual notes.",
  "lab.mathTitle": "Math Animation",
  "lab.mathHint": "Drag the slider or blocks and watch the idea move.",
  "lab.blocksTitle": "Make Ten · Block Sums",
  "lab.blocksHint": "Drag blocks into the ten-frame and see how they make a ten.",
  "lab.fractionTitle": "Fractions · Sliced Pizza",
  "lab.fractionHint": "Change the number of slices and watch the fraction change.",
  "lab.symmetryTitle": "Symmetry · Translation Board",
  "lab.symmetryHint": "Drag the shape to find where it exactly overlaps its mirror.",
  "lab.functionTitle": "Live Function Graphs",
  "lab.functionHint": "Drag the slider to see linear and quadratic graphs change.",
  "lab.geometryTitle": "Dynamic Geometry",
  "lab.geometryHint": "Drag the vertices and watch angles and area change.",
  "lab.play": "Play",
  "lab.reset": "Reset",
  "lab.correct": "Correct!",
  "lab.tryAgain": "Try again",
  "lab.pinyin": "Pinyin",
  "lab.radical": "Radical",

  "diag.title": "Entry Diagnostic",
  "diag.subtitle": "Let's confirm where you're starting from",
  "diag.subtitleHint": "The tutor adapts depth to your level — it won't skip what you already know.",
  "diag.progress": "{index} / {total}",
  "diag.background": "Background check",
  "diag.skip": "Skip, start at default level",
  "diag.defaultStart": "Start at default level",
  "diag.bilingual": "Would you like bilingual Chinese–English explanations?",
  "diag.bilingualYes": "Yes, explain side by side in Chinese and English",
  "diag.bilingualNo": "No, Chinese is fine",
  "diag.close": "Close",
  "diag.retest": "Re-test this episode",
  "diag.adapted": "Adapted: {label}",

  "done.stepQuiz": "Quick Check",
  "done.stepSummary": "Key Takeaways",
  "done.stepCelebrate": "Milestone",
  "done.stepAdvance": "Keep Going",
  "done.submit": "Submit & see explanations",
  "done.saveNote": "Save to my notes",
  "done.saved": "Saved to notes",
  "done.continue": "Continue to next →",
  "done.certificate": "🎓 Claim this volume's certificate",
  "done.completed": "Episode completed",
  "done.progressLine": "Series progress {done} / {total} ({percent}%)",
  "done.explanation": "Explanation",

  "cert.title": "K12 Synced Study Certificate",
  "cert.serial": "Certificate No.",
  "cert.issued": "Issued",
  "cert.lessons": "Lessons completed",
  "cert.mastery": "Mastery",
  "cert.learner": "Learner",
  "cert.course": "Course",
  "cert.download": "Download",
  "cert.copySerial": "Copy No.",
  "cert.copied": "Copied",
  "cert.wall": "Certificate Wall",
  "cert.empty": "No certificates yet",

  "progress.title": "Learning & Progress Center",
  "progress.k12Section": "K12 Grade-Synced Series",
  "progress.gradesLearned": "Grades in progress",
  "progress.lessonsDone": "Lessons done",
  "progress.avgMastery": "Avg mastery",
  "progress.quizAccuracy": "Quiz accuracy",
  "progress.notes": "Notes",
  "progress.certificates": "K12 certificates",
  "progress.empty": "No learning data yet",
  "progress.goCourses": "Browse courses",

  "ai.online": "Online",
  "ai.placeholder": "Ask me about a specific concept, or tap a prompt above.",
  "ai.socratic": "Socratic",
  "ai.logic": "Walk me through",
  "ai.plain": "Plain language",
  "ai.example": "Give me an example",
  "ai.challenge": "Push back",
  "ai.retell": "Restate it",
  "ai.guide": "Study Guide",
  "ai.diagnostic": "Entry Diagnostic",
  "ai.diagnosticHint": "Confirm your starting level",
  "ai.send": "Send",
  "ai.thinking": "Thinking…",

  "profile.title": "Profile",
  "profile.nickname": "Nickname",
  "profile.avatar": "Avatar",
  "profile.region": "Region",
  "profile.timezone": "Timezone",
  "profile.locale": "Language",
  "profile.goal": "Learning goal",
  "profile.grade": "Current grade / age",
  "profile.gradeHint": "Once set, the course page focuses on your grade.",
  "profile.aiTitle": "AI Tutor",
  "profile.aiProxyReady": "Platform proxy ready",
  "profile.aiProxyReadyHint": "Just ask — no API key needed.",
  "profile.aiProxyMissing": "No AI relay configured on this site yet.",
  "profile.advanced": "Advanced: use my own API key (optional)",
  "profile.saveKey": "Save key",
  "profile.clearKey": "Clear",
  "profile.keySaved": "Saved in this browser",
  "profile.keyCleared": "Cleared",
  "profile.archive": "My learning archive",
  "profile.archiveHint": "Export everything — profile, notes, progress and certificates.",
  "profile.exportArchive": "Export my archive",
  "profile.importArchive": "Import archive",
  "profile.autoSave": "Auto-saved",
  "profile.saving": "Saving…",
  "profile.localImage": "Local",
  "profile.avatarLink": "or paste an image URL",

  "common.learner": "Learner",
  "common.loading": "Loading…",
  "common.notFound": "Page not found",
  "common.close": "Close",
};

/** 每种语言的完整字典。 */
export const DICTIONARIES: Record<Locale, Dictionary> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en,
};

/**
 * 取一条文案。
 *
 * @param key      字典 key（如 ``nav.courses``）
 * @param locale   当前语言
 * @param vars     变量插值（``{name}`` 形式）
 * @returns 翻译后的文案；找不到 key 时返回 key 本身（不静默显示错语言）
 */
export function translateKey(
  key: string,
  locale: Locale,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] ?? zhCN;
  let text = dict[key];

  // fallback 到简中，再 fallback 到 key 本身。
  if (text === undefined) text = zhCN[key];
  if (text === undefined) text = key;

  if (!vars) return text;

  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * 判断一个 key 是否在字典里。
 *
 * 给开发期的测试用——生产环境不应该有缺失的 key。
 */
export function hasKey(key: string, locale: Locale = "zh-CN"): boolean {
  return DICTIONARIES[locale]?.[key] !== undefined;
}

/**
 * 检查某个语言的字典是否**完整**（每个 key 都有值）。
 *
 * @returns 缺失的 key 列表；空数组 = 完整
 */
export function missingKeys(locale: Locale): string[] {
  const dict = DICTIONARIES[locale] ?? {};
  return Object.keys(zhCN).filter((key) => dict[key] === undefined);
}

/** 字典里一共有多少个 key。 */
export const DICTIONARY_SIZE = Object.keys(zhCN).length;
