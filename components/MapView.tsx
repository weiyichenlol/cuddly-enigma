"use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";

export type { Place };

type Props = {
  center: { lat: number; lng: number };
  refreshKey: number;
  onSelect: (p: Place) => void;
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

export default function MapView({ center, refreshKey, onSelect }: Props) {
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [items, setItems] = useState<Place[]>([]);

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

  const styleUrl = useMemo(() => {
    return process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";
  }, []);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: "map",
      style: styleUrl || "https://demotiles.maplibre.org/style.json",
      center: [center.lng, center.lat],
      zoom: 15.2,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "bottom-right"
    );
    mapRef.current = map;

    map.on("click", (e) => {
      popupRef.current?.remove();
      popupRef.current = null;
      // 新增：把点击点坐标写入表单（用自定义事件传递，避免引入全局状态库）
      window.dispatchEvent(
        new CustomEvent("place-map-click", {
          detail: { lng: e.lngLat.lng, lat: e.lngLat.lat },
        })
      );
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lng, styleUrl]);

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

    // 清理旧 marker
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

  return <div id="map" className="mapCanvas" />;
}
"use client";

import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/types";

export type { Place };

type Props = {
  center: { lat: number; lng: number };
  refreshKey: number;
  onSelect: (p: Place) => void;
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

export default function MapView({ center, refreshKey, onSelect }: Props) {
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [items, setItems] = useState<Place[]>([]);

  const styleUrl = useMemo(() => {
    return process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";
  }, []);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: "map",
      style: styleUrl || "https://demotiles.maplibre.org/style.json",
      center: [center.lng, center.lat],
      zoom: 15.2,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "bottom-right"
    );
    mapRef.current = map;

    map.on("click", (e) => {
      // 新增：把点击点坐标写入表单（用自定义事件传递，避免引入全局状态库）
      window.dispatchEvent(
        new CustomEvent("place-map-click", {
          detail: { lng: e.lngLat.lng, lat: e.lngLat.lat },
        })
      );
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lng, styleUrl]);

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

    // 清理旧 marker
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
        onSelect(p);
      });

      markersRef.current.push(m);
    }
  }, [items, onSelect]);

  return <div id="map" className="mapCanvas" />;
}
