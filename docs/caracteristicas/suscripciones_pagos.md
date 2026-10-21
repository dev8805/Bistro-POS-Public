# Suscripciones y Pagos

Componentes: `screens/SubscriptionManagementScreen.tsx`, `screens/SubscriptionPlansScreen.tsx`, `components/modals/UpgradeProModal.tsx`  
Hooks: `hooks/usePlanFeatures.ts`, `hooks/useCustomPlan.ts`, `hooks/useGracePeriodStatus.ts`  
Pasarela de pagos: **Wompi** (Colombia)  
Edge Functions: `generate-payment-signature`, `manage-promo-codes`, `wompi-webhook`  
Tablas BD: `business_subscriptions`, `subscription_plans`, `subscription_invoices`, `payment_sources`, `promo_codes`

Módulo que controla el acceso al sistema mediante suscripción de pago. Es la puerta de entrada económica: sin suscripción activa, el negocio no puede usar la app. Ver [`autenticacion_acceso.md`](./autenticacion_acceso.md) para el ciclo de vida de la suscripción en el login.

---

## Catálogo de Planes Oficiales

Bistro cuenta con dos niveles de suscripción con ciclos de facturación **Mensual** y **Trimestral** (con 15% de descuento en ciclo trimestral):

| Plan | Ciclo | Precio (COP) | Equivalente / mes | Enfoque |
|---|---|---|---|---|
| **Plan Estándar** | Mensual | $45.000 | $45.000 | Mostrador, retail, servicios y ventas rápidas |
| **Plan Estándar** | Trimestral | $115.000 | ~$38.333 | Ahorro trimestral en operaciones base |
| **Plan Pro** *(Recomendado)* | Mensual | $69.000 | $69.000 | Restaurantes, bares, control de mesas y comandas |
| **Plan Pro** *(Recomendado)* | Trimestral | $175.000 | ~$58.333 | -15% de ahorro para operaciones completas |

> [!NOTE]
> **Planes Personalizados (`assigned_business_id IS NOT NULL`)**: Si un negocio tiene asignado un plan custom en la base de datos, este plan tiene prioridad absoluta sobre el catálogo público, cuenta con acceso Pro total y su monto se respeta de acuerdo al acuerdo comercial directo.

---

## Dos Pantallas, Dos Roles

| Pantalla | Propósito |
|---|---|
| `SubscriptionPlansScreen` | Pantalla de **adquisición**: selección de ciclo (Mensual/Trimestral), comparación de Plan Estándar vs Pro, inicio de trial de 7 días y pago directo vía Wompi. Se muestra a negocios sin suscripción activa o tras finalizar la prueba. |
| `SubscriptionManagementScreen` | Pantalla de **gestión**: ver estado actual, historial de facturas, métodos de pago y cambio de plan. Solo accesible con suscripción existente. |

`SubscriptionManagementScreen` embebe `SubscriptionPlansScreen` en un iframe/contenedor dentro de la pestaña "Planes", lo que permite cambiar o renovar sin salir de la pantalla de gestión.

---

## Flujos de `SubscriptionPlansScreen`

La pantalla cuenta con selector dinámico de ciclo (Mensual / Trimestral con badge `-15% Ahorro`) y los siguientes estados (`flowStep`):

| Estado | Descripción |
|---|---|
| `plans` | Vista comparativa de Plan Estándar vs Plan Pro |
| `trial_started` | Pantalla de bienvenida tras activar el trial de 7 días |
| `payment_success` | Confirmación tras pago aprobado por Wompi |
| `payment_pending` | Aviso de pago en proceso (PSE/Nequi/Bancolombia) |
| `promo_success` | Bienvenida tras canjear código promocional |

### Flujo 1: Trial Gratuito (primer acceso, 7 días con acceso Pro completo)
```
[Usuario nuevo sin suscripción]
       ↓
handleStartTrial() → upsert en business_subscriptions
   status: 'trial'
   current_period_end: now + 7 días
       ↓
flowStep = 'trial_started' → pantalla de bienvenida
```
Durante los 7 días de prueba, el usuario disfruta de acceso completo a **todas** las funcionalidades de Plan Pro. Un negocio solo puede usar el trial **una vez**.

