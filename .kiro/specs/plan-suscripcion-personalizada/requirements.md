# Requirements Document

## Introducción

Esta feature habilita la existencia de "planes de suscripción personalizados" en Bistro POS: planes con precio y condiciones negociados individualmente con un negocio específico, que no aparecen en el catálogo público de planes. El primer caso de uso es el negocio con `public_id = '10001'` (UUID `9ab00944-b41b-47bd-b595-9aaea024d777`), al que se le asigna un plan personalizado de $170.000 COP mensuales.

Los negocios con plan personalizado no ven el selector público de planes, pero sí pueden pagar su suscripción reutilizando el widget de Wompi que ya está integrado. El botón de pago solo es visible para usuarios con permiso `admin_settings` del negocio. Cada pago aprobado extiende la vigencia 1 mes calendario, registra una factura y reactiva la suscripción.

La regla vigente de "ocultar precios en el resto de la app para el negocio 10001" se mantiene: la única superficie donde el monto se hace visible es la pantalla/card de pago del plan personalizado y el propio widget de Wompi.

## Glosario

- **Negocio**: Cuenta principal registrada en Bistro POS, identificada por `business_id` (UUID) y `public_id` (numérico legible, ej. `10001`).
- **Plan_Publico**: Plan de suscripción visible en el catálogo `SubscriptionPlansScreen` para todos los negocios.
- **Plan_Personalizado**: Plan de suscripción asignado a un `business_id` específico, con precio negociado individualmente, invisible en el catálogo público.
- **Suscripcion**: Registro en `business_subscriptions` que vincula un negocio a un plan y define su período de vigencia (`current_period_end`), estado (`status`) y período de gracia.
- **Periodo_Gracia**: Ventana de 48 horas posteriores al vencimiento de `current_period_end` durante la cual el negocio conserva acceso completo a la app con un banner de aviso.
- **Bloqueo_Fuera_Gracia**: Pantalla de bloqueo mostrada por `App.tsx` cuando un negocio venció y agotó el período de gracia. Actualmente muestra "contacta a soporte" para el negocio 10001.
- **Widget_Wompi**: Componente checkout hospedado por Wompi que ya está integrado en `SubscriptionPlansScreen.handleOpenWompiWidget` y usa la edge function `generate-payment-signature`.
- **Factura_Suscripcion**: Registro en `subscription_invoices` que documenta un cobro aprobado de suscripción.
- **Permiso_admin_settings**: Permiso técnico ya existente que identifica al dueño del negocio y administradores autorizados a modificar configuración. Empleados de piso no lo tienen.
- **Usuario_Admin**: Usuario autenticado que pertenece al negocio y tiene el permiso `admin_settings`.
- **Usuario_Cajero**: Usuario autenticado con `profile.role === 'Cajero'` y sin permiso `admin_settings`. Está autorizado a operar el punto de venta y a estar enterado del estado financiero de la suscripción (banner informativo), pero no puede iniciar cobros de suscripción ni entrar a la pantalla de gestión de suscripción.
- **Usuario_Mesero**: Usuario autenticado con `profile.role === 'Mesero'` (u otro rol operativo sin `admin_settings` distinto de Cajero). No debe recibir avisos del estado de suscripción del negocio ni acceder a la UI de pago, para no distraerlo de la operación de mesas.
- **Usuario_Empleado**: Cualquier usuario autenticado que pertenece al negocio pero NO tiene el permiso `admin_settings`. Es el conjunto que agrupa a `Usuario_Cajero` y `Usuario_Mesero`. Se usa cuando la restricción aplica por igual a los dos.
- **Regla_Precios_Ocultos**: Regla vigente que oculta los precios de suscripción en pantallas de facturas, resumen y aviso de próximo pago para el negocio 10001. Definida hoy vía `HIDDEN_PRICES_BUSINESS_ID` en `lib/specialBusinesses.ts`.
- **Sistema**: Backend de Bistro POS (Supabase + edge functions + cliente React) considerado como una sola unidad para efectos de estos requisitos.

## Requerimientos

### Requerimiento 1: Modelado del Plan Personalizado

**Historia de usuario:** Como desarrollador del sistema, quiero un modelo de datos que distinga un plan personalizado de un plan público y lo asocie a un negocio específico, para poder asignarlo a un solo negocio sin hardcodear IDs en el código de UI.

#### Criterios de aceptación

1. EL Sistema DEBERÁ almacenar la marca "plan personalizado" y su asociación a un `business_id` como datos estructurados en la base de datos, de forma que la asignación se resuelva por consulta y no por comparación literal contra `public_id = '10001'` en el código de UI.
2. EL Sistema DEBERÁ permitir que cualquier `business_id` pueda tener asignado como máximo un plan personalizado activo.
3. EL Sistema DEBERÁ almacenar en el plan personalizado, como mínimo: monto en COP, moneda, periodicidad (mensual) y `business_id` asignado.
4. CUANDO se consulta el plan personalizado de un negocio, EL Sistema DEBERÁ retornar el monto, la moneda y la periodicidad asociados a ese negocio.
5. SI un negocio no tiene plan personalizado asignado, ENTONCES EL Sistema DEBERÁ retornar un resultado vacío al consultarlo, sin generar error.

