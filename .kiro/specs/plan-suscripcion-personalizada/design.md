# Diseño — Plan de Suscripción Personalizada

## 1. Resumen

Introducimos el concepto de "plan personalizado" en `subscription_plans` como un plan asignado a un `business_id` concreto y excluido del catálogo público. El primer beneficiario es el negocio `10001` con un plan mensual de $170.000 COP. La UI existente (`SubscriptionPlansScreen`, `SubscriptionManagementScreen`, `GracePeriodBanner`, pantalla de bloqueo en `App.tsx`) se refactoriza para consumir esta información desde datos, no desde comparaciones literales por `public_id`. Reutilizamos el widget de Wompi ya integrado; la única novedad de pago es un índice de idempotencia sobre `wompi_transaction_id` y polling breve del cliente para resolver el estado `PENDING`.

## 2. Investigación previa

Estado real verificado vía MCP contra Supabase (no confiar en archivos locales de `supabase/`):

- `subscription_plans` NO tiene columna para marcar plan personalizado ni asignarlo a un negocio.
- `business_subscriptions` del negocio 10001 hoy apunta al plan público `Mensual` ($35.000), status `active`, vence `2026-08-18`. La vigencia actual está pagada y debe respetarse.
- `subscription_invoices` NO tiene índice único sobre `wompi_transaction_id`.
- Edge functions activas relevantes: `generate-payment-signature` (firma HMAC del checkout), `process-subscriptions`, `process-renewals`. NO existe hoy un webhook de Wompi implementado.

Archivos de UI ya revisados y que hay que tocar: `lib/specialBusinesses.ts`, `hooks/usePermissions.ts`, `hooks/useGracePeriodStatus.ts`, `context/AuthContext.tsx`, `components/GracePeriodBanner.tsx`, `screens/SubscriptionPlansScreen.tsx`, `screens/SubscriptionManagementScreen.tsx`, `App.tsx` (pantalla de bloqueo ~ línea 2983), `src/config/wompi.ts`.

## 3. Arquitectura

Flujo general del negocio con plan personalizado:

```
   Login del negocio
         │
         ▼
 AuthContext.checkSubscription()
   SELECT *, plan:subscription_plans(*, assigned_business_id)
         │
         ▼
 useCustomPlan()  →  hasCustomPlan = plan.assigned_business_id === profile.business_id
         │
         ├──────────────┬─────────────────┬────────────────────────┐
         ▼              ▼                 ▼                        ▼
   Sidebar /       GracePeriodBanner   SubscriptionMgmt        App.tsx bloqueo
   HomeScreen       (botón Pagar)      tab Planes:             fuera de gracia
   (entrada visible                    CustomPlanCard          (CustomPlanCard
    para admin)                                                 en vez de "soporte")
                          │
                          └──────────┬───────────┘
                                     ▼
                     openCustomPlanCheckout(profile, plan)
                                     │
                                     ▼
                          generate-payment-signature (edge)
                                     │
                                     ▼
                        Widget_Wompi (checkout hospedado)
                                     │
                    ┌────────────────┼──────────────────┐
                    ▼                ▼                  ▼
                APPROVED         DECLINED / ERROR    PENDING
                    │                │                  │
                    ▼                ▼                  ▼
        handlePaymentApproved   noop + toast     polling 60s → si APPROVED
        · unique(wompi_tx_id)                     ejecuta handlePaymentApproved
        · UPDATE business_
          subscriptions
          current_period_end
        · INSERT subscription_
          invoices
        · AuthContext.checkSubscription()
```

Tabla de archivos afectados:

