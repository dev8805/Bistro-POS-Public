# Design Document

## Overview

Este diseño describe cómo dejar de propagar URLs de imagen entre negocios a través de `public.barcode_catalog`, sin migrar datos ni tocar el schema. La feature es fundamentalmente **remoción de código**: se corta el circuito de lectura y escritura de `image_url` en el módulo de lookup (`lib/barcodeLookup.ts`) y en el consumidor único de ese módulo (`screens/SimpleProductScreen.tsx`). Adicionalmente, cada `upsert` estandariza a `image_url = null` cualquier fila que se toque (autolimpieza orgánica, conforme R7.4).

El cambio se apoya en tres piezas ya existentes que no se sustituyen:

- El bucket `product-images/{business_id}/…` y el hook `useImageUpload` siguen siendo el único mecanismo de imagen del producto.
- El gate offline actual de `SimpleProductScreen` (`isOnline` + `navigator.onLine` en `handleSave`) sigue siendo la única política offline para creación/edición.
- La columna `image_url` de `barcode_catalog` permanece como columna nulable pero deja de leerse y se escribe siempre en `null`.

Diagrama de alto nivel del cambio (antes / después):

```
ANTES
─────
[Negocio A crea producto]
   └── sube foto a product-images/A/img.webp
   └── INSERT products.image_url = URL_A
   └── saveProductToBarcodeCatalog(barcode, name, URL_A)
                                              │
                                              ▼
                             barcode_catalog.image_url = URL_A

[Negocio B escanea el mismo barcode]
   └── lookupBarcode ──► lookupInSupabase ──► devuelve imageUrl = URL_A
                                                        │
                                                        ▼
                        SimpleProductScreen ──► downloadAndCompressExternalImage(URL_A)
                                                        │
                                                        ▼
                          copia URL_A a product-images/B/img.webp

[Negocio A borra su archivo]
   └── URL_A empieza a devolver 400 en producto de B ❌


DESPUÉS
───────
[Negocio A crea producto]
   └── sube foto a product-images/A/img.webp
   └── INSERT products.image_url = URL_A
   └── saveProductToBarcodeCatalog(barcode, name)
                                              │
                                              ▼
                          barcode_catalog.image_url = null (siempre)

[Negocio B escanea el mismo barcode]
   └── lookupBarcode ──► lookupInSupabase ──► devuelve imageUrl = null
                                                        │
                                                        ▼
              SimpleProductScreen ──► prellena nombre, campo imagen vacío
              (usuario sube foto propia si quiere)

[Negocio A borra su archivo]
   └── no afecta a B ✅
```

## Architecture

### Superficie del cambio

Tres archivos son el corazón del cambio funcional:

| Archivo | Rol | Naturaleza del cambio |
|---------|-----|-----------------------|
| `lib/barcodeLookup.ts` | Módulo de lookup y upsert al catálogo | Remover mapeo de `image_url`, cambiar firma de `saveProductToBarcodeCatalog` |
| `screens/SimpleProductScreen.tsx` | Modal creación/edición de producto | Remover consumo de `result.imageUrl` y llamada a descarga de imagen externa |
| `hooks/useImageUpload.ts` | Hook de imagen de producto | Sin cambios funcionales; `downloadAndCompressExternalImage` queda sin consumidores del flujo scan-barcode |

Dos archivos son limpieza previa obligatoria (logs de depuración marcados como `TODO: quitar cuando se resuelva el caso Rexona`, ver sección "Pre-condición"):

| Archivo | Limpieza |
|---------|----------|
| `screens/ProductsScreen.tsx` | Import `useCallback`, `useEffect [img-audit]`, `handleProductImageError`, 3 `onError` en `<img>` |
| `screens/SimpleProductScreen.tsx` | `onError` del `<img>` de preview del formulario |

Un archivo queda documentado pero no se toca (edge function `barcode-lookup`, action `fetch_image`): sigue teniendo un consumidor válido (`downloadAndCompressExternalImage`), aunque ese consumidor no será invocado desde el flujo scan-barcode. Se preserva por regla de "Fuera de alcance" de los requisitos.

