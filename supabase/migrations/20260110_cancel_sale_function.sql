-- Function to cancel order and restore stock for retail products
create or replace function public.cancel_order_and_restore_stock(
  p_order_id uuid,
  p_reason text
)
returns json
language plpgsql
security definer
as $$
declare
  v_order record;
  v_item record;
  v_product_type text;
begin
  -- 1. Get and lock the order
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return json_build_object('success', false, 'message', 'Orden no encontrada');
  end if;

  if v_order.status = 'canceled' then
    return json_build_object('success', false, 'message', 'La orden ya está anulada');
  end if;

  -- 2. Restore stock if the order was completed
  -- Only restore stock for 'simple' (retail) products logic
  if v_order.status = 'completed' then
    for v_item in
      select oi.*, p.type as product_type
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
    loop
      if v_item.product_type = 'simple' then
        -- Restore stock for simple products
        update public.products
        set stock = coalesce(stock, 0) + v_item.quantity
        where id = v_item.product_id;
      end if;
    end loop;
  end if;

  -- 3. Update order status
  update public.orders
  set status = 'canceled',
      canceled_at = now(),
      canceled_reason = p_reason
  where id = p_order_id;

  return json_build_object('success', true, 'message', 'Orden anulada correctamente');
exception when others then
  return json_build_object('success', false, 'message', SQLERRM);
end;
$$;
