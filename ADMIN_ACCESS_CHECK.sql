-- ============================================================================
-- ASANKARY — ADMIN ACCESS CHECK  (READ-ONLY. Changes nothing.)
-- ============================================================================
-- Select all, Run, paste back the single cell.
-- One SELECT. No writes. No names, emails, phones or addresses are returned —
-- user ids are truncated to their first 8 characters purely so we can match
-- rows to each other.
--
-- WHY: RLS_PHASE2_HARDENING.sql gates writes to banners/categories/brands/
-- tenants/store_locations/discounts/app_config/global_settings/tenant_settings/
-- promo_codes behind public.is_admin(), which is:
--     select coalesce((select is_admin from public.users where id = auth.uid()), false)
-- If the account you administer the shop with does NOT have users.is_admin = true,
-- those writes now fail where they previously succeeded — because before the
-- hardening they were open to literally everyone.
--
-- Note: product edits go through the `parts` table, whose policy is
--     parts_write  USING/WITH CHECK (tenant_id = auth.uid())
-- which this migration did NOT touch. So this check also verifies that the
-- products' tenant_id actually matches an admin account.
-- ============================================================================

select jsonb_pretty(jsonb_build_object(

  -- Accounts carrying elevated flags. If is_admin is false everywhere, that is
  -- almost certainly the cause.
  'privileged_accounts', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id_prefix', left(id::text, 8),
             'is_admin',  is_admin,
             'is_partner', is_partner,
             'role',      role,
             'is_blocked', is_blocked
           ) order by id), '[]'::jsonb)
    from public.users
    where is_admin = true or is_partner = true or role <> 'customer'
  ),

  'admin_count',   (select count(*) from public.users where is_admin = true),
  'partner_count', (select count(*) from public.users where is_partner = true),

  -- The shop row: tenants.owner_id is the account that owns the catalogue.
  'tenants', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tenant_id_prefix', left(id::text, 8),
             'owner_id_prefix',  left(owner_id::text, 8)
           )), '[]'::jsonb)
    from public.tenants
  ),

  -- Which account id the products are attributed to. parts_write requires
  -- auth.uid() to equal this, so whoever edits products must sign in as it.
  'parts_tenant_ids', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tenant_id_prefix', left(tenant_id::text, 8),
             'product_count',    n
           ) order by n desc), '[]'::jsonb)
    from (select tenant_id, count(*) as n from public.parts group by tenant_id) s
  ),

  -- Does the parts owner actually have the admin flag? This is the join that
  -- matters: it must report is_admin = true for product edits AND catalogue
  -- writes to both work from the same login.
  'parts_owner_is_admin', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id_prefix', left(u.id::text, 8),
             'is_admin',  u.is_admin,
             'is_partner', u.is_partner
           )), '[]'::jsonb)
    from public.users u
    where u.id in (select distinct tenant_id from public.parts where tenant_id is not null)
  )

)) as admin_access;