### Impacto en otros consumidores

Auditoría realizada:

- `saveProductToBarcodeCatalog` — invocado únicamente desde `screens/SimpleProductScreen.tsx` (línea 566). Cambio de firma es local a un solo call site.
- `lookupBarcode` — invocado únicamente desde `screens/SimpleProductScreen.tsx` (función `handleBarcodeLookup`). Cambio en el shape del resultado (`imageUrl` siempre `null`) afecta un solo call site.
- `downloadAndCompressExternalImage` — invocado únicamente desde `screens/SimpleProductScreen.tsx` dentro de `handleBarcodeLookup`. Tras esta feature queda **sin consumidores** en el codebase; se preserva por regla explícita.
- `BarcodeResult` (tipo) — usado únicamente en `lib/barcodeLookup.ts`. No hay imports externos.
- `.imageUrl` en el frontend — todas las otras ocurrencias grep de `.imageUrl` son de otros hooks (`evidenceUpload.imageUrl`, `paymentEvidence.imageUrl`, `item.imageUrl` en pantallas de servicios/procesados) y son independientes de `BarcodeResult`.

### Interacción con soporte offline

`docs/caracteristicas/modo_offline.md` describe el Event Sourcing y la cola de sincronización. Este flujo (creación de producto) **no está en la lista de flujos con soporte offline obligatorio**: hoy `SimpleProductScreen` bloquea explícitamente el guardado cuando no hay conexión (overlay `isOnline` + `!navigator.onLine` en `handleSave`, líneas 449 y 591). R8 se cumple sin código nuevo: el gate existente ya impide invocar `lookupBarcode` y `saveProductToBarcodeCatalog` en offline.

## Components and Interfaces

### `lib/barcodeLookup.ts`

Cambios concretos, función por función.

**Interfaz `BarcodeResult`** — preservada, pero `imageUrl` queda documentado como siempre `null`:

```typescript
export interface BarcodeResult {
    barcode: string;
    productName: string;
    brand: string | null;
    quantity: string | null;
    imageUrl: string | null; // Siempre null desde esta feature. Preservado por compatibilidad
                             // de tipo. Ver design.md > Overview.
    source: 'supabase' | 'ean-db';
}
```

Rationale de preservar el campo: no obliga a auditar consumidores hipotéticos y respeta la filosofía "no migración, no cambios de superficie" de R7. Alternativa evaluada (eliminar el campo del tipo) es viable porque el único consumidor actual también se modifica en este spec, pero se descarta por simplicidad de revisión y para evitar breaking-change en TypeScript.

**`lookupInSupabase`** — deja de mapear `data.image_url`:

```typescript
// ANTES
return {
    barcode: data.barcode,
    productName: formatDisplayName(data.product_name, data.brand, data.quantity),
    brand: data.brand,
    quantity: data.quantity,
    imageUrl: data.image_url,       // ← se lee
    source: 'supabase',
};

// DESPUÉS
return {
    barcode: data.barcode,
    productName: formatDisplayName(data.product_name, data.brand, data.quantity),
    brand: data.brand,
    quantity: data.quantity,
    imageUrl: null,                 // ← siempre null (R1.1, R7.1)
    source: 'supabase',
};
```

El `.select('*')` se preserva (no hay razón para reducirlo; simplifica el diff).

**`lookupInGoUPC`** — deja de leer `product.imageUrl` de Go-UPC y no lo persiste:

```typescript
// ANTES
const imageUrl = product.imageUrl || null;
const quantity = null;

await saveToCatalog(barcode, productName, brand, quantity, imageUrl);

return {
    barcode,
    productName: formatDisplayName(productName, brand, quantity),
    brand,
    quantity,
    imageUrl,                       // ← URL externa
    source: 'ean-db',
};

// DESPUÉS
const quantity = null;

await saveToCatalog(barcode, productName, brand, quantity, null); // ← R3.1

return {
    barcode,
    productName: formatDisplayName(productName, brand, quantity),
    brand,
    quantity,
    imageUrl: null,                 // ← R1.2
    source: 'ean-db',
};
```

