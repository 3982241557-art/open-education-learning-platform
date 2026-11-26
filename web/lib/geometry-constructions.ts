/**
 * 几何教具 · 8 课专属构造脚本
 * =============================
 *
 * 每一课对应一个**独立的高精度动态几何构造**。这些构造用 GeoGebra
 * 的 ``evalCommand()`` 注入——不是 iframe 嵌入别人的材料，而是自己
 * 写的构造指令，所以：
 *
 * - 语言**纯净**（GeoGebra 的 ``language`` 参数跟着站内语言走，
 *   工具栏里的按钮不会串语言）；
 * - 配色**统一**（深牛津蓝 #1D4ED8 + 炭黑 #0F172A + 实心纯白）；
 * - 每个数值都**可被追踪**（``getValue()`` 读回来推给右侧面板）。
 *
 * ⛔ **这里不写任何教学内容**。构造脚本只负责「造出可玩的东西」。
 *    概念、提示、题目一律来自 ``geometry-chain.json``——也就是从
 *    GitHub 开源仓库拉来的真实内容。
 *
 * ── 三段式过关条件的设计原则 ──
 *
 * ⛔ **每一段都必须「初始不达标、推到底能达标」**——
 *    ``scripts/verify-geogebra-runtime.mjs`` 会在真实引擎里同时
 *    验证这两件事。
 *
 * 这意味着「探索」和「规律」两段**不能写成被动的不变量**。
 * 比如 ``abs(corrDegV - altDegV) < 0.01``（平行线同位角相等）
 * ——它在**初始状态就成立**，学生一进门就拿星，整节课形同虚设。
 *
 * 正确做法是加一个**「学生真的动手了」标志位**：把初始值**快照**
 * 下来（见 {@link snapshot}），再和当前值比对（见 {@link movedFlag}）。
 * 于是：
 *
 * .. code-block:: text
 *
 *     探索 = movedFlag && <做出了一次真实操作>
 *     规律 = movedFlag && <观察到的不变量>
 *     谜题 = <一个具体的、能被解出的目标>
 *
 * ── GeoGebra 语义速查（全部在 headless GeoGebra 上实测过） ──
 *
 * ⚠️ **滑块初值 = 下限**。``Slider(0, 360, ...)`` 建出来是 **0**，
 *    不是中间值。所以凡是「初始状态不该达标」的谜题，必须显式
 *    ``SetValue()`` 一个**非目标**的初值。
 *
 * ⚠️ **``Point(circle, angle)`` 是坏的**。实测不管传什么角度，
 *    返回的都是圆上同一个点（``(-5, 0)``）。要「圆上按角度取点」，
 *    必须自己写坐标：``(r*cos(a*pi/180), r*sin(a*pi/180))``。
 *
 * ⚠️ **``Rotate(polygon, angle, point)`` 不存在**，三参数的
 *    ``Rotate(point, angle, point)`` 也**静默失败**（返回未定义点）。
 *    旋转必须**手写旋转公式**，逐点算（见 {@link rotatePoint}）。
 *
 * ⚠️ **``Center(polygon)`` 未定义**。多边形的中心点自己算质心。
 *
 * ⚠️ **``Polygon`` 的顶点必须是「命名点」**，不能内联坐标：
 *    ``Polygon(O, X, X + (0, legA), (0, legA))`` 会**静默退化成
 *    面积为 0 的退化多边形**——因为 ``X + (0, legA)`` 不是命名点。
 *    所以每个顶点都要先起名字。
 *
 * ⚠️ **角度字面量是弧度**。``Rotate(P, 90)`` 转的是 90 **弧度**。
 *    教学里一律用 ``90*pi/180``。
 *
 * ⚠️ **``Arc(A,B,C)`` 不存在**，要圆弧得用 ``CircularArc(A,B,C)``。
 *
 * ⚠️ **绝对值函数必须写小写 ``abs(...)``**。GeoGebra 里没有
 *    ``Abs(...)``——写大写会**静默返回 0**，于是
 *    ``Abs(x - y) < 0.5`` 永远为假，学生怎么拖都拿不到星。
 *
 * ⚠️ **快照必须是「自由数 + SetValue」**，不能写 ``init = k``。
 *    后者是**依赖对象**，``k`` 一变它跟着变，「有没有动过」就永远
 *    测不出来（实测确认）。
 */

/** 一条被追踪的实时量。 */
export interface GeoWatch {
  /** GeoGebra 里的对象名（如 ``alphaDegV``）。 */
  name: string;
  /** 三语说明。 */
  label: { zhCN: string; zhTW: string; en: string };
  /** 小数位数。 */
  precision?: number;
  /** 单位后缀（如 ``°``）。 */
  unit?: string;
}

/** 一个课时的教具构造。 */
export interface GeoConstruction {
  /** 注入的 GeoGebra 指令。 */
  commands: string[];
  /** 需要实时追踪的量。 */
  watch: GeoWatch[];
  /** 三段式各阶段的**过关条件**（GeoGebra 布尔表达式）。 */
  goals: {
    /** 01 探索：动手做一次真实操作。 */
    explore: string;
    /** 02 规律：验证一条不变量。 */
    discover: string;
    /** 03 谜题：解出目标。 */
    mystery: string;
  };
}

/* ── 配色（与全站视觉体系一致） ─────────────────────────────── */

/** 主线条色——深牛津蓝。 */
const BLUE = "#1D4ED8";
/** 次要线条色——炭黑。 */
const INK = "#0F172A";
/** 强调色——金。 */
const GOLD = "#C59B38";
/** 填充色——浅蓝。 */
const FILL = "#DBEAFE";
/** 第二个填充色——浅金。 */
const FILL2 = "#FEF3C7";
/** 第三个填充色——浅靛。 */
const FILL3 = "#E0E7FF";

/* ──────────────────────────────────────────────────────────────────
 * 样式辅助函数
 *
 * ⛔ **每个命令的名字与参数个数都对过 GeoGebra 源码**——
 *    ``geogebra/geogebra`` 仓库 ``kernel/scripting/Cmd*.java``。
 *
 *    这件事**必须**做，因为 GeoGebra 的 ``evalCommand`` 对未知命令
 *    **不抛错**：它只是什么也不发生。命令名写错 → 滑块不出现、
 *    颜色不生效、角度不显示，而控制台**一声不吭**。这种失败
 *    极难从界面上看出原因。
 * ────────────────────────────────────────────────────────────────── */

