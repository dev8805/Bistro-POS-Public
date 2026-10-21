# Implementation Plan: Creación de Productos desde Factura IA

## Overview

Este plan implementa las cinco mejoras al flujo de escaneo unificado de facturas: extracción de código de barras por línea, prellenado del proveedor, campo de barcode en creación rápida, extracción de teléfono del proveedor, y opción de abrir formulario completo con datos prellenados.

La implementación procede en capas: primero la edge function (backend), luego tipos y utilidades, después componentes UI, integración con `SimpleProductScreen`, y finalmente tests opcionales.

**Dependencias externas**: Este spec requiere que `products.default_supplier_id` exista (spec `rotacion-inventario-proveedor`) y que el flujo de escaneo unificado esté implementado (spec `escaneo-factura-unificado`).

## Task Dependency Graph

```
Task 1 (Edge function: barcode + phone en prompt)
   │
   └─→ Task 2 (Tipos, parser y utilidades)
           │
           ├─→ Task 3 (UI: ScanQuickProductForm — proveedor + barcode + full form)
           │       │
           │       └─→ Task 5 (Integración: SimpleProductScreen prefill + navegación)
           │               │
           │               └─→ Task 6 (Integración: buildPurchasePayload + finalización)
           │                       │
           │                       └─→ Task 7 (Checkpoint final)
           │
           └─→ Task 4 (UI: ScanSupplierStep — campo teléfono)
                   │
                   └─→ Task 6
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1"],
      "description": "Modificar prompt de la edge function para extraer barcode y phone"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "2.3"],
      "description": "Actualizar tipos, crear utilidad de validación y actualizar parser"
    },
    {
      "wave": 3,
      "tasks": ["3.1", "3.2", "4.1"],
      "description": "Componentes UI: campos en formulario rápido y teléfono en proveedor"
    },
    {
      "wave": 4,
      "tasks": ["5.1", "5.2"],
      "description": "Integración con SimpleProductScreen y navegación de retorno"
    },
    {
      "wave": 5,
      "tasks": ["6.1"],
      "description": "Payload de register_purchase con barcode y default_supplier_id"
    },
    {
      "wave": 6,
      "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"],
      "description": "Tests de propiedad y unitarios (opcionales)"
    }
  ]
}
```

## Tasks

- [x] 1. Modificar edge function `scan-invoice-unified`
  - [x] 1.1 Ampliar prompt de Gemini para extraer barcode por línea y phone del encabezado
    - En `supabase/functions/scan-invoice-unified/index.ts`, agregar al prompt las instrucciones para:
      - Extraer código de barras numérico (8-14 dígitos) de cada línea cuando la factura lo incluya
      - Devolver `barcode: ""` cuando no haya código legible
      - Extraer teléfono del proveedor del encabezado (formatos colombianos: 10 dígitos, con/sin +57)
      - Devolver `phone: ""` cuando no haya teléfono
    - Actualizar el schema JSON de la respuesta esperada para incluir `items[].barcode` y `header.phone`
    - Las instrucciones de barcode y phone van en el MISMO prompt único existente (no crear prompts adicionales)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3_

- [x] 2. Tipos, parser y utilidades
  - [x] 2.1 Actualizar interfaces en `lib/invoiceScan/types.ts`
    - Agregar campo `barcode: string` a `ScanLine`
    - Agregar campo `barcode: string` a `NewProductDraft`
    - Agregar campo `phone: string` al tipo `ScanSupplierDraft` (variante `kind: 'new'`)
    - _Requirements: 1.1, 1.2, 3.5, 6.1_

  - [x] 2.2 Crear `lib/invoiceScan/barcodeValidation.ts`
    - Implementar `isValidBarcode(code: string): boolean`
    - Retorna `true` si la cadena es vacía o contiene exclusivamente 8-14 dígitos numéricos
    - Retorna `false` para cualquier otro caso (letras, símbolos, longitud fuera de rango)
    - _Requirements: 1.3, 4.6_

  - [x] 2.3 Actualizar parser en `hooks/useInvoiceScanDraft.ts`
    - En `parseScanResponse()`, mapear `items[i].barcode` a `ScanLine.barcode` (fallback `""` si `undefined`)
    - Mapear `header.phone` a `ScanSupplierDraft.phone` (fallback `""` si `undefined`)
    - _Requirements: 1.1, 1.2, 6.1, 6.2_

