-- =============================================================================
-- ASANKARY — Notification triggers (run on the NEW project)
-- =============================================================================
-- On every new order / message, POST to the on-db-change Edge Function, which
-- writes the in-app notification and sends the FCM push. Uses pg_net directly
-- (no dependency on the dashboard "Webhooks" feature / supabase_functions schema).
--
-- Run in: Supabase dashboard → SQL Editor → New query → paste all → Run.
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists pg_net;

-- Shared trigger function: posts {type, table, schema, record} to the Edge Function.
create or replace function public.notify_db_change()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://REPLACE_WITH_ASANKARY_SUPABASE_PROJECT_REF.supabase.co/functions/v1/on-db-change',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object(
      'type',   tg_op,
      'table',  tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

-- orders → notify the tenant/admin
drop trigger if exists notify_on_order on public.orders;
create trigger notify_on_order
  after insert on public.orders
  for each row execute function public.notify_db_change();

-- messages → notify the other chat participant
drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message
  after insert on public.messages
  for each row execute function public.notify_db_change();
