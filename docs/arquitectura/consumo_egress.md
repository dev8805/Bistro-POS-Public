# Consumo de PostgREST Egress — Referencia

Documento de referencia del egress de la API REST de Supabase en BistroPOS: qué es, dónde se origina, qué se optimizó y qué queda pendiente.

> Relacionado: [`consumo_realtime.md`](./consumo_realtime.md). Spec: `.kiro/specs/optimizar-egress-postgrest/`.

---

## Qué es PostgREST Egress

Es el **tráfico de datos que sale de Supabase hacia el cliente al leer vía la API REST** (cada `supabase.from(...).select(...)`). En el dashboard se llama **"Database Egress"**.

Lo que más pesa: `SELECT *`, joins anidados completos (`embed(*)`), traer muchas filas sin paginar, y repetir la misma consulta seguido.

**Cupo/precio:** Free 5 GB/mes, Pro 250 GB/mes, luego $0.09/GB.

Dónde medir: **Database → Query Performance** (consultas más frecuentes + filas promedio) y **Reports → Database Egress**.

---

## Cómo medirlo en vivo (logs de diagnóstico)

Hay logs con prefijo `🔎[FETCH]` al inicio de cada consulta principal (se dejaron puestos a propósito para seguir optimizando). Filtrar la consola por `[FETCH]`:

| Log | Consulta |
|-----|----------|
| `🔎[FETCH][orders]` | Lista de 100 órdenes completas (`useSales.fetchOrders`) |
| `🔎[FETCH][order-mesa]` | Orden de una mesa (`useSales.fetchTableOrder`) |
| `🔎[FETCH][productos-POS]` | Catálogo del POS (`App.fetchProducts`) |
| `🔎[FETCH][productos-admin]` | Productos (`useProducts.fetchProducts`) |
| `🔎[FETCH][mesas]` | Mesas/salas (`useTables.fetchTables`) |

**Al recargar el POS, debe aparecer:** `[productos-POS]`, `[productos-admin]`, `[mesas]` (si hay mesas).
**NO debe aparecer:** `[orders]` (ni al recargar ni tras cobrar) ni `[order-mesa]` (solo al abrir una mesa).

---

## Focos confirmados (con `pg_stat_statements`)

1. **Órdenes**: `from('orders').select('*, items:order_items(*), waiter, client, refunds...')` `.limit(100)`. Era la consulta más llamada del proyecto (>10k llamadas), disparada en cada carga de la app y tras cada venta, **y su resultado no se mostraba** (la lista visible usa `useSalesHistory` paginado).
2. **Productos**: `from('products').select('*, category:categories(*), ...)`. Muy frecuente (~15k llamadas).

---

## Optimizaciones aplicadas (2026-06-28)

- **Órdenes:** se eliminó el auto-fetch inicial de `useSales` (App solo usa mutaciones), el refetch tras cada venta en `createOrder`, y los `fetchOrders` redundantes de las mutaciones (`SalesScreen` refresca con `reload()` paginado). Resultado: la consulta `orders` con embeds **deja de correr** en el flujo normal.
- **Productos:** `App.fetchProducts` pasó de `products.*` a columnas explícitas; `useProducts` pasó `categories(*)` a solo los campos usados (conservando `products.*` porque las pantallas de admin usan el producto completo).
- **Productos — refetch por venta eliminado (spec `optimizar-fetch-productos`):** `useProducts` ya no re-descarga todo el catálogo ante cada cambio; aplica una **actualización puntual** del producto cambiado (memoria + IndexedDB) y solo hace `fetchProducts` completo en INSERT/DELETE. Además `App.tsx` emite el relay solo para cambios **remotos** (tras el guard `isLocalStockUpdateRef`). Ver [`historial_planes/2026-06-28-optimizacion-fetch-productos.md`](../historial_planes/2026-06-28-optimizacion-fetch-productos.md).

Ver changelog: [`historial_planes/2026-06-28-optimizacion-egress-postgrest.md`](../historial_planes/2026-06-28-optimizacion-egress-postgrest.md).

---

