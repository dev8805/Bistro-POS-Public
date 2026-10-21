# Reporte de cierre de turno (REPORTE DIARIO)

Reporte de arqueo de caja que se genera por **turno individual** desde el detalle de turno en
`CashRegisterScreen` (Imprimir térmica 58/80mm · PDF tirilla · Correo). Replica el formato del
"REPORTE DIARIO" usado por los POS contables colombianos (Siigo, Alegra).

## Principio: dos fuentes de datos

El reporte separa **a propósito** dos cosas en secciones distintas:

| Propósito | Fuente | Qué responde |
|---|---|---|
| **Arqueo de efectivo** (lo que debe haber en el cajón) | `cash_movements` del turno | ¿Cuánto efectivo físico debería haber? |
| **Facturación por método** (informativo) | `sales_by_method` (órdenes del turno) | ¿Cuánto vendí por cada medio de pago? |

> ⚠️ Regla de oro: **la sección de efectivo se calcula SOLO de `cash_movements`** del turno, para
> que cuadre exacto con `expected_cash`. Las líneas de medios no-efectivo (Tarjetas, Pagos en línea,
> Otros) son **informativas** y NO afectan el total de efectivo.

Construcción en código: `lib/shiftReport.ts` → `buildShiftReportData(shift, movements, business, fmt, categories)`.

---

## Encabezado

| Línea del reporte | Qué la llena | Fuente |
|---|---|---|
| Sucursal | Nombre del negocio | Ajustes de facturación |
| Caja | Caja elegida al abrir turno | `cash_shifts.register_id` |
| # Turno | Consecutivo asignado **al abrir** el turno (trigger `set_shift_number`, por negocio) | `cash_shifts.shift_number` |
| Vendedor | Quien **abrió** el turno | `opened_by` |
| Fecha/Hora inicio | Apertura del turno | `opened_at` |
| Fecha/Hora fin | Cierre del turno | `closed_at` |
| Cierre realizado por | Quien **cerró** el turno | `closed_by` |

---

## Movimiento de caja

Reconcilia: **Base + Efectivo + Otros ingresos − Retiro = Total de efectivo**.

| Línea | Qué la llena | Fuente |
|---|---|---|
| Base inicial de caja | **Abrir turno** (`opening`) | `opening_balance` |
| Efectivo | **Ventas en efectivo** (`sale`, cash) — efectivo que entró al cajón | movimientos `sale` cash |
| Otros ingresos de efectivo | **"Entrada de efectivo"** + **abonos de cliente en efectivo** (`cash_in`, solo cash) | movimientos `cash_in` cash |
| Retiro de efectivo | **"Salida de efectivo"** + **gastos** + **compras/abonos a proveedor** + **devoluciones**, en efectivo (`cash_out`+`expense`+`purchase`+`refund`, cash) | movimientos de salida cash |
| Total de efectivo | = Base + Efectivo + Otros ingresos − Retiro (= `expected_cash`) | calculado de movimientos |
| Tarjetas | **Ventas con tarjeta** — informativo, no toca el cajón | `sales_by_method` (línea `tarjeta`) |
| Pagos en línea | **Ventas por nequi/daviplata/transferencia** — informativo | `sales_by_method` (línea `linea`) |
| Otros | **Ventas con "Otro"** — informativo | `sales_by_method` (línea `otros`) |

> Gastos y compras en efectivo se **absorben en "Retiro de efectivo"** (toda salida del cajón), sin
> agregar líneas nuevas, para que el total cuadre.

> [!IMPORTANT]
> **Pagos divididos (mixtos).** Una venta con pago dividido se guarda con
> `payment_method = 'mixed'` y el detalle en `split_payments` (JSONB). La RPC
> `close_cash_shift` **expande** cada parte a su método real al calcular
> `sales_by_method` y los totales, en vez de meter el total en "Otros". Ej.: una
> venta de $12.000 efectivo + $30.400 transferencia suma $12.000 a Efectivo y
> $30.400 a Pagos en línea (Transferencia). El valor `'mixed'` es exclusivo y **no
> se confunde** con el método "Otro" real. Ver
> [`../historial_planes/2026-06-17-fix-pago-dividido-clasificacion.md`](../historial_planes/2026-06-17-fix-pago-dividido-clasificacion.md).

---

## Valores ingresados por el cajero (arqueo del cierre)

Lo que el cajero **cuenta/declara** al cerrar el turno. Se capturan en el formulario de cierre.

