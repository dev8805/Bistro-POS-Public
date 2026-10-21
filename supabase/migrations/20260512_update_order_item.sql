-- RPC para editar un ítem de una venta histórica (cambiar producto y/o cantidad)
-- Maneja stock: restaura el viejo y descuenta el nuevo (solo productos 'simple')
-- El trigger recalculate_order_total actualiza subtotal/total automáticamente
CREATE OR REPLACE FUNCTION public.update_order_item(
  p_order_item_id  uuid,
  p_new_product_id uuid    DEFAULT NULL,
  p_new_quantity   numeric DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item               record;
  v_old_type           text;
  v_new_product        record;
  v_final_product_id   uuid;
  v_final_product_name text;
  v_final_unit_price   numeric;
  v_final_quantity     numeric;
  v_product_changed    boolean;
BEGIN
  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Ítem no encontrado');
  END IF;

  v_final_quantity := COALESCE(p_new_quantity, v_item.quantity);
  IF v_final_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'La cantidad debe ser mayor a 0');
  END IF;

  v_product_changed := p_new_product_id IS NOT NULL
                       AND p_new_product_id IS DISTINCT FROM v_item.product_id;

  IF v_product_changed THEN
    -- Restaurar stock del producto viejo (solo 'simple', consistente con RPCs existentes)
    SELECT type INTO v_old_type FROM public.products WHERE id = v_item.product_id;
    IF v_old_type = 'simple' THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) + v_item.quantity
      WHERE id = v_item.product_id AND stock IS NOT NULL;
    END IF;

    -- Obtener producto nuevo
    SELECT * INTO v_new_product FROM public.products WHERE id = p_new_product_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'message', 'Producto no encontrado');
    END IF;

    v_final_product_id   := v_new_product.id;
    v_final_product_name := v_new_product.name;
    v_final_unit_price   := v_new_product.price;

    -- Descontar stock del nuevo producto para la cantidad final
    IF v_new_product.type = 'simple' THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_final_quantity
      WHERE id = p_new_product_id AND stock IS NOT NULL;
    END IF;

  ELSE
    -- Mismo producto, solo cambia cantidad
    v_final_product_id   := v_item.product_id;
    v_final_product_name := v_item.product_name;
    v_final_unit_price   := v_item.unit_price;

    IF v_final_quantity != v_item.quantity THEN
      SELECT type INTO v_old_type FROM public.products WHERE id = v_item.product_id;
      IF v_old_type = 'simple' THEN
        -- delta positivo = descontar más; delta negativo = devolver stock
        UPDATE public.products
        SET stock = COALESCE(stock, 0) - (v_final_quantity - v_item.quantity)
        WHERE id = v_item.product_id AND stock IS NOT NULL;
      END IF;
    END IF;
  END IF;

  UPDATE public.order_items SET
    product_id       = v_final_product_id,
    product_name     = v_final_product_name,
    unit_price       = v_final_unit_price,
    total_price      = v_final_unit_price * v_final_quantity,
    quantity         = v_final_quantity,
    discount         = CASE WHEN v_product_changed THEN 0    ELSE discount         END,
    discount_percent = CASE WHEN v_product_changed THEN 0    ELSE discount_percent END,
    promotion_id     = CASE WHEN v_product_changed THEN NULL ELSE promotion_id     END,
    notes            = CASE WHEN v_product_changed THEN NULL ELSE notes            END,
    cooking_term     = CASE WHEN v_product_changed THEN NULL ELSE cooking_term     END
  WHERE id = p_order_item_id;

  RETURN json_build_object('success', true, 'message', 'Ítem actualizado correctamente');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
