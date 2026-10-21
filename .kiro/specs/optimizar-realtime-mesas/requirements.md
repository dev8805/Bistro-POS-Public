# Requirements Document

## Introduction

Esta funcionalidad es una **optimización del consumo de Supabase Realtime** en el módulo de mesas de Bistro POS. Supabase factura el plan Realtime contando **1 mensaje por cada cambio en la base de datos multiplicado por cada dispositivo suscrito**. Hoy el módulo de mesas mantiene una suscripción a **todos** los `order_items` del negocio (sin filtro) para calcular en vivo el total de cada mesa, lo cual genera un mensaje por cada producto agregado o quitado en cualquier mesa, enviado a cada dispositivo conectado. Ese es el costo más alto del sistema.

Tras un análisis previo, el usuario eligió la **"Opción B"**: conservar la coordinación de estado entre dispositivos (que es barata) y eliminar la suscripción cara a `order_items`. Como consecuencia aceptada, las píldoras de mesas dejan de mostrar el monto/total y solo indican si la mesa está ocupada o libre. Cuando un dispositivo abre una mesa ya ocupada, se hace una carga puntual (fetch) de la orden con un estado de carga visual hasta que aparezcan los productos.

El objetivo de negocio es **reducir el consumo de mensajes de Supabase Realtime sin romper el flujo de ventas en mesa ni la coordinación multi-dispositivo del estado ocupada/libre/reservada**.

## Glossary

- **Sistema_Mesas**: Conjunto de hooks y componentes del módulo de mesas de Bistro POS (`useTables`, `useOpenTickets`, `OpenTicketsBar`) que coordinan el estado de las mesas entre dispositivos.
- **Hook_Estado_Mesas**: El hook `hooks/useTables.ts`, responsable de cargar y mantener en tiempo real el estado de cada mesa.
- **Hook_Tickets_Abiertos**: El hook `hooks/useOpenTickets.ts`, responsable hoy de calcular el resumen (cantidad de ítems y total) de las mesas con orden activa.
- **Barra_Pildoras**: El componente `components/OpenTicketsBar.tsx`, que muestra las mesas como píldoras (chips) en tablet/móvil.
- **Pildora_Mesa**: Cada chip o píldora individual dentro de la Barra_Pildoras que representa una mesa.
- **Estado_Mesa**: Condición de una mesa, con valores `available` (libre), `occupied` (ocupada) o `reserved` (reservada).
- **Orden_Activa**: La orden (`orders`) actualmente vinculada a una mesa mediante `current_order_id`.
- **Suscripcion_Order_Items_Global**: La suscripción realtime actual del Hook_Tickets_Abiertos al canal de la tabla `order_items` sin filtro, que recibe todos los cambios de ítems de todas las mesas.
- **Suscripcion_Estado**: La suscripción realtime del Hook_Estado_Mesas a la tabla `tables` filtrada por `business_id`, que mantiene sincronizado el Estado_Mesa entre dispositivos.
- **Canal_Detalle_Mesa**: La suscripción realtime existente en `App.tsx` (canal `order-items-{mesa}`) filtrada por `order_id`, que mantiene en vivo el detalle del carrito de la mesa abierta actualmente.
- **Fetch_Orden_Mesa**: Consulta puntual a la base de datos que trae la Orden_Activa y sus productos al abrir una mesa ocupada.
- **Estado_Carga**: Indicador visual de carga (loading) que se muestra mientras se ejecuta el Fetch_Orden_Mesa.
- **Dispositivo**: Cada cliente (tablet, móvil o desktop) conectado al negocio con una sesión activa del POS.

## Requirements

### Requisito 1: Conservar la sincronización en vivo del estado de las mesas

**Historia de Usuario:** Como mesero que trabaja con varios dispositivos, quiero que el estado ocupada/libre/reservada de cada mesa se mantenga sincronizado en vivo entre todos los dispositivos, para coordinar el servicio sin pisar el trabajo de otro compañero.

#### Criterios de Aceptación

