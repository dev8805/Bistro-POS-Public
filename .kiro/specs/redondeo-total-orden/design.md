# Documento de Diseño: Redondeo del Total de la Orden

## Overview

Este diseño corrige el cálculo del total de las ventas en Bistro POS. En Colombia no existen denominaciones menores a $50, por lo que el total de cada venta debe quedar redondeado al múltiplo de $50 más cercano: `total = round((subtotal − descuento + impuesto) / 50) * 50`.

La aplicación ya redondea correctamente el total tanto en la venta online (`createOrder()` en `hooks/useSales.ts`) como en la venta offline (`syncSale()` en `hooks/useOfflineSync.ts`). El problema es que, **después** de que la app inserta la orden con el total ya redondeado, un trigger de base de datos recalcula el total a partir de los ítems y lo sobrescribe **sin redondear**. El valor sin redondear es el que finalmente se persiste, se muestra al cliente y se propaga a los pagos y al reporte de cierre de turno.

El fix es mínimo y quirúrgico: modificar únicamente la línea del total dentro de la función SQL `recalculate_order_total()` para que aplique el mismo redondeo a 50 que ya usa la app. No se toca el cálculo de subtotal, ni el de descuento/impuesto, ni el código de la aplicación (que ya coincide con el fix). Tampoco se recalculan retroactivamente ventas de turnos ya cerrados.

### Glosario

- **Bug_Condition (C):** condición que dispara el bug — una orden cuyo `total` persistido no es igual a `round((subtotal − descuento + impuesto) / 50) * 50`.
- **Property (P):** comportamiento deseado — tras cualquier recálculo, el `total` persistido debe estar redondeado al múltiplo de 50 más cercano.
- **Preservation:** las órdenes cuyo total ya está redondeado a 50 no deben cambiar de valor; el subtotal, descuento e impuesto se siguen calculando igual.
- **`recalculate_order_total()`:** función SQL (SECURITY DEFINER) ejecutada por el trigger `on_order_item_change` sobre `order_items`; recalcula `subtotal` y `total` de la orden a partir de sus ítems.
- **`on_order_item_change`:** trigger AFTER INSERT/UPDATE/DELETE en `order_items` que invoca `recalculate_order_total()`.
- **`sync_order_total_to_payments()`:** función SQL ejecutada por el trigger `on_order_total_update_sync_payments` (AFTER UPDATE en `orders`); propaga el `total` a `cash_movements` y `client_transactions` cuando no hay pagos divididos.
- **Redondeo a 50:** `round(valor / 50) * 50`, ajuste al múltiplo de $50 más cercano.

### Condición del Bug

El bug se manifiesta cuando se inserta, edita o elimina un ítem de una orden cuyo total (subtotal − descuento + impuesto) no cae exactamente en un múltiplo de 50. El trigger `on_order_item_change` recalcula el total y lo persiste sin aplicar el redondeo a 50, sobrescribiendo el valor correcto que la app había guardado.

**Especificación formal:**
```
FUNCTION isBugCondition(orden)
  INPUT: orden con campos { subtotal, discount, tax, total } de tipo numeric
  OUTPUT: boolean

  RETURN orden.total <> round((orden.subtotal - coalesce(orden.discount, 0) + coalesce(orden.tax, 0)) / 50) * 50
END FUNCTION
```

### Ejemplos

- Producto "Cebolla cabezona" por peso: 2,59 kg × $1.800 = $4.662. Esperado: `round(4662 / 50) * 50 = 4650`. Actual (con bug): $4.662 persistido. Verificado en la orden #1694.
- Venta de $10.021 sin descuento ni impuesto. Esperado: `round(10021 / 50) * 50 = 10000`. Actual: $10.021.
- Venta de $7.525 (punto medio). Esperado: `round(7525 / 50) * 50 = 7550`. Actual: $7.525.
- Caso borde correcto: venta de $8.000 (ya múltiplo de 50). Esperado y actual: $8.000 — no debe cambiar.

## Architecture

### Flujo actual (con el bug)

