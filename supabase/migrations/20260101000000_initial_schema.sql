-- =============================================================================
-- ASANKARY — Consolidated initial schema for the NEW Supabase project
-- =============================================================================
-- Replaces the scattered schema.sql + update_schema_*.sql files with one
-- ordered, indexed, RLS-aware migration. Run it once on the brand-new project:
--
--     supabase db push                  (with this repo linked)
--   OR paste into Supabase Studio → SQL Editor and run.
--
-- DESIGN NOTES
-- 1. users.id references auth.users(id): this project uses SUPABASE AUTH.
--    During data migration, every user MUST be created in auth.users FIRST
--    (via the Admin API) so this FK holds. See Phase 5 of the migration plan.
-- 2. RLS: policies below are PERMISSIVE (anon can do everything) so the app
--    keeps working while it still authenticates via Firebase + anon key.
--    The PRODUCTION policies (real per-user/per-tenant isolation) are staged
--    at the bottom of this file, commented out. Swap them in only AFTER the
--    app authenticates through Supabase Auth (auth.uid() must be populated).
-- 3. "tenant_id" across tables points at users(id) — the admin/owner user is
--    the tenant. This matches the current app model (see TenantContext).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- fast ILIKE / fuzzy product search

-- ---------------------------------------------------------------------------
-- updated_at auto-touch trigger function
-- ---------------------------------------------------------------------------
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
-- TABLES
-- =============================================================================

-- 1. Users (extends Supabase auth.users) -------------------------------------
create table public.users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  name                   text,
  full_name              text,
  email                  text unique,
  phone                  text unique,
  profile_image_url      text,
  cover_url              text,
  address                text,
  city                   text,
  region                 text,
  date_of_birth          date,
  gender                 text,
  preferred_currency     text default 'IQD',
  language               text default 'en',
  role                   text default 'customer',
  is_admin               boolean default false,
  is_blocked             boolean default false,
  phone_verified         boolean default false,
  email_verified         boolean default false,
  auth_provider          text,
  -- push / notifications (merged from update_schema_notifications.sql)
  push_token             text,
  push_token_updated_at  timestamptz,
  fcm_token              text,
  fcm_token_updated_at   timestamptz,
  notification_settings  jsonb default '{"orderUpdates": true, "promotions": true}'::jsonb,
  -- per-user private structured data (checkout: shipping office + money-exchanger handoff)
  shipping_info          jsonb,
  money_exchanger_info   jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- 2. Parts (products) --------------------------------------------------------
