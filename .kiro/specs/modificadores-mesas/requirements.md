# Requirements Document

## Introduction

Esta funcionalidad extiende el comportamiento de los **productos-modificadores** (add-ons con precio, ej. "Helado +$2.000" sobre un "Cholao") para que también operen en el **modo Mesa** y en el **modo Delivery/Takeaway en edición**, de forma equivalente a como ya funcionan en **Orden Rápida** (flujo local).

Hoy, en Orden Rápida los add-ons se crean como líneas hijas reales del carrito, vinculadas a su línea padre por `parentOrderItemId`, y el carrito/comanda los agrupa visualmente mientras que ticket/inventario/totales los tratan como ventas normales. En cambio, en modo Mesa (rama `activeTableId`) y en Delivery/Takeaway en edición (rama `editingOrderId`), los `addedModifiers` se ignoran por completo: las funciones `addItemToOrder` / `addItemToOrderById` del hook `useSales.ts` solo persisten `product_id`, `name`, `price`, `quantity`, `notes`, `cooking_term` y `removed_ingredients`, sin vínculo padre-hijo. El objetivo es cerrar esa brecha persistiendo los add-ons como líneas reales de la orden, vinculadas a su padre, con agrupación visual coherente y soporte offline.

El cambio debe ser **seguro para producción** (un solo negocio usa mesas hoy), **compatible con el flujo offline** (Event Sourcing + cola de sincronización), **sin regresión** en Orden Rápida ni en órdenes existentes sin add-ons, y debe minimizar el riesgo de la merge final (`IMPLEMENTAR-MESAS` → `main`).

> Nota para la fase de diseño: la persistencia del vínculo padre-hijo probablemente requiera una columna nueva en `order_items` (p. ej. `parent_order_item_id`). El esquema real de `order_items` **debe verificarse con el MCP de Supabase** (`list_tables`, `list_migrations`) antes de diseñar la migración. NUNCA asumir el estado de la BD desde los archivos locales.

## Glossary

- **Sistema_Ventas**: Lógica de gestión de la orden y el carrito implementada en `App.tsx` (`handleAddToOrder`) y en el hook `useSales.ts` (`addItemToOrder`, `addItemToOrderById`, `removeOrderItem`, `removeOrderItemById`, `updateOrderItemQuantity`, `updateOrderItemQuantityById`).
- **Add_On**: Producto-modificador del catálogo agregado a una línea con un precio (snapshot en `AddedModifier {id, name, price}`). Se materializa como una **línea hija** real de la orden.
- **Linea_Padre**: Línea de la orden a la que pertenece uno o más Add_On. Identificada por su `orderItemId`.
- **Linea_Hija**: Línea de la orden que representa un Add_On; referencia a su Linea_Padre mediante `parentOrderItemId` (en BD: columna `parent_order_item_id`).
- **Modo_Mesa**: Flujo activo cuando existe `activeTableId`; la orden se persiste en `Base_Datos`.
- **Modo_Edicion_Pedido**: Flujo activo cuando existe `editingOrderId` (Delivery/Takeaway en edición); la orden se persiste en `Base_Datos`.
- **Modo_Orden_Rapida**: Flujo local sin `activeTableId` ni `editingOrderId`; la orden vive solo en el estado del carrito hasta el cobro.
- **Carrito**: Vista de la orden en construcción (bloque catálogo móvil en `MenuScreen`, sidebar desktop, y `PaymentScreen`).
- **Comanda**: Documento/vista para cocina (`SuccessScreen`, `SuccessSidebar`).
- **Ticket**: Recibo impreso/PDF construido a partir de `ReceiptItem[]`.
- **Cola_Sincronizacion**: Mecanismo offline (IndexedDB + Event Sourcing) que encola operaciones de venta y las reconcilia al recuperar conexión.
- **Base_Datos**: Tablas de Supabase, en particular `order_items` y `orders`.
- **Agrupacion_Visual**: Presentación en la que las Linea_Hija se muestran como etiquetas (`modifierTags`) y monto extra (`extraAmount`) dentro de su Linea_Padre, en lugar de filas independientes.

