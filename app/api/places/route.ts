import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTurnstile } from "@/lib/turnstile";
import { sha256Hex } from "@/lib/invites";

export const runtime = "nodejs";

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...(extraHeaders ?? {}) },
  });
}

function parseBool(v: string | undefined, fallback = false) {
  if (v == null) return fallback;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

function normalizeUuid(v: string | null) {
  const value = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function getClientIp(req: NextRequest) {
  // 常见代理链路（Vercel / Cloudflare / Nginx）
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return undefined;
  return xff.split(",")[0]?.trim();
}

const UPSERT_WINDOW_SEC = Number(process.env.PLACES_UPSERT_RATE_LIMIT_WINDOW_SEC ?? "600") || 600;
const UPSERT_MAX = Number(process.env.PLACES_UPSERT_RATE_LIMIT_MAX ?? "30") || 30;
const IP_BLACKLIST = new Set(
  String(process.env.PLACES_IP_BLACKLIST ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);
const NEW_REQUIRES_REVIEW = parseBool(process.env.PLACES_NEW_REQUIRES_REVIEW, false);

type Bucket = { count: number; resetAtMs: number };
const buckets: Map<string, Bucket> = new Map();

function checkRateLimit(ip?: string) {
  const key = ip || "unknown";
  const now = Date.now();
  const windowMs = UPSERT_WINDOW_SEC * 1000;
  const b = buckets.get(key);
  if (!b || now >= b.resetAtMs) {
    const nb = { count: 1, resetAtMs: now + windowMs };
    buckets.set(key, nb);
    return { ok: true as const, remaining: UPSERT_MAX - 1 };
  }

  b.count += 1;
  // 轻度清理：避免长时间运行时无限增长（简单实现即可）
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAtMs) buckets.delete(k);
    }
  }

  if (b.count > UPSERT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAtMs - now) / 1000));
    return { ok: false as const, retryAfterSec };
  }
  return { ok: true as const, remaining: Math.max(0, UPSERT_MAX - b.count) };
}

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const includeId = normalizeUuid(req.nextUrl.searchParams.get("includeId"));
    let q = sb.from("places").select("*");
    // “新增需审核”模式下默认只展示已审核的点位
    if (NEW_REQUIRES_REVIEW) {
      q = includeId ? q.or(`approved.eq.true,id.eq.${includeId}`) : q.eq("approved", true);
    }
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);

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
    address?: string | null;
    rating?: number | null;
    price_per_person?: number | null;
    tags?: string[];
    note?: string | null;
    links?: string | null;
    photo_urls?: string[];
    dishes?: string[];
    house?: Record<string, unknown>;
  };
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (ip && IP_BLACKLIST.has(ip)) return json({ error: "请求被拒绝（IP 黑名单）" }, 403);

  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return json(
      { error: "请求过于频繁，请稍后再试", retry_after_sec: rl.retryAfterSec },
      429,
      { "Retry-After": String(rl.retryAfterSec) }
    );
  }

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
    return json({ error: "服务端未配置 Supabase（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）" }, 500);
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
  const payload: Record<string, any> = {
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    address: p.address ?? null,
    rating: p.rating ?? null,
    price_per_person: p.price_per_person ?? null,
    tags: Array.isArray(p.tags) ? p.tags.filter(Boolean).slice(0, 20) : [],
    note: p.note ?? null,
    links: p.links ?? null,
    dishes: Array.isArray(p.dishes) ? p.dishes.filter(Boolean).slice(0, 20) : [],
    house: p.house && typeof p.house === "object" ? p.house : {},
    updated_at: now,
  };
  if (p.id) payload.id = p.id;
  // 不传 photo_urls 时不要覆盖数据库已有值（避免普通编辑把图片清空）
  if (Array.isArray(p.photo_urls)) {
    payload.photo_urls = p.photo_urls.filter(Boolean).slice(0, 20);
  }
  // “新增需审核”：仅对 insert 生效；approved 列需要在数据库中存在（见 supabase/schema.sql）
  if (!p.id && NEW_REQUIRES_REVIEW) {
    payload.approved = false;
  }

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
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTurnstile } from "@/lib/turnstile";
import { sha256Hex } from "@/lib/invites";

