"use client";

/**
 * GeoGebra 统一引擎组件
 * ======================
 *
 * 全站几何教具的**唯一**渲染入口——真实接入 GeoGebra 官方
 * ``deployggb.js`` 引擎，不画任何手绘方块。
 *
 * 为什么用真引擎
 * --------------
 *
 * 手画的 SVG 方块只能做「看起来像」的事：拖动时没有真实的角度
 * 计算、没有实时求值、没有不变量的自动判定。GeoGebra 是真正的
 * 动态几何引擎——拖动顶点时，角度、面积、相似比都是**引擎算出来
 * 的**，不是我们在 React 里重新实现的公式。
 *
 * 语言纯净
 * --------
 *
 * ⛔ GeoGebra 内置界面（工具栏、右键菜单）有 40+ 种语言。传错
 *    ``language`` 参数，学生在英文站上会看到一个德语工具栏。
 *
 * 这里把站内语言**严格映射**到 GeoGebra 的语言码：
 *
 * | 站内 | GeoGebra |
 * |---|---|
 * | ``zh-CN`` | ``zh_CN`` |
 * | ``zh-TW`` | ``zh_TW`` |
 * | ``en`` | ``en`` |
 *
 * 映射不到时**回退英文**，绝不留空——空字符串会让 GeoGebra 用它
 * 的默认语言（可能是浏览器语言），那就彻底串了。
 *
 * 双向追踪
 * --------
 *
 * ⛔ 这解决了「LIVE CONTEXT 假死」的老毛病。
 *
 * 之前是组件自己维护一个 state，然后写死一句「把砝码拖一拖」。
 * 学生拖了半天，右边那句话纹丝不动——因为根本没有真数据。
 *
 * 现在：
 *
 * - ``api.registerUpdateListener()`` —— 引擎里**任何**对象变动都会
 *   触发回调；
 * - ``api.getValue(name)`` —— 读回真实数值。
 *
 * 所以右侧面板显示的每个数字，都是**引擎此刻的真实状态**。
 */

import { useCallback, useEffect, useRef } from "react";
import { useLocale } from "@/context/LocaleContext";

/** GeoGebra 的 applet API（只声明我们用到的部分）。 */
interface GeoGebraApi {
  evalCommand: (cmd: string, opts?: boolean) => void;
  getValue: (name: string) => number;
  setValue?: (name: string, value: number) => void;
  registerUpdateListener: (cb: () => void) => void;
  unregisterUpdateListener: (cb: () => void) => void;
  setLanguage?: (lang: string) => void;
}

/** GeoGebra 全局。 */
interface GeoGebraGlobal {
  GGBApplet?: {
    new (
      parameters: Record<string, string | number | boolean>,
      register: (api: GeoGebraApi) => void,
    ): {
      inject: (element: HTMLElement) => void;
    };
  };
}

/** 站内语言 → GeoGebra 语言码。 */
const GEO_LANGUAGE: Record<string, string> = {
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
  en: "en",
};

/** deployggb.js 的 CDN 地址。 */
const DEPLOY_URL = "https://www.geogebra.org/apps/deployggb.js";

/** 引擎内部用来承载「过关判定」的数字对象名。 */
const GOAL_FLAG = "oeGoalFlag";

/** 一条被追踪的实时量。 */
export interface LiveReading {
  name: string;
  label: string;
  value: string;
}

/** 被追踪量的定义。 */
export interface GeoWatchSpec {
  name: string;
  label: { zhCN: string; zhTW: string; en: string };
  precision?: number;
  unit?: string;
}

/** 引擎组件的属性。 */
export interface GeoGebraStudioProps {
  /** 要注入的构造指令。 */
  commands: string[];
  /** 要实时追踪的量。 */
  watch: GeoWatchSpec[];
  /** 过关条件（GeoGebra 布尔表达式）。 */
  goals: { explore: string; discover: string; mystery: string };
  /** 当前阶段。 */
  stage: "explore" | "discover" | "mystery";
  /** 引擎加载状态。 */
  onStatus?: (status: "loading" | "ready" | "error") => void;
  /** 实时读数更新。 */
  onReadings?: (readings: LiveReading[]) => void;
  /** 过关条件达成。 */
  onGoalMet?: (stage: "explore" | "discover" | "mystery") => void;
  /** 引擎报错。 */
  onError?: (message: string) => void;
}

