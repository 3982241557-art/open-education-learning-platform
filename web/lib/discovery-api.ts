import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
} from "@/shared/api/client";

/**
 * 「全网活水」的前端客户端。
 *
 * 对应后端的三个端点：
 *
 * - ``POST /api/resources/discover`` —— 实时检索 + 现场装配；
 * - ``GET  /api/resources/sync/status`` —— 巡检与覆盖率状态；
 * - ``POST /api/resources/sync`` —— 手动触发一次巡检。
 */

/** 检索装配的进度阶段。 */
export type DiscoveryStage =
  | "search"
  | "ingest"
  | "structure"
  | "done"
  | "error";

/** 一条进度事件。 */
export interface DiscoveryEvent {
  stage: DiscoveryStage;
  message: string;
  /** 只有 ``done`` 阶段才有。 */
  result?: DiscoveryResult;
}

/** 一次检索 + 装配的结果。 */
export interface DiscoveryResult {
  /** 命中的资源 id。 */
  resource_ids: string[];
  /** 命中的资源标题。 */
  titles: string[];
  /** 装配成功的条数。 */
  structured: number;
  /** 装配失败的条数。 */
  failed: number;
  /** 新入库的条数。 */
  added: number;
  /** 已存在（本次只刷新了元数据）的条数。 */
  updated: number;
  /** 失败的详情。 */
  failures: string[];
}

/** 巡检状态。 */
export interface SyncStatus {
  updated_at: string;
  resource_count: number;
  structured_count: number;
  category_count: number;
  last_ingest: Record<string, unknown>;
  youtube_fallback_coverage: {
    total: number;
    with_fallback: number;
    percent: number;
  };
}

/**
 * 实时检索并现场装配新课程（**流式**）。
 *
 * 全程 8~12 秒——装配那一步是大头（每条视频一次大模型调用）。
 * 所以走 SSE 边做边报进度，用户能看见「现在到哪一步了」，
 * 而不是盯着一个空白的请求等到超时。
 *
 * ``query`` 可以是一个学习主题，也可以是一条视频链接：
 *
 * - ``"博弈论 纳什均衡"`` → 跨平台检索；
 * - ``"https://www.bilibili.com/video/BV1xx411c7mD"`` → 直接抓这条。
 *
 * 失败时抛错——调用方要能区分「没找到」和「出错了」。
 */
export async function discoverCoursesStreaming(
  query: string,
  options: {
    maxResults?: number;
    onProgress?: (event: DiscoveryEvent) => void;
    signal?: AbortSignal;
  } = {},
): Promise<DiscoveryResult> {
  const response = await apiFetch(apiUrl("/api/resources/discover/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      max_results: options.maxResults ?? 3,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    let detail = `检索失败（HTTP ${response.status}）`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") detail = payload.detail;
    } catch {
      /* 保留默认文案 */
    }
    throw new Error(detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: DiscoveryResult | null = null;

  /** 解析一段 SSE 缓冲，取出里面的事件。 */
  const drain = (chunk: string) => {
    const frames = chunk.split("\n\n");
    // 最后一段可能不完整——留在缓冲里等下一批。
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      let stage = "";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) stage = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!stage || !data) continue;
      let payload: any = null;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const event: DiscoveryEvent = {
        stage: (payload.stage ?? stage) as DiscoveryStage,
        message: String(payload.message ?? ""),
        result: payload.result,
      };
      if (event.stage === "done" && event.result) {
        finalResult = normalizeResult(event.result);
      }
      options.onProgress?.(event);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain(buffer);
    }
    if (buffer.trim()) drain(buffer + "\n\n");
  } finally {
    reader.releaseLock();
  }

  if (!finalResult) {
    throw new Error("检索未返回结果，请稍后再试。");
  }
  return finalResult;
}

/** 把后端返回的原始结果规整成前端用的形状。 */
function normalizeResult(data: any): DiscoveryResult {
  return {
    resource_ids: Array.isArray(data?.resource_ids)
      ? data.resource_ids.map((id: unknown) => String(id))
      : [],
    titles: Array.isArray(data?.titles)
      ? data.titles.map((title: unknown) => String(title))
      : [],
    structured: Number(data?.structured ?? 0) || 0,
    failed: Number(data?.failed ?? 0) || 0,
    added: Number(data?.added ?? 0) || 0,
    updated: Number(data?.updated ?? 0) || 0,
    failures: Array.isArray(data?.failures)
      ? data.failures.map((item: unknown) => String(item))
      : [],
  };
}

/**
 * 实时检索并现场装配新课程。
 *
 * ``query`` 可以是一个学习主题，也可以是一条视频链接：
 *
 * - ``"博弈论 纳什均衡"`` → 跨平台检索；
 * - ``"https://www.bilibili.com/video/BV1xx411c7mD"`` → 直接抓这条。
 *
 * 失败时抛错——调用方要能区分「没找到」和「出错了」。
 */
export async function discoverCourses(
  query: string,
  options: { maxResults?: number } = {},
): Promise<DiscoveryResult> {
  const response = await apiFetch(apiUrl("/api/resources/discover"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      max_results: options.maxResults ?? 3,
    }),
  });

  if (!response.ok) {
    let detail = `检索失败（HTTP ${response.status}）`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") detail = payload.detail;
    } catch {
      /* 保留默认文案 */
    }
    throw new Error(detail);
  }

  const data = await asJsonOrThrow(response);
  return normalizeResult(data);
}

/**
 * 拉取巡检状态。
 *
 * 拉不到时返回 ``null``——状态是**锦上添花**的信息，不该因为它
 * 挂掉就阻断整个页面。
 */
export async function fetchSyncStatus(): Promise<SyncStatus | null> {
  // ── 静态模式 ──
  //
  // 巡检状态是**后端**的概念——静态站点没有信源池，也就没有巡检。
  // 返回 ``null`` 表示「无此概念」，调用方会隐藏相关 UI。
  if (await isStaticRuntime()) return null;

  try {
    const response = await apiFetch(apiUrl("/api/resources/sync/status"), {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await asJsonOrThrow(response);
    const coverage = data?.youtube_fallback_coverage ?? {};
    return {
      updated_at: String(data?.updated_at ?? ""),
      resource_count: Number(data?.resource_count ?? 0) || 0,
      structured_count: Number(data?.structured_count ?? 0) || 0,
      category_count: Number(data?.category_count ?? 0) || 0,
      last_ingest: (data?.last_ingest ?? {}) as Record<string, unknown>,
      youtube_fallback_coverage: {
        total: Number(coverage?.total ?? 0) || 0,
        with_fallback: Number(coverage?.with_fallback ?? 0) || 0,
        percent: Number(coverage?.percent ?? 0) || 0,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 手动触发一次巡检。
 *
 * 返回新增与装配的条数。
 */
export async function triggerSync(): Promise<{
  added: number;
  updated: number;
  total: number;
}> {
  // ── 静态模式 ──
  //
  // 巡检要后端去爬网、写库——静态站点做不了。
  // 明确报错，而不是假装成功。
  if (await isStaticRuntime()) {
    throw new Error("纯静态版本无法巡检更新——这一步需要后端服务。");
  }

  const response = await apiFetch(apiUrl("/api/resources/sync"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ write: true }),
  });
  if (!response.ok) {
    throw new Error(`巡检失败（HTTP ${response.status}）`);
  }
  const data = await asJsonOrThrow(response);
  const stats = data?.stats ?? {};
  return {
    added: Number(stats?.added ?? 0) || 0,
    updated: Number(stats?.updated ?? 0) || 0,
    total: Number(stats?.total ?? 0) || 0,
  };
}
