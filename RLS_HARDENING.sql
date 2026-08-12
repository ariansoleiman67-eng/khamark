-- ============================================================================
-- ASANKARY — RLS hardening (Phase 1).  RUN ONCE in the Supabase SQL Editor.
--
-- Closes the critical hole: today every table is world-readable/writable
-- (permissive_all), so the public anon key can read all customer data and any
-- logged-in customer can self-promote to admin. This locks the high-value tables
-- to their owners while KEEPING the app working (verified against the app's
-- actual query patterns: login-gated checkout, own-row profile writes, admin
-- reads via is_admin()).
--
-- Safe to re-run. If anything in the app breaks after this, run RLS_ROLLBACK.sql
-- to restore the old behavior, and tell me what broke.
--
-- NOT touched here (still permissive, hardened in a later phase once the catalog
-- services write tenant_id): categories, brands, promo_codes, discounts, banners,
-- tenants, tenant_settings, global_settings, app_config, store_locations,
-- devices, live_tracking.
-- ============================================================================

-- ── helper: is the current request an admin? (SECURITY DEFINER bypasses RLS so
--    it doesn't recurse when used inside the users policy) ────────────────────
create or replace function public.is_admin() returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select coalesce((select is_admin from public.users where id = auth.uid()), false);
  $$;

-- ── block client-side privilege escalation on users ──────────────────────────
-- A client request carries a user JWT, so auth.uid() is NOT null. Edge Functions
-- (service_role) and the SQL editor run with auth.uid() = null and are unaffected,
-- so the proper server paths (verifyAdminActionPassword, create_admin_account,
-- manual SQL) can still change these fields.
create or replace function public.prevent_privilege_escalation() returns trigger
  language plpgsql security definer
  set search_path = public
  as $$
  begin
    if auth.uid() is not null then
      if NEW.is_admin   is distinct from OLD.is_admin
      or NEW.role       is distinct from OLD.role
      or NEW.is_partner is distinct from OLD.is_partner
      or NEW.is_blocked is distinct from OLD.is_blocked then
        raise exception 'Not allowed to modify privilege fields from the client';
      end if;
    end if;
    return NEW;
  end;
  $$;
drop trigger if exists trg_prevent_privilege_escalation on public.users;
create trigger trg_prevent_privilege_escalation
  before update on public.users
  for each row execute function public.prevent_privilege_escalation();

-- ── USERS: read/write your own row; admins may read everyone. No client delete;
--    priv-field changes are blocked by the trigger above. ─────────────────────
drop policy if exists "permissive_all"      on public.users;
drop policy if exists "users_self_select"   on public.users;
drop policy if exists "users_admin_select"  on public.users;
drop policy if exists "users_self_insert"   on public.users;
drop policy if exists "users_self_update"   on public.users;
create policy "users_self_select"  on public.users for select using (id = auth.uid());
create policy "users_admin_select" on public.users for select using (public.is_admin());
create policy "users_self_insert"  on public.users for insert with check (id = auth.uid());
create policy "users_self_update"  on public.users for update using (id = auth.uid()) with check (id = auth.uid());

-- ── PARTS (products): anyone reads active products; only the owning tenant reads
--    its inactive ones and writes. (addProduct injects tenant_id = admin uid) ──
drop policy if exists "permissive_all" on public.parts;
drop policy if exists "parts_read"     on public.parts;
drop policy if exists "parts_write"    on public.parts;
create policy "parts_read"  on public.parts for select using (is_active or tenant_id = auth.uid());
create policy "parts_write" on public.parts for all
  using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

-- ── ORDERS: a customer sees/creates/updates their own; the tenant sees/updates/
--    deletes orders placed to them. Checkout is login-gated (user_id = auth.uid). ─
drop policy if exists "permissive_all" on public.orders;
drop policy if exists "orders_select"  on public.orders;
drop policy if exists "orders_insert"  on public.orders;
drop policy if exists "orders_update"  on public.orders;
drop policy if exists "orders_delete"  on public.orders;
create policy "orders_select" on public.orders for select using (user_id = auth.uid() or tenant_id = auth.uid());
create policy "orders_insert" on public.orders for insert with check (user_id = auth.uid());
create policy "orders_update" on public.orders for update using (user_id = auth.uid() or tenant_id = auth.uid());
create policy "orders_delete" on public.orders for delete using (tenant_id = auth.uid());

-- ── CARTS: cart PK = the user's id. ──────────────────────────────────────────
drop policy if exists "permissive_all" on public.carts;
drop policy if exists "carts_self"     on public.carts;
create policy "carts_self" on public.carts for all using (id = auth.uid()) with check (id = auth.uid());

-- ── ADDRESSES: strictly per-user. ────────────────────────────────────────────
drop policy if exists "permissive_all"  on public.addresses;
drop policy if exists "addresses_self"  on public.addresses;
create policy "addresses_self" on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── NOTIFICATIONS: a user reads/updates their own; admins may create for anyone
--    (the in-app notification blast inserts one row per target user). ──────────
drop policy if exists "permissive_all"     on public.notifications;
drop policy if exists "notifications_self"  on public.notifications;
create policy "notifications_self" on public.notifications for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── PUSH_TOKENS: per-user. ───────────────────────────────────────────────────
drop policy if exists "permissive_all"    on public.push_tokens;
drop policy if exists "push_tokens_self"  on public.push_tokens;
create policy "push_tokens_self" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── CONVERSATIONS / MESSAGES: only the participants (customer, admin, tenant). ─
drop policy if exists "permissive_all"     on public.conversations;
drop policy if exists "conv_participants"  on public.conversations;
create policy "conv_participants" on public.conversations for all
  using (user_id = auth.uid() or admin_id = auth.uid() or tenant_id = auth.uid())
  with check (user_id = auth.uid() or admin_id = auth.uid() or tenant_id = auth.uid());

drop policy if exists "permissive_all"   on public.messages;
drop policy if exists "msg_participants" on public.messages;
create policy "msg_participants" on public.messages for all
  using (exists (select 1 from public.conversations c where c.id = conversation_id
                 and (c.user_id = auth.uid() or c.admin_id = auth.uid() or c.tenant_id = auth.uid())))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id
                 and (c.user_id = auth.uid() or c.admin_id = auth.uid() or c.tenant_id = auth.uid())));

-- Done. Verify: a logged-OUT anon read of users must now return NOTHING:
--   select * from public.users;   -- (as anon) → 0 rows
