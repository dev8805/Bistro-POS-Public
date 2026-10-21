-- Agrega soporte para planes de suscripción personalizados asignados a un business_id específico
-- y garantiza idempotencia de pagos con un índice único sobre wompi_transaction_id.

-- 1) Columna nueva: asignación del plan a un negocio específico.
--    NULL = plan público (visible para todos); NOT NULL = plan personalizado.
ALTER TABLE public.subscription_plans
  ADD COLUMN assigned_business_id uuid NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE;

-- 2) Máximo un plan personalizado activo por negocio.
CREATE UNIQUE INDEX subscription_plans_one_active_custom_per_business
  ON public.subscription_plans (assigned_business_id)
  WHERE assigned_business_id IS NOT NULL AND is_active = true;

-- 3) Índice de búsqueda por negocio asignado.
CREATE INDEX subscription_plans_assigned_business_idx
  ON public.subscription_plans (assigned_business_id)
  WHERE assigned_business_id IS NOT NULL;

-- 4) Idempotencia de facturas: una misma transacción de Wompi no puede
--    registrarse dos veces. Cualquier INSERT duplicado fallará con SQLSTATE 23505,
--    lo que el cliente atrapa como "alreadyProcessed" sin tocar business_subscriptions.
CREATE UNIQUE INDEX subscription_invoices_unique_wompi_tx
  ON public.subscription_invoices (wompi_transaction_id)
  WHERE wompi_transaction_id IS NOT NULL;
