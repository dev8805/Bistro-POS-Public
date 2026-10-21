# Estado actual de la implementación

> **Para el agente que continúa este Spec en otra sesión.** Este documento es el puente entre el spec planeado y lo que realmente se construyó. Léelo después de `requirements.md` y `design.md`. Las decisiones aquí documentadas se tomaron durante la implementación y NO están en los otros documentos.

## Resumen ejecutivo

- **Fase 1 — Frontend con datos de prueba**: ✅ COMPLETA. Build pasa limpio (`npm run build`).
- **Fase 2 — Backend en Supabase**: 🟡 PARCIAL. Se aplicaron tareas 9 y 10 (tabla + función central). Triggers (tareas 11-14) y demás están pendientes.
- **Fase 3 — Conexión real**: ⏳ NO INICIADA. Los hooks viven en modo mock leyendo de `lib/activityMockData.ts`.

## Estado de la base de datos (verificable con MCP supabase)

> Regla del workspace (`supabase-rules.md`): **NUNCA** confiar en archivos locales en `supabase/`; verificar siempre con MCP.

Aplicado en producción (`pos2`, ref `hjjmwipqquynjopkswvu`):

- ✅ Tabla `public.audit_events` creada con sus 11 columnas, 3 índices y RLS activo (1 política SELECT por business_id).
- ✅ Función `public.log_audit_event(...)` creada como `SECURITY DEFINER` con `search_path` fijo. Revocados `EXECUTE` para `anon` y `authenticated`. Solo es invocable desde funciones internas (los futuros triggers).
- ❌ Ningún trigger de auditoría aún. La tabla está vacía.
- ❌ Columnas `is_signed_in`, `last_login_at`, `last_logout_at` en `profiles`: **no existen aún**. Es la tarea 20.
- ❌ Tabla `business_devices` (nueva, ver más abajo): **no existe aún**.

Verificación rápida en cualquier sesión nueva:

```sql
-- Existencia de la tabla y la función
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_events') AS audit_events_existe,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='log_audit_event') AS log_audit_event_existe,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_signed_in') AS columna_is_signed_in;
```

## Archivos NUEVOS creados en frontend (Fase 1)

### Datos y tipos
- `lib/activityMockData.ts` — fuente única de datos mock con tipos compartidos (`AuditEvent`, `PresenceUser`, `AuditCategory`, `AuditSeverity`, `PresenceStatus`). Incluye 5 empleados que cubren los 4 casos operativos (Activo, Inactivo por sin actividad, Inactivo por sin internet, Desconectado) y 16 eventos cubriendo todas las categorías y severidades.
- `lib/deviceInfo.ts` — detector real de dispositivo (sirve tal cual en producción). Genera `device_id` UUID persistente en `localStorage`. Deriva `defaultLabel` ("Chrome en Windows"), `type` (desktop/tablet/mobile), `os`, `browser` desde `userAgent`. También expone `deriveDefaultLabelFromUA()` y `deriveDeviceTypeFromUA()` para usar en otros lados.
- `lib/deviceAliasStore.ts` — store mock que **simula la futura tabla `business_devices`**. Pre-poblado en `localStorage` con 4 dispositivos seed. Pub/sub para reactividad. API: `getAll`, `getDevice`, `resolveLabel`, `setAlias`, `upsertSeen`, `subscribe`, `reset`.

### Hooks
- `hooks/useEmployeePresence.ts` — clasifica con la lógica del modelo Opción B (`is_signed_in` + `is_in_presence` + `last_activity_at`). Re-cálculo periódico cada 30s. Detecta `online`/`offline` del observador.
- `hooks/useAuditEvents.ts` — paginación, filtros (fecha, empleado, categoría, severidad, búsqueda libre), persistencia en URL como query string. Aviso si rango >90 días.
- `hooks/useDeviceAliases.ts` — consumo reactivo del `deviceAliasStore`. Expone `devices`, `resolveLabel`, `getDevice`, `setAlias`.

