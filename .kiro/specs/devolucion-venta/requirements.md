# Requirements Document

## Introduction

Hoy Bistro permite **anular (void)** una venta solo mientras su turno sigue abierto. Una vez el turno se cierra, la venta queda inmutable y no se puede anular (estándar POS). Falta el mecanismo para atender al cliente que regresa a reclamar una **devolución** sobre una venta de un turno ya cerrado (o de otro cajero).

Actualmente existe un botón "Devolución" en Caja, pero es básico: registra solo una salida de efectivo (`cash_movements` tipo `refund`) sin vincularse a la venta original, sin elegir ítems, sin reingresar producto al inventario y sin motivo estructurado.

Esta feature implementa una **Devolución de Venta completa**, siguiendo el estándar de los POS verificados (Shopify, Lightspeed, Toast): una transacción **nueva** en el **turno actual** del cajero, que referencia la venta original sin modificar el turno cerrado, permite devolución total o parcial, reingresa opcionalmente el producto retail al inventario, exige motivo y deja rastro de auditoría.

Principios rectores (del estándar POS):

- La devolución es una **transacción nueva** en el **turno abierto actual**; la venta original y su turno (cerrado o no) **no se modifican**.
- Cualquier usuario **con permiso de devolución** puede procesarla, sin importar quién hizo la venta original.
- El reingreso al inventario es una **decisión por ítem** (producto en buen estado sí; dañado no).
- Toda devolución exige **motivo** y queda **auditada** (quién, cuándo, qué, cuánto, por qué).

## Glossary

- **Anulación (void):** reversión de una venta cuyo turno sigue abierto; marca la venta como `voided` y ajusta ese turno.
- **Devolución (refund):** transacción nueva en el turno actual que devuelve dinero al cliente por una venta previa, sin modificar la venta ni su turno original.
- **Turno (shift):** sesión de caja con apertura y cierre (`cash_shifts`); al cerrarse es inmutable.
- **Producto retail (`simple`):** producto que maneja stock y puede reingresar al inventario.
- **Reingreso a inventario (restock):** aumento de stock por un producto devuelto en buen estado.
- **Devolución parcial:** devolución de solo algunos ítems o cantidades de la venta original.

## Requirements

### Requirement 1: Iniciar una devolución desde una venta existente

**User Story:** Como cajero o administrador, quiero buscar una venta ya realizada e iniciar una devolución sobre ella, para atender un reclamo de un cliente.

#### Acceptance Criteria

1. CUANDO el usuario abre el flujo de devolución **desde Caja** ENTONCES el sistema DEBERÁ permitir buscar la venta original por número de orden, número de display o nombre del cliente.
2. CUANDO el usuario selecciona una venta ENTONCES el sistema DEBERÁ mostrar sus ítems con cantidad vendida, valor unitario y valor total.
3. CUANDO una venta ya está anulada (`voided`) ENTONCES el sistema NO DEBERÁ permitir iniciar una devolución sobre ella.
4. CUANDO una venta pertenece al turno actualmente abierto del usuario ENTONCES el sistema DEBERÁ sugerir usar anulación en lugar de devolución, pero NO DEBERÁ impedir la devolución si el usuario insiste.
5. SI no hay un turno abierto para el usuario ENTONCES el sistema DEBERÁ impedir registrar la devolución e indicar que debe abrir un turno primero.

### Requirement 2: Permiso de devolución

**User Story:** Como dueño, quiero controlar quién puede hacer devoluciones, para evitar fraude y errores.

#### Acceptance Criteria

1. CUANDO un usuario sin el permiso `pos_refund` intenta acceder al flujo ENTONCES el sistema NO DEBERÁ mostrar la opción de devolución.
2. CUANDO se registra una devolución ENTONCES el servidor (RPC `SECURITY DEFINER`) DEBERÁ validar el permiso `pos_refund` del usuario, igual que las anulaciones validan `pos_cancel`.
3. CUANDO el dueño configura roles en Empleados ENTONCES el sistema DEBERÁ exponer el permiso `pos_refund` ("Devoluciones") como una opción configurable por rol y por empleado.

