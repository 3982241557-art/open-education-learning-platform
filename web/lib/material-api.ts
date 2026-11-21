import { apiFetch, apiUrl, asJsonOrThrow } from "@/shared/api/client";
import type { Course } from "@/lib/courses-api";

/**
 * 自定义教材导入的前端客户端。
 *
 * 对应后端 `POST /api/courses/import`——把一段长文本解析成结构化课程。
 */

/** 导入结果。 */
export interface ImportResult {
  id: string;
  title: string;
  page_count: number;
  chapter_count: number;
}

export async function importMaterial(params: {
  title: string;
  text: string;
}): Promise<ImportResult> {
  const response = await apiFetch(apiUrl("/api/courses/import"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await asJsonOrThrow(response);
  return {
    id: String(data?.id ?? ""),
    title: String(data?.title ?? params.title),
    page_count: Number(data?.page_count ?? 0),
    chapter_count: Number(data?.chapter_count ?? 0),
  };
}

/** 读一门刚导入的课程（用于确认它已经就位）。 */
export async function fetchImportedCourse(courseId: string): Promise<Course | null> {
  const { getCourse } = await import("@/lib/courses-api");
  try {
    return await getCourse(courseId);
  } catch {
    return null;
  }
}
