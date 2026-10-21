-- Función RPC consolidada para el Dashboard de BistroPOS
-- Agrupa y resume todas las métricas de ventas en el servidor (PostgreSQL),
-- eliminando el límite de 1.000 filas de PostgREST y reduciendo el egress y latencia al mínimo.
create or replace function public.get_dashboard_sales_analytics(
  p_business_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_prev_start_date timestamptz default null,
  p_prev_end_date timestamptz default null,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(trim(p_timezone), ''), 'America/Bogota');
  
  v_orders_count int := 0;
  v_total_income numeric := 0;
  v_products_sold numeric := 0;
  
  v_prev_orders_count int := 0;
  v_prev_total_income numeric := 0;
  v_prev_products_sold numeric := 0;
  
  v_cogs numeric := 0;
  
  v_daily_sales jsonb := '[]'::jsonb;
  v_prev_daily_sales jsonb := '[]'::jsonb;
  v_hourly_activity jsonb := '[]'::jsonb;
  v_payment_methods jsonb := '[]'::jsonb;
  v_top_products jsonb := '[]'::jsonb;
begin
  -- 1. Resumen periodo actual (orders)
  select 
    count(*),
    coalesce(sum(o.total), 0)::numeric
  into v_orders_count, v_total_income
  from orders o
  where o.business_id = p_business_id
    and o.status = 'completed'
    and o.created_at >= p_start_date
    and o.created_at <= p_end_date;

  -- 2. Resumen periodo anterior (si se proporcionaron fechas)
  if p_prev_start_date is not null and p_prev_end_date is not null then
    select 
      count(*),
      coalesce(sum(o.total), 0)::numeric
    into v_prev_orders_count, v_prev_total_income
    from orders o
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_prev_start_date
      and o.created_at <= p_prev_end_date;

    select coalesce(sum(oi.quantity), 0)::numeric
    into v_prev_products_sold
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_prev_start_date
      and o.created_at <= p_prev_end_date;

    -- Daily sales anterior
    select coalesce(jsonb_agg(
      jsonb_build_object('date', d.day_str, 'total', round(d.day_total), 'dayIndex', 0)
      order by d.day_str asc
    ), '[]'::jsonb)
    into v_prev_daily_sales
    from (
      select 
        to_char(o.created_at at time zone v_tz, 'YYYY-MM-DD') as day_str,
        sum(o.total) as day_total
      from orders o
      where o.business_id = p_business_id
        and o.status = 'completed'
        and o.created_at >= p_prev_start_date
        and o.created_at <= p_prev_end_date
      group by 1
    ) d;
  end if;

  -- 3. Daily sales actual
  select coalesce(jsonb_agg(
    jsonb_build_object('date', d.day_str, 'total', round(d.day_total), 'dayIndex', 0)
    order by d.day_str asc
  ), '[]'::jsonb)
  into v_daily_sales
  from (
    select 
      to_char(o.created_at at time zone v_tz, 'YYYY-MM-DD') as day_str,
      sum(o.total) as day_total
    from orders o
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_start_date
      and o.created_at <= p_end_date
    group by 1
  ) d;

  -- 4. Actividad horaria (0 a 23)
  with hours_series as (
    select generate_series(0, 23) as h
  ),
  orders_by_hour as (
    select 
      extract(hour from o.created_at at time zone v_tz)::int as h,
      count(*)::int as cnt,
      coalesce(sum(o.total), 0)::numeric as inc
    from orders o
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_start_date
      and o.created_at <= p_end_date
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'count', coalesce(obh.cnt, 0),
      'income', round(coalesce(obh.inc, 0))
    ) order by hs.h asc
  ), '[]'::jsonb)
  into v_hourly_activity
  from hours_series hs
  left join orders_by_hour obh on obh.h = hs.h;

  -- 5. Métodos de pago (unificando directos y split_payments)
  with unnested_payments as (
    select 
      case 
        when lower(trim(o.payment_method)) in ('efectivo', 'cash') then 'cash'
        when lower(trim(o.payment_method)) in ('tarjeta', 'card') then 'card'
        when lower(trim(o.payment_method)) in ('transferencia', 'transfer') then 'transfer'
        when lower(trim(o.payment_method)) in ('nequi') then 'nequi'
        when lower(trim(o.payment_method)) in ('daviplata') then 'daviplata'
        when lower(trim(o.payment_method)) in ('credito', 'credit') then 'credit'
        else coalesce(nullif(lower(trim(o.payment_method)), ''), 'other')
      end as method_key,
      coalesce(o.total, 0)::numeric as amount
    from orders o
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_start_date
      and o.created_at <= p_end_date
      and (o.split_payments is null or jsonb_array_length(o.split_payments) = 0)

    union all

    select 
      case 
        when lower(trim(sp->>'method')) in ('efectivo', 'cash') then 'cash'
        when lower(trim(sp->>'method')) in ('tarjeta', 'card') then 'card'
        when lower(trim(sp->>'method')) in ('transferencia', 'transfer') then 'transfer'
        when lower(trim(sp->>'method')) in ('nequi') then 'nequi'
        when lower(trim(sp->>'method')) in ('daviplata') then 'daviplata'
        when lower(trim(sp->>'method')) in ('credito', 'credit') then 'credit'
        else 'other'
      end as method_key,
      coalesce((sp->>'amount')::numeric, 0) as amount
    from orders o,
    lateral jsonb_array_elements(o.split_payments) sp
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_start_date
      and o.created_at <= p_end_date
      and o.split_payments is not null
      and jsonb_array_length(o.split_payments) > 0
  ),
  grouped_payments as (
    select method_key, round(sum(amount)) as amount
    from unnested_payments
    group by method_key
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'method', method_key,
      'amount', amount
    ) order by amount desc
  ), '[]'::jsonb)
  into v_payment_methods
  from grouped_payments;

  -- 6. Top productos, total products sold y COGS
  with items as (
    select 
      oi.product_id,
      oi.product_name,
      sum(oi.quantity)::numeric as sold,
      sum(oi.total_price)::numeric as income
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_start_date
      and o.created_at <= p_end_date
    group by oi.product_id, oi.product_name
  ),
  item_cogs as (
    select 
      oi.product_id,
      sum(la.quantity_allocated * la.unit_cost_at_sale)::numeric as real_cogs
    from lot_allocations la
    join order_items oi on oi.id = la.order_item_id
    join orders o on o.id = oi.order_id
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_start_date
      and o.created_at <= p_end_date
      and oi.product_id is not null
    group by oi.product_id
  ),
  product_aggregates as (
    select 
      i.product_id,
      i.product_name,
      i.sold,
      i.income,
      coalesce(p.cost, 0)::numeric as base_unit_cost,
      p.image_url,
      coalesce(ic.real_cogs, coalesce(p.cost, 0) * i.sold) as total_cogs
    from items i
    left join products p on p.id = i.product_id
    left join item_cogs ic on ic.product_id = i.product_id
  )
  select 
    coalesce(sum(sold), 0),
    coalesce(sum(total_cogs), 0),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'product_id', product_id,
        'name', product_name,
        'sold', sold,
        'income', round(income),
        'cost', case when sold > 0 then round(total_cogs / sold) else round(base_unit_cost) end,
        'profit', round(income - total_cogs),
        'unitPrice', case when sold > 0 then round(income / sold) else 0 end,
        'image', image_url
      ) order by income desc
    ), '[]'::jsonb)
  into v_products_sold, v_cogs, v_top_products
  from product_aggregates;

  -- 7. Retornar JSON consolidado
  return jsonb_build_object(
    'orders_count', v_orders_count,
    'total_income', round(v_total_income),
    'products_sold', v_products_sold,
    'cogs', round(v_cogs),
    'prev_orders_count', v_prev_orders_count,
    'prev_total_income', round(v_prev_total_income),
    'prev_products_sold', v_prev_products_sold,
    'daily_sales', v_daily_sales,
    'prev_daily_sales', v_prev_daily_sales,
    'hourly_activity', v_hourly_activity,
    'payment_methods', v_payment_methods,
    'top_products', v_top_products
  );
end;
$$;

grant execute on function public.get_dashboard_sales_analytics(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text) to authenticated;
comment on function public.get_dashboard_sales_analytics is 'Consolida métricas de ventas para el Dashboard en el servidor, eliminando el límite de 1.000 filas de PostgREST y optimizando el egress.';
