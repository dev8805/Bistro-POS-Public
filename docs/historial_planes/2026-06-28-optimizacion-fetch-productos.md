# Optimización del fetch de productos (refetch por venta) — 2026-06-28

Referencia: [`docs/arquitectura/consumo_egress.md`](../arquitectura/consumo_egress.md).
Spec: [`.kiro/specs/optimizar-fetch-productos/`](../../.kiro/specs/optimizar-fetch-productos/).
Continúa: [`2026-06-28-optimizacion-egress-postgrest.md`](./2026-06-28-optimizacion-egress-postgrest.md).

Elimina el **refetch completo de productos en cada cambio** (especialmente en cada venta), que era el mayor egress de PostgREST que quedaba tras optimizar las órdenes.

---

## Problema

Cuando cambiaba el stock/precio de un producto (p. ej. una venta descuenta stock), el canal `products-sync` de `App.tsx` emitía el relay `products-realtime-changed`, y `useProducts` respondía **re-descargando todo el catálogo** (`fetchProducts`, ~32–93 KB) y recalculando recetas/producible. Ocurría:
- En cada dispositivo con `useProducts` montado, incluido el **POS** (donde su array de productos ni se muestra — el grid usa los de App).
- Incluso en el **propio dispositivo** que originó el cambio (el relay se despachaba antes del guard `isLocalStockUpdateRef`).

App ya resolvía el mismo cambio con una **actualización puntual optimista** (solo el producto afectado, sin descargar nada).

## Cambios aplicados

### `App.tsx`
- El relay `products-realtime-changed` ahora se emite **solo para cambios remotos**: se movió el `dispatchEvent` **después** del guard `isLocalStockUpdateRef`. El dispositivo que vendió no se refresca a sí mismo (ya aplicó el cambio vía `sale-completed`).

### `hooks/useProducts.ts`
- El handler del relay ahora:
  - **UPDATE** → actualización **puntual** del producto cambiado en memoria (stock, precio, nombre, imagen, favorito, nicknames), **sin** `fetchProducts`, y **persiste a IndexedDB** (`saveAdminProducts`) para mantener fresca la caché offline.
  - **INSERT/DELETE** (o evento sin `detail`) → `fetchProducts()` completo (alta/baja, poco frecuente).

### Diferido (permitido por el spec)
- Recompute inmediato del "producible" al cambiar el stock de un insumo: se corrige en la próxima carga completa. Recompute puntual queda como mejora futura.

---

## Resultado

- **Cero refetch de productos por venta.** El catálogo (POS y pantallas de admin) se mantiene sincronizado con updates puntuales (memoria + IDB), sin descargar el catálogo en cada cambio.
- Con los logs `🔎[FETCH]`: al vender ya **no** aparece `🔎[FETCH][productos-admin]`; solo aparece al crear/eliminar un producto.

## Offline
- La actualización puntual **persiste a IndexedDB** (`saveAdminProducts`), así que la caché offline no queda desactualizada ante cambios remotos. No se tocó ningún flujo offline-obligatorio (ventas/caja/abonos/compras/mermas siguen por la cola).

## Verificación
- `npm run build`: exitoso (exit 0). `getDiagnostics` limpio en `App.tsx` y `useProducts.ts`.
- Pendiente de prueba con 2 dispositivos y de medir la caída de la consulta `products` en Query Performance / Database Egress.
