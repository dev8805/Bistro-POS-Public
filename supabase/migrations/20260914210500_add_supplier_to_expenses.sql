-- Migración para agregar supplier_id y supplier_name a public.expenses
-- 1. Agregar columnas a public.expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name text;

CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON public.expenses(supplier_id);

-- 2. Backfill: Actualizar supplier_id y supplier_name desde business_debts
UPDATE public.expenses e
SET 
  supplier_id = COALESCE(e.supplier_id, d.supplier_id),
  supplier_name = COALESCE(e.supplier_name, d.creditor_name)
FROM public.business_debts d
WHERE d.business_id = e.business_id
  AND e.category NOT IN ('SUELDOS', 'MERMAS')
  AND d.total_amount = e.amount
  AND (e.supplier_name IS NULL OR e.supplier_id IS NULL)
  AND (
    d.created_at = e.created_at
    OR (d.document_date = e.expense_date AND d.description ILIKE '%' || e.category || '%')
    OR (DATE(d.created_at) = e.expense_date AND d.description ILIKE '%' || e.category || '%')
  );

-- 3. Backfill: Si aún no tiene supplier_name, extraer desde cash_movements
UPDATE public.expenses e
SET supplier_name = substring(cm.description from 'Gasto: (.*?) ·')
FROM public.cash_movements cm
WHERE cm.reference_id = e.id
  AND cm.reference_type = 'expense'
  AND e.category NOT IN ('SUELDOS', 'MERMAS')
  AND e.supplier_name IS NULL
  AND cm.description LIKE 'Gasto: % · %';

-- 4. Asociar supplier_id desde tabla suppliers según supplier_name
UPDATE public.expenses e
SET supplier_id = s.id
FROM public.suppliers s
WHERE s.business_id = e.business_id
  AND lower(trim(s.name)) = lower(trim(e.supplier_name))
  AND e.supplier_id IS NULL
  AND e.supplier_name IS NOT NULL;