### Requirement 3: Devolución total o parcial con control de cantidades

**User Story:** Como cajero, quiero devolver toda la venta o solo algunos ítems o cantidades, para reflejar exactamente lo que el cliente regresa.

#### Acceptance Criteria

1. CUANDO el usuario arma la devolución ENTONCES el sistema DEBERÁ permitir elegir, por cada ítem, una cantidad a devolver entre 0 y la cantidad vendida.
2. CUANDO una venta ya tuvo devoluciones previas ENTONCES el sistema DEBERÁ permitir devolver como máximo la cantidad pendiente (vendida menos ya devuelta).
3. CUANDO el usuario cambia las cantidades a devolver ENTONCES el sistema DEBERÁ recalcular en tiempo real el monto total a devolver.
4. CUANDO el monto total a devolver es 0 ENTONCES el sistema NO DEBERÁ permitir confirmar la devolución.

### Requirement 4: Reingreso opcional al inventario

**User Story:** Como cajero, quiero decidir si el producto devuelto vuelve al inventario, porque a veces regresa dañado o abierto.

#### Acceptance Criteria

1. CUANDO un ítem a devolver es un producto retail (`simple`) ENTONCES el sistema DEBERÁ mostrar una casilla "Reingresar al inventario", activada por defecto.
2. CUANDO un ítem a devolver NO es retail (`processed` o `service`) ENTONCES el sistema NO DEBERÁ ofrecer reingreso de stock.
3. CUANDO se confirma la devolución con "Reingresar al inventario" activado para un ítem retail ENTONCES el sistema DEBERÁ aumentar el stock de ese producto en la cantidad devuelta.
4. CUANDO se confirma la devolución con "Reingresar al inventario" desactivado ENTONCES el sistema NO DEBERÁ modificar el stock de ese ítem.

### Requirement 5: Registro en el turno actual y movimiento de caja

**User Story:** Como dueño, quiero que el dinero devuelto salga del cajón del turno actual y que el turno cerrado original no se altere, para mantener la integridad contable.

#### Acceptance Criteria

1. CUANDO se confirma una devolución en efectivo ENTONCES el sistema DEBERÁ registrar un movimiento `refund` en el turno actual abierto, reduciendo el efectivo esperado del cajón actual.
2. CUANDO se confirma una devolución ENTONCES el sistema NO DEBERÁ modificar los movimientos, totales ni el arqueo del turno al que pertenecía la venta original.
3. CUANDO se confirma una devolución ENTONCES el movimiento `refund` DEBERÁ referenciar la venta original para trazabilidad.
4. CUANDO el método de devolución no es efectivo ENTONCES el sistema DEBERÁ registrarlo de forma que alimente la sección informativa correspondiente del reporte de cierre sin afectar el conteo de efectivo.

### Requirement 6: Venta original intacta y trazabilidad

**User Story:** Como administrador, quiero ver que una venta tuvo una devolución y sus detalles, sin que la venta original se borre ni se modifique su contenido.

#### Acceptance Criteria

1. CUANDO se registra una devolución ENTONCES la venta original DEBERÁ conservar su estado e ítems sin cambios.
2. CUANDO una venta tiene una o más devoluciones ENTONCES el sistema DEBERÁ permitir distinguirla con un indicador "con devolución" en el historial de ventas.
3. CUANDO el administrador abre una venta con devoluciones ENTONCES el sistema DEBERÁ mostrar las devoluciones asociadas: ítems, cantidades, monto, motivo, quién y cuándo.

### Requirement 7: Motivo obligatorio y auditoría

**User Story:** Como dueño, quiero que cada devolución tenga un motivo y quede registrado quién la hizo, para auditoría y prevención de fraude.

#### Acceptance Criteria

