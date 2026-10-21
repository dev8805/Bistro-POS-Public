-- =====================================================
-- Migración: Denormalizar delivery_info con business_id
-- Fecha: 2026-01-13
-- Descripción: Agregar business_id a delivery_info para evitar
--              Joins complejos en RLS y asegurar acceso simple.
-- =====================================================

-- 1. Agregar columna business_id (nullable inicialmente)
ALTER TABLE public.delivery_info 
ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id);

-- 2. Actualizar business_id basado en la orden asociada
UPDATE public.delivery_info di
SET business_id = o.business_id
FROM public.orders o
WHERE di.order_id = o.id
AND di.business_id IS NULL;

-- 3. Hacer la columna NOT NULL (asegurar integridad)
-- Nota: Si hay datos huérfanos sin order o business, esto podría fallar,
-- pero en este sistema todo delivery_info debe tener orden.
ALTER TABLE public.delivery_info ALTER COLUMN business_id SET NOT NULL;

-- 4. Actualizar RLS para usar business_id directo
DROP POLICY IF EXISTS "Users can view delivery_info for their business" ON public.delivery_info;
DROP POLICY IF EXISTS "Users can insert delivery_info for their business" ON public.delivery_info;
DROP POLICY IF EXISTS "Users can update delivery_info for their business" ON public.delivery_info;
DROP POLICY IF EXISTS "Users can delete delivery_info for their business" ON public.delivery_info;

-- Nueva Política Unificada y Simple
CREATE POLICY "delivery_info_isolation_policy"
ON public.delivery_info
FOR ALL
USING (business_id = public.get_user_business_id())
WITH CHECK (business_id = public.get_user_business_id());
