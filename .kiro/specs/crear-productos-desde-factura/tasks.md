# Implementation Plan: Crear Productos desde Factura

## Overview

Implementación del flujo de creación de productos desde factura escaneada con IA. Se estructura en 5 waves: primero la infraestructura de navegación (enum + menú + ruta), luego utilidades y componentes de UI puros, después el hook orquestador y pantalla principal, luego las modificaciones a SimpleProductScreen, y finalmente integración y verificación de build.

Se usa TypeScript + React 19 + Tailwind CSS. Los tests de propiedades usan `fast-check`.

## Tasks

- [x] 1. Infraestructura de navegación y enum Screen
  - [x] 1.1 Agregar `CREATE_FROM_INVOICE` al enum Screen y crear ruta en App.tsx
    - Agregar el valor `CREATE_FROM_INVOICE = 'CREATE_FROM_INVOICE'` al enum `Screen`
    - Agregar el case correspondiente en el switch/router de `App.tsx` que renderice `InvoiceCreateScreen` (placeholder por ahora: un `<div>` vacío exportado desde `screens/InvoiceCreateScreen.tsx`)
    - _Requirements: 1.2_

  - [x] 1.2 Agregar opción "Desde factura" al menú de creación en ProductsScreen
    - Insertar opción como PRIMERA del menú desplegable "Crear"
    - Ícono de cámara, texto "Desde factura", descripción "Escanea y crea varios productos"
    - Al seleccionar → `setScreen(Screen.CREATE_FROM_INVOICE)`
    - Deshabilitar y mostrar toast si el dispositivo está offline (`!isOnline`)
    - Respetar el gate de permiso `inv_create` existente (no se toca, ya oculta todo el menú)
    - _Requirements: 1.1, 1.3, 1.4_

- [x] 2. Utilidad de detección de duplicados
  - [x] 2.1 Crear `lib/invoiceCreate/detectExisting.ts` con función `detectExistingProducts`
    - Implementar helper `normalizeName` (NFD → strip diacritics → lowercase → trim)
    - Match por barcode exacto (prioridad, solo si barcode no vacío)
    - Match por nombre normalizado (fallback)
    - Retornar `DetectionResult` con `newLines` y `existingLines`
    - Export de tipos `DetectionResult` desde el mismo archivo
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 2.2 Property test: Partición correcta de detección
    - **Property 1: Partición correcta de detección de duplicados**
    - Generar listas aleatorias de `ScanLine[]` y `Product[]` con barcodes y nombres variados
    - Verificar: unión de newLines + existingLines === entrada (sin pérdida ni duplicación)
    - Verificar: clasificación correcta según barcode y nombre normalizado
    - Mínimo 100 iteraciones con `fast-check`
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 3. Componentes de UI del flujo
  - [x] 3.1 Crear `components/invoiceCreate/InvoiceCreateSummaryStep.tsx`
    - Recibe `DetectionResult`, `onStartCreating`, `onCancel` como props
    - Muestra dos listas: "Productos nuevos (N)" y "Ya existen (M)" con nombre y barcode
    - Botón "Crear N productos" visible solo si hay productos nuevos
    - Mensaje "Todos los productos ya están en tu catálogo" + botón volver si no hay nuevos
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.2 Crear `components/invoiceCreate/InvoiceCreateDoneStep.tsx`
    - Recibe `createdProducts: CreatedProduct[]` y `onGoBack` como props
    - Si `createdProducts.length > 0`: muestra "N productos creados" + lista de nombres
    - Si `createdProducts.length === 0`: muestra "No se crearon productos"
    - Botón "Volver al catálogo"
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 3.3 Property test: Conteo correcto en pantalla final
    - **Property 4: Conteo correcto en pantalla final**
    - Generar secuencia aleatoria de decisiones `saved`/`skipped` sobre N items
    - Verificar que el conteo y los nombres renderizados coinciden con los `saved`
    - Mínimo 100 iteraciones con `fast-check`
    - **Validates: Requirements 7.1**

- [x] 4. Hook orquestador y pantalla principal
  - [x] 4.1 Crear `hooks/useInvoiceCreate.ts`
    - Máquina de estados: `capture → crop → processing → error|supplier → summary → creating → done`
    - Gestión de `lines`, `header`, `supplierId`, `detection`, `createdProducts`, `currentNewIndex`
    - `handleImageSelected`: captura → crop
    - `handleCropConfirm`: crop → processing (llamar `scan-invoice-unified`, parsear con `normalizeScanResponse`)
    - `handleSupplierConfirm`: supplier → summary (ejecutar `detectExistingProducts`)
    - `handleStartCreating`: summary → creating (escribir primer prefill en sessionStorage)
    - `handleProductResult`: leer resultado sessionStorage, acumular si `saved`, avanzar o ir a `done`
    - `handleRetry`, `handleCancel`
    - _Requirements: 2.1–2.5, 3.1–3.4, 4.4, 5.4, 6.1, 6.6, 6.8, 8.1–8.4_

  - [ ]* 4.2 Property test: Integridad del Prefill generado
    - **Property 2: Integridad del Prefill generado**
    - Generar líneas aleatorias con nombres unicode, costos decimales, barcodes vacíos/llenos
    - Verificar que el objeto Prefill escrito corresponde campo a campo con la línea en el índice correcto
    - Mínimo 100 iteraciones con `fast-check`
    - **Validates: Requirements 6.1**

  - [x] 4.3 Crear `screens/InvoiceCreateScreen.tsx` (reemplazar placeholder)
    - Usa `useInvoiceCreate` para estado
    - Renderiza condicionalmente según `step`:
      - `capture` → `ScanCaptureStep`
      - `crop` → `ScanCropStep`
      - `processing` → `ScanProcessingStep`
      - `error` → `ScanErrorStep`
      - `supplier` → `ScanSupplierStep`
      - `summary` → `InvoiceCreateSummaryStep`
      - `creating` → efecto que navega a SimpleProductScreen
      - `done` → `InvoiceCreateDoneStep`
    - Header con botón back que llama `handleCancel`
    - _Requirements: 2.1–2.5, 8.1, 8.2_

