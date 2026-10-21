# Implementation Plan: Anclaje de Pago con Gracia

## Overview

El plan implementa la Ventana de Gracia de 48 horas modificando exclusivamente la función pura `resolveAnchor` y agregando la constante `GRACE_ANCHOR_HOURS` en `supabase/functions/wompi-webhook/periods.ts`. Luego se cubre la lógica con tests unitarios de bordes y property tests opcionales (una por cada Correctness Property), y finalmente se redespliega la edge function `wompi-webhook` vía MCP para que el cambio quede activo en producción.

El enfoque es incremental: primero la lógica pura, luego su validación con tests, y por último el redeploy que integra el cambio en el entorno real. La firma `resolveAnchor(sub, now)` se mantiene intacta, por lo que `index.ts` no requiere modificaciones.

## Task Dependency Graph

```
Task 1 (lógica pura: GRACE_ANCHOR_HOURS + resolveAnchor)
   │
   ├─→ Task 2.1 (tests unitarios de bordes)  ── depende de 1.1
   │
   ├─→ Tasks 2.2 – 2.7 * (property tests opcionales, dependen solo de 1.1)
   │
   └─→ Task 3.1 (redeploy edge function vía MCP) ── depende de 1.1
           └─ (se recomienda tras validar Task 2.1)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1"],
      "description": "Lógica pura: agregar GRACE_ANCHOR_HOURS y modificar resolveAnchor en periods.ts"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"],
      "description": "Tests unitarios de bordes y property tests; dependen solo de la Task 1"
    },
    {
      "wave": 3,
      "tasks": ["3.1"],
      "description": "Redeploy de la edge function wompi-webhook vía MCP"
    }
  ]
}
```

## Tasks

- [x] 1. Implementar la Ventana de Gracia en la lógica pura
  - [x] 1.1 Agregar `GRACE_ANCHOR_HOURS` y modificar `resolveAnchor` en `periods.ts`
    - Exportar la constante `export const GRACE_ANCHOR_HOURS = 48;` en `supabase/functions/wompi-webhook/periods.ts`
    - Modificar `resolveAnchor(sub, now)`: si no hay `current_period_end` válido devolver `now`; si `currentEnd > now` devolver `currentEnd` (vigente); si está vencida, calcular `elapsedMs = now - currentEnd` y devolver `currentEnd` cuando `elapsedMs <= GRACE_ANCHOR_HOURS*60*60*1000` (borde de 48h incluido), o `now` en caso contrario
    - No mutar `sub`, no leer reloj interno, mantener la firma y devolver siempre un `Date`
    - No tocar `resolvePeriodMonths`, `parseReference`, `addMonths` ni `index.ts`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.3_

- [x] 2. Validar la lógica con tests
  - [x] 2.1 Escribir tests unitarios de bordes y regresión de alcance
    - Borde exacto: `current_period_end = now - 48h` → devuelve `current_period_end` (Requisito 2.3)
    - Borde por encima: `current_period_end = now - (48h + 1ms)` → devuelve `now` (Requisito 3.1)
    - `sub = null` → `now` (Requisito 3.2)
    - `sub` con `current_period_end = null` → `now` (Requisito 3.3)
    - Vigencia mínima: `current_period_end = now + 1ms` → devuelve `current_period_end` (Requisito 1.1)
    - Confirmar que la suite existente de `resolvePeriodMonths` sigue en verde (Requisito 5.3)
    - _Requirements: 1.1, 2.3, 3.1, 3.2, 3.3, 5.3_

  - [x]* 2.2 Property test — suscripción vigente ancla en fin de vigencia
    - Generar `now` aleatorio y `current_period_end = now + delta` con `delta > 0`; aseverar resultado `===` `current_period_end`; mínimo 100 iteraciones con `fast-check`
    - **Property 1: Suscripción vigente ancla en el fin de vigencia**
    - **Validates: Requirements 1.1, 1.2**

  - [x]* 2.3 Property test — vencimiento dentro de la gracia ancla en fin de vigencia
    - Generar `now` y `current_period_end = now - delta` con `0 <= delta <= 48h`; aseverar resultado `===` `current_period_end` (incluye borde de 48h); mínimo 100 iteraciones
    - **Property 2: Vencimiento dentro de la gracia ancla en el fin de vigencia**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x]* 2.4 Property test — vencimiento fuera de la gracia ancla en el momento del pago
    - Generar `now` y `current_period_end = now - delta` con `delta > 48h`; aseverar resultado `===` `now`; mínimo 100 iteraciones
    - **Property 3: Vencimiento fuera de la gracia ancla en el momento del pago**
    - **Validates: Requirements 3.1**

  - [x]* 2.5 Property test — sin anclaje válido ancla en el momento del pago
    - Generar `now` aleatorio con `sub = null` o `current_period_end = null`; aseverar resultado `===` `now`; mínimo 100 iteraciones
    - **Property 4: Sin anclaje válido, se ancla en el momento del pago**
    - **Validates: Requirements 3.2, 3.3**

  - [x]* 2.6 Property test — determinismo
    - Para cualquier par (`sub`, `now`), invocar `resolveAnchor` dos veces y aseverar igual `getTime()`; mínimo 100 iteraciones
    - **Property 5: Determinismo**
    - **Validates: Requirements 4.2**

  - [x]* 2.7 Property test — pureza (no mutación y tipo de retorno)
    - Snapshot de `sub` antes de invocar; tras `resolveAnchor` aseverar `sub` idéntico al snapshot y `result instanceof Date`; mínimo 100 iteraciones
    - **Property 6: Pureza — no mutación y tipo de retorno**
    - **Validates: Requirements 4.1, 4.3**

- [ ] 3. Desplegar el cambio
  - [ ] 3.1 Redesplegar la edge function `wompi-webhook` vía MCP
    - Usar la herramienta MCP de Supabase (`deploy_edge_function`) para redesplegar `wompi-webhook` con el `periods.ts` modificado
    - Verificar con `list_edge_functions` que la versión desplegada quedó actualizada
    - _Requirements: 5.1_

## Notes

- Las tareas marcadas con `*` (2.2 a 2.7) son property tests opcionales y pueden omitirse para un MVP más rápido; cada una corresponde a una Correctness Property del diseño.
- La tarea 2.1 (tests unitarios de bordes) NO es opcional: valida los bordes críticos de la ventana de gracia.
- `process-renewals` queda **fuera de alcance**: no se modifica ni se redespliega, conserva su comportamiento actual sin cambios (Requisito 5.2).
- La firma pública `resolveAnchor(sub, now)` no cambia, por lo que `index.ts` no requiere ajustes.
- `resolvePeriodMonths` no se toca: la cantidad de meses a extender permanece igual (Requisito 5.3).
- Se recomienda ejecutar los tests (al menos la tarea 2.1) antes del redeploy de la tarea 3.1.
