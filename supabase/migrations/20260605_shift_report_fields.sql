-- =====================================================
-- Reporte de cierre de turno (REPORTE DIARIO)
-- Campos nuevos para replicar el recibo modelo
-- =====================================================

-- 1. Columnas nuevas en cash_shifts
ALTER TABLE public.cash_shifts
  ADD COLUMN IF NOT EXISTS shift_number int,
  ADD COLUMN IF NOT EXISTS total_refunds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_other_withdrawals numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declared_by_method jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Consecutivo por negocio (asignado en la apertura del turno)
CREATE OR REPLACE FUNCTION public.set_shift_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.shift_number IS NULL THEN
    -- Serializa la numeracion por negocio para evitar duplicados en aperturas simultaneas
    PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text));
    SELECT COALESCE(MAX(shift_number), 0) + 1
      INTO NEW.shift_number
      FROM public.cash_shifts
     WHERE business_id = NEW.business_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_shift_number ON public.cash_shifts;
CREATE TRIGGER trg_set_shift_number
  BEFORE INSERT ON public.cash_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_shift_number();

-- 3. Backfill de turnos existentes (consecutivo por negocio, orden de apertura)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY opened_at, created_at) AS rn
  FROM public.cash_shifts
)
UPDATE public.cash_shifts cs
SET shift_number = numbered.rn
FROM numbered
WHERE cs.id = numbered.id AND cs.shift_number IS NULL;

-- 4. RPC de cierre: separa devoluciones y retiros no-efectivo, guarda declarado por metodo.
--    Se elimina la firma anterior (3 args) para que las llamadas existentes
--    resuelvan a esta version con el nuevo parametro por defecto.
DROP FUNCTION IF EXISTS public.close_cash_shift(uuid, numeric, text);

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

  -- Totales por metodo de pago (retrocompatibilidad)
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(total), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method IN ('transfer', 'nequi', 'daviplata') THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total ELSE 0 END), 0)
  INTO v_orders_count, v_total_sales, v_total_cash_sales, v_total_card_sales, v_total_transfer_sales, v_total_credit_sales
  FROM public.orders
  WHERE business_id = v_shift.business_id
    AND created_at >= v_shift.opened_at
    AND (v_shift.closed_at IS NULL OR created_at < v_shift.closed_at)
    AND status = 'completed';

  -- Desglose dinamico por metodo de pago
  SELECT COALESCE(jsonb_object_agg(payment_method, method_total), '{}'::jsonb)
  INTO v_sales_by_method
  FROM (
    SELECT payment_method, SUM(total) AS method_total
    FROM public.orders
    WHERE business_id = v_shift.business_id
      AND created_at >= v_shift.opened_at
      AND (v_shift.closed_at IS NULL OR created_at < v_shift.closed_at)
      AND status = 'completed'
      AND payment_method IS NOT NULL
    GROUP BY payment_method
  ) grouped;

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
