-- =============================================================================
-- Add the missing public.users.is_partner column
-- =============================================================================
-- Symptom
-- -------
--   Error: record "new" has no field "is_partner"
-- raised on ANY update to public.users (editing a profile, changing a phone,
-- saving an address), which surfaced in the app as a red error dialog.
--
-- Why
-- ---
-- RLS_HARDENING.sql installs prevent_privilege_escalation() as a BEFORE UPDATE
-- trigger on public.users, and it reads NEW.is_partner. But no schema file ever
-- creates that column — schema.sql, SUPABASE_SETUP.sql and the initial migration
-- all define only is_admin and is_blocked. plpgsql resolves NEW.<field> at
-- runtime, so the trigger installed cleanly and only failed when it first fired.
--
-- The app depends on the column too:
--   - AuthService maps isPartner: userData.is_partner
--   - tenantAdminService filters .or('is_admin.eq.true,role.eq.admin,is_partner.eq.true')
-- so adding it fixes the partner surfaces as well, not just the dialog.
--
-- Partners are "view-only" accounts: is_admin stays false, so defaulting every
-- existing row to false preserves current behaviour exactly.
-- =============================================================================

alter table public.users
  add column if not exists is_partner boolean not null default false;

comment on column public.users.is_partner is
  'View-only partner account: sees only products an owner shared with them. Distinct from is_admin, which stays false for partners.';

-- Mirrors idx_users_is_admin — partner lookups are always "the few true rows".
create index if not exists idx_users_is_partner
  on public.users(is_partner) where is_partner = true;