## Requirements

### Requerimiento 1: Persistir add-ons en modo Mesa

**Historia de usuario:** Como mesero, quiero que al agregar un producto con add-ons en una mesa los add-ons queden registrados en la orden, para que se cobren y se reflejen igual que en Orden Rápida.

#### Criterios de Aceptación

1. WHEN un producto con uno o más Add_On se agrega en Modo_Mesa, THE Sistema_Ventas SHALL crear una (1) Linea_Padre y exactamente una (1) Linea_Hija en `order_items` por cada Add_On seleccionado.
2. WHEN el Sistema_Ventas crea una Linea_Hija en Modo_Mesa, THE Sistema_Ventas SHALL asignar a esa Linea_Hija el `parent_order_item_id` igual al `orderItemId` de su Linea_Padre.
3. WHEN el Sistema_Ventas crea una Linea_Hija en Modo_Mesa, THE Sistema_Ventas SHALL registrar `product_id`, `product_name` y `unit_price` resueltos del catálogo en vivo en el momento de agregar el Add_On.
4. WHEN el Sistema_Ventas registra el `total_price` de una Linea_Hija en Modo_Mesa, THE Sistema_Ventas SHALL calcularlo como `unit_price` multiplicado por la cantidad de la Linea_Hija.
5. WHEN el Sistema_Ventas crea una Linea_Hija en Modo_Mesa, THE Sistema_Ventas SHALL establecer la cantidad de la Linea_Hija igual a la cantidad de su Linea_Padre.
6. IF un Add_On no puede resolverse en el catálogo en vivo porque no existe o está inactivo, THEN THE Sistema_Ventas SHALL no crear la Linea_Hija correspondiente, no agregar la Linea_Padre ni sus demás Linea_Hija, conservar el carrito en el estado previo a la operación y mostrar al usuario un mensaje de error que indique que el Add_On no está disponible.
7. IF la creación de la Linea_Padre o de cualquier Linea_Hija en la Base_Datos falla, THEN THE Sistema_Ventas SHALL revertir de forma atómica todas las líneas creadas en esa operación, restaurar el carrito al estado previo a la operación y mostrar al usuario un mensaje de error que indique que el producto con add-ons no pudo registrarse.

### Requerimiento 2: Persistir add-ons en modo Delivery/Takeaway en edición

**Historia de usuario:** Como cajero, quiero que al editar un pedido de domicilio o para llevar y agregar un producto con add-ons, los add-ons queden registrados, para que el pedido editado sea consistente con la venta.

#### Criterios de Aceptación

1. WHEN un producto con uno o más Add_On (hasta un máximo de 20 Add_On por Linea_Padre) se agrega en Modo_Edicion_Pedido, THE Sistema_Ventas SHALL crear la Linea_Padre y una Linea_Hija en `order_items` por cada Add_On, vinculada por `parent_order_item_id`.
2. WHEN el Sistema_Ventas crea una Linea_Hija en Modo_Edicion_Pedido, THE Sistema_Ventas SHALL resolver `product_id`, `product_name`, `unit_price` y `total_price` del catálogo en vivo y fijar la cantidad de la Linea_Hija igual a la de su Linea_Padre.
3. IF al menos un Add_On no se puede resolver en el catálogo en vivo (el producto no existe o está inactivo) al agregarse en Modo_Edicion_Pedido, THEN THE Sistema_Ventas SHALL cancelar la operación sin crear la Linea_Padre ni ninguna Linea_Hija y mostrar al usuario un mensaje de error que indique cuál Add_On no está disponible.
4. IF la creación de la Linea_Padre o de cualquier Linea_Hija en Base_Datos falla en Modo_Edicion_Pedido, THEN THE Sistema_Ventas SHALL revertir el carrito al estado previo a la operación de agregado, garantizar que no queden líneas parciales persistidas en `order_items` y mostrar al usuario un mensaje de error que indique que el producto con add-ons no pudo registrarse.

### Requerimiento 3: Agrupación visual de add-ons en el carrito

**Historia de usuario:** Como usuario del POS, quiero ver los add-ons agrupados dentro de su producto en el carrito, para entender la línea como un solo ítem con extras y su precio combinado.

