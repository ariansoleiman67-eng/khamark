-- =============================================================================
-- parts.price_iqd — a selling price authored directly in IQD
-- =============================================================================
-- The shop buys some stock in Iraqi dinar rather than dollars. Until now every
-- price in the app was a USD number and IQD existed only as a display transform:
-- price_usd x global_settings.data->>'exchangeRateIQD', then snapped to the
-- nearest 250 IQD by roundIQD(). For a product actually priced in dinar that is
-- wrong twice over — the figure moves whenever the rate is edited, and the 250
-- snap rewrites the exact number the shop typed.
--
-- CONVENTION: price_iqd IS NULL  -> priced in USD, exactly as before.
--             price_iqd NOT NULL -> priced in IQD. This figure is authoritative
--                                   and the exchange rate is NEVER applied to
--                                   it. The USD figure shown to a customer is
--                                   derived FROM it (price_iqd / rate).
--
-- price_usd is still written for such products, derived at save time, because
-- every cart total, report, sort and analytics sum in the app is USD arithmetic.
-- It is a derived convenience column for those paths — never the source of the
-- displayed IQD price.
--
-- numeric(12,0): dinar has no minor unit, and 12 digits leaves room well past
-- the largest phone price (a few million IQD).
-- =============================================================================

alter table public.parts
  add column if not exists price_iqd numeric(12,0);

comment on column public.parts.price_iqd is
  'Selling price authored in IQD. NULL means the product is priced in USD via price_usd. When set, this exact figure is shown to customers with no exchange-rate conversion and no 250-IQD rounding, and price_usd is derived from it.';

-- The live table currently grants SELECT at table level, so this is redundant
-- today. It is here so that if the column-level grant described in
-- productService.ts (public reads every column except purchase_price) is ever
-- actually applied, this column is already covered and the product screen does
-- not start failing for signed-out shoppers.
grant select (price_iqd) on public.parts to anon, authenticated;

-- Verify --------------------------------------------------------------------
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'parts' and column_name = 'price_iqd';