### Pantalla y componentes
- `screens/ActivityScreen.tsx` — pantalla con dos pestañas. Header en una sola fila (pestañas a la izquierda, botón "Dispositivos" + badge "X en vivo" a la derecha).
- `components/activity/PresenceList.tsx` — lista con avatar, rol, dispositivo (alias o default), badges "Caja abierta" y "Sin conexión", tiempo desde login y de última actividad. Estilo opaco para `desconectado`.
- `components/activity/EventRow.tsx` — fila/card de evento con icono de categoría, descripción, severidad, distintivos "Cuenta archivada"/"Cuenta eliminada".
- `components/activity/EventFilters.tsx` — usa el `CustomDateRangePicker` (mismo que Dashboard/Sales) para "Personalizado". Selects nativos con flecha custom para empleado/categoría/severidad.
- `components/activity/EventDetailModal.tsx` — modal con metadata legible (no muestra UUIDs feos). Resuelve `device_id` a label vía `useDeviceAliases`. Botones de vínculo cruzado: Ver venta, Ver reporte del empleado, Filtrar por empleado.
- `components/activity/DeviceManagementModal.tsx` — modal accesible desde el header con botón "Dispositivos". Permite asignar/editar/borrar alias con edición inline.
- `components/activity/OfflineCausesBadge.tsx` — badge "Sin conexión" interactivo. Al pulsarlo abre popover con 5 causas en lenguaje claro.
- `components/activity/labels.ts` — constantes compartidas: `CATEGORY_LABELS`, `CATEGORY_ICONS`, `SEVERITY_BADGE`, `SEVERITY_DOT`, `SEVERITY_LABELS` y opciones de filtros.

## Archivos EXISTENTES modificados

- `types.ts` — agregado `ACTIVITY = 'ACTIVITY'` al enum `Screen`.
- `hooks/usePermissions.ts` — caso `Screen.ACTIVITY` → `admin_users || admin_settings || isSuperAdmin`.
- `App.tsx` — `React.lazy` import de `ActivityScreen` + bloque condicional de render.
- `components/Sidebar.tsx` — ítem "Actividad" con icono `monitoring` añadido a la sección "Equipo" (escritorio y móvil).
- `components/modals/EmployeeReportActionsModal.tsx` — nueva prop `onViewEvents` y botón "Ver eventos de este empleado" debajo de las acciones del reporte.
- `screens/SalesScreen.tsx` — cablea `onViewEvents` en el modal del reporte; navega a `Screen.ACTIVITY` con el `user_id` y `preset=30days` pre-cargados en query string.

## Decisiones de implementación tomadas durante la conversación (no en design.md)

Estas decisiones quedaron en el código pero conviene tenerlas documentadas:

1. **Sin pantalla actual en presencia**: el campo `screen` se eliminó del `PresenceUser` y del payload `track()`. Razón: aporta poco valor operativo, genera tráfico Realtime extra en cada navegación, sensación vigilante. Slack/Teams no muestran pantalla actual.

2. **Modelo de presencia Opción B (tres fuentes)**: clasificación basada en `profiles.is_signed_in` + presencia en canal + `last_activity_at`. Distingue "perdió internet" (Inactivo) de "cerró sesión" (Desconectado). Slack y Teams **no** distinguen estos casos; para POS sí importa.

3. **Sistema de alias de dispositivos (Opción B con backend pendiente)**: además de detección automática del navegador, el admin puede renombrar dispositivos. Hoy en frontend con mock store en `localStorage`. La migración de la tabla `business_devices` se añadió como tarea 26 en `tasks.md` (ver más abajo).

4. **`OfflineCausesBadge` interactivo**: al hacer click sobre el badge "Sin conexión" se abre un popover con 5 causas posibles en lenguaje del dueño (sin internet, cerró pestaña, dispositivo bloqueado, app en segundo plano, dispositivo dormido), porque "Sin conexión" es categórica, no diagnóstica.

5. **Estética del header**: se quitó el título "Actividad" y subtítulo. Pestañas y acciones (botón "Dispositivos" + badge "X en vivo") quedan en una sola fila para ahorrar espacio vertical.

6. **Filtro de fecha del visor**: usa el mismo `CustomDateRangePicker` que `DashboardScreen` y `SalesScreen` (calendario visual con selección de rango), no inputs `dd/mm/aaaa` separados.

7. **Selects con flecha custom**: en el visor de eventos, los `<select>` nativos se renderizan con `appearance: none` + `bg-none` para evitar la doble flecha (la nativa del navegador y la del plugin `@tailwindcss/forms`).

## Tabla `business_devices` pendiente (Fase 2)

El frontend ya consume esta tabla a través de `lib/deviceAliasStore.ts`. Esquema propuesto (aditivo, no afecta nada existente):

```sql
CREATE TABLE public.business_devices (
    device_id     uuid PRIMARY KEY,             -- UUID generado por el cliente (localStorage)
    business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    alias         text NULL,                    -- nombre asignado por el admin (null = usar default_label)
    default_label text NOT NULL,                -- derivado del user_agent ("Chrome en Windows")
    user_agent    text NOT NULL,
    device_type   text NOT NULL CHECK (device_type IN ('desktop','tablet','mobile')),
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_devices_business ON public.business_devices (business_id, last_seen_at DESC);

ALTER TABLE public.business_devices ENABLE ROW LEVEL SECURITY;

-- SELECT y UPDATE/INSERT solo para usuarios del mismo business (admins en frontend)
CREATE POLICY business_devices_select_own ON public.business_devices
  FOR SELECT TO authenticated
  USING (business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY business_devices_upsert_own ON public.business_devices
  FOR INSERT TO authenticated
  WITH CHECK (business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY business_devices_update_own ON public.business_devices
  FOR UPDATE TO authenticated
  USING (business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid()));
```

