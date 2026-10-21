-- 1. Agregar sale_presentations a products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sale_presentations jsonb DEFAULT '[]'::jsonb;

-- 2. Agregar conversion_factor a order_items
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS conversion_factor numeric DEFAULT 1;

-- 3. Actualizar deduct_inventory_complete para descontar con conversion_factor
CREATE OR REPLACE FUNCTION public.deduct_inventory_complete(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_order record;
  v_item record;
  v_recipe record;
  v_ingredient record;
  v_converted_qty numeric;
  v_deducted_count int := 0;
  v_fifo_cost numeric;
  v_promo_item record;
  v_pound numeric;
  v_deduct_qty numeric;
begin
  select * into v_order from public.orders where id = p_order_id;

  if not found then
    return json_build_object('success', false, 'message', 'Order not found');
  end if;

  -- Libra del negocio (gramos). Default 500 si no está definido.
  v_pound := coalesce((select pound_in_grams from public.businesses where id = v_order.business_id), 500);

  -- Iterate all items in the order
  for v_item in
    select
      oi.id as order_item_id,
      oi.product_id,
      oi.promotion_id,
      oi.quantity,
      coalesce(oi.conversion_factor, 1) as conversion_factor,
      oi.status as item_status,
      oi.removed_ingredients
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.status != 'canceled'
  loop

    -- CASE 3: PROMOTION (descontar cada producto componente)
    if v_item.promotion_id is not null then
      for v_promo_item in
        select
          pi.product_id,
          p.type as product_type,
          p.stock as product_stock,
          p.unit as product_unit,
          p.name as product_name,
          p.business_id
        from public.promotion_items pi
        join public.products p on p.id = pi.product_id
        where pi.promotion_id = v_item.promotion_id
      loop
        if v_promo_item.product_type = 'simple' then
          -- Descontar stock directo
          if v_promo_item.product_stock is not null then
            update public.products
            set stock = coalesce(stock, 0) - v_item.quantity
            where id = v_promo_item.product_id;
          end if;
          PERFORM public.deduct_fifo(
            v_promo_item.product_id,
            v_promo_item.business_id,
            v_item.order_item_id,
            v_item.quantity
          );
        elsif v_promo_item.product_type in ('processed', 'service') then
          -- Descontar ingredientes de receta
          for v_recipe in
            select
              pi2.ingredient_id,
              pi2.quantity as recipe_qty,
              coalesce(pi2.unit, 'Unidad') as recipe_unit
            from public.product_ingredients pi2
            where pi2.product_id = v_promo_item.product_id
          loop
            select id, name, stock, unit, business_id
            into v_ingredient
            from public.products
            where id = v_recipe.ingredient_id;

            if found then
              begin
                v_converted_qty := public.convert_units(
                  v_recipe.recipe_qty * v_item.quantity,
                  v_recipe.recipe_unit,
                  coalesce(v_ingredient.unit, 'Unidad'),
                  v_pound
                );
              exception when others then
                v_converted_qty := v_recipe.recipe_qty * v_item.quantity;
              end;

              if v_ingredient.stock is not null then
                update public.products
                set stock = coalesce(stock, 0) - v_converted_qty
                where id = v_recipe.ingredient_id;
              end if;

              PERFORM public.deduct_fifo(
                v_recipe.ingredient_id,
                v_ingredient.business_id,
                v_item.order_item_id,
                v_converted_qty
              );
            end if;
          end loop;
        end if;
      end loop;
      v_deducted_count := v_deducted_count + 1;

    -- CASE 1: SIMPLE PRODUCT (multiplicado por conversion_factor)
    elsif v_item.product_id is not null then
      declare
        v_prod record;
      begin
        select type, stock, unit, name, business_id
        into v_prod
        from public.products
        where id = v_item.product_id;

        if found then
          v_deduct_qty := v_item.quantity * coalesce(v_item.conversion_factor, 1);
          if v_prod.type = 'simple' then
            if v_prod.stock is not null then
              update public.products
              set stock = coalesce(stock, 0) - v_deduct_qty
              where id = v_item.product_id;
            end if;
            PERFORM public.deduct_fifo(
              v_item.product_id,
              v_prod.business_id,
              v_item.order_item_id,
              v_deduct_qty
            );
            v_deducted_count := v_deducted_count + 1;

          -- CASE 2: PROCESSED / SERVICE
          elsif v_prod.type in ('processed', 'service') then
            for v_recipe in
              select
                pi.ingredient_id,
                pi.quantity as recipe_qty,
                coalesce(pi.unit, 'Unidad') as recipe_unit
              from public.product_ingredients pi
              where pi.product_id = v_item.product_id
            loop
              select id, name, stock, unit, business_id
              into v_ingredient
              from public.products
              where id = v_recipe.ingredient_id;

              if found then
                if v_item.removed_ingredients is not null
                   and jsonb_typeof(v_item.removed_ingredients) = 'array'
                   and exists (
                     select 1
                     from jsonb_array_elements_text(v_item.removed_ingredients) as r(elem)
                     where lower(r.elem) = lower(v_ingredient.name)
                   ) then
                  continue;
                end if;

                begin
                  v_converted_qty := public.convert_units(
                    v_recipe.recipe_qty * v_deduct_qty,
                    v_recipe.recipe_unit,
                    coalesce(v_ingredient.unit, 'Unidad'),
                    v_pound
                  );
                exception when others then
                  v_converted_qty := v_recipe.recipe_qty * v_deduct_qty;
                end;

                if v_ingredient.stock is not null then
                  update public.products
                  set stock = coalesce(stock, 0) - v_converted_qty
                  where id = v_recipe.ingredient_id;
                end if;

                PERFORM public.deduct_fifo(
                  v_recipe.ingredient_id,
                  v_ingredient.business_id,
                  v_item.order_item_id,
                  v_converted_qty
                );
              end if;
            end loop;
            v_deducted_count := v_deducted_count + 1;
          end if;
        end if;
      end;
    end if;

  end loop;

  return json_build_object(
    'success', true,
    'message', format('Stock deducted for %s items (including ingredients)', v_deducted_count),
    'deducted_count', v_deducted_count
  );
end;
$function$;

-- 4. Actualizar trigger update_stock_on_order_complete
CREATE OR REPLACE FUNCTION public.update_stock_on_order_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  item record;
  recipe record;
  promo_item record;
  deduct_qty numeric;
  v_prod_deduct_qty numeric;
BEGIN
  IF new.status = 'completed' AND old.status != 'completed' THEN
    FOR item IN 
      SELECT oi.*, coalesce(oi.conversion_factor, 1) as eff_factor
      FROM public.order_items oi
      WHERE oi.order_id = new.id AND oi.status != 'canceled'
    LOOP
      
      IF item.promotion_id IS NOT NULL THEN
        -- PROMOCIÓN: descontar cada producto componente
        FOR promo_item IN
          SELECT pi.product_id, pi.promo_price, p.type as product_type, p.stock
          FROM public.promotion_items pi
          JOIN public.products p ON p.id = pi.product_id
          WHERE pi.promotion_id = item.promotion_id
        LOOP
          IF promo_item.product_type = 'simple' THEN
            UPDATE public.products 
            SET stock = GREATEST(0, COALESCE(stock, 0) - item.quantity)
            WHERE id = promo_item.product_id AND stock IS NOT NULL;
          ELSIF promo_item.product_type IN ('processed', 'service') THEN
            FOR recipe IN
              SELECT 
                pi.ingredient_id, 
                pi.quantity as recipe_qty, 
                COALESCE(pi.unit, 'Unidad') as recipe_unit, 
                p_ing.unit as stock_unit, 
                p_ing.name as ing_name
              FROM public.product_ingredients pi
              JOIN public.products p_ing ON p_ing.id = pi.ingredient_id
              WHERE pi.product_id = promo_item.product_id
            LOOP
              deduct_qty := public.convert_unit(recipe.recipe_qty, recipe.recipe_unit, recipe.stock_unit);
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

      ELSIF item.product_id IS NOT NULL THEN
        -- PRODUCTO NORMAL
        DECLARE
          v_product_type text;
        BEGIN
          SELECT type INTO v_product_type FROM public.products WHERE id = item.product_id;
          v_prod_deduct_qty := item.quantity * item.eff_factor;
          
          IF v_product_type = 'simple' THEN
            UPDATE public.products 
            SET stock = GREATEST(0, COALESCE(stock, 0) - v_prod_deduct_qty)
            WHERE id = item.product_id AND stock IS NOT NULL;
          ELSIF v_product_type IN ('processed', 'service') THEN
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
              IF item.removed_ingredients IS NOT NULL AND 
                 item.removed_ingredients @> to_jsonb(recipe.ing_name) THEN
                 CONTINUE;
              END IF;
              deduct_qty := public.convert_unit(recipe.recipe_qty, recipe.recipe_unit, recipe.stock_unit);
              IF deduct_qty IS NULL THEN
                IF lower(trim(recipe.recipe_unit)) = lower(trim(recipe.stock_unit)) THEN
                  deduct_qty := recipe.recipe_qty;
                ELSE
                  deduct_qty := NULL;
                END IF;
              END IF;
              IF deduct_qty IS NOT NULL THEN
                UPDATE public.products
                SET stock = GREATEST(0, COALESCE(stock, 0) - (deduct_qty * v_prod_deduct_qty))
                WHERE id = recipe.ingredient_id AND stock IS NOT NULL;
              END IF;
            END LOOP;
          END IF;
        END;
      END IF;
    END LOOP;
  END IF;
  RETURN new;
END;
$function$;

-- 5. Actualizar void_order_and_restore_stock
CREATE OR REPLACE FUNCTION public.void_order_and_restore_stock(p_order_id uuid, p_void_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_order record;
  v_item record;
  v_shift_status text;
begin
  IF NOT public.current_user_has_permission('pos_cancel') THEN
    RETURN json_build_object('success', false, 'message', 'No tienes permiso para anular ventas');
  END IF;

  IF p_void_reason IS NULL OR btrim(p_void_reason) = '' THEN
    RETURN json_build_object('success', false, 'message', 'Debes indicar un motivo de anulacion');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT found THEN
    RETURN json_build_object('success', false, 'message', 'Orden no encontrada');
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR v_order.business_id IS DISTINCT FROM public.get_user_business_id()) THEN
    RETURN json_build_object('success', false, 'message', 'No autorizado para esta operación');
  END IF;

  IF v_order.status = 'voided' THEN
    RETURN json_build_object('success', false, 'message', 'La venta ya esta anulada');
  END IF;

  IF EXISTS (SELECT 1 FROM public.sale_refunds WHERE order_id = p_order_id) THEN
    RETURN json_build_object('success', false, 'message', 'Esta venta tiene devoluciones registradas; no se puede anular.');
  END IF;

  SELECT cs.status INTO v_shift_status
  FROM public.cash_movements cm
  JOIN public.cash_shifts cs ON cs.id = cm.shift_id
  WHERE cm.reference_id = p_order_id AND cm.reference_type = 'order'
  ORDER BY cm.created_at DESC
  LIMIT 1;

  IF v_shift_status IN ('closed', 'reconciled') THEN
    RETURN json_build_object('success', false, 'message', 'Esta venta pertenece a un turno ya cerrado. Para revertirla, haz una Devolucion en la caja actual.');
  END IF;

  IF v_order.status = 'completed' THEN
    FOR v_item IN
      SELECT oi.product_id, (oi.quantity * coalesce(oi.conversion_factor, 1)) as restore_qty, p.type AS product_type
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = p_order_id
    LOOP
      IF v_item.product_type = 'simple' THEN
        UPDATE public.products
        SET stock = coalesce(stock, 0) + v_item.restore_qty
        WHERE id = v_item.product_id;
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.cash_movements
  WHERE reference_id = p_order_id AND reference_type = 'order';

  DELETE FROM public.client_transactions WHERE order_id = p_order_id;

  UPDATE public.orders
  SET status = 'voided',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = p_void_reason
  WHERE id = p_order_id;

  RETURN json_build_object('success', true, 'message', 'Venta anulada correctamente');
exception when others then
  RETURN json_build_object('success', false, 'message', SQLERRM);
end;
$function$;

-- 6. Actualizar void_order_item_and_restore_stock
CREATE OR REPLACE FUNCTION public.void_order_item_and_restore_stock(p_order_item_id uuid, p_void_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_item record;
  v_product_type text;
  v_restored boolean := false;
  v_order_voided boolean := false;
  v_remaining int;
  v_shift_status text;
  v_pm text;
  v_new_total numeric;
  v_restore_qty numeric;
begin
  IF NOT public.current_user_has_permission('pos_cancel') THEN
    RETURN json_build_object('success', false, 'message', 'No tienes permiso para anular');
  END IF;

  IF p_void_reason IS NULL OR btrim(p_void_reason) = '' THEN
    RETURN json_build_object('success', false, 'message', 'Debes indicar un motivo de anulacion');
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT found THEN
    RETURN json_build_object('success', false, 'message', 'Item no encontrado');
  END IF;

  IF v_item.status = 'canceled' THEN
    RETURN json_build_object('success', false, 'message', 'El item ya esta anulado');
  END IF;

  IF EXISTS (SELECT 1 FROM public.sale_refund_items WHERE order_item_id = p_order_item_id) THEN
    RETURN json_build_object('success', false, 'message', 'Este producto tiene una devolucion registrada; no se puede anular.');
  END IF;

  SELECT cs.status INTO v_shift_status
  FROM public.cash_movements cm
  JOIN public.cash_shifts cs ON cs.id = cm.shift_id
  WHERE cm.reference_id = v_item.order_id AND cm.reference_type = 'order'
  ORDER BY cm.created_at DESC
  LIMIT 1;

  IF v_shift_status IN ('closed', 'reconciled') THEN
    RETURN json_build_object('success', false, 'message', 'Esta venta pertenece a un turno ya cerrado. Para revertirla, haz una Devolucion en la caja actual.');
  END IF;

  SELECT payment_method INTO v_pm FROM public.orders WHERE id = v_item.order_id;

  SELECT type INTO v_product_type FROM public.products WHERE id = v_item.product_id;
  v_product_type := coalesce(v_product_type, 'unknown');
  v_restore_qty := v_item.quantity * coalesce(v_item.conversion_factor, 1);

  IF v_product_type = 'simple' THEN
    UPDATE public.products
    SET stock = coalesce(stock, 0) + v_restore_qty
    WHERE id = v_item.product_id AND stock IS NOT NULL;
    v_restored := true;
  END IF;

  UPDATE public.order_items
  SET status = 'canceled',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = p_void_reason
  WHERE id = p_order_item_id;

  SELECT count(*) INTO v_remaining
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status != 'canceled';

  IF v_remaining = 0 THEN
    DELETE FROM public.cash_movements
    WHERE reference_id = v_item.order_id AND reference_type = 'order';
    DELETE FROM public.client_transactions WHERE order_id = v_item.order_id;
    UPDATE public.orders
    SET status = 'voided',
        voided_at = now(),
        voided_by = auth.uid(),
        void_reason = coalesce(void_reason, 'Anulada al quitar todos los items')
    WHERE id = v_item.order_id;
    v_order_voided := true;
  ELSIF v_pm = 'credit' THEN
    SELECT total INTO v_new_total FROM public.orders WHERE id = v_item.order_id;
    UPDATE public.client_transactions
    SET amount = GREATEST(0, v_new_total)
    WHERE order_id = v_item.order_id AND type = 'debt';
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Item anulado correctamente',
    'restored_stock', v_restored,
    'order_voided', v_order_voided
  );
exception when others then
  RETURN json_build_object('success', false, 'message', SQLERRM);
end;
$function$;

-- 7. Actualizar delete_order_item_and_restore_stock
CREATE OR REPLACE FUNCTION public.delete_order_item_and_restore_stock(p_order_item_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_item record;
  v_product_type text;
  v_restored boolean := false;
  v_order_deleted boolean := false;
  v_remaining int;
  v_restore_qty numeric;
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
  v_restore_qty := v_item.quantity * coalesce(v_item.conversion_factor, 1);

  if v_product_type = 'simple' then
    update public.products
    set stock = coalesce(stock, 0) + v_restore_qty
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
$function$;

-- 8. Actualizar delete_order_and_restore_stock
CREATE OR REPLACE FUNCTION public.delete_order_and_restore_stock(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_order record;
  v_item record;
  v_product_type text;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return json_build_object('success', false, 'message', 'Orden no encontrada');
  end if;

  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or v_order.business_id is distinct from public.get_user_business_id()) then
    return json_build_object('success', false, 'message', 'No autorizado para esta operación');
  end if;

  if v_order.status = 'completed' then
    for v_item in
      select oi.*, (oi.quantity * coalesce(oi.conversion_factor, 1)) as restore_qty, p.type as product_type
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
    loop
      if v_item.product_type = 'simple' then
        update public.products
        set stock = coalesce(stock, 0) + v_item.restore_qty
        where id = v_item.product_id;
      end if;
    end loop;
  end if;

  delete from public.cash_movements
  where reference_id = p_order_id
    and reference_type = 'order';

  delete from public.client_transactions
  where order_id = p_order_id;

  delete from public.orders
  where id = p_order_id;

  return json_build_object('success', true, 'message', 'Venta eliminada correctamente');
exception when others then
  return json_build_object('success', false, 'message', SQLERRM);
end;
$function$;
