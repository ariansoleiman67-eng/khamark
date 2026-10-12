-- =============================================================================
-- Tell the customer when their order's status changes
-- =============================================================================
-- Until now nothing did. on-db-change was wired to INSERT only (new order ->
-- the shop), and neither updateOrderStatus (adminService, tenantAdminService)
-- sent anything. A customer could have their order confirmed, shipped and
-- delivered and hear nothing until they opened the app.
--
-- This fires on-db-change after an order's STATUS actually changes — from any
-- client: the app, the admin web, or SQL — which a client-side notify could not
-- promise. The payload carries only the order id: on-db-change re-reads the row
-- and builds the notification from it (see "THE PAYLOAD IS A POINTER" there),
-- and sends it once per order per status.
--
-- Wording, in en/ar/ku: supabase/functions/_shared/orderStatusCopy.ts.
-- Statuses that notify: confirmed, processing, shipped, delivered, cancelled,
-- cancelled_by_store. Not pending, not a customer cancelling their own order.
--
-- Requires the on-db-change version from this repo (deployed with
-- --no-verify-jwt), which understands { type: 'UPDATE', table: 'orders' }.
-- =============================================================================

create extension if not exists pg_net;

create or replace function public.notify_on_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  if new.status is distinct from old.status then
    perform net.http_post(
      url     := 'https://ucopzrdubjnyfprbaqus.supabase.co/functions/v1/on-db-change',
      body    := jsonb_build_object(
                   'type',   'UPDATE',
                   'table',  'orders',
                   'schema', 'public',
                   'record', jsonb_build_object('id', new.id),
                   'old_record', null
                 ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
exception when others then
  -- A notification is a nice-to-have; the status change is not. Never let a
  -- failed HTTP call roll back the shop's update.
  return new;
end;
$$;

revoke all on function public.notify_on_order_status() from public, anon, authenticated;

drop trigger if exists notify_on_order_status on public.orders;
create trigger notify_on_order_status
  after update of status on public.orders
  for each row
  execute function public.notify_on_order_status();

-- Verify ----------------------------------------------------------------------
select t.tgname as trigger_name, t.tgenabled as enabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relname = 'orders' and t.tgname like 'notify_on%';
