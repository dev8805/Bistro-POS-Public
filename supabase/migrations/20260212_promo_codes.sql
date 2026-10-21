-- Tabla de códigos promocionales
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('admin', 'self_service')),
  
  -- Beneficio
  duration_months integer NOT NULL DEFAULT 3,
  price_cop numeric(12,2) NOT NULL DEFAULT 29000,
  
  -- Estado
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'pending_payment')),
  
  -- Expiración (NULL = sin expiración para admin codes)
  expires_at timestamptz,
  
  -- Pago Wompi (solo para self_service)
  wompi_transaction_id text,
  wompi_status text,
  buyer_email text,
  buyer_name text,
  
  -- Redención
  redeemed_by uuid REFERENCES auth.users(id),
  redeemed_business_id uuid REFERENCES public.businesses(id),
  redeemed_at timestamptz,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER on_promo_codes_updated
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read promo codes"
  ON public.promo_codes
  FOR SELECT
  USING (true);

CREATE POLICY "Admin can insert promo codes"
  ON public.promo_codes
  FOR INSERT
  WITH CHECK (
    type = 'self_service'
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'Administrador'
    )
  );

CREATE POLICY "Authenticated users can update promo codes"
  ON public.promo_codes
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