### Flujo 2: Pago Directo vía Widget Wompi (Sin formularios intermedios)
Al presionar "Elegir Plan" o "Renovar" en cualquiera de los planes:
```
[Usuario selecciona Plan Estándar o Plan Pro]
       ↓
handleOpenWompiWidget(plan):
  1. generateSignature (Edge Function) → firma criptográfica HMAC-SHA256 del monto y referencia
  2. new window.WidgetCheckout({ ... }) → abre el widget popup oficial de Wompi
  3. Métodos soportados en Wompi: Tarjeta de crédito/débito, PSE, Nequi, Botón Bancolombia
  4. Callback:
     - APPROVED → handlePaymentApproved():
         · Registra/actualiza business_subscriptions con status: 'active'
         · Inserta subscription_invoices con el wompi_transaction_id
         · checkSubscription() refresca el estado en AuthContext
         · flowStep = 'payment_success'
     - PENDING → flowStep = 'payment_pending' (espera a confirmación bancaria o webhook)
```

### Flujo 3: Desbloqueo Post-Trial (Fin de los 7 días)
Cuando vence el periodo de prueba de 7 días:
- **Empleados sin permiso `admin_settings`**: Ven la pantalla de bloqueo indicando que deben notificar al administrador.
- **Administrador / Dueño**: Se desbloquea automáticamente hacia `SubscriptionPlansScreen` con un banner informativo: *"Tu periodo de prueba de 7 días ha terminado. Elige tu plan para continuar facturando."*, permitiéndole elegir su plan y pagar inmediatamente vía Wompi para reactivar el sistema.

---

## Control de Acceso por Plan (Feature Gating)

El acceso a las funcionalidades del sistema se evalúa de manera centralizada mediante el hook `usePlanFeatures`:

```ts
// hooks/usePlanFeatures.ts
const isStandard = !isTrial && !hasCustomPlan && (
    planNameLower.includes('estándar') || planNameLower.includes('estandar')
);
const isPro = !isStandard;
```

### Reglas de Acceso:
* **En Trial (7 días)**: Acceso Pro ilimitado (`isPro = true`).
* **Planes Personalizados**: Acceso Pro ilimitado (`isPro = true`).
* **Plan Pro (Mensual / Trimestral)**: Acceso Pro ilimitado (`isPro = true`).
* **Plan Estándar**: Acceso base; las funciones avanzadas se señalan con una insignia dorada `PRO`. Al hacer clic, se intercepta la navegación y se despliega `UpgradeProModal` invitando a actualizar.

### Matriz de Diferenciación de Funcionalidades:

| Característica | Plan Estándar | Plan Pro | Comportamiento en Plan Estándar |
|---|---|---|---|
| **Ventas en Mostrador / Orden Rápida** | ✅ Incluido | ✅ Incluido | Operación normal |
| **Control de Caja y Turnos** | ✅ Incluido | ✅ Incluido | Operación normal |
| **Catálogo Retail y Servicios** | ✅ Incluido | ✅ Incluido | Operación normal |
| **Escaneo de Facturas con IA** (Compras/Gastos) | ✅ Incluido | ✅ Incluido | Operación normal con cámara y galería |
| **Escaneo de Ventas en Papel con IA** | ✅ Incluido | ✅ Incluido | Operación normal |
| **Usuarios y Empleados** | ⚠️ Máximo 3 | ♾️ Ilimitados | Banner contador `(X/3)`. Si se intenta crear un 4to usuario, abre `UpgradeProModal`. |
| **Mapa de Salones y Mesas** | 🔒 Exclusivo Pro | ✅ Incluido | Badge `PRO` en selector y pestaña de mesas. Clic abre `UpgradeProModal`. |
| **Comandas a Cocina y Barra** | 🔒 Exclusivo Pro | ✅ Incluido | Badge `PRO` en flujo de comanda. |
| **Recetas y Deducción de Insumos** | 🔒 Exclusivo Pro | ✅ Incluido | Badge `PRO` en pestaña y menú de creación. Intercepta apertura de formulario. |
| **Combos y Promociones Automáticas** | 🔒 Exclusivo Pro | ✅ Incluido | Badge `PRO` en pestaña y menú de creación. Intercepta apertura de formulario. |
| **Auditoría y Conteo Físico de Estantes** | 🔒 Exclusivo Pro | ✅ Incluido | Badge `PRO` en menú de navegación e inicio. Pantalla de fallback con botón a planes. |
| **Evidencia Fotográfica en la Nube** | 🔒 Exclusivo Pro | ✅ Incluido | Badge `PRO` en `EvidenceUploader`. Botones de cámara/galería abren `UpgradeProModal`. |
| **Soporte Prioritario** | Normal | ⚡ Prioritario | Canal directo de atención preferencial |

