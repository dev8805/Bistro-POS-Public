-- Aplicada en el proyecto hosted el 2026-08-01 (version 20260801024949).
-- Tabla de idempotencia para los motores transaccionales register_purchase / register_expense.
-- La escritura es exclusiva de esas funciones SECURITY DEFINER; el cliente solo puede leer sus propias filas.
CREATE TABLE public.register_idempotency (
  key         uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  operation   text NOT NULL CHECK (operation IN ('purchase','expense')),
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.register_idempotency IS 'Claves de idempotencia de register_purchase / register_expense. Una fila por operacion y negocio. Escritura exclusiva de los motores SECURITY DEFINER. Retencion sugerida: 30 dias (purga aun no programada).';

ALTER TABLE public.register_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business idempotency"
  ON public.register_idempotency FOR SELECT
  USING (business_id = public.get_user_business_id());

-- Sin politicas de INSERT / UPDATE / DELETE: la escritura solo ocurre dentro de los motores.
-- Defensa adicional a nivel de privilegios (los motores corren como su propietario, no como el llamante).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.register_idempotency FROM authenticated, anon;

CREATE INDEX register_idempotency_created_at_idx
  ON public.register_idempotency (created_at);
