-- =============================================================================
-- ASANKARY — LIVE-PROJECT parity patch  (project: pocdgbrpkuaqxgjcwsqk)
-- =============================================================================
-- Purpose: bring the CURRENTLY-LIVE Supabase project up to schema parity with
-- the consolidated schema by adding ONLY the 12 tables it is missing, so the
-- remaining Firestore-backed screens can be migrated onto Supabase.
--
-- This is NOT the new-project migration. It deliberately lives OUTSIDE
-- supabase/migrations/ so `supabase db push` never applies it to the new project.
--
-- SAFE TO RUN ON PRODUCTION:
--   * Only the 12 missing tables are touched. The 7 existing tables
--     (users, parts, orders, tenants, banners, conversations, messages) and all
--     their data are NOT modified.
--   * Every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE /
--     DROP ... IF EXISTS), so it can be re-run with no harm.
--
-- HOW TO RUN: New project? NO — the LIVE project's SQL Editor:
--   Supabase dashboard → project pocdgbrpkuaqxgjcwsqk → SQL Editor → New query
--   → paste this whole file → Run.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- updated_at auto-touch trigger function (idempotent) -------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- MISSING TABLES (12)
-- =============================================================================

-- categories -----------------------------------------------------------------
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references public.users(id) on delete cascade,
  name           text not null,
  name_ar        text,
  name_ku        text,
  description    text,
  image_url      text,
  product_count  integer default 0,
  is_active      boolean default true,
  sort_order     integer default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- discounts -------------------------------------------------------------------
create table if not exists public.discounts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references public.users(id) on delete cascade,
  code             text,
  name             text,
  name_ar          text,
  name_ku          text,
  description      text,
  description_ar   text,
  description_ku   text,
  amount           numeric(10,2),
  value            numeric(10,2),
  type             text,
  bundle_quantity  integer,
  bundle_price     numeric(10,2),
  min_purchase     numeric(10,2),
  min_quantity     integer,
  max_discount     numeric(10,2),
  product_ids      jsonb default '[]'::jsonb,
  start_date       timestamptz,
  end_date         timestamptz,
  usage_limit      integer,
  usage_count      integer default 0,
  is_active        boolean default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- tenant_settings -------------------------------------------------------------
create table if not exists public.tenant_settings (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references public.users(id) on delete cascade,
  setting_key    text not null,
  setting_value  jsonb,
  updated_at     timestamptz default now(),
  unique(tenant_id, setting_key)
);

