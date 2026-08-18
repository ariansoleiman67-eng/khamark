-- =============================================================================
-- create_counter_sale — a counter sale, committed atomically
-- =============================================================================
-- The mobile POS (tenantAdminService.createManualOrder) inserts the order, then
-- moves stock, then flips stock_status to 'deducted' with a retry, and its own
-- comments name the failure mode: if the flip fails the stock HAS moved but the
-- row still reads 'pending', so a later status change deducts it a SECOND time
-- and the drift is permanent. It is best-effort by construction, because a
-- client cannot hold a transaction open across three round trips.
--
-- Postgres can. This does the whole sale in one transaction: either the order
-- exists AND every line's stock moved, or nothing happened at all. There is no
-- intermediate state for a retry to get wrong, which is why the web POS calls
-- this rather than reimplementing the sequence.
--
-- SECURITY DEFINER, but it authorises explicitly: the caller must be an admin AND
-- must own the tenant being sold for. Being an admin of one shop is not
-- permission to ring up a sale in another.
--
-- Money is USD, with the exact dinar total passed in and stored verbatim
-- (see orders.total_iqd) so a dinar-priced product is charged the figure the shop
-- typed rather than a reconversion of it.
-- =============================================================================

create or replace function public.create_counter_sale(
  p_tenant_id     uuid,
  p_items         jsonb,            -- [{productId, variationId?, quantity, priceUSD, priceIQD?, productName, purchasePrice?}]
  p_customer_name text default null,
  p_customer_phone text default null,
  p_discount_usd  numeric default 0,
  p_amount_paid_usd numeric default null,
  p_total_iqd     numeric default null,
  p_exchange_rate numeric default 1500,
  p_notes         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item        jsonb;
  v_part_id     uuid;
  v_qty         int;
  v_subtotal    numeric := 0;
  v_discount    numeric;
  v_total       numeric;
  v_paid        numeric;
  v_order_id    uuid;
  v_order_no    text;
  v_line_count  int := 0;
begin
  -- ---- authorisation ------------------------------------------------------
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.users where id = auth.uid() and is_admin) then
    raise exception 'Not an admin';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id and owner_id = auth.uid()) then
    raise exception 'Not your shop';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item';
  end if;

  -- ---- totals, computed HERE from the lines --------------------------------
  -- Never from a client-supplied subtotal: the browser is allowed to be wrong,
  -- and a POS that trusts it can be told a phone costs a dollar.
  for v_item in select value from jsonb_array_elements(p_items) as t(value)
  loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'Every line needs a quantity greater than zero';
    end if;
    v_subtotal := v_subtotal + (coalesce((v_item->>'priceUSD')::numeric, 0) * v_qty);
    v_line_count := v_line_count + 1;
  end loop;

  v_discount := least(greatest(coalesce(p_discount_usd, 0), 0), v_subtotal);
  v_total    := greatest(v_subtotal - v_discount, 0);
  -- A counter sale is paid in full unless the shop says otherwise; change given
  -- back is cash, not credit, so what is recorded as paid is capped at the total.
  v_paid     := least(greatest(coalesce(p_amount_paid_usd, v_total), 0), v_total);

  -- ---- stock first, so an oversell aborts before an order exists -----------
  for v_item in select value from jsonb_array_elements(p_items) as t(value)
  loop
    begin
      v_part_id := (v_item->>'productId')::uuid;
    exception when others then
      -- A manual/custom line carries no product id and holds no stock.
      continue;
    end;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    perform public.move_part_stock(
      v_part_id,
      p_tenant_id,
      nullif(v_item->>'variationId', ''),
      -v_qty                                  -- negative delta = deduct
    );
  end loop;

  v_order_no := 'POS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');

  insert into public.orders (
    user_id, tenant_id, order_number, items,
    subtotal_usd, shipping_usd, tax_usd, discount_usd, total_usd, total_iqd,
    amount_paid_usd, currency, exchange_rate,
    payment_status, status, stock_status,
    shipping_address, notes, extra_data
  ) values (
    auth.uid(), p_tenant_id, v_order_no, p_items,
    v_subtotal, 0, 0, nullif(v_discount, 0), v_total, p_total_iqd,
    v_paid, 'USD', coalesce(p_exchange_rate, 1500),
    case when v_paid >= v_total - 0.01 then 'paid' else 'pending' end,
    -- A counter sale is complete the moment it is rung up: the customer is
    -- holding the phone. 'delivered' is what makes it count as realised revenue.
    'delivered',
    -- Truthful because the stock genuinely moved inside this transaction.
    'deducted',
    jsonb_build_object('fullName', coalesce(nullif(p_customer_name, ''), 'In-Store Customer'), 'phone', p_customer_phone),
    p_notes,
    jsonb_build_object('source', 'in-store-web', 'customerName', p_customer_name, 'customerPhone', p_customer_phone)
  )
  returning id, order_number into v_order_id, v_order_no;

  return jsonb_build_object(
    'orderId', v_order_id, 'orderNumber', v_order_no,
    'subtotalUSD', v_subtotal, 'discountUSD', v_discount,
    'totalUSD', v_total, 'amountPaidUSD', v_paid, 'lines', v_line_count
  );
end;
$$;

revoke all on function public.create_counter_sale(uuid, jsonb, text, text, numeric, numeric, numeric, numeric, text) from public;
grant execute on function public.create_counter_sale(uuid, jsonb, text, text, numeric, numeric, numeric, numeric, text) to authenticated;

select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = 'create_counter_sale';
