import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
} from "@/shared/api/client";
import { readLocal, writeLocal, StorageKeys } from "@/lib/local-store";

/**
 * 证书与掌握度的前端数据客户端。
 *
 * 数据来自后端的 ``/api/progress``——证书系统与技能树。
 */

/** 一张结业证书。 */
export interface Certificate {
  id: string;
  /** 唯一编号——``DC-SZHH-2026-A3F7``。 */
  number: string;
  course_id: string;
  course_title: string;
  course_title_en: string;
  category: string;
  learner_name: string;
  /** 颁发时间（Unix 秒）。 */
  issued_at: number;
  /** 完成时间（Unix 秒）。 */
  completed_at: number;
  /** 学习覆盖率（0–1）。 */
  coverage: number;
  /** 随堂检测正确率（0–1）。 */
  quiz_accuracy: number;
  note_count: number;
  ask_count: number;
  watched_resources: number;
  total_resources: number;
  /** 内容指纹——用于验证真伪。 */
  fingerprint: string;
  /** 学员姓名是否已锁定。 */
  name_locked: boolean;
  /** ``active`` / ``revoked``。 */
  status: string;
}

/** 证书墙。 */
export async function fetchCertificates(): Promise<Certificate[]> {
  // ── 静态模式 ──
  //
  // 证书存在 localStorage 里。
  //
  // 说清楚一点：静态版的证书**没有签名校验**——它只是一个本地记录。
  // 这跟后端版的「指纹校验」不是一回事。界面上会说明这一点。
  if (await isStaticRuntime()) {
    return readLocal<Certificate[]>(StorageKeys.certificates, []);
  }

  const response = await apiFetch(apiUrl("/api/progress/certificates"), {
    cache: "no-store",
  });
  const data = await asJsonOrThrow(response);
  return Array.isArray(data?.certificates) ? data.certificates : [];
}

/** 单张证书。 */
export async function fetchCertificate(
  certificateId: string,
): Promise<Certificate | null> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const all = readLocal<Certificate[]>(StorageKeys.certificates, []);
    return all.find((item) => item.id === certificateId) ?? null;
  }

  try {
    const response = await apiFetch(
      apiUrl(`/api/progress/certificates/${encodeURIComponent(certificateId)}`),
      { cache: "no-store" },
    );
    return await asJsonOrThrow(response);
  } catch {
    return null;
  }
}

/** 验证证书真伪。 */
export async function verifyCertificate(certificateId: string): Promise<{
  valid: boolean;
  reason: string;
  certificate: Certificate | null;
}> {
  // ── 静态模式 ──
  //
  // 只能验证「本地有没有这张证书」——**没有**密码学校验。
  // 理由要说清楚，不能假装验过了。
  if (await isStaticRuntime()) {
    const all = readLocal<Certificate[]>(StorageKeys.certificates, []);
    const certificate = all.find((item) => item.id === certificateId) ?? null;
    return {
      valid: Boolean(certificate),
      reason: certificate
        ? "本机记录中存在这张证书。纯静态版本没有服务端指纹校验，此结果仅代表本机存档。"
        : "本机记录中没有这张证书。纯静态版本的证书只存在于当前浏览器。",
      certificate,
    };
  }

  const response = await apiFetch(
    apiUrl(
      `/api/progress/certificates/${encodeURIComponent(certificateId)}/verify`,
    ),
    { cache: "no-store" },
  );
  return await asJsonOrThrow(response);
}

/** 修改证书上的学员姓名。 */
export async function updateCertificateName(
  certificateId: string,
  learnerName: string,
): Promise<Certificate> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const all = readLocal<Certificate[]>(StorageKeys.certificates, []);
    const certificate = all.find((item) => item.id === certificateId);
    if (!certificate) throw new Error("证书不存在。");
    certificate.learner_name = learnerName;
    certificate.name_locked = true;
    writeLocal(StorageKeys.certificates, all);
    return certificate;
  }

  const response = await apiFetch(
    apiUrl(`/api/progress/certificates/${encodeURIComponent(certificateId)}/name`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learner_name: learnerName }),
    },
  );
  return await asJsonOrThrow(response);
}

