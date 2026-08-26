-- =============================================================================
-- parts.vip_price_iqd — a VIP selling price authored directly in IQD
-- =============================================================================
-- Companion to parts.price_iqd (20260817120000), and the same convention:
--
--   vip_price_iqd IS NULL  -> the VIP price, if any, is the USD one in
--                             vip_price_usd, exactly as before.
--   vip_price_iqd NOT NULL -> the VIP price is authored in dinar. This exact
--                             figure is charged to a VIP with no exchange-rate
--                             conversion and no 250-IQD snap, and it OUTRANKS
--                             vip_price_usd if both are set.
--
-- Why this is needed: the shop buys some stock in dinar. Its VIP price for that
-- stock is a dinar figure too, and forcing it through vip_price_usd meant the
-- number a VIP saw moved every time the exchange rate was edited.
--
-- numeric(12,0) matches price_iqd: dinar has no minor unit.
--
-- THE GRANTS BELOW ARE NOT OPTIONAL. 20260818100000 revoked table-level SELECT
-- on parts from `anon` and 20260819090000 did the same for `authenticated`,
-- re-granting each column BY NAME. A new column therefore starts with no read
-- privilege at all, and every catalogue query that lists it would fail with
-- 42501 "permission denied" — for signed-out shoppers first.
--
-- vip_price_usd is already readable by anon and authenticated (see those two
-- migrations), so vip_price_iqd carries no more exposure than what is already
-- public. Which shopper is actually SHOWN a VIP price is an app decision, not a
-- grant decision, and that has not changed.
-- =============================================================================

alter table public.parts
  add column if not exists vip_price_iqd numeric(12,0);

comment on column public.parts.vip_price_iqd is
  'VIP price authored in IQD. NULL means the VIP price (if any) is vip_price_usd. When set it outranks vip_price_usd, is shown to VIPs verbatim with no exchange-rate conversion and no 250-IQD rounding.';

grant select (vip_price_iqd) on public.parts to anon, authenticated;

-- -----------------------------------------------------------------------------
-- parts_admin has to carry it too.
-- -----------------------------------------------------------------------------
-- The view (20260819090000) enumerates its columns by name, so a column added to
-- the table does not appear in it. The back office reads products through this
-- view, so without this the admin form would load every product with an empty
-- VIP dinar price and silently blank it on the next save.
--
-- security_invoker = false is restated deliberately: the view exists to read
-- purchase_price, which its caller cannot select directly.
create or replace view public.parts_admin
with (security_invoker = false) as
select
  p.id, p.name, p.name_ar, p.name_ku, p.part_number, p.category, p.category_ar,
  p.category_ku, p.price_usd, p.price_iqd, p.stock_qty, p.status, p.description,
  p.description_ar, p.description_ku, p.is_featured, p.is_active, p.brand,
  p.image_urls, p.compatible_models, p.variations, p.color_variations,
  p.price_tiers, p.shipping_rates, p.specifications, p.weight, p.video_url,
  p.extra_data, p.tenant_id, p.created_at, p.updated_at, p.vip_price_usd,
  p.compare_at_price_usd, p.storage_options, p.shipping_cost,
  p.historical_stock_qty, p.initial_stock, p.sort_order, p.warranty, p.sku,
  p.barcode, p.dimensions, p.condition,
  case
    when p.tenant_id = auth.uid() then p.purchase_price
    when coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false)
      then p.purchase_price
    when jsonb_typeof(p.extra_data -> 'coAdminIds') = 'array'
     and (p.extra_data -> 'coAdminIds') @> to_jsonb(auth.uid()::text)
      then p.purchase_price
    else null
  end as purchase_price,
  -- APPENDED, deliberately. CREATE OR REPLACE VIEW may only add columns at the
  -- END of the list: it cannot insert, reorder or rename existing ones, and
  -- Postgres rejects the whole statement if you try ("cannot change name of view
  -- column"). Putting vip_price_iqd next to vip_price_usd where it belongs
  -- reads better and does not run. The view is only ever selected by name, so
  -- position is cosmetic.
  p.vip_price_iqd
from public.parts p;

-- Re-assert read-only. 20260819130000 exists because this view, being definer,
-- auto-updatable and auto-granted, accepted UPDATE and DELETE that bypassed RLS
-- on parts entirely. Restating the revoke here costs nothing and means the hole
-- cannot come back through a future recreate that someone writes from this file
-- as the template.
revoke all on public.parts_admin from anon, authenticated;
grant select on public.parts_admin to authenticated;

-- Verify ----------------------------------------------------------------------
-- 1. the column exists with the right type
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'parts' and column_name = 'vip_price_iqd';

-- 2. both roles can read it (each must appear exactly once)
select grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'parts'
  and column_name = 'vip_price_iqd'
order by grantee;

-- 3. the view carries it
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'parts_admin'
  and column_name in ('vip_price_usd', 'vip_price_iqd')
order by column_name;

-- 4. the view is still READ-ONLY: `authenticated` holds SELECT and nothing else,
--    `anon` does not appear at all. Any INSERT/UPDATE/DELETE row here is the
--    20260819130000 hole reopening.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'parts_admin'
group by grantee
order by grantee;
