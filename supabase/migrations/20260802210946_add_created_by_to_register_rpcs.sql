CREATE OR REPLACE FUNCTION public.register_purchase(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Mapa de acentos: `unaccent` NO esta instalado en este proyecto, asi que la
  -- Comparacion_Unidad usa translate() con los caracteres acentuados del espanol.
  c_acc_src constant text := 'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇÝáàâäãåéèêëíìîïóòôöõúùûüñçý';
  c_acc_dst constant text := 'AAAAAAEEEEIIIIOOOOOUUUUNCYaaaaaaeeeeiiiiooooouuuuncy';
  c_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  v_business      uuid;
  v_user          uuid := auth.uid();

  -- error controlado: se fijan antes de RAISE y sobreviven al rollback del bloque
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

  v_lines         jsonb;
  v_line          jsonb;
  v_n             int;
  v_i             int;
  v_total_amount  numeric := 0;
  v_methods_total numeric := 0;

  v_weights       numeric[] := '{}'::numeric[];
  v_weight_sum    numeric   := 0;
  v_dist_total    numeric;
  v_shares        numeric[];
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
  v_desc_by_line  text[] := '{}'::text[];

  v_created_products uuid[] := '{}'::uuid[];
  v_lot_ids       uuid[] := '{}'::uuid[];
  v_debt_ids      uuid[] := '{}'::uuid[];
  v_mv_ids        uuid[] := '{}'::uuid[];
  v_result        jsonb;
BEGIN
  --------------------------------------------------------------------------
  -- Paso 0. Negocio de la sesion. Nunca del payload.
  --------------------------------------------------------------------------
  v_business := public.get_user_business_id();
  IF v_business IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'no_business',
      'message', 'Tu sesión no tiene un negocio asignado.');
  END IF;

  --------------------------------------------------------------------------
  -- Pasos 1 a 3. Pertenencia, permiso y validacion del payload.
  -- Nada de esto escribe: se puede devolver el error directamente.
  --------------------------------------------------------------------------
  BEGIN
    -- 1. El business_id del payload solo sirve para detectar una sesion cruzada.
    IF p_payload ? 'business_id' AND p_payload->>'business_id' IS NOT NULL THEN
      IF p_payload->>'business_id' !~ c_uuid_re
         OR (p_payload->>'business_id')::uuid <> v_business THEN
        v_code := 'business_mismatch';
        v_msg  := 'No autorizado para esta operación.';
        RAISE EXCEPTION 'register_purchase_abort';
      END IF;
    END IF;

    -- 2. Permiso_Registrar_Gastos.
    IF NOT coalesce(public.current_user_has_permission('inv_purchase'), false) THEN
      v_code := 'forbidden';
      v_msg  := 'No tienes permiso para registrar compras y gastos.';
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;

    -- 3. Validacion del payload. Cualquier fallo de cast cae en el handler.
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

    -- Proveedor: id existente o proveedor nuevo con nombre.
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

    -- Pago.
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
    -- En Credito los metodos de pago no participan: el dinero que entra es el
    -- abono inicial con `credit_initial_method`, igual que en el flujo manual.
    IF v_is_credit THEN
      v_methods := '[]'::jsonb;
    END IF;

    IF v_is_credit AND v_due_date IS NULL THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;
    IF v_paid_amount < 0 THEN
      RAISE EXCEPTION 'register_purchase_abort';
    END IF;

    -- Lineas.
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

    -- Sobrepago: ni los metodos ni el abono pueden superar el total.
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

  --------------------------------------------------------------------------
  -- Pasos 4 a 10. TODAS las escrituras dentro de un unico bloque:
  -- cualquier excepcion revierte el bloque completo antes de responder.
  --------------------------------------------------------------------------
  BEGIN
    ----------------------------------------------------------------------
    -- 4. Clave de idempotencia. Se inserta en la MISMA transaccion, asi que
    -- un fallo posterior tambien la revierte y el reintento arranca de cero.
    ----------------------------------------------------------------------
    BEGIN
      INSERT INTO public.register_idempotency (key, business_id, operation)
      VALUES (v_key, v_business, 'purchase');
    EXCEPTION WHEN unique_violation THEN
      -- Solo es una replica legitima si la clave es de ESTE negocio y de la
      -- operacion 'purchase'. Si la clave ya se uso en otro registro (por
      -- ejemplo un gasto), devolver ok:true seria un falso exito: la compra no
      -- quedaria registrada y el usuario creeria que si.
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

    ----------------------------------------------------------------------
    -- 5. Proveedor.
    ----------------------------------------------------------------------
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

    ----------------------------------------------------------------------
    -- 6. Turno y saldo en efectivo.
    -- Sin shift_id no hay movimientos de caja, igual que hoy hace
    -- useCashRegister.recordPurchase cuando no hay turno activo.
    ----------------------------------------------------------------------
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

    IF NOT v_is_credit AND v_deduct AND v_shift_id IS NOT NULL THEN
      SELECT coalesce(sum(round(coalesce(nullif(m->>'amount', '')::numeric, 0))), 0)
        INTO v_cash_needed
        FROM jsonb_array_elements(v_methods) AS m
       WHERE coalesce(m->>'mapped_id', 'cash') = 'cash';

      IF v_cash_needed > 0 THEN
        v_available := coalesce(public.calculate_expected_cash(v_shift_id), 0);
        IF v_cash_needed > v_available THEN
          v_code := 'insufficient_cash_balance';
          v_msg  := 'Saldo insuficiente en efectivo. Disponible: $'
                    || round(v_available)::text;
          RAISE EXCEPTION 'register_purchase_abort';
        END IF;
      END IF;
    END IF;

    ----------------------------------------------------------------------
    -- Pesos del reparto proporcional: el total de cada linea. Si todos los
    -- totales son 0 se reparte en partes iguales (1/n), como el flujo manual.
    ----------------------------------------------------------------------
    SELECT coalesce(sum(w), 0) INTO v_weight_sum FROM unnest(v_weights) AS w;
    IF v_weight_sum <= 0 THEN
      v_weights    := array_fill(1::numeric, ARRAY[v_n]);
      v_weight_sum := v_n;
    END IF;

    -- Reparto del abono inicial entre lineas (metodo del resto mayor: las
    -- partes son enteras y suman exactamente el abono, sin residuos de +-1).
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

    ----------------------------------------------------------------------
    -- 7. Por cada linea, en el orden del payload.
    ----------------------------------------------------------------------
    FOR v_i IN 0 .. v_n - 1 LOOP
      v_line       := v_lines->v_i;
      v_product    := v_line->'product';
      v_quantity   := (v_line->>'quantity')::numeric;
      v_line_total := (v_line->>'line_total')::numeric;

      ------------------------------------------------------------------
      -- 7.1 Producto: existente validado por negocio (con bloqueo de fila
      -- para serializar dos compras concurrentes) o producto nuevo.
      ------------------------------------------------------------------
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

        -- Mismos valores que escribe SimpleProductScreen, para que el producto
        -- creado en el escaneo sea indistinguible de uno creado a mano.
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

      ------------------------------------------------------------------
      -- 7.2 Apodo: array_append solo si el Nombre_OCR normalizado no existe.
      ------------------------------------------------------------------
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

      ------------------------------------------------------------------
      -- 7.3 Unidad de compra: fila nueva solo si la unidad normalizada no
      -- existe todavia. Nunca se toca el unit_name ni el conversion_factor
      -- de las filas existentes (Req 9.13, 9.14).
      ------------------------------------------------------------------
      IF jsonb_typeof(v_line->'purchase_unit') = 'object' THEN
        v_factor := (v_line->'purchase_unit'->>'conversion_factor')::numeric;

        -- Comparacion_Unidad, equivalente a normalizeUnit() del frontend.
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

      ------------------------------------------------------------------
      -- 7.4 Precio de venta: solo si la linea trae uno editado.
      -- El `cost` de los productos existentes no se toca (Req 3.11).
      ------------------------------------------------------------------
      IF coalesce(v_line->>'new_price', '') <> '' THEN
        v_new_price := (v_line->>'new_price')::numeric;
        UPDATE public.products
           SET price = v_new_price
         WHERE id = v_product_id;
      END IF;

      ------------------------------------------------------------------
      -- 7.5 y 7.6 Lote y stock.
      -- remaining_quantity absorbe el stock negativo con la misma formula
      -- del flujo vigente: max(0, cantidad + min(0, stock_antes)).
      -- Un producto que no controla stock (products.stock IS NULL) no recibe
      -- lote ni actualizacion, igual que hoy hace updateProductStock.
      -- inventory_lots.product_name lo rellena el trigger tr_set_lot_product_name.
      ------------------------------------------------------------------
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

      -- Cantidad en texto con el mismo formato del flujo manual (sin ceros
      -- de relleno): 12, 2.5, 0.75.
      v_qty_txt := v_quantity::text;
      IF position('.' IN v_qty_txt) > 0 THEN
        v_qty_txt := rtrim(rtrim(v_qty_txt, '0'), '.');
      END IF;

      v_lot_by_line  := v_lot_by_line || v_lot_id;
      v_desc_by_line := v_desc_by_line
                        || ('Compra: ' || v_product_name || ' (' || v_qty_txt || ' ' || v_product_unit || ')');

      ------------------------------------------------------------------
      -- 7.7 Deuda de la linea, con el mismo formato de descripcion,
      -- de paid_amount y de status que el flujo manual.
      ------------------------------------------------------------------
      IF v_line_total > 0 THEN
        IF v_is_credit THEN
          v_line_paid := coalesce(v_paid_shares[v_i + 1], 0);
          INSERT INTO public.business_debts (
            business_id, type, creditor_name, description, total_amount, paid_amount,
            status, due_date, supplier_id, inventory_lot_id, evidence_url, created_at, created_by)
          VALUES (
            v_business, 'supplier', v_supplier_name,
            'Compra a crédito: ' || v_product_name || ' (' || v_qty_txt || ' ' || v_product_unit || ')',
            v_line_total, v_line_paid,
            CASE WHEN v_line_paid >= v_line_total THEN 'paid' ELSE 'active' END,
            v_due_date, v_supplier_id, v_lot_id, v_evidence, v_purchase_date, v_user)
          RETURNING id INTO v_debt_id;
        ELSE
          INSERT INTO public.business_debts (
            business_id, type, creditor_name, description, total_amount, paid_amount,
            status, supplier_id, inventory_lot_id, evidence_url, created_at, created_by)
          VALUES (
            v_business, 'supplier', v_supplier_name,
            'Compra de contado: ' || v_product_name || ' (' || v_qty_txt || ' ' || v_product_unit || ')',
            v_line_total, v_line_total, 'paid',
            v_supplier_id, v_lot_id, v_evidence, v_purchase_date, v_user)
          RETURNING id INTO v_debt_id;
        END IF;
        v_debt_ids := v_debt_ids || v_debt_id;
      END IF;
    END LOOP;

    ----------------------------------------------------------------------
    -- 8. Abono inicial (solo Credito).
    ----------------------------------------------------------------------
    IF v_is_credit AND v_paid_amount > 0 THEN
      INSERT INTO public.business_debts (
        business_id, type, creditor_name, description,
        total_amount, paid_amount, status, created_at, created_by)
      VALUES (
        v_business, 'supplier', v_supplier_name, 'Abono: Pago al momento de compra',
        0, v_paid_amount, 'paid', v_purchase_date, v_user)
      RETURNING id INTO v_debt_id;
      v_debt_ids := v_debt_ids || v_debt_id;
    END IF;

    ----------------------------------------------------------------------
    -- 9. Movimientos de caja.
    -- 9a. Contado con descuento de caja: un movimiento por (linea x metodo),
    --     con reparto proporcional exacto y reference_id = lote.
    ----------------------------------------------------------------------
    IF NOT v_is_credit AND v_deduct AND v_shift_id IS NOT NULL THEN
      FOR v_method IN SELECT value FROM jsonb_array_elements(v_methods) LOOP
        v_amount := round(coalesce(nullif(v_method->>'amount', '')::numeric, 0));
        IF v_amount > 0 THEN
          v_dist_total := v_amount;
          v_shares := (
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

          FOR v_i IN 1 .. v_n LOOP
            IF coalesce(v_shares[v_i], 0) > 0 THEN
              INSERT INTO public.cash_movements (
                shift_id, created_by, type, amount, description,
                payment_method, reference_id, reference_type)
              VALUES (
                v_shift_id, v_user, 'purchase', v_shares[v_i], v_desc_by_line[v_i],
                coalesce(nullif(v_method->>'mapped_id', ''), 'cash'),
                v_lot_by_line[v_i],
                CASE WHEN v_lot_by_line[v_i] IS NOT NULL THEN 'purchase' ELSE NULL END)
              RETURNING id INTO v_mv_id;
              v_mv_ids := v_mv_ids || v_mv_id;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;

    -- 9b. Credito con abono: un solo movimiento por el abono.
    IF v_is_credit AND v_paid_amount > 0 AND v_shift_id IS NOT NULL THEN
      INSERT INTO public.cash_movements (
        shift_id, created_by, type, amount, description, payment_method)
      VALUES (
        v_shift_id, v_user, 'purchase', v_paid_amount,
        'Abono proveedor: ' || v_supplier_name || ' · Compra inicial',
        coalesce(v_credit_method, 'cash'))
      RETURNING id INTO v_mv_id;
      v_mv_ids := v_mv_ids || v_mv_id;
    END IF;

    ----------------------------------------------------------------------
    -- 10. Resultado + registro en la clave de idempotencia.
    ----------------------------------------------------------------------
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
    -- El bloque revierte sus propias escrituras: ok:false => cero escrituras.
    IF v_code IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'internal_error',
        'message', 'No pudimos registrar la compra. Vuelve a intentarlo.',
        'detail', SQLERRM);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', v_code, 'message', v_msg);
  END;