```
App (createOrder / syncSale)
  total = Math.round(Math.max(0, subtotal - discount) / 50) * 50   ✅ redondeado
        │
        ▼
  INSERT orders (total redondeado)  ── e INSERT order_items
                                          │
                                          ▼
                        trigger on_order_item_change (AFTER I/U/D)
                                          │
                                          ▼
                        recalculate_order_total()
                          total = v_subtotal - discount + tax       ❌ SIN redondear
                                          │
                                          ▼
                        UPDATE orders.total  → sobrescribe el valor correcto
                                          │
                                          ▼
                        trigger on_order_total_update_sync_payments (AFTER UPDATE)
                                          │
                                          ▼
                        sync_order_total_to_payments()
                          propaga total (sin redondear) a
                          cash_movements y client_transactions       ❌ importe inconsistente
```

El defecto está en una sola línea de `recalculate_order_total()`: el total se calcula como `v_subtotal - discount + tax` sin redondeo. Como el trigger corre AFTER del INSERT de la app, el valor redondeado de la app siempre queda sobrescrito.

### Flujo corregido

```
recalculate_order_total()
  total = round(GREATEST(0, v_subtotal - discount + tax) / 50) * 50   ✅ redondeado a 50
        │
        ▼
  UPDATE orders.total (redondeado)
        │
        ▼
  sync_order_total_to_payments() propaga el total redondeado a pagos  ✅ consistente
```

### Cascada hacia pagos y cierre de turno

Al corregir el total dentro del trigger, el `UPDATE orders.total` dispara `on_order_total_update_sync_payments`, que ejecuta `sync_order_total_to_payments()`. Esta función, cuando la orden **no** tiene `split_payments`, actualiza:

- `cash_movements.amount` (movimiento de tipo `sale` asociado a la orden).
- `client_transactions.amount` (transacción de tipo `debt` asociada a la orden).

Como el `total` que llega ya viene redondeado, la propagación entrega el mismo valor redondeado a los pagos. De este modo, el total mostrado, el total pagado y el reporte de cierre de turno (que agrega `cash_movements` y ventas por método de pago) quedan consistentes entre sí. No se requiere ningún cambio adicional en `sync_order_total_to_payments()`; se beneficia automáticamente del total ya corregido.

### Alcance del cambio (comportamiento futuro únicamente)

La migración solo redefine la función `recalculate_order_total()`. Cambia el comportamiento de futuros recálculos disparados por el trigger. **No** ejecuta ningún `UPDATE` masivo sobre órdenes existentes, por lo que las ventas de turnos ya cerrados anteriores al fix conservan su total tal como quedaron registradas (requisito 3.4).

## Components and Interfaces

### Componente afectado: `recalculate_order_total()`

- **Ubicación:** base de datos Supabase (proyecto ref `hjjmwipqquynjopkswvu`), esquema `public`.
- **Tipo:** función `plpgsql`, `SECURITY DEFINER`, retorna `trigger`.
- **Invocada por:** trigger `on_order_item_change` en `order_items` (AFTER INSERT/UPDATE/DELETE).

**Definición actual verificada en la BD (F — con bug):**
```sql
CREATE OR REPLACE FUNCTION public.recalculate_order_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
declare
  v_subtotal numeric;
begin
  select coalesce(sum(total_price), 0) into v_subtotal
  from public.order_items
  where order_id = coalesce(new.order_id, old.order_id) and status != 'canceled';

  update public.orders
  set subtotal = v_subtotal,
      total = v_subtotal - coalesce(discount, 0) + coalesce(tax, 0)   -- ❌ sin redondeo
  where id = coalesce(new.order_id, old.order_id);

  return coalesce(new, old);
end;
$function$;
```

