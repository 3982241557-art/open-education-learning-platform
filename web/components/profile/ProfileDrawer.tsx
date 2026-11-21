"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Upload, X } from "lucide-react";
import { useProfile } from "@/context/ProfileContext";
import { getLocalApiKey, setLocalApiKey } from "@/lib/local-ai";
import { isStaticRuntime } from "@/shared/api/client";
import type { Region } from "@/context/LocaleContext";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { cn } from "@/lib/cn";

/**
 * 个人中心与资料管理
 * ===================
 *
 * 一张**极简**的抽屉：改资料、看存档、导出/导入。
 *
 * 为什么单独一个抽屉而不是塞进「设置」页
 * --------------------------------------
 *
 * 「设置」是**技术性**配置（模型密钥、能力库、运行状态）——用户一
 * 年也开不了两次。而个人资料是**高频**操作：改昵称、换头像、切地区。
 *
 * 把高频操作埋在低频页面里，等于让它不存在。
 *
 * 自动保存
 * --------
 *
 * 昵称、目标等文本框**边打边存**（300ms 防抖），地区、时区、头像
 * **点一下就存**。
 *
 * 为什么要自动保存
 * ----------------
 *
 * 因为「保存」按钮是**摩擦**。用户改了个昵称，然后被要求点一下
 * 「保存」——那个按钮不但没提供价值，还带来一个真实的风险：
 * 用户以为已经保存了，关掉抽屉，昵称没变。
 *
 * 但自动保存必须**给出反馈**——所以右上角有一个「保存中…」的状态
 * 指示。
 */
