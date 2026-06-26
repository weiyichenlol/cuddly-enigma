 "use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { HouseConfig, HouseFeature, Place, PlaceSearchCandidate } from "@/lib/types";

export type { Place };

export type LegoConfig = {
  enabled: boolean;
  /** 0-100，越低越干净 */
  density: number;
  /** 0-100，越大线条越粗、描边更重 */
  stroke: number;
  /** 0-100，越大颜色越“玩具化” */
  saturation: number;
};

type Props = {
  center: { lat: number; lng: number };
  items: Place[];
  searchResults: PlaceSearchCandidate[];
  focusTarget?: { id: string; lat: number; lng: number; zoom?: number } | null;
  onSelect: (p: Place) => void;
  onPickSearchResult?: (candidate: PlaceSearchCandidate) => void;
  lego?: LegoConfig;
};

function markerEl(kind: "food" | "coffee" | "bar" = "food") {
  const el = document.createElement("div");
  el.style.width = "44px";
  el.style.height = "44px";
  el.style.cursor = "pointer";
  el.style.backgroundImage = `url(/markers/${kind}.svg)`;
  el.style.backgroundSize = "contain";
  el.style.backgroundRepeat = "no-repeat";
  el.style.filter = "drop-shadow(3px 3px 0 rgba(31,41,55,0.25))";
  return el;
}

function searchMarkerEl(label: string, primary = false) {
  const el = document.createElement("div");
  el.style.width = "34px";
  el.style.height = "34px";
  el.style.borderRadius = "999px";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.cursor = "pointer";
  el.style.fontSize = "14px";
  el.style.fontWeight = "900";
  el.style.color = primary ? "#ffffff" : "#1f2937";
  el.style.background = primary ? "#2563EB" : "#FEF3C7";
  el.style.border = primary ? "3px solid #DBEAFE" : "3px solid #F59E0B";
  el.style.boxShadow = "0 4px 0 rgba(31,41,55,0.18)";
  el.textContent = label;
  return el;
}

const DEFAULT_HOUSE_PALETTE = {
  primary: "#FFD93D",
  secondary: "#FF6B6B",
  accent: "#4ECDC4",
} as const;

function safeHexColor(v: string | undefined, fallback: string) {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : fallback;
}

function escapeSvgText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function featureIcon(feature: HouseFeature) {
  return (
    {
      plant: "🌿",
      lantern: "🏮",
      poster: "🪧",
      awning: "⛱",
      terrace: "☕",
      "window-grid": "🪟",
      chimney: "🏠",
      bar: "🍸",
      coffee: "☕",
      spicy: "🌶",
      noodle: "🍜",
      seafood: "🦐",
    }[feature] ?? "⭐"
  );
}

function featureLabel(feature: HouseFeature) {
  return (
    {
      plant: "绿植",
      lantern: "灯笼",
      poster: "海报墙",
      awning: "雨棚",
      terrace: "外摆",
      "window-grid": "格窗",
      chimney: "烟囱",
      bar: "吧台",
      coffee: "咖啡",
      spicy: "辣味",
      noodle: "面食",
      seafood: "海鲜",
    }[feature] ?? feature
  );
}

function normalizeHouse(house?: HouseConfig | null) {
  const template = ["gable", "arch", "glass", "neon"].includes(String(house?.template))
    ? (house?.template as "gable" | "arch" | "glass" | "neon")
    : "gable";
  const features = Array.isArray(house?.features)
    ? house!.features.filter(Boolean).slice(0, 4)
    : Array.isArray(house?.stickers)
      ? (house!.stickers.filter(Boolean).slice(0, 4) as HouseFeature[])
      : [];
  return {
    template,
    palette: {
      primary: safeHexColor(house?.palette?.primary, DEFAULT_HOUSE_PALETTE.primary),
      secondary: safeHexColor(house?.palette?.secondary, DEFAULT_HOUSE_PALETTE.secondary),
      accent: safeHexColor(house?.palette?.accent, DEFAULT_HOUSE_PALETTE.accent),
    },
    signStyle: house?.sign?.style === "neon" ? "neon" : "wood",
    roof:
      house?.roof === "arch" || house?.roof === "flat" || house?.roof === "gable"
        ? house.roof
        : template === "arch"
          ? "arch"
          : template === "glass"
            ? "flat"
            : "gable",
    facade:
      house?.facade === "brick" || house?.facade === "glass" || house?.facade === "stone" || house?.facade === "wood"
        ? house.facade
        : template === "glass"
          ? "glass"
          : "wood",
    lighting:
      house?.lighting === "cool" || house?.lighting === "neon" || house?.lighting === "warm"
        ? house.lighting
        : template === "neon"
          ? "neon"
          : "warm",
    summary: house?.summary || "",
    signText: (house?.sign?.text || "").trim(),
    features,
  };
}

