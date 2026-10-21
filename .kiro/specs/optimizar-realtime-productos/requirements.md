# Requirements Document

## Introduction

Esta funcionalidad **optimiza el consumo de Supabase Realtime de la tabla `products`** en Bistro POS. Supabase factura los mensajes de Realtime como **1 mensaje por cada cambio en la base de datos × cada dispositivo suscrito**.

Hoy existen **dos** suscripciones realtime a `products` que corren en paralelo en el mismo dispositivo durante la venta normal:
- `App.tsx`, canal `products-sync` (mantiene el catálogo del POS).
- `hooks/useProducts.ts`, canal `public:products` (lo usan `MenuScreen`, `ProductsScreen`, promociones, compras, mermas, etc.).

Como `MenuScreen` (el POS) llama a `useProducts()`, ambas suscripciones están activas a la vez: cada cambio de producto (ej. bajar stock en una venta) genera el **doble** de mensajes por dispositivo. Además, varios componentes que usan `useProducts` pueden abrir el canal `public:products` repetidas veces.

Se aplica la **"Opción A"**: dejar **una sola** suscripción realtime a `products` (la de `App.tsx`) como fuente única, y que `useProducts` se actualice mediante un evento interno (relay) en vez de su propia suscripción.

Adicionalmente, se **gatea la suscripción por permisos**: un dispositivo cuyo usuario **no tiene acceso a productos** (ni venta ni inventario) **no debe suscribirse** a `products`, para no contar como dispositivo receptor y reducir el multiplicador de mensajes.

El objetivo de negocio es **reducir el consumo de mensajes de Realtime de `products` sin perder la sincronización de stock/precios entre dispositivos** de los usuarios que sí trabajan con productos.

## Glossary

- **Sistema_Productos**: Conjunto de código que gestiona los datos de productos en el cliente (`App.tsx` con su estado `products` y su canal `products-sync`, y el hook `hooks/useProducts.ts`).
- **Suscripcion_Productos_App**: La suscripción realtime de `App.tsx` (canal `products-sync`) a las tablas `products` y `categories`, filtrada por `business_id`.
- **Suscripcion_Productos_Hook**: La suscripción realtime actual de `hooks/useProducts.ts` (canal `public:products`) a la tabla `products`. Esta funcionalidad la elimina.
- **Hook_Productos**: El hook `hooks/useProducts.ts`, usado por pantallas de venta y de gestión (catálogo, productos, promociones, compras, mermas).
- **Evento_Relay**: Evento de ventana (`products-realtime-changed`) que emite `App.tsx` al recibir un cambio realtime de `products`, para que el Hook_Productos y otros consumidores se actualicen sin su propia suscripción.
- **Acceso_Productos**: Condición de permisos que indica que el usuario necesita datos de productos. Es verdadera si el usuario es `isSuperAdmin` o tiene alguno de los permisos `pos_view`, `inv_view` o `inv_create`.
- **Dispositivo**: Cada cliente (tablet, móvil o desktop) conectado al negocio con una sesión activa.

## Requirements

### Requisito 1: Suscripción única a `products`

**Historia de Usuario:** Como dueño del negocio, quiero que exista una sola suscripción realtime a la tabla de productos por dispositivo, para no pagar el doble de mensajes por cada cambio de producto.

#### Criterios de Aceptación

1. THE Sistema_Productos SHALL mantener a lo sumo una Suscripcion_Productos_App activa a la tabla `products` por Dispositivo.
2. WHEN el Hook_Productos se monta, THE Hook_Productos SHALL operar con cero suscripciones realtime propias a `products`, sin instanciar la Suscripcion_Productos_Hook.
3. WHERE varios componentes usan el Hook_Productos simultáneamente, THE Sistema_Productos SHALL no crear suscripciones realtime adicionales a `products` por cada uno.

### Requisito 2: Relay de cambios a los consumidores de productos

**Historia de Usuario:** Como cajero o administrador, quiero que las pantallas que muestran productos sigan actualizándose ante cambios de otros dispositivos, aunque ya no tengan su propia suscripción, para no perder la sincronización.

