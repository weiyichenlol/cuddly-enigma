import { NextRequest, NextResponse } from "next/server";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function getKeyFromStyleUrl(styleUrl?: string) {
  if (!styleUrl) return "";
  try {
    const u = new URL(styleUrl);
    return u.searchParams.get("key") || "";
  } catch {
    return "";
  }
}

function maptilerKey() {
  return (
    process.env.MAPTILER_KEY ||
    process.env.MAPTILER_API_KEY ||
    process.env.NEXT_PUBLIC_MAPTILER_KEY ||
    getKeyFromStyleUrl(process.env.NEXT_PUBLIC_MAP_STYLE_URL)
  );
}

const SHANGHAI_BBOX = "120.85,30.67,122.12,31.88";
const SHANGHAI_PROXIMITY = "121.4737,31.2304";

export async function GET(req: NextRequest) {
  const q = String(req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "缺少 q" }, 400);

  const key = maptilerKey();
  if (!key) return json({ error: "未配置 MAPTILER_KEY（或 NEXT_PUBLIC_MAP_STYLE_URL 里缺少 key）" }, 500);

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "zh");
  url.searchParams.set("limit", "6");
  url.searchParams.set("bbox", SHANGHAI_BBOX);
  url.searchParams.set("proximity", SHANGHAI_PROXIMITY);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("types", "poi,address");

  const resp = await fetch(url.toString(), { cache: "no-store" });
  if (!resp.ok) return json({ error: "MapTiler 正向地理编码失败", status: resp.status }, 502);

  const data = (await resp.json()) as any;
  const features = Array.isArray(data?.features) ? data.features : [];
  const items = features
    .map((feature: any, index: number) => {
      const center = Array.isArray(feature?.center) ? feature.center : [];
      const lng = Number(center[0]);
      const lat = Number(center[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return {
        id: String(feature?.id || `${index}-${lat}-${lng}`),
        name: String(feature?.text || feature?.place_name || q),
        address: String(feature?.place_name || feature?.properties?.label || q),
        lat,
        lng,
      };
    })
    .filter(Boolean);

  return json({ ok: true, items });
}