| Archivo | Acción | Motivo |
|---|---|---|
| `subscription_plans` (tabla) | Migración: 2 columnas nuevas + índice único parcial | Modelar plan personalizado (Req 1) |
| `subscription_invoices` (tabla) | Migración: índice único parcial en `wompi_transaction_id` | Idempotencia (Req 8.5) |
| `subscription_plans` (datos) | Seed: plan $170.000 asignado a 10001 | Req 2 |
| `business_subscriptions` (datos) | UPDATE plan_id del 10001 sin tocar `current_period_end` | Req 2 sin romper vigencia |
| `hooks/useCustomPlan.ts` | **Nuevo** | Resolver `hasCustomPlan` y monto |
| `components/CustomPlanCard.tsx` | **Nuevo** | Card con monto + botón "Pagar" |
| `lib/customPlanCheckout.ts` | **Nuevo** | Helper compartido de checkout |
| `lib/specialBusinesses.ts` | Nueva firma `canSeeSubscriptionMenu` | Req 3.2/3.3/7.6 |
| `context/AuthContext.tsx` | Ampliar `checkSubscription()` para traer `plan.assigned_business_id` | Alimentar `useCustomPlan` |
| `components/GracePeriodBanner.tsx` | Sustituir `!isNegocio10001` por lógica por plan + rol | Req 5, 7 |
| `screens/SubscriptionManagementScreen.tsx` | Tab "Planes" renderiza `CustomPlanCard` si `hasCustomPlan` | Req 3.5, 4 |
| `screens/SubscriptionPlansScreen.tsx` | Excluir del catálogo público planes con `assigned_business_id IS NOT NULL`; extraer `handleOpenWompiWidget` a `lib/customPlanCheckout.ts` | Req 3.1, 3.6 |
| `App.tsx` | Reemplazar bloque de bloqueo `isNegocio10001` por lógica basada en `hasCustomPlan` + `admin_settings` | Req 6, 7.4 |
| `components/Sidebar.tsx` | Cambiar llamada a `canSeeSubscriptionMenu(...)` con la nueva firma | Req 3.2/3.3 |
| `screens/HomeScreen.tsx` (sheet perfil) | Cambiar llamada a `canSeeSubscriptionMenu(...)` con la nueva firma | Req 3.2/3.3 |

## 4. Cambios en base de datos

DDL propuesto (una sola migración):

```sql
-- 1) Modelado del plan personalizado
ALTER TABLE subscription_plans
  ADD COLUMN assigned_business_id uuid NULL
    REFERENCES businesses(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX subscription_plans_one_active_custom_per_business
  ON subscription_plans (assigned_business_id)
  WHERE assigned_business_id IS NOT NULL AND is_active = true;

CREATE INDEX subscription_plans_assigned_business_idx
  ON subscription_plans (assigned_business_id)
  WHERE assigned_business_id IS NOT NULL;

-- 2) Idempotencia de facturas por transacción de Wompi
CREATE UNIQUE INDEX subscription_invoices_unique_wompi_tx
  ON subscription_invoices (wompi_transaction_id)
  WHERE wompi_transaction_id IS NOT NULL;

-- 3) Seed del plan del 10001
INSERT INTO subscription_plans
  (name, description, price_monthly, initial_period_months, is_active,
   requires_card, trial_duration, trial_interval, features, assigned_business_id)
VALUES
  ('Plan Personalizado 10001',
   'Plan personalizado — negocio 10001',
   170000, 1, true,
   false, 0, 'day', '[]'::jsonb,
   '9ab00944-b41b-47bd-b595-9aaea024d777');

-- 4) Migración de la suscripción existente (transaccional)
BEGIN;
  UPDATE business_subscriptions
     SET plan_id = (SELECT id FROM subscription_plans
                     WHERE assigned_business_id = '9ab00944-b41b-47bd-b595-9aaea024d777'
                       AND is_active = true)
   WHERE business_id = '9ab00944-b41b-47bd-b595-9aaea024d777';
  -- OJO: NO tocar current_period_end (2026-08-18), respetar vigencia pagada.
COMMIT;
```

Justificación del modelado (`assigned_business_id` en la propia tabla, sin tabla puente):

- Un plan personalizado pertenece a un solo negocio (Req 1.2). No hay caso de uso de compartir.
- Consultas quedan directas: catálogo público = `WHERE assigned_business_id IS NULL`; plan de un negocio = `WHERE assigned_business_id = :business_id`.
- El índice único parcial garantiza "máximo un plan personalizado activo por negocio" a nivel BD.

