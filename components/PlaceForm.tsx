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
