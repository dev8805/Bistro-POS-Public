# Design Document

## Overview

Este diseño habilita la operación **offline del módulo de Mesas** de Bistro POS mediante el modelo **"Usuario Eje" (single-writer offline)**: cuando no hay internet, solo el dispositivo de un usuario con turno de caja abierto (el Eje) puede escribir en las mesas; los demás quedan en solo lectura. Al evitar la escritura concurrente por diseño, se elimina la necesidad de resolución de conflictos compleja (CRDT, version vectors).

El diseño **reutiliza al máximo la infraestructura offline existente**:
- Cola de transacciones en IndexedDB (`lib/offlineQueue.ts` + `lib/offlineStorage.ts`).
- Caja optimista (`lib/offlineCashCache.ts`, sin cambios).
- Detección de conectividad `isOnline` (`hooks/useOfflineSync.ts`).
- Canal de presencia singleton ya montado para todos los usuarios (`lib/presenceManager.ts`), del que se **lee** el estado del Eje sin costo adicional de Realtime.
- Patrón de mapeo de IDs temporales de `lib/offlineClientMap.ts`.

**No se requieren migraciones de esquema en Supabase**: las tablas `tables`, `rooms`, `orders`, `order_items` y `cash_shifts` ya contienen todas las columnas necesarias (verificado por MCP).

### Decisión de diseño central: snapshot de orden en lugar de event-sourcing granular

Como el modelo es **single-writer** (solo el Eje escribe offline), NO se necesita event-sourcing granular por item (encolar cada "agregar item", "quitar item"). En su lugar:

- La orden de cada mesa se mantiene como **estado local completo** en `Cache_Orden_Mesa_IDB` (IndexedDB).
- Agregar/quitar items y modificadores offline **solo muta ese estado local** (no encola nada por item).
- Al **cobrar** la mesa offline se encola **una sola transacción `sale`** con todos los items + `table_id` (idéntico al flujo de Orden Rápida que ya funciona).
- Los CRUD de mesas y salas sí se encolan por separado (son cambios de datos maestros, no de la orden).

**Justificación:** reduce drásticamente la complejidad de sincronización (no hay que resolver `order_item_id` temporales, ni reconstruir secuencias de eventos, ni manejar merges parciales). La orden se materializa en Supabase recién al cobrar, exactamente como la venta rápida offline. El riesgo de conflicto es nulo porque nadie más escribió esa mesa mientras el Eje estuvo offline (garantía del modelo).

## Architecture

### Componentes y responsabilidades

```
┌───────────────────────────────────────────────────────────────────────┐
│                             App.tsx                                    │
│  handleTableSelect ─ handleAddToOrder ─ handleConfirmOrder ─           │
│  handleProcessPayment (quitar guard mesas) ─ montaje usePresenceBroadcast│
└───────────┬───────────────────────────────────────────────┬───────────┘
            │                                                 │
    ┌───────▼─────────┐   ┌──────────────────┐   ┌───────────▼──────────┐
    │  useEjeStatus    │   │  useTables        │   │  useSales            │
    │ (NUEVO)          │   │ (bifurcar offline)│   │ (bifurcar offline)   │
    │ soyEje/ejeOnline │   │ CRUD → IDB+cola   │   │ orden → Cache IDB    │
    │ ejeNombre        │   └────────┬──────────┘   └──────────┬───────────┘
    └───────┬──────────┘            │                         │
            │              ┌────────▼─────────────────────────▼────────┐
            │              │   lib/offlineTableStore.ts (NUEVO)         │
            │              │   Cache_Mesas_IDB · Cache_Orden_Mesa_IDB   │
            │              └────────────────────┬───────────────────────┘
            │                                    │
    ┌───────▼──────────┐              ┌──────────▼───────────┐
    │ lib/presenceManager│             │ lib/offlineQueue.ts  │
    │ getUsers() (lectura)│            │ + tipos mesas/salas  │
    └────────────────────┘            └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐
                                       │ hooks/useOfflineSync  │
                                       │ syncSale (extendido)  │
                                       │ syncCreate/Update/Del │
                                       │ Table/Room + señal    │
                                       │ de recarga            │
                                       └───────────────────────┘
```

### Flujo 1 — Eje operando offline