La constante local `imageUrl` desaparece. La respuesta de Go-UPC sigue leyéndose (por si trae otros campos que se agreguen a futuro), pero `product.imageUrl` no se referencia.

**`saveToCatalog`** — sin cambios de firma. Sigue recibiendo `imageUrl` y persistiéndolo. Los tres callers internos (dos ya son `null`, el tercero es `saveProductToBarcodeCatalog` que también pasa `null`) hacen que en la práctica siempre reciba `null`, pero la firma se preserva para no tocar la función helper.

Alternativa descartada: cambiar `saveToCatalog` para nunca aceptar `imageUrl` y hardcodearlo internamente. Se descarta porque aumenta el diff sin beneficio funcional (los callers ya pasan `null`).

**`saveProductToBarcodeCatalog`** — cambio de firma público:

```typescript
// ANTES
export const saveProductToBarcodeCatalog = async (
    barcode: string,
    productName: string,
    imageUrl: string
) => {
    await saveToCatalog(barcode, productName, null, null, imageUrl, 'user');
};

// DESPUÉS
export const saveProductToBarcodeCatalog = async (
    barcode: string,
    productName: string
) => {
    // El nombre del usuario siempre manda: él sabe cómo vende su producto.
    // Nunca propagamos su imagen al catálogo global (ver design.md R7.4).
    // brand/quantity quedan en null porque productName ya es el nombre de
    // display final (evita doble prefijo en futuros lookups).
    await saveToCatalog(barcode, productName, null, null, null, 'user');
};
```

Cumple R5.2 (upsert con `source='user'`, `brand=null`, `quantity=null`, `image_url=null`), R6.1/R6.2 (transición `ean-db → user` y actualización idempotente), R6.3 (idempotencia trivial: cada llamada escribe el mismo estado) y R7.4 (pisa `image_url` histórico con `null`).

**`lookupBarcode`** — sin cambios de firma. El comportamiento se hereda de `lookupInSupabase` y `lookupInGoUPC`.

### `screens/SimpleProductScreen.tsx`

**Destructuración de `useImageUpload`** — se elimina `downloadAndCompressExternalImage`:

```typescript
// ANTES
const {
    imageUrl,
    uploading: uploadingImage,
    // …
    downloadAndCompressExternalImage,
} = useImageUpload(productToEdit?.image_url || null);

// DESPUÉS
const {
    imageUrl,
    uploading: uploadingImage,
    // …
    // (sin downloadAndCompressExternalImage)
} = useImageUpload(productToEdit?.image_url || null);
```

**`handleBarcodeLookup`** — se elimina la rama de descarga de imagen externa, se ajustan las deps del `useCallback`:

```typescript
// ANTES
const handleBarcodeLookup = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 4 || trimmed === lastLookedUpRef.current) return;
    lastLookedUpRef.current = trimmed;

    setLookingUpBarcode(true);
    try {
        const result = await lookupBarcode(trimmed);
        if (result) {
            if (!productName) {
                setProductName(result.productName);
            }
            showToast(`Producto encontrado: ${result.productName}`, 'success');

            // Si la API devolvió una imagen y no tenemos una, descargar, comprimir y enlazar
            if (result.imageUrl && !imageUrl) {
                await downloadAndCompressExternalImage(result.imageUrl);
            }
        }
    } catch (err) {
        console.error('[barcodeLookup] Error:', err);
    } finally {
        setLookingUpBarcode(false);
    }
}, [productName, showToast, imageUrl, downloadAndCompressExternalImage]);

// DESPUÉS
const handleBarcodeLookup = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 4 || trimmed === lastLookedUpRef.current) return;
    lastLookedUpRef.current = trimmed;

    setLookingUpBarcode(true);
    try {
        const result = await lookupBarcode(trimmed);
        if (result) {
            if (!productName) {
                setProductName(result.productName);       // R2.1: solo si vacío (R2.3 preserva)
            }
            showToast(`Producto encontrado: ${result.productName}`, 'success'); // R2.4
        }
        // R4.2: si result === null, no toast, no bloqueo.
    } catch (err) {
        console.error('[barcodeLookup] Error:', err);
    } finally {
        setLookingUpBarcode(false);
    }
}, [productName, showToast]);
```

