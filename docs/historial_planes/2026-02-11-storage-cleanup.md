# Storage Cleanup - Plan de Implementación

**Objetivo:** Eliminar imágenes del storage de Supabase cuando se elimina/cambia un producto
**Fecha:** 2026-02-11

---

## Problemas Detectados y Soluciones

### 1. ❌ Imágenes no se borraban al eliminar producto
- **Archivo:** `hooks/useProducts.ts` → `deleteProduct()`
- **Causa:** Solo borraba el registro de DB, nunca la imagen del storage
- **Fix:** Ahora extrae `image_url` del producto, parsea el path, y llama `storage.remove()` antes de borrar el registro

### 2. ❌ Imágenes viejas se quedaban al cambiar foto
- **Archivo:** `hooks/useImageUpload.ts` → `onCropComplete()`
- **Causa:** Solo borraba imágenes subidas en la sesión actual (`uploadedFilePathRef`), pero nunca la imagen original del producto existente
- **Fix:** Se agregó `originalImageUrlRef` que trackea la URL original del producto. Al subir nueva imagen, borra la original primero

### 3. ❌ Carpeta anidada `products/` dentro de `business_id/`
- **Archivo:** `hooks/useStorage.ts` → `uploadProductImage()`
- **Causa:** Pasaba `'products'` como subfolder: `uploadFile(file, 'product-images', 'products')`, generando ruta `business_id/products/archivo.jpg`
- **Pero:** `useImageUpload.ts` (el hook activo) sube directo a `business_id/archivo.webp`
- **Fix:** Se removió el subfolder innecesario de `useStorage.ts`

### 4. ✅ Limpieza de imágenes huérfanas
- Se desplegó Edge Function temporal `cleanup-orphan-images`
- Resultado: 10 imágenes huérfanas eliminadas
- Storage limpio: 11 imágenes = 11 productos con imagen
