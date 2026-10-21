-- Categoría de reporte por método de pago personalizado.
-- Mapea id normalizado del método -> línea del reporte ('efectivo'|'tarjeta'|'linea'|'otros').
-- Los métodos estándar (efectivo, tarjeta, nequi, etc.) NO necesitan entrada; su línea es implícita.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS payment_method_categories jsonb NOT NULL DEFAULT '{}'::jsonb;
