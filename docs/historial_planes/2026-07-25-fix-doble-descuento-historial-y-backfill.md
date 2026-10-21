# Fix: doble descuento en historial de ventas + backfill de ventas viejas

**Fecha:** 2026-07-25
**Relacionado con:** [`2026-07-24-fix-descuento-por-linea-en-total-y-caja.md`](./2026-07-24-fix-descuento-por-linea-en-total-y-caja.md)

## Síntoma

En el historial de ventas (`SalesScreen`), una venta con descuento por producto mostraba el descuento **duplicado**. Ejemplo real (negocio 10000, venta #1693, producto "Cholao"):

```
  Producto: Cholao ......... 10.000
  Dcto ..................... −1.000   ← correcto (descuento por ítem)
  ───────────────────────────────
  Subtotal ................. 10.000
  Descuento ................ −2.000   ← DOBLE (debería ser −1.000)
  Total pagado ............. 8.000    ← debería ser 9.000
```

## Causa raíz

El fix del **2026-07-24** cambió la semántica de `orders.discount`: ahora **ya incluye** los descuentos por línea (antes solo guardaba el descuento global). La persistencia quedó correcta (`orders.total` = neto real).

Pero la capa de **visualización nunca se actualizó**. Cuatro lugares seguían recalculando el descuento por ítem y **sumándolo encima** de `orders.discount` (que ya lo contenía), duplicándolo:

```
Antes del fix 2026-07-24            Después del fix 2026-07-24
orders.discount = solo global       orders.discount = global + por ítem
UI: discount + perItem = OK         UI: discount + perItem = DOBLE  ✗
```

Los 4 lugares con el patrón `(order.discount || 0) + perItemDiscount`:

| Archivo | Función / punto | Qué alimenta |
|---|---|---|
| `screens/SalesScreen.tsx` | `getSaleNetTotal`, `getSaleTotalDiscount`, `buildReceiptData` | Historial (lista + detalle) y tirilla reimpresa |
| `screens/PublicReceiptScreen.tsx` | Cálculo del PDF y de la pantalla | Recibo público (link `/t/...` y QR) |
| `hooks/useSalesTotals.ts` | `netTotal` por orden | Barra de KPIs por método de pago en el header del historial |

## Verificación en la BD (antes de tocar nada)

Se confirmó contra Supabase (proyecto `hjjmwipqquynjopkswvu`) que el dato guardado era **correcto** y el bug era solo de visualización:

- Negocio de pruebas 10000 (`public_id = 10000`, "Tienda de la Esquina"), venta #1693: `subtotal 10000`, `discount 1000`, `total 9000`. El historial mostraba 8000 (recalculando de más).
- Negocio real 10001 (`public_id = 10001`, "Mi Negocio"): solo **10 ventas** con descuento por producto en toda la historia, **todas anteriores** al fix.
  - 9 ventas con `discount = 0` y `total` en bruto (dato viejo incompleto).
  - 1 venta (#1951) con `discount = 2450` y `total = 22050` (dato ya correcto).

## Solución elegida (Opción A): backfill + simplificar código

### Parte 1 — Backfill de datos históricos (negocio 10001)

Las 9 ventas viejas tenían `discount = 0` y `total` en bruto. Se normalizaron al mismo criterio que las ventas nuevas.

**Checks de seguridad previos (todos OK):**
- Turnos cerrados son **foto congelada**: `close_cash_shift` calcula y guarda los totales en columnas de `cash_shifts` una sola vez; el reporte de un turno cerrado lee esas columnas, no recalcula desde `orders`. Cambiar `orders` **no** altera turnos ya cerrados.
- Ninguna de las 9 es a **crédito** (todas `cash`/`transfer`) → no mueve deudas de clientes vía trigger `sync_order_total_to_payments`.
- Ninguna de las 9 tiene **devolución** asociada.
- La única venta con `discount > 0` (#1951) ya está correcta → el filtro `discount = 0` la excluye sola.

**Migración ejecutada:**

```sql
with oi as (
  select order_id,
    sum(coalesce(discount,0) + case when coalesce(discount,0)=0
        and coalesce(discount_percent,0)>0
        then discount_percent*unit_price*quantity/100 else 0 end) as per_item
  from order_items
  group by order_id
)
update orders o
set discount = oi.per_item,
    total    = round((o.subtotal - oi.per_item)/50)*50
from oi
where oi.order_id = o.id
  and o.business_id = '9ab00944-b41b-47bd-b595-9aaea024d777'  -- negocio 10001
  and oi.per_item > 0
  and o.discount = 0;
```

> `orders` no tiene columna `updated_at`; por eso la migración no la toca.

**Ventas corregidas (9):**

| # | subtotal | perItem | discount 0→ | total (bruto→neto) |
|---|---|---|---|---|
| 363 | 24.500 | 500 | 500 | 24.500 → 24.000 |
| 661 | 33.900 | 6.780 | 6.780 | 33.900 → 27.100 |
| 742 | 61.000 | 6.100 | 6.100 | 61.000 → 54.900 |
| 743 | 65.000 | 6.500 | 6.500 | 65.000 → 58.500 |
| 848 | 75.800 | 10.770 | 10.770 | 75.800 → 65.050 |
| 1021 | 127.300 | 12.730 | 12.730 | 127.300 → 114.550 |
| 1165 | 26.000 | 2.600 | 2.600 | 26.000 → 23.400 |
| 1531 | 39.300 | 4.530 | 4.530 | 39.300 → 34.750 |
| 1817 | 10.000 | 2.000 | 2.000 | 10.000 → 8.000 |

Consistencia con la BD: al poner `discount = perItem`, el trigger `recalculate_order_total` (si algún día se dispara) calcula `subtotal − discount` y da el mismo neto. No hay conflicto.

### Parte 2 — Simplificar el código

Los 4 puntos ahora **confían en `orders.total` / `orders.discount`** y ya no recalculan el descuento por ítem:

- `screens/SalesScreen.tsx`
  - `getSaleNetTotal(sale)` → `sale.total`
  - `getSaleTotalDiscount(sale)` → `sale.discount`
  - `buildReceiptData` → `totalDiscount = sale.discount`, `total = sale.total`
- `screens/PublicReceiptScreen.tsx` → los 2 cálculos usan `order.discount` y `order.total`
- `hooks/useSalesTotals.ts` → `netTotal = order.total`; además se restauró el `select` liviano (`id, payment_method, total, split_payments, status`), quitando `subtotal/discount/items:order_items` que solo servían para el recompute (menos egress)

## ¿Y la venta #1951?

Su dato en la BD **ya estaba correcto** (`discount 2450`, `total 22050`). El único problema era el código, que le re-sumaba el descuento. Se arregla **con el deploy del código** (Parte 2), sin tocar datos:

```
                  Código viejo en prod         Tras el deploy
Historial #1951   Descuento −4.900 / 19.600    Descuento −2.450 / 22.050  ✅
```

## Verificación

- `tsc --noEmit`: 19 errores preexistentes en otros archivos (typings de `@react-pdf/renderer`, etc.), **ninguno** en los archivos tocados.
- `npm run build` (vite): exitoso, exit 0.

## Pendiente / notas

- **Requiere deploy** (build + Firebase Hosting). Hasta el deploy, en la app las 9 ventas backfilleadas se verán duplicadas (por el dato ya corregido + código viejo). Se corrige solo al desplegar.
- Los **turnos cerrados** de esos días viejos siguen mostrando su foto congelada (bruto). Es el valor que se cuadró en su momento; no se reescribe historia de arqueos.
- Otros negocios con ventas viejas (pre-2026-07-24) que hayan usado descuento por línea necesitarían el mismo backfill. En 10001 solo eran 9. Verificar por negocio antes de aplicar.
- Siguen abiertos los ítems 1 (cobro de orden `dine_in` pendiente) y 2 (devolución parcial con descuento por línea) de la deuda registrada en el doc del 2026-07-24.

## Archivos modificados

- `screens/SalesScreen.tsx` → simplificar `getSaleNetTotal`, `getSaleTotalDiscount`, `buildReceiptData`
- `screens/PublicReceiptScreen.tsx` → simplificar los 2 cálculos de descuento/total
- `hooks/useSalesTotals.ts` → usar `order.total`; select más liviano
- BD (negocio 10001): backfill de 9 filas de `orders` (`discount`, `total`)

---

## Continuación (UI de turnos)

Aprovechando que `orders.discount` ya es confiable, se agregó visibilidad de descuentos en `CashRegisterScreen`. **Solo UI**: no se tocó `close_cash_shift`, `buildShiftReportData`, impresión, PDF ni correo. La documentación de feature vive en [`../caracteristicas/reporte_cierre_turno.md`](../caracteristicas/reporte_cierre_turno.md) → sección "Descuentos del turno".

### 1. Listado del historial de turnos

- Línea `N descuentos · −$X` bajo el nombre del turno (aparece solo si hubo descuentos), en **púrpura** para distinguirla de Anulaciones (rojo) y Devoluciones (ámbar).
- Al lado del nombre de la caja: `· #N` con el número de turno (`cash_shifts.shift_number`, en negrita suave). Se agregó `shift_number` al `select` liviano de `fetchShifts` en `hooks/useCashRegister.ts`.
- El fetch se hace dentro de `fetchVoidsAndRefunds` (misma ventana online-only que anulaciones/devoluciones) → 4ª query: `orders.select(discount, created_at) where status='completed' and discount>0`. Se cruza por turno con `discountsByShift` (useMemo) usando la misma ventana temporal que `total_sales`.

### 2. Detalle del turno cerrado

Nuevas piezas en la sección 1 (Desglose de ventas):

- **Línea "Descuentos"** con monto `−$X` y botón **"Ver"** (púrpura). Aparece solo si `shiftDiscountsTotal > 0`.
- **Aviso informativo** bajo "Total ventas": `ⓘ El total de ventas ya incluye los descuentos.`
- **Modal "Descuentos del turno"** (`showShiftDiscountsModal`): reutiliza el patrón de overlay del modal de movimientos existente. Lista una entry por cada descuento:
  - Descuento por producto → `Orden #1701 · <nombre del producto> · −$Y`.
  - Descuento a la orden completa → `Orden #1705 · −$Y` (sin nombre de producto).
  - Al pie: `TOTAL DESCUENTOS · −$X`.

### 3. Cómo se calculan los datos del detalle

Consulta al abrir el detalle (`useEffect` sobre `viewMode='detail'` + `selectedShift.id`):

```ts
supabase.from('orders')
  .select('order_number, discount, items:order_items(product_name, discount, discount_percent, unit_price, quantity)')
  .eq('business_id', shift.business_id)
  .eq('status', 'completed')
  .gt('discount', 0)
  .gte('created_at', shift.opened_at)
  .lt('created_at', shift.closed_at);
```

Para cada orden se separan las entries:

```
por producto  = sum(item.discount  ||  discount_percent × unit_price × qty / 100)  por cada ítem
por orden     = orders.discount − por_producto     (entry sin product_name, si > 0.5)
```

La suma de entries de una orden = `orders.discount`, así el total del modal, la línea del panel y la línea del listado siempre coinciden.

### Casos borde

- **Turnos offline** (`id` empieza con `offline_`) o sin `closed_at`: el detalle no consulta la BD (línea "Descuentos" oculta, modal vacío). El listado tampoco muestra la línea porque el fetch depende de `navigator.onLine`.
- **Ventas anuladas** (`status='voided'`): fuera del filtro, igual que en `total_sales`.
- El listado muestra "N descuentos" contando **órdenes** con descuento (no entries individuales), para que un cajero pueda comparar rápido cuántas ventas del turno tuvieron descuento.

### Archivos modificados (Continuación)

- `screens/CashRegisterScreen.tsx` → estado `discountOrdersRaw` + 4ª query en `fetchVoidsAndRefunds`; `discountsByShift` (useMemo) para el listado; estado `shiftDiscounts` + `showShiftDiscountsModal` + `useEffect` de detalle; línea "Descuentos" + aviso en el panel; modal con detalle por producto; `· #N` junto al nombre de caja en el listado.
- `hooks/useCashRegister.ts` → agregado `shift_number` al `select` liviano de `fetchShifts` (necesario para el listado).