/**
 * 设置线条颜色与粗细。
 *
 * ``SetColor(obj, "#RRGGBB")`` —— 2 个参数。
 * ``SetLineThickness(obj, n)`` —— 2 个参数。
 */
const stroke = (name: string, color = BLUE, width = 3) =>
  [`SetColor(${name}, "${color}")`, `SetLineThickness(${name}, ${width})`];

/**
 * 设置点的样式。
 *
 * ``SetPointStyle(obj, style)`` —— **只接受 2 个参数**，而且第二个
 * 是**样式编号**（0–8），不是尺寸！想改点的大小要用
 * ``SetPointSize(obj, n)``。
 */
const point = (name: string, color = BLUE, size = 7) => [
  `SetColor(${name}, "${color}")`,
  `SetPointSize(${name}, ${size})`,
  `SetPointStyle(${name}, 0)`,
];

/**
 * 设置填充不透明度。
 *
 * ``SetFilling(obj, opacity)`` —— 2 个参数，opacity 是 **0–1** 的
 * 小数（不是 0–100 的整数）。
 */
const fill = (name: string, _color: string, opacity = 45) =>
  `SetFilling(${name}, ${opacity / 100})`;

/** 通用：显示角度标记。 */
const showAngle = (name: string) => `SetConditionToShowObject(${name}, true)`;

/**
 * 通用：创建滑块。
 *
 * ⛔ **不要用 ``SetSliderParameters``**——那个命令**不存在**。
 *
 * 正确做法是 ``Slider[<min>, <max>, <step>, <speed>, <width>,
 * <isAngle>, <horizontal>, <animating>, <random>]``——前 5 个是
 * 数值，后 4 个是布尔值（源码 ``CmdSlider`` 逐个校验类型）。
 *
 * ⚠️ **必须用标签赋值语法**，否则滑块拿不到名字，
 *    右侧面板就 ``getValue(名字)`` 不到它——那正是
 *    「LIVE CONTEXT 假死」的根因。
 *
 * ⚠️ **滑块初值 = 下限**。建出来就是 ``min``，要别的初值得
 *    紧接着调 ``SetValue(名字, 初值)``。
 *
 * @param name 滑块名（会被赋给滑块对象）
 * @param min 下限
 * @param max 上限
 * @param step 步长
 * @param isAngle 是否为角度滑块
 */
const slider = (
  name: string,
  min: number,
  max: number,
  step = 0.5,
  isAngle = false,
) => [
  `${name} = Slider(${min}, ${max}, ${step}, 1, 15, ${isAngle}, true, false, false)`,
  `ShowLabel(${name}, true)`,
];

/** 通用：设置标签可见（``ShowLabel(obj, bool)`` —— 2 个参数）。 */
const showLabel = (name: string) => `ShowLabel(${name}, true)`;

/** 通用：设置标签模式（``SetLabelMode(obj, n)`` —— 2 个参数）。 */
const labelMode = (name: string, mode = 1) =>
  `SetLabelMode(${name}, ${mode})`;

/**
 * 通用：只在欧几里得视图 1 里显示/隐藏对象。
 *
 * ⛔ ``SetVisibleInView`` **必须给 3 个参数**：
 *    ``SetVisibleInView(对象, 视图号, 布尔)``。
 *    源码 ``CmdSetVisibleInView`` 的 ``switch (n)`` **只有
 *    ``case 3``**——传 2 个参数会掉进 ``default`` 抛
 *    ``argNumErr``，对象根本不会被隐藏。
 */
const showInView = (name: string, visible: boolean) =>
  `SetVisibleInView(${name}, 1, ${visible})`;

/**
 * 通用：隐藏坐标系与网格。
 *
 * ⛔ 正确命令是 ``ShowAxes(false)`` 与 ``ShowGrid(false)`` 两个
 *    **独立**命令——不是 ``ShowAxesOrGrid``（那只是源码里的
 *    内部类名 ``CmdShowAxesOrGrid``，它按 ``Commands.ShowAxes``
 *    / ``Commands.ShowGrid`` 分别派发）。
 */
const hideAxes = () => [`ShowAxes(false)`, `ShowGrid(false)`];

/**
 * 通用：**快照**一个数值（用来判断「学生真的动手了」）。
 *
 * ⛔ **不能直接写 ``init = k``**——那样 ``init`` 是**依赖对象**，
 *    ``k`` 一变它跟着变，「有没有动过」就永远测不出来。
 *
 *    必须先建一个**自由数**，再用 ``SetValue()`` 把当前值**写死**
 *    进去。实测（headless GeoGebra）：
 *
 *    - ``oeInitK2 = k``        → 改 k 后 oeInitK2 跟着变（**不行**）
 *    - ``oeInitK = 0`` + ``SetValue(oeInitK, k)`` → 改 k 后 oeInitK 不变（**对**）
 *
 *    快照对象会被 ``SetVisibleInView(name, 1, false)`` 藏起来，
 *    不会在画布上冒出一个孤零零的数字。
 */
const snapshot = (name: string, valueExpr: string) => [
  `${name} = 0`,
  `SetValue(${name}, ${valueExpr})`,
  `SetVisibleInView(${name}, 1, false)`,
];

/**
 * 通用：**「动过了吗」标志位**。
 *
 * 把当前值和快照值比一比，差得够多就算「动过」。
 *
 * ⚠️ 产出的是一个**布尔对象**，在过关表达式里可以直接用
 *    ``movedX && <不变量>`` 组合——实测 GeoGebra 支持布尔对象参与
 *    ``&&`` / ``||``。
 *
 * @param flag 标志位名字
 * @param snap 快照对象名
 * @param valueExpr 当前值表达式
 * @param eps 判定阈值
 */
const movedFlag = (
  flag: string,
  snap: string,
  valueExpr: string,
  eps = 0.05,
) => `${flag} = abs(${valueExpr} - ${snap}) > ${eps}`;