En Fase 3 (Tarea 22), `useDeviceAliases.ts` cambia de leer del `localStorage` a leer/escribir en esta tabla. La interfaz del hook ya está alineada para que sea cambio mínimo: las funciones `getAll`, `setAlias`, `upsertSeen`, `subscribe` se mapean directamente a operaciones Supabase.

## Cómo continuar en otra sesión

Orden recomendado de retomar:

1. **Verificar estado real de la BD** con MCP (la consulta SQL del bloque "Estado de la base de datos" arriba).
2. **Tarea 11 (triggers de venta)**: aplicar 11.1 → pausar y validar en producción → 11.2 → pausar → 11.3 → pausar. Cada trigger blindado con `EXCEPTION WHEN OTHERS`.
3. **Tareas 12-14** del mismo modo (uno por uno con verificación).
4. **Tarea 16** validación de no-regresión completa.
5. **Tarea 20** migración `is_signed_in` en `profiles` y **Tarea 26** (nueva) migración `business_devices`.
6. **Tareas 21, 18, 19** lógica de cliente para auth + change-pin.
7. **Fase 3** (tareas 22-25): conectar hooks a tablas reales, quitar mocks.

> **Despliegue confirmado: Opción B**. Migraciones directo a `pos2` fuera de hora pico, una a la vez, con verificación inmediata. No hay rama de Supabase.

## Convenciones del workspace que aplican

Estas reglas vienen en `.kiro/steering/` y se aplican automáticamente:

- `tech.md` — stack: React 19, TS 5.8, Tailwind 3, Supabase, IndexedDB offline, Capacitor Android.
- `code-conventions.md` — español nativo, tono didáctico, ASCII para validar UI antes de implementar, `early returns`, `handle*` para handlers.
- `react-patterns.md` — verificar antes de crear, no objetos inline en props, no fetch directo en componentes.
- `supabase-rules.md` — siempre verificar BD con MCP antes de actuar.
- `structure.md` — convención de directorios y soporte offline obligatorio para flujos clave.

## Estado de Fase 1 — checklist visual

```
✅ lib/activityMockData.ts
✅ lib/deviceInfo.ts
✅ lib/deviceAliasStore.ts
✅ hooks/useEmployeePresence.ts
✅ hooks/useAuditEvents.ts
✅ hooks/useDeviceAliases.ts
✅ screens/ActivityScreen.tsx
✅ components/activity/PresenceList.tsx
✅ components/activity/EventRow.tsx
✅ components/activity/EventFilters.tsx
✅ components/activity/EventDetailModal.tsx
✅ components/activity/DeviceManagementModal.tsx
✅ components/activity/OfflineCausesBadge.tsx
✅ components/activity/labels.ts
✅ types.ts (Screen.ACTIVITY)
✅ hooks/usePermissions.ts
✅ App.tsx
✅ components/Sidebar.tsx
✅ components/modals/EmployeeReportActionsModal.tsx
✅ screens/SalesScreen.tsx
✅ npm run build OK
```


---

## Actualización — Backend aplicado y conexión real (sesión 2)

**Fase 2 (backend en `pos2`) — aplicada:**
- ✅ 11 triggers de auditoría instalados (ventas, ítems, devoluciones, caja open/close, mermas, gastos, productos crear/precio/eliminar, promociones, negocio/impresora, roles, usuarios). Todos `SECURITY DEFINER` + `search_path` fijo + `EXCEPTION WHEN OTHERS` + `EXECUTE` revocado a anon/authenticated.
- ✅ `log_audit_event` (central) y `log_auth_event` (RPC para `login.success`/`logout`, expuesto solo a `authenticated`).
- ✅ `purge_old_audit_events(days=90)` función de retención (no programada).
- ✅ Columnas `profiles.is_signed_in`, `last_login_at`, `last_logout_at` + índice.
- ✅ Tabla `business_devices` con RLS por business_id.
- ✅ Prueba end-to-end en negocio 10000 (Tienda de la Esquina, `1e64bb14-27fc-4f76-8470-29e17253423f`): insert de gasto → evento generado → limpieza total. Sin residuo.
- ✅ `get_advisors` security: la única alerta nueva (funciones de trigger expuestas como RPC) se corrigió revocando EXECUTE. El resto de advertencias son preexistentes de otras funciones.