- [x] 3. UI: Campo de proveedor y barcode en formulario rápido
  - [x] 3.1 Modificar `ScanQuickProductForm.tsx` — Campos de proveedor y barcode
    - Agregar campo de proveedor no editable (después de categoría, antes de barcode):
      - Si `supplierInfo.isNew === false`: mostrar nombre del proveedor como texto readonly
      - Si `supplierInfo.isNew === true`: mostrar nombre + badge visual "Nuevo — se creará al finalizar"
    - Agregar campo de código de barras editable (después de proveedor):
      - Prellenar con `defaultBarcode` prop
      - Botón de escaneo junto al campo que activa `<BarcodeScanner>` existente
      - Al detectar barcode: solo escribir valor en estado local (NO buscar en BD, Go-UPC ni Google CSE)
      - Validación: `isValidBarcode()` — si inválido, mostrar error inline pero no bloquear el botón de crear
      - Si barcode coincide con otro producto del catálogo (buscar en `products` prop), mostrar advertencia con nombre del producto existente
    - Actualizar `ScanQuickProductFormProps` con `defaultBarcode`, `supplierInfo`, `onOpenFullForm`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.2 Modificar `ScanLineResolverStep.tsx` — Pasar nuevas props
    - Pasar `defaultBarcode` (desde `ScanLine.barcode`) a `ScanQuickProductForm`
    - Pasar `supplierInfo` (derivado de `supplierDecision` del borrador) a `ScanQuickProductForm`
    - Manejar callback `onOpenFullForm` para iniciar navegación al formulario completo
    - Al aceptar creación rápida: incluir `barcode` en `NewProductDraft`
    - _Requirements: 2.1, 3.2, 3.5_

- [x] 4. UI: Campo de teléfono en ScanSupplierStep
  - [x] 4.1 Modificar `ScanSupplierStep.tsx` — Campo de teléfono editable
    - Cuando el proveedor es nuevo (`kind: 'new'`) y `phone` es no vacío: mostrar campo editable prellenado con el teléfono detectado
    - Cuando el proveedor es nuevo y `phone` es vacío: no mostrar campo de teléfono
    - Cuando el proveedor es existente: no mostrar campo de teléfono (no se actualiza, Req 6.6)
    - Guardar el valor editado del teléfono en `ScanSupplierDraft`
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 5. Integración: SimpleProductScreen y navegación
  - [x] 5.1 Agregar botón "Abrir formulario completo" y navegación en `InvoiceScanScreen`
    - En `ScanQuickProductForm`: agregar enlace/botón "Abrir formulario completo" visible después de los campos
    - Al hacer click: recoger datos actuales del formulario rápido (nombre, costo, barcode, categoría, unidad, isForSale)
    - Si proveedor es nuevo y no existe en `suppliers`: crear el proveedor primero (insert en `suppliers` con name, nit, phone)
    - Escribir `bistro_scan_prefill` en `sessionStorage` con los datos prellenados (envolver en try/catch)
    - Navegar a `SimpleProductScreen` en modo creación
    - Si `sessionStorage` no está disponible: ocultar botón "Abrir formulario completo"
    - _Requirements: 5.1, 5.2, 5.3, 5.8_

  - [x] 5.2 Modificar `SimpleProductScreen.tsx` — Leer prefill y comportamiento desde escaneo
    - Al montar: leer y eliminar `sessionStorage` clave `bistro_scan_prefill`
    - Si `fromScan === true`:
      - Poblar campos: nombre, costo, barcode, proveedor (por id), isForSale
      - Desactivar lookup automático de barcode (Go-UPC, Google CSE, duplicate check on type)
      - Al guardar: crear producto inmediatamente, escribir `bistro_scan_product_created` en `sessionStorage` con `{ productId, scanLineId }`, navegar back
      - Al cancelar: navegar back sin escribir en `sessionStorage`
    - En `InvoiceScanScreen`: al recuperar foco, leer `bistro_scan_product_created` y vincular la línea al producto creado
    - Asignar `default_supplier_id` al crear producto si `supplierId` está presente en el prefill
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

