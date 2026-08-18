-- =============================================================================
-- Stop every SIGNED-IN account reading parts.purchase_price
-- =============================================================================
-- 20260818100000 closed this for `anon` and said so plainly in its own header:
-- `authenticated` deliberately kept its table-level grant, because CheckoutScreen
-- fetches cost while signed in to stamp it onto the order for profit reporting.
-- So the shop's margin on the whole catalogue stayed readable by anybody who
-- registered an account -- which is anybody.
--
-- This closes it. Three parts, in this order:
--
--   1. THE ORDER STAMPS ITS OWN COST, server-side, in a trigger. That removes the
--      only reason a customer's app ever needed to read cost at all.
--   2. `purchase_price` is revoked from `authenticated` and every other column is
--      granted back by name -- the same shape as the anon fix, because Postgres
--      cannot express "every column except one".
--   3. The back office reads through `public.parts_admin`, a SECURITY DEFINER view
--      that returns cost ONLY to the row's owner, to a partner the row is shared
--      with, or to a system admin, and NULL to everyone else.
--
-- Rollback:  grant select on public.parts to authenticated;
--            drop view public.parts_admin;
--            drop trigger orders_stamp_cost on public.orders;
-- =============================================================================

-- 1 -- THE TRIGGER ------------------------------------------------------------
-- `items` is jsonb the app writes: an array of line objects each carrying
-- productId and (until now) purchasePrice. The trigger rewrites purchasePrice on
-- every line from the parts row, so the number on the order is the shop's real
-- cost and not whatever the client sent. That also fixes a quieter problem: a
-- client-supplied cost is a client-supplied number, and profit reporting trusted
-- it.
--
-- SECURITY DEFINER so it can read a column the caller cannot. `set search_path`
-- because a definer function without one is how privilege escalation happens.
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
             when line ? 'productId' and p.purchase_price is not null
               then line || jsonb_build_object('purchasePrice', p.purchase_price)
             else line
           end
           order by ordinality
         )
    into stamped
    from jsonb_array_elements(new.items) with ordinality as t(line, ordinality)
    left join public.parts p
      -- MATCHED AS TEXT, NOT CAST TO uuid. `items` is jsonb the CLIENT writes, so
      -- productId is whatever it sent. `'abc'::uuid` raises, and a raising BEFORE
      -- INSERT trigger does not degrade -- it fails the whole order. A shop that
      -- cannot take an order because one cart line had a malformed id is a far
      -- worse outcome than a line without a cost stamped on it.
      on p.id::text = nullif(line->>'productId', '');

  if stamped is not null then
    new.items := stamped;
  end if;

  return new;
exception
  when others then
    -- Cost is for the shop's own profit reporting. It must never be the reason a
    -- customer cannot place an order, so anything unexpected here leaves `items`
    -- exactly as the client sent it and the order proceeds.
    raise warning 'orders_stamp_cost skipped: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.orders_stamp_cost() from public, anon, authenticated;

drop trigger if exists orders_stamp_cost on public.orders;
create trigger orders_stamp_cost
  before insert or update of items on public.orders
  for each row
  execute function public.orders_stamp_cost();

-- 2 -- THE VIEW ---------------------------------------------------------------
-- Cost is visible to the row's OWNER, to a PARTNER the product is shared with
-- (extra_data.coAdminIds is how tenantAdminService shares a product -- see its
-- note at :35), and to a SYSTEM ADMIN. Everyone else gets NULL in that column
-- rather than an error, so an admin screen that happens to be opened by a
-- non-admin degrades instead of breaking.
--
-- security_invoker = false (the default, stated here because it is the whole
-- point): the view runs as its owner, which still holds the revoked privilege.
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
  end as purchase_price
from public.parts p;

grant select on public.parts_admin to authenticated;

-- 3 -- THE REVOKE -------------------------------------------------------------
revoke select on public.parts from authenticated;

grant select (
  id, name, name_ar, name_ku, part_number, category, category_ar, category_ku,
  price_usd, price_iqd, stock_qty, status, description, description_ar,
  description_ku, is_featured, is_active, brand, image_urls, compatible_models,
  variations, color_variations, price_tiers, shipping_rates, specifications,
  weight, video_url, extra_data, tenant_id, created_at, updated_at,
  vip_price_usd, compare_at_price_usd, storage_options, shipping_cost,
  historical_stock_qty, initial_stock, sort_order, warranty, sku, barcode,
  dimensions, condition
) on public.parts to authenticated;

-- Writes are unaffected: insert/update/delete privileges are separate from
-- select, and the app writes purchase_price when an admin edits a product.
grant insert, update, delete on public.parts to authenticated;

-- Verify ----------------------------------------------------------------------
-- Expect: purchase_price ABSENT from the first list, PRESENT in the second.
select 'authenticated can select' as check,
       string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'parts'
  and grantee = 'authenticated' and privilege_type = 'SELECT'
union all
select 'parts_admin exposes',
       string_agg(column_name, ', ' order by column_name)
from information_schema.columns
where table_schema = 'public' and table_name = 'parts_admin'
  and column_name in ('purchase_price', 'price_usd');
