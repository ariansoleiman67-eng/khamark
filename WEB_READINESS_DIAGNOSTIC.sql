-- ============================================================================
-- ASANKARY — WEB READINESS DIAGNOSTIC  (READ-ONLY. Changes nothing.)
-- ============================================================================
-- Run this in the Supabase SQL Editor and paste the output back.
--
-- Every statement here is a SELECT. There is no INSERT, UPDATE, DELETE, ALTER,
-- DROP or CREATE anywhere in this file — it cannot modify your database or your
-- data. It exists because the repo genuinely cannot answer three questions, and
-- the website spec must not guess at them.
--
-- WHAT IT ANSWERS
--   1. Which RLS policies are ACTUALLY live (the repo's RLS_HARDENING.sql is
--      untracked, so we cannot tell from files whether it was ever applied).
--   2. Do addresses live in users.addresses (jsonb) or public.addresses (table)?
--   3. What are the real signatures/grants of the pre-login auth RPCs
--      (account_id_for_phone, lookup_login_email) that exist only in the live DB?
--
-- No customer data is returned — only schema metadata and row COUNTS.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. RLS: is it enabled per table, and how many policies does each table have?
--    A table with rls_enabled = false, or with a policy whose qual is 'true',
--    is readable by anyone holding the public anon key.
-- ----------------------------------------------------------------------------
select
  c.relname                                             as table_name,
  c.relrowsecurity                                      as rls_enabled,
  c.relforcerowsecurity                                 as rls_forced,
  count(p.polname)                                      as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relrowsecurity asc, policy_count asc, c.relname;


-- ----------------------------------------------------------------------------
-- 2. Every live policy, with its USING and WITH CHECK expressions.
--    Look for qual = 'true' (anyone can read) or with_check = 'true'
--    (anyone can write). Those are the ones that matter for a public website.
-- ----------------------------------------------------------------------------
select
  tablename,
  policyname,
  cmd                              as command,
  roles::text                      as applies_to_roles,
  coalesce(qual, '(none)')         as using_expression,
  coalesce(with_check, '(none)')   as with_check_expression
from pg_policies
where schemaname = 'public'
order by
  case when qual = 'true' or with_check = 'true' then 0 else 1 end,
  tablename,
  policyname;


-- ----------------------------------------------------------------------------
-- 3. ADDRESSES: which storage is real? Both may exist; we need to know which
--    one actually holds data. Counts only — no addresses are returned.
-- ----------------------------------------------------------------------------
select
  'public.addresses table exists' as question,
  (to_regclass('public.addresses') is not null)::text as answer;

select
  'users.addresses column exists' as question,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'addresses'
  )::text as answer;

-- Row counts on each store (0 = unused). Safe: counts only.
select 'rows in public.addresses' as metric,
       (select count(*) from public.addresses)::text as value
where to_regclass('public.addresses') is not null;

select 'users rows with a non-empty addresses jsonb' as metric,
       (select count(*) from public.users
         where addresses is not null
           and jsonb_typeof(addresses) = 'array'
           and jsonb_array_length(addresses) > 0)::text as value
where exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'users' and column_name = 'addresses'
);


-- ----------------------------------------------------------------------------
-- 4. The pre-login auth RPCs the website must call from the browser.
--    We need the exact argument types, return type, and whether `anon` may
--    execute them. Function BODIES are not selected.
-- ----------------------------------------------------------------------------
select
  p.proname                                        as function_name,
  pg_get_function_identity_arguments(p.oid)        as arguments,
  pg_get_function_result(p.oid)                    as returns,
  p.prosecdef                                      as is_security_definer,
  has_function_privilege('anon',           p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated',  p.oid, 'EXECUTE') as authed_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;


-- ----------------------------------------------------------------------------
-- 5. Realtime: which tables actually publish change events?
--    A table absent here CANNOT drive live updates on the website — the
--    "changes in the app appear on the web instantly" promise depends on this.
-- ----------------------------------------------------------------------------
select
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;


-- ----------------------------------------------------------------------------
-- 6. Product catalogue shape — confirms parts columns actually present live,
--    so the website's generated types match reality rather than the repo.
-- ----------------------------------------------------------------------------
select
  column_name,
  data_type,
  is_nullable,
  coalesce(column_default, '(none)') as column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'parts'
order by ordinal_position;


-- ----------------------------------------------------------------------------
-- 7. Scale check — informs caching, pagination and whether search needs an
--    index. Counts only.
-- ----------------------------------------------------------------------------
select 'active products'  as metric, (select count(*) from public.parts where is_active)::text as value
union all
select 'total products',            (select count(*) from public.parts)::text
union all
select 'categories',                (select count(*) from public.categories)::text
union all
select 'brands',                    (select count(*) from public.brands)::text
union all
select 'shops (tenants)',           (select count(*) from public.tenants)::text
union all
select 'customers',                 (select count(*) from public.users)::text
union all
select 'orders',                    (select count(*) from public.orders)::text;