**Fase 3 (conexión frontend → real) — aplicada en rama:**
- ✅ `lib/auditClient.ts` (auditAuthEvent, markSignedIn, markSignedOut).
- ✅ `context/AuthContext.tsx`: `login.success` + `markSignedIn` en SIGNED_IN (dedupe por uid); `logout` + `markSignedOut` antes de `signOut()`.
- ✅ `hooks/useAuditEvents.ts` → consulta real a `audit_events` (filtros server-side, paginación, RLS).
- ✅ `hooks/useEmployeePresence.ts` → cruza `profiles.is_signed_in` + `presenceState()` + postgres_changes.
- ✅ `hooks/usePresenceBroadcast.ts` → montado en `App.tsx`; track() con actividad humana (throttle 30s); upsert a `business_devices`.
- ✅ `hooks/useDeviceAliases.ts` → lee/escribe `business_devices` real.
- ✅ `npm run build` OK.

**Pendiente (no crítico):**
- ⏳ Tarea 17: `supabase gen types` / `migration fetch` para sincronizar tipos locales (opcional; el código usa tipos manuales).
- ⏳ Tarea 19: registrar `pin.changed` en edge function `change-pin` (requiere editar y `deploy_edge_function`).
- ⏳ Tarea 24/25: pruebas manuales con dos sesiones simultáneas + verificación final de no-regresión en la app real.
- ⏳ `login.failed`: diferido (atribuir business_id antes de autenticar es no trivial; ver R7.2).
- ⏳ Mejora opcional: `worker: true` en el cliente Realtime (evita silent disconnects en pestañas en background); requiere asset de Web Worker.
- 🧹 `lib/deviceAliasStore.ts` y `lib/activityMockData.ts` quedaron como mock huérfano; `activityMockData.ts` aún provee los TIPOS (`AuditEvent`, etc.) que usan los componentes, así que NO borrar sin antes mover los tipos. `deviceAliasStore.ts` ya no se usa en runtime.

---

## Actualización — Hora real de inicio de sesión (sesión 3)

**Fix aplicado en `hooks/useEmployeePresence.ts`:**

- Problema: el "desde HH:MM" usaba `login_at` del payload del canal de presencia, que es efímero. En cada reconexión del websocket (inactivo→activo, pérdida/recuperación de internet) ese valor se reiniciaba, mostrando una hora reciente en lugar de la hora real de inicio de sesión.
- Solución: priorizar `profiles.last_login_at` (autoritativo, escrito por `markSignedIn` solo en `SIGNED_IN` genuino) sobre el `login_at` efímero del canal.
  - `fetchSignedIn` ahora hace `.select('id, full_name, role, last_login_at')`.
  - El `useMemo` construye `login_at: p.last_login_at ?? pres?.login_at ?? null`.
- `last_login_at` queda estable a través de reconexiones del canal porque `markSignedIn` solo se invoca en login real (dedupe por uid; `INITIAL_SESSION` se salta).
- ✅ `npm run build` OK. Sin diagnostics.

---

## Actualización — Opción A: hora de login estable + corte de login.success espurios (sesión 3)

**Causa raíz hallada (verificada en `pos2`, negocio 10000):**
- `auth.users.last_sign_in_at` de Alejandro = 19/jun 22:32 (único login real con credenciales).
- `profiles.last_login_at` saltaba (08:54 → 09:05 → 09:09) y `audit_events` tenía 3 `login.success` sin un solo `logout`.
- Motivo: el evento `SIGNED_IN` de supabase-js se redispara por reconexión de red, recuperación de foco y recarga de webview (común en Android). Se escribía `last_login_at = now()` en cada uno. El dedupe en memoria (`loggedInUidRef`) se perdía al reiniciarse la webview.

**Fix (solo frontend, riesgo bajo):**
- `lib/auditClient.ts`: `markSignedIn(userId, loginAt?)` ahora escribe `last_login_at = loginAt` (la hora real del sign-in), no `now()`. Idempotente: aunque se repita, escribe el mismo valor.
- `context/AuthContext.tsx`:
  - Pasa `session.user.last_sign_in_at` a `markSignedIn`.
  - Dedupe persistente en `localStorage` (`bistro_signin_mark` = `uid|last_sign_in_at`) que sobrevive recargas. Solo registra `login.success` + `markSignedIn` cuando la firma cambia (login genuino nuevo). `SIGNED_OUT` limpia la marca.
- ✅ `npm run build` OK. Sin diagnostics.

**Corrección del dato histórico:** no se tocó la BD manualmente. En la próxima carga con el código nuevo, el primer `SIGNED_IN` reescribirá `last_login_at` con la hora real (`last_sign_in_at`) y a partir de ahí queda estable.

