-- ============================================================================
-- ASANKARY — ROLLBACK for RLS_PHASE2_HARDENING.sql
-- ============================================================================
-- Run this ONLY if the mobile app breaks after the phase-2 hardening.
--
-- It restores the exact policy set the live diagnostic recorded on 2026-08-09:
-- `permissive_all USING (true) WITH CHECK (true)` on the twelve tables, and the
-- unconditional media_insert / media_update / media_delete storage policies.
--
-- WARNING: running this puts the database back into the state where ANYONE
-- holding the publishable key can read and write those tables, and can DELETE
-- every product image. That is tolerable only while the key exists solely
-- inside app binaries. The website MUST NOT be publicly deployed against a
-- database in this state.
--
-- If you need this file, please tell me WHICH screen broke and WHAT error it
-- showed — the fix is almost certainly a narrower policy on one table, not
-- reopening all twelve.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SAFETY CATCH — this file will REFUSE to run until you delete the line below.
--
-- It exists because on 2026-08-09 this rollback was run immediately after the
-- hardening, which silently undid it and left the database fully open. This
-- catch makes that impossible to do by accident: running the file as-is stops
-- with a clear error and changes nothing.
--
-- ONLY delete the next line if the mobile app is BROKEN and you need to undo
-- the hardening. If you are trying to SECURE the database, you want
-- RLS_PHASE2_HARDENING.sql instead — close this file.
-- ----------------------------------------------------------------------------
do $$ begin
  raise exception
    'ROLLBACK SAFETY CATCH: this reopens 12 tables and the media bucket to anonymous writes. Delete this do-block only if the app is broken and you intend to undo RLS_PHASE2_HARDENING.sql.';
end $$;

begin;

do $$
declare t text;
begin
  foreach t in array array[
    'banners', 'categories', 'brands', 'tenants', 'store_locations',
    'discounts', 'app_config', 'global_settings', 'tenant_settings'
  ] loop
    execute format('drop policy if exists "%s_public_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_admin_write" on public.%I', t, t);
    execute format('drop policy if exists "permissive_all" on public.%I', t);
    execute format(
      'create policy "permissive_all" on public.%I for all
         using (true) with check (true)', t);
  end loop;
end $$;

drop policy if exists "promo_public_read" on public.promo_codes;
drop policy if exists "promo_admin_write" on public.promo_codes;
drop policy if exists "permissive_all"    on public.promo_codes;
create policy "permissive_all" on public.promo_codes
  for all using (true) with check (true);

drop policy if exists "devices_self"   on public.devices;
drop policy if exists "devices_admin"  on public.devices;
drop policy if exists "permissive_all" on public.devices;
create policy "permissive_all" on public.devices
  for all using (true) with check (true);

drop policy if exists "tracking_authed_read" on public.live_tracking;
drop policy if exists "tracking_admin_write" on public.live_tracking;
drop policy if exists "permissive_all"       on public.live_tracking;
create policy "permissive_all" on public.live_tracking
  for all using (true) with check (true);

drop policy if exists "media_insert" on storage.objects;
drop policy if exists "media_update" on storage.objects;
drop policy if exists "media_delete" on storage.objects;

create policy "media_insert" on storage.objects
  for insert with check (bucket_id = 'media');
create policy "media_update" on storage.objects
  for update using (bucket_id = 'media');
create policy "media_delete" on storage.objects
  for delete using (bucket_id = 'media');

commit;
