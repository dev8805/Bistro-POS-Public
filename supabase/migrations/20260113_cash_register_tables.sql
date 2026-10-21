-- =====================================================
-- Cash Register / Till Management Module
-- Migration: 20260113_cash_register_tables.sql
-- Version: 1.0.0
-- =====================================================

-- =====================================================
-- PART 1: CASH REGISTERS (Points of Sale)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, name)
);

-- Enable RLS
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

-- Index
CREATE INDEX IF NOT EXISTS cash_registers_business_idx ON public.cash_registers(business_id);

-- RLS Policy
DROP POLICY IF EXISTS "Users can manage their business cash registers" ON public.cash_registers;
CREATE POLICY "Users can manage their business cash registers"
  ON public.cash_registers FOR ALL
  USING (business_id = public.get_user_business_id());

-- =====================================================
-- PART 2: CASH SHIFTS (Opening/Closing)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES public.profiles(id),
  closed_by uuid REFERENCES public.profiles(id),
  
  -- Times
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  
  -- Balances
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  expected_cash numeric(12,2) DEFAULT 0,
  declared_cash numeric(12,2),
  difference numeric(12,2),
  
  -- Totals (calculated at close)
  total_sales numeric(12,2) DEFAULT 0,
  total_cash_sales numeric(12,2) DEFAULT 0,
  total_card_sales numeric(12,2) DEFAULT 0,
  total_transfer_sales numeric(12,2) DEFAULT 0,
  total_credit_sales numeric(12,2) DEFAULT 0,
  total_expenses numeric(12,2) DEFAULT 0,
  total_cash_in numeric(12,2) DEFAULT 0,
  total_cash_out numeric(12,2) DEFAULT 0,
  orders_count int DEFAULT 0,
  
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed', 'reconciled')),
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS cash_shifts_business_idx ON public.cash_shifts(business_id);
CREATE INDEX IF NOT EXISTS cash_shifts_register_idx ON public.cash_shifts(register_id);
CREATE INDEX IF NOT EXISTS cash_shifts_status_idx ON public.cash_shifts(status);
CREATE INDEX IF NOT EXISTS cash_shifts_opened_at_idx ON public.cash_shifts(opened_at);

-- RLS Policy
DROP POLICY IF EXISTS "Users can manage their business cash shifts" ON public.cash_shifts;
CREATE POLICY "Users can manage their business cash shifts"
  ON public.cash_shifts FOR ALL
  USING (business_id = public.get_user_business_id());

-- =====================================================
-- PART 3: CASH MOVEMENTS (Transactions during shift)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id uuid NOT NULL REFERENCES public.cash_shifts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  
  type text NOT NULL CHECK (type IN (
    'opening',           -- Initial balance
    'cash_in',           -- Cash deposit (change, loan)
    'cash_out',          -- Cash withdrawal (supplier payment, etc)
    'sale',              -- Cash sale
    'expense',           -- Registered expense
    'refund'             -- Customer refund
  )),
  
  amount numeric(12,2) NOT NULL,
  description text,
  reference_id uuid,
  reference_type text CHECK (reference_type IN ('order', 'expense', NULL)),
  
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS cash_movements_shift_idx ON public.cash_movements(shift_id);
CREATE INDEX IF NOT EXISTS cash_movements_type_idx ON public.cash_movements(type);
CREATE INDEX IF NOT EXISTS cash_movements_created_at_idx ON public.cash_movements(created_at);

-- RLS Policy
DROP POLICY IF EXISTS "Users can manage cash movements for their shifts" ON public.cash_movements;
CREATE POLICY "Users can manage cash movements for their shifts"
  ON public.cash_movements FOR ALL
  USING (
    shift_id IN (
      SELECT id FROM public.cash_shifts WHERE business_id = public.get_user_business_id()
    )
  );

-- =====================================================
-- PART 4: HELPER FUNCTIONS
-- =====================================================

-- Function to calculate expected cash for a shift
CREATE OR REPLACE FUNCTION public.calculate_expected_cash(p_shift_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_opening_balance numeric;
  v_cash_in numeric;
  v_cash_out numeric;
BEGIN
  -- Get opening balance
  SELECT opening_balance INTO v_opening_balance
  FROM public.cash_shifts
  WHERE id = p_shift_id;

  -- Calculate cash in (sales, deposits)
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_in
  FROM public.cash_movements
  WHERE shift_id = p_shift_id
    AND type IN ('cash_in', 'sale');

  -- Calculate cash out (withdrawals, expenses, refunds)
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_out
  FROM public.cash_movements
  WHERE shift_id = p_shift_id
    AND type IN ('cash_out', 'expense', 'refund');

  RETURN COALESCE(v_opening_balance, 0) + v_cash_in - v_cash_out;
END;
$$;

-- Function to get active shift for current user's business
CREATE OR REPLACE FUNCTION public.get_active_shift()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_shift_id uuid;
BEGIN
  SELECT id INTO v_shift_id
  FROM public.cash_shifts
  WHERE business_id = public.get_user_business_id()
    AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;
  
  RETURN v_shift_id;
END;
$$;

-- Function to close shift and calculate totals
CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_shift_id uuid,
  p_declared_cash numeric,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  v_orders_count int;
  v_shift record;
BEGIN
  -- Verify shift exists and is open
  SELECT * INTO v_shift
  FROM public.cash_shifts
  WHERE id = p_shift_id AND status = 'open';
  
  IF v_shift IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Shift not found or already closed');
  END IF;

  -- Calculate expected cash
  v_expected := public.calculate_expected_cash(p_shift_id);
  v_difference := p_declared_cash - v_expected;

  -- Calculate totals from orders created during this shift
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

  -- Calculate cash movements
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type IN ('cash_out', 'refund') THEN amount ELSE 0 END), 0)
  INTO v_total_expenses, v_total_cash_in, v_total_cash_out
  FROM public.cash_movements
  WHERE shift_id = p_shift_id;

  -- Update the shift
  UPDATE public.cash_shifts
  SET 
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    declared_cash = p_declared_cash,
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
    orders_count = v_orders_count,
    notes = p_notes,
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
$$;

-- =====================================================
-- PART 5: UPDATED_AT TRIGGER
-- =====================================================

DROP TRIGGER IF EXISTS on_cash_shifts_updated ON public.cash_shifts;
CREATE TRIGGER on_cash_shifts_updated
  BEFORE UPDATE ON public.cash_shifts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- PART 6: CREATE DEFAULT CASH REGISTER FOR EXISTING BUSINESSES
-- =====================================================

-- Insert a default cash register for each business that doesn't have one
INSERT INTO public.cash_registers (business_id, name, description)
SELECT id, 'Caja Principal', 'Caja registradora principal del negocio'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.cash_registers cr WHERE cr.business_id = b.id
);