function houseMarkerEl(house: HouseConfig, labelText?: string) {
  const h = normalizeHouse(house);
  const signText =
    escapeSvgText((h.signText || labelText || "").trim().slice(0, 2) || (h.features[0] ? featureIcon(h.features[0]) : "店"));
  const windowFill =
    h.lighting === "neon" ? "rgba(0,245,212,0.42)" : h.lighting === "cool" ? "rgba(132,165,157,0.35)" : "#FFF7E6";
  const signFill = h.signStyle === "neon" ? h.palette.accent : h.palette.accent;
  const signStroke = h.signStyle === "neon" ? "#00F5D4" : "#1f2937";
  const accentLine = h.lighting === "neon" ? `stroke="${h.palette.accent}" stroke-width="3"` : `stroke="#1f2937" stroke-width="5"`;
  const roofShape =
    h.roof === "flat"
      ? `<rect x="28" y="36" width="72" height="14" rx="7" fill="${h.palette.secondary}" stroke="#1f2937" stroke-width="6"/>`
      : h.roof === "arch"
        ? `<path d="M30 58c10-18 26-28 34-28s24 10 34 28" fill="${h.palette.secondary}" stroke="#1f2937" stroke-width="6" stroke-linejoin="round"/>`
        : `<path d="M20 78L64 42l44 36" fill="${h.palette.secondary}" stroke="#1f2937" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const bodyShape =
    h.template === "glass"
      ? `<path d="M34 40h60v72H34V40z" fill="${h.palette.primary}" fill-opacity="0.32" stroke="#1f2937" stroke-width="6" stroke-linejoin="round"/>`
      : `<path d="M28 58h72v54H28V58z" fill="${h.palette.primary}" stroke="#1f2937" stroke-width="6" stroke-linejoin="round"/>`;
  const windowLines =
    h.template === "glass" || h.features.includes("window-grid")
      ? `<path d="M34 58h60" ${accentLine} stroke-linecap="round"/><path d="M34 76h60" ${accentLine} stroke-linecap="round"/><path d="M64 40v72" ${accentLine} stroke-linecap="round"/>`
      : `<rect x="38" y="72" width="16" height="14" rx="4" fill="${windowFill}" stroke="#1f2937" stroke-width="5"/><rect x="74" y="72" width="16" height="14" rx="4" fill="${windowFill}" stroke="#1f2937" stroke-width="5"/>`;
  const awning =
    h.features.includes("awning") || h.template === "arch"
      ? `<path d="M36 64h56l-6 12H42z" fill="${h.palette.accent}" stroke="#1f2937" stroke-width="5" stroke-linejoin="round"/>`
      : "";
  const chimney = h.features.includes("chimney")
    ? `<path d="M86 38h10v18H86z" fill="${h.palette.accent}" stroke="#1f2937" stroke-width="5" stroke-linejoin="round"/>`
    : "";
  const plants = h.features.includes("plant")
    ? `<circle cx="34" cy="102" r="8" fill="#6EE7B7" stroke="#1f2937" stroke-width="4"/><circle cx="94" cy="102" r="8" fill="#6EE7B7" stroke="#1f2937" stroke-width="4"/>`
    : "";
  const lanterns = h.features.includes("lantern")
    ? `<circle cx="36" cy="70" r="6" fill="#EF4444" stroke="#1f2937" stroke-width="4"/><circle cx="92" cy="70" r="6" fill="#EF4444" stroke="#1f2937" stroke-width="4"/>`
    : "";
  const poster = h.features.includes("poster")
    ? `<rect x="96" y="72" width="10" height="20" rx="3" fill="${h.palette.accent}" stroke="#1f2937" stroke-width="4"/>`
    : "";
  const terrace = h.features.includes("terrace")
    ? `<path d="M28 112h72" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/><path d="M40 108h48" stroke="${h.palette.accent}" stroke-width="4" stroke-linecap="round"/>`
    : "";
  const el = document.createElement("div");
  el.style.width = "56px";
  el.style.height = "56px";
  el.style.cursor = "pointer";
  el.style.backgroundImage = `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#1f2937" flood-opacity="0.35"/>
        </filter>
      </defs>
      <g filter="url(#s)">
        ${roofShape}
        ${bodyShape}
        ${awning}
        ${windowLines}
        ${chimney}
        <rect x="40" y="50" width="48" height="14" rx="7" fill="${signFill}" stroke="${signStroke}" stroke-width="5"/>
        ${h.signStyle === "neon" ? `<rect x="40" y="50" width="48" height="14" rx="7" fill="none" stroke="${h.palette.secondary}" stroke-width="2.5"/>` : ""}
        <text x="64" y="60" text-anchor="middle" dominant-baseline="middle" font-family="Arial, PingFang SC, sans-serif" font-size="12" font-weight="700" fill="${h.signStyle === "neon" ? "#FFF7E6" : "#1f2937"}">${signText}</text>
        <path d="M52 112V88h24v24" fill="#FFF7E6" stroke="#1f2937" stroke-width="6" stroke-linejoin="round"/>
        ${plants}
        ${lanterns}
        ${poster}
        ${terrace}
      </g>
    </svg>`
  )}")`;
  el.style.backgroundSize = "contain";
  el.style.backgroundRepeat = "no-repeat";
  el.style.filter = "drop-shadow(3px 3px 0 rgba(31,41,55,0.25))";
  return el;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function clamp100(x: number) {
  return Math.max(0, Math.min(100, x));
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}
function hslToRgb(h: number, s: number, l: number) {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3) * 255;
  const g = hue2rgb(p, q, h) * 255;
  const b = hue2rgb(p, q, h - 1 / 3) * 255;
  return { r, g, b };
}
function saturateHex(hex: string, satMul: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const s = clamp01(hsl.s * satMul);
  const out = hslToRgb(hsl.h, s, hsl.l);
  return rgbToHex(out.r, out.g, out.b);
}
function bumpWidth(v: any, mul: number, add: number) {
  if (typeof v === "number") return v * mul + add;
  // 如果是 expression，尽量包一层加法（不做乘法避免破坏表达式结构）
  if (Array.isArray(v)) return ["+", v, add];
  return v;
}