**No cambia el modelo de presencia:** Desconectado sigue siendo `is_signed_in=false` (solo logout explícito). Sin internet / cerrar pestaña = Inactivo. Caso "colgado" (cierra pestaña sin logout → Inactivo indefinido) sigue pendiente, fuera de alcance de esta sesión.

---

## Actualización — Bug de logout que no se propagaba (sesión 3)

**Síntoma reportado:** en `localhost` y en el túnel Cloudflare (`dev.posbistro.online`), al pulsar "Cerrar sesión" y refrescar, la sesión volvía (no iba a login). En producción (Firebase Hosting) NO pasaba. Además en Supabase `is_signed_in` seguía `true` y no se registraba ningún evento `logout`.

**Causa raíz (confirmada):** en `signOut()` de `context/AuthContext.tsx`, el bloque que libera el push hacía `await navigator.serviceWorker.ready`. Según MDN, esa promesa **nunca se rechaza y espera indefinidamente** hasta que haya un SW activo. `vite-plugin-pwa` NO registra SW en dev (no hay `devOptions.enabled` en `vite.config.ts`), y tanto localhost como el túnel sirven el dev server → sin SW → el `await` colgaba TODO el logout. Nunca corrían `markSignedOut()`, `auditAuthEvent('logout')`, `supabase.auth.signOut()` ni el borrado de claves `sb-*`. En producción el SW está activo → resolvía y el logout se completaba.

**Fix (frontend, bajo riesgo):** guardar el bloque con `navigator.serviceWorker.controller` (en dev es null → se salta sin esperar) y un `Promise.race` con timeout de 2s como defensa. El resto del logout ahora siempre se ejecuta.

- ✅ `npm run build` OK. Sin diagnostics.

**Relación con el "caso colgado":** este fix cubre el logout en dev (con internet, sin SW). El logout **sin internet** sigue sin propagarse (markSignedOut es best-effort por red) — eso es el caso colgado pendiente (camino A: encolar en offline queue; camino B: purgador server-side por inactividad).

**Dato de Alejandro:** su `is_signed_in` quedó `true` (colgado por este bug). Se corrige solo cuando haga un logout exitoso con el código nuevo, o con un UPDATE manual en el negocio de pruebas (pendiente de OK del usuario).

---

## Actualización — Gestión de dispositivos / alias DESACTIVADA (sesión 3)

**Qué se desactivó (a pedido del usuario):**
- Botón "Dispositivos" y modal `DeviceManagementModal` ocultos en `ActivityScreen`.
- `usePresenceBroadcast` ya NO escribe en `business_devices` (se eliminó `upsertDevice`). **La tabla `business_devices` queda vacía/estática.**

**Cómo se conserva el "sistema" del dispositivo sin la tabla:**
- El `device_label` y `device_type` (derivados del user_agent) ahora viajan en el payload del canal de presencia (`PresencePayload` en `lib/presenceManager.ts`).
- `PresenceList` los lee del payload (ya no usa `useDeviceAliases`).
- `EventDetailModal` muestra `metadata.device_label` del propio evento (ya no usa `useDeviceAliases`).

**⚠️ IMPORTANTE — la tabla `business_devices` SIGUE EXISTIENDO en Supabase (`pos2`):**
- Tiene RLS por business_id. Está vacía porque se desconectó el escritor.
- Si en el futuro se reactiva la gestión de alias de dispositivos, hay que:
  1. Restaurar `upsertDevice` en `hooks/usePresenceBroadcast.ts`.
  2. Volver a renderizar el botón + `DeviceManagementModal` en `screens/ActivityScreen.tsx`.
  3. Volver a usar `hooks/useDeviceAliases.ts` en `PresenceList` y `EventDetailModal`.

**Archivos que quedaron sin uso en runtime (NO borrados, listos para reactivar):**
- `components/activity/DeviceManagementModal.tsx`
- `hooks/useDeviceAliases.ts`
- `lib/deviceAliasStore.ts`

- ✅ Sin diagnostics. Build pendiente de verificación.

---

## Actualización — Fix auditoría de devoluciones ($0 e ítems vacíos) (sesión 3)

**Bug:** los eventos `sale.refunded` aparecían con "por $0" e ítems vacíos.

**Causa:** la RPC `process_sale_refund` inserta `sale_refunds` con `total_amount=0`, luego inserta los `sale_refund_items` y al final hace `UPDATE` del total real. El trigger `audit_refund_insert` corría en el `AFTER INSERT`, capturando el estado inicial (total=0, sin ítems).