```
Eje (turno abierto) pierde internet
   │
   ├─ Abre Mesa 5
   │    └─ useSales.fetchTableOrder → offline → lee Cache_Orden_Mesa_IDB
   │         └─ hidrata el carrito
   │
   ├─ Agrega producto + modificadores
   │    └─ useSales.addItemToOrder → offline → muta Cache_Orden_Mesa_IDB
   │         └─ marca mesa 'occupied' en Cache_Mesas_IDB (badge "pendiente")
   │
   ├─ Envía comanda
   │    └─ SendCommandaModal → offline → printKitchenCommandDirect (QZ local)
   │         └─ markOrderConfirmed → actúa sobre Cache_Orden_Mesa_IDB (items→'preparing')
   │         └─ envío remoto BLOQUEADO
   │
   └─ Cobra la mesa
        └─ App.handleProcessPayment → path offline (guard mesas removido)
             ├─ offlineQueue.add('sale', {items, table_id, ...})
             ├─ pushOfflineCashMovement (caja optimista)
             ├─ libera mesa local (Cache_Mesas_IDB: available, sin orden)
             └─ pantalla SUCCESS + comprobante de contingencia
```

### Flujo 2 — Observador (no-eje) offline o con eje caído

```
Observador abre una mesa
   │
   ├─ ¿Estoy online?
   │     NO → congelado (solo lectura) ── Req 5
   │     SÍ → lee presenceManager.getUsers()
   │            └─ cruza con Lista_Turnos_Abiertos_Cache
   │                 ├─ Eje presente  → opera normal (según permisos)
   │                 └─ Eje ausente   → congelado (solo lectura) ── Req 16
   │                       banner: "[Nombre] (cajero del turno) está sin
   │                       conexión. Las mesas están en solo lectura…"
```

### Flujo 3 — Sincronización + señal de recarga

```
Eje recupera internet
   │
   └─ useOfflineSync.syncAll()
        ├─ 1º procesa create_room / create_table (resuelve IDs offline)
        ├─ 2º procesa update/delete de mesas/salas
        ├─ 3º procesa sale (mesa): crea orden+items, resuelve table_id offline,
        │       libera mesa en Supabase (status='available', current_order_id=null)
        └─ cuando getPendingCount() === 0:
             ├─ escribe bistro_last_eje_table_sync_at
             └─ emite broadcast 'eje-sync-completed' en canal presence
                   │
                   ▼
        Observadores conectados (viendo Mesas)
             └─ ForcedReloadModal (bloqueante) → location.reload()
        El Eje NUNCA ve el modal.
```

## Components and Interfaces

### 1. `lib/offlineTableStore.ts` (NUEVO)

Persistencia IndexedDB de mesas, salas y órdenes de mesa. Reutiliza el `getDB()` de `lib/offlineStorage.ts` tras subir `DB_VERSION` a 4.

```typescript
// Cambios en lib/offlineStorage.ts: DB_VERSION 3 → 4
// upgrade(db, oldVersion): if (oldVersion < 4) { crear stores }
//   db.createObjectStore('tables',       { keyPath: 'id' });
//   db.createObjectStore('rooms',        { keyPath: 'id' });
//   db.createObjectStore('table_orders', { keyPath: 'table_id' });

export interface CachedTableOrder {
  table_id: string;            // clave (uuid real o offline_table_*)
  order_id: string;            // uuid real o offline_order_local (solo referencia local)
  items: CachedOrderItem[];    // incluye modificadores como líneas hijas
  updated_at: string;
  dirty: boolean;              // true = tiene cambios no cobrados/no sincronizados
}

export interface CachedOrderItem {
  local_id: string;            // id local estable para la UI
  product_id: string | null;
  promotion_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
  cooking_term?: string;
  removed_ingredients?: string[];
  status: 'pending' | 'preparing' | 'ready' | 'served';
  parent_local_id?: string;    // modificador → item padre (por local_id)
  pendingSync: boolean;        // badge "pendiente de sincronizar"
}

// Funciones: saveCachedTables/getCachedTables, saveCachedRooms/getCachedRooms,
// saveTableOrder/getTableOrder/deleteTableOrder/getAllDirtyTableOrders
```

### 2. `lib/offlineTableMap.ts` (NUEVO)

Réplica de `offlineClientMap.ts` para mesas y salas. Un solo archivo con dos mapas (o mapa unificado por prefijo).

