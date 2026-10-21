# Requirements Document

## Introduction

Esta feature dota a Bistro POS de dos capacidades complementarias para que dueños y administradores supervisen la actividad de sus empleados sin depender de revisar el reporte de empleado en PDF:

1. **Presencia en tiempo real**: vista en vivo de quién está actualmente conectado, en qué pantalla, desde qué dispositivo y desde hace cuánto tiempo.
2. **Visor de eventos (audit log)**: registro cronológico filtrable de acciones sensibles (logins, anulaciones, cambios de precio, apertura/cierre de caja, mermas, gastos, cambios de configuración y permisos) con metadata forense (IP, dispositivo, antes/después, timestamp, sede).

La feature **no reemplaza ni duplica** el "Reporte de empleado" existente (`lib/buildEmployeeReport.ts`, abierto desde `screens/SalesScreen.tsx`). El reporte sigue siendo la vista agregada por persona y período con KPIs, tasas y alertas; el Visor de eventos lo complementa con la dimensión temporal y la metadata forense, y se vinculan entre sí mediante navegación cruzada.

### Alcance de este Spec

Este Spec cubre, según lo acordado con el usuario, las **Fases 1 y 2** del roadmap:

- **Fase 1 — Presencia en vivo** usando Supabase Realtime Presence.
- **Fase 2 — Audit log base** que cubre eventos de autenticación, operación de venta (anulaciones, devoluciones, ítems anulados), apertura/cierre de caja y configuración crítica del negocio (datos del negocio, impresora, permisos, usuarios, productos, precios, promociones, mermas, gastos).

Quedan **fuera de este Spec** y se abordarán en Specs posteriores:

- Detección de patrones y alertas proactivas (Fase 4).
- Exportación masiva del audit log y políticas de archivado a almacenamiento frío (Fase 5).
- Eventos no acordados (`sale.completed` de ventas normales, `screen.viewed`).
- Captura de dirección IP (requiere modificar la edge function de autenticación; se difiere a una fase futura).
- Bloqueo de cuenta por intentos fallidos (`account.locked`): no existe el mecanismo de lockout en el sistema actual; queda fuera de alcance hasta que esa funcionalidad se construya por separado.

### Decisiones confirmadas con el usuario

Las decisiones siguientes fueron validadas contra el código y la base de datos reales, y confirmadas con el usuario:

| Decisión | Valor confirmado |
|---|---|
| Permiso de acceso a la pantalla de Actividad | `admin_users` o `admin_settings` (más bypass de `Administrador`) |
| Cajero ve quién más está conectado | No |
| Retención de eventos en consulta caliente | 90 días |
| Alertas proactivas | Fuera de este Spec (Fase 4) |
| Ubicación de las vistas | **Pantalla nueva** `Screen.ACTIVITY` con su propio ítem en el sidebar (no es "Configuración", que en realidad es un panel lateral, no una pantalla) |
| Captura de IP en login | **No** en esta fase: solo `user_agent` y dispositivo (lo único disponible en cliente). IP diferida a fase futura |
| Evento `account.locked` | **Fuera de alcance**: no existe lockout en el auth actual |
| Modelo de estados de presencia | **Tres estados con fuente híbrida (Opción B):** `activo` / `inactivo` / `desconectado`. Se basan en una columna nueva `profiles.is_signed_in` (sesión iniciada explícitamente) cruzada con presencia en canal Realtime y actividad humana reciente. Esto distingue "cerró sesión" (Desconectado) de "perdió internet o se quedó sin tocar la app" (Inactivo). Slack/Teams no distinguen estos dos casos; para POS sí importa, por eso usamos modelo propio. |
| Pantalla actual del usuario en presencia | **No se incluye** en el payload (poco aporte, tráfico extra, sensación de vigilancia) |
| Arquitectura de auditoría de acciones de datos | **Triggers de Postgres** en las tablas (`orders`, `order_items`, `sale_refunds`, `cash_shifts`, `wastage`, `expenses`, `products`, `promotions`, `profiles`, `roles`, `businesses`). Generan el `Audit_Event` automáticamente, igual online y offline, sin duplicar lógica en el cliente ni depender de una edge function de cola (que no existe) |
| Auditoría de eventos de auth | Insert directo (cliente o edge function `firebase-phone-auth`/`change-pin`), porque login/logout/cambio de PIN no son escrituras en tablas auditables |
| Empleados eliminados | El borrado es **lógico** (`profiles.is_deleted=true`), no físico; la fila nunca se elimina. Se guarda snapshot de `user_name` y `user_role` en cada evento de todas formas, y el `user_id` permanece válido |
| Plataformas | Web desktop, móvil y tablet (responsive) |
| Cambios de precio masivos | Sí se registran como evento agregado con resumen y detalle |
| Datos sensibles | Nunca registrar contraseñas, PIN, tokens, OTP ni cédula completa; salarios fuera de alcance |

## Glossary