## Optimizaciones aplicadas (2026-06-29) — Caja

Al abrir `CashRegisterScreen` se disparaban varias consultas; estas dos eran las más caras y se redujeron sin tocar el cierre ni el REPORTE DIARIO.

- **Historial de turnos — lista liviana (`fetchShifts` en `useCashRegister`):** antes la lista del historial traía `cash_shifts.*` (~28 columnas) + 3 joins (`register`, `opened_by_profile`, `closed_by_profile`) por hasta 30 turnos, en **cada** apertura de la caja. Ahora pide solo las columnas que la lista muestra (`id, status, opened_by, opened_at, closed_at, total_sales, difference` + `register(name)` + `opened_by_profile(full_name)`). El **detalle** y el **REPORTE DIARIO** traen el turno **completo por id** al abrirlo (`handleOpenShiftDetail`), por lo que `buildShiftReportData` sigue recibiendo todos los campos (`sales_by_method`, `declared_by_method`, totales, `closed_by_profile`…). Resultado: la lista pesa ~4x menos por apertura; el costo nuevo es 1 consulta de 1 fila al abrir un detalle.

- **Anulaciones/devoluciones — efecto estabilizado (`CashRegisterScreen`):** el `useEffect` que trae `orders` (anuladas), `order_items` (anulados) y `sale_refunds` dependía de `shifts`, así que se re-ejecutaba (3 consultas) en cada cambio de ese array: apertura, **cada cierre de turno** y cada sync offline. Ahora la descarga depende solo de `business_id` (corre 1 vez al abrir) y se refresca por el evento `sale-deleted` (anular venta/ítem o devolución, emitido por `SalesScreen` y `useRefunds`). El cruce con cada turno sigue en el `useMemo` `voidsByShift`, intacto.

> Importante: el REPORTE DIARIO se construye desde `selectedShift` + `cash_movements` del turno (consulta aparte), nunca desde la lista `shifts`. Las 4 vías que llenan `selectedShift` (clic en historial → ahora re-fetch completo, deep-link `?shift=`, cierre online, cierre offline) traen el turno completo, así que el reporte no cambió.

---

## Optimizaciones pendientes

### 1. Fetch INICIAL de productos duplicado (unificar) — PENDIENTE
Al **cargar** el POS se ejecutan **dos** consultas de productos distintas, una sola vez por carga:
- `🔎[FETCH][productos-POS]` — `App.fetchProducts` (estado `products` de App para el grid de venta).
- `🔎[FETCH][productos-admin]` — `useProducts.fetchProducts` (montado por `MenuScreen` y pantallas de admin).

> El refetch **recurrente por venta** ya se resolvió (ver "Optimizaciones aplicadas"). Lo que queda es el **doble fetch inicial** al cargar.

Son dos estados/consultas separados que traen casi lo mismo. **Propuesta:** unificar el fetch inicial en una sola fuente (un solo fetch + una sola caché) y que ambos consumidores lean de ahí. Requiere cuidado porque `useProducts` expone datos extra (recetas, producible, unidades de compra) que el grid del POS no usa, y `MenuScreen` necesita `useProducts` para las **categorías**.

### 2. Columnas en `fetchTableOrder` y `fetchOrders` — DIFERIDO
- `fetchTableOrder`: trae 1 orden por llamada (egress mínimo) y su objeto se propaga por el flujo de venta activo → trimear `orders(*)` es alto riesgo/bajo valor. Hacer con verificación dedicada.
- `fetchOrders`: quedó sin llamadores; si se reactiva, acotar columnas.

### 3. Escrituras sin devolver fila — DIFERIDO
La mayoría de inserts/updates sí usan la fila devuelta (`newOrder.id`, `shift.id`, etc.). No hay un subconjunto claro sin riesgo por ahora.

---

## Buenas prácticas (referencia oficial)

De [Manage Egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress#optimize-usage): reducir campos y filas seleccionadas, reducir cantidad de consultas (cachear, evitar refetch), no devolver la fila completa en inserts/updates si no se usa, y revisar Query Performance para encontrar los focos.
