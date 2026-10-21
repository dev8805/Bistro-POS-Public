# Documento de Diseño: Anclaje de Pago con Gracia

## Overview

El **Anclaje de Pago con Gracia** cambia una única regla dentro de la función pura `resolveAnchor` del módulo `supabase/functions/wompi-webhook/periods.ts`. Esa función decide desde qué fecha (`anchor`) empieza a contar el nuevo periodo de una suscripción tras un pago aprobado.

Comportamiento actual:

```
anchor = MAX(now, current_period_end)
```

Es decir, si la suscripción venció (aunque sea por unas horas), el nuevo periodo se ancla en `now` y el negocio pierde esos días de atraso.

Comportamiento propuesto (Opción A — Ventana de Gracia de 48 horas):

```
Si la suscripción está vigente               → anchor = current_period_end
Si venció hace 48 h o menos (gracia)         → anchor = current_period_end
Si venció hace más de 48 h                   → anchor = now
Si no hay suscripción o no hay fecha de fin  → anchor = now
```

El objetivo es no castigar a un negocio que paga con un atraso pequeño, sin regalar tiempo a suscripciones abandonadas.

El alcance está deliberadamente acotado: solo se modifica `resolveAnchor`. No se tocan `resolvePeriodMonths`, la edge function `process-renewals`, ni ningún otro flujo de facturación.

Diagrama de decisión:

```
                 resolveAnchor(sub, now)
                          │
        ┌─────────────────┴─────────────────┐
        │ ¿sub existe y tiene                │
        │  current_period_end válido?        │
        └───────┬───────────────────┬────────┘
             NO │                   │ SÍ
                ▼                   ▼
            anchor = now      currentEnd vs now
                          ┌─────────┴──────────┐
                          │ currentEnd > now?  │ (vigente)
                          └───┬────────────┬───┘
                           SÍ │            │ NO (vencida)
                              ▼            ▼
                    anchor=currentEnd   now - currentEnd <= 48 h ?
                                         ┌────────┴─────────┐
                                      SÍ │                  │ NO
                                         ▼                  ▼
                               anchor=currentEnd       anchor = now
                               (dentro de gracia)   (fuera de gracia)
```

## Architecture

La funcionalidad vive por completo en la capa de lógica pura del webhook. No hay cambios en la capa de I/O (Deno/Supabase) ni en el resto del handler.

```
┌──────────────────────────────────────────────────────────┐
│  supabase/functions/wompi-webhook/                         │
│                                                            │
│   index.ts  (handler, I/O, Supabase)   ← SIN CAMBIOS       │
│      │  llama a                                            │
│      ▼                                                     │
│   periods.ts  (lógica pura, sin imports Deno/Supabase)     │
│      ├─ parseReference        ← SIN CAMBIOS                │
│      ├─ resolvePeriodMonths   ← SIN CAMBIOS                │
│      ├─ addMonths             ← SIN CAMBIOS                │
│      └─ resolveAnchor         ← ÚNICO CAMBIO               │
│           + GRACE_ANCHOR_HOURS = 48 (nueva constante)      │
└──────────────────────────────────────────────────────────┘
              ▲
              │ import directo (sin Deno)
              │
┌─────────────┴────────────────────────────────────────────┐
│  tests (vitest en el repo)                                 │
│   periods.test.ts  → tests unitarios + property tests      │
└────────────────────────────────────────────────────────────┘
```

Razones de este diseño:

- `periods.ts` ya está aislado de Deno y Supabase precisamente para poder testearlo con vitest desde el repo. El cambio aprovecha ese aislamiento.
- Al mantener la firma `resolveAnchor(sub, now)` intacta, `index.ts` no requiere ningún ajuste.
- La constante `GRACE_ANCHOR_HOURS` se exporta para que los tests puedan referenciarla y para dejar explícito el parámetro de negocio.

## Components and Interfaces

### Constante `GRACE_ANCHOR_HOURS`

Nueva constante exportada que define el tamaño de la ventana de gracia en horas.

```typescript
/** Ventana de gracia (en horas) para conservar el anclaje en current_period_end
 *  cuando la suscripción venció recientemente. */
export const GRACE_ANCHOR_HOURS = 48;
```

### Función `resolveAnchor` (modificada)

Firma sin cambios; solo cambia la regla interna.

