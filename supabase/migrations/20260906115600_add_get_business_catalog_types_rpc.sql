-- RPC para verificar la presencia de tipos de productos y promociones para un negocio
-- Utiliza subconsultas EXISTS para detenerse en la primera fila encontrada (<1ms, <100 bytes).
create or replace function public.get_business_catalog_types(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'has_retail', exists(select 1 from public.products where business_id = p_business_id and is_active = true and type = 'simple' and is_for_sale = true),
    'has_recipes', exists(select 1 from public.products where business_id = p_business_id and is_active = true and type = 'processed'),
    'has_insumos', exists(select 1 from public.products where business_id = p_business_id and is_active = true and type = 'simple' and is_for_sale = false),
    'has_services', exists(select 1 from public.products where business_id = p_business_id and is_active = true and type = 'service'),
    'has_promotions', exists(select 1 from public.promotions where business_id = p_business_id and is_active = true)
  );
$$;

grant execute on function public.get_business_catalog_types(uuid) to authenticated;
comment on function public.get_business_catalog_types(uuid) is 'Comprueba la existencia de productos por tipo y promociones activas para un negocio con escaneo EXISTS de alta velocidad (<1ms, <100 bytes). Usado para renderizar las pestañas de ProductsScreen sin retrasos.';
