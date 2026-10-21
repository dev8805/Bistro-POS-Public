# Plan de Implementación: Plan de Suscripción Personalizada

## Resumen

Este plan implementa el soporte para planes de suscripción personalizados asignados a un negocio específico (empezando por el 10001, monto $170.000/mes). El orden de bloques es estricto: primero se aplica la migración estructural aditiva, luego se siembra el plan personalizado y se migra la suscripción del 10001 sin tocar su vigencia (`current_period_end = 2026-08-18`), después se agrega el hook y los componentes de UI, y finalmente se verifica end-to-end.

Las tareas marcadas como `[Manual]` corresponden a comandos ejecutados vía MCP de Supabase (`apply_migration`, `execute_sql`, `get_advisors`), no a cambios de código.

**Regla crítica de compatibilidad**: la UI de los bloques 3 a 6 puede quedar mergeada aunque la migración de datos del bloque 2 no se haya corrido. El hook `useCustomPlan()` devolverá `hasCustomPlan = false` mientras el UPDATE del negocio 10001 no se aplique, así que el 10001 seguirá viendo su plan Mensual actual hasta que se ejecute la task 4.

## Tareas

### Bloque 1 — Base de datos (migración aditiva)

- [x] 1. Migración estructural: agregar `assigned_business_id` a `subscription_plans` e índices de soporte
  - [x] 1.1 Escribir migración `add_custom_plan_support`
    - `ALTER TABLE subscription_plans ADD COLUMN assigned_business_id uuid NULL REFERENCES businesses(id) ON DELETE CASCADE;`
    - Crear índice único parcial `subscription_plans_one_active_custom_per_business` sobre `(assigned_business_id)` con `WHERE assigned_business_id IS NOT NULL AND is_active = true`.
    - Crear índice de búsqueda `subscription_plans_assigned_business_idx` sobre `(assigned_business_id)` con `WHERE assigned_business_id IS NOT NULL`.
    - Crear índice único parcial `subscription_invoices_unique_wompi_tx` sobre `(wompi_transaction_id)` con `WHERE wompi_transaction_id IS NOT NULL`.
    - _Requerimientos: 1.1, 1.2, 8.5_
  - [x] 1.2 [Manual] Aplicar la migración vía MCP `apply_migration` contra el proyecto `hjjmwipqquynjopkswvu`.
  - [x] 1.3 [Manual] Correr `get_advisors` (security y performance) para verificar que no aparecen warnings nuevos.
  - [x] 1.4 [Manual] Sincronizar al filesystem con `supabase migration fetch --yes` para dejar el archivo local versionado.

- [x] 2. Migración de políticas RLS de `subscription_plans`
  - [x] 2.1 Escribir migración `restrict_custom_plans_rls`
    - `DROP POLICY "Plans are viewable by everyone" ON subscription_plans;`
    - `CREATE POLICY "Plans visible by ownership" ON subscription_plans FOR SELECT USING (assigned_business_id IS NULL OR assigned_business_id = get_user_business_id());`
    - Dejar intacta la policy `admin_read_all_plans`.
    - _Requerimientos: 3.4_
  - [x] 2.2 [Manual] Aplicar la migración vía MCP `apply_migration`.
  - [x] 2.3 [Manual] Correr verificación de RLS (después de la task 3): con un JWT de un negocio distinto al 10001, `SELECT id FROM subscription_plans WHERE assigned_business_id IS NOT NULL` debe devolver 0 filas. Con un JWT del 10001, debe devolver 1 fila.

### Bloque 2 — Datos (seed y migración del 10001)

- [x] 3. Seed del plan personalizado del negocio 10001
  - [x] 3.1 [Manual] Ejecutar vía MCP `execute_sql`:
    ```sql
    INSERT INTO subscription_plans (
      name, description, price_monthly, initial_period_months,
      is_active, requires_card, trial_duration, trial_interval,
      features, assigned_business_id
    )
    VALUES (
      'Plan Personalizado 10001',
      'Plan personalizado — negocio 10001',
      170000, 1, true, false, 0, 'day', '[]'::jsonb,
      '9ab00944-b41b-47bd-b595-9aaea024d777'
    )
    RETURNING id;
    ```
    Anotar el `id` devuelto.
    _Requerimientos: 2.1_
  - [x] 3.2 [Manual] Verificar que la fila quedó correctamente:
    ```sql
    SELECT id, name, price_monthly, assigned_business_id, is_active
      FROM subscription_plans
     WHERE assigned_business_id = '9ab00944-b41b-47bd-b595-9aaea024d777';
    ```
    Debe devolver exactamente 1 fila.

