-- =============================================================================
-- Wire on-db-change: notifications for orders, messages and trade-ins
-- =============================================================================
-- The on-db-change Edge Function has been deployed and correct since it was
-- written, but NOTHING EVER CALLED IT. Its header told you to create Database
-- Webhooks in the dashboard; that was never possible on this project, because
-- Database Webhooks were never enabled and the `supabase_functions` schema does
-- not exist. Verified 2026-08-17: the only non-internal triggers on `orders` and
-- `messages` were set_updated_at and business guards.
--
-- The consequence was silence. No push and no in-app notification when a
-- customer placed an order, sent a message, or submitted a trade-in.
--
-- This calls the function through pg_net directly, which is what Database
-- Webhooks do internally, and sends the same payload shape so the function needs
-- no special-casing and would still work if webhooks were enabled later.
-- =============================================================================

create extension if not exists pg_net;

create or replace function public.notify_on_db_change()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url     := 'https://ucopzrdubjnyfprbaqus.supabase.co/functions/v1/on-db-change',
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  tg_table_name,
                 'schema', tg_table_schema,
                 'record', to_jsonb(new),
                 'old_record', null
               ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  -- A notification is a nice-to-have; an order, a message or a trade-in request
  -- is not. Never let a failed HTTP call roll back the customer's write.
  return new;
end;
$$;

-- Orders ----------------------------------------------------------------------
drop trigger if exists notify_on_order on public.orders;
create trigger notify_on_order
  after insert on public.orders
  for each row
  execute function public.notify_on_db_change();

-- Messages --------------------------------------------------------------------
-- Fires for BOTH directions: on-db-change notifies whichever participant did not
-- send the message, so the customer is told when the shop replies too. That is
-- why there is no sender_type filter here, unlike the ai_auto_reply trigger,
-- which deliberately only fires for customer messages.
drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message
  after insert on public.messages
  for each row
  execute function public.notify_on_db_change();

-- Trade-ins -------------------------------------------------------------------
drop trigger if exists notify_on_trade_in on public.trade_in_requests;
create trigger notify_on_trade_in
  after insert on public.trade_in_requests
  for each row
  execute function public.notify_on_db_change();

-- Verify ----------------------------------------------------------------------
select
  c.relname   as table_name,
  t.tgname    as trigger_name,
  t.tgenabled as enabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relname in ('orders', 'messages', 'trade_in_requests')
  and t.tgname like 'notify_%'
order by c.relname;
