-- Asankary — new tables + columns for features built after the initial schema:
--   • parts: vip_price_usd, compare_at_price_usd, storage_options (colour/storage variants + VIP pricing)
--   • brands table (admin-managed "Our Brands" name + logo)
--   • promo_codes table (admin discount codes applied at checkout)
-- Mirrors the initial schema's conventions (jsonb blobs, tenant_id -> users.id,
-- set_updated_at trigger, permissive_all RLS enforced at the app/edge layer).

-- ── parts: variant + pricing columns ───────────────────────────────────────
alter table public.parts add column if not exists vip_price_usd        numeric(10,2);
alter table public.parts add column if not exists compare_at_price_usd numeric(10,2);
alter table public.parts add column if not exists storage_options      jsonb default '[]'::jsonb;

-- ── parts: columns the app reads/writes that the initial schema omitted ──────
-- (mapProduct + LIST_COLUMNS + PART_COLUMN_MAP reference these; without them a
-- live product SELECT/UPDATE fails with "column ... does not exist".)
alter table public.parts add column if not exists shipping_cost        numeric(10,2);
alter table public.parts add column if not exists historical_stock_qty integer;
alter table public.parts add column if not exists initial_stock        integer;
alter table public.parts add column if not exists sort_order           integer default 0;

-- ── brands ─────────────────────────────────────────────────────────────────
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.users(id) on delete cascade,
  name        text not null,
  logo_url    text,
  is_active   boolean default true,
  sort_order  integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_brands_tenant on public.brands(tenant_id);
create index if not exists idx_brands_active on public.brands(tenant_id, is_active);

-- ── promo_codes ────────────────────────────────────────────────────────────
create table if not exists public.promo_codes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.users(id) on delete cascade,
  code         text not null,                          -- stored UPPERCASE
  type         text not null default 'percentage',     -- 'percentage' | 'fixed'
  value        numeric(10,2) not null default 0,        -- percent (10 = 10%) or fixed USD
  min_purchase numeric(10,2),                           -- optional minimum subtotal (USD)
  is_active    boolean default true,
  sort_order   integer default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_promo_codes_tenant on public.promo_codes(tenant_id);
create unique index if not exists uniq_promo_code_per_tenant on public.promo_codes(tenant_id, upper(code));

-- ── updated_at triggers (reuse the existing set_updated_at function) ─────────
drop trigger if exists trg_brands_updated on public.brands;
create trigger trg_brands_updated       before update on public.brands      for each row execute function public.set_updated_at();
drop trigger if exists trg_promo_codes_updated on public.promo_codes;
create trigger trg_promo_codes_updated  before update on public.promo_codes for each row execute function public.set_updated_at();

-- ── RLS (permissive_all, matching the rest of the schema) ────────────────────
alter table public.brands      enable row level security;
alter table public.promo_codes enable row level security;
drop policy if exists "permissive_all" on public.brands;
create policy "permissive_all" on public.brands      for all using (true) with check (true);
drop policy if exists "permissive_all" on public.promo_codes;
create policy "permissive_all" on public.promo_codes for all using (true) with check (true);
