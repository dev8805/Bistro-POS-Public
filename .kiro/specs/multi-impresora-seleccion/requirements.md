# Requirements Document

## Introduction

Esta feature permite a Bistro POS registrar **varias impresoras térmicas** (las que el equipo ya reconoce a través de QZ Tray, sin configuración manual de IP dentro de la app) y elegir de forma **independiente** cuál se usa para imprimir **tickets de venta** y cuál para imprimir **comandas de cocina**.

Hoy el servicio `lib/thermalPrinterService.ts` guarda una sola impresora (`selectedPrinterName` + clave de `localStorage` `bistro_thermal_printer`) y todas las funciones de impresión (`printReceiptDirect`, `printKitchenCommandDirect`, `printShiftReportDirect`) apuntan a esa única impresora. El objetivo es ampliar ese modelo a una **lista de impresoras registradas** con una **impresora predeterminada por rol** (ticket y comanda), manteniendo intacto el flujo existente de envío de comandas a un dispositivo de cocina remoto vía presence/realtime y sin romper la compatibilidad con la impresora única ya guardada.

Caso de uso típico: una impresora USB en el mostrador para los tickets y una impresora de cocina conectada por LAN/red (instalada en Windows como puerto TCP/IP) para las comandas.

## Alcance

**Dentro del alcance:**
- Registrar y eliminar múltiples impresoras desde Ajustes, usando la lista que ya entrega QZ.
- Persistir localmente la lista de impresoras registradas y la impresora predeterminada por rol (ticket / comanda).
- Botones de impresión tipo "split button" con flecha desplegable en las pantallas de éxito de venta.
- Comportamiento de impresora predeterminada por rol con elección obligatoria la primera vez y "fijación" de la última elegida.
- Impresión del reporte de cierre de caja en la impresora predeterminada de ticket.
- Detección de estado/conexión con varias impresoras registradas.

**Fuera del alcance:**
- Agregar impresoras por LAN/IP desde la app (la impresora de red se instala en Windows aparte y aparece sola en la lista de QZ).
- Cambios en el flujo de envío de comanda a dispositivo remoto vía presence/realtime (se mantiene intacto).
- Cambios en el firmado RSA, el encoding ESC/POS o la transliteración ASCII.

## Glossary

- **Servicio_Impresión**: el servicio `lib/thermalPrinterService.ts`, responsable de la conexión con QZ Tray, el listado de impresoras, la selección y el envío de comandos ESC/POS.
- **QZ_Tray**: aplicación de escritorio que expone por WebSocket local las impresoras que el sistema operativo tiene instaladas y ejecuta la impresión.
- **Impresora_Registrada**: impresora que el usuario agregó explícitamente a la lista persistente de la app desde Ajustes, tomada de las impresoras que reporta QZ_Tray.
- **Lista_Impresoras_Registradas**: colección persistente de Impresora_Registrada guardada por dispositivo/navegador.
- **Rol_Impresión**: clasificación del documento a imprimir; sus valores son `TICKET` (ticket de venta y reporte de cierre de caja) y `COMANDA` (comanda de cocina).
- **Impresora_Predeterminada_Ticket**: la Impresora_Registrada que el Servicio_Impresión usa por defecto para el Rol_Impresión `TICKET`.
- **Impresora_Predeterminada_Comanda**: la Impresora_Registrada que el Servicio_Impresión usa por defecto para el Rol_Impresión `COMANDA`.
- **Panel_Ajustes_Impresoras**: la UI de gestión de impresoras dentro de `components/SettingsSidebarPanel.tsx` (componente `PrinterConnectionCard`).
- **Botón_Dividido**: control de UI tipo "split button" compuesto por una acción principal (imprimir) y una flecha desplegable (▼) que muestra la Lista_Impresoras_Registradas para elegir destino. Aparece en `screens/SuccessScreen.tsx` y `components/SuccessSidebar.tsx`.
- **Almacenamiento_Local**: el `localStorage` del navegador, por dispositivo.
- **Clave_Impresora_Heredada**: la clave de Almacenamiento_Local `bistro_thermal_printer` usada por la versión anterior de una sola impresora.
- **Envío_Comanda_Remoto**: el flujo existente que envía la comanda a otro dispositivo de cocina vía presence/realtime (`hooks/useKitchenPrinter.ts`, `lib/kitchenCommandService.ts`).
- **Estado_Conexión**: estado físico/lógico de una impresora reportado por el Servicio_Impresión; sus valores son `disconnected`, `connecting`, `connected` y `unknown`.

