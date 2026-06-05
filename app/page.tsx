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
""use client";"use client";

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
use client";

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
"use client";

import { useMemo, useState } from "react";
import MapView, { Place } from "@/components/MapView";
import PlaceForm from "@/components/PlaceForm";

export default function Page() {
  const [selected, setSelected] = useState<Place | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const center = useMemo(() => ({ lat: 31.2085, lng: 121.465 }), []); // 汾阳路附近

  return (
    <div className="appShell">
      <aside className="panel">
        <div className="brand">
          <div className="logo" aria-hidden="true" />
          <div>
            <div className="title">卡通餐厅地图</div>
            <div className="subtitle">汾阳路及周边 · 公开可读 · 受邀可编辑</div>
          </div>
        </div>

        <div className="pillRow">
          <span className="pill">点地图可新增</span>
          <span className="pill">点标记可查看</span>
          <span className="pill">提交前需验证码</span>
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
        <MapView center={center} refreshKey={refreshKey} onSelect={(p) => setSelected(p)} />
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
          <input
            type="checkbox"
            checked={legoOn}
            onChange={(e) => setLegoOn(e.target.checked)}
          />
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
"use client";

import { useMemo, useState } from "react";
import MapView, { Place } from "@/components/MapView";
import PlaceForm from "@/components/PlaceForm";

export default function Page() {
  const [selected, setSelected] = useState<Place | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const center = useMemo(() => ({ lat: 31.2085, lng: 121.465 }), []); // 汾阳路附近

  return (
    <div className="appShell">
      <aside className="panel">
        <div className="brand">
          <div className="logo" aria-hidden="true" />
          <div>
            <div className="title">卡通餐厅地图</div>
            <div className="subtitle">汾阳路及周边 · 公开可读 · 受邀可编辑</div>
          </div>
        </div>

        <div className="pillRow">
          <span className="pill">点地图可新增</span>
          <span className="pill">点标记可查看</span>
          <span className="pill">提交前需验证码</span>
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
        <MapView center={center} refreshKey={refreshKey} onSelect={(p) => setSelected(p)} />
      </main>
    </div>
  );
}
"use client";

import { useMemo, useState } from "react";
import MapView, { Place } from "@/components/MapView";
import PlaceForm from "@/components/PlaceForm";

export default function Page() {
  const [selected, setSelected] = useState<Place | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const center = useMemo(() => ({ lat: 31.2085, lng: 121.465 }), []); // 汾阳路附近

  return (
    <div className="appShell">
      <aside className="panel">
        <div className="brand">
          <div className="logo" aria-hidden="true" />
          <div>
            <div className="title">卡通餐厅地图</div>
            <div className="subtitle">汾阳路及周边 · 任何人都能添加/编辑</div>
          </div>
        </div>

        <div className="pillRow">
          <span className="pill">点地图可新增</span>
          <span className="pill">点标记可编辑</span>
          <span className="pill">提交前需验证码</span>
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
          center={center}
          refreshKey={refreshKey}
          onSelect={(p) => setSelected(p)}
        />
      </main>
    </div>
  );
}

