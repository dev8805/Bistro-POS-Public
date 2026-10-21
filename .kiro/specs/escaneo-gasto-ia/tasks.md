# Implementation Plan: Escaneo de Gasto con IA

## Overview

La implementación sigue un orden incremental: primero la edge function `scan-expense` y su despliegue, luego la capa de lógica pura testeable (base de las 7 propiedades de correctitud), su validación con pruebas de propiedad (fast-check), el cableado de tipos/errores en `invokeEdgeFunction`, los subcomponentes de UI (`EntryModeSelector`, `ScanReviewPanel`), la integración completa en `ExpenseRegister.tsx` (estados, handlers, captura única, reordenamiento visual) y finalmente la actualización de documentación. Cada paso construye sobre el anterior y termina cableado al flujo existente sin romper el modo manual.

> Las funciones puras y su matching se extraen a `components/expense/scanExpense.logic.ts` para poder probarlas aisladas de React. La edge function replica el patrón de `scan-invoice` (CORS, `verify_jwt=false`, retry backoff, `responseSchema`) pero con contrato de gasto (total único + categoría sugerida).

## Tasks

- [x] 1. Crear la edge function `scan-expense`
  - [x] 1.1 Implementar `supabase/functions/scan-expense/index.ts`
    - Crear el handler Deno con CORS abierto y manejo de `OPTIONS`
    - Validar imagen obligatoria: si falta `imageBase64` o `mimeType`, responder HTTP 400 `{ error: "La imagen es obligatoria" }` SIN invocar a Gemini
    - Construir el prompt para Gemini 2.5 Flash (experto en recibos/facturas colombianos): total único a pagar en formato latino, descripción corta para observaciones, categoría sugerida (existente con texto original o nueva en mayúsculas), proveedor (`supplierName` + `nit` tal cual), fecha `YYYY-MM-DD`
    - Inyectar las listas `categories` y `suppliers` recibidas en el prompt como contexto
    - Configurar `responseMimeType: "application/json"` + `responseSchema` con campos `amount, description, suggestedCategory, supplierName, nit, date` (todos `required`, texto `nullable`), `temperature: 0.1`, modelo `gemini-2.5-flash`
    - Leer `GEMINI_API_KEY` desde `Deno.env.get`
    - Implementar retry con backoff exponencial para 429/503/502 (hasta 4 intentos)
    - Manejar JSON no parseable → `{ error: "No se pudo parsear la respuesta de IA", rawContent }` (HTTP 200)
    - Manejar fallo de Gemini tras reintentos → `{ error: "Error al procesar la imagen con IA", details }` (HTTP 200)
    - Manejar excepción no controlada → `{ error: "Error interno del servidor" }` (HTTP 500)
    - NO tocar ni reutilizar `scan-invoice`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 4.1, 5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 9.1_

  - [x] 1.2 Desplegar la edge function en Supabase
    - Desplegar `scan-expense` vía MCP `deploy_edge_function` en el project `hjjmwipqquynjopkswvu` con `verify_jwt=false`
    - Verificar con `list_edge_functions` que `scan-expense` queda activa y que `scan-invoice` permanece intacta
    - _Requirements: 12.5, 12.6_

- [ ] 2. Configurar entorno de pruebas (vitest + fast-check)
  - [ ] 2.1 Instalar y configurar vitest y fast-check
    - Agregar `vitest` y `fast-check` como devDependencies
    - Añadir script `test` (`vitest --run`) en `package.json`
    - Crear configuración mínima de vitest (entorno node/jsdom según corresponda)
    - _Requirements: (infraestructura de pruebas para Propiedades 1-7)_