- **Bistro_POS**: el sistema completo de punto de venta de Bistro, incluido frontend (PWA + Capacitor Android), Supabase y edge functions. Sujeto general cuando una regla aplica al sistema en su conjunto.
- **Modulo_Presencia**: subsistema frontend que se suscribe a un canal de Supabase Realtime Presence por negocio, anuncia la sesión activa del usuario y entrega a la UI el listado consolidado de empleados conectados.
- **Modulo_Visor_Eventos**: subsistema frontend que consulta y renderiza la tabla `audit_events` con filtros y paginación.
- **Audit_Trigger**: trigger de Postgres asociado a una tabla auditable (`orders`, `order_items`, `sale_refunds`, `cash_shifts`, `wastage`, `expenses`, `products`, `promotions`, `profiles`, `roles`, `businesses`) que, ante INSERT/UPDATE/DELETE relevante, inserta automáticamente el `Audit_Event` correspondiente. Al ejecutarse dentro de la transacción de escritura, funciona idéntico para acciones online y para acciones offline que se sincronizan después, sin lógica duplicada en el cliente.
- **Audit_Logger_Cliente**: utilidad frontend que inserta `Audit_Event` únicamente para eventos que NO son escrituras en tablas auditables, en concreto los eventos de autenticación (`login.success`, `logout`). Para `pin.changed`, la inserción la realiza la edge function `change-pin`.
- **Audit_Event**: registro individual en la tabla `audit_events`. Campos mínimos: `id`, `business_id`, `user_id` (nullable), `user_name` (snapshot), `user_role` (snapshot), `category`, `action`, `severity`, `description`, `metadata` (jsonb con `user_agent`, `device_id`, `sale_id`, `before`, `after`, etc.), `created_at`.
- **Categoria_Evento**: una de `auth`, `sale`, `cash`, `inventory`, `expense`, `product`, `promotion`, `user`, `permission`, `business_config`, `printer`.
- **Severidad**: una de `info`, `warning`, `critical`. La severidad es atributo del tipo de acción (ej. `login.failed` siempre es `warning`, `sale.voided` siempre es `warning`, `product.deleted` es `critical`).
- **Reporte_Empleado**: feature existente implementada en `lib/buildEmployeeReport.ts` y abierta desde `screens/SalesScreen.tsx`, que produce un PDF agregado por persona y período. No se modifica su lógica de cálculo en este Spec.
- **Cola_Offline**: cola en IndexedDB (`lib/offlineQueue.ts` + `lib/offlineStorage.ts`) con tipo `OfflineTransaction` (`{ id, type, payload, createdAt, status, retryCount, businessId, userId }`). El cliente la sincroniza **directamente** contra Supabase desde `hooks/useOfflineSync.ts` con funciones por tipo (`syncSale`, `syncExpense`, `syncShrinkage`, `syncOpenShift`, `syncCloseShift`, etc.). **No existe** ninguna edge function que procese esta cola.
- **Sede**: ubicación física del negocio. En este Spec, la sede se identifica por el `device_id` del cliente y el `business_id` del usuario; no se introducen multi-locaciones nuevas.
- **Heartbeat**: ping automático del protocolo de Supabase Realtime (cada 25 segundos por defecto, según docs oficiales) que mantiene viva la conexión WebSocket. Es **infraestructura**, no es la señal que usamos para clasificar presencia. La clasificación se basa en tres fuentes distintas: `profiles.is_signed_in`, presencia en el canal Realtime y `last_activity_at` del payload.
- **Sesión iniciada**: estado representado por `profiles.is_signed_in = true`. Se setea explícitamente al login y se quita explícitamente al logout (o al expirarse el JWT vía `onAuthStateChange`). Es la fuente de verdad para distinguir "Desconectado" de "Inactivo": si el WebSocket cae por internet, la sesión sigue iniciada y el usuario aparece Inactivo, no Desconectado.
- **last_activity_at**: timestamp ISO de la última interacción humana detectada en cliente (`mousemove`, `keydown`, `touchstart`, `visibilitychange`). Se actualiza con throttle de 30 segundos para no saturar el canal Realtime.

## Requirements

### Requirement 1: Presencia en tiempo real para administradores

**User Story:** Como dueño o administrador, quiero ver en una pantalla quiénes de mis empleados están conectados ahora mismo, en qué pantalla, desde qué dispositivo y desde hace cuánto, para detectar de un vistazo turnos activos, dispositivos olvidados con sesión abierta y movimientos sospechosos.

#### Acceptance Criteria

