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
