-- 在 Supabase SQL Editor 运行此文件

-- 需要 pgcrypto 用于 gen_random_uuid()
create extension if not exists "pgcrypto";

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  rating numeric null,
  price_per_person integer null,
  tags text[] not null default '{}'::text[],
  note text null,
  links text null,
  photo_urls text[] not null default '{}'::text[],
  -- 推荐菜（卡通卡片展示用）
  dishes text[] not null default '{}'::text[],
  -- 房子样式（2.5D/乐高风参数化配置）
  house jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists places_geo_idx on public.places (lat, lng);
create index if not exists places_updated_idx on public.places (updated_at desc);

create table if not exists public.edits (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  action text not null,
  payload jsonb not null,
  ip text null,
  created_at timestamptz not null default now()
);

-- 邀请码：可撤销
-- 注意：不存明文 code，只存 sha256 哈希；由服务端对用户输入的邀请码做 sha256 后匹配。
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

-- 建议开启 RLS：读开放；写仅通过服务端（service role）执行
alter table public.places enable row level security;
alter table public.edits enable row level security;
alter table public.invite_codes enable row level security;

-- 任何人可读（匿名/公开）
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='places' and policyname='public_read_places'
  ) then
    create policy public_read_places on public.places for select using (true);
  end if;
end $$;

-- edits 不对外开放（可按需加只读策略）

-- invite_codes 不对外开放
