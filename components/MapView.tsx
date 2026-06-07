"use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";

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
  refreshKey: number;
  onSelect: (p: Place) => void;
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

function houseMarkerEl(template: string) {
  const el = document.createElement("div");
  el.style.width = "56px";
  el.style.height = "56px";
  el.style.cursor = "pointer";
  const t = ["gable", "arch", "glass", "neon"].includes(template) ? template : "gable";
  el.style.backgroundImage = `url(/markers/house-${t}.svg)`;
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
  return (await resp.json()) as any;
}

export default function MapView({ center, refreshKey, onSelect, lego }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [items, setItems] = useState<Place[]>([]);

  const baseStyleRef = useRef<any | null>(null);
  const lastStyleUrlRef = useRef<string>("");
  const styleApplyTimerRef = useRef<number | null>(null);
  const styleApplySeqRef = useRef(0);

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

  async function load() {
    const resp = await fetch("/api/places", { cache: "no-store" });
    const data = (await resp.json()) as { items: Place[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of items) {
      const house = (p as any).house as any;
      const template = house?.template as string | undefined;
      const kind: "food" | "coffee" | "bar" =
        p.tags?.some((t) => /咖啡|cafe|coffee/i.test(t))
          ? "coffee"
          : p.tags?.some((t) => /酒吧|bar|pub/i.test(t))
            ? "bar"
            : "food";

      const el = template ? houseMarkerEl(template) : markerEl(kind);
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      m.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(p);
      });

      markersRef.current.push(m);
    }
  }, [items, openPopup]);

  return <div ref={containerRef} className="mapCanvas" />;
}

// EOF
"use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";

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
  refreshKey: number;
  onSelect: (p: Place) => void;
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

function houseMarkerEl(template: string) {
  const el = document.createElement("div");
  el.style.width = "56px";
  el.style.height = "56px";
  el.style.cursor = "pointer";
  const t = ["gable", "arch", "glass", "neon"].includes(template) ? template : "gable";
  el.style.backgroundImage = `url(/markers/house-${t}.svg)`;
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
  return (await resp.json()) as any;
}

export default function MapView({ center, refreshKey, onSelect, lego }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [items, setItems] = useState<Place[]>([]);

  const baseStyleRef = useRef<any | null>(null);
  const lastStyleUrlRef = useRef<string>("");
  const styleApplyTimerRef = useRef<number | null>(null);
  const styleApplySeqRef = useRef(0);

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

  async function load() {
    const resp = await fetch("/api/places", { cache: "no-store" });
    const data = (await resp.json()) as { items: Place[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of items) {
      const house = (p as any).house as any;
      const template = house?.template as string | undefined;
      const kind: "food" | "coffee" | "bar" =
        p.tags?.some((t) => /咖啡|cafe|coffee/i.test(t))
          ? "coffee"
          : p.tags?.some((t) => /酒吧|bar|pub/i.test(t))
            ? "bar"
            : "food";

      const el = template ? houseMarkerEl(template) : markerEl(kind);
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      m.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(p);
      });

      markersRef.current.push(m);
    }
  }, [items, openPopup]);

  return <div ref={containerRef} className="mapCanvas" />;
}
"use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";

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
  refreshKey: number;
  onSelect: (p: Place) => void;
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

function houseMarkerEl(template: string) {
  const el = document.createElement("div");
  el.style.width = "56px";
  el.style.height = "56px";
  el.style.cursor = "pointer";
  const t = ["gable", "arch", "glass", "neon"].includes(template) ? template : "gable";
  el.style.backgroundImage = `url(/markers/house-${t}.svg)`;
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
  return (await resp.json()) as any;
}

export default function MapView({ center, refreshKey, onSelect, lego }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [items, setItems] = useState<Place[]>([]);

  const baseStyleRef = useRef<any | null>(null);
  const lastStyleUrlRef = useRef<string>("");
  const styleApplyTimerRef = useRef<number | null>(null);
  const styleApplySeqRef = useRef(0);

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

      if ((p as any).dishes?.length) {
        const d = document.createElement("div");
        d.style.fontSize = "12px";
        d.style.marginBottom = "6px";
        d.textContent = `推荐菜：${(p as any).dishes.slice(0, 8).join("、")}`;
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

  async function load() {
    const resp = await fetch("/api/places", { cache: "no-store" });
    const data = (await resp.json()) as { items: Place[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of items) {
      const house = (p as any).house as any;
      const template = house?.template as string | undefined;
      const kind: "food" | "coffee" | "bar" =
        p.tags?.some((t) => /咖啡|cafe|coffee/i.test(t))
          ? "coffee"
          : p.tags?.some((t) => /酒吧|bar|pub/i.test(t))
            ? "bar"
            : "food";

      const el = template ? houseMarkerEl(template) : markerEl(kind);
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      m.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(p);
      });

      markersRef.current.push(m);
    }
  }, [items, openPopup]);

  return <div ref={containerRef} className="mapCanvas" />;
}
"use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";

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
  refreshKey: number;
  onSelect: (p: Place) => void;
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

