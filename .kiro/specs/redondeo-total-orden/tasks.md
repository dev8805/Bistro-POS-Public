# Implementation Plan: Redondeo del Total de la Orden

## Overview

Este plan corrige el redondeo del total de las ventas siguiendo el flujo de bugfix exploratorio: primero se reproduce el bug sobre la función SIN corregir, luego se aplica el fix y finalmente se valida que el bug quedó resuelto sin romper el comportamiento existente.

El fix es quirúrgico: redefinir la función SQL `recalculate_order_total()` en Supabase (proyecto ref `hjjmwipqquynjopkswvu`) cambiando únicamente la línea del total a `total = round(GREATEST(0, v_subtotal - coalesce(discount, 0) + coalesce(tax, 0)) / 50) * 50`. No se modifica el código de la app (`useSales.ts` y `useOfflineSync.ts` ya redondean bien) ni se recalculan retroactivamente órdenes de turnos cerrados.

Como el defecto vive en la base de datos, las pruebas se ejecutan con SQL directo contra el proyecto Supabase. **Regla crítica:** verificar el estado real de la BD con MCP (`list_tables`, `list_migrations`) antes y después de cualquier cambio, porque los archivos locales en `supabase/` están desincronizados.

## Task Dependency Graph

```
Tarea 1 (prueba de condición del bug — sobre código SIN corregir)
Tarea 2 (pruebas de preservación — sobre código SIN corregir)
   │        │
   └────┬───┘
        ▼
Tarea 3 (aplicar el fix + verificaciones)
        │
        ▼
Tarea 4 (checkpoint — todas las pruebas pasan)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Pruebas sobre el codigo SIN corregir: exploracion del bug (debe fallar) y preservacion (debe pasar). Se pueden ejecutar en paralelo."
    },
    {
      "wave": 2,
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"],
      "description": "Aplicar la migracion del trigger corregido y verificar fix, preservacion, cascada a pagos y sincronizacion local."
    },
    {
      "wave": 3,
      "tasks": ["4"],
      "description": "Checkpoint final: confirmar que todas las pruebas pasan."
    }
  ]
}
```

## Tasks

- [ ]* 1. Escribir la prueba de condición del bug (exploración, ANTES del fix)
  - **Property 1: Bug Condition** - Total sin redondear tras el recálculo del trigger
  - **IMPORTANTE**: Escribir esta prueba basada en propiedades ANTES de aplicar el fix.
  - **CRÍTICO**: Esta prueba DEBE FALLAR sobre el código sin corregir; la falla confirma que el bug existe. NO intentes arreglar la prueba ni la función cuando falle.
  - **NOTA**: Esta prueba codifica el comportamiento esperado; validará el fix cuando pase después de la implementación.
  - **Enfoque PBT acotado**: para este bug determinista, acotar la propiedad a los casos concretos que fallan (importes no múltiplos de 50) para asegurar reproducibilidad.
  - Sobre la función `recalculate_order_total()` SIN corregir: crear una orden e insertar un `order_item` cuyo `total_price` no sea múltiplo de 50 (ej. `4662`), dejar que el trigger `on_order_item_change` recalcule y consultar `orders.total`.
  - Aserción esperada del comportamiento correcto: `orders.total = round(GREATEST(0, subtotal - coalesce(discount,0) + coalesce(tax,0)) / 50) * 50` (ej. `4650`).
  - Ejecutar la prueba sobre el código SIN corregir.
  - **RESULTADO ESPERADO**: la prueba FALLA — `orders.total` queda en `4662` en vez de `4650` (esto es correcto: prueba que el bug existe).
  - Documentar los contraejemplos hallados (ej. "item total_price=4662 → orders.total=4662 en vez de 4650"; "7525 → 7525 en vez de 7550") para entender la causa raíz (el trigger sobrescribe sin redondear).
  - Marcar la tarea como completa cuando la prueba esté escrita, ejecutada y la falla documentada.
  - _Requirements: 1.1, 1.2, 2.1_