## Requirements

### Requerimiento 1: Registrar varias impresoras desde Ajustes

**Historia de Usuario:** Como administrador del negocio, quiero registrar varias impresoras que mi equipo ya tiene conectadas, para poder destinar cada una a un uso distinto (tickets y comandas).

#### Criterios de Aceptación

1. CUANDO el usuario abre el Panel_Ajustes_Impresoras, EL Servicio_Impresión DEBERÁ listar las impresoras que QZ_Tray reporta como instaladas en el equipo en un plazo máximo de 5 segundos.
2. SI QZ_Tray no está conectado o no responde al solicitar la lista de impresoras, ENTONCES EL Servicio_Impresión DEBERÁ mostrar una indicación de que QZ_Tray no está disponible y conservar la Lista_Impresoras_Registradas existente sin alterarla.
3. SI QZ_Tray responde pero no reporta ninguna impresora instalada, ENTONCES EL Panel_Ajustes_Impresoras DEBERÁ indicar que no hay impresoras disponibles para agregar.
4. CUANDO el usuario selecciona una impresora de la lista de QZ_Tray para agregarla, EL Servicio_Impresión DEBERÁ añadir esa impresora a la Lista_Impresoras_Registradas y mostrar una confirmación visible del alta.
5. EL Panel_Ajustes_Impresoras DEBERÁ mostrar la Lista_Impresoras_Registradas completa con todas las impresoras agregadas.
6. SI el usuario intenta agregar una impresora cuyo nombre ya existe en la Lista_Impresoras_Registradas, ENTONCES EL Servicio_Impresión DEBERÁ conservar una sola entrada con ese nombre, no crear un duplicado y mostrar una indicación de que la impresora ya estaba registrada.
7. EL Panel_Ajustes_Impresoras DEBERÁ permitir agregar impresoras únicamente a partir de la lista que entrega QZ_Tray, sin ofrecer ningún control ni campo de alta manual por dirección LAN/IP.

### Requerimiento 2: Eliminar una impresora registrada

**Historia de Usuario:** Como administrador del negocio, quiero eliminar una impresora de la lista registrada, para mantener solo las impresoras que realmente uso.

#### Criterios de Aceptación

1. CUANDO el usuario solicita eliminar una Impresora_Registrada, EL Panel_Ajustes_Impresoras DEBERÁ pedir una confirmación que identifique la impresora antes de proceder con la eliminación.
2. CUANDO el usuario confirma la eliminación de una Impresora_Registrada, EL Servicio_Impresión DEBERÁ quitar esa impresora de la Lista_Impresoras_Registradas, persistir el cambio y mostrar una indicación de éxito en un plazo máximo de 3 segundos.
3. SI el usuario cancela la confirmación de eliminación, ENTONCES EL Servicio_Impresión DEBERÁ conservar la Impresora_Registrada en la Lista_Impresoras_Registradas sin cambios.
4. SI la impresora eliminada estaba asignada como Impresora_Predeterminada_Ticket o como Impresora_Predeterminada_Comanda, ENTONCES EL Servicio_Impresión DEBERÁ borrar esa asignación de predeterminada para el Rol_Impresión correspondiente.
5. CUANDO el usuario elimina una impresora que estaba asignada a un Rol_Impresión, EL Botón_Dividido de ese Rol_Impresión DEBERÁ volver a exigir una elección de impresora en la siguiente impresión, según el Requerimiento 6.
6. SI la persistencia del cambio falla al eliminar una impresora, ENTONCES EL Servicio_Impresión DEBERÁ conservar la impresora en la Lista_Impresoras_Registradas y mostrar un mensaje de error indicando que la eliminación no se pudo guardar.

### Requerimiento 3: Persistencia local de impresoras y predeterminadas

**Historia de Usuario:** Como usuario del POS, quiero que la lista de impresoras y mis impresoras predeterminadas se recuerden en este equipo, para no reconfigurarlas en cada venta.

#### Criterios de Aceptación

