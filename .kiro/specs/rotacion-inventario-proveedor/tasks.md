# Implementation Plan: Rotación de Inventario por Proveedor

## Overview

Este plan implementa la migración del diagnóstico de salud de stock desde umbrales por categoría hacia umbrales por proveedor. Se estructura en 5 fases: migración de BD, hooks/utilidades, componentes UI, integración en ProductsScreen, y testing. El stack es TypeScript + React + Supabase, con `fast-check` para property-based testing.

## Task Dependency Graph

```
Task 1 (Migración BD — base)
   │
   ├─→ Task 2 (Hooks y utilidades — dependen de schema nuevo)
   │       │
   │       ├─→ Task 3 (Componentes UI — dependen de hooks)
   │       │       │
   │       │       └─→ Task 4 (Integración ProductsScreen — depende de componentes + hooks)
   │       │               │
   │       │               └─→ Task 5 (Checkpoint final)
   │       │
   │       └─→ Task 6 (Testing PBT + unit — depende de utilidades)
   │
   └─→ Task 6 (Testing PBT también puede correr tras Task 2)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1"],
      "description": "Migración de base de datos — fundación de todo"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "2.3", "2.4"],
      "description": "Hooks y utilidades que dependen del schema nuevo"
    },
    {
      "wave": 3,
      "tasks": ["3.1", "3.2", "3.3"],
      "description": "Componentes UI que consumen los hooks"
    },
    {
      "wave": 4,
      "tasks": ["4.1", "4.2"],
      "description": "Integración completa en ProductsScreen"
    },
    {
      "wave": 5,
      "tasks": ["5.1"],
      "description": "Checkpoint final de verificación"
    },
    {
      "wave": 6,
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6"],
      "description": "Testing — PBT y unit tests"
    }
  ]
}
```

## Tasks