- [ ]* 2. Escribir las pruebas de preservación (ANTES del fix)
  - **Property 2: Preservation** - Órdenes ya redondeadas y subtotal sin cambios
  - **IMPORTANTE**: Seguir la metodología de observación primero (observation-first).
  - Observar el comportamiento sobre el código SIN corregir para entradas que NO cumplen la condición del bug (`isBugCondition` retorna `false`):
    - Observar: item `total_price = 8000` (ya múltiplo de 50) → `orders.total = 8000`.
    - Observar: en todos los casos `orders.subtotal` = suma de `total_price` de los ítems con `status != 'canceled'` (sin redondear).
  - Escribir pruebas basadas en propiedades que capturen esos patrones observados (de la sección Preservation Requirements del diseño): para todo total ya múltiplo de 50, el valor no cambia; y el `subtotal` nunca se redondea.
  - El enfoque basado en propiedades genera muchos casos automáticamente para dar garantías más fuertes de que el comportamiento no cambió.
  - Ejecutar las pruebas sobre el código SIN corregir.
  - **RESULTADO ESPERADO**: las pruebas PASAN (confirma el comportamiento base a preservar).
  - Marcar la tarea como completa cuando las pruebas estén escritas, ejecutadas y pasando sobre el código sin corregir.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Fix para el redondeo del total en `recalculate_order_total()`

  - [ ] 3.1 Aplicar la migración del trigger corregido
    - Antes de tocar nada, verificar el estado real de la BD con MCP (`list_tables`, `list_migrations`) — los archivos locales en `supabase/` están desincronizados.
    - Redefinir la función SQL `recalculate_order_total()` cambiando ÚNICAMENTE la línea del total a: `total = round(GREATEST(0, v_subtotal - coalesce(discount, 0) + coalesce(tax, 0)) / 50) * 50`.
    - Conservar idéntico el cálculo de `v_subtotal` y de `subtotal` (el subtotal NO se redondea).
    - NO modificar el código de la app (`useSales.ts` y `useOfflineSync.ts` ya redondean correctamente).
    - NO ejecutar ningún `UPDATE` masivo sobre órdenes existentes (los turnos cerrados conservan su total).
    - Aplicar vía `apply_migration` del MCP de Supabase con nombre `redondeo_total_orden_a_50_en_recalculate_order_total`.
    - _Bug_Condition: isBugCondition(orden) donde orden.total <> round((subtotal - discount + tax) / 50) * 50_
    - _Expected_Behavior: orders.total = round(GREATEST(0, subtotal - discount + tax) / 50) * 50 tras el recálculo_
    - _Preservation: órdenes ya redondeadas no cambian; subtotal/discount/tax se calculan igual_
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ] 3.2 Verificar que la prueba de condición del bug ahora pasa
    - **Property 1: Expected Behavior** - Total redondeado a 50 tras el recálculo
    - **IMPORTANTE**: Re-ejecutar la MISMA prueba de la Tarea 1 — NO escribir una prueba nueva.
    - Casos a verificar sobre la función corregida:
      - `4662` → `4650` (venta por peso no múltiplo, orden #1694).
      - `7525` (punto medio) → `7550`.
      - `8000` (ya múltiplo de 50) → `8000` (no cambia).
      - Descuento mayor al subtotal → `total = 0` (no negativo, gracias a `GREATEST(0, ...)`).
    - **RESULTADO ESPERADO**: la prueba PASA (confirma que el bug quedó resuelto).
    - _Requirements: 2.1, 2.4_

  - [ ] 3.3 Verificar que las pruebas de preservación siguen pasando
    - **Property 2: Preservation** - Órdenes ya redondeadas y subtotal sin cambios
    - **IMPORTANTE**: Re-ejecutar las MISMAS pruebas de la Tarea 2 — NO escribir pruebas nuevas.
    - Confirmar que las órdenes cuyo total ya es múltiplo de 50 no cambian y que `subtotal`, `discount` y `tax` se calculan igual que antes del fix.
    - **RESULTADO ESPERADO**: las pruebas PASAN (confirma que no hay regresiones).
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 3.4 Verificar la cascada del total redondeado hacia los pagos
    - **Property 3: Preservation** - Consistencia del total propagado a pagos
    - Sobre una orden sin pagos divididos, tras el recálculo verificar que `sync_order_total_to_payments()` propaga el total YA redondeado a `cash_movements.amount` (movimiento `sale`) y a `client_transactions.amount` (transacción `debt`).
    - Confirmar que total mostrado, total pagado y el reporte de cierre de turno coinciden con el efectivo realmente cobrado.
    - No se modifica `sync_order_total_to_payments()`; se beneficia automáticamente del total ya corregido.
    - _Requirements: 2.3_

  - [ ] 3.5 Sincronizar la migración con los archivos locales
    - Ejecutar `supabase migration fetch` para traer la migración recién aplicada a los archivos locales en `supabase/` (que estaban desincronizados).
    - Verificar con `list_migrations` (MCP) que la migración `redondeo_total_orden_a_50_en_recalculate_order_total` figura como aplicada en la BD.
    - _Requirements: 2.1_

- [ ] 4. Checkpoint - Asegurar que todas las pruebas pasan
  - Confirmar que la prueba de condición del bug (Tarea 1) ahora PASA y que las pruebas de preservación (Tarea 2) siguen PASANDO.
  - Verificar el flujo online (`createOrder`) y el flujo offline (`syncSale`) end-to-end: el total redondeado coincide en ambos caminos.
  - Confirmar que las órdenes de turnos cerrados anteriores al fix conservan su total original (no se recalcularon).
  - Ante cualquier duda o resultado inesperado, consultar al usuario antes de continuar.
  - _Requirements: 2.1, 2.2, 2.3, 3.4_

## Notes

- **Alcance del fix**: solo cambia una línea dentro de `recalculate_order_total()`. No toca el código de la app ni recalcula datos históricos.
- **Regla crítica de Supabase**: nunca asumir el estado de la BD a partir de los archivos locales; verificar siempre con MCP (`list_tables`, `list_migrations`, `list_edge_functions`) antes y después del cambio.
- **Pruebas opcionales (`*`)**: las Tareas 1 y 2 son pruebas basadas en propiedades marcadas como opcionales. La 1 debe FALLAR sobre el código sin corregir (confirma el bug); la 2 debe PASAR sobre el código sin corregir (fija la línea base a preservar).
- **Redondeo de punto medio**: `round()` de PostgreSQL sobre `numeric` redondea el punto medio hacia arriba (ej. `7525 → 7550`), consistente con el múltiplo de 50 más cercano esperado por el negocio.
- **Idempotencia**: aplicar el recálculo dos veces sobre una orden ya redondeada no cambia el valor, porque `round(round(x/50)*50 / 50)*50 = round(x/50)*50`.
- **Rollback**: si el fix causara problemas, revertir es tan simple como restaurar la línea original `total = v_subtotal - coalesce(discount, 0) + coalesce(tax, 0)` mediante una nueva migración.
