/**
 * Skill 的前端数据客户端。
 *
 * 复刻自 DeepTutor 的 ``lib/skills-api.ts``：同一组 CRUD，字段形状一致
 * （``name`` / ``description`` / ``tags`` / ``source`` / ``read_only``）。
 *
 * 唯一的删减：不带 EduHub 外部 hub 的浏览与安装——空壳版本只做本地加载。
 */

import { fetchManifest } from "@/lib/static-data";
import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
  staticFetchText,
} from "@/shared/api/client";

export type SkillSource = "user" | "builtin" | "admin";

export interface SkillInfo {
  name: string;
  description: string;
  tags: string[];
  source?: SkillSource;
  read_only?: boolean;
}

export interface SkillDetail extends SkillInfo {
  content: string;
}

export interface CreateSkillPayload {
  name: string;
  description: string;
  content: string;
  tags?: string[];
}

export interface UpdateSkillPayload {
  description?: string;
  content?: string;
  rename_to?: string;
  tags?: string[];
}

function normalizeSource(raw: unknown): SkillSource {
  return raw === "builtin" || raw === "admin" ? raw : "user";
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const tag = String(item ?? "")
      .trim()
      .toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** 当前选中的工作区作用域，作为查询参数传给后端。 */
function skillWorkspace(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("skill_workspace") ?? "";
}

function apiUrlScoped(path: string): string {
  const url = apiUrl(path);
  const scope = skillWorkspace();
  return scope
    ? `${url}${url.includes("?") ? "&" : "?"}skill_workspace=${encodeURIComponent(scope)}`
    : url;
}

/**
 * 静态模式下的技能名清单。
 *
 * 从**构建期生成的索引**里读，而不是硬编码一份名单。
 *
 * 为什么不硬编码
 * --------------
 *
 * 硬编码的名单会跟 ``backend/data/skills/`` 脱节——加了新技能却忘了
 * 改这里，静态版就看不到它。而索引是构建期从真实目录扫出来的，
 * 永远跟数据一致。
 */
async function staticSkillNames(): Promise<string[]> {
  const manifest = await fetchManifest();
  if (!manifest) return [];
  return manifest.entries
    .filter((entry) => entry.key.startsWith("skills/"))
    // 只要**技能正文**——``.tags`` 这类元数据文件不算技能。
    .filter((entry) => entry.path.endsWith("/SKILL.md"))
    // key 形如 ``skills/socrat/SKILL`` → 取技能名 ``socrat``。
    .map((entry) => {
      const parts = entry.key.slice("skills/".length).split("/");
      return parts.length >= 2 ? parts[0] : "";
    })
    .filter(Boolean);
}

export async function listSkills(): Promise<SkillInfo[]> {
  // ── 静态模式 ──
  //
  // 技能库是**随站点发布**的静态内容——每个技能一个目录，目录里是
  // ``SKILL.md``（带 frontmatter 的 Markdown）。
  //
  // 静态模式下**只读**——不能新建 / 修改技能（那要写文件系统）。
  if (await isStaticRuntime()) {
    const items: SkillInfo[] = [];
    for (const name of await staticSkillNames()) {
      const raw = await staticFetchText(
        `/data/skills/${encodeURIComponent(name)}/SKILL.md`,
      );
      if (!raw) continue;
      const parsed = parseSkillMarkdown(String(raw));
      items.push({
        name: parsed.name || name,
        description: parsed.description,
        tags: parsed.tags,
        source: "builtin",
        read_only: true,
      });
    }
    return items;
  }

  const response = await apiFetch(apiUrlScoped("/api/skills/list"), {
    cache: "no-store",
  });
  const data = await asJsonOrThrow(response);
  const items = Array.isArray(data?.skills) ? data.skills : [];
  return items.map((item: any) => ({
    name: String(item?.name ?? ""),
    description: String(item?.description ?? ""),
    tags: normalizeTags(item?.tags),
    source: normalizeSource(item?.source),
    read_only: Boolean(item?.read_only),
  }));
}

/**
 * 解析 ``SKILL.md`` 的 frontmatter + 正文。
 *
 * 格式：
 *
 *     ---
 *     name: socrat
 *     description: ...
 *     tags:
 *     - persona
 *     ---
 *
 *     # 正文…
 */
function parseSkillMarkdown(raw: string): {
  name: string;
  description: string;
  tags: string[];
  content: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    return { name: "", description: "", tags: [], content: raw };
  }

  const front = match[1];
  const content = match[2].trim();

  let name = "";
  let description = "";
  const tags: string[] = [];

  // 逐行解析 frontmatter。够用就好——不引入 yaml 解析器。
  let inTags = false;
  for (const line of front.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "tags:") {
      inTags = true;
      continue;
    }
    if (trimmed.startsWith("- ") && inTags) {
      tags.push(trimmed.slice(2).trim());
      continue;
    }
    inTags = false;
    const keyValue = /^([a-zA-Z_]+):\s*(.*)$/.exec(trimmed);
    if (!keyValue) continue;
    const [, key, value] = keyValue;
    if (key === "name") name = value.trim();
    else if (key === "description") description = value.trim();
  }

  return { name, description, tags, content };
}