create table public.parts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  name_ar            text,
  name_ku            text,
  part_number        text,
  category           text,
  category_ar        text,
  category_ku        text,
  price_usd          numeric(10,2) not null default 0,
  purchase_price     numeric(10,2),
  stock_qty          integer not null default 0,
  status             text not null default 'available',  -- 'available' | 'coming_soon' | 'on_the_way'
  description        text,
  description_ar     text,
  description_ku     text,
  is_featured        boolean default false,
  is_active          boolean default true,
  brand              text,
  image_urls         jsonb default '[]'::jsonb,
  compatible_models  jsonb default '[]'::jsonb,
  variations         jsonb default '[]'::jsonb,
  color_variations   jsonb default '[]'::jsonb,
  price_tiers        jsonb default '[]'::jsonb,
  shipping_rates     jsonb default '[]'::jsonb,
  specifications     jsonb default '{}'::jsonb,
  weight             numeric,
  video_url          text,
  tenant_id          uuid references public.users(id) on delete set null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- 3. Orders ------------------------------------------------------------------
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references public.users(id) on delete cascade,
  order_number         text unique not null,
  status               text default 'pending',
  payment_status       text default 'pending',
  subtotal_usd         numeric(10,2) not null default 0,
  shipping_usd         numeric(10,2) not null default 0,
  tax_usd              numeric(10,2) not null default 0,
  discount_usd         numeric(10,2) default 0,
  total_usd            numeric(10,2) not null default 0,
  amount_paid_usd      numeric(10,2) default 0,
  currency             text default 'IQD',
  exchange_rate        numeric,
  payment_method       jsonb,
  shipping_address     jsonb not null,
  items                jsonb not null default '[]'::jsonb,
  notes                text,
  special_instructions text,
  tracking_number      text,
  stock_status         text default 'pending',
  tenant_id            uuid references public.users(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- 4. Banners -----------------------------------------------------------------
create table public.banners (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  image_url   text not null,
  link_url    text,
  is_active   boolean default true,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

-- 5. Tenants (store profile) -------------------------------------------------
create table public.tenants (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid references public.users(id),
  store_name         text,
  store_name_ar      text,
  store_name_ku      text,
  logo_url           text,
  cover_url          text,
  cover_urls         jsonb default '[]'::jsonb,
  business_info      jsonb,
  operating_hours    jsonb,
  about              text,
  about_ar           text,
  about_ku           text,
  phone              text,
  whatsapp           text,
  tiktok             text,
  email              text,
  public_location_id text,
  location           jsonb,
  address_text       text,
  address_text_ar    text,
  address_text_ku    text,
  city               text,
  website            text,
  instagram          text,
  facebook           text,
  wechat             text,
  wechat_id          text,
  is_verified        boolean default false,
  response_time_mins integer,
  is_active          boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- 6. Categories --------------------------------------------------------------
create table public.categories (
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

-- 7. Discounts ---------------------------------------------------------------
create table public.discounts (
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

-- 8. Tenant settings (key/value) ---------------------------------------------
create table public.tenant_settings (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references public.users(id) on delete cascade,
  setting_key    text not null,
  setting_value  jsonb,
  updated_at     timestamptz default now(),
  unique(tenant_id, setting_key)
);

-- 9. Global settings ---------------------------------------------------------
create table public.global_settings (
  id          text primary key,
  data        jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 10. App config -------------------------------------------------------------
create table public.app_config (
  id          text primary key,
  data        jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 11. Conversations ----------------------------------------------------------
create table public.conversations (
  id                text primary key,
  tenant_id         uuid references public.users(id) on delete cascade,
  user_id           uuid references public.users(id) on delete cascade,
  admin_id          uuid references public.users(id) on delete cascade,
  product_id        uuid references public.parts(id) on delete set null,
  product_snapshot  jsonb,
  last_message      jsonb,
  unread            jsonb default '{"user": 0, "admin": 0}'::jsonb,
  started_by        text,
  deleted_by        jsonb default '{"user": false, "admin": false}'::jsonb,
  is_blocked        boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- 12. Messages ---------------------------------------------------------------
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  text references public.conversations(id) on delete cascade,
  sender_id        uuid references public.users(id) on delete cascade,
  sender_type      text,
  sender_name      text,
  type             text default 'text',
  text             text,
  attachment_url   text,
  file_metadata    jsonb,
  created_at       timestamptz default now()
);

-- 13. Addresses --------------------------------------------------------------
create table public.addresses (
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

-- 14. Carts (one per user) ---------------------------------------------------
create table public.carts (
  id            uuid primary key references public.users(id) on delete cascade,
  items         jsonb not null default '[]'::jsonb,
  subtotal_usd  numeric(10,2) not null default 0,
  updated_at    timestamptz default now()
);

-- 15. Notifications ----------------------------------------------------------
create table public.notifications (
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

-- 16. Devices ----------------------------------------------------------------
create table public.devices (
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

-- 17. Push tokens ------------------------------------------------------------
create table public.push_tokens (
  id          text primary key,         -- deviceId
  token       text not null,
  user_id     uuid references public.users(id) on delete cascade,
  platform    text,
  active      boolean default true,
  updated_at  timestamptz default now()
);

-- 18. Live tracking ----------------------------------------------------------
create table public.live_tracking (
  id          text primary key,         -- orderId
  tenant_id   uuid references public.users(id) on delete cascade,
  active      boolean default false,
  coords      jsonb,
  updated_at  timestamptz default now()
);

-- 19. Store locations --------------------------------------------------------
create table public.store_locations (
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
-- INDEXES  (the app currently has ZERO — this is the biggest "make it fast" win)
-- =============================================================================

-- parts: catalog browse + search
create index idx_parts_tenant         on public.parts(tenant_id);
create index idx_parts_category        on public.parts(category);
create index idx_parts_active          on public.parts(is_active) where is_active = true;
create index idx_parts_featured        on public.parts(is_featured) where is_featured = true;
create index idx_parts_part_number     on public.parts(part_number);
create index idx_parts_brand           on public.parts(brand);
create index idx_parts_created_at      on public.parts(created_at desc);
-- trigram indexes for fast ILIKE '%term%' search (SearchScreen)
create index idx_parts_name_trgm       on public.parts using gin (name gin_trgm_ops);
create index idx_parts_name_ar_trgm    on public.parts using gin (name_ar gin_trgm_ops);
create index idx_parts_name_ku_trgm    on public.parts using gin (name_ku gin_trgm_ops);
create index idx_parts_partno_trgm     on public.parts using gin (part_number gin_trgm_ops);

-- orders
create index idx_orders_user           on public.orders(user_id);
create index idx_orders_tenant         on public.orders(tenant_id);
create index idx_orders_status         on public.orders(status);
create index idx_orders_payment_status on public.orders(payment_status);
create index idx_orders_created_at     on public.orders(created_at desc);
create index idx_orders_tenant_created on public.orders(tenant_id, created_at desc);

-- categories / discounts
create index idx_categories_tenant     on public.categories(tenant_id);
create index idx_categories_active     on public.categories(tenant_id, is_active);
create index idx_discounts_tenant      on public.discounts(tenant_id);
create index idx_discounts_code        on public.discounts(code);
create index idx_discounts_active      on public.discounts(tenant_id, is_active);

-- chat
create index idx_conversations_tenant  on public.conversations(tenant_id);
create index idx_conversations_user     on public.conversations(user_id);
create index idx_conversations_admin    on public.conversations(admin_id);
create index idx_conversations_updated  on public.conversations(updated_at desc);
create index idx_messages_conversation  on public.messages(conversation_id, created_at);

-- addresses / notifications
create index idx_addresses_user        on public.addresses(user_id);
create index idx_notifications_user    on public.notifications(user_id, created_at desc);
create index idx_notifications_unread  on public.notifications(user_id, read) where read = false;

-- devices / push / tracking / locations
create index idx_devices_uid           on public.devices(uid);
create index idx_devices_active        on public.devices(is_active) where is_active = true;
create index idx_push_tokens_user      on public.push_tokens(user_id);
create index idx_push_tokens_active    on public.push_tokens(active) where active = true;
create index idx_live_tracking_tenant  on public.live_tracking(tenant_id);
create index idx_store_locations_admin on public.store_locations(created_by_admin_id);
create index idx_store_locations_city  on public.store_locations(city);

-- banners / tenants / users
create index idx_banners_active        on public.banners(is_active, sort_order);
create index idx_tenants_owner         on public.tenants(owner_id);
create index idx_users_role            on public.users(role);
create index idx_users_is_admin        on public.users(is_admin) where is_admin = true;

-- =============================================================================
-- updated_at TRIGGERS
-- =============================================================================
create trigger trg_users_updated         before update on public.users           for each row execute function public.set_updated_at();
create trigger trg_parts_updated          before update on public.parts            for each row execute function public.set_updated_at();
create trigger trg_orders_updated         before update on public.orders           for each row execute function public.set_updated_at();
create trigger trg_tenants_updated        before update on public.tenants          for each row execute function public.set_updated_at();
create trigger trg_categories_updated     before update on public.categories       for each row execute function public.set_updated_at();
create trigger trg_discounts_updated      before update on public.discounts        for each row execute function public.set_updated_at();
create trigger trg_tenant_settings_updated before update on public.tenant_settings for each row execute function public.set_updated_at();
create trigger trg_global_settings_updated before update on public.global_settings for each row execute function public.set_updated_at();
create trigger trg_app_config_updated     before update on public.app_config       for each row execute function public.set_updated_at();
create trigger trg_conversations_updated  before update on public.conversations    for each row execute function public.set_updated_at();
create trigger trg_addresses_updated      before update on public.addresses        for each row execute function public.set_updated_at();
create trigger trg_carts_updated          before update on public.carts            for each row execute function public.set_updated_at();
create trigger trg_notifications_updated  before update on public.notifications    for each row execute function public.set_updated_at();
create trigger trg_devices_updated        before update on public.devices          for each row execute function public.set_updated_at();
create trigger trg_push_tokens_updated    before update on public.push_tokens      for each row execute function public.set_updated_at();
create trigger trg_live_tracking_updated  before update on public.live_tracking    for each row execute function public.set_updated_at();
create trigger trg_store_locations_updated before update on public.store_locations for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — PHASE 1 (PERMISSIVE).  Keeps the app working while it still auths via
-- Firebase + anon key. DO NOT ship to real production hardening like this.
-- =============================================================================
alter table public.users           enable row level security;
alter table public.parts            enable row level security;
alter table public.orders           enable row level security;
alter table public.banners          enable row level security;
alter table public.tenants          enable row level security;
alter table public.categories       enable row level security;
alter table public.discounts        enable row level security;
alter table public.tenant_settings  enable row level security;
alter table public.global_settings  enable row level security;
alter table public.app_config       enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.addresses        enable row level security;
alter table public.carts            enable row level security;
alter table public.notifications    enable row level security;
alter table public.devices          enable row level security;
alter table public.push_tokens      enable row level security;
alter table public.live_tracking    enable row level security;
alter table public.store_locations  enable row level security;

create policy "permissive_all" on public.users          for all using (true) with check (true);
create policy "permissive_all" on public.parts           for all using (true) with check (true);
create policy "permissive_all" on public.orders          for all using (true) with check (true);
create policy "permissive_all" on public.banners         for all using (true) with check (true);
create policy "permissive_all" on public.tenants         for all using (true) with check (true);
create policy "permissive_all" on public.categories      for all using (true) with check (true);
create policy "permissive_all" on public.discounts       for all using (true) with check (true);
create policy "permissive_all" on public.tenant_settings for all using (true) with check (true);
create policy "permissive_all" on public.global_settings for all using (true) with check (true);
create policy "permissive_all" on public.app_config      for all using (true) with check (true);
create policy "permissive_all" on public.conversations   for all using (true) with check (true);
create policy "permissive_all" on public.messages        for all using (true) with check (true);
create policy "permissive_all" on public.addresses       for all using (true) with check (true);
create policy "permissive_all" on public.carts           for all using (true) with check (true);
create policy "permissive_all" on public.notifications   for all using (true) with check (true);
create policy "permissive_all" on public.devices         for all using (true) with check (true);
create policy "permissive_all" on public.push_tokens     for all using (true) with check (true);
create policy "permissive_all" on public.live_tracking   for all using (true) with check (true);
create policy "permissive_all" on public.store_locations for all using (true) with check (true);

-- =============================================================================
-- RLS — PHASE 5 (PRODUCTION).  Apply ONLY after the app authenticates through
-- Supabase Auth so auth.uid() is populated. To activate: drop the permissive_all
-- policies above and uncomment the block below (in a later migration file).
-- =============================================================================
/*
-- helper: is the current user an admin?
create or replace function public.is_admin() returns boolean
  language sql stable as $$
    select coalesce((select is_admin from public.users where id = auth.uid()), false);
  $$;

-- PARTS: anyone can read active products; only the owning tenant can write.
drop policy "permissive_all" on public.parts;
create policy "parts_read"  on public.parts for select using (is_active or tenant_id = auth.uid());
create policy "parts_write" on public.parts for all
  using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

-- ORDERS: a user sees their own; the tenant sees orders placed to them.
drop policy "permissive_all" on public.orders;
create policy "orders_read"   on public.orders for select using (user_id = auth.uid() or tenant_id = auth.uid());
create policy "orders_insert" on public.orders for insert with check (user_id = auth.uid());
create policy "orders_update" on public.orders for update using (tenant_id = auth.uid() or user_id = auth.uid());

-- USERS: read/update your own row only.
drop policy "permissive_all" on public.users;
create policy "users_self" on public.users for all using (id = auth.uid()) with check (id = auth.uid());

-- CARTS / ADDRESSES / NOTIFICATIONS: strictly per-user.
drop policy "permissive_all" on public.carts;
create policy "carts_self" on public.carts for all using (id = auth.uid()) with check (id = auth.uid());
drop policy "permissive_all" on public.addresses;
create policy "addresses_self" on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy "permissive_all" on public.notifications;
create policy "notifications_self" on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- CONVERSATIONS / MESSAGES: only participants.
drop policy "permissive_all" on public.conversations;
create policy "conv_participants" on public.conversations for all
  using (user_id = auth.uid() or admin_id = auth.uid() or tenant_id = auth.uid());
drop policy "permissive_all" on public.messages;
create policy "msg_participants" on public.messages for all
  using (exists (select 1 from public.conversations c where c.id = conversation_id
                 and (c.user_id = auth.uid() or c.admin_id = auth.uid() or c.tenant_id = auth.uid())));

-- BANNERS / STORE_LOCATIONS / GLOBAL_SETTINGS / APP_CONFIG: public read, admin write.
-- CATEGORIES / DISCOUNTS / TENANT_SETTINGS / TENANTS: public read, owning tenant write.
-- (mirror the parts_read / parts_write shape per table)
*/