export const runtime = "nodejs";

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...(extraHeaders ?? {}) },
  });
}

function parseBool(v: string | undefined, fallback = false) {
  if (v == null) return fallback;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

function normalizeUuid(v: string | null) {
  const value = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function getClientIp(req: NextRequest) {
  // 常见代理链路（Vercel / Cloudflare / Nginx）
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return undefined;
  return xff.split(",")[0]?.trim();
}

const UPSERT_WINDOW_SEC = Number(process.env.PLACES_UPSERT_RATE_LIMIT_WINDOW_SEC ?? "600") || 600;
const UPSERT_MAX = Number(process.env.PLACES_UPSERT_RATE_LIMIT_MAX ?? "30") || 30;
const IP_BLACKLIST = new Set(
  String(process.env.PLACES_IP_BLACKLIST ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);
const NEW_REQUIRES_REVIEW = parseBool(process.env.PLACES_NEW_REQUIRES_REVIEW, false);

type Bucket = { count: number; resetAtMs: number };
const buckets: Map<string, Bucket> = new Map();

function checkRateLimit(ip?: string) {
  const key = ip || "unknown";
  const now = Date.now();
  const windowMs = UPSERT_WINDOW_SEC * 1000;
  const b = buckets.get(key);
  if (!b || now >= b.resetAtMs) {
    const nb = { count: 1, resetAtMs: now + windowMs };
    buckets.set(key, nb);
    return { ok: true as const, remaining: UPSERT_MAX - 1 };
  }

  b.count += 1;
  // 轻度清理：避免长时间运行时无限增长（简单实现即可）
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAtMs) buckets.delete(k);
    }
  }

  if (b.count > UPSERT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAtMs - now) / 1000));
    return { ok: false as const, retryAfterSec };
  }
  return { ok: true as const, remaining: Math.max(0, UPSERT_MAX - b.count) };
}

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const includeId = normalizeUuid(req.nextUrl.searchParams.get("includeId"));
    let q = sb.from("places").select("*");
    // “新增需审核”模式下默认只展示已审核的点位
    if (NEW_REQUIRES_REVIEW) {
      q = includeId ? q.or(`approved.eq.true,id.eq.${includeId}`) : q.eq("approved", true);
    }
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);

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
    address?: string | null;
    rating?: number | null;
    price_per_person?: number | null;
    tags?: string[];
    note?: string | null;
    links?: string | null;
    photo_urls?: string[];
    dishes?: string[];
    house?: Record<string, unknown>;
  };
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (ip && IP_BLACKLIST.has(ip)) return json({ error: "请求被拒绝（IP 黑名单）" }, 403);

  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return json(
      { error: "请求过于频繁，请稍后再试", retry_after_sec: rl.retryAfterSec },
      429,
      { "Retry-After": String(rl.retryAfterSec) }
    );
  }

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
    return json({ error: "服务端未配置 Supabase（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）" }, 500);
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
  const payload: Record<string, any> = {
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    address: p.address ?? null,
    rating: p.rating ?? null,
    price_per_person: p.price_per_person ?? null,
    tags: Array.isArray(p.tags) ? p.tags.filter(Boolean).slice(0, 20) : [],
    note: p.note ?? null,
    links: p.links ?? null,
    dishes: Array.isArray(p.dishes) ? p.dishes.filter(Boolean).slice(0, 20) : [],
    house: p.house && typeof p.house === "object" ? p.house : {},
    updated_at: now,
  };
  if (p.id) payload.id = p.id;
  // 不传 photo_urls 时不要覆盖数据库已有值（避免普通编辑把图片清空）
  if (Array.isArray(p.photo_urls)) {
    payload.photo_urls = p.photo_urls.filter(Boolean).slice(0, 20);
  }
  // “新增需审核”：仅对 insert 生效；approved 列需要在数据库中存在（见 supabase/schema.sql）
  if (!p.id && NEW_REQUIRES_REVIEW) {
    payload.approved = false;
  }

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
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTurnstile } from "@/lib/turnstile";
import { sha256Hex } from "@/lib/invites";

