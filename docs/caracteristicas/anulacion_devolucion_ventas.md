# Anulación y Devolución de ventas

Sistema para revertir ventas ya registradas. Cubre dos mecanismos **mutuamente excluyentes** y la frontera que define cuál aplica a cada venta.

Pantallas: `screens/SalesScreen.tsx` (Facturas), `screens/CashRegisterScreen.tsx` (Caja).
Hooks: `hooks/useOrders.ts`/`useSales.ts` (anulación), `hooks/useRefunds.ts` (devolución).
RPCs Supabase: `void_order_and_restore_stock`, `void_order_item_and_restore_stock`, `process_sale_refund`.

---

## Los dos mecanismos

| | Anulación (soft void) | Devolución (refund) |
|---|---|---|
| Permiso | `pos_cancel` | `pos_refund` |
| Origen UI | Facturas (SalesScreen) | Caja (CashRegisterScreen) y Facturas |
| Qué hace | Marca la venta/ítem como `voided`/`canceled`. Revierte stock, caja y deuda | Crea registro en `sale_refunds`. La venta queda intacta |
| Tablas | `orders.status='voided'`, `order_items.status='canceled'` | `sale_refunds` + `sale_refund_items` |
| Caja | Borra los `cash_movements` de la venta | Inserta movimiento `refund` (salida) |
| Granularidad | Venta completa o ítem individual | Total o por ítem y cantidad |

Ninguno borra físicamente la venta: ambos dejan rastro permanente para auditoría.

---

## Frontera: ¿cuál aplica? (regla por turno)

La elección entre Anular y Devolver depende del **estado del turno** al que pertenece la venta. Como cada venta vive en un solo turno (abierto **o** cerrado), nunca se solapan.

```
              ¿La venta es del turno ABIERTO actual?
                          │
          ┌───────────────┴───────────────┐
         SÍ                                NO (turno cerrado / día anterior)
          │                                 │
   ┌──────────────┐                  ┌──────────────┐
   │  ANULACIÓN   │                  │  DEVOLUCIÓN  │
   │ (corrección) │                  │  (cliente    │
   │              │                  │   devuelve)  │
   └──────────────┘                  └──────────────┘
```

- Las RPC de **anulación** rechazan ventas de turnos `closed`/`reconciled` con el mensaje: *"Esta venta pertenece a un turno ya cerrado. Para revertirla, haz una Devolución en la caja actual."*
- La RPC de **devolución** (`process_sale_refund`) rechaza ventas de un turno **abierto** con: *"Esta venta es de un turno abierto. Para revertirla usa Anular."* También exige un turno abierto del usuario para registrar el movimiento.

El turno de una venta se resuelve por su movimiento `cash_movements` (`reference_type='order'`) → `cash_shifts.status`.

### En SalesScreen (Facturas)
El detalle de la venta consulta el estado del turno de esa venta y muestra **un solo** botón:

```
Venta de TURNO ABIERTO:   🖨 💬 ✉ 🔗 ⬇   🚫 Anular
Venta de TURNO CERRADO:   🖨 💬 ✉ 🔗 ⬇   ↩ Devolución
```

La anulación por ítem y la edición de ítems solo se habilitan en ventas de turno abierto.

---

## Exclusión mutua (guardas en BD)

Independiente de la UI, las RPC se rechazan entre sí para que un mismo producto nunca se maneje dos veces:

- `process_sale_refund`: rechaza ítems con `status='canceled'` (*"El producto X está anulado y no se puede devolver"*).
- `void_order_and_restore_stock`: rechaza si la venta tiene filas en `sale_refunds` (*"Esta venta tiene devoluciones registradas; no se puede anular"*).
- `void_order_item_and_restore_stock`: rechaza si el ítem tiene filas en `sale_refund_items` (*"Este producto tiene una devolución registrada; no se puede anular"*).

---

## Manejo de ventas a CRÉDITO (fiado)

En ventas a crédito **no entró dinero**, por lo que anular o devolver **no debe mover caja**; en su lugar **reduce la deuda** del cliente. Se detecta por `orders.payment_method = 'credit'`.

```
Anular / Devolver producto
        │
   ¿payment_method = 'credit'?
        │
   ┌────┴─────────────┐
  SÍ                  NO (efectivo/tarjeta/...)
   │                   │
 - NO toca caja      - Devolución: inserta cash_movement 'refund'
 - Baja la deuda     - Anulación: borra los cash_movements de la venta
   del cliente
 - Queda registrado
```

Comportamiento por acción sobre venta a crédito:

| Acción | Caja | Deuda del cliente |
|---|---|---|
| Anular venta completa | — (no había) | `client_transactions` de la orden se borra → deuda baja a 0 |
| Anular un ítem (parcial) | — | La fila `debt` se actualiza al **nuevo total** de la orden (`orders.total` tras recalcular) |
| Devolución (parcial/total) | — (no inserta `refund`) | La fila `debt` baja por el monto devuelto (`amount - total_devuelto`) |