### Requerimiento 2: Asignación del plan personalizado al negocio 10001

**Historia de usuario:** Como dueño del negocio 10001, quiero tener asignado un plan personalizado de $170.000 COP mensuales, para poder pagar mi suscripción con el precio negociado.

#### Criterios de aceptación

1. EL Sistema DEBERÁ tener asignado al negocio con `public_id = '10001'` (UUID `9ab00944-b41b-47bd-b595-9aaea024d777`) un plan personalizado con monto de 170000 COP y periodicidad mensual.
2. CUANDO el negocio 10001 carga la aplicación, EL Sistema DEBERÁ resolver su plan como personalizado con monto 170000 COP.
3. EL Sistema DEBERÁ dejar la asignación registrada de forma persistente para que sobreviva a recargas de la aplicación y no dependa de estado en cliente.

### Requerimiento 3: Exclusión del selector público

**Historia de usuario:** Como usuario cualquiera de la aplicación, quiero que los planes personalizados no aparezcan en el catálogo público de planes, para no ver ni poder contratar un plan que no me corresponde.

#### Criterios de aceptación

1. CUANDO se consulta el catálogo público de planes desde `SubscriptionPlansScreen`, EL Sistema DEBERÁ retornar únicamente planes públicos y excluir cualquier plan personalizado.
2. EL Sistema DEBERÁ permitir al Usuario_Admin de un negocio con Plan_Personalizado asignado ver la entrada "Suscripciones" en el sidebar y en el sheet de perfil, extendiendo la regla actual que hoy solo lo permite al negocio 10000.
3. EL Sistema DEBERÁ mantener oculta la entrada "Suscripciones" en sidebar y perfil para negocios sin Plan_Personalizado ni pertenencia al negocio 10000, y para cualquier Usuario_Empleado independientemente del negocio.
4. EL Sistema DEBERÁ evitar que un negocio distinto al asignado pueda ver, seleccionar o contratar un plan personalizado ajeno.
5. CUANDO un Usuario_Admin de un negocio con Plan_Personalizado abre la pestaña "Planes" dentro de `SubscriptionManagementScreen`, EL Sistema DEBERÁ mostrar únicamente el Plan_Personalizado asignado a ese negocio y NO DEBERÁ mostrar los planes públicos (Mensual, Trimestral, Anual).
6. EL Sistema DEBERÁ seguir excluyendo los planes personalizados del catálogo público general (el que se muestra en `SubscriptionPlansScreen` cuando se accede desde el flujo de registro o desde el `GracePeriodBanner` de negocios sin plan personalizado), manteniendo el criterio 3.1.

### Requerimiento 4: Card de pago en gestión de suscripción

**Historia de usuario:** Como Usuario_Admin de un negocio con plan personalizado, quiero ver el monto de mi plan y un botón "Pagar ahora" desde la pantalla de gestión de suscripción, para poder renovar mi suscripción en cualquier momento.

#### Criterios de aceptación

1. CUANDO un Usuario_Admin de un negocio con Plan_Personalizado abre la pestaña "Planes" dentro de `SubscriptionManagementScreen`, EL Sistema DEBERÁ mostrar una card con el nombre del plan, monto en COP, moneda, periodicidad y un botón "Pagar ahora".
2. CUANDO el Usuario_Admin pulsa "Pagar ahora", EL Sistema DEBERÁ abrir el widget de Wompi con la referencia y monto del plan personalizado.
3. SI el usuario no tiene permiso `admin_settings`, ENTONCES EL Sistema NO DEBERÁ mostrar el botón "Pagar ahora".
4. SI el negocio no tiene Plan_Personalizado, ENTONCES EL Sistema NO DEBERÁ mostrar esta card y mantendrá el comportamiento actual.
5. EL Sistema DEBERÁ mostrar en esta card el monto del plan personalizado como excepción autorizada a la Regla_Precios_Ocultos.
6. En las otras pestañas del `SubscriptionManagementScreen` (Resumen, Pagos, Historial), EL Sistema DEBERÁ mantener la Regla_Precios_Ocultos vigente para el negocio 10001, mostrando "—" o texto neutro en lugar de montos.

### Requerimiento 5: Botón "Pagar" en el banner de gracia

**Historia de usuario:** Como Usuario_Admin de un negocio con plan personalizado que está en período de gracia, quiero un botón "Pagar" directamente en el banner de gracia, para renovar sin navegar a otra pantalla.

