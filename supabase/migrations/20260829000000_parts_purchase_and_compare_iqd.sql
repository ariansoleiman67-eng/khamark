-- =============================================================================
-- parts.purchase_price_iqd + parts.compare_at_price_iqd
-- =============================================================================
-- Completes the "author the price in the currency you actually paid or charge"
-- set. price_iqd (20260817120000) and vip_price_iqd (20260822000000) already
-- exist; these are the remaining two of the shop's four prices.
--
--   <col>_iqd IS NULL      -> that price is the USD one, exactly as before.
--   <col>_iqd IS NOT NULL  -> the price is authored in dinar. It is used
--                             verbatim, with no exchange-rate conversion and no
--                             250-IQD snap, and it OUTRANKS the USD column.
--
-- Why: the shop buys a lot of its stock in dinar. Forcing a dinar cost through
-- purchase_price (USD) meant the recorded cost — and therefore every profit
-- figure computed from it — moved every time somebody edited the exchange rate.
-- The same is true of a "was" price that was only ever quoted in dinar.
--
-- numeric(12,0) matches price_iqd and vip_price_iqd: dinar has no minor unit.
-- =============================================================================

alter table public.parts
  add column if not exists purchase_price_iqd  numeric(12,0),
  add column if not exists compare_at_price_iqd numeric(12,0),
  add column if not exists variation_costs      jsonb;

comment on column public.parts.purchase_price_iqd is
  'What the shop PAID, authored in IQD. NULL means the cost (if any) is purchase_price (USD). Same protection as purchase_price: never granted to anon/authenticated, readable only through parts_admin.';
comment on column public.parts.compare_at_price_iqd is
  'The "was" price authored in IQD. NULL means it is compare_at_price_usd. When set it is shown verbatim with no conversion.';
comment on column public.parts.variation_costs is
  'Per-option COST, keyed by variationId: {"<variationId>": {"usd": 80, "iqd": 150000}}. Lives here and NOT inside parts.variations because that column is granted to anon and read by every shopper — a cost stored there would be public. Same protection as purchase_price: never granted, readable only through parts_admin.';

-- -----------------------------------------------------------------------------
-- Grants: these two columns are NOT the same, and that is the whole point.
-- -----------------------------------------------------------------------------
-- 20260818100000 revoked table-level SELECT on parts from `anon` and
-- 20260819090000 did the same for `authenticated`, re-granting each column BY
-- NAME. A new column therefore starts with no read privilege at all.
--
--   compare_at_price_iqd IS a shopper-facing price — it is the struck-through
--   number on the product card — so it is granted, exactly as
--   compare_at_price_usd already is.
--
--   purchase_price_iqd is the shop's COST. It is deliberately NOT granted. It is
--   the dinar twin of purchase_price, which 20260819090000 exists to hide, and
--   granting it here would hand every shopper the margin on every product
--   through the back door. It is reachable only through parts_admin below, under
--   the same owner/admin/co-admin test.
--
--   variation_costs is the per-OPTION cost. It exists as its own column for
--   exactly this reason: parts.variations and parts.color_variations ARE granted
--   to anon — every shopper's catalogue query selects them to render the size and
--   colour prices — so a per-option cost stored inside those arrays would be
--   published to the world. It is never granted, like purchase_price.
grant select (compare_at_price_iqd) on public.parts to anon, authenticated;

-- -----------------------------------------------------------------------------
-- parts_admin has to carry both.
-- -----------------------------------------------------------------------------
-- The view (last rebuilt in 20260822000000) enumerates its columns by name, so a
-- column added to the table does not appear in it. The back office reads
-- products through this view: without this the admin form would load every
-- product with an empty dinar cost and silently blank it on the next save.
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
  p.vip_price_iqd,
  -- APPENDED, deliberately, and in this order. CREATE OR REPLACE VIEW may only
  -- add columns at the END of the list: it cannot insert, reorder or rename
  -- existing ones, and Postgres rejects the whole statement if you try ("cannot
  -- change name of view column"). Putting these next to the columns they belong
  -- with reads better and does not run. The view is only ever selected by name.
  --
  -- purchase_price_iqd repeats the CASE verbatim rather than deriving from the
  -- masked purchase_price above: they are independent values (a product may have
  -- one and not the other), and the mask must be applied to the RAW column.
  case
    when p.tenant_id = auth.uid() then p.purchase_price_iqd
    when coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false)
      then p.purchase_price_iqd
    when jsonb_typeof(p.extra_data -> 'coAdminIds') = 'array'
     and (p.extra_data -> 'coAdminIds') @> to_jsonb(auth.uid()::text)
      then p.purchase_price_iqd
    else null
  end as purchase_price_iqd,
  p.compare_at_price_iqd,
  -- Masked exactly like purchase_price above: the per-option cost is the same
  -- secret, keyed by option instead of by product.
  case
    when p.tenant_id = auth.uid() then p.variation_costs
    when coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false)
      then p.variation_costs
    when jsonb_typeof(p.extra_data -> 'coAdminIds') = 'array'
     and (p.extra_data -> 'coAdminIds') @> to_jsonb(auth.uid()::text)
      then p.variation_costs
    else null
  end as variation_costs
from public.parts p;

