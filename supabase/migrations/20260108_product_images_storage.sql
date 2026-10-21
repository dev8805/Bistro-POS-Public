-- 🗂️ Storage Bucket for Product Images
-- =====================================
-- This bucket stores product images for all businesses.
-- 
-- ⚠️ IMPORTANTE: Este bucket debe ser creado manualmente desde el Dashboard de Supabase:
--    1. Ve a Storage en el panel de Supabase
--    2. Click en "New bucket"
--    3. Nombre: product-images
--    4. Marcar como "Public bucket"
--    5. Configurar:
--       - File size limit: 5MB (5242880 bytes)
--       - Allowed MIME types: image/jpeg, image/png, image/webp, image/gif

-- ====================================
-- Storage Policies (RLS)
-- ====================================
-- Estas políticas deben aplicarse después de crear el bucket

-- Policy: Allow public read access to product images
CREATE POLICY "Public read access for product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Policy: Allow authenticated users to upload images for their business
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product-images'
    AND auth.uid() IS NOT NULL
);

-- Policy: Allow users to update their business images
CREATE POLICY "Users can update their product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images')
WITH CHECK (bucket_id = 'product-images');

-- Policy: Allow users to delete their business images
CREATE POLICY "Users can delete their product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');