const IDEOGRAPH_FONT_FAMILY =
  '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei","Heiti SC","WenQuanYi Micro Hei",sans-serif';
function applyIdeographFontFamily(map: MLMap) {
  // 让中文/日文/韩文字体在本机字体里更稳定（不依赖 style 内的 glyphs 字体）
  (map as any).setLocalIdeographFontFamily?.(IDEOGRAPH_FONT_FAMILY);
}

function legoifyStyle(style: any, cfg: LegoConfig) {
  if (!style || typeof style !== "object") return style;
  const s = JSON.parse(JSON.stringify(style));

  const density = clamp100(cfg.density);
  const stroke = clamp100(cfg.stroke);
  const saturation = clamp100(cfg.saturation);

  // 颜色饱和度：1.0~2.4
  const satMul = 1 + (saturation / 100) * 1.4;
  // 线条：1.0~1.9
  const widthMul = 1 + (stroke / 100) * 0.9;
  const widthAdd = 0.2 + (stroke / 100) * 1.6;

  // 更“乐高块面”的底色与高饱和配色（偏高德卡通感）
  s.light = s.light || { anchor: "viewport", color: "#ffffff", intensity: 0.25 };
  s.background = s.background || "#FFF7E6";

  /**
   * 信息密度策略：
   * - 始终尽量保留：行政区/地名 + 道路名（主路/高速）+ 水系名
   * - 主要过滤：POI/交通/门牌/地址/设施等
   * 说明：不同 style 的 layer id/source-layer 命名不同，所以这里用“宽松匹配”兜底。
   */
  const KEEP_LABEL_RE =
    /(admin|boundary|place|settlement|city|town|village|hamlet|district|neighbou?rhood|suburb|state|province|county|region|water.*label|waterway.*label|river.*label|road.*label|street.*label|highway.*label|motorway.*label|transportation(_name)?|transportation-name|road(_name)?|road-name|street[_-]?name)/i;
  // 信息密度：越低过滤越狠；越高保留更多道路/地名（但仍会过滤 POI 为主）
  const dropRe =
    density < 35
      ? /(poi|amenity|landmark|shop|tourism|transit|aeroway|housenumber|address|station|rail|airport)/i
      : density < 70
        ? /(poi|amenity|landmark|shop|tourism|transit|aeroway|housenumber|address|station|rail|airport)/i
        : /(poi|amenity|shop|tourism|transit|aeroway|housenumber|address|station|rail|airport)/i;

  if (Array.isArray(s.layers)) {
    s.layers = s.layers.filter((ly: any) => {
      // 先减少信息密度：去掉大部分 POI/交通/杂项标注，只保留主要道路与行政区/水系等
      if (ly?.type === "symbol") {
        const id = String(ly?.id || "");
        const sl = String(ly?.["source-layer"] || "");
        const layout = ly?.layout || {};
        const hasText = layout["text-field"] != null;
        const filterText = ly?.filter ? JSON.stringify(ly.filter) : "";

        /**
         * 关键修复：
         * - 仅靠 layer id/source-layer 的正则匹配并不可靠（不同底图供应商命名差异很大）
         * - “minor” 一类关键词经常会出现在道路名相关 layer id 里，导致误删路名
         * 因此：只在“明显是 POI/设施类”的时候才过滤；对“线性文字（道路名）/地名/行政区/水系”
         * 一律保留，确保 density 滑块不会把路名/地名 label 过滤掉。
         */
        const isLineTextLabel =
          hasText && String(layout["symbol-placement"] || "").toLowerCase() === "line";
        const looksLikeRoadName =
          isLineTextLabel || /(transportation|road|street|highway|motorway)/i.test(`${id} ${sl}`);
        const looksLikePlaceOrAdmin =
          hasText &&
          (/(admin|boundary|place|settlement)/i.test(`${id} ${sl}`) ||
            /(capital|city|town|village|hamlet|suburb|neighbou?rhood|state|province|county|country)/i.test(
              filterText
            ));
        const looksLikeWaterLabel =
          hasText && /(water|waterway|river|lake|marine)/i.test(`${id} ${sl}`);

        if (
          KEEP_LABEL_RE.test(id) ||
          KEEP_LABEL_RE.test(sl) ||
          looksLikeRoadName ||
          looksLikePlaceOrAdmin ||
          looksLikeWaterLabel
        ) {
          return true;
        }

        // 兜底：保留“主路/主区”标签（即使命名不符合上面的规则）
        if (/(motorway|trunk|primary|secondary|tertiary|major|district)/i.test(filterText)) {
          return true;
        }

        // 只对“明显的 POI/设施类”做过滤，避免误删道路/地名 label
        if (dropRe.test(id) || dropRe.test(sl)) return false;
      }
      return true;
    });

    for (const ly of s.layers) {
      ly.paint = ly.paint || {};
      ly.layout = ly.layout || {};
      const id = String(ly.id || "");

      // 让几何更“积木”：更粗的描边 + 更清晰的块面边界
      if (ly.type === "fill") {
        ly.paint["fill-opacity"] = Math.min(1, Number(ly.paint["fill-opacity"] ?? 0.9));
        ly.paint["fill-outline-color"] = "#1F2937";
        // 基础块面配色（再按 satMul 做饱和度增强）
        const water = saturateHex("#6BCBFF", satMul);
        const park = saturateHex("#A7F3D0", satMul);
        const building = saturateHex("#FDE68A", satMul);
        const land = saturateHex("#FFE4C7", satMul);
        if (/water/i.test(id)) ly.paint["fill-color"] = water;
        if (/park|green|forest/i.test(id)) ly.paint["fill-color"] = park;
        if (/building/i.test(id)) ly.paint["fill-color"] = building;
        if (/landuse|residential|industrial/i.test(id)) ly.paint["fill-color"] = land;
      }

      if (ly.type === "line") {
        ly.paint["line-width"] = bumpWidth(ly.paint["line-width"], widthMul, widthAdd);
        ly.paint["line-opacity"] = Math.min(1, Number(ly.paint["line-opacity"] ?? 0.95));
        // 给道路/边界加“描边感”
        if (/road|street|bridge|tunnel|motorway|trunk|primary|secondary/i.test(id)) {
          ly.paint["line-color"] = ly.paint["line-color"] ?? "#FFFFFF";
          ly.paint["line-gap-width"] = bumpWidth(
            ly.paint["line-gap-width"] ?? 0,
            1 + (stroke / 100) * 0.4,
            0.2
          );
        }
        if (/boundary|admin/i.test(id)) {
          ly.paint["line-color"] = "#111827";
          ly.paint["line-width"] = bumpWidth(ly.paint["line-width"], widthMul * 1.15, widthAdd + 0.8);
        }
        if (/water/i.test(id)) ly.paint["line-color"] = saturateHex("#39BDF8", satMul);
      }

      // 让文字更像“贴纸标签”
      if (ly.type === "symbol") {
        ly.paint["text-halo-color"] = "#FFFFFF";
        ly.paint["text-halo-width"] = 1.2 + (stroke / 100) * 1.8;
        ly.paint["text-color"] = ly.paint["text-color"] ?? "#111827";
        // 不强行覆盖 text-font：避免 MapTiler glyph/font 不匹配导致 label 不渲染。
      }

      // 去掉阴影/地形类效果（更像纯积木平面）
      if (/hillshade|contour|terrain/i.test(id)) {
        ly.layout.visibility = "none";
      }
    }
  }

  return s;
}

