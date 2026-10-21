-- Migration: Fix Stock Deduction Logic for Removed Ingredients
-- Date: 2026-01-11
-- Description: Updates update_stock_on_order_complete to handle removed_ingredients and update products table.

create or replace function public.update_stock_on_order_complete()
returns trigger
language plpgsql
security definer
as $$
declare
  item record;
  recipe record;
  ingredient_name text;
  should_deduct boolean;
  
  -- Variables for JSONB handling
  removed_list jsonb;
begin
  -- Only run when status changes to 'completed'
  if new.status = 'completed' and old.status != 'completed' then
    
    -- Loop through order items
    for item in 
      select oi.*, p.type as product_type
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = new.id and oi.status != 'canceled'
    loop
      
      -- 1. SIMPLE PRODUCTS
      if item.product_type = 'simple' then
        update public.products 
        set stock = greatest(0, coalesce(stock, 0) - item.quantity)
        where id = item.product_id and stock is not null;
        
      -- 2. PROCESSED PRODUCTS (Recipe)
      elsif item.product_type = 'processed' then
        
        -- Get removed ingredients list (ensure it is a valid json array)
        removed_list := coalesce(item.removed_ingredients, '[]'::jsonb);

        -- Loop through defined recipe ingredients
        -- We join product_ingredients -> products (as ingredients)
        -- Note: We assume 'ingredients' table is legacy/unused or synced, 
        -- but since the app uses products table for ingredients, we query tables accordingly.
        for recipe in
          select 
            pi.ingredient_id, 
            pi.quantity * item.quantity as total_qty,
            p_ing.name as name
          from public.product_ingredients pi
          join public.products p_ing on p_ing.id = pi.ingredient_id
          where pi.product_id = item.product_id
        loop
            -- Check if this ingredient name is in the removed_list
            -- We interpret the jsonb array as text strings
            should_deduct := true;
            
            if jsonb_typeof(removed_list) = 'array' then
                -- Check existence of name in JSONB array
                if exists (
                    select 1 
                    from jsonb_array_elements_text(removed_list) as r(elem)
                    where lower(r.elem) = lower(recipe.name) -- Case insensitive check
                ) then
                    should_deduct := false;
                end if;
            end if;

            if should_deduct then
                -- Deduct stock from the ingredient product
                update public.products
                set stock = greatest(0, coalesce(stock, 0) - recipe.total_qty)
                where id = recipe.ingredient_id and stock is not null;
            end if;

        end loop;
      end if;
      -- Services don't affect stock
    end loop;
  end if;
  
  return new;
end;
$$;
