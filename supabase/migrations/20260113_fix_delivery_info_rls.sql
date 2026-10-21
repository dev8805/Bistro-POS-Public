-- =====================================================
-- Migración: Corregir RLS de delivery_info
-- Fecha: 2026-01-13
-- Descripción: El JOIN desde orders a delivery_info no funciona
--              porque no hay política RLS que permita leer
--              delivery_info basado en el business del usuario.
-- =====================================================

-- Habilitar RLS si no está habilitado
ALTER TABLE public.delivery_info ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes para recrearlas correctamente
DROP POLICY IF EXISTS "Users can view delivery_info for their business" ON public.delivery_info;
DROP POLICY IF EXISTS "Users can insert delivery_info for their business" ON public.delivery_info;
DROP POLICY IF EXISTS "Users can update delivery_info for their business" ON public.delivery_info;
DROP POLICY IF EXISTS "delivery_info_select_policy" ON public.delivery_info;
DROP POLICY IF EXISTS "delivery_info_insert_policy" ON public.delivery_info;
DROP POLICY IF EXISTS "delivery_info_update_policy" ON public.delivery_info;
DROP POLICY IF EXISTS "Staff can manage delivery info" ON public.delivery_info;
DROP POLICY IF EXISTS "Users can view delivery info" ON public.delivery_info;

-- Política SELECT: Permitir leer delivery_info si la orden pertenece al negocio del usuario
CREATE POLICY "Users can view delivery_info for their business" 
ON public.delivery_info
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = delivery_info.order_id
    AND o.business_id = public.get_user_business_id()
  )
);

-- Política INSERT: Permitir crear delivery_info si la orden pertenece al negocio del usuario
CREATE POLICY "Users can insert delivery_info for their business"
ON public.delivery_info
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
    AND o.business_id = public.get_user_business_id()
  )
);

-- Política UPDATE: Permitir actualizar delivery_info si la orden pertenece al negocio del usuario
CREATE POLICY "Users can update delivery_info for their business"
ON public.delivery_info
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = delivery_info.order_id
    AND o.business_id = public.get_user_business_id()
  )
);

-- Política DELETE: Permitir eliminar delivery_info si la orden pertenece al negocio del usuario
CREATE POLICY "Users can delete delivery_info for their business"
ON public.delivery_info
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = delivery_info.order_id
    AND o.business_id = public.get_user_business_id()
  )
);
