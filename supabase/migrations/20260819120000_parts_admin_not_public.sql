-- =============================================================================
-- parts_admin must not be reachable by the public key
-- =============================================================================
-- 20260819090000 granted the view to `authenticated` and said nothing about
-- `anon` -- but Supabase ships default privileges that grant every new table and
-- view in `public` to both roles, so the grant it did NOT write was applied
-- anyway. Probed with the app's publishable key immediately after that migration
-- ran: `GET /rest/v1/parts_admin?select=id,purchase_price` returned HTTP 200.
--
-- NO COST LEAKED. The view's CASE gate holds for an anonymous caller -- auth.uid()
-- is NULL, so none of the three arms match and purchase_price comes back NULL,
-- which the same probe confirmed. And every other column in the view is one anon
-- can already read straight from `parts`. So this is tidying, not a breach.
--
-- It is still worth doing. A view whose whole purpose is "the back office reads
-- this" should not answer the public key at all: the next person to add a column
-- to it should not have to re-derive that an anonymous caller is looking.
--
-- Rollback:  grant select on public.parts_admin to anon;
-- =============================================================================

revoke all on public.parts_admin from anon;

-- Verify: expect `authenticated` only.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'parts_admin'
order by grantee, privilege_type;
