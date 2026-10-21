-- Script de corrección para la tabla suppliers
-- Ejecutar en el Editor SQL de Supabase

-- 1. Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Agregar columnas faltantes si no existen (idempotente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'nit') THEN
        ALTER TABLE suppliers ADD COLUMN nit TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'phone') THEN
        ALTER TABLE suppliers ADD COLUMN phone TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'address') THEN
        ALTER TABLE suppliers ADD COLUMN address TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'business_id') THEN
        ALTER TABLE suppliers ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Habilitar RLS si no está habilitado
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- 4. Recrear política RLS para asegurar acceso correcto
DROP POLICY IF EXISTS "Users can manage suppliers for their business" ON suppliers;

CREATE POLICY "Users can manage suppliers for their business"
ON suppliers FOR ALL
USING (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
))
WITH CHECK (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
));

-- 5. Asegurar índice
CREATE INDEX IF NOT EXISTS idx_suppliers_business_id ON suppliers(business_id);