Después de aplicar la migración, correr `get_advisors` de MCP para verificar policies de RLS y warnings.

## 5. Cambios en frontend

### 5.1 Nuevo hook `hooks/useCustomPlan.ts`

```ts
import { useAuth } from '../context/AuthContext';

export const useCustomPlan = () => {
  const { profile, subscription } = useAuth();
  const plan = subscription?.plan;
  const hasCustomPlan =
    !!profile?.business_id &&
    !!plan?.assigned_business_id &&
    plan.assigned_business_id === profile.business_id;
  return {
    hasCustomPlan,
    customPlan: hasCustomPlan ? plan : null,
    customPlanAmount: hasCustomPlan ? Number(plan!.price_monthly) : null,
  };
};
```

### 5.2 Nuevo componente `components/CustomPlanCard.tsx`

Card de solo presentación. Recibe por props:

```ts
type Props = {
  plan: SubscriptionPlan;            // asignado al negocio
  canPay: boolean;                   // hasPermission('admin_settings')
  onPay: () => void;                 // llama a openCustomPlanCheckout
  isSubmitting?: boolean;
};
```

Contenido: nombre del plan, monto formateado en COP (`Intl.NumberFormat('es-CO')`), etiqueta "Mensual", botón `Pagar ahora` (deshabilitado si `!canPay`). Sin animaciones. Botón oculto — no solo deshabilitado — cuando `!canPay` (Req 4.3, 7.1).

### 5.3 Nuevo helper `lib/customPlanCheckout.ts`

Extrae la lógica de `SubscriptionPlansScreen.handleOpenWompiWidget` para poder llamarla desde tres puntos (management screen, banner de gracia, bloqueo fuera de gracia).

```ts
export async function openCustomPlanCheckout(params: {
  profile: Profile;
  plan: SubscriptionPlan;
  onApproved: (tx: WompiTransaction) => Promise<void>;
  onPending: (tx: WompiTransaction) => void;
  onDeclined: (msg: string) => void;
  onError: (err: Error) => void;
}): Promise<void>;
```

Encapsula:
1. `loadWompiWidget()` de `src/config/wompi.ts`.
2. Llamada a la edge function `generate-payment-signature` con `amountInCents = plan.price_monthly * 100` y `reference = 'custom-<business_id>-<timestamp>'`.
3. Apertura del widget con `WompiConfig`.
4. Dispatch al callback correcto según `result.transaction.status`.

### 5.4 Nueva firma de `canSeeSubscriptionMenu` en `lib/specialBusinesses.ts`

```ts
export const canSeeSubscriptionMenu = (
  businessId: string | null | undefined,
  hasCustomPlan: boolean,
  hasAdminSettings: boolean
): boolean => {
  if (!businessId || !hasAdminSettings) return false;
  if (businessId === TEST_BUSINESS_ID) return true; // 10000 sigue viendo la entrada
  return hasCustomPlan;                              // extensión: cualquier negocio con plan personalizado
};
```

Consumidores (`Sidebar`, `HomeScreen` sheet perfil) pasan `hasCustomPlan` desde `useCustomPlan()` y `hasAdminSettings` desde `usePermissions()`.

### 5.5 Extensión de `AuthContext.checkSubscription()`

Cambiar la query actual para incluir el `plan` completo con `assigned_business_id`:

```ts
const { data } = await supabase
  .from('business_subscriptions')
  .select(`
    *,
    plan:subscription_plans (
      id, name, price_monthly, initial_period_months,
      assigned_business_id, features, is_active
    )
  `)
  .eq('business_id', profile.business_id)
  .maybeSingle();
```

Exponer en el context: `subscription` (ya expuesto) que ahora incluye `subscription.plan`. `hasCustomPlan` y `customPlan` NO se exponen directo desde el context — se derivan en `useCustomPlan()` para no crear acoplamiento circular.

### 5.6 Refactor de `GracePeriodBanner`

Sustituir la condición actual `!isNegocio10001` por reglas basadas en plan + rol:

