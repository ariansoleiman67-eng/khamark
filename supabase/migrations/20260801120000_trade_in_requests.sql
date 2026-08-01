-- =============================================================================
-- Second-hand phones, phase 1: trade-in requests + product condition
-- =============================================================================

create table if not exists public.trade_in_requests (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.users(id) on delete cascade,
  -- Nullable ON PURPOSE, and never null at insert time: every phase-1 request is
  -- created by a signed-in customer. A null here only ever results from that
  -- customer later deleting their account, and the row must survive that — the
  -- shop may already have paid for the phone.
  user_id           uuid references public.users(id) on delete set null,
  -- Snapshots, not joins. The record has to stay usable after account deletion,
  -- and a customer changing their number later must not silently rewrite the
  -- number attached to a deal already agreed.
  contact_name      text not null,
  contact_phone     text not null,
  device_brand      text not null,
  device_model      text not null,
  storage           text,
  questions_version integer not null default 1,
  answers           jsonb not null default '{}'::jsonb,
  photos            text[] not null default '{}',
  customer_note     text,
  status            text not null default 'submitted',
  offer_usd         numeric(10,2),
  offer_note        text,
  offer_type        text default 'cash',
  reviewed_by       uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  quoted_at         timestamptz,
  constraint trade_in_status_valid check (
    status in ('submitted','quoted','accepted','declined','completed','cancelled')
  ),
  constraint trade_in_offer_type_valid check (offer_type in ('cash','credit'))
);

create index if not exists idx_trade_in_tenant_status
  on public.trade_in_requests(tenant_id, status, created_at desc);
create index if not exists idx_trade_in_user
  on public.trade_in_requests(user_id, created_at desc);

alter table public.trade_in_requests enable row level security;

-- Customer: sees and creates only their own.
drop policy if exists trade_in_select_own on public.trade_in_requests;
create policy trade_in_select_own on public.trade_in_requests
  for select using (auth.uid() = user_id);

-- A customer may only ever create a PENDING request. Every field the shop owns —
-- the offer, who reviewed it, when it was quoted — must be null at insert, and the
-- status must be 'submitted'. Without this, an insert can fabricate an already
-- 'completed' deal at a self-chosen price directly in a shop's inbox.
drop policy if exists trade_in_insert_own on public.trade_in_requests;
create policy trade_in_insert_own on public.trade_in_requests
  for insert with check (
    auth.uid() = user_id
    and status = 'submitted'
    and offer_usd is null
    and offer_note is null
    and reviewed_by is null
    and quoted_at is null
  );

-- Customer may only move their own request to a terminal answer. They must not be
-- able to edit offer_usd or push it to 'completed'.
drop policy if exists trade_in_update_own on public.trade_in_requests;
create policy trade_in_update_own on public.trade_in_requests
  for update
  using (auth.uid() = user_id and status in ('submitted','quoted'))
  with check (auth.uid() = user_id and status in ('accepted','declined','cancelled'));

-- WITH CHECK sees only the new row, so it cannot tell that a customer moved their
-- request to another shop or rewrote the offer. This trigger restores the columns
-- the shop owns whenever the caller is not that shop's owner.
create or replace function public.trade_in_freeze_shop_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null for service_role (Edge Functions) and the SQL editor. Those
  -- are the trusted server paths and must stay able to write the offer; triggers are
  -- not bypassed by BYPASSRLS, so without this exemption their writes would be
  -- silently reverted while still reporting success.
  if auth.uid() is not null and auth.uid() is distinct from old.tenant_id then
    new.tenant_id  := old.tenant_id;
    new.offer_usd  := old.offer_usd;
    new.offer_note := old.offer_note;
    new.offer_type := old.offer_type;
    new.reviewed_by := old.reviewed_by;
    new.quoted_at  := old.quoted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trade_in_freeze_shop_fields on public.trade_in_requests;
create trigger trg_trade_in_freeze_shop_fields
  before update on public.trade_in_requests
  for each row execute function public.trade_in_freeze_shop_fields();

-- Admin: full access to their own shop's rows only.
--
-- `public.users` has NO tenant_id column. Across this schema tenant_id points at
-- users(id) and the owner admin IS the tenant — see the header comment in
-- 20260101000000_initial_schema.sql. Comparing tenant_id to auth.uid() is the
-- tenant half of the check.
--
-- The is_admin half is not redundant. Permissive policies OR together, so without
-- it any customer who set tenant_id to their own uid would fall under this policy
-- and inherit the `for all` grant on their own row — including DELETE and an
-- unrestricted status.
--
-- Co-admins are deliberately not covered: this schema has no tenant-level admin
-- link table. Sharing is per-product via extra_data.coAdminIds, which cannot
-- authorise a trade-in request. Only the shop owner reviews trade-ins.
drop policy if exists trade_in_admin_all on public.trade_in_requests;
create policy trade_in_admin_all on public.trade_in_requests
  for all
  using (
    trade_in_requests.tenant_id = auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true)
  )
  with check (
    trade_in_requests.tenant_id = auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true)
  );

drop trigger if exists trg_trade_in_updated on public.trade_in_requests;
create trigger trg_trade_in_updated
  before update on public.trade_in_requests
  for each row execute function public.set_updated_at();

-- Product condition. `Product.condition` already exists in src/types/index.ts but
-- was never persisted, which is why the product page's Condition card always read
-- "Available" and was removed on 2026-07-31.
alter table public.parts
  add column if not exists condition text not null default 'new';

alter table public.parts
  drop constraint if exists parts_condition_valid;
alter table public.parts
  add constraint parts_condition_valid check (condition in ('new','used','refurbished'));