/** deployggb.js 的加载状态（全局共享，只加载一次）。 */
let deployPromise: Promise<void> | null = null;

/**
 * 加载 ``deployggb.js``。
 *
 * 只加载一次——多个实验台来回切时不该反复打网络。
 */
function loadDeployGgb(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SSR"));
  }
  if ((window as unknown as GeoGebraGlobal).GGBApplet) {
    return Promise.resolve();
  }
  if (deployPromise) return deployPromise;

  deployPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = DEPLOY_URL;
    script.async = true;
    script.onload = () => {
      /* GGBApplet 可能比脚本稍晚就绪——轮询等一小会儿 */
      let tries = 0;
      const check = () => {
        if ((window as unknown as GeoGebraGlobal).GGBApplet) {
          resolve();
          return;
        }
        tries += 1;
        if (tries > 60) {
          reject(new Error("GeoGebra 引擎加载超时"));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    };
    script.onerror = () => reject(new Error("GeoGebra 引擎加载失败"));
    document.head.appendChild(script);
  });

  return deployPromise;
}

export default function GeoGebraStudio({
  commands,
  watch,
  goals,
  stage,
  onStatus,
  onReadings,
  onGoalMet,
  onError,
}: GeoGebraStudioProps) {
  const { locale } = useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GeoGebraApi | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<number | null>(null);
  /** 已经报过的过关，避免反复触发。 */
  const firedRef = useRef<Set<string>>(new Set());

  /* ── 稳定引用 ──
   *
   * 引擎**只在挂载时建一次**。语言、阶段、目标都通过 ref 读取——
   * 重建引擎会清空学生已经做过的操作，那是不可接受的。
   */
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const watchRef = useRef(watch);
  watchRef.current = watch;
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const onReadingsRef = useRef(onReadings);
  onReadingsRef.current = onReadings;
  const onGoalMetRef = useRef(onGoalMet);
  onGoalMetRef.current = onGoalMet;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /* ── 读数格式化 ──────────────────────────────────────────── */

  const formatReadings = useCallback((api: GeoGebraApi): LiveReading[] => {
    const currentLocale = localeRef.current;
    return watchRef.current.map((w) => {
      let raw = 0;
      try {
        raw = api.getValue(w.name);
      } catch {
        raw = 0;
      }
      const label =
        currentLocale === "en"
          ? w.label.en
          : currentLocale === "zh-TW"
            ? w.label.zhTW
            : w.label.zhCN;
      const n = Number.isFinite(raw) ? raw : 0;
      return {
        name: w.name,
        label,
        value: `${n.toFixed(w.precision ?? 2)}${w.unit ?? ""}`,
      };
    });
  }, []);

  /* ── 引擎初始化 ──────────────────────────────────────────── */

  useEffect(() => {
    let disposed = false;
    onStatusRef.current?.("loading");

    loadDeployGgb()
      .then(() => {
        if (disposed) return;
        const GGBApplet = (window as unknown as GeoGebraGlobal).GGBApplet;
        if (!GGBApplet) throw new Error("GeoGebra 引擎不可用");

        const container = containerRef.current;
        if (!container) return;

        const geoLanguage = GEO_LANGUAGE[localeRef.current] ?? "en";

        const applet = new GGBApplet(
          {
            appName: "OE GeoGebra Studio",
            /* 画布尺寸用百分比——由 inject 后的容器决定 */
            width: 100,
            height: 100,
            /* 界面：全关，只留干净画布 */
            showMenuBar: false,
            showAlgebraInput: false,
            showToolbar: false,
            showToolHelp: false,
            showInputBar: false,
            showPerspective: false,
            allowSelectionExport: false,
            /* 重置图标保留——学生需要能一键还原初始状态 */
            showResetIcon: true,
            /* 标签不可拖——标签乱飘会让人分不清哪个是哪个 */
            enableLabelDrags: false,
            /* 边框色 */
            borderColor: "#E2E8F0",
            /* 语言：严格跟随站内语言 */
            language: geoLanguage,
            /* 允许缩放 */
            shiftZoomScale: true,
          },
          (api: GeoGebraApi) => {
            if (disposed) return;
            apiRef.current = api;
            onStatusRef.current?.("ready");

            /* 注入本课构造 + 过关判定用的标志位 */
            try {
              api.evalCommand(`${GOAL_FLAG} = 0`);
              for (const cmd of commands) {
                api.evalCommand(cmd);
              }
            } catch (err) {
              onErrorRef.current?.(
                err instanceof Error ? err.message : "GeoGebra 构造注入失败",
              );
              return;
            }

            /* ── 双向追踪 ──
             *
             * 引擎里任何对象变动都会触发这个回调——包括拖动点、
             * 移动滑块、改变角度。我们在里面读回真实数值。
             */
            const listener = () => {
              const current = apiRef.current;
              if (!current) return;

              /* 推给右侧面板 */
              onReadingsRef.current?.(formatReadings(current));

              /* 判定过关条件。
               *
               * ⛔ **不能**用
               *    ``If(条件, SetValue(flag,1), SetValue(flag,0))``。
               *
               *    实测（headless GeoGebra）：这种写法**永远得到 0**，
               *    而且不报任何错。``SetValue`` 是脚本命令，它在
               *    ``If`` 的分支里求值时不会真正写回数值。
               *
               *    正确做法是**让引擎把条件算成一个数字对象**，
               *    再用 ``getValue`` 读回来：
               *
               *    ``oeGoalFlag = If(条件, 1, 0)`` → 读 ``oeGoalFlag``
               *
               *    这样「过关判定」就完全交给引擎算，React 侧只
               *    负责读结果——不存在「自己实现一遍逻辑」的问题。
               */
              const expr = goalsRef.current?.[stageRef.current];
              if (!expr) return;
              try {
                current.evalCommand(`${GOAL_FLAG} = If(${expr}, 1, 0)`);
                const met = current.getValue(GOAL_FLAG) > 0.5;
                if (met && !firedRef.current.has(stageRef.current)) {
                  firedRef.current.add(stageRef.current);
                  onGoalMetRef.current?.(stageRef.current);
                }
              } catch {
                /* 表达式不合法——忽略，不影响其它追踪 */
              }
            };

            listenerRef.current = listener;
            api.registerUpdateListener(listener);

            /* 首次读数 */
            onReadingsRef.current?.(formatReadings(api));

            /* 启动一个低频轮询——GeoGebra 的 updateListener 在某些
               操作下不触发，用轮询兜底，保证面板永远活着。 */
            pollRef.current = window.setInterval(() => {
              if (disposed) return;
              const api2 = apiRef.current;
              if (!api2) return;
              onReadingsRef.current?.(formatReadings(api2));
            }, 600);
          },
        );

        container.innerHTML = "";
        applet.inject(container);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        onStatusRef.current?.("error");
        onErrorRef.current?.(
          err instanceof Error ? err.message : "GeoGebra 引擎加载失败",
        );
      });

    return () => {
      disposed = true;
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      const api = apiRef.current;
      if (api && listenerRef.current) {
        try {
          api.unregisterUpdateListener(listenerRef.current);
        } catch {
          /* 引擎已销毁——忽略 */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 语言切换：只改引擎语言，不重建 ──
   *
   * 重建引擎会把学生的操作全部清空。GeoGebra 提供了
   * ``setLanguage()``——用它就地切换。
   */
  useEffect(() => {
    const api = apiRef.current;
    if (!api?.setLanguage) return;
    try {
      api.setLanguage(GEO_LANGUAGE[locale] ?? "en");
    } catch {
      /* 引擎未就绪——下次加载时用的是最新的 localeRef */
    }
  }, [locale]);

  /* 阶段切换时重置「已报过」的记录——不同阶段是不同目标。 */
  useEffect(() => {
    firedRef.current.delete(stage);
  }, [stage]);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white"
    />
  );
}
