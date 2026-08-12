-- ACCOUNT DELETION READINESS CHECK  (read-only — changes nothing)
--
-- WHY THIS MATTERS
-- Guideline 5.1.1(v): an app that lets people create an account must let them delete
-- it from inside the app. App Review tests this deliberately, on every submission.
--
-- The app's Delete Account button calls one database function, `delete_user`
-- (src/contexts/AuthContext.tsx:251). That function exists in this repo only as an
-- un-applied migration file — supabase/migrations/20260727130000_delete_user_rpc.sql.
-- There is no CI, no GitHub Actions directory and no migrate script in package.json
-- that would have applied it, and nothing in the project notes records it being run
-- by hand. If it was never applied, the reviewer taps Delete Account and gets a raw
-- Postgres error in English, which is an automatic rejection.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- One row comes back. Send me the whole row.

select jsonb_pretty(jsonb_build_object(

  -- Does the function exist at all?
  'delete_user_exists', exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'delete_user'
      and n.nspname = 'public'
  ),

  -- Its exact signature(s), so we know the app is calling it correctly.
  'signatures', coalesce((
    select jsonb_agg(jsonb_build_object(
      'args', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      -- SECURITY DEFINER is required: the function has to reach auth.users, which a
      -- normal signed-in role cannot touch.
      'security_definer', p.prosecdef
    ))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'delete_user' and n.nspname = 'public'
  ), '[]'::jsonb),

  -- A signed-in user must be able to EXECUTE it, or the call fails with a
  -- permission error even when the function is present.
  'executable_by_authenticated', coalesce((
    select bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'delete_user' and n.nspname = 'public'
  ), false),

  -- Same question for the anon role, purely informational.
  'executable_by_anon', coalesce((
    select bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'delete_user' and n.nspname = 'public'
  ), false),

  -- The app also calls these two elsewhere; two previously-shipped calls in this
  -- project turned out to reference functions that were never applied, so check them
  -- while we are here.
  'other_rpcs_present', (
    select coalesce(jsonb_object_agg(name, present), '{}'::jsonb)
    from (
      select x.name,
             exists (
               select 1 from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
               where p.proname = x.name and n.nspname = 'public'
             ) as present
      from (values ('get_admin_tenant'), ('is_admin'), ('delete_user_account')) as x(name)
    ) t
  ),

  -- WHICH ACCOUNT IS THE REVIEWER USING?
  -- delete_user deliberately refuses for an account that owns a store — correct, since
  -- deleting the owner would take the whole shop down — and returns the English string
  -- "Store owner accounts cannot be deleted from the app. Please contact support."
  -- If the demo login given to App Review is the owner account, the reviewer sees
  -- exactly that and cites 5.1.1(v). This lists the owner accounts to compare against
  -- the demo credentials in App Store Connect.
  'store_owner_user_ids', coalesce((
    select jsonb_agg(jsonb_build_object('tenant', t.store_name, 'owner_id', t.owner_id))
    from public.tenants t
  ), '[]'::jsonb),

  -- Sanity: how many tenants exist. The customer catalogue is not tenant-scoped, which
  -- is only safe while this is exactly one.
  'tenant_count', (select count(*) from public.tenants)

)) as account_deletion_readiness;
