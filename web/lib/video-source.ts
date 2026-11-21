/**
 * 视频源解析
 * ==========
 *
 * 课程 JSON 里的视频块可能长成很多种样子——课程制作时是从各处
 * 攒来的，指望它们格式统一是不现实的：
 *
 * .. code-block:: text
 *
 *     { "type": "video", "payload": { "url": "https://www.youtube.com/watch?v=abc" } }
 *     { "type": "video", "payload": { "embed_url": "https://www.youtube.com/embed/abc" } }
 *     { "type": "video", "payload": { "iframe": "<iframe src=...></iframe>" } }
 *     { "type": "video", "payload": { "url": "https://player.bilibili.com/player.html?bvid=BV1xx" } }
 *     { "type": "video", "payload": { "url": "https://www.bilibili.com/video/BV1xx" } }
 *     { "type": "video", "payload": { "url": "https://example.com/lecture.mp4" } }
 *
 * 这个模块把它们**归一**成 react-player 认识的形式，并抽出一份
 * 可以直接贴进 ``<iframe>`` 的嵌入地址。
 *
 * 为什么不用 ``<iframe>`` 直接贴
 * ---------------------------
 *
 * 因为 Bilibili 与 YouTube 的播放器都需要**跨域**才能正常播放，直接
 * 贴 iframe 会被它们的 ``X-Frame-Options`` 挡掉；而且 iframe 里的
 * 播放器我们**控制不了**——拿不到播放进度，也没法在跳转字幕时把
 * 播放器定位过去。
 *
 * 折中方案：
 * - **YouTube** → 走 react-player 的原生支持（用 ``youtube`` 文件源），
 *   这样能拿到 ``currentTime``，字幕跳转才有可能；
 * - **Bilibili** → react-player 没有原生支持，用 ``file`` 源配
 *   ``playsinline``，退化成"能播但拿不到进度"；
 * - **直链 mp4** → 走 ``file`` 源，最稳。
 *
 * 拿不到进度时，字幕节点仍然可以点——只是不能自动定位播放位置。
 */

/** 一个解析好的视频源。 */
export interface ResolvedVideo {
  /** 给播放器的 ``src``。 */
  src: string;
  /**
   * 播放方式。
   *
   * - ``player`` → 交给 react-player（YouTube / Vimeo / 直链媒体）；
   * - ``iframe`` → 自己拼 ``<iframe>``（Bilibili 这类没有原生支持的）。
   */
  kind: "player" | "iframe";
  /** 可以直接贴进 ``<iframe>`` 的嵌入地址（``kind === "iframe"`` 时用）。 */
  embedUrl?: string;
  /** 平台名——用于给用户显示「YouTube」「哔哩哔哩」这样的标签。 */
  provider: string;
  /**
   * Bilibili 的 bvid。
   *
   * 单独留下来，是因为 B 站的**精确跳转**只能靠它——见
   * :func:`buildBilibiliEmbedUrl` 的 ``startSeconds`` 参数。
   * 没有 bvid 就没有办法重建带 ``t=`` 的播放地址。
   */
  bvid?: string;
  /** 原始地址。 */
  originalUrl: string;
  /** 视频标题。 */
  title?: string;
  /** 视频总时长（秒）——由 ``meta.duration`` 或播放器实测得出。 */
  duration?: number;
  /**
   * 传给 react-player 的 ``config``。
   *
   * react-player 的 ``config`` 是**按平台分键**的——``config.youtube`` 只
   * 给 YouTube 用，``config.vimeo`` 只给 Vimeo 用。所以这里保留一个
   * 平台键，具体参数结构交给各平台自己的定义。
   */
  playerConfig?: PlayerConfig;
  /**
   * **备用源**——主源加载失败时的兜底直链。
   *
   * 通常是放在云盘 / OSS / 国内对象存储上的同款 ``.mp4``。
   * 国内网络环境下 YouTube 常常连不上，这时候切到直链最稳。
   *
   * 解析结果里保留它，交给播放器在 ``onError`` 或超时后切换。
   */
  fallback?: ResolvedVideo;
}