- [x] 5. Checkpoint - Verificar componentes base
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Modificaciones a SimpleProductScreen
  - [x] 6.1 Leer prefill de sessionStorage al montar
    - Al montar, verificar si existe key `bistro_invoice_create_prefill` en sessionStorage
    - Si `fromInvoiceCreate === true`: precargar campos (name, cost, barcode, supplierId)
    - Limpiar key inmediatamente después de leer
    - Dejar unidad de venta vacía con placeholder "Elegir..."
    - _Requirements: 6.2_

  - [x] 6.2 Botones condicionales y escritura de resultado
    - Si hay prefill activo y `currentIndex < totalNew - 1`: botón "Guardar y siguiente →"
    - Si hay prefill activo y `currentIndex === totalNew - 1`: botón "Guardar y finalizar"
    - Agregar botón "Omitir este producto" visible solo con prefill activo
    - Al guardar exitosamente: escribir `{ action: 'saved', productId, name }` en `bistro_invoice_create_result`
    - Al omitir: escribir `{ action: 'skipped' }` en `bistro_invoice_create_result`
    - Al cancelar (back): escribir `{ action: 'cancelled' }` en `bistro_invoice_create_result`
    - Navegar back después de escribir resultado
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.8, 8.3_

- [x] 7. Integración y verificación de build
  - [x] 7.1 Integrar navegación de retorno SimpleProductScreen → InvoiceCreateScreen
    - En `useInvoiceCreate`: escuchar evento de `focus`/`visibilitychange` para detectar retorno de SimpleProductScreen
    - Leer `bistro_invoice_create_result` de sessionStorage
    - Limpiar key, procesar resultado, avanzar al siguiente o ir a `done`
    - Manejar caso de cancelación parcial (ir a `done` con productos ya creados)
    - _Requirements: 6.6, 6.8, 8.3, 8.4_

  - [x] 7.2 Verificación de build y lint
    - Ejecutar `npm run build` y verificar 0 errores TypeScript
    - Revisar que no haya imports rotos ni archivos huérfanos
    - _Requirements: Todos_

- [x] 8. Checkpoint final
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas con `*` son opcionales (property tests) y pueden omitirse para MVP más rápido
- Cada task referencia sus requirements específicos para trazabilidad
- Los componentes `ScanCaptureStep`, `ScanCropStep`, `ScanProcessingStep`, `ScanErrorStep` y `ScanSupplierStep` ya existen y se reutilizan sin modificación
- La comunicación entre `InvoiceCreateScreen` y `SimpleProductScreen` usa sessionStorage (patrón ya establecido en el proyecto con `bistro_create_product_as_insumo`)
- `fast-check` ya está instalado como dev dependency en el proyecto
- El flujo es solo-online (requiere IA). No necesita soporte offline

## Task Dependency Graph

```
Task 1 (enum + menú + ruta)
   │
   ├──→ Task 2 (detectExistingProducts utility)
   │
   ├──→ Task 3 (InvoiceCreateSummaryStep + DoneStep)
   │
   └──→ Task 4 (useInvoiceCreate hook + InvoiceCreateScreen)
              │
              └──→ Task 6 (SimpleProductScreen modifications)
                      │
                      └──→ Task 7 (Integración + build)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "1.2"],
      "description": "Infraestructura de navegación: enum Screen, ruta en App.tsx, opción en menú ProductsScreen"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "3.1", "3.2", "3.3"],
      "description": "Utilidad detectExistingProducts + componentes de UI puros (SummaryStep, DoneStep) + property tests"
    },
    {
      "wave": 3,
      "tasks": ["4.1", "4.2", "4.3"],
      "description": "Hook orquestador useInvoiceCreate + InvoiceCreateScreen principal"
    },
    {
      "wave": 4,
      "tasks": ["6.1", "6.2"],
      "description": "Modificaciones a SimpleProductScreen: leer prefill, botones condicionales, escribir resultado"
    },
    {
      "wave": 5,
      "tasks": ["7.1", "7.2"],
      "description": "Integración de navegación de retorno + verificación de build completo"
    }
  ]
}
```
