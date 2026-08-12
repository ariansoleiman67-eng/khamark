-- ============================================================================
-- ASANKARY — RLS PHASE 2 HARDENING
-- ============================================================================
-- READ THIS BEFORE RUNNING. This file WRITES to your database (it drops and
-- recreates policies). It changes NO DATA — only who may read and write.
--
-- WHY: the live diagnostic (2026-08-09) showed RLS_HARDENING.sql WAS applied —
-- users, orders, carts, addresses, conversations, messages, push_tokens,
-- saved_cards and trade_in_requests are all correctly owner-scoped. Good.
--
-- BUT twelve tables still carry `permissive_all  USING (true) WITH CHECK (true)`
-- for role `public`, which includes `anon`. Anyone holding the publishable key
-- can READ AND WRITE them. That is survivable while the key only ships inside
-- app binaries. It is not survivable once a website puts the key in every
-- visitor's browser dev tools.
--
-- WHAT THIS CHANGES, and why it will NOT break the mobile app:
--   Every app write path to these tables runs while the user is LOGGED IN
--   (admin screens for catalogue/config; per-user id for devices). So public
--   READ is preserved wherever the app or website needs it, and WRITES are
--   narrowed to admins or to the owning user. Nothing the app does today
--   requires an anonymous write.
--
-- ORDER OF OPERATIONS
--   1. Run RLS_PHASE2_VERIFY.sql (bottom of this file, commented) BEFORE and
--      AFTER, and compare.
--   2. Run this file.
--   3. Open the mobile app and check: catalogue loads, banners show, a customer
--      can place an order, an admin can edit a product.
--   4. If anything breaks, RLS_PHASE2_ROLLBACK.sql restores the previous state.
--
-- NOT ADDRESSED HERE (deliberately — each needs its own decision):
--   * orders_update has USING but no WITH CHECK, so a customer can currently
--     rewrite their own order's total_usd. Fixing that properly needs a trigger
--     pinning the money columns, not a policy. Tracked separately.
--   * users_admin_select is `USING (is_admin())` with no tenant scoping, so any
--     admin can read every customer. Only one tenant exists today, so this is
--     latent rather than live.
--   * get_partner_product_sales is SECURITY DEFINER and anon-executable.
--   * No table is in the supabase_realtime publication, so live updates need
--     tables added before the website's realtime features can work.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A. PUBLIC CATALOGUE + CONFIG
--    The storefront (app AND website) must read these anonymously. Only admins
--    may write them. Previously: anyone could rewrite your storefront.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'banners', 'categories', 'brands', 'tenants', 'store_locations',
    'discounts', 'app_config', 'global_settings', 'tenant_settings'
  ] loop
    execute format('drop policy if exists "permissive_all" on public.%I', t);
    execute format('drop policy if exists "%s_public_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_admin_write" on public.%I', t, t);

    -- Anyone (including anon) may READ. This is what makes the storefront work.
    execute format(
      'create policy "%s_public_read" on public.%I for select using (true)', t, t);

    -- Only an admin may INSERT / UPDATE / DELETE.
    execute format(
      'create policy "%s_admin_write" on public.%I for all
         using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- B. PROMO CODES
--    Previously anyone could CREATE a discount code — a direct route to free
--    merchandise. The app reads the list to validate a code the customer types,
--    so SELECT stays public; only writing is locked down.
--
--    NOTE: public SELECT means every promo code is readable by anyone who looks.
--    That is unchanged from today. Closing it means moving validation into a
--    SECURITY DEFINER RPC, which changes app behaviour — a separate decision.
-- ----------------------------------------------------------------------------
drop policy if exists "permissive_all"        on public.promo_codes;
drop policy if exists "promo_public_read"     on public.promo_codes;
drop policy if exists "promo_admin_write"     on public.promo_codes;

create policy "promo_public_read" on public.promo_codes
  for select using (true);

create policy "promo_admin_write" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- C. DEVICES — push tokens keyed to user ids
--    Previously world-readable and world-writable: anyone could harvest every
--    customer's push token, or delete them all and silently kill notifications.
--    The app only ever touches the row for the signed-in user.
-- ----------------------------------------------------------------------------
drop policy if exists "permissive_all" on public.devices;
drop policy if exists "devices_self"   on public.devices;
drop policy if exists "devices_admin"  on public.devices;

create policy "devices_self" on public.devices
  for all using (uid = auth.uid()) with check (uid = auth.uid());

-- Admins need to fan out push notifications.
create policy "devices_admin" on public.devices
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- D. LIVE TRACKING — delivery GPS coordinates
--    Previously fully public: anyone could read a courier's real-time position,
--    or write false positions. Narrowed to signed-in users for read and admins
--    for write.
--
--    FOLLOW-UP: this should be scoped to the specific order's customer rather
--    than all authenticated users. That needs the table's column names, which
--    this file deliberately does not guess at.
-- ----------------------------------------------------------------------------
drop policy if exists "permissive_all"        on public.live_tracking;
drop policy if exists "tracking_authed_read"  on public.live_tracking;
drop policy if exists "tracking_admin_write"  on public.live_tracking;

create policy "tracking_authed_read" on public.live_tracking
  for select using (auth.uid() is not null);

create policy "tracking_admin_write" on public.live_tracking
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- E. STORAGE — the `media` bucket holds every product image
--    Previously: media_insert / media_update / media_delete had NO auth
--    condition whatsoever. Anyone holding the publishable key could overwrite
--    or DELETE every product photo, banner and category image you have.
--    STORAGE_SETUP.sql even carries a TODO saying to tighten exactly this.
--
--    Public READ is retained — product images must load for anonymous visitors.
--    Every upload in the app (admin product photos, avatars, chat attachments,
--    trade-in photos) happens while signed in, so requiring `authenticated`
--    breaks nothing.
-- ----------------------------------------------------------------------------
drop policy if exists "media_insert" on storage.objects;
drop policy if exists "media_update" on storage.objects;
drop policy if exists "media_delete" on storage.objects;
-- media_public_read is correct as-is and is left untouched.

create policy "media_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media');

create policy "media_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media') with check (bucket_id = 'media');

create policy "media_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media');

commit;


-- ============================================================================
-- VERIFY — run this after, and confirm no row reports `true` for anon write
-- ============================================================================
-- select tablename, policyname, cmd, roles::text,
--        coalesce(qual,'(none)') as using_expr,
--        coalesce(with_check,'(none)') as with_check_expr
-- from pg_policies
-- where schemaname in ('public','storage')
--   and (qual = 'true' or with_check = 'true')
-- order by tablename, policyname;
--
-- Expected after this migration: only the *_public_read / promo_public_read /
-- media_public_read SELECT policies appear, and every one of them is `for select`.
-- Any row showing cmd = ALL with `true` means something was missed.
-- ============================================================================
