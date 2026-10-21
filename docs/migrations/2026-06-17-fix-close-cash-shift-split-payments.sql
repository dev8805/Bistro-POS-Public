-- =====================================================================
-- Fix: pagos divididos (mixtos) clasificados como "Otros" en el cierre
-- Fecha: 2026-06-17
--
-- 1) close_cash_shift ahora EXPANDE split_payments a su método real para
--    sales_by_method y los totales total_cash/card/transfer/credit_sales.
--    Las ventas normales se comportan idéntico a antes.
-- 2) Backfill: ventas divididas guardadas como 'other' pasan a 'mixed'
--    (valor dedicado que no se confunde con el método real "Otro").
--
-- Nota: orders.payment_method es text sin constraint → no requiere ALTER.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.close_cash_shift(p_shift_id uuid, p_declared_cash numeric, p_notes text DEFAULT NULL::text, p_declared_by_method jsonb DEFAULT '{}'::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_expected numeric;
  v_difference numeric;
  v_total_sales numeric;
  v_total_cash_sales numeric;
  v_total_card_sales numeric;
  v_total_transfer_sales numeric;
  v_total_credit_sales numeric;
  v_total_expenses numeric;
  v_total_cash_in numeric;
  v_total_cash_out numeric;
  v_total_refunds numeric;
  v_total_other_withdrawals numeric;
  v_orders_count int;
  v_shift record;
  v_sales_by_method JSONB;
BEGIN
  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id AND status = 'open';

  IF v_shift IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Shift not found or already closed');
  END IF;

  v_expected := public.calculate_expected_cash(p_shift_id);
  v_difference := p_declared_cash - v_expected;

  -- Conteo de ordenes y total bruto (no cambia con pagos divididos)
  SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(total), 0)
  INTO v_orders_count, v_total_sales
  FROM public.orders
  WHERE business_id = v_shift.business_id
    AND created_at >= v_shift.opened_at
    AND (v_shift.closed_at IS NULL OR created_at < v_shift.closed_at)
    AND status = 'completed';

  -- Desglose por metodo: expande los pagos divididos a su metodo real.
  -- Ventas normales aportan (payment_method, total). Ventas divididas aportan
  -- una fila por cada parte, con el metodo normalizado a categoria de BD.
  WITH expanded AS (
    SELECT o.payment_method AS method, o.total AS amount
    FROM public.orders o
    WHERE o.business_id = v_shift.business_id
      AND o.created_at >= v_shift.opened_at
      AND (v_shift.closed_at IS NULL OR o.created_at < v_shift.closed_at)
      AND o.status = 'completed'
      AND o.payment_method IS NOT NULL
      AND (o.split_payments IS NULL OR jsonb_array_length(o.split_payments) = 0)
    UNION ALL
    SELECT
      CASE lower(trim(sp->>'method'))
        WHEN 'efectivo' THEN 'cash'
        WHEN 'cash' THEN 'cash'
        WHEN 'tarjeta' THEN 'card'
        WHEN 'card' THEN 'card'
        WHEN 'nequi' THEN 'nequi'
        WHEN 'daviplata' THEN 'daviplata'
        WHEN 'transferencia' THEN 'transfer'
        WHEN 'transfer' THEN 'transfer'
        WHEN 'crédito local' THEN 'credit'
        WHEN 'credito local' THEN 'credit'
        WHEN 'crédito' THEN 'credit'
        WHEN 'credito' THEN 'credit'
        WHEN 'credit' THEN 'credit'
        WHEN 'otro' THEN 'other'
        WHEN 'other' THEN 'other'
        ELSE lower(trim(sp->>'method'))
      END AS method,
      COALESCE((sp->>'amount')::numeric, 0) AS amount
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.split_payments) AS sp
    WHERE o.business_id = v_shift.business_id
      AND o.created_at >= v_shift.opened_at
      AND (v_shift.closed_at IS NULL OR o.created_at < v_shift.closed_at)
      AND o.status = 'completed'
      AND o.split_payments IS NOT NULL
      AND jsonb_array_length(o.split_payments) > 0
  ), grouped AS (
    SELECT method, SUM(amount) AS method_total
    FROM expanded
    GROUP BY method
  )
  SELECT
    COALESCE(SUM(method_total) FILTER (WHERE method = 'cash'), 0),
    COALESCE(SUM(method_total) FILTER (WHERE method = 'card'), 0),
    COALESCE(SUM(method_total) FILTER (WHERE method IN ('transfer','nequi','daviplata')), 0),
    COALESCE(SUM(method_total) FILTER (WHERE method = 'credit'), 0),
    COALESCE(jsonb_object_agg(method, method_total), '{}'::jsonb)
  INTO v_total_cash_sales, v_total_card_sales, v_total_transfer_sales, v_total_credit_sales, v_sales_by_method
  FROM grouped;

  -- Movimientos manuales: separa retiro efectivo, retiro no-efectivo y devoluciones
  SELECT
    COALESCE(SUM(CASE WHEN type IN ('expense', 'purchase') THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' AND (payment_method IS NULL OR payment_method = 'cash') THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' AND payment_method IS NOT NULL AND payment_method <> 'cash' THEN amount ELSE 0 END), 0)
  INTO v_total_expenses, v_total_cash_in, v_total_cash_out, v_total_refunds, v_total_other_withdrawals
  FROM public.cash_movements
  WHERE shift_id = p_shift_id;

  UPDATE public.cash_shifts
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    declared_cash = p_declared_cash,
    declared_by_method = p_declared_by_method,
    expected_cash = v_expected,
    difference = v_difference,
    total_sales = v_total_sales,
    total_cash_sales = v_total_cash_sales,
    total_card_sales = v_total_card_sales,
    total_transfer_sales = v_total_transfer_sales,
    total_credit_sales = v_total_credit_sales,
    total_expenses = v_total_expenses,
    total_cash_in = v_total_cash_in,
    total_cash_out = v_total_cash_out,
    total_refunds = v_total_refunds,
    total_other_withdrawals = v_total_other_withdrawals,
    orders_count = v_orders_count,
    notes = p_notes,
    sales_by_method = v_sales_by_method,
    updated_at = now()
  WHERE id = p_shift_id;

  RETURN json_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'expected_cash', v_expected,
    'declared_cash', p_declared_cash,
    'difference', v_difference,
    'total_sales', v_total_sales,
    'orders_count', v_orders_count
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- Backfill: ventas divididas guardadas como 'other' -> 'mixed'
-- (solo filas con split_payments no vacío; las "Otro" reales no se tocan)
-- ---------------------------------------------------------------------
UPDATE public.orders
SET payment_method = 'mixed'
WHERE payment_method = 'other'
  AND split_payments IS NOT NULL
  AND jsonb_array_length(split_payments) > 0;
