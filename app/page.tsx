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

