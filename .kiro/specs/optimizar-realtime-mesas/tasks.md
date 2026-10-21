# Implementation Plan

## Overview

Plan de implementación de la "Opción B": eliminar la suscripción cara a `order_items`, simplificar las píldoras de mesa (solo estado, sin monto) y agregar un estado de carga limpio al abrir una mesa ocupada. El trabajo se apoya en código existente (`useTables`, `handleTableSelect`/`fetchTableOrder` y el canal de detalle filtrado), por lo que la mayoría de tareas son eliminaciones y ajustes puntuales, no construcción nueva.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "3"] },
    { "wave": 2, "tasks": ["2", "4"] },
    { "wave": 3, "tasks": ["5"] }
  ]
}
```

```
1 (eliminar useOpenTickets)
└─> 2 (simplificar píldoras)
       └─> 5 (verificación)
3 (estado de carga en App.tsx)
└─> 4 (componente overlay)
       └─> 5 (verificación)

- 1 debe ir antes de 2 (2 deja de usar el hook que 1 elimina).
- 3 y 4 son independientes de 1/2 y pueden hacerse en paralelo.
- 4 depende de 3 (usa los estados tableOrderLoading/tableOrderError).
- 5 (verificación) va al final, tras 2 y 4.
```

## Tasks

- [x] 1. Eliminar la suscripción global a `order_items`
  - Verificar con búsqueda que ningún archivo (salvo `OpenTicketsBar`) importe `useOpenTickets`.
  - Borrar el archivo `hooks/useOpenTickets.ts`.
  - _Requirements: 2.1, 2.2_

- [x] 2. Simplificar las píldoras de mesa en `OpenTicketsBar.tsx`
- [x] 2.1 Quitar la dependencia de `useOpenTickets`
  - Eliminar el import y el uso de `const { summary } = useOpenTickets()`.
  - Eliminar toda referencia a `summary[tableId].total` e `itemCount` en el render.
  - _Requirements: 2.1, 3.3_
- [x] 2.2 Renderizar la píldora con solo etiqueta + indicador de estado
  - Mostrar la etiqueta de la mesa (texto no vacío) tomada de `tables` (de `useTables`).
  - Derivar el estado desde `table.status` (`available`/`occupied`/`reserved`); estado nulo/desconocido = indicador indeterminado.
  - Mostrar un indicador visual distinguible por estado (Tailwind, paleta Warm Bistro), sin ningún valor monetario.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 1.5_
- [x] 2.3 Accesibilidad del indicador de estado
  - Agregar `aria-label` con el estado en texto (ej. "MESA 2, ocupada") para no depender solo del color.
  - _Requirements: 3.2_

- [x] 3. Estado de carga al abrir una mesa ocupada en `App.tsx`
- [x] 3.1 Agregar estado local de carga y error
  - Crear `tableOrderLoading` y `tableOrderError` con `useState`.
  - _Requirements: 4.2_
- [x] 3.2 Envolver el fetch de la orden en `handleTableSelect` con carga y timeout
  - Al abrir una mesa `occupied` con `current_order_id`, activar `tableOrderLoading` antes del `fetchTableOrder`.
  - Aplicar timeout de 10s con `Promise.race` y desactivar la carga al terminar (éxito o error).
  - _Requirements: 4.1, 4.2, 4.3_
- [x] 3.3 Manejar los casos de la orden cargada
  - Orden con ítems → reconstruir y mostrar el carrito.
  - Orden vacía → carrito vacío con indicación de "sin productos".
  - Mesa `occupied` sin `current_order_id` (fantasma) → omitir fetch y avisar "mesa sin orden válida".
  - Reapertura de una mesa ya cargada en el dispositivo → no volver a hacer fetch.
  - _Requirements: 4.4, 4.6, 4.7_
- [x] 3.4 Manejar error y reintento
  - En error/timeout/offline: ocultar carga, marcar `tableOrderError`, conservar estado `occupied` y la orden sin alterar.
  - Exponer una acción de reintento que repita el fetch.
  - _Requirements: 4.5, 6.4_

- [x] 4. Componente `TableOrderLoadingOverlay`
  - Crear un componente mínimo visible mientras `tableOrderLoading` es true, sobre el área de la orden, bloqueando la edición.
  - En estado de error, mostrar mensaje + botón "Reintentar".
  - Solo Tailwind. Accesible: `role="status"`, `aria-live="polite"`, `aria-label`; botón con `tabIndex={0}`, `aria-label` y `onKeyDown`.
  - Integrarlo en la vista de la orden/carrito en `App.tsx`.
  - _Requirements: 4.2, 4.5_

- [ ] 5. Verificación y no-regresión
- [x] 5.1 Build y revisión de tipos
  - Ejecutar `npm run build` y resolver errores de TypeScript derivados de eliminar `useOpenTickets`.
  - _Requirements: 6.1_
- [ ] 5.2 Pruebas manuales con 2 dispositivos
  - Estado en vivo: ocupar/liberar mesa en A se refleja en B (≤2s) sin recargar.
  - Píldoras: sin `$`, indicadores de estado correctos.
  - Abrir mesa ocupada en B: ver Estado_Carga y luego la orden; probar error+reintento, orden vacía y estado fantasma.
  - Detalle en vivo: con la mesa abierta en B, un cambio desde A se refleja (≤3s); al cerrar la mesa, el canal se cancela.
  - _Requirements: 1.2, 1.3, 4.1, 4.5, 5.1, 5.2, 5.3, 6.2, 6.3, 6.5_
- [ ] 5.3 Medir reducción de consumo en Supabase
  - En Reports → Realtime → Postgres Changes Events, comparar el volumen antes/después al agregar productos en mesas no abiertas.
  - _Requirements: 2.2_

## Notes

- Riesgo principal: la eliminación de `useOpenTickets` puede dejar imports rotos; por eso la tarea 5.1 (build) es obligatoria antes de dar por cerrada la feature.
- Soporte offline: esta feature no agrega flujos de venta nuevos, así que no requiere cambios en la cola de sincronización offline; solo cambia qué se escucha en realtime.
- No hay migraciones de base de datos.
