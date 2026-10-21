# Escaneo de gasto con IA — 2026-06-08

## Resumen

Se agregó **escaneo de comprobantes con IA** al Registro de Gasto (`components/expense/ExpenseRegister.tsx`).
Dentro de la pestaña **Registro**, el usuario elige entre **Escanear con IA** (foto del recibo →
la IA prellena los campos) o **Llenar manual** (flujo de siempre). La misma imagen capturada se
reutiliza como evidencia del gasto (no se fotografía dos veces). Todos los campos detectados son
editables.

El procesamiento usa una **nueva edge function `scan-expense`** (Deno + Gemini 2.5 Flash),
independiente de `scan-invoice` (que es de inventario y devuelve tabla de productos). `scan-expense`
devuelve un **total único**, una **descripción adaptada al tipo de gasto**, el **proveedor**
(nombre + NIT) y la **fecha**.

Spec completo en `.kiro/specs/escaneo-gasto-ia/` (requirements + design + tasks).

---

## Cambios Implementados

### 1. Edge function `scan-expense` (Supabase, vía MCP)

- Nueva función `supabase/functions/scan-expense/index.ts`. Patrón de `scan-invoice`: CORS,
  `verify_jwt=false`, retry con backoff (429/503/502), `responseSchema` JSON, `temperature 0.1`,
  modelo `gemini-2.5-flash`, `GEMINI_API_KEY` como secret.
- **Request:** `{ imageBase64, mimeType, suppliers: {name,nit}[] }`. **Response:**
  `{ amount, description, supplierName, nit, date }`.
- Valida imagen obligatoria (HTTP 400 sin invocar a la IA). JSON inválido / fallo de Gemini →
  `{ error }` con HTTP 200 (lo interpreta `invokeEdgeFunction`).
- **Prompt por tipo de gasto** (no resúmenes genéricos): servicios públicos → servicio+periodo;
  arriendo/nómina/salud/honorarios → concepto+periodo; mantenimiento → servicios/repuestos;
  productos comprados clasificados con la regla *"¿lo compraría un cliente en el mostrador?"* →
  `Mercancía:` / `Insumos:` / `Bienes:`; impuestos/pagos varios/publicidad → concepto.
- Iteraciones desplegadas: v1 (base), v2 (descripción detallada), v3 (sin `suggestedCategory` +
  prompt por tipo). `scan-invoice` quedó intacta.

### 2. Categorías por defecto sembradas en BD (vía MCP)

- Migración `seed_default_expense_categories`: INSERT en `expense_categories` para **todos los
  negocios**, sin duplicar las existentes (match `upper(name)`), de:
  `SERVICIOS, ARRIENDO, SUELDOS, SALUD Y PARAFISCALES, HONORARIOS, MANTENIMIENTO, MERCANCÍA,
  INSUMOS, BIENES, IMPUESTOS, PAGOS VARIOS, PUBLICIDAD`.
- Quedan disponibles en todas las pantallas que usan categorías de gasto, no solo el escaneo.

### 3. Lógica pura testeable

**Archivo nuevo:** `components/expense/scanExpense.logic.ts`
- `normalizeLatinAmount`, `resolveAmountField` (rango 0.01–999.999.999,99), `truncateDescription`
  (máx. 500), `matchSupplier` (NIT normalizado primero, luego nombre insensible a
  mayúsculas/acentos/espacios), `resolveExpenseDate` (fecha real y no futura en zona CO), tipo
  `ScanExpenseResult`. Sin dependencias de React.

### 4. Frontend — `ExpenseRegister.tsx`

- Estados de modo (`entryMode: selector|scan|manual`), escaneo (`scanStatus`), `isOnline`,
  `detectedSupplier`, `showCategoryPicker`, `showObservationSheet`, `showScanSource`, `docCropSrc`.
- Listeners online/offline (con cleanup): offline deshabilita el escaneo y fuerza manual.
- **Refs `categoriesRef`/`suppliersRef`** sincronizados por efecto: evitan stale-closures cuando
  el escaneo async termina tras cargar los datos (bug: ofrecía crear proveedor/categoría que sí
  existían).
- Captura → `DocumentCropper` → `handleScanExpense`: comprime, llama `scan-expense` (timeout 30s),
  `applyDetectedFields` prellena, sube la imagen como evidencia con `uploadFileDirect`, y abre el
  selector de categoría.
- Orden visual: evidencia/escaneo → campos detectados → **proveedor (antes del tipo de
  transacción)** → flujo de pago. Reseteo completo al guardar (incl. modo).

### 5. Subcomponentes nuevos