- [x] 3. Implementar la capa de lógica pura de escaneo
  - [x] 3.1 Crear `components/expense/scanExpense.logic.ts` con funciones puras
    - `normalizeLatinAmount(str)`: interpreta formato latino (punto miles, coma decimales) → número; cadenas no numéricas → 0 o señal "no numérico"
    - `resolveAmountField(amount)`: devuelve el monto si es numérico y `0.01 <= amount <= 999999999.99`, en otro caso cadena vacía
    - `truncateDescription(str)`: recorta a máximo 500 caracteres (prefijo de la original)
    - `matchCategory(categories, suggested)`: match insensible a mayúsculas/espacios; devuelve `{ selected, suggestedNew }`
    - `matchSupplier(suppliers, { name, nit })`: prioridad por NIT (ignorando espacios/guiones), luego nombre (insensible a mayúsculas/espacios); devuelve proveedor o datos detectados para crear
    - `resolveExpenseDate(date, today)`: usa `date` si es fecha de calendario real `YYYY-MM-DD` y `<= today`, en otro caso `today`
    - Helpers `norm` y `normNit` de normalización
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.2, 5.4, 5.5, 5.6, 6.3, 6.4, 6.5, 7.2, 7.3, 12.3_

  - [ ] 3.2 Crear `buildExpensePayload(finalValues)` para equivalencia de guardado
    - Función pura que arma los argumentos de guardado (`onSave` sobre `expenses`, datos de `debts`/`business_debts`, movimientos de caja, `receipt_url`, `evidence_url`) a partir de los valores finales del formulario, independiente del modo de entrada
    - _Requirements: 11.1, 11.3_

  - [ ]* 3.3 Escribir prueba de propiedad para normalización de monto
    - **Property 1: Normalización de monto en formato latino**
    - **Validates: Requirements 4.1, 12.3**
    - `// Feature: escaneo-gasto-ia, Property 1: ...`, fast-check ≥100 iteraciones
    - _Requirements: 4.1, 12.3_

  - [ ]* 3.4 Escribir prueba de propiedad para prellenado de monto por rango
    - **Property 2: Prellenado de monto por rango**
    - **Validates: Requirements 4.2, 4.4**
    - `// Feature: escaneo-gasto-ia, Property 2: ...`, fast-check ≥100 iteraciones (incluir fuera de rango y NaN)
    - _Requirements: 4.2, 4.4_

  - [ ]* 3.5 Escribir prueba de propiedad para truncado de descripción
    - **Property 3: Truncado de la descripción**
    - **Validates: Requirements 4.3**
    - `// Feature: escaneo-gasto-ia, Property 3: ...`, fast-check ≥100 iteraciones (incluir cadenas > 500)
    - _Requirements: 4.3_

  - [ ]* 3.6 Escribir prueba de propiedad para matching de categoría
    - **Property 4: Matching de categoría**
    - **Validates: Requirements 5.2, 5.4, 5.5, 5.6**
    - `// Feature: escaneo-gasto-ia, Property 4: ...`, fast-check ≥100 iteraciones (variaciones casing/espacios, fuera de lista, vacío)
    - _Requirements: 5.2, 5.4, 5.5, 5.6_

  - [ ]* 3.7 Escribir prueba de propiedad para matching de proveedor
    - **Property 5: Matching de proveedor por NIT y nombre**
    - **Validates: Requirements 6.3, 6.4, 6.5**
    - `// Feature: escaneo-gasto-ia, Property 5: ...`, fast-check ≥100 iteraciones (NIT con espacios/guiones, nombre casing, sin match)
    - _Requirements: 6.3, 6.4, 6.5_

  - [ ]* 3.8 Escribir prueba de propiedad para validación de fecha no futura
    - **Property 6: Validación de fecha no futura**
    - **Validates: Requirements 7.2, 7.3**
    - `// Feature: escaneo-gasto-ia, Property 6: ...`, fast-check ≥100 iteraciones (válidas pasadas/futuras, inválidas, vacías)
    - _Requirements: 7.2, 7.3_

  - [ ]* 3.9 Escribir prueba de propiedad para equivalencia de guardado
    - **Property 7: Equivalencia de guardado entre escaneo y manual**
    - **Validates: Requirements 11.1, 11.3**
    - `// Feature: escaneo-gasto-ia, Property 7: ...`, fast-check ≥100 iteraciones (contado/crédito, pagos, evidencia; scan vs manual producen mismos registros)
    - _Requirements: 11.1, 11.3_

