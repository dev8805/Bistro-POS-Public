-- Migration: Enable Stock Deduction for Service Ingredients
-- Date: 2026-02-15
-- Description: Updates update_stock_on_order_complete to handle 'service' type products by deducting their ingredients.
-- Preserves existing logic for 'simple' and 'processed' products, including unit conversion.

create or replace function public.update_stock_on_order_complete()
returns trigger
language plpgsql
security definer
as $$
DECLARE
  item record;
  recipe record;
  deduct_qty numeric;
BEGIN
  IF new.status = 'completed' AND old.status != 'completed' THEN
    FOR item IN 
      SELECT oi.*, p.type as product_type
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = new.id AND oi.status != 'canceled'
    LOOP
      
      IF item.product_type = 'simple' THEN
        -- Simple product deduction
        UPDATE public.products 
        SET stock = GREATEST(0, COALESCE(stock, 0) - item.quantity)
        WHERE id = item.product_id AND stock IS NOT NULL;
        
      ELSIF item.product_type = 'processed' OR item.product_type = 'service' THEN
        -- Recipe deduction
        FOR recipe IN
          SELECT 
            pi.ingredient_id, 
            pi.quantity as recipe_qty, 
            COALESCE(pi.unit, 'Unidad') as recipe_unit, 
            p_ing.unit as stock_unit, 
            p_ing.name as ing_name
          FROM public.product_ingredients pi
          JOIN public.products p_ing ON p_ing.id = pi.ingredient_id
          WHERE pi.product_id = item.product_id
        LOOP
          
          -- Check exclusions (JSON check)
          IF item.removed_ingredients IS NOT NULL AND 
             item.removed_ingredients @> to_jsonb(recipe.ing_name) THEN
             CONTINUE; -- Skip excluded ingredient
          END IF;
          
          -- Calculate converted quantity
          deduct_qty := public.convert_unit(recipe.recipe_qty, recipe.recipe_unit, recipe.stock_unit);
          
          -- Fallback
          IF deduct_qty IS NULL THEN
             IF lower(trim(recipe.recipe_unit)) = lower(trim(recipe.stock_unit)) THEN
                deduct_qty := recipe.recipe_qty; 
             ELSE
                deduct_qty := NULL; 
             END IF;
          END IF;

          IF deduct_qty IS NOT NULL THEN
             UPDATE public.products
             SET stock = GREATEST(0, COALESCE(stock, 0) - (deduct_qty * item.quantity))
             WHERE id = recipe.ingredient_id AND stock IS NOT NULL;
          END IF;
          
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  RETURN new;
END;
$$;