```typescript
// localStorage: bistro_offline_table_id_map, bistro_offline_room_id_map
export const setOfflineTableMapping   = (offlineId: string, realId: string) => {...}
export const resolveOfflineTableId    = (id?: string|null): string|null => {...} // offline_table_* → real
export const isOfflineTableId         = (id?: string|null): boolean => {...}
export const setOfflineRoomMapping    = (offlineId: string, realId: string) => {...}
export const resolveOfflineRoomId     = (id?: string|null): string|null => {...}
export const isOfflineRoomId          = (id?: string|null): boolean => {...}
// prefijos: offline_table_, offline_room_
```

> Las órdenes de mesa NO necesitan mapping de `order_id`: con el enfoque snapshot, la orden se **crea nueva** en Supabase al sincronizar el `sale`. El `order_id` local es solo referencia interna del cache.

### 3. `lib/offlineQueue.ts` — nuevos `TransactionType`

```typescript
export type TransactionType =
  | 'sale' | 'delete_sale' | 'open_shift' | 'close_shift'
  | 'create_client' | 'client_payment' | 'supplier_payment'
  | 'inventory_purchase' | 'expense' | 'shrinkage'
  | 'manual_cash_in' | 'manual_cash_out'
  // NUEVOS (datos maestros de mesas):
  | 'create_room' | 'update_room' | 'delete_room'
  | 'create_table' | 'update_table' | 'delete_table';
```

Payloads:
```typescript
// create_table: { offlineId: 'offline_table_...', label, roomId?, seats }
// update_table: { tableId: uuid|offline_table_*, updates: { label?, room_id?, seats? } }
// delete_table: { tableId: uuid|offline_table_* }
// create_room:  { offlineId: 'offline_room_...', name, description?, display_order }
// update_room:  { roomId, updates }
// delete_room:  { roomId }
// sale (mesa): igual que orden rápida + table_id (que puede ser offline_table_*)
```

### 4. `hooks/useEjeStatus.ts` (NUEVO)

Determina el rol offline del usuario actual y el estado del Eje. No crea suscripciones nuevas: lee de `presenceManager`, del `activeShift` local y de la lista cacheada de turnos abiertos.

```typescript
interface EjeStatus {
  soyEje: boolean;        // tengo turno abierto (activeShift !== null)
  ejeOnline: boolean;     // hay al menos un Eje presente en el canal de presencia
  ejeNombre: string | null;   // nombre del Eje (para banners del observador)
  multiEje: boolean;      // 2+ turnos abiertos
  ejesNombres: string[];  // nombres de todos los ejes (aviso multi-eje)
}
export const useEjeStatus = (): EjeStatus => {...}
```

Fuentes:
- `soyEje`: `useCashRegister().activeShift !== null` (ya cacheado en `bistro_active_shift_<businessId>`).
- Lista de turnos abiertos: nuevo `Lista_Turnos_Abiertos_Cache` en localStorage `bistro_open_shifts_cache` (`[{ userId, userName }]`), refrescado al entrar a Mesas mediante un fetch ligero de `cash_shifts` (status='open') y por Realtime cuando esté online.
- `ejeOnline` / `ejeNombre`: cruce de `presenceManager.getUsers()` (userIds presentes) con la lista de turnos abiertos.

### 5. `hooks/usePresenceBroadcast.ts` — pasar el shift activo

Cambio en `App.tsx`: `usePresenceBroadcast(activeShiftId)` en lugar de `usePresenceBroadcast()`, para que el `cash_shift_id` viaje en el payload de presencia y el Eje sea identificable directamente. (Alternativa de respaldo: cruce con la lista cacheada de turnos.)

### 6. `hooks/useTables.ts` — bifurcación offline

- `fetchTables`/`fetchRooms`: si `isOnline` → Supabase + `saveCachedTables/Rooms`; si offline → `getCachedTables/Rooms`.
- `createTable`: si offline y `soyEje` → `offline_table_*`, guardar en Cache_Mesas_IDB, encolar `create_table`. (Hoy usa `temp-${Date.now()}` optimista; se cambia a `offline_table_*` persistente.)
- `updateTable`/`deleteTable`/`createRoom`/`updateRoom`/`deleteRoom`: mismo patrón (IDB + cola).
- Guard: si offline y NO `soyEje` → no-op + toast "solo lectura".
- La autocreación de "Sala Principal" (`fetchRooms`) NO debe intentarse offline (evitar insert fallido).

