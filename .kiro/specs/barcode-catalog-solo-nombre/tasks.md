# Implementation Plan

## Overview

Esta feature elimina la propagación de URLs de imagen entre negocios a través de `public.barcode_catalog`, sin migrar datos ni cambiar el schema. El trabajo es fundamentalmente remoción de código en tres archivos: `lib/barcodeLookup.ts`, `screens/SimpleProductScreen.tsx` y limpieza de logs debug en `screens/ProductsScreen.tsx`. Cada `upsert` estandariza a `image_url = null` (autolimpieza orgánica).

El orden de ejecución respeta dos reglas duras:

1. La limpieza de logs debug es **pre-condición** del cambio funcional (`design.md > Pre-condición`). Va primero.
2. `lib/barcodeLookup.ts` se modifica **antes** que `screens/SimpleProductScreen.tsx` porque el segundo consume la firma pública del primero (`saveProductToBarcodeCatalog`) y TypeScript solo compila cuando ambos están alineados.

No se agregan tests automatizados: el design declara verificación manual con el checklist de 10 casos (A–J) en `design.md > Testing Strategy`. Correctness Properties fue omitido por decisión del usuario (voto 3).

## Tasks

- [x] 1. Limpieza de logs debug (pre-condición)

  - [x] 1.1 Quitar auditoría de imágenes en `screens/ProductsScreen.tsx`
    - En la línea 1, quitar `useCallback` del import de `react` (queda `import React, { useState, useRef, useEffect } from 'react';`).
    - Eliminar completo el `useEffect` con el bloque comentario `[DEBUG imágenes] Auditar URLs de imagen al cargar productos.` (contiene `console.info('[img-audit]', …)` y `console.warn('[img-audit] imágenes NO en Supabase Storage:', …)`).
    - Eliminar completa la función `handleProductImageError` (definida con `useCallback`).
    - Quitar el atributo `onError={(e) => handleProductImageError(product.name, e)}` de los tres `<img>` del archivo (tabla desktop, card promoción móvil, card producto móvil). El resto de atributos del tag (`src`, `alt`, `crossOrigin="anonymous"`, `className`) se preserva.
    - _Justificación: `design.md > Pre-condición: limpieza de logs de debug (Rexona)` — bullets sobre `ProductsScreen.tsx`._
    - _Verificación local: `npx tsc --noEmit` sin errores nuevos; recargar `ProductsScreen` en dev y confirmar consola limpia (caso J del checklist)._

  - [x] 1.2 Quitar `onError` de auditoría en el `<img>` de preview de `screens/SimpleProductScreen.tsx`
    - Localizar el `<img>` de preview del formulario dentro de "Card 2: Imagen" (aprox. líneas 762–783 según el design).
    - Quitar por completo el atributo `onError={(e) => { … console.warn('[img-fail:preview]', …) … }}`.
    - Preservar `src={previewUrl}`, `alt="Preview"`, `className="w-full h-full object-cover"`.
    - _Justificación: `design.md > Pre-condición` — bullet sobre `SimpleProductScreen.tsx`._
    - _Verificación local: `npx tsc --noEmit` sin errores nuevos; abrir el modal de crear producto y confirmar que la ausencia del `onError` no rompe el preview cuando la imagen carga bien._

