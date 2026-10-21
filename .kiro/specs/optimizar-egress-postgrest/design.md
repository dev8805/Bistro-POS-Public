# Design Document

## Overview

Reduce el PostgREST Egress atacando lo que `pg_stat_statements` confirmó como los dos focos: las consultas de **órdenes** (`fetchOrders`) y **productos** (`fetchProducts`), ambas con `SELECT *` + embeds completos y llamadas muy frecuentes.

Tres palancas:
1. **Eliminar lecturas innecesarias** (la más grande): `App` no debe auto-traer 100 órdenes que nadie muestra, ni refrescarlas tras cada venta.
2. **Acotar columnas** (`SELECT *` → columnas explícitas).
3. **No devolver filas** en inserts/updates que no las usan.

Mapa de requisitos: Req 1 (no auto-fetch en App), Req 2 (sin refetch total), Req 3 (columnas en órdenes), Req 4 (columnas en productos), Req 5 (mesa + inserts), Req 6 (no-regresión).

## Architecture

### Hallazgo clave

`App.tsx` hace `const { confirmOrder, createOrder } = useOrders()` — **solo mutaciones**. Pero `useOrders` → `useSales` tiene un `useEffect` que auto-ejecuta `fetchOrders()` (100 órdenes completas) al montar, y el array `orders` resultante **no lo renderiza nadie** (`SalesScreen` muestra la lista con `useSalesHistory` paginado). Es egress 100% desperdiciado, en cada carga de la app y tras cada venta.

```
HOY:
  App monta useOrders (solo mutaciones)
     └─ useSales useEffect → fetchOrders() → 100 órdenes completas  ← NADIE las usa
  createOrder() → fetchOrders() (refetch total)                    ← desperdicio
  SalesScreen refund → fetchOrders() + reload()                    ← doble (la lista real es reload)

DESPUÉS:
  App monta useOrders (solo mutaciones) → SIN fetch automático
  createOrder() → sin refetch total (actualiza local / nada)
  SalesScreen → la lista viene de useSalesHistory (paginado); refund → reload()
```

## Components and Interfaces

### 1. `hooks/useSales.ts` — no auto-fetch + sin refetch total (Req 1, 2)

- Separar la carga de la lista de las mutaciones. Opciones:
  - **(A, recomendada)** Hacer el `fetchOrders` inicial **opcional/lazy**: el `useEffect` de carga solo corre si un consumidor lo pide (p. ej. un parámetro `autoLoad` o un hook aparte). `App` y `SalesScreen` no lo necesitan (no leen `orders`).
  - Quitar `fetchOrders()` del final de `createOrder` (Req 2.1).
- Conservar todas las mutaciones y `fetchTableOrder`/`addItemToOrder`.

### 2. `hooks/useSales.ts` — columnas explícitas en órdenes (Req 3)

Solo si se conserva alguna lectura de lista de órdenes. **Antes:**

```ts
.from('orders').select(`
  *,
  items:order_items(*, product:products(unit)),
  waiter:profiles!waiter_id(full_name),
  client:clients!client_id(id_number, phone),
  refunds:sale_refunds(id, total_amount, reason, created_at, refunded_by,
     items:sale_refund_items(product_name, quantity, amount, restocked))
`).limit(100)
```

**Después** (columnas explícitas; ítems solo con lo que usa la UI):

```ts
.from('orders').select(`
  id, order_number, display_number, status, order_type, payment_method,
  payment_status, subtotal, discount, total, created_at, table_id, client_id,
  customer_name, void_reason,
  items:order_items(id, product_id, product_name, quantity, unit_price,
     total_price, status, parent_order_item_id, notes, cooking_term,
     product:products(unit)),
  waiter:profiles!waiter_id(full_name),
  client:clients!client_id(id_number, phone),
  refunds:sale_refunds(id, total_amount, reason, created_at, refunded_by,
     items:sale_refund_items(product_name, quantity, amount, restocked))
