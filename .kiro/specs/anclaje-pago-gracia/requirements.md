# Requirements Document

## Introduction

Esta funcionalidad, **Anclaje de Pago con Gracia**, ajusta la forma en que el webhook de pagos de Wompi decide la fecha ancla (`anchor`) desde la cual se cuenta el nuevo periodo de una suscripción tras un pago aprobado.

Hoy la función pura `resolveAnchor` (dentro de la edge function `wompi-webhook`) ancla el nuevo periodo en `MAX(now, current_period_end)`: si la suscripción sigue vigente, ancla en la fecha de fin de vigencia; si ya venció, ancla en el momento del pago (`now`). El problema es que un negocio que paga con un pequeño atraso (por ejemplo, la tarjeta se cobró unas horas después de vencer) pierde esos días, porque el nuevo periodo empieza a contar desde `now` en vez de desde el fin de vigencia anterior.

La solución adoptada (Opción A) introduce una **Ventana de Gracia** de 48 horas: si la suscripción venció hace 48 horas o menos, el nuevo periodo se ancla igual en `current_period_end` (el negocio no pierde días); si venció hace más de 48 horas, se ancla en `now` (comportamiento actual). El alcance de esta funcionalidad se limita exclusivamente a la función `resolveAnchor` del `wompi-webhook`. La edge function `process-renewals` queda **fuera de alcance** y conserva su comportamiento actual sin cambios.

## Glossary

- **Resolutor_De_Anclaje**: función pura `resolveAnchor` dentro del módulo `supabase/functions/wompi-webhook/periods.ts`, responsable de calcular la fecha ancla del nuevo periodo a partir de la suscripción previa y del momento del pago.
- **Anclaje**: fecha (`Date`) que devuelve el Resolutor_De_Anclaje y desde la cual se cuenta el nuevo periodo del plan.
- **now**: momento del pago aprobado, recibido por el Resolutor_De_Anclaje como parámetro.
- **current_period_end**: fecha de fin de vigencia de la suscripción previa (`sub.current_period_end`). Puede ser `null` o inexistente.
- **Suscripción_Previa**: fila de suscripción (`sub`) que existe antes de aplicar el pago. Puede ser `null` cuando el negocio no tiene suscripción registrada.
- **Ventana_De_Gracia**: intervalo de 48 horas contado hacia atrás desde `now`. Una Suscripción_Previa vencida cuya `current_period_end` cae dentro de este intervalo conserva el anclaje en `current_period_end`.
- **Suscripción_Vigente**: Suscripción_Previa cuya `current_period_end` es estrictamente posterior a `now`.
- **Suscripción_Vencida**: Suscripción_Previa cuya `current_period_end` es anterior o igual a `now`.
- **process-renewals**: edge function independiente de renovaciones, explícitamente fuera del alcance de esta funcionalidad.

## Requirements

### Requisito 1

**Historia de Usuario:** Como negocio con suscripción aún vigente, quiero que un pago adelantado extienda mi periodo desde el fin de mi vigencia actual, para no perder los días que todavía tengo pagados.

#### Criterios de Aceptación

1.1. WHEN el Resolutor_De_Anclaje recibe una Suscripción_Vigente, THE Resolutor_De_Anclaje SHALL devolver como Anclaje el valor de `current_period_end`.

1.2. WHERE `current_period_end` es estrictamente posterior a `now`, THE Resolutor_De_Anclaje SHALL tratar la Suscripción_Previa como Suscripción_Vigente.

### Requisito 2

**Historia de Usuario:** Como negocio que pagó con un atraso menor a dos días, quiero que mi nuevo periodo se ancle en el fin de mi vigencia anterior, para no perder los días de ese atraso.

#### Criterios de Aceptación

2.1. WHEN el Resolutor_De_Anclaje recibe una Suscripción_Vencida cuya `current_period_end` está dentro de la Ventana_De_Gracia, THE Resolutor_De_Anclaje SHALL devolver como Anclaje el valor de `current_period_end`.

2.2. THE Ventana_De_Gracia SHALL abarcar el intervalo comprendido entre `now` menos 48 horas y `now`.

2.3. WHEN la diferencia entre `now` y `current_period_end` es igual a 48 horas exactas, THE Resolutor_De_Anclaje SHALL considerar la `current_period_end` dentro de la Ventana_De_Gracia y devolverla como Anclaje.

### Requisito 3

**Historia de Usuario:** Como plataforma, quiero anclar el nuevo periodo en el momento del pago cuando la suscripción venció hace más de dos días o no existe, para evitar regalar tiempo a suscripciones abandonadas.

#### Criterios de Aceptación

3.1. WHEN el Resolutor_De_Anclaje recibe una Suscripción_Vencida cuya `current_period_end` es anterior al inicio de la Ventana_De_Gracia, THE Resolutor_De_Anclaje SHALL devolver como Anclaje el valor de `now`.

3.2. IF la Suscripción_Previa es `null`, THEN THE Resolutor_De_Anclaje SHALL devolver como Anclaje el valor de `now`.

3.3. IF la Suscripción_Previa existe pero `current_period_end` es `null` o inexistente, THEN THE Resolutor_De_Anclaje SHALL devolver como Anclaje el valor de `now`.

### Requisito 4

**Historia de Usuario:** Como responsable del cálculo de periodos, quiero que la resolución del anclaje sea determinista y sin efectos secundarios, para poder probarla y confiar en su resultado.

#### Criterios de Aceptación

4.1. THE Resolutor_De_Anclaje SHALL calcular el Anclaje únicamente a partir de la Suscripción_Previa y de `now` recibidos como parámetros.

4.2. WHEN el Resolutor_De_Anclaje recibe los mismos valores de Suscripción_Previa y `now`, THE Resolutor_De_Anclaje SHALL devolver siempre el mismo Anclaje.

4.3. THE Resolutor_De_Anclaje SHALL devolver el Anclaje como un valor de tipo `Date` sin modificar la Suscripción_Previa recibida.

### Requisito 5

**Historia de Usuario:** Como mantenedor del sistema de pagos, quiero que el cambio se limite a la lógica de anclaje del `wompi-webhook`, para no alterar otros flujos de facturación.

#### Criterios de Aceptación

5.1. THE Anclaje de Pago con Gracia SHALL modificar únicamente la lógica del Resolutor_De_Anclaje dentro de `supabase/functions/wompi-webhook`.

5.2. THE Anclaje de Pago con Gracia SHALL conservar sin cambios el comportamiento de la edge function process-renewals.

5.3. THE Anclaje de Pago con Gracia SHALL conservar sin cambios la cantidad de meses a extender calculada por `resolvePeriodMonths`.
