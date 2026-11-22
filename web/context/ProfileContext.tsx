"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  apiFetch,
  apiUrl,
  asJsonOrThrow,
  isStaticRuntime,
} from "@/shared/api/client";
import { useLocale, type Locale, type Region } from "@/context/LocaleContext";
import { exportAllLocal, importAllLocal } from "@/lib/local-store";

/**
 * 用户个人档案
 * =============
 *
 * 昵称、头像、地区、时区、语言偏好、学习目标。
 *
 * 双重持久化
 * ----------
 *
 * * **localStorage** —— 同步读取，首帧就有数据（不闪「未设置昵称」）；
 *   写入立刻生效，界面不等网络。
 * * **服务端 JSON** —— 权威副本，跨设备同步的��。
 *
 * 冲突判定
 * --------
 *
 * 用 ``updated_at``：服务端的时间戳不早于本地，就用服务端的。
 *
 * 为什么不用「本地优先」
 * --------------------
 *
 * 本地优先会让「在 A 设备改了昵称，回到 B 设备时被旧本地数据覆盖」
 * 这种事发生。服务端是权威——它是**唯一**保存了所有设备写入的地方。
 *
 * 只有服务端还没有这个用户的记录时，本地才主导——这覆盖了
 * 「用户先在本地改了，之后才第一次连上服务端」的情况。
 */

/** 档案数据。 */
export interface UserProfile {
  user_id: string;
  nickname: string;
  avatar_id: string;
  avatar_url: string;
  region: Region;
  timezone: string;
  locale: Locale;
  goal: string;
  updated_at: number;
}

/** 预设头像。 */
export interface PresetAvatar {
  id: string;
  name: string;
  colors: string[];
}

/** 表单选项。 */
export interface ProfileMeta {
  avatars: PresetAvatar[];
  regions: Array<{ id: string; name: string }>;
  timezones: string[];
}

/**
 * 静态模式下的**内置选项**。
 *
 * 为什么不放后端
 * --------------
 *
 * 这些是**固定的几组**——预设头像、地区、时区。它们不会频繁变。放在
 * 后端的话，改一次地区列表就要重新构建前端。
 *
 * 而且静态模式**根本没有后端**——选项必须能离线拿到。
 */
const STATIC_META: ProfileMeta = {
  avatars: [
    { id: "aurora", name: "极光", colors: ["#1d4ed8", "#0f172a"] },
    { id: "indigo", name: "靛蓝", colors: ["#1e3a8a", "#334155"] },
    { id: "cobalt", name: "钴蓝", colors: ["#2563eb", "#0f172a"] },
    { id: "slate", name: "石墨", colors: ["#475569", "#0f172a"] },
    { id: "teal", name: "青碧", colors: ["#0f766e", "#0f172a"] },
    { id: "plum", name: "紫檀", colors: ["#6d28d9", "#0f172a"] },
    { id: "amber", name: "暖阳", colors: ["#b45309", "#0f172a"] },
    { id: "rose", name: "赭红", colors: ["#9f1239", "#0f172a"] },
  ],
  regions: [
    { id: "cn", name: "中国大陆" },
    { id: "hktw", name: "中国香港 / 台湾" },
    { id: "apac", name: "亚太与东南亚" },
    { id: "na", name: "北美" },
    { id: "eu", name: "欧洲" },
    { id: "anz", name: "澳新" },
  ],
  timezones: [
    "Asia/Shanghai",
    "Asia/Taipei",
    "Asia/Hong_Kong",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Pacific/Auckland",
    "America/Los_Angeles",
    "America/Vancouver",
    "America/New_York",
    "America/Toronto",
    "America/Chicago",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Europe/Amsterdam",
    "Africa/Johannesburg",
    "UTC",
  ],
};

/** 默认档案。 */
const DEFAULT_PROFILE: UserProfile = {
  user_id: "default",
  nickname: "",
  avatar_id: "aurora",
  avatar_url: "",
  region: "cn",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  goal: "",
  updated_at: 0,
};

const STORAGE_KEY = "dreamclass.profile";