### 7. `hooks/useSales.ts` — bifurcación offline de la orden

Cuando `isOnline===false` y `soyEje===true`, estas funciones operan sobre `Cache_Orden_Mesa_IDB` en vez de Supabase:
- `fetchTableOrder(tableId)` → `getTableOrder(tableId)`.
- `addItemToOrder` / `addItemToOrderById` → mutan el snapshot local (merge por producto igual que online; modificadores como hijos por `parent_local_id`); marcan `pendingSync=true`.
- `removeOrderItem(ById)` / `updateOrderItemQuantity(ById)` → mutan snapshot local; si queda vacío, liberan la mesa local.
- `confirmOrder` → marca items locales `pending→preparing` en el snapshot (sin tocar Supabase).

Si offline y NO `soyEje` → lanzar/return controlado que la UI traduce a "solo lectura".

### 8. `App.tsx` — cambios de orquestación

- **`handleProcessPayment`** (~2261): el guard actual `const isQuickOrderEarly = !activeTableId && !deliveryMode;` se reemplaza por una condición que **incluye mesas cuando el usuario es Eje offline**:
  ```
  const puedeCobrarOffline = !isOnline && soyEje && !deliveryMode;
  // (orden rápida: !activeTableId; mesa: activeTableId presente)
  ```
  El payload `sale` incluye `table_id` (posible `offline_table_*`), `order_type: 'dine_in'`. Tras encolar: `pushOfflineCashMovement`, liberar mesa local, limpiar carrito, SUCCESS. El delivery sigue sin soporte offline (fuera de alcance).
- **`handleTableSelect`** (~1248): agregar rama offline que hidrata desde `Cache_Orden_Mesa_IDB` sin el timeout de red.
- **`handleConfirmOrder`** (~1021): rama offline que delega en el `confirmOrder` local.
- Montaje de `usePresenceBroadcast(activeShiftId)`.

### 9. `components/SendCommandaModal.tsx` — offline

- Offline: ocultar destinos remotos (`useAvailablePrinters` estará vacío); solo `handleSendLocal` (QZ). Si no hay impresora local → mensaje.
- `markOrderConfirmed`: rama offline que actualiza `Cache_Orden_Mesa_IDB` en vez de Supabase.
- `handleSendRemote`: bloqueado offline con mensaje "El envío a dispositivos remotos requiere conexión".

### 10. `hooks/useCashRegister.ts` — bloqueo de cierre con mesas pendientes

`closeShift` (online y offline) valida ANTES de cerrar:
- **Online:** consulta `tables` del negocio con `status='occupied'` (o `current_order_id` no nulo) ligadas a órdenes con items del turno. Si existen → abortar con mensaje "Termina de cobrar las mesas pendientes antes de cerrar."
- **Offline:** revisar `Cache_Mesas_IDB` + `getAllDirtyTableOrders()` (órdenes con `dirty=true`). Si hay → mismo mensaje.

### 11. `hooks/useOfflineSync.ts` — sincronizadores y señal de recarga

- **Orden de `syncAll`:** procesar `create_room` → `create_table` → `update/delete room/table` → resto (incluye `sale` de mesa). Análogo a cómo hoy `create_client` va primero.
- **`syncCreateTable/Room`:** insertan en Supabase, registran mapping `offline_* → real` (`offlineTableMap`), retiran de cola.
- **`syncUpdateTable/Room`, `syncDeleteTable/Room`:** resuelven `offline_*` a real antes de escribir; si aún no resuelve, dejan en cola para el próximo ciclo (Req 10.4).
- **`syncSale` (extendido):** tras crear orden+items, si `orderData.table_id`:
  - resolver `offline_table_*` → real vía `resolveOfflineTableId`;
  - `UPDATE tables SET status='available', current_order_id=null WHERE id=<realTableId>`.
  - **Detección de conflicto (Req 14.3):** antes de liberar, si la mesa en Supabase ya está `available` y su `current_order_id` es null y ya existe una orden completed reciente para esa mesa que no es la nuestra → registrar/notificar posible doble cobro (no duplicar caja; la venta se conserva como registro pero se avisa). Diseño conservador: se inserta la venta (es dinero real cobrado por el Eje) pero se marca en `notes` "[Posible mesa ya cerrada]" y se emite un aviso al Eje.
