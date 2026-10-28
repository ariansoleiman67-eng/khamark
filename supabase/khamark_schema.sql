-- =============================================================================
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
-- 2. Timestamp update trigger function
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
  store_name_ar          text,
  store_name_ku          text,
  logo_url               text,
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Parts (Products)
create table if not exists public.parts (
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
  stock_qty              integer not null default 0,
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
  condition              text default 'new', -- 'new' | 'used'
  extra_data             jsonb default '{}'::jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

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
  tenant_id              uuid references public.tenants(id) on delete cascade,
  user_id                uuid references public.users(id) on delete set null,
  status                 text default 'pending', -- 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'cancelled_by_user' | 'cancelled_by_store'
  stock_status           text default 'pending', -- 'pending' | 'deducted' | 'rolled_back'
  payment_status         text default 'unpaid',  -- 'unpaid' | 'paid' | 'refunded'
  payment_method         text default 'cash_on_delivery', -- 'cash_on_delivery' | 'money_exchanger' | 'qicard'
  items                  jsonb not null default '[]'::jsonb,
  subtotal_usd           numeric(10,2) default 0,
  shipping_cost_usd      numeric(10,2) default 0,
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
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

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

-- Addresses
create table if not exists public.addresses (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  title                  text,
  address_line           text not null,
  city                   text not null,
  region                 text,
  postal_code            text,
  is_default             boolean default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Carts
create table if not exists public.carts (
  id                     uuid primary key references public.users(id) on delete cascade,
  items                  jsonb not null default '[]'::jsonb,
  updated_at             timestamptz default now()
);

-- Customer Chat Conversations & Messages
create table if not exists public.conversations (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  tenant_id              uuid references public.tenants(id) on delete cascade,
  user_name              text,
  user_avatar            text,
  last_message           text,
  last_message_at        timestamptz default now(),
  unread_count_user      integer default 0,
  unread_count_admin     integer default 0,
  is_archived            boolean default false,
  labels                 text[] default '{}',
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table if not exists public.messages (
  id                     uuid primary key default gen_random_uuid(),
  conversation_id        uuid not null references public.conversations(id) on delete cascade,
  sender_id              uuid not null references public.users(id) on delete cascade,
  sender_role            text not null default 'customer', -- 'customer' | 'admin' | 'bot'
  text                   text not null,
  image_url              text,
  is_read                boolean default false,
  created_at             timestamptz default now()
);

-- Notifications
create table if not exists public.notifications (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  title                  text not null,
  body                   text not null,
  type                   text default 'info',
  data                   jsonb,
  is_read                boolean default false,
  created_at             timestamptz default now()
);

-- Saved Payment Cards
create table if not exists public.saved_cards (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  payment_token          text not null unique,
  card_mask              text not null,
  payment_system         text default 'Unknown',
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Second-hand Phone Trade-In Requests
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
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table if not exists public.devices (
  id                     text primary key,
  uid                    uuid references public.users(id) on delete cascade,
  device_name            text,
  platform               text,
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
-- 4. Triggers for updated_at
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'tenants', 'parts', 'categories', 'brands', 'banners',
    'orders', 'discounts', 'promo_codes', 'addresses', 'conversations',
    'saved_cards', 'trade_in_requests', 'store_locations', 'app_config',
    'tenant_settings', 'global_settings', 'push_tokens', 'live_tracking'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Business Logic RPCs & Functions
-- ---------------------------------------------------------------------------

-- Helper: Is caller an administrator?
create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.users where id = auth.uid()), false);
$$;

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
grant execute on function public.email_exists(text) to anon, authenticated;

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
grant execute on function public.account_id_for_phone(text) to anon, authenticated;

-- User self-deletion (App Store guideline compliance)
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
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

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;

-- Stock movement helper
create or replace function public.move_part_stock(
  p_part_id uuid,
  p_tenant_id uuid,
  p_variation_id text,
  p_delta integer
) returns void
language plpgsql
security definer
set search_path = public
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
    return;
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

-- User cancellation of pending order with stock restoration
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
    for v_item in select value from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    loop
      begin
        v_part_id := (v_item->>'productId')::uuid;
      exception when others then
        continue;
      end;

      select tenant_id into v_tenant from public.parts where id = v_part_id;
      if v_tenant is not null then
        perform public.move_part_stock(
          v_part_id,
          v_tenant,
          nullif(v_item->>'variationId', ''),
          coalesce((v_item->>'quantity')::int, 0)
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

-- User deletion of dead/cancelled order from list
create or replace function public.delete_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return;
  end if;

  if v_order.user_id is distinct from auth.uid() then
    raise exception 'Not authorized to delete this order';
  end if;

  if v_order.status not in ('cancelled', 'cancelled_by_user', 'cancelled_by_store', 'rejected') then
    raise exception 'Only a cancelled order can be deleted';
  end if;

  delete from public.orders where id = p_order_id;
end;
$$;

revoke all on function public.delete_my_order(uuid) from public;
grant execute on function public.delete_my_order(uuid) to authenticated;

-- Atomic counter sale for POS
create or replace function public.create_counter_sale(
  p_tenant_id     uuid,
  p_items         jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_discount_usd  numeric default 0,
  p_amount_paid_usd numeric default null,
  p_total_iqd     numeric default null,
  p_exchange_rate numeric default 1500,
  p_notes         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item        jsonb;
  v_part_id     uuid;
  v_qty         int;
  v_subtotal    numeric := 0;
  v_discount    numeric;
  v_total       numeric;
  v_paid        numeric;
  v_order_id    uuid;
  v_order_no    text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.users where id = auth.uid() and is_admin) then
    raise exception 'Not an admin';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id and owner_id = auth.uid()) then
    raise exception 'Not an owner of this store';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    v_subtotal := v_subtotal + (coalesce((v_item->>'priceUSD')::numeric, 0) * v_qty);
  end loop;

  v_discount := coalesce(p_discount_usd, 0);
  v_total := greatest(0, v_subtotal - v_discount);
  v_paid := coalesce(p_amount_paid_usd, v_total);

  v_order_no := 'POS-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into public.orders (
    order_number, tenant_id, user_id, status, stock_status, payment_status,
    payment_method, items, subtotal_usd, discount_usd, total_usd, total_iqd,
    exchange_rate, currency, customer_name, customer_phone, notes
  ) values (
    v_order_no, p_tenant_id, auth.uid(), 'delivered', 'deducted',
    case when v_paid >= v_total then 'paid' else 'partial' end,
    'cash_on_delivery', p_items, v_subtotal, v_discount, v_total, p_total_iqd,
    p_exchange_rate, 'IQD', p_customer_name, p_customer_phone, p_notes
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_part_id := (v_item->>'productId')::uuid;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    perform public.move_part_stock(
      v_part_id,
      p_tenant_id,
      nullif(v_item->>'variationId', ''),
      -v_qty
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_no,
    'total_usd', v_total
  );
end;
$$;

grant execute on function public.create_counter_sale to authenticated;

-- Partner sales calculation
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
        and o.tenant_id = p.tenant_id
        and p.extra_data -> 'coAdminIds' ? coalesce(p_partner_uid, auth.uid())::text
        and (
          auth.uid() = coalesce(p_partner_uid, auth.uid())
          or auth.uid() = p.tenant_id
        )
    )
  group by item->>'productId';
$$;

grant execute on function public.get_partner_product_sales(uuid) to authenticated;

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
  for insert with check (bucket_id = 'media' and auth.role() = 'authenticated');

drop policy if exists "media_update" on storage.objects;
create policy "media_update" on storage.objects
  for update using (bucket_id = 'media' and auth.role() = 'authenticated');

drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects
  for delete using (bucket_id = 'media' and auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 7. Row Level Security (RLS) Hardening
-- ---------------------------------------------------------------------------

-- Enable RLS across all tables
alter table public.users enable row level security;
alter table public.tenants enable row level security;
alter table public.parts enable row level security;
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

-- Clean up any development permissive wildcard policies
do $$
declare r record;
begin
  for r in (select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and policyname = 'permissive_all') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

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
    'discounts', 'promo_codes', 'app_config', 'global_settings', 'tenant_settings'
  ] loop
    execute format('drop policy if exists "%s_public_read" on public.%I', t, t);
    execute format('create policy "%s_public_read" on public.%I for select using (true)', t, t);

    execute format('drop policy if exists "%s_admin_all" on public.%I', t, t);
    execute format('create policy "%s_admin_all" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end;
$$;

-- PARTS (Products)
drop policy if exists "parts_public_read" on public.parts;
create policy "parts_public_read" on public.parts
  for select using (true);

drop policy if exists "parts_admin_write" on public.parts;
create policy "parts_admin_write" on public.parts
  for all using (public.is_admin()) with check (public.is_admin());

-- ORDERS
drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders
  for insert with check (auth.uid() = user_id or auth.uid() is null);

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

-- CONVERSATIONS & MESSAGES
drop policy if exists "conversations_access" on public.conversations;
create policy "conversations_access" on public.conversations
  for all using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "messages_access" on public.messages;
create policy "messages_access" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_id = auth.uid() or public.is_admin())
    )
  );