---

## Componente `UpgradeProModal`

Ubicación: `components/modals/UpgradeProModal.tsx`

Modal didáctico con estética ámbar/dorada que educa al usuario cuando intenta interactuar con una herramienta Pro:
- Icono de corona dorada y badge superior `FUNCIÓN DE PLAN PRO`.
- Título dinámico (`featureName`) y descripción orientada a beneficios reales para el negocio (`featureDescription`).
- Copy didáctico: *"Desde solo $58.333 COP/mes en ciclo trimestral"*.
- Botón de acción directo *"Ver Planes y Actualizar"* que redirige al usuario a `SubscriptionPlansScreen`.

---

## Estados de Suscripción

| Status en BD | Label en UI | Color | Cuenta como activa (gracia 48h) |
|---|---|---|---|
| `trial` | "Prueba gratuita de 7 días" | Azul | Sí (acceso Pro total) |
| `active` | "Activo" | Verde | Sí |
| `past_due` | "Vencido" | Amarillo | Sí (transitorio, tolera 48h antes de bloquear) |
| `canceled` | "Cancelado" | Rojo | No (cancelación explícita, bloqueo inmediato) |

El período de gracia de **48 horas** tras vencimiento se maneja en `AuthContext.checkSubscription`, no en esta pantalla. Aplica tanto a `active`/`trial` recién vencidos como a `past_due` (cuando el edge function `process-subscriptions` marca vencido por falta de tarjeta o cobro fallido). Ver [`autenticacion_acceso.md`](./autenticacion_acceso.md).

---

## "Plan Pruebas Internas"

Existe un plan oculto en la BD llamado `'Plan Pruebas Internas'`. Está filtrado en `fetchPlans()` para que no aparezca en el selector de la UI, pero los negocios que tienen ese plan activo lo ven renombrado como `'Promocional'` en el `SubscriptionManagementScreen`:

```ts
const displayPlanName = subscription.plan.name === 'Plan Pruebas Internas'
  ? 'Promocional'
  : subscription.plan.name;
```

---

## Regla especial — Menú "Suscripciones" oculto excepto para el 10000

Solo el negocio con `public_id = '10000'` (UUID `1e64bb14-27fc-4f76-8470-29e17253423f`, "Tienda de la Esquina", negocio de pruebas del dueño) ve la opción "Suscripciones" en el sidebar y en el sheet de perfil móvil.

Todos los demás negocios (existentes o creados a futuro) NO ven ese punto de entrada. Motivo: los planes se van a definir manualmente por negocio, así que el flujo de autogestión desde el menú queda inactivo mientras tanto.

**Puntos afectados:**

| Archivo | Punto de entrada oculto |
|---|---|
| `components/Sidebar.tsx` | Botón "Mi Suscripción" en menú móvil y desktop |
| `screens/HomeScreen.tsx` | Botón "Mi Suscripción" en sheet de perfil móvil |

La condición se centraliza en `lib/specialBusinesses.ts` (`canSeeSubscriptionMenu`). En cada botón se combina con `isBusinessOwner` para que ni siquiera el owner del 10000 lo vea si no es dueño.

Ocultar el menú no cierra las rutas: `SubscriptionPlansScreen` y `SubscriptionManagementScreen` siguen accesibles por deep link, por el botón "Renovar ahora" del `GracePeriodBanner`, por el redirect post-registro, y por el bloqueo por vencimiento de `App.tsx` (que aún aplica a los negocios sin excepción).

---

## Regla especial — Negocio 10001 (precios ocultos)

El negocio con `public_id = '10001'` (UUID `9ab00944-b41b-47bd-b595-9aaea024d777`, constante `HIDDEN_PRICES_BUSINESS_ID` en `lib/specialBusinesses.ts`) **no ve costos ni precios** en superficies no autorizadas. El pago y la renovación se hacen vía Wompi con su plan personalizado (ver sección "Plan Personalizado" más abajo).

**Línea de tiempo al vencer** (mismo patrón que cualquier negocio con plan personalizado):

| Estado | Comportamiento |
|---|---|
| Suscripción activa | App normal, sin banner |
| Vencida en gracia (0–48 h) | App normal + banner de gracia con botón "Pagar" (admin) o solo aviso (cajero); mesero no ve nada |
| Vencida fuera de gracia (> 48 h) | Admin: `CustomPlanBlockedScreen` con `CustomPlanCard` y botón "Pagar ahora". Empleado sin `admin_settings`: pantalla "contacta a soporte" (fallback). |