| Línea | Qué la llena | Fuente |
|---|---|---|
| Efectivo | Conteo del cajón al cerrar | `declared_cash` |
| Tarjetas | Declarado en tarjeta (campo opcional del cierre) | `declared_by_method` (línea `tarjeta`) |
| Pagos en línea | Declarado en línea (campo opcional del cierre) | `declared_by_method` (línea `linea`) |
| Otros | Declarado en otros (campo opcional del cierre) | `declared_by_method` (línea `otros`) |

### Conteo de efectivo: "Total Directo" vs "Por Denominación"

El monto de efectivo (`declared_cash`) se puede ingresar de dos formas en el cierre:

- **Total Directo**: el cajero escribe el total contado.
- **Por Denominación**: el cajero ingresa la cantidad de cada billete/moneda y la app suma (`denominationTotal`).

> [!IMPORTANT]
> Las **monedas** se guardan en `denominationCounts` con clave `valor + 0.5`
> (ej. `1000.5`) para no colisionar con el **billete** del mismo valor (`1000`). Al
> sumar el total se debe **truncar** ese offset: `Math.floor(parseFloat(value)) * count`.
> Si se suma con `parseFloat(value)` directo, cada moneda se infla en `0,5 × cantidad`
> (bug corregido en jun-2026: un conteo daba 653.143 en vez de 653.100). Este total
> alimenta `declared_cash` y la **diferencia del arqueo**, no es solo visual.

---

## Resumen final

| Línea | Qué la llena | Fuente |
|---|---|---|
| Total ingresado en cierre de caja | Suma de lo declarado | `declared_*` |
| Total esperado en cierre de caja | = "Total de efectivo" | `expected_cash` |
| Diferencia | Declarado (efectivo) − esperado | `difference` (solo efectivo físico) |
| Devoluciones | **Botón "Devolución"** en Caja (`refund`) | movimientos `refund` |
| Retiros diferentes a efectivo | Toda salida en método ≠ efectivo: **"Salida de efectivo"**, **gastos** y **compras/abonos a proveedor** no-efectivo (`cash_out`+`expense`+`purchase` no-cash) | movimientos de salida no-cash |
| Facturas a crédito | **Ventas a crédito/fiado** | `sales_by_method` (línea `credito`) |

---

## Disparadores por acción de la app

| Acción en la app | Tipo de movimiento | Línea(s) del reporte |
|---|---|---|
| Abrir turno | `opening` | Base inicial · # Turno |
| Vender en efectivo | `sale` (cash) | Efectivo |
| Vender con tarjeta/nequi/etc | `sale` (no-cash) | Tarjetas / Pagos en línea (informativo) |
| **Vender con pago dividido** (`'mixed'`) | un `sale` **por método** (cash, transfer, …) | Cada parte a su línea real (Efectivo / Pagos en línea / Tarjetas) |
| Vender a crédito (fiado) | `sale` (credit, $0) | Facturas a crédito (informativo) |
| "Entrada de efectivo" / abono cliente en efectivo | `cash_in` (cash) | Otros ingresos de efectivo |
| "Salida de efectivo" (efectivo) | `cash_out` (cash) | Retiro de efectivo |
| "Salida de efectivo" (otro método) | `cash_out` (no-cash) | Retiros diferentes a efectivo |
| Registrar gasto en efectivo | `expense` (cash) | Retiro de efectivo |
| Registrar gasto en método ≠ efectivo (nequi, etc.) | `expense` (no-cash) | Retiros diferentes a efectivo |
| Compra inventario / abono proveedor en efectivo | `purchase` (cash) | Retiro de efectivo |
| Compra inventario en método ≠ efectivo | `purchase` (no-cash) | Retiros diferentes a efectivo (abono a proveedor ≠ efectivo no toca caja) |
| **Botón "Devolución"** en Caja | `refund` | Devoluciones (+ Retiro si es efectivo) |
| Cerrar turno (conteo) | — | Valores ingresados · Diferencia |

Todas las acciones de caja tienen **soporte offline** (cola de sincronización), incluidos Salida con
método, Devolución y el declarado por método del cierre.

---

## Interfaz de `CashRegisterScreen` (navegación y reporte)

La pantalla maneja 5 vistas (`viewMode`): `dashboard` (turno actual), `close` (arqueo),
`history` (historial), `detail` (detalle de un turno cerrado) y `current_movements`.