#### Criterios de Aceptación

1. WHILE el Carrito contiene Linea_Hija en Modo_Mesa o Modo_Edicion_Pedido, THE Carrito SHALL ocultar cada Linea_Hija como fila independiente.
2. WHILE el Carrito contiene una Linea_Padre con uno o más Add_On en Modo_Mesa o Modo_Edicion_Pedido, THE Carrito SHALL mostrar el nombre de cada Add_On como una etiqueta (`modifierTags`) dentro de la Linea_Padre, mostrando hasta 20 etiquetas por Linea_Padre y truncando con elipsis cada nombre que supere 30 caracteres.
3. WHILE el Carrito muestra una Linea_Padre con Add_On, THE Carrito SHALL mostrar el precio combinado de la Linea_Padre calculado como el precio base de la Linea_Padre más la suma de los `extraAmount` de todos sus Add_On, presentado en el mismo formato de moneda usado para las demás líneas del Carrito.
4. IF una Linea_Padre no tiene ningún Add_On asociado, THEN THE Carrito SHALL mostrar únicamente su precio base sin sumar ningún `extraAmount` y sin renderizar etiquetas `modifierTags`.
5. THE Carrito SHALL aplicar la misma Agrupacion_Visual (ocultamiento de Linea_Hija, etiquetas `modifierTags` y precio combinado) de forma idéntica en las tres vistas de render: bloque catálogo móvil, sidebar desktop y `PaymentScreen`.

### Requerimiento 4: Agrupación de add-ons en la comanda y líneas reales en el ticket

**Historia de usuario:** Como cocinero, quiero ver los add-ons como etiquetas del producto en la comanda, y como cajero quiero que el ticket muestre cada add-on como línea cobrada, para que cocina y caja vean la información correcta.

#### Criterios de Aceptación

1. WHEN la Comanda se construye en Modo_Mesa o Modo_Edicion_Pedido, THE Comanda SHALL omitir cada Linea_Hija como fila independiente y anexar el nombre de cada Linea_Hija como etiqueta de su Linea_Padre, mostrando las etiquetas en el mismo orden en que las Linea_Hija fueron agregadas a la Linea_Padre.
2. WHEN el Ticket se construye en Modo_Mesa o Modo_Edicion_Pedido, THE Ticket SHALL imprimir cada Linea_Hija como una línea independiente que muestre el nombre de la Linea_Hija, su cantidad y su `total_price`.
3. WHEN el total de la orden se calcula en Modo_Mesa o Modo_Edicion_Pedido, THE Sistema_Ventas SHALL sumar el `total_price` de cada Linea_Hija al subtotal y al total de la orden.
4. IF una Linea_Padre no tiene ninguna Linea_Hija asociada al construir la Comanda en Modo_Mesa o Modo_Edicion_Pedido, THEN THE Comanda SHALL mostrar la Linea_Padre sin etiquetas de add-on.
5. IF el `total_price` de una Linea_Hija es nulo o no representa un valor numérico al calcular el total de la orden, THEN THE Sistema_Ventas SHALL tratar ese `total_price` como 0 en la suma y mostrar una indicación de error que identifique la Linea_Hija afectada, conservando el resto de las líneas de la orden sin cambios.

### Requerimiento 5: Descuento de inventario por add-ons

**Historia de usuario:** Como administrador, quiero que los add-ons descuenten inventario como cualquier venta, para mantener el stock exacto.

#### Criterios de Aceptación

