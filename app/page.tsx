"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MapView from "@/components/MapView";
import type { Place, PlaceSearchCandidate } from "@/lib/types";
import PlaceForm from "@/components/PlaceForm";

const DEFAULT_CENTER = { lat: 31.2304, lng: 121.4737 } as const; // 上海市中心（人民广场附近）

type MapFocusTarget = {
  id: string;
  lat: number;
  lng: number;
  zoom?: number;
};

function upsertPlace(list: Place[], saved: Place) {
  const next = list.filter((item) => item.id !== saved.id);
  return [saved, ...next].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
}

export default function Page() {
  const [selected, setSelected] = useState<Place | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [searchingByName, setSearchingByName] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceSearchCandidate[]>([]);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [legoOn, setLegoOn] = useState<boolean>(() => {
    const v = String(process.env.NEXT_PUBLIC_MAP_LEGO_MODE || "").toLowerCase();
    return ["1", "true", "yes", "on"].includes(v);
  });
  const [legoDensity, setLegoDensity] = useState<number>(() =>
    Number(process.env.NEXT_PUBLIC_MAP_LEGO_DENSITY || 35)
  );
  const [legoStroke, setLegoStroke] = useState<number>(() =>
    Number(process.env.NEXT_PUBLIC_MAP_LEGO_STROKE || 55)
  );
  const [legoSaturation, setLegoSaturation] = useState<number>(() =>
    Number(process.env.NEXT_PUBLIC_MAP_LEGO_SATURATION || 70)
  );

  const placesApiUrl = useMemo(() => {
    return lastSavedId ? `/api/places?includeId=${encodeURIComponent(lastSavedId)}` : "/api/places";
  }, [lastSavedId]);

  const loadPlaces = useCallback(async () => {
    setLoadingPlaces(true);
    try {
      const resp = await fetch(placesApiUrl, { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "加载餐厅失败");
      setPlaces(Array.isArray(data?.items) ? data.items : []);
    } finally {
      setLoadingPlaces(false);
    }
  }, [placesApiUrl]);

  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  const clearSearchResults = useCallback(() => {
    setSearchResults([]);
  }, []);

  const handleSearchByName = useCallback(async (name: string) => {
    const keyword = name.trim();
    if (!keyword) {
      setSearchResults([]);
      return;
    }
    setSearchingByName(true);
    try {
      const resp = await fetch(`/api/geocode/forward?q=${encodeURIComponent(keyword)}`,
        {
          cache: "no-store",
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "定位失败");
      const items = Array.isArray(data?.items) ? (data.items as PlaceSearchCandidate[]) : [];
      setSearchResults(items);
      if (items[0]) {
        setFocusTarget({
          id: `search-${items[0].id}`,
          lat: items[0].lat,
          lng: items[0].lng,
          zoom: 15.8,
        });
      }
    } finally {
      setSearchingByName(false);
    }
  }, []);

  const handlePickSearchResult = useCallback((candidate: PlaceSearchCandidate) => {
    setFocusTarget({
      id: `search-${candidate.id}`,
      lat: candidate.lat,
      lng: candidate.lng,
      zoom: 17.2,
    });
  }, []);

  return (
    <div className="appShell">
      <aside className="panel">
        <div className="brand">
          <div className="logo" aria-hidden="true" />
          <div>
            <div className="title">卡通餐厅地图</div>
            <div className="subtitle">上海 · 网页版 · 公开可读 · 受邀可编辑</div>
          </div>
        </div>

        <div className="pillRow">
          <span className="pill">点地图可新增</span>
          <span className="pill">点标记可查看</span>
          <span className="pill">提交前需验证码</span>
        </div>

        <div className="divider" />

        <div className="sectionTitle">地图风格（乐高块面）</div>
        <label className="toggleRow">
          <input type="checkbox" checked={legoOn} onChange={(e) => setLegoOn(e.target.checked)} />
          <span className="subtitle">启用乐高风格</span>
        </label>

        <div className="sliderRow">
          <div className="sliderLabel">
            <span>信息密度</span>
            <span className="sliderValue">{Math.round(legoDensity)}</span>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={legoDensity}
            onChange={(e) => setLegoDensity(Number(e.target.value))}
          />
          <div className="subtitle">越低越干净（更适合突出餐厅标记）</div>
        </div>

        <div className="sliderRow">
          <div className="sliderLabel">
            <span>描边/线条粗细</span>
            <span className="sliderValue">{Math.round(legoStroke)}</span>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={legoStroke}
            onChange={(e) => setLegoStroke(Number(e.target.value))}
          />
        </div>

        <div className="sliderRow">
          <div className="sliderLabel">
            <span>色彩饱和</span>
            <span className="sliderValue">{Math.round(legoSaturation)}</span>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={legoSaturation}
            onChange={(e) => setLegoSaturation(Number(e.target.value))}
          />
        </div>

        <div className="divider" />

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={() => void loadPlaces()}>
            {loadingPlaces ? "刷新中…" : "刷新数据"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setSelected(null);
              setFocusTarget(null);
              clearSearchResults();
            }}
          >
            新增餐厅
          </button>
        </div>

        <div className="divider" />

        <PlaceForm
          selected={selected}
          searchResults={searchResults}
          searchingByName={searchingByName}
          onSearchByName={handleSearchByName}
          onPickSearchResult={handlePickSearchResult}
          onClearSearchResults={clearSearchResults}
          onSaved={(saved) => {
            setLastSavedId(saved.id);
            setPlaces((prev) => upsertPlace(prev, saved));
            setFocusTarget({
              id: `saved-${saved.id}-${saved.updated_at}`,
              lat: saved.lat,
              lng: saved.lng,
              zoom: 16.8,
            });
            void loadPlaces();
          }}
        />

        <div className="divider" />
        <div className="subtitle">
          提示：这是原型版本。上线前建议加“修改历史/回滚面板”和更严格的限流策略。
        </div>
      </aside>

      <main className="mapWrap">
        <MapView
          center={DEFAULT_CENTER}
          items={places}
          searchResults={searchResults}
          focusTarget={focusTarget}
          onSelect={(p) => setSelected(p)}
          onPickSearchResult={handlePickSearchResult}
          lego={{
            enabled: legoOn,
            density: legoDensity,
            stroke: legoStroke,
            saturation: legoSaturation,
          }}
        />
      </main>
    </div>
  );
}
"use client";

import { useState } from "react";
import MapView from "@/components/MapView";
import type { Place } from "@/lib/types";
import PlaceForm from "@/components/PlaceForm";

const DEFAULT_CENTER = { lat: 31.2304, lng: 121.4737 } as const; // 上海市中心（人民广场附近）

export default function Page() {
  const [selected, setSelected] = useState<Place | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [legoOn, setLegoOn] = useState<boolean>(() => {
    const v = String(process.env.NEXT_PUBLIC_MAP_LEGO_MODE || "").toLowerCase();
    return ["1", "true", "yes", "on"].includes(v);
  });
  const [legoDensity, setLegoDensity] = useState<number>(() =>
    Number(process.env.NEXT_PUBLIC_MAP_LEGO_DENSITY || 35)
  );
  const [legoStroke, setLegoStroke] = useState<number>(() =>
    Number(process.env.NEXT_PUBLIC_MAP_LEGO_STROKE || 55)
  );
  const [legoSaturation, setLegoSaturation] = useState<number>(() =>
    Number(process.env.NEXT_PUBLIC_MAP_LEGO_SATURATION || 70)
  );

  return (
    <div className="appShell">
      <aside className="panel">
        <div className="brand">
          <div className="logo" aria-hidden="true" />
          <div>
            <div className="title">卡通餐厅地图</div>
            <div className="subtitle">上海 · 网页版 · 公开可读 · 受邀可编辑</div>
          </div>
        </div>

        <div className="pillRow">
          <span className="pill">点地图可新增</span>
          <span className="pill">点标记可查看</span>
          <span className="pill">提交前需验证码</span>
        </div>

        <div className="divider" />

        <div className="sectionTitle">地图风格（乐高块面）</div>
        <label className="toggleRow">
          <input type="checkbox" checked={legoOn} onChange={(e) => setLegoOn(e.target.checked)} />
          <span className="subtitle">启用乐高风格</span>
        </label>

        <div className="sliderRow">
          <div className="sliderLabel">
            <span>信息密度</span>
            <span className="sliderValue">{Math.round(legoDensity)}</span>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={legoDensity}
            onChange={(e) => setLegoDensity(Number(e.target.value))}
          />
          <div className="subtitle">越低越干净（更适合突出餐厅标记）</div>
        </div>

        <div className="sliderRow">
          <div className="sliderLabel">
            <span>描边/线条粗细</span>
            <span className="sliderValue">{Math.round(legoStroke)}</span>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={legoStroke}
            onChange={(e) => setLegoStroke(Number(e.target.value))}
          />
        </div>

        <div className="sliderRow">
          <div className="sliderLabel">
            <span>色彩饱和</span>
            <span className="sliderValue">{Math.round(legoSaturation)}</span>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={legoSaturation}
            onChange={(e) => setLegoSaturation(Number(e.target.value))}
          />
        </div>

        <div className="divider" />

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={() => setRefreshKey((k) => k + 1)}>
            刷新数据
          </button>
          <button className="btn primary" onClick={() => setSelected(null)}>
            新增餐厅
          </button>
        </div>

        <div className="divider" />

        <PlaceForm
          key={selected?.id ?? "new"}
          selected={selected}
          onSaved={() => {
            setSelected(null);
            setRefreshKey((k) => k + 1);
          }}
        />

        <div className="divider" />
        <div className="subtitle">
          提示：这是原型版本。上线前建议加“修改历史/回滚面板”和更严格的限流策略。
        </div>
      </aside>

      <main className="mapWrap">
        <MapView
          center={DEFAULT_CENTER}
          refreshKey={refreshKey}
          onSelect={(p) => setSelected(p)}
          lego={{
            enabled: legoOn,
            density: legoDensity,
            stroke: legoStroke,
            saturation: legoSaturation,
          }}
        />
      </main>
    </div>
  );
}