#### Criterios de aceptación

1. MIENTRAS un negocio con plan personalizado está en Periodo_Gracia, EL Sistema DEBERÁ mostrar en el `GracePeriodBanner` un botón "Pagar" a los usuarios que tengan permiso `admin_settings`.
2. CUANDO un Usuario_Admin pulsa "Pagar" en el banner de gracia, EL Sistema DEBERÁ abrir el widget de Wompi con el monto y referencia del plan personalizado del negocio.
3. SI el usuario en Periodo_Gracia es Usuario_Cajero, ENTONCES EL Sistema DEBERÁ mostrar el banner de gracia con su mensaje informativo completo y solamente ocultar el botón de acción de pago.
4. SI el usuario en Periodo_Gracia es Usuario_Mesero, ENTONCES EL Sistema NO DEBERÁ mostrar el banner de gracia; el mesero DEBERÁ ver la aplicación como si el negocio no estuviera en gracia.
5. EL Sistema DEBERÁ reemplazar, solo para negocios con plan personalizado, el actual botón "Renovar ahora" del banner (que lleva al catálogo público) por el botón "Pagar" descrito en este requerimiento.
6. EL Sistema DEBERÁ mantener el botón "Renovar ahora" y su destino actual para negocios sin plan personalizado.

### Requerimiento 6: Pantalla de pago desde bloqueo fuera de gracia

**Historia de usuario:** Como Usuario_Admin de un negocio con plan personalizado cuyo período de gracia ya venció, quiero una pantalla de pago con el monto y botón "Pagar", para poder reactivar la suscripción sin depender de soporte.

#### Criterios de aceptación

1. CUANDO un Usuario_Admin de un negocio con plan personalizado abre la aplicación estando en Bloqueo_Fuera_Gracia, EL Sistema DEBERÁ mostrar una pantalla de pago con el monto del plan y un botón "Pagar" en lugar de la pantalla "contacta a soporte".
2. CUANDO el Usuario_Admin pulsa "Pagar" en la pantalla de bloqueo, EL Sistema DEBERÁ abrir el widget de Wompi con el monto y referencia del plan personalizado del negocio.
3. SI el usuario en Bloqueo_Fuera_Gracia NO tiene permiso `admin_settings`, ENTONCES EL Sistema DEBERÁ mostrar la pantalla actual "contacta a soporte" como fallback.
4. SI un negocio en Bloqueo_Fuera_Gracia NO tiene plan personalizado, ENTONCES EL Sistema DEBERÁ mantener el comportamiento actual de bloqueo para ese negocio.

### Requerimiento 7: Restricción por permisos para empleados

**Historia de usuario:** Como dueño del negocio, quiero que mi cajero pueda ver un aviso del estado de suscripción sin poder pagar, y que mis meseros no reciban ningún aviso de suscripción, para que ninguno pueda tocar mi cuenta financiera y para no distraer a los meseros con avisos que no les corresponden.

#### Criterios de aceptación

1. SI un Usuario_Empleado (Cajero o Mesero) navega a la pantalla de gestión de suscripción, ENTONCES EL Sistema NO DEBERÁ mostrar el botón "Pagar ahora".
2. SI un Usuario_Cajero está en Periodo_Gracia, ENTONCES EL Sistema DEBERÁ mostrar el banner de gracia informativo y NO DEBERÁ mostrar el botón "Pagar" en el banner.
3. SI un Usuario_Mesero está en Periodo_Gracia, ENTONCES EL Sistema NO DEBERÁ mostrar el banner de gracia en ninguna forma.
4. SI un Usuario_Empleado abre la aplicación estando el negocio en Bloqueo_Fuera_Gracia, ENTONCES EL Sistema DEBERÁ mostrar la pantalla "contacta a soporte" y NO DEBERÁ mostrar UI de pago (aplica igual a Cajero y Mesero).
5. EL Sistema DEBERÁ resolver la restricción de permisos en cliente para ocultar la UI y NO DEBERÁ depender exclusivamente de esa validación para la seguridad del cobro.
6. EL Sistema NO DEBERÁ mostrar al Usuario_Empleado la entrada "Suscripciones" en el sidebar ni en el sheet de perfil bajo ninguna circunstancia. La visibilidad de esa entrada queda restringida a Usuario_Admin y solo cuando su negocio cumpla las condiciones definidas en el Requerimiento 3 (pertenencia al negocio 10000 o negocio con Plan_Personalizado asignado).
7. EL Sistema DEBERÁ resolver la diferenciación entre Cajero y Mesero usando la cadena `profile.role` que ya existe (`'Cajero'` vs `'Mesero'`), sin introducir un permiso nuevo.

### Requerimiento 8: Extensión de vigencia al pago aprobado