1. CUANDO el usuario agrega o elimina una Impresora_Registrada, EL Servicio_Impresión DEBERÁ guardar la Lista_Impresoras_Registradas completa en el Almacenamiento_Local en un plazo máximo de 2 segundos desde la confirmación de la acción.
2. CUANDO el usuario define o cambia la Impresora_Predeterminada_Ticket o la Impresora_Predeterminada_Comanda, EL Servicio_Impresión DEBERÁ guardar esa asignación en el Almacenamiento_Local de forma independiente por Rol_Impresión, sin alterar la asignación del otro Rol_Impresión.
3. CUANDO la aplicación se inicia en un equipo con datos guardados válidos, EL Servicio_Impresión DEBERÁ cargar la Lista_Impresoras_Registradas y las impresoras predeterminadas por Rol_Impresión desde el Almacenamiento_Local antes de habilitar cualquier acción de impresión.
4. EL Servicio_Impresión DEBERÁ mantener la Lista_Impresoras_Registradas y las predeterminadas de forma local por dispositivo/navegador, sin sincronizarlas entre equipos.
5. SI la operación de guardado en el Almacenamiento_Local falla (por ejemplo, almacenamiento no disponible o cuota excedida), ENTONCES EL Servicio_Impresión DEBERÁ conservar en memoria la configuración vigente de la sesión actual y mostrar un mensaje de error indicando que los cambios no se pudieron guardar de forma permanente.
6. SI al iniciar la aplicación los datos guardados están ausentes, corruptos o no tienen un formato válido, ENTONCES EL Servicio_Impresión DEBERÁ inicializar la Lista_Impresoras_Registradas como vacía y dejar sin asignar ambas impresoras predeterminadas, sin interrumpir el arranque de la aplicación.
7. SI una Impresora_Predeterminada_Ticket o Impresora_Predeterminada_Comanda guardada referencia una Impresora_Registrada que ya no existe en la Lista_Impresoras_Registradas, ENTONCES EL Servicio_Impresión DEBERÁ invalidar esa asignación predeterminada y dejar ese Rol_Impresión sin impresora asignada.

### Requerimiento 4: Compatibilidad con la impresora única previa

**Historia de Usuario:** Como usuario que ya tenía una impresora configurada, quiero que mi configuración anterior siga funcionando tras la actualización, para no perder la impresora ya conectada.

#### Criterios de Aceptación

1. CUANDO la aplicación se inicia y existe un valor en la Clave_Impresora_Heredada y la Lista_Impresoras_Registradas está vacía, EL Servicio_Impresión DEBERÁ incorporar la impresora de la Clave_Impresora_Heredada a la Lista_Impresoras_Registradas como una única entrada, sin crear entradas duplicadas.
2. CUANDO el Servicio_Impresión completa con éxito la incorporación de la impresora desde la Clave_Impresora_Heredada, EL Servicio_Impresión DEBERÁ asignar esa impresora como Impresora_Predeterminada_Ticket y como Impresora_Predeterminada_Comanda.
3. SI no existe valor en la Clave_Impresora_Heredada ni datos nuevos guardados, ENTONCES EL Servicio_Impresión DEBERÁ iniciar con la Lista_Impresoras_Registradas vacía y sin impresoras predeterminadas.
4. CUANDO la aplicación se inicia y existe un valor en la Clave_Impresora_Heredada y la Lista_Impresoras_Registradas NO está vacía, EL Servicio_Impresión DEBERÁ conservar la Lista_Impresoras_Registradas y las impresoras predeterminadas existentes sin alterarlas, y omitir la migración desde la Clave_Impresora_Heredada.
5. SI la incorporación de la impresora desde la Clave_Impresora_Heredada falla o el valor de la Clave_Impresora_Heredada es inválido o está vacío, ENTONCES EL Servicio_Impresión DEBERÁ iniciar con la Lista_Impresoras_Registradas vacía, sin impresoras predeterminadas, conservar intacto el valor original de la Clave_Impresora_Heredada y mostrar una indicación de error señalando que la impresora previa no pudo migrarse.

### Requerimiento 5: Botón dividido de impresión de ticket en las pantallas de éxito

**Historia de Usuario:** Como cajero, quiero un botón de ticket con una flecha para elegir la impresora, para imprimir el ticket en la impresora correcta sin entrar a Ajustes.

> Nota: este requerimiento aplica únicamente al Rol_Impresión `TICKET`. La selección de impresora para el Rol_Impresión `COMANDA` se realiza mediante el grid "Enviar comanda a" descrito en el Requerimiento 16, no mediante un Botón_Dividido.

#### Criterios de Aceptación

