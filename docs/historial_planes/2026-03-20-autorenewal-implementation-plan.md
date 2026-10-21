# Plan de Implementación: Renovaciones Automáticas con Wompi y Supabase

**Objetivo:** Implementar la renovación automática de suscripciones utilizando la integración de Supabase (Base de datos + Tareas programadas/Edge Functions) y Wompi (Fuentes de pago y cargos recurrentes) en la aplicación, específicamente habilitando el switch en `SubscriptionManagementScreen.tsx`.

---

## 1. Fase 0: Contexto y Análisis de la Arquitectura Actual
Basado en el análisis de `SubscriptionManagementScreen.tsx`, las documentaciones oficiales de Wompi Colombia y Supabase MCP:
- **App (Frontend):** Actualmente captura el método de pago usando el endpoint de tokenización de tarjetas de Wompi (`/v1/tokens/cards`) y lo guarda en la tabla `payment_sources` de Supabase. Existe un switch "Habilitar renovación automática" inoperativo en el UI vinculado a backend.
- **Wompi:** Tokenizar una tarjeta genera un `token` de un solo uso o temporal. Para realizar cargos automáticos a futuro **sin intervención del usuario (Merchant-Initiated Transactions)**, se requiere convertir ese token de tarjeta en una **Fuente de Pago (Payment Source)** vinculada a un **Token de Aceptación (Acceptance Token)**, o usar su API de *Suscripciones*.
- **Supabase:** Necesitamos un proceso en background (Cron job) que diariamente identifique qué suscripciones vencen hoy, tengan `auto_renew` activo (verdadero) y posean un método de pago válido (`is_default = true`), para luego ejecutar el cobro vía API de Wompi.

---

## 2. Fase de Análisis por Capas (Estilo `analizar-webapp`)

### Capa de Base de Datos (Supabase)
- **Falta un campo:** Validar o agregar el campo booleano `auto_renew` (default: false) en la tabla `business_subscriptions`.
- **Automatización:** Se debe habilitar la extensión `pg_cron` o desplegar una **Supabase Edge Function** programada mediante cron (ej. `supabase functions deploy renewals --schedule "@daily"`) para procesar cobros de forma distribuida e independiente del cliente.

### Capa de API / Red (Wompi)
- El flujo actual en `handleAddCard` solo tokeniza la tarjeta. 
- **Flujo Correcto Wompi para recurrencia:**
  1. Obtener la Aceptación Presunta (Acceptance Token) del comercio vía GET `/v1/merchants/{pub_key}`.
  2. Tokenizar la tarjeta (`/v1/tokens/cards`).
  3. Crear una **Fuente de Pago** (`/v1/payment_sources`) usando el token de tarjeta, el email del cliente y el token de aceptación. Esto devuelve un `source_id`.
  4. Guardar este `source_id` definitivo en la tabla `payment_sources` junto a los últimos 4 dígitos.
  5. Al momento de renovar, solicitar a Wompi la creación de una transacción (`/v1/transactions`) enviando el `source_id` guardado.

### Capa de Estado y UI (Frontend `SubscriptionManagementScreen.tsx`)
- **Gestión de UI:** El Checkbox de *Refinanciamiento* debe ser controlado por el estado interactuando con la prop `auto_renew` de `subscription`.
- **Validación:** No permitir activar `auto_renew` si el negocio no tiene métodos de pago (`paymentMethods.length === 0`).
- **Estado de carga:** Informar al usuario visualmente (Toast/Spinners) mientras se habilita/deshabilita la opción de auto-renovación.

---

## 3. Plan de Implementación a Nivel Código (Paso a Paso)

### Paso 1: Actualización de Esquema de BD (Supabase)
1. Ejecutar migración para añadir campo en `business_subscriptions`:
   ```sql
   ALTER TABLE business_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false;
   ```

### Paso 2: Ajustar la creación del Método de Pago (Frontend -> Wompi)
Modificar el método `handleAddCard` en `SubscriptionManagementScreen.tsx`:
1. Pedir Token de tarjeta (Existente).
2. Pedir Acceptance Token (Nuevo endpoint GET comerciante Wompi).
3. Pedir creación de **Payment Source** a Wompi enviando ambos tokens y tipo `CARD` (Nuevo endpoint POST).
4. Guardar la respuesta final (`source_id` de Wompi) en la tabla de supabase `payment_sources`.

