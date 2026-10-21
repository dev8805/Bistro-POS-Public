# Design Document

## Overview

Esta feature añade a Bistro POS dos capacidades para administradores y dueños:

1. **Presencia en tiempo real** (`Modulo_Presencia`): vista en vivo de empleados conectados, reutilizando el patrón de Supabase Realtime Presence que ya existe en `lib/kitchenCommandService.ts`.
2. **Visor de eventos** (`Modulo_Visor_Eventos`): registro cronológico filtrable de acciones sensibles, alimentado por una tabla nueva `audit_events` que se llena mediante **triggers de Postgres tolerantes a fallos** (acciones de datos) y un **logger de cliente** (eventos de autenticación).

Ambas viven en una pantalla nueva `Screen.ACTIVITY` con dos pestañas, accesible para `admin_users`, `admin_settings` o rol `Administrador`. La feature se vincula de forma cruzada con el `Reporte_Empleado` existente sin modificar su lógica de cálculo.

### Principio rector: cero impacto en la operación existente

Todo el diseño es **aditivo y no destructivo**. La regla número uno, dado que se tocan tablas de producción (`orders`, `products`, `cash_shifts`, etc.), es:

> **Un fallo en la auditoría NUNCA puede abortar una venta, una anulación, un cierre de caja ni ninguna escritura de negocio.**

Esto se garantiza con triggers `AFTER` cuya función envuelve toda su lógica en un bloque `EXCEPTION WHEN OTHERS` que traga el error (lo registra como `WARNING`) y deja continuar la transacción original.

## Estado real verificado en Supabase (proyecto `pos2`, ref `hjjmwipqquynjopkswvu`)

- `audit_events` **no existe** → se crea desde cero.
- RLS **activo** en las 11 tablas auditables.
- Triggers existentes que **no se tocan** y con los que hay que convivir (nombres distintos, no colisionan):
  - `orders`: `on_order_table_status`, `on_order_total_update_sync_payments`, `update_stock_on_order_complete`
  - `order_items`: `on_order_item_change`
  - `cash_shifts`: `on_cash_shifts_updated`, `trg_set_shift_number`
  - `products`: `on_products_updated`, `trigger_reset_alert_on_stock_increase`
  - `profiles`: `on_profile_phone_update`, `on_profiles_updated`
  - `businesses`, `roles`: triggers `on_*_updated`
- Columnas de actor confirmadas para derivar el `user_id` del evento: `orders.voided_by`, `order_items.voided_by`, `sale_refunds.refunded_by`, `cash_shifts.opened_by`/`closed_by`, `wastage.created_by`, `expenses.created_by`.
- No hay edge function que procese la cola offline (se confirma el enfoque por triggers).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                            CLIENTE (React)                            │
│                                                                      │
│  Screen.ACTIVITY                                                     │
│   ├── Pestaña "Empleados conectados"  → useEmployeePresence()        │
│   │      └── supabase.channel('presence:business-{id}')              │
│   └── Pestaña "Visor de eventos"      → useAuditEvents()             │
│          └── supabase.from('audit_events').select()...               │
│                                                                      │
│  AuthContext  → auditAuthEvent('login.success' | 'logout')           │
│                  (Audit_Logger_Cliente, solo eventos auth)           │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            SUPABASE                                   │
│                                                                      │
│  Realtime Presence  ←─ canal por business_id (no toca BD)            │
│                                                                      │
│  Tabla audit_events (NUEVA)  ◄──────────────────────────┐           │
│    RLS: SELECT por business_id; INSERT solo SECURITY DEFINER         │
│                                                          │           │
│  Triggers AFTER tolerantes a fallos (NUEVOS)            │ INSERT     │
│   ├─ orders         (solo cuando status→'voided')        │           │
│   ├─ order_items    (solo cuando status→'canceled')      │           │
│   ├─ sale_refunds   (INSERT)                             │           │
│   ├─ cash_shifts    (open/close)                         │           │
│   ├─ wastage        (INSERT)                             │           │
│   ├─ expenses       (INSERT)                             │           │
│   ├─ products       (price change / create / deactivate) │           │
│   ├─ promotions     (create / delete)                    │           │
│   ├─ profiles       (create / archive / role change)     │           │
│   ├─ roles          (permissions change)                 │           │
│   └─ businesses     (config / printer change)            │           │
│                                                                      │
│  Edge function change-pin (EXISTENTE, +1 insert audit)               │
└──────────────────────────────────────────────────────────────────────┘
```

## Cambios en Supabase (resumen para revisión)

> **Todos son aditivos. Ninguno altera ni borra tablas, columnas, datos, RLS o triggers existentes.**

### 1. Tabla nueva `audit_events`

```sql
CREATE TABLE public.audit_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_name       text,                 -- snapshot
    user_role       text,                 -- snapshot
    category        text NOT NULL,        -- auth | sale | cash | inventory | expense | product | promotion | user | permission | business_config | printer
    action          text NOT NULL,        -- ej. 'sale.voided', 'login.success'
    severity        text NOT NULL DEFAULT 'info',  -- info | warning | critical
    description     text NOT NULL,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_business_created   ON public.audit_events (business_id, created_at DESC);
