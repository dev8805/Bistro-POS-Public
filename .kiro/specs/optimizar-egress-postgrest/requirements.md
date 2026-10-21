# Requirements Document

## Introduction

Esta funcionalidad **reduce el PostgREST Egress** (datos que salen de Supabase al leer vía la API REST) de BistroPOS. Supabase factura el egress por GB; el dashboard lo etiqueta como "Database Egress".

Tras revisar `pg_stat_statements`, se confirmó que el egress lo dominan dos familias de consultas, ambas con `SELECT *` + joins anidados completos, llamadas decenas de miles de veces:

1. **Órdenes**: `from('orders').select('*, items:order_items(*), waiter, client, refunds...')` con `.limit(100)`. Se dispara en **cada carga de la app** (porque `App.tsx` monta `useOrders()` solo para las mutaciones, pero `useSales` auto-trae 100 órdenes completas que **nadie renderiza** — la lista visible usa `useSalesHistory` paginado) y **tras cada venta/anulación** (refetch completo).
2. **Productos**: `from('products').select('*, category:categories(*), product_purchase_units(...)')`. Muy frecuente.

El objetivo de negocio es **reducir el egress de PostgREST eliminando lecturas innecesarias y acotando columnas, sin perder funcionalidad** (ventas, historial, catálogo, mesas).

## Glossary

- **Egress_PostgREST**: Datos transmitidos desde Supabase hacia el cliente al leer vía la API REST (`supabase.from().select()`).
- **Consulta_Ordenes**: La consulta de `useSales.fetchOrders` a `orders` con embeds (items, waiter, client, refunds).
- **Lista_Historial**: La lista de ventas que se muestra en `SalesScreen`, alimentada por `useSalesHistory` (paginada en BD).
- **Estado_Ordenes**: El array `orders` que devuelve `useSales`/`useOrders`.
- **Consulta_Productos**: La consulta de `useProducts.fetchProducts` (y la de `App.tsx`) a `products` con `category` y `product_purchase_units`.
- **Consulta_Orden_Mesa**: La consulta de `useSales.fetchTableOrder` que trae la orden de una mesa al abrirla.
- **Columnas_Explicitas**: Selección de solo las columnas que la UI consume, en vez de `*` o embeds con `(*)`.
- **Refetch_Total**: Volver a ejecutar la Consulta_Ordenes completa tras una mutación (crear/anular venta).

## Requirements

### Requisito 1: No traer órdenes que nadie usa a nivel de App

**Historia de Usuario:** Como dueño del negocio, quiero que la app no descargue 100 órdenes completas en cada carga si no se muestran, para reducir el egress.

#### Criterios de Aceptación

1. WHEN `App.tsx` monta los hooks de órdenes para usar solo mutaciones (`createOrder`, `confirmOrder`), THE Sistema SHALL no ejecutar la Consulta_Ordenes automáticamente.
2. WHERE ningún componente renderiza el Estado_Ordenes de `useSales`, THE Sistema SHALL evitar poblarlo con la Consulta_Ordenes.
3. THE Sistema SHALL conservar disponibles las mutaciones (`createOrder`, `confirmOrder`, `voidOrder`, `voidOrderItem`, `updateOrderItem`).

### Requisito 2: Eliminar el refetch total tras cada venta/anulación

**Historia de Usuario:** Como cajero, quiero que al completar o anular una venta no se vuelvan a descargar 100 órdenes completas, para no gastar egress innecesario.

#### Criterios de Aceptación

1. WHEN se crea una venta, THE Sistema SHALL no ejecutar un Refetch_Total de la Consulta_Ordenes.
2. WHEN el usuario está en `SalesScreen` y realiza una anulación o devolución, THE Sistema SHALL refrescar la Lista_Historial mediante `useSalesHistory` (paginado) y no mediante la Consulta_Ordenes completa.
3. THE Sistema SHALL mantener la consistencia visible de la lista de ventas tras la mutación.

### Requisito 3: Columnas explícitas en las consultas de órdenes

**Historia de Usuario:** Como dueño del negocio, quiero que las consultas de órdenes traigan solo los campos que se usan, para reducir el tamaño de cada respuesta.

#### Criterios de Aceptación

1. WHERE se necesite leer órdenes con sus ítems (Consulta_Ordenes o Consulta_Orden_Mesa), THE Sistema SHALL usar Columnas_Explicitas en `orders` y en `order_items` en vez de `*`.
2. THE Sistema SHALL incluir en la selección todos los campos que la UI consumidora utiliza, sin omitir ninguno requerido.
3. THE Sistema SHALL conservar los embeds necesarios (ítems, y los demás solo donde se usen) con sus columnas acotadas.

### Requisito 4: Columnas explícitas en la consulta de productos

**Historia de Usuario:** Como dueño del negocio, quiero que el catálogo traiga solo los campos necesarios de producto y categoría, para reducir el egress del catálogo.

#### Criterios de Aceptación

1. THE Consulta_Productos SHALL usar Columnas_Explicitas en `products` en vez de `*`.
2. THE Consulta_Productos SHALL traer del embed `category` solo los campos que la UI usa (no `categories(*)`).
3. THE Sistema SHALL conservar el cálculo de recetas/producible y el modo offline del catálogo.

### Requisito 5: Acotar otras lecturas frecuentes

**Historia de Usuario:** Como dueño del negocio, quiero acotar las lecturas frecuentes restantes, para reducir egress sin romper pantallas.

#### Criterios de Aceptación

1. THE Consulta_Orden_Mesa SHALL usar Columnas_Explicitas en `orders` y `order_items`.
2. WHERE una operación de `insert`/`update` no usa la fila devuelta, THE Sistema SHALL no encadenar `.select()` para devolverla.

### Requisito 6: No-regresión funcional

**Historia de Usuario:** Como dueño del negocio, quiero que la optimización no rompa ventas, historial, catálogo ni mesas, para no perder funcionalidad.

#### Criterios de Aceptación

1. THE Lista_Historial de ventas SHALL mostrar la misma información que antes.
2. THE flujo de venta en mesa (abrir mesa, ver orden, cobrar) SHALL funcionar igual.
3. THE catálogo del POS SHALL mostrar los productos con los mismos datos visibles (nombre, precio, stock, imagen, categoría, opciones).
4. THE Sistema SHALL no requerir cambios de esquema ni migraciones.
