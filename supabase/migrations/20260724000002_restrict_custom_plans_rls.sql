-- Restringe la lectura de subscription_plans:
-- - Planes públicos (assigned_business_id IS NULL) siguen siendo visibles para todos.
-- - Planes personalizados solo son visibles para el negocio al que están asignados.
-- - Se preserva la policy admin_read_all_plans (super admin lee todo).

-- Reemplazamos la policy "Plans are viewable by everyone" (USING true)
-- por una que filtra por assigned_business_id.
DROP POLICY IF EXISTS "Plans are viewable by everyone" ON public.subscription_plans;

CREATE POLICY "Plans visible by ownership"
  ON public.subscription_plans
  FOR SELECT
  USING (
    assigned_business_id IS NULL
    OR assigned_business_id = public.get_user_business_id()
  );