function houseMarkerEl(template: string) {
  const el = document.createElement("div");
  el.style.width = "56px";
  el.style.height = "56px";
  el.style.cursor = "pointer";
  const t = ["gable", "arch", "glass", "neon"].includes(template) ? template : "gable";
  el.style.backgroundImage = `url(/markers/house-${t}.svg)`;
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
      ? /(poi|amenity|landmark|shop|tourism|transit|aeroway|minor|housenumber|address|station|rail|airport)/i
      : density < 70
        ? /(poi|amenity|landmark|shop|tourism|transit|aeroway|housenumber|address|station|rail|airport)/i
        : /(poi|amenity|shop|tourism|transit|aeroway|housenumber|address|station|rail|airport)/i;

  if (Array.isArray(s.layers)) {
    s.layers = s.layers.filter((ly: any) => {
      // 先减少信息密度：去掉大部分 POI/交通/杂项标注，只保留主要道路与行政区/水系等
      if (ly?.type === "symbol") {
        const id = String(ly?.id || "");
        const sl = String(ly?.["source-layer"] || "");
        if (KEEP_LABEL_RE.test(id) || KEEP_LABEL_RE.test(sl)) return true;
        // 兜底保留“主路/主区”标签
        const filterText = ly?.filter ? JSON.stringify(ly.filter) : "";
        if (/(motorway|trunk|primary|secondary|tertiary|major|district)/i.test(filterText))
          return true;
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
"use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";

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
  refreshKey: number;
  onSelect: (p: Place) => void;
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

function houseMarkerEl(template: string) {
  const el = document.createElement("div");
  el.style.width = "56px";
  el.style.height = "56px";
  el.style.cursor = "pointer";
  const t = ["gable", "arch", "glass", "neon"].includes(template) ? template : "gable";
  el.style.backgroundImage = `url(/markers/house-${t}.svg)`;
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
  return (await resp.json()) as any;
}

export default function MapView({ center, refreshKey, onSelect, lego }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [items, setItems] = useState<Place[]>([]);

  const baseStyleRef = useRef<any | null>(null);
  const lastStyleUrlRef = useRef<string>("");
  const styleApplyTimerRef = useRef<number | null>(null);
  const styleApplySeqRef = useRef(0);

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

  async function load() {
    const resp = await fetch("/api/places", { cache: "no-store" });
    const data = (await resp.json()) as { items: Place[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of items) {
      const house = (p as any).house as any;
      const template = house?.template as string | undefined;
      const kind: "food" | "coffee" | "bar" =
        p.tags?.some((t) => /咖啡|cafe|coffee/i.test(t))
          ? "coffee"
          : p.tags?.some((t) => /酒吧|bar|pub/i.test(t))
            ? "bar"
            : "food";

      const el = template ? houseMarkerEl(template) : markerEl(kind);
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      m.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(p);
      });

      markersRef.current.push(m);
    }
  }, [items, openPopup]);

  return <div ref={containerRef} className="mapCanvas" />;
}
  if (!resp.ok) throw new Error(`style.json fetch failed: ${resp.status}`);
  return (await resp.json()) as any;
}

export default function MapView({ center, refreshKey, onSelect, lego }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [items, setItems] = useState<Place[]>([]);

  const baseStyleRef = useRef<any | null>(null);
  const lastStyleUrlRef = useRef<string>("");

  const styleUrl = useMemo(() => process.env.NEXT_PUBLIC_MAP_STYLE_URL || "", []);

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

    let alive = true;
    (async () => {
      if (!styleUrl) return;

      if (!lego?.enabled) {
        // 关闭乐高风格时回到原始 style URL
        map.setStyle(styleUrl);
        return;
      }

      if (!baseStyleRef.current) {
        baseStyleRef.current = await fetchJsonStyle(styleUrl);
        if (!alive) return;
      }

      const next = legoifyStyle(baseStyleRef.current, lego);
      map.setStyle(next);
    })().catch(() => {
      // 忽略：不阻塞地图基础功能
    });

    return () => {
      alive = false;
    };
  }, [lego?.enabled, lego?.density, lego?.stroke, lego?.saturation, styleUrl]);

  async function load() {
    const resp = await fetch("/api/places", { cache: "no-store" });
    const data = (await resp.json()) as { items: Place[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of items) {
      const house = (p as any).house as any;
      const template = house?.template as string | undefined;
      const kind: "food" | "coffee" | "bar" =
        p.tags?.some((t) => /咖啡|cafe|coffee/i.test(t))
          ? "coffee"
          : p.tags?.some((t) => /酒吧|bar|pub/i.test(t))
            ? "bar"
            : "food";

      const el = template ? houseMarkerEl(template) : markerEl(kind);
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      m.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(p);
      });

      markersRef.current.push(m);
    }
  }, [items, openPopup]);

  return <div ref={containerRef} className="mapCanvas" />;
}