`)
```

> Las columnas exactas se confirman contra los campos que consume cada UI en implementación (sin omitir ninguno usado).

### 3. `hooks/useProducts.ts` y `App.tsx` — columnas explícitas en productos (Req 4)

**Antes:**

```ts
.from('products').select(`
  *,
  category:categories(*),
  product_purchase_units(unit_name, conversion_factor)
`)
```

**Después** (producto con columnas usadas; categoría solo los campos consumidos):

```ts
.from('products').select(`
  id, business_id, category_id, name, description, type, price, cost, stock,
  min_stock, unit, image_url, barcode, is_active, is_for_sale, has_customization,
  customizable_options, nicknames, is_favorite, purchase_unit, conversion_factor,
  category:categories(id, name, color, icon, customizable_options,
     optimal_min, optimal_max, alert_days),
  product_purchase_units(unit_name, conversion_factor)
`)
```

### 4. `hooks/useSales.ts` — `fetchTableOrder` con columnas (Req 5.1)

Misma idea: acotar `orders`/`order_items` a las columnas que reconstruyen el carrito.

### 5. Inserts/updates sin devolver fila (Req 5.2)

Donde no se usa el retorno, quitar `.select().single()`.

**Antes:**
```ts
await supabase.from('cash_movements').insert(mov).select().single(); // retorno ignorado
```
**Después:**
```ts
await supabase.from('cash_movements').insert(mov); // sin devolver la fila
```

## Data Models

Sin cambios de esquema ni migraciones. Solo cambian las columnas pedidas en los `select` y la frecuencia de las consultas.

## Error Handling

| Situación | Comportamiento |
|-----------|----------------|
| Una columna usada por la UI se omitió por error | Se detecta en pruebas (Req 6) y se agrega; la UI mostraría el campo vacío hasta corregir |
| `SalesScreen` necesita refrescar tras anular | Usa `reload()` de `useSalesHistory` (ya existente), no la Consulta_Ordenes |
| Algún consumidor sí leía `orders` de `useSales` | Se verifica antes de quitar el auto-fetch; si existe, se le da un hook/flag para cargar bajo demanda |

## Testing Strategy

1. **No-regresión historial (Req 6.1):** abrir `SalesScreen` → la lista de ventas se ve igual y pagina; anular/devolver → se refleja.
2. **No-regresión mesas (Req 6.2):** abrir una mesa con orden → carrito completo; cobrar.
3. **No-regresión catálogo (Req 6.3):** productos con nombre/precio/stock/imagen/categoría/opciones correctos; recetas/producible OK; offline OK.
4. **Egress (objetivo):** en `Database → Query Performance`, confirmar que las consultas `orders.*`/`products.*` con embeds bajan su frecuencia (las de App desaparecen) y su payload (columnas acotadas). En Reports → Database Egress, comparar antes/después.
5. **Build:** `npm run build` sin errores.

## Correctness Properties

### Property 1: App no dispara la consulta de órdenes
Montar `App` (que usa solo mutaciones de órdenes) no produce ninguna ejecución de la Consulta_Ordenes.
**Validates: Requirements 1.1, 1.2**

### Property 2: Sin refetch total en mutaciones
Crear una venta no dispara la Consulta_Ordenes completa.
**Validates: Requirements 2.1**

### Property 3: Sin SELECT * en las consultas calientes
Las consultas de órdenes y productos no usan `*` ni embeds con `(*)`; usan Columnas_Explicitas.
**Validates: Requirements 3.1, 4.1, 4.2, 5.1**

### Property 4: Paridad de datos visibles
Tras la optimización, la información visible en historial de ventas, orden de mesa y catálogo es la misma que antes.
**Validates: Requirements 6.1, 6.2, 6.3**

### Property 5: Sin retorno innecesario en escrituras
Las operaciones de `insert`/`update` cuyo retorno no se usa no solicitan la fila de vuelta.
**Validates: Requirements 5.2**