1. THE Hook_Estado_Mesas SHALL mantener una Suscripcion_Estado en tiempo real a la tabla `tables` filtrada por `business_id`, recibiendo únicamente los cambios de Estado_Mesa correspondientes a ese `business_id`.
2. WHEN un Dispositivo cambia el Estado_Mesa de una mesa a `occupied`, THE Sistema_Mesas SHALL reflejar el nuevo Estado_Mesa en los demás Dispositivos suscritos en un máximo de 2 segundos sin requerir recarga manual.
3. WHEN un Dispositivo cambia el Estado_Mesa de una mesa a `available`, THE Sistema_Mesas SHALL reflejar el nuevo Estado_Mesa en los demás Dispositivos suscritos en un máximo de 2 segundos sin requerir recarga manual.
4. WHEN un Dispositivo cambia el Estado_Mesa de una mesa a `reserved`, THE Sistema_Mesas SHALL reflejar el nuevo Estado_Mesa en los demás Dispositivos suscritos en un máximo de 2 segundos sin requerir recarga manual.
5. WHEN una mesa cambia de Estado_Mesa a `available`, `occupied` o `reserved`, THE Barra_Pildoras SHALL actualizar el indicador visual de estado de la Pildora_Mesa correspondiente para reflejar el nuevo Estado_Mesa.
6. IF la Suscripcion_Estado se interrumpe por pérdida de conexión, THEN THE Hook_Estado_Mesas SHALL restablecer la Suscripcion_Estado al recuperar la conexión y resincronizar el Estado_Mesa de todas las mesas del `business_id` sin requerir recarga manual.

### Requisito 2: Eliminar la suscripción global a order_items

**Historia de Usuario:** Como dueño del negocio, quiero eliminar la suscripción realtime que escucha todos los cambios de productos en todas las mesas, para reducir el consumo facturable de mensajes de Supabase Realtime.

#### Criterios de Aceptación

1. WHEN el Hook_Tickets_Abiertos se inicializa, THE Hook_Tickets_Abiertos SHALL operar con cero suscripciones realtime activas a la tabla `order_items`, sin instanciar la Suscripcion_Order_Items_Global.
2. WHEN un Dispositivo agrega o quita un producto en una mesa, THE Sistema_Mesas SHALL emitir cero mensajes de Realtime hacia los demás Dispositivos por concepto de cambios en `order_items` de mesas no abiertas.
3. THE Barra_Pildoras SHALL determinar el Estado_Mesa de cada Pildora_Mesa a partir de la Suscripcion_Estado, sin depender de la Suscripcion_Order_Items_Global.

### Requisito 3: Píldoras de mesa con solo estado (sin monto)

**Historia de Usuario:** Como mesero, quiero que cada píldora de mesa muestre claramente si la mesa está ocupada o libre, para identificar de un vistazo el estado del salón sin depender del monto.

#### Criterios de Aceptación

1. WHEN se renderiza una Pildora_Mesa, THE Barra_Pildoras SHALL mostrar la etiqueta de la mesa con texto no vacío.
2. WHEN se renderiza una Pildora_Mesa, THE Barra_Pildoras SHALL mostrar un indicador visual del Estado_Mesa distinguible entre los distintos estados.
3. THE Barra_Pildoras SHALL omitir el monto o total de la mesa en cada Pildora_Mesa.
4. WHILE una mesa tiene Estado_Mesa `occupied`, THE Pildora_Mesa SHALL mostrar un indicador visual distinto al de los demás estados que represente la condición de ocupada.
5. WHILE una mesa tiene Estado_Mesa `available`, THE Pildora_Mesa SHALL mostrar un indicador visual distinto al de los demás estados que represente la condición de libre.
6. WHILE una mesa tiene Estado_Mesa `reserved`, THE Pildora_Mesa SHALL mostrar un indicador visual distinto al de los demás estados que represente la condición de reservada.
7. IF el Estado_Mesa de una mesa es nulo o desconocido, THEN THE Pildora_Mesa SHALL mostrar un indicador indeterminado y continuar omitiendo el monto.

### Requisito 4: Carga puntual de la orden al abrir una mesa ocupada

**Historia de Usuario:** Como mesero, quiero que al abrir una mesa que ya está ocupada se traiga su orden actual con sus productos, para continuar la venta aunque la orden se haya creado en otro dispositivo.

#### Criterios de Aceptación