-- global_settings -------------------------------------------------------------
create table if not exists public.global_settings (
  id          text primary key,
  data        jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- app_config ------------------------------------------------------------------
create table if not exists public.app_config (
  id          text primary key,
  data        jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- addresses -------------------------------------------------------------------
create table if not exists public.addresses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.users(id) on delete cascade,
  title               text,
  full_name           text,
  phone               text,
  address             text,
  country_code        text,
  city_code           text,
  city                text,
  region              text,
  landmark            text,
  coordinates         jsonb,
  formatted_address   text,
  address_components  jsonb,
  is_default          boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- carts (one per user) --------------------------------------------------------
create table if not exists public.carts (
  id            uuid primary key references public.users(id) on delete cascade,
  items         jsonb not null default '[]'::jsonb,
  subtotal_usd  numeric(10,2) not null default 0,
  updated_at    timestamptz default now()
);

-- notifications ---------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  type        text,
  read        boolean default false,
  read_at     timestamptz,
  data        jsonb default '{}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- devices ---------------------------------------------------------------------
create table if not exists public.devices (
  id                     text primary key,
  uid                    uuid references public.users(id) on delete cascade,
  tenant_id              text,
  fcm_token              text,
  platform               text,
  app_version            text,
  is_active              boolean default true,
  notifications_enabled  boolean default true,
  channel_version        integer default 1,
  last_seen_at           timestamptz default now(),
  updated_at             timestamptz default now()
);

-- push_tokens -----------------------------------------------------------------
create table if not exists public.push_tokens (
  id          text primary key,
  token       text not null,
  user_id     uuid references public.users(id) on delete cascade,
  platform    text,
  active      boolean default true,
  updated_at  timestamptz default now()
);

-- live_tracking ---------------------------------------------------------------
create table if not exists public.live_tracking (
  id          text primary key,
  tenant_id   uuid references public.users(id) on delete cascade,
  active      boolean default false,
  coords      jsonb,
  updated_at  timestamptz default now()
);

-- store_locations -------------------------------------------------------------
create table if not exists public.store_locations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  name_ar               text,
  name_ku               text,
  address               text not null,
  address_ar            text,
  address_ku            text,
  phone                 text not null,
  email                 text,
  city                  text not null,
  latitude              numeric(10,8),
  longitude             numeric(11,8),
  type                  text not null,
  is_active             boolean default true,
  working_hours         jsonb,
  created_by_admin_id   uuid references public.users(id) on delete cascade,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- =============================================================================
-- INDEXES (for the 12 new tables only)
-- =============================================================================
create index if not exists idx_categories_tenant     on public.categories(tenant_id);
create index if not exists idx_categories_active      on public.categories(tenant_id, is_active);
create index if not exists idx_discounts_tenant       on public.discounts(tenant_id);
create index if not exists idx_discounts_code         on public.discounts(code);
create index if not exists idx_discounts_active       on public.discounts(tenant_id, is_active);
create index if not exists idx_addresses_user         on public.addresses(user_id);
create index if not exists idx_notifications_user     on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread   on public.notifications(user_id, read) where read = false;
create index if not exists idx_devices_uid            on public.devices(uid);
create index if not exists idx_devices_active         on public.devices(is_active) where is_active = true;
create index if not exists idx_push_tokens_user       on public.push_tokens(user_id);
create index if not exists idx_push_tokens_active      on public.push_tokens(active) where active = true;
create index if not exists idx_live_tracking_tenant   on public.live_tracking(tenant_id);
create index if not exists idx_store_locations_admin  on public.store_locations(created_by_admin_id);
create index if not exists idx_store_locations_city   on public.store_locations(city);

-- =============================================================================
-- updated_at TRIGGERS (CREATE OR REPLACE is idempotent; PG14+)
-- =============================================================================
create or replace trigger trg_categories_updated      before update on public.categories      for each row execute function public.set_updated_at();
create or replace trigger trg_discounts_updated        before update on public.discounts        for each row execute function public.set_updated_at();
create or replace trigger trg_tenant_settings_updated  before update on public.tenant_settings  for each row execute function public.set_updated_at();
create or replace trigger trg_global_settings_updated  before update on public.global_settings  for each row execute function public.set_updated_at();
create or replace trigger trg_app_config_updated       before update on public.app_config       for each row execute function public.set_updated_at();
create or replace trigger trg_addresses_updated        before update on public.addresses        for each row execute function public.set_updated_at();
create or replace trigger trg_carts_updated            before update on public.carts            for each row execute function public.set_updated_at();
create or replace trigger trg_notifications_updated    before update on public.notifications    for each row execute function public.set_updated_at();
create or replace trigger trg_devices_updated          before update on public.devices          for each row execute function public.set_updated_at();
create or replace trigger trg_push_tokens_updated      before update on public.push_tokens      for each row execute function public.set_updated_at();
create or replace trigger trg_live_tracking_updated    before update on public.live_tracking    for each row execute function public.set_updated_at();
create or replace trigger trg_store_locations_updated  before update on public.store_locations  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — PERMISSIVE (matches the rest of the live project until Supabase Auth lands)
-- =============================================================================
alter table public.categories       enable row level security;
alter table public.discounts         enable row level security;
alter table public.tenant_settings   enable row level security;
alter table public.global_settings   enable row level security;
alter table public.app_config        enable row level security;
alter table public.addresses         enable row level security;
alter table public.carts             enable row level security;
alter table public.notifications     enable row level security;
alter table public.devices           enable row level security;
alter table public.push_tokens       enable row level security;
alter table public.live_tracking     enable row level security;
alter table public.store_locations   enable row level security;

drop policy if exists "permissive_all" on public.categories;
create policy "permissive_all" on public.categories      for all using (true) with check (true);
drop policy if exists "permissive_all" on public.discounts;
create policy "permissive_all" on public.discounts       for all using (true) with check (true);
drop policy if exists "permissive_all" on public.tenant_settings;
create policy "permissive_all" on public.tenant_settings for all using (true) with check (true);
drop policy if exists "permissive_all" on public.global_settings;
create policy "permissive_all" on public.global_settings for all using (true) with check (true);
drop policy if exists "permissive_all" on public.app_config;
create policy "permissive_all" on public.app_config      for all using (true) with check (true);
drop policy if exists "permissive_all" on public.addresses;
create policy "permissive_all" on public.addresses       for all using (true) with check (true);
drop policy if exists "permissive_all" on public.carts;
create policy "permissive_all" on public.carts           for all using (true) with check (true);
drop policy if exists "permissive_all" on public.notifications;
create policy "permissive_all" on public.notifications   for all using (true) with check (true);
drop policy if exists "permissive_all" on public.devices;
create policy "permissive_all" on public.devices         for all using (true) with check (true);
drop policy if exists "permissive_all" on public.push_tokens;
create policy "permissive_all" on public.push_tokens     for all using (true) with check (true);
drop policy if exists "permissive_all" on public.live_tracking;
create policy "permissive_all" on public.live_tracking   for all using (true) with check (true);
drop policy if exists "permissive_all" on public.store_locations;
create policy "permissive_all" on public.store_locations for all using (true) with check (true);

-- =============================================================================
-- DONE. Verify with:  select count(*) from public.categories;  (etc.)
-- =============================================================================