- **Señal de recarga:** al terminar `syncAll`, si se sincronizó ≥1 transacción de mesa/orden y `getPendingCount()===0`:
  - `localStorage.setItem('bistro_last_eje_table_sync_at', ISO)`;
  - `channel.send({ type:'broadcast', event:'eje-sync-completed' })` en el canal `presence:business-{id}` (reutilizado) o canal dedicado `table-sync-{businessId}`.

### 12. UI nueva

- **Badge "pendiente de sincronizar"** en `CartItemRow` cuando `pendingSync` (ícono `cloud_off` / punto ámbar).
- **Banner de solo lectura** (observador) en `MenuScreen`/`TablesScreen`: mensaje con nombre del Eje (Req 5.3, 16.2/16.3).
- **Aviso multi-eje** (`components/MultiEjeNoticeModal.tsx` o toast): al abrir 2º turno y al caer internet con 2+ turnos (Req 6).
- **`components/ForcedReloadModal.tsx` (NUEVO):** modal bloqueante que se muestra al recibir `eje-sync-completed` (solo observadores). Botón "Recargar" → `location.reload()`. También se dispara si al reconectar `bistro_last_eje_table_sync_at` > timestamp del `Cache_Mesas_IDB` local (Req 17.5).

## Data Models

### Nuevos stores IndexedDB (DB `bistro-offline` v4)
| Store | keyPath | Contenido |
|-------|---------|-----------|
| `tables` | `id` | Mesas cacheadas (incluye `offline_table_*`) |
| `rooms` | `id` | Salas cacheadas (incluye `offline_room_*`) |
| `table_orders` | `table_id` | Snapshot de la orden por mesa (`CachedTableOrder`) |

### localStorage nuevos
| Clave | Contenido |
|-------|-----------|
| `bistro_offline_table_id_map` | `{ offline_table_*: uuidReal }` |
| `bistro_offline_room_id_map` | `{ offline_room_*: uuidReal }` |
| `bistro_open_shifts_cache` | `[{ userId, userName }]` turnos abiertos |
| `bistro_last_eje_table_sync_at` | ISO de la última sync de mesas del Eje |

### Reutilizados sin cambios
- `bistro_active_shift_<businessId>`, `bistro_active_movements_<businessId>` (caja), cola `offline_transactions`.

## Error Handling

### Casos borde

1. **Ventana de presence (~15-30s):** al perder red el Eje, la presencia tarda en retirarse. Un observador podría verlo "presente" brevemente y editar. Riesgo residual aceptado (documentado). Mitigación menor: el observador re-verifica presence justo antes de confirmar una escritura (segunda lectura), no solo al abrir.
2. **Observador que se perdió la señal de recarga:** al reconectar/entrar a Mesas, comparar `bistro_last_eje_table_sync_at` con la marca del `Cache_Mesas_IDB`; si es más nueva → forzar recarga (Req 17.5).
3. **Mesa huérfana / doble cobro:** ver detección de conflicto en `syncSale`. No se duplica caja; la venta del Eje se conserva (es dinero real) con aviso.
4. **Multi-eje:** sin lock técnico; solo aviso (Req 6). **Mejora futura declarada** (ver abajo).
5. **ID temporal no resuelto en sync:** la transacción dependiente permanece en cola para el siguiente ciclo (Req 10.4), no se descarta.
6. **App arranca offline sin cache previa:** mensaje "no hay datos de mesas disponibles sin conexión" (Req 1.4).
7. **Cierre de turno bloqueado:** online y offline (Req 13).

## Correctness Properties

Propiedades que deben cumplirse siempre (invariantes del modelo single-writer):

### Property 1: Escritor único offline
En ausencia de conexión, a lo sumo un dispositivo (el Eje) modifica una mesa dada. Los observadores no producen escrituras sobre mesas/órdenes offline.
**Validates: Requirements 4.4, 16.1**

### Property 2: No duplicación de cobro
Una orden de mesa cobrada offline se materializa exactamente una vez en Supabase; si al sincronizar la mesa ya fue cerrada por otro, no se duplica el movimiento de caja.
**Validates: Requirements 14.3**

### Property 3: Consistencia de la caja
Todo cobro offline reflejado en `Caja_Optimista` genera, al sincronizar, exactamente un conjunto de `cash_movements` equivalente.
**Validates: Requirements 12.2**

