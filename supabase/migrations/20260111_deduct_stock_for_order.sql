-- Migration: Deduct Stock for Order Function
-- Date: 2026-01-11
-- Description: Creates a function to deduct stock when an order is created,
--              with proper unit conversion for processed products.

-- =====================================================
-- HELPER FUNCTION: Convert units
-- =====================================================

create or replace function public.convert_units(
  p_quantity numeric,
  p_from_unit text,
  p_to_unit text
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_from text;
  v_to text;
begin
  -- Normalize units to lowercase
  v_from := lower(trim(p_from_unit));
  v_to := lower(trim(p_to_unit));
  
  -- Same unit, no conversion needed
  if v_from = v_to then
    return p_quantity;
  end if;
  
  -- Weight conversions
  -- Gramos to other
  if v_from in ('gramos', 'gr', 'g') then
    if v_to in ('kilogramos', 'kg', 'kilos') then
      return p_quantity / 1000;
    elsif v_to in ('libras', 'lb', 'lbs') then
      return p_quantity / 453.592;
    end if;
  end if;
  
  -- Kilogramos to other
  if v_from in ('kilogramos', 'kg', 'kilos') then
    if v_to in ('gramos', 'gr', 'g') then
      return p_quantity * 1000;
    elsif v_to in ('libras', 'lb', 'lbs') then
      return p_quantity * 2.20462;
    end if;
  end if;
  
  -- Libras to other
  if v_from in ('libras', 'lb', 'lbs') then
    if v_to in ('gramos', 'gr', 'g') then
      return p_quantity * 453.592;
    elsif v_to in ('kilogramos', 'kg', 'kilos') then
      return p_quantity / 2.20462;
    end if;
  end if;
  
  -- Volume conversions
  -- Mililitros to Litros
  if v_from in ('mililitros', 'ml') then
    if v_to in ('litros', 'l', 'lt') then
      return p_quantity / 1000;
    end if;
  end if;
  
  -- Litros to Mililitros
  if v_from in ('litros', 'l', 'lt') then
    if v_to in ('mililitros', 'ml') then
      return p_quantity * 1000;
    end if;
  end if;
  
  -- Arrobas conversions
  if v_from in ('arrobas', '@', 'arroba') then
    if v_to in ('libras', 'lb', 'lbs') then
      return p_quantity * 25;
    elsif v_to in ('kilogramos', 'kg', 'kilos') then
      return p_quantity * 11.3398;
    end if;
  end if;
  
  if v_to in ('arrobas', '@', 'arroba') then
    if v_from in ('libras', 'lb', 'lbs') then
      return p_quantity / 25;
    elsif v_from in ('kilogramos', 'kg', 'kilos') then
      return p_quantity / 11.3398;
    end if;
  end if;
  
  -- No conversion found, return original quantity
  -- (this handles 'unidad' to 'unidad' and unsupported conversions)
  return p_quantity;
end;
$$;

-- =====================================================
-- MAIN FUNCTION: Deduct stock for an order
-- =====================================================

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
  -- Get order info
  select * into v_order from public.orders where id = p_order_id;
  
  if not found then
    return json_build_object('success', false, 'message', 'Order not found');
  end if;
  
  -- Only deduct for completed orders
  if v_order.status != 'completed' then
    return json_build_object('success', false, 'message', 'Order not completed yet');
  end if;
  
  -- Loop through order items
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
    
    -- 1. SIMPLE PRODUCTS: Deduct directly from product stock
    if v_item.product_type = 'simple' then
      if v_item.product_stock is not null then
        update public.products
        set stock = coalesce(stock, 0) - v_item.quantity
        where id = v_item.product_id;
        
        v_deducted_count := v_deducted_count + 1;
      end if;
    
    -- 2. PROCESSED PRODUCTS: Deduct ingredients based on recipe
    elsif v_item.product_type = 'processed' then
      
      -- Loop through recipe ingredients
      for v_recipe in
        select 
          pi.ingredient_id,
          pi.quantity as recipe_qty,
          coalesce(pi.unit, 'Unidad') as recipe_unit
        from public.product_ingredients pi
        where pi.product_id = v_item.product_id
      loop
        
        -- Get ingredient product info
        select id, name, stock, unit 
        into v_ingredient
        from public.products
        where id = v_recipe.ingredient_id;
        
        if found and v_ingredient.stock is not null then
          -- Check if ingredient was removed from this order item
          -- removed_ingredients is a JSONB array of ingredient names
          if v_item.removed_ingredients is not null 
             and jsonb_typeof(v_item.removed_ingredients) = 'array'
             and exists (
               select 1 
               from jsonb_array_elements_text(v_item.removed_ingredients) as r(elem)
               where lower(r.elem) = lower(v_ingredient.name)
             ) then
            -- Ingredient was removed, skip deduction
            continue;
          end if;
          
          -- Calculate total quantity used (recipe_qty * order_item_qty)
          -- Then convert from recipe unit to inventory unit
          v_converted_qty := public.convert_units(
            v_recipe.recipe_qty * v_item.quantity,
            v_recipe.recipe_unit,
            coalesce(v_ingredient.unit, 'Unidad')
          );
          
          -- Deduct from ingredient stock
          update public.products
          set stock = coalesce(stock, 0) - v_converted_qty
          where id = v_recipe.ingredient_id;
          
          v_deducted_count := v_deducted_count + 1;
        end if;
        
      end loop;
      
    end if;
    -- Services don't affect stock
    
  end loop;
  
  return json_build_object(
    'success', true, 
    'message', format('Stock deducted for %s items', v_deducted_count),
    'deducted_count', v_deducted_count
  );
end;
$$;

-- Grant execute permission
grant execute on function public.convert_units(numeric, text, text) to authenticated;
grant execute on function public.deduct_stock_for_order(uuid) to authenticated;
