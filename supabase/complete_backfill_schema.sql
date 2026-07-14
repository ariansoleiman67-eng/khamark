-- ============================================================================
-- Complete Firestore -> Supabase backfill: schema additions
-- Run ONCE in the Supabase SQL editor (project krquvafnjuoxdcvzjjtg) BEFORE
-- running firestore_complete_sync.js. Idempotent.
-- ============================================================================

-- 1. parts: fields that were dropped during the original migration.
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS sort_order            integer;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS shipping_cost         numeric(10,2);
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS historical_stock_qty  integer;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS initial_stock         integer;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS extra_data            jsonb;  -- lossless catch-all
-- (status was already added by restore_product_status_20260603.sql)

-- 1b. orders: catch-all for Firestore-only fields (statusHistory, shippingOfficeInfo,
--     moneyExchangerInfo, shippingLocked, amountPaid tracking, cancellation, etc.)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS extra_data jsonb;

-- 2. admin_action_logs: the admin audit trail (not migrated). Kept as plain
--    text ids (no FK) so the original Firebase UIDs are preserved losslessly.
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id              uuid primary key default gen_random_uuid(),
  admin_uid       text,
  action          text,
  target_user_id  text,
  details         jsonb,
  ip              text,
  created_at      timestamptz default now()
);

-- 3. tenants: store the invoice-settings subdoc as jsonb.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS invoice_settings jsonb;
