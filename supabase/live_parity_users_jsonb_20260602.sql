-- =============================================================================
-- ASANKARY — users private-jsonb parity patch
-- =============================================================================
-- Adds two jsonb columns the app already expects but neither Supabase project has:
--   * shipping_info        — ShippingInfoScreen + CheckoutScreen (shipping office)
--   * money_exchanger_info — CheckoutScreen (money-exchanger handoff)
--
-- Without these, ShippingInfoScreen.select('shipping_info') 400s (PGRST 42703).
--
-- RUN ON BOTH PROJECTS (SQL Editor → New query → paste → Run):
--   1. LIVE project pocdgbrpkuaqxgjcwsqk   (so the shipped app works now)
--   2. NEW  project krquvafnjuoxdcvzjjtg    (so it's there at cutover)
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.users add column if not exists shipping_info        jsonb;
alter table public.users add column if not exists money_exchanger_info jsonb;
