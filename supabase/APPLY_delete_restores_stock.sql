-- =============================================================================
-- RUN ME ONCE in Supabase → SQL Editor. Paste ALL of this, press Run.
--
-- Fixes the SECOND stock leak: DELETING an order (admin "Delete" button, the
-- user delete RPC, or a manual dashboard delete) removed the row without ever
-- returning its deducted stock. A BEFORE DELETE trigger now restores stock on
-- ANY delete — so no code path can lose inventory again, and no app rebuild is
-- needed. Depends on move_part_stock (already created by APPLY_cancel_stock_fix.sql).
-- =============================================================================

create or replace function public.restore_stock_on_order_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item    jsonb;
  v_part_id uuid;
  v_tenant  uuid;
begin
  -- Only orders whose stock is currently OUT (deducted). Already-restored
  -- (rolled_back) or never-deducted (pending) orders free nothing → no double count.
  if OLD.stock_status = 'deducted' then
    for v_item in select value from jsonb_array_elements(coalesce(OLD.items, '[]'::jsonb)) as t(value)
    loop
      begin
        v_part_id := (v_item->>'productId')::uuid;
      exception when others then
        continue;  -- skip legacy non-uuid product ids
      end;
      select tenant_id into v_tenant from public.parts where id = v_part_id;
      if v_tenant is not null then
        perform public.move_part_stock(
          v_part_id,
          v_tenant,
          nullif(v_item->>'variationId', ''),
          coalesce((v_item->>'quantity')::int, 0)
        );
      end if;
    end loop;
  end if;
  return OLD;
end;
$$;

drop trigger if exists trg_restore_stock_on_order_delete on public.orders;
create trigger trg_restore_stock_on_order_delete
  before delete on public.orders
  for each row
  execute function public.restore_stock_on_order_delete();