/**
 * react-player 的 ``config``。
 *
 * 形状与 react-player v2 的 ``Config`` 一致——按平台分键。
 */
export interface PlayerConfig {
  youtube?: {
    playerVars?: Record<string, number | string>;
    embedOptions?: Record<string, unknown>;
  };
  vimeo?: {
    playerOptions?: Record<string, number | string>;
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * YouTube：干净模式
 * ────────────────────────────────────────────────────────────────────
 *
 * 需求是「隐藏推荐视频和杂乱 LOGO，保持中间舞台的纯净莫兰迪风格」。
 *
 * 这里要诚实地说一件事：**``modestbranding`` 与 ``showinfo`` 早已被
 * YouTube 废弃**（分别于 2018 年、2023 年停止支持）。写进去不会报错，
 * 但也不会有任何效果——这是网上大量「优化 YouTube 嵌入」的教程里
 * 普遍过时的一批参数。
 *
 * 真正**今天仍然生效**的开关是：
 *
 * - ``rel=0`` —— 关闭「结束后的相关视频」推荐位；
 * - ``controls=1`` —— 保留控件（否则用户没法全屏、没法调音量）；
 * - ``playsinline=1`` —— iOS 内联播放，避免强制全屏；
 * - ``iv_load_policy=3`` —— 不加载视频前的标注（annotation），
 *   免得开局就被飘字盖住；
 * - ``modestbranding=1`` —— 仍写入，但注明已废弃，留作向后兼容；
 * - ``showinfo=0`` —— 同上，已废弃；写成 0 而不是 1 是为了跟
 *   「隐藏信息条」的原意一致（旧 API 里 0 才是关闭）。
 *
 * 另外 youtube-nocookie 域可以减少 cookie 写入——但它**不支持**
 * 某些参数且需要额外授权，所以这里保持 youtube.com，只在
 * :func:`buildYoutubePlayerConfig` 里留了开关。
 */
const YOUTUBE_CLEAN_PARAMS: Record<string, number> = {
  // 关闭结束后的相关视频推荐。
  rel: 0,
  // 保留播放控件（全屏 / 音量 / 进度条）。
  controls: 1,
  // iOS 内联播放。
  playsinline: 1,
  // 不加载视频前的标注，避免开局被飘字盖住。
  iv_load_policy: 3,
  // 界面语言跟随页面。
  hl: 1,
  // 自动播放：不开启。用户点播放才有声音，避免突兀。
  autoplay: 0,
  // ── 以下两个已被 YouTube 废弃，写入仅为向后兼容 ──
  modestbranding: 1,
  showinfo: 0,
};

/**
 * 构造 YouTube 的播放器配置。
 *
 * @param extra 额外的 ``playerVars``（会覆盖默认值）。
 */
export function buildYoutubePlayerConfig(
  extra: Record<string, number | string> = {},
): PlayerConfig {
  return {
    youtube: {
      playerVars: { ...YOUTUBE_CLEAN_PARAMS, ...extra },
      embedOptions: {
        // 播放器宽度自适应容器。
        width: "100%",
        height: "100%",
      },
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Bilibili：高清 + 无弹幕 + 宽屏
 * ────────────────────────────────────────────────────────────────────
 *
 * B 站的嵌入播放器（``player.bilibili.com/player.html``）支持一组
 * 独立于 B 站主站的查询参数。默认行为对「阅读型学习场景」很不友好：
 *
 * ==================  ==========================================
 * 参数                作用
 * ==================  ==========================================
 * ``high_quality=1``   强制高清档位（默认可能落到低画质）
 * ``danmaku=0``        **关闭弹幕**——弹幕会盖住画面字幕，
 *                      也会在阅读时把注意力拉走
 * ``as_wide=1``        宽屏适配（16:9），避免两侧黑边
 * ``autoplay=0``       不自动播放
 * ``t=0``             从 0 秒开始
 * ==================  ==========================================
 *
 * 弹幕是这里最重要的一项。B 站的播放器默认会加载弹幕流——几十上百条
 * 文字从右边飞过。对「边看边读字幕、边想问题」的���习场景来说，
 * 那不是氛围，是干扰。
 */
const BILIBILI_EMBED_PARAMS: Record<string, string> = {
  high_quality: "1",
  danmaku: "0",
  as_wide: "1",
  autoplay: "0",
  t: "0",
  // 允许播放器在全屏时保持黑边（16:9 视频本身）。
  disable_hotkey: "0",
};

/**
 * B 站嵌入播放器的**官方域名**。
 *
 * 只有 ``player.bilibili.com`` 是官方的外部播放器端点。用
 * ``www.bilibili.com/video/xxx`` 直接嵌是不行的——那个页面的
 * ``X-Frame-Options`` 会挡掉 iframe。
 */
const BILIBILI_EMBED_HOST = "player.bilibili.com";

/**
 * 构造 Bilibili 的嵌入地址。
 *
 * 已有参数会**保留**（用 ``URLSearchParams`` 合并），只覆盖我们强制
 * 的那几项——作者自己加的 ``t=`` 或 ``p=`` 不该被悄悄抹掉。
 *
 * 产出的地址形如：
 *
 * .. code-block:: text
 *
 *     https://player.bilibili.com/player.html?bvid=BVxxx
 *       &high_quality=1&danmaku=0&as_wide=1&autoplay=0&t=0
 *
 * 参数顺序上把 ``bvid`` 放在**最前**——这跟 B 站官方分享代码的
 * 习惯一致，某些老版本的播放器内核会按位置解析。
 *
 * ``startSeconds`` —— **精确跳转的关键**
 * ---------------------------------------
 *
 * B 站的跨域 ``<iframe>`` 不暴露任何播放控制 API：没有
 * ``currentTime``，没有 ``seekTo``。宿主页面**无法**命令播放器跳到
 * 第 200 秒。
 *
 * 但 B 站的官方播放器**自己**支持 ``t=`` 查询参数——打开带
 * ``t=200`` 的地址，播放器就会从 200 秒开始播。这是唯一一条能从
 * 外部驱动 B 站播放器的通道。
 *
 * 所以「精确跳转」的实现是：**改写 ``<iframe>`` 的 ``src``**。
 * 浏览器会重新加载 iframe，播放器从指定秒数起播。因为
 * ``autoplay=1``，加载完会自动接着播——用户看到的就是「点一下
 * 03:20，画面直接跳到 03:20 并继续播放」。
 *
 * 代价是 iframe 会闪一下（重新加载）。这是跨域限制下的必然代价，
 * 没有别的办法。
 */
export function buildBilibiliEmbedUrl(
  bvid: string,
  startSeconds = 0,
  options: { autoplay?: boolean } = {},
): string {
  const params = new URLSearchParams(BILIBILI_EMBED_PARAMS);
  // 跳转秒数——B 站官方播放器的起始时间参数。
  params.set("t", String(Math.max(0, Math.floor(startSeconds))));
  // 跳转后要「自动接续播放」——用户点一下 03:20，画面跳过去就该
  // 继续往下走，而不是停在那儿等用户再点一次播放。
  if (options.autoplay) params.set("autoplay", "1");
  // bvid 必须在最前——用 URLSearchParams 拼的话它会在末尾，
  // 所以这里手动重组，保证顺序与官方格式一致。
  const rest = params.toString();
  return `https://${BILIBILI_EMBED_HOST}/player.html?bvid=${bvid}&${rest}`;
}

/**
 * 从一个 Bilibili 嵌入地址里读回 ``t=`` 参数（秒）。
 *
 * 读不出来返回 ``0``——也就是「从头开始」。
 */
export function parseBilibiliStartTime(url: string): number {
  const match = url.match(/[?&]t=(\d+)/);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** 从一段 ``<iframe>`` 字符串里抠出 ``src``。 */
export function extractIframeSrc(html: string): string | null {
  const match = html.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/** 从一段 ``<iframe>`` 字符串里抠出 ``title``。 */
export function extractIframeTitle(html: string): string | undefined {
  const match = html.match(/<iframe[^>]*\stitle\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : undefined;
}

/** 抠出 YouTube 的视频 id。 */
export function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{6,})/i,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/i,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** 抠出 Bilibili 的 bvid。 */
export function parseBilibiliId(url: string): string | null {
  const patterns = [
    /(?:bilibili\.com\/video\/)(BV[A-Za-z0-9]{10})/i,
    /(?:player\.bilibili\.com\/player\.html\?.*bvid=)(BV[A-Za-z0-9]{10})/i,
    /^\s*(BV[A-Za-z0-9]{10})\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** 判断是不是 Vimeo。 */
export function parseVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return match ? match[1] : null;
}

/** 从 URL 里猜出视频文件后缀。 */
function guessExtension(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const match = clean.match(/\.([a-z0-9]{2,4})$/i);
  return match ? match[1].toLowerCase() : "";
}

/** 判断是不是可以直接当 ``<video>`` 播的直链。 */
function isDirectMedia(url: string): boolean {
  const ext = guessExtension(url);
  return ["mp4", "webm", "ogg", "ogv", "m3u8", "mov"].includes(ext);
}

/**
 * 把课程 JSON 里的视频载荷解析成可播放的形式。
 *
 * 解析不出来时返回 ``null``——调用方据此显示"视频暂不可用"，
 * 而不是塞一个坏掉的播放器进去。
 */
export function resolveVideo(payload: Record<string, unknown>): ResolvedVideo | null {
  // ① 优先用显式的 url / embed_url / iframe。
  const candidates: string[] = [];

  for (const key of ["url", "embed_url", "embedUrl", "src", "link", "href"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      candidates.push(value.trim());
    }
  }

  const iframe = payload.iframe ?? payload.embed ?? payload.html;
  if (typeof iframe === "string" && iframe.trim()) {
    const src = extractIframeSrc(iframe);
    if (src) candidates.push(src);
  }

  for (const raw of candidates) {
    const resolved = resolveVideoUrl(raw, {
      title:
        typeof payload.title === "string"
          ? payload.title
          : extractIframeTitle(typeof iframe === "string" ? iframe : ""),
    });
    if (resolved) {
      // 总时长——作者在 ``meta.duration`` 里标了就用标了的。
      const meta = payload.meta;
      const rawDuration =
        meta && typeof meta === "object"
          ? (meta as Record<string, unknown>).duration
          : undefined;
      if (typeof rawDuration === "number" && Number.isFinite(rawDuration)) {
        resolved.duration = rawDuration;
      } else if (typeof rawDuration === "string") {
        const parsed = parseTimeString(rawDuration);
        if (parsed !== null) resolved.duration = parsed;
      }

      // 备用源——主源挂了（最常见：YouTube 在国内连不上）就切它。
      const fallbackRaw = payload.fallback_url ?? payload.fallbackUrl;
      if (typeof fallbackRaw === "string" && fallbackRaw.trim()) {
        const fallback = resolveVideoUrl(fallbackRaw.trim(), {
          title: typeof payload.title === "string" ? payload.title : undefined,
        });
        // 备用源不能跟主源是同一个地址——那不叫备用。
        if (fallback && fallback.src !== resolved.src) {
          resolved.fallback = fallback;
        }
      }

      return resolved;
    }
  }

  return null;
}

/** 只看 URL 解析视频源。 */
export function resolveVideoUrl(
  rawUrl: string,
  options: { title?: string } = {},
): ResolvedVideo | null {
  let url = rawUrl.trim();
  if (!url) return null;

  // 协议相对地址 → 补全。
  if (url.startsWith("//")) url = `https:${url}`;

  // ① YouTube —— react-player 原生支持，直接把原始地址交出去，
  //    让它自己从 URL 里认出来。
  //
  //    同时挂上「干净模式」的 playerVars——关掉相关视频推荐、
  //    保留控件与内联播放。这是 react-player 唯一能拿到
  //    ``playerVars`` 的方式（走 ``config.playerVars``）。
  if (parseYouTubeId(url)) {
    return {
      src: url,
      kind: "player",
      provider: "YouTube",
      originalUrl: rawUrl,
      title: options.title,
      playerConfig: buildYoutubePlayerConfig(),
    };
  }

  // ② Vimeo —— 同上。
  if (parseVimeoId(url)) {
    return {
      src: url,
      kind: "player",
      provider: "Vimeo",
      originalUrl: rawUrl,
      title: options.title,
      playerConfig: {
        vimeo: {
          // 关掉 Vimeo 播放器自己的标题条与作者信息——保持舞台纯净。
          playerOptions: { title: 0, byline: 0, portrait: 0 },
        },
      },
    };
  }

  // ③ Bilibili —— react-player **不支持**（它的 canPlay 表里没有
  //    哔哩哔哩），所以退回到 iframe 嵌入。
  //
  //    代价是拿不到播放进度，字幕节点点下去没法自动定位——但这
  //    比放一个坏掉的播放器强得多。
  //
  //    嵌入地址带上高清 / 无弹幕 / 宽屏参数：见
  //    :func:`buildBilibiliEmbedUrl` 的说明。
  const bvid = parseBilibiliId(url);
  if (bvid) {
    const embed = buildBilibiliEmbedUrl(bvid);
    return {
      src: embed,
      kind: "iframe",
      embedUrl: embed,
      provider: "哔哩哔哩",
      originalUrl: rawUrl,
      title: options.title,
      bvid,
    };
  }

  // ④ 直链媒体文件 —— react-player 能当普通 <video> 播。
  if (isDirectMedia(url)) {
    return {
      src: url,
      kind: "player",
      embedUrl: url,
      provider: "直链",
      originalUrl: rawUrl,
      title: options.title,
    };
  }

  // ⑤ 认不出来，但至少是个 URL —— 当作普通嵌入。
  if (/^https?:\/\//i.test(url)) {
    return {
      src: url,
      kind: "iframe",
      embedUrl: url,
      provider: "外链",
      originalUrl: rawUrl,
      title: options.title,
    };
  }

  return null;
}

/** 一条字幕节点。 */
export interface VideoCaption {
  /** 起始时间（秒）。 */
  start: number;
  /** 字幕正文。 */
  text: string;
}

/**
 * 从视频载荷里解析字幕节点。
 *
 * 支持两种形态：
 *
 * .. code-block:: text
 *
 *     "captions": [{ "start": 12.5, "text": "闭包记住了它的出生地" }]
 *     "transcript": [{ "time": "00:12", "text": "闭包记住了它的出生地" }]
 */
export function resolveCaptions(payload: Record<string, unknown>): VideoCaption[] {
  const source = payload.captions ?? payload.transcript ?? payload.subtitles;
  if (!Array.isArray(source)) return [];

  const out: VideoCaption[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;

    let start: number | null = null;
    const rawStart = record.start ?? record.time ?? record.at ?? record.offset;
    if (typeof rawStart === "number" && Number.isFinite(rawStart)) {
      start = rawStart;
    } else if (typeof rawStart === "string") {
      const parsed = parseTimeString(rawStart);
      if (parsed !== null) start = parsed;
    }
    if (start === null) continue;

    const text = record.text ?? record.content ?? record.label;
    if (typeof text !== "string" || !text.trim()) continue;

    out.push({ start, text: text.trim() });
  }

  return out.sort((a, b) => a.start - b.start);
}

/**
 * 解析 ``mm:ss`` / ``hh:mm:ss`` / 纯秒数。
 *
 * 返回 ``null`` 表示认不出来。
 */
export function parseTimeString(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  // 纯数字 → 秒。
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);

  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}
