# Requirements Document

## Introduction

El módulo de **Mesas** de Bistro POS es actualmente 100% dependiente de conexión a internet: sin red no es posible agregar productos a una mesa, enviar comanda, cobrar la mesa ni conservar la lista de mesas/salas al recargar la aplicación. Esto rompe la continuidad operativa en restaurantes cuando cae internet, a diferencia de la Orden Rápida, que sí opera offline.

Esta funcionalidad habilita la operación **offline del módulo de Mesas** siguiendo el modelo **"Usuario Eje" (single-writer offline)**: en lugar de resolver conflictos entre varios dispositivos que editan la misma mesa (complejo y frágil), se evita el conflicto por diseño permitiendo que **solo un dispositivo con turno de caja abierto** escriba en las mesas mientras no hay internet. Los demás dispositivos quedan en modo solo-lectura con el último estado conocido.

El "usuario eje" no es un rol ni un permiso nuevo: es una **condición operativa** — tener un turno de caja abierto (`activeShift !== null`). Un usuario eje puede tomar pedidos, agregar/quitar productos y modificadores, crear/editar/eliminar mesas y salas, imprimir comanda en la impresora local y **cobrar mesas offline aunque no tenga el permiso `canFinalizeSale`**.

Esta funcionalidad reutiliza la arquitectura offline existente (Event Sourcing + cola de sincronización en IndexedDB, detección de conectividad `isOnline`, caja optimista) documentada en `docs/caracteristicas/modo_offline.md`, y replica el patrón de mapeo de IDs temporales de `lib/offlineClientMap.ts`.

### Nota sobre el estado de la industria (contexto de diseño)

El modelo single-writer offline es la estrategia estándar de la industria para POS de restaurantes (Upserve/Breadcrumb, Lightspeed y Shift4 operan single-writer offline; Toast usa un hub LAN local). Los CRDT (tipos de datos replicados sin conflicto) permiten multi-writer real, pero son excesivos para este caso de uso.

### Mejora futura declarada (fuera de alcance de este spec)

La **coordinación técnica del multi-eje** (bloqueo/lock o partición de mesas entre varios cajeros con turno abierto) queda explícitamente registrada como **mejora futura**. En esta entrega, cuando hay dos o más turnos abiertos simultáneamente, no existe lock técnico; solo se muestra un **aviso operacional** para que los cajeros se coordinen manualmente. Este documento y el diseño deben conservar esta anotación para que el tema se retome más adelante.

## Glossary

- **Bistro_POS / Sistema**: aplicación de punto de venta completa (React 19 + TypeScript + Supabase + IndexedDB).
- **Modulo_Mesas**: conjunto de pantallas, hooks y componentes que gestionan salas, mesas y órdenes de mesa (`useTables`, `useSales`, `TableSelectorControl`, `OpenTicketsBar`, `SendCommandaModal`, `MenuScreen`, `PaymentScreen`).
- **Usuario_Eje**: usuario que tiene un turno de caja abierto (`activeShift !== null` en `useCashRegister`) y que, por esa condición operativa, es el único autorizado a escribir en mesas mientras no hay internet. No es un rol ni un permiso.
- **Observador**: usuario sin turno de caja abierto. En estado offline solo puede leer el último estado conocido de las mesas; no puede modificarlas.
- **Estado_Offline**: condición en que el Sistema no tiene conexión verificada a Supabase, determinada por el `isOnline` existente en `hooks/useOfflineSync.ts`.
- **Estado_Online**: condición en que el Sistema tiene conexión verificada a Supabase.
- **Turno_Abierto**: registro `cash_shifts` con `status = 'open'` asociado a un usuario.
- **Cache_Mesas_IDB**: almacenamiento persistente en IndexedDB de la lista de mesas y salas del negocio.
- **Cache_Orden_Mesa_IDB**: almacenamiento persistente en IndexedDB de la orden activa (items y modificadores) de cada mesa.
- **Cola_Offline**: cola de transacciones offline en IndexedDB (`lib/offlineQueue.ts` / `lib/offlineStorage.ts`) que se sincroniza al recuperar conexión.
- **ID_Temporal**: identificador local con prefijo (`offline_table_*`, `offline_room_*`, `offline_order_*`) asignado a entidades creadas offline antes de tener su UUID real de Supabase.
- **Mapa_IDs_Offline**: estructura de mapeo `ID_Temporal → UUID_real` persistida localmente, análoga a `lib/offlineClientMap.ts` (`offlineTableMap`, `offlineRoomMap`, `offlineOrderMap`).
- **Comanda**: ticket de cocina impreso con los items nuevos de una mesa.
- **Impresion_QZ_Local**: impresión de comanda enviada a la impresora térmica conectada al propio dispositivo vía QZ Tray (`printKitchenCommandDirect`).
- **Envio_Comanda_Remoto**: envío de comanda a un dispositivo remoto del negocio vía Supabase Realtime (`sendKitchenCommand`), que requiere conexión.
- **Caja_Optimista**: reflejo local del movimiento de efectivo sin conexión (`lib/offlineCashCache.ts`, `pushOfflineCashMovement`).
- **Lista_Turnos_Abiertos_Cache**: caché local de la última lista conocida de turnos con `status = 'open'` (incluyendo nombres de usuario), usada para determinar quién es Usuario_Eje al caer internet.
- **canFinalizeSale**: helper de permisos (`hooks/usePermissions.ts`) que autoriza finalizar/cobrar ventas (permiso `pos_sell`).