#### Criterios de Aceptación

1. WHEN la Suscripcion_Productos_App recibe un cambio (INSERT, UPDATE o DELETE) en `products`, THE Sistema_Productos SHALL emitir un Evento_Relay que represente ese cambio.
2. WHEN el Hook_Productos recibe un Evento_Relay, THE Hook_Productos SHALL refrescar sus datos de productos.
3. WHEN llegan múltiples Evento_Relay en una ráfaga corta, THE Hook_Productos SHALL agrupar (debounce) los refrescos para no recargar de forma repetida.

### Requisito 3: Suscripción gateada por permisos

**Historia de Usuario:** Como dueño del negocio, quiero que un dispositivo cuyo usuario no trabaja con productos no se suscriba al realtime de productos, para que no cuente como receptor y no genere mensajes innecesarios.

#### Criterios de Aceptación

1. WHERE el usuario del Dispositivo no cumple Acceso_Productos, THE Sistema_Productos SHALL no instanciar la Suscripcion_Productos_App.
2. WHERE el usuario del Dispositivo cumple Acceso_Productos, THE Sistema_Productos SHALL instanciar la Suscripcion_Productos_App.
3. THE Sistema_Productos SHALL evaluar Acceso_Productos como verdadera cuando el usuario sea `isSuperAdmin` o tenga alguno de los permisos `pos_view`, `inv_view` o `inv_create`.
4. WHEN los permisos del usuario cambian en tiempo real, THE Sistema_Productos SHALL re-evaluar Acceso_Productos y suscribir o cancelar la Suscripcion_Productos_App según corresponda.

### Requisito 4: Conservar la sincronización entre dispositivos

**Historia de Usuario:** Como cajero, quiero que el stock y los precios sigan sincronizados en vivo entre dispositivos que sí trabajan con productos, para no vender algo agotado ni con precio desactualizado.

#### Criterios de Aceptación

1. WHILE el usuario del Dispositivo cumple Acceso_Productos, WHEN otro Dispositivo modifica el stock o el precio de un producto, THE Sistema_Productos SHALL reflejar el cambio en el catálogo del POS de este Dispositivo.
2. WHILE el usuario del Dispositivo cumple Acceso_Productos, WHEN otro Dispositivo crea o elimina un producto, THE Sistema_Productos SHALL reflejar el alta o baja en el catálogo del POS de este Dispositivo.
3. WHILE una pantalla de gestión que usa el Hook_Productos está montada, WHEN otro Dispositivo cambia un producto, THE Sistema_Productos SHALL reflejar el cambio en esa pantalla mediante el Evento_Relay.
4. THE Sistema_Productos SHALL conservar la actualización optimista local existente (la que evita reflejar el propio cambio dos veces).

### Requisito 5: No-regresión de categorías y eventos locales

**Historia de Usuario:** Como dueño del negocio, quiero que la optimización no rompa la sincronización de categorías ni las actualizaciones locales ya existentes, para no perder funcionalidad.

#### Criterios de Aceptación

1. THE Sistema_Productos SHALL conservar la sincronización realtime de la tabla `categories` en la Suscripcion_Productos_App.
2. THE Sistema_Productos SHALL conservar las actualizaciones locales de stock disparadas por eventos internos existentes (venta finalizada, compra de inventario, merma, favorito).
3. THE Sistema_Productos SHALL conservar el comportamiento offline existente del catálogo de productos.

### Requisito 6: Reducción del consumo de mensajes

**Historia de Usuario:** Como dueño del negocio, quiero que cada cambio de producto genere un solo mensaje por dispositivo (en vez de dos), para reducir el consumo de Realtime.

#### Criterios de Aceptación

1. WHEN un Dispositivo con Acceso_Productos está en el POS y ocurre un cambio en `products`, THE Sistema_Productos SHALL recibir ese cambio mediante una sola suscripción (la Suscripcion_Productos_App), no dos.
2. WHEN un Dispositivo sin Acceso_Productos está conectado y ocurre un cambio en `products`, THE Sistema_Productos SHALL no recibir mensajes de Realtime de `products` en ese Dispositivo.