Las dependencias `imageUrl` y `downloadAndCompressExternalImage` desaparecen del array porque el callback ya no las referencia.

**`handleSave`** — se ajusta la invocación a `saveProductToBarcodeCatalog` y su gate:

```typescript
// ANTES
if (!productToEdit && isForSale && barcode.trim() && imageUrl && productName.trim()) {
    await saveProductToBarcodeCatalog(barcode.trim(), productName.trim(), imageUrl);
}

// DESPUÉS
if (!productToEdit && isForSale && barcode.trim() && productName.trim()) {
    await saveProductToBarcodeCatalog(barcode.trim(), productName.trim());
}
```

El gate ya cumple R5.3 (`barcode.trim()`), R5.4 (`productName.trim()`), R5.5 (`!productToEdit`) y R5.6 (`isForSale`). La condición `imageUrl` desaparece porque el catálogo ya no depende de tener imagen — el nombre solo basta para aportar valor.

**Nada más se toca** en `SimpleProductScreen.tsx` desde el punto de vista funcional. Se preservan:

- El escáner y su detección de pistola USB.
- El flujo de imagen local (adjuntar, cámara, pegar, cropper), 100% en `useImageUpload` y sin depender de `lookupBarcode` (R10.3).
- El toast R2.4.
- El overlay offline y el gate `!navigator.onLine` en `handleSave` (R8).
- El almacenamiento de `products.image_url` con la URL del bucket propio (R10.2).

### `hooks/useImageUpload.ts`

**Sin cambios funcionales.** La función `downloadAndCompressExternalImage` queda exportada aunque no tenga consumidores tras esta feature. Se agrega un comentario breve arriba de la función para dejar rastro:

```typescript
// Descarga una imagen externa (vía edge function 'barcode-lookup' con action
// 'fetch_image' para bypassear CORS), la comprime a WebP 800px y la sube al
// bucket propio del negocio. Tras la feature "barcode-catalog-solo-nombre"
// (2026) esta función quedó sin consumidores en el codebase; se preserva por
// política de scope (ver .kiro/specs/barcode-catalog-solo-nombre/design.md).
const downloadAndCompressExternalImage = useCallback(async (externalUrl: string) => {
    // …
```

No hay otros cambios en este hook. El resto (`onCropComplete`, `handlePaste`, `triggerCamera`, `uploadFileDirect`, etc.) es el flujo estándar de imagen que R10 exige preservar.

### `supabase/functions/barcode-lookup/index.ts`

**Sin cambios.** La action `fetch_image` sigue viva porque `downloadAndCompressExternalImage` sigue exportada; aunque nadie la invoque hoy, el edge function se preserva por política de scope y para no forzar deploys innecesarios.

## Data Models

### Tabla `public.barcode_catalog`

Schema **no se modifica** (R7.3). Recordatorio del shape actual (verificado vía MCP en fase de requirements: 26 filas totales, 25 con `source='ean-db'`, 1 con `source='user'`):

| Columna | Tipo | Comportamiento tras la feature |
|---------|------|-------------------------------|
| `barcode` | text (PK, on-conflict target) | Sin cambio |
| `product_name` | text | Sin cambio |
| `brand` | text nullable | Al `upsert` desde `saveProductToBarcodeCatalog` queda `null`; al `upsert` desde `lookupInGoUPC` sigue recibiendo `product.brand` de Go-UPC |
| `quantity` | text nullable | Siempre `null` (comportamiento actual, no cambia) |
| `image_url` | text nullable | **Siempre se escribe `null` (R5.2, R3.1, R7.4)**. Valores históricos se preservan hasta que la fila sea tocada por un `upsert` (autolimpieza orgánica) |
| `source` | text (`'ean-db'` \| `'user'`) | Sin cambio; `saveProductToBarcodeCatalog` sigue escribiendo `'user'` y transiciona filas `ean-db → user` (R6.1) |
| `updated_at` | timestamptz | Sin cambio; se actualiza a `now()` en cada upsert |