## Requirements

### Requisito 1: Persistencia offline de la lista de mesas y salas

**Historia de Usuario:** Como cajero de un restaurante, quiero que la lista de mesas y salas siga disponible sin internet aunque recargue la aplicación, para poder ubicar y seleccionar las mesas mientras opero offline.

#### Criterios de Aceptación

1. WHEN el Sistema obtiene la lista de mesas y salas desde Supabase en Estado_Online, THE Modulo_Mesas SHALL guardar esa lista en Cache_Mesas_IDB.
2. WHILE el Sistema está en Estado_Offline, THE Modulo_Mesas SHALL cargar la lista de mesas y salas desde Cache_Mesas_IDB.
3. WHEN el Sistema se recarga en Estado_Offline y existe Cache_Mesas_IDB previa, THE Modulo_Mesas SHALL mostrar la lista de mesas y salas persistida sin requerir conexión.
4. IF el Sistema está en Estado_Offline y no existe Cache_Mesas_IDB previa, THEN THE Modulo_Mesas SHALL mostrar un mensaje que indique que no hay datos de mesas disponibles sin conexión.
5. WHEN el Sistema recupera el Estado_Online, THE Modulo_Mesas SHALL actualizar Cache_Mesas_IDB con la lista vigente de Supabase.

### Requisito 2: Persistencia offline de la orden activa de cada mesa

**Historia de Usuario:** Como cajero, quiero que el pedido en curso de cada mesa se conserve localmente, para poder revisarlo y continuarlo sin internet aunque recargue la aplicación.

#### Criterios de Aceptación

1. WHEN el Modulo_Mesas carga la orden activa de una mesa en Estado_Online, THE Modulo_Mesas SHALL guardar los items y modificadores de esa orden en Cache_Orden_Mesa_IDB.
2. WHEN el Usuario_Eje selecciona una mesa ocupada en Estado_Offline, THE Modulo_Mesas SHALL hidratar el carrito con la orden persistida en Cache_Orden_Mesa_IDB.
3. WHEN el Usuario_Eje agrega o quita items o modificadores de una mesa en Estado_Offline, THE Modulo_Mesas SHALL actualizar Cache_Orden_Mesa_IDB con el nuevo contenido de la orden.
4. IF el Usuario_Eje selecciona una mesa marcada como ocupada en Estado_Offline y no existe orden en Cache_Orden_Mesa_IDB, THEN THE Modulo_Mesas SHALL mostrar la mesa con carrito vacío e indicar que su detalle no fue cacheado.

### Requisito 3: Determinación del Usuario Eje

