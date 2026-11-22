/**
 * K12 数据模型与客户端
 * =====================
 *
 * 纯静态模式（GitHub Pages）下，K12 课程数据从 ``/data/k12/*.json`` 读。
 *
 * 分片策略
 * --------
 *
 * ================================  ====================================
 * 文件                              内容
 * ================================  ====================================
 * ``k12-index.json``              极轻量目录索引——年级、标题、集数
 * ``courses/k12_<id>.json``        单套系列的详情（含全部分集）
 * ================================  ====================================
 *
 * 为什么分片
 * ----------
 *
 * 1.5 千集的完整数据如果塞进一个 JSON，首页要下载**好几 MB**——
 * 在校园网 / 弱网环境下首屏要等十几秒。这就是「反应慢」的
 * 真正来源。
 *
 * 分片之后，首页只拉几十 KB 的索引；点进哪套课才拉那套课的数据。
 */

/** 学段。 */
export type K12Stage = "primary" | "junior" | "senior";

/** 学科。 */
export type K12Subject = "chinese" | "math";

/** 年级元信息。 */
export interface K12Grade {
  number: number;
  name: string;
  alias: string;
  ageRange: [number, number];
  stage: K12Stage;
}

/** 学科元信息。 */
export interface K12SubjectMeta {
  id: K12Subject;
  name: string;
  enName: string;
  edition: string;
  editionEn: string;
}

/** 一集。 */
export interface K12Episode {
  ep_id: string;
  title: string;
  index: number;
  total: number;
  video_url: string;
  bvid: string;
  page: number | null;
  youtube_id: string;
  duration: number;
  start_time: number;
  end_time: number | null;
  key_concepts: string[];
  origin: string;
}

/** 一套系列的**索引条目**（轻量）。 */
export interface K12SeriesIndexEntry {
  id: string;
  /** 完整课程名（证书上用的那种）。 */
  title: string;
  /** 短名（「小学四年级数学」）。 */
  shortTitle: string;
  grade: number;
  subject: K12Subject;
  stage: K12Stage;
  ageRange: [number, number];
  edition: string;
  volumes: string[];
  episodeCount: number;
  provider: string;
  author: string;
  /** 封面。 */
  pic: string;
  /** 信源主页（B 站 / YouTube 的课程地址）。 */
  sourceUrl: string;
  /** 详情文件路径。 */
  detailPath: string;
}

/** 索引条目——简写别名。 */
export type K12IndexEntry = K12SeriesIndexEntry;

/** 索引文件。 */
export interface K12Index {
  id: string;
  title: string;
  updated_at: string;
  grades: K12Grade[];
  subjects: K12SubjectMeta[];
  /** 全部系列的轻量条目。 */
  series: K12SeriesIndexEntry[];
  /** 汇总。 */
  summary: {
    seriesCount: number;
    episodeCount: number;
    gradeCount: number;
  };
}

/** 一套系列的**详情**。 */
export interface K12SeriesDetail {
  id: string;
  title: string;
  shortTitle: string;
  grade: number;
  subject: K12Subject;
  stage: K12Stage;
  ageRange: [number, number];
  edition: string;
  volumes: string[];
  source: {
    provider: string;
    origin: string;
    url: string;
    bvid: string;
    youtube_id: string;
    author: string;
    pic: string;
    total_duration: number;
  };
  episodes: K12Episode[];
}

/** 学段 → 中文名。 */
export const STAGE_NAMES: Record<K12Stage, string> = {
  primary: "小学部",
  junior: "初中部",
  senior: "高中部",
};

/** 学段 → 英文名。 */
export const STAGE_EN_NAMES: Record<K12Stage, string> = {
  primary: "Primary",
  junior: "Junior High",
  senior: "Senior High",
};

/**
 * 学段是否是「小学」——决定动效风格。
 *
 * 小学 = 圆润、Q 弹、伴学小星；初高中 = 利落、冷静、学术感。
 */
export function isPlayfulStage(stage: K12Stage): boolean {
  return stage === "primary";
}

/** 年级 + 年龄的展示标签。 */
export function gradeLabel(grade: K12Grade): string {
  return `${grade.name}（${grade.ageRange[0]}–${grade.ageRange[1]}岁）`;
}