- [ ] 4. Checkpoint - Validar lógica pura y edge function
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Cablear tipo y manejo de errores de la edge function
  - [x] 5.1 Definir el tipo `ScanExpenseResult` y registrar `scan-expense` en `invokeEdgeFunction`
    - Definir `interface ScanExpenseResult { amount; description; suggestedCategory; supplierName; nit; date; error? }` (ubicarlo junto a la lógica de escaneo o en un archivo de tipos compartido)
    - Agregar `'scan-expense'` a `FUNCTION_ERRORS` en `utils/invokeEdgeFunction.ts` (ej. `'No se pudo leer el comprobante. Intenta con una foto más clara.'`)
    - Agregar `'scan-expense'` al array `scanFunctions` para que apliquen el manejo de error de IA y timeout
    - _Requirements: 9.3, 12.4_

- [x] 6. Crear el subcomponente `EntryModeSelector`
  - [x] 6.1 Implementar `components/expense/EntryModeSelector.tsx`
    - Props `{ scanDisabled, offlineNotice, onSelectScan, onSelectManual }`
    - Dos tarjetas accesibles ("Escanear con IA" y "Llenar manual") con `tabIndex={0}`, `aria-label`, `onKeyDown`
    - Tarjeta de escaneo atenuada y no clickable cuando `scanDisabled`; mostrar aviso "requiere conexión a internet" cuando `offlineNotice`
    - _Requirements: 1.1, 1.2, 1.4, 10.1, 10.2_

  - [ ]* 6.2 Escribir pruebas unitarias para `EntryModeSelector`
    - Verificar render de dos opciones, estado deshabilitado en offline, aviso visible, y disparo de callbacks
    - _Requirements: 1.1, 10.1, 10.2_

- [x] 7. Crear el subcomponente `ScanReviewPanel`
  - [x] 7.1 Implementar `components/expense/ScanReviewPanel.tsx`
    - Props `{ scanStatus, scanError, suggestedNewCategory, detectedSupplier, onRetry, onContinueManual, onCreateSuggestedCategory, onCreateDetectedSupplier }`
    - Mostrar spinner en `scanning`; banner de error con acciones "Reintentar"/"Continuar manual" en `error`
    - Mostrar botón "Crear categoría X" cuando hay `suggestedNewCategory` y CTA para crear el proveedor detectado cuando hay `detectedSupplier`
    - Props primitivas y handlers `handle*` (sin objetos inline), accesible
    - _Requirements: 5.5, 6.5, 6.6, 9.1, 9.2, 9.4_