- [x] 1. Migración de base de datos
  - [x] 1.1 Ejecutar migración SQL en Supabase
    - Agregar columnas `optimal_min`, `optimal_max`, `alert_days` (integer, nullable) a tabla `suppliers`
    - Agregar columna `default_supplier_id` (UUID, nullable, FK a `suppliers.id`, ON DELETE SET NULL) a tabla `products`
    - Crear índice `idx_products_default_supplier_id` en `products.default_supplier_id`
    - Crear tabla `supplier_product_config` con columnas: `id` (UUID PK), `supplier_id` (UUID FK NOT NULL, ON DELETE CASCADE), `product_id` (UUID FK NOT NULL, ON DELETE CASCADE), `created_at` (timestamptz default now())
    - Crear índice único compuesto `idx_supplier_product_config_unique` en `(supplier_id, product_id)`
    - Crear índice `idx_supplier_product_config_product` en `product_id`
    - Habilitar RLS en `supplier_product_config` y crear política que permita operaciones solo para usuarios del mismo business
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 2. Hooks y utilidades
  - [x] 2.1 Crear hook `useSupplierProductConfig`
    - Crear archivo `hooks/useSupplierProductConfig.ts`
    - Implementar interfaz `SupplierProductLink` con campos: `id`, `supplier_id`, `product_id`, `created_at`
    - Implementar fetch de registros filtrado por `business_id` (via suppliers del negocio)
    - Implementar `addLink(supplierId, productId)` con upsert silencioso ante duplicados
    - Implementar `removeLink(id)` con delete
    - Implementar `getProductsForSupplier(supplierId)` que retorna array de product_ids
    - Implementar `getSuppliersForProduct(productId)` que retorna array de supplier_ids
    - Manejar error de fetch con degradación graceful (toast warning, array vacío)
    - _Requirements: 2.4, 5.1, 5.4_

  - [x] 2.2 Extender interfaz `Supplier` en `useSuppliers`
    - Agregar campos opcionales `optimal_min`, `optimal_max`, `alert_days` al tipo `Supplier`
    - Asegurar que `fetchSuppliers` trae las columnas nuevas en el SELECT
    - Asegurar que `updateSupplier` puede persistir los campos de umbrales
    - _Requirements: 2.5, 4.3, 4.4_

  - [x] 2.3 Refactorizar `getInventoryDaysLabel` para usar umbrales de proveedor
    - Crear interfaz `SupplierThresholds` con `optimal_min`, `optimal_max`, `alert_days`
    - Definir constante `DEFAULT_THRESHOLDS = { optimal_min: 7, optimal_max: 12, alert_days: 3 }`
    - Cambiar la firma para recibir `thresholds: SupplierThresholds` como parámetro explícito
    - Eliminar toda lectura de `categoryObj.optimal_min/max/alert_days` dentro de la función
    - Actualizar todos los call sites existentes para pasar umbrales explícitamente
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 2.4 Crear función utilitaria `normalizeSupplierName` e `isProductOfSupplier`
    - Crear/ubicar en archivo de utilidades (ej. `lib/supplierUtils.ts`)
    - `normalizeSupplierName(name: string): string` → `name.trim().toLowerCase()`
    - `isProductOfSupplier(productId, supplierId, supplierName, defaultSupplierId, lotSupplierMap, manualLinks): boolean` con lógica de 3 fuentes (OR)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3. Componentes UI
  - [x] 3.1 Crear componente `SupplierPicker`
    - Crear archivo `components/SupplierPicker.tsx`
    - Renderizar fila horizontal de chips con nombre del proveedor
    - Chip "Todos" al inicio para deseleccionar
    - Al tocar un chip, seleccionarlo (borde amber-400); tocar de nuevo deselecciona
    - En móvil (<430px): scroll horizontal con snap
    - Aceptar props: `suppliers`, `selectedSupplierId`, `onSelect`, `loading`
    - Accesibilidad: `tabindex="0"`, `aria-label`, soporte teclado (Enter/Space para seleccionar, flechas para navegar)
    - _Requirements: 3.1, 3.3, 3.4_

  - [x] 3.2 Crear componente `SupplierSettingsModal`
    - Crear archivo `components/SupplierSettingsModal.tsx`
    - Header con nombre del proveedor
    - Campos editables: `optimal_min`, `optimal_max`, `alert_days` (misma UI que CategorySettingsModal)
    - Validación inline: `optimal_min > optimal_max` → error; `alert_days < 1` → error; botón Guardar deshabilitado si hay errores
    - Sección "Agregar productos": input buscador por nombre/código de barras + resultados en dropdown
    - Al seleccionar un producto del buscador, llamar `addLink` del hook `useSupplierProductConfig`
    - Mostrar lista de productos vinculados manualmente con opción de desvincular
    - Guardar umbrales llamando `updateSupplier` con los valores editados
    - Manejo de error de red: toast error + conservar valores editados
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.3 Agregar dropdown de proveedor default en SimpleProductScreen
    - Agregar campo select de proveedor después del campo de categoría y antes de código de barras
    - Poblar con proveedores activos del negocio (`is_active = true`), ordenados alfabéticamente
    - Preseleccionar el proveedor si el producto tiene `default_supplier_id`
    - Al guardar, incluir `default_supplier_id` en el payload (o `null` si no se seleccionó)
    - Usar mismo patrón de `<select>` con estilos Tailwind que el campo de categoría
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 4. Integración en ProductsScreen
  - [x] 4.1 Integrar SupplierPicker y filtrado por proveedor
    - Montar `SupplierPicker` en la zona de filtros principales de ProductsScreen
    - Agregar estado `selectedSupplierId` al componente
    - Implementar filtrado: cuando hay proveedor seleccionado, usar `isProductOfSupplier` para filtrar la lista de productos
    - Construir `lotSupplierMap` desde `inventory_lots` (productId → [supplier_names normalizados])
    - Consumir `useSupplierProductConfig` para obtener vinculaciones manuales
    - Resetear `selectedSupplierId` a `null` al cambiar de tab (Insumos, Servicios, Promociones)
    - Mostrar botón "Configurar Rotación" visible cuando hay proveedor seleccionado, que abre `SupplierSettingsModal`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.2 Implementar lógica de desglose de diagnóstico por proveedor
    - Agrupar lotes activos por proveedor (normalizado) para cada producto
    - Si 1 proveedor con lotes → diagnóstico consolidado con umbrales de ESE proveedor
    - Si N > 1 proveedores con lotes → mostrar N líneas, cada una con umbrales de su proveedor
    - Si 0 proveedores con lotes → usar umbrales del `default_supplier_id` o defaults 7/12/3
    - Cuando hay proveedor seleccionado: recalcular diagnóstico usando umbrales del seleccionado para todos los productos visibles
    - Asegurar que el diagnóstico se recalcula reactivamente al cambiar selección (sin recargar)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1, 7.2, 7.4_