async function fetchJsonStyle(styleUrl: string) {
  const resp = await fetch(styleUrl, { cache: "force-cache" });
  if (!resp.ok) throw new Error(`style.json fetch failed: ${resp.status}`);
  const style = (await resp.json()) as any;

  /**
   * 关键兼容修复：
   * 当我们把 style URL 拉下来并在前端 `setStyle(styleObject)` 时，
   * style 内部的 sprite/glyphs/sources 可能是相对路径（或缺少 key 参数）。
   * 相对路径在 setStyle(object) 模式下会被解析为“当前网页域名”，导致 glyphs 404，
   * 最直观的现象就是：地图放大后道路/区域名称不显示。
   *
   * 这里统一把相关 URL 规范化为绝对地址，并尽量补齐 MapTiler 的 `?key=`。
   */
  return normalizeStyleUrls(style, styleUrl);
}

function isProbablyAbsoluteUrl(u: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) || u.startsWith("data:");
}

function resolveUrlMaybeRelative(u: string, base: string) {
  if (!u || typeof u !== "string") return u;
  if (isProbablyAbsoluteUrl(u)) return u;
  // MapLibre/Mapbox 特殊 scheme：无法在这里可靠转换，交由上层处理/兜底
  if (u.startsWith("mapbox://")) return u;
  try {
    return new URL(u, base).toString();
  } catch {
    return u;
  }
}