**Historia de usuario:** Como dueño del negocio, quiero que un pago aprobado extienda mi suscripción exactamente 1 mes calendario y quede registrado como factura, para saber que estoy al día y tener historial.

#### Criterios de aceptación

1. CUANDO EL Sistema recibe la confirmación de que un pago del plan personalizado fue APROBADO, EL Sistema DEBERÁ actualizar la suscripción del negocio a `status = 'active'`.
2. CUANDO EL Sistema procesa un pago APROBADO, EL Sistema DEBERÁ extender `current_period_end` en 1 mes calendario (setMonth + 1) a partir del valor mayor entre `current_period_end` actual y la fecha del pago aprobado.
3. CUANDO EL Sistema procesa un pago APROBADO, EL Sistema DEBERÁ registrar un nuevo renglón en `subscription_invoices` con el monto cobrado, la moneda, la referencia del pago y el `business_id`.
4. CUANDO EL Sistema procesa un pago APROBADO, EL Sistema DEBERÁ refrescar el estado de suscripción en el `AuthContext` del cliente de forma que la UI deje de mostrar el banner de gracia o la pantalla de bloqueo sin requerir recarga manual.
5. EL Sistema DEBERÁ garantizar que un mismo evento de pago aprobado no extienda la vigencia ni cree factura más de una vez, aunque llegue duplicado.

### Requerimiento 9: Pago declinado o con error

**Historia de usuario:** Como dueño del negocio, quiero que un pago rechazado no toque mi suscripción y me quede claro que no se cobró, para poder reintentar sin perder el período de gracia.

#### Criterios de aceptación

1. SI EL Sistema recibe la confirmación de que un pago fue DECLINADO por el proveedor, ENTONCES EL Sistema NO DEBERÁ modificar `current_period_end`, `status` ni registrar factura.
2. SI EL Sistema recibe un error durante el flujo de pago, ENTONCES EL Sistema NO DEBERÁ modificar la suscripción y DEBERÁ mostrar un mensaje de error al Usuario_Admin.
3. SI un pago falla, ENTONCES EL Sistema DEBERÁ mantener el estado actual del Periodo_Gracia o Bloqueo_Fuera_Gracia sin cambios.
4. CUANDO se muestra el error al usuario, EL Sistema DEBERÁ dejar disponible el botón "Pagar" para reintento inmediato.

### Requerimiento 10: Pago en estado pendiente

**Historia de usuario:** Como dueño del negocio que paga por PSE o Nequi, quiero ver claramente que el pago está en proceso y no todavía activo, para saber que debo esperar la confirmación bancaria antes de asumir que ya renové.

#### Criterios de aceptación

1. CUANDO EL Sistema recibe la notificación de que un pago quedó en estado PENDIENTE, EL Sistema DEBERÁ mostrar al Usuario_Admin un mensaje "Pago en proceso".
2. MIENTRAS un pago está en estado PENDIENTE, EL Sistema NO DEBERÁ actualizar `current_period_end` ni cambiar `status` a `active`.
3. MIENTRAS un pago está en estado PENDIENTE, EL Sistema NO DEBERÁ registrar todavía la factura en `subscription_invoices` como cobro efectivo.
4. CUANDO un pago que estaba PENDIENTE cambie a APROBADO, EL Sistema DEBERÁ aplicar los efectos descritos en el Requerimiento 8.
5. CUANDO un pago que estaba PENDIENTE cambie a DECLINADO, EL Sistema DEBERÁ aplicar los efectos descritos en el Requerimiento 9.

### Requerimiento 11: Preservar la regla de precios ocultos

**Historia de usuario:** Como dueño del negocio 10001, quiero que fuera de la pantalla de pago del plan personalizado los precios sigan ocultos como hoy, para preservar la privacidad acordada.

#### Criterios de aceptación

1. EL Sistema DEBERÁ mantener la Regla_Precios_Ocultos vigente para el negocio 10001 en pantallas de facturas históricas, resumen de suscripción y aviso de próximo pago.
2. EL Sistema DEBERÁ mostrar el monto del plan personalizado únicamente en la pestaña "Planes" de `SubscriptionManagementScreen` (Requerimiento 4), en la pantalla de bloqueo del Requerimiento 6 y en el propio Widget_Wompi. En el resto de la aplicación, incluidas las pestañas Resumen, Pagos e Historial de esa misma pantalla, la Regla_Precios_Ocultos se mantiene.
3. EL Sistema DEBERÁ conservar el archivo `lib/specialBusinesses.ts` y la constante `HIDDEN_PRICES_BUSINESS_ID` como fuente de verdad de la regla, permitiendo extenderlos pero sin reemplazarlos.
4. SI se introduce una nueva pantalla o card que muestre el monto del plan personalizado, ENTONCES EL Sistema DEBERÁ documentar esa pantalla como excepción explícita a la Regla_Precios_Ocultos.