**Historia de Usuario:** Como sistema, necesito saber qué dispositivos pueden escribir en mesas sin internet, para permitir solo al usuario con turno abierto y bloquear a los demás.

#### Criterios de Aceptación

1. WHEN el Sistema recibe cambios en `cash_shifts` con `status = 'open'` vía Realtime en Estado_Online, THE Sistema SHALL actualizar la Lista_Turnos_Abiertos_Cache con los identificadores y nombres de los usuarios con Turno_Abierto.
2. WHILE el Sistema está en Estado_Offline, THE Sistema SHALL determinar que el usuario actual es Usuario_Eje cuando su identificador figura en la Lista_Turnos_Abiertos_Cache.
3. IF el usuario actual no figura en la Lista_Turnos_Abiertos_Cache en Estado_Offline, THEN THE Sistema SHALL clasificar al usuario como Observador.
4. WHEN el usuario tiene un `activeShift` local distinto de `null` en Estado_Offline, THE Sistema SHALL clasificarlo como Usuario_Eje.

### Requisito 4: Restricción de escritura offline al Usuario Eje

**Historia de Usuario:** Como dueño del negocio, quiero que solo el cajero con turno abierto pueda modificar mesas sin internet, para evitar que dos dispositivos cobren la misma mesa o corrompan las órdenes.

#### Criterios de Aceptación

1. WHILE el Usuario_Eje está en Estado_Offline, THE Modulo_Mesas SHALL permitir tomar pedidos, agregar y quitar items y modificadores, crear/editar/eliminar mesas y salas, imprimir comanda en la impresora local y cobrar mesas.
2. WHERE el usuario es Usuario_Eje en Estado_Offline, THE Modulo_Mesas SHALL permitir cobrar una mesa aunque `canFinalizeSale` sea falso.
3. WHILE el Sistema está en Estado_Online, THE Modulo_Mesas SHALL aplicar el permiso `canFinalizeSale` de forma normal para cobrar mesas.
4. WHILE el usuario es Observador en Estado_Offline, THE Modulo_Mesas SHALL bloquear cualquier operación de escritura sobre mesas, salas u órdenes.

### Requisito 5: Experiencia del Observador offline (solo lectura)

**Historia de Usuario:** Como mesero sin turno de caja abierto, quiero ver el estado de las mesas sin internet pero entender que no puedo modificarlas, para saber a quién acudir para tomar pedidos.

#### Criterios de Aceptación

1. WHILE el usuario es Observador en Estado_Offline, THE Modulo_Mesas SHALL mostrar el último estado conocido de las mesas en modo congelado sin controles de edición ni de cobro.
2. WHILE el usuario es Observador en Estado_Offline, THE Modulo_Mesas SHALL mostrar un banner que indique que sin internet solo el Usuario_Eje puede tomar pedidos, incluyendo el nombre del Usuario_Eje.
3. WHERE existe un único Usuario_Eje conocido en la Lista_Turnos_Abiertos_Cache, THE Modulo_Mesas SHALL mostrar el mensaje al Observador con el nombre de ese Usuario_Eje, con el formato: "Sin internet. Solo [Nombre] (turno abierto) puede tomar pedidos a mesas ahora."
4. IF el Observador intenta agregar, quitar, crear, editar, eliminar o cobrar en Estado_Offline, THEN THE Modulo_Mesas SHALL impedir la acción y mantener el mensaje de solo lectura.

### Requisito 6: Aviso operacional de multi-eje

**Historia de Usuario:** Como cajero, quiero recibir un aviso cuando hay más de un turno de caja abierto, para coordinarme con los otros cajeros y no cobrar la misma mesa dos veces si cae internet.

#### Criterios de Aceptación

