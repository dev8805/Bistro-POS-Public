# Requirements Document

## Introduction

Esta funcionalidad **elimina el refetch completo de productos en cada cambio** (especialmente en cada venta), que es el mayor egress de PostgREST que queda tras optimizar las órdenes.

Hoy, cuando cambia el stock/precio de un producto (p. ej. una venta descuenta stock), el canal `products-sync` de `App.tsx` emite el relay `products-realtime-changed`, y `hooks/useProducts.ts` responde **re-descargando TODO el catálogo** (`fetchProducts`, ~32–93 KB) y recalculando recetas/producible. Esto ocurre:
- En **cada dispositivo** con `useProducts` montado, incluido el **POS** (donde su array de productos ni se muestra — el grid usa los productos de App).
- Incluso en el **propio dispositivo** que originó el cambio (el relay se despacha antes del guard `isLocalStockUpdateRef`).

App ya resuelve el mismo cambio con una **actualización puntual optimista** (actualiza solo el producto afectado, sin descargar nada). El objetivo es que `useProducts` haga lo mismo, conservando la sincronización de las pantallas de administración.

> Nota: `useProducts` debe seguir montado (p. ej. `MenuScreen` lo usa para las **categorías**); el cambio es **cómo reacciona** al relay, no si se monta.

## Glossary

- **Hook_Productos**: El hook `hooks/useProducts.ts`, fuente de productos para pantallas de venta (categorías) y de administración.
- **Relay_Productos**: El evento de ventana `products-realtime-changed` que emite `App.tsx` al recibir un cambio realtime en `products` (incluye `detail: { eventType, new, old }`).
- **Refetch_Completo**: Re-descargar todos los productos vía `fetchProducts()` (consulta a `products` con embeds).
- **Actualizacion_Puntual**: Actualizar en memoria solo el producto que cambió, a partir del registro `new` del Relay_Productos, sin descargar el catálogo.
- **Guard_Local**: La bandera `isLocalStockUpdateRef` en `App.tsx`, verdadera mientras este dispositivo procesa su propia venta.
- **Producible**: Cantidad preparable de un producto `processed` calculada a partir del stock de sus insumos.

## Requirements

### Requisito 1: Actualización puntual en cambios de producto (sin refetch completo)

**Historia de Usuario:** Como dueño del negocio, quiero que un cambio de stock/precio no provoque la re-descarga de todo el catálogo, para reducir el egress en cada venta.

#### Criterios de Aceptación

1. WHEN el Hook_Productos recibe un Relay_Productos con `eventType = UPDATE`, THE Hook_Productos SHALL aplicar una Actualizacion_Puntual del producto afectado usando el registro `new`, sin ejecutar un Refetch_Completo.
2. WHEN el Hook_Productos recibe un Relay_Productos con `eventType = INSERT` o `DELETE`, THE Hook_Productos SHALL ejecutar un Refetch_Completo (alta/baja de producto, poco frecuente).
3. THE Actualizacion_Puntual SHALL actualizar al menos los campos visibles que cambian (stock, precio, nombre, imagen, favorito) del producto afectado.

### Requisito 2: No refrescar por el cambio propio del dispositivo

**Historia de Usuario:** Como cajero, quiero que el dispositivo que hizo la venta no se refresque a sí mismo de más, para no gastar recursos en un cambio que ya conoce.

#### Criterios de Aceptación

1. WHILE el Guard_Local está activo (el dispositivo procesa su propia venta), THE Sistema SHALL no provocar en ese mismo dispositivo un Refetch_Completo del Hook_Productos por ese cambio.
2. THE Sistema SHALL seguir propagando los cambios a los **demás** dispositivos vía Relay_Productos.

### Requisito 3: Conservar la sincronización en pantallas de administración

**Historia de Usuario:** Como administrador, quiero que las pantallas que usan productos (Productos, Inventario, Promociones) sigan reflejando los cambios hechos en otros dispositivos, para no ver datos desactualizados.

#### Criterios de Aceptación

1. WHILE una pantalla que usa el Hook_Productos está montada, WHEN otro dispositivo cambia el stock o precio de un producto, THE Hook_Productos SHALL reflejar el cambio (vía Actualizacion_Puntual) sin requerir recarga manual.
2. WHEN otro dispositivo crea o elimina un producto, THE Hook_Productos SHALL reflejar el alta/baja mediante el Refetch_Completo de INSERT/DELETE.

### Requisito 4: Conservar recetas y producible

**Historia de Usuario:** Como administrador, quiero que el "producible" y las recetas sigan siendo correctos tras un cambio de stock, para no tomar decisiones con datos errados.

#### Criterios de Aceptación

1. WHEN una Actualizacion_Puntual cambia el stock de un producto que es insumo de productos `processed`, THE Hook_Productos SHALL recalcular el Producible de los productos `processed` afectados, o recargarlo en la próxima carga completa.
2. THE Hook_Productos SHALL conservar el cálculo de Producible existente para la carga inicial.

### Requisito 5: No-regresión

**Historia de Usuario:** Como dueño del negocio, quiero que la optimización no rompa el catálogo, las categorías ni el modo offline, para no perder funcionalidad.

#### Criterios de Aceptación

1. THE catálogo del POS SHALL seguir mostrando los productos con los mismos datos visibles.
2. THE Hook_Productos SHALL seguir proveyendo las categorías y demás datos a sus consumidores.
3. THE Sistema SHALL conservar el comportamiento offline (cache-first) del catálogo.
4. THE Sistema SHALL no requerir cambios de esquema ni migraciones.

### Requisito 6: Persistir la actualización puntual en la caché offline

**Historia de Usuario:** Como cajero que a veces queda sin conexión, quiero que la caché offline del catálogo refleje los cambios de stock/precio recibidos en vivo, para no arrancar offline con datos viejos.

#### Criterios de Aceptación

1. WHEN el Hook_Productos aplica una Actualizacion_Puntual por un cambio remoto, THE Hook_Productos SHALL persistir el catálogo actualizado en la caché de IndexedDB (`saveAdminProducts`), equivalente a lo que hacía el Refetch_Completo.
2. THE Sistema SHALL mantener la caché offline de productos consistente con el estado en memoria tras una Actualizacion_Puntual.