CREATE INDEX idx_audit_business_user      ON public.audit_events (business_id, user_id, created_at DESC);
CREATE INDEX idx_audit_business_category  ON public.audit_events (business_id, category, created_at DESC);
```

### 2. RLS de `audit_events` (eventos inmutables)

```sql
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- SELECT: solo eventos de mi negocio
CREATE POLICY audit_select_own_business ON public.audit_events
  FOR SELECT TO authenticated
  USING (business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid()));

-- Sin políticas de INSERT/UPDATE/DELETE para clientes:
-- los INSERT entran por funciones SECURITY DEFINER (triggers + auth logger).
```

> Nota: la función de logger de auth será `SECURITY DEFINER` para poder insertar sin política de INSERT para el rol `authenticated`. Esto mantiene los eventos efectivamente inmutables desde el cliente.

### 3. Función e infraestructura de auditoría (tolerante a fallos)

```sql
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_business_id uuid, p_user_id uuid, p_user_name text, p_user_role text,
    p_category text, p_action text, p_severity text,
    p_description text, p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.audit_events(business_id, user_id, user_name, user_role,
        category, action, severity, description, metadata)
    VALUES (p_business_id, p_user_id, p_user_name, p_user_role,
        p_category, p_action, p_severity, p_description, COALESCE(p_metadata,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
    -- NUNCA propagar el error: la auditoría no puede romper la operación de negocio
    RAISE WARNING 'audit_events insert failed: %', SQLERRM;
END;
$$;
```

Cada trigger sigue este molde **blindado**:

```sql
CREATE OR REPLACE FUNCTION public.audit_orders_void() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Solo audita la transición a 'voided' (no las ventas normales)
  IF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status IS DISTINCT FROM 'voided' THEN
     PERFORM public.log_audit_event(
       NEW.business_id, NEW.voided_by,
       (SELECT full_name FROM profiles WHERE id = NEW.voided_by),
       (SELECT role      FROM profiles WHERE id = NEW.voided_by),
       'sale','sale.voided','warning',
       'Venta #'||COALESCE(NEW.display_number, NEW.order_number::text)||' anulada',
       jsonb_build_object('sale_id',NEW.id,'order_number',NEW.order_number,
                          'amount',NEW.total,'reason',NEW.void_reason)
     );
  END IF;
  RETURN NULL;  -- AFTER trigger
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'audit_orders_void failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_orders_void
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_orders_void();
```

Triggers nuevos a crear (todos con el patrón anterior, nombres con prefijo `audit_` para no colisionar):

| Tabla | Trigger nuevo | Dispara cuando |
|---|---|---|
| `orders` | `audit_orders_void` | `status` pasa a `voided` |
| `order_items` | `audit_order_item_void` | `status` pasa a `canceled` |
| `sale_refunds` | `audit_refund_insert` | INSERT |
| `cash_shifts` | `audit_shift_open` / `audit_shift_close` | INSERT / `closed_at` se setea |
| `wastage` | `audit_wastage_insert` | INSERT |
| `expenses` | `audit_expense_insert` | INSERT |
| `products` | `audit_product_price` / `audit_product_create` / `audit_product_deactivate` | `price` cambia / INSERT / `is_active`→false o DELETE |
| `promotions` | `audit_promotion_change` | INSERT / DELETE |
| `profiles` | `audit_profile_user` | INSERT / `is_deleted`→true / `role`,`role_id` cambian / `custom_permissions` cambian |
| `roles` | `audit_role_permissions` | `permissions` cambia |
| `businesses` | `audit_business_config` | datos de negocio / impresora cambian |

### 4. Retención (90 días en consulta caliente)

```sql
-- Ejecutable manualmente o por pg_cron si está disponible. No borra nada por sí solo hasta activarse.
DELETE FROM public.audit_events WHERE created_at < now() - interval '90 days';
```

Decisión de implementación: en Fase 2 la limpieza queda como función disponible pero **no programada**, para no borrar datos sin decisión explícita. La programación con `pg_cron` se evalúa en la fase de retención (Fase 5).

### 5. Edge function `change-pin` (existente): +1 inserción de auditoría

Único cambio en una función existente: tras cambiar el PIN con éxito, llamar a `log_audit_event` con `action='pin.changed'` (sin exponer el PIN). Es additivo y va envuelto en try/catch para no afectar el cambio de PIN.

### 6. Columnas nuevas en `profiles` para presencia

Para el modelo de presencia (Opción B), se añaden dos columnas a `profiles`. Ambas con `default false/null` y nullable, así son aditivas y no rompen filas existentes:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_signed_in   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_logout_at timestamptz NULL;

-- Índice para consultar quiénes tienen sesión iniciada en un negocio
CREATE INDEX IF NOT EXISTS idx_profiles_business_signed_in
  ON public.profiles (business_id, is_signed_in) WHERE is_signed_in = true;
```

Lógica desde el cliente:
- Login exitoso → `UPDATE profiles SET is_signed_in = true, last_login_at = now() WHERE id = auth.uid()`.
- Logout explícito → `UPDATE profiles SET is_signed_in = false, last_logout_at = now()` antes de `signOut()`.
- `auth.onAuthStateChange` con `SIGNED_OUT` → mismo update por si el JWT expira.
- RLS: el usuario solo puede actualizar su propia fila (ya cubierto por las políticas existentes de `profiles`).

### Lo que NO se toca

- No se modifican tablas, columnas, datos ni RLS existentes.
- No se alteran ni eliminan triggers actuales.
- No se cambia el flujo de login (la captura de IP queda fuera de alcance).
- No se toca la lógica de `lib/buildEmployeeReport.ts`.

## Seguridad en producción

| Riesgo | Mitigación en el diseño |
|---|---|
| Un trigger nuevo rompe una venta/cierre/anulación | Toda función de trigger envuelve su lógica en `EXCEPTION WHEN OTHERS` → el error se traga como `WARNING` y la transacción de negocio continúa. Imposible abortar la escritura original. |
| Sobrecarga de rendimiento en cada venta | Los triggers filtran al inicio (`IF status='voided'...`); en una venta normal el trigger evalúa una condición y sale (`RETURN NULL`) sin tocar `audit_events`. Coste despreciable. |
| Saturar `audit_events` con ventas normales | No se audita `sale.completed`. Solo excepciones (anulaciones, devoluciones) y cambios de estado. |
| Fuga entre negocios | RLS por `business_id` en SELECT; `business_id` tomado de la fila, no del cliente. |
| Inserciones maliciosas o manipulación | Sin política de INSERT/UPDATE/DELETE para clientes; eventos inmutables. |
| Colisión con triggers existentes | Prefijo `audit_` y triggers `AFTER` independientes; los existentes siguen intactos. |

### Plan de despliegue seguro recomendado

1. Aplicar las migraciones **fuera de hora pico**.
2. Como cada trigger es tolerante a fallos por diseño, el peor caso de un bug es "no se registró el evento", nunca "se cayó la venta".
3. Validar en una transacción de prueba (anular una venta de prueba) que el evento aparece y que la operación normal sigue intacta.
4. Si algo se comporta raro, los triggers se pueden desactivar individualmente con `DROP TRIGGER` sin afectar datos.

> **Decisión confirmada con el usuario: Opción B.** Las migraciones se aplican directo al proyecto `pos2`, fuera de hora pico, confiando en la tolerancia a fallos de los triggers y validando con una transacción de prueba inmediatamente después de cada migración. No se crea rama de desarrollo de Supabase.

## Data Models

`audit_events` (definida arriba). Forma del `metadata` por categoría:

| action | metadata relevante |
|---|---|
| `login.success` / `logout` | `user_agent`, `device_id`, `device_label`, `auth_provider` |
| `pin.changed` | `device_id` (nunca el PIN) |
| `sale.voided` | `sale_id`, `order_number`, `amount`, `reason` |
| `sale_item.voided` | `sale_id`, `order_item_id`, `product_name`, `amount`, `reason` |
| `sale.refunded` | `sale_refund_id`, `sale_id`, `amount`, `reason`, `items` |
| `cash.shift.opened` | `cash_shift_id`, `opening_balance` |
| `cash.shift.closed` | `cash_shift_id`, `declared_cash`, `expected_cash`, `difference` |
| `inventory.merma` | `product_id`, `product_name`, `quantity`, `amount`, `reason` |
| `expense.created` | `expense_id`, `amount`, `category`, `payment_method` |
| `product.price.changed` | `product_id`, `product_name`, `price_before`, `price_after`, `origin` |
| `permissions.changed` | `target_user_id`/`target_role_id`, `before`, `after` |
| `user.*` | `target_user_id`, `target_user_name`, rol(es) |
| `business.changed` / `printer.changed` | `before`, `after` (solo campos modificados) |

## Components and Interfaces

### Nuevos

- `screens/ActivityScreen.tsx` — contenedor con dos pestañas (Presencia / Visor). Gateada por `canAccessScreen(Screen.ACTIVITY)`.
- `hooks/useEmployeePresence.ts` — se une al canal `presence:business-{id}`, expone la lista consolidada con estados (`activo`/`inactivo`/`desconectado`). Reutiliza el patrón de `joinPrinterPresence`.
- `hooks/usePresenceBroadcast.ts` — emite el `track()` del usuario actual (heartbeat ≤60s, en cambios de caja/login/logout). El cambio de pantalla NO dispara `track()`. Montado a nivel de app cuando hay sesión.
- `hooks/useAuditEvents.ts` — consulta paginada de `audit_events` con filtros (fecha, empleado, categoría, severidad, búsqueda) y "Cargar más".
- `lib/auditClient.ts` — `Audit_Logger_Cliente`: helper que llama a `log_audit_event` vía RPC para eventos `auth`.
- `components/activity/PresenceList.tsx`, `EventRow.tsx`, `EventDetailModal.tsx`, `EventFilters.tsx`.

### Modificados (mínimo)

- `types.ts` — agregar `ACTIVITY = 'ACTIVITY'` al enum `Screen`.
- `App.tsx` — render condicional de `ActivityScreen` (revisando primero el mapa del archivo, según convenciones).
- `components/Sidebar.tsx` — nuevo ítem "Actividad", `access: canAccessScreen(Screen.ACTIVITY)`.
- `hooks/usePermissions.ts` — caso `Screen.ACTIVITY` → `admin_users || admin_settings` (o `isSuperAdmin`).
- `context/AuthContext.tsx` — llamar `auditAuthEvent('login.success')` tras login y `'logout'` antes de `signOut`.
- `components/modals/EmployeeReportActionsModal.tsx` — botón "Ver eventos de este empleado" que navega a `Screen.ACTIVITY` con filtros pre-cargados (vínculo cruzado, R6.5).

## Presencia: estados y señales

### Modelo de tres fuentes (Opción B confirmada con el usuario)

A diferencia de Slack/Teams que solo distinguen "conectado vs no conectado", Bistro_POS modela **tres estados con semántica útil para POS** combinando tres señales independientes:

1. **`profiles.is_signed_in`** (BD): fuente de verdad sobre "tiene sesión iniciada". Se setea explícitamente al login y se quita al logout.
2. **Presencia en canal Realtime** (`channel.presenceState()`): el cliente tiene WebSocket vivo enviando heartbeats automáticos de 25s.
3. **`last_activity_at`** (payload Realtime): última interacción humana detectada en cliente (`mousemove`, `keydown`, `touchstart`).

### Reglas de clasificación

```
is_signed_in == false  → ⚪ Desconectado  (cerró sesión / JWT expirado)

is_signed_in == true:
   ├─ en presence + last_activity ≤3 min  → 🟢 Activo
   └─ todo lo demás                       → 🟡 Inactivo
        (incluye: sin internet, dispositivo dormido, sin actividad reciente)
```

### Payload de `track()`

```
{
    user_id,
    user_name,           // snapshot
    user_role,           // snapshot
    device_id,
    login_at,            // ISO
    last_activity_at,    // ISO, throttle de 30s
    cash_shift_id        // nullable
}
```

NO se incluye `screen` (pantalla actual) ni `last_heartbeat_at`. El heartbeat es transparente del protocolo de Supabase Realtime (25s automáticos, según [docs oficiales](https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages)).

### Por qué este modelo

Slack y Teams **no distinguen** "perdió internet" de "cerró sesión": ambos terminan en Offline tras unos minutos ([Microsoft Teams docs](https://learn.microsoft.com/en-us/microsoftteams/presence-admins): *"When users aren't logged in on any of their devices for a few minutes, they appear offline"*). Para chat empresarial esa imprecisión no importa; para un POS sí: el dueño quiere saber con precisión si su cajero abandonó el puesto (Inactivo) vs cerró sesión y se fue a casa (Desconectado). El costo de añadir una columna `is_signed_in` se paga solo.

### Robustez de conexión

THE cliente SHALL configurar Supabase Realtime con `worker: true` y `heartbeatCallback` para evitar silent disconnections cuando la pestaña queda en background ([guía oficial Supabase](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)). Sin esto, el heartbeat se throttle al pasar la pestaña a segundo plano y el cliente desaparece del canal aunque el JWT siga vivo. Con `worker: true`, el heartbeat corre en un Web Worker no afectado por throttling.

## Comportamiento offline

- Acciones offline (venta, anulación vía `delete_sale`, apertura/cierre de caja, merma, gasto) se encolan en IndexedDB y `useOfflineSync` las escribe en Supabase al reconectar. **Esa escritura dispara el trigger correspondiente**, generando el evento sin código extra en cliente.
- `metadata.was_offline=true` se infiere cuando el `payload` sincronizado trae marca de origen offline (derivado de `OfflineTransaction.createdAt`).
- Devoluciones (`sale_refunds`) son solo-online; su trigger corre igual.

## Testing Strategy

- **SQL/triggers**: en cada trigger, prueba de que (a) genera el evento esperado y (b) un fallo forzado dentro del trigger NO aborta la operación de negocio (verificar con un caso que dispare la excepción).
- **Presencia**: dos sesiones simultáneas; verificar aparición/desaparición y transiciones de estado.
- **Visor**: filtros, paginación, RLS (un negocio no ve eventos de otro), responsive <768px (tarjetas).
- **Vínculos cruzados**: desde reporte → visor filtrado; desde evento con `sale_id` → venta en `SalesScreen`.
- **No regresión**: registrar venta normal, anular, abrir/cerrar caja, merma y gasto, confirmando que todo sigue funcionando igual que hoy.
- Tras aplicar migraciones: correr `get_advisors` (security + performance) y corregir lo que aparezca (ej. policies faltantes).

## Error Handling

- **Triggers (la garantía crítica)**: toda función de trigger y `log_audit_event` envuelven su cuerpo en `EXCEPTION WHEN OTHERS THEN RAISE WARNING ...`. Un fallo de auditoría jamás aborta la transacción de negocio (venta, anulación, cierre de caja). El peor caso es un evento no registrado, nunca una operación caída.
- **Logger de cliente (auth)**: `lib/auditClient.ts` llama al RPC dentro de try/catch; si falla, se registra en consola y el login/logout continúa normal. La auditoría es best-effort, no bloqueante.
- **Edge function `change-pin`**: la inserción de auditoría va en try/catch; un error no impide el cambio de PIN.
- **Presencia**: si el canal de Realtime no conecta o se cae, la UI muestra "Sin conexión" y conserva la última lista conocida; no se lanza error al usuario. El heartbeat se omite en offline y se reanuda al volver la red.
- **Visor**: errores de consulta muestran un estado de error con opción de reintento; nunca pantalla en blanco. Rangos >90 días muestran aviso de posible lentitud pero ejecutan igual.
- **RLS**: una consulta sin `business_id` válido devuelve cero filas (no error), evitando fugas entre negocios.

## Correctness Properties

### Property 1: No-bloqueo
Ninguna escritura de negocio puede fallar a causa de la auditoría (triggers tolerantes a fallos).
**Validates: Requirements 12.1, 12.4**

### Property 2: No-duplicación
Cada acción auditable genera exactamente un evento; el trigger se dispara una vez por escritura de fila y la cola offline inserta cada fila una sola vez.
**Validates: Requirements 12.4**

### Property 3: Aislamiento por negocio
Un usuario solo puede leer eventos de su propio `business_id`.
**Validates: Requirements 13.1, 13.4**

### Property 4: Inmutabilidad
Ningún cliente puede modificar o borrar eventos existentes.
**Validates: Requirements 13.1**

### Property 5: Sin ruido operativo
Las ventas normales (`completed` sin anulación ni devolución) no generan eventos.
**Validates: Requirements 8.4, 17.2**

### Property 6: Snapshot persistente
El `user_name`/`user_role` del actor se conserva aunque el empleado se archive.
**Validates: Requirements 15.1, 15.3**

### Property 7: Privacidad
Nunca se persisten PIN, contraseñas, tokens, OTP ni cédula completa.
**Validates: Requirements 14.1, 14.2**

### Property 8: Equivalencia online/offline
Una acción auditable produce el mismo evento ya sea ejecutada con conexión o sincronizada después desde la cola.
**Validates: Requirements 12.1, 12.2**
