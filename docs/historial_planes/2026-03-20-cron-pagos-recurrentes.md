# Plan de Integración: Pagos Recurrentes + Periodo de Gracia

**Objetivo:** Implementar la automatización de cobros recurrentes (Cron Job) en total armonía con el sistema de 48 horas de "Periodo de Gracia" que ya existe actualmente en la aplicación Frontend.
**Arquitectura:** Supabase Edge Functions + `pg_cron` (Backend) cooperando con `AuthContext.tsx` y `GracePeriodBanner.tsx` (Frontend).

## 🧩 Análisis del Estado Actual (Cómo funciona tu App hoy)

He revisado tu base de código (`AuthContext.tsx` y `GracePeriodBanner.tsx`) y encuentro que tu lógica de frontend está **increíblemente bien diseñada**, operando así:
1. Una vez la fecha `current_period_end` es sobrepasada, la variable `hasActiveSubscription` del usuario **sigue siendo `true`** durante 48 horas extra.
2. Durante esas 48 horas, aparece un Banner Amarillo advirtiendo al usuario que su cuenta venció y que tiene 1 o 2 días de gracia. Ese banner se puede desechar (Ocultar) y vuelve a aparecer al día siguiente.
3. Precisamente en la hora 49, `hasActiveSubscription` se vuelve `false` y el usuario queda totalmente bloqueado de su negocio, redirigiéndolo violentamente a la pantalla de planes.

## ⚙️ Cómo Acoplar los Pagos Automáticos a esto (La Armonía Perfecta)

El objetivo es no tocar apenas el Frontend porque ya funciona perfecto. Todo el flujo se controlará en la nube con un **Robot Cobrador Diario (Edge Function)**. 

El Edge function se configurará para despertar todos los días a las 12:00 AM y correrá la siguiente lógica sobre cada suscripción vencida:

### Escenario A: Usuario CON Tarjeta Guardada (Pago Recurrente Activo)
1. **Día 0 (Vencimiento):** El robot intenta cobrar la mensualidad contra Wompi usando el token guardado.
   - **Si el banco Acepta:** El robot extiende la fecha `current_period_end` un mes en la base de datos. *Resultado:* El cliente amanece feliz, nunca ve el banner de advertencia ni sufre interrupciones.
   - **Si el banco Rechaza (ej. no tiene saldo):** El robot registra una factura fallida pero **no suspende** la cuenta. Solo deja la fecha quieta. *Resultado:* El cliente se despierta el Día 1, su React App nota que la fecha venció ayer, y le salta el banner amarillo "Tu suscripción ha vencido, tienes 2 días...".
2. **Día 1 (24 horas después):** El robot despierta e intenta cobrar *nuevamente* a la tarjeta por si el cliente ya recargó dinero. 
3. **Día 2 (48 horas después):** Último intento silencioso del robot.
4. **Día 3 (72 horas):** El robot despierta, nota que el cliente tuvo 3 rebotes bancarios y ya pasaron las 48h de gracia permitidas por el Front. El robot cambia el `status` en Supabase de `active` a `canceled`. *Resultado:* El cliente queda bloqueado permanentemente hasta que ponga una tarjeta nueva.

### Escenario B: Usuario SIN Tarjeta Guardada (Pagó Manualmente con PSE/Nequi/Efectivo)
1. **Día 0 (Vencimiento):** El robot despierta, ve que la cuenta venció, pero se da cuenta que **no hay tarjeta**. El robot simplemente lo ignora y *"no hace nada"*.
2. **Días 1 y 2:** Como el robot no renovó la fecha, el Frontend empieza a asustar al cliente lícitamente mostrándole el Banner Amarillo exigiendo el pago. El cliente puede ocultarlo u oprimir "Renovar" (que lo lleva al Widget manual de PSE).
3. **Día 3:** El robot se da cuenta de que la suscripción de este usuario sin tarjeta ya sobrepasó sus 48hrs de gracia y sigue sin pagar manual. El robot altera el estado a `canceled`. Bloqueo total.

---

## 🛠 Plan de Implementación Técnica (Paso a Paso)

Para llevar esta armonía a la realidad, debemos ejecutar las siguientes tareas puramente enfocadas en el Backend:

### Tarea 1: Creación de Edge Function `process-renewals`
- Utilizar Supabase CLI para generar la estructura `supabase/functions/process-renewals`.
- Escribir en Typescript/Deno la lógica de cobro: 
  - Consultar en BD `WHERE current_period_end <= NOW() AND status IN ('active', 'trial')`.
  - Diferenciar los que tienen `payment_source_id` y lanzar POST request a la API privada de Wompi Producción.
  - Insertar `subscription_invoices` como éxito o fracaso, y mutar la suscripción.
  - Suspender a status `canceled` aquellos que superaron los días de tolerancia definidos.

### Tarea 2: Habilitación de Cron Job en la BD (`pg_cron`)
- Entrar al SQL Editor del MCP de Supabase.
- Configurar el horario del trigger activando la extensión nativa.
```sql
select cron.schedule('renovaciones_diarias', '0 1 * * *', 
  $$ select net.http_post(url:='https://[PROYECTO].supabase.co/functions/v1/process-renewals', headers:='{"Authorization": "Bearer [SERVICE_KEY]"}') $$
);
```

### Tarea 3: Modificación Menor en Frontend (Re-activar y Pulir el UI)
- En `SubscriptionManagementScreen.tsx`, descomentar el switch oscuro ("Renovar automáticamente") y hacer que este lea y altere de forma real la preferencia del usuario en la base de datos (por si un usuario tiene tarjeta ingresada pero **apaga** el swtich de renovaciones automáticas).
- Mostrar un estado de error en el Historial de Pagos visual para que el usuario sea consciente de sus rebotes bancarios recientes si está en Periodo de Gracia.

---
**¿Estás listo para que comience a escribir la lógica de la Tarea 1 en el proyecto local?**
