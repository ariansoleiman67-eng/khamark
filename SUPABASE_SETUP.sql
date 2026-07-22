-- ============================================================================
-- ASANKARY — FULL SUPABASE SETUP (paste ALL of this into the SQL Editor, Run)
-- Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Generated 2026-07-22 from supabase/migrations/*
-- ============================================================================


-- ============================================================
-- 20260101000000_initial_schema.sql
-- ============================================================
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


-- ============================================================
-- 20260704000000_get_partner_product_sales.sql
-- ============================================================
-- ============================================================================
-- get_partner_product_sales(p_partner_uid uuid default null)
-- ----------------------------------------------------------------------------
-- Units sold per product for a partner, computed server-side from DELIVERED
-- orders. Used by BOTH sides of the partner dashboard so they always agree:
--   • the partner viewing their OWN dashboard (a partner login cannot read the
--     owner's `orders` via RLS, which otherwise makes Earned show $0 and Total
--     Invested / Wholesale exclude already-sold units), and
--   • the owner viewing that partner (passes p_partner_uid).
--
-- SECURITY: SECURITY DEFINER bypasses RLS, but results are strictly scoped:
--   • only products SHARED with the target partner (extra_data.coAdminIds), and
--   • only orders of that product's OWNER tenant (o.tenant_id = p.tenant_id), and
--   • the caller must be EITHER that partner themselves OR the owner of the
--     product (parts.tenant_id = the owner's user id = auth.uid()).
-- A partner passing another partner's uid gets nothing. No order rows are
-- exposed — only aggregate units-sold for products the caller already controls.
--
-- Tracked as a migration so it survives a DB rebuild. It was originally applied
-- by hand via the Supabase SQL editor; `create or replace` makes re-running it
-- idempotent, so applying this migration on top of an already-patched DB is a
-- no-op. Consumed by AdminPartnerDashboardScreen via
-- TenantAdminService.getPartnerProductSales.
-- ============================================================================

create or replace function public.get_partner_product_sales(p_partner_uid uuid default null)
returns table(product_id text, units_sold numeric)
language sql
security definer
set search_path = public
as $$
  select
    item->>'productId'                                  as product_id,
    sum(coalesce((item->>'quantity')::numeric, 0))      as units_sold
  from public.orders o
  cross join lateral jsonb_array_elements(coalesce(o.items::jsonb, '[]'::jsonb)) as item
  where lower(coalesce(o.status, '')) = 'delivered'
    and item->>'productId' is not null
    and exists (
      select 1
      from public.parts p
      where p.id::text = item->>'productId'
        and o.tenant_id = p.tenant_id                                            -- same owner tenant as the owner-view
        and p.extra_data -> 'coAdminIds' ? coalesce(p_partner_uid, auth.uid())::text  -- shared with the target partner
        and (
          auth.uid() = coalesce(p_partner_uid, auth.uid())                       -- the partner viewing their own
          or auth.uid() = p.tenant_id                                            -- OR the owner of the product
        )
    )
  group by item->>'productId';
$$;

grant execute on function public.get_partner_product_sales(uuid) to authenticated;


-- ============================================================
-- 20260705175738_create_saved_cards_table.sql
-- ============================================================
create extension if not exists moddatetime schema extensions;

create table if not exists public.saved_cards (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    payment_token text not null unique,
    card_mask text not null,
    payment_system text default 'Unknown',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.saved_cards enable row level security;

create policy "Users can view their own saved cards"
    on public.saved_cards for select
    using (auth.uid() = user_id);

create policy "Users can delete their own saved cards"
    on public.saved_cards for delete
    using (auth.uid() = user_id);

create trigger handle_updated_at before update on public.saved_cards 
  for each row execute procedure extensions.moddatetime (updated_at);


-- ============================================================
-- 20260706120000_qicard_extra_data_and_merge_rpc.sql
-- ============================================================
-- =============================================================================
-- QiCard: orders.extra_data column + jsonb_merge_extra_data RPC
-- =============================================================================
-- The QiCard edge functions (and OrderService) read/write orders.extra_data,
-- and create-qicard-payment merges its payment reference via the
-- jsonb_merge_extra_data(p_order_id, p_data) RPC. Neither was present in the
-- tracked schema (they only existed in an untracked backfill script), so on a
-- fresh Supabase project those writes would fail. This migration adds both,
-- idempotently.
-- =============================================================================

-- 1. Ensure the jsonb column exists on orders.
alter table public.orders
  add column if not exists extra_data jsonb;

-- 2. Shallow-merge helper used by create-qicard-payment to attach the QiCard
--    payment reference without clobbering other extra_data keys.
create or replace function public.jsonb_merge_extra_data(
  p_order_id uuid,
  p_data jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders
  set extra_data = coalesce(extra_data, '{}'::jsonb) || coalesce(p_data, '{}'::jsonb)
  where id = p_order_id;
$$;

-- This is a SECURITY DEFINER function with no per-row auth check, so it must NOT
-- be reachable from PostgREST clients (an anon/authenticated caller could
-- otherwise merge arbitrary JSON into ANY order → IDOR / data tampering). Its
-- only legitimate caller is the create-qicard-payment edge function, which runs
-- as service_role. An in-function auth.uid() check is NOT viable because the
-- service role has no auth.uid(); restricting EXECUTE is the correct control.
revoke all on function public.jsonb_merge_extra_data(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.jsonb_merge_extra_data(uuid, jsonb) to service_role;


-- ============================================================
-- 20260709120000_conversation_archive_labels.sql
-- ============================================================
-- Conversation organization: per-side archive flag + labels.
-- Mirrors the existing deleted_by / unread "JSONB per side" pattern, so the
-- client updates these columns through the same conversations RLS policy that
-- already permits softDeleteConversation / markConversationAsRead.
--
--   archived_by : { "user": bool, "admin": bool }   -- hidden from that side's main list
--   labels      : { "user": string[], "admin": string[] }  -- assigned label ids per side

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS archived_by jsonb NOT NULL DEFAULT '{"user": false, "admin": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '{}'::jsonb;


-- ============================================================
-- 20260709160000_cancel_my_order_restores_stock.sql
-- ============================================================
-- =============================================================================
-- Fix: user-cancel must restore stock (parity with the admin cancel path).
-- =============================================================================
-- Root cause: stock restore lived ONLY in tenantAdminService.updateOrderStatus
-- (gated on stock_status = 'deducted'). The customer cancel goes through the
-- SECURITY DEFINER RPC cancel_my_order, which only flipped status to
-- 'cancelled_by_user'. So when a customer cancelled an order whose stock had
-- been deducted (admin confirmed it — even if it was later moved back to
-- 'pending'), stock_status stayed 'deducted' and the units were never restocked.
--
-- This rewrites cancel_my_order to ALSO restore stock when (and only when) it had
-- been deducted, keyed on stock_status so it never double-restores a
-- never-deducted order. Deploy by pasting this whole file into the Supabase SQL
-- editor and Run. No app rebuild needed — the app already calls this RPC.
-- =============================================================================

-- 1) Ensure the atomic, row-locking stock mover exists (matches move_part_stock.sql).
--    Signed p_delta: NEGATIVE deducts, POSITIVE restores; clamps at 0.
create or replace function public.move_part_stock(
  p_part_id uuid,
  p_tenant_id uuid,
  p_variation_id text,
  p_delta integer
) returns void
language plpgsql
as $$
declare
  v_variations jsonb;
  v_colors jsonb;
begin
  select variations, color_variations
    into v_variations, v_colors
  from public.parts
  where id = p_part_id and tenant_id = p_tenant_id
  for update;

  if not found then
    return;  -- product gone / wrong tenant: no-op, never error the order
  end if;

  if p_variation_id is null or p_variation_id = '' then
    update public.parts
      set stock_qty = greatest(0, coalesce(stock_qty, 0) + p_delta)
    where id = p_part_id and tenant_id = p_tenant_id;
    return;
  end if;

  v_variations := (
    select coalesce(jsonb_agg(
      case when elem->>'variationId' = p_variation_id
        then jsonb_set(elem, '{stockQuantity}',
               to_jsonb(greatest(0, coalesce((elem->>'stockQuantity')::numeric, 0)::int + p_delta)))
        else elem
      end
    ), v_variations)
    from jsonb_array_elements(coalesce(v_variations, '[]'::jsonb)) as elem
  );

  v_colors := (
    select coalesce(jsonb_agg(
      case when elem->>'variationId' = p_variation_id
        then jsonb_set(elem, '{stockQuantity}',
               to_jsonb(greatest(0, coalesce((elem->>'stockQuantity')::numeric, 0)::int + p_delta)))
        else elem
      end
    ), v_colors)
    from jsonb_array_elements(coalesce(v_colors, '[]'::jsonb)) as elem
  );

  update public.parts
    set variations = v_variations,
        color_variations = v_colors
  where id = p_part_id and tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.move_part_stock(uuid, uuid, text, integer) to authenticated;

-- 2) Owner-scoped cancel that restores stock when it had been deducted.
create or replace function public.cancel_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_item    jsonb;
  v_part_id uuid;
  v_tenant  uuid;
begin
  -- Lock the order row so a concurrent admin status change can't race the cancel.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Ownership: the caller must own the order.
  if v_order.user_id is distinct from auth.uid() then
    raise exception 'Not authorized to cancel this order';
  end if;

  -- Idempotent: already cancelled → nothing to do (best-effort callers re-invoke).
  if v_order.status in ('cancelled', 'cancelled_by_user', 'cancelled_by_store') then
    return;
  end if;

  -- Only pending / confirmed orders are user-cancellable (matches the app UI).
  if v_order.status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled';
  end if;

  -- Restore stock ONLY if it was actually deducted. Keyed on stock_status (not
  -- order status) so a confirmed→pending→cancel path still restores, and a
  -- never-deducted pending order is not falsely credited.
  if v_order.stock_status = 'deducted' then
    for v_item in select value from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    loop
      -- Skip lines with a non-uuid (legacy Firestore) product id instead of aborting.
      begin
        v_part_id := (v_item->>'productId')::uuid;
      exception when others then
        continue;
      end;

      -- Resolve the part's real tenant (order.tenant_id can be null on legacy rows).
      select tenant_id into v_tenant from public.parts where id = v_part_id;
      if v_tenant is not null then
        perform public.move_part_stock(
          v_part_id,
          v_tenant,
          nullif(v_item->>'variationId', ''),
          coalesce((v_item->>'quantity')::int, 0)   -- positive delta = restore
        );
      end if;
    end loop;
  end if;

  update public.orders
    set status       = 'cancelled_by_user',
        stock_status = case when v_order.stock_status = 'deducted' then 'rolled_back' else stock_status end,
        updated_at   = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.cancel_my_order(uuid) from public, anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;


-- ============================================================
-- 20260722120000_brands_promos_variant_columns.sql
-- ============================================================
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

