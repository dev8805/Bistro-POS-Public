# Fix: clasificación de pagos divididos (mixtos) en caja, reportes y dashboard

**Fecha:** 2026-06-17
**Tipo:** fix (corrección de datos + identificación de método de pago)

## Problema

Una venta con **pago dividido** (parte en un método, parte en otro) se estaba
clasificando como **"Otros"** en el reporte de cierre de turno, el reporte por
empleado y el dashboard, en lugar de repartir cada porción a su método real.

Causa raíz: al crear la venta, `orders.payment_method` se guardaba como `'other'`
y el detalle quedaba en la columna `split_payments` (JSONB). Los puntos que
agrupaban por `orders.payment_method` (sin mirar `split_payments`) metían el
**total completo** de la venta dividida en la casilla "Otros".

Caso real detectado: turno 8 del negocio `10001`, venta #382 ($42.400 = $12.000
efectivo + $30.400 transferencia) aparecía como $42.400 en "Otros".

### Conflicto adicional: `'other'` colisiona con el método real "Otro"

El valor `'other'` que se guardaba para las divididas es **el mismo** que el del
método de pago real "Otro" (uno de los 6 estándar). Eso las volvía
indistinguibles a nivel de dato: la única diferencia era mirar `split_payments`.

## Solución aplicada

### 1. Valor dedicado `'mixed'` (en vez de `'other'`)

Las ventas divididas ahora se guardan con `orders.payment_method = 'mixed'`, un
valor exclusivo que **nunca** se confunde con el método "Otro" real. La columna
es `text` sin constraint, así que no requirió migración de esquema.

- `hooks/useSales.ts` — online: `payment_method = split_payments ? 'mixed' : ...`
- `hooks/useOfflineSync.ts` — offline (`syncSale`): mismo criterio al sincronizar.
- Tipo `Order.payment_method` extendido con `'mixed'`.

### 2. RPC `close_cash_shift` — expande los pagos divididos

La función de cierre agrupaba por `orders.payment_method`. Ahora **expande**
`split_payments`: cada venta normal aporta `(payment_method, total)` y cada venta
dividida aporta una fila por parte, con el método normalizado a su categoría de BD
(`Efectivo→cash`, `Transferencia→transfer`, etc.). Afecta a `sales_by_method` y a
los totales `total_cash_sales / total_card_sales / total_transfer_sales /
total_credit_sales`. Las ventas normales se comportan idéntico a antes.

SQL en `docs/migrations/2026-06-17-fix-close-cash-shift-split-payments.sql`.

### 3. Reporte por empleado (`lib/buildEmployeeReport.ts`)

Normaliza las etiquetas de `split_payments` (vienen como nombres visibles
`"Efectivo"`, `"Transferencia"`) a la categoría de BD con `toStoredMethod`, para no
fragmentar el desglose ni inflar "Otros". El conteo de la venta se asigna al método
de mayor monto del split.

### 4. Dashboard (`hooks/useDashboard.ts`) — Opción A

El gráfico de métodos de pago ahora trae `split_payments` y **reparte** cada parte
a su método real, igual que caja y empleado (antes metía el total en "Otros").
Etiqueta `mixed → 'Mixto'` añadida como respaldo.

### 5. Soporte offline completo (`App.tsx` + `useOfflineSync.ts`)

Antes, una venta dividida hecha sin internet perdía el detalle y se sincronizaba
con un `payment_method` inválido. Ahora:

- `App.tsx` (los 2 puntos de encolado offline): el payload incluye
  `split_payments`, y la reflexión local en caja (`pushOfflineCashMovement`) empuja
  **un movimiento por método** en vez de uno solo "Mixto".
- `useOfflineSync.ts` (`syncSale`): al sincronizar guarda `split_payments`, fija
  `payment_method = 'mixed'` y divide los `cash_movements` por método.

Resultado: una venta dividida offline queda idéntica a una online.

### 6. Etiqueta en el historial (`screens/SalesScreen.tsx`)

El badge del método en la lista de ventas ya **no dice "Otro"** para divididas:
muestra los métodos unidos, ej. `Efectivo + Transferencia` (helper
`getPaymentLabel`). Etiqueta `mixed → 'Mixto'` añadida como respaldo en
`paymentMethodDisplayMap` y en `PublicReceiptScreen`.

## Backfill de datos históricos

Se actualizaron las ventas divididas existentes de `'other'` a `'mixed'` (solo
filas con `split_payments` no vacío). Eran 2 en toda la BD (#382 y #1594). El turno
8 ya cerrado se recalculó: "Otros" $42.400 → $0, Efectivo +$12.000, Transferencia
+$30.400 (total sin cambios). Ninguna venta real con método "Otro" se vio afectada.

## Por qué no rompe nada más

- La RPC y el reporte de empleado distinguen las divididas por `split_payments`
  (no por el valor), así que el cambio `'other' → 'mixed'` no las afecta.
- El cierre **offline** ya calculaba bien (desde `cash_movements`, que siempre se
  guardaron divididos); el bug estaba solo en la RPC online.
- Recibos y PDF muestran el desglose por `split_payments`, no el valor crudo.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `hooks/useSales.ts` | `payment_method = 'mixed'` para divididas; tipo extendido |
| `hooks/useOfflineSync.ts` | `syncSale`: guarda split, `'mixed'`, divide cash_movements |
| `hooks/useDashboard.ts` | expande `split_payments` en métodos de pago |
| `lib/buildEmployeeReport.ts` | normaliza métodos del split; conteo al mayor |
| `screens/SalesScreen.tsx` | badge "Efectivo + Transferencia"; etiqueta `mixed` |
| `screens/PublicReceiptScreen.tsx` | etiqueta `mixed → Mixto` |
| `App.tsx` | encolado offline incluye split; caja local por método |
| RPC `close_cash_shift` (Supabase) | expande split en `sales_by_method` y totales |