1. WHEN un usuario con permiso `admin_users` o `admin_settings` (o rol `Administrador`) abre la pantalla `Screen.ACTIVITY` en la pestaña "Empleados conectados", THE Modulo_Presencia SHALL mostrar la lista de usuarios del mismo `business_id` cuyo estado de presencia es `activo` o `inactivo`, ordenados por estado y luego por tiempo desde `login_at` descendente.
2. THE Modulo_Presencia SHALL mostrar para cada usuario conectado: nombre completo (snapshot), rol, identificador de dispositivo legible (alias o etiqueta derivada del navegador), tiempo transcurrido desde `login_at`, timestamp de la última actividad humana (`last_activity_at`), indicador "Caja abierta" cuando aplique y estado visual (`activo`, `inactivo`, `desconectado`).
3. WHEN otro usuario del mismo negocio inicia sesión, abre caja, cierra caja o cierra sesión, THE Modulo_Presencia SHALL actualizar la fila correspondiente en menos de 5 segundos sin recargar la página.
4. IF el usuario que abre la vista no tiene `admin_users` ni `admin_settings` ni rol `Administrador`, THEN THE sistema SHALL impedir el acceso a `Screen.ACTIVITY` mediante `usePermissions.canAccessScreen` y SHALL redirigirlo igual que con las demás pantallas restringidas.
5. WHILE la vista de presencia está abierta y el dispositivo del observador queda sin conexión, THE Modulo_Presencia SHALL mostrar un indicador "Sin conexión" en la cabecera y SHALL preservar la última lista conocida hasta que se reanude la suscripción al canal.

### Requirement 2: Estados y transiciones de presencia

**User Story:** Como administrador, quiero distinguir entre un empleado que está usando activamente la app, uno que tiene la sesión iniciada pero no responde (perdió internet, se fue del puesto, dispositivo dormido) y uno que cerró sesión a propósito, para no confundir "abandonó la caja" con "terminó turno".

#### Acceptance Criteria

1. THE Modulo_Presencia SHALL clasificar a un usuario como `desconectado` cuando `profiles.is_signed_in = false` (no tiene sesión iniciada). Esto cubre: logout explícito, expiración de JWT y empleados que nunca se conectaron en el período observado.
2. THE Modulo_Presencia SHALL clasificar a un usuario como `activo` cuando se cumplen TODAS las siguientes condiciones: `profiles.is_signed_in = true`, está presente en el canal Realtime de presencia, y su `last_activity_at` (última interacción humana detectada en cliente: `mousemove`, `keydown`, `touchstart`) es de hace **3 minutos o menos**.
3. THE Modulo_Presencia SHALL clasificar a un usuario como `inactivo` cuando `profiles.is_signed_in = true` pero NO se cumple la condición de `activo`. Esto cubre tres casos operativos:
   - Está en el canal pero no ha tocado la app en >3 minutos (se distrajo, se fue del puesto sin cerrar sesión).
   - NO está en el canal (perdió internet, cerró pestaña, dispositivo en background) pero conserva su sesión iniciada.
   - El cliente está suspendido/dormido y los heartbeats automáticos de Supabase Realtime dejaron de llegar.
4. WHEN el cliente del usuario monitoreado pierde conexión a internet, THE Modulo_Presencia SHALL clasificarlo como `inactivo` (no como `desconectado`), porque su sesión sigue iniciada aunque el WebSocket haya caído. La clasificación cambiará a `desconectado` solo cuando `is_signed_in` se ponga en `false`.
5. WHEN el cliente del usuario monitoreado cierra sesión explícitamente (`signOut()`), THE Modulo_Presencia SHALL reclasificarlo como `desconectado` en menos de 30 segundos a través del cambio de `profiles.is_signed_in` propagado por Realtime postgres_changes o reconsulta.
6. WHERE el dispositivo cuenta con caja abierta a nombre del usuario, THE Modulo_Presencia SHALL mostrar un distintivo "Caja abierta" junto al estado, vinculado al `cash_shift_id` activo, independientemente del estado de presencia.

### Requirement 3: Señales de presencia y actividad humana

**User Story:** Como sistema, necesito tres fuentes de señal independientes para clasificar correctamente la presencia: (a) si la sesión está iniciada, (b) si el cliente está conectado al canal Realtime, (c) si hay actividad humana reciente. Sin esto, no se puede distinguir "perdió internet" de "cerró sesión" ni "trabaja" de "dispositivo olvidado".

#### Acceptance Criteria

