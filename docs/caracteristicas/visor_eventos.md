# Visor de Eventos (ActivityScreen)

Componente: `screens/ActivityScreen.tsx`
Hooks principales: `hooks/useAuditEvents.ts`, `hooks/useEmployeePresence.ts`, `hooks/usePresenceBroadcast.ts`
Logger cliente: `lib/auditClient.ts`
Backend: tabla `public.audit_events` en Supabase + 17 triggers `audit_*` + RPCs `log_audit_event`, `log_auth_event`, `log_inventory_adjustment`, `purge_old_audit_events`, `fmt_money`
Acceso: Sidebar → "Actividad" (icono `monitoring`)
Permisos requeridos: `admin_users` **o** `admin_settings` (o rol `Administrador` / super admin)

Pantalla que registra **quién hizo qué y cuándo** en el negocio. Sirve para auditar acciones sensibles (anulaciones, cambios de precio, aperturas de caja, mermas, gastos, cambios de configuración, permisos, etc.) con contexto forense (dispositivo, antes/después, timestamp, sede). Complementa al Reporte de Empleado (ver [`historial_ventas.md`](./historial_ventas.md)): ese entrega la vista agregada por persona y período; el visor entrega la línea temporal detallada.

> [!IMPORTANT]
> **Un fallo en la auditoría NUNCA puede abortar una venta, una anulación, un cierre de caja ni ninguna otra escritura de negocio.** Todas las funciones de trigger envuelven su cuerpo en `EXCEPTION WHEN OTHERS` que traga el error como `WARNING` y deja continuar la transacción original. El peor caso es un evento no registrado, jamás una operación caída.

---

## Layout de la pantalla

```
┌───────────────────────────────────────────────────────────────────────┐
│ Header                                                                │
│ ┌──────────┐ ⓘ  🔄            ┌──────────────────────────────┐       │
│ │ Eventos  │ info refrescar   │ (avatares empleados online)  │       │
│ └──────────┘                  └──────────────────────────────┘       │
├───────────────────────────────────────────────────────────────────────┤
│ Filtros                                                               │
│ 🔎 [ Buscar por descripción, acción o empleado…              ]        │
│ [📅 Últimos 7 días▾] [Todos empleados▾] [Todas categ.▾] [Sev▾] N ev.  │
├───────────────────────────────────────────────────────────────────────┤
│ Lista (bloques de 50)                                                 │
│ ┌─────────────────────────────────────────────────────────────────┐  │
│ │ 🛒 Venta #123 anulada             [Atención]                    │  │
│ │ • Ventas · Alejandro · 14:32                            >       │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│ ┌─────────────────────────────────────────────────────────────────┐  │
│ │ 💵 Abrió la caja «Caja principal»   [Info]                      │  │
│ │ • Caja · María · 08:15                                          │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│ …                                                                    │
│                          [ Cargar más ]                              │
└───────────────────────────────────────────────────────────────────────┘
```