Es una regla de producto documentada en `.kiro/steering/suscripciones.md` y aplicada en:

**Condición usada en el código:**
```tsx
profile?.business_id === '9ab00944-b41b-47bd-b595-9aaea024d777'
```

Cuando la condición es `true`, cada monto visible se reemplaza por `'—'` o texto neutro (`'Plan activo'`, `'Activado'`).

**Puntos de aplicación (verificados en código):**

| Pantalla | Ubicación | Qué se oculta |
|---|---|---|
| `SubscriptionPlansScreen.tsx` | Línea 485 | Precio en el modal de checkout ("`—`" en lugar del monto mensual) |
| `SubscriptionPlansScreen.tsx` | Línea 697 | Monto en la pantalla de confirmación de pago ("`Activado`" en lugar del precio) |
| `SubscriptionPlansScreen.tsx` | Líneas 856-859 | Precio y sufijo en las tarjetas de plan ("`—`" sin `/mes`/`/año`) |
| `SubscriptionManagementScreen.tsx` | Línea 489 | Resumen del plan activo (`"Plan activo"` en lugar de `$X/mes`) |
| `SubscriptionManagementScreen.tsx` | Líneas 566, 610 | Columna "Monto" en tablas de facturas ("`—`") |
| `SubscriptionManagementScreen.tsx` | Línea 641 | Aviso de próximo pago (fecha sin monto) |

**Al modificar cualquier flujo de suscripciones, verificar** si el cambio afecta un lugar donde se muestra monto y aplicar la misma condición para este negocio. La regla `.kiro/steering/suscripciones.md` pide **avisar al usuario** antes de aplicar la condición automáticamente en código nuevo.

---

## Plan Personalizado (feature 2026-07-24)

Componentes nuevos:
- `hooks/useCustomPlan.ts` — deriva `hasCustomPlan` desde `subscription.plan.assigned_business_id === profile.business_id`.
- `components/CustomPlanCard.tsx` — card presentacional con monto en COP y botón "Pagar ahora" oculto si `!canPay`.
- `components/CustomPlanBlockedScreen.tsx` — pantalla de bloqueo fuera de gracia con `CustomPlanCard` + "Cerrar sesión".
- `lib/customPlanCheckout.ts` — helper compartido que abre el widget Wompi y aplica el pago idempotente (`applyCustomPlanPayment`).

BD:
- `subscription_plans.assigned_business_id uuid NULL REFERENCES businesses(id)`: si es NOT NULL, el plan es personalizado y solo lo lee ese negocio (RLS).
- Índice único parcial `subscription_plans_one_active_custom_per_business` garantiza máximo 1 plan personalizado activo por negocio.
- Índice único parcial `subscription_invoices_unique_wompi_tx` sobre `wompi_transaction_id` para idempotencia (una misma tx no puede aplicarse dos veces; código 23505 = ya aplicado).
- Policy RLS `Plans visible by ownership`: `assigned_business_id IS NULL OR assigned_business_id = get_user_business_id()`. Reemplaza a la vieja `Plans are viewable by everyone`.

Firma nueva de `canSeeSubscriptionMenu`:

```ts
canSeeSubscriptionMenu(businessId, hasCustomPlan, hasAdminSettings)
```

- Solo admins con `admin_settings` la ven.
- El negocio 10000 la ve siempre (legado).
- Cualquier otro negocio la ve si tiene plan personalizado.
- Empleados (Cajero, Mesero) nunca la ven.

Flujo del pago (idempotente, con polling PENDING):

```
Widget Wompi → APPROVED → applyCustomPlanPayment
                             ├─ INSERT subscription_invoices con wompi_transaction_id
                             ├─ (si 23505 → alreadyProcessed = true, sin tocar suscripción)
                             └─ UPDATE business_subscriptions
                                    · current_period_end = MAX(current_period_end, now) + 1 mes
                                    · status = 'active'

Widget Wompi → PENDING → polling 5s × 60 intentos (5 min) → APPROVED/DECLINED/TIMEOUT
                        · APPROVED → mismo callback que arriba
                        · DECLINED → toast, sin tocar BD
                        · TIMEOUT  → toast "El pago sigue en verificación..."
```

El polling se cancela con AbortController si el componente que abrió el checkout se desmonta.

### Webhook de Wompi (fix del pago async)

La edge function `wompi-webhook` (`verify_jwt: false`) recibe eventos `transaction.updated` de Wompi y aplica el pago aprobado a la BD cuando el cliente no alcanza a hacerlo (polling PENDING agotado, usuario cerró navegador, pago en corresponsal con 72 h).

