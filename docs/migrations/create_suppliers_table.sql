-- Tabla de proveedores
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nit TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seguridad RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage suppliers for their business"
ON suppliers FOR ALL
USING (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
))
WITH CHECK (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
));

-- Índice
CREATE INDEX idx_suppliers_business_id ON suppliers(business_id);
