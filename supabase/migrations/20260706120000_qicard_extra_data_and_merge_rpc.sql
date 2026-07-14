-- =============================================================================
-- QiCard: orders.extra_data column + jsonb_merge_extra_data RPC
-- =============================================================================
-- The QiCard edge functions (and OrderService) read/write orders.extra_data,
-- and create-qicard-payment merges its payment reference via the
-- jsonb_merge_extra_data(p_order_id, p_data) RPC. Neither was present in the
-- tracked schema (they only existed in an untracked backfill script), so on a
-- fresh Supabase project those writes would fail. This migration adds both,
-- idempotently.
-- =============================================================================

-- 1. Ensure the jsonb column exists on orders.
alter table public.orders
  add column if not exists extra_data jsonb;

-- 2. Shallow-merge helper used by create-qicard-payment to attach the QiCard
--    payment reference without clobbering other extra_data keys.
create or replace function public.jsonb_merge_extra_data(
  p_order_id uuid,
  p_data jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders
  set extra_data = coalesce(extra_data, '{}'::jsonb) || coalesce(p_data, '{}'::jsonb)
  where id = p_order_id;
$$;

-- This is a SECURITY DEFINER function with no per-row auth check, so it must NOT
-- be reachable from PostgREST clients (an anon/authenticated caller could
-- otherwise merge arbitrary JSON into ANY order → IDOR / data tampering). Its
-- only legitimate caller is the create-qicard-payment edge function, which runs
-- as service_role. An in-function auth.uid() check is NOT viable because the
-- service role has no auth.uid(); restricting EXECUTE is the correct control.
revoke all on function public.jsonb_merge_extra_data(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.jsonb_merge_extra_data(uuid, jsonb) to service_role;