1. EL Botón_Dividido de ticket en `screens/SuccessScreen.tsx` y en `components/SuccessSidebar.tsx` DEBERÁ presentar una acción principal "Imprimir Ticket" y una flecha desplegable (▼).
2. CUANDO el usuario activa la flecha desplegable (▼) del Botón_Dividido de ticket mediante clic, toque, tecla Enter o tecla Espacio, EL Botón_Dividido DEBERÁ mostrar la Lista_Impresoras_Registradas en un plazo máximo de 1 segundo para que el usuario elija una impresora destino.
3. EL Botón_Dividido de ticket DEBERÁ indicar visualmente, dentro de la lista desplegada, cuál impresora es la Impresora_Predeterminada_Ticket actual.
4. CUANDO el usuario selecciona una impresora desde la flecha desplegable (▼) del Botón_Dividido de ticket, EL Servicio_Impresión DEBERÁ imprimir el ticket en la impresora elegida.
5. EL Botón_Dividido de ticket DEBERÁ mantener la flecha desplegable (▼) disponible en todo momento, independientemente de si ya existe una Impresora_Predeterminada_Ticket.
6. SI la Lista_Impresoras_Registradas está vacía, ENTONCES EL Botón_Dividido de ticket DEBERÁ ofrecer una opción de "Conectar impresora" en la misma pantalla de éxito (según el Requerimiento 15) en lugar de imprimir, sin obligar al usuario a ir a Ajustes.

### Requerimiento 6: Elección obligatoria de impresora la primera vez

**Historia de Usuario:** Como cajero, quiero que la primera vez el sistema me pida elegir la impresora de ticket, para evitar imprimir en la impresora equivocada por defecto.

> Nota: este requerimiento aplica al Botón_Dividido de ticket. Para la comanda, el grid "Enviar comanda a" (Requerimiento 16) siempre requiere una selección explícita de destino, por lo que la "primera elección obligatoria" queda cubierta de forma natural.

#### Criterios de Aceptación

1. SI el usuario activa la acción principal del Botón_Dividido de ticket y no existe Impresora_Predeterminada_Ticket, ENTONCES EL Botón_Dividido DEBERÁ desplegar la Lista_Impresoras_Registradas y bloquear la impresión del ticket hasta que el usuario confirme una elección.
2. CUANDO el usuario elige una impresora en esa primera elección de ticket, EL Servicio_Impresión DEBERÁ guardar esa impresora como Impresora_Predeterminada_Ticket de forma persistente, de modo que activaciones posteriores del Botón_Dividido de ticket no vuelvan a desplegar la Lista_Impresoras_Registradas.
3. CUANDO el Servicio_Impresión confirma que la primera elección de ticket quedó guardada como predeterminada, EL Servicio_Impresión DEBERÁ enviar el ticket a la impresora recién elegida en un plazo máximo de 5 segundos desde la confirmación.
4. SI la Lista_Impresoras_Registradas no contiene ninguna impresora al momento de requerir la primera elección de ticket, ENTONCES EL Botón_Dividido de ticket DEBERÁ impedir la impresión y ofrecer una opción de "Conectar impresora" en la misma pantalla de éxito (según el Requerimiento 15).
5. SI el usuario cierra o cancela la Lista_Impresoras_Registradas sin elegir una impresora, ENTONCES EL Servicio_Impresión DEBERÁ cancelar la impresión, no guardar ninguna Impresora_Predeterminada_Ticket y conservar el documento pendiente sin enviarlo.
6. SI el guardado de la Impresora_Predeterminada_Ticket falla, ENTONCES EL Servicio_Impresión DEBERÁ cancelar la impresión, no marcar ninguna impresora como predeterminada y mostrar un mensaje que indique que la elección no pudo guardarse.

### Requerimiento 7: Impresión directa con la impresora predeterminada

**Historia de Usuario:** Como cajero con impresoras ya configuradas, quiero que un clic normal imprima directo en la impresora predeterminada, para agilizar la venta.

#### Criterios de Aceptación