Verificación de firma HMAC-SHA256:
```
hash = sha256(concat(signature.properties.map(getByPath(payload.data))) + timestamp + WOMPI_EVENTS_SECRET)
if hash !== signature.checksum → 401
```

Configuración necesaria en Supabase:
- Secret `WOMPI_EVENTS_SECRET`: se obtiene del dashboard de Wompi en "Configuración → Eventos" (NO usar el secret de "Integridad").
- El env var `SUPABASE_SERVICE_ROLE_KEY` viene ya provisto por la runtime de Supabase.

Configuración en Wompi:
- Registrar en el dashboard el endpoint:
  `https://hjjmwipqquynjopkswvu.supabase.co/functions/v1/wompi-webhook`
- Activar el evento `transaction.updated`.

Lookup del negocio a partir de la `reference`:
- La reference tiene formato `custom-<business_id_first_8>-<timestamp>` (ver `openCustomPlanCheckout`).
- El webhook trae todos los planes con `assigned_business_id IS NOT NULL` y hace match en JS del prefijo de 8 chars contra `assigned_business_id`. Luego trae la subscription del negocio dueño por `eq('business_id', ...)`.
- **No** usar `.filter('business_id::text', 'ilike', ...)`: PostgREST no acepta cast `::text` en el nombre de columna del filter y devuelve `operator does not exist: uuid ~~* unknown` con 500. Ese bug rompía el webhook silenciosamente y el pago quedaba sin aplicar aunque Wompi lo hubiera aprobado.

Idempotencia:
- El webhook y el polling cliente pueden aplicar el mismo pago. El índice único parcial `subscription_invoices_unique_wompi_tx` provoca error `23505` en el segundo intento; ambos flujos lo atrapan y retornan `alreadyProcessed=true` sin duplicar.

Polling cliente:
- Se aumentó de 60 s (12 × 5 s) a 5 minutos (60 × 5 s) para cubrir la mayoría de flujos Botón Bancolombia / PSE / Nequi sin esperar al webhook.
- Casos donde el polling no alcanza (usuario cerró navegador, corresponsal con 72 h): los cubre el webhook.

### Correo del pagador (opcional en el widget)

Wompi acepta `customerData.email` como parámetro **opcional** del Widget Checkout. Si no lo pasamos, el widget de Wompi le pide el correo al usuario en su propia vista "Insert your contact information" antes de procesar.

Bistro lo trata así:

| Superficie | Comportamiento si no hay correo real |
|---|---|
| `GracePeriodBanner` "Pagar" | Abre el widget sin `customerData.email`; Wompi lo pide dentro |
| `CustomPlanBlockedScreen` (App.tsx) | Igual — la pantalla de bloqueo NO da acceso al perfil, así que forzar a configurar correo antes sería un callejón sin salida |
| `CustomPlanCard` en tab Planes (`SubscriptionManagementScreen`) | Igual — abre el widget sin `customerData.email`, Wompi lo pide dentro |
| `SubscriptionPlansScreen` | Modal previo que pide el correo (patrón preexistente) |

"Correo real" = cualquier correo que NO termine en `@bistro.temp` (correos sintéticos generados para cuentas creadas por SMS OTP, ver `lib/formatters.ts` → `getRealEmail` / `isPlaceholderEmail`).

En `openCustomPlanCheckout` la firma es `customerEmail?: string` (opcional). Si el llamador pasa `undefined`, el helper omite el campo del objeto `customerData` que envía al widget.

### Retorno al comercio (`redirectUrl`)

Al abrir el widget, `openCustomPlanCheckout` pasa `redirectUrl: window.location.href` a `WidgetCheckout`. Sirve para dos cosas:

1. **Pagos con redirect (PSE, Botón Bancolombia)**: Wompi redirige al banco, y al volver el usuario cae exactamente en la pantalla desde donde arrancó el checkout (Suscripciones, banner de gracia, o `CustomPlanBlockedScreen`).
2. **Botón "Regresar al Comercio"** en la pantalla de comprobante de Wompi: sin este parámetro el botón no sabía adónde volver y el usuario quedaba atascado en el comprobante de Wompi.

### Toast post-pago (`usePostPaymentToast`)

Al aprobarse el pago se muestra un toast "¡Gracias por tu pago! Tu suscripción está activa. Sigue disfrutando de Bistro." (5 s, con botón X para cerrar antes).

