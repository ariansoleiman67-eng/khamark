-- =============================================================================
-- Keep tenants.id equal to tenants.owner_id
-- =============================================================================
-- The codebase carries two conventions for "the tenant id" and they are only
-- interchangeable by luck.
--
--   1. TenantContext resolves tenantId = user.uid, i.e. the admin's USER id,
--      which is tenants.owner_id (TenantContext.tsx:119, :185). Every
--      tenant_id COLUMN in the schema -- parts.tenant_id, orders.tenant_id,
--      trade_in_requests.tenant_id -- is a foreign key to users(id) and RLS
--      compares it to auth.uid(), so this is the identifier the data model uses.
--      tradeInService.ts:52-64 documents this at length.
--
--   2. About ten queries then use that same value as the tenants PRIMARY KEY:
--      `.eq('id', tenantId)` for business_info, operating hours, the chat's
--      tenant lookup and the admin dashboard. storeProfileService.getMyTenantId()
--      (:136-138) looks a row up BY owner_id and returns its `id`.
--
-- tenants.id is an independent uuid with `default gen_random_uuid()` and nothing
-- tying it to the owner. On this database there is exactly one tenant row and
-- its id happens to equal its owner_id, so both conventions resolve to the same
-- value and nothing has ever broken.
--
-- The first tenant row created with the default uuid would break convention 2
-- for that tenant: business info, operating hours, the dashboard and the chat's
-- store lookup would all query a primary key that does not exist, and quietly
-- return nothing. Nothing in the schema prevents that today.
--
-- Rather than rewrite ten call sites and risk changing behaviour, this makes the
-- coincidence a guarantee: a tenant's id IS its owner's user id, enforced on
-- insert and on any update of either column. Both conventions stay correct
-- permanently, and the existing row already satisfies it.
--
-- Rollback:  drop trigger tenants_id_equals_owner on public.tenants;
-- =============================================================================

create or replace function public.tenants_id_equals_owner()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is not null and new.id is distinct from new.owner_id then
    new.id := new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_id_equals_owner on public.tenants;
create trigger tenants_id_equals_owner
  before insert or update of id, owner_id on public.tenants
  for each row
  execute function public.tenants_id_equals_owner();

-- Verify ---------------------------------------------------------------------
select
  (select count(*) from public.tenants where id is distinct from owner_id) as mismatched_rows,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
    where c.relname = 'tenants' and t.tgname = 'tenants_id_equals_owner') as trigger_installed;
