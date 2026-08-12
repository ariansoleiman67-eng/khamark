-- ============================================================================
-- ASANKARY — WEB READINESS DIAGNOSTIC  (READ-ONLY. Changes nothing.)
-- ============================================================================
-- Select ALL of this, press Run, and paste back the single cell it returns.
--
-- This is ONE statement on purpose. The Supabase SQL Editor only shows the
-- result of the LAST statement when you run several, so the earlier version of
-- this file silently threw away sections 1-6 and returned only the scale counts.
-- Everything now comes back as one JSON document.
--
-- It is a single SELECT. There is no INSERT, UPDATE, DELETE, ALTER, DROP or
-- CREATE anywhere in this file — it cannot modify your database or your data.
-- No customer data is returned: only schema metadata, policy definitions and
-- row COUNTS. No names, phones, emails or addresses.
--
-- ALREADY ANSWERED by the previous run (2026-08-09):
--   * scale: 14 products (all active), 10 categories, 9 brands, 1 shop,
--     12 customers, 1 order
--   * addresses: public.users has NO `addresses` column (error 42703 named it);
--     public.addresses is a real table and is where addresses live
-- ============================================================================

select jsonb_pretty(jsonb_build_object(

  -- 1. RLS per table. rls_enabled=false, or policy_count=0 with RLS on, or a
  --    policy whose USING is literally 'true', means the public anon key can
  --    read it. This is the section that decides whether the website can launch.
  'rls_by_table', (
    select coalesce(jsonb_agg(t order by t->>'table_name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'table_name',   c.relname,
               'rls_enabled',  c.relrowsecurity,
               'policy_count', count(p.polname)
             ) as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
      where n.nspname = 'public' and c.relkind = 'r'
      group by c.relname, c.relrowsecurity
    ) s
  ),

  -- 2. Every live policy with its USING / WITH CHECK. Anything reading 'true'
  --    is wide open to anyone holding the publishable key.
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table',      tablename,
             'policy',     policyname,
             'cmd',        cmd,
             'roles',      roles::text,
             'using',      coalesce(qual, '(none)'),
             'with_check', coalesce(with_check, '(none)')
           ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'public'
  ),

  -- 3. Tables with RLS enabled but ZERO policies (deny-all), vs tables with RLS
  --    DISABLED entirely (allow-all through the API). The second list is the
  --    dangerous one.
  'rls_disabled_tables', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  ),

  -- 4. Storage bucket policies — product images live in the `media` bucket.
  --    A write policy with no auth condition means anyone can delete images.
  'storage_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'policy',     policyname,
             'cmd',        cmd,
             'roles',      roles::text,
             'using',      coalesce(qual, '(none)'),
             'with_check', coalesce(with_check, '(none)')
           ) order by policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
  ),

  -- 5. Public functions: exact signatures and whether anon may execute them.
  --    The website needs account_id_for_phone and lookup_login_email before
  --    login. Function bodies are NOT selected.
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name',          p.proname,
             'args',          pg_get_function_identity_arguments(p.oid),
             'returns',       pg_get_function_result(p.oid),
             'security_definer', p.prosecdef,
             'anon_execute',  has_function_privilege('anon', p.oid, 'EXECUTE'),
             'authed_execute',has_function_privilege('authenticated', p.oid, 'EXECUTE')
           ) order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),

  -- 6. Realtime publication. A table absent here emits NO change events, so it
  --    cannot drive live updates on the website.
  'realtime_tables', (
    select coalesce(jsonb_agg(tablename order by tablename), '[]'::jsonb)
    from pg_publication_tables where pubname = 'supabase_realtime'
  ),

  -- 7. Live `parts` columns, so the website's types match reality not the repo.
  'parts_columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'column', column_name, 'type', data_type, 'nullable', is_nullable
           ) order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'parts'
  ),

  -- 8. Which tables exist at all, so nothing is assumed from the repo's SQL.
  'tables', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  )

)) as diagnostic;
