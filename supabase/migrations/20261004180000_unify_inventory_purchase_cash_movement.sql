-- Migración: Unificar movimiento de compra de inventario en caja registradora
-- En compras de inventario al contado con descuento de caja, se registra UN SOLO
-- movimiento en cash_movements por el total de efectivo que sale del cajón,
-- con la descripción "Compra inventario: <proveedor>", en lugar de dividir
-- el dinero y multiplicarlo por cada producto de la factura.

CREATE OR REPLACE FUNCTION public.register_purchase(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_acc_src constant text := 'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇÝáàâäãåéèêëíìîïóòôöõúùûüñçý';
  c_acc_dst constant text := 'AAAAAAEEEEIIIIOOOOOUUUUNCYaaaaaaeeeeiiiiooooouuuuncy';
  c_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  v_business      uuid;
  v_user          uuid := auth.uid();

  v_code          text;
  v_msg           text;

  v_key           uuid;
  v_prev          jsonb;

  v_purchase_date timestamptz;
  v_evidence      text;

  v_supplier      jsonb;
  v_supplier_id   uuid;
  v_supplier_name text;

  v_payment       jsonb;
  v_is_credit     boolean;
  v_due_date      date;
  v_paid_amount   numeric;
  v_deduct        boolean;
  v_shift_id      uuid;
  v_methods       jsonb;
  v_credit_method text;

  v_payment_method text;
  v_payment_details jsonb;

  v_lines         jsonb;
  v_line          jsonb;
  v_n             int;
  v_i             int;
  v_total_amount  numeric := 0;
  v_methods_total numeric := 0;

  v_weights       numeric[] := '{}'::numeric[];
  v_weight_sum    numeric   := 0;
  v_dist_total    numeric;
  v_paid_shares   numeric[];

  v_product       jsonb;
  v_product_id    uuid;
  v_product_name  text;
  v_product_unit  text;
  v_is_for_sale   boolean;
  v_category_id   uuid;
  v_stock_before  numeric;
  v_tracks_stock  boolean;

  v_quantity      numeric;
  v_line_total    numeric;
  v_qty_txt       text;
  v_lot_id        uuid;
  v_debt_id       uuid;
  v_mv_id         uuid;
  v_new_price     numeric;
  v_line_paid     numeric;

  v_nick          text;
  v_nick_norm     text;
  v_has_nick      boolean;
  v_unit_norm     text;
  v_factor        numeric;
  v_has_unit      boolean;

  v_cash_needed   numeric := 0;
  v_available     numeric;
  v_method        jsonb;
  v_amount        numeric;

  v_lot_by_line   uuid[] := '{}'::uuid[];

  v_created_products uuid[] := '{}'::uuid[];
  v_lot_ids       uuid[] := '{}'::uuid[];
  v_debt_ids      uuid[] := '{}'::uuid[];
  v_mv_ids        uuid[] := '{}'::uuid[];
  v_result        jsonb;
BEGIN
  v_business := public.get_user_business_id();
  IF v_business IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'no_business',
      'message', 'Tu sesión no tiene un negocio asignado.');
  END IF;

  BEGIN
    IF p_payload ? 'business_id' AND p_payload->>'business_id' IS NOT NULL THEN
      IF p_payload->>'business_id' !~ c_uuid_re
         OR (p_payload->>'business_id')::uuid <> v_business THEN
        v_code := 'business_mismatch';
        v_msg  := 'No autorizado para esta operación.';
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
    END IF;

    IF NOT coalesce(public.current_user_has_permission('inv_purchase'), false) THEN
      v_code := 'forbidden';
      v_msg  := 'No tienes permiso para registrar compras y gastos.';
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;

    v_code := 'invalid_payload';
    v_msg  := 'Los datos del registro están incompletos.';

    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;
    IF p_payload->>'v' IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;
    IF coalesce(p_payload->>'idempotency_key', '') !~ c_uuid_re THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;
    v_key := (p_payload->>'idempotency_key')::uuid;

    v_purchase_date := coalesce(nullif(p_payload->>'purchase_date', '')::timestamptz, now());
    v_evidence      := nullif(btrim(coalesce(p_payload->>'evidence_url', '')), '');

    v_supplier := p_payload->'supplier';
    IF jsonb_typeof(v_supplier) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;
    IF v_supplier->>'id' IS NOT NULL THEN
      IF v_supplier->>'id' !~ c_uuid_re THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
    ELSIF jsonb_typeof(v_supplier->'new') = 'object' THEN
      IF btrim(coalesce(v_supplier->'new'->>'name', '')) = '' THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
    ELSE
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;

    v_payment       := coalesce(p_payload->'payment', '{}'::jsonb);
    v_is_credit     := coalesce((v_payment->>'is_credit')::boolean, false);
    v_due_date      := nullif(v_payment->>'due_date', '')::date;
    v_paid_amount   := round(coalesce(nullif(v_payment->>'paid_amount', '')::numeric, 0));
    v_deduct        := coalesce((v_payment->>'deduct_from_cash')::boolean, false);
    v_credit_method := nullif(btrim(coalesce(v_payment->>'credit_initial_method', '')), '');

    IF coalesce(v_payment->>'shift_id', '') <> '' THEN
      IF v_payment->>'shift_id' !~ c_uuid_re THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
      v_shift_id := (v_payment->>'shift_id')::uuid;
    END IF;

    v_methods := CASE
      WHEN jsonb_typeof(v_payment->'methods') = 'array' THEN v_payment->'methods'
      ELSE '[]'::jsonb
    END;
    IF v_is_credit THEN
      v_methods := '[]'::jsonb;
    END IF;

    IF v_is_credit AND v_due_date IS NULL THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;
    IF v_paid_amount < 0 THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;

    IF v_is_credit THEN
      v_payment_method := v_credit_method;
      v_payment_details := NULL;
    ELSIF v_methods IS NOT NULL AND jsonb_array_length(v_methods) > 1 THEN
      v_payment_method := 'Dividido';
      v_payment_details := v_methods;
    ELSIF v_methods IS NOT NULL AND jsonb_array_length(v_methods) = 1 THEN
      v_payment_method := coalesce(v_methods->0->>'method', v_methods->0->>'mapped_id');
      v_payment_details := NULL;
    ELSE
      v_payment_method := NULL;
      v_payment_details := NULL;
    END IF;

    IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;
    v_lines := p_payload->'lines';
    v_n     := jsonb_array_length(v_lines);
    IF v_n < 1 THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;

    FOR v_i IN 0 .. v_n - 1 LOOP
      v_line := v_lines->v_i;
      IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;

      v_quantity   := nullif(v_line->>'quantity', '')::numeric;
      v_line_total := nullif(v_line->>'line_total', '')::numeric;
      IF v_quantity IS NULL OR v_quantity <= 0 THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
      IF v_line_total IS NULL OR v_line_total < 0 THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;

      v_product := v_line->'product';
      IF jsonb_typeof(v_product) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
      IF v_product->>'id' IS NOT NULL THEN
        IF v_product->>'id' !~ c_uuid_re THEN
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
      ELSIF jsonb_typeof(v_product->'new') = 'object' THEN
        IF btrim(coalesce(v_product->'new'->>'name', '')) = '' THEN
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
        IF coalesce(nullif(v_product->'new'->>'cost', '')::numeric, -1) < 0 THEN
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
        IF coalesce(v_product->'new'->>'category_id', '') <> ''
           AND v_product->'new'->>'category_id' !~ c_uuid_re THEN
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
      ELSE
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;

      IF jsonb_typeof(v_line->'purchase_unit') = 'object' THEN
        IF coalesce(nullif(v_line->'purchase_unit'->>'conversion_factor', '')::numeric, 0) <= 0 THEN
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
      END IF;

      IF coalesce(v_line->>'new_price', '') <> ''
         AND nullif(v_line->>'new_price', '')::numeric < 0 THEN
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;

      v_total_amount := v_total_amount + v_line_total;
      v_weights      := v_weights || v_line_total;
    END LOOP;

    SELECT coalesce(sum(round(coalesce(nullif(m->>'amount', '')::numeric, 0))), 0)
      INTO v_methods_total
      FROM jsonb_array_elements(v_methods) AS m;

    IF v_methods_total > round(v_total_amount) OR v_paid_amount > round(v_total_amount) THEN
      v_code := 'overpayment';
      v_msg  := 'La suma de los pagos supera el total.';
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;

    v_code := NULL;
    v_msg  := NULL;
  EXCEPTION WHEN OTHERS THEN
    IF v_code IS NULL THEN
      v_code := 'invalid_payload';
      v_msg  := 'Los datos del registro están incompletos.';
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', v_code, 'message', v_msg);
  END;

  BEGIN
    BEGIN
      INSERT INTO public.register_idempotency (key, business_id, operation)
      VALUES (v_key, v_business, 'purchase');
    EXCEPTION WHEN unique_violation THEN
      SELECT ri.result INTO v_prev
        FROM public.register_idempotency ri
       WHERE ri.key = v_key
         AND ri.business_id = v_business
         AND ri.operation = 'purchase';
      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'invalid_payload',
          'message', 'La clave de esta operación ya se usó en otro registro.');
      END IF;
      RETURN coalesce(v_prev, jsonb_build_object('ok', true))
             || jsonb_build_object('already_processed', true);
    END;

    IF v_supplier->>'id' IS NOT NULL THEN
      SELECT s.id, s.name
        INTO v_supplier_id, v_supplier_name
        FROM public.suppliers s
       WHERE s.id = (v_supplier->>'id')::uuid
         AND s.business_id = v_business;
      IF NOT FOUND THEN
        v_code := 'supplier_not_found';
        v_msg  := 'El proveedor ya no existe.';
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
    ELSE
      v_supplier_name := btrim(v_supplier->'new'->>'name');
      INSERT INTO public.suppliers (business_id, name, nit, phone, address)
      VALUES (
        v_business,
        v_supplier_name,
        nullif(btrim(coalesce(v_supplier->'new'->>'nit', '')), ''),
        nullif(btrim(coalesce(v_supplier->'new'->>'phone', '')), ''),
        nullif(btrim(coalesce(v_supplier->'new'->>'address', '')), ''))
      RETURNING id INTO v_supplier_id;
    END IF;

    IF v_shift_id IS NOT NULL THEN
      PERFORM 1
         FROM public.cash_shifts cs
        WHERE cs.id = v_shift_id
          AND cs.business_id = v_business
          AND cs.status = 'open';
      IF NOT FOUND THEN
        v_code := 'shift_invalid';
        v_msg  := 'El turno de caja ya no está abierto.';
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
    END IF;

    -- Validación de saldo disponible en efectivo físico
    IF NOT v_is_credit AND v_deduct AND v_shift_id IS NOT NULL THEN
      SELECT coalesce(sum(round(coalesce(nullif(m->>'amount', '')::numeric, 0))), 0)
        INTO v_cash_needed
        FROM jsonb_array_elements(v_methods) AS m
       WHERE coalesce(nullif(btrim(coalesce(m->>'mapped_id', '')), ''), 'cash') = 'cash';

      IF v_cash_needed > 0 THEN
        v_available := coalesce(public.calculate_expected_cash(v_shift_id), 0);
        IF v_cash_needed > v_available THEN
          v_code := 'insufficient_cash_balance';
          v_msg  := 'Saldo insuficiente en efectivo. Disponible: $'
                    || round(v_available)::text;
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
      END IF;
    ELSIF v_is_credit AND v_deduct AND v_shift_id IS NOT NULL AND v_paid_amount > 0 THEN
      IF coalesce(nullif(btrim(coalesce(v_credit_method, '')), ''), 'cash') = 'cash' THEN
        v_available := coalesce(public.calculate_expected_cash(v_shift_id), 0);
        IF v_paid_amount > v_available THEN
          v_code := 'insufficient_cash_balance';
          v_msg  := 'Saldo insuficiente en efectivo para el abono. Disponible: $'
                    || round(v_available)::text;
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
      END IF;
    END IF;

    SELECT coalesce(sum(w), 0) INTO v_weight_sum FROM unnest(v_weights) AS w;
    IF v_weight_sum <= 0 THEN
      v_weights    := array_fill(1::numeric, ARRAY[v_n]);
      v_weight_sum := v_n;
    END IF;

    IF v_is_credit AND v_paid_amount > 0 THEN
      v_dist_total  := v_paid_amount;
      v_paid_shares := (
        WITH e AS (
          SELECT i AS idx,
                 wt,
                 floor(v_dist_total * wt / v_weight_sum) AS base,
                 (v_dist_total * wt / v_weight_sum)
                   - floor(v_dist_total * wt / v_weight_sum) AS frac
            FROM unnest(v_weights) WITH ORDINALITY AS t(wt, i)
        ), r AS (
          SELECT idx, wt, base, frac,
                 row_number() OVER (ORDER BY frac DESC, wt DESC, idx ASC) AS rn,
                 v_dist_total - sum(base) OVER () AS residue
            FROM e
        )
        SELECT array_agg(base + CASE WHEN rn <= residue THEN 1 ELSE 0 END ORDER BY idx)
          FROM r);
    ELSE
      v_paid_shares := array_fill(0::numeric, ARRAY[v_n]);
    END IF;

    FOR v_i IN 0 .. v_n - 1 LOOP
      v_line       := v_lines->v_i;
      v_product    := v_line->'product';
      v_quantity   := (v_line->>'quantity')::numeric;
      v_line_total := (v_line->>'line_total')::numeric;

      IF v_product->>'id' IS NOT NULL THEN
        SELECT p.id, p.name, coalesce(p.unit, 'Und'), p.stock, (p.stock IS NOT NULL)
          INTO v_product_id, v_product_name, v_product_unit, v_stock_before, v_tracks_stock
          FROM public.products p
         WHERE p.id = (v_product->>'id')::uuid
            AND p.business_id = v_business
            FOR UPDATE;
        IF NOT FOUND THEN
          v_code := 'product_not_found';
          v_msg  := 'Un producto de la factura ya no existe en tu catálogo.';
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
      ELSE
        v_category_id := nullif(v_product->'new'->>'category_id', '')::uuid;
        IF v_category_id IS NOT NULL THEN
          PERFORM 1
             FROM public.categories c
            WHERE c.id = v_category_id
              AND c.business_id = v_business;
          IF NOT FOUND THEN
            v_code := 'invalid_payload';
            v_msg  := 'La categoría del producto nuevo no pertenece a tu negocio.';
            RAISE EXCEPTION 'register_purchase_abort';
          END IF;
        END IF;

        v_is_for_sale  := coalesce((v_product->'new'->>'is_for_sale')::boolean, true);
        v_product_name := btrim(v_product->'new'->>'name');
        v_product_unit := coalesce(nullif(btrim(coalesce(v_product->'new'->>'unit', '')), ''), 'Und');

        INSERT INTO public.products (
          business_id, name, category_id, type, is_active, is_for_sale,
          cost, price, unit, description, nicknames,
          purchase_unit, conversion_factor, barcode, image_url, stock)
        VALUES (
          v_business,
          v_product_name,
          v_category_id,
          'simple',
          true,
          v_is_for_sale,
          coalesce(nullif(v_product->'new'->>'cost', '')::numeric, 0),
          CASE WHEN v_is_for_sale
               THEN coalesce(nullif(v_product->'new'->>'price', '')::numeric, 0)
               ELSE 0 END,
          v_product_unit,
          CASE WHEN v_is_for_sale THEN 'Producto para venta' ELSE 'Insumo' END,
          '{}'::text[],
          NULL,
          1,
          NULL,
          NULL,
          0)
        RETURNING id INTO v_product_id;

        v_stock_before     := 0;
        v_tracks_stock     := true;
        v_created_products := v_created_products || v_product_id;
      END IF;

      IF coalesce((v_line->>'add_nickname')::boolean, false) THEN
        v_nick := btrim(coalesce(v_line->>'ocr_name', ''));
        IF v_nick <> '' THEN
          v_nick_norm := regexp_replace(
                           lower(translate(v_nick, c_acc_src, c_acc_dst)),
                           '^\s+|\s+$', '', 'g');

          SELECT EXISTS (
            SELECT 1
              FROM public.products p
              CROSS JOIN unnest(coalesce(p.nicknames, '{}'::text[])) AS n(val)
             WHERE p.id = v_product_id
               AND regexp_replace(
                     lower(translate(n.val, c_acc_src, c_acc_dst)),
                     '^\s+|\s+$', '', 'g') = v_nick_norm
          ) INTO v_has_nick;

          IF NOT v_has_nick THEN
            UPDATE public.products
               SET nicknames = array_append(coalesce(nicknames, '{}'::text[]), v_nick)
             WHERE id = v_product_id;
          END IF;
        END IF;
      END IF;

      IF jsonb_typeof(v_line->'purchase_unit') = 'object' THEN
        v_factor := (v_line->'purchase_unit'->>'conversion_factor')::numeric;

        v_unit_norm := btrim(regexp_replace(
                         lower(translate(
                           coalesce(v_line->'purchase_unit'->>'unit_name', ''),
                           c_acc_src, c_acc_dst)),
                         '\s+', ' ', 'g'));
        IF right(v_unit_norm, 2) = 'es' AND length(v_unit_norm) > 4 THEN
          v_unit_norm := left(v_unit_norm, length(v_unit_norm) - 2);
        ELSIF right(v_unit_norm, 1) = 's' AND length(v_unit_norm) > 3 THEN
          v_unit_norm := left(v_unit_norm, length(v_unit_norm) - 1);
        END IF;

        IF v_unit_norm <> '' AND v_factor > 0 THEN
          SELECT EXISTS (
            SELECT 1
              FROM public.product_purchase_units pu
              CROSS JOIN LATERAL (
                SELECT btrim(regexp_replace(
                         lower(translate(coalesce(pu.unit_name, ''), c_acc_src, c_acc_dst)),
                         '\s+', ' ', 'g')) AS s
              ) z
             WHERE pu.product_id = v_product_id
               AND CASE
                     WHEN right(z.s, 2) = 'es' AND length(z.s) > 4 THEN left(z.s, length(z.s) - 2)
                     WHEN right(z.s, 1) = 's'  AND length(z.s) > 3 THEN left(z.s, length(z.s) - 1)
                     ELSE z.s
                   END = v_unit_norm
          ) INTO v_has_unit;

          IF NOT v_has_unit THEN
            INSERT INTO public.product_purchase_units (product_id, unit_name, conversion_factor)
            VALUES (v_product_id, v_unit_norm, v_factor);
          END IF;
        END IF;
      END IF;

      IF coalesce(v_line->>'new_price', '') <> '' THEN
        v_new_price := (v_line->>'new_price')::numeric;
        UPDATE public.products
           SET price = v_new_price
         WHERE id = v_product_id;
      END IF;

      v_lot_id := NULL;
      IF v_quantity > 0 AND v_tracks_stock THEN
        INSERT INTO public.inventory_lots (
          business_id, product_id, initial_quantity, remaining_quantity,
          unit_cost, purchase_date, supplier_name)
        VALUES (
          v_business,
          v_product_id,
          v_quantity,
          greatest(0, v_quantity + least(0, coalesce(v_stock_before, 0))),
          v_line_total / v_quantity,
          v_purchase_date,
          v_supplier_name)
        RETURNING id INTO v_lot_id;

        v_lot_ids := v_lot_ids || v_lot_id;

        UPDATE public.products
           SET stock = greatest(0, coalesce(stock, 0) + v_quantity)
         WHERE id = v_product_id;
      END IF;

      v_qty_txt := v_quantity::text;
      IF position('.' IN v_qty_txt) > 0 THEN
        v_qty_txt := rtrim(rtrim(v_qty_txt, '0'), '.');
      END IF;

      v_lot_by_line := v_lot_by_line || v_lot_id;

      IF v_line_total > 0 THEN
        IF v_is_credit THEN
          v_line_paid := coalesce(v_paid_shares[v_i + 1], 0);
          INSERT INTO public.business_debts (
            business_id, type, creditor_name, description, total_amount, paid_amount,
            status, due_date, supplier_id, inventory_lot_id, evidence_url, document_date, created_at, created_by)
          VALUES (
            v_business, 'supplier', v_supplier_name,
            'Compra a crédito: ' || v_product_name || ' (' || v_qty_txt || ' ' || v_product_unit || ')',
            v_line_total, v_line_paid,
            CASE WHEN v_line_paid >= v_line_total THEN 'paid' ELSE 'active' END,
            v_due_date, v_supplier_id, v_lot_id, v_evidence, (v_purchase_date)::date, clock_timestamp(), v_user)
          RETURNING id INTO v_debt_id;
        ELSE
          INSERT INTO public.business_debts (
            business_id, type, creditor_name, description, total_amount, paid_amount,
            status, supplier_id, inventory_lot_id, evidence_url, payment_method, payment_details, document_date, created_at, created_by)
          VALUES (
            v_business, 'supplier', v_supplier_name,
            'Compra de contado: ' || v_product_name || ' (' || v_qty_txt || ' ' || v_product_unit || ')',
            v_line_total, v_line_total, 'paid',
            v_supplier_id, v_lot_id, v_evidence, v_payment_method, v_payment_details, (v_purchase_date)::date, clock_timestamp(), v_user)
          RETURNING id INTO v_debt_id;
        END IF;
        v_debt_ids := v_debt_ids || v_debt_id;
      END IF;
    END LOOP;

    IF v_is_credit AND v_paid_amount > 0 THEN
      INSERT INTO public.business_debts (
        business_id, type, creditor_name, description,
        total_amount, paid_amount, status, payment_method, payment_details, document_date, created_at, created_by)
      VALUES (
        v_business, 'supplier', v_supplier_name, 'Abono: Pago al momento de compra',
        0, v_paid_amount, 'paid', v_payment_method, v_payment_details, (v_purchase_date)::date, clock_timestamp(), v_user)
      RETURNING id INTO v_debt_id;
      v_debt_ids := v_debt_ids || v_debt_id;
    END IF;

    ----------------------------------------------------------------------
    -- 9. Movimientos de caja unificados.
    -- 9a. Contado con descuento de caja: se registra UN SOLO movimiento de egreso
    --     en cash_movements por el total de efectivo físico ('cash') que salió
    --     del cajón, con descripción "Compra inventario: <proveedor>".
    ----------------------------------------------------------------------
    IF NOT v_is_credit AND v_deduct AND v_shift_id IS NOT NULL THEN
      FOR v_method IN SELECT value FROM jsonb_array_elements(v_methods) LOOP
        v_amount := round(coalesce(nullif(v_method->>'amount', '')::numeric, 0));
        IF v_amount > 0 AND coalesce(nullif(btrim(coalesce(v_method->>'mapped_id', '')), ''), 'cash') = 'cash' THEN
          INSERT INTO public.cash_movements (
            shift_id, created_by, type, amount, description,
            payment_method, reference_id, reference_type)
          VALUES (
            v_shift_id, v_user, 'purchase', v_amount,
            'Compra inventario: ' || v_supplier_name,
            'cash',
            CASE WHEN array_length(v_debt_ids, 1) > 0 THEN v_debt_ids[1] ELSE NULL END,
            'purchase')
          RETURNING id INTO v_mv_id;
          v_mv_ids := v_mv_ids || v_mv_id;
        END IF;
      END LOOP;
    END IF;

    -- 9b. Crédito con abono: solo registra movimiento en caja si sale de caja
    --     y el método del abono es efectivo físico.
    IF v_is_credit AND v_paid_amount > 0 AND v_deduct AND v_shift_id IS NOT NULL THEN
      IF coalesce(nullif(btrim(coalesce(v_credit_method, '')), ''), 'cash') = 'cash' THEN
        INSERT INTO public.cash_movements (
          shift_id, created_by, type, amount, description, payment_method,
          reference_id, reference_type)
        VALUES (
          v_shift_id, v_user, 'purchase', v_paid_amount,
          'Abono proveedor: ' || v_supplier_name || ' · Compra inicial',
          'cash',
          CASE WHEN array_length(v_debt_ids, 1) > 0 THEN v_debt_ids[1] ELSE NULL END,
          'purchase')
        RETURNING id INTO v_mv_id;
        v_mv_ids := v_mv_ids || v_mv_id;
      END IF;
    END IF;

    v_result := jsonb_build_object(
      'ok', true,
      'already_processed', false,
      'supplier_id', v_supplier_id,
      'created_product_ids', to_jsonb(v_created_products),
      'lot_ids', to_jsonb(v_lot_ids),
      'debt_ids', to_jsonb(v_debt_ids),
      'cash_movement_ids', to_jsonb(v_mv_ids),
      'expense_id', NULL,
      'totals', jsonb_build_object('lines', v_n, 'amount', v_total_amount));

    UPDATE public.register_idempotency
       SET result = v_result
     WHERE key = v_key
       AND business_id = v_business;

    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    IF v_code IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'internal_error',
        'message', 'Error interno al registrar la compra. Intenta de nuevo.');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', v_code, 'message', v_msg);
  END;
END;
$function$;
