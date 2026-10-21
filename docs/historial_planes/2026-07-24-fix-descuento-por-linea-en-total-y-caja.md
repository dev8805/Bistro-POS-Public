# Fix — Descuento por línea no se reflejaba en `orders.total` ni en el reporte de turno

Fecha: 2026-07-24
Ámbito: código de la app (frontend). **No** se tocó nada en Supabase (ni migraciones, ni RPCs, ni triggers).

## Síntoma

En el reporte de cierre de turno (impreso, PDF y detalle en `CashRegisterScreen`), las ventas con **descuento por línea** aparecían con el subtotal bruto en vez del neto. Ejemplo real (negocio 10001, turno 68, venta #1951 Ensalada Personal $24 500 con Dcto 10 %):

- Tirilla al cliente: $22 050 (correcto, la UI lo recalculaba al vuelo desde `discount_percent`).
- Reporte de turno: $24 500 (inflado, no reflejaba los $2 450 de descuento).

## Causa raíz

`hooks/useSales.createOrder` y `hooks/useOfflineSync.syncSale` calculaban el descuento de la orden como:

```
subtotal = sum(unit_price × qty)
discount = orderData.discount           ← SOLO el descuento GLOBAL de PaymentScreen
total    = subtotal − discount
```

Los descuentos por línea (`item.discount` / `item.discount_percent`) **no entraban** en el cálculo. Como consecuencia, en ventas con descuento por ítem:

- `orders.discount = 0`
- `orders.total = subtotal` (bruto)
- `cash_movements.amount = orders.total` (inflado)
- Al cerrar el turno, la RPC `close_cash_shift` sumaba `SUM(orders.total)` → `total_sales`, `sales_by_method` y `total_cash_sales` quedaban inflados.
- El arqueo, la tirilla del turno, el dashboard, `ai-chat` y las deudas a crédito reflejaban el monto bruto en lugar del neto.

La UI de "Historial de ventas" (`SalesScreen`) y la de recibo público sí se veían bien porque **recalculaban el neto sobre la marcha** desde `discount_percent`, ocultando el problema en pantalla.

## Solución

Sumar los descuentos por línea al `discount` de la orden antes de calcular `total`. Aplicado en los dos puntos donde se persiste una venta nueva:

- `hooks/useSales.ts` → `createOrder`
- `hooks/useOfflineSync.ts` → `syncSale`

```ts
const subtotal = sum(unit_price × qty);

const perItemDiscountTotal = items.reduce((sum, item) => {
    const line = item.discount
        || (item.discount_percent
            ? item.unit_price * item.quantity * item.discount_percent / 100
            : 0);
    return sum + (line || 0);
}, 0);

let orderLevelDiscount = 0;
if (orderData.discount > 0) {
    orderLevelDiscount = orderData.discount_type === 'percentage'
        ? subtotal * (orderData.discount / 100)
        : orderData.discount;
}

const discount = perItemDiscountTotal + orderLevelDiscount;
const total    = round(max(0, subtotal − discount) / 50) * 50;
```

Adicionalmente, en `useOfflineSync.syncSale` se agregó la persistencia de `discount` y `discount_percent` en el insert de `order_items` (antes se perdían al sincronizar una venta offline con descuento por línea).

## Trampa que descubrimos en el camino (importante para futuros cambios)

En un intento previo se cambió `order_items.total_price` para guardarlo **neto** (`unit_price × qty − descuento_línea`). Eso **provocó descuento aplicado dos veces** por interacción con el trigger existente `on_order_item_change → recalculate_order_total()`:

```sql
-- Trigger AFTER INSERT/UPDATE/DELETE en order_items
subtotal = SUM(order_items.total_price)   -- asume que total_price es BRUTO
total    = subtotal − discount + tax
```

El trigger asume que `total_price` es bruto y aplica el descuento por su cuenta al recalcular `orders.total`. Si `total_price` viene neto, resta el descuento otra vez y deja `total = subtotal − 2 × discount`.

**Regla mental**: `order_items.total_price` es `unit_price × quantity` (bruto). El neto se obtiene restando `discount` a nivel `orders`. Si alguien vuelve a proponer guardar neto ahí, primero hay que reescribir el trigger.

Cronología del INSERT de una venta:

```
1. INSERT orders (subtotal, discount, total)
2. INSERT order_items (con total_price BRUTO)
3. TRIGGER on_order_item_change dispara recalculate_order_total():
     UPDATE orders SET
       subtotal = SUM(order_items.total_price),
       total    = subtotal − discount + tax
4. POST-TASK: INSERT cash_movements con amount = total (calculado local en JS)
```

Como `total` calculado en JS y `total` recalculado por el trigger coinciden cuando `total_price` es bruto, `cash_movements.amount` queda correcto en un solo pase.

## Impacto en el resto del sistema

Todos consumidores de `orders.total` que antes recibían el valor inflado ahora reciben el neto real:

| Consumidor | Efecto |
|---|---|
| RPC `close_cash_shift` (`SUM(total)` para `total_sales`, `sales_by_method`) | Reporte de turno cuadra |
| `hooks/useDashboard.ts`, `hooks/useHomeData.ts`, `hooks/useSalesTotals.ts` | KPIs reflejan ventas reales |
| `lib/buildEmployeeReport.ts` (reporte por empleado) | Ticket promedio, ventas por hora y por método correctos |
| `screens/SalesScreen.tsx` (historial) | ⚠️ **Este supuesto era incorrecto.** La UI recalculaba `discount + perItem`, y como `orders.discount` ahora YA incluye el per-item, quedó contando el descuento **dos veces**. Corregido en [`2026-07-25-fix-doble-descuento-historial-y-backfill.md`](./2026-07-25-fix-doble-descuento-historial-y-backfill.md) |
| `screens/CashRegisterScreen.tsx` (detalle turno actual) | Cuadra con `cash_movements` |
| `lib/shiftReport.ts` (tirilla) | La línea "Efectivo" del cajón cuadra con `sales_by_method` (antes divergían) |
| Trigger `sync_order_total_to_payments` (BD) | Copia `orders.total` a `client_transactions.amount` en ventas a crédito → clientes ya no quedan debiendo más de lo real |
| `supabase/functions/ai-chat` | Su prompt decía "orders.total ya incluye descuentos"; ahora sí es cierto |

Ningún consumidor de `order_items.total_price` cambia de comportamiento — sigue siendo bruto.

## Pendiente por revisar (deuda registrada)

1. **Cobrar orden pendiente de mesa (`dine_in`)**: cuando una orden se crea en `pending` y se cobra después (`payingOrderId` en `App.tsx`), el flujo no pasa por `createOrder`. Si se aplica un descuento por línea a una orden de mesa antes de cobrarla, el mismo bug podría seguir vivo en ese camino. No se validó en este fix.

2. **Devolución parcial con descuento por línea** (`components/modals/RefundSaleModal.tsx`): calcula el monto a devolver como `(order_items.total_price / sold) * qty`. Como `total_price` es BRUTO, si se devuelve un ítem que tenía descuento, la app devuelve al cliente el precio SIN descuento (más de lo pagado realmente). Bug preexistente, no se altera en este fix. Ver [`../caracteristicas/anulacion_devolucion_ventas.md`](../caracteristicas/anulacion_devolucion_ventas.md).

3. **Backfill de datos históricos** ✅ *Ejecutado el 2026-07-25 para el negocio 10001* — ver [`2026-07-25-fix-doble-descuento-historial-y-backfill.md`](./2026-07-25-fix-doble-descuento-historial-y-backfill.md). Se corrigieron 9 ventas viejas (`discount = 0`, `total` en bruto → `discount = perItem`, `total` neto). La venta #1951 resultó tener el dato ya correcto (`discount 2450`, `total 22050`); solo se veía mal por el bug de visualización, que se arregló en el código. **Pendiente:** cualquier OTRO negocio con ventas anteriores a 2026-07-24 que hayan usado descuento por línea necesitaría el mismo backfill (verificar por negocio antes de aplicar).

## Archivos modificados

- `hooks/useSales.ts` → función `createOrder`: cálculo de `discount` incluye per-item, comentario explicando por qué `total_price` sigue bruto.
- `hooks/useOfflineSync.ts` → función `syncSale`: mismo cálculo + persistir `discount`/`discount_percent` en `order_items`.