```
role === 'Mesero'                              → return null (Req 5.4, 7.3)
hasCustomPlan && hasAdminSettings              → botón "Pagar" → openCustomPlanCheckout (Req 5.1, 5.2)
hasCustomPlan && !hasAdminSettings (Cajero)    → banner informativo sin botón (Req 5.3, 7.2)
!hasCustomPlan                                 → botón "Renovar ahora" → SUBSCRIPTION_PLANS (comportamiento actual, Req 5.6)
```

Los callbacks del checkout desde el banner:
- `onApproved` → refrescar `AuthContext.checkSubscription()` y ocultar el banner.
- `onPending` → toast "Pago en proceso" + activar polling breve.
- `onDeclined` / `onError` → toast de error, banner intacto.

### 5.7 Refactor de tab "Planes" en `SubscriptionManagementScreen`

Al montar la tab, decidir:

```
if (hasCustomPlan) {
  render <CustomPlanCard plan={customPlan} canPay={hasAdminSettings} onPay={...} />
} else {
  render <SubscriptionPlansScreen embedded /> // catálogo público, como hoy
}
```

Tabs `overview`, `history`, `details` NO cambian: siguen aplicando `Regla_Precios_Ocultos` para el 10001 (Req 4.6, 11.1).

### 5.8 Refactor de `SubscriptionPlansScreen`

Dos cambios puntuales:

1. Excluir del catálogo público planes personalizados:
   ```ts
   .filter('assigned_business_id', 'is', null)   // añadido
   .filter('name', 'neq', 'Plan Pruebas Internas') // ya existe
   ```
2. Extraer `handleOpenWompiWidget` a `lib/customPlanCheckout.ts` para no duplicar lógica. El componente pasa a llamarlo cuando el usuario selecciona un plan (público, en su flujo actual).

### 5.9 Refactor de la pantalla de bloqueo en `App.tsx`

Reemplazar el bloque especial `isNegocio10001` (~ línea 2983) por:

```
if (fueraDeGracia) {
  if (hasCustomPlan && hasAdminSettings) {
    return <CustomPlanBlockedScreen plan={customPlan} onPay={...} onLogout={...} />
  }
  if (hasCustomPlan && !hasAdminSettings) {
    return <ContactaSoporteScreen />  // pantalla actual, Req 7.4
  }
  // sin plan personalizado: comportamiento actual (redirect a SUBSCRIPTION_PLANS)
}
```

`CustomPlanBlockedScreen` es un componente delgado que reutiliza `CustomPlanCard` + botón "Cerrar sesión".

## 6. Flujos

### 6.1 Pago aprobado (feliz)

```
Usuario_Admin  ──► botón "Pagar"
                        │
                        ▼
              openCustomPlanCheckout()
                        │
                        ▼
          Widget_Wompi (transacción → APPROVED)
                        │
                        ▼
           handlePaymentApproved(tx)
             ┌─────────────────────────────┐
             │ INSERT subscription_invoices│  ← si viola índice único, se ignora
             │ (wompi_transaction_id UNIQUE)│    (idempotencia, Req 8.5)
             └─────────────────────────────┘
                        │
                        ▼
      UPDATE business_subscriptions
        current_period_end = greatest(
          current_period_end, now()
        ) + 1 mes
        status = 'active'
                        │
                        ▼
        AuthContext.checkSubscription()
                        │
                        ▼
     Banner desaparece, UI vuelve a normal
```

### 6.2 Pago PENDING (PSE / Nequi)

```
Widget_Wompi ──► PENDING (tx_id = X)
        │
        ▼
Toast "Pago en proceso"
        │
        ▼
Polling GET https://production.wompi.co/v1/transactions/X
  cada 5s, máximo 60s (12 intentos)
        │
        ├─► APPROVED  → ejecutar handlePaymentApproved(tx) (mismo flujo 6.1)
        ├─► DECLINED  → toast "Pago rechazado", sin cambios en BD
        └─► sigue PENDING al agotar → toast "El pago sigue en proceso, revisa más tarde"
```