### Bucket `product-images`

Sin cambios. Cada negocio sigue teniendo su carpeta `product-images/{business_id}/…` (R9, R10.1).

### Tabla `public.products`

Sin cambios. `products.image_url` sigue almacenando la URL pública del bucket propio del negocio (R10.2).

## Correctness Properties

**No aplica.** Esta feature es fundamentalmente:

- Remoción de código: se cortan dos rutas de lectura (`data.image_url` en Supabase, `product.imageUrl` en Go-UPC) y una rama de escritura (`downloadAndCompressExternalImage` tras lookup).
- Un `upsert` CRUD con valor constante (`image_url = null`), sin transformación de datos ni lógica algorítmica.
- Ajustes de gate booleano (`imageUrl && …` desaparece del `if` en `handleSave`).

Bajo la guía del workflow ("Simple CRUD operations with no transformation logic: use example-based tests instead"), se omite la sección de propiedades universales. Las invariantes relevantes de los requisitos (idempotencia de `saveProductToBarcodeCatalog` en R6.3, autolimpieza al upsert en R7.4) son consecuencia trivial de escribir constantes en un upsert por PK — no requieren generación aleatoria de entradas para validarse. Se cubren con verificación manual (ver Testing Strategy).

## Error Handling

### `lookupBarcode` no encuentra el barcode

Comportamiento preservado: `lookupBarcode` devuelve `null`, `handleBarcodeLookup` no muestra toast de error ni bloquea el guardado (R4.1, R4.2). El usuario completa el formulario manualmente.

### Go-UPC responde con error o cuota agotada

Comportamiento preservado: la edge function ya maneja `404` → `null`, `429` → `null` con warn en consola, y otros errores → `null`. `handleBarcodeLookup` cae al `catch` y loguea sin toast al usuario.

### Fallo del `upsert` a `barcode_catalog`

Comportamiento preservado: `saveToCatalog` ya loguea el error (`console.error('[barcodeLookup] Error guardando en Supabase:', error)`) y no lanza excepción. El producto se guardó igual en `public.products` porque `saveProductToBarcodeCatalog` se invoca **después** del `INSERT` exitoso del producto (línea 565 tras el `if (error) throw error`). El catálogo global es best-effort.

### Modo offline

Preservado por el gate existente (`isOnline` y `!navigator.onLine`). `lookupBarcode` y `saveProductToBarcodeCatalog` nunca se llaman offline (R8.1, R8.2).

### Filas históricas con `image_url` no vacío

`lookupInSupabase` las ignora al devolver `imageUrl: null` (R7.1). El próximo `upsert` sobre esa fila la estandariza a `null` (R7.4). No hay migración masiva (R7.2, R7.3).

## Testing Strategy

### Enfoque

Testing manual con checklist, alineado con la convención del repo (no hay tests automatizados para este flujo hoy). Como el cambio es principalmente remoción de código y una constante en un upsert, la validación se centra en verificar en la base de datos y en la UI que las rutas eliminadas ya no se ejecutan.

### Checklist de verificación manual

Todas las verificaciones se hacen en `https://dev.posbistro.online` (Cloudflare Tunnel → `localhost:3000`).

**Caso A — Creación normal por negocio dueño:**

1. Usuario A logueado. Modal Crear Producto abierto.
2. Escanear un barcode nuevo (nunca visto por Bistro POS). Ejemplo: `7700000009999`.
3. Verificar: campo nombre sigue vacío, campo imagen vacío, sin toast (R4.1 + R4.2 si Go-UPC no lo conoce; o R2.1 + R2.4 si Go-UPC lo devuelve).
4. Escribir nombre "Producto Test A", categoría, costo. Subir una foto propia.
5. Guardar. En Supabase Studio:
   - `public.products` debe tener el producto con `image_url` apuntando a `product-images/{A.business_id}/…`.
   - `public.barcode_catalog` debe tener la fila con `barcode = '7700000009999'`, `product_name = 'Producto Test A'`, `source = 'user'`, **`image_url = null`**, `brand = null`, `quantity = null`.