1. WHEN un usuario abre un Turno_Abierto y ya existe al menos otro Turno_Abierto activo, THE Sistema SHALL mostrar un aviso operacional que liste los nombres de los usuarios con Turno_Abierto.
2. WHEN el Sistema transiciona de Estado_Online a Estado_Offline y la Lista_Turnos_Abiertos_Cache contiene dos o más usuarios, THE Sistema SHALL mostrar un recordatorio operacional que liste los nombres de los usuarios con Turno_Abierto.
3. THE aviso operacional de multi-eje SHALL usar un texto equivalente a: "Hay más de un cajero con turno abierto ([Nombres]). Mantengan comunicación si se cae internet para no cobrar la misma mesa dos veces."
4. THE Modulo_Mesas SHALL registrar en la documentación de diseño que la coordinación técnica del multi-eje (lock o partición de mesas) queda como mejora futura fuera del alcance de esta entrega.

### Requisito 7: Toma de pedido offline (items y modificadores)

**Historia de Usuario:** Como Usuario Eje sin internet, quiero agregar y quitar productos y sus modificadores a una mesa, para seguir atendiendo a los clientes con normalidad.

#### Criterios de Aceptación

1. WHEN el Usuario_Eje agrega un producto a una mesa en Estado_Offline, THE Modulo_Mesas SHALL persistir el item en Cache_Orden_Mesa_IDB y encolar la operación correspondiente en la Cola_Offline sin escribir en Supabase.
2. WHEN el Usuario_Eje agrega un producto con modificadores a una mesa en Estado_Offline, THE Modulo_Mesas SHALL persistir el item con sus modificadores en Cache_Orden_Mesa_IDB.
3. WHEN el Usuario_Eje quita un item de una mesa en Estado_Offline, THE Modulo_Mesas SHALL actualizar Cache_Orden_Mesa_IDB y encolar la operación correspondiente en la Cola_Offline.
4. WHEN el Usuario_Eje agrega el primer item a una mesa libre en Estado_Offline, THE Modulo_Mesas SHALL marcar localmente la mesa como ocupada.
5. THE Modulo_Mesas SHALL mostrar un distintivo visual de "pendiente de sincronizar" en los items que aún no han sido sincronizados con Supabase.

### Requisito 8: Creación, edición y eliminación de mesas offline

**Historia de Usuario:** Como Usuario Eje sin internet, quiero crear, renombrar y eliminar mesas, para organizar el salón aunque no haya conexión.

#### Criterios de Aceptación

1. WHEN el Usuario_Eje crea una mesa en Estado_Offline, THE Modulo_Mesas SHALL asignarle un ID_Temporal con prefijo `offline_table_`, guardarla en Cache_Mesas_IDB y encolar una transacción `create_table` en la Cola_Offline.
2. WHEN el Usuario_Eje renombra una mesa en Estado_Offline, THE Modulo_Mesas SHALL actualizar Cache_Mesas_IDB y encolar una transacción `update_table` en la Cola_Offline.
3. WHEN el Usuario_Eje elimina una mesa libre en Estado_Offline, THE Modulo_Mesas SHALL actualizar Cache_Mesas_IDB y encolar una transacción `delete_table` en la Cola_Offline.
4. IF el Usuario_Eje intenta eliminar una mesa que tiene items o está ocupada en Estado_Offline, THEN THE Modulo_Mesas SHALL impedir la eliminación y mostrar un mensaje que indique que la mesa tiene un pedido activo.

### Requisito 9: Creación, edición y eliminación de salas offline

**Historia de Usuario:** Como Usuario Eje sin internet, quiero crear, renombrar y eliminar salas, para reorganizar el establecimiento aunque no haya conexión.

#### Criterios de Aceptación

1. WHEN el Usuario_Eje crea una sala en Estado_Offline, THE Modulo_Mesas SHALL asignarle un ID_Temporal con prefijo `offline_room_`, guardarla en Cache_Mesas_IDB y encolar una transacción `create_room` en la Cola_Offline.
2. WHEN el Usuario_Eje renombra una sala en Estado_Offline, THE Modulo_Mesas SHALL actualizar Cache_Mesas_IDB y encolar una transacción `update_room` en la Cola_Offline.
3. WHEN el Usuario_Eje elimina una sala no principal en Estado_Offline, THE Modulo_Mesas SHALL reasignar sus mesas a la sala principal en Cache_Mesas_IDB y encolar una transacción `delete_room` en la Cola_Offline.