- [x] 4. Migración de la suscripción del 10001 al nuevo plan (SIN alterar la vigencia)
  - [x] 4.1 [Manual] Ejecutar vía MCP `execute_sql` una transacción atómica con verificación previa y posterior:
    ```sql
    BEGIN;
      -- Verificación previa
      SELECT id, plan_id, current_period_end
        FROM business_subscriptions
       WHERE business_id = '9ab00944-b41b-47bd-b595-9aaea024d777';

      -- UPDATE atómico, solo cambia plan_id
      UPDATE business_subscriptions
         SET plan_id = (
               SELECT id FROM subscription_plans
                WHERE assigned_business_id = '9ab00944-b41b-47bd-b595-9aaea024d777'
                  AND is_active = true
             )
       WHERE business_id = '9ab00944-b41b-47bd-b595-9aaea024d777';

      -- Verificación posterior: current_period_end debe estar intacto
      SELECT plan_id, status, current_period_start, current_period_end, next_billing_date
        FROM business_subscriptions
       WHERE business_id = '9ab00944-b41b-47bd-b595-9aaea024d777';
    COMMIT;
    ```
    _Requerimientos: 2.2, 2.3_
  - [x] 4.2 [Manual] Confirmar que `current_period_end` sigue siendo `2026-08-18 02:09:33.185893+00`, que `status = 'active'` y que `next_billing_date` no cambió. Si algún valor difiere, ejecutar `ROLLBACK` inmediato.

### Bloque 3 — Backend/Contexto

- [x] 5. Extender `AuthContext.checkSubscription()` para exponer el plan completo
  - [x] 5.1 En `context/AuthContext.tsx`, modificar la query de `checkSubscription()` para hacer join con `subscription_plans`:
    ```ts
    .select('*, plan:subscription_plans(id, name, price_monthly, initial_period_months, assigned_business_id, features, is_active)')
    ```
  - [x] 5.2 Exponer `subscription` con el `plan` anidado en el value del context. No agregar campos derivados aquí; se derivan en `useCustomPlan`.
  - [x] 5.3 Compilar el proyecto (`npm run build`) y verificar que ningún consumidor del context queda con errores de tipo.
    _Requerimientos: 1.4, 4.1_

- [x] 6. Crear hook `useCustomPlan`
  - [x] 6.1 Crear `hooks/useCustomPlan.ts` con la firma definida en el design:
    ```ts
    const useCustomPlan = (): {
      hasCustomPlan: boolean;
      customPlan: SubscriptionPlan | null;
      customPlanAmount: number | null;
    } => { /* ... */ };
    ```
    Deriva a partir de `subscription.plan.assigned_business_id === profile.business_id`.
  - [x] 6.2 Verificación runtime con el negocio 10001: debe devolver `hasCustomPlan = true` y `customPlanAmount = 170000` una vez la task 4 esté aplicada. Antes de la task 4, debe devolver `hasCustomPlan = false` sin errores.
    _Requerimientos: 1.4, 2.2_

### Bloque 4 — Helpers y componentes reutilizables

- [x] 7. Extraer `openCustomPlanCheckout` a `lib/customPlanCheckout.ts`
  - [x] 7.1 Crear el archivo con la firma definida en el design. Copiar y generalizar la lógica actual de `SubscriptionPlansScreen.handleOpenWompiWidget` para recibir `plan` como parámetro.
  - [x] 7.2 Generar la referencia Wompi como `'custom-<business_id>-<timestamp>'` para poder distinguir en logs.
  - [x] 7.3 Implementar los callbacks `onApproved`, `onPending`, `onDeclined`, `onError` según el design.
  - [x] 7.4 Manejo de idempotencia: si el INSERT en `subscription_invoices` devuelve código `23505`, retornar `{ alreadyProcessed: true }` sin tocar `business_subscriptions`.
  - [x] 7.5 Refactor: `SubscriptionPlansScreen.handleOpenWompiWidget` pasa a delegar en este helper.
    _Requerimientos: 4.2, 5.2, 6.2, 8.5, 9.2, 10.1_

- [x] 8. Crear componente `CustomPlanCard`
  - [x] 8.1 Crear `components/CustomPlanCard.tsx` con las props definidas en el design.
  - [x] 8.2 Formato de precio con `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`.
  - [x] 8.3 OCULTAR el botón cuando `canPay = false` (no solo deshabilitar) para no dar señal visual de acción.
  - [x] 8.4 Accesibilidad: `aria-label` descriptivo en el botón, `onKeyDown` que dispare la misma acción que `onClick`, `tabindex="0"` si es necesario.
    _Requerimientos: 4.1, 4.3, 7.1_

### Bloque 5 — Refactor de UI existente

