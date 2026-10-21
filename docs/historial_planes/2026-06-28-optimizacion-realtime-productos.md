# Optimización de Realtime en Productos (canal único + gate por permisos) — 2026-06-28

Referencia: [`docs/arquitectura/consumo_realtime.md`](../arquitectura/consumo_realtime.md).
Spec: [`.kiro/specs/optimizar-realtime-productos/`](../../.kiro/specs/optimizar-realtime-productos/).

Reduce el consumo de Supabase Realtime de la tabla `products`. Había **dos** suscripciones a `products` corriendo en paralelo en el mismo dispositivo durante la venta normal (`MenuScreen` monta `useProducts`, y `App.tsx` tiene su propia `products-sync`), así que cada cambio de producto generaba el **doble** de mensajes por dispositivo. Se aplicó la "Opción A": una sola suscripción + relay por evento, más un gate por permisos.

---

## Cambios aplicados

### 1. `hooks/usePermissions.ts` — helper `canViewProducts()`
`canViewProducts()` = `isSuperAdmin || hasPermission('pos_view') || hasPermission('inv_view') || hasPermission('inv_create')`. Centraliza "este usuario necesita datos de productos".

### 2. `hooks/useProducts.ts` — sin canal propio, escucha relay
- Se eliminó la suscripción `public:products`.
- Se agregó un listener del evento de ventana `products-realtime-changed` que refresca con debounce (~200ms).

### 3. `App.tsx` — suscripción única gateada + relay
- El efecto `products-sync` (canal único a `products` + `categories`) ahora hace early-return si el usuario no cumple `canViewProducts` (con `canProducts` en dependencias para re-evaluar al cambiar permisos en vivo).
- En el handler de `products` emite `window.dispatchEvent(new CustomEvent('products-realtime-changed', { detail }))` para alimentar a `useProducts`.
- Se conservaron el guard `isLocalStockUpdateRef`, la actualización optimista y la suscripción a `categories`.

---

## Resultado

- Cada cambio de producto pasa de **2 mensajes a 1 por dispositivo**.
- Dispositivos cuyo usuario no trabaja con productos (solo Dashboard/Empleados/Ajustes) **ya no se suscriben** a `products` → 0 mensajes en esos dispositivos.
- La sincronización de stock/precios entre dispositivos y las pantallas de gestión se conservan (vía relay).

## Verificación
- `npm run build`: exitoso (exit 0). `getDiagnostics` limpio.
- Pendiente de prueba manual con 2 dispositivos y de medición en Reports → Realtime.