1. WHEN un usuario inicia sesión correctamente en Bistro_POS, THE cliente SHALL: (a) actualizar `profiles.is_signed_in = true` y `profiles.last_login_at = now()`, (b) unirse al canal Realtime `presence:business-{business_id}` con clave igual al `user_id`, (c) iniciar el tracker local de actividad humana.
2. THE payload de presencia (`channel.track()`) SHALL contener: `user_id`, `user_name` (snapshot), `user_role`, `device_id`, `login_at`, `last_activity_at`, `cash_shift_id` (nullable). NO se incluye pantalla actual ni `last_heartbeat_at` (el heartbeat de Supabase es automático cada 25 segundos a nivel de protocolo y no necesita exponerse en el payload).
3. THE tracker de actividad humana SHALL escuchar los eventos `mousemove`, `keydown`, `touchstart` y `visibilitychange` del documento, con un throttle mínimo de 30 segundos entre actualizaciones de `last_activity_at` para no saturar el canal Realtime.
4. WHEN el usuario abre caja, cierra caja o cambia el `cash_shift_id` activo, THE Modulo_Presencia SHALL invocar `track()` con el payload actualizado fuera del throttle de actividad.
5. WHEN el usuario cierra sesión explícitamente, THE cliente SHALL: (a) actualizar `profiles.is_signed_in = false` y `profiles.last_logout_at = now()`, (b) invocar `untrack()` y `removeChannel()`, (c) cancelar la sesión de Supabase Auth. THE orden importa: actualizar `is_signed_in` primero garantiza que el observador vea `desconectado` aunque `untrack()` falle.
6. THE cliente SHALL configurar Supabase Realtime con `worker: true` y `heartbeatCallback` para evitar silent disconnections cuando la pestaña queda en background, según la guía oficial de Supabase ([Handling Silent Disconnections](https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794)).
7. IF el cliente está en modo offline, THEN THE Modulo_Presencia SHALL omitir las invocaciones a `track()` y SHALL reanudar el envío automáticamente cuando vuelva la red. THE fila de `profiles.is_signed_in` permanecerá en `true` durante la pérdida de red, por lo que el observador clasificará al usuario como `inactivo`, no como `desconectado`.
8. WHERE la sesión de Supabase Auth expira sin logout explícito (token vencido), THE cliente SHALL detectar el evento de `auth.onAuthStateChange` con estado `SIGNED_OUT` y SHALL actualizar `profiles.is_signed_in = false` antes de redirigir al login.

### Requirement 4: Visor de eventos con paginación

**User Story:** Como administrador, quiero abrir un visor cronológico de eventos del negocio para auditar quién hizo qué, cuándo y desde dónde, sin tener que descargar el reporte de empleado completo cada vez.

#### Acceptance Criteria

1. WHEN un usuario con permiso `admin_users` o `admin_settings` (o rol `Administrador`) abre la pantalla `Screen.ACTIVITY` en la pestaña "Visor de eventos", THE Modulo_Visor_Eventos SHALL consultar la tabla `audit_events` filtrada por el `business_id` del usuario y SHALL renderizar la primera página ordenada por `created_at` descendente.
2. THE Modulo_Visor_Eventos SHALL paginar los resultados en bloques de 50 eventos y SHALL ofrecer "Cargar más" en lugar de carga infinita automática.
3. THE Modulo_Visor_Eventos SHALL mostrar para cada evento: timestamp en zona horaria del negocio, nombre del usuario (snapshot), categoría, acción legible en español, severidad con color, descripción humana corta y un indicador de metadata expandible.
4. IF el usuario que intenta acceder no tiene `admin_users` ni `admin_settings` ni rol `Administrador`, THEN THE sistema SHALL impedir el acceso a `Screen.ACTIVITY` mediante `usePermissions.canAccessScreen` y SHALL redirigirlo igual que con las demás pantallas restringidas.
5. WHEN la consulta de la primera página supera 2 segundos en una conexión típica, THE Modulo_Visor_Eventos SHALL renderizar un esqueleto de carga sin pantalla en blanco.

### Requirement 5: Filtros del visor de eventos

**User Story:** Como administrador, quiero filtrar los eventos por fecha, empleado, categoría, severidad y palabras clave, para investigar incidentes específicos sin scrollear miles de filas.

#### Acceptance Criteria

1. THE Modulo_Visor_Eventos SHALL ofrecer presets de fecha "Hoy", "Ayer", "Últimos 7 días", "Últimos 30 días" y "Rango personalizado".
2. THE Modulo_Visor_Eventos SHALL ofrecer un filtro de empleado que liste todos los usuarios del `business_id`, incluidos los archivados, mostrando un distintivo "Archivado" cuando aplique.
3. THE Modulo_Visor_Eventos SHALL ofrecer un filtro de categoría con opciones `auth`, `sale`, `cash`, `inventory`, `expense`, `product`, `promotion`, `user`, `permission`, `business_config`, `printer` y "Todas".
4. THE Modulo_Visor_Eventos SHALL ofrecer un filtro de severidad con opciones `info`, `warning`, `critical` y "Todas".
5. THE Modulo_Visor_Eventos SHALL ofrecer un campo de búsqueda libre que filtre por coincidencia parcial en `description`, `action` y nombre de usuario.
6. WHEN el usuario cambia cualquier filtro, THE Modulo_Visor_Eventos SHALL reiniciar la paginación a la primera página y SHALL volver a consultar la tabla `audit_events`.
7. THE Modulo_Visor_Eventos SHALL persistir los filtros activos en la URL como query string, para que un enlace compartido reabra la misma vista filtrada.

### Requirement 6: Detalle del evento y vinculación cruzada

**User Story:** Como administrador, cuando veo una fila sospechosa en el visor, quiero abrirla para ver toda su metadata y saltar al reporte del empleado o a la venta relacionada, para investigar sin romper mi flujo.

