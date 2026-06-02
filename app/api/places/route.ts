import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTurnstile } from "@/lib/turnstile";
import { sha256Hex } from "@/lib/invites";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function getIp(req: NextRequest) {
  // Vercel 会带 x-forwarded-for
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return undefined;
  return xff.split(",")[0]?.trim();
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("places")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) return json({ error: error.message }, 500);
    return json({ items: data ?? [] });
  } catch (e: any) {
    // 允许在未配置 Supabase 的情况下启动前端做 UI 预览
    return json(
      {
        items: [],
        warning: "服务端未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，当前为演示模式（不读写数据库）。",
      },
      200
    );
  }
}

type UpsertBody = {
  turnstileToken: string;
  inviteCode: string;
  place: {
    id?: string;
    name: string;
    lat: number;
    lng: number;
    rating?: number | null;
    price_per_person?: number | null;
    tags?: string[];
    note?: string | null;
    links?: string | null;
    dishes?: string[];
    house?: Record<string, unknown>;
  };
};

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return json({ error: "无效的 JSON" }, 400);
  }

  if (!body?.turnstileToken) return json({ error: "缺少验证码 token" }, 400);
  if (!body?.inviteCode) return json({ error: "缺少邀请码" }, 400);

  // 校验邀请码（可撤销）
  let sb;
  try {
    sb = supabaseAdmin();
  } catch {
    return json(
      { error: "服务端未配置 Supabase（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）" },
      500
    );
  }
  const codeHash = sha256Hex(body.inviteCode.trim());
  const { data: invite, error: inviteErr } = await sb
    .from("invite_codes")
    .select("id, revoked")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (inviteErr) return json({ error: inviteErr.message }, 500);
  if (!invite || invite.revoked) return json({ error: "邀请码无效或已撤销" }, 403);

  const v = await verifyTurnstile(body.turnstileToken, ip);
  if (!v.success) return json({ error: "验证码校验失败", detail: v }, 400);

  const p = body.place;
  if (!p?.name || typeof p.lat !== "number" || typeof p.lng !== "number") {
    return json({ error: "缺少 name/lat/lng" }, 400);
  }

  const now = new Date().toISOString();

  // upsert：有 id 就更新；无 id 就新增
  const payload = {
    id: p.id,
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    rating: p.rating ?? null,
    price_per_person: p.price_per_person ?? null,
    tags: Array.isArray(p.tags) ? p.tags.filter(Boolean).slice(0, 20) : [],
    note: p.note ?? null,
    links: p.links ?? null,
    dishes: Array.isArray(p.dishes) ? p.dishes.filter(Boolean).slice(0, 20) : [],
    house: p.house && typeof p.house === "object" ? p.house : {},
    updated_at: now,
  };

  const { data, error } = await sb.from("places").upsert(payload).select("*").single();
  if (error) return json({ error: error.message }, 500);

  await sb.from("edits").insert({
    place_id: data.id,
    action: p.id ? "update" : "insert",
    payload,
    ip: ip ?? null,
  });

  return json({ ok: true, item: data });
}