function appendMapTilerKeyIfMissing(u: string, styleUrl: string) {
  try {
    const base = new URL(styleUrl);
    const key = base.searchParams.get("key");
    if (!key) return u;

    const target = new URL(u);
    const isMapTiler = /(^|\.)maptiler\.com$/i.test(target.hostname);
    if (!isMapTiler) return u;
    if (target.searchParams.get("key")) return u;
    target.searchParams.set("key", key);
    return target.toString();
  } catch {
    return u;
  }
}

function normalizeStyleUrls(style: any, styleUrl: string) {
  if (!style || typeof style !== "object") return style;
  const s = JSON.parse(JSON.stringify(style));

  // sprite / glyphs
  if (typeof s.sprite === "string") {
    s.sprite = appendMapTilerKeyIfMissing(resolveUrlMaybeRelative(s.sprite, styleUrl), styleUrl);
  }
  if (typeof s.glyphs === "string") {
    // Mapbox 的 glyph scheme 在 MapLibre 中通常不可用；优先切到 OpenMapTiles 公共字体服务
    if (s.glyphs.startsWith("mapbox://")) {
      s.glyphs = "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf";
    } else {
      s.glyphs = appendMapTilerKeyIfMissing(resolveUrlMaybeRelative(s.glyphs, styleUrl), styleUrl);
    }
  } else if (!s.glyphs) {
    // 没有 glyphs 时给一个兜底，避免文字层直接不渲染
    s.glyphs = "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf";
  }

  // sources
  if (s.sources && typeof s.sources === "object") {
    for (const k of Object.keys(s.sources)) {
      const src = s.sources[k];
      if (!src || typeof src !== "object") continue;

      if (typeof src.url === "string") {
        src.url = appendMapTilerKeyIfMissing(resolveUrlMaybeRelative(src.url, styleUrl), styleUrl);
      }
      if (typeof src.data === "string") {
        src.data = resolveUrlMaybeRelative(src.data, styleUrl);
      }
      if (Array.isArray(src.tiles)) {
        src.tiles = src.tiles.map((t: any) =>
          typeof t === "string"
            ? appendMapTilerKeyIfMissing(resolveUrlMaybeRelative(t, styleUrl), styleUrl)
            : t
        );
      }
    }
  }

  return s;
}