interface ProfileValue {
  profile: UserProfile;
  /** 是否有昵称——用来决定侧栏显示什么。 */
  named: boolean;
  /** 显示名（昵称为空时用兜底）。 */
  displayName: string;
  meta: ProfileMeta;
  /** 保存档案。 */
  save: (patch: Partial<UserProfile>) => Promise<void>;
  /** 正在保存。 */
  saving: boolean;
  /** 从服务端拉档案（首次挂载时）。 */
  refresh: () => Promise<void>;
  /** 导出完整档案。 */
  exportArchive: () => Promise<void>;
  /** 导入档案。 */
  importArchive: (file: File) => Promise<string>;
}

const ProfileContext = createContext<ProfileValue | null>(null);

/** 读本地副本。 */
function readLocal(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...(parsed as Partial<UserProfile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

/** 写本地副本。 */
function writeLocal(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* 隐私模式下可能不可写——忽略 */
  }
}

/**
 * 静态模式下的**本地档案**。
 *
 * 形状跟后端 ``/api/profile/archive`` 返回的一致——这样导入逻辑
 * 只需要处理一种格式。
 */
async function buildLocalArchive(): Promise<{
  version: number;
  exportedAt: string;
  profile: UserProfile;
  local: Record<string, unknown>;
}> {
  const profile = readLocal();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    local: exportAllLocal(),
  };
}

/**
 * 静态模式下**从档案恢复**。
 *
 * @returns 给用户看的一句话结果
 */
