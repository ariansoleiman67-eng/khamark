-- =============================================================================
-- URGENT: parts_admin accepted WRITES. Make it read-only.
-- =============================================================================
-- I introduced this in 20260819090000 and found it while verifying that
-- migration's grants. It is worse than the hole it was added to close.
--
-- `public.parts_admin` is a SECURITY DEFINER view (security_invoker = false, which
-- is the whole point -- it must read a column its caller cannot). It selects from
-- ONE table with NO WHERE clause, which makes it AUTO-UPDATABLE: Postgres will
-- happily route an UPDATE or DELETE on the view through to `public.parts`.
--
-- And Supabase's default privileges grant INSERT, UPDATE, DELETE and TRUNCATE on
-- every new view in `public` to `authenticated` -- grants nobody wrote. So writes
-- through the view were permitted, and being definer they ran as the view's OWNER,
-- which BYPASSES row-level security on `parts` entirely.
--
-- Net effect while this stood: any signed-in account could have rewritten the price
-- of, or deleted, ANY product in the catalogue -- not just their own tenant's.
--
-- Probed on the live database before writing this, with a filter matching no rows
-- so nothing was modified:
--   PATCH  /rest/v1/parts_admin?id=eq.<all-zero uuid>  -> HTTP 200 (permitted)
--   DELETE /rest/v1/parts_admin?id=eq.<all-zero uuid>  -> HTTP 200 (permitted)
-- A 403/42501 is what those should have returned, and is what they return after
-- this migration.
--
-- THE VIEW EXISTS ONLY TO BE READ. The back office still writes to `public.parts`
-- directly, where RLS and the tenant checks apply as they always did -- none of the
-- app's write paths go near this view.
--
-- Rollback: none wanted. If a write path through the view is ever needed, add an
-- explicit INSTEAD OF trigger that re-checks the tenant, never a bare grant.
-- =============================================================================

revoke all on public.parts_admin from anon, authenticated;
grant select on public.parts_admin to authenticated;

-- Verify: `authenticated` must hold SELECT and nothing else; `anon` must not appear.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'parts_admin'
  and grantee in ('anon', 'authenticated')
group by grantee
order by grantee;
