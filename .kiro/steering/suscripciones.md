---
inclusion: fileMatch
fileMatchPattern: ["**/Subscription*", "**/GracePeriodBanner*", "**/suscri*", "**/Sidebar*", "**/HomeScreen*"]
---

# Suscripciones — Reglas especiales por negocio

## Constantes centralizadas

Los UUIDs de negocios con reglas especiales están en `lib/specialBusinesses.ts`:

```ts
export const TEST_BUSINESS_ID = '1e64bb14-27fc-4f76-8470-29e17253423f';       // public_id 10000
export const HIDDEN_PRICES_BUSINESS_ID = '9ab00944-b41b-47bd-b595-9aaea024d777'; // public_id 10001
export const canSeeSubscriptionMenu = (businessId) => businessId === TEST_BUSINESS_ID;
```

Cuando aparezca la necesidad de agregar otra excepción por negocio, extender ese archivo. No dispersar UUIDs hardcoded en la UI.

---

## Negocio 10000 — Único que ve la opción "Suscripciones" en el menú

El negocio con `public_id = '10000'` (UUID: `1e64bb14-27fc-4f76-8470-29e17253423f`) es el negocio de pruebas del dueño de la app. **Es el único** que ve la opción "Suscripciones" en el sidebar y en el sheet de perfil.

### Justificación

Los planes se van a definir manualmente por negocio (fuera del selector actual). Mientras eso sucede, ningún negocio productivo debe llegar a `SubscriptionPlansScreen` ni `SubscriptionManagementScreen` desde el menú.

### Archivos afectados

| Archivo | Punto de entrada oculto |
|---------|-------------------------|
| `components/Sidebar.tsx` | Botón "Mi Suscripción" del menú móvil y desktop |
| `screens/HomeScreen.tsx` | Botón "Mi Suscripción" del sheet de perfil móvil |

En los tres puntos la condición pasa de `isBusinessOwner` a `isBusinessOwner && canSeeSubscriptionMenu(profile?.business_id)` (ver `lib/specialBusinesses.ts`).

### Rutas internas siguen accesibles

Ocultar el menú NO cierra las pantallas. `SubscriptionPlansScreen` y `SubscriptionManagementScreen` siguen siendo alcanzables por:

- Deep link / hash de URL.
- Botón "Renovar ahora" del `GracePeriodBanner`.
- Redirect post-registro (`just_registered` en localStorage).
- Bloqueo por vencimiento en `App.tsx` (con plan personalizado se muestra `CustomPlanBlockedScreen`; sin plan personalizado, `SubscriptionPlansScreen`).

Si en el futuro se necesita cerrar también estas rutas para negocios sin permiso, hacerlo en `App.tsx` a nivel de router.

---

## Negocio 10001 — Precios ocultos

El negocio con `public_id = '10001'` (UUID: `9ab00944-b41b-47bd-b595-9aaea024d777`, constante `HIDDEN_PRICES_BUSINESS_ID`) tiene una regla vigente:

**Precios ocultos** en superficies no autorizadas: no ver costos ni montos en pantallas de la app fuera de las excepciones listadas más abajo (`CustomPlanCard`, `CustomPlanBlockedScreen`, widget de Wompi).

El pago y la renovación de este negocio se hacen ahora vía Wompi con su plan personalizado. El flujo de bloqueo/gracia sigue el patrón general de "Plan personalizado por negocio" descrito en la siguiente sección.

### Condición usada en el código

```tsx
import { HIDDEN_PRICES_BUSINESS_ID } from '../lib/specialBusinesses';
profile?.business_id === HIDDEN_PRICES_BUSINESS_ID
```

Cuando esta condición es true en pantallas de suscripción NO autorizadas a mostrar precio, se reemplaza cualquier monto visible por `'—'` o texto neutro (`'Plan activo'`, `'Activado'`).

### Archivos afectados

| Archivo | Qué cambia para el 10001 |
|---------|--------------------------|
| `screens/SubscriptionManagementScreen.tsx` | Precios ocultos en resumen del plan, tablas de facturas, aviso de próximo pago (excepto tab "Planes", que muestra `CustomPlanCard` con monto) |
| `screens/SubscriptionPlansScreen.tsx` | Precios ocultos si por alguna ruta cae ahí (poco probable con plan personalizado; su punto de entrada normal es `CustomPlanCard`) |