1. CUANDO el usuario confirma una devolución sin motivo ENTONCES el sistema NO DEBERÁ permitir continuar.
2. CUANDO se registra una devolución ENTONCES el sistema DEBERÁ guardar usuario, fecha/hora, venta original referenciada, ítems y cantidades devueltas, monto, método y motivo.
3. CUANDO se ofrece el motivo ENTONCES el sistema DEBERÁ presentar motivos predefinidos (producto defectuoso, cliente insatisfecho, error en la venta, otro) con opción de texto libre en "otro".

### Requirement 8: Visibilidad en reportes e historiales

**User Story:** Como dueño, quiero ver las devoluciones reflejadas en el cierre de turno y en el historial, igual que las anulaciones, pero sin afectar el ticket impreso del cliente.

#### Acceptance Criteria

1. CUANDO se genera el reporte de cierre del turno actual ENTONCES la devolución DEBERÁ aparecer en la línea "Devoluciones" del reporte.
2. CUANDO el administrador revisa el historial de turnos ENTONCES las devoluciones del turno DEBERÁN ser visibles en resumen y detalle, de forma análoga a las anulaciones.
3. CUANDO se reimprime o comparte el ticket de la venta original ENTONCES el contenido impreso NO DEBERÁ verse afectado por la devolución.

### Requirement 9: Requiere conexión a internet

**User Story:** Como dueño, quiero que las devoluciones solo se puedan hacer con conexión, porque dependen de consultar ventas antiguas y validar cantidades en el servidor.

#### Acceptance Criteria

1. CUANDO no hay conexión a internet ENTONCES el sistema NO DEBERÁ permitir iniciar ni confirmar una devolución, e indicará que se requiere conexión.
2. CUANDO se intenta abrir el flujo de devolución sin conexión ENTONCES el sistema DEBERÁ mostrar un aviso claro de que la función necesita internet (no se encola para más tarde).
3. CUANDO hay conexión ENTONCES el sistema DEBERÁ permitir buscar la venta original, validar cantidades pendientes y registrar la devolución en tiempo real.

## Decisiones tomadas

1. **Permiso:** se crea un permiso nuevo y separado `pos_refund` ("Devoluciones"), independiente de `pos_cancel` (anular). Estándar POS.
2. **Acceso al flujo:** la devolución se inicia **desde Caja** (no desde la pantalla de Ventas).
3. **Sin offline:** las devoluciones **requieren conexión a internet**. Sin red, la función se bloquea con aviso (no se encola). Ver Requirement 9.
4. **Ítems no-retail:** confirmado — servicios y procesados **no** reingresan stock; solo los `simple` (retail).
5. **Modelo de datos (recomendado):** tablas dedicadas `sale_refunds` (cabecera) y `sale_refund_items` (líneas).

### Por qué tablas dedicadas y no columnas en `orders`/`order_items`

- **Devoluciones múltiples y parciales acumuladas:** una venta puede recibir varias devoluciones en el tiempo. Para impedir devolver más de lo vendido (Requirement 3.2) hay que sumar lo ya devuelto por ítem; eso se modela limpio con líneas en `sale_refund_items` y no con columnas sueltas.
- **Cada devolución es un evento auditable propio:** quién, cuándo, motivo, monto, método (Requirement 7) → es naturalmente una fila en `sale_refunds`.
- **Venta original intacta (Requirement 6.1):** al no escribir sobre `orders`/`order_items`, la venta y su turno quedan inmutables; la devolución solo los referencia.
- **Reportes y trazabilidad:** facilita listar "devoluciones del turno" (Requirement 8) y "venta con devolución" sin mezclar con los datos de venta.

Estructura tentativa (se detalla en `design.md`):

- `sale_refunds`: `id`, `business_id`, `order_id` (venta original), `shift_id` (turno actual donde se registra), `refunded_by`, `refund_method`, `total_amount`, `reason`, `created_at`.
- `sale_refund_items`: `id`, `refund_id`, `order_item_id`, `product_id`, `quantity`, `unit_price`, `amount`, `restocked` (bool).