1. WHEN una venta que contiene una o más Linea_Hija se completa en Modo_Mesa o Modo_Edicion_Pedido, THE Sistema_Ventas SHALL descontar el inventario de cada Linea_Hija por la misma ruta de descuento que una venta normal de ese producto, usando una cantidad igual a la cantidad de la Linea_Hija multiplicada por la cantidad de su línea padre.
2. IF una Linea_Hija corresponde a un add-on que no tiene seguimiento de inventario habilitado, THEN THE Sistema_Ventas SHALL completar la venta sin descontar inventario para esa Linea_Hija y descontar normalmente las demás líneas con seguimiento de inventario.
3. WHILE el dispositivo está en modo offline, WHEN una venta con Linea_Hija se completa en Modo_Mesa o Modo_Edicion_Pedido, THE Sistema_Ventas SHALL encolar el descuento de inventario de cada Linea_Hija en la Cola_Sincronizacion para aplicarlo al recuperar conexión, produciendo el mismo resultado de stock que una venta realizada en línea.
4. WHEN un pedido con Linea_Hija previamente confirmado se cancela o se reduce en cantidad en Modo_Edicion_Pedido, THE Sistema_Ventas SHALL reponer al inventario la cantidad correspondiente de cada Linea_Hija eliminada o reducida por la misma ruta inversa que una devolución normal.

### Requerimiento 6: Edición de la línea padre y recálculo de add-ons

**Historia de usuario:** Como usuario del POS, quiero que al reeditar un producto padre se actualicen sus add-ons, para que la orden refleje los cambios sin duplicar ni dejar líneas huérfanas.

#### Criterios de Aceptación

1. WHEN una Linea_Padre con Add_On se reedita en Modo_Mesa o Modo_Edicion_Pedido agregando uno o más Add_On a su selección, THE Sistema_Ventas SHALL crear exactamente una Linea_Hija por cada Add_On nuevo seleccionado, sin duplicar las Linea_Hija ya existentes para los Add_On que se mantienen.
2. WHEN una Linea_Padre con Add_On se reedita en Modo_Mesa o Modo_Edicion_Pedido eliminando uno o más Add_On de su selección, THE Sistema_Ventas SHALL eliminar las Linea_Hija correspondientes a cada Add_On retirado, de modo que no queden Linea_Hija huérfanas asociadas a esa Linea_Padre.
3. WHEN la cantidad de una Linea_Padre cambia en Modo_Mesa o Modo_Edicion_Pedido, THE Sistema_Ventas SHALL fijar la cantidad de cada Linea_Hija asociada al mismo valor que la nueva cantidad de la Linea_Padre.
4. IF la reedición de una Linea_Padre no modifica el conjunto de Add_On ni la cantidad, THEN THE Sistema_Ventas SHALL conservar las Linea_Hija existentes sin crear ni eliminar líneas.
5. IF la reconstrucción de las Linea_Hija de una Linea_Padre reeditada no puede completarse, THEN THE Sistema_Ventas SHALL conservar el conjunto de Linea_Hija previo a la reedición y mostrar un mensaje de error que indique que los Add_On no pudieron actualizarse.

### Requerimiento 7: Eliminación en cascada de add-ons

**Historia de usuario:** Como usuario del POS, quiero que al eliminar un producto padre se eliminen sus add-ons, para no dejar cobros ni líneas sueltas en la orden.

#### Criterios de Aceptación

1. WHEN una Linea_Padre con Add_On se elimina en Modo_Mesa o Modo_Edicion_Pedido, THE Sistema_Ventas SHALL eliminar de `order_items`, en una única operación atómica, todas las Linea_Hija cuyo `parent_order_item_id` sea el `orderItemId` de esa Linea_Padre.
2. IF la cantidad de una Linea_Padre con Add_On se reduce a cero o a un valor menor que cero en Modo_Mesa o Modo_Edicion_Pedido, THEN THE Sistema_Ventas SHALL eliminar la Linea_Padre junto con todas sus Linea_Hija en una única operación atómica.
3. IF la eliminación en cascada de una Linea_Padre y sus Linea_Hija no puede completarse en su totalidad, THEN THE Sistema_Ventas SHALL conservar la orden en el estado previo a la operación, sin eliminar ninguna de las líneas involucradas, y mostrar un mensaje de error indicando que la eliminación no se completó.
4. WHEN se completa la eliminación en cascada de una Linea_Padre y sus Linea_Hija, THE Sistema_Ventas SHALL recalcular el total de la orden excluyendo los importes de la Linea_Padre y de todas las Linea_Hija eliminadas.
5. WHEN una Linea_Padre con Add_On sin ninguna Linea_Hija asociada se elimina en Modo_Mesa o Modo_Edicion_Pedido, THE Sistema_Ventas SHALL eliminar únicamente la Linea_Padre y completar la operación sin error.

