-- =====================================================
-- Migración: Corregir constraint de delivery_status
-- Fecha: 2026-01-13
-- Descripción: Actualiza los valores permitidos en delivery_status
--              para que coincidan con los que usa la aplicación
-- =====================================================

-- Eliminar el constraint actual
ALTER TABLE public.delivery_info 
DROP CONSTRAINT IF EXISTS delivery_info_delivery_status_check;

-- Crear nuevo constraint con todos los valores necesarios
ALTER TABLE public.delivery_info 
ADD CONSTRAINT delivery_info_delivery_status_check 
CHECK (delivery_status IN (
  'pending',     -- Recién creado, esperando confirmación
  'preparing',   -- Confirmado, en cocina
  'shipped',     -- Despachado, en camino
  'delivered',   -- Entregado exitosamente
  'canceled',    -- Cancelado
  -- Mantener los originales por compatibilidad futura
  'assigned', 
  'picked_up', 
  'on_the_way', 
  'failed'
));

-- Verificar que el constraint se aplicó correctamente
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'delivery_info'::regclass;