**Fix (DDL en `pos2`, riesgo bajo):**
- Se eliminó el trigger `audit_refund_insert` (AFTER INSERT) y su función.
- Nueva función `audit_refund_complete()` + trigger `audit_refund_complete` **AFTER UPDATE** en `sale_refunds`, que audita solo en la transición `total_amount 0 → valor`. En ese momento el monto es el final y los ítems ya existen.
- `EXCEPTION WHEN OTHERS` mantenido (tolerante a fallos). `EXECUTE` revocado de `PUBLIC`/`anon`/`authenticated` (verificado).

**Pendiente de verificación:** hacer una NUEVA devolución de prueba en negocio 10000 y confirmar que el evento muestra monto e ítems correctos. El evento viejo de "$0" (refund `f1ba37cf-...`) quedó registrado con el dato incorrecto; se puede borrar si estorba (negocio de pruebas).

---

## Actualización — Refinamientos del visor de eventos (sesión 3, continuación)

Tras desactivar la gestión de dispositivos, se hicieron múltiples ajustes de UX/datos en el visor de eventos y sus deep-links. Resumen por tema.

### Frontend — limpieza del visor / filtros
- **`?preset` pegado en la URL**: `useAuditEvents` ya NO escribe los filtros en la URL en cada cambio (vivían en estado y dejaban `?preset=today` pegado al salir). Ahora la URL se lee una sola vez al montar (para el vínculo cruzado `?user=`) y se limpia al instante. Filtro por defecto: "Últimos 7 días".
- **Etiquetas de acción en español**: nuevo mapa `ACTION_LABELS` + `labelForAction()` en `components/activity/labels.ts`. El campo "Acción" del detalle muestra la etiqueta en español (la clave técnica, ej. `sale.refunded`, NO cambia en BD). Cubre todas las acciones conocidas.
- **Campos ocultos del detalle** (`HIDDEN_META_KEYS` en `EventDetailModal`): `sale_id`, `order_item_id`, `order_number`, `display_number`, `cash_shift_id`, `register_name` (UUIDs internos / redundantes con el título). `sale_id`/`cash_shift_id` se siguen leyendo internamente para los botones de deep-link.
- **Montos con formato**: campos monetarios del detalle (`amount`, `total_price`, `price`, `price_before/after`, `unit_price`, `opening_balance`, `declared_cash`, `expected_cash`, `difference`, `total_loss`) se muestran con `formatCurrency` (es-CO, sin decimales, punto de miles).
- **Apertura de caja no interactiva**: `EventRow` acepta `onClick` opcional; `ActivityScreen` define `NON_DETAIL_ACTIONS = {'cash.shift.opened'}` y no le pasa click (su detalle es redundante con la descripción).
- **Alineación de badges**: la flecha `>` de `EventRow` siempre ocupa su espacio (invisible cuando no es clickeable), para que el badge de severidad quede en la misma columna en todas las filas.

### Backend — formato de montos en descripciones (migraciones en `pos2`)
- **Helper `fmt_money(numeric)`**: punto de miles, sin decimales (`50000 → "50.000"`). `IMMUTABLE`, `search_path=''`.
- Triggers actualizados para usar `fmt_money` o `round(...)::bigint` en la descripción: `audit_orders_void`, `audit_refund_complete`, `audit_shift_open`, `audit_shift_close`, `audit_expense_insert`, `audit_product_update`. (Solo afecta el TEXTO de eventos NUEVOS; los viejos conservan su descripción.)

### Backend — devolución de venta (bug $0)
- El evento `sale.refunded` salía con "$0" e ítems vacíos porque el trigger corría en el `INSERT` de `sale_refunds` (antes del total y los ítems). Se cambió: trigger `audit_refund_insert` eliminado; nuevo `audit_refund_complete` **AFTER UPDATE** que audita en la transición `total_amount 0 → valor`. EXECUTE revocado.

### Backend — caja: nombre de la caja
- `audit_shift_open`/`audit_shift_close` ahora ponen el **nombre de la caja** (`cash_registers.name` vía `register_id`) en la descripción: `Abrió/Cerró la caja «Caja principal» ...`. Fallback a `#shift_number`.
- `audit_shift_close` agrega `shift_number` a la metadata (para mostrar "Turno" en el detalle sin el UUID).

### Frontend — deep-links
- **"Ver venta"** (eventos de venta): `ActivityScreen.handleViewSale(saleId)` escribe `?sale=<id>` y navega a `SALES`. `useSalesHistory` expone `fetchOrderById(id)` (mismo `ORDER_SELECT`, extraído a constante + `transformOrder`). `SalesScreen` captura `?sale` síncrono al montar, espera `business_id` y abre la venta puntual (aunque no esté en la página). Limpia el `?sale`.
- **"Ver reporte"** en cierre de caja: nueva prop `onViewShiftReport` en `EventDetailModal`. `ActivityScreen.handleViewShiftReport(shiftId)` escribe `?shift=<id>` y navega a `CASH_REGISTER` (sidebar). `CashRegisterScreen` lee `?shift` al montar, carga el turno (mismo select de cierre online) y abre su detalle (`viewMode='detail'`).
- **"Ver reporte" genérico** (que iba a Ventas) se ocultó para categorías donde no aplica: `sale`, `cash.shift.closed`, `inventory`, y eventos con `items` array. Cuando queda solo "Filtrar empleado", el layout pasa a 1 columna (centrado).