**Caso B — Escaneo por segundo negocio:**

1. Usuario B (otro negocio) logueado. Modal Crear Producto abierto.
2. Escanear el mismo `7700000009999`.
3. Verificar: toast "Producto encontrado: Producto Test A" (R2.4).
4. Verificar: campo nombre prellenado con "Producto Test A" (R2.1).
5. Verificar: campo imagen sigue vacío (R2.2). No hay preview.
6. Usuario B sube su propia foto y guarda.
7. En Supabase Studio, `public.barcode_catalog` para ese barcode sigue con `image_url = null`. `public.products` de B tiene su propia `image_url` en `product-images/{B.business_id}/…` (R10.2).

**Caso C — Autolimpieza de fila histórica:**

1. Elegir una fila histórica de `barcode_catalog` con `image_url` no nulo (hay 25 con `source='ean-db'`). Ejemplo: pick vía `execute_sql`.
2. Escanear ese barcode desde el modal.
3. Verificar en UI: nombre prellenado, imagen vacía (R7.1).
4. Crear producto y guardar.
5. Verificar en Supabase: la fila ahora tiene `image_url = null` y `source = 'user'` (R6.1, R7.4).

**Caso D — Filas históricas no tocadas siguen intactas:**

1. `SELECT count(*) FROM barcode_catalog WHERE image_url IS NOT NULL;` antes de la feature.
2. Tras el deploy, sin escanear nada: `SELECT` de nuevo. El conteo debe ser idéntico (R7.2).

**Caso E — Nombre ya escrito no se sobrescribe:**

1. En modal Crear Producto, escribir "Mi Nombre" en el campo nombre.
2. Escanear un barcode conocido (con nombre distinto en catálogo).
3. Verificar: el nombre "Mi Nombre" se preserva (R2.3), pero el toast R2.4 sí aparece.

**Caso F — Edición no toca catálogo:**

1. Abrir Editar Producto en un producto con barcode existente.
2. Cambiar nombre, costo, imagen.
3. Guardar.
4. Verificar en `barcode_catalog`: la fila del barcode **no** se modificó (R5.5). Timestamp `updated_at` sin cambios.

**Caso G — Insumo (no venta) no toca catálogo:**

1. Crear producto tipo "Insumo" con barcode.
2. Guardar.
3. Verificar en `barcode_catalog`: no se insertó/actualizó fila (R5.6).

**Caso H — Sin barcode no toca catálogo:**

1. Crear producto para venta sin barcode.
2. Guardar.
3. Verificar en `barcode_catalog`: sin cambios en filas (R5.3).

**Caso I — Offline:**

1. Con la app abierta en Chrome DevTools, marcar "Offline".
2. Intentar abrir Crear Producto.
3. Verificar: overlay "Sin conexión" bloquea el modal (R8.1 + R8.2). Ninguna llamada a `lookupBarcode` ni a `saveProductToBarcodeCatalog`.

**Caso J — Consola limpia de logs de debug:**

1. Recargar la página en la vista de Productos (`ProductsScreen`).
2. Verificar en DevTools Console: no aparecen `[img-audit]`, `[img-fail]`, `[img-fail:preview]`, `[img-fail:probe-cors]`, ni ningún log relacionado con auditoría de imágenes (pre-condición: limpieza de logs debug).

### Verificaciones SQL directas

Útiles durante los casos A/B/C:

```sql
-- Filas con image_url no nulo (debería decrecer solo cuando el flujo toque una fila)
SELECT count(*) FROM barcode_catalog WHERE image_url IS NOT NULL;

-- Verificar que un upsert reciente escribió null
SELECT barcode, product_name, source, image_url, updated_at
FROM barcode_catalog
ORDER BY updated_at DESC
LIMIT 10;
```

### Idempotencia (R6.3)

Verificar manualmente: crear un producto nuevo con barcode, guardar. Editar ese mismo producto (aunque la edición no toca catálogo por R5.5), luego eliminarlo (opcional). Volver a crear un producto con el mismo barcode y mismo nombre. El estado final de la fila de `barcode_catalog` debe ser idéntico al de la primera creación (mismo `product_name`, `source='user'`, `image_url=null`, `updated_at` actualizado).