#### Acceptance Criteria

1. WHEN el usuario expande una fila o abre el modal de detalle de un evento, THE Modulo_Visor_Eventos SHALL mostrar la metadata completa del evento, incluidos `user_agent`, `device_id`, `device_label`, valores `before` y `after` cuando aplique, `sale_id` cuando aplique y `cash_shift_id` cuando aplique. THE campo `ip_address` queda diferido a una fase futura; si está ausente, no se muestra.
2. WHERE el evento incluye `sale_id` en su metadata, THE Modulo_Visor_Eventos SHALL ofrecer un botón "Ver venta" que navega a la venta correspondiente en `screens/SalesScreen.tsx` y la abre seleccionada.
3. THE Modulo_Visor_Eventos SHALL ofrecer un botón "Ver reporte de este empleado" que abre el Reporte_Empleado existente preconfigurado con el `user_id` del evento y el período "Últimos 30 días".
4. THE Modulo_Visor_Eventos SHALL ofrecer un botón "Filtrar por este empleado" que recarga el visor con el filtro de empleado preseleccionado.
5. THE Reporte_Empleado SHALL incorporar en su modal de acciones (`components/modals/EmployeeReportActionsModal.tsx`) un botón "Ver eventos de este empleado" que abre el Modulo_Visor_Eventos preconfigurado con el `user_id` del reporte y el mismo período del reporte.

### Requirement 7: Eventos de autenticación

**User Story:** Como administrador, quiero ver inicios de sesión exitosos, intentos fallidos, cierres de sesión y cambios de PIN, para detectar accesos no autorizados o intentos repetidos fallidos.

#### Acceptance Criteria

1. WHEN un usuario inicia sesión correctamente en Bistro_POS, THE Audit_Logger_Cliente SHALL insertar un evento con `category='auth'`, `action='login.success'`, `severity='info'` y metadata que incluya `user_agent`, `device_id`, `device_label` y `auth_provider` (`firebase_otp`, `google_oauth`, `pin` o `email_password`).
2. WHEN un intento de login falla por credenciales, PIN o código OTP inválido, THE Audit_Logger_Cliente SHALL insertar un evento con `category='auth'`, `action='login.failed'`, `severity='warning'` y metadata que incluya `user_agent`, motivo del fallo y, si está disponible, el identificador del intento (teléfono o correo enmascarado).
3. WHEN un usuario cierra sesión explícitamente, THE Audit_Logger_Cliente SHALL insertar un evento con `category='auth'`, `action='logout'`, `severity='info'`.
4. WHEN un usuario cambia su PIN a través de la edge function `change-pin`, THE edge function `change-pin` SHALL insertar un evento con `category='auth'`, `action='pin.changed'`, `severity='warning'` y metadata que NO contenga el PIN viejo ni el nuevo.
5. THE captura de `ip_address` en los eventos de autenticación queda **fuera del alcance** de este Spec, porque requiere instrumentar el servidor (edge function `firebase-phone-auth`); se difiere a una fase futura.
6. THE evento `account.locked` queda **fuera del alcance** de este Spec, porque el sistema de autenticación actual no implementa bloqueo de cuenta por intentos fallidos.

### Requirement 8: Eventos de operación de venta

**User Story:** Como administrador, quiero ver toda anulación, devolución y anulación de ítem como evento individual con timestamp, dispositivo y motivo, complementando las tasas agregadas que ya muestra el Reporte_Empleado.

#### Acceptance Criteria

1. WHEN una venta se anula completa (`orders.status='voided'`), THE Audit_Trigger sobre `orders` SHALL insertar un evento con `category='sale'`, `action='sale.voided'`, `severity='warning'` y metadata que incluya `sale_id`, `order_number`, monto anulado, motivo (`void_reason`) y los `product_name` con sus cantidades.
2. WHEN un ítem dentro de una venta completada se anula (`order_items.status='canceled'`), THE Audit_Trigger sobre `order_items` SHALL insertar un evento con `category='sale'`, `action='sale_item.voided'`, `severity='warning'` y metadata que incluya `sale_id`, `order_item_id`, `product_name`, monto del ítem y motivo.
3. WHEN se registra una devolución en `sale_refunds` (acción solo-online; `addRefund` requiere conexión), THE Audit_Trigger sobre `sale_refunds` SHALL insertar un evento con `category='sale'`, `action='sale.refunded'`, `severity='warning'` y metadata que incluya `sale_refund_id`, `sale_id`, monto total devuelto, motivo y los ítems devueltos.
4. THE Audit_Trigger SHALL omitir el registro de eventos para ventas con `status='completed'` que no tengan ninguna anulación de ítem ni devolución, para evitar saturar el visor con la operación normal del POS.

### Requirement 9: Eventos de caja y mermas