```typescript
/**
 * Ancla el nuevo periodo:
 *   · Suscripción vigente (currentEnd > now)      → currentEnd
 *   · Vencida dentro de la gracia (<= 48 h)       → currentEnd
 *   · Vencida fuera de la gracia (> 48 h)         → now
 *   · Sin suscripción o sin current_period_end    → now
 * Función pura: no muta `sub` y depende solo de sus parámetros.
 */
export const resolveAnchor = (sub: SubRow | null, now: Date): Date => {
    const currentEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
    if (!currentEnd) return now;

    // Vigente: el fin de vigencia es posterior a now.
    if (currentEnd > now) return currentEnd;

    // Vencida: medir cuánto hace que venció.
    const graceMs = GRACE_ANCHOR_HOURS * 60 * 60 * 1000;
    const elapsedMs = now.getTime() - currentEnd.getTime();

    // Dentro de la gracia (borde de 48 h exactas incluido) → conservar currentEnd.
    return elapsedMs <= graceMs ? currentEnd : now;
};
```

Puntos clave:

- El caso "vigente" (`currentEnd > now`) devuelve `currentEnd` igual que antes (compatibilidad con el comportamiento previo para suscripciones activas).
- El borde de 48 h exactas usa `<=`, por lo que se considera **dentro** de la gracia (Requisito 2.3).
- La función crea un `new Date` a partir del string, nunca modifica `sub` (Requisito 4.3).
- No hay lecturas de reloj internas ni estado externo: todo depende de `sub` y `now` (Requisitos 4.1, 4.2).

### Interfaz `SubRow` (sin cambios)

Se reutiliza la interfaz existente; el diseño solo consume `current_period_end`.

```typescript
export interface SubRow {
    id: string;
    business_id: string;
    plan_id: string | null;
    status: string | null;
    current_period_end: string | null;
}
```

### Integración con el handler (sin cambios)

`index.ts` sigue llamando `resolveAnchor(sub, now)` y luego `addMonths(anchor, resolvePeriodMonths(plan, sub))`. La cantidad de meses no cambia (Requisito 5.3).

## Data Models

No hay cambios de esquema ni de base de datos. El diseño opera sobre estructuras en memoria ya existentes.

| Elemento | Tipo | Origen | Uso en `resolveAnchor` |
|----------|------|--------|------------------------|
| `sub` | `SubRow \| null` | Fila de suscripción previa | Puede ser `null`; se lee solo `current_period_end` |
| `sub.current_period_end` | `string \| null` | Columna ISO de la suscripción | Se convierte a `Date`; si es `null` → ancla en `now` |
| `now` | `Date` | Momento del pago aprobado | Referencia para vigencia y ventana de gracia |
| `GRACE_ANCHOR_HOURS` | `number` (const = 48) | Constante del módulo | Define la duración de la ventana de gracia |
| retorno (`anchor`) | `Date` | Calculado | Fecha desde la que se cuenta el nuevo periodo |

Modelo temporal de la decisión:

```
   pasado                                                    futuro
 ────┬───────────────┬───────────────────┬───────────────────►
     │               │                   │
  currentEnd     now - 48h              now
 (muy viejo)   (inicio gracia)      (momento pago)

  currentEnd < now-48h        → anchor = now         (fuera de gracia)
  now-48h <= currentEnd <= now → anchor = currentEnd  (dentro de gracia)
  currentEnd > now             → anchor = currentEnd  (vigente)
```

## Error Handling

`resolveAnchor` es total: para cualquier combinación de entradas devuelve siempre un `Date` válido, sin lanzar excepciones.

| Entrada anómala | Comportamiento | Requisito |
|-----------------|----------------|-----------|
| `sub === null` | Devuelve `now` | 3.2 |
| `sub` existe pero `current_period_end === null` | Devuelve `now` | 3.3 |
| `current_period_end` string no parseable | `new Date(...)` produce `Invalid Date`; toda comparación con `>` y `<=` es `false`, por lo que cae en el camino "vencida fuera de gracia" → devuelve `now`. No se lanza excepción. | 3.3 (defensivo) |
| `now` es `Invalid Date` | Fuera de contrato: el handler siempre provee un `now` válido. La función no valida `now` para mantenerse pura y simple. | — |

Nota de diseño: no se agregan validaciones extra sobre `now` porque el único llamador (`index.ts`) construye `now` a partir del payload verificado. Añadir defensas ahí quedaría fuera del alcance y complicaría una función que debe permanecer mínima.

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema; es una afirmación formal sobre lo que el sistema debe hacer. Las propiedades son el puente entre la especificación legible por humanos y las garantías de correctitud verificables por máquina.*