### Inventario — ajuste agrupado (Opción 1)
- **Problema**: el conteo de inventario inserta una merma por producto (`reason='AJUSTE DE INVENTARIO'`) → una línea por producto en el visor. Patrón de industria (Shopify/Lightspeed/Square/Shopmonkey) = un conteo es UNA entrada agrupada.
- **Backend**: `audit_wastage_insert` ahora **ignora** `reason='AJUSTE DE INVENTARIO'` (las mermas manuales siguen individuales). Nuevo RPC `log_inventory_adjustment(p_items jsonb)` (SECURITY DEFINER, expuesto a `authenticated`; actor/negocio del JWT) que inserta UN evento `inventory.adjustment` con `count`, `total_loss`, `items`.
- **Frontend**: `AdjustmentRecord` lleva ahora `value` y `unit`. `InventoryScreen` llama `logInventoryAdjustment(items)` (en `lib/auditClient.ts`) tras `handleSaveAll` y `handleSaveProduct`.
- **Detalle**: acción "Ajuste de inventario", "Productos" (count) y "Pérdida total" ($). El desglose de productos NO es inline: botón **"Ver productos"** abre un sub-modal (portal z-[95]) con la lista (nombre, -cantidad unidad, $valor). `EventDetailModal` usa `useState`/`useEffect` (reset al cambiar de evento).

### Estado de verificación
- ✅ Todos los cambios con `npm run build` OK y sin diagnostics.
- ⏳ Pruebas funcionales pendientes del usuario: devolución (monto/ítems), apertura/cierre de caja con nombre, "Ver venta"/"Ver reporte" deep-links, conteo de inventario agrupado, merma individual.
- 🧹 Pendiente menor sugerido (no pedido aún): ocultar `product_id` (UUID) en el detalle de merma individual; unidad en la descripción de merma manual.

---

## Actualización — Gastos, eliminaciones y productos (sesión 3, cont.)

### Gastos (categoría `expense`)
- **Backend**: `audit_expense_insert` ahora guarda la observación del gasto (`expenses.description`) en la metadata como `note` (vacío → null).
- **Frontend**: el botón "Ver reporte" se reemplazó por **"Detalles"** (sub-modal): muestra la observación (`note`) o "Sin detalles" si no hay. `note` se oculta del detalle técnico (solo se ve en el botón). El botón "Detalles" aparece en categorías sin botón propio (gastos, auth, productos→cambiado luego, promociones, usuarios, permisos, negocio, impresora); NO en ventas, cierre de caja ni inventario.
- **Método de pago traducido**: `PAYMENT_METHOD_LABELS` en `EventDetailModal` (cash→Efectivo, card→Tarjeta, nequi, daviplata, transfer→Transferencia, credit→Crédito, other→Otro, mixed→Mixto). Aplicado en `renderMetaValue`.

### Auditoría de ELIMINACIÓN (nuevos triggers AFTER DELETE en `pos2`)
Confirmado que `expenses` y `wastage` se eliminan con DELETE real. El actor se deriva de `auth.uid()` (quien elimina), no de `created_by`.
- `audit_expense_delete` → `expense.deleted` (warning): "Eliminó un gasto de $X (Categoría)". metadata incluye `note`.
- `audit_wastage_delete` → distingue por `reason`:
  - `reason != 'AJUSTE DE INVENTARIO'` → `inventory.merma.deleted` (warning): "Eliminó la merma de «producto»".
  - `reason = 'AJUSTE DE INVENTARIO'` → `inventory.adjustment.reverted` (warning): "Revirtió un ajuste de inventario de «producto»" (cubre el botón "Revertir" del Historial de ajustes).
- Ambas funciones con `EXCEPTION WHEN OTHERS` y EXECUTE revocado (verificado).
- ACTION_LABELS añadidos: `expense.deleted`='Eliminación de gasto', `inventory.merma.deleted`='Eliminación de merma', `inventory.adjustment.reverted`='Reversión de ajuste'.