export const runtime = "nodejs";

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...(extraHeaders ?? {}) },
  });
}

function parseBool(v: string | undefined, fallback = false) {
  if (v == null) return fallback;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

function normalizeUuid(v: string | null) {
  const value = String(v || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function getClientIp(req: NextRequest) {
  // 常见代理链路（Vercel / Cloudflare / Nginx）
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return undefined;
  return xff.split(",")[0]?.trim();
}

const UPSERT_WINDOW_SEC = Number(process.env.PLACES_UPSERT_RATE_LIMIT_WINDOW_SEC ?? "600") || 600;
const UPSERT_MAX = Number(process.env.PLACES_UPSERT_RATE_LIMIT_MAX ?? "30") || 30;
const IP_BLACKLIST = new Set(
  String(process.env.PLACES_IP_BLACKLIST ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);
const NEW_REQUIRES_REVIEW = parseBool(process.env.PLACES_NEW_REQUIRES_REVIEW, false);

type Bucket = { count: number; resetAtMs: number };
const buckets: Map<string, Bucket> = new Map();

function checkRateLimit(ip?: string) {
  const key = ip || "unknown";
  const now = Date.now();
  const windowMs = UPSERT_WINDOW_SEC * 1000;
  const b = buckets.get(key);
  if (!b || now >= b.resetAtMs) {
    const nb = { count: 1, resetAtMs: now + windowMs };
    buckets.set(key, nb);
    return { ok: true as const, remaining: UPSERT_MAX - 1 };
  }

  b.count += 1;
  // 轻度清理：避免长时间运行时无限增长（简单实现即可）
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAtMs) buckets.delete(k);
    }
  }

  if (b.count > UPSERT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAtMs - now) / 1000));
    return { ok: false as const, retryAfterSec };
  }
  return { ok: true as const, remaining: Math.max(0, UPSERT_MAX - b.count) };
}

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const includeId = normalizeUuid(req.nextUrl.searchParams.get("includeId"));
    let q = sb.from("places").select("*");
    // “新增需审核”模式下默认只展示已审核的点位
    if (NEW_REQUIRES_REVIEW) {
      q = includeId ? q.or(`approved.eq.true,id.eq.${includeId}`) : q.eq("approved", true);
    }
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);

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
    address?: string | null;
    rating?: number | null;
    price_per_person?: number | null;
    tags?: string[];
    note?: string | null;
    links?: string | null;
    photo_urls?: string[];
    dishes?: string[];
    house?: Record<string, unknown>;
  };
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (ip && IP_BLACKLIST.has(ip)) return json({ error: "请求被拒绝（IP 黑名单）" }, 403);

  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return json(
      { error: "请求过于频繁，请稍后再试", retry_after_sec: rl.retryAfterSec },
      429,
      { "Retry-After": String(rl.retryAfterSec) }
    );
  }

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
  const payload: Record<string, any> = {
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    address: p.address ?? null,
    rating: p.rating ?? null,
    price_per_person: p.price_per_person ?? null,
    tags: Array.isArray(p.tags) ? p.tags.filter(Boolean).slice(0, 20) : [],
    note: p.note ?? null,
    links: p.links ?? null,
    dishes: Array.isArray(p.dishes) ? p.dishes.filter(Boolean).slice(0, 20) : [],
    house: p.house && typeof p.house === "object" ? p.house : {},
    updated_at: now,
  };
  if (p.id) payload.id = p.id;
  // 不传 photo_urls 时不要覆盖数据库已有值（避免普通编辑把图片清空）
  if (Array.isArray(p.photo_urls)) {
    payload.photo_urls = p.photo_urls.filter(Boolean).slice(0, 20);
  }
  // “新增需审核”：仅对 insert 生效；approved 列需要在数据库中存在（见 supabase/schema.sql）
  if (!p.id && NEW_REQUIRES_REVIEW) {
    payload.approved = false;
  }

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