export default function MapView({
  center,
  items,
  searchResults,
  focusTarget,
  onSelect,
  onPickSearchResult,
  lego,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const baseStyleRef = useRef<any | null>(null);
  const lastStyleUrlRef = useRef<string>("");
  const styleApplyTimerRef = useRef<number | null>(null);
  const styleApplySeqRef = useRef(0);
  const lastFocusIdRef = useRef<string>("");

  const styleUrl = useMemo(() => process.env.NEXT_PUBLIC_MAP_STYLE_URL || "", []);
  const legoEnabled = lego?.enabled ?? false;
  const legoDensity = lego?.density ?? 0;
  const legoStroke = lego?.stroke ?? 0;
  const legoSaturation = lego?.saturation ?? 0;

  const openPopup = useCallback(
    (p: Place) => {
      const map = mapRef.current;
      if (!map) return;

      popupRef.current?.remove();

      const wrap = document.createElement("div");
      wrap.style.fontFamily =
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      wrap.style.maxWidth = "260px";

      const title = document.createElement("div");
      title.textContent = p.name;
      title.style.fontWeight = "900";
      title.style.fontSize = "14px";
      title.style.marginBottom = "6px";
      wrap.appendChild(title);

      if (p.address) {
        const addr = document.createElement("div");
        addr.style.fontSize = "12px";
        addr.style.opacity = "0.85";
        addr.style.marginBottom = "6px";
        addr.textContent = p.address;
        wrap.appendChild(addr);
      }

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.opacity = "0.85";
      meta.style.marginBottom = "6px";
      const parts: string[] = [];
      if (typeof p.rating === "number") parts.push(`评分 ${p.rating}`);
      if (typeof p.price_per_person === "number") parts.push(`人均 ¥${p.price_per_person}`);
      if (p.tags?.length) parts.push(p.tags.slice(0, 6).join(" · "));
      meta.textContent = parts.join("  |  ");
      if (meta.textContent) wrap.appendChild(meta);

      const house = p.house as HouseConfig | undefined;
      if (house?.template) {
        const normalized = normalizeHouse(house);
        const houseBox = document.createElement("div");
        houseBox.style.fontSize = "12px";
        houseBox.style.marginBottom = "8px";
        houseBox.style.padding = "8px";
        houseBox.style.borderRadius = "10px";
        houseBox.style.background = "#FFF7E6";
        houseBox.style.border = "1px solid rgba(31,41,55,0.12)";

        const summary = document.createElement("div");
        summary.style.fontWeight = "700";
        summary.style.marginBottom = "6px";
        summary.textContent = normalized.summary || `房子模板：${normalized.template}`;
        houseBox.appendChild(summary);

        const featureText = normalized.features.length
          ? normalized.features.map(featureLabel).join(" · ")
          : "无额外立面元素";
        const detail = document.createElement("div");
        detail.style.opacity = "0.88";
        detail.textContent = `材质 ${normalized.facade} · 灯光 ${normalized.lighting} · ${featureText}`;
        houseBox.appendChild(detail);

        const palette = document.createElement("div");
        palette.style.display = "flex";
        palette.style.gap = "6px";
        palette.style.marginTop = "6px";
        for (const color of [
          normalized.palette.primary,
          normalized.palette.secondary,
          normalized.palette.accent,
        ]) {
          const chip = document.createElement("span");
          chip.style.width = "14px";
          chip.style.height = "14px";
          chip.style.display = "inline-block";
          chip.style.borderRadius = "999px";
          chip.style.background = color;
          chip.style.border = "1px solid rgba(31,41,55,0.18)";
          palette.appendChild(chip);
        }
        houseBox.appendChild(palette);
        wrap.appendChild(houseBox);
      }

      if (p.dishes?.length) {
        const d = document.createElement("div");
        d.style.fontSize = "12px";
        d.style.marginBottom = "6px";
        d.textContent = `推荐菜：${p.dishes.slice(0, 8).join("、")}`;
        wrap.appendChild(d);
      }

      if (p.note) {
        const n = document.createElement("div");
        n.style.fontSize = "12px";
        n.style.marginBottom = "6px";
        n.textContent = p.note;
        wrap.appendChild(n);
      }

      if (p.links) {
        const a = document.createElement("a");
        a.textContent = "外链";
        a.href = p.links;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.style.fontSize = "12px";
        a.style.display = "inline-block";
        a.style.marginBottom = "8px";
        wrap.appendChild(a);
      }

      const btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "8px";

      const editBtn = document.createElement("button");
      editBtn.textContent = "编辑";
      editBtn.style.border = "1px solid rgba(31,41,55,0.25)";
      editBtn.style.borderRadius = "10px";
      editBtn.style.padding = "6px 10px";
      editBtn.style.background = "#fff";
      editBtn.style.cursor = "pointer";
      editBtn.style.fontSize = "12px";
      editBtn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        popupRef.current?.remove();
        popupRef.current = null;
        onSelect(p);
      };

      btnRow.appendChild(editBtn);
      wrap.appendChild(btnRow);

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 18,
        maxWidth: "260px",
      })
        .setLngLat([p.lng, p.lat])
        .setDOMContent(wrap)
        .addTo(map);
    },
    [onSelect]
  );

  const openSearchPopup = useCallback(
    (candidate: PlaceSearchCandidate, index: number) => {
      const map = mapRef.current;
      if (!map) return;

      popupRef.current?.remove();

      const wrap = document.createElement("div");
      wrap.style.fontFamily =
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      wrap.style.maxWidth = "240px";

      const title = document.createElement("div");
      title.textContent = `候选 ${index + 1} · ${candidate.name}`;
      title.style.fontWeight = "900";
      title.style.fontSize = "14px";
      title.style.marginBottom = "6px";
      wrap.appendChild(title);

      const addr = document.createElement("div");
      addr.textContent = candidate.address;
      addr.style.fontSize = "12px";
      addr.style.opacity = "0.85";
      addr.style.marginBottom = "8px";
      wrap.appendChild(addr);

      const btn = document.createElement("button");
      btn.textContent = "用这个位置";
      btn.style.border = "1px solid rgba(31,41,55,0.25)";
      btn.style.borderRadius = "10px";
      btn.style.padding = "6px 10px";
      btn.style.background = "#fff";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "12px";
      btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        popupRef.current?.remove();
        popupRef.current = null;
        onPickSearchResult?.(candidate);
      };
      wrap.appendChild(btn);

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 16,
        maxWidth: "240px",
      })
        .setLngLat([candidate.lng, candidate.lat])
        .setDOMContent(wrap)
        .addTo(map);
    },
    [onPickSearchResult]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // style URL 改了，重置 baseStyle
    if (styleUrl && lastStyleUrlRef.current !== styleUrl) {
      lastStyleUrlRef.current = styleUrl;
      baseStyleRef.current = null;
    }

    const map = new maplibregl.Map({
      container,
      style: styleUrl || "https://demotiles.maplibre.org/style.json",
      center: [center.lng, center.lat],
      zoom: 15.2,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "bottom-right"
    );

    map.on("style.load", () => applyIdeographFontFamily(map));
    applyIdeographFontFamily(map);

    map.on("click", (e) => {
      popupRef.current?.remove();
      popupRef.current = null;
      // 把点击点坐标写入表单（用自定义事件传递，避免引入全局状态库）
      window.dispatchEvent(
        new CustomEvent("place-map-click", {
          detail: { lng: e.lngLat.lng, lat: e.lngLat.lat },
        })
      );
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lng, styleUrl]);

  // lego 风格动态更新
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 滑块连续变化时避免频繁 setStyle（会导致 style 反复重载，出现 label “不更新/消失”的观感）
    if (styleApplyTimerRef.current) window.clearTimeout(styleApplyTimerRef.current);
    const seq = ++styleApplySeqRef.current;

    styleApplyTimerRef.current = window.setTimeout(() => {
      const targetMap = map;

      (async () => {
        if (!styleUrl) return;

        // map 已被卸载/替换
        if (mapRef.current !== targetMap) return;
        // 有更新的 setStyle 请求在排队，忽略过期的这次
        if (styleApplySeqRef.current !== seq) return;

        if (!legoEnabled) {
          // 关闭乐高风格时回到原始 style URL
          targetMap.setStyle(styleUrl);
          return;
        }

        if (!baseStyleRef.current) {
          const base = await fetchJsonStyle(styleUrl);
          if (mapRef.current !== targetMap || styleApplySeqRef.current !== seq) return;
          baseStyleRef.current = base;
        }

        const legoCfg: LegoConfig = {
          enabled: true,
          density: legoDensity,
          stroke: legoStroke,
          saturation: legoSaturation,
        };
        const next = legoifyStyle(baseStyleRef.current, legoCfg);
        // style 切换会重置本地 CJK 字体设置；这里显式在新 style load 后再打一遍
        targetMap.once("style.load", () => applyIdeographFontFamily(targetMap));
        targetMap.setStyle(next);
      })().catch(() => {
        // 忽略：不阻塞地图基础功能
      });
    }, 120);

    return () => {
      if (styleApplyTimerRef.current) window.clearTimeout(styleApplyTimerRef.current);
    };
  }, [legoEnabled, legoDensity, legoStroke, legoSaturation, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of items) {
      const house = (p.house ?? {}) as HouseConfig;
      const template = house?.template;
      const kind: "food" | "coffee" | "bar" =
        p.tags?.some((t) => /咖啡|cafe|coffee/i.test(t))
          ? "coffee"
          : p.tags?.some((t) => /酒吧|bar|pub/i.test(t))
            ? "bar"
            : "food";

      const el = template ? houseMarkerEl(house, p.name) : markerEl(kind);
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      m.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(p);
      });

      markersRef.current.push(m);
    }

    for (const [index, candidate] of searchResults.entries()) {
      const m = new maplibregl.Marker({
        element: searchMarkerEl(String(index + 1), index === 0),
        anchor: "center",
      })
        .setLngLat([candidate.lng, candidate.lat])
        .addTo(map);

      m.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        openSearchPopup(candidate, index);
      });

      markersRef.current.push(m);
    }
  }, [items, openPopup, openSearchPopup, searchResults]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    if (lastFocusIdRef.current === focusTarget.id) return;
    lastFocusIdRef.current = focusTarget.id;
    map.flyTo({
      center: [focusTarget.lng, focusTarget.lat],
      zoom: focusTarget.zoom ?? Math.max(map.getZoom(), 16),
      essential: true,
    });
  }, [focusTarget]);

  return <div ref={containerRef} className="mapCanvas" />;
}