1. CUANDO el usuario activa la acción principal del Botón_Dividido de ticket, SI existe una Impresora_Predeterminada_Ticket, ENTONCES EL Servicio_Impresión DEBERÁ enviar el ticket a la Impresora_Predeterminada_Ticket sin solicitar una elección, dentro de un plazo máximo de 3 segundos.
2. CUANDO el usuario toca una impresora local en el grid "Enviar comanda a" (Requerimiento 16), EL Servicio_Impresión DEBERÁ enviar la comanda a esa impresora dentro de un plazo máximo de 3 segundos.
3. SI el usuario activa la acción principal del Botón_Dividido y no existe una impresora predeterminada configurada para ese Rol_Impresión, ENTONCES EL Servicio_Impresión DEBERÁ mostrar la Lista_Impresoras_Registradas sin imprimir ningún documento.
4. SI el Servicio_Impresión no logra establecer conexión con QZ_Tray dentro de 3 segundos al intentar imprimir, ENTONCES EL Servicio_Impresión DEBERÁ cancelar la impresión, conservar el ticket o la comanda sin modificarlos, y mostrar un mensaje de error indicando que la impresora no está disponible.
5. CUANDO el Servicio_Impresión confirma el envío del documento a la impresora predeterminada, EL Servicio_Impresión DEBERÁ mostrar al usuario una notificación de éxito visible dentro de un plazo máximo de 2 segundos.

### Requerimiento 8: La última impresora elegida se fija como predeterminada

**Historia de Usuario:** Como cajero, quiero que cuando cambio de impresora con la flecha del ticket, esa nueva impresora quede como la predeterminada, para que las siguientes impresiones de ticket usen la última que elegí.

> Nota: este requerimiento aplica al Botón_Dividido de ticket. Para la comanda, el comportamiento de "última elegida se fija" se describe en el Requerimiento 16.

#### Criterios de Aceptación

1. CUANDO el usuario elige una impresora distinta a través de la flecha desplegable (▼) del Botón_Dividido de ticket, EL Servicio_Impresión DEBERÁ enviar el ticket a la impresora recién elegida en un plazo máximo de 5 segundos desde la selección.
2. CUANDO el usuario elige una impresora distinta a través de la flecha desplegable (▼) del Botón_Dividido de ticket, EL Servicio_Impresión DEBERÁ guardar esa impresora como la nueva Impresora_Predeterminada_Ticket de forma persistente entre sesiones.
3. CUANDO el usuario activa la acción principal del Botón_Dividido de ticket después de cambiar la impresora con la flecha, EL Servicio_Impresión DEBERÁ imprimir en la impresora elegida más recientemente para el Rol_Impresión `TICKET` sin volver a solicitar una elección.
4. SI la impresora recién elegida no está disponible o no responde al intentar imprimir, ENTONCES EL Servicio_Impresión DEBERÁ cancelar la impresión, mostrar un mensaje de error y conservar la Impresora_Predeterminada_Ticket anterior.
5. SI el guardado de la nueva Impresora_Predeterminada_Ticket falla, ENTONCES EL Servicio_Impresión DEBERÁ mostrar un mensaje de error y conservar la Impresora_Predeterminada_Ticket anterior.

### Requerimiento 9: Impresión por rol a la impresora correcta

**Historia de Usuario:** Como dueño del negocio, quiero que los tickets salgan en la impresora del mostrador y las comandas en la de cocina, para separar los documentos según su uso.

#### Criterios de Aceptación

1. CUANDO el Servicio_Impresión imprime un ticket mediante `printReceiptDirect` y existe una impresora asignada al Rol_Impresión `TICKET`, EL Servicio_Impresión DEBERÁ enviar los comandos a esa impresora dentro de los 5 segundos siguientes a la solicitud.
2. CUANDO el Servicio_Impresión imprime una comanda mediante `printKitchenCommandDirect` y existe una impresora asignada al Rol_Impresión `COMANDA`, EL Servicio_Impresión DEBERÁ enviar los comandos a esa impresora dentro de los 5 segundos siguientes a la solicitud.
3. EL Servicio_Impresión DEBERÁ permitir que la Impresora_Predeterminada_Ticket y la Impresora_Predeterminada_Comanda se configuren como impresoras distintas de forma independiente, sin que la asignación de una altere la asignación de la otra.
4. DONDE la Impresora_Predeterminada_Ticket y la Impresora_Predeterminada_Comanda son la misma impresora, EL Servicio_Impresión DEBERÁ imprimir ambos documentos en esa única impresora.
5. SI se solicita imprimir un documento y no existe ninguna impresora asignada al Rol_Impresión correspondiente (`TICKET` o `COMANDA`), ENTONCES EL Servicio_Impresión DEBERÁ cancelar el envío y mostrar un mensaje de error que indique que falta configurar la impresora para ese rol.
6. SI el envío de los comandos a la impresora asignada falla o no se completa dentro de los 5 segundos (por impresora no disponible o sin conexión con QZ_Tray), ENTONCES EL Servicio_Impresión DEBERÁ mostrar un mensaje de error que indique el fallo de impresión y conservar el documento pendiente sin marcarlo como impreso.