**User Story:** Como administrador, quiero ver cuándo se abrió y cerró cada caja, qué saldo declaró el cajero, y cada merma registrada, con su antes/después de inventario y motivo.

#### Acceptance Criteria

1. WHEN un cajero abre un turno (`cash_shifts.opened_at`), THE Audit_Trigger sobre `cash_shifts` SHALL insertar un evento con `category='cash'`, `action='cash.shift.opened'`, `severity='info'` y metadata que incluya `cash_shift_id` y `opening_balance`.
2. WHEN un cajero cierra un turno (`cash_shifts.closed_at`), THE Audit_Trigger sobre `cash_shifts` SHALL insertar un evento con `category='cash'`, `action='cash.shift.closed'`, `severity='info'` y metadata que incluya `cash_shift_id`, `declared_cash`, `expected_cash` y `difference`. THE severidad SHALL elevarse a `warning` si la diferencia absoluta supera el umbral existente del Reporte_Empleado (5000 COP).
3. WHEN se registra una merma de inventario en `wastage`, THE Audit_Trigger sobre `wastage` SHALL insertar un evento con `category='inventory'`, `action='inventory.merma'`, `severity='warning'` y metadata que incluya `product_id`, `product_name`, cantidad mermada, costo afectado y motivo.
4. WHEN se registra un gasto del negocio en `expenses`, THE Audit_Trigger sobre `expenses` SHALL insertar un evento con `category='expense'`, `action='expense.created'`, `severity='info'` y metadata que incluya `expense_id`, monto, categoría y método de pago.

### Requirement 10: Eventos de configuración del negocio y permisos

**User Story:** Como dueño, quiero saber cada vez que alguien cambia los datos del negocio, la impresora predeterminada, los permisos de un rol o crea, archiva o cambia el rol de un usuario, porque son acciones poco frecuentes pero de alto impacto.

#### Acceptance Criteria

1. WHEN cambian los datos de facturación del negocio en `businesses` (nombre, NIT, dirección, teléfono o ancho de papel), THE Audit_Trigger sobre `businesses` SHALL insertar un evento con `category='business_config'`, `action='business.changed'`, `severity='warning'` y metadata que incluya los valores `before` y `after` solo de los campos modificados.
2. WHEN se cambia la configuración o impresora predeterminada del negocio, THE Audit_Trigger sobre `businesses` SHALL insertar un evento con `category='printer'`, `action='printer.changed'`, `severity='info'` y metadata que incluya `before` y `after` de los campos modificados.
3. WHEN se modifican los permisos de un rol (`roles.permissions`) o los permisos personalizados de un usuario (`profiles.custom_permissions`), THE Audit_Trigger sobre `roles`/`profiles` SHALL insertar un evento con `category='permission'`, `action='permissions.changed'`, `severity='critical'` y metadata que incluya el `target_user_id` o `target_role_id`, y los permisos `before` y `after`.
4. WHEN se crea un usuario en `profiles` (vía edge function `create-employee`), THE Audit_Trigger sobre `profiles` SHALL insertar un evento con `category='user'`, `action='user.created'`, `severity='warning'` y metadata que incluya `target_user_id`, `target_user_name` (snapshot) y rol asignado.
5. WHEN se archiva o desactiva un usuario (`profiles.is_deleted=true` o `profiles.is_active=false`, vía edge function `delete-employee`/`update-employee`), THE Audit_Trigger sobre `profiles` SHALL insertar un evento con `category='user'`, `action='user.archived'`, `severity='critical'` y metadata que incluya `target_user_id` y `target_user_name` (snapshot).
6. WHEN se cambia el rol de un usuario existente (`profiles.role` o `profiles.role_id`), THE Audit_Trigger sobre `profiles` SHALL insertar un evento con `category='user'`, `action='user.role_changed'`, `severity='critical'` y metadata que incluya `target_user_id`, rol `before` y rol `after`.

### Requirement 11: Eventos de catálogo y promociones

**User Story:** Como administrador, quiero rastrear cambios de precio, creación o borrado de productos y de promociones, especialmente en cambios masivos por importación, porque afectan margen y visibilidad de la operación.

#### Acceptance Criteria

