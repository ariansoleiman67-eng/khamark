-- =============================================================================
-- Every customer's notifications were readable — and writable — by anyone
-- =============================================================================
-- `notifications` carried TWO policies:
--   · notifications_self         using ((user_id = auth.uid()) or is_admin())
--   · "Allow ALL for notifications"  using (true), FOR ALL, TO public
--
-- RLS policies are OR'd, so the second one defeated the first completely. With
-- the app's publishable key — which ships inside the APK and can be extracted
-- from it — anyone could list every notification ever sent: the recipient's
-- user_id, the title and the body. Those carry order numbers, trade-in replies
-- and the shop's messages to named customers.
--
-- FOR ALL, not just select: the same policy allowed INSERT, UPDATE and DELETE.
-- A stranger could have written a notification to any customer, or silently
-- deleted the shop's.
--
-- Verified with the publishable key before this migration: three rows came back,
-- user_id and body included. After it: zero.
--
-- This is a survivor of the RLS_PHASE2_HARDENING pass that closed twelve other
-- wide-open tables; a sweep of every remaining `qual = true` policy found this
-- one and nothing else that is not a deliberately public storefront table
-- (brands, categories, banners, delivery_cities, store_locations, tenants,
-- global_settings, app_config, tenant_settings).
--
-- NOTHING LOSES ACCESS. Both clients read notifications only for the signed-in
-- user (app: NotificationContext / NotificationService; web: data/notifications
-- .ts, NotificationsLink), which notifications_self already allows, and the
-- on-db-change Edge Function writes with the service-role key, which bypasses
-- RLS entirely.
--
-- Rollback (do not, without reading the above):
--   create policy "Allow ALL for notifications" on public.notifications
--     for all to public using (true);
-- =============================================================================

drop policy if exists "Allow ALL for notifications" on public.notifications;

-- Verify: notifications_self should be the only policy left ------------------
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'notifications';