export async function getSkill(name: string): Promise<SkillDetail> {
  // ── 静态模式 ──
  if (await isStaticRuntime()) {
    const raw = await staticFetchText(
      `/data/skills/${encodeURIComponent(name)}/SKILL.md`,
    );
    if (!raw) {
      throw new Error(`技能「${name}」不存在。`);
    }
    const parsed = parseSkillMarkdown(String(raw));
    return {
      name: parsed.name || name,
      description: parsed.description,
      content: parsed.content,
      tags: parsed.tags,
      source: "builtin",
      read_only: true,
    };
  }

  const response = await apiFetch(
    apiUrlScoped(`/api/skills/${encodeURIComponent(name)}`),
    { cache: "no-store" },
  );
  const data = await asJsonOrThrow(response);
  return {
    name: String(data?.name ?? name),
    description: String(data?.description ?? ""),
    content: String(data?.content ?? ""),
    tags: normalizeTags(data?.tags),
    source: normalizeSource(data?.source),
    read_only: Boolean(data?.read_only),
  };
}

export async function createSkill(payload: CreateSkillPayload): Promise<SkillInfo> {
  // ── 静态模式 ──
  //
  // 新建 skill 要**写文件系统**——静态站点做不到。
  // 明确报错，别假装成功。
  if (await isStaticRuntime()) {
    throw new Error(
      "纯静态版本无法新建 skill——技能库是随站点一起发布的，只读。" +
        "部署带后端的版本后即可自定义。",
    );
  }

  const response = await apiFetch(apiUrlScoped("/api/skills/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      content: payload.content,
      tags: payload.tags ?? [],
    }),
  });
  const data = await asJsonOrThrow(response);
  return {
    name: String(data?.name ?? payload.name),
    description: String(data?.description ?? payload.description ?? ""),
    tags: normalizeTags(data?.tags ?? payload.tags),
    source: normalizeSource(data?.source),
    read_only: Boolean(data?.read_only),
  };
}

export async function updateSkill(
  name: string,
  payload: UpdateSkillPayload,
): Promise<SkillInfo> {
  const response = await apiFetch(
    apiUrlScoped(`/api/skills/${encodeURIComponent(name)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await asJsonOrThrow(response);
  return {
    name: String(data?.name ?? name),
    description: String(data?.description ?? ""),
    tags: normalizeTags(data?.tags),
    source: normalizeSource(data?.source),
    read_only: Boolean(data?.read_only),
  };
}

export async function deleteSkill(name: string): Promise<void> {
  const response = await apiFetch(apiUrlScoped(`/api/skills/${encodeURIComponent(name)}`), {
    method: "DELETE",
  });
  await asJsonOrThrow(response);
}

export async function listSkillTags(): Promise<string[]> {
  // ── 静态模式 ──
  //
  // 标签是**派生**出来的——从每个技能的 frontmatter 里收集。
  // 技能本身已经随站点发布了，所以标签也能算出来。
  if (await isStaticRuntime()) {
    const items = await listSkills();
    const tags = new Set<string>();
    for (const item of items) {
      for (const tag of item.tags) tags.add(tag);
    }
    return [...tags].sort();
  }

  const response = await apiFetch(apiUrlScoped("/api/skills/tags/list"), {
    cache: "no-store",
  });
  const data = await asJsonOrThrow(response);
  return normalizeTags(data?.tags);
}

export async function createSkillTag(name: string): Promise<string> {
  const response = await apiFetch(apiUrlScoped("/api/skills/tags/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await asJsonOrThrow(response);
  return String(data?.name ?? name);
}

export async function renameSkillTag(oldName: string, newName: string): Promise<string> {
  const response = await apiFetch(
    apiUrlScoped(`/api/skills/tags/${encodeURIComponent(oldName)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rename_to: newName }),
    },
  );
  const data = await asJsonOrThrow(response);
  return String(data?.name ?? newName);
}

export async function deleteSkillTag(name: string): Promise<void> {
  const response = await apiFetch(
    apiUrlScoped(`/api/skills/tags/${encodeURIComponent(name)}`),
    { method: "DELETE" },
  );
  await asJsonOrThrow(response);
}