1. WHEN se cambia el precio de venta de un producto (`products.price`, vía update directo online en las pantallas de creación/edición), THE Audit_Trigger sobre `products` SHALL insertar un evento con `category='product'`, `action='product.price.changed'`, `severity='warning'` y metadata que incluya `product_id`, `product_name`, `price_before`, `price_after` y origen (`manual` o `bulk_import`).
2. WHEN se crea un producto en `products`, THE Audit_Trigger sobre `products` SHALL insertar un evento con `category='product'`, `action='product.created'`, `severity='info'` y metadata que incluya `product_id`, `product_name`, `type` y precio inicial.
3. WHEN se elimina o desactiva un producto (`products.is_active=false` o DELETE), THE Audit_Trigger sobre `products` SHALL insertar un evento con `category='product'`, `action='product.deleted'`, `severity='critical'` y metadata que incluya `product_id` y `product_name` (snapshot).
4. WHEN se completa una importación masiva de productos desde Excel (pantalla `Screen.BULK_UPLOAD`, hoy oculta), cada cambio de precio individual SHALL emitirse como evento `product.price.changed` con `origen='bulk_import'` mediante el Audit_Trigger sobre `products`. Un evento resumen agregado `product.bulk_import` queda como mejora opcional, ya que no existe hoy un punto único de inserción del lote.
5. WHEN se crea o elimina una promoción en `promotions`, THE Audit_Trigger sobre `promotions` SHALL insertar un evento con `category='promotion'`, `action='promotion.created'` o `action='promotion.deleted'`, `severity='warning'` y metadata que incluya `promotion_id`, `name`, `total_price` y `is_active` (la tabla `promotions` no tiene campos de vigencia).

### Requirement 12: Generación de eventos para acciones offline-capable mediante triggers

**User Story:** Como sistema, necesito que las acciones realizadas sin conexión y luego sincronizadas (ventas, anulaciones, ítems anulados, mermas, apertura y cierre de caja, gastos) generen exactamente los mismos eventos de audit log que las acciones online, sin duplicar la lógica de auditoría en el cliente y sin depender de una edge function de cola (que no existe).

#### Acceptance Criteria

1. THE auditoría de acciones que escriben en tablas (`orders`, `order_items`, `sale_refunds`, `cash_shifts`, `wastage`, `expenses`, `products`, `promotions`, `profiles`, `roles`, `businesses`) SHALL implementarse mediante Audit_Trigger de Postgres, de modo que el `Audit_Event` se genere dentro de la misma transacción de escritura, idéntico para acciones online y para acciones offline cuando `hooks/useOfflineSync.ts` sincroniza la Cola_Offline.
2. WHEN la Cola_Offline sincroniza una transacción cuyo INSERT/UPDATE produce una acción auditable, THE Audit_Trigger SHALL registrar el `Audit_Event` correspondiente, y la metadata SHALL incluir el flag `was_offline=true` cuando el `payload` sincronizado indique que la transacción se originó sin conexión (campo derivado de `OfflineTransaction.createdAt`).
3. THE `created_at` del `Audit_Event` SHALL reflejar, cuando esté disponible en la escritura sincronizada, el timestamp original de la acción (`opened_at`, `voided_at`, `created_at` de la fila, según la tabla), no el momento de la sincronización.
4. THE idempotencia SHALL garantizarse de forma natural: como el Audit_Trigger se dispara una sola vez por escritura de fila, y la Cola_Offline inserta cada fila una sola vez (deduplicada por su `id` local en `hooks/useOfflineSync.ts`), no se generan eventos duplicados. WHERE un sincronizador reintente una operación ya aplicada, el diseño SHALL evitar reinsertar la fila para no duplicar el evento.
5. WHEN el cliente realiza una acción auditable de autenticación (login, logout) que no escribe en tablas auditables, THE Audit_Logger_Cliente SHALL insertar el `Audit_Event` directamente; el cambio de PIN lo inserta la edge function `change-pin`.

### Requirement 13: Multi-tenancy y políticas de acceso

**User Story:** Como dueño, necesito la garantía de que los eventos y la presencia de mi negocio nunca se filtran a otro `business_id`, porque la auditoría es información sensible.

#### Acceptance Criteria

1. THE tabla `audit_events` SHALL incluir la columna `business_id` y SHALL aplicar Row Level Security que limite SELECT a registros con el `business_id` del usuario autenticado. THE INSERT SHALL realizarse mediante funciones `SECURITY DEFINER` (los Audit_Trigger y la edge function `change-pin`); los clientes NO SHALL tener INSERT directo salvo el Audit_Logger_Cliente para eventos de `auth`, restringido a su propio `business_id`. THE UPDATE y DELETE SHALL estar denegados para todos los roles de cliente (los eventos son inmutables).
2. THE canal de Supabase Realtime Presence SHALL nombrarse con el `business_id` del usuario para aislar la presencia entre negocios.
3. IF un cliente intenta suscribirse a un canal de presencia de otro `business_id`, THEN THE backend SHALL rechazar la suscripción según las reglas de autorización de Realtime.
4. THE Audit_Trigger SHALL tomar el `business_id` desde la fila escrita; THE Audit_Logger_Cliente SHALL inferir el `business_id` desde el JWT del usuario autenticado y SHALL ignorar cualquier `business_id` provisto por el cliente.

### Requirement 14: Privacidad y datos sensibles

**User Story:** Como dueño, necesito garantías de que los logs no almacenan secretos ni datos personales innecesarios, para cumplir buenas prácticas de privacidad.

#### Acceptance Criteria

