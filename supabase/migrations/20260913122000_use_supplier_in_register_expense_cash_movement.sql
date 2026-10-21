-- Migración para que register_expense incluya el nombre del proveedor en la descripción del movimiento de caja:
-- En Paso 10: v_move_desc usa coalesce(nullif(btrim(v_supplier_name), ''), v_category) con separador ' · '
-- para que el reporte de turno, la tirilla térmica y el PDF desglosen el proveedor correctamente.

CREATE OR REPLACE FUNCTION public.register_expense(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- sesion y control de errores
  v_business         uuid;
  v_user             uuid := auth.uid();
  v_code             text := 'invalid_payload';
  v_message          text := 'Los datos del registro están incompletos.';

  -- idempotencia
  v_key              uuid;
  v_prev             jsonb;

  -- datos del gasto
  v_amount           numeric;
  v_desc             text;
  v_category         text;
  v_receipt_url      text;
  v_expense_date     date;
  v_today            date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_created_at       timestamptz;

  -- proveedor
  v_supplier         jsonb;
  v_supplier_id      uuid;
  v_supplier_name    text;
  v_supplier_nit     text;
  v_supplier_created boolean := false;

  -- categoria
  v_category_id      uuid;

  -- pago
  v_payment          jsonb;
  v_is_credit        boolean;
  v_due_date         date;
  v_paid             numeric;
  v_deduct           boolean;
  v_shift_in         uuid;
  v_shift            uuid;
  v_methods          jsonb;
  v_eff_methods      jsonb;
  v_methods_total    numeric := 0;
  v_default_method   text;
  v_credit_method    text;
  v_cash_needed      numeric := 0;
  v_available        numeric;

  -- escrituras
  v_expense_id       uuid;
  v_debt_id          uuid;
  v_debt_ids         uuid[] := '{}';
  v_move_id          uuid;
  v_move_ids         uuid[] := '{}';
  v_move_desc        text;
  v_status           text;
  m                  jsonb;

  v_result           jsonb;
BEGIN
  -- ======================================================================
  -- Paso 0 - negocio derivado de la sesion (nunca del payload)
  -- ======================================================================
  v_code := 'no_business';
  v_message := 'Tu sesión no tiene un negocio asignado.';
  v_business := public.get_user_business_id();
  IF v_business IS NULL THEN
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  -- ======================================================================
  -- Paso 1 - el business_id del payload solo sirve para rechazar (Req 17.11)
  -- ======================================================================
  v_code := 'business_mismatch';
  v_message := 'No autorizado para esta operación.';
  IF nullif(p_payload->>'business_id', '') IS NOT NULL
     AND (p_payload->>'business_id')::uuid IS DISTINCT FROM v_business THEN
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  -- ======================================================================
  -- Paso 2 - permiso (Req 14.2)
  -- ======================================================================
  v_code := 'forbidden';
  v_message := 'No tienes permiso para registrar compras y gastos.';
  IF NOT public.current_user_has_permission('inv_purchase') THEN
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  -- ======================================================================
  -- Paso 3 - validacion del payload (Req 11.5)
  -- ======================================================================
  v_code := 'invalid_payload';
  v_message := 'Los datos del registro están incompletos.';

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  IF coalesce(p_payload->>'v', '') <> '1' THEN
    v_message := 'La versión del registro no es compatible.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  v_key := nullif(p_payload->>'idempotency_key', '')::uuid;
  IF v_key IS NULL THEN
    v_message := 'Falta la clave de idempotencia del registro.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  v_amount := coalesce((nullif(p_payload->>'amount', ''))::numeric, 0);
  IF v_amount <= 0 THEN
    v_message := 'El valor del gasto debe ser mayor que cero.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  v_category := upper(btrim(coalesce(p_payload->>'category', '')));
  IF v_category = '' THEN
    v_message := 'La categoría del gasto es obligatoria.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  v_desc := btrim(coalesce(p_payload->>'description', ''));
  v_receipt_url := nullif(btrim(coalesce(p_payload->>'receipt_url', '')), '');

  v_expense_date := coalesce((nullif(p_payload->>'expense_date', ''))::date, v_today);
  IF v_expense_date > v_today THEN
    v_message := 'La fecha del gasto no puede ser posterior a hoy.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;
  -- Mismo instante que fija hoy el frontend: 12:00 del dia elegido en hora colombiana.
  v_created_at := ((v_expense_date::text || ' 12:00:00')::timestamp) AT TIME ZONE 'America/Bogota';

  -- proveedor obligatorio (Req 5.8): id existente o datos de uno nuevo
  v_supplier := p_payload->'supplier';
  IF v_supplier IS NULL OR jsonb_typeof(v_supplier) <> 'object' THEN
    v_message := 'El proveedor del gasto es obligatorio.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  -- bloque de pago
  v_payment := coalesce(p_payload->'payment', '{}'::jsonb);
  IF jsonb_typeof(v_payment) <> 'object' THEN
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  v_is_credit := coalesce((nullif(v_payment->>'is_credit', ''))::boolean, false);
  v_due_date  := (nullif(v_payment->>'due_date', ''))::date;
  v_paid      := coalesce((nullif(v_payment->>'paid_amount', ''))::numeric, 0);
  v_deduct    := coalesce((nullif(v_payment->>'deduct_from_cash', ''))::boolean, false);
  v_shift_in  := (nullif(v_payment->>'shift_id', ''))::uuid;
  v_credit_method := nullif(btrim(coalesce(v_payment->>'credit_initial_method', '')), '');
  v_methods   := coalesce(v_payment->'methods', '[]'::jsonb);
  IF jsonb_typeof(v_methods) <> 'array' THEN
    v_methods := '[]'::jsonb;
  END IF;

  IF v_is_credit AND v_due_date IS NULL THEN
    v_message := 'El crédito requiere una fecha de vencimiento.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  IF v_paid < 0 THEN
    v_message := 'El abono inicial no puede ser negativo.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_methods) je
    WHERE coalesce((nullif(je.value->>'amount', ''))::numeric, 0) < 0
  ) THEN
    v_message := 'Un método de pago tiene un valor negativo.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  SELECT coalesce(sum(coalesce((nullif(je.value->>'amount', ''))::numeric, 0)), 0)
    INTO v_methods_total
    FROM jsonb_array_elements(v_methods) je;

  v_code := 'overpayment';
  v_message := 'La suma de los pagos supera el total.';
  IF v_methods_total > v_amount THEN
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  v_default_method := coalesce(
    nullif(btrim(coalesce(p_payload->>'payment_method', '')), ''),
    nullif(btrim(coalesce(v_methods->0->>'mapped_id', '')), ''),
    'cash'
  );

  -- ======================================================================
  -- Paso 4 - idempotencia dentro de la misma transaccion (Req 12.9)
  -- ======================================================================
  v_code := 'internal_error';
  v_message := NULL;
  BEGIN
    INSERT INTO public.register_idempotency (key, business_id, operation)
    VALUES (v_key, v_business, 'expense');
  EXCEPTION WHEN unique_violation THEN
    SELECT ri.result INTO v_prev
      FROM public.register_idempotency ri
     WHERE ri.key = v_key
       AND ri.business_id = v_business
       AND ri.operation = 'expense';
    IF NOT FOUND THEN
      v_code := 'invalid_payload';
      v_message := 'La clave de idempotencia ya se usó en otro registro.';
      RAISE EXCEPTION 'register_expense: %', v_code;
    END IF;
    RETURN coalesce(v_prev, jsonb_build_object('ok', true))
           || jsonb_build_object('already_processed', true);
  END;

  -- ======================================================================
  -- Paso 5 - turno y saldo de caja (Req 11.5). Valida antes de escribir.
  -- ======================================================================
  v_code := 'shift_invalid';
  v_message := 'El turno de caja ya no está abierto.';
  IF v_shift_in IS NOT NULL THEN
    SELECT cs.id INTO v_shift
      FROM public.cash_shifts cs
     WHERE cs.id = v_shift_in
       AND cs.business_id = v_business
       AND cs.status = 'open';
    IF v_shift IS NULL THEN
      RAISE EXCEPTION 'register_expense: %', v_code;
    END IF;
  ELSE
    v_shift := public.get_active_shift();
  END IF;

  IF (NOT v_is_credit) AND v_deduct THEN
    IF v_shift IS NULL THEN
      v_message := 'No hay un turno de caja abierto para registrar la salida de efectivo.';
      RAISE EXCEPTION 'register_expense: %', v_code;
    END IF;

    IF v_methods_total > 0 THEN
      SELECT jsonb_agg(je.value)
        INTO v_eff_methods
        FROM jsonb_array_elements(v_methods) je
       WHERE coalesce((nullif(je.value->>'amount', ''))::numeric, 0) > 0;
    ELSE
      v_eff_methods := jsonb_build_array(
        jsonb_build_object('mapped_id', v_default_method, 'amount', v_amount)
      );
    END IF;

    SELECT coalesce(sum((nullif(je.value->>'amount', ''))::numeric), 0)
      INTO v_cash_needed
      FROM jsonb_array_elements(coalesce(v_eff_methods, '[]'::jsonb)) je
     WHERE coalesce(nullif(btrim(coalesce(je.value->>'mapped_id', '')), ''), 'cash') = 'cash';

    IF v_cash_needed > 0 THEN
      v_available := public.calculate_expected_cash(v_shift);
      v_code := 'insufficient_cash_balance';
      v_message := 'Saldo insuficiente en efectivo. Disponible: $' || public.fmt_money(v_available) || '.';
      IF v_cash_needed > v_available THEN
        RAISE EXCEPTION 'register_expense: %', v_code;
      END IF;
    END IF;
  ELSIF v_is_credit AND v_paid > 0 AND v_deduct THEN
    IF v_shift IS NULL THEN
      v_message := 'No hay un turno de caja abierto para registrar la salida de efectivo del abono.';
      RAISE EXCEPTION 'register_expense: %', v_code;
    END IF;

    IF v_methods_total > 0 THEN
      SELECT jsonb_agg(je.value)
        INTO v_eff_methods
        FROM jsonb_array_elements(v_methods) je
       WHERE coalesce((nullif(je.value->>'amount', ''))::numeric, 0) > 0;
    ELSE
      v_eff_methods := jsonb_build_array(
        jsonb_build_object('mapped_id', coalesce(v_credit_method, v_default_method, 'cash'), 'amount', v_paid)
      );
    END IF;

    SELECT coalesce(sum((nullif(je.value->>'amount', ''))::numeric), 0)
      INTO v_cash_needed
      FROM jsonb_array_elements(coalesce(v_eff_methods, '[]'::jsonb)) je
     WHERE coalesce(nullif(btrim(coalesce(je.value->>'mapped_id', '')), ''), 'cash') = 'cash';

    IF v_cash_needed > 0 THEN
      v_available := public.calculate_expected_cash(v_shift);
      v_code := 'insufficient_cash_balance';
      v_message := 'Saldo insuficiente en efectivo para el abono. Disponible: $' || public.fmt_money(v_available) || '.';
      IF v_cash_needed > v_available THEN
        RAISE EXCEPTION 'register_expense: %', v_code;
      END IF;
    END IF;
  END IF;

  -- ======================================================================
  -- Paso 6 - proveedor: existente validado por negocio, o nuevo (Req 17.7)
  -- ======================================================================
  IF nullif(v_supplier->>'id', '') IS NOT NULL THEN
    v_code := 'supplier_not_found';
    v_message := 'El proveedor ya no existe.';
    SELECT s.id, s.name INTO v_supplier_id, v_supplier_name
      FROM public.suppliers s
     WHERE s.id = (v_supplier->>'id')::uuid
       AND s.business_id = v_business;
    IF v_supplier_id IS NULL THEN
      RAISE EXCEPTION 'register_expense: %', v_code;
    END IF;
  ELSIF jsonb_typeof(v_supplier->'new') = 'object' THEN
    v_code := 'invalid_payload';
    v_message := 'El proveedor nuevo necesita un nombre.';
    v_supplier_name := btrim(coalesce(v_supplier->'new'->>'name', ''));
    IF v_supplier_name = '' THEN
      RAISE EXCEPTION 'register_expense: %', v_code;
    END IF;
    v_supplier_nit := nullif(btrim(coalesce(v_supplier->'new'->>'nit', '')), '');

    v_code := 'internal_error';
    v_message := NULL;
    INSERT INTO public.suppliers (business_id, name, nit)
    VALUES (v_business, v_supplier_name, v_supplier_nit)
    RETURNING id INTO v_supplier_id;
    v_supplier_created := true;
  ELSE
    v_code := 'invalid_payload';
    v_message := 'El proveedor del gasto es obligatorio.';
    RAISE EXCEPTION 'register_expense: %', v_code;
  END IF;

  -- ======================================================================
  -- Paso 7 - categoria del negocio de la sesion (Req 17.5)
  -- ======================================================================
  v_code := 'internal_error';
  v_message := NULL;
  SELECT ec.id INTO v_category_id
    FROM public.expense_categories ec
   WHERE ec.business_id = v_business
     AND upper(ec.name) = v_category
   LIMIT 1;

  IF v_category_id IS NULL THEN
    INSERT INTO public.expense_categories (business_id, name)
    VALUES (v_business, v_category)
    ON CONFLICT (business_id, name) DO NOTHING
    RETURNING id INTO v_category_id;

    IF v_category_id IS NULL THEN
      SELECT ec.id INTO v_category_id
        FROM public.expense_categories ec
       WHERE ec.business_id = v_business
         AND upper(ec.name) = v_category
       LIMIT 1;
    END IF;
  END IF;

  -- ======================================================================
  -- Paso 8 - fila del gasto
  -- ======================================================================
  INSERT INTO public.expenses (
    business_id, amount, description, category,
    payment_method, receipt_url, expense_date, created_by, created_at
  ) VALUES (
    v_business, v_amount, v_desc, v_category,
    v_default_method, v_receipt_url, v_expense_date, v_user, v_created_at
  )
  RETURNING id INTO v_expense_id;

  -- ======================================================================
  -- Paso 9 - business_debts (credito o trazabilidad de contado).
  -- ======================================================================
  IF v_is_credit THEN
    v_status := CASE WHEN v_paid >= v_amount THEN 'paid' ELSE 'active' END;
    INSERT INTO public.business_debts (
      business_id, type, creditor_name, description, total_amount, paid_amount,
      status, due_date, supplier_id, evidence_url, created_at, created_by
    ) VALUES (
      v_business, 'supplier', v_supplier_name,
      btrim('Gasto a crédito: ' || v_category || ' - ' || v_desc),
      v_amount, v_paid, v_status, v_due_date, v_supplier_id, v_receipt_url, v_created_at, v_user
    )
    RETURNING id INTO v_debt_id;
    v_debt_ids := v_debt_ids || v_debt_id;

    IF v_paid > 0 THEN
      INSERT INTO public.business_debts (
        business_id, type, creditor_name, description, total_amount, paid_amount,
        status, due_date, supplier_id, evidence_url, created_at, created_by
      ) VALUES (
        v_business, 'supplier', v_supplier_name,
        btrim('Abono inicial al momento de compra: ' || v_category || CASE WHEN v_desc <> '' THEN ' - ' || v_desc ELSE '' END),
        0, v_paid, 'paid', NULL, v_supplier_id, v_receipt_url, v_created_at, v_user
      )
      RETURNING id INTO v_debt_id;
      v_debt_ids := v_debt_ids || v_debt_id;
    END IF;
  ELSE
    INSERT INTO public.business_debts (
      business_id, type, creditor_name, description, total_amount, paid_amount,
      status, due_date, supplier_id, evidence_url, created_at, created_by
    ) VALUES (
      v_business, 'supplier', v_supplier_name,
      btrim('Gasto de contado: ' || v_category ||
            CASE WHEN v_desc <> '' THEN ' - ' || v_desc ELSE '' END),
      v_amount, v_amount, 'paid', NULL, v_supplier_id, v_receipt_url, v_created_at, v_user
    )
    RETURNING id INTO v_debt_id;
    v_debt_ids := v_debt_ids || v_debt_id;
  END IF;

  -- ======================================================================
  -- Paso 10 - movimientos de caja (reference_type = 'expense')
  -- Prioriza v_supplier_name sobre v_category con formato 'Gasto: {proveedor} · {desc}'
  -- ======================================================================
  IF (NOT v_is_credit) AND v_deduct AND v_shift IS NOT NULL THEN
    v_move_desc := 'Gasto: ' || coalesce(nullif(btrim(v_supplier_name), ''), v_category) ||
                   CASE WHEN v_desc <> '' THEN ' · ' || v_desc ELSE '' END;

    FOR m IN SELECT je.value FROM jsonb_array_elements(coalesce(v_eff_methods, '[]'::jsonb)) je LOOP
      IF coalesce(nullif(btrim(coalesce(m->>'mapped_id', '')), ''), 'cash') = 'cash' THEN
        INSERT INTO public.cash_movements (
          shift_id, created_by, type, amount, description,
          reference_id, reference_type, payment_method
        ) VALUES (
          v_shift, v_user, 'expense',
          coalesce((nullif(m->>'amount', ''))::numeric, 0), v_move_desc,
          v_expense_id, 'expense',
          'cash'
        )
        RETURNING id INTO v_move_id;
        v_move_ids := v_move_ids || v_move_id;
      END IF;
    END LOOP;
  ELSIF v_is_credit AND v_paid > 0 AND v_deduct AND v_shift IS NOT NULL THEN
    v_move_desc := 'Abono proveedor: ' || v_supplier_name || ' · Gasto inicial';

    IF v_methods_total > 0 THEN
      FOR m IN SELECT je.value FROM jsonb_array_elements(coalesce(v_eff_methods, '[]'::jsonb)) je LOOP
        IF coalesce(nullif(btrim(coalesce(m->>'mapped_id', '')), ''), 'cash') = 'cash' THEN
          INSERT INTO public.cash_movements (
            shift_id, created_by, type, amount, description,
            reference_id, reference_type, payment_method
          ) VALUES (
            v_shift, v_user, 'expense',
            coalesce((nullif(m->>'amount', ''))::numeric, 0), v_move_desc,
            v_expense_id, 'expense',
            'cash'
          )
          RETURNING id INTO v_move_id;
          v_move_ids := v_move_ids || v_move_id;
        END IF;
      END LOOP;
    ELSIF coalesce(v_credit_method, v_default_method, 'cash') = 'cash' THEN
      INSERT INTO public.cash_movements (
        shift_id, created_by, type, amount, description,
        reference_id, reference_type, payment_method
      ) VALUES (
        v_shift, v_user, 'expense', v_paid,
        v_move_desc,
        v_expense_id, 'expense', 'cash'
      )
      RETURNING id INTO v_move_id;
      v_move_ids := v_move_ids || v_move_id;
    END IF;
  END IF;

  -- ======================================================================
  -- Paso 11 - resultado
  -- ======================================================================
  v_result := jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'expense_id', v_expense_id,
    'debt_id', v_debt_ids[1],
    'debt_ids', to_jsonb(v_debt_ids),
    'cash_movement_id', v_move_ids[1],
    'cash_movement_ids', to_jsonb(v_move_ids),
    'supplier_created', v_supplier_created,
    'supplier_id', v_supplier_id
  );

  UPDATE public.register_idempotency
     SET result = v_result
   WHERE key = v_key
     AND business_id = v_business;

  RETURN v_result;
END;
$function$;
