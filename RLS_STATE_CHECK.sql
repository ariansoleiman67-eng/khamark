-- ============================================================================
-- ASANKARY — RLS STATE CHECK  (READ-ONLY. Changes nothing.)
-- ============================================================================
-- Select all, Run, paste back the single cell.
-- One SELECT. No INSERT/UPDATE/DELETE/ALTER/DROP/CREATE. No customer data.
--
-- Tells us which state the database is actually in right now:
--   verdict "HARDENED"   -> RLS_PHASE2_HARDENING.sql is in effect
--   verdict "OPEN"       -> the rollback is in effect (or hardening never ran)
--   verdict "MIXED"      -> partially applied; the detail lists what is open
-- ============================================================================

select jsonb_pretty(jsonb_build_object(

  'verdict', (
    case
      when (select count(*) from pg_policies
            where schemaname in ('public','storage')
              and (qual = 'true' or with_check = 'true')
              and cmd <> 'SELECT') = 0
      then 'HARDENED — no anonymous write remains'
      when (select count(*) from pg_policies
            where schemaname in ('public','storage')
              and policyname = 'permissive_all') >= 12
      then 'OPEN — permissive_all is back on the twelve tables'
      else 'MIXED — see anon_writable below'
    end
  ),

  -- Every policy that still allows an ANONYMOUS WRITE. This list must be empty
  -- before the website is deployed publicly.
  'anon_writable', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'schema', schemaname, 'table', tablename,
             'policy', policyname, 'cmd', cmd
           ) order by schemaname, tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname in ('public','storage')
      and (qual = 'true' or with_check = 'true')
      and cmd <> 'SELECT'
  ),

  -- Public SELECT policies are EXPECTED and fine — the storefront needs them.
  'public_readable', (
    select coalesce(jsonb_agg(tablename order by tablename), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and qual = 'true'
  ),

  -- Did the hardening's new policies land?
  'hardening_policies_present', (
    select coalesce(jsonb_agg(policyname order by policyname), '[]'::jsonb)
    from pg_policies
    where policyname like '%_admin_write'
       or policyname in ('promo_public_read','devices_self','tracking_authed_read')
  ),

  -- The storage bucket that holds every product image.
  'storage_media', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'policy', policyname, 'cmd', cmd, 'roles', roles::text,
             'using', coalesce(qual,'(none)'),
             'with_check', coalesce(with_check,'(none)')
           ) order by policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
  )

)) as rls_state;