### Requerimiento 8: Soporte offline de los add-ons

**Historia de usuario:** Como usuario del POS sin conexión estable, quiero que los add-ons en mesas y pedidos en edición se registren offline y se sincronicen al recuperar conexión, para no perder información de la venta.

#### Criterios de Aceptación

1. WHILE el dispositivo está sin conexión, THE Sistema_Ventas SHALL encolar de forma persistente en la Cola_Sincronizacion (IndexedDB) las operaciones de creación de Linea_Padre y Linea_Hija con su vínculo `parent_order_item_id`, conservando las operaciones encoladas tras cierres o recargas de la aplicación hasta que su sincronización sea confirmada.
2. WHEN la conexión se restablece, THE Sistema_Ventas SHALL sincronizar las operaciones encoladas procesando cada Linea_Padre antes que sus Linea_Hija asociadas, y conservando en cada Linea_Hija el vínculo a su Linea_Padre.
3. IF una Linea_Padre encolada offline aún no posee identificador definitivo de Base_Datos, THEN THE Sistema_Ventas SHALL resolver el `parent_order_item_id` de sus Linea_Hija con el identificador definitivo asignado a la Linea_Padre durante la sincronización antes de enviar dichas Linea_Hija.
4. IF la sincronización de una operación encolada falla, THEN THE Sistema_Ventas SHALL reintentar la operación hasta un máximo de 5 intentos, mantener la operación en la Cola_Sincronizacion sin perder sus datos mientras existan reintentos pendientes, y mostrar una indicación de error al usuario cuando se agoten los 5 intentos.
5. WHEN una operación encolada se sincroniza correctamente, THE Sistema_Ventas SHALL eliminarla de la Cola_Sincronizacion y evitar reenviarla, de modo que cada Linea_Padre y Linea_Hija se registre una sola vez en la Base_Datos.
6. WHILE el dispositivo está sin conexión, THE Sistema_Ventas SHALL admitir como máximo 1000 operaciones pendientes en la Cola_Sincronizacion; IF se alcanza ese límite, THEN THE Sistema_Ventas SHALL rechazar nuevas operaciones de creación de Linea_Padre o Linea_Hija mostrando una indicación de error al usuario, conservando intactas las operaciones ya encoladas.

### Requerimiento 9: Compatibilidad sin regresión

**Historia de usuario:** Como dueño del negocio, quiero que esta funcionalidad no rompa lo que ya funciona, para seguir vendiendo con seguridad en producción.

#### Criterios de Aceptación

1. WHEN un producto sin Add_On se agrega en Modo_Mesa o Modo_Edicion_Pedido, THE Sistema_Ventas SHALL agregarlo como línea normal de la orden sin crear ninguna Linea_Hija, conservando el mismo precio unitario, cantidad y subtotal que tendría el producto sin esta funcionalidad.
2. WHEN un producto con Add_On se agrega en Modo_Orden_Rapida, THE Sistema_Ventas SHALL crear sus líneas hijas locales con el mismo precio unitario, cantidad y agrupación que antes de esta funcionalidad, sin requerir ni persistir el campo `parent_order_item_id`.
3. WHEN una orden existente sin Linea_Hija se carga o edita, THE Sistema_Ventas SHALL procesarla y calcular su total sin requerir el campo `parent_order_item_id`, mostrando las mismas líneas y montos que la orden contenía antes de esta funcionalidad.
4. WHERE la columna `parent_order_item_id` no esté presente o tenga valor nulo en una línea, THE Sistema_Ventas SHALL tratar esa línea como una línea normal de la orden, incluyéndola en el cálculo del total.
5. IF una Linea_Hija referencia un valor de `parent_order_item_id` que no existe entre las líneas de la orden cargada, THEN THE Sistema_Ventas SHALL tratar esa línea como una línea normal, completar la carga de la orden sin bloquearla y mostrar un aviso indicando que la relación padre-hija no pudo resolverse.