-- Re-assert read-only. 20260819130000 exists because this view, being definer,
-- auto-updatable and auto-granted, accepted UPDATE and DELETE that bypassed RLS
-- on parts entirely. Restating the revoke here costs nothing and means the hole
-- cannot come back through a future recreate written from this file as template.
revoke all on public.parts_admin from anon, authenticated;
grant select on public.parts_admin to authenticated;

-- -----------------------------------------------------------------------------
-- The order trigger has to stamp the dinar cost too.
-- -----------------------------------------------------------------------------
-- orders_stamp_cost (20260819090000) rewrites purchasePrice on every order line
-- from parts.purchase_price, server-side, because the client must not be trusted
-- with the shop's margin and must not be able to read it. A product whose cost is
-- authored in dinar has purchase_price NULL, so without this the line would be
-- stamped with no cost at all and every profit figure computed from that order
-- would silently read the sale as pure margin.
--
-- It stamps BOTH numbers rather than converting here. Converting would need the
-- exchange rate inside the trigger, and would freeze a dinar cost to whatever the
-- rate happened to be at checkout — the exact staleness that authoring in dinar
-- exists to avoid. The app converts at read time, as it already does for every
-- other dinar figure.
--
-- Everything else — the text-matched join, the exception handler, the revoke —
-- is unchanged from 20260819090000 and is repeated verbatim because CREATE OR
-- REPLACE FUNCTION replaces the whole body.
create or replace function public.orders_stamp_cost()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stamped jsonb;
begin
  if new.items is null or jsonb_typeof(new.items) <> 'array' then
    return new;
  end if;

  select jsonb_agg(
           case
             -- An OPTION's own cost wins over the product's. A colour or capacity
             -- the shop bought at a different price is a different cost, and the
             -- line names which one was sold.
             when v.v_usd is not null or v.v_iqd is not null
               then line || jsonb_build_object(
                      'purchasePrice',    v.v_usd,
                      'purchasePriceIQD', v.v_iqd
                    )
             -- Both keys are written even when one is null, deliberately: these
             -- are a pair and the dinar half outranks the dollar half, so a stale
             -- value left behind on the line would outrank the one just stamped.
             when line ? 'productId'
              and (p.purchase_price is not null or p.purchase_price_iqd is not null)
               then line || jsonb_build_object(
                      'purchasePrice',    p.purchase_price,
                      'purchasePriceIQD', p.purchase_price_iqd
                    )
             else line
           end
           order by ordinality
         )
    into stamped
    from jsonb_array_elements(new.items) with ordinality as t(line, ordinality)
    left join public.parts p
      -- MATCHED AS TEXT, NOT CAST TO uuid. `items` is jsonb the CLIENT writes, so
      -- productId is whatever it sent. `'abc'::uuid` raises, and a raising BEFORE
      -- INSERT trigger does not degrade -- it fails the whole order.
      on p.id::text = nullif(line->>'productId', '')
    -- The sold option, looked up in the product's own variations. Sizes and
    -- colours share one id space, so both arrays are searched.
    -- The sold option's cost, read from variation_costs — NOT from the variations
    -- array, which is public.
    left join lateral (
      select
        -- Guarded casts. These values came from an admin form through jsonb and
        -- should always be numeric, but a bad one must not raise: a raising
        -- BEFORE INSERT trigger fails the customer's order.
        case when c.entry->>'usd' ~ '^[0-9]+(\.[0-9]+)?$'
             then (c.entry->>'usd')::numeric end as v_usd,
        case when c.entry->>'iqd' ~ '^[0-9]+(\.[0-9]+)?$'
             then (c.entry->>'iqd')::numeric end as v_iqd
      from (
        select case
                 when jsonb_typeof(p.variation_costs) = 'object'
                  and nullif(line->>'variationId', '') is not null
                   then p.variation_costs -> (line->>'variationId')
                 else null
               end as entry
      ) c
      where jsonb_typeof(c.entry) = 'object'
    ) v on true;

  if stamped is not null then
    new.items := stamped;
  end if;

  return new;
exception
  when others then
    -- Cost is for the shop's own profit reporting. It must never be the reason a
    -- customer cannot place an order.
    raise warning 'orders_stamp_cost skipped: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.orders_stamp_cost() from public, anon, authenticated;

-- The trigger itself is unchanged and still points at this function name, so it
-- does not need recreating.

-- Verify ----------------------------------------------------------------------
-- 1. both columns exist with the right type
select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and table_name = 'parts'
  and column_name in ('purchase_price_iqd', 'compare_at_price_iqd', 'variation_costs')
order by column_name;

-- 2. THE IMPORTANT ONE. compare_at_price_iqd must appear for anon AND
--    authenticated; purchase_price_iqd must NOT appear at all. A purchase_price_iqd
--    row here is the cost leaking to shoppers.
select column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'parts'
  and column_name in ('purchase_price_iqd', 'compare_at_price_iqd', 'variation_costs')
order by column_name, grantee;

-- 3. the view carries both
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'parts_admin'
  and column_name like '%_iqd'
order by column_name;

-- 4. the view is still READ-ONLY: `authenticated` holds SELECT and nothing else,
--    `anon` does not appear at all.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'parts_admin'
group by grantee
order by grantee;

-- 5. the trigger still exists and points at the replaced function
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.orders'::regclass and not tgisinternal
order by tgname;