Convenciones de UI vigentes (jun-2026):

- **Header contextual** (oculto durante la transición de cierre, `isClosing`):
  - En `dashboard`: flecha de cerrar (cuadrada, `size-9`) + pestañas **Turno Actual / Historial** + botón rojo **Cerrar Turno**.
  - En `history` y `detail`: botón **← Atrás** (con borde, mismo tamaño/posición que la flecha del dashboard). **NO** se muestran las pestañas, ni el botón "Cerrar Turno". En `history` aparece a la derecha el selector/filtro desplegable de turnos y fechas (ver [`modulo_caja.md`](modulo_caja.md)).
- **Acciones del reporte** (Imprimir · PDF · Correo) viven en el **header** cuando `viewMode === 'detail'`. Íconos con color por función (Imprimir=azul, PDF=rojo `download`, Correo=esmeralda) y texto visible solo en `sm+` (en móvil solo ícono). El correo se oculta en turnos cerrados offline. Llaman a `handlePrintShiftReport` / `handleDownloadShiftReport` / `setShowReportEmailModal` (lógica sin cambios).
- **Cierre (`close`)**: el botón "Cerrar Turno" del header se oculta; la acción real es **Confirmar Cierre** dentro del formulario. Al confirmar, se muestra un loader a pantalla completa y se navega directo al `detail` del turno cerrado.
- El botón **Limpiar Historial** está **oculto temporalmente** (decisión de UX); su lógica (`handleClearHistory`/`clearShiftHistory`) sigue intacta y queda como comentario en `renderHistoryView` para restaurarlo.

> Estos cambios son de presentación: **no alteran** la construcción del reporte
> (`getReportData` → `buildShiftReportData`) ni los flujos de impresión/PDF/correo.

> [!NOTE]
> Sobre el **borde/parpadeo de foco** que apareció en inputs y botones de esta
> pantalla (y su solución reutilizable), ver
> [`../arquitectura/fix_parpadeo_borde_foco.md`](../arquitectura/fix_parpadeo_borde_foco.md).

---

## Descuentos del turno (solo UI, no toca el reporte)

En el detalle de un turno **cerrado** y en el listado del historial se muestra cuánto se descontó, calculado **al vuelo** desde `orders` (no se guarda en `cash_shifts`, no se toca `close_cash_shift`, no se toca impresión/PDF/correo).

Convenciones vigentes (jul-2026):

- **Listado del historial**: en cada fila aparece, junto al nombre de la caja, `· #N` (número de turno tomado de `cash_shifts.shift_number`, en negrita suave). Si el turno tuvo descuentos, aparece debajo una línea `N descuentos · −$X` en **púrpura** — distinto de los colores ya usados por Anulaciones (rojo) y Devoluciones (ámbar).
- **Detalle del turno**: en la sección 1 (Desglose de ventas), justo antes de "Total ventas", aparece una línea `Descuentos · −$X · Ver` (con botón "Ver" púrpura). Debajo de "Total ventas" hay un aviso informativo `ⓘ El total de ventas ya incluye los descuentos.` Ambos solo aparecen si el turno tuvo descuentos.
- **Modal "Ver"** (`showShiftDiscountsModal`): lista una entry por cada descuento del turno. Si el descuento fue **por producto**, la entry incluye el nombre del producto (`Orden #1701 · Cholao ........... −$1.000`). Si el descuento fue a la **orden completa** (global), la entry solo dice `Orden #1705 ................ −$2.450`. Al pie, `TOTAL DESCUENTOS`.

### Cómo se calcula

Una consulta en `screens/CashRegisterScreen.tsx` trae del negocio las órdenes `completed` con `discount > 0`. Se agrupa por turno usando la **misma ventana temporal** que `total_sales` (negocio + `opened_at` ≤ `created_at` < `closed_at`), por eso el número cuadra con "Total ventas" del propio detalle.

Para separar descuento por producto vs por orden completa se aprovecha la regla del fix del 2026-07 (`orders.discount = global + suma por línea`):

```
por producto  = sum(order_items.discount  ||  discount_percent × unit_price × qty / 100)
por orden     = orders.discount − por_producto     (si > 0, se muestra como entry sin producto)
```

La suma de entries de una orden = `orders.discount`. Se usa una tolerancia de 0.5 para no listar entries de centavos por redondeo.

### Casos borde