END;
$function$;

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
    -- La clave ya existe: solo es una replica legitima si es del mismo negocio
    -- y de la misma operacion. En cualquier otro caso se rechaza en vez de
    -- devolver un exito que no ocurrio.
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

    -- Reparto efectivo del egreso: los metodos con valor, o el total del gasto
    -- cuando el frontend no detalla montos (mismo fallback del flujo vigente).
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
  -- Formato de descripcion identico al flujo vigente de ExpenseRegister.
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
  END IF;
  v_debt_ids := v_debt_ids || v_debt_id;

  -- ======================================================================
  -- Paso 10 - movimientos de caja (reference_type = 'expense')
  -- ======================================================================
  IF (NOT v_is_credit) AND v_deduct AND v_shift IS NOT NULL THEN
    v_move_desc := 'Gasto: ' || v_category ||
                   CASE WHEN v_desc <> '' THEN ' - ' || v_desc ELSE '' END;

    FOR m IN SELECT je.value FROM jsonb_array_elements(coalesce(v_eff_methods, '[]'::jsonb)) je LOOP
      INSERT INTO public.cash_movements (
        shift_id, created_by, type, amount, description,
        reference_id, reference_type, payment_method
      ) VALUES (
        v_shift, v_user, 'expense',
        coalesce((nullif(m->>'amount', ''))::numeric, 0), v_move_desc,
        v_expense_id, 'expense',
        coalesce(nullif(btrim(coalesce(m->>'mapped_id', '')), ''), 'cash')
      )
      RETURNING id INTO v_move_id;
      v_move_ids := v_move_ids || v_move_id;
    END LOOP;
  ELSIF v_is_credit AND v_paid > 0 AND v_shift IS NOT NULL THEN
    INSERT INTO public.cash_movements (
      shift_id, created_by, type, amount, description,
      reference_id, reference_type, payment_method
    ) VALUES (
      v_shift, v_user, 'expense', v_paid,
      'Abono proveedor: ' || v_supplier_name || ' · Gasto inicial',
      v_expense_id, 'expense', coalesce(v_credit_method, v_default_method)
    )
    RETURNING id INTO v_move_id;
    v_move_ids := v_move_ids || v_move_id;
  END IF;

  -- ======================================================================
  -- Paso 11 - resultado
  -- ======================================================================
  v_result := jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'supplier_id', v_supplier_id,
    'supplier_created', v_supplier_created,
    'category', v_category,
    'category_id', v_category_id,
    'created_product_ids', '[]'::jsonb,
    'lot_ids', '[]'::jsonb,
    'expense_id', v_expense_id,
    'debt_ids', to_jsonb(v_debt_ids),
    'cash_movement_ids', to_jsonb(v_move_ids),
    'totals', jsonb_build_object('amount', v_amount, 'paid_amount', v_paid)
  );

  UPDATE public.register_idempotency
     SET result = v_result
   WHERE key = v_key AND business_id = v_business;

  RETURN v_result;

EXCEPTION
  -- Cualquier error revierte el subbloque completo: ok:false implica cero escrituras.
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', coalesce(v_code, 'internal_error'),
      'message', coalesce(v_message, SQLERRM)
    );
END;
$function$;
