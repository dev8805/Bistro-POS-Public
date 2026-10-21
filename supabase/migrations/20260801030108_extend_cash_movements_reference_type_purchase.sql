-- Aplicada en el proyecto hosted el 2026-08-01 (version 20260801030108).
-- Extiende el CHECK de cash_movements.reference_type para admitir 'purchase'.
-- Hallazgo 2 del spec escaneo-factura-unificado: el CHECK vigente solo permitia
-- ('order','expense','sale_refund') o NULL, por lo que el INSERT del movimiento de
-- caja de una compra (reference_type = 'purchase', reference_id = lote) fallaba y el
-- egreso quedaba sin registrar.

ALTER TABLE public.cash_movements
  DROP CONSTRAINT cash_movements_reference_type_check;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_reference_type_check
  CHECK (reference_type IS NULL OR reference_type IN ('order', 'expense', 'sale_refund', 'purchase'));