### Requerimiento 10: Impresión del reporte de cierre de caja

**Historia de Usuario:** Como cajero, quiero que el reporte de cierre de caja se imprima en la impresora de tickets, para usar la impresora del mostrador donde hago el cierre.

#### Criterios de Aceptación

1. CUANDO el Servicio_Impresión imprime el reporte de cierre de caja mediante `printShiftReportDirect` desde `screens/CashRegisterScreen.tsx` y existe una Impresora_Predeterminada_Ticket, EL Servicio_Impresión DEBERÁ enviar los comandos a la Impresora_Predeterminada_Ticket sin solicitar una elección.
2. SI el Servicio_Impresión imprime el reporte de cierre de caja, no existe una Impresora_Predeterminada_Ticket y la Lista_Impresoras_Registradas contiene al menos una impresora, ENTONCES EL Servicio_Impresión DEBERÁ desplegar la Lista_Impresoras_Registradas, exigir una elección antes de imprimir, guardar la impresora elegida como Impresora_Predeterminada_Ticket e imprimir el reporte en ella, según el patrón del Requerimiento 6.
3. SI la Lista_Impresoras_Registradas está vacía al intentar imprimir el reporte de cierre de caja, ENTONCES EL Servicio_Impresión DEBERÁ indicar al usuario que registre una impresora en Ajustes y no DEBERÁ enviar comandos de impresión.
4. SI el envío de comandos a la impresora falla durante la impresión del reporte de cierre de caja, ENTONCES EL Servicio_Impresión DEBERÁ mostrar una indicación de error que señale que el reporte no se imprimió y DEBERÁ conservar los datos del cierre de caja ya registrado sin alterarlos.

### Requerimiento 11: Coexistencia con el envío de comanda remoto

**Historia de Usuario:** Como negocio con una cocina remota, quiero seguir enviando comandas a un dispositivo de cocina por red y, además, poder imprimirlas localmente, para no perder ninguno de los dos métodos.

#### Criterios de Aceptación

1. CUANDO una venta genera una comanda, EL Servicio_Impresión DEBERÁ ejecutar el Envío_Comanda_Remoto al dispositivo de cocina configurado con el mismo disparo, contenido y destino, independientemente de si existe o no una impresora local seleccionada.
2. CUANDO el usuario imprime una comanda en una impresora local seleccionada, EL Servicio_Impresión DEBERÁ ejecutar esa impresión local sin alterar el disparo, el contenido ni el destino del Envío_Comanda_Remoto de la misma venta.
3. EL Servicio_Impresión DEBERÁ permitir que la impresión local de comanda y el Envío_Comanda_Remoto coexistan como métodos independientes para la misma venta, de modo que la ejecución de uno no sea requisito ni bloquee la ejecución del otro.
4. SI el Envío_Comanda_Remoto falla, ENTONCES EL Servicio_Impresión DEBERÁ permitir y ejecutar la impresión local de comanda, mostrar una indicación de error del envío remoto y conservar la venta sin cambios.
5. SI la impresión local de comanda falla, ENTONCES EL Servicio_Impresión DEBERÁ completar el Envío_Comanda_Remoto, mostrar una indicación de error de la impresión local y conservar la venta sin cambios.

### Requerimiento 12: Estado de conexión con múltiples impresoras

**Historia de Usuario:** Como cajero, quiero ver si cada impresora registrada está conectada, para saber dónde puedo imprimir en este momento.

#### Criterios de Aceptación