- El header lleva las pestañas fusionadas en un único título ("Eventos" en móvil, "Visor de eventos" en desktop).
- Botón **ⓘ** abre `EventViewerInfo` (popover en desktop, bottom sheet con drag-to-close en móvil) con la guía de qué es el visor y qué significan las severidades.
- Botón **🔄** re-consulta la BD (mismo filtro, misma página) sin cambiar el estado.
- `PresenceStack` a la derecha: stack de avatares de empleados **online**; al pulsarlo despliega el detalle de presencia. Ver sección [Presencia en tiempo real](#presencia-en-tiempo-real).
- **Las filas con acción `cash.shift.opened` no son clickeables**: su descripción ya trae toda la información relevante. El resto abre el modal de detalle.

---

## Anatomía de un evento — tabla `audit_events`

Estructura (verificada en `pos2`):

| Columna | Tipo | Nullable | Uso |
|---|---|---|---|
| `id` | uuid PK | No | Identificador del evento |
| `business_id` | uuid FK → `businesses` | No | Aislamiento por negocio (RLS) |
| `user_id` | uuid FK → `profiles` | Sí | Actor de la acción. `NULL` = acción del sistema (edge function con service role) |
| `user_name` | text | Sí | Snapshot del nombre en el momento del evento |
| `user_role` | text | Sí | Snapshot del rol en el momento del evento |
| `category` | text | No | Una de las 11 categorías (ver abajo) |
| `action` | text | No | Clave técnica: `sale.voided`, `login.success`, etc. |
| `severity` | text | No | `info` / `warning` / `critical` |
| `description` | text | No | Frase legible en español (mostrada en la fila) |
| `metadata` | jsonb | No | Contexto adicional (montos, IDs, before/after…) |
| `created_at` | timestamptz | No | Momento del evento (default `now()`) |

Índices: `(business_id, created_at DESC)`, `(business_id, user_id, created_at DESC)`, `(business_id, category, created_at DESC)`.

### Categorías

| Categoría técnica | UI en español | Icono | Cuándo se usa |
|---|---|---|---|
| `auth` | Autenticación | `login` | Inicio/cierre de sesión, cambio de PIN |
| `sale` | Ventas | `point_of_sale` | Anulaciones, anulación de ítems, devoluciones |
| `cash` | Caja | `payments` | Apertura y cierre de turno |
| `inventory` | Inventario | `inventory` | Mermas manuales, ajustes de conteo, reversiones |
| `expense` | Gastos | `receipt_long` | Registro y eliminación de gastos |
| `product` | Productos | `shopping_bag` | Alta, cambio de precio, baja |
| `promotion` | Promociones | `sell` | Alta y baja (no se audita edición) |
| `user` | Usuarios | `person` | Alta, archivado, cambio de rol |
| `permission` | Permisos | `admin_panel_settings` | Permisos personalizados o de rol |
| `business_config` | Negocio | `store` | Datos de facturación del negocio |
| `printer` | Impresora | `print` | Cambio de impresora predeterminada (**auditoría desactivada, se omite del filtro**) |

### Severidades

| Nivel | UI | Color badge | Semántica |
|---|---|---|---|
| `info` | Info | Gris | Registro operativo normal (apertura de caja, gasto, creación de producto) |
| `warning` | Atención | Ámbar | Requiere revisar (anulaciones, cambios de precio, mermas, cierre con diferencia > 5.000 COP) |
| `critical` | Crítico | Rojo | Alto impacto (borrado de producto, cambio de permisos, archivado de usuario) |

La severidad **no la elige el cliente**: es atributo fijo del tipo de acción. La definen los triggers al insertar.

---

## Acciones registradas (por categoría)

Cada acción es una clave técnica; el visor la muestra traducida vía `ACTION_LABELS` en `components/activity/labels.ts`.

### Autenticación (`auth`)

| Acción | Severidad | Fuente | Descripción |
|---|---|---|---|
| `login.success` | info | RPC `log_auth_event` (cliente) | Inicio de sesión con credenciales genuinas |
| `logout` | info | RPC `log_auth_event` (cliente) | Cierre de sesión explícito |
| `login.failed` | warning | **Pendiente** | Diferido: requiere resolver `business_id` antes de autenticar |
| `pin.changed` | warning | **Pendiente** | Falta agregar el insert en la edge function `change-pin` |

### Ventas (`sale`)

| Acción | Trigger | Cuándo dispara | Metadata clave |
|---|---|---|---|
| `sale.voided` | `audit_orders_void` | `orders.status` pasa a `voided` | `sale_id`, `order_number`, `amount`, `reason` |
| `sale_item.voided` | `audit_order_item_void` | `order_items.status` pasa a `canceled` | `sale_id`, `order_item_id`, `product_name`, `amount`, `reason` |
| `sale.refunded` | `audit_refund_complete` | `sale_refunds.total_amount` pasa de 0 a valor final (AFTER UPDATE) | `sale_refund_id`, `sale_id`, `amount`, `reason`, `items` |

> [!NOTE]
> **Las ventas normales (`completed` sin anulación ni devolución) NO generan eventos.** Es una decisión explícita para no saturar el visor.
>
> **La devolución audita en UPDATE, no en INSERT.** La RPC `process_sale_refund` inserta `sale_refunds` con `total_amount=0`, luego inserta los `sale_refund_items` y al final actualiza el total real. Si el trigger corriera en el INSERT capturaría "$0" con ítems vacíos (bug histórico ya corregido).

### Caja (`cash`)

| Acción | Trigger | Cuándo dispara | Metadata clave |
|---|---|---|---|
| `cash.shift.opened` | `audit_shift_open` | INSERT en `cash_shifts` | `cash_shift_id`, `opening_balance`, `register_name`, `shift_number` |
| `cash.shift.closed` | `audit_shift_close` | `cash_shifts.closed_at` se setea | `cash_shift_id`, `declared_cash`, `expected_cash`, `difference`, `register_name`, `shift_number` |

La descripción del cierre incluye el nombre de la caja (`cash_registers.name`) y la diferencia. Si `|difference| > 5.000 COP`, la severidad se eleva a `warning`.

### Inventario (`inventory`)

| Acción | Trigger / Fuente | Cuándo | Metadata clave |
|---|---|---|---|
| `inventory.merma` | `audit_wastage_insert` | INSERT en `wastage` con `reason ≠ 'AJUSTE DE INVENTARIO'` | `product_id`, `product_name`, `quantity`, `amount`, `reason` |
| `inventory.merma.deleted` | `audit_wastage_delete` | DELETE en `wastage` con `reason ≠ 'AJUSTE DE INVENTARIO'` | `product_id`, `product_name`, `reason` |
| `inventory.adjustment` | RPC `log_inventory_adjustment` desde `InventoryScreen` | Al guardar un conteo (uno o varios productos) | `count`, `total_loss`, `items[]` |
| `inventory.adjustment.reverted` | `audit_wastage_delete` | DELETE en `wastage` con `reason = 'AJUSTE DE INVENTARIO'` (botón "Revertir" del historial de ajustes) | `product_id`, `product_name` |

**Ajuste agrupado (patrón industria)**: Shopify / Lightspeed / Square agrupan un conteo en UNA entrada. El trigger de `wastage` **ignora** los inserts de ajuste (`reason='AJUSTE DE INVENTARIO'`) y el frontend llama a la RPC `log_inventory_adjustment(p_items jsonb)` con el desglose. Resultado: un solo evento con contador de productos y pérdida total; el detalle se ve en el sub-modal "Ver productos".

### Gastos (`expense`)

| Acción | Trigger | Cuándo | Metadata clave |
|---|---|---|---|
| `expense.created` | `audit_expense_insert` | INSERT en `expenses` | `expense_id`, `amount`, `category`, `payment_method`, `note` |
| `expense.deleted` | `audit_expense_delete` | DELETE en `expenses` | `amount`, `category`, `note` |

El `note` (observación del gasto) se guarda para poder mostrarlo en el botón **"Detalles"** del modal.

### Productos (`product`)

| Acción | Trigger | Cuándo | Metadata clave |
|---|---|---|---|
| `product.created` | `audit_product_insert` | INSERT en `products` | `product_id`, `product_name`, `type`, `price` |
| `product.price.changed` | `audit_product_update` | `products.price` cambia | `product_id`, `product_name`, `price_before`, `price_after`, `origin` |
| `product.deleted` | `audit_product_delete` | `is_active` → false o DELETE | `product_id`, `product_name` |

`origin` puede ser `manual` (edición desde pantalla) o `bulk_import` (importación Excel). Sólo se audita el cambio de **precio**, no otros campos como stock (que tiene su propia auditoría vía mermas / ajustes).

### Promociones (`promotion`)

| Acción | Trigger | Cuándo | Metadata |
|---|---|---|---|
| `promotion.created` | `audit_promotion_insert` | INSERT en `promotions` | `promotion_id`, `name`, `total_price`, `is_active` |
| `promotion.deleted` | `audit_promotion_delete` | DELETE en `promotions` | `promotion_id`, `name` |

**No se audita la edición** de promociones. Si se necesita rastro de cambios, hoy hay que compararlos con el par create/delete o extenderlo en el futuro.

### Usuarios (`user`), Permisos (`permission`), Negocio (`business_config`), Impresora (`printer`)

| Acción | Trigger / Fuente | Detalle |
|---|---|---|
| `user.created` | Edge function `create-employee` (`logUserEvent` con actor del JWT) | Alta de empleado. Deriva `user_id` del JWT, no de `auth.uid()` del trigger. |
| `user.role_changed` | Edge function `update-employee` | Sólo si el rol cambia. |
| `user.archived` | Edge function `delete-employee` | Soft delete (`is_deleted=true`). |
| `permissions.changed` | `audit_profile_user` / `audit_role_permissions` | Cambios de `roles.permissions` o `profiles.custom_permissions` hechos DIRECTAMENTE desde el cliente (con `auth.uid()` presente). |
| `business.changed` | `audit_business_config` | Datos de facturación (nombre, NIT, dirección, teléfono, ancho de papel). Metadata trae `before` / `after` **solo** de los campos modificados. |
| `printer.changed` | `audit_business_config` | Cambio de configuración de impresora predeterminada. Auditoría de esta acción hoy activa a nivel BD pero categoría oculta en el filtro. |

> [!NOTE]
> **Bug resuelto de usuarios**: como las edge functions corren con service role, `auth.uid()` dentro del trigger `audit_profile_user` era `NULL` → eventos sin actor + doble evento al crear (trigger `handle_new_user` crea el perfil con rol default y luego se hace update al rol real). Solución: (1) el trigger `audit_profile_user` ignora cambios sin `auth.uid()`; (2) las edge functions registran el evento con el actor real extraído del JWT vía `logUserEvent` (best-effort).

---

## Cómo se llenan los eventos — arquitectura

```
                       ┌──────────────────────────────┐
                       │   CLIENTE (React)            │
                       │                              │
   AuthContext ────────┤  auditAuthEvent()            │
                       │  markSignedIn/Out()          │
                       │  logInventoryAdjustment()    │
                       └──────────┬───────────────────┘
                                  │  RPCs (JWT del usuario)
                                  ▼
                       ┌──────────────────────────────┐
                       │   SUPABASE                   │
                       │                              │
   Ventas / caja /     │   Tablas de negocio          │
   inventario /   ────▶│   (orders, cash_shifts, …)   │
   gastos / …          │        │                     │
                       │        ▼  17 triggers AFTER  │
                       │   ┌──────────────────────┐   │
   Edge functions ────▶│──▶│  log_audit_event()   │──▶ audit_events
   (create-employee,   │   │  SECURITY DEFINER     │
    update-employee,   │   │  EXCEPTION handler    │
    delete-employee,   │   └──────────────────────┘   │
    change-pin*)       │        ▲                     │
                       │        │ (llamadas internas) │
                       │  log_auth_event()            │
                       │  log_inventory_adjustment()  │
                       └──────────────────────────────┘
```

### Función central: `log_audit_event`

```sql
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_business_id uuid, p_user_id uuid, p_user_name text, p_user_role text,
    p_category text, p_action text, p_severity text,
    p_description text, p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.audit_events(...) VALUES (...);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_events insert failed: %', SQLERRM;
END;
$$;
```

`SECURITY DEFINER` + `search_path` fijo + `EXCEPTION WHEN OTHERS` es el molde común de las 17 funciones de trigger. `EXECUTE` está revocado para `anon`, `authenticated` y `PUBLIC`; solo la usan las funciones internas (los triggers).

### RPCs invocables desde el cliente

| RPC | Quién puede llamar | Uso |
|---|---|---|
| `log_auth_event(p_action, p_metadata)` | `authenticated` | Cliente: registrar `login.success` / `logout`. Deriva `user_id` y `business_id` del JWT (no falseable). |
| `log_inventory_adjustment(p_items jsonb)` | `authenticated` | Cliente: registrar un ajuste de inventario agrupado desde `InventoryScreen`. |

### Funciones auxiliares

| Función | Uso |
|---|---|
| `fmt_money(numeric)` | Formato de moneda con puntos de miles y sin decimales (`50000 → "50.000"`). `IMMUTABLE`. Se usa en las descripciones de los triggers. |
| `purge_old_audit_events(days integer default 90)` | Borra eventos anteriores a `days` días. **No está programada**; se ejecuta manualmente cuando haga falta. |

### Garantía crítica: tolerancia a fallos

Cada trigger sigue el patrón:

```sql
CREATE OR REPLACE FUNCTION public.audit_<algo>() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF <condición específica> THEN
        PERFORM public.log_audit_event(...);
    END IF;
    RETURN NULL;  -- AFTER trigger
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_<algo> failed: %', SQLERRM;
    RETURN NULL;
END;
$$;
```

Un fallo dentro del trigger (BD llena, JSON malformado, permiso mal, lo que sea) no propaga: se registra como WARNING en logs de Postgres y la transacción de negocio sigue.

---

## Filtros y paginación

Hook `useAuditEvents` (`hooks/useAuditEvents.ts`) — todos los filtros son server-side (Postgres + RLS).

| Filtro | Comportamiento |
|---|---|
| **Rango de fecha** | Presets: Hoy, Ayer, Últimos 7 días, Últimos 30 días. Personalizado abre `CustomDateRangePicker` (mismo calendario visual que Dashboard y Ventas). Default: Últimos 7 días. |
| **Empleado** | Lista completa de `profiles` del negocio (incluye archivados). Filtro `.eq('user_id', …)`. |
| **Categoría** | Todas las 11 excepto `printer` (oculta a propósito). |
| **Severidad** | `info` / `warning` / `critical` / Todas. |
| **Búsqueda** | Coincidencia parcial (`ilike`) sobre `description`, `action` y `user_name`. |

- **Paginación**: bloques de **50** con botón **"Cargar más"** (nunca scroll infinito automático). Cada carga hace `.range(0, page*50-1)` para no perder los ya cargados.
- **Aviso de rango largo**: si el rango custom supera 90 días, aparece un aviso ámbar "La consulta puede tardar más" (no bloquea, solo advierte porque `purge_old_audit_events` puede haber borrado datos más viejos).
- **URL limpia**: los filtros viven **solo en estado**. La URL se lee **una sola vez al montar** (para captar deep-links como `?user=<id>` o `?preset=30days` desde el Reporte de Empleado) y se limpia inmediatamente. No queda `?preset=today` pegado al navegar a otras pantallas.

---

## Detalle de un evento — modal

Al hacer click en una fila (excepto `cash.shift.opened`) se abre `EventDetailModal` con:

- **Descripción legible** y **Acción** traducida (`labelForAction`, ej. `sale.refunded` → "Devolución de venta").
- **Actor**: nombre + rol snapshot. Badge "Cuenta eliminada" si `user_id` es null pero `user_name` existe.
- **Timestamp** en zona horaria del negocio (`useBusinessSettings.timezone`).
- **Metadata renderizada** con formato:
  - Campos monetarios (`amount`, `price`, `total_price`, `price_before/after`, `unit_price`, `opening_balance`, `declared_cash`, `expected_cash`, `difference`, `total_loss`) se muestran con `formatCurrency` (es-CO, sin decimales, punto de miles).
  - `payment_method` traducido: `cash → Efectivo`, `card → Tarjeta`, `nequi`, `daviplata`, `transfer → Transferencia`, `credit → Crédito`, `other → Otro`, `mixed → Mixto`.
  - `type` (producto) traducido: `simple → Retail`, `processed → Procesado`, `service → Servicio`.
- **Campos ocultos** (`HIDDEN_META_KEYS`): UUIDs internos y datos redundantes con el título — `sale_id`, `order_item_id`, `order_number`, `display_number`, `cash_shift_id`, `register_name`. Se siguen leyendo internamente para los botones de vínculo cruzado.
- **Sub-modales** (portal z-95, abren sobre el detalle):
  - **"Ver productos"** (ajuste de inventario): lista de productos del ajuste con cantidad y valor.
  - **"Ver producto"** (eventos de producto): carga el estado **actual** del producto desde `products` por `product_id` (nombre, tipo, precio, stock, estado). Si fue eliminado: "Este producto ya no existe".
  - **"Detalles"** (gastos): muestra la observación (`note`) o "Sin detalles".

### Botones de vínculo cruzado

| Botón | Condición para aparecer | Acción |
|---|---|---|
| **Ver venta** | `metadata.sale_id` presente y categoría `sale` | Escribe `?sale=<id>` y navega a `SALES`. `SalesScreen` carga la venta puntual con `useSalesHistory.fetchOrderById()` y la abre. |
| **Ver reporte** (cierre de caja) | Acción `cash.shift.closed` y `metadata.cash_shift_id` presente | Escribe `?shift=<id>` y navega a `CASH_REGISTER`. `CashRegisterScreen` carga el turno con el mismo select de cierre online y abre su detalle. |
| **Ver reporte del empleado** | `user_id` presente y categoría con reporte útil | Navega a `SALES` (donde vive el Reporte de Empleado). |
| **Filtrar por empleado** | `user_id` presente | Aplica `setFilters({ userId })` en el propio visor. |
| **Detalles** | Gastos, auth, productos, promociones, usuarios, permisos, negocio | Abre sub-modal con observación / metadata extendida. NO aparece en ventas ni cierre de caja (que ya tienen su propio botón). |

### Deep-link entrante — desde el Reporte de Empleado

En `screens/SalesScreen.tsx` el modal `EmployeeReportActionsModal` incluye "Ver eventos de este empleado". Al pulsarlo:

1. Construye `?user=<id>&preset=30days`.
2. Navega a `ACTIVITY`.
3. `useAuditEvents` lee ambos params al montar → aplica el filtro → limpia la URL.

---

## Presencia en tiempo real

El header del visor lleva un `PresenceStack` con los empleados online. Al pulsarlo abre el detalle (popover en desktop, bottom sheet en móvil).

### Modelo de 3 estados (fuente híbrida)

```
is_signed_in == false
   │
   └──▶ ⚪ Desconectado
        (logout explícito o JWT expirado)

is_signed_in == true:
   ├─ en presence + last_activity ≤ 3 min  → 🟢 Activo
   └─ resto de casos                        → 🟡 Inactivo
       ├─ presente pero sin actividad > 3 min (se distrajo)
       ├─ no está en el canal (sin internet, cerró pestaña, dispositivo dormido)
       └─ pestaña en background con heartbeats throttled
```

Se combinan **tres señales independientes**:

1. **`profiles.is_signed_in`** (columna en BD, verdad sobre "tiene sesión iniciada"). Se pone `true` en login, `false` en `signOut()` o cuando `onAuthStateChange` recibe `SIGNED_OUT`.
2. **Canal Realtime** `presence:business-<id>` (`hooks/usePresenceBroadcast.ts` hace `track()`, el observador consulta con `presenceState()`).
3. **`last_activity_at`** en el payload (última interacción humana detectada: `mousemove`, `keydown`, `touchstart`; throttle de 30 s para no saturar el canal).

### Por qué este modelo (vs Slack/Teams)

Slack y Teams solo distinguen "conectado / no conectado": tras unos minutos sin actividad, todo termina en "Offline". Para un POS eso no basta. Aquí sí importa distinguir:

- **Cajero abandonó el puesto sin cerrar sesión** → Inactivo (`is_signed_in=true`, no interacción).
- **Terminó turno y cerró sesión** → Desconectado (`is_signed_in=false`).

El costo de la columna extra `is_signed_in` se paga con esa distinción.

### Payload del canal (`track()`)

```
{
    user_id,
    user_name,           // snapshot
    user_role,           // snapshot
    device_id,
    device_label,        // "Chrome en Windows", derivado del user_agent
    device_type,         // desktop / tablet / mobile
    login_at,            // ISO
    last_activity_at,    // ISO, throttle 30s
    cash_shift_id        // nullable, distintivo "Caja abierta"
}
```

**Explícitamente NO se envía**:
- `screen` (pantalla actual) — sensación vigilante + tráfico extra sin valor real.
- `last_heartbeat_at` — el heartbeat de Supabase Realtime es transparente (25 s automáticos a nivel protocolo).

### Hora de login estable

`login_at` en la UI proviene de `profiles.last_login_at`, NO del payload del canal. Razón: el payload es efímero y se resetea en cada reconexión (inactivo → activo, pérdida/recuperación de internet). En cambio `last_login_at` se escribe **una sola vez** por login genuino (`markSignedIn(userId, session.user.last_sign_in_at)`) y sobrevive a reconexiones.

**Dedupe persistente** en `localStorage` (clave `bistro_signin_mark = uid|last_sign_in_at`): el evento `SIGNED_IN` de supabase-js se redispara por reconexión de red, recuperación de foco y recarga de webview (común en Android/Capacitor). Sin dedupe, cada uno reescribía `last_login_at = now()` y generaba múltiples `login.success` por un solo login. Con dedupe: solo el primer `SIGNED_IN` con una firma nueva registra el evento y hace el update.

### Cliente Realtime — silent disconnections

Recomendación pendiente del design: configurar Supabase Realtime con `worker: true` + `heartbeatCallback` para evitar silent disconnections cuando la pestaña queda en background ([guía Supabase](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)). Sin esto, el heartbeat se throttle al pasar a segundo plano y el cliente "desaparece" del canal aunque el JWT siga vivo. Aún no aplicado (requiere asset de Web Worker).

---

## Comportamiento offline

Las acciones offline (venta, anulación vía `delete_sale`, apertura/cierre de caja, merma, gasto) se encolan en IndexedDB (ver [`modo_offline.md`](./modo_offline.md)) y `useOfflineSync` las escribe en Supabase al reconectar. **Esa escritura dispara el trigger correspondiente**, generando el evento automáticamente. **No hay lógica de auditoría duplicada en el cliente offline.**

Esto es la propiedad de **equivalencia online/offline**: una anulación hecha sin internet, al sincronizarse, produce exactamente el mismo evento `sale.voided` que una hecha online. La diferencia (si aplica) se puede inferir por la distancia entre `created_at` del evento y la fecha original de la operación.

Excepciones:
- Las devoluciones (`sale_refunds`) son **solo-online**: no hay evento offline porque no hay operación offline.
- Los eventos de `auth` requieren red al momento del login/logout (best-effort, si falla la red se pierde ese evento pero no se aborta el login).

---

## Seguridad y RLS

### `audit_events` — inmutables desde el cliente

Una sola policy activa:

```sql
CREATE POLICY audit_select_own_business ON public.audit_events
  FOR SELECT TO authenticated
  USING (business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid()));
```

**Sin policies de INSERT/UPDATE/DELETE**. Los eventos entran solo por `SECURITY DEFINER` (triggers y `log_auth_event` / `log_inventory_adjustment`), y salir de ahí sin permiso no es posible. **Ningún cliente puede modificar ni borrar eventos existentes.**

### `business_devices` — existe pero DESACTIVADA

La tabla `business_devices` existe en `pos2` con RLS por `business_id` (policies SELECT / INSERT / UPDATE para `authenticated`). **Está vacía a propósito**: la gestión de alias de dispositivos se desactivó por decisión del usuario. Hoy:
- `usePresenceBroadcast` **no** escribe en `business_devices`.
- `PresenceList` lee `device_label` directamente del payload del canal.
- `EventDetailModal` lee `metadata.device_label` del propio evento.
- El botón "Dispositivos" y `DeviceManagementModal` están ocultos en `ActivityScreen`.

Para reactivar: restaurar `upsertDevice` en `usePresenceBroadcast`, el botón + modal en `ActivityScreen`, y `useDeviceAliases` en `PresenceList` / `EventDetailModal`.

### Datos que NO se persisten

Por diseño, **jamás** aparecen en `audit_events`:
- Contraseñas.
- PIN (viejo ni nuevo).
- Tokens de autenticación / JWT.
- Códigos OTP.
- Cédula completa.
- Salarios (fuera de alcance de esta feature).

---

## Retención

- **Ventana caliente**: 90 días. La UI avisa cuando un rango custom la supera porque pueden faltar datos.
- **Función**: `purge_old_audit_events(days integer default 90)` borra eventos anteriores a esa ventana.
- **Programación**: **manual**. Hoy no hay `pg_cron` ejecutándola. Cuando el volumen lo pida se puede agendar sin cambiar código de aplicación.

---

## Pendientes conocidos

Estado consolidado de lo que falta (Fase 2/3 del spec `actividad-empleados`):

| Ítem | Estado | Detalle |
|---|---|---|
| `login.failed` | ⏳ Diferido | Registrar el intento fallido antes de autenticar requiere resolver el `business_id` sin sesión (no trivial). Ver Requirement 7.2 del spec. |
| `pin.changed` | ⏳ Diferido | Falta agregar el insert de auditoría en la edge function `change-pin`. |
| Captura de `ip_address` en auth | ⏳ Fuera de alcance | Requiere instrumentar la edge function `firebase-phone-auth`. |
| Bloqueo de cuenta por intentos fallidos | ⏳ Fuera de alcance | El sistema de auth no implementa lockout. |
| Silent disconnections en Realtime | ⏳ | Falta configurar `worker: true` + `heartbeatCallback` (requiere asset de Web Worker). |
| Gestión de alias de dispositivos | ❌ Desactivada | Tabla `business_devices` vacía. Reactivable sin migración adicional. |
| Auditoría de edición de promociones | ❌ No implementada | Solo se auditan create / delete. |
| Purga programada (`pg_cron`) | ❌ No agendada | La función existe pero corre manualmente. |

---

## Referencias

- Spec completa: `.kiro/specs/actividad-empleados/` (`requirements.md`, `design.md`, `tasks.md`, `STATUS.md`).
- Reporte de Empleado (vista agregada complementaria): [`historial_ventas.md`](./historial_ventas.md).
- Cierre de turno (destino del deep-link "Ver reporte" de caja): [`reporte_cierre_turno.md`](./reporte_cierre_turno.md).
- Autenticación (origen de eventos de `auth`): [`autenticacion_acceso.md`](./autenticacion_acceso.md).
- Anulación y devolución (origen de eventos de `sale`): [`anulacion_devolucion_ventas.md`](./anulacion_devolucion_ventas.md).
- Modo offline (equivalencia online/offline de la auditoría): [`modo_offline.md`](./modo_offline.md).