export function ProfileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, meta, save, saving, exportArchive, importArchive } =
    useProfile();

  // 表单草稿——输入时用它，避免每敲一个字就重渲染整棵列表。
  const [nickname, setNickname] = useState(profile.nickname);
  const [goal, setGoal] = useState(profile.goal);

  /**
   * 本地存的 DeepSeek API Key。
   *
   * **只存在这台设备的浏览器里**——不进仓库、不上传任何服务器。
   */
  const [apiKey, setApiKey] = useState("");
  /** Key 的保存状态——给用户一个明确的反馈。 */
  const [keyState, setKeyState] = useState<"idle" | "saved" | "cleared">(
    "idle",
  );
  /** 是否处于静态模式（纯静态版没有后端托管 Key）。 */
  const [staticMode, setStaticMode] = useState(false);
  const [avatarUrlDraft, setAvatarUrlDraft] = useState(profile.avatar_url);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 打开时同步一次草稿。
  useEffect(() => {
    if (!open) return;
    setNickname(profile.nickname);
    setGoal(profile.goal);
    // 读本地存的 Key——只在**打开抽屉**时读一次。
    setApiKey(getLocalApiKey());
    setKeyState("idle");
    void isStaticRuntime().then(setStaticMode);
    setAvatarUrlDraft(profile.avatar_url);
  }, [open, profile.nickname, profile.goal, profile.avatar_url]);

  // Esc 关闭。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /** 显示一条短暂的提示。 */
  const notify = useCallback((message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 2600);
  }, []);

  /** 防抖保存文本。 */
  const scheduleSave = useCallback(
    (patch: { nickname?: string; goal?: string; avatar_url?: string }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void save(patch);
      }, 300);
    },
    [save],
  );

  /** 选择本地图片作为头像。 */
  const pickLocalImage = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        notify("请选择图片文件。");
        return;
      }
      // 超过 1.5MB 就别转 base64 了——localStorage 只有 5MB。
      if (file.size > 1_500_000) {
        notify("图片太大了（超过 1.5MB），请改用图片链接。");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        setAvatarUrlDraft(result);
        void save({ avatar_url: result });
        notify("头像已更新。");
      };
      reader.readAsDataURL(file);
    },
    [save, notify],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="个人中心"
    >
      <aside
        className="flex h-full w-full max-w-[380px] flex-col overflow-hidden bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <UserAvatar size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">
              {profile.nickname.trim() || "未设置昵称"}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
              {saving ? (
                <>
                  <Loader2 size={10} className="animate-spin" />
                  保存中…
                </>
              ) : flash ? (
                <span className="text-emerald-600">{flash}</span>
              ) : (
                "资料自动保存"
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        {/* 表单 */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* 昵称 */}
          <Field label="昵称">
            <input
              value={nickname}
              onChange={(event) => {
                setNickname(event.target.value);
                scheduleSave({ nickname: event.target.value });
              }}
              placeholder="怎么称呼你？"
              maxLength={32}
              className={INPUT_CLASS}
            />
          </Field>

          {/* 头像 */}
          <Field label="头像">
            <div className="space-y-2.5">
              {/* 预设头像 */}
              <div className="flex flex-wrap gap-2">
                {meta.avatars.map((avatar) => {
                  const active = avatar.id === profile.avatar_id;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => void save({ avatar_id: avatar.id })}
                      title={avatar.name}
                      aria-pressed={active}
                      className={cn(
                        "h-8 w-8 rounded-full transition-[transform,box-shadow]",
                        active
                          ? "ring-2 ring-[var(--primary)] ring-offset-2"
                          : "hover:scale-110",
                      )}
                      style={{
                        background: `linear-gradient(135deg, ${avatar.colors[0]}, ${avatar.colors[1]})`,
                      }}
                    />
                  );
                })}
              </div>

              {/* 自定义 */}
              <div className="flex items-center gap-2">
                <input
                  value={avatarUrlDraft}
                  onChange={(event) => {
                    setAvatarUrlDraft(event.target.value);
                    scheduleSave({ avatar_url: event.target.value });
                  }}
                  placeholder="或粘贴图片链接"
                  className={cn(INPUT_CLASS, "flex-1")}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-[11.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  <Upload size={11} strokeWidth={2.2} />
                  本地
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) =>
                    void pickLocalImage(event.target.files?.[0])
                  }
                />
              </div>
            </div>
          </Field>

          {/* 地区 */}
          <Field label="所在地区">
            <div className="grid grid-cols-2 gap-1.5">
              {meta.regions.map((region) => {
                const active = region.id === profile.region;
                return (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() =>
                      void save({ region: region.id as Region })
                    }
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition-colors",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)]/6 text-[var(--primary)] font-medium"
                        : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                    )}
                  >
                    {region.name}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* 时区 */}
          <Field label="时区">
            <select
              value={profile.timezone}
              onChange={(event) => void save({ timezone: event.target.value })}
              className={INPUT_CLASS}
            >
              {meta.timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>

          {/* 语言偏好 */}
          <Field label="语言偏好">
            <div className="flex gap-1.5">
              {(
                [
                  { id: "zh-CN", label: "简体中文" },
                  { id: "zh-TW", label: "繁體中文" },
                  { id: "en", label: "English" },
                ] as const
              ).map((item) => {
                const active = item.id === profile.locale;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void save({ locale: item.id })}
                    aria-pressed={active}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] transition-colors",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)]/6 text-[var(--primary)] font-medium"
                        : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* 学习目标 */}
          <Field label="个人学习目标">
            <textarea
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                scheduleSave({ goal: event.target.value });
              }}
              placeholder="想学完什么？想在什么场景下用得上？"
              rows={3}
              maxLength={280}
              className={cn(INPUT_CLASS, "resize-none leading-relaxed")}
            />
            <p className="mt-1 text-right text-[10px] tabular-nums text-[var(--muted-foreground)]">
              {goal.length} / 280
            </p>
          </Field>

          {/* AI 助教接入 */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
            <p className="text-[12px] font-medium">AI 助教</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              {staticMode
                ? "当前是纯静态版本。在下面填入 DeepSeek API Key，AI 助教就能直接回答你的问题——请求由你的浏览器发出，Key 只存在这台设备上。"
                : "填入 DeepSeek API Key 后，AI 助教会优先用你的 Key 回答；留空则使用平台配置的模型。"}
            </p>

            <div className="mt-2.5">
              <input
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setKeyState("idle");
                }}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  INPUT_CLASS,
                  "font-mono text-[11px] placeholder:text-[var(--muted-foreground)]/60",
                )}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const ok = setLocalApiKey(apiKey);
                  setKeyState(ok ? "saved" : "idle");
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                保存 Key
              </button>
              {apiKey ? (
                <button
                  type="button"
                  onClick={() => {
                    setApiKey("");
                    setLocalApiKey("");
                    setKeyState("cleared");
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] bg-white px-3 text-[11.5px] transition-colors hover:bg-[var(--muted)]"
                >
                  清除
                </button>
              ) : null}
              {keyState === "saved" ? (
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  已保存到本机浏览器
                </span>
              ) : null}
              {keyState === "cleared" ? (
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  已清除
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--muted-foreground)]/80">
              获取地址：platform.deepseek.com/api_keys
              。Key 不会离开你的浏览器，也不会写入本项目的任何代码。
            </p>
          </div>

          {/* 存档 */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
            <p className="text-[12px] font-medium">我的学习档案</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              一键导出全部学习痕迹——资料、笔记、观看进度与已获证书，
              存成一个 JSON 文件。零门槛防丢失。
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void exportArchive()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <Download size={11} strokeWidth={2.2} />
                导出我的学习档案
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-[11.5px] transition-colors hover:bg-[var(--muted)]"
              >
                <Upload size={11} strokeWidth={2.2} />
                导入恢复
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  notify(await importArchive(file));
                } catch (err) {
                  notify(err instanceof Error ? err.message : "导入失败。");
                }
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** 表单字段的通用外壳。 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/** 输入框的统一样式。 */
const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-[var(--border)] bg-white px-2.5 text-[12.5px] outline-none transition-colors placeholder:text-[var(--muted-foreground)]/55 focus:border-[var(--primary)]";
