import os

schema = '''-- =============================================================================
-- KHAMARK — Consolidated Production Database Schema
-- =============================================================================
-- Clean, production-ready schema for the new Khamark application backend.
-- Starts completely empty: no legacy client products, orders, or customers.
--
-- How to apply:
--   1. Create a fresh Supabase project for Khamark.
--   2. Open Supabase Studio -> SQL Editor -> New Query.
--   3. Paste the contents of this entire file and click "Run".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- Fast ILIKE and fuzzy product search
create extension if not exists "pg_net";      -- Webhooks and network requests

-- ---------------------------------------------------------------------------
-- 2. Core Early Helper Functions
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

-- Helper: Is caller an administrator?
create or replace function public.is_admin() returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_admin boolean;
begin
  select is_admin into v_admin from public.users where id = auth.uid();
  return coalesce(v_admin, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Core Tables
-- ---------------------------------------------------------------------------

-- Users (extends Supabase auth.users)
create table if not exists public.users (
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
  is_partner             boolean default false,
  is_blocked             boolean default false,
  phone_verified         boolean default false,
  email_verified         boolean default false,
  auth_provider          text,
  push_token             text,
  push_token_updated_at  timestamptz,
  fcm_token              text,
  fcm_token_updated_at   timestamptz,
  notification_settings  jsonb default '{"orderUpdates": true, "promotions": true}'::jsonb,
  shipping_info          jsonb,
  money_exchanger_info   jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Store Tenants (Owner user ID is tenant ID)
create table if not exists public.tenants (
  id                     uuid primary key references public.users(id) on delete cascade,
  owner_id               uuid references public.users(id) on delete cascade,
  store_name             text not null default 'Khamark',
  store_name_ar          text default 'خامارك',
  store_name_ku          text default 'خامارک',
  logo_url               text,
  cover_url              text,
  description            text,
  contact_email          text,
  contact_phone          text,
  contact_whatsapp       text,
  address                text,
  city                   text,
  is_active              boolean default true,
  settings               jsonb default '{}'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Physical Base Parts Table (Secure Storage for Catalogue & Purchase Costs)
create table if not exists public.parts_base (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  name                   text not null,
  name_ar                text,
  name_ku                text,
  part_number            text,
  barcode                text,
  category               text,
  category_ar            text,
  category_ku            text,
  brand                  text,
  price_usd              numeric(10,2) not null default 0,
  price_iqd              numeric(12,2),
  purchase_price         numeric(10,2),
  purchase_price_iqd     numeric(12,2),
  compare_at_price       numeric(10,2),
  compare_at_price_iqd   numeric(12,2),
  vip_price              numeric(10,2),
  vip_price_iqd          numeric(12,2),
  vip_price_usd          numeric(10,2),
  compare_at_price_usd   numeric(10,2),
  stock_qty              integer not null default 0,
  initial_stock          integer default 0,
  historical_stock_qty   integer default 0,
  status                 text not null default 'available', -- 'available' | 'coming_soon' | 'on_the_way'
  description            text,
  description_ar         text,
  description_ku         text,
  specifications         jsonb,
  features               text[],
  image_urls             text[],
  variations             jsonb,
  color_variations       jsonb,
  storage_options        jsonb,
  tags                   text[],
  is_featured            boolean default false,
  is_hot                 boolean default false,
  is_new                 boolean default false,
  is_active              boolean default true,
  price_tiers            jsonb default '[]'::jsonb,
  sort_order             integer default 0,
  shipping_cost          numeric(10,2) default 0,
  shipping_rates         jsonb,
  compatible_models      text[],
  dimensions             text,
  weight                 text,
  warranty               text,
  video_url              text,
  sku                    text,
  condition              text default 'new', -- 'new' | 'used'
  extra_data             jsonb default '{}'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Parts View (Masks internal purchase_price for non-admin callers)
create or replace view public.parts as
select
  id,
  tenant_id,
  name,
  name_ar,
  name_ku,
  part_number,
  barcode,
  category,
  category_ar,
  category_ku,
  brand,
  price_usd,
  price_iqd,
  case
    when auth.role() = 'service_role' or public.is_admin() then purchase_price
    else null
  end as purchase_price,
  case
    when auth.role() = 'service_role' or public.is_admin() then purchase_price_iqd
    else null
  end as purchase_price_iqd,
  compare_at_price,
  compare_at_price_iqd,
  vip_price,
  vip_price_iqd,
  coalesce(vip_price_usd, vip_price) as vip_price_usd,
  coalesce(compare_at_price_usd, compare_at_price) as compare_at_price_usd,
  stock_qty,
  initial_stock,
  historical_stock_qty,
  status,
  description,
  description_ar,
  description_ku,
  specifications,
  features,
  image_urls,
  variations,
  color_variations,
  storage_options,
  tags,
  is_featured,
  is_hot,
  is_new,
  is_active,
  price_tiers,
  sort_order,
  shipping_cost,
  shipping_rates,
  compatible_models,
  dimensions,
  weight,
  warranty,
  video_url,
  sku,
  condition,
  extra_data,
  created_at,
  updated_at
from public.parts_base;

-- Updatable Trigger for parts view
create or replace function public.trg_parts_io()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.parts_base (
      id, tenant_id, name, name_ar, name_ku, part_number, barcode, category, category_ar, category_ku,
      brand, price_usd, price_iqd, purchase_price, purchase_price_iqd, compare_at_price, compare_at_price_iqd,
      vip_price, vip_price_iqd, vip_price_usd, compare_at_price_usd, stock_qty, initial_stock, historical_stock_qty,
      status, description, description_ar, description_ku, specifications, features, image_urls, variations,
      color_variations, storage_options, tags, is_featured, is_hot, is_new, is_active, price_tiers, sort_order,
      shipping_cost, shipping_rates, compatible_models, dimensions, weight, warranty, video_url, sku, condition,
      extra_data, created_at, updated_at
    ) values (
      coalesce(new.id, gen_random_uuid()), new.tenant_id, new.name, new.name_ar, new.name_ku, new.part_number,
      new.barcode, new.category, new.category_ar, new.category_ku, new.brand, coalesce(new.price_usd, 0),
      new.price_iqd, new.purchase_price, new.purchase_price_iqd, new.compare_at_price, new.compare_at_price_iqd,
      new.vip_price, new.vip_price_iqd, coalesce(new.vip_price_usd, new.vip_price),
      coalesce(new.compare_at_price_usd, new.compare_at_price), coalesce(new.stock_qty, 0),
      coalesce(new.initial_stock, 0), coalesce(new.historical_stock_qty, 0), coalesce(new.status, 'available'),
      new.description, new.description_ar, new.description_ku, new.specifications, new.features, new.image_urls,
      new.variations, new.color_variations, new.storage_options, new.tags, coalesce(new.is_featured, false),
      coalesce(new.is_hot, false), coalesce(new.is_new, false), coalesce(new.is_active, true),
      coalesce(new.price_tiers, '[]'::jsonb), coalesce(new.sort_order, 0), coalesce(new.shipping_cost, 0),
      new.shipping_rates, new.compatible_models, new.dimensions, new.weight, new.warranty, new.video_url,
      new.sku, coalesce(new.condition, 'new'), coalesce(new.extra_data, '{}'::jsonb),
      coalesce(new.created_at, now()), coalesce(new.updated_at, now())
    );
    return new;
  elsif tg_op = 'UPDATE' then
    update public.parts_base set
      tenant_id = coalesce(new.tenant_id, parts_base.tenant_id),
      name = coalesce(new.name, parts_base.name),
      name_ar = coalesce(new.name_ar, parts_base.name_ar),
      name_ku = coalesce(new.name_ku, parts_base.name_ku),
      part_number = coalesce(new.part_number, parts_base.part_number),
      barcode = coalesce(new.barcode, parts_base.barcode),
      category = coalesce(new.category, parts_base.category),
      category_ar = coalesce(new.category_ar, parts_base.category_ar),
      category_ku = coalesce(new.category_ku, parts_base.category_ku),
      brand = coalesce(new.brand, parts_base.brand),
      price_usd = coalesce(new.price_usd, parts_base.price_usd),
      price_iqd = coalesce(new.price_iqd, parts_base.price_iqd),
      purchase_price = case when new.purchase_price is not null then new.purchase_price else parts_base.purchase_price end,
      purchase_price_iqd = case when new.purchase_price_iqd is not null then new.purchase_price_iqd else parts_base.purchase_price_iqd end,
      compare_at_price = coalesce(new.compare_at_price, parts_base.compare_at_price),
      compare_at_price_iqd = coalesce(new.compare_at_price_iqd, parts_base.compare_at_price_iqd),
      vip_price = coalesce(new.vip_price, parts_base.vip_price),
      vip_price_iqd = coalesce(new.vip_price_iqd, parts_base.vip_price_iqd),
      vip_price_usd = coalesce(new.vip_price_usd, parts_base.vip_price_usd),
      compare_at_price_usd = coalesce(new.compare_at_price_usd, parts_base.compare_at_price_usd),
      stock_qty = coalesce(new.stock_qty, parts_base.stock_qty),
      initial_stock = coalesce(new.initial_stock, parts_base.initial_stock),
      historical_stock_qty = coalesce(new.historical_stock_qty, parts_base.historical_stock_qty),
      status = coalesce(new.status, parts_base.status),
      description = coalesce(new.description, parts_base.description),
      description_ar = coalesce(new.description_ar, parts_base.description_ar),
      description_ku = coalesce(new.description_ku, parts_base.description_ku),
      specifications = coalesce(new.specifications, parts_base.specifications),
      features = coalesce(new.features, parts_base.features),
      image_urls = coalesce(new.image_urls, parts_base.image_urls),
      variations = coalesce(new.variations, parts_base.variations),
      color_variations = coalesce(new.color_variations, parts_base.color_variations),
      storage_options = coalesce(new.storage_options, parts_base.storage_options),
      tags = coalesce(new.tags, parts_base.tags),
      is_featured = coalesce(new.is_featured, parts_base.is_featured),
      is_hot = coalesce(new.is_hot, parts_base.is_hot),
      is_new = coalesce(new.is_new, parts_base.is_new),
      is_active = coalesce(new.is_active, parts_base.is_active),
      price_tiers = coalesce(new.price_tiers, parts_base.price_tiers),
      sort_order = coalesce(new.sort_order, parts_base.sort_order),
      shipping_cost = coalesce(new.shipping_cost, parts_base.shipping_cost),
      shipping_rates = coalesce(new.shipping_rates, parts_base.shipping_rates),
      compatible_models = coalesce(new.compatible_models, parts_base.compatible_models),
      dimensions = coalesce(new.dimensions, parts_base.dimensions),
      weight = coalesce(new.weight, parts_base.weight),
      warranty = coalesce(new.warranty, parts_base.warranty),
      video_url = coalesce(new.video_url, parts_base.video_url),
      sku = coalesce(new.sku, parts_base.sku),
      condition = coalesce(new.condition, parts_base.condition),
      extra_data = coalesce(new.extra_data, parts_base.extra_data),
      updated_at = now()
    where id = old.id;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.parts_base where id = old.id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_parts_io on public.parts;
create trigger trg_parts_io
  instead of insert or update or delete on public.parts
  for each row execute function public.trg_parts_io();

-- Categories
create table if not exists public.categories (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  name                   text not null,
  name_ar                text,
  name_ku                text,
  slug                   text,
  image_url              text,
  icon                   text,
  order_index            integer default 0,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Brands
create table if not exists public.brands (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  name                   text not null,
  image_url              text,
  order_index            integer default 0,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Banners
create table if not exists public.banners (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  image_url              text not null,
  title                  text,
  title_ar               text,
  title_ku               text,
  link_url               text,
  action_type            text,
  action_target          text,
  order_index            integer default 0,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Orders
create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text unique,
  idempotency_key        text unique,
  tenant_id              uuid references public.tenants(id) on delete cascade,
  user_id                uuid references public.users(id) on delete set null,
  status                 text default 'pending', -- 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'cancelled_by_user' | 'cancelled_by_store'
  stock_status           text default 'pending', -- 'pending' | 'deducted' | 'rolled_back'
  payment_status         text default 'unpaid',  -- 'unpaid' | 'paid' | 'refunded'
  payment_method         text default 'cash_on_delivery', -- 'cash_on_delivery' | 'money_exchanger' | 'qicard'
  items                  jsonb not null default '[]'::jsonb,
  subtotal_usd           numeric(10,2) default 0,
  shipping_usd           numeric(10,2) default 0,
  shipping_cost_usd      numeric(10,2) default 0,
  tax_usd                numeric(10,2) default 0,
  discount_usd           numeric(10,2) default 0,
  total_usd              numeric(10,2) not null default 0,
  total_iqd              numeric(12,2),
  exchange_rate          numeric(10,2) default 1500,
  currency               text default 'IQD',
  shipping_address       jsonb,
  shipping_office_info   jsonb,
  money_exchanger_info   jsonb,
  customer_name          text,
  customer_phone         text,
  notes                  text,
  qicard_payment_id      text,
  extra_data             jsonb default '{}'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Order Integrity Trigger
create or replace function public.enforce_order_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  -- 1. Blocked user check: suppress order insertion
  if exists (select 1 from public.users where id = new.user_id and is_blocked = true) then
    return null;
  end if;

  -- 2. Synchronize shipping fields
  if new.shipping_usd is not null and (new.shipping_cost_usd is null or new.shipping_cost_usd = 0) then
    new.shipping_cost_usd := new.shipping_usd;
  elsif new.shipping_cost_usd is not null and (new.shipping_usd is null or new.shipping_usd = 0) then
    new.shipping_usd := new.shipping_cost_usd;
  end if;

  -- 3. Non-admin customer insertions cannot forge final states or arbitrary total prices
  if not public.is_admin() then
    new.status := 'pending';
    new.payment_status := 'unpaid';
    new.stock_status := 'pending';

    -- Recalculate authoritative total_usd from parts_base table
    if new.items is not null and jsonb_typeof(new.items) = 'array' and jsonb_array_length(new.items) > 0 then
      declare
        v_item jsonb;
        v_calculated_subtotal numeric(10,2) := 0;
        v_part_id text;
        v_qty numeric;
        v_unit_price numeric(10,2);
      begin
        for v_item in select * from jsonb_array_elements(new.items)
        loop
          v_part_id := coalesce(v_item->>'id', v_item->>'productId');
          v_qty := coalesce(nullif(v_item->>'quantity', '')::numeric, 1);
          if v_qty <= 0 then v_qty := 1; end if;

          select price_usd into v_unit_price
          from public.parts_base
          where id::text = v_part_id
          limit 1;

          if v_unit_price is not null then
            v_calculated_subtotal := v_calculated_subtotal + (v_unit_price * v_qty);
          else
            v_calculated_subtotal := v_calculated_subtotal + (coalesce(nullif(v_item->>'price', '')::numeric, 0) * v_qty);
          end if;
        end loop;

        if v_calculated_subtotal > 0 then
          new.subtotal_usd := v_calculated_subtotal;
          new.total_usd := v_calculated_subtotal + coalesce(new.shipping_usd, new.shipping_cost_usd, 0) + coalesce(new.tax_usd, 0) - coalesce(new.discount_usd, 0);
          new.total_iqd := round(new.total_usd * coalesce(new.exchange_rate, 1500), -2);
        end if;
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_enforce on public.orders;
create trigger trg_orders_enforce
  before insert on public.orders
  for each row execute function public.enforce_order_integrity();

-- Discounts & Promo Codes
create table if not exists public.discounts (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  code                   text not null,
  discount_type          text not null default 'percentage', -- 'percentage' | 'fixed'
  value                  numeric(10,2) not null default 0,
  min_order_usd          numeric(10,2) default 0,
  max_discount_usd       numeric(10,2),
  valid_from             timestamptz default now(),
  valid_until            timestamptz,
  usage_limit            integer,
  usage_count            integer default 0,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table if not exists public.promo_codes (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  code                   text not null,
  discount_type          text not null default 'percentage',
  value                  numeric(10,2) not null default 0,
  min_order_usd          numeric(10,2) default 0,
  max_discount_usd       numeric(10,2),
  valid_from             timestamptz default now(),
  valid_until            timestamptz,
  usage_limit            integer,
  usage_count            integer default 0,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Customer Addresses
create table if not exists public.addresses (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  title                  text default 'Home',
  recipient_name         text not null,
  phone                  text not null,
  city                   text not null,
  region                 text,
  street                 text not null,
  building               text,
  notes                  text,
  is_default             boolean default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Shopping Carts
create table if not exists public.carts (
  id                     uuid primary key references public.users(id) on delete cascade,
  items                  jsonb not null default '[]'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Favorites / Wishlist
create table if not exists public.favorites (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  part_id                uuid not null references public.parts_base(id) on delete cascade,
  created_at             timestamptz default now(),
  unique (user_id, part_id)
);

-- Reviews & Ratings
create table if not exists public.reviews (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  part_id                uuid not null references public.parts_base(id) on delete cascade,
  rating                 integer not null check (rating between 1 and 5),
  title                  text,
  comment                text,
  is_verified_purchase   boolean default false,
  is_approved            boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Chat Conversations & Messages
create table if not exists public.conversations (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  user_id                uuid references public.users(id) on delete cascade,
  unread_user            integer default 0,
  unread_tenant          integer default 0,
  last_message           text,
  last_message_at        timestamptz default now(),
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table if not exists public.messages (
  id                     uuid primary key default gen_random_uuid(),
  conversation_id        uuid references public.conversations(id) on delete cascade,
  sender_id              uuid references public.users(id) on delete set null,
  sender_type            text not null default 'user', -- 'user' | 'store' | 'system'
  text                   text,
  image_url              text,
  read                   boolean default false,
  created_at             timestamptz default now()
);

-- Notifications
create table if not exists public.notifications (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  title                  text not null,
  body                   text not null,
  type                   text default 'general', -- 'order' | 'promo' | 'general'
  data                   jsonb default '{}'::jsonb,
  read                   boolean default false,
  created_at             timestamptz default now()
);

-- Saved Cards (Tokens only, PCI compliant)
create table if not exists public.saved_cards (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  card_type              text not null, -- 'qicard' | 'fib' | 'visa' | 'mastercard'
  masked_number          text not null, -- '**** **** **** 1234'
  cardholder_name        text,
  expiry                 text,
  token                  text not null,
  is_default             boolean default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Trade-In Requests
create table if not exists public.trade_in_requests (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.users(id) on delete cascade,
  user_id                uuid references public.users(id) on delete set null,
  contact_name           text not null,
  contact_phone          text not null,
  device_brand           text not null,
  device_model           text not null,
  storage                text,
  questions_version      integer not null default 1,
  answers                jsonb not null default '{}'::jsonb,
  photos                 text[] not null default '{}',
  customer_note          text,
  status                 text not null default 'submitted',
  offer_usd              numeric(10,2),
  offer_note             text,
  offer_type             text default 'cash',
  reviewed_by            uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  quoted_at              timestamptz,
  constraint trade_in_status_valid check (
    status in ('submitted','quoted','accepted','declined','completed','cancelled')
  ),
  constraint trade_in_offer_type_valid check (offer_type in ('cash','credit'))
);

-- Physical Store Locations
create table if not exists public.store_locations (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  name                   text not null,
  address                text not null,
  phone                  text,
  latitude               numeric(10,7),
  longitude              numeric(10,7),
  working_hours          text,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- App Config & Remote Settings
create table if not exists public.app_config (
  id                     text primary key default 'app',
  data                   jsonb not null default '{}'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Store/Tenant Settings
create table if not exists public.tenant_settings (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,
  setting_key            text,
  setting_value          jsonb,
  updated_at             timestamptz default now()
);

-- Global Settings
create table if not exists public.global_settings (
  id                     text primary key default 'global',
  data                   jsonb not null default '{"exchangeRate": 1500}'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Push Tokens & Devices
create table if not exists public.push_tokens (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references public.users(id) on delete cascade,
  token                  text not null unique,
  platform               text,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table if not exists public.devices (
  id                     text primary key,
  uid                    uuid references public.users(id) on delete cascade,
  device_name            text,
  platform               text,
  fcm_token              text,
  notifications_enabled  boolean default true,
  is_active              boolean default true,
  preferences            jsonb default '{}'::jsonb,
  last_active_at         timestamptz default now()
);

create table if not exists public.live_tracking (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid references public.orders(id) on delete cascade,
  driver_name            text,
  driver_phone           text,
  active                 boolean default true,
  coords                 jsonb,
  updated_at             timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 4. Triggers (updated_at)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'tenants', 'parts_base', 'categories', 'brands', 'banners',
    'orders', 'discounts', 'promo_codes', 'addresses', 'carts',
    'conversations', 'reviews', 'saved_cards', 'trade_in_requests',
    'store_locations', 'app_config', 'tenant_settings', 'global_settings',
    'push_tokens', 'live_tracking'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Business Logic RPCs & Functions
-- ---------------------------------------------------------------------------

-- Prevent client-side privilege escalation on public.users
create or replace function public.prevent_privilege_escalation() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.is_admin   is distinct from old.is_admin
    or new.role       is distinct from old.role
    or new.is_partner is distinct from old.is_partner
    or new.is_blocked is distinct from old.is_blocked then
      raise exception 'Not allowed to modify privilege fields from the client';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_privilege_escalation on public.users;
create trigger trg_prevent_privilege_escalation
  before update on public.users
  for each row execute function public.prevent_privilege_escalation();

-- Automatic new user profile creation from auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, name, full_name, email, phone, language)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'name',
                    new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name',
                    new.raw_user_meta_data ->> 'name'), ''),
    nullif(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'phone', new.phone), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'en')
  )
  on conflict (id) do update set
    name       = coalesce(excluded.name,      public.users.name),
    full_name  = coalesce(excluded.full_name, public.users.full_name),
    email      = coalesce(excluded.email,     public.users.email),
    phone      = coalesce(excluded.phone,     public.users.phone),
    language   = coalesce(excluded.language,  public.users.language);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pre-signup check: Does this email exist?
create or replace function public.email_exists(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
      from auth.users
     where lower(email) = lower(btrim(p_email))
  );
$$;

revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated, service_role;

-- Phone account lookup (SECURITY DEFINER for pre-auth sign-in)
create or replace function public.account_id_for_phone(p_phone text)
returns uuid
language plpgsql
security definer
stable
set search_path = public, auth, pg_temp
as $$
declare
  v_digits text := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_id uuid;
begin
  select id into v_id from public.users where phone = p_phone or phone = v_digits limit 1;
  if v_id is not null then return v_id; end if;

  select id into v_id from auth.users where phone = p_phone or phone = v_digits limit 1;
  if v_id is not null then return v_id; end if;

  select id into v_id from auth.users where email ilike (v_digits || '@%') limit 1;
  if v_id is not null then return v_id; end if;

  select id into v_id from public.users where email ilike (v_digits || '@%') limit 1;
  return v_id;
end;
$$;

revoke all on function public.account_id_for_phone(text) from public;
grant execute on function public.account_id_for_phone(text) to anon, authenticated, service_role;

-- Phone to Login Email Resolution RPC
create or replace function public.lookup_login_email(p_phone text)
returns text
language plpgsql
security definer
stable
set search_path = public, auth, pg_temp
as $$
declare
  v_digits text;
  v_email text;
begin
  if p_phone is null or length(trim(p_phone)) = 0 then
    return null;
  end if;

  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- 1. Check public.users
  select email into v_email
  from public.users
  where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_digits
    and email is not null
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 2. Check auth.users
  select email into v_email
  from auth.users
  where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_digits
    and email is not null
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.lookup_login_email(text) from public;
grant execute on function public.lookup_login_email(text) to anon, authenticated, service_role;

-- Admin Onboarding RPC
create or replace function public.create_admin_account(
  p_display_name text default null,
  p_store_name text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_invite_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_admins integer;
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select count(*) into v_existing_admins from public.users where is_admin = true or role = 'admin';

  -- Only permitted if initial system bootstrap OR caller is already an admin OR valid invite
  if v_existing_admins > 0 and not public.is_admin() then
    if p_invite_code is null or p_invite_code <> 'KHAMARK_OWNER_PROVISION_2026' then
      raise exception 'Unauthorized: admin onboarding requires owner invitation or existing admin privilege';
    end if;
  end if;

  update public.users
  set is_admin = true,
      role = 'admin',
      name = coalesce(p_display_name, name),
      full_name = coalesce(p_display_name, full_name),
      phone = coalesce(p_phone, phone),
      updated_at = now()
  where id = v_uid;

  v_tenant_id := v_uid;

  insert into public.tenants (
    id, owner_id, store_name, is_active, contact_phone, contact_whatsapp
  ) values (
    v_tenant_id, v_uid, coalesce(nullif(p_store_name, ''), 'Khamark Store'), true, p_phone, p_whatsapp
  )
  on conflict (id) do update set
    store_name = excluded.store_name,
    contact_phone = coalesce(excluded.contact_phone, public.tenants.contact_phone),
    contact_whatsapp = coalesce(excluded.contact_whatsapp, public.tenants.contact_whatsapp),
    updated_at = now();

  return jsonb_build_object('success', true, 'tenant_id', v_tenant_id);
end;
$$;

revoke all on function public.create_admin_account(text, text, text, text, text) from public;
grant execute on function public.create_admin_account(text, text, text, text, text) to authenticated, service_role;

-- Partner Onboarding RPC (Read-Only Partner)
create or replace function public.create_partner_account(
  p_display_name text default null,
  p_phone text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- View-only partner: role stays 'customer', is_admin stays FALSE
  update public.users
  set is_partner = true,
      role = 'customer',
      is_admin = false,
      name = coalesce(p_display_name, name),
      full_name = coalesce(p_display_name, full_name),
      phone = coalesce(p_phone, phone),
      updated_at = now()
  where id = v_uid;

  return jsonb_build_object('success', true, 'is_partner', true);
end;
$$;

revoke all on function public.create_partner_account(text, text) from public;
grant execute on function public.create_partner_account(text, text) to authenticated, service_role;

-- Server-Authoritative Order Creation RPC
create or replace function public.create_customer_order(
  p_items jsonb,
  p_shipping_address jsonb default null,
  p_shipping_office_info jsonb default null,
  p_payment_method text default 'cash_on_delivery',
  p_promo_code text default null,
  p_notes text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_part_id text;
  v_qty integer;
  v_unit_price numeric(10,2);
  v_vip_price numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_total_usd numeric(10,2);
  v_total_iqd numeric(12,2);
  v_rate numeric(10,2) := 1500;
  v_is_vip boolean := false;
  v_validated_items jsonb := '[]'::jsonb;
  v_existing_order jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if exists (select 1 from public.users where id = v_uid and is_blocked = true) then
    raise exception 'Account is blocked' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select jsonb_build_object(
      'order_id', id,
      'order_number', order_number,
      'total_usd', total_usd,
      'total_iqd', total_iqd,
      'status', status,
      'payment_status', payment_status,
      'idempotent_replayed', true
    ) into v_existing_order
    from public.orders
    where user_id = v_uid and idempotency_key = p_idempotency_key;

    if v_existing_order is not null then
      return v_existing_order;
    end if;
  end if;

  select coalesce(role = 'vip', false) into v_is_vip from public.users where id = v_uid;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item' using errcode = '22000';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_part_id := coalesce(v_item->>'id', v_item->>'productId');
    v_qty := coalesce(nullif(v_item->>'quantity', '')::integer, 0);

    if v_qty <= 0 or v_qty > 1000 then
      raise exception 'Quantity must be a positive integer' using errcode = '22003';
    end if;

    select tenant_id, price_usd, vip_price
    into v_tenant_id, v_unit_price, v_vip_price
    from public.parts_base
    where id::text = v_part_id;

    if v_unit_price is null then
      raise exception 'Product % not found', v_part_id using errcode = '02000';
    end if;

    if v_is_vip and v_vip_price is not null and v_vip_price > 0 then
      v_unit_price := v_vip_price;
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);

    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object(
        'id', v_part_id,
        'productId', v_part_id,
        'quantity', v_qty,
        'price', v_unit_price,
        'priceUSD', v_unit_price
      )
    );
  end loop;

  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    declare
      v_promo public.promo_codes%rowtype;
    begin
      select * into v_promo from public.promo_codes
      where lower(code) = lower(trim(p_promo_code)) and is_active = true
        and (valid_from is null or valid_from <= now())
        and (valid_until is null or valid_until >= now());

      if v_promo.id is not null and v_subtotal >= coalesce(v_promo.min_order_usd, 0) then
        if v_promo.discount_type = 'percentage' then
          v_discount := (v_subtotal * (v_promo.value / 100.0));
          if v_promo.max_discount_usd is not null and v_discount > v_promo.max_discount_usd then
            v_discount := v_promo.max_discount_usd;
          end if;
        else
          v_discount := least(v_promo.value, v_subtotal);
        end if;
      end if;
    end;
  end if;

  v_total_usd := greatest(0, v_subtotal - v_discount);
  v_total_iqd := round(v_total_usd * v_rate, -2);
  v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8));

  insert into public.orders (
    user_id, tenant_id, order_number, idempotency_key, status, payment_status,
    stock_status, payment_method, items, subtotal_usd, shipping_usd, shipping_cost_usd,
    discount_usd, tax_usd, total_usd, total_iqd, exchange_rate, currency,
    shipping_address, shipping_office_info, notes
  ) values (
    v_uid, v_tenant_id, v_order_number, p_idempotency_key, 'pending', 'unpaid',
    'pending', coalesce(p_payment_method, 'cash_on_delivery'), v_validated_items,
    v_subtotal, 0, 0, v_discount, 0, v_total_usd, v_total_iqd, v_rate, 'IQD',
    p_shipping_address, p_shipping_office_info, p_notes
  ) returning id into v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_usd', v_total_usd,
    'total_iqd', v_total_iqd,
    'status', 'pending',
    'payment_status', 'unpaid'
  );
end;
$$;

revoke all on function public.create_customer_order(jsonb, jsonb, jsonb, text, text, text, text) from public;
grant execute on function public.create_customer_order(jsonb, jsonb, jsonb, text, text, text, text) to authenticated, service_role;

-- User self-deletion (App Store guideline compliance)
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.tenants where owner_id = caller) then
    raise exception 'Store owner accounts cannot be deleted from the app. Please contact support.'
      using errcode = 'P0001';
  end if;

  -- 1. Anonymize user orders by scrubbing personal address details and unlinking user_id
  update public.orders
  set shipping_address = jsonb_build_object('anonymized', true),
      customer_name = 'Anonymized User',
      customer_phone = null,
      user_id = null
  where user_id = caller;

  -- 2. Delete user's storage objects metadata
  delete from storage.objects where owner_id = caller::text;

  -- 3. Delete devices, push tokens, carts, favorites, trade_ins, etc.
  delete from public.devices where uid = caller;
  delete from public.push_tokens where user_id = caller;
  delete from public.carts where id = caller;
  delete from public.favorites where user_id = caller;
  delete from public.addresses where user_id = caller;
  delete from public.notifications where user_id = caller;

  -- 4. Delete profile and auth user
  delete from public.users where id = caller;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated, service_role;

-- Stock movement helper (Protected: checks caller authorization & prevents negative stock clamping)
create or replace function public.move_part_stock(
  p_part_id uuid,
  p_tenant_id uuid,
  p_variation_id text,
  p_delta integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_variations jsonb;
  v_colors jsonb;
  v_current_stock integer;
  v_caller uuid := auth.uid();
  v_is_authorized boolean := false;
begin
  -- 1. Permission check: Anon callers cannot move stock
  if auth.role() = 'anon' or v_caller is null then
    return;
  end if;

  -- 2. Caller must be service_role OR an admin/owner of this tenant
  if auth.role() = 'service_role' then
    v_is_authorized := true;
  else
    if public.is_admin() or exists (select 1 from public.tenants where id = p_tenant_id and owner_id = v_caller) then
      v_is_authorized := true;
    end if;
  end if;

  if not v_is_authorized then
    return;
  end if;

  -- 3. Lock row in parts_base
  select variations, color_variations, stock_qty
    into v_variations, v_colors, v_current_stock
  from public.parts_base
  where id = p_part_id and tenant_id = p_tenant_id
  for update;

  if not found then
    return;
  end if;

  -- 4. Check stock shortage (Reject shortage: do NOT clamp negative stock to zero!)
  if p_variation_id is null or p_variation_id = '' then
    if coalesce(v_current_stock, 0) + p_delta < 0 then
      return; -- Reject invalid decrease beyond available units
    end if;

    update public.parts_base
      set stock_qty = coalesce(stock_qty, 0) + p_delta
    where id = p_part_id and tenant_id = p_tenant_id;
    return;
  end if;

  v_variations := (
    select coalesce(jsonb_agg(
      case when elem->>'variationId' = p_variation_id
        then jsonb_set(elem, '{stockQuantity}',
               to_jsonb(coalesce((elem->>'stockQuantity')::numeric, 0)::int + p_delta))
        else elem
      end
    ), v_variations)
    from jsonb_array_elements(coalesce(v_variations, '[]'::jsonb)) as elem
  );

  v_colors := (
    select coalesce(jsonb_agg(
      case when elem->>'variationId' = p_variation_id
        then jsonb_set(elem, '{stockQuantity}',
               to_jsonb(coalesce((elem->>'stockQuantity')::numeric, 0)::int + p_delta))
        else elem
      end
    ), v_colors)
    from jsonb_array_elements(coalesce(v_colors, '[]'::jsonb)) as elem
  );

  update public.parts_base
    set variations = v_variations,
        color_variations = v_colors
  where id = p_part_id and tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.move_part_stock(uuid, uuid, text, integer) to anon, authenticated, service_role;

-- User cancellation of pending order with stock restoration
create or replace function public.cancel_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   public.orders%rowtype;
  v_item    jsonb;
  v_part_id uuid;
  v_tenant  uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.user_id is distinct from auth.uid() then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_order.status in ('cancelled', 'cancelled_by_user', 'cancelled_by_store') then
    return;
  end if;

  if v_order.status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled';
  end if;

  if v_order.stock_status = 'deducted' then
    for v_item in select * from jsonb_array_elements(v_order.items)
    loop
      v_part_id := (v_item->>'productId')::uuid;
      v_tenant  := coalesce((v_item->>'tenantId')::uuid, v_order.tenant_id);

      if v_part_id is not null and v_tenant is not null then
        perform public.move_part_stock(
          v_part_id,
          v_tenant,
          v_item->>'variationId',
          (v_item->>'quantity')::int
        );
      end if;
    end loop;

    update public.orders
      set status       = 'cancelled_by_user',
          stock_status = 'rolled_back',
          updated_at   = now()
    where id = p_order_id;
  else
    update public.orders
      set status     = 'cancelled_by_user',
          updated_at = now()
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.cancel_my_order(uuid) from public;
grant execute on function public.cancel_my_order(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Storage Buckets & Policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 20971520)
on conflict (id) do update set public = true, file_size_limit = 20971520;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects
  for insert with check (bucket_id = 'media' and auth.role() = 'authenticated' and (owner_id = auth.uid()::text or owner_id is null or public.is_admin()));

drop policy if exists "media_update" on storage.objects;
create policy "media_update" on storage.objects
  for update using (bucket_id = 'media' and (owner_id = auth.uid()::text or public.is_admin()));

drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects
  for delete using (bucket_id = 'media' and (owner_id = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- 7. Row Level Security (RLS) Hardening
-- ---------------------------------------------------------------------------

-- Enable RLS across all tables
alter table public.users enable row level security;
alter table public.tenants enable row level security;
alter table public.parts_base enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.banners enable row level security;
alter table public.orders enable row level security;
alter table public.discounts enable row level security;
alter table public.promo_codes enable row level security;
alter table public.addresses enable row level security;
alter table public.carts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.saved_cards enable row level security;
alter table public.trade_in_requests enable row level security;
alter table public.store_locations enable row level security;
alter table public.app_config enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.global_settings enable row level security;
alter table public.push_tokens enable row level security;
alter table public.devices enable row level security;
alter table public.live_tracking enable row level security;

-- USERS
drop policy if exists "users_self_select" on public.users;
create policy "users_self_select" on public.users
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "users_self_update" on public.users;
create policy "users_self_update" on public.users
  for update using (auth.uid() = id or public.is_admin());

drop policy if exists "users_insert" on public.users;
create policy "users_insert" on public.users
  for insert with check (auth.uid() = id or auth.uid() is null);

-- CATALOGUE & CONFIG (Public Read, Admin Write)
do $$
declare t text;
begin
  foreach t in array array[
    'banners', 'categories', 'brands', 'tenants', 'store_locations',
    'discounts', 'promo_codes', 'app_config', 'tenant_settings'
  ] loop
    execute format('drop policy if exists "%s_public_read" on public.%I', t, t);
    execute format('create policy "%s_public_read" on public.%I for select using (true)', t, t);

    execute format('drop policy if exists "%s_admin_all" on public.%I', t, t);
    execute format('create policy "%s_admin_all" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end;
$$;

-- GLOBAL SETTINGS (Excludes security sensitive keys from public read)
drop policy if exists "global_settings_public_read" on public.global_settings;
create policy "global_settings_public_read" on public.global_settings
  for select using (id not in ('security', 'secrets', 'private', 'admin_config'));

drop policy if exists "global_settings_admin_all" on public.global_settings;
create policy "global_settings_admin_all" on public.global_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- PARTS_BASE
drop policy if exists "parts_base_public_read" on public.parts_base;
create policy "parts_base_public_read" on public.parts_base
  for select using (true);

drop policy if exists "parts_base_admin_write" on public.parts_base;
create policy "parts_base_admin_write" on public.parts_base
  for all using (public.is_admin()) with check (public.is_admin());

-- ORDERS
drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders
  for insert with check ((auth.uid() = user_id or auth.uid() is null) and (select is_blocked from public.users where id = auth.uid()) is not true);

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update" on public.orders
  for update using (public.is_admin());

-- CARTS
drop policy if exists "carts_self" on public.carts;
create policy "carts_self" on public.carts
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ADDRESSES
drop policy if exists "addresses_self" on public.addresses;
create policy "addresses_self" on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- FAVORITES
drop policy if exists "favorites_self" on public.favorites;
create policy "favorites_self" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- REVIEWS
drop policy if exists "reviews_read" on public.reviews;
create policy "reviews_read" on public.reviews
  for select using (is_approved = true or auth.uid() = user_id or public.is_admin());

drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_insert" on public.reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "reviews_update" on public.reviews;
create policy "reviews_update" on public.reviews
  for update using (auth.uid() = user_id or public.is_admin());

-- CONVERSATIONS & MESSAGES
drop policy if exists "conversations_self" on public.conversations;
create policy "conversations_self" on public.conversations
  for all using (auth.uid() = user_id or public.is_admin());

drop policy if exists "messages_self" on public.messages;
create policy "messages_self" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_id = auth.uid() or public.is_admin())
    )
  );

-- NOTIFICATIONS
drop policy if exists "notifications_self" on public.notifications;
create policy "notifications_self" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_self_update" on public.notifications;
create policy "notifications_self_update" on public.notifications
  for update using (auth.uid() = user_id);

drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert" on public.notifications
  for insert with check (public.is_admin());

-- SAVED CARDS
drop policy if exists "saved_cards_self" on public.saved_cards;
create policy "saved_cards_self" on public.saved_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- TRADE-IN REQUESTS
drop policy if exists "trade_in_select" on public.trade_in_requests;
create policy "trade_in_select" on public.trade_in_requests
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "trade_in_insert" on public.trade_in_requests;
create policy "trade_in_insert" on public.trade_in_requests
  for insert with check (auth.uid() = user_id or auth.uid() is null);

drop policy if exists "trade_in_admin_update" on public.trade_in_requests;
create policy "trade_in_admin_update" on public.trade_in_requests
  for update using (public.is_admin());

-- PUSH TOKENS & DEVICES (Enforces authenticated user ownership, denies anonymous ALL)
drop policy if exists "push_tokens_self" on public.push_tokens;
create policy "push_tokens_self" on public.push_tokens
  for all using (auth.role() = 'authenticated' and (auth.uid() = user_id or public.is_admin()))
  with check (auth.role() = 'authenticated' and (auth.uid() = user_id or public.is_admin()));

drop policy if exists "devices_self" on public.devices;
create policy "devices_self" on public.devices
  for all using (auth.role() = 'authenticated' and (auth.uid() = uid or public.is_admin()))
  with check (auth.role() = 'authenticated' and (auth.uid() = uid or public.is_admin()));

-- LIVE TRACKING (Scoped strictly to order owner, assigned driver or admin)
drop policy if exists "live_tracking_read" on public.live_tracking;
create policy "live_tracking_read" on public.live_tracking
  for select using (
    auth.role() = 'authenticated' and (
      order_id in (select id from public.orders where user_id = auth.uid()) or
      public.is_admin() or
      driver_phone = (select phone from public.users where id = auth.uid())
    )
  );

drop policy if exists "live_tracking_admin_write" on public.live_tracking;
create policy "live_tracking_admin_write" on public.live_tracking
  for all using (public.is_admin());

-- Permissions Grants
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 8. Seed Default Config
-- ---------------------------------------------------------------------------
insert into public.app_config (id, data)
values ('app', '{
  "forceUpdate": false,
  "minAppVersion": "1.0.0",
  "minVersionCode": 1,
  "features": {
    "chatEnabled": true,
    "tradeInEnabled": true,
    "qicardPayment": false,
    "fibPayment": false
  }
}'::jsonb)
on conflict (id) do nothing;

insert into public.global_settings (id, data)
values ('global', '{"exchangeRate": 1500, "currency": "IQD", "supportedCurrencies": ["USD", "IQD"]}'::jsonb)
on conflict (id) do nothing;
'''

with open('supabase/khamark_schema.sql', 'w') as f:
    f.write(schema)
print('Generated supabase/khamark_schema.sql')
