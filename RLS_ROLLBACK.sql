-- ============================================================================
-- ASANKARY — UNDO RLS_HARDENING.sql. Run this ONLY if the app broke after
-- hardening. It restores the original permissive_all behavior on the locked
-- tables (and drops the escalation trigger), returning to the pre-hardening
-- state. Then tell me exactly what broke so I can fix the specific policy.
-- ============================================================================

drop trigger if exists trg_prevent_privilege_escalation on public.users;

-- users
drop policy if exists "users_self_select"   on public.users;
drop policy if exists "users_admin_select"  on public.users;
drop policy if exists "users_self_insert"   on public.users;
drop policy if exists "users_self_update"   on public.users;
create policy "permissive_all" on public.users for all using (true) with check (true);

-- parts
drop policy if exists "parts_read"  on public.parts;
drop policy if exists "parts_write" on public.parts;
create policy "permissive_all" on public.parts for all using (true) with check (true);

-- orders
drop policy if exists "orders_select" on public.orders;
drop policy if exists "orders_insert" on public.orders;
drop policy if exists "orders_update" on public.orders;
drop policy if exists "orders_delete" on public.orders;
create policy "permissive_all" on public.orders for all using (true) with check (true);

-- carts
drop policy if exists "carts_self" on public.carts;
create policy "permissive_all" on public.carts for all using (true) with check (true);

-- addresses
drop policy if exists "addresses_self" on public.addresses;
create policy "permissive_all" on public.addresses for all using (true) with check (true);

-- notifications
drop policy if exists "notifications_self" on public.notifications;
create policy "permissive_all" on public.notifications for all using (true) with check (true);

-- push_tokens
drop policy if exists "push_tokens_self" on public.push_tokens;
create policy "permissive_all" on public.push_tokens for all using (true) with check (true);

-- conversations / messages
drop policy if exists "conv_participants" on public.conversations;
create policy "permissive_all" on public.conversations for all using (true) with check (true);
drop policy if exists "msg_participants" on public.messages;
create policy "permissive_all" on public.messages for all using (true) with check (true);
