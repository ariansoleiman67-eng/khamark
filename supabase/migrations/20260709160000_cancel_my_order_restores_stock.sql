-- =============================================================================
-- Fix: user-cancel must restore stock (parity with the admin cancel path).
-- =============================================================================
-- Root cause: stock restore lived ONLY in tenantAdminService.updateOrderStatus
-- (gated on stock_status = 'deducted'). The customer cancel goes through the
-- SECURITY DEFINER RPC cancel_my_order, which only flipped status to
-- 'cancelled_by_user'. So when a customer cancelled an order whose stock had
-- been deducted (admin confirmed it — even if it was later moved back to
-- 'pending'), stock_status stayed 'deducted' and the units were never restocked.
--
-- This rewrites cancel_my_order to ALSO restore stock when (and only when) it had
-- been deducted, keyed on stock_status so it never double-restores a
-- never-deducted order. Deploy by pasting this whole file into the Supabase SQL
-- editor and Run. No app rebuild needed — the app already calls this RPC.
-- =============================================================================

-- 1) Ensure the atomic, row-locking stock mover exists (matches move_part_stock.sql).
--    Signed p_delta: NEGATIVE deducts, POSITIVE restores; clamps at 0.
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
    return;  -- product gone / wrong tenant: no-op, never error the order
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
  -- Lock the order row so a concurrent admin status change can't race the cancel.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Ownership: the caller must own the order.
  if v_order.user_id is distinct from auth.uid() then
    raise exception 'Not authorized to cancel this order';
  end if;

  -- Idempotent: already cancelled → nothing to do (best-effort callers re-invoke).
  if v_order.status in ('cancelled', 'cancelled_by_user', 'cancelled_by_store') then
    return;
  end if;

  -- Only pending / confirmed orders are user-cancellable (matches the app UI).
  if v_order.status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled';
  end if;

  -- Restore stock ONLY if it was actually deducted. Keyed on stock_status (not
  -- order status) so a confirmed→pending→cancel path still restores, and a
  -- never-deducted pending order is not falsely credited.
  if v_order.stock_status = 'deducted' then
    for v_item in select value from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    loop
      -- Skip lines with a non-uuid (legacy Firestore) product id instead of aborting.
      begin
        v_part_id := (v_item->>'productId')::uuid;
      exception when others then
        continue;
      end;

      -- Resolve the part's real tenant (order.tenant_id can be null on legacy rows).
      select tenant_id into v_tenant from public.parts where id = v_part_id;
      if v_tenant is not null then
        perform public.move_part_stock(
          v_part_id,
          v_tenant,
          nullif(v_item->>'variationId', ''),
          coalesce((v_item->>'quantity')::int, 0)   -- positive delta = restore
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
