-- ============================================================================
-- Migraciones aplicadas el 14 de junio de 2026
-- Tema: Frontera Anulación/Devolución, exclusión mutua, manejo de crédito,
--       y corrección FK sale_refunds → cash_shifts.
-- Aplicadas vía Supabase MCP (no CLI local).
-- ============================================================================

-- 1. refund_void_mutual_exclusion_and_shift_boundary (20260614152942)
-- Agrega la frontera por turno (turno abierto → usar Anular, no Devolución)
-- y la exclusión mutua (ítem anulado no se puede devolver).
-- Reemplaza la versión anterior de process_sale_refund.

CREATE OR REPLACE FUNCTION public.process_sale_refund(p_order_id uuid, p_items jsonb, p_method text, p_reason text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_order record;
  v_shift_id uuid;
  v_refund_id uuid;
  v_total numeric := 0;
  v_method text := coalesce(nullif(btrim(p_method), ''), 'cash');
  v_elem jsonb;
  v_oi_id uuid;
  v_qty numeric;
  v_restock boolean;
  v_oi record;
  v_already numeric;
  v_amount numeric;
  v_ptype text;
  v_sale_shift_status text;
  v_is_credit boolean;
begin
  IF NOT public.current_user_has_permission('pos_refund') THEN
    RETURN json_build_object('success', false, 'message', 'No tienes permiso para hacer devoluciones');
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN json_build_object('success', false, 'message', 'Debes indicar un motivo de devolucion');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No hay items para devolver');
  END IF;

  v_business_id := public.get_user_business_id();
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT found THEN RETURN json_build_object('success', false, 'message', 'Venta no encontrada'); END IF;
  IF v_order.business_id <> v_business_id THEN RETURN json_build_object('success', false, 'message', 'La venta no pertenece a tu negocio'); END IF;
  IF v_order.status <> 'completed' THEN RETURN json_build_object('success', false, 'message', 'Solo se pueden devolver ventas completadas'); END IF;

  v_is_credit := (v_order.payment_method = 'credit');

  -- Frontera: turno abierto → usar Anular
  SELECT cs.status INTO v_sale_shift_status
  FROM public.cash_movements cm JOIN public.cash_shifts cs ON cs.id = cm.shift_id
  WHERE cm.reference_id = p_order_id AND cm.reference_type = 'order'
  ORDER BY cm.created_at DESC LIMIT 1;
  IF v_sale_shift_status = 'open' THEN
    RETURN json_build_object('success', false, 'message', 'Esta venta es de un turno abierto. Para revertirla usa Anular.');
  END IF;

  SELECT id INTO v_shift_id FROM public.cash_shifts
  WHERE opened_by = auth.uid() AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  IF v_shift_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Debes tener un turno abierto para registrar una devolucion');
  END IF;

  INSERT INTO public.sale_refunds (business_id, order_id, shift_id, refunded_by, refund_method, total_amount, reason)
  VALUES (v_business_id, p_order_id, v_shift_id, auth.uid(), CASE WHEN v_is_credit THEN 'credit' ELSE v_method END, 0, btrim(p_reason))
  RETURNING id INTO v_refund_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_oi_id   := (v_elem->>'order_item_id')::uuid;
    v_qty     := coalesce((v_elem->>'quantity')::numeric, 0);
    v_restock := coalesce((v_elem->>'restock')::boolean, false);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT * INTO v_oi FROM public.order_items WHERE id = v_oi_id FOR UPDATE;
    IF NOT found OR v_oi.order_id <> p_order_id THEN RAISE EXCEPTION 'Item % no pertenece a la venta', v_oi_id; END IF;
    IF v_oi.status = 'canceled' THEN RAISE EXCEPTION 'El producto % esta anulado y no se puede devolver', v_oi.product_name; END IF;

    SELECT coalesce(SUM(sri.quantity), 0) INTO v_already
    FROM public.sale_refund_items sri JOIN public.sale_refunds sr ON sr.id = sri.refund_id
    WHERE sri.order_item_id = v_oi_id AND sr.id <> v_refund_id;
    IF v_qty > (v_oi.quantity - v_already) THEN RAISE EXCEPTION 'Cantidad a devolver (%) excede lo pendiente para %', v_qty, v_oi.product_name; END IF;

    v_amount := round((v_oi.total_price / NULLIF(v_oi.quantity, 0)) * v_qty);

    IF v_restock THEN
      SELECT type INTO v_ptype FROM public.products WHERE id = v_oi.product_id;
      IF v_ptype = 'simple' THEN UPDATE public.products SET stock = coalesce(stock, 0) + v_qty WHERE id = v_oi.product_id AND stock IS NOT NULL;
      ELSE v_restock := false; END IF;
    END IF;

    INSERT INTO public.sale_refund_items (refund_id, order_item_id, product_id, product_name, quantity, unit_price, amount, restocked)
    VALUES (v_refund_id, v_oi_id, v_oi.product_id, v_oi.product_name, v_qty, v_oi.unit_price, v_amount, v_restock);
    v_total := v_total + v_amount;
  END LOOP;

  IF v_total <= 0 THEN RAISE EXCEPTION 'No hay monto que devolver'; END IF;
  UPDATE public.sale_refunds SET total_amount = v_total WHERE id = v_refund_id;

  -- Crédito: baja la deuda sin mover caja. Pagada: inserta refund.
  IF v_is_credit THEN
    UPDATE public.client_transactions SET amount = GREATEST(0, amount - v_total) WHERE order_id = p_order_id AND type = 'debt';
  ELSE
    INSERT INTO public.cash_movements (shift_id, created_by, type, amount, description, payment_method, reference_id, reference_type)
    VALUES (v_shift_id, auth.uid(), 'refund', v_total, 'Devolucion venta #' || coalesce(v_order.display_number, v_order.order_number::text), v_method, v_refund_id, 'sale_refund');
  END IF;

  RETURN json_build_object('success', true, 'refund_id', v_refund_id, 'total', v_total, 'is_credit', v_is_credit);
exception when others then
  RETURN json_build_object('success', false, 'message', SQLERRM);
end;
$function$;


-- 2. void_order_block_if_refunded (20260614153007)
-- Agrega exclusión mutua: no se puede anular una venta que tiene devoluciones.

CREATE OR REPLACE FUNCTION public.void_order_and_restore_stock(p_order_id uuid, p_void_reason text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF NOT found THEN RETURN json_build_object('success', false, 'message', 'Orden no encontrada'); END IF;
  IF v_order.status = 'voided' THEN RETURN json_build_object('success', false, 'message', 'La venta ya esta anulada'); END IF;

  -- Exclusión mutua
  IF EXISTS (SELECT 1 FROM public.sale_refunds WHERE order_id = p_order_id) THEN
    RETURN json_build_object('success', false, 'message', 'Esta venta tiene devoluciones registradas; no se puede anular.');
  END IF;

  SELECT cs.status INTO v_shift_status
  FROM public.cash_movements cm JOIN public.cash_shifts cs ON cs.id = cm.shift_id
  WHERE cm.reference_id = p_order_id AND cm.reference_type = 'order'
  ORDER BY cm.created_at DESC LIMIT 1;
  IF v_shift_status IN ('closed', 'reconciled') THEN
    RETURN json_build_object('success', false, 'message', 'Esta venta pertenece a un turno ya cerrado. Para revertirla, haz una Devolucion en la caja actual.');
  END IF;

  IF v_order.status = 'completed' THEN
    FOR v_item IN SELECT oi.product_id, oi.quantity, p.type AS product_type FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = p_order_id LOOP
      IF v_item.product_type = 'simple' THEN UPDATE public.products SET stock = coalesce(stock, 0) + v_item.quantity WHERE id = v_item.product_id; END IF;
    END LOOP;
  END IF;

  DELETE FROM public.cash_movements WHERE reference_id = p_order_id AND reference_type = 'order';
  DELETE FROM public.client_transactions WHERE order_id = p_order_id;
  UPDATE public.orders SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_void_reason WHERE id = p_order_id;

  RETURN json_build_object('success', true, 'message', 'Venta anulada correctamente');
exception when others then
  RETURN json_build_object('success', false, 'message', SQLERRM);
end;
$function$;


-- 3. void_order_item_block_if_refunded (20260614153037)
-- Exclusión mutua a nivel de ítem: un ítem con devolución no se puede anular.
-- También maneja ventas a crédito: anulación parcial reduce la deuda del cliente.

CREATE OR REPLACE FUNCTION public.void_order_item_and_restore_stock(p_order_item_id uuid, p_void_reason text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
begin
  IF NOT public.current_user_has_permission('pos_cancel') THEN
    RETURN json_build_object('success', false, 'message', 'No tienes permiso para anular');
  END IF;
  IF p_void_reason IS NULL OR btrim(p_void_reason) = '' THEN
    RETURN json_build_object('success', false, 'message', 'Debes indicar un motivo de anulacion');
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT found THEN RETURN json_build_object('success', false, 'message', 'Item no encontrado'); END IF;
  IF v_item.status = 'canceled' THEN RETURN json_build_object('success', false, 'message', 'El item ya esta anulado'); END IF;

  -- Exclusión mutua: ítem con devolución
  IF EXISTS (SELECT 1 FROM public.sale_refund_items WHERE order_item_id = p_order_item_id) THEN
    RETURN json_build_object('success', false, 'message', 'Este producto tiene una devolucion registrada; no se puede anular.');
  END IF;

  SELECT cs.status INTO v_shift_status
  FROM public.cash_movements cm JOIN public.cash_shifts cs ON cs.id = cm.shift_id
  WHERE cm.reference_id = v_item.order_id AND cm.reference_type = 'order'
  ORDER BY cm.created_at DESC LIMIT 1;
  IF v_shift_status IN ('closed', 'reconciled') THEN
    RETURN json_build_object('success', false, 'message', 'Esta venta pertenece a un turno ya cerrado. Para revertirla, haz una Devolucion en la caja actual.');
  END IF;

  SELECT payment_method INTO v_pm FROM public.orders WHERE id = v_item.order_id;
  SELECT type INTO v_product_type FROM public.products WHERE id = v_item.product_id;
  v_product_type := coalesce(v_product_type, 'unknown');

  IF v_product_type = 'simple' THEN
    UPDATE public.products SET stock = coalesce(stock, 0) + v_item.quantity WHERE id = v_item.product_id AND stock IS NOT NULL;
    v_restored := true;
  END IF;

  UPDATE public.order_items SET status = 'canceled', voided_at = now(), voided_by = auth.uid(), void_reason = p_void_reason WHERE id = p_order_item_id;

  SELECT count(*) INTO v_remaining FROM public.order_items WHERE order_id = v_item.order_id AND status != 'canceled';

  IF v_remaining = 0 THEN
    DELETE FROM public.cash_movements WHERE reference_id = v_item.order_id AND reference_type = 'order';
    DELETE FROM public.client_transactions WHERE order_id = v_item.order_id;
    UPDATE public.orders SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = coalesce(void_reason, 'Anulada al quitar todos los items') WHERE id = v_item.order_id;
    v_order_voided := true;
  ELSIF v_pm = 'credit' THEN
    -- Crédito parcial: deuda baja al nuevo total
    SELECT total INTO v_new_total FROM public.orders WHERE id = v_item.order_id;
    UPDATE public.client_transactions SET amount = GREATEST(0, v_new_total) WHERE order_id = v_item.order_id AND type = 'debt';
  END IF;

  RETURN json_build_object('success', true, 'message', 'Item anulado correctamente', 'restored_stock', v_restored, 'order_voided', v_order_voided);
exception when others then
  RETURN json_build_object('success', false, 'message', SQLERRM);
end;
$function$;


-- 4. sale_refunds_shift_fk_on_delete_set_null (20260614233828)
-- Permite limpiar historial de turnos sin error de FK.
-- Las devoluciones se conservan; shift_id pasa a NULL.

ALTER TABLE public.sale_refunds DROP CONSTRAINT sale_refunds_shift_id_fkey;
ALTER TABLE public.sale_refunds ADD CONSTRAINT sale_refunds_shift_id_fkey
  FOREIGN KEY (shift_id) REFERENCES public.cash_shifts(id) ON DELETE SET NULL;
