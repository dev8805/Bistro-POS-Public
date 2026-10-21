-- Agrega la columna created_by a business_debts para atribuir cada movimiento
-- (compra, gasto o abono) al empleado que lo registró. Patrón idéntico al
-- historial de ventas (orders.waiter_id -> profiles): columna uuid + join en
-- vivo a profiles(full_name), sin copiar el nombre. El nombre se conserva tras
-- el soft-delete de empleados (profiles.is_deleted = true) porque la fila de
-- profiles nunca se borra físicamente.
--
-- La columna admite NULL: los movimientos históricos anteriores a esta
-- migración quedan sin empleado asociado (no se retro-pueblan).

ALTER TABLE business_debts
  ADD COLUMN created_by uuid
    CONSTRAINT business_debts_created_by_fkey
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_debts_created_by
  ON business_debts(created_by);