### Requisito 10: Identificadores temporales y mapeo a UUID real

**Historia de Usuario:** Como sistema, necesito vincular las entidades creadas offline con sus registros reales de Supabase al sincronizar, para no duplicar mesas, salas ni órdenes.

#### Criterios de Aceptación

1. WHEN el Sistema sincroniza una transacción `create_table`, `create_room` o de creación de orden en Estado_Online, THE Sistema SHALL registrar el mapeo ID_Temporal → UUID_real en el Mapa_IDs_Offline correspondiente.
2. WHEN el Sistema sincroniza una transacción que referencia un ID_Temporal de mesa, sala u orden, THE Sistema SHALL resolver el ID_Temporal al UUID_real antes de escribir en Supabase.
3. THE Sistema SHALL procesar las transacciones de creación de mesas, salas y órdenes antes de las transacciones que dependen de esos identificadores.
4. IF un ID_Temporal no puede resolverse a un UUID_real durante la sincronización, THEN THE Sistema SHALL dejar la transacción dependiente en la Cola_Offline para el siguiente ciclo de sincronización sin descartarla.

### Requisito 11: Impresión de comanda offline

**Historia de Usuario:** Como Usuario Eje sin internet, quiero imprimir la comanda en la impresora local, para que la cocina reciba el pedido aunque el envío remoto no esté disponible.

#### Criterios de Aceptación

1. WHEN el Usuario_Eje envía una comanda en Estado_Offline y hay una impresora QZ conectada al dispositivo, THE Modulo_Mesas SHALL ejecutar la Impresion_QZ_Local sin escribir en Supabase.
2. WHEN el Usuario_Eje envía una comanda en Estado_Offline, THE Modulo_Mesas SHALL marcar localmente los items enviados como en preparación en Cache_Orden_Mesa_IDB y encolar la confirmación de comanda en la Cola_Offline.
3. IF el Usuario_Eje intenta un Envio_Comanda_Remoto en Estado_Offline, THEN THE Modulo_Mesas SHALL bloquear la acción y mostrar un mensaje que indique que el envío a dispositivos remotos requiere conexión.
4. IF el Usuario_Eje intenta enviar una comanda en Estado_Offline y no hay impresora QZ conectada al dispositivo, THEN THE Modulo_Mesas SHALL mostrar un mensaje que indique que no hay impresora local disponible.

### Requisito 12: Cobro de mesa offline

**Historia de Usuario:** Como Usuario Eje sin internet, quiero cobrar una mesa y registrar el pago, para cerrar la cuenta del cliente sin depender de la conexión, tal como ya funciona la Orden Rápida.

#### Criterios de Aceptación

1. WHEN el Usuario_Eje cobra una mesa en Estado_Offline, THE Modulo_Mesas SHALL registrar la venta en la Cola_Offline incluyendo el identificador de la mesa.
2. WHEN el Usuario_Eje cobra una mesa en Estado_Offline, THE Caja_Optimista SHALL reflejar el movimiento de efectivo del cobro de la misma forma que en una venta de Orden Rápida offline.
3. THE Modulo_Mesas SHALL permitir el cobro de mesas en Estado_Offline sin aplicar el guard que hoy excluye las mesas (`!activeTableId`) del flujo offline de cobro.
4. WHEN el Usuario_Eje termina de cobrar una mesa en Estado_Offline, THE Modulo_Mesas SHALL liberar localmente la mesa dejándola como disponible y sin orden activa.
5. WHEN el Sistema sincroniza el cobro de una mesa en Estado_Online, THE Sistema SHALL actualizar la mesa en Supabase a estado disponible y sin orden activa (`status = 'available'`, `current_order_id = null`).

### Requisito 13: Bloqueo de cierre de turno con mesas pendientes

**Historia de Usuario:** Como dueño del negocio, quiero impedir que un cajero cierre su turno si tiene mesas sin cobrar, para que el arqueo cuadre y no queden cuentas abiertas huérfanas.

#### Criterios de Aceptación

