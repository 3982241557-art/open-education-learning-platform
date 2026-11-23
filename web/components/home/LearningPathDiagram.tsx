"use client";

import { cn } from "@/lib/cn";

/**
 * 学习路径示意图
 * ==============
 *
 * 首页第二层「为什么是 OE」里的那张图。
 *
 * 它要表达的事情只有一句：**这条断掉的路被接上了**。
 *
 * .. code-block:: text
 *
 *     左：孩子的真实位置          中：OE 的对齐层        右：国内课堂
 *     ┌────────────┐          ┌────────────┐        ┌────────────┐
 *     │ 二年级      │  ────▶  │ 教材单元     │  ───▶  │ 第二单元    │
 *     │ 8–9 岁      │          │ 互动教具     │        │ 第 3–6 讲  │
 *     │ 中文 A2     │          │ 启发伴学     │        │ 单元测验    │
 *     └────────────┘          └────────────┘        └────────────┘
 *
 * 为什么用示意图而不是数据表
 * --------------------------
 *
 * 因为用户在这一层还没决定要不要学。他需要的是**一眼看懂「这东西
 * 解决什么问题」**——而表格只能告诉他「有哪些字段」。
 */

/** 组件。 */
export default function LearningPathDiagram({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 520 300"
      className={cn("w-full", className)}
      role="img"
      aria-label="学习路径对齐示意图：孩子的真实位置经由 OE 的对齐层，连接到国内课堂的真实进度"
    >
      <defs>
        <marker
          id="oe-path-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="#B89B5E" />
        </marker>
      </defs>

      {/* ── 左卡：孩子的真实位置 ── */}
      <rect
        x="8"
        y="70"
        width="140"
        height="160"
        rx="10"
        fill="#FFFEFA"
        stroke="#B89B5E"
        strokeWidth="1.2"
      />
      <text x="78" y="98" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0B162C">
        孩子的真实位置
      </text>
      <text x="78" y="126" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0B162C">
        二年级
      </text>
      <text x="78" y="146" textAnchor="middle" fontSize="10" fill="#55606E">
        8–9 岁 · 中文 A2
      </text>
      <line x1="28" y1="162" x2="128" y2="162" stroke="#E5E7EB" strokeWidth="1" />
      <text x="78" y="182" textAnchor="middle" fontSize="10" fill="#55606E">
        识字量 · 阅读速度
      </text>
      <text x="78" y="200" textAnchor="middle" fontSize="10" fill="#55606E">
        数学运算基础
      </text>
      <text x="78" y="218" textAnchor="middle" fontSize="10" fill="#55606E">
        注意力时长
      </text>

      {/* ── 中卡：OE 对齐层 ── */}
      <rect
        x="190"
        y="46"
        width="140"
        height="208"
        rx="10"
        fill="#0B162C"
        stroke="#0B162C"
        strokeWidth="1.2"
      />
      <text x="260" y="76" textAnchor="middle" fontSize="12" fontWeight="700" fill="#D8C49A">
        OE 对齐层
      </text>
      <text x="260" y="96" textAnchor="middle" fontSize="9.5" fill="#FFFFFF" opacity="0.6">
        Open Education
      </text>
      <line x1="212" y1="112" x2="308" y2="112" stroke="#B89B5E" strokeWidth="1" />
      {["教材单元映射", "互动教具", "启发伴学", "双语对照", "星级追踪"].map(
        (label, index) => (
          <g key={label}>
            <circle cx="220" cy={134 + index * 24} r="3" fill="#B89B5E" />
            <text
              x="232"
              y={138 + index * 24}
              fontSize="10.5"
              fill="#FFFFFF"
              opacity="0.88"
            >
              {label}
            </text>
          </g>
        ),
      )}

      {/* ── 右卡：国内课堂 ── */}
      <rect
        x="372"
        y="70"
        width="140"
        height="160"
        rx="10"
        fill="#FFFFFF"
        stroke="#1D4ED8"
        strokeWidth="1.2"
      />
      <text x="442" y="98" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0B162C">
        国内课堂进度
      </text>
      <text x="442" y="126" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0B162C">
        第二单元
      </text>
      <text x="442" y="146" textAnchor="middle" fontSize="10" fill="#55606E">
        第 3–6 讲
      </text>
      <line x1="392" y1="162" x2="492" y2="162" stroke="#E5E7EB" strokeWidth="1" />
      <text x="442" y="182" textAnchor="middle" fontSize="10" fill="#55606E">
        生字表对齐
      </text>
      <text x="442" y="200" textAnchor="middle" fontSize="10" fill="#55606E">
        例题题型对齐
      </text>
      <text x="442" y="218" textAnchor="middle" fontSize="10" fill="#55606E">
        单元测验范围
      </text>

      {/* ── 连接箭头 ── */}
      <line
        x1="152"
        y1="150"
        x2="182"
        y2="150"
        stroke="#B89B5E"
        strokeWidth="1.6"
        markerEnd="url(#oe-path-arrow)"
      />
      <line
        x1="334"
        y1="150"
        x2="364"
        y2="150"
        stroke="#B89B5E"
        strokeWidth="1.6"
        markerEnd="url(#oe-path-arrow)"
      />

      {/* 底部贯通线——强调「一条路」。 */}
      <path
        d="M 78 244 L 78 268 L 442 268 L 442 244"
        fill="none"
        stroke="#CBD5E1"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x="260" y="288" textAnchor="middle" fontSize="9.5" fill="#8A93A0">
        回到国内课堂时，不需要重新补
      </text>
    </svg>
  );
}