- [x] 5. Checkpoint de verificación
  - [x] 5.1 Checkpoint — Verificar integración completa
    - Asegurar que todos los componentes se renderizan sin errores de compilación
    - Verificar que el flujo completo funciona: seleccionar proveedor → ver productos filtrados → ver diagnóstico con umbrales correctos
    - Verificar que SimpleProductScreen guarda y precarga `default_supplier_id`
    - Verificar que SupplierSettingsModal persiste umbrales y vinculaciones
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Testing
  - [ ]* 6.1 Property test: diagnóstico usa exclusivamente umbrales de proveedor
    - **Property 1: Diagnóstico usa exclusivamente umbrales de proveedor**
    - Generar combinaciones arbitrarias de (stock, velocity, supplierThresholds, categoryThresholds)
    - Verificar que el resultado es idéntico al calculado solo con supplierThresholds e independiente de categoryThresholds
    - Usar `fast-check` con mínimo 100 iteraciones
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 6.2 Property test: asociación producto-proveedor es unión de 3 fuentes
    - **Property 2: Asociación producto-proveedor es la unión de tres fuentes**
    - Generar combinaciones arbitrarias de (defaultSupplierId, lotSupplierMap, manualLinks)
    - Verificar que `isProductOfSupplier` retorna `true` sii al menos una fuente coincide
    - Usar `fast-check` con mínimo 100 iteraciones
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [ ]* 6.3 Property test: normalización de nombres es consistente
    - **Property 3: Normalización de nombres es consistente**
    - Generar strings arbitrarios y verificar que `normalizeSupplierName` es idempotente y que strings que difieren solo en case/espacios laterales producen el mismo resultado
    - Usar `fast-check` con mínimo 100 iteraciones
    - **Validates: Requirements 5.5**

  - [ ]* 6.4 Property test: clasificación de salud es mutuamente excluyente y exhaustiva
    - **Property 4: Clasificación de salud es mutuamente excluyente y exhaustiva**
    - Generar (days > 0, thresholds con alert_days < optimal_min < optimal_max) arbitrarios
    - Verificar que el resultado es exactamente uno de: `critico`, `reordenar`, `optimo`, `lento`
    - Usar `fast-check` con mínimo 100 iteraciones
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 6.5 Property test: desglose correcto según cantidad de proveedores
    - **Property 5: Desglose correcto según cantidad de proveedores con lotes**
    - Generar mapas de lotes con 1 o N proveedores
    - Verificar: 1 proveedor → 1 línea consolidada; N proveedores → N líneas
    - Usar `fast-check` con mínimo 100 iteraciones
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 6.6 Property test: filtrado incluye exactamente los productos asociados
    - **Property 6: Filtrado por proveedor seleccionado incluye exactamente los productos asociados**
    - Generar lista de productos con diferentes combinaciones de fuentes de asociación
    - Verificar que el filtrado retorna exactamente los que satisfacen `isProductOfSupplier`
    - Usar `fast-check` con mínimo 100 iteraciones
    - **Validates: Requirements 3.2, 5.1**

## Notes

- Las tareas marcadas con `*` son opcionales (PBT tests) y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- La migración SQL (Task 1.1) debe ejecutarse directamente en Supabase Dashboard ya que los archivos locales están desincronizados (regla del workspace)
- Los defaults hardcodeados 7/12/3 coinciden con los defaults actuales por categoría, asegurando cero fricción en la migración
- La tabla `categories` conserva sus columnas de umbrales intactas; simplemente se dejan de consultar
- `fast-check` ya debe estar como devDependency; si no, instalar antes de las tareas de testing
- El checkpoint (Task 5.1) valida el flujo completo antes de pasar a testing