- **Turnos offline** (`id` empieza con `offline_`) o sin `closed_at`: no se consulta la BD. El listado no muestra la línea de descuentos y el detalle no muestra "Ver".
- **Ventas anuladas**: quedan fuera (`status = 'completed'`), consistente con "Total ventas".
- Comportamiento **no** alterado: para negocios con dos cajas abiertas a la vez, el descuento se cuenta en ambos turnos igual que ya pasa con `total_sales` (hereda la lógica existente).

### Detalle histórico

Ver [`../historial_planes/2026-07-25-fix-doble-descuento-historial-y-backfill.md`](../historial_planes/2026-07-25-fix-doble-descuento-historial-y-backfill.md), sección "Continuación (UI de turnos)".

---

## Métodos de pago (fuente única y clasificación)

Toda la app comparte una **fuente única** en `lib/paymentMethods.ts`:

- `normalizeMethodId(nombre)` + `STD_MAP`: mapea nombre → categoría de BD (`cash`/`card`/`transfer`/`nequi`/`daviplata`/`credit`/`other`).
- `reportLineFor(método, categorías)`: línea del reporte para cada método, **insensible a mayúsculas/tildes**.
- `useBusinessPaymentMethods()`: métodos reales del negocio (desde Ajustes) con su categoría y línea.

Los selectores de **Caja** (Salida/Devolución) usan `useBusinessPaymentMethods()`, así muestran los
mismos métodos que la pantalla de venta. El reporte clasifica con `reportLineFor`, por lo que cada
método cae en su línea correcta.

### Métodos fijos
Los métodos de pago están **fijos** a los 6 estándar y **no se pueden crear, renombrar ni borrar**
desde la UI (se quitaron los botones "Editar"/"+" en `PaymentScreen` y `PaymentSidebar`):

`Efectivo · Tarjeta · Nequi · Daviplata · Transferencia · Otro`

Mapeo a líneas del reporte:

| Método | Línea del reporte |
|---|---|
| Efectivo | Efectivo |
| Tarjeta | Tarjetas |
| Nequi / Daviplata / Transferencia | Pagos en línea |
| Otro | Otros |
| (venta a crédito/fiado) | Facturas a crédito |
| (pago dividido `'mixed'`) | Cada parte se reparte a la línea de su método real (no cae en "Otros") |

### Categorías personalizadas (Opción B, latente)
Existe la columna `businesses.payment_method_categories` (jsonb: id normalizado → línea) y una sección
en Ajustes de Facturación para asignar la línea de un **método personalizado**. Como hoy la creación
de métodos está bloqueada, esa sección queda **inactiva** (muestra "No tienes métodos personalizados"),
pero el soporte sigue listo si a futuro se agrega un método de pago desde el código.

---

## Fórmula de reconciliación

```
Total de efectivo (= Total esperado en cierre)
  = Base inicial
  + Efectivo (ventas en efectivo)
  + Otros ingresos de efectivo
  − Retiro de efectivo (retiros + gastos + compras + devoluciones en efectivo)

Diferencia = Total declarado (contado en efectivo) − Total esperado
```

---

## Concepto contable: "Otros ingresos de efectivo" ≠ "ingreso" contable

En el POS, *ingreso de efectivo* = **entrada de plata al cajón** que NO es una venta (ej. un abono de
cliente). Contablemente un abono **baja Cuentas por Cobrar, no es una venta**. Por eso va separado de
"Efectivo (ventas)".

Referencias contables:
- Siigo — Elaboración de ingresos POS: <https://siigopyme.portaldeclientes.siigo.com/basedeconocimiento/elaboracion-de-ingresos-cajero/>
- Alegra — Turnos de caja POS: <https://ayuda.alegra.com/col/turnos-de-caja-pos>

---

## Limpiar historial de turnos

Desde el detalle del historial, un usuario con `admin_reports` puede **Limpiar Historial**: borra de la BD los turnos **cerrados** del negocio (`cash_shifts` con `status != 'open'`) vía `clearShiftHistory` en `useCashRegister`.

Qué se borra y qué se conserva al limpiar:

| Dato | Efecto |
|---|---|
| Turnos cerrados (`cash_shifts`) | Se borran |
| Movimientos de esos turnos (`cash_movements`) | Se borran en cascada (`ON DELETE CASCADE`) → el arqueo de esos turnos ya no se puede reconstruir |
| Ventas (`orders`) | **Se conservan** (visibles en Facturas) |
| Devoluciones (`sale_refunds`) | **Se conservan**; su `shift_id` pasa a `NULL` (`ON DELETE SET NULL`) |

