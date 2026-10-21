# Optimización de PostgREST Egress (órdenes + productos) — 2026-06-28

Referencia: [`docs/arquitectura/consumo_egress.md`](../arquitectura/consumo_egress.md).
Spec: [`.kiro/specs/optimizar-egress-postgrest/`](../../.kiro/specs/optimizar-egress-postgrest/).

Reduce el **Database Egress** (datos que salen de Supabase al leer vía la API REST). Con `pg_stat_statements` se confirmó que el egress lo dominaban dos consultas con `SELECT *` + embeds completos, llamadas decenas de miles de veces: la lista de **órdenes** (`fetchOrders`) y la de **productos** (`fetchProducts`).

---

## Cambios aplicados

### 1. Órdenes — eliminar lecturas innecesarias (el mayor ahorro)
Hallazgo: `App.tsx` monta `useOrders()` solo para mutaciones (`createOrder`/`confirmOrder`), pero `useSales` auto-traía **100 órdenes completas** al montar, y ese array `orders` **no lo renderiza nadie** (la lista visible de `SalesScreen` usa `useSalesHistory` paginado).

- `hooks/useSales.ts`: eliminado el `useEffect` de carga inicial (`loading` arranca en `false`); eliminado el `fetchOrders()` de segundo plano en `createOrder`; eliminados los `await fetchOrders()` redundantes de las mutaciones (`deleteOrder`, `voidOrder`, `voidOrderItem`, `deleteOrderItem`, `updateOrderItem`).
- `screens/SalesScreen.tsx`: el `onDone` de devolución usa solo `reload()` (paginado), no `fetchOrders()`; se quitó `fetchOrders` del destructuring.

Resultado: la consulta `orders` con embeds **deja de ejecutarse** al cargar la app y tras cada venta/anulación.

### 2. Productos — columnas explícitas
- `App.tsx` (`fetchProducts`, catálogo del POS): `products.*` → lista explícita de columnas usadas.
- `hooks/useProducts.ts` (`fetchProducts`): `category:categories(*)` → solo los campos usados; se conserva `products.*` porque las pantallas de admin usan el producto completo.

### 3. Logs de diagnóstico (se DEJAN puestos)
Se agregaron logs `🔎[FETCH]` al inicio de cada consulta principal (orders, order-mesa, productos-POS, productos-admin, mesas) **y se dejan en el código** para seguir midiendo y optimizando. Detalle de qué debe/ no debe aparecer al recargar en [`consumo_egress.md`](../arquitectura/consumo_egress.md#cómo-medirlo-en-vivo-logs-de-diagnóstico).

---

## Diferido / pendiente

- **Doble fetch de productos:** al cargar el POS corren `App.fetchProducts` **y** `useProducts.fetchProducts` (dos consultas/estados separados). Unificar en una sola fuente queda **pendiente** (ver `consumo_egress.md` → Optimizaciones pendientes).
- Columnas de `fetchTableOrder` (1 orden/llamada, riesgo en flujo de venta) y de `fetchOrders` (sin llamadores): diferidas.
- Quitar `.select()` en escrituras: la mayoría usan la fila devuelta; sin subconjunto claro por ahora.

---

## Verificación
- `npm run build`: exitoso (exit 0). `getDiagnostics` limpio en `useSales`, `useProducts`, `useTables`, `App`, `SalesScreen`.
- Pendiente de prueba funcional (historial de ventas, venta, mesas, catálogo, offline) y de medir Database Egress / Query Performance antes vs después.
