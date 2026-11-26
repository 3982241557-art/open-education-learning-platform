"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { cn } from "@/lib/cn";
import { useTraditional } from "@/lib/use-bilingual";

/**
 * 实验台遥测事件
 * ===============
 *
 * 三个王牌实验台通过它把**学生的每一次真实操作**推给右侧伴学栏。
 *
 * ⛔ 这不是「状态广播」——每个事件都带一句**人话**描述，
 *    右侧栏据此实时更新启发提问与提示。
 */

export interface TelemetryEvent {
  /** 事件类型。 */
  kind: "action" | "discovery" | "success" | "hint";
  /** 人话描述（中文）。 */
  textZh: string;
  /** 人话描述（英文）。 */
  textEn: string;
  /** 关键数值（例如「左盘 3 块」）。 */
  value?: string;
  /** 事件发生的时间戳。 */
  at: number;
}

/** 三段式玩法。 */
export type LabStage = "explore" | "discover" | "mystery";

/** 实验台对外属性。 */
export interface LabProps {
  /** 遥测回调——每一次真实操作都会调它。 */
  onTelemetryChange?: (event: TelemetryEvent) => void;
  /** 当前阶段。 */
  stage: LabStage;
  /** 语言。 */
  isEn: boolean;
  /** 通关回调（谜题解出时）。 */
  onSolved?: (messageZh: string, messageEn: string) => void;
}

/* ── 共享：阶段切换条 ────────────────────────────────────────────── */

/**
 * 全站统一的三段式切换条。
 *
 * 三个阶段的**含义**在全站一致：
 * - 探索 Explore：自由动手，看现象；
 * - 规律 Discover：验证一条规律；
 * - 谜题 Mystery：独立破解。
 */
export function StageSwitch({
  stage,
  onChange,
  isEn,
  labels,
}: {
  stage: LabStage;
  onChange: (stage: LabStage) => void;
  isEn: boolean;
  labels?: { explore: string; discover: string; mystery: string };
}) {
  const items: Array<{ id: LabStage; no: string; zh: string; en: string }> = [
    { id: "explore", no: "01", zh: "探索", en: "Explore" },
    { id: "discover", no: "02", zh: "规律", en: "Discover" },
    { id: "mystery", no: "03", zh: "谜题", en: "Mystery" },
  ];

  const tw = useTraditional();

  return (
    <div className="flex items-stretch gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1">
      {items.map((item) => {
        const active = stage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-pressed={active}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-[#0B162C] text-white"
                : "text-[#334155] hover:bg-white",
            )}
          >
            <span
              className={cn(
                "mr-1.5 text-[10px] tabular-nums",
                active ? "text-[#C59B38]" : "text-[#94A3B8]",
              )}
            >
              {item.no}
            </span>
            {labels ? labels[item.id] : isEn ? item.en : tw(item.zh)}
          </button>
        );
      })}
    </div>
  );
}

/* ── 共享：公式展示条 ────────────────────────────────────────────── */

/** 清晰的数学排版公式条。 */
export function FormulaBar({
  children,
  highlight = false,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-center font-mono text-[15px] tracking-tight transition-colors",
        highlight
          ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
          : "border-[#E2E8F0] bg-white text-[#0F172A]",
      )}
    >
      {children}
    </div>
  );
}

/* ── 共享：道具托盘 ──────────────────────────────────────────────── */

/**
 * 道具托盘——把「可拖拽的实物」摆在画布旁边。
 *
 * 为什么用托盘而不是直接画在画布上：直接画在画布上时，用户
 * 分不清「这个是道具还是画布的一部分」。托盘给出明确的边界。
 */
export function Tray({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5">
      <p className="mb-2 text-[10px] font-medium tracking-[0.12em] text-[#334155] uppercase">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** 托盘里的一个可拖拽道具。 */
export function TrayItem({
  label,
  sublabel,
  color,
  onDragStart,
  onClick,
  disabled,
  active,
}: {
  label: string;
  sublabel?: string;
  color: "blue" | "gold" | "navy" | "slate";
  onDragStart?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const palette = {
    blue: "bg-[#1D4ED8] border-[#1D4ED8]",
    gold: "bg-[#C59B38] border-[#B08730]",
    navy: "bg-[#0B162C] border-[#0B162C]",
    slate: "bg-white border-[#CBD5E1] text-[#0F172A]",
  }[color];

  return (
    <button
      type="button"
      draggable={!disabled}
      onDragStart={onDragStart}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-w-[52px] cursor-grab flex-col items-center justify-center rounded-md border px-2.5 py-1.5 text-center transition-all active:cursor-grabbing",
        palette,
        disabled && "cursor-not-allowed opacity-40",
        active && "ring-2 ring-[#1D4ED8] ring-offset-1",
      )}
    >
      <span
        className={cn(
          "text-[13px] leading-tight font-semibold",
          color === "slate" ? "text-[#0F172A]" : "text-white",
        )}
      >
        {label}
      </span>
      {sublabel ? (
        <span
          className={cn(
            "text-[9.5px] leading-tight",
            color === "slate" ? "text-[#64748B]" : "text-white/70",
          )}
        >
          {sublabel}
        </span>
      ) : null}
    </button>
  );
}