/**
 * 通用：手写「绕点旋转」的一个顶点。
 *
 * ⚠️ GeoGebra 的 ``Rotate(point, angle, point)`` **静默失败**——
 *    返回一个未定义的点。三参数的 ``Rotate`` 只有在旋转中心是
 *    **未命名表达式**时才生效，一旦中心是命名点就废了。
 *
 *    所以这里手写旋转公式。这条公式在 headless GeoGebra 上实测
 *    通过（``Rotate(A, 90*pi/180, hub)`` 静默返回未定义点，
 *    而手写公式返回精确的 ``(0, -7)``）。
 *
 * @param name 新点名
 * @param src 原点名
 * @param hub 旋转中心点名
 * @param angleExpr 角度表达式（**弧度**）
 */
const rotatePoint = (
  name: string,
  src: string,
  hub: string,
  angleExpr: string,
) => {
  const dx = `x(${src}) - x(${hub})`;
  const dy = `y(${src}) - y(${hub})`;
  const c = `cos(${angleExpr})`;
  const s = `sin(${angleExpr})`;
  return `${name} = (x(${hub}) + ${dx}*${c} - ${dy}*${s}, y(${hub}) + ${dx}*${s} + ${dy}*${c})`;
};

/**
 * 通用：手写「绕点旋转」的**向量**（用于构造正方形顶点）。
 *
 * 与 {@link rotatePoint} 同理，只是输出的是相对原点的向量。
 */
const rotateVector = (
  name: string,
  srcVec: string,
  angleExpr: string,
) => {
  const c = `cos(${angleExpr})`;
  const s = `sin(${angleExpr})`;
  return `${name} = (x(${srcVec})*${c} - y(${srcVec})*${s}, x(${srcVec})*${s} + y(${srcVec})*${c})`;
};

/* ── 8 课的专属构造 ─────────────────────────────────────────────
 *
 * 顺序与「空间、角度与几何探究」逻辑链一致：
 * 直觉测量 → 图形转化 → 定理证明。
 * ────────────────────────────────────────────────────────────── */