- [x] 9. Extender `lib/specialBusinesses.ts` con la nueva firma de `canSeeSubscriptionMenu`
  - [x] 9.1 Cambiar la firma a `canSeeSubscriptionMenu(businessId, hasCustomPlan, hasAdminSettings)`.
  - [x] 9.2 Actualizar los dos consumidores: `components/Sidebar.tsx` y `screens/HomeScreen.tsx` para pasar los tres argumentos (obteniendo `hasCustomPlan` desde `useCustomPlan()` y `hasAdminSettings` desde `usePermissions()`).
  - [x] 9.3 Verificar con TypeScript que no queda ningún otro consumidor con firma vieja.
    _Requerimientos: 3.2, 3.3, 7.6_

- [x] 10. Refactor de `GracePeriodBanner`
  - [x] 10.1 Consumir `useCustomPlan()` y `usePermissions()` dentro del componente.
  - [x] 10.2 Reglas de renderizado:
    - Si `profile?.role === 'Mesero'` → `return null` antes del `useLayoutEffect`.
    - Cajero (`!hasPermission('admin_settings')`) → banner informativo sin botón.
    - Admin con plan personalizado → botón "Pagar" que llama a `openCustomPlanCheckout`.
    - Admin sin plan personalizado → botón "Renovar ahora" (comportamiento actual).
  - [x] 10.3 Callbacks del checkout: `onApproved` → `checkSubscription()` + ocultar banner; `onPending` → toast + polling 60s (delegado al helper); `onDeclined`/`onError` → toast, banner sigue visible.
    _Requerimientos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.2, 7.3_

- [x] 11. Refactor de la tab "Planes" en `SubscriptionManagementScreen`
  - [x] 11.1 Si `hasCustomPlan`, renderizar `<CustomPlanCard>` en lugar del `<SubscriptionPlansScreen>` embebido.
  - [x] 11.2 Confirmar que las tabs Resumen, Pagos e Historial siguen aplicando la regla de precios ocultos para el 10001 usando `HIDDEN_PRICES_BUSINESS_ID`.
    _Requerimientos: 3.5, 4.1, 4.6, 11.1, 11.2_

- [x] 12. Refactor de `SubscriptionPlansScreen` (catálogo público)
  - [x] 12.1 Agregar `.filter('assigned_business_id', 'is', null)` a la query `fetchPlans()` para excluir planes personalizados del catálogo público. (La RLS ya los oculta, pero el filtro explícito es defensivo.)
  - [x] 12.2 Refactor de `handleOpenWompiWidget` para delegar en `lib/customPlanCheckout.ts` (compartido con `GracePeriodBanner` y `CustomPlanBlockedScreen`).
    _Requerimientos: 3.1, 3.6_

- [x] 13. Refactor de la pantalla de bloqueo fuera de gracia en `App.tsx`
  - [x] 13.1 Reemplazar el bloque `isNegocio10001` (~línea 2983) por lógica basada en `useCustomPlan` + `hasPermission('admin_settings')`.
  - [x] 13.2 Crear `components/CustomPlanBlockedScreen.tsx` (componente delgado) que renderiza `<CustomPlanCard>` con `canPay={hasAdminSettings}` más un botón "Cerrar sesión".
  - [x] 13.3 Fallback: si `hasCustomPlan && !hasAdminSettings`, mostrar la pantalla actual "contacta a soporte" tal cual está hoy.
    _Requerimientos: 6.1, 6.2, 6.3, 6.4, 7.4_

### Bloque 6 — Polling y estados de pago

- [x] 14. Implementar polling breve del cliente para transacciones PENDING
  - [x] 14.1 En `lib/customPlanCheckout.ts`, cuando el widget devuelve estado `PENDING`, arrancar un polling contra `GET https://production.wompi.co/v1/transactions/<id>`, cada 5 s hasta un máximo de 12 intentos (60 s).
  - [x] 14.2 Cancelar el polling si el componente que lo inició se desmonta, usando `AbortController`.
  - [x] 14.3 Si el polling detecta APPROVED, ejecutar la misma lógica de `handlePaymentApproved` (INSERT en `subscription_invoices` idempotente + UPDATE `current_period_end` + `checkSubscription()`).
  - [x] 14.4 Si el polling detecta DECLINED, mostrar toast; no tocar BD.
  - [x] 14.5 Si agota los 60 s sin resolución, mostrar toast "El pago sigue en proceso, revisa más tarde".
    _Requerimientos: 10.1, 10.2, 10.3, 10.4, 10.5_

### Bloque 7 — Checkpoint

- [x] 15. Checkpoint — build limpio y no regresión visual
  - Ejecutar `npm run build` y confirmar que no hay errores de TypeScript ni warnings nuevos.
  - Levantar `npm run dev` y confirmar que la app arranca sin errores en consola.
  - Ensure all tests pass, ask the user if questions arise.

### Bloque 8 — Verificación end-to-end

