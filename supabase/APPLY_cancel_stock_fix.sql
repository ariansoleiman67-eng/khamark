-- =============================================================================
-- RUN ME ONCE in Supabase → SQL Editor. Paste ALL of this, press Run.
--
-- Does three things in order:
--   1. (Re)creates the atomic stock mover move_part_stock.
--   2. Rewrites cancel_my_order so a user-cancel RESTORES stock (the bug fix).
--   3. Repairs every already-cancelled order whose stock is still 'deducted'
--      (puts the units back, marks it 'rolled_back' — safe to re-run, idempotent).
-- Ends by printing how many orders were repaired. No app rebuild needed.
-- =============================================================================

-- 1) Atomic, row-locking stock mover. Signed delta: negative deducts, positive restores.
create or replace function public.move_part_stock(
  p_part_id uuid,
  p_tenant_id uuid,
  p_variation_id text,
  p_delta integer
) returns void
language plpgsql
as $$
declare
  v_variations jsonb;
  v_colors jsonb;
begin
  select variations, color_variations
    into v_variations, v_colors
  from public.parts
  where id = p_part_id and tenant_id = p_tenant_id
  for update;

  if not found then
    return;
  end if;

  if p_variation_id is null or p_variation_id = '' then
    update public.parts
      set stock_qty = greatest(0, coalesce(stock_qty, 0) + p_delta)
    where id = p_part_id and tenant_id = p_tenant_id;
    return;
  end if;

  v_variations := (
    select coalesce(jsonb_agg(
      case when elem->>'variationId' = p_variation_id
        then jsonb_set(elem, '{stockQuantity}',
               to_jsonb(greatest(0, coalesce((elem->>'stockQuantity')::numeric, 0)::int + p_delta)))
        else elem
      end
    ), v_variations)
    from jsonb_array_elements(coalesce(v_variations, '[]'::jsonb)) as elem
  );

  v_colors := (
    select coalesce(jsonb_agg(
      case when elem->>'variationId' = p_variation_id
        then jsonb_set(elem, '{stockQuantity}',
               to_jsonb(greatest(0, coalesce((elem->>'stockQuantity')::numeric, 0)::int + p_delta)))
        else elem
      end
    ), v_colors)
    from jsonb_array_elements(coalesce(v_colors, '[]'::jsonb)) as elem
  );

  update public.parts
    set variations = v_variations,
        color_variations = v_colors
  where id = p_part_id and tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.move_part_stock(uuid, uuid, text, integer) to authenticated;

-- 2) Owner-scoped cancel that restores stock when it had been deducted.
create or replace function public.cancel_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_item    jsonb;
  v_part_id uuid;
  v_tenant  uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.user_id is distinct from auth.uid() then
    raise exception 'Not authorized to cancel this order';
  end if;

  if v_order.status in ('cancelled', 'cancelled_by_user', 'cancelled_by_store') then
    return;  -- already cancelled: idempotent no-op
  end if;

  if v_order.status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled';
  end if;

  if v_order.stock_status = 'deducted' then
    for v_item in select value from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
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

  update public.orders
    set status       = 'cancelled_by_user',
        stock_status = case when v_order.stock_status = 'deducted' then 'rolled_back' else stock_status end,
        updated_at   = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.cancel_my_order(uuid) from public, anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;

-- 3) Repair every cancelled order still holding deducted stock (any cancel type).
-- Gated on stock_status='deducted' → only restores what's genuinely still out,--then flips to 'rolled_back' so a second run does nothing. do the fill for the first time, int he Sql after repate..
do $$
declare
  r   record;
  it  jsonb;
  pid uuid;
  tid uuid;
begin
  for r in
    select id, items
    from public.orders
    where status in ('cancelled', 'cancelled_by_user', 'cancelled_by_store')
      and stock_status = 'deducted'
  loop
    for it in select value from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) as t(value)
    loop
      begin
        pid := (it->>'productId')::uuid;
      exception when others then
        continue;
      end;
      select tenant_id into tid from public.parts where id = pid;
      if tid is not null then
        perform public.move_part_stock(
          pid, tid, nullif(it->>'variationId', ''), coalesce((it->>'quantity')::int, 0)
        );
      end if;
    end loop;
    update public.orders set stock_status = 'rolled_back' where id = r.id;
  end loop;
end $$;

-- 4) Confirm: this should now be 0.
select count(*) as still_broken
from public.orders
where status in ('cancelled', 'cancelled_by_user', 'cancelled_by_store')
  and stock_status = 'deducted';