Hay dos caminos que llegan al toast:

**Camino A · pago inline (tarjeta, Nequi, QR)**: el widget se cierra en la misma pestaña y ejecuta el callback `onApproved` del helper. El helper llama al `showToast` directamente y borra el flag de sessionStorage.

**Camino B · pago con redirect (PSE, Botón Bancolombia)**: el navegador sale de la app. Al volver, la app se re-monta y el callback JS ya no existe. Para no perder el toast:

- Antes de abrir el widget, `openCustomPlanCheckout` escribe un flag en `sessionStorage` (`bistro:pendingPaymentToast`) con `{reference, businessId, ts}`.
- El hook `usePostPaymentToast()` (montado en `AppContent`) lo detecta al montar:
  - Si `hasActiveSubscription = true`: dispara toast + limpia flag.
  - Si aún no está activa (webhook aún no aplicó): polling breve 10 × 3 s = 30 s revalidando `checkSubscription`. Cuando pasa a activa → toast + limpia flag.
  - Si el polling se agota: el flag persiste hasta que otro mount lo detecte o hasta que expire.
- El flag caduca a los 30 minutos para evitar toasts fantasma.

**Anti-loop garantizado por:**
- `firedRef` (memoria) evita disparos múltiples en la misma sesión JS.
- `clearPaymentFlag()` borra el flag en el momento de disparar el toast, no después. Una recarga (F5) posterior no encuentra flag y no vuelve a mostrarlo.
- El hook compara `flag.businessId === profile.business_id`: si otro usuario abre sesión en la misma pestaña, no ve el toast ajeno.

Archivos:
- `lib/paymentToastFlag.ts` — helpers `markPaymentInProgress`, `clearPaymentFlag`, `readPaymentFlag`.
- `hooks/usePostPaymentToast.ts` — hook que dispara el toast al montar la app.
- `context/ToastContext.tsx` — `showToast(message, type, duration, description?)` acepta descripción opcional.
- `components/AppToast.tsx` — X como botón real (con `aria-label="Cerrar notificación"`), el body ya no cierra al hacer click.

Matriz de rol × superficie:

| Rol/Superficie      | Sidebar "Suscripciones" | Banner gracia | Botón "Pagar" | Fuera de gracia    |
|---------------------|-------------------------|---------------|---------------|--------------------|
| Admin (10001)       | ✅                       | ✅             | ✅             | UI de pago         |
| Admin (10000)       | ✅                       | ✅             | Renovar ahora | Catálogo público   |
| Cajero (10001)      | ❌                       | ✅ sin botón   | ❌             | Contacta a soporte |
| Mesero (10001)      | ❌                       | ❌             | ❌             | Contacta a soporte |
| Admin de otro biz   | ❌                       | ✅             | Renovar ahora | Catálogo público   |

Superficies que muestran el monto del plan personalizado (excepciones autorizadas a la Regla_Precios_Ocultos):
- Pestaña "Planes" de `SubscriptionManagementScreen` (via `CustomPlanCard`).
- Pantalla de bloqueo fuera de gracia (via `CustomPlanBlockedScreen`).
- Widget de Wompi al pagar.

Todas las demás superficies (Resumen, Pagos, Historial, banner de gracia) mantienen "—" o "Plan activo".

---

## Lo que NO puede hacer

- **No hay autorenovación automática**: el toggle de "Renovación automática" existe en el código pero está **comentado** con la nota `*Pendiente de implementación en backend`. El negocio debe renovar manualmente antes de que venza.
- **No hay descarga de facturas**: el botón de descarga fue removido de la UI hasta que se implemente. No hay generación de PDF por factura por el momento.
- **No hay cancelación de suscripción desde la UI**: no hay botón para cancelar. Si el negocio quiere cancelar, debe contactar soporte.
- **No hay notificación de próximo vencimiento**: la pantalla muestra la fecha del próximo cobro solo si el status es `trial`, no para suscripciones activas.

---

## Inconsistencias y Notas

> [!NOTE]
> **El código promocional se puede canjear en `localStorage` sin estar autenticado**: si alguien guarda `pending_promo_code` en el `localStorage` del navegador antes de que el perfil cargue y luego inicia sesión, el código se canjea automáticamente. Esto es diseño intencional para el flujo de registro con código, pero cualquier valor en `localStorage` bajo esa clave se intentará canjear, incluyendo valores corruptos o maliciosos. La Edge Function de canje sí valida el código, pero el intento siempre se ejecutará.