export const GEO_CONSTRUCTIONS: Record<string, GeoConstruction> = {
  /* ── geo-01 · 角与度量的本质 ────────────────────────────────
   *
   * 拖动射线端点 C，实时读出角度。让学生自己发现「角的大小只跟
   * 两条射线的**夹角**有关，跟射线画多长没关系」。
   *
   * 画布上有**两条同向射线**：短的金色射线 AC 与可拉长缩短的
   * 蓝色长射线 AD——两者夹角完全相同。
   */
  "geo-01": {
    commands: [
      ...hideAxes(),
      /* 顶点固定在原点 */
      `A = (0, 0)`,
      `SetFixed(A, true)`,
      ...point("A", INK, 9),
      /* 一条固定射线（水平） */
      `B = (7, 0)`,
      `SetFixed(B, true)`,
      ...point("B", INK, 7),
      /* 可拖的另一条射线的端点 */
      `C = (5, 3)`,
      ...point("C", BLUE, 8),
      /* 长射线：与 AC 同向，长度由滑块控制 */
      ...slider("rayStretch", 0.4, 2.5, 0.1),
      `SetValue(rayStretch, 1)`,
      `D = (2*x(C)*rayStretch, 2*y(C)*rayStretch)`,
      ...point("D", GOLD, 7),
      `rayAB = Ray(A, B)`,
      `rayAC = Ray(A, C)`,
      `rayAD = Ray(A, D)`,
      ...stroke("rayAB", INK, 3),
      ...stroke("rayAC", BLUE, 3),
      ...stroke("rayAD", GOLD, 2),
      /* 角度对象——顶点在 A（``Angle(A,B,C)`` 的第二个参数是顶点） */
      `alphaRad = Angle(B, A, C)`,
      `alphaDegV = alphaRad * 180 / pi`,
      /* 长射线上的同一个角——用来对照 */
      `alphaRad2 = Angle(B, A, D)`,
      `alphaDegV2 = alphaRad2 * 180 / pi`,
      showInView("alphaDegV", false),
      showInView("alphaDegV2", false),
      ...stroke("alphaRad", BLUE, 2),
      labelMode("alphaRad", 1),
      showLabel("alphaRad"),
      showAngle("alphaRad"),
      /* 量角器刻度弧 */
      `arc1 = CircularArc(A, B, C)`,
      ...stroke("arc1", GOLD, 2),
      /* 射线长度——用来证明「角的大小与边长无关」 */
      `rayLen = Distance(A, D)`,
      showInView("rayLen", false),
      /* ── 「动手了没有」标志位 ──
       *
       * 把初始值快照下来，之后和学生当前值比对。
       * 见文件头「三段式过关条件的设计原则」。
       */
      ...snapshot("initAlpha", "alphaDegV"),
      ...snapshot("initStretch", "rayStretch"),
      movedFlag("movedRay", "initAlpha", "alphaDegV", 1),
      movedFlag("movedStretch", "initStretch", "rayStretch", 0.05),
    ],
    watch: [
      {
        name: "alphaDegV",
        label: {
          zhCN: "当前角的度数",
          zhTW: "當前角的度數",
          en: "Current angle measure",
        },
        precision: 1,
        unit: "°",
      },
      {
        name: "alphaDegV2",
        label: {
          zhCN: "长射线上的同一个角",
          zhTW: "長射線上的同一個角",
          en: "Same angle on the longer ray",
        },
        precision: 1,
        unit: "°",
      },
      {
        name: "rayLen",
        label: {
          zhCN: "长射线长度",
          zhTW: "長射線長度",
          en: "Length of the longer ray",
        },
        precision: 2,
      },
    ],
    goals: {
      /* 探索：拖动射线 C，角度真的变了。 */
      explore: "movedRay",
      /* 规律：把长射线拉长 / 压短——两个角**始终相等**。 */
      discover: "movedStretch && abs(alphaDegV - alphaDegV2) < 0.01",
      /* 谜题：拖成直角。 */
      mystery: "abs(alphaDegV - 90) < 2",
    },
  },

  /* ── geo-02 · 相交线与平行线的角关系 ──────────────────────
   *
   * 拖动截线，同位角与内错角同步锁定相等。
   *
   * ⚠️ ``Angle(A, B, C)`` 的**第二个参数是顶点**（GeoGebra 源码
   *    ``AlgoAnglePoints`` 的注释写得很明确：``A leg / B vertex /
   *    C leg``）。所以下面每个角都必须把交点放在第二位。
   *
   * ⚠️ GeoGebra 的 ``Angle(A,B,C)`` 返回的是**有向角（弧度）**，
   *    而且是**逆时针**从 A 转到 C 的那个角——顺着写会绕成
   *    反角。取哪条边很讲究（headless 实测）：
   *    - ``Angle(P1, X, Y)`` = 30°   ← 正确的锐角
   *    - ``Angle(P2, X, Y)`` = 150°  ← 反角
   *    - ``Angle(Q2, Y, X)`` = 30°   ← 正确的锐角
   *    - ``Angle(Y, X, P2)`` = 150°  ← 对顶角
   */
  "geo-02": {
    commands: [
      ...hideAxes(),
      /* 两条水平平行线 */
      `P1 = (-10, 3)`,
      `P2 = (10, 3)`,
      `Q1 = (-10, -3)`,
      `Q2 = (10, -3)`,
      ...point("P1", INK, 6),
      ...point("P2", INK, 6),
      ...point("Q1", INK, 6),
      ...point("Q2", INK, 6),
      `l1 = Line(P1, P2)`,
      `l2 = Line(Q1, Q2)`,
      ...stroke("l1", INK, 3),
      ...stroke("l2", INK, 3),
      /* 可拖的截线——用**角度滑块**驱动，交点不会退化 */
      ...slider("tAng", 15, 75, 1),
      `SetValue(tAng, 30)`,
      /* 截线过固定点 F，方向由 tAng 决定 */
      `F = (0, 0)`,
      `SetFixed(F, true)`,
      ...point("F", INK, 6),
      `D3 = (12*cos(tAng*pi/180), 12*sin(tAng*pi/180))`,
      `l3 = Line(F, D3)`,
      ...stroke("l3", BLUE, 3),
      /* 两个交点 */
      `X = Intersect(l1, l3)`,
      `Y = Intersect(l2, l3)`,
      /* 同位角：上直线 l1 与截线在 X 处，顶点 = X */
      `corrRad = Angle(P1, X, Y)`,
      /* 内错角：下直线 l2 与截线在 Y 处，顶点 = Y */
      `altAngle = Angle(Q2, Y, X)`,
      /* 对顶角：l1 与 l3 在 X 处的另一个角 */
      `vertAngle = Angle(Y, X, P2)`,
      /* ── 一律换算成「度」 ──
       *
       * GeoGebra 的角度对象内部是**弧度**。教学上要的是度数，
       * 所以每个角都要乘 ``180/pi``。
       */
      `corrDegV = corrRad * 180 / pi`,
      `altDegV = altAngle * 180 / pi`,
      `vertDeg = vertAngle * 180 / pi`,
      ...stroke("corrRad", BLUE, 2),
      ...stroke("altAngle", GOLD, 2),
      ...stroke("vertAngle", INK, 2),
      labelMode("corrRad", 1),
      labelMode("altAngle", 1),
      labelMode("vertAngle", 1),
      showLabel("corrRad"),
      showLabel("altAngle"),
      showLabel("vertAngle"),
      showAngle("corrRad"),
      showAngle("altAngle"),
      showAngle("vertAngle"),
      showInView("corrDegV", false),
      showInView("altDegV", false),
      showInView("vertDeg", false),
      /* ── 「动手了没有」标志位 ── */
      ...snapshot("initTAng", "tAng"),
      movedFlag("movedTAng", "initTAng", "tAng", 0.5),
    ],
    watch: [
      {
        name: "corrDegV",
        label: {
          zhCN: "同位角",
          zhTW: "同位角",
          en: "Corresponding angle",
        },
        precision: 1,
        unit: "°",
      },
      {
        name: "altDegV",
        label: {
          zhCN: "内错角",
          zhTW: "內錯角",
          en: "Alternate interior angle",
        },
        precision: 1,
        unit: "°",
      },
      {
        name: "vertDeg",
        label: {
          zhCN: "对顶角",
          zhTW: "對頂角",
          en: "Vertical angle",
        },
        precision: 1,
        unit: "°",
      },
    ],
    goals: {
      /* 探索：真的把截线转动了。 */
      explore: "movedTAng",
      /* 规律：转完之后，同位角 == 内错角（平行线的性质）。 */
      discover: "movedTAng && abs(corrDegV - altDegV) < 0.01",
      /* 谜题：把截线调到 45°——此时对顶角正好 135°。 */
      mystery: "abs(corrDegV - 45) < 1 && abs(vertDeg - 135) < 1",
    },
  },

  /* ── geo-03 · 三角形内角和与分类 ─────────────────────────
   *
   * 拖动顶点，三个内角实时相加——学生自己撞出「180°」这条线。
   */
  "geo-03": {
    commands: [
      ...hideAxes(),
      /* 三个可拖顶点——初始是**不等边**的三角形 */
      `P = (-4, -2)`,
      `Q = (4, -2)`,
      `R = (1, 5)`,
      ...point("P", BLUE, 8),
      ...point("Q", BLUE, 8),
      ...point("R", BLUE, 8),
      `tri = Polygon(P, Q, R)`,
      fill("tri", FILL, 40),
      ...stroke("tri", BLUE, 3),
      /* 三个内角
       *
       * ⚠️ **必须用 ``InteriorAngles(tri)``**，不能用
       *    ``Angle(P, Q, R)``。
       *
       *    两个原因：
       *
       *    1. ``Angle(A,B,C)`` 返回的是**有向角（弧度）**——
       *       顶点算对了也可能绕成反角。实测
       *       ``Angle(P,Q,R)`` 给的是 299.7° 而不是 60.3°。
       *    2. ``InteriorAngles`` 直接返回**三角形的内角**，
       *       值域保证在 0–180°，正是教学要的。
       *
       *    返回值是一个**列表** ``intAngles``，三个角对象的标签
       *    分别是 ``intAngles_1`` / ``intAngles_2`` /
       *    ``intAngles_3``——**用下划线**，不是花括号。
       *
       *    实测：``ia_{1}`` 取不到值（恒为 0），
       *    ``intAngles_1`` 才拿得到真实的 60.26°。
       */
      `intAngles = InteriorAngles(tri)`,
      /* 一律换算成「度」——GeoGebra 角度内部是弧度 */
      `degA1 = intAngles_1 * 180 / pi`,
      `degA2 = intAngles_2 * 180 / pi`,
      `degA3 = intAngles_3 * 180 / pi`,
      /* 内角和——实时求值 */
      `angleSum = degA1 + degA2 + degA3`,
      showInView("angleSum", false),
      showInView("degA1", false),
      showInView("degA2", false),
      showInView("degA3", false),
      /* 三边长度——用来把「边角关系」做成可验证的量 */
      `sideA = Distance(P, Q)`,
      `sideB = Distance(Q, R)`,
      `sideC = Distance(R, P)`,
      showInView("sideA", false),
      showInView("sideB", false),
      showInView("sideC", false),
      /* ── 「动手了没有」标志位 ──
       *
       * ⚠️ 快照的是 **degA1** 而不是 angleSum——因为内角和**恒定
       *    是 180°**，拿它做快照永远测不出「动过」。
       */
      ...snapshot("initA1", "degA1"),
      movedFlag("movedTri", "initA1", "degA1", 1),
    ],
    watch: [
      {
        name: "degA1",
        label: { zhCN: "∠P", zhTW: "∠P", en: "Angle P" },
        precision: 1,
        unit: "°",
      },
      {
        name: "degA2",
        label: { zhCN: "∠Q", zhTW: "∠Q", en: "Angle Q" },
        precision: 1,
        unit: "°",
      },
      {
        name: "degA3",
        label: { zhCN: "∠R", zhTW: "∠R", en: "Angle R" },
        precision: 1,
        unit: "°",
      },
      {
        name: "angleSum",
        label: {
          zhCN: "三个内角之和",
          zhTW: "三個內角之和",
          en: "Sum of interior angles",
        },
        precision: 2,
        unit: "°",
      },
    ],
    goals: {
      /* 探索：真的拖动了某个顶点。 */
      explore: "movedTri",
      /* 规律：拖完之后，内角和依然是 180°。 */
      discover: "movedTri && abs(angleSum - 180) < 0.5",
      /* 谜题：做一个**等边三角形**——三个角都必须是 60°。
       *
       * ⚠️ 不能写 ``abs(degA1 - degA2) < 2 && abs(degA2 - degA3) < 2``。
       *    那样只要三个角「彼此接近」就算过——而**初始状态**
       *    就是 54.5° / 66.8° / 58.7°，三个角彼此相差 12°，
       *    门槛太松，几乎一进门就达标，谜题形同虚设。
       *
       *    所以改成「三个角都逼近 60°」——这才是「等边」的
       *    准确判据，而且初始状态过不了，拖对了才过。
       */
      mystery: "abs(degA1 - 60) < 1 && abs(degA2 - 60) < 1 && abs(degA3 - 60) < 1",
    },
  },

  /* ── geo-04 · 多边形面积的剪拼与转化 ──────────────────────
   *
   * 拖动滑块，把平行四边形现场剪拼成等面积长方形。
   */
  "geo-04": {
    commands: [
      ...hideAxes(),
      /* 平行四边形：底与斜边都随滑块移动
       *
       * ⚠️ 滑块必须用**标签赋值**建出来（``s1 = Slider(...)``），
       *    名字才能挂到滑块对象上——否则后面 ``D = (s1, 3)`` 里的
       *    ``s1`` 找不到东西，平行四边形根本不会跟着动。
       *
       * ⚠️ **滑块初值 = 下限**，所以要显式设一个非目标的初值。
       */
      ...slider("baseLen", 3, 10, 0.5),
      `SetValue(baseLen, 5)`,
      ...slider("slantAmt", 0, 3, 0.5),
      `SetValue(slantAmt, 1)`,
      /* 平行四边形四点（全部固定，只有滑块在动） */
      `A = (0, 0)`,
      `B = (baseLen, 0)`,
      `D = (slantAmt, 3)`,
      `C = (baseLen + slantAmt, 3)`,
      `SetFixed(A, true)`,
      `SetFixed(B, true)`,
      `SetFixed(D, true)`,
      `SetFixed(C, true)`,
      ...point("A", BLUE, 7),
      ...point("B", BLUE, 7),
      ...point("D", BLUE, 7),
      ...point("C", BLUE, 7),
      `par = Polygon(A, B, C, D)`,
      fill("par", FILL, 40),
      ...stroke("par", BLUE, 3),
      /* 剪拼出来的长方形（等价面积） */
      `E = (slantAmt, 0)`,
      `F = (baseLen + slantAmt, 0)`,
      `G = (baseLen + slantAmt, 3)`,
      `H = (slantAmt, 3)`,
      `SetFixed(E, true)`,
      `SetFixed(F, true)`,
      `SetFixed(G, true)`,
      `SetFixed(H, true)`,
      `rect = Polygon(E, F, G, H)`,
      fill("rect", FILL2, 35),
      ...stroke("rect", GOLD, 2),
      /* 面积 */
      `parArea = Area(par)`,
      `rectArea = Area(rect)`,
      showInView("parArea", false),
      showInView("rectArea", false),
      /* 高 */
      `height = Distance(D, Line(A, B))`,
      showInView("height", false),
      /* ── 「动手了没有」标志位 ── */
      ...snapshot("initBase", "baseLen"),
      ...snapshot("initSlant", "slantAmt"),
      movedFlag("movedBase", "initBase", "baseLen", 0.05),
      movedFlag("movedSlant", "initSlant", "slantAmt", 0.05),
    ],
    watch: [
      {
        name: "parArea",
        label: {
          zhCN: "平行四边形面积",
          zhTW: "平行四邊形面積",
          en: "Parallelogram area",
        },
        precision: 2,
      },
      {
        name: "rectArea",
        label: {
          zhCN: "剪拼后长方形面积",
          zhTW: "剪拼後長方形面積",
          en: "Rectangle area after cutting",
        },
        precision: 2,
      },
      {
        name: "height",
        label: { zhCN: "高", zhTW: "高", en: "Height" },
        precision: 2,
      },
    ],
    goals: {
      /* 探索：真的动过滑块。 */
      explore: "movedBase || movedSlant",
      /* 规律：动完之后，剪拼前后面积恒等。 */
      discover:
        "(movedBase || movedSlant) && abs(parArea - rectArea) < 0.01",
      /* 谜题：把底调成 8，面积为 8×3 = 24。
       *
       * ⚠️ 初始 baseLen = 5 → 面积 15，**不达标**；
       *    学生必须把底拖到 8（面积 24）才能过关。
       */
      mystery: "abs(parArea - 24) < 0.5",
    },
  },

  /* ── geo-05 · 轴对称、平移与旋转变换 ──────────────────────
   *
   * 拖动对称轴与旋转角，看图形翻折重合。
   *
   * ⚠️ ``Mirror(对象, 轴)`` 是 GeoGebra 里的**反射**命令——
   *    英文界面上写作 ``Reflect``，但 ``Commands`` 枚举把
   *    ``Reflect`` 直接映射到 ``Mirror``，两者等价。
   */
  "geo-05": {
    commands: [
      ...hideAxes(),
      /* 原图形 */
      `A = (-5, -2)`,
      `B = (-1, -2)`,
      `C = (-3, 2)`,
      `SetFixed(A, true)`,
      `SetFixed(B, true)`,
      `SetFixed(C, true)`,
      ...point("A", BLUE, 8),
      ...point("B", BLUE, 8),
      ...point("C", BLUE, 8),
      `orig = Polygon(A, B, C)`,
      fill("orig", FILL, 40),
      ...stroke("orig", BLUE, 3),
      /* 对称轴：一条**滑块驱动**的竖直线 */
      ...slider("axisX", -12, 4, 0.5),
      `SetValue(axisX, -12)`,
      `AX1 = (axisX, -9)`,
      `AX2 = (axisX, 9)`,
      `SetFixed(AX1, true)`,
      `SetFixed(AX2, true)`,
      `mirrorLine = Line(AX1, AX2)`,
      ...stroke("mirrorLine", GOLD, 2),
      /* 镜像三角形 */
      `A2 = Mirror(A, mirrorLine)`,
      `B2 = Mirror(B, mirrorLine)`,
      `C2 = Mirror(C, mirrorLine)`,
      `refl = Polygon(A2, B2, C2)`,
      fill("refl", FILL2, 30),
      ...stroke("refl", GOLD, 2),
      /* 旋转角滑块——名字一次性定好，后面不要再重复赋值 */
      ...slider("rotAngle", 0, 360, 1, true),
      `SetValue(rotAngle, 0)`,
      /* 旋转中心（与三角形的重心一致） */
      `hub = (-3, -0.666667)`,
      `SetFixed(hub, true)`,
      ...point("hub", INK, 6),
      /* ⚠️ ``Rotate(polygon, angle, point)`` 不存在，三参数的
       *    ``Rotate(point, angle, point)`` 也**静默失败**——
       *    实测返回未定义点。所以这里**手写旋转公式**，
       *    逐点算。 */
      rotatePoint("A3", "A", "hub", "rotAngle*pi/180"),
      rotatePoint("B3", "B", "hub", "rotAngle*pi/180"),
      rotatePoint("C3", "C", "hub", "rotAngle*pi/180"),
      `rot = Polygon(A3, B3, C3)`,
      fill("rot", FILL3, 30),
      ...stroke("rot", INK, 2),
      /* 顶点到镜像点 / 到旋转像的距离 */
      `mirrorGap = Distance(A, A2)`,
      `rotGap = Distance(A, A3)`,
      showInView("mirrorGap", false),
      showInView("rotGap", false),
      /* 重合度：镜像图形的三个顶点与原图形顶点**逐一吻合**的程度。
       *
       * ⚠️ 不能用 ``mirrorGap`` 当重合判据——原三角形 A 在 -5，
       *    镜像 A2 在轴另一侧，两者重合时 A2 落在 **B** 上，
       *    ``Distance(A, A2)`` 仍然是 4（等于底边长），不是 0。
       *    所以真正要量的是「镜像顶点有没有落到对应顶点上」。
       */
      `matchDist = Distance(A2, B) + Distance(B2, A) + Distance(C2, C)`,
      showInView("matchDist", false),
      /* ── 「动手了没有」标志位 ── */
      ...snapshot("initAxis", "axisX"),
      ...snapshot("initRot", "rotAngle"),
      movedFlag("movedAxis", "initAxis", "axisX", 0.05),
      movedFlag("movedRot", "initRot", "rotAngle", 1),
    ],
    watch: [
      {
        name: "matchDist",
        label: {
          zhCN: "镜像与原图的吻合度",
          zhTW: "鏡像與原圖的吻合度",
          en: "How well the mirror image matches",
        },
        precision: 2,
      },
      {
        name: "mirrorGap",
        label: {
          zhCN: "顶点到镜像点的距离",
          zhTW: "頂點到鏡像點的距離",
          en: "Distance from vertex to its mirror",
        },
        precision: 2,
      },
      {
        name: "rotGap",
        label: {
          zhCN: "顶点到旋转像的距离",
          zhTW: "頂點到旋轉像的距離",
          en: "Distance from vertex to its rotated image",
        },
        precision: 2,
      },
    ],
    goals: {
      /* 探索：真的动过对称轴或旋转角。 */
      explore: "movedAxis || movedRot",
      /* 规律：把对称轴拖到三角形中间 → 镜像与原图**完全重合**。 */
      discover: "movedAxis && abs(matchDist) < 0.01",
      /* 谜题：把对称轴拖到 x = 1——镜像顶点离原顶点正好 12。 */
      mystery: "abs(mirrorGap - 12) < 0.2",
    },
  },

  /* ── geo-06 · 勾股定理的面积几何证明 ──────────────────────
   *
   * 拖动直角顶点，两条直角边上的正方形面积之和实时等于斜边正方形。
   *
   * ⚠️ **每个多边形的顶点都必须是命名点**。写成
   *    ``Polygon(O, X, X + (0, legA), (0, legA))`` 会**静默退化**
   *    成面积为 0 的多边形——因为 ``X + (0, legA)`` 不是命名点。
   */
  "geo-06": {
    commands: [
      ...hideAxes(),
      /* 直角三角形：直角顶点在原点，两条直角边沿坐标轴 */
      `O = (0, 0)`,
      `SetFixed(O, true)`,
      `X = (2, 0)`,
      `Y = (0, 3)`,
      ...point("X", BLUE, 8),
      ...point("Y", BLUE, 8),
      `tri = Polygon(O, X, Y)`,
      fill("tri", FILL, 45),
      ...stroke("tri", BLUE, 3),
      /* 两条直角边的长度 */
      `legA = Distance(O, X)`,
      `legB = Distance(O, Y)`,
      showInView("legA", false),
      showInView("legB", false),
      /* 直角边 a 上的正方形（顶点全部命名） */
      `PA1 = (0, legA)`,
      `PA2 = (legA, legA)`,
      `sqA = Polygon(O, X, PA2, PA1)`,
      fill("sqA", FILL, 35),
      ...stroke("sqA", BLUE, 2),
      /* 直角边 b 上的正方形 */
      `PB1 = (legB, 0)`,
      `PB2 = (legB, legB)`,
      `sqB = Polygon(O, Y, PB2, PB1)`,
      fill("sqB", FILL2, 35),
      ...stroke("sqB", GOLD, 2),
      /* 斜边上的正方形：先算「垂直于斜边」的向量 */
      `hypVec = X - Y`,
      rotateVector("hypPerp", "hypVec", "90*pi/180"),
      `PC1 = Y + hypPerp`,
      `PC2 = X + hypPerp`,
      `sqC = Polygon(X, Y, PC1, PC2)`,
      fill("sqC", FILL3, 35),
      ...stroke("sqC", INK, 2),
      /* 面积：正方形面积 = 边长² */
      `sqAreaA = Area(sqA)`,
      `sqAreaB = Area(sqB)`,
      `sqAreaC = Area(sqC)`,
      showInView("sqAreaA", false),
      showInView("sqAreaB", false),
      showInView("sqAreaC", false),
      `sqAreaSum = sqAreaA + sqAreaB`,
      showInView("sqAreaSum", false),
      /* ── 「动手了没有」标志位 ──
       *
       * ⚠️ 快照的是**两个**正方形面积——只盯一个的话，
       *    学生只拖另一个顶点时就测不出「动过」。
       */
      ...snapshot("initAreaA", "sqAreaA"),
      ...snapshot("initAreaB", "sqAreaB"),
      movedFlag("movedLegA", "initAreaA", "sqAreaA", 0.05),
      movedFlag("movedLegB", "initAreaB", "sqAreaB", 0.05),
    ],
    watch: [
      {
        name: "sqAreaA",
        label: {
          zhCN: "直角边 a 上的正方形面积",
          zhTW: "直角邊 a 上的正方形面積",
          en: "Area on leg a",
        },
        precision: 2,
      },
      {
        name: "sqAreaB",
        label: {
          zhCN: "直角边 b 上的正方形面积",
          zhTW: "直角邊 b 上的正方形面積",
          en: "Area on leg b",
        },
        precision: 2,
      },
      {
        name: "sqAreaC",
        label: {
          zhCN: "斜边上的正方形面积",
          zhTW: "斜邊上的正方形面積",
          en: "Area on the hypotenuse",
        },
        precision: 2,
      },
    ],
    goals: {
      /* 探索：真的拖动了某个直角顶点。 */
      explore: "movedLegA || movedLegB",
      /* 规律：动完之后，两直角边正方形面积之和 **恒等于** 斜边正方形面积。 */
      discover:
        "(movedLegA || movedLegB) && abs(sqAreaC - sqAreaSum) < 0.01",
      /* 谜题：拖成 3-4-5 直角三角形，斜边正方形面积 = 25。
       *
       * ⚠️ 初始是 2-3-√13，面积为 13——**不达标**。
       */
      mystery: "abs(sqAreaC - 25) < 0.5",
    },
  },

  /* ── geo-07 · 相似图形与比例缩放 ──────────────────────────
   *
   * 拖动缩放滑块 kScale，实时对比边长比 kScale 与面积比 k²。
   */
  "geo-07": {
    commands: [
      ...hideAxes(),
      /* 原三角形 */
      `A = (-6, -2)`,
      `B = (-3, -2)`,
      `C = (-4.5, 1)`,
      `SetFixed(A, true)`,
      `SetFixed(B, true)`,
      `SetFixed(C, true)`,
      ...point("A", BLUE, 7),
      ...point("B", BLUE, 7),
      ...point("C", BLUE, 7),
      `orig = Polygon(A, B, C)`,
      fill("orig", FILL, 40),
      ...stroke("orig", BLUE, 3),
      /* 位似中心 */
      `O = (-1, 0)`,
      `SetFixed(O, true)`,
      ...point("O", INK, 6),
      /* 缩放滑块——⚠️ 初值 = 下限，要显式设成 1.5 */
      ...slider("kScale", 0.5, 3, 0.1),
      `SetValue(kScale, 1.5)`,
      /* 位似后的图形 */
      `A2 = Dilate(A, kScale, O)`,
      `B2 = Dilate(B, kScale, O)`,
      `C2 = Dilate(C, kScale, O)`,
      `scaled = Polygon(A2, B2, C2)`,
      fill("scaled", FILL3, 30),
      ...stroke("scaled", INK, 2),
      /* 边长比与面积比 */
      `lenRatioV = Distance(A2, B2) / Distance(A, B)`,
      `areaRatioV = Area(scaled) / Area(orig)`,
      showInView("lenRatioV", false),
      showInView("areaRatioV", false),
      `lenOrig = Distance(A, B)`,
      `lenScaled = Distance(A2, B2)`,
      `areaA = Area(orig)`,
      `areaB = Area(scaled)`,
      showInView("lenOrig", false),
      showInView("lenScaled", false),
      showInView("areaA", false),
      showInView("areaB", false),
      /* ── 「动手了没有」标志位 ── */
      ...snapshot("initK", "kScale"),
      movedFlag("movedK", "initK", "kScale", 0.05),
    ],
    watch: [
      {
        name: "kScale",
        label: {
          zhCN: "缩放比 k",
          zhTW: "縮放比 k",
          en: "Scale factor k",
        },
        precision: 2,
      },
      {
        name: "lenRatioV",
        label: {
          zhCN: "边长比",
          zhTW: "邊長比",
          en: "Ratio of side lengths",
        },
        precision: 3,
      },
      {
        name: "areaRatioV",
        label: {
          zhCN: "面积比",
          zhTW: "面積比",
          en: "Ratio of areas",
        },
        precision: 3,
      },
    ],
    goals: {
      /* 探索：真的动过缩放滑块。 */
      explore: "movedK",
      /* 规律：动完之后，面积比 == 边长比的平方（k²）。 */
      discover: "movedK && abs(areaRatioV - kScale^2) < 0.01",
      /* 谜题：把缩放比调到 **2**——边长比 2，面积比 4。 */
      mystery: "abs(kScale - 2) < 0.05 && abs(areaRatioV - 4) < 0.05",
    },
  },

  /* ── geo-08 · 圆心角与圆周角定律 ──────────────────────────
   *
   * 拖动圆上的点，亲眼验证同弧所对圆周角恒为圆心角的一半。
   *
   * ⚠️ ``Point(circle, angle)`` **是坏的**——实测不管传什么角度，
   *    返回的都是圆上同一个点。圆上取点必须自己写坐标。
   */
  "geo-08": {
    commands: [
      ...hideAxes(),
      /* 圆 */
      `O = (0, 0)`,
      `SetFixed(O, true)`,
      `r = 5`,
      `sideA = Circle(O, r)`,
      fill("sideA", FILL, 12),
      ...stroke("sideA", INK, 3),
      /* 弧的半张角——滑块控制弧宽 */
      ...slider("arcSpan", 20, 70, 1),
      `SetValue(arcSpan, 30)`,
      /* 圆周角顶点的偏移角——滑块控制它在**另一半弧**上滑行 */
      ...slider("qOff", -60, 60, 1),
      `SetValue(qOff, 0)`,
      /* 弧的两端点（对称分布） */
      `P = (r*cos(-arcSpan*pi/180), r*sin(-arcSpan*pi/180))`,
      `S = (r*cos(arcSpan*pi/180), r*sin(arcSpan*pi/180))`,
      ...point("P", BLUE, 8),
      ...point("S", BLUE, 8),
      /* 圆周上的第三个点——在**大弧**上（180° ± 偏移） */
      `Q = (r*cos((180 + qOff)*pi/180), r*sin((180 + qOff)*pi/180))`,
      ...point("Q", GOLD, 8),
      /* 圆心角 P O S（顶点 O） */
      `centralRad = Angle(P, O, S)`,
      /* 圆周角 P Q S（顶点 Q）——同弧 PS 所对 */
      `inscribedRad = Angle(P, Q, S)`,
      /* 一律换算成「度」 */
      `centralDegV = centralRad * 180 / pi`,
      `inscribedDegV = inscribedRad * 180 / pi`,
      /* 比值——验证「一半」 */
      `angleRatio = centralDegV / inscribedDegV`,
      showInView("centralDegV", false),
      showInView("inscribedDegV", false),
      showInView("angleRatio", false),
      ...stroke("centralRad", BLUE, 2),
      ...stroke("inscribedRad", GOLD, 2),
      labelMode("centralRad", 1),
      labelMode("inscribedRad", 1),
      showLabel("centralRad"),
      showLabel("inscribedRad"),
      showAngle("centralRad"),
      showAngle("inscribedRad"),
      /* 两条半径与三条弦 */
      `rad1 = Segment(O, P)`,
      `rad2 = Segment(O, S)`,
      `chord1 = Segment(P, S)`,
      `chord2 = Segment(P, Q)`,
      `chord3 = Segment(Q, S)`,
      ...stroke("rad1", INK, 2),
      ...stroke("rad2", INK, 2),
      ...stroke("chord1", BLUE, 2),
      ...stroke("chord2", GOLD, 2),
      ...stroke("chord3", GOLD, 2),
      /* ── 「动手了没有」标志位 ── */
      ...snapshot("initSpan", "arcSpan"),
      ...snapshot("initQOff", "qOff"),
      movedFlag("movedSpan", "initSpan", "arcSpan", 0.5),
      movedFlag("movedQOff", "initQOff", "qOff", 0.5),
    ],
    watch: [
      {
        name: "centralDegV",
        label: {
          zhCN: "圆心角",
          zhTW: "圓心角",
          en: "Central angle",
        },
        precision: 1,
        unit: "°",
      },
      {
        name: "inscribedDegV",
        label: {
          zhCN: "同弧所对的圆周角",
          zhTW: "同弧所對的圓周角",
          en: "Inscribed angle on the same arc",
        },
        precision: 1,
        unit: "°",
      },
      {
        name: "angleRatio",
        label: {
          zhCN: "圆心角 ÷ 圆周角",
          zhTW: "圓心角 ÷ 圓周角",
          en: "Central ÷ inscribed",
        },
        precision: 3,
      },
    ],
    goals: {
      /* 探索：真的动过滑块。 */
      explore: "movedSpan || movedQOff",
      /* 规律：动完之后，圆心角 ÷ 圆周角 **恒为 2**。 */
      discover: "(movedSpan || movedQOff) && abs(angleRatio - 2) < 0.01",
      /* 谜题：把弧调到半张角 45°（即圆心角 90°、圆周角 45°）。 */
      mystery: "abs(centralDegV - 90) < 1 && abs(inscribedDegV - 45) < 1",
    },
  },
};