### Paso 3: Binding en el UI del Checkbox
En `SubscriptionManagementScreen.tsx`:
1. Controlar el estado del checkbox con la lectura: `checked={subscription.auto_renew}`.
2. Crear la función `handleToggleAutoRenew`:
   - Mostrar alerta si no hay métodos de pago.
   - Si se activa, llamar a Supabase: `.from('business_subscriptions').update({ auto_renew: !oldValue }).eq('id', subscription.id)`.
   - Lanzar "Toast de éxito".
3. Eliminar la nota de "(*Pendiente de implementación en backend)".

### Paso 4: Creación de la Edge Function en Supabase (Cobros Recurrentes)
1. Programar archivo `supabase/functions/process-renewals/index.ts`.
2. Lógica interna:
   - Consultar `business_subscriptions` donde `current_period_end <= HOY` AND `auto_renew = true` AND `status = active`.
   - Iterar iterativamente por cada una:
     - Consultar método de pago `is_default=true`.
     - Hacer `POST` a `https://production.wompi.co/v1/transactions` enviando el importe de la suscripción, la monedad (`COP`) y la fuente de pago (`payment_source_id`).
   - Procesar respuesta exitosa:
     - Renovar la suscripción sumando 1 mes a `current_period_end` y `next_billing_date`.
     - Crear un nuevo registro insertado en `subscription_invoices` con estado `paid`.
   - Procesar respuesta de error:
     - Incrementar `retry_count`.
     - Si `retry_count` > MAX (Ej. 3), cambiar estado a `past_due` temporalmente o `canceled` y desactivar `auto_renew`.

### Paso 5: Despliegue y Cron Job
1. Desplegar la función a Supabase: `supabase functions deploy process-renewals`.
2. Usar la extensión `pg_cron` nativa de Supabase para dispararla de forma cronometrada a medianoche de cada día.

---

## 4. Próximos Pasos Recomendados (Listos para ejecución)
1. **Validar migración BD:** Verificar en el Schema si `auto_renew` existe en `business_subscriptions`.
2. **Implementar Flujo Completo de Fuentes de Pago:** Cambiar drásticamente cómo la app añade tarjetas para crear Sources oficiales Wompi, en vez de almacenar únicamente los tokens que expiran rápido.
3. **Activar Checkbox:** Vincular el estado en `SubscriptionManagementScreen`.
4. **Programar el Worker de Facturación:** Escribir la Edge Function y validarla en el entorno local antes de mandar a producción.

---

## 5. Análisis: Guardado de Tarjetas al Realizar un Pago (Wompi Widget)

Usando la metodología de análisis por capas, se investigó si una tarjeta utilizada para realizar un pago inicial queda guardada y listada en la pestaña "Métodos de Pago" (`SubscriptionManagementScreen.tsx`).

### Análisis de la Capa de Flujo de Pago (`SubscriptionPlansScreen.tsx`)
1. **Flujo de Pago Inmediato (`handleOpenWompiWidget` + `handlePaymentApproved`):**
   - Cuando un usuario paga un plan (ej. "Mensual") que no tiene prueba gratuita, se despliega el Wompi Widget cobrando el importe total.
   - Tras el pago exitoso, la transacción se marca en Supabase creando la factura en `subscription_invoices` y renovando el periodo, pero **NO se guarda la información de la tarjeta**.
   - **Resultado:** La tarjeta NO queda guardada en la tabla `payment_sources` ni aparece en el UI.

2. **Flujo de Trial con Tarjeta Requerida (`handleCardTrialPlan`):**
   - Si el plan requiere tarjeta (tokenización de $0), el pago se aprueba y se inserta un registro manualmente en `payment_sources`.
   - **Problema Crítico Detectado:** El código inserta `wompi_source_id: tx.id`. En Wompi, el ID de una transacción (`tx.id`) *NO* sirve como fuente de pago recurrente. Para hacer cobros automáticos posteriores necesitas un `token` de tarjeta o un verdadero Payment Source ID proporcionado por Wompi al tokenizar. 

### Conclusión y Correctorio Necesario
Actualmente, **al hacer un pago directo con tarjeta en la pantalla de planes, el método de pago no se guarda** en la vista de *Facturación y Pagos*. 

**Cómo solucionarlo (Próximos Pasos):**
- En el Wompi Widget, si queremos habilitar auto-renovación futura desde el primer pago sin que el usuario agregue manualmente la tarjeta *después*, hay que modificar el widget o el proceso. 
- La forma ideal soportada por el Wompi Widget es configurar el parámetro `customerData` guardado, o apoyarnos en las **Suscripciones de Link de Pago de Wompi**, pero dado que la app usa el Widget de checkout directo: el Widget en la actualidad no retorna el Source de Pago de forma transparente en transacciones normales. Requeriría un paso de "Guardar Tarjeta" previo al cobro real.
