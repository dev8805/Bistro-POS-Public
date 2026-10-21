create or replace function public.delete_order_item_and_restore_stock(
  p_order_item_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_item record;
  v_product_type text;
  v_restored boolean := false;
  v_order_deleted boolean := false;
  v_remaining int;
begin
  select * into v_item
  from public.order_items
  where id = p_order_item_id
  for update;

  if not found then
    return json_build_object('success', false, 'message', 'Item no encontrado');
  end if;

  select type into v_product_type
  from public.products
  where id = v_item.product_id;

  v_product_type := coalesce(v_product_type, 'unknown');

  if v_product_type in ('simple', 'service') then
    update public.products
    set stock = coalesce(stock, 0) + v_item.quantity
    where id = v_item.product_id
      and stock is not null;
    v_restored := true;
  end if;

  delete from public.order_items where id = p_order_item_id;

  select count(*) into v_remaining
  from public.order_items
  where order_id = v_item.order_id;

  if v_remaining = 0 then
    delete from public.orders where id = v_item.order_id;
    v_order_deleted := true;
  end if;

  return json_build_object(
    'success', true,
    'message', 'Item eliminado correctamente',
    'restored_stock', v_restored,
    'order_deleted', v_order_deleted
  );
exception when others then
  return json_build_object('success', false, 'message', SQLERRM);
end;
$$;