1. WHEN un Dispositivo abre una mesa con Estado_Mesa `occupied` que tiene una Orden_Activa no cargada previamente en ese Dispositivo, THE Sistema_Mesas SHALL ejecutar un Fetch_Orden_Mesa para traer la Orden_Activa y sus productos, con un tiempo límite de 10 segundos.
2. WHILE el Fetch_Orden_Mesa está en curso, THE Sistema_Mesas SHALL mostrar un Estado_Carga visible que bloquee la edición de la orden hasta que el Fetch_Orden_Mesa finalice.
3. WHEN el Fetch_Orden_Mesa finaliza con éxito y la Orden_Activa contiene al menos un producto, THE Sistema_Mesas SHALL mostrar la Orden_Activa con todos sus productos y ocultar el Estado_Carga.
4. WHEN el Fetch_Orden_Mesa finaliza con éxito y la Orden_Activa no contiene productos, THE Sistema_Mesas SHALL mostrar la Orden_Activa vacía con una indicación de que no tiene productos y ocultar el Estado_Carga.
5. IF el Fetch_Orden_Mesa falla por error de respuesta, agotamiento del tiempo límite de 10 segundos o pérdida de conexión, THEN THE Sistema_Mesas SHALL ocultar el Estado_Carga, mostrar un mensaje de error indicando que no se pudo cargar la orden, ofrecer una opción de reintento y conservar el Estado_Mesa `occupied` sin modificar la Orden_Activa.
6. IF un Dispositivo abre una mesa con Estado_Mesa `occupied` que no tiene una Orden_Activa asociada (estado fantasma), THEN THE Sistema_Mesas SHALL omitir el Fetch_Orden_Mesa y mostrar un mensaje indicando que la mesa no tiene una orden válida.
7. WHEN un Dispositivo abre una mesa cuya Orden_Activa ya fue cargada previamente en ese mismo Dispositivo, THE Sistema_Mesas SHALL mostrar la Orden_Activa ya cargada sin ejecutar un nuevo Fetch_Orden_Mesa.

### Requisito 5: Conservar el detalle en vivo de la mesa abierta

**Historia de Usuario:** Como mesero que tiene una mesa abierta, quiero ver en vivo los cambios del carrito de esa mesa, para coordinar con otro dispositivo que esté tomando la misma orden.

#### Criterios de Aceptación

1. WHILE un Dispositivo tiene una mesa abierta, THE Sistema_Mesas SHALL mantener una única suscripción activa al Canal_Detalle_Mesa (`order-items-{mesa}`) filtrada por el `order_id` de esa Orden_Activa.
2. WHILE un Dispositivo tiene una mesa abierta, WHEN se agrega o quita un producto de esa Orden_Activa, THE Sistema_Mesas SHALL actualizar la lista de productos, las cantidades y el total mostrado del carrito de esa mesa en un máximo de 3 segundos.
3. WHEN un Dispositivo cierra o abandona la mesa abierta, THE Sistema_Mesas SHALL cancelar la suscripción al Canal_Detalle_Mesa correspondiente.
4. IF el Canal_Detalle_Mesa se interrumpe por pérdida de conexión, THEN THE Sistema_Mesas SHALL reintentar restablecer la suscripción de forma acotada, mostrar un indicador de reconexión y conservar el último detalle del carrito mostrado hasta recuperar la conexión.

### Requisito 6: No-regresión del flujo de ventas en mesa

**Historia de Usuario:** Como dueño del negocio, quiero que la optimización no rompa el flujo de ventas en mesa ni la coordinación de estado entre dispositivos, para no perder funcionalidad esencial al reducir el consumo de Realtime.

#### Criterios de Aceptación

1. WHEN un Dispositivo realiza una transición de Estado_Mesa (de `available` a `occupied`, de `occupied` a `available`, o de `available` a `reserved`), THE Sistema_Mesas SHALL completar la transición y reflejarla localmente en un máximo de 3 segundos.
2. WHEN una mesa cambia de Estado_Mesa, THE Sistema_Mesas SHALL propagar el nuevo Estado_Mesa a los demás Dispositivos en un máximo de 5 segundos.
3. WHERE una mesa tiene una Orden_Activa creada desde otro Dispositivo, WHEN un Dispositivo la abre, THE Sistema_Mesas SHALL recuperar la Orden_Activa y permitir continuar la venta en un máximo de 3 segundos tras finalizar el Fetch_Orden_Mesa.
4. IF el Fetch_Orden_Mesa falla al abrir una mesa con Orden_Activa, THEN THE Sistema_Mesas SHALL mostrar un mensaje de error, conservar el Estado_Mesa `occupied` y ofrecer una opción de reintento sin perder la Orden_Activa.
5. WHILE un Dispositivo tiene una mesa abierta, THE Sistema_Mesas SHALL actualizar el detalle en vivo (productos, cantidades y total) de esa mesa en un máximo de 5 segundos ante cambios en su Orden_Activa.