- [ ] 8. Checkpoint - Validar subcomponentes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integrar el flujo de escaneo en `ExpenseRegister.tsx`
  - [x] 9.1 Agregar nuevos estados y detección online/offline
    - Estados `entryMode`, `scanStatus`, `scanError`, `isOnline`, `suggestedNewCategory`, `detectedSupplier`
    - `useEffect` con listeners `online`/`offline` y cleanup; al pasar a offline forzar `manual` desde `selector` (Req 10.1)
    - _Requirements: 1.1, 9.1, 10.1, 10.4, 10.5_

  - [x] 9.2 Implementar handlers de modo y navegación
    - `handleSelectScanMode` (activa scan + `evidenceUpload.triggerCamera`), `handleSelectManualMode`, `handleBackToSelector` (confirmación si hay datos/imagen sin confirmar → reset)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 9.3 Implementar captura única y escaneo
    - Wrapper `handleCropCompleteForScan(blob, removeBg?)`: llama a `evidenceUpload.onCropComplete` (sube evidencia) y, en modo scan no revisado, construye un `File` desde el `blob` y dispara `handleScanExpense` con la misma imagen
    - `handleScanExpense(file)`: `compressImage` → `invokeEdgeFunction('scan-expense', ..., { timeoutMs: 30000 })`; en éxito `applyDetectedFields` + `scanStatus='review'`; en error/timeout `scanStatus='error'` conservando la imagen
    - `handleRetryScan` (re-dispara cámara) y `handleContinueManualFromScan` (pasa a manual conservando imagen y campos)
    - Pasar `onCropComplete={handleCropCompleteForScan}` al `EvidenceUploader`, resto de props del hook sin cambios
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 9.1, 9.2, 9.3, 9.4, 9.5, 10.4_

  - [x] 9.4 Implementar `applyDetectedFields` y prefill de proveedor/categoría
    - Usar las funciones puras (`resolveAmountField`, `truncateDescription`, `matchCategory`, `matchSupplier`, `resolveExpenseDate`) para prellenar valor, observaciones, categoría, proveedor y fecha
    - `handleCreateSuggestedCategory` (usa `addCategory` de `useExpenses` y selecciona la categoría creada)
    - Prefill del modal `createSupplier` de `useSuppliers` con `supplierName` y `nit` detectados
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 5.4, 5.5, 5.6, 5.7, 6.3, 6.4, 6.5, 6.6, 7.2, 7.3, 7.4, 8.1, 8.2_

  - [x] 9.5 Reordenar el formulario y renderizar subcomponentes
    - Renderizar `EntryModeSelector` cuando `entryMode === 'selector'`; control "Volver a elegir modo" en scan/manual
    - Orden visual: (1) Evidencia/escaneo primero, (2) campos detectados editables, (3) flujo de pago al final
    - Integrar `ScanReviewPanel` para spinner/error/acciones de IA
    - Conservar las pestañas "Registro" e "Historial" sin cambios en "Historial"
    - _Requirements: 1.7, 2.1, 2.2, 2.3, 3.6_

  - [x] 9.6 Conservar guardado, validaciones y reseteo existentes
    - Mantener `handleSave`, validaciones de pago (proveedor obligatorio, fecha de crédito, saldo de caja, rechazo de sobrepago), comportamiento de caja/turno/crédito y soporte offline (`offlineQueue`)
    - Aplicar las validaciones del flujo manual sobre los valores finales antes de confirmar (Req 8.3, 8.4)
    - En guardado exitoso: reset a estado vacío + scroll al inicio sin importar el modo; en fallo: conservar datos/imagen, mostrar error y permitir reintentar
    - _Requirements: 2.4, 8.3, 8.4, 10.3, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 9.7 Escribir pruebas unitarias de integración del componente
    - Transiciones de modo (selector/scan/manual), orden visual, estados de carga/error, confirmación al descartar, editabilidad, wiring del payload de escaneo
    - _Requirements: 1.5, 1.6, 2.1, 2.2, 2.3, 8.1, 9.4_

  - [ ]* 9.8 Escribir prueba de integración de subida de evidencia
    - Verificar subida a `debt-evidence` (Storage mock) y manejo de fallo de subida con reintento
    - _Requirements: 3.3, 3.4_

- [ ] 10. Checkpoint - Validar integración completa
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Actualizar documentación
  - [x] 11.1 Actualizar `docs/caracteristicas/flujo_registro_gasto.md`
    - Añadir el flujo de escaneo con IA (selección de modo, captura única, campos detectados, degradación offline)
    - Revisar y actualizar referencias en `docs/caracteristicas/escaneo_facturas_ia.md` y/o `product.md` si corresponde
    - _Requirements: 1.1, 2.1, 3.2, 10.1_

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia requisitos específicos para trazabilidad; las pruebas de propiedad referencian además su propiedad de correctitud.
- Las 7 propiedades se implementan como una sola prueba de propiedad cada una, con etiqueta `// Feature: escaneo-gasto-ia, Property {n}: ...` y ≥100 iteraciones de fast-check.
- Los checkpoints aseguran validación incremental antes de avanzar.
- No se requieren cambios de esquema en la base de datos (verificado en el diseño).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "5.1", "6.1", "7.1"] },
    { "id": 2, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "6.2"] },
    { "id": 3, "tasks": ["9.1"] },
    { "id": 4, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 5, "tasks": ["9.5", "9.6"] },
    { "id": 6, "tasks": ["9.7", "9.8", "11.1"] }
  ]
}
```