function restoreLocalArchive(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") {
    return "文件格式不正确——应该是一个学习档案 JSON。";
  }

  const payload = parsed as {
    profile?: Partial<UserProfile>;
    local?: Record<string, unknown>;
  };

  // ① 恢复个人资料。
  if (payload.profile && typeof payload.profile === "object") {
    const merged = { ...DEFAULT_PROFILE, ...payload.profile };
    writeLocal(merged);
  }

  // ② 恢复所有学习记录。
  let count = 0;
  if (payload.local && typeof payload.local === "object") {
    count = importAllLocal(payload.local);
  }

  if (count === 0 && !payload.profile) {
    return "这个档案里没有可恢复的内容。";
  }
  return `已恢复 ${count} 项学习记录。`;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<ProfileMeta>({
    avatars: [],
    regions: [],
    timezones: [],
  });
  const { setLocale, setRegion } = useLocale();
  const mounted = useRef(false);

  // ── 首次挂载：读本地 + 拉服务端 + 拉选项 ──
  useEffect(() => {
    mounted.current = true;

    // 先用本地副本渲染，避免闪「未设置昵称」。
    setProfile(readLocal());

    void (async () => {
      // ── 静态模式 ──
      //
      // 没有后端。档案只存在 localStorage，选项用内置常量。
      if (await isStaticRuntime()) {
        setMeta(STATIC_META);
        return;
      }

      // 静态选项。
      try {
        const metaResponse = await apiFetch(apiUrl("/api/profile/meta"), {
          cache: "no-store",
        });
        setMeta(await asJsonOrThrow(metaResponse));
      } catch {
        /* 选项拿不到不影响档案本身 */
      }

      // 服务端档案。
      try {
        const response = await apiFetch(apiUrl("/api/profile/"), {
          cache: "no-store",
        });
        const remote = (await asJsonOrThrow(response)) as UserProfile;
        const local = readLocal();

        // 冲突判定：服务端更新（或本地没有记录）就用服务端。
        const useRemote =
          !local.updated_at || remote.updated_at >= local.updated_at;

        if (useRemote) {
          setProfile(remote);
          writeLocal(remote);
        } else {
          // 本地更新——把它推回服务端。
          void pushToServer(local);
        }
      } catch {
        /* 服务端不可用就纯本地跑 */
      }
    })();

    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 把档案推到服务端。 */
  const pushToServer = useCallback(async (next: UserProfile) => {
    // 静态模式：只存本地，没有服务端可推。
    if (await isStaticRuntime()) return;

    try {
      const response = await apiFetch(apiUrl("/api/profile/"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: next.nickname,
          avatar_id: next.avatar_id,
          avatar_url: next.avatar_url,
          region: next.region,
          timezone: next.timezone,
          locale: next.locale,
          goal: next.goal,
        }),
      });
      const saved = (await asJsonOrThrow(response)) as UserProfile;
      if (mounted.current) {
        setProfile(saved);
        writeLocal(saved);
      }
    } catch {
      /* 保存失败不影响本地副本 */
    }
  }, []);

  /**
   * 保存档案。
   *
   * 立即写本地（界面立刻变），再异步推服务端。
   */
  const save = useCallback(
    async (patch: Partial<UserProfile>) => {
      setSaving(true);
      const next: UserProfile = {
        ...profile,
        ...patch,
        updated_at: Date.now() / 1000,
      };
      setProfile(next);
      writeLocal(next);
      try {
        await pushToServer(next);
      } finally {
        setSaving(false);
      }

      // 语言与地区的变化要**同步到全局设置**——不然档案里写着
      // 「北美」，界面却是「亚太」，两处对不上。
      if (patch.locale && patch.locale !== profile.locale) {
        setLocale(patch.locale);
      }
      if (patch.region && patch.region !== profile.region) {
        setRegion(patch.region);
      }
    },
    [profile, pushToServer, setLocale, setRegion],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch(apiUrl("/api/profile/"), {
        cache: "no-store",
      });
      const remote = (await asJsonOrThrow(response)) as UserProfile;
      setProfile(remote);
      writeLocal(remote);
    } catch {
      /* 忽略 */
    }
  }, []);

  /**
   * 导出完整档案——下载一个 JSON 文件。
   *
   * 静态模式下**没有后端**，所以本地组装一份：
   *
   * - 个人资料；
   * - 所有学习记录（进度 / 笔记 / 测验 / 诊断）；
   * - 已获证书。
   *
   * ⚠️ 档案里**不包含** API Key——那是用户自己的，不该被导出。
   */
  const exportArchive = useCallback(async () => {
    let data: unknown;

    if (await isStaticRuntime()) {
      data = await buildLocalArchive();
    } else {
      const response = await apiFetch(apiUrl("/api/profile/archive"), {
        cache: "no-store",
      });
      data = await asJsonOrThrow(response);
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `dreamclass-archive-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  /** 导入档案。 */
  const importArchive = useCallback(
    async (file: File): Promise<string> => {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return "文件不是合法的 JSON。";
      }
      if (!parsed || typeof parsed !== "object") {
        return "文件格式不正确——应该是一个学习档案 JSON。";
      }

      // ── 静态模式：本地恢复 ──
      //
      // GitHub Pages 上没有后端，API 调用必然失败。但档案里的**资料**
      // 本来就存在 localStorage 里——直接写回去就行。
      if (await isStaticRuntime()) {
        const message = restoreLocalArchive(parsed);
        // 资料变了 → 重新读一遍，界面立刻同步。
        setProfile(readLocal());
        return message;
      }

      const response = await apiFetch(
        apiUrl("/api/profile/archive/import"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        },
      );
      const result = await asJsonOrThrow(response);
      if (result?.profile) {
        setProfile(result.profile);
        writeLocal(result.profile);
      }
      return String(result?.reason || "导入完成。");
    },
    [],
  );

  const value = useMemo<ProfileValue>(
    () => ({
      profile,
      named: Boolean(profile.nickname.trim()),
      displayName: profile.nickname.trim() || "学习者",
      meta,
      save,
      saving,
      refresh,
      exportArchive,
      importArchive,
    }),
    [profile, meta, save, saving, refresh, exportArchive, importArchive],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

/** 读档案上下文。 */
export function useProfile(): ProfileValue {
  const context = useContext(ProfileContext);
  const fallback = useMemo<ProfileValue>(
    () => ({
      profile: DEFAULT_PROFILE,
      named: false,
      displayName: "学习者",
      meta: { avatars: [], regions: [], timezones: [] },
      save: async () => {},
      saving: false,
      refresh: async () => {},
      exportArchive: async () => {},
      importArchive: async () => "",
    }),
    [],
  );
  return context ?? fallback;
}
