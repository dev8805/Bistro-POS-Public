-- Migración: Agregar supplier_id a inventory_lots
-- Resuelve: desvinculación de productos al editar nombre de proveedor
-- La columna supplier_name se conserva como campo informativo/histórico.

-- 1. Nueva columna FK
ALTER TABLE inventory_lots 
  ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- 2. Índice para filtrado rápido
CREATE INDEX idx_inventory_lots_supplier_id ON inventory_lots(supplier_id);

-- 3. Backfill: vincular lotes existentes por nombre normalizado
UPDATE inventory_lots il
SET supplier_id = s.id
FROM suppliers s
WHERE LOWER(TRIM(il.supplier_name)) = LOWER(TRIM(s.name))
  AND il.business_id = s.business_id
  AND il.supplier_id IS NULL;
