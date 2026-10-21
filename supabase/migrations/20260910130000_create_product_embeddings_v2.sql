-- Migración: Habilitar tabla product_embeddings y función RPC para escaneo semántico v2
-- Fecha: 2026-09-10

-- 1. Tabla para almacenar las coordenadas matemáticas (embeddings) de los productos
CREATE TABLE IF NOT EXISTS public.product_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL,
    text_hash TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_embeddings_product_id_key UNIQUE (product_id)
);

-- 2. Índice HNSW para búsqueda rápida por similitud coseno
CREATE INDEX IF NOT EXISTS idx_product_embeddings_hnsw
ON public.product_embeddings
USING hnsw (embedding vector_cosine_ops);

-- Índice por negocio para filtrado multi-inquilino eficiente
CREATE INDEX IF NOT EXISTS idx_product_embeddings_business_id
ON public.product_embeddings (business_id);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.product_embeddings ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de seguridad: los usuarios solo acceden a embeddings de su negocio
DROP POLICY IF EXISTS "product_embeddings_tenant_select" ON public.product_embeddings;
CREATE POLICY "product_embeddings_tenant_select"
ON public.product_embeddings
FOR SELECT
TO authenticated
USING (
    business_id IN (
        SELECT p.business_id FROM public.profiles p WHERE p.id = auth.uid()
    )
);

DROP POLICY IF EXISTS "product_embeddings_tenant_all" ON public.product_embeddings;
CREATE POLICY "product_embeddings_tenant_all"
ON public.product_embeddings
FOR ALL
TO authenticated
USING (
    business_id IN (
        SELECT p.business_id FROM public.profiles p WHERE p.id = auth.uid()
    )
)
WITH CHECK (
    business_id IN (
        SELECT p.business_id FROM public.profiles p WHERE p.id = auth.uid()
    )
);

-- 5. Función RPC para búsqueda semántica por similitud coseno
CREATE OR REPLACE FUNCTION public.match_products_semantic(
    query_embedding vector(768),
    target_business_id UUID,
    match_threshold FLOAT DEFAULT 0.65,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    barcode TEXT,
    unit TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.barcode,
        p.unit,
        (1 - (pe.embedding <=> query_embedding))::FLOAT AS similarity
    FROM public.product_embeddings pe
    JOIN public.products p ON pe.product_id = p.id
    WHERE pe.business_id = target_business_id
      AND (1 - (pe.embedding <=> query_embedding)) >= match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;
