# Implementation Plan

## Overview

Reducir PostgREST Egress en tres frentes: (1) eliminar el auto-fetch de 100 órdenes que nadie usa y el refetch total tras venta, (2) acotar columnas en las consultas calientes (órdenes y productos), (3) no devolver filas en escrituras que no las usan. Toca principalmente `hooks/useSales.ts`, `hooks/useProducts.ts` y `App.tsx`. Sin migraciones.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "3"] },
    { "wave": 2, "tasks": ["2", "4"] },
    { "wave": 3, "tasks": ["5"] }
  ]
}
```

```
1 (órdenes: no auto-fetch + sin refetch + columnas)
3 (productos: columnas)            → independientes entre sí
2 (mesa: columnas) depende de 1 (mismo archivo useSales)
4 (inserts sin retorno)            → independiente
5 (verificación) al final
```

## Tasks

- [ ] 1. Órdenes: eliminar lecturas innecesarias y acotar columnas
- [x] 1.1 Verificar consumidores del array `orders`
  - Confirmar que ningún componente renderiza `orders` de `useSales`/`useOrders` (App y SalesScreen solo usan mutaciones + `useSalesHistory`).
  - _Requirements: 1.2_
- [x] 1.2 Hacer lazy/opcional la carga inicial de `fetchOrders`
  - Que el `useEffect` que auto-ejecuta `fetchOrders()` en `useSales` no corra cuando solo se usan mutaciones (parámetro `autoLoad`/hook separado). `App.tsx` no debe dispararla.
  - _Requirements: 1.1, 1.3_
- [x] 1.3 Quitar el refetch total tras crear venta
  - Eliminar el `fetchOrders()` de segundo plano en `createOrder`.
  - _Requirements: 2.1_
- [x] 1.4 SalesScreen: refrescar con `useSalesHistory`, no con la consulta completa
  - En `onDone` de anulación/devolución, usar `reload()` (paginado) y no `fetchOrders()`.
  - _Requirements: 2.2, 2.3_
- [ ] 1.5 Columnas explícitas en la Consulta_Ordenes (si se conserva)
  - DIFERIDA: `fetchOrders` quedó sin llamadores (no se auto-ejecuta ni se refetch). Req 3 se satisface porque la consulta ya no corre. Acotar columnas se hará si vuelve a usarse.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 2. Mesa: columnas explícitas en `fetchTableOrder`
  - DIFERIDA: trae 1 sola orden por llamada (egress mínimo) y su objeto se propaga por el flujo de venta activo; trimear `orders(*)` aquí es alto riesgo / bajo valor. Se deja para una iteración con verificación dedicada.
  - _Requirements: 5.1_

- [x] 3. Productos: columnas explícitas
  - `App.tsx` catálogo: `products.*` → columnas explícitas (mapeo conocido). `useProducts`: `categories(*)` → campos usados (se conserva `products.*` porque las pantallas de admin usan el producto completo).
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 4. Escrituras sin devolver fila
  - DIFERIDA: se revisó y la mayoría de inserts/updates SÍ usan la fila devuelta (`newOrder.id`, `shift.id`, etc.). No hay un subconjunto claro sin riesgo para esta iteración.
  - _Requirements: 5.2_

- [ ] 5. Verificación y no-regresión
- [x] 5.1 Build
  - `npm run build` sin errores.
  - _Requirements: 6.4_
- [ ] 5.2 Pruebas funcionales
  - Historial de ventas se ve igual y pagina; anular/devolver se refleja.
  - Abrir mesa con orden → carrito completo; cobrar.
  - Catálogo con nombre/precio/stock/imagen/categoría/opciones correctos; recetas/producible OK; offline OK.
  - _Requirements: 6.1, 6.2, 6.3_
- [ ] 5.3 Medir egress
  - En Database → Query Performance, confirmar que las consultas `orders.*`/`products.*` con embeds bajan en frecuencia (las de App desaparecen) y payload. Comparar Database Egress antes/después.
  - _Requirements: 1.1, 2.1_

## Notes

- Riesgo principal: omitir una columna que la UI usa → se detecta en la prueba 5.2 y se agrega.
- Antes de quitar el auto-fetch (1.2), confirmar 1.1 para no romper un consumidor oculto del array `orders`.
- No hay migraciones ni cambios de esquema.