1. THE sistema de auditoría (Audit_Trigger y Audit_Logger_Cliente) SHALL omitir en `description` y en `metadata` contraseñas, PIN, tokens, OTP, refresh tokens y claves de API, incluso de forma parcial.
2. THE sistema de auditoría SHALL omitir en cualquier evento la cédula completa, salario y datos bancarios del empleado.
3. WHERE el evento es un intento de login fallido por correo o teléfono, THE Audit_Logger_Cliente SHALL enmascarar el identificador antes de guardarlo (ej. `j***@dominio.com`, `+57 *** *** 1234`).
4. THE metadata de `before`/`after` para cambio de precios y configuración del negocio SHALL contener únicamente los campos modificados, no el objeto entero.

### Requirement 15: Snapshot de identidad del actor

**User Story:** Como administrador, cuando desactivo o archivo a un empleado, quiero seguir viendo en los logs históricos qué hizo, aunque su cuenta esté archivada.

#### Acceptance Criteria

1. WHEN se inserta un `Audit_Event`, THE sistema de auditoría SHALL guardar `user_name` y `user_role` como snapshot textual además del `user_id`.
2. THE borrado de empleados en Bistro_POS es **lógico** (`profiles.is_deleted=true`), no físico, por lo que la fila de `profiles` y su `user_id` permanecen disponibles. THE columna `user_id` en `audit_events` SHALL referenciar `profiles(id)` con `ON DELETE SET NULL` solo como salvaguarda ante un borrado físico excepcional, conservando en ese caso `user_name` y `user_role`.
3. THE Modulo_Visor_Eventos SHALL renderizar los eventos de usuarios con `profiles.is_deleted=true` mostrando el `user_name` con un distintivo "Cuenta archivada", y los de `user_id` nulo (caso excepcional) con el distintivo "Cuenta eliminada".

### Requirement 16: Retención y rendimiento

**User Story:** Como administrador, necesito que el visor responda rápido aunque haya meses de eventos acumulados, y entender cuánto tiempo permanecen consultables.

#### Acceptance Criteria

1. THE tabla `audit_events` SHALL tener índices que soporten al menos las consultas: por `(business_id, created_at desc)`, por `(business_id, user_id, created_at desc)` y por `(business_id, category, created_at desc)`.
2. THE Modulo_Visor_Eventos SHALL renderizar la primera página de 50 eventos en menos de 2 segundos para negocios con menos de 100 000 eventos en los últimos 90 días, en una conexión típica de 4G.
3. THE Modulo_Visor_Eventos SHALL consultar por defecto solo los eventos con `created_at` dentro de los últimos 90 días.
4. WHERE el usuario aplica un rango personalizado mayor a 90 días, THE Modulo_Visor_Eventos SHALL mostrar un aviso indicando que los rangos largos pueden tardar más, y SHALL ejecutar la consulta de todos modos.

### Requirement 17: Coexistencia con el Reporte de Empleado

**User Story:** Como dueño, quiero que el reporte de empleado y el visor de eventos se sientan complementarios, no redundantes, y que la información agregada de uno y la forense del otro se enlacen entre sí.

#### Acceptance Criteria

1. THE feature SHALL preservar sin cambios la lógica de cálculo de `lib/buildEmployeeReport.ts` y el contenido del PDF generado.
2. THE feature SHALL omitir el registro de eventos `sale.completed` para ventas normales finalizadas sin anulación ni devolución.
3. THE feature SHALL omitir el registro de eventos `screen.viewed` y de eventos puramente de navegación interna.
4. THE Reporte_Empleado SHALL seguir produciéndose con los mismos KPIs, tasas y alertas que hoy a partir de las tablas `orders`, `order_items`, `sale_refunds` y `cash_shifts`.
5. THE Modulo_Visor_Eventos SHALL exponer las acciones de anulación y devolución como eventos individuales con metadata forense (dispositivo y, cuando aplique, antes/después), de modo que un mismo hecho aparezca en el reporte como tasa agregada y en el visor como evento auditable.

### Requirement 18: Responsividad y zona horaria

**User Story:** Como administrador en movilidad, quiero abrir la presencia y el visor desde mi celular o tablet, y ver siempre los timestamps en hora de Colombia.

#### Acceptance Criteria

1. THE Modulo_Presencia y Modulo_Visor_Eventos SHALL renderizarse correctamente en viewports desde 360 px de ancho hasta 1920 px, sin scroll horizontal y sin texto cortado.
2. THE Modulo_Presencia y Modulo_Visor_Eventos SHALL formatear todos los timestamps usando la utilidad `lib/timezone.ts` con la zona horaria del negocio (`America/Bogota` por defecto).
3. WHEN el viewport es menor a 768 px, THE Modulo_Visor_Eventos SHALL mostrar cada evento como tarjeta apilada en lugar de fila de tabla, con la metadata expandible al tap.
4. WHEN el viewport es menor a 768 px, THE Modulo_Presencia SHALL mostrar cada usuario como tarjeta apilada con avatar, nombre, estado y tiempo desde login visibles sin tap, y el resto del detalle al expandir.
