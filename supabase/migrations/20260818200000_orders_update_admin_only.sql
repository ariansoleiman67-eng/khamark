-- =============================================================================
-- A customer could rewrite their own order
-- =============================================================================
-- `orders_update` was USING ((user_id = auth.uid()) OR (tenant_id = auth.uid()))
-- with NO `with check`. Postgres then reuses the USING expression as the check,
-- and that expression only asks WHOSE the row is — never WHAT changed. So any
-- signed-in customer could update their own order and set total_usd to 0, or
-- payment_status to 'paid', or status to 'delivered', and RLS would allow it.
--
-- Harmless while the shop was app-only and nothing shipped a customer-facing
-- order update. It stopped being harmless when asankare.com went live.
--
-- NO CLIENT CODE LOSES ANYTHING. Verified across both repos: every
-- `from('orders').update(...)` is an admin path — the app's tenantAdminService
-- (already scoped `.eq('tenant_id', ...)`) and the website's admin-orders.ts.
-- The two things a CUSTOMER may legitimately do already go through
-- SECURITY DEFINER RPCs that validate ownership and state server-side:
-- `cancel_my_order` and `delete_my_order`. OrderService.ts:428 even documents
-- the expectation that "RLS makes orders UPDATE admin-only" — which is what this
-- finally makes true.
--
-- Rollback:
--   alter policy orders_update on public.orders
--     using ((user_id = auth.uid()) or (tenant_id = auth.uid()));
-- =============================================================================

alter policy orders_update on public.orders
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

-- Verify --------------------------------------------------------------------
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'orders' and cmd = 'UPDATE';