### Regresión de flujo de imagen (R10.3)

Verificar que la imagen del producto sigue funcionando 100% con los mismos controles:

- Adjuntar (input file).
- Cámara nativa (móvil).
- Pegar (Ctrl+V).
- Recomprimir (via cropper).
- Eliminar (botón X).

Ninguno de estos flujos depende de `lookupBarcode`.

## Pre-condición: limpieza de logs de debug (Rexona)

Este cambio funcional no puede convivir con los logs de auditoría de imágenes marcados con `TODO: quitar cuando se resuelva el caso Rexona en dev/localhost`. La feature "resuelve" ese caso al cortar la propagación de URLs entre negocios, así que los logs pierden su razón de existir y deben eliminarse en el mismo commit/PR, como primer paso.

Archivos y edits exactos:

**`screens/ProductsScreen.tsx`:**

1. Línea 1 (import): quitar `useCallback` del import de `react`. Queda `import React, { useState, useRef, useEffect } from 'react';`. Verificado por grep: `handleProductImageError` es el único uso de `useCallback` en el archivo.
2. Líneas ~81 a ~106: eliminar el `useEffect` completo cuyo bloque comentario dice `[DEBUG imágenes] Auditar URLs de imagen al cargar productos.` y que contiene `console.info('[img-audit]', …)` y `console.warn('[img-audit] imágenes NO en Supabase Storage:', …)`.
3. Líneas ~108 a ~138: eliminar `handleProductImageError` completo (definido con `useCallback`).
4. Líneas ~1074, ~1293, ~1391: en los tres `<img>` (tabla desktop, card promoción móvil, card producto móvil), quitar el atributo `onError={(e) => handleProductImageError(product.name, e)}`. Los demás atributos (`src`, `alt`, `crossOrigin="anonymous"`, `className`) se preservan.

**`screens/SimpleProductScreen.tsx`:**

1. Líneas ~762 a ~783: en el `<img>` de preview del formulario (dentro de "Card 2: Imagen"), quitar el atributo `onError={(e) => { … console.warn('[img-fail:preview]', …) … }}` completo. El `<img>` queda con `src={previewUrl}`, `alt="Preview"`, `className="w-full h-full object-cover"`.

Esta limpieza es puramente remoción de código de depuración. No cambia comportamiento en producción (los logs son `console.warn/info` y las llamadas `fetch` de sondeo se ejecutaban solo cuando fallaba la carga de una imagen).

## Design Decisions and Rationale

| Decisión | Rationale |
|----------|-----------|
| Preservar `BarcodeResult.imageUrl` como campo hardcoded `null` | Evita breaking-change en el tipo; alineado con "no cambio de schema" (R7.3) aplicado a la superficie TypeScript. Alternativa (eliminar el campo) evaluada y viable, pero descartada por simplicidad de revisión |
| No tocar `saveToCatalog` (helper interno) | Sus tres callers ya pasan `null` en `imageUrl`. Cambiar la firma agrandaría el diff sin efecto observable |
| Preservar `downloadAndCompressExternalImage` sin consumidores | Explícito en "Fuera de alcance" de requirements. Se agrega un comentario para dejar rastro histórico |
| No tocar la action `fetch_image` del edge function | Su único caller (`downloadAndCompressExternalImage`) sigue vivo. Removerla sería un cambio ortogonal y forzaría un redeploy del edge function |
| Autolimpieza orgánica (`image_url = null` en cualquier upsert) en vez de migración | Voto explícito del usuario en la fase de requirements (R7.4). Sin ventana de mantenimiento, sin rollback caro |
| Integrar limpieza de logs debug en el mismo cambio | Los logs tienen `TODO: quitar cuando se resuelva el caso Rexona`; esta feature resuelve exactamente ese caso. Mantiene un solo PR con un solo scope coherente |
| Omitir Correctness Properties | Feature es CRUD + remoción de código. No hay algoritmo, parser ni transformación cuya universalidad valga la pena verificar. Alineado con guía del workflow |