1. CUANDO la aplicación consulta el estado de las impresoras, EL Servicio_Impresión DEBERÁ exponer, en un tiempo máximo de 2 segundos, el Estado_Conexión (`connected`, `disconnected` o `unknown`) de cada impresora predeterminada por Rol_Impresión.
2. SI el Servicio_Impresión aún no ha recibido ningún reporte de estado desde QZ_Tray para una impresora predeterminada, ENTONCES EL Servicio_Impresión DEBERÁ exponer su Estado_Conexión como `unknown`.
3. CUANDO QZ_Tray reporta un cambio de estado físico de una impresora vigilada, EL Servicio_Impresión DEBERÁ actualizar el Estado_Conexión correspondiente a esa impresora en un tiempo máximo de 3 segundos desde la recepción del reporte.
4. MIENTRAS una impresora asignada a un Rol_Impresión tiene Estado_Conexión distinto de `connected`, EL Botón_Dividido de ese Rol_Impresión DEBERÁ deshabilitar la acción de impresión hacia esa impresora y mostrar un indicador visual de impresora no disponible.
5. SI el WebSocket con QZ_Tray se cierra, ENTONCES EL Servicio_Impresión DEBERÁ poner el Estado_Conexión en `disconnected` conservando intactas la Lista_Impresoras_Registradas y las impresoras predeterminadas.

### Requerimiento 13: No romper el presence de comandas

**Historia de Usuario:** Como técnico del sistema, quiero que el anuncio de un dispositivo de cocina en presence siga funcionando, para que la asignación de comandas remotas no se rompa con el cambio.

#### Criterios de Aceptación

1. MIENTRAS exista al menos una impresora con Estado_Conexión `connected`, EL Servicio_Impresión DEBERÁ retornar el valor `connected` en `getPrinterStatus()`, para preservar el presence de comandas que depende de esa condición.
2. SI no existe ninguna impresora con Estado_Conexión `connected`, ENTONCES EL Servicio_Impresión DEBERÁ retornar un valor distinto de `connected` en `getPrinterStatus()`, de modo que el presence refleje la ausencia de dispositivo de cocina.
3. CUANDO `hooks/useKitchenPrinter.ts` reconecta al iniciar la aplicación, EL Servicio_Impresión DEBERÁ reconectar la impresora asignada al Rol_Impresión `COMANDA` en un máximo de 10 segundos para anunciar el dispositivo en presence.
4. SI la reconexión de la impresora asignada al Rol_Impresión `COMANDA` falla tras un máximo de 3 intentos consecutivos, ENTONCES EL Servicio_Impresión DEBERÁ exponer el valor de `getPrinterStatus()` como distinto de `connected` y registrar una indicación de error que señale el fallo de reconexión, sin interrumpir el inicio de la aplicación.

### Requerimiento 14: No interferir con la cola de sincronización offline

**Historia de Usuario:** Como usuario del POS, quiero que la gestión de impresoras no afecte la sincronización offline de las ventas, para que la cola de sync siga operando con normalidad.

#### Criterios de Aceptación

1. EL Servicio_Impresión DEBERÁ persistir y leer la Lista_Impresoras_Registradas y las impresoras predeterminadas usando únicamente el Almacenamiento_Local, sin ejecutar operaciones de escritura, lectura, modificación ni eliminación sobre la cola de sincronización offline.
2. CUANDO el usuario registra, elimina o cambia una impresora, EL Servicio_Impresión DEBERÁ completar la operación sin encolar, modificar ni eliminar eventos en la cola de sincronización offline, de modo que el conteo de eventos pendientes en la cola sea idéntico antes y después de la operación.
3. CUANDO finaliza cualquier operación de registro, eliminación o cambio de impresora, EL Servicio_Impresión DEBERÁ dejar la cola de sincronización offline en condición operativa, permitiendo que los eventos pendientes continúen procesándose al restablecerse la conexión.
4. SI falla la escritura en el Almacenamiento_Local durante una operación de impresora, ENTONCES EL Servicio_Impresión DEBERÁ abortar dicha operación sin realizar ninguna escritura en la cola de sincronización offline y DEBERÁ presentar al usuario un mensaje de error que indique que la operación de impresora no se completó, conservando sin cambios el conteo de eventos pendientes en la cola.

### Requerimiento 15: Conectar y registrar impresora desde la pantalla de éxito

**Historia de Usuario:** Como cajero, quiero poder conectar una impresora directamente desde la pantalla de éxito de la venta cuando no hay ninguna registrada, para imprimir el ticket o la comanda sin tener que salir a Ajustes.

#### Criterios de Aceptación