El polling se hace desde el cliente, sin edge function nueva. Es aceptable en primera versión porque:
- Solo aplica al Usuario_Admin durante los 60s posteriores a un checkout.
- El índice único sobre `wompi_transaction_id` protege contra doble aplicación aunque el usuario cierre y vuelva a abrir.

### 6.3 Pago DECLINED o error

```
Widget_Wompi ──► DECLINED / ERROR
        │
        ▼
Toast con motivo (mensaje del proveedor)
        │
        ▼
Suscripción NO se toca (Req 9.1, 9.2)
Banner o pantalla de bloqueo permanecen igual
Botón "Pagar" queda disponible para reintento (Req 9.4)
```

## 7. Idempotencia y seguridad

### 7.1 Idempotencia de pago aprobado

Mecanismo primario: índice único parcial `subscription_invoices_unique_wompi_tx` sobre `wompi_transaction_id WHERE wompi_transaction_id IS NOT NULL`.

En `handlePaymentApproved`:

```ts
const { error } = await supabase
  .from('subscription_invoices')
  .insert({ ..., wompi_transaction_id: tx.id });

if (error?.code === '23505') {
  // Ya se procesó antes. No tocar business_subscriptions.
  return { alreadyProcessed: true };
}
if (error) throw error;

// Solo actualizar business_subscriptions si el INSERT fue realmente nuevo
await supabase.from('business_subscriptions').update({ ... });
```

Esto cubre: doble callback del widget, polling que llega tarde y reintentos del usuario tras un cierre del popup.

### 7.2 RLS de `subscription_plans`

Las policies actuales de `subscription_plans` deben ajustarse. Regla objetivo:

```
SELECT allowed IF:
  is_active = true
  AND (assigned_business_id IS NULL                        -- plan público
       OR assigned_business_id = auth.jwt() ->> 'business_id' -- plan propio
       OR auth.jwt() ->> 'business_id' = TEST_BUSINESS_ID)     -- 10000 ve todo (interno)
```

Esto garantiza que un negocio distinto al asignado nunca pueda leer un plan personalizado ajeno, ni siquiera con una petición manual (Req 3.4). Ajustar las policies dentro de la misma migración y verificar con `get_advisors`.

### 7.3 Validación por permisos

El botón "Pagar ahora" y la entrada del sidebar se ocultan en cliente vía `hasPermission('admin_settings')`. Esta es UI, no seguridad. La seguridad real vive en:

- RLS de `subscription_plans` (impide leer planes ajenos).
- Firma de la edge function `generate-payment-signature` (requiere sesión válida del negocio).
- Índice único sobre `wompi_transaction_id` (impide doble cobro).

## 8. Manejo del estado PENDING

**Opción A — Polling cliente (recomendada, primera versión):**

- Duración: 60s (12 intentos cada 5s).
- Endpoint: `GET https://production.wompi.co/v1/transactions/{id}` (público, no requiere secret).
- Si el usuario cierra la app antes de que termine el polling, la transacción queda "huérfana" desde el punto de vista de Bistro. Se resuelve manualmente por soporte hasta que exista la Opción B.
- Ventaja: cero infraestructura nueva.
- Desventaja: no cubre casos donde el pago se aprueba después de que el usuario cerró la app.

**Opción B — Webhook de Wompi (mejora futura, fuera del scope):**

- Nueva edge function `wompi-webhook` que reciba `transaction.updated`.
- Verifica firma con `WOMPI_EVENTS_SECRET` (secret nuevo).
- Aplica idempotencia con el mismo índice único de la Opción A.
- Cubre el caso "usuario cerró la app antes de que el pago se aprobara".
- Se documenta como mejora, no se implementa en esta iteración.

## 9. Puntos que quedan fuera de scope

- **Autorenovación automática con tarjeta guardada**. Hay un plan aparte en `docs/historial_planes/2026-03-20-autorenewal-implementation-plan.md`. Para el plan personalizado, en primera versión el cobro es siempre iniciado por el usuario.
- **Webhook de Wompi** (Opción B del punto 8). Se documenta pero no se implementa.
- **Aviso proactivo de próximo vencimiento** (email/push antes del vencimiento). Sigue usando el sistema actual.
- **Panel interno para asignar planes personalizados a otros negocios**. Por ahora la asignación se hace por SQL directo. La feature soporta N negocios pero solo se prueba con el 10001.