- [x] 2. Cortar lectura y persistencia de `image_url` en `lib/barcodeLookup.ts`

  - [x] 2.1 Devolver `imageUrl: null` desde `lookupInSupabase`
    - Cambiar el mapping del `return` de `lookupInSupabase`: reemplazar `imageUrl: data.image_url` por `imageUrl: null`.
    - Mantener `select('*')` (no reducir el diff sin necesidad).
    - _Cubre: R1.1, R7.1._
    - _Justificación: `design.md > Components and Interfaces > lib/barcodeLookup.ts > lookupInSupabase`._
    - _Verificación local: `npx tsc --noEmit` limpio._

  - [x] 2.2 Descartar `product.imageUrl` de Go-UPC en `lookupInGoUPC`
    - Eliminar la línea `const imageUrl = product.imageUrl || null;`.
    - Cambiar la llamada a `saveToCatalog(barcode, productName, brand, quantity, imageUrl)` por `saveToCatalog(barcode, productName, brand, quantity, null)`.
    - Cambiar el `return`: reemplazar `imageUrl,` por `imageUrl: null,`.
    - Preservar el resto del cuerpo (parseo de `data.product`, gestión de errores 404/429, etc.).
    - _Cubre: R1.2, R3.1, R3.2._
    - _Justificación: `design.md > Components and Interfaces > lib/barcodeLookup.ts > lookupInGoUPC`._
    - _Verificación local: `npx tsc --noEmit` limpio._

  - [x] 2.3 Documentar `BarcodeResult.imageUrl` como siempre `null` (voto 1)
    - En la interfaz `BarcodeResult`, agregar un comentario a la derecha de `imageUrl: string | null;` que diga: `// Siempre null desde esta feature. Preservado por compatibilidad de tipo. Ver design.md > Overview.`
    - No cambiar la firma (voto 1 aprobado: el campo se conserva).
    - _Cubre: soporte explícito del voto 1; complementa R7.1._
    - _Justificación: `design.md > Design Decisions and Rationale` (fila "Preservar `BarcodeResult.imageUrl` como campo hardcoded `null`")._

  - [x] 2.4 Cambiar la firma de `saveProductToBarcodeCatalog`
    - Nueva firma pública: `(barcode: string, productName: string)` — se elimina el parámetro `imageUrl: string`.
    - Cuerpo: `await saveToCatalog(barcode, productName, null, null, null, 'user');`.
    - Actualizar el comentario existente arriba de la función para que refleje que la imagen ya nunca se propaga al catálogo (usar el bloque sugerido en `design.md > saveProductToBarcodeCatalog`, sección DESPUÉS).
    - _Cubre: R5.2, R6.1, R6.2, R6.3, R7.4._
    - _Justificación: `design.md > Components and Interfaces > lib/barcodeLookup.ts > saveProductToBarcodeCatalog`._
    - _Verificación local: `npx tsc --noEmit` mostrará **un solo** error de compilación en `screens/SimpleProductScreen.tsx` (llamada con 3 argumentos), que se resuelve en la tarea 3.3. No hay otros consumidores en el codebase (confirmado por auditoría en `design.md > Impacto en otros consumidores`)._

- [x] 3. Actualizar consumidor en `screens/SimpleProductScreen.tsx`

  - [x] 3.1 Quitar `downloadAndCompressExternalImage` de la destructuración de `useImageUpload`
    - En la destructuración de `useImageUpload(productToEdit?.image_url || null)`, remover la línea que extrae `downloadAndCompressExternalImage`.
    - Preservar el resto de la destructuración (`imageUrl`, `uploading`, etc.).
    - _Cubre: R1.3 (el frontend deja de tener referencia local a la función)._
    - _Justificación: `design.md > Components and Interfaces > screens/SimpleProductScreen.tsx > Destructuración de useImageUpload`._

  - [x] 3.2 Simplificar `handleBarcodeLookup` (eliminar rama de descarga de imagen externa)
    - Dentro del bloque `if (result)`, eliminar el `if (result.imageUrl && !imageUrl) await downloadAndCompressExternalImage(result.imageUrl);` completo.
    - Preservar la asignación condicional del nombre (`if (!productName) setProductName(result.productName);`) y el `showToast('Producto encontrado: …', 'success')`.
    - Ajustar el array de dependencias del `useCallback`: eliminar `imageUrl` y `downloadAndCompressExternalImage`. Queda `[productName, showToast]`.
    - _Cubre: R1.3, R2.1, R2.2, R2.3, R2.4, R4.1, R4.2._
    - _Justificación: `design.md > Components and Interfaces > screens/SimpleProductScreen.tsx > handleBarcodeLookup` (bloque DESPUÉS)._

  - [x] 3.3 Ajustar la llamada a `saveProductToBarcodeCatalog` en `handleSave`
    - En el bloque `if (!productToEdit && isForSale && barcode.trim() && imageUrl && productName.trim())` justo después del `INSERT` exitoso del producto:
      - Quitar `imageUrl &&` del gate booleano.
      - Cambiar `saveProductToBarcodeCatalog(barcode.trim(), productName.trim(), imageUrl)` a `saveProductToBarcodeCatalog(barcode.trim(), productName.trim())`.
    - Preservar las demás condiciones del gate (`!productToEdit`, `isForSale`, `barcode.trim()`, `productName.trim()`) y el gate offline previo (`isOnline` + `!navigator.onLine`).
    - _Cubre: R5.1, R5.3, R5.4, R5.5, R5.6, R8.2, R8.3._
    - _Justificación: `design.md > Components and Interfaces > screens/SimpleProductScreen.tsx > handleSave`._
    - _Verificación local: `npx tsc --noEmit` limpio en todo el proyecto._

