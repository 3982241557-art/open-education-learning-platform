/**
 * 首页 · 学龄路径图解（纯 SVG）
 * =================================
 *
 * 「连接全球海外华人家庭」与「国内统编 / 人教国标体系」之间的关系，
 * 用一张图说清比三段文字有效。
 *
 * 构图
 * ----
 *
 * 左：三个海外大区（东南亚 / 北美 / 欧洲）的**家庭节点**；
 * 中：一段「衔接断层」——这是平台要解决的核心问题；
 * 右：国内 12 个年级 + 两大核心学科的**国标体系**。
 *
 * 全是 SVG，没有图片素材——首屏零额外请求。
 */

/** 组件属性。 */
export interface LearningPathDiagramProps {
  className?: string;
}

/** 海外大区节点。 */
const REGIONS = [
  { label: "亚太与东南亚", sub: "小一 – 高三", x: 26, y: 46 },
  { label: "北美", sub: "小一 – 高三", x: 26, y: 104 },
  { label: "欧洲与澳新", sub: "小一 – 高三", x: 26, y: 162 },
];

/** 国内国标节点。 */
const NATION = { label: "国内国标体系", sub: "统编版语文 · 人教版数学", x: 338, y: 104 };

export function LearningPathDiagram({ className }: LearningPathDiagramProps) {
  return (
    <svg
      viewBox="0 0 400 210"
      className={className}
      role="img"
      aria-label="海外华人家庭与国内统编、人教国标体系之间的学龄路径图解"
    >
      <defs>
        <marker
          id="oe-path-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#b89b5e" />
        </marker>
      </defs>

      {/* ── 左侧：海外家庭节点 ── */}
      {REGIONS.map((region) => (
        <g key={region.label}>
          <rect
            x={region.x - 4}
            y={region.y - 20}
            width={116}
            height={40}
            rx={7}
            fill="#ffffff"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
          <text
            x={region.x + 4}
            y={region.y - 3}
            fill="#0f172a"
            fontSize="11"
            fontWeight="600"
          >
            {region.label}
          </text>
          <text x={region.x + 4} y={region.y + 10} fill="#55606e" fontSize="9">
            {region.sub}
          </text>
        </g>
      ))}

      {/* ── 中段：衔接曲线 ──
       *
       * 三条曲线汇到中央的「断层」——视觉上把「海外」与「国内」
       * 连起来，同时标出中间的**空白**。
       */}
      {REGIONS.map((region) => (
        <path
          key={region.label}
          d={`M ${region.x + 112} ${region.y} C 150 ${region.y}, 158 104, 176 104`}
          fill="none"
          stroke="#d8c49a"
          strokeWidth="1.3"
          strokeDasharray="3 3"
        />
      ))}

      {/* 断层标记。 */}
      <rect
        x={176}
        y={78}
        width={62}
        height={52}
        rx={8}
        fill="#0b162c"
      />
      <text
        x={207}
        y={100}
        fill="#ffffff"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
      >
        衔接
      </text>
      <text
        x={207}
        y={116}
        fill="#d8c49a"
        fontSize="9"
        textAnchor="middle"
      >
        断层
      </text>

      {/* 断层 → 国标体系。 */}
      <path
        d="M 238 104 L 262 104"
        fill="none"
        stroke="#b89b5e"
        strokeWidth="1.4"
        markerEnd="url(#oe-path-arrow)"
      />

      {/* ── 右侧：国内国标体系 ── */}
      <rect
        x={NATION.x - 14}
        y={NATION.y - 26}
        width={150}
        height={52}
        rx={8}
        fill="#fffefa"
        stroke="#b89b5e"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <text
        x={NATION.x + 2}
        y={NATION.y - 6}
        fill="#0b162c"
        fontSize="11"
        fontWeight="600"
      >
        {NATION.label}
      </text>
      <text x={NATION.x + 2} y={NATION.y + 8} fill="#55606e" fontSize="9">
        {NATION.sub}
      </text>
      <text x={NATION.x + 2} y={NATION.y + 20} fill="#b89b5e" fontSize="9">
        1–12 年级 · 完整对齐
      </text>

      {/* 底部刻度——12 个年级的点阵。 */}
      <g>
        {Array.from({ length: 12 }).map((_, index) => (
          <circle
            key={index}
            cx={92 + index * 22}
            cy={196}
            r={index % 3 === 0 ? 3.2 : 2.4}
            fill={index % 3 === 0 ? "#1d4ed8" : "#cbd5e1"}
          />
        ))}
        <text x={92} y={186} fill="#55606e" fontSize="8.5">
          小一
        </text>
        <text x={330} y={186} fill="#55606e" fontSize="8.5" textAnchor="middle">
          高三
        </text>
      </g>
    </svg>
  );
}
