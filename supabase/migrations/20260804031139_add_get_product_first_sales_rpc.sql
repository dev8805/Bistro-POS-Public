create or replace function public.get_product_first_sales(p_business_id uuid)
returns table(product_id uuid, first_sale timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select oi.product_id, min(o.created_at) as first_sale
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.business_id = p_business_id
    and o.status <> 'canceled'
    and oi.product_id is not null
  group by oi.product_id;
$$;

grant execute on function public.get_product_first_sales(uuid) to authenticated;
comment on function public.get_product_first_sales(uuid) is 'Devuelve la fecha de la primera venta (orden no cancelada) por producto para un negocio. Usado por ProductsScreen para gatear la Salud del Stock hasta 28 dias despues de la primera venta de cada producto. SECURITY INVOKER: respeta RLS de orders/order_items.';