1. IF un usuario intenta cerrar un Turno_Abierto en Estado_Online y existen mesas con items pendientes o sin cobrar asociadas a ese turno, THEN THE Sistema SHALL impedir el cierre del turno y mostrar el mensaje: "Termina de cobrar las mesas pendientes antes de cerrar."
2. IF un usuario intenta cerrar un Turno_Abierto en Estado_Offline y existen mesas con items pendientes o sin cobrar asociadas a ese turno, THEN THE Sistema SHALL impedir el cierre del turno y mostrar el mismo mensaje de mesas pendientes.
3. WHEN un usuario ha cobrado o liberado todas las mesas con items pendientes de su turno, THE Sistema SHALL permitir el cierre del turno.

### Requisito 14: Sincronización de mesas al recuperar conexión

**Historia de Usuario:** Como Usuario Eje, quiero que todo lo que hice offline en las mesas se suba correctamente al volver internet, para que el sistema quede consistente y no se dupliquen cobros.

#### Criterios de Aceptación

1. WHEN el Sistema recupera el Estado_Online, THE Sistema SHALL sincronizar las transacciones de mesas, salas y órdenes encoladas en la Cola_Offline.
2. WHEN el Sistema sincroniza una orden de mesa creada o editada offline, THE Sistema SHALL reconstruir la orden en Supabase con los items locales del Usuario_Eje.
3. IF al sincronizar el cobro de una mesa el Sistema detecta que la mesa ya fue cobrada por otro dispositivo, THEN THE Sistema SHALL notificar el conflicto al usuario y no duplicar el cobro.
4. WHEN una transacción de mesa se sincroniza correctamente, THE Sistema SHALL retirarla de la Cola_Offline y reemplazar los distintivos locales de "pendiente" por el estado sincronizado.
5. IF una transacción de mesa falla durante la sincronización, THEN THE Sistema SHALL marcarla como fallida, incrementar su contador de reintentos y continuar con la siguiente transacción sin bloquear la cola.

### Requisito 15: Verificación de disponibilidad del Usuario Eje al abrir una mesa

**Historia de Usuario:** Como Observador con internet, quiero que el Sistema verifique si el Usuario Eje está en línea justo cuando abro una mesa, para no editar una mesa que el Eje podría estar modificando sin conexión.

#### Criterios de Aceptación

1. WHEN un Observador en Estado_Online abre una mesa, THE Modulo_Mesas SHALL leer el estado de presencia vigente del Canal_Presencia existente (`lib/presenceManager.ts`) sin crear una suscripción nueva.
2. IF al abrir una mesa el Usuario_Eje figura como presente en el Canal_Presencia, THEN THE Modulo_Mesas SHALL permitir la operación normal en línea conforme a los permisos del Observador.
3. IF al abrir una mesa ningún Usuario_Eje conocido figura como presente en el Canal_Presencia, THEN THE Modulo_Mesas SHALL tratar la mesa como solo lectura para el Observador.
4. THE Modulo_Mesas SHALL identificar al Usuario_Eje cruzando la Lista_Turnos_Abiertos_Cache (usuarios con `cash_shifts.status = 'open'`) con el estado del Canal_Presencia.
5. THE verificación SHALL realizarse como una lectura puntual en el momento de abrir la mesa, sin sondeo continuo, para no consumir recursos adicionales de Realtime.
6. THE diseño SHALL registrar que, al perder conexión el Usuario_Eje, el Canal_Presencia puede tardar unos segundos en retirarlo, y que durante esa ventana breve la verificación puede reflejar al Eje como presente (riesgo residual aceptado del modelo single-writer).

### Requisito 16: Congelamiento del Observador cuando el Eje está sin conexión

**Historia de Usuario:** Como dueño del negocio, quiero que ningún Observador modifique mesas mientras el Usuario Eje está sin conexión —aunque el Observador tenga internet—, para que el Eje sea la única fuente de verdad y no se generen conflictos.

#### Criterios de Aceptación

