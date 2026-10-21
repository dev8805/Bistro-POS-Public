# Implementation Plan

## Overview

Plan para llevar los productos-modificadores (add-ons) al flujo de Mesa y de Delivery/Takeaway en edición, persistiéndolos como líneas hijas reales de `order_items` vinculadas a su padre. El cambio es aditivo y retrocompatible; Orden Rápida no se modifica. La migración de base de datos requiere aprobación explícita del usuario antes de aplicarse.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4"] },
    { "wave": 4, "tasks": ["5", "6"] },
    { "wave": 5, "tasks": ["7"] },
    { "wave": 6, "tasks": ["8"] },
    { "wave": 7, "tasks": ["9"] },
    { "wave": 8, "tasks": ["10"] },
    { "wave": 9, "tasks": ["11"] }
  ]
}
```

Dependencias:
- 1 (migración BD) → 2 (mapeo `fetchTableOrder`)
- 2 → 3 (`addItemToOrder`) y 4 (`addItemToOrderById`)
- 3 → 5 (rama mesa) · 4 → 6 (rama edición)
- 5, 6 → 7 (cascada cantidad/eliminar) → 8 (reedición padre)
- 8 → 9 (comanda/ticket/inventario) → 10 (tolerancia legacy) → 11 (verificación final)

## Tasks

- [ ] 1. Migración de base de datos: columna de vínculo padre-hijo en `order_items`
  - APROBACIÓN OBLIGATORIA del usuario antes de aplicar (ya explicada en lenguaje simple en el diseño).
  - Aplicar con `apply_migration`: agregar `parent_order_item_id uuid NULL REFERENCES public.order_items(id) ON DELETE CASCADE` y el índice `idx_order_items_parent`.
  - Ejecutar `get_advisors` (security y performance) tras aplicar y resolver hallazgos si los hubiera.
  - Sincronizar a local con `supabase migration fetch --yes` y regenerar tipos.
  - _Requirements: 1.2, 2.1, 7.1, 9.3, 9.4_

- [ ] 2. Mapear el vínculo al cargar la orden desde la BD
  - En `hooks/useSales.ts` → `fetchTableOrder`: incluir `parent_order_item_id` en el `select` de `order_items` y mapearlo a `parentOrderItemId` en cada ítem devuelto.
  - Verificar que `CartItem.parentOrderItemId` (ya existe en `types.ts`) quede poblado al reabrir una mesa.
  - _Requirements: 3.1, 3.5, 9.4, 9.5_

- [ ] 3. Persistir add-ons en `addItemToOrder` (modo Mesa)
- [ ] 3.1 Crear líneas hijas tras insertar el padre
  - Aceptar `item.addedModifiers` opcional; tras insertar el padre y obtener su `id`, insertar una fila hija por add-on con `parent_order_item_id = padre.id`, `quantity = padre.quantity`, `unit_price = addon.price`, `total_price = round(price * quantity)`, `status = 'pending'`.
  - Devolver `childOrderItemIds` en el resultado.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
- [ ] 3.2 Evitar merges incorrectos
  - Si `item.addedModifiers?.length`, omitir la búsqueda de `existingItem` (no mergear).
  - Excluir de la búsqueda de `existingItem` las filas con `parent_order_item_id != null` (nunca mergear contra una hija).
  - _Requirements: 1.1, 6.1_
- [ ] 3.3 Manejo de error atómico
  - Si falla la inserción del padre o de cualquier hija, propagar el error para que el llamador revierta; evitar dejar líneas parciales (la cascade limpia hijas del padre creado).
  - Resolver/validar el add-on contra el catálogo en vivo; si no existe o está inactivo, cancelar la operación.
  - _Requirements: 1.6, 1.7_

- [ ] 4. Persistir add-ons en `addItemToOrderById` (modo Delivery/Takeaway en edición)
  - Replicar la lógica de la tarea 3 (crear hijas, no-merge, excluir hijas del merge, error atómico, validación de catálogo) en `addItemToOrderById`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 5. `handleAddToOrder` (App.tsx): rama `activeTableId`
  - Pasar `addedModifiers` a `addItemToOrder`.
  - Construir el carrito optimista con padre + `buildModifierChildren(tempId, quantity, addedModifiers)`; items con add-ons nunca mergean (`hasModifiers ? -1 : findIndex`).
  - Al volver el `result`, reemplazar el `temp-` del padre por el `orderItemId` real y re-vincular `parentOrderItemId` de las hijas con `childOrderItemIds`.
  - En error, `setCart(previousCart)` y toast.
  - _Requirements: 1.1, 1.5, 1.7_

- [ ] 6. `handleAddToOrder` (App.tsx): rama `editingOrderId`
  - Mismo patrón de la tarea 5 con `addItemToOrderById`.
  - _Requirements: 2.1, 2.3_

- [ ] 7. Cascada de cantidad y eliminación en mesa/edición
  - Cambio de cantidad del padre: propagar la nueva cantidad a las filas hijas en BD (equivalente a la del padre).
  - Eliminación del padre: confiar en `ON DELETE CASCADE` para las hijas en BD; verificar que el carrito local también remueva las hijas (ya hay cascada en `MenuScreen`/`PaymentScreen`).
  - Recalcular total tras eliminar/reducir.
  - _Requirements: 6.2, 6.3, 7.1, 7.2, 7.4_

- [ ] 8. Reedición del producto padre (cambiar conjunto de add-ons)
  - En la rama de edición in-place de `handleAddToOrder`: al cambiar el conjunto de add-ons de un padre persistido, reconstruir sus hijas en BD (borrar las que se quitan, crear las nuevas) sin duplicar las que se mantienen; sin cambios si no varía el conjunto ni la cantidad.
  - En error, conservar el conjunto previo y avisar.
  - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [ ] 9. Comanda, ticket e inventario (verificación, sin lógica nueva esperada)
  - Confirmar que `receiptItems` marca `isModifier`/`modifiers` a partir de `parentOrderItemId` para órdenes de mesa cargadas desde BD.
  - Verificar que el ticket imprime cada hija como línea y que el inventario descuenta cada hija por la ruta FIFO (`lot_allocations` por `order_item_id`).
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1_

- [ ] 10. Tolerancia a datos legacy / vínculos rotos
  - Tratar `parent_order_item_id` nulo o inexistente como línea normal sin bloquear la carga; `total_price` no numérico se trata como 0 con aviso.
  - _Requirements: 4.5, 9.1, 9.4, 9.5_

- [ ] 11. Verificación final
  - `npm run build` (typecheck) sin errores.
  - Ejecutar el checklist manual del diseño en `npm run dev` (casos 1–9) en el negocio de pruebas con mesas habilitadas.
  - Confirmar que Orden Rápida sigue intacta (no regresión).
  - _Requirements: 9.1, 9.2, 9.3_

## Notes

- La tarea 1 (migración) está bloqueada hasta aprobación explícita del usuario; el resto del código es tolerante a `NULL`, por lo que puede mergearse sin romper aunque la migración aún no se aplique en producción.
- No se introduce un tipo de transacción offline nuevo: mesas persisten en línea (como hoy) y Orden Rápida reutiliza la cola `sale` existente, que ya transporta las líneas hijas.
- Requerimiento 8 (offline) se considera cubierto por el flujo existente de `sale`; no requiere tareas de implementación nuevas en esta iteración.
