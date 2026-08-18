-- =============================================================================
-- delete_my_order — the RPC the app has always called and that never existed
-- =============================================================================
-- OrderService.deleteOrder (src/services/OrderService.ts:439) calls
-- `supabase.rpc('delete_my_order', ...)`. The function was never created, so the
-- customer's "Delete Order" button has failed every time it was pressed, with
-- PostgREST's "Could not find the function" surfaced as a generic failure.
-- `orders_delete` is admin-only (tenant_id = auth.uid()), so a direct delete
-- would not have worked either — which is why the app routes through an RPC.
--
-- SCOPED TO CANCELLED ORDERS, deliberately. The button is only rendered for a
-- cancelled order (OrderDetailScreen.tsx:1048 `isCancelledStatus(order.status)`),
-- and that restriction is enforced here rather than trusted from the client. An
-- order that was actually fulfilled is the shop's sales record — it feeds
-- revenue, profit and stock history — and no customer should be able to erase
-- one. "Delete" here means "take this dead order off my list", which is all the
-- button was ever offering.
--
-- Status values match cancel_my_order's own vocabulary exactly, including
-- 'cancelled_by_user' and 'cancelled_by_store'; a mismatch here would make the
-- button fail for precisely the orders it is shown on.
-- =============================================================================

create or replace function public.delete_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  -- Lock the row so an admin status change cannot race the delete.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    -- Idempotent: a second press after a successful delete is not an error.
    return;
  end if;

  if v_order.user_id is distinct from auth.uid() then
    raise exception 'Not authorized to delete this order';
  end if;

  if v_order.status not in ('cancelled', 'cancelled_by_user', 'cancelled_by_store', 'rejected') then
    raise exception 'Only a cancelled order can be deleted';
  end if;

  delete from public.orders where id = p_order_id;
end;
$$;

revoke all on function public.delete_my_order(uuid) from public;
grant execute on function public.delete_my_order(uuid) to authenticated;

-- Verify --------------------------------------------------------------------
select proname, prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('cancel_my_order', 'delete_my_order')
order by proname;