El trigger `on_client_transaction_change` recalcula `clients.current_debt` automáticamente al actualizar/borrar la fila de deuda.

> En el `RefundSaleModal`, si la venta es a crédito se **oculta el selector de método** y se muestra el aviso: *"Venta a crédito · No reflejará movimiento en caja. El monto se descontará de la deuda del cliente."*

---

## Visibilidad por rol

- **Administrador** (`admin_reports`): ve todas las ventas y todos los turnos; puede anular y devolver.
- **Cajero** (sin `admin_reports`): solo ve sus propias ventas y sus turnos cerrados.
- Anular requiere `pos_cancel`; devolver requiere `pos_refund`. Ambos permisos se configuran en Empleados.

### Indicadores visuales
- **SalesScreen**: badge "ANULADA" (tachado) en ventas anuladas; "X producto(s) anulado(s)" cuando hay ítems anulados; "Con devolución" cuando la venta tiene `sale_refunds`. El detalle muestra el motivo de anulación y la lista de devoluciones de esa venta.
- **CashRegisterScreen** (historial de turnos): badge rojo "N anulaciones · $X" y badge ámbar "N devoluciones · $X" por turno; secciones de detalle "Anulaciones del turno" y "Devoluciones del turno".
- **ClientsScreen** (crédito): los ítems anulados aparecen tachados con "(anulado)" en el historial del cliente; la deuda ya refleja el descuento.

---

## Reflejo en el reporte de cierre

La devolución en efectivo aparece en la línea **Devoluciones** del reporte de turno (movimiento `refund`). Las devoluciones a crédito **no** generan movimiento de caja, por lo que no afectan el arqueo de efectivo. Ver [`reporte_cierre_turno.md`](./reporte_cierre_turno.md).

> Lo impreso (ticket, recibo público, comanda, reporte térmico/PDF) **no se modifica** por anulaciones ni devoluciones: el detalle solo se muestra en pantalla.

---

## Soporte offline

- **Anulación**: requiere conexión (valida en servidor stock, caja y deuda).
- **Devolución**: **online-only**. `useRefunds` corta con *"Las devoluciones requieren conexión a internet"* si `!navigator.onLine`, porque necesita consultar la venta original y validar cantidades en el servidor.

---

## Pendiente conocido — Devolución parcial con descuento por línea

`components/modals/RefundSaleModal.tsx` calcula el monto a devolver como
`(order_items.total_price / sold) * qty`. Como `total_price` se guarda **bruto** (`unit_price × qty`,
sin restar el descuento por línea — regla obligatoria por el trigger `recalculate_order_total`, ver
[`reporte_cierre_turno.md`](./reporte_cierre_turno.md)), si el ítem tenía un `discount` o
`discount_percent`, la devolución termina reintegrando el precio **sin** el descuento, es decir,
más de lo que el cliente pagó.

Ejemplo: producto de $16 000 con 10 % de descuento por línea (el cliente pagó $14 400). Si se
devuelve completo, el modal calcula `total_price / sold * qty = 16 000` y devuelve $16 000 en vez
de $14 400.

Bug preexistente al fix de descuentos por línea de jul-2026
([`../historial_planes/2026-07-24-fix-descuento-por-linea-en-total-y-caja.md`](../historial_planes/2026-07-24-fix-descuento-por-linea-en-total-y-caja.md)),
no se resolvió allí. Al tocar el modal, calcular el neto por ítem usando `item.discount` o
`item.discount_percent` (ya se persisten desde el fix mencionado, incluso en el path offline).

---

## Tablas y RPCs

| Objeto | Rol |
|---|---|
| `sale_refunds` | Cabecera de devolución (business_id, order_id, shift_id, refunded_by, refund_method, total_amount, reason). La FK `shift_id → cash_shifts` es `ON DELETE SET NULL`: al limpiar el historial de turnos, la devolución se conserva y solo pierde el vínculo al turno borrado |
| `sale_refund_items` | Líneas devueltas (order_item_id, quantity, amount, restocked) |
| `cash_movements.reference_type='sale_refund'` | Movimiento de caja de la devolución (solo ventas pagadas) |
| `process_sale_refund(p_order_id, p_items jsonb, p_method, p_reason)` | Crea la devolución; valida permiso, turno, cantidades; restock solo `simple`; crédito → baja deuda sin tocar caja |
| `void_order_and_restore_stock(p_order_id, p_void_reason)` | Anula venta completa |
| `void_order_item_and_restore_stock(p_order_item_id, p_void_reason)` | Anula un ítem; si quedan 0 activos, anula la venta |

Spec completo del diseño: `.kiro/specs/devolucion-venta/`.
