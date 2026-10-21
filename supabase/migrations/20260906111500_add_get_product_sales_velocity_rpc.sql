-- Función RPC para calcular la velocidad de ventas (unidades vendidas en los últimos N días)
-- agrupada por producto directamente en la base de datos, reduciendo drásticamente el egress y la latencia.
create or replace function public.get_product_sales_velocity(
  p_business_id uuid,
  p_days int default 28
)
returns table(product_id uuid, total_sold numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select 
    oi.product_id, 
    coalesce(sum(oi.quantity), 0)::numeric as total_sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.business_id = p_business_id
    and o.status <> 'canceled'
    and o.created_at >= (now() - (coalesce(p_days, 28) || ' days')::interval)
    and oi.product_id is not null
  group by oi.product_id;
$$;

grant execute on function public.get_product_sales_velocity(uuid, int) to authenticated;
comment on function public.get_product_sales_velocity(uuid, int) is 'Devuelve la cantidad total vendida por producto en los ultimos N dias (por defecto 28) para un negocio. Usado por ProductsScreen para calcular la velocidad de ventas y la Salud del Stock sin transferir ordenes completas al frontend. SECURITY INVOKER: respeta RLS.';

-- Índice compuesto para acelerar tanto get_product_sales_velocity como get_product_first_sales
create index if not exists idx_orders_biz_created_active 
on public.orders (business_id, created_at) 
where status <> 'canceled';
