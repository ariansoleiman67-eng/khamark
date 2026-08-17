-- =============================================================================
-- orders.total_iqd — the exact dinar total that was charged
-- =============================================================================
-- Companion to parts.price_iqd (20260817120000). Every money column on `orders`
-- is USD, and the order screens render dinar as total_usd x orders.exchange_rate
-- snapped to the nearest 250. For an order containing a product priced in dinar
-- that re-derivation can land up to ~125 IQD away from the figure the customer
-- was shown and agreed to — and, worse, from the amount QiCard was asked to
-- charge, which is computed by the same multiplication.
--
-- So the dinar total is snapshotted at checkout instead of being recomputed:
--   NULL     -> no dinar-priced product in the order; convert total_usd exactly
--               as before. This is every existing order and most future ones.
--   NOT NULL -> the amount charged, in dinar. Display it verbatim.
--
-- Computed as: the dinar-priced lines summed in dinar, plus the remainder
-- (other lines, shipping, discount) converted once at the order's snapshotted
-- rate — so an order with no dinar line is byte-identical to today.
--
-- numeric(14,0): dinar has no minor unit, and 14 digits covers a wholesale
-- order far larger than this shop will ever take.
-- =============================================================================

alter table public.orders
  add column if not exists total_iqd numeric(14,0);

comment on column public.orders.total_iqd is
  'Exact IQD total charged, snapshotted at checkout. Set when the order contained a product priced in IQD, whose dinar figure must not be re-derived from total_usd x exchange_rate. NULL means convert total_usd as before.';

-- Verify --------------------------------------------------------------------
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'total_iqd';