**Definición corregida (F' — fix):** solo cambia la línea del `total`. El cálculo de `v_subtotal` y de `subtotal` se conserva idéntico.
```sql
update public.orders
set subtotal = v_subtotal,
    total = round(GREATEST(0, v_subtotal - coalesce(discount, 0) + coalesce(tax, 0)) / 50) * 50   -- ✅
where id = coalesce(new.order_id, old.order_id);
```

- El `GREATEST(0, ...)` evita totales negativos, alineado con el `Math.max(0, ...)` de la app.
- El redondeo aplica solo al total final; `subtotal` sigue guardándose sin redondear.

### Interfaz de aplicación (NO se modifica)

Estas funciones ya calculan el total redondeado y coinciden con el fix. Se documentan solo para dejar constancia de que el comportamiento del trigger debe ser consistente con ellas:

- `hooks/useSales.ts` → `createOrder()`: `total = Math.round(Math.max(0, subtotal - discount) / 50) * 50`.
- `hooks/useOfflineSync.ts` → `syncSale()`: mismo cálculo, para la venta offline sincronizada.

### Componente en cascada: `sync_order_total_to_payments()` (NO se modifica)

Se dispara con el `UPDATE orders.total` del trigger corregido y propaga el total (ya redondeado) a `cash_movements` y `client_transactions` cuando la orden no tiene pagos divididos. No requiere cambios.

### Aplicación de la migración

El cambio se aplica mediante `apply_migration` del MCP de Supabase, con un nombre descriptivo (ej. `redondeo_total_orden_a_50_en_recalculate_order_total`). Se debe verificar el estado real de la BD con MCP antes y después (los archivos locales en `supabase/` están desincronizados).

## Data Models

Tabla `public.orders` (columnas relevantes, verificadas en la BD):

| Columna | Tipo | Nullable | Default | Rol en el fix |
|---------|------|----------|---------|---------------|
| `subtotal` | `numeric` | YES | `0` | Suma de `total_price` de los ítems no cancelados. **No se redondea.** |
| `discount` | `numeric` | YES | `0` | Descuento. Sin cambios. |
| `tax` | `numeric` | YES | `0` | Impuesto. Sin cambios. |
| `total` | `numeric` | YES | `0` | Valor a redondear: `round(GREATEST(0, subtotal − discount + tax) / 50) * 50`. |

Tabla `public.order_items`: fuente del recálculo. Se suma `total_price` de los ítems con `status != 'canceled'`. Sin cambios estructurales.

Modelos afectados por la cascada (sin cambios estructurales):

- `public.cash_movements` — `amount` del movimiento `sale` se sincroniza con `orders.total`.
- `public.client_transactions` — `amount` de la transacción `debt` se sincroniza con `orders.total`.

## Error Handling

- **Totales negativos:** si `subtotal − descuento + impuesto < 0` (por descuentos mayores al subtotal), `GREATEST(0, ...)` fuerza el total a `0` antes de redondear, evitando importes negativos. Coincide con el `Math.max(0, ...)` de la app.
- **Valores nulos:** `discount` y `tax` pueden ser `NULL`; se usa `coalesce(..., 0)`. `v_subtotal` usa `coalesce(sum(...), 0)`, por lo que una orden sin ítems válidos produce `total = 0`.
- **Redondeo de punto medio:** `round()` de PostgreSQL sobre `numeric` usa redondeo bancario/half-away según tipo; con `numeric` redondea el punto medio hacia arriba (ej. `round(151/50)=round(3.02)=3` → 150; `round(175/50)=round(3.5)=4` → 200), consistente con el comportamiento esperado del negocio (múltiplo de 50 más cercano).
- **Idempotencia:** aplicar el trigger varias veces sobre una orden ya redondeada no cambia el valor, porque `round(round(x/50)*50 / 50)*50 = round(x/50)*50`.
- **Datos históricos:** la migración no toca órdenes existentes; no hay riesgo de alterar reportes de turnos ya cerrados.

## Correctness Properties

### Property 1: Bug Condition — Total redondeado a 50 tras el recálculo

*Para cualquier* orden cuya condición de bug se cumple (`isBugCondition` retorna `true`, es decir el total actual no es múltiplo de 50 correcto), tras ejecutarse el trigger `on_order_item_change` con la función corregida, el `orders.total` persistido DEBERÁ ser igual a `round(GREATEST(0, subtotal − discount + tax) / 50) * 50`.

**Validates: Requirements 2.1, 2.2, 2.4**

### Property 2: Preservation — Órdenes ya redondeadas y subtotal sin cambios

*Para cualquier* orden cuya condición de bug NO se cumple (`isBugCondition` retorna `false`, el total ya es el múltiplo de 50 correcto), la función corregida DEBERÁ producir el mismo `total` que la función original, y en todos los casos el `subtotal`, `discount` y `tax` se calculan y persisten exactamente igual que antes del fix.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 3: Preservation — Consistencia del total propagado a pagos

*Para cualquier* orden sin pagos divididos cuyo total se recalcula, el valor propagado por `sync_order_total_to_payments()` a `cash_movements.amount` y `client_transactions.amount` DEBERÁ ser exactamente el `orders.total` redondeado, de modo que total mostrado, total pagado y reporte de cierre de turno coincidan.

**Validates: Requirements 2.3**

## Testing Strategy

### Enfoque de validación

Estrategia en dos fases: primero reproducir el bug sobre el código sin corregir (contraejemplo), luego verificar que el fix redondea correctamente y preserva el comportamiento existente. Como el defecto vive en la BD, las pruebas se ejecutan con SQL directo contra el proyecto Supabase (o un branch de desarrollo).

### Exploratory Bug Condition Checking

**Objetivo:** exhibir el contraejemplo que demuestra el bug ANTES del fix y confirmar la causa raíz (el trigger sobrescribe sin redondear).

**Plan:** sobre la función SIN corregir, crear una orden e insertar un `order_item` cuyo `total_price` no sea múltiplo de 50 (ej. 4.662), dejando que el trigger recalcule, y consultar `orders.total`.

**Casos:**
1. **Venta por peso no múltiplo:** item `total_price = 4662` → se espera observar `orders.total = 4662` (falla en código sin fix; debería ser 4650).
2. **Punto medio:** item `total_price = 7525` → se observa 7525 (debería ser 7550).
3. **Total ya redondeado:** item `total_price = 8000` → se observa 8000 (correcto; no debe cambiar).

**Contraejemplo esperado:** `orders.total` queda igual al valor sin redondear, confirmando que `recalculate_order_total()` no aplica el redondeo a 50.

### Fix Checking

**Objetivo:** para toda orden donde se cumple la condición del bug, la función corregida produce el total redondeado.

**Pseudocódigo:**
```
FOR ALL orden WHERE isBugCondition(orden) DO
  result := recalculate_order_total_fixed(orden)
  ASSERT result.total = round(GREATEST(0, orden.subtotal - orden.discount + orden.tax) / 50) * 50
END FOR
```

### Preservation Checking

**Objetivo:** para toda orden donde NO se cumple la condición del bug, la función corregida produce el mismo resultado que la original; y el subtotal nunca se redondea.

**Pseudocódigo:**
```
FOR ALL orden WHERE NOT isBugCondition(orden) DO
  ASSERT recalculate_order_total_original(orden).total = recalculate_order_total_fixed(orden).total
END FOR
FOR ALL orden DO
  ASSERT recalculate_order_total_fixed(orden).subtotal = sum(items.total_price WHERE status != 'canceled')
END FOR
```

**Enfoque recomendado:** pruebas basadas en propiedades (property-based) porque generan muchos casos automáticamente sobre el dominio de importes y capturan casos borde (puntos medio, totales que ya son múltiplos de 50, descuentos que superan el subtotal).

### Unit Tests

- Insertar item cuyo `total_price` no es múltiplo de 50 y verificar que `orders.total` queda redondeado (ej. 4662 → 4650).
- Insertar item cuyo total ya es múltiplo de 50 y verificar que no cambia (8000 → 8000).
- Editar/eliminar un item y verificar que el recálculo re-aplica el redondeo (requisito 2.4).
- Descuento mayor al subtotal: verificar `total = 0` (no negativo).

### Property-Based Tests

- **Propiedad de la condición del bug (Property 1):** generar órdenes con `total_price` aleatorio (incluyendo no múltiplos de 50), insertar el item, disparar el trigger y verificar que `orders.total = round(GREATEST(0, subtotal − discount + tax) / 50) * 50`.
- **Preservación (Property 2):** generar órdenes cuyo total ya es múltiplo de 50 y verificar que el valor no cambia; verificar en todos los casos que `subtotal` es la suma exacta de los ítems (sin redondear).
- **Idempotencia:** aplicar el recálculo dos veces y verificar que el total no cambia en la segunda pasada.

### Integration Tests

- Flujo online completo (`createOrder`): registrar una venta por peso no múltiplo de 50 y verificar que el total mostrado y persistido es el redondeado.
- Flujo offline (`syncSale`): registrar offline, sincronizar y verificar que el total redondeado coincide con el flujo online (requisito 2.2).
- Cascada a pagos (Property 3): verificar que `cash_movements.amount` y `client_transactions.amount` reflejan el total redondeado tras la venta.
- Reporte de cierre de turno: verificar que el consolidado por método de pago cuadra con el efectivo cobrado tras el fix.
- Regresión histórica: confirmar que órdenes de turnos cerrados anteriores al fix conservan su total original (no se recalculan).
