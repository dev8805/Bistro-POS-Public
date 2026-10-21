# Implementation Plan: Cambiar Tipo de Producto en Edición

## Overview

Habilitar el select de tipo de producto en modo edición, crear un modal de advertencia con consecuencias genéricas por dirección de cambio, y ejecutar la conversión de tipo con limpieza de datos huérfanos al guardar.

## Task Dependency Graph

```
Task 1 (lib/productTypeChange.ts)
   │   getTypeChangeWarnings + executeTypeChange
   │
   ├─→ Task 2 (TypeChangeWarningModal)
   │       │   usa getTypeChangeWarnings para renderizar consecuencias
   │       │
   │       └─→ Task 3.1 (integrar select + modal en SimpleProductScreen)
   │               │   reemplaza <input readOnly> por <select>
   │               │
   │               └─→ Task 3.2 (handleSubmit + redirección)
   │                       │   invoca executeTypeChange y navega según destino
   │                       │
   │                       └─→ Task 4 (Checkpoint intermedio)
   │                               │
   │                               └─→ Task 6 (Checkpoint final)
   │
   └─→ Tasks 5.1 – 5.4 * (property tests opcionales)
           dependen sólo de la lógica pura de Task 1
```

Reglas de lectura:
- Cada flecha `─→` indica "debe completarse antes de".
- Las tareas marcadas con `*` (5.1 a 5.4) son opcionales y pueden ejecutarse en paralelo una vez terminada Task 1.
- Task 4 y Task 6 son puntos de verificación, no aportan código nuevo.

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1"],
      "description": "Crear módulo base de lógica pura y limpieza"
    },
    {
      "wave": 2,
      "tasks": ["1.2", "2.1", "5.1", "5.2", "5.3", "5.4"],
      "description": "Componente modal y tests opcionales (dependen solo de Task 1)"
    },
    {
      "wave": 3,
      "tasks": ["3.1"],
      "description": "Integrar selector y modal en SimpleProductScreen"
    },
    {
      "wave": 4,
      "tasks": ["3.2"],
      "description": "Modificar handleSubmit con executeTypeChange y redirección"
    },
    {
      "wave": 5,
      "tasks": ["4"],
      "description": "Checkpoint intermedio"
    },
    {
      "wave": 6,
      "tasks": ["6"],
      "description": "Checkpoint final"
    }
  ]
}
```

## Tasks

- [x] 1. Crear la función pura de warnings y la lógica de limpieza
  - [x] 1.1 Crear `lib/productTypeChange.ts` con el tipo `ProductTypeKey`, la función `getTypeChangeWarnings(from, to)` que retorna las consecuencias por dirección, y la función `executeTypeChange(productId, from, to)` que actualiza el producto y limpia datos huérfanos en Supabase
    - Definir el tipo `ProductTypeKey = 'sale' | 'insumo' | 'processed'`
    - Implementar el mapa de warnings para las 6 direcciones de cambio
    - Implementar la lógica de update de `products` + delete de tablas huérfanas (inventory_lots, product_purchase_units, product_ingredients) según la dirección
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

  - [ ]* 1.2 Escribir property test para getTypeChangeWarnings
    - **Property 2: Warnings cubren todas las direcciones de cambio**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

- [x] 2. Crear el componente TypeChangeWarningModal
  - [x] 2.1 Crear `components/TypeChangeWarningModal.tsx` — modal que recibe `fromType`, `toType`, `isOpen`, `onConfirm`, `onCancel`. Muestra título "Cambiar tipo de producto", lista de consecuencias usando `getTypeChangeWarnings`, y botones Cancelar/Confirmar con estilos Tailwind del design system (amber-400 para confirmar)
    - Incluir accesibilidad: aria-label, tabIndex, onKeyDown para Escape
    - _Requirements: 1.2, 2.1-2.6_

- [x] 3. Integrar el cambio de tipo en SimpleProductScreen
  - [x] 3.1 Reemplazar el `<input readOnly>` del selector de tipo en modo edición por un `<select>` con 3 opciones: "Producto para venta", "Insumo", "Receta". Agregar estados `pendingTypeChange` y `showTypeChangeModal`. Modificar `handleTypeChange` para que en modo edición abra el modal en vez de cambiar estado directamente.
    - El select debe tener el tipo actual preseleccionado basándose en `productToEdit.type` y `productToEdit.is_for_sale`
    - Si cancela el modal → revertir select al valor original
    - Si confirma → setear `pendingTypeChange` con el nuevo tipo
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Modificar `handleSubmit` para detectar `pendingTypeChange`. Si existe: llamar `executeTypeChange`, luego redirigir según el tipo destino (processed → `Screen.CREATE_PRODUCT_PROCESSED`, sale/insumo desde processed → `Screen.CREATE_PRODUCT_SIMPLE`, sale↔insumo → refrescar pantalla actual).
    - Si `executeTypeChange` falla → mostrar toast de error y no navegar
    - Pasar `productToEdit` actualizado como prop al navegar
    - _Requirements: 1.5, 4.1, 4.2, 4.3_

- [ ] 4. Checkpoint - Verificar flujo completo
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que el flujo funciona para las 6 direcciones de cambio manualmente si es necesario.

- [ ]* 5. Tests de propiedades de correctitud
  - [ ]* 5.1 Escribir property test para limpieza a Receta
    - **Property 3: Limpieza a Receta elimina stock y datos asociados**
    - **Validates: Requirements 3.1**

  - [ ]* 5.2 Escribir property test para limpieza a Insumo
    - **Property 4: Limpieza a Insumo establece precio cero y limpia campos de venta**
    - **Validates: Requirements 3.2**

  - [ ]* 5.3 Escribir property test para limpieza desde Receta
    - **Property 5: Limpieza desde Receta elimina ingredientes**
    - **Validates: Requirements 3.3**

  - [ ]* 5.4 Escribir property test de inmutabilidad de order_items
    - **Property 6: Ventas históricas son inmutables ante cambio de tipo**
    - **Validates: Requirements 3.4**

- [ ] 6. Checkpoint final
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- La limpieza de datos se hace con llamadas directas a Supabase desde el frontend (no requiere RPC dedicado).
- Las ventas históricas (order_items) NUNCA se tocan — guardan snapshot del producto.
- El stock al cambiar FROM Receta queda como 0 (el usuario deberá ajustarlo manualmente después).