/** 颁发一张证书。 */
export async function issueCertificate(payload: {
  course_id: string;
  course_title: string;
  course_title_en?: string;
  category?: string;
  learner_name?: string;
  coverage: number;
  quiz_accuracy: number;
  note_count?: number;
  ask_count?: number;
  watched_resources?: number;
  total_resources?: number;
}): Promise<Certificate> {
  // ── 静态模式 ──
  //
  // 本地生成一张证书。指纹用浏览器的 ``crypto.randomUUID`` 派生——
  // 它**不是**密码学签名，只是本地唯一标识。
  if (await isStaticRuntime()) {
    const all = readLocal<Certificate[]>(StorageKeys.certificates, []);
    const id = `cert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const certificate: Certificate = {
      id,
      course_id: payload.course_id,
      number: id,
      course_title: payload.course_title,
      course_title_en: payload.course_title_en ?? "",
      category: payload.category ?? "",
      learner_name: payload.learner_name ?? "",
      issued_at: Date.now(),
      completed_at: Date.now(),
      coverage: payload.coverage,
      quiz_accuracy: payload.quiz_accuracy,
      note_count: payload.note_count ?? 0,
      ask_count: payload.ask_count ?? 0,
      total_resources: payload.total_resources ?? 0,
      watched_resources: payload.watched_resources ?? 0,
      fingerprint: id,
      name_locked: Boolean(payload.learner_name),
      status: "active",
    };
    writeLocal(StorageKeys.certificates, [...all, certificate]);
    return certificate;
  }

  const response = await apiFetch(apiUrl("/api/progress/certificates/issue"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await asJsonOrThrow(response);
}

/** 证书的领取条件。 */
export interface Eligibility {
  /** 够不够格发证书。 */
  eligible: boolean;
  /** 哪些条件没达到。 */
  reasons: string[];
  /** 每条要求的完成情况。 */
  requirements: Array<{
    key: string;
    label: string;
    current: number | null;
    target: number;
    met: boolean;
    display: string;
  }>;
  watched_resources: number;
  total_resources: number;
}

/** 查某门课的证书领取条件。 */
export async function fetchEligibility(
  courseId: string,
): Promise<Eligibility> {
  const response = await apiFetch(
    apiUrl(
      `/api/progress/eligibility?course_id=${encodeURIComponent(courseId)}`,
    ),
    { cache: "no-store" },
  );
  return await asJsonOrThrow(response);
}

/* ── 技能树 / 学习阶梯 ─────────────────────────────────────────────── */

/** 一个技能节点。 */
export interface SkillNode {
  key: string;
  resource_id: string;
  timestamp: number;
  title: string;
  hint: string;
  context: string;
  accuracy: number | null;
  correct_count: number;
  question_count: number;
  /** ``未开始`` / ``学习中`` / ``已达标``。 */
  status: string;
  /** 所属层级 id。 */
  tier: string;
  tier_name: string;
  order: number;
}

/** 学习阶梯的一层。 */
export interface MasteryLayer {
  id: string;
  name: string;
  en: string;
  blurb: string;
  order: number;
  nodes: SkillNode[];
  node_count: number;
  met_count: number;
  coverage: number;
  /** 是否被上一层锁住。 */
  locked: boolean;
  unlock_reason: string;
  all_met: boolean;
}

/** 学习阶梯。 */
export interface LearningPath {
  course_id: string;
  layers: MasteryLayer[];
  node_count: number;
  met_count: number;
  started_count: number;
  /** 掌握度（0–1）——达标节点占比。 */
  mastery: number;
  /** 进度（0–1）——已开始节点占比。 */
  progress: number;
  threshold: number;
  status: string;
}

/** 拉取学习阶梯。 */
export async function fetchLearningPath(
  courseId: string,
): Promise<LearningPath | null> {
  try {
    const response = await apiFetch(
      apiUrl(`/api/progress/mastery?course_id=${encodeURIComponent(courseId)}`),
      { cache: "no-store" },
    );
    return await asJsonOrThrow(response);
  } catch {
    return null;
  }
}

/** 一道随堂检测题。 */
export interface MasteryQuestion {
  question: string;
  options: string[];
  /** 正确选项下标。 */
  answer: number;
  explanation: string;
}

/** 为某个节点生成随堂检测题。 */
export async function generateQuiz(payload: {
  course_id: string;
  resource_id: string;
  node_key: string;
  title: string;
  context?: string;
  hint?: string;
  count?: number;
}): Promise<{ questions: MasteryQuestion[] }> {
  const response = await apiFetch(apiUrl("/api/progress/quiz/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await asJsonOrThrow(response);
}

/** 提交随堂检测作答。 */
export async function submitQuiz(payload: {
  course_id: string;
  node_key: string;
  resource_id: string;
  title?: string;
  questions: MasteryQuestion[];
  answers: Array<{ index: number; correct: boolean }>;
}): Promise<{
  accuracy: number;
  passed: boolean;
  correct_count: number;
  question_count: number;
}> {
  const response = await apiFetch(apiUrl("/api/progress/quiz"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await asJsonOrThrow(response);
}