- [x] 4. Documentar código huérfano en `hooks/useImageUpload.ts`

  - [x] 4.1 Agregar comentario sobre `downloadAndCompressExternalImage`
    - Insertar arriba de la declaración de `downloadAndCompressExternalImage` el comentario multilinea sugerido en `design.md > Components and Interfaces > hooks/useImageUpload.ts` (indica que tras esta feature la función queda sin consumidores en el codebase y se preserva por política de scope).
    - **No** eliminar la función (declarado en "Fuera de alcance" de `requirements.md`).
    - **No** modificar el comportamiento interno (`onCropComplete`, `handlePaste`, `triggerCamera`, `uploadFileDirect`, etc.).
    - _Cubre: garantiza R10.1, R10.3 (el hook sigue idéntico funcionalmente)._
    - _Justificación: `design.md > Components and Interfaces > hooks/useImageUpload.ts`._

- [ ] 5. Checkpoint funcional (verificación manual)
  - Ejecutar `npm run build` y confirmar build limpio (sin errores TypeScript ni warnings nuevos).
  - Ejecutar el checklist completo A–J documentado en `design.md > Testing Strategy > Checklist de verificación manual`:
    - **A** Creación normal por negocio dueño (verificar en Supabase Studio que `barcode_catalog` recibe la fila con `image_url = null`, `source = 'user'`).
    - **B** Escaneo por segundo negocio (toast + nombre prellenado + imagen vacía; `products.image_url` del segundo negocio queda en su propia carpeta).
    - **C** Autolimpieza de fila histórica (fila con `image_url` no nulo pasa a `null` tras un upsert; transición `ean-db → user`).
    - **D** Filas históricas no tocadas siguen intactas (`count(*) WHERE image_url IS NOT NULL` no cambia sin escanear).
    - **E** Nombre ya escrito no se sobrescribe (R2.3 + toast R2.4).
    - **F** Edición no toca catálogo (R5.5).
    - **G** Producto tipo insumo no toca catálogo (R5.6).
    - **H** Sin barcode no toca catálogo (R5.3).
    - **I** Offline: overlay bloquea el modal, no hay llamadas a `lookupBarcode` ni `saveProductToBarcodeCatalog` (R8).
    - **J** Consola limpia de logs `[img-audit]`, `[img-fail]`, `[img-fail:preview]`, `[img-fail:probe-cors]` al recargar `ProductsScreen`.
  - Ejecutar las dos verificaciones SQL directas del checklist (`SELECT count(*) …` y `SELECT … ORDER BY updated_at DESC LIMIT 10`).
  - Confirmar regresión del flujo de imagen (R10.3): adjuntar, cámara nativa, pegar (Ctrl+V), cropper, eliminar.
  - Ensure all tests pass, ask the user if questions arise.
  - _Nota: este checkpoint es **verificación manual**. No es automatizable por un agente de código. Si el ejecutor de tasks es un agente autónomo, marcar esta tarea como "requiere intervención humana" y detenerse aquí._

## Notes

- Todas las tareas técnicas (1.1 a 4.1) son ejecutables por un agente. La tarea 5 es un checkpoint de verificación manual.
- Cada tarea es un diff coherente e independiente dentro de su archivo. No hay tareas monolíticas del tipo "modificar todo `lib/barcodeLookup.ts`".
- Todos los cambios en el mismo archivo se secuencian en waves distintas del dependency graph para evitar conflictos de escritura.
- No se agregan tests automatizados: la verificación es manual conforme al voto 3 aprobado (`design.md > Testing Strategy`).
- La firma pública de `BarcodeResult` se preserva (voto 1) — el campo `imageUrl` sigue existiendo, solo cambia el valor que produce.
- Referencia cruzada de cada tarea con `requirements.md` y sección de `design.md` incluida en el bullet `_Justificación:_` o `_Cubre:_` correspondiente.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "4.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["2.4"] },
    { "id": 5, "tasks": ["3.1"] },
    { "id": 6, "tasks": ["3.2"] },
    { "id": 7, "tasks": ["3.3"] }
  ]
}
```

Explicación del grafo:

- **Wave 0**: tres archivos distintos (`ProductsScreen.tsx`, `SimpleProductScreen.tsx` limpieza de `onError`, `useImageUpload.ts` comentario). Pueden ejecutarse en paralelo — no comparten archivo.
- **Waves 1–4**: cambios secuenciales en `lib/barcodeLookup.ts`. Aunque son sub-cambios que no dependen lógicamente entre sí, la regla "mismo archivo → waves distintas" fuerza el orden.
- **Waves 5–7**: cambios secuenciales en `screens/SimpleProductScreen.tsx` (mismo archivo que 1.2 en wave 0, por eso todas las sub-tareas de 3 van en waves ≥ 5). Además, 3.3 depende funcionalmente de 2.4 (la nueva firma de `saveProductToBarcodeCatalog`) — la wave 7 llega necesariamente después de la wave 4.
