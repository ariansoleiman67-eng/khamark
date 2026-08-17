-- =============================================================================
-- Stop the public key reading parts.purchase_price
-- =============================================================================
-- productService.ts:100-109 states that the public role reads every column of
-- `parts` EXCEPT purchase_price, and its explicit LIST_COLUMNS / DETAIL_COLUMNS
-- lists exist solely to satisfy that grant. The grant was never actually applied
-- to this database. Verified 2026-08-18 using the app's own publishable key --
-- which ships inside the APK and can be extracted from it -- that
-- `select=purchase_price` returned the shop's cost for every product, i.e. the
-- margin on the whole catalogue was readable by anyone.
--
-- Postgres cannot express "every column except one", so the table-level grant is
-- revoked and every other column is granted by name. That makes `select('*')`
-- fail for the public role, which is why ChatScreen's star select was replaced
-- with a named column list in the same change. The two customer-facing query
-- paths were re-checked against the live database with the publishable key after
-- this ran: the list query and the product-detail query both still return 200.
--
-- `authenticated` deliberately keeps its table-level grant: CheckoutScreen
-- batch-fetches purchase_price while signed in, to stamp the cost onto the order
-- for profit reporting. A signed-in account can therefore still read cost.
-- Closing that too means moving the cost lookup server-side, which is a larger
-- change and is NOT done here.
--
-- Rollback:  grant select on public.parts to anon;
-- =============================================================================

revoke select on public.parts from anon;

grant select (
  id, name, name_ar, name_ku, part_number, category, category_ar, category_ku,
  price_usd, price_iqd, stock_qty, status, description, description_ar,
  description_ku, is_featured, is_active, brand, image_urls, compatible_models,
  variations, color_variations, price_tiers, shipping_rates, specifications,
  weight, video_url, extra_data, tenant_id, created_at, updated_at,
  vip_price_usd, compare_at_price_usd, storage_options, shipping_cost,
  historical_stock_qty, initial_stock, sort_order, warranty, sku, barcode,
  dimensions, condition
) on public.parts to anon;

-- Verify: this must list every column except purchase_price -------------------
select string_agg(column_name, ', ' order by column_name) as anon_readable
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'parts'
  and grantee = 'anon' and privilege_type = 'SELECT';