- [x] 6. Integración: Payload de finalización
  - [x] 6.1 Modificar `lib/invoiceScan/buildPurchasePayload.ts`
    - Incluir `barcode` (del `NewProductDraft`) en cada producto nuevo del payload
    - Incluir `default_supplier_id` (del `supplierDecision`) en cada producto nuevo del payload
    - Si proveedor es nuevo: la RPC `register_purchase` ya lo crea; asegurar que el `default_supplier_id` se resuelve con el id del proveedor recién creado
    - Incluir `phone` en los datos del proveedor nuevo dentro del payload
    - _Requirements: 2.5, 2.6, 3.5, 6.5_

- [ ] 7. Checkpoint y tests
  - [ ]* 7.1 Property test: Validación de código de barras
    - Crear `lib/invoiceScan/barcodeValidation.test.ts`
    - **Property 1: Validación de código de barras**
    - Generar cadenas arbitrarias con fast-check, verificar que `isValidBarcode` retorna `true` solo para vacío o 8-14 dígitos
    - **Validates: Requirements 1.3, 4.6**

  - [ ]* 7.2 Property test: Escaneo de barcode sin efectos de red
    - En `components/invoiceScan/ScanQuickProductForm.test.tsx`
    - **Property 2: Escaneo de barcode sin efectos de red**
    - Verificar que al disparar `onScan` con códigos aleatorios, no se invocan fetch ni consultas externas
    - **Validates: Requirements 4.2, 4.4, 4.5**

  - [ ]* 7.3 Property test: Round-trip de barcode en el borrador
    - En `components/invoiceScan/ScanQuickProductForm.test.tsx`
    - **Property 3: Round-trip de barcode en el borrador**
    - Generar barcodes válidos (8-14 dígitos) y vacío, verificar que `onCreate` recibe exactamente ese valor
    - **Validates: Requirements 3.4, 3.5**

  - [ ]* 7.4 Property test: Detección de barcode duplicado
    - En `components/invoiceScan/ScanQuickProductForm.test.tsx`
    - **Property 4: Detección de barcode duplicado**
    - Generar catálogos con barcodes aleatorios, ingresar uno existente, verificar que aparece advertencia
    - **Validates: Requirements 3.6**

  - [ ]* 7.5 Property test: Completitud del transfer al formulario completo
    - En `components/invoiceScan/ScanQuickProductForm.test.tsx`
    - **Property 5: Completitud del transfer de datos al formulario completo**
    - Generar combinaciones de campos, invocar `onOpenFullForm`, verificar que el payload contiene todos los valores actuales
    - **Validates: Requirements 5.3**

  - [ ]* 7.6 Property test: Asociación de proveedor en payload
    - Crear `lib/invoiceScan/buildPurchasePayload.test.ts`
    - **Property 6: Asociación de proveedor en la creación rápida**
    - Generar borradores con proveedor confirmado/nuevo + líneas con decisión `created`, verificar que payload incluye `default_supplier_id`
    - **Validates: Requirements 2.5**

- [x] 8. Checkpoint final
  - Verificar que todos los tests pasan
  - Confirmar que el flujo completo funciona: escaneo → resolución → creación rápida con barcode y proveedor → formulario completo → finalización con `register_purchase`
  - Preguntar al usuario si surgen dudas

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- Cada tarea referencia los requisitos específicos para trazabilidad.
- Los checkpoints permiten validación incremental.
- Los property tests usan `fast-check` (ya disponible en el proyecto) con mínimo 100 iteraciones.
- **Dependencia crítica**: Los specs `rotacion-inventario-proveedor` y `escaneo-factura-unificado` deben estar implementados antes de ejecutar estas tareas.
- El componente `BarcodeScanner` existente se reutiliza sin modificaciones — solo cambia el callback en el formulario rápido.
- Los datos de `sessionStorage` son efímeros y se eliminan al ser consumidos. No hay persistencia residual.
- La edge function modificada es `scan-invoice-unified` (la del spec unificado), NO la antigua `scan-invoice` v30.