1. SI la Lista_Impresoras_Registradas está vacía cuando el usuario activa la acción principal de un Botón_Dividido en `screens/SuccessScreen.tsx` o en `components/SuccessSidebar.tsx`, ENTONCES EL Botón_Dividido DEBERÁ ofrecer una opción visible de "Conectar impresora" en la misma pantalla, sin redirigir al Panel_Ajustes_Impresoras.
2. CUANDO el usuario activa la opción "Conectar impresora" desde la pantalla de éxito, EL Servicio_Impresión DEBERÁ listar las impresoras que QZ_Tray reporta como instaladas en el equipo en un plazo máximo de 5 segundos.
3. SI QZ_Tray no está disponible o no reporta ninguna impresora al activar "Conectar impresora", ENTONCES EL Servicio_Impresión DEBERÁ mostrar una indicación de que no se detectaron impresoras o de que QZ_Tray no está disponible, sin imprimir ningún documento.
4. CUANDO el usuario elige una impresora desde el flujo de "Conectar impresora" de la pantalla de éxito, EL Servicio_Impresión DEBERÁ registrarla en la Lista_Impresoras_Registradas de la misma forma que si se hubiera agregado desde el Panel_Ajustes_Impresoras, persistiéndola en el Almacenamiento_Local.
5. CUANDO el usuario elige una impresora desde el flujo de "Conectar impresora" disparado por un Botón_Dividido, EL Servicio_Impresión DEBERÁ asignar esa impresora como la predeterminada del Rol_Impresión que originó la acción (`TICKET` o `COMANDA`).
6. CUANDO el Servicio_Impresión registra y asigna la impresora elegida desde la pantalla de éxito, EL Servicio_Impresión DEBERÁ continuar con la impresión del documento pendiente que disparó el flujo, en la impresora recién registrada.
7. SI el usuario cierra o cancela el flujo de "Conectar impresora" sin elegir una impresora, ENTONCES EL Servicio_Impresión DEBERÁ cancelar la impresión pendiente, no registrar ninguna impresora y conservar el documento sin enviarlo.

### Requerimiento 16: Grid "Enviar comanda a" en las pantallas de éxito

**Historia de Usuario:** Como cajero, quiero ver todas las impresoras de comanda disponibles como tarjetas bajo el título "Enviar comanda a", para tocar directamente la que quiero sin abrir menús.

> Nota: este requerimiento reemplaza, para el Rol_Impresión `COMANDA`, al Botón_Dividido. La comanda no usa flecha desplegable; usa el grid descrito aquí. Aplica a `screens/SuccessScreen.tsx` y `components/SuccessSidebar.tsx`.

#### Criterios de Aceptación

1. CUANDO hay al menos un destino de comanda disponible, EL grid DEBERÁ mostrarse bajo el título "Enviar comanda a" en `screens/SuccessScreen.tsx` y en `components/SuccessSidebar.tsx`.
2. EL grid "Enviar comanda a" DEBERÁ incluir como destinos tanto las Impresora_Registrada conectadas localmente como los dispositivos remotos disponibles vía Envío_Comanda_Remoto (presence).
3. EL grid "Enviar comanda a" DEBERÁ disponer los destinos en filas de un máximo de 3 destinos por fila, pasando los destinos adicionales a la siguiente fila.
4. CUANDO el usuario toca una tarjeta de impresora local en el grid, EL Servicio_Impresión DEBERÁ imprimir la comanda en esa impresora mediante `printKitchenCommandDirect` con esa impresora como destino.
5. CUANDO el usuario toca una tarjeta de dispositivo remoto en el grid, EL Servicio_Impresión DEBERÁ enviar la comanda a ese dispositivo mediante el Envío_Comanda_Remoto, sin que el dispositivo emisor elija la impresora física del dispositivo receptor.
6. CUANDO el dispositivo receptor recibe una comanda por Envío_Comanda_Remoto, EL Servicio_Impresión de ese dispositivo DEBERÁ imprimirla en su propia Impresora_Predeterminada_Comanda.
7. CUANDO el usuario toca una tarjeta de impresora local en el grid, EL Servicio_Impresión DEBERÁ guardar esa impresora como la nueva Impresora_Predeterminada_Comanda de forma persistente entre sesiones.
8. MIENTRAS una impresora local del grid tenga Estado_Conexión distinto de `connected`, su tarjeta DEBERÁ reflejar que no está disponible para imprimir.
9. SI no hay ninguna impresora local registrada ni dispositivo remoto disponible, ENTONCES EL grid "Enviar comanda a" DEBERÁ ofrecer una opción de "Conectar impresora" en la misma pantalla (según el Requerimiento 15) en lugar de mostrar destinos.