- [ ] 16. Verificación funcional (manual)
  - [~] 16.1 Con usuario admin del 10001: ver entrada "Suscripciones" en el sidebar, abrir `SubscriptionManagementScreen`; la tab Planes muestra `CustomPlanCard` con monto $170.000. Las otras tabs mantienen precios ocultos (`HIDDEN_PRICES_BUSINESS_ID`).
  - [~] 16.2 Con usuario cajero del 10001: no ve la entrada "Suscripciones". Forzar vencimiento a estado de gracia (47 h antes de bloqueo total): ve el banner sin botón "Pagar".
  - [~] 16.3 Con usuario mesero del 10001: no ve la entrada "Suscripciones". No ve el banner de gracia en ningún estado.
  - [~] 16.4 Con un negocio distinto al 10001 (por ejemplo el 10000): no ve el plan personalizado en el catálogo público. Consulta directa vía cliente autenticado confirma que RLS oculta el plan del 10001.
  - [~] 16.5 Simular un pago aprobado con tarjeta de prueba de Wompi. Verificar: `subscription_invoices` tiene 1 fila con `wompi_transaction_id` no nulo, `business_subscriptions.current_period_end` se extendió 1 mes y `status = 'active'`.
  - [~] 16.6 Simular idempotencia: reintentar aplicar dos veces el mismo `wompi_transaction_id`. El segundo INSERT debe fallar con `23505`; la suscripción NO debe extenderse dos veces.
    _Requerimientos: 8.1, 8.2, 8.3, 8.5, 3.4_

- [ ] 17. Verificación de no regresión del negocio 10001
  - [x] 17.1 [Manual] Después de aplicar la task 4, ejecutar:
    ```sql
    SELECT plan_id, status, current_period_start, current_period_end, next_billing_date
      FROM business_subscriptions
     WHERE business_id = '9ab00944-b41b-47bd-b595-9aaea024d777';
    ```
    Confirmar que `current_period_end = '2026-08-18 02:09:33.185893+00'` y que `status = 'active'`. Si cualquier valor difiere, DETENER despliegue y hacer ROLLBACK.
  - [~] 17.2 Loguearse como usuario del 10001 y confirmar que la app opera con normalidad: puede vender por POS, entrar a inventario, ver reportes, cerrar turno, etc.
    _Requerimientos: 2.3_

### Bloque 9 — Documentación

- [x] 18. Actualizar documentación del proyecto
  - [x] 18.1 Actualizar `docs/caracteristicas/suscripciones_pagos.md`: documentar el concepto de plan personalizado, el uso de `assigned_business_id`, la nueva firma de `canSeeSubscriptionMenu`, el hook `useCustomPlan` y los componentes `CustomPlanCard`/`CustomPlanBlockedScreen`.
  - [x] 18.2 Actualizar `.kiro/steering/suscripciones.md` para reflejar que la excepción del negocio 10001 se resuelve ahora por dato (`assigned_business_id`) en vez de comparación literal contra un UUID en código.

## Notas

- Las tareas marcadas con `[Manual]` requieren ejecutar comandos vía MCP de Supabase (`apply_migration`, `execute_sql`, `get_advisors`), no son commits de código.
- El orden Bloque 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 es estricto porque cada bloque depende del anterior a nivel de esquema o de datos.
- La UI de los bloques 3 a 6 puede mergearse ANTES de correr la migración de datos del bloque 2 sin romper la app: `useCustomPlan()` retornará `hasCustomPlan = false` mientras el UPDATE del negocio 10001 no se aplique, así que el 10001 seguirá viendo su plan Mensual actual hasta que se ejecute la task 4.
- Ninguna tarea toca `current_period_end`, `current_period_start`, `next_billing_date` ni `status` del negocio 10001. Solo se modifica `plan_id`.
- No se agregan tests automatizados nuevos porque el flujo depende del widget de Wompi (externo) y de RLS de Supabase; la verificación queda como pasos manuales en el Bloque 8.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "2.3"] },
    { "id": 6, "tasks": ["4.1"] },
    { "id": 7, "tasks": ["4.2"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["5.2", "5.3"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["6.2"] },
    { "id": 12, "tasks": ["7.1", "8.1"] },
    { "id": 13, "tasks": ["7.2", "7.3", "7.4", "8.2", "8.3", "8.4"] },
    { "id": 14, "tasks": ["9.1"] },
    { "id": 15, "tasks": ["9.2", "9.3", "7.5"] },
    { "id": 16, "tasks": ["10.1", "10.2", "10.3", "11.1", "11.2", "12.1", "12.2", "13.1", "13.2", "13.3"] },
    { "id": 17, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 18, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "17.1", "17.2"] },
    { "id": 19, "tasks": ["18.1", "18.2"] }
  ]
}
```