---

## Recordatorio obligatorio

Cada vez que el usuario pida un cambio o mejora en suscripciones, **recordarle**:

1. El negocio 10001 tiene precios ocultos en superficies no autorizadas (las autorizadas se listan en la siguiente sección).
2. Solo el negocio 10000 ve la opción "Suscripciones" en el menú (por regla legado `TEST_BUSINESS_ID`). Un negocio con plan personalizado también la ve si tiene `admin_settings`.

No aplicar estas condiciones automáticamente a código nuevo — solo avisar al usuario para que decida.

---

## Plan personalizado por negocio (`assigned_business_id`)

A partir de la feature `plan-suscripcion-personalizada` (2026-07-24), el flujo de bloqueo/renovación del negocio 10001 (y de cualquier otro negocio que reciba un plan personalizado en el futuro) NO se resuelve por comparación literal contra `HIDDEN_PRICES_BUSINESS_ID`, sino por dato:

- `subscription_plans.assigned_business_id` = UUID del negocio → plan personalizado.
- `subscription_plans.assigned_business_id` IS NULL → plan público (catálogo Mensual/Trimestral/Anual).

Hook `useCustomPlan()` deriva `hasCustomPlan` desde `subscription.plan.assigned_business_id === profile.business_id`.

### Comportamiento del negocio con plan personalizado

- **Entrada "Suscripciones" en sidebar/perfil**: SÍ, solo para admin (permiso `admin_settings`). El negocio 10000 sigue viéndola por regla legado (`TEST_BUSINESS_ID`).
- **Tab "Planes" del SubscriptionManagementScreen**: muestra solo `CustomPlanCard` con su plan personalizado (no ve el catálogo público).
- **Tabs Resumen/Pagos/Historial**: siguen aplicando `HIDDEN_PRICES_BUSINESS_ID` con "—" y "Plan activo" (regla vigente del 10001).
- **Banner de gracia**: admin ve botón "Pagar" (widget Wompi); cajero ve el banner informativo sin botón; mesero NO ve el banner en absoluto.
- **Fuera de gracia**: admin ve `CustomPlanBlockedScreen` con la card y botón Pagar; empleado sin `admin_settings` ve la pantalla neutra "contacta a soporte" (fallback).

### Precio visible vs regla de precios ocultos

Superficies AUTORIZADAS a mostrar el monto del plan personalizado (excepciones explícitas):
- `CustomPlanCard` en tab Planes.
- `CustomPlanBlockedScreen` fuera de gracia.
- Widget de Wompi.

En cualquier otra superficie (Resumen, Historial, facturas, etc.) los precios siguen ocultos para el 10001.

### Nueva firma de `canSeeSubscriptionMenu`

```ts
canSeeSubscriptionMenu(businessId, hasCustomPlan, hasAdminSettings)
```

Consumidores: `components/Sidebar.tsx`, `screens/HomeScreen.tsx`. Ambos pasan `useCustomPlan().hasCustomPlan` y `hasPermission('admin_settings')`.

### Idempotencia del pago

El índice único parcial `subscription_invoices_unique_wompi_tx` sobre `wompi_transaction_id` garantiza que una misma transacción de Wompi no aplique dos extensiones. En código, `applyCustomPlanPayment` atrapa el error `23505` y retorna `{ alreadyProcessed: true }` sin tocar `business_subscriptions`.

### RLS

Policy `Plans visible by ownership` en `subscription_plans`:
```
USING (assigned_business_id IS NULL OR assigned_business_id = get_user_business_id())
```

Un negocio X nunca puede leer un plan asignado a un negocio Y.

### Al asignar un plan personalizado a un nuevo negocio

```sql
INSERT INTO subscription_plans (name, price_monthly, initial_period_months, is_active, assigned_business_id)
VALUES ('<nombre>', <monto>, 1, true, '<business_id>');

UPDATE business_subscriptions
   SET plan_id = (SELECT id FROM subscription_plans WHERE assigned_business_id = '<business_id>' AND is_active = true)
 WHERE business_id = '<business_id>';
```

NO tocar `current_period_end`, `status`, `next_billing_date` — la vigencia actual del negocio debe respetarse.