### Property 1: Suscripción vigente ancla en el fin de vigencia

*Para cualquier* `now` y cualquier suscripción cuyo `current_period_end` sea estrictamente posterior a `now`, `resolveAnchor` devuelve exactamente ese `current_period_end`.

**Validates: Requirements 1.1, 1.2**

### Property 2: Vencimiento dentro de la gracia ancla en el fin de vigencia

*Para cualquier* `now` y cualquier suscripción cuyo `current_period_end` caiga en el intervalo cerrado `[now - 48h, now]`, `resolveAnchor` devuelve ese `current_period_end` (incluido el borde exacto de 48 horas).

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Vencimiento fuera de la gracia ancla en el momento del pago

*Para cualquier* `now` y cualquier suscripción cuyo `current_period_end` sea anterior a `now - 48h`, `resolveAnchor` devuelve `now`.

**Validates: Requirements 3.1**

### Property 4: Sin anclaje válido, se ancla en el momento del pago

*Para cualquier* `now`, si la suscripción es `null` o su `current_period_end` es `null`/inexistente, `resolveAnchor` devuelve `now`.

**Validates: Requirements 3.2, 3.3**

### Property 5: Determinismo

*Para cualquier* par de entradas (`sub`, `now`), invocar `resolveAnchor` repetidamente con esos mismos valores produce siempre un anclaje de igual valor.

**Validates: Requirements 4.2**

### Property 6: Pureza — no mutación y tipo de retorno

*Para cualquier* `sub` y `now`, tras invocar `resolveAnchor` la suscripción recibida permanece idéntica a su estado previo, y el valor devuelto es una instancia de `Date`.

**Validates: Requirements 4.1, 4.3**

## Testing Strategy

Enfoque dual: tests basados en propiedades para la cobertura universal de la lógica pura, más tests unitarios para bordes y regresión. Se usa vitest en el repo (el mismo entorno que ya prueba `parseReference` y `resolvePeriodMonths`), con `fast-check` como librería de property-based testing.

### Property tests

- Mínimo 100 iteraciones por propiedad.
- Generadores basados en un `now` aleatorio y un `delta` en milisegundos para posicionar `current_period_end` relativo a `now` y a la ventana de gracia:
  - Vigente: `delta > 0` (futuro).
  - Dentro de gracia: `delta` en `[0, 48h]` hacia el pasado (incluye el extremo 48h).
  - Fuera de gracia: `delta > 48h` hacia el pasado.
  - Sin anclaje: `sub = null` o `current_period_end = null`.
- Cada test etiquetado con: **Feature: anclaje-pago-gracia, Property {número}: {texto}**.

Mapa de propiedades a tests:

| Propiedad | Generador | Aserción |
|-----------|-----------|----------|
| Property 1 | `now`, `current_period_end = now + delta`, `delta > 0` | resultado `===` `current_period_end` |
| Property 2 | `now`, `current_period_end = now - delta`, `0 <= delta <= 48h` | resultado `===` `current_period_end` |
| Property 3 | `now`, `current_period_end = now - delta`, `delta > 48h` | resultado `===` `now` |
| Property 4 | `sub = null` o `current_period_end = null`, `now` aleatorio | resultado `===` `now` |
| Property 5 | cualquier `sub`, `now` | dos llamadas dan `Date` de igual `getTime()` |
| Property 6 | cualquier `sub`, `now` | `sub` igual a snapshot previo; `result instanceof Date` |

### Tests unitarios (bordes y ejemplos)

- Borde exacto de 48 h: `current_period_end = now - 48h` → devuelve `current_period_end` (Requisito 2.3).
- Borde justo por encima: `current_period_end = now - (48h + 1ms)` → devuelve `now` (Requisito 3.1).
- `sub = null` → `now` (Requisito 3.2).
- `sub` con `current_period_end = null` → `now` (Requisito 3.3).
- Vigencia mínima: `current_period_end = now + 1ms` → devuelve `current_period_end` (Requisito 1.1).

### Regresión de alcance

- Ejecutar la suite existente de `resolvePeriodMonths` sin cambios y verificar que sigue en verde (Requisito 5.3).
- Confirmar por revisión que no se tocan `process-renewals` ni la firma pública de `resolveAnchor` (Requisitos 5.1, 5.2).