> [!IMPORTANT]
> Antes de este arreglo, limpiar el historial fallaba con un error de integridad (`violates foreign key constraint "sale_refunds_shift_id_fkey"`) cuando algún turno tenía devoluciones, porque la FK estaba en NO ACTION. Se cambió a `ON DELETE SET NULL` para que la limpieza funcione sin perder el registro de la devolución. El diálogo de confirmación explica qué se borra (turnos + arqueo) y qué se conserva (ventas y devoluciones), y sugiere descargar los reportes antes.

---

## Archivos relacionados

| Archivo | Rol |
|---|---|
| `lib/paymentMethods.ts` | Fuente única de métodos de pago (normalize, STD_MAP, `reportLineFor`, `useBusinessPaymentMethods`) |
| `lib/shiftReport.ts` | Construye `ShiftReportData` desde el turno + movimientos; wrappers PDF/correo |
| `components/ShiftReportThermalPDF.tsx` | PDF tirilla 58/80mm |
| `lib/thermalPrinterService.ts` → `printShiftReportDirect` | Impresión térmica ESC/POS (QZ Tray) |
| `screens/CashRegisterScreen.tsx` | Botones del reporte, selectores de caja, devolución, declarado por método |
| `hooks/useCashRegister.ts` | `CashShift`, apertura/cierre, `addCashOut`/`addRefund`/`closeShift` |
| `hooks/useOfflineSync.ts` | Sync offline de salida con método, devolución y cierre |
| `context/BusinessSettingsContext.tsx` | Carga/expone `paymentMethodCategories` |
| `components/SettingsSidebarPanel.tsx` | Ajustes: categorías por método personalizado |
| `supabase/migrations/20260605_shift_report_fields.sql` | `shift_number`, columnas de cierre y RPC `close_cash_shift` |
| `supabase/migrations/20260605_payment_method_categories.sql` | Columna `payment_method_categories` |
| Edge function `send-receipt-email` | Envío del reporte por correo (`emailType: 'shift_report'`) |

## Estado de funcionamiento

Todas las líneas del reporte se alimentan con flujos reales (Devoluciones, Retiros no-efectivo y
declarado por método ya están implementados). Los métodos de pago están fijos a los 6 estándar para
mantener el reporte determinístico y evitar confusión.

---

## Origen del `total` de una venta (regla crítica al tocar el flujo de ventas)

`sales_by_method`, `total_sales` y `total_cash_sales` del turno se calculan en la RPC
`close_cash_shift` como `SUM(orders.total)` filtrado por método. Es decir: **si `orders.total`
está mal, el reporte queda mal**. Y `orders.total` se arma en un baile entre JavaScript y un
trigger de la BD que es fácil romper si no se conoce:

```
1. useSales.createOrder (JS) calcula subtotal, discount, total e INSERT en orders.
2. INSERT order_items con total_price = unit_price × qty (BRUTO).
3. Trigger on_order_item_change → recalculate_order_total() dispara:
     UPDATE orders SET
       subtotal = SUM(order_items.total_price),   -- asume total_price BRUTO
       total    = subtotal − discount + tax
4. Post-task INSERT cash_movements con amount = total (JS local).
```

Reglas para no romperlo:

- `order_items.total_price` DEBE guardarse BRUTO (`unit_price × qty`). Si se guarda neto, el
  trigger resta el descuento otra vez y `orders.total` queda a la mitad.
- El `discount` de la orden DEBE incluir los descuentos por línea (`item.discount` +
  `item.discount_percent × unit_price × qty / 100`) además del descuento global de
  `PaymentScreen`. Si solo se guarda el global, `orders.total = subtotal` (bruto) y todo el
  reporte de turno se infla en ventas con descuento por ítem. Fix aplicado en jul-2026.

Detalle histórico y trampa descubierta en el camino:
[`../historial_planes/2026-07-24-fix-descuento-por-linea-en-total-y-caja.md`](../historial_planes/2026-07-24-fix-descuento-por-linea-en-total-y-caja.md).

> Pendiente identificado en ese fix: cuando una orden de mesa (`dine_in`) queda en `pending` y
> se cobra en un paso posterior (`payingOrderId` en `App.tsx`), el flujo no pasa por
> `createOrder`. Ese camino no fue revisado y podría persistir el mismo bug si se aplica un
> descuento por línea antes del cobro.