## 10. Impacto en negocios existentes

| Negocio | Antes | Después |
|---|---|---|
| 10000 (TEST) | Ve entrada "Suscripciones", ve catálogo público | Sin cambios. Sigue viendo la entrada y el catálogo público. |
| 10001 | Ve "contacta a soporte" fuera de gracia. Plan Mensual $35.000. Precios ocultos. | Plan Personalizado $170.000. `current_period_end` intacto (2026-08-18). En bloqueo ve pantalla de pago con monto visible. En banner de gracia ve botón "Pagar". Tab Planes muestra `CustomPlanCard`. Resto de la app sigue con precios ocultos. |
| Cualquier otro | Sin plan personalizado | Sin cambios. Sigue viendo catálogo público, sin entrada "Suscripciones" (salvo lógica ya existente). |

## 11. Riesgos y consideraciones

- **Migración del 10001 debe ser atómica.** Envolver el `UPDATE business_subscriptions` + verificación en una sola transacción. Verificar antes que el nuevo plan existe (subquery).
- **Widget cerrado sin callback.** Si el usuario cierra el popup de Wompi antes de aprobar, no debe cambiar nada. `openCustomPlanCheckout` no dispara `onApproved` en ese caso; el estado de gracia/bloqueo persiste.
- **Cajero por deep link a management screen.** Si un cajero abre `SubscriptionManagementScreen` (por URL directa o por back button), la tab Planes debe mostrar `CustomPlanCard` sin botón "Pagar" (Req 7.1). Verificar en el componente `CustomPlanCard` que `canPay=false` oculta — no solo deshabilita — el botón, para no dar señal visual de acción disponible.
- **Mesero recibiendo banner.** El return null debe estar antes de cualquier `useEffect`/`useLayoutEffect` para evitar side effects en la UI (Req 5.4, 7.3).
- **Doble tab abierta.** Si el admin abre dos pestañas y paga en una, la otra debe refrescar. El `AuthContext.checkSubscription()` ya se llama en focus del window en el patrón actual; verificar que también se llama después de `handlePaymentApproved`.
- **Ejecución del polling PENDING.** Cancelar el polling si el componente que lo inició se desmonta, para evitar setState en unmount y para no seguir consultando Wompi cuando el usuario ya cambió de pantalla.
- **`Plan Personalizado 10001` no debe aparecer en el catálogo público bajo ninguna vista.** Verificar con: (a) el filtro `.filter('assigned_business_id', 'is', null)` en `SubscriptionPlansScreen`, (b) la RLS de `subscription_plans` que impide leerlo desde otros negocios, (c) test manual con un usuario de otro negocio.

---

**Resumen ejecutivo del diseño:**

1. Modelamos "plan personalizado" con dos columnas nuevas en `subscription_plans` (`assigned_business_id` + índice único parcial), evitando tabla puente y hardcodeos por `public_id`.
2. Los negocios con plan personalizado ven una `CustomPlanCard` con monto visible en tres puntos: tab Planes del management screen, banner de gracia (botón Pagar) y pantalla de bloqueo fuera de gracia. El resto de la app mantiene `Regla_Precios_Ocultos`.
3. La lógica de checkout se centraliza en `lib/customPlanCheckout.ts`; el widget de Wompi se reutiliza sin cambios.
4. Idempotencia por índice único parcial en `subscription_invoices.wompi_transaction_id`; estado PENDING resuelto con polling breve desde el cliente (webhook queda documentado como Opción B).
5. Permisos: `admin_settings` gobierna la visibilidad del botón Pagar y de la entrada "Suscripciones"; Cajero ve banner informativo sin acción; Mesero no ve banner.
6. Migración de datos del 10001 respeta la vigencia pagada (`current_period_end = 2026-08-18` intacto).