### Property 4: Resolución total de IDs
Ninguna transacción sincronizada persiste un `offline_table_*` u `offline_room_*` sin resolver; si no se puede resolver, permanece en cola.
**Validates: Requirements 10.2, 10.4**

### Property 5: Liberación de mesa
Tras sincronizar el cobro, la mesa queda `available` con `current_order_id = null` en Supabase.
**Validates: Requirements 12.5**

### Property 6: Orden de dependencias
Las creaciones (`create_room`, `create_table`) se sincronizan antes que las transacciones que las referencian.
**Validates: Requirements 10.3**

### Property 7: Idempotencia de recarga
El aviso de recarga solo se emite con `getPendingCount() === 0`; nunca se muestra al Eje.
**Validates: Requirements 17.2, 17.4**

### Property 8: Turno sin mesas huérfanas
No se permite cerrar un turno con mesas pendientes, en línea o sin conexión.
**Validates: Requirements 13.1, 13.2**

## Testing Strategy

Escenarios manuales (multi-dispositivo, con DevTools → offline):
1. Eje offline: abrir mesa cacheada, agregar productos + modificadores, enviar comanda (QZ local), cobrar → SUCCESS; al reconectar, verificar orden creada, mesa liberada, caja cuadrada.
2. Observador offline: mesa en solo lectura, sin controles.
3. Observador online + Eje offline: congelado con banner y nombre del Eje.
4. Crear/editar/eliminar mesa y sala offline (Eje) → sincroniza sin duplicar.
5. Multi-eje: abrir 2º turno → aviso; caer internet con 2 turnos → recordatorio.
6. Cierre de turno con mesa pendiente (online y offline) → bloqueado.
7. Señal de recarga: Eje sincroniza → observador conectado recibe modal; Eje no lo ve; observador que estuvo desconectado fuerza recarga al volver.
8. `npm run build` sin errores.

## Documentación a actualizar en `docs/` (Req 18)

1. **`docs/caracteristicas/modo_offline.md`:** nueva sección "Mesas offline (modelo Usuario Eje)" describiendo detección del Eje vía presencia, congelamiento del observador, snapshot de orden en IDB, cobro offline y señal de recarga. Actualizar la **tabla de Limitaciones Conocidas (sección 6)**: cobrar mesa offline ya está soportado (para el Eje). Anotar la ventana de presence como limitación conocida.
2. **`docs/guias_usuario/como_usar_el_modo_offline.md`:** explicar en lenguaje de usuario final quién puede tomar pedidos de mesas sin internet (el cajero con turno abierto), qué ven los demás, y el aviso de recarga.
3. **Revisar `docs/caracteristicas/`** el archivo de mesas (si existe `mesas.md` o equivalente en el índice de `product.md`) y actualizar su comportamiento offline.
4. Registrar en la documentación la **mejora futura**: coordinación técnica del multi-eje.

## Decisiones de diseño (resumen justificado)

| Decisión | Alternativa descartada | Motivo |
|----------|------------------------|--------|
| Snapshot de orden en IDB + un solo `sale` al cobrar | Event-sourcing granular por item | Single-writer elimina conflictos; snapshot es mucho más simple de sincronizar y reutiliza el flujo de venta rápida ya probado |
| Leer presence existente al abrir mesa | Nuevo canal/heartbeat dedicado | El canal `presence:business-{id}` ya está siempre activo; leerlo es costo cero de Realtime |
| Reutilizar `pushOfflineCashMovement` | Nueva lógica de caja para mesas | La caja ya funciona offline; el cobro de mesa es una venta más |
| Señal de recarga por broadcast tras `pendingCount===0` | Recarga inmediata al reconectar | Garantiza que el observador solo recarga cuando el Eje ya subió todo |
| Sin migraciones de esquema | Nuevas columnas de versión/lock | El esquema actual basta; el lock multi-eje se pospone |

## Mejora futura declarada (fuera de alcance)

**Coordinación técnica del multi-eje:** cuando hay 2+ turnos abiertos simultáneos, esta entrega solo muestra un aviso operacional (coordinación manual). Un lock o partición de mesas entre ejes (p. ej. asignar rangos de mesas por cajero, o un lease de mesa en Supabase) queda como mejora futura y debe retomarse si el uso multi-cajero offline se vuelve frecuente.