-- NOTIFICATIONS
drop policy if exists "notifications_self" on public.notifications;
create policy "notifications_self" on public.notifications
  for all using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- SAVED CARDS
drop policy if exists "saved_cards_self" on public.saved_cards;
create policy "saved_cards_self" on public.saved_cards
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- TRADE-IN REQUESTS
drop policy if exists "trade_in_select" on public.trade_in_requests;
create policy "trade_in_select" on public.trade_in_requests
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "trade_in_insert" on public.trade_in_requests;
create policy "trade_in_insert" on public.trade_in_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists "trade_in_admin_update" on public.trade_in_requests;
create policy "trade_in_admin_update" on public.trade_in_requests
  for update using (public.is_admin());

-- PUSH TOKENS & DEVICES
drop policy if exists "push_tokens_self" on public.push_tokens;
create policy "push_tokens_self" on public.push_tokens
  for all using (auth.uid() = user_id or auth.uid() is null);

drop policy if exists "devices_self" on public.devices;
create policy "devices_self" on public.devices
  for all using (auth.uid() = uid or auth.uid() is null);

-- LIVE TRACKING
drop policy if exists "live_tracking_read" on public.live_tracking;
create policy "live_tracking_read" on public.live_tracking
  for select using (true);

drop policy if exists "live_tracking_admin_write" on public.live_tracking;
create policy "live_tracking_admin_write" on public.live_tracking
  for all using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Seed Default Config
-- ---------------------------------------------------------------------------
insert into public.app_config (id, data)
values ('app', '{
  "forceUpdate": false,
  "minAppVersion": "1.0.0",
  "minVersionCode": 1,
  "minBuildNumber": 1,
  "latestVersionCode": 1,
  "latestBuildNumber": 1,
  "updateMessage": "A critical update is required to continue using Khamark. Please update to the latest version.",
  "updateMessageAr": "يتطلب الأمر تحديثًا إلزاميًا لمتابعة استخدام تطبيق خامارك. يرجى التحديث إلى أحدث إصدار.",
  "updateMessageKu": "پێویستە نوێکردنەوەیەکی گرنگ ئەنجام بدەیت بۆ بەردەوامبوون لە بەکارهێنانی خامارک. تکایە بۆ دوا وەشان نوێی بکەرەوە.",
  "androidStoreUrl": "https://play.google.com/store/apps/details?id=com.khamark.app",
  "iosStoreUrl": "https://apps.apple.com/app/khamark/id_replace_with_apple_id"
}'::jsonb)
on conflict (id) do nothing;

insert into public.global_settings (id, data)
values ('global', '{"exchangeRate": 1500}'::jsonb)
on conflict (id) do nothing;
