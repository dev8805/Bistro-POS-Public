# Implementation Plan

## Overview

Eliminar el refetch completo de productos en cada cambio: `useProducts` reacciona al relay con actualización puntual optimista (como App), y App no emite el relay hacia el propio dispositivo emisor. Toca `App.tsx` y `hooks/useProducts.ts`. Sin migraciones. El dedup del fetch inicial queda fuera de alcance (pendiente documentado).

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] }
  ]
}
```

```
1 (App: relay solo a remotos)
2 (useProducts: update puntual)   → independientes (archivos distintos)
        └─> 3 (verificación)
```

## Tasks

- [x] 1. `App.tsx`: emitir el relay solo para cambios remotos
  - Mover el `window.dispatchEvent('products-realtime-changed', ...)` para que se ejecute **después** del guard `isLocalStockUpdateRef` (no emitir cuando el cambio es propio del dispositivo).
  - Conservar el update optimista de App en UPDATE y el `fetchProducts` en INSERT/DELETE.
  - _Requirements: 2.1, 2.2_

- [ ] 2. `hooks/useProducts.ts`: reaccionar puntual al relay
- [x] 2.1 Update puntual en UPDATE
  - Leer `detail: { eventType, new }` del evento. En `UPDATE`, actualizar en memoria solo el producto con `new.id` (stock, price, name, image desde image_url, is_favorite, nicknames), sin `fetchProducts`.
  - _Requirements: 1.1, 1.3, 3.1_
- [x] 2.2 Refetch solo en INSERT/DELETE o evento sin detalle
  - Mantener el `fetchProducts()` (debounced) únicamente para INSERT/DELETE o cuando el evento no traiga `detail`.
  - _Requirements: 1.2, 3.2_
- [ ] 2.3 Producible ante cambio de insumo
  - DIFERIDO (permitido por Req 4): el update puntual no recomputa producible; se corrige en la próxima carga completa. Recompute puntual queda como mejora futura.
  - _Requirements: 4.1, 4.2_
- [x] 2.4 Persistir la actualización puntual en IndexedDB
  - Tras la Actualizacion_Puntual, guardar el catálogo en IDB (`saveAdminProducts`) para mantener fresca la caché offline ante cambios remotos.
  - _Requirements: 6.1, 6.2_

- [ ] 3. Verificación y no-regresión
- [x] 3.1 Build
  - `npm run build` sin errores.
  - _Requirements: 5.4_
- [ ] 3.2 Pruebas con logs `🔎[FETCH]` y 2 dispositivos
  - Vender en el POS → en el mismo dispositivo NO aparece `[productos-admin]`; el stock del grid baja igual.
  - B con `ProductsScreen` abierta; A vende/edita → B se actualiza sin `[productos-admin]` (update puntual).
  - Crear/eliminar producto en A → en B sí aparece `[productos-admin]` (refetch correcto).
  - Producible correcto tras cambio de stock de insumo; catálogo/categorías/offline OK.
  - Caché offline: tras un cambio remoto, recargar offline muestra el stock actualizado (se persistió a IDB).
  - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 5.1, 5.2, 5.3, 6.1_
- [ ] 3.3 Medir egress
  - Database → Query Performance / Database Egress: la consulta `products` debe caer fuerte en frecuencia (ya no corre por cada venta).
  - _Requirements: 1.1_

## Notes

- Riesgo: omitir un campo en el update puntual → un dato del producto quedaría desactualizado hasta recargar. Se cubre en 3.2.
- El fetch inicial duplicado (App + useProducts al cargar) NO se aborda aquí; queda como pendiente en `docs/arquitectura/consumo_egress.md`.
- No hay migraciones ni cambios de esquema.