1. WHILE el Usuario_Eje no figura como presente en el Canal_Presencia y el Observador está en Estado_Online, THE Modulo_Mesas SHALL bloquear en el Observador agregar, quitar, crear, editar, eliminar y cobrar mesas, igual que si el propio Observador estuviera en Estado_Offline.
2. WHILE el Observador está en modo congelado por Eje sin conexión, THE Modulo_Mesas SHALL mostrar un mensaje que indique que el Usuario_Eje está sin conexión y que las mesas quedan en solo lectura hasta que se reconecte, incluyendo el nombre del Usuario_Eje.
3. WHERE existe un único Usuario_Eje, THE mensaje SHALL usar el formato: "[Nombre] (cajero del turno) está sin conexión. Las mesas están en solo lectura hasta que se reconecte."
4. WHEN el Usuario_Eje vuelve a figurar como presente en el Canal_Presencia, THE Modulo_Mesas SHALL restablecer la capacidad de operación en línea del Observador conforme a sus permisos.

### Requisito 17: Aviso de recarga tras la sincronización del Eje

**Historia de Usuario:** Como Observador, quiero que la aplicación me obligue a recargar cuando el Usuario Eje termina de subir sus cambios, para trabajar siempre con el estado real de las mesas y no con datos desactualizados.

#### Criterios de Aceptación

1. WHEN el Usuario_Eje completa la sincronización de todas sus transacciones de mesas pendientes en la Cola_Offline, THE Sistema SHALL emitir una señal de recarga a los dispositivos conectados del negocio.
2. THE Sistema SHALL emitir la señal de recarga únicamente cuando el Usuario_Eje no tenga transacciones pendientes de sincronizar.
3. WHEN un dispositivo Observador conectado recibe la señal de recarga, THE Sistema SHALL mostrar un aviso de recarga obligatoria (modal bloqueante) que recargue la aplicación.
4. THE Sistema SHALL NOT mostrar el aviso de recarga al Usuario_Eje.
5. WHEN un Observador que estuvo sin conexión o desconectado del canal recupera el Estado_Online y entra al Modulo_Mesas, IF su Cache_Mesas_IDB es anterior a la última sincronización conocida del Usuario_Eje, THEN THE Sistema SHALL forzar la recarga de la aplicación.
6. THE aviso de recarga obligatoria SHALL preservar la información ya cacheada localmente (por ejemplo, el carrito de Orden Rápida) para que no se pierda tras recargar.

### Requisito 18: Documentación de la funcionalidad

**Historia de Usuario:** Como equipo de producto, quiero que esta funcionalidad quede documentada en la carpeta `docs`, para que el comportamiento del modelo usuario-eje y las mesas offline queden registrados para soporte y mantenimiento.

#### Criterios de Aceptación

1. WHEN la implementación de esta funcionalidad se completa, THE equipo SHALL actualizar `docs/caracteristicas/modo_offline.md` agregando una sección de mesas offline y el modelo Usuario_Eje, redactada en español y siguiendo el estilo existente del archivo.
2. WHEN la implementación de esta funcionalidad se completa, THE equipo SHALL actualizar la tabla de "Limitaciones Conocidas" (sección 6) de `docs/caracteristicas/modo_offline.md` para reflejar que cobrar mesas offline ya está soportado.
3. WHEN la implementación de esta funcionalidad se completa, THE equipo SHALL crear o actualizar una guía de usuario en `docs/guias_usuario/` que explique el modelo del Usuario_Eje al usuario final, en español y siguiendo el estilo de `docs/guias_usuario/como_usar_el_modo_offline.md`.
4. WHEN la implementación de esta funcionalidad se completa, THE equipo SHALL revisar `docs/caracteristicas/mesas.md` y actualizarlo si el comportamiento offline de mesas afecta lo documentado.
5. THE documentación actualizada SHALL registrar la coordinación técnica del multi-eje (lock o partición de mesas) como mejora futura.
6. THE documentación actualizada SHALL describir la detección de disponibilidad del Usuario_Eje vía Canal_Presencia (lectura puntual al abrir mesa), el congelamiento del Observador cuando el Eje está sin conexión, y el aviso de recarga obligatoria tras la sincronización del Eje.