| Archivo | Rol |
|---|---|
| `components/expense/EntryModeSelector.tsx` | Tarjetas "Escanear con IA" / "Llenar manual" (escaneo deshabilitado en offline). |
| `components/expense/ScanReviewPanel.tsx` | Spinner de análisis, banner de error (Reintentar/Continuar manual), CTA crear proveedor detectado. |
| `components/expense/CategoryPickerSheet.tsx` | Selector de categoría con buscador + lista + crear. `absolute inset-0` (dentro del panel). Sin auto-focus (no abre teclado). |
| `components/expense/ObservationSheet.tsx` | Edición ampliada de la observación (ícono ⛶). `absolute inset-0`. |
| `components/DocumentCropper.tsx` | Cropper de **esquinas libres** (Pointer Events, sin librería). Imagen completa + rejilla + recorte a WebP 1600px. |

### 6. Cámara de documento y subida directa

**Archivos:** `components/InAppCamera.tsx`, `hooks/useImageUpload.ts`, `components/EvidenceUploader.tsx`
- `InAppCamera` modo `fullFrame`: video a pantalla completa (`object-cover`), header/botón
  flotantes, captura recortada a lo visible.
- `useImageUpload`: `triggerDocumentCamera`, `showDocumentCamera`, `onDocumentCameraClose`,
  `uploadFileDirect(file)` (sube sin pasar por el cropper interno).
- `EvidenceUploader`: miniatura tocable → lightbox a pantalla completa para verificar el encuadre.

### 7. Wiring de errores

**Archivo:** `utils/invokeEdgeFunction.ts` — `'scan-expense'` agregado a `FUNCTION_ERRORS` y al
array `scanFunctions` (manejo de error de IA y timeout).

---

## Decisiones tomadas con el usuario

- Edge function nueva en vez de reusar `scan-invoice` (contratos distintos).
- Sub-selector **Cámara / Galería-Adjuntar** al elegir IA (texto/ícono según móvil vs PC); ambas
  pasan por el `DocumentCropper`.
- Cropper de **esquinas libres** en lugar del de zoom/pan (no funcional para facturas).
- La IA **dejó de sugerir categoría**: tras analizar se abre el selector para que el usuario elija.
- Categorías por defecto **sembradas en BD** (visibles en todas las pantallas), no solo visuales.
- Selectores confinados al **panel de gastos** (`absolute`), no a toda la pantalla del dispositivo.
- Proveedor visible **antes** de Contado/Crédito; observación con ampliación a panel completo (A2).

---

## Archivos Modificados / Nuevos

| Archivo | Cambios |
|---|---|
| `supabase/functions/scan-expense/index.ts` | **Nuevo.** Edge function de escaneo de gasto (Gemini). |
| `components/expense/scanExpense.logic.ts` | **Nuevo.** Lógica pura (montos, matching, fecha). |
| `components/expense/EntryModeSelector.tsx` | **Nuevo.** Selector de modo de entrada. |
| `components/expense/ScanReviewPanel.tsx` | **Nuevo.** Estado/acciones del escaneo. |
| `components/expense/CategoryPickerSheet.tsx` | **Nuevo.** Selector de categoría. |
| `components/expense/ObservationSheet.tsx` | **Nuevo.** Observación ampliada. |
| `components/DocumentCropper.tsx` | **Nuevo.** Cropper de esquinas libres. |
| `components/expense/ExpenseRegister.tsx` | Integración completa del escaneo + reordenamiento UI. |
| `components/InAppCamera.tsx` | Modo `fullFrame` (pantalla completa, recorte a lo visible). |
| `hooks/useImageUpload.ts` | Cámara de documento + `uploadFileDirect`. |
| `components/EvidenceUploader.tsx` | Miniatura tocable → lightbox. |
| `utils/invokeEdgeFunction.ts` | `scan-expense` en mapeo de errores. |
| BD `expense_categories` | Sembrado de 12 categorías por defecto. |

---

## Verificación

- `npm run build` (Vite + tsc): sin errores en cada iteración.
- `getDiagnostics` limpio en todos los archivos nuevos/modificados.
- Edge functions confirmadas por MCP: `scan-expense` ACTIVE (v3), `scan-invoice` intacta (v29).
- Categorías por defecto verificadas por SQL en los 3 negocios.

---

## Pendientes / Notas

- **No se implementó conexión con inventario:** la categoría `MERCANCÍA` solo describe el gasto en
  texto; no suma stock ni crea `inventory_lots` (eso sigue siendo Compra de Inventario). Es
  intencional, para quien **no** lleva inventario formal.
- Las pruebas de propiedad (PBT con fast-check) del spec quedaron como opcionales y **no** se
  implementaron (el proyecto no tiene vitest/fast-check configurado).
- Requiere `GEMINI_API_KEY` como secret en Edge Functions (ya existía por `scan-invoice`).
- El escaneo requiere conexión; en offline se degrada a manual.
