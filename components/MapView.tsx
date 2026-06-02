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