### Productos (categoría `product`)
- **Traducción de claves/valores en el detalle**: `type`→"Tipo", `price`→"Precio". Valores de tipo traducidos vía `PRODUCT_TYPE_LABELS`: `simple`→**"Retail"**, `processed`→"Procesado", `service`→"Servicio".
- **Botón "Ver producto"** (en eventos de categoría producto): abre un sub-modal que carga el **estado ACTUAL** del producto desde `products` por `product_id` (nombre, tipo, precio actual, stock+unidad, estado Activo/Inactivo). Si fue eliminado: "Este producto ya no existe". Sin navegación (se eligió Opción C sobre abrir la pantalla de edición). Requirió importar `supabase` en `EventDetailModal` y `useState`/`useEffect` para el fetch.
- Acciones auditadas en productos (sin cambios de trigger esta vez): `product.created` (info), `product.price.changed` (warning), `product.deleted` (critical).

### Verificación
- ✅ Todo con `npm run build` OK, sin diagnostics.
- ⏳ Pruebas funcionales del usuario pendientes: eliminar gasto/merma, revertir ajuste, crear/editar precio/eliminar producto, "Ver producto", "Detalles" de gasto con observación.
- 🧹 Pendiente menor sugerido (no pedido): ocultar `product_id`/`expense_id` (UUID) del detalle; unidad en la descripción de merma manual; revisar `origin` en cambio de precio.

---

## Actualización — Promociones (verificación) y rediseño de auditoría de Usuarios (sesión 3, cont.)

### Promociones
- Sin cambios de código. Triggers `audit_promotion_insert` (`promotion.created`, warning) y `audit_promotion_delete` (`promotion.deleted`, warning) ya existentes. NO se audita la edición de promociones. Pendiente de prueba funcional del usuario.

### Usuarios — bug encontrado y rediseño (Opción A)
**Bug**: al crear un empleado salían 2 filas ("Creó el usuario" rol Mesero + "Cambió el rol a Cajero") y como actor "Sistema" con badge "CUENTA ELIMINADA".

**Causa**: la gestión de empleados va por edge functions con **service role** (`create-employee`, `update-employee`, `delete-employee`), por lo que `auth.uid()` en el trigger `audit_profile_user` es **null** → eventos sin actor (`user_id` null). Además el flujo crea el perfil con rol default (trigger `handle_new_user`) y luego lo actualiza al rol real → doble evento.

**Solución aplicada (A):**
1. **Frontend** (`EventRow.tsx`): el badge "Cuenta eliminada" solo aparece si `user_id` null **y** `user_name` presente (actor cuya cuenta se borró). Sin actor → "Sistema" sin badge. (Build OK.)
2. **Trigger `audit_profile_user`** (migración en `pos2`): agrega `IF v_uid IS NULL THEN RETURN NULL` → ignora cambios server-side. Los cambios DIRECTOS desde el cliente (ej. permisos personalizados desde `EmployeesScreen`, con `auth.uid()` presente) se siguen auditando con el actor real.
3. **Edge functions** (desplegadas; registran el evento con el actor real extraído del JWT del request vía helper `logUserEvent`, best-effort con try/catch):
   - `create-employee` v23: un solo evento `user.created` ("Creó el usuario «X»") con el rol final.
   - `update-employee` v14 (verify_jwt=false; el header Authorization igual llega): lee el rol anterior y registra `user.role_changed` solo si cambió.
   - `delete-employee` v23: registra `user.archived` en `action='delete'` (soft-delete).

**Notas:**
- Permisos personalizados → categoría `permission` (`permissions.changed`), auditados por el trigger (cambio directo del cliente).
- Quedan 2 eventos viejos de prueba (empleado de prueba) con actor "Sistema"/null en negocio 10000; pendiente de decisión si se borran.
- ⏳ Pruebas funcionales del usuario pendientes: crear/cambiar-rol/archivar empleado → confirmar 1 evento por acción con el actor real (no "Sistema").

### Estado global de categorías del visor (resumen)
- ✅ Implementadas y refinadas: Autenticación, Ventas, Caja, Inventario, Gastos, Productos, Usuarios, Permisos, Negocio, Impresora.
- Cada categoría audita solo acciones sensibles (no cada operación). Montos con `fmt_money`/`formatCurrency` (punto de miles, sin decimales). Métodos de pago y tipos de producto traducidos en el detalle. Deep-links: "Ver venta" (Ventas), "Ver reporte" (cierre de caja → CashRegister), "Ver producto" (modal estado actual), "Detalles" (observación de gasto), "Ver productos" (desglose de ajuste de inventario).
- 🧹 Pendientes menores sugeridos (no pedidos): ocultar UUIDs restantes en detalle (`product_id`, `expense_id`, `promotion_id`, `target_user_id`); unidad en descripción de merma manual; revisar `origin` en cambio de precio; severidad de "crear promoción" (warning vs info); formatear `before`/`after` de permisos (hoy JSON inline).
