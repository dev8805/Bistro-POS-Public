-- Migration: Fix deduct_stock_for_order RPC to support Services
-- Date: 2026-02-15
-- Description: Updates deduct_stock_for_order function to handle 'service' type products, mirroring 'processed' logic.

create or replace function public.deduct_stock_for_order(p_order_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_order record;
  v_item record;
  v_recipe record;
  v_ingredient record;
  v_converted_qty numeric;
  v_deducted_count int := 0;
begin
  select * into v_order from public.orders where id = p_order_id;
  
  if not found then
    return json_build_object('success', false, 'message', 'Order not found');
  end if;
  
  -- Allow deduction if status is completed OR served/delivered (for immediate sales)
  -- But strictly, the app calls this when creating the order. The strict check might be why it fails if status isn't exactly 'completed'.
  -- However, existing logic effectively only runs if status is 'completed'.
  -- Let's stick to existing logic but include service.
  
  if v_order.status != 'completed' then
    return json_build_object('success', false, 'message', 'Order not completed yet');
  end if;
  
  for v_item in
    select 
      oi.id as order_item_id,
      oi.product_id,
      oi.quantity,
      oi.status as item_status,
      oi.removed_ingredients,
      p.type as product_type,
      p.stock as product_stock,
      p.unit as product_unit,
      p.name as product_name
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and oi.status != 'canceled'
  loop
    
    if v_item.product_type = 'simple' then
      if v_item.product_stock is not null then
        update public.products
        set stock = coalesce(stock, 0) - v_item.quantity
        where id = v_item.product_id;
        
        v_deducted_count := v_deducted_count + 1;
      end if;
    
    -- SUPPORT FOR PROCESSED AND SERVICE
    elsif v_item.product_type = 'processed' or v_item.product_type = 'service' then
      
      for v_recipe in
        select 
          pi.ingredient_id,
          pi.quantity as recipe_qty,
          coalesce(pi.unit, 'Unidad') as recipe_unit
        from public.product_ingredients pi
        where pi.product_id = v_item.product_id
      loop
        
        select id, name, stock, unit 
        into v_ingredient
        from public.products
        where id = v_recipe.ingredient_id;
        
        if found and v_ingredient.stock is not null then
          -- Check exclusions
          if v_item.removed_ingredients is not null 
             and jsonb_typeof(v_item.removed_ingredients) = 'array'
             and exists (
               select 1 
               from jsonb_array_elements_text(v_item.removed_ingredients) as r(elem)
               where lower(r.elem) = lower(v_ingredient.name)
             ) then
            continue;
          end if;
          
          -- Convert units
          v_converted_qty := public.convert_units(
            v_recipe.recipe_qty * v_item.quantity,
            v_recipe.recipe_unit,
            coalesce(v_ingredient.unit, 'Unidad')
          );
          
          update public.products
          set stock = coalesce(stock, 0) - v_converted_qty
          where id = v_recipe.ingredient_id;
          
          v_deducted_count := v_deducted_count + 1;
        end if;
        
      end loop;
      
    end if;
    
  end loop;
  
  return json_build_object(
    'success', true, 
    'message', format('Stock deducted for %s items', v_deducted_count),
    'deducted_count', v_deducted_count
  );
end;
$$;
