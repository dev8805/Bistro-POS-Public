# Implementation Plan

## Overview

Plan de implementación incremental para mesas offline (modelo Usuario Eje). Cada tarea es un paso de código concreto sobre el diseño aprobado. El orden respeta las dependencias: primero la capa de datos (IDB, cola, mapping), luego la detección del Eje, luego la bifurcación offline de las operaciones, después el cobro y el cierre de turno, y por último UI, sincronización y documentación.

## Task Dependency Graph

```
1 (IDB stores v4) ──┬─> 2 (offlineTableStore) ──┬─> 6 (useTables offline)
                    │                            ├─> 7 (useSales orden offline)
3 (offlineTableMap)─┤                            │
4 (tipos cola)──────┘                            │
5 (useEjeStatus + open_shifts cache)─────────────┼─> 8 (gate escritura / observador)
                                                 │
6,7,5 ──> 9 (SendCommanda offline)               │
6,7,5 ──> 10 (cobro mesa offline en App.tsx)     │
5 ──────> 11 (bloqueo cierre de turno)           │
2,3,4 ──> 12 (sincronizadores + orden syncAll)   │
12 ─────> 13 (extender syncSale + liberar mesa)  │
12 ─────> 14 (señal de recarga)                  │
8,14 ───> 15 (UI: badges, banners, modales)      │
todo ───> 16 (verificación build + manual)       │
16 ─────> 17 (documentación docs/)
```

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "3", "4", "5"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["6", "7"] },
    { "wave": 4, "tasks": ["8", "9", "10", "11", "12"] },
    { "wave": 5, "tasks": ["13", "14"] },
    { "wave": 6, "tasks": ["15"] },
    { "wave": 7, "tasks": ["16"] },
    { "wave": 8, "tasks": ["17"] }
  ]
}
```

## Tasks

- [x] 1. Subir el esquema IndexedDB a la versión 4 con los stores de mesas
  - En `lib/offlineStorage.ts`, cambiar `DB_VERSION` de 3 a 4 y ampliar `upgrade(db, oldVersion)` para crear los stores `tables` (keyPath `id`), `rooms` (keyPath `id`) y `table_orders` (keyPath `table_id`) solo cuando `oldVersion < 4`.
  - Conservar los stores existentes sin borrarlos.
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 2. Crear `lib/offlineTableStore.ts` con las interfaces y funciones de cache
  - Definir `CachedTableOrder` y `CachedOrderItem` según el diseño (incluye `parent_local_id` para modificadores y `pendingSync`).
  - Implementar `saveCachedTables/getCachedTables`, `saveCachedRooms/getCachedRooms`, `saveTableOrder/getTableOrder/deleteTableOrder` y `getAllDirtyTableOrders`, reutilizando el `getDB()` de `lib/offlineStorage.ts`.
  - Guardar un timestamp local del cache de mesas (para la comparación de recarga del Req 17.5).
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 3. Crear `lib/offlineTableMap.ts` (mapeo de IDs temporales)
  - Replicar el patrón de `lib/offlineClientMap.ts` para mesas y salas: `setOfflineTableMapping`, `resolveOfflineTableId`, `isOfflineTableId`, `clearOfflineTableMapping` (prefijo `offline_table_`) y equivalentes para salas (prefijo `offline_room_`), persistidos en `bistro_offline_table_id_map` y `bistro_offline_room_id_map`.
  - _Requirements: 10.1, 10.2_

- [x] 4. Agregar los nuevos tipos de transacción a la cola offline
  - En `lib/offlineQueue.ts`, extender `TransactionType` con `create_room`, `update_room`, `delete_room`, `create_table`, `update_table`, `delete_table`.
  - Documentar en comentarios el formato de payload de cada tipo (según el diseño).
  - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

- [x] 5. Crear `hooks/useEjeStatus.ts` y el cache de turnos abiertos
  - Implementar `bistro_open_shifts_cache` en localStorage: helper que hace un fetch ligero de `cash_shifts` con `status='open'` (`id`, `opened_by`, nombre del perfil) al entrar a Mesas estando online, y lo actualiza; offline lee del cache.
  - Implementar `useEjeStatus()` que exponga `soyEje` (desde `activeShift`), `ejeOnline`, `ejeNombre`, `multiEje`, `ejesNombres`, cruzando `presenceManager.getUsers()` con el cache de turnos abiertos.
  - En `App.tsx`, cambiar el montaje a `usePresenceBroadcast(activeShiftId)` para que el `cash_shift_id` viaje en el payload de presencia.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 15.4_

- [x] 6. Bifurcar `hooks/useTables.ts` a modo offline
  - `fetchTables`/`fetchRooms`: online → Supabase + `saveCachedTables/Rooms`; offline → `getCachedTables/Rooms`. No intentar autocrear "Sala Principal" offline.
  - `createTable`: offline y `soyEje` → asignar `offline_table_*`, persistir en Cache_Mesas_IDB y encolar `create_table` (reemplazar el `temp-${Date.now()}` actual).
  - `updateTable`/`deleteTable`/`createRoom`/`updateRoom`/`deleteRoom`: mismo patrón (IDB + cola). `deleteTable` offline debe impedir borrar una mesa ocupada/con items.
  - Si offline y NO `soyEje`: no-op con retorno controlado para que la UI muestre solo lectura.
  - _Requirements: 1.4, 1.5, 4.1, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3_

- [x] 7. Bifurcar la orden de mesa en `hooks/useSales.ts` a modo offline
  - `fetchTableOrder`: offline → `getTableOrder(tableId)`.
  - `addItemToOrder`/`addItemToOrderById`: offline y `soyEje` → mutar el snapshot en Cache_Orden_Mesa_IDB (merge por producto como online; modificadores como hijos por `parent_local_id`), marcar `pendingSync=true` y `dirty=true`, y marcar la mesa `occupied` en Cache_Mesas_IDB.
  - `removeOrderItem(ById)`/`updateOrderItemQuantity(ById)`: offline → mutar snapshot; si queda vacío, liberar la mesa local.
  - `confirmOrder`: offline → marcar items locales `pending→preparing` en el snapshot.
  - _Requirements: 2.2, 2.3, 2.4, 7.1, 7.2, 7.3, 7.4_

- [x] 8. Aplicar el gate de escritura (Eje) y el modo solo-lectura del observador
  - Usar `useEjeStatus` en `MenuScreen`/`PaymentScreen`/`TablesScreen`/`TableSelectorControl` para: permitir escritura de mesas solo cuando (online) o (`soyEje` y offline); bloquear al observador cuando está offline o cuando `ejeOnline===false`.
  - Al abrir una mesa siendo observador online, hacer la lectura puntual de presencia (Req 15) y una segunda verificación justo antes de confirmar una escritura (mitigación de la ventana de presence).
  - _Requirements: 4.2, 4.3, 4.4, 5.1, 5.4, 15.1, 15.2, 15.3, 15.5, 16.1_

- [x] 9. Adaptar `components/SendCommandaModal.tsx` a offline
  - Offline: mostrar solo la impresora local (QZ); ocultar destinos remotos; si no hay impresora local → mensaje del Req 11.4.
  - `markOrderConfirmed`: rama offline que actualiza Cache_Orden_Mesa_IDB en vez de Supabase.
  - `handleSendRemote`: bloquear offline con el mensaje del Req 11.3.
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 10. Habilitar el cobro de mesa offline en `App.tsx`
  - Reemplazar el guard `const isQuickOrderEarly = !activeTableId && !deliveryMode;` por una condición que incluya mesas cuando `soyEje` y offline (`puedeCobrarOffline`).
  - En el path offline: encolar `sale` con `table_id` (posible `offline_table_*`) y `order_type: 'dine_in'`, llamar `pushOfflineCashMovement`, liberar la mesa local (Cache_Mesas_IDB) y eliminar su `table_orders`, limpiar carrito y mostrar SUCCESS + comprobante de contingencia.
  - Añadir rama offline en `handleTableSelect` (hidratar desde Cache_Orden_Mesa_IDB sin timeout de red) y en `handleConfirmOrder`.
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 11. Bloquear el cierre de turno con mesas pendientes en `hooks/useCashRegister.ts`
  - En `closeShift`, antes de cerrar (online y offline), detectar mesas pendientes: online → consulta de `tables` ocupadas/con orden con items del turno; offline → `getAllDirtyTableOrders()` + Cache_Mesas_IDB.
  - Si hay mesas pendientes, abortar el cierre con el mensaje "Termina de cobrar las mesas pendientes antes de cerrar."
  - _Requirements: 13.1, 13.2, 13.3_

- [x] 12. Agregar sincronizadores de mesas/salas y ordenar `syncAll`
  - En `hooks/useOfflineSync.ts`, implementar `syncCreateRoom/syncUpdateRoom/syncDeleteRoom` y `syncCreateTable/syncUpdateTable/syncDeleteTable`; registrar mapping `offline_* → real` al crear.
  - Ajustar `syncAll` para procesar en orden: `create_room` → `create_table` → `update/delete` de salas/mesas → resto. Resolver `offline_*` antes de escribir; si no resuelve, dejar en cola (no descartar).
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 14.1, 14.5_

- [x] 13. Extender `syncSale` para mesas (resolver ID y liberar mesa)
  - Tras crear la orden + items, si hay `table_id`: resolver `offline_table_*` → real y hacer `UPDATE tables SET status='available', current_order_id=null`.
  - Implementar la detección de conflicto de doble cobro (Req 14.3): si la mesa ya fue cerrada por otro, conservar la venta del Eje (dinero real) con nota "[Posible mesa ya cerrada]" y avisar, sin duplicar caja.
  - _Requirements: 12.5, 14.2, 14.3, 14.4_

- [x] 14. Implementar la señal de recarga tras la sincronización del Eje
  - Al finalizar `syncAll` con ≥1 transacción de mesa/orden y `getPendingCount()===0`: escribir `bistro_last_eje_table_sync_at` y emitir broadcast `eje-sync-completed` en el canal de presencia (o `table-sync-{businessId}`).
  - Suscribir a los observadores a ese evento (solo mientras ven Mesas) y disparar el modal de recarga.
  - Recuperación (Req 17.5): al reconectar/entrar a Mesas, si `bistro_last_eje_table_sync_at` es más nuevo que el timestamp del Cache_Mesas_IDB local, forzar recarga.
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 15. UI: badges, banners, aviso multi-eje y modal de recarga
  - Badge "pendiente de sincronizar" en `CartItemRow` cuando `pendingSync` (Req 7.5).
  - Banner de solo lectura para el observador con el nombre del Eje en `MenuScreen`/`TablesScreen` (Req 5.2, 5.3, 16.2, 16.3), distinguiendo "observador offline" de "eje sin conexión".
  - Aviso multi-eje (`components/MultiEjeNoticeModal.tsx` o toast): al abrir el 2º turno y al caer internet con 2+ turnos (Req 6.1, 6.2, 6.3).
  - `components/ForcedReloadModal.tsx`: modal bloqueante que recarga; nunca se muestra al Eje; preserva el carrito cacheado (Req 17.3, 17.4, 17.6).
  - _Requirements: 5.2, 5.3, 6.1, 6.2, 6.3, 7.5, 16.2, 16.3, 17.3, 17.4, 17.6_

- [x] 16. Verificación: build y pruebas manuales de escenarios
  - Ejecutar `npm run build` y corregir errores de tipos/compilación.
  - Validar manualmente (DevTools offline, multi-dispositivo) los escenarios de la sección Testing Strategy del diseño: Eje offline completo, observador offline, observador online + eje caído, CRUD de mesas/salas offline, multi-eje, cierre de turno bloqueado, señal de recarga.
  - _Requirements: 4.1, 5.1, 6.1, 8.1, 11.1, 12.1, 13.1, 16.1, 17.1_

- [x] 17. Documentar la funcionalidad en `docs/`
  - Actualizar `docs/caracteristicas/modo_offline.md`: nueva sección de mesas offline y modelo Usuario Eje; actualizar la tabla de Limitaciones Conocidas (sección 6) para reflejar que cobrar mesa offline ya está soportado; anotar la ventana de presence como limitación conocida.
  - Actualizar `docs/guias_usuario/como_usar_el_modo_offline.md` con la explicación para el usuario final (quién toma pedidos sin internet, qué ven los demás, aviso de recarga).
  - Revisar y actualizar el documento de mesas en `docs/caracteristicas/` si su comportamiento offline cambió; registrar la mejora futura del multi-eje.
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

## Notes

- **Reutilización obligatoria:** no reinventar la caja offline (`lib/offlineCashCache.ts`), la detección de conectividad (`isOnline` de `useOfflineSync`) ni el patrón de mapping (`lib/offlineClientMap.ts`). Se replican/extienden, no se duplican.
- **Sin migraciones de Supabase:** el esquema actual (`tables`, `rooms`, `orders`, `order_items`, `cash_shifts`) ya cubre el feature. Si durante la implementación surge una necesidad real de columna, detenerse y verificar con MCP antes de migrar.
- **Regla de soporte offline:** el módulo de mesas se suma a los flujos con soporte offline obligatorio; validar que ventas y caja sigan cuadrando tras sincronizar.
- **Idioma:** UI, mensajes y documentación en español.
- **Riesgo residual aceptado:** la ventana de presence (~15-30s) al caer el Eje puede permitir un falso positivo breve en el observador; documentado, no se resuelve en esta entrega.
- **Mejora futura (fuera de alcance):** coordinación técnica del multi-eje (lock o partición de mesas).
- **Verificación:** ejecutar `npm run build` tras las tareas de código; las pruebas de escenarios son manuales (multi-dispositivo + DevTools offline).
