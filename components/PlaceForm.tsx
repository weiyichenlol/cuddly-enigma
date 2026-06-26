"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HouseConfig, Place, PlaceSearchCandidate } from "@/lib/types";

type Props = {
  selected: Place | null;
  searchResults: PlaceSearchCandidate[];
  searchingByName: boolean;
  onSearchByName: (name: string) => Promise<void> | void;
  onPickSearchResult: (candidate: PlaceSearchCandidate) => void;
  onClearSearchResults: () => void;
  onSaved: (saved: Place) => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: Record<string, unknown>) => string;
      getResponse: (widgetId?: string) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

function splitTags(s: string) {
  return s
    .split(/[,\n，]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function featureLabel(f: string) {
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
    }[f] ?? f
  );
}

function lightingLabel(v?: string) {
  return v === "neon" ? "霓虹" : v === "cool" ? "冷调" : v === "warm" ? "暖调" : "未生成";
}

export default function PlaceForm({
  selected,
  searchResults,
  searchingByName,
  onSearchByName,
  onPickSearchResult,
  onClearSearchResults,
  onSaved,
}: Props) {
  const [inviteCode, setInviteCode] = useState<string>("");
  const [name, setName] = useState(selected?.name ?? "");
  const [lat, setLat] = useState<number>(selected?.lat ?? 31.2085);
  const [lng, setLng] = useState<number>(selected?.lng ?? 121.465);
  const [address, setAddress] = useState<string>(selected?.address ?? "");
  const [rating, setRating] = useState<string>(selected?.rating?.toString() ?? "");
  const [ppp, setPpp] = useState<string>(selected?.price_per_person?.toString() ?? "");
  const [tags, setTags] = useState<string>((selected?.tags ?? []).join(", "));
  const [note, setNote] = useState<string>(selected?.note ?? "");
  const [links, setLinks] = useState<string>(selected?.links ?? "");
  const [dishes, setDishes] = useState<string>(((selected as any)?.dishes ?? []).join(", "));
  // 建房子：结构化关键词（你选了“门头与材质 + 色彩与灯光”，并保留“氛围 + 标志元素”）
  const [kwAmbiance, setKwAmbiance] = useState<string>("");
  const [kwIconic, setKwIconic] = useState<string>("");
  const [kwStorefront, setKwStorefront] = useState<string>("");
  const [kwColorLight, setKwColorLight] = useState<string>("");
  const [house, setHouse] = useState<HouseConfig>((selected?.house ?? {}) as HouseConfig);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const siteKey = useMemo(() => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "", []);
  const widgetRef = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setName(selected?.name ?? "");
    setLat(selected?.lat ?? 31.2085);
    setLng(selected?.lng ?? 121.465);
    setAddress(selected?.address ?? "");
    setRating(selected?.rating?.toString() ?? "");
    setPpp(selected?.price_per_person?.toString() ?? "");
    setTags((selected?.tags ?? []).join(", "));
    setNote(selected?.note ?? "");
    setLinks(selected?.links ?? "");
    setDishes(((selected as any)?.dishes ?? []).join(", "));
    setHouse((selected?.house ?? {}) as HouseConfig);
    setKwAmbiance("");
    setKwIconic("");
    setKwStorefront("");
    setKwColorLight("");
    setMsg("");
    onClearSearchResults();
  }, [selected, onClearSearchResults]);

  const hydrateAddress = useCallback(async (nextLat: number, nextLng: number) => {
    try {
      const resp = await fetch("/api/geocode/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: nextLat, lng: nextLng }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "反向地理编码失败");
      setAddress(data.address || "");
      return data.address || "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ lng: number; lat: number }>;
      if (ce?.detail) {
        const nextLng = Number(ce.detail.lng.toFixed(6));
        const nextLat = Number(ce.detail.lat.toFixed(6));
        setLng(nextLng);
        setLat(nextLat);
        void hydrateAddress(nextLat, nextLng);
        setMsg("已填入地图点击坐标，并尝试补全地址 ✅");
      }
    };
    window.addEventListener("place-map-click", handler);
    return () => window.removeEventListener("place-map-click", handler);
  }, [hydrateAddress]);

  useEffect(() => {
    if (!siteKey) return;
    // 加载 Turnstile 脚本（只加载一次）
    const id = "turnstile-script";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    const t = window.turnstile;
    if (!boxRef.current) return;

    // 只渲染一次 Turnstile。否则表单每次 setState（例如生成房子方案）都会触发 re-render，
    // 进而 reset 验证码，导致“刚验证完又被清掉”的体验问题。
    if (widgetRef.current) return;

    const timer = window.setInterval(() => {
      const tt = window.turnstile;
      if (!tt || !boxRef.current) return;
      if (widgetRef.current) return;

      widgetRef.current = tt.render(boxRef.current, { sitekey: siteKey });
      window.clearInterval(timer);
    }, 200);

    return () => window.clearInterval(timer);
  }, [siteKey]);

  async function submit() {
    setMsg("");
    if (!inviteCode.trim()) return setMsg("请先填写邀请码（受邀可编辑）");
    if (!name.trim()) return setMsg("请先填写餐厅名称");

    const token = widgetRef.current ? window.turnstile?.getResponse(widgetRef.current) : "";
    if (!token) return setMsg("请先完成验证码验证");

    setBusy(true);
    try {
      const resp = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnstileToken: token,
          inviteCode,
          place: {
            id: selected?.id,
            name: name.trim(),
            lat,
            lng,
            address: address.trim() || null,
            rating: rating ? Number(rating) : null,
            price_per_person: ppp ? Number(ppp) : null,
            tags: splitTags(tags),
            note: note || null,
            links: links || null,
            dishes: splitTags(dishes),
            house,
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "提交失败");

      setMsg("保存成功 ✅");
      setAddress(data?.item?.address ?? address);
      window.turnstile?.reset(widgetRef.current ?? undefined);
      onSaved(data.item as Place);
    } catch (e: any) {
      setMsg(e?.message || "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        {selected ? "编辑餐厅" : "新增餐厅"}
      </div>

      <label className="subtitle">邀请码（受邀可编辑）</label>
      <input
        className="input"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        placeholder="由创建者发放；可撤销"
      />

      <div style={{ marginTop: 10 }} className="subtitle">
        不想上传图片也可以：用“关键词”生成房子方案（氛围/标志元素/门头与材质/色彩与灯光）。
      </div>

      <label className="subtitle">名称</label>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="比如：莆田 / 晶苑 / 大董…"
          style={{ flex: 1 }}
        />
        <button
          className="btn"
          type="button"
          disabled={searchingByName || !name.trim()}
          onClick={async () => {
            setMsg("");
            try {
              await onSearchByName(name);
              setMsg("已完成名称定位；若有候选，会同步显示在地图和下方列表。");
            } catch (e: any) {
              setMsg(e?.message || "按名称定位失败");
            }
          }}
        >
          {searchingByName ? "定位中…" : "按名称定位"}
        </button>
      </div>
      {!!searchResults.length && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(31,41,55,0.12)",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>定位候选（已同步标在地图上）</div>
            <button className="btn" type="button" onClick={onClearSearchResults}>
              清空候选
            </button>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {searchResults.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  setName(candidate.name || name);
                  setLat(candidate.lat);
                  setLng(candidate.lng);
                  setAddress(candidate.address);
                  onPickSearchResult(candidate);
                  setMsg(`已回填候选位置 #${index + 1} ✅`);
                }}
                style={{
                  textAlign: "left",
                  borderRadius: 12,
                  border: "1px solid rgba(31,41,55,0.12)",
                  background: "#fffaf2",
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  候选 {index + 1}：{candidate.name}
                </div>
                <div className="subtitle" style={{ marginTop: 4 }}>
                  {candidate.address}
                </div>
                <div className="subtitle" style={{ marginTop: 4 }}>
                  {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div>
          <label className="subtitle">纬度 lat</label>
          <input className="input" value={lat} onChange={(e) => setLat(Number(e.target.value))} />
        </div>
        <div>
          <label className="subtitle">经度 lng</label>
          <input className="input" value={lng} onChange={(e) => setLng(Number(e.target.value))} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">位置描述 / 地址</label>
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="可手填，也会在地图点击/定位后自动补全"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div>
          <label className="subtitle">评分（你们自填）</label>
          <input className="input" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="0-10 或 0-5" />
        </div>
        <div>
          <label className="subtitle">人均（元）</label>
          <input className="input" value={ppp} onChange={(e) => setPpp(e.target.value)} placeholder="比如 120" />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">标签（逗号分隔）</label>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="本帮, 约会, 咖啡, 夜宵…" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">推荐菜（逗号分隔）</label>
        <input className="input" value={dishes} onChange={(e) => setDishes(e.target.value)} placeholder="比如：蟹粉小笼, 红烧肉, 烤鸭…" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">关键词（用于生成房子）</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <input
            className="input"
            value={kwAmbiance}
            onChange={(e) => setKwAmbiance(e.target.value)}
            placeholder="氛围：复古, 温暖, 安静 / 热闹, 夜晚, 酷…"
          />
          <input
            className="input"
            value={kwIconic}
            onChange={(e) => setKwIconic(e.target.value)}
            placeholder="标志元素：红灯笼, 木门头, 绿植, 暖黄灯, 海报墙…"
          />
          <input
            className="input"
            value={kwStorefront}
            onChange={(e) => setKwStorefront(e.target.value)}
            placeholder="门头与材质：中式牌匾/霓虹灯牌/手写黑板；木/砖/玻璃；拱门/落地窗/外摆…"
          />
          <input
            className="input"
            value={kwColorLight}
            onChange={(e) => setKwColorLight(e.target.value)}
            placeholder="色彩与灯光：奶油白/墨绿/酒红/黑金；暖黄/冷白/霓虹粉蓝；夜晚发光…"
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              setMsg("");
              if (![kwAmbiance, kwIconic, kwStorefront, kwColorLight].some((x) => x.trim())) {
                return setMsg("请至少填写一项关键词（氛围/标志元素/门头与材质/色彩与灯光）");
              }
              try {
                const resp = await fetch("/api/house/suggest", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ambiance: kwAmbiance,
                    iconic: kwIconic,
                    storefront: kwStorefront,
                    colorLight: kwColorLight,
                  }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data?.error || "生成失败");
                setHouse(data.house);
                setMsg(`已生成房子方案：${data.house?.summary || data.house?.template || ""} ✅`);
              } catch (e: any) {
                setMsg(e?.message || "生成失败");
              }
            }}
          >
            生成房子方案
          </button>
          <span className="subtitle">
            当前模板：{String((house as any)?.template || "未生成")}
          </span>
        </div>
        {!!house?.template && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: "3px solid rgba(31,41,55,0.12)",
              borderRadius: 14,
              background: "#fffaf2",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>房子方案预览</div>
            <div className="subtitle" style={{ marginBottom: 8 }}>
              {house.summary || "已生成房子方案"}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {Object.entries(house.palette ?? {}).map(([key, value]) =>
                typeof value === "string" ? (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#fff",
                      border: "1px solid rgba(31,41,55,0.12)",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: value,
                        border: "1px solid rgba(31,41,55,0.18)",
                        display: "inline-block",
                      }}
                    />
                    <span className="subtitle">
                      {key === "primary" ? "主色" : key === "secondary" ? "辅色" : "强调色"}
                    </span>
                  </div>
                ) : null
              )}
            </div>
            <div className="subtitle">
              材质：{house.facade || "未生成"} · 屋顶：{house.roof || "未生成"} · 灯光：
              {lightingLabel(house.lighting)}
            </div>
            {!!house.features?.length && (
              <div className="subtitle" style={{ marginTop: 6 }}>
                立面元素：{house.features.map(featureLabel).join("、")}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">推荐理由</label>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句话：为什么推荐？适合什么场景？" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">外链（可放点评/小红书等）</label>
        <input className="input" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" />
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="subtitle">验证码</label>
        <div
          ref={boxRef}
          style={{
            border: "3px dashed rgba(31,41,55,0.35)",
            borderRadius: 14,
            padding: 10,
            background: "#fff",
          }}
        >
          {!siteKey ? "未配置 NEXT_PUBLIC_TURNSTILE_SITE_KEY" : "加载中…"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? "提交中…" : "保存"}
        </button>
        <span className="subtitle">{msg}</span>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HouseConfig, Place } from "@/lib/types";

type Props = {
  selected: Place | null;
  onSaved: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: Record<string, unknown>) => string;
      getResponse: (widgetId?: string) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

function splitTags(s: string) {
  return s
    .split(/[,\n，]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function featureLabel(f: string) {
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
    }[f] ?? f
  );
}

function lightingLabel(v?: string) {
  return v === "neon" ? "霓虹" : v === "cool" ? "冷调" : v === "warm" ? "暖调" : "未生成";
}

export default function PlaceForm({ selected, onSaved }: Props) {
  const [inviteCode, setInviteCode] = useState<string>("");
  const [name, setName] = useState(selected?.name ?? "");
  const [lat, setLat] = useState<number>(selected?.lat ?? 31.2085);
  const [lng, setLng] = useState<number>(selected?.lng ?? 121.465);
  const [rating, setRating] = useState<string>(selected?.rating?.toString() ?? "");
  const [ppp, setPpp] = useState<string>(selected?.price_per_person?.toString() ?? "");
  const [tags, setTags] = useState<string>((selected?.tags ?? []).join(", "));
  const [note, setNote] = useState<string>(selected?.note ?? "");
  const [links, setLinks] = useState<string>(selected?.links ?? "");
  const [dishes, setDishes] = useState<string>(((selected as any)?.dishes ?? []).join(", "));
  // 建房子：结构化关键词（你选了“门头与材质 + 色彩与灯光”，并保留“氛围 + 标志元素”）
  const [kwAmbiance, setKwAmbiance] = useState<string>("");
  const [kwIconic, setKwIconic] = useState<string>("");
  const [kwStorefront, setKwStorefront] = useState<string>("");
  const [kwColorLight, setKwColorLight] = useState<string>("");
  const [house, setHouse] = useState<HouseConfig>((selected?.house ?? {}) as HouseConfig);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const siteKey = useMemo(() => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "", []);
  const widgetRef = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ lng: number; lat: number }>;
      if (ce?.detail) {
        setLng(Number(ce.detail.lng.toFixed(6)));
        setLat(Number(ce.detail.lat.toFixed(6)));
        setMsg("已填入地图点击坐标 ✅");
      }
    };
    window.addEventListener("place-map-click", handler);
    return () => window.removeEventListener("place-map-click", handler);
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    // 加载 Turnstile 脚本（只加载一次）
    const id = "turnstile-script";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    const t = window.turnstile;
    if (!boxRef.current) return;

    // 只渲染一次 Turnstile。否则表单每次 setState（例如生成房子方案）都会触发 re-render，
    // 进而 reset 验证码，导致“刚验证完又被清掉”的体验问题。
    if (widgetRef.current) return;

    const timer = window.setInterval(() => {
      const tt = window.turnstile;
      if (!tt || !boxRef.current) return;
      if (widgetRef.current) return;

      widgetRef.current = tt.render(boxRef.current, { sitekey: siteKey });
      window.clearInterval(timer);
    }, 200);

    return () => window.clearInterval(timer);
  }, [siteKey]);

  async function submit() {
    setMsg("");
    if (!inviteCode.trim()) return setMsg("请先填写邀请码（受邀可编辑）");
    if (!name.trim()) return setMsg("请先填写餐厅名称");

    const token = widgetRef.current ? window.turnstile?.getResponse(widgetRef.current) : "";
    if (!token) return setMsg("请先完成验证码验证");

    setBusy(true);
    try {
      const resp = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnstileToken: token,
          inviteCode,
          place: {
            id: selected?.id,
            name,
            lat,
            lng,
            rating: rating ? Number(rating) : null,
            price_per_person: ppp ? Number(ppp) : null,
            tags: splitTags(tags),
            note: note || null,
            links: links || null,
            dishes: splitTags(dishes),
            house
          }
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "提交失败");

      setMsg("保存成功 ✅");
      window.turnstile?.reset(widgetRef.current ?? undefined);
      onSaved();
    } catch (e: any) {
      setMsg(e?.message || "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        {selected ? "编辑餐厅" : "新增餐厅"}
      </div>

      <label className="subtitle">邀请码（受邀可编辑）</label>
      <input
        className="input"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        placeholder="由创建者发放；可撤销"
      />

      <div style={{ marginTop: 10 }} className="subtitle">
        不想上传图片也可以：用“关键词”生成房子方案（氛围/标志元素/门头与材质/色彩与灯光）。
      </div>

      <label className="subtitle">名称</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="比如：莆田 / 晶苑 / 大董…" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div>
          <label className="subtitle">纬度 lat</label>
          <input className="input" value={lat} onChange={(e) => setLat(Number(e.target.value))} />
        </div>
        <div>
          <label className="subtitle">经度 lng</label>
          <input className="input" value={lng} onChange={(e) => setLng(Number(e.target.value))} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div>
          <label className="subtitle">评分（你们自填）</label>
          <input className="input" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="0-10 或 0-5" />
        </div>
        <div>
          <label className="subtitle">人均（元）</label>
          <input className="input" value={ppp} onChange={(e) => setPpp(e.target.value)} placeholder="比如 120" />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">标签（逗号分隔）</label>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="本帮, 约会, 咖啡, 夜宵…" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">推荐菜（逗号分隔）</label>
        <input className="input" value={dishes} onChange={(e) => setDishes(e.target.value)} placeholder="比如：蟹粉小笼, 红烧肉, 烤鸭…" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">关键词（用于生成房子）</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <input
            className="input"
            value={kwAmbiance}
            onChange={(e) => setKwAmbiance(e.target.value)}
            placeholder="氛围：复古, 温暖, 安静 / 热闹, 夜晚, 酷…"
          />
          <input
            className="input"
            value={kwIconic}
            onChange={(e) => setKwIconic(e.target.value)}
            placeholder="标志元素：红灯笼, 木门头, 绿植, 暖黄灯, 海报墙…"
          />
          <input
            className="input"
            value={kwStorefront}
            onChange={(e) => setKwStorefront(e.target.value)}
            placeholder="门头与材质：中式牌匾/霓虹灯牌/手写黑板；木/砖/玻璃；拱门/落地窗/外摆…"
          />
          <input
            className="input"
            value={kwColorLight}
            onChange={(e) => setKwColorLight(e.target.value)}
            placeholder="色彩与灯光：奶油白/墨绿/酒红/黑金；暖黄/冷白/霓虹粉蓝；夜晚发光…"
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              setMsg("");
              if (![kwAmbiance, kwIconic, kwStorefront, kwColorLight].some((x) => x.trim())) {
                return setMsg("请至少填写一项关键词（氛围/标志元素/门头与材质/色彩与灯光）");
              }
              try {
                const resp = await fetch("/api/house/suggest", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ambiance: kwAmbiance,
                    iconic: kwIconic,
                    storefront: kwStorefront,
                    colorLight: kwColorLight,
                  }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data?.error || "生成失败");
                setHouse(data.house);
                setMsg(`已生成房子方案：${data.house?.summary || data.house?.template || ""} ✅`);
              } catch (e: any) {
                setMsg(e?.message || "生成失败");
              }
            }}
          >
            生成房子方案
          </button>
          <span className="subtitle">
            当前模板：{String((house as any)?.template || "未生成")}
          </span>
        </div>
        {!!house?.template && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: "3px solid rgba(31,41,55,0.12)",
              borderRadius: 14,
              background: "#fffaf2",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>房子方案预览</div>
            <div className="subtitle" style={{ marginBottom: 8 }}>
              {house.summary || "已生成房子方案"}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {Object.entries(house.palette ?? {}).map(([key, value]) =>
                typeof value === "string" ? (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#fff",
                      border: "1px solid rgba(31,41,55,0.12)",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: value,
                        border: "1px solid rgba(31,41,55,0.18)",
                        display: "inline-block",
                      }}
                    />
                    <span className="subtitle">
                      {key === "primary" ? "主色" : key === "secondary" ? "辅色" : "强调色"}
                    </span>
                  </div>
                ) : null
              )}
            </div>
            <div className="subtitle">
              材质：{house.facade || "未生成"} · 屋顶：{house.roof || "未生成"} · 灯光：
              {lightingLabel(house.lighting)}
            </div>
            {!!house.features?.length && (
              <div className="subtitle" style={{ marginTop: 6 }}>
                立面元素：{house.features.map(featureLabel).join("、")}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">推荐理由</label>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句话：为什么推荐？适合什么场景？" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="subtitle">外链（可放点评/小红书等）</label>
        <input className="input" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" />
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="subtitle">验证码</label>
        <div
          ref={boxRef}
          style={{
            border: "3px dashed rgba(31,41,55,0.35)",
            borderRadius: 14,
            padding: 10,
            background: "#fff",
          }}
        >
          {!siteKey ? "未配置 NEXT_PUBLIC_TURNSTILE_SITE_KEY" : "加载中…"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? "提交中…" : "保存"}
        </button>
        <span className="subtitle">{msg}</span>
      </div>
    </div>
  );
}
